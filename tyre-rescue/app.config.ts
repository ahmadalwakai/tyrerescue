import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const merchantIdentifier = (process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID || '').trim();

  if (merchantIdentifier && !/^merchant\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*$/.test(merchantIdentifier)) {
    throw new Error('EXPO_PUBLIC_APPLE_MERCHANT_ID must be a registered Apple merchant identifier beginning with merchant.');
  }

  // The same build-time identifier drives the entitlement and the native payment UI.
  // Leave Apple Pay disabled until the Apple/Stripe certificate setup is complete.
  const plugins: NonNullable<ExpoConfig['plugins']> = (config.plugins || []).map((plugin) => {
    const name = typeof plugin === 'string' ? plugin : plugin[0];
    if (name !== '@stripe/stripe-react-native') return plugin;

    const options = typeof plugin === 'string' ? {} : plugin[1] || {};
    const { merchantIdentifier: previousMerchantIdentifier, ...otherOptions } = options;
    void previousMerchantIdentifier;
    return [name, { ...otherOptions, ...(merchantIdentifier ? { merchantIdentifier } : {}) }];
  });

  return {
    ...config,
    name: config.name || 'Tyre Rescue',
    slug: config.slug || 'tyre-rescue',
    plugins,
    extra: {
      ...config.extra,
      appleMerchantIdentifier: merchantIdentifier,
    },
  };
};
