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
import { readFileSync, writeFileSync } from 'fs';

// ★BJ183 2026-09-20 基准对齐 1456→1457（createWall 面 1456↔1457 diff=0——对拍零漂移;
// 1457 的 SetDefaults1-5 由 public 改 private,切片须双可见性兼容）
const ITEM_CS = '/Users/vinlic/Project/GLM/SandboxWorld/Terarria1457/Terraria/Item.cs';
const WALLID_CS = '/Users/vinlic/Project/GLM/SandboxWorld/Terarria1457/Terraria.ID/WallID.cs';

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
const vanilla = JSON.parse(readFileSync('public/sprites/vanilla.json', 'utf8'));
const slug = (k) =>
  k
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
let old = {};
try {
  old = JSON.parse(readFileSync('src/data/vanilla-wallitems.json', 'utf8'));
} catch { /* 首次生成 */ }
const out = {};
for (const id of [...wallOf.keys()].sort((a, b) => a - b)) {
  const { wall, line } = wallOf.get(id);
  const name = vanilla.items[id]?.key ?? `Item${id}`;
  out[id] = { wall, key: `vi_${id}_${slug(name)}`, name, line: line + 1 };
}
writeFileSync('src/data/vanilla-wallitems.json', JSON.stringify(out));

// ---- 报告（与旧表 diff：新增/更正/删除） ----
const added = Object.keys(out).filter((k) => !(k in old));
const removed = Object.keys(old).filter((k) => !(k in out));
const changed = Object.keys(out).filter((k) => k in old && old[k].wall !== out[k].wall);
console.log(`wall items: ${Object.keys(out).length} (旧 ${Object.keys(old).length}) | walls covered: ${new Set(Object.values(out).map((v) => v.wall)).size}`);
console.log(`对账闸门: 未归因 ${unattributed.length} 处 / 未知墙 id ${unknownWalls.size} 个`);
console.log(`新增 ${added.length}: ${added.join(',')}`);
console.log(`更正 ${changed.length}: ${changed.map((k) => `${k} ${old[k].wall}→${out[k].wall}`).join(' ')}`);
console.log(`删除 ${removed.length}: ${removed.map((k) => `${k}(wall ${old[k].wall})`).join(',')}`);
