// ★清偿刀 V1 一次性普查:case 体嵌套 per-type if 值域全域 sweep(1456/1457/1458 三版)。
// 语义走栈:每 region(SetDefaults1..5+SetFoodDefaults)从方法体顶层起演步:
//   - case run(连排标签合并)体一次走栈;内层 switch(type) 按 run 分发(含 default 补集);
//   - if(type==N/范围/补集复合)分支分区+return 灭集传播;goto case N 重派发;
//   - path 四分:method(方法级,既有 S1/U1 域,对拍)/top(case 体顶层直写,既有区域扫描域,对拍)/
//     nested(case 体内 per-type if 派生=本刀域)/variant(非 type 条件域,R2⑥ 按设计忽略)。
// 运行:node tools/run-diag.mjs tools/_v1-nested-value-sweep.mjs [ver...]
import { readFileSync } from 'node:fs';

const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)

function load(ver) {
  const src = readFileSync(`${ROOT}/Terarria${ver}/Terraria/Item.cs`, 'utf8');
  return src.split('\n');
}
function methodRange(L, name) {
  const sig = L.findIndex((l) => new RegExp(`^\\t(public|private) void ${name}\\(`).test(l));
  if (sig < 0) throw new Error(`method ${name} not found`);
  let d = 0;
  for (let i = sig; i < L.length; i++) {
    d += (L[i].match(/{/g) || []).length - (L[i].match(/}/g) || []).length;
    if (d === 0 && i > sig) return [sig, i];
  }
  throw new Error(`method ${name} unbalanced`);
}
function spanOf(L, gi, to) {
  const inline = /\{\s*$/.test(L[gi]);
  let d = 0;
  let started = false;
  for (let j = gi; j <= to; j++) {
    const raw = L[j];
    if (j === gi && inline) {
      d += (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length;
      started = started || d > 0;
      if (started && d === 0) return j;
      continue;
    }
    if (!started) { if (raw.trim() === '{') { d = 1; started = true; } continue; }
    d += (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length;
    if (d === 0) return j;
  }
  return -1;
}

/** 解析 switch(type) 块的 runs(连排标签合并;default 单列)。
 *  ★本反编译器缩进风格:switch 头、`{`、case 标签同一深度(labelDepth=headDepth);体语句=+1。
 *  返回 [{labels:number[]|'default', start(体首行), end(体终止行,含)}] */
function switchRuns(L, head, swEnd, labelDepth) {
  const inline = /\{\s*$/.test(L[head]);
  const bodyStart = inline ? head + 1 : head + 2;
  if (!inline && (L[bodyStart - 1] ?? '').trim() !== '{') throw new Error(`switch 块头无体 :${head + 1}`);
  const runs = [];
  let cur = null;
  for (let j = bodyStart; j < swEnd; j++) {
    const tj = L[j].trim();
    const dj = (L[j].match(/^\t*/) ?? [''])[0].length;
    if (dj !== labelDepth) continue;
    const cm = tj.match(/^case (\d+):\s*$/);
    const isDef = /^default:\s*$/.test(tj);
    if (!cm && !isDef) continue;
    const lab = cm ? +cm[1] : 'default';
    if (cur !== null && j === cur.start && cur.labels !== 'default' && lab !== 'default') {
      cur.labels.push(lab); cur.start = j + 1; // 连排标签:并入当前 run
    } else {
      if (cur) runs.push(cur);
      cur = { labels: lab === 'default' ? 'default' : [lab], start: j + 1 };
    }
  }
  if (cur) runs.push(cur);
  return runs.map((r, k) => {
    const nextStart = k + 1 < runs.length ? runs[k + 1].start - 1 : swEnd;
    let end = nextStart;
    let bal = 0; // brace 平衡:体语句层(bal==0)的终止符才是 run 终止(嵌套 switch/if 的 break 不算)
    for (let q = r.start; q <= nextStart; q++) {
      const raw = L[q];
      const tq = raw.trim();
      const dq = (raw.match(/^\t*/) ?? [''])[0].length;
      if (bal === 0 && dq === labelDepth + 1 && /^(break;|return\b|goto\b)/.test(tq)) { end = q; break; }
      bal += (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length;
      if (bal < 0) bal = 0;
    }
    return { ...r, end };
  });
}

/**
 * 语义走栈 [from..to]@depth。返回 { dead:Set(return/goto 灭), gotoOut:Map(target→Set) }。
 * out 累加写入 {id, field, expr, at, path, runLabels};ctx 累加 unmodeled/variant。
 */
function walk(L, from, to, depth, liveIn, runLabels, inCase, scope, out, ctx, faceTag) {
  // path 四态映射:方法级=method(既有 S1/U1 域);case 体顶层=top(区域扫描域);
  // case 体内 type-if 分支=nested(本刀域);case 体内非 type 条件域=variant(R2⑥ 忽略)。
  // ★scope 语义:nontype 支配(变体块内的 type-if 仍属变体域);switch run 体重置 scope。
  const path = !inCase ? 'method' : scope === 'none' ? 'top' : scope === 'type' ? 'nested' : 'variant';
  const live = new Set(liveIn);
  const dead = new Set();
  const gotoOut = new Map();
  let i = from;
  while (i <= to) {
    if (live.size === 0) break;
    const raw = L[i];
    const t = raw.trim();
    if (t === '' || t.startsWith('//') || t.startsWith('#')) { i++; continue; } // 空行/注释:不参与深度语义
    const bd = (raw.match(/^\t*/) ?? [''])[0].length;
    if (bd < depth) break;
    if (bd > depth) { i++; continue; }
    let m;
    // ---- 终止符 ----
    if ((m = t.match(/^goto case (\d+);\s*$/)) || (m = t.match(/^goto default;\s*$/))) {
      const target = m[1] !== undefined ? +m[1] : 'default';
      if (!gotoOut.has(target)) gotoOut.set(target, new Set());
      for (const id of live) gotoOut.get(target).add(id);
      for (const id of live) dead.add(id);
      live.clear(); break;
    }
    if (/^return\b/.test(t)) { for (const id of live) dead.add(id); live.clear(); break; }
    if (/^break;/.test(t)) { live.clear(); break; } // 出 switch:幸存者由 switch 层续走
    if (/^(case \d+:|default:)\s*$/.test(t)) { i++; continue; }
    // ---- 写入 ----
    if ((m = t.match(/^(value|rare) = ([^;]+);$/))) {
      for (const id of live) out.push({ id, field: m[1], expr: m[2], at: i + 1, path, runLabels, faceTag: faceTag ?? '' });
      i++; continue;
    }
    if (/^SetShopValues\(ItemRarityColor\./.test(t)) {
      for (const id of live) out.push({ id, field: 'ssv', expr: t, at: i + 1, path, runLabels });
      i++; continue;
    }
    if (/^DefaultTo\w+\(/.test(t)) { i++; continue; }
    // ---- switch(type) ----
    if (/^switch\s*\(type\)\s*\{?\s*$/.test(t)) {
      const inline = /\{\s*$/.test(L[i]);
      const swEnd = inline ? spanOf(L, i, to) : spanOf(L, i + 1, to);
      if (swEnd < 0) throw new Error(`switch 未收口 :${i + 1} (${ctx.region})`);
      const runs = switchRuns(L, i, swEnd, depth);
      const explicitIds = new Set();
      for (const r of runs) if (r.labels !== 'default') for (const x of r.labels) explicitIds.add(x);
      for (const r of runs) {
        if (r.labels === 'default') continue;
        const bodyIds = new Set([...live].filter((id) => r.labels.includes(id)));
        if (!bodyIds.size) continue;
        const sub = walk(L, r.start, r.end, depth + 1, bodyIds, r.labels, true, 'none', out, ctx, faceTag);
        for (const id of bodyIds) if (sub.dead.has(id)) { live.delete(id); dead.add(id); } // ★灭集必须上传
        if (sub.gotoOut.size) dispatchGoto(L, sub, runs, depth + 1, r, out, ctx, live);
      }
      const defRun = runs.find((r) => r.labels === 'default');
      if (defRun) {
        const defIds = new Set([...live].filter((id) => !explicitIds.has(id)));
        if (defIds.size) {
          const sub = walk(L, defRun.start, defRun.end, depth + 1, defIds, 'default', true, 'none', out, ctx, faceTag);
          for (const id of defIds) if (sub.dead.has(id)) { live.delete(id); dead.add(id); } // ★灭集必须上传
          if (sub.gotoOut.size) dispatchGoto(L, sub, runs, depth + 1, defRun, out, ctx, live);
        }
      }
      i = swEnd + 1;
      continue;
    }
    // ---- if ----
    if ((m = t.match(/^if\s*\((.*)\)\s*\{?\s*$/))) {
      const cond = m[1].trim();
      const inlineBr = /\{\s*$/.test(L[i]);
      let ifEnd;
      if (inlineBr) ifEnd = spanOf(L, i, to);
      else {
        if ((L[i + 1] ?? '').trim() !== '{') {
          ctx.unmodeled.push({ region: ctx.region, kind: 'if 单行体', at: i + 1, text: t });
          i++; continue;
        }
        ifEnd = spanOf(L, i + 1, to);
      }
      if (ifEnd < 0) throw new Error(`if 块未收口(:${i + 1}) ${ctx.region}`);
      let elseEnd = -1;
      let chainElseIf = false;
      if (ifEnd + 1 <= to) {
        const nxt = (L[ifEnd + 1] ?? '').trim();
        if (nxt === 'else') {
          const es = ifEnd + 2;
          if (/\{\s*$/.test(L[es]) || (L[es] ?? '').trim() === '{') elseEnd = spanOf(L, es, to);
          else { chainElseIf = true; ctx.unmodeled.push({ region: ctx.region, kind: 'else-if/单行 else', at: es + 1, text: L[es] ?? '' }); }
        } else if (/^else/.test(nxt)) chainElseIf = true;
      }
      const brScope = scope === 'nontype' ? 'nontype' : 'type';
      const cSingle = cond.match(/^type == (-?\d+)$/);
      const cRange = cond.match(/^type >= (\d+) && type <= (\d+)$/);
      const cCompl = cond.match(/^type < (\d+) \|\| type > (\d+)$/);
      if (cSingle || cRange || cCompl) {
        let lo, hi, invert = false;
        if (cSingle) { lo = hi = +cSingle[1]; }
        else if (cRange) { lo = +cRange[1]; hi = +cRange[2]; }
        else { lo = +cCompl[1]; hi = +cCompl[2]; invert = true; } // if 支=补集(真集∉[lo,hi];else 支=[lo,hi])
        const inIf = new Set([...live].filter((id) => (id >= lo && id <= hi) !== invert));
        const outIf = new Set([...live].filter((id) => (id >= lo && id <= hi) === invert));
        const tagIf = (faceTag ? faceTag + '/' : '') + cond.replace(/\s+/g, '') + '\u2192if';
        const subIf = walk(L, inlineBr ? i + 1 : i + 2, ifEnd, depth + 1, inIf, runLabels, inCase, brScope, out, ctx, tagIf);
        let subElse = { dead: new Set(), gotoOut: new Map() };
        if (!chainElseIf && elseEnd >= 0) subElse = walk(L, ifEnd + 3, elseEnd, depth + 1, outIf, runLabels, inCase, brScope, out, ctx, (faceTag ? faceTag + '/' : '') + cond.replace(/\s+/g, '') + '\u2192else');
        // 分支内 return 的 id 在 if-else 后灭;goto 冒泡到调用层
        for (const id of subIf.dead) { live.delete(id); dead.add(id); }
        for (const id of subElse.dead) { live.delete(id); dead.add(id); }
        for (const [tg, ids] of subIf.gotoOut) mergeGoto(gotoOut, tg, ids);
        for (const [tg, ids] of subElse.gotoOut) mergeGoto(gotoOut, tg, ids);
        if (chainElseIf && outIf.size) ctx.unmodeled.push({ region: ctx.region, kind: 'else-if 链', at: i + 1, text: t });
        i = (elseEnd >= 0 ? elseEnd : ifEnd) + 1;
        continue;
      }
      // 非 type 条件:谓词域(Variant=R2⑥ 按设计忽略;其余=形态外)。两支同 live 穿过。
      const isVariant = /Variant/.test(cond);
      const probeStart = out.length;
      const subA = walk(L, inlineBr ? i + 1 : i + 2, ifEnd, depth + 1, live, runLabels, inCase, 'nontype', out, ctx, faceTag);
      let subB = { dead: new Set(), gotoOut: new Map() };
      if (!chainElseIf && elseEnd >= 0) subB = walk(L, ifEnd + 3, elseEnd, depth + 1, live, runLabels, inCase, 'nontype', out, ctx, faceTag);
      for (const id of subA.dead) { live.delete(id); dead.add(id); }
      for (const id of subB.dead) { live.delete(id); dead.add(id); }
      for (const [tg, ids] of subA.gotoOut) mergeGoto(gotoOut, tg, ids);
      for (const [tg, ids] of subB.gotoOut) mergeGoto(gotoOut, tg, ids);
      if (isVariant && out.length > probeStart) ctx.variant.push({ region: ctx.region, at: i + 1, cond, writes: out.length - probeStart });
      if (!isVariant && out.length > probeStart) ctx.unmodeled.push({ region: ctx.region, kind: `非type条件 if(${cond}) 带写入`, at: i + 1, writes: out.length - probeStart });
      i = (elseEnd >= 0 ? elseEnd : ifEnd) + 1;
      continue;
    }
    // ---- 其他 ----
    if (/;\s*$/.test(t) && !/[{}]/.test(t)) { i++; continue; }
    if (t === '{') { const e2 = spanOf(L, i, to); if (e2 < 0) throw new Error(`裸块未收口 :${i + 1}`); walk(L, i + 1, e2, depth + 1, live, runLabels, inCase, scope, out, ctx, faceTag); i = e2 + 1; continue; }
    if (t === '}') { i++; continue; }
    ctx.unmodeled.push({ region: ctx.region, kind: '语句形态外', at: i + 1, text: t });
    i++;
  }
  return { dead, gotoOut };
}
function mergeGoto(map, tg, ids) {
  if (!map.has(tg)) map.set(tg, new Set());
  for (const id of ids) map.get(tg).add(id);
}
/** goto case 重派发:target 为本 switch 的 run → 以该 run 体走栈(写序在 goto 之后);找不到=形态外 */
function dispatchGoto(L, sub, runs, bodyDepth, fromRun, out, ctx, live) {
  for (const [tg, ids] of sub.gotoOut) {
    const target = runs.find((r) => r.labels !== 'default' && r.labels.includes(tg));
    if (!target || target === fromRun) throw new Error(`goto case ${tg} 目标 run 未找到/自指(${ctx.region})`);
    const bodyIds = new Set([...ids].filter((id) => live.has(id) || sub.dead.has(id)));
    if (!bodyIds.size) continue;
    const sub2 = walk(L, target.start, target.end, bodyDepth, bodyIds, target.labels, true, 'none', out, ctx, undefined);
    for (const id of bodyIds) if (sub2.dead.has(id)) { live.delete(id); sub.dead.add(id); } // 灭集上传到 sub(由调用方上传)
    if (sub2.gotoOut.size) throw new Error(`goto 链未建模(${ctx.region} case ${tg})`);
  }
}

// ---------- 主 sweep ----------
function sweepRegion(L, name, from, to) {
  const ctx = { region: name, unmodeled: [], variant: [] };
  const out = [];
  const all = new Set();
  for (let id = 1; id <= 6200; id++) all.add(id);
  // from=签名行,from+1=`{`;体语句从 from+2 起(深度 2)
  walk(L, from + 2, to, 2, all, null, false, 'none', out, ctx, undefined);
  return { out, ctx };
}
function sweepFaces(ver) {
  const L = load(ver);
  const faces = [];
  const notes = [];
  for (const name of ['SetDefaults1', 'SetDefaults2', 'SetDefaults3', 'SetDefaults4', 'SetDefaults5', 'SetFoodDefaults']) {
    const [from, to] = methodRange(L, name);
    const { out, ctx } = sweepRegion(L, name, from, to);
    for (const w of out) faces.push({ region: name, ...w });
    if (ctx.unmodeled.length) notes.push({ region: name, unmodeled: ctx.unmodeled });
    if (ctx.variant.length) notes.push({ region: name, variant: ctx.variant });
  }
  return { faces, notes };
}

// ---------- 输出 ----------
const argVer = process.argv.slice(2).find((a) => /^\d{4}$/.test(a));
const versions = argVer ? [argVer] : ['1456', '1457', '1458'];
const lib = JSON.parse(readFileSync(`${ROOT}/game/src/data/vanilla-itemvalue.json`, 'utf8'));
const libRare = JSON.parse(readFileSync(`${ROOT}/game/src/data/vanilla-itemrare.json`, 'utf8'));
function evalPrice(expr) {
  const FIELD_PRICE = {
    shadowOrbPrice: 'sellPrice(0, 1, 50)', dungeonPrice: 'sellPrice(0, 1, 75)', queenBeePrice: 'sellPrice(0, 2)',
    hellPrice: 'sellPrice(0, 2, 50)', eclipsePrice: 'sellPrice(0, 7, 50)', eclipsePostPlanteraPrice: 'sellPrice(0, 10)',
    eclipseMothronPrice: 'sellPrice(0, 12, 50)',
  };
  let out = expr
    .replace(new RegExp(`\\b(${Object.keys(FIELD_PRICE).join('|')})\\b`, 'g'), (n) => `(${FIELD_PRICE[n]})`)
    .replace(/sellPrice\(([^()]*)\)/g, (_a, args) => {
      const p = args.split(',').map((x) => parseInt(x.trim(), 10) || 0);
      return String(((p[0] || 0) * 1e6 + (p[1] || 0) * 1e4 + (p[2] || 0) * 100 + (p[3] || 0)) * 5);
    })
    .replace(/buyPrice\(([^()]*)\)/g, (_a, args) => {
      const p = args.split(',').map((x) => parseInt(x.trim(), 10) || 0);
      return String((p[0] || 0) * 1e6 + (p[1] || 0) * 1e4 + (p[2] || 0) * 100 + (p[3] || 0));
    })
    .replace(/\((?:int|double|float)\)\s*/g, '')
    .trim();
  while (/\(value = ([^()]*)\)/.test(out)) out = out.replace(/\(value = ([^()]*)\)/g, '$1').trim();
  if (!/^[\d+\-*/(). ]+$/.test(out)) return null;
  try {
    const v = new Function(`"use strict";return (${out});`)();
    return Number.isFinite(v) ? Math.trunc(v) : null;
  } catch { return null; }
}
const runDisp = (rl) => (rl === 'default' ? 'default' : Array.isArray(rl) ? `${Math.min(...rl)}-${Math.max(...rl)}(${rl.length})` : String(rl));
function faceListOf(t) {
  // 按写序聚合 face:(region, runKey, faceTag) → {ids:[按首写序], value(唯一 expr 值), at}
  const faces = new Map();
  const allWrites = [];
  for (const [id, hits] of t.nested) for (const h of hits) allWrites.push({ id, ...h });
  allWrites.sort((a, b) => a.at - b.at);
  for (const w of allWrites) {
    const key = `${w.region}|${runDisp(w.runLabels)}|${w.faceTag}`;
    if (!faces.has(key)) faces.set(key, { key, ids: [], value: w.val, expr: w.expr, at: w.at });
    const f = faces.get(key);
    if (!f.ids.includes(w.id)) f.ids.push(w.id);
    if (f.value !== w.val) f.value = 'MIXED';
  }
  return [...faces.values()];
}
const tables = {};
for (const ver of versions) {
  const { faces, notes } = sweepFaces(ver);
  const agg = { nested: new Map(), method: new Map(), top: new Map(), variant: new Map(), rareNested: new Map(), rareMethod: new Map(), ssv: [] };
  for (const w of faces) {
    const key = w.field === 'value' ? (w.path === 'nested' ? 'nested' : w.path === 'method' ? 'method' : w.path === 'variant' ? 'variant' : 'top')
      : w.field === 'rare' ? (w.path === 'nested' ? 'rareNested' : w.path === 'method' ? 'rareMethod' : null)
      : null;
    if (key === null) { if (w.field === 'ssv' && w.path !== 'top') agg.ssv.push(w); continue; }
    if (!agg[key].has(w.id)) agg[key].set(w.id, []);
    agg[key].get(w.id).push({ expr: w.expr, val: evalPrice(w.expr), at: w.at, region: w.region, runLabels: w.runLabels, path: w.path, faceTag: w.faceTag });
  }
  tables[ver] = { faces: faces.length, notes, ...agg };
}
const base = tables['1457'] ?? tables[versions[0]];
console.log('=== nested per-type if VALUE faces (1457) — 本刀域 ===');
console.log('total ids:', base.nested.size);
for (const [id, hits] of [...base.nested.entries()].sort((a, b) => a[0] - b[0])) {
  const last = hits[hits.length - 1];
  const libV = lib[id];
  const val = last.val;
  let kind;
  if (val === null) kind = 'UNPARSEABLE';
  else if (libV === undefined) kind = 'MISSING';
  else if (libV !== val) kind = `WRONG(lib=${libV})`;
  else kind = 'OK';
  console.log(`  ${id}: ${val}  [${kind}]  expr=${last.expr}  @${last.region} run[${runDisp(last.runLabels)}] :${last.at}${hits.length > 1 ? ` (${hits.length} writes)` : ''}`);
}
console.log('\n=== nested RARE faces (对拍) ===');
for (const [id, hits] of [...base.rareNested.entries()].sort((a, b) => a[0] - b[0])) {
  const last = hits[hits.length - 1];
  console.log(`  ${id}: expr=${last.expr}  lib=${libRare[id] ?? '缺'}  @${last.region} run[${runDisp(last.runLabels)}] :${last.at}`);
}
console.log('\n=== method-level VALUE faces not equal to lib (S1/U1 域外漏核对) ===');
for (const [id, hits] of [...base.method.entries()].sort((a, b) => a[0] - b[0])) {
  const last = hits[hits.length - 1];
  const libV = lib[id];
  if (libV === undefined || libV !== last.val) console.log(`  ${id}: ${last.val} [lib=${libV ?? '缺'}] expr=${last.expr} @${last.region} :${last.at}`);
}
console.log('\n=== face list (JSON) ===');
console.log(JSON.stringify(faceListOf(base)));
console.log('\n=== notes(unmodeled/variant) ===');
for (const n of base.notes) {
  for (const u of n.unmodeled ?? []) console.log(`  UNMODELED @${n.region} :${u.at} ${u.kind} :: ${(u.text ?? '').slice(0, 80)}`);
  for (const v of n.variant ?? []) console.log(`  variant @${n.region} :${v.at} ${v.cond.slice(0, 60)} (${v.writes} writes)`);
}
// 三版 diff(nested 域规范化)
const normFaces = (t) => JSON.stringify({
  nv: [...t.nested.entries()].sort((a, b) => a[0] - b[0]).map(([id, hs]) => [id, hs.map((h) => [h.region, runDisp(h.runLabels), h.expr])]),
  nr: [...t.rareNested.entries()].sort((a, b) => a[0] - b[0]).map(([id, hs]) => [id, hs.map((h) => [h.region, runDisp(h.runLabels), h.expr])]),
  un: t.notes.flatMap((n) => (n.unmodeled ?? []).map((u) => [n.region, u.kind])),
  va: t.notes.flatMap((n) => (n.variant ?? []).map((v) => [n.region, v.cond])),
});
const ref = normFaces(tables[versions[0]]);
for (const ver of versions.slice(1)) {
  const same = normFaces(tables[ver]) === ref;
  console.log(`\n=== cross-version ${versions[0]} vs ${ver} (nested+rare+notes): ${same ? 'IDENTICAL' : 'DRIFT'}`);
  if (!same) {
    const a = JSON.parse(ref);
    const b = JSON.parse(normFaces(tables[ver]));
    for (const key of ['nv', 'nr']) {
      const mapA = new Map(a[key]);
      const mapB = new Map(b[key]);
      for (const k of new Set([...mapA.keys(), ...mapB.keys()])) {
        const ja = JSON.stringify(mapA.get(k) ?? null);
        const jb = JSON.stringify(mapB.get(k) ?? null);
        if (ja !== jb) console.log(`  ${key}[${k}]: ${versions[0]}=${ja} | ${ver}=${jb}`);
      }
    }
    const unA = new Set(a.un.map(JSON.stringify));
    const unB = new Set(b.un.map(JSON.stringify));
    for (const u of new Set([...unA, ...unB])) if (!unA.has(u) || !unB.has(u)) console.log(`  un: ${versions[0]}has=${unA.has(u)} ${ver}has=${unB.has(u)} :: ${u}`);
  }
}
