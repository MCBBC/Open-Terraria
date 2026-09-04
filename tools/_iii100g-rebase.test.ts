// IIII100g 仪①：跨车道移交复账（graveyard IIII101d 两掷族 ①SpawnOnPlayer 墓碑幽灵搜索环
// ②case314 轨块尘(30掷/块×3副本) 落地后,GFB pass97 基线是否移动）。
// 产出（/tmp/iii131-out/）：
//   rebase-verdict.txt   A0(至 mbTrack 绝对掷)/pass97 终态掷数/8 通道差账/314 巷杀计数与掷位
//   js2-pretrack.*       mbTrack 前全通道快照（13 通道,后续 C 扫描复用）
// 用法：cd game && SW_I100GRB=1 npx vitest run tools/_iii100g-rebase.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG, UnifiedRandom } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { __setTrackKillProbe } from '../src/world/gen/vanilla/TrackPass';

const RUN = process.env.SW_I100GRB === '1';
const OUT = '/tmp/iii131-out';
const G2 = `${process.env.HOME}/GoldenChains/golden-gfb-c`;
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
const u8 = (p: string): Uint8Array => readFileSync(p);

type TA = Uint16Array | Uint8Array;
const ARRAYS = ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;

(RUN ? it : it.skip)('iii100g rebaseline (post-IIII101d roll-family audit)', { timeout: 3_600_000 }, async () => {
  const g = globalThis as {
    __swSeg?: (name: string, detail?: unknown) => void;
    __swOnRoll?: (v: number, inst: object) => void;
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: RNG, s: number) => void;
  let activeUr: UnifiedRandom | null = null;
  let activeCount = 0;
  let passIdx = 0;
  const reseedSeeds: number[] = [];
  RNGp.reseed = function (this: RNG, s: number) {
    const r = oReseed.call(this, s);
    activeUr = (this as unknown as { ur: UnifiedRandom }).ur;
    activeCount = 0;
    reseedSeeds.push(s);
    passIdx = reseedSeeds.length;
    return r;
  };
  const oRoll = g.__swOnRoll;
  g.__swOnRoll = (v: number, inst: object) => {
    if (activeUr && inst === (activeUr as unknown as object)) activeCount++;
    oRoll?.(v, inst);
  };

  // 314 巷杀普查（IIII101d case314 尘掷族触达面）
  const killBySheet = new Map<number, number>();
  const kill314: Array<{ draws: number; x: number; y: number }> = [];
  __setTrackKillProbe((_draws: number, x: number, y: number, sheet: number) => {
    killBySheet.set(sheet, (killBySheet.get(sheet) ?? 0) + 1);
    if (sheet === 314) kill314.push({ draws: activeCount, x, y });
  }, () => activeCount);

  let cap: { st: TileStore; gs: GenState; a0: number; seed97: number; snap: Record<string, TA>; passIdx: number } | null = null;
  const oSeg = g.__swSeg;
  g.__swSeg = (name, detail) => {
    if (name === 'mbTrack' && !cap) {
      const d = detail as { st: TileStore; rng: RNG; gs: GenState; chests?: unknown[] };
      const s: Record<string, TA> = {};
      for (const k of ARRAYS) s[k] = (d.st[k] as TA).slice();
      cap = { st: d.st, gs: d.gs, a0: activeCount, seed97: reseedSeeds[reseedSeeds.length - 1] ?? 0, snap: s, passIdx };
      oSeg?.(name, detail);
      return;
    }
    oSeg?.(name, detail);
  };

  await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0 as -1 | 0 | 1,
    seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true } } as Parameters<typeof generateWorld>[0]);

  g.__swSeg = oSeg;
  g.__swOnRoll = oRoll;
  RNGp.reseed = oReseed;
  __setTrackKillProbe(undefined);
  if (!cap) throw new Error('no mbTrack capture');
  const S = cap;

  // ── mbTrack 快照落盘（后续 C 扫描复用）──
  for (const k of ARRAYS) {
    const ext = k === 'type' ? 'typ' : k === 'flags' ? 'act' : k === 'wall' ? 'wal' : k === 'liquid' ? 'liq'
      : k === 'liquidType' ? 'lty' : k === 'half' ? 'hf' : k === 'slope' ? 'sl' : k === 'wire' ? 'wir'
      : k === 'paint' ? 'pnt' : k === 'paintWall' ? 'pwl' : k === 'coat' ? 'cot' : 'frx';
    writeFileSync(`${OUT}/js2-pretrack.${ext}`, Buffer.from((S.snap[k] as TA).buffer, (S.snap[k] as TA).byteOffset, (S.snap[k] as TA).byteLength));
  }

  // ── 8 通道差账（pass97 终态 vs 金标 097）──
  const GT = le16(`${G2}/097_Micro_Biomes.typ`), GA = u8(`${G2}/097_Micro_Biomes.act`);
  const GW = le16(`${G2}/097_Micro_Biomes.wal`), GL = u8(`${G2}/097_Micro_Biomes.liq`);
  const GHF = u8(`${G2}/097_Micro_Biomes.half`), GSL = u8(`${G2}/097_Micro_Biomes.slope`);
  const GLT = u8(`${G2}/097_Micro_Biomes.lty`), GIA = u8(`${G2}/097_Micro_Biomes.inact`);
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, firstI = -1;
  const pair = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const va = GA[i]!, ja = S.st.flags[i]! & 1;
    if (va !== ja) { dA++; if (firstI < 0) firstI = i; }
    const vt = va ? GT[i]! : 0;
    const jt = ja ? (SHEET[S.st.type[i]!] >= 0 ? SHEET[S.st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; if (firstI < 0) firstI = i; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    if (GW[i]! !== S.st.wall[i]!) { dW++; if (firstI < 0) firstI = i; }
    if (GL[i]! !== S.st.liquid[i]!) { dL++; if (firstI < 0) firstI = i; }
    if (GHF[i]! !== S.st.half[i]!) { dHf++; if (firstI < 0) firstI = i; }
    if (GSL[i]! !== S.st.slope[i]!) { dSl++; if (firstI < 0) firstI = i; const k = `S${GSL[i]}>${S.st.slope[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    const vl = GL[i]! > 0 ? GLT[i]! + 1 : 0;
    const jl = S.st.liquid[i]! > 0 ? S.st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; if (firstI < 0) firstI = i; }
    const via = GIA[i]! ? 1 : 0;
    if (via !== ((S.st.wire[i]! >>> 5) & 1)) { dIa++; if (firstI < 0) firstI = i; }
  }
  const pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}x${n}`).join(' ');

  // ── 314 尘掷量换算：GetTileDustAmount(314)=default → fail=false 10 粒/fail=true 3 粒 ×3 掷 ──
  const k314 = kill314.length;
  const dustRollsLo = k314 * 9, dustRollsHi = k314 * 30;

  const lines: string[] = [];
  lines.push(`iiii100g rebase verdict (post IIII101d roll-families)`);
  lines.push(`A0(mbTrack 绝对掷)=${S.a0}  [CVI 基线 1267454 → Δ=${S.a0 - 1267454}]`);
  lines.push(`seed97=${S.seed97} passIdxAtMbTrack=${S.passIdx} totalReseeds=${reseedSeeds.length}`);
  lines.push(`pass97 终态掷数(pass98 头)=${activeCount}  [金标 P|97 R=1272854(−1 口径=1272853)]`);
  lines.push(`#97 8通道差账 A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} first=(${firstI % W},${(firstI / W) | 0})`);
  lines.push(`pairs: ${pairs}`);
  lines.push(`[CVI 基线差账 A=10085 T=11184 W=2 L=242 Hf=139 Sl=1473 Lt=242 Ia=0]`);
  lines.push(`case314 巷杀数=${k314} → 尘掷增量范围 [${dustRollsLo}..${dustRollsHi}] ${k314 === 0 ? '⇒ II101d 尘掷族对 GFB pass97 零触达,C=−1082 基线不动' : '⇒ 基线移动!'}`);
  if (k314 > 0) lines.push(`314 掷位(前 20): ${kill314.slice(0, 20).map(k => `d${k.draws}@(${k.x},${k.y})`).join(' ')}`);
  lines.push(`巷杀 sheet 计数 top: ${[...killBySheet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([s, n]) => `${s}:${n}`).join(' ')}`);
  writeFileSync(`${OUT}/rebase-verdict.txt`, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
});
