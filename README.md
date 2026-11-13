# ThisWayOrThatWay

Walk tracking in Streamlit with a persistent browser GPS/Leaflet component.

## Run

```sh
python -m pip install -r requirements.txt
streamlit run app.py
```

Allow location access on an HTTPS deployment (localhost also works). Press **Start New Journey** once: `watchPosition` automatically supplies new fixes. Pause/Resume stops/restarts GPS recording and the active timer. End retains the route and totals until a new journey or reload. Starting a replacement journey asks before clearing recorded points.

## Recording and distance

- Default minimum movement: 10 metres, configurable from 3–100 m.
- Default maximum reported GPS uncertainty: 30 m, configurable from 5–100 m.
- Recording requires displacement at least the larger of the selected threshold and the combined uncertainty of both fixes. Poor, stale, duplicate and invalid fixes are rejected. Live walking jumps over 4.5 m/s are rejected.
- Distance sums accepted GPS segments; it is an estimate, not a street-routing distance. Filtering reduces GPS drift but cannot guarantee zero drift while stationary.
- Pause/resume and GPS gaps over 30 seconds start separate segments. Unobserved movement is not joined or counted.
- Active time starts on Start, includes time waiting for GPS, excludes pauses, and freezes on End.

## Simulation

Select Simulation, adjust start/end coordinates and optional waypoints, points per leg and seconds per step. Start New Journey plays the interpolated route. Pause/Resume and End use the same journey state as GPS. Seek while paused to test another route position; seeking starts a separate segment. The simulation ends automatically at its destination. Start New Journey resets it. Map style, zoom, accuracy circle, trail visibility and Centre on me remain available.

## Phone and browser limitations

Keep the tab visible and screen unlocked. This app automatically pauses on a page visibility change; press Resume after returning. Browsers/operating systems can suspend GPS or JavaScript with the screen locked, in another tab, or under power-saving restrictions. Background/locked-screen tracking is not guaranteed, and missed locations cannot be recovered. Use a native mobile app for reliable background tracking.

Location permission is required and can also be blocked by a hosting iframe's Permissions Policy. A denied request pauses recording and shows recovery instructions. Temporary signal loss keeps the GPS watcher listening. The first usable fix centres the map; subsequent fixes update layers without changing the user's viewport.

Journey state stays in this component's memory only, not in a database or on the Python server. Reloading/closing the tab loses it. Map assets and tiles use Leaflet's CDN, OpenStreetMap or CARTO and need network access. These providers receive map requests; the app does not upload the journey trail to Python.

## Checks

```sh
node --test tests/journey.test.cjs tests/controls.test.cjs
```

The 15 unit and control-integration tests (using fake browser/GPS/Leaflet APIs) cover timer accounting, movement/accuracy filtering, stationary jitter, pause/resume segment boundaries, end/reset, invalid/stale fixes, jumps and simulation. Browser checks should additionally exercise GPS permission denied/allowed, automatic callbacks, map viewport retention and narrow mobile layouts. A real outdoor phone test is still needed to assess GPS quality on each device.
