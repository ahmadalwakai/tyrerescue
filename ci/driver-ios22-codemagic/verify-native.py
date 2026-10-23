#!/usr/bin/env python3
"""Verify the generated permissions/version before importing signing material."""
import json
import os
from pathlib import Path
import plistlib

app = Path(os.environ['CM_BUILD_DIR']) / os.environ['DRIVER_APP_DIR']
infos = list((app / 'ios').glob('*/Info.plist'))
assert len(infos) == 1, 'Expected one generated driver Info.plist'
info = plistlib.loads(infos[0].read_bytes())
assert info['CFBundleShortVersionString'] == '1.3.1' and info['CFBundleVersion'] == '22', 'Generated version override failed'
assert info.get('CFBundleIdentifier') in ['uk.tyrerescue.driver', '$(PRODUCT_BUNDLE_IDENTIFIER)'], 'Wrong generated driver bundle'
for permission in ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSPhotoLibraryUsageDescription',
                   'NSLocationWhenInUseUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription', 'NSFaceIDUsageDescription']:
    assert info.get(permission), 'Missing generated driver permission description'
assert {'location', 'remote-notification'}.issubset(info.get('UIBackgroundModes', [])), 'Missing generated driver background modes'
assert any('tyrerescuedriver' in item.get('CFBundleURLSchemes', []) for item in info.get('CFBundleURLTypes', [])), 'Missing generated driver return scheme'
assert info.get('ITSAppUsesNonExemptEncryption') is False, 'Missing encryption declaration'
source = (app / 'src/services/background-location.ts').read_text()
assert source.index('TaskManager.defineTask(') < source.index("require('expo-router/entry')"), 'Background entry was replaced'
assert json.loads((app / 'package.json').read_text())['main'] == './src/services/background-location.ts', 'Background entry changed during prebuild'
print('Generated driver native version, background modes, Face ID and entry verified.')
