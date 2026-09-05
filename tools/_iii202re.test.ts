// IIII202 一次性诊断：ddual 链 #43 Living_Trees 离线反演-重放（IIII73 血统）。
// ① SW_I202_CAP=1：全量生成 ddual 链（seed '1.1.1.0.doubledaringdangers|20260831'/evil 0），
//   在 ▶LivingTrees reseed 时点深拷贝 store 全通道 + gs 落盘 /tmp/iii202-out/base。
// ② SW_I202_RE=1：hydrate 基座 → new RNG(gs.seed) → runLivingTreesPass 对拍 G2 dump#043
//   八通道；SW_I202_ROLLS=1 记全掷账（每次调用 方法|参数|结果）；SW_I202_DIFFLIST=1 全差清单；
//   SW_I202_REG=1 限定树域逐行差。
// 用法：cd game && SW_MB_1457=1 SW_I202_CAP=1 npx vitest run tools/_iii202re.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runLivingTreesPass } from '../src/world/gen/vanilla/LivingTreePass';
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runLivingTreesPassHand, setHandDualBounds, hydrateBase } from './_iii202hand';

const RUN_CAP = process.env.SW_I202_CAP === '1';
const RUN_RE = process.env.SW_I202_RE === '1';
const OUT = process.env.SW_I202_OUT ?? '/tmp/iii202-out';
const CAP_LABEL = process.env.SW_I202_LABEL ?? 'LivingTrees';
const CMP_IDX = Number(process.env.SW_I202_CMP ?? 43);
const G2 = process.env.SW_I202_G2 ?? `${process.env.HOME}/GoldenChains/golden-ddual2`;
const W = 4200, H = 1200, N = W * H;
const SEED = process.env.SW_I202_SEED ?? '1.1.1.0.doubledaringdangers|20260831';

if (process.env.SW_I202_MARKS === '1') process.env.SW_DG_LTMARK = '1';

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

(RUN_CAP ? it : it.skip)('capture base at LivingTrees pass head (ddual)', async () => {
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
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (liveStore && !done) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii202re')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === CAP_LABEL && !done) {
            mkdirSync(`${OUT}/base`, { recursive: true });
            const gs = lastGenState();
            if (!gs) throw new Error('gs missing');
            writeFileSync(`${OUT}/base/base_gs.json`, JSON.stringify(serVal(gs)));
            serializeStore(liveStore, `${OUT}/base`);
            // ★LATE 入口态第二件：dualDungeonState 界域登记表（MakePassage/PassageRoom/
            //   HorizontalTunnel 的 dualDungeons 三门消费面）——Dunes 头/DitherSnake 装配
            writeFileSync(`${OUT}/base/base_dual.json`, JSON.stringify({
              enabled: dualDungeonState.enabled,
              potentialBounds: dualDungeonState.potentialBounds,
              dungeons: dualDungeonState.dungeons,
            }));
            console.log(`captured @${lab} store ch=${CHANS.length} gs keys=${Object.keys(gs).length} ` +
              `dual bounds=${JSON.stringify(dualDungeonState.potentialBounds)}`);
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
      width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1,
      onWorldPartial: (w2) => { liveStore = w2.store as never as TileStore; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!done) throw new Error(`capture failed: ${CAP_LABEL} label never hit`);
}, 600_000);

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    if (buf.length !== len * bytesPer) throw new Error(`base_${c}.bin size mismatch ${buf.length} != ${len * bytesPer}`);
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base/base_gs.json`, 'utf8'))) as GenState;
  // LATE 入口态还原：界域登记表（管线在 Dunes 头装配,离线重放须手动回填）
  const dual = JSON.parse(readFileSync(`${OUT}/base/base_dual.json`, 'utf8')) as {
    enabled: boolean; potentialBounds: { l: number; t: number; r: number; b: number }[];
  };
  dualDungeonState.enabled = dual.enabled;
  dualDungeonState.potentialBounds = dual.potentialBounds;
  return { st, gs };
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

interface Loaded { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array }
function loadDump(idx: number, DUMPNAME: Map<number, string>): Loaded {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
  if (!existsSync(`${pre}.typ`)) throw new Error(`dump missing at ${pre}`);
  return {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`),
    l: readFileSync(`${pre}.liq`), hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`),
    lt: readFileSync(`${pre}.lty`), ia: readFileSync(`${pre}.inact`),
  };
}

(RUN_RE ? it : it.skip)(`replay LivingTrees on base and compare vs x86 dump#${CMP_IDX}`, () => {
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  const xv = loadDump(CMP_IDX, DUMPNAME);
  const { st, gs } = hydrate();
  console.log('gs:', JSON.stringify({
    worldSurface: gs.worldSurface, rockLevel: gs.rockLevel, beachDistance: gs.beachDistance,
    numMCaves: gs.numMCaves, flags: Object.entries(gs.seedFlags).filter(([, v]) => v),
  }));
  // 基座自检：hydrate 后对上一层 dump(042) 八通道计数（非零=基座错）
  {
    const b = loadDump(CMP_IDX - 1, DUMPNAME);
    let dA = 0, dT = 0, dW = 0;
    for (let i2 = 0; i2 < N; i2++) {
      if (b.a[i2] !== (st.flags[i2]! & 1)) dA++;
      else if (b.a[i2] && b.t[i2] !== (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!] : 9999)) dT++;
      else if (b.w[i2] !== st.wall[i2]) dW++;
    }
    console.log(`[base selfcheck vs #${String(CMP_IDX - 1).padStart(3, '0')}] dAct=${dA} dTyp=${dT} dWal=${dW}`);
    if (dA || dT || dW) throw new Error('base mismatch vs gold #042 — capture/hydrate broken');
  }
  // 掷账仪：包装单实例 RNG 全方法，逐调用记 方法|参数|结果
  const rolls: string[] = [];
  const rcBox = { n: 0 };
  const rng = new RNG(gs.seed);
  const rp = rng as unknown as Record<string, unknown>;
  const wrap = (k: string, fmt: (args: unknown[], r: unknown) => string): void => {
    const orig = rp[k] as (...a: unknown[]) => unknown;
    if (typeof orig !== 'function') return;
    rp[k] = ((...a: unknown[]) => {
      const r = orig.apply(rng, a);
      rcBox.n++;
      rolls.push(`${rcBox.n} ${k}(${a.map((x) => String(x)).join(',')})=${fmt(a, r)}`);
      return r;
    }) as never;
  };
  wrap('int', (_a, r) => String(r));
  wrap('nextInt', (_a, r) => String(r));
  wrap('next', (_a, r) => String(r));
  wrap('nextIntRange', (_a, r) => String(r));
  wrap('chance', (_a, r) => String(r));
  wrap('pick', (a, r) => `${String(r)}@${(a[0] as unknown[]).length}`);
  wrap('range', (_a, r) => String(r));
  (globalThis as unknown as { __ltRc?: { n: number } }).__ltRc = rcBox;
  // MARK/MK109 行截获（不落 vitest stdout）
  const markLines: string[] = [];
  const oLog = console.log;
  console.log = (...a: unknown[]): void => {
    const s = a.map((x) => String(x)).join(' ');
    if (s.startsWith('MARK|') || s.startsWith('ANCH ') || s.startsWith('LC|') || s.startsWith('MP6|') || s.startsWith('PR0|')) markLines.push(s);
  };
  const t0 = Date.now();
  let ret: unknown;
  const HAND = process.env.SW_I202_HAND === '1';
  try {
    if (HAND) {
      setHandDualBounds(dualDungeonState.potentialBounds);
      // 手译车道：同一基座 hydrate（探针侧已 hydrate 的 st/gs 即同源）——直接跑手译编排
      ret = runLivingTreesPassHand(st, rng, gs, [] as never);
    } else {
      ret = runLivingTreesPass(st, rng, gs, [] as never);
    }
  } finally { console.log = oLog; }
  void ret;
  writeFileSync(`${OUT}/${HAND ? 'hand' : 'js'}-rolls.txt`, rolls.join('\n') + '\n');
  writeFileSync(`${OUT}/${HAND ? 'hand' : 'js'}-marks.txt`, markLines.join('\n') + '\n');
  console.log(`runLivingTreesPass${HAND ? '(hand)' : ''} ${Date.now() - t0}ms rolls=${rcBox.n} marks=${markLines.length}`);
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
  const diffRows: string[] = [];
  for (let i = 0; i < N; i++) {
    const va = xv.a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; pk(`A${va}>${ja}`, i); diffRows.push(`${i % W},${Math.floor(i / W)} act ${va}>${ja} t ${xv.t[i]}>${SHEET[st.type[i]!]} w ${xv.w[i]}>${st.wall[i]}`); continue; }
    const vt = va ? xv.t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; pk(`T${vt}>${jt}`, i); diffRows.push(`${i % W},${Math.floor(i / W)} t ${vt}>${jt} w ${xv.w[i]}>${st.wall[i]}`); }
    if (xv.w[i] !== st.wall[i]) { dW++; pk(`W${xv.w[i]}>${st.wall[i]}`, i); if (vt === jt) diffRows.push(`${i % W},${Math.floor(i / W)} w ${xv.w[i]}>${st.wall[i]}`); }
    if (xv.l[i] !== st.liquid[i]) { dL++; pk(`L${xv.l[i]}>${st.liquid[i]}`, i); }
    if (xv.hf[i] !== st.half[i]) { dHf++; pk(`Hf${xv.hf[i]}>${st.half[i]}`, i); }
    if (xv.sl[i] !== st.slope[i]) { dSl++; pk(`Sl${xv.sl[i]}>${st.slope[i]}`, i); }
    const vl = xv.l[i]! > 0 ? xv.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; pk(`Y${vl}>${jl}`, i); }
    const via = xv.ia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; pk(`Ia${via}>${jia}`, i); }
    const vg = va ? 0 : xv.t[i]!;
    const jg = ja ? 0 : (st.type[i] === 0 ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999));
    if (vg !== jg) dGh++;
  }
  const bad = dA || dT || dW || dL || dHf || dSl || dLt || dIa;
  if (bad && process.env.SW_I202_DIFFLIST === '1') writeFileSync(`${OUT}/difflist.txt`, diffRows.join('\n') + '\n');
  console.log(`replay cmp vs #${CMP_IDX}_${DUMPNAME.get(CMP_IDX)}: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} (Gh=${dGh}) ` +
    `${bad ? `✗ first=${fI < 0 ? '' : `(${fI % W},${Math.floor(fI / W)})`} bbox=[${bbox.join(',')}] pairs=` + [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}×${n}`).join(' ') : '✓'}`);
  // 树域逐行差（SW_I202_REG=1）
  if (process.env.SW_I202_REG === '1') {
    const rows = new Map<number, string[]>();
    for (const ln of diffRows) {
      const p = ln.split(' ')[0]!.split(',');
      const y = Number(p[1]);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push(ln);
    }
    const ys = [...rows.keys()].sort((a, b) => a - b);
    const out2: string[] = [];
    for (const y of ys) out2.push(`y=${y} n=${rows.get(y)!.length} :: ${rows.get(y)!.join(' | ')}`);
    writeFileSync(`${OUT}/diffrows.txt`, out2.join('\n') + '\n');
    console.log(`diffrows -> ${OUT}/diffrows.txt (${ys.length} rows, y∈[${ys[0]}..${ys[ys.length - 1]}])`);
  }
}, 600_000);
