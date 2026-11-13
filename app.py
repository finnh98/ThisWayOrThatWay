"""Streamlit shell; the persistent browser component owns GPS and journey state."""
from pathlib import Path
import streamlit as st
from streamlit.components.v1 import declare_component

st.set_page_config(page_title="ThisWayOrThatWay", page_icon="📍", layout="wide")
st.title("📍 ThisWayOrThatWay")
st.caption("Start a journey, put your phone somewhere safe, and keep this page visible.")
tracker = declare_component("walking_tracker", path=str(Path(__file__).parent / "tracker"))
tracker(key="walking_tracker")
st.caption("Journeys stay in this tab only. Reloading or closing the page clears the journey. "
           "Map tiles require an internet connection.")
