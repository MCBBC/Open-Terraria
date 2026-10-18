#!/usr/bin/env node
// 配饰 buff 光环族批提取(三百四十六刀):UpdateAccessory 体 AddBuff(BuffType<X>(),N)
// → acc-buffs.json → main.js sw.accEffect+sw.playerBuff 批注册(装备期光环)。
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const PROJECT_ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植
const SRC = process.env.CALAMITY_SRC ?? `${PROJECT_ROOT}/CalamityModPublic`;
const CONTENT = join(process.cwd(), 'mods/calamity/content/items');
const BUFFS = join(process.cwd(), 'mods/calamity/content/buffs');
const OUT = join(process.cwd(), 'mods/calamity/acc-buffs.json');
const snake = (nm) => nm.replace(/\.cs$/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

// 已注册 buff 键集(光环目标须在册)
const buffKeys = new Set();
for (const f of readdirSync(BUFFS).filter(f => f.endsWith('.json'))) {
  try { buffKeys.add(JSON.parse(readFileSync(join(BUFFS, f), 'utf8')).key); } catch { /* skip */ }
}

function extractUA(src) {
  const m = /public override void UpdateAccessory\(/.exec(src);
  if (!m) return null;
  let i = src.indexOf('{', m.index), depth = 0, start = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

const rows = [];
let files = [];
const walk = (dir) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (n.endsWith('.cs')) files.push(p);
  }
};
walk(join(SRC, 'Items'));

let vanillaBuffs = 0;
for (const p of files) {
  const src = readFileSync(p, 'utf8');
  const key = snake(basename(p, '.cs'));
  const jp = join(CONTENT, `${key}.json`);
  if (!existsSync(jp)) continue;
  const body = extractUA(src);
  if (!body) continue;
  // AddBuff(BuffType<X>(), N, true) 自光环(无条件/门外=近似)
  for (const m of body.matchAll(/AddBuff\(\s*(?:ModContent\.)?BuffType<\s*(\w+)\s*>\(\)\s*,\s*(\d+)/g)) {
    const buff = snake(m[1]);
    if (!buffKeys.has(buff)) { vanillaBuffs++; continue; }
    rows.push({ item: key, buff, seconds: Number(m[2]) || 1 });
  }
}
writeFileSync(OUT, JSON.stringify(rows, null, 1));
console.log(`acc-buffs: ${rows.length} 条(裸 vanilla buff 跳过 ${vanillaBuffs})`);
