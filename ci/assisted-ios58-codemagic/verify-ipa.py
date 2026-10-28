#!/usr/bin/env python3
import hashlib
import io
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import wave
import zipfile

release_lock = json.loads((Path(__file__).resolve().parent / 'release-lock.json').read_text())
assert release_lock['version'] == '1.0.14' and release_lock['buildNumber'] == '58', 'Wrong finalized release'
assert release_lock['bundleIdentifier'] == 'uk.tyrerescue.assistedchat' and release_lock['teamId'] == 'BXK52CMHR2', 'Wrong finalized app identity'
temp = Path(os.environ['ASSISTED_CI_TEMP'])
work = temp / 'assisted-ios58-work'
output = temp / 'assisted-ios58-output'
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
assert info['CFBundleShortVersionString'] == '1.0.14' and info['CFBundleVersion'] == '58', 'Wrong exported version'
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
native_binary = (app / info['CFBundleExecutable']).read_bytes()
assert b'ExpoSecureStore' in native_binary, 'SecureStore native module is missing from the shipped executable'
assert (app / 'main.jsbundle').is_file() and (app / 'main.jsbundle').stat().st_size > 100000, 'Release JavaScript bundle is missing'
bundle = (app / 'main.jsbundle').read_bytes()
bundle_text = bundle.decode('utf8', errors='ignore') + '\n' + bundle.decode('utf-16-le', errors='ignore')
required_ui_markers = ['https://www.tyrerescue.uk', 'assisted-chat-header-live-visitors-change', 'Visitor count changed.', 'assisted-chat-header-chat-hub-button', 'assisted-chat-header-profile-button', 'Opening conversation...', 'My account and settings', 'Copy coordinates', 'Coordinates copied.']
required_ui_markers += ['assisted-chat-header-incoming-call', 'Returning customer', 'No previous bookings',
                        'History unavailable', 'Incoming caller history', 'Retry history check',
                        'Previous booking price', 'Not recorded', '/api/mobile/admin/phone/incoming-call',
                        '/api/mobile/admin/customers/match?phone=', 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY']
required_ui_markers += ['bonline-call-button', 'bonline-call-card', 'assisted-chat-header-caller-history', '/api/mobile/admin/phone/analytics', '/api/mobile/admin/phone/outbound']
required_ui_markers += ['When does the customer need us?', 'Call assistance', 'Review extracted details', 'Registered customers', 'First-time App Store downloads']
assert all(marker in bundle_text for marker in required_ui_markers), 'Expected production API or fixed UI markers are missing'
assert bundle[:8] == bytes.fromhex('c61fbc03c103191f'), 'Expected production Hermes bytecode'
import re
assert not re.search(r'\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b|\bwhsec_[A-Za-z0-9]{16,}|-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----|\bsk\.[A-Za-z0-9_-]{20,}\.', bundle_text), 'Private literal in shipped JavaScript'
public_mapbox_token = os.environ.get('EXPO_PUBLIC_MAPBOX_TOKEN', '')
assert public_mapbox_token.startswith('pk.') and public_mapbox_token in bundle_text, 'Expected configured public map token missing'
assert 'Choose a driver to start chatting' not in bundle_text, 'Duplicate chat launch card remains in shipped JavaScript'
for tone in ['urgent_booking.mp3', 'chat-send.wav', 'chat-receive.wav']:
    assert any(p.name == tone for p in app.rglob(tone)), 'A required notification/chat sound is missing'
notification_sound = app / 'assisted_notification.wav'
assert notification_sound.is_file(), 'External notification sound is missing from the main app bundle'
notification_sound_bytes = notification_sound.read_bytes()
notification_sound_sha256 = hashlib.sha256(notification_sound_bytes).hexdigest()
assert notification_sound_sha256 == '0479a7f42bbb815ba38f824c9b619fd70ace09ea381aa4c80ea692b723628ea2', 'External notification sound differs from selected source'
with wave.open(io.BytesIO(notification_sound_bytes), 'rb') as sound:
    assert sound.getcomptype() == 'NONE' and sound.getnchannels() == 1 and sound.getsampwidth() == 2, 'External notification sound must be mono PCM16'
    assert sound.getframerate() == 44100 and sound.getnframes() == 308700, 'External notification sound must be exactly seven seconds at 44100 Hz'
assert not list(app.rglob('*.p12')) and not list(app.rglob('*.p8')) and not list(app.rglob('.env*')), 'Private source material in IPA'
destination = output / 'assisted-chat-1.0.14-58.ipa'
shutil.copyfile(ipas[0], destination)
manifest = {'version': '1.0.14', 'buildNumber': '58', 'bundleIdentifier': 'uk.tyrerescue.assistedchat', 'teamId': 'BXK52CMHR2', 'sourceManifestSha256': release_lock['sourceManifestSha256'], 'ipaSha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'ipaBytes': destination.stat().st_size, 'architecture': architecture, 'hermesBundleSha256': hashlib.sha256(bundle).hexdigest(), 'uiMarkersVerified': required_ui_markers, 'duplicateChatLaunchCardAbsent': True, 'configuredPublicMapboxTokenPresent': True, 'privateBundleLiteralsAbsent': True, 'productionAPNs': True, 'nativeSecureStoreVerified': True, 'incomingCallerHistoryAndPriceVerified': True, 'nodeVersion': '24.22.1', 'signatureVerified': True, 'appStoreDistributionProfile': True, 'xcodeVersion': '26.2', 'xcodeBuild': '17C52', 'iOSSdk': '26.2', 'runner': 'mac_mini_m2', 'repository': 'ahmadalwakai/tyrerescue', 'commit': subprocess.check_output(['git', '-C', os.environ['CM_BUILD_DIR'], 'rev-parse', 'HEAD'], text=True).strip(), 'runId': os.environ.get('CM_BUILD_ID'), 'testFlightUploadPerformed': False, 'appStoreReviewRequested': False}
manifest['externalNotificationSoundVerified'] = True
manifest['externalNotificationSoundSha256'] = notification_sound_sha256
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({key: manifest[key] for key in ['version', 'buildNumber', 'bundleIdentifier', 'ipaSha256', 'ipaBytes', 'productionAPNs', 'signatureVerified']}))
