import {distanceMeters} from './pedestrianRouting.js';

// Coalesce GPS fixes while a calculation is running. Timers cannot outlive Exit.
export function createRouteUpdates(calculate, {signal, now=Date.now, schedule=setTimeout, cancel=clearTimeout, interval=5000, minMovement=5}={}) {
  let pending=null, last=null, lastAt=-Infinity, timer=null, running=false, generation=0, disposed=false;
  const pump=()=>{
    if(disposed||signal?.aborted||running||!pending) return;
    const delay=Math.max(0,interval-(now()-lastAt));
    if(delay) {if(timer===null) timer=schedule(()=>{timer=null;pump();},delay);return;}
    const job=pending;pending=null;
    if(!job.force&&last&&distanceMeters(last,job.coords)<minMovement) return;
    last=job.coords;lastAt=now();running=true;
    const version=generation;
    Promise.resolve().then(()=>{if(!disposed&&version===generation)return calculate(job.coords,()=>!disposed&&!signal?.aborted&&version===generation,job.context);})
      .catch(()=>{}) // The caller reports route errors; do not leave a timer rejection.
      .finally(()=>{running=false;pump();});
  };
  const reset=()=>{generation++;pending=null;last=null;if(timer!==null)cancel(timer);timer=null;};
  const dispose=()=>{disposed=true;reset();signal?.removeEventListener('abort',dispose);};
  if(signal?.aborted) disposed=true; else signal?.addEventListener('abort',dispose,{once:true});
  return { push(coords,force=false,context=null){if(disposed)return;pending={coords,force,context};pump();}, reset, dispose };
}
