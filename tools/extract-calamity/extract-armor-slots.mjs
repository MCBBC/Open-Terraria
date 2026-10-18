#!/usr/bin/env node
// 盔甲套装槽序提取器(四百八十二刀):[AutoloadEquip] 件 → content stats.hs/bs/ls
// 自编号(3000/3100/3200 段,键序确定性=注册序稳定)。与 extract-armor.mjs 同源面,
// 分文件=幂等职责分离(s/def 补写 | 套装键序号)。重跑幂等:序号只按键序重算一次。
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植
const SRC = process.env.CALAMITY_SRC ?? `${PROJECT_ROOT}/CalamityModPublic`;
const CONTENT = join(process.cwd(), 'mods/calamity/content/items');
const snake = (nm) => nm.replace(/\.cs$/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const SLOT_MAP = { Head: 'h', Body: 'b', Legs: 'l' };   // 分桶键(写入时再映 hs/bs/ls)
const WRITE_KEY = { h: 'hs', b: 'bs', l: 'ls' };
const BASE = { h: 3000, b: 3100, l: 3200 };
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.cs')) files.push(p);
  }
};
walk(join(SRC, 'Items'));

const bySlot = { h: [], b: [], l: [] };
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const m = /\[AutoloadEquip\(EquipType\.(Head|Body|Legs)\)\]/.exec(src);
  if (!m) continue;
  const cls = /class (\w+)/.exec(src)?.[1];
  if (!cls) continue;
  const key = snake(cls);
  try { JSON.parse(readFileSync(join(CONTENT, `${key}.json`), 'utf8')); } catch { continue; }
  bySlot[SLOT_MAP[m[1]]].push(key);
}

let n = 0;
for (const s of ['h', 'b', 'l']) {
  bySlot[s].sort();
  bySlot[s].forEach((key, i) => {
    const p = join(CONTENT, `${key}.json`);
    const d = JSON.parse(readFileSync(p, 'utf8'));
    const want = BASE[s] + i;
    if ((d.stats ??= {})[WRITE_KEY[s]] === want) return;
    d.stats[WRITE_KEY[s]] = want;
    writeFileSync(p, JSON.stringify(d, null, 1) + '\n');
    n++;
  });
}
console.log(`槽序补写 ${n} 件 (h:${bySlot.h.length} b:${bySlot.b.length} l:${bySlot.l.length})`);
