#!/usr/bin/env python3
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import zipfile

temp = Path(os.environ['RUNNER_TEMP'])
work = temp / 'assisted-ios49-work'
output = temp / 'assisted-ios49-output'
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
assert info['CFBundleShortVersionString'] == '1.0.12' and info['CFBundleVersion'] == '49', 'Wrong exported version'
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
for tone in ['urgent_booking.mp3', 'chat-send.wav', 'chat-receive.wav']:
    assert any(p.name == tone for p in app.rglob(tone)), 'A required notification/chat sound is missing'
assert not list(app.rglob('*.p12')) and not list(app.rglob('*.p8')) and not list(app.rglob('.env*')), 'Private source material in IPA'
destination = output / 'assisted-chat-1.0.12-49.ipa'
shutil.copyfile(ipas[0], destination)
manifest = {'version': '1.0.12', 'buildNumber': '49', 'bundleIdentifier': 'uk.tyrerescue.assistedchat', 'teamId': 'BXK52CMHR2', 'sourceManifestSha256': '72f816cedd1b8d7b7e1f31cdc0bf2f0823e9cc1edfb51d7b81a6e77503d3e99d', 'ipaSha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'ipaBytes': destination.stat().st_size, 'architecture': architecture, 'productionAPNs': True, 'signatureVerified': True, 'appStoreDistributionProfile': True, 'xcodeVersion': '26.2', 'xcodeBuild': '17C52', 'iOSSdk': '26.2', 'runner': 'macos-15-intel', 'repository': os.environ.get('GITHUB_REPOSITORY'), 'commit': os.environ.get('GITHUB_SHA'), 'runId': os.environ.get('GITHUB_RUN_ID'), 'testFlightUploadPerformed': False, 'appStoreReviewRequested': False}
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({key: manifest[key] for key in ['version', 'buildNumber', 'bundleIdentifier', 'ipaSha256', 'ipaBytes', 'productionAPNs', 'signatureVerified']}))
