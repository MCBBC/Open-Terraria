// 从 Terarria1457 Terraria.Map/MapHelper.cs Initialize() 提取【原版地图色全表】
// → src/data/vanilla-mapcolors.json。
// 覆盖：array[tileId][option]（13 变体/格）、array4[wallId][option]（2 变体/墙）、
//       array3[4] 液体色、天空渐变端点。
// ★关键：`color` 等命名局部在 Initialize 内被【反复重赋值】（`color = new Color(...)`）——
//  必须按源码【顺序扫描】当前值，两遍快照式会把全部别名解析成首个值（曾全表泥土色）。
//  array→array 前向引用单独收集，末尾多轮解析（实测 2 轮收敛）。
// R4-43：1457 三种此前漏配的赋值形态——①`MultiplyMapColor(array[X][Y], 字面量|变量)`
//（tile 749/750/753 + wall 351-366,变量乘数 `float multiplier = 0.5f`）;②`= Color.命名常量`
//（tile 740=LightGray / 751·752=Gray）;③`array[X][Y] * 变量`（1456 旧形态,保留）。
//  MultiplyMapColor=保 alpha 逐通道乘（MapHelper.cs:1792-1798）——当前全表源色 A=255,
//  RGB-only 提取等价（备案：未来 A<255 源色须补 alpha 通道）。
//
// ★BJ284 2026-09-22 era guard 落闸（四要素习语 docs/era-guard-family.md）：
//   ① SW_ITEM_VER 缺省 1457（白名单 {1457,1458}——BJ284 定谳 1458 交叉重放 fresh 与现库
//     逐字节零差；1456 显式拒+指引）;② 输出通道三分离：缺省=干跑对拍零写盘（双向路径级
//     diff,live-only=洗库预警/fresh-only=现库退化缺键型,任一非空 exit 1+物证）/ SW_OUT=沙箱 /
//     --write-real=逃生门（diff 非纯增量拒,强推双旗 --force-full --overwrite-append-era）；
//     双旗互斥+非 1457 禁写+探测注入面 SW_MAPCOLORS_JSON 与 --write-real 混用拒（g1）;
//   ③ 锚 fail-loud：Initialize 签名（原 methodBody 静默返空体反模式已修）+基数护栏
//     （tiles 748/walls 356）;④ 判别力自证：tests/extract-tables-era-guard.test.ts。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)
const VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1457', '1458']);
if (!VER_ALLOWED.has(VER) || !existsSync(`${ROOT}/Terarria${VER}/Terraria.Map/MapHelper.cs`)) {
  console.error(`[extract-mapcolors] 拒绝运行：SW_ITEM_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1456') console.error('  1456 锚集已退役（1457 基准 BJ284 落闸）；1456 对拍读时代快照。');
  process.exit(1);
}
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-mapcolors] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  process.exit(1);
}
if (WRITE_REAL && VER !== '1457') {
  console.error(`[extract-mapcolors] 拒绝写真库：SW_ITEM_VER=${VER}≠1457（旧基线重放禁写 vanilla-mapcolors.json）。`);
  process.exit(1);
}
if (WRITE_REAL && process.env.SW_MAPCOLORS_JSON !== undefined) {
  console.error('[extract-mapcolors] 拒绝运行：探测注入面（SW_MAPCOLORS_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  process.exit(1);
}
// ★M1 变异锚:干跑臂 null（守卫测试把 null 换成假现库路径,证明缺省零写盘是唯一拦截面）
const LIVE_JSON = process.env.SW_MAPCOLORS_JSON ?? `${ROOT}/game/src/data/vanilla-mapcolors.json`;
const OUT_JSON = WRITE_REAL ? LIVE_JSON : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-mapcolors.json` : null);

const src = readFileSync(`${ROOT}/Terarria${VER}/Terraria.Map/MapHelper.cs`, 'utf8');
// ★显式签名锚（fail-loud）：methodBody 对未命中签名会滑到「首个 { 起的全文体」而非空体
//   （静默返空体反模式的真实形态=静默全文体,BJ284 实测）——必须在切片前硬校验签名。
const INIT_SIG = 'public static void Initialize()';
if (!src.includes(INIT_SIG)) {
  throw new Error(`[extract-mapcolors] 锚点失配: MapHelper.cs ${INIT_SIG} 签名未找到（源码漂移,禁止静默空扫）`);
}

function methodBody(name) {
  const idx = src.indexOf(name);
  const start = src.indexOf('{', idx);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start + 1, i); }
  }
  return '';
}
const body = methodBody('public static void Initialize()');
if (!body.trim()) throw new Error('[extract-mapcolors] 锚点失配: MapHelper.cs Initialize() 方法体为空/签名未找到（源码漂移,禁止静默空扫）');

// XNA Color * float：(int)(ch*f) 经 Color(int...) 构造钳 0-255（取整=截断）
const mulColor = (c, f) => [Math.min(255, Math.trunc(c[0] * f)), Math.min(255, Math.trunc(c[1] * f)), Math.min(255, Math.trunc(c[2] * f))];

const named = new Map();       // 命名局部当前值（顺序更新）
const floats = new Map();      // 命名 float 局部（`float multiplier = 0.5f`——变量乘数）
const tileArr = new Map();     // "id,opt" → [r,g,b]（值或引用键）
const wallArr = new Map();
const refQueue = [];           // 未解析的 array→array 引用赋值

// Microsoft.Xna.Framework.Color 命名常量（Initialize 内消费：Gray/LightGray；
// 全表备案防未来新增消费点）
const XNA_COLORS = {
  Transparent: [0, 0, 0], White: [255, 255, 255], Black: [0, 0, 0],
  Red: [255, 0, 0], Green: [0, 128, 0], Blue: [0, 0, 255], Yellow: [255, 255, 0],
  Orange: [255, 165, 0], Purple: [128, 0, 128], Gray: [128, 128, 128],
  LightGray: [211, 211, 211], DarkGray: [64, 64, 64], Magenta: [255, 0, 255],
  Cyan: [0, 255, 255], Pink: [255, 192, 203], Brown: [165, 42, 42],
};

// 乘数解析：字面量（0.95f）或命名 float 局部（multiplier）
const mulOf = (tok) => {
  if (tok === undefined) return 1;
  if (/^[\d.]+$/.test(tok)) return parseFloat(tok);
  const v = floats.get(tok);
  if (v === undefined) console.error(`mapcolors: 未知乘数变量 ${tok}（按 1 处理）`);
  return v ?? 1;
};

// ★IIIII218 前置预扫：循环整行拷贝形态（此前漏配 10 sheet 的根因——Initialize 用
//  for 循环把一个 tile 的 13 槽整体拷给另一 tile：dst←src 同色表）：
//  ①直接循环体 `array[dst][v] = array[src][v];`（同索引变量两侧:628/692/160←627、
//    468←467、653←28、693/694←165）；
//  ②别名循环 `Color[] array2 = array[dst];`（或续用 `array2 = array[dst];`）+ 循环体
//    `array2[v] = array[src][v];`（647←186、648←187、650/649←185）。
//  两种形态都登记为【整行拷贝op】（dst 全部【已知】槽 ← src 同号槽,拷贝在主扫描后、
//  refQueue 解析前执行——array[706][0]=array[648][4] 这类单槽前向引用依赖 648 先落值）。
const copyOps = [];          // [dstId, srcId]
let aliasDst = null;         // 当前 array2 绑定的 dst（顺序语义）
for (const raw of body.split('\n')) {
  const l = raw.trim();
  let m;
  if ((m = l.match(/^(?:Color\[\] )?array2 = array\[(\d+)\];$/))) { aliasDst = +m[1]; continue; }
  if ((m = l.match(/^array2\[(\w+)\] = array\[(\d+)\]\[\1\];$/))) {
    if (aliasDst !== null) copyOps.push([aliasDst, +m[2]]);
    continue;
  }
  if ((m = l.match(/^array\[(\d+)\]\[(\w+)\] = array\[(\d+)\]\[\2\];$/))) {
    copyOps.push([+m[1], +m[3]]);
    continue;
  }
}

for (const raw of body.split('\n')) {
  const l = raw.trim();
  let m;
  if ((m = l.match(/^float (\w+) = ([\d.]+)f?;$/))) {
    floats.set(m[1], parseFloat(m[2]));
    continue;
  }
  if ((m = l.match(/^(?:Color\s+)?(\w+) = new Color\((\d+), (\d+), (\d+)\);$/))) {
    named.set(m[1], [+m[2], +m[3], +m[4]]);
    continue;
  }
  if ((m = l.match(/^array\[(\d+)\]\[(\d+)\] = new Color\((\d+), (\d+), (\d+)\);$/))) {
    tileArr.set(`${m[1]},${m[2]}`, [+m[3], +m[4], +m[5]]);
    continue;
  }
  if ((m = l.match(/^array4\[(\d+)\]\[(\d+)\] = new Color\((\d+), (\d+), (\d+)\);$/))) {
    wallArr.set(`${m[1]},${m[2]}`, [+m[3], +m[4], +m[5]]);
    continue;
  }
  // R4-43 ②：`= Color.命名常量`（XNA 静态色）
  if ((m = l.match(/^array\[(\d+)\]\[(\d+)\] = Color\.(\w+);$/))) {
    const v = XNA_COLORS[m[3]];
    if (v) tileArr.set(`${m[1]},${m[2]}`, [...v]);
    else console.error(`mapcolors: 未知 XNA 色 Color.${m[3]}`);
    continue;
  }
  if ((m = l.match(/^array4\[(\d+)\]\[(\d+)\] = Color\.(\w+);$/))) {
    const v = XNA_COLORS[m[3]];
    if (v) wallArr.set(`${m[1]},${m[2]}`, [...v]);
    else console.error(`mapcolors: 未知 XNA 色 Color.${m[3]}`);
    continue;
  }
  if ((m = l.match(/^array\[(\d+)\]\[(\d+)\] = (\w+);$/))) {
    const v = named.get(m[3]);
    if (v) tileArr.set(`${m[1]},${m[2]}`, v);
    continue;
  }
  if ((m = l.match(/^array4\[(\d+)\]\[(\d+)\] = (\w+);$/))) {
    const v = named.get(m[3]);
    if (v) wallArr.set(`${m[1]},${m[2]}`, v);
    continue;
  }
  // R4-43 ①：`= MultiplyMapColor(array[X][Y], 字面量|变量)`（1457 新形态）
  if ((m = l.match(/^array\[(\d+)\]\[(\d+)\] = MultiplyMapColor\(array\[(\d+)\]\[(\d+)\], ([\w.]+?)f?\);$/))) {
    refQueue.push([tileArr, `${m[1]},${m[2]}`, `array[${m[3]}][${m[4]}]`, mulOf(m[5])]);
    continue;
  }
  if ((m = l.match(/^array4\[(\d+)\]\[(\d+)\] = MultiplyMapColor\(array\[(\d+)\]\[(\d+)\], ([\w.]+?)f?\);$/))) {
    refQueue.push([wallArr, `${m[1]},${m[2]}`, `array[${m[3]}][${m[4]}]`, mulOf(m[5])]);
    continue;
  }
  if ((m = l.match(/^array\[(\d+)\]\[(\d+)\] = array\[(\d+)\]\[(\d+)\](?: \* ([\w.]+)f?)?;$/))) {
    refQueue.push([tileArr, `${m[1]},${m[2]}`, `array[${m[3]}][${m[4]}]`, mulOf(m[5])]);
    continue;
  }
  if ((m = l.match(/^array4\[(\d+)\]\[(\d+)\] = array\[(\d+)\]\[(\d+)\](?: \* ([\w.]+)f?)?;$/))) {
    refQueue.push([wallArr, `${m[1]},${m[2]}`, `array[${m[3]}][${m[4]}]`, mulOf(m[5])]);
    continue;
  }
}
// ★IIIII218 整行拷贝 op 执行（主扫描后——src 的直接赋值行已全部落值）：
// 只拷 src【已知】槽（避免给 dst 灌 13 槽空洞→JSON null），同号槽同值。
for (const [dst, src] of copyOps) {
  for (let opt = 0; opt < 13; opt++) {
    const v = tileArr.get(`${src},${opt}`);
    if (v !== undefined) tileArr.set(`${dst},${opt}`, v);
  }
}

// 前向引用解析（数组键形式回归 Map 键）
const keyOf = (ref) => ref.replace(/^array\[(\d+)\]\[(\d+)\]$/, '$1,$2');
for (let pass = 0; pass < 4; pass++) {
  let pending = 0;
  for (const [arr, k, ref, f] of refQueue) {
    const v = arr.get(keyOf(ref)) ?? (ref.startsWith('array4') ? wallArr.get(keyOf(ref)) : tileArr.get(keyOf(ref)));
    if (!v) { pending++; continue; }
    arr.set(k, f === 1 ? v : mulColor(v, f));
  }
  if (!pending) break;
}

const TILES = {};
for (const [k, v] of tileArr) {
  const [id, opt] = k.split(',').map(Number);
  (TILES[id] ??= [])[opt] = v;
}
const WALLS = {};
for (const [k, v] of wallArr) {
  const [id, opt] = k.split(',').map(Number);
  (WALLS[id] ??= [])[opt] = v;
}
const LIQUIDS = [[9, 61, 191], [253, 32, 3], [254, 194, 20], [161, 127, 255]];
const SKY = { from: [50, 40, 255], to: [145, 185, 255] };

// ---- ③ 基数护栏（1457 实测:tiles 748/walls 356——地板防静默半表） ----
if (Object.keys(TILES).length < 700 || Object.keys(WALLS).length < 320) {
  throw new Error(`[extract-mapcolors] 锚点失配: 基数护栏 tiles ${Object.keys(TILES).length}(<700)/walls ${Object.keys(WALLS).length}(<320)（解析面漂移,禁止静默半表）`);
}

// ================= ★BJ284 era guard：干跑对拍 / 沙箱 / 逃生门（头注见上） =================
const FRESH = JSON.stringify({ tiles: TILES, walls: WALLS, liquids: LIQUIDS, sky: SKY });
/** 现库 vs 重产双向路径级 diff（对象键集+叶值;数组按位）。live-only=洗库预警面 /
 *  fresh-only=现库退化缺键型面（★G-1/S3 处方）/ drift=同路径值漂移。 */
function deepWash(live, fresh, prefix = '') {
  const out = { liveOnly: [], freshOnly: [], drift: [] };
  const base = prefix || '<root>';
  if (live === null || fresh === null || typeof live !== 'object' || typeof fresh !== 'object') {
    if (JSON.stringify(live) !== JSON.stringify(fresh)) out.drift.push(`${base}: ${JSON.stringify(live)}→${JSON.stringify(fresh)}`);
    return out;
  }
  if (Array.isArray(live) !== Array.isArray(fresh)) {
    out.drift.push(`${base}: 类型漂移 ${Array.isArray(live) ? 'arr' : 'obj'}↔${Array.isArray(fresh) ? 'arr' : 'obj'}`);
    return out;
  }
  const lk = new Set(Object.keys(live));
  const fk = new Set(Object.keys(fresh));
  for (const k of Object.keys(live)) {
    const p = `${prefix}.${k}`;
    if (!fk.has(k)) { out.liveOnly.push(p); continue; }
    const w = deepWash(live[k], fresh[k], p);
    out.liveOnly.push(...w.liveOnly); out.freshOnly.push(...w.freshOnly); out.drift.push(...w.drift);
  }
  for (const k of Object.keys(fresh)) if (!lk.has(k)) out.freshOnly.push(`${prefix}.${k}`);
  return out;
}
const washEmpty = (w) => !w.liveOnly.length && !w.freshOnly.length && !w.drift.length;
function washReport(w) {
  console.error('  物证：');
  if (w.liveOnly.length) console.error(`    [live-only] 现库独有 ${w.liveOnly.length} 处（重产缺=提取器退化/洗库面）: ${w.liveOnly.slice(0, 6).join(', ')}`);
  if (w.freshOnly.length) console.error(`    [fresh-only] 重产独有 ${w.freshOnly.length} 处（现库缺=源侧新增/现库退化）: ${w.freshOnly.slice(0, 6).join(', ')}`);
  if (w.drift.length) console.error(`    [drift] 值漂移 ${w.drift.length}: ${w.drift.slice(0, 6).join(' | ')}`);
}
let live = null;
if (existsSync(LIVE_JSON)) { try { live = JSON.parse(readFileSync(LIVE_JSON, 'utf8')); } catch { /* 坏损:不拦（npcdrops 同款） */ } }
const wash = live === null ? null : deepWash(live, JSON.parse(FRESH));
if (OUT_JSON) {
  if (WRITE_REAL && wash && !washEmpty(wash) && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
    console.error('[extract-mapcolors] 拒绝 --write-real：重产 diff 非纯增量（双向差异非空）——先逐值定谳（反编译为准）再回写。');
    washReport(wash);
    console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）。');
    process.exit(1);
  }
  mkdirSync(OUT_JSON.slice(0, OUT_JSON.lastIndexOf('/')), { recursive: true });
  writeFileSync(OUT_JSON, FRESH);
  console.error(`[extract-mapcolors] 已写 ${OUT_JSON}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}）`);
} else if (wash === null) {
  console.error('[extract-mapcolors] 干跑（零写盘）：现库缺 vanilla-mapcolors.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
} else if (!washEmpty(wash)) {
  console.error('[extract-mapcolors] 干跑对拍：双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
  washReport(wash);
  console.error('  处置：逐值定谳（反编译为准）后 --write-real 定谳回写；沙箱试验用 SW_OUT=<dir>。');
  process.exit(1);
} else {
  console.error('[extract-mapcolors] 干跑对拍：重产盖住现库（双向零差,零写盘）。写盘须显式 SW_OUT=<dir> 或 --write-real。');
}
console.error(`mapcolors: tile ${Object.keys(TILES).length} / wall ${Object.keys(WALLS).length} / 液体 4 / 天空渐变`);
console.error('dirt 0:', JSON.stringify(TILES[0]?.[0]), 'grass 2:', JSON.stringify(TILES[2]?.[0]), 'stone 1:', JSON.stringify(TILES[1]?.[0]));
console.error('wall stone 1:', JSON.stringify(WALLS[1]?.[0]), 'wall dirt 2:', JSON.stringify(WALLS[2]?.[0]), 'wall wood 4:', JSON.stringify(WALLS[4]?.[0]));
