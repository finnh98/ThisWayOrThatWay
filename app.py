import time
from copy import deepcopy
import streamlit as st
import folium
from streamlit_folium import st_folium
from streamlit_geolocation import streamlit_geolocation

st.set_page_config(page_title="ThisWayOrThatWay", page_icon="📍", layout="wide")
st.title("📍 ThisWayOrThatWay " )

# ---------- Defaults (APPROXIMATE: replace with exact coordinates) ----------
DEFAULT_START = (53.3146, -6.2740)   # Bijou, Rathgar Cross
DEFAULT_END = (53.3215, -6.2681)     # 32 Palmerston Road, Rathmines


# ---------- Helpers ----------
def build_route(waypoints, steps_per_leg):
    """Linearly interpolate points between consecutive waypoints."""
    route = []
    for (lat1, lon1), (lat2, lon2) in zip(waypoints, waypoints[1:]):
        for i in range(steps_per_leg):
            t = i / steps_per_leg
            route.append((lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t))
    route.append(waypoints[-1])
    return route


def parse_waypoints(text):
    """Parse lines like '53.3170, -6.2710' into a list of (lat, lon)."""
    points = []
    for line in text.strip().splitlines():
        if not line.strip():
            continue
        lat, lon = [float(x) for x in line.split(",")]
        points.append((lat, lon))
    return points


# ---------- Session state ----------
if "trail" not in st.session_state:
    st.session_state.trail = []
if "sim_index" not in st.session_state:
    st.session_state.sim_index = 0
if "playing" not in st.session_state:
    st.session_state.playing = False

# ---------- Sidebar ----------
with st.sidebar:
    st.header("Settings")
    mode = st.radio("Mode", ["Live GPS", "Simulation"])

    tiles = st.selectbox("Map style", ["OpenStreetMap", "CartoDB positron", "CartoDB dark_matter"])
    zoom = st.slider("Zoom", 3, 19, 16)
    show_accuracy = st.checkbox("Show accuracy circle", True)
    show_trail = st.checkbox("Show trail", True)
    if st.button("Clear trail"):
        st.session_state.trail = []

    route = []
    if mode == "Simulation":
        st.divider()
        st.subheader("Simulation")

        st.caption("Start: Bijou, Rathgar Cross")
        s_lat = st.number_input("Start lat", value=DEFAULT_START[0], format="%.6f")
        s_lon = st.number_input("Start lon", value=DEFAULT_START[1], format="%.6f")

        st.caption("End: 32 Palmerston Road, Rathmines")
        e_lat = st.number_input("End lat", value=DEFAULT_END[0], format="%.6f")
        e_lon = st.number_input("End lon", value=DEFAULT_END[1], format="%.6f")

        extra = st.text_area(
            "Optional waypoints (one 'lat, lon' per line)",
            placeholder="53.3170, -6.2710\n53.3190, -6.2695",
            help="Add points along the real streets so the path doesn't cut through buildings.",
        )
        steps_per_leg = st.slider("Points per leg", 5, 100, 30)
        delay = st.slider("Seconds per step", 0.2, 3.0, 0.8, 0.1)

        try:
            waypoints = [(s_lat, s_lon)] + parse_waypoints(extra) + [(e_lat, e_lon)]
            route = build_route(waypoints, steps_per_leg)
        except ValueError:
            st.error("Waypoints must be formatted as: lat, lon (one per line).")

        # Route edits reset playback before the controls are processed.
        route_signature = tuple(route)
        if st.session_state.get("route_signature") != route_signature:
            st.session_state.route_signature = route_signature
            st.session_state.sim_index = 0
            st.session_state.progress_slider = 0
            st.session_state.trail = []
            st.session_state.playing = False

        c1, c2, c3 = st.columns(3)
        if c1.button("▶ Play", disabled=not route):
            if st.session_state.sim_index >= len(route) - 1:
                st.session_state.sim_index = 0
                st.session_state.trail = []
            st.session_state.progress_slider = st.session_state.sim_index
            st.session_state.last_tick = time.monotonic()
            st.session_state.playing = True
        if c2.button("⏸ Pause"):
            st.session_state.playing = False
        if c3.button("↺ Reset"):
            st.session_state.playing = False
            st.session_state.sim_index = 0
            st.session_state.trail = []

# Keep GPS and simulated trails separate when switching mode.
if st.session_state.get("previous_mode") != mode:
    st.session_state.trail = []
    st.session_state.playing = False
    st.session_state.previous_mode = mode
    st.session_state.pop("base_map_signature", None)

# ---------- Get position ----------
lat = lon = accuracy = speed = None

if mode == "Live GPS":
    st.session_state.playing = False
    st.write("Press the button, then allow location access in your browser. Press again to refresh.")
    loc = streamlit_geolocation() or {}
    lat, lon = loc.get("latitude"), loc.get("longitude")
    accuracy, speed = loc.get("accuracy"), loc.get("speed")

    if lat is None or lon is None:
        st.info("No location yet. Click the button above and allow location permission. "
                "If nothing happens, check your browser's site permissions.")
        st.stop()
else:
    if not route:
        st.warning("Fix the waypoints in the sidebar to start the simulation.")
        st.stop()

# Build the base map only when its configuration changes. Moving objects are
# sent separately so the browser keeps the same Leaflet map and viewport.
base_signature = (mode, tiles, tuple(route))
if st.session_state.get("base_map_signature") != base_signature:
    center = route[0] if mode == "Simulation" else (lat, lon)
    m = folium.Map(location=center, zoom_start=zoom, tiles=tiles)
    if mode == "Simulation":
        folium.PolyLine(route, color="gray", weight=3, opacity=0.6,
                        dash_array="6").add_to(m)
        folium.Marker(route[0], tooltip="Start",
                      icon=folium.Icon(color="green", icon="play", prefix="fa")).add_to(m)
        folium.Marker(route[-1], tooltip="End",
                      icon=folium.Icon(color="blue", icon="flag", prefix="fa")).add_to(m)
    st.session_state.base_map = m
    st.session_state.base_map_signature = base_signature


def seek_route():
    st.session_state.sim_index = st.session_state.progress_slider
    st.session_state.trail = []
    st.session_state.last_tick = time.monotonic()


# Sidebar actions cause a normal rerun; playback ticks rerun only this fragment.
# Paused simulations keep a lightweight timer but never advance their position.
@st.fragment(run_every=delay if mode == "Simulation" else None)
def render_position():
    current_lat, current_lon = lat, lon
    current_accuracy, current_speed = accuracy, speed
    if mode == "Simulation":
        now = time.monotonic()
        if st.session_state.playing and now - st.session_state.get("last_tick", now) >= delay:
            st.session_state.sim_index = min(st.session_state.sim_index + 1, len(route) - 1)
            st.session_state.last_tick = now
        idx = min(st.session_state.sim_index, len(route) - 1)
        # Set the widget state before instantiation, so timer and slider agree.
        st.session_state.progress_slider = idx
        st.slider("Route progress", 0, len(route) - 1,
                  key="progress_slider", on_change=seek_route)
        current_lat, current_lon = route[idx]
        current_accuracy, current_speed = 10, 1.4
        st.caption(f"🧪 Simulation: step {idx + 1} of {len(route)}")
        if idx == len(route) - 1:
            st.session_state.playing = False
            st.success("Arrived at destination 🎉")

    point = (current_lat, current_lon)
    if not st.session_state.trail or st.session_state.trail[-1] != point:
        st.session_state.trail.append(point)

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Latitude", f"{current_lat:.6f}")
    c2.metric("Longitude", f"{current_lon:.6f}")
    c3.metric("Accuracy", f"{current_accuracy:.0f} m" if current_accuracy is not None else "n/a")
    c4.metric("Speed", f"{current_speed * 3.6:.1f} km/h" if current_speed is not None else "n/a")

    moving = folium.FeatureGroup(name="Current position and trail")
    folium.Marker(point, tooltip="You are here",
                  popup=f"{current_lat:.6f}, {current_lon:.6f}",
                  icon=folium.Icon(color="red", icon="user", prefix="fa")).add_to(moving)
    if show_accuracy and current_accuracy is not None:
        folium.Circle(point, radius=current_accuracy, color="#3388ff",
                      fill=True, fill_opacity=0.15).add_to(moving)
    if show_trail and len(st.session_state.trail) > 1:
        folium.PolyLine(st.session_state.trail, color="blue", weight=4,
                        opacity=0.8).add_to(moving)

    # streamlit-folium attaches the feature group to its Python map.
    # Copy it so the stored base never accumulates moving layers.
    st_folium(deepcopy(st.session_state.base_map), key="main_map", zoom=zoom,
              feature_group_to_add=moving, height=550,
              use_container_width=True, returned_objects=[])
    st.caption(f"Trail points recorded: {len(st.session_state.trail)}")


render_position()
