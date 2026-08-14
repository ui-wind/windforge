# Web — export & verification runbook

Windforge on web supports two backends:

1. **CSS-first (Phase 13, default for Vite)**: The `@windforge/vite` plugin
   compiles Tailwind CSS at build time and serves it as a static stylesheet.
   The `web-css` backend returns `{ className }` from `resolveStyle()`, and
   the browser evaluates hover/focus/active/media via pure CSS pseudo-selectors.
   No runtime IR resolution on web — zero JS overhead for styling.

2. **Runtime-resolution (legacy, Metro web)**: Metro compiles the artifact and
   styled primitives from `@windforge/react-native` resolve classNames at render
   time via react-native-web. `installNativeDelivery()` is a no-op on web.

Status: **CSS-first verified via Vite build + headless Chrome pixel-verify**
(Phase 13). Runtime-resolution was previously verified (Phase 9).

## CSS-first setup (Vite)

### Requirements

- Node 22 + pnpm (same toolchain as the rest of the monorepo)
- Vite 5/6/7 with `@windforge/vite` plugin

### Configuration

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import windforge from '@windforge/vite';

export default defineConfig({
  plugins: [
    react(),
    windforge({
      entry: './src/global.css',
    }),
  ],
});
```

### Entry point

```tsx
// src/main.tsx
import 'windforge/styles.css';  // virtual module from @windforge/vite
```

The plugin provides two virtual modules:
- `windforge/styles.css` — compiled CSS (import in your entry)
- `windforge/generated` — artifact module (for RNW interop)

### Building & serving

```bash
cd apps/vite-example
pnpm build
npx serve dist -l 4174
```

## Runtime-resolution setup (Metro web)

- Node 22 + pnpm (same toolchain as the rest of the monorepo)
- A static file server (`npx serve` is enough)
- Google Chrome for headless screenshots (verified: `--headless=new`)

## Headless screenshots (Metro web)

```bash
pnpm --filter windforge-example exec expo export --platform web
npx serve apps/example/dist -l 4173
```

The export prerenders one `.html` shell per route (8 routes verified:
`/`, `/explore`, `/animation`, `/metrics`, `/extensions`, `/stress`,
`/+not-found`, `_sitemap`). Native-only screens have web placeholders
(`animation.web.tsx`, `metrics.web.tsx`, `extensions.web.tsx`) so the web
bundle stays free of Reanimated and the native extension surface.

## Headless screenshots (Vite, CSS-first)

```bash
cd apps/vite-example
pnpm build
npx serve dist -l 4174
```

Then take a screenshot:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --window-size=430,932 \
  --virtual-time-budget=15000 --timeout=30000 \
  --screenshot=/tmp/wf-vite-web/index.png http://localhost:4174/
```

### Pixel verification (Vite, CSS-first)

Same tool as native matrices (`scripts/pixel-sample.mjs`, pngjs-based):

```bash
node scripts/pixel-sample.mjs /tmp/wf-vite-web/index.png 5,500
```

Verified values (430x932 viewport, light mode):

| route | point | expected |
|---|---|---|
| `/` | (5,500) | `#09090b` (zinc-950 root bg) |
| `/` | (215,130) | `#3b82f6` (bg-accent token card) |

The vite-example uses plain DOM elements with className directly (not RNW
components), proving the CSS pipeline end-to-end without the RNW style-prop
bridging. Hover/focus/active/dark/responsive variants are all pure CSS
pseudo-selectors and media queries in the emitted stylesheet.

## Headless screenshots (Metro web)

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --window-size=430,932 \
  --virtual-time-budget=15000 --timeout=30000 \
  --screenshot=/tmp/wf-web/index.png http://localhost:4173/
```

Other routes: `/explore.html`, `/animation.html`, `/metrics.html`,
`/extensions.html`, `/stress.html`.

`--virtual-time-budget` matters: the prerendered shells of all routes are
byte-identical except ~2 meta lines — **hydration decides which screen
renders**. Without letting JS run, every route screenshots the same shell.

## Pixel verification (Metro web)

Same tool as the native matrices (`scripts/pixel-sample.mjs`, pngjs-based):

```bash
node scripts/pixel-sample.mjs /tmp/wf-web/index.png 5,500
```

Verified values (430×932 viewport, light mode):

| route | point | expected |
|---|---|---|
| index / explore / animation | (5,500) | `#09090b` (zinc-950 root) |
| stress | (5,500) | `#09090b` (zinc-950 root) |
| stress | (215,300) | `#f4f4f5` (zinc-100 diagnostics panel) |
| metrics / extensions | (5,500) | `#f4f4f5` (zinc-100 placeholder root) |

Keep sample points off text glyphs. Exact-match expectations are only safe
for plain hex utilities; OKLCH palette colors (e.g. `emerald-500` →
`#00bc7d`) must be compared against their sRGB conversion, as on iOS.

## Limitations & web quirks

- **Light mode only** in this runbook. Headless `--screenshot` renders the
  default (light) color scheme; verifying dark mode needs CDP
  `Emulation.setEmulatedMedia` (`prefers-color-scheme: dark`), which this
  runbook does not script.
- **Tabs root has no height.** `expo-router/ui` `<Tabs>` on web sizes to
  content, so `height: 100%` on the slot resolves against auto and short
  screens collapse behind the absolute floating tab bar. Screen roots in
  the web-only files therefore set `style={{ minHeight: '100vh' }}`
  (`<Tabs style=…>` does not forward style).
- **The floating tab bar overlays the top ~66px.** Placeholder screens add
  `pt-20` so their caption clears it.
- **Styled primitives must come from `@windforge/react-native`.** Plain
  `react-native` View/Text compile to react-native-web components that
  silently ignore `className` — the screen renders unstyled with no error.
- **`TurboModuleRegistry` is not exported by react-native-web.** Any code
  path that touches it on web throws (`Cannot read properties of undefined
  (reading 'get')`); web guards must check `Platform.OS === 'web'` before
  the registry lookup (`packages/native/src/module.ts`).

All three of the last bullets were live defects found and fixed during the
Phase 9 web matrix; the screenshots in `/tmp/wf-web/` were retaken after
the fixes and pixel-verified against the table above.
