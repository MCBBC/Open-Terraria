// IIII100g 仪③：修后验证——mine 预算 off-by-one 修复(++tries>=3000 镜像 cs:21954-21956
// num4-- 先减后判)后,pass97 段内流位与金标 rig TSEG 账对拍 + #97 八通道差账。
// 金标真值(rig /tmp/iii100g-out/rig-gfb2,SW_EVIL=0 同代自证):
//   mbMine@120824 trapCount=17@120825 mbTree@1220432 treeCount=9@1220433
//   mbTrack@1266460 longTrackCount=2@1266461 stdTrackCount=6@1269577 mbEnd@1272853
//   (+1 尾 RandNext=金标 pc P|97 R 1272854)
// 用法：cd game && SW_I100GV=1 npx vitest run tools/_iii100g-verify.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG, UnifiedRandom } from '../src/core/rng';
import type { TileStore } from '../src/world/TileStore';

const RUN = process.env.SW_I100GV === '1';
const OUT = '/tmp/iii100g-out';
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

type TA = Uint16Array | Uint8Array;
const CH = ['type', 'flags', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire'] as const;

(RUN ? it : it.skip)('iii100g post-fix pass97 verification', { timeout: 3_600_000 }, async () => {
  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: RNG, s: number) => void;
  let activeUr: UnifiedRandom | null = null;
  let activeCount = 0;
  let fnv = 2166136261;
  let stRef: TileStore | null = null;
  let cap97: { snap: Record<string, TA>; rc: number } | null = null;
  const anchors: Array<{ name: string; rc: number; value?: number }> = [];

  const g0 = globalThis as { __swMbCap?: (gs: unknown, st: TileStore, chests?: unknown) => void };
  const oCap = g0.__swMbCap;
  g0.__swMbCap = (_gs, st) => { stRef = st; oCap?.(_gs, st); };

  const oSeg = (globalThis as { __swSeg?: unknown }).__swSeg as ((name: string, detail?: unknown) => void) | undefined;
  const ANCH = new Set(['mbThin', 'mbSword', 'mbMine', 'mbTree', 'mbTrack', 'mbEnd']);
  const ANCHV = new Set(['iceCount', 'swordAttempts', 'campCount', 'trapCount', 'treeCount', 'longTrackCount', 'stdTrackCount']);
  (globalThis as { __swSeg?: unknown }).__swSeg = (name: string, detail?: unknown) => {
    oSeg?.(name, detail);
    if (ANCH.has(name)) anchors.push({ name, rc: activeCount });
    else if (ANCHV.has(name)) anchors.push({ name, rc: activeCount, value: detail as number });
    if (name === 'mbEnd' && stRef && !cap97) {
      const s: Record<string, TA> = {};
      for (const k of CH) s[k] = (stRef[k] as TA).slice();
      cap97 = { snap: s, rc: activeCount };
    }
  };

  RNGp.reseed = function (this: RNG, s: number) {
    const r = oReseed.call(this, s);
    activeUr = (this as unknown as { ur: UnifiedRandom }).ur;
    activeCount = 0;
    return r;
  };
  const oRoll = g.__swOnRoll;
  g.__swOnRoll = (v: number, inst: object) => {
    if (activeUr && inst === (activeUr as unknown as object)) {
      activeCount++;
      fnv = (Math.imul(fnv ^ v, 16777619) & 0xffffffff) >>> 0;
    }
    oRoll?.(v, inst);
  };

  await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0 as -1 | 0 | 1,
    seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true } } as Parameters<typeof generateWorld>[0]);

  (globalThis as { __swSeg?: unknown }).__swSeg = oSeg;
  g.__swOnRoll = oRoll;
  RNGp.reseed = oReseed;
  g0.__swMbCap = oCap;
  if (!cap97) throw new Error('no pass97-end capture');

  // 8 通道差账 vs 金标 097
  const GT = le16(`${G2}/097_Micro_Biomes.typ`), GA = readFileSync(`${G2}/097_Micro_Biomes.act`);
  const GW = le16(`${G2}/097_Micro_Biomes.wal`), GL = readFileSync(`${G2}/097_Micro_Biomes.liq`);
  const GHF = readFileSync(`${G2}/097_Micro_Biomes.half`), GSL = readFileSync(`${G2}/097_Micro_Biomes.slope`);
  const GLT = readFileSync(`${G2}/097_Micro_Biomes.lty`), GIA = readFileSync(`${G2}/097_Micro_Biomes.inact`);
  const S = cap97.snap;
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, firstI = -1;
  const pair = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const ja = S.flags[i]! & 1;
    const va = GA[i]!;
    if (va !== ja) { dA++; if (firstI < 0) firstI = i; }
    const vt = va ? GT[i]! : 0;
    const jt = ja ? (SHEET[S.type[i]!] >= 0 ? SHEET[S.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; if (firstI < 0) firstI = i; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    if (GW[i]! !== S.wall[i]!) { dW++; if (firstI < 0) firstI = i; }
    if (GL[i]! !== S.liquid[i]!) { dL++; if (firstI < 0) firstI = i; }
    if (GHF[i]! !== S.half[i]!) { dHf++; if (firstI < 0) firstI = i; }
    if (GSL[i]! !== S.slope[i]!) { dSl++; if (firstI < 0) firstI = i; const k = `S${GSL[i]}>${S.slope[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    const vl = GL[i]! > 0 ? GLT[i]! + 1 : 0;
    const jl = S.liquid[i]! > 0 ? S.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; if (firstI < 0) firstI = i; }
    const via = GIA[i]! ? 1 : 0;
    if (via !== ((Number(S.wire[i]) >>> 5) & 1)) { dIa++; if (firstI < 0) firstI = i; }
  }
  const pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}x${n}`).join(' ');

  const lines: string[] = [];
  lines.push('iiii100g post-fix verification (mine budget off-by-one fix)');
  lines.push('段锚(per-pass rc) JS: ' + anchors.map(a => `${a.name}${a.value !== undefined ? '=' + a.value : ''}@${a.rc}`).join('  '));
  lines.push('金标 rig: mbThin@52 iceCount=3@53 swordAttempts=4@51856 mbSword@104301 campCount=10@104302 mbMine@120824 trapCount=17@120825 mbTree@1220432 treeCount=9@1220433 mbTrack@1266460 longTrackCount=2@1266461 stdTrackCount=6@1269577 mbEnd@1272853');
  lines.push(`pass97 终态掷数=${cap97.rc}(金标 mbEnd=1272853,+1 尾=pc R 1272854)`);
  lines.push(`pass97 FNV=${fnv} [金标 pc=690729009;pass97 含非确定性掷,值面非判据]`);
  lines.push(`#97 8通道差账 A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} first=${firstI < 0 ? 'ALL-GREEN' : `(${firstI % W},${Math.floor(firstI / W)})`}`);
  lines.push(`pairs: ${pairs}`);
  writeFileSync(`${OUT}/verify-verdict.txt`, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
});
