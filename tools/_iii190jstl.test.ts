// IIII190 一次性取证仪（配对仪）：JS 侧逐 pass 时间线，对 c190-<chain>.json 残余格逐 pass
// 采样 (act, sheet, fx, fy)，与 x86 侧时间线并排 → 「JS 帧在写面之前就已差」vs
// 「JS 写面清帧」二择一定谳。
// 用法：cd game && SW_I190TL_CHAIN=jagged npx vitest run tools/_iii190jstl.test.ts
// 产物：/tmp/iii190-out/jstl-<TAG>.json（cells: {x,y,t,xfx,xfy,act,timeline,passes}）
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const HOME = process.env.HOME ?? '';
const CHAIN = process.env.SW_I190TL_CHAIN ?? 'jagged';
const TAG = process.env.SW_I190TL_TAG ?? CHAIN;
const OUT = process.env.SW_I190_OUT ?? '/tmp/iii190-out';
const SRC = `${OUT}/c190-${CHAIN}.json`;

interface Cfg { seed: string; evil: -1 | 0 | 1; flags?: Record<string, boolean>; w?: number; h?: number }
const C = (...p: string[]): string => `${HOME}/GoldenChains/${p.join('/')}`;
const CHAINS: Record<string, Cfg> = {
  g: { seed: '9293480', evil: 0 },
  s22222: { seed: '22222', evil: 1 },
  m: { seed: '20260811', evil: 0, w: 6400, h: 1800 },
  const: { seed: '1321365005', evil: -1, flags: { theConstant: true } },
  ntb: { seed: '1372357239', evil: -1, flags: { notTheBees: true } },
  notraps: { seed: '1896728457', evil: 1, flags: { noTraps: true } },
  c12345: { seed: '12345', evil: 1 },
  skyblock: { seed: '20260829', evil: 1, flags: { skyblock: true } },
  drunk: { seed: '51620200', evil: -1, flags: { drunkWorld: true } },
  celeb: { seed: '1999040562', evil: 0, flags: { tenthAnniversary: true } },
  toadstool: { seed: '771002', evil: 0, flags: { surfaceIsMushrooms: true } },
  fishmox: { seed: '771003', evil: 0, flags: { noInfection: true } },
  ftw: { seed: '1671560105', evil: 0, flags: { getGoodWorld: true } },
  pumpkin: { seed: 'pumpkinseason|20260904', evil: 0, flags: {} },
  jagged: { seed: '771005', evil: 0, flags: { digExtraHoles: true } },
  xrayvision: { seed: 'xrayvision|106107', evil: 0 },
  monochrome: { seed: 'monochrome|106108', evil: 0 },
  waterpark: { seed: 'waterpark|20260905', evil: 0, flags: { extraLiquid: true } },
  remix: { seed: '1138154190', evil: -1, flags: { remix: true } },
  planetoids: { seed: 'planetoids|20260908', evil: 0, flags: { roundLandmasses: true } },
  sgis: { seed: '771001', evil: 0, flags: { surfaceIsInSpace: true } },
  arachno: { seed: 'arachnophobia|20260904', evil: 0 },
};

it('iii190 js-side pass timeline', async () => {
  const cfg = CHAINS[CHAIN];
  if (!cfg) throw new Error(`unknown chain ${CHAIN}`);
  const src = JSON.parse(readFileSync(SRC, 'utf8')) as {
    W: number; cells: Array<{ x: number; y: number; t: number; xfx: number; xfy: number; act: number }>;
  };
  const W = src.W;
  const cells = src.cells;
  const passNames: string[] = [];
  const timelines: number[][][] = cells.map(() => []);
  const world = await generateWorld({
    width: W, height: cfg.h ?? 1200, seedText: cfg.seed, evil: cfg.evil,
    seedFlags: cfg.flags,
    onWorldPartial: (w2, _pi, name) => {
      passNames.push(name);
      const st = w2.store;
      for (let ci = 0; ci < cells.length; ci++) {
        const c = cells[ci]!;
        const i = c.y * W + c.x;
        const sheet = TILE_DEFS[st.type[i]!]?.vanilla?.sheet ?? -1;
        timelines[ci]!.push([st.flags[i]!, sheet, st.frameX[i]!, st.frameY[i]!]);
      }
    },
  });
  // finalize 后终态（onWorldPartial 不含 finalize 尾）
  const st = world.store;
  const fin = cells.map((c) => {
    const i = c.y * W + c.x;
    return [st.flags[i]!, TILE_DEFS[st.type[i]!]?.vanilla?.sheet ?? -1, st.frameX[i]!, st.frameY[i]!];
  });
  writeFileSync(`${OUT}/jstl-${TAG}.json`, JSON.stringify({
    chain: CHAIN, tag: TAG, W, passes: passNames, cells: src.cells, timelines, final: fin,
  }));
  console.log(`[iii190jstl ${TAG}] passes=${passNames.length} cells=${cells.length}`);
}, 600_000);
