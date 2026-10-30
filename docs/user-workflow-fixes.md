# Citizen workflow fixes — 28 October 2026

Citizen actions now use server-owned records instead of local browser demo overlays.

- `POST /api/burial-applications/{id}/cancel/` records the applicant's reason, time
  and audit entry. Only the owner can cancel, and only before scheduling/assignment.
  An occupied or assigned burial is never released through citizen cancellation.
- `/api/citizen-requests/` saves support and transfer requests scoped to the signed-in
  citizen. The CMO inbox reads the same records and saves replies. Citizens cannot
  read another account's requests or impersonate an office response.
- Transfer requests are review communications. Submitting or replying to one does
  not move an occupant. The existing explicit source/destination inventory transfer
  must be used for execution. The unsafe legacy name-based plot-clearing button was
  removed from the request modal.
- Corrected-document controls share one upload form backed by the document API.
  The API rejects empty/invalid batches before saving any document record. Success
  appears only after confirmed upload. Existing single-document replacements also
  receive non-success HTTP responses for invalid files.
- Session verification clears tokens only for HTTP 401. Network/server failures
  retain the token and show a retry screen. API requests have a 60-second timeout;
  mutations are never automatically retried. A timeout can have an unknown server
  outcome, so check tracking/history before manually repeating a submission.
- Application/inbox loading errors are visible instead of silently presenting an
  empty state. Requests refresh across devices approximately every 15 seconds while
  the tab is visible.

Migration: `backend/api/migrations/0039_citizen_requests_and_cancellation.py`.
This is additive: a request table, cancellation reason/time fields and a cancelled
status choice. No existing records are deleted or imported.

Local PostgreSQL was backed up before application of the migration. Comparison of
all previous column values found existing records unchanged: 39 applications,
3,559 plots, 16,450 niches, 43 sections, 203 document records and 19 accounts.
Backup and verification report are in `.tmp/local-db-backups/` (private, ignored
by Git). A custom-format pg_dump was produced and its archive listing verified;
no restore drill was performed.

For Render: back up the hosted DB, run migrations, deploy both source folders, and
set the frontend rewrite `/*` to `/index.html` (Rewrite). This local work does not
change the hosted service or migrate the local records to Supabase. Uploaded files
still require persistent storage. In-app office replies do not send email/SMS.

Verification: backend suite covers ownership, cross-client persistence, office
response permissions, duplicate transfer requests, cancellation boundaries,
idempotent cancellation, invalid document batches and successful replacements.
Frontend tests cover session decisions, request timeout/cancellation and reply
mapping. A hosted authenticated browser rehearsal is still required after deploy.

Final checks (29 October 2026): production build passed; 207 backend tests passed
in the isolated presentation-check environment; 93 frontend/cache tests passed.
Read-only smoke checks against local PostgreSQL returned HTTP 200 for citizen and
CMO application/request endpoints, with zero pending migrations. The running local
backend health endpoint returned HTTP 200 and the record counts above still match.
Browser interaction and hosted upload persistence have not been verified by these
automated checks.

Deployment order for the hosting owner:
1. Back up the hosted database and existing private uploaded files.
2. Deploy the updated backend and run `python manage.py migrate` using the hosted
   database configuration. Confirm `/healthz/` succeeds.
3. Build/deploy the updated frontend with `VITE_API_BASE` pointing to that backend's
   `/api` URL. Add the `/*` to `/index.html` Rewrite rule in Render.
4. Rehearse citizen login, document correction, cancellation, support request and
   CMO reply using test records and separate browser sessions. Refresh both sessions
   to confirm the changes persist. Then restart the backend and verify uploaded
   documents still open.

These migrations do not copy current local applications/inventory into an older
Supabase database. The deployment owner must separately select or migrate the
intended demonstration data before presenting.
