import { Platform } from 'react-native';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

function resolveApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }

  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  if (isDev && Platform.OS === 'web') {
    return 'http://localhost:3002';
  }

  return 'https://www.tyrerescue.uk';
}

export const API_BASE_URL = trimTrailingSlash(resolveApiBaseUrl());

export const MAPBOX_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  '';

export const STRIPE_PUBLISHABLE_KEY =
  (
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    ''
  ).trim();

export const PHONE_DISPLAY =
  process.env.EXPO_PUBLIC_PHONE_NUMBER || '0141 266 0690';

export const PHONE_TEL = PHONE_DISPLAY.replace(/[^\d+]/g, '');

export const WHATSAPP_PHONE =
  process.env.EXPO_PUBLIC_WHATSAPP_PHONE || '+44 7423 262955';

export const SUPPORT_EMAIL =
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@tyrerescue.uk';

export function whatsappUrl(message: string) {
  const cleanPhone = WHATSAPP_PHONE.replace(/[^\d]/g, '');
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export const BUSINESS_NAME =
  process.env.EXPO_PUBLIC_BUSINESS_NAME || 'Tyre Rescue';
