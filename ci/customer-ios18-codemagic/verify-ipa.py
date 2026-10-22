#!/usr/bin/env python3
import datetime
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import zipfile

temp = Path(os.environ['CUSTOMER_CI_TEMP'])
work = temp / 'customer-ios18-work'
output = temp / 'customer-ios18-output'
ipas = list((work / 'export').glob('*.ipa'))
assert len(ipas) == 1, 'Expected one customer IPA'
inspection = work / 'ipa-inspection'
inspection.mkdir()
with zipfile.ZipFile(ipas[0]) as archive:
    for entry in archive.infolist():
        assert (inspection / entry.filename).resolve().is_relative_to(inspection.resolve()), 'Unexpected IPA path'
subprocess.run(['ditto', '-x', '-k', str(ipas[0]), str(inspection)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
apps = list((inspection / 'Payload').glob('*.app'))
assert len(apps) == 1, 'Expected one customer app'
app = apps[0]
info = plistlib.loads((app / 'Info.plist').read_bytes())
assert info['CFBundleIdentifier'] == 'uk.tyrerescue.customer', 'Wrong exported customer app'
assert info['CFBundleShortVersionString'] == '1.0.3' and info['CFBundleVersion'] == '18', 'Wrong customer version'
assert info.get('ITSAppUsesNonExemptEncryption') is False, 'Missing encryption declaration'
for permission in ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSLocationWhenInUseUsageDescription']:
    assert info.get(permission), 'Missing customer permission description'
assert not info.get('NSMicrophoneUsageDescription'), 'Unexpected microphone permission'
assert any('tyrerescue' in item.get('CFBundleURLSchemes', []) for item in info.get('CFBundleURLTypes', [])), 'Missing customer/Stripe return scheme'
assert not list(app.glob('PlugIns/*.appex')), 'Unexpected extension signing scope'
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
entitlements = plistlib.loads(subprocess.check_output(['codesign', '-d', '--entitlements', ':-', str(app)], stderr=subprocess.DEVNULL))
assert entitlements.get('application-identifier') == 'BXK52CMHR2.uk.tyrerescue.customer', 'Wrong signed customer identity'
assert entitlements.get('com.apple.developer.team-identifier') == 'BXK52CMHR2', 'Wrong signed team'
assert entitlements.get('aps-environment') == 'production' and not entitlements.get('get-task-allow'), 'Production APNs/distribution signing required'
profile = plistlib.loads(subprocess.check_output(['security', 'cms', '-D', '-i', str(app / 'embedded.mobileprovision')], stderr=subprocess.DEVNULL))
assert profile['Entitlements']['application-identifier'] == 'BXK52CMHR2.uk.tyrerescue.customer', 'Wrong embedded customer profile'
assert profile['Entitlements'].get('aps-environment') == 'production' and profile['Entitlements'].get('get-task-allow') is False, 'Invalid customer profile entitlement'
assert not profile.get('ProvisionedDevices') and not profile.get('ProvisionsAllDevices'), 'App Store distribution required'
assert profile['ExpirationDate'] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None), 'Expired customer profile'
architecture = subprocess.check_output(['lipo', '-archs', str(app / info['CFBundleExecutable'])], text=True).strip()
assert architecture == 'arm64', 'Unexpected customer architecture'
bundle = (app / 'main.jsbundle').read_bytes()
assert len(bundle) > 100000 and bundle[:8] == bytes.fromhex('c61fbc03c103191f'), 'Production Hermes bundle required'
bundle_text = bundle.decode('utf8', errors='ignore') + '\n' + bundle.decode('utf-16-le', errors='ignore')
required_ui_markers = ['https://www.tyrerescue.uk', 'Is this where you need us?', 'Yes, use this location', 'GPS accuracy', 'Review & confirm booking', 'Check booking confirmation', 'Chat with us', 'Call me back']
assert all(marker in bundle_text for marker in required_ui_markers), 'Reviewed customer GPS/payment/chat markers missing'
assert not re.search(r'\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b|\bwhsec_[A-Za-z0-9]{16,}|-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----|\bsk\.[A-Za-z0-9_-]{20,}\.', bundle_text), 'Private literal in customer bundle'
public_mapbox = os.environ.get('EXPO_PUBLIC_MAPBOX_TOKEN', '')
public_stripe = os.environ.get('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY', '')
assert public_mapbox.startswith('pk.') and public_mapbox in bundle_text, 'Configured public map token missing'
assert re.fullmatch(r'pk_live_[A-Za-z0-9]+', public_stripe) and public_stripe in bundle_text, 'Configured live Stripe publishable key missing'
assert not list(app.rglob('*.p12')) and not list(app.rglob('*.p8')) and not list(app.rglob('.env*')), 'Private source in customer IPA'
destination = output / 'tyre-rescue-1.0.3-18.ipa'
shutil.copyfile(ipas[0], destination)
manifest = {'version': '1.0.3', 'buildNumber': '18', 'bundleIdentifier': 'uk.tyrerescue.customer', 'teamId': 'BXK52CMHR2', 'sourceManifestSha256': 'd10c66d4e64f4f7a110eee8019e64fab8784692a26dd04bec619048e2d2d8047', 'ipaSha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'ipaBytes': destination.stat().st_size, 'architecture': architecture, 'hermesBundleSha256': hashlib.sha256(bundle).hexdigest(), 'uiMarkersVerified': required_ui_markers, 'customerGpsConfirmationPresent': True, 'customerPaymentConfirmationGuardPresent': True, 'customerChatPresent': True, 'configuredPublicMapboxTokenPresent': True, 'configuredLiveStripePublishableKeyPresent': True, 'privateBundleLiteralsAbsent': True, 'productionAPNs': True, 'signatureVerified': True, 'appStoreDistributionProfile': True, 'xcodeVersion': '26.2', 'xcodeBuild': '17C52', 'iOSSdk': '26.2', 'runner': 'mac_mini_m2', 'repository': 'ahmadalwakai/tyrerescue', 'commit': subprocess.check_output(['git', '-C', os.environ['CM_BUILD_DIR'], 'rev-parse', 'HEAD'], text=True).strip(), 'runId': os.environ.get('CM_BUILD_ID'), 'testFlightUploadPerformed': False, 'appStoreReviewRequested': False}
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({key: manifest[key] for key in ['version', 'buildNumber', 'bundleIdentifier', 'ipaSha256', 'ipaBytes', 'productionAPNs', 'signatureVerified']}))
