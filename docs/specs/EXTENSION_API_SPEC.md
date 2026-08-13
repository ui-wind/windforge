# Windforge Extension API Specification

## Goal

Allow Windforge to grow beyond Tailwind without rewriting the compiler.

Status (2026-08-13, Phase 8): the authoring surface (`defineUtility`,
`defineVariant`, `defineTokens`, `definePreset`) is implemented in
`@windforge/extension-sdk`; the custom frontend interface
(`WindforgeFrontend`) in `@windforge/metro`; the custom backend interface
(`setBackend`) in `@windforge/react-native`. See
`docs/IMPLEMENTATION_ROADMAP.md` Phase 8 for measurements and decisions.

## Design: CSS-text lowering

Every `define*` descriptor lowers to **CSS text** (`@utility` /
`@custom-variant` / `@theme`) that the Metro compiler injects into the entry
stylesheet after the WF1000 check and before Tailwind (oxide) compilation.
There is no separate extension parser and no IR-level hook — oxide and the
existing IR pipeline do all of the actual work. Consequences:

- Extensions get exactly the capability of the Tailwind pipeline: anything a
  hand-written `@utility`/`@theme`/`@custom-variant` in `global.css` can do,
  an extension can do (`apps/example/src/global.css` uses the same forms).
- Declarations outside the RN lowering table receive the same WF1003/WF1005
  diagnostics as any Tailwind utility — no special-casing.
- Oxide error positions cannot be attributed back to the extension that
  produced the text, so `renderExtensions` validates descriptors *before*
  rendering and reports WF3xxx diagnostics instead of an oxide stack trace.

## Extension levels

### Utility extension

```ts
import { defineUtility } from '@windforge/extension-sdk';

defineUtility({ name: 'glass', css: 'opacity: 0.8;' });
// → @utility glass { opacity: 0.8; }
```

### Variant extension

```ts
defineVariant({ name: 'land', media: '(orientation: landscape)' });
// → @custom-variant land (@media (orientation: landscape));
```

The media condition may only use features the runtime condition evaluator
can lower: `prefers-color-scheme`, `orientation`, `platform`,
`layout-direction`, and width ranges (`width`/`min-width`/`max-width`).
Comma-separated (OR) queries are rejected — Windforge conditions are
AND-only. Anything else is WF3004.

### Theme extension

```ts
defineTokens({
  colors: { brand: '#22c55e' },
  animate: { 'spin-slow': 'spin 3s linear infinite' },
});
// → @theme { --color-brand: #22c55e; --animate-spin-slow: spin 3s linear infinite; }
```

Namespaces: `colors`, `animate`, `spacing`, `radius`, `fontFamily`,
`fontSize`. Unknown namespaces are WF3005.

### Preset

```ts
definePreset({
  name: 'glass-kit',
  utilities: [defineUtility({ name: 'glass', css: 'opacity: 0.8;' })],
  variants: [defineVariant({ name: 'land', media: '(orientation: landscape)' })],
  tokens: [defineTokens({ colors: { brand: '#22c55e' } })],
  css: '/* optional raw CSS, appended verbatim */',
});
```

A preset aggregates the three descriptor kinds plus optional raw CSS.
Diagnostics name the originating preset.

### Validation (WF3xxx)

| code | meaning |
| --- | --- |
| WF3001 | invalid name — must match `^[a-z0-9][a-z0-9_-]*$` (oxide's rule) |
| WF3002 | empty utility body or token value |
| WF3003 | `@import` in extension CSS — would resolve against the entry stylesheet directory |
| WF3004 | variant media query not evaluable at runtime (unknown feature, OR query, empty) |
| WF3005 | unknown token namespace |
| WF3010 | frontend-produced artifact version/IR mismatch, or missing `dependencies` map |

Invalid descriptors are omitted from the rendered CSS; valid ones in the
same batch still render.

## Frontend

A frontend converts a style language into Style AST/IR. Implemented as
`WindforgeFrontend` in `@windforge/metro`:

```ts
type WindforgeFrontend = {
  name: string;
  generate(context: { entry: string; base: string }): RuntimeArtifact[];
};
```

The default Tailwind frontend runs first; additional frontends run after it.
Each produced artifact is validated at build time (`version`/`irVersion`
must equal the supported values and `dependencies` must be present —
WF3010) and rendered as an additional `registerArtifact` call in the
generated module. The runtime registry prefers later registrations per
class name, so a frontend can override Tailwind classes one at a time —
registration order is override order.

`RuntimeArtifact` is imported from `@windforge/tailwind` (its canonical
home); moving it to `@windforge/ir` is deferred.

Potential future frontends:

- Tailwind (the default)
- CSS subset
- design-token DSL
- custom utility language

## Backend

A backend lowers Style IR to a platform. Implemented as `setBackend` in
`@windforge/react-native`:

```ts
import { setBackend } from '@windforge/react-native';

setBackend({
  name: 'my-backend',
  requiresContext: () => false,
  resolveStyle: (className, state) => /* lowered style object */,
});
```

Contract:

- `setBackend` must be the **last** backend-affecting call before
  `WindforgeProvider` mounts. `installNativeDelivery` (`@windforge/native`)
  ends with `selectBackend('fabric')` — a `setBackend` made before it is
  silently overridden.
- A custom backend that wants native condition delivery should wrap or
  delegate to the fabric backend instead of replacing it; replacing it
  abandons the fabric instance's native bindings.
- `resolveStyle` is on the render path — `@windforge/reanimated` animated
  components call `getBackend().resolveStyle` on every animated render — so
  a backend must resolve classNames correctly, not fake them.

Potential backends:

- React Native (`js-baseline`, `fabric`)
- React Native Web
- Flutter

## Plugin rules

Plugins must not mutate compiler internals directly.

Prefer declared hooks:

```text
parse
resolve
transform
optimize
lower
emit
```

Status: the lifecycle-hook form remains P1 (parity matrix). Phase 8 ships
the descriptor/frontend/backend surfaces above, which compose *through* the
existing pipeline instead of hooking into it.

## Stability

Public extension APIs require semver guarantees.
Internal compiler hooks do not.
