# Windforge Extension API Specification

## Goal

Allow Windforge to grow beyond Tailwind without rewriting the compiler.

## Extension levels

### Utility extension

```ts
defineUtility({
  name: 'glass',
  resolve: ...
})
```

### Variant extension

```ts
defineVariant({
  name: 'motion-safe',
  resolve: ...
})
```

### Theme extension

```ts
defineTokens(...)
```

### Preset

```ts
definePreset(...)
```

### Frontend

A frontend converts a style language into Style AST/IR.

Potential future frontends:

- Tailwind
- CSS subset
- design-token DSL
- custom utility language

### Backend

A backend lowers Style IR to a platform.

Potential backends:

- React Native
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

## Stability

Public extension APIs require semver guarantees.
Internal compiler hooks do not.
