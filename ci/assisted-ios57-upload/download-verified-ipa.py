#!/usr/bin/env python3
"""Download and verify the existing build 57 IPA without rebuilding or signing."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import sys
import time
import urllib.parse
import urllib.request
import wave
import zipfile

EXPECTED_BYTES = 17778996
EXPECTED_SHA256 = '76fb895a4f9b89fb85640f6fe81773bcc9e4bbd95a1cbb34fc09f64d5382288f'
EXPECTED_SOUND_SHA256 = '0479a7f42bbb815ba38f824c9b619fd70ace09ea381aa4c80ea692b723628ea2'
FILENAME = 'assisted-chat-1.0.13-57.ipa'


class VerificationError(Exception):
    pass


def check(condition, message):
    if not condition:
        raise VerificationError(message)


def safe_url(value):
    try:
        url = urllib.parse.urlsplit(value)
        port = url.port
        host = (url.hostname or '').lower()
    except (TypeError, ValueError):
        raise VerificationError('Invalid artifact download address') from None
    allowed = (host == 'codemagic.io' or host.endswith('.codemagic.io')
               or host == 'storage.googleapis.com' or host.endswith('.googleapis.com')
               or host.endswith('.amazonaws.com') or host.endswith('.cloudfront.net')
               or host.endswith('.r2.cloudflarestorage.com'))
    check(url.scheme == 'https' and allowed and port in (None, 443)
          and not url.username and not url.password and not url.fragment
          and not any(character.isspace() for character in value),
          'Artifact download address is not approved HTTPS')
    return value


class SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    max_repeats = 5
    max_redirections = 5

    def redirect_request(self, request, response, code, message, headers, new_url):
        return super().redirect_request(request, response, code, message, headers, safe_url(new_url))


def verify_existing_ipa(filename):
    check(filename.is_file() and filename.stat().st_size == EXPECTED_BYTES, 'IPA byte count does not match the inspected build')
    data = filename.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    check(digest == EXPECTED_SHA256, 'IPA SHA256 does not match the inspected build')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = archive.namelist()
        check(len(names) == len(set(names)), 'IPA contains duplicate entries')
        app_names = {PurePosixPath(name).parts[1] for name in names
                     if len(PurePosixPath(name).parts) >= 2
                     and PurePosixPath(name).parts[0] == 'Payload'
                     and PurePosixPath(name).parts[1].endswith('.app')}
        check(len(app_names) == 1, 'IPA must contain exactly one application')
        app_root = 'Payload/' + app_names.pop() + '/'
        info = plistlib.loads(archive.read(app_root + 'Info.plist'))
        check(info.get('CFBundleIdentifier') == 'uk.tyrerescue.assistedchat', 'Wrong IPA application identity')
        check(info.get('CFBundleShortVersionString') == '1.0.13' and info.get('CFBundleVersion') == '57', 'Wrong IPA version or build')
        check(info.get('ITSAppUsesNonExemptEncryption') is False, 'Missing inspected encryption declaration')
        sound_bytes = archive.read(app_root + 'assisted_notification.wav')
        check(hashlib.sha256(sound_bytes).hexdigest() == EXPECTED_SOUND_SHA256, 'Wrong external notification sound')
        with wave.open(io.BytesIO(sound_bytes), 'rb') as sound:
            check(sound.getcomptype() == 'NONE' and sound.getnchannels() == 1 and sound.getsampwidth() == 2
                  and sound.getframerate() == 44100 and sound.getnframes() == 308700,
                  'Notification sound must be exactly seven seconds of mono 44100 Hz PCM16')
    return {'verified': True, 'version': '1.0.13', 'buildNumber': '57',
            'bundleIdentifier': 'uk.tyrerescue.assistedchat', 'ipaBytes': EXPECTED_BYTES,
            'ipaSha256': digest, 'externalNotificationSoundSha256': EXPECTED_SOUND_SHA256,
            'externalNotificationSoundSeconds': 7, 'rebuilt': False, 'resigned': False}


def download_and_verify():
    root_value = os.environ.get('CM_BUILD_DIR', '')
    check(root_value and Path(root_value).is_dir(), 'Missing Codemagic checkout')
    check(os.environ.get('CM_TRIGGER_SOURCE') == 'api' and os.environ.get('CM_BUILD_ID'), 'Upload must be explicitly started through the API')
    url = safe_url(os.environ.pop('ASSISTED_IPA_URL', ''))
    output = Path(root_value).resolve() / 'verified-upload'
    check(not output.exists(), 'Upload artifact directory already exists')
    output.mkdir(mode=0o700)
    partial = output / 'build57.download'
    destination = output / FILENAME
    started = time.monotonic()
    opener = urllib.request.build_opener(SafeRedirectHandler())
    request = urllib.request.Request(url, headers={'Accept': 'application/octet-stream'})
    try:
        with opener.open(request, timeout=60) as response:
            check(response.status == 200, 'Artifact download was not successful')
            content_length = response.headers.get('Content-Length')
            check(content_length is None or content_length == str(EXPECTED_BYTES), 'Artifact response has the wrong byte count')
            downloaded = 0
            with partial.open('xb') as target:
                while True:
                    check(time.monotonic() - started < 180, 'Artifact download exceeded the time limit')
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    downloaded += len(chunk)
                    check(downloaded <= EXPECTED_BYTES, 'Artifact download exceeds the expected size')
                    target.write(chunk)
        result = verify_existing_ipa(partial)
        partial.rename(destination)
        print(json.dumps(result))
    finally:
        if partial.is_file():
            partial.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-existing', type=Path, help='Read-only local verification; performs no download or upload')
    args = parser.parse_args()
    if args.verify_existing is not None:
        print(json.dumps(verify_existing_ipa(args.verify_existing)))
    else:
        download_and_verify()


if __name__ == '__main__':
    try:
        main()
    except VerificationError as error:
        print(json.dumps({'verified': False, 'error': str(error)}), file=sys.stderr)
        sys.exit(1)
    except Exception:
        # Never print a URL, header, secret environment value, or raw transport error.
        print(json.dumps({'verified': False, 'error': 'Existing IPA download or inspection failed; no private details logged'}), file=sys.stderr)
        sys.exit(1)
