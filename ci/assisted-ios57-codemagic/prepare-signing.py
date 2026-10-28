#!/usr/bin/env python3
"""Validate only the existing Assisted Chat signing files; never contact Apple."""
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess

signing = Path(os.environ['ASSISTED_CI_TEMP']) / 'assisted-ios57-signing'
signing.mkdir(mode=0o700, exist_ok=False)
for variable, filename in [('ASSISTED_IOS_P12_BASE64', 'distribution.p12'), ('ASSISTED_IOS_PROFILE_BASE64', 'profile.mobileprovision')]:
    raw = os.environ.get(variable, '')
    if not raw:
        raise RuntimeError('A required existing app signing secret is unavailable')
    (signing / filename).write_bytes(base64.b64decode(raw, validate=True))
password = os.environ.get('ASSISTED_IOS_P12_PASSWORD')
if password is None:
    raise RuntimeError('The existing certificate password is unavailable')
profile_xml = subprocess.check_output(['security', 'cms', '-D', '-i', str(signing / 'profile.mobileprovision')], stderr=subprocess.DEVNULL)
profile = plistlib.loads(profile_xml)
entitlements = profile.get('Entitlements', {})
bundle = 'uk.tyrerescue.assistedchat'
team = 'BXK52CMHR2'
assert profile.get('TeamIdentifier') == [team], 'Wrong signing team'
assert entitlements.get('application-identifier') == team + '.' + bundle, 'Wrong profile application'
assert entitlements.get('com.apple.developer.team-identifier') == team, 'Wrong profile entitlement team'
assert entitlements.get('aps-environment') == 'production', 'The profile does not permit production push notifications'
assert entitlements.get('get-task-allow') is False, 'A development profile cannot be used'
assert not profile.get('ProvisionedDevices') and not profile.get('ProvisionsAllDevices'), 'An App Store distribution profile is required'
assert profile['ExpirationDate'] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + datetime.timedelta(days=1), 'The existing profile is expired or expires too soon'
uuid = profile['UUID']
assert re.fullmatch(r'[0-9A-Fa-f-]{36}', uuid), 'Invalid profile UUID'
assert isinstance(profile.get('Name'), str) and profile['Name'], 'Invalid profile name'
args = ['openssl', 'pkcs12', '-in', str(signing / 'distribution.p12'), '-clcerts', '-nokeys', '-passin', 'env:ASSISTED_IOS_P12_PASSWORD']
certificate = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
if certificate.returncode:
    certificate = subprocess.run(args + ['-legacy'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
assert certificate.returncode == 0, 'The existing certificate could not be read'
public_cert = signing / 'certificate.pem'
public_cert.write_bytes(certificate.stdout)
der = subprocess.check_output(['openssl', 'x509', '-in', str(public_cert), '-outform', 'DER'], stderr=subprocess.DEVNULL)
assert der in profile.get('DeveloperCertificates', []), 'The existing certificate does not match the existing profile'
assert subprocess.run(['openssl', 'x509', '-in', str(public_cert), '-checkend', '86400', '-noout'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0, 'The existing certificate is expired or expires too soon'
installed = Path.home() / 'Library' / 'MobileDevice' / 'Provisioning Profiles' / ('assisted-ios57-' + uuid + '.mobileprovision')
installed.parent.mkdir(parents=True, exist_ok=True)
assert not installed.exists(), 'Unexpected existing profile destination'
installed.write_bytes((signing / 'profile.mobileprovision').read_bytes())
(signing / 'installed-profile-path.txt').write_text(str(installed))
data = {'uuid': uuid, 'profileName': profile['Name'], 'certificateSha1': hashlib.sha1(der).hexdigest().upper(), 'team': team, 'bundle': bundle}
(signing / 'metadata.json').write_text(json.dumps(data))
(signing / 'keychain-password.txt').write_text(base64.b64encode(os.urandom(48)).decode())
print('Existing app-scoped certificate and production-push profile verified.')
