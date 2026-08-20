// XXXXX 批·s22222 #90 Flowers 自因重放（基座 /tmp/ss-b/vvs22222=槽89末）。
// 用毕即删。用法：cd game && SW_XX=1 npx vitest run tools/_xxxx7.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runFlowersPass } from '../src/world/gen/vanilla/SurfaceDecorPasses';

const RUN = process.env.SW_XX === '1';
const G2 = '/tmp/sw-slp/g-s22222';
const BASE = '/tmp/ss-b/vvs22222';
const W = 4200, H = 1200, N = W * H;
const SEED = 22222;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const b8 = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));
const b16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));

(RUN ? it : it.skip)('s22222 #90 Flowers replay', async () => {
  const st = new TileStore(W, H);
  st.type = new Uint16Array(readFileSync(`${BASE}/type.bin`).buffer.slice(0));
  st.flags = b8(`${BASE}/flags.bin`);
  st.wall = new Uint16Array(readFileSync(`${BASE}/wall.bin`).buffer.slice(0));
  st.liquid = b8(`${BASE}/liquid.bin`);
  st.liquidType = b8(`${BASE}/liquidType.bin`);
  st.half = b8(`${BASE}/half.bin`);
  st.slope = b8(`${BASE}/slope.bin`);
  st.frameX = b16(`${BASE}/frameX.bin`);
  st.frameY = b16(`${BASE}/frameY.bin`);
  st.wire = b8(`${BASE}/wire.bin`);
  st.paint = b8(`${BASE}/paint.bin`);
  const gs = JSON.parse(readFileSync(`${BASE}/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BASE}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  restoreGenSolid(gensolid);

  runFlowersPass(st, new RNG(SEED), gs);

  // 对拍 dump90
  const c = { t: b16(gPath(90, 'typ')), a: b8(gPath(90, 'act')), w: b16(gPath(90, 'wal')), l: b8(gPath(90, 'liq')), hf: b8(gPath(90, 'half')), sl: b8(gPath(90, 'slope')), lt: b8(gPath(90, 'lty')) };
  const baseF = b8(`${BASE}/flags.bin`);
  const baseT = new Uint16Array(readFileSync(`${BASE}/type.bin`).buffer.slice(0));
  let dA = 0, dT = 0;
  const pairs = new Map<string, number>();
  const samples: string[] = [];
  for (let i = 0; i < N; i++) {
    const va = c.a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; if (samples.length < 10) samples.push(`A(${i % W},${(i / W) | 0}) v${va} j${ja} base=${baseF[i]! & 1 ? SHEET[baseT[i]!] : 'ghost'}`); }
    const vt = va ? c.t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; const k = `T${vt}>${jt}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); if (samples.length < 10) samples.push(`T(${i % W},${(i / W) | 0}) v${vt} j${jt}`); }
  }
  console.log(`#90 diff: A=${dA} T=${dT}`);
  // (593-598,78-86) 树区现场：base 类型+帧 / golden90 / js90
  const g90t = b16(gPath(90, 'typ')), g90a = b8(gPath(90, 'act'));
  const baseFX = b16(`${BASE}/frameX.bin`), baseFY = b16(`${BASE}/frameY.bin`);
  for (let y = 86; y >= 76; y--) {
    const row: string[] = [];
    for (let x = 592; x <= 598; x++) {
      const i = y * W + x;
      const bt = baseF[i]! & 1 ? SHEET[baseT[i]!]! : `g${SHEET[baseT[i]!]}`;
      row.push(`(${x},${y})b${bt}f${baseFX[i]}/${baseFY[i]}${baseF[i]! & 1 ? '' : '!'} → G${g90a[i]! ? g90t[i]! : 'x'} J${st.flags[i]! & 1 ? SHEET[st.type[i]!]! : 'x'}`);
    }
    console.log(row.join(' '));
  }
  console.log(`pairs: ${[...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  console.log(`samples: ${samples.join(' | ')}`);
}, 300_000);
