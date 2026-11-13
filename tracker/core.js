/* Pure journey state: metres, epoch-ms fixes and monotonic-ms timer. */
(function (root) {
  const distance = (a, b) => {
    const rad = x => x * Math.PI / 180;
    const dlat = rad(b.lat-a.lat), dlon = rad(b.lon-a.lon);
    const h = Math.sin(dlat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2;
    return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1,h)));
  };
  const formatTime = ms => {
    const seconds = Math.max(0, Math.floor(ms/1000));
    return [Math.floor(seconds/3600), Math.floor(seconds/60)%60, seconds%60]
      .map(n => String(n).padStart(2,'0')).join(':');
  };
  class Journey {
    constructor() { this.state='idle'; this.points=[]; this.metres=0; this.accumulated=0; this.since=null; this.anchor=null; this.lastTimestamp=-Infinity; this.segment=0; this.lastGoodTime=null; }
    start(now) { this.state='active'; this.points=[]; this.metres=0; this.accumulated=0; this.since=now; this.anchor=null; this.lastTimestamp=-Infinity; this.segment=0; this.lastGoodTime=null; }
    elapsed(now) { return this.accumulated + (this.state==='active' ? Math.max(0,now-this.since):0); }
    pause(now) { if(this.state!=='active') return; this.accumulated=this.elapsed(now); this.since=null; this.state='paused'; this.anchor=null; this.lastGoodTime=null; this.segment++; }
    resume(now) { if(this.state!=='paused') return; this.state='active'; this.since=now; }
    end(now) { if(!['active','paused'].includes(this.state)) return; this.accumulated=this.elapsed(now); this.since=null; this.state='ended'; this.anchor=null; }
    accept(p, {threshold=10, maxAccuracy=30, simulation=false, now=Date.now()}={}) {
      if(this.state!=='active') return {accepted:false, reason:'Not recording'};
      if(!['lat','lon','accuracy','timestamp'].every(k=>Number.isFinite(p[k])) || Math.abs(p.lat)>90 || Math.abs(p.lon)>180 || p.accuracy<0) return {accepted:false,reason:'Invalid GPS reading'};
      if(p.timestamp<=this.lastTimestamp || now-p.timestamp>15000 || p.timestamp>now+5000) return {accepted:false,reason:'Waiting for a fresh GPS reading'};
      this.lastTimestamp=p.timestamp;
      if(p.accuracy>maxAccuracy) return {accepted:false,reason:`Waiting for better GPS (±${Math.round(p.accuracy)} m)`};
      const gap=this.lastGoodTime!==null && p.timestamp-this.lastGoodTime>30000;
      this.lastGoodTime=p.timestamp;
      let metres=0;
      if(this.anchor) {
        const seconds=(p.timestamp-this.anchor.timestamp)/1000;
        if(gap) { this.anchor=null; this.lastGoodTime=null; this.segment++; }
        else {
          metres=distance(this.anchor,p);
          const minimum=Math.max(threshold, Math.hypot(this.anchor.accuracy,p.accuracy));
          if(metres<minimum) return {accepted:false,reason:'Active · movement below recording threshold', usable:true};
          if(!simulation && metres/seconds>4.5) return {accepted:false,reason:'GPS jump ignored'};
        }
      }
      if(!this.anchor) metres=0;
      this.metres+=metres;
      this.anchor={...p};
      this.points.push({...p,segment:this.segment});
      return {accepted:true,reason:'Active · recording',usable:true};
    }
  }
  const api={Journey,distance,formatTime};
  if(typeof module!=='undefined') module.exports=api;
  else root.JourneyCore=api;
})(globalThis);
