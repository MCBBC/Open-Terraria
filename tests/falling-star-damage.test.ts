// ★BJ272（2026-09-22 用户实报"坠落星不伤怪"定谳=伤害面在且连通,零修刀）：本文件
//  = 坠星对敌伤害面守卫闸（原 G′ T1 批 2026-09-02 落的 face 无专属测试,本件补闸）。
//  原版锚（Terarria1457）：
//   · 生成链 WorldGen.SpawnFallingObjects :72395-72428 弹 720（aiStyle 148）
//     → AI_148_StarSpawner :54027-54061 ai[0]>=180 后 NewProjectile(…,12,1000,10f,…)
//     —— 对敌伤害面实体=弹 12 FallingStar（SetDefaults :926-940 friendly /
//     penetrate=-1 / trap=true,aiStyle 5）,damage=1000/kb=10f 为自然星专值。
//   · 命中不消亡（penetrate=-1,唯一死亡路径=撞地 :75593/白天 :24092/越界）；
//     撞地 Kill :79347-79350 `type==12 && damage>500` 才落 item 75 坠落之星。
//   · WorldItem 75 本体【无】伤害面（WorldItem.cs 全文无星伤害支,唯一 StrikeNPC
//     =巫毒娃 :725/:758）——"落地后不伤"为原版语义,本文件以星死+落品断言承载。
//   · warmup(Spawner 720 damage=0) 期不伤 = 原版 AI_148 无 Damage 面直接推论。
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { FallingStar } from '../src/entities/FallingStar';
import { Enemy } from '../src/entities/Enemy';

function mkWorld(): World {
  const w = new World(120, 160, 30, 'open');
  w.clock.timeOfDay = 0;            // 午夜=isDay false（白天清除门 :24092 不触发）
  return w;
}

/** 石板地面：列 [x0..x1] 行 [y0..y1] tile 1（stone） */
function floor(w: World, x0: number, x1: number, y0: number, y1: number): void {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) w.store.setTileSilent(x, y, 1);
  }
}

type HurtCall = { dmg: number; kbx: number; kby: number; pierce: number; fromPlayer: boolean };

function mkGame(w: World, enemies: Enemy[], drops: string[], hurtLog?: Map<number, HurtCall[]>): GameHooks {
  const px = 20 * TILE, py = 20 * TILE;
  return {
    world: w,
    player: { x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21, dead: true, iframes: 0, equipStats: {} },
    enemies: () => enemies, critters: () => [], npcs: () => [],
    spawnDust: () => null,
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnDrop: (x: number, y: number, key: string) => { drops.push(key); return null; },
    damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    notifyInventoryChanged: () => {}, addLightAt: () => {},
  } as unknown as GameHooks;
}

/** 包一层 hurt 记录参（dmg/kbx/pierce/fromPlayer——kb 方向=±10×vx 符号,0→1） */
function spyHurt(e: Enemy, log: HurtCall[]): void {
  const orig = e.hurt.bind(e);
  (e as unknown as { hurt: unknown }).hurt = (...a: unknown[]) => {
    log.push({ dmg: a[0] as number, kbx: a[1] as number, kby: a[2] as number,
      pierce: a[6] as number, fromPlayer: a[7] as boolean });
    return orig(...(a as Parameters<Enemy['hurt']>));
  };
}

describe('FallingStar 对敌伤害面（BJ272 守卫闸：弹 12 dmg=1000/kb=10f/trap）', () => {
  it('下落穿过敌怪 → 实扣 1000 伤（kb=+10 vx=0 档,pierce=-1,fromPlayer=false=trap 杀账豁免面）', () => {
    const w = mkWorld();
    const e = Enemy.fromVanilla(3, 35 * TILE, 60 * TILE)!;   // 僵尸 vid=3
    const hp0 = e.hp;
    const calls: HurtCall[] = [];
    spyHurt(e, calls);
    const g = mkGame(w, [e], []);
    // 星顶对齐敌怪盒上方 100px,vx=0 竖直落（原版星速 vy=12）
    const s = new FallingStar(35 * TILE, 60 * TILE - 100, 0, 12, 0, false, true);
    let landed = false;
    for (let t = 0; t < 40 && !landed; t++) { s.fixedUpdate(1 / 60, g); landed = s.dead; }
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0].dmg).toBe(1000);          // AI_148 :54059 damage=1000
    expect(calls[0].kbx).toBe(10);            // kb 10f × direction(vx=0→+1)
    expect(calls[0].pierce).toBe(-1);         // penetrate=-1 命中不消亡
    expect(calls[0].fromPlayer).toBe(false);  // ★SW-RB10d：trap=true → 杀账/DPS 豁免
    expect(hp0 - e.hp).toBeGreaterThan(0);
  });

  it('warmup(Spawner 720 damage=0) 期不伤怪（AI_148 无 Damage 面）', () => {
    const w = mkWorld();
    const e = Enemy.fromVanilla(3, 35 * TILE, 60 * TILE)!;
    const calls: HurtCall[] = [];
    spyHurt(e, calls);
    const g = mkGame(w, [e], []);
    // 出生即与敌怪盒重叠——warmup 期仍不得伤
    const s = new FallingStar(35 * TILE, 60 * TILE - 10, 0, 12, 180, false, true);
    for (let t = 0; t < 10; t++) s.fixedUpdate(1 / 60, g);
    expect(s.dead).toBe(false);
    expect(calls.length).toBe(0);
    expect(e.hp).toBe(e.maxHp);
  });

  it('落地 Kill 落 item 75 且弹体消亡（:79347 damage>500 支）——落地后不再有伤害面', () => {
    const w = mkWorld();
    floor(w, 30, 40, 100, 102);              // 石板地面：行 100 顶
    const e = Enemy.fromVanilla(3, 35 * TILE, 60 * TILE)!;
    const calls: HurtCall[] = [];
    spyHurt(e, calls);
    const drops: string[] = [];
    const g = mkGame(w, [e], drops);
    const groundY = 100 * TILE;
    const s = new FallingStar(35 * TILE, groundY - 30 * TILE, 0, 12, 0, false, true);
    for (let t = 0; t < 200 && !s.dead; t++) s.fixedUpdate(1 / 60, g);
    expect(s.dead).toBe(true);                // 撞实心即 Kill（:75593）
    expect(drops).toContain('vi_75_fallen_star');
    // 敌怪不在星柱（列 30..40 外再放一个）→ 星死后无新伤害调用
    const callsLen = calls.length;
    expect(callsLen).toBe(0);
  });

  it('白天（非 remix）自然星立即清除且不掉落（:24092 damage==1000 门）', () => {
    const w = mkWorld();
    w.clock.timeOfDay = 0.5;                  // 正午=isDay true
    const drops: string[] = [];
    const g = mkGame(w, [], drops);
    const s = new FallingStar(35 * TILE, 60 * TILE, 0, 12, 0, false, true);
    s.fixedUpdate(1 / 60, g);
    expect(s.dead).toBe(true);
    expect(drops).not.toContain('vi_75_fallen_star');
  });
});

// ---- ★BJ289（2026-09-23 B①）remix 敌星伤玩家面（Damage_EVP :14846-14949）----
describe('BJ289 remix 敌星伤玩家面（SetDefaults :932-934 hostile=true → EVP）', () => {
  type DpCall = { dmg: number; srcX: number; srcY: number };
  /** 活体玩家 mock（35,60 空域同上组）+ damagePlayer 记录并置 30t 无敌帧 */
  function mkGameRemix(w: World, dpLog: DpCall[]): { g: GameHooks; player: Record<string, number | boolean> } {
    const px = 35 * TILE, py = 60 * TILE;
    const player: Record<string, number | boolean> = {
      x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
      dead: false, iframes: 0, luck: 0, facing: 1, shieldParryTimeLeft: 0,
      maxHp: 100, maxMana: 20,
    };
    const g = {
      world: w,
      player,
      enemies: () => [], critters: () => [], npcs: () => [],
      spawnDust: () => null,
      playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
      spawnDrop: () => null,
      damagePlayer: (dmg: number, sx: number, sy: number) => {
        dpLog.push({ dmg, srcX: sx, srcY: sy });
        player.iframes = 30;                  // Hurt→immune 语义（General 桶）
        return dmg;
      },
      addDamageNumber: () => {},
      cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
      notifyInventoryChanged: () => {}, addLightAt: () => {},
    } as unknown as GameHooks;
    return { g, player };
  }

  it('remix：星落穿过玩家 → damagePlayer 2000（rnd 钉 0.5：DamageVar(1000,0)=1000 ×曲线1.0 ×2）', () => {
    const w = mkWorld();
    w.seedFlags.remix = true;
    const dpLog: DpCall[] = [];
    const { g } = mkGameRemix(w, dpLog);
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);   // tier=0 → 因子 1.0
    try {
      // 星盒 x=35T..35T+18 与玩家 35T..35T+20 横叠;y 起 py−24 → 一拍后 py−12..py+6 纵叠
      const s = new FallingStar(35 * TILE, 60 * TILE - 24, 0, 12, 0, false, true);
      s.fixedUpdate(1 / 60, g);
      expect(dpLog.length).toBe(1);
      expect(dpLog[0].dmg).toBe(2000);        // 1000 ×(Classic 采样 1.0) ×2(:14915)
      expect(dpLog[0].srcX).toBe(s.cx);       // 击退源=弹心
      expect(s.dead).toBe(false);             // EVP 命中不消亡（唯一死=撞地/越界）
      s.fixedUpdate(1 / 60, g);               // 玩家 iframes=30 → 不再扣
      expect(dpLog.length).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('非 remix：hostile=false 整面不达（自然星常态）', () => {
    const w = mkWorld();                      // seedFlags 无 remix
    const dpLog: DpCall[] = [];
    const { g } = mkGameRemix(w, dpLog);
    const s = new FallingStar(35 * TILE, 60 * TILE - 24, 0, 12, 0, false, true);
    for (let t = 0; t < 5; t++) s.fixedUpdate(1 / 60, g);
    expect(dpLog.length).toBe(0);
  });

  it('remix 门：玩家已死 / 无敌帧期 / 暖机相（720 无 hostile 行）三者均不达', () => {
    const w = mkWorld();
    w.seedFlags.remix = true;
    const dpLog: DpCall[] = [];
    const { g, player } = mkGameRemix(w, dpLog);
    player.dead = true;                       // dead 门
    let s = new FallingStar(35 * TILE, 60 * TILE - 24, 0, 12, 0, false, true);
    s.fixedUpdate(1 / 60, g);
    expect(dpLog.length).toBe(0);
    player.dead = false;
    player.iframes = 10;                      // immune 门（General 桶 !immune）
    s = new FallingStar(35 * TILE, 60 * TILE - 24, 0, 12, 0, false, true);
    s.fixedUpdate(1 / 60, g);
    expect(dpLog.length).toBe(0);
    player.iframes = 0;
    s = new FallingStar(35 * TILE, 60 * TILE - 24, 0, 12, 180, false, true);   // 暖机相
    for (let t = 0; t < 3; t++) s.fixedUpdate(1 / 60, g);
    expect(dpLog.length).toBe(0);
  });

  it('remix 盾反（CanParryAgainst :31673）：盾反窗 + 星在面向侧 → 零伤', () => {
    const w = mkWorld();
    w.seedFlags.remix = true;
    const dpLog: DpCall[] = [];
    const { g, player } = mkGameRemix(w, dpLog);
    player.facing = -1;                       // 星在玩家左侧、面向左 → sign(−1)==facing
    player.shieldParryTimeLeft = 5;
    const s = new FallingStar(35 * TILE - 12, 60 * TILE - 24, 0, 12, 0, false, true);
    for (let t = 0; t < 3; t++) s.fixedUpdate(1 / 60, g);
    expect(dpLog.length).toBe(0);
  });
});
