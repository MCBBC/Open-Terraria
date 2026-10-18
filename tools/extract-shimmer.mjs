// 微光转化表提取（1.4.5.7 = Terarria1457；2026-09-20 基准随 08-23 切换跟进——
//   曾留 1456 源：1457 新增冰系武器环 670→1319→6153→724→670 缺表（6153 GlacierFang
//   为 1.4.5 新物）。1456 行号对照：ItemID.cs Sets :84/:86/:88/:90/:1098、NPCID.cs
//   :4837-4843（1457 在 :88/:90/:92/:94/:1104 与 :4837-4845）。）→ src/data/vanilla-shimmer.json。
//   - ItemID.cs Sets（Terraria.ID/ItemID.cs）：
//       ShimmerTransformToItem   :84   CreateIntSet(-1, from,to,...) 物品→物品
//       ShimmerCountsAsItem      :86   等价计数（幻影类 5358-5361 → 5437）
//       ShimmerCountsAsItemForDecraft :88
//       ShimmerPostMoonlord      :90   月后解锁门（CreateBoolSet）
//       CommonCoin               :1098 钱币四档（铜银金铂 71-74 → coinLuck）
//   - NPCID.cs Sets（Terraria.ID/NPCID.cs）：
//       ShimmerTransformToItem   :4839 NPC → 物品后消散
//       ShimmerTownTransform     :4841 城镇 NPC 微光变体（ai[0]=25）
//       ShimmerTransformToNPC    :4843 NPC → NPC（Transform）
//       ShimmerImmunity          :4837 免微光名单（NPC.cs:17773 → buffImmune[353]，
//                                 免表内 NPC 不进 shimmering/不触发 GetShimmered）
//   - Item.cs SetDefaults：DefaultToCapturedCritter(npcId)（:47613-47626）→
//       itemMakeNPC 玻璃瓶小动物物品 → 放生 NPC id（入微光 WorldItem.cs:1855-1876）
// 注意 CreateIntSet(default, k, v, ...) 是奇偶键值对；CreateBoolSet(list) 是成员表。
// ShimmerTransforms.GetTransformToItem 另有两个动态分支（音乐盒 createTile=139 按
// placeStyle / 3461 月砖按月相）——运行时查表未命中时按动态分支处理（src/stats/Shimmer.ts）。
//
// ★BJ298 2026-09-23 era guard 落闸（四要素习语 docs/era-guard-family.md,BJ284 banners
//   同构;BJ261 续批排期②【洗库险·B 形】清偿——原缺省无 env 无旗直写现库,且无幂等跳过）：
//   ① SW_ITEM_VER 白名单 {1457,1458}（读域 ItemID.cs/NPCID.cs/Item.cs 1457↔1458 逐字节
//     全等 md5 49a0e26a/0234ef53/15ebd617,BJ298 亲核;1456 退役显式拒+指引）;缺省 1457;
//   ② 输出通道三分离：缺省=干跑对拍零写盘（双向路径级 diff——live-only=洗库预警/
//     fresh-only=现库退化缺键型,任一非空 exit 1+物证）/ SW_OUT=<dir>=沙箱 / --write-real=
//     写真库（diff 非纯增量拒,强推须 --force-full --overwrite-append-era 双旗）;SW_OUT 与
//     --write-real 双旗互斥;非 1457 禁写真库;探测注入面 SW_SHIMMER_JSON 与 --write-real
//     混用拒（g1 footgun）;
//   ③ 锚 fail-loud：各 Set 名 throw（原有）+基数护栏（十键下限,BJ298 亲数）;
//   ④ 判别力自证：tests/extract-tables2-era-guard.test.ts（M1 摘干跑门/M3 摘 fresh-only 轴）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)

// ---- ★BJ298 era guard ①②：版本白名单 + 输出通道开关（对拍在文末落盘段） ----
const VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1457', '1458']);
if (!VER_ALLOWED.has(VER) || !existsSync(`${ROOT}/Terarria${VER}/Terraria.ID/ItemID.cs`)) {
  console.error(`[extract-shimmer] 拒绝运行：SW_ITEM_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1456') console.error('  1456 锚集已退役（2026-09-20 BJ183 基准对齐 1457,BJ298 落闸）；1456 回拍读时代快照。');
  process.exit(1);
}
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-shimmer] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  process.exit(1);
}
if (WRITE_REAL && VER !== '1457') {
  console.error(`[extract-shimmer] 拒绝写真库：SW_ITEM_VER=${VER}≠1457（旧基线重放禁写 vanilla-shimmer.json）。`);
  process.exit(1);
}
if (WRITE_REAL && process.env.SW_SHIMMER_JSON !== undefined) {
  console.error('[extract-shimmer] 拒绝运行：探测注入面（SW_SHIMMER_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  process.exit(1);
}
const LIVE_JSON = process.env.SW_SHIMMER_JSON ?? `${ROOT}/game/src/data/vanilla-shimmer.json`;
const OUT_JSON = WRITE_REAL
  ? LIVE_JSON
  : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-shimmer.json` : null);

const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf8');

/** 取 `public static T[] NAME = Factory.CreateIntSet(args...);` 的实参数组 */
function intSetArgs(src, name) {
  const m = src.match(new RegExp(`public static int\\[\\] ${name} = Factory\\.CreateIntSet\\(([\\s\\S]*?)\\);`));
  if (!m) throw new Error(`int set ${name} not found`);
  return m[1].split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n));
}

/** CreateIntSet(default, k, v, ...) → { from: to }（保留 ≤0 值的显式覆盖项） */
function intSetMap(src, name) {
  const args = intSetArgs(src, name);
  const def = args[0];
  const out = {};
  for (let i = 1; i + 1 < args.length + 1; i += 2) {
    if (i + 1 >= args.length + 1) break;
    const k = args[i], v = args[i + 1];
    if (k === undefined || v === undefined) break;
    if (v === def) continue;
    out[k] = v;
  }
  return out;
}

/** 取 `public static bool[] NAME = Factory.CreateBoolSet(args...);` 成员表 */
function boolSetList(src, name) {
  const m = src.match(new RegExp(`public static bool\\[\\] ${name} = Factory\\.CreateBoolSet\\(([\\s\\S]*?)\\);`));
  if (!m) throw new Error(`bool set ${name} not found`);
  const args = m[1].split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n));
  // CreateBoolSet 可带第二参 default（CreateBoolSet(true, ids...) = 反选表）——
  // 本表全部为默认 false 的正向成员表，args 全为 id。
  return args;
}

const itemid = read(`Terarria${VER}/Terraria.ID/ItemID.cs`);
const npcid = read(`Terarria${VER}/Terraria.ID/NPCID.cs`);
const itemcs = read(`Terarria${VER}/Terraria/Item.cs`);

/** Item.cs SetDefaults 内 `case N:` → DefaultToCapturedCritter(X) 扫描。
 *  作用域规则（SetDefaults 反编译结构：case 标签深度 d，体语句深度 d+1，
 *  终止符 break/return/goto 深度 d+1）：
 *   - 同深度连续标签 = 多标签共体（2889-2895 → 442+type-2889 逐标签求值）
 *   - 更深标签 = 内层 switch(type) 作用域（2205 → 148、2673 → 374 均在内层）
 *   - 终止符清空 labelDepth ≥ 深度-1 的全部组（防外层已终标签滞留误挂）
 *  参数支持字面量与 `(short)(含 type 表达式)`（:27385/:37069/:39530/:39540 工厂式） */
function capturedCritterMap(src) {
  const out = {};
  let groups = []; // { ids: number[], depth }——后进 = 更内层作用域
  for (const line of src.split('\n')) {
    const cm = line.match(/^(\t*)case (\d+):\s*$/);
    if (cm) {
      const depth = cm[1].length;
      const id = parseInt(cm[2], 10);
      const top = groups[groups.length - 1];
      if (top && top.depth === depth) top.ids.push(id);
      else groups.push({ ids: [id], depth });
      continue;
    }
    if (/^\t*(break;|return;|return |goto )/.test(line)) {
      const d = (line.match(/^\t*/) ?? [''])[0].length;
      groups = groups.filter((g) => g.depth < d - 1);
      continue;
    }
    const m = line.match(/^\t+DefaultToCapturedCritter\((.+)\);$/);
    if (m) {
      const g = groups[groups.length - 1];
      if (g) for (const id of g.ids) out[id] = evalCritterArg(m[1], id);
    }
  }
  return out;
}

/** DefaultToCapturedCritter 实参求值：字面量或含 `type`（=物品 id）的算术式 */
function evalCritterArg(arg, itemId) {
  const wrap = arg.match(/^\(short\)\((.+)\)$/);
  const expr = wrap ? wrap[1] : arg;
  if (!/^[\d+\-*/(). type]+$/.test(expr)) {
    throw new Error(`unparsed DefaultToCapturedCritter arg: ${arg}`);
  }
  // eslint-disable-next-line no-new-func
  return new Function('type', `"use strict";return (${expr});`)(itemId);
}

const data = {
  itemTransformTo: intSetMap(itemid, 'ShimmerTransformToItem'),
  itemCountsAs: intSetMap(itemid, 'ShimmerCountsAsItem'),
  itemCountsAsDecraft: intSetMap(itemid, 'ShimmerCountsAsItemForDecraft'),
  itemPostMoonlord: boolSetList(itemid, 'ShimmerPostMoonlord'),
  commonCoin: boolSetList(itemid, 'CommonCoin'),
  itemMakeNPC: capturedCritterMap(itemcs),
  npcTransformTo: intSetMap(npcid, 'ShimmerTransformToNPC'),
  npcTransformToItem: intSetMap(npcid, 'ShimmerTransformToItem'),
  npcTownTransform: boolSetList(npcid, 'ShimmerTownTransform'),
  npcShimmerImmunity: boolSetList(npcid, 'ShimmerImmunity'),
};

// ---- ★BJ298 ③ 基数护栏（1457 实测十键下限,BJ298 干跑亲数;漂移=解析面残表）----
const SHIMMER_FLOORS = {
  itemTransformTo: 300, itemCountsAs: 5, itemCountsAsDecraft: 1, itemPostMoonlord: 5,
  commonCoin: 4, itemMakeNPC: 80, npcTransformTo: 100, npcTransformToItem: 10,
  npcTownTransform: 25, npcShimmerImmunity: 120,
};

// ---- ★BJ298 era guard ②：干跑对拍 / 沙箱 / 逃生门（banners 同构 deepWash）----
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
{
  const bad = Object.entries(SHIMMER_FLOORS)
    .filter(([k, f]) => ((Array.isArray(data[k]) ? data[k].length : Object.keys(data[k] ?? {}).length) ?? 0) < f)
    .map(([k, f]) => `${k} < ${f}`);
  if (bad.length) throw new Error(`[extract-shimmer] 锚点失配: 基数护栏: ${bad.join('; ')}（解析面漂移,禁止静默半表）`);
}
const json = JSON.stringify(data);
let live = null;
if (existsSync(LIVE_JSON)) { try { live = JSON.parse(readFileSync(LIVE_JSON, 'utf8')); } catch { /* 坏损:不拦（npcdrops 同款） */ } }
const wash = live === null ? null : deepWash(live, JSON.parse(json));
for (const [k, v] of Object.entries(data)) {
  const n = Array.isArray(v) ? v.length : Object.keys(v).length;
  console.error(`${k}: ${n} 条`);
}
if (OUT_JSON) {
  if (WRITE_REAL && wash && !washEmpty(wash) && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
    console.error('[extract-shimmer] 拒绝 --write-real：重产 diff 非纯增量（双向差异非空）——先逐值定谳（反编译为准）再回写。');
    washReport(wash);
    console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）。');
    process.exit(1);
  }
  mkdirSync(OUT_JSON.slice(0, OUT_JSON.lastIndexOf('/')), { recursive: true });
  writeFileSync(OUT_JSON, json);
  console.error(`[extract-shimmer] 已写 ${OUT_JSON}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}）`);
} else if (wash === null) {
  console.error('[extract-shimmer] 干跑（零写盘）：现库缺 vanilla-shimmer.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
} else if (!washEmpty(wash)) {
  console.error('[extract-shimmer] 干跑对拍：双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
  washReport(wash);
  console.error('  处置：逐值定谳（反编译为准）后 --write-real 定谳回写；沙箱试验用 SW_OUT=<dir>。');
  process.exit(1);
} else {
  console.error('[extract-shimmer] 干跑对拍：重产盖住现库（双向零差,零写盘）。写盘须显式 SW_OUT=<dir> 或 --write-real。');
}
