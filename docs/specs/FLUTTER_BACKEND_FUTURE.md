# Flutter Backend — Future Design

## Status

Research only. Do not implement during the initial React Native phase.

## Goal

Allow the same style frontend and IR to target Flutter without making the React Native backend the center of the architecture.

```text
Tailwind / CSS / custom frontend
             ↓
          Style IR
             ↓
      Flutter backend
             ↓
       Dart/Flutter
```

## What must remain independent

- parser
- Tailwind frontend
- Style AST
- Style IR
- optimizer
- theme/token model

## Flutter-specific lowering

Flutter backend may map to:

- EdgeInsets
- BoxDecoration
- TextStyle
- Alignment
- Transform
- MediaQuery
- ThemeData
- AnimationController/implicit animation mechanisms

These concepts must not appear in the core IR as Flutter-specific types.

## Trigger for implementation

Do not start Flutter until:

- RN compiler is stable
- IR has versioning
- extension API exists
- RN native backend is separated
- benchmark infrastructure exists
