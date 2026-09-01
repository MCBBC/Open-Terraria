// IIII108b2:残差带区域解剖(SW_I136BAND) —— hydrate+MB 重放(可选偏置),
// 打印指定矩形内 truth#097(x86) 与 js 重放态 的九通道网格差。
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';

const BASE = process.env.SW_I135_BASE ?? '/tmp/iii133-out/js';
const G2 = `${process.env.HOME}/GoldenChains/golden-ftw-wir`;
const W = Number(process.env.SW_I135_W ?? 4200);
const H = Number(process.env.SW_I135_H ?? 1200);
const N = W * H;
const SEED = Number(process.env.SW_I135_SEED ?? '1671560105');
const BIAS_K = Number(process.env.SW_I136_BAND_BIAS ?? '1');
const X0 = Number(process.env.SW_I136_X0 ?? '1030'), X1 = Number(process.env.SW_I136_X1 ?? '1085');
const Y0 = Number(process.env.SW_I136_Y0 ?? '962'), Y1 = Number(process.env.SW_I136_Y1 ?? '985');

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
function loadTruth(pre: string) {
  return {
    typ: new Uint16Array(readFileSync(`${pre}.typ`).buffer.slice(0, N * 2)),
    act: readFileSync(`${pre}.act`), sl: readFileSync(`${pre}.slope`),
    hf: readFileSync(`${pre}.half`), wi: readFileSync(`${pre}.wir`),
  };
}

it('III136 band anatomy', () => {
  const hdr = JSON.parse(readFileSync(`${BASE}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType',
    'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const buf = readFileSync(`${BASE}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    const len = hdr[`${c}_len`] as number;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer.slice(buf.byteOffset, buf.byteOffset + len * bytesPer)));
  }
  try {
    restoreGenSolid(new Map(JSON.parse(readFileSync(`${BASE}/base_gensolid.json`, 'utf8')) as Array<[number, boolean]>));
  } catch { /* none */ }
  const gs = JSON.parse(readFileSync(`${BASE}/base_gs.json`, 'utf8')) as unknown as GenState;
  const chests = JSON.parse(readFileSync(`${BASE}/base_chests.json`, 'utf8'));
  // 快照 hydrate 态（=j049）
  const snapFl = Uint8Array.from(rec.flags! as Uint8Array);
  const snapSl = Uint8Array.from(rec.slope! as Uint8Array);
  const snapHf = Uint8Array.from(rec.half! as Uint8Array);
  // tile sheet 名称反查
  const nameOfSheet = new Map<number, string>();
  for (const d of TILE_DEFS) {
    const s = d?.vanilla?.sheet;
    if (typeof s === 'number' && !nameOfSheet.has(s)) nameOfSheet.set(s, d.key ?? String(s));
  }
  const lavaCols: Array<[number, number]> = [];
  let jIdx = -1;
  (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg =
    (name: string, d?: unknown): void => {
      if (name.startsWith('lavaJ')) jIdx++;
      if (name === 'lavaOk' && Array.isArray(d)) lavaCols.push([d[0]!, d[1]!]);
      if (name === 'mbLavaS' && BIAS_K > 0) { for (let z = 0; z < BIAS_K; z++) rng.next(); }
    };
  const rng = new RNG(SEED);
  runMicroBiomesPass(st, rng, gs, chests as never);

  const T1 = loadTruth(`${G2}/097_Micro_Biomes`);
  console.log(`x86 lava columns=${lavaCols.length} first=(${lavaCols[0]?.[0]},${lavaCols[0]?.[1]})`);
  let nDiff = 0; const famCensus = new Map<string, number>();
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      const i = y * W + x;
      const va = T1.act[i]! & 1;
      const ja = st.flags[i]! & 1;
      const vt = va ? T1.typ[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      const vw = (T1.wi[i] ?? 0) & 31;
      const jw = (st.wire[i] ?? 0) & 31;
      const vsl = T1.sl[i]!, jsl = st.slope[i]!;
      const vhf = T1.hf[i]!, jhf = st.half[i]!;
      if (va === ja && vt === jt && vw === jw && vsl === jsl && vhf === jhf) continue;
      nDiff++;
      let fam = '';
      if (vw !== jw) fam += 'w';
      if (va !== ja) fam += 'a';
      if (vt !== jt) fam += 't';
      if (vsl !== jsl) fam += 's';
      if (vhf !== jhf) fam += 'h';
      const bfl = snapFl[i], bsl = snapSl[i], bhf = snapHf[i];
      console.log(`DIFF (${x},${y}) x86 a${va}t${String(vt).padStart(3)}[${nameOfSheet.get(vt) ?? '?'}]w${vw.toString(16)}s${vsl}h${vhf}`
        + ` | js a${ja}t${String(jt).padStart(3)}[${nameOfSheet.get(jt) ?? '?'}]w${jw.toString(16)}s${jsl}h${jhf}`
        + ` | jBase f${bfl}s${bsl}h${bhf}`);
      famCensus.set(fam, (famCensus.get(fam) ?? 0) + 1);
    }
  }
  console.log(`band diffs=${nDiff} fam=${JSON.stringify([...famCensus.entries()])}`);
}, 900_000);
