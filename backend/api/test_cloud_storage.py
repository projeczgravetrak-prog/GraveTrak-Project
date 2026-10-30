from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from gravetrak_backend.storage_config import media_storage


class CloudStorageConfigurationTests(SimpleTestCase):
    def cloud_env(self):
        return dict(DJANGO_MEDIA_STORAGE='supabase',
                    SUPABASE_S3_ENDPOINT_URL='https://test.storage.supabase.co/storage/v1/s3',
                    SUPABASE_S3_REGION='ap-southeast-1', SUPABASE_S3_BUCKET='private-docs',
                    SUPABASE_S3_ACCESS_KEY_ID='test-only', SUPABASE_S3_SECRET_ACCESS_KEY='test-only')

    def test_local_storage_does_not_require_cloud_credentials(self):
        self.assertEqual(media_storage({})['BACKEND'], 'django.core.files.storage.FileSystemStorage')

    def test_missing_or_unsafe_configuration_fails_closed(self):
        for patch_values in ({'SUPABASE_S3_SECRET_ACCESS_KEY': ''},
                             {'SUPABASE_S3_ENDPOINT_URL': 'http://test/storage/v1/s3'},
                             {'SUPABASE_S3_ENDPOINT_URL': 'https://test/storage/v1/s3?secret=bad'},
                             {'DJANGO_MEDIA_STORAGE': 'typo'}):
            with self.subTest(patch_values=patch_values), self.assertRaises(ImproperlyConfigured):
                media_storage({**self.cloud_env(), **patch_values})

    def test_private_s3_settings_and_no_network_initialization(self):
        from storages.backends.s3 import S3Storage
        options = media_storage(self.cloud_env())['OPTIONS']
        storage = S3Storage(**options)
        self.assertFalse(storage.file_overwrite)
        self.assertIsNone(storage.default_acl)
        self.assertIsNone(storage.custom_domain)
        self.assertTrue(storage.querystring_auth)
        self.assertEqual(storage.location, '')
        self.assertEqual(storage.client_config.s3['addressing_style'], 'path')
        self.assertEqual(storage.client_config.signature_version, 's3v4')


class PathlessTestStorage(Storage):
    """Remote-storage contract: no filesystem path and no public document URL."""
    def __init__(self):
        self.objects = {}

    def _save(self, name, content):
        self.objects[name] = content.read()
        return name

    def _open(self, name, mode='rb'):
        return ContentFile(self.objects[name], name=name)

    def size(self, name):
        return len(self.objects[name])

    def exists(self, name):
        return name in self.objects

    def url(self, name):
        raise AssertionError('Document serializers must use the authenticated API.')


@override_settings(BREVO_EMAIL_ENABLED=False, PHILSMS_ENABLED=False, STORAGES={
    'default': {'BACKEND': 'api.test_cloud_storage.PathlessTestStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
})
class CloudDocumentAccessTests(APITestCase):
    def setUp(self):
        from .models import BurialApplication, BurialDocument, UserProfile
        self.owner = get_user_model().objects.create_user('cloud-document-owner')
        self.other = get_user_model().objects.create_user('cloud-document-other')
        self.office = get_user_model().objects.create_user('cloud-document-office')
        for user, role in ((self.owner, 'user'), (self.other, 'user'), (self.office, 'mayor')):
            UserProfile.objects.create(user=user, role=role)
        application = BurialApplication.objects.create(application_id='CLOUD-FIXTURE',
            submitted_by=self.owner, deceased_name='Fixture', deceased_date_of_death=timezone.localdate(),
            applicant_name='Fixture')
        self.document = BurialDocument.objects.create(application=application, document_type='other',
            document_file=SimpleUploadedFile('fixture.pdf', b'%PDF-fixture', content_type='application/pdf'))
        self.url = f'/api/burial-documents/{self.document.pk}/download/'

    def test_owner_and_office_can_stream_remote_file_after_db_reload(self):
        from .serializers import BurialDocumentSerializer
        self.document.refresh_from_db()
        self.assertEqual(BurialDocumentSerializer(self.document).data['document_file'], self.url)
        for user in (self.owner, self.office):
            self.client.force_authenticate(user)
            response = self.client.get(self.url)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(b''.join(response.streaming_content), b'%PDF-fixture')
            response.close()

    def test_other_account_and_anonymous_cannot_download_private_file(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.url).status_code, 401)
