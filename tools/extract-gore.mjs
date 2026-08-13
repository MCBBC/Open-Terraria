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
// 产物：src/data/vanilla-gore.json
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
const OUT = join(ROOT, 'src', 'data', 'vanilla-gore.json');
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
  return { types: include, exclude, life, gates, ai, typeCtxId };
}

function recordLocalAssign(name, valExpr, line, typeCtxId) {
  if (!locals.has(name)) locals.set(name, []);
  locals.get(name).push({ line, valExpr, typeCtxId });
}

/** 局部变量按 type 还原 → {kind:id|range|ids|perType} | null */
function resolveLocal(e, callLine, typeCtxId, include) {
  const hist = (locals.get(e.name) ?? []).filter((h) => h.line < callLine && h.typeCtxId === typeCtxId);
  if (!hist.length) return null;
  const shift = (v) => {
    if (v == null) return null;
    if (v.kind === 'id') return { kind: 'id', id: v.id + e.off };
    if (v.kind === 'range') return { kind: 'range', min: v.min + e.off, max: v.max + e.off };
    if (v.kind === 'ids') return { kind: 'ids', ids: v.ids.map((i) => i + e.off) };
    return null;
  };
  if (include) {
    const perType = new Map();
    for (const t of include) {
      let v = null;
      for (const h of hist) {
        const hv = evalIdExpr(h.valExpr);
        if (!hv || hv.kind === 'local' || hv.kind === undefined) { v = null; break; }
        v = shift(hv);
      }
      if (!v) return null;
      perType.set(t, JSON.stringify(v));
    }
    const uniq = [...new Set(perType.values())];
    if (uniq.length === 1) return JSON.parse(uniq[0]);
    const per = new Map();
    for (const [t, raw] of perType) per.set(t, JSON.parse(raw));
    return { kind: 'perType', per };
  }
  const hv = evalIdExpr(hist[hist.length - 1].valExpr);
  if (!hv || hv.kind === 'local') return null;
  return shift(hv);
}

function idFields(e) {
  if (e.kind === 'id') return { id: e.id };
  if (e.kind === 'range') return { idMin: e.min, idMax: e.max, n: e.max - e.min + 1 };
  if (e.kind === 'ids') return { ids: e.ids, n: e.ids.length };
  return {};
}

function emitEntry(npcId, fields, line, gates, ai) {
  if (!entries.has(npcId)) entries.set(npcId, []);
  const f = { ...fields, line };
  if (gates.length) f.gates = gates;
  if (ai.length) f.ai = ai;
  entries.get(npcId).push(f);
}

// ---------- 逻辑行扫描 ----------
for (const { text: raw0, line: lineNo } of logical) {
  let s = raw0;
  // 1) 前导闭括号（跳过缩进）：弹栈 + 清 case 标签
  const mClose = s.match(/^\s*\}+/);
  const closes = mClose ? mClose[0].trim().length : 0;
  if (closes) {
    for (let k = 0; k < closes && stack.length; k++) stack.pop();
    depth -= closes;
    for (const k of [...caseAt.keys()]) if (k > depth) caseAt.delete(k);
    s = s.slice(mClose[0].length);
  }
  const trimmed = s.trim();
  if (!trimmed) continue;

  // 2) 局部变量赋值流（声明与重赋值；供 `num + K` id 还原）
  {
    let m;
    if ((m = trimmed.match(/^(?:int|float|double|byte|short|long|uint|var|bool|Vector2)\s+([A-Za-z_]\w*)\s*=\s*(.+?);$/))
      || (m = trimmed.match(/^([A-Za-z_]\w*)\s*=(?![=>])\s*(.+?);$/))) {
      if (!/^(if|for|while|switch|return|else)$/.test(m[1])) {
        const r = resolveChain(null);
        recordLocalAssign(m[1], m[2], lineNo, r.typeCtxId);
      }
    }
  }

  // 3) 守卫头解析
  let guard = null, caseLabel = undefined;
  {
    let m;
    if ((m = trimmed.match(/^(else\s+if|if)\s*\(/))) guard = makeGuard(m[1].replace(/\s+/g, ''), parenBody(trimmed, m[0].length - 1));
    else if (/^else(\s|$)/.test(trimmed)) guard = makeGuard('else', 'else');
    else if ((m = trimmed.match(/^switch\s*\(/))) guard = makeGuard('switch', parenBody(trimmed, m[0].length - 1));
    else if ((m = trimmed.match(/^case\s+(.+?):/))) caseLabel = m[1].trim();
    else if (/^default\s*:/.test(trimmed)) caseAt.set(depth, null);
    else if (/^(for|foreach|while|do|try)\b/.test(trimmed)) guard = { kind: 'loop', cond: null, types: null, exclude: null, bounds: null, life: null, gate: null, ai: null };
  }
  if (caseLabel !== undefined) {
    const e = evalIdExpr(caseLabel);
    caseAt.set(depth, { label: caseLabel, types: e && e.kind === 'id' ? new Set([e.id]) : null });
  }

  // 4) 压栈（本行 '{'；守卫行无 '{' 时挂 pending 等下一行）
  const opens = (trimmed.match(/\{/g) || []).length;
  if (opens) {
    for (let k = 0; k < opens; k++) pushCtx(k === 0 ? (guard ?? pendingGuard) : null);
    depth += opens;
    pendingGuard = null;
  } else if (guard) {
    pendingGuard = guard;
  }

  // 5) Gore.NewGore / NewGorePerfect / NewGoreDirect 调用
  let searchFrom = 0;
  for (;;) {
    const at = trimmed.indexOf('Gore.NewGore', searchFrom);
    if (at < 0) break;
    searchFrom = at + 1;
    callsTotal++;
    const p = trimmed.indexOf('(', at);
    if (p < 0) continue;
    const callee = trimmed.slice(at, p);
    if (!/^Gore\.NewGore(Perfect|Direct)?$/.test(callee)) continue;
    const a = namedArgs(splitArgs(parenBody(trimmed, p)));
    if (a.Position === undefined || a.Type === undefined) continue;
    const cc = caseAt.get(depth) ?? caseAt.get(depth - 1) ?? null;
    if (process.env.GORE_DBG_LINE && lineNo === +process.env.GORE_DBG_LINE) {
      console.error('[dbg] line', lineNo, 'depth', depth, 'stack', JSON.stringify(stack.map((c) => c?.cond)), 'case', cc?.label ?? null);
    }
    const r = resolveChain(cc ? { id: 0, kind: 'case', cond: `case ${cc.label}`, types: cc.types, exclude: null, bounds: null, life: null, gate: null, ai: null } : null);

    if (r.gates.some((g) => g.includes('UsesPartyHat'))) { callsPartySkipped++; continue; } // 派对帽专属
    if (r.life === 'alive') { callsHitSkipped++; continue; }                               // hit 段

    const velFields = (() => {
      const v = String(a.Velocity ?? 'velocity');
      if (v === 'velocity') return {};
      if (v === 'Vector2.Zero') return { vx: 0, vy: 0 };
      let m;
      if ((m = v.match(/^new Vector2\(\s*(-?[\d.]+)[fF]?\s*,\s*(-?[\d.]+)[fF]?\s*\)$/))) return { vx: +m[1], vy: +m[2] };
      return { velExpr: v };
    })();
    const scaleFields = (() => {
      const v = a.Scale;
      if (v === undefined || v === '1f' || v === '1') return {};
      let m;
      if ((m = String(v).match(/^([\d.]+)[fF]?$/))) return { scale: +m[1] };
      return { scaleExpr: String(v) };
    })();
    const posFields = a.Position === 'position' ? {} : { posExpr: String(a.Position) };
    const perfect = callee === 'Gore.NewGorePerfect' ? { perfect: true } : {};
    const base = { ...velFields, ...scaleFields, ...posFields, ...perfect };

    let e = evalIdExpr(a.Type);
    let perType = null;
    if (e && e.kind === 'local') {
      const res = resolveLocal(e, lineNo, r.typeCtxId, r.types);
      if (res?.kind === 'perType') perType = res.per;
      else if (res) e = res;
      else e = null;
    } else if (e && e.kind !== 'id' && e.kind !== 'range' && e.kind !== 'ids') {
      e = null;
    }

    if (!r.types) {
      defaultEntries.push({ line: lineNo, idExpr: String(a.Type), gates: r.gates });
      continue;
    }
    const target = [...r.types].filter((t) => !r.exclude.has(t));

    if (perType) {
      for (const t of target) {
        const v = perType.get(t);
        const f = Array.isArray(v) ? { ids: v, n: v.length }
          : typeof v === 'object' ? { idMin: v.min, idMax: v.max, n: v.max - v.min + 1 }
            : { id: v };
        emitEntry(t, { ...base, ...f }, lineNo, r.gates, r.ai);
      }
      continue;
    }
    if (e && (e.kind === 'id' || e.kind === 'range' || e.kind === 'ids')) {
      for (const t of target) emitEntry(t, { ...base, ...idFields(e) }, lineNo, r.gates, r.ai);
      continue;
    }
    for (const t of target) emitEntry(t, { ...base, expr: String(a.Type) }, lineNo, r.gates, r.ai);
    unresolved.push({
      line: lineNo, expr: String(a.Type),
      types: target.length > 6 ? `${target[0]}..${target[target.length - 1]}(${target.length})` : target.join('|'),
    });
  }
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
  console.log(`vanilla-gore.json: ${entries.size} npcIds, ${entryCount} entries, `
    + `${unresolved.length} unresolved, ${defaultEntries.length} default-less, tex ${Object.keys(tex).length}/${idsSeen.size}`);
}
