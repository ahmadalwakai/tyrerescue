export const serviceOptions = [
  {
    value: 'mobile_fitting',
    slug: 'mobile-tyre-fitting',
    label: 'Mobile tyre fitting',
    seoTitle: 'Mobile Tyre Fitting Edinburgh',
    description: 'Fitting at home, work or roadside.',
    longDescription:
      'Book mobile tyre fitting across Edinburgh, the Lothians and countryside routes within 50 miles. Add your address, vehicle and tyre details so the visit can be checked and confirmed quickly.',
    includes: ['Home, workplace and roadside fitting', 'Tyre size and vehicle details captured', 'Clear call-out confirmation'],
  },
  {
    value: 'puncture_repair',
    slug: 'puncture-repair',
    label: 'Puncture repair',
    seoTitle: 'Puncture Repair Edinburgh',
    description: 'Inspection, repair where safe, valve and pressure check.',
    longDescription:
      'Request puncture repair in Edinburgh with a safety-first inspection. If the tyre cannot be repaired, we can discuss replacement options and the best next step.',
    includes: ['Repair suitability check', 'Valve and pressure check', 'Replacement path if unsafe'],
  },
  {
    value: 'emergency_callout',
    slug: 'emergency-tyre-callout',
    label: 'Emergency call-out',
    seoTitle: 'Emergency Tyre Call-Out Edinburgh',
    description: 'Priority roadside support across Edinburgh and nearby routes.',
    longDescription:
      'Emergency tyre support for breakdown-style situations across Edinburgh city roads, bypass approaches and nearby countryside routes. Add access and safety notes so the call-out can be handled quickly.',
    includes: ['Priority call-out request', 'Roadside access notes', 'Fast availability check'],
  },
  {
    value: 'locking_wheel_nut',
    slug: 'locking-wheel-nut-removal',
    label: 'Locking wheel nut help',
    seoTitle: 'Locking Wheel Nut Removal Edinburgh',
    description: 'Removal support before fitting or replacement.',
    longDescription:
      'Get help when a locking wheel nut key is missing, damaged or unavailable. The form records the lock status so the technician can prepare the right job notes.',
    includes: ['Locking nut status captured', 'Fitting or replacement support', 'Clear visit notes before confirmation'],
  },
] as const;

export type ServiceValue = (typeof serviceOptions)[number]['value'];

export function getServiceOption(value: string) {
  return serviceOptions.find((service) => service.value === value) ?? serviceOptions[0];
}

export function getServiceBySlug(slug: string) {
  return serviceOptions.find((service) => service.slug === slug);
}

export function serviceNeedsTyreSize(value: ServiceValue | string): boolean {
  return value === 'mobile_fitting' || value === 'emergency_callout';
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value);
}
