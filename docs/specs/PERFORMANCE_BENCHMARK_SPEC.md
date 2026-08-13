# Windforge Performance Benchmark Specification

## Goal

Measure real performance instead of relying on architecture claims.

## Benchmark categories

### Compiler

- cold compile
- incremental compile
- candidate extraction
- parser throughput
- IR generation
- optimization
- cache hit rate

### Runtime

- static class resolution
- dynamic class resolution
- cache hit/miss
- style allocation
- render count

### Native

- JS baseline
- JSI
- Nitro
- C++
- ShadowTree update path

### Animation

- JS thread activity
- UI thread frame stability
- dropped frames
- animation startup latency
- React render count

### Web

- CSS generation
- SSR generation
- hydration
- runtime style lookup

## Comparisons

When comparing against Uniwind or NativeWind:

- same React Native version
- same device/simulator
- same component tree
- same number of styles
- same interaction
- same build mode
- same Reanimated version

Never compare different configurations and call the result a framework benchmark.

## Required metrics

At minimum:

- median
- p95
- allocations where measurable
- render count
- JS execution time
- frame timing for animations

## Reproducibility

Benchmarks must record:

- RN version
- Expo SDK
- React version
- Reanimated version
- Node version
- platform
- device
- build mode
- Windforge commit

## How to run

Build-time suites (vitest bench, local machine):

```sh
pnpm install --frozen-lockfile
pnpm build                        # bench files import built workspaces via turbo
pnpm --filter @windforge/tailwind bench   # cold/incremental compile, scanFiles, lowering
pnpm --filter @windforge/metro bench      # compileWindforge end-to-end
pnpm --filter @windforge/react-native bench  # runtime resolution categories
```

`pnpm bench` runs every package bench through turbo.

Recording a run in `docs/reference/BENCHMARK_RECORDS.md`:

1. run the suites above on a clean (or noted-dirty) checkout
2. `node scripts/bench-env.mjs` — paste its table as the entry's
   environment record (zero-dependency; commit, Node, OS/CPU, stack
   versions)
3. copy the numbers vitest printed (hz, min, mean, p75, p99, rme,
   samples) verbatim — never round into nicer numbers, never estimate

Benchmarks are local reference measurements. They are not a CI gate and
not a comparison against other frameworks unless the §Comparisons
conditions are all met.
