// CCCC 批·诊断⑩:剔除 29 幻影 wire 格后重放 #101——候选/选箱/成败 + ThinIce origin
// 对齐检验 + (4055,500)/(1546,552) 周边 golden 陷阱证据。一次性探针。
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

const itIs = process.env.SW_CCCC === '9';

(itIs ? it : it.skip)('cccc strip replay', async () => {
  // golden 陷阱证据:两箱 ±25 窗在 57→58 / 75→76 的增量
  for (const [cx, cy] of [[4055, 500], [1546, 552]] as Array<[number, number]>) {
    for (const [a, b] of [[57, 58], [75, 76]] as Array<[number, number]>) {
      const ta = b16(a, 'typ'), aa = b8(a, 'act'), tb = b16(b, 'typ'), ab = b8(b, 'act');
      const chg: string[] = [];
      for (let y = cy - 25; y <= cy + 25; y++) for (let x = cx - 25; x <= cx + 25; x++) {
        const i = y * W + x;
        const va = aa[i]! ? ta[i]! : 0, vb = ab[i]! ? tb[i]! : 0;
        if (va !== vb) chg.push(`(${x},${y})${va}→${vb}`);
      }
      console.log(`golden ${a}→${b} near (${cx},${cy}): ${chg.length} 处 ${chg.slice(0, 12).join(' ')}`);
    }
  }

  // 基座重建
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
  const fx = new Uint16Array(N), fy = new Uint16Array(N), wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire[i] = fw[q + 3]! & 0x1f; }
  // ★剔除幻影 wire 带 x∈[1122,1124],y∈[517,541](s30→s31 写入的 JS#76 债)
  let stripped = 0;
  for (let y = 517; y <= 541; y++) for (const x of [1122, 1123, 1124]) {
    const i = y * W + x;
    if (wire[i]! & 15) { wire[i] = 0; stripped++; }
  }
  console.log(`\nstripped ${stripped} phantom wire cells`);
  const iw = new Uint32Array(readFileSync(`${BDIR}/s52/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  const chests = JSON.parse(readFileSync(`${BDIR}/s52/chests.json`, 'utf8')) as unknown[];
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = ga[i]!;
    st.flags[i] = act;
    if (act || gt[i]) {
      const sh = gt[i]!;
      let id = ids35.has(i) ? ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) id = REV.get(sh) ?? -1;
      st.type[i] = id < 0 ? 0 : id;
    }
    st.wall[i] = gw[i]!; st.liquid[i] = gl[i]!;
    st.liquidType[i] = gl[i] ? glt[i]! + 1 : 0;
    st.half[i] = ghf[i]!; st.slope[i] = gsl[i]!;
    st.wire[i] = (gia[i]! ? 0x20 : 0) | wire[i];
    st.frameX[i] = fx[i]; st.frameY[i] = fy[i];
  }
  restoreGenSolid(gensolid);
  const gs = structuredClone(gsB) as GenState;
  __setGenStateForProbe(gs);
  const rng = new RNG(SEED);
  let draws = 0;
  const proto = Object.getPrototypeOf(rng) as Record<string, unknown>;
  for (const name of ['next', 'int', 'range', 'nextInt']) {
    const orig = proto[name] as (...a: unknown[]) => unknown;
    if (typeof orig !== 'function') continue;
    (rng as unknown as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
      draws++;
      return orig.apply(this === rng ? rng : this, args);
    };
  }
  const events: Array<{ d: number; name: string; detail: unknown }> = [];
  const G = globalThis as { __swSeg?: (name: string, detail?: unknown) => void };
  G.__swSeg = (name, detail) => events.push({ d: draws, name, detail });
  runMicroBiomesPass(st, rng, gs, chests as never);
  delete G.__swSeg;
  __setGenStateForProbe(null);
  let iceTries = 0;
  for (const e of events) {
    if (e.name === 'deadCands') console.log(`[${e.d}] deadCands(${(e.detail as number[][]).length}): ${JSON.stringify(e.detail)}`);
    if (e.name === 'deadCount') console.log(`[${e.d}] deadCount=${e.detail}`);
    if (e.name === 'iceCount') console.log(`[${e.d}] iceCount=${e.detail}`);
    if (e.name === 'deadPlace') console.log(`[${e.d}] deadPlace ${JSON.stringify(e.detail)}`);
    if (e.name === 'iceTry') { iceTries++; if (iceTries <= 12) console.log(`[${e.d}] iceTry ${JSON.stringify(e.detail)}`); }
    if (e.name === 'swordAttempts') console.log(`[${e.d}] swordAttempts=${e.detail}`);
    if (e.name === 'campCount') console.log(`[${e.d}] campCount=${e.detail}`);
  }
  console.log(`iceTry total=${iceTries}, draws total=${draws}`);
  // 剔除后 467 落点(与 golden 11 箱对拍)
  const t101 = b16(101, 'typ');
  const js467 = new Set<string>();
  for (let i = 0; i < N; i++) {
    if ((st.flags[i]! & 1) && SHEET[st.type[i]!] === 467) js467.add(`${i % W},${(i / W) | 0}`);
  }
  const anchors: Array<[number, number]> = [];
  for (const k of js467) {
    const [x, y] = k.split(',').map(Number);
    if (!js467.has(`${x - 1},${y}`) && !js467.has(`${x},${y - 1}`)) anchors.push([x, y]);
  }
  console.log(`JS trapified anchors after strip: ${JSON.stringify(anchors)}`);
}, 300_000);
