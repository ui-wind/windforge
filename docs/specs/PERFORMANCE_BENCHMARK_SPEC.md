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
