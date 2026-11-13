/* Stable browser component: GPS callbacks update Leaflet layers in place. */
const $ = id => document.getElementById(id);
const {Journey, formatTime} = JourneyCore;
const journey = new Journey();
let map, tile, marker, circle, trailLayer, planned, flags, watchId=null;
let generation=0, simTimer=null, route=[], simIndex=0, latest=null, centred=false;
let message='Ready · start a new journey', lastFixAt=0;
function send(type, data={}) { window.parent.postMessage({isStreamlitMessage:true,type,...data},'*'); }
function resize() { send('streamlit:setFrameHeight',{height:document.documentElement.scrollHeight}); }
window.addEventListener('message',event=>{
  if(event.source!==window.parent || event.data?.type!=='streamlit:render') return;
  resize();
});
send('streamlit:componentReady',{apiVersion:1});
new ResizeObserver(resize).observe(document.body);
if(typeof L==='undefined') {
  $('error').textContent='The map library could not load. Check your internet connection and reload.';
  $('start').disabled=true;
} else {
  map=L.map('map').setView([53.3146,-6.2740],16);
  trailLayer=L.layerGroup().addTo(map); planned=L.layerGroup().addTo(map); flags=L.layerGroup().addTo(map);
  setTiles();
  map.on('zoomend',()=>{$('zoom').value=map.getZoom();});
}
function setTiles() {
  if(!map) return;
  if(tile) map.removeLayer(tile);
  const name=$('tiles').value;
  const url=name==='OpenStreetMap'?'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png':`https://{s}.basemaps.cartocdn.com/${name==='Light'?'light_all':'dark_all'}/{z}/{x}/{y}.png`;
  tile=L.tileLayer(url,{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'+(name==='OpenStreetMap'?'':' · © CARTO')}).addTo(map);
}
function render() {
  $('time').textContent=formatTime(journey.elapsed(performance.now()));
  $('distance').textContent=(journey.metres/1000).toFixed(2)+' km';
  $('points').textContent=journey.points.length;
  $('status').textContent=message;
  const active=journey.state==='active', paused=journey.state==='paused';
  $('pause').disabled=!(active||paused); $('pause').textContent=paused?'Resume':'Pause';
  $('end').disabled=!(active||paused);
  $('mode').disabled=active||paused;
  for(const id of ['slat','slon','elat','elon','steps','delay','waypoints']) $(id).disabled=active||paused;
  $('progress').disabled=!paused;
  $('progress').value=simIndex;
  $('step').textContent=route.length?`Step ${simIndex+1} of ${route.length}`:'';
}
function drawTrail() {
  if(!map) return;
  trailLayer.clearLayers();
  if(!$('trail').checked) return;
  const segments=new Map();
  for(const p of journey.points) {
    if(!segments.has(p.segment)) segments.set(p.segment,[]);
    segments.get(p.segment).push([p.lat,p.lon]);
  }
  for(const points of segments.values()) L.polyline(points,{color:'#1674cb',weight:4}).addTo(trailLayer);
}
function drawPosition(p) {
  latest=p;
  if(!map) return;
  const ll=[p.lat,p.lon];
  if(!marker) marker=L.circleMarker(ll,{radius:8,color:'#fff',weight:3,fillColor:'#d64838',fillOpacity:1}).addTo(map).bindTooltip('You are here');
  else marker.setLatLng(ll);
  if(!circle) circle=L.circle(ll,{radius:p.accuracy,color:'#3388ff',weight:1,fillOpacity:.12});
  circle.setLatLng(ll).setRadius(p.accuracy);
  if($('accuracy').checked) circle.addTo(map); else circle.remove();
  if(!centred) { map.setView(ll,map.getZoom()); centred=true; }
  $('fix').textContent=`${p.lat.toFixed(6)}, ${p.lon.toFixed(6)} · GPS uncertainty ±${Math.round(p.accuracy)} m`;
}
function stopSource() {
  generation++;
  if(watchId!==null) navigator.geolocation.clearWatch(watchId);
  watchId=null;
  clearTimeout(simTimer); simTimer=null;
}
function record(p) {
  const result=journey.accept(p,{threshold:Number($('threshold').value),maxAccuracy:Number($('maxAccuracy').value),simulation:$('mode').value==='Simulation'});
  message=result.reason;
  if(result.usable) { lastFixAt=Date.now(); drawPosition(p); }
  if(result.accepted) drawTrail();
  render();
}
function startSource() {
  stopSource();
  const token=generation;
  if($('mode').value==='Simulation') {
    const tick=()=>{
      if(token!==generation || journey.state!=='active') return;
      const [lat,lon]=route[simIndex];
      record({lat,lon,accuracy:3,timestamp:Date.now()});
      if(simIndex===route.length-1) { endJourney('Ended · simulation complete'); return; }
      simTimer=setTimeout(()=>{simIndex++;tick();},Number($('delay').value)*1000);
    };
    tick(); return;
  }
  if(!window.isSecureContext || !navigator.geolocation) { failGPS('GPS needs HTTPS (or localhost) and a browser with location support.'); return; }
  message='Waiting for GPS · allow location access when prompted';render();
  watchId=navigator.geolocation.watchPosition(position=>{
    if(token!==generation || journey.state!=='active') return;
    const c=position.coords;
    record({lat:c.latitude,lon:c.longitude,accuracy:c.accuracy,timestamp:position.timestamp});
  },error=>{
    if(token!==generation || journey.state!=='active') return;
    if(error.code===1) failGPS('Location permission denied. Allow location in your browser’s site settings, then press Resume.');
    else { message=error.code===3?'Waiting for GPS · location timed out; still listening':'Waiting for GPS · signal unavailable; still listening';render(); }
  },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
}
function failGPS(text) { stopSource();journey.pause(performance.now());message='Paused · GPS unavailable';$('error').textContent=text;render(); }
function endJourney(text='Ended · journey complete') { stopSource();journey.end(performance.now());message=text;render(); }
function buildRoute() {
  const inputs=['slat','slon','elat','elon','steps','delay','threshold','maxAccuracy'];
  if(inputs.some(id=>!$(id).checkValidity() || $(id).value==='')) throw Error('Check the numeric settings and their allowed ranges.');
  const parse=(lat,lon)=>{if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180) throw Error('Coordinates must be valid latitude and longitude.');return [lat,lon];};
  const waypoints=[parse(Number($('slat').value),Number($('slon').value))];
  for(const line of $('waypoints').value.split('\n').filter(x=>x.trim())) {
    const pair=line.split(',');
    if(pair.length!==2 || pair.some(x=>!x.trim())) throw Error('Use one latitude, longitude pair per waypoint line.');
    waypoints.push(parse(...pair.map(Number)));
  }
  waypoints.push(parse(Number($('elat').value),Number($('elon').value)));
  const result=[], steps=Number($('steps').value);
  for(let leg=0;leg<waypoints.length-1;leg++) for(let i=0;i<steps;i++) result.push(waypoints[leg].map((x,j)=>x+(waypoints[leg+1][j]-x)*i/steps));
  result.push(waypoints.at(-1));return result;
}
$('start').onclick=()=>{
  let next=[];
  try {
    for(const id of ['threshold','maxAccuracy']) if(!$(id).checkValidity()||$(id).value==='') throw Error('Check the GPS distance and accuracy settings.');
    if($('mode').value==='Simulation') next=buildRoute();
  } catch(error) {$('error').textContent=error.message;return;}
  if(journey.points.length && !confirm('Start a new journey and clear the current route?')) return;
  stopSource(); journey.start(performance.now()); route=next;simIndex=0;lastFixAt=0;
  latest=null;centred=false;$('error').textContent='';$('fix').textContent='Waiting for location…';
  if(marker) marker.remove();if(circle) circle.remove();marker=null;circle=null;
  trailLayer.clearLayers();planned.clearLayers();flags.clearLayers();
  if(route.length) {
    $('progress').max=route.length-1;
    L.polyline(route,{color:'#777',dashArray:'6',weight:3}).addTo(planned);
    L.circleMarker(route[0],{color:'green',radius:6}).addTo(flags).bindTooltip('Start');
    L.circleMarker(route.at(-1),{color:'blue',radius:6}).addTo(flags).bindTooltip('End');
  }
  startSource();render();
};
$('pause').onclick=()=>{
  $('error').textContent='';
  if(journey.state==='active') {stopSource();journey.pause(performance.now());message='Paused · recording and timer stopped';render();}
  else if(journey.state==='paused') {journey.resume(performance.now());lastFixAt=0;startSource();render();}
};
$('end').onclick=()=>endJourney();
$('mode').onchange=()=>{$('sim').hidden=$('mode').value!=='Simulation';resize();};
$('tiles').onchange=setTiles;
$('zoom').oninput=()=>map?.setZoom(Number($('zoom').value));
$('trail').onchange=drawTrail;
$('accuracy').onchange=()=>{if(latest)drawPosition(latest);};
$('recenter').onclick=()=>{if(latest)map.setView([latest.lat,latest.lon],map.getZoom());};
$('progress').oninput=()=>{if(journey.state!=='paused')return;simIndex=Number($('progress').value);journey.anchor=null;journey.segment++;const [lat,lon]=route[simIndex];drawPosition({lat,lon,accuracy:3});render();};
for(const id of ['threshold','maxAccuracy']) $(id).onchange=()=>{if(!$(id).checkValidity()||$(id).value==='')$(id).value=id==='threshold'?10:30;};
document.addEventListener('visibilitychange',()=>{
  if(document.hidden && journey.state==='active') {stopSource();journey.pause(performance.now());message='Paused · page hidden. Press Resume when ready.';render();}
});
window.addEventListener('pagehide',stopSource);
setInterval(()=>{
  if(journey.state==='active' && $('mode').value==='Live GPS' && lastFixAt && Date.now()-lastFixAt>15000) message='Waiting for GPS · no recent usable reading';
  render();
},250);
render();resize();
