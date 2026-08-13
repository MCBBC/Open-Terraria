#!/usr/bin/env node
// tools/extract-gore.mjs —— NPC.HitEffect（Terarria1456/Terraria/NPC.cs:82421-:90873）死亡 gore 提取器
//
// 方法结构：`public void HitEffect(int hitDirection = 0, double dmg = 10.0)`（NPC.cs:82421），
// 逐 type 的 if/else-if 长链（:82877 `if (type == 552 || …)` 起）+ 尾部 catch-all `else`
// （:86465）内嵌第二层 type 链；每支内 `if (life > 0) { …; return; }` 之后即死亡段
// （life<=0 才执行到 gore 调用）。人形族共用支（:87845）尾段是 `type != 187 && type != 433`
// 排除守卫 + 通用碎块（gore 3/4/4/5/5）。
//
// 提取语义（对齐原版执行语义，偏差登记在产物 _meta.notes）：
//   1. 物理行先按括号深度拼成逻辑行（跨行实参/命名实参 Position:/Velocity:/Type: 支持）；
//   2. 逻辑行扫描，深度栈记录每个 Gore.NewGore[Perfect|Direct] 调用的完整守卫链；
//   3. npcId = 守卫链上 type 谓词的【并集∩跨层交集】（`type == N`、`type >= A && type <= B`、
//      `type != N` 排除、`type < N` 收窄）；无 type 谓词 → _meta.defaultEntries 不摊到全部 id；
//   4. life 相位：内层最近 `life > 0` → hit 段跳过；`life <= 0` → 死亡段；无 life 守卫 →
//      hit/death 双段都会执行（HitEffect 死亡时必被调）→ 计为死亡 gore；
//   5. 只保留带具体数字 id 的调用：`X + Main.rand.Next(N)`/`Next(A,B)` 静态展开为区间，
//      `num + K` 局部变量按同 type 分支赋值流还原，仍不可求值保留表达式字符串；
//   6. `ai[N] == V` 守卫解析成结构化 ai 门（运行时按 NPC ai 槽位判定）；派对帽段
//      （UsesPartyHat）整体剔除。
//
// 产物：src/data/_old-vanilla-gore.json
//   { "_meta": {...含 tex 尺寸表}, "<npcId>": [ { id|idMin/idMax|ids, n?, vx?, vy?, velExpr?,
//      scale?, scaleExpr?, posExpr?, expr?, ai?, perfect?, line } , ... ] }
// velocity=velocity（缺省）表示继承 NPC 当前速度；NewGore 自带随机扰动（Gore.cs:1347-1348）
// 是运行时行为不进表。tex 尺寸供运行时碰撞盒 min(w,h)*0.9*scale（Gore.cs:1000-1012）。
//
// 用法：node tools/extract-gore.mjs [--audit]   （--audit = 只输出诊断 JSON，不落盘）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NPC_CS = join(ROOT, '..', 'Terarria1456', 'Terraria', 'NPC.cs');
const OUT = join(ROOT, 'src', 'data', '_old-vanilla-gore.json');
const SPRITE_DIR = join(ROOT, 'public', 'sprites', 'vanilla');

// ============ PNG 尺寸（IHDR 直读：8B 签名 + 4B len + 4B 'IHDR' + 4B w + 4B h） ============
const pngCache = new Map();
function pngSize(id) {
  if (pngCache.has(id)) return pngCache.get(id);
  let out = null;
  try {
    const p = join(SPRITE_DIR, `Gore_${id}.png`);
    if (existsSync(p)) {
      const b = readFileSync(p);
      out = { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }
  } catch { /* 缺贴图 → null，运行时回退 32px 盒（Gore.cs:999） */ }
  pngCache.set(id, out);
  return out;
}

// ============ 工具 ============
/** 括号深度（>0 = 未闭合） */
function parenDepth(s) {
  let d = 0;
  for (const c of s) { if (c === '(') d++; else if (c === ')') d--; }
  return d;
}

/** s[i] 须为 '('：取匹配内文 */
function parenBody(s, i) {
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '(') d++;
    else if (s[j] === ')') { d--; if (d === 0) return s.slice(i + 1, j); }
  }
  return s.slice(i + 1);
}

/** 顶层逗号切分 */
function splitArgs(s) {
  const out = [];
  let d = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') d++;
    else if (c === ')' || c === ']') d--;
    if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** NewGore(Vector2 Position, Vector2 Velocity, int Type, float Scale=1f) 命名实参归位 */
function namedArgs(args) {
  const map = { Position: args[0], Velocity: args[1], Type: args[2], Scale: args[3] };
  for (const a of args) {
    const m = a.match(/^(Position|Velocity|Type|Scale)\s*:\s*(.+)$/s);
    if (m) map[m[1]] = m[2].trim();
  }
  return map;
}

// ============ 守卫条件解析 ============
/** type 谓词全集（同条件内 || 并集；range 先消耗原文再扫单边界/!=） */
function parseTypeCond(cond) {
  const res = { include: new Set(), hasInclude: false, exclude: new Set(), lt: null, lte: null, gt: null, gte: null };
  if (!cond || cond === 'else') return res;
  let s = cond;
  let m;
  const range = [
    [/type\s*>=\s*(\d+)\s*&&\s*type\s*<=\s*(\d+)/g, (a, b) => [a, b]],
    [/type\s*>\s*(\d+)\s*&&\s*type\s*<\s*(\d+)/g, (a, b) => [a + 1, b - 1]],
    [/type\s*>=\s*(\d+)\s*&&\s*type\s*<\s*(\d+)/g, (a, b) => [a, b - 1]],
  ];
  for (const [re, f] of range) {
    for (const mm of s.matchAll(re)) {
      const [a, b] = f(+mm[1], +mm[2]);
      for (let t = a; t <= b; t++) res.include.add(t);
      res.hasInclude = true;
    }
    s = s.replace(new RegExp(re.source, 'g'), ' ');
  }
  for (const mm of s.matchAll(/type\s*==\s*(-?\d+)/g)) { res.include.add(+mm[1]); res.hasInclude = true; }
  for (const mm of s.matchAll(/type\s*!=\s*(-?\d+)/g)) res.exclude.add(+mm[1]);
  if ((m = s.match(/type\s*<\s*(\d+)/))) res.lt = +m[1];
  if ((m = s.match(/type\s*<=\s*(\d+)/))) res.lte = +m[1];
  if ((m = s.match(/type\s*>\s*(\d+)/))) res.gt = +m[1];
  if ((m = s.match(/type\s*>=\s*(\d+)/)) && +m[1] !== 0) res.gte = +m[1];
  return res;
}

function parseLife(cond) {
  if (!cond || cond === 'else') return null;
  if (/life\s*<=\s*0/.test(cond)) return 'death';
  if (/life\s*>\s*0/.test(cond) || /life\s*>=\s*1/.test(cond)) return 'alive';
  return null;
}

/** `ai[N] == V` / `ai[N] != V` → 结构化门 */
function parseAiGates(cond) {
  if (!cond) return [];
  const out = [];
  for (const m of cond.matchAll(/ai\[(\d)\]\s*==\s*(-?[\d.]+)[fF]?/g)) out.push({ slot: +m[1], value: +m[2], not: false });
  for (const m of cond.matchAll(/ai\[(\d)\]\s*!=\s*(-?[\d.]+)[fF]?/g)) out.push({ slot: +m[1], value: +m[2], not: true });
  return out;
}

/** 剥掉 type/life/ai 谓词后剩余标识符 → 附加门（专家模式/变体等），无则 null */
function parseGate(cond) {
  if (!cond || cond === 'else') return null;
  let s = cond;
  s = s.replace(/type\s*(==|!=|>=|<=|>|<)\s*(-?\d+|\w+(\.\w+)?)/g, ' ');
  s = s.replace(/life\s*(<=|>=|==|!=|>|<)\s*[\d.]+[fFdD]?/g, ' ');
  s = s.replace(/ai\[\d\]\s*(==|!=)\s*[\d.]+[fF]?/g, ' ');
  s = s.replace(/\b(life|type|ai)\b/g, ' ');
  s = s.replace(/[\d.]+[fFdD]?/g, ' ').replace(/[()[\]{}&|!?:.,;=+\-*/<>]/g, ' ');
  const ids = [...new Set(s.split(/\s+/).filter((t) => /^[A-Za-z_]/.test(t)))];
  return ids.length ? ids.join('+') : null;
}

// ============ gore id 表达式求值 ============
function evalIdExpr(expr) {
  const s = String(expr).trim();
  let m;
  if ((m = s.match(/^(-?\d+)[fFdD]?$/))) return { kind: 'id', id: +m[1] };
  if ((m = s.match(/^(\w+)\s*\?\s*(-?\d+)\s*:\s*(-?\d+)$/))) {
    // IsShimmerVariant ? 微光变体 : 常规 —— 常规态取 else 支
    return { kind: 'id', id: +m[3], shimmerAlt: +m[2] };
  }
  if ((m = s.match(/^(-?\d+)\s*\+\s*Main\.rand\.Next\(\s*(\d+)\s*\)$/))) {
    const a = +m[1]; return { kind: 'range', min: a, max: a + +m[2] - 1 };
  }
  if ((m = s.match(/^(-?\d+)\s*\+\s*Main\.rand\.Next\(\s*(\d+)\s*,\s*(\d+)\s*\)$/))) {
    const a = +m[1]; return { kind: 'range', min: a + +m[2], max: a + +m[3] - 1 };
  }
  if ((m = s.match(/^Main\.rand\.Next\(\s*(\d+)\s*,\s*(\d+)\s*\)$/))) return { kind: 'range', min: +m[1], max: +m[2] - 1 };
  if ((m = s.match(/^Main\.rand\.Next\(\s*(\d+)\s*\)$/))) return { kind: 'range', min: 0, max: +m[1] - 1 };
  if (/^Utils\.SelectRandom</.test(s)) {
    const ids = [...s.matchAll(/(\d+)[fFdD]?/g)].map((x) => +x[1]);
    if (ids.length) return { kind: 'ids', ids };
  }
  // 局部变量 ± 常数偏移（人形族 `num46 + 3` 头/臂/腿族）
  if ((m = s.match(/^([A-Za-z_]\w*)\s*\+\s*(-?\d+)$/))) return { kind: 'local', name: m[1], off: +m[2] };
  if ((m = s.match(/^([A-Za-z_]\w*)\s*-\s*(-?\d+)$/))) return { kind: 'local', name: m[1], off: -+m[2] };
  if ((m = s.match(/^([A-Za-z_]\w*)$/))) return { kind: 'local', name: m[1], off: 0 };
  return null;
}

// ============ 主流程 ============
const src = readFileSync(NPC_CS, 'utf8').split('\n');
const headIdx = src.findIndex((l) => l.includes('public void HitEffect(int hitDirection'));
if (headIdx < 0) { console.error('HitEffect not found in NPC.cs'); process.exit(1); }

// 方法体括号切片：签名行 '{' 起深度扫描到配平 '}'（其后即 `public static int CountNPCS`）
let bodyEnd = headIdx;
{
  let d = 0, seen = false;
  for (let i = headIdx; i < src.length; i++) {
    for (const c of src[i]) {
      if (c === '{') { d++; seen = true; } else if (c === '}') d--;
    }
    if (seen && d === 0) { bodyEnd = i; break; }
  }
}

// 逻辑行：括号深度 >0 持续拼接（跨行实参）
const logical = [];
{
  let buf = null;
  for (let ln = headIdx; ln <= bodyEnd; ln++) {
    if (!buf) buf = { text: src[ln], line: ln + 1 };
    else buf.text += ' ' + src[ln].trim();
    if (parenDepth(buf.text) <= 0) { logical.push(buf); buf = null; }
  }
  if (buf) logical.push(buf);
}

const stack = [];       // 深度栈：每项一个守卫上下文
let depth = 0;
let ctxSeq = 0;
let pendingGuard = null;
const caseAt = new Map(); // depth → { label, types:Set|null }
const locals = new Map(); // name → [{ line, valExpr, typeCtxId }]

const entries = new Map();
const defaultEntries = [];
const unresolved = [];
let callsTotal = 0, callsHitSkipped = 0, callsPartySkipped = 0;

function makeGuard(kind, cond) {
  const t = parseTypeCond(cond);
  return {
    kind, cond,
    types: t.hasInclude ? t.include : null,
    exclude: t.exclude.size ? t.exclude : null,
    bounds: { lt: t.lt, lte: t.lte, gt: t.gt, gte: t.gte },
    life: parseLife(cond),
    gate: parseGate(cond),
    ai: parseAiGates(cond),
  };
}
function pushCtx(guard) {
  ctxSeq++;
  stack.push({
    id: ctxSeq, kind: guard?.kind ?? null, cond: guard?.cond ?? null,
    types: guard?.types ?? null, exclude: guard?.exclude ?? null,
    bounds: guard?.bounds ?? null, life: guard?.life ?? null,
    gate: guard?.gate ?? null, ai: guard?.ai ?? null,
    loopN: guard?.loopN ?? null, loopVar: guard?.loopVar ?? null,
  });
}
/** 调用点守卫链解析 */
function resolveChain(extraCase) {
  const chain = [...stack];
  if (extraCase) chain.push(extraCase);
  let include = null, typeCtxId = null;
  const exclude = new Set(), gates = [], ai = [];
  for (const c of chain) {
    if (!c) continue;
    if (c.types) {
      include = include ? new Set([...include].filter((t) => c.types.has(t))) : new Set(c.types);
      typeCtxId = typeCtxId ?? c.id;
    }
    if (c.exclude) for (const t of c.exclude) exclude.add(t);
    if (c.gate) gates.push(c.gate);
    if (c.ai) ai.push(...c.ai);
    if (c.bounds && include) {
      if (c.bounds.lt != null) include = new Set([...include].filter((t) => t < c.bounds.lt));
      if (c.bounds.lte != null) include = new Set([...include].filter((t) => t <= c.bounds.lte));
      if (c.bounds.gt != null) include = new Set([...include].filter((t) => t > c.bounds.gt));
      if (c.bounds.gte != null) include = new Set([...include].filter((t) => t >= c.bounds.gte));
    }
  }
  let life = null;
  for (let i = chain.length - 1; i >= 0; i--) if (chain[i]?.life) { life = chain[i].life; break; }
  let loopN = 1;
  const loopVars = [];
  for (const c of chain) {
    if (c?.loopN) loopN *= c.loopN;
    if (c?.loopVar) loopVars.push(c.loopVar);
  }
  return { types: include, exclude, life, gates, ai, typeCtxId, loopN, loopVars };
}

function recordLocalAssign(name, valExpr, line, typeCtxId, loopRange) {
  if (!locals.has(name)) locals.set(name, []);
  locals.get(name).push({ line, valExpr, typeCtxId, loopRange });
}

// ---- 简易算术求值（局部变量/`type` 代数 id 还原用）----
/** 递归下降：数 / 一元± / * / + -；括号。`type==N` 归一后为 0/1。返回 number | null */
function evalArith(expr) {
  const toks = [];
  let s = String(expr).trim();
  let m;
  while (s.length) {
    if (/^\s/.test(s)) { s = s.slice(1); continue; }
    if ((m = s.match(/^(-?\d+\.?\d*)/))) { toks.push({ t: 'n', v: +m[1] }); s = s.slice(m[1].length); continue; }
    if ((m = s.match(/^([-+*()/<>?:])/))) {
      const op = m[1];
      // 双字符 <= >= == != 跳过（归一阶段已替换成数字）
      if ((op === '<' || op === '>') && '=<>=!'.includes(s[1] ?? '')) return null;
      if ((op === ':' || op === '?') && toks.length) { /* 三元（cond 已归一为数）：手工处理 */ }
      toks.push({ t: op }); s = s.slice(1); continue;
    }
    if ((m = s.match(/^==/))) return null;
    return null;
  }
  let pos = 0;
  const peek = () => toks[pos];
  const eat = (t) => { if (toks[pos] && toks[pos].t === t) { pos++; return true; } return false; };
  function ternary() {
    const c = additive();
    if (c == null) return null;
    if (eat('?')) {
      const a = ternary();
      if (a == null || !eat(':')) return null;
      const b = ternary();
      if (b == null) return null;
      return c !== 0 ? a : b;
    }
    return c;
  }
  function additive() {
    let v = multiplicative();
    while (v != null && (peek() && (peek().t === '+' || peek().t === '-'))) {
      const op = peek().t; pos++;
      const r = multiplicative();
      if (r == null) return null;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function multiplicative() {
    let v = unary();
    while (v != null && peek() && peek().t === '*') {
      pos++;
      const r = unary();
      if (r == null) return null;
      v = v * r;
    }
    return v;
  }
  function unary() {
    if (eat('-')) { const v = unary(); return v == null ? null : -v; }
    if (eat('+')) return unary();
    if (eat('(')) { const v = ternary(); return eat(')') ? v : null; }
    const t = peek();
    if (t && t.t === 'n') { pos++; return t.v; }
    return null;
  }
  const out = ternary();
  return pos === toks.length ? out : null;
}

/** `type` → 具体值代入 + `X == Y` 归一为 0/1（仅支持全数字比较） */
function normalizeForArith(expr, t) {
  let s = String(expr).replace(/\btype\b/g, String(t));
  s = s.replace(/\(\s*(\d+)\s*==\s*(\d+)\s*\)/g, (_, a, b2) => (a === b2 ? '(1)' : '(0)'));
  s = s.replace(/(\d+)\s*==\s*(\d+)/g, (_, a, b2) => (a === b2 ? '1' : '0'));
  s = s.replace(/\(\s*\)/g, '');
  return s;
}

/** 单 type 值下的 id 求值 → {kind:id|range|ids} | null */
function evalIdForType(expr, t, callLine, typeCtxId) {
  const e = evalIdExpr(expr);
  if (e) {
    if (e.kind === 'id' || e.kind === 'range' || e.kind === 'ids') return e;
    if (e.kind === 'local') {
      const base = localValueForType(e.name, t, callLine, typeCtxId);
      if (base == null) return null;
      return applyOff(base, e.off);
    }
    return null;
  }
  // `X + local` / `local + rand(N)` / `local ± K` 反向形态
  let m;
  if ((m = expr.match(/^(-?\d+)\s*\+\s*([A-Za-z_]\w*)$/))) {
    const base = localValueForType(m[2], t, callLine, typeCtxId);
    return base == null ? null : applyOff(base, +m[1]);
  }
  if ((m = expr.match(/^([A-Za-z_]\w*)\s*\+\s*Main\.rand\.Next\(\s*(\d+)\s*\)$/))) {
    const base = localValueForType(m[1], t, callLine, typeCtxId);
    if (base == null || base.kind !== 'id') return null;
    return { kind: 'range', min: base.id, max: base.id + +m[2] - 1 };
  }
  if ((m = expr.match(/^(-?\d+)\s*\+\s*\(\(Main\.rand\.Next\(\d+\)\s*==\s*0\)\s*\?\s*(-?\d+)\s*:\s*(-?\d+)\)$/))) {
    return { kind: 'ids', ids: [+m[1] + +m[2], +m[1] + +m[3]] };
  }
  // 含 type 的代数式：代入后算术求值
  if (/\btype\b/.test(expr)) {
    const v = evalArith(normalizeForArith(expr, t));
    if (v != null) return { kind: 'id', id: v };
  }
  return null;
}

/** 局部变量在 type=t 下的值（赋值流末值；声明含 type/循环变量则代数求值） */
function localValueForType(name, t, callLine, typeCtxId) {
  const hist = (locals.get(name) ?? []).filter((h) => h.line < callLine && (h.typeCtxId === typeCtxId || h.typeCtxId == null));
  if (!hist.length) return null;
  const last = hist[hist.length - 1];
  if (last.loopRange) return { kind: 'range', min: last.loopRange[0], max: last.loopRange[1] };
  const e = evalIdExpr(last.valExpr);
  if (e && e.kind !== 'local') return e;
  if (/\btype\b/.test(last.valExpr)) {
    const v = evalArith(normalizeForArith(last.valExpr, t));
    if (v != null) return { kind: 'id', id: v };
  }
  if (/^([A-Za-z_]\w*)$/.test(last.valExpr.trim())) {
    return localValueForType(last.valExpr.trim(), t, callLine, typeCtxId);
  }
  // 算术组合（如 `11 + num744`，num744 为循环变量）
  let m;
  if ((m = last.valExpr.match(/^(-?\d+)\s*\+\s*([A-Za-z_]\w*)$/))) {
    const base = localValueForType(m[2], t, callLine, typeCtxId);
    return base == null ? null : applyOff(base, +m[1]);
  }
  return null;
}

function applyOff(v, off) {
  if (v.kind === 'id') return { kind: 'id', id: v.id + off };
  if (v.kind === 'range') return { kind: 'range', min: v.min + off, max: v.max + off };
  if (v.kind === 'ids') return { kind: 'ids', ids: v.ids.map((x) => x + off) };
  return null;
}

/** 逐 type 求值 → {fields} 统一 / {perType:Map} 分歧 / null 不可求值 */
function resolveIdPerType(expr, target, callLine, typeCtxId) {
  const per = new Map();
  for (const t of target) {
    const v = evalIdForType(expr, t, callLine, typeCtxId);
    if (!v) return null;
    per.set(t, v);
  }
  const uniq = [...new Set([...per.values()].map((v) => JSON.stringify(v)))];
  if (uniq.length === 1) return { fields: idFields(JSON.parse(uniq[0])) };
  const perMap = new Map();
  for (const [t, v] of per) perMap.set(t, idFields(v));
  return { perType: perMap };
}

function idFields(e) {
  if (e.kind === 'id') return { id: e.id };
  if (e.kind === 'range') return { idMin: e.min, idMax: e.max, n: e.max - e.min + 1 };
  if (e.kind === 'ids') return { ids: e.ids, n: e.ids.length };
  return {};
}

// ---- 位置/速度表达式 → 结构化数值（运行时只做一次线性组合）----
/** 单轴项求值 → { off, frac, rand } | null；axisDim = 'width' | 'height' */
function axisTerm(term, axisDim) {
  const t = term.trim();
  let m;
  if ((m = t.match(/^(-?[\d.]+)[fF]?$/))) return { off: +m[1] };
  if ((m = t.match(/^\(float\)\((width|height)\s*\/\s*(\d+)\)$/)) || (m = t.match(/^(width|height)\s*\/\s*(\d+)$/))) {
    return m[1] === axisDim ? { frac: 1 / +m[2] } : null;
  }
  if ((m = t.match(/^\(float\)(width|height)$/)) || (m = t.match(/^(width|height)$/))) {
    return m[1] === axisDim ? { frac: 1 } : null;
  }
  if ((m = t.match(/^\(?float\)?\s*Main\.rand\.Next\(\s*(width|height)\s*\)$/)) || (m = t.match(/^Main\.rand\.Next\(\s*(width|height)\s*\)$/))) {
    return m[1] === axisDim ? { rand: 1 } : null;
  }
  if ((m = t.match(/^(width|height)\s*\*\s*([\d.]+)[fF]?$/))) {
    return m[1] === axisDim ? { frac: +m[2] } : null;
  }
  return null;
}

/** 轴表达式（已剥 anchor）→ { off, frac, rand } | null */
function axisExpr(expr, axisDim) {
  let off = 0, frac = 0, rand = 0;
  // 顶层 ± 切分（无括号嵌套数字场景）
  const parts = expr.replace(/^\s*\+/, '').split(/\s*\+\s*/);
  const terms = [];
  for (const p of parts) {
    const neg = p.split(/\s*-\s*/);
    for (let k = 0; k < neg.length; k++) {
      if (neg[k] === '') continue;
      terms.push({ t: neg[k], sign: k === 0 ? 1 : -1 });
    }
  }
  for (const { t, sign } of terms) {
    const r = axisTerm(t, axisDim);
    if (!r) return null;
    if (r.off != null) off += sign * r.off;
    if (r.frac != null) frac += sign * r.frac;
    if (r.rand != null) rand += sign * r.rand;
  }
  const out = {};
  if (off) out.off = +off.toFixed(4);
  if (frac) out.frac = +frac.toFixed(4);
  if (rand) out.rand = 1;
  return out;
}

/** Position 实参 → { ox,oy,fx,fy,rx,ry } | null（基准=position 左上角） */
function compilePos(expr) {
  let s = String(expr).trim();
  let m;
  // anchor 前缀（base.Center/Top/Bottom/position + …）
  let base = {};
  if ((m = s.match(/^(base\.Center|base\.Top|base\.Bottom|position)\s*\+\s*(.+)$/s))) {
    if (m[1] === 'base.Center') base = { fx: 0.5, fy: 0.5 };
    else if (m[1] === 'base.Top') base = { fx: 0.5 };
    else if (m[1] === 'base.Bottom') base = { fx: 0.5, fy: 1 };
    s = m[2].trim();
  }
  // 实体参照归一到 position.X/Y + 尺寸项
  s = s.replace(/base\.Center\.X/g, 'position.X + (float)(width / 2)')
    .replace(/base\.Center\.Y/g, 'position.Y + (float)(height / 2)')
    .replace(/base\.Top\.X/g, 'position.X + (float)(width / 2)')
    .replace(/base\.Top\.Y/g, 'position.Y')
    .replace(/base\.Bottom\.X/g, 'position.X + (float)(width / 2)')
    .replace(/base\.Bottom\.Y/g, 'position.Y + (float)height')
    .replace(/base\.Right\.X/g, 'position.X + (float)width')
    .replace(/base\.Left\.X/g, 'position.X')
    .replace(/base\.Size\s*\*\s*0\.5f?/g, 'new Vector2((float)(width / 2), (float)(height / 2))');
  if (s === 'position' || s === '') return { ...base };
  if (s === 'base.Center') return { fx: 0.5, fy: 0.5 };
  if (s === 'base.Top') return { fx: 0.5 };
  if (s === 'base.Bottom') return { fx: 0.5, fy: 1 };
  let sx = null, sy = null;
  if (s.startsWith('new Vector2(')) {
    const comps = splitArgs(parenBody(s, s.indexOf('(')));
    if (comps.length !== 2) return null;
    sx = comps[0]; sy = comps[1];
  } else if ((m = s.match(/^(.*?)[+-]\s*new Vector2\(/s))) {
    return null; // 复合表达式（vector19 链等）→ 留原文
  } else {
    return null;
  }
  const out = { ...base };
  for (const [axisName, dim, comp] of [['x', 'width', sx], ['y', 'height', sy]]) {
    let body = comp.trim();
    const anchorRe = new RegExp(`position\\.${axisName.toUpperCase()}\\b`);
    if (!anchorRe.test(body)) {
      // 无 position 锚点：整体当作偏移项（含 width/height 项）
      const r = axisExpr(body, dim);
      if (!r) return null;
      if (r.off != null) out[`o${axisName}`] = r.off;
      if (r.frac != null) out[`f${axisName}`] = r.frac;
      if (r.rand) out[`r${axisName}`] = 1;
      continue;
    }
    body = body.replace(anchorRe, '');
    const r = axisExpr(body, dim);
    if (!r) return null;
    if (r.off != null) out[`o${axisName}`] = r.off;
    if (r.frac != null) out[`f${axisName}`] = r.frac;
    if (r.rand) out[`r${axisName}`] = 1;
  }
  return out;
}

/** 速度实参 → { vx,vy,kx,ky,ax,ay,mx,my,hd } | null（k=NPC 速度系数；
 *  v=常量；m+a=均匀随机区间 [m-a, m+a]；hd=1 表示 vx 取击退方向） */
function compileVel(expr) {
  const s = String(expr).trim();
  let m;
  if (s === 'velocity') return {};
  if (s === 'Vector2.Zero' || s === 'default(Vector2)') return { vx: 0, vy: 0 };
  if ((m = s.match(/^velocity\s*\*\s*([\d.]+)[fF]?$/))) return +m[1] === 0 ? { vx: 0, vy: 0 } : { kx: +m[1], ky: +m[1] };
  if (!s.startsWith('new Vector2(')) return null;
  const comps = splitArgs(parenBody(s, s.indexOf('(')));
  if (comps.length !== 2) return null;
  const out = {};
  const comp = (c, axis) => {
    const t = c.trim();
    let mm;
    if ((mm = t.match(/^(-?[\d.]+)[fF]?$/))) { out[`v${axis}`] = +mm[1]; return true; }
    if (t === 'hitDirection') { out.hd = 1; return true; }
    if ((mm = t.match(/^\(float\)\s*Main\.rand\.Next\((-?\d+),\s*(-?\d+)\)\s*\*\s*([\d.]+)[fF]?$/))
      || (mm = t.match(/^Main\.rand\.Next\((-?\d+),\s*(-?\d+)\)\s*\*\s*([\d.]+)[fF]?$/))) {
      const lo = +mm[1] * +mm[3], hi = (+mm[2] - 1) * +mm[3];
      out[`m${axis}`] = +((lo + hi) / 2).toFixed(4);
      out[`a${axis}`] = +((hi - lo) / 2).toFixed(4);
      return true;
    }
    if ((mm = t.match(/^Main\.rand\.Next\((-?\d+),\s*(-?\d+)\)$/))) {
      const lo = +mm[1], hi = +mm[2] - 1;
      out[`m${axis}`] = +((lo + hi) / 2).toFixed(4);
      out[`a${axis}`] = +((hi - lo) / 2).toFixed(4);
      return true;
    }
    if ((mm = t.match(/^Main\.rand\.Next\((-?\d+)\)$/))) {
      out[`m${axis}`] = +((+mm[1] - 1) / 2).toFixed(4);
      out[`a${axis}`] = +((+mm[1] - 1) / 2).toFixed(4);
      return true;
    }
    if ((mm = t.match(/^Main\.rand\.NextFloat\(\)\s*\*\s*([\d.]+)[fF]?$/))) {
      out[`m${axis}`] = +((+mm[1]) / 2).toFixed(4);
      out[`a${axis}`] = +((+mm[1]) / 2).toFixed(4);
      return true;
    }
    return false;
  };
  if (!comp(comps[0], 'x') || !comp(comps[1], 'y')) return null;
  return out;
}

function emitEntry(npcId, fields, line, gates, ai, loopN) {
  if (!entries.has(npcId)) entries.set(npcId, []);
  const f = { ...fields, line };
  if (gates.length) f.gates = gates;
  if (ai.length) f.ai = ai;
  if (loopN && loopN > 1) f.loop = loopN;
  entries.get(npcId).push(f);
}

// ---------- 逻辑行扫描（词法括号走查：对象初始化器 `{`/尾随 `}` 也计 depth） ----------
const LOOP_GUARD = { kind: 'loop', cond: null, types: null, exclude: null, bounds: null, life: null, gate: null, ai: null };
for (const { text, line: lineNo } of logical) {
  let i = 0;
  let guard = pendingGuard;   // 跨行：守卫头与 `{` 分行的挂起上下文
  pendingGuard = null;

  const plain = text.trim();
  // 局部变量赋值流（声明与重赋值；供 `num + K` id 还原）
  {
    let m;
    if ((m = plain.match(/^(?:int|float|double|byte|short|long|uint|var|bool|Vector2)\s+([A-Za-z_]\w*)\s*=\s*(.+?);$/))
      || (m = plain.match(/^([A-Za-z_]\w*)\s*=(?![=>])\s*(.+?);$/))) {
      if (!/^(if|for|while|switch|return|else)$/.test(m[1])) {
        const r = resolveChain(null);
        recordLocalAssign(m[1], m[2], lineNo, r.typeCtxId);
      }
    }
  }

  while (i < text.length) {
    const c = text[i];
    if (c === '{') {
      pushCtx(guard ?? null);
      guard = null;
      depth++;
      i++;
      continue;
    }
    if (c === '}') {
      if (stack.length) stack.pop();
      depth--;
      for (const k of [...caseAt.keys()]) if (k > depth) caseAt.delete(k);
      guard = null;
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === ';') { i++; continue; }

    // 语句起点：守卫头 / case 标签 / 普通语句段
    const rest = text.slice(i);
    let m;
    let handled = true;
    if ((m = rest.match(/^(else\s+if|if)\s*\(/))) {
      const cond = parenBody(rest, m[0].length - 1);
      guard = makeGuard(m[1].replace(/\s+/g, ''), cond);
      i += m[0].length + cond.length + 1;
    } else if ((m = rest.match(/^else\b/))) {
      guard = makeGuard('else', 'else');
      i += m[0].length;
    } else if ((m = rest.match(/^switch\s*\(/))) {
      const cond = parenBody(rest, m[0].length - 1);
      guard = makeGuard('switch', cond);
      i += m[0].length + cond.length + 1;
    } else if ((m = rest.match(/^case\s+([^:]+):/))) {
      const lbl = m[1].trim();
      const e = evalIdExpr(lbl);
      caseAt.set(depth, { label: lbl, types: e && e.kind === 'id' ? new Set([e.id]) : null });
      i += m[0].length;
    } else if ((m = rest.match(/^default\s*:/))) {
      caseAt.set(depth, null);
      i += m[0].length;
    } else if ((m = rest.match(/^(for|foreach|while|do|try)\b/))) {
      // for 头部：整数循环变量区间（id 表达式引用时还原）+ 常量次数（表项 loop 字段，
      // 运行时按次重复生成——EoC `for(num579<2)` 内 4 调用 = 8 块）
      const fh = rest.match(/^for\s*\(\s*(?:int|float|double|var)?\s*([A-Za-z_]\w*)\s*=\s*(-?\d+)\s*;\s*\1\s*(<=|<)\s*(\d+)\s*;/);
      let loopN = 1;
      if (fh) {
        const lo = +fh[2], hi = +fh[4];
        const rg = [lo, fh[3] === '<=' ? hi : hi - 1];
        recordLocalAssign(fh[1], `${rg[0]}`, lineNo, resolveChain(null).typeCtxId, rg);
        const n = (fh[3] === '<=' ? hi - lo + 1 : hi - lo);
        if (n > 0 && n <= 64) loopN = n;
        guard = { ...LOOP_GUARD, loopN, loopVar: fh[1] };
      }
      // 头部条件括号整体跳过（否则会被当成语句段消费掉守卫）
      const op = rest.indexOf('(');
      if (op >= 0) {
        const hd = parenBody(rest, op);
        i += op + hd.length + 2;
      } else {
        i += m[0].length;
      }
    } else {
      handled = false;
    }
    if (handled) continue;

    // 普通语句段：吃到顶层 ; { } 为止；段内提取 Gore.NewGore* 调用（此时 depth 即调用点深度）
    let j = i, pd = 0;
    const segStart = i;
    while (j < text.length) {
      const ch = text[j];
      if (ch === '(') pd++;
      else if (ch === ')') pd--;
      else if (pd === 0 && (ch === ';' || ch === '{' || ch === '}')) break;
      j++;
    }
    const seg = text.slice(segStart, j);
    const segLoopN = guard && guard.kind === 'loop' ? (guard.loopN ?? 1) : 1;
    let from = 0;
    for (;;) {
      const at = seg.indexOf('Gore.NewGore', from);
      if (at < 0) break;
      from = at + 1;
      const p = seg.indexOf('(', at);
      if (p < 0) continue;
      const callee = seg.slice(at, p);
      if (!/^Gore\.NewGore(Perfect|Direct)?$/.test(callee)) continue;
      handleGoreCall(callee, splitArgs(parenBody(seg, p)), lineNo, segLoopN);
    }
    if (guard && guard.kind === 'loop') guard = null; // 无括号体 = 单语句，守卫就此消费
    i = j;
  }
  // 行尾仍未消费的守卫头（与 `{` 分行）挂到下一逻辑行
  if (guard) pendingGuard = guard;
}

/** 单个 Gore.NewGore* 调用 → 表项 */
function handleGoreCall(callee, args, lineNo, segLoopN = 1) {
  callsTotal++;
  const a = namedArgs(args);
  if (a.Position === undefined || a.Type === undefined) return;
  const cc = caseAt.get(depth) ?? caseAt.get(depth - 1) ?? null;
  if (process.env.GORE_DBG_LINE && lineNo === +process.env.GORE_DBG_LINE) {
    console.error('[dbg] line', lineNo, 'depth', depth, 'stack', JSON.stringify(stack.map((c2) => c2?.cond)), 'case', cc?.label ?? null);
  }
  const r = resolveChain(cc ? { id: 0, kind: 'case', cond: `case ${cc.label}`, types: cc.types, exclude: null, bounds: null, life: null, gate: null, ai: null, loopN: null, loopVar: null } : null);
  r.loopN *= segLoopN;

  if (r.gates.some((g) => g.includes('UsesPartyHat'))) { callsPartySkipped++; return; } // 派对帽专属
  if (r.life === 'alive') { callsHitSkipped++; return; }                               // hit 段

  const velFields = (() => {
    const v = String(a.Velocity ?? 'velocity');
    const c = compileVel(v);
    if (c) return c;
    return { velExpr: v }; // 不可编译 → 运行时按继承 NPC 速度
  })();
  const scaleFields = (() => {
    const v = a.Scale;
    if (v === undefined || v === '1f' || v === '1') return {};
    let m;
    if ((m = String(v).match(/^([\d.]+)[fF]?$/))) return { scale: +m[1] };
    return { scaleExpr: String(v) }; // 'scale' = NPC.scale；其余登记原文
  })();
  const posFields = (() => {
    if (a.Position === 'position') return {};
    const c = compilePos(a.Position);
    if (c) return c;
    return { posExpr: String(a.Position) }; // 不可编译 → 运行时按左上角
  })();
  const perfect = callee === 'Gore.NewGorePerfect' ? { perfect: true } : {};
  const base = { ...velFields, ...scaleFields, ...posFields, ...perfect };

  // id 表达式直接引用外层循环变量（如 `num343`）= 每次迭代取一个具体 id，
  // 区间/候选已编码迭代序列 → loop 归 1，防运行时重复随机取样
  if (r.loopN > 1 && r.loopVars.some((v) => new RegExp(`\\b${v}\\b`).test(String(a.Type)))) r.loopN = 1;

  let e = null;
  let perType = null;
  let fields = null;

  if (r.types) {
    const target = [...r.types].filter((t) => !r.exclude.has(t));
    const res = resolveIdPerType(String(a.Type), target, lineNo, r.typeCtxId);
    if (res?.fields) fields = res.fields;
    else if (res?.perType) perType = res.perType;
    // 区间/候选尺寸 == 循环次数 = 序列已被区间编码（469-475×7 等）→ loop 归 1
    const span = fields ? (fields.ids ? fields.ids.length : fields.idMin != null ? (fields.idMax - fields.idMin + 1) : 0) : 0;
    if (span > 1 && span === r.loopN) r.loopN = 1;
  }

  if (!r.types) {
    defaultEntries.push({ line: lineNo, idExpr: String(a.Type), gates: r.gates });
    return;
  }
  const target = [...r.types].filter((t) => !r.exclude.has(t));

  if (perType) {
    for (const t of target) {
      emitEntry(t, { ...base, ...perType.get(t) }, lineNo, r.gates, r.ai, r.loopN);
    }
    return;
  }
  if (fields) {
    for (const t of target) emitEntry(t, { ...base, ...fields }, lineNo, r.gates, r.ai, r.loopN);
    return;
  }
  for (const t of target) emitEntry(t, { ...base, expr: String(a.Type) }, lineNo, r.gates, r.ai, r.loopN);
  unresolved.push({
    line: lineNo, expr: String(a.Type),
    types: target.length > 6 ? `${target[0]}..${target[target.length - 1]}(${target.length})` : target.join('|'),
  });
}

// ============ 手工补丁：守卫链为排除式(`type != N` + return)的收尾支 ============
// catch-all else 尾支（NPC.cs:90859-90867）：`if (type != 156) return;` → 仅 Red Devil
// 走到 184/185/185。排除式守卫无法从链上还原出正集（需要整链 else 语义），按源行手工钉死。
const MANUAL_PATCHES = {
  156: [
    { id: 184, line: 90865 },
    { id: 185, line: 90866 },
    { id: 185, line: 90867 },
  ],
};
for (const [npcId, list] of Object.entries(MANUAL_PATCHES)) {
  if (!entries.has(+npcId)) entries.set(+npcId, []);
  entries.get(+npcId).push(...list);
}

// ============ 贴图尺寸表（出现过的 gore id） ============
const idsSeen = new Set();
for (const list of entries.values()) {
  for (const e of list) {
    if (e.id != null) idsSeen.add(e.id);
    if (e.idMin != null) for (let i = e.idMin; i <= (e.idMax ?? e.idMin); i++) idsSeen.add(i);
    if (e.ids) for (const i of e.ids) idsSeen.add(i);
  }
}
const tex = {};
for (const id of [...idsSeen].sort((a, b) => a - b)) {
  const sz = pngSize(id);
  if (sz) tex[id] = sz;
}

// ============ 落盘 ============
const entryCount = [...entries.values()].reduce((n, l) => n + l.length, 0);
const out = {
  _meta: {
    source: 'Terarria1456/Terraria/NPC.cs HitEffect (:82421-:90873)；物理=Terraria/Gore.cs',
    generatedBy: 'tools/extract-gore.mjs',
    callsTotal,
    callsHitSkipped,
    callsPartySkipped,
    npcIds: entries.size,
    entryCount,
    unresolvedCount: unresolved.length,
    defaultEntryCount: defaultEntries.length,
    unresolved,
    defaultEntries: defaultEntries.slice(0, 40),
    notes: [
      'life>0 守卫段(hit gore)与派对帽段(UsesPartyHat)已剔除；无 life 守卫的调用原版 hit/death 双段都执行 → 计为死亡 gore',
      'idMin..idMax = 原版 X+Next(N)/Next(A,B) 区间，运行时均匀取值；ids = SelectRandom 候选',
      'velocity 缺省=继承 NPC 当前速度；NewGore 附加随机扰动见 Gore.cs:1347-1348（运行时实现）',
      'scaleExpr="scale" = 取 NPC.scale；posExpr 为原版位置表达式（默认 position=左上角）',
      'ai=[{slot,value}] = 原版 ai[N]==V 门（运行时按 NPC ai 槽位判定，不满足跳过该条）',
      'perfect=true = Gore.NewGorePerfect：随机扰动后回写精确 pos/vel（运行时不抖动）',
      'loop=N = 原版常量次数 for 循环体内（运行时重复生成 N 次，如 EoC <2 循环 = 8 块）',
      'gates = 其余不可求值守卫（专家模式/变体等），仅登记不拦截',
      'tex = gore 贴图 {w,h}（IHDR 直读）；缺图 id 运行时回退 32px 碰撞盒（Gore.cs:999）',
    ],
    tex,
  },
};
for (const [k, v] of [...entries.entries()].sort((a, b) => (+a[0]) - (+b[0]))) out[k] = v;

if (process.argv.includes('--audit')) {
  console.log(JSON.stringify({
    npcIds: entries.size, entryCount, callsTotal, callsHitSkipped, callsPartySkipped,
    unresolved: unresolved.length, defaultEntries: defaultEntries.length,
    texKnown: Object.keys(tex).length, texMissing: idsSeen.size - Object.keys(tex).length,
    sample: { 1: out[1], 3: out[3], 50: out[50] },
  }));
} else {
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`_old-vanilla-gore.json: ${entries.size} npcIds, ${entryCount} entries, `
    + `${unresolved.length} unresolved, ${defaultEntries.length} default-less, tex ${Object.keys(tex).length}/${idsSeen.size}`);
}
