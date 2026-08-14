# @windforge/cli

Windforge command-line interface for compiling Tailwind CSS to Windforge artifacts.

## Installation

```bash
pnpm add -D @windforge/cli
```

## Commands

### `windforge generate <entry.css>`

Compile a CSS entry file through the full Tailwind v4 pipeline and emit Windforge artifacts.

```bash
# Generate JS module (default output: same dir as entry)
windforge generate src/global.css

# Custom output directory
windforge generate src/global.css --output ./generated

# Dump artifact JSON for inspection/debugging
windforge generate src/global.css --dump-ir

# Target web platform
windforge generate src/global.css --platform web

# Combine options
windforge generate src/global.css --output ./out --dump-ir --platform native
```

**Output files:**
- `generated.js` — ES module with `registerArtifact()` call, ready for Metro/Vite consumption
- `artifact.json` — (with `--dump-ir`) Pretty-printed runtime artifact containing all styles, themes, variants, and diagnostics

### `windforge compile <input.json>`

Phase 0 utility: compile an IR fixture document to canonical form with a deterministic hash.

```bash
windforge compile fixture.json
windforge compile fixture.json --output canonical.txt
```

## Exit Codes

| Code | Meaning |
|---:|---|
| 0 | Success |
| 1 | Error (invalid input, missing file, unknown command) |

## Diagnostics

All commands print diagnostics to stderr in the format:

```
[severity] WFxxxx: message
```

Diagnostic codes:
- `WF0001`–`WF0003`: IR fixture validation (compile command)
- `WF0010`: Entry file not found (generate command)
- `WF1xxx`: Tailwind frontend layer (compiler warnings/errors)
