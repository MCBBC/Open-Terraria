// IIII108b2：lava 循环逐组偏置谱（SW_I136_SWEEP）——每组入口注入 k 枚 raw 样本，
// 九通道对拍 truth #097，定位「首个相位漂移点 j*」（全数组二分的离线仪器版）。
// 基座 = _iii135replay 的 hydrate 口径；快照深拷贝按轮重建，防跨轮污染。
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';

const BASE = process.env.SW_I135_BASE ?? '/tmp/iii133-out/js';
const G2 = process.env.SW_I135_G2 ?? `${process.env.HOME}/GoldenChains/golden-ftw-wir`;
const W = Number(process.env.SW_I135_W ?? 4200);
const H = Number(process.env.SW_I135_H ?? 1200);
const N = W * H;
const SEED = Number(process.env.SW_I135_SEED ?? '1671560105');
// SW_I136_SET="j@k j2@k2 ..."：lavaJ 第 j 组入口注入 k；特殊键 pre=-1 表 mbLavaS 前。
// SW_I136_SET="j@k j2@k2 ..."：lavaJ 第 j 组入口注入 k；特殊键 pre=-1 表 mbLavaS 前。
// SW_I136_ATT="lo..hi,K"：tAtt（attempt 序号）粒度扫描。
const SETS: Pt[] = [];
if (process.env.SW_I136_SET) {
  for (const s of process.env.SW_I136_SET.split(',')) {
    const [a, b] = s.split('@').map(Number);
    if (s.startsWith('a')) SETS.push({ att: Number(s.slice(1).split('@')[0]), k: b });
    else SETS.push({ j: a, k: b });
  }
}
const ATT = process.env.SW_I136_ATT;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

// ---- 预载基座（一次），逐轮快照重建 ----
const hdr = JSON.parse(readFileSync(`${BASE}/base_hdr.json`, 'utf8'));
const SRC: Record<string, Uint8Array | Uint16Array> = {};
const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType',
  'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;
for (const c of CHANS) {
  const buf = readFileSync(`${BASE}/base_${c}.bin`);
  const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
  const len = (hdr[`${c}_len`] as number);
  SRC[c] = bytesPer === 2
    ? new Uint16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + len * 2))
    : new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + len));
}
const GS_BASE = JSON.parse(readFileSync(`${BASE}/base_gs.json`, 'utf8')) as unknown as GenState;
const CHESTS_RAW = readFileSync(`${BASE}/base_chests.json`, 'utf8');
const GENSOLID = existsJson(`${BASE}/base_gensolid.json`)
  ? JSON.parse(readFileSync(`${BASE}/base_gensolid.json`, 'utf8')) as Array<[number, boolean]> : null;

function existsJson(p: string): boolean {
  try { readFileSync(p); return true; } catch { return false; }
}

function makeSt(): TileStore {
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) rec[c]!.set((SRC[c] as never));
  return st;
}

type Pt = { j?: number; k?: number; att?: number; tag?: string; trk?: number };
const ANCHOR_TAGS = ['deadCands', 'deadCount', 'iceCount', 'swordAttempts', 'campCount',
  'MINEPRE', 'trapCount', 'treeCount', 'longTrackCount', 'stdTrackCount', 'mbLavaS', 'passStart'];
function mkInjector(points: Pt[]): {
  bind: (rng: { next(): void }) => void;
  onSeg: (n: string) => void;
  curJ: () => number;
  curAtt: () => number;
} {
  const map = new Map<number, number>();
  const attMap = new Map<number, number>();
  const tagMap = new Map<string, number>();
  for (const p of points) {
    if (p.att !== undefined) attMap.set(p.att, p.k ?? 0);
    else if (p.tag !== undefined) tagMap.set(p.tag, p.k ?? 0);
    else if (p.j !== undefined) map.set(p.j, p.k ?? 0);
  }
  let jCount = -1;
  let attCount = -1;
  let trkCount = 0;
  const trkMap = new Map<number, number>();
  for (const p of points) {
    if (p.trk !== undefined) trkMap.set(p.trk, p.k ?? 0);
  }
  let rngRef: { next(): void } | null = null;
  const injectHere = (k: number, tag: string): void => {
    if (!rngRef) return;
    for (let z = 0; z < k; z++) rngRef.next();
    console.log(`   [bias] inject +${k} @${tag}`);
  };
  return {
    bind: (rng: { next(): void }): void => { rngRef = rng; },
    onSeg: (name: string): void => {
      if (name.startsWith('lavaJ')) {
        jCount++;
        const k = map.get(jCount);
        if (k !== undefined && k > 0) {
          map.delete(jCount);   // 一次性
          injectHere(k, `lavaJ#${jCount}`);
        }
      } else if (name.startsWith('tAtt')) {
        attCount++;             // 全局 attempt 流序号（跨组累计）
        const ka = attMap.get(attCount);
        if (ka !== undefined && ka > 0) {
          attMap.delete(attCount);   // 一次性
          injectHere(ka, `att#${attCount}`);
        }
      } else if (ANCHOR_TAGS.includes(name) && tagMap.has(name)) {
        const kt = tagMap.get(name)!;
        if (kt > 0) {
          tagMap.delete(name);
          injectHere(kt, name);
        }
      } else if (name.startsWith('LTRK') || name.startsWith('STRK')) {
        // track attempt 序（全局跨长短轨，独立于 lava 计数）
        trkCount++;
        const kt2 = trkMap.get(trkCount);
        if (kt2 !== undefined && kt2 > 0) {
          trkMap.delete(trkCount);
          injectHere(kt2, `trk#${trkCount}`);
        }
      } else if ((name === 'passStart') && tagMap.has(name)) {
        const kt = tagMap.get(name)!;
        if (kt > 0) {
          tagMap.delete(name);
          injectHere(kt, name);
        }
      }
    },
    curJ: (): number => jCount,
    curAtt: (): number => attCount,
    curTrk: (): number => trkCount,
  };
}

it('III136 lava-loop per-group bias spectrum', () => {
  // truth 平面预载（一次）
  const tPre = `${G2}/097_Micro_Biomes`;
  const xt = new Uint16Array(readFileSync(`${tPre}.typ`).buffer.slice(0, N * 2), 0, N);
  const xa = readFileSync(`${tPre}.act`), xl = readFileSync(`${tPre}.liq`);
  const xhf = readFileSync(`${tPre}.half`), xsl = readFileSync(`${tPre}.slope`);
  const xlt = readFileSync(`${tPre}.lty`), xia = readFileSync(`${tPre}.inact`);
  const xw = new Uint16Array(readFileSync(`${tPre}.wal`).buffer.slice(0, N * 2), 0, N);
  const xwir = readFileSync(`${tPre}.wir`);

  const groups: Array<Pt[]> = [];
  // 模式0：段锚谱（SW_I136_ANCHORS=1）——十个 MB 段锚各注入 k 一轮
  if (process.env.SW_I136_ANCHORS) {
    const K0 = Number(process.env.SW_I136_K ?? '1');
    for (const t of ANCHOR_TAGS) groups.push([{ tag: t, k: K0 }]);
  } else if (process.env.SW_I136_TRKS) {
    const spec = process.env.SW_I136_TRKS;
    const ks = (process.env.SW_I136_KS ?? '1').split(',').map(Number);
    const [loT, hiT] = spec.split('..').map(Number);
    for (let n = loT; n <= hiT; n++) for (const kk of ks) groups.push([{ trk: n, k: kk }]);
  } else if (SETS.length) {
    // 模式1：显式集合（SW_I136_SET="3@1,7@2" 或 "a120@1"）
    groups.push(SETS);
  } else if (ATT !== undefined) {
    const [rng_, K2] = ATT.split(',').length > 1
      ? [ATT.split(',')[0], Number(ATT.split(',')[1])] : [ATT, 1];
    const lo = Number(rng_.split('..')[0]);
    const hi = Number((rng_.split('..')[1] ?? String(lo)));
    for (let n = lo; n <= hi; n++) groups.push([{ att: n, k: K2 }]);
  } else {
    // 模式2：全谱扫描（SW_I136_FULL="lo..hi"，K=SW_I136_K）
    const FULL = process.env.SW_I136_FULL;
    if (FULL !== undefined) {
      const lo = Number(FULL.split('..')[0]);
      const hi = Number(FULL.split('..')[1] ?? 60);
      const K = Number(process.env.SW_I136_K ?? '1');
      groups.push([{ j: -99, k: K }]);      // -99 := passStart（对照，应劣化）
      groups.push([{ j: -1, k: K }]);       // -1 := mbLavaS 锚（批章已知 Wir=0 位点）
      for (let j = lo; j <= hi; j++) groups.push([{ j, k: K }]);
    }
  }
  for (const pts of groups) {
    const st = makeSt();
    if (GENSOLID) restoreGenSolid(new Map(GENSOLID));
    const gs = JSON.parse(JSON.stringify(GS_BASE)) as unknown as GenState;
    const chests = JSON.parse(CHESTS_RAW);
    const rng = new RNG(SEED);
    let trueRolls = 0;
    // 注入语义与 _iii135replay 一致：seg 探针命中点原地补耗 k 枚
    const inj = mkInjector(pts);
    inj.bind(rng);
    const g = globalThis as { __swOnRoll?: unknown; __swSeg?: (n: string, d?: unknown) => void };
    const oRoll = g.__swOnRoll;
    g.__swOnRoll = () => { trueRolls++; };
    g.__swSeg = (name: string) => {
      inj.onSeg(name);
    };
    const r0 = Date.now();
    runMicroBiomesPass(st, rng, gs, chests as never);
    g.__swSeg = undefined;
    g.__swOnRoll = oRoll;
    let dA = 0, dT = 0, dW2 = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, dWir = 0;
    for (let i = 0; i < N; i++) {
      const va = xa[i]!, ja = st.flags[i]! & 1;
      if (va !== ja) { dA++; continue; }
      const vt = va ? xt[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (vt !== jt) { dT++; continue; }
      if (xw[i] !== st.wall[i]) { dW2++; continue; }
      if (xl[i] !== st.liquid[i]) { dL++; continue; }
      if (xhf[i] !== st.half[i]) { dHf++; continue; }
      if (xsl[i] !== st.slope[i]) { dSl++; continue; }
      const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
      const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
      if (vl !== jl) { dLt++; continue; }
      const via = xia[i]! ? 1 : 0;
      const jia = (st.wire[i]! >>> 5) & 1;
      if (via !== jia) { dIa++; continue; }
      const vw = (xwir[i] ?? 0) & ~32;
      const jw = (st.wire[i] ?? 0) & ~32;
      if (vw !== jw) { dWir++; continue; }
    }
    const tot = dA + dT + dW2 + dL + dHf + dSl + dLt + dIa + dWir;
    console.log(`SPEC jset=${JSON.stringify(pts)} rolls=${trueRolls} jEnd=${inj.curJ()} attEnd=${inj.curAtt()} trkEnd=${inj.curTrk()}`
      + ` A=${dA} T=${dT} W=${dW2} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa}`
      + ` Wir=${dWir} TOTAL=${tot} [${Date.now() - r0}ms]`);
  }
}, 900_000);
