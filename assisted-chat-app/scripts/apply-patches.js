/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const patchPackage = 'expo-notifications';
const patchVersion = '55.0.25';
const patchFile = path.join(
  projectRoot,
  'patches',
  `${patchPackage}+${patchVersion}.patch`,
);

function fail(message) {
  console.error(`[patch-package guard] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(patchFile)) {
  fail(`Missing required patch file: ${path.relative(projectRoot, patchFile)}`);
}

let installedVersion;
try {
  const packageJsonPath = require.resolve(`${patchPackage}/package.json`, {
    paths: [projectRoot],
  });
  installedVersion = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version;
} catch (error) {
  fail(`Unable to resolve ${patchPackage}: ${error.message}`);
}

if (installedVersion !== patchVersion) {
  fail(
    `${patchPackage} ${installedVersion} is installed, but the required patch targets ${patchVersion}.`,
  );
}

const patchPackageCli = require.resolve('patch-package/index.js', {
  paths: [projectRoot],
});

execFileSync(process.execPath, [patchPackageCli], {
  cwd: projectRoot,
  stdio: 'inherit',
});
