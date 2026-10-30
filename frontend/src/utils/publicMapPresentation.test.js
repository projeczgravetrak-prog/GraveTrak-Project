import test from 'node:test';
import assert from 'node:assert/strict';
import { publicMapDetail, attachPublicMapPresentation } from './publicMapPresentation.js';

test('overview shows section blocks; close zoom restores grave divisions without changing palette', () => {
  for (const zoom of [16,17,18,19]) assert.equal(publicMapDetail(zoom).plotPaneOpacity,0);
  for (const zoom of [20,21,22,24]) {
    const detail=publicMapDetail(zoom);
    assert.equal(detail.plotPaneOpacity,1);
    assert.ok(detail.plotWeight>0);
    assert.ok(detail.outerWeight>detail.innerWeight);
    assert.equal('color' in detail,false);
    assert.equal('fillOpacity' in detail,false);
  }
});

test('zoom changes only presentation; plot geometry and click handlers stay mounted', () => {
  const calls=[], handlers=new Map(), plotPane={style:{}}; let zoom=19;
  const map={getZoom:()=>zoom,on:(event,fn)=>handlers.set(event,fn),off:event=>handlers.delete(event)};
  const click=()=>{}, geometry=[[14,121],[14.001,121.001]];
  const layer={setStyle:style=>calls.push(style),click,geometry};
  const dispose=attachPublicMapPresentation(map,{plots:[layer],outlines:[layer],cores:[layer],plotPane,onDetail:()=>{}});
  assert.equal(plotPane.style.opacity,'0'); assert.equal(calls.length,3);
  handlers.get('zoomend')(); assert.equal(calls.length,3);
  zoom=21; handlers.get('zoomend')(); assert.equal(plotPane.style.opacity,'1');
  assert.equal(calls.length,6); assert.equal(layer.click,click); assert.equal(layer.geometry,geometry);
  assert.ok(calls.every(style=>Object.keys(style).join(',')==='weight'));
  zoom=19; handlers.get('zoomend')(); assert.equal(plotPane.style.opacity,'0');
  dispose(); assert.equal(handlers.size,0);
});

test('initial styles and zooms within one detail band do not repaint thousands of plots', () => {
  let zoom=19, refresh, plotWrites=0, pathWrites=0;
  const map={getZoom:()=>zoom,on:(_,fn)=>refresh=fn,off:()=>{}};
  const plots=Array.from({length:3559},()=>({setStyle:()=>plotWrites++}));
  const path={setStyle:()=>pathWrites++};
  attachPublicMapPresentation(map,{plots,outlines:[path],cores:[path],plotPane:{style:{}},initialDetail:publicMapDetail(19),onDetail:()=>{}});
  assert.equal(plotWrites,0); assert.equal(pathWrites,0);
  zoom=18; refresh(); assert.equal(plotWrites,0); assert.equal(pathWrites,0);
  zoom=17; refresh(); assert.equal(plotWrites,0); assert.equal(pathWrites,2);
  zoom=20; refresh(); assert.equal(plotWrites,3559);
  zoom=21; refresh(); assert.equal(plotWrites,7118);
  const before=plotWrites; zoom=22; refresh(); assert.equal(plotWrites,before);
});
