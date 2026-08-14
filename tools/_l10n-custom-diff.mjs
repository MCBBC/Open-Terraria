// 一次性:列出代码使用的 Mods.SandboxWorld.* 键 vs custom zh/en 两表差异
// (审计器只回 used.size,这里内联同款正则拿键名)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = new URL('.', import.meta.url).pathname;   // .../game/tools/
function collect(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) collect(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}
const used = new Map();
const KEY_RE = /Lang\.(?:text|has)\(\s*['"]([A-Za-z0-9_.\-]+)['"]/g;
const CUSTOM_RE = /['"](Mods\.SandboxWorld\.[A-Za-z0-9_.\-]+)['"]/g;
for (const f of collect(ROOT + '../src')) {
  for (const m of readFileSync(f, 'utf8').matchAll(KEY_RE)) used.set(m[1], f);
  for (const m of readFileSync(f, 'utf8').matchAll(CUSTOM_RE)) used.set(m[1], f);
}
const customKeys = [...used.keys()].filter((k) => k.startsWith('Mods.'));
const zh = JSON.parse(readFileSync(ROOT + '../../tools/l10n-custom/zh-Hans.json', 'utf8'));
const en = JSON.parse(readFileSync(ROOT + '../../tools/l10n-custom/en-US.json', 'utf8'));
const flat = (o, p = [], out = []) => {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object') flat(v, [...p, k], out);
    else out.push([...p, k].join('.'));
  }
  return out;
};
const zhK = new Set(flat(zh).map((s) => s.replace(/^Mods\./, '')));
const enK = new Set(flat(en).map((s) => s.replace(/^Mods\./, '')));
console.log('== 代码自定义键总数:', customKeys.length);
console.log('== 缺译(他语言会落兜底):');
let miss = 0;
for (const k of customKeys) {
  const rel = k.replace(/^Mods\./, '');
  const mz = !zhK.has(rel), me = !enK.has(rel);
  if (mz || me) { miss++; console.log(' ', k, mz ? '[缺zh]' : '', me ? '[缺en]' : ''); }
}
if (!miss) console.log('  (无)');
const usedSet = new Set(customKeys.map((k) => k.replace(/^Mods\./, '')));
console.log('== custom 死键(代码不再引用):');
let dead = 0;
for (const rel of new Set([...zhK, ...enK])) {
  if (!usedSet.has(rel)) { dead++; console.log(' ', rel, zhK.has(rel) ? '(zh)' : '', enK.has(rel) ? '(en)' : ''); }
}
if (!dead) console.log('  (无)');
console.log('== 全部在用自定义键(逐条过堂是否原版已有官译):');
for (const k of customKeys) console.log(' ', k);
