// 蜂巢链路测试：
// 1) breakHiveBlock（KillTile case 225 语义：1/3 流蜜 / 掉物+1/2 出 1-2 蜂）
// 2) larvaSummonInRange（4800px 曼哈顿门槛）
// 3) 蜂蜜液体破底流动（LiquidSim type 3）
// 4) 生成期幼虫放置（HiveSpiderPass 托台 → v_231_larva）
import { describe, it, expect } from 'vitest';
import { breakHiveBlock, larvaSummonInRange, type HiveBreakHooks } from '../src/world/hive';
import { World } from '../src/world/World';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { TILE_BY_KEY } from '../src/data/tiles';
import { generateWorld } from '../src/world/gen/WorldGen';
import type { RNG } from '../src/core/rng';

/** 脚本化 rng：按序吐出预设值 */
function scriptedRng(values: number[]): RNG {
  let i = 0;
  return { next: () => values[i++ % values.length] } as unknown as RNG;
}

/** 计数经 h 引用读取（不能展开拷贝——拷贝后计数器不会更新） */
function makeHooks(): HiveBreakHooks & { h: { drops: number; bees: number[] } } {
  const h = { drops: 0, bees: [] as number[] };
  return {
    h,
    dropHiveItem: () => { h.drops++; },
    spawnBee: (_px: number, _py: number, r: RNG) => { h.bees.push(r.next() < 0.5 ? 210 : 211); },
  };
}

describe('蜂巢块破坏（KillTile case 225）', () => {
  const HIVE = TILE_BY_KEY['v_225_hive_block']!;

  it('1/3 分支：本格变满蜂蜜液体，无掉落无蜂', () => {
    const w = new World(40, 40, 1, 'hive');
    const st = w.store;
    st.setTile(20, 20, HIVE);
    const hooks = makeHooks();
    // rng.next()=0.0 < 1/3 → 流蜜
    const honey = breakHiveBlock(st, 20, 20, scriptedRng([0]), hooks);
    expect(honey).toBe(true);
    const i = st.idx(20, 20);
    expect(st.type[i]).toBe(0);
    expect(st.liquid[i]).toBe(255);
    expect(st.liquidType[i]).toBe(3);
    expect(hooks.h.drops).toBe(0);
    expect(hooks.h.bees.length).toBe(0);
  });

  it('掉物分支：1/2 出蜂、Next(3)==0 时 2 只', () => {
    const w = new World(40, 40, 1, 'hive');
    const st = w.store;
    // 0.9(非蜜) → 0.1(出蜂) → 0.0(<1/3 → 2 只)
    st.setTile(20, 20, HIVE);
    let hooks = makeHooks();
    expect(breakHiveBlock(st, 20, 20, scriptedRng([0.9, 0.1, 0.0]), hooks)).toBe(false);
    expect(hooks.h.drops).toBe(1);
    expect(hooks.h.bees.length).toBe(2);
    // 0.9(非蜜) → 0.1(出蜂) → 0.9(≥1/3 → 1 只)
    st.setTile(20, 20, HIVE);
    hooks = makeHooks();
    breakHiveBlock(st, 20, 20, scriptedRng([0.9, 0.1, 0.9]), hooks);
    expect(hooks.h.bees.length).toBe(1);
    // 0.9(非蜜) → 0.9(不出蜂)
    st.setTile(20, 20, HIVE);
    hooks = makeHooks();
    breakHiveBlock(st, 20, 20, scriptedRng([0.9, 0.9]), hooks);
    expect(hooks.h.drops).toBe(1);
    expect(hooks.h.bees.length).toBe(0);
  });

  it('分布：3000 次试验中流蜜 ≈1/3、蜂期望 ≈0.44/次', async () => {
    const w = new World(40, 40, 1, 'hive');
    const st = w.store;
    let honey = 0, bees = 0;
    const { RNG: Rng } = await import('../src/core/rng');
    const rng = new Rng(12345);
    for (let k = 0; k < 3000; k++) {
      st.setTile(20, 20, HIVE);
      const hooks = makeHooks();
      if (breakHiveBlock(st, 20, 20, rng, hooks)) honey++;
      bees += hooks.h.bees.length;
    }
    expect(honey / 3000).toBeGreaterThan(0.28);
    expect(honey / 3000).toBeLessThan(0.39);
    expect(bees / 3000).toBeGreaterThan(0.36);
    expect(bees / 3000).toBeLessThan(0.52);
  });
});

describe('幼虫破坏（KillTile case 231）', () => {
  it('4800px 曼哈顿门槛', () => {
    expect(larvaSummonInRange(100 * 16, 100 * 16, 100, 100)).toBe(true);
    // |0-1600|+|0-1600| = 3200px < 4800 → 在界内
    expect(larvaSummonInRange(0, 0, 100, 100)).toBe(true);
    // |0-6400|+|0-1600| = 8000px ≥ 4800 → 超界
    expect(larvaSummonInRange(0, 0, 400, 100)).toBe(false);
  });
});

describe('蜂蜜流动（LiquidSim type 3）', () => {
  it('空中蜂蜜下落并铺开', () => {
    const w = new World(60, 60, 7, 'honey');
    const st = w.store;
    // y=40 一排石头地板；y=30 满蜂蜜，下方全空
    for (let x = 20; x <= 40; x++) st.setTile(x, 40, TILE_BY_KEY['stone']!);
    const sim = new LiquidSim(w);
    // 模拟器先就位再写液体（onLiquidChanged 唤醒钩子由其构造注册）
    st.setLiquid(30, 30, 255, 3);
    for (let k = 0; k < 200; k++) sim.step();
    // 蜂蜜应离开原格出现在更低的行
    let lowest = -1;
    for (let y = 30; y <= 39; y++) {
      if (st.liquid[st.idx(30, y)] > 0) lowest = y;
    }
    expect(lowest).toBeGreaterThan(30);
    // 且液体类型保持蜂蜜
    const total = { liquid: 0, honey: 0 };
    for (let y = 25; y < 45; y++) {
      for (let x = 15; x < 45; x++) {
        const i = st.idx(x, y);
        if (st.liquid[i] > 0) {
          total.liquid++;
          if (st.liquidType[i] === 3) total.honey++;
        }
      }
    }
    expect(total.honey).toBe(total.liquid);   // 不变性：没有变成别的液体
    expect(total.liquid).toBeGreaterThan(0);
    sim.dispose();
  });
});

describe('生成期幼虫（BeeLarvaInBeehives）', () => {
  it('生成世界后丛林蜂巢区存在 v_231_larva', async () => {
    const LARVA = TILE_BY_KEY['v_231_larva']!;
    const HIVE = TILE_BY_KEY['v_225_hive_block']!;
    let found = 0;
    for (const seed of ['hive-larva-1', 'hive-larva-2']) {
      const world = await generateWorld({ width: 4200, height: 1200, seedText: seed });
      const st = world.store;
      let larva = 0, hive = 0;
      for (let i = 0; i < st.type.length; i++) {
        if (st.type[i] === LARVA) larva++;
        else if (st.type[i] === HIVE) hive++;
      }
      // 每个世界至少有一个蜂巢块群和一个幼虫
      expect(hive).toBeGreaterThan(200);
      expect(larva).toBeGreaterThanOrEqual(1);
      found += larva;
    }
    expect(found).toBeGreaterThanOrEqual(2);
  }, 120000);
});
