// Windforge Metro integration.
//
// compileWindforge runs the build pipeline (source discovery -> Tailwind v4 ->
// CSS AST -> Style IR) and writes the generated runtime module; withWindforge
// installs the resolver hook that maps `windforge/generated` to it.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { compileWindforge, withWindforge } = require('@windforge/metro');

module.exports = (async () => {
  const outputDir = path.resolve(__dirname, '.windforge');

  // The app owns its config file (zero magic in @windforge/metro).
  const windforgeConfig = require('./windforge.config.cjs');

  await compileWindforge({
    entry: path.resolve(__dirname, './src/global.css'),
    base: __dirname,
    outputDir,
    extensions: windforgeConfig.extensions,
    frontends: windforgeConfig.frontends,
  });

  const config = getDefaultConfig(__dirname);

  // Monorepo: let Metro watch workspace packages outside the app root so it
  // can resolve @windforge/* through pnpm symlinks.
  const workspaceRoot = path.resolve(__dirname, '../..');
  config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot];

  return withWindforge(config, {
    input: './src/global.css',
    outputDir,
  });
})();
