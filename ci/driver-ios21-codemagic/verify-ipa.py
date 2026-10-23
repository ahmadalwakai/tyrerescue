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

temp = Path(os.environ['DRIVER_CI_TEMP'])
work = temp / 'driver-ios21-work'
output = temp / 'driver-ios21-output'
ipas = list((work / 'export').glob('*.ipa'))
assert len(ipas) == 1, 'Expected one driver IPA'
inspection = work / 'ipa-inspection'
inspection.mkdir()
with zipfile.ZipFile(ipas[0]) as archive:
    for entry in archive.infolist():
        assert (inspection / entry.filename).resolve().is_relative_to(inspection.resolve()), 'Unexpected IPA path'
subprocess.run(['ditto', '-x', '-k', str(ipas[0]), str(inspection)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
apps = list((inspection / 'Payload').glob('*.app'))
assert len(apps) == 1, 'Expected one driver app'
app = apps[0]
info = plistlib.loads((app / 'Info.plist').read_bytes())
assert info['CFBundleIdentifier'] == 'uk.tyrerescue.driver', 'Wrong exported driver app'
assert info['CFBundleShortVersionString'] == '1.3.0' and info['CFBundleVersion'] == '21', 'Wrong driver version'
assert info.get('ITSAppUsesNonExemptEncryption') is False, 'Missing encryption declaration'
for permission in ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSPhotoLibraryUsageDescription',
                   'NSLocationWhenInUseUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription', 'NSFaceIDUsageDescription']:
    assert info.get(permission), 'Missing driver permission description'
assert {'location', 'remote-notification'}.issubset(info.get('UIBackgroundModes', [])), 'Missing driver background modes'
assert any('tyrerescuedriver' in item.get('CFBundleURLSchemes', []) for item in info.get('CFBundleURLTypes', [])), 'Missing driver return scheme'
assert not list(app.glob('PlugIns/*.appex')), 'Unexpected extension signing scope'
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
entitlements = plistlib.loads(subprocess.check_output(['codesign', '-d', '--entitlements', ':-', str(app)], stderr=subprocess.DEVNULL))
assert entitlements.get('application-identifier') == 'BXK52CMHR2.uk.tyrerescue.driver', 'Wrong signed driver identity'
assert entitlements.get('com.apple.developer.team-identifier') == 'BXK52CMHR2', 'Wrong signed team'
assert entitlements.get('aps-environment') == 'production' and not entitlements.get('get-task-allow'), 'Production APNs/distribution signing required'
profile = plistlib.loads(subprocess.check_output(['security', 'cms', '-D', '-i', str(app / 'embedded.mobileprovision')], stderr=subprocess.DEVNULL))
assert profile['Entitlements']['application-identifier'] == 'BXK52CMHR2.uk.tyrerescue.driver', 'Wrong embedded driver profile'
assert profile['Entitlements'].get('aps-environment') == 'production' and profile['Entitlements'].get('get-task-allow') is False, 'Invalid driver profile entitlement'
assert not profile.get('ProvisionedDevices') and not profile.get('ProvisionsAllDevices'), 'App Store distribution required'
assert profile['ExpirationDate'] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None), 'Expired driver profile'
architecture = subprocess.check_output(['lipo', '-archs', str(app / info['CFBundleExecutable'])], text=True).strip()
assert architecture == 'arm64', 'Unexpected driver architecture'
bundle = (app / 'main.jsbundle').read_bytes()
assert len(bundle) > 100000 and bundle[:8] == bytes.fromhex('c61fbc03c103191f'), 'Production Hermes bundle required'
bundle_text = bundle.decode('utf8', errors='ignore') + '\n' + bundle.decode('utf-16-le', errors='ignore')
required_markers = ['https://www.tyrerescue.uk', 'background-location-task', 'uk.tyrerescue.driver.background.v2',
                    '2026-10-23 driver-1.3 background-keychain mapkit-heading reroute-recovery',
                    'wrong-way', 'While Online, dispatch location sharing continues behind this privacy screen. Going Offline or signing out stops it.']
assert all(marker in bundle_text for marker in required_markers), 'Reviewed driver background/navigation markers missing'
assert not re.search(r'\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b|\bwhsec_[A-Za-z0-9]{16,}|-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----|\bsk\.[A-Za-z0-9_-]{20,}\.', bundle_text), 'Private literal in driver bundle'
public_mapbox = os.environ.get('EXPO_PUBLIC_MAPBOX_TOKEN', '')
assert public_mapbox.startswith('pk.') and public_mapbox in bundle_text, 'Configured public Mapbox token missing'
assert not list(app.rglob('*.p12')) and not list(app.rglob('*.p8')) and not list(app.rglob('.env*')), 'Private source in driver IPA'

destination = output / 'tyre-rescue-driver-1.3.0-21.ipa'
shutil.copyfile(ipas[0], destination)
manifest = {'version': '1.3.0', 'buildNumber': '21', 'bundleIdentifier': 'uk.tyrerescue.driver', 'ascAppId': '6784984848',
    'teamId': 'BXK52CMHR2', 'sourceManifestSha256': 'd958feb545e9c9dc58353619ecb2fd38b261b596179156a3966232e76ada6834',
    'ipaSha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'ipaBytes': destination.stat().st_size,
    'architecture': architecture, 'hermesBundleSha256': hashlib.sha256(bundle).hexdigest(), 'releaseMarkersVerified': required_markers,
    'backgroundLocationModePresent': True, 'faceIdPermissionPresent': True, 'keychainMigrationPresent': True,
    'publicMapboxTokenPresent': True, 'privateBundleLiteralsAbsent': True, 'productionAPNs': True,
    'signatureVerified': True, 'appStoreDistributionProfile': True, 'xcodeVersion': '26.2', 'xcodeBuild': '17C52',
    'iOSSdk': '26.2', 'runner': 'mac_mini_m2', 'repository': 'ahmadalwakai/tyrerescue',
    'commit': subprocess.check_output(['git', '-C', os.environ['CM_BUILD_DIR'], 'rev-parse', 'HEAD'], text=True).strip(),
    'runId': os.environ.get('CM_BUILD_ID'), 'testFlightUploadPerformed': False, 'appStoreReviewRequested': False}
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({key: manifest[key] for key in ['version', 'buildNumber', 'bundleIdentifier', 'ipaSha256', 'ipaBytes', 'productionAPNs', 'signatureVerified']}))
