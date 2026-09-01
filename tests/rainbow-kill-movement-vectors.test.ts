// 终零波批：79 彩虹魔杖 Kill 双掷 RainbowRodHit 编排的 MovementVector 载荷钉
// （P.cs:72486-72496——for num70∈{0,0.25} step .25：UnitX.RotatedBy(num70·2π)×16
// → (16,0)/(0,16)；此前本地直调缺省 0 = 两组编排完全同参）。
// 同时钉原版 clientOnly:true 面（Kill 掷不上网——broadcast 零调用）。
import { describe, it, expect, vi } from 'vitest';
import { Enemy } from '../src/entities/Enemy';   // 断环先例（chester-pet 头注同）

type HitRec = { mx: number; my: number };
const hitLog: HitRec[] = [];

/** 只替换 rainbowRodHitFx 为记录包装器（内部转调真本体,视觉面不变），其余逐字透传 */
vi.mock('../src/fx/orchestraFx', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/fx/orchestraFx')>();
  const wrapped = ((game: unknown, x: number, y: number, mx = 0, my = 0,
    rng: () => number = Math.random) => {
    hitLog.push({ mx, my });
    return (real as { rainbowRodHitFx: (...a: unknown[]) => void })
      .rainbowRodHitFx(game, x, y, mx, my, rng);
  }) as typeof real.rainbowRodHitFx;
  return {
    ...real,
    rainbowRodHitFx: wrapped,
    __hitLog: () => hitLog,
  };
});

import { MagicMissileProj } from '../src/entities/MissileProj';

function mk79(x = 40 * 16, y = 40 * 16): { m: MagicMissileProj; bcast: Array<unknown[]>; hooks: object } {
  // 最小 GameHooks 面（killNow 路径只消费 enemies/playSfxFiles/spawnDust/
  // broadcastParticleOrchestra/onProjectileDeath + vanillaDust）
  const bcast: Array<unknown[]> = [];
  const hooks = {
    enemies: (): unknown[] => [],
    playSfxFiles: () => {},
    playSfx: () => {},
    spawnDust: undefined,
    broadcastParticleOrchestra: (...a: unknown[]) => { bcast.push(a); },
    onProjectileDeath: undefined,
  };
  const m = new MagicMissileProj(x, y, 6, 0, {
    projId: 79, damage: 60, knockback: 4, useTime: 20,
    channelCb: () => false, aimCb: () => ({ x: x + 100, y }),
    payMana: () => true,
  });
  return { m, bcast, hooks };
}

describe('终零波：79 Kill RainbowRodHit ×2 载荷（MovementVector=(16,0)/(0,16)+clientOnly 不上网）', () => {
  it('双掷 movement 向量按 RotatedBy 步进序列入参；Kill 段零广播', () => {
    try {
      const { m, bcast, hooks } = mk79();
      // 直注 12 点尾迹（oldPos 环满语义;killNow 迭代面只读 trail）
      const t = (m as unknown as { trail: number[] }).trail;
      for (let i = 0; i < 12; i++) t.push(m.cx - i * 6, m.cy);
      (m as unknown as { killNow(g: never): void }).killNow(hooks as never);
      expect((m as unknown as { dead: boolean }).dead).toBe(true);
      // 命中:两次直调,载荷 = (16,0) 然后 RotatedBy(π/2)→(0,16)
      expect(hitLog.slice(-2)).toEqual([{ mx: 16, my: 0 }, { mx: 0, my: 16 }]);
      // 原版 clientOnly:true（P.cs:72489）——Kill 掷不走 module8
      expect(bcast.length).toBe(0);
      // 对照锚：命中路径的 broadcast 是 hitStep 的 79 支（clientOnly:false P.cs:14299),
      // 本文件仅验 Kill 面。若未来有人把 Kill 双掷改走 broadcast,此断言即红。
    } finally {
      hitLog.length = 0;
    }
  });
});
