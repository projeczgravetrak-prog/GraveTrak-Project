"""Opt-in private S3-compatible media; local development keeps filesystem storage."""
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured


def media_storage(environ):
    mode = environ.get('DJANGO_MEDIA_STORAGE', 'filesystem').strip().lower()
    if mode == 'filesystem':
        return {'BACKEND': 'django.core.files.storage.FileSystemStorage'}
    if mode != 'supabase':
        raise ImproperlyConfigured('DJANGO_MEDIA_STORAGE must be filesystem or supabase.')
    names = ('SUPABASE_S3_ENDPOINT_URL', 'SUPABASE_S3_REGION', 'SUPABASE_S3_BUCKET',
             'SUPABASE_S3_ACCESS_KEY_ID', 'SUPABASE_S3_SECRET_ACCESS_KEY')
    missing = [name for name in names if not environ.get(name, '').strip()]
    if missing:
        raise ImproperlyConfigured('Missing cloud media settings: ' + ', '.join(missing))
    endpoint = environ['SUPABASE_S3_ENDPOINT_URL'].strip().rstrip('/')
    url = urlsplit(endpoint)
    if (url.scheme != 'https' or not url.hostname or url.username or url.password
            or url.query or url.fragment or not url.path.endswith('/storage/v1/s3')):
        raise ImproperlyConfigured('Use the HTTPS S3 endpoint from Supabase Storage settings.')
    from botocore.config import Config
    return {
        'BACKEND': 'storages.backends.s3.S3Storage',
        'OPTIONS': {
            'endpoint_url': endpoint,
            'region_name': environ['SUPABASE_S3_REGION'].strip(),
            'bucket_name': environ['SUPABASE_S3_BUCKET'].strip(),
            'access_key': environ['SUPABASE_S3_ACCESS_KEY_ID'],
            'secret_key': environ['SUPABASE_S3_SECRET_ACCESS_KEY'],
            'default_acl': None,
            'file_overwrite': False,
            'querystring_auth': True,
            'querystring_expire': 300,
            'custom_domain': None,
            'location': '',
            'max_memory_size': 5 * 1024 * 1024,
            'object_parameters': {'CacheControl': 'private, no-store'},
            'client_config': Config(
                signature_version='s3v4', s3={'addressing_style': 'path'},
                connect_timeout=5, read_timeout=30,
                retries={'mode': 'standard', 'max_attempts': 2},
                request_checksum_calculation='when_required',
                response_checksum_validation='when_required',
            ),
        },
    }
