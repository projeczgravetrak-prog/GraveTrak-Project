import { distanceMeters, validPoint } from './pedestrianRouting.js';

export const WALKING_SERVICE = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';
let nextRequestAt = 0;
function wait(ms, signal) {
  return new Promise((resolve,reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted','AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort',abort); resolve(); },ms);
    if(signal?.aborted) abort(); else signal?.addEventListener('abort',abort,{once:true});
  });
}

// The provider runs a foot profile; changing only /driving to /foot on a car
// server would not change its routing. Keep a shared request budget across routes.
export async function fetchWalkingApproach(start, entrance, {signal, fetcher=fetch, timeoutMs=10000, rateLimit=true}={}) {
  if(!validPoint(start)||!validPoint(entrance)) throw new Error('Invalid walking-route coordinates.');
  if(signal?.aborted) throw new DOMException('Aborted','AbortError');
  if(rateLimit) {
    const slot=Math.max(Date.now(),nextRequestAt); nextRequestAt=slot+1500;
    await wait(slot-Date.now(),signal);
  }
  if(signal?.aborted) throw new DOMException('Aborted','AbortError');
  const controller=new AbortController();
  const abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted) controller.abort();
  let timeout;
  const deadline=new Promise((_,reject)=>{ timeout=setTimeout(()=>{controller.abort();reject(new Error('Walking directions took too long to load.'));},timeoutMs); });
  const cancelled=new Promise((_,reject)=>{
    controller.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
  });
  try {
    const request=async()=>{
      const url=`${WALKING_SERVICE}/${start[1]},${start[0]};${entrance[1]},${entrance[0]}?overview=full&geometries=geojson&steps=false`;
      const response=await fetcher(url,{signal:controller.signal,credentials:'omit'});
      if(!response.ok) throw new Error('Walking directions are temporarily unavailable.');
      const data=await response.json(), route=data.routes?.[0];
      const points=route?.geometry?.coordinates?.map(c=>[c[1],c[0]]);
      if(data.code!=='Ok'||!Array.isArray(points)||points.length<2||!points.every(validPoint)||!Number.isFinite(route.distance)||route.distance<0) throw new Error('No walking route to the cemetery entrance was found.');
      if(distanceMeters(points[0],start)>50||distanceMeters(points.at(-1),entrance)>25) throw new Error('The walking route does not reach the selected start or cemetery entrance.');
      return {points,distance:route.distance};
    };
    return await Promise.race([request(),deadline,cancelled]);
  } catch(error) {
    if(signal?.aborted) throw new DOMException('Aborted','AbortError');
    if(controller.signal.aborted) throw new Error('Walking directions took too long to load.');
    throw error;
  } finally {clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
