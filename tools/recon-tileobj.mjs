// TileObjectData 锚点表提取器（1457 反编译 Terraria.ObjectData/TileObjectData.cs 单一真值源）
// 产物：
//   src/data/tile-anchors.json          运行时清单（Game.tryPlace 表驱动放置）
//   tests/golden/tile-anchor-authority.json 金标（tests/tile-anchor-authority.test.ts 锚点回归闸门）
// 解析策略：TileObjectData.cs 是线性 builder 脚本（assign → CopyFrom → addBaseTile → addTile）。
// 顺序模拟赋值面；未知语句置 poisoned，该 addTile 记为 unparsed=null 回落旧近似路径。
// 已知缺口（fallback 安全域）：RandomStyleRange/HookCheck/SubTiles 族、数组循环构造的多 style 变体——
//   主 style 维度仍正确时 partial 输出并标 warn。
// ★M-3b（2026-09-02 子样式级液体例外建模）：newSubTile.* 液体写入解析成 per-style 记录
//   `liqStyles: { [style]: {water,lava} }`【只存与基记录发散的样式】——GetTileData
//   （TileObjectData.cs:5127-5162）对 SubTiles[style]==null/越界回落基记录,发散过滤
//   恰好等价;addSubTile/addSubTileRange（:2016-2096）的 style 序号=SubTiles 列表下标
//   （params 展开逐个提交,addSubTileRange 按 startStyle+i 递增）;newSubTile.CopyFrom
//   (newTile/StyleX/自身) 继承源液体态,覆写经 setter COW 只落子样式模块（:1698-1715
//   CopyFrom 不拷 _hasOwn* 旗,首写必 COW）。alternate 维不建模：CanPlace（TileObject.cs
//   :205-208）结构上逐 alternate 取 GetTileData(type,style,num7) 做 LiquidPlace（:342）,
//   但 1457 全表 newAlternate.* 液体赋值 0 行（382 行 newAlternate 零命中）,addAlternate/
//   内联 Alternates.Add 的 alternate 液体与所属记录恒等（tools/_tod-substyle-audit.mjs
//   双向发散计数=0）→ 无 alternate 记录可建。LiquidDeath 的 Calculate() 耦合
//   （:1821-1831）在 addSubTile 提交前对子样式同样适用。
// ★M-3（2026-09-02 液体放置面两维建模）：liqAllow 单维布尔（缺省 false=液体中全拒，
//   与原版 382/382 反向）升级为 `liq: { water, lava }` 两维、值 ∈ 'allowed'|'notAllowed'|
//   'onlyInFull'。真值结构（TileObjectData.cs）：SetupBaseObject 缺省 water=Allowed/
//   lava=NotAllowed（:1767-1768）；newTile 级显式赋值 25 行（WaterPlacement 16 全
//   NotAllowed / LavaPlacement 9 含 3 条 Allowed）；newSubTile 级液体赋值 86 行
//   （WaterPlacement 18 / LavaPlacement 27 / Death 41）为子样式覆写【不进入基记录】
//   ——消费端单记录模型=基样式语义，子样式例外台账见批次报告；LiquidDeath 经
//   Calculate()（:1820-1833）提交耦合强制 NotAllowed。消费端 TileAnchorValidator 按
//   liquidType 分流（water 维=WATER/HONEY/SHIMMER，lava 维=LAVA；LIQUID_TYPE 枚举换算，
//   原版 liquidType 0/2/3↔水维、1↔岩浆维）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SRC = process.env.TOD_SRC ?? '/Users/vinlic/Project/GLM/SandboxWorld/Terarria1457/Terraria.ObjectData/TileObjectData.cs';
const OUT_RUNTIME = process.env.TOA_OUT ?? 'src/data/tile-anchors.json';
const OUT_GOLDEN = process.env.TOA_GOLDEN ?? 'tests/golden/tile-anchor-authority.json';

const cs = readFileSync(SRC, 'utf8');
const lines = cs.split(/\r?\n/);

// ---- 状态机 ----
// work: 当前 newTile 工作面；bases: addBaseTile 命名样式；pendingAlts: 尚未随 addTile 提交的备选方向
// ---- M-3 液体放置两维建模（vanilla Terraria.Enums/LiquidPlacement.cs 四值枚举）----
//  值域（基样式级实际出现前三者；OnlyInLiquid 为原版枚举值但 1457 全表基样式零出现，
//  入库值域按任务规格收窄为三值——子样式级 OnlyInFullLiquid 仅 227 style5 一例，不入基记录）：
//    allowed / notAllowed / onlyInFull
//  维度 = LiquidPlacementModule.water/.lava（Terraria.Modules/LiquidPlacementModule.cs:5-8）：
//    water 维管原版 liquidType 0/2/3（水/蜜/微光），lava 维管 1（TileObjectData.LiquidPlace
//    :1853-1907 switch 分支）。本仓 TileStore.LIQUID_TYPE 是原版 +1 编码，消费端换算。
//  缺省 = SetupBaseObject（TileObjectData.cs:1767-1768）：WaterPlacement=Allowed /
//    LavaPlacement=NotAllowed。⚠️ LiquidPlacementModule 自身 ctor 缺省是两维全 Allowed
//    （Module cs:11-14），但 _baseObject 构造后立即被 SetupBaseObject 覆盖为岩浆禁。
const LIQ_DEFAULTS = Object.freeze({ water: 'allowed', lava: 'notAllowed' });
const LIQ_VAL_MAP = { Allowed: 'allowed', NotAllowed: 'notAllowed', OnlyInFullLiquid: 'onlyInFull', OnlyInLiquid: 'onlyInLiquid' };
function parseLiqVal(rhs) {
  const m = rhs.match(/LiquidPlacement\.(\w+)/);
  return m ? (LIQ_VAL_MAP[m[1]] ?? null) : null;
}
/** Calculate() 提交耦合（TileObjectData.cs:1820-1833）：WaterDeath/LavaDeath=true ⇒
 *  对应维 placement 强制 NotAllowed（setter 走 COW，只影响提交对象）。 */
function applyLiquidDeathCoupling(rec) {
  if (rec.waterDeath) rec.liq.water = 'notAllowed';
  if (rec.lavaDeath) rec.liq.lava = 'notAllowed';
}

function mkWork() {
  return {
    w: 0, h: 0, ox: 0, oy: 0,
    anchorTop: null, anchorBottom: null, anchorLeft: null, anchorRight: null,
    wall: false, liq: { ...LIQ_DEFAULTS }, waterDeath: false, lavaDeath: false,
    flatten: false, dir: '', yOff: 0,
    // 转义：AnchorData 第二参为 newTile.Width 表达式时需在快照期以最终 W 具象化
  };
}
/** addTile/addBaseTile 提交后的 newTile 复位（TileObjectData.cs:2005/:2013
 *  `newTile = new TileObjectData(_baseObject)`）——几何字段沿用本提取器"家族头净化"
 *  约定不在此复位（靠 CopyFrom(Style*)/Width 头重建），液体两维按原版语义复位。 */
function resetLiquid(w) {
  w.liq = { ...LIQ_DEFAULTS };
  w.waterDeath = false; w.lavaDeath = false;
}
let work = mkWork();
// ---- M-3b 子样式工作面：newSubTile 液体态（缺省 = new TileObjectData(_baseObject)
//      继承 SetupBaseObject :1767-1768 两维缺省）+ 已提交 per-style 记录 + int 局部变量
//      （addSubTileRange(num,num) / addSubTile(1+newTile.StyleWrapLimit) 求值所需）。 ----
let subWork = { liq: { ...LIQ_DEFAULTS }, waterDeath: false, lavaDeath: false };
let pendingSubLiq = new Map();      // style → liq（addSubTile 提交,death 耦合已应用）
const intLocals = new Map();        // `int num = 39;` 局部变量（:4230/:4417）
let styleWrapLimit = 0;             // newTile.StyleWrapLimit（addSubTile 表达式求值所需,不入库）
const bases = new Map();
const manifest = {};
let pendingAlts = [];
let lastAltDir = '';
const pendingAudit = [];
function curIdGuess(rec){ return rec._lastId ?? -1; }
let poisoned = null;         // {tile,into} 复杂构造污染标记（当前对象不可信）

const deep = (w) => structuredClone(w);

// ---- M-3b 子样式液体辅助 ----
/** addSubTile 提交耦合（newSubTile.Calculate() :2018/:2046/:2075 → :1821-1831）：
 *  子样式 WaterDeath/LavaDeath=true ⇒ 对应维 placement 强制 NotAllowed。 */
function subCoupled() {
  const out = { ...subWork.liq };
  if (subWork.waterDeath) out.water = 'notAllowed';
  if (subWork.lavaDeath) out.lava = 'notAllowed';
  return out;
}
/** addSubTile 样式表达式求值：整数字面 / `int num` 局部变量 / newTile.StyleWrapLimit
 *  （:3344 `1 + newTile.StyleWrapLimit`、:4239 `addSubTileRange(num, num)`）。
 *  styleWrapLimit 用独立变量（不入 work/记录；:3323 同块先赋值后用,无 CopyFrom 传递需求）。 */
function evalTodExpr(raw) {
  let s = raw.trim().replace(/newTile\.StyleWrapLimit/g, `(${styleWrapLimit})`);
  // ★整词替换（num2 含 num 前缀,裸 split/join 会把 num2 吃成 (39)2 → 求值 NaN）
  for (const [k, v] of [...intLocals].sort((a, b) => b[0].length - a[0].length)) {
    s = s.replace(new RegExp(`\\b${k}\\b`, 'g'), `(${v})`);
  }
  if (!/^[\d\s()+\-*/]+$/.test(s)) return NaN;
  try { return Function(`"use strict";return (${s})`)(); } catch { return NaN; }
}
function resetSubWork() {
  // addSubTile/addSubTileRange 尾 `newSubTile = new TileObjectData(_baseObject)`（:2041/:2070/:2095）
  subWork = { liq: { ...LIQ_DEFAULTS }, waterDeath: false, lavaDeath: false };
}

function parseAnchor(rhs) {
  // new AnchorData(AnchorType.A | AnchorType.B, <expr>, <expr>)
  // 注意：rhs 由属性分支切出时【不含】结尾分号
  const m = rhs.match(/new\s+AnchorData\s*\(([^]*?)\)\s*;?\s*$/);
  if (!m) return null;
  const parts = m[1].split(',');
  if (parts.length < 1) return null;
  const types = parts[0].split('|').map((s) => s.trim().replace(/^AnchorType\./, '')).filter(Boolean);
  const cntRaw = (parts[1] ?? '').trim();
  const startRaw = (parts[2] ?? '').trim();
  const cnt = /^\d+$/.test(cntRaw) ? parseInt(cntRaw)
    : /^newTile\.Width$/i.test(cntRaw) ? 'W'
    : /^newTile\.Height$/i.test(cntRaw) ? 'H' : NaN;
  const start = /^\d+$/.test(startRaw) ? parseInt(startRaw)
    : /^newTile\.Height/i.test(startRaw) ? 'Hminus1' : 0;   // 第三参字面即 checkStart;Height 表达式少见按0处理,poison标记交上层
  if (Number.isNaN(cnt)) return null;
  return { t: types.filter((s) => s !== 'None'), cnt, start };
}

let stats = { total: 0, parsed: 0, unparsed: [], warned: [] };

for (let ln = 0; ln < lines.length; ln++) {
  let L = lines[ln].trim();
  if (!L || L.startsWith('//')) continue;

  // ---- 控制动词 ----
  let m;
  if ((m = L.match(/^newTile\.CopyFrom\((\w+)\)\s*;/))) {
    const nm = m[1];
    if (!bases.has(nm)) { console.error(`[warn] CopyFrom 未知名 ${nm} @${ln + 1}`); }
    work = deep(bases.has(nm) ? bases.get(nm) : mkWork());
    continue;
  }
  if ((m = L.match(/^addBaseTile\(out (\w+)\)\s*;/))) {
    // addBaseTile（TileObjectData.cs:2001-2008）：newTile.Calculate() 先跑（death 耦合
    //   落进快照，StyleAlch 等 LavaDeath=true 的基样式快照 lava=notAllowed），再存快照、
    //   newTile 复位缺省。Style* 快照含 liq/death，后续 CopyFrom(Style*) 继承。
    const snap = deep(work);
    applyLiquidDeathCoupling(snap);
    delete snap.waterDeath; delete snap.lavaDeath;
    bases.set(m[1], snap);
    resetLiquid(work);
    continue;
  }
  if ((m = L.match(/^(?:newTile|Style\w+)\.(?:CopyFrom\(.*?\)|ResetToTile\(\))\s*;/)) && !/^newTile\.CopyFrom/.test(L)) {
    // 非标准 CopyFrom 变体：污染处理同未知
  }
  if ((m = L.match(/^addTile\((-?\d+)\)\s*;/))) {
    const id = parseInt(m[1]);
    stats.total++;
    if (id <= 0) { continue; }           // addTile(-1) 清工作面语义等价 newTile 复位
    if (work.w > 0 && work.h > 0) {
      const rec = deep(work);
      resolveExprs(rec);
      applyLiquidDeathCoupling(rec);     // Calculate() :1820-1833 提交耦合
      delete rec.waterDeath; delete rec.lavaDeath;   // death 旗不入库（瞬时量）
      if (pendingAlts.length) rec.dirs = pendingAlts.slice();
      // M-3b：per-style 液体记录——只存与基记录【发散】的样式（GetTileData :5142-5150
      // 对 SubTiles[style]==null/越界回落基记录,发散过滤恰好等价;同值条目省略）
      const liqStyles = {};
      for (const [st, lq] of pendingSubLiq) {
        if (lq.water !== rec.liq.water || lq.lava !== rec.liq.lava) liqStyles[String(st)] = lq;
      }
      if (Object.keys(liqStyles).length) rec.liqStyles = liqStyles;
      manifest[id] = rec;
      stats.parsed++;
      if (poisoned) { stats.warned.push(id); }
    } else {
      // 缺维度声明 = 无法表驱动 → 显式回落
      manifest[id] = null;
      stats.unparsed.push(id);
    }
    pendingAlts = [];
    poisoned = null;
    pendingSubLiq = new Map();           // 子样式归属 newTile,addTile 一并复位
    resetSubWork();
    styleWrapLimit = 0;                  // 原版 newTile=new(_baseObject) 复位 StyleWrapLimit
    resetLiquid(work);                   // 原版 addTile 尾 newTile = new(_baseObject)（:2013）
    continue;
  }
  if (/^addAlternate\(/.test(L)) {
    pendingAlts.push({ dir: lastAltDir });
    lastAltDir = '';
    continue;
  }

  // ---- FullCopyFrom（TileObjectData.cs:1717-1741）：整表拷贝已提交 tile（模块引用共享）。
  //      1457 三处调用：388→389（门右开）、82→83→84（药草）。液体两维 + per-style 液体
  //      记录（:1738 `_subTiles = new TileObjectSubTilesModule(copy._subTiles)` 整表拷贝）
  //      需要显式搬运（几何字段本就沿 work 继承等价）。 ----
  if ((m = L.match(/^newTile\.FullCopyFrom\((\d+)\)\s*;/))) {
    const srcRec = manifest[m[1]];
    if (srcRec?.liq) {
      work.liq = structuredClone(srcRec.liq);
      pendingSubLiq = new Map();
      for (const [st, lq] of Object.entries(srcRec.liqStyles ?? {})) pendingSubLiq.set(Number(st), structuredClone(lq));
    } else { poisoned = true; }
    continue;
  }
  // ---- 子样式区：newSubTile.CopyFrom(newTile/newSubTile/StyleX) —— 子样式经模块引用
  //      共享继承源液体态（TileObjectData.cs:1698-1715 CopyFrom 语义；_hasOwn* 旗不随
  //      CopyFrom 拷贝,后续覆写必 COW 只落子样式模块）；基样式记录不受子样式覆写影响
  //      → 基样式值仍按 newTile 自身赋值面提取。 ----
  if ((m = L.match(/^newSubTile\.CopyFrom\((newTile|newSubTile|newAlternate|Style\w+)\)\s*;/))) {
    stats.subCopyFrom = (stats.subCopyFrom ?? 0) + 1;
    const src = m[1] === 'newTile' ? work
      : m[1] === 'newSubTile' ? subWork
      : m[1] === 'newAlternate' ? null      // newAlternate 从未持有液体覆写（M-3b 定谳）
      : bases.get(m[1]);
    if (src) subWork = { liq: { ...src.liq }, waterDeath: !!src.waterDeath, lavaDeath: !!src.lavaDeath };
    continue;
  }
  // ---- M-3b：addSubTile/addSubTileRange（TileObjectData.cs:2016-2096）——当前 newSubTile
  //      经 Calculate()（death 耦合）提交到指定 style 槽（=SubTiles 列表下标）后复位。
  //      params 展开逐 style 提交同一快照;addSubTileRange 按 startStyle+i 递增。 ----
  if ((m = L.match(/^addSubTileRange\(([^,]+),\s*([^)]+)\)\s*;/))) {
    const start = evalTodExpr(m[1]), cnt = evalTodExpr(m[2]);
    if (Number.isFinite(start) && Number.isFinite(cnt)) {
      const snap = subCoupled();
      for (let i = 0; i < cnt; i++) pendingSubLiq.set(start + i, { ...snap });
    } else { console.error(`[warn] addSubTileRange 样式表达式不可求值 @${ln + 1}`); }
    resetSubWork();
    continue;
  }
  if ((m = L.match(/^addSubTile\(([^)]*)\)\s*;/))) {
    const snap = subCoupled();
    for (const rawSt of m[1].split(',')) {
      const st = evalTodExpr(rawSt);
      if (!Number.isFinite(st)) { console.error(`[warn] addSubTile 样式表达式不可求值 @${ln + 1}: ${m[1]}`); continue; }
      pendingSubLiq.set(st, { ...snap });
    }
    resetSubWork();
    continue;
  }
  // ---- M-3b：`int num = 39;` 局部变量（:4230/:4417，addSubTileRange 参数求值所需）----
  if ((m = L.match(/^int (\w+) = (.+?);\s*$/))) { intLocals.set(m[1], evalTodExpr(m[2])); continue; }

  // ---- 属性赋值（newTile. / newSubTile. 双前缀；newAlternate.* 无液体赋值（grep 全文件
  //      证实），仍走后置毒分支）----
  if ((m = L.match(/^(newTile|newSubTile)\.(\w+)\s*=\s*(.+);\s*$/))) {
    const [, prefix, prop, raw] = m;
    if (prefix === 'newSubTile') {
      // 子样式写入永不落基样式记录（原版子样式对象独立于 newTile；CopyFrom 共享引用
      // 后的覆写经 setter COW 只落在子样式模块上——见 TileObjectData.cs:574-640 setter）。
      // 液体四属性 = M-3b 解析目标：写入 subWork 工作面（addSubTile 提交时成 per-style
      // 记录）；其余属性维持旧行为置毒（审计信号：该族含未建模子样式几何，
      // AnchorValidWalls/Height 等只在子样式生效）。
      const lp = prop.toLowerCase();
      if (lp === 'waterplacement' || lp === 'lavaplacement') {
        stats.subLiqWrites = (stats.subLiqWrites ?? 0) + 1;
        const v = parseLiqVal(raw.trim());
        if (!v) { poisoned = true; break; }
        if (lp === 'waterplacement') subWork.liq.water = v;
        else subWork.liq.lava = v;
      } else if (lp === 'waterdeath' || lp === 'lavadeath') {
        stats.subLiqWrites = (stats.subLiqWrites ?? 0) + 1;
        if (lp === 'waterdeath') subWork.waterDeath = /true/i.test(raw);
        else subWork.lavaDeath = /true/i.test(raw);
      } else {
        poisoned = poisoned ?? true;
      }
      continue;
    }
    const rhs = raw.trim();
    switch (prop.toLowerCase()) {
      case 'width': {
        // ★家族头净化：C# 共享静态工作面存在跨定义泄漏（AnchorTop 等未被后族
        //   重声明即沿用），顺序模拟无法可靠复现其原始初始化序——对【锚点语义】
        //   取保守零值起点，靠各家族自身的显式赋值重建。几何/绘制字段保持继承
        //   （CoordinateWidth/padding/YOffset 延用安全）。prevHadAnchors 未被本头
        //   后续显式补写的对象记入审计表人工核对。
        const prev = deep(work);
        const hadAnchors = !!(prev.anchorTop ?? prev.anchorBottom ?? prev.anchorLeft ?? prev.anchorRight) || prev.wall;
        work.anchorTop = null; work.anchorBottom = null;
        work.anchorLeft = null; work.anchorRight = null;
        work.wall = false; work.flatten = false;
        work.dir = ''; lastAltDir = ''; pendingAlts = [];
        work.w = parseInt(rhs) || 0;
        if (hadAnchors && !Object.isFrozen(prev)) {
          // 记录待审计：后续若至下一 addTile 无任何 anchor 写回则可能继承语义丢失
          pendingAudit.push({ idHint: +curIdGuess(prev), types: 'head-reset', kept: false });
        }
        break;
      }
      case 'height': work.h = parseInt(rhs) || 0; break;
      case 'origin': {
        const p = rhs.match(/new\s+Point16\((-?\w+),\s*(-?\w+)\)/);
        if (p) { work.ox = valOrExpr(p[1]); work.oy = valOrExpr(p[2]); }
        else { poisoned = true; }
        break;
      }
      case 'anchorbottom':
      case 'anchortop':
      case 'anchorleft':
      case 'anchorright': {
        const key = { anchorbottom: 'anchorBottom', anchortop: 'anchorTop', anchorleft: 'anchorLeft', anchorright: 'anchorRight' }[prop.toLowerCase()];
        if (/^null/.test(rhs)) { work[key] = null; break; }
        // ★修复（2026-09-02 七件 decor 放置审计）：AnchorData 是 struct
        //   （Terraria.DataStructures/AnchorData.cs:4 `public struct AnchorData`），
        //   `AnchorData.Empty`（AnchorData.cs:9）与 `default(AnchorData)` 均 =
        //   tileCount=0 =「该侧无锚」——CanPlace 对每侧 `if (tileCount != 0)`
        //   整侧跳过（TileObject.cs:377/:445/:550/:636）。此前未识别 → parseAnchor
        //   失败置 poisoned 但 work[key] 保留模板/前值 → 34/95/126/386/531/31/165/
        //   696 等「显式清空底锚的吊挂件」被多加一条底行锚（原版偏差：吊灯/灯笼/
        //   迪斯科球/巨石像在仅有天花板时被本仓拒放）。
        if (/^AnchorData\.Empty\s*$/.test(rhs) || /^default\s*\(\s*AnchorData\s*\)\s*$/.test(rhs)) { work[key] = null; break; }
        const a = parseAnchor(rhs);
        if (!a) poisoned = true; else work[key] = a;
        break;
      }
      case 'anchorwall': work.wall = /true/i.test(rhs); break;
      case 'waterplacement':
      case 'lavaplacement': {
        // ★M-3：newTile.WaterPlacement/LavaPlacement 显式赋值（TileObjectData.cs:574-640
        //   属性 setter，COW 写入 _liquidPlacement.water/.lava）。值 = LiquidPlacement
        //   四值枚举（本表仅出现 Allowed/NotAllowed；子样式级 OnlyInFullLiquid 仅 227
        //   style5 一例，newSubTile 前缀已在上方短路为审计计数、不入基记录）。
        const v = parseLiqVal(rhs);
        if (!v) { poisoned = true; break; }
        if (prop.toLowerCase() === 'waterplacement') work.liq.water = v;
        else work.liq.lava = v;
        break;
      }
      case 'waterdeath':
      case 'lavadeath': {
        // LiquidDeathModule.water/lava（TileObjectData.cs:508-547 属性）——提交时经
        // Calculate() 耦合强制对应维 NotAllowed（applyLiquidDeathCoupling）。
        const dv = /true/i.test(rhs);
        if (prop.toLowerCase() === 'waterdeath') work.waterDeath = dv;
        else work.lavaDeath = dv;
        break;
      }
      case 'flattenanchors': work.flatten = /true/i.test(rhs); break;
      case 'direction': work.dir = rhs.replace(/^TileObjectDirection\./, '').trim(); lastAltDir = work.dir; break;
      case 'drawyoffset': work.yOff = parseInt(rhs) || 0; break;
      // 白名单中性项（不建模但合法）：跳过，不污染（waterdeath/lavadeath 已升级为实义解析）
      case 'coordinatewidth': case 'coordinatepadding':
      case 'coordinateheights': case 'usescustomcanplace': case 'stylehorizontal': case 'style':
      case 'randomstylerange': case 'allowalwaysonscreen': case 'wraps':
        break;
      case 'stylewraplimit':
        // M-3b：样式表达式求值所需（:3344 `1 + newTile.StyleWrapLimit` 等）。
        // 中性样式字段不入库；仅记入独立变量,addTile 尾复位（原版 newTile=new(_baseObject)）。
        styleWrapLimit = parseInt(rhs) || 0;
        break;
      default:
        // HookCheckIfCanPlace / Options / 新 API 全部视为复杂构造 → 该对象回落
        poisoned = true;
        break;
    }
    continue;
  }
  // ---- 备选描述区：newAlternate.CopyFrom(newTile) ----
  if (/^newAlternate\.CopyFrom\(newTile\)/.test(L)) { continue; }
  // 其它 newAlternate.* 属性写入（罕见）→ 污染
  if (/^newAlternate\./.test(L) && !/CopyFrom/.test(L)) { poisoned = true; continue; }
  // 其它明显复杂构造：方法调用/条件结构行不匹配以上任何 → 仅在涉及 newTile/newSubTile 时置毒
  if (/^newSubTile\.|^for \([^)]*\)$|^switch|^if\s*\(/.test(L)) { poisoned = poisoned ?? true; continue; }
}

function valOrExpr(t) {
  t = t.trim();
  return /^[+-]?\d+$/.test(t) ? parseInt(t) : t;   // 'W','H','Hminus1' 或变量名,快照期解析
}
function resolveExprs(rec) {
  const refs = [rec.anchorTop, rec.anchorBottom, rec.anchorLeft, rec.anchorRight].filter(Boolean);
  for (const a of refs) {
    if (a.cnt === 'W') a.cnt = rec.w;
    else if (a.cnt === 'H') a.cnt = rec.h;
    if (a.start === 'Hminus1') a.start = Math.max(0, rec.h - 1);
  }
}
// Origin 可能引用宽度表达式（罕见）：保守数字化失败则 poison 对应 obj 在此处二次清洗
for (const [id, r] of Object.entries(manifest)) {
  if (!r) continue;
  if (!Number.isInteger(r.ox)) { r.ox = Math.floor(r.w / 2); stats.warned.push(+id); }
  if (!Number.isInteger(r.oy)) { r.oy = r.h - 1; }
}

mkdirSync('src/data', { recursive: true });
mkdirSync('tests/golden', { recursive: true });
writeFileSync(OUT_RUNTIME, JSON.stringify({ v: '1457', tiles: manifest }, null, 1));
writeFileSync(OUT_GOLDEN, JSON.stringify({ v: '1457', tiles: manifest }, null, 1));
console.log(`total=${stats.total} parsed=${stats.parsed} unparsed=${stats.unparsed.length} warned=${stats.warned.length} subCopyFrom=${stats.subCopyFrom ?? 0} subLiqWrites=${stats.subLiqWrites ?? 0}`);
console.log('unparsed ids:', stats.unparsed.join(','));
// 液体两维分布抽查（M-3）
{
  const waterNA = [], lavaAllow = [], onlyInFull = [];
  for (const [id, r] of Object.entries(manifest)) {
    if (!r) continue;
    if (r.liq.water === 'notAllowed') waterNA.push(id);
    else if (r.liq.water === 'onlyInFull') onlyInFull.push(id);
    if (r.liq.lava === 'allowed') lavaAllow.push(id);
  }
  console.log(`liq: water=notAllowed(${waterNA.length}): ${waterNA.join(',')} | lava=allowed: ${lavaAllow.join(',')} | water=onlyInFull: ${onlyInFull.join(',') || '无'}`);
}
// 子样式液体记录分布（M-3b）：per-style 发散条目数与逐 tile 清单
{
  const tiles = [], total = { styles: 0, entries: 0 };
  for (const [id, r] of Object.entries(manifest)) {
    if (!r?.liqStyles) continue;
    const n = Object.keys(r.liqStyles).length;
    total.styles++; total.entries += n;
    tiles.push(`${id}(${Object.entries(r.liqStyles).map(([st, lq]) => `${st}:${lq.water[0]}${lq.lava[0] === 'a' ? 'L' : ''}`).join('/')})`);
  }
  console.log(`liqStyles: tiles=${total.styles} entries=${total.entries} | ${tiles.join(' ')}`);
}
// 抽查
for (const k of ['220', '10', '11', '212', '91', '13', '4']) {
  const r = manifest[k];
  console.log(k, r ? JSON.stringify(r) : '(unparsed)');
}
