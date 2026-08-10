// 图集化后悬空引用审计：vanilla.json 全部 icon/sheet 引用的文件必须在 public/sprites 下存在
import { readFileSync, existsSync } from 'node:fs';

const v = JSON.parse(readFileSync('public/sprites/vanilla.json'));
const missing = new Set();
let atlasIcons = 0, singleIcons = 0;
for (const m of Object.values(v.items)) {
  if (!existsSync(`public/sprites/${m.icon}`)) missing.add(m.icon);
  if (m.ix !== undefined) atlasIcons++; else singleIcons++;
}
const sheets = new Set();
for (const t of Object.values(v.tiles)) sheets.add(t.sheet);
for (const w of Object.values(v.walls)) sheets.add(w.sheet);
for (const n of Object.values(v.npcs ?? {})) if (n.sheet) sheets.add(n.sheet);
for (const s of sheets) if (!existsSync(`public/sprites/${s}`)) missing.add(s);
console.log('图标总数:', atlasIcons + singleIcons, '| 图集子矩形:', atlasIcons, '| 单体:', singleIcons);
console.log('缺失文件:', missing.size ? [...missing].slice(0, 10) : '无 ✓');
