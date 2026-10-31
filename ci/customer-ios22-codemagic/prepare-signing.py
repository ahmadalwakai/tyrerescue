#!/usr/bin/env python3
"""Validate only the existing Tyre Rescue signing files; never contact Apple."""
import base64
import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import importlib.util

policy_spec = importlib.util.spec_from_file_location('customer_signing_policy', Path(__file__).with_name('signing-policy.py'))
policy = importlib.util.module_from_spec(policy_spec)
policy_spec.loader.exec_module(policy)

app = Path(os.environ['CM_BUILD_DIR']) / os.environ['CUSTOMER_APP_DIR']
projects = list((app / 'ios').glob('*.xcodeproj'))
assert len(projects) == 1, 'Expected exactly one native app project'
inspect_targets = "p = Xcodeproj::Project.open(ARGV.fetch(0)); puts JSON.generate(p.targets.map { |t| {name: t.name, productType: t.product_type, bundleIds: t.build_configurations.map { |c| c.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] }.uniq} })"
targets = json.loads(subprocess.check_output(['ruby', '-rjson', '-rxcodeproj', '-e', inspect_targets, str(projects[0])], stderr=subprocess.DEVNULL))
expected = policy.validate_targets(targets)

signing = Path(os.environ['CUSTOMER_CI_TEMP']) / 'customer-ios22-signing'
signing.mkdir(mode=0o700, exist_ok=False)
sources = [('CUSTOMER_IOS_P12_BASE64', 'distribution.p12'), ('CUSTOMER_IOS_PROFILE_BASE64', 'profile.mobileprovision')]
if policy.WIDGET_BUNDLE in expected:
    sources.append(('CUSTOMER_IOS_LIVE_ACTIVITY_PROFILE_BASE64', 'live-activity.mobileprovision'))
for variable, filename in sources:
    raw = os.environ.get(variable, '')
    if not raw:
        raise RuntimeError('A required signing secret is unavailable: ' + variable)
    (signing / filename).write_bytes(base64.b64decode(raw, validate=True))
password = os.environ.get('CUSTOMER_IOS_P12_PASSWORD')
if password is None:
    raise RuntimeError('The existing certificate password is unavailable')
merchant = os.environ.get('EXPO_PUBLIC_APPLE_MERCHANT_ID', '').strip()
assert not merchant, 'Customer build 22 is cards only; Apple Pay configuration must stay disabled'
args = ['openssl', 'pkcs12', '-in', str(signing / 'distribution.p12'), '-clcerts', '-nokeys', '-passin', 'env:CUSTOMER_IOS_P12_PASSWORD']
certificate = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
if certificate.returncode:
    certificate = subprocess.run(args + ['-legacy'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
assert certificate.returncode == 0, 'The existing certificate could not be read'
public_cert = signing / 'certificate.pem'
public_cert.write_bytes(certificate.stdout)
der = subprocess.check_output(['openssl', 'x509', '-in', str(public_cert), '-outform', 'DER'], stderr=subprocess.DEVNULL)
assert subprocess.run(['openssl', 'x509', '-in', str(public_cert), '-checkend', '86400', '-noout'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0, 'The existing certificate is expired or expires too soon'
profiles = {}
for bundle in expected:
    filename = 'profile.mobileprovision' if bundle == policy.APP_BUNDLE else 'live-activity.mobileprovision'
    profile_xml = subprocess.check_output(['security', 'cms', '-D', '-i', str(signing / filename)], stderr=subprocess.DEVNULL)
    profiles[bundle] = {**policy.validate_profile(plistlib.loads(profile_xml), bundle, der), 'filename': filename}
for entry in profiles.values():
    installed = Path.home() / 'Library' / 'MobileDevice' / 'Provisioning Profiles' / ('customer-ios22-' + entry['uuid'] + '.mobileprovision')
    installed.parent.mkdir(parents=True, exist_ok=True)
    assert not installed.exists(), 'Unexpected existing profile destination'
    installed.write_bytes((signing / entry['filename']).read_bytes())
    with (signing / 'installed-profile-paths.txt').open('a') as paths:
        paths.write(str(installed) + '\n')
data = {**profiles[policy.APP_BUNDLE], 'certificateSha1': hashlib.sha1(der).hexdigest().upper(), 'team': policy.TEAM, 'profiles': profiles}
(signing / 'metadata.json').write_text(json.dumps(data))
(signing / 'keychain-password.txt').write_text(base64.b64encode(os.urandom(48)).decode())
print('App-scoped certificate and all required target profiles verified.')
