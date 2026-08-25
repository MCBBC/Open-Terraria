// 从 Terarria1458 Item.cs SetDefaults1-5 逐物品提取【功能画像】→ vanilla-itemfunc.json。
// ★2026-08-25 用户令"以 1458 作为最新基准"：源 1456→1458（1458 SetDefaults 数值面
// 零变更——旧件终值应零 diff,新增件=6150-6185 块等 1458 新物品,此前整块漏提）。
// 用途：道具功能全量审计的"原版应有功能"基准（tools/item-audit.mjs 对照）。
// 提取字段（仅记非默认值）：
//   近战/远程/魔法/召唤旗、noMelee、damage、mana（耗魔）
//   工具：pick/axe/hammer（>0 即工具）
//   放置：createTile/createWall/placeStyle
//   消耗：consumable、potion、healLife/healMana、buffType（+buffTime 近似）
//   弹药：ammo/useAmmo/notAmmo、shoot、channel、autoReuse、holdStyle、torch
//   改向：useTurn（=1；全量归档自 extract-itemcombat.mjs 提取库，2026-08-17）
// 注意 case 归属 = 最近一层 switch(type)（嵌套 switch 陷阱同 extract-equip-prefix.mjs）。
// 2026-08-17 useTurn 叠加：全量归档来自 extract-itemcombat.mjs 三通道提取库（显式字面
// + DefaultTo* 辅助函数族 + 区间 if 块；Item.cs:170 默认 false——表内仅记 true=1）。
// 2026-08-25 DefaultTo 武器族展开（1458 Item.cs）：MagicWeapon/RangedWeapon/Bow/
//   Staff/Spear/ThrownWeapon——此前只认显式赋值,这些辅助函数族的 case（整块 615x）
//   全部漏提 → heldUseStyle 回退 useStyle 1（冰川之牙斜挥穿胸,用户实报）。
import { readFileSync, writeFileSync } from 'node:fs';
import { EXTRA_USETURN } from './extract-itemcombat.mjs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const itemSrc = readFileSync(`${ROOT}/Terarria1458/Terraria/Item.cs`, 'utf8');

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

/** case 段 → itemId: segment（最近一层 switch(type) 归属，嵌套 switch(type) 的内层标签才是物品 id） */
function collectCaseSegments(body, out) {
  const tokRe = /switch\s*\(([^)]*)\)|case (\d+):|default:|[{}]/g;
  const stack = [];
  let depth = 0, m;
  while ((m = tokRe.exec(body))) {
    const t = m[0];
    if (t.startsWith('switch')) {
      stack.push({ isType: /switch\s*\(\s*(?:type|currentItem\.type)\b/.test(t), opened: false, bodyDepth: -1, cur: null, segStart: 0 });
    } else if (t === '{') {
      depth++;
      const top = stack[stack.length - 1];
      if (top && !top.opened) { top.opened = true; top.bodyDepth = depth; top.segStart = m.index + 1; }
    } else if (t === '}') {
      const top = stack[stack.length - 1];
      if (top && top.opened && depth === top.bodyDepth) {
        if (top.isType && top.cur !== null) out.set(top.cur, body.slice(top.segStart, m.index));
        stack.pop();
      }
      depth--;
    } else {
      const top = stack[stack.length - 1];
      if (top && top.opened && top.isType) {
        if (top.cur !== null) out.set(top.cur, body.slice(top.segStart, m.index));
        top.cur = t === 'default:' ? null : +m[2];
        top.segStart = m.index + t.length;
      }
    }
  }
}

function outerCaseSegments(src) {
  const out = new Map();
  for (const n of [1, 2, 3, 4, 5]) {
    const body = methodBodyOf(src, `public void SetDefaults${n}(`)
      || methodBodyOf(src, `private void SetDefaults${n}(`)
      || methodBodyOf(src, `void SetDefaults${n}(`);
    if (body) collectCaseSegments(body, out);
  }
  return out;
}

const SEGS = outerCaseSegments(itemSrc);

// 字段正则表：[输出名, 正则, 类型]
const FIELDS = [
  ['melee', /melee = true;/, 'b'],
  ['ranged', /ranged = true;/, 'b'],
  ['magic', /magic = true;/, 'b'],
  ['summon', /summon = true;/, 'b'],
  ['noMelee', /noMelee = true;/, 'b'],
  ['consumable', /consumable = true;/, 'b'],
  ['potion', /potion = true;/, 'b'],
  ['channel', /channel = true;/, 'b'],
  ['autoReuse', /autoReuse = true;/, 'b'],
  ['torch', /torch = true;/, 'b'],
  ['expert', /expert = true;/, 'b'],
  ['questItem', /questItem = true;/, 'b'],
  ['damage', /\bdamage = (\d+);/, 'n'],
  ['mana', /\bmana = (\d+);/, 'n'],
  ['pick', /\bpick = (\d+);/, 'n'],
  ['axe', /\baxe = (\d+);/, 'n'],
  ['hammer', /\bhammer = (\d+);/, 'n'],
  ['createTile', /\bcreateTile = (\d+);/, 'n'],
  ['createWall', /\bcreateWall = (\d+);/, 'n'],
  ['placeStyle', /\bplaceStyle = (\d+);/, 'n'],
  ['healLife', /\bhealLife = (\d+);/, 'n'],
  ['healMana', /\bhealMana = (\d+);/, 'n'],
  ['buffType', /\bbuffType = (-?\d+);/, 'n'],
  ['buffTime', /\bbuffTime = (\d+);/, 'n'],
  ['ammo', /\bammo = (\d+);/, 'n'],
  ['useAmmo', /\buseAmmo = (\d+);/, 'n'],
  ['notAmmo', /notAmmo = true;/, 'b'],
  ['shoot', /\bshoot = (-?\d+);/, 'n'],
  ['holdStyle', /\bholdStyle = (\d+);/, 'n'],
  ['useStyle', /\buseStyle = (\d+);/, 'n'],
  ['knockBack', /\bknockBack = ([\d.]+)f;/, 'f'],
  ['fishingPole', /\bfishingPole = (\d+);/, 'n'],
  ['bait', /\bbait = (\d+);/, 'n'],
];

const FUNC = {};
/** DefaultTo 武器族基座（1458 Item.cs :48016/:48025/:48425-48470）：case 段内的
 *  辅助调用 → 基础字段（case 显式赋值随后在 FIELDS pass 覆盖——显式=终值）。
 *  · MagicWeapon(p,t,v[,autoReuse]) → useStyle5/magic/noMelee/shoot
 *  · RangedWeapon(p,ammo,t,v[,autoReuse]) → useStyle5/ranged/noMelee/shoot/useAmmo
 *  · Bow(t,v[,autoReuse]) = RangedWeapon(1,Arrow=1,…)（case 可覆写 shoot）
 *  · Staff(p,v,t,mana) = MagicWeapon(…,autoReuse:true)+mana（case 显式 mana 覆盖）
 *  · Spear(p,v,t) → useStyle5/melee+noMelee+noUseGraphic/shoot（投矛即弹体）
 *  · ThrownWeapon(p,t,v[,autoReuse]) → useStyle1/ranged/noMelee/consumable/shoot */
function defaultToBase(seg) {
  const f = {};
  const auto = (m) => (m[0].includes('true') ? 1 : undefined);
  let m;
  m = seg.match(/DefaultToMagicWeapon\(\s*(-?\d+)\s*,\s*\d+\s*,\s*[\d.]+f?(?:\s*,\s*(?:hasAutoReuse\s*:\s*)?true\s*)?\)/);
  if (m) { f.shoot = +m[1]; f.useStyle = 5; f.magic = 1; f.noMelee = 1; const a = auto(m); if (a) f.autoReuse = a; }
  m = seg.match(/DefaultToRangedWeapon\(\s*(-?\d+)\s*,\s*(\d+)\s*,\s*\d+\s*,\s*[\d.]+f?(?:\s*,\s*(?:hasAutoReuse\s*:\s*)?true\s*)?\)/);
  if (m) { f.shoot = +m[1]; f.useAmmo = +m[2]; f.useStyle = 5; f.ranged = 1; f.noMelee = 1; const a = auto(m); if (a) f.autoReuse = a; }
  m = seg.match(/DefaultToBow\(\s*\d+\s*,\s*[\d.]+f?(?:\s*,\s*(?:hasAutoReuse\s*:\s*)?true\s*)?\)/);
  if (m) { f.shoot = 1; f.useAmmo = 1; f.useStyle = 5; f.ranged = 1; f.noMelee = 1; const a = auto(m); if (a) f.autoReuse = a; }
  m = seg.match(/DefaultToStaff\(\s*(-?\d+)\s*,\s*[\d.]+f?\s*,\s*\d+\s*,\s*(\d+)\s*\)/);
  if (m) { f.shoot = +m[1]; f.useStyle = 5; f.magic = 1; f.noMelee = 1; f.autoReuse = 1; f.mana = +m[2]; }
  m = seg.match(/DefaultToSpear\(\s*(-?\d+)\s*,\s*[\d.]+f?\s*,\s*\d+\s*\)/);
  if (m) { f.shoot = +m[1]; f.useStyle = 5; f.melee = 1; f.noMelee = 1; f.noUseGraphic = 1; }
  m = seg.match(/DefaultToThrownWeapon\(\s*(-?\d+)\s*,\s*\d+\s*,\s*[\d.]+f?(?:\s*,\s*(?:hasAutoReuse\s*:\s*)?true\s*)?\)/);
  if (m) { f.shoot = +m[1]; f.useStyle = 1; f.ranged = 1; f.noMelee = 1; f.consumable = 1; const a = auto(m); if (a) f.autoReuse = a; }
  return f;
}
for (const [id, seg] of SEGS) {
  const f = defaultToBase(seg);
  for (const [name, re, type] of FIELDS) {
    const m = seg.match(re);
    if (!m) continue;
    f[name] = type === 'b' ? 1 : type === 'f' ? parseFloat(m[1]) : parseInt(m[1], 10);
  }
  if (Object.keys(f).length) FUNC[id] = f;
}
// 钓竿区段补丁：2290-2296 族在 case 段外的 type 区间块赋值（最近 switch 归属扫不到），
// 按源码实表补齐（Item.cs:23005-23040 前向扫描实证）。
for (const [id, pow] of Object.entries({ 2291: 15, 2293: 20, 2292: 30, 2295: 35, 2296: 40, 2294: 50 })) {
  FUNC[id] = { ...(FUNC[id] ?? {}), fishingPole: pow };
}
// 嵌套块首匹配错位补丁（collectCaseSegments 是文本段正则——嵌套 switch/`int num` 分支
// 里的同字段多赋值取首匹配；以下逐 case 按源码校对，2026-08-17 与提交态对账固化）：
//  · 2674-2676 诱饵三连（Item.cs:25851-25870 嵌套 switch：2675=30 / 2676=50 / default 2674=15，
//    首匹配把 2676 吃成 2675 的 30）
//  · 2001 蠕虫笼族（:21313-21350 `int num = type - 1994` 逐分支：num=7→25，
//    首匹配吃到 num=0 的 5）
//  · 2422 熔线钓钩（SetDefaults2 `if (type >= 2421 && type <= 2422)` 区间块，case 标签外
//    ——同 2291 族漏提形态；:23048-23066 `else` 分支 fishingPole 45（1405 同位 :25413 同读
//    45）。此前提交态手记 25 与两版反编译均不符，2026-08-17 按 1456 最终态校正；
//    melee/autoReuse 为旧手记误加，源块未设，随校正摘除）
for (const [id, patch] of Object.entries({
  2674: { bait: 15, consumable: 1 },
  2676: { bait: 50 },
  2001: { bait: 25 },
  2422: { fishingPole: 45 },
})) {
  FUNC[id] = { ...(FUNC[id] ?? {}), ...patch };
}
// SetDefaults 委托展开补丁（2026-08-25 r33 蓝队）：`SetDefaults3(N)`/`SetDefaults1(N)` 形态
// 的 case 段本体只有 type/glowMask/shoot 覆写，工具力/伤害面全在【被委托基底】的 case 段——
// 文本段正则解不开跨 case 继承，此前六件月主锯钻只提到 {shoot:N}（itemFuncTool 判空 →
// 不进工具分支 → combatWeapon 落 'shot' 兜底把持械弹当直飞箭弹）、九件月主挥砍件整条缺失
// （combat+func 双缺 → 左键纯摆动零伤零挖；red-team-r33 §三 P0-①②）。
// C# 语义 = 先跑完基底 case 全部赋值再执行本 case 覆写（type/shoot/glowMask），终值 =
// 基底终态 + 本段覆写。逐件按源码固化（值=基底 case 直赋实值，非推断）：
//  · 月主锯钻（1456 Item.cs :26571/:26577/:26598/:26604 + :31037/:31043；1457/1458 同位
//    :26572/:26578/:26599/:26605 + :31061/:31067，两版 diff=0 已对账）：
//    2778←2773+shoot429 / 2783←2773+431 / 3463←2773+610（axe27/dmg80/kb4）
//    2779←2774+shoot430 / 2784←2774+432 / 3464←2774+609（pick225/dmg50/kb0.5）
//  · 月主挥砍斧/锤/镐（:26566/:26583/:26588 + :31032/:31049/:31054）：
//    2777·2782·3462←2772（axe27/dmg100/kb6/autoReuse）/ 2780·2785·3465←2775
//    （hammer100/dmg110/kb7/useTurn）/ 2781·2786·3466←2776（pick225/dmg80/kb5.5/useTurn）
//  · 2209 超级治疗药水 healMana=400 为提交态历史手补（脚本直提 300——case 1933 段
//    healLife/healMana 双赋值取首匹配），随批固化防重跑回退。
const DELEGATE_EXPANSION = {
  2778: { melee: 1, noMelee: 1, channel: 1, damage: 80, axe: 27, useStyle: 5, knockBack: 4, shoot: 429 },
  2783: { melee: 1, noMelee: 1, channel: 1, damage: 80, axe: 27, useStyle: 5, knockBack: 4, shoot: 431 },
  3463: { melee: 1, noMelee: 1, channel: 1, damage: 80, axe: 27, useStyle: 5, knockBack: 4, shoot: 610 },
  2779: { melee: 1, noMelee: 1, channel: 1, damage: 50, pick: 225, useStyle: 5, knockBack: 0.5, shoot: 430 },
  2784: { melee: 1, noMelee: 1, channel: 1, damage: 50, pick: 225, useStyle: 5, knockBack: 0.5, shoot: 432 },
  3464: { melee: 1, noMelee: 1, channel: 1, damage: 50, pick: 225, useStyle: 5, knockBack: 0.5, shoot: 609 },
  2777: { melee: 1, autoReuse: 1, damage: 100, axe: 27, useStyle: 1, knockBack: 6 },
  2782: { melee: 1, autoReuse: 1, damage: 100, axe: 27, useStyle: 1, knockBack: 6 },
  3462: { melee: 1, autoReuse: 1, damage: 100, axe: 27, useStyle: 1, knockBack: 6 },
  2780: { melee: 1, autoReuse: 1, damage: 110, hammer: 100, useStyle: 1, knockBack: 7, useTurn: 1 },
  2785: { melee: 1, autoReuse: 1, damage: 110, hammer: 100, useStyle: 1, knockBack: 7, useTurn: 1 },
  3465: { melee: 1, autoReuse: 1, damage: 110, hammer: 100, useStyle: 1, knockBack: 7, useTurn: 1 },
  2781: { melee: 1, autoReuse: 1, damage: 80, pick: 225, useStyle: 1, knockBack: 5.5, useTurn: 1 },
  2786: { melee: 1, autoReuse: 1, damage: 80, pick: 225, useStyle: 1, knockBack: 5.5, useTurn: 1 },
  3466: { melee: 1, autoReuse: 1, damage: 80, pick: 225, useStyle: 1, knockBack: 5.5, useTurn: 1 },
  2209: { healMana: 400 },
};
for (const [id, expansion] of Object.entries(DELEGATE_EXPANSION)) {
  // 委托语义：基底字段打底、本 case 显式字段覆盖——现有条目（如六锯钻的 {shoot:N}）
  // 即"显式覆写"，展开值与之同键同值，直接整体赋终态。
  FUNC[id] = { ...(FUNC[id] ?? {}), ...expansion };
}

// ---- SetFoodDefaults（Item.cs:47653）：食物族走 SetDefaults 的 IsFood 分支直转此方法，
// SetDefaults1-5 扫不到——85 个 case 全靠此 switch 补。逐 case 解析
// DefaultToFood(w,h,buff,dur[,useGulpSound]) → buffType/buffTime/useStyle(2 咀嚼 | 9 仰饮)
// /consumable（DefaultToFood :48155 实体）；DefaultToHealingPotion（case 1912）→ 治疗。
// case 内显式赋值可覆盖（967/969 强制 useStyle=9；353 清酒 Ale holdStyle/ammo/notAmmo）。
{
  const foodSegs = new Map();
  const foodBody = methodBodyOf(itemSrc, 'private void SetFoodDefaults(');
  if (foodBody) collectCaseSegments(foodBody, foodSegs);
  const foodFunc = {};
  for (const [id, seg] of foodSegs) {
    const f = {};
    const dm = seg.match(/DefaultToFood\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)([^)]*)\)/);
    if (dm) {
      f.buffType = +dm[3];
      f.buffTime = +dm[4];
      // DefaultToFood：useGulpSound=true → useStyle 9（Item2/Item3 音效差异不在此表）
      f.useStyle = /useGulpSound\s*:\s*true/.test(dm[5]) ? 9 : 2;
      f.consumable = 1;
    }
    const dh = seg.match(/DefaultToHealingPotion\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (dh) {
      f.healLife = +dh[3];
      f.useStyle = 9;
      f.consumable = 1;
      f.potion = 1;
    }
    if (!Object.keys(f).length) continue;
    // case 段内显式赋值（仅 useStyle 允许覆盖解析值；其余字段并集）
    for (const [name, re, type] of FIELDS) {
      if (f[name] !== undefined && name !== 'useStyle') continue;
      const m = seg.match(re);
      if (!m) continue;
      f[name] = type === 'b' ? 1 : type === 'f' ? parseFloat(m[1]) : parseInt(m[1], 10);
    }
    foodFunc[id] = f;
  }
  for (const [id, f] of Object.entries(foodFunc)) {
    FUNC[id] = { ...(FUNC[id] ?? {}), ...f };
  }
  console.error(`foodfunc: ${Object.keys(foodFunc).length} 件（SetFoodDefaults）`);
}
// useTurn 全量叠加（只在已有条目上补键，不新增 id）：EXTRA_USETURN 含 SetDefaults1-5
// case 显式 + DefaultToPlaceableTile/Wall/Torch/Food/HealingPotion/CapturedCritter/MusicBox
// 等辅助函数族 + 区间 if 块 + 委托继承 + SetFoodDefaults 食物族
{
  let n = 0;
  for (const [id, f] of Object.entries(FUNC)) {
    if (EXTRA_USETURN.get(Number(id)) === true) { f.useTurn = 1; n++; }
  }
  console.error(`useTurn=1: ${n} 件（EXTRA_USETURN 全量 ${EXTRA_USETURN.size}）`);
}
writeFileSync(`${ROOT}/game/src/data/vanilla-itemfunc.json`, JSON.stringify(FUNC));
console.error(`itemfunc: ${Object.keys(FUNC).length} 件`);
const stats = {};
for (const f of Object.values(FUNC)) {
  for (const k of Object.keys(f)) stats[k] = (stats[k] ?? 0) + 1;
}
console.error(JSON.stringify(stats));
