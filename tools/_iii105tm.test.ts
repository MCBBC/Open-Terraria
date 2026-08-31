// IIII97b（2026-08-31，_iii100tm 范式锚点换 MudCavesToJungleGrass）：toadstool
// mile8 首差 #18 Mud_Caves_To_Grass@DesertBiome(27,326) 指纹 T0>59×349/T59>0×238/
// T0>60×86/T60>0×73（A/W/L/Hf/Sl 全零=纯 type 带）单 pass 反演重放。
// ① SW_I05CAP=1：全量生成（seed=771002/surfaceIsMushrooms/G2=golden-toadstool），
//    在 ▶MudCavesToJungleGrass reseed 时点深拷贝 store+gs → $OUT/base_*（该时点
//    state=dump017_Jungle 终态，#17 已绿）。
// ② SW_I05REPLAY=1：hydrate 基座 → 基座自检(vs #017_Jungle) → NotTheBees 跳过 →
//    doSurfaceIsMushroomsEarly → runMudCavesPass 对拍 dump#CMP(默认 18) 八通道；
//    错格全坐标导出 ${OUT}/wrong-cells.csv；SW_I05_STAGE=1 另存 Do 臂后中间态
//    stage_do_*（spread 扫描前输入面取证）；记账 internalSample 值流（n|v 行）。
// 用法：cd game && SW_I05CAP=1 npx vitest run tools/_iii105tm.test.ts
//       cd game && SW_I05REPLAY=1 npx vitest run tools/_iii105tm.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runNotTheBees } from '../src/world/gen/vanilla/NotTheBeesPass';
import { doSurfaceIsMushroomsEarly } from '../src/world/gen/vanilla/SecretSeedDoEndsPass';
import { runMudCavesPass } from '../src/world/gen/vanilla/Spread';

const RUN_CAP = process.env.SW_I05CAP === '1';
const RUN_RE = process.env.SW_I05REPLAY === '1';
const OUT = process.env.SW_I05_OUT ?? '/tmp/iii105-out/cap-toad';
const G2 = process.env.SW_I05_G2 ?? `${process.env.HOME}/GoldenChains/golden-toadstool`;
const CMP_IDX = Number(process.env.SW_I05_CMP ?? 18);
const SEED = process.env.SW_I05_SEED ?? '771002';      // rig world toad-x2 / G2 同种子
const EVIL = Number(process.env.SW_I05_EVIL ?? 0);
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;
function serializeStore(st: TileStore, dir: string, prefix: string): void {
  const hdr: Record<string, number | string> = { w: st.w, h: st.h };
  for (const c of CHANS) {
    const a = (st as unknown as Record<string, Uint8Array | Uint16Array>)[c];
    writeFileSync(`${dir}/${prefix}_${c}.bin`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    hdr[`${c}_len`] = a.length;
  }
  writeFileSync(`${dir}/${prefix}_hdr.json`, JSON.stringify(hdr));
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
      const arr = new Ctor(o.d?.length ?? 0) as { set(a: unknown[]): void };
      arr.set(o.d!);
      return arr;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

(RUN_CAP ? it : it.skip)('capture base at MudCavesToJungleGrass pass head', async () => {
  if (!SEED || !G2) throw new Error('SW_I05_SEED/SW_I05_G2 required');
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
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii105tm')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === 'MudCavesToJungleGrass') {
            mkdirSync(OUT, { recursive: true });
            serializeStore(liveStore!, OUT, 'base');
            const gs = lastGenState();
            if (!gs) throw new Error('gs missing');
            writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(gs)));
            console.log(`captured @${lab} out=${OUT}`);
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
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: { surfaceIsMushrooms: true },
      onWorldPartial: (w2) => { liveStore = w2.store as never as TileStore; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!done) throw new Error('capture failed: MudCavesToJungleGrass label never hit');
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

let DUMPNAME = new Map<number, string>();
{
  try {
    for (const f of readdirSync(G2)) {
      const m = f.match(/^(\d{3})_(.+)\.typ$/);
      if (m) DUMPNAME.set(Number(m[1]), m[2]);
    }
  } catch { /* G2 absent in cap mode */ }
}
interface DumpCh { nm: string; xt: Uint16Array; xa: Uint8Array; xw: Uint16Array; xl: Uint8Array; xhf: Uint8Array; xsl: Uint8Array; xlt: Uint8Array; xia: Uint8Array }
function loadDump(idx: number): DumpCh {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
  if (!existsSync(`${pre}.typ`)) throw new Error(`dump missing at ${pre}`);
  return {
    nm: DUMPNAME.get(idx) ?? '?',
    xt: le16(`${pre}.typ`), xa: readFileSync(`${pre}.act`), xw: le16(`${pre}.wal`),
    xl: readFileSync(`${pre}.liq`), xhf: readFileSync(`${pre}.half`), xsl: readFileSync(`${pre}.slope`),
    xlt: readFileSync(`${pre}.lty`), xia: readFileSync(`${pre}.inact`),
  };
}
/** 全量对拍 + 错格坐标导出（wrong-cells.csv：i,x,y,A,T,W,L,Hf,Sl,Lt,Ia + 说明列） */
function cmpAgainst(tag: string, idx: number, st: TileStore, dumpCsv?: boolean): void {
  const d = loadDump(idx);
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, dGh = 0;
  const pair = new Map<string, number>();
  const rowHist = new Map<number, number>();
  let fI = -1;
  const samples: string[] = [];
  let csv: ReturnType<typeof mkdirCsv> | null = null;
  function mkdirCsv(): { lines: string[] } { return { lines: [] }; }
  if (dumpCsv) csv = mkdirCsv();
  const mark = (i: number, desc: string): void => {
    if (fI < 0) fI = i;
    if (samples.length < 12) samples.push(`(${i % W},${Math.floor(i / W)}) ${desc}`);
    rowHist.set(Math.floor(i / W), (rowHist.get(Math.floor(i / W)) ?? 0) + 1);
    if (csv && csv!.lines.length < 200000) csv!.lines.push(desc.replace(/^(\S+)\s/, `${i},${i % W},${Math.floor(i / W)},$1 `));
  };
  for (let i = 0; i < N; i++) {
    const va = d.xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; mark(i, `A ${va}>${ja}`); continue; }
    const vt = va ? d.xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!] : 9999) : 0;
    if (vt !== jt) { dT++; mark(i, `T ${vt}>${jt}`); const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); continue; }
    if (d.xw[i] !== st.wall[i]) { dW++; mark(i, `W ${d.xw[i]}>${st.wall[i]}`); continue; }
    if (d.xl[i] !== st.liquid[i]) { dL++; mark(i, `L ${d.xl[i]}>${st.liquid[i]}`); continue; }
    if (d.xhf[i] !== st.half[i]) { dHf++; mark(i, `Hf ${d.xhf[i]}>${st.half[i]}`); continue; }
    if (d.xsl[i] !== st.slope[i]) { dSl++; mark(i, `Sl ${d.xsl[i]}>${st.slope[i]}`); continue; }
    const vl = d.xl[i]! > 0 ? d.xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; mark(i, `Lt ${vl}>${jl}`); continue; }
    const via = d.xia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; mark(i, `Ia ${via}>${jia}`); continue; }
    if (!va) {
      const vg = d.xt[i]!;
      const jg = st.type[i] === 0 ? 0 : (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999);
      if (vg !== jg) dGh++;
    }
  }
  const bad = dA || dT || dW || dL || dHf || dSl || dLt || dIa;
  console.log(`[${tag}] vs #${idx}_${d.nm}: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} (Gh=${dGh}) ${bad ? '✗' : '✓'} first=${fI < 0 ? '-' : `(${fI % W},${Math.floor(fI / W)})`}`);
  console.log(`     pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  for (const s of samples) console.log(`     ${s}`);
  console.log(`     rows-hist(top12): ${[...rowHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([y, n]) => `y=${y}×${n}`).join(' ')}`);
  if (csv) { writeFileSync(`${OUT}/wrong-cells.csv`, `idx,x,y,chan,desc\n${csv.lines.join('\n')}\n`); console.log(`     wrong-cells.csv=${csv.lines.length} 行 → ${OUT}/wrong-cells.csv`); }
}

(RUN_RE ? it : it.skip)(`replay DoSurfaceIsMushrooms+MudCaves window on base vs G2 dump#${CMP_IDX}`, () => {
  const t0 = Date.now();
  const { st, gs } = hydrate();
  console.log(`gs: seed=${gs.seed} flags=${JSON.stringify(gs.seedFlags)} ws=${gs.worldSurface.toFixed(4)} rock=${gs.rockLevel.toFixed(4)} side=${gs.dungeonSide} w=${st.w} h=${st.h}`);
  // 基座自检（应≡dump CMP-1）
  {
    const base = loadDump(CMP_IDX - 1);
    let dA = 0, dT = 0;
    for (let i = 0; i < N; i++) {
      const va = base.xa[i]!, ja = st.flags[i] & 1;
      if (va !== ja) dA++;
      else if (va && base.xt[i] !== (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999)) dT++;
    }
    console.log(`[base selfcheck vs #${CMP_IDX - 1}_${base.nm}] dAct=${dA} dTyp=${dT}${dA || dT ? ' ✗（基座≠G2 上界，反演无效！）' : ' ✓'}`);
  }
  // 值流钩（n|v 协议）
  const ROLLLOG = process.env.SW_I05_ROLLLOG;
  if (ROLLLOG) writeFileSync(ROLLLOG, '');
  let rollN = 0, rollH = 2166136261 >>> 0;
  const g = globalThis as unknown as { __swOnRoll?: (v: number) => void };
  const oOnRoll = g.__swOnRoll;
  g.__swOnRoll = (v: number) => {
    rollN++;
    rollH = ((rollH ^ (v >>> 0)) * 16777619) >>> 0;
    if (ROLLLOG) { try { appendFileSync(ROLLLOG, `${rollN}|${v}\n`); } catch { /* ignore */ } }
  };
  const rng = new RNG(gs.seed);
  try {
    // —— WorldGen.ts:1129-1134 窗口镜像（pass 头重播后逐句）——
    if (gs.seedFlags.notTheBees && !gs.seedFlags.skyblock) runNotTheBees(st, rng, gs);
    doSurfaceIsMushroomsEarly(st, rng, gs);
    if (process.env.SW_I05_STAGE === '1') serializeStore(st, OUT, 'stage_do');
    const dK = TILE_BY_KEY['mud']!;
    const gK = TILE_BY_KEY['v_60_jungle_grass_block']!;
    console.log(`mud tileKey id=${dK.id} sheet=${dK.vanilla?.sheet} ; grass60 id=${gK.id} sheet=${gK.vanilla?.sheet}`);
    runMudCavesPass(st, dK, gK);
  } finally {
    g.__swOnRoll = oOnRoll;
  }
  console.log(`window replay ${Date.now() - t0}ms samples=${rollN} fnvHash(js-loose)=${rollH.toString(16)}(${rollH})`);
  cmpAgainst('after-MudCaves', CMP_IDX, st, true);
}, 600_000);
