import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { getQuotePriceReductionDisplay } from '../../assisted-chat-app/src/lib/quote-price-display';

describe('Assisted Chat quote price reduction display', () => {
  it('shows original, new price, and discount when the manual price is lower', () => {
    expect(getQuotePriceReductionDisplay(95.24, 120)).toEqual({
      originalPriceGbp: 120,
      discountedPriceGbp: 95.24,
      discountGbp: 24.76,
      comparisonLabel: '£120.00 → £95.24',
      discountLabel: 'Discount: £24.76',
    });
  });

  it('does not show a reduction plate when the manual price is equal or higher', () => {
    expect(getQuotePriceReductionDisplay(120, 120)).toBeNull();
    expect(getQuotePriceReductionDisplay(130, 120)).toBeNull();
  });

  it('does not show a reduction plate when either price is unavailable', () => {
    expect(getQuotePriceReductionDisplay(0, 120)).toBeNull();
    expect(getQuotePriceReductionDisplay(95.24, undefined)).toBeNull();
  });

  it('passes the pre-adjustment calculated total into the compact quote price card', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../../assisted-chat-app/src/components/AssistedChatScreen.tsx'),
      'utf8',
    );
    const compactSource = readFileSync(
      path.resolve(__dirname, '../../assisted-chat-app/src/components/quote/CompactQuoteCard.tsx'),
      'utf8',
    );

    expect(source).toContain('const originalCalculatedPriceGbp = backendBaseTotal;');
    expect(source).toContain('originalCalculatedPriceGbp,');
    expect(source).toContain('originalCalculatedPriceGbp={originalCalculatedPriceGbp}');
    expect(source).not.toContain('originalCalculatedPriceGbp={engineEffectiveTotal}');
    expect(compactSource).toContain('getQuotePriceReductionDisplay(displayedPriceGbp, originalCalculatedPriceGbp)');
    expect(compactSource).toContain('priceReduction.comparisonLabel');
    expect(compactSource).toContain('priceReduction.discountLabel');
  });
});
