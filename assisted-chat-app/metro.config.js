// https://docs.expo.dev/guides/customizing-metro
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// On Windows, Metro's FallbackWatcher crashes when it tries to watch
// Android CMake build-artifact directories that are created and removed
// during builds.  Exclude these paths from both module resolution and
// the file-system watcher.
const androidCxxPattern = /node_modules[/\\][^/\\]+[/\\]android[/\\]\.cxx[/\\]/;

config.resolver.blockList = [androidCxxPattern];

// Metro file-map watcher: pass the same pattern as the "ignored" regex so
// the FallbackWatcher (used on Windows without watchman) never tries to
// fs.watch() transient CMake directories.
config.watchFolders = (config.watchFolders ?? []).filter(
  (f) => !androidCxxPattern.test(f),
);

module.exports = config;
