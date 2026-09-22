// 提取墙面物品映射（itemId → createWall）→ src/data/vanilla-wallitems.json
//
// 数据权威 = Item.cs SetDefaults1-5 的全部 createWall 赋值（1457 反编译，行号锚见
// 各常量注释）。旧版提取器只认 `\t\tcase N:\n + createWall = 数字;` 一种写法，
// 漏掉三类（先例见 items.ts CAGE_ITEM_SHEET 头注"三种写法"）：
//   1. 直赋        ：createWall = N; / DefaultToPlaceableWall(N);      （Item.cs:48017 辅助）
//   2. 共享 case 段 ：`case 1949: case 1950: … case 1957:` 连排共享一体，
//                     createWall = 116 + type - 1948;                  （Item.cs:21113）
//   3. if 区间段    ：if (type >= 2263 && type <= 2264) { createWall = 142 + type - 2263; }
//                                                                       （Item.cs:22764-22769）
// 另有两种结构陷阱：
//   - 嵌套 switch（SetDefaults3/4/5 的 default 链里 switch(type) 逐段下沉，case 缩进 3-5
//     层）：内层 case 体只属于内层 id，扫外层 case 体时必须跳过嵌套 switch 块
//     （Item.cs:25866-25929：2677-2690 段 14 个 createWall 全在内层 switch）。
//   - goto case（全区域仅 1 处 Item.cs:30016 → case 3262）：跟随目标 case 体并入。
//
// 运行：node tools/extract-wallitems.mjs（game/ 目录下；非探针，直接 node）
//
// ★BJ283 line 锚版本闸（era guard 家族,详见下方 SRC_VER 与写盘前对拍段）：line 字段
//   语义=tests/wallitems-parity.test.ts 层 B 树锚行号（钉死 1456）——BJ267 实证该测试
//   层 B 全红的病根=json 曾被 1457 缺省重跑洗锚（item 26:json 1694=1457 行号 vs 1456
//   实际 1675）。再生处方：SW_ITEM_VER=1456 node tools/extract-wallitems.mjs（BJ283 件 10）。
//
// ★BJ284 2026-09-22 era guard 落闸（四要素习语 docs/era-guard-family.md；travelshop 同款
//   cwd footgun 修复=BJ261 排期②清偿；与 BJ283 line 锚闸组合——其写侧锚门收编进
//   --write-real 臂,再生处方更新为 `SW_ITEM_VER=1456 … --write-real`）：
//   ★cwd footgun 修复：读/写缺省原为相对路径（public/sprites/vanilla.json、src/data/…），
//     从非 game/ 目录跑=读写错位；现全部锚定 GAME=import.meta.url 派生（cwd 免疫）。
//   ② 输出通道三分离：缺省=干跑对拍零写盘（双向 diff：id 集+wall/key/name 核心面严格；
//     line 域按「现库锚版本==本次版本」二相——同锚严判 drift,异锚=line 域版本二相预期,
//     报告不拒跑,写侧由 BJ283 锚门把关）/ SW_OUT=沙箱 / --write-real=写真库（BJ283 锚门+
//     diff 非纯增量拒,强推双旗 --force-full --overwrite-append-era；★家族例外：1456 系
//     line 锚再生合法通道,「非 1457 禁写」不适用本器——BJ283 定谳）。双旗互斥+探测注入面
//     SW_WALLITEMS_JSON 与 --write-real 混用拒（g1）。
//   ③ 锚 fail-loud：SetDefaults1-5 切片+对账闸门 1/2（原有）+基数护栏 292（BJ284 补）;
//   ④ 判别力自证：tests/extract-wallitems-era-guard.test.ts（mutant ROOT_TRIGGER 前置重锚）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..');   // game/（cwd 免疫）

// ★BJ183 2026-09-20 基准对齐 1456→1457（createWall 面 1456↔1457 diff=0——对拍零漂移;
// 1457 的 SetDefaults1-5 由 public 改 private,切片须双可见性兼容）
// ★BJ283：SW_ITEM_VER 白名单 {1456,1457}（缺省 1457=BJ183 现行为;1456=wallitems-parity
//   层 B 树锚再生通道——该测试钉死 1456,1457 Item.cs 已并 SetDefaults1-5 不可直读）。
//   fail-closed：非法值/反编译目录不存在即拒。
const SRC_VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1456', '1457']);
if (!VER_ALLOWED.has(SRC_VER) || !existsSync(`/Users/vinlic/Project/GLM/SandboxWorld/Terarria${SRC_VER}/Terraria/Item.cs`)) {
  console.error(`[extract-wallitems] 拒绝运行：SW_ITEM_VER="${SRC_VER}" 非法（白名单 1456/1457,且需存在 Terarria${SRC_VER}/ 反编译目录）。`);
  process.exit(1);
}
const ITEM_CS = `/Users/vinlic/Project/GLM/SandboxWorld/Terarria${SRC_VER}/Terraria/Item.cs`;
const WALLID_CS = `/Users/vinlic/Project/GLM/SandboxWorld/Terarria${SRC_VER}/Terraria.ID/WallID.cs`;

// ---- ★BJ284 输出通道三分离（头注见上；★M1 变异锚=干跑臂 null,守卫测试换假现库路径） ----
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-wallitems] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  process.exit(1);
}
if (WRITE_REAL && process.env.SW_WALLITEMS_JSON !== undefined) {
  console.error('[extract-wallitems] 拒绝运行：探测注入面（SW_WALLITEMS_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  process.exit(1);
}
const LIVE_JSON = process.env.SW_WALLITEMS_JSON ?? join(GAME, 'src', 'data', 'vanilla-wallitems.json');
const OUT_JSON = WRITE_REAL ? LIVE_JSON : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-wallitems.json` : null);

const lines = readFileSync(ITEM_CS, 'utf8').split('\n');
const depth = (i) => { let d = 0; while (lines[i]?.[d] === '\t') d++; return d; };

// ---- SetDefaults1-5 方法体切片（按下一个方法声明收边；SetDefaults3/4 与 3/5 之间
//      夹着 DefaultToQuestFish(:27625)/DefaultToGolfBall(:35420)，须各自收边排除） ----
const methodDecl = /^\t(?:public|private|internal|protected)[\w<>\[\], .]* [\w]+\(/;
const slices = [];
for (const n of [1, 2, 3, 4, 5]) {
  const s = lines.findIndex((l) => l.startsWith(`\tpublic void SetDefaults${n}(`) || l.startsWith(`\tprivate void SetDefaults${n}(`));
  if (s < 0) throw new Error(`SetDefaults${n} not found`);
  let e = s + 1;
  while (e < lines.length && !methodDecl.test(lines[e])) e++;
  slices.push([s + 1, e]);
}
const inRegion = (i) => slices.some(([a, b]) => i >= a && i < b);

// ---- case/default 标签分组：连排标签（相邻行、同缩进）共享同一体 ----
const labelRe = /^(\t*)(case (\d+)|default):$/;
const labels = [];
for (let i = 0; i < lines.length; i++) {
  if (!inRegion(i)) continue;
  const m = labelRe.exec(lines[i]);
  if (m) labels.push({ i, d: m[1].length, ids: m[3] ? [Number(m[3])] : null });
}
const groups = [];
for (let k = 0; k < labels.length; k++) {
  const g = { labels: [labels[k]], d: labels[k].d };
  while (
    k + 1 < labels.length &&
    labels[k + 1].i === labels[k].i + 1 &&
    labels[k + 1].d === g.d
  ) {
    k++;
    g.labels.push(labels[k]);
  }
  groups.push(g);
}
// 组体范围：末标签行之后到首个缩进 <= 组深的行（下一同层标签或 switch 收口 '}'）
for (const g of groups) {
  const start = g.labels[g.labels.length - 1].i + 1;
  let end = start;
  while (end < lines.length && inRegion(end) && depth(end) > g.d) end++;
  g.body = [start, end];
}

/** 从 from 行扫到 to 行，收集 createWall/DefaultToPlaceableWall 表达式与 goto case；
 *  遇嵌套 switch 整块跳过（内层 case 体属于内层 id，不归外层）。 */
function scanBody(from, to) {
  const hits = [];
  let i = from;
  while (i < to) {
    const l = lines[i];
    if (/\bswitch\s*\(/.test(l) && depth(i) > 0) {
      // 跳过整个嵌套 switch 块（花括号净深度归零为止；首行是 `switch (type)` 无
      // 花括号，须等 `{` 行起算——否则只跳一行，内层 case 体会被外层误吞）
      let net = 0;
      let started = false;
      do {
        net += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
        if (net > 0) started = true;
        i++;
      } while (i < to && (!started || net > 0));
      continue;
    }
    const cw = /\bcreateWall\s*=\s*([^;]+);/.exec(l);
    if (cw) hits.push({ expr: cw[1], line: i });
    const dw = /DefaultToPlaceableWall\((.+?)\);/.exec(l);
    if (dw) hits.push({ expr: dw[1], line: i });
    const gt = /goto case (\d+);/.exec(l);
    if (gt) hits.push({ goto: Number(gt[1]), line: i });
    i++;
  }
  return hits;
}
const l0 = (i) => lines[i] ?? '';

/** 求值 `N`、`(ushort)(A + type - B)`、`A + (type - B)` 等纯算式（type=物品 id） */
function evalExpr(expr, type, line) {
  const js = expr
    .replace(/\(ushort\)/g, '')
    .replace(/\(int\)/g, '')
    .replace(/\btype\b/g, `(${type})`)
    .replace(/\s+/g, '');
  if (!/^[-+*/()0-9]+$/.test(js)) {
    throw new Error(`Item.cs:${line + 1} 不支持的 createWall 表达式: ${expr}`);
  }
  return Math.trunc(Function(`"use strict"; return (${js});`)());
}

const wallOf = new Map(); // itemId → { wall, line }
const setWall = (id, wall, line) => {
  const prev = wallOf.get(id);
  if (prev && prev.wall !== wall) {
    throw new Error(`item ${id} 墙 id 冲突: ${prev.wall}(:${prev.line + 1}) vs ${wall}(:${line + 1})`);
  }
  if (!prev) wallOf.set(id, { wall, line });
};

// ---- 路径 A：case 组（含共享连排段）----
for (const g of groups) {
  if (!g.labels[0].ids) continue; // default 组（区间段在路径 B 处理）
  const hits = scanBody(...g.body);
  for (const id of g.labels.flatMap((x) => x.ids)) {
    for (const h of hits) {
      if (h.expr !== undefined) setWall(id, evalExpr(h.expr, id, h.line), h.line);
    }
  }
  for (const h of hits) {
    if (h.goto !== undefined) {
      // 目标 = 同层最近的 case N 组（全区域仅 Item.cs:30016 一处 goto case）
      const tgt = groups.find(
        (x) => x.d === g.d && x.labels.some((x2) => x2.ids?.includes(h.goto)),
      );
      if (!tgt) throw new Error(`Item.cs:${h.line + 1} goto case ${h.goto} 找不到同层目标`);
      const th = scanBody(...tgt.body).filter((x) => x.expr !== undefined);
      for (const id of g.labels.flatMap((x) => x.ids)) {
        for (const x of th) setWall(id, evalExpr(x.expr, id, x.line), x.line);
      }
    }
  }
}

// ---- 路径 B：if (type … N … && type … M …) 区间段（不在任何 case 体内的兜底分支） ----
const rangeRe = /if \(type (>=|>|<=|<) (\d+) && type (>=|>|<=|<) (\d+)\)/;
const cmp = (op, a, b) => (op === '>=' ? a >= b : op === '>' ? a > b : op === '<=' ? a <= b : a < b);
for (let i = 0; i < lines.length; i++) {
  if (!inRegion(i)) continue;
  const m = rangeRe.exec(lines[i]);
  if (!m) continue;
  // 平衡花括号取 if 体
  let net = 0;
  let j = i;
  let started = false;
  do {
    net += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length;
    if (net > 0) started = true;
    j++;
  } while (j < lines.length && (!started || net > 0));
  const hits = scanBody(i, j).filter((x) => x.expr !== undefined);
  if (!hits.length) continue;
  const [lo, hi] = [Number(m[2]), Number(m[4])].sort((a, b) => a - b);
  for (let id = lo; id <= hi; id++) {
    if (!cmp(m[1], id, Number(m[2])) || !cmp(m[3], id, Number(m[4]))) continue;
    for (const h of hits) setWall(id, evalExpr(h.expr, id, h.line), h.line);
  }
}

// ---- 对账闸门 1：区域内每处 createWall/DefaultToPlaceableWall 赋值行必须被归因 ≥1 件 ----
const unattributed = [];
for (let i = 0; i < lines.length; i++) {
  if (!inRegion(i)) continue;
  if (!/\bcreateWall\s*=|DefaultToPlaceableWall\(/.test(lines[i])) continue;
  const claimed = [...wallOf.values()].some((v) => v.line === i);
  if (!claimed) unattributed.push(i + 1);
}
if (unattributed.length) {
  throw new Error(`有 ${unattributed.length} 处赋值行未被归因（解析缺口）: 行 ${unattributed.join(',')}`);
}

// ---- 对账闸门 2：墙 id 必须落在 WallID 常量表内 ----
const wallConsts = new Map();
for (const m of readFileSync(WALLID_CS, 'utf8').matchAll(/public const ushort (\w+) = (\d+);/g)) {
  wallConsts.set(Number(m[2]), m[1]);
}
const unknownWalls = new Set();
for (const { wall } of wallOf.values()) {
  if (wall <= 0 || !wallConsts.has(wall)) unknownWalls.add(wall);
}
if (unknownWalls.size) throw new Error(`墙 id 无 WallID 常量: ${[...unknownWalls].join(',')}`);

// ---- 名字（vanilla.json items.key）→ 稳定 key，落盘 ----
// ★BJ284 cwd footgun 修复：vanilla.json/旧表读路径锚定 GAME（原相对路径 cwd 敏感）
const vanilla = JSON.parse(readFileSync(join(GAME, 'public', 'sprites', 'vanilla.json'), 'utf8'));
const slug = (k) =>
  k
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
let old = {};
try {
  old = JSON.parse(readFileSync(LIVE_JSON, 'utf8'));
} catch { /* 首次生成 */ }
const out = {};
for (const id of [...wallOf.keys()].sort((a, b) => a - b)) {
  const { wall, line } = wallOf.get(id);
  const name = vanilla.items[id]?.key ?? `Item${id}`;
  out[id] = { wall, key: `vi_${id}_${slug(name)}`, name, line: line + 1 };
}
// ---- ★BJ283 line 锚版本对拍（写盘前,era guard）：现库 line 语义 = wallitems-parity
//      层 B 树锚行号（测试钉死 1456）。探针=现库首条 line 在两版 Item.cs 的赋值行归属;
//      现库锚≠本次版本且未显式 SW_ITEM_VER → 拒写 exit 1（防缺省 1457 裸跑把 1456 锚
//      line 面洗成 1457——BJ267 实证层 B 全红的病根重演门）;显式 env=操作者定谳放行+预警。
//      ★BJ284 收编：本门只作用于【写真库】臂（--write-real）;缺省已转干跑零写盘,沙箱
//      写不入活库——两臂无需本门（锚门职责=拦「活库 line 域被错版本覆写」）。
const ASSN_RE = /\bcreateWall\s*=|DefaultToPlaceableWall\(/;
const anchorOf = (lineNo) => {
  for (const ver of ['1456', '1457']) {
    const srcLines = readFileSync(`/Users/vinlic/Project/GLM/SandboxWorld/Terarria${ver}/Terraria/Item.cs`, 'utf8').split('\n');
    if (ASSN_RE.test(srcLines[lineNo - 1] ?? '')) return ver;
  }
  return null;
};

// ================= ★BJ284 era guard：干跑对拍 / 沙箱 / 逃生门（头注见上） =================
// ---- ③ 基数护栏（1456 锚再生实测 292 件——地板防静默半表） ----
if (Object.keys(out).length < 280) {
  throw new Error(`[extract-wallitems] 锚点失配: 基数护栏 ${Object.keys(out).length} < 280（解析面漂移,禁止静默半表）`);
}
const FRESH = JSON.stringify(out);
/** 双向 diff：id 集+wall/key/name 核心面严格（live-only/fresh-only/drift 三轴）;
 *  line 域按锚二相——现库锚==SRC_VER 时同严格（drift 轴）,异锚=line 域版本二相预期
 *  （lineDivergent 计数,报告不拒跑——写侧由 BJ283 锚门把关）。 */
function washOf(liveObj) {
  const wash = { liveOnly: [], freshOnly: [], drift: [], lineDivergent: 0 };
  const coreOf = (o) => {
    const c = {};
    for (const [id, e] of Object.entries(o)) c[id] = { wall: e.wall, key: e.key, name: e.name };
    return c;
  };
  const lk = new Set(Object.keys(liveObj));
  const fk = new Set(Object.keys(out));
  for (const k of Object.keys(liveObj)) if (!fk.has(k)) wash.liveOnly.push(`id ${k}(wall ${liveObj[k].wall})`);
  for (const k of Object.keys(out)) if (!lk.has(k)) wash.freshOnly.push(`id ${k}(wall ${out[k].wall})`);
  const liveCore = coreOf(liveObj);
  const freshCore = coreOf(out);
  for (const k of Object.keys(liveCore)) {
    if (!freshCore[k]) continue;
    if (JSON.stringify(liveCore[k]) !== JSON.stringify(freshCore[k])) {
      wash.drift.push(`id ${k}: ${JSON.stringify(liveCore[k])}→${JSON.stringify(freshCore[k])}`);
      continue;
    }
    if (liveObj[k].line !== out[k].line) wash.lineDivergent++;
  }
  return wash;
}
const washEmpty = (w) => !w.liveOnly.length && !w.freshOnly.length && !w.drift.length;
function washReport(w) {
  console.error('  物证：');
  if (w.liveOnly.length) console.error(`    [live-only] 现库独有 ${w.liveOnly.length} 件（重产缺=提取器退化/洗库面）: ${w.liveOnly.slice(0, 6).join(', ')}`);
  if (w.freshOnly.length) console.error(`    [fresh-only] 重产独有 ${w.freshOnly.length} 件（现库缺=源侧新增/现库退化）: ${w.freshOnly.slice(0, 6).join(', ')}`);
  if (w.drift.length) console.error(`    [drift] 核心面值漂移 ${w.drift.length}: ${w.drift.slice(0, 6).join(' | ')}`);
  if (w.lineDivergent) console.error(`    [line 域二相] line 差异 ${w.lineDivergent} 件（现库锚≠本次版本=预期二相,写侧由 BJ283 锚门把关）`);
}
let liveObj = null;
try { liveObj = JSON.parse(readFileSync(LIVE_JSON, 'utf8')); } catch { liveObj = null; /* 首次生成/坏损:对拍跳过 */ }
const liveAnchor = liveObj && Object.values(liveObj)[0] ? anchorOf(Object.values(liveObj)[0].line) : null;
const wash = liveObj ? washOf(liveObj) : null;
if (OUT_JSON) {
  if (WRITE_REAL) {
    // ★BJ283 line 锚门（写真库臂专用,语义原文保留）
    const liveEntry = Object.values(old)[0];
    if (liveEntry && Object.keys(out).length) {
      const la = anchorOf(liveEntry.line);
      if (la && la !== SRC_VER && process.env.SW_ITEM_VER === undefined) {
        console.error(`[extract-wallitems] 拒绝写盘：现库 line 锚=${la}（首条 item line ${liveEntry.line}）而本次版本=${SRC_VER}（缺省）——缺省裸跑会把 line 面洗错版本（wallitems-parity 层 B 树锚=1456,BJ267 实证病根）。`);
        console.error('  处置：line 锚再生=SW_ITEM_VER=1456 显式跑;1457 重放=显式 SW_ITEM_VER=1457（操作者定谳）。');
        process.exit(1);
      }
      if (la && la !== SRC_VER) {
        console.error(`[extract-wallitems] 显式 SW_ITEM_VER=${SRC_VER}：现库 line 锚=${la} ≠ 本次版本——line 面将整体迁移（操作者定谳预警）。`);
      }
    }
    if (wash && !washEmpty(wash) && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
      console.error('[extract-wallitems] 拒绝 --write-real：重产 diff 非纯增量（核心面双向差异非空）——先逐值定谳（反编译为准）再回写。');
      washReport(wash);
      console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）。');
      process.exit(1);
    }
  }
  mkdirSync(OUT_JSON.slice(0, OUT_JSON.lastIndexOf('/')), { recursive: true });
  writeFileSync(OUT_JSON, FRESH);
  console.error(`[extract-wallitems] 已写 ${OUT_JSON}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}）`);
} else if (wash === null) {
  console.error('[extract-wallitems] 干跑（零写盘）：现库缺 vanilla-wallitems.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
} else if (!washEmpty(wash)) {
  console.error('[extract-wallitems] 干跑对拍：核心面双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
  washReport(wash);
  console.error('  处置：逐值定谳（反编译为准）后显式 SW_ITEM_VER + --write-real 定谳回写；沙箱试验用 SW_OUT=<dir>。');
  process.exit(1);
} else {
  console.error(`[extract-wallitems] 干跑对拍：核心面重产盖住现库（双向零差,零写盘;line 域二相 ${wash.lineDivergent} 件,现库锚=${liveAnchor ?? '未知'}/本次=${SRC_VER}）。写盘须显式 SW_OUT=<dir> 或 --write-real。`);
}

// ---- 报告（与旧表 diff：新增/更正/删除） ----
const added = Object.keys(out).filter((k) => !(k in old));
const removed = Object.keys(old).filter((k) => !(k in out));
const changed = Object.keys(out).filter((k) => k in old && old[k].wall !== out[k].wall);
console.log(`wall items: ${Object.keys(out).length} (旧 ${Object.keys(old).length}) | walls covered: ${new Set(Object.values(out).map((v) => v.wall)).size}`);
console.log(`对账闸门: 未归因 ${unattributed.length} 处 / 未知墙 id ${unknownWalls.size} 个`);
console.log(`新增 ${added.length}: ${added.join(',')}`);
console.log(`更正 ${changed.length}: ${changed.map((k) => `${k} ${old[k].wall}→${out[k].wall}`).join(' ')}`);
console.log(`删除 ${removed.length}: ${removed.map((k) => `${k}(wall ${old[k].wall})`).join(',')}`);
