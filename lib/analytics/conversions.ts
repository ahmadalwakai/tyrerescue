'use client';

import { event, trackBookingStart, trackCallClick } from '@/lib/analytics/gtag';

type EmergencyConversionSource =
  | 'emergency_hero'
  | 'emergency_sticky_mobile'
  | 'emergency_pricing'
  | 'emergency_local'
  | 'emergency_footer';

function safeTrack(callback: () => void): void {
  try {
    callback();
  } catch {
    // CTA tracking must never block phone, booking, or tracking navigation.
  }
}

export function trackEmergencyCallClick(source: EmergencyConversionSource): void {
  safeTrack(() => trackCallClick(source));
}

export function trackEmergencyBookingClick(source: EmergencyConversionSource): void {
  safeTrack(() => {
    trackBookingStart();
    event({
      action: 'booking_cta_click',
      category: 'conversion',
      label: source,
    });
  });
}

export function trackEmergencyTrackingClick(source: EmergencyConversionSource): void {
  safeTrack(() => {
    event({
      action: 'tracking_cta_click',
      category: 'engagement',
      label: source,
    });
  });
}
