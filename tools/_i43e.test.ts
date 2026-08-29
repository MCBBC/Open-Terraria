// IIII43 一次性仪⑤：SandPatches 变体离线重放（以 dump002 真值末态为基座，跑真实
// runSandPatchesPass/tileRunner，比对 dump003 真值 + 掷骰总量账本）。
// 变体经全局钩注入：__swI43NumDiv（num/=K 的 K；缺省走源码常量 4）、
// __swI43Dbl（remix 域双掷开关；缺省 true）。
// 用法：cd game && SW_I43E=1 npx vitest run tools/_i43e.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { runSandPatchesPass } from '../src/world/gen/vanilla/MissingCavesPass';

const RUN = process.env.SW_I43E === '1';
const G2 = '/tmp/iii45-out/x86-remix';
const W = 4200, H = 1200, N = W * H;
const SEED = Number(process.env.SW_I43E_SEED ?? 1138154190);

const rd16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), 0, b.length >> 1); };
const rd8 = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(readFileSync(p).byteOffset));

(RUN ? it : it.skip)('i43e variant replay', async () => {
  const { TILE_DEFS } = await import('../src/data/tiles');
  let sandId = -1;
  for (let i = 0; i < TILE_DEFS.length; i++) if (TILE_DEFS[i]?.vanilla?.sheet === 53) sandId = i;

  const t = rd16(`${G2}/002_Ocean_Sand.typ`), ta = rd8(`${G2}/002_Ocean_Sand.act`);
  const tw = rd8(`${G2}/002_Ocean_Sand.wal`), tl = rd8(`${G2}/002_Ocean_Sand.liq`);
  const th = rd8(`${G2}/002_Ocean_Sand.half`), ts = rd8(`${G2}/002_Ocean_Sand.slope`);
  const tty = rd8(`${G2}/002_Ocean_Sand.lty`), tia = rd8(`${G2}/002_Ocean_Sand.inact`);
  const rT = rd16(`${G2}/003_Sand_Patches.typ`), rA = rd8(`${G2}/003_Sand_Patches.act`);

  let truthSands = 0;
  for (let i = 0; i < N; i++) if (rA[i] && rT[i] === 53 && !(ta[i] && t[i] === 53)) truthSands++;
  console.log(`truth delta-sand cells=${truthSands} SAND internal id=${sandId}`);

  // g 链同源口径：canary 流首值（进入 SandPatches 时 genRand 已重播——首样本必须等于
  // 窗口捕获 js-roll 的第 0 行）
  const canary = Number(readFileSync('/tmp/iii45-out/js-roll-SandPatches.txt', 'utf8').split('\n')[0]);

  const variants: Array<[string, number | undefined, boolean | undefined]> =
    (process.env.SW_I43E_ABS ? Array.from({ length: Number(process.env.SW_I43E_ABS_TO ?? 22) - 13 + 1 }, (_, k) => [`K${k + 13}-dbl`, undefined, undefined] as [string, number | undefined, boolean | undefined]).map((v, k) => {
      const rec = v as [string, number | undefined, boolean | undefined];
      void rec; return v;
    }) : [
      ['v13-dbl', undefined, undefined],
      ['v13-sgl', undefined, false],
      ['v54-dbl', 1, undefined],
      ['v54-sgl', 1, false],
      ['v18-dbl', 3, undefined],
    ]);
  const g = globalThis as Record<string, unknown>;
  let absIdx = 12;
  for (const [name, numDiv, dbl] of variants) {
    g.__swI43NumDiv = numDiv;
    g.__swI43Dbl = dbl;
    if (process.env.SW_I43E_ABS) g.__swI43NumAbs = ++absIdx;
    else g.__swI43NumAbs = undefined;
    const st = new TileStore(W, H);
    for (let i = 0; i < N; i++) {
      st.type[i] = t[i]; st.flags[i] = ta[i] ? 1 : 0; st.wall[i] = tw[i];
      st.liquid[i] = tl[i]; st.half[i] = th[i]; st.slope[i] = ts[i];
      st.liquidType[i] = tty[i]; st.wire[i] = tia[i] ? 32 : 0;
    }
    const gRoll = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
    const rollDump: number[] = [];
    let consumed = 0;
    let first = -1;
    gRoll.__swOnRoll = (v: number) => { if (consumed === 0 && first < 0) first = v; consumed++; rollDump.push(v); };
    const rng = new RNG();
    rng.reseed(SEED);
    try {
      runSandPatchesPass(st, rng as never, makeGs() as never);
    } catch (e) {
      console.log(name, 'ERR', (e as Error).message);
      delete gRoll.__swOnRoll;
      continue;
    }
    delete gRoll.__swOnRoll;
    let diff = 0, sandDiff = 0;
    for (let i = 0; i < N; i++) {
      const va = st.flags[i] & 1, vt = va ? st.type[i] : 0;
      const ra = rA[i], rt = ra ? rT[i] : 0;
      if (vt !== rt || va !== ra) diff++;
      if ((vt === sandId) !== (rt === 53)) sandDiff++;
    }
    console.log(`${name.padEnd(8)} consumed=${consumed} first=${first} fullTypActDiff=${diff} sandMaskDiff=${sandDiff}`);
    writeFileSync(`/tmp/iii45-out/simroll-${name}.txt`, rollDump.join('\n') + '\n');
  }
}, 900_000);

function makeGs(): unknown {
  return {
    w: W, h: H,
    seedFlags: { remix: true },
    worldSurface: 337, rockLevel: 769, waterLine: 929, lavaLine: 418,
    rockLevelLow: 700, rockLevelHigh: 769,
    genWorldSurface: 276.4378, genRockLayer: 745.2543, genWorldSurfaceHigh: 768.99,
    undergroundDesert: null,
    desertHiveLeft: -1,
    remixSurfaceLayerLow: 700, remixSurfaceLayerHigh: 850,
    remixMushroomLayerLow: 850, remixMushroomLayerHigh: 1000,
  };
}
