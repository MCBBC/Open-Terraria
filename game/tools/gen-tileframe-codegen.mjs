// gen-codegen.mjs — 把 tileframe-program.json 解释程序机械翻译为单个 JS 函数源码。
// 语义基准 = game/src/render/VanillaFraming.ts 的 evalProgram/execCall/tileMergeAttempt*
// (对拍用快照 ./VanillaFramingProbe.ts)。输出 ./framing-gen.js。
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const probe = require('./probe.cjs').__P;

const PROGRAM = JSON.parse(fs.readFileSync(new URL('./program-pinned.json', import.meta.url), 'utf8')).program;
const SF_KEYS = new Set(Object.keys(probe.SET_REF_FN));

// ---------- 文本变换(表达式本为合法 JS 字面量,仅做标识符绑定替换) ----------
const R = [
  [/\bHALF\s*\(\s*\)/g, '_HLF_'],
  [/\bSLOPE\s*\(\s*\)/g, '_SLP_'],
  [/\bBLOCKTYPE\s*\(\s*\)/g, '(0)'],
  [/\bVR\s*\(\s*\(\s*0\s*\)\s*,\s*\(\s*3\s*\)\s*\)/g, '(_VR_)'],
  [/\bTILECOUNT\b/g, '800'],
  [/\bR\.x\b/g, '_rx'],
  [/\bR\.y\b/g, '_ry'],
  [/\bmergeUp\b/g, 'MF.up'],
  [/\bmergeDown\b/g, 'MF.down'],
  [/\bmergeLeft\b/g, 'MF.left'],
  [/\bmergeRight\b/g, 'MF.right'],
];
const tx = (t) => { let s = t; for (const [re, rep] of R) s = s.replace(re, rep); return s; };
// 追踪发射开关:GEN_TRACE=0 → 精简版(无 TE 包裹),缺省带 TE(TR 缺省 undefined 时零开销)
const TRON = process.env.GEN_TRACE === '1'; // 缺省=精简直译(零包装);GEN_TRACE=1 才发射 TE/_SNP_ 追踪
const trCond = (raw, body) => TRON ? `TE(${JSON.stringify(raw)}, (${body}), _SNP_())` : `(${body})`;
const trVal = (raw, body) => TRON ? `TE(${JSON.stringify(raw)}, ${body}, _SNP_())` : `${body}`;

// ---------- 局部量收集(与解释器 walker 同构;未播种者保持 undefined 初值) ----------
const SEED = new Set(['rectX', 'rectY', 'rectInit', 'up', 'down', 'left', 'right', 'upLeft', 'upRight',
  'downLeft', 'downRight', 'num', 'num11', 'num6', 'mergeUp', 'mergeDown', 'mergeLeft', 'mergeRight',
  'FLAG', 'VNUM', 'resetFrame', 'i', 'j', 'frameX', 'frameY', 'R']);
const extras = [];
{
  const seen = new Set(SEED);
  const walk = (stmts) => { for (const s of stmts) {
    if (s.target && !seen.has(s.target)) { seen.add(s.target); extras.push(s.target); }
    if (s.then) walk(s.then);
    if (s.else) walk(s.else);
    if (s.cases) for (const b of Object.values(s.cases)) walk(b || []);
  } };
  walk(PROGRAM);
}

// ---------- 调用实参分类(镜像 execCall 预重写 + lookupSetFn/resolveSetFn 分层) ----------
// row   : S.tileMerge(var) —— 运行时矩阵行谓词
// set   : SETREF 名在 SET_REF_FN 表内 → 直接谓词引用
// dead  : SETREF 名不在表内 —— 解释器落为 lookforNum=null 且谓词 null(永不命中)
// num   : 其余(any 表达式)→ 数值求值 sv()
let uid = 0;
const U = () => `_${uid++}`;
function classify(raw) {
  const rm = raw.match(/^S\.tileMerge\((\w+)\)$/);
  if (rm) return { k: 'row', v: rm[1] };
  let n = null;
  const d = raw.match(/^SETREF\.(.+)$/); if (d) n = d[1];
  else { const m = raw.match(/^SETREF\[\s*"([^"\]]+)"\s*\]$/); if (m) n = m[1]; }
  if (n == null) return { k: 'num', expr: tx(raw) };
  return SF_KEYS.has(n) ? { k: 'set', name: n } : { k: 'dead', name: n };
}
// 输出判定来源声明并返回 {f, n}:f=谓词引用名或'null',n=数值引用或'null'
function emitLookvar(raw, L, ind) {
  const p = ' '.repeat(ind);
  const c = classify(raw);
  if (c.k === 'set') { const f = U(); L.push(`${p}const ${f}=S[${JSON.stringify(c.name)}];`); return { f, n: 'null' }; }
  if (c.k === 'row') { const f = U(), r = U(); L.push(`${p}const ${r}=(${tx(c.v)});`, `${p}const ${f}=(dd)=>TM[${r}]?.[dd]??false;`); return { f, n: 'null' }; }
  if (c.k === 'num') { const n = U(); L.push(`${p}const ${n}=(${trVal(raw, c.expr)});`); return { f: 'null', n }; }
  console.warn(`[codegen] 死集合引用(表外名,原版语义=永不命中): ${c.name}`);
  return { f: 'null', n: 'null' };
}
function emitExclude(raw, L, ind) { // 返回 {ef,en}
  const p = ' '.repeat(ind);
  const c = classify(raw);
  if (c.k === 'set') { const f = U(); L.push(`${p}const ${f}=S[${JSON.stringify(c.name)}];`); return { ef: f, en: 'null' }; }
  if (c.k === 'num') { const n = U(); L.push(`${p}const ${n}=(${trVal(raw, c.expr)});`); return { ef: 'null', en: n }; }
  if (c.k === 'row') throw new Error('row 作为 exclude 未见于数据,不支持');
  console.warn(`[codegen] 死排除集合(等价无排除): ${c.name}`);
  return { ef: 'null', en: 'null' };
}
const HIT = (L, cv) => `(${L.f}!==null?(${cv}>-1&&${L.f}(${cv})):(${cv}===${L.n}))`;

// ---------- 语句发射 ----------
function emitStmt(s, o, ind) {
  const p = ' '.repeat(ind);
  switch (s.kind) {
    case 'if': {
      o.push(`${p}if (${trCond(s.cond, tx(s.cond))}) {`);
      emitList(s.then || [], o, ind + 1);
      if (s.else) { o.push(`${p}} else {`); emitList(s.else, o, ind + 1); }
      o.push(`${p}}`);
      return;
    }
    case 'switch': {
      o.push(`${p}switch (${trVal(s.disc, tx(s.disc))}) {`);
      for (const [k, body] of Object.entries(s.cases)) {
        if (k === 'default') continue;
        o.push(`${p}case ${Number(k)}: {`); emitList(body || [], o, ind + 2); o.push(`${p}} break;`);
      }
      if (s.cases.default != null) { o.push(`${p}default: {`); emitList(s.cases.default, o, ind + 2); o.push(`${p}}`); }
      o.push(`${p}}`);
      return;
    }
    case 'assign': {
      let t = s.target;
      if (t === 'rectX') t = '_rx'; else if (t === 'rectY') t = '_ry'; else t = tx(t);
      o.push(`${p}${t} = ${trVal(s.expr, tx(s.expr))};`);
      return;
    }
    case 'call': return emitCall(s, o, ind);
    default: o.push(`${p}; /* ${s.kind} @L${s.line}(解释器同序:顺序结构下无操作) */`);
  }
}
function emitCall(st, o, ind) {
  const p = ' '.repeat(ind);
  const A = st.args;
  if (st.fn === 'TileFrame') {
    o.push(`${p}DRV.tf((${trVal(A[0], tx(A[0]))})-i,(${trVal(A[1], tx(A[1]))})-j);`);
    return;
  }
  if (st.fn === 'Cull') {
    o.push(`${p}{ if (!DRV.inv()) {`);
    for (let d = 0; d < 8; d++) {
      const [[dx, dy], nm] = [[
        [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1],
      ][d], tx(A[d])];
      o.push(`${p}  if (DRV.cull(${dx},${dy})) { ${nm} = -1; }`);
    }
    o.push(`${p}} }`);
    return;
  }
  if (st.fn === 'TileMergeAttempt') {
    o.push(`${p}{`);
    const m = U();
    o.push(`${p} const ${m}=(${trVal(A[0], tx(A[0]))});`);
    const L = emitLookvar(A[1], o, ind + 1);
    const X = A.length === 11 ? emitExclude(A[2], o, ind + 1) : { ef: 'null', en: 'null' };
    for (const dn of A.slice(2 + (A.length === 11 ? 1 : 0))) {
      const v = tx(dn);
      o.push(`${p} { const _c=${v}; if (${HIT(L, '_c')} && !( (${X.ef})!==null&&_c>-1&&${X.ef}(_c) ) && !( (${X.en})!==null&&_c===(${X.en}) ) ) { ${v}=${m}; } }`);
    }
    o.push(`${p}}`);
    return;
  }
  if (st.fn === 'TileMergeAttemptWeird') {
    o.push(`${p}{`);
    const m = U(), g = U();
    o.push(`${p} const ${m}=(${trVal(A[0], tx(A[0]))});`);
    o.push(`${p} const ${g}=(${trVal(A[1], tx(A[1]))});`);
    const X = emitExclude(A[2], o, ind + 1);
    for (const dn of A.slice(3)) {
      const v = tx(dn);
      // 原式: cur>-1 && cur!==myType && (exF2?!exF2(cur):true) && (excludeNum===null||cur!==excludeNum)
      o.push(`${p} { const _c=${v}; if (_c>-1 && _c!==${m} && !( (${X.ef})!==null && ${X.ef}(_c) ) && ( (${X.en})===null || _c!==(${X.en}) ) ) { ${v}=${g}; } }`);
    }
    o.push(`${p}}`);
    return;
  }
  if (st.fn === 'TileMergeAttemptFrametest') {
    o.push(`${p}{`);
    const m = U();
    o.push(`${p} const ${m}=(${trVal(A[2], tx(A[2]))});`);
    const L = emitLookvar(A[3], o, ind + 1);
    const OPP = { up: 'MF.down', down: 'MF.up', left: 'MF.right', right: 'MF.left' };
    const DXD = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    for (const dn of A.slice(4)) {
      const v = tx(dn);
      if (OPP[dn]) {
        o.push(`${p} { const _c=${v}; if (${HIT(L, '_c')}) { DRV.tf(${DXD[dn][0]},${DXD[dn][1]}); if (${OPP[dn]}) { ${v}=${m}; } } }`);
      } else {
        o.push(`${p} { const _c=${v}; if (${HIT(L, '_c')}) { ${v}=${m}; } }`);
      }
    }
    o.push(`${p}}`);
    return;
  }
  throw new Error(`未支持调用 ${st.fn}`);
}
function emitList(stmts, o, ind) { for (const s of stmts) emitStmt(s, o, ind); }

// ---------- 组装 ----------
uid = 10000;
const out = [];
out.push('// framing-gen.js — 由 gen-codegen.mjs 从 tileframe-program.json 机械生成;勿手改');
out.push("'use strict';");
out.push('function makeFrame(TR) {');
out.push('  const OUT = [0, 0];');
out.push("  const TE = (t, v, s) => { if (TR !== undefined) { TR.push(t + '=' + String(v) + '|' + s); } return v; }");
out.push('  return function frame(MF, S, SETREF, TM, LOC, PRED, DRV, i, j, num0, num60, _VR_, rl, _SLP_, _HLF_, TU, TD, TL, TR, TUL, TUR, TDL, TDR) {');
out.push('    let up=-1,down=-1,left=-1,right=-1,upLeft=-1,upRight=-1,downLeft=-1,downRight=-1;');
out.push('    let OLDFX=0, OLDFY=0, num11=0, FLAG=false, resetFrame=true, frameX=0, frameY=0;');
out.push('    let num = num0;');
out.push('    let num6 = num60;');
out.push('    let rectInit; // 解释器动态属性缺省 undefined(未播种),let 缺省初值一致');
out.push('    let VNUM = () => (((i * 7) + (j * 11)) % 3);');
out.push(`    let ${extras.join(', ')};`);
out.push('    let _rx = -1, _ry = -1;');
out.push('    const _SNP_ = () => [i, j, up, down, left, right, upLeft, upRight, downLeft, downRight, num, num11, num6, OLDFX, OLDFY, FLAG, resetFrame, frameX, frameY, rectInit, num12, mergesWithDirtInASpecialWay, MF.up, MF.down, MF.left, MF.right].map((x) => x === undefined ? "~" : String(x)).join(";");');
emitList(PROGRAM, out, 4);
out.push('    OUT[0] = (_rx < 0 || _ry < 0) ? 0 : _rx;');
out.push('    OUT[1] = (_rx < 0 || _ry < 0) ? 0 : _ry;');
out.push('    return OUT;');
out.push('  };');
out.push('}');
out.push('export { makeFrame };');

let src = out.join('\n') + '\n';
// 兼容双形态导出
src = src.replace('export { makeFrame };', 'export { makeFrame };');

// 残留未绑定标识符自检(先剥掉字符串字面量,避免把 TE 记录标签误判为代码)
const codeOnly = src.replace(/"(?:[^"\\]|\\.)*"/g, '""');
for (const bad of [/\bVR\s*\(/, /\bHALF\s*\(/, /\bSLOPE\s*\(/, /\bBLOCKTYPE\s*\(/, /\bTILECOUNT\b/, /\bR\.x\b/, /\bR\.y\b/, /\bscope\b/]) {
  const m2 = codeOnly.match(bad);
  if (m2) { console.error(`[codegen] 残留未绑定形:${bad},请检查规则`); process.exit(1); }
}

const path = new URL('./framing-gen.js', import.meta.url);
fs.writeFileSync(path, src);
fs.writeFileSync(new URL('./frame-keys.json', import.meta.url), JSON.stringify(['i','j','up','down','left','right','upLeft','upRight','downLeft','downRight','num','num11','num6','OLDFX','OLDFY','FLAG','resetFrame','frameX','frameY','rectInit','num12','mergesWithDirtInASpecialWay','mfUp','mfDown','mfLeft','mfRight']));
const lines = src.split('\n').length;
console.log(`generated framing-gen.js: ${lines} lines, ${(src.length / 1024).toFixed(0)} KiB`);
