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
work = temp / 'customer-ios20-work'
output = temp / 'customer-ios20-output'
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
manifest = json.loads((Path(os.environ['CM_BUILD_DIR']) / os.environ['CUSTOMER_CI_DIR'] / 'source-manifest.json').read_text())
assert manifest['version'] == '1.0.5' and manifest['buildNumber'] == '20', 'Unexpected customer20 source version'
assert info['CFBundleShortVersionString'] == manifest['version'] and info['CFBundleVersion'] == manifest['buildNumber'], 'Wrong customer version'
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
merchant = os.environ.get('EXPO_PUBLIC_APPLE_MERCHANT_ID', '').strip()
assert not merchant and not entitlements.get('com.apple.developer.in-app-payments'), 'Customer20 cards-only entitlement required'
profile = plistlib.loads(subprocess.check_output(['security', 'cms', '-D', '-i', str(app / 'embedded.mobileprovision')], stderr=subprocess.DEVNULL))
assert profile['Entitlements']['application-identifier'] == 'BXK52CMHR2.uk.tyrerescue.customer', 'Wrong embedded customer profile'
assert profile['Entitlements'].get('aps-environment') == 'production' and profile['Entitlements'].get('get-task-allow') is False, 'Invalid customer profile entitlement'
assert not profile['Entitlements'].get('com.apple.developer.in-app-payments'), 'Existing cards-only customer profile required'
assert not profile.get('ProvisionedDevices') and not profile.get('ProvisionsAllDevices'), 'App Store distribution required'
assert profile['ExpirationDate'] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None), 'Expired customer profile'
architecture = subprocess.check_output(['lipo', '-archs', str(app / info['CFBundleExecutable'])], text=True).strip()
assert architecture == 'arm64', 'Unexpected customer architecture'
bundle = (app / 'main.jsbundle').read_bytes()
assert len(bundle) > 100000 and bundle[:8] == bytes.fromhex('c61fbc03c103191f'), 'Production Hermes bundle required'
bundle_text = bundle.decode('utf8', errors='ignore') + '\n' + bundle.decode('utf-16-le', errors='ignore')
required_ui_markers = ['https://www.tyrerescue.uk', 'Is this where you need us?', 'Yes, use this location', 'GPS accuracy', 'Check booking confirmation', 'Your active booking', 'Track my booking', 'Chat with us', 'Call me back', 'Retry payment setup', 'Check payment status', 'Check this payment status', 'tyrerescue://stripe-redirect']
assert all(marker in bundle_text for marker in required_ui_markers), 'Reviewed customer GPS/payment/chat markers missing'
assert not re.search(r'\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b|\bwhsec_[A-Za-z0-9]{16,}|-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----|\bsk\.[A-Za-z0-9_-]{20,}\.', bundle_text), 'Private literal in customer bundle'
public_mapbox = os.environ.get('EXPO_PUBLIC_MAPBOX_TOKEN', '')
public_stripe = os.environ.get('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY', '')
assert os.environ.get('EXPO_PUBLIC_API_BASE_URL') == 'https://www.tyrerescue.uk', 'Production customer API required'
assert public_mapbox.startswith('pk.') and public_mapbox in bundle_text, 'Configured public map token missing'
assert re.fullmatch(r'pk_live_[A-Za-z0-9]+', public_stripe) and public_stripe in bundle_text, 'Configured live Stripe publishable key missing'

# Bind payment callback, timeout and recovery proofs to the exact frozen source
# that produced this IPA. Credentials and bank callback URLs are never printed.
source_root = Path(os.environ['CM_BUILD_DIR']) / os.environ['CUSTOMER_APP_DIR']
source_entries = {entry['file']: entry for entry in manifest['files']}

def frozen_source(relative):
    entry = source_entries.get(relative)
    assert entry, 'Required customer20 payment source is not frozen'
    data = (source_root / relative).read_bytes()
    assert entry['bytes'] == len(data) and entry['sha256'] == hashlib.sha256(data).hexdigest(), 'Customer20 payment source hash differs'
    return data.decode('utf8')

redirect = frozen_source('src/customer-payment-redirect.ts')
native_intent = frozen_source('app/+native-intent.tsx')
provider = frozen_source('src/stripe-provider.native.tsx')
payment_hook = frozen_source('src/use-customer-payment.native.ts')
payment_control = frozen_source('src/customer-payment-control.native.tsx')
recovery = frozen_source('src/customer-payment-recovery.ts')
booking = frozen_source('src/booking-screen.tsx')
config = frozen_source('src/config.ts')
assert all(marker in provider for marker in ["Linking.addEventListener('url'", 'Linking.getInitialURL()', 'isStripeRedirectUrl(url)', 'handleURLCallback(url)']), 'Stripe bank-return forwarding source is incomplete'
assert 'rewriteStripeRedirectPath' in native_intent and 'isStripeRedirectUrl' in redirect and "parsed.protocol !== 'tyrerescue:'" in redirect, 'Customer bank-return route filtering is incomplete'
assert not re.search(r'console\.(?:log|warn|error)\(', provider), 'Bank-return source must not log callback values'
assert all(marker in payment_hook for marker in ['PAYMENT_SHEET_TIMEOUT_MS = 120_000', 'PAYMENT_SHEET_WATCHDOG_MS = 135_000', 'presentPaymentSheet({ timeout: PAYMENT_SHEET_TIMEOUT_MS })', 'let paymentSheetPresentation', 'paymentSheetPresentation = presentation']), 'Native timeout and remount payment guard source is incomplete'
assert all(marker in payment_control for marker in ['onCheckPaymentStatus(id)', 'result.paymentIntentId !== id', "result.status === 'processing'", 'Retry payment setup', 'setRetryPayment(true)']), 'Native same-payment retry source is incomplete'
assert "sdkError?.name === 'PaymentCancelled' && result.status !== 'requires_action'" in payment_control, 'Uncertain payment attempts must remain durable'
assert all(marker in recovery for marker in ['result.paymentIntentId !== expectedId', "result.currency !== 'gbp'", "'requires_payment_method', 'requires_confirmation', 'requires_action'", 'result.clientSecret.startsWith(`${expectedId}_secret_`)']), 'Authenticated recovery response validation is incomplete'
assert all(marker in booking for marker in ['onCheckPaymentStatus={checkPaymentStatus}', 'paymentAttemptIntentId: result.paymentIntentId', 'await saveBookingDraft({ ...state, ...updates }', 'paymentMounted.current && draftSession === bookingDraftSession()', 'if (!currentSession())', 'paymentMounted.current = false']), 'Durable scoped booking recovery source is incomplete'
assert all(marker in config for marker in ['EXPO_PUBLIC_API_BASE_URL', 'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_MAPBOX_TOKEN']), 'Explicit production configuration source is incomplete'
assert not list(app.rglob('*.p12')) and not list(app.rglob('*.p8')) and not list(app.rglob('.env*')), 'Private source in customer IPA'
destination = output / 'tyre-rescue-1.0.5-20.ipa'
shutil.copyfile(ipas[0], destination)
manifest = {'version': '1.0.5', 'buildNumber': '20', 'bundleIdentifier': 'uk.tyrerescue.customer', 'teamId': 'BXK52CMHR2', 'sourceManifestSha256': manifest['sourceManifestSha256'], 'ipaSha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'ipaBytes': destination.stat().st_size, 'architecture': architecture, 'hermesBundleSha256': hashlib.sha256(bundle).hexdigest(), 'uiMarkersVerified': required_ui_markers, 'customerGpsConfirmationPresent': True, 'customerPaymentConfirmationGuardPresent': True, 'customerChatPresent': True, 'configuredPublicMapboxTokenPresent': True, 'configuredLiveStripePublishableKeyPresent': True, 'privateBundleLiteralsAbsent': True, 'productionAPNs': True, 'signatureVerified': True, 'appStoreDistributionProfile': True, 'xcodeVersion': '26.2', 'xcodeBuild': '17C52', 'iOSSdk': '26.2', 'runner': 'mac_mini_m2', 'repository': 'ahmadalwakai/tyrerescue', 'commit': subprocess.check_output(['git', '-C', os.environ['CM_BUILD_DIR'], 'rev-parse', 'HEAD'], text=True).strip(), 'runId': os.environ.get('CM_BUILD_ID'), 'testFlightUploadPerformed': False, 'appStoreReviewRequested': False}
manifest.update({'cardsOnlyVerified': True, 'applePayEntitlementAbsent': True, 'customerStripeReturnForwardingSourceVerified': True, 'customerPaymentRecoveryValidationSourceVerified': True, 'customerPaymentTimeoutSourceVerified': True, 'customerPaymentRetrySourceVerified': True, 'customerPaymentDurableAttemptSourceVerified': True, 'productionPublicConfigurationVerified': True, 'stripePublishableSha256': hashlib.sha256(public_stripe.encode()).hexdigest(), 'mapboxPublicSha256': hashlib.sha256(public_mapbox.encode()).hexdigest()})
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({key: manifest[key] for key in ['version', 'buildNumber', 'bundleIdentifier', 'ipaSha256', 'ipaBytes', 'productionAPNs', 'signatureVerified']}))
