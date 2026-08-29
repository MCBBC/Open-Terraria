// IIII57 半砖差定域仪：全链跑 REMIX 种子，监听 (1891,1025) 邻域的 smoothSlope
// 半砖写入流（__swHalfWatch 由 HalfBrickPass.smoothSlope 消费），定位 #20 Hf=1 的写者。
// 用法：cd game && SW_I59W=1 npx vitest run tools/_i59w.test.ts
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

it.skipIf(process.env.SW_I59W !== '1')('i59w half-watch', async () => {
  const LOG: string[] = [];
  const g = globalThis as unknown as Record<string, unknown>;
  g.__swHalfWatch = (site: string, x: number, y: number) => {
    if (Math.abs(x - 1891) <= 6 && Math.abs(y - 1025) <= 12) {
      LOG.push(`${site} ${x},${y}`);
    }
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1138154190', evil: 0,
      seedFlags: { remix: true },
    } as never);
  } finally {
    delete g.__swHalfWatch;
    console.log(`halfwatch events=${LOG.length}`);
    const counts = new Map<string, number>();
    for (const l of LOG) counts.set(l, (counts.get(l) ?? 0) + 1);
    [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
      .forEach(([k, n]) => console.log(`   ${k} ×${n}`));
  }
}, 600_000);
