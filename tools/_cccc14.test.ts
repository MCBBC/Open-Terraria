// CCCC 批·诊断⑮:pad 0..40 扫描——iceTry origin 对 golden 薄冰斑 origin(1610,~592)/
// (1127,~695) 命中检验 + deadPlace 成败流。一次性探针。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';

const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const b8 = (idx: number, e: string) => new Uint8Array(readFileSync(gPath(idx, e)).buffer.slice(0));
const b16 = (idx: number, e: string) => new Uint16Array(readFileSync(gPath(idx, e)).buffer.slice(0));

const itIs = process.env.SW_CCCC === '14';

(itIs ? it : it.skip)('cccc pad ice origin sweep', async () => {
  const gt = b16(100, 'typ'), ga = b8(100, 'act'), gw = b16(100, 'wal'), gl = b8(100, 'liq');
  const ghf = b8(100, 'half'), gsl = b8(100, 'slope'), glt = b8(100, 'lty'), gia = b8(100, 'inact');
  const REV = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
  }
  const gsB = JSON.parse(readFileSync(`${BDIR}/s52/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/s52/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${BDIR}/s52/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N), wire0 = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire0[i] = fw[q + 3]! & 0x1f; }
  for (let y = 517; y <= 541; y++) for (const x of [1122, 1123, 1124]) wire0[y * W + x] = 0;
  const iw = new Uint32Array(readFileSync(`${BDIR}/s52/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  const chests = JSON.parse(readFileSync(`${BDIR}/s52/chests.json`, 'utf8')) as unknown[];
  const st0 = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = ga[i]!;
    st0.flags[i] = act;
    if (act || gt[i]) {
      const sh = gt[i]!;
      let id = ids35.has(i) ? ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) id = REV.get(sh) ?? -1;
      st0.type[i] = id < 0 ? 0 : id;
    }
    st0.wall[i] = gw[i]!; st0.liquid[i] = gl[i]!;
    st0.liquidType[i] = gl[i] ? glt[i]! + 1 : 0;
    st0.half[i] = ghf[i]!; st0.slope[i] = gsl[i]!;
    st0.wire[i] = (gia[i]! ? 0x20 : 0) | wire0[i];
    st0.frameX[i] = fx[i]; st0.frameY[i] = fy[i];
  }
  restoreGenSolid(gensolid);
  for (let pad = 0; pad <= 40; pad++) {
    const st = new TileStore(W, H);
    st.type.set(st0.type); st.flags.set(st0.flags); st.wall.set(st0.wall);
    st.liquid.set(st0.liquid); st.liquidType.set(st0.liquidType);
    st.half.set(st0.half); st.slope.set(st0.slope); st.wire.set(st0.wire);
    st.frameX.set(st0.frameX); st.frameY.set(st0.frameY);
    const gs = structuredClone(gsB) as GenState;
    __setGenStateForProbe(gs);
    const rng = new RNG(SEED);
    for (let q = 0; q < pad; q++) rng.next();
    const events: Array<[string, unknown]> = [];
    const G = globalThis as { __swSeg?: (name: string, detail?: unknown) => void };
    G.__swSeg = (name, detail) => events.push([name, detail]);
    runMicroBiomesPass(st, rng, gs, chests as never);
    delete G.__swSeg;
    __setGenStateForProbe(null);
    const iceTries = events.filter(e => e[0] === 'iceTry').map(e => e[1] as number[]);
    const deadOk = events.filter(e => e[0] === 'deadPlace').map(e => (e[1] as number[]).join(',')).join(' ');
    const nearA = iceTries.find(([x, y]) => Math.abs(x - 1610) <= 8 && y >= 575 && y <= 605);
    const nearB = iceTries.find(([x, y]) => Math.abs(x - 1127) <= 8 && y >= 683 && y <= 712);
    console.log(`pad=${pad} iceTries=${iceTries.length} nearA=${nearA ? nearA.join(',') : '-'} nearB=${nearB ? nearB.join(',') : '-'} dead=[${deadOk}]`);
  }
}, 560_000);
