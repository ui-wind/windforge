# Web — export & verification runbook

Windforge on web runs the **runtime-resolution backend** on top of
`react-native-web`: the Metro plugin still compiles the Tailwind surface
into the versioned artifact (`apps/example/.windforge/generated.js`), and
styled primitives from `@windforge/react-native` resolve classNames through
it at render time. `installNativeDelivery()` is a no-op on web, and
`getWindforgeStyleModule()` returns null before ever touching
`TurboModuleRegistry` (react-native-web does not export it — see
"Web quirks" below).

Status: **web verified via static export + headless Chrome screenshots**
(Phase 9). There is no CSS backend yet; `docs/specs/WEB_BACKEND_SPEC.md`
remains design-only.

## Requirements

- Node 22 + pnpm (same toolchain as the rest of the monorepo)
- A static file server (`npx serve` is enough)
- Google Chrome for headless screenshots (verified: `--headless=new`)

## Export + serve

```bash
pnpm --filter windforge-example exec expo export --platform web
npx serve apps/example/dist -l 4173
```

The export prerenders one `.html` shell per route (8 routes verified:
`/`, `/explore`, `/animation`, `/metrics`, `/extensions`, `/stress`,
`/+not-found`, `_sitemap`). Native-only screens have web placeholders
(`animation.web.tsx`, `metrics.web.tsx`, `extensions.web.tsx`) so the web
bundle stays free of Reanimated and the native extension surface.

## Headless screenshots

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

## Pixel verification

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
