// IIII106c 一次性仪（2026-09-04）：sparkle #97 Micro_Biomes 内容域反演重放·段界归因。
// 模板=tools/_iii121mb.test.ts（IIIII99f/IIII121 批同款基座），本仪新增：
//   ①基座自检 vs golden 096_Larva（act/typ/wal/liq 四通道，非零即 throw）；
//   ②__swSeg 段界钩在 15 个段锚标记点做 4 通道快照 → 逐段 changed-cells 账本；
//   ③runMicroBiomesPass 重放后 vs golden 097_Micro_Biomes 全差面（mile8 同构 T 恒比）；
//   ④每个差格归因到「首次呈现 JS 终值的段」/「JS 未触碰」→ 段×族直方图 + 样本格。
// 用法：cd game && SW_I106C=1 npx vitest run tools/_iii106c-s97.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_I106C === '1';
const OUT = process.env.I106C_OUT ?? '/tmp/iii106c-out';
const G2 = process.env.I106C_G2 ?? `${process.env.HOME}/GoldenChains/golden-sparkle`;
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;

function hydrate(): { st: TileStore; gs: GenState; chests: unknown[] } {
  const hdr = JSON.parse(readFileSync(`${OUT}/cap97/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/cap97/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    if (buf.length !== len * bytesPer) throw new Error(`base_${c}.bin size mismatch`);
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = JSON.parse(readFileSync(`${OUT}/cap97/base_gs.json`, 'utf8')) as unknown as GenState;
  const chests = JSON.parse(readFileSync(`${OUT}/cap97/base_chests.json`, 'utf8')) as unknown[];
  const solid = JSON.parse(readFileSync(`${OUT}/cap97/base_gensolid.json`, 'utf8')) as Array<[number, boolean]>;
  restoreGenSolid(new Map(solid));
  return { st, gs, chests };
}

// 段锚标记（segProbe 触发位=该段计数掷后、写入循环前）——归因段名=下一个标记
const SEG_ANCHORS = [
  'passStart', 'mbThin', 'iceCount', 'swordAttempts', 'mbSword', 'campCount',
  'mbMine', 'trapCount', 'mbTree', 'treeCount', 'mbTrack', 'longTrackCount',
  'stdTrackCount', 'mbLavaS', 'mbEnd',
] as const;

type Snap = { act: Uint8Array; typ: Uint16Array; wal: Uint16Array; liq: Uint8Array };
const takeSnap = (st: TileStore): Snap => {
  const act = new Uint8Array(N), typ = new Uint16Array(N), wal = new Uint16Array(N), liq = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const a = st.flags[i]! & 1;
    act[i] = a;
    typ[i] = a ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    wal[i] = st.wall[i]!;
    liq[i] = st.liquid[i]!;
  }
  return { act, typ, wal, liq };
};

(RUN ? it : it.skip)('i106c s97 segment-attribution replay', () => {
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  const x97 = `${G2}/097_${DUMPNAME.get(97)}`;
  const x96 = `${G2}/096_${DUMPNAME.get(96)}`;
  const xt = le16(`${x97}.typ`), xa = readFileSync(`${x97}.act`), xw = le16(`${x97}.wal`),
    xl = readFileSync(`${x97}.liq`), xhf = readFileSync(`${x97}.half`), xsl = readFileSync(`${x97}.slope`),
    xlt = readFileSync(`${x97}.lty`), xia = readFileSync(`${x97}.inact`);

  const { st, gs, chests } = hydrate();

  // ---- 基座自检 vs 096（act/typ/wal/liq 四通道）----
  {
    const a96 = readFileSync(`${x96}.act`), t96 = le16(`${x96}.typ`), w96 = le16(`${x96}.wal`), l96 = readFileSync(`${x96}.liq`);
    let dA = 0, dT = 0, dW = 0, dL = 0;
    for (let i = 0; i < N; i++) {
      const va = a96[i]!, ja = st.flags[i]! & 1;
      if (va !== ja) dA++;
      else if (va && t96[i] !== (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999)) dT++;
      if (w96[i] !== st.wall[i]) dW++;
      if (l96[i] !== st.liquid[i]) dL++;
    }
    console.log(`[base selfcheck vs 096_${DUMPNAME.get(96)}] A=${dA} T=${dT} W=${dW} L=${dL}`);
    if (dA + dT + dW + dL > 0) throw new Error('基座与 096 不齐——重放结论无效');
  }

  // ---- 段界快照账本（__swSeg 钩；prev=上一锚快照,changed=逐段差分）----
  const base = takeSnap(st);
  let prev: Snap = base;
  const segNames: string[] = ['@enter'];
  const changed: Array<Array<[number, number, number, number, number]>> = [[]]; // idx, act, typ, wal, liq
  const segRc: number[] = [];
  const g = globalThis as { __swSeg?: (name: string, d?: unknown) => void };
  g.__swSeg = (name: string) => {
    if (!(SEG_ANCHORS as readonly string[]).includes(name)) return;
    const cur = takeSnap(st);
    const list: Array<[number, number, number, number, number]> = [];
    for (let i = 0; i < N; i++) {
      if (cur.act[i] !== prev.act[i] || cur.typ[i] !== prev.typ[i] || cur.wal[i] !== prev.wal[i] || cur.liq[i] !== prev.liq[i]) {
        list.push([i, cur.act[i]!, cur.typ[i]!, cur.wal[i]!, cur.liq[i]!]);
      }
    }
    segNames.push(name);
    changed.push(list);
    segRc.push(rcBox.n);
    prev = cur;
  };

  // ---- 掷数计镜（与 _iii121mb 同构：包装 + TRUE-rolls）----
  const rcBox = { n: 0 };
  const rng = new RNG(gs.seed);
  const rp = rng as unknown as Record<string, unknown>;
  for (const k of ['int', 'nextInt', 'next']) {
    const orig = rp[k] as (...a: unknown[]) => unknown;
    if (typeof orig === 'function') rp[k] = ((...a: unknown[]) => { rcBox.n++; return orig.apply(rng, a); });
  }
  const van = rp['vanilla'] as unknown as Record<string, unknown>;
  if (van && typeof van.next === 'function') {
    const on = van.next.bind(van);
    Object.defineProperty(rp, 'vanilla', { value: { ...van, next: () => { rcBox.n++; return on(); } }, configurable: true });
  }
  let trueRolls = 0;
  const oRoll = (globalThis as { __swOnRoll?: unknown }).__swOnRoll;
  (globalThis as { __swOnRoll?: unknown }).__swOnRoll = () => { trueRolls++; };

  // ---- 重放 ----
  const t0 = Date.now();
  runMicroBiomesPass(st, rng, gs, chests as never);
  console.log(`runMicroBiomesPass ${Date.now() - t0}ms rc=${rcBox.n} TRUE=${trueRolls}`);
  (globalThis as { __swOnRoll?: unknown }).__swOnRoll = oRoll;
  g.__swSeg = undefined;

  // ---- 段锚掷数表 ----
  console.log('== 段锚 rc（@enter=0 起）==');
  for (let s = 1; s < segNames.length; s++) {
    console.log(`  ${segNames[s]}  rc=${segRc[s] ?? '?'}  changed=${changed[s]?.length ?? '?'}`);
  }

  // ---- vs 097 全差面（mile8 同构：T 恒比,A 差格也进 T 组）----
  const jsFinalAct = new Uint8Array(N), jsFinalTyp = new Uint16Array(N);
  for (let i = 0; i < N; i++) {
    const ja = st.flags[i]! & 1;
    jsFinalAct[i] = ja;
    jsFinalTyp[i] = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
  }
  const groups = new Map<string, number[]>();
  const push = (k: string, i: number) => { const a = groups.get(k) ?? []; a.push(i); groups.set(k, a); };
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
  let fI = -1;
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = jsFinalAct[i]!;
    const vt = va ? xt[i]! : 0, jt = ja ? jsFinalTyp[i]! : 0;
    if (va !== ja) { dA++; if (fI < 0) fI = i; push(`A${va}>${ja}`, i); if (vt !== jt) push(`T${vt}>${jt}`, i); continue; }
    if (vt !== jt) { dT++; if (fI < 0) fI = i; push(`T${vt}>${jt}`, i); }
    if (xw[i] !== st.wall[i]) { dW++; if (fI < 0) fI = i; push(`W${xw[i]}>${st.wall[i]}`, i); }
    if (xl[i] !== st.liquid[i]) { dL++; if (fI < 0) fI = i; push(`L${xl[i]}>${st.liquid[i]}`, i); }
    if (xhf[i] !== st.half[i]) { dHf++; if (fI < 0) fI = i; push(`Hf${xhf[i]}>${st.half[i]}`, i); }
    if (xsl[i] !== st.slope[i]) { dSl++; if (fI < 0) fI = i; push(`Sl${xsl[i]}>${st.slope[i]}`, i); }
    const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0, jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; if (fI < 0) fI = i; push(`Y${vl}>${jl}`, i); }
    const via = xia[i]! ? 1 : 0, jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; if (fI < 0) fI = i; push(`Ia${via}>${jia}`, i); }
  }
  console.log(`replay cmp vs 097: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} first=${fI < 0 ? '-' : `(${fI % W},${(fI / W) | 0})`}`);

  // ---- 差格 → 段归因 ----
  const diffCells = new Set<number>();
  for (const arr of groups.values()) for (const i of arr) diffCells.add(i);
  // 每差格：找到「changed 账本里首次呈现 JS 终值 4 元组」的段；找不到→JS 未触碰（终值=基座值）
  // 索引化：cellIdx → Array<[segIdx, a,t,w,l]>（总量=Σchanged,万级）
  const byCell = new Map<number, Array<[number, number, number, number, number]>>();
  for (let s = 1; s < segNames.length; s++) {
    for (const e of changed[s]!) {
      const arr = byCell.get(e[0]);
      if (arr) arr.push([s, e[1], e[2], e[3], e[4]]);
      else byCell.set(e[0], [[s, e[1], e[2], e[3], e[4]]]);
    }
  }
  const writer = new Map<number, string>();
  const untouched: number[] = [];
  for (const i of diffCells) {
    const fa = jsFinalAct[i]!, ft = jsFinalTyp[i]!, fw = st.wall[i]!, fl = st.liquid[i]!;
    const events = byCell.get(i);
    let hit = -1;
    if (events) for (const [s, a, t, w2, l2] of events) {
      if (a === fa && t === ft && w2 === fw && l2 === fl) { hit = s; break; }
    }
    if (hit >= 0) writer.set(i, segNames[hit]!);
    else untouched.push(i);
  }
  // 直方图：段 × 差族
  const hist = new Map<string, Map<string, number>>();
  const cellGroup = new Map<number, string[]>();
  for (const [k, arr] of groups) for (const i of arr) {
    const l = cellGroup.get(i) ?? [];
    l.push(k); cellGroup.set(i, l);
  }
  for (const [i, seg] of writer) {
    const m = hist.get(seg) ?? new Map<string, number>();
    for (const k of cellGroup.get(i)!) m.set(k, (m.get(k) ?? 0) + 1);
    hist.set(seg, m);
  }
  const uHist = new Map<string, number>();
  for (const i of untouched) for (const k of cellGroup.get(i)!) uHist.set(k, (uHist.get(k) ?? 0) + 1);
  console.log('== 段×差族直方图 ==');
  for (const [seg, m] of hist) {
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k}×${n}`).join(' ');
    console.log(`  [${seg}] total=${[...m.values()].reduce((x, y) => x + y, 0)} ${top}`);
  }
  console.log(`  [JS未触碰] total=${untouched.length} ${[...uHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  // 样本：每段前 6 个差格坐标
  const bySeg = new Map<string, number[]>();
  for (const [i, seg] of writer) { const a = bySeg.get(seg) ?? []; a.push(i); bySeg.set(seg, a); }
  console.log('== 段样本格 ==');
  for (const [seg, arr] of bySeg) {
    console.log(`  [${seg}] ${arr.slice(0, 6).map((i) => `(${i % W},${(i / W) | 0})`).join(' ')}`);
  }
  if (untouched.length > 0) {
    console.log(`  [JS未触碰] ${untouched.slice(0, 6).map((i) => `(${i % W},${(i / W) | 0})`).join(' ')}`);
  }
  writeFileSync(`${OUT}/s97-attribution.json`, JSON.stringify({
    segRc: segNames.map((n, s) => ({ seg: n, rc: segRc[s] ?? 0, changed: changed[s]?.length ?? 0 })),
    hist: Object.fromEntries([...hist.entries()].map(([k, m]) => [k, Object.fromEntries(m)])),
    untouched: { total: untouched.length, hist: Object.fromEntries(uHist) },
  }, null, 1));
  console.log(`attribution -> ${OUT}/s97-attribution.json`);
}, 900_000);
