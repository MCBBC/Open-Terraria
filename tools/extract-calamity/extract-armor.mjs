#!/usr/bin/env node
// 盔甲穿戴域提取器(四百八十一刀):C# [AutoloadEquip]+Item.defense → content
// items/*.json stats.s 补写(h/b/l)。幂等:仅当 content stats 缺 s 或 C# 防御≠content 时写。
// 消费面:armorSlotIndexOfInternal(自动入甲槽)+get defense()(stats.def 聚合)。
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const PROJECT_ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植
const SRC = process.env.CALAMITY_SRC ?? `${PROJECT_ROOT}/CalamityModPublic`;
const CONTENT = join(process.cwd(), 'mods/calamity/content/items');
const snake = (nm) => nm.replace(/\.cs$/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const SLOT_MAP = { Head: 'h', Body: 'b', Legs: 'l' };
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.cs')) files.push(p);
  }
};
walk(join(SRC, 'Items'));

let patched = 0, skippedNoContent = 0, alreadyOk = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const m = /\[AutoloadEquip\(EquipType\.(Head|Body|Legs)\)\]/.exec(src);
  if (!m) continue;
  const cls = /class (\w+)/.exec(src)?.[1];
  if (!cls) continue;
  const key = snake(cls);
  const slot = SLOT_MAP[m[1]];
  const dm = /Item\.defense = (\d+)/.exec(src);
  const def = dm ? Number(dm[1]) : null;
  const p = join(CONTENT, `${key}.json`);
  let d;
  try { d = JSON.parse(readFileSync(p, 'utf8')); } catch { skippedNoContent++; continue; }
  const st = (d.stats ??= {});
  if (st.s === slot && (def === null || st.def === def)) { alreadyOk++; continue; }
  if (st.s !== slot) st.s = slot;
  if (def !== null && st.def !== def) {
    // C# 终值为准(1457 对齐纪律)——content 旧值补丁改写
    st.def = def;
  }
  writeFileSync(p, JSON.stringify(d, null, 1) + '\n');
  patched++;
}
console.log(`armor 补写 ${patched} 件 / 已同 ${alreadyOk} / content 缺件 ${skippedNoContent}`);
