# Final Render upload check — 30 October 2026

Follow-up: [Free Render + new Supabase database/storage setup](render-supabase-setup.md)
adds opt-in cloud media support and separate source/data handoff tools. Use that
guide for the chosen free-hosting deployment; the checks below describe the earlier review.

## Decision

The reviewed source passes the local checks needed to proceed with a controlled
client-demo deployment. It is not yet a verified, presentation-ready hosted system.
Complete the environment, database, media and online rehearsal checks below first.
No application code, working database, hosted service or credentials were changed
by this review. Generated frontend build files were rebuilt with the hosted API URL.

## Results from this review

| Check | Result |
| --- | --- |
| Frontend utility, navigation and service-worker tests | 124 passed |
| Frontend production build | Passed, including a build with the hosted API URL |
| Backend API/workflow/deployment tests | 207 passed on disposable SQLite test data |
| Django system check | No issues |
| Model/migration consistency | No changes detected |
| Static asset collection | Passed into a temporary directory |
| Production API target | Hosted backend URL present; localhost API URL absent from final JS build |
| Hosted authenticated workflow / real phone GPS | Not verified |
| Hosted PostgreSQL contents, migrations and document persistence | Not verified |

Backend validation used Python 3.13 on Windows with the previously installed
requirements. Render selects Python 3.12. A fresh Linux dependency installation and
Gunicorn startup still need confirmation in Render's deployment logs. Tests disabled
real email/SMS and did not migrate the working database. Performance probes used an
old disposable SQLite snapshot, not the active local PostgreSQL or Supabase database.

The admin and spreadsheet chunks still trigger Vite's size warning. This is not a
build failure. Map inventory responses are still sizable; passing local tests does
not guarantee smooth rendering on every phone or eliminate network/hosting delay.

## Required deployment settings

These URLs match the most recent deployment supplied by the owner. Substitute the
new service URLs everywhere if the uploader creates different services.

### Frontend: Render Static Site

| Setting | Value |
| --- | --- |
| Root directory | `frontend` |
| Build command | `npm ci && npm run build` |
| Publish directory | `dist` |
| Environment variable | `VITE_API_BASE=https://gravetrak-again.onrender.com/api` |
| Rewrite rule | `/*` → `/index.html`, action **Rewrite** |

The local `frontend/.env` points to `http://127.0.0.1:8000/api`. Do not copy it as
the hosted configuration. Set the variable in Render before the build; rebuilding
is required after changing it. This review tested that override without changing
the local development file. Render should rebuild from source, not reuse an older
`dist` directory.

### Backend: Render Web Service

| Setting | Value |
| --- | --- |
| Root directory | `backend` |
| Build command | `bash build.sh` |
| Health check | `/healthz/` |
| Python version | 3.12, selected by `backend/.python-version` |

Start command:

```sh
gunicorn gravetrak_backend.wsgi:application --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 60 --access-logfile - --error-logfile -
```

Set these in the backend service environment:

```text
DJANGO_DEBUG=0
DJANGO_SECRET_KEY=<new random secret of at least 50 characters>
DJANGO_ALLOWED_HOSTS=gravetrak-again.onrender.com
CORS_ALLOWED_ORIGINS=https://gravetrak-again-frontend.onrender.com
CSRF_TRUSTED_ORIGINS=https://gravetrak-again-frontend.onrender.com
DB_ENGINE=postgresql
DB_NAME=<intended database name>
DB_USER=<intended database user>
DB_PASSWORD=<database password>
DB_HOST=<intended database hostname>
DB_PORT=<database connection port>
```

This project reads separate `DB_*` values; setting `DATABASE_URL` alone is not enough.
For Supabase, use the connection details for the intended project and connection
mode. Do not substitute local PostgreSQL credentials or assume old Supabase data
matches the local system. Render startup rejects SQLite and unsafe debug/secret
settings. Supabase connection reachability has not been tested in this review.

## Database and documents: resolve before the presentation

1. Confirm the authoritative demo database and the expected records. Uploading
   source code does not copy local accounts, applications, map inventories or files.
   Reusing the same old Supabase database can retain the missing-record problem.
2. Back up the target database and inspect `python manage.py migrate --plan`.
   Apply the reviewed migrations with `python manage.py migrate --noinput` before
   using the updated frontend. The latest local migration is
   `0039_citizen_requests_and_cancellation`. The build script only installs
   requirements and collects static assets; it deliberately does not migrate.
3. Configure durable uploaded-document storage. The current implementation uses
   Django's filesystem storage: attach a persistent disk at `/var/data` and set
   `DJANGO_MEDIA_ROOT=/var/data/media`, then transfer approved demo files preserving
   their relative paths. Supabase PostgreSQL does not automatically store file bytes
   or connect this app to Supabase Storage.
4. If demonstrating email, configure Brevo variables on Render and a worker/scheduler
   for `python manage.py send_pending_emails`. The local Windows scheduled worker
   does not run on Render. Do not commit or share `backend/.env.email` publicly.

Free Render web services sleep after 15 minutes without traffic, can take about a
minute to wake, and lose filesystem changes on restart/redeploy/spin-down. They
cannot attach persistent disks. These are remaining hosting limitations, not fixed
by the UI/navigation work. See [Render free-service limits](https://render.com/docs/free).

## Presentation rehearsal after deploy

- Confirm `/healthz/` responds successfully and the browser requests the correct
  API host without CORS, 400 or 500 errors. Open `/map` directly to check the rewrite.
- Log in using the actual citizen, CMO, CPDO and cemetery demo accounts.
- Compare known records and section/plot counts against the chosen source database.
- Try both maps, search, grave selection, zoom/drag and navigation on a phone.
  Navigation now waits/errors if no usable device location is available; it does
  not automatically substitute an entrance-only route. Approximate GPS remains
  labelled and does not guarantee precise physical positioning.
- Use a synthetic application to rehearse upload, protected document preview,
  office review/scheduling/assignment and citizen status updates. Verify report export.
- Restart the backend and verify both records and uploaded files still open.
- Open the system before presenting and allow for another wake-up after idle time
  if using a free backend. Do not promise zero lag from this local review.

The public URLs could not be retrieved by the browsing tool during this review;
this does not establish that the deployed services are down. Render dashboard logs,
live database configuration and an authenticated browser walkthrough were unavailable.

## Handoff and remaining maintenance

Send source with migrations, package lock and deployment scripts. Exclude `.tmp`,
virtual environments, `node_modules`, local `.env`/`.env.email`, database dumps,
uploaded personal documents and generated builds. A ZIP does not obey `.gitignore`
automatically. Transfer any approved database/media backup separately and privately.

The requirements constrain Django to 4.2, whose security support ended on 7 April
2026. A supported-version upgrade with regression checks is needed before ongoing
public/production use. It was not silently upgraded during this presentation review.
See [Django supported versions](https://www.djangoproject.com/download/).

Deployment references: [Django on Render](https://render.com/docs/deploy-django)
and [Render static sites](https://render.com/docs/static-sites).
