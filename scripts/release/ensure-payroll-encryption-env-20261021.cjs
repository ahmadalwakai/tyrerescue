/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS Node.js release utility */
// Default: inspect metadata only. Creation requires an explicit release-go flag.
// Generated secret goes only to Vercel's stdin; never to argv, stdout or a file.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const projectId = 'prj_dEGq9KZNkHKuHHT42atZqeHfiyhI';
const orgId = 'team_YbFFTwYDhbX9PBOoxXET1A90';
const keyName = 'PAYROLL_FIELD_ENCRYPTION_KEY';
const linked = JSON.parse(fs.readFileSync('.vercel/project.json', 'utf8'));
if (linked.projectId !== projectId || linked.orgId !== orgId) throw new Error('The linked project is not the verified TyreRescue project');

function cli(command, input) {
  const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], {
    input, encoding: 'utf8', windowsHide: true, timeout: 90000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  });
  return { status: result.status, stdout: result.stdout || '', error: Boolean(result.error) };
}
function metadata() {
  // CLI JSON may include other readable values. Capture and discard them here;
  // only the requested variable's nonsecret metadata is returned.
  const result = cli(`npx vercel env ls --environment production --project ${projectId} --json --non-interactive`);
  if (result.status !== 0) throw new Error('Environment metadata command failed without printing its output');
  const output = result.stdout.trim();
  const parsed = JSON.parse(output);
  const values = Array.isArray(parsed) ? parsed : parsed.envs ?? parsed.environmentVariables ?? parsed.variables;
  if (!Array.isArray(values)) throw new Error('Unrecognised environment metadata format');
  const value = values.find((item) => item.key === keyName && (!item.target || item.target.includes('production')));
  return value ? { present: true, type: value.type, target: value.target } : { present: false };
}

try {
  const before = metadata();
  let report;
  if (before.present) report = { keyName, environment: 'production', present: true, created: false, preservedExisting: true, type: before.type };
  else if (!process.argv.includes('--create-missing-production-key')) report = { keyName, environment: 'production', present: false, created: false, requiresReleaseGo: true };
  else {
    const bytes = crypto.randomBytes(32);
    let generated = bytes.toString('hex');
    if (!/^[a-f0-9]{64}$/.test(generated)) throw new Error('Generated encryption key format failed validation');
    const added = cli(`npx vercel env add ${keyName} --environment production --project ${projectId} --sensitive --yes --non-interactive`, `${generated}\n`);
    bytes.fill(0); generated = '';
    const after = metadata();
    if (!after.present || after.type !== 'sensitive') throw new Error('A protected production encryption key could not be confirmed');
    report = { keyName, environment: 'production', present: true, created: added.status === 0, preservedExisting: added.status !== 0, type: after.type, generatedFormatValidated: true };
  }
  const destination = path.resolve('.vercel/db-release-preflight-20261021/encryption-key-metadata.json');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  const message = error instanceof Error ? error.message : '';
  console.error(JSON.stringify({ keyName, operationFailed: true, safeMessage: /^(Environment metadata|Unrecognised environment|Generated encryption|A protected production)/.test(message) ? message : 'Protected key operation failed without printing command output' }));
  process.exitCode = 1;
}
