// Display only: keep surveyed coordinates, colors, click targets and routing intact.
export function publicMapDetail(zoom) {
  const level = Number.isFinite(zoom) ? zoom : 19;
  return {
    plotWeight: level < 20 ? 0 : level < 21 ? .65 : 1,
    plotPaneOpacity: level < 20 ? 0 : 1,
    outerWeight: level < 18 ? 3.5 : level < 20 ? 6 : level < 22 ? 9 : 13,
    innerWeight: level < 18 ? 2 : level < 20 ? 4.5 : level < 22 ? 7 : 11,
  };
}

export function attachPublicMapPresentation(map, { plots, outlines, cores, plotPane, onDetail, initialDetail = null }) {
  let previousDetail = initialDetail;
  const refresh = () => {
    const zoom = map.getZoom(), detail = publicMapDetail(zoom);
    onDetail(detail);
    // Many adjacent zoom levels share the same style. Only touch a layer when
    // its actual stroke width changes; setStyle queues a Leaflet canvas redraw.
    if (plotPane && detail.plotPaneOpacity !== previousDetail?.plotPaneOpacity) {
      plotPane.style.opacity = String(detail.plotPaneOpacity);
    }
    if (detail.plotWeight !== previousDetail?.plotWeight) {
      plots.forEach(layer => layer.setStyle({ weight: detail.plotWeight }));
    }
    if (detail.outerWeight !== previousDetail?.outerWeight) {
      outlines.forEach(layer => layer.setStyle({ weight: detail.outerWeight }));
    }
    if (detail.innerWeight !== previousDetail?.innerWeight) {
      cores.forEach(layer => layer.setStyle({ weight: detail.innerWeight }));
    }
    previousDetail = detail;
  };
  map.on('zoomend', refresh);
  refresh();
  return () => map.off('zoomend', refresh);
}
