// 一次性诊断（IIIIII73 批）：DRUNK #42 Living_Trees 单 pass 反演重放。
// ① SW_I73CAP=1：全量生成 drunk 链（seed 51620200/evil -1），在 ▶LivingTrees reseed
//   时点深拷贝 store 全通道 + gs 落盘 /tmp/iii73-out/base_*（后续迭代免重跑 0..41）。
// ② SW_I73REPLAY=1：hydrate 基座 → new RNG(gs.seed) → runLivingTreesPass 对拍 G2
//   dump#042 八通道，报首差/pairs/bbox；SW_I73_MARKS=1 打 SW_DG_LTMARK 标记行；
//   SW_I73_DIFFLIST=1 全差清单；__ltRc 掷数计镜由本文件挂载。
// 用法：cd game && SW_I73REPLAY=1 npx vitest run tools/_iii73lt.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runLivingTreesPass } from '../src/world/gen/vanilla/LivingTreePass';

const RUN_CAP = process.env.SW_I73CAP === '1';
const RUN_RE = process.env.SW_I73REPLAY === '1';
const OUT = process.env.SW_I73_OUT ?? '/tmp/iii73-out';
const CAP_LABEL = process.env.SW_I73_LABEL ?? 'LivingTrees';
const CMP_IDX = Number(process.env.SW_I73_CMP ?? 42);
const G2 = process.env.SW_I73_G2 ?? '/tmp/iii47-out/x86-drunk';
const W = 4200, H = 1200, N = W * H;
const SEED = process.env.SW_M8_SEED ?? '51620200';

if (process.env.SW_I73_MARKS === '1') process.env.SW_DG_LTMARK = '1';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;

function serializeStore(st: TileStore, dir: string): void {
  const hdr: Record<string, number | string> = { w: st.w, h: st.h };
  for (const c of CHANS) {
    const a = (st as unknown as Record<string, Uint8Array | Uint16Array>)[c];
    const b = Buffer.from(a.buffer, a.byteOffset, a.byteLength);
    writeFileSync(`${dir}/base_${c}.bin`, b);
    hdr[`${c}_len`] = a.length;
  }
  writeFileSync(`${dir}/base_hdr.json`, JSON.stringify(hdr));
}

type AnyGs = Record<string, unknown>;
function serVal(v: unknown): unknown {
  if (v instanceof Uint8Array || v instanceof Int8Array) return { __t: v.constructor.name, d: Array.from(v) };
  if (v instanceof Uint16Array || v instanceof Int16Array) return { __t: v.constructor.name, d: Array.from(v) };
  if (v instanceof Uint32Array || v instanceof Int32Array) return { __t: v.constructor.name, d: Array.from(v) };
  if (v instanceof Float32Array || v instanceof Float64Array) return { __t: v.constructor.name, d: Array.from(v) };
  if (Array.isArray(v)) return v.map(serVal);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) o[k] = serVal((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
}
function desVal(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(desVal);
  if (v && typeof v === 'object') {
    const o = v as { __t?: string; d?: unknown[] };
    if (o.__t) {
      const Ctor = (globalThis as unknown as Record<string, new (n: number) => unknown>)[o.__t];
      return new Ctor((o.d ?? []).length).fill ? (() => { const arr = new Ctor((o.d ?? []).length) as { set(a: unknown[]): void }; arr.set(o.d!); return arr; })() : null;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

interface Snap { frameX: Uint16Array; frameY: Uint16Array }

(RUN_CAP ? it : it.skip)('capture base at LivingTrees pass head (drunk)', async () => {
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  };
  let liveStore: TileStore | null = null;
  let done = false;
  let snap: Snap | null = null;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (liveStore && !done) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii73lt')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === CAP_LABEL && !done) {
            mkdirSync(OUT, { recursive: true });
            snap = { frameX: liveStore.frameX.slice(), frameY: liveStore.frameY.slice() };
            const gs = lastGenState();
            if (!gs) throw new Error('gs missing');
            writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(gs)));
            serializeStore(liveStore, OUT);
            console.log(`captured @${lab} store ch=${CHANS.length} gs keys=${Object.keys(gs).length}`);
            done = true;
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: -1,
      seedFlags: { drunkWorld: true },
      onWorldPartial: (w2) => { liveStore = w2.store as never as TileStore; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!done) throw new Error(`capture failed: ${CAP_LABEL} label never hit`);
  void snap;
}, 600_000);

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    if (buf.length !== len * bytesPer) throw new Error(`base_${c}.bin size mismatch ${buf.length} != ${len * bytesPer}`);
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8'))) as GenState;
  return { st, gs };
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

(RUN_RE ? it : it.skip)(`replay LivingTrees on base and compare vs x86 dump#${CMP_IDX}`, () => {
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  const pre = `${G2}/${String(CMP_IDX).padStart(3, '0')}_${DUMPNAME.get(CMP_IDX)}`;
  if (!existsSync(`${pre}.typ`)) throw new Error(`dump missing at ${pre}`);
  const xt = le16(`${pre}.typ`), xa = readFileSync(`${pre}.act`), xw = le16(`${pre}.wal`),
    xl = readFileSync(`${pre}.liq`), xhf = readFileSync(`${pre}.half`), xsl = readFileSync(`${pre}.slope`),
    xlt = readFileSync(`${pre}.lty`), xia = readFileSync(`${pre}.inact`);
  const { st, gs } = hydrate();
  console.log('gs:', JSON.stringify({
    worldSurface: gs.worldSurface, rockLevel: gs.rockLevel,
    beachDistance: gs.beachDistance, numMCaves: gs.numMCaves,
    flags: Object.entries(gs.seedFlags).filter(([, v]) => v),
  }));
  // ★基座自检：hydrate 后先对上一层 dump(041) 八通道计数（非零=基座错）
  {
    const pre41 = `${G2}/041_${DUMPNAME.get(41)}`;
    const a41 = readFileSync(`${pre41}.act`), t41 = le16(`${pre41}.typ`), w41 = le16(`${pre41}.wal`);
    let dA = 0, dT = 0, dW = 0;
    for (let i2 = 0; i2 < N; i2++) {
      if (a41[i2] !== (st.flags[i2]! & 1)) dA++;
      else if (a41[i2] && t41[i2] !== (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!] : 9999)) dT++;
      else if (w41[i2] !== st.wall[i2]) dW++;
    }
    console.log(`[base selfcheck vs #041] dAct=${dA} dTyp=${dT} dWal=${dW}`);
  }
  // 掷数计镜（与 JS 内 SW_DG_LTMARK MARK 行的 rc= 同源）
  const rcBox = { n: 0 };
  const anyRng = {} as Record<string, unknown>;
  void anyRng;
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
  (globalThis as unknown as { __ltRc?: { n: number } }).__ltRc = rcBox;
  // ★IIIII73 阶段盒快照（与 rig JJHook.Snap 同构字节布局；SW_I73_SNAPS=<dir> 启用）
  const SNAPDIR_OUT = process.env.SW_I73_SNAPS;
  if (SNAPDIR_OUT) {
    mkdirSync(SNAPDIR_OUT, { recursive: true });
    const BOX = (process.env.SW_I73_SNAPBOX ?? '1150,4050,60,1050').split(',').map(Number) as [number, number, number, number];
    const X0b = BOX[0], X1b = BOX[1], Y0b = BOX[2], Y1b = BOX[3];
    const rwb = X1b - X0b + 1, rhb = Y1b - Y0b + 1, nb = rwb * rhb;
    const dumpBox = (tag: string): void => {
      const typ = new Uint8Array(nb * 2), act = new Uint8Array(nb), wal = new Uint8Array(nb * 2),
        liq = new Uint8Array(nb), hf = new Uint8Array(nb), sl = new Uint8Array(nb), lt = new Uint8Array(nb), ia = new Uint8Array(nb);
      let pp = 0;
      for (let y = Y0b; y <= Y1b; y++) for (let x = X0b; x <= X1b; x++, pp++) {
        const ii = st.idx(x, y);
        const sheetv = SHEET[st.type[ii]] ?? 9999;
        const tv2 = st.type[ii] === 0 ? 0 : (sheetv >= 0 ? sheetv : 9999);
        typ[pp * 2] = tv2 & 0xff; typ[pp * 2 + 1] = (tv2 >>> 8) & 0xff;
        act[pp] = st.flags[ii]! & 1;
        wal[pp * 2] = st.wall[ii]! & 0xff; wal[pp * 2 + 1] = (st.wall[ii]! >>> 8) & 0xff;
        liq[pp] = st.liquid[ii]!;
        hf[pp] = st.half[ii]!; sl[pp] = st.slope[ii]!;
        lt[pp] = st.liquidType[ii]! > 0 ? st.liquidType[ii]! - 1 : 0;
        ia[pp] = (st.wire[ii]! >>> 5) & 1;
      }
      writeFileSync(`${SNAPDIR_OUT}/${tag}.typ`, Buffer.from(typ.buffer));
      writeFileSync(`${SNAPDIR_OUT}/${tag}.act`, Buffer.from(act.buffer));
      writeFileSync(`${SNAPDIR_OUT}/${tag}.wal`, Buffer.from(wal.buffer));
      writeFileSync(`${SNAPDIR_OUT}/${tag}.liq`, Buffer.from(liq.buffer));
    };
    let boxSeq = 0;
    (globalThis as unknown as { __ltSnapBox?: (tag: string) => void }).__ltSnapBox = (tag) => {
      dumpBox(`${String(boxSeq).padStart(3, '0')}_${tag}`);
      boxSeq++;
    };
  }
  const t0 = Date.now();
  runLivingTreesPass(st, rng, gs, [] as never);
  console.log(`runLivingTreesPass ${Date.now() - t0}ms rolls=${rcBox.n}`);
  if (process.env.SW_I73_SAVE === '1') {
    const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
    const bufOf = (v: Uint8Array | Uint16Array): Buffer => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
    for (const [nm, v] of Object.entries(rec)) {
      if (v instanceof Uint8Array || v instanceof Uint16Array) {
        try { writeFileSync(`${OUT}/replay_${nm}.bin`, bufOf(v)); } catch { /* skip */ }
      }
    }
  }
  // 八通道对拍（mile8 同构）
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, dGh = 0;
  const pair = new Map<string, number>();
  let fI = -1;
  const bbox = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, -1, -1];
  const mark = (i: number): void => {
    if (fI < 0) fI = i;
    const x = i % W, y = (i / W) | 0;
    bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y);
    bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y);
  };
  const pk = (k: string, i: number): void => { pair.set(k, (pair.get(k) ?? 0) + 1); mark(i); };
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; pk(`A${va}>${ja}`, i); continue; }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; pk(`T${vt}>${jt}`, i); }
    if (xw[i] !== st.wall[i]) { dW++; pk(`W${xw[i]}>${st.wall[i]}`, i); }
    if (xl[i] !== st.liquid[i]) { dL++; pk(`L${xl[i]}>${st.liquid[i]}`, i); }
    if (xhf[i] !== st.half[i]) { dHf++; pk(`Hf${xhf[i]}>${st.half[i]}`, i); }
    if (xsl[i] !== st.slope[i]) { dSl++; pk(`Sl${xsl[i]}>${st.slope[i]}`, i); }
    const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; pk(`Y${vl}>${jl}`, i); }
    const via = xia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; pk(`Ia${via}>${jia}`, i); }
    const vg = va ? 0 : xt[i]!;
    const jg = ja ? 0 : (st.type[i] === 0 ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999));
    if (vg !== jg) dGh++;
  }
  const bad = dA || dT || dW || dL || dHf || dSl || dLt || dIa;
  if (bad && process.env.SW_I73_DIFFLIST === '1') {
    const lines: string[] = [];
    for (let i = 0; i < N; i++) {
      const va = xa[i]!, ja = st.flags[i]! & 1;
      const vt = va ? xt[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (va !== ja) { lines.push(`${i % W},${Math.floor(i / W)} act ${va}>${ja} t ${vt}>${jt}`); continue; }
      if (vt !== jt) { lines.push(`${i % W},${Math.floor(i / W)} t ${vt}>${jt}`); continue; }
      if (xw[i] !== st.wall[i]) lines.push(`${i % W},${Math.floor(i / W)} w ${xw[i]}>${st.wall[i]}`);
    }
    writeFileSync(`${OUT}/difflist.txt`, lines.join('\n') + '\n');
    console.log(`difflist -> ${OUT}/difflist.txt (${lines.length})`);
  }
  console.log(`replay cmp vs #${CMP_IDX}_${DUMPNAME.get(CMP_IDX)}: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} (Gh=${dGh}) ` +
    `${bad ? `✗ first=${fI < 0 ? '' : `(${fI % W},${Math.floor(fI / W)})`} bbox=[${bbox}] pairs=` + [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}×${n}`).join(' ') : '✓'}`);
}, 600_000);
