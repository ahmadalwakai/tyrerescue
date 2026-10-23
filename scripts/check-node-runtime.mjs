import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vercel selects the major via engines.node; verify its actual build patch too.
export const minimumVersion = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '.nvmrc'), 'utf8').trim();

export function isSupportedNodeVersion(version) {
  if (!/^v?\d+\.\d+\.\d+$/.test(version)) return false;
  const actual = version.replace(/^v/, '').split('.').map(Number);
  const minimum = minimumVersion.split('.').map(Number);
  return actual[0] === minimum[0]
    && (actual[1] > minimum[1]
      || (actual[1] === minimum[1] && actual[2] >= minimum[2]));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (!isSupportedNodeVersion(process.version)) {
    console.error(`[node-runtime] Node ${process.version} is unsupported. Use Node >=${minimumVersion} <25 (see .nvmrc).`);
    process.exitCode = 1;
  } else {
    console.log(`[node-runtime] Node ${process.version}; required >=${minimumVersion} <25.`);
  }
}
