// Integration tests for actual UI event handlers with a fake DOM/GPS/Leaflet.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(){
 const elements=new Map();
 const defaults={mode:'Live GPS',threshold:'10',maxAccuracy:'30',tiles:'OpenStreetMap',zoom:'16',slat:'53.3146',slon:'-6.274',elat:'53.3215',elon:'-6.2681',steps:'30',delay:'.8',waypoints:'',progress:'0'};
 const get=id=>{if(!elements.has(id))elements.set(id,{value:defaults[id]??'',checked:true,disabled:false,textContent:'',checkValidity:()=>true});return elements.get(id);};
 let now=100000,seq=0,current=null,created=0;
 const watches=new Map(),timeouts=new Map(),events={};
 const layer=()=>({addTo(){return this},remove(){return this},clearLayers(){return this},bindTooltip(){return this},setLatLng(p){this.point=p;return this},setRadius(){return this}});
 const fakeMap={center:null,zoom:16,setView(p,z){this.center=p;this.zoom=z;return this},setZoom(z){this.zoom=z;return this},getZoom(){return this.zoom},on(){},removeLayer(){}};
 const context={console,JourneyCore:require('../tracker/core.js'),Map,Number,String,Math,Date:{now:()=>now},performance:{now:()=>now},confirm:()=>true,
 document:{getElementById:get,documentElement:{scrollHeight:1000},body:{},hidden:false,addEventListener:(k,v)=>events[k]=v},
 window:{isSecureContext:true,parent:{postMessage(){}},addEventListener(){}},ResizeObserver:class{observe(){}},
 navigator:{geolocation:{watchPosition(ok,err){const id=++seq;watches.set(id,{ok,err});current=id;return id},clearWatch(id){watches.delete(id)}}},
 setInterval(){},setTimeout(fn){const id=++seq;timeouts.set(id,fn);return id},clearTimeout(id){timeouts.delete(id)},
 L:{map(){created++;return fakeMap},layerGroup:layer,tileLayer:layer,circleMarker:layer,circle:layer,polyline:layer}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('tracker/core.js','utf8'),context);vm.runInContext(fs.readFileSync('tracker/tracker.js','utf8'),context);
 return {get,context,fakeMap,watches,timeouts,events,advance:n=>now+=n,created:()=>created,run:s=>vm.runInContext(s,context),gps:(offset=0,accuracy=3)=>watches.get(current).ok({coords:{latitude:53.3146+offset/111195,longitude:-6.274,accuracy},timestamp:now}),error:code=>watches.get(current).err({code})};
}
test('automatic GPS callbacks, pause/resume/end and stable map',()=>{
 const s=setup();s.get('start').onclick();assert.equal(s.watches.size,1);s.gps();assert.equal(s.get('points').textContent,1);
 s.fakeMap.setView([53,-6],14);s.advance(10000);s.gps(15);assert.equal(s.get('points').textContent,2);assert.equal(s.created(),1);assert.equal(s.fakeMap.zoom,14);assert.deepEqual(s.fakeMap.center,[53,-6]);
 const old=[...s.watches.values()][0];s.get('pause').onclick();assert.equal(s.watches.size,0);const time=s.get('time').textContent;
 s.advance(20000);s.run('render()');assert.equal(s.get('time').textContent,time);
 old.ok({coords:{latitude:54,longitude:-6,accuracy:3},timestamp:130000});assert.equal(s.get('points').textContent,2);
 const metres=s.run('journey.metres');s.get('pause').onclick();s.gps(300);assert.equal(s.run('journey.metres'),metres);
 s.get('end').onclick();assert.equal(s.watches.size,0);assert.equal(s.run('journey.state'),'ended');assert.equal(s.get('points').textContent,3);
 s.get('start').onclick();assert.equal(s.get('points').textContent,0);assert.equal(s.get('time').textContent,'00:00:00');
});
test('permission denial pauses and Resume retries without starting over',()=>{
 const s=setup();s.get('start').onclick();s.error(1);assert.match(s.get('error').textContent,/permission denied/);assert.equal(s.run('journey.state'),'paused');assert.equal(s.watches.size,0);s.get('pause').onclick();assert.equal(s.watches.size,1);s.gps();assert.equal(s.get('points').textContent,1);
});
test('temporary GPS error keeps listening; hidden page pauses',()=>{
 const s=setup();s.get('start').onclick();s.error(3);assert.equal(s.watches.size,1);assert.match(s.get('status').textContent,/timed out/);s.gps();s.context.document.hidden=true;s.events.visibilitychange();assert.equal(s.watches.size,0);assert.equal(s.run('journey.state'),'paused');
});
test('simulation uses the same journey controls and completes',()=>{
 const s=setup();s.get('mode').value='Simulation';s.get('mode').onchange();s.get('start').onclick();assert.equal(s.watches.size,0);assert.equal(s.get('points').textContent,1);
 for(let i=0;i<30;i++){const [id,fn]=[...s.timeouts][0];s.timeouts.delete(id);s.advance(800);fn();}
 assert.equal(s.run('journey.state'),'ended');assert.equal(s.get('points').textContent,31);assert.match(s.get('status').textContent,/simulation complete/);
});
test('simulation rejects malformed waypoints without clearing a journey',()=>{const s=setup();s.get('mode').value='Simulation';s.get('waypoints').value='wrong';s.get('start').onclick();assert.match(s.get('error').textContent,/waypoint/);assert.equal(s.run('journey.state'),'idle');});
