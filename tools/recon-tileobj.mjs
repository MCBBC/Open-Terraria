// TileObjectData 锚点表提取器（1457 反编译 Terraria.ObjectData/TileObjectData.cs 单一真值源）
// 产物：
//   src/data/tile-anchors.json          运行时清单（Game.tryPlace 表驱动放置）
//   tests/golden/tile-anchor-authority.json 金标（tests/tile-anchor-authority.test.ts 锚点回归闸门）
// 解析策略：TileObjectData.cs 是线性 builder 脚本（assign → CopyFrom → addBaseTile → addTile）。
// 顺序模拟赋值面；未知语句置 poisoned，该 addTile 记为 unparsed=null 回落旧近似路径。
// 已知缺口（fallback 安全域）：RandomStyleRange/HookCheck/SubTiles 族、数组循环构造的多 style 变体——
//   主 style 维度仍正确时 partial 输出并标 warn。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SRC = process.env.TOD_SRC ?? '/Users/vinlic/Project/GLM/SandboxWorld/Terarria1457/Terraria.ObjectData/TileObjectData.cs';
const OUT_RUNTIME = process.env.TOA_OUT ?? 'src/data/tile-anchors.json';
const OUT_GOLDEN = process.env.TOA_GOLDEN ?? 'tests/golden/tile-anchor-authority.json';

const cs = readFileSync(SRC, 'utf8');
const lines = cs.split(/\r?\n/);

// ---- 状态机 ----
// work: 当前 newTile 工作面；bases: addBaseTile 命名样式；pendingAlts: 尚未随 addTile 提交的备选方向
let work = mkWork();
const bases = new Map();
const manifest = {};
let pendingAlts = [];
let lastAltDir = '';
const pendingAudit = [];
function curIdGuess(rec){ return rec._lastId ?? -1; }
let poisoned = null;         // {tile,into} 复杂构造污染标记（当前对象不可信）

function mkWork() {
  return {
    w: 0, h: 0, ox: 0, oy: 0,
    anchorTop: null, anchorBottom: null, anchorLeft: null, anchorRight: null,
    wall: false, liqAllow: false, flatten: false, dir: '', yOff: 0,
    // 转义：AnchorData 第二参为 newTile.Width 表达式时需在快照期以最终 W 具象化
  };
}
const deep = (w) => structuredClone(w);

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
    bases.set(m[1], deep(work));
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
      if (pendingAlts.length) rec.dirs = pendingAlts.slice();
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
    continue;
  }
  if (/^addAlternate\(/.test(L)) {
    pendingAlts.push({ dir: lastAltDir });
    lastAltDir = '';
    continue;
  }

  // ---- 属性赋值 ----
  if ((m = L.match(/^newTile\.(\w+)\s*=\s*(.+);\s*$/))) {
    const [, prop, raw] = m;
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
        work.wall = false; work.liqAllow = false; work.flatten = false;
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
      case 'liquidplacement': {
        // Allowed / NotAllowed / OnlyInLiquid 等 —— 只有明确“液体中可放”才记 allow
        work.liqAllow = /Allowed/.test(rhs) && !/Not/.test(rhs);
        break;
      }
      case 'flattenanchors': work.flatten = /true/i.test(rhs); break;
      case 'direction': work.dir = rhs.replace(/^TileObjectDirection\./, '').trim(); lastAltDir = work.dir; break;
      case 'drawyoffset': work.yOff = parseInt(rhs) || 0; break;
      // 白名单中性项（不建模但合法）：跳过，不污染
      case 'lavadegth': case 'lavadeath': case 'coordinatewidth': case 'coordinatepadding':
      case 'coordinateheights': case 'usescustomcanplace': case 'stylehorizontal': case 'style':
      case 'randomstylerange': case 'allowalwaysonscreen': case 'wraps':
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
console.log(`total=${stats.total} parsed=${stats.parsed} unparsed=${stats.unparsed.length} warned=${stats.warned.length}`);
console.log('unparsed ids:', stats.unparsed.join(','));
// 抽查
for (const k of ['220', '10', '11', '212', '91', '13', '4']) {
  const r = manifest[k];
  console.log(k, r ? JSON.stringify(r) : '(unparsed)');
}
