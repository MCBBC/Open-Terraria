// 真刃系旋斩弧家族（AI_190/191 + 出生链 Player.cs:48265-48317）回归：
//   · SwingArc 972/982/983/997/984：t/ai1 旋进 + scale=(num6+num×num5)×ai2 + ai1 消亡
//   · TrueNightsEdgeSlash 973：锚定伸长 76px / 旋进 / 寿命 ai1+65=97 / t≥80 清伤
//   · NightsEdgeFly（273 飞斩）：10t 起前漂 + ai1=30 消亡 + 旋进
import { describe, it, expect } from 'vitest';
import { SwingArc, TrueNightsEdgeSlash, NightsEdgeFly, ZenithSword, randomFractalProfile, FRACTAL_KEYS, LightsBaneSlash, GrassSlash } from '../src/entities/SwingArc';
import { SolarEruptionWhip, SolarFlare } from '../src/entities/SolarEruption';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

function makeGame(w: World, list: unknown[] = [], projectiles: unknown[] = []) {
  return {
    world: w, player: null as unknown,
    enemies: () => list,
    entities: { nextId: 1, add: (e: unknown, b: string) => { (b === 'projectiles' ? projectiles : list).push(e); } },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: () => {}, critters: () => [], notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
  } as unknown as GameHooks;
}

const owner = { x: 50 * TILE, y: 90 * TILE, w: 20, h: 42, cx: 50 * TILE + 10, cy: 90 * TILE + 21, facing: 1, dead: false };

describe('旋斩弧家族（AI_190）', () => {
  it('972 永夜刃弧：ai1=25 消亡、scale 增速 0.2、旋进', () => {
    const game = makeGame(new World(120, 120, 30, 'open'));
    const arc = new SwingArc(owner, 972, 25, 40, 1, 1);
    arc.fixedUpdate(1, game);
    const rot0 = arc['rot'], sc0 = arc['scaleCur'];
    for (let t = 0; t < 12 && !arc.dead; t++) arc.fixedUpdate(1, game);
    expect(arc['rot']).toBeGreaterThan(rot0);          // π×ai0×num 旋进
    expect(arc['scaleCur']).toBeGreaterThan(sc0);      // num5=0.2 增速
    for (let t = 0; t < 40 && !arc.dead; t++) arc.fixedUpdate(1, game);
    expect(arc.dead).toBe(true);                       // t≥ai1
  });

  it('983 真断钢：num5=1.0/num6=1.2（增速最快）', () => {
    const game = makeGame(new World(120, 120, 30, 'open'));
    const a983 = new SwingArc(owner, 983, 18, 72, 1, 1);
    const a972 = new SwingArc(owner, 972, 18, 40, 1, 1);
    for (let t = 0; t < 9; t++) { a983.fixedUpdate(1, game); a972.fixedUpdate(1, game); }
    expect(a983['scaleCur']).toBeGreaterThan(a972['scaleCur']);   // 1.2+num vs 1+0.2num
  });

  it('锚定玩家：弧心随 owner 移动', () => {
    const game = makeGame(new World(120, 120, 30, 'open'));
    const arc = new SwingArc(owner, 982, 20, 72, 1, 1);
    arc.fixedUpdate(1, game);
    const x0 = arc.cx;
    owner.x += 64; owner.cx += 64;
    arc.fixedUpdate(1, game);
    expect(arc.cx - x0).toBeCloseTo(64, 0);
  });
});

describe('真永夜刃 973 伸长斩（AI_191）', () => {
  it('锚定伸长 + 寿命 ai1+65=97 + t≥80 清伤', () => {
    const game = makeGame(new World(120, 120, 30, 'open'));
    const slash = new TrueNightsEdgeSlash(owner, 100, 0, 35, 1, 32, 1);
    slash.fixedUpdate(1, game);
    const d0 = slash.cx - owner.cx;
    for (let t = 0; t < 80 && !slash.dead; t++) slash.fixedUpdate(1, game);   // 推到 t≥81（num5+3=80 清伤）
    expect(slash.cx - owner.cx).toBeGreaterThan(d0);   // vel×num6²×77 伸长
    expect(slash.damage).toBe(0);                      // t≥80 清伤（num5+3）
    for (let t = 0; t < 80 && !slash.dead; t++) slash.fixedUpdate(1, game);
    expect(slash.dead).toBe(true);                     // ai1+65=97
  });
});

describe('永夜刃飞斩（273 第二发 |ai0|<0.2 分支）', () => {
  it('飞行 + 10t 起前漂 + 30t 消亡', () => {
    const game = makeGame(new World(120, 120, 30, 'open'));
    const fly = new NightsEdgeFly(50 * TILE, 90 * TILE, 5, 0, 40, 1, 30, 1);
    const x5 = fly.x;
    for (let t = 0; t < 5 && !fly.dead; t++) fly.fixedUpdate(1, game);
    const drift0 = fly.x - x5;
    for (let t = 0; t < 10 && !fly.dead; t++) fly.fixedUpdate(1, game);
    expect(fly.x - x5).toBeGreaterThan(drift0);        // num7 前漂生效
    for (let t = 0; t < 60 && !fly.dead; t++) fly.fixedUpdate(1, game);
    expect(fly.dead).toBe(true);                       // ai1=30
  });
});

describe('Zenith 933（AI_182 FinalFractal）', () => {
  it('椭圆轨道绕锚点 + 计数 120 消亡 + 档案光照', () => {
    const game = makeGame(new World(200, 200, 30, 'open'));
    const z = new ZenithSword(owner, owner.cx + 400, owner.cy, 190, 757);   // 泰拉档案
    z.fixedUpdate(1, game);
    expect(z.lightRGB).toBeTruthy();
    const c0x = z.cx, c0y = z.cy;
    let guard = 0;
    while (!z.dead && guard++ < 500) z.fixedUpdate(1, game);
    expect(z.dead).toBe(true);                          // counter ≥120 消亡
    // 轨道：中途位置偏离初始（椭圆旋转）
    expect(Math.hypot(z.cx - c0x, z.cy - c0y)).toBeGreaterThan(1);
  });

  it('慢速剑计数更快（GetLerpValue(900,0,|vel|×2) 反比）', () => {
    const game = makeGame(new World(200, 200, 30, 'open'));
    const fast = new ZenithSword(owner, owner.cx + 4000, owner.cy, 190, 4956);  // |vel|=2000
    const slow = new ZenithSword(owner, owner.cx + 20, owner.cy, 190, 4956);    // |vel|=10
    fast.fixedUpdate(1, game); slow.fixedUpdate(1, game);
    expect(slow['counter']).toBeGreaterThan(fast['counter']);   // 慢 → lv=1 → num=2
  });

  it('档案表随机不落在 4956 之外缺项；randomFractalProfile 命中表内', () => {
    for (let i = 0; i < 50; i++) {
      const id = randomFractalProfile();
      expect(FRACTAL_KEYS).toContain(id);
    }
  });
});


describe('魔光剑斩痕 974（AI_188）', () => {
  it('36t 消亡（3t/帧×12）+ 暴击档 scale=ai0=2', () => {
    const game = makeGame(new World(120, 120, 30, 'open'));
    const lb = new LightsBaneSlash(60 * TILE, 60 * TILE, 1, 0, 8, 2);
    lb.fixedUpdate(1, game);
    expect(lb['frame']).toBe(0);                        // 3t/帧
    for (let t = 0; t < 38 && !lb.dead; t++) lb.fixedUpdate(1, game);
    expect(lb.dead).toBe(true);                         // frame>=12 = 36t
  });
});

describe('草剑飞叶 976（AI_152 976 分支）', () => {
  it('弧线飞行（vel 旋转）+ 恒速 16 + 岩浆即亡', () => {
    const w = new World(160, 300, 30, 'open');
    for (let x = 40; x < 120; x++) w.store.setTile(x, 60, 1, 0, 0);
    // 岩浆池（liquidType 2；铺 4 行防弧线旋转后 y 漂移出池；放左侧 x 10-16
    // ——勿放飞行路径上（曾放 60-66 被自己的飞叶撞进池里提前亡）
    for (let y = 53; y < 57; y++) for (let x = 10; x < 16; x++) {
      const i = w.store.idx(x, y); w.store.liquid[i] = 200; w.store.liquidType[i] = 2;
    }
    const game = makeGame(w);
    const gs = new GrassSlash(50 * TILE, 50 * TILE, 16, 0, 5, 0.05);
    gs.fixedUpdate(1, game);
    expect(Math.hypot(gs.vx, gs.vy)).toBeCloseTo(16, 1);   // 恒速（num6=0 原版最终态）
    const vy0 = gs.vy;
    for (let t = 0; t < 10 && !gs.dead; t++) gs.fixedUpdate(1, game);
    expect(Math.abs(gs.vy - vy0)).toBeGreaterThan(0.01);   // ai0 旋转 → 弧线
    expect(gs.dead).toBe(false);
    // 岩浆即亡
    gs.x = 12 * TILE; gs.y = 55 * TILE;
    gs.fixedUpdate(1, game);
    expect(gs.dead).toBe(true);
  });
});

describe('日耀喷发 611 链鞭（AI_075 :63918-63956）', () => {
  it('30t 消亡 + 旋进加速 + 命中出 612 爆焰（4t 节流）', () => {
    const w = new World(160, 300, 30, 'open');
    const list: unknown[] = [];
    let dmgTaken = 0;
    // 40×40 大盒贴路（链鞭旋进 vy 抖动 ±18/t 会快速偏移小盒）
    list.push({ id: 1, x: 52 * TILE, y: 89 * TILE, w: 40, h: 40, cx: 52 * TILE + 20, cy: 89 * TILE + 20,
      dead: false, hp: 500,
      hurt: (d: number) => { dmgTaken += d; return true; }, def: { hitSound: ['NPC_Hit_1'] } });
    const projectiles: unknown[] = [];
    const game = makeGame(w, list, projectiles);
    const whip = new SolarEruptionWhip(16, 0, 105);
    projectiles.push(whip);
    whip.x = 50 * TILE; whip.y = 90 * TILE;
    whip.fixedUpdate(1, game);
    const sp0 = Math.hypot(whip.vx, whip.vy);
    expect(sp0).toBeGreaterThan(16);                  // +48×spin 首帧加速
    for (let t = 0; t < 40 && !whip.dead; t++) whip.fixedUpdate(1, game);
    expect(whip.dead).toBe(true);                     // ai0≥30 消亡
    expect(projectiles.some((q) => q instanceof SolarFlare)).toBe(true);  // 612 已出
    expect(dmgTaken).toBeGreaterThan(0);
  });

  it('612 爆焰：15t 消亡 + scale 增长', () => {
    const game = makeGame(new World(160, 300, 30, 'open'));
    const flare = new SolarFlare(60 * TILE, 60 * TILE, 105, 1.0);
    flare.fixedUpdate(1, game);
    expect(flare['ai0']).toBe(1);
    for (let t = 0; t < 14 && !flare.dead; t++) flare.fixedUpdate(1, game);
    expect(flare.dead).toBe(true);                    // 3×5=15t
  });
});
