# React Native Web Backend Specification

## Goal

Provide the same Windforge className developer experience on React Native Web without forcing web through the native runtime.

## Shared

- parser
- Tailwind frontend
- Style IR
- optimizer
- theme system
- className API

## Web-specific

- CSS lowering
- media queries
- container queries
- pseudo selectors
- CSS variables
- SSR-safe artifacts
- browser capability handling

## Output model

```text
Style IR
  ↓
CSS lowering
  ↓
canonical CSS rules
  ↓
stable generated class names
```

Avoid runtime stylesheet injection when compile-time output is possible.

## Platform variants

Support:

- `web:`
- shared responsive variants
- hover/focus/active where web supports them

Native-only variants must not leak into web CSS.

## SSR

Generated CSS must be deterministic so SSR and client hydration can agree on class names and rule ordering.
