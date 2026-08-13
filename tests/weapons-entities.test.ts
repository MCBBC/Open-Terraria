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
  it('飞出无摩擦直线 → 30t 计数门回收 → 回手消失，途中可命中', () => {
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
  it('106 光碟:回收点=30（独立 45 门是影子死代码,:36794-36799 被 :37082-37087 截住）', () => {
    // ★源码修正:1456 中 106 的独立 ai[1]≥45 门位于类型链【之前】,而链尾
    //   else if(ai[1]≥30)（:37082-37087）未豁免 106 → ai[1] 到 30 即回收,
    //   45 门永不可达。旧断言名"45t 才回收"是把死代码当活门
    const { hooks, player } = makeHooks();
    const b = new Boomerang(player.cx, player.cy - 4, 16, 0, 60, 4, 106);
    run(b, hooks, 29);
    expect(b.returning).toBe(false); // 29 < 30 仍在飞出段
    run(b, hooks, 2);
    expect(b.returning).toBe(true);  // 31t = ai[1]≥30 → 回收
    run(b, hooks, 300);
    expect(b.dead).toBe(true);       // 返回段回手消失
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
  it('301 Bouncing Shield:按住 ≥20 AI 次回收+速度归零;松手 ≥100 AI 次', () => {
    // ★源码修正(SetDefaults extraUpdates=2,Projectile.cs:3651):AI 每 tick 跑 3 次,
    //   ai[1] 按 AI 次计数——按住门 20 次=7t、松手门 100 次=34t(旧断言 22t 未死是
    //   无 extraUpdates 近似下的错标)
    const { hooks, player } = makeHooks();
    const b = new Boomerang(player.cx, player.cy - 4, 14, 0, 100, 4, 301);
    b.channel = () => true; // 按住
    let gateTick = -1;
    for (let i = 0; i < 12 && gateTick < 0; i++) {
      b.fixedUpdate(1 / 60, hooks);
      if (b.returning) gateTick = i;
    }
    expect(gateTick).toBe(6); // 第 7 tick = 21 AI 次 ≥ 20（:37062-37070）
    // 回收瞬间速度归零（:37070）——同 tick 剩余返回步进最多再加一档 acc=3
    expect(Math.hypot(b.vx, b.vy)).toBeLessThan(5);
    run(b, hooks, 300);
    expect(b.dead).toBe(true); // 回收后回手消失
    // 松手门 100 AI 次 = 34t（:37074-37080）
    const b2 = new Boomerang(player.cx, player.cy - 4, 14, 0, 100, 4, 301);
    b2.channel = () => false;
    run(b2, hooks, 33);
    expect(b2.returning).toBe(false); // 33t = 99 次 < 100
    run(b2, hooks, 2);
    expect(b2.returning).toBe(true); // 35t = 105 次 ≥ 100
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

describe('AI_003 回收门三处独立（2026-08-13 1:1 补齐）', () => {
  /** 竖墙:tile 列 x=wallTx,y∈[80,100) 实心(命中盒带 tile 扫描,与 FlailProj 同式) */
  function addWall(hooks: GameHooks, wallTx: number): void {
    const store = (hooks.world as { store: TileStore }).store;
    for (let y = 80; y < 100; y++) store.setTile(wallTx, y, 1);
  }
  /** 逐 tick 跑到谓词首次为真,返回 tick 数(上限内未命中返回 -1) */
  function runUntil(e: { fixedUpdate: (dt: number, g: GameHooks) => void; dead?: boolean },
    g: GameHooks, pred: () => boolean, max = 60): number {
    for (let i = 0; i < max && !e.dead; i++) { e.fixedUpdate(1 / 60, g); if (pred()) return i; }
    return -1;
  }

  it('命中敌回收门（Projectile.Damage :12278-12291）:出程命中即速度反转+进返回段', () => {
    const { hooks, player, enemies } = makeHooks();
    addEnemy(enemies, 10, 57 * 16, player.cy - 12); // ~102px,30t 计数门前命中
    const b = new Boomerang(player.cx, player.cy - 4, 10, 0, 15, 4, 6);
    const t = runUntil(b, hooks, () => b.returning, 20);
    expect(t).toBeGreaterThanOrEqual(0); // 命中触发(非等 30t 计数门)
    expect(b.vx).toBeLessThan(0);        // 速度反转(:12286-12287)
    const enemy = enemies[0] as unknown as { hp: number };
    expect(enemy.hp).toBeLessThan(100);
    run(b, hooks, 300);
    expect(b.dead).toBe(true);
  });

  it('撞墙反弹族 33/106/866（:18142-18151）:分轴反弹不回收', () => {
    const { hooks, player } = makeHooks();
    addWall(hooks, 56);
    const b = new Boomerang(player.cx, player.cy - 4, 14, 0, 25, 4, 33);
    run(b, hooks, 12); // 第 4t 撞墙(右缘过 x=896)
    expect(b.returning).toBe(false); // 荆棘轮撞墙不回收
    expect(b.vx).toBeLessThan(0);    // 命中轴速度取反续飞
    run(b, hooks, 300);              // 之后由 30t 计数门回收
    expect(b.dead).toBe(true);
  });

  it('缺省族撞墙（:18152-18160）:回收 + 速度=-lastVelocity;383 豁免取反', () => {
    const { hooks, player } = makeHooks();
    addWall(hooks, 56);
    const b = new Boomerang(player.cx, player.cy - 4, 10, 0, 15, 4, 6);
    expect(runUntil(b, hooks, () => b.returning, 20)).toBeGreaterThanOrEqual(0);
    expect(b.vx).toBeLessThan(0); // 反弹向回飞
    run(b, hooks, 300);
    expect(b.dead).toBe(true);
    // 383:同样进返回段但速度不取反(:18156 type != 383 门)
    const b2 = new Boomerang(player.cx, player.cy - 4, 20, 0, 70, 4, 383);
    const t2 = runUntil(b2, hooks, () => b2.returning, 20);
    expect(t2).toBeGreaterThanOrEqual(0);
    expect(b2.vx).toBeGreaterThan(0); // 仍朝墙方向(未被反转)
  });

  it('光刃撞墙 → 悬停态 ai[0]=2（:17975-17990/:37089-37109）:vx 清零、不回收', () => {
    const { hooks, player } = makeHooks();
    addWall(hooks, 56);
    const b = new Boomerang(player.cx, player.cy - 4, 14, 0, 26, 4, 1059);
    const t = runUntil(b, hooks, () => b.vx === 0 && !b.returning && b.vy > 0, 30);
    expect(t).toBeGreaterThanOrEqual(0); // 悬停:vx=0、vy+=1,且未进返回段
  });

  it('866 无目标 ≥30 AI 次回收（:37009-37017）——计数在 localAI[0] 非 ai[1]（extra=1→15t）', () => {
    const { hooks, player } = makeHooks();
    const b = new Boomerang(player.cx, player.cy - 4, 10, 0, 80, 4, 866);
    run(b, hooks, 14);
    expect(b.returning).toBe(false); // 14t = 28 AI 次 < 30
    run(b, hooks, 2);
    expect(b.returning).toBe(true); // 16t = 32 AI 次 ≥ 30
    run(b, hooks, 300);
    expect(b.dead).toBe(true);
  });

  it('866 命中敌不触发回收（Damage :12278 豁免列）——追踪续飞', () => {
    const { hooks, player, enemies } = makeHooks();
    addEnemy(enemies, 300, 56 * 16, player.cy - 12);
    const b = new Boomerang(player.cx, player.cy - 4, 10, 0, 80, 4, 866);
    run(b, hooks, 12); // ~80px 外,第 6-8t 命中
    expect((enemies[0] as unknown as { hp: number }).hp).toBeLessThan(100); // 已命中
    expect(b.returning).toBe(false); // 但不因命中回收（目标仍在追踪窗内续飞）
  });

  it('penetrate 链（:13175-13182/:15866-15868）:182 第 10 次命中消亡;866 五击后伤害归零不消失', () => {
    // 同点叠 10 敌:一次重叠内逐敌结算 → penetrate 递减到 0
    const { hooks, player, enemies } = makeHooks();
    for (let i = 0; i < 10; i++) addEnemy(enemies, 100 + i, 56 * 16, player.cy - 12);
    const b = new Boomerang(player.cx, player.cy - 4, 12, 0, 80, 4, 182);
    run(b, hooks, 60);
    expect(b.dead).toBe(true); // penetrate=10 耗尽 → Kill
    const hurtCount = enemies.filter((e) => (e as unknown as { hp: number }).hp < 100).length;
    expect(hurtCount).toBe(10); // 第 10 次命中仍然结算(Damage 先 hurt 后 Kill)
    // 866（:13124-13137):penetrate=5,耗尽时复位 1 + damage=0,不消失
    const enemies2: Array<Record<string, unknown>> = [];
    const hooks2 = { ...hooks, enemies: () => enemies2 } as GameHooks;
    for (let i = 0; i < 6; i++) addEnemy(enemies2, 200 + i, 56 * 16, player.cy - 12);
    const b2 = new Boomerang(player.cx, player.cy - 4, 10, 0, 80, 4, 866);
    run(b2, hooks2, 60);
    expect(b2.dead).toBe(false);            // 866 不因穿透耗尽消失
    expect(b2.damage).toBe(0);              // 五击后伤害归零
    expect(events_track.filter((id) => id >= 200).length).toBeGreaterThanOrEqual(6);
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
