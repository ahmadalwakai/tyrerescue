import { createHash, timingSafeEqual } from 'node:crypto';

export interface BonlineConfig {
  secret: string;
  scope: string;
  tenantIds: string[];
  providerUserIds: string[];
  adminUserIds: string[];
}

function list(value: string | undefined): string[] {
  return [...new Set((value ?? '').split(',').map((item) => item.trim()).filter(Boolean))];
}

/** The webhook URL is a bearer credential; never log it or send it to the app. */
export function getBonlineConfig(): BonlineConfig | null {
  const secret = process.env.BONLINE_WEBHOOK_SECRET?.trim() ?? '';
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(secret)) return null;
  return {
    secret,
    scope: createHash('sha256').update(secret).digest('hex'),
    tenantIds: list(process.env.BONLINE_TENANT_IDS),
    providerUserIds: list(process.env.BONLINE_USER_IDS),
    adminUserIds: list(process.env.BONLINE_ADMIN_USER_IDS),
  };
}

export function matchesBonlineSecret(provided: string, expected: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(provided).digest(),
    createHash('sha256').update(expected).digest(),
  );
}

export function canReadBonlineCalls(config: BonlineConfig, adminUserId: string): boolean {
  return config.adminUserIds.length === 0 || config.adminUserIds.includes(adminUserId);
}
