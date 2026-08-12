# Windforge Tailwind Compiler & Parser Specification

## Goal

Implement a Tailwind-compatible compiler frontend for React Native and React Native Web. The compiler must support Tailwind v4 concepts while only lowering utilities that have a valid backend capability.

## Compiler stages

```text
Source files
   ↓
Content scanner / @source resolver
   ↓
Class candidate extractor
   ↓
Tailwind syntax parser
   ↓
Variant parser
   ↓
Utility resolver
   ↓
Value parser
   ↓
Style AST
   ↓
Style IR
   ↓
Conflict / specificity analysis
   ↓
Constant folding
   ↓
Canonicalization
   ↓
Hashing / dedupe
   ↓
Backend lowering
   ├── RN/Fabric
   └── Web/RNW
```

## Parser responsibilities

The parser must understand:

- utility tokens
- negative utilities
- arbitrary values
- arbitrary properties
- arbitrary variants where supported
- variant chains
- responsive prefixes
- platform prefixes
- state/pseudo prefixes
- group variants
- important modifiers
- theme/token references
- CSS custom properties
- escaped class names
- CSS classes from custom CSS input

The parser must NOT know React Native types.

## Candidate extraction

The scanner should recognize static className candidates from:

```tsx
<View className="p-4 bg-primary" />
<View className={active ? "bg-blue-500" : "bg-red-500"} />
<View className={cn("p-4", active && "bg-blue-500")} />
```

It must not pretend to understand arbitrary runtime-generated strings:

```tsx
<View className={`bg-${color}-500`} />
```

For dynamic candidates, the compiler should either generate a known lookup table or route the unresolved value to a controlled runtime resolver.

## AST

Suggested structure:

```ts
interface ClassAST {
  source: string;
  variants: VariantNode[];
  utility: UtilityNode;
  important: boolean;
  arbitrary?: ArbitraryNode;
  sourceLocation?: SourceLocation;
}

interface VariantNode {
  kind: 'responsive' | 'platform' | 'state' | 'group' | 'media' | 'container' | 'custom';
  name: string;
  value?: unknown;
}

interface UtilityNode {
  family: string;
  name: string;
  value?: unknown;
  negative?: boolean;
}
```

## Style IR

```ts
interface StyleIR {
  id: string;
  declarations: DeclarationIR[];
  variants: VariantIR[];
  tokens: TokenRef[];
  animations?: AnimationIR;
  capabilities: CapabilityRequirement[];
  specificity: SpecificityIR;
  source?: SourceLocation;
}
```

Example:

```text
p-4
↓
property=padding
value=16
↓
StyleIR declaration
```

## Utility families

### Layout

- aspect
- container
- columns where meaningful
- break/box/float only when a backend supports them
- display
- position
- inset
- isolation
- object/overflow
- visibility
- z-index

### Flexbox

- flex
- flex-row / flex-col
- flex-wrap
- grow / shrink
- basis
- order
- items
- justify
- self
- content
- gap

### Spacing

- p / px / py / ps / pe / pt / pr / pb / pl
- m / mx / my / ms / me / mt / mr / mb / ml
- space-x / space-y where representable

### Sizing

- w / min-w / max-w
- h / min-h / max-h
- size
- basis

### Typography

- font family
- font size
- font weight
- line height
- letter spacing
- text alignment
- text transform
- text decoration
- text color
- text opacity
- vertical alignment where supported

### Background

- background color
- opacity
- gradients where the backend can lower them
- background image only if explicitly supported

### Borders

- border width
- border color
- border opacity
- radius
- logical border sides
- continuous/circular radius if supported by the backend

### Effects

- opacity
- shadow
- blur where supported
- filters where supported
- transforms

### Platform

- ios:
- android:
- web:
- native:
- tv: when supported

## Variants

The compiler must model variants rather than hard-code them into utility functions.

```text
dark:bg-black
md:p-8
android:px-4
hover:bg-blue-600
active:scale-95
group-active:bg-blue-500
```

Variants become predicates/rules in IR:

```ts
interface VariantIR {
  kind: VariantKind;
  condition: ConditionIR;
  priority: number;
}
```

## Tailwind v4 CSS-first configuration

The compiler should support the important v4 directives:

- `@import`
- `@theme`
- `@utility`
- `@custom-variant`
- `@source`
- `@plugin`
- `@apply`

The implementation must keep the Tailwind frontend isolated so a future non-Tailwind frontend can produce the same Style IR.

## Theme

Theme compilation should transform tokens into deterministic token IDs:

```text
@theme {
  --color-primary: #2563eb;
  --spacing-card: 16px;
}
```

Then:

```text
bg-primary p-card
```

becomes token references in IR rather than repeated raw strings.

## CSS variables

Support static variables at compile time when possible.

Dynamic variables should be represented as runtime/token references. The compiler must reject or diagnose expressions that cannot be represented by a native backend.

## Specificity and conflict resolution

Do not rely on JavaScript object insertion order as the styling model.

Create a deterministic ordering model based on:

1. base utility layer
2. variant precedence
3. utility precedence
4. important modifier
5. source ordering where required
6. explicit inline style precedence at runtime

The exact ordering must be tested against Tailwind semantics for supported utilities.

## Static extraction

For:

```tsx
<View className="p-4 bg-blue-500 rounded-xl" />
```

emit a reusable static style representation.

Preferred output concept:

```ts
const WF_STYLE_42 = /* immutable compiled style */;
```

The actual representation may be a numeric StyleSheet object, compact native ID, generated CSS class, or another backend-specific form.

## Dynamic extraction

For:

```tsx
<View className={active ? 'bg-blue-500' : 'bg-red-500'} />
```

the compiler should emit a finite style lookup rather than parsing strings at runtime.

For arbitrary runtime strings, use:

```ts
resolveDynamicClassName(value)
```

but cache the result and never make this the primary path.

## CSS parser

Windforge should support custom CSS classes similar to Uniwind's CSS parser and NativeWind's CSS interoperability layer, but the parser should lower CSS declarations into the same Style IR.

```css
.card {
  padding: 16px;
  background-color: white;
  border-radius: 12px;
}
```

becomes:

```text
CSS parser
  ↓
CSS AST
  ↓
Style IR
```

This makes custom CSS and Tailwind utilities composable.

## Diagnostics

Compiler errors must identify:

- className
- source file
- line/column when available
- utility/variant
- target platform
- reason unsupported
- suggested alternative

Example:

```text
Windforge: `grid-cols-3` is not supported by the native RN backend.
Use `web:grid-cols-3` or a supported flex layout.
```

## Parser tests

Every utility family requires:

- parse test
- AST snapshot
- IR snapshot
- RN lowering test
- Web lowering test where applicable
- negative/edge-case test
- arbitrary value test where supported
- variant combination test

## Performance requirements

Parser/compiler work must be cacheable by:

- source hash
- Tailwind config/CSS hash
- Windforge version
- target backend
- relevant platform capabilities

The compiler should support incremental rebuilds and persistent cache.
