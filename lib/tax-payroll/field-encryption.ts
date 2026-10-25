import 'server-only';

/**
 * Authenticated field encryption for sensitive payroll data (e.g. NINO).
 *
 * Algorithm : AES-256-GCM (authenticated encryption — detects tampering).
 * Key source : PAYROLL_FIELD_ENCRYPTION_KEY env var, hex-encoded 32 bytes.
 * Key versioning: prefix "v1:" allows future key rotation while old records
 *   remain readable using the correct keyed version.
 * Wire format : "enc:v1:<base64url-iv>.<base64url-ciphertext>.<base64url-tag>"
 *
 * This module never logs values or surfaces ciphertext in errors.
 * If the key is absent or malformed the module fails closed — all encrypt
 * and decrypt operations throw rather than returning plaintext or empty.
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit recommended for GCM
const TAG_BYTES = 16;
const CURRENT_KEY_VERSION = 'v1';
const ENCODED_PREFIX = 'enc:v1:';

function loadKey(): Buffer {
  const raw = process.env.PAYROLL_FIELD_ENCRYPTION_KEY;
  if (!raw || raw.trim() === '') {
    throw new Error(
      'PAYROLL_FIELD_ENCRYPTION_KEY is not set. ' +
        'Generate a 32-byte hex key and add it to .env.local.',
    );
  }
  const trimmed = raw.trim();
  if (!/^[0-9a-f]{64}$/i.test(trimmed)) {
    throw new Error(
      'PAYROLL_FIELD_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).',
    );
  }
  return Buffer.from(trimmed, 'hex');
}

// Lazy single call per process — key is validated on first use.
let _key: Buffer | null = null;
function getKey(): Buffer {
  if (!_key) _key = loadKey();
  return _key;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

/** Encrypt plaintext; returns the encoded ciphertext string. */
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCODED_PREFIX}${b64url(iv)}.${b64url(encrypted)}.${b64url(tag)}`;
}

/** Decrypt an encoded ciphertext string; throws on auth failure or bad format. */
export function decryptField(encoded: string): string {
  if (!encoded.startsWith(ENCODED_PREFIX)) {
    throw new Error('Unexpected ciphertext format: missing version prefix.');
  }
  const parts = encoded.slice(ENCODED_PREFIX.length).split('.');
  if (parts.length !== 3) {
    throw new Error('Unexpected ciphertext format: expected 3 parts.');
  }
  const [ivB64, ctB64, tagB64] = parts;
  const key = getKey();
  const iv = fromB64url(ivB64);
  const ciphertext = fromB64url(ctB64);
  const tag = fromB64url(tagB64);

  if (tag.length !== TAG_BYTES) {
    throw new Error('Unexpected auth tag length.');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/** True if the string looks like a value produced by encryptField. */
export function isEncryptedField(value: string): boolean {
  return value.startsWith(ENCODED_PREFIX);
}

/** Returns the key version embedded in the encoded value. */
export function encryptedFieldVersion(encoded: string): string | null {
  if (!encoded.startsWith('enc:')) return null;
  const rest = encoded.slice(4);
  const colon = rest.indexOf(':');
  if (colon < 0) return null;
  return rest.slice(0, colon);
}

/** Mask a NINO for display: show only last 2 characters. Never log the full value. */
export function maskNino(plaintext: string): string {
  if (plaintext.length <= 2) return '**';
  return `${'*'.repeat(plaintext.length - 2)}${plaintext.slice(-2)}`;
}

// Export the current version string so callers can store it alongside ciphertext.
export const CURRENT_ENCRYPTION_KEY_VERSION = CURRENT_KEY_VERSION;
