// SW-FX47 反重力残项清零批——四笔（1457 金标逐锚）：
//   b TryBouncingBlocks :35102-35165（弹跳块族反弹整支,FX40-g TouchedTiles 消费面）
//   c INTO_ORBIT 特殊事件 11 :24290（BordersMovement 顶界带→成就面）
//   d MakeFloorDust 微光粒子载体 :24002（ShimmerBlock 编排本地直驱）+ flag2
//     tile19 style49 棕榈平台尘 16（:24010,:24045）+ GetFloorTile 平台族臂（:23962）
//   e jumpSpeedField 前置快照（原版 :26211 UpdateJumpHeight 先于 :26889
//     HorizontalMovement——弹跳座 :19912 当拍消费;旧=跳参链在移动相后一拍滞后）
//  ★变异证红：每组注明「旧实现退化值」——回退任一刀对应组必红。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Player } from '../src/entities/Player';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';
import { seededRandom } from './seeded-rng';

const STONE_ID = TILE_BY_KEY['stone'] ?? 1;
const PLATFORM_ID = TILE_BY_KEY['platform'] ?? -1;
const HONEY_ID = TILE_BY_KEY['v_229_honey_block'] ?? -1;

/** TS tile id ← 原版 sheet id（弹跳块表 Main.cs:9626-9629 按 sheet 面建模） */
const tileBySheet = (sheet: number): number => {
  for (let i = 1; i < TILE_DEFS.length; i++) {
    if (TILE_DEFS[i]?.vanilla?.sheet === sheet) return i;
  }
  return -1;
};
const SLIME371_ID = tileBySheet(371);   // PinkSlimeBlock（tileSolid Main.cs:9623）
const BALLOON446_ID = tileBySheet(446); // SillyBalloonPink（:10114）

interface DustRec { x: number; y: number; w: number; h: number; type: number; scale: number }
interface ParticleRec { x: number; y: number; opts?: { life?: number; size?: number; vx?: number; vy?: number } }

function makeGame(w: World): {
  game: GameHooks; dust: DustRec[]; particles: ParticleRec[]; sfx: string[]; ach: number[];
} {
  const dust: DustRec[] = [];
  const particles: ParticleRec[] = [];
  const sfx: string[] = [];
  const ach: number[] = [];
  const game = {
    world: w, player: null as unknown, enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: (f: string) => { sfx.push(f); },
    spawnParticles: (x: number, y: number, _c: string, _n: number, _s?: number,
      opts?: { life?: number; size?: number; vx?: number; vy?: number }) => {
      particles.push({ x, y, opts });        // ShimmerBlock 编排粒子捕获（clientOnly:true 本地直驱）
    },
    addDamageNumber: () => {}, spawnDrop: () => null, damagePlayer: (d: number): number => d,
    notifyInventoryChanged: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    achievements: {
      notifyProgressionEvent: () => {},
      handleSpecialEvent: (id: number) => { ach.push(id); },
    },
    vanillaDust: {
      spawn: (x: number, y: number, ww: number, hh: number, type: number) => {
        const o = { x, y, w: ww, h: hh, type, scale: 1, vx: 0, vy: 0, alpha: 50, noGravity: false, noLight: false };
        dust.push(o);
        return o;
      },
    },
  } as unknown as GameHooks;
  return { game, dust, particles, sfx, ach };
}

/** 石地板世界（row 70/71 = gField 0.4 带） */
function flatWorld(): World {
  const w = new World(480, 120, 30, 'open');
  for (let x = 0; x < w.w; x++) {
    w.store.setTileSilent(x, 70, STONE_ID, 0, 0);
    w.store.setTileSilent(x, 71, STONE_ID, 0, 0);
  }
  return w;
}

/** 弹跳块地板世界（row 70 整行指定 tile） */
function bouncyWorld(id: number): World {
  const w = new World(480, 120, 30, 'open');
  for (let x = 0; x < w.w; x++) w.store.setTileSilent(x, 70, id, 0, 0);
  return w;
}

/** 平台地板世界（row 70 平台,可指定 frameY 材质行） */
function platformWorld(frameY: number): World {
  const w = new World(480, 120, 30, 'open');
  for (let x = 0; x < w.w; x++) w.store.setTileSilent(x, 70, PLATFORM_ID, 0, frameY);
  return w;
}

/** 弹跳块世界+顶面水深 1 格（wet 门面;水位 row 69=slime 上方） */
function bouncyWorldWater(id: number): World {
  const w = bouncyWorld(id);
  for (let x = 0; x < w.w; x++) {
    for (let y = 60; y <= 69; y++) w.store.setLiquid(x, y, 255, 1);
  }
  return w;
}

beforeEach(() => {
  vi.spyOn(Math, 'random').mockImplementation(seededRandom(0x5111D));
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ---- 域B（b）：TryBouncingBlocks Player.cs:35102-35165 ----
describe('SW-FX47 域B：TryBouncingBlocks（:35102-35165;旧实现退化值=整支缺,弹跳格照常落地）', () => {
  /** 落点几何：脚底距弹跳块顶 dist px、settle 前速 vy0（fixedUpdate 拍内 +gField 0.4，
   *  拍内终端钳 10——PLAYER_MAX_FALL_SPEED） */
  function faller(id: number, dist: number, vy0: number): {
    p: Player; game: GameHooks; w: World; dust: DustRec[]; particles: ParticleRec[];
  } {
    const w = bouncyWorld(id);
    const { game, dust, particles } = makeGame(w);
    const p = new Player(60 * TILE, 70 * TILE - 42 - dist, new Inventory());
    p.hp = 100;
    p.vy = vy0;
    return { p, game, w, dust, particles };
  }

  it('B1 粉史莱姆块 371 反弹（凌空拍）：vy=6.2→×-0.8=-4.96+脚贴块顶（变异=删支 → 落地 vy=0 红）', () => {
    const { p, game } = faller(SLIME371_ID, 10, 5.8);   // 拍内 vy 6.2,D=10>6.2 不落地;
                                                        // 意图脚 10+6.2=16.2 入块行 → 触碰清单含块
    p.fixedUpdate(1 / 60, game);
    expect(p.vy).toBeCloseTo(-4.96, 6);                 // :35127 vy*=-0.8（6.2*0.8）
    expect(p.y).toBe(70 * TILE - 42);                   // :35131 vy<0 → row*16-height 脚贴块顶
    expect(p.fallStartY).toBe(p.y);                     // :35162-35164 vy*gravDir<0 → fallStart 重置
  });

  it('B2 controlJump 持跳钳 ±13（:35128-35130;单元面——常规终端 10×0.8=8 恒不触钳,原版可达域=传送门 maxFall35 族）', () => {
    const w = bouncyWorld(SLIME371_ID);
    const { game } = makeGame(w);
    const p = new Player(60 * TILE, 70 * TILE - 42, new Inventory());
    p.hp = 100;
    p.touchedTiles = [{ x: 60, y: 70 }];                // 预置触碰清单（凌空拍扫描面）
    const tt = p as unknown as {
      tryBouncingBlocks: (g: GameHooks, wo: World, f: boolean, py: number, iv: number) => void;
    };
    p.vy = 17;                                          // 合成超终端入速（vyGate ≥5 过门）
    p.inputJump = true;
    tt.tryBouncingBlocks(game, w, true, p.y, 0);
    expect(p.vy).toBe(-13);                             // -17×-0.8=-13.6 → Clamp(-13.6,-13,13)
    expect(p.y).toBe(70 * TILE - 42);                   // :35131 位钳
    // 对照组：不持跳 → 不钳
    const p2 = new Player(60 * TILE, 70 * TILE - 42, new Inventory());
    p2.hp = 100;
    p2.touchedTiles = [{ x: 60, y: 70 }];
    p2.vy = 17;
    tt.tryBouncingBlocks.call(p2, game, w, true, p2.y, 0);
    expect(p2.vy).toBeCloseTo(-13.6, 6);
  });

  it('B3 慢速门 |vy|≥5（:35104）：3.4 下落不弹照常落地（变异=删门 → 贴地反弹 本组红）', () => {
    const { p, game } = faller(SLIME371_ID, 4, 3.0);    // 拍内 3.4<5
    p.fixedUpdate(1 / 60, game);                        // 未及落地（D'=0.6）,无弹
    p.fixedUpdate(1 / 60, game);                        // 次拍落地
    expect(p.onGround).toBe(true);
    expect(p.vy).toBe(0);                               // 弹了则 vy<0
  });

  it('B4 wet 门（:35104 !wet）：水下弹跳格不弹（变异=删 !wet → 水中反弹 本组红）', () => {
    const w = bouncyWorldWater(SLIME371_ID);
    const { game } = makeGame(w);
    const p = new Player(60 * TILE, 70 * TILE - 42 - 6, new Inventory()); // 全身没水柱中
    p.hp = 100;
    p.vy = 5.0;                                         // 湿态重力 0.2→5.2(钳5.01 族),恒 ≥5
    p.fixedUpdate(1 / 60, game);
    expect(p.vy).toBeGreaterThan(0);                    // 未反弹（弹则 ×-0.8 翻负）
    // 对照组：同几何无水 → 反弹翻负
    const { p: p2, game: g2 } = faller(SLIME371_ID, 10, 5.0);
    p2.fixedUpdate(1 / 60, g2);
    expect(p2.vy).toBeLessThan(0);
  });

  it('B5 气球 446 亦弹（tileBouncy 表 Main.cs:9626-9629 矩阵）且非尘面（:24011 允许集外零尘）', () => {
    const { p, game, dust } = faller(BALLOON446_ID, 10, 5.8);
    p.fixedUpdate(1 / 60, game);
    expect(p.vy).toBeCloseTo(-4.96, 6);
    expect(p.y).toBe(70 * TILE - 42);
    expect(dust.length).toBe(0);                        // 446 不在 MakeFloorDust 允许集
  });

  it('B6 石地板对照：同几何不弹照常落地（弹跳格域判别力）+石面零尘（:24011 sheet1 允许集外）', () => {
    const { p, game, dust } = faller(STONE_ID, 4, 8.0); // 快落落地（残量 4<5 亦不触反弹臂）
    p.fixedUpdate(1 / 60, game);
    expect(p.onGround).toBe(true);
    expect(p.vy).toBe(0);
    expect(dust.length).toBe(0);                        // 石材 sheet1 非允许集（FX40 域D 同款）;
                                                        // 落地尘 20 连发面由 B7 弹跳路径承担
  });

  it('B7 弹跳落地尘 20 连发 243（:35134 FloorVisuals(Falling)→MakeFloorDust falling 20）', () => {
    const { p, game, dust } = faller(SLIME371_ID, 10, 5.8);
    p.fixedUpdate(1 / 60, game);
    expect(dust.length).toBe(20);
    expect(dust.every((d) => d.type === 243)).toBe(true);   // 371→num3=243（:24100）
    expect(dust[0].y).toBe(70 * TILE - 42 + 40);            // 位钳后 y+h-2（1118）
  });

  it('B9 落地拍残量臂（Collision.cs:2401 残量=块顶−移前脚）：dist=6≤vy → 落地拍反弹 -4.8（变异=删臂 → vy=0 红）', () => {
    const { p, game } = faller(SLIME371_ID, 6, 5.8);    // 拍内 6.2,D=6≤6.2 → 本拍落地
    p.fixedUpdate(1 / 60, game);
    expect(p.y).toBe(70 * TILE - 42);                   // 脚贴块顶（位钳 no-op）
    expect(p.vy).toBeCloseTo(-4.8, 6);                  // 残量 6×-0.8（原版碰撞后 vy=+6 → ×-0.8）
  });

  it('B10 残量<5 落地拍不弹（:35104 门下带）：dist=3 → 落地 vy=0（门判别力）', () => {
    const { p, game } = faller(SLIME371_ID, 3, 8.0);    // 拍内 8.4,D=3 → 落地,残量 3<5
    p.fixedUpdate(1 / 60, game);
    expect(p.onGround).toBe(true);
    expect(p.vy).toBe(0);
  });

  it('B11 倒挂落地拍残量臂（hitHead 标记）：dist=5≤vy → 顶面落地拍反弹 +4.0（变异=删臂 → vy=0 红）', () => {
    const w = new World(480, 120, 30, 'open');
    for (let x = 0; x < w.w; x++) w.store.setTileSilent(x, 62, SLIME371_ID, 0, 0);
    const { game } = makeGame(w);
    const p = new Player(60 * TILE, 63 * TILE + 5, new Inventory());    // 头距块底 5px
    p.hp = 100;
    p.forcedGravityT = 10;                              // 反转域（重力 -0.4/拍）
    p.vy = -5.4;                                        // 拍内 -5.8,D=5≤5.8 → 本拍顶面着陆
    p.fixedUpdate(1 / 60, game);
    expect(p.y).toBe(63 * TILE);                        // 头贴块底（1008）
    expect(p.vy).toBeCloseTo(4.0, 6);                   // 残量 -5×-0.8=+4.0（向世界下弹）
  });

  it('B8 倒挂 gd=-1 顶面弹跳（forcedGravity 反转域）：vy≤-5 → ×-0.8 翻正+头顶贴块底（:35131 vy≥0 支）', () => {
    const w = new World(480, 120, 30, 'open');
    for (let x = 0; x < w.w; x++) w.store.setTileSilent(x, 62, SLIME371_ID, 0, 0);
    const { game } = makeGame(w);
    const p = new Player(60 * TILE, 63 * TILE + 10, new Inventory());   // 头距块底 10px
    p.hp = 100;
    p.forcedGravityT = 10;                              // FTW 克脑强制倒挂（:26489-26496;
                                                        //  重力反转域——grvDir 位随其置 -1）
    p.vy = -5.4;                                        // 倒挂"下落"=向上,拍内 -5.8
    p.fixedUpdate(1 / 60, game);
    expect(p.vy).toBeCloseTo(4.64, 6);                  // -5.8×-0.8=+4.64（向世界下弹）
    expect(p.y).toBe(63 * TILE);                        // vy≥0 → row*16+16 头贴块底（1008）
    expect(p.fallStartY).toBe(p.y);
  });
});

// ---- 域C（c）：INTO_ORBIT 特殊事件 11 Player.cs:24290 ----
describe('SW-FX47 域C：顶界 INTO_ORBIT（:24290;旧实现退化值=事件整缺,Game 中央位 y==640 恒假）', () => {
  it('C1 普通世界顶界越线：钳 y=640+事件 11（变异=删内联位 → ach 无 11 红）', () => {
    const w = flatWorld();
    const { game, ach } = makeGame(w);
    const p = new Player(100, 600, new Inventory());    // 顶界带 y<640
    p.hp = 100;
    p.bordersMovement(w, game);
    expect(p.y).toBe(640);                              // :24277-24279 钳回
    expect(p.vy).toBe(0.11);                            // :24280-24282 vy 下推
    expect(ach).toContain(11);                          // :24290（旧:y==640 后中央位永不触发）
  });

  it('C2 remix 世界顶界死支同发事件 11（:24264-24276 分支内恒执行）', () => {
    const w = flatWorld();
    w.seedFlags.remix = true;
    const { game, ach } = makeGame(w);
    const p = new Player(100, 500, new Inventory());    // <640-height=598 死亡线
    p.hp = 100;
    p.bordersMovement(w, game);
    expect(p.hp).toBe(0);                               // KillMe(ByOther(19),10) 直死通道
    expect(ach).toContain(11);                          // 死支不豁免事件 11（原文恒执行）
  });

  it('C3 界内不触发（y≥640 带外无事件）', () => {
    const w = flatWorld();
    const { game, ach } = makeGame(w);
    const p = new Player(100, 1000, new Inventory());
    p.hp = 100;
    p.bordersMovement(w, game);
    expect(ach).not.toContain(11);
  });
});

// ---- 域D（d）：MakeFloorDust 微光粒子 + flag2 棕榈平台 ----
describe('SW-FX47 域D：微光块 659/667 编排粒子（:24002;旧实现退化值=门后空转零粒子）', () => {
  it('D1 落地拍（Falling 跳过掷门）恒生 ShimmerBlock 粒子 1 颗（变异=删 spawn → 0 红）', () => {
    const w = bouncyWorld(tileBySheet(659));
    const { game, particles } = makeGame(w);
    const p = new Player(60 * TILE, 70 * TILE - 42 - 4, new Inventory());
    p.hp = 100;
    p.vy = 5.8;                                         // 拍内 6.2,D=4≤6.2 → 本拍落地
    p.fixedUpdate(1 / 60, game);                        // fallingFx=true → 门跳过
    expect(p.onGround).toBe(true);
    expect(particles.length).toBe(1);                   // RequestParticleSpawn 1:1
    const q = particles[0];
    expect(q.opts?.life).toBe(45);                      // Spawn_ShimmerBlock SetTypeInfo(45)
    expect(q.opts?.size).toBe(1.2);                     // scaleMul 兜底 1 × 1.2
    expect(q.opts?.vy ?? 1).toBeLessThanOrEqual(0);     // :24006-24008 Y>0 反号
    expect(Math.abs(q.opts?.vx ?? 9)).toBeLessThanOrEqual(0.8);   // Circular(0.8,0.8) 界内
    expect(Math.abs(q.opts?.vy ?? 9)).toBeLessThanOrEqual(0.8);
  });

  it('D2 行走掷门（:23985-23992 rand 值 > |vx|/3×50 → 早退;桩 0.99 假/0 真双面）', () => {
    const w = bouncyWorld(tileBySheet(659));
    const { game, particles } = makeGame(w);
    const p = new Player(60 * TILE, 70 * TILE - 42, new Inventory());   // 站微光块
    p.hp = 100;
    vi.spyOn(Math, 'random').mockReturnValue(0.99);     // 门假（99 > 0）→ 早退
    p.fixedUpdate(1 / 60, game);
    expect(particles.length).toBe(0);
    vi.spyOn(Math, 'random').mockReturnValue(0);        // 门真（0 > 0 假）→ 本地直驱 1 颗
    p.fixedUpdate(1 / 60, game);
    expect(particles.length).toBe(1);
    expect(particles[0].opts?.life).toBe(45);
  });
});

describe('SW-FX47 域D2：flag2 棕榈平台（:24010 frameY/18==49 + GetFloorTile 平台族臂 :23962）', () => {
  it('D3 style49 棕榈平台落地尘 16×20（变异=回退平台族臂或 flag2 → 0 尘 红）', () => {
    const w = platformWorld(18 * 49);                   // frameY=882 → /18==49
    const { game, dust } = makeGame(w);
    const p = new Player(60 * TILE, 70 * TILE - 42 - 4, new Inventory());
    p.hp = 100;
    p.vy = 4.0;                                         // 拍内 4.4,D=4≤4.4 → 本拍落地
    p.fixedUpdate(1 / 60, game);
    expect(p.onGround).toBe(true);                      // 站上平台（单向承接面）
    expect(dust.length).toBe(20);                       // :24019 num2=20
    expect(dust.every((d) => d.type === 16)).toBe(true);   // :24045 flag2→num3=16
  });

  it('D4 style0 木平台同几何零尘（19 非允许集,flag2 判别力）', () => {
    const w = platformWorld(0);
    const { game, dust } = makeGame(w);
    const p = new Player(60 * TILE, 70 * TILE - 42 - 4, new Inventory());
    p.hp = 100;
    p.vy = 4.0;                                         // 拍内 4.4,D=4≤4.4 → 本拍落地
    p.fixedUpdate(1 / 60, game);
    expect(p.onGround).toBe(true);
    expect(dust.length).toBe(0);
  });

  it('D5 蜂蜜块地面弹跳座（sticky /5 :19762 → num3=0.8<2 钳 2 → vy=-2.01+0.4+0.01）', () => {
    const w = new World(480, 120, 30, 'open');
    for (let x = 0; x < w.w; x++) w.store.setTileSilent(x, 70, HONEY_ID, 0, 0);
    const { game } = makeGame(w);
    const p = new Player(60 * TILE, 70 * TILE - 42, new Inventory());
    p.hp = 100;
    p.mount.active = true; p.mount.type = 43;
    p.inputX = 1; p.inputJump = false;
    p.fixedUpdate(1 / 60, game);
    // 当拍快照 js=8/5=1.6 → num3=max(0.8,2)=2+0.01 → -2.01 → 重力 +0.4 → 衰减 +0.01
    expect(p.vy).toBeCloseTo(-1.6, 6);
  });
});

// ---- 域E（e）：jumpSpeedField 前置快照（:26211→:26889 原版序） ----
describe('SW-FX47 域E：弹跳座当拍 jumpSpeed（旧实现退化值=上拍滞后,首拍读 5.01 → vy=-2.105）', () => {
  it('E1 上座首拍即坐骑档 8：num3=4+0.01 → vy=-4.01+0.4+0.01=-3.6（变异=回退前置 → -2.105 红）', () => {
    const w = flatWorld();
    const { game } = makeGame(w);
    const p = new Player(60 * TILE, 70 * TILE - 42, new Inventory());   // 贴地
    p.hp = 100;
    p.mount.active = true; p.mount.type = 43;           // Mount 43 jumpSpeed=8(Mount.cs:1867)
    p.inputX = 1; p.inputJump = false;                  // 无预热带=变档当拍
    p.fixedUpdate(1 / 60, game);
    expect(p.vy).toBeCloseTo(-3.6, 6);                  // :19912 num3=8×0.5+0.01=4.01
    expect(p.jumpSpeedField).toBe(8);                   // 当拍快照=坐骑档
  });
});
