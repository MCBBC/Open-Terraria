// ★通用湿段接入面六类清偿回归（2026-09-08 红队接入面审计 F1-F6——projWetSection
//  共享体逐类接线:TideSlash 451 / NurseSyringeShot 584 / PortalGunBolt 601 /
//  CrystalSerpentProj 523（内联探针退役迁共享体）/ TorchGodProj 949 /
//  RainCloudProj 237·243;同族豁免 238/244/239/245 对照）。
//  原版锚：Projectile.cs:16895-17113 湿段 / :17594+17721-17764 湿阻尼（只在
//  tileCollide 支）/ :10886-10893 出生预置 / :16880 AI → :16895 湿段 → :17120
//  HandleMovement 位序（湿段在 Update 子步循环 :16781 内 → EU 弹逐子步跑）。
//  豁免面 = SetDefaults ignoreWater 行（vanillaProjectiles 数据面同向）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { TideSlash } from '../src/entities/TideSlash';
import { NurseSyringeShot } from '../src/entities/TownNPC';
import { PortalGunBolt } from '../src/entities/PortalGunBolt';
import { CrystalSerpentProj } from '../src/entities/WeaponProj';
import { TorchGodProj } from '../src/entities/WeaponProj';
import { RainCloudProj } from '../src/entities/WeaponProj';
import { projectileData } from '../src/data/vanillaProjectiles';

const LIQ = 255;
/** 水带：列 [x0..x1] 行 [y0..y1] 满格液体（type 0=水 / 2=岩浆） */
function liquidAt(w: World, x0: number, x1: number, y0: number, y1: number, type = 0): void {
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
/** stub game：spawnDust/playSfxWav(Splash)/spawnParticles 计数 + 空敌桶 + 离屏玩家 */
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
    enemies: () => [], critters: () => [], npcs: () => [],
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

/** 水带几何（本套件共用）：列 55..70 行 80..90 → px x[880,1136) y[1280,1456) */
const WX0 = 55, WX1 = 70, WY0 = 80, WY1 = 90;

afterEach(() => { vi.restoreAllMocks(); });

// =====================================================================
// 数据面：豁免表抽查（PROJ_IGNORE_WATER ↔ SetDefaults 逐块一致性）
// =====================================================================
describe('豁免数据面抽查（SetDefaults ignoreWater 行,行号见各类字段块注）', () => {
  it('六类受段 id 无 ignoreWater 行（缺行=不豁免同向）', () => {
    for (const id of [451, 584, 601, 523, 949, 237, 243]) {
      expect(projectileData(id)?.ignoreWater, `id ${id} 应受段`).toBeFalsy();
    }
  });
  it('雨云族豁免 id 有 ignoreWater=true（P.cs :3195-3218/:3265-3289 逐块）', () => {
    for (const id of [238, 244, 239, 245, 615]) {
      expect(projectileData(id)?.ignoreWater, `id ${id} 应豁免`).toBe(true);
    }
  });
});

// =====================================================================
// F1 TideSlash 451（掷出/折返相 tileCollide=true 阻尼消费;瞬击相豁免）
// =====================================================================
describe('TideSlash ★通用湿段（451 :5231-5241 无 ignoreWater;tick 头插位）', () => {
  it('入水拍溅花一次 + wet 旗置位;湿位移减半（掷出相 dx 5→2.5）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, splash } = makeGame(w);
    const s = new TideSlash(5, 0, 40, 2, 3);      // 掷出相 spdN=1,alpha +5/t（15 拍才转折返）
    s.x = 850; s.y = 1360;                        // 盒[850,866]×[1360,1376] 行 85,内探盒 x+13>880 入水
    const dxs: number[] = [];
    const wets: boolean[] = [];
    for (let t = 0; t < 10; t++) {
      const x0 = s.x;
      s.fixedUpdate(1 / 60, g);
      dxs.push(s.x - x0);
      wets.push(s.wet);
    }
    const first = wets.findIndex(Boolean);
    expect(first).toBeGreaterThan(0);             // 前段确有干拍
    expect(splash.length).toBe(1);                // 入水溅花一次（wetCount 窗内不重溅）
    expect(dxs[first]).toBeCloseTo(2.5, 9);       // 湿拍位移 = 5×0.5
    expect(dxs[first - 1]).toBeCloseTo(5, 9);     // 前一干拍全速
    for (let t = first; t < dxs.length; t++) {
      expect(dxs[t]).toBeCloseTo(2.5, 9);         // 湿拍持续减半
    }
    for (let t = 0; t < first; t++) {
      expect(wets[t]).toBe(false);
    }
  });

  it('瞬击相（ai0≥1 → tileCollide=false 运行时镜像）阻尼不消费', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g } = makeGame(w);
    const s = new TideSlash(15, 0, 40, 2, 3);
    s.x = 1000; s.y = 1360;                       // 水带内
    // 直置瞬击相（penetrate 递进档）+ alpha<255 防末段自灭（:31636-31650 死门在
    // moveAndHit 前,alpha 钳制后 ≥255 即 return）;AI 零湿旗消费 → 直置等价
    (s as unknown as { ai0: number; alpha: number }).ai0 = 4;
    (s as unknown as { ai0: number; alpha: number }).alpha = 200;
    const x0 = s.x;
    s.fixedUpdate(1 / 60, g);
    expect(s.wet).toBe(true);                     // 湿段在跑（采样盒在水带）
    // 瞬击相位移 = vx×damp（AI 自阻尼 0.98/spdN）×1（无湿阻尼）——若误乘 0.5 档则减半
    const damp = 0.98 / (15 / 11);
    expect(s.x - x0).toBeCloseTo(15 * damp, 6);
  });
});

// =====================================================================
// F2 NurseSyringeShot 584（override 全量自写 → tick 头自接;湿位移 wetVelocity 通道）
// =====================================================================
describe('NurseSyringeShot ★通用湿段（584 :6342-6350 无 ignoreWater;基类位被替代）', () => {
  it('入水溅花 + wet 旗置位;湿拍位移 = vy×0.5、干拍 = vy（速度场不减,wetVelocity 通道）', () => {
    const w = mkWorld();
    liquidAt(w, 50, 70, 90, 100);                 // px y[1440,1616)——患者更远,水带先入
    const { g, splash } = makeGame(w);
    // 患者正下方（中心 x 对齐 → dx≡0,方向恒直下）;AI_110 逐字面 hy=max(8,vy)+1
    // → vy 线性缓增（原版本相,类注锚 :34713-34721）
    const patient = { x: 995, y: 1900, w: 20, h: 42, hp: 100, maxHp: 300, dead: false };
    const s = new NurseSyringeShot(1000, 1000, 0, 8, patient);
    const dys: number[] = [];
    const vys: number[] = [];
    const wets: boolean[] = [];
    for (let t = 0; t < 70 && !s.dead; t++) {
      const y0 = s.y;
      s.fixedUpdate(1 / 60, g);
      dys.push(s.y - y0);
      vys.push(s.vy);                             // 无反弹（无实心）→ 拍末 vy = 碰撞步首速度
      wets.push(s.wet);
    }
    const first = wets.findIndex(Boolean);
    expect(first).toBeGreaterThan(0);             // 前段确有干拍
    expect(splash.length).toBe(1);                // 入水一次（不出水带 → 无出水溅）
    expect(wets.filter(Boolean).length).toBeGreaterThanOrEqual(5);
    for (let t = 0; t < dys.length; t++) {
      const expectDy = wets[t] ? vys[t] / 2 : vys[t];
      expect(dys[t]).toBeCloseTo(expectDy, 6);    // 位移行吃档,速度场不减
    }
  });
});

// =====================================================================
// F3 PortalGunBolt 601（子步环内 AI 后/位移前;EU=30 → 31 子步逐子步湿段）
// =====================================================================
describe('PortalGunBolt ★通用湿段（601 :6504-6512 无 ignoreWater,extraUpdates=30）', () => {
  it('入水溅花 + wet 旗置位（跨水带飞行）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, splash } = makeGame(w);
    const s = new PortalGunBolt(700, 1300, 3, 0, 0);   // 盒[695,705]×[1295,1305]
    let sawWet = false;
    for (let t = 0; t < 5; t++) {
      s.fixedUpdate(1 / 60, g);
      sawWet = sawWet || s.wet;
    }
    expect(splash.length).toBeGreaterThanOrEqual(1);   // 入水拍溅花
    expect(sawWet).toBe(true);
  });
  it('湿位移减半：全湿拍单 tick 位移 = 31 子步 × 3 × 0.5 = 46.5', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g } = makeGame(w);
    const s = new PortalGunBolt(1000, 1300, 3, 0, 0);  // 出生在水带内 → 预置 wet=true
    const x0 = s.x;
    s.fixedUpdate(1 / 60, g);
    expect(s.wet).toBe(true);
    expect(s.x - x0).toBeCloseTo(46.5, 6);             // 31 子步逐子步吃 0.5 档
  });
});

// =====================================================================
// F6 CrystalSerpentProj 523（内联探针退役迁共享体;出生预置首拍 AI 读值）
// =====================================================================
describe('CrystalSerpentProj ★通用湿段（523 :5931-5940 无 ignoreWater;AI 读上拍/位移消费当拍）', () => {
  it('出生预置：水中出生首拍 AI 浮升支读预置 wet（vy 2→1.76）且当拍位移已折半', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g } = makeGame(w);
    const s = new CrystalSerpentProj(1000, 1300, 6, 2, 40, 2, 0);   // 盒在水带内
    const x0 = s.x, y0 = s.y;
    s.fixedUpdate(1 / 60, g);
    // ⑤ 浮升支（:33593-33596）：vy>0 ×0.98 → −0.2;vx ×0.94——首拍即读预置 wet
    expect(s.vy).toBeCloseTo(2 * 0.98 - 0.2, 9);
    expect(s.vx).toBeCloseTo(6 * 0.94, 9);
    // ⑦ liqFactor = projWaterDragFactor（wet 前置门 → 水档 0.5）消费当拍
    expect(s.x - x0).toBeCloseTo(6 * 0.94 * 0.5, 9);
    expect(s.y - y0).toBeCloseTo((2 * 0.98 - 0.2) * 0.5, 9);
    expect(s.wet).toBe(true);
  });
  it('干出生 → 入水溅花 → 出水溅花（wetCount 窗）共两次', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, splash } = makeGame(w);
    const s = new CrystalSerpentProj(600, 1300, 12, 0, 40, 2, 0);   // 干出生向右穿带
    for (let t = 0; t < 70 && !s.dead; t++) s.fixedUpdate(1 / 60, g);
    expect(splash.length).toBe(2);                 // 入水 + 出水各一次
  });
  it('lavaWet 粘滞：岩浆内置位、离液三清（:16906-16911 只置不清/:17103-17108）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1, 2);            // 岩浆带
    const { g } = makeGame(w);
    const s = new CrystalSerpentProj(1000, 1300, 0, 0, 40, 2, 0);
    s.fixedUpdate(1 / 60, g);
    expect(s.lavaWet).toBe(true);
    expect(s.wet).toBe(true);                      // 岩浆属液体 → wet 同置（WetCollision liquid>0）
    // 移出液体域 → !wet 三清
    s.x = 40 * TILE; s.y = 40 * TILE;
    s.fixedUpdate(1 / 60, g);
    expect(s.wet).toBe(false);
    expect(s.lavaWet).toBe(false);
    expect(s.honeyWet).toBe(false);
    expect(s.shimmerWet).toBe(false);
  });
});

// =====================================================================
// F4 TorchGodProj 949（数据面 tileCollide=false 预置期不消费;超程后运行时置 true）
// =====================================================================
describe('TorchGodProj ★通用湿段（949 :8950-8956 无 ignoreWater;闸=运行时 tileCollide）', () => {
  it('射程内（tileCollide=false）：入水溅花 + wet 旗;位移全速不折减', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, splash } = makeGame(w);
    const s = new TorchGodProj(700, 1300, 6, 0, 10000);   // 射程未尽 → 撞块门恒关
    const dxs: number[] = [];
    let sawWet = false;
    for (let t = 0; t < 35; t++) {
      const x0 = s.x;
      s.fixedUpdate(1 / 60, g);
      dxs.push(s.x - x0);
      sawWet = sawWet || s.wet;
      if (s.dead) break;
    }
    expect(splash.length).toBe(1);
    expect(sawWet).toBe(true);
    for (const dx of dxs) expect(dx).toBeCloseTo(6, 9);   // tileCollide=false 档位不消费
  });
  it('超程后（AI :43595-43598 置 tileCollide=true）：湿位移减半', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g } = makeGame(w);
    const s = new TorchGodProj(1000, 1300, 8, 0, 0);      // rangePx=0 → 首拍即置 tileCollide
    const x0 = s.x;
    s.fixedUpdate(1 / 60, g);
    expect(s.wet).toBe(true);                             // 出生在水带 → 预置 wet
    expect(s.x - x0).toBeCloseTo(4, 9);                   // 8×0.5
    expect(s.dead).toBe(false);                           // 水非实心 → 不触发撞块杀
  });
});

// =====================================================================
// F5 RainCloudProj 237/243（aiMove 头湿段+位移入参阻尼;238/244 豁免对照）
// =====================================================================
describe('RainCloudProj ★通用湿段（237/243 :3187-3194/:3257-3264 无 ignoreWater）', () => {
  it('移动云 237：入水溅花一次 + wet 旗;湿拍位移减半（16→8）', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, splash } = makeGame(w);
    const s = new RainCloudProj(600, 1300, 16, 0, 10, 0.5, 237);   // 锚 0 → 零化门跳过
    const dxs: number[] = [];
    const wets: boolean[] = [];
    for (let t = 0; t < 25; t++) {
      const x0 = s.x;
      s.fixedUpdate(1 / 60, g);
      dxs.push(s.x - x0);
      wets.push(s.wet);
      if (s.dead) break;
    }
    const first = wets.findIndex(Boolean);
    expect(first).toBeGreaterThan(0);
    expect(splash.length).toBe(1);
    expect(dxs[first]).toBeCloseTo(8, 6);
    expect(dxs[first - 1]).toBeCloseTo(16, 6);
    for (let t = first; t < dxs.length; t++) expect(dxs[t]).toBeCloseTo(8, 6);
  });
  it('降雨云 238（ignoreWater=true :3199）豁免：水中零溅花、湿旗恒 false', () => {
    const w = mkWorld();
    liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, splash } = makeGame(w);
    const s = new RainCloudProj(1000, 1300, 0, 0, 10, 0, 238);     // 驻留水带上空
    for (let t = 0; t < 12; t++) s.fixedUpdate(1 / 60, g);
    expect(splash.length).toBe(0);
    expect(s.wet).toBe(false);
    expect(s.lavaWet).toBe(false);
    expect(s.honeyWet).toBe(false);
    expect(s.shimmerWet).toBe(false);
  });
});
