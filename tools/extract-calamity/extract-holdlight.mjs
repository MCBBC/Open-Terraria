#!/usr/bin/env node
// holdItem 光源族批提取(三百四十八刀):HoldItem 体 Lighting.AddLight(...,r,g,b)
// 三色字面 → hold-lights.json → main.js sw.holdItem 闭包设 player.modHeldLight。
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
const PROJECT_ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植
const SRC = process.env.CALAMITY_SRC ?? `${PROJECT_ROOT}/CalamityModPublic`;
const CONTENT = join(process.cwd(), 'mods/calamity/content/items');
const OUT = join(process.cwd(), 'mods/calamity/hold-lights.json');
const snake = (nm) => nm.replace(/\.cs$/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

function extractHold(src) {
  const m = /public override void HoldItem\(/.exec(src);
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
const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n);
  if (statSync(p).isDirectory()) walk(p); else if (n.endsWith('.cs')) files.push(p); } };
walk(join(SRC, 'Items'));
for (const p of files) {
  const src = readFileSync(p, 'utf8');
  const key = snake(basename(p, '.cs'));
  const jp = join(CONTENT, `${key}.json`);
  if (!existsSync(jp)) continue;
  const body = extractHold(src);
  if (!body || !body.includes('Lighting.AddLight')) continue;
  const m = /AddLight\([^;]*?,\s*(-?[\d.]+)f\s*,\s*(-?[\d.]+)f\s*,\s*(-?[\d.]+)f\s*\)/.exec(body);
  if (!m) continue;
  rows.push({ item: key, rgb: [Number(m[1]), Number(m[2]), Number(m[3])] });
}
writeFileSync(OUT, JSON.stringify(rows, null, 1));
console.log('hold-lights:', rows.length);
