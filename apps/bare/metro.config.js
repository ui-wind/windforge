// Windforge Metro integration for a bare React Native CLI project.
//
// Same shape as apps/example, but getDefaultConfig comes from
// @react-native/metro-config instead of expo/metro-config — @windforge/metro
// is bundler-agnostic (MetroConfigLike structural typing). No Babel plugin:
// everything happens in compileWindforge (build-time artifact) plus the
// resolver hook withWindforge installs.
//
// compileWindforge also starts the source watcher (default on): edit a class
// in src/ or global.css and the artifact regenerates without restarting
// Metro — Metro invalidates `windforge/generated` on its own.
const path = require('node:path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { compileWindforge, withWindforge } = require('@windforge/metro');

module.exports = (async () => {
  const outputDir = path.resolve(__dirname, '.windforge');
  const workspaceRoot = path.resolve(__dirname, '../..');

  await compileWindforge({
    entry: path.resolve(__dirname, './src/global.css'),
    base: __dirname,
    outputDir,
  });

  const config = mergeConfig(getDefaultConfig(__dirname), {
    // Monorepo: watch workspace packages outside the app root so Metro can
    // resolve @windforge/* through pnpm symlinks.
    watchFolders: [workspaceRoot],
    resolver: {
      nodeModulesPaths: [
        path.resolve(__dirname, 'node_modules'),
        path.resolve(workspaceRoot, 'node_modules'),
      ],
    },
  });

  return withWindforge(config, {
    input: './src/global.css',
    outputDir,
  });
})();
