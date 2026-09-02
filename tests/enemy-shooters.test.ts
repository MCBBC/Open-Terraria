import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';

// 敌怪远程攻击回归（对照 1456 NPC.cs 各发射点）
type DartLike = { x: number; y: number; vx: number; vy: number; damage: number };

/** 开阔世界 + 玩家 + 收集发射的弹幕 */
function shooterWorld(playerAt: { x: number; y: number }) {
  const w = new World(80, 80, 42, 'open');
  const st = w.store;
  for (let x = 20; x <= 60; x++) st.setTileSilent(x, 60, 2); // 地板
  const shots: DartLike[] = [];
  const player = {
    x: playerAt.x * 16, y: playerAt.y * 16, w: 20, h: 42,
    cx: playerAt.x * 16, cy: playerAt.y * 16 + 21,
    dead: false, useTime: 0,
  };
  const hooks = {
    world: w,
    player,
    playSfx: () => {},
    addDamageNumber: () => {},
    spawnParticles: () => {},
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    entities: { add: (e: unknown) => { shots.push(e as DartLike); } },
  } as never;
  return { w, hooks, shots, player: player as unknown as { useTime: number } };
}

/** 跑 tick 直到出弹或超时；返回消耗 tick 数（-1 = 超时未发射） */
function runUntilShot(e: Enemy, hooks: never, shots: DartLike[], maxTicks: number): number {
  for (let t = 0; t < maxTicks; t++) {
    e.fixedUpdate(1 / 60, hooks);
    if (shots.length > 0) return t;
  }
  return -1;
}

describe('敌怪远程攻击（对照原版发射点）', () => {
  it('黄蜂 42：玩家挥动中（useTime>0）且有视线 → 发射毒刺（原版待机清零门）', () => {
    const { hooks, shots, player } = shooterWorld({ x: 40, y: 50 });
    player.useTime = 1; // 持续挥动
    const e = Enemy.fromVanilla(42, 38 * 16, 50 * 16)!;
    const t = runUntilShot(e, hooks, shots, 1200); // 期望 ~104t；朝向门失败会整轮重来，留足余量
    expect(t).toBeGreaterThan(0);
    expect(shots[0].damage).toBe(10);       // 毒刺伤害 10
    const spd = Math.hypot(shots[0].vx, shots[0].vy);
    expect(spd).toBeCloseTo(8, 1);          // 弹速 8
  });

  it('黄蜂 42：玩家全程待机 → 永不射刺（cs:51161 itemAnimation 门）', () => {
    const { hooks, shots } = shooterWorld({ x: 40, y: 50 });
    const e = Enemy.fromVanilla(42, 38 * 16, 50 * 16)!;
    const t = runUntilShot(e, hooks, shots, 600);
    expect(t).toBe(-1);
  });

  it('哈比 48：有视线 → ai[0] 30/60/90 三连羽（速 6、伤 15）', () => {
    const { hooks, shots } = shooterWorld({ x: 40, y: 52 });
    const e = Enemy.fromVanilla(48, 40 * 16, 48 * 16)!;
    const t = runUntilShot(e, hooks, shots, 200);
    expect(t).toBeGreaterThan(0);
    expect(shots[0].damage).toBe(15);
    expect(Math.hypot(shots[0].vx, shots[0].vy)).toBeCloseTo(6, 1);
  });

  it('骷髅弓手 110：落地 + 视线 + <700px → 蓄力半程发射火焰箭（伤 35）', () => {
    const { hooks, shots, player } = shooterWorld({ x: 44, y: 57 });
    player.useTime = 1; // cs:60036-60039 idle 门：目标待机（itemAnimation==0）不开瞄
    // 出生行须留出 40px 身高：59 行生成会嵌进 60 行地板（原版弓手链上无横向移动分支
    // NPC.cs:58719，无 vx 则不再靠跳判定脱出），改 57 行落地站定
    const e = Enemy.fromVanilla(110, 40 * 16, 57 * 16)!;
    const t = runUntilShot(e, hooks, shots, 300);
    expect(t).toBeGreaterThan(0);
    expect(shots[0].damage).toBe(35);
  });

  it('骷髅弓手 110：目标全程待机 → 不开瞄不射（cs:60037 idle 门）', () => {
    const { hooks, shots } = shooterWorld({ x: 44, y: 57 });
    const e = Enemy.fromVanilla(110, 40 * 16, 57 * 16)!;
    const t = runUntilShot(e, hooks, shots, 400);
    expect(t).toBe(-1);
  });

  it('蜗牛怪 122：待机 120t + 视线 → 充能至 32 发射粉激光（速 7、伤 25、<700px）', () => {
    const { hooks, shots } = shooterWorld({ x: 44, y: 55 });
    const e = Enemy.fromVanilla(122, 40 * 16, 55 * 16)!;
    const t = runUntilShot(e, hooks, shots, 400);
    expect(t).toBeGreaterThan(120); // 至少经过待机期
    expect(shots[0].damage).toBe(25);
    expect(Math.hypot(shots[0].vx, shots[0].vy)).toBeCloseTo(7, 1);
  });

  it('爬行者 101：锚定 + 有视线 → 120t 后喷诅咒焰（速 10、伤 22）', () => {
    const { w, hooks, shots } = shooterWorld({ x: 44, y: 55 });
    const e = Enemy.fromVanilla(101, 40 * 16, 55 * 16)!;
    e.ai0 = 40; e.ai1 = 55; // 锚点 tile 坐标
    w.store.setTileSilent(40, 55, 2); // 锚点格放块（植物族锚定判定）
    const t = runUntilShot(e, hooks, shots, 300);
    expect(t).toBeGreaterThan(100);
    expect(shots[0].damage).toBe(22);
  });

  it('尖刺史莱姆 184：落地近距有视线 → 抛物线尖刺（速 4.5、伤 9）', () => {
    const { hooks, shots } = shooterWorld({ x: 42, y: 58 }); // 与史莱姆同层（地板上一格），视线不被地板挡
    const e = Enemy.fromVanilla(184, 40 * 16, 59 * 16)!;
    const t = runUntilShot(e, hooks, shots, 200);
    // 首拍即射合法：localAI[0]==0 冷却初值 + 出生 vy==0 + <200px 有视线全过
    // （NPC.cs:61796-61813 单发档无蓄力门）→ t=0；runUntilShot 超时返 −1 仍有区分度
    expect(t).toBeGreaterThanOrEqual(0);
    expect(shots[0].damage).toBe(9);
  });

  it('巨型诅咒颅 289：≤500px 状态机 → 冲刺段第 20 tick 暗影焰（速 6、伤 25）', () => {
    const { hooks, shots } = shooterWorld({ x: 42, y: 55 });
    const e = Enemy.fromVanilla(289, 40 * 16, 55 * 16)!;
    const t = runUntilShot(e, hooks, shots, 400);
    expect(t).toBeGreaterThan(100); // 120t 待机 + 20t 冲刺
    expect(shots[0].damage).toBe(25);
  });
});

describe('2026-09-02 评审清偿回归锚（共享热文件覆写报警）', () => {
  it('困惑门：瞄准中困惑 → 永不开火（NPC.cs:59788 ai[1]/ai[2] 每帧清零）', () => {
    const { hooks, shots, player } = shooterWorld({ x: 44, y: 57 });
    player.useTime = 1;
    const e = Enemy.fromVanilla(110, 40 * 16, 57 * 16)!;
    let aimed = false;
    for (let t = 0; t < 300 && !aimed; t++) { e.fixedUpdate(1 / 60, hooks); aimed = e.ai2 > 0; }
    expect(aimed).toBe(true);
    e.confusedT = 5;                       // confused getter = confusedT>0
    expect(runUntilShot(e, hooks, shots, 240)).toBe(-1);
    expect(shots.length).toBe(0);
  });

  it('死亡窗：玩家死亡后射击族块照常倒数（rawPlayer 通道,旧病=整块冻结）', () => {
    const { hooks, player } = shooterWorld({ x: 44, y: 57 });
    player.useTime = 1;
    const e = Enemy.fromVanilla(110, 40 * 16, 57 * 16)!;
    let aimed = false;
    for (let t = 0; t < 300 && !aimed; t++) { e.fixedUpdate(1 / 60, hooks); aimed = e.ai2 > 0; }
    expect(aimed).toBe(true);
    (player as unknown as { dead: boolean }).dead = true;
    const cd0 = e.ai1;
    e.fixedUpdate(1 / 60, hooks);
    expect(e.ai1).toBe(Math.max(0, cd0 - 1));
  });

  it('216 激怒计数双门：未入档(lai2<20)受击 lai3 不涨,入档才 +1（:59680-59766）', () => {
    const { hooks } = shooterWorld({ x: 40, y: 50 });
    const e = Enemy.fromVanilla(216, 38 * 16, 50 * 16)!;
    e.ai2 = 3; e.ai1 = 10; e.lai2 = 19; e.justHitT = 2;
    e.fixedUpdate(1 / 60, hooks);
    expect(e.lai3).toBe(0);
    e.ai2 = 3; e.ai1 = 10; e.lai2 = 20; e.justHitT = 2;
    e.fixedUpdate(1 / 60, hooks);
    expect(e.lai3).toBe(1);
  });

  it('70/72 机关球恒不可击（SetDefaults dontTakeDamage,NPC.cs:9722/:9757）', () => {
    const { hooks } = shooterWorld({ x: 40, y: 50 });
    for (const vid of [70, 72]) {
      const e = Enemy.fromVanilla(vid, 40 * 16, 50 * 16)!;
      expect(e.dontTakeDamage).toBe(true);
      const hp0 = e.hp;
      e.hurt(50, 1, 0, hooks);
      expect(e.hp).toBe(hp0);
      expect(e.dead).toBe(false);
    }
  });
});
