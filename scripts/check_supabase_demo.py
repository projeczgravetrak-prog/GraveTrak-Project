"""Read-only preflight using a private local configuration. Never restore data."""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def main():
    import psycopg
    path = ROOT / '.tmp/supabase-demo/connection-private.json'
    if not path.is_file():
        raise SystemExit('Run scripts/configure-supabase-demo.ps1 first.')
    config = json.loads(path.read_text(encoding='utf-8-sig'))
    if (config.get('purpose') != 'new-empty-supabase-demo'
            or not re.fullmatch(r'[a-zA-Z0-9.-]+\.pooler\.supabase\.com', config.get('host', ''))
            or not re.fullmatch(r'postgres\.[a-z0-9]+', config.get('user', ''))
            or config.get('database') != 'postgres' or config.get('port') != 5432
            or config.get('sslmode') != 'require'):
        raise SystemExit('Unexpected destination configuration; review before connecting.')
    try:
        with psycopg.connect(host=config['host'], port=config['port'], dbname=config['database'],
                             user=config['user'], password=config['password'], sslmode='require',
                             connect_timeout=15, options='-c default_transaction_read_only=on -c statement_timeout=15000') as connection:
            # Session poolers may not forward startup options to PostgreSQL.
            # Set the transaction mode explicitly before running any query.
            connection.read_only = True
            with connection.cursor() as cursor:
                cursor.execute('SET LOCAL statement_timeout = 15000')
                cursor.execute("SELECT current_setting('server_version'), current_setting('transaction_read_only')")
                version, read_only = cursor.fetchone()
                cursor.execute("SELECT relname, relkind FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid "
                               "WHERE n.nspname='public' AND relkind IN ('r','p','v','m','S','f') ORDER BY relname")
                objects = cursor.fetchall()
                cursor.execute("SELECT EXISTS (SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl)")
                ssl = cursor.fetchone()[0]
                cursor.execute("SELECT name, public FROM storage.buckets WHERE id='gravetrak-documents'")
                bucket = cursor.fetchone()
                cursor.execute("SELECT COUNT(*) FROM storage.objects WHERE bucket_id='gravetrak-documents'")
                stored_objects = cursor.fetchone()[0]
        print(json.dumps({'connection': 'ok', 'project_ref': config['user'].split('.', 1)[1],
                          'postgres_version': version, 'read_only': read_only == 'on',
                          'client_to_pooler_ssl_required': True,
                          'pooler_to_postgres_ssl_reported': ssl, 'public_objects': objects,
                          'public_schema_has_no_relations': not objects,
                          'document_bucket_exists': bucket is not None,
                          'document_bucket_private': bucket is not None and not bucket[1],
                          'private_bucket_object_count': stored_objects}, indent=2))
    except psycopg.Error as error:
        # Provider messages can contain connection metadata. Keep secrets out of output.
        print(json.dumps({'connection': 'failed', 'error_type': type(error).__name__,
                          'sqlstate': error.sqlstate,
                          'next_step': 'Check host, full pooler username, database password, project readiness and network access.'}))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
