// 一次性诊断（III13 批）：notraps 槽末#31（Traps 出口）10 通道 dump——用于在
// 上游并行车道噪声下做【62 残差坐标定点对拍】（隔离本批修复的净效应）。
import { it } from 'vitest';
import { mkdirSync, openSync, writeSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';

it('iii13d slot31 dump', { timeout: 900_000 }, async () => {
  const OUT = process.env.SW_I13D_OUT ?? '/tmp/iii13-out/jslot31-fixed';
  if (process.env.SW_I13D !== '1') return;
  mkdirSync(OUT, { recursive: true });
  await generateWorld({
    width: 4200, height: 1200, seedText: '1896728457',
    evil: 1 as -1 | 0 | 1, seedFlags: { noTraps: true },
    onWorldPartial: (w, _i, pn) => {
      if (pn !== '地表装饰') return;
      const st = w.store as never as Record<string, ArrayBufferView>;
      for (const chn of ['type', 'flags', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'frameX', 'frameY'] as const) {
        const arr = st[chn]!;
        writeSync(openSync(`${OUT}/${chn}`, 'w'), Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
      }
    },
  });
  // 导出 GenVars 元数据（供 _iii13f 隔离重放复现管线口径）
  const g = lastGenState()!;
  if (!g) throw new Error('no gen state');
  const meta = {
    worldSurface: Math.round(g.worldSurface), rockLevel: Math.round(g.rockLevel),
    lavaLine: Math.round(g.lavaLine), beachDistance: g.beachDistance,
    dungeonSide: g.dungeonSide,
    seedFlags: JSON.parse(JSON.stringify(g.seedFlags)),
  };
  writeSync(openSync(`${OUT}/meta.json`, 'w'), JSON.stringify(meta));
}, 900_000);
