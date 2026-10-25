/** Existing website service location; separate from the company's legal address. */
export const WORKSHOP_ADDRESS = {
  streetAddress: '3, 10 Gateside St',
  addressLocality: 'Glasgow',
  postalCode: 'G31 1PD',
  addressRegion: 'Scotland',
  addressCountry: 'GB',
} as const;

export const WORKSHOP_ADDRESS_LABEL = `${WORKSHOP_ADDRESS.streetAddress}, ${WORKSHOP_ADDRESS.addressLocality} ${WORKSHOP_ADDRESS.postalCode}`;
