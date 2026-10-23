import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSupportedNodeVersion } from './check-node-runtime.mjs';

test('rejects unpatched versions and unsupported release lines', () => {
  for (const version of ['24.7.0', '24.21.0', '24.22.0', '20.19.5', '22.23.4', '25.0.0', '26.12.1']) {
    assert.equal(isSupportedNodeVersion(version), false, version);
  }
});

test('allows the security patch and newer stable releases in the selected major', () => {
  for (const version of ['24.22.1', 'v24.22.1', '24.22.2', '24.23.0']) {
    assert.equal(isSupportedNodeVersion(version), true, version);
  }
});

test('rejects malformed or prerelease versions', () => {
  for (const version of ['24', '24.22', '24.22.1-rc.1', '24.22.1-extra', '']) {
    assert.equal(isSupportedNodeVersion(version), false, version);
  }
});
