// IIIII153（GFB-E 嫁接收尾）一次性取证仪：generateWorld 终态（FinalSeedCleanup 后）
// 8 通道直对 x86 真值瞬态 dump -004_PostFinSeed（golden-g 布局 B 携带）。
// 用途=world-final-hash 金标「统一时刻再生」的再生前认证——mile8 槽链锚到 dump105
// （Final_Cleanup 止），终态哈希覆盖 FinalSeedCleanup 之后的真终态，两者互补。
// 用法：cd game && SW_MB_1457=1 SW_I153_FIN=1 npx vitest run tools/_iii153fin.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I153_FIN === '1';
const G2 = process.env.SW_I153_G2 ?? `${process.env.HOME}/GoldenChains/golden-g`;
const SEED = process.env.SW_I153_SEED ?? '9293480';
const EVIL = Number(process.env.SW_I153_EVIL ?? 0);
const W = Number(process.env.SW_I153_W ?? 4200), H = Number(process.env.SW_I153_H ?? 1200);
const N = W * H;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const u8 = (p: string): Uint8Array => {
  const b = readFileSync(p);
  return new Uint8Array(b.buffer, b.byteOffset, Math.min(N, b.length));
};
const SLOT = process.env.SW_I153_SLOT ?? '-004_PostFinSeed';
const PRE = `${G2}/${SLOT}`;

(RUN ? it : it.skip)('终态 8 通道直对 -004_PostFinSeed', async () => {
  const miss = ['act', 'typ', 'wal', 'liq', 'half', 'slope', 'lty', 'inact'].filter((c) => !existsSync(`${PRE}.${c}`));
  if (miss.length > 0) throw new Error(`-004_PostFinSeed 缺通道 [${miss.join(',')}] @${G2}`);
  const t = le16(`${PRE}.typ`), a = u8(`${PRE}.act`), w = le16(`${PRE}.wal`), l = u8(`${PRE}.liq`);
  const hf = u8(`${PRE}.half`), sl = u8(`${PRE}.slope`), lt = u8(`${PRE}.lty`), ia = u8(`${PRE}.inact`);
  const world = await generateWorld({ width: W, height: H, seedText: SEED, evil: EVIL as 0 | 1 });
  const st = world.store;
  const d = { A: 0, T: 0, W: 0, L: 0, Hf: 0, Sl: 0, Lt: 0, Ia: 0 };
  const samples: string[] = [];
  let firstI = -1;
  const mark = (i: number) => { if (firstI < 0) firstI = i; };
  for (let i = 0; i < N; i++) {
    const va = a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { d.A++; mark(i); if (samples.length < 8) samples.push(`A(${i % W},${(i / W) | 0}) v${va} j${ja}`); }
    const vt = va ? t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { d.T++; mark(i); if (samples.length < 8) samples.push(`T(${i % W},${(i / W) | 0}) v${vt} j${jt}`); }
    if (w[i]! !== st.wall[i]!) { d.W++; mark(i); if (samples.length < 8) samples.push(`W(${i % W},${(i / W) | 0}) v${w[i]} j${st.wall[i]}`); }
    if (l[i]! !== st.liquid[i]!) { d.L++; mark(i); if (samples.length < 8) samples.push(`L(${i % W},${(i / W) | 0}) v${l[i]} j${st.liquid[i]}`); }
    if (hf[i]! !== st.half[i]!) { d.Hf++; mark(i); if (samples.length < 8) samples.push(`Hf(${i % W},${(i / W) | 0}) v${hf[i]} j${st.half[i]}`); }
    if (sl[i]! !== st.slope[i]!) { d.Sl++; mark(i); if (samples.length < 8) samples.push(`Sl(${i % W},${(i / W) | 0}) v${sl[i]} j${st.slope[i]}`); }
    const vl = l[i]! > 0 ? lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { d.Lt++; mark(i); if (samples.length < 8) samples.push(`Lt(${i % W},${(i / W) | 0}) v${vl} j${jl}`); }
    const via = ia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { d.Ia++; mark(i); if (samples.length < 8) samples.push(`Ia(${i % W},${(i / W) | 0}) v${via} j${jia}`); }
  }
  console.log(`[iii153fin] seed=${SEED} evil=${EVIL} ${W}x${H} vs ${PRE} (${SLOT})`);
  console.log(`[iii153fin] dA=${d.A} dT=${d.T} dW=${d.W} dL=${d.L} dHf=${d.Hf} dSl=${d.Sl} dLt=${d.Lt} dIa=${d.Ia}`);
  if (firstI >= 0) console.log(`[iii153fin] first=(${firstI % W},${Math.floor(firstI / W)}) samples=${samples.join(' | ')}`);
  const total = d.A + d.T + d.W + d.L + d.Hf + d.Sl + d.Lt + d.Ia;
  console.log(`[iii153fin] verdict: ${total === 0 ? 'ALL-GREEN（终态与 x86 -004_PostFinSeed 八通道零差）' : `RED total=${total}`}`);
  if (total !== 0) throw new Error(`终态对拍 RED total=${total}`);
}, 600000);
