// 2026-08-13 遗留清账回归：萤火虫成群附加（fireFlyMultiple 侧信道）+ 地下仙女链
//   ① 敌路萤火虫 :4413-4433：主只 355 后四向各 1/fireFlyMultiple 附加入队
//   ② 地下仙女 :3524-3532：fairyLog + RollLuck(500·hardMode×1.66) + 深度窗 +
//     AnyHelpfulFairies 门 → 583-585（ai2=2）
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';

describe('萤火虫成群 + 地下仙女链', () => {
  it('主只 355 + 四向附加；fairyLog 仙女命中与 HelpfulFairies 关门', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: 'ff-fairy-7', evil: 0 });
    const st = world.store;
    const spawner = new VanillaSpawner(world);

    // ---- ① 萤火虫：夜 + 草面 + fireFlyChance=1（必中）+ multiple=1（四附加全中）----
    world.clock.timeOfDay = 0;   // 午夜（isDay 由 timeOfDay 派生只读）
    world.fireFlyChance = 1;
    world.fireFlyMultiple = 1;
    world.weather.raining = false;
    world.weather.windSpeedTarget = 0;
    spawner.setPlayerFlags(false, false);
    // 找地表草面干燥落脚点（空气×2 + 实心底 + 草）
    let spot: { x: number; y: number } | null = null;
    for (let x = 600; x < st.w - 600 && !spot; x += 13) {
      for (let y = 20; y < Math.floor(world.groundLevel); y++) {
        const g = st.type[st.idx(x, y)];
        const grass = g === (await import('../src/data/tiles')).TILE_BY_KEY['grass'];
        if (!grass || st.isSolid(x, y - 1) || st.isSolid(x, y - 2)) continue;
        if (st.liquid[st.idx(x, y - 1)] > 0) continue;
        spot = { x, y };
        break;
      }
    }
    expect(spot).not.toBeNull();
    let main = 0;
    spawner.pendingCritterExtras.length = 0;
    for (let k = 0; k < 50 && main === 0; k++) {
      const e = spawner.spawn((spot!.x + 0.5) * 16, (spot!.y - 3) * 16, new RNG(k * 7919 + 3), 30, 18);
      if (e && e.vanillaId === 355) main++;
    }
    expect(main).toBe(1);
    // multiple=1 → 四向附加全部入队（{-16,0},{16,0},{0,-16},{0,16}）
    expect(spawner.pendingCritterExtras.length).toBe(4);
    expect(spawner.pendingCritterExtras.every((ex) => ex.npc === 355)).toBe(true);

    // ---- ② 地下仙女：fairyLog + 深度窗内 → 583/584/585（ai2=2）----
    (spawner as unknown as { playerLuck: number }).playerLuck = 0.5;
    world.fairyLog = true;
    const fairyY = Math.floor((world.groundLevel + world.rockLevel) / 2) + 40;
    let fairies = 0;
    let ai2ok = true;
    for (let k = 0; k < 3000; k++) {
      const e = spawner.spawn(2000 * 16, fairyY * 16, new RNG(k * 7919 + 11), 30, 18);
      if (e && e.vanillaId !== null && e.vanillaId >= 583 && e.vanillaId <= 585) {
        fairies++;
        if (e.ai2 !== 2) { ai2ok = false; console.log('ai2=', e.ai2, 'id=', e.vanillaId); }
      }
    }
    console.log('fairies hit:', fairies);
    expect(fairies).toBeGreaterThan(0);   // luck 0.99 + 1/500 掷 → 数百次内必中
    expect(ai2ok).toBe(true);
    // AnyHelpfulFairies 门：喂入 true → 链绝迹
    spawner.fairyHelpfulActive = true;
    let fairies2 = 0;
    for (let k = 0; k < 3000; k++) {
      const e = spawner.spawn(2000 * 16, fairyY * 16, new RNG(k * 7919 + 11), 30, 18);
      if (e && e.vanillaId !== null && e.vanillaId >= 583 && e.vanillaId <= 585) fairies2++;
    }
    expect(fairies2).toBe(0);
    // fairyLog=false → 同样绝迹
    spawner.fairyHelpfulActive = false;
    world.fairyLog = false;
    let fairies3 = 0;
    for (let k = 0; k < 3000; k++) {
      const e = spawner.spawn(2000 * 16, fairyY * 16, new RNG(k * 7919 + 11), 30, 18);
      if (e && e.vanillaId !== null && e.vanillaId >= 583 && e.vanillaId <= 585) fairies3++;
    }
    expect(fairies3).toBe(0);
  }, 300000);
});
