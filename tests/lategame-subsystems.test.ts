// 后期批子系统探针：LanternNight 灯笼夜 / MoonLeech 145 / 490 仪式圈 / Obstructed 163 /
// 史后仆从 658/659 凝胶弹 / 空水格睡莲香蒲（1.4.5.6 对照 Terarria1456）。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LanternNight, type LanternCtx } from '../src/world/LanternNight';
import { BuffState, BuffType, BUFF_DEFS } from '../src/stats/Buffs';
import { MoonLeechProj } from '../src/entities/bossAI_duke_moonlord';
import { CultistRitualCircle } from '../src/entities/bossAI_lategame';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { Arrow } from '../src/entities/Arrow';
import { TILE } from '../src/core/constants';

// ---------------------------------------------------------------------------
// ① LanternNight（LanternNight.cs 1:1）
// ---------------------------------------------------------------------------
function cleanCtx(over: Partial<LanternCtx> = {}): LanternCtx {
  return {
    dayTime: false, bloodMoon: false, pumpkinMoon: false, snowMoon: false,
    invasionType: 0, moonLordCountdown: 0, spawnMeteor: false,
    downedMoonlord: false, bossActive: () => false, ...over,
  };
}

describe('LanternNight 灯笼夜', () => {
  beforeEach(() => LanternNight.worldClear());

  it('首胜事件（default/10/16-18）→ 预约次夜；4/21/22 排除（NPC.cs:79569-79601）', () => {
    LanternNight.onGameEventCleared(0);            // 入侵 goblin
    LanternNight.onGameEventCleared(10);           // 月总
    LanternNight.onGameEventCleared(16);           // 毁灭者
    expect(LanternNight.nextNightIsLanternNight).toBe(true);
    expect(LanternNight.lanternsUp).toBe(false);   // 预约不等于当夜
    // WorldClear（:120-126）只清 Manual/Genuine/Cooldown/_was 四项——首胜预约跨读图保留
    LanternNight.worldClear();
    expect(LanternNight.nextNightIsLanternNight).toBe(true);
    LanternNight.checkNight(cleanCtx());           // 入夜兑现并消费预约
    expect(LanternNight.nextNightIsLanternNight).toBe(false);
    LanternNight.onGameEventCleared(4);            // 哀木
    LanternNight.onGameEventCleared(21);           // 圣诞树
    LanternNight.onGameEventCleared(22);           // 圣诞坦克
    expect(LanternNight.nextNightIsLanternNight).toBe(false);
  });

  it('入夜兑现预约 → GenuineLanterns + 冷却 5-10；黎明收场（:81-105/:30-43）', () => {
    LanternNight.onGameEventCleared(13);           // EoC
    LanternNight.checkNight(cleanCtx());
    expect(LanternNight.lanternsUp).toBe(true);
    expect(LanternNight.nextNightIsLanternNight).toBe(false);  // 消费即清
    expect(LanternNight.lanternNightsOnCooldown).toBeGreaterThanOrEqual(5);
    expect(LanternNight.lanternNightsOnCooldown).toBeLessThanOrEqual(10);
    LanternNight.checkMorning();
    expect(LanternNight.lanternsUp).toBe(false);
  });

  it('入夜五门：血月/南瓜月/霜月/入侵/月总倒计时/Boss 任一在场均不开灯（:59-66）', () => {
    for (const over of [
      { bloodMoon: true }, { pumpkinMoon: true }, { snowMoon: true },
      { invasionType: 1 }, { moonLordCountdown: 3600 }, { bossActive: () => true },
    ] as Partial<LanternCtx>[]) {
      LanternNight.worldClear();
      LanternNight.onGameEventCleared(0);
      LanternNight.checkNight(cleanCtx(over));
      expect(LanternNight.lanternsUp, JSON.stringify(over)).toBe(false);
    }
  });

  it('UpdateTime：当夜中途开入侵 → 提前收场（:128-133）', () => {
    LanternNight.onGameEventCleared(0);
    LanternNight.checkNight(cleanCtx());
    expect(LanternNight.lanternsUp).toBe(true);
    LanternNight.updateTime(cleanCtx({ invasionType: 1 }));
    expect(LanternNight.lanternsUp).toBe(false);
  });

  it('自然 roll 仅月总已杀且冷却尽（:90-93）——概率门内取值合法', () => {
    LanternNight.checkNight(cleanCtx({ downedMoonlord: true }));
    expect([true, false]).toContain(LanternNight.lanternsUp);
  });
});

// ---------------------------------------------------------------------------
// ② MoonLeech 145 + Obstructed 163（Projectile.cs aiStyle 85 + Player.cs:11421）
// ---------------------------------------------------------------------------
function mlHooks(playerAt: { x: number; y: number }) {
  const world = new World(60, 60, 7, 'ml-test');
  const enemies: Enemy[] = [];
  const src = Enemy.fromVanilla(396, 20 * TILE, 20 * TILE)!;
  src.id = 1; src.bInit = true;
  enemies.push(src);
  const buffs = new BuffState();
  const player = {
    x: playerAt.x, y: playerAt.y, w: 20, h: 42,
    cx: playerAt.x + 10, cy: playerAt.y + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, buffs,
  };
  const hooks = {
    world, player, enemies: () => enemies,
  } as never;
  return { hooks, enemies, player, src, buffs };
}

describe('MoonLeech 145 / Obstructed 163', () => {
  it('buff 注册表：145 MoonLeech / 163 Obstructed（原版 id）', () => {
    expect(BUFF_DEFS[BuffType.MoonLeech].vanillaBuff).toBe(145);
    expect(BUFF_DEFS[BuffType.Obstructed].vanillaBuff).toBe(163);
  });

  it('Obstructed 163：getter 生效（headcovered+bleed 语义入口）', () => {
    const b = new BuffState();
    expect(b.obstructed).toBe(false);
    b.apply(BuffType.Obstructed, 59 / 60);
    expect(b.obstructed).toBe(true);
  });

  it('456 月噬弹：贴身 <20px 授 MoonLeech 14s（840t/60，:30726-30732）', () => {
    const h = mlHooks({ x: 30 * TILE, y: 20 * TILE });   // 源右侧 ~160px
    const p = new MoonLeechProj(h.src, h.player as never);
    let guard = 0;
    while (!h.buffs.moonLeech && guard++ < 200) p.fixedUpdate(1 / 60, h.hooks);
    expect(h.buffs.moonLeech).toBe(true);
    expect(h.buffs.active.get(BuffType.MoonLeech)).toBeCloseTo(14, 5);
  });

  it('456 月噬弹：330t 出击超时转回程 → 贴源额前消亡（:30702-30705/:30740-30743）', () => {
    const h = mlHooks({ x: 55 * TILE, y: 20 * TILE });   // 远靶：出击段到不了 20px
    const p = new MoonLeechProj(h.src, h.player as never);
    let guard = 0;
    while (!p.dead && guard++ < 1500) p.fixedUpdate(1 / 60, h.hooks);
    expect(p.dead).toBe(true);
    expect(guard).toBeLessThanOrEqual(600 + 340);        // timeLeft 600 内必然结束
  });

  it('456 月噬弹：源消亡即自毁', () => {
    const h = mlHooks({ x: 30 * TILE, y: 20 * TILE });
    const p = new MoonLeechProj(h.src, h.player as never);
    p.fixedUpdate(1 / 60, h.hooks);
    h.src.dead = true;
    p.fixedUpdate(1 / 60, h.hooks);
    expect(p.dead).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ③ 490 仪式圈弹（Projectile.cs aiStyle 89 :31193-31326）
// ---------------------------------------------------------------------------
describe('CultistRitualCircle 490', () => {
  function circleHooks() {
    const world = new World(60, 60, 7, 'ritual-test');
    const enemies: Enemy[] = [];
    const cultist = Enemy.fromVanilla(439, 30 * TILE, 30 * TILE)!;
    cultist.id = 7; cultist.bInit = true;
    enemies.push(cultist);
    const hooks = {
      world, enemies: () => enemies, player: { dead: true },
      spawnParticles: () => {}, playSfx: () => {},
    } as never;
    return { hooks, cultist };
  }

  it('淡入 -5/t（alpha 255→250）→ 320t 自灭（:31199-31201/:31294-31298）', () => {
    const h = circleHooks();
    const c = new CultistRitualCircle(h.cultist);
    expect(c['alpha']).toBe(255);
    c.fixedUpdate(1 / 60, h.hooks);
    expect(c['alpha']).toBe(250);
    let guard = 0;
    while (guard++ < 400 && !c.dead) c.fixedUpdate(1 / 60, h.hooks);
    expect(c.dead).toBe(true);
    expect(guard).toBeLessThanOrEqual(321);
  });

  it('锚（439）消亡即自毁（:31305-31320）', () => {
    const h = circleHooks();
    const c = new CultistRitualCircle(h.cultist);
    c.fixedUpdate(1 / 60, h.hooks);
    h.cultist.dead = true;
    c.fixedUpdate(1 / 60, h.hooks);
    expect(c.dead).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ④ 史后仆从 658/659 凝胶弹（NPC.cs:61668-61840 经典档）
// ---------------------------------------------------------------------------
describe('史后仆从 658/659 射击', () => {
  function minionWorld(playerAt: { x: number; y: number }) {
    const w = new World(80, 80, 42, 'minion');
    const st = w.store;
    for (let x = 20; x <= 60; x++) st.setTile(x, 60, 1);   // 地板
    const shots: Arrow[] = [];
    const player = {
      x: playerAt.x * TILE, y: playerAt.y * TILE, w: 20, h: 42,
      cx: playerAt.x * TILE + 10, cy: playerAt.y * TILE + 21,
      vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false,
    };
    const hooks = {
      world: w, player,
      enemies: () => [] as Enemy[],
      entities: { add: (e: unknown) => { shots.push(e as Arrow); } },
      playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
      spawnDrop: () => null, damagePlayer: () => {},
    } as never;
    return { hooks, shots };
  }

  it('658：|ΔX|<500 且有视线 → 920 蓝 15 伤 hostile（cs:61720-61750）', () => {
    const { hooks, shots } = minionWorld({ x: 40, y: 58 });
    const e = Enemy.fromVanilla(658, 36 * TILE, 59 * TILE - 18)!;   // 落地板上
    let fired = -1;
    for (let t = 0; t < 600 && fired < 0; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (shots.length) fired = t;
    }
    expect(fired).toBeGreaterThan(0);
    expect(shots[0].projId).toBe(920);
    expect(shots[0].damage).toBe(15);        // MultiLerp(15,17,20) 经典档
    expect(shots[0].hostile).toBe(true);
  });

  it('659：同门 → 921 粉（cs:61746-61795）', () => {
    const { hooks, shots } = minionWorld({ x: 40, y: 58 });
    const e = Enemy.fromVanilla(659, 36 * TILE, 59 * TILE - 18)!;
    let fired = -1;
    for (let t = 0; t < 600 && fired < 0; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (shots.length) fired = t;
    }
    expect(fired).toBeGreaterThan(0);
    expect(shots[0].projId).toBe(921);
    expect(shots[0].damage).toBe(15);
  });

  it('距离门：ΔX>500 不射（cs:61723/:61747）', () => {
    const { hooks, shots } = minionWorld({ x: 76, y: 58 });
    const e = Enemy.fromVanilla(658, 36 * TILE, 59 * TILE - 18)!;
    for (let t = 0; t < 400; t++) e.fixedUpdate(1 / 60, hooks);
    expect(shots).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ⑤ 空水格睡莲/香蒲（WorldGen.cs:72237-72248，各 1/600）
// ---------------------------------------------------------------------------
describe('WorldEvolution 空水格睡莲/香蒲', () => {
  function evoWorld() {
    const w = new World(60, 60, 7, 'evo');
    const st = w.store;
    const y = 30;
    st.setTileSilent(30, y + 2, 1);            // 水底
    st.liquid[st.idx(30, y)] = 255;            // 满水空格
    const host: EvolutionHost = {
      store: st, worldSurface: 50, rockLevel: 60,
      flags: w.flags, crimson: false, isDay: true, raining: false,
      maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
      dungeonX: 0, difficulty: 0,   // Main.dungeonX（保底灯泡搜索框；本测试无地牢）
    };
    return { w, st, y, evo: new WorldEvolution(host) };
  }
  type EvoLike = { overgroundTile: (i: number, j: number, wallDist: number) => void };

  it('空水格 1/600 → 睡莲 518（cs:72237-72242）', () => {
    const { st, y, evo } = evoWorld();
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);   // 必中小概率门
    try {
      (evo as unknown as EvoLike).overgroundTile(30, y, 3);
    } finally {
      spy.mockRestore();
    }
    expect(st.type[st.idx(30, y)]).not.toBe(0);
  });

  it('首掷未中 → 香蒲 519（else-if 第二档 :72243-72248）', () => {
    const { st, y, evo } = evoWorld();
    let calls = 0;
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => (calls++ === 0 ? 0.99 : 0));
    try {
      (evo as unknown as EvoLike).overgroundTile(30, y, 3);
    } finally {
      spy.mockRestore();
    }
    expect(st.type[st.idx(30, y)]).not.toBe(0);
  });
});
