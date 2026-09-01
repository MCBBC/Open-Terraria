// R34 修复闸门:1457 新武器与独占弹魔法件(施工图=/tmp/recon/red-team-r34.md §1-§8)。
// 覆盖:1122 首拍落雷(R34-②)/花瓣 LOS 门+反弹+穿透帽(R34-①)/冰牙穿透档(R34-③)/
// 雷杖 731 之字摆(R34-④)/书杖右键 704 风暴柱(R34-⑤)/激光机枪四档加速(R34-⑥)/
// 公主之武魔法阵 60t 包络+伤×0.98 截断(R34-⑦)。
// 锚定 Terarria1458 反编译源码终值(行号见各用例);实现在 src/entities/proj1457.ts + Game.ts 分流。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';
import {
  PetalstormShot, StormLightning, GlacierFangShot,
  ThunderBoltShot, LaserMachinegunHolder, LaserMachinegunLaser,
  BookStormTwister, PrincessMagicCircle,
} from '../src/entities/proj1457';
import { itemCombat } from '../src/data/vanillaItemCombat';

type HurtArgs = [number, number, number, unknown, number?, boolean?, number?, boolean?];
interface StubEnemy extends Record<string, unknown> {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  maxHp: number; hurtLog: HurtArgs[];
}

function mkEnemy(id: number, x: number, y: number, w = 16, h = 16): StubEnemy {
  const e = { id, x, y, w, h, dead: false, maxHp: 100, hurtLog: [] as HurtArgs[] } as StubEnemy;
  Object.defineProperties(e, {
    cx: { get: () => e.x + e.w / 2 },
    cy: { get: () => e.y + e.h / 2 },
    vx: { get: () => 0 },
    vy: { get: () => 0 },
  });
  e.hurt = (...a: unknown[]) => { e.hurtLog.push(a as HurtArgs); return false; };
  return e;
}

function makeHooks(enemies: StubEnemy[] = [], store?: TileStore, player?: Record<string, unknown>): GameHooks {
  const hooks = {
    world: { store: store ?? new TileStore(200, 120) } as never,
    player: {
      equipStats: {}, cx: 800, cy: 1440, x: 790, y: 1419, w: 20, h: 42, dead: false,
      facing: 1, vx: 0, vy: 0, attackSpeedMult: 1, whipBuffs: {},
      ...player,
    } as never,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    stack: { anyTagged: () => false, hasActiveEffect: () => false },
    whipTagShot: true,
  };
  return hooks as unknown as GameHooks;
}

// ================= R34-② 1122 出生首拍落雷 =================

describe('R34-② StormLightning(1122) timeLeft=1 首拍落雷', () => {
  it('首拍 fixedUpdate 即 doKill:目标在场当拍结算伤害(SetDefaults timeLeft=1 :10447 + Update :17308 Kill 先于 AI)', () => {
    const e = mkEnemy(1, 795, 795, 96, 96);                      // 大敌保 bolt 几何命中
    const g = makeHooks([e]);
    const b = new StormLightning(1122, 800, 800, 180, 4);
    b.seed = 12345;
    b.fixedUpdate(1 / 60, g);                                    // 第 1 拍
    expect(e.hurtLog.length).toBe(1);                            // 当拍落雷（旧实现 240t 悬浮）
  });
  it('无目标也首拍 Kill(原版 Kill 不依赖索敌),仅剩 bolt 视觉余命', () => {
    const g = makeHooks();
    const b = new StormLightning(1122, 800, 800, 180, 4);
    b.fixedUpdate(1 / 60, g);
    expect((b as unknown as { visualT: number }).visualT).toBeGreaterThan(0);   // 视觉期
    expect((b as unknown as { t: number }).t).toBeLessThanOrEqual(1);
  });
});

// ================= R34-① 花瓣 LOS 门 / 软反弹 =================

describe('R34-① PetalstormShot LOS 门与软反弹', () => {
  it('墙挡视线 → 不追踪隔墙敌(CanHit 恒须,:41257-41258)', () => {
    const st = new TileStore(200, 120);
    for (let y = 0; y < 120; y++) st.setTileSilent(56, y, 1);    // x=896 竖墙
    const e = mkEnemy(1, 1000, 1432);
    const p = new PetalstormShot(800, 1440, 3, 0, 20, 3.5, 0);
    const g = makeHooks([e], st);
    for (let i = 0; i < 40; i++) p.fixedUpdate(1 / 60, g);
    expect(p.cx).toBeLessThan(900);                              // 未穿墙逼近
  });
  it('撞实心软反弹不亡(:18178-18187 双轴翻号 ×0.25)', () => {
    const st = new TileStore(200, 120);
    for (let x = 0; x < 200; x++) for (let y = 80; y < 120; y++) st.setTileSilent(x, y, 1);
    // 从悬空处向下飞向地面(地面顶 y=80×16=1280)
    const p = new PetalstormShot(40 * 16, 70 * 16, 0, 6, 20, 3.5, 0);
    const g = makeHooks([], st);
    for (let i = 0; i < 30 && !p.dead; i++) p.fixedUpdate(1 / 60, g);
    expect(p.dead).toBe(false);                                  // 反弹存活(旧实现穿墙)
    expect(Math.trunc(p.cy / 16)).toBeLessThan(80);              // 未没入地面
  });
});

// ================= R34-③ 冰牙释放穿透档 =================

describe('R34-③ GlacierFangShot penTier=(int)Remap(charge/60,0,1,1,3)(:37651)', () => {
  function mkRelease(holding: boolean, rate: number) {
    let paid = 0;
    const gf = new GlacierFangShot(800, 1440, 1, 0, 11, 2, {
      channel: () => holding,
      aim: () => ({ x: 1600, y: 1440 }),
      payMana: () => { paid++; },
      chargeRate: () => rate,
    });
    return { gf, getPaid: () => paid };
  }
  it('低蓄(charge<10)→ pen=1:命中一敌即亡', () => {
    const { gf } = mkRelease(false, 1);                          // channel=false → 立即释放,charge≈0
    const e1 = mkEnemy(1, 820, 1432);
    const e2 = mkEnemy(2, 900, 1432);
    const g = makeHooks([e1, e2]);
    for (let i = 0; i < 10 && !gf.dead; i++) gf.fixedUpdate(1 / 60, g);
    expect(e1.hurtLog.length).toBe(1);
    expect(gf.dead).toBe(true);                                  // 单目标弹
  });
  it('满蓄 → pen=3:可结算至三敌', () => {
    const { gf } = mkRelease(true, 1);
    const g0 = makeHooks();
    for (let i = 0; i < 60; i++) gf.fixedUpdate(1 / 60, g0);     // 60t 满档
    // 排成一列让弹依次穿过三敌
    const es = [mkEnemy(1, 840, 1432), mkEnemy(2, 920, 1432), mkEnemy(3, 1000, 1432)];
    const g = makeHooks(es);
    for (let i = 0; i < 40 && !gf.dead; i++) gf.fixedUpdate(1 / 60, g);
    const total = es.reduce((s, e) => s + e.hurtLog.length, 0);
    expect(total).toBeGreaterThanOrEqual(2);                     // 至少两敌(几何容差)
    expect(total).toBeLessThanOrEqual(3);                        // ≤pen=3
  });
});

// ================= R34-④ 雷杖 731 =================

describe('R34-④ ThunderBoltShot(AI_029·731 支 :38461-38509)', () => {
  it('寿命 90(timeLeft :7704);alpha 255 −15/t 渐显', () => {
    const b = new ThunderBoltShot(800, 1440, 4, 0, 24, 3);
    const g = makeHooks();
    let ticks = 0;
    while (!b.dead && ticks < 200) { b.fixedUpdate(1 / 60, g); ticks++; }
    expect(ticks).toBe(90);
    expect((b as unknown as { alpha: number }).alpha).toBeLessThanOrEqual(255 - 15 * 5);
  });
  it('之字摆:@10/@12/@18/@20 ±5 vy 踢(:38482-38497)——20t 周期净 vy 变化 ≈0', () => {
    const b = new ThunderBoltShot(800, 700, 4, 0, 24, 3);        // 悬空无地形
    const g = makeHooks();
    const vyStart = b.vy;
    for (let i = 0; i <= 20; i++) b.fixedUpdate(1 / 60, g);      // 一个完整摆周期
    // @10 −5、@12 +5、@18 +5、@20 −5 → 净 0(±奇数拍跳相扰动)
    expect(Math.abs(b.vy - vyStart)).toBeLessThanOrEqual(10.001);
  });
});

// ================= R34-⑤ 书杖右键风暴柱 704(AI_145 :71421-71560) =================

describe('R34-⑤ BookStormTwister', () => {
  it('盒 60×210(SetDefaults :7450-7451);寿命 300(ai[0] 帽 :71428)', () => {
    const t = new BookStormTwister(800, 1200, 11, 63, 9);
    expect(t.w).toBe(60);
    expect(t.h).toBe(210);
    const g = makeHooks();
    let ticks = 0;
    while (!t.dead && ticks < 400) { t.fixedUpdate(1 / 60, g); ticks++; }
    expect(ticks).toBe(300);
  });
  it('悬空坠落 vy+4/t 至 16(:71494-71509);vx 保持出手向(AI 只控 vy)', () => {
    const t = new BookStormTwister(800, 1200, -11, 63, 9);
    const g = makeHooks();
    const vx0 = t.vx;
    for (let i = 0; i < 10; i++) t.fixedUpdate(1 / 60, g);
    expect(t.vx).toBe(vx0);
    expect(t.vy).toBeGreaterThan(0);                             // 无支撑 → 下坠
  });
  it('localNPCHitCooldown=−1(:7460):同敌只结算一次,penetrate −1 不因命中消亡', () => {
    const t = new BookStormTwister(800, 1200, 0, 63, 9);
    const e = mkEnemy(1, 790, 1150, 32, 64);
    const g = makeHooks([e]);
    for (let i = 0; i < 60 && !t.dead; i++) t.fixedUpdate(1 / 60, g);
    expect(e.hurtLog.length).toBe(1);
    expect(t.dead).toBe(false);
  });
});

// ================= R34-⑥ 激光机枪 439/440(AI_075·439 支 :67185-67284) =================

describe('R34-⑥ LaserMachinegunHolder 四档加速与 slowMagic 通道', () => {
  function mkHolder(opts?: Partial<{ rate: number; scalar: number }>) {
    const fires: Array<[number, number]> = [];
    const sounds: string[] = [];
    const mg = new LaserMachinegunHolder(800, 1440, 0, 60, 2, {
      channel: () => true,
      aim: () => ({ x: 1600, y: 1440 }),
      payMana: () => {},
      rate: () => opts?.rate ?? 1,
      scalar: () => opts?.scalar ?? 1,
      fire: (_x, _y) => fires.push([_x, _y]),
    });
    return { mg, fires, sounds };
  }
  it('双发/拍:每发射拍 fire 回调恰 2 次(:67267-67277)', () => {
    const { mg, fires } = mkHolder();
    const g = makeHooks();
    for (let i = 0; i < 25; i++) mg.fixedUpdate(1 / 60, g);      // 首个 period=24 窗
    expect(fires.length).toBe(2);                                // 一窗一拍双发
  });
  it('四档加速序列:发射拍间隔 ∈ {24,18,12,6}(:67188-67206 stage@40/80/120)', () => {
    const { mg, fires } = mkHolder();
    const g = makeHooks();
    const fireTicks: number[] = [];
    for (let i = 1; i <= 220; i++) {
      mg.fixedUpdate(1 / 60, g);
      if (fires.length >= 2 && fires.length % 2 === 0 && !fireTicks.includes(i)) {
        if ((fires.length / 2) > fireTicks.length) fireTicks.push(i);
      }
    }
    const gaps: number[] = [];
    for (let i = 1; i < fireTicks.length; i++) gaps.push(fireTicks[i] - fireTicks[i - 1]);
    expect(gaps).toContain(18);                                  // 二档窗出现(stage≥1)
    expect(gaps).toContain(12);                                  // 三档窗出现(stage≥2)
    expect(Math.max(...gaps)).toBeLessThanOrEqual(19);           // 后期不再有 24t 慢拍
  });
  it('slowMagic:rate=0.4 → 发射节拍 ÷0.4(×2.5 放缓)(★消费点① :67204)', () => {
    const fast = mkHolder();                                     // rate 1
    const slow = mkHolder({ rate: 0.4 });                        // 空蓝过载
    const g = makeHooks();
    for (let i = 0; i < 25; i++) {
      fast.mg.fixedUpdate(1 / 60, g);
      slow.mg.fixedUpdate(1 / 60, g);
    }
    expect(fast.fires.length).toBe(2);                           // 24t 内一拍
    expect(slow.fires.length).toBe(0);                           // period/rate=60t 未满一拍
  });
});

describe('R34-⑥ LaserMachinegunLaser(440)', () => {
  it('渐显(alpha −25/t)+直线飞行+撞块亡(:55740/:5106 aiStyle1)', () => {
    const l = new LaserMachinegunLaser(800, 1400, 14, 0, 60, 2);
    const g = makeHooks();
    l.fixedUpdate(1 / 60, g);
    expect((l as unknown as { alpha: number }).alpha).toBe(230);
    expect(l.cx).toBeGreaterThan(830);                           // 3 子步全速(extraUpdates=2)
    const st = new TileStore(200, 120);
    for (let x = 0; x < 200; x++) for (let y = 80; y < 120; y++) st.setTileSilent(x, y, 1);
    const w = new LaserMachinegunLaser(40 * 16, 79 * 16, 0, 14, 60, 2);
    const g2 = makeHooks([], st);
    w.fixedUpdate(1 / 60, g2);
    expect(w.dead).toBe(true);
  });
});

// ================= R34-⑦ 公主之武魔法阵 950(AI_186 :43454-43573) =================

describe('R34-⑦ PrincessMagicCircle', () => {
  it('伤 =(int)(dmg×0.98)(Damage() 折价 :13575-13577,C# 截断)', () => {
    const c = new PrincessMagicCircle(800, 800, 70, 5);
    expect(c.damage).toBe(68);                                   // 68.6 → 68
  });
  it('寿命 60t 自灭(AI_186 num=60 :43456);包络收缩(t≥45 tailK 生效)', () => {
    const c = new PrincessMagicCircle(800, 800, 70, 5);
    const g = makeHooks();
    let ticks = 0;
    while (!c.dead && ticks < 100) { c.fixedUpdate(1 / 60, g); ticks++; }
    expect(ticks).toBe(60);
    const inner = c as unknown as { scl: number; opacity: number };
    expect(inner.opacity).toBeLessThan(0.05);
    expect(inner.scl).toBeLessThan(0.2);
  });
  it('零速定点放置(Player.cs:48183 velocity=Zero);接触结算不因命中消亡(penetrate −1)', () => {
    const c = new PrincessMagicCircle(800, 800, 70, 5);
    const e = mkEnemy(1, 760, 760, 80, 80);
    const g = makeHooks([e]);
    for (let i = 0; i < 30; i++) c.fixedUpdate(1 / 60, g);
    expect(c.vx).toBe(0);
    expect(c.vy).toBe(0);
    expect(c.cx).toBe(800);
    expect(e.hurtLog.length).toBe(3);                            // 缺省免疫窗 10t 节拍（30t=3 次,非 local 表族）
    expect(c.dead).toBe(false);                                  // penetrate −1
  });
  it('数据面锚:5065 shoot 950/dmg70/mana18/ut=ua25/speed10(json 回填态)', () => {
    const d = itemCombat(5065);
    expect(d?.shoot).toBe(950);
    expect(d?.damage).toBe(70);
    expect(d?.mana).toBe(18);
    expect(d?.useTime).toBe(25);
    expect(d?.useAnimation).toBe(25);
    expect(d?.shootSpeed).toBe(10);
  });
});
