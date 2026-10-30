"""Upload a prepared private media archive to Supabase. Default is read-only preflight."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from gravetrak_backend.storage_config import media_storage


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load_files(package):
    manifest = json.loads((package / 'manifest-private.json').read_text(encoding='utf-8'))
    if manifest['missing_files']:
        raise ValueError('Local files are missing. Resolve manifest entries before uploading.')
    archive = package / 'media-private.zip'
    if sha(archive.read_bytes()) != manifest['media_zip_sha256']:
        raise ValueError('Media archive checksum mismatch.')
    result = {}
    with zipfile.ZipFile(archive) as zipped:
        for item in manifest['files']:
            key = item['path']
            path = PurePosixPath(key)
            if path.is_absolute() or '..' in path.parts or '\\' in key or path.as_posix() != key or key in result:
                raise ValueError('Unsafe or duplicate media key in manifest.')
            data = zipped.read(key)
            if len(data) != item['bytes'] or sha(data) != item['sha256']:
                raise ValueError('Media file checksum mismatch.')
            result[key] = data
    return result


def transfer(client, bucket, files, apply=False):
    from botocore.exceptions import ClientError
    import mimetypes
    pending = []
    for key, data in files.items():
        try:
            remote = client.get_object(Bucket=bucket, Key=key)['Body']
        except ClientError as error:
            code = str(error.response.get('Error', {}).get('Code', '')).strip()
            status = error.response.get('ResponseMetadata', {}).get('HTTPStatusCode')
            if code not in ('NoSuchKey', '404', 'NotFound') and status != 404:
                raise
            pending.append(key)
            continue
        try:
            if sha(remote.read(len(data) + 1)) != sha(data):
                raise ValueError('An existing object has different contents; nothing will be overwritten.')
        finally:
            remote.close()
    # Finish checking every existing key before writing any new objects.
    if apply:
        for key in pending:
            client.put_object(Bucket=bucket, Key=key, Body=files[key],
                              ContentType=mimetypes.guess_type(key)[0] or 'application/octet-stream',
                              CacheControl='private, no-store')
            body = client.get_object(Bucket=bucket, Key=key)['Body']
            try:
                if sha(body.read(len(files[key]) + 1)) != sha(files[key]):
                    raise ValueError('Uploaded object failed read-back verification.')
            finally:
                body.close()
    return {'total': len(files), 'already_matching': len(files) - len(pending),
            'to_upload': 0 if apply else len(pending), 'uploaded_and_verified': len(pending) if apply else 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path, help='PRIVATE-data-do-not-upload-to-git directory')
    parser.add_argument('--bucket', required=True, help='Explicitly confirm the destination bucket name')
    parser.add_argument('--apply', action='store_true', help='Upload missing objects after preflight')
    args = parser.parse_args()
    secret_file = Path(__file__).resolve().parents[1] / '.tmp/supabase-demo/storage-private.json'
    if not secret_file.is_file():
        raise ValueError('Run scripts/configure-supabase-storage.ps1 first.')
    storage_env = json.loads(secret_file.read_text(encoding='utf-8-sig'))
    if storage_env.get('purpose') != 'new-private-supabase-demo-bucket':
        raise ValueError('Storage settings are not confirmed for the new demo project.')
    env = dict(os.environ)
    env.update({key: storage_env[value] for key, value in {
        'DJANGO_MEDIA_STORAGE': 'storage_mode', 'SUPABASE_S3_ENDPOINT_URL': 'endpoint_url',
        'SUPABASE_S3_REGION': 'region', 'SUPABASE_S3_BUCKET': 'bucket',
        'SUPABASE_S3_ACCESS_KEY_ID': 'access_key_id',
        'SUPABASE_S3_SECRET_ACCESS_KEY': 'secret_access_key',
    }.items()})
    options = media_storage(env)['OPTIONS']
    if args.bucket != options['bucket_name']:
        raise ValueError('Confirmed bucket does not match the environment configuration.')
    files = load_files(args.package)
    import boto3
    client = boto3.client('s3', endpoint_url=options['endpoint_url'], region_name=options['region_name'],
                          aws_access_key_id=options['access_key'], aws_secret_access_key=options['secret_key'],
                          config=options['client_config'])
    # Confirm S3 credentials and the named bucket before interpreting an empty
    # 404 from Supabase GET as a missing object.
    available_buckets = {item['Name'] for item in client.list_buckets().get('Buckets', [])}
    if args.bucket not in available_buckets:
        raise ValueError('S3 is reachable, but the expected private bucket is not visible to these credentials.')
    print(json.dumps(transfer(client, args.bucket, files, args.apply), indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never echo signed URLs, credentials or provider response bodies.
        try:
            from botocore.exceptions import ClientError
            if isinstance(error, ClientError):
                response = error.response
                code = str(response.get('Error', {}).get('Code', 'Unknown'))[:48]
                status = response.get('ResponseMetadata', {}).get('HTTPStatusCode')
                message = str(response.get('Error', {}).get('Message', ''))[:160]
                print(json.dumps({'storage_operation': 'failed', 'error_code': code,
                                  'http_status': status, 'provider_message': message,
                                  'next_step': 'Check S3 protocol, exact project endpoint/region, active S3 key pair, and private bucket name.'}))
                raise SystemExit(1)
        except ImportError:
            pass
        if isinstance(error, ValueError):
            raise SystemExit(str(error))
        raise SystemExit('Storage operation failed (' + type(error).__name__ + '). Check endpoint, bucket and backend S3 credentials.')
