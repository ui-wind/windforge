/**
 * Windforge extension configuration for the example app (Phase 8 demo).
 *
 * Loaded by metro.config.js (CJS, zero magic: the app requires its own
 * config). Extensions are rendered to CSS text by @windforge/extension-sdk
 * and injected into src/global.css before Tailwind compilation; the demo
 * frontend hand-writes a small runtime artifact that registers after the
 * Tailwind one.
 */
const { defineTokens, defineUtility, defineVariant } = require('@windforge/extension-sdk');
const { IR_VERSION } = require('@windforge/ir');
const { ARTIFACT_VERSION } = require('@windforge/tailwind');

const extensions = [
  defineUtility({ name: 'glass', css: 'opacity: 0.8;' }),
  defineTokens({ colors: { brand: '#22c55e' } }),
  defineVariant({ name: 'land', media: '(orientation: landscape)' }),
];

const frontends = [
  {
    name: 'example-handwritten',
    generate: () => [
      {
        version: ARTIFACT_VERSION,
        irVersion: IR_VERSION,
        hash: 'example-frontend-v1',
        styles: {
          'card-pad': {
            base: [{ property: 'padding', value: { kind: 'number', value: 20 }, sourceOrder: 0 }],
          },
          'card-radius': {
            base: [
              { property: 'borderRadius', value: { kind: 'number', value: 14 }, sourceOrder: 0 },
            ],
          },
        },
        conditions: [],
        dependencies: { 'card-pad': [], 'card-radius': [] },
      },
    ],
  },
];

module.exports = { extensions, frontends };
