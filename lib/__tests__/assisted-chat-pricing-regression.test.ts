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

  it('auto-prices assisted app distances up to 500 miles', async () => {
    const {
      ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES,
      ASSISTED_CHAT_PRICING_CONTEXT,
    } = await import('../../assisted-chat-app/src/lib/pricing-context');
    const rules = parsePricingRules([]);
    const base: PricingInput = {
      tyreSelections: [{ tyreId: 'tyre-1', quantity: 1, unitPrice: 80, service: 'fit' }],
      distanceMiles: 500,
      bookingType: 'emergency',
      bookingDate: new Date('2025-01-06T10:00:00Z'),
      isBankHoliday: false,
      pricingContext: ASSISTED_CHAT_PRICING_CONTEXT,
      maxAutoPricingMiles: ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES,
    };

    const assistedLimit = calculatePricing(base, rules);
    const overLimit = calculatePricing(
      {
        ...base,
        distanceMiles: 500.01,
      },
      rules,
    );

    expect(assistedLimit.isValid).toBe(true);
    expect(ASSISTED_CHAT_ADMIN_DISTANCE_LIMIT_MILES).toBe(500);
    expect(overLimit.isValid).toBe(false);
    expect(overLimit.error).toBe('OUTSIDE_AUTO_PRICING_AREA');
  });

  it('prices inspection-only assisted chat jobs without tyre details', async () => {
    const { ASSISTED_CHAT_PRICING_CONTEXT } = await import('../../assisted-chat-app/src/lib/pricing-context');
    const rules = parsePricingRules([]);
    const result = calculatePricing(
      {
        tyreSelections: [],
        serviceType: 'assess',
        tyreQuantity: 1,
        distanceMiles: 49.5,
        bookingType: 'emergency',
        bookingDate: new Date('2025-01-06T10:00:00Z'),
        isBankHoliday: false,
        pricingContext: ASSISTED_CHAT_PRICING_CONTEXT,
        maxAutoPricingMiles: 500,
      },
      rules,
    );

    expect(result.isValid).toBe(true);
    expect(result.tyreSubtotal).toBe(0);
    expect(result.lineItems.some((item) => item.label === 'Assessment × 1')).toBe(true);
    expect(result.lineItems.some((item) => item.code === 'TRAVEL_DISTANCE')).toBe(true);
    expect(result.lineItems.some((item) => item.code === 'EMERGENCY_PRIORITY')).toBe(true);
    expect(result.total).toBeGreaterThan(0);
  });

  it('prices locking wheel nut assisted chat jobs without tyre details', async () => {
    const { ASSISTED_CHAT_PRICING_CONTEXT } = await import('../../assisted-chat-app/src/lib/pricing-context');
    const rules = parsePricingRules([]);
    const result = calculatePricing(
      {
        tyreSelections: [],
        serviceType: 'locking_nut',
        tyreQuantity: 1,
        distanceMiles: 12,
        bookingType: 'emergency',
        bookingDate: new Date('2025-01-06T10:00:00Z'),
        isBankHoliday: false,
        pricingContext: ASSISTED_CHAT_PRICING_CONTEXT,
        maxAutoPricingMiles: 500,
      },
      rules,
    );

    expect(result.isValid).toBe(true);
    expect(result.tyreSubtotal).toBe(0);
    expect(result.lineItems.some((item) => item.label === 'Locking Wheel Nut Removal × 1')).toBe(true);
    expect(result.total).toBeGreaterThan(0);
  });

  it('keeps replacement, repair, and inspection assisted chat prices distinct', async () => {
    const { ASSISTED_CHAT_PRICING_CONTEXT } = await import('../../assisted-chat-app/src/lib/pricing-context');
    const rules = parsePricingRules([]);
    const base = {
      distanceMiles: 49.5,
      bookingType: 'emergency' as const,
      bookingDate: new Date('2025-01-06T10:00:00Z'),
      isBankHoliday: false,
      pricingContext: ASSISTED_CHAT_PRICING_CONTEXT,
      maxAutoPricingMiles: 500,
    };

    const replacement = calculatePricing(
      {
        ...base,
        tyreSelections: [{ tyreId: 'tyre-1', quantity: 1, unitPrice: 80, service: 'fit' }],
      },
      rules,
    );
    const repair = calculatePricing(
      {
        ...base,
        tyreSelections: [],
        serviceType: 'repair',
        tyreQuantity: 1,
      },
      rules,
    );
    const inspection = calculatePricing(
      {
        ...base,
        tyreSelections: [],
        serviceType: 'assess',
        tyreQuantity: 1,
      },
      rules,
    );

    expect(replacement.isValid).toBe(true);
    expect(repair.isValid).toBe(true);
    expect(inspection.isValid).toBe(true);
    expect(replacement.tyreSubtotal).toBeGreaterThan(0);
    expect(repair.tyreSubtotal).toBe(0);
    expect(inspection.tyreSubtotal).toBe(0);
    expect(new Set([replacement.total, repair.total, inspection.total]).size).toBe(3);
    expect(repair.total).toBeGreaterThan(inspection.total);
    expect(replacement.total).toBeGreaterThan(inspection.total);
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

  it('keeps assisted chat displays on the canonical pricing distance', () => {
    for (const file of [
      'assisted-chat-app/src/hooks/useAssistedChatPrice.ts',
      'assisted-chat-app/src/hooks/useAssistedChatLocationShare.ts',
      'assisted-chat-app/src/hooks/useAssistedChatQuoteActions.ts',
      'assisted-chat-app/src/hooks/useAssistedChatDispatch.ts',
      'assisted-chat-app/src/components/quote/EditQuotePriceModal.tsx',
    ]) {
      const source = readSource(file);
      expect(source).toContain('const pricingDistanceMiles =');
      expect(source).not.toContain('distanceKm: distanceKm ? Number(distanceKm)');
      expect(source).not.toContain('distanceKm: booking.distanceKm ? Number(booking.distanceKm)');
    }

    const screenSource = readSource('assisted-chat-app/src/components/AssistedChatScreen.tsx');
    expect(screenSource).toContain('getQuotePricingDistanceMiles');
    expect(screenSource).toContain('quotePricingDistanceMiles');
    expect(screenSource).not.toContain('draft.quote.distanceKm * 0.621371');

    const summarySource = readSource('assisted-chat-app/src/components/PriceSummary.tsx');
    expect(summarySource).toContain('Distance used for pricing: {pricingDistanceMiles.toFixed(1)} mi');
  });

  it('recalculates quick-book distance metadata on assisted chat patch', () => {
    const source = readSource('app/api/admin/quick-book/[id]/route.ts');
    expect(source).toContain('if (mergedLat != null && mergedLng != null && data.distanceKm === undefined)');
    expect(source).not.toContain("(hasField('locationLat') || hasField('locationLng')) && mergedLat");
  });

  it('supports assisted chat service-only flows without requiring tyre fields', () => {
    const workflowSource = readSource('assisted-chat-app/src/lib/assisted-chat-workflow.ts');
    expect(workflowSource).toContain("assess: 'Unknown / inspection required'");
    expect(workflowSource).toContain("locking_nut: 'Locking wheel nut removal'");
    expect(workflowSource).toContain('isAssistedChatServiceOnly(draft.serviceType)');

    const tyreSectionSource = readSource('assisted-chat-app/src/components/TyreSelectionSection.tsx');
    expect(tyreSectionSource).toContain("value: 'assess'");
    expect(tyreSectionSource).toContain("value: 'locking_nut'");
    expect(tyreSectionSource).toContain('No tyre size, tyre type, stock match or tyre price is required.');
    expect(tyreSectionSource).toContain('Final tyre cost will be confirmed after inspection.');
    expect(tyreSectionSource).toContain('No tyre replacement or repair is included.');

    const priceHookSource = readSource('assisted-chat-app/src/hooks/useAssistedChatPrice.ts');
    expect(priceHookSource).toContain('const isServiceOnly = isAssistedChatServiceOnly(serviceType)');
    expect(priceHookSource).toContain('const tyreError = isServiceOnly ? null : validateBookingTyreLines(draft.tyreLines)');
    expect(priceHookSource).toContain('const tyreLines = isServiceOnly ? [] : buildBookingTyreLinePayload(draft.tyreLines)');
    expect(priceHookSource).toContain('serviceType,');
    expect(priceHookSource).not.toContain("serviceType: 'fit'");

    const dispatchHookSource = readSource('assisted-chat-app/src/hooks/useAssistedChatDispatch.ts');
    expect(dispatchHookSource).toContain('const isServiceOnly = isAssistedChatServiceOnly(serviceType)');
    expect(dispatchHookSource).toContain('const tyreLines = isServiceOnly ? [] : buildBookingTyreLinePayload(draft.tyreLines)');
    expect(dispatchHookSource).toContain('tyreSize: isServiceOnly ? null : primaryTyre.size');

    const locationShareSource = readSource('assisted-chat-app/src/hooks/useAssistedChatLocationShare.ts');
    expect(locationShareSource).toContain('const isServiceOnly = isAssistedChatServiceOnly(serviceType)');
    expect(locationShareSource).toContain('const tyreLines = isServiceOnly ? [] : buildBookingTyreLinePayload(draft.tyreLines)');

    const quickBookPricingSource = readSource('lib/quick-book-pricing.ts');
    expect(quickBookPricingSource).toContain("export type QuickBookServiceType = 'fit' | 'repair' | 'assess' | 'locking_nut'");
    expect(quickBookPricingSource).toContain("const shouldResolveTyreProduct = input.serviceType === 'fit'");
    expect(quickBookPricingSource).toContain('const tyreSelections: TyreSelection[] = shouldResolveTyreProduct');

    const quickBookPatchSource = readSource('app/api/admin/quick-book/[id]/route.ts');
    expect(quickBookPatchSource).toContain("const incomingTyreLines = hasField('tyreLines')");
    expect(quickBookPatchSource).toContain("const isServiceOnly = mergedServiceType === 'assess' || mergedServiceType === 'locking_nut'");
    expect(quickBookPatchSource).toContain('const mergedTyreLines: QuickBookTyreLineInput[] = isServiceOnly');

    const summarySource = readSource('assisted-chat-app/src/components/PriceSummary.tsx');
    expect(summarySource).toContain('for call-out, inspection and labour');
    expect(summarySource).toContain('for locking wheel nut removal, call-out and labour');
    expect(summarySource).toContain('for tyre repair, call-out and labour');
    expect(summarySource).toContain('Final tyre cost will be confirmed after inspection.');
  });

  it('keeps vehicle lookup stale guards and blocks stock/pricing before sidewall confirmation', () => {
    const tyreSectionSource = readSource('assisted-chat-app/src/components/TyreSelectionSection.tsx');
    expect(tyreSectionSource).toContain('vehicleLookupSeq.current += 1');
    expect(tyreSectionSource).toContain('vehicleLookupAbort.current?.abort()');
    expect(tyreSectionSource).toContain('if (!mountedRef.current || seq !== vehicleLookupSeq.current) return');
    expect(tyreSectionSource).toContain('stockSearchEnabled={draft.tyreConfirmedFromSidewall}');
    expect(tyreSectionSource).toContain('Confirm this size against the tyre sidewall before booking.');
    expect(tyreSectionSource).toContain('tyreConfirmedFromSidewall: false');
    expect(tyreSectionSource).toContain('loadIndex: line.loadIndex ?? null');
    expect(tyreSectionSource).toContain('speedIndex: line.speedIndex ?? null');
    expect(tyreSectionSource).toContain('runFlat: line.runFlat ?? null');
    expect(tyreSectionSource).toContain('commercial: line.commercial ?? null');

    const workflowSource = readSource('assisted-chat-app/src/lib/assisted-chat-workflow.ts');
    expect(workflowSource).toContain('!draft.tyreConfirmedFromSidewall');
    expect(workflowSource).toContain('Confirm the tyre size from the sidewall before pricing.');
  });

  it('keeps one-tyre legacy assisted-chat payloads compatible with enriched tyre lines', () => {
    const workflowSource = readSource('assisted-chat-app/src/lib/assisted-chat-workflow.ts');

    expect(workflowSource).toContain('size: normalizeAssistedChatTyreSize(line.size) ?? line.size.trim()');
    expect(workflowSource).toContain('quantity: Math.max(1, Math.round(line.quantity || 1))');
    expect(workflowSource).toContain('axle: line.axle ?? null');
    expect(workflowSource).toContain('loadIndex: line.loadIndex ?? null');
    expect(workflowSource).toContain('speedIndex: line.speedIndex ?? null');
    expect(workflowSource).toContain('return prefix ? `${prefix}: ${line.quantity} × ${line.size}` : `${line.quantity} × ${line.size}`');
  });

  it('preserves enriched quick-book tyre-line metadata from canonical price breakdowns', async () => {
    process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
    const { extractQuickBookTyreLineSelections } = await import('../quick-book-pricing');

    const lines = extractQuickBookTyreLineSelections({
      priceBreakdown: {
        tyreLines: [
          {
            id: 'front',
            productId: 'tyre-a',
            unitPrice: 90,
            requestedSize: '225/40R18',
            normalizedSize: '225/40R18',
            quantity: 1,
            service: 'fit',
            axle: 'front',
            loadIndex: '92',
            speedIndex: 'Y',
            runFlat: false,
            xl: true,
            commercial: false,
            season: 'summer',
            source: 'sidewall',
          },
        ],
      },
    });

    expect(lines).toEqual([
      expect.objectContaining({
        id: 'front',
        axle: 'front',
        loadIndex: '92',
        speedIndex: 'Y',
        runFlat: false,
        xl: true,
        commercial: false,
        season: 'summer',
        source: 'sidewall',
      }),
    ]);
  });
});
