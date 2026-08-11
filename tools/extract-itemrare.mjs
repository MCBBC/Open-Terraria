// 从 Terarria1456 Item.cs SetDefaults1..5 的 case 块提取 rare 字段 → src/data/vanilla-itemrare.json。
// 未列出的物品 rare=0（ResetStats 默认）。供 Tooltip 稀有度着色精确化（原版 GetItemNameColor 15 档）。
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const src = readFileSync(`${ROOT}/Terarria1456/Terraria/Item.cs`, 'utf8');
const RARE = {};
const caseRe = /case (\d+):([\s\S]*?)(?=case \d+:|default:|\n\t\tbreak;)/g;
let m;
while ((m = caseRe.exec(src))) {
  const id = +m[1];
  const body = m[2].slice(0, 1200);
  const r = body.match(/\brare = (-?\d+);/);
  if (r) RARE[id] = +r[1];
}
writeFileSync(`${ROOT}/game/src/data/vanilla-itemrare.json`, JSON.stringify(RARE));
console.error(`rare 条目: ${Object.keys(RARE).length}`);
