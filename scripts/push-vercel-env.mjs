#!/usr/bin/env node
/**
 * Push every variable in an env file to a Vercel project environment.
 * Writes the value to `vercel env add <name> <target>` via stdin with NO
 * trailing newline, avoiding the "Value contains newlines" warning that
 * caused malformed Authorization headers (e.g. for Stripe).
 *
 * Usage:
 *   node scripts/push-vercel-env.mjs [envFile] [target]
 *   node scripts/push-vercel-env.mjs .env.production production
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const envFile = process.argv[2] ?? '.env.production';
const target = process.argv[3] ?? 'production';
const SKIP = new Set(['VERCEL_OIDC_TOKEN']);

function parseEnv(content) {
  const out = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let value = m[2];
    const q = value.match(/^"(.*)"$/) ?? value.match(/^'(.*)'$/);
    if (q) value = q[1];
    out.push({ name: m[1], value: value.trim() });
  }
  return out;
}

function run(args, { stdin } = {}) {
  return new Promise((resolve) => {
    const child = spawn('vercel', args, {
      stdio: ['pipe', 'inherit', 'inherit'],
      shell: true, // resolves the .cmd shim on Windows
    });
    if (stdin !== undefined) {
      child.stdin.write(stdin); // exact bytes, no trailing newline
      child.stdin.end();
    } else {
      child.stdin.end();
    }
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

const entries = parseEnv(readFileSync(envFile, 'utf8'));

for (const { name, value } of entries) {
  if (SKIP.has(name)) {
    console.log(`[skip] ${name}`);
    continue;
  }
  console.log(`[push] ${name} -> ${target} (len ${value.length})`);
  // Best-effort remove so add will succeed
  await run(['env', 'rm', name, target, '--yes']);
  const code = await run(['env', 'add', name, target], { stdin: value });
  if (code !== 0) console.warn(`  ! failed (exit ${code})`);
}

console.log('Done.');
