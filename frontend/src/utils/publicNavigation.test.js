import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as routing from './pedestrianRouting.js';
import { createRouteCamera } from './routeCamera.js';
import { createRouteUpdates } from './routeUpdates.js';

// Exercise the page's actual event handler with simulated Leaflet/GPS and a
// deterministic clock. No browser, private location, or network is involved.
const source = readFileSync(new URL('../pages/PublicMapPage.jsx', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('  const handleNavigateRoute = useCallback('), source.indexOf('\n\n  useEffect(', source.indexOf('  const handleNavigateRoute = useCallback(')));
const oldPaths = JSON.parse(source.match(/const pathwaysGeoJson = ([\s\S]*?);/)[1]);
const newMap = JSON.parse(readFileSync(new URL('../../anothermap.json', import.meta.url), 'utf8'));
const boundary = JSON.parse(readFileSync(new URL('../data/oldCemeteryBoundary.json', import.meta.url), 'utf8'));
const entrance = [13.939330, 121.619764];
const target = [13.93899233350628, 121.6203097766633];
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function fixture(approach = async () => { throw new Error('Service unavailable'); }) {
  let time = 100000, id = 0, success, failure, watchSuccess, watchError;
  const timers = new Map(), layers = new Set(), events = new Map(), state = {}, cleared = [], requests = [];
  const schedule = (fn, delay) => { timers.set(++id, { fn, at: time + delay }); return id; };
  const cancel = id => timers.delete(id);
  const map = {
    stop() {}, getCenter: () => ({ lat: 14, lng: 121 }), getZoom: () => 18, getMaxZoom: () => 22,
    getContainer: () => ({ addEventListener() {}, removeEventListener() {} }), on() {}, off() {},
    fitBounds() {}, flyTo() {}, project: p => ({ subtract: () => p }), unproject: p => p,
    removeLayer: layer => layers.delete(layer),
  };
  const layer = (coords, options = {}) => ({ coords, options, radius: options.radius, light: { style: {} }, addTo() { layers.add(this); return this; },
    setLatLng(p) { this.coords = p; return this; }, setRadius(radius) { this.radius = radius; return this; }, getElement() { return { querySelector: () => this.light }; }, setStyle() {} });
  const ctx = {
    ...routing, AbortController, Date: { now: () => time }, useCallback: fn => fn,
    mapRef: { current: map }, isMountedRef: { current: true }, savedCemeteryPathways: [], savedCemeterySections: [],
    CEMETERY_CENTER: entrance, ANOTHER_CEMETERY_CENTER: [13.931237, 121.620764],
    OLD_CEMETERY_ENTRANCE: entrance, NEW_CEMETERY_ENTRANCE: [13.932708, 121.621159],
    oldCemeteryBoundary: boundary, pathwaysGeoJson: oldPaths, anotherMapData: newMap,
    addToRecentSearches() {}, showToast: message => state.toast = message, showDestinationMarker() {},
    setTimeout: schedule, clearTimeout: cancel, requestAnimationFrame: fn => schedule(fn, 16), cancelAnimationFrame: cancel,
    L: { marker: layer, circle: layer, polyline: layer, divIcon: value => value, layerGroup: layer },
    document: { querySelector: () => null },
    window: { innerWidth: 1200, matchMedia: () => ({ matches: true }),
      addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
    navigator: { geolocation: { watchPosition: (ok, error) => { watchSuccess = ok; watchError = error; return 7; }, clearWatch: id => cleared.push(id) } },
    requestRoutePosition: (ok, error) => { success = ok; failure = error; },
    routeLocationErrorMessage: error => error.message,
    assessRoutePosition: position => routing.assessRoutePosition(position, time),
    createRouteCamera: (map, options) => createRouteCamera(map, { ...options, schedule, cancel }),
    createRouteUpdates: (calculate, options) => createRouteUpdates(calculate, { ...options, schedule, cancel, now: () => time }),
    fetchWalkingApproach: (...args) => { requests.push(args); return approach(...args); },
  };
  for (const name of ['navigationStartViewRef', 'routeAbortControllerRef', 'routeAnimationFrameRef', 'routeLayerRef', 'userMarkerRef', 'routeCameraRef', 'navigationWatchId', 'orientationHandlerRef']) ctx[name] = { current: null };
  for (const name of ['RouteCameraState', 'IsNavigating', 'RouteOrigin', 'RouteNotice', 'PubOpen', 'LandingOpen', 'PubSearchOpen', 'LandingSearchOpen', 'RouteDestination', 'NavStats']) ctx[`set${name}`] = value => { state[name] = typeof value === 'function' ? value(state[name]) : value; };
  vm.createContext(ctx);
  vm.runInContext(`${handler}\nglobalThis.navigate = handleNavigateRoute;`, ctx);
  const position = (coords = target, accuracy = 5, timestamp = time) => ({ timestamp, coords: { latitude: coords[0], longitude: coords[1], accuracy, heading: 0 } });
  return { ctx, state, layers, events, timers, cleared, requests, position,
    navigate: (grave = { id: 'test', latlng: target, cemeteryMap: 'old' }) => ctx.navigate(grave),
    initial: (...args) => success(position(...args)), fail: error => failure(error),
    watch: (...args) => watchSuccess(position(...args)), watchError: error => watchError(error),
    exit: () => ctx.routeAbortControllerRef.current?.abort(),
    advance: async ms => { time += ms; for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.fn(); } await flush(); },
  };
}

test('both bundled walkway graphs connect every node to their cemetery entrance', () => {
  for (const [code, features, start] of [['old', oldPaths.features, entrance], ['new', newMap.features, [13.932708, 121.621159]]]) {
    const graph = routing.buildWalkingGraph(routing.activePublicPaths(features, [], code));
    assert.ok(graph.nodes.length > 20);
    for (const node of graph.nodes) assert.ok(Number.isFinite(routing.walkingPath(graph, start, node.coords).distance));
  }
});

test('initial fix draws marker immediately and internal GPS avoids an entrance detour', async () => {
  const f = fixture(); f.navigate(); f.initial();
  assert.ok(f.ctx.userMarkerRef.current);
  assert.match(f.ctx.userMarkerRef.current.light.style.transform, /rotate\(0deg\)/);
  await flush();
  assert.equal(f.state.NavStats.mode, 'Walking');
  assert.equal(f.requests.length, 0);
  assert.equal(f.state.RouteCameraState.hasLocation, true);
  f.exit(); assert.equal(f.layers.size, 0); assert.equal(f.timers.size, 0);
  assert.equal(f.events.size, 0); assert.deepEqual(f.cleared, [7]);
  f.watch(); await flush(); assert.equal(f.layers.size, 0);
});

test('weak or stale GPS pauses following and a fresh fix restores a usable route', async () => {
  const f = fixture(); f.navigate(); f.initial(); await flush();
  assert.equal(f.ctx.routeCameraRef.current.start(), true);
  await f.advance(1000); f.watch(target, 100); await flush();
  assert.equal(f.state.NavStats.mode, 'Approximate location');
  assert.ok(f.ctx.userMarkerRef.current);
  assert.equal(f.ctx.routeCameraRef.current.start(), false);
  await f.advance(5000); f.watch(); await flush();
  await f.advance(5000); // Allow the coalesced precision-change route update.
  assert.equal(f.state.NavStats.mode, 'Walking');
  assert.equal(f.ctx.routeCameraRef.current.start(), true);
  await f.advance(60001);
  assert.equal(f.state.NavStats.mode, 'Waiting for location');
  assert.equal(f.ctx.routeLayerRef.current, null);
  assert.equal(f.ctx.userMarkerRef.current, null); f.exit();
});

test('209-metre accuracy uses the reported outside location, not an entrance-only route', async () => {
  const origin = [13.9405, 121.619];
  const f = fixture(async start => ({ points: [start, entrance], distance: 160 }));
  f.navigate(); f.initial(origin, 209); await flush();
  assert.deepEqual(f.requests[0][0], origin);
  assert.equal(f.state.NavStats.mode, 'Approximate location');
  assert.equal(f.state.NavStats.external, true);
  assert.match(f.state.RouteOrigin, /Estimated location.*209/);
  assert.match(f.state.RouteNotice, /estimated location/);
  assert.deepEqual(f.ctx.userMarkerRef.current.coords, origin);
  assert.ok([...f.layers].some(layer => layer.radius === 209));
  assert.deepEqual(f.ctx.routeLayerRef.current.coords[0].coords[0][0], origin);
  assert.equal(f.ctx.routeCameraRef.current.start(), false);
  f.watchError({ code: 3, message: 'A new location fix timed out' });
  assert.equal(f.state.NavStats.mode, 'Approximate location');
  assert.ok(f.ctx.userMarkerRef.current);
  await f.advance(5000); f.watch(origin, 10); await flush();
  assert.equal(f.state.NavStats.mode, 'Walking');
  assert.equal(f.ctx.routeCameraRef.current.start(), true);
  f.exit(); assert.equal(f.layers.size, 0);
});

test('waiting for GPS draws no entrance route; a coarse fix starts from its own location', async () => {
  const f = fixture(); f.navigate(); f.fail({ code: 3, message: 'GPS timed out' }); await flush();
  assert.equal(f.state.NavStats.mode, 'Waiting for location');
  assert.equal(f.ctx.routeLayerRef.current, null);
  await f.advance(5000); f.watch(target, 209); await flush();
  assert.equal(f.state.NavStats.mode, 'Approximate location');
  assert.equal(f.requests.length, 0);
  assert.match(f.state.RouteOrigin, /Estimated location/);
  await f.advance(20000); f.watch(target, 209); await flush();
  assert.equal(f.state.NavStats.mode, 'Approximate location');
  assert.ok(f.ctx.userMarkerRef.current);
  f.exit();
});

test('permission failure and failed external service never substitute an entrance route', async () => {
  const denied = fixture(); denied.navigate(); denied.fail({ code: 1, message: 'Location denied' }); await flush();
  assert.equal(denied.state.NavStats.mode, 'Waiting for location');
  assert.equal(denied.ctx.routeLayerRef.current, null);
  assert.equal(denied.ctx.navigationWatchId.current, null); denied.exit();
  const outside = fixture(); outside.navigate(); outside.initial([14, 121]); await flush();
  assert.equal(outside.requests.length, 1);
  assert.equal(outside.state.NavStats.mode, 'No route');
  assert.equal(outside.state.RouteCameraState.hasLocation, false);
  assert.equal(outside.ctx.routeLayerRef.current, null); outside.exit();
});

test('a stationary GPS fix retries a failed outside route after the service cooldown', async () => {
  let calls=0;
  const origin=[13.9405,121.619];
  const f=fixture(async start=>{
    if(++calls===1)throw new Error('Service unavailable');
    return {points:[start,entrance],distance:160};
  });
  f.navigate();f.initial(origin);await flush();
  assert.equal(f.ctx.routeLayerRef.current,null);
  await f.advance(15000);f.watch(origin);await flush();
  assert.equal(calls,2);assert.equal(f.state.NavStats.mode,'Walking');
  assert.deepEqual(f.ctx.routeLayerRef.current.coords[0].coords[0][0],origin);
  f.exit();
});

test('a snapped road origin gets a separate connector from the exact reported location', async () => {
  const origin=[13.9405,121.619], snapped=[13.94055,121.619];
  const f=fixture(async()=>({points:[snapped,entrance],distance:160}));
  f.navigate();f.initial(origin,212);await flush();
  const drawn=f.ctx.routeLayerRef.current.coords;
  const connector=drawn.find(layer=>layer.options.dashArray==='6, 6' && routing.distanceMeters(layer.coords[0],origin)<.01);
  assert.ok(connector);
  assert.deepEqual(Array.from(connector.coords[0]),origin);
  assert.deepEqual(Array.from(connector.coords[1]),snapped);
  assert.match(f.state.RouteNotice,/Dashed start connector/);
  assert.equal(f.state.NavStats.mode,'Approximate location');
  f.exit();
});

test('retry cancels the old session and ignores its delayed external response', async () => {
  let finish;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }));
  f.navigate(); f.initial([14, 121]); await flush();
  f.navigate(); f.initial(); await flush();
  assert.equal(f.state.NavStats.mode, 'Walking');
  const currentLayer = f.ctx.routeLayerRef.current;
  finish({ points: [[14, 121], entrance], distance: 10000 }); await flush();
  assert.equal(f.ctx.routeLayerRef.current, currentLayer);
  assert.equal(f.state.NavStats.external, false); f.exit();
});

test('missing target coordinates are rejected before starting GPS', () => {
  const f = fixture(); f.navigate({ latlng: [null, null] });
  assert.match(f.state.toast, /no valid map location/);
  assert.equal(f.ctx.routeAbortControllerRef.current, null);
});

test('final dashed connector reaches the grave pin without extending the verified walkway', async () => {
  const pin = [target[0] + .00004, target[1]];
  const f = fixture(); f.navigate({id:'off-path-grave',latlng:pin,cemeteryMap:'old'});
  f.initial(); await flush();
  const drawn = f.ctx.routeLayerRef.current.coords;
  assert.equal(drawn.length,3);
  const walkway = drawn[1].coords.at(-1), connector = drawn[2];
  assert.deepEqual(Array.from(connector.coords[0]),Array.from(walkway.at(-1)));
  assert.deepEqual(Array.from(connector.coords[1]),pin);
  assert.ok(routing.distanceMeters(walkway.at(-1),pin) > .2);
  assert.equal(connector.options.dashArray,'6, 6');
  assert.match(f.state.RouteNotice,/not a verified path/);
  f.exit(); assert.equal(f.layers.size,0);
});

test('a distant grave still returns a route error instead of drawing a long connector', async () => {
  const f=fixture(); f.navigate({id:'far-grave',latlng:[14,121],cemeteryMap:'old'});
  f.initial(); await flush();
  assert.equal(f.state.NavStats.error,true);
  assert.equal(f.ctx.routeLayerRef.current,null);
  f.exit();
});
