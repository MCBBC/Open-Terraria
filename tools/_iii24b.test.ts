// IIII24 批诊断 b：跑一遍管线，把槽末#57/#58 的关键通道落盘为裸二进制，
// 供离线分析脚本（node tools/_xxx.mjs 或独立 node）反复查询，不重复生成。
// 用法：cd game && SW_III24B=1 npx vitest run tools/_iii24b.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_III24B === '1';
const SEED = process.env.SW_III24_SEED ?? '1372357239';
const OUT = process.env.SW_III24_OUT ?? '/tmp/iii24-out';

(RUN ? it : it.skip)('dump js snapshots', async () => {
  const snaps: Record<number, unknown> = {};
  await generateWorld({
    width: 4200, height: 1200, seedText: SEED, evil: -1 as const,
    seedFlags: { notTheBees: true },
    onWorldPartial: (w, i) => { if (i === 57 || i === 58) snaps[i] = w.store; },
  });
  for (const [k, s] of Object.entries(snaps)) {
    const st = s as Record<string, Uint8Array | Uint16Array>;
    for (const ch of ['type', 'flags', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'frameX', 'frameY'] as const) {
      writeFileSync(`${OUT}/js${k}_${ch}.bin`, Buffer.from(st[ch]!.buffer, st[ch]!.byteOffset, st[ch]!.byteLength));
    }
  }
  console.log('snapshots written');
}, 900_000);
