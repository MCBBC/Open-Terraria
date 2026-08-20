// XXXXX 批·12345 #87 Glowing_Mushrooms 自因重放（基座 /tmp/ss-b/vv12345=槽83末）。
// 链：84 Dye → 85 Webs → 86 Weeds → 87 GlowingMushrooms；逐槽 8 通道对拍 + #87 逐放置账。
// 用毕即删。用法：cd game && SW_XX=1 npx vitest run tools/_xxxx5.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runDyePlantsPass, runGrassPlantsPass, runGlowingMushroomPlantsPass } from '../src/world/gen/vanilla/SurfaceDecorPasses';
import { runWebsInSpiderCavesPass } from '../src/world/gen/vanilla/HiveSpiderPass';

const RUN = process.env.SW_XX === '1';
const G2 = '/tmp/sw-slp/g12345';
const BASE = '/tmp/ss-b/vv12345';
const W = 4200, H = 1200, N = W * H;
const SEED = 12345;

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

function loadBase(): { st: TileStore; gs: GenState } {
  const st = new TileStore(W, H);
  const u16 = new Uint16Array(readFileSync(`${BASE}/type.bin`).buffer.slice(0));
  st.type = u16;
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
  return { st, gs };
}

function diff(tag: string, idx: number, st: TileStore): void {
  const c = { t: b16(gPath(idx, 'typ')), a: b8(gPath(idx, 'act')), w: b16(gPath(idx, 'wal')), l: b8(gPath(idx, 'liq')), hf: b8(gPath(idx, 'half')), sl: b8(gPath(idx, 'slope')), lt: b8(gPath(idx, 'lty')), ia: b8(gPath(idx, 'inact')) };
  let dA = 0, dT = 0, dW = 0, dL = 0, dSl = 0, dHf = 0, dLt = 0;
  const pairs = new Map<string, number>();
  const samples: string[] = [];
  for (let i = 0; i < N; i++) {
    const va = c.a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; if (samples.length < 10) samples.push(`A(${i % W},${(i / W) | 0}) v${va} j${ja}`); }
    const vt = va ? c.t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; const k = `T${vt}>${jt}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); if (samples.length < 10) samples.push(`T(${i % W},${(i / W) | 0}) v${vt} j${jt}`); }
    if (c.w[i]! !== st.wall[i]!) dW++;
    if (c.l[i]! !== st.liquid[i]!) dL++;
    if (c.hf[i]! !== st.half[i]!) dHf++;
    if (c.sl[i]! !== st.slope[i]!) dSl++;
    const vl = c.l[i]! > 0 ? c.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) dLt++;
  }
  const bad = dA || dT || dW || dL || dHf || dSl || dLt;
  console.log(`${String(idx).padStart(3)} ${DUMPNAME.get(idx)} ← ${tag.padEnd(24)} A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} ${bad ? '✗' : '✓'}`);
  if (bad) {
    console.log(`     pairs: ${[...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k}×${n}`).join(' ')}`);
    console.log(`     samples: ${samples.join(' | ')}`);
  }
}

(RUN ? it : it.skip)('12345 #87 tail replay', async () => {
  const { st, gs } = loadBase();
  const gensolid = new Map(JSON.parse(readFileSync(`${BASE}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  restoreGenSolid(gensolid);
  // #84 Dye
  runDyePlantsPass(st, new RNG(SEED), gs);
  diff('js#84', 84, st);
  // #85 Webs
  runWebsInSpiderCavesPass(st, new RNG(SEED), gs);
  diff('js#85', 85, st);
  // #86 Weeds
  runGrassPlantsPass(st, new RNG(SEED));
  diff('js#86', 86, st);
  // #87 GlowingMushrooms（放置账：61/69 放置点+掷序列）
  const placements: string[] = [];
  (globalThis as { __xx87?: (x: number, y: number, kind: string) => void }).__xx87 = (x, y, kind) => {
    if (placements.length < 4000) placements.push(`${kind}@${x},${y}`);
  };
  runGlowingMushroomPlantsPass(st, new RNG(SEED), gs);
  (globalThis as { __xx87?: unknown }).__xx87 = undefined;
  diff('js#87', 87, st);
  if (process.env.SW_XX_LOG === '1') {
    writeFileSync0(placements);
  }
}, 300_000);

function writeFileSync0(placements: string[]): void {
  const { writeFileSync } = require('node:fs') as typeof import('node:fs');
  writeFileSync('/tmp/xxxx-87-place.log', placements.join('\n'));
}
