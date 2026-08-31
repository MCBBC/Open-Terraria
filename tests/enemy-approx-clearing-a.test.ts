import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy, fighterNotDiscouraged } from '../src/entities/Enemy';
import { projGlobalImmuneWriteTicks } from '../src/data/vanillaProjImmuneTiers';

// 台账清偿·Enemy 域回归（2026-08-31，approx-registry A①/A②/A③⑩/B⑦）：
//   stinky 三消费支 / 587 眼球飞鱼参数档+白天反转 / 同型聚群互斥环 /
//   411 观星者昼行极性（蓄力窗外才豁免驱散）/ per-owner 免疫写值梯三档。

type DartLike = { vx: number; vy: number; damage: number };

function flatWorld(playerAt: { x: number; y: number }) {
  const w = new World(80, 80, 42, 'open');
  const st = w.store;
  for (let x = 10; x <= 70; x++) st.setTileSilent(x, 60, 2); // 地板 y=60
  w.groundLevel = 70;                                        // 保证地表门(cy<groundLevel)通过
  const shots: DartLike[] = [];
  const ens: unknown[] = [];
  const hooks = {
    world: w,
    enemies: () => ens,
    player: {
      x: playerAt.x * 16, y: playerAt.y * 16, w: 20, h: 42,
      cx: playerAt.x * 16, cy: playerAt.y * 16 + 21,
      dead: false, useTime: 0,
    },
    playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
    spawnDust: () => null,
    spawnDrop: () => null, damagePlayer: () => {},
    entities: { add: (e: unknown) => { shots.push(e as DartLike); } },
  } as never;
  return { w, hooks, shots, ens };
}

describe('台账清偿·stinky(120) 消费支', () => {
  it('A① 带臭味的零伤敌怪计为险情：走态小动物调向背逃；无臭不触发', () => {
    // 鼠族 300（AI_007 TownCritter 路径）行走中,险情源 = 金鱼 55(def.damage<=0)
    const setup = (stinky: boolean) => {
      const { hooks, ens } = flatWorld({ x: 48, y: 58 });
      const e = Enemy.fromVanilla(300, 40 * 16, 59 * 16)!;
      e.ai0 = 1; e.ai1 = 600; e.facing = 1;      // 走态、计时充足、面向右侧
      ens.push(e);
      const fish = Enemy.fromVanilla(55, 42 * 16 + 8, 58 * 16)!;
      if (stinky) fish.stinkyT = 3;
      ens.push(fish);
      for (let t = 0; t < 12; t++) e.fixedUpdate(1 / 60, hooks);
      return e.facing;
    };
    expect(setup(false)).toBe(1);   // 对照:无臭金鱼被 :54033 `(damage<=0)&&!stinky` 门跳过
    expect(setup(true)).toBe(-1);   // 有臭 → 险情置位,走态仅调向(:54022-54026)
  });

  it('A① 自身带味不休整：站立态(ai0=0)下被强制起走(:54179-54182)', () => {
    const { hooks } = flatWorld({ x: 56, y: 58 });
    const e = Enemy.fromVanilla(300, 40 * 16, 59 * 16)!;
    e.ai0 = 0; e.ai1 = 900;                    // 站立计时充足(原版只靠 ai[1] 归零起走)
    e.stinkyT = 2;
    for (let t = 0; t < 20; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.ai0).toBe(1);                     // 强制转走态
  });

  it('A① 整体变暗档：debuffTintRGB = R×0.7 / B×0.55(:92208-92214)', () => {
    const { hooks } = flatWorld({ x: 56, y: 58 });
    const e = Enemy.fromVanilla(300, 40 * 16, 59 * 16)!;
    expect(e.debuffTintRGB).toBeNull();
    e.stinkyT = 1;
    const rgb = e.debuffTintRGB!;
    expect(rgb[0]).toBe(Math.round(255 * 0.7));
    expect(rgb[1]).toBe(255);
    expect(rgb[2]).toBe(Math.round(255 * 0.55));
  });
});

describe('台账清偿·AI_044 飞行蜂群', () => {
  it('A②⑩ 587 参数档：分轴帽 ±6.5/±3.5 与 224 档不同;白天目标线锁顶持续上浮', () => {
    const night = flatWorld({ x: 48, y: 20 });
    night.w.clock.eclipse = false;
    night.w.clock.timeOfDay = 21 / 24;         // 夜（DUSK=19.5/24 之后）
    const eN = Enemy.fromVanilla(587, 44 * 16, 52 * 16)!;
    for (let t = 0; t < 30; t++) eN.fixedUpdate(1 / 60, night.hooks);
    // 失视段 vx 步进 ax=0.13(509 是 0.08/224 是 0.05)——任意一拍可见 0.13 整数倍邻差
    expect([224, 509, 581]).not.toContain(587);
    const capN = Math.abs(eN.vx);
    expect(capN).toBeLessThanOrEqual(6.5);     // maxX=6.5（:31243）
    expect(Math.abs(eN.vy)).toBeLessThanOrEqual(3.5);   // maxY=3.5(:31244)

    const day = flatWorld({ x: 48, y: 20 });
    day.w.clock.timeOfDay = 12 / 24;           // 白天正午
    const eD = Enemy.fromVanilla(587, 44 * 16, 52 * 16)!;
    const y0 = eD.y;
    for (let t = 0; t < 60; t++) eD.fixedUpdate(1 / 60, day.hooks);
    expect(eD.y).toBeLessThan(y0);             // 目标线锁 0 → 上浮离地(:31249-31253)
  });

  it('A②⑩ 同型聚群互斥环：重叠的两只 509 各自获得 ±0.05 轴向推挤(:31189-31195)', () => {
    const { hooks, ens } = flatWorld({ x: 42, y: 50 });     // 玩家在同列附近(<xGate) 不触发 X 加速
    const a = Enemy.fromVanilla(509, 41 * 16 - 34, 50 * 16)!;
    const b = Enemy.fromVanilla(509, 41 * 16 - 34 + 10, 50 * 16)!;   // A 左 B 右
    ens.push(a, b);
    a.fixedUpdate(1 / 60, hooks);
    b.fixedUpdate(1 / 60, hooks);
    expect(a.vx).toBeLessThan(b.vx);           // 曼哈顿和 < width(40) → 互斥推开
  });
});

describe('台账清偿·411 观星者昼行极性(:60897 末项反相门)', () => {
  it('A③ NotDiscouraged(411)=蓄力窗 [90,180) 外 true / 窗内 false', () => {
    // 窗外（含冷却段）→ 大条件链末项不成立 → return true = 白天照常索敌；
    // 窗内 → 链成立进 switch → 黑化小动物族才真 → false = 转游荡 EncourageDespawn。
    // 直接钉共享表 fighterNotDiscouraged（fighterAI dayActive 与呻吟声窗同源）。
    const { hooks } = flatWorld({ x: 46, y: 58 });
    const e = Enemy.fromVanilla(411, 40 * 16, 59 * 16)!;
    e.ai1 = 0;
    expect(fighterNotDiscouraged(hooks as never, e)).toBe(true);
    e.ai1 = 89;
    expect(fighterNotDiscouraged(hooks as never, e)).toBe(true);
    e.ai1 = 120;
    expect(fighterNotDiscouraged(hooks as never, e)).toBe(false);
    e.ai1 = 180;
    expect(fighterNotDiscouraged(hooks as never, e)).toBe(true);
  });

  it('A③ 行为面：窗外白天照常面向玩家索敌（EncourageDespawn 主旗不置位触发离场）', () => {
    const { hooks } = flatWorld({ x: 52, y: 58 });        // 玩家在右侧 12 格
    const e = Enemy.fromVanilla(411, 40 * 16, 59 * 16)!;
    e.ai1 = 0;                                            // 窗外（瞄准冷却等其余态）
    for (let t = 0; t < 20; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.facing).toBe(1);                             // TargetClosest 保持朝向玩家
    expect(e.despawnEncouraged).toBe(false);
  });
});

describe('台账清偿·B⑦ per-owner 免疫写值梯三档(vanillaProjImmuneTiers)', () => {
  it('局部表档显式清窗(0)/穿透末档 10t/单发弹 flag3 无写(-1)', () => {
    // usesLocalNPCImmunity 主支(:14175-14179)：immune[owner]=0，节流移交弹内局部表
    expect(projGlobalImmuneWriteTicks(23, { localFace: true })).toBe(0);
    // 末档(:14180-14183)：写前现存 penetrate!=1 → 10t 全局窗
    expect(projGlobalImmuneWriteTicks(99999, { penetrate: 3 })).toBe(10);
    // 单发弹(maxPenetrate==1 且不适用单发窗) → 无写（与 Damage_PVE flag3 绕门一致）
    expect(projGlobalImmuneWriteTicks(99999, { penetrate: 1 })).toBe(-1);
    // 显型定档抽样：443/1110 → 8（:14072-14074）
    expect(projGlobalImmuneWriteTicks(1110)).toBe(8);
  });
});
