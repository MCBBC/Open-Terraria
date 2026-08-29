// IIII43 一次性仪⑧：RockLayerCaves(pass11) 离线变体账本（rig 掷窗总量=2,991,616）。
// 用法：cd game && SW_I43H=1 npx vitest run tools/_i43h.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { tileRunner } from '../src/world/gen/vanilla/TileRunner';

const RUN = process.env.SW_I43H === '1';
const G2 = '/tmp/iii45-out/x86-remix';
const W = 4200, H = 1200, N = W * H;
const rd16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(b.byteOffset), b.byteOffset, b.length >> 1); };
const rd8 = (p: string) => new Uint8Array(readFileSync(p));

(RUN ? it : it.skip)('i43h rocklayer variants', async () => {
  const t11 = rd16(`${G2}/011_Dirt_Layer_Caves.typ`), a11 = rd8(`${G2}/011_Dirt_Layer_Caves.act`);
  const t12 = rd16(`${G2}/012_Rock_Layer_Caves.typ`), a12 = rd8(`${G2}/012_Rock_Layer_Caves.act`);

  const mkStore = () => {
    const st = new TileStore(W, H);
    for (let i = 0; i < N; i++) {
      st.type[i] = t11[i]; st.flags[i] = a11[i] ? 1 : 0;
    }
    return st;
  };
  const gsStub = {
    seedFlags: { remix: true } as Record<string, boolean>,
    worldSurface: 337, rockLevel: 769, waterLine: 929, lavaLine: 418,
    rockLevelLow: 700, rockLevelHigh: 769,
    genWorldSurface: 276.44, genRockLayer: 745.25, genWorldSurfaceHigh: 768.99,
    beachDistance: 250,
    remixSurfaceLayerLow: 700, remixSurfaceLayerHigh: 850,
    undergroundDesert: null,
  };

  function seg(st: TileStore, rng: RNG, mode: string): number {
    const area = W * H;
    let cnt = 0;
    const gRoll = globalThis as { __swOnRoll?: (v: number, i: object) => void };
    gRoll.__swOnRoll = () => cnt++;
    let num = Math.trunc(area * 0.00013);
    if (!/noMul/.test(mode)) num = Math.trunc(num * 1.1);
    for (let i = 0; i < num; i++) {
      const type = rng.nextInt(10) === 0 ? -2 : -1;
      let s2b = rng.nextIntRange(6, 20);
      let s3b = rng.nextIntRange(50, 300);
      const sfac = (/s05/.test(mode) ? 0.5 : /s06/.test(mode) ? 0.6 : /s08/.test(mode) ? 0.8 : /noScale/.test(mode) ? 1 : 0.7);
      s2b = Math.trunc(s2b * sfac);
      s3b = Math.trunc(s3b * sfac);
      tileRunner(st, rng, gsStub as never, rng.nextIntRange(0, W), rng.nextIntRange(gsStub.rockLevelHigh, H), {
        strength: s2b, steps: s3b, type,
      });
    }
    if (!/noExtra/.test(mode)) {
      const count2 = Math.trunc(area * 0.00013 * 0.4);
      for (let j = 0; j < count2; j++) {
        if (gsStub.rockLevelHigh <= H) {
          const type2 = rng.nextInt(10) === 0 ? -2 : -1;
          const q = rng.nextIntRange(7, 25);
          const stp = rng.nextIntRange(50, 199);
          const spX = rng.nextIntRange(100, 220) * 0.1;
          const spY = rng.nextIntRange(-10, 10) * 0.02;
          const x2 = rng.nextIntRange(0, W);
          const y2 = rng.nextIntRange(gsStub.rockLevelHigh, H);
          tileRunner(st, rng, gsStub as never, x2, y2, { strength: q, steps: stp, type: type2, speedX: spX, speedY: spY, noYChange: true });
          tileRunner(st, rng, gsStub as never, x2, y2, { strength: q, steps: stp, type: type2, speedX: -spX, speedY: -spY, noYChange: true });
        }
      }
    }
    delete gRoll.__swOnRoll;
    return cnt;
  }

  const truthDiff = (() => {
    let d = 0;
    for (let i = 0; i < N; i++) {
      const va = a11[i] ? 1 : 0, vt = va ? t11[i] : 0;
      const ra = a12[i], rt = ra ? t12[i] : 0;
      if (vt !== rt || va !== ra) d++;
    }
    return d;
  })();
  console.log(`truth delta(011→012): ${truthDiff}`);

  for (const mode of ['cs-s05','cs-s06','cs-s08']) {
    const st = mkStore();
    const rng = new RNG();
    rng.reseed(1138154190);
    // canary：进入本段时的首样本须与 pipline 一致（用于确认种子域正确）
    void rng.peek?.();
    const consumed = seg(st, rng, mode);
    let d = 0;
    for (let i = 0; i < N; i++) {
      const va = st.flags[i] & 1, vt = va ? st.type[i] : 0;
      const ra = a12[i], rt = ra ? t12[i] : 0;
      if (vt !== rt || va !== ra) d++;
    }
    console.log(`${mode.padEnd(12)} consumed=${consumed} diffVsTruth=${d}`);
  }
  // 分段账本：主循环(scaled)/附加环 成本拆解（一次跑完统计各自消耗）
  {
    const st = mkStore();
    const rng = new RNG();
    rng.reseed(1138154190);
    let phase = 'main';
    let mainCnt = 0, extraCnt = 0;
    const gRoll = globalThis as { __swOnRoll?: (v: number, i: object) => void };
    gRoll.__swOnRoll = () => { if (phase === 'main') mainCnt++; else extraCnt++; };
    const area = W * H;
    let num = Math.trunc(area * 0.00013 * 1.1);
    for (let i = 0; i < num; i++) {
      const type = rng.nextInt(10) === 0 ? -2 : -1;
      let s2b = rng.nextIntRange(6, 20);
      let s3b = rng.nextIntRange(50, 300);
      s2b = Math.trunc(s2b * 0.7); s3b = Math.trunc(s3b * 0.7);
      tileRunner(st, rng, gsStub as never, rng.nextIntRange(0, W), rng.nextIntRange(gsStub.rockLevelHigh, H), { strength: s2b, steps: s3b, type });
    }
    phase = 'extra';
    for (let j = 0; j < Math.trunc(area * 0.00013 * 0.4); j++) {
      const type2 = rng.nextInt(10) === 0 ? -2 : -1;
      const q = rng.nextIntRange(7, 25);
      const stp = rng.nextIntRange(50, 199);
      const spX = rng.nextIntRange(100, 220) * 0.1;
      const spY = rng.nextIntRange(-10, 10) * 0.02;
      const x2 = rng.nextIntRange(0, W);
      const y2 = rng.nextIntRange(gsStub.rockLevelHigh, H);
      tileRunner(st, rng, gsStub as never, x2, y2, { strength: q, steps: stp, type: type2, speedX: spX, speedY: spY, noYChange: true });
      tileRunner(st, rng, gsStub as never, x2, y2, { strength: q, steps: stp, type: type2, speedX: -spX, speedY: -spY, noYChange: true });
    }
    delete gRoll.__swOnRoll;
    console.log(`segmented: main=${mainCnt} extra=${extraCnt}`);
    // 追加：附加环「scaled 尺寸」与「单发」成本测量（新实例同种子）
    {
      const st2 = mkStore();
      const rng2 = new RNG();
      rng2.reseed(1138154190);
      let phase2 = 'other';
      let scCnt = 0;
      const gRoll2 = globalThis as { __swOnRoll?: (v: number, i: object) => void };
      gRoll2.__swOnRoll = () => { if (phase2 === 'sc') scCnt++; };
      // 跳过主循环以对齐流位
      phase2 = 'skip';
      for (let i = 0; i < Math.trunc(W * H * 0.00013 * 1.1); i++) {
        rng2.nextInt(10);
        const a2 = rng2.nextIntRange(6, 20);
        const b2 = rng2.nextIntRange(50, 300);
        void a2; void b2;
        const xa = rng2.nextIntRange(0, W);
        const ya = rng2.nextIntRange(gsStub.rockLevelHigh, H);
        void xa; void ya;
        tileRunner(st2, rng2, gsStub as never, 4201, 4000, { strength: 1, steps: 1, type: -1 });
      }
      phase2 = 'sc';
      for (let j = 0; j < Math.trunc(W * H * 0.00013 * 0.4); j++) {
        const type2 = rng2.nextInt(10) === 0 ? -2 : -1;
        const q = Math.trunc(rng2.nextIntRange(7, 25) * 0.7);
        const stp = Math.trunc(rng2.nextIntRange(50, 199) * 0.7);
        const spX = rng2.nextIntRange(100, 220) * 0.1;
        const spY = rng2.nextIntRange(-10, 10) * 0.02;
        const x2 = rng2.nextIntRange(0, W);
        const y2 = rng2.nextIntRange(gsStub.rockLevelHigh, H);
        tileRunner(st2, rng2, gsStub as never, x2, y2, { strength: q, steps: stp, type: type2, speedX: spX, speedY: spY, noYChange: true });
        tileRunner(st2, rng2, gsStub as never, x2, y2, { strength: q, steps: stp, type: type2, speedX: -spX, speedY: -spY, noYChange: true });
      }
      delete gRoll2.__swOnRoll;
      console.log(`scaledExtra consumed=${scCnt}`);
    }
  }
}, 900_000);
