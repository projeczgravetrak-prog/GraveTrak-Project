import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchWalkingApproach} from './walkingService.js';
const start=[14,121],end=[14.001,121];
const response=()=>({ok:true,json:async()=>({code:'Ok',routes:[{distance:112,geometry:{coordinates:[[121,14],[121,14.001]]}}]})});
test('external approach uses the foot service and validates route endpoints',async()=>{
 const route=await fetchWalkingApproach(start,end,{rateLimit:false,fetcher:async(url)=>{assert.match(url,/routed-foot\/route\/v1\/foot/);return response();}});
 assert.equal(route.distance,112);
 await assert.rejects(fetchWalkingApproach(start,end,{rateLimit:false,fetcher:async()=>({ok:true,json:async()=>({code:'Ok',routes:[{distance:1,geometry:{coordinates:[[122,14],[122,14.001]]}}]})})}),/does not reach/);
});
test('HTTP errors, no route, malformed geometry and bad distance reject instead of drawing',async()=>{
 for(const data of [{code:'NoRoute'}, {code:'Ok',routes:[{distance:NaN,geometry:{coordinates:[[121,14],[121,14.001]]}}]}, {code:'Ok',routes:[{distance:10,geometry:{coordinates:[[121,NaN],[121,14.001]]}}]}]) {
  await assert.rejects(fetchWalkingApproach(start,end,{rateLimit:false,fetcher:async()=>({ok:true,json:async()=>data})}),/No walking/);
 }
 await assert.rejects(fetchWalkingApproach(start,end,{rateLimit:false,fetcher:async()=>({ok:false})}),/temporarily unavailable/);
});
test('deadline covers a stalled fetch and stalled response body',async()=>{
 for(const fetcher of [()=>new Promise(()=>{}),async()=>({ok:true,json:()=>new Promise(()=>{})})]) {
  await assert.rejects(fetchWalkingApproach(start,end,{fetcher,rateLimit:false,timeoutMs:10}),/too long/);
 }
});
test('Exit aborts an ongoing road request and rejects late results',async()=>{
 const controller=new AbortController();let requestSignal;
 const request=fetchWalkingApproach(start,end,{rateLimit:false,signal:controller.signal,fetcher:async(_,options)=>{requestSignal=options.signal;return new Promise(()=>{});}});
 controller.abort();await assert.rejects(request,{name:'AbortError'});assert.equal(requestSignal.aborted,true);
 await assert.rejects(fetchWalkingApproach(start,end,{rateLimit:false,signal:controller.signal,fetcher:async()=>assert.fail('Must not fetch')}),{name:'AbortError'});
});
