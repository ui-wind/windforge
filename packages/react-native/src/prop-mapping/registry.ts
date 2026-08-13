/**
 * Component prop mapping registry (docs/specs/CODE_STRUCTURE_AND_PACKAGE_DESIGN.md,
 * Component mapping).
 *
 * Maps className props onto style props for components Windforge does not
 * wrap itself — third-party components and RN containers with secondary
 * style surfaces (`contentContainerClassName`, `columnWrapperClassName`).
 * `styled()` consults this registry; apps can register their own components.
 */
import { FlatList, ScrollView, SectionList } from 'react-native';

/** One className → style prop pair. */
export type ClassPropMapping = {
  classNameProp: string;
  styleProp: string;
};

export type ComponentMappingRecord = {
  /** Primary className prop of the component. */
  classNameProp: string;
  /** Style prop it lowers into. */
  styleProp: string;
  /** Secondary surfaces, e.g. contentContainerClassName → contentContainerStyle. */
  extraMappings?: ClassPropMapping[];
  /**
   * Optional animated variant (Reanimated integration consumes this in a
   * later phase; stored only for now).
   */
  animatedComponent?: unknown;
};

const componentMappings = new Map<unknown, ComponentMappingRecord>();

/** Register (or replace) the mapping for a component. */
export function registerComponent(
  entry: { component: unknown } & ComponentMappingRecord,
): void {
  const { component, ...record } = entry;
  componentMappings.set(component, record);
}

/** Look up the mapping registered for a component, if any. */
export function getComponentMapping(component: unknown): ComponentMappingRecord | undefined {
  return componentMappings.get(component);
}

/** Expand a record into its ordered mapping list (primary first). */
export function toMappings(record: ComponentMappingRecord): ClassPropMapping[] {
  return [
    { classNameProp: record.classNameProp, styleProp: record.styleProp },
    ...(record.extraMappings ?? []),
  ];
}

/** Test-only: drop all registrations and restore the defaults. */
export function __resetComponentRegistry(): void {
  componentMappings.clear();
  registerDefaults();
}

function registerDefaults(): void {
  // Guarded: test mocks of react-native may omit these components.
  if (ScrollView) {
    registerComponent({
      component: ScrollView,
      classNameProp: 'className',
      styleProp: 'style',
      extraMappings: [
        { classNameProp: 'contentContainerClassName', styleProp: 'contentContainerStyle' },
      ],
    });
  }
  if (SectionList) {
    registerComponent({
      component: SectionList,
      classNameProp: 'className',
      styleProp: 'style',
      extraMappings: [
        { classNameProp: 'contentContainerClassName', styleProp: 'contentContainerStyle' },
      ],
    });
  }
  if (FlatList) {
    registerComponent({
      component: FlatList,
      classNameProp: 'className',
      styleProp: 'style',
      extraMappings: [
        { classNameProp: 'contentContainerClassName', styleProp: 'contentContainerStyle' },
        { classNameProp: 'columnWrapperClassName', styleProp: 'columnWrapperStyle' },
      ],
    });
  }
}

registerDefaults();
