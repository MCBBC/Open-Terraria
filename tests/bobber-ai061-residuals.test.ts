// AI_061 残差四项（2026-09-06 二批）1:1 回归。权威 = 1.4.5.7 反编译：
//   ① 弹盒 SetDefaults :4510-4520（360-366/381/382/760/775 共块）w=h=14——旧 8×8 修正；
//     收线触玩家盒（:54666-54668）改读真盒 w/h（BOBBER_BOX 常量代读退役）
//   ② 微光钩爪面 :54685-54698：浮微光 → owner.AddBuff(353,60)（=Shimmered 微光化——
//     Player.cs:27944-27951 玩家自涉支同款授予；浮漂支无 shimmerImmune/Underworld 门）
//     + localAI[2] 一次门 PlaySound(19,…,2)=Splash_2（声源=玩家坐标,top-left）
//   ③ 咬钩抖动三旗复位 :54785-54802：settled(vy==0 或蜜 |vy|≤0.01) → 踢 vy=rand(100,500)
//     ×0.015 / vx=rand(-100,101)×0.015 + wet=lavaWet=honeyWet=false → 次拍共享湿段
//     !wet && wetCount==0 重触发入水溅花 10 粒+Splash_1（:16948 门）＝原版咬钩水花；
//     本仓湿段在拍头 → 溅花滞后一拍（位序登记）。浮支物理/GetWaterLine（:54699-54740/
//     :54805-54833）随批 1:1（旧静态钉位退役,settled 点=液面）
//   ④ 咬钩无声定谳：FishingCheck :20703-20712 / SetFishingCheckResults :20861-20924
//     全文无 PlaySound（仅 :20873/:20888 sonarPotion）——旧 playSfx('splash') 与
//     spawnParticles 6 粒色方块=自创，删
// 桩口径：池布 WetCollision 扫描钳窗内（row ≤ h−40，Collision.cs:1596，见
// player-bobber-splash-1457 头注①）→ 共享湿段旗可见；咬钩踢测试以 cy==wl 精确落点
// 预置 settled 态（浮支 else 支 :54732-54735 字面 vy=wl−cy=0，免 float 收敛尾随机性）。
import { describe, it, expect, vi } from 'vitest';
import { Bobber, BOBBER_BOX } from '../src/entities/Bobber';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { BuffType } from '../src/stats/Buffs';

const TILE = 16;
const ROD_2289 = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2289]!]!;

/** 池 = rows 40..42（钳窗 h−40=80 内）、L=255；type: 1=水 4=微光 */
function mkHarness(liquidType: number) {
  const store = new TileStore(200, 120);
  for (let dx = 40; dx < 70; dx++) {           // 30 宽 ×3 深 = 90 格 ≥ 75（FishingCheck 池门）
    for (let dy = 40; dy <= 42; dy++) store.setLiquid(dx, dy, 255, liquidType);
  }
  const player = new Player(50 * TILE, 36 * TILE, new Inventory());
  player.inv.selected = 5;
  player.inv.slots[5] = { id: ROD_2289, stack: 1 };
  const sfx: string[] = [];
  const particles: number[] = [];
  const dusts: Array<{ x: number; y: number; w: number; h: number; type: number }> = [];
  const hooks = {
    world: {
      store,
      groundLevel: 100,
      clock: { timeOfDay: 0.25 + 10000 / 54000 * 0.5, isDay: true, moonPhase: 2, bloodMoon: false, eclipse: false },
      weather: { raining: false, cloudAlpha: 0 },
      flags: {}, scene: null,
    },
    player,
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => { particles.push(1); },
    notifyInventoryChanged: () => {}, showPickupLabel: () => {},
    playSfx: (key: string) => { sfx.push('SYN:' + key); },
    playSfxFiles: () => {}, playSfxFile: (f: string) => { sfx.push(f); },
    playSfxWav: (f: string) => { sfx.push(f); },
    spawnDust: (x: number, y: number, w: number, h: number, type: number) => {
      const d = { x, y, w, h, type };
      dusts.push(d);
      return d;
    },
  } as unknown as GameHooks;
  return { hooks, player, store, sfx, particles, dusts };
}

// ============ ① 弹盒 14×14（SetDefaults :4510-4520） ============

describe('浮漂弹盒（SetDefaults :4510-4520 w=h=14）', () => {
  it('盒 14×14（旧 8×8 修正）;BOBBER_BOX 钉值同源', () => {
    const b = new Bobber(0, 0, 0, 0, 5, 0, 5, () => null);
    expect(b.w).toBe(14);
    expect(b.h).toBe(14);
    expect(BOBBER_BOX).toBe(14);
  });
  it('DoASplash 盒随真盒：w+12=26（:54843 width+12——旧 8×8 时 20 偏窄）', () => {
    const h = mkHarness(1);
    const b = new Bobber(50 * TILE, 40 * TILE, 0, 0, 5, 0, 5, () => h.player);
    b.retract = 2;
    b.liquidKind = 'water';
    b.fixedUpdate(1 / 60, h.hooks);
    expect(h.dusts.length).toBe(100);
    for (const d of h.dusts) expect(d.w).toBe(26);   // width(14)+12
  });
});

// ============ ② 微光钩爪面（:54685-54698） ============

describe('微光钩爪面（浮微光 → AddBuff(353,60)+Splash_2 一次门）', () => {
  it('浮微光：owner 得 Shimmered(353) + Splash_2 恰一声（声源=玩家坐标）;续拍不重播', () => {
    const h = mkHarness(4);
    const b = new Bobber(50 * TILE, 40 * TILE, 0, 0, 5, 0, 5, () => h.player);
    b.fixedUpdate(1 / 60, h.hooks);   // 出生盒即在微光内：湿段出生预置 shimmerWet + 入液注册
    expect(b.floating).toBe(true);
    b.fixedUpdate(1 / 60, h.hooks);   // 浮态首拍（拍 1 为飞行/入液注册支,微光面在浮态段）
    expect(h.player.buffs.has(BuffType.Shimmered)).toBe(true);   // :54691 AddBuff(353,60)
    expect(h.sfx.filter((s) => s === 'Splash_2').length).toBe(1); // :54696 style 2
    for (let k = 0; k < 30; k++) b.fixedUpdate(1 / 60, h.hooks);
    expect(h.sfx.filter((s) => s === 'Splash_2').length).toBe(1); // localAI[2] 一次门 :54693
    expect(h.player.buffs.has(BuffType.Shimmered)).toBe(true);   // 每 tick 续 60t
  });
  it('localAI[2] 非零（咬钩覆写态 :20878/:20892）→ Splash_2 闭锁、buff 照常', () => {
    const h = mkHarness(4);
    const b = new Bobber(50 * TILE, 40 * TILE, 0, 0, 5, 0, 5, () => h.player);
    (b as unknown as { lai2: number }).lai2 = 250;   // 咬钩后 localAI[2]=BaitItemType
    b.fixedUpdate(1 / 60, h.hooks);
    b.fixedUpdate(1 / 60, h.hooks);   // 浮态首拍
    expect(h.player.buffs.has(BuffType.Shimmered)).toBe(true);
    expect(h.sfx.filter((s) => s === 'Splash_2').length).toBe(0);
  });
});

// ============ ③ 浮支物理 + 咬钩抖动三旗复位（:54699-54802） ============

describe('浮支物理/咬钩抖动（:54699-54802,静态钉位退役）', () => {
  const WL = 41 * TILE - Math.floor(255 / 16);   // GetWaterLine :54818-54821：行底−liquid/16 = 641

  it('入液 settled 点 = 液面（GetWaterLine）,rotation=0（:54699）', () => {
    const h = mkHarness(1);
    const b = new Bobber(50 * TILE, 36 * TILE, 0, 2, 5, 0, 5, () => h.player);
    // 压随机≥咬钩门（floor(0.99×100)=99 > ⌊(力+75)/2⌋）：settled 收敛尾里累积器照跑,
    // 不隔离会随机开咬 → 抖动踢破坏 vy≈0 断言（曾实测 flake）
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    try {
      for (let k = 0; k < 200 && !(b.floating && b.cy >= WL - 0.01); k++) b.fixedUpdate(1, h.hooks);
      for (let k = 0; k < 160; k++) b.fixedUpdate(1, h.hooks);   // 收敛尾
      expect(Math.abs(b.cy - WL)).toBeLessThanOrEqual(0.01);
      expect(Math.abs((b as unknown as { vy: number }).vy)).toBeLessThanOrEqual(1e-9);
      expect((b as unknown as { drawRot: number }).drawRot).toBe(0);
    } finally {
      rnd.mockRestore();
    }
  });

  it('咬钩踢：vy=1.5..7.485 / vx=±1.5 + wet/lavaWet/honeyWet 三旗复位（:54789-54793）', () => {
    const h = mkHarness(1);
    const b = new Bobber(50 * TILE, WL - 7, 0, 0, 5, 0, 5, () => h.player);
    b.fixedUpdate(1, h.hooks);                      // 出生预置 + 入液注册（拍 1=飞行/入液支）
    // 预置 settled 精确态：cy==wl → 浮支 else 支（:54732-54735）字面 vy=wl−cy=0，
    // 免 float 收敛尾（ulp 级 tie-break）随机性——踢门 vy==0 即原版字面
    b.y = WL - 7;
    (b as unknown as { vy: number }).vy = 0;
    (b as unknown as { ai1: number }).ai1 = -100;   // 咬钩窗内
    b.fixedUpdate(1, h.hooks);
    const s = b as unknown as { vy: number; vx: number; wet: boolean; lavaWet: boolean; honeyWet: boolean };
    expect(s.vy).toBeGreaterThanOrEqual(1.5);
    expect(s.vy).toBeLessThanOrEqual(7.485);        // Next(100,500)×0.015
    expect(Math.abs(s.vx)).toBeLessThanOrEqual(1.5);
    expect(s.wet).toBe(false);                      // :54791-54793 三旗复位
    expect(s.lavaWet).toBe(false);
    expect(s.honeyWet).toBe(false);
    expect(b.cy).toBeGreaterThan(WL);               // 抖动下沉当拍可见（湿阻尼 ×0.5 进位移）
  });

  it('三旗复位 → 次拍共享湿段重触发入水溅花 10 粒+Splash_1（:16948 门＝原版咬钩水花）', () => {
    const h = mkHarness(1);
    const b = new Bobber(50 * TILE, WL - 7, 0, 0, 5, 0, 5, () => h.player);
    b.fixedUpdate(1, h.hooks);
    b.y = WL - 7;
    (b as unknown as { vy: number }).vy = 0;
    (b as unknown as { ai1: number }).ai1 = -100;
    b.fixedUpdate(1, h.hooks);                      // 踢 + 三旗复位
    const nDust = h.dusts.length, nSfx = h.sfx.length;
    b.fixedUpdate(1, h.hooks);                      // 湿段拍头：!wet && wetCount==0 → 入水溅花
    expect(h.dusts.length).toBe(nDust + 10);        // :16949-17003 循环 10
    for (const d of h.dusts.slice(nDust)) expect(d.type).toBe(33);   // dustWater() waterStyle 0
    expect(h.sfx.slice(nSfx).filter((s) => s === 'Splash_1').length).toBe(1);
    expect(b.wet).toBe(true);                       // 溅花后湿旗回置（:17020）
    expect(b.biteT).toBeGreaterThan(0);             // 咬钩窗未被打断
  });
});

// ============ ④ 咬钩无声定谳（FishingCheck :20703-20712 / :20861-20924） ============

describe('咬钩反馈（原版无音无尘）', () => {
  it('咬钩支零 playSfx("splash") 零 spawnParticles（旧自创近似退役）;咬钩窗照常开', () => {
    const h = mkHarness(1);
    const b = new Bobber(50 * TILE, 36 * TILE, 0, 2, 50, 0, 50, () => h.player);
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.01);
    try {
      let bit = false;
      for (let k = 0; k < 2000; k++) {
        b.fixedUpdate(1, h.hooks);
        if (b.biteT > 0) { bit = true; break; }
      }
      expect(bit).toBe(true);                       // 咬钩支确实跑过（窗口已开）
      expect(b.catchId).toBeGreaterThan(0);         // 渔获已掷（=曾进 catchId>0 分支）
    } finally {
      rnd.mockRestore();
    }
    expect(h.sfx.filter((s) => s === 'SYN:splash').length).toBe(0);   // 旧 playSfx('splash') 删
    expect(h.particles.length).toBe(0);             // 旧 6 粒色方块删
  });
});
