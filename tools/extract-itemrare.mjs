// 从 Terarria1456 Item.cs SetDefaults1..5 的 case 块提取 rare 字段 → src/data/vanilla-itemrare.json。
// 未列出的物品 rare=0（ResetStats 默认）。供 Tooltip 稀有度着色精确化（原版 GetItemNameColor 15 档）。
// 2026-08-11 增量：同时提取 value（含 sellPrice(p,g,s[,c]) 求值）→ vanilla-itemvalue.json
//（重铸费用 value×stack÷3 与商店定价用；vi_ 批次注册默认 value=1，权威值在此表）。
// 2026-08-13 注：case 空体 = C# 贯空 fallthrough 或工厂方法（DefaultToSeaShell() 等，
// value 在方法体内赋值，静态提取不可见）。后者导致贝壳 2625/蝴蝶 4831-4843/月亮碎片
// 2436-2437 缺 value——RecipeGroup.DecraftItemId（Shimmer.groupDecraftItemId）对这 3 组
// 的组代表取值与原版有同价错位（原版 OrderBy(value).First() 取组内首个，此取首个有值项），
// 影响仅限同价并列组的返还代表物身份，登记待办。
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const src = readFileSync(`${ROOT}/Terarria1456/Terraria/Item.cs`, 'utf8');
const RARE = {};
const VALUE = {};
const caseRe = /case (\d+):([\s\S]*?)(?=case \d+:|default:|\n\t\tbreak;)/g;
let m;
// sellPrice(platinum, gold, silver[, copper]) = p*1000000 + g*10000 + s*100 + c（Item.cs 同名方法）
const evalValue = (expr) => {
  const sp = expr.match(/sellPrice\((\d+(?:\s*,\s*\d+)*)\)/);
  if (sp) {
    const a = sp[1].split(',').map((x) => parseInt(x.trim(), 10));
    return (a[0] || 0) * 1000000 + (a[1] || 0) * 10000 + (a[2] || 0) * 100 + (a[3] || 0);
  }
  const lit = expr.match(/^(\d+)$/);
  return lit ? +lit[1] : null;
};
while ((m = caseRe.exec(src))) {
  const id = +m[1];
  const body = m[2].slice(0, 1200);
  const r = body.match(/\brare = (-?\d+);/);
  if (r) RARE[id] = +r[1];
  const v = body.match(/\bvalue = ([^;]+);/);
  if (v) {
    const val = evalValue(v[1].trim());
    if (val !== null) VALUE[id] = val;
  }
}
writeFileSync(`${ROOT}/game/src/data/vanilla-itemrare.json`, JSON.stringify(RARE));
writeFileSync(`${ROOT}/game/src/data/vanilla-itemvalue.json`, JSON.stringify(VALUE));
console.error(`rare 条目: ${Object.keys(RARE).length} / value 条目: ${Object.keys(VALUE).length}`);
