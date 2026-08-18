// PPPP 一次性冒烟：全量生成计时（EEEE 死循环铁律：改 pass 后先跑全量再验证）
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
const RUN = process.env.SW_PPPPSMOKE === '1';
(RUN ? it : it.skip)('fullgen smoke', async () => {
  for (const [seed, evil] of [['9293480', 0], ['12345', 1]] as Array<[string, number]>) {
    const t0 = Date.now();
    await generateWorld({ width: 4200, height: 1200, seedText: seed, evil: evil as -1 | 0 | 1 });
    console.log(`SMOKE ${seed}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
}, 900_000);
