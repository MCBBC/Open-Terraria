// 从 Terarria1456 Item.cs SetDefaults1-5 逐物品提取【功能画像】→ vanilla-itemfunc.json。
// 用途：道具功能全量审计的"原版应有功能"基准（tools/item-audit.mjs 对照）。
// 提取字段（仅记非默认值）：
//   近战/远程/魔法/召唤旗、noMelee、damage、mana（耗魔）
//   工具：pick/axe/hammer（>0 即工具）
//   放置：createTile/createWall/placeStyle
//   消耗：consumable、potion、healLife/healMana、buffType（+buffTime 近似）
//   弹药：ammo/useAmmo/notAmmo、shoot、channel、autoReuse、holdStyle、torch
// 注意 case 归属 = 最近一层 switch(type)（嵌套 switch 陷阱同 extract-equip-prefix.mjs）。
// 2026-08-17 useTurn 叠加：全量归档来自 extract-itemcombat.mjs 三通道提取库（显式字面
// + DefaultTo* 辅助函数族 + 区间 if 块；Item.cs:170 默认 false——表内仅记 true=1）。
import { readFileSync, writeFileSync } from 'node:fs';
import { EXTRA_USETURN } from './extract-itemcombat.mjs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const itemSrc = readFileSync(`${ROOT}/Terarria1456/Terraria/Item.cs`, 'utf8');

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
for (const [id, seg] of SEGS) {
  const f = {};
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
