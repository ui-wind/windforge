# Windforge Benchmark Records

Every entry below is a real measured run. No number is estimated,
projected, or copied from another project. When adding an entry, copy the
latest one, replace the measurements, and paste the output of
`node scripts/bench-env.mjs` as the environment table.

How to reproduce an entry — see
[PERFORMANCE_BENCHMARK_SPEC.md → How to run](../specs/PERFORMANCE_BENCHMARK_SPEC.md#how-to-run).

## 2026-08-13 — Phase 9 build-time suite, first recorded run

### Environment

| Field | Value |
|---|---|
| Date | 2026-08-13T16:02:31.919Z |
| Commit | 045e13d (dirty working tree) |
| Node | v22.22.2 |
| OS | darwin 25.3.0 |
| CPU | Apple M4 (10 cores) |
| Memory | 24.0 GiB |
| expo | ~57.0.12 |
| react-native | 0.86.2 |
| react | 19.2.3 |
| react-native-web | ~0.21.0 |
| react-native-reanimated | 4.5.1 |
| react-native-worklets | 0.10.1 |
| tailwindcss | ^4.1.11 (declared) |
| @tailwindcss/oxide | ^4.1.11 (declared) |
| lightningcss | ^1.30.1 (declared) |

"Dirty working tree" is expected: this run recorded the Phase 9 benchmark
suite itself before commit. Vitest 3.2.7, turbo 2.10.9, pnpm 10.33.4.

### Build-time — `packages/tailwind/tests/compile.bench.ts`

Cold compile runs the full `compileTailwindCss` pipeline (oxide compiler
created per iteration). Incremental reuses one compiled compiler and calls
`build()` with a candidate array that rotates one arbitrary candidate per
call, so oxide's memo cache misses and the number measures real rebuild
work (identical arrays return a memoized build — measured separately at
~0.02 ms). Candidate sets: sweep surface = 28 candidates; large set =
4,748 candidates (12 hues × 11 shades × 3 color utilities + spacing
scale × 5 axes + `w-[Npx]`/`p-[Npx]` for N = 1..300).

| Bench | hz | min ms | mean ms | p75 ms | p99 ms | rme | samples |
|---|---|---|---|---|---|---|---|
| compileTailwindCss — sweep surface (cold) | 541.17 | 1.1063 | 1.8478 | 2.3429 | 4.7877 | ±2.83% | 1083 |
| compiler.build — sweep surface (incremental, cache-busted) | 2,154,058.97 | 0.0003 | 0.0005 | 0.0004 | 0.0012 | ±0.69% | 4,308,118 |
| compiler.build — large candidate set (incremental, cache-busted) | 48,374.83 | 0.0135 | 0.0207 | 0.0160 | 0.0398 | ±2.80% | 96,750 |
| scanFiles — 64 files × 24 lines | 3,025.38 | 0.2211 | 0.3305 | 0.3521 | 0.4964 | ±0.42% | 6,051 |
| buildArtifact — large stylesheet (4,748 classes) | 57.13 | 15.2106 | 17.5040 | 17.6668 | 22.2122 | ±1.20% | 115 |

Reading: the incremental small-set number is oxide's steady-state rebuild
cost for a 28-candidate set with one candidate changed — the dominant cost
on that path lives outside the compiler. Candidate→IR lowering of a
4,748-class stylesheet takes ~17.5 ms median.

### Build-time — `packages/metro/tests/compiler.bench.ts`

End-to-end `compileWindforge` (scan fixture app → compile → lower → write
generated module) on `tests/fixtures/app`, with and without the extension
trio (`glass` utility, `brand` color tokens, `land` orientation variant)
used by the example app.

| Bench | hz | min ms | mean ms | p75 ms | p99 ms | rme | samples |
|---|---|---|---|---|---|---|---|
| fixture app — no extensions | 297.13 | 2.2316 | 3.3655 | 3.7395 | 6.6967 | ±2.02% | 595 |
| fixture app — extension trio | 260.69 | 2.3810 | 3.8360 | 4.3524 | 8.1498 | ±2.89% | 522 |

### Stress context (same machine, same session)

- Full-utility-surface sweep: 118 supported candidates + controls, zero
  WF1001/1002/1003/1005 diagnostics, exactly one expected WF1004, two
  builds byte-identical (`packages/tailwind/tests/stress.test.ts`).
- Large-N stress: 4,748 candidates → 4,748 artifact classes; two builds
  completed in 274 ms wall time combined on this machine (guard:
  < 120,000 ms).

### Runtime categories

Runtime resolution benchmarks live in
`packages/react-native/tests/resolve.bench.ts` (not rerun in this entry).
Native, animation, and web categories are manual runbook measurements
recorded in the phase sections of `docs/IMPLEMENTATION_ROADMAP.md`.
