"""Create separate source and private local-data packages. Never write to a DB."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BLOCKED = {'node_modules', 'dist', 'venv', '.venv', '__pycache__', '.git', '.tmp',
           'media', 'staticfiles', 'archive'}
BACKEND_FILES = {'manage.py', 'requirements.txt', 'build.sh', '.python-version',
                 '.env.example', '.env.sms.example'}


def source_allowed(relative):
    if any(part in BLOCKED for part in relative.parts):
        return False
    name = relative.name
    if name.startswith('.env') and name not in ('.env.example', '.env.sms.example'):
        return False
    if relative.suffix.lower() in ('.pyc', '.sqlite3', '.dump', '.log', '.bak', '.zip'):
        return False
    if relative.parts[0] == 'backend':
        return ((len(relative.parts) == 2 and name in BACKEND_FILES)
                or (len(relative.parts) > 2 and relative.parts[1] in ('api', 'gravetrak_backend')))
    return (relative.parts[0] in ('frontend', 'docs')
            or relative.as_posix() in ('.gitignore', 'README.md',
                                      'scripts/prepare_render_handoff.py',
                                      'scripts/configure-supabase-demo.ps1',
                                      'scripts/configure-supabase-storage.ps1',
                                      'scripts/check_supabase_demo.py',
                                      'scripts/restore_supabase_demo.py',
                                      'scripts/test_render_handoff.py',
                                      'scripts/upload_demo_media.py',
                                      'scripts/check_presentation.py'))


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def source_zip(destination):
    files = []
    for folder in ('backend', 'frontend', 'docs', 'scripts'):
        for current, dirs, names in os.walk(ROOT / folder):
            dirs[:] = sorted(d for d in dirs if d not in BLOCKED and not (Path(current) / d).is_symlink())
            for name in sorted(names):
                path = Path(current) / name
                if source_allowed(path.relative_to(ROOT)) and not path.is_symlink():
                    files.append(path)
    files.extend(ROOT / name for name in ('.gitignore', 'README.md'))
    with zipfile.ZipFile(destination, 'x', zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            archive.write(path, path.relative_to(ROOT).as_posix())
    return len(files)


def export_local_data(folder, pg_bin):
    sys.path.insert(0, str(ROOT / 'backend'))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'gravetrak_backend.settings')
    import django
    django.setup()
    from django.conf import settings
    from django.db import connection, transaction
    from django.db.migrations.executor import MigrationExecutor
    from api.models import BurialDocument

    config = connection.settings_dict
    if (connection.vendor != 'postgresql' or config['NAME'] != 'gravetrak_dev'
            or config['HOST'] not in ('127.0.0.1', 'localhost', '::1')):
        raise RuntimeError('Only local PostgreSQL gravetrak_dev can be exported by this helper.')
    if settings.STORAGES['default']['BACKEND'] != 'django.core.files.storage.FileSystemStorage':
        raise RuntimeError('Run the exporter in the local filesystem-storage environment.')
    dump = folder / 'database.dump'
    suffix = '.exe' if os.name == 'nt' else ''
    pg_dump, pg_restore = (pg_bin / (name + suffix) for name in ('pg_dump', 'pg_restore'))
    if not pg_dump.is_file() or not pg_restore.is_file():
        raise RuntimeError('Set --pg-bin to the PostgreSQL client tools directory.')
    env = dict(os.environ, PGPASSWORD=str(config['PASSWORD']), PGCONNECT_TIMEOUT='10')
    counts = {}
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
            executor = MigrationExecutor(connection)
            if executor.migration_plan(executor.loader.graph.leaf_nodes()):
                raise RuntimeError('Local migrations are pending; review them before exporting.')
            cursor.execute('SELECT pg_export_snapshot()')
            snapshot = cursor.fetchone()[0]
            for table in sorted(connection.introspection.table_names()):
                cursor.execute('SELECT COUNT(*) FROM ' + connection.ops.quote_name(table))
                counts[table] = cursor.fetchone()[0]
            documents = list(BurialDocument.objects.order_by('id').values_list('id', 'document_file'))
            command = [str(pg_dump), '--host', config['HOST'], '--port', str(config['PORT']),
                       '--username', config['USER'], '--dbname', config['NAME'],
                       '--format=custom', '--no-owner', '--no-acl', '--schema=public',
                       '--snapshot', snapshot, '--file', str(dump)]
            subprocess.run(command, env=env, check=True, capture_output=True)
    # Verify archive structure and decompress all entries without connecting to any DB.
    toc = subprocess.run([str(pg_restore), '--list', str(dump)], check=True,
                         capture_output=True, text=True).stdout
    subprocess.run([str(pg_restore), '--file', os.devnull, str(dump)], check=True, capture_output=True)
    # Supabase already owns its public schema; retain all application tables/sequences.
    restore_list = '\n'.join(line for line in toc.splitlines()
                             if ' SCHEMA - public ' not in line and ' COMMENT - SCHEMA public ' not in line)
    (folder / 'restore.list').write_text(restore_list + '\n', encoding='utf-8')
    files, missing = [], []
    media_root = settings.MEDIA_ROOT.resolve()
    with zipfile.ZipFile(folder / 'media-private.zip', 'x', zipfile.ZIP_DEFLATED) as archive:
        seen = set()
        for pk, name in documents:
            if not name:
                missing.append({'document_id': pk, 'reason': 'empty file reference'})
                continue
            relative = Path(name)
            path = (media_root / relative).resolve()
            if relative.is_absolute() or not path.is_relative_to(media_root):
                raise RuntimeError('Unsafe document path; no files outside MEDIA_ROOT may be exported.')
            if not path.is_file():
                missing.append({'document_id': pk, 'path': name, 'reason': 'file missing locally'})
                continue
            if name in seen:
                continue
            seen.add(name)
            checksum = digest(path)
            archive.write(path, relative.as_posix())
            if digest(path) != checksum:
                raise RuntimeError('A document changed during export; retry when local uploads are paused.')
            files.append({'path': relative.as_posix(), 'bytes': path.stat().st_size, 'sha256': checksum})
    connection.close()
    manifest = dict(created_utc=datetime.now(timezone.utc).isoformat(),
                    source='local PostgreSQL gravetrak_dev; read-only snapshot',
                    tables=counts, files=files, missing_files=missing,
                    database_sha256=digest(dump), media_zip_sha256=digest(folder / 'media-private.zip'),
                    warning='PRIVATE: contains personal records, password hashes and authentication data. Never commit or publish.')
    (folder / 'manifest-private.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return {'tables': counts, 'media_files': len(files), 'missing_files': len(missing)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--with-local-data', action='store_true')
    parser.add_argument('--pg-bin', type=Path, default=Path('C:/Program Files/PostgreSQL/17/bin'))
    args = parser.parse_args()
    folder = ROOT / '.tmp' / 'render-handoff' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    folder.mkdir(parents=True, exist_ok=False)
    count = source_zip(folder / 'source-code.zip')
    result = {'folder': str(folder), 'source_files': count}
    if args.with_local_data:
        private = folder / 'PRIVATE-data-do-not-upload-to-git'
        private.mkdir()
        result.update(export_local_data(private, args.pg_bin))
    (folder / 'COMPLETE.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError:
        raise SystemExit('PostgreSQL tool failed. Package is incomplete; no source DB writes were performed.')
