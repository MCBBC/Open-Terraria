// IIII109 终态 8 通道对拍仪：JS generateWorld 【管线尾终态 store】 vs x86 任意槽 dump
// （默认 -004_PostFinSeed 瞬态）。randomSpawn 等终段旗标的重掷/火把环在原版位于
// FinalCleanup pass 体内（FinalizeSecretSeeds :22680 在 pass 注册体内、#105 dump 前），
// 本仓挂在管线尾（IIIII41-T3① 备案：SpawnPoint 写回上提 finalize 之后的让位决策）——
// 故 mile8 槽末#58 的 #105 差=快照时点语义，真认证面=终态 store vs x86 终态 dump。
// 用法（cd game）：
//   SW109_F8_G2=/tmp/iii135-out/x86-mch SW109_F8_SLOT='-004_PostFinSeed' \
//   SW109_F8_SEED='howdidigethere|20260904' SW109_F8_FLAGS=randomSpawn \
//   npx vitest run tools/_iii109final8.test.ts
//   # SW109_F8_SLOT 亦可填 '105_Final_Cleanup'（纯数字槽）——终态 vs pass 末态。
import { it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const G2 = process.env.SW109_F8_G2 ?? '';
const SLOT = process.env.SW109_F8_SLOT ?? '-004_PostFinSeed';
const SEED = process.env.SW109_F8_SEED ?? '';
const EVIL = process.env.SW109_F8_EVIL !== undefined ? Number(process.env.SW109_F8_EVIL) : 0;
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW109_F8_FLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;
const RUN = !!G2 && !!SEED;
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

(RUN ? it : it.skip)('III109 final-store 8ch vs x86 dump', { timeout: 900_000 }, async () => {
  const pre = `${G2}/${SLOT}`;
  if (!existsSync(`${pre}.typ`)) throw new Error(`no dump ${pre}.typ`);
  const xt = le16(`${pre}.typ`), xa = readFileSync(`${pre}.act`), xw = le16(`${pre}.wal`),
    xl = readFileSync(`${pre}.liq`), xh = readFileSync(`${pre}.half`), xs = readFileSync(`${pre}.slope`),
    xlt = readFileSync(`${pre}.lty`), xia = readFileSync(`${pre}.inact`);
  const world = await generateWorld({
    width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined,
  });
  const st = world.store as unknown as Record<string, Uint8Array | Uint16Array>;
  const CH = ['act', 'typ', 'wal', 'liq', 'half', 'slope', 'lty', 'inact'] as const;
  const d: Record<string, number> = {};
  const first: Record<string, string> = {};
  for (const c of CH) d[c] = 0;
  for (let i = 0; i < N; i++) {
    const ja = (st.flags[i] as number) & 1;
    const va = xa[i]!;
    if (va !== ja) { d.act++; if (!first.act) first.act = `(${i % W},${(i / W) | 0}) v${va} j${ja}`; }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[(st.type[i] as number)!] >= 0 ? SHEET[(st.type[i] as number)!]! : 9999) : 0;
    if (vt !== jt) { d.typ++; if (!first.typ) first.typ = `(${i % W},${(i / W) | 0}) v${vt} j${jt}`; }
    if (xw[i] !== st.wall[i]) { d.wal++; if (!first.wal) first.wal = `(${i % W},${(i / W) | 0}) v${xw[i]} j${st.wall[i]}`; }
    if (xl[i] !== st.liquid[i]) { d.liq++; if (!first.liq) first.liq = `(${i % W},${(i / W) | 0}) v${xl[i]} j${st.liquid[i]}`; }
    if (xh[i] !== st.half[i]) { d.half++; if (!first.half) first.half = `(${i % W},${(i / W) | 0}) v${xh[i]} j${st.half[i]}`; }
    if (xs[i] !== st.slope[i]) { d.slope++; if (!first.slope) first.slope = `(${i % W},${(i / W) | 0}) v${xs[i]} j${st.slope[i]}`; }
    const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? (st.liquidType[i] as number) : 0;
    if (vl !== jl) { d.lty++; if (!first.lty) first.lty = `(${i % W},${(i / W) | 0}) v${vl} j${jl}`; }
    const via = xia[i]! ? 1 : 0;
    const jia = ((st.wire[i] as number) >>> 5) & 1;
    if (via !== jia) { d.inact++; if (!first.inact) first.inact = `(${i % W},${(i / W) | 0}) v${via} j${jia}`; }
  }
  const bad = CH.some((c) => d[c] > 0);
  console.log(`F8 ${SLOT} ← ${SEED} [${Object.keys(FLAGS).join(',')}] → ` +
    CH.map((c) => `${c}=${d[c]}`).join(' ') + (bad ? ' ✗' : ' ✓ 全绿'));
  if (bad) for (const c of CH) if (d[c] > 0) console.log(`  ${c}: first=${first[c]}`);
  console.log(`F8-SPAWN js=(${world.spawnX},${world.spawnY})`);
});
