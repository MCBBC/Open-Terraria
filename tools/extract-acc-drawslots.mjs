// 从 1456 反编译 Item.cs SetDefaults1-5 提取配饰身上贴图绘制槽（Player.cs
// UpdateVisibleAccessory :36441-36520 消费的 11 个 Item.xxxSlot 字段）：
//   backSlot/frontSlot/shieldSlot/shoeSlot/waistSlot/neckSlot/faceSlot/
//   balloonSlot/handOnSlot/handOffSlot/beardSlot
// → src/data/vanilla-acc-drawslots.json（vid → {family: slotId}，仅非空槽）。
// 解析口径与 tools/extract-equip-prefix.mjs 同法（case 共享体全体标签 + 嵌套
// switch(type) 命中分支 + type 算式求值），另补一类：default 体内的
// `if (type >= A && type <= B)` 范围块（虚荣披风 2284-2287 backSlot/frontSlot
// 算式族——extract-equip-prefix 的 case 段扫描不含 default 体，Boss 面具同款缺口，
// patch-vanity-stats.mjs ③ 同类补法）。
// 用法: node tools/extract-acc-drawslots.mjs [--audit]   （--audit 只比对不落盘）
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;
const AUDIT = process.argv.includes('--audit');
const src = readFileSync(`${ROOT}Terarria1456/Terraria/Item.cs`, 'utf8');

// ---- 与 extract-equip-prefix.mjs 同款的解析核（该脚本非模块,此处复制;改动须双同步）----
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

/** case/default 段收集（default 也收——键 'def'，供范围块二次解析） */
function outerCaseSegments(src) {
  const out = new Map();
  const collect = (body) => {
    const tokRe = /switch\s*\(([^)]*)\)|case (\d+):|default:|[{}]/g;
    const stack = [];
    let depth = 0;
    let m;
    while ((m = tokRe.exec(body))) {
      const t = m[0];
      if (t.startsWith('switch')) {
        stack.push({ isType: /switch\s*\(\s*type\b/.test(t), opened: false, bodyDepth: -1, labels: [], segStart: 0 });
      } else if (t === '{') {
        depth++;
        const top = stack[stack.length - 1];
        if (top && !top.opened) { top.opened = true; top.bodyDepth = depth; top.segStart = m.index + 1; }
      } else if (t === '}') {
        const top = stack[stack.length - 1];
        if (top && top.opened && depth === top.bodyDepth) {
          const seg = body.slice(top.segStart, m.index);
          if (seg.trim() !== '') {
            // switch 收尾段：末标签组同写；无标签（default 收尾/switch 前缀）→ def 累积
            if (top.labels.length === 0) {
              const prev = out.get('def') ?? '';
              out.set('def', prev ? prev + '\n' + seg : seg);
            } else {
              for (const id of top.labels) out.set(id, seg);
            }
          }
          stack.pop();
        }
        depth--;
      } else {
        const top = stack[stack.length - 1];
        if (top && top.opened && top.isType) {
          const seg = body.slice(top.segStart, m.index);
          if (seg.trim() !== '') {
            // 落空标签组（case A: case B: 共享体）全体标签同写；default 体单独
            // 累积（键 'def'）供范围块二次解析
            if (top.labels.length === 0) {
              const prev = out.get('def') ?? '';
              out.set('def', prev ? prev + '\n' + seg : seg);
            } else {
              for (const id of top.labels) out.set(id, seg);
            }
            top.labels = [];
          }
          if (t !== 'default:') top.labels.push(+m[2]);
          top.segStart = m.index + t.length;
        }
      }
    }
  };
  for (const n of [1, 2, 3, 4, 5]) {
    const body = methodBodyOf(src, `private void SetDefaults${n}(`)
      || methodBodyOf(src, `public void SetDefaults${n}(`)
      || methodBodyOf(src, `void SetDefaults${n}(`);
    if (body) collect(body);
  }
  return out;
}

const CASE_SEGMENTS = outerCaseSegments(src);

function typeSwitchSpans(seg) {
  const spans = [];
  const re = /switch\s*\(\s*type\s*\)/g;
  let m;
  while ((m = re.exec(seg))) {
    const brace = seg.indexOf('{', m.index + m[0].length);
    if (brace < 0) break;
    let d = 0, end = -1;
    for (let i = brace; i < seg.length; i++) {
      if (seg[i] === '{') d++;
      else if (seg[i] === '}') { d--; if (d === 0) { end = i; break; } }
    }
    if (end < 0) break;
    spans.push([m.index, end + 1]);
    re.lastIndex = end + 1;
  }
  return spans;
}

function parseSwitchCases(swBody) {
  const cases = new Map();
  let def = null;
  const tokRe = /case (\d+):|default:|[{}]/g;
  let depth = 0, segStart = 0, m;
  let pending = [];
  const flush = (endIdx) => {
    const body = swBody.slice(segStart, endIdx);
    if (body.trim() === '') return;
    for (const L of pending) { if (L === 'def') def = body; else cases.set(L, body); }
    pending = [];
  };
  while ((m = tokRe.exec(swBody))) {
    const t = m[0];
    if (t.startsWith('case') || t === 'default:') {
      if (depth === 0) {
        flush(m.index);
        pending.push(t === 'default:' ? 'def' : +m[1]);
        segStart = m.index + t.length;
      }
    } else if (t === '{') depth++;
    else if (t === '}') depth--;
  }
  flush(swBody.length);
  return { cases, def };
}

function caseParts(seg, id) {
  const spans = typeSwitchSpans(seg);
  const parts = [];
  let last = 0;
  for (const [s, e] of spans) {
    parts.push(seg.slice(last, s));
    const brace = seg.indexOf('{', s);
    const { cases, def } = parseSwitchCases(seg.slice(brace + 1, e - 1));
    parts.push(cases.has(id) ? cases.get(id) : (def ?? ''));
    last = e;
  }
  parts.push(seg.slice(last));
  return parts;
}

function evalTypeExpr(expr, id) {
  const cleaned = expr.replace(/\(\s*(?:sbyte|byte|short|ushort|int|uint|long|ulong)\s*\)\s*/g, '').trim();
  if (!/^[\d\s+\-*/().]*\btype\b[\d\s+\-*/().]*$/.test(cleaned)) return undefined;
  try {
    const v = new Function('type', `"use strict";return (${cleaned});`)(id);
    return Number.isFinite(v) ? v : undefined;
  } catch { return undefined; }
}

const FIELDS = ['backSlot', 'frontSlot', 'shieldSlot', 'shoeSlot', 'waistSlot', 'neckSlot',
  'faceSlot', 'balloonSlot', 'handOnSlot', 'handOffSlot', 'beardSlot'];

// ---- ① case 段：逐 id 逐字段（嵌套 switch 命中分支拼接,后值覆盖先值）----
const table = new Map();   // vid -> {family: slot}
const put = (id, fam, v) => {
  if (!Number.isFinite(v) || v <= 0) return;
  const k = String(id);
  if (!table.has(k)) table.set(k, {});
  table.get(k)[fam] = v;
};
const famOf = (f) => f.replace(/Slot$/, '').replace(/^handOn$/, 'handOn').replace(/^handOff$/, 'handOff')
  .replace('back', 'back').replace('front', 'front').replace('shield', 'shield').replace('shoe', 'shoe')
  .replace('waist', 'waist').replace('neck', 'neck').replace('face', 'face').replace('balloon', 'balloon')
  .replace('beard', 'beard');

for (const [id, seg] of CASE_SEGMENTS) {
  if (id === 'def') continue;
  for (const f of FIELDS) {
    const fam = famOf(f);
    let val;
    for (const p of caseParts(seg, id)) {
      const m = p.match(new RegExp(`\\b${f}\\s*=\\s*([^;]+);`));
      if (m && m[1] !== undefined) {
        const lit = m[1].trim();
        if (/^-?\d+$/.test(lit)) val = +lit;
        else {
          const v = evalTypeExpr(lit, id);
          if (v !== undefined) val = v;
        }
      }
    }
    if (val !== undefined) put(id, fam, val);
  }
}

// ---- ② default 体内 `if (type >= A && type <= B)` 范围块（嵌套 switch 已在
//      caseParts 命中分支处理,这里只取外层余体的范围块）----
for (const [key, seg] of CASE_SEGMENTS) {
  if (key !== 'def') continue;
  const spans = typeSwitchSpans(seg);
  const parts = [];
  let last = 0;
  for (const [s, e] of spans) { parts.push(seg.slice(last, s)); last = e; }
  parts.push(seg.slice(last));
  const outer = parts.join('\n');
  const rangeRe = /if\s*\(\s*type\s*>=\s*(\d+)\s*&&\s*type\s*<=\s*(\d+)\s*\)/g;
  let m;
  while ((m = rangeRe.exec(outer))) {
    const brace = outer.indexOf('{', m.index + m[0].length);
    if (brace < 0) continue;
    let d = 0, end = -1;
    for (let i = brace; i < outer.length; i++) {
      if (outer[i] === '{') d++;
      else if (outer[i] === '}') { d--; if (d === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    const body = outer.slice(brace + 1, end);
    const lo = +m[1], hi = +m[2];
    for (const f of FIELDS) {
      const fm = body.match(new RegExp(`\\b${f}\\s*=\\s*([^;]+);`));
      if (!fm) continue;
      const fam = famOf(f);
      for (let id = lo; id <= hi; id++) {
        const lit = fm[1].trim();
        const v = /^-?\d+$/.test(lit) ? +lit : evalTypeExpr(lit, id);
        if (v !== undefined) put(id, fam, v);
      }
    }
  }
}

// ---- 落盘 ----
const out = Object.fromEntries([...table.entries()]
  .map(([k, v]) => [k, Object.fromEntries(Object.entries(v).sort())])
  .sort((a, b) => +a[0] - +b[0]));
const json = JSON.stringify(out, null, 0) + '\n';
const TARGET = `${ROOT}game/src/data/vanilla-acc-drawslots.json`;
if (AUDIT) {
  const cur = readFileSync(TARGET, 'utf8');
  console.log(cur === json ? 'audit: identical' : 'audit: DRIFT');
  process.exitCode = cur === json ? 0 : 1;
} else {
  writeFileSync(TARGET, json);
}
const famCount = {};
for (const v of Object.values(out)) for (const f of Object.keys(v)) famCount[f] = (famCount[f] ?? 0) + 1;
console.log('vid 数:', Object.keys(out).length, '族分布:', JSON.stringify(famCount));
// 抽查锚点（Item.cs case 手读对照）：
//   49 再生手环 handOn=2(:1959 区) · 532 星星斗篷 back=2(:7701) ·
//   2284-2287 虚荣披风 back=3..6/front=1..4(范围块 :22968) · 5104-5106 威尔逊胡须
//   beard=2..4(:40884) · 3250-3252 马蹄气球族 balloon=13..15(:29923) ·
//   3730-3731 派对束气球 vanity balloon=16..17(:33035)
for (const probe of ['49', '532', '2284', '2287', '5104', '5106', '3250', '3252', '3730', '3731', '899', '900', '3991', '4822']) {
  console.log(' ', probe, JSON.stringify(out[probe] ?? null));
}
