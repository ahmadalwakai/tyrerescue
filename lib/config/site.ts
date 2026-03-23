/** Single source of truth for the canonical production URL. */
export const SITE_URL = 'https://www.tyrerescue.uk' as const;

export function getSiteUrl(): string {
  return SITE_URL;
}
