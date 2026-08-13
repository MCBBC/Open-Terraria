// Journey 研究（献祭）需求表提取（1.4.5.6 = Terarria1456）→ src/data/vanilla-research.json。
//
// 权威来源（反编译）：
//   1. Terarria1456/Terraria.GameContent.Creative.Content.Sacrifices.tsv（6195 行）
//      —— CreativeItemSacrificesCatalog.Initialize（CreativeItemSacrificesCatalog.cs:14-69）
//      内嵌资源原文。逐行规则 1:1：
//        · 行首 "//" 跳过（:30-32）
//        · 按 '\t' 分列，列数 < 3 跳过（:36，array2.Length >= 3）
//        · 第 0 列 = ItemID 常量名，Search.TryGetId 解析失败跳过（:36）
//        · 第 1 列 ToLower 后查类别表（:40-58）：
//            ""/"a"=50  "b"=25  "c"=5  "d"=1  "e"=剔除(flag)  "f"=2  "g"=3
//            "h"=10  "i"=15  "j"=30  "k"=99  "l"=100  "m"=200  "n"=20  "o"=400
//            其余 → 原版直接 throw（:56）——提取器同样 fail fast。
//   2. Terarria1456/Terraria.ID/ContentSamples.cs FillResearchItemOverrides（:884-892）
//      —— CreativeResearchItemPersistentIdOverride（ContentSamples.cs:823）。
//      AddItemResearchOverride(itemTypeToUnlock, params itemsThatWillResearchIt)
//      （:896-902）语义：献祭 params 里的物品 → 计入 unlock 物品的研究。
//      运行时三处（GetSacrificeCount :40 / TryGetSacrificeNumbers :78 / RegisterItemSacrifice
//      :117）都先走 override 再查 need 表，因此计数器按「解析后 id」共享。
//   3. Terarria1456/Terraria.ID/ItemID.cs（:1443-13833，public const short NAME = id;）
//      —— 名称 → net id；Count = 6147（:13833）。
//        CountFullyResearchedItems（ItemsSacrificedUnlocksTracker.cs:59-74）按
//        0..ItemID.Count-1 逐 id 调 TryGetSacrificeNumbers 计 allItems（override
//        解析成功的牺牲品也计入）——Research.ts 同法，不能用 need 表长度近似。
//
// 产物结构：{ v, meta:{源行号锚点}, count, need:{id:数量}, override:{牺牲id:解锁id} }
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf8');

/** 类别字母 → 需求数量（CreativeItemSacrificesCatalog.cs:25-58 switch 1:1）。
 *  值为 null = 类别 e（剔除，不入 need 表）。 */
const CATEGORY = {
  '': 50, a: 50, b: 25, c: 5, d: 1, e: null, f: 2, g: 3,
  h: 10, i: 15, j: 30, k: 99, l: 100, m: 200, n: 20, o: 400,
};

// ---- ItemID.cs：名称 → id（public const short NAME = id;）----
const itemidSrc = read('Terarria1456/Terraria.ID/ItemID.cs');
const idByName = new Map();
const idRe = /public const short ([A-Za-z0-9_]+) = (-?\d+);/g;
for (const m of itemidSrc.matchAll(idRe)) {
  if (idByName.has(m[1])) throw new Error(`ItemID.cs duplicate name: ${m[1]}`);
  idByName.set(m[1], parseInt(m[2], 10));
}
const countMatch = itemidSrc.match(/public static readonly short Count = (\d+);/);
if (!countMatch) throw new Error('ItemID.Count not found');
const ITEM_COUNT = parseInt(countMatch[1], 10);

// ---- Sacrifices.tsv：need 表 ----
const tsv = read('Terarria1456/Terraria.GameContent.Creative.Content.Sacrifices.tsv');
const need = {};
const hist = {};
let dataRows = 0, commentRows = 0, shortRows = 0, unknownNames = 0, excluded = 0;
for (const rawLine of tsv.split(/\r\n|\r|\n/)) {
  if (rawLine.startsWith('//')) { commentRows++; continue; }          // :30-32
  const cols = rawLine.split('\t');
  if (cols.length < 3) { shortRows++; continue; }                     // :36
  const name = cols[0];
  if (!idByName.has(name)) { unknownNames++; continue; }              // Search.TryGetId 失败跳过
  const cat = cols[1].toLowerCase();                                  // :40
  if (!(cat in CATEGORY)) throw new Error(`no category for ${name}: ${cols[1]}`);
  const value = CATEGORY[cat];
  hist[cat] = (hist[cat] ?? 0) + 1;
  dataRows++;
  if (value === null) { excluded++; continue; }                       // 'e' = flag 剔除
  const id = idByName.get(name);
  if (id < 0) { excluded++; continue; }                               // 负 id 不在 0..Count-1 域内
  need[String(id)] = value;
}

// ---- ContentSamples.cs：研究 id 覆盖表（FillResearchItemOverrides :884-892）----
const csSrc = read('Terarria1456/Terraria.ID/ContentSamples.cs');
const fnMatch = csSrc.match(
  /private static void FillResearchItemOverrides\(\)\s*\{([\s\S]*?)\n\t\}/,
);
if (!fnMatch) throw new Error('FillResearchItemOverrides not found');
const override = {};
let overrideLines = 0;
for (const m of fnMatch[1].matchAll(/AddItemResearchOverride\((\d+),\s*([\d,\s]+)\);/g)) {
  const unlock = parseInt(m[1], 10);
  for (const s of m[2].split(',').map((x) => parseInt(x.trim(), 10))) {
    if (!Number.isFinite(s)) continue;
    override[String(s)] = unlock;                                     // AddItemResearchOverride_Inner :906
    overrideLines++;
  }
}

const out = {
  v: 1,
  meta: {
    source: 'Terarria1456 1.4.5.6',
    tsv: 'Terraria.GameContent.Creative.Content.Sacrifices.tsv',
    catalog: 'CreativeItemSacrificesCatalog.cs:14-69',
    overrideSrc: 'ContentSamples.cs FillResearchItemOverrides:884-892',
    tracker: 'ItemsSacrificedUnlocksTracker.cs',
    rows: { data: dataRows, comment: commentRows, short: shortRows, unknownName: unknownNames, excluded },
  },
  count: ITEM_COUNT,
  need,
  override,
};
writeFileSync(
  `${ROOT}/game/src/data/vanilla-research.json`,
  JSON.stringify(out),
);
console.log(`need=${Object.keys(need).length} override=${overrideLines} count=${ITEM_COUNT} ` +
  `rows(data/comment/short/unknown/excluded)=${dataRows}/${commentRows}/${shortRows}/${unknownNames}/${excluded}`);
console.log('category histogram:', JSON.stringify(hist));
