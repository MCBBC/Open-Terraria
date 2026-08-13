// 批次A字段搬移补丁（一次性；经 run-diag 跑）：读 /tmp/dualkey-state.json 的 moves，
// 把驼峰独有字段以字面量补进 items.ts 蛇形条目行（行内追加字段 + 行尾注释标来源键）。
// 跑法：node tools/run-diag.mjs tools/_diag-dualkey-fields.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const state = JSON.parse(readFileSync('/tmp/dualkey-state.json', 'utf8'));
const FILE = new URL('../src/data/items.ts', import.meta.url).pathname;
let src = readFileSync(FILE, 'utf8');

// JSON 值 → TS 字面量（字符串单引号；对象键原样）
const tsLit = (v) => {
  if (typeof v === 'string') return `'${v}'`;
  if (v === null || typeof v !== 'object') return String(v);
  return '{ ' + Object.entries(v).map(([k, x]) => `${k}: ${tsLit(x)}`).join(', ') + ' }';
};

// 按 snakeKey 聚合字段（同键多字段合成一次行内追加）
const bySnake = new Map();
for (const mv of state.moves) {
  if (!bySnake.has(mv.snakeKey)) bySnake.set(mv.snakeKey, { camelKey: mv.camelKey, fields: [] });
  const e = bySnake.get(mv.snakeKey);
  if (e.camelKey !== mv.camelKey) throw new Error(`同蛇形键两个来源驼峰键: ${mv.snakeKey}`);
  e.fields.push([mv.field, mv.value]);
}

let patchedLines = 0;
for (const [snakeKey, { camelKey, fields }] of bySnake) {
  const needle = `key: '${snakeKey}'`;
  const lines = src.split('\n');
  let hits = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(needle)) continue;
    if (!/item\(\{.*\}\);/.test(lines[i])) throw new Error(`行非单行 item() 调用: ${lines[i]}`);
    // 幂等：已含字段则跳过
    const already = fields.every(([f]) => new RegExp(`${f}:`).test(lines[i]));
    if (already) { hits++; continue; }
    const add = fields.map(([f, v]) => `${f}: ${tsLit(v)}`).join(', ');
    lines[i] = lines[i].replace(/\}\);/, `, ${add} });`) + ` // ←${camelKey} 独有字段搬移(批次A)`;
    hits++;
  }
  if (hits === 0) throw new Error(`找不到蛇形条目行: ${snakeKey}`);
  src = lines.join('\n');
  patchedLines += hits;
}
writeFileSync(FILE, src);
console.log(`已补 ${bySnake.size} 个蛇形键 / ${patchedLines} 行（含重复注册行）`);
