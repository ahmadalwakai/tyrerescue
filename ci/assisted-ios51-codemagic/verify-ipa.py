#!/usr/bin/env python3
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import zipfile

temp = Path(os.environ['ASSISTED_CI_TEMP'])
work = temp / 'assisted-ios51-work'
output = temp / 'assisted-ios51-output'
ipas = list((work / 'export').glob('*.ipa'))
assert len(ipas) == 1, 'Expected exactly one IPA'
inspection = work / 'ipa-inspection'
inspection.mkdir()
with zipfile.ZipFile(ipas[0]) as archive:
    for entry in archive.infolist():
        target = (inspection / entry.filename).resolve()
        assert target.is_relative_to(inspection.resolve()), 'Unexpected IPA path'
# ditto preserves executable modes and framework metadata needed by codesign.
subprocess.run(['ditto', '-x', '-k', str(ipas[0]), str(inspection)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
apps = list((inspection / 'Payload').glob('*.app'))
assert len(apps) == 1, 'Expected exactly one application'
app = apps[0]
info = plistlib.loads((app / 'Info.plist').read_bytes())
assert info['CFBundleIdentifier'] == 'uk.tyrerescue.assistedchat', 'Wrong exported application'
assert info['CFBundleShortVersionString'] == '1.0.12' and info['CFBundleVersion'] == '51', 'Wrong exported version'
assert info.get('ITSAppUsesNonExemptEncryption') is False, 'Missing encryption export declaration'
for permission in ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSFaceIDUsageDescription']:
    assert info.get(permission), 'Missing required permission description'
assert not list(app.glob('PlugIns/*.appex')), 'Unexpected extension signing scope'
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
ent = subprocess.check_output(['codesign', '-d', '--entitlements', ':-', str(app)], stderr=subprocess.DEVNULL)
entitlements = plistlib.loads(ent)
assert entitlements.get('application-identifier') == 'BXK52CMHR2.uk.tyrerescue.assistedchat', 'Wrong signed app identifier'
assert entitlements.get('com.apple.developer.team-identifier') == 'BXK52CMHR2', 'Wrong signed team'
assert entitlements.get('aps-environment') == 'production', 'Production push entitlement is missing'
assert not entitlements.get('get-task-allow'), 'Debug signing is prohibited'
profile = plistlib.loads(subprocess.check_output(['security', 'cms', '-D', '-i', str(app / 'embedded.mobileprovision')], stderr=subprocess.DEVNULL))
assert profile['Entitlements']['application-identifier'] == 'BXK52CMHR2.uk.tyrerescue.assistedchat', 'Wrong embedded profile'
assert not profile.get('ProvisionedDevices') and not profile.get('ProvisionsAllDevices'), 'Not App Store distribution'
architecture = subprocess.check_output(['lipo', '-archs', str(app / info['CFBundleExecutable'])], text=True).strip()
assert architecture == 'arm64', 'Unexpected device architecture'
assert (app / 'main.jsbundle').is_file() and (app / 'main.jsbundle').stat().st_size > 100000, 'Release JavaScript bundle is missing'
bundle = (app / 'main.jsbundle').read_bytes()
bundle_text = bundle.decode('utf8', errors='ignore') + '\n' + bundle.decode('utf-16-le', errors='ignore')
required_ui_markers = ['https://www.tyrerescue.uk', 'assisted-chat-header-live-visitors-change', 'Visitor count changed.', 'assisted-chat-header-chat-hub-button', 'assisted-chat-header-profile-button', 'Opening conversation...', 'My account and settings', 'Copy coordinates', 'Coordinates copied.']
assert all(marker in bundle_text for marker in required_ui_markers), 'Expected production API or fixed UI markers are missing'
assert bundle[:8] == bytes.fromhex('c61fbc03c103191f'), 'Expected production Hermes bytecode'
import re
assert not re.search(r'\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b|\bwhsec_[A-Za-z0-9]{16,}|-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----|\bsk\.[A-Za-z0-9_-]{20,}\.', bundle_text), 'Private literal in shipped JavaScript'
public_mapbox_token = os.environ.get('EXPO_PUBLIC_MAPBOX_TOKEN', '')
assert public_mapbox_token.startswith('pk.') and public_mapbox_token in bundle_text, 'Expected configured public map token missing'
assert 'Choose a driver to start chatting' not in bundle_text, 'Duplicate chat launch card remains in shipped JavaScript'
for tone in ['urgent_booking.mp3', 'chat-send.wav', 'chat-receive.wav']:
    assert any(p.name == tone for p in app.rglob(tone)), 'A required notification/chat sound is missing'
assert not list(app.rglob('*.p12')) and not list(app.rglob('*.p8')) and not list(app.rglob('.env*')), 'Private source material in IPA'
destination = output / 'assisted-chat-1.0.12-51.ipa'
shutil.copyfile(ipas[0], destination)
manifest = {'version': '1.0.12', 'buildNumber': '51', 'bundleIdentifier': 'uk.tyrerescue.assistedchat', 'teamId': 'BXK52CMHR2', 'sourceManifestSha256': '00d540c1ac793f9fe580c1aba28863229e7f212e0a3a72bf8fe163e8bfa1e92d', 'ipaSha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'ipaBytes': destination.stat().st_size, 'architecture': architecture, 'hermesBundleSha256': hashlib.sha256(bundle).hexdigest(), 'uiMarkersVerified': required_ui_markers, 'duplicateChatLaunchCardAbsent': True, 'configuredPublicMapboxTokenPresent': True, 'privateBundleLiteralsAbsent': True, 'productionAPNs': True, 'signatureVerified': True, 'appStoreDistributionProfile': True, 'xcodeVersion': '26.2', 'xcodeBuild': '17C52', 'iOSSdk': '26.2', 'runner': 'mac_mini_m2', 'repository': 'ahmadalwakai/tyrerescue', 'commit': subprocess.check_output(['git', '-C', os.environ['CM_BUILD_DIR'], 'rev-parse', 'HEAD'], text=True).strip(), 'runId': os.environ.get('CM_BUILD_ID'), 'testFlightUploadPerformed': False, 'appStoreReviewRequested': False}
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({key: manifest[key] for key in ['version', 'buildNumber', 'bundleIdentifier', 'ipaSha256', 'ipaBytes', 'productionAPNs', 'signatureVerified']}))
