// 图鉴"出没环境"提取（1.4.5.7 = Terarria1457；★BJ183 2026-09-20 基准对齐，
// BestiaryDatabaseNPCsPopulator.cs 1456↔1457 字节全等——对拍零漂移）→ src/data/vanilla-bestiary-spawn.json。
//   - BestiaryDatabaseNPCsPopulator.cs：
//       CommonTags.SpawnConditions.{Invasions,Events,Biomes,Times,Visuals} 静态声明
//       （:14-302）四类元素：
//         · SpawnConditionBestiaryInfoElement（langKey, filterIconFrame, bgPath?, bgColor?）
//           ——出没环境主条目，bgPath/bgColor = 条目头像背景（MapBG）与着色
//           （IBestiaryBackgroundImagePathAndColorProvider，NPCPortraitInfoElement.cs:39-57）
//         · SpawnConditionBestiaryOverlayInfoElement（同签名，路径语义 = MapBGOverlay 叠层）
//         · SpawnConditionDecorativeOverlayInfoElement（Visuals.*：纯装饰叠层，首参=贴图路径）
//       对象初始化器属性一并列出：DisplayTextPriority（风味回退取最高者用，populator:693-700）、
//       OrderPriority、HideInPortraitInfo、DisplayPriority。
//       ×732 `FindEntryByNPCID(id).Info.AddRange(new IBestiaryInfoElement[N] { ... })`
//       （AddNPCBiomeRelationships_Automated :802 / _Manual :1661）——每 NPC 的出没环境注册序
//       （UIBestiaryEntryInfoPage 按注册序呈现）
//   - GetCommonInfoElementsForFilters（:239-301）→ commonFilters：BestiaryHelper.
//     GetLowestBiomeGroupIndex（ContentSamples.cs:755-766）的组序表（ContentSamples 排序键 6）
//   - 头像背景偏好（AddTags，:515-548）：BestiaryPortraitBackgroundProviderPreferenceInfoElement
//     （单条件）与 BasedOnWorldEvil 双路（腐化/猩红按 WorldGen.crimson 二选一）；
//     月总 398 的 MoonLordPortraitBackgroundProviderBestiaryInfoElement（:550-551）
//   - Visuals.* 装饰叠层挂载可从条件推导（Rain+Snow→Blizzard 等 :1942-1985）——
//     derivations 列出推导规则，UI 侧按需消费
// 产物结构：
//   { conditions: { "<Group>.<Name>": { key, priority, text, bg, bgColor, overlay, overlayColor } },
//     byNpc: { "<npcId>": ["<Group>.<Name>", ...] },
//     commonFilters: ["<Group>.<Name>", ...],
//     bgPreference: { "<npcId>": ["<path>" | { corrupt, crimson }] },
//     moonLordBg: [398],
//     derivations: { "<Visuals.X>": "<前提条件>" } }
//
// ★BJ298 2026-09-23 era guard 落闸（四要素习语 docs/era-guard-family.md,BJ284 banners
//   同构;BJ261 续批排期②【洗库险·B 形】清偿——原缺省无 env 无旗直写现库）：
//   ① SW_ITEM_VER 白名单 {1457,1458}（读域 BestiaryDatabaseNPCsPopulator.cs 三版逐字节
//     全等 md5 4874424e,BJ298 亲核——1458 交叉重放天然 byte-perfect;1456 退役显式拒+指引）;
//     缺省 1457（拍板#7A）;
//   ② 输出通道三分离：缺省=干跑对拍零写盘（双向路径级 diff——live-only=洗库预警/
//     fresh-only=现库退化缺键型,任一非空 exit 1+物证）/ SW_OUT=<dir>=沙箱 / --write-real=
//     写真库（diff 非纯增量拒,强推须 --force-full --overwrite-append-era 双旗）;SW_OUT 与
//     --write-real 双旗互斥;非 1457 禁写真库;探测注入面 SW_BESTIARYSPAWN_JSON 与
//     --write-real 混用拒（g1 footgun）;
//   ③ 锚 fail-loud：conditions 空表 throw（原有）+GetCommonInfoElementsForFilters/
//     MoonLord 背景锚（原有）+基数护栏（conditions≥80/byNpc≥600/条目≥1500,BJ298 亲数）;
//   ④ 判别力自证：tests/extract-tables2-era-guard.test.ts（M1 摘干跑门/M3 摘 fresh-only 轴）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)
// ---- ★BJ298 era guard ①②：版本白名单 + 输出通道开关（对拍在文末落盘段） ----
const VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1457', '1458']);
if (!VER_ALLOWED.has(VER) || !existsSync(`${ROOT}/Terarria${VER}/Terraria.GameContent.Bestiary/BestiaryDatabaseNPCsPopulator.cs`)) {
  console.error(`[extract-bestiary-spawn] 拒绝运行：SW_ITEM_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1456') console.error('  1456 锚集已退役（BJ183 基准对齐 1457,BJ298 落闸）；1456 回拍读时代快照。');
  process.exit(1);
}
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const SW_OUT = process.env.SW_OUT;
if (SW_OUT !== undefined && SW_OUT !== '' && WRITE_REAL) {
  console.error('[extract-bestiary-spawn] 拒绝运行：SW_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  process.exit(1);
}
if (WRITE_REAL && VER !== '1457') {
  console.error(`[extract-bestiary-spawn] 拒绝写真库：SW_ITEM_VER=${VER}≠1457（旧基线重放禁写 vanilla-bestiary-spawn.json）。`);
  process.exit(1);
}
if (WRITE_REAL && process.env.SW_BESTIARYSPAWN_JSON !== undefined) {
  console.error('[extract-bestiary-spawn] 拒绝运行：探测注入面（SW_BESTIARYSPAWN_JSON）已设置而 --write-real 将写真实现库（fail-closed）。');
  process.exit(1);
}
const LIVE_JSON = process.env.SW_BESTIARYSPAWN_JSON ?? `${ROOT}/game/src/data/vanilla-bestiary-spawn.json`;
const OUT_JSON = WRITE_REAL
  ? LIVE_JSON
  : (SW_OUT ? `${SW_OUT.replace(/\/+$/, '')}/vanilla-bestiary-spawn.json` : null);
const src = readFileSync(`${ROOT}/Terarria${VER}/Terraria.GameContent.Bestiary/BestiaryDatabaseNPCsPopulator.cs`, 'utf8');
const lines = src.split('\n');

// ---- 嵌套类栈 → 字段全路径 ----
// `public static class X` 按缩进深度入栈；字段声明深度 d 的路径 = 1..d-1 层类名 + 字段名
const classAt = new Map(); // tabDepth → className
const conditions = {};     // "Group.Name" → 声明
const declRe = /^\t+public static (\w+) (\w+) = new (\w+)\(/;

/** 解析构造参数（顶层逗号分隔）与对象初始化器属性 */
function parseDecl(i) {
  // 从声明行起做括号配平拿完整实参表；随后若跟 `{...};` 拿初始化器
  let text = lines[i];
  let depth = 0, j = i, args = null;
  for (; j < lines.length; j++) {
    for (const ch of lines[j]) {
      if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (depth === 0) { args = text; break; } }
    }
    if (args !== null) break;
    text += '\n' + lines[j + 1];
  }
  const m = args.replace(/;\s*$/, '').match(/\(([\s\S]*)\)$/);
  const raw = m ? m[1] : '';
  // 顶层逗号拆分
  const parts = [];
  let d = 0, cur = '';
  for (const ch of raw) {
    if (ch === '(') d++;
    if (ch === ')') d--;
    if (ch === ',' && d === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  // 初始化器（`)\n{ ... };`）
  const props = {};
  let k = j + 1;
  while (k < lines.length && !lines[k].includes('{')) {
    if (lines[k].trim().endsWith(';')) break;
    k++;
  }
  if (k < lines.length && lines[k].includes('{')) {
    let p = 0;
    for (; k < lines.length; k++) {
      for (const ch of lines[k]) {
        if (ch === '{') p++;
        else if (ch === '}') p--;
      }
      if (p > 0) {
        const pm = lines[k].match(/^\s*(\w+)\s*=\s*(-?[\d.]+)f?\s*,?\s*$/);
        if (pm) props[pm[1]] = parseFloat(pm[2]);
        else if (/^\s*(HideInPortraitInfo|true|false)\s*,?\s*$/.test(lines[k])) props.HideInPortraitInfo = true;
      }
      if (p === 0 && lines[k].includes('}')) break;
    }
  }
  return { args: parts, props };
}

/** `"Images/MapBG6"` → "MapBG6"；`new Color(r,g,b[,a])` / `Color.White` → [r,g,b,a] */
const imageName = (a) => {
  const m = a?.match(/^"Images\/(\w+)"$/);
  return m ? m[1] : null;
};
const colorOf = (a) => {
  if (!a) return null;
  if (a === 'Color.White') return [255, 255, 255, 255];
  const m = a.match(/^new Color\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+))?\)$/);
  return m ? [+m[1], +m[2], +m[3], m[4] ? +m[4] : 255] : null;
};

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const cm = line.match(/^\t+public static class (\w+)/);
  if (cm) {
    classAt.set(cm[0].length - cm[0].trimStart().length, cm[1]);
    continue;
  }
  const fm = line.match(declRe);
  if (!fm) continue;
  const depth = fm[0].length - fm[0].trimStart().length;
  const chain = [];
  for (let d = 1; d < depth; d++) {
    const c = classAt.get(d);
    if (c) chain.push(c);
  }
  // 跳过外层类名（CommonTags/SpawnConditions），保留 Invasions/Events/Biomes/Times/Visuals 分组
  const group = chain[chain.length - 1];
  if (group !== 'Invasions' && group !== 'Events' && group !== 'Biomes' && group !== 'Times' && group !== 'Visuals') continue;
  const [, type, name] = fm;
  const { args, props } = parseDecl(i);
  const entry = {};
  if (type === 'SpawnConditionBestiaryInfoElement') {
    entry.key = args[0].replace(/^"|"$/g, '');
    entry.priority = parseInt(args[1], 10);
    entry.bg = imageName(args[2]);
    entry.bgColor = colorOf(args[3]);
  } else if (type === 'SpawnConditionBestiaryOverlayInfoElement') {
    entry.key = args[0].replace(/^"|"$/g, '');
    entry.priority = parseInt(args[1], 10);
    entry.overlay = imageName(args[2]);
    entry.overlayColor = colorOf(args[3]);
  } else if (type === 'SpawnConditionDecorativeOverlayInfoElement') {
    entry.overlay = imageName(args[0]);
    entry.overlayColor = colorOf(args[1]);
  } else {
    continue;
  }
  if (props.DisplayTextPriority !== undefined) entry.text = props.DisplayTextPriority;
  if (props.OrderPriority !== undefined) entry.order = props.OrderPriority;
  if (props.HideInPortraitInfo) entry.hideInPortrait = true;
  conditions[`${group}.${name}`] = entry;
}
const nCond = Object.keys(conditions).length;
if (nCond === 0) throw new Error('no spawn conditions parsed');

// ---- 每 NPC 注册序 ----
const byNpc = {};
const re = /FindEntryByNPCID\((-?\d+)\)\.Info\.AddRange\(new IBestiaryInfoElement\[\d+\]\s*\{([\s\S]*?)\}\s*\);/g;
let m;
let total = 0;
while ((m = re.exec(src))) {
  const id = m[1];
  const body = m[2];
  const paths = [...body.matchAll(/CommonTags\.SpawnConditions\.([\w.]+)/g)].map((x) => x[1]);
  for (const p of paths) {
    if (!conditions[p]) throw new Error(`unknown condition path: ${p}`);
  }
  if (!paths.length) continue;
  byNpc[id] = [...(byNpc[id] ?? []), ...paths];
  total += paths.length;
}

// ---- GetCommonInfoElementsForFilters（:239-301）→ 组序表 ----
const cfMatch = src.match(/GetCommonInfoElementsForFilters\(\)([\s\S]*?)\n\t\t\t\}/);
if (!cfMatch) throw new Error('GetCommonInfoElementsForFilters not found');
const commonFilters = [...cfMatch[1].matchAll(/SpawnConditions\.([\w.]+)/g)].map((x) => x[1]);
for (const p of commonFilters) {
  if (!conditions[p]) throw new Error(`unknown common filter path: ${p}`);
}

// ---- 头像背景偏好（AddTags :515-548）----
const bgPreference = {};
for (const hit of src.matchAll(/FindEntryByNPCID\((-?\d+)\)\.AddTags\(new BestiaryPortraitBackground(?:ProviderPreference|BasedOnWorldEvilProviderPreference)InfoElement\(([^)]*(?:\([^)]*\))?[^)]*)\)\);/g)) {
  const id = hit[1];
  const args = hit[2];
  const paths = [...args.matchAll(/CommonTags\.SpawnConditions\.([\w.]+)/g)].map((x) => x[1]);
  for (const p of paths) if (!conditions[p]) throw new Error(`unknown bg preference path: ${p}`);
  bgPreference[id] = paths.length === 2
    ? [{ corrupt: paths[0], crimson: paths[1] }]
    : paths;
}
// 月总背景元素（:550-551）
const moonLordBg = [];
const ml = src.match(/BestiaryEntry (\w+) = FindEntryByNPCID\((-?\d+)\);\s*\n\s*\1\.Info\.Add\(new MoonLordPortraitBackgroundProviderBestiaryInfoElement\(\)\)/);
if (ml) moonLordBg.push(parseInt(ml[2], 10));

// ---- Visuals 装饰叠层推导（:1942-1985 AddNPCBiomeRelationships_AddDecorations_Automated）----
const derivations = {};
const derivRules = [
  ['Rain', ['Events.Rain']],                                // Rain 且 Snow → Blizzard，否则 Rain
  ['Blizzard', ['Events.Rain', 'Biomes.Snow']],
  ['EclipseSun', ['Events.Eclipse']],
  ['Moon', ['Times.NightTime']],
  ['Sun', ['Times.DayTime']],
  ['PumpkinMoon', ['Invasions.PumpkinMoon']],
  ['FrostMoon', ['Invasions.FrostMoon']],
  ['Meteor', ['Biomes.Meteor']],
];
for (const [vis, need] of derivRules) {
  const path = `Visuals.${vis}`;
  if (conditions[path]) derivations[path] = need;
}

const data = { conditions, byNpc, commonFilters, bgPreference, moonLordBg, derivations };

// ---- ★BJ298 ③ 基数护栏（1457 实测,BJ298 亲数;漂移=解析面残表）----
if (nCond < 60 || Object.keys(byNpc).length < 600 || total < 800 || commonFilters.length < 50) {
  throw new Error(`[extract-bestiary-spawn] 锚点失配: 基数护栏: conditions ${nCond} < 60 / byNpc ${Object.keys(byNpc).length} < 600 / 条目 ${total} < 800 / commonFilters ${commonFilters.length} < 50（解析面漂移,禁止静默半表）`);
}

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
const json = JSON.stringify(data);
let live = null;
if (existsSync(LIVE_JSON)) { try { live = JSON.parse(readFileSync(LIVE_JSON, 'utf8')); } catch { /* 坏损:不拦（npcdrops 同款） */ } }
const wash = live === null ? null : deepWash(live, JSON.parse(json));
console.error(`conditions: ${nCond} 条 / byNpc: ${Object.keys(byNpc).length} NPC / 条目: ${total}`);
console.error(`commonFilters: ${commonFilters.length} 条 / bgPreference: ${Object.keys(bgPreference).length} NPC / moonLord: [${moonLordBg}]`);
if (OUT_JSON) {
  if (WRITE_REAL && wash && !washEmpty(wash) && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
    console.error('[extract-bestiary-spawn] 拒绝 --write-real：重产 diff 非纯增量（双向差异非空）——先逐值定谳（反编译为准）再回写。');
    washReport(wash);
    console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）。');
    process.exit(1);
  }
  mkdirSync(OUT_JSON.slice(0, OUT_JSON.lastIndexOf('/')), { recursive: true });
  writeFileSync(OUT_JSON, json);
  console.error(`[extract-bestiary-spawn] 已写 ${OUT_JSON}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT 沙箱'}）`);
} else if (wash === null) {
  console.error('[extract-bestiary-spawn] 干跑（零写盘）：现库缺 vanilla-bestiary-spawn.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
} else if (!washEmpty(wash)) {
  console.error('[extract-bestiary-spawn] 干跑对拍：双向 diff 非空（live-only=洗库预警 / fresh-only=现库退化缺键型）——零写盘。');
  washReport(wash);
  console.error('  处置：逐值定谳（反编译为准）后 --write-real 定谳回写；沙箱试验用 SW_OUT=<dir>。');
  process.exit(1);
} else {
  console.error('[extract-bestiary-spawn] 干跑对拍：重产盖住现库（双向零差,零写盘）。写盘须显式 SW_OUT=<dir> 或 --write-real。');
}
