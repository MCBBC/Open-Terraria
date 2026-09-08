// ★弹幕湿段登记残差五件批回归（2026-09-08——projWetSection 共享体残差清偿）：
//  ①PortalGunBolt 601 shimmer 弹反钩（aiStyle1 弹反族 A,P.cs:22606-22625——深浸
//    Kill/vy>0 弹反+timeLeft 600 钳−60+shimmerWet/wet 双清;中央清单销号）。
//  ②601 寿命头杀拍湿段（原版 timeLeft--/Kill 在子步环尾 :17307-17311,湿段无
//    active 门照跑;Arrow wetSectionRan 闩配方双调用点——杀拍预置面为可观测锚）。
//  ③TideSlash 瞬击传送拍采样盒（AI_081 传送写位 :31673-31676 与骑乘 :31682 在湿段
//    【前】——湿段调用点挪正后传送拍溅花当拍即发）。
//  ④238/244/239/245 豁免四型出生预置面（NewProjectile :10887-10893 无条件跑——
//    wet 反清+honey/shimmer 无条件写;RainCloudProj aiRain/aiDrop 头承接,豁免早退
//    下零溅花;AI_045 零湿旗消费=惰性面 1:1 完整性）。
//  ⑤WhipProj F5 五支 kill 门定谳翻案结构锁（五支实为 AI_160_Kites :49309-49331,
//    AI_165_Whip :48539 零 owner 态杀门——禁按旧台账回灌）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { PortalGunBolt } from '../src/entities/PortalGunBolt';
import { TideSlash } from '../src/entities/TideSlash';
import { RainCloudProj } from '../src/entities/WeaponProj';
import { WhipProj } from '../src/entities/WhipProj';
import { projectileData } from '../src/data/vanillaProjectiles';
import { LIQUID_TYPE } from '../src/world/TileStore';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

const LIQ = 255;
/** 液带：列 [x0..x1] 行 [y0..y1] 满格液体（type=LIQUID_TYPE: 0 通用液/3 蜜/4 微光） */
function liquidAt(w: World, x0: number, x1: number, y0: number, y1: number,
  type = LIQUID_TYPE.NONE): void {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const i = w.store.idx(x, y);
      w.store.liquid[i] = LIQ;
      w.store.liquidType[i] = type;
    }
  }
}

type DustRec = {
  x: number; y: number; w: number; h: number; type: number;
  d: { vx: number; vy: number; scale: number; alpha: number; noGravity: boolean; color: unknown };
};
/** stub game：splash/dust 计数 + 空敌桶（可覆写）+ 离屏玩家 */
function makeGame(w: World): { g: GameHooks; dust: DustRec[]; splash: string[] } {
  const dust: DustRec[] = [];
  const splash: string[] = [];
  const px = 20 * TILE, py = 20 * TILE;
  const g = {
    world: w,
    player: { x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21, dead: true, iframes: 0,
      buffs: { has: () => false },
      equipStats: { frostBurn: false, magmaStone: false },
      critChance: () => 0.04 },
    enemies: () => [] as unknown[], critters: () => [], npcs: () => [],
    spawnDust: (x: number, y: number, bw: number, bh: number, type = 0) => {
      const d = { vx: 1, vy: 1, scale: 1, alpha: 0, noGravity: false, color: null as unknown };
      dust.push({ x, y, w: bw, h: bh, type, d });
      return d;
    },
    playSfxWav: (name: string) => { if (String(name).startsWith('Splash')) splash.push(String(name)); },
    spawnParticles: () => {},
    playSfx: () => {}, playSfxAt: () => {},
    playSfxFiles: () => {}, playSfxFile: () => {},
    spawnBurst: () => {},
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    notifyInventoryChanged: () => {}, addLightAt: () => {},
    entities: { add: () => {}, projectiles: [] as unknown[] },
  } as unknown as GameHooks;
  return { g, dust, splash };
}

function mkWorld(): World {
  return new World(120, 160, 30, 'open');
}

/** 溅花尘识别：wetSplashStepShared 弹面盒 (w+12, 24) */
const isSplashDust = (d: { w: number; h: number }, w: number): boolean => d.w === w + 12 && d.h === 24;

afterEach(() => { vi.restoreAllMocks(); });

// =====================================================================
// 数据面：面依赖抽查（601 aiStyle=1 → 弹反族 A;雨云四型 ignoreWater=true）
// =====================================================================
describe('数据面抽查（shimmer 面/豁免预置面依赖行）', () => {
  it('601 aiStyle=1 且不豁免（弹反族 A 分派依赖,SetDefaults :6504-6512）', () => {
    expect(projectileData(601)?.aiStyle).toBe(1);
    expect(projectileData(601)?.ignoreWater).toBeFalsy();
  });
  it('451 aiStyle=81 且不豁免（TideSlash 挪位面依赖,SetDefaults :5231-5241）', () => {
    expect(projectileData(451)?.aiStyle).toBe(81);
    expect(projectileData(451)?.ignoreWater).toBeFalsy();
  });
  it('雨云四型 ignoreWater=true（:3199/:3206/:3269/:3276——豁免预置面门）', () => {
    for (const id of [238, 244, 239, 245]) {
      expect(projectileData(id)?.ignoreWater, `id ${id}`).toBe(true);
    }
  });
});

// =====================================================================
// ① 601 PortalGunBolt shimmer 弹反族 A（P.cs:22606-22625）
// =====================================================================
describe('PortalGunBolt ⑧shimmer 弹反族 A（601 aiStyle1, hooks.shimmer 接面）', () => {
  it('下落穿入微光池：vy>0 弹反 ×-1 + timeLeft 600 钳 −60 + shimmerWet/wet 双清（:22613-:22620）', () => {
    const w = mkWorld();
    liquidAt(w, 55, 70, 80, 90, LIQUID_TYPE.SHIMMER);       // 微光池 px y[1280,1456)
    const { g, splash, dust } = makeGame(w);
    const s = new PortalGunBolt(1000, 1200, 0, 3, 0);        // 干出生（行 75）向下 3px/子步
    s.fixedUpdate(1 / 60, g);
    // 子步 k=25（y=1275）中心盒触池 → 入水溅花（微光档）当拍弹反
    expect(splash.length).toBe(1);
    expect(dust.some((d) => isSplashDust(d, 10))).toBe(true);
    expect(s.vy).toBe(-3);                                   // :22613 velocity.Y *= -1
    expect((s as unknown as { life: number }).life).toBe(540);   // :22615-22618 600 钳 −60
    expect(s.shimmerWet).toBe(false);                        // :22619
    expect(s.wet).toBe(false);                               // :22620
    expect(s.dead).toBe(false);                              // 非深浸（上格干）→ 不 Kill
    expect(s.y).toBeLessThan(1280);                          // 弹反后已离池
  });

  it('timeLeft<600 弹反不钳上只 −60（life 100 → tick 头 −1 → 99 −60 = 39,:22615 门只钳大值）', () => {
    const w = mkWorld();
    liquidAt(w, 55, 70, 80, 90, LIQUID_TYPE.SHIMMER);
    const { g } = makeGame(w);
    const s = new PortalGunBolt(1000, 1200, 0, 3, 0);
    (s as unknown as { life: number }).life = 100;
    s.fixedUpdate(1 / 60, g);
    // 原版 timeLeft-- 在子步【尾】(:17307,弹反 −60 后) → 100→40→39;本仓头递减先于
    // 段（100→99→39）终值同拍等价
    expect((s as unknown as { life: number }).life).toBe(39);
  });

  it('深浸（判定列满格微光+上一格微光）→ Kill（:22608-22610;出生即浸,首湿段拍消亡）', () => {
    const w = mkWorld();
    liquidAt(w, 55, 70, 80, 95, LIQUID_TYPE.SHIMMER);        // 深柱（上行 86 亦微光满格）
    const { g, splash } = makeGame(w);
    const s = new PortalGunBolt(1000, 1400, 0, 3, 0);        // 行 87 出生盒在柱内
    s.fixedUpdate(1 / 60, g);
    expect(s.dead).toBe(true);
    expect(splash.length).toBe(0);                           // 出生预置 wet=true → 入水溅花门 !wet 闭
  });
});

// =====================================================================
// ② 601 寿命头杀拍湿段（Update :17307-17311 子步环尾 Kill,湿段 :16895 无 active 门）
// =====================================================================
describe('PortalGunBolt 杀拍湿段（life 尽头杀拍补跑,Arrow wetSectionRan 闩配方）', () => {
  it('水中出生 life=1：杀拍湿段跑出生预置 → 死拍 wet=true（未修=恒 false）', () => {
    const w = mkWorld();
    liquidAt(w, 55, 70, 80, 90, LIQUID_TYPE.NONE);           // 水带（type 0 通用液）
    const { g } = makeGame(w);
    const s = new PortalGunBolt(1000, 1300, 0, 0, 0);        // 盒在水带内,零速
    (s as unknown as { life: number }).life = 1;
    s.fixedUpdate(1 / 60, g);
    expect(s.dead).toBe(true);
    expect(s.wet).toBe(true);                                // 杀拍段预置落账（:10887-10893）
  });

  it('蜂蜜中出生 life=1：杀拍预置 honeyWet 无条件写（:10892）+ wet 同置（非豁免不反清）', () => {
    const w = mkWorld();
    liquidAt(w, 55, 70, 80, 90, LIQUID_TYPE.HONEY);
    const { g } = makeGame(w);
    const s = new PortalGunBolt(1000, 1300, 0, 0, 0);
    (s as unknown as { life: number }).life = 1;
    s.fixedUpdate(1 / 60, g);
    expect(s.dead).toBe(true);
    expect(s.honeyWet).toBe(true);
    expect(s.wet).toBe(true);
  });

  it('活拍闩不破：满寿命飞行 31 子步逐子步湿段（湿位移 46.5 守恒,闩不吞活拍）', () => {
    const w = mkWorld();
    liquidAt(w, 55, 70, 80, 90, LIQUID_TYPE.NONE);
    const { g } = makeGame(w);
    const s = new PortalGunBolt(1000, 1300, 3, 0, 0);        // 出生在水带内
    const x0 = s.x;
    s.fixedUpdate(1 / 60, g);
    expect(s.wet).toBe(true);
    expect(s.x - x0).toBeCloseTo(46.5, 6);                   // 31 子步 × 3 × 0.5
  });
});

// =====================================================================
// ③ TideSlash 瞬击传送拍采样盒（AI_081 :31673-31676 写位在湿段前）
// =====================================================================
describe('TideSlash 瞬击传送拍采样盒（湿段调用点挪正=AI 后/位移前）', () => {
  it('传送拍（拍 2）：采样盒=传送后位（水内）→ 入水溅花当拍即发 + wet 置位', () => {
    const w = mkWorld();
    liquidAt(w, 40, 70, 74, 88, LIQUID_TYPE.NONE);           // 水带 px x[640,1136) y[1184,1424)
    const { g, splash } = makeGame(w);
    // 敌中心 (740,1300)：传送环半径 100 → 传送后盒 [c-8,c+8) 恒与水带相交（带深 240px）
    const enemy = { id: 1, x: 720, y: 1272, w: 40, h: 56, cx: 740, cy: 1300,
      vx: 0, vy: 0, dead: false };
    (g as unknown as { enemies: () => unknown[] }).enemies = () => [enemy];
    const s = new TideSlash(15, 0, 40, 2, 3);
    s.x = 500; s.y = 1300;                                   // 干位（列 31-32,带外）
    (s as unknown as { ai0: number; alpha: number }).ai0 = 2;
    (s as unknown as { ai0: number; alpha: number }).alpha = 230;   // 拍 2 才达 255 触传送
    let teleported = false;
    const perTickSplash: number[] = [];
    for (let t = 0; t < 2; t++) {
      const before = splash.length;
      s.fixedUpdate(1 / 60, g);
      perTickSplash.push(splash.length - before);
      // 传送判据：拍内位置跃迁 >60px（传送 ≤100px 环写位+位移 15px;正常拍 ≤~11px）
      if (Math.hypot(s.cx - 740, s.cy - 1300) < 150) teleported = true;
    }
    expect(teleported).toBe(true);
    expect(perTickSplash[0]).toBe(0);                        // 拍 1 干位采样（预置干,零溅花）
    expect(perTickSplash[1]).toBe(1);                        // 拍 2 传送 → 采样盒=传送后位 → 当拍溅花
    expect(s.wet).toBe(true);
  });

  it('掷出相采样位不变（AI 零位写 → 挪位前后同拍等价,守恒）', () => {
    const w = mkWorld();
    liquidAt(w, 40, 70, 74, 88, LIQUID_TYPE.NONE);
    const { g, splash } = makeGame(w);
    const s = new TideSlash(5, 0, 40, 2, 3);                 // 掷出相 spdN=1
    s.x = 850; s.y = 1360;                                   // 行 85 水带内（盒右缘 x+13>640 已入带）
    const wets: boolean[] = [];
    for (let t = 0; t < 6; t++) {
      s.fixedUpdate(1 / 60, g);
      wets.push(s.wet);
    }
    expect(wets[0]).toBe(true);                              // 出生盒在带内 → 预置湿
    expect(splash.length).toBe(0);                           // 预置 wet=true → 入水溅花门 !wet 闭
    expect(wets.every(Boolean)).toBe(true);
  });
});

// =====================================================================
// ④ 雨云豁免四型出生预置面（NewProjectile :10887-10893 无豁免支）
// =====================================================================
describe('RainCloudProj 豁免四型出生预置（aiRain/aiDrop 头承接,豁免早退零溅花）', () => {
  it('238 降雨云蜜中出生：honeyWet 无条件写 + wet 反清 + 零溅花（:10888-:10893）', () => {
    const w = mkWorld();
    liquidAt(w, 55, 70, 80, 90, LIQUID_TYPE.HONEY);
    const { g, splash, dust } = makeGame(w);
    const s = new RainCloudProj(1000, 1300, 0, 0, 10, 0, 238);
    for (let t = 0; t < 3; t++) s.fixedUpdate(1 / 60, g);
    expect(s.wet).toBe(false);                               // :10888-10891 ignoreWater 反清
    expect(s.honeyWet).toBe(true);                           // :10892 无条件赋值（原文无豁免支）
    expect(s.shimmerWet).toBe(false);
    expect(splash.length).toBe(0);                           // 湿段整段门 → 零溅花
    expect(dust.length).toBe(0);
  });

  it('239 雨滴微光中出生：shimmerWet 写 + wet 反清 + 零溅花（AI 微光反弹走直读 tile :28503）', () => {
    const w = mkWorld();
    liquidAt(w, 55, 70, 80, 90, LIQUID_TYPE.SHIMMER);
    const { g, splash } = makeGame(w);
    const s = new RainCloudProj(1000, 1330, 0, 5, 10, 0, 239);
    for (let t = 0; t < 3 && !s.dead; t++) s.fixedUpdate(1 / 60, g);
    expect(s.wet).toBe(false);
    expect(s.shimmerWet).toBe(true);                         // :10893 无条件赋值
    expect(s.honeyWet).toBe(false);
    expect(splash.length).toBe(0);
  });

  it('245 雨滴水中出生：三旗全 false（预置读水无 honey/shimmer,wet 反清）', () => {
    const w = mkWorld();
    liquidAt(w, 55, 70, 80, 90, LIQUID_TYPE.NONE);
    const { g, splash } = makeGame(w);
    const s = new RainCloudProj(1000, 1300, 0, 5, 10, 0, 245);
    for (let t = 0; t < 3 && !s.dead; t++) s.fixedUpdate(1 / 60, g);
    expect(s.wet).toBe(false);
    expect(s.honeyWet).toBe(false);
    expect(s.shimmerWet).toBe(false);
    expect(splash.length).toBe(0);
  });
});

// =====================================================================
// ⑤ WhipProj F5 定谳翻案结构锁（AI_165 零 owner 怀杀门;禁按旧台账回灌五支）
// =====================================================================
describe('WhipProj F5 结构锁（五支系 AI_160_Kites :49309-49331 误锚,AI_165 :48539 零 owner 杀门）', () => {
  const whipSrc = readFileSync(new URL('../src/entities/WhipProj.ts', import.meta.url), 'utf8');
  // 代码面（剥行注释——判语注本身引用支名,不参与锁）
  const whipCode = whipSrc.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  it('不持有 CCed/noItems/pulley/held.shoot!=type 任一 owner 态杀门（原版 AI_165 无此面）', () => {
    expect(whipCode).not.toMatch(/CCed/);
    expect(whipCode).not.toMatch(/noItems/);
    expect(whipCode).not.toMatch(/pulley/);
    expect(whipCode).not.toMatch(/selectedItem\]\.shoot/);
  });
  it('误锚回滚锁：dead→Kill 早退门不存在（同锚产物 2026-09-08 回滚,防回灌）', () => {
    expect(whipCode).not.toMatch(/owner\?\.dead/);
  });
  it('翻案判语注在位（防后车按旧台账补接五支/重引 :49309 误锚）', () => {
    expect(whipSrc).toContain('F5 定谳');
    expect(whipSrc).toContain('AI_160_Kites');
    expect(whipSrc).toContain(':48552-48556');
  });

  // ---- 误锚回滚行为面：owner 死后鞭飞满程（原版无 owner 态杀门）----
  it('owner 死后鞭飞满程（旧 dead→Kill 门=首拍杀;回滚后自然寿命尽才灭,:48552-48556 唯一 Kill）', () => {
    const w = mkWorld();
    const { g } = makeGame(w);
    const player = new Player(60 * TILE, 90 * TILE, new Inventory());
    player.dead = true;
    const whip = new WhipProj(player.cx, player.cy, 0, 912, 4911, 14, 1, 30, 4, () => player);
    const ttf = whip.timeToFlyOut;                       // anim 30 × MaxUpdates 2 = 60
    expect(ttf).toBe(60);
    let ticks = 0;
    for (let t = 0; t < 60 && !whip.dead; t++) { whip.fixedUpdate(1 / 60, g); ticks++; }
    expect(ticks).toBe(ttf / 2);                         // ai0 每 tick +2 → 30 拍自然寿命尽
    expect(whip.dead).toBe(true);                        // 死因=ai0≥timeToFlyOut,非 owner 门
    expect(whip.x).toBe(player.cx);                      // 全程锚随玩家（:48550 GetArmPosition 载体）
  });
});
