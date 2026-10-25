import type { ServiceKey } from '@/lib/pricing';

/** Match SEO service routes to existing display fees, never to checkout totals. */
export function getServicePricingKey(serviceSlug: string): ServiceKey | undefined {
  switch (serviceSlug) {
    case 'mobile-tyre-fitting':
    case 'tyre-fitting':
      return 'fitting';
    case 'emergency-tyre-fitting':
      return 'emergency';
    case 'tyre-repair':
    case 'puncture-repair':
      return 'punctureRepair';
    default:
      return undefined;
  }
}
