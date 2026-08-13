# Windforge Compiler Pipeline Specification

## Pipeline

```text
Source files
  ↓
Content discovery
  ↓
Candidate extraction
  ↓
Tailwind/CSS parser
  ↓
Style AST
  ↓
Semantic resolution
  ↓
Style IR
  ↓
Specificity/conflict resolution
  ↓
Optimization
  ↓
Static artifact generation
  ↓
Platform lowering
  ├── React Native/Fabric
  └── React Native Web
```

## 1. Content discovery

Must support:

- Expo projects
- bare RN projects
- monorepos
- packages outside the app root
- explicit `@source`
- configurable source globs

The scanner should avoid parsing irrelevant files.

## 2. Candidate extraction

Extract class candidates without requiring full JavaScript execution.

Support common patterns:

```tsx
className="p-4 bg-blue-500"
className={'p-4'}
className={condition ? 'p-4' : 'p-8'}
className={cn('p-4', condition && 'bg-red-500')}
```

Truly dynamic values remain runtime candidates.

## 3. Parsing

Parser responsibilities:

- utility tokenization
- variant chains
- arbitrary values
- arbitrary properties
- important modifier
- negative values
- theme references
- CSS functions
- directives where supported

Parser must produce syntax-oriented AST, not React Native styles.

## 4. Semantic resolution

Resolve:

- utility → canonical property
- token → token reference
- variant → condition
- theme value → normalized value
- arbitrary value → typed value

## 5. Conflict resolution

Implement deterministic ordering based on:

1. variant specificity
2. utility precedence
3. important modifier
4. source order where applicable

The algorithm must be testable independently.

## 6. Optimization

Required optimizations:

- canonicalization
- duplicate declaration removal
- style deduplication
- constant folding
- token deduplication
- stable hashing
- dead rule elimination
- artifact reuse

Do not optimize by changing semantics.

## 7. Static artifacts

Generate compact tables for:

- class → style ID
- style ID → declarations
- variant rules
- animation metadata
- token references

Runtime should resolve IDs instead of repeatedly parsing Tailwind strings whenever possible.

## 8. Runtime fallback

For dynamic class strings:

```text
runtime string
  ↓
cache lookup
  ↓ miss
runtime parser
  ↓
IR
  ↓
backend lowering
  ↓
cache
```

Runtime fallback must never become the normal path for static classes.

> Status (2026-08-13): implemented as `parseStaticUtility` in `@windforge/ir`
> — a controlled static-spacing subset that emits IR identical to the build
> path. Sanctioned exception to Rule 2, recorded as a decision record (Rule 13)
> in `docs/IMPLEMENTATION_ROADMAP.md` Phase 5.

## 9. Web lowering

Web may lower IR to CSS rules/classes.

Do not force web through native StyleSheet semantics.

## 10. Native lowering

Native lowering may produce:

- StyleSheet-compatible artifacts
- native style IDs
- Fabric/native update metadata
- Reanimated metadata

The compiler must not depend on which native mechanism is selected.

## 11. Diagnostics

Diagnostics must identify:

- unsupported utility
- unsupported platform property
- invalid arbitrary value
- conflicting classes
- dynamic class fallback
- unsupported animation
- unsupported native capability

Errors should include source location where available.
