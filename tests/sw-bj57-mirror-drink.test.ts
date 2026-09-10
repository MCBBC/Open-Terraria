// SW-BJ57 2026-09-10 魔镜家族引导期演出 + 药水饮用演出（用户实报「使用魔镜时好像
// 没有光粒子效果？喝药水好像也是缺失或者不对？」）。
// 金标（Terarria1457/,1458 同域 diff=same——四块 :43305/:43331/:43371/:43391 行偏移 +2）：
//   ① 魔镜族 {50,3124,3199,5358} 逐拍光尘  Player.cs:43307-43312（Next(2)==0 →
//      NewDust(position,w,h,15,0,0,150,default,1.1)）——触发拍（useTime==useTime/2）
//      传送后 itemAnimation 仍>0,余半程继续发尘（:43317-43329 块内再评估）;
//   ② 魔法海螺 {4263,5360} 螺旋水尘       Player.cs:43331-43347（★BJ48 登记债同块清偿）
//   ③ 恶魔海螺 {4819,5361} 螺旋尘 35      Player.cs:43371-43387
//   ④ 贝壳手机 5359 仙尘 267              Player.cs:43391-43408
//   ⑤ 触发拍尘臂 1:1：魔镜族 70×(v×0.5)+70×0（:43319-43328,scale1.5 default 色）/
//      回忆 2350 10+70+70 青（:43439-43464,v×0.2→×0.5,scale1.2 Color.Cyan）/
//      回归 4870 同 2350（:43472-43502,itemTime==20 触发——旧刀误落 PERMANENT_USE
//      即时支=点击即传,本刀迁 TELEPORT_ITEM_VIDS 通道支）
//   ⑥ 音效分型：SkipsInitialUseSound=CreateBoolSet(false,2350,4870)（ItemID.cs:151）——
//      2350/4870 起手跳 UseSound 只响 Item3（:42432/:43477）,触发拍响 UseSound=Item6
//      （:42444/:43485）;魔镜族/海螺族不在表内 → 起手响 Item6（Item.cs case 50 :1986）。
//   ⑦ 饮用演出负面定谳（防自创）：药水饮用=起手 UseSound（Item3,ItemID 表）+ useStyle 9
//      举杯 + 每拍尘 284 FoodPiece 于嘴区（Player.cs:44074-44091,DrinkParticleColors 表
//      驱动——魔镜族不在表内=原版无尘,不造）;治疗/铁皮等 75 件 useStyle=9（Item.cs）。
// 判别力（变异实验,双向证红,2026-09-10 实跑）：
//   · 家族门变异（{50,3124,3199,5358}→只 50）→ 3199 逐拍尘测试红;
//   · alpha 150→100 / scale 1.1→1.5 → 尘节拍矩阵红;
//   · 4870 回迁 PERMANENT_USE（即时传）→ tripwire 红 + fire 面 'drink' 单音红;
//   · 2350 触发拍尘改无 ×0.5 → |vx|≤1.31 断言红;
//   · 海螺螺旋臂删除 → vy=−4.5/位相断言红。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';
import { ITEM_DEFS } from '../src/data/items';
import { VanillaDust } from '../src/fx/VanillaDust';
import { DRINK_PARTICLE_COLORS } from '../src/data/vanillaFoodColors';
import { itemUseSoundWav } from '../src/data/itemUseSound';
import { dustWaterFor } from '../src/render/WeatherRenderer';
import { seededRandom } from './seeded-rng';

/* eslint-disable @typescript-eslint/no-explicit-any */
const vidOf = (d: { vid?: number; key: string }) =>
  d?.vid ?? Number(String(d?.key ?? '').match(/^vi_(\d+)_/)?.[1] ?? -1);
const slotOfVid = (vid: number) => ITEM_DEFS.findIndex((d) => vidOf(d) === vid);

/** 轻桩：仅装配 tickRecallFamilyDust / emitFoodDrinkParticles 消费的实例域 */
function dustStub(playerPatch: Record<string, unknown> = {}): any {
  const g = Object.create(Game.prototype) as any;
  g.player = {
    x: 1000, y: 2000, w: 20, h: 42, vx: 3, vy: 0,
    itemAnimTicks: 90, cx: 1010, cy: 2021, facing: 1,
    inv: { heldItem: () => ({ id: slotOfVid(50) }) },
    ...playerPatch,
  };
  g.swing = { t: 10, dur: 17 };
  g.vanillaDust = new VanillaDust();
  return g;
}

/** fire 面桩（BJ48 sw-bj48-teleport-potion stubGame 同法） */
function fireStub(world: World, playerPos = { x: 130 * TILE, y: 140 * TILE }): {
  g: any; sfxLog: string[]; removed: { n: number };
} {
  const g = Object.create(Game.prototype) as any;
  const removed = { n: 0 };
  g.world = world;
  g.player = {
    x: playerPos.x, y: playerPos.y, vx: 3, vy: 0, w: 20, h: 42,
    iframes: 0, fallStartY: null, team: 0,
    cx: playerPos.x + 10, cy: playerPos.y + 21,
    inv: { removeHeld: (n: number) => { removed.n += n; } },
    removeAllGrapplingHooks: () => {},
    updateUnbreakableWallScan: () => {},
    equipStats: { fireWalk: false },
    buffs: null,
  };
  g.camera = { x: 0, y: 0 };
  g.cb = {};
  g.net = null;
  g.spectatingSlot = -1;
  g.lastStripReq = '';
  g.vanillaDust = new VanillaDust();
  const sfxLog: string[] = [];
  g.sfx = { play: (k: string) => { sfxLog.push(k); } };
  g.resolvePlayerSpawnPoint = () => [world.spawnX0, world.spawnY0];
  return { g, sfxLog, removed };
}

function paintRect(st: TileStore, x0: number, x1: number, y0: number, y1: number, type: number): void {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) st.setTileSilent(x, y, type);
}
const activeDust = (g: any) => (g.vanillaDust as VanillaDust)['pool'].filter((d: { active: boolean }) => d.active);
const d15 = (g: any) => activeDust(g).filter((d: { type: number }) => d.type === 15);

beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(0x6A57)); });
afterEach(() => { vi.restoreAllMocks(); });

describe('SW-BJ57 ①魔镜族引导期逐拍光尘（Player.cs:43307-43312）', () => {
  it('尘 15 ×50%/拍,α150,scale≈1.1×抖(0.88..1.32),盒散布（+4..W-1/+4..H-1）', () => {
    const g = dustStub();
    for (let i = 0; i < 400; i++) (g as unknown as { tickRecallFamilyDust(): void }).tickRecallFamilyDust();
    const ds = d15(g);
    // 50% 掷 × 400 拍（seeded 确定性,±15% 带宽防种子敏感）
    expect(ds.length, '400 拍 ≈ 200 粒(50%/拍)').toBeGreaterThanOrEqual(170);
    expect(ds.length).toBeLessThanOrEqual(230);
    for (const d of ds) {
      expect(d.alpha, 'NewDust α 参=150').toBe(150);
      expect(d.scale, 'scale=1.1×NewDust 抖(0.8..1.2)').toBeGreaterThanOrEqual(0.88);
      expect(d.scale).toBeLessThanOrEqual(1.32);
      expect(d.x, '盒散布 x+4..x+19（NewDust rand(W-4)+4）').toBeGreaterThanOrEqual(1000 + 4);
      expect(d.x).toBeLessThan(1000 + 20);
      expect(d.y, '盒散布 y+4..y+41').toBeGreaterThanOrEqual(2000 + 4);
      expect(d.y).toBeLessThan(2000 + 42);
      expect(Math.abs(d.vx), 'Speed=0 → 纯内速 ±2').toBeLessThanOrEqual(2.001);
      expect(Math.abs(d.vy)).toBeLessThanOrEqual(2.001);
      expect(d.color, 'default(Color) → 无 GetColor 叠画色').toBeNull();
    }
  });

  it('家族门=四件全亮（3199 冰镜逐拍发光）;itemAnimTicks=0 全哑;2350/4263/4870 不走此臂', () => {
    // 变异判别力:家族表收窄→ 3199 支红
    for (const vid of [50, 3124, 3199, 5358]) {
      const g = dustStub({ inv: { heldItem: () => ({ id: slotOfVid(vid) }) } });
      for (let i = 0; i < 100; i++) (g as unknown as { tickRecallFamilyDust(): void }).tickRecallFamilyDust();
      const ds = activeDust(g);
      expect(ds.length, `vid ${vid} 有逐拍尘`).toBeGreaterThan(20);
      expect(new Set(ds.map((d: { type: number }) => d.type))).toEqual(new Set([15]));
    }
    // 动画窗外全哑
    const g0 = dustStub({ itemAnimTicks: 0 });
    for (let i = 0; i < 100; i++) (g0 as unknown as { tickRecallFamilyDust(): void }).tickRecallFamilyDust();
    expect(activeDust(g0).length, 'itemAnimation==0 → 零尘').toBe(0);
    // 引导族他件（回忆/海螺/回归）无魔镜光尘臂
    for (const vid of [2350, 4263, 4870, 2351]) {
      const gN = dustStub({ inv: { heldItem: () => ({ id: slotOfVid(vid) }) } });
      for (let i = 0; i < 100; i++) (gN as unknown as { tickRecallFamilyDust(): void }).tickRecallFamilyDust();
      expect(d15(gN).length, `vid ${vid} 非魔镜族=零光尘`).toBe(0);
    }
  });
});

describe('SW-BJ57 ②③海螺螺旋水尘（Player.cs:43331-43347/:43371-43387,BJ48 债同块清偿）', () => {
  it('魔海螺=尘 waterFor(style0)=33,vy=−4.5 精确,scale=0.8 精确覆写,α130,noGravity,fadeIn1.1', () => {
    const g = dustStub({ inv: { heldItem: () => ({ id: slotOfVid(4263) }) } });
    for (let i = 0; i < 400; i++) (g as unknown as { tickRecallFamilyDust(): void }).tickRecallFamilyDust();
    const ds = activeDust(g).filter((d: { type: number }) => d.type === dustWaterFor(0));
    expect(ds.length, '2 掷×1/3×400 拍 ≈ 266').toBeGreaterThanOrEqual(200);
    for (const d of ds) {
      expect(d.vy, 'velocity.Y*=0; −=4.5 → 精确 −4.5').toBeCloseTo(-4.5, 6);
      expect(d.scale, 'scale=0.8 精确覆写（非抖动乘）').toBe(0.8);
      expect(d.alpha, 'α=130').toBe(130);
      expect(d.noGravity, 'noGravity=true').toBe(true);
      expect(d.fadeIn, 'fadeIn=1.1').toBeCloseTo(1.1, 6);
      expect(Math.abs(d.vx), 'vx=内速±2×1.5 → ≤3').toBeLessThanOrEqual(3.001);
      expect(d.x, 'Bottom 缘绕环:|x−中心|≤15').toBeGreaterThanOrEqual(1010 - 15.001);
      expect(d.x).toBeLessThanOrEqual(1010 + 15.001);
      expect(d.y, 'Bottom+oy:|y−底|≤15').toBeGreaterThanOrEqual(2042 - 15.001);
      expect(d.y).toBeLessThanOrEqual(2042 + 15.001);
    }
  });

  it('螺旋位相:itemAnimTicks=90 全粒 y=底+15、=75 全粒 y=底−15（cos(6π)/cos(5π)）', () => {
    const run = (ticks: number) => {
      const g = dustStub({ itemAnimTicks: ticks, inv: { heldItem: () => ({ id: slotOfVid(4263) }) } });
      for (let i = 0; i < 60; i++) (g as unknown as { tickRecallFamilyDust(): void }).tickRecallFamilyDust();
      return activeDust(g).filter((d: { type: number }) => d.type === dustWaterFor(0));
    };
    const hi = run(90), lo = run(75);
    expect(hi.length, '90 相位有粒').toBeGreaterThan(0);
    expect(lo.length, '75 相位有粒').toBeGreaterThan(0);
    for (const d of hi) expect(d.y, 'cos(90·2π/30)=cos6π=+1 → 底+15').toBeCloseTo(2042 + 15, 6);
    for (const d of lo) expect(d.y, 'cos(75·2π/30)=cos5π=−1 → 底−15').toBeCloseTo(2042 - 15, 6);
  });

  it('恶海螺 4819=尘 35 同律;贝壳手机 5359=尘 267 三色/±4 内速/scale0.8..1.4/盒内', () => {
    const g35 = dustStub({ inv: { heldItem: () => ({ id: slotOfVid(4819) }) } });
    for (let i = 0; i < 300; i++) (g35 as unknown as { tickRecallFamilyDust(): void }).tickRecallFamilyDust();
    const ds35 = activeDust(g35).filter((d: { type: number }) => d.type === 35);
    expect(ds35.length).toBeGreaterThan(100);
    for (const d of ds35) expect(d.vy).toBeCloseTo(-4.5, 6);

    const g267 = dustStub({ inv: { heldItem: () => ({ id: slotOfVid(5359) }) } });
    for (let i = 0; i < 400; i++) (g267 as unknown as { tickRecallFamilyDust(): void }).tickRecallFamilyDust();
    const ds267 = activeDust(g267).filter((d: { type: number }) => d.type === 267);
    expect(ds267.length, '50% 掷 ×400 ≈ 200').toBeGreaterThanOrEqual(150);
    const palette = JSON.stringify([
      { r: 100, g: 255, b: 100, a: 255 }, { r: 255, g: 255, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 },
    ]);
    for (const d of ds267) {
      expect(palette.includes(JSON.stringify(d.color)), '色∈{绿,黄,白}').toBe(true);
      expect(d.scale, 'scale=0.8+NextFloat×0.6').toBeGreaterThanOrEqual(0.8);
      expect(d.scale).toBeLessThanOrEqual(1.4);
      expect(d.noGravity).toBe(true);
      expect(Math.abs(d.vx), '内速±2×2 → ≤4').toBeLessThanOrEqual(4.001);
      expect(d.x).toBeGreaterThanOrEqual(1000);
      expect(d.x).toBeLessThan(1020);
      expect(d.y).toBeGreaterThanOrEqual(2000);
      expect(d.y).toBeLessThan(2042);
    }
  });
});

describe('SW-BJ57 ⑤触发拍尘臂 1:1（:43319-43328 魔镜白 / :43439-43464 青）', () => {
  it('4870 回归药水 fire：'+'mirror'+"' 音 + 140 青(0,255,255) α150 scale1.2 + 消耗（:43485-43500）", () => {
    const w = new World(300, 240, 7, 'bj57-a');
    w.groundLevel = 128;
    paintRect(w.store, 100, 200, 150, 152, TILE_BY_KEY['stone']);
    w.spawnX0 = 150; w.spawnY0 = 149; w.spawnX = 150; w.spawnY = 149;
    const r = fireStub(w);
    r.g.player.iframes = 7;
    (r.g as unknown as { fireRecallTeleport(c: { vid: number; kind: string; triggerAt: number; consume: boolean }): void })
      .fireRecallTeleport({ vid: 4870, kind: 'spawn', triggerAt: 20, consume: true });
    expect(r.sfxLog, '触发拍 UseSound=Item6（:43485）').toEqual(['mirror']);
    const ds = d15(r.g);
    expect(ds.length, '70(前)+70(后) 青').toBe(140);
    for (const d of ds) {
      expect(d.color, 'Color.Cyan(0,255,255,255)').toEqual({ r: 0, g: 255, b: 255, a: 255 });
      expect(d.alpha).toBe(150);
      expect(d.scale, 'scale=1.2×抖(0.8..1.2)').toBeGreaterThanOrEqual(0.94);
      expect(d.scale).toBeLessThanOrEqual(1.46);
      // Speed=v×0.2 后整速 ×0.5（前臂）;后臂 Speed=0 ×0.5 → 全体 |vx|≤1.31
      expect(Math.abs(d.vx), '×0.5 后置面 → |vx|≤(2+0.6)×0.5').toBeLessThanOrEqual(1.31);
      expect(Math.abs(d.vy)).toBeLessThanOrEqual(1.001);
    }
    expect(r.removed.n, 'stack--（:43498-43500）').toBe(1);
  });

  it('魔镜族 fire：140 白尘(null 色) scale1.5 + 前臂 v×0.5 偏置（无 ×0.5 后乘,|vx|可>2）', () => {
    const w = new World(300, 240, 7, 'bj57-b');
    w.groundLevel = 128;
    paintRect(w.store, 100, 200, 150, 152, TILE_BY_KEY['stone']);
    w.spawnX0 = 150; w.spawnY0 = 149; w.spawnX = 150; w.spawnY = 149;
    const r = fireStub(w);
    (r.g as unknown as { fireRecallTeleport(c: { vid: number; kind: string; triggerAt: number; consume: boolean }): void })
      .fireRecallTeleport({ vid: 50, kind: 'spawn', triggerAt: 45, consume: false });
    expect(r.sfxLog, '魔镜族触发无专属音（音在起手）').toEqual([]);
    const ds = d15(r.g);
    expect(ds.length, '70(前)+70(后)').toBe(140);
    for (const d of ds) {
      expect(d.color, 'default(Color) → null').toBeNull();
      expect(d.alpha).toBe(150);
      expect(d.scale, 'scale=1.5×抖(0.8..1.2)').toBeGreaterThanOrEqual(1.19);
      expect(d.scale).toBeLessThanOrEqual(1.81);
    }
    // 前臂（旧位 130*TILE）Speed=v×0.5=1.5 + 内速 ±2、无 ×0.5 → 必有 |vx|>2 粒;
    // 后臂（新位 150*TILE）Speed=0 → |vx|≤2。按落点分桶判别两面
    const pre = ds.filter((d: { x: number }) => d.x < 140 * TILE);
    const post = ds.filter((d: { x: number }) => d.x > 140 * TILE);
    expect(pre.length).toBe(70);
    expect(post.length).toBe(70);
    expect(pre.some((d: { vx: number }) => Math.abs(d.vx) > 2.001),
      '前臂 v×0.5 偏置无后乘（变异:误加 ×0.5 → 红）').toBe(true);
    for (const d of post) expect(Math.abs(d.vx), '后臂 Speed=0 纯内速').toBeLessThanOrEqual(2.001);
  });
});

describe('SW-BJ57 ⑥⑦音效分型 + 饮用演出负面定谳（防自创）', () => {
  it('UseSound 表分型：药水 Item_3 / 魔镜·回忆·回归 Item_6（vanilla-itemusesound）', () => {
    expect(itemUseSoundWav(292)).toBe('Item_3');
    expect(itemUseSoundWav(188)).toBe('Item_3');
    expect(itemUseSoundWav(126)).toBe('Item_3');
    expect(itemUseSoundWav(50)).toBe('Item_6');
    expect(itemUseSoundWav(3199)).toBe('Item_6');
    expect(itemUseSoundWav(2350)).toBe('Item_6');
    expect(itemUseSoundWav(4870)).toBe('Item_6');
  });

  it('DrinkParticleColors：药水在表（每拍尘 284）;魔镜族不在表=原版无尘不造', () => {
    for (const vid of [126, 188, 189, 226, 227, 288, 292, 2322, 2351, 1134, 2756]) {
      expect(DRINK_PARTICLE_COLORS[vid]?.length ?? 0, `vid ${vid} 有饮用尘色`).toBeGreaterThan(0);
    }
    for (const vid of [50, 3124, 3199, 5358]) {
      expect(DRINK_PARTICLE_COLORS[vid], `vid ${vid} 魔镜族无饮用尘（ItemID.cs:586- 表无此键）`).toBeUndefined();
    }
  });

  it('emitFoodDrinkParticles：292 每调用 1 粒尘 284 于嘴区±4 色×0.7;50 零粒', () => {
    const g292 = dustStub({ inv: { heldItem: () => ({ id: slotOfVid(292) }) } });
    (g292 as unknown as { emitFoodDrinkParticles(h: { id: number } | null): void })
      .emitFoodDrinkParticles({ id: slotOfVid(292) });
    const ds = activeDust(g292);
    expect(ds.length, '一次调用恰 1 粒（无掷）').toBe(1);
    expect(ds[0].type).toBe(284);
    expect(ds[0].x, '嘴区 MouthPosition±4（中心+8 前向）').toBeGreaterThanOrEqual(1010 + 8 - 4);
    expect(ds[0].x).toBeLessThanOrEqual(1010 + 8 + 4);
    expect(ds[0].y).toBeGreaterThanOrEqual(2021 - 4 - 4);
    expect(ds[0].y).toBeLessThanOrEqual(2021 - 4 + 4);
    expect(ds[0].scale, '0.8+0.2×rand').toBeGreaterThanOrEqual(0.8);
    expect(ds[0].scale).toBeLessThanOrEqual(1.0);
    const c = DRINK_PARTICLE_COLORS[292] as readonly (readonly [number, number, number])[];
    const col = ds[0].color as { r: number; g: number; b: number };
    const tinted = c.some(([r, gg, b]) =>
      col.r === Math.round(r * 0.7) && col.g === Math.round(gg * 0.7)
      && col.b === Math.round(b * 0.7));
    expect(tinted, '色=表内随机 ×0.7（Player.cs:44088 array[...]×0.7f）').toBe(true);

    const g50 = dustStub();
    (g50 as unknown as { emitFoodDrinkParticles(h: { id: number } | null): void })
      .emitFoodDrinkParticles({ id: slotOfVid(50) });
    expect(activeDust(g50).length, '魔镜无饮用尘面（不在 DrinkParticleColors）').toBe(0);
  });
});

describe('SW-BJ57 4870 迁移 tripwire（防并行会话整文件回写回归）', () => {
  const src = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');

  it('TELEPORT_ITEM_VIDS 含 4870;PERMANENT_USE_VIDS 不含;case 4870 即时支已删', () => {
    const tp = src.match(/const TELEPORT_ITEM_VIDS = new Set\(\[([^\]]*)\]\)/);
    expect(tp, 'TELEPORT_ITEM_VIDS 定义在位').toBeTruthy();
    expect(tp![1].split(',').map((s) => s.trim())).toContain('4870');
    const pu = src.match(/const PERMANENT_USE_VIDS = new Set\(\[([\s\S]*?)\]\);/);
    expect(pu, 'PERMANENT_USE_VIDS 定义在位').toBeTruthy();
    expect(pu![1].split(/[,\n]/).map((s) => s.trim()).filter(Boolean)).not.toContain('4870');
    expect(src.includes('case 4870:'), 'case 4870 即时支整删').toBe(false);
  });

  it('逐拍尘接线 + 4870 无敌帧保留臂 + 起手 10 青尘臂在位', () => {
    expect(src.includes('this.tickRecallFamilyDust();'), 'updateUse 逐拍尘接线').toBe(true);
    expect(src.includes('if (c.vid === 2350 || c.vid === 4870) p.iframes = keepIframes;'),
      '4870 保留无敌帧（:37786-37793 immune 存取回存）').toBe(true);
    expect(src.includes('recallSparkleDust(this.player, 10, true'),
      '起手 10 青尘（:43439-43442/:43479-43482）').toBe(true);
    expect(src.includes('tvid === 2350 || tvid === 4870 ? 20'),
      '4870 triggerAt=20（itemTime==20 触发拍 :43485）').toBe(true);
    expect(src.includes('4870: 30'),
      '4870 useTime 兜底 30（vanilla-itemcombat 4870 空对象提取缺口;Item.cs:38265-38266 '
      + 'useTime=(useAnimation=30)——缺此则 ??90 兜底把触发拍拉长 3×）').toBe(true);
  });
});
