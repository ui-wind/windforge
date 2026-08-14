# Windforge Style IR Specification

## Purpose

Style IR is the stable contract between style-language frontends and platform backends.

The IR MUST NOT import React Native, React Native Web, Reanimated, Nitro, JSI, Fabric, Flutter, or DOM types.

## Goals

The IR must be:

- deterministic
- serializable
- hashable
- optimizable
- versionable
- backend-independent
- capable of representing static and dynamic values
- capable of representing conditional rules
- capable of representing animation metadata

## Conceptual model

```text
StyleSource
  ↓
StyleAST
  ↓
StyleIR
  ├── declarations
  ├── tokens
  ├── conditions
  ├── variants
  ├── animations
  └── metadata
```

## Core types

Illustrative shape:

```ts
type StyleIR = {
  version: number;
  declarations: DeclarationIR[];
  conditions?: ConditionIR[];
  variants?: VariantIR[];
  tokens?: TokenRefIR[];
  animation?: AnimationIR;
  metadata?: SourceMetadata;
};
```

These are conceptual contracts; implementation details may evolve.

## Declaration

A declaration contains:

```ts
{
  property: CanonicalProperty;
  value: IRValue;
  priority?: number;
  sourceOrder?: number;
}
```

The property must be canonical rather than a Tailwind class name.

Example:

```text
p-4
→ padding: 16
```

## Values

Values may represent:

- literal number
- literal string
- color
- token reference
- variable reference
- calc expression
- dimension
- list
- transform
- conditional value
- runtime value reference

## Conditions

The IR must model conditions without hard-coding platform APIs.

Examples:

```text
media(min-width: 768)
color-scheme(dark)
platform(android)
state(active)
container(width > 400)
```

Backends decide how each condition is lowered.

### Condition kinds

| kind | inputs | evaluated from |
|---|---|---|
| `media` | feature + value | environment (window, pixel ratio, …) |
| `color-scheme` | scheme | environment |
| `platform` | platform | environment |
| `layout-direction` | direction | environment |
| `state` | pseudo state, optional group scope | component state |
| `data` | attribute name, optional exact value | component state |
| `theme` | theme name | environment (theme store) |

Environment conditions are global: every component sees the same value.
`state` and `data` conditions are local: they evaluate against the state of
the component (or an ancestor group provider), not the environment.
`theme` is global by default but can be overridden locally via a
`ScopedTheme` provider — within that subtree the active theme name differs
from the global ThemeStore value.

### State conditions

Pseudo-class selectors (`:hover`, `:focus`, `:active`, `:disabled`) lower to
`state` conditions. `:focus-visible` collapses to the `focus` state (React
Native has no separate focus-ring notion).

```text
hover:bg-red-500    → conditionIds ["state:hover"]
active:bg-red-500   → conditionIds ["state:active"]
focus:bg-red-500    → conditionIds ["state:focus"]
disabled:opacity-50 → conditionIds ["state:disabled"]
```

Group variants add a group scope to the same condition kind:

```text
group-hover:bg-red-500        → state:hover:group   { state: "hover", group: true }
group-hover/sidebar:bg-red-500 → state:hover:group:sidebar { …, groupName: "sidebar" }
```

Id scheme: `state:<state>` / `state:<state>:group` /
`state:<state>:group:<name>`.

Pseudo states outside the interactive set (e.g. `:visited`, `:checked`)
are not lowered; the compiler reports one deduplicated WF1004 per selector.

Evaluation maps CSS pseudo states to component-state flags:
`hover → hovered`, `focus → focused`, `active → pressed`,
`disabled → disabled`. A group condition reads the matching group slot
(`groupName`, default `""`) instead of the component's own flags.

### Data conditions

`data-*` variants lower to `data` conditions with a name and an optional
exact value:

```text
data-[open]:bg-cyan-500             → data:open          { name: "open" }
data-[selected=true]:bg-emerald-500 → data:selected=true { name: "selected", value: "true" }
```

Semantics:

- Without `value`: presence — active when the component carries a defined
  `data-<name>` attribute (any value, including `false` or `""`).
- With `value`: exact match after string normalization — `data-[selected=true]`
  matches `data-selected={true}` and `data-selected="true"` but not `false`.
- Null/undefined attribute values never activate a data condition.

Interactive variants stack with environment variants as ordinary
and-conditions (`hover:dark:bg-red-700` → `["color-scheme:dark", "state:hover"]`).

### Theme conditions

Named themes (beyond built-in `light`/`dark`) are declared via
`@custom-variant <name>` injection at compile time. The compiler prepends:

```css
@custom-variant sunset (&:where(.sunset, .sunset *));
```

for each name in `extraThemes`. Utilities prefixed with that variant lower to
a `theme` condition:

```text
sunset:bg-red-500   → conditionIds ["theme:sunset"]
ocean:text-blue-200 → conditionIds ["theme:ocean"]
```

The artifact (v2+) carries a `themes` field mapping each theme name to its
variable table harvested from `.themeName { --var: ... }` selectors in the
compiled CSS:

```jsonc
{
  "version": 2,
  "irVersion": 1,
  "themes": {
    "sunset": [{ "name": "--color-accent", "tokens": [{ "kind": "hash", "value": "ef4444" }] }],
    "ocean":  [{ "name": "--color-accent", "tokens": [{ "kind": "hash", "value": "0ea5e9" }] }]
  },
  // …rest of artifact
}
```

Id scheme: `theme:<name>`. Evaluation compares `ConditionState.theme`
(resolved from the global ThemeStore or the nearest `ScopedTheme` provider)
against the condition's `name` field. Scoped overrides take precedence:
within `<ScopedTheme name="ocean">`, all descendants evaluate
`theme:ocean` as active regardless of the global selection.

Cache identity includes the theme dimension: `stateSignature` appends
`|t${state.theme}`, so the same className resolves to distinct style
objects across themes. Variable resolution (`toReactNativeValue` for
`variable` IR kind) cascades through scoped vars → global per-theme
overrides → artifact theme table; depth is capped at `MAX_VARIABLE_DEPTH = 8`.

## Animation IR

Animation must be separate from ordinary declarations.

```ts
type AnimationIR = {
  name: string;
  keyframes: KeyframeIR[];
  duration?: TimeIR;
  timingFunction?: TimingFunctionIR;
  iterationCount?: number | "infinite";
  direction?: string;
  fillMode?: string;
};
```

Reanimated-specific objects MUST NOT appear here.

## Static vs dynamic

The compiler should classify values:

```text
STATIC
TOKEN
CONDITIONAL
RUNTIME
ANIMATED
```

Static values should be fully lowered at build time.

## Hashing

Equivalent IR must produce the same canonical hash.

Hashing must ignore:

- source file path
- source line
- debug-only metadata

unless debug mode explicitly requests source-sensitive hashes.

## Versioning

IR has an explicit version.

Backend packages must declare which IR versions they accept.

Breaking IR changes require:

- migration notes
- fixtures
- backend compatibility review
