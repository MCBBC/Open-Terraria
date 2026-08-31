// IIII102 批：GrassPlants pass（pumpkinSeasonArm + runGrassPlantsPass）单窗反演重放。
// 克隆 _iii89dg 捕获/回放骨架，靶 = pumpkin 链 mile8 新前沿 #86 Weeds @GlowingMushroomPlants。
// ① CAP：全量生成，在 ▶<LABEL>（缺省 GrassPlants）reseed 时点深拷贝 store 全通道 + gs
// ② RE：hydrate → new RNG(seed) → pumpkinSeasonArm + runGrassPlantsPass → 对拍 G2 dump#<CMP>
//    八通道；SW_I102_ROLLLOG 落 pass 内样本值流（`mc|value`）。
// 用法：
//   SW_I102CAP=1 SW_I102_TAG=gp-pumpkin SW_I102_LABEL=GrassPlants \
//   SW_I102_OUT=/tmp/iiiiii102-out/cap-gp-pumpkin \
//   SW_I102_SEED='pumpkinseason|20260904' SW_I102_FLAGS=halloweenGen SW_I102_EVIL=0 \
//   npx vitest run tools/_ii102gp.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { pumpkinSeasonArm } from '../src/world/gen/vanilla/SecretSeedDoEndsPass';
import { runGrassPlantsPass, runFlowersPass } from '../src/world/gen/vanilla/SurfaceDecorPasses';
import { runSmoothWorldPass } from '../src/world/gen/vanilla/HalfBrickPass';

const RUN_CAP = process.env.SW_I102CAP === '1';
const RUN_RE = process.env.SW_I102RE === '1';
const TAG = process.env.SW_I102_TAG ?? 'x';
const OUT = process.env.SW_I102_OUT ?? `/tmp/iiiiii102-out/cap-${TAG}`;
const G2 = process.env.SW_I102_G2 ?? '';
const CMP_NAME = process.env.SW_I102_CMP ?? 'Weeds';        // 窗口末态 dump 名
const BASE_NAME = process.env.SW_I102_BASE ?? 'Webs_And_Honey'; // 基座自检名（绿基线）
const W = Number(process.env.SW_I102_W ?? 4200), H = Number(process.env.SW_I102_H ?? 1200), N = W * H;
const SEED = process.env.SW_I102_SEED ?? '';
const EVIL = Number(process.env.SW_I102_EVIL ?? 0);
const LABEL = process.env.SW_I102_LABEL ?? 'GrassPlants';
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I102_FLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;

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
    writeFileSync(`${dir}/base_${c}.bin`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
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
      return new Ctor((o.d?.length ?? 0)).fill ? (() => { const arr = new Ctor((o.d?.length ?? 0)) as { set(a: unknown[]): void }; arr.set(o.d!); return arr; })() : null;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

(RUN_CAP ? it : it.skip)(`capture base at ▶${LABEL}`, async () => {
  if (!SEED || !G2) throw new Error('SW_I102_SEED/SW_I102_G2 required');
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
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_ii102gp')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === LABEL) {
            mkdirSync(OUT, { recursive: true });
            serializeStore(liveStore, OUT);
            const gs = lastGenState();
            if (!gs) throw new Error('gs missing');
            writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(gs)));
            console.log(`captured @${lab} tag=${TAG} gs keys=${Object.keys(gs).length}`);
            done = true;
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  try {
    const SLOTNAME = process.env.SW_I102_SLOTNAME ?? '';
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(FLAGS).length ? FLAGS : undefined,
      onWorldPartial: (w2, _i, pn) => {
        liveStore = w2.store as never as TileStore;
        if (!done && SLOTNAME && pn === SLOTNAME) {
          // 槽末锚捕获：指定槽名完成时点的 store（=下一 pass 头基座）
          mkdirSync(OUT, { recursive: true });
          serializeStore(liveStore!, OUT);
          const gsX = lastGenState();
          if (gsX) writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(gsX)));
          console.log(`captured @slotend:${SLOTNAME} tag=${TAG}`);
          done = true;
        }
      },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!done && !(process.env.SW_I102_SLOTNAME ?? '')) throw new Error(`capture failed: label ${LABEL} never hit`);
}, 600_000);

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    if (buf.length !== len * bytesPer) throw new Error(`base_${c}.bin size mismatch`);
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8'))) as GenState;
  return { st, gs };
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

(RUN_RE ? it : it.skip)(`replay grassPlants window on base vs x86 dump#${CMP_NAME}`, () => {
  const DUMPNAME = new Map<number, string>();
  const IDXNAME = new Map<string, number>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) { DUMPNAME.set(Number(m[1]), m[2]); IDXNAME.set(m[2], Number(m[1])); }
  }
  const idxOf = (nm: string): number => {
    const i = IDXNAME.get(nm);
    if (i === undefined) throw new Error(`dump ${nm} missing in ${G2}`);
    return i;
  };
  const pre = (idx: number): string => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
  const CMP = idxOf(CMP_NAME), BASE = idxOf(BASE_NAME);
  const xt = le16(`${pre(CMP)}.typ`), xa = readFileSync(`${pre(CMP)}.act`), xw = le16(`${pre(CMP)}.wal`),
    xl = readFileSync(`${pre(CMP)}.liq`), xhf = readFileSync(`${pre(CMP)}.half`), xsl = readFileSync(`${pre(CMP)}.slope`),
    xlt = readFileSync(`${pre(CMP)}.lty`), xia = readFileSync(`${pre(CMP)}.inact`);
  const { st, gs } = hydrate();
  // 基座自检（对上层 dump=BASE）——全通道（act/typ/wal/liq/half/slope/lty/inact）
  {
    const bt = le16(`${pre(BASE)}.typ`), ba = readFileSync(`${pre(BASE)}.act`);
    const bw = le16(`${pre(BASE)}.wal`), bl = readFileSync(`${pre(BASE)}.liq`);
    const bhf = readFileSync(`${pre(BASE)}.half`), bsl = readFileSync(`${pre(BASE)}.slope`);
    const blt = readFileSync(`${pre(BASE)}.lty`), bia = readFileSync(`${pre(BASE)}.inact`);
    let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
    for (let i = 0; i < N; i++) {
      const ja = st.flags[i]! & 1;
      if (ba[i] !== ja) { dA++; continue; }
      if (ja && bt[i] !== (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!] : 9999)) { dT++; continue; }
      if (bw[i] !== st.wall[i]) dW++;
      if (bl[i] !== st.liquid[i]) dL++;
      if (bhf[i] !== st.half[i]) dHf++;
      if (bsl[i] !== st.slope[i]) dSl++;
      const vl = bl[i]! > 0 ? blt[i]! + 1 : 0;
      const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
      if (vl !== jl) dLt++;
      if ((bia[i] ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) dIa++;
    }
    console.log(`[base selfcheck vs ${BASE_NAME}] A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa}`);
    if (dA || dT || dW || dL || dHf || dSl || dLt || dIa) throw new Error('base drift — snapshot stale, re-capture');
  }
  const rng = new RNG(gs.seed);
  // 花圃决策探针：打印进入 kill/fit 分支的锚点与格（m,n）+ 门读数
  if (process.env.SW_I102_FLTRACE) {
    (globalThis as { __swFlCap?: unknown }).__swFlCap = (m: number, n: number, tag: string) => {
      console.log(`FL ${tag} @(${m},${n})`);
    };
  }
  const ROLLLOG = process.env.SW_I102_ROLLLOG;
  if (ROLLLOG) writeFileSync(ROLLLOG, '');
  let rollH = 2166136261 >>> 0;
  let rollN = 0;
  const oOnRoll = (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll;
  (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll = (v) => {
    rollN++;
    rollH = ((rollH ^ (v >>> 0)) * 16777619) >>> 0;
    if (ROLLLOG) { try { appendFileSync(ROLLLOG, `${rollN}|${v}\n`); } catch { /* ignore */ } }
  };
  globalThis.__i102RollHash = () => `${rollH.toString(16)}(${rollH})`;
  try {
    const FN = process.env.SW_I102_FN ?? 'grass';
    if (FN === 'flowers') { runFlowersPass(st, rng, gs); }
    else if (FN === 'smooth') { runSmoothWorldPass(st, rng, gs); }
    else { pumpkinSeasonArm(st, rng, gs); runGrassPlantsPass(st, rng); }
  } finally {
    (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll = oOnRoll;
  }
  console.log(`grassPlants window totalSample=${rollN}`);
  console.log(`passFnvHash=${globalThis.__i102RollHash?.() ?? 'na'}`);
  // ★终态导出（sheet 域）——离线对拍 x86 写迹（dump#BASE→#CMP 的写集）
  if (process.env.SW_I102_SAVEAFTER === '1') {
    const sheetTyp = new Uint16Array(N);
    const actA = new Uint8Array(N), slp = new Uint8Array(N), hlf = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const va = st.flags[i]! & 1;
      // ghost 保真：非活性格照映射（x86 dump 对位口径），勿清零
      sheetTyp[i] = st.type[i] === 0 || SHEET[st.type[i]!] < 0 ? (va ? 9999 : 0)
        : (SHEET[st.type[i]!] ?? 9999);
      actA[i] = va; slp[i] = st.slope[i]!; hlf[i] = st.half[i]!;
    }
    writeFileSync(`${OUT}/jsafter.typ`, Buffer.from(sheetTyp.buffer, sheetTyp.byteOffset, N * 2));
    writeFileSync(`${OUT}/jsafter.act`, Buffer.from(actA.buffer, 0, N));
    writeFileSync(`${OUT}/jsafter.slope`, Buffer.from(slp.buffer, 0, N));
    writeFileSync(`${OUT}/jsafter.half`, Buffer.from(hlf.buffer, 0, N));
    console.log('[i102] jsafter saved');
  }
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
  const pair = new Map<string, number>();
  let fI = -1;
  const cells: Array<{ x: number; y: number; desc: string }> = [];
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; fI = fI < 0 ? i : fI; cells.push({ x: i % W, y: (i / W) | 0, desc: `act ${va}>${ja} t ${va ? xt[i] : '-'}>${ja ? SHEET[st.type[i]!] ?? 9999 : '-'}` }); continue; }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; fI = fI < 0 ? i : fI; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); cells.push({ x: i % W, y: (i / W) | 0, desc: `t ${vt}>${jt}` }); continue; }
    if (xw[i] !== st.wall[i]) { dW++; fI = fI < 0 ? i : fI; continue; }
    if (xl[i] !== st.liquid[i]) { dL++; fI = fI < 0 ? i : fI; continue; }
    if (xhf[i] !== st.half[i]) { dHf++; fI = fI < 0 ? i : fI; continue; }
    if (xsl[i] !== st.slope[i]) { dSl++; fI = fI < 0 ? i : fI; continue; }
    const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; fI = fI < 0 ? i : fI; continue; }
    const via = xia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; fI = fI < 0 ? i : fI; continue; }
  }
  console.log(`DIFF A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} first=${fI < 0 ? '-' : `(${fI % W},${Math.floor(fI / W)})`}`);
  console.log(`pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  const show = cells.slice(0, Number(process.env.SW_I102_NCELLS ?? 60));
  for (const c of show) console.log(`  (${c.x},${c.y}) ${c.desc}`);
  writeFileSync(`${OUT}/diffcells.json`, JSON.stringify(cells));
}, 600_000);
