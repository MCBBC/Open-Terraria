// SW-FX3 placeStyle 缺档邻族普查金标仪（一次性诊断，run-diag 通道）：
//   node tools/run-diag.mjs scripts/_swfx3-placestyle-census.mjs
// 结构层解析 Terarria1457 Item.cs SetDefaults1-5（+外层 SetDefaults 尾段）逐 id 重放
// placeStyle/createTile 终值（基态=Variant=null 口径，同 extract-itemfunc F-STRUCT 前例）。
// 与 tools/extract-itemfunc.mjs 的差别（=BJ50 判语的"共享 case 算式提取器盲区"）：
//   ① placeStyle RHS 支持【算式形态】`base + type - first`（evalArithExpr 同构,按 id 代入）
//   ② 支持【if 区间块】`if (type >= A && type <= B)`（extract-itemfunc 结构层只走 switch）
//   ③ switch `default:` 支在有界 id 集（外层 if 区间约束）时按「scope − 显式 case」归属
//   ④ DefaultTo helper 族（PlaceableTile/Torch/MusicBox/Banner/Monolith/SeaShell）展开
// 每条记录带形态标签+源行号（亲读核对用）；不可解条件标记 unresolved（拒值不拒产）。
// 运行时对拍：/tmp/swfx3-items-bundle.mjs（esbuild 打包 src/data/items.ts,见 _swfx3-runtime-dump.ts）。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const OUT = '/tmp/swfx3-gold-census.json';
const VER = process.env.SWFX3_VER ?? '1457';
const itemSrc = readFileSync(`${ROOT}/Terarria${VER}/Terraria/Item.cs`, 'utf8');

// ---- 剥注释（等长空格替换,保行号）;字符串/字符字面量内部同样空格化——
//      字面量里的 { } ( ) 会让括号配平失效（外层 SetDefaults 卡死根因）----
function stripComments(src) {
  let out = '';
  let i = 0, n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i); if (j < 0) j = n;
      out += ' '.repeat(j - i); i = j;
    } else if (c === '/' && src[i + 1] === '*') {
      let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
      const seg = src.slice(i, j);
      out += seg.replace(/[^\n]/g, ' '); i = j;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      // 字面量体（含引号）全空格化,保长度
      out += ' '.repeat(Math.min(j + 1, n) - i); i = j + 1;
    } else { out += c; i++; }
  }
  return out;
}
const SRC = stripComments(itemSrc);
// 行号：惰性换行偏移表 + 二分（逐调用全量 slice+split 在 2MB 源上是平方级,曾拖垮普查）
let _nl = null;
const lineOf = (absIdx) => {
  if (_nl === null) {
    _nl = [0];
    for (let i = 0; i < SRC.length; i++) if (SRC.charCodeAt(i) === 10) _nl.push(i + 1);
  }
  let lo = 0, hi = _nl.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (_nl[mid] <= absIdx) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
};

function methodBodyOf(name) {
  const idx = SRC.indexOf(name);
  if (idx < 0) return null;
  const start = SRC.indexOf('{', idx);
  let depth = 0;
  for (let i = start; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) return { text: SRC.slice(start + 1, i), start: start + 1 }; }
  }
  return null;
}

// ---- 算式求值（evalArithExpr 同构；memo 编译）----
//  反编译布尔计数惯用法 `(type > N).ToInt()` → `((type>N)?1:0)`（伪箱族 :32930），
//  字符集扩展 ? : > <（三目只出现在该惯用法展开内）
const arithMemo = new Map();
function evalArith(expr, id) {
  let s = expr.replace(/\(\s*(?:ushort|short|sbyte|uint|int)\s*\)/g, '').replace(/\s+/g, '');
  if (/^[-+]?\d+$/.test(s)) return parseInt(s, 10);
  if (!s.includes('type')) return undefined;
  let fn = arithMemo.get(s);
  if (fn === undefined) {
    const canon = s
      .replace(/\(\s*type\s*>\s*(\d+)\s*\)\.ToInt\(\)/g, '((type>$1)?1:0)')
      .replace(/\(\s*type\s*<\s*(\d+)\s*\)\.ToInt\(\)/g, '((type<$1)?1:0)');
    if (!/^[\d()+\-*/?:><]*$/.test(canon.replace(/\btype\b/g, ''))) return undefined;
    const js = canon.replace(/\btype\b/g, '(type)');
    try { fn = Function('type', `"use strict";return (${js});`); } catch { return undefined; }
    arithMemo.set(s, fn);
  }
  try { const v = fn(id); return Number.isFinite(v) ? Math.trunc(v) : undefined; } catch { return undefined; }
}

/** 条件求值（基态口径）→ {ids:Set(命中子集), unknown:bool} */
function evalCond(cond, ids) {
  let s = cond.trim().replace(/\s+/g, ' ');
  // Variant 条件（基态 SelectVariant=null ⇒ == 恒假、!= 恒真,F-STRUCT 前例）
  if (/\bvariant\b|\bVariant\b/.test(s) && !/\btype\b/.test(s.replace(/\bItemVariants?\.|\bDisabledBossSummonVariant\b|\bEnabledVariant\b/g, ''))) {
    if (/!=/.test(s)) return { ids: new Set(ids), unknown: false };
    if (/==/.test(s)) return { ids: new Set(), unknown: false };
    return { ids: new Set(), unknown: true };
  }
  s = s.replace(/currentItem\./g, '').replace(/\bType\b/g, 'type');
  // 顶层 || 析取
  const orParts = splitTop(s, '||');
  if (orParts.length > 1) {
    const res = new Set(); let unk = false;
    for (const p of orParts) {
      const r = evalCond(p, ids);
      if (r.unknown) unk = true; else for (const x of r.ids) res.add(x);
    }
    return { ids: res, unknown: unk };
  }
  // 顶层 && 合取
  const andParts = splitTop(s, '&&');
  if (andParts.length > 1) {
    let cur = new Set(ids); let unk = false;
    for (const p of andParts) {
      const r = evalCond(p, cur);
      if (r.unknown) { unk = true; break; }
      cur = r.ids;
      if (cur.size === 0) break;
    }
    return { ids: cur, unknown: unk };
  }
  const m1 = /^type\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/.exec(s);
  if (m1) return { ids: filterIds(ids, m1[1], +m1[2]), unknown: false };
  const m2 = /^(-?\d+)\s*(==|!=|>=|<=|>|<)\s*type$/.exec(s);
  if (m2) return { ids: filterIds(ids, flipOp(m2[2]), +m2[1]), unknown: false };
  return { ids: new Set(ids), unknown: true };
}
function flipOp(op) { return { '==': '==', '!=': '!=', '>=': '<=', '<=': '>=', '>': '<', '<': '>' }[op]; }
function filterIds(ids, op, a) {
  const out = new Set();
  for (const x of ids) {
    const ok = op === '==' ? x === a : op === '!=' ? x !== a : op === '>=' ? x >= a : op === '<=' ? x <= a : op === '>' ? x > a : x < a;
    if (ok) out.add(x);
  }
  return out;
}
/** 顶层二元分割（括号感知） */
function splitTop(s, sep) {
  const parts = []; let d = 0; let last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') d++;
    else if (c === ')') d--;
    else if (d === 0 && s.startsWith(sep, i)) { parts.push(s.slice(last, i)); i += sep.length - 1; last = i + 1; }
  }
  parts.push(s.slice(last));
  return parts;
}

// ---- 语句层扫描工具 ----
function skipWs(text, i) {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}
function scanParenClose(text, i) { // text[i]==='(' → index of matching ')'
  let d = 0;
  for (; i < text.length; i++) {
    if (text[i] === '(') d++;
    else if (text[i] === ')') { d--; if (d === 0) return i; }
  }
  return -1;
}
function scanBrace(text, i) { // text[i]==='{' → matching '}'
  let d = 0;
  for (; i < text.length; i++) {
    if (text[i] === '{') d++;
    else if (text[i] === '}') { d--; if (d === 0) return i; }
  }
  return -1;
}
/** 失配防御：返回 text.length（保证 walk 的 i 恒前进,杜绝 be=-1 → j=0 死循环） */
function scanBraceSafe(text, i) {
  const r = scanBrace(text, i);
  return r < 0 ? text.length : r;
}
function stmtEnd(text, i) { // index of terminating ';' at paren-depth 0
  let d = 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === '(') d++;
    else if (c === ')') d--;
    else if (c === ';' && d === 0) return i;
  }
  return -1;
}

// ---- DefaultTo helper 语义（1457 Item.cs helper 体逐行核对）----
// PlaceableTile(tile[,style=0]) :48494-48509 → createTile=arg0, placeStyle=arg1 ?? 0
// Torch(tileStyle[,..]) :48471-48488 → createTile=4, placeStyle=arg0
// MusicBox(style) :48638 → createTile=139, placeStyle=style
// Banner(style=0) :47754 → createTile=91, placeStyle=style
// Monolith(tile,style) :47762 → createTile=arg0, placeStyle=arg1 ?? 0
// SeaShell() :47967-47601+ → createTile=324 + 按 type 分档 placeStyle（显式 if 链, Census 特判 3227-3230）
function splitArgs(argText) {
  const parts = []; let d = 0; let last = 0;
  for (let i = 0; i < argText.length; i++) {
    const c = argText[i];
    if (c === '(') d++; else if (c === ')') d--;
    else if (c === ',' && d === 0) { parts.push(argText.slice(last, i).trim()); last = i + 1; }
  }
  parts.push(argText.slice(last).trim());
  return parts;
}

const HELPER_TABLE = {
  PlaceableTile: { n: 2, apply: (args, id, st) => { st.ct = { v: Number(args[0]), line: st.line }; st.ps = { rhs: args[1] ?? '0', line: st.line, form: 'helper:PlaceableTile' }; } },
  Torch: { n: 2, apply: (args, id, st) => { st.ct = { v: 4, line: st.line }; st.ps = { rhs: args[0], line: st.line, form: 'helper:Torch' }; } },
  MusicBox: { n: 1, apply: (args, id, st) => { st.ct = { v: 139, line: st.line }; st.ps = { rhs: args[0], line: st.line, form: 'helper:MusicBox' }; } },
  Banner: { n: 1, apply: (args, id, st) => { st.ct = { v: 91, line: st.line }; st.ps = { rhs: args[0] ?? '0', line: st.line, form: 'helper:Banner' }; } },
  Monolith: { n: 2, apply: (args, id, st) => { st.ct = { v: Number(args[0]), line: st.line }; st.ps = { rhs: args[1] ?? '0', line: st.line, form: 'helper:Monolith' }; } },
};

// ---- 主 walker：重放语句序,per-id 写 out ----
// out: Map(vid → {ps:{v,form,line}|undefined, ct:{v,line}|undefined, flags:Set})
// 返回 { returned:Set(ids) }——C# return 退出整个方法（跨过后续兄弟语句），
// 调用方必须把 returned 从活跃 id 集里剔除（2237 型伪污染根修）。
const EMPTY_SET = new Set();
function walk(text, ids, out, baseAbs) {
  let active = ids;
  const returned = new Set();
  let i = 0;
  while (i < text.length && active.size > 0) {
    i = skipWs(text, i);
    if (i >= text.length) break;
    if (text.startsWith('if', i) && !/[\w.]/.test(text[i - 1] ?? ' ')) {
      const hp = text.indexOf('(', i);
      const he = scanParenClose(text, hp);
      if (he < 0) break;
      const cond = text.slice(hp + 1, he);
      let j = skipWs(text, he + 1);
      let thenText, thenStart, isBlock = false;
      if (text[j] === '{') { const be = scanBraceSafe(text, j); thenText = text.slice(j + 1, be); thenStart = j + 1; j = be + 1; isBlock = true; }
      else { const se = stmtEnd(text, j); if (se < 0) break; thenText = text.slice(j, se + 1); thenStart = j; j = se + 1; }
      // else?
      let elseText = null; let elseStart = 0;
      const k = skipWs(text, j);
      if (text.startsWith('else', k) && !/[\w.]/.test(text[k + 4] ?? ' ')) {
        let k2 = skipWs(text, k + 4);
        if (text[k2] === '{') { const be = scanBraceSafe(text, k2); elseText = text.slice(k2 + 1, be); elseStart = k2 + 1; j = be + 1; }
        else { const se = stmtEnd(text, k2); elseText = text.slice(k2, se + 1); elseStart = k2; j = se + 1; }
      }
      const r = evalCond(cond, active);
      const line = baseAbs ? lineOf(baseAbs + i) : 0;
      if (r.unknown) {
        // 不可解条件：基态口径=支不采用只走 else（F-STRUCT 前例）+ unresolved 标记
        for (const x of active) out.get(x)?.flags.add(`unresolved-if@${line}`);
        if (elseText) {
          const rr = walk(elseText, active, out, baseAbs ? baseAbs + elseStart : 0);
          for (const x of rr.returned) returned.add(x);
        }
        active = new Set([...active].filter((x) => !returned.has(x)));
        i = j;
        continue;
      }
      const retThen = walk(thenText, r.ids, out, baseAbs ? baseAbs + thenStart : 0).returned;
      const elseIds = new Set([...active].filter((x) => !r.ids.has(x)));
      const retElse = elseText ? walk(elseText, elseIds, out, baseAbs ? baseAbs + elseStart : 0).returned : EMPTY_SET;
      for (const x of retThen) returned.add(x);
      for (const x of retElse) returned.add(x);
      active = new Set([...active].filter((x) => !returned.has(x)));
      i = j;
      continue;
    }
    if (text.startsWith('switch', i) && !/[\w.]/.test(text[i - 1] ?? ' ')) {
      const hp = text.indexOf('(', i);
      const he = scanParenClose(text, hp);
      const onType = /^\s*(?:currentItem\.)?type\s*$/.test(text.slice(hp + 1, he));
      let j = skipWs(text, he + 1);
      const be = text[j] === '{' ? scanBrace(text, j) : -1;
      if (be < 0) { i = he + 1; continue; }
      const body = text.slice(j + 1, be);
      if (onType) {
        const rr = walkSwitch(body, active, out, baseAbs ? baseAbs + j + 1 : 0);
        for (const x of rr.returned) returned.add(x);
        active = new Set([...active].filter((x) => !returned.has(x)));
      } else {
        const rr = walk(body, active, out, baseAbs ? baseAbs + j + 1 : 0);
        for (const x of rr.returned) returned.add(x);
        active = new Set([...active].filter((x) => !returned.has(x)));
        for (const x of active) out.get(x)?.flags.add('unresolved-switch-non-type');
      }
      i = be + 1;
      continue;
    }
    if (text.startsWith('return', i)) {
      for (const x of active) returned.add(x);
      break;
    }
    if (text.startsWith('break', i)) { return { returned, broke: true }; }
    // 普通语句：到 ';'
    let se = i;
    while (se < text.length && text[se] !== ';' && text[se] !== '{') se++;
    if (text[se] === '{') { // 裸块（罕见）
      const be = scanBraceSafe(text, se);
      const rr = walk(text.slice(se + 1, be), active, out, baseAbs ? baseAbs + se + 1 : 0);
      for (const x of rr.returned) returned.add(x);
      active = new Set([...active].filter((x) => !returned.has(x)));
      i = be + 1;
      continue;
    }
    const stmt = text.slice(i, se);
    processStmt(stmt, active, out, baseAbs ? baseAbs + i : 0);
    i = se + 1;
  }
  return { returned };
}

const DBG_VID = Number(process.env.SWFX3_DEBUG_VID ?? 0);
function processStmt(stmt, ids, out, abs) {
  const line = abs ? lineOf(abs) : 0;
  if (DBG_VID && ids.has(DBG_VID)) console.error(`[dbg@${line}] ids=${[...ids].slice(0, 8).join(',')}(${ids.size}) stmt=${stmt.trim().slice(0, 90)}`);
  const am = /(?:^|[^\w.])placeStyle\s*=\s*([^;]+)$/.exec(stmt);
  if (am) {
    for (const id of ids) {
      const rec = ensure(out, id);
      const v = evalArith(am[1], id);
      if (v === undefined) { rec.flags.add(`unresolved-ps-expr@${line}:${am[1].trim()}`); continue; }
      rec.ps = { v, form: /\btype\b/.test(am[1]) ? 'arith' : 'literal', line, rhs: am[1].trim() };
    }
    return;
  }
  const cm = /(?:^|[^\w.])createTile\s*=\s*([^;]+)$/.exec(stmt);
  if (cm) {
    for (const id of ids) {
      const rec = ensure(out, id);
      const v = evalArith(cm[1], id);
      if (v === undefined) { rec.flags.add(`unresolved-ct-expr@${line}`); continue; }
      rec.ct = { v, line };
    }
    return;
  }
  const hm = /\bDefaultTo(\w+)\s*\(/.exec(stmt);
  if (hm) {
    const name = hm[1];
    const hp = stmt.indexOf('(', hm.index);
    const he = scanParenClose(stmt, hp);
    const args = splitArgs(stmt.slice(hp + 1, he));
    const h = HELPER_TABLE[name];
    if (h) {
      for (const id of ids) {
        const rec = ensure(out, id);
        const st = { line, ct: null, ps: null };
        // helper 实参可能是算式（DefaultToPlaceableTile(1086+(type-5594)) 前例）
        const resArgs = args.map((a) => ({ raw: a, v: evalArith(a, id) }));
        if (resArgs.some((a) => a.v === undefined)) { rec.flags.add(`unresolved-helper-${name}@${line}`); continue; }
        st.line = line;
        h.apply(resArgs.map((a) => String(a.v)), id, st);
        if (st.ct) rec.ct = { v: st.ct.v, line };
        if (st.ps) {
          const v = evalArith(st.ps.rhs, id);
          if (v === undefined) rec.flags.add(`unresolved-helper-ps@${line}`);
          else rec.ps = { v, form: st.ps.form, line };
        }
      }
      return;
    }
    // 其他 helper（DefaultToCapturedCritter 等）不涉 placeStyle 除非其体内有——
    // CapturedCritter createTile=724 placeStyle 缺省 0;Kite createTile=723;SeaShell 特判
    if (name === 'SeaShell') {
      // :47967 createTile=324;if 链 placeStyle 12/9/6/3——ids 仅 3227-3230 域,per-id 特判由 亲读 落
      for (const id of ids) {
        const rec = ensure(out, id);
        rec.ct = { v: 324, line };
        rec.flags.add(`helper-SeaShell@${line}`);
      }
      return;
    }
    if (name === 'CapturedCritter') {
      for (const id of ids) { const rec = ensure(out, id); rec.ct = { v: 724, line }; if (rec.ps === undefined) rec.ps = { v: 0, form: 'helper:CapturedCritter', line }; }
      return;
    }
    if (name === 'Kite') {
      for (const id of ids) { const rec = ensure(out, id); rec.ct = { v: 723, line }; if (rec.ps === undefined) rec.ps = { v: 0, form: 'helper:Kite', line }; }
      return;
    }
    return;
  }
}

function ensure(out, id) {
  let r = out.get(id);
  if (!r) { r = { ps: undefined, ct: undefined, flags: new Set() }; out.set(id, r); }
  return r;
}

/** switch(type) 体解析：case 分组（fallthrough）+ default 归属（有界 id 集）。
 *  返回 { returned:Set }——case 体内的 return 退出整个方法（跨过 switch 后的兄弟语句） */
function walkSwitch(body, ids, out, abs) {
  // 收集段：label → [bodyStart,bodyEnd)
  const segs = []; // {ids:[...], def:boolean, start, end}
  let d = 0; let cur = null; let i = 0;
  const n = body.length;
  while (i < n) {
    const c = body[i];
    if (c === '{') { d++; i++; continue; }
    if (c === '}') { d--; i++; continue; }
    if (d === 0) {
      if (body.startsWith('case', i)) {
        const colon = body.indexOf(':', i);
        if (cur) { cur.end = i; segs.push(cur); }
        cur = { labels: [parseInt(body.slice(i + 4, colon).trim(), 10)], def: false, start: colon + 1, end: 0 };
        i = colon + 1; continue;
      }
      if (body.startsWith('default', i) && /[\s:]/.test(body[i + 7] ?? ' ')) {
        if (cur) { cur.end = i; segs.push(cur); }
        const colon = body.indexOf(':', i);
        cur = { labels: [], def: true, start: colon + 1, end: 0 };
        i = colon + 1; continue;
      }
    }
    i++;
  }
  if (cur) { cur.end = n; segs.push(cur); }
  const returned = new Set();
  if (!segs.length) return { returned };
  const explicit = new Set();
  for (const s of segs) for (const l of s.labels) explicit.add(l);
  // fallthrough 组装：空体段并入下一非空段
  for (let g = 0; g < segs.length; g++) {
    const seg = segs[g];
    const bodyText = body.slice(seg.start, seg.end);
    const isEmpty = bodyText.replace(/\s/g, '') === '';
    if (isEmpty && g + 1 < segs.length) continue; // 落到下一段处理（组员累积在 next）
    // 收集组员（从最后一段非空往前回溯连续空段）
    const members = [];
    for (let b = g; b >= 0; b--) {
      const s2 = segs[b];
      if (b !== g && body.slice(s2.start, s2.end).replace(/\s/g, '') !== '') break;
      for (const l of s2.labels) members.push(l);
      if (s2.def) members.push('DEFAULT');
    }
    const memberIds = new Set();
    let hasDefault = false;
    for (const m of members) {
      if (m === 'DEFAULT') { hasDefault = true; continue; }
      if (ids.has(m)) memberIds.add(m);
    }
    if (hasDefault) {
      // default 归属 = scope − 显式 case（仅当 scope 有界 ≤ 4096 才可信展开;
      // 全域 default 段通常是 if(type==N) 链,walker 会在其内按 id 细分——
      // 此处把 scope 全部放入,赋值若为字面值会污染全域 → 仅在 scope 有界时展开
      if (ids.size <= 4096) {
        for (const x of ids) if (!explicit.has(x)) memberIds.add(x);
      } else {
        for (const x of ids) { ensure(out, x).flags.add('unbounded-default'); }
        const rr = walk(bodyText, ids, out, abs + seg.start);
        for (const x of rr.returned) returned.add(x);
        continue;
      }
    }
    const r = walk(bodyText, memberIds, out, abs + seg.start);
    for (const x of r.returned) returned.add(x);
  }
  return { returned };
}

// ================= 主流程 =================
const out = new Map();
const allIds = new Set(Array.from({ length: 7000 }, (_, k) => k + 1));
const T0 = Date.now();
for (const n of [1, 2, 3, 4, 5]) {
  const mb = methodBodyOf(`void SetDefaults${n}(`) || methodBodyOf(`SetDefaults${n}(`);
  if (!mb) { console.error(`SetDefaults${n} not found`); process.exit(2); }
  const t = Date.now();
  walk(mb.text, allIds, out, mb.start);
  const nPs = [...out.values()].filter((r) => r.ps !== undefined).length;
  console.error(`SetDefaults${n}: ${Date.now() - t}ms, out.size=${out.size}, ps-set=${nPs}, flagsUnbounded=${[...out.values()].filter((r) => r.flags.has('unbounded-default')).length}`);
}
console.error(`total walk ${Date.now() - T0}ms`);
// 自检：BJ50 已定谳的四个锚 vid（:21796/:22624/:27097/:28181-28193）
for (const k of [2045, 2237, 2827, 3046, 966, 5299]) {
  const g = out.get(k);
  console.error(`self-check vid=${k} ps=${g?.ps?.v} form=${g?.ps?.form} line=${g?.ps?.line} flags=${[...(g?.flags ?? [])].join('|')}`);
}
// 外层 SetDefaults 尾段（委托后可能有 placeStyle 写面——核对性扫描）
{
  const t = Date.now();
  console.error('phase: locating outer SetDefaults...');
  const mbTop = methodBodyOf('public void SetDefaults(');
  console.error(`phase: outer body=${mbTop ? mbTop.text.length : 'null'} chars @${mbTop?.start} (${Date.now() - t}ms)`);
  const topFlagsBefore = out.size;
  walk(mbTop.text, allIds, out, mbTop.start);
  console.error(`outer SetDefaults walked ${Date.now() - t}ms (out ${topFlagsBefore} -> ${out.size})`);
}
{
  const t = Date.now();
  const gold = {};
  for (const [vid, r] of [...out.entries()].sort((a, b) => a[0] - b[0])) {
    gold[vid] = {
      ps: r.ps?.v, psForm: r.ps?.form, psLine: r.ps?.line, psRhs: r.ps?.rhs,
      ct: r.ct?.v, ctLine: r.ct?.line,
      flags: [...r.flags],
    };
  }
  writeFileSync(OUT, JSON.stringify(gold, null, 1));
  console.error(`gold serialized ${Date.now() - t}ms (${Object.keys(gold).length} vids)`);
  void gold;
}

// 序列化（见上方 timing 块;gold 变量在此作用域重建引用）
const gold = (() => {
  const g = {};
  for (const [vid, r] of [...out.entries()].sort((a, b) => a[0] - b[0])) {
    g[vid] = {
      ps: r.ps?.v, psForm: r.ps?.form, psLine: r.ps?.line, psRhs: r.ps?.rhs,
      ct: r.ct?.v, ctLine: r.ct?.line,
      flags: [...r.flags],
    };
  }
  return g;
})();

// ---- 运行时对拍（若 bundle 在位）----
const UNRES_TOKENS = ['unresolved-ps-', 'unresolved-helper', 'helper-SeaShell'];
const bundlePath = '/tmp/swfx3-items-bundle.mjs';
if (existsSync(bundlePath)) {
  const t = Date.now();
  const rt = await import(bundlePath);
  const defs = rt.ITEM_DEFS;
  console.error(`bundle imported ${Date.now() - t}ms (${defs.length} defs)`);
  const mism = [];
  let placeable = 0, ok = 0;
  for (const d of defs) {
    const m = /^vi_(\d+)_/.exec(d.key);
    if (!m) continue;
    const vid = Number(m[1]);
    if (!d.tile) continue;   // 只对可放置件
    placeable++;
    const g = gold[vid];
    const flags = (g?.flags ?? []).filter((f) => {
      // 外层 SetDefaults(:48666+) 的未解条件与 placeStyle 无关（全外层仅 :48982 一处
      // 无条件 placeStyle=0 复位,亲读核实）——只有 SetDefaults1-5 域内(<48666)的
      // ps 相关未解标记才算真未解
      if (f.startsWith('unresolved-if@')) return Number(f.slice('unresolved-if@'.length)) < 48666;
      return UNRES_TOKENS.some((tk) => f.startsWith(tk));
    });
    const unresolved = flags.length > 0;
    const rps = d.placeStyle; // undefined ↔ 0 语义等价（放置链 ?? 0）
    const eff = rps ?? 0;
    if (unresolved && (g?.ps === undefined || flags.some((f) => f.startsWith('helper-')))) {
      mism.push({ vid, tile: d.tile, rps: rps ?? null, kind: 'UNRESOLVED', flags });
      continue;
    }
    const goldPs = g?.ps ?? 0;   // 无赋值 = C# 缺省 0
    if (eff !== goldPs) {
      mism.push({ vid, tile: d.tile, rps: rps ?? null, goldPs, goldForm: g?.psForm, goldLine: g?.psLine, kind: rps === undefined ? 'MISSING' : 'WRONG' });
      continue;
    }
    ok++;
  }
  writeFileSync('/tmp/swfx3-mismatch.json', JSON.stringify({ placeable, ok, mismatches: mism }, null, 1));
  console.error(`runtime compare: placeable=${placeable} ok=${ok} mismatches=${mism.length} -> /tmp/swfx3-mismatch.json`);
} else {
  console.error('no runtime bundle at /tmp/swfx3-items-bundle.mjs — gold only');
}
