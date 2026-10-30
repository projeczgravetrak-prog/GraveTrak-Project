// Public-map routing only. Coordinates in this module are Leaflet [lat, lng],
// except GeoJSON input. Never modify the stored survey or invent a connecting path.
export const validPoint = p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
// Survey endpoints have sub-metre rounding gaps; use the same limit in display and routing.
export const PUBLIC_PATH_JOIN_TOLERANCE_METERS = .75;
export function distanceMeters(a, b) {
  const rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function activePublicPaths(legacy, saved, cemetery) {
  const managed = new Set(saved.map(f => String(f.properties?.description || '').match(/\[legacy-path:([^\]]+)\]/)?.[1]).filter(Boolean));
  const base = legacy.filter((f, index) => f.geometry?.type === 'LineString'
    && f.properties?.is_active !== false
    && (cemetery === 'old' || f.properties?.name === 'path')
    && !managed.has(cemetery === 'old' ? `old-${index}` : `new-${f.id || index}`));
  return [...base, ...saved.filter(f => f.geometry?.type === 'LineString' && f.properties?.is_active !== false && f.properties?.cemetery_code === cemetery)];
}

function project(point, a, b) {
  const scale = Math.cos(point[0] * Math.PI / 180);
  const dx = (b[1] - a[1]) * scale, dy = b[0] - a[0];
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point[1] - a[1]) * scale * dx + (point[0] - a[0]) * dy) / length)) : 0;
  const coords = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return { coords, t, distance: distanceMeters(point, coords) };
}

export function buildWalkingGraph(features) {
  const segments = [];
  for (const f of features) {
    if (f.geometry?.type !== 'LineString') continue;
    const coords = f.geometry.coordinates.map(c => [c[1], c[0]]);
    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1], b = coords[i];
      if (validPoint(a) && validPoint(b) && distanceMeters(a, b) > .001) segments.push({ a, b, cuts: [0, 1] });
    }
  }
  // Split at actual crossings and tiny digitization gaps (the same 75 cm limit
  // as the displayed pathway joins). Do not bridge separate parallel walkways.
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i], b = segments[j];
    for (const p of [a.a, a.b]) { const q = project(p, b.a, b.b); if (q.distance <= PUBLIC_PATH_JOIN_TOLERANCE_METERS) b.cuts.push(q.t); }
    for (const p of [b.a, b.b]) { const q = project(p, a.a, a.b); if (q.distance <= PUBLIC_PATH_JOIN_TOLERANCE_METERS) a.cuts.push(q.t); }
    const rx = a.b[0] - a.a[0], ry = a.b[1] - a.a[1], sx = b.b[0] - b.a[0], sy = b.b[1] - b.a[1];
    const cross = rx * sy - ry * sx;
    if (Math.abs(cross) < 1e-16) continue;
    const dx = b.a[0] - a.a[0], dy = b.a[1] - a.a[1];
    const t = (dx * sy - dy * sx) / cross, u = (dx * ry - dy * rx) / cross;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { a.cuts.push(t); b.cuts.push(u); }
  }
  const nodes = [], edges = [];
  const nodeFor = coords => {
    const found = nodes.findIndex(n => distanceMeters(n.coords, coords) <= PUBLIC_PATH_JOIN_TOLERANCE_METERS);
    if (found >= 0) return found;
    nodes.push({ coords, edges: [] }); return nodes.length - 1;
  };
  for (const segment of segments) {
    const ids = [...new Set(segment.cuts)].sort((a,b) => a-b).map(t => nodeFor([
      segment.a[0] + t * (segment.b[0] - segment.a[0]), segment.a[1] + t * (segment.b[1] - segment.a[1]),
    ]));
    for (let i = 1; i < ids.length; i++) {
      const a = ids[i-1], b = ids[i];
      if (a === b || nodes[a].edges.some(e => e.to === b)) continue;
      const distance = distanceMeters(nodes[a].coords, nodes[b].coords);
      nodes[a].edges.push({to:b, distance}); nodes[b].edges.push({to:a, distance}); edges.push({a,b});
    }
  }
  return { nodes, edges };
}

export function nearestWalkway(graph, point) {
  if (!validPoint(point)) return null;
  let best = null;
  for (const edge of graph.edges) {
    const found = project(point, graph.nodes[edge.a].coords, graph.nodes[edge.b].coords);
    if (!best || found.distance < best.distance) best = { ...found, edge };
  }
  return best;
}

function inRing(point, ring) {
  let inside = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a = [ring[i][1],ring[i][0]], b = [ring[j][1],ring[j][0]];
    if (project(point, a, b).distance < .2) return true;
    if ((a[0] > point[0]) !== (b[0] > point[0]) && point[1] < (b[1]-a[1])*(point[0]-a[0])/(b[0]-a[0])+a[1]) inside = !inside;
  }
  return inside;
}

export function insideCemetery(point, geometries, graph) {
  if (!validPoint(point)) return false;
  for (const input of geometries) {
    const g = input.geometry || input;
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : g.type === 'LineString' && g.coordinates.length >= 4 && distanceMeters([...g.coordinates[0]].reverse(), [...g.coordinates.at(-1)].reverse()) < 2 ? [[g.coordinates]] : [];
    if (polygons.some(rings => inRing(point,rings[0]) && !rings.slice(1).some(ring => inRing(point,ring)))) return true;
  }
  // The New Cemetery has section polygons but no named enclosing boundary.
  // A position on/along its mapped walkway is also internal, regardless of gate distance.
  return (nearestWalkway(graph, point)?.distance ?? Infinity) <= 12;
}

export function walkingPath(graph, start, destination, maxStartGap = 25, maxEndGap = 25) {
  const first = nearestWalkway(graph,start), last = nearestWalkway(graph,destination);
  if (!first || !last) throw new Error('No mapped walking path is available for this destination. Please ask cemetery staff for directions.');
  if (first.distance > maxStartGap) throw new Error('Your position is too far from a mapped walkway. Move to a marked path and retry directions.');
  if (last.distance > maxEndGap) throw new Error('This grave is not close enough to a mapped walkway. Please ask cemetery staff for the final approach.');
  const nodes = graph.nodes.map(n => ({ coords: n.coords, edges: [...n.edges] }));
  const attach = found => {
    const id = nodes.length; nodes.push({coords: found.coords, edges:[]});
    for (const to of [found.edge.a,found.edge.b]) {
      const distance = distanceMeters(found.coords,nodes[to].coords);
      nodes[id].edges.push({to,distance}); nodes[to].edges.push({to:id,distance});
    }
    return id;
  };
  const startId=attach(first), endId=attach(last);
  if (first.edge === last.edge) {
    const distance=distanceMeters(first.coords,last.coords);
    nodes[startId].edges.push({to:endId,distance}); nodes[endId].edges.push({to:startId,distance});
  }
  const dists=nodes.map(()=>Infinity), previous=[], visited=new Set(); dists[startId]=0;
  while(visited.size<nodes.length) {
    let id=-1; for(let i=0;i<nodes.length;i++) if(!visited.has(i)&&(id<0||dists[i]<dists[id])) id=i;
    if(id<0||!Number.isFinite(dists[id])||id===endId) break;
    visited.add(id);
    for(const edge of nodes[id].edges) if(dists[id]+edge.distance<dists[edge.to]) { dists[edge.to]=dists[id]+edge.distance; previous[edge.to]=id; }
  }
  if(!Number.isFinite(dists[endId])) throw new Error('The mapped paths to this grave are not connected. Please ask cemetery staff for directions.');
  const points=[]; for(let id=endId;id!==undefined;id=previous[id]) points.unshift(nodes[id].coords);
  // End on the mapped walkway. The separate destination pin shows the grave;
  // never draw an unverified shortcut from the path through burial spaces.
  return {points, distance:dists[endId], startGap:first.distance, endGap:last.distance};
}

export function assessRoutePosition(position, now = Date.now()) {
  const {latitude,longitude,accuracy} = position?.coords || {};
  if (!validPoint([latitude,longitude])) return {ok:false, message:'Your device returned an invalid location. Waiting for a new GPS fix.'};
  if (!Number.isFinite(position.timestamp) || now-position.timestamp>60000 || position.timestamp-now>5000) return {ok:false, message:'Your location is out of date. Waiting for a fresh GPS fix.'};
  if (!Number.isFinite(accuracy)||accuracy<0) return {ok:false, message:'Your device did not report a valid location accuracy. Waiting for a new GPS fix.'};
  // A coarse location is still useful as a route origin. Precision controls
  // live following, not whether the browser's location is silently discarded.
  const precise = accuracy <= 30;
  return {ok:true, coords:[latitude,longitude], accuracy, precise,
    message: precise ? '' : `Route preview from your estimated location (±${Math.round(accuracy)} m). The blue circle shows the reported accuracy. Live following will be available when GPS improves.`};
}
