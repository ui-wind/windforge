// Resolve benchmarks — static artifact path vs controlled fallback path.
// Run with `pnpm --filter @windforge/react-native bench`.
import { bench, describe } from 'vitest';
import { __resetRegistry, registerArtifact } from '../src/registry.js';
import { __clearStyleCache, resolveClassNames } from '../src/resolve.js';
import type { ConditionState } from '../src/state.js';
import type { RuntimeArtifact } from '../src/types.js';

const light: ConditionState = {
  colorScheme: 'light',
  platform: 'ios',
  windowWidth: 390,
  windowHeight: 844,
};

// p-9 is intentionally NOT in the artifact: it exercises the controlled
// runtime fallback parser (@windforge/ir parseStaticUtility).
const artifact: RuntimeArtifact = {
  version: 1,
  irVersion: 1,
  hash: 'bench-phase5',
  styles: {
    'p-4': {
      base: [{ property: 'padding', value: { kind: 'number', value: 16 }, sourceOrder: 0 }],
    },
    'bg-zinc-950': {
      base: [{ property: 'backgroundColor', value: { kind: 'color', value: '#09090b' }, sourceOrder: 0 }],
    },
  },
  conditions: [],
};

__resetRegistry();
registerArtifact(artifact);

describe('static path (artifact)', () => {
  bench(
    'warm resolve — composed-string cache hit',
    () => {
      resolveClassNames('p-4 bg-zinc-950', light);
    },
    { time: 2000 },
  );

  bench(
    'cold resolve — cache cleared each iteration',
    () => {
      __clearStyleCache();
      resolveClassNames('p-4 bg-zinc-950', light);
    },
    { time: 2000 },
  );
});

describe('fallback path (runtime parser)', () => {
  bench(
    'fallback parse + lower — cache cleared each iteration',
    () => {
      __clearStyleCache();
      resolveClassNames('p-9', light);
    },
    { time: 2000 },
  );

  bench(
    'fallback cache hit — warm composed-string cache',
    () => {
      resolveClassNames('p-9', light);
    },
    { time: 2000 },
  );
});
