// 台账清偿批回归(2026-08-31·bossAI 双件):
//   A1 FairyQueenLance 919 —— AI_179 60t 零速预告(localAI[0] 门)+ 40 速锁定角发射 +
//      线形判定盒命中(P.cs Colliding :15711);
//   A2 SunDanceBeam 923 —— AI_180 锚本体 Center 旋转扫束(timeLeft=180 非 240);
//   A3 467 真制导(AI_001 type==467 支)—— 保速 AngleLerp(0.008)/update 转向 + <20px 自爆;
//   A4 邪教徒 expert 选拍表驱动 —— 半血∧概率阶梯替换远古末日(:65462-65477)+
//      CountNPCS(523)<10 门 + classic/expert 双档差异。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import { FairyQueenLance, SunDanceBeam } from '../src/entities/bossAI_lategame';
import { Arrow } from '../src/entities/Arrow';
import { BuffState } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';

interface Fixture {
  hooks: GameHooks;
  enemies: unknown[];
  projectiles: unknown[];
  dmgCalls: number[];
  deaths: number[];
  player: { x: number; y: number; w: number; h: number };
}

function makeHooks(world?: World, playerAt?: { x: number; y: number }): Fixture {
  const enemies: unknown[] = [];
  const projectiles: unknown[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e);
      else projectiles.push(e);
    },
  };
  const dmgCalls: number[] = [];
  const deaths: number[] = [];
  const px = (playerAt?.x ?? 4000) * TILE, py = (playerAt?.y ?? 40) * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42,
    get cx() { return this.x + this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, iframes: 0, luck: 0,
    buffs: new BuffState(),
    useTime: 1, equipStats: {},
  };
  const hooks = {
    world: world ?? new World(160, 120, 7, 'ledger-batch'),
    player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (dmg: number) => { dmgCalls.push(dmg); },
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    showPickupLabel: () => {},
    onProjectileDeath: (id: number) => { deaths.push(id); },
    spawnDust: () => ({ x: 0, y: 0, vx: 0, vy: 0, fadeIn: 0 }),
    addLightAt: () => {},
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, dmgCalls, deaths, player };
}

/** 只推进指定实体 */
function step(f: Fixture, n: number, ents: Array<{ fixedUpdate: (dt: number, g: GameHooks) => void }>): void {
  for (let i = 0; i < n; i++) {
    for (const e of ents) if (!(e as unknown as { dead?: boolean }).dead) e.fixedUpdate(1 / 60, f.hooks);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FairyQueenLance 919(AI_179 :45852-45872 两版本同段)', () => {
  it('预告期(localAI[0]<60)速度恒零+位置冻结;la0≥60 按 ai[0] 锁定角 40 速发射', () => {
    const f = makeHooks();
    const ang = -Math.PI / 4;
    const lance = new FairyQueenLance(100 * TILE, 30 * TILE, ang, 0.37, 50);
    const x0 = lance.x, y0 = lance.y;
    // 前 59 拍完全静止(AI_179 预告期无位移——旧直飞桶第一拍即走)
    step(f, 59, [lance]);
    expect(lance.vx).toBe(0);
    expect(lance.vy).toBe(0);
    expect(lance.x).toBe(x0);
    expect(lance.y).toBe(y0);
    // 第 60 拍起:速度 = 出射角单位向量 × 40
    step(f, 1, [lance]);
    expect(Math.hypot(lance.vx, lance.vy)).toBeCloseTo(40, 6);
    expect(Math.atan2(lance.vy, lance.vx)).toBeCloseTo(ang, 9);
    // 已沿锁定角移动(发射相位置积分)
    expect(Math.hypot(lance.cx - (x0 + 4), lance.cy - (y0 + 4))).toBeGreaterThan(35);
  });

  it('CanDamage 免伤门:预告期不结算、发射后线形盒(line±40 宽 8)受理', () => {
    const ang = 0;
    const originX = 100 * TILE, originY = 20 * TILE;
    const aim = (): void => {
      f.player.x = originX + 200 - 10;
      f.player.y = originY + 21 - 21;
    };
    // ① 预告期即便处于判定线上也不结算(CanDamage 表臂 localAI[0]<=60)
    let f = makeHooks();
    const tel = new FairyQueenLance(originX, originY, ang, 0, 50);
    aim();
    step(f, 55, [tel]);
    expect(f.dmgCalls.length).toBe(0);
    // ② 发射相线段推进到玩家 → 受理(hitPlayer 无桶表回退 damagePlayer)
    f = makeHooks();
    const live = new FairyQueenLance(originX, originY, ang, 0, 50);
    aim();
    step(f, 78, [live]);
    expect(f.dmgCalls.length).toBeGreaterThanOrEqual(1);
    expect(f.dmgCalls[0]).toBeGreaterThan(0);
  });

  it('360t 寿终(Kill :45863-45866)', () => {
    const f = makeHooks();
    const lance = new FairyQueenLance(0, 0, 1.23, 0, 50);
    step(f, 360, [lance]);
    expect((lance as unknown as { dead: boolean }).dead).toBe(true);
  });
});

describe('SunDanceBeam 923(AI_180 :45791-45851 两版本同段)', () => {
  function makeBossWithBeam(): { f: Fixture; boss: Enemy; beam: SunDanceBeam } {
    const w = new World(200, 140, 7, 'beam-test');
    w.groundLevel = 110;
    const f = makeHooks(w);
    const boss = Enemy.fromVanilla(636, 90 * TILE, 40 * TILE)!;
    boss.id = 999;
    f.enemies.push(boss);
    const beam = new SunDanceBeam(boss.cx, boss.cy - 100, 0.6, 999, 50, false);
    return { f, boss, beam };
  }

  it('锚定本体 Center(出生点 +y−100 仅首帧)+50t 起扫束旋转,180t 寿终非 240', () => {
    const { f, boss, beam } = makeBossWithBeam();
    step(f, 30, [beam]);
    expect(beam.cx).toBeCloseTo(boss.cx, 6);          // 每 update 吸附(:45812-45816)
    expect(beam.cy).toBeCloseTo(boss.cy, 6);
    expect(Math.hypot((beam as unknown as { vx: number }).vx ?? 0, 0)).toBeLessThan(1e-9);
    const rotEarly = (beam as unknown as { rotation: number }).rotation;   // la0=30 <50 未转
    step(f, 19, [beam]);                                                    // la0=49
    expect((beam as unknown as { rotation: number }).rotation).toBe(rotEarly);   // 扫窗未开
    step(f, 101, [beam]);                                                   // la0=150 ∈ 扫窗
    const rotMid = (beam as unknown as { rotation: number }).rotation;
    expect(rotMid - rotEarly).toBeGreaterThan(0.2);
    expect((beam as unknown as { dead: boolean }).dead).toBe(false);
    step(f, 29, [beam]);                                                    // la0=179 存活
    expect((beam as unknown as { dead: boolean }).dead).toBe(false);
    step(f, 1, [beam]);                                                     // 第 180 拍死
    expect((beam as unknown as { dead: boolean }).dead).toBe(true);
  });

  it('三段锥形束只在 la0>60 受理(scale 束长半径可达 800·scale)', () => {
    const { f, boss, beam } = makeBossWithBeam();
    // 玩家放在起始束向半径 300 处(其时仍位于 510·scale 段内)
    f.player.x = boss.cx + 300 - 10;
    f.player.y = boss.cy + Math.tan(0.6) * 300 - 21;
    step(f, 40, [beam]);                              // 预告窗内(la0≤40)
    expect(f.dmgCalls.length).toBe(0);
    step(f, 34, [beam]);                              // la0=74 发射窗
    expect(f.dmgCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('467 真制导(Arrow projId===467 支,AI_001 P.cs:55133-55253)', () => {
  function fire(): { arrow: Arrow; f: Fixture } {
    const f = makeHooks();
    const arrow = new Arrow(110 * TILE, 25 * TILE, 12, 0, 30, 0, 467, null,
      { grav: 0, life: 600, hostile: true });
    return { arrow, f };
  }

  it('保速转向:AngleLerp(0.008)/update 修正航向而模长恒定(目标在东北远处)', () => {
    const spd0 = 12;
    const { arrow, f } = fire();                      // 初始正东
    f.player.x = (110 + 26) * TILE - 10;
    f.player.y = (25 - 22) * TILE - 21;               // 目标在东北方向
    let aPrev = Math.atan2(arrow.vy, arrow.vx);
    let turned = false;
    for (let i = 0; i < 150 && !arrow.dead; i++) {
      arrow.fixedUpdate(1 / 60, f.hooks);
      if (arrow.dead) break;
      expect(Math.hypot(arrow.vx, arrow.vy)).toBeCloseTo(spd0, 5);   // 保速
      const cur = Math.atan2(arrow.vy, arrow.vx);
      expect(cur).toBeLessThanOrEqual(aPrev + 1e-9);                  // 单调向上偏(Y 向下正)
      aPrev = cur;
      if (Math.abs(cur - Math.atan2(-1, 1)) < 0.2) turned = true;
    }
    expect(aPrev).toBeLessThan(-0.05);                // 明显偏离初始向东航向
    expect(turned).toBe(true);
  });

  it('<20px 自爆(Kill 走 Game.onProjectileDeath 467 爆炸口)', () => {
    const { arrow, f } = fire();                      // 速 3 的慢弹便于观察贴脸
    (arrow as unknown as { vx: number }).vx = 3;
    f.player.x = 110 * TILE + 150;                    // 弹道延长线上 150px
    f.player.y = 25 * TILE - 21;
    for (let i = 0; i < 220 && !arrow.dead; i++) arrow.fixedUpdate(1 / 60, f.hooks);
    expect(arrow.dead).toBe(true);
    expect(f.deaths).toContain(467);
  });
});

describe('邪教徒 expert 选拍:半血∧概率阶梯替换远古末日(NPC.cs:65462-65477)', () => {
  /** 直接构造到"选拍触发拍"(ai0=0/ai1=40/P2 表指定拍号)的教徒。
   *  P2 表 [0,1,0,5,0,3,0,5,0,2,0,3,0,4]——可替换面(num13∈{1,2,3})的槽位:1 火/5 雷/
   *  9 冰/11 雷。统一用 slot1(火)。 */
  function cultistAt(world: World, f: Fixture, tx: number, ty: number, slot: number): Enemy {
    const cult = Enemy.fromVanilla(439, tx * TILE, ty * TILE)!;
    cult.id = 500;
    cult.bInit = true;
    cult.ai0 = 0; cult.ai1 = 40; cult.ai2 = 0; cult.ai3 = slot;
    f.enemies.push(cult);
    return cult;
  }

  function worldOf(difficulty: number): World {
    const w = new World(200, 140, 7, 'doom-roll');
    w.groundLevel = 120;
    w.difficulty = difficulty;
    return w;
  }

  it('经典模式:半血高滚点也不替换(expertMode 门恒假)', () => {
    const w = worldOf(0);
    const f = makeHooks(w, { x: 112, y: 84 });
    const cult = cultistAt(w, f, 96, 84, 1);
    cult.hp = Math.floor(cult.maxHp * 0.3);
    vi.spyOn(Math, 'random').mockReturnValue(0.01);   // 概率全中点数
    cult.fixedUpdate(1 / 60, f.hooks);
    expect(cult.ai0).toBe(3);                          // 正常火球态
  });

  it('expert∧满血:flag 门不过(梯子只读半血)', () => {
    const w = worldOf(1);
    const f = makeHooks(w, { x: 112, y: 84 });
    const cult = cultistAt(w, f, 96, 84, 1);
    cult.difficulty = 2;
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    cult.fixedUpdate(1 / 60, f.hooks);
    expect(cult.ai0).toBe(3);
  });

  it.each([
    ['hp>⅓ maxValue=6 同滚点不过', 0.35, 0.24, 3],
    ['⅓>hp>¼ maxValue=4 同滚点过', 0.31, 0.24, 8],
    ['hp<¼ maxValue=3 过', 0.20, 0.24, 8],
    ['hp<¼ 但滚点不足(r≥1/max)不过', 0.20, 0.9, 3],
  ])('概率阶梯逐行(%s)', (_name, hpFrac, roll, want) => {
    const w = worldOf(1);
    const f = makeHooks(w, { x: 112, y: 84 });
    const cult = cultistAt(w, f, 96, 84, 1);
    cult.difficulty = 2;
    cult.hp = Math.floor(cult.maxHp * hpFrac);
    vi.spyOn(Math, 'random').mockReturnValue(roll);
    cult.fixedUpdate(1 / 60, f.hooks);
    expect(cult.ai0).toBe(want);                       // 8=末日(:65543-65546) / 3=火
  });

  it('CountNPCS(523)<10 上限门:满 10 个 523 不再替换', () => {
    const w = worldOf(1);
    const f = makeHooks(w, { x: 112, y: 84 });
    for (let i = 0; i < 10; i++) {
      f.enemies.push({ vanillaId: 523, dead: false, id: 7000 + i });
    }
    const cult = cultistAt(w, f, 96, 84, 1);
    cult.difficulty = 2;
    cult.hp = Math.floor(cult.maxHp * 0.2);
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    cult.fixedUpdate(1 / 60, f.hooks);
    expect(cult.ai0).toBe(3);                          // 保持火球
  });
});
