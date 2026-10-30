# In-app page guidelines

Added 29 October 2026. This is a frontend-only change; it does not change records,
database schema, account permissions or application processing.

- Office pages: **How to use this page** appears above the active workspace.
- Citizen pages: the same button appears in the page header.
- Public map: **Guide** is included with the existing map controls.
- CMO, CPDO, staff and citizen dashboards have a dismissible **Quick Start** card.
  The full instructions remain available from the page guide after hiding the card.

The guide opens as a side panel with steps, a reminder, the next action, and an
expandable office overview. Close it using the close button, Escape, the backdrop,
or **Got it — back to page**. It reuses the application's modal focus handling.
It does not open automatically or send API requests. The application-document list
uses the same requirements data as the form.

Coverage includes all navigation entries for CMO, CPDO, cemetery staff and citizens,
the injected office dashboards, CPDO niche pages, and the public map.

Guide content: `frontend/src/data/pageGuides.js`.
Shared component and styles: `frontend/src/components/shared/PageGuide.jsx` and
`PageGuide.css`. Update the relevant guide whenever a page's workflow changes.

Validation: navigation-to-guide coverage check and production build. Interactive
desktop/mobile browser validation was unavailable because no browser was connected
to the UI automation tool. Before presentation, open a guide in each office, check
scrolling on a phone, and confirm that closing returns focus to the help button.

Deploy the rebuilt frontend to publish these guidelines. No backend migration is
needed for this change; earlier workflow migrations remain a separate requirement.
