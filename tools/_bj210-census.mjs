// BJ210 普查:字符串感知扫描全 src 数值 Set 字面量 × TileID.cs 1457 全表对拍
// 方法论同 BJ203(tools/_bj203-census.mjs 已删):lexer 跳过字符串/模板串/注释,
// 提取 new Set([...]) 与 [...] 数组字面量中的纯整数序列,与 /tmp/tileid1457-sets.json
// 148 张 bool 表(值集同构比较)对拍,报告命中表名+file:line+副本值序。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld/game/src';
const TABLES = JSON.parse(readFileSync('/tmp/tileid1457-sets.json', 'utf8'));
const tableSets = new Map(); // key = sorted joined values
for (const [name, vals] of Object.entries(TABLES)) {
  if (!vals.length) continue;
  const key = [...new Set(vals)].sort((a, b) => a - b).join(',');
  if (!tableSets.has(key)) tableSets.set(key, []);
  tableSets.get(key).push(name);
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) yield p;
  }
}

// 字符串感知 lexer:产出掩码(0=code,1=string/template,2=line comment,3=block comment)
function mask(src) {
  const m = new Uint8Array(src.length);
  let i = 0, n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') m[i++] = 2;
    } else if (c === '/' && src[i + 1] === '*') {
      m[i++] = 2; m[i++] = 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) m[i++] = 2;
      if (i < n) { m[i++] = 2; m[i++] = 2; }
    } else if (c === "'" || c === '"' || c === '`') {
      const q = c; m[i++] = 1;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { m[i++] = 1; if (i < n) m[i++] = 1; }
        else m[i++] = 1;
      }
      if (i < n) m[i++] = 1;
    } else i++;
  }
  return m;
}

// 提取所有 "new Set([ nums ])" 与独立数组字面量 [ nums ](限长度>=1,纯整数)
function extractLiterals(src, file) {
  const M = mask(src);
  const out = [];
  const isCode = (j) => M[j] === 0;
  const numRe = /-?\d+/g;
  // scan for "Set(" preceded by "new " OR array literal starts
  for (let i = 0; i < src.length; i++) {
    if (!isCode(i)) continue;
    // new Set([ ... ])
    if (src.startsWith('new Set', i) && isCode(i + 7)) {
      let j = i + 7;
      while (j < n_of(src) && /\s/.test(src[j]) && isCode(j)) j++;
      if (src[j] === '(') {
        j++;
        while (j < src.length && /\s/.test(src[j])) j++;
        if (src[j] === '[') {
          const lit = readBracket(src, j);
          if (lit) {
            const nums = pureInts(lit.body, M, lit.start);
            if (nums) out.push({ kind: 'newSet', file, line: lineAt(src, i), col: i, vals: nums, text: lit.full.slice(0, 120) });
          }
        }
      }
    }
    // lutFromSheets(new Set([ ... ])) is covered above; also catch plain arrays assigned via "= [ ... ]" only when flagged
  }
  return out;
}
const n_of = (s) => s.length;

function readBracket(src, start) {
  // start at '['
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) return { body: src.slice(start + 1, i), start, full: src.slice(start, i + 1) }; }
  }
  return null;
}

function pureInts(body, M, baseOffset) {
  // all non-space code chars must be digits or commas; also allow trailing comma
  const numRe = /\d+/g;
  let m;
  const nums = [];
  let sawAny = false;
  for (let k = 0; k < body.length; k++) {
    if (M[baseOffset + 1 + k] !== 0) continue; // skip strings/comments
    const ch = body[k];
    if (/\s/.test(ch)) continue;
    if (ch === ',') continue;
    if (/\d/.test(ch)) { sawAny = true; continue; }
    return null; // any other token → not a pure int literal
  }
  if (!sawAny) return null;
  // extract numbers with mask awareness
  let k = 0;
  while (k < body.length) {
    if (M[baseOffset + 1 + k] === 0 && /\d/.test(body[k])) {
      let v = 0;
      while (k < body.length && /\d/.test(body[k]) && M[baseOffset + 1 + k] === 0) { v = v * 10 + (+body[k]); k++; }
      nums.push(v);
    } else k++;
  }
  return nums;
}

function lineAt(src, idx) { let l = 1; for (let i = 0; i < idx; i++) if (src[i] === '\n') l++; return l; }

const hits = [];
let fileCount = 0;
for (const f of walk(ROOT)) {
  fileCount++;
  const src = readFileSync(f, 'utf8');
  const rel = relative('/Users/vinlic/Project/GLM/SandboxWorld/game', f);
  for (const lit of extractLiterals(src, rel)) {
    const key = [...new Set(lit.vals)].sort((a, b) => a - b).join(',');
    const tables = tableSets.get(key);
    if (tables) hits.push({ ...lit, tables });
  }
}

// group by table-name-group
const byKey = new Map();
for (const h of hits) {
  const k = h.tables.join('|');
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(h);
}
const sorted = [...byKey.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [k, list] of sorted) {
  console.log(`\n=== 表: ${k}  (${list.length} 处) ===`);
  for (const h of list) console.log(`  ${h.file}:${h.line}  [${h.vals.join(',')}]`);
}
console.log(`\n scanned ${fileCount} files, ${hits.length} table-matching literals`);
