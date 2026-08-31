// IIII92 一次性诊断：Dual_Dungeons_Dither_Snake 槽单窗反演重放对拍。
//   相 1：generateWorld 全管线跑通（dualDungeons 链），@UWHEAD 捕获 gs 面（含
//         dualDungeonState.dungeons/theme/crimson/界域）；
//   相 2：dump031_Slush 真值 → TileStore + fresh RNG(seed)，单独重放
//         runDualDungeonsDitherSnakePass → 对拍 dump032 八通道。
// 用法：
// SW_I92SNAKE=1 SW_I92_SEED='doubledaringdangers|20260831' \
//   G2=/tmp/iii84-out/x86-i78-ddual npx vitest run tools/_iii92snake.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { translateSeed } from '../src/core/rng';
import { RNG } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';
import { dualDungeonState, createPotentialDungeonBounds, type DungeonStyleData } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runDualDungeonsDitherSnakePass, snakeDbg } from '../src/world/gen/vanilla/DitherSnakePass';

const RUN = process.env.SW_I92SNAKE === '1';
const SEED = process.env.SW_I92_SEED ?? '0';
const EVIL = Number(process.env.SW_I92_EVIL ?? 0);
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I92_FLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;
const G2 = process.env.G2 ?? '/tmp/iii84-out/x86-i78-ddual';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') {
    SHEET[i] = s;
    if (!REV.has(s)) REV.set(s, i);
  }
}

const le16 = (p: string): Uint16Array => new Uint16Array(readFileSync(p).buffer.slice(0));
const rd = (p: string): Uint8Array => readFileSync(p);

interface Ch {
  t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array;
  hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array;
}
function chOf(nm: string): Ch {
  const pre = `${G2}/${nm}`;
  return {
    t: le16(`${pre}.typ`), a: rd(`${pre}.act`), w: le16(`${pre}.wal`), l: rd(`${pre}.liq`),
    hf: rd(`${pre}.half`), sl: rd(`${pre}.slope`), lt: rd(`${pre}.lty`), ia: rd(`${pre}.inact`),
  };
}
function loadStore(c: Ch): TileStore {
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(c.t[i]) ?? 0;
    st.flags[i] = c.a[i] ? 1 : 0;
    st.wall[i] = c.w[i];
    st.liquid[i] = c.l[i];
    st.liquidType[i] = c.l[i] > 0 ? c.lt[i] + 1 : 0;
    st.half[i] = c.hf[i];
    st.slope[i] = c.sl[i];
    if (c.ia[i]) st.wire[i] |= 32;
  }
  return st;
}

function compare(js: TileStore, x86: Ch): string {
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
  const pairs = new Map<string, number>();
  const wpairs = new Map<string, number>();
  let firstI = -1;
  const samples: string[] = [];
  for (let i = 0; i < N; i++) {
    const va = x86.a[i]!, ja = js.flags[i]! & 1;
    if (va !== ja) { dA++; firstI ||= i + 1; }
    const vt = va ? x86.t[i]! : 0;
    const jt = ja ? (SHEET[js.type[i]!] >= 0 ? SHEET[js.type[i]!]! : 9999) : 0;
    if (vt !== jt) {
      dT++; firstI ||= i + 1;
      const k = `T${vt}>${jt}`;
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
      if (samples.length < 6) samples.push(`T(${i % W},${(i / W) | 0}) v${vt} j${jt}`);
    }
    if (x86.w[i] !== js.wall[i]) {
      dW++; firstI ||= i + 1;
      const k2 = `W${x86.w[i]}>${js.wall[i]}`;
      wpairs.set(k2, (wpairs.get(k2) ?? 0) + 1);
    }
    if (x86.l[i] !== js.liquid[i]) { dL++; firstI ||= i + 1; }
    if (x86.hf[i] !== js.half[i]) { dHf++; firstI ||= i + 1; }
    if (x86.sl[i] !== js.slope[i]) { dSl++; firstI ||= i + 1; }
    const vl = x86.l[i]! > 0 ? x86.lt[i]! + 1 : 0;
    const jl = js.liquid[i]! > 0 ? js.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; firstI ||= i + 1; }
    const via = x86.ia[i]! ? 1 : 0;
    const jia = (js.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; firstI ||= i + 1; }
  }
  const top = [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, n]) => `${k}×${n}`).join(' ');
  const wtop = [...wpairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([k, n]) => `${k}×${n}`).join(' ');
  return `A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} @(${((firstI - 1) % W)},${(((firstI || 1) - 1) / W) | 0}) ${top} ${samples.join(' | ')} ||W|| ${wtop}`;
}

(RUN ? it : it.skip)('i92 snake solo replay vs dump032', async () => {
  // —— 相 1：捕获生成期 gs 面 ——
  let cap: unknown = null;
  (globalThis as { __swI87Cap?: unknown }).__swI87Cap = (st: unknown, g: unknown) => {
    void st;
    if (!cap) cap = JSON.parse(JSON.stringify({
      crimson: (g as never as { crimson: boolean }).crimson,
      worldSurface: (g as never as { worldSurface: number }).worldSurface,
      genWorldSurfaceHigh: (g as never as { genWorldSurfaceHigh: number }).genWorldSurfaceHigh,
      seedFlags: (g as never as { seedFlags: Record<string, boolean> }).seedFlags,
      dungeonSide: (g as never as { dungeonSide: number }).dungeonSide,
      dungeonLocation: (g as never as { dungeonLocation: number }).dungeonLocation,
      dungeons: ((globalThis as { dualSnapshot?: unknown }).dualSnapshot ?? null),
    }));
  };
  await generateWorld({ width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1, seedFlags: FLAGS });
  const capG = cap as never as {
    crimson: boolean; worldSurface: number; genWorldSurfaceHigh: number;
    dungeonSide: number; dungeonLocation: number; dungeons: unknown;
  };
  console.log(`[i92] captured: side=${capG.dungeonSide} loc=${capG.dungeonLocation} ws=${capG.worldSurface} ${JSON.stringify(dualDungeonState.dungeons.map((d) => ({ s: d.side, l: d.location, th: d.theme })))}`);
  // —— 相 2：真值基座 + 单窗重放 ——
  const base = loadStore(chOf('031_Slush'));
  const truth = chOf('032_Dual_Dungeons_Dither_Snake');
  const rng = new RNG(translateSeed(SEED));
  rng.reseed(translateSeed(SEED));                     // pass 头 RunPass 重播语义
  console.log(`[i92] pre-run1 ddState len=${dualDungeonState.dungeons.length} ndsf=${dualDungeonState.normalizedDistanceSafeFromDither}`);
  runDualDungeonsDitherSnakePass(base, rng, {
    seed: translateSeed(SEED),
    crimson: !!capG.crimson,
    worldSurface: capG.worldSurface,
    genWorldSurfaceHigh: capG.genWorldSurfaceHigh,
    seedFlags: FLAGS,
  } as never as Parameters<typeof runDualDungeonsDitherSnakePass>[2]);
  console.log(`[i92] post-run1 counters=${JSON.stringify(snakeDbg)} ndsfStatic-ok`);
  void snakeDbg;
  console.log(`[i92] snakes=${dualDungeonState.potentialBounds.length}`);
  console.log(`[i92] diff vs dump032: ${compare(base, truth)}`);
  // 导出重放终态（sheet 域 typ + wal/act）供离线形状分析
  const out = '/tmp/iii92-out';
  const sheetTyp = new Uint16Array(N);
  for (let i = 0; i < N; i++) {
    const va = base.flags[i]! & 1;
    sheetTyp[i] = va ? (SHEET[base.type[i]!] >= 0 ? SHEET[base.type[i]!]! : 9999) : 0;
  }
  writeFileSync(`${out}/i92snake.typ`, Buffer.from(sheetTyp.buffer, sheetTyp.byteOffset, N * 2));
  writeFileSync(`${out}/i92snake.wal`, Buffer.from(base.wall.buffer, base.wall.byteOffset, N * 2));
  writeFileSync(`${out}/i92snake.act`, Buffer.from(base.flags.buffer, base.flags.byteOffset, N));
  const geo = calculateSnakeDump();
  writeFileSync(`${out}/i92snake.geo.json`, JSON.stringify(geo));
  function calculateSnakeDump(): unknown {
    return dualDungeonState.dungeons.map((d, k) => {
      const undergroundEnt = !!FLAGS.drunkWorld || !!FLAGS.noSurface;
      const pb = createPotentialDungeonBounds(W, H, capG.worldSurface, capG.genWorldSurfaceHigh, d.side < 0, undergroundEnt);
      return { k, side: d.side, loc: d.location, theme: d.theme, box: pb };
    });
  }
  void createPotentialDungeonBounds;
}, 900_000);

export type { DungeonStyleData };
