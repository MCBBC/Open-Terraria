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
  // ★世界宽 1300：beachDistance=380 海岸带 (0,380)∪(920,1300) 外的中央带
  //  够宽放整片沙面——2026-08-17 友好轮 isBeach 支接入后,窄带世界沙面落
  //  海岸带会被海鸥 602 截胡/采样窗边缘轮全被 CheckNotSpawningOnScreen 拒
  const w = new World(1300, 600, 42, 'critter-parity');
  w.groundLevel = 100; w.rockLevel = 200;
  const st = w.store;
  // 地表 y=100 草/沙平台（surfaceSpawn = y ≤ groundLevel），玩家站 y=96
  for (let x = 400; x < 600; x++) st.setTileSilent(x, 100, 3 /* grass=内部id3 */);
  for (let x = 600; x < 700; x++) st.setTileSilent(x, 100, 22 /* sand=内部id22 */);
  for (let x = 700; x < 920; x++) st.setTileSilent(x, 100, 3);
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
    const c = rollMany(w, null as never, 650, { hour: 12 }, 200);
    const total = (c[366] ?? 0) + (c[367] ?? 0);
    expect(total).toBeGreaterThan(100);            // 无概率门：沙列落脚即出（采样窗边缘有草列稀释）
    expect(c[366] ?? 0).toBeGreaterThan(30);       // 两态各半
    expect(c[367] ?? 0).toBeGreaterThan(30);
  });

  it('夜猫头鹰：夜+草出 611（1/5），白天 0 只', () => {
    const { w } = critterWorld();
    const night = rollMany(w, null as never, 500, { night: true }, 400);
    expect((night[611] ?? 0) + (night[689] ?? 0)).toBeGreaterThan(40);  // ~1/5
    const day = rollMany(w, null as never, 500, { hour: 12 }, 400);
    expect((day[611] ?? 0) + (day[689] ?? 0)).toBe(0);
  });

  it('晨间鸟表(<9:30)出 297/298/74；正午不再走晨表（有鸟表二兜着）', () => {
    const { w } = critterWorld();
    const morn = rollMany(w, null as never, 500, { hour: 8 }, 400);
    expect((morn[297] ?? 0) + (morn[298] ?? 0)).toBeGreaterThan(10);
    const noon = rollMany(w, null as never, 500, { hour: 12 }, 400);
    // 鸟表二（1/2 无昼夜门）:正午仍有鸟族
    expect((noon[297] ?? 0) + (noon[298] ?? 0) + (noon[74] ?? 0) + (noon[442] ?? 0)).toBeGreaterThan(50);
  });

  it('尾部表兜底：兔 46/松鼠 299|538 夜间照出（链无昼夜门）', () => {
    const { w } = critterWorld();
    const night = rollMany(w, null as never, 500, { night: true }, 600);
    expect(night[46] ?? 0).toBeGreaterThan(20);
    expect((night[299] ?? 0) + (night[538] ?? 0)).toBeGreaterThan(5);
  });

  it('白天草链：兔/松鼠照常（原版行为不受昼夜门影响）', () => {
    const { w } = critterWorld();
    const day = rollMany(w, null as never, 500, { hour: 12 }, 400);
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

describe('松鼠黑化彩蛋 + 蝴蝶物种槽（2026-08-17 修复批）', () => {
  it('松鼠 299 玩家 CanHit 内 1/3000 厄运 → 黑化 25HP/防+6/伤20/转战士 AI', () => {
    const w = new World(80, 80, 42, 'squirrel-turn');
    w.groundLevel = 42;
    for (let x = 10; x <= 70; x++) w.store.setTileSilent(x, 60, 2);
    const hooks = {
      world: w, player: null,
      playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
      spawnDrop: () => null, damagePlayer: () => {},
      entities: { add: () => {} }, enemies: () => [] as unknown[],
    } as never;
    const seedMath = Math.random;
    // 强制厄运掷命中（RollOnlyBadLuckExtreme 内部也走 Math.random）
    Math.random = () => 0;   // 所有掷都取最小值 → 1/3000 命中
    try {
      const e = Enemy.fromVanilla(299, 40 * 16, 59 * 16)!;
      const pNear = { x: 41 * 16, y: 58 * 16, w: 20, h: 42, cx: 41 * 16, cy: 58 * 16 + 21, dead: false, luck: -0.5 };   // RollOnlyBadLuckExtreme 非负运恒 -1——须负运才触发
      (hooks as unknown as { player: unknown }).player = pNear;
      e.fixedUpdate(1 / 60, hooks);
      expect(e.maxHp).toBe(25);
      expect(e.def.damage).toBe(20);
      expect(e.def.defense).toBe(6);
    } finally { Math.random = seedMath; }
  });

  it('蝴蝶 356 物种槽:出生加权掷 1-8,恒不越界;渲染带 = (ai2-1)*3 + 拍翅帧', async () => {
    const { vanillaFrameIdx } = await import('../src/render/Renderer');
    const w = new World(80, 80, 42, 'butterfly-species');
    w.groundLevel = 42;
    const hooks = {
      world: w, player: null,
      playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
      spawnDrop: () => null, damagePlayer: () => {},
      entities: { add: () => {} }, enemies: () => [] as unknown[],
    } as never;
    const seen = new Set<number>();
    for (let k = 0; k < 300; k++) {
      const e = Enemy.fromVanilla(356, 40 * 16, 50 * 16)!;
      e.animT = 0;
      e.fixedUpdate(1 / 60, hooks);
      expect(e.ai2).toBeGreaterThanOrEqual(1);
      expect(e.ai2).toBeLessThanOrEqual(8);
      seen.add(e.ai2);
      // 渲染带:物种 1 → 帧 0-2;物种 8 → 帧 21-23
      const f = vanillaFrameIdx(e, 24);
      expect(f).toBeGreaterThanOrEqual((e.ai2 - 1) * 3);
      expect(f).toBeLessThanOrEqual((e.ai2 - 1) * 3 + 2);
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);   // 加权 8 物种(25/22/19/15/10/6/2/1)
  });

  it('661 彩光蜻蛉不受物种槽影响（ai2 仍为渐隐计数）', () => {
    const w = new World(80, 80, 42, 'lacewing');
    w.groundLevel = 42;
    const hooks = {
      world: w, player: null,
      playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
      spawnDrop: () => null, damagePlayer: () => {},
      entities: { add: () => {} }, enemies: () => [] as unknown[],
    } as never;
    const e = Enemy.fromVanilla(661, 40 * 16, 50 * 16)!;
    for (let t = 0; t < 30; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.ai2).toBeLessThanOrEqual(60);   // 渐隐上限 50/60,物种掷不触发
  });
});

describe('DropBait 掷骰核心（WorldGen.cs:66304-66480 纯函数）', () => {
  it('185 装饰帧带(fy0+fx<214) 1/6 掷蚯蚓;带外(234+)不掷', async () => {
    const { dropBaitRoll } = await import('../src/world/DropBait');
    // rand 首掷恒最小:0<1/6 命中,次掷(金)0<1/400 命中
    let i = 0;
    const hit = dropBaitRoll(185, 0, 0, false, () => { i++; return i <= 2 ? 0 : 0.9; });
    expect(hit?.kind).toBe('worm');
    expect(hit?.gold).toBe(true);
    const miss = dropBaitRoll(185, 234, 0, false, () => 0);
    expect(miss).toBeNull();                       // fx>=214 且 fy!=18 → 带外
  });

  it('花靴 ×10000:fx>=108 自长植株 1/400 命中值(0.001)不再掷;fx<108 照掷', async () => {
    const { dropBaitRoll } = await import('../src/world/DropBait');
    // rand=0.001:无靴 <1/400(0.0025) 命中;有靴 <1/4e6(2.5e-7) 不命中
    expect(dropBaitRoll(3, 108, 0, false, () => 0.001)?.kind).toBe('worm');
    expect(dropBaitRoll(3, 108, 0, true, () => 0.001)).toBeNull();
    expect(dropBaitRoll(3, 107, 0, true, () => 0)?.kind).toBe('worm');
  });

  it('grubby 序贯族型:1/4→486;再 1/12→487 覆写;普通落 485', async () => {
    const { dropBaitRoll } = await import('../src/world/DropBait');
    // sheet 61:grub 80×1.25=100;rand 序列:首掷 0(命中) → 0.5(≥1/4 不改) → 0.5(≥1/12 不改)
    let i = 0;
    const seq = (arr: number[]) => () => arr[Math.min(i++, arr.length - 1)];
    i = 0;
    expect(dropBaitRoll(61, 0, 0, false, seq([0, 0.5, 0.5]))?.grubType).toBe(485);
    i = 0;
    expect(dropBaitRoll(61, 0, 0, false, seq([0, 0.1, 0.5]))?.grubType).toBe(486);
    i = 0;
    expect(dropBaitRoll(61, 0, 0, false, seq([0, 0.1, 0.01]))?.grubType).toBe(487);
  });

  it('墓地 worm→606 覆金;非墓地金→448/普通→357', async () => {
    const { baitWormType } = await import('../src/world/DropBait');
    expect(baitWormType(true, true)).toBe(606);
    expect(baitWormType(false, true)).toBe(448);
    expect(baitWormType(false, false)).toBe(357);
  });

  it('637 狱草 lava:1/100 掷,1/2 选 654/653', async () => {
    const { dropBaitRoll } = await import('../src/world/DropBait');
    let i = 0;
    const seq = (a: number[]) => () => a[Math.min(i++, a.length - 1)];
    i = 0;
    expect(dropBaitRoll(637, 0, 0, false, seq([0, 0.4]))?.lavaType).toBe(654);  // 0.4<0.5
    i = 0;
    expect(dropBaitRoll(637, 0, 0, false, seq([0, 0.6]))?.lavaType).toBe(653);
  });
});

describe('review 修正批：深度门/tile 集对齐（case 147/161/53 无 flag10）', () => {
  function deepWorld() {
    const w = new World(400, 600, 42, 'deep-parity');
    w.groundLevel = 100; w.rockLevel = 200;
    const st = w.store;
    for (let x = 100; x < 180; x++) st.setTileSilent(x, 250, 22 /* sand 深层 */);
    for (let x = 200; x < 280; x++) st.setTileSilent(x, 250, 23 /* snow 深层 */);
    return { w, st };
  }
  function rollDeep(w: World, tileX: number, night: boolean, n: number): Record<number, number> {
    const sp = new VanillaSpawner(w);
    sp.setPlayerFlags(false, false);
    w.clock.timeOfDay = night ? 0.95 : 0.5;
    (sp as unknown as { spawnFriendlyCycle: boolean }).spawnFriendlyCycle = true;
    const counts: Record<number, number> = {};
    for (let k = 0; k < n; k++) {
      const r = sp.spawn(tileX * 16 + 8, 246 * 16, new RNG(k * 104729 + 7), 24, 14);
      if (r) {
        const v = (r as unknown as { vanillaId: number }).vanillaId;
        counts[v] = (counts[v] ?? 0) + 1;
      }
    }
    return counts;
  }
  it('深层沙地（surfaceSpawn=false）照样出蝎 366/367', () => {
    const { w } = deepWorld();
    const c = rollDeep(w, 140, false, 200);
    expect((c[366] ?? 0) + (c[367] ?? 0)).toBeGreaterThan(80);
  });
  it('深层雪原照样出企鹅 148/149', () => {
    const { w } = deepWorld();
    const c = rollDeep(w, 240, false, 200);
    expect((c[148] ?? 0) + (c[149] ?? 0)).toBeGreaterThan(120);
  });
});
