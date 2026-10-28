/** Current bOnline business line used for customer calls. */
export const BUSINESS_PHONE_DISPLAY = '01932 509613' as const;
export const BUSINESS_PHONE_TEL = '01932509613' as const;
export const BUSINESS_PHONE_E164 = '+441932509613' as const;

/** Existing website service location; separate from the company's legal address. */
export const WORKSHOP_ADDRESS = {
  streetAddress: '3, 10 Gateside St',
  addressLocality: 'Glasgow',
  postalCode: 'G31 1PD',
  addressRegion: 'Scotland',
  addressCountry: 'GB',
} as const;

export const WORKSHOP_ADDRESS_LABEL = `${WORKSHOP_ADDRESS.streetAddress}, ${WORKSHOP_ADDRESS.addressLocality} ${WORKSHOP_ADDRESS.postalCode}`;
