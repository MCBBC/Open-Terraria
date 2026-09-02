// 尺寸轴收敛（#22）：JS 引擎中/大世界头部 vs 原版服务器锚值。
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_ORACLE === '1';   // ★一次性生成仪(2026-09-02 补门):全管线重活在身,缺省 skip 防默认 sweep 超时;SW_ORACLE=1 启用

(RUN ? it : it.skip)('size axis: JS medium/large vs vanilla anchors', async () => {
  const cases = [
    { seed: '31415926', w: 6400, h: 1800, evil: 0 as const, vGround: 493, vRock: 667, vDungeon: [830, 388], tag: 'medium' },
    { seed: '27182818', w: 8400, h: 2400, evil: 0 as const, vGround: 604, vRock: 916, vDungeon: [7194, 382], tag: 'large' },
  ];
  for (const c of cases) {
    const world = await generateWorld({ width: c.w, height: c.h, seedText: c.seed, evil: c.evil });
    const ws = (world as unknown as { groundLevel?: number }).groundLevel ?? '?';
    const rl = (world as unknown as { rockLevel?: number }).rockLevel ?? '?';
    const dx = (world as unknown as { dungeonX?: number }).dungeonX ?? '?';
    const dy = (world as unknown as { dungeonY?: number }).dungeonY ?? '?';
    console.log(
      `${c.tag}(${c.w}x${c.h}): vanilla(ground=${c.vGround} rock=${c.vRock} dungeon=${c.vDungeon}) ` +
      `js(ground=${ws} rock=${rl} dungeon=${dx},${dy})`,
    );
  }
}, 600000);
