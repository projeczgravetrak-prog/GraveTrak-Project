import io
from pathlib import Path
import unittest

from botocore.exceptions import ClientError
from prepare_render_handoff import source_allowed
from upload_demo_media import transfer


class FakeS3:
    def __init__(self, objects=None):
        self.objects = dict(objects or {})
        self.writes = []

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise ClientError({'Error': {'Code': 'NoSuchKey'}}, 'GetObject')
        return {'Body': io.BytesIO(self.objects[Key])}

    def put_object(self, **options):
        self.writes.append(options['Key'])
        self.objects[options['Key']] = options['Body']


class HandoffTests(unittest.TestCase):
    def test_source_package_excludes_private_data_and_dependencies(self):
        for name in ('backend/.env.email', 'frontend/.env', 'backend/media/private.pdf',
                     'backend/db.sqlite3', 'frontend/node_modules/module/index.js',
                     'frontend/dist/index.html', '.tmp/backup.dump', 'backend/get_token.py',
                     'backend/api/__pycache__/models.pyc', 'backend/api/.env.production'):
            with self.subTest(name=name):
                self.assertFalse(source_allowed(Path(name)))
        for name in ('backend/api/migrations/0039_citizen_requests_and_cancellation.py',
                     'backend/.env.example', 'backend/.python-version',
                     'frontend/package-lock.json', 'frontend/src/pages/PublicMapPage.jsx',
                     'scripts/configure-supabase-storage.ps1', 'scripts/upload_demo_media.py',
                     'scripts/restore_supabase_demo.py'):
            self.assertTrue(source_allowed(Path(name)))

    def test_preflight_never_uploads_and_identical_files_are_skipped(self):
        client = FakeS3({'existing.pdf': b'existing'})
        result = transfer(client, 'private', {'existing.pdf': b'existing', 'new.pdf': b'new'})
        self.assertEqual(result['to_upload'], 1)
        self.assertEqual(result['already_matching'], 1)
        self.assertEqual(client.writes, [])

    def test_conflict_prevents_all_uploads_even_if_found_after_missing_key(self):
        client = FakeS3({'conflict.pdf': b'other content'})
        with self.assertRaises(ValueError):
            transfer(client, 'private', {'new.pdf': b'new', 'conflict.pdf': b'wanted'}, True)
        self.assertEqual(client.writes, [])

    def test_upload_verifies_contents_and_rerun_is_idempotent(self):
        client = FakeS3()
        files = {'burial_applications/file.pdf': b'%PDF-test'}
        self.assertEqual(transfer(client, 'private', files, True)['uploaded_and_verified'], 1)
        self.assertEqual(transfer(client, 'private', files, True)['already_matching'], 1)
        self.assertEqual(client.writes, list(files))

    def test_provider_access_errors_are_not_treated_as_missing_files(self):
        class Forbidden(FakeS3):
            def get_object(self, **kwargs):
                raise ClientError({'Error': {'Code': 'AccessDenied'}}, 'GetObject')
        client = Forbidden()
        with self.assertRaises(ClientError):
            transfer(client, 'private', {'file': b'data'}, True)
        self.assertEqual(client.writes, [])


if __name__ == '__main__':
    unittest.main()
