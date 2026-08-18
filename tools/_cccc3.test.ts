// CCCC 批·诊断③:段级结构轨迹(JS segProbe 流)+ golden 侧结构反推(162 斑/营地墙/
// 383 树/467 死箱/314 轨),逐段比对找首个分歧。一次性探针。
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

const itIs = process.env.SW_CCCC === '3';

/** 连通域聚类(halo:把附近 ±pad 的同类格并入同簇) */
function cluster(mask: Uint8Array, pad: number): Array<{ n: number; x0: number; x1: number; y0: number; y1: number }> {
  const seen = new Uint8Array(N);
  const out: Array<{ n: number; x0: number; x1: number; y0: number; y1: number }> = [];
  for (let i = 0; i < N; i++) {
    if (!mask[i] || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    let n = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
    while (stack.length) {
      const p = stack.pop()!;
      n++;
      const x = p % W, y = (p / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -pad; dy <= pad; dy++) {
        for (let dx = -pad; dx <= pad; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const ni = ny * W + nx;
          if (!seen[ni] && mask[ni]) { seen[ni] = 1; stack.push(ni); }
        }
      }
    }
    out.push({ n, x0, x1, y0, y1 });
  }
  out.sort((a, b) => b.n - a.n);
  return out;
}

(itIs ? it : it.skip)('cccc segtrace', async () => {
  // ---- golden 侧:100→101 增量里抽各段结构 ----
  const gt0 = b16(100, 'typ'), ga0 = b8(100, 'act'), gw0 = b16(100, 'wal');
  const gt1 = b16(101, 'typ'), ga1 = b8(101, 'act'), gw1 = b16(101, 'wal');
  // 薄冰斑:golden101 新增 162 连通域(halo 12 —— 斑间距>12 为不同斑)
  const ice = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (gt1[i] === 162 && gt0[i] !== 162) ice[i] = 1;
  console.log('== golden thin-ice patches (162 new, halo 12):');
  for (const c of cluster(ice, 12).slice(0, 10)) console.log(`   n=${c.n} bbox=[${c.x0},${c.y0}]-[${c.x1},${c.y1}] ctr≈(${(c.x0 + c.x1) >> 1},${(c.y0 + c.y1) >> 1})`);
  // 死箱:golden101 新增 467
  const dmc = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (gt1[i] === 467 && gt0[i] !== 467) dmc[i] = 1;
  console.log('== golden dead-mans chests (467 new, halo 4):');
  for (const c of cluster(dmc, 4).slice(0, 15)) console.log(`   n=${c.n} bbox=[${c.x0},${c.y0}]-[${c.x1},${c.y1}] ctr≈(${c.x0},${c.y0})`);
  // 桃花心木:golden101 新增 383(halo 20)
  const mah = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (gt1[i] === 383) mah[i] = 1;
  console.log('== golden mahogany (383 total, halo 20):');
  for (const c of cluster(mah, 20).slice(0, 10)) console.log(`   n=${c.n} bbox=[${c.x0},${c.y0}]-[${c.x1},${c.y1}]`);
  // 营地墙:golden101 新增墙 196-199/40/171/178/180/204-207(halo 8)
  const camp = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const wv = gw1[i]!;
    if (wv !== gw0[i] && (wv === 40 || wv === 171 || wv === 178 || wv === 180 || (wv >= 196 && wv <= 199) || (wv >= 204 && wv <= 207))) camp[i] = 1;
  }
  console.log('== golden campsite walls (new, halo 8):');
  for (const c of cluster(camp, 8).slice(0, 15)) console.log(`   n=${c.n} bbox=[${c.x0},${c.y0}]-[${c.x1},${c.y1}] ctr≈(${(c.x0 + c.x1) >> 1},${(c.y0 + c.y1) >> 1})`);
  // 轨道:golden101 新增 314(halo 30 连成线路)
  const trk = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (gt1[i] === 314 && gt0[i] !== 314) trk[i] = 1;
  console.log('== golden tracks (314 new, halo 30):');
  for (const c of cluster(trk, 30).slice(0, 8)) console.log(`   n=${c.n} bbox=[${c.x0},${c.y0}]-[${c.x1},${c.y1}]`);

  // ---- JS 侧:重放 + segProbe 流 ----
  const REV = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
  }
  const gsB = JSON.parse(readFileSync(`${BDIR}/s52/gs.json`, 'utf8')) as GenState;
  const glq = b8(100, 'liq'), gltq = b8(100, 'lty'), ghfq = b8(100, 'half'), gslq = b8(100, 'slope'), giaq = b8(100, 'inact');
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/s52/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${BDIR}/s52/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N), wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire[i] = fw[q + 3]! & 0x1f; }
  const iw = new Uint32Array(readFileSync(`${BDIR}/s52/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  const chests = JSON.parse(readFileSync(`${BDIR}/s52/chests.json`, 'utf8')) as unknown[];
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = ga0[i]!;
    st.flags[i] = act;
    if (act || gt0[i]) {
      const sh = gt0[i]!;
      let id = ids35.has(i) ? ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) id = REV.get(sh) ?? -1;
      st.type[i] = id < 0 ? 0 : id;
    }
    st.wall[i] = gw0[i]!;
    st.liquid[i] = glq[i]!;
    st.liquidType[i] = st.liquid[i] ? gltq[i]! + 1 : 0;
    st.half[i] = ghfq[i]!; st.slope[i] = gslq[i]!;
    st.wire[i] = (giaq[i]! ? 0x20 : 0) | wire[i];
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
  G.__swSeg = (name, detail) => {
    events.push({ d: draws, name, detail });
  };
  runMicroBiomesPass(st, rng, gs, chests as never);
  delete G.__swSeg;
  __setGenStateForProbe(null);
  // 打印流(截流:iceTry/campTry/trapTry/treeTry 多于 60 条只打前 60)
  console.log(`== JS seg trace (draws total=${draws}, events=${events.length}):`);
  let nTry = 0;
  for (const e of events) {
    if (e.name === 'iceTry' || e.name === 'campTry' || e.name === 'trapTry' || e.name === 'treeTry' || e.name === 'swordTry') {
      nTry++;
      if (nTry > 80) { if (nTry === 81) console.log('   …(try 流截断)'); continue; }
    }
    console.log(`   [${e.d}] ${e.name} ${JSON.stringify(e.detail)}`);
  }
}, 300_000);
