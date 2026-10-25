const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, theme } = require('./chat-modals.test.cjs');

function createHarness() {
  const state = {
    companyId: 'isolated-company-a',
    company: {
      id: 'isolated-company-a', companyNumber: 'SC000000', legalName: 'Isolated Example Ltd',
      registeredAddressLine1: 'Example Street', registeredCity: 'Glasgow', registeredCountry: 'Scotland',
      registeredPostcode: 'G1 1AA', version: 1,
    },
    loading: false, error: null, saved: [], loadCalls: 0,
  };
  const hooks = [];
  let cursor = 0;
  const element = (type, props) => ({ type, props });
  const { default: Screen } = loadSource('../app/tax-payroll/settings.tsx', {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
        return [hooks[index], (next) => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }];
      },
      useCallback: (callback) => callback,
      useEffect: () => {},
    },
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', Alert: { alert: () => {} }, Pressable: 'Pressable',
      ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
      StyleSheet: { create: (styles) => styles },
    },
    'expo-router': { useLocalSearchParams: () => ({ companyId: state.companyId }), useRouter: () => ({ back: () => {} }) },
    '@/hooks/useCompanyTaxSettings': {
      useCompanyTaxSettings: () => ({
        company: state.company, loading: state.loading, error: state.error, saving: false, saveError: null,
        load: async () => { state.loadCalls += 1; },
        updateCompany: async (draft) => { state.saved.push(draft); return state.company; },
      }),
    },
    '@/components/theme': theme,
  });
  function render() { cursor = 0; return Screen(); }
  function find(predicate) {
    const visit = (tree) => {
      if (!tree || typeof tree !== 'object') return undefined;
      if (Array.isArray(tree)) return tree.map(visit).find(Boolean);
      if (predicate(tree)) return tree;
      return visit(tree.props?.children);
    };
    return visit(render());
  }
  const field = (label) => {
    const found = find((node) => node.props?.label === label);
    assert.ok(found, `Missing company field ${label}`);
    return found.props;
  };
  return { state, render, find, field };
}

test('company details render directly from the loaded profile before the first edit', () => {
  const h = createHarness();
  assert.equal(h.field('Legal Name').value, 'Isolated Example Ltd');
  assert.equal(h.field('Address Line 1').value, 'Example Street');
  assert.equal(h.field('Business Email (optional)').value, '');
  assert.equal(h.find((node) => node.type === 'ActivityIndicator'), undefined);
});

test('editing retains untouched company fields and earlier edits when saving the form', async () => {
  const h = createHarness();
  h.field('Legal Name').onChangeText('Edited Example Ltd');
  h.field('City').onChangeText('Edinburgh');
  const save = h.find((node) => node.type === 'Pressable' && typeof node.props.onPress === 'function');
  await save.props.onPress();
  assert.equal(h.state.saved.length, 1);
  assert.equal(h.state.saved[0].legalName, 'Edited Example Ltd');
  assert.equal(h.state.saved[0].registeredCity, 'Edinburgh');
  assert.equal(h.state.saved[0].registeredAddressLine1, 'Example Street');
  assert.equal(h.state.saved[0].registeredPostcode, 'G1 1AA');
});

test('a refreshed company response does not silently overwrite an in-progress edit', () => {
  const h = createHarness();
  h.field('Legal Name').onChangeText('Draft Example Ltd');
  h.state.company = { ...h.state.company, legalName: 'Changed Elsewhere Ltd', version: 2 };
  assert.equal(h.field('Legal Name').value, 'Draft Example Ltd');
});

test('switching companies never reuses the previous company draft', () => {
  const h = createHarness();
  h.field('Legal Name').onChangeText('Company A unfinished edit');
  h.state.companyId = 'isolated-company-b';
  h.state.company = { ...h.state.company, id: h.state.companyId, legalName: 'Isolated Company B' };
  assert.equal(h.field('Legal Name').value, 'Isolated Company B');
});

test('a failed initial load shows the retry action rather than an endless loading spinner', async () => {
  const h = createHarness();
  h.state.company = null;
  h.state.error = 'Isolated network unavailable';
  assert.match(JSON.stringify(h.render()), /Isolated network unavailable/);
  assert.equal(h.find((node) => node.type === 'ActivityIndicator'), undefined);
  const retry = h.find((node) => node.type === 'Pressable');
  assert.ok(retry);
  await retry.props.onPress();
  assert.equal(h.state.loadCalls, 1);
});
