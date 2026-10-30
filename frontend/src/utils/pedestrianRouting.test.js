import test from 'node:test';
import assert from 'node:assert/strict';
import {activePublicPaths,buildWalkingGraph,walkingPath,insideCemetery,assessRoutePosition,distanceMeters} from './pedestrianRouting.js';
const line=(coordinates,properties={},id)=>({type:'Feature',id,properties,geometry:{type:'LineString',coordinates}});
const horizontal=line([[121,14],[121.002,14]]);
const vertical=line([[121.001,13.999],[121.001,14.001]]);

test('a position inside a cemetery is not sent back to its gate based on distance',()=>{
 const graph=buildWalkingGraph([horizontal,vertical]);
 const polygon={type:'Polygon',coordinates:[[[121,13.999],[121.002,13.999],[121.002,14.001],[121,14.001],[121,13.999]]]};
 assert.equal(insideCemetery([14.0006,121.0015],[polygon],graph),true);
 assert.equal(insideCemetery([14.01,121.01],[polygon],graph),false);
 assert.equal(insideCemetery([14,121.001],[],graph),true);
});
test('closed boundary lines and polygon holes are respected',()=>{
 const outer=[[121,14],[121.01,14],[121.01,14.01],[121,14.01],[121,14]];
 const inner=[[121.004,14.004],[121.006,14.004],[121.006,14.006],[121.004,14.006],[121.004,14.004]];
 const graph=buildWalkingGraph([]);
 assert.equal(insideCemetery([14.005,121.005],[{type:'LineString',coordinates:outer}],graph),true);
 assert.equal(insideCemetery([14.005,121.005],[{type:'Polygon',coordinates:[outer,inner]}],graph),false);
});
test('routing follows real crossings and ends on the walkway, without a grave shortcut',()=>{
 const graph=buildWalkingGraph([horizontal,vertical]);
 const route=walkingPath(graph,[14,121],[14.0005,121.00104]);
 assert.ok(route.points.some(p=>distanceMeters(p,[14,121.001])<1));
 assert.ok(route.distance>150&&route.distance<180);
 assert.ok(route.endGap>3&&route.endGap<5);
 assert.equal(route.points.at(-1)[1],121.001);
 assert.deepEqual(walkingPath(graph,[14,121.0002],[14,121.0004]).points,[[14,121.0002],[14,121.0004]]);
});
test('empty, disconnected or distant paths never produce straight-line directions',()=>{
 assert.throws(()=>walkingPath(buildWalkingGraph([]),[14,121],[14,121.001]),/No mapped/);
 const graph=buildWalkingGraph([horizontal,line([[121,14.00003],[121.002,14.00003]])]);
 assert.throws(()=>walkingPath(graph,[14,121],[14.00003,121.002]),/not connected/);
 assert.throws(()=>walkingPath(graph,[15,121],[14,121.002]),/position is too far/);
 assert.throws(()=>walkingPath(graph,[14,121],[15,121]),/grave is not close/);
});
test('sub-metre survey gaps connect but multi-metre gaps do not',()=>{
 const a=line([[121,14],[121.001,14]]), b=line([[121.001005,14],[121.002,14]]);
 assert.doesNotThrow(()=>walkingPath(buildWalkingGraph([a,b]),[14,121],[14,121.002]));
 const c=line([[121.00103,14],[121.002,14]]);
 assert.throws(()=>walkingPath(buildWalkingGraph([a,c]),[14,121],[14,121.002]),/not connected/);
});
test('path replacements and inactive aliases suppress legacy paths for both cemeteries',()=>{
 const saved=[line([[121,14],[121.003,14]],{description:'[legacy-path:old-0]',cemetery_code:'old',is_active:false}),line([[121,14],[121.002,14]],{description:'[legacy-path:new-path1]',cemetery_code:'new',is_active:true})];
 assert.deepEqual(activePublicPaths([horizontal],saved,'old'),[]);
 const modern=line([[121,14],[121.001,14]],{name:'path'},'path1');
 assert.deepEqual(activePublicPaths([modern],saved,'new'),[saved[1]]);
 assert.deepEqual(activePublicPaths([line([[121,14],[121.001,14]],{name:'boundary'})],[],'new'),[]);
});
test('GPS fixes require valid fresh coordinates; coarse accuracy permits preview but not following',()=>{
 const position={coords:{latitude:14,longitude:121,accuracy:10},timestamp:100000};
 assert.equal(assessRoutePosition(position,105000).ok,true);
 assert.equal(assessRoutePosition(position,105000).precise,true);
 const approximate=assessRoutePosition({...position,coords:{...position.coords,accuracy:209}},105000);
 assert.equal(approximate.ok,true);
 assert.equal(approximate.precise,false);
 assert.deepEqual(approximate.coords,[14,121]);
 assert.equal(assessRoutePosition({...position,coords:{...position.coords,accuracy:NaN}},105000).ok,false);
 assert.equal(assessRoutePosition({...position,coords:{...position.coords,latitude:NaN}},105000).ok,false);
 assert.equal(assessRoutePosition({...position,timestamp:1},105000).ok,false);
 assert.equal(assessRoutePosition({...position,timestamp:200000},105000).ok,false);
 assert.equal(assessRoutePosition(position,130000).ok,true);
 assert.equal(assessRoutePosition(position,160001).ok,false);
});
