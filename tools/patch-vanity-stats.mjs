// 一次性:从 Terarria1456 Item.cs 提取 vanity=true 物品清单,
// 给 src/data/vanilla-itemstats.json 对应条目补 "van": 1(原版 Item.vanity)
// 用法: node tools/patch-vanity-stats.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync('../Terarria1456/Terraria/Item.cs', 'utf8');
// 扫五个 SetDefaultsN switch:跟踪当前 case 号,记录块内出现 vanity = true 的 case
const vanityIds = new Set();
let curCase = -1;
const lines = src.split('\n');
let inSwitch = false;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const m = /^		case (\d+):/.exec(l);
  if (m) { curCase = Number(m[1]); inSwitch = true; continue; }
  if (inSwitch && /^\t\t\tvanity = true;/.test(l) && curCase >= 0) vanityIds.add(curCase);
  // switch 结束(方法边界)重置
  if (inSwitch && /^\t\}/.test(l) && !/case/.test(l)) { inSwitch = false; curCase = -1; }
}
console.log('vanity=true 物品数:', vanityIds.size);
const stats = JSON.parse(readFileSync('src/data/vanilla-itemstats.json', 'utf8'));
let hit = 0, missing = [];
for (const id of vanityIds) {
  const k = String(id);
  if (stats[k]) { stats[k].van = 1; hit++; }
  else missing.push(id);
}
console.log('stats 命中:', hit, '未入表(非装备):', missing.length, missing.slice(0, 10));
writeFileSync('src/data/vanilla-itemstats.json', JSON.stringify(stats, null, 0) + '\n');
console.log('patched → src/data/vanilla-itemstats.json');
