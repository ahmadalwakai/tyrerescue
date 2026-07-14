#!/usr/bin/env node
// Runs `eas credentials:configure-build -p ios -e production` inside a real
// pseudo-terminal (node-pty) so EAS sees isTTY=true.
// Uses a state machine so each prompt is answered exactly once, in order.
//
// Env vars required: APPLE_APP_SPECIFIC_PASSWORD, APPLE_ID
// APPLE_ID is cleared (Ctrl+U) then typed to replace any pre-filled wrong value.

const pty = require('node-pty');

const APPLE_ID   = process.env.APPLE_ID || 'ahmadalwakai@gmx.com';
const APPLE_ASP  = process.env.APPLE_APP_SPECIFIC_PASSWORD || '';
const APPLE_TEAM = process.env.APPLE_TEAM_ID || 'BXK52CMHR2';

if (!APPLE_ASP) {
  console.error('APPLE_APP_SPECIFIC_PASSWORD must be set.');
  process.exit(1);
}

// State machine: each state waits for a trigger, sends a reply, then moves on.
// `once` means this state fires at most once.
const STATES = [
  { id: 'login',    re: /Do you want to log in to your Apple account/i, send: 'y\r' },
  { id: 'appleid',  re: /Apple ID:/i,                                   send: '\x15' + APPLE_ID + '\r' }, // Ctrl+U clears field, then type correct ID
  { id: 'password', re: /Password \(for/i,                              send: APPLE_ASP + '\r' },
  { id: 'team',     re: /Select a team/i,                               send: '\r' },
  { id: 'cert',     re: /distribution certificate/i,                    send: '\r' },
  { id: 'profile',  re: /provisioning profile/i,                        send: '\r' },
  { id: 'push',     re: /push notification/i,                           send: '\r' },
  { id: 'yesno',    re: /\(Y\/n\)|\(y\/N\)/i,                          send: 'y\r' },
];

let stateIdx = 0;

const shell = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
const args  = ['/c', 'eas credentials:configure-build -p ios -e production'];

const term = pty.spawn(shell, args, {
  name: 'xterm-color',
  cols: 120,
  rows: 40,
  env: {
    ...process.env,
    APPLE_APP_SPECIFIC_PASSWORD: APPLE_ASP,
    APPLE_TEAM_ID: APPLE_TEAM,
  },
});

let buf = '';
let timer = null;
const DEBOUNCE_MS = 500;

function flush() {
  if (stateIdx >= STATES.length) { buf = ''; return; }
  const state = STATES[stateIdx];
  if (state.re.test(buf)) {
    const preview = buf.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').slice(-200);
    console.log(`\n[state:${state.id}] matched → sending ${JSON.stringify(state.send)}`);
    console.log(`[context] ...${preview}`);
    stateIdx++;
    term.write(state.send);
  }
  buf = '';
}

term.onData(data => {
  process.stdout.write(data);
  buf += data;
  clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
});

term.onExit(({ exitCode }) => {
  clearTimeout(timer);
  console.log(`\n[eas-setup-creds] exited with code ${exitCode}`);
  process.exit(exitCode);
});
