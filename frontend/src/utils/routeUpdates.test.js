import test from 'node:test';import assert from 'node:assert/strict';
import {createRouteUpdates} from './routeUpdates.js';
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture(calculate){let time=10000,id=0;const timers=new Map();const controller=new AbortController();const updates=createRouteUpdates(calculate,{signal:controller.signal,now:()=>time,schedule:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id;},cancel:id=>timers.delete(id)});return{updates,controller,timers,advance:async(ms)=>{time+=ms;for(const [id,timer]of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}await tick();}};}
test('stationary jitter is ignored; moving fixes coalesce to the newest position',async()=>{
 const calls=[];const f=fixture(async p=>calls.push(p));f.updates.push([14,121]);await tick();
 f.updates.push([14.000001,121]);await f.advance(5000);assert.equal(calls.length,1);
 f.updates.push([14.0001,121]);await tick();assert.equal(calls.length,2);
 f.updates.push([14.0002,121]);f.updates.push([14.0003,121]);await f.advance(5000);
 assert.deepEqual(calls.at(-1),[14.0003,121]);assert.equal(calls.length,3);
});
test('requests never overlap and Exit cancels pending timers and late application',async()=>{
 let finish,valid;const calls=[];const f=fixture((p,current)=>{calls.push(p);valid=current;return new Promise(resolve=>finish=resolve);});
 f.updates.push([14,121]);await tick();f.updates.push([14.001,121]);await f.advance(10000);assert.equal(calls.length,1);
 f.controller.abort();assert.equal(valid(),false);finish();await tick();assert.equal(calls.length,1);assert.equal(f.timers.size,0);
});
test('signal loss invalidates in-flight results and recovery can route at the same location',async()=>{
 const validity=[];const f=fixture(async(_,current)=>validity.push(current));
 f.updates.push([14,121]);await tick();f.updates.reset();assert.equal(validity[0](),false);
 f.updates.push([14,121],true);await f.advance(5000);assert.equal(validity.length,2);assert.equal(validity[1](),true);
});
