// 数据驱动武器实体行为模拟测试（Boomerang/SpearProj/GrenadeProj/YoyoProj）
// 用最小 mock GameHooks 直接跑 fixedUpdate，验证 aiStyle 家族行为主干
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Boomerang, SpearProj, YoyoProj, GrenadeProj, FlailProj, FlaironSpike } from '../src/entities/WeaponProj';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 120;

function makeHooks(opts: { channel?: boolean; target?: { x: number; y: number } } = {}) {
  const store = new TileStore(W, H);
  // 地面：y=100 以下全实心（tile 1 近似实心块——TileStore 类型 0 = 空）
  for (let x = 0; x < W; x++) {
    for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  }
  const player = new Player(50 * 16, 90 * 16, new Inventory());
  const enemies: Array<Record<string, unknown>> = [];
  const events: string[] = [];
  const hooks: GameHooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (d) => events.push(`pHit:${d}`),
    addDamageNumber: (x, y, n) => events.push(`dmg:${n}@${Math.round(x)},${Math.round(y)}`),
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  return { hooks, player, enemies, events, channel: !!opts.channel };
}

/** 空中敌人（y=90 行，悬浮不动） */
function addEnemy(enemies: Array<Record<string, unknown>>, id: number, ex: number, ey: number) {
  enemies.push({
    id, x: ex, y: ey, w: 24, h: 40, dead: false, vx: 0, vy: 0,
    hp: 100,
    hurt: (d: number) => { enemies.find((e) => e.id === id)!.hp = (enemies.find((e) => e.id === id)!.hp as number) - d; events_track.push(id); return true; },
  } as never);
}
// hurt 内部记账
const events_track: number[] = [];

const STEP = 300;
function run(e: { fixedUpdate: (dt: number, g: GameHooks) => void; dead?: boolean }, g: GameHooks, n = STEP) {
  for (let i = 0; i < n && !e.dead; i++) e.fixedUpdate(1 / 60, g);
}

describe('回旋镖（aiStyle 3）', () => {
  it('飞出减速 → 返回主角 → 回手消失，途中可命中', () => {
    const { hooks, player, enemies } = makeHooks();
    // 敌人摆在回旋镖飞行线上（AI_003 出程无摩擦直线:30t×10px/t=300px 射程内）
    addEnemy(enemies, 1, 65 * 16, player.cy - 12);
    const b = new Boomerang(player.cx, player.cy - 4, 10, 0, 15, 4, 6);
    run(b, hooks, 400);
    // 最终必须回手消失（dead）且没有飞出世界
    expect(b.dead).toBe(true);
    const enemy = enemies[0] as unknown as { hp: number };
    expect(enemy.hp).toBeLessThan(100); // 途中命中过
  });
});

describe('长矛（aiStyle 19）', () => {
  it('随角色前刺伸缩，一个周期后消失，命中沿途敌人', () => {
    const { hooks, player, enemies } = makeHooks();
    addEnemy(enemies, 2, 55 * 16, 89 * 16);
    // 新签名(dirX, dirY, shootSpeed, dur, dmg, kb, projId)——spd 用 Dark Lance 真值 6
    // 位移=offset×spd,刺满 offset=3+1.4×2×22/3≈23.5 → ~141px,敌在 +80px 处沿途命中
    const s = new SpearProj(1, 0, 6, 22, 30, 5, 46);
    run(s, hooks);
    expect(s.dead).toBe(true); // 一个 useTime 周期结束
    const enemy = enemies[0] as unknown as { hp: number };
    expect(enemy.hp).toBeLessThan(100);
  });
});

describe('回旋镖特例族（AI_003 分支）', () => {
  it('106 光碟:45t 才回收(30t 仍在飞出段)', () => {
    const { hooks, player } = makeHooks();
    const b = new Boomerang(player.cx, player.cy - 4, 16, 0, 60, 4, 106);
    run(b, hooks, 31);
    expect(b.dead).toBe(false);
    // (returning 是私有态,用行为验证:31t 时仍在移动且未死)
    const x31 = b.x;
    run(b, hooks, 5);
    expect(b.dead).toBe(false); // 36t 仍飞行(45t 门)
    void x31;
  });
  it('182 圣骑士锤:800px 内最近敌追踪转向', () => {
    const { hooks, player, enemies } = makeHooks();
    // 敌摆在飞行线上方——纯直线不会经过,追踪才会命中
    addEnemy(enemies, 3, 66 * 16, player.cy - 120);
    const b = new Boomerang(player.cx, player.cy - 4, 12, 0, 80, 4, 182);
    run(b, hooks, 800); // 追踪期最长 360t,之后 30t 无目标回收+回手
    const enemy = enemies[0] as unknown as { hp: number };
    expect(enemy.hp).toBeLessThan(100); // 追踪命中
    expect(b.dead).toBe(true);
  });
  it('383 附魔飞刀:10t 后下垂(vy 增长)', () => {
    const { hooks, player } = makeHooks();
    const b = new Boomerang(player.cx, player.cy - 4, 20, 0, 70, 4, 383);
    run(b, hooks, 9);
    expect(b.vy).toBe(0); // 前 10t 水平直线
    run(b, hooks, 3);
    expect(b.vy).toBeGreaterThan(0.5); // 10t 后垂落
  });
  it('301 Bouncing Shield:按住 20t 回收', () => {
    const { hooks, player } = makeHooks();
    const b = new Boomerang(player.cx, player.cy - 4, 14, 0, 100, 4, 301);
    b.channel = () => true; // 按住
    run(b, hooks, 22);
    expect(b.dead).toBe(false); // 掷出段(回收态不等于 dead)
    run(b, hooks, 300);
    expect(b.dead).toBe(true); // 回收后回手消失
  });
  it('光刃族(1059):前 30t 直线,之后垂落', () => {
    const { hooks, player } = makeHooks();
    const b = new Boomerang(player.cx, player.cy - 4, 14, 0, 26, 4, 1059);
    run(b, hooks, 29);
    expect(b.vy).toBe(0);
    run(b, hooks, 3);
    expect(b.vy).toBeGreaterThan(0); // 30t 后 vy+=1 垂落
  });
});

describe('细剑族（aiStyle 161）', () => {
  it('线性外伸,16t 消失', () => {
    const { hooks, player } = makeHooks();
    const s = new SpearProj(1, 0, 2.4, 20, 13, 4, 938);
    run(s, hooks, 15);
    expect(s.dead).toBe(false);
    // 位移 = spd×(t-1):t=15 → 33.6px
    expect(Math.abs(s.cx - player.cx - 2.4 * 14)).toBeLessThan(1.5);
    run(s, hooks, 2);
    expect(s.dead).toBe(true); // 16t Kill
  });

  it('戳击沿途 CutTiles（Projectile.cs:14151-14155：Center 起 10px 线扫草/瓦罐）', () => {
    const { hooks } = makeHooks();
    let cutCalls = 0;
    (hooks as unknown as { cutTile: () => void }).cutTile = () => { cutCalls++; };
    const s = new SpearProj(1, 0, 2.1, 13, 5, 4, 938);
    run(s, hooks, 16);
    expect(cutCalls).toBe(15);   // 第 1-15t 每帧一次（16t 先判死 return，当帧不再扫）
  });

  it('左刺镜像锚定（AI_161 :44997 spriteDirection=-1；绘制角 Main.cs:32444 −π/4×sd）', () => {
    const { hooks, player } = makeHooks();
    const s = new SpearProj(-1, 0, 2.1, 13, 5, 4, 938);
    run(s, hooks, 10);
    expect(s.dead).toBe(false);
    // 左刺：cx 向左偏移 spd×(t-1)（修复前方向/镜像缺失会让贴图指向错误侧）
    expect(Math.abs(s.cx - player.cx - (-2.1 * 9))).toBeLessThan(1.5);
    expect(Math.abs(s.cy - player.cy)).toBeLessThan(1.5);
    run(s, hooks, 7);
    expect(s.dead).toBe(true); // t=16 消失（useAnimation 13 后仍补足 16t）
  });
});

describe('手雷（aiStyle 16）', () => {
  it('引信到期爆炸（回调触发），弹跳不穿透地面', () => {
    const { hooks } = makeHooks();
    let exploded: Array<[number, number, number]> = [];
    const g = new GrenadeProj(50 * 16, 50 * 16, 3, 0, 60, 180, 28, (x, y, d) => exploded.push([x, y, d]));
    run(g, hooks);
    expect(g.dead).toBe(true);
    expect(exploded.length).toBe(1);
    // 弹跳：不应沉入地面之下（地面顶 y=100*16=1600）
    expect(g.y + g.h).toBeLessThanOrEqual(1600 + 2);
  });
});

describe('悠悠球（aiStyle 99）', () => {
  it('按住滞留追光标；松手回收消失', () => {
    const opts = { channel: true, target: { x: 70 * 16, y: 85 * 16 } };
    const { hooks, player } = makeHooks(opts);
    let ch = true;
    const y = new YoyoProj(player.cx, player.cy - 4, 20, 4, 547, 300,
      () => ch, () => opts.target);
    run(y, hooks, 120);
    expect(y.dead).toBe(false); // channel 中不消失
    // 朝光标靠近
    expect(Math.abs(y.cx - opts.target.x)).toBeLessThan(60);
    ch = false; // 松手
    run(y, hooks, 300);
    expect(y.dead).toBe(true); // 回收
  });
});


describe('链球特例子子弹(AI_015 尾段)', () => {
  it('247 Flairon:飞行中周期自机弹 248(20t 节奏,600px 内最近敌)', () => {
    const { hooks, player, enemies } = makeHooks();
    addEnemy(enemies, 60, player.cx + 100, player.cy);
    const spawned: Array<{ id: number; d: number }> = [];
    const f = new FlailProj(player.cx, player.cy - 4, 65, 4, 247,
      () => true, () => ({ x: player.cx + 300, y: player.cy })); // channel=按住(旋转态)
    f.spawnProj = (_x, _y, _vx, _vy, projId, dmg) => spawned.push({ id: projId, d: dmg });
    run(f, hooks, 45);
    expect(spawned.length).toBeGreaterThanOrEqual(2); // 20t+40t 两轮
    expect(spawned[0].id).toBe(248);
    expect(spawned[0].d).toBe(Math.round(65 / 1.5));
  });

  it('1058:旋转态周期轨道刺 405(朝玩家反向)', () => {
    const { hooks, player } = makeHooks();
    const spawned: number[] = [];
    const f = new FlailProj(player.cx, player.cy - 4, 66, 4, 1058,
      () => true, () => ({ x: player.cx + 300, y: player.cy }));
    f.spawnProj = (_x, _y, _vx, _vy, projId) => spawned.push(projId);
    run(f, hooks, 20);
    expect(spawned.length).toBeGreaterThanOrEqual(3); // 3-6t 节奏
    for (const id of spawned) expect(id).toBe(405);
  });
});


describe('弗莱龙刺 405(aiStyle 70 全语义)', () => {
  it('ai0=-10 漂入段:10t 内减速+α衰减,不追踪', () => {
    const { hooks, player } = makeHooks();
    const sp = new FlaironSpike(player.cx + 50, player.cy, 8, 0, 60, 4);
    const v0 = Math.hypot(sp.vx, sp.vy);
    run(sp, hooks, 10);
    expect(Math.hypot(sp.vx, sp.vy)).toBeLessThan(v0);   // vel×0.95/t 减速
    expect(sp.dead).toBe(false);
  });

  it('漂入结束(ai0 到 0)→ 650 内寻敌并转向', () => {
    const { hooks, player, enemies } = makeHooks();
    addEnemy(enemies, 70, player.cx + 200, player.cy);
    const sp = new FlaironSpike(player.cx, player.cy, 0, -5, 60, 4);
    run(sp, hooks, 12); // 10t 漂入 + 2t(第 11 tick ai0==0 寻敌)
    expect(sp.vx).toBeGreaterThan(0);                    // 朝敌转向(vx<0 起步被拉正)
  });

  it('timeLeft 120 到期消失;无目标不爆尘存活至漂尽', () => {
    const { hooks, player } = makeHooks();
    const sp = new FlaironSpike(player.cx, player.cy, 2, 0, 60, 4);
    run(sp, hooks, 130);
    expect(sp.dead).toBe(true);
  });
});
