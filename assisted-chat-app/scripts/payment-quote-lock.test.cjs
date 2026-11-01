const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource } = require('./chat-modals.test.cjs');

const money = loadSource('lib/money.ts', {});
const element = (type, props) => ({ type, props });
const { CompactQuoteCard } = loadSource('components/quote/CompactQuoteCard.tsx', {
  'react/jsx-runtime': { jsx: element, jsxs: element },
  'react-native': { Platform: { select: (values) => values.default }, StyleSheet: { create: (styles) => styles }, Pressable: 'Pressable', Text: 'Text', View: 'View' },
  '@/lib/money': money,
  '@/lib/quote-price-display': loadSource('lib/quote-price-display.ts', { './money': money }),
  '../ui/ActionButton': { ActionButton: 'ActionButton' },
  '../theme': loadSource('components/theme.ts', {}),
});
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function render(lockedReason) {
  let edits = 0;
  const tree = CompactQuoteCard({
    displayedPriceGbp: 120, isManualPrice: false, status: 'CONFIRMED', savedQuoteRef: 'TEST-QUOTE', expiryText: null,
    priceNeedsRefresh: false, priceLoading: false, missingQuickBooking: false, saveBusy: false, payBusy: false,
    lockedReason, onEditPrice: () => { edits += 1; }, onSaveQuote: () => {}, onPay: () => {}, onToggleBreakdown: () => {},
  });
  return { tree, all: nodes(tree), edits: () => edits };
}

test('payment preparation and saved checkout lock the quoted amount and saving while keeping the breakdown readable', () => {
  for (const reason of ['Creating payment link. Please wait.', 'This booking already has a payment link.']) {
    const h = render(reason);
    const price = h.all.find((node) => node.props?.accessibilityLabel === 'Edit quote price');
    assert.equal(price.props.disabled, true);
    assert.equal(price.props.onPress, undefined);
    assert.equal(h.edits(), 0);
    const actions = h.all.filter((node) => node.type === 'ActionButton');
    assert.equal(actions.length, 2);
    assert.ok(actions.every((node) => node.props.disabled && node.props.disabledReason === reason));
    assert.ok(h.all.some((node) => node.type === 'Text' && node.props.children === reason));
    assert.ok(h.all.some((node) => node.type === 'Pressable' && typeof node.props.onPress === 'function'));
  }
});

test('payment method selection still allows price editing before a link is created', () => {
  const h = render(null);
  const price = h.all.find((node) => node.props?.accessibilityLabel === 'Edit quote price');
  assert.equal(price.props.disabled, false);
  price.props.onPress();
  assert.equal(h.edits(), 1);
  assert.ok(h.all.filter((node) => node.type === 'ActionButton').every((node) => !node.props.disabled));
});
