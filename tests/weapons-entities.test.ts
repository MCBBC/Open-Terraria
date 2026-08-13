// 数据驱动武器实体行为模拟测试（Boomerang/SpearProj/GrenadeProj/YoyoProj）
// 用最小 mock GameHooks 直接跑 fixedUpdate，验证 aiStyle 家族行为主干
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Boomerang, SpearProj, YoyoProj, GrenadeProj, FlailProj, FlaironSpike, spearDrawAngle, YOYO_RANGE, YOYO_LIFE } from '../src/entities/WeaponProj';
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

describe('长矛绘制角（DrawProj_Spear Main.cs:34659-34668,2026-08-13 终审）', () => {
  /** 贴图尖端原始方向角 β=5π/4（矛头朝左下斜置,由原版公式反推）;mirror 时
   *  尖端角 = (π-β)+ang,否则 = β+ang——两向都应指向运动方向 φ。 */
  const TIP = 5 * Math.PI / 4;
  const tipOf = (d: { ang: number; mirror: boolean }) =>
    ((d.mirror ? Math.PI - TIP : TIP) + d.ang) % (2 * Math.PI);

  it('AI_019:右刺 θ=φ+π/4+镜像;左刺 θ=φ+3π/4 无镜像——矛头均指运动方向', () => {
    // 右刺（:34664-34668 theOwner.direction>0 → FlipHorizontally 且 num-=π/2）
    // θ = 0+2.355-π/2 = 0.784（原版字面量 2.355f,比 π/4 小 0.0012）
    const right = spearDrawAngle(1, 0, false);
    expect(right.ang).toBeCloseTo(2.355 - Math.PI / 2, 5);
    expect(right.mirror).toBe(true);
    // 左刺
    const left = spearDrawAngle(-1, 0, false);
    expect(left.ang).toBeCloseTo(Math.PI + 2.355, 5);
    expect(left.mirror).toBe(false);
    // 尖端指向:右刺→0(正右)/左刺→π(正左)。修复前左刺尖端=π/2(正下,偏 90°)。
    // 精度 2 位 = 原版 2.355f 字面量自带 0.0012rad 近似差,非实现误差
    expect(tipOf(right)).toBeCloseTo(0, 2);
    expect(tipOf(left)).toBeCloseTo(Math.PI, 2);
  });

  it('AI_019 斜刺四向尖端均指运动方向（翻转陷阱回归网）', () => {
    // 原版 :34659 用字面量 2.355f 而非 3π/4=2.35619（原版自带 0.0012rad≈0.068°
    // 近似差,实现按源码保留字面量）——尖端指向断言容差须 ≥ 该差
    for (const [dx, dy, phi] of [[0, 1, Math.PI / 2], [0, -1, -Math.PI / 2], [1, 1, Math.PI / 4], [-1, -1, -3 * Math.PI / 4]] as const) {
      const d = spearDrawAngle(dx, dy, false);
      const tip = tipOf(d);
      const norm = ((tip % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const want = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      expect(Math.min(Math.abs(norm - want), 2 * Math.PI - Math.abs(norm - want))).toBeLessThan(0.0015);
    }
  });

  it('AI_161 细剑:右刺 θ=π/2-π/4 无镜像;左刺 θ=φ+π/2+π/4 镜像（:44990/:32444/:29827）', () => {
    expect(spearDrawAngle(1, 0, true)).toEqual({ ang: Math.PI / 4, mirror: false });
    expect(spearDrawAngle(-1, 0, true).ang).toBeCloseTo(Math.PI + 3 * Math.PI / 4, 5);
    expect(spearDrawAngle(-1, 0, true).mirror).toBe(true);
  });
});

describe('长矛伸缩包络数值（GetSpearOffsetRelativeToPlayer :43417-43540）', () => {
  it('46 型号峰值 offset=num6+num7×(max-num3)=3+1.4×15 → 位移 24×spd', () => {
    const { hooks, player } = makeHooks();
    const s = new SpearProj(1, 0, 6, 22, 30, 5, 46);
    let peak = 0;
    for (let i = 0; i < 22 && !s.dead; i++) {
      s.fixedUpdate(1 / 60, hooks);
      peak = Math.max(peak, s.cx - player.cx);
    }
    expect(s.dead).toBe(true);
    // 峰值 = 24 × spd 6 = 144px（itemAnim=7=num3 时 num9=15、num10=0）
    expect(peak).toBeCloseTo(144, 0);
    expect(peak).toBeGreaterThan(140);
  });

  it('49 型号（木矛 vi_280,spd 3.7/prm[4,0.85,1.1]/dur 31）刺满 ≈80.8px——探针断言同值', () => {
    const { hooks, player } = makeHooks();
    const s = new SpearProj(1, 0, 3.7, 31, 8, 6.5, 49);
    expect(s.w).toBe(18);            // SetDefaults 18×18（Projectile.cs:1051-1054 型号 47 同款）
    let peak = 0;
    for (let i = 0; i < 31 && !s.dead; i++) {
      s.fixedUpdate(1 / 60, hooks);
      peak = Math.max(peak, s.cx - player.cx);
    }
    expect(s.dead).toBe(true);
    // 峰值 offset=4+0.85×(31-10)=21.85 → ×3.7 = 80.85px
    expect(peak).toBeCloseTo(80.85, 0);
    expect(Math.abs(peak - 80)).toBeLessThan(3);
  });

  it('命中盒型号表（SetDefaults 逐 type）:46=20/130=22/342=22×2 薄刃/877-879=25,缺省 18', () => {
    const { hooks } = makeHooks();
    for (const [id, w, h] of [[46, 20, 20], [130, 22, 22], [342, 22, 2], [877, 25, 25], [879, 25, 25], [49, 18, 18], [105, 18, 18]] as const) {
      const s = new SpearProj(1, 0, 6, 22, 30, 5, id);
      expect([s.projId, s.w, s.h]).toEqual([id, w, h]);
    }
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

  it('寿命表:无限寿命型号（Sets 缺省 -1）无 tick 上限;有限型号 7200 防泄漏', () => {
    const { hooks, player } = makeHooks();
    const inf = new YoyoProj(player.cx, player.cy, 20, 4, 547, 0, () => true, () => ({ x: player.cx, y: player.cy }));
    expect(YOYO_LIFE[547]).toBeUndefined(); // 547 不在寿命表 → 缺省 -1（ProjectileID.cs:185）
    expect(inf.life).toBe(Number.POSITIVE_INFINITY); // 原版 timeLeft=6 每帧刷新（:64942）,无限滞留
    const fin = new YoyoProj(player.cx, player.cy, 20, 4, 534, 0, () => true, () => ({ x: player.cx, y: player.cy }));
    expect(YOYO_LIFE[534]).toBe(9);
    expect(fin.life).toBe(7200);
  });

  it('击退方向=球相对玩家 X（ChangeDir 段 :64925-64935,±2 死区;非 sign(vx)）', () => {
    const { hooks, player } = makeHooks();
    let target = { x: player.cx + 300, y: player.cy };
    const y = new YoyoProj(player.cx, player.cy - 4, 20, 4, 547, 0,
      () => true, () => target);
    run(y, hooks, 90);
    expect(y.cx).toBeGreaterThan(player.cx + 2); // 球已飞到右侧
    expect((y as unknown as { dir: number }).dir).toBe(1);
    target = { x: player.cx - 300, y: player.cy };
    run(y, hooks, 200);
    expect(y.cx).toBeLessThan(player.cx - 2);    // 拉回左侧
    expect((y as unknown as { dir: number }).dir).toBe(-1);
  });

  it('目标点双重钳制:光标超射程 → 钳 range,目标变化再钳 range-1（:65002-65050）', () => {
    const { hooks, player } = makeHooks();
    // 547 射程 280（ProjectileID.cs:187）;光标放到 1000px 外
    const y = new YoyoProj(player.cx, player.cy, 20, 4, 547, 0,
      () => true, () => ({ x: player.cx + 1000, y: player.cy }));
    y.fixedUpdate(1 / 60, hooks);
    const ai = y as unknown as { ai0: number; ai1: number };
    const d = Math.hypot(ai.ai0 - player.cx, ai.ai1 - player.cy);
    expect(YOYO_RANGE[547]).toBe(280);
    expect(d).toBeLessThanOrEqual(279.5); // 第二重 range-1=279 生效
    expect(d).toBeGreaterThan(278);       // 且没有被钳得更短
  });

  it('1.3× 超程强制回收（flag4 :65059-65063）→ 回收态消失', () => {
    const { hooks, player } = makeHooks();
    const y = new YoyoProj(player.cx, player.cy, 20, 4, 547, 0,
      () => true, () => ({ x: player.cx, y: player.cy }));
    run(y, hooks, 5);
    // 手工挪出 280×1.3=364px 之外（模拟被地形/速度甩出射程）
    y.x = player.cx + 500;
    y.y = player.cy - 8;
    run(y, hooks, 10);
    expect((y as unknown as { recalled: boolean }).recalled).toBe(true);
    run(y, hooks, 300);
    expect(y.dead).toBe(true);
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

describe('链球 GAP#8 细节补齐（AI_015 回源终审,2026-08-13）', () => {
  /** 录音版 hooks:粒子/定向爆发/音效计数(撞墙冲击波断言用) */
  function makeRecorded() {
    const base = makeHooks();
    const rec = { particles: 0, bursts: 0, sfx: [] as string[] };
    base.hooks.spawnParticles = () => { rec.particles++; };
    base.hooks.spawnBurst = () => { rec.bursts++; };
    base.hooks.playSfx = (name: string) => { rec.sfx.push(name); };
    return { ...base, rec };
  }

  it('① ChangeDir:旋转态朝鼠标侧转面(:41203-41210,channel 判定之前)', () => {
    const { hooks, player } = makeHooks();
    let target = { x: player.cx + 300, y: player.cy };
    const f = new FlailProj(player.cx, player.cy - 4, 65, 4, 25, () => true, () => target);
    run(f, hooks, 3);
    expect(player.facing).toBe(1);   // 鼠标在右 → ChangeDir(1)
    expect(f.aiState).toBe(0);       // 仍在旋转态
    target = { x: player.cx - 300, y: player.cy };
    run(f, hooks, 3);
    expect(player.facing).toBe(-1);  // 鼠标在左 → ChangeDir(-1)
  });

  it('① ChangeDir:掷出态每 tick 面朝球(:41261)', () => {
    const { hooks, player } = makeHooks();
    let ch = true;
    const f = new FlailProj(player.cx, player.cy - 4, 65, 4, 25, () => ch,
      () => ({ x: player.cx + 300, y: player.cy }));
    run(f, hooks, 3);
    ch = false;                       // 松手朝右掷出
    run(f, hooks, 3);
    expect(f.cx).toBeGreaterThan(player.cx + 30); // 球已飞到右侧
    player.facing = -1;               // 人为掰向左——验证状态机每 tick 拉回
    run(f, hooks, 1);
    expect(player.facing).toBe(1);    // player.Center.X < proj.Center.X → 1
  });

  it('② 757 超时过渡【当场】掷气泡 928(速度=throw×0.3×1.3,伤害/击退满额 :41251-41259)', () => {
    const { hooks, player } = makeHooks();
    let ch = true;
    const spawned: Array<{ id: number; v: number; dmg: number; kb: number }> = [];
    const f = new FlailProj(player.cx, player.cy - 4, 60, 5, 757, () => ch,
      () => ({ x: player.cx + 300, y: player.cy }));
    f.spawnProj = (_x, _y, vx, vy, projId, dmg, kb) => spawned.push({ id: projId, v: Math.hypot(vx, vy), dmg, kb });
    run(f, hooks, 2);
    ch = false;                       // 掷出(throwSpeed 22,flightTicks 13)
    run(f, hooks, 13);                // 掷出 tick + 12 计数 = stT 12 < 13
    expect(spawned.length).toBe(0);
    run(f, hooks, 1);                 // 第 13 计数 → 回拉 + 气泡
    expect(spawned.length).toBe(1);
    expect(spawned[0].id).toBe(928);
    expect(spawned[0].v).toBeCloseTo(22 * 0.3 * 1.3, 1); // 8.58
    expect(spawned[0].dmg).toBe(60);  // damage 满额
    expect(spawned[0].kb).toBe(5);    // knockBack 满额
  });

  it('② 757 再按过渡掷气泡(×0.2×1.3)且目标态=6 非 3(:41236-41247;case 3 无入口)', () => {
    const { hooks, player } = makeHooks();
    let ch = true;
    const spawned: Array<{ id: number; vx: number }> = [];
    const f = new FlailProj(player.cx, player.cy - 4, 60, 5, 757, () => ch,
      () => ({ x: player.cx + 300, y: player.cy }));
    f.spawnProj = (_x, _y, vx, _vy, projId) => spawned.push({ id: projId, vx });
    run(f, hooks, 2);
    ch = false;
    run(f, hooks, 3);                 // 飞行 3t(未超时)
    ch = true;                        // 再按
    run(f, hooks, 1);
    expect(spawned.length).toBe(1);
    expect(spawned[0].id).toBe(928);
    expect(spawned[0].vx).toBeCloseTo(22 * 0.2 * 1.3, 1); // 5.72
    expect(f.aiState).toBe(6);        // 垂地悬荡——1456 的 case 3 是死状态
  });

  it('② 247 首枚花瓣恰在第 20t(localAI[0]≥20 :41451-41455);命中归零后仍 20t', () => {
    const { hooks, player, enemies } = makeHooks();
    addEnemy(enemies, 60, player.cx + 300, player.cy); // 600 搜索半径内、轨道(40)外
    const spawned: number[] = [];
    const f = new FlailProj(player.cx, player.cy - 4, 65, 4, 247, () => true,
      () => ({ x: player.cx + 300, y: player.cy }));
    f.spawnProj = (_x, _y, _vx, _vy, projId) => spawned.push(projId);
    run(f, hooks, 19);
    expect(spawned.length).toBe(0);   // 前 19t 计数未满
    run(f, hooks, 1);
    expect(spawned.length).toBe(1);   // 第 20t 首掷
    run(f, hooks, 19);
    expect(spawned.length).toBe(1);   // 命中后 localAI[0]=0 重新累计
    run(f, hooks, 1);
    expect(spawned.length).toBe(2);
  });

  it('② 1058 旋转态 3-5t 首掷 405:方向朝玩家反向±π/4,速 4.5-6.5,伤满额/kb×0.5(:41417-41463)', () => {
    const { hooks, player } = makeHooks();
    const spawned: Array<{ x: number; y: number; vx: number; vy: number; id: number; dmg: number; kb: number }> = [];
    const f = new FlailProj(player.cx, player.cy - 4, 66, 4, 1058, () => true,
      () => ({ x: player.cx + 300, y: player.cy }));
    f.spawnProj = (x, y, vx, vy, projId, dmg, kb) => spawned.push({ x, y, vx, vy, id: projId, dmg, kb });
    let first = -1;
    for (let i = 0; i < 8 && first < 0; i++) {
      f.fixedUpdate(1 / 60, hooks);
      if (spawned.length) first = i + 1;
    }
    expect(first).toBeGreaterThanOrEqual(3); // Next(3,6)
    expect(first).toBeLessThanOrEqual(5);
    const s = spawned[0];
    expect(s.id).toBe(405);
    expect(s.dmg).toBe(66);                  // damage 满额(:41431)
    expect(s.kb).toBeCloseTo(4 * 0.5, 6);    // 旋转态 num26=kb×0.5(:41420-41422)
    // v = normalize(ball-player)×Next(45,65)/10 再 ±π/4(:41457-41460)
    let dev = Math.abs(Math.atan2(s.vy, s.vx) - Math.atan2(s.y - player.cy, s.x - player.cx));
    if (dev > Math.PI) dev = 2 * Math.PI - dev;
    expect(dev).toBeLessThanOrEqual(Math.PI / 4 + 1e-6);
    expect(Math.hypot(s.vx, s.vy)).toBeGreaterThanOrEqual(4.5);
    expect(Math.hypot(s.vx, s.vy)).toBeLessThanOrEqual(6.5);
  });

  it('③ 948 火焰重锤入水变 947(:41069-41071);岩浆豁免(lavaWet,:15456-15459)', () => {
    const { hooks, player } = makeHooks();
    const store = (hooks.world as { store: TileStore }).store;
    const mk = () => new FlailProj(player.cx, player.cy - 4, 30, 4, 948, () => true,
      () => ({ x: player.cx + 10, y: player.cy }));
    const f = mk();
    f.fixedUpdate(1 / 60, hooks);
    expect(f.projId).toBe(948);       // 干燥不变
    store.setLiquid(Math.floor(f.cx / 16), Math.floor(f.cy / 16), 255, 1); // 水
    f.fixedUpdate(1 / 60, hooks);
    expect(f.projId).toBe(947);       // wet && !lavaWet → 变型
    const f2 = mk();
    f2.fixedUpdate(1 / 60, hooks);
    store.setLiquid(Math.floor(f2.cx / 16), Math.floor(f2.cy / 16), 255, 2); // 岩浆
    f2.fixedUpdate(1 / 60, hooks);
    expect(f2.projId).toBe(948);      // lavaWet 豁免
  });

  it('④ 掷出撞墙:坠落态+挖掘音一响+冲击波+位移回卷(:41027-41045)', () => {
    const { hooks, player, rec } = makeRecorded();
    const store = (hooks.world as { store: TileStore }).store;
    for (let y = 80; y < 100; y++) store.setTile(56, y, 1); // 竖墙(左缘 x=896)
    let ch = true;
    const f = new FlailProj(player.cx, player.cy - 4, 60, 4, 25, () => ch,
      () => ({ x: player.cx + 300, y: player.cy }));
    run(f, hooks, 2);
    ch = false;                       // 朝右掷出(throwSpeed 14)
    let hitTick = -1, xBefore = 0;
    for (let i = 0; i < 12 && hitTick < 0; i++) {
      xBefore = f.x;
      f.fixedUpdate(1 / 60, hooks);
      if (f.aiState === 5) hitTick = i;
    }
    expect(hitTick).toBeGreaterThanOrEqual(0);          // 撞墙 → 坠落态(:41028)
    expect(f.x).toBeCloseTo(xBefore - 14, 5);           // position -= vector(:41035)
    expect(rec.sfx.filter((s) => s === 'dig').length).toBe(1); // SoundID 0 一响(num2 档收拢)
    expect(rec.bursts).toBeGreaterThanOrEqual(1);       // CreateImpactExplosion2 冲击波环
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
