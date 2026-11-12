import streamlit as st
import folium
from streamlit_folium import st_folium
from streamlit_geolocation import streamlit_geolocation

st.set_page_config(page_title="MyMaps", page_icon="📍", layout="wide")
st.title("📍 MyMaps: where am I?")

# ---------- Sidebar ----------
with st.sidebar:
    st.header("Settings")
    tiles = st.selectbox("Map style", ["OpenStreetMap", "CartoDB positron", "CartoDB dark_matter"])
    zoom = st.slider("Zoom", 3, 19, 16)
    show_accuracy = st.checkbox("Show accuracy circle", True)
    show_trail = st.checkbox("Show trail", True)
    if st.button("Clear trail"):
        st.session_state.trail = []

if "trail" not in st.session_state:
    st.session_state.trail = []

# ---------- Get device location (browser GPS) ----------
st.write("Press the button, then allow location access in your browser. Press again to refresh your position.")
loc = streamlit_geolocation()

lat = loc.get("latitude")
lon = loc.get("longitude")

if lat is None or lon is None:
    st.info("No location yet. Click the button above and allow location permission. "
            "If nothing happens, check your browser's site permissions.")
    st.stop()

accuracy = loc.get("accuracy")

# ---------- Update trail ----------
point = (lat, lon)
if not st.session_state.trail or st.session_state.trail[-1] != point:
    st.session_state.trail.append(point)

# ---------- Stats ----------
c1, c2, c3, c4 = st.columns(4)
c1.metric("Latitude", f"{lat:.6f}")
c2.metric("Longitude", f"{lon:.6f}")
c3.metric("Accuracy", f"{accuracy:.0f} m" if accuracy else "n/a")
speed = loc.get("speed")
c4.metric("Speed", f"{speed * 3.6:.1f} km/h" if speed else "n/a")

# ---------- Map ----------
m = folium.Map(location=[lat, lon], zoom_start=zoom, tiles=tiles)

folium.Marker(
    [lat, lon],
    tooltip="You are here",
    popup=f"{lat:.6f}, {lon:.6f}",
    icon=folium.Icon(color="red", icon="user", prefix="fa"),
).add_to(m)

if show_accuracy and accuracy:
    folium.Circle([lat, lon], radius=accuracy, color="#3388ff",
                  fill=True, fill_opacity=0.15).add_to(m)

if show_trail and len(st.session_state.trail) > 1:
    folium.PolyLine(st.session_state.trail, color="blue", weight=4, opacity=0.7).add_to(m)

st_folium(m, height=550, use_container_width=True, returned_objects=[])

st.caption(f"Trail points recorded: {len(st.session_state.trail)}")