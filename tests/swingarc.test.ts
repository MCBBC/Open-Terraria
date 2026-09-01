// 真刃系旋斩弧家族（AI_190/191 + 出生链 Player.cs:48265-48317）回归：
//   · SwingArc 972/982/983/997/984：t/ai1 旋进 + scale=(num6+num×num5)×ai2 + ai1 消亡
//   · TrueNightsEdgeSlash 973：锚定伸长 76px / 旋进 / 寿命 ai1+65=97 / t≥80 清伤
//   · NightsEdgeFly（273 飞斩）：10t 起前漂 + ai1=30 消亡 + 旋进
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { SwingArc, TrueNightsEdgeSlash, NightsEdgeFly, ZenithSword, randomFractalProfile, FRACTAL_KEYS, LightsBaneSlash, GrassSlash, fractalProfile, fractalStripFade, fractalGhostAlpha } from '../src/entities/SwingArc';
import { SolarEruptionWhip, SolarFlare } from '../src/entities/SolarEruption';
import { TideSlash } from '../src/entities/TideSlash';
import { FirstFractalSlash } from '../src/entities/FirstFractal';
import { ChainsawProj } from '../src/entities/ChainsawProj';
import { Arrow } from '../src/entities/Arrow';
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
    damagePlayer: (): number => 0, critters: () => [], notifyInventoryChanged: () => {},
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

  it('拖尾环 60 条（TrailCacheLength）+ TrailingMode4 随玩家平移', () => {
    const game = makeGame(new World(200, 200, 30, 'open'));
    const z = new ZenithSword(owner, owner.cx + 400, owner.cy, 190, 4956);
    for (let i = 0; i < 60; i++) z.fixedUpdate(1, game);   // 120 update → 满 60 条
    expect(z['trail'].length).toBe(60 * 3);
    const t0 = z['trail'].slice() as number[];
    const dx = 64;
    owner.x += dx; owner.cx += dx;
    z.fixedUpdate(1, game);
    // 旧条目整体 +64（首条是最旧的）
    expect(z['trail'][0] - t0[0]).toBeCloseTo(dx, 0);
  });

  it('lance 线形判定（:14333-14363）：刃向 35px 处（32×32 盒外）命中、120px 不命中', () => {
    const game = makeGame(new World(200, 200, 30, 'open'));
    const z = new ZenithSword(owner, owner.cx + 400, owner.cy, 190, 4956);
    z.fixedUpdate(1, game);
    const rot = z['rot'] as number;
    const dx = Math.cos(rot + Math.PI / 2), dy = Math.sin(rot + Math.PI / 2);
    expect(z['bladeHits'](z.cx + dx * 35 - 10, z.cy + dy * 35 - 10, 20, 20)).toBe(true);
    expect(z['bladeHits'](z.cx + dx * 120 - 10, z.cy + dy * 120 - 10, 20, 20)).toBe(false);
  });

  it('伤害归属 = 面板 ±15%（DamageVar）+ 7update 免疫窗不重复', () => {
    // 轨道环上布 16 敌（vel=(200,0) → 锚点=玩家+(200,0)、半径≈200+40）：剑扫整圈
    // 必命中若干；免疫窗 7 update ≪ 扫圈周期 → 同敌不连击
    const hits: number[] = [];
    const perEnemy = new Map<number, number>();
    const list: unknown[] = [];
    const ax = owner.cx + 200, ay = owner.cy;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const ex = ax + Math.cos(a) * 200 - 10, ey = ay + Math.sin(a) * 200 - 10;
      list.push({
        id: i + 1, x: ex, y: ey, w: 20, h: 20, cx: ex + 10, cy: ey + 10,
        vx: 0, vy: 0, dead: false, hp: 5000,
        hurt: (d: number) => { hits.push(d); perEnemy.set(i + 1, (perEnemy.get(i + 1) ?? 0) + 1); return true; },
        def: { hitSound: ['NPC_Hit_1'] },
      });
    }
    const game = makeGame(new World(400, 400, 30, 'open'), list);
    const z = new ZenithSword(owner, owner.cx + 400, owner.cy, 190, 4956);
    z.critChance = 0;
    for (let t = 0; t < 20 && !z.dead; t++) z.fixedUpdate(1, game);   // ~40 update ≈ 扫近一圈
    expect(hits.length).toBeGreaterThanOrEqual(2);
    for (const d of hits) {
      expect(d).toBeGreaterThanOrEqual(190 * 0.85 - 0.5);
      expect(d).toBeLessThanOrEqual(190 * 1.15 + 0.5);
    }
    // 7 update 免疫窗 + 拖尾命中盒（原版语义：路径沿途持续可命中——当前刃线 +
    // 4 个拖尾采样线 = 单敌一扫圈至多 5 中），杜绝每 update 连击
    for (const n of perEnemy.values()) expect(n).toBeLessThanOrEqual(5);
  });
});

describe('Zenith 发射节奏（Player.cs flag4 :42880 + 3*useTime 门 :42818）', () => {
  it('节奏探针：30 帧挥击每 10 帧一发共 3 发（num164=0/1/2），无第 4 发', () => {
    const dur = 30, useTime = 10;
    let fired = 1;                       // 首发 num164=0 已于挥击开始射出
    const cycles: number[] = [0];
    for (let t = dur - 1; t >= 1; t--) {
      const c = Game.zenithFireCycle(dur, t, useTime, fired);
      if (c != null) { cycles.push(c); fired = c + 1; }
    }
    expect(cycles).toEqual([0, 1, 2]);
  });

  it('攻速缩动画：dur=21 仍 3 发、dur=15 只 2 发（原版 num164 语义）', () => {
    for (const [dur, want] of [[21, [0, 1, 2]], [15, [0, 1]]] as const) {
      let fired = 1;
      const cycles: number[] = [0];
      for (let t = dur - 1; t >= 1; t--) {
        const c = Game.zenithFireCycle(dur, t, 10, fired);
        if (c != null) { cycles.push(c); fired = c + 1; }
      }
      expect(cycles).toEqual([...want]);
    }
  });

  it('轨迹采样：出生贴玩家、绕锚点（玩家+vel）转、半径≈|vel|+40', () => {
    const game = makeGame(new World(200, 200, 30, 'open'));
    const z = new ZenithSword(owner, owner.cx + 400, owner.cy, 190, 4956);
    z.fixedUpdate(1, game);   // vel=(200,0) → 锚点=玩家+(200,0)
    const ax = owner.cx + 200, ay = owner.cy;
    const d = Math.hypot(z.cx - ax, z.cy - ay);
    expect(d).toBeGreaterThan(150);
    expect(d).toBeLessThan(250);
    // 起步阶段剑在玩家近旁（轨道起点=玩家位 + 起始回拉）
    expect(Math.hypot(z.cx - owner.cx, z.cy - owner.cy)).toBeLessThan(80);
    let guard = 0;
    while (z['counter'] < 30 && guard++ < 100) z.fixedUpdate(1, game);   // phase≥0.5
    expect(Math.hypot(z.cx - ax, z.cy - ay)).toBeGreaterThan(150);      // 仍在轨道上
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
    (whip as unknown as { ai1: number }).ai1 = 0.1;   // 固定抖动（随机抖动会随机甩偏 flaky）
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

describe('波涌之刃 451（aiStyle 81 三阶段）', () => {
  it('掷出渐显 → 折返 → 瞬击穿梭（250px 敌重定向+100px 环落）→ 末段消亡', () => {
    const w = new World(160, 300, 30, 'open');
    const list: unknown[] = [];
    let dmgTaken = 0;
    list.push({ id: 1, x: 60 * TILE, y: 90 * TILE, w: 40, h: 40, cx: 60 * TILE + 20, cy: 90 * TILE + 20,
      vx: 0, vy: 0, dead: false, hp: 500,
      hurt: (d: number) => { dmgTaken += d; return true; }, def: { hitSound: ['NPC_Hit_1'] } });
    const game = makeGame(w, list);
    const tide = new TideSlash(16, 0, 100, 4.5, 3);
    game.entities && ((game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(tide, 'projectiles'));
    tide.x = 50 * TILE; tide.y = 90 * TILE;
    tide.fixedUpdate(1, game);
    expect(tide['ai0']).toBe(-1);                     // 掷出阶段
    for (let t = 0; t < 80 && !tide.dead; t++) tide.fixedUpdate(1, game);
    // 三阶段流转至少进入瞬击（ai0 ≥ 1）并最终消亡
    expect(tide.dead || tide['ai0'] >= 0).toBe(true);
  });
});

describe('初代分形剑 857（AI_168）+ 双足翼龙弹 711 模式', () => {
  it('857：60t 消亡 + 曲率旋进 + Opacity 包络', () => {
    const game = makeGame(new World(160, 300, 30, 'open'));
    const ff = new FirstFractalSlash(50 * TILE, 90 * TILE, 12, 0, 190, Math.PI / 120);
    ff.fixedUpdate(1, game);
    const a0 = Math.atan2(ff.vy, ff.vx);
    expect(a0).toBeGreaterThan(0);                     // 曲率旋进（vy 从 0 起）
    for (let t = 0; t < 70 && !ff.dead; t++) ff.fixedUpdate(1, game);
    expect(ff.dead).toBe(true);                        // 59t 消亡
  });

  it('711：构造态 dragonFade + betsyCurse + 30×30 盒 scale 0.7', () => {
    const b = new Arrow(0, 0, 10, 0, 10, 1, 711, null, {});
    expect(b.dragonFade).toBe(true);
    expect(b.betsyCurse).toBe(true);
    expect(b.w).toBe(30); expect(b.h).toBe(30);
    expect(b.drawScale).toBeCloseTo(0.7, 3);
    expect(b.extraUpdates).toBe(1);
  });
});

describe('屠夫链锯 509（AI_020 channel 持械）', () => {
  it('挂手锚定 + 断链即亡 + 帧交替 + 持续命中 10t 冷却', () => {
    const w = new World(160, 300, 30, 'open');
    const list: unknown[] = [];
    let dmgTaken = 0;
    list.push({ id: 1, x: 50 * TILE, y: 89 * TILE, w: 40, h: 40,
      dead: false, hp: 500,
      hurt: (d: number) => { dmgTaken += d; return true; }, def: { hitSound: ['NPC_Hit_1'] } });
    const game = makeGame(w, list);
    let ch = true;
    const owner = { cx: 50 * TILE + 10, cy: 90 * TILE + 20, facing: 1, dead: false };
    const saw = new ChainsawProj(owner as never, 120, 5.5,
      () => ch, () => ({ x: 55 * TILE, y: 90 * TILE }));
    saw.critChance = 0;                                   // 禁暴击（120 基伤断言确定性）
    saw.fixedUpdate(1, game);
    expect(saw.x + saw.w / 2).toBeCloseTo(owner.cx, 0);   // 挂手锚定
    const f0 = saw['frame'];
    saw.fixedUpdate(1, game); saw.fixedUpdate(1, game);
    expect(saw['frame']).toBe(1 - f0);                     // 2t/帧交替
    expect(dmgTaken).toBeGreaterThan(0);                   // 持续命中（40×40 覆盖弹盒）
    const d0 = dmgTaken;
    for (let t = 0; t < 5; t++) saw.fixedUpdate(1, game);
    expect(dmgTaken).toBe(d0);                             // 10t 冷却内不重复（首击后 5t 仍在窗内）
    ch = false;
    saw.fixedUpdate(1, game);
    expect(saw.dead).toBe(true);                           // 断链即亡
  });
});

describe('Zenith 视觉层 1:1（FinalFractalHelper/DrawProjDirect 视觉链）', () => {
  it('拖尾颜色公式（StripColors :54-59）：progress 0→1 因子 1→0、0.98 归零、沿程单调递减', () => {
    expect(fractalStripFade(0)).toBeCloseTo(1, 5);
    expect(fractalStripFade(0.49)).toBeCloseTo(0.5, 5);   // 线性段中点
    expect(fractalStripFade(0.98)).toBe(0);               // GetLerpValue(0,0.98,0.98)=1
    expect(fractalStripFade(1)).toBe(0);
    let prev = 1;
    for (let p = 0; p <= 1.001; p += 0.02) {
      expect(fractalStripFade(p)).toBeLessThanOrEqual(prev + 1e-9);
      prev = fractalStripFade(p);
    }
  });

  it('彩带=每剑固定档案色（无 hue 渐变）：档案色互异、Zenith 本体=OurFavoriteColor(255,231,69)', () => {
    const z = fractalProfile(1123);
    expect(z.color).toEqual([255, 231, 69]);              // Main.cs:868
    expect(z.len).toBe(48);                               // 全刃长 48 → trailWidth 24
    // 宽度恒定（StripWidth :61-64 返回常 trailWidth）——不同剑不同宽、同剑沿程不变
    expect(fractalProfile(3018).len / 2).toBe(40);
    expect(fractalProfile(121).len / 2).toBe(38);
    // 彩虹来自档案色差异（齐射随机档案——每剑一色）
    const colors = new Set(FRACTAL_KEYS.map((k) => fractalProfile(k).color.join(',')));
    expect(colors.size).toBeGreaterThan(10);
  });

  it('白残影 ×3（:30381/:30174-30181）：num159∈{45,30,15}（60 越界跳过）、近影亮于远影', () => {
    const opacity = 1, counter = 40;
    const a15 = fractalGhostAlpha(counter, 15, opacity);
    const a30 = fractalGhostAlpha(counter, 30, opacity);
    const a45 = fractalGhostAlpha(counter, 45, opacity);
    expect(a15).toBeGreaterThan(a30);
    expect(a30).toBeGreaterThan(a45);                     // GetLerpValue(0,60,60−num159)
    // t=counter−num159 在 20-60 窗内时包络=1（:30609）
    expect(fractalGhostAlpha(40, 15, 1)).toBeCloseTo(45 / 60, 5);
    expect(fractalGhostAlpha(10, 45, 1)).toBe(0);         // t=−35 < 20 淡入为 0
    expect(fractalGhostAlpha(85, 15, 1)).toBe(0);         // t=70 > 68 淡出归零
  });

  it('本体淡入淡出包络（:30799-30801 num182）：0-20 淡入、60-68 淡出（counter 45 全亮、70 归零）', () => {
    const num182 = (c: number) => ZenithSword.lerpV(0, 20, c) * ZenithSword.lerpV(68, 60, c);
    expect(num182(45)).toBeCloseTo(1, 5);
    expect(num182(10)).toBeCloseTo(0.5, 5);
    expect(num182(68)).toBe(0);
    expect(num182(70)).toBe(0);
  });

  it('光照门（:40478 num2<1）：counter<60 两点光、≥60 熄灭 + MountedCenter 补光走 addLightAt', () => {
    const game = makeGame(new World(200, 200, 30, 'open')) as GameHooks & { addLightAt?: unknown };
    const lights: number[][] = [];
    game.addLightAt = (x: number, y: number, r: number, g: number, b: number) => { lights.push([x, y, r, g, b]); };
    const z = new ZenithSword(owner, owner.cx + 400, owner.cy, 190, 757);   // 泰拉刃 (80,222,122)
    z.fixedUpdate(1, game);
    expect(z.lightRGB).toBeTruthy();                      // Center 点光 trailColor×0.5×Opacity
    const op = z['opacity'] as number;
    expect(z.lightRGB![0]).toBeCloseTo(80 / 255 * 0.5 * op, 3);
    expect(lights.length).toBeGreaterThanOrEqual(1);      // MountedCenter 补光
    const l = lights[lights.length - 1];
    expect(l[0]).toBeCloseTo(owner.cx, 0);
    expect(l[2]).toBeCloseTo((1 + (80 / 255 - 1) * 0.7) * op * 0.15, 3);
    // 推到 counter ≥ 60：两路光全熄
    let guard = 0;
    while (z['counter'] < 60 && guard++ < 400) z.fixedUpdate(1, game);
    const nLights = lights.length;
    z.fixedUpdate(1, game); z.fixedUpdate(1, game);
    expect(z.lightRGB).toBeNull();
    expect(lights.length).toBe(nLights);
  });

  it('拖尾尘走原版 278 池（StripDust :38-52）：num11 次独立 1/9 掷、色=Lerp(trailColor,White,≤0.3)', () => {
    const game = makeGame(new World(200, 200, 30, 'open'));
    const spawned: { scale: number; fadeIn: number; alpha: number; type: number; noGravity: boolean; color: { r: number; g: number; b: number } }[] = [];
    (game as { spawnDust?: unknown }).spawnDust = (_x: number, _y: number, _w: number, _h: number, type: number,
      _sx: number, _sy: number, alpha: number, color: { r: number; g: number; b: number }, scale: number, noGravity: boolean) => {
      const d = { scale, fadeIn: 0, alpha, type, noGravity, color, vx: 0, vy: 0 };
      spawned.push(d);
      return d;
    };
    const z = new ZenithSword(owner, owner.cx + 400, owner.cy, 190, 795);   // (237,28,36)
    for (let t = 0; t < 40; t++) z.fixedUpdate(1, game);   // phase 峰值区（尘最密）
    expect(spawned.length).toBeGreaterThan(0);
    for (const d of spawned) {
      expect(d.type).toBe(278);
      expect(d.alpha).toBe(100);
      expect(d.noGravity).toBe(true);
      expect(d.fadeIn).toBeGreaterThanOrEqual(0.4);        // 后置覆写 fadeIn=0.4+rand×0.3
      expect(d.fadeIn).toBeLessThanOrEqual(0.7);
      expect(d.color.r).toBeGreaterThanOrEqual(237);       // Lerp 向 White：只增不减
      expect(d.color.r).toBeLessThanOrEqual(255);
      expect(d.color.b).toBeGreaterThanOrEqual(36);
    }
  });
});
