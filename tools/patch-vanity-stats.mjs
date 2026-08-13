// 一次性:从 Terarria1456 Item.cs 提取 vanity=true 物品清单,
// 给 src/data/vanilla-itemstats.json 对应条目补 "van": 1(原版 Item.vanity)。
// 两类来源（2026-08-14 补范围块——Boss 面具 2104-2113 无 case 标签曾被整段漏提）:
//   ① 五个 SetDefaultsN switch 的 case 块内 `vanity = true;`
//   ② `if (type >= A && type <= B)` 范围块内 `vanity = true;`(全体成员同标记)
// 用法: node tools/patch-vanity-stats.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync('../Terarria1456/Terraria/Item.cs', 'utf8');
const lines = src.split('\n');
const vanityIds = new Set();
// ① case 块
let curCase = -1, inSwitch = false;
for (const l of lines) {
  const m = /^\t\tcase (\d+):/.exec(l);
  if (m) { curCase = Number(m[1]); inSwitch = true; continue; }
  if (inSwitch && /^\t\t\tvanity = true;/.test(l) && curCase >= 0) vanityIds.add(curCase);
  if (inSwitch && /^\t\}/.test(l)) { inSwitch = false; curCase = -1; }
}
// ② 范围块（花括号配对收块体）
for (let i = 0; i < lines.length; i++) {
  const m = /^\t\tif \(type >= (\d+) && type <= (\d+)\)/.exec(lines[i]);
  if (!m) continue;
  let depth = 0, blob = [];
  for (let j = i; j < lines.length; j++) {
    blob.push(lines[j]);
    depth += (lines[j].match(/{/g) ?? []).length - (lines[j].match(/}/g) ?? []).length;
    if (depth <= 0 && j > i) break;
  }
  if (blob.join('\n').includes('vanity = true;')) {
    for (let id = Number(m[1]); id <= Number(m[2]); id++) vanityIds.add(id);
  }
}
console.log('vanity=true 物品数(含范围块):', vanityIds.size);
const stats0 = JSON.parse(readFileSync('src/data/vanilla-itemstats.json', 'utf8'));
// ③ 范围块的算式槽位（如 Boss 面具 `headSlot = type + 146 - 2104`）——原提取器只认
//    case 内字面量,整族漏表;此处逐 id 求值并入表 {s,hs/bs/ls,van}
const slotInserts = {};
for (let i = 0; i < lines.length; i++) {
  const m = /^\t\tif \(type >= (\d+) && type <= (\d+)\)/.exec(lines[i]);
  if (!m) continue;
  let depth = 0; const blob = [];
  for (let j = i; j < lines.length; j++) {
    blob.push(lines[j]);
    depth += (lines[j].match(/{/g) ?? []).length - (lines[j].match(/}/g) ?? []).length;
    if (depth <= 0 && j > i) break;
  }
  const text = blob.join('\n');
  const slotM = /headSlot = type \+ (\d+) - (\d+)/.exec(text)
    ?? /bodySlot = type \+ (\d+) - (\d+)/.exec(text)
    ?? /legSlot = type \+ (\d+) - (\d+)/.exec(text);
  if (!slotM) continue;
  const kind = /headSlot/.test(slotM[0]) ? 'h' : /bodySlot/.test(slotM[0]) ? 'b' : 'l';
  const off = Number(slotM[1]) - Number(slotM[2]);
  for (let id = Number(m[1]); id <= Number(m[2]); id++) {
    const entry = { s: kind, van: 1 };
    if (kind === 'h') entry.hs = id + off;
    else if (kind === 'b') entry.bs = id + off;
    else entry.ls = id + off;
    slotInserts[String(id)] = entry;
    vanityIds.add(id);
  }
}
Object.assign(stats0, slotInserts);
// stats0 已含 slotInserts 合并;再统一 van 标记后落盘
const stats = stats0;
let hit = 0;
const missing = [];
for (const id of vanityIds) {
  const k = String(id);
  if (stats[k]) {
    if (stats[k].van !== 1) hit++;
    stats[k].van = 1;
  } else missing.push(id);
}
console.log('stats 新增标记:', hit, '入表总数:', Object.keys(stats).length,
  '未入表(非装备):', missing.length, missing.slice(0, 10));
writeFileSync('src/data/vanilla-itemstats.json', JSON.stringify(stats) + '\n');
console.log('patched → src/data/vanilla-itemstats.json');
