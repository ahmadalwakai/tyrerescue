/**
 * Pure UK VRM (number-plate) helpers — safe for client and server.
 *
 * Lives separately from `lib/dvla.ts` because that module is tagged
 * `'server-only'` (it reads the DVLA API key from env). Client components
 * still need to validate / normalise plates before submitting them.
 */

const UK_VRM_REGEX = /^[A-Z0-9]{1,8}$/;

export function normalizeVrm(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

export function isValidVrm(input: string): boolean {
  const compact = normalizeVrm(input);
  return compact.length >= 2 && compact.length <= 8 && UK_VRM_REGEX.test(compact);
}
