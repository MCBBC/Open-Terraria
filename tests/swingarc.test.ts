// 真刃系旋斩弧家族（AI_190/191 + 出生链 Player.cs:48265-48317）回归：
//   · SwingArc 972/982/983/997/984：t/ai1 旋进 + scale=(num6+num×num5)×ai2 + ai1 消亡
//   · TrueNightsEdgeSlash 973：锚定伸长 76px / 旋进 / 寿命 ai1+65=97 / t≥80 清伤
//   · NightsEdgeFly（273 飞斩）：10t 起前漂 + ai1=30 消亡 + 旋进
import { describe, it, expect } from 'vitest';
import { SwingArc, TrueNightsEdgeSlash, NightsEdgeFly } from '../src/entities/SwingArc';
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
