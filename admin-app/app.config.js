// Dynamic Expo config. Loads the static app.json and injects the Mapbox
// build-time download token from the environment so the secret never lives
// in source control. Set MAPBOX_DOWNLOAD_TOKEN in admin-app/.env (gitignored)
// or in your EAS build secrets. This token is the `sk.` secret used by the
// @rnmapbox/maps config plugin to download the native SDK at build time —
// it is separate from the runtime EXPO_PUBLIC_MAPBOX_TOKEN (`pk.`) used by
// Mapbox.setAccessToken() in app/_layout.tsx.
module.exports = ({ config }) => {
  const downloadToken = process.env.MAPBOX_DOWNLOAD_TOKEN ?? '';

  const plugins = (config.plugins ?? []).map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === '@rnmapbox/maps') {
      return [
        '@rnmapbox/maps',
        { ...(plugin[1] ?? {}), RNMapboxMapsDownloadToken: downloadToken },
      ];
    }
    return plugin;
  });

  return { ...config, plugins };
};
