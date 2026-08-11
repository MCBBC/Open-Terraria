// 逐 pass 网格哈希检查点（种子等价 L1 工具）：
// generateWorld 的 onWorldPartial 在每个 pass 后回调——对 type/flags/wall/liquid
// 四数组做 FNV-1a，输出「pass 名 → 哈希」清单。C# oracle 逐段延伸后，
// 本清单与 oracle 各段哈希逐项比对即可二分定位首个分歧 pass。
// 跑法：npx vitest run tests/pass-hash.test.ts（控制台输出哈希表）
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

export function fnv1a(arr: ArrayLike<number>, mod = 2 ** 32): string {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < arr.length; i++) {
    h ^= arr[i] & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (arr[i] >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    // Uint16Array 上 16 位全吃；Uint8Array 高 8 位自然为 0
  }
  return h.toString(16).padStart(8, '0');
}

describe('逐 pass 网格哈希检查点', () => {
  it('种子 9293480：每 pass 后 type/flags/wall/liquid FNV 哈希', async () => {
    const checkpoints: Array<{ pass: string; hash: string }> = [];
    const world = await generateWorld({
      width: 4200, height: 1200, seedText: '9293480', evil: 0,
      onWorldPartial: (w, _idx, name) => {
        const st = w.store;
        checkpoints.push({
          pass: name,
          hash: [fnv1a(st.type), fnv1a(st.flags), fnv1a(st.wall), fnv1a(st.liquid)].join(' '),
        });
      },
    });
    const st = world.store;
    checkpoints.push({ pass: 'finalize', hash: [fnv1a(st.type), fnv1a(st.flags), fnv1a(st.wall), fnv1a(st.liquid)].join(' ') });
    for (const c of checkpoints) console.log(`${c.pass.padEnd(6, '　')} ${c.hash}`);
    expect(checkpoints.length).toBeGreaterThan(10);
  }, 600000);
});
