// IIII106c v2：数值化对账（浮点字段逐位比较：f64 roundtrip；整数域直接比）。
// .NET "R" 非 always-shortest（例如 0.25090521446005681 vs 0.2509052144600568 同值），
// 文本比较有假差——一律 Number() 后同值判定；事件序仍按行流严格配对。
import { readFileSync } from 'node:fs';

const X = process.argv[2] ?? '/tmp/iii106-rig/octlog.txt';
const J = process.argv[3] ?? '/tmp/iii106-out/oc-trace-js.log';
const toF64 = (v) => { const a = new Float64Array(1); a[0] = v; return new BigUint64Array(a.buffer)[0]; };

const recOf = (line) => {
  const [tag, ...rest] = line.split('|');
  const fields = [];
  for (const part of rest) {
    const eq = part.indexOf('=');
    if (eq < 0) { fields.push(part); continue; }
    const raw = part.slice(eq + 1);
    const f = Number(raw);
    if (Number.isFinite(f) && /^[-+]?\d/.test(raw)) fields.push([part.slice(0, eq), String(f)]);
    else fields.push([part.slice(0, eq), raw]);
  }
  return { tag, fields };
};
const keyOf = (r) => r.tag + r.fields.map((f) => Array.isArray(f) ? `${f[0]}=${f[1]}` : String(f)).join('|');

const stripTail = (l) => l.replace(/\|start=\d+,\d+$/, '');
const xv0 = readFileSync(X, 'utf8').split('\n').filter(Boolean)
  .filter((l) => !l.startsWith('OCSTART') && !l.startsWith('OCINIT') && !l.startsWith('VTYPE'));
const jv0 = readFileSync(J, 'utf8').split('\n').filter(Boolean);
const xv = xv0.map(stripTail);
const jv = jv0.map(stripTail);

console.log(`comparable lines: x86=${xv.length} js=${jv.length}`);
let n = 0;
for (; n < Math.min(xv.length, jv.length); n++) {
  if (keyOf(recOf(xv[n])) === keyOf(recOf(jv[n]))) continue;
  console.log(`FIRST-DIFF @line ${n}:`);
  for (let k = Math.max(0, n - 3); k <= Math.min(n + 8, Math.min(xv.length, jv.length) - 1); k++) {
    const tag = k === n ? '>> ' : '   ';
    console.log(`${tag}x86: ${xv[k]}`);
    console.log(`${tag}js : ${jv[k]}`);
    console.log('');
  }
  break;
}
if (n >= Math.min(xv.length, jv.length)) {
  console.log(`equal prefix=${n}; x86 tail (js absent):`);
  for (const l of xv.slice(n, n + 12)) console.log('   x86:', l);
}
