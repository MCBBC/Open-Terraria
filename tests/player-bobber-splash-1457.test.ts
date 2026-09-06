// 出入液溅花 1:1 回归（Player.cs:27959-28153 + Projectile.cs:54839-54852，2026-09-04 升格批）。
// 权威 = 1.4.5.7 反编译：
//   玩家   Player.Update 液体段 :27871-28171（flag24/flag25/num86/flag27/shimmer 旗序、
//          wetCount 门 :27984/:28078、四液×入/出 八分支尘参数、PlaySound(19) 七处）
//   尘型表 Dust.dustWater() :405-421（waterStyle→33/98-105/123/288）
//   音变体 LegacySoundPlayer.cs:363 PlaySound Style 缺省 1 + :874 case19 num=Style 直映
//          （水 0 / 微光入 2 / 微光出 3 / 蜜·岩浆缺省 1）——旧 playSfx('splash') 对
//          Splash_0..5 六变体乱掷=音塌缩，退役。
//   浮漂   AI_061_FishingBobber_DoASplash :54839-54852（100×dustWater）+ 两溅花位
//          :54626-54631（拉杆 ai[1]>0&&localAI[1]!=0）/:54642（断线 ai[0]==2）。
// 桩口径：game.spawnDust 恒零初速+单位 scale/α 桩——隔离【调用侧后置覆写面】逐值核验
// （NewDust 掷序与型内初速预处理由 VanillaDust.spawn 自身承载，不在本测重复）；
// 308/34/35/152 的 NewDust 型内补链在发射器内（净初速对原版逐位等价），桩上表现为
// 微光 vy=0×0.5+1−4=−3、蜜 =−0.5−1=−1.5、岩浆 =−0.5−1.5=−2。
// ★60 高测试世界两处原版钳制语义：①WetCollision 扫描窗 y 钳 maxTilesY−40=20
//   （Collision.cs:1596 Utils.Clamp）→ 池体必须布在 row≤19（本测 row14-17）;
//   ②地狱层门 UnderworldLayer=h−200<0 恒关 → 微光不授予 buff 353（原版 :27946
//   采样门同款语义）→ shimmering 恒 false，微光入/出溅花直达（=shimmerImmune
//   玩家涉微光的原版路径）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Bobber } from '../src/entities/Bobber';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { TILE } from '../src/core/constants';
import { BuffType } from '../src/stats/Buffs';

interface DustRec {
  x: number; y: number; w: number; h: number; type: number;
  vx: number; vy: number; scale: number; alpha: number; noGravity: boolean;
  color: { r: number; g: number; b: number; a: number } | null;
  px: number; py: number;   // spawn 调用瞬间的宿主位（盒参数相对基准——splash 先于移动段）
}

const SHIMMER_COLORS: Array<[number, number, number]> = [
  [255, 255, 210], [190, 245, 255], [255, 150, 255], [190, 175, 255],
];

const mkHarness = () => {
  const dusts: DustRec[] = [];
  const sfx: Array<{ file: string }> = [];
  const particles: number[] = [];
  const world = new World(60, 60, 42, 'splash-1457');
  for (let x = 12; x <= 40; x++) world.store.setTileSilent(x, 18, 1);   // 地板 row18（池体须在 row≤19,见头注①）
  const player = new Player(20 * TILE, 14 * TILE, new Inventory());
  // 溅花尘宿主位晚绑定（浮漂测用）——缺省 = 玩家
  let track: { x: number; y: number } | null = null;
  const game = {
    world,
    player,
    enemies: () => [],
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => { particles.push(1); },   // 旧近似通道——应为零调用
    notifyInventoryChanged: () => {},
    showPickupLabel: () => {},
    playSfx: (key: string) => { sfx.push({ file: 'SYN:' + key }); },
    playSfxFiles: () => {},
    playSfxFile: (file: string) => { sfx.push({ file }); },
    playSfxWav: (file: string) => { sfx.push({ file }); },
    spawnDust: (x: number, y: number, w: number, h: number, type: number) => {
      const t = track ?? player;
      const d: DustRec = {
        x, y, w, h, type, vx: 0, vy: 0, scale: 1, alpha: 0, noGravity: false, color: null,
        px: t.x, py: t.y,
      };
      dusts.push(d);
      return d;
    },
  };
  const settle = (ticks = 14): void => {
    for (let i = 0; i < ticks; i++) player.fixedUpdate(1 / 60, game as never);
  };
  const fill = (type: number, x0 = 17, x1 = 23, y0 = 14, y1 = 17): void => {
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) world.store.setLiquid(x, y, 255, type);
    }
  };
  const drain = (x0 = 17, x1 = 23, y0 = 14, y1 = 17): void => {
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) world.store.setLiquid(x, y, 0, 0);
    }
  };
  const tick = (): void => player.fixedUpdate(1 / 60, game as never);
  return { world, player, game, dusts, sfx, particles, settle, fill, drain, tick, setTrack: (t: { x: number; y: number } | null) => { track = t; } };
};

// ============ A. 玩家四液×入/出（Player.cs:27959-28153） ============

describe('玩家入水（Player.cs:27982-28056）', () => {
  it('水：50×dustWater(33) vy−3 vx×2.5 scale0.8 α100 noGravity 盒(x−6,y+h/2−8,w+12,24)+Splash_0', () => {
    const h = mkHarness();
    h.settle();
    h.fill(1);                                   // liquidType 1=水（原版 +1 编码）
    h.dusts.length = 0; h.sfx.length = 0;
    h.tick();
    expect(h.dusts.length).toBe(50);             // :28031-28041 循环 50
    for (const d of h.dusts) {
      expect(d.type).toBe(33);                   // waterStyle 0 → 缺省 33（Dust.cs:405-421）
      expect(d.x).toBe(d.px - 6);                // :28035 position.X−6
      expect(d.y).toBe(d.py + h.player.h / 2 - 8);   // 入水盒 −8（:28035）
      expect(d.w).toBe(h.player.w + 12);
      expect(d.h).toBe(24);
      expect(d.vy).toBe(-3);                     // :28036 velocity.Y−=3
      expect(d.vx).toBe(0);                      // :28037 ×2.5（桩零初速）
      expect(d.scale).toBe(0.8);                 // :28038
      expect(d.alpha).toBe(100);                 // :28039
      expect(d.noGravity).toBe(true);            // :28040
      expect(d.color).toBeNull();                // 水支无色覆写
    }
    expect(h.sfx).toEqual([{ file: 'Splash_0' }]);   // :28042 style 0
    expect(h.particles.length).toBe(0);          // 旧 spawnParticles 近似退役
    expect(h.player.wetCount).toBe(9);           // :27986 置 10 → 同拍 :28169−1
  });

  it('微光：50×308 vy−4→桩净 −3 scale0.8 α不设 noGravity 六掷三色+Splash_2（:27991-28016）', () => {
    const h = mkHarness();
    h.settle();
    h.fill(4);                                   // liquidType 4=微光
    h.dusts.length = 0; h.sfx.length = 0;
    h.tick();
    expect(h.dusts.length).toBe(50);             // :27992-28015 循环 50
    for (const d of h.dusts) {
      expect(d.type).toBe(308);
      expect(d.x).toBe(d.px - 6);
      expect(d.y).toBe(d.py + h.player.h / 2);   // 微光盒无 −8（:27995）
      expect(d.w).toBe(h.player.w + 12);
      expect(d.h).toBe(24);
      expect(d.vy).toBe(-3);                     // 桩链：0×0.5+1（NewDust 308 支补链）−4
      expect(d.vx).toBe(0);                      // 0×0.5×2.5
      expect(d.scale).toBe(0.8);                 // 入水 0.8（:27998）
      expect(d.alpha).toBe(0);                   // 微光支不设 α（原版无 alpha 行）
      expect(d.noGravity).toBe(true);
      expect(d.color).not.toBeNull();            // Next(6) 六掷必着色（:28000-28012）
      expect(SHIMMER_COLORS.some(([r, g, b]) =>
        d.color!.r === r && d.color!.g === g && d.color!.b === b && d.color!.a === 255)).toBe(true);
    }
    expect(h.sfx).toEqual([{ file: 'Splash_2' }]);   // :28016 style 2
    expect(h.player.buffs.has(BuffType.Shimmered)).toBe(false);   // 60 高世界地狱层门关（原版 :27946 同判）
  });

  it('蜜：20×152 vy−1→桩净 −1.5 scale1.3 α100 盒 −8+Splash_1（:28018-28029）', () => {
    const h = mkHarness();
    h.settle();
    h.fill(3);                                   // liquidType 3=蜜
    h.dusts.length = 0; h.sfx.length = 0;
    h.tick();
    expect(h.dusts.length).toBe(20);             // :28019-28027 循环 20
    for (const d of h.dusts) {
      expect(d.type).toBe(152);
      expect(d.x).toBe(d.px - 6);
      expect(d.y).toBe(d.py + h.player.h / 2 - 8);   // 盒 −8（:28022）
      expect(d.w).toBe(h.player.w + 12);
      expect(d.h).toBe(24);
      expect(d.vy).toBe(-1.5);                   // 桩链：−0.5（34/35/152 支补链）−1
      expect(d.vx).toBe(0);
      expect(d.scale).toBe(1.3);                 // :28025
      expect(d.alpha).toBe(100);                 // :28026
      expect(d.noGravity).toBe(true);
      expect(d.color).toBeNull();
    }
    expect(h.sfx).toEqual([{ file: 'Splash_1' }]);   // :28029 缺省 style=1（LegacySoundPlayer.cs:363）
  });

  it('岩浆：20×35 vy−1.5→桩净 −2 scale1.3 α100 盒 −8+Splash_1（:28045-28056）', () => {
    const h = mkHarness();
    h.settle();
    h.fill(2);                                   // liquidType 2=岩浆
    h.dusts.length = 0; h.sfx.length = 0;
    h.tick();
    expect(h.dusts.length).toBe(20);             // :28046-28054 循环 20
    for (const d of h.dusts) {
      expect(d.type).toBe(35);                   // flag25（本拍 LavaCollision）支
      expect(d.x).toBe(d.px - 6);
      expect(d.y).toBe(d.py + h.player.h / 2 - 8);   // 盒 −8（:28049）
      expect(d.w).toBe(h.player.w + 12);
      expect(d.h).toBe(24);
      expect(d.vy).toBe(-2);                     // 桩链：−0.5 −1.5
      expect(d.vx).toBe(0);
      expect(d.scale).toBe(1.3);                 // :28052
      expect(d.alpha).toBe(100);
      expect(d.noGravity).toBe(true);
      expect(d.color).toBeNull();
    }
    expect(h.sfx).toEqual([{ file: 'Splash_1' }]);   // :28056 缺省 style=1
  });
});

describe('玩家出水（Player.cs:28071-28153）', () => {
  /** 出水前置：入水拍 + 湿态静置把 wetCount 去抖耗尽（9→0） */
  const primeExit = (type: number): ReturnType<typeof mkHarness> => {
    const h = mkHarness();
    h.settle();
    h.fill(type);
    h.tick();                                    // 入水拍（wetCount 10→9）
    for (let i = 0; i < 9; i++) h.tick();        // 静置去抖 → 0
    h.dusts.length = 0; h.sfx.length = 0;
    h.drain();
    h.tick();                                    // 出水拍
    return h;
  };

  it('水：50×dustWater vy−4 盒 y+h/2（无 −8）scale0.8 α100+Splash_0（:28125-28136）', () => {
    const h = primeExit(1);
    expect(h.dusts.length).toBe(50);
    for (const d of h.dusts) {
      expect(d.type).toBe(33);
      expect(d.x).toBe(d.px - 6);
      expect(d.y).toBe(d.py + h.player.h / 2);   // 出水盒无 −8（:28129）
      expect(d.w).toBe(h.player.w + 12);
      expect(d.h).toBe(24);
      expect(d.vy).toBe(-4);                     // :28130 出水 −4
      expect(d.vx).toBe(0);
      expect(d.scale).toBe(0.8);                 // :28132
      expect(d.alpha).toBe(100);
      expect(d.noGravity).toBe(true);
    }
    expect(h.sfx).toEqual([{ file: 'Splash_0' }]);   // :28136 style 0
    expect(h.player.wetCount).toBe(9);           // :28080 置 10 → 同拍 −1
  });

  it('微光出水：scale 0.75 非入水 0.8（:28092 专测）+Splash_3（:28110）', () => {
    const h = primeExit(4);
    expect(h.dusts.length).toBe(50);
    for (const d of h.dusts) {
      expect(d.type).toBe(308);
      expect(d.y).toBe(d.py + h.player.h / 2);   // 微光盒无 −8（:28089）
      expect(d.vy).toBe(-3);                     // 桩链同入水（−4 踢同值 :28090）
      expect(d.scale).toBe(0.75);                // ★出水 0.75（:28092）——曾塌缩成单值
      expect(d.alpha).toBe(0);
      expect(d.noGravity).toBe(true);
      expect(d.color).not.toBeNull();
    }
    expect(h.sfx).toEqual([{ file: 'Splash_3' }]);   // :28110 style 3
  });

  it('蜜出水：20×152 vy−1.5 盒 −8（:28116）+Splash_1（:28123）', () => {
    const h = primeExit(3);
    expect(h.dusts.length).toBe(20);
    for (const d of h.dusts) {
      expect(d.type).toBe(152);
      expect(d.y).toBe(d.py + h.player.h / 2 - 8);   // 蜜两向均 −8
      expect(d.vy).toBe(-1.5);
      expect(d.scale).toBe(1.3);
      expect(d.alpha).toBe(100);
      expect(d.noGravity).toBe(true);
    }
    expect(h.sfx).toEqual([{ file: 'Splash_1' }]);
  });

  it('岩浆出水（上拍 lavaWet=flag24 门 :28083）：20×35 vy−2 盒 −8+Splash_1（:28143-28150）', () => {
    const h = primeExit(2);
    expect(h.dusts.length).toBe(20);
    for (const d of h.dusts) {
      expect(d.type).toBe(35);
      expect(d.y).toBe(d.py + h.player.h / 2 - 8);
      expect(d.vy).toBe(-2);
      expect(d.scale).toBe(1.3);
      expect(d.alpha).toBe(100);
      expect(d.noGravity).toBe(true);
    }
    expect(h.sfx).toEqual([{ file: 'Splash_1' }]);
  });
});

describe('wetCount 去抖门（Player.cs:27984/:28078）', () => {
  it('入水后 10t 内出水不溅（wetCount≠0 出水门短接），wetCount 继续递减', () => {
    const h = mkHarness();
    h.settle();
    h.fill(1);
    h.tick();                                    // 入水拍（wetCount 9）
    h.tick();                                    // 湿态静置（8）
    expect(h.player.wetCount).toBe(8);
    h.dusts.length = 0; h.sfx.length = 0;
    h.drain();
    h.tick();                                    // 出水拍——wetCount=8≠0 → 门短接
    expect(h.dusts.length).toBe(0);
    expect(h.sfx.length).toBe(0);
    expect(h.player.wetCount).toBe(7);           // 未重置、继续递减
  });
});

// ============ B. 浮漂 DoASplash（Projectile.cs:54839-54852） ============

describe('浮漂溅花（AI_061 :54626-54652 / :54839-54852）', () => {
  const mkBobber = (h: ReturnType<typeof mkHarness>): Bobber => {
    // 手持木钓竿（vi_2289：itemfunc shoot=360/fishingPole=5 → 存活门 :54605-54621 通过；
    // ITEM_BY_KEY[key]=物品 id 数字，ITEM_DEFS[id].key 反查 vid）
    const poleId = ITEM_BY_KEY[vanillaItemKey(2289)!]!;
    h.player.inv.slots[0] = { id: poleId, stack: 1 };
    const b = new Bobber(h.player.cx + 40, h.player.y, 0, 0, 5, 1, 5, () => h.player);
    h.setTrack(b);
    return b;
  };

  it('断线溅花（retract=2→3 :54641-54645）：100×dustWater(33) 盒(x−6,y−10,w+12,24) vy−4 scale0.8 α100 noGravity+Splash_0', () => {
    const h = mkHarness();
    const b = mkBobber(h);
    b.retract = 2;
    b.liquidKind = 'water';
    b.fixedUpdate(1 / 60, h.game as never);
    expect(b.retract).toBe(3);                   // :54641 ai[0]++（自增先于溅花判定）
    expect(h.dusts.length).toBe(100);            // :54840 循环 100
    for (const d of h.dusts) {
      expect(d.type).toBe(33);                   // dustWater()（:54843,waterStyle 0 → 33）
      expect(d.x).toBe(d.px - 6);                // :54843 position.X−6
      expect(d.y).toBe(d.py - 10);               // :54843 position.Y−10（浮漂专用盒）
      expect(d.w).toBe(b.w + 12);                // width+12
      expect(d.h).toBe(24);
      expect(d.vy).toBe(-4);                     // :54844
      expect(d.vx).toBe(0);                      // :54845 ×2.5（桩零初速）
      expect(d.scale).toBe(0.8);                 // :54846
      expect(d.alpha).toBe(100);                 // :54847
      expect(d.noGravity).toBe(true);            // :54848
      expect(d.color).toBeNull();
    }
    expect(h.sfx.filter((s) => s.file === 'Splash_0').length).toBe(1);   // :54852 style 0
    expect(h.particles.length).toBe(0);          // 旧 24 粒 spawnParticles 近似退役
  });

  it('拉杆溅花补位（:54626-54631 渔获拉出水面必溅）：reel() 渔获支 100 粒+Splash_0', () => {
    const h = mkHarness();
    const b = mkBobber(h);
    (b as unknown as { ai1: number }).ai1 = -100;    // 咬钩窗口中（biteT>0）
    b.catchId = 250;                             // 渔获（ Trout 250）
    b.floating = true;
    b.liquidKind = 'water';
    // 免 1/7 断线掷（确定性——equipStats 为冻结 getter,以 Math.random 桩隔离掷）
    const realRandom = Math.random;
    Math.random = () => 0.99;   // floor(0.99×7)=6≠0 免断线;consumeBait 掷同拍 0.99≥0.546 不耗饵(无害)
    let got = -2;
    try { got = b.reel(h.game as never); } finally { Math.random = realRandom; }
    expect(got).toBe(250);
    expect(b.dead).toBe(true);
    expect(h.dusts.length).toBe(100);            // 拉杆溅花 = DoASplash 同体 100 粒
    expect(h.sfx.filter((s) => s.file === 'Splash_0').length).toBe(1);
  });

  it('岩浆免溅门（:54629 !lavaWet）：拉杆/断线位 liquidKind=lava 零尘零音', () => {
    const h = mkHarness();
    const b = mkBobber(h);
    (b as unknown as { ai1: number }).ai1 = -100;
    b.catchId = 250;
    b.floating = true;
    b.liquidKind = 'lava';
    const realRandom = Math.random;
    Math.random = () => 0.99;
    let got = -2;
    try { got = b.reel(h.game as never); } finally { Math.random = realRandom; }
    expect(got).toBe(250);
    expect(h.dusts.length).toBe(0);              // 岩浆拉杆不溅（原版同门）
    expect(h.sfx.filter((s) => s.file === 'Splash_0').length).toBe(0);
  });
});

// ============ C. 浮漂通用湿段（Projectile.cs:16903-17113;2026-09-06 残差批接入） ============

describe('浮漂通用湿段（:16903-17113 受段;入水 10 粒与 DoASplash 100 粒两支并存）', () => {
  const mkFlyingBobber = (h: ReturnType<typeof mkHarness>): Bobber => {
    const poleId = ITEM_BY_KEY[vanillaItemKey(2289)!]!;
    h.player.inv.slots[0] = { id: poleId, stack: 1 };
    // 池上方半空出生、下落触液（池 rows14-17/floor row18——头注①钳制窗内）
    const b = new Bobber(20 * TILE, 12 * TILE, 0, 8, 5, 1, 5, () => h.player);
    h.setTrack(b);
    return b;
  };

  it('入水溅花改由通用湿段承载：10×dustWater(33) 盒(x−6,y+h/2−8,w+12,24) vy−4 scale1.3 α100 + Splash_1（旧 playSfx(\'splash\') 乱掷退役）', () => {
    const h = mkHarness();
    h.fill(1);
    const b = mkFlyingBobber(h);
    // ★不折返跑满窗：盒沿探针（湿段,位移前）晚于落定探针（浮起判定,位移后）一拍,
    // 入水溅花在浮起次拍才触发——提前 break 会漏采
    for (let t = 0; t < 40 && !b.dead; t++) b.fixedUpdate(1 / 60, h.game as never);
    expect(b.floating).toBe(true);
    expect(h.sfx.filter((s) => s.file === 'SYN:splash').length).toBe(0);   // 旧乱掷音退役
    expect(h.sfx.filter((s) => s.file === 'Splash_1').length).toBe(1);     // :16975 缺省 style 1
    const splashDust = h.dusts.filter((d) => d.type === 33);
    expect(splashDust.length).toBe(10);                                    // :16966 循环 10
    for (const d of splashDust) {
      expect(d.x).toBe(d.px - 6);                                          // position.X−6
      expect(d.y).toBe(d.py + b.h / 2 - 8);                                // 入水盒 −8（:16966）
      expect(d.w).toBe(b.w + 12);
      expect(d.h).toBe(24);
      expect(d.vy).toBe(-4);                                               // :16968（水支型内预处理池内已植）
      expect(d.vx).toBe(0);                                                // ×2.5（桩零初速）
      expect(d.scale).toBe(1.3);                                           // :16969
      expect(d.alpha).toBe(100);                                           // :16970
      expect(d.noGravity).toBe(true);
      expect(d.color).toBeNull();
    }
    expect(b.wet).toBe(true);
    expect(h.particles.length).toBe(0);                                    // 旧 spawnParticles 通道零调用
  });

  it('漂浮湿态零重溅（:16949 !wet 门）：续拍尘/音零增量,wet 恒真', () => {
    const h = mkHarness();
    h.fill(1);
    const b = mkFlyingBobber(h);
    for (let t = 0; t < 40 && !(b.floating && h.dusts.length > 0); t++) {
      b.fixedUpdate(1 / 60, h.game as never);
    }
    expect(b.floating).toBe(true);
    expect(h.dusts.length).toBe(10);            // 入水溅花已发生（10 粒）
    const nDust = h.dusts.length, nSfx = h.sfx.length;
    for (let t = 0; t < 10; t++) b.fixedUpdate(1 / 60, h.game as never);
    expect(h.dusts.length).toBe(nDust);          // 盒沿恒湿 → 不重触发（wetCount 门亦不涉）
    expect(h.sfx.length).toBe(nSfx);
    expect(b.wet).toBe(true);
  });
});
