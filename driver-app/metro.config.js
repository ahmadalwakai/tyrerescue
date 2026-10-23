// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
config.resolver.platforms = Array.from(
  new Set(['web', ...(config.resolver.platforms || [])]),
);

const webSecureStoreShim = path.join(__dirname, 'src/shims/expo-secure-store.web.ts');
const webServiceShims = new Map([
  ['@/services/notifications', path.join(__dirname, 'src/services/notifications.web.ts')],
  ['@/services/sound', path.join(__dirname, 'src/services/sound.web.ts')],
  ['@/services/haptics', path.join(__dirname, 'src/services/haptics.web.ts')],
]);
const nativeServiceFiles = new Map([
  [path.join(__dirname, 'src/services/notifications.ts'), webServiceShims.get('@/services/notifications')],
  [path.join(__dirname, 'src/services/sound.ts'), webServiceShims.get('@/services/sound')],
  [path.join(__dirname, 'src/services/haptics.ts'), webServiceShims.get('@/services/haptics')],
]);

function redirectWebServiceResolution(result, platform) {
  if (platform !== 'web' || !result || result.type !== 'sourceFile') return result;
  const shim = nativeServiceFiles.get(result.filePath);
  return shim ? { type: 'sourceFile', filePath: shim } : result;
}

// Metro's internal fileSystemLookup doesn't always mark node_modules
// sub-directories as type:'d', so resolvePackageEntryPoint bails before
// it tries index.js.  react-native-web 0.21.x hits this with bare
// directory imports like `import { … } from './compiler'`.
//
// Fix: for any extensionless relative import, if <path>.js doesn't exist
// but <path>/index.js does, resolve directly — bypassing the Metro lookup.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && webServiceShims.has(moduleName)) {
    return { type: 'sourceFile', filePath: webServiceShims.get(moduleName) };
  }

  if (platform === 'web' && moduleName.startsWith('expo-secure-store')) {
    return { type: 'sourceFile', filePath: webSecureStoreShim };
  }

  if (moduleName.startsWith('.') && !path.extname(moduleName)) {
    const fromDir = path.dirname(context.originModulePath);
    const absPath = path.join(fromDir, moduleName);
    const indexJs = path.join(absPath, 'index.js');
    if (!fs.existsSync(absPath + '.js') &&
        !fs.existsSync(absPath + '.ts') &&
        !fs.existsSync(absPath + '.tsx') &&
        fs.existsSync(indexJs)) {
      return { type: 'sourceFile', filePath: indexJs };
    }
  }
  // Delegate everything else to Metro's built-in resolver.
  return redirectWebServiceResolution(
    context.resolveRequest(context, moduleName, platform),
    platform,
  );
};

module.exports = config;
