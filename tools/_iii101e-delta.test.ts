// IIII101e 仪①：GFB zenith #105 Final_Cleanup 残差反演重放。
// ①JS104/JS105 快照（13 通道）落盘 /tmp/iii131-out/js10{4,5}-*
// ②pass105 掷流总账 vs 金标 pc P|105 R=56,453,927 + FC 段标掷位梯
// ③金标/JS 各自 104→105 增量分类（vanilla 改 JS 未改 / JS 改 vanilla 未改 / 双改异值）
// ④首差邻域 (x,y) 图（g104→g105 vs j104→j105 逐格）
// 用法：cd game && SW_I101E=1 npx vitest run tools/_iii101e-delta.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG, UnifiedRandom } from '../src/core/rng';
import type { TileStore } from '../src/world/TileStore';

const RUN = process.env.SW_I101E === '1';
const OUT = '/tmp/iii131-out';
const G2 = `${process.env.HOME}/GoldenChains/golden-gfb-c`;
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
const u8 = (p: string): Uint8Array => readFileSync(p);

type TA = Uint16Array | Uint8Array;
const ARRAYS = ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall'] as const;
const EXT: Record<string, string> = {
  type: 'typ', flags: 'act', wall: 'wal', liquid: 'liq', liquidType: 'lty',
  half: 'half', slope: 'slope', wire: 'wir', paint: 'pnt', paintWall: 'pwl',
  frameX: 'frx', frameY: 'fry',
};

(RUN ? it : it.skip)('iii101e #105 reverse-replay delta', { timeout: 3_600_000 }, async () => {
  const g = globalThis as {
    __swOnRoll?: (v: number, inst: object) => void;
    __swSeg?: (name: string, detail?: unknown) => void;
    __swFCMark?: (tag: string) => void;
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: RNG, s: number) => void;
  let activeUr: UnifiedRandom | null = null;
  let rolls = 0;                       // 全局累计掷
  let passStartRolls = 0;              // 当前 pass 起始绝对掷
  let curPass = -1;
  const passRows: Array<{ pass: number; rolls: number }> = [];
  const oRoll = g.__swOnRoll;
  g.__swOnRoll = (v: number, inst: object) => {
    if (activeUr && inst === (activeUr as unknown as object)) rolls++;
    oRoll?.(v, inst);
  };
  RNGp.reseed = function (this: RNG, s: number) {
    const r = oReseed.call(this, s);
    if (curPass >= 0) passRows.push({ pass: curPass, rolls: rolls - passStartRolls });
    curPass++;
    passStartRolls = rolls;
    activeUr = (this as unknown as { ur: UnifiedRandom }).ur;
    return r;
  };

  let store: TileStore | null = null;
  const snap105: Record<string, TA> = {};
  const snap104: Record<string, TA> = {};
  const segRows: Array<{ marker: string; rolls: number; passRel: number }> = [];
  const oSeg = g.__swSeg;
  g.__swSeg = (name, detail) => {
    if (typeof name === 'string' && /^(FC-|PT-A|P-Trees|P-Mush|SCIN|SCOUT|FSIN|FSOUT|FNTBIN|FNTBOUT|FTW-A|CSI-A|CSI-Z$|ntbC$|fntbC$|rxC$|fnTR|fntbA|fntbB|fntbC2|fntbD|fntbE|fntbF|m184|mGEN|scSRW|scBox|scPool|scTenth|SHIMA|TVISIT)/.test(name)) {
      segRows.push({ marker: name + (detail !== undefined ? ':' + String(detail) : ''), rolls, passRel: rolls - passStartRolls });
    }
    oSeg?.(name, detail);
  };
  const oFCM = g.__swFCMark;
  g.__swFCMark = (tag) => {
    if (typeof tag === 'string' && /^(SCIN|SCOUT|FSIN|FSOUT|FNTBIN|FNTBOUT)/.test(tag)) {
      segRows.push({ marker: tag, rolls, passRel: rolls - passStartRolls });
    }
    if (tag === 'SCOUT' && store) {
      // 残差区快照（与 rig TSEG|scZone 同格式：type.act.liq.lty;）
      let zb = '';
      for (let yy = 762; yy <= 767; yy++) {
        for (let xx = 3844; xx <= 3849; xx++) {
          const i = store.idx(xx, yy);
          const act = (store.flags[i] & 1) === 1;
          zb += `${act ? SHEET[store.type[i]] >= 0 ? SHEET[store.type[i]] : 9999 : -1}.${store.liquid[i]}.${store.liquidType[i] - 1};`;
        }
      }
      segRows.push({ marker: 'scZone|' + zb, rolls, passRel: rolls - passStartRolls });
    }
    oFCM?.(tag);
  };
  // ★IIIII101e：Shimmerator 探针基座（TVISIT 定向示波）
  (g as { __swShimTargets?: Set<string> }).__swShimTargets = new Set(['3846,764', '3846,765', '3847,764', '3845,764']);

  await generateWorld({
    width: W, height: H, seedText: '9293480', evil: 0 as -1 | 0 | 1,
    seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true },
    onWorldPartial: (w, i) => {
      store = w.store as never as TileStore;
      if (i === 57 || i === 58) {
        const snap = i === 57 ? snap104 : snap105;
        for (const k of ARRAYS) snap[k] = (store[k] as TA).slice();
        (snap as unknown as { __rolls: number }).__rolls = rolls;
        (snap as unknown as { __passRel: number }).__passRel = rolls - passStartRolls;
      }
    },
  } as Parameters<typeof generateWorld>[0]);

  g.__swSeg = oSeg;
  g.__swFCMark = oFCM;
  g.__swOnRoll = oRoll;
  RNGp.reseed = oReseed;
  passRows.push({ pass: curPass, seed: 0, rolls: rolls - passStartRolls });

  // ── 快照落盘 ──
  for (const [tag, snap] of [['js104', snap104], ['js105', snap105]] as const) {
    for (const k of ARRAYS) {
      const a = snap[k] as TA;
      writeFileSync(`${OUT}/${tag}.${EXT[k]}`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    // sheet 映射 typ（离线 python 对拍用：活性→sheet，非活性→0）
    const st2 = new Uint16Array(N);
    const ty = snap.type as Uint16Array, fl = snap.flags as Uint8Array;
    for (let i = 0; i < N; i++) st2[i] = fl[i] & 1 ? (SHEET[ty[i]!] >= 0 ? SHEET[ty[i]!]! : 9999) : 0;
    writeFileSync(`${OUT}/${tag}.styp`, Buffer.from(st2.buffer));
  }

  const L: string[] = [];
  const r104 = (snap104 as unknown as { __rolls: number }).__rolls;
  const r105 = (snap105 as unknown as { __rolls: number }).__rolls;
  const rel105 = (snap105 as unknown as { __passRel: number }).__passRel;
  L.push(`pass105 掷流（dump#104→dump#105 差）=${r105 - r104}  [金标 pc P|105 R=56,453,927]`);
  L.push(`dump105 时点 pass 内掷=${rel105}（含 pass 头 reseed 后尾段杂掷）`);
  L.push(`全生成累计掷=${rolls}`);
  L.push('');
  L.push('── FC 段标掷位梯（pass 内相对掷）──');
  let prev = 0;
  for (const s of segRows) {
    L.push(`  ${s.marker.padEnd(14)} passRel=${s.passRel}  Δ=${s.passRel - prev}`);
    prev = s.passRel;
  }
  L.push('');
  L.push('── 尾段 pass 掷账（pass>=99）──');
  for (const p of passRows) {
    if (p.pass >= 99) L.push(`  pass#${p.pass} rolls=${p.rolls} seed=${p.seed}`);
  }

  // ── 8 通道差账（JS105 vs 金标 105；JS104 vs 金标 104）──
  const cmp = (tag: string, idx: number, snap: Record<string, TA>): { dA: number; dT: number; dW: number; dL: number; dHf: number; dSl: number; dLt: number; first: string; pair: Map<string, number>; cells: number[] } => {
    const names = NAMES.get(idx)!;
    const pre = `${G2}/${String(idx).padStart(3, '0')}_${names}`;
    const GT = le16(`${pre}.typ`), GA = u8(`${pre}.act`), GW = le16(`${pre}.wal`), GL = u8(`${pre}.liq`);
    const GHF = u8(`${pre}.half`), GSL = u8(`${pre}.slope`), GLT = u8(`${pre}.lty`), GIA = u8(`${pre}.inact`);
    let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, firstI = -1;
    const pair = new Map<string, number>();
    const cells: number[] = [];
    const jt0 = snap.flags as Uint8Array, jtT = snap.type as Uint16Array, jtW = snap.wall as Uint16Array;
    const jtL = snap.liquid as Uint8Array, jtHf = snap.half as Uint8Array, jtSl = snap.slope as Uint8Array;
    const jtLt = snap.liquidType as Uint8Array, jtWir = snap.wire as Uint8Array;
    for (let i = 0; i < N; i++) {
      const va = GA[i]!, ja = jt0[i]! & 1;
      const vt = va ? GT[i]! : 0;
      const jt = ja ? (SHEET[jtT[i]!] >= 0 ? SHEET[jtT[i]!]! : 9999) : 0;
      let bad = false;
      if (va !== ja) { dA++; bad = true; }
      if (vt !== jt) { dT++; bad = true; pair.set(`T${vt}>${jt}`, (pair.get(`T${vt}>${jt}`) ?? 0) + 1); }
      if (GW[i]! !== jtW[i]!) { dW++; bad = true; }
      if (GL[i]! !== jtL[i]!) { dL++; bad = true; }
      if (GHF[i]! !== jtHf[i]!) { dHf++; bad = true; }
      if (GSL[i]! !== jtSl[i]!) { dSl++; bad = true; }
      const vl = GL[i]! > 0 ? GLT[i]! + 1 : 0;
      const jl = jtL[i]! > 0 ? jtLt[i]! : 0;
      if (vl !== jl) { dLt++; bad = true; }
      void GIA[i];
      void (jtWir[i]! >>> 5);
      if (bad) { if (firstI < 0) firstI = i; if (cells.length < 50000) cells.push(i); }
    }
    L.push(`${tag} A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} first=(${firstI % W},${Math.floor(firstI / W)}) pairs=${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}x${n}`).join(' ')}`);
    return { dA, dT, dW, dL, dHf, dSl, dLt, first: firstI >= 0 ? `(${firstI % W},${Math.floor(firstI / W)})` : '', pair, cells };
  };
  L.push('');
  L.push('── 8 通道差账 ──');
  const d105 = cmp('JS105vsG105', 105, snap105);
  cmp('JS104vsG104', 104, snap104);

  // ── 增量分类：金标 104→105 与 JS 104→105 的写面账 ──
  const pre104 = `${G2}/104_Remove_Broken_Traps`, pre105 = `${G2}/105_Final_Cleanup`;
  const g104t = le16(`${pre104}.typ`), g104a = u8(`${pre104}.act`);
  const g105t = le16(`${pre105}.typ`), g105a = u8(`${pre105}.act`);
  const cat = new Map<string, number>();
  const catByTile = new Map<string, number>();
  for (const i of d105.cells) {
    const gva = g105a[i]!, jva = (snap105.flags as Uint8Array)[i]! & 1;
    const gvt = gva ? g105t[i]! : 0;
    const jvt = jva ? SHEET[(snap105.type as Uint16Array)[i]!] ?? 9999 : 0;
    const g04a = g104a[i]!, g04t = g04a ? g104t[i]! : 0;
    const j04a = (snap104.flags as Uint8Array)[i]! & 1;
    const j04t = j04a ? SHEET[(snap104.type as Uint16Array)[i]!] ?? 9999 : 0;
    const gChanged = g105a[i] !== g104a[i] || gvt !== g04t;
    const jChanged = jva !== j04a || jvt !== j04t;
    const kind = gChanged && jChanged ? 'BOTH-DIFF' : gChanged ? 'G-ONLY' : jChanged ? 'J-ONLY' : 'STATE-ONLY';
    cat.set(kind, (cat.get(kind) ?? 0) + 1);
    const tk = `${kind} T${g04t}>${gvt} | T${j04t}>${jvt}`;
    catByTile.set(tk, (catByTile.get(tk) ?? 0) + 1);
  }
  L.push('');
  L.push('── #105 差格增量分类（差格 ∩ 写面变迁）──');
  for (const [k, n] of [...cat.entries()].sort((a, b) => b[1] - a[1])) L.push(`  ${k} ×${n}`);
  L.push('  top 变迁对（金标 104→105 | JS 104→105）:');
  for (const [k, n] of [...catByTile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24)) L.push(`    ${k} ×${n}`);

  // ── 首差邻域图 ──
  const m = d105.first.match(/\((\d+),(\d+)\)/);
  if (m) {
    const cx = Number(m[1]), cy = Number(m[2]);
    const x0 = Math.max(0, cx - 12), x1 = Math.min(W - 1, cx + 40);
    const y0 = Math.max(0, cy - 4), y1 = Math.min(H - 1, cy + 8);
    const rows: string[] = [];
    rows.push(`   x=${x0}..${x1}  列: g104→g105 / j104→j105`);
    for (let y = y0; y <= y1; y++) {
      let line = `y=${String(y).padStart(4)} `;
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const g04a = g104a[i]!, g05a = g105a[i]!;
        const j04a = (snap104.flags as Uint8Array)[i]! & 1, j05a = (snap105.flags as Uint8Array)[i]! & 1;
        const g04t = g04a ? g104t[i]! : 0, g05t = g05a ? g105t[i]! : 0;
        const j04t = j04a ? SHEET[(snap104.type as Uint16Array)[i]!] ?? 9999 : 0;
        const j05t = j05a ? SHEET[(snap105.type as Uint16Array)[i]!] ?? 9999 : 0;
        const same = g05t === j05t && g05a === j05a;
        const cell = `${g04t}>${g05t}|${j04t}>${j05t}`;
        line += (same ? ' ' : '!') + cell + ' ';
      }
      rows.push(line);
    }
    L.push('');
    L.push(`── 邻域图 (${cx},${cy}) ± ──`);
    L.push(...rows);
  }

  writeFileSync(`${OUT}/iii101e-delta.txt`, L.join('\n') + '\n');
  console.log(L.join('\n'));
});

// 106 槽名（从 G2 目录 readdir 取，_mile8 DUMPNAME 同源；模块载入期构建）
const NAMES = new Map<number, string>();
for (const f of readdirSync(G2)) {
  const m = f.match(/^(\d{3})_(.+)\.typ$/);
  if (m) NAMES.set(Number(m[1]), m[2]);
}
