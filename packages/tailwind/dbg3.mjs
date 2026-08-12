import { compileTailwindCss } from './dist/compile.js';
import { scanCandidates } from './dist/scan.js';
import { transform } from 'lightningcss';

const candidates = scanCandidates('tests/fixtures/app');
const { css } = await compileTailwindCss('tests/fixtures/app/src/global.css', candidates);

transform({
  filename: 't.css',
  code: Buffer.from(css),
  visitor: {
    Rule(rule) {
      if (rule.type !== 'style') return undefined;
      const sels = rule.value.selectors;
      const first = sels?.[0]?.[0];
      if (first?.type !== 'class') return undefined;
      for (const d of rule.value.declarations.declarations ?? []) {
        console.log(first.name, '|', d.property, '|', JSON.stringify(d.value).slice(0, 400));
      }
      return undefined;
    },
  },
});
