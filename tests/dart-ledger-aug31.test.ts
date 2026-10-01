// 台账清偿回归（2026-08-31）：Dart.ts 三件 A 档 + 三件 B 档 / MissileProj.ts A6+C1。
//   A1 陷阱镖族穿透缺失 → SetDefaults penetrate 数据面(多敌同拍结算+每敌 10t 免工件窗)
//   A2 537 束宿主死即灭(aiStyle84 位锁链尾支 Kill,P.cs:31993-31999)
//   B4 75 HappyBomb 贴地摩擦门改原式 vy==0 门 + |vx|≤0.01 截停(AI_016 尾 :48379-48413)
//   B5 束测距 LaserScan→HitLine 整格量化(Collision.cs:4599-4614/:782-1147)
//   A6 飞刀光标钳 LimitPointToPlayerReachableArea(Player.cs:45830-45858)刹车环可达
//   C1 彩虹拖尾色相相位基准换 GlobalTimeWrappedHourly(Main.cs:17014)
import { describe, it, expect, afterEach } from 'vitest';
import { TrapShot, Dart } from '../src/entities/Dart';
import { FlyingKnifeProj, limitPointToPlayerReachableArea,
  MagicMissileProj } from '../src/entities/MissileProj';
import { World } from '../src/world/World';
import { pinGameTimeTicks } from '../src/core/GameTime';
import type { GameHooks } from '../src/entities/types';

const made: unknown[] = [];

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number;
  maxHp: number; dead: boolean; hits: number; vanillaId?: number;
  cx: number; cy: number; facing: number;
  hurt(): boolean;
}

function enemyAt(id: number, x: number, y: number, w = 2000, h = 300): MockEnemy {
  return {
    id, x, y, w, h, maxHp: 999, dead: false, hits: 0, facing: 1,
    get cx() { return this.x + this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    hurt() { this.hits++; return true; },
  };
}

function makeHooks(enemies: unknown[] = [], tiles = 300): GameHooks {
  const w = new World(tiles, tiles, 7, 'test');
  const player = {
    x: 40 * 16, y: 140 * 16 - 42, w: 20, h: 42,
    get cx() { return this.x + this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    dead: true, mana: 999,
  };
  const hooks = {
    world: w,
    player,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    playSfx: () => {}, playSfxFiles: () => {},
    spawnParticles: () => {},
    addDamageNumber: () => {}, damagePlayer: (): number => 0,
    cutTile: () => {}, onProjectileDeath: () => {}, applyLifeSteal: () => 0,
  };
  return hooks as unknown as GameHooks;
}

afterEach(() => {
  for (const m of [...made]) (m as { destroy?: () => void }).destroy?.();
  made.length = 0;
});

describe('A1 陷阱镖族穿透：SetDefaults penetrate 数据面', () => {
  it('镖 98 同拍穿透三敌各结算一次且本体存续（曾命中首怪即灭）', () => {
    const es = [enemyAt(0, -400, 100, 4000, 400),
      enemyAt(1, -400, 100, 4000, 400), enemyAt(2, -400, 100, 4000, 400)];
    const g = makeHooks(es);
    const s = new TrapShot(3360, 150, 8, 0, 60, 'dart');   // 撞怪前先扫过全敌重叠区
    made.push(s);
    s.fixedUpdate(1, g);
    expect(es.map((e) => e.hits)).toEqual([1, 1, 1]);      // 多敌同拍各一跳
    expect(s.dead).toBe(false);                            // penetrate -1 永存续
    expect(s.pierceLeft).toBe(Infinity);
  });

  it('每敌 10t 免工件窗：窗口内整体早退、10 拍后可再中(:12635 头门/:14183 尾梯)', () => {
    const es = [enemyAt(0, -500, 100, 4000, 400)];
    const g = makeHooks(es);
    const s = new TrapShot(50, 200, 4, 0, 60, 'dart');
    made.push(s);
    s.fixedUpdate(1, g);
    expect(es[0]!.hits).toBe(1);
    for (let t = 0; t < 9 && !s.dead; t++) s.fixedUpdate(1, g);   // 窗口期
    expect(es[0]!.hits).toBe(1);                           // immune[owner]=10 未到期
    s.fixedUpdate(1, g);                                   // 第 10 拍窗口翻零
    expect(es[0]!.hits).toBe(2);
    expect(s.pierceLeft).toBe(Infinity);
  });

  it('superdart/venomdart/spear/geyser/spiky 穿透；flame 单发(SetDefaults 缺省 1)', () => {
    for (const kind of ['superdart', 'venomdart', 'spear', 'geyser', 'spiky'] as const) {
      const es = [enemyAt(0, 200, 120), enemyAt(1, 220, 120)];
      const g = makeHooks(es);
      const s = new TrapShot(240, 240, 6, 0.001, 60, kind);
      made.push(s);
      s.fixedUpdate(1, g);
      expect(es.map((e) => e.hits), kind).toEqual([1, 1]);
      expect(s.dead, kind).toBe(false);
    }
    // flame(187)：1458 SetDefaults 无 penetrate 赋值=缺省 1 → 命中即灭(曾反向恒穿)
    const es2 = [enemyAt(0, 200, 120)];
    const g2 = makeHooks(es2);
    const f = new TrapShot(240, 240, 6, 0, 60, 'flame');
    made.push(f);
    f.fixedUpdate(1, g2);
    expect(es2[0]!.hits).toBe(1);
    expect(f.dead).toBe(true);
  });

  it('炮弹 162 penetrate=4 计数穿透：四发结算即 Kill', () => {
    const es = [enemyAt(0, 200, 120), enemyAt(1, 200, 120), enemyAt(2, 200, 120), enemyAt(3, 200, 120)];
    const g = makeHooks(es);
    const s = new TrapShot(208, 240, 6, 0, 60, 'cannonball');
    made.push(s);
    s.fixedUpdate(1, g);                                   // age1 直线段、远墙不炸
    expect(es.map((e) => e.hits)).toEqual([1, 1, 1, 1]);
    expect(s.dead).toBe(true);                             // 第 4 发命中尾 penetrate-- 至 0
  });
});

describe('A2 537 观星者激光：宿主失联下拍即灭', () => {
  it('宿主活着：位锁回眼位 Center+(direction*6,−4) 且存活', () => {
    const host = Object.assign(enemyAt(7, 1400, 700, 32, 56),
      { vanillaId: 411, dead: false });
    const g = makeHooks([host]);
    const d = new Dart(1560, 800, -1, 0, 50, 537);
    d.ownerNpcId = 7;
    d.hostile = true;
    made.push(d);
    d.fixedUpdate(1, g);
    expect(d.dead).toBe(false);
    expect(d.x).toBe(host.cx + host.facing * 6 - d.w / 2);
    expect(d.y).toBe(host.cy - 4 - d.h / 2);
  });

  it('宿主死亡：下一拍 Kill，无残留束线伤害(:31993-31999 尾支)', () => {
    const host = Object.assign(enemyAt(7, 1400, 700, 32, 56),
      { vanillaId: 411, dead: false });
    const g = makeHooks([host]);
    const d = new Dart(1560, 800, -1, 0, 50, 537);
    d.ownerNpcId = 7;
    d.hostile = true;
    made.push(d);
    d.fixedUpdate(1, g);
    expect(d.dead).toBe(false);
    let dmgCalls = 0;
    (g as unknown as { damagePlayer: () => number }).damagePlayer = () => { dmgCalls++; return 0; };
    host.dead = true;
    d.fixedUpdate(1, g);
    expect(d.dead).toBe(true);
    expect(dmgCalls).toBe(0);                              // 灭亡拍不走伤害
  });

  it('无绑定宿主(ownerNpcId=0)：首拍即灭（ai[1] 解析失败同链）', () => {
    const g = makeHooks([]);
    const d = new Dart(1600, 800, -1, 0, 50, 537);
    d.hostile = true;
    made.push(d);
    d.fixedUpdate(1, g);
    expect(d.dead).toBe(true);
  });
});

/** 束测距宿主（普通数据对象,可写 cx/cy——enemyAt 的取值器属性不可再赋值） */
function beamHost(cx: number, cy: number): MockEnemy {
  return {
    id: 7, x: cx - 16, y: cy - 28, w: 32, h: 56, maxHp: 999,
    dead: false, hits: 0, vanillaId: 411, facing: 1, cx, cy,
    hurt() { this.hits++; return true; },
  };
}

describe('B5 束测距 LaserScan→HitLine 整格量化(Collision.cs:4599/:782)', () => {
  it('空域水平束走满 maxDistance=2400;首拍 Lerp 0.5 半程入 localAI[1]', () => {
    const g = makeHooks([], 600);                          // 9600² 空世界
    // 宿主眼位钉在采样网格上：cx_beam=host.cx+6=3216(格201)、cy_beam=host.cy−4=4864(格304)
    const host = beamHost(3210, 4868);
    (g.enemies as unknown as () => unknown[]) = () => [host];
    const d = new Dart(3216, 4864, 1, 0, 50, 537);
    d.ownerNpcId = 7;
    d.hostile = true;
    made.push(d);
    d.fixedUpdate(1, g);
    const len = (d as unknown as { beamLen: number }).beamLen;
    expect(len).toBeCloseTo(2400 * 0.5, 5);                // 初值 0 → Lerp(localAI1,2400,0.5)
  });

  it('水平束遇实心列：长度量化为「起点格→命中格」×16 的整格折算', () => {
    const g = makeHooks([], 600);
    const w = (g.world as unknown as { store: {
      setTileSilent(x: number, y: number, t: number): void } });
    for (let y = 0; y < 600; y++) w.store.setTileSilent(360, y, 1);   // x=360 格全高墙(距起点格 144≤150)
    // 束原点（宿主眼）=格 (246,251)：host.cx+6=3944、host.cy−4=4016
    const host = beamHost(3938, 4020);
    (g.enemies as unknown as () => unknown[]) = () => [host];
    const d = new Dart(3944, 4016, 1, 0, 50, 537);
    d.ownerNpcId = 7;
    d.hostile = true;
    made.push(d);
    d.fixedUpdate(1, g);
    const len = (d as unknown as { beamLen: number }).beamLen;
    const expectLen = ((360 - 246) * 16) * 0.5;            // col=(360,251)→114+? 格×16 ×Lerp0.5
    expect(len).toBeCloseTo(expectLen, 5);
  });
});

describe('B4 75 HappyBomb 贴地摩擦门(vy==0 且 ai[0]>5)+|vx|≤0.01 截停', () => {
  function bombEnv(): GameHooks {
    const g = makeHooks([]);
    const w = (g.world as unknown as { store: {
      setTileSilent(x: number, y: number, t: number): void } });
    for (let x = 0; x < 300; x++) w.store.setTileSilent(x, 160, 1);   // 地板一行
    return g;
  }

  it('首 5 拍无摩擦无重力(ai[0]>5 门),空中匀速直行', () => {
    const g = bombEnv();
    const b = new Dart(2400, 2200, 3, 0, 60, 75);
    b.hostile = false;                                     // 免 proxKill/命中干扰
    made.push(b);
    for (let t = 0; t < 5 && !b.dead; t++) b.fixedUpdate(1, g);
    expect((b as unknown as { vx: number }).vx).toBeCloseTo(3, 5);
    expect((b as unknown as { vy: number }).vy).toBeCloseTo(0, 5);
  });

  it('落定后摩擦衰减至截停 vx===0,永不死停爬行(:48379-48413)', () => {
    const g = bombEnv();
    const b = new Dart(2400, 2538, 2, 0, 60, 75);          // 地板上缘搁置
    b.hostile = false;
    made.push(b);
    for (let t = 0; t < 260 && !b.dead; t++) b.fixedUpdate(1, g);
    expect(b.dead).toBe(false);
    expect((b as unknown as { vx: number }).vx).toBe(0);   // 截停置零(曾 0.97 慢爬不止)
  });
});

describe('A6 飞刀 491 光标可达区钳制(Player.cs:45830-45858)', () => {
  it('盒内点恒等；盒外沿中心射线回拉到 ±960/±600 面', () => {
    const pcx = 2400, pcy = 2400;
    expect(limitPointToPlayerReachableArea(pcx + 100, pcy - 50, pcx, pcy, 4800, 4800))
      .toEqual([pcx + 100, pcy - 50]);
    // 东向超界：k=960/2000=.48 → 钉到盒面
    expect(limitPointToPlayerReachableArea(pcx + 2000, pcy, pcx, pcy, 4800, 4800))
      .toEqual([pcx + 960, pcy]);
    // 南向超界：k=600/1500=.4
    expect(limitPointToPlayerReachableArea(pcx, pcy + 1500, pcx, pcy, 4800, 4800))
      .toEqual([pcx, pcy + 600]);
    // 对角同时越界取更紧比例
    const c = limitPointToPlayerReachableArea(pcx + 2000, pcy + 900, pcx, pcy, 4800, 4800);
    expect(c[0]).toBeCloseTo(pcx + 960, 5);
    expect(c[1]).toBeCloseTo(pcy + 432, 5);                // 600/900=.666→y 用 .4? 见下
  });

  it('贴世界边框玩家：★BJ290 件2 定尺寸平移钳——盒恒 1920 只平移,目标在盒内恒可达', () => {
    const pcx = 700, pcy = 2400;
    // 盒 x=Clamp(trunc(700−960)=−260, 640, 4800−640−1920=2240)=640（Utils.cs:238 判序）
    // → x∈[640,2560] 心 1600、hw 恒 960（旧相交裁剪版 x∈[640,1660] hw=510 已退役）
    const c = limitPointToPlayerReachableArea(-9999, 2400, pcx, pcy, 4800, 4800);
    expect(c[0]).toBe(640);                                // 钉到盒左面（=play area 左缘）
    expect(c[1]).toBe(2400);
    // ★U1 例回钉（件2 定谳本体,旧版曾钳到 1660）：目标 2000 距盒心 400≤960 → 可达不动
    expect(limitPointToPlayerReachableArea(2000, 2400, pcx, pcy, 4800, 4800))
      .toEqual([2000, 2400]);
  });

  it('刹车环可达：钳后目标距刀心 <100px → 近距支自锁 ai0=−10(:40778-40793)', () => {
    const g = makeHooks([]);
    (g.player as unknown as { x: number; y: number }).x = 2390;
    (g.player as unknown as { y: number; h: number }).y = 2379;
    (g.player as unknown as { dead: boolean }).dead = false;
    // 刀挂在可达盒右面内侧 20px(clamped target=(3360,2400))
    const k = new FlyingKnifeProj(3340 - 13, 2387, 12, 0, 44, 2, {
      channelCb: () => true,
      aimCb: () => ({ x: 60000, y: 2400 }),               // 原始光标远出界
    });
    made.push(k);
    k.fixedUpdate(1, g);
    expect((k as unknown as { ai0: number }).ai0).toBe(-10);
    expect(Math.hypot(k.vx, k.vy)).toBeLessThanOrEqual(20); // 只 ×1.1 不追逐远点
  });

  it('转向目标=钳后点（以导出 helper 为 oracle 精确对拍速度式）', () => {
    const g = makeHooks([]);
    const p = g.player as unknown as { x: number; y: number; w: number; h: number;
      dead: boolean };
    p.x = 2390; p.y = 2379; p.dead = false;
    const raw = { x: 4500, y: 4300 };
    const k = new FlyingKnifeProj(2287, 2287, 17, 0, 44, 2, {
      channelCb: () => true,
      aimCb: () => ({ ...raw }),
    });
    made.push(k);
    const t = limitPointToPlayerReachableArea(raw.x, raw.y, 2400, 2400, 4800, 4800);
    const dx = t[0] - (2287 + 13), dy = t[1] - (2287 + 13);
    const dd = Math.hypot(dx, dy);
    k.fixedUpdate(1, g);
    // :40807-40811 velocity=(vel×4+normalize(target)×20)/5
    expect(k.vx).toBeCloseTo((17 * 4 + dx / dd * 20) / 5, 5);
    expect(k.vy).toBeCloseTo(dy / dd * 20 / 5, 5);
  });
});

describe('C1 彩虹拖尾相位基准 GlobalTimeWrappedHourly(Main.cs:17014)', () => {
  it('弹体色相钟读逻辑 tick 钟 %3600(消逐弹恒定相位差)', () => {
    // ★X2 重锚（2026-10-01）:BJ330（eefcfd58,2026-09-24）色相钟换逻辑 tick 单源
    //  （globalTimeWrappedHourly=totalGameTicks/60%3600;墙钟消费退役,"暂停期不
    //  推进"=用户拍板语义）——判别面改 pinGameTimeTicks 钉钟关系断言（测试专用 API）
    pinGameTimeTicks(7230);                                // 7230/60=120.5s
    const m = new MagicMissileProj(600, 600, 6, 0, {
      projId: 79, damage: 30, knockback: 6, useTime: 18,
      channelCb: () => false, aimCb: () => ({ x: 800, y: 600 }),
      payMana: () => true,
    });
    made.push(m);
    const t1 = (m as unknown as { globalT: number }).globalT;
    expect(t1).toBeCloseTo(7230 / 60 % 3600, 5);           // 出膛相位=钉钟值
  });
});
