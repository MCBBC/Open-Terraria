// OOOOOOO 批·③：DeadMans 候选门逐格复算（快照重放）——对拍 x86 dmlog。
// 用法: SW_O2=1 npx vitest run tools/_ooo2.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { DeadMansChestBiome } from '../src/world/gen/vanilla/MicroBiomesPass';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_O2 === '1';
const SEED = process.env.SW_O2_SEED ?? '9293480';
const DIR = `/tmp/ooo-out/mb-${SEED}`;
const W = 4200, H = 1200;
const DISPUTED = new Set(['3745,785', '2847,376', '3526,502']);

(RUN ? it : it.skip)('ooo2 DeadMans per-candidate gates', async () => {
  const st = new TileStore(W, H);
  {
    const ld = (n: string) => new Uint8Array(readFileSync(`${DIR}/${n}`).buffer.slice(0));
    const ld16 = (n: string) => new Uint16Array(readFileSync(`${DIR}/${n}`).buffer.slice(0));
    st.type.set(ld16('type.bin')); st.flags.set(ld('flags.bin')); st.wall.set(ld16('wall.bin'));
    st.liquid.set(ld('liquid.bin')); st.liquidType.set(ld('liquidType.bin'));
    st.half.set(ld('half.bin')); st.slope.set(ld('slope.bin'));
    st.frameX.set(ld16('frameX.bin')); st.frameY.set(ld16('frameY.bin'));
    st.wire.set(ld('wire.bin')); st.paint.set(ld('paint.bin'));
  }
  const gs = JSON.parse(readFileSync(`${DIR}/gs.json`, 'utf8')) as GenState;
  const chests = JSON.parse(readFileSync(`${DIR}/chests.json`, 'utf8')) as
    Array<{ x: number; y: number; items: unknown }>;
  __setGenStateForProbe(gs);
  // 对每个争议坐标：确认 sink 中是否存在
  const lines: string[] = [];
  lines.push(`sink size=${chests.length}`);
  for (const key of DISPUTED) {
    const [x, y] = key.split(',').map(Number);
    const hit = chests.find(c => c.x === x && c.y === y);
    lines.push(`disputed ${key} in-sink=${!!hit}`);
  }
  // 全候选复算：遍历 sink，逐门评估
  const biome = new DeadMansChestBiome(st, {} as never, gs, chests);
  // @ts-expect-error 私有访问
  const isGood = biome.isAGoodSpot.bind(biome);
  const SHEETCHEST = 21;
  const out: Array<{ x: number; y: number }> = [];
  for (const ch of chests) {
    const { x, y } = ch;
    if (!st.inBounds(x, y)) continue;
    const i = st.idx(x, y);
    const isGold = st.type[i] === TILE_CHEST && st.frameY[i] === 0
      && st.frameX[i] % 36 === 0 && Math.trunc(st.frameX[i] / 36) === 1;
    if (!isGold && !DISPUTED.has(`${x},${y}`)) continue;
    if (isGold) {
      const good = isGood(x, y);
      if (good || DISPUTED.has(`${x},${y}`)) lines.push(`cand ${x},${y} isGood=${good}`);
      if (good) out.push({ x, y });
    }
  }
  lines.push(`final good=${out.length}: ${out.map(o => o.x + ',' + o.y).join(' ')}`);
  __setGenStateForProbe(null);
  writeFileSync('/tmp/ooo-out/dmcands-js.txt', lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}, 300_000);

import { TILE_BY_KEY } from '../src/data/tiles';
const TILE_CHEST = TILE_BY_KEY['chest']!;
