// Windforge Metro integration.
//
// Phase 0: withWindforge attaches Windforge options without changing Metro's
// transform behavior. Phase 1 plugs the compile pipeline
// (source discovery -> Tailwind v4 -> CSS AST -> Style IR) into this seam, so
// this file should not need to change between phases.
const { getDefaultConfig } = require('expo/metro-config');
const { withWindforge } = require('@windforge/metro');

const config = getDefaultConfig(__dirname);

module.exports = withWindforge(config, {
  input: './src/global.css',
});
