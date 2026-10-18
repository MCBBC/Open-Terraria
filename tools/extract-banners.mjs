// 提取 BannerSystem 映射(NPCtoBanner switch / BannerToItem 特例+级联区间 /
// BannerToNPC 规范代表 / KillsToBanner)
// ★BJ334 2026-09-24：负 netID 盲区修复（case/箭头两 regex 补 -? 号）——史莱姆族
//   变体旗（-2/-3/-4/-5/-6/-7/-8/-9/-10 → 167/119/151/146/90/155/159/183/131）
//   曾整链静默丢失；详见 §1/§3 内注与 tests/bj334-*。
// ★2026-09-03：基准 1456 → 1457（CLAUDE.md 1457 权威；NPCtoBanner/BannerToItem/
// BannerToNPC/KillsToBanner 四面 1456↔1457 逐值相同——1457 仅动 claimable/net 面）,
// BannerToNPC 为本批新增（旗达标公告规范名 Game.ts 消费,BannerSystem.cs:249-255）。
//
// ★BJ284 2026-09-22 era guard 落闸（四要素习语 docs/era-guard-family.md）：
//   ① SW_ITEM_VER 缺省 1457（白名单 {1457,1458}，1456 显式拒+指引；对应反编译目录不存在也拒）
//     ——BJ284 定谳：1458 交叉重放 fresh 与现库逐字节零差（BannerSystem.cs/ItemID.cs 读域）；
//   ② 输出通道三分离：缺省=干跑对拍零写盘（重产 vs 现库双向路径级 diff——live-only=洗库预警/
//     fresh-only=现库退化缺键型,任一非空 exit 1+物证）/ SW_OUT=<dir>=沙箱 / --write-real=
//     写真库（diff 非纯增量拒,强推须 --force-full --overwrite-append-era 双旗）；SW_OUT 与
//     --write-real 双旗互斥；SW_ITEM_VER≠1457 禁写真库；探测注入面 SW_BANNERS_JSON 与
//     --write-real 混用拒（g1 footgun,探测与写盘分离=守卫被绕过）;
//   ③ 锚 fail-loud：四面签名（NPCtoBanner/BannerToItem/BannerToNPC/KillsToBanner）+
//     KillsToBanner CreateIntSet 字面量回读+基数护栏（447/6/9/280/43）;
//   ④ 判别力自证：tests/extract-tables-era-guard.test.ts（M1 摘干跑门/M2 毒化锚/M3 摘 fresh-only 轴）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1457', '1458']);
const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)
if (!VER_ALLOWED.has(VER) || !existsSync(`${ROOT}/Terarria${VER}/Terraria.GameContent/BannerSystem.cs`)) {
  console.error(`[extract-banners] 拒绝运行：SW_ITEM_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1456') console.error('  1456 锚集已退役（2026-09-03 基准切 1457,BJ284 落闸）；1456 对拍读时代快照。');
  process.exit(1);
}
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-banners] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  process.exit(1);
}
if (WRITE_REAL && VER !== '1457') {
  console.error(`[extract-banners] 拒绝写真库：SW_ITEM_VER=${VER}≠1457（旧基线重放禁写 vanilla-banners.json）。`);
  process.exit(1);
}
if (WRITE_REAL && process.env.SW_BANNERS_JSON !== undefined) {
  console.error('[extract-banners] 拒绝运行：探测注入面（SW_BANNERS_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  process.exit(1);
}
// ★M1 变异锚:干跑臂 null（守卫测试把 null 换成假现库路径,证明缺省零写盘是唯一拦截面）
const LIVE_JSON = process.env.SW_BANNERS_JSON ?? `${ROOT}/game/src/data/vanilla-banners.json`;
const OUT_JSON = WRITE_REAL ? LIVE_JSON : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-banners.json` : null);

const src = readFileSync(`${ROOT}/Terarria${VER}/Terraria.GameContent/BannerSystem.cs`, 'utf8');
const itemSrc = readFileSync(`${ROOT}/Terarria${VER}/Terraria.ID/ItemID.cs`, 'utf8');

// ---- ③ 锚 fail-loud（四面签名+KillsToBanner 字面量；原 indexOf -1 静默滑窗反模式已修） ----
for (const sig of ['public static int NPCtoBanner', 'public static int BannerToItem', 'public static int BannerToNPC']) {
  if (!src.includes(sig)) throw new Error(`[extract-banners] 锚点失配: BannerSystem.cs 签名未找到: ${sig}（源码漂移,禁止静默空扫）`);
}

// 1) NPCtoBanner:switch fall-through 组 → npcId: bannerId
const npcToBanner = {};
{
  const start = src.indexOf('public static int NPCtoBanner');
  const body = src.slice(start, src.indexOf('public static', start + 40));
  // ★BJ334(2026-09-24)盲区修复：`case (\d+)` 曾静默丢全部负 netID case（case -3:
  // 等 9 条,placeStyle-extractor-blindspot 同族）——绿/黑/紫/红/黄/丛林史莱姆旗
  // (90/119/131/151/155/159/183/146)整链不可达。反向定谳=BannerSystem.cs:788-896。
  const re = /case (-?\d+):\s*(?:return (-?\d+);)?/g;
  let group = [];
  let m;
  while ((m = re.exec(body))) {
    if (m[2] !== undefined) {
      const banner = +m[2];
      for (const n of group) npcToBanner[n] = banner;
      npcToBanner[+m[1]] = banner;
      group = [];
    } else group.push(+m[1]);
  }
}

// 2) BannerToItem:特例 if 链 + 级联区间 if (banner >= X) return base + banner - X
const bannerToItem = {};
const bannerRanges = [];
{
  const start = src.indexOf('public static int BannerToItem');
  const body = src.slice(start, src.indexOf('public static', start + 40));
  let m;
  const reIf = /if \(banner == (\d+)\)\s*\{\s*return (\d+);/g;
  while ((m = reIf.exec(body))) bannerToItem[+m[1]] = +m[2];
  const reR = /if \(banner (>=?) (\d+)\)\s*\{\s*return (\d+) \+ banner - (\d+);/g;
  while ((m = reR.exec(body))) bannerRanges.push({ gt: m[1] === '>', min: +m[2], base: +m[3], off: +m[4] });
  // 末段无条件 return base + banner - off（1..min 区间兜底）
  if ((m = body.match(/\n\t\treturn (\d+) \+ banner - (\d+);/))) {
    bannerRanges.push({ gt: false, min: 1, base: +m[1], off: +m[2] });
  }
}

// 3) BannerToNPC:旗种 → 规范代表 NPC id（BannerSystem.cs:1156 switch,1..292 全表 +
//  `_ => 0` 兜底）。同旗多 NPC（如蓝史莱姆 74/297/298 同旗 8）原版公告/tooltip 一律
//  取此规范 id 的名字——不能用 npcToBanner 反查的最小 npc id 顶替（机制不同）。
const bannerToNpc = {};
{
  const start = src.indexOf('public static int BannerToNPC');
  const body = src.slice(start, src.indexOf('public static', start + 40));
  let m;
  // ★BJ334(2026-09-24)盲区修复：值域 `(\d+)` 曾丢负规范代表（90=>-6/119=>-3/
  //  131=>-10/151=>-4/155=>-7/159=>-8/183=>-9 七旗,BannerSystem.cs:1306-1341）,
  //  整旗从 bannerToNpc 消失=旗 tooltip/达标公告名缺名根。
  const re = /(-?\d+) => (-?\d+)/g;
  while ((m = re.exec(body))) bannerToNpc[+m[1]] = +m[2];
}

// 4) KillsToBanner:CreateIntSet(默认, k,v,...)
const killsToBanner = {};
{
  const m = itemSrc.match(/KillsToBanner = Factory\.CreateIntSet\(([^)]*)\)/);
  if (!m) throw new Error('[extract-banners] 锚点失配: ItemID.cs KillsToBanner = Factory.CreateIntSet 未找到（源码漂移,禁止静默空表）');
  const parts = m[1].split(',').map((s) => s.trim());
  killsToBanner['*'] = +parts[0];
  for (let i = 1; i + 1 < parts.length; i += 2) killsToBanner[+parts[i]] = +parts[i + 1];
}

// ---- ③ 基数护栏（1457 实测:★BJ334 负 netID 盲区修复后 npcToBanner 457/bannerToItem 6/ranges 9/bannerToNpc 287/kills 43;
//      修复前 447/280=负 case 静默丢失;-1 与 81 同旗 99,BannerSystem.cs:689-691） ----
{
  const floors = [
    ['npcToBanner', Object.keys(npcToBanner).length, 400],
    ['bannerToItem', Object.keys(bannerToItem).length, 5],
    ['bannerRanges', bannerRanges.length, 8],
    ['bannerToNpc', Object.keys(bannerToNpc).length, 250],
    ['killsToBanner', Object.keys(killsToBanner).length - 1, 35],
  ];
  const bad = floors.filter(([, n, f]) => n < f).map(([k, n, f]) => `${k} ${n} < ${f}`);
  if (bad.length) throw new Error(`[extract-banners] 锚点失配: 基数护栏: ${bad.join('; ')}（解析面漂移,禁止静默半表）`);
}

// ================= ★BJ284 era guard：干跑对拍 / 沙箱 / 逃生门（头注见上） =================
const FRESH = JSON.stringify({ npcToBanner, bannerToItem, bannerRanges, bannerToNpc, killsToBanner }, null, 1);
/** 现库 vs 重产双向路径级 diff（对象键集+叶值;数组按位）。live-only=洗库预警面（现库有而
 *  重产无,vanilla-atlas 追加时代同族）/ fresh-only=现库退化缺键型面（★G-1/S3 处方:只算
 *  live-only 的对拍闸对源侧删除恒绿）/ drift=同路径值漂移。 */
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
    console.error('[extract-banners] 拒绝 --write-real：重产 diff 非纯增量（双向差异非空）——先逐值定谳（反编译为准）再回写。');
    washReport(wash);
    console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）。');
    process.exit(1);
  }
  mkdirSync(OUT_JSON.slice(0, OUT_JSON.lastIndexOf('/')), { recursive: true });
  writeFileSync(OUT_JSON, FRESH);
  console.error(`[extract-banners] 已写 ${OUT_JSON}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}）`);
} else if (wash === null) {
  console.error('[extract-banners] 干跑（零写盘）：现库缺 vanilla-banners.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
} else if (!washEmpty(wash)) {
  console.error('[extract-banners] 干跑对拍：双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
  washReport(wash);
  console.error('  处置：逐值定谳（反编译为准）后 --write-real 定谳回写；沙箱试验用 SW_OUT=<dir>。');
  process.exit(1);
} else {
  console.error('[extract-banners] 干跑对拍：重产盖住现库（双向零差,零写盘）。写盘须显式 SW_OUT=<dir> 或 --write-real。');
}
console.log('npcToBanner:', Object.keys(npcToBanner).length,
  '| 特例:', Object.keys(bannerToItem).length,
  '| 区间:', bannerRanges.length,
  '| bannerToNpc:', Object.keys(bannerToNpc).length,
  '| kills 特例:', Object.keys(killsToBanner).length - 1);
