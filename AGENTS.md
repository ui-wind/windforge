# Windforge AI Agent Entry Point

You are working on Windforge.

Before editing code, read:

1. `docs/AI_READING_GUIDE.md`
2. `docs/AI_AGENT_RULES.md`
3. `WINDFORGE_ARCHITECTURE.md`
4. `WINDFORGE_SKILL.md`
5. `WINDFORGE_MASTER_PROMPT.md`

Then read the specifications relevant to the task.

## Hard constraints

- React Native New Architecture only.
- Expo SDK 57 / RN 0.86 is the current development baseline.
- Tailwind is the first frontend, not the core architecture.
- React Native and React Native Web are first-class targets.
- Reanimated is a first-class integration.
- Fabric/JSI/Nitro/C++ are backend implementation choices.
- Flutter is future work only.
- Do not copy proprietary implementation code or binaries from reference projects.
- Do not claim performance improvements without benchmarks.

## First question for every change

Ask:

> Which architectural layer owns this behavior?

If the answer is unclear, read the relevant specification before coding.
