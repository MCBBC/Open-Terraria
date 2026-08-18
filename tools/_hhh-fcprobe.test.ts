// HHHH 批一次性探针：金标 104 槽基座 → runFinalCleanupPass（frameSparse）→ 九通道
// dump /tmp/hhhh-js-fc.*（与 caves-oracle HHHH_FC_BASE/HHHH_FC_DUMP 同构 head-to-head）。
// 用后即删。HHHH_SEED 缺省 9293480。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { runFinalCleanupPass } from '../src/world/gen/vanilla/FinalCleanupPass';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const seedInt = Number(process.env.HHHH_SEED ?? 9293480);
const base = process.env.HHHH_104 ?? '/tmp/sw-slp/g/104_Remove_Broken_Traps';
const out = process.env.HHHH_FCD ?? `/tmp/hhhh-js-fc-${seedInt}`;

// sheet → 首个内部 id（与 oracle sheet 折叠口径一致）
const REV = new Map<number, number>();
const SWEEP_SHEET = new Int16Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') {
    SWEEP_SHEET[i] = s;
    if (!REV.has(s)) REV.set(s, i);
  }
}

it('fc head-to-head', () => {
  const W = 4200, H = 1200;
  const st = new TileStore(W, H);
  // ---- 载入金标 104 八通道（lty vanilla 编码 0水/1岩浆/2蜜/3微光 → JS +1）----
  const rd16 = (p: string) => { const b = readFileSync(p); const a = new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); return a; };
  const typD = rd16(`${base}.typ`), walD = rd16(`${base}.wal`);
  const actD = readFileSync(`${base}.act`), liqD = readFileSync(`${base}.liq`), ltyD = readFileSync(`${base}.lty`);
  const slD = readFileSync(`${base}.slope`), hfD = readFileSync(`${base}.half`);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(typD[i]) ?? 0;
    st.flags[i] = actD[i] ? 1 : 0;
    st.wall[i] = walD[i];
    st.liquid[i] = liqD[i];
    st.liquidType[i] = liqD[i] > 0 ? ltyD[i] + 1 : ltyD[i];
    st.slope[i] = slD[i];
    st.half[i] = hfD[i];
  }
  // oracle JSON 头的锚参数（worldSurface/rockLayer/shimmer 位点与链一致）
  const hdr = JSON.parse(readFileSync('/tmp/caves-sync-9293480.json', 'utf8'));
  const gs = {
    worldSurface: hdr.worldSurface, rockLevel: hdr.rockLayer, beachDistance: 380,
    shimmerX: hdr.shimmerX, shimmerY: hdr.shimmerY,
  } as unknown as GenState;
  const rng = new RNG(seedInt);   // ≡ oracle append 头 Replay()
  runFinalCleanupPass(st, gs, rng, { frameSparse: true });
  // ---- dump 九通道（typ 映射回 sheet；EMPTY→0 与 oracle ghost typ=0 同域）----
  const n = W * H;
  const typ = Buffer.alloc(n * 2), wal = Buffer.alloc(n * 2);
  const act = Buffer.alloc(n), liq = Buffer.alloc(n), lty = Buffer.alloc(n);
  const sl = Buffer.alloc(n), hf = Buffer.alloc(n), frx = Buffer.alloc(n * 2), fry = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const sh = st.flags[i] ? SWEEP_SHEET[st.type[i]] : (st.type[i] === 0 ? 0 : SWEEP_SHEET[st.type[i]]);
    typ.writeUInt16LE(sh < 0 ? 0 : sh, i * 2);
    wal.writeUInt16LE(st.wall[i] & 0xffff, i * 2);
    act[i] = st.flags[i] ? 1 : 0;
    liq[i] = st.liquid[i];
    const lt = st.liquidType[i] as number;
    lty[i] = lt > 0 ? lt - 1 : lt;   // JS +1 → vanilla 0 基
    sl[i] = st.slope[i]; hf[i] = st.half[i];
    frx.writeUInt16LE(st.frameX[i]! & 0xffff, i * 2);
    fry.writeUInt16LE(st.frameY[i]! & 0xffff, i * 2);
  }
  for (const [ext, buf] of [['typ', typ], ['act', act], ['wal', wal], ['liq', liq], ['lty', lty], ['slope', sl], ['half', hf], ['frx', frx], ['fry', fry]] as const) {
    writeFileSync(`${out}.${ext}`, buf);
  }
  let moss = 0, dirtiest = 0;
  for (let i = 0; i < n; i++) {
    if (st.flags[i] && SWEEP_SHEET[st.type[i]] === 184) moss++;
    if (st.flags[i] && SWEEP_SHEET[st.type[i]] === 668) dirtiest++;
  }
  console.log(`JS FC anchors: moss184=${moss} dirtiest668=${dirtiest} -> ${out}.*`);
}, 600000);
