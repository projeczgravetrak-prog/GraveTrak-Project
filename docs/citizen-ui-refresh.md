# Citizen UI refresh

29 October 2026

The citizen portal now uses grouped sidebar navigation, short descriptions,
keyboard-accessible navigation buttons, a labelled search field, consistent map
control surfaces and more readable page headings. Mobile navigation uses short
visible labels with the full page name retained as its accessible label.

The light-theme citizen map displays the original tile colours instead of the old
global darkening/hue filter. Tile providers, coordinates, boundaries, inventory
styles, routing and map event handlers remain unchanged. Satellite imagery keeps
its existing unfiltered appearance.

The refresh is scoped to the signed-in citizen interface. It reuses theme colours,
keeps the existing high-contrast/text-size preferences, and adds no dependency,
network request or database migration. Existing guides remain available.

Files:
- `frontend/src/pages/CitizenPortal.css`: citizen styling and responsive layout.
- `frontend/src/components/Sidebar.jsx`: navigation markup and helper labels.
- `frontend/src/pages/PublicMapPage.jsx`: search label, account button, page headings
  and stylesheet import.

Validation: production build and 93 existing frontend/cache tests passed. The diff
was checked against local pre-change copies in `.tmp/citizen-ui-before-refresh/`.
These checks do not validate visual layout or browser interactions. No browser was
connected to the UI tool, so desktop/mobile visual verification remains outstanding.

To preview: refresh localhost, sign in as a citizen, then open Map, Dashboard,
Burial Application, Application Tracking, My Loved Ones and Settings. Check search
results, notifications, the account menu, map/satellite controls and a grave's
details. Also inspect a narrow phone viewport, dark mode, and larger text.

Publish by deploying the rebuilt frontend. This change has not been deployed to
Render and does not copy or modify database records.
