// 旅程物品浏览器数据提取器（M8）→ src/data/vanilla-journeycat.json
// 标杆（Terarria1457；★BJ183 2026-09-20 基准对齐 1456→1457——
// 1457 增 6147-6195 新物品档/逐物品 placeStyle/dmg 重平衡/753 GiantTiki tile）：
//   Terraria.ID/ContentSamples.cs CreativeHelper.GetItemGroup（:117-675，分组+组内序）
//     + SetCreativeMenuOrder（:699-733，仅存 {Group, OrderInGroup}——组内迭代序不影响
//     排序：SortingSteps.ByCreativeSortingId.Compare 按 struct 两字段比较）
//   Terraria.GameContent.Creative/ItemFilters.cs（10 过滤器 + MiscFallback 依据字段）
// 输出 = 逐 vid 的【原始字段】（缺省即反编译默认：Item.cs 字段声明 :78-294 +
//   SetDefaults 复位块 :48540-48620——damage 默认 **-1**（:48609），createTile/Wall -1，
//   tileWand/hairDye/mountType/headSlot/bodySlot/legSlot -1，fishingPole 1）。
//   分组/排序逻辑不在此算——TS 侧 src/ui/JourneyBrowser.ts 1:1 移植 getItemGroup
//   （可测可对账，行号注释直接指向 ContentSamples.cs）。
// 数据源：
//   ① 本提取器新扫（Item.cs SetDefaults1-5 case 段，嵌套 switch 语义同
//      extract-equip-prefix.mjs 的 caseParts/resolveCaseField）：
//      damage（含负值！）/vanity/tileWand/makeNPC(DefaultToCapturedCritter)/
//      placeStyle+createTile(字面量与 DefaultToPlaceableTile 双通道)/
//      createWall(字面量与 DefaultToPlaceableWall)/buffTime/fishingPole/expert/questItem
//   ② 既有提取产物合并：vanilla-itemfunc（pick/axe/hammer/bait/buffType/healLife/
//      healMana/consumable/useStyle/ammo/notAmmo/melee/ranged/magic/summon/shoot）
//      vanilla-itemcombat（damage 兜底）/vanilla-itemstats（defense/accessory/
//      head-body-legSlot）/vanilla-itemrare（rare）/vanilla-equip（dye/pet/light/
//      mount/cart/hook）/vanilla-hairdyes（hairDye 物品）
//   ③ material = Recipe.UpdateWhichItemsAreMaterials（Recipe.cs:15075-15100）：
//      全配方素材并集 + 被用作配料的 RecipeGroup 成员展开（IsAMaterial 运行期
//      由配方系统填充，ItemID.cs 里是空表——勿在 ItemID.cs 找）
//   ④ createTile 权威 = public/sprites/vanilla.json（游戏数据转储，与 TEdit 对账过）
//   ⑤ tileFrameImportant = Main.cs 全量赋值（404 处 = true + 435-439 循环，无 = false）
// 用法：node tools/extract-journey-browser.mjs（在 game/ 下运行）
//
// ★BJ298 2026-09-23 era guard 补缺省干跑臂（docs/era-guard-family.md 四之二续批排期③
//   【降级面】——原缺省直写现库,仅 SW_FX53_OUT 试产重定向;BJ261 登记"补缺省干跑臂即可"）：
//   · 缺省（无 env 无旗）= 干跑对拍零写盘（重产 vs 现库双向路径级 diff——fresh-only/
//     drift 非空 exit 1+物证（现库退化/值漂移）;live-only=【选报】轴 loud 打印不拒跑
//     ——本器现库领先面含手补可能,人工判别,shops 刻意剥离面同款家族变体）;
//   · SW_FX53_OUT=<dir> = 沙箱写（SW-FX53 原通道,保留）;--write-real = 真库逃生门（新增;
//     与 SW_FX53_OUT 双旗互斥;★本器锚 1457 固定,非 1457 禁写规则天然满足）;
//   · 锚 fail-loud/基数护栏：沿用既有 stats 出口（提取器健康度目检）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const WRITE_REAL = process.argv.includes('--write-real');
const SW_FX53_OUT = process.env.SW_FX53_OUT;
if (SW_FX53_OUT && WRITE_REAL) {
  console.error('[extract-journey-browser] 拒绝运行：SW_FX53_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  process.exit(1);
}
const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf8');
const itemSrc = read('Terarria1457/Terraria/Item.cs');
const mainSrc = read('Terarria1457/Terraria/Main.cs');

// ---- case 段解析（同 extract-equip-prefix.mjs；最近一层 switch(type) 归属）----
function methodBodyOf(src, name) {
  const idx = src.indexOf(name);
  if (idx < 0) return '';
  const start = src.indexOf('{', idx);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start + 1, i); }
  }
  return '';
}

function outerCaseSegments(src) {
  const out = new Map();
  const collect = (body) => {
    const tokRe = /switch\s*\(([^)]*)\)|case (\d+):|default:|[{}]/g;
    const stack = [];
    let depth = 0, m;
    while ((m = tokRe.exec(body))) {
      const t = m[0];
      if (t.startsWith('switch')) {
        stack.push({ isType: /switch\s*\(\s*type\b/.test(t), opened: false, bodyDepth: -1, labels: [], segStart: 0 });
      } else if (t === '{') {
        depth++;
        const top = stack[stack.length - 1];
        if (top && !top.opened) { top.opened = true; top.bodyDepth = depth; top.segStart = m.index + 1; }
      } else if (t === '}') {
        const top = stack[stack.length - 1];
        if (top && top.opened && depth === top.bodyDepth) {
          const seg = body.slice(top.segStart, m.index);
          if (seg.trim() !== '') for (const id of top.labels) out.set(id, seg);
          stack.pop();
        }
        depth--;
      } else {
        const top = stack[stack.length - 1];
        if (top && top.opened && top.isType) {
          const seg = body.slice(top.segStart, m.index);
          if (seg.trim() !== '') { for (const id of top.labels) out.set(id, seg); top.labels = []; }
          if (t !== 'default:') top.labels.push(+m[2]);
          top.segStart = m.index + t.length;
        }
      }
    }
  };
  for (const n of [1, 2, 3, 4, 5]) {
    const body = methodBodyOf(src, `private void SetDefaults${n}(`)
      || methodBodyOf(src, `public void SetDefaults${n}(`)
      || methodBodyOf(src, `void SetDefaults${n}(`);
    if (body) collect(body);
  }
  return out;
}
const CASE_SEGMENTS = outerCaseSegments(itemSrc);

function typeSwitchSpans(seg) {
  const spans = [];
  const re = /switch\s*\(\s*type\s*\)/g;
  let m;
  while ((m = re.exec(seg))) {
    const brace = seg.indexOf('{', m.index + m[0].length);
    if (brace < 0) break;
    let d = 0, end = -1;
    for (let i = brace; i < seg.length; i++) {
      if (seg[i] === '{') d++;
      else if (seg[i] === '}') { d--; if (d === 0) { end = i; break; } }
    }
    if (end < 0) break;
    spans.push([m.index, end + 1]);
    re.lastIndex = end + 1;
  }
  return spans;
}

function parseSwitchCases(swBody) {
  const cases = new Map();
  let def = null;
  const tokRe = /case (\d+):|default:|[{}]/g;
  let depth = 0, segStart = 0, m;
  let pending = [];
  const flush = (endIdx) => {
    const body = swBody.slice(segStart, endIdx);
    if (body.trim() === '') return;
    for (const L of pending) {
      if (L === 'def') def = body; else cases.set(L, body);
    }
    pending = [];
  };
  while ((m = tokRe.exec(swBody))) {
    const t = m[0];
    if (t.startsWith('case') || t === 'default:') {
      if (depth === 0) {
        flush(m.index);
        pending.push(t === 'default:' ? 'def' : +m[1]);
        segStart = m.index + t.length;
      }
    } else if (t === '{') depth++;
    else if (t === '}') depth--;
  }
  flush(swBody.length);
  return { cases, def };
}

function caseParts(seg, id) {
  const spans = typeSwitchSpans(seg);
  const parts = [];
  let last = 0;
  for (const [s, e] of spans) {
    parts.push(seg.slice(last, s));
    const brace = seg.indexOf('{', s);
    const { cases, def } = parseSwitchCases(seg.slice(brace + 1, e - 1));
    parts.push(cases.has(id) ? cases.get(id) : (def ?? ''));
    last = e;
  }
  parts.push(seg.slice(last));
  return parts;
}

/** 字段按 id 求值（后执行段覆盖先执行段——C# 顺序执行语义） */
function resolveCaseField(seg, pattern, id) {
  let val;
  for (const p of caseParts(seg, id)) {
    const m = p.match(new RegExp(pattern));
    if (m) val = m[1] !== undefined ? +m[1] : 1;
  }
  return val;
}

// SW-BK1 2026-09-06: createWall 共享算式求值（extract-wallitems.mjs evalExpr 同构,
// 与 extract-itemfunc.mjs evalArithExpr 同款）——`createWall = 116 + type - 1948;`
// 形态（Item.cs:21139/21428/22090/22370/24086/26651/33328）不被字面正则命中,
// 此前 35 件墙物品 cw 缺失只能等 itemfunc f.createWall 兜底（2263/2264 区间件在
// default 段,本提取器 CASE_SEGMENTS 不归属,仍走 itemfunc 兜底）。
function evalWallExpr(expr, id) {
  const js = expr
    .replace(/\(ushort\)/g, '')
    .replace(/\(int\)/g, '')
    .replace(/\btype\b/g, `(${id})`)
    .replace(/\s+/g, '');
  if (!/^[-+*/()0-9]+$/.test(js)) return undefined;
  return Math.trunc(Function(`"use strict"; return (${js});`)());
}

// ---- ① 新字段扫描 ----
const DAMAGE = new Map();      // 显式 damage（含 0/-1；缺省本身也是 -1，见下）
const VANITY = new Set();
const TILE_WAND = new Map();   // vid -> 被消耗物 id（>=0 才记）
const MAKE_NPC = new Map();    // DefaultToCapturedCritter(npcId)
const PLACE_TILE = new Map();  // DefaultToPlaceableTile(tile, style) 双参
const PLACE_WALL = new Map();  // DefaultToPlaceableWall(wall)
const CT_LITERAL = new Map();  // 字面量 createTile
const PS_LITERAL = new Map();  // 字面量 placeStyle
const CW_LITERAL = new Map();  // 字面量 createWall
const CW_EXPR = new Map();     // SW-BK1 2026-09-06: 共享算式 createWall（type 算式 per-id 求值）
const PS_EXPR = new Map();     // SW-FX53 2026-09-13: 共享算式 placeStyle（同 evalWallExpr 通道）
const PET_PROJ = new Map();    // SW-FX53 2026-09-13: DefaultToVanitypet 算式 per-id shoot（boss 宠 21 件）
const BUFF_TIME = new Map();
const FISHING = new Map();
const EXPERT = new Set();
const QUEST = new Set();
for (const [id, seg] of CASE_SEGMENTS) {
  const dm = resolveCaseField(seg, '\\bdamage\\s*=\\s*(-?\\d+);', id);
  if (dm !== undefined) DAMAGE.set(id, dm);
  if (resolveCaseField(seg, '\\bvanity\\s*=\\s*true;', id)) VANITY.add(id);
  const tw = resolveCaseField(seg, '\\btileWand\\s*=\\s*(\\d+);', id);
  if (tw !== undefined) TILE_WAND.set(id, tw);
  const mn = resolveCaseField(seg, 'DefaultToCapturedCritter\\(\\s*(-?\\d+)\\s*\\)', id);
  if (mn !== undefined) MAKE_NPC.set(id, mn);
  // DefaultToPlaceableTile(tile, style[, flag])（Item.cs:47770）——createTile+placeStyle 双值
  const pt = resolveCaseField(seg, 'DefaultToPlaceableTile\\(\\s*(?:\\(\\s*(?:u?short|sbyte|byte|int)\\s*\\)\\s*)?(\\d+)\\s*,\\s*(\\d+)\\s*[^)]*\\)', id);
  if (pt !== undefined) PLACE_TILE.set(id, true);
  const pw = resolveCaseField(seg, 'DefaultToPlaceableWall\\(\\s*(\\d+)\\s*[^)]*\\)', id);
  if (pw !== undefined) PLACE_WALL.set(id, pw);
  const ct = resolveCaseField(seg, '\\bcreateTile\\s*=\\s*(\\d+);', id);
  if (ct !== undefined) CT_LITERAL.set(id, ct);
  const ps = resolveCaseField(seg, '\\bplaceStyle\\s*=\\s*(\\d+);', id);
  if (ps !== undefined) PS_LITERAL.set(id, ps);
  // SW-FX53 2026-09-13: 共享算式补提取（fill-when-undefined——字面已值不覆写,取段内
  // 最后命中同 C# 后写语义;`placeStyle = 1 + type - 3046` 篝火三段式等,与 itemfunc
  // 侧 evalArithExpr 通道同源。evalWallExpr 亦解纯字面,但字面已走上一通道,此处
  // 仅算式形态实际生效）。
  else {
    for (const p of caseParts(seg, id)) {
      const em = [...p.matchAll(/\bplaceStyle\s*=\s*([^;]+);/g)].pop();
      if (em) {
        const pv = evalWallExpr(em[1], id);
        if (pv !== undefined) { PS_EXPR.set(id, pv); break; }
      }
    }
  }
  // SW-FX53: DefaultToVanitypet 实参算式（`881 + type - 4797` 共享块,boss 宠 21 件）
  // ——FX48 手补面（dmg:0/shoot:N）此前靠盘上手补,重产即回退;此处解析直出 shoot,
  // damage=0 由 DefaultToVanitypet 本体（Item.cs:47937-47950 damage=0）并入合并面。
  if (!PET_PROJ.has(id)) {
    for (const p of caseParts(seg, id)) {
      const pm = [...p.matchAll(/DefaultToVanitypet\(([^,]+),\s*([^)]+)\)/g)].pop();
      if (pm) {
        const pv = evalWallExpr(pm[1], id);
        if (pv !== undefined) { PET_PROJ.set(id, pv); break; }
      }
    }
  }
  const cw = resolveCaseField(seg, '\\bcreateWall\\s*=\\s*(\\d+);', id);
  if (cw !== undefined) CW_LITERAL.set(id, cw);
  // SW-BK1 2026-09-06: 共享算式补提取（fill-when-undefined——字面已值不覆写;取段内
  // 最后命中同 C# 后写语义）。2263/2264 区间件不在 CASE_SEGMENTS（default 段丢弃）,
  // 仍由 itemfunc f.createWall 兜底——两路同值（wallitems 提取器对账面）。
  else {
    for (const p of caseParts(seg, id)) {
      const em = [...p.matchAll(/\bcreateWall\s*=\s*([^;]+);/g)].pop();
      if (em) {
        const wv = evalWallExpr(em[1], id);
        if (wv !== undefined) { CW_EXPR.set(id, wv); break; }
      }
    }
  }
  const bft = resolveCaseField(seg, '\\bbuffTime\\s*=\\s*(\\d+);', id);
  if (bft !== undefined) BUFF_TIME.set(id, bft);
  const fp = resolveCaseField(seg, '\\bfishingPole\\s*=\\s*(\\d+);', id);
  if (fp !== undefined) FISHING.set(id, fp);
  if (resolveCaseField(seg, '\\bexpert\\s*=\\s*true;', id)) EXPERT.add(id);
  if (resolveCaseField(seg, '\\bquestItem\\s*=\\s*true;', id)) QUEST.add(id);
}
// DefaultToPlaceableTile 双参提取（resolveCaseField 只回单值——单独扫原始段；
// 反编译形如 `DefaultToPlaceableTile((ushort)726, 0)`——首参带整型强转前缀）
const PLACE_TILE_ARGS = new Map();
for (const [id, seg] of CASE_SEGMENTS) {
  for (const p of caseParts(seg, id)) {
    const m = p.match(/DefaultToPlaceableTile\(\s*(?:\(\s*(?:u?short|sbyte|byte|int)\s*\)\s*)?(\d+)\s*,\s*(\d+)\s*[^)]*\)/);
    if (m) PLACE_TILE_ARGS.set(id, [+m[1], +m[2]]);
  }
}

// ---- ② 既有产物 ----
const FUNC = JSON.parse(read('game/src/data/vanilla-itemfunc.json'));
const COMBAT = JSON.parse(read('game/src/data/vanilla-itemcombat.json'));
const STATS = JSON.parse(read('game/src/data/vanilla-itemstats.json'));
const RARE = JSON.parse(read('game/src/data/vanilla-itemrare.json'));
const EQUIP = JSON.parse(read('game/src/data/vanilla-equip.json'));
const HAIRDYES = JSON.parse(read('game/src/data/vanilla-hairdyes.json'));
const RECIPES = JSON.parse(read('game/src/data/vanilla-recipes.json'));
const VAN = JSON.parse(read('game/public/sprites/vanilla.json'));
const COLL = JSON.parse(read('game/src/data/vanilla-tilecollision.json'));

// ---- ③ material（Recipe.UpdateWhichItemsAreMaterials :15075-15100）----
const material = new Set();
const usedGroups = new Set();
for (const r of RECIPES.recipes) {
  for (const it of r.items ?? []) {
    if (it.id > 0 && it.id < 1000000) material.add(it.id);   // 1000000+ = 组占位（extract-recipes 惯例）
  }
  for (const g of r.groups ?? []) usedGroups.add(g);
}
for (const g of usedGroups) {
  for (const id of RECIPES.groupItems[String(g)] ?? []) material.add(id);
}

// ---- ④ tileFrameImportant（Main.cs 全量）----
const frameImportant = new Set();
for (const m of mainSrc.matchAll(/tileFrameImportant\[(\d+)\] = true;/g)) frameImportant.add(+m[1]);
for (let t = 435; t <= 439; t++) frameImportant.add(t);   // :9895-9897 for 循环（唯一一处）

// ---- 油漆/涂层（GetItemGroup PaintOrCoating = paint>0 || paintCoating>0）----
// paint 物品：1073-1099→1-27 / 1966-1968→28-30（items.ts PAINT_ITEM_TABLE 同源）；
// 涂层：4668 亮漆 / 5344 回收漆（Item.cs paintCoating，涂层系统未建但分组归 Paint）
const PAINT_ITEMS = new Set();
for (let id = 1073; id <= 1099; id++) PAINT_ITEMS.add(id);
PAINT_ITEMS.add(1966); PAINT_ITEMS.add(1967); PAINT_ITEMS.add(1968);
PAINT_ITEMS.add(4668); PAINT_ITEMS.add(5344);

// ---- 合并输出 ----
// dye（item.dye = GameShaders.Armor.GetShaderIdFromItemId，Item.cs:48319）只算
// 盔甲染料注册表——Hair.BindShader 的发染料不计（GetItemGroup :188 dye≠0 在
// hairDye≠-1 之前判，混入会把发染料误归 Dye 组）。
const hairDyeIds = new Set(Object.keys(HAIRDYES.hairDyes ?? {}).map(Number));
const dyeSet = new Set(EQUIP.dye.filter((id) => !hairDyeIds.has(id)));
const petSet = new Set(EQUIP.pet);
const lightSet = new Set(EQUIP.light);
const mountSet = new Set([...EQUIP.mount, ...EQUIP.cart]);
const cartSet = new Set(EQUIP.cart);
const hookSet = new Set(EQUIP.hook);
const hairDyeSet = new Set(Object.keys(HAIRDYES.hairDyes ?? {}).map(Number));

const ITEM_COUNT = 6196;   // ItemID.Count（★BJ183 2026-09-20 随 1457 基准:6146→6196（Terarria1457 ItemID.cs:13938）；旧 1456 档 6146 使 6147-6195 新物品整缺；vanilla-research.json count=6197 含越界哨兵,见 extract-research）
const out = {};
for (let vid = 1; vid < ITEM_COUNT; vid++) {
  const f = FUNC[String(vid)] ?? {};
  const c = COMBAT[String(vid)] ?? {};
  const st = STATS[String(vid)] ?? {};
  const rec = {};
  // damage：本扫(含负) → combat → DefaultToVanitypet 隐式 0（SW-FX53）→ 默认 -1
  //（Item.cs:48609 复位块）
  const dmg = DAMAGE.get(vid) ?? c.damage ?? (PET_PROJ.has(vid) ? 0 : -1);
  if (dmg !== -1) rec.dmg = dmg;
  // createTile：vanilla.json（游戏转储权威）→ DefaultToPlaceableTile → 字面量
  const vanCt = VAN.items[String(vid)]?.createTile;
  const ptArgs = PLACE_TILE_ARGS.get(vid);
  const ct = vanCt != null ? vanCt : ptArgs ? ptArgs[0] : CT_LITERAL.get(vid) ?? -1;
  if (ct >= 0) rec.ct = ct;
  // createWall：DefaultToPlaceableWall → 字面量 → 共享算式(SW-BK1) → itemfunc
  const cw = PLACE_WALL.get(vid) ?? CW_LITERAL.get(vid) ?? CW_EXPR.get(vid) ?? f.createWall ?? -1;
  if (cw >= 0) rec.cw = cw;
  // placeStyle：字面量 → DefaultToPlaceableTile 第二参 → 共享算式(SW-FX53) → itemfunc
  const ps = PS_LITERAL.get(vid) ?? ptArgs?.[1] ?? PS_EXPR.get(vid) ?? f.placeStyle ?? 0;
  if (ps) rec.ps = ps;
  if (TILE_WAND.has(vid)) rec.tw = TILE_WAND.get(vid);
  if (MAKE_NPC.has(vid)) rec.mnpc = MAKE_NPC.get(vid);
  if (VANITY.has(vid)) rec.van = 1;
  const rare = RARE[String(vid)] ?? 0;
  if (rare) rec.r = rare;
  if (st.def) rec.df = st.def;
  if (st.acc !== undefined) rec.acc = st.acc;         // 1=功能配饰 / 0=社交(vanity)
  if (st.s === 'h' || st.hs !== undefined) rec.hs = 1;
  if (st.s === 'b' || st.bs !== undefined) rec.bs = 1;
  if (st.s === 'l' || st.ls !== undefined) rec.ls = 1;
  if (mountSet.has(vid)) { rec.mt = 1; if (cartSet.has(vid)) rec.cart = 1; }
  if (petSet.has(vid)) rec.pet = 1;
  if (lightSet.has(vid)) rec.light = 1;
  if (hookSet.has(vid)) rec.hook = 1;
  if (f.buffType) rec.bt = f.buffType;
  if (BUFF_TIME.has(vid)) rec.bft = BUFF_TIME.get(vid);
  else if (f.buffTime) rec.bft = f.buffTime;
  if (f.healLife) rec.hl = f.healLife;
  if (f.healMana) rec.hm = f.healMana;
  if (f.pick) rec.pick = f.pick;
  if (f.axe) rec.axe = f.axe;
  if (f.hammer) rec.hammer = f.hammer;
  const fp = FISHING.get(vid) ?? f.fishingPole ?? 1;
  if (fp !== 1) rec.fp = fp;                          // 默认 1（Item.cs:104）
  if (f.bait) rec.bait = f.bait;
  if (c.shoot) rec.shoot = c.shoot;
  else if (PET_PROJ.has(vid)) rec.shoot = PET_PROJ.get(vid);
  if (dyeSet.has(vid)) rec.dye = 1;
  if (hairDyeSet.has(vid)) rec.hd = 1;
  if (c.melee) rec.m = 1;
  if (c.ranged) rec.rg = 1;
  if (c.magic) rec.mg = 1;
  if (c.summon) rec.sm = 1;
  if (c.ammo) rec.am = c.ammo;
  if (c.notAmmo || f.notAmmo) rec.nam = 1;
  if (c.consumable || f.consumable) rec.cons = 1;
  if (f.useStyle) rec.us = f.useStyle;
  if (material.has(vid)) rec.mat = 1;
  if (EXPERT.has(vid) || f.expert) rec.exp = 1;
  if (QUEST.has(vid) || f.questItem) rec.qi = 1;
  if (PAINT_ITEMS.has(vid)) rec.pc = 1;
  if (Object.keys(rec).length) out[String(vid)] = rec;
}

// tile 三表（solid/solidTop 按 vanilla-tilecollision.json 的 id 字段索引；
// frameImportant 本提取器扫 Main.cs）
const tileSolid = {};
const tileSolidTop = {};
for (const e of Object.values(COLL.tiles)) {
  if (e.solid) tileSolid[e.id] = 1;
  if (e.solidTop) tileSolidTop[e.id] = 1;
}
const doc = {
  meta: {
    source: 'Terarria1457 Item.cs SetDefaults1-5 + ContentSamples.cs CreativeHelper 字段集',
    itemCount: ITEM_COUNT - 1,
    damageDefault: -1,
    fishingPoleDefault: 1,
    note: '缺省即反编译默认；分组/组内序逻辑在 src/ui/JourneyBrowser.ts（TS 移植）',
  },
  items: out,
  tileSolid, tileSolidTop,
  tileFrameImportant: [...frameImportant].sort((a, b) => a - b),
};
// SW-FX53 2026-09-13: SW_FX53_OUT=<dir> 试产重定向（禁真写纪律,与 equip 提取器同约定）
// ★BJ298 缺省干跑臂：无 env 无旗 = 零写盘,改走文末对拍闸
const JC_LIVE = `${ROOT}/game/src/data/vanilla-journeycat.json`;
const JC_OUT = WRITE_REAL
  ? JC_LIVE
  : (SW_FX53_OUT ? `${SW_FX53_OUT.replace(/\/+$/, '')}/vanilla-journeycat.json` : null);
const freshDoc = JSON.stringify(doc);
if (JC_OUT) {
  if (SW_FX53_OUT) mkdirSync(SW_FX53_OUT, { recursive: true });
  writeFileSync(JC_OUT, freshDoc);
  console.error(`[extract-journey-browser] 已写 ${JC_OUT}（${WRITE_REAL ? '--write-real 真库' : 'SW_FX53_OUT 沙箱'}）`);
}

// ---- 统计出口（提取器健康度目检）----
const stats = { vanity: VANITY.size, tileWand: TILE_WAND.size, makeNPC: MAKE_NPC.size,
  placeTileArgs: PLACE_TILE_ARGS.size, placeWall: PLACE_WALL.size, damageExplicit: DAMAGE.size,
  material: material.size, frameImportant: frameImportant.size,
  entries: Object.keys(out).length };
console.error(JSON.stringify(stats));

// ---- ★BJ298 缺省干跑对拍闸（banners 同构 deepWash;live-only=选报轴）----
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
if (!JC_OUT) {
  let live = null;
  if (existsSync(JC_LIVE)) { try { live = JSON.parse(readFileSync(JC_LIVE, 'utf8')); } catch { /* 坏损:不拦 */ } }
  if (live === null) {
    console.error('[extract-journey-browser] 干跑（零写盘）：现库缺 vanilla-journeycat.json,跳过对拍。写盘须显式 SW_FX53_OUT=<dir> 或 --write-real。');
  } else {
    const wash = deepWash(live, JSON.parse(freshDoc));
    if (wash.freshOnly.length || wash.drift.length) {
      console.error('[extract-journey-browser] 干跑对拍：fresh-only/drift 非空（现库退化缺键型/值漂移）——零写盘,exit 1。');
      if (wash.freshOnly.length) console.error(`  [fresh-only] 重产独有 ${wash.freshOnly.length}: ${wash.freshOnly.slice(0, 6).join(', ')}`);
      if (wash.drift.length) console.error(`  [drift] 值漂移 ${wash.drift.length}: ${wash.drift.slice(0, 6).join(' | ')}`);
      process.exit(1);
    }
    if (wash.liveOnly.length) {
      // live-only=选报轴（现库领先面,人工判别;shops 刻意剥离面同款家族变体）
      console.error(`[extract-journey-browser] 干跑对拍：live-only ${wash.liveOnly.length} 处（现库领先=手补面,选报不拒跑）: ${wash.liveOnly.slice(0, 6).join(', ')}`);
    } else {
      console.error('[extract-journey-browser] 干跑对拍：重产盖住现库（双向零差,零写盘）。写盘须显式 SW_FX53_OUT=<dir> 或 --write-real。');
    }
  }
}
