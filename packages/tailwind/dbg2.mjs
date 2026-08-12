import { compileTailwindCss } from './dist/compile.js';
import { scanCandidates } from './dist/scan.js';
import { transform } from 'lightningcss';

const candidates = scanCandidates('tests/fixtures/app');
const { css } = await compileTailwindCss('tests/fixtures/app/src/global.css', candidates);

let visited = 0;
transform({
  filename: 't.css',
  code: Buffer.from(css),
  visitor: {
    Rule(rule) {
      visited++;
      if (rule.type === 'style') {
        const sels = JSON.stringify(rule.value.selectors);
        const props = (rule.value.declarations.declarations ?? []).map(d => d.property);
        if (props.includes('custom') || sels.includes('p-4') || sels.includes('root') || sels.includes('w-1\\\\/2') || sels.includes('rounded')) {
          console.log('STYLE', sels, JSON.stringify(props));
        }
      } else {
        console.log('RULE type:', rule.type);
      }
      return undefined;
    },
  },
});
console.log('total visited:', visited);
// show a slice of css around w-1/2
const idx = css.indexOf('.w-1');
console.log(css.slice(idx, idx + 200));
