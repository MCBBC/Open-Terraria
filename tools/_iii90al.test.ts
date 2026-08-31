// IIII90 批：REMIX 祭坛域（mile8 #44 Altars/#45 Wet_Jungle T26>0×282 @561,106）
// 单 pass 反演重放（克隆 _iii89dg 模式）。
// ① SW_I90CAP=1：全量生成，在 ▶DemonAndCrimsonAltars reseed 时点深拷贝 store 全通道+gs
//    → /tmp/iii94-out/cap-remix/base_* （后续迭代免重跑 0..42）。
// ② SW_I90REPLAY=1：hydrate 基座 → 基座自检(vs #43) → runAltarsPass 对拍 G2 dump#CMP
//    八通道；SW_I90_STEP2=1 追加 runWetJunglePass 后对拍 dump#(CMP+1)——验证祭坛族
//    残差纯落 Altars pass、Wet_Jungle 零贡献。SW_I90_MAP=1 bbox ASCII；
//    SW_I90_ROLLLOG=PATH 样本值流落盘（与 rig JJHook SW_ROLLLOG 同协议 `n|v`）。
// 用法：cd game && SW_I90CAP=1 SW_I90_TAG=remix npx vitest run tools/_iii90al.test.ts
//       cd game && SW_I90REPLAY=1 npx vitest run tools/_iii90al.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runAltarsPass } from '../src/world/gen/vanilla/CorruptionPass';
import { runWetJunglePass } from '../src/world/gen/vanilla/StructuresPass';
import { TILE_BY_KEY } from '../src/data/tiles';

const ALTARJS = TILE_BY_KEY['v_26_altars']!;   // JS 坛 id（判 place3x2 接受/拒绝）

const RUN_CAP = process.env.SW_I90CAP === '1';
const RUN_RE = process.env.SW_I90REPLAY === '1';
const TAG = process.env.SW_I90_TAG ?? 'remix';
const OUT = process.env.SW_I90_OUT ?? `/tmp/iii94-out/cap-${TAG}`;
const G2 = process.env.SW_I90_G2 ?? '/tmp/iii89-out/rigb/dumps';   // G2 权威
const CMP_IDX = Number(process.env.SW_I90_CMP ?? 44);
const STEP2 = process.env.SW_I90_STEP2 !== '0';
const SEED = process.env.SW_I90_SEED ?? '1138154190';   // rig world remix-alt 种子（run-rig-remix86.sh）
const EVIL = Number(process.env.SW_I90_EVIL ?? 0);     // rig world remix-alt：crimson=false（base_gs.json 实测）⇒ corruption 固定
const W = 4200, H = 1200, N = W * H;

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

(RUN_CAP ? it : it.skip)('capture base at DemonAndCrimsonAltars pass head', async () => {
  if (!SEED || !G2) throw new Error('SW_I90_SEED/SW_I90_G2 required');
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
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii90al')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === 'DemonAndCrimsonAltars') {
            mkdirSync(OUT, { recursive: true });
            serializeStore(liveStore!, OUT);
            const gs = lastGenState();
            if (!gs) throw new Error('gs missing');
            writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(gs)));
            console.log(`captured @${lab} tag=${TAG} out=${OUT}`);
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
      seedFlags: { remix: true },
      onWorldPartial: (w2) => { liveStore = w2.store as never as TileStore; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!done) throw new Error('capture failed: DemonAndCrimsonAltars label never hit');
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

function loadDump(idx: number): { nm: string; xt: Uint16Array; xa: Uint8Array; xw: Uint16Array; xl: Uint8Array; xhf: Uint8Array; xsl: Uint8Array; xlt: Uint8Array; xia: Uint8Array } {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
  if (!existsSync(`${pre}.typ`)) throw new Error(`dump missing at ${pre}`);
  return {
    nm: DUMPNAME.get(idx) ?? '?',
    xt: le16(`${pre}.typ`), xa: readFileSync(`${pre}.act`), xw: le16(`${pre}.wal`),
    xl: readFileSync(`${pre}.liq`), xhf: readFileSync(`${pre}.half`), xsl: readFileSync(`${pre}.slope`),
    xlt: readFileSync(`${pre}.lty`), xia: readFileSync(`${pre}.inact`),
  };
}

/** 八通道对拍 → 打印摘要行 + pairs/samples */
function cmpAgainst(tag: string, idx: number, st: TileStore): void {
  const d = loadDump(idx);
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, dGh = 0;
  const pair = new Map<string, number>();
  let fI = -1;
  const bbox = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, -1, -1];
  const samples: string[] = [];
  const mark = (i: number, desc?: string): void => {
    if (fI < 0) fI = i;
    const x = i % W, y = (i / W) | 0;
    bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y);
    bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y);
    if (desc && samples.length < 12) samples.push(`(${x},${y}) ${desc}`);
  };
  for (let i = 0; i < N; i++) {
    const va = d.xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; mark(i, `A ${va}>${ja}`); continue; }
    const vt = va ? d.xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) {
      dT++; mark(i, `T ${vt}>${jt}`);
      const k = `T${vt}>${jt}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
      continue;
    }
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
      const jg = st.type[i]! === 0 ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999);
      if (vg !== jg) dGh++;
    }
  }
  const bad = dA || dT || dW || dL || dHf || dSl || dLt || dIa;
  console.log(`[${tag}] vs #${idx}_${d.nm}: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} (Gh=${dGh}) ${bad ? '✗' : '✓'} first=${fI < 0 ? '-' : `(${fI % W},${Math.floor(fI / W)})`} bbox=[${bbox[0]},${bbox[1]}]-[${bbox[2]},${bbox[3]}]`);
  console.log(`     pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  for (const s of samples) console.log(`     ${s}`);
  // ASCII（bbox≤160 宽才打）
  if (process.env.SW_I90_MAP === '1' && bad && fI >= 0 && bbox[2] - bbox[0] <= 200 && bbox[3] - bbox[1] <= 120) {
    for (let y = bbox[1] - 2; y <= bbox[3] + 2; y++) {
      let ln = '';
      for (let x = bbox[0] - 2; x <= bbox[2] + 2; x++) {
        const i = y * W + x;
        const va = d.xa[i]!, ja = st.flags[i]! & 1;
        const vt = va ? d.xt[i]! : 0, jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!] : 9999) : 0;
        ln += vt === jt && va === ja ? '.' : (vt === 26 ? 'x' : (jt === 26 ? 'j' : '@'));
      }
      console.log(`  ${String(y).padStart(4)} ${ln}`);
    }
  }
}

let DUMPNAME = new Map<number, string>();
{
  try {
    for (const f of readdirSync(G2)) {
      const m = f.match(/^(\d{3})_(.+)\.typ$/);
      if (m) DUMPNAME.set(Number(m[1]), m[2]);
    }
  } catch { /* G2 absent in cap mode */ }
}

(RUN_RE ? it : it.skip)(`replay runAltarsPass(+WetJungle) on base vs G2 dump#${CMP_IDX}`, () => {
  const t0 = Date.now();
  const { st, gs } = hydrate();
  console.log(`gs: seed=${gs.seed} flags=${JSON.stringify(gs.seedFlags)} ws=${gs.worldSurface} rock=${gs.rockLevel} shimmer=(${gs.shimmerX},${gs.shimmerY}) beach=${gs.beachDistance} crimson=${gs.crimson}/${gs.crimsonLeft}`);
  // 基座自检（基座应≡dump CMP-1 = 上一原版 pass 末态）
  {
    const base = loadDump(CMP_IDX - 1);
    let dA = 0, dT = 0;
    for (let i = 0; i < N; i++) {
      const va = base.xa[i]!, ja = st.flags[i]! & 1;
      if (va !== ja) dA++;
      else if (va && base.xt[i] !== (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!] : 9999)) dT++;
    }
    console.log(`[base selfcheck vs #${CMP_IDX - 1}_${base.nm}] dAct=${dA} dTyp=${dT}${dA || dT ? ' ✗（基座≠G2 上界，反演无效！）' : ''}`);
  }
  // 样本值流钩（SW_I90_ROLLLOG=`n|v` 行协议，与 rig JJHook 同协议）
  const ROLLLOG = process.env.SW_I90_ROLLLOG;
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
  // 尝试级操作日志（SW_I90_ATTEMPTS=path）：每次 place3x2 调用与断点都记账，
  // 与 x86 祭坛族做「同候选流」比对（尝试不耗骰差 ⇒ 后续槽位照常对齐）。
  const ATTLOG = process.env.SW_I90_ATTEMPTS;
  if (process.env.SW_ALTARGATE_OFF) {
    (globalThis as unknown as { __swAltarGateOff?: string }).__swAltarGateOff = process.env.SW_ALTARGATE_OFF;
  }
  const PROBE90: Array<[number, number]> | undefined = process.env.SW_ALTARPROBE ? [] : undefined;
  (globalThis as unknown as { __swAltarProbe?: Array<[number, number]> }).__swAltarProbe = PROBE90;
  const p32Hook = (globalThis as { __swP32?: (x: number, y: number, t: number) => void }).__swP32;
  try {
    if (ATTLOG) {
      (globalThis as unknown as { __swAltarAtt?: Array<[number, number, number]> }).__swAltarAtt = [];
      (globalThis as unknown as { __swP32?: (x: number, y: number, t: number) => void }).__swP32 =
        (x: number, y: number, _t: number) => {
          ((globalThis as unknown as { __swAltarAtt?: Array<[number, number, number]> }).__swAltarAtt ?? [])
            .push([rollN, x, y]);
        };
    }
    runAltarsPass(st, rng, gs);
  } finally {
    g.__swOnRoll = oOnRoll;
    if (PROBE90 && process.env.SW_ALTARPROBE_OUT) writeFileSync(process.env.SW_ALTARPROBE_OUT, PROBE90.map(([x, y]) => `${x},${y}`).join('\n'));
    (globalThis as unknown as { __swAltarProbe?: Array<[number, number]> }).__swAltarProbe = undefined;
    if (ATTLOG) {
      const atts = (globalThis as unknown as { __swAltarAtt?: Array<[number, number, number]> }).__swAltarAtt ?? [];
      const lines = atts.map(([rn, x, y]) => `${rn}|${x}|${y}|${st.type[st.idx(x, y)] === ALTARJS ? 'ok' : 'rej'}`);
      writeFileSync(ATTLOG, `${lines.join('\n')}\n`);
      console.log(`attempt-log ${ATTLOG}: ${lines.length} calls, accepted=${lines.filter((l) => l.endsWith('ok')).length}`);
    }
  }
  console.log(`runAltarsPass ${Date.now() - t0}ms samples=${rollN} fnvHash=${rollH.toString(16)}(${rollH})`);
  cmpAgainst('after-Altars', CMP_IDX, st);
  if (STEP2) {
    const t1 = Date.now();
    runWetJunglePass(st, rng, gs);
    console.log(`runWetJunglePass ${Date.now() - t1}ms`);
    cmpAgainst('after-WetJungle', CMP_IDX + 1, st);
  }
}, 600_000);
