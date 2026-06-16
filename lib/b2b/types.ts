export const B2B_SCOPES = [
  'stock:read',
  'stock:availability:read',
  'stock:prices:read',
  'stock:reserve',
  'stock:movement:read',
  'stock:sync:read',
] as const;

export type B2BScope = (typeof B2B_SCOPES)[number];

export const B2B_PLATFORMS = [
  'admin_web',
  'android_admin_app',
  'android_mobile_app',
  'android_driver_app',
  'external_b2b_api',
] as const;

export type B2BPlatform = (typeof B2B_PLATFORMS)[number];

export type B2BClientStatus = 'active' | 'suspended' | 'revoked';
export type B2BKeyStatus = 'active' | 'suspended' | 'revoked';

export const SCOPE_DESCRIPTIONS: Record<B2BScope, string> = {
  'stock:read': 'List available tyre stock (brand, size, season, quantity)',
  'stock:availability:read': 'Check stock availability by size',
  'stock:prices:read': 'Include tyre prices in stock responses',
  'stock:reserve': 'Reserve stock items atomically',
  'stock:movement:read': 'Read stock movement / audit trail',
  'stock:sync:read': 'Stock sync read for Android/app integrations',
};

export const PLATFORM_DESCRIPTIONS: Record<B2BPlatform, string> = {
  admin_web: 'Admin web application',
  android_admin_app: 'Android admin app (assisted-chat-app)',
  android_mobile_app: 'Android mobile customer app',
  android_driver_app: 'Android driver app',
  external_b2b_api: 'External B2B API partner',
};

/** Fields that are ALWAYS denied regardless of scopes */
export const ALWAYS_DENIED = [
  'Customer details',
  'Bookings',
  'Payments & Stripe',
  'SMS messages',
  'Driver private data',
  'Admin settings',
  'Internal costs',
  'User accounts',
  'Any write/delete stock operation',
] as const;
