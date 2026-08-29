// IIII43 一次性仪⑨：DirtLayerCaves(pass11) 变体账本（rig 窗 11-11 总量=2,991,616）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { tileRunner } from '../src/world/gen/vanilla/TileRunner';

const RUN = process.env.SW_I43I === '1';
const G2 = '/tmp/iii45-out/x86-remix';
const W = 4200, H = 1200, N = W * H;
const rd16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(b.byteOffset), b.byteOffset, b.length >> 1); };
const rd8 = (p: string) => new Uint8Array(readFileSync(p));

(RUN ? it : it.skip)('i43i dirtlayer variants', async () => {
  const t0 = rd16(`${G2}/010_Small_Holes.typ`), a0 = rd8(`${G2}/010_Small_Holes.act`);
  const t1 = rd16(`${G2}/011_Dirt_Layer_Caves.typ`), a1 = rd8(`${G2}/011_Dirt_Layer_Caves.act`);
  const mk = () => {
    const st = new TileStore(W, H);
    for (let i = 0; i < N; i++) { st.type[i] = t0[i]; st.flags[i] = a0[i] ? 1 : 0; }
    return st;
  };
  const gsStub = {
    seedFlags: { remix: true } as Record<string, boolean>,
    worldSurface: 337, rockLevel: 769, waterLine: 929, lavaLine: 418,
    rockLevelLow: 700, rockLevelHigh: 769,
    genWorldSurface: 276.44, genWorldSurfaceHigh: 768.99, genRockLayer: 745.25,
    beachDistance: 250,
  };
  const avoidBeach = 340;
  function seg(st: TileStore, rng: RNG, mode: string): number {
    const area = W * H;
    let cnt = 0;
    const gRoll = globalThis as { __swOnRoll?: (v: number, i: object) => void };
    gRoll.__swOnRoll = () => cnt++;
    const mulM = { d2: 2, none: 1 }[(/nomul/.test(mode) ? 'none' : 'd2')]!;
    let num = Math.trunc(area * 0.00003);
    if (!/nomul/.test(mode)) num = Math.trunc(num * mulM);
    for (let i = 0; i < num; i++) {
      const type = rng.nextInt(6) === 0 ? -2 : -1;
      let x = rng.nextIntRange(0, W);
      let y = rng.nextIntRange(gsStub.worldSurfaceLow, gsStub.rockLevelHigh + 1);
      while (((x < avoidBeach || x > W - avoidBeach) && y < gsStub.genWorldSurfaceHigh)
        || (x >= W * 0.45 && x <= W * 0.55 && y < gsStub.worldSurface)) {
        x = rng.nextIntRange(0, W);
        y = rng.nextIntRange(gsStub.worldSurfaceLow, gsStub.rockLevelHigh + 1);
      }
      const s = rng.nextIntRange(5, 15);
      const t = rng.nextIntRange(30, 200);
      const ss = /noscale/.test(mode) ? s : Math.trunc(s * 1.1);
      const tt = /noscale/.test(mode) ? t : Math.trunc(t * 1.9);
      tileRunner(st, rng, gsStub as never, x, y, { strength: ss, steps: tt, type });
    }
    delete gRoll.__swOnRoll;
    return cnt;
  }
  // 常量校准：worldSurfaceLow 等取自链常量（js 的 floor 版本）
  gsStub.worldSurfaceLow = Math.floor(gsStub.worldSurfaceLow ?? 700);
  console.log('constants check wsLow=', gsStub.worldSurfaceLow);

  for (const mode of ['d2-scale', 'd2-noscale', 'nomul-scale']) {
    const st = mk();
    const rng = new RNG();
    rng.reseed(1138154190);
    void rng.peek?.();
    const consumed = seg(st, rng, mode);
    let d = 0;
    for (let i = 0; i < N; i++) {
      const va = st.flags[i] & 1, vt = va ? st.type[i] : 0;
      const ra = a1[i], rt = ra ? t1[i] : 0;
      if (vt !== rt || va !== ra) d++;
    }
    console.log(`${mode.padEnd(12)} consumed=${consumed} diffVsTruth=${d}`);
  }
  console.log('target rig window=2991616');
}, 900_000);
