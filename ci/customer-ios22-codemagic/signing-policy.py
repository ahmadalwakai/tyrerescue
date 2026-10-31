"""Pure validation shared by the manual signing preparation and local tests."""
import datetime
import re

TEAM = 'BXK52CMHR2'
APP_BUNDLE = 'uk.tyrerescue.customer'
WIDGET_BUNDLE = APP_BUNDLE + '.liveactivity'
WIDGET_TARGET = 'CustomerRescueLiveActivity'


def validate_targets(targets):
    applications = [item for item in targets if item['productType'] == 'com.apple.product-type.application']
    assert len(applications) == 1, 'Expected exactly one application target'
    assert set(applications[0]['bundleIds']) == {APP_BUNDLE}, 'Wrong generated application identity'
    expected = {APP_BUNDLE: applications[0]['name']}
    for item in targets:
        if item is applications[0]:
            continue
        assert item['name'] == WIDGET_TARGET and item['productType'] == 'com.apple.product-type.app-extension', 'Unexpected extra native target'
        assert set(item['bundleIds']) == {WIDGET_BUNDLE}, 'Wrong generated Live Activity identity'
        assert WIDGET_BUNDLE not in expected, 'Duplicate Live Activity target'
        expected[WIDGET_BUNDLE] = WIDGET_TARGET
    return expected


def validate_profile(profile, bundle, certificate_der, now=None):
    assert bundle in [APP_BUNDLE, WIDGET_BUNDLE], 'Unexpected provisioning scope'
    entitlements = profile.get('Entitlements', {})
    assert profile.get('TeamIdentifier') == [TEAM], 'Wrong signing team'
    assert entitlements.get('application-identifier') == TEAM + '.' + bundle, 'Wrong profile application'
    assert entitlements.get('com.apple.developer.team-identifier') == TEAM, 'Wrong profile entitlement team'
    if bundle == APP_BUNDLE:
        assert entitlements.get('aps-environment') == 'production', 'The profile does not permit production push notifications'
    assert entitlements.get('get-task-allow') is False, 'A development profile cannot be used'
    assert not entitlements.get('com.apple.developer.in-app-payments'), 'The cards-only signing scope must remain unchanged'
    assert not profile.get('ProvisionedDevices') and not profile.get('ProvisionsAllDevices'), 'An App Store distribution profile is required'
    now = now or datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    assert profile['ExpirationDate'] > now + datetime.timedelta(days=1), 'The profile is expired or expires too soon'
    assert re.fullmatch(r'[0-9A-Fa-f-]{36}', profile['UUID']), 'Invalid profile UUID'
    assert isinstance(profile.get('Name'), str) and profile['Name'], 'Invalid profile name'
    assert certificate_der in profile.get('DeveloperCertificates', []), 'The certificate does not match the profile'
    return {'uuid': profile['UUID'], 'profileName': profile['Name'], 'bundle': bundle}
