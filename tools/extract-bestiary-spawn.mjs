// 图鉴"出没环境"提取（1.4.5.6 = Terarria1456）→ src/data/vanilla-bestiary-spawn.json。
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
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const src = readFileSync(`${ROOT}/Terarria1456/Terraria.GameContent.Bestiary/BestiaryDatabaseNPCsPopulator.cs`, 'utf8');
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
writeFileSync(`${ROOT}/game/src/data/vanilla-bestiary-spawn.json`, JSON.stringify(data));
console.error(`conditions: ${nCond} 条 / byNpc: ${Object.keys(byNpc).length} NPC / 条目: ${total}`);
console.error(`commonFilters: ${commonFilters.length} 条 / bgPreference: ${Object.keys(bgPreference).length} NPC / moonLord: [${moonLordBg}]`);
