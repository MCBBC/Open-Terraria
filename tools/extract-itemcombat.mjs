// 从 Terarria1456 Item.cs 提取物品战斗数据（SetDefaults 主 switch + SetDefaults1/2/3 分段 switch）。
// case 块内深度 1 赋值；SetDefaultsN(M) 委托块继承 M 记录后覆盖。输出 src/data/vanilla-itemcombat.json
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
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

/** 块内嵌套 `if (type == N) {…}` 单守卫覆盖条目（id → 块）。
 *  1456 惯用法:case 贯穿组共享体 + `if (type == K) { 个别字段覆盖 }`
 *  （链锤 5011/5012 组共享 shoot=947,5012 嵌套 if 里 shoot=948——
 *  曾漏提致烈焰链锤发射未点燃的 947）*/
function nestedTypeIfCases(block) {
  const out = [];
  const re = /(?:else\s+)?if\s*\(\s*type\s*==\s*(\d+)\s*\)\s*\{/g;
  let m;
  while ((m = re.exec(block))) {
    let depth = 0, close = m.index + m[0].length - 1;
    for (let i = close; i < block.length; i++) {
      if (block[i] === '{') depth++;
      else if (block[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    out.push({ id: +m[1], block: block.slice(m.index + m[0].length, close) });
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

const NUM_FIELDS = ['damage', 'knockBack', 'useTime', 'useAnimation', 'shoot', 'useAmmo', 'shootSpeed', 'ammo', 'maxStack', 'crit', 'scale', 'mana'];
// AmmoID.* 枚举引用（AmmoID.cs:114-130）
const AMMO_ID = { Gel: 23, Arrow: 40, Coin: 71, Bullet: 97, Sand: 169, Dart: 283, Rocket: 771, Solution: 780, None: 0 };
const BOOL_FIELDS = ['consumable', 'noMelee', 'autoReuse', 'melee', 'ranged', 'magic', 'summon'];

const literal = new Map(); // id -> rec（字面 case）
const delegates = [];      // id, targetId, block
const groupShared = new Map(); // 组首 id → 共享体字段（goto case 别名族回补用）
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
  return rec;
}
function applyRec(id, lines) {
  const rec = fieldsFromLines(id, lines);
  if (!Object.keys(rec).length) return;
  const dl = lines.find((l) => /^SetDefaults\d?\(\d+\);/.test(l));
  if (dl) {
    delegates.push({ id, targetId: parseInt(dl.match(/\d+/)[0], 10), rec });
    return;
  }
  // 同 id 多处赋值（分段 switch/嵌套覆盖可能重复）：合并（后者覆盖）
  literal.set(id, { ...(literal.get(id) || {}), ...rec });
}
for (const body of bodies) {
  for (const { ids, block } of parseSwitch(body)) {
    const lines = depth1Lines(block);
    const shared = fieldsFromLines(ids[0], lines);
    if (Object.keys(shared).length) groupShared.set(ids[0], shared);
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
    for (let id = lo; id <= hi; id++) {
      literal.set(id, { ...shared, ...(literal.get(id) || {}) });
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
  }
}

const obj = {};
for (const [k, v] of data) obj[k] = v;
writeFileSync(`${ROOT}/game/src/data/vanilla-itemcombat.json`, JSON.stringify(obj));
const bows = [...data.values()].filter((v) => v.useAmmo === 40);
const arrows = [...data.values()].filter((v) => v.ammo === 40);
console.error(`共 ${data.size} 物品 / 弓类 ${bows.length} / 箭类 ${arrows.length}`);
console.error('木弓(99):', JSON.stringify(obj['99']));
console.error('木箭(40):', JSON.stringify(obj['40']));
console.error('火焰箭(41):', JSON.stringify(obj['41']));
