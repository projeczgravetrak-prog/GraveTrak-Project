"""One-time restore into an explicitly selected, empty Supabase demo project."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess

from prepare_render_handoff import digest

ROOT = Path(__file__).resolve().parents[1]


def load_config(project_ref):
    config = json.loads((ROOT / '.tmp/supabase-demo/connection-private.json').read_text(encoding='utf-8-sig'))
    if (config.get('purpose') != 'new-empty-supabase-demo'
            or not re.fullmatch(r'[a-z0-9]+', project_ref)
            or config.get('user') != 'postgres.' + project_ref
            or not re.fullmatch(r'[a-zA-Z0-9.-]+\.pooler\.supabase\.com', config.get('host', ''))
            or config.get('database') != 'postgres' or config.get('port') != 5432
            or config.get('sslmode') != 'require'):
        raise ValueError('Destination does not match the explicitly confirmed demo project.')
    return config


def connect(config):
    import psycopg
    connection = psycopg.connect(host=config['host'], port=config['port'],
        dbname=config['database'], user=config['user'], password=config['password'],
        sslmode='require', connect_timeout=15)
    connection.read_only = True
    return connection


def main():
    from psycopg import sql
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('--project-ref', required=True)
    parser.add_argument('--data-api-disabled', action='store_true')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--pg-bin', type=Path, default=Path('C:/Program Files/PostgreSQL/17/bin'))
    args = parser.parse_args()
    config = load_config(args.project_ref)
    if not args.data_api_disabled:
        raise ValueError('Confirm Data API is disabled in the new project before restoring Django tables.')
    package = args.package.resolve()
    manifest = json.loads((package / 'manifest-private.json').read_text(encoding='utf-8'))
    if manifest['missing_files']:
        raise ValueError('The package has missing document files; resolve before restore.')
    dump = package / 'database.dump'
    if digest(dump) != manifest['database_sha256']:
        raise ValueError('Database dump checksum mismatch.')
    expected = manifest['tables']
    if not expected or any(not re.fullmatch(r'(api|auth|authtoken|django)_[a-z0-9_]+', name) for name in expected):
        raise ValueError('Unexpected source tables; review package.')
    executable = args.pg_bin / ('pg_restore.exe' if os.name == 'nt' else 'pg_restore')
    toc = subprocess.run([str(executable), '--list', str(dump)], check=True,
                         capture_output=True, text=True).stdout
    lines = [line for line in toc.splitlines()
             if ' SCHEMA - public ' not in line and ' COMMENT - SCHEMA public ' not in line]
    # Rebuild the selection from the verified archive, not an editable external list.
    selection = ROOT / '.tmp/supabase-demo/verified-restore.list'
    selection.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    with connect(config) as connection, connection.cursor() as cursor:
        cursor.execute('SET LOCAL statement_timeout = 15000')
        cursor.execute("SELECT current_setting('server_version_num')::integer")
        version = cursor.fetchone()[0]
        if version < 170000:
            raise ValueError('Destination PostgreSQL is older than the source major version.')
        cursor.execute("SELECT relname FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid "
                       "WHERE n.nspname='public' AND relkind IN ('r','p','v','m','S','f')")
        if cursor.fetchall():
            raise ValueError('Destination public schema is not empty. Restore refused; nothing was overwritten.')
        cursor.execute("SELECT public FROM storage.buckets WHERE id='gravetrak-documents'")
        bucket = cursor.fetchone()
        if bucket is None or bucket[0]:
            raise ValueError('Expected private gravetrak-documents bucket is missing or public.')
    print(json.dumps({'preflight': 'passed', 'project_ref': args.project_ref,
                      'source_tables': len(expected), 'apply': args.apply}), flush=True)
    if not args.apply:
        return
    # No --clean or role/schema deletion. Any SQL error rolls back the complete import.
    env = dict(os.environ, PGHOST=config['host'], PGPORT=str(config['port']),
               PGUSER=config['user'], PGDATABASE=config['database'],
               PGPASSWORD=config['password'], PGSSLMODE='require', PGCONNECT_TIMEOUT='15')
    env.pop('PGOPTIONS', None)
    result = subprocess.run([str(executable), '--no-owner', '--no-acl', '--exit-on-error',
                             '--single-transaction', '--use-list', str(selection),
                             '--dbname', config['database'], str(dump)], env=env,
                            capture_output=True, text=True)
    if result.returncode:
        # Retain details locally for diagnosis; never print rows/credentials to the transcript.
        (ROOT / '.tmp/supabase-demo/restore-error-private.log').write_text(
            result.stderr, encoding='utf-8')
        raise ValueError('Restore failed; inspect the private error log. No automatic cleanup or retry was attempted.')
    actual = {}
    with connect(config) as connection, connection.cursor() as cursor:
        cursor.execute('SET LOCAL statement_timeout = 15000')
        for table in expected:
            cursor.execute(sql.SQL('SELECT COUNT(*) FROM {}.{}').format(sql.Identifier('public'), sql.Identifier(table)))
            actual[table] = cursor.fetchone()[0]
        cursor.execute('SELECT document_file FROM public.api_burialdocument ORDER BY id')
        document_keys = {row[0] for row in cursor.fetchall()}
    report = {'project_ref': args.project_ref, 'restored': True,
              'all_table_counts_match': actual == expected, 'table_counts': actual,
              'document_keys_match_media_manifest': document_keys == {f['path'] for f in manifest['files']},
              'package': str(package), 'source_database_sha256': manifest['database_sha256'],
              'media_uploaded': False}
    (ROOT / '.tmp/supabase-demo/restore-verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))
    if not report['all_table_counts_match'] or not report['document_keys_match_media_manifest']:
        raise ValueError('Restore committed but verification differs. Stop and investigate; do not delete or repeat restore.')


if __name__ == '__main__':
    try:
        main()
    except ValueError as error:
        raise SystemExit(str(error))
    except Exception as error:
        raise SystemExit('Restore check failed (' + type(error).__name__ + '); no credentials printed.')
