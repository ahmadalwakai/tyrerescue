import copy
import datetime
import importlib.util
import base64
import contextlib
import io
import json
import os
from pathlib import Path
import plistlib
import runpy
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('signing_policy', Path(__file__).with_name('signing-policy.py'))
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


def profile(bundle):
    return {'TeamIdentifier': [policy.TEAM], 'UUID': '11111111-1111-1111-1111-111111111111', 'Name': 'Synthetic profile',
            'ExpirationDate': datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + datetime.timedelta(days=30),
            'DeveloperCertificates': [b'synthetic certificate'],
            'Entitlements': {'application-identifier': policy.TEAM + '.' + bundle,
                             'com.apple.developer.team-identifier': policy.TEAM, 'get-task-allow': False,
                             **({'aps-environment': 'production'} if bundle == policy.APP_BUNDLE else {})}}


def targets(widget=False):
    result = [{'name': 'TyreRescue', 'productType': 'com.apple.product-type.application', 'bundleIds': [policy.APP_BUNDLE]}]
    if widget:
        result.append({'name': policy.WIDGET_TARGET, 'productType': 'com.apple.product-type.app-extension', 'bundleIds': [policy.WIDGET_BUNDLE]})
    return result


class SigningPolicyTests(unittest.TestCase):
    def test_legacy_build_has_only_the_main_profile_scope(self):
        self.assertEqual(policy.validate_targets(targets()), {policy.APP_BUNDLE: 'TyreRescue'})

    def test_widget_build_requires_both_exact_scopes(self):
        self.assertEqual(policy.validate_targets(targets(True)), {policy.APP_BUNDLE: 'TyreRescue', policy.WIDGET_BUNDLE: policy.WIDGET_TARGET})

    def test_unexpected_or_duplicate_targets_are_rejected(self):
        for mutate in [lambda items: items[1].update(name='OtherWidget'),
                       lambda items: items[1].update(bundleIds=['uk.other']),
                       lambda items: items[1].update(bundleIds=[policy.WIDGET_BUNDLE, 'uk.other']),
                       lambda items: items.append(copy.deepcopy(items[1]))]:
            items = targets(True)
            mutate(items)
            with self.assertRaises(AssertionError):
                policy.validate_targets(items)

    def test_matching_main_and_widget_distribution_profiles_are_accepted(self):
        for bundle in [policy.APP_BUNDLE, policy.WIDGET_BUNDLE]:
            self.assertEqual(policy.validate_profile(profile(bundle), bundle, b'synthetic certificate')['bundle'], bundle)

    def test_app_profile_cannot_be_reused_for_widget_and_wrong_certificate_is_rejected(self):
        with self.assertRaisesRegex(AssertionError, 'Wrong profile application'):
            policy.validate_profile(profile(policy.APP_BUNDLE), policy.WIDGET_BUNDLE, b'synthetic certificate')
        with self.assertRaisesRegex(AssertionError, 'certificate'):
            policy.validate_profile(profile(policy.WIDGET_BUNDLE), policy.WIDGET_BUNDLE, b'another certificate')

    def test_development_ad_hoc_expired_and_wrong_team_profiles_are_rejected(self):
        for mutate in [lambda item: item['Entitlements'].update({'get-task-allow': True}),
                       lambda item: item.update(ProvisionedDevices=['device']),
                       lambda item: item.update(ProvisionsAllDevices=True),
                       lambda item: item.update(ExpirationDate=datetime.datetime(2020, 1, 1)),
                       lambda item: item.update(TeamIdentifier=['OTHER'])]:
            item = profile(policy.WIDGET_BUNDLE)
            mutate(item)
            with self.assertRaises(AssertionError):
                policy.validate_profile(item, policy.WIDGET_BUNDLE, b'synthetic certificate')

    def prepare(self, widget, provide_widget):
        with tempfile.TemporaryDirectory(prefix='tyre-signing-test-') as temporary:
            root = Path(temporary)
            (root / 'repo/tyre-rescue/ios/Customer.xcodeproj').mkdir(parents=True)
            (root / 'ci').mkdir()
            env = {'CM_BUILD_DIR': str(root / 'repo'), 'CUSTOMER_APP_DIR': 'tyre-rescue', 'CUSTOMER_CI_TEMP': str(root / 'ci'),
                   'CUSTOMER_IOS_P12_BASE64': base64.b64encode(b'synthetic p12').decode(),
                   'CUSTOMER_IOS_PROFILE_BASE64': base64.b64encode(b'synthetic profile').decode(), 'CUSTOMER_IOS_P12_PASSWORD': 'synthetic'}
            if provide_widget:
                env['CUSTOMER_IOS_LIVE_ACTIVITY_PROFILE_BASE64'] = base64.b64encode(b'synthetic widget profile').decode()

            def read(command, **kwargs):
                if command[0] == 'ruby':
                    return json.dumps(targets(widget)).encode()
                if command[0] == 'security':
                    is_widget = command[-1].endswith('live-activity.mobileprovision')
                    item = profile(policy.WIDGET_BUNDLE if is_widget else policy.APP_BUNDLE)
                    if is_widget:
                        item['UUID'] = '22222222-2222-2222-2222-222222222222'
                    return plistlib.dumps(item)
                return b'synthetic certificate'

            with patch.dict(os.environ, env, clear=True), patch.object(Path, 'home', return_value=root / 'home'), \
                    patch('subprocess.check_output', side_effect=read), \
                    patch('subprocess.run', return_value=subprocess.CompletedProcess([], 0, stdout=b'synthetic PEM')), \
                    contextlib.redirect_stdout(io.StringIO()):
                runpy.run_path(str(Path(__file__).with_name('prepare-signing.py')))
            signing = root / 'ci/customer-ios22-signing'
            result = json.loads((signing / 'metadata.json').read_text())
            installed = (signing / 'installed-profile-paths.txt').read_text().splitlines()
            self.assertEqual(len(installed), 2 if widget else 1)
            self.assertTrue(all(Path(filename).is_file() for filename in installed))
            return result

    def test_legacy_preparation_does_not_require_a_widget_secret(self):
        self.assertEqual(set(self.prepare(False, False)['profiles']), {policy.APP_BUNDLE})

    def test_widget_preparation_requires_its_separate_profile(self):
        with self.assertRaisesRegex(RuntimeError, 'CUSTOMER_IOS_LIVE_ACTIVITY_PROFILE_BASE64'):
            self.prepare(True, False)

    def test_widget_preparation_installs_and_records_each_validated_profile(self):
        result = self.prepare(True, True)
        self.assertEqual(set(result['profiles']), {policy.APP_BUNDLE, policy.WIDGET_BUNDLE})
        self.assertNotEqual(result['profiles'][policy.APP_BUNDLE]['uuid'], result['profiles'][policy.WIDGET_BUNDLE]['uuid'])


if __name__ == '__main__':
    unittest.main()
