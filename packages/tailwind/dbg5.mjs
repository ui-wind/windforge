import { resolveNumeric, substituteVars } from './dist/css/resolve.js';
const vars = new Map([['--spacing', [{type:'length', value:{unit:'rem', value:0.25}}]]]);
const tokens = [{
  type: 'function',
  value: { name: 'calc', arguments: [
    { type: 'var', value: { name: { ident: '--spacing', from: null }, fallback: null } },
    { type: 'white-space', value: ' ' },
    { type: 'delim', value: '*' },
    { type: 'white-space', value: ' ' },
    { type: 'number', value: 4 },
  ] },
}];
const d = [];
console.log('resolved:', resolveNumeric(tokens, vars, d), d);
