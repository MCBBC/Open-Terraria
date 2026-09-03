// 404 猪龙鱼链球本体（2611 Flairon,aiStyle 69 = AI_069 内联）行为锁（1457 权威行号）：
//   ①回收阈值三段：>400 转回收速 20（:30754-30757/:30771-30776）→ >600 加速 40
//     （:30766-30775）→ >1500 Kill（:30761-30765）/ dist<速度 回手 Kill（:30777-30781）
//   ②出程直线：AI 分支不修改 velocity = 初速无重力无摩擦（:30754 前仅置朝向）
//   ③撞块转回收不反弹（:19626 族支 → :19676-19684 ai[0]=1,反射门 aiStyle==3||109
//     不含 69）+ HitTiles 尘/SoundID 0（:19661-19686）
//   ④命中转回收（:14230-14233/:14778-14781）
//   ⑤淡入 alpha 255→ai1>5→0（SetDefaults :4856 + :30783-30787）
//   ⑥伴生泡泡节拍 ai1%4==0（首枚第 4 拍,回收段持续）;v=反向×Next(45,65)×0.1、
//     RotatedBy((rand−0.5)×π/2)=±45° 扇形（:30788-30795）
//   ⑦SetDummyItemTime(10) 每 tick 钉持 = 单实例门唯一承载（:30739→Player.cs:4417-4426;
//     404 不在 Player.cs:52801-52858 在场门列表 → 无在场扫描门,可多只承载面）
//   ⑧player.dead → Kill（:30734-30738）;朝向三件套（:30733/:30742-30753）
//   ⑨链条绘制不抛（Main.cs:29501 的 404/1058 同支 → drawChain37Link 共享件）
//   ⑩分类器：2611 → kind 'flairon'（vanillaItemCombat ai===69 门）
// 运行：cd game && npx vitest run tests/flairon-head.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import {
  FlaironHeadProj, FlaironSpike, FlailProj, placeAtShootSpawn,
} from '../src/entities/WeaponProj';
import { combatWeapon } from '../src/data/vanillaItemCombat';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 160;
const PX = 50 * 16, PY = 90 * 16;   // 玩家中心（row 90,地表 y=100 之上）

function makeHooks() {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) {
    for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  }
  const player = new Player(PX, PY, new Inventory());
  const enemies: Array<Record<string, unknown>> = [];
  const sfx: string[] = [];
  const particles: number[] = [];
  const hooks: GameHooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (_dmg: number) => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: (_x, _y, _c, n) => { particles.push(n); },
    notifyInventoryChanged: () => {},
    playSfx: (n) => { sfx.push(String(n)); },
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  return { hooks, player, enemies, sfx, particles, store };
}

/** 球出生在玩家右侧 dist px 处（盒左上=中心−13,质速沿 +x） */
function ballRightOf(player: Player, dist: number, spd = 14): FlaironHeadProj {
  return new FlaironHeadProj(player.cx + dist - 13, player.cy - 13, spd, 0, 66, 4.5);
}

function run(e: { fixedUpdate: (dt: number, g: GameHooks) => void; dead?: boolean },
  g: GameHooks, n: number) {
  for (let i = 0; i < n && !e.dead; i++) e.fixedUpdate(1 / 60, g);
}

describe('404 链球回收阈值三段（AI_069 :30754-30782）', () => {
  it('①出程直线（状态 0 速度不衰减不转向）→ 超 400 转回收速 20', () => {
    const { hooks, player } = makeHooks();
    const b = ballRightOf(player, 40);
    run(b, hooks, 26);
    expect(b.aiState).toBe(0);
    expect(b.vx).toBe(14);                        // 出程恒速（AI 分支内不修改 velocity）
    expect(b.vy).toBe(0);                         // 无重力
    run(b, hooks, 1);                             // 第 27 拍 dist=40+14×26=404 > 400
    expect(b.aiState).toBe(1);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(20, 9);   // :30771-30776 速 20
    expect(b.vx).toBeLessThan(0);                 // velocity = normalize(vector46)×20 = 朝玩家
  });

  it('②超 600 加速档 40（:30766-30769/:30772-30775）', () => {
    const { hooks, player } = makeHooks();
    const b = ballRightOf(player, 610);
    run(b, hooks, 1);                             // 610>400 → 1;610>600 → 2（同拍连跳）
    expect(b.aiState).toBe(2);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(40, 9);
  });

  it('③超 1500 Kill（:30761-30765）', () => {
    const { hooks, player } = makeHooks();
    const b = ballRightOf(player, 1510);
    run(b, hooks, 1);
    expect(b.dead).toBe(true);
  });

  it('④回手消失 dist<速度（:30777-30781）——先入回收态再送近手', () => {
    const { hooks, player } = makeHooks();
    const b = ballRightOf(player, 420);
    run(b, hooks, 1);                             // st=1,速度朝玩家 20
    expect(b.aiState).toBe(1);
    expect(b.dead).toBe(false);
    b.x = player.cx + 10 - 13;                    // dist=10 < 20
    run(b, hooks, 1);
    expect(b.dead).toBe(true);                    // Kill(回手)
  });
});

describe('404 撞块/命中语义', () => {
  it('①撞块转回收【不反弹】(:19626→:19676-19684,反射门 aiStyle==3||109 不含 69)'
    + '+ HitTiles 尘/SoundID 0（:19661-19686）', () => {
    const { hooks, player, sfx, particles, store } = makeHooks();
    for (let y = 60; y < 100; y++) store.setTile(56, y, 1);   // 竖墙（左缘 x=896）
    const b = ballRightOf(player, 20);            // 盒左 820,盒右 846 → 896 差 50px
    let hitTick = -1, vxAtHit = NaN;
    for (let i = 0; i < 20 && hitTick < 0; i++) {
      b.fixedUpdate(1 / 60, hooks);
      if (b.aiState === 1) { hitTick = i; vxAtHit = b.vx; }
    }
    expect(hitTick).toBeGreaterThanOrEqual(0);    // 撞墙 → ai[0]=1 转回收
    // 受阻轴清零（原版 Update velocity=碰撞解析后向量）——非 +14 直进、非 −14 反弹
    expect(vxAtHit).toBe(0);
    expect(sfx.filter((s) => s === 'dig').length).toBe(1);   // :19686 SoundID 0 一响
    expect(particles.length).toBeGreaterThanOrEqual(1);      // HitTiles 尘(:19663)
    // 回收段穿墙（:30770 tileCollide=false）——不二次撞墙不二响
    const digBefore = sfx.length;
    run(b, hooks, 6);
    expect(sfx.length).toBe(digBefore);
  });

  it('②命中敌即转回收（:14230-14233）且伤害落地', () => {
    const { hooks, player, enemies } = makeHooks();
    enemies.push({
      id: 1, x: player.cx + 80, y: player.cy - 20, w: 24, h: 40, dead: false,
      vx: 0, vy: 0, hp: 100,
      hurt: (d: number) => {
        const e = enemies[0] as unknown as { hp: number };
        e.hp = e.hp - d;
        return true;
      },
    } as never);
    const b = ballRightOf(player, 20);
    let hitTick = -1;
    for (let i = 0; i < 20 && hitTick < 0; i++) {
      b.fixedUpdate(1 / 60, hooks);
      if (b.aiState === 1) hitTick = i;
    }
    expect(hitTick).toBeGreaterThanOrEqual(0);
    const en = enemies[0] as unknown as { hp: number };
    expect(en.hp).toBeLessThan(100);
    expect(b.dead).toBe(false);                   // 转回收非消亡
  });
});

describe('404 淡入与朝向（:30733/:30742-30753/:30783-30787）', () => {
  it('①alpha 255(隐形)→ ai1>5 → 0（全显,:4856+:30784-30787）', () => {
    const { hooks, player } = makeHooks();
    const b = ballRightOf(player, 60);
    expect(b.alphaView).toBe(255);
    run(b, hooks, 5);
    expect(b.aiTick).toBe(5);
    expect(b.alphaView).toBe(255);
    run(b, hooks, 1);                             // ai1=6 > 5
    expect(b.alphaView).toBe(0);
  });

  it('②rotation=atan2(玩家−球)−π/2(:30733);spriteDir(:30753 球左=−1/球右=1);'
    + 'ChangeDir 球右→玩家朝右(:30742-30751 vcx<0 → ChangeDir(1))', () => {
    const { hooks, player } = makeHooks();
    const b = ballRightOf(player, 100);
    b.fixedUpdate(1 / 60, hooks);
    // 球在玩家正右：vector46 = (−100,0) → atan2 = π → rotation = π/2
    const dev = Math.abs(((Math.atan2(0, -100) - Math.PI / 2) - b['rotation'] + Math.PI * 3)
      % (Math.PI * 2) - Math.PI);
    expect(dev).toBeLessThan(1e-9);
    expect(b['spriteDir']).toBe(1);               // vector46.X=−100 ≯0 → spriteDirection=1（:30753）
    expect(player.facing).toBe(1);                // vcx<0 → ChangeDir(1)（玩家朝球侧,:30744-30745）
    // 球在玩家左侧：vector46.X>0 → spriteDir=−1（镜像）+ 玩家朝左（ChangeDir(−1)）
    const l = new FlaironHeadProj(player.cx - 100 - 13, player.cy - 13, -14, 0, 66, 4.5);
    (player as unknown as { facing: number }).facing = 1;
    l.fixedUpdate(1 / 60, hooks);
    expect(l['spriteDir']).toBe(-1);
    expect(player.facing).toBe(-1);
  });

  it('③player.dead → Kill（:30734-30738,先于钉持）', () => {
    const { hooks, player } = makeHooks();
    const b = ballRightOf(player, 60);
    let pins = 0;
    b.pinUse = () => { pins++; };
    (player as unknown as { dead: boolean }).dead = true;
    b.fixedUpdate(1 / 60, hooks);
    expect(b.dead).toBe(true);
    expect(pins).toBe(0);                         // Kill 早退不钉持
  });
});

describe('404 伴生泡泡节拍（:30788-30795）', () => {
  const rnd = vi.spyOn(Math, 'random');
  afterAll(() => { rnd.mockRestore(); });

  it('①首枚第 4 拍（ai1%4==0）,每 4 拍一枚,回收段持续', () => {
    rnd.mockReturnValue(0.5);                     // 速度 (45+10)×0.1=5.5;转角 0
    const { hooks, player } = makeHooks();
    const out: Array<{ x: number; y: number; vx: number; vy: number; id: number; dmg: number; kb: number }> = [];
    const b = ballRightOf(player, 100, 4);        // 慢速防过冲失真
    b.spawnProj = (x, y, vx, vy, id, dmg, kb) => out.push({ x, y, vx, vy, id, dmg, kb });
    run(b, hooks, 3);
    expect(out.length).toBe(0);                   // 第 1-3 拍无（ai1=1..3）
    run(b, hooks, 1);                             // 第 4 拍 ai1=4
    expect(out.length).toBe(1);
    expect(out[0].id).toBe(405);
    run(b, hooks, 4);                             // 第 8 拍
    expect(out.length).toBe(2);
    // 出程段→回收段节拍不断（慢速球 40+? 早转回收;ai1 连续计数）
    run(b, hooks, 12);
    expect(out.length).toBeGreaterThanOrEqual(5);
  });

  it('②泡泡速度 = 反向单位向×Next(45,65)×0.1（速 4.5-6.4,背向玩家）;出生位=当拍球心', () => {
    const { hooks, player } = makeHooks();
    const out: Array<{ x: number; y: number; vx: number; vy: number }> = [];
    const b = ballRightOf(player, 100, 4);
    b.spawnProj = (x, y, vx, vy) => out.push({ x, y, vx, vy });
    const centers: number[] = [];
    for (let i = 0; i < 40 && !b.dead; i++) {
      centers.push(b.cx);                         // AI 段所见的球心（位移前）
      b.fixedUpdate(1 / 60, hooks);
    }
    expect(out.length).toBeGreaterThanOrEqual(8);
    for (const o of out) {
      const spd = Math.hypot(o.vx, o.vy);
      expect(spd).toBeGreaterThanOrEqual(4.5 - 1e-9);
      expect(spd).toBeLessThanOrEqual(6.4 + 1e-9);
      // 转角后仍背向玩家半球（|偏差|≤45°,球在玩家右侧 → vx 分量 ≥ cos45×speed>0）
      expect(o.vx).toBeGreaterThan(0);
      expect(o.y).toBeCloseTo(player.cy, 9);      // 水平飞行线上
    }
    // 出生位 = 生成拍 AI 段的球心（NewProjectile 中心语义;盒左上换算归回调侧）
    // ——首枚第 4 拍 = centers[3]
    expect(out[0].x).toBeCloseTo(centers[3], 9);
  });

  it('③RotatedBy ±45° 扇形端值（rand=0 → −45°,rand=1 → +45°,:30793×1.5707963…）', () => {
    const { hooks, player } = makeHooks();
    // rand=0：speed=(45+0)×0.1=4.5,转角 (0−0.5)×π/2=−45° → (1,0) 旋转后 (cos45,−sin45)×4.5
    rnd.mockReturnValueOnce(0).mockReturnValueOnce(0);
    const b1 = ballRightOf(player, 100, 4);
    const got1: Array<{ vx: number; vy: number }> = [];
    b1.spawnProj = (_x, _y, vx, vy) => got1.push({ vx, vy });
    run(b1, hooks, 4);
    expect(got1[0].vx).toBeCloseTo(Math.SQRT1_2 * 4.5, 9);
    expect(got1[0].vy).toBeCloseTo(-Math.SQRT1_2 * 4.5, 9);
    // rand=1：speed=(45+20)×0.1=6.5? —— Next(45,65) 上界开区间×0.1 → 6.4+1e-9 帽内;
    //   转角 (1−0.5)×π/2=+45° → (cos45,+sin45)×6.5
    rnd.mockReturnValueOnce(1).mockReturnValueOnce(1);
    const b2 = ballRightOf(player, 100, 4);
    const got2: Array<{ vx: number; vy: number }> = [];
    b2.spawnProj = (_x, _y, vx, vy) => got2.push({ vx, vy });
    run(b2, hooks, 4);
    expect(got2[0].vx).toBeCloseTo(Math.SQRT1_2 * 6.5, 9);
    expect(got2[0].vy).toBeCloseTo(Math.SQRT1_2 * 6.5, 9);
  });

  it('④伴生实体 = FlaironSpike（已 1:1 实装,勿重复实现）——Game 侧回调形态冒烟', () => {
    const { hooks, player } = makeHooks();
    const made: FlaironSpike[] = [];
    const b = ballRightOf(player, 100, 4);
    const centers: number[] = [];
    b.spawnProj = (x, y, vx, vy, id, dmg, kb) => {
      if (id !== 405) return;
      const bub = new FlaironSpike(x - 7, y - 7, vx, vy, Math.max(1, Math.round(dmg)), kb);
      made.push(bub);
    };
    for (let i = 0; i < 8 && !b.dead; i++) {
      centers.push(b.cx);
      b.fixedUpdate(1 / 60, hooks);
    }
    expect(made.length).toBeGreaterThanOrEqual(2);
    for (const m of made) {
      expect(m.projId).toBe(405);
      expect(m.damage).toBe(66);                  // 泡泡伤 = 球伤原样（:30794 damage 直传）
    }
    // 盒心回正：回调传球心(中心语义),FlaironSpike ctor 收盒左上 → −7,−7 后盒心=当拍球心
    expect(made[0].cx).toBeCloseTo(centers[3], 9);
  });
});

describe('404 单实例门 = SetDummyItemTime 钉持（:30739→Player.cs:4417-4426）', () => {
  it('①存活期每拍 pinUse(10);死亡即停钉（复用窗自然回落）', () => {
    const { hooks, player } = makeHooks();
    const b = ballRightOf(player, 60);
    const pins: number[] = [];
    b.pinUse = (t) => pins.push(t);
    run(b, hooks, 3);
    expect(pins).toEqual([10, 10, 10]);           // 每 tick SetDummyItemTime(10)
    b.life = 1;                                   // 下一拍寿命尽
    b.fixedUpdate(1 / 60, hooks);
    expect(b.dead).toBe(true);
    expect(pins.length).toBe(3);                  // 死拍/死后不再钉
  });

  it('②无在场扫描门（404 不在 Player.cs:52801 列表）——两球并存互不干扰(可多只承载面)', () => {
    const { hooks, player } = makeHooks();
    const a = ballRightOf(player, 100);
    const c = ballRightOf(player, 200);
    const pins: number[] = [];
    a.pinUse = (t) => pins.push(t);
    c.pinUse = (t) => pins.push(t);
    run(a, hooks, 5);
    run(c, hooks, 5);
    expect(a.dead).toBe(false);
    expect(c.dead).toBe(false);
    expect(pins.length).toBe(10);                 // 两球各自钉持（构造面无任何互斥）
  });
});

describe('404 链条绘制（Main.cs:29501 的 404/1058 同支 → drawChain37Link 共享件）', () => {
  type Call = { m: string; a: unknown[] };
  function makeRecCtx() {
    const calls: Call[] = [];
    const store: Record<string, unknown> = {};
    const ctx = new Proxy(store, {
      get: (t, k) => (typeof k === 'string' && k in t ? t[k] : (...a: unknown[]) => { calls.push({ m: String(k), a }); }),
      set: (_t, k, v) => { store[String(k)] = v; calls.push({ m: `set:${String(k)}`, a: [v] }); return true; },
    });
    return { calls, ctx: ctx as unknown as CanvasRenderingContext2D };
  }

  beforeAll(() => {
    vi.stubGlobal('Image', class {
      width = 30; height = 32;
      naturalWidth = 30; naturalHeight = 32;
      complete = true;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) { this.onload?.(); }
    });
  });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('远手绘制不抛且逐节 drawImage(3 参链节) 有节;近手(<链节高+1)仅球体不抛', () => {
    const { calls, ctx } = makeRecCtx();
    const r = { ctx, lighting: { lightAt: () => [255, 255, 255] } } as never;
    const cam = {} as never;
    const b = new FlaironHeadProj(100, 100, 14, 0, 66, 4.5);
    b.handX = 400; b.handY = 500;                 // 手距球心 ≈481 >> 链节高
    expect(() => b.draw(r, cam)).not.toThrow();
    const links = calls.filter((c) => c.m === 'drawImage' && c.a.length === 3);
    expect(links.length).toBeGreaterThanOrEqual(2);   // 链节多节（drawChain37Link 3 参式）
    const ball = calls.filter((c) => c.m === 'drawImage' && c.a.length === 5);
    expect(ball.length).toBe(1);                  // 球体（drawProj 中心锚 5 参式）
    // 近手：链节终止门（d < linkH+1 → break）不抛且零链节
    const { calls: calls2, ctx: ctx2 } = makeRecCtx();
    const r2 = { ctx: ctx2, lighting: { lightAt: () => [255, 255, 255] } } as never;
    b.handX = 104; b.handY = 104;                 // 距球心 ~5.7 < 链节高+1
    expect(() => b.draw(r2, cam)).not.toThrow();
    expect(calls2.filter((c) => c.m === 'drawImage' && c.a.length === 3).length).toBe(0);
  });

  it('链条与 1058 同构（同函数 drawChain37Link;FlailProj.drawChain1058 委托同一实现）', () => {
    // 404 球与 1058 球在【同球心/同手位】下链节数一致（同支同贴图 Chain37,Main.cs:29518）
    const { calls, ctx } = makeRecCtx();
    const r = { ctx, lighting: { lightAt: () => [255, 255, 255] } } as never;
    const h = new FlaironHeadProj(100, 100, 14, 0, 66, 4.5);
    h.handX = 400; h.handY = 400;
    h.draw(r, {} as never);
    const links404 = calls.filter((c) => c.m === 'drawImage' && c.a.length === 3).length;
    const { calls: calls2, ctx: ctx2 } = makeRecCtx();
    const r2 = { ctx: ctx2, lighting: { lightAt: () => [255, 255, 255] } } as never;
    const f = new FlailProj(100, 100, 66, 4.5, 1058, () => false, () => ({ x: 400, y: 400 }));
    // 与 404 同盒左上（同球心 (113,113)）——placeAtShootSpawn 会回正盒心引入几何差,勿用
    f.handX = 400; f.handY = 400;
    f.draw(r2, {} as never);
    const links1058 = calls2.filter((c) => c.m === 'drawImage' && c.a.length === 3).length;
    expect(links404).toBe(links1058);
    expect(links404).toBeGreaterThan(0);
  });
});

describe('404 分类器（vanillaItemCombat ai===69 → kind flairon）', () => {
  it('2611 → flairon;数值随行;autoReuse 随行', () => {
    const cw = combatWeapon({ key: 'vi_2611_Flairon', vid: 2611 });
    expect(cw?.kind).toBe('flairon');
    if (cw?.kind === 'flairon') {
      expect(cw.shoot).toBe(404);
      expect(cw.damage).toBe(66);
      expect(cw.knockback).toBeCloseTo(4.5, 9);
      expect(cw.useTime).toBe(20);
      expect(cw.shootSpeed).toBe(14);
      expect(cw.autoReuse).toBe(true);            // Item.cs:25524（:25520 的 false 被覆写）
      expect(cw.useAnimation).toBe(20);
    }
  });

  it('5526 仍走 flail（互换两形态按 aiStyle 天然分流,互不干扰）', () => {
    expect(combatWeapon({ key: 'vi_5526_FlaironFlail', vid: 5526 })?.kind).toBe('flail');
  });
});
