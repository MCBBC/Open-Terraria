// 临时:沉降 A/B 闸门(冻结输入法)——绕开并行会话对 worldgen 的实时改动:
// 步骤 1(SETTLE_SNAPSHOT 环境变量存在时):生成世界并把液体系数组快照落盘 /tmp;
// 步骤 2(默认):从快照重建 World,只跑 settleWorldLiquids('gen'),输出四数组哈希。
// 对同一快照分别跑"优化前/优化后"代码,哈希相同 ⇔ 优化逐字节等价。
import { describe, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { World } from '../src/world/World';
import { settleWorldLiquids } from '../src/world/liquid/settle';

const SNAP = '/tmp/settle-snapshot.json';
const SEED = '9293480';

function fnv1a(u8: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

interface Snap {
  w: number; h: number; seed: number; name: string;
  groundLevel: number; rockLevel: number; lavaLine: number;
  shimmerX: number; shimmerY: number;
  type: number[]; flags: number[]; wall: number[];
  liquid: number[]; liquidType: number[]; half: number[]; slope: number[];
}

describe('沉降 A/B(冻结输入)', () => {
  it(process.env.SETTLE_SNAPSHOT ? '落快照' : '快照沉降', async () => {
    if (process.env.SETTLE_SNAPSHOT) {
      const world = await generateWorld({ width: 4200, height: 1200, seedText: SEED, name: 'snap', evil: -1 }, () => {});
      const st = world.store;
      const snap: Snap = {
        w: st.w, h: st.h, seed: world.seed, name: world.name,
        groundLevel: world.groundLevel, rockLevel: world.rockLevel, lavaLine: world.lavaLine,
        shimmerX: world.shimmerX, shimmerY: world.shimmerY,
        type: Array.from(st.type), flags: Array.from(st.flags), wall: Array.from(st.wall),
        liquid: Array.from(st.liquid), liquidType: Array.from(st.liquidType),
        half: Array.from(st.half), slope: Array.from(st.slope),
      };
      writeFileSync(SNAP, JSON.stringify(snap));
      console.log(`SNAP written (${snap.liquid.length} cells)`);
      return;
    }
    if (!existsSync(SNAP)) throw new Error('missing snapshot; run with SETTLE_SNAPSHOT=1 first');
    const s = JSON.parse(readFileSync(SNAP, 'utf8')) as Snap;
    const world = new World(s.w, s.h, s.seed, s.name);
    world.groundLevel = s.groundLevel; world.rockLevel = s.rockLevel; world.lavaLine = s.lavaLine;
    world.shimmerX = s.shimmerX; world.shimmerY = s.shimmerY;
    const st = world.store;
    st.type.set(s.type); st.flags.set(s.flags); st.wall.set(s.wall);
    st.liquid.set(s.liquid); st.liquidType.set(s.liquidType);
    st.half.set(s.half); st.slope.set(s.slope);
    const t0 = performance.now();
    await settleWorldLiquids(world, 'gen');
    const ms = Math.round(performance.now() - t0);
    const hash = [st.liquid, st.liquidType, st.type, st.flags].map((a) =>
      fnv1a(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))).join(' ');
    console.log(`SETTLE_AB ms=${ms} hash=${hash}`);
  }, 900000);
});
