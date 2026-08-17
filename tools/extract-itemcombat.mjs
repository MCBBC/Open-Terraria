// 从 Terarria1456 Item.cs 提取物品战斗数据（SetDefaults 主 switch + SetDefaults1/2/3 分段 switch）。
// case 块内深度 1 赋值；SetDefaultsN(M) 委托块继承 M 记录后覆盖。输出 src/data/vanilla-itemcombat.json
//
// 2026-08-17 三通道扩展（本文件同时是提取库，供 extract-itemfunc.mjs 叠加 useTurn）：
//   · useTurn / noUseGraphic 进 BOOL_FIELDS（显式字面 + DefaultTo* 辅助函数体归档语义，
//     Item.cs:170 字段默认 false；DefaultToFood :48166 / DefaultToHealingPotion :48185 /
//     DefaultToPlaceableTile :48101+:48106 / DefaultToPlaceableWall :48017 / DefaultToTorch :48083 /
//     DefaultToCapturedCritter :47613 隐式 useTurn=true；DefaultToBomb :47399 / DefaultToWhip :47439 /
//     DefaultToSpear :47637 / DefaultToCapturedCritter 隐式 noUseGraphic=true）
//   · UseSound 侧道（不入 combat 记录）→ 重生成 src/data/vanilla-itemusesound.json
//     （SetFoodDefaults 食物族 DefaultToFood Item2/3 + DefaultToStaff Item43 / DefaultToWhip Item152 等）
//   · SetFoodDefaults 仅作三通道来源（食物条目不进 combat 表，useTurn/useSound 走侧道）
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = process.argv.includes('--audit'); // 自审计模式:不写文件,stdout 出 JSON 摘要
const src = readFileSync(`${ROOT}/Terarria1456/Terraria/Item.cs`, 'utf8');

// ---- 方法体切片（配平花括号） ----
function methodBody(name) {
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
const bodies = [
  methodBody('public void SetDefaults(int Type'),
  methodBody('public void SetDefaults1(int type)'),
  methodBody('public void SetDefaults2(int type)'),
  methodBody('public void SetDefaults3(int type)'),
  methodBody('public void SetDefaults4(int type)'),
  methodBody('public void SetDefaults5(int type)'),
];

// ---- switch-case 块拆分 ----
// 支持两类 1456 惯用法：
//  ① case 贯穿组（悠悠球 3274-3292：`case A: case B: ... <共享体>`）——
//     相邻 case 标签之间只有空白/注释则并入同组，共享体赋给组内全部 id；
//  ② 块内嵌套 `switch (type)`（贯穿组内按 id 二次覆盖 damage/knockBack/shoot 等）——
//     嵌套 case 块的深度 1（相对嵌套 switch）赋值按其自身 id 合并进全局表
// 注意：case 标签过滤——嵌套 switch 内部的 `case N:` 不算外层组（否则其块会覆盖
// 同 id 组首的 groupShared 共享体，悠悠球 3262 曾被内层 case 覆盖成 damage/shoot 小记录）
function switchSpans(body) {
  const spans = [];
  const re = /\bswitch\s*\(/g;
  let m;
  while ((m = re.exec(body))) {
    const open = body.indexOf('{', m.index);
    if (open < 0) continue;
    let depth = 0, close = open;
    for (let i = open; i < body.length; i++) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    // 关键字处花括号深度（方法体语句 = 0 → 顶层 switch；case 块内 = ≥1 → 嵌套）
    let d0 = 0;
    for (let i = 0; i < m.index; i++) {
      if (body[i] === '{') d0++;
      else if (body[i] === '}') d0--;
    }
    spans.push({ start: m.index, open, close, depth: d0 });
  }
  return spans;
}
function parseSwitch(body) {
  const out = [];
  const spans = switchSpans(body);
  const isNestedCase = (pos) => {
    let inner = null;
    for (const s of spans) {
      if (s.open < pos && pos < s.close && (!inner || s.open > inner.open)) inner = s;
    }
    return !!inner && inner.depth > 0;
  };
  const caseRe = /\bcase (\d+):/g;
  let m;
  const marks = [];
  while ((m = caseRe.exec(body))) {
    if (!isNestedCase(m.index)) marks.push([+m[1], m.index]);
  }
  let k = 0;
  while (k < marks.length) {
    // 收集贯穿组：当前 case 的冒号到下一个 case 标签之间只有空白/注释
    const group = [marks[k][0]];
    let end = k + 1 < marks.length ? marks[k + 1][1] : body.length;
    while (k + 1 < marks.length) {
      const afterColon = body.indexOf(':', marks[k][1]) + 1;
      const between = body.slice(afterColon, marks[k + 1][1]);
      if (between.trim().length > 0 && !/^[\s/*]+$/.test(between)) break;
      group.push(marks[k + 1][0]);
      k++;
      end = k + 1 < marks.length ? marks[k + 1][1] : body.length;
    }
    const start = body.indexOf(':', marks[k][1]) + 1;
    out.push({ ids: group, block: body.slice(start, end) });
    k++;
  }
  return out;
}

/** 块内嵌套纯 type 条件 if 的覆盖条目（id → 块）。
 *  1456 惯用法:case 贯穿组共享体 + 嵌套条件二次覆盖——
 *  `if (type == K) {…}`（链锤 5012 组共享 shoot=947、内层覆盖 948,曾漏提）
 *  及区间/复合 OR 形态（通配:平衡括号取条件,纯 type 布尔式逐 id 求值）。*/
function nestedTypeIfCases(block) {
  const out = [];
  const re = /(?:else\s+)?if\s*\(/g;
  let m;
  while ((m = re.exec(block))) {
    // 平衡括号取条件
    let d = 0, condEnd = -1;
    for (let i = m.index + m[0].length - 1; i < block.length; i++) {
      if (block[i] === '(') d++;
      else if (block[i] === ')') { d--; if (d === 0) { condEnd = i + 1; break; } }
    }
    if (condEnd < 0) break;
    const cond = block.slice(m.index + m[0].length - 1, condEnd);
    if (/\bType\b/.test(cond)) { re.lastIndex = condEnd; continue; }
    const stripped = cond.replace(/\btype\b/g, '');
    if (!/^[\s\d()&|=<>!*]+$/.test(stripped)) { re.lastIndex = condEnd; continue; }
    let fn;
    try { fn = new Function('type', `return (${cond});`); } catch { re.lastIndex = condEnd; continue; }
    const braceAt = block.indexOf('{', condEnd);
    if (braceAt < 0 || block.slice(condEnd, braceAt).trim() !== '') { re.lastIndex = condEnd; continue; }
    let depth = 0, close = braceAt;
    for (let i = braceAt; i < block.length; i++) {
      if (block[i] === '{') depth++;
      else if (block[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    const inner = block.slice(braceAt + 1, close);
    for (let id = 0; id <= 5500; id++) {
      let hit = false;
      try { hit = !!fn(id); } catch { hit = false; }
      if (hit) out.push({ id, block: inner });
    }
    re.lastIndex = close + 1;
  }
  return out;
}

/** 块内嵌套 switch(type) 的 case 条目（id → 块） */
function nestedSwitchCases(block) {
  const out = [];
  const re = /switch\s*\(\s*type\s*\)/gi;
  let m;
  while ((m = re.exec(block))) {
    const open = block.indexOf('{', m.index);
    if (open < 0) continue;
    let depth = 0, close = open;
    for (let i = open; i < block.length; i++) {
      if (block[i] === '{') depth++;
      else if (block[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    const inner = block.slice(open + 1, close);
    const caseRe2 = /\bcase (\d+):/g;
    const marks2 = [];
    let m2;
    while ((m2 = caseRe2.exec(inner))) marks2.push([+m2[1], m2.index]);
    for (let j = 0; j < marks2.length; j++) {
      const s2 = inner.indexOf(':', marks2[j][1]) + 1;
      const e2 = j + 1 < marks2.length ? marks2[j + 1][1] : inner.length;
      out.push({ id: marks2[j][0], block: inner.slice(s2, e2) });
    }
  }
  return out;
}

// ---- 块内深度 1 赋值（switch 内语句深度 0） ----
const depth1Lines = (block) => {
  const out = [];
  let depth = 0;
  for (const raw of block.split('\n')) {
    const opens = (raw.match(/\{/g) || []).length;
    const closes = (raw.match(/\}/g) || []).length;
    if (depth === 0 && opens === 0) out.push(raw.trim());
    depth += opens - closes;
    if (depth < 0) depth = 0;
  }
  return out;
};

/** 剥掉 case 体最外层花括号（`case 2001: { … break; }` 带局部变量的解编译形态，
 *  depth1Lines 会整块跳过——三通道归档时剥一层再扫；legacy 字段提取保持原行为防漂移） */
const stripOuterBrace = (block) => {
  const open = block.indexOf('{');
  if (open < 0) return block;
  if (block.slice(0, open).trim() !== '') return block;
  let depth = 0;
  for (let i = open; i < block.length; i++) {
    if (block[i] === '{') depth++;
    else if (block[i] === '}') {
      depth--;
      if (depth === 0) return block.slice(open + 1, i) + block.slice(i + 1);
    }
  }
  return block;
};

// ---- DefaultTo* 辅助函数归档语义（三通道）----
// 扫全部方法体里 useTurn / noUseGraphic / UseSound 的字面赋值 → 名字 → 效果表；
// 委托链（DefaultToStaff→DefaultToMagicWeapon / DefaultToBow→DefaultToRangedWeapon）
// 两轮迭代收敛。SetDefaults*/SetFoodDefaults/ResetStats/netDefaults 是分发器非族辅助，
// 显式排除（委托走既有 delegates 通道）。
const HELPER_EXCLUDE = new Set(['SetDefaults', 'SetDefaults1', 'SetDefaults2', 'SetDefaults3',
  'SetDefaults4', 'SetDefaults5', 'SetFoodDefaults', 'ResetStats', 'netDefaults']);
function scanHelperEffects() {
  const effects = new Map(); // name -> { useTurn?, noUseGraphic?, useSound?, soundNull? }
  const calls = new Map();   // name -> [callee names]
  const declRe = /\b(?:public|private|internal|protected)\s+(?:static\s+)?[\w<>\[\], .?]+\s+(\w+)\s*\([^;{)]*\)?\s*(?:\r?\n)?\s*\{/g;
  let m;
  while ((m = declRe.exec(src))) {
    const name = m[1];
    // 从声明处配平取方法体
    const start = src.indexOf('{', m.index);
    let depth = 0, end = -1;
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    const body = src.slice(start + 1, end);
    declRe.lastIndex = end + 1;
    const eff = {};
    const ut = body.match(/useTurn = (true|false);/);
    if (ut) eff.useTurn = ut[1] === 'true';
    const ng = body.match(/noUseGraphic = (true|false);/);
    if (ng) eff.noUseGraphic = ng[1] === 'true';
    const us = body.match(/UseSound = (SoundID\.\w+|null);/);
    if (us) eff.useSound = us[1] === 'null' ? null : soundNameOf(us[1]);
    if (Object.keys(eff).length) effects.set(name, eff);
    if (/DefaultTo|SetWeaponValues|SetShopValues|MakeUsable/.test(name)) {
      calls.set(name, [...body.matchAll(/\b([A-Z]\w+)\s*\(/g)].map((c) => c[1]));
    }
  }
  // 委托收敛（2 轮足够：DefaultToStaff→DefaultToMagicWeapon 深度 ≤2）
  for (let round = 0; round < 2; round++) {
    for (const [name, callees] of calls) {
      for (const callee of callees) {
        const eff = effects.get(callee);
        if (!eff || HELPER_EXCLUDE.has(callee)) continue;
        const own = effects.get(name) ?? {};
        let changed = false;
        for (const [k, v] of Object.entries(eff)) {
          if (own[k] === undefined) { own[k] = v; changed = true; }
        }
        if (changed) effects.set(name, own);
      }
    }
  }
  for (const n of HELPER_EXCLUDE) effects.delete(n);
  return effects;
}

/** SoundID 表达式 → 表值（SoundID.Item76 → "Item_76"；命名轨保留原名） */
function soundNameOf(expr) {
  const im = expr.match(/^SoundID\.Item(\d+)$/);
  if (im) return `Item_${im[1]}`;
  const nm = expr.match(/^SoundID\.(\w+)$/);
  return nm ? nm[1] : undefined;
}

const HELPER_EFFECTS = scanHelperEffects();

const NUM_FIELDS = ['damage', 'knockBack', 'useTime', 'useAnimation', 'shoot', 'useAmmo', 'shootSpeed', 'ammo', 'maxStack', 'crit', 'scale', 'mana'];
// AmmoID.* 枚举引用（AmmoID.cs:112-146 全表——曾缺 9 项致 Flare/Snowball/StyngerBolt/
// CandyCorn/JackOLantern/Stake/NailFriendly/FallenStar/Acorn 全落 -1 假数据，2026-08-15 补全）
const AMMO_ID = {
  None: 0, Gel: 23, Arrow: 40, Coin: 71, FallenStar: 75, Bullet: 97, Sand: 169,
  Dart: 283, Rocket: 771, Solution: 780, Flare: 931, Snowball: 949, StyngerBolt: 1261,
  CandyCorn: 1783, JackOLantern: 1785, Stake: 1836, NailFriendly: 3108, Acorn: 27,
};
// 2026-08-17 新增两布尔（全量归档语义：显式字面 + 辅助函数族批量）
const BOOL_FIELDS = ['consumable', 'noMelee', 'autoReuse', 'melee', 'ranged', 'magic', 'summon',
  'useTurn', 'noUseGraphic'];

/** 深度 0 行里的辅助函数调用效果（显式赋值优先——源序近似：case 体先 DefaultTo*
 *  后覆盖的常态成立；DefaultToFood 的 useGulpSound 具名参数改写音效） */
function helperEffectsOf(lines) {
  const eff = {};
  for (const l of lines) {
    const cm = l.match(/^(DefaultTo\w+|MakeUsable\w+|SetShopValues|SetWeaponValues)\s*\(/);
    if (!cm) continue;
    const h = HELPER_EFFECTS.get(cm[1]);
    if (!h) continue;
    for (const [k, v] of Object.entries(h)) {
      if (eff[k] === undefined) eff[k] = v;
    }
    // DefaultToFood 的 if/else 双分支在体内首匹配会拿到 if 支 Item3（:48161-48168）——
    // 具名参数定真值：useGulpSound:true → Item3（仰饮），否则 Item2（咀嚼）
    if (cm[1] === 'DefaultToFood') {
      eff.useSound = /useGulpSound\s*:\s*true/.test(l) ? 'Item_3' : 'Item_2';
    }
  }
  return eff;
}

/** UseSound 侧道：显式行（后写者胜）> 辅助函数效果；undefined = 本块未涉及 */
function soundOfLines(lines) {
  let sound;
  for (const l of lines) {
    const m = l.match(/^UseSound = (SoundID\.\w+|null);/);
    if (m) sound = m[1] === 'null' ? null : soundNameOf(m[1]);
  }
  if (sound !== undefined) return sound;
  const eff = helperEffectsOf(lines);
  return eff.useSound;
}

const literal = new Map(); // id -> rec（字面 case）
const delegates = [];      // id, targetId, rec, sound
const groupShared = new Map(); // 组首 id → 共享体字段（goto case 别名族回补用）
const groupSharedSound = new Map(); // 组首 id → 共享体 UseSound（同上）
const SOUND = new Map();   // id → UseSound 表值（null = 显式静音，写表时剔除）
function fieldsFromLines(id, lines) {
  const rec = {};
  for (const f of NUM_FIELDS) {
    // 表达式形如 `shoot = 541 + type - 3278;`（悠悠球族批量投射物）——按 id 求值
    const eLine = lines.find((l) => new RegExp(`^${f} = (-?\\d+)\\s*\\+\\s*type\\s*-\\s*(\\d+);`).test(l));
    if (eLine) {
      const em = eLine.match(new RegExp(`^${f} = (-?\\d+)\\s*\\+\\s*type\\s*-\\s*(\\d+);`));
      rec[f] = Number(em[1]) + id - Number(em[2]);
      continue;
    }
    const line = lines.find((l) => new RegExp(`^${f} = -?[\\d.]+f?;`).test(l) || (f === 'useAmmo' && /^useAmmo = AmmoID\.\w+;/.test(l)) || (f === 'ammo' && /^ammo = AmmoID\.\w+;/.test(l)));
    if (!line) continue;
    const am = line.match(/AmmoID\.(\w+)/);
    rec[f] = am ? (AMMO_ID[am[1]] ?? -1) : parseFloat(line.match(/-?[\d.]+/)[0]);
  }
  for (const f of BOOL_FIELDS) {
    if (lines.some((l) => l === `${f} = true;`)) rec[f] = true;
    else if (lines.some((l) => l === `${f} = false;`)) rec[f] = false;
  }
  // 辅助函数族效果：显式行在场则显式胜（DefaultToPlaceableTile 后再 useTurn=false 之类）
  const eff = helperEffectsOf(lines);
  for (const [k, v] of Object.entries(eff)) {
    if (typeof v === 'boolean' && rec[k] === undefined) rec[k] = v;
  }
  return rec;
}
function applyRec(id, lines) {
  const rec = fieldsFromLines(id, lines);
  const sound = soundOfLines(lines);
  if (sound !== undefined) SOUND.set(id, sound);
  if (!Object.keys(rec).length && sound === undefined) return;
  const dl = lines.find((l) => /^SetDefaults\d?\(\d+\);/.test(l));
  if (dl) {
    // ★targetId 取括号内模板号（`/\d+/` 会先抓到 SetDefaultsN 的方法号 N——
    //   七金属短剑 SetDefaults1(6) 曾全部继承成 item 1(铁镐)的基底,
    //   autoReuse:true/shootSpeed 缺即此坑,2026-08-13"铜剑变投掷"根因链）
    delegates.push({ id, targetId: parseInt(dl.match(/\((\d+)\)/)[1], 10), rec, sound });
    return;
  }
  // 同 id 多处赋值（分段 switch/嵌套覆盖可能重复）：合并（后者覆盖）
  if (Object.keys(rec).length) literal.set(id, { ...(literal.get(id) || {}), ...rec });
}
for (const body of bodies) {
  for (const { ids, block } of parseSwitch(body)) {
    const lines = depth1Lines(block);
    const shared = fieldsFromLines(ids[0], lines);
    if (Object.keys(shared).length) groupShared.set(ids[0], shared);
    const sharedSound = soundOfLines(lines);
    if (sharedSound !== undefined) groupSharedSound.set(ids[0], sharedSound);
    // 贯穿组：共享体赋给组内全部 id
    for (const id of ids) applyRec(id, lines);
    // 嵌套 switch(type)：按其自身 id 合并（悠悠球 per-id damage/shoot 在这里）
    for (const { id, block: nb } of nestedSwitchCases(block)) {
      applyRec(id, depth1Lines(nb));
    }
    // 嵌套 `if (type == K)` 单守卫覆盖：仅守卫 id 属于本 case 组才合并
    //（防跨组污染;else 分支体不归属任何 id,跳过）
    for (const { id, block: nb } of nestedTypeIfCases(block)) {
      if (!ids.includes(id)) continue;
      applyRec(id, depth1Lines(nb));
    }
  }
  // `default: if (type < A || type > B) break; goto case T;` —— 区间 A..B 别名进 T 组
  //（悠悠球 3315-3317 goto case 3262：吃 T 组共享体 + 自身嵌套 case 覆盖）
  for (const gm of body.matchAll(/if\s*\(type\s*<\s*(\d+)\s*\|\|\s*type\s*>\s*(\d+)\)\s*\{\s*break;\s*\}\s*goto\s+case\s*(\d+);/g)) {
    const [lo, hi, target] = [+gm[1], +gm[2], +gm[3]];
    const shared = groupShared.get(target) || groupShared.get([...groupShared.keys()].find((k) => Math.abs(k - target) < 30)) || null;
    if (!shared) continue;
    const sharedSound = groupSharedSound.get(target) ?? groupSharedSound.get([...groupSharedSound.keys()].find((k) => Math.abs(k - target) < 30)) ?? undefined;
    for (let id = lo; id <= hi; id++) {
      literal.set(id, { ...shared, ...(literal.get(id) || {}) });
      if (!SOUND.has(id) && sharedSound !== undefined) SOUND.set(id, sharedSound);
    }
  }
}

// ---- default: 兜底臂守卫链补扫（三通道专用，legacy 字段不走此路防漂移）----
// 1456 惯用法：default 臂内 `if (type < A || type > B) { switch… / if (type >= X && type <= Y) {…} }`
// 守卫链——主循环把 default 臂并入末 case 组，nestedTypeIfCases 的 ids.includes 守卫
// 会拒收区间 id（墙族 2652-2690 / 旗帜床单族等整段缺失）。case 命中的 id 不走 default 臂
// （互斥路径），故此处"仅补空不覆盖"无冲突。
/** 纯 type 条件 if 块深度枚举（对 matched 体递归下钻——守卫 if 的体里还叠着
 *  switch+if 链，非递归扫会整段跳过；非纯条件体不跳过、靠正则自然穿过） */
function typeIfBlocksDeep(text, out) {
  const re = /(?:else\s+)?if\s*\(/g;
  let m;
  while ((m = re.exec(text))) {
    let d = 0, condEnd = -1;
    for (let i = m.index + m[0].length - 1; i < text.length; i++) {
      if (text[i] === '(') d++;
      else if (text[i] === ')') { d--; if (d === 0) { condEnd = i + 1; break; } }
    }
    if (condEnd < 0) break;
    const cond = text.slice(m.index + m[0].length - 1, condEnd);
    if (/\bType\b/.test(cond)) { re.lastIndex = condEnd; continue; }
    const stripped = cond.replace(/\btype\b/g, '');
    if (!/^[\s\d()&|=<>!*]+$/.test(stripped)) { re.lastIndex = condEnd; continue; }
    let fn;
    try { fn = new Function('type', `return (${cond});`); } catch { re.lastIndex = condEnd; continue; }
    const braceAt = text.indexOf('{', condEnd);
    if (braceAt < 0 || text.slice(condEnd, braceAt).trim() !== '') { re.lastIndex = condEnd; continue; }
    let depth = 0, close = braceAt;
    for (let i = braceAt; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    const inner = text.slice(braceAt + 1, close);
    out.push({ fn, inner });
    typeIfBlocksDeep(inner, out);
    re.lastIndex = close + 1;
  }
}
for (const body of bodies) {
  const blocks = [];
  typeIfBlocksDeep(body, blocks);
  for (const { fn, inner } of blocks) {
    const lines = depth1Lines(stripOuterBrace(inner));
    const eff = helperEffectsOf(lines);
    const explicit = (f) => (lines.includes(`${f} = true;`) ? true : lines.includes(`${f} = false;`) ? false : undefined);
    const ut = explicit('useTurn') ?? eff.useTurn;
    const ng = explicit('noUseGraphic') ?? eff.noUseGraphic;
    const snd = soundOfLines(lines);
    if (ut === undefined && ng === undefined && snd === undefined) continue;
    for (let id = 0; id <= 5500; id++) {
      let hit = false;
      try { hit = !!fn(id); } catch { hit = false; }
      if (!hit) continue;
      const cur = literal.get(id);
      if (cur === undefined) {
        const rec = {};
        if (ut !== undefined) rec.useTurn = ut;
        if (ng !== undefined) rec.noUseGraphic = ng;
        if (Object.keys(rec).length) literal.set(id, rec);
        if (snd !== undefined) SOUND.set(id, snd);
      } else {
        if (ut !== undefined && cur.useTurn === undefined) cur.useTurn = ut;
        if (ng !== undefined && cur.noUseGraphic === undefined) cur.noUseGraphic = ng;
        if (snd !== undefined && !SOUND.has(id)) SOUND.set(id, snd);
      }
    }
  }
}

// ---- 守卫补集尾段（guard complement）补丁 ----
// SetDefaults3 `if (type < 2192 || type > 2198) { 守卫链 }` 尾段（Item.cs:27602-27630）
// 为守卫补集服务：2192-2198（遗物族,守卫外直落尾段）+ 2203/2204（守卫内 case 空组
// break 贯穿到尾段）吃 `useTurn = true`。全文件仅此一处守卫+尾段带三通道
// （SetDefaults4 3315-3317 是 goto case 别名,走既有别名通道），按源码固化。
for (const id of [2192, 2193, 2194, 2195, 2196, 2197, 2198, 2203, 2204]) {
  const cur = literal.get(id);
  if (cur === undefined) literal.set(id, { useTurn: true });
  else if (cur.useTurn === undefined) cur.useTurn = true;
}

// ---- SetFoodDefaults（Item.cs:47653）：仅三通道（食物族不进 combat 表，
//      useTurn=true（DefaultToFood/DefaultToHealingPotion）与 UseSound Item2/3 走侧道）----
const FOOD_USETURN = new Map();
{
  const foodBody = methodBody('private void SetFoodDefaults(');
  for (const { ids, block } of parseSwitch(foodBody)) {
    const lines = depth1Lines(stripOuterBrace(block));
    const eff = helperEffectsOf(lines);
    const sound = soundOfLines(lines);
    // 显式 useTurn/noUseGraphic 行可覆盖辅助效果
    if (lines.includes('useTurn = true;')) eff.useTurn = true;
    if (lines.includes('useTurn = false;')) eff.useTurn = false;
    if (lines.includes('noUseGraphic = true;')) eff.noUseGraphic = true;
    for (const id of ids) {
      if (eff.useTurn === true) FOOD_USETURN.set(id, true);
      if (sound !== undefined && !SOUND.has(id)) SOUND.set(id, sound);
    }
  }
}

// ---- 委托合并（迭代至收敛，处理委托链） ----
// 与既有记录合并（非覆盖）：goto 别名族/嵌套 case 先写入的字段不能被委托基底冲掉
const data = new Map(literal);
for (let round = 0; round < 4; round++) {
  for (const d of delegates) {
    const base = data.get(d.targetId);
    if (base) data.set(d.id, { ...data.get(d.id), ...base, ...d.rec });
    if (d.sound === undefined && SOUND.has(d.targetId)) SOUND.set(d.id, SOUND.get(d.targetId));
  }
}

export const EXTRA_USETURN = (() => {
  const m = new Map(FOOD_USETURN);
  for (const [id, rec] of data) if (rec.useTurn === true) m.set(id, true);
  return m;
})();

// ---- 自审计(--audit):与提取同源,防"提取器坏了但没人发现"(2026-08-13 targetId
//      错基底=铜剑丢出去,曾静默 44/2612 件错数据) ----
function main() {
  // 委托异常检测:X-01 自委托 / X-02 target 无字面记录 / X-03 链深>2 /
  // X-04 委托数基数护栏(解析器结构漂移后委托静默归零=bug#2 发生机制)
  const audit = [];
  for (const d of delegates) {
    if (d.id === d.targetId) audit.push({ kind: 'self-delegate', id: d.id, target: d.targetId });
    if (!literal.has(d.targetId)) audit.push({ kind: 'unresolved-target', id: d.id, target: d.targetId });
  }
  if (delegates.length < 20) audit.push({ kind: 'delegate-count-below-floor', delegates: delegates.length });
  // X-05/X-06/X-07:三通道基数护栏（解析结构漂移后新列静默归零=半坏状态无人察觉）
  let useTurnTrue = 0, noUseGraphicTrue = 0;
  for (const rec of data.values()) {
    if (rec.useTurn === true) useTurnTrue++;
    if (rec.noUseGraphic === true) noUseGraphicTrue++;
  }
  if (useTurnTrue < 1300) audit.push({ kind: 'useturn-below-floor', count: useTurnTrue });
  if (noUseGraphicTrue < 180) audit.push({ kind: 'nousegraphic-below-floor', count: noUseGraphicTrue });
  const soundEntries = [...SOUND.entries()].filter(([, v]) => v !== null && v !== undefined);
  if (soundEntries.length < 550) audit.push({ kind: 'usesound-below-floor', count: soundEntries.length });

  const obj = {};
  for (const [k, v] of data) obj[k] = v;
  if (AUDIT) {
    const summary = {
      items: data.size,
      delegates: delegates.length,
      useTurnTrue,
      noUseGraphicTrue,
      useSoundEntries: soundEntries.length,
      edges: delegates.slice(0, 30).map((d) => ({ id: d.id, target: d.targetId })),
      anomalies: audit,
      // 钉死 id 的收敛记录(bug#2 回归锁数据面:3507 铜短剑须带 shoot 938/noMelee/
      // autoReuse false;错取 targetId=1 铁镐时 autoReuse:true 且无 shoot,必翻)
      pinned: Object.fromEntries(['3507', '3509', '1', '99', '40'].map((k) => [k, obj[k] ?? null])),
    };
    process.stdout.write(JSON.stringify(summary));
    process.exit(audit.length ? 1 : 0);
  }
  writeFileSync(`${ROOT}/game/src/data/vanilla-itemcombat.json`, JSON.stringify(obj));
  // UseSound 全量表（Item_N / 命名轨；null 显式静音剔除）
  {
    const out = {};
    for (const [id, v] of SOUND) {
      if (v === null || v === undefined) continue;
      out[id] = v;
    }
    writeFileSync(`${ROOT}/game/src/data/vanilla-itemusesound.json`, JSON.stringify(out));
  }
  const bows = [...data.values()].filter((v) => v.useAmmo === 40);
  const arrows = [...data.values()].filter((v) => v.ammo === 40);
  console.error(`共 ${data.size} 物品 / 弓类 ${bows.length} / 箭类 ${arrows.length}`);
  console.error(`useTurn=true ${useTurnTrue} 件 / noUseGraphic=true ${noUseGraphicTrue} 件 / UseSound ${soundEntries.length} 件`);
  console.error('木弓(99):', JSON.stringify(obj['99']));
  console.error('木箭(40):', JSON.stringify(obj['40']));
  console.error('火焰箭(41):', JSON.stringify(obj['41']));
}
// 库模式守卫：被 extract-itemfunc.mjs import 时只暴露 EXTRA_USETURN，不写文件不出审计
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
