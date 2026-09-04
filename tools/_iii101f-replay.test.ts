// IIII101f 仪①：GFB #99 slope 瞬态反演重放（CXI 既账：#99 @1587,981 S0>1×1 双 inactive
// 幽灵沙格，#100 Tile Cleanup 自愈）。
//   基座=金标 dump098（Settle_Liquids_Again，10 通道含 frx/fry 帧基座）——0..98 与 JS
//   byte-green（CXIII 既账），故单跑「仙人掌珊瑚」pass 后 vs dump099 的八通道差
//   =pass99 窗内行为差（事件级隔离，无上游漂移噪声）。
//   阶段A（gs99.json 缺失时自动）：全管线跑至 __swCcCap（仙人掌珊瑚 pass 头钩）捕获
//   gs（seed/oasis 阵列/worldSurface/beachDistance/seedFlags…）落 /tmp/iii132-out/gs99.json。
//   阶段B：载 098 → fresh RNG(seed99)（RunPass 槽头重播种子=world.seed，WorldGen.ts:513
//   与 pass 体之间零掷）→ runCactusPalmTreesAndCoralPass → 八通道+帧对拍 099。
// 用法：cd game && SW_I101F=1 npx vitest run tools/_iii101f-replay.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { runCactusPalmTreesAndCoralPass } from '../src/world/gen/vanilla/StructuresPass';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_I101F === '1';
const OUT = '/tmp/iii132-out';
const G2 = `${process.env.HOME}/GoldenChains/golden-gfb-c`;
const W = 4200, H = 1200, N = W * H;
const D98 = '098_Settle_Liquids_Again';
const D99 = '099_Cactus__Palm_Trees____Coral';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
// vanilla sheet → JS 内部 id（首见）
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const DIRT_ID = REV.get(0)!;   // vanilla type 0=泥土（#98 判例：活性 type0=泥）
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const u8 = (p: string): Uint8Array => {
  const b = readFileSync(p);
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
};

function buildStoreFromDump(d: string): TileStore {
  const pre = `${G2}/${d}`;
  const T = le16(`${pre}.typ`), A = u8(`${pre}.act`), Wl = le16(`${pre}.wal`), L = u8(`${pre}.liq`);
  const LT = u8(`${pre}.lty`), HF = u8(`${pre}.half`), SL = u8(`${pre}.slope`), IA = u8(`${pre}.inact`);
  const FX = le16(`${pre}.frx`), FY = le16(`${pre}.fry`);
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.flags[i] = A[i]! ? 1 : 0;
    // 活性 type0=泥土；非活性 type0=空气（JS 0 号语义=「非活性 type0」同 vanilla 空格）
    st.type[i] = T[i] === 0 ? (A[i] ? DIRT_ID : 0) : (REV.get(T[i]!) ?? 0);
    st.wall[i] = Wl[i]!;
    st.liquid[i] = L[i]!;
    st.liquidType[i] = L[i]! > 0 ? LT[i]! + 1 : 0;   // vanilla lty 0 基 → JS +1 基
    st.half[i] = HF[i]!;
    st.slope[i] = SL[i]!;
    st.wire[i] = IA[i]! ? 32 : 0;                    // bit5=inActive
    st.frameX[i] = FX[i]!;
    st.frameY[i] = FY[i]!;
  }
  return st;
}

/** 8 通道+帧对拍（mile8 口径） */
function cmpDump(tag: string, st: TileStore, d: string): { bad: boolean; rows: string[] } {
  const pre = `${G2}/${d}`;
  const GT = le16(`${pre}.typ`), GA = u8(`${pre}.act`), GW = le16(`${pre}.wal`), GL = u8(`${pre}.liq`);
  const GHF = u8(`${pre}.half`), GSL = u8(`${pre}.slope`), GLT = u8(`${pre}.lty`), GIA = u8(`${pre}.inact`);
  const GFX = le16(`${pre}.frx`), GFY = le16(`${pre}.fry`);
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, dFx = 0;
  let firstI = -1;
  const pair = new Map<string, number>();
  const rows: string[] = [];
  for (let i = 0; i < N; i++) {
    const va = GA[i]!, ja = st.flags[i]! & 1;
    const vt = va ? GT[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    let bad = false;
    if (va !== ja) { dA++; bad = true; }
    if (vt !== jt) { dT++; bad = true; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    if (GW[i]! !== st.wall[i]!) { dW++; bad = true; }
    if (GL[i]! !== st.liquid[i]!) { dL++; bad = true; }
    if (GHF[i]! !== st.half[i]!) { dHf++; bad = true; }
    if (GSL[i]! !== st.slope[i]!) {
      dSl++; bad = true;
      const k = `S${GSL[i]}>${st.slope[i]}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
      rows.push(`  Sl(${i % W},${(i / W) | 0}) g=${GSL[i]} j=${st.slope[i]} gA=${va} gT=${GT[i]} jA=${ja} jSheet=${jt}`);
    }
    const vl = GL[i]! > 0 ? GLT[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; bad = true; }
    if ((GIA[i]! ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) { dIa++; bad = true; }
    if (GFX[i]! !== st.frameX[i]! || GFY[i]! !== st.frameY[i]!) { dFx++; }
    if (bad && firstI < 0) firstI = i;
  }
  const head = `${tag} A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa}` +
    ` first=${firstI >= 0 ? `(${firstI % W},${Math.floor(firstI / W)})` : 'ALL-GREEN'} pairs=${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}x${n}`).join(' ')} (帧差 frx/fry=${dFx} 信息位不裁决)`;
  rows.unshift(head);
  return { bad: !!(dA || dT || dW || dL || dHf || dSl || dLt || dIa), rows };
}

(RUN ? it : it.skip)('iii101f #99 slope-transient reverse replay', { timeout: 3_600_000 }, async () => {
  // ── 阶段A：gs 捕获（缓存复用）──
  const gsCache = `${OUT}/gs99.json`;
  let gs99: GenState;
  let seed99 = 0;
  if (existsSync(gsCache) && process.env.SW_I101F_RECAP !== '1') {
    const raw = JSON.parse(readFileSync(gsCache, 'utf8')) as { seed: number; gs: Record<string, unknown> };
    seed99 = raw.seed;
    gs99 = raw.gs as unknown as GenState;
    console.log(`[A] gs99 缓存载入 seed=${seed99} numOasis=${gs99.numOasis} ws=${gs99.worldSurface} beach=${gs99.beachDistance}`);
  } else {
    const g0 = globalThis as { __swCcCap?: (gs: GenState, st: TileStore) => void };
    let cap: GenState | null = null;
    g0.__swCcCap = (gs) => { if (!cap) cap = JSON.parse(JSON.stringify(gs, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as unknown as Iterable<unknown>) : v))) as GenState; };
    try {
      await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0 as -1 | 0 | 1,
        seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true } } as Parameters<typeof generateWorld>[0]);
    } finally { g0.__swCcCap = undefined; }
    if (!cap) throw new Error('no __swCcCap capture（仙人掌珊瑚 pass 头钩未触达）');
    seed99 = (cap as unknown as { seed: number }).seed;
    gs99 = cap;
    writeFileSync(gsCache, JSON.stringify({ seed: seed99, gs: gs99 }));
    console.log(`[A] gs99 已捕获落盘 seed=${seed99} numOasis=${gs99.numOasis} ws=${gs99.worldSurface} beach=${gs99.beachDistance} remix=${String(gs99.seedFlags?.remix)}`);
  }

  // ── 阶段B：金标 098 带帧基座 → 单跑仙人掌珊瑚 → 对拍 099 ──
  const st = buildStoreFromDump(D98);
  // 载基自检：098 vs 098 应零差（REV 映射往返完整性）
  const self = cmpDump('基座自检 st(098) vs dump098', st, D98);
  console.log(self.rows.join('\n'));
  if (self.bad) throw new Error('基座装载自检失败：dump098 往返映射有损');

  const rng = new RNG(0);
  rng.reseed(seed99);   // RunPass 槽头重播（WorldGen.ts:513 同构；reseed→pass 体间零掷）
  runCactusPalmTreesAndCoralPass(st, rng, gs99);

  const r = cmpDump('JS单跑pass99(金标098基座) vs dump099', st, D99);
  console.log(r.rows.join('\n'));
  // 焦点格账（CXI 既账 @1587,981）
  const fi = 981 * W + 1587;
  console.log(`焦点 (1587,981): j.sl=${st.slope[fi]} j.act=${st.flags[fi] & 1} j.sheet=${st.flags[fi] & 1 ? SHEET[st.type[fi]!] : `ghost${st.type[fi]}`}`);
  writeFileSync(`${OUT}/iii101f-replay.txt`, r.rows.join('\n') + '\n');
  if (r.bad) throw new Error('iii101f 反演重放：pass99 窗内存在写面差（见上账）');
  console.log('iii101f 反演重放：八通道满绿 ✓');
});
