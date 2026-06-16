import { createHash, randomBytes } from 'crypto';

const KEY_LITERAL_PREFIX = 'tr_b2b_live_';
// Full key format: tr_b2b_live_<64 hex chars> (32 random bytes)
const KEY_REGEX = /^tr_b2b_live_[0-9a-f]{64}$/;

export interface GeneratedB2BKey {
  /** Full raw key — shown to admin once only, never stored */
  rawKey: string;
  /** Short prefix stored in DB for identification (never exposes the secret) */
  keyPrefix: string;
  /** SHA-256 hash of rawKey — what gets stored in DB */
  keyHash: string;
}

export function generateB2BApiKey(): GeneratedB2BKey {
  const token = randomBytes(32).toString('hex'); // 64 hex chars
  const rawKey = `${KEY_LITERAL_PREFIX}${token}`;
  // Store first 8 chars of random part for display identification
  const keyPrefix = `${KEY_LITERAL_PREFIX}${token.slice(0, 8)}`;
  const keyHash = hashB2BApiKey(rawKey);
  return { rawKey, keyPrefix, keyHash };
}

export function hashB2BApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export function isValidB2BKeyFormat(key: string): boolean {
  return KEY_REGEX.test(key);
}
