# GraveTrak: Free Render + a new Supabase demo project

Prepared 30 October 2026. The chosen setup is a NEW demo project; leave the previous
Supabase project and Render deployment intact until the replacement is verified.

## What moves

| Data | Current location | Destination |
| --- | --- | --- |
| Accounts, applications, graves, niches, sections, paths, settings, notifications | Local PostgreSQL `gravetrak_dev` | New Supabase PostgreSQL project |
| Uploaded PDF/image/document contents | Local `backend/media` | Private Supabase Storage bucket |
| Source code | This project folder | Private Git repository, built by Render |
| Search history, some office archives and browser audit logs | The original browser's localStorage | Separate review; not automatically included in PostgreSQL |

Read-only source inventory at preparation: 43 sections, 3,559 ground plots, 16,450
niches and 41 burial applications. The private export manifest contains counts at
the exact export snapshot. Counts can change if local users continue working.

Copying browser login tokens or map caches is not a data migration. Real records
already saved by the API travel with PostgreSQL. Existing users sign in again with
their existing credentials after a verified restore. Legacy browser-only archive
actions and local audit logs are not yet shared, server-backed features. Do not claim
those particular views are synchronized across devices just because the DB is moved.

## 1. Create the destination (no credentials in chat)

1. Sign in to Supabase and create a new demo project. Keep the previous project.
2. Save its database password privately. Choose a region near the intended users
   and choose the Render backend region accordingly.
3. Disable the project's **Data API** before importing Django tables. GraveTrak uses
   Django permissions and a direct PostgreSQL connection, not Supabase's auto-generated
   REST table API. This prevents that separate API from bypassing Django's permissions.
4. Create a **private**, not public, Storage bucket named `gravetrak-documents`.
   Allow the document types the app accepts and a limit of at least 10 MB per file.
5. Under Storage S3 settings, generate server-only S3 credentials and copy the
   endpoint and region. These are separate from the database password and anon key.
6. From **Connect**, copy the **Session pooler** PostgreSQL connection details for
   this new project. Use session mode for dump/restore, not transaction mode.

The app has optional Supabase media configuration; leaving it unset preserves local
filesystem development. Supabase's S3 protocol supports private file reads/writes;
the existing authenticated Django download API remains in front of document access.

References: [Supabase S3 credentials](https://supabase.com/docs/guides/storage/s3/authentication),
[S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility),
[Data API controls](https://supabase.com/docs/guides/api/securing-your-api),
[PostgreSQL migration](https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres).

## 2. Prepare and keep the packages separate

The helper reads only the verified local PostgreSQL database and files. Run from
the project root using an environment with `backend/requirements.txt` installed
and the LOCAL `DB_*` values already configured:

```powershell
python scripts/prepare_render_handoff.py --with-local-data
```

It writes a new timestamped directory under `.tmp/render-handoff/`:

- `source-code.zip`: source, dependencies manifests, migrations, setup scripts and guides.
  No `.env.email`, local `.env`, virtual environment, uploaded files or database dump.
- `PRIVATE-data-do-not-upload-to-git/database.dump`: PostgreSQL custom-format archive.
- `PRIVATE-data-do-not-upload-to-git/restore.list`: object list that skips recreating
  Supabase's existing public schema while retaining application objects.
- `PRIVATE-data-do-not-upload-to-git/media-private.zip`: files with their exact
  database-relative keys, not an extra `media/` folder prefix.
- `PRIVATE-data-do-not-upload-to-git/manifest-private.json`: snapshot counts and
  SHA-256 checksums, including any missing local files.
- `COMPLETE.json`: present only after the export process finishes successfully.

The DB dump includes personal records, password hashes and authentication data.
Keep the PRIVATE directory local/restricted. Upload only extracted **source-code.zip**
to the private Git repository. A ZIP operation does not automatically obey .gitignore.

Do not submit/edit local applications during the final export and cutover. The DB
snapshot is consistent; external files are checked for changes during packaging.
Missing files must be resolved before calling the document transfer complete.

## 3. Restore PostgreSQL into the NEW empty project

This is a one-time restore, not a merge. Do not run it against the old project or
against a target where Django migrations have already created application tables.
Use PostgreSQL 17 or newer client tools compatible with both source and destination.
Keep delivery workers and provider variables disabled during migration/rehearsal
so copied historical pending notifications do not send unexpectedly.

Before restoring, check the target in Supabase SQL Editor:

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND (tablename LIKE 'api\_%' ESCAPE '\'
       OR tablename LIKE 'auth\_%' ESCAPE '\'
       OR tablename LIKE 'django\_%' ESCAPE '\'
       OR tablename LIKE 'authtoken\_%' ESCAPE '\');
```

There must be **zero rows**. Also confirm the project's name/ref and take a backup
if any user-owned tables exist. Leave Supabase's own `auth` and `storage` schemas alone.
Do not use `--clean`, `DROP SCHEMA` or a destructive reset to make a restore pass.

With the new project's host/port/user/database loaded privately as standard
`PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` and `PGPASSWORD` environment variables,
and `PGSSLMODE=require`, the reviewed command from the PRIVATE package directory is:

```powershell
& 'C:/Program Files/PostgreSQL/17/bin/pg_restore.exe' --no-owner --no-acl --exit-on-error --single-transaction --use-list restore.list --dbname $env:PGDATABASE database.dump
```

This command writes to the destination. Run it only after confirming the new empty
project above. If it fails, retain the error for review; do not disable constraints
or delete hosted tables. No restore has been performed by the preparation work.

Compare the restored row counts with `manifest-private.json`, including accounts,
applications, sections, plots, niches, documents and saved graves. For example:

```sql
SELECT 'sections' AS kind, COUNT(*) FROM public.api_cemeterysection
UNION ALL SELECT 'plots', COUNT(*) FROM public.api_burialplot
UNION ALL SELECT 'niches', COUNT(*) FROM public.api_columbariumslot
UNION ALL SELECT 'applications', COUNT(*) FROM public.api_burialapplication
UNION ALL SELECT 'documents', COUNT(*) FROM public.api_burialdocument
UNION ALL SELECT 'users', COUNT(*) FROM public.auth_user;
```

The dump already includes migration history. Once Django is pointed to the new
database, inspect `python manage.py migrate --plan`; with matching source it should
have no pending operations. Never run a new seed command on top of restored data.

## 4. Upload the existing files to private Supabase Storage

Open a separate local terminal for the upload helper; do not replace the running
local backend's database/storage environment. Configure these server-only values
in that terminal and later in Render's backend environment:

```text
DJANGO_MEDIA_STORAGE=supabase
SUPABASE_S3_ENDPOINT_URL=https://PROJECT_REF.storage.supabase.co/storage/v1/s3
SUPABASE_S3_REGION=<exact S3 region from the dashboard>
SUPABASE_S3_BUCKET=gravetrak-documents
SUPABASE_S3_ACCESS_KEY_ID=<generated S3 key ID>
SUPABASE_S3_SECRET_ACCESS_KEY=<generated S3 secret>
```

Keep the bucket private and pause other uploads until this transfer finishes.
The helper reads the verified archive without extracting paths and preserves keys:

```powershell
python scripts/upload_demo_media.py '<PRIVATE package directory>' --bucket gravetrak-documents
```

The default preflight makes no writes. It validates local checksums, compares any
existing remote files, and refuses a conflicting file. After the destination and
preflight are correct:

```powershell
python scripts/upload_demo_media.py '<PRIVATE package directory>' --bucket gravetrak-documents --apply
```

It uploads missing keys and checks the downloaded contents. Matching files are
skipped on rerun. Do not upload `media-private.zip` itself as a single bucket object.
The helper does not update any database or send notifications.

## 5. Deploy backend and frontend from source

Extract the source ZIP to your private Git repository and connect Render to it.
Use the commands in [the Render checklist](render-final-check-2026-10-30.md).
For a new service, replace the old example hostnames with the URLs Render assigns.

Backend environment, in addition to the S3 values above:

```text
DJANGO_DEBUG=0
DJANGO_SECRET_KEY=<new random secret, at least 50 characters>
DJANGO_ALLOWED_HOSTS=<new backend hostname, no https prefix>
CORS_ALLOWED_ORIGINS=https://<new frontend hostname>
CSRF_TRUSTED_ORIGINS=https://<new frontend hostname>
DB_ENGINE=postgresql
DB_HOST=<new project's session pooler host>
DB_PORT=<session pooler port>
DB_NAME=<database name from Connect>
DB_USER=<complete session pooler username from Connect>
DB_PASSWORD=<new project database password>
DB_SSLMODE=require
BREVO_EMAIL_ENABLED=0
PHILSMS_ENABLED=0
```

Frontend: set `VITE_API_BASE=https://<new backend hostname>/api` **before building**.
Add the `/*` to `/index.html` Rewrite rule. Never put DB or S3 keys in VITE variables.
Email is initially disabled to prevent replaying pending notifications from the
copied database. Review pending queues before enabling Brevo and its worker; new
email-verification demos will require this separate provider setup. Django has not
been upgraded by this storage integration.

## 6. Verify before presenting

1. `/healthz/` returns success; login works with restored accounts in a fresh browser.
2. Expected records match the manifest. Check both cemeteries and specific known graves.
3. Old uploaded documents open for the owner/authorized office, and another account
   cannot access them. Submit a synthetic application and preview its new upload.
4. Restart Render; both old and new documents must still open from Supabase.
5. Rehearse approval/scheduling, search, reports, map gestures and actual phone GPS.
6. Decide how to preserve any original browser-only archive/audit entries before
   clearing that browser. They are not copied by these database/media tools.

This is a one-time copy. Changes made later to the local DB do not sync to Supabase;
after cutover, all demo users must use the new hosted site for shared records.
Free Render can still sleep and wake slowly; cloud file storage fixes persistence,
not cold-start delay. [Render free limits](https://render.com/docs/free)

## Current setup progress (30 October 2026)

- Created Supabase project ref `enlxpsvbesltpquysgzv`, PostgreSQL 17.11.
- Confirmed the `gravetrak-documents` Storage bucket is private.
- User screenshot confirms **Enable Data API is OFF**.
- Read-only connection preflight confirmed an empty `public` schema.
- Restored 33 public Django tables from the local PostgreSQL snapshot. Every table
  count matches the manifest, and all 215 document references match the media archive.
- Uploaded and read-back verified all 215 document files in the private bucket.
- Newly generated S3 keys are stored only in `.tmp/supabase-demo/storage-private.json`.
  The previously exposed key should remain revoked. Render service creation and
  deployment have not happened yet.

The private restore package is `.tmp/render-handoff/20261030T134117254984Z/PRIVATE-data-do-not-upload-to-git`.
The helper confirmed all 215 private bucket objects match their local source files.
The private database dump and storage keys stay out of source Git.

Prepared code and local tests are not proof of live Supabase connectivity. The new
project, private bucket, restore, upload and deployed walkthrough still require
your dashboard setup. Do not paste secrets into chat or a public repository.
