# Windforge Benchmark Baseline

Reference numbers captured 2026-08-15 on Apple M-series. Absolute values are
machine-dependent; ratios and relative trends are meaningful across runs.

Run locally: `pnpm turbo run bench` (excludes packages without bench files).
CI uploads results as artifacts in the `bench` job for trend tracking.

## Compiler (packages/tailwind)

| Benchmark | Throughput | Notes |
|---|---:|---|
| compileTailwindCss — cold full pipeline | ~405 Hz | End-to-end: scan → compile → lower → artifact |
| compiler.build — sweep surface (incremental) | ~2,043K Hz | Oxide compiler reused, only changed files reprocessed |
| compiler.build — large candidate set | ~42K Hz | 100+ candidates per build call |
| scanFiles — 64 files × 24 lines | ~2,630 Hz | Content-based candidate extraction |
| buildArtifact — large stylesheet | ~54 Hz | CSS → IR lowering + artifact construction |

Key ratio: incremental compile is ~5,000× faster than cold compile (oxide reuse).

## Runtime resolve (packages/react-native)

| Benchmark | Throughput | Notes |
|---|---:|---|
| warm resolve — composed-string cache hit | ~2,008K Hz | Artifact lookup with cache warm |
| cold resolve — cache cleared each iteration | ~468K Hz | First-time resolution from artifact |
| fallback parse + lower — cold | ~662K Hz | Runtime parser path (no artifact entry) |
| fallback cache hit — warm composed-string | ~2,973K Hz | Fallback path after first parse cached |

Key ratios:
- Warm cache hit is 4.3× faster than cold resolve
- Fallback cache hit is 4.5× faster than fallback cold parse

## Metro compiler (packages/metro)

Bench file exists at `packages/metro/tests/compiler.bench.ts`. Numbers vary by
fixture size. Run `pnpm --filter @windforge/metro bench` to capture local baseline.
