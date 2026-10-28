export const ASSISTED_CHAT_PRICING_CONTEXT = 'emergency_mobile_fitting' as const;
export const ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES = 500;

export function getAssistedChatPricingContext(draft: { bookingType?: 'emergency' | 'scheduled' }) {
  return draft.bookingType === 'scheduled' ? 'scheduled_mobile_fitting' as const : ASSISTED_CHAT_PRICING_CONTEXT;
}
