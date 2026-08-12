// 从 Terarria1456 Projectile.cs SetDefaults 提取投射物数据。
// 注意：与 Item.cs 不同，Projectile.cs 的 SetDefaults(Type) 用的是
// `if (type == N) {...} else if (type == M) {...}` 链（约 436 行起），
// 不是 switch-case —— 之前按 switch 解析提取到 0 条就是这个原因。
// 深度 1 赋值捕获；输出 src/data/vanilla-projectiles.json
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const src = readFileSync(`${ROOT}/Terarria1456/Terraria/Projectile.cs`, 'utf8');

// ---- SetDefaults(int Type) 方法体 ----
const fnIdx = src.indexOf('public void SetDefaults(int Type');
if (fnIdx < 0) throw new Error('SetDefaults not found');
const start = src.indexOf('{', fnIdx);
let depth = 0, end = start;
for (let i = start; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const body = src.slice(start + 1, end);

// ---- else-if 链通配拆分:纯 type 布尔式逐 id 求值,先匹配者生效 ----
// 1456 SetDefaults 是互斥 else-if 链,条件形态多样(单值/区间/复合 OR/括号混排,
// 如 `(type >= 360 && type <= 366) || type == 381 || type == 760`)——正则枚举
// 永远追不完(链锤 947||948 复合块曾漏提 → Mace 分类落入 shot 兜底"射出锤子")。
// 语义模型:仅【顶层链】互斥(每 id 吃第一个命中块);块内嵌套的纯 type if
// (如 986-993 块内 `if (type >= 987 && type <= 993) { light = 1f; }`)随外块
// 对该 id 求值后一并并入;非纯 type 条件(Main.expertMode 等)不可静态求值,跳过。
const MAX_ID = 1110;
/** 平衡括号取 if 条件串;返回 { cond, condEnd } 或 null */
function readCond(text, ifParenAt) {
  let d = 0;
  for (let i = ifParenAt; i < text.length; i++) {
    if (text[i] === '(') d++;
    else if (text[i] === ')') { d--; if (d === 0) return { cond: text.slice(ifParenAt, i + 1), condEnd: i + 1 }; }
  }
  return null;
}
/** 条件纯度:只含 小写 type/数字/比较/逻辑/括号/空白(大写 Type 初始化段跳过) */
function tryCompile(cond) {
  if (/\bType\b/.test(cond)) return null;
  const stripped = cond.replace(/\btype\b/g, '');
  if (!/^[\s\d()&|=<>!*]+$/.test(stripped)) return null;
  try { return new Function('type', `return (${cond});`); } catch { return null; }
}
/** 平衡花括号取块体;返回 { text, end } 或 null(end = 块尾 } 的下一位) */
function readBlock(text, from) {
  const braceAt = text.indexOf('{', from);
  if (braceAt < 0 || text.slice(from, braceAt).trim() !== '') return null;
  let d = 0;
  for (let i = braceAt; i < text.length; i++) {
    if (text[i] === '{') d++;
    else if (text[i] === '}') { d--; if (d === 0) return { text: text.slice(braceAt + 1, i), end: i + 1 }; }
  }
  return null;
}
/** 块内收集:id 视角的有效行 = 语句层行 + 嵌套纯 type if(对该 id 为真)的递归行 */
function collectLinesForId(block, id, depth = 0) {
  const out = [];
  const re = /(?:else\s+)?if\s*\(/g;
  let cursor = 0;
  let m;
  while ((m = re.exec(block))) {
    // 条件前的语句层文本行并入
    out.push(...block.slice(cursor, m.index).split('\n').map((l) => l.trim()));
    const c = readCond(block, m.index + m[0].length - 1);
    if (!c) break;
    const b = readBlock(block, c.condEnd);
    if (!b) break;
    const fn = tryCompile(c.cond);
    if (fn) {
      let hit = false;
      try { hit = !!fn(id); } catch { hit = false; }
      if (hit) out.push(...collectLinesForId(b.text, id, depth + 1));
    }
    // 非纯条件(Main.expertMode 等)不可静态判定,整块跳过(记录在案的限制)
    cursor = b.end;
    re.lastIndex = cursor;
    if (depth > 4) break;
  }
  out.push(...block.slice(cursor).split('\n').map((l) => l.trim()));
  return out;
}
const blocks = [];
{
  // 顶层链:if 关键字必须位于方法体语句层(其前的花括号深度为 0)
  const chainRe = /(?:else\s+)?if\s*\(/g;
  const seen = new Set();
  let m;
  while ((m = chainRe.exec(body))) {
    let d0 = 0;
    for (let i = 0; i < m.index; i++) {
      if (body[i] === '{') d0++;
      else if (body[i] === '}') d0--;
    }
    if (d0 !== 0) continue; // 嵌套 if 由 collectLinesForId 处理
    const c = readCond(body, m.index + m[0].length - 1);
    if (!c) break;
    const fn = tryCompile(c.cond);
    const blk = readBlock(body, c.condEnd);
    if (!blk) { chainRe.lastIndex = c.condEnd; continue; }
    const block = blk.text;
    if (fn) {
      for (let id = 0; id <= MAX_ID; id++) {
        let hit = false;
        try { hit = !!fn(id); } catch { hit = false; }
        if (hit && !seen.has(id)) {
          seen.add(id);
          blocks.push({ id, block });
        }
      }
    }
    chainRe.lastIndex = c.condEnd;
  }
}
if (blocks.length < 500) throw new Error(`链块过少: ${blocks.length}，疑似源码结构变化`);

// ---- 深度 1 赋值（块内语句深度 0） ----
const depth1Lines = (block) => {
  const out = [];
  let d = 0;
  for (const raw of block.split('\n')) {
    const opens = (raw.match(/\{/g) || []).length;
    const closes = (raw.match(/\}/g) || []).length;
    if (d === 0 && opens === 0) out.push(raw.trim());
    d += opens - closes;
    if (d < 0) d = 0;
  }
  return out;
};

const NUM_FIELDS = ['aiStyle', 'width', 'height', 'penetrate', 'timeLeft', 'damage', 'light'];
const BOOL_FIELDS = ['friendly', 'melee', 'ranged', 'magic', 'minion', 'hostile', 'tileCollide', 'ignoreWater', 'pierce'];

// ---- DefaultTo* 辅助方法展开（1456 惯例：DefaultToSpear()/DefaultToYoyo()/DefaultToFlail() 等
//      内部设 aiStyle 19/99/15 —— 长矛/悠悠球/连枷不在链内直写 aiStyle，必须展开才有值） ----
const helper = {};
for (const hm of src.matchAll(/public void (DefaultTo\w+)\(\)\s*\{/g)) {
  const hs = src.indexOf('{', hm.index);
  let d = 0, he = hs;
  for (let i = hs; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) { he = i; break; } }
  }
  const rec = {};
  const hlines = depth1Lines(src.slice(hs + 1, he));
  for (const f of NUM_FIELDS) {
    const line = hlines.find((l) => new RegExp(`^${f} = -?[\\d.]+f?;`).test(l));
    if (line) rec[f] = parseFloat(line.match(/-?[\d.]+/)[0]);
  }
  for (const f of BOOL_FIELDS) {
    if (hlines.some((l) => l === `${f} = true;`)) rec[f] = true;
    else if (hlines.some((l) => l === `${f} = false;`)) rec[f] = false;
  }
  helper[hm[1]] = rec;
}
// 展开顺序内的行序列（DefaultTo* 调用与直写赋值按出现顺序合并，后设覆盖）
const data = {};
for (const { id, block } of blocks) {
  const lines = depth1Lines(block);
  const rec = {};
  const apply = (ls) => {
    for (const f of NUM_FIELDS) {
      const line = ls.find((l) => new RegExp(`^${f} = -?[\\d.]+f?;`).test(l));
      if (line) rec[f] = parseFloat(line.match(/-?[\d.]+/)[0]);
    }
    for (const f of BOOL_FIELDS) {
      if (ls.some((l) => l === `${f} = true;`)) rec[f] = true;
      else if (ls.some((l) => l === `${f} = false;`)) rec[f] = false;
    }
  };
  for (const raw of lines) {
    const call = raw.match(/^(DefaultTo\w+)\(\);$/);
    if (call && helper[call[1]]) {
      // 展开辅助方法赋值（与直写同字段语义）
      const h = helper[call[1]];
      for (const f of NUM_FIELDS) if (h[f] !== undefined) rec[f] = h[f];
      for (const f of BOOL_FIELDS) if (h[f] !== undefined) rec[f] = h[f];
    }
  }
  apply(lines);
  if (Object.keys(rec).length) data[id] = { ...(data[id] || {}), ...rec }; // 区间与单值重叠时合并（后设覆盖）
}

writeFileSync(`${ROOT}/game/src/data/vanilla-projectiles.json`, JSON.stringify(data));
console.error(`共 ${Object.keys(data).length} 投射物`);
console.error('手里剑(3):', JSON.stringify(data['3']));
console.error('回旋镖(6):', JSON.stringify(data['6']));
console.error('手雷(28):', JSON.stringify(data['28']));
console.error('长矛(23):', JSON.stringify(data['23']));
console.error('悠悠球(546):', JSON.stringify(data['546']));
