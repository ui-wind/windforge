/**
 * @windforge/extension-sdk
 *
 * Authoring surface for Windforge extensions: define utilities, variants,
 * tokens and presets in TypeScript. Descriptors are plain serializable
 * objects; `renderExtensions` lowers them to CSS text (`@utility` /
 * `@custom-variant` / `@theme`) that the build pipeline injects into the
 * entry stylesheet before Tailwind compilation — oxide and the existing IR
 * pipeline do all of the actual work (docs/specs/EXTENSION_API_SPEC.md).
 *
 * Diagnostic codes are WF3xxx (extension authoring layer).
 */

/** Extension diagnostic. Codes are WF3xxx. */
export type Diagnostic = {
  code: string;
  message: string;
};

/** A custom utility: `defineUtility({ name: 'glass', css })` → `glass`. */
export type UtilityDescriptor = {
  kind: 'utility';
  name: string;
  /** Declaration block, e.g. `background-color: rgba(255,255,255,0.1);`. */
  css: string;
};

/**
 * A custom variant: `defineVariant({ name: 'land', media: '(orientation: landscape)' })`
 * → `land:` prefix. The media query may only use features the Windforge
 * runtime can evaluate: prefers-color-scheme, orientation, platform,
 * layout-direction, width ranges.
 */
export type VariantDescriptor = {
  kind: 'variant';
  name: string;
  /** Media condition without the `@media` keyword, e.g. `(platform: ios)`. */
  media: string;
};

/** Token namespaces lowered to `@theme` variables. */
export type TokenNamespace =
  | 'colors'
  | 'animate'
  | 'spacing'
  | 'radius'
  | 'fontFamily'
  | 'fontSize';

const TOKEN_PREFIXES: Record<TokenNamespace, string> = {
  colors: '--color-',
  animate: '--animate-',
  spacing: '--spacing-',
  radius: '--radius-',
  fontFamily: '--font-',
  fontSize: '--font-size-',
};

export type TokensDescriptor = {
  kind: 'tokens';
  colors?: Record<string, string>;
  animate?: Record<string, string>;
  spacing?: Record<string, string>;
  radius?: Record<string, string>;
  fontFamily?: Record<string, string>;
  fontSize?: Record<string, string>;
};

/**
 * A preset bundles utilities, variants, tokens and optional raw CSS under a
 * name. Raw CSS is appended verbatim after validation (no `@import`).
 */
export type PresetDescriptor = {
  kind: 'preset';
  name: string;
  utilities?: UtilityDescriptor[];
  variants?: VariantDescriptor[];
  tokens?: TokensDescriptor[];
  css?: string;
};

export type ExtensionDescriptor =
  | UtilityDescriptor
  | VariantDescriptor
  | TokensDescriptor
  | PresetDescriptor;

/** Define a custom utility class. */
export function defineUtility(input: { name: string; css: string }): UtilityDescriptor {
  return { kind: 'utility', name: input.name, css: input.css };
}

/** Define a custom variant backed by an evaluable media query. */
export function defineVariant(input: { name: string; media: string }): VariantDescriptor {
  return { kind: 'variant', name: input.name, media: input.media };
}

/** Define design tokens (lowered to `@theme` variables). */
export function defineTokens(input: Omit<TokensDescriptor, 'kind'>): TokensDescriptor {
  return { kind: 'tokens', ...input };
}

/** Bundle utilities, variants, tokens and raw CSS into a reusable preset. */
export function definePreset(input: Omit<PresetDescriptor, 'kind'>): PresetDescriptor {
  return { kind: 'preset', ...input };
}

export type RenderResult = {
  /** CSS text to inject into the entry stylesheet. */
  css: string;
  /** WF3xxx validation diagnostics; `css` only contains valid fragments. */
  diagnostics: Diagnostic[];
};

/**
 * Oxide's custom-variant name rule: lowercase alphanumeric, dash, underscore,
 * starting with a letter or number. Utilities and token keys follow the same
 * convention so rendered output never trips oxide's own validation.
 */
const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * Media features `parseMediaQuery` (@windforge/tailwind) can lower to runtime
 * conditions. Everything else parses but is skipped with WF1004, or cannot be
 * evaluated at all — reject early so the diagnostic names the extension.
 */
const MEDIA_FEATURES = new Set([
  'prefers-color-scheme',
  'orientation',
  'platform',
  'layout-direction',
  'width',
  'min-width',
  'max-width',
]);

type FlatDescriptor =
  | (UtilityDescriptor & { origin?: string })
  | (VariantDescriptor & { origin?: string })
  | (TokensDescriptor & { origin?: string })
  | { kind: 'css'; origin?: string; css: string };

function flatten(descriptors: readonly ExtensionDescriptor[]): FlatDescriptor[] {
  const flat: FlatDescriptor[] = [];
  for (const descriptor of descriptors) {
    if (descriptor.kind === 'preset') {
      const origin = `preset "${descriptor.name}"`;
      for (const utility of descriptor.utilities ?? []) {
        flat.push({ ...utility, origin });
      }
      for (const variant of descriptor.variants ?? []) {
        flat.push({ ...variant, origin });
      }
      for (const tokens of descriptor.tokens ?? []) {
        flat.push({ ...tokens, origin });
      }
      if (descriptor.css !== undefined) {
        flat.push({ kind: 'css', origin, css: descriptor.css });
      }
    } else {
      flat.push(descriptor);
    }
  }
  return flat;
}

function where(descriptor: FlatDescriptor): string {
  return descriptor.origin ? ` (${descriptor.origin})` : '';
}

function validateName(name: string, descriptor: FlatDescriptor, diagnostics: Diagnostic[]): boolean {
  if (!NAME_RE.test(name)) {
    diagnostics.push({
      code: 'WF3001',
      message:
        `Invalid extension name "${name}"${where(descriptor)} — names must match ` +
        `${NAME_RE} (lowercase alphanumeric, dash or underscore, starting with a letter or number)`,
    });
    return false;
  }
  return true;
}

/** Media features inside a query string, e.g. `(platform: ios)` → `platform`. */
function mediaFeatures(media: string): string[] {
  return [...media.matchAll(/\(\s*([a-z-]+)\s*[:\s>=<]/g)].map((match) => match[1] ?? '');
}

function validateVariant(descriptor: VariantDescriptor & { origin?: string }, diagnostics: Diagnostic[]): boolean {
  const { media } = descriptor;
  if (media.trim() === '') {
    diagnostics.push({
      code: 'WF3004',
      message: `Variant "${descriptor.name}"${where(descriptor)} has an empty media query`,
    });
    return false;
  }
  if (media.includes(',')) {
    diagnostics.push({
      code: 'WF3004',
      message:
        `Variant "${descriptor.name}"${where(descriptor)} uses a comma-separated (OR) media query — ` +
        'Windforge conditions are AND-only',
    });
    return false;
  }
  const features = mediaFeatures(media);
  if (features.length === 0) {
    diagnostics.push({
      code: 'WF3004',
      message: `Variant "${descriptor.name}"${where(descriptor)} media "${media}" has no condition`,
    });
    return false;
  }
  for (const feature of features) {
    if (!MEDIA_FEATURES.has(feature)) {
      diagnostics.push({
        code: 'WF3004',
        message:
          `Variant "${descriptor.name}"${where(descriptor)} uses media feature "${feature}" — ` +
          'only prefers-color-scheme, orientation, platform, layout-direction and width ranges ' +
          'are evaluable at runtime',
      });
      return false;
    }
  }
  return true;
}

function validateCss(css: string, label: string, diagnostics: Diagnostic[]): boolean {
  if (/@import\b/.test(css)) {
    diagnostics.push({
      code: 'WF3003',
      message: `${label} contains an @import rule — imports in extension CSS would resolve against the entry stylesheet directory`,
    });
    return false;
  }
  return true;
}

function renderTokens(descriptor: TokensDescriptor & { origin?: string }, diagnostics: Diagnostic[]): string {
  const lines: string[] = [];
  for (const key of Object.keys(descriptor)) {
    if (key === 'kind' || key === 'origin') continue;
    const namespace = key as TokenNamespace;
    const prefix = TOKEN_PREFIXES[namespace];
    if (prefix === undefined) {
      diagnostics.push({
        code: 'WF3005',
        message: `Unknown token namespace "${key}"${where(descriptor)} — expected one of: ${Object.keys(TOKEN_PREFIXES).join(', ')}`,
      });
      continue;
    }
    const values = descriptor[namespace];
    if (!values) continue;
    for (const [name, value] of Object.entries(values)) {
      if (!validateName(name, descriptor, diagnostics)) continue;
      if (typeof value !== 'string' || value.trim() === '') {
        diagnostics.push({
          code: 'WF3002',
          message: `Token "${prefix}${name}"${where(descriptor)} has an empty value`,
        });
        continue;
      }
      lines.push(`  ${prefix}${name}: ${value};`);
    }
  }
  return lines.length > 0 ? `@theme {\n${lines.join('\n')}\n}` : '';
}

/**
 * Lower extension descriptors to CSS text for injection into the entry
 * stylesheet. Invalid descriptors are reported as WF3xxx diagnostics and
 * omitted from the output (oxide positions cannot be attributed back to the
 * extension that produced them, so validation happens here, pre-render).
 */
export function renderExtensions(descriptors: readonly ExtensionDescriptor[]): RenderResult {
  const diagnostics: Diagnostic[] = [];
  const themes: string[] = [];
  const variants: string[] = [];
  const utilities: string[] = [];
  const raw: string[] = [];

  for (const descriptor of flatten(descriptors)) {
    switch (descriptor.kind) {
      case 'utility': {
        if (!validateName(descriptor.name, descriptor, diagnostics)) continue;
        if (descriptor.css.trim() === '') {
          diagnostics.push({
            code: 'WF3002',
            message: `Utility "${descriptor.name}"${where(descriptor)} has an empty css body`,
          });
          continue;
        }
        if (!validateCss(descriptor.css, `Utility "${descriptor.name}"${where(descriptor)}`, diagnostics)) continue;
        utilities.push(`@utility ${descriptor.name} {\n  ${descriptor.css.trim().split('\n').join('\n  ')}\n}`);
        break;
      }
      case 'variant': {
        if (!validateName(descriptor.name, descriptor, diagnostics)) continue;
        if (!validateVariant(descriptor, diagnostics)) continue;
        variants.push(`@custom-variant ${descriptor.name} (@media ${descriptor.media.trim()});`);
        break;
      }
      case 'tokens': {
        const theme = renderTokens(descriptor, diagnostics);
        if (theme !== '') themes.push(theme);
        break;
      }
      case 'css': {
        if (descriptor.css.trim() === '') continue;
        const label = `Preset raw CSS${where(descriptor)}`;
        if (!validateCss(descriptor.css, label, diagnostics)) continue;
        raw.push(descriptor.css.trim());
        break;
      }
    }
  }

  return {
    css: [...themes, ...variants, ...utilities, ...raw].join('\n'),
    diagnostics,
  };
}
