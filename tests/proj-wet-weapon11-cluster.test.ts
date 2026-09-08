// ★通用湿段·武器弹 11 类接入回归（2026-09-06 R3 漏网类批——projWetSection 共享体
//  逐类接线 + GrenadeProj 拍序口径 + Boomerang 杀拍推广）。
//  域（WeaponProj.ts）:GlowstickProj 50/53/515/870/1089/473、FlailProj 25/26/35/63/
//  154/247/757/947/948/1058、FlaironHeadProj 404/FlaironSpike 405、SpearProj
//  (DefaultToSpear 全型+短剑刺+481)、AnchoredProj 23/262/271/273、MolotovProj 399、
//  CounterweightProj 556-561/1079、YoyoShotProj 1125(豁免)/1130/1134/1135、
//  TorchGodHelperProj 1084、DaybreakFlare 636（钉扎态 ai0 门豁免）、GrenadeProj 全域、
//  Boomerang 杀拍（life 尽拍湿段补跑）。
//  豁免定谳（1457 SetDefaults 逐块脚本扫描+Range 块直读,扫描器对 PROJ_IGNORE_WATER
//  270 id 零假阳交叉验证）：11 类域内 id 均无 ignoreWater 行（缺行=不豁免=缺省
//  false :763）;唯 1125 CascadeExplosion 显式 ignoreWater=true（:10530 块）→
//  数据面分流自动跳段。
//  原版锚：Projectile.cs:16903-17113 湿段（AI :16880 → 湿段 → HandleMovement :17120,
//  numUpdates 环内 :16781-17345 = extraUpdates 型逐子步）/ :47771 AI_016 入液引信门
//  （读【上子步】旗）/ :20555-20562 UpdatePosition（tileCollide=false 湿位移 =
//  wetVelocity 快照 quirk）/ :17307-17311 timeLeft Kill 在子步【尾】（杀拍湿段照跑,
//  :16903 无 active 门）。
//  stub 纪律：spawnDust 桩返回【可变尘对象】并保留 type 参（proj-wet-cache.test.ts
//  :252-256 范式）——溅花面 wetSplashStepShared 对尘做绝对覆写（scale/alpha/
//  noGravity）,return null 桩会把覆写面静默吞掉（反向陷阱）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import {
  GlowstickProj, SpearProj, AnchoredProj, MolotovProj, CounterweightProj,
  YoyoShotProj, FlailProj, FlaironSpike, FlaironHeadProj, GrenadeProj,
  TorchGodHelperProj, DaybreakFlare, Boomerang,
} from '../src/entities/WeaponProj';
import { projectileData } from '../src/data/vanillaProjectiles';

const LIQ = 255;
/** 水带：列 [30..40] 行 [60..70] 满格液体（type 0=水）→ px [480,656]×[960,1136]。
 *  World 构造器零地形（空 TileStore=全空气）→ 飞行走廊无块碰撞干扰 */
function mkWorld(): World {
  const w = new World(120, 160, 30, 'open');
  w.clock.timeOfDay = 0;
  for (let x = 30; x <= 40; x++) {
    for (let y = 60; y <= 70; y++) {
      const i = w.store.idx(x, y);
      w.store.liquid[i] = LIQ;
      w.store.liquidType[i] = 0;
    }
  }
  return w;
}

interface Harness {
  g: GameHooks;
  w: World;
  player: Player;
  dust: Array<{ x: number; y: number; w: number; h: number; type: number }>;
  splash: string[];
}

/** stub game：spawnDust 可变尘对象（保留 type 参）/ Splash 音捕获 / 空敌桶 */
function mkGame(w: World, player?: Player): Harness {
  const dust: Harness['dust'] = [];
  const splash: string[] = [];
  const pl = player ?? new Player(20 * TILE, 30 * TILE, new Inventory());
  const g = {
    world: w,
    player: pl,
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDust: (x: number, y: number, bw: number, bh: number, type: number) => {
      const d = { vx: 1, vy: 1, scale: 1, alpha: 0, noGravity: false, color: null as unknown };
      dust.push({ x, y, w: bw, h: bh, type });
      return d;
    },
    playSfxWav: (name: string) => { if (String(name).startsWith('Splash')) splash.push(String(name)); },
    spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    cutTile: () => {}, spawnDrop: () => null, damagePlayer: (): number => 0,
    addDamageNumber: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    notifyInventoryChanged: () => {}, mapFullscreen: () => false,
    spawnFriendlyProj: () => {}, addLightAt: () => {},
  } as unknown as GameHooks;
  return { g, w, player: pl, dust, splash };
}

/** 溅花尘识别：wetSplashStepShared 弹面盒 (w+12, 24) */
const splashDust = (h: Harness, w: number) => h.dust.filter((e) => e.w === w + 12 && e.h === 24);
const tickN = (e: { fixedUpdate: (dt: number, g: GameHooks) => void }, h: Harness, n: number) => {
  for (let i = 0; i < n; i++) e.fixedUpdate(1 / 60, h.g);
};

// =====================================================================
// 数据面：豁免定谳（11 类域 ↔ SetDefaults ignoreWater 行一致）
// =====================================================================
describe('豁免数据面（1457 SetDefaults 逐块扫描交叉验证）', () => {
  it('11 类域 id 全受段（无 ignoreWater 行,缺行=不豁免同向）', () => {
    const inSection = [
      50, 53, 515, 870, 1089, 473,                                    // GlowstickProj
      25, 26, 35, 63, 154, 247, 757, 947, 948, 1058,                  // FlailProj
      404, 405,                                                        // FlaironHead/Spike
      46, 47, 49, 64, 66, 97, 105, 130, 153, 212, 215, 218, 222,      // SpearProj
      342, 367, 368, 481, 730, 877, 878, 879, 1103, 802, 842,
      938, 939, 940, 941, 942, 943, 944, 945,
      23, 262, 271, 273,                                               // AnchoredProj
      399,                                                             // MolotovProj
      556, 557, 558, 559, 560, 561, 1079,                              // CounterweightProj
      1130, 1134, 1135,                                                // YoyoShotProj（受段三型）
      1084,                                                            // TorchGodHelperProj
      636,                                                             // DaybreakFlare
      28, 29, 30, 37, 397, 470, 516, 517, 519, 637, 655, 75, 102, 108, // GrenadeProj 域
      773, 903, 904, 905, 906, 910, 911, 930, 1086, 1087, 1088, 588,
      681, 779, 783, 862, 863,
      ...Array.from({ length: 12 }, (_, k) => 133 + k),
      303, ...Array.from({ length: 4 }, (_, k) => 338 + k),
      ...Array.from({ length: 26 }, (_, k) => 776 + k),
    ];
    for (const id of inSection) {
      expect(projectileData(id)?.ignoreWater ?? false, `id ${id} 应受段`).toBe(false);
    }
  });
  it('1125 CascadeExplosion 豁免（:10530 块显式 ignoreWater=true）', () => {
    expect(projectileData(1125)?.ignoreWater).toBe(true);
  });
});

// =====================================================================
// 逐类溅花接线（干区出生 → 入水带 → 溅花尘 ×10 + Splash_1）
// =====================================================================
describe('★逐类湿段接线（入水溅花面）', () => {
  it('GlowstickProj 50：飞行渡入水列 → d33×10 盒 (w+12,24) + Splash_1;位移吃湿阻尼', () => {
    const h = mkGame(mkWorld());
    const e = new GlowstickProj(400, 1000, 20, 0, 50);   // 6×6,干区起步
    tickN(e, h, 5);                                       // tick5 起位 x=480 入列缘 → 溅花
    const s5 = splashDust(h, 6);
    expect(s5.length).toBe(10);                           // :16950-16958 ×10
    expect(s5.every((x) => x.type === 33)).toBe(true);    // dustWater() 缺省档
    expect(s5[0].x).toBeCloseTo(480 - 6, 5);              // 盒左 = position−6（fp 累积容差）
    expect(h.splash).toEqual(['Splash_1']);
    const xBefore = e.x;
    e.fixedUpdate(1 / 60, h.g);
    expect(e.x - xBefore).toBeCloseTo(20 * 0.97 * 0.5, 5);   // 湿阻尼 0.5（AI 摩擦 ×0.97 先行,dry 拍 19.4）
  });

  it('SpearProj 46（AI 直写包络位）：玩家入水 → 包络位溅花;阻尼 N/A（tileCollide=false 留锚）', () => {
    const h = mkGame(mkWorld());
    h.player.x = 45 * TILE; h.player.y = 62 * TILE;       // 干列 45（水带 30..40 右侧）
    const e = new SpearProj(1, 0, 2.4, 30, 10, 1, 46);    // SPEAR_SIZE[46]=20×20
    tickN(e, h, 1);                                       // 出生拍：包络位干区预置
    expect(splashDust(h, 20).length).toBe(0);
    h.player.x = 34 * TILE;                               // 玩家入水 → 包络位随写
    e.fixedUpdate(1 / 60, h.g);
    expect(splashDust(h, 20).length).toBe(10);
    expect(h.splash).toEqual(['Splash_1']);
  });

  it('AnchoredProj 23：出膛渡入水列 → 溅花（tick 头插位=AI 写位前后同位）', () => {
    const h = mkGame(mkWorld());
    h.player.x = 12 * TILE; h.player.y = 62 * TILE;       // 出膛点=玩家心（干区）
    const e = new AnchoredProj(1, 0, 20, 10, 1, 23);      // 4×4 vx=20
    tickN(e, h, 15);                                      // tick15 起位 x=200+20×14=480 入列
    expect(splashDust(h, 4).length).toBe(10);
    expect(h.splash).toEqual(['Splash_1']);
  });

  it('MolotovProj 399：渡入水 → 溅花;湿钳收编字段读（入水次拍 timeLeft=3,再 2 拍爆）', () => {
    const h = mkGame(mkWorld());
    const fires: Array<[number, number]> = [];
    let boom68 = 0;
    const e = new MolotovProj(400, 1000, 20, 0, 30, (x, y) => { fires.push([x, y]); boom68++; });
    tickN(e, h, 5);                                       // tick5 起位 x=480 入水
    expect(splashDust(h, 14).length).toBe(10);
    expect(h.splash).toEqual(['Splash_1']);
    expect(e.dead).toBe(false);
    e.fixedUpdate(1 / 60, h.g);                           // 次拍：旗读钳 3 → 同拍尾递减 2（原版 AI 钳/尾减同 update）
    expect((e as unknown as { timeLeft: number }).timeLeft).toBe(2);
    expect(fires.length).toBe(0);
    tickN(e, h, 2);                                       // 2→1→0 爆
    expect(boom68).toBe(6);                               // 一次 breakOpen=6 朵火云（回调即 spawnFires）
  });

  it('CounterweightProj 556（回收态）：球位移入水 → 溅花（AI 无 position 写面,tick 内位有效）', () => {
    const h = mkGame(mkWorld());
    const ctx = {
      owner: () => h.player,
      channel: () => false,                               // 即回收态（ai0=-1）
      yoyoInPlay: () => true,
      mouseDelta: () => ({ dx: 0, dy: 0 }),
    };
    const e = new CounterweightProj(300, 800, 10, 1, 556, 0, ctx as never);
    tickN(e, h, 1);                                       // 干区预置 + 转回收
    e.x = 34 * TILE; e.y = 64 * TILE;                     // 球入水（回收 AI 不改写位）
    e.fixedUpdate(1 / 60, h.g);
    expect(splashDust(h, 10).length).toBe(10);
    expect(h.splash).toEqual(['Splash_1']);
  });

  it('YoyoShotProj：1134 渡位入水溅花;1125 豁免分流零溅花零旗', () => {
    const h = mkGame(mkWorld());
    const e = new YoyoShotProj({ x: 400, y: 1000, vx: 1, vy: 0, projId: 1134, dmg: 10, kb: 1 });
    tickN(e, h, 1);
    e.x = 34 * TILE; e.y = 64 * TILE;                     // AI 无位移积分 → 位保持
    e.fixedUpdate(1 / 60, h.g);
    expect(splashDust(h, 6).length).toBe(10);
    expect(h.splash).toEqual(['Splash_1']);
    // 1125：ignoreWater=true → 段门恒闭（出生水中也不溅、旗不置）
    const h2 = mkGame(mkWorld());
    const e2 = new YoyoShotProj({ x: 34 * TILE, y: 64 * TILE, vx: 1, vy: 0, projId: 1125, dmg: 10, kb: 1 });
    tickN(e2, h2, 3);
    expect(splashDust(h2, 32).length).toBe(0);
    expect(h2.splash.length).toBe(0);
    expect(e2.wet).toBe(false);
  });

  it('FlaironSpike 405 / FlaironHeadProj 404：飞行渡入水列 → 溅花', () => {
    const h = mkGame(mkWorld());
    const spike = new FlaironSpike(400, 1000, 20, 0, 10, 1);
    tickN(spike, h, 5);                                   // 衰减飞行 x_5≈470.5,探针越 480
    expect(splashDust(h, 14).length).toBe(10);
    expect(h.splash).toEqual(['Splash_1']);
    const h2 = mkGame(mkWorld());
    h2.player.x = 18 * TILE; h2.player.y = 64 * TILE;     // 玩家近旁（dist<400 保持出程态）
    const head = new FlaironHeadProj(340, 1024, 20, 0, 10, 1);
    tickN(head, h2, 8);                                   // 340+20×7=480 入列
    expect(splashDust(h2, 26).length).toBe(10);
    expect(h2.splash).toEqual(['Splash_1']);
  });

  it('TorchGodHelperProj 1084：逐【子步】湿段（3 run/tick）渡入水 → 溅花', () => {
    const h = mkGame(mkWorld());
    let trail = 0;
    const e = new TorchGodHelperProj(400, 1000, 20, 0, 0, 100, 130,
      () => {}, () => { trail++; });
    tickN(e, h, 1);                                       // run 位 400/420/440 干
    expect(splashDust(h, 4).length).toBe(0);
    e.fixedUpdate(1 / 60, h.g);                           // run1 位 460 干 → run2 位 480 湿
    expect(splashDust(h, 4).length).toBe(10);
    expect(h.splash).toEqual(['Splash_1']);
    expect(trail).toBe(24);                               // 每子步 4 粒×3 run×2 tick=24 照跑
  });

  it('DaybreakFlare 636（飞行相逐子步）：渡入水 → 溅花;P1 飞行相非豁免', () => {
    const h = mkGame(mkWorld());
    const e = new DaybreakFlare(400, 1000, 20, 0, 10, 1);
    tickN(e, h, 2);                                       // 2 EU 子步/tick:x 400→480
    expect(splashDust(h, 16).length).toBe(0);
    e.fixedUpdate(1 / 60, h.g);                           // 子步 1 位 480 → 溅花
    expect(splashDust(h, 16).length).toBe(10);
    expect(h.splash).toEqual(['Splash_1']);
  });

  it('FlailProj 25：掷出→垂悬位移入水 → 溅花', () => {
    const h = mkGame(mkWorld());
    let held = false;
    const e = new FlailProj(310, 810, 10, 1, 25, () => held, () => ({ x: 560, y: 1024 }));
    tickN(e, h, 1);                                       // 松手掷出（st=1 朝水带）
    held = true;                                          // 再按 → 垂地悬荡（st=6,积分位存活）
    tickN(e, h, 2);
    e.x = 34 * TILE; e.y = 64 * TILE;                     // 球入水（st6 AI 无 position 写面）
    e.fixedUpdate(1 / 60, h.g);
    expect(splashDust(h, 19).length).toBe(10);            // 25 命中盒 19（22×0.9 截断）
    expect(h.splash).toEqual(['Splash_1']);
  });

  it('FlailProj 948→947 变型走【湿段旗】（湿段首测湿拍同拍变型=原文 :44542 当拍旗位;岩浆豁免）', () => {
    const h2 = mkGame(mkWorld());
    let held2 = false;
    const f = new FlailProj(310, 810, 10, 1, 948, () => held2, () => ({ x: 560, y: 1024 }));
    tickN(f, h2, 1);
    held2 = true;
    tickN(f, h2, 2);
    f.x = 34 * TILE; f.y = 64 * TILE;
    f.fixedUpdate(1 / 60, h2.g);                          // 湿段首测湿 → 同拍检查变型
    expect(f.wet).toBe(true);
    expect(f.projId).toBe(947);
    // 岩浆：wet 与 lavaWet 同真 → !lavaWet 门拦变型（粘滞面保护,原文同构）
    const h3 = mkGame(mkWorld());
    for (let x = 30; x <= 40; x++) {
      for (let y = 60; y <= 70; y++) {
        const i = h3.w.store.idx(x, y);
        h3.w.store.liquidType[i] = 2;                     // 岩浆带（本仓 liquidType 2=岩浆,lavaCollision :1675 tile.lava()）
      }
    }
    let held3 = false;
    const f3 = new FlailProj(310, 810, 10, 1, 948, () => held3, () => ({ x: 560, y: 1024 }));
    tickN(f3, h3, 1);
    held3 = true;
    tickN(f3, h3, 2);
    f3.x = 34 * TILE; f3.y = 64 * TILE;
    f3.fixedUpdate(1 / 60, h3.g);
    expect(f3.wet).toBe(true);
    expect(f3.lavaWet).toBe(true);
    expect(f3.projId).toBe(948);                          // wet && !lavaWet 不成立 → 不变型
  });
});

// =====================================================================
// GrenadeProj 拍序口径（R3 项 2）：入液引信门收编字段读 + 粘性族湿位移 quirk
// =====================================================================
describe('★GrenadeProj 拍序（:47771 字段读收编）', () => {
  // ★2026-09-08 预置首拍面修正（①′,CrystalSerpentProj 523 同款）：出生预置
  //  （NewProjectile :10887 wet=WetCollision 采样）原版在【生成时点】写旗,首拍 AI
  //  头 :47771 门即读预置值 → :48034 `timeLeft<=3` Kill 同拍判爆 = 出生水中【首拍】
  //  即爆。旧钉「首拍不爆,次拍爆」系预置缺面期行为（旗随首拍湿段落 AI 后位,门晚
  //  一拍才读到）,与 655 蜂巢 x1-round4 ② 金标 tick-1 Kill 同根,按反编译改钉。
  it('液体炸弹 903（投掷路）：出生水中 → 首拍即爆（:10887 预置 → :47771 门首拍读 → :48034 同拍 Kill）+ 出生拍不溅', () => {
    const h = mkGame(mkWorld());
    let boom = 0;
    const e = new GrenadeProj(520, 1024, 0, 0, 30, 180, 903, () => { boom++; });
    e.fixedUpdate(1 / 60, h.g);                           // 首拍：预置 wet=true（出生不溅）→ 门 fuse=1 → 同拍 Kill 判爆
    expect(boom).toBe(1);
    expect(h.dust.length).toBe(0);                        // 出生水中不溅（预置先立 wet → 入水溅花门 !wet 不开,原版同相）
    e.fixedUpdate(1 / 60, h.g);                           // 次拍：已亡（原版 Kill :71756 `!active` 早退同款）→ 不双爆
    expect(boom).toBe(1);
  });

  it('液体火箭 784（发射路）：飞行渡入水 → 溅花拍【先】于爆拍 1 拍（旧内联扫盒同拍爆=早 1 子步）', () => {
    const h = mkGame(mkWorld());
    let boomTick = -1;
    let tickCounter = 0;
    const e = new GrenadeProj(400, 1000, 16, 0, 30, 180, 784, () => { boomTick = tickCounter; });
    e.fired = true;
    let splashTick = -1;
    for (let i = 0; i < 30 && boomTick < 0; i++) {
      tickCounter = i + 1;
      e.fixedUpdate(1 / 60, h.g);
      if (splashTick < 0 && splashDust(h, 14).length > 0) splashTick = tickCounter;
    }
    expect(boomTick).toBeGreaterThan(0);                  // 引信 180 内因入液引爆
    expect(splashTick).toBeGreaterThan(0);
    expect(boomTick).toBe(splashTick + 1);                // 旗立拍溅花、次拍爆（1:1 拍序）
  });

  it('粘性炸弹 37（tileCollide=false）：湿位移 = AI 前快照【无阻尼】（:20555 wet→wetVelocity quirk）', () => {
    const h = mkGame(mkWorld());
    const e = new GrenadeProj(520, 1000, 0, 2, 30, 180, 37, () => {});
    const y0 = e.y;
    e.fixedUpdate(1 / 60, h.g);                           // 首拍：湿段预置 wet=true;重力门未开
    expect(e.wet).toBe(true);
    expect(e.y - y0).toBeCloseTo(2, 5);                   // 湿位移=快照 preVy=2;旧 ×dragS 直积=1
  });
});

// =====================================================================
// 杀拍推广（R3 项 3）：寿命尽拍湿段照跑（:17307 Kill 在子步尾,:16903 无 active 门）
// =====================================================================
describe('★Boomerang 杀拍推广（life 尽拍湿段补跑）', () => {
  it('106 光碟：水中活拍立旗 → 干区寿命尽拍出溅花后消亡', () => {
    const h = mkGame(mkWorld());
    const e = new Boomerang(520, 1000, 0, 0, 10, 1, 106, 1);   // 32×32（BOOMERANG_SIZE）
    (e as unknown as { life: number }).life = 2;
    tickN(e, h, 1);                                       // 活拍：水中预置 wet=true（出生不溅）
    expect(e.wet).toBe(true);
    expect(e.dead).toBe(false);
    e.x = 400; e.y = 1000;                                // 挪到干区（出水）
    e.fixedUpdate(1 / 60, h.g);                           // life 尽拍：湿段补跑 → 出水溅花
    expect(splashDust(h, 32).length).toBe(10);            // 出水支溅花（leaving 档 dy=0）
    expect(e.dead).toBe(true);
  });
});
