// Journey 研究（献祭）需求表提取（基线 = Terarria1458，1.4.5.8；SW_RESEARCH_BASE 可覆盖）
// → src/data/vanilla-research.json。（R24 2026-08-24：默认档由 1456 切 1458——补
// ids 6147..6195 共 49 条新物品 + override 两组 {6169,6193,6194}→6168 / 6195→6190）
//
// 权威来源（反编译）：
//   1. <BASE>/Terraria.GameContent.Creative.Content.Sacrifices.tsv（1458=6243 行）
//      —— CreativeItemSacrificesCatalog.Initialize（CreativeItemSacrificesCatalog.cs:14-69）
//      内嵌资源原文。逐行规则 1:1：
//        · 行首 "//" 跳过（:30-32）
//        · 按 '\t' 分列，列数 < 3 跳过（:36，array2.Length >= 3）
//        · 第 0 列 = ItemID 常量名，Search.TryGetId 解析失败跳过（:36）
//        · 第 1 列 ToLower 后查类别表（:40-58）：
//            ""/"a"=50  "b"=25  "c"=5  "d"=1  "e"=剔除(flag)  "f"=2  "g"=3
//            "h"=10  "i"=15  "j"=30  "k"=99  "l"=100  "m"=200  "n"=20  "o"=400
//            其余 → 原版直接 throw（:56）——提取器同样 fail fast。
//   2. <BASE>/Terraria.ID/ContentSamples.cs FillResearchItemOverrides（:884-897，10 组）
//      —— CreativeResearchItemPersistentIdOverride（ContentSamples.cs:823）。
//      AddItemResearchOverride(itemTypeToUnlock, params itemsThatWillResearchIt)
//      （:896-902）语义：献祭 params 里的物品 → 计入 unlock 物品的研究。
//      运行时三处（GetSacrificeCount :40 / TryGetSacrificeNumbers :78 / RegisterItemSacrifice
//      :117）都先走 override 再查 need 表，因此计数器按「解析后 id」共享。
//   3. <BASE>/Terraria.ID/ItemID.cs（public const short NAME = id;）
//      —— 名称 → net id；Count = 6147（:13833）。
//        CountFullyResearchedItems（ItemsSacrificedUnlocksTracker.cs:59-74）按
//        0..ItemID.Count-1 逐 id 调 TryGetSacrificeNumbers 计 allItems（override
//        解析成功的牺牲品也计入）——Research.ts 同法，不能用 need 表长度近似。
//
// 产物结构：{ v, meta:{源行号锚点}, count, need:{id:数量}, override:{牺牲id:解锁id} }
//
// ★BJ298 2026-09-23 era guard 落闸（四要素习语 docs/era-guard-family.md,BJ284 banners
//   同构;BJ261 续批排期②【洗库险·B 形】清偿——原缺省无 env 无旗直写现库）：
//   ① 基线白名单 {1457,1458}（SW_RESEARCH_BASE/SW_ITEM_VER 归一为裸版本;缺省 1458 系
//     ★刻意保留（R24 2026-08-24 定）——三读域 Sacrifices.tsv/ContentSamples.cs/ItemID.cs
//     1457↔1458 逐字节全等（md5 18e21421/ade71710/49a0e26a,BJ298 亲核）→ 双档重产同构,
//     「非 1457 禁写」豁免本器（1458=合法定谳基线,非旧锚）;1456 退役显式拒+指引）;
//   ② 输出通道三分离：缺省=干跑对拍零写盘（双向路径级 diff——live-only=洗库预警/
//     fresh-only=现库退化缺键型,任一非空 exit 1+物证;★meta.source 动态基线串按 BJ284
//     处方豁免对拍）/ SW_OUT=<dir>=沙箱 / --write-real=写真库（diff 非纯增量拒,强推须
//     --force-full --overwrite-append-era 双旗）;SW_OUT 与 --write-real 双旗互斥;探测注入面
//     SW_RESEARCH_JSON 与 --write-real 混用拒（g1 footgun）;
//   ③ 锚 fail-loud：ItemID.Count/FillResearchItemOverrides/类别表 throw（原有）+基数护栏
//     （need≥600/override=10 组/count=6196,BJ298 亲数）;
//   ④ 判别力自证：tests/extract-tables2-era-guard.test.ts（M1 摘干跑门/M3 摘 fresh-only 轴）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
// ---- ★BJ298 era guard ①②：基线白名单 + 输出通道开关（对拍在文末落盘段） ----
// 基线档（2026-08-24 R24：默认随基准切到 Terarria1458 系刻意,维持;SW_RESEARCH_BASE 可覆盖）
const VER = (process.env.SW_RESEARCH_BASE ?? process.env.SW_ITEM_VER ?? '1458')
  .replace(/^Terarria/, '').replace(/[^0-9]/g, '') || '1458';
const VER_ALLOWED = new Set(['1457', '1458']);
if (!VER_ALLOWED.has(VER) || !existsSync(`${ROOT}/Terarria${VER}/Terraria.ID/ItemID.cs`)) {
  console.error(`[extract-research] 拒绝运行：基线="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1456') console.error('  1456 锚集已退役（R24 2026-08-24 默认档切 1458,BJ298 落闸）；1456 回拍读时代快照。');
  process.exit(1);
}
const BASE = `Terarria${VER}`;
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-research] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  process.exit(1);
}
if (WRITE_REAL && process.env.SW_RESEARCH_JSON !== undefined) {
  console.error('[extract-research] 拒绝运行：探测注入面（SW_RESEARCH_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  process.exit(1);
}
const LIVE_JSON = process.env.SW_RESEARCH_JSON ?? `${ROOT}/game/src/data/vanilla-research.json`;
const OUT_JSON = WRITE_REAL
  ? LIVE_JSON
  : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-research.json` : null);
const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf8');

/** 类别字母 → 需求数量（CreativeItemSacrificesCatalog.cs:25-58 switch 1:1）。
 *  值为 null = 类别 e（剔除，不入 need 表）。 */
const CATEGORY = {
  '': 50, a: 50, b: 25, c: 5, d: 1, e: null, f: 2, g: 3,
  h: 10, i: 15, j: 30, k: 99, l: 100, m: 200, n: 20, o: 400,
};

// ---- ItemID.cs：名称 → id（public const short NAME = id;）----
const itemidSrc = read(`${BASE}/Terraria.ID/ItemID.cs`);
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
const tsv = read(`${BASE}/Terraria.GameContent.Creative.Content.Sacrifices.tsv`);
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
const csSrc = read(`${BASE}/Terraria.ID/ContentSamples.cs`);
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
    source: `${BASE}（SW_RESEARCH_BASE 可覆盖）`,
    tsv: 'Terraria.GameContent.Creative.Content.Sacrifices.tsv',
    catalog: 'CreativeItemSacrificesCatalog.cs:14-69',
    overrideSrc: 'ContentSamples.cs FillResearchItemOverrides:884-897',
    tracker: 'ItemsSacrificedUnlocksTracker.cs',
    rows: { data: dataRows, comment: commentRows, short: shortRows, unknownName: unknownNames, excluded },
  },
  count: ITEM_COUNT,
  need,
  override,
};
// ---- ★BJ298 ③ 基数护栏（1458 实测 need 6138/override 16/count 6196,BJ298 亲数）----
if (Object.keys(need).length < 6000 || overrideLines < 10 || ITEM_COUNT !== 6196) {
  throw new Error(`[extract-research] 锚点失配: 基数护栏: need ${Object.keys(need).length} < 6000 / override ${overrideLines} < 10 / count ${ITEM_COUNT} ≠ 6196（解析面漂移,禁止静默半表）`);
}

// ---- ★BJ298 era guard ②：干跑对拍 / 沙箱 / 逃生门（banners 同构 deepWash;
//      meta.source 动态基线串豁免——BJ284 处方:动态 provenance 串会令交叉重放假红）----
/** 现库 vs 重产双向路径级 diff。live-only=洗库预警面 / fresh-only=现库退化缺键型面
 *  （★G-1/S3 处方）/ drift=同路径值漂移。 */
function deepWash(live, fresh, prefix = '') {
  const w = { liveOnly: [], freshOnly: [], drift: [] };
  const base = prefix || '<root>';
  if (live === null || fresh === null || typeof live !== 'object' || typeof fresh !== 'object') {
    if (JSON.stringify(live) !== JSON.stringify(fresh)) w.drift.push(`${base}: ${JSON.stringify(live)}→${JSON.stringify(fresh)}`);
    return w;
  }
  if (Array.isArray(live) !== Array.isArray(fresh)) {
    w.drift.push(`${base}: 类型漂移 ${Array.isArray(live) ? 'arr' : 'obj'}↔${Array.isArray(fresh) ? 'arr' : 'obj'}`);
    return w;
  }
  const lk = new Set(Object.keys(live));
  const fk = new Set(Object.keys(fresh));
  for (const k of Object.keys(live)) {
    const p = `${prefix}.${k}`;
    if (!fk.has(k)) { w.liveOnly.push(p); continue; }
    const sub = deepWash(live[k], fresh[k], p);
    w.liveOnly.push(...sub.liveOnly); w.freshOnly.push(...sub.freshOnly); w.drift.push(...sub.drift);
  }
  for (const k of Object.keys(fresh)) if (!lk.has(k)) w.freshOnly.push(`${prefix}.${k}`);
  return w;
}
const washEmpty = (v) => !v.liveOnly.length && !v.freshOnly.length && !v.drift.length;
function washReport(v) {
  console.error('  物证：');
  if (v.liveOnly.length) console.error(`    [live-only] 现库独有 ${v.liveOnly.length} 处（重产缺=提取器退化/洗库面）: ${v.liveOnly.slice(0, 6).join(', ')}`);
  if (v.freshOnly.length) console.error(`    [fresh-only] 重产独有 ${v.freshOnly.length} 处（现库缺=源侧新增/现库退化）: ${v.freshOnly.slice(0, 6).join(', ')}`);
  if (v.drift.length) console.error(`    [drift] 值漂移 ${v.drift.length}: ${v.drift.slice(0, 6).join(' | ')}`);
}
const stripProvenance = (o) => {
  const c = JSON.parse(JSON.stringify(o));
  if (c?.meta?.source !== undefined) c.meta.source = '<exempt>';
  return c;
};
const json = JSON.stringify(out);
let live = null;
if (existsSync(LIVE_JSON)) { try { live = JSON.parse(readFileSync(LIVE_JSON, 'utf8')); } catch { /* 坏损:不拦（npcdrops 同款） */ } }
const wash = live === null ? null : deepWash(stripProvenance(live), stripProvenance(JSON.parse(json)));
console.log(`need=${Object.keys(need).length} override=${overrideLines} count=${ITEM_COUNT} ` +
  `rows(data/comment/short/unknown/excluded)=${dataRows}/${commentRows}/${shortRows}/${unknownNames}/${excluded}`);
console.log('category histogram:', JSON.stringify(hist));
if (OUT_JSON) {
  if (WRITE_REAL && wash && !washEmpty(wash) && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
    console.error('[extract-research] 拒绝 --write-real：重产 diff 非纯增量（双向差异非空）——先逐值定谳（反编译为准）再回写。');
    washReport(wash);
    console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）。');
    process.exit(1);
  }
  mkdirSync(OUT_JSON.slice(0, OUT_JSON.lastIndexOf('/')), { recursive: true });
  writeFileSync(OUT_JSON, json);
  console.error(`[extract-research] 已写 ${OUT_JSON}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}）`);
} else if (wash === null) {
  console.error('[extract-research] 干跑（零写盘）：现库缺 vanilla-research.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
} else if (!washEmpty(wash)) {
  console.error('[extract-research] 干跑对拍：双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
  washReport(wash);
  console.error('  处置：逐值定谳（反编译为准）后 --write-real 定谳回写；沙箱试验用 SW_OUT=<dir>。');
  process.exit(1);
} else {
  console.error('[extract-research] 干跑对拍：重产盖住现库（双向零差,零写盘）。写盘须显式 SW_OUT=<dir> 或 --write-real。');
}
