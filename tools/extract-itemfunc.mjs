// 从 Terarria1456 Item.cs SetDefaults1-5 逐物品提取【功能画像】→ vanilla-itemfunc.json。
// 用途：道具功能全量审计的"原版应有功能"基准（tools/item-audit.mjs 对照）。
// 提取字段（仅记非默认值）：
//   近战/远程/魔法/召唤旗、noMelee、damage、mana（耗魔）
//   工具：pick/axe/hammer（>0 即工具）
//   放置：createTile/createWall/placeStyle
//   消耗：consumable、potion、healLife/healMana、buffType（+buffTime 近似）
//   弹药：ammo/useAmmo/notAmmo、shoot、channel、autoReuse、holdStyle、torch
// 注意 case 归属 = 最近一层 switch(type)（嵌套 switch 陷阱同 extract-equip-prefix.mjs）。
import { readFileSync, writeFileSync } from 'node:fs';

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
function outerCaseSegments(src) {
  const out = new Map();
  const collect = (body) => {
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
  };
  for (const n of [1, 2, 3, 4, 5]) {
    const body = methodBodyOf(src, `public void SetDefaults${n}(`)
      || methodBodyOf(src, `private void SetDefaults${n}(`)
      || methodBodyOf(src, `void SetDefaults${n}(`);
    if (body) collect(body);
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
writeFileSync(`${ROOT}/game/src/data/vanilla-itemfunc.json`, JSON.stringify(FUNC));
console.error(`itemfunc: ${Object.keys(FUNC).length} 件`);
const stats = {};
for (const f of Object.values(FUNC)) {
  for (const k of Object.keys(f)) stats[k] = (stats[k] ?? 0) + 1;
}
console.error(JSON.stringify(stats));
