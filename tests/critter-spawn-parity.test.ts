// 环境小动物生成链回归（2026-08-17 全动物 review 批）：
//   1. 沙地蝎 case 53（NPC.cs:2223-2225 黄沙落脚即出 366/367 各半）
//   2. 夜猫头鹰 611/689（:2345-2354 夜+无雨+1/5；白天不出）
//   3. 晨间鸟表 297/298/442（:2358-2380 <9:30 且 2/3）
//   4. 鸟表二+尾部表（:2442-2534：1/2 鸟表 + 金兔/金松鼠/节日/松鼠/兔兜底；
//      夜间照出——链无昼夜门）
//   5. 割草 DropBait 族（WorldGen.cs:66304-66480）与新增出生位物种的
//      Enemy 数据可达性（fromVanilla 构造 + aiStyle 正确路由）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { Enemy } from '../src/entities/Enemy';
import { RNG } from '../src/core/rng';

function critterWorld() {
  const w = new World(400, 600, 42, 'critter-parity');
  w.groundLevel = 100; w.rockLevel = 200;
  const st = w.store;
  // 地表 y=100 草/沙平台（surfaceSpawn = y ≤ groundLevel），玩家站 y=96
  for (let x = 100; x < 260; x++) st.setTileSilent(x, 100, 3 /* grass=内部id3 */);
  for (let x = 260; x < 340; x++) st.setTileSilent(x, 100, 22 /* sand=内部id22 */);
  return { w, st };
}

function rollMany(w: World, _st: unknown, tileX: number,
  opts: { night?: boolean; hour?: number }, n: number): Record<number, number> {
  const sp = new VanillaSpawner(w);
  sp.setPlayerFlags(false, false);
  // 昼夜经 clock（spawn() 内 :2818 会用 clock.isDay 覆写 dayTime 字段——直改字段无效）
  w.clock.timeOfDay = opts.night ? 0.95 /* 22:48 夜 */ : (opts.hour ?? 12) / 24;
  (sp as unknown as { spawnFriendlyCycle: boolean }).spawnFriendlyCycle = true;
  const counts: Record<number, number> = {};
  for (let k = 0; k < n; k++) {
    const rng = new RNG(k * 7919 + 13);
    const r = sp.spawn(tileX * 16 + 8, 96 * 16, rng, 24, 14);
    if (r) {
      const v = (r as unknown as { vanillaId: number }).vanillaId;
      counts[v] = (counts[v] ?? 0) + 1;
    }
  }
  return counts;
}

describe('环境小动物生成链（case 2/53 真序）', () => {
  it('沙地落脚恒出蝎 366/367（case 53 Next(366,368)）', () => {
    const { w } = critterWorld();
    const c = rollMany(w, null as never, 300, { hour: 12 }, 200);
    const total = (c[366] ?? 0) + (c[367] ?? 0);
    expect(total).toBeGreaterThan(100);            // 无概率门：沙列落脚即出（采样窗边缘有草列稀释）
    expect(c[366] ?? 0).toBeGreaterThan(30);       // 两态各半
    expect(c[367] ?? 0).toBeGreaterThan(30);
  });

  it('夜猫头鹰：夜+草出 611（1/5），白天 0 只', () => {
    const { w } = critterWorld();
    const night = rollMany(w, null as never, 200, { night: true }, 400);
    expect((night[611] ?? 0) + (night[689] ?? 0)).toBeGreaterThan(40);  // ~1/5
    const day = rollMany(w, null as never, 200, { hour: 12 }, 400);
    expect((day[611] ?? 0) + (day[689] ?? 0)).toBe(0);
  });

  it('晨间鸟表(<9:30)出 297/298/74；正午不再走晨表（有鸟表二兜着）', () => {
    const { w } = critterWorld();
    const morn = rollMany(w, null as never, 200, { hour: 8 }, 400);
    expect((morn[297] ?? 0) + (morn[298] ?? 0)).toBeGreaterThan(10);
    const noon = rollMany(w, null as never, 200, { hour: 12 }, 400);
    // 鸟表二（1/2 无昼夜门）:正午仍有鸟族
    expect((noon[297] ?? 0) + (noon[298] ?? 0) + (noon[74] ?? 0) + (noon[442] ?? 0)).toBeGreaterThan(50);
  });

  it('尾部表兜底：兔 46/松鼠 299|538 夜间照出（链无昼夜门）', () => {
    const { w } = critterWorld();
    const night = rollMany(w, null as never, 200, { night: true }, 600);
    expect(night[46] ?? 0).toBeGreaterThan(20);
    expect((night[299] ?? 0) + (night[538] ?? 0)).toBeGreaterThan(5);
  });

  it('白天草链：兔/松鼠照常（原版行为不受昼夜门影响）', () => {
    const { w } = critterWorld();
    const day = rollMany(w, null as never, 200, { hour: 12 }, 400);
    expect(day[46] ?? 0).toBeGreaterThan(10);
  });
});

describe('新接通物种的 Enemy 数据可达性', () => {
  const CASES: Array<[number, number, string]> = [
    [611, 24, '猫头鹰(bird AI)'], [689, 24, '金猫头鹰'],
    [297, 24, '蓝松鹊'], [298, 24, '红雀'], [442, 24, '金鸟'],
    [366, 7, '蝎(行走族)'], [367, 7, '黑蝎'],
    [485, 66, 'Grubby(蠕虫族)'], [486, 66, 'Sluggy'], [487, 66, 'Buggy'], [484, 66, '魔夜爬虫'],
    [446, 1, '金蚱蜢(弹跳族)'], [448, 66, '金蚯蚓'], [606, 66, '蛆'],
    [653, 65, '地狱蝴蝶'], [654, 64, '熔岩蝇'],
  ];
  it.each(CASES)('%s %s 构造成功且 aiStyle=%s', (id, ai, _name) => {
    const e = Enemy.fromVanilla(id, 200 * 16, 149 * 16);
    expect(e).not.toBeNull();
    expect(e!.vanilla?.aiStyle).toBe(ai);
  });
});
