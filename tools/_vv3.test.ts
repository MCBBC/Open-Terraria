// VVVVV：SSSSS 式基座重捕获（Traps 入口='倒木水景'槽末）——VVVVV 修后新鲜帧。
// 用法：cd game && SW_VV3=1 SW_VV3_KEY=vv12345 SW_VV3_SEED=12345 SW_VV3_EVIL=1 \
//   SW_VV3_W=4200 SW_VV3_H=1200 npx vitest run tools/_vv3.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { snapshotGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_VV3 === '1';
const KEY = process.env.SW_VV3_KEY ?? 'vvm';
const SEED = Number(process.env.SW_VV3_SEED ?? 20260811);
const EVIL = (process.env.SW_VV3_EVIL ?? '0') as -1 | 0 | 1;
const W = Number(process.env.SW_VV3_W ?? 6400), H = Number(process.env.SW_VV3_H ?? 1800);

function serGs(gs: unknown): unknown {
  if (gs === null || typeof gs !== 'object') return gs;
  if (gs instanceof Int32Array || gs instanceof Uint8Array || gs instanceof Float32Array) return Array.from(gs);
  if (Array.isArray(gs)) return gs.map(serGs);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(gs as Record<string, unknown>)) out[k] = serGs((gs as Record<string, unknown>)[k]);
  return out;
}

it('capture', async () => {
  if (!RUN) return;
  const dir = `/tmp/ss-b/${KEY}`;
  mkdirSync(dir, { recursive: true });
  await generateWorld({
    width: W, height: H, seedText: String(SEED), evil: EVIL,
    onWorldPartial: (world, _i, name) => {
      if (name !== '倒木水景') return;
      const st = world.store;
      writeFileSync(`${dir}/type.bin`, Buffer.from(st.type.buffer));
      writeFileSync(`${dir}/flags.bin`, Buffer.from(st.flags.buffer));
      writeFileSync(`${dir}/frameX.bin`, Buffer.from(st.frameX.buffer));
      writeFileSync(`${dir}/frameY.bin`, Buffer.from(st.frameY.buffer));
      writeFileSync(`${dir}/wall.bin`, Buffer.from(st.wall.buffer));
      writeFileSync(`${dir}/liquid.bin`, Buffer.from(st.liquid.buffer));
      writeFileSync(`${dir}/liquidType.bin`, Buffer.from(st.liquidType.buffer));
      writeFileSync(`${dir}/half.bin`, Buffer.from(st.half.buffer));
      writeFileSync(`${dir}/slope.bin`, Buffer.from(st.slope.buffer));
      writeFileSync(`${dir}/wire.bin`, Buffer.from(st.wire.buffer));
      writeFileSync(`${dir}/paint.bin`, Buffer.from(st.paint.buffer));
      writeFileSync(`${dir}/paintWall.bin`, Buffer.from(st.paintWall.buffer));
      writeFileSync(`${dir}/gs.json`, JSON.stringify(serGs(lastGenState())));
      writeFileSync(`${dir}/gensolid.json`, JSON.stringify([...snapshotGenSolid().entries()]));
      writeFileSync(`${dir}/chests.json`, JSON.stringify(world.chests.map((c) => ({ x: c.x, y: c.y, items: c.items }))));
      console.log(`[vv3] captured ${dir}`);
    },
  });
  console.log('done');
}, 3600000);
