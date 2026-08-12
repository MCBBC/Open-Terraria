// 临时:液体沉降性能剖析 + G1 基线哈希(优化后比对;终验后删除本文件)
// 全量生成会跑完整管线(含中途沉降),再补一次收尾沉降(与 worker 同路径)。
// 输出格式固定,基线存档见本文件 git 外记录。
import { describe, it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { settleWorldLiquids } from '../src/world/liquid/settle';

function fnv1a(u8: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < u8.length; i++) {
    h ^= u8[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const SEEDS = [9293480, 12345, 777];

describe('沉降剖析(临时)', () => {
  for (const seed of SEEDS) {
    it(`种子 ${seed}`, async () => {
      const t0 = performance.now();
      const world = await generateWorld({ width: 4200, height: 1200, seedText: String(seed), name: 'bench', evil: -1 }, () => {});
      const genMs = performance.now() - t0;
      const t1 = performance.now();
      await settleWorldLiquids(world, 'gen');
      const settleMs = performance.now() - t1;
      const st = world.store;
      const hash = [
        fnv1a(new Uint8Array(st.liquid.buffer, st.liquid.byteOffset, st.liquid.length)),
        fnv1a(new Uint8Array(st.liquidType.buffer, st.liquidType.byteOffset, st.liquidType.length)),
        fnv1a(new Uint8Array(st.type.buffer, st.type.byteOffset, st.type.length)),
        fnv1a(new Uint8Array(st.flags.buffer, st.flags.byteOffset, st.flags.length)),
      ].join(' ');
      console.log(`BENCH seed=${seed} genMs=${Math.round(genMs)} settleMs=${Math.round(settleMs)} hash=${hash}`);
    }, 900000);
  }
});
