import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculatePricing, parsePricingRules, type PricingInput } from '../pricing-engine';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('assisted chat emergency pricing context', () => {
  it('uses the emergency mobile fitting context in the assisted app', () => {
    const contextSource = readSource('assisted-chat-app/src/lib/pricing-context.ts');
    expect(contextSource).toContain("'emergency_mobile_fitting'");

    for (const file of [
      'assisted-chat-app/src/hooks/useAssistedChatPrice.ts',
      'assisted-chat-app/src/hooks/useAssistedChatLocationShare.ts',
      'assisted-chat-app/src/hooks/useAssistedChatQuoteActions.ts',
      'assisted-chat-app/src/hooks/useAssistedChatDispatch.ts',
      'assisted-chat-app/src/components/quote/EditQuotePriceModal.tsx',
    ]) {
      const source = readSource(file);
      expect(source).toContain('ASSISTED_CHAT_PRICING_CONTEXT');
      expect(source).toContain('ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES');
      expect(source).not.toContain("pricingContext: 'assisted_chat'");
      expect(source).not.toContain('pricingContext: "assisted_chat"');
    }
  });

  it('maps assisted chat quick-book requests to emergency bookings', async () => {
    process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
    const { resolveQuickBookBookingType } = await import('../quick-book-pricing');

    expect(resolveQuickBookBookingType('emergency_mobile_fitting')).toBe('emergency');
    expect(resolveQuickBookBookingType('admin_quick_book')).toBe('emergency');
    expect(resolveQuickBookBookingType('assisted_chat')).toBe('emergency');
    expect(resolveQuickBookBookingType('scheduled_mobile_fitting')).toBe('scheduled');
    expect(resolveQuickBookBookingType('scheduled_garage_fitting')).toBe('scheduled');
  });

  it('prices assisted app context the same as backend emergency mobile context', async () => {
    const { ASSISTED_CHAT_PRICING_CONTEXT } = await import('../../assisted-chat-app/src/lib/pricing-context');
    const rules = parsePricingRules([]);
    const base: PricingInput = {
      tyreSelections: [{ tyreId: 'tyre-1', quantity: 2, unitPrice: 80, service: 'fit' }],
      distanceMiles: 100,
      bookingType: 'emergency',
      bookingDate: new Date('2025-01-06T10:00:00Z'),
      isBankHoliday: false,
    };

    const assisted = calculatePricing(
      { ...base, pricingContext: ASSISTED_CHAT_PRICING_CONTEXT },
      rules,
    );
    const backendEmergency = calculatePricing(
      { ...base, pricingContext: 'emergency_mobile_fitting' },
      rules,
    );

    expect(assisted.isValid).toBe(true);
    expect(assisted.total).toBe(backendEmergency.total);
    expect(assisted.tyreSubtotal).toBe(backendEmergency.tyreSubtotal);
    expect(assisted.serviceSubtotal).toBe(backendEmergency.serviceSubtotal);
    expect(assisted.calloutFee).toBe(backendEmergency.calloutFee);
    expect(assisted.lineItems.map((item) => [item.code, item.amount])).toEqual(
      backendEmergency.lineItems.map((item) => [item.code, item.amount]),
    );
  });

  it('allows the assisted app explicit admin distance override up to 250 miles only when supplied', async () => {
    const {
      ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES,
      ASSISTED_CHAT_PRICING_CONTEXT,
    } = await import('../../assisted-chat-app/src/lib/pricing-context');
    const rules = parsePricingRules([]);
    const base: PricingInput = {
      tyreSelections: [{ tyreId: 'tyre-1', quantity: 1, unitPrice: 80, service: 'fit' }],
      distanceMiles: 100.01,
      bookingType: 'emergency',
      bookingDate: new Date('2025-01-06T10:00:00Z'),
      isBankHoliday: false,
      pricingContext: ASSISTED_CHAT_PRICING_CONTEXT,
    };

    const defaultLimit = calculatePricing(base, rules);
    const assistedLimit = calculatePricing(
      {
        ...base,
        distanceMiles: 250,
        maxAutoPricingMiles: ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES,
      },
      rules,
    );

    expect(defaultLimit.isValid).toBe(false);
    expect(defaultLimit.error).toBe('OUTSIDE_AUTO_PRICING_AREA');
    expect(ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES).toBe(250);
    expect(assistedLimit.isValid).toBe(true);
    expect(assistedLimit.maxAutoPricingMiles).toBe(250);
  });
});

describe('assisted chat price copy and display regressions', () => {
  it('does not reintroduce fitting-at-location copy in assisted chat customer messages', () => {
    for (const file of [
      'assisted-chat-app/src/components/ActionButtons.tsx',
      'assisted-chat-app/src/components/PaymentLinkCard.tsx',
      'assisted-chat-app/src/components/PriceSummary.tsx',
      'assisted-chat-app/src/lib/customer-message.ts',
    ]) {
      expect(readSource(file)).not.toMatch(/Fitting at your location|Fit at your location/);
    }
  });

  it('does not use the fitting-at-location label as a total heading in customer/admin UI', () => {
    for (const file of [
      'components/booking/StepPricing.tsx',
      'components/booking/StepCustomerDetails.tsx',
      'components/booking/StepPayment.tsx',
      'components/admin/quick-book/QuickBookForm.tsx',
    ]) {
      const source = readSource(file);
      expect(source).not.toContain('FITTING_AT_LOCATION_LABEL');
      expect(source).not.toContain('getSeparateFittingPrice');
    }
  });

  it('does not leave stale 60-mile manual-quote copy in quote endpoints', () => {
    for (const file of [
      'app/api/bookings/quote/route.ts',
      'lib/quick-book-pricing.ts',
      'lib/fitting-location-pricing.ts',
    ]) {
      expect(readSource(file)).not.toMatch(/over 60 miles|60 miles away|ends at 60/i);
    }
  });
});
