# Public-map GPS navigation fixes

Scope: local public/user map navigation. No backend code, database records, stored survey coordinates, office workflows, or Render deployment was changed by this task.

## Behavior

- An internal position uses the cemetery boundary and nearby mapped walkways, instead of treating everyone more than 50 metres from the entrance as outside.
- Display and directions use the same active pathways, including saved replacements and disabled legacy paths. Route graphs join actual intersections and survey endpoint gaps up to 0.75 metres. They do not bridge multi-metre gaps between separate paths.
- Verified walking routes end on the mapped walkway. A separate static dashed connector now reaches the selected grave pin when the remaining gap exceeds 0.2 metres. It is explicitly labelled as an unverified final approach to check on site; distance and time still cover the mapped route only. It does not add an edge to the walking graph. Positions or destinations more than 25 metres from a mapped walkway still return an explicit route error.
- GPS coordinates and accuracy must be finite and the fix no older than 60 seconds. The first usable fix immediately creates the location marker and a blue accuracy circle. Accuracy within 30 metres enables live following; coarser locations (including the reported 209-metre case) still provide a route preview from the estimated position, labelled **Approximate location**. They are not discarded in favour of the entrance. Stale/invalid/denied locations pause following; the watch can recover when usable fixes return. Temporary watch timeouts do not discard a still-fresh fix. A phone's reported accuracy does not guarantee grave-level precision.
- Route updates run at most once every five seconds, ignore movement under five metres, and coalesce pending updates. Exit, retry, and page changes dispose watches, timers, listeners and routes; old asynchronous results cannot replace the current route.
- Outside approaches use a foot-profile service. Requests have a 10-second timeout, cancellation, endpoint checks and a shared 1.5-second request spacing. Small movements can reuse a recent approach for up to 15 seconds. A failed approach now clears directions and shows a retryable error; it never substitutes an entrance-only route. Failed calculations retry on subsequent GPS fixes even without movement, subject to the existing service cooldown.
- Every displayed route originates from the device's reported location. Missing, denied, invalid or stale GPS clears the route and shows a waiting/error state. For a small gap between the reported location and the mapped route start, a separate dashed connector reaches the path; it is labelled as a direction cue whose physical access must be checked. The entrance is only an intermediate waypoint for an outside approach. Approximate positions remain explicitly labelled and do not enable precision following.
- iPhone browsers that require orientation permission have an optional **Enable compass** button. Denying compass access does not disable GPS. A valid north heading of zero is supported.
- PWA routing requests bypass asset caching; cache version 13 removes earlier app caches while preserving the map-tile cache. Navigation details can scroll on short screens.

## Verification

- Current-location-only update: all 124 utility/integration and service-worker tests passed, plus the production build. New coverage checks that failed GPS/service requests never produce an entrance-only route, stationary GPS can recover a failed external route, and a snapped road origin has a connector from the reported location. Real-device positioning and walking remain unverified.

- Final-approach update: 26 targeted navigation, pedestrian routing and camera tests passed, including exact connector endpoints, cleanup on Exit and rejection of distant destinations. Production build passed. Real-world final access remains unverified.

- 114 frontend utility/integration tests and 3 service-worker tests passed. The navigation integration tests execute the page's actual handler using simulated GPS, Leaflet and time. They cover initial marker creation, internal routing, coarse/stale fixes, the reported 209-metre accuracy case, temporary watch timeouts, recovery, denied permission, failed outside service, replacement of an in-flight route, Exit cleanup, and invalid destinations.
- Production `npm run build` passed. Existing large-chunk warnings remain for the admin and Excel bundles.
- Bundled pathways: all 34 Old Cemetery graph nodes and all 63 New Cemetery nodes are reachable from their corresponding entrance.
- Read-only localhost pathway check, including the eight saved Old Cemetery features: all 44 active Old Cemetery graph nodes and all 63 New Cemetery nodes are reachable. This checks graph connectivity, not physical access to every grave.
- One live request using public cemetery coordinates returned HTTP 200, route code `Ok`, a walking geometry and CORS permission. No personal GPS location was used. This is a connectivity check, not an uptime guarantee.
- Original public map and camera files are retained in `.tmp/gps-navigation-before-fix/`. The directory is a reference backup, not a full-project snapshot.

Run the automated checks from the repository root:

```powershell
node --test frontend/src/utils/*.test.js scripts/test_service_worker.cjs
```

Then run `npm run build` from `frontend`.

## Device validation still needed

No real phone walk or browser visual verification was performed in this environment. Before presenting live navigation, open the app over HTTPS, allow location, and test outdoors: select a grave, preview, start following, move along a mapped walkway, drag/recenter, temporarily lose location, retry, then Exit and reopen. Repeat for both cemeteries. Test the optional compass permission on iPhone. Indoor laptop location may remain in an approximate-location preview because its accuracy is insufficient for live following. Unavailable location or an unavailable external walking approach now shows a waiting/error state with no route; there is no automatic entrance-only preview.

The external approach depends on the public [FOSSGIS walking service](https://routing.openstreetmap.de/about.html) and OpenStreetMap coverage. Its public frontend [configuration](https://github.com/fossgis-routing-server/osrm-frontend/blob/master/src/leaflet_options.js) identifies the foot service. Outside walking requests send the current coordinates and cemetery entrance to that provider; internal cemetery routing is calculated locally. Provider attribution and an OpenStreetMap correction link appear when an external route is used.
