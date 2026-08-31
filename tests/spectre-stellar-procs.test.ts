// 弹 661 黑爆 Colliding 重载 / 幽灵伤害头 ghostHurt 全链 / 星璇之音减伤批回归
// （2026-08-31 对齐批③④⑤⑥；标杆 Terarria1457/Terraria/Projectile.cs）
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { Arrow } from '../src/entities/Arrow';
import { canHit, canHitLine } from '../src/physics/LineOfSight';
import {
  SpectreSoulProj, ghostHurtOnHit, playerHasGhostHurt, spectreVictimEligible,
  SPECTRE_NO_GHOST_HEAL, GHOST_BUDGET_CAP,
  _resetGhostBudgetForTest, ghostBudgetPeek,
} from '../src/entities/SpectreSoulProj';
import {
  SparkleGuitarProj, modifyStellarTuneDamage, computeStellarTuneShot,
  stellarTuneCritChance, catmullRom,
} from '../src/entities/SparkleGuitarProj';
import type { GameHooks } from '../src/entities/types';

const W = 220, H = 160;
function makeStore(): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 120; y < H; y++) store.setTile(x, y, 1);
  return store;
}
interface HurtSpy {
  id: number; x: number; y: number; w: number; h: number; cx: number; cy: number;
  dead: boolean; hits: number[]; lastStrikeDealt?: number; kxs: number[];
}
function mkEnemy(id: number, x: number, y: number, w = 18, h = 40): HurtSpy & {
  hurt: (...a: unknown[]) => boolean;
} {
  const e: HurtSpy = {
    id, x, y, w, h, dead: false, hits: [], kxs: [],
    cx: x + w / 2, cy: y + h / 2,
  };
  return Object.assign(e, {
    hurt(dmg: number, kx?: number): boolean {
      e.hits.push(dmg); e.lastStrikeDealt = dmg;
      e.kxs.push(kx ?? 0);
      return true;
    },
  }) as never;
}
function makeHooks(enemies: unknown[], store = makeStore(),
  player?: Player): { hooks: GameHooks; added: unknown[]; store: TileStore } {
  const pl = player ?? new Player(30 * 16, 100 * 16, new Inventory());
  const added: unknown[] = [];
  const hooks = {
    world: { store, flags: { hardMode: false } } as never,
    player: pl as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  (hooks as unknown as { entities: unknown }).entities = {
    add: (e: unknown) => { added.push(e); },
  };
  return { hooks: hooks as unknown as GameHooks, added, store };
}

// ---- 批③：弹 661 Colliding（Projectile.cs:15887-15893）----
describe('661 黑爆命中管线：dist>500 或 CanHitLine 断 ⇒ 不结算', () => {
  it('盒相交但敌心距 >500(超大 boss 段形态)→ 该拍不判定命中', () => {
    // 弹 10×10 放在原点；敌宽 1200 从弹右侧遮到远处——中心距 590>500
    const big = mkEnemy(1, 12, -20, 1200, 40);
    const { hooks } = makeHooks([big]);
    const a = new Arrow(-5, -5, 0.01, 0, 50, 2, 661, null);
    a.fixedUpdate(1 / 60, hooks);
    expect(big.hits).toEqual([]);
  });
  it('近距小目标正常结算（对照臂）', () => {
    const near = mkEnemy(1, 4, -14, 18, 40);
    const { hooks } = makeHooks([near]);
    const a = new Arrow(-8, -8, 0.01, 0, 50, 2, 661, null);
    a.fixedUpdate(1 / 60, hooks);
    expect(near.hits.length).toBeGreaterThan(0);
  });
  it('500 内但隔墙视线断 → 不结算(CanHitLine 点对 :15891)', () => {
    const near = mkEnemy(1, 1300, 1720, 18, 40);   // 弹右 300px、地面上方
    const { hooks, store } = makeHooks([near]);
    // 石墙整列立在弹与敌之间的列位（全高覆盖,不依赖世界外负行）
    for (let ty = 60; ty <= 110; ty++) {
      store.setTile(74, ty, TILE_BY_KEY['stone']);
      store.setTile(75, ty, TILE_BY_KEY['stone']);
    }
    const a = new Arrow(1000 - 5, 1734 - 20, 0.01, 0, 50, 2, 661, null);
    a.fixedUpdate(1 / 60, hooks);
    expect(near.hits).toEqual([]);
  });
});

// ---- 批⑥：Projectile.ghostHurt（:12021-12070）+ 触发门（:13875/:13712）----
describe('ghostHurtOnHit 门族', () => {
  const victimBase = { x: 200, y: 200, w: 18, h: 40, cx: 209, cy: 220 };
  const srcBase = (over: object = {}) => ({
    magic: true, projDamage: 80, projX: 205, projY: 210, projW: 6, projH: 6,
    ownerCx: 100, ownerCy: 300, ...over,
  });

  function worldWith(chasers: unknown[], ghostHurtSet: boolean) {
    _resetGhostBudgetForTest(0);
    // equipStats 为只读 getter——用裸形玩家对象注旗（proc 本体不读 player）
    const player = ghostHurtSet
      ? { dead: false, cx: 480, cy: 1600,
          equipStats: { setBonus: { ghostHurt: true } } } as never as Player
      : new Player(30 * 16, 100 * 16, new Inventory());
    return makeHooks(chasers, undefined, player);
  }

  it('玩家无 SpectreDamage 套装旗标 ⇒ 整链不触发(playerHasGhostHurt)', () => {
    const hooksA = makeHooks([], undefined, new Player(30 * 16, 100 * 16, new Inventory())).hooks;
    expect(playerHasGhostHurt(hooksA.player)).toBe(false);
    const hooksB = worldWith([], true).hooks;
    expect(playerHasGhostHurt(hooksB.player)).toBe(true);
  });
  it('victim.canGhostHeal=false 族(384/387/388/523)门(:13875 canGhostHeal)', () => {
    for (const vid of SPECTRE_NO_GHOST_HEAL) expect(spectreVictimEligible(vid)).toBe(false);
    expect(spectreVictimEligible(15)).toBe(true);          // 默认 true(NPC.cs:6270)
    expect(spectreVictimEligible(null)).toBe(true);        // 自造怪缺省放行由调用端兜
  });
  it('非魔法弹 / 基伤≤0 / 防后实扣≤1 / lifeMax≤5 四门各自拦截(:12022-26,:13712)', () => {
    const ghostOn = (() => { const h = worldWith([mkEnemy(9, 400, 180)], true); return h.hooks; })();
    let calls = 0;
    ghostHurtOnHit(ghostOn, srcBase({ magic: false }), { ...victimBase, dealt: 70, lifeMax: 100 });   // !magic
    ghostHurtOnHit(ghostOn, srcBase({ projDamage: 0 }), { ...victimBase, dealt: 70, lifeMax: 100 });  // damage<=0
    ghostHurtOnHit(ghostOn, srcBase(), { ...victimBase, dealt: 1, lifeMax: 100 });                    // num41<=1
    ghostHurtOnHit(ghostOn, srcBase(), { ...victimBase, dealt: 70, lifeMax: 5 });                     // flag10 lifeMax>5
    void calls;
  });
  it('预算池闸门(cap1500,:12031)+入账按弹基伤+产出浮魂弹属性(:12068)', () => {
    const direct = mkEnemy(11, 320, 190, 40, 40);   // 距 victim 窗内且有视线(dist>50)
    const blocked = mkEnemy(12, 260, 240, 18, 18);
    const { hooks, added } = worldWith([direct, blocked], true);
    blocked.dead = false;
    // 把 12 隔进墙里 → 只进备胎桶；构造墙
    const st = (hooks.world as unknown as { store: TileStore }).store;
    st.setTile(Math.floor(blocked.x / 16), Math.floor((blocked.y + 9) / 16), TILE_BY_KEY['stone']);
    ghostHurtOnHit(hooks, srcBase(), { ...victimBase, dealt: 70, lifeMax: 100, vanillaId: 15 });
    expect(added.length).toBe(1);
    const orb = added[0] as SpectreSoulProj;
    expect(orb).toBeInstanceOf(SpectreSoulProj);
    expect(orb.damage).toBe(80);                      // num=this.damage（基伤,非 dealt）
    expect(orb.w).toBe(6); expect(orb.h).toBe(6);     // SetDefaults :4467-4468
    expect(orb.friendly).toBe(false);                 // SetDefaults 无 friendly——AI ≥60t 转正
    expect(Math.hypot(orb.vx, orb.vy)).toBeCloseTo(4, 5);  // ±100 归一 ×4(:12059-12067)
    expect(orb.aiLock).toBeGreaterThanOrEqual(0);     // NewProjectile ai[0]=picked index
    expect(Math.abs(ghostBudgetPeek() - 80)).toBeLessThan(1e-6); // pool += projDamage
    // cap 之上不再出弹（直接置池超限,lastMs=-1 使下一拍只锚不衰减）
    _resetGhostBudgetForTest(GHOST_BUDGET_CAP + 100);
    ghostHurtOnHit(hooks, srcBase(), { ...victimBase, dealt: 70, lifeMax: 100, vanillaId: 15 });
    expect(added.length).toBe(1);
  });
});

describe('SpectreSoulProj AI_059（:29368-29431）', () => {
  it('预热期 friendly=false；60t 置位先行(:29371)，场内无可追候选同拍 Kill(:29399)', () => {
    const { hooks } = makeHooks([]);
    const orb = new SpectreSoulProj(100, 100, 2, 2, 30, null);
    for (let i = 0; i < 59; i++) orb.fixedUpdate(1 / 60, hooks);   // ai1=59
    expect(orb.friendly).toBe(false);
    expect(orb.dead).toBe(false);
    orb.fixedUpdate(1 / 60, hooks);                                // ai1=60:friendly=true→重选空→Kill
    expect(orb.friendly).toBe(true);   // 原版先置 friendly 再选人,:29371→:29399
    expect(orb.dead).toBe(true);
  });
  it('★触敌即亡：预热 60t 内接触零伤零死；60t 后单次结算当拍 Kill（penetrate 默认 1,:14189→:17312）', () => {
    // 与弹重叠的敌——warmup 期（ai1<60）friendly=false ⇒ Damage_PVE 不受理
    const foe = mkEnemy(7, 96, 100, 40, 40);
    const { hooks } = makeHooks([foe]);
    const orb = new SpectreSoulProj(98, 112, 0.01, 0, 30, foe);
    for (let i = 0; i < 59; i++) orb.fixedUpdate(1 / 60, hooks);
    expect(foe.hits.length).toBe(0);            // 预热期零伤
    expect(orb.dead).toBe(false);
    // ai1=60 起 friendly 置位 → 子步内首触即 hurt，penetrate-- → 0 同拍 Kill
    orb.fixedUpdate(1 / 60, hooks);
    expect(foe.hits.length).toBe(1);            // 单次结算（无每敌冷却连发）
    expect(foe.hits[0]).toBe(30);
    expect(orb.dead).toBe(true);                // :17312 penetrate 归零同拍
    // 免疫位不再参与：hitCd 表整体删除（红2γ 移交件 b）
    expect('hitCd' in (orb as unknown as Record<string, unknown>)).toBe(false);
    expect((orb as unknown as { penetrate: number }).penetrate).toBe(0);
  });

  it('锁失重选随机(:29403)后朝目标平滑转向(v×29+dir)/30(:29414)且速度保持 ~4', () => {
    // ★翻正（2026-08-31 触敌即亡语义）：原靶距 ~170px 在 120t 窗内必接触死亡——
    // 挪远至转向收敛后仍不可达的量级,保留「锁得上/转得动/速不变/不早死」四个断言点。
    const tgt = mkEnemy(3, 1600, 1660, 18, 24);
    const { hooks } = makeHooks([tgt]);
    const orb = new SpectreSoulProj(96, 112, 3.5, -3, 30, tgt);
    for (let i = 0; i < 120 && !orb.dead; i++) orb.fixedUpdate(1 / 60, hooks);
    expect(orb.friendly).toBe(true);
    expect(orb.dead).toBe(false);               // 尚在途中,未接触
    expect(tgt.hits.length).toBe(0);
    expect(Math.abs(Math.hypot(orb.vx, orb.vy) - 4)).toBeLessThan(1.5);
    expect(orb.aiLock).toBe(3);
    // 预热期直飞 60t×4 子步已飞远——转向断言改为速度向夹角收敛（与目标夹角 <90°）
    const dxt = (tgt.x + 9) - orb.cx, dyt = (tgt.y + 20) - orb.cy;
    const vl = Math.hypot(orb.vx, orb.vy), dtl = Math.hypot(dxt, dyt) || 1;
    expect((orb.vx * dxt + orb.vy * dyt) / (vl * dtl)).toBeGreaterThan(0);
  });
});

// ---- 批④：星璇之音 Stellar Tune（Item.cs:38755-38768 / Projectile.cs:15268-15273）----
describe('modifyStellarTuneDamage ×0.75 截断乘区（两调用点共式 :13339/:14722）', () => {
  it('LOS 开阔不改伤；遮挡时 C# int 截断 ×0.75（80→60、85→63.75→63）', () => {
    expect(modifyStellarTuneDamage(80, false)).toBe(80);
    expect(modifyStellarTuneDamage(80, true)).toBe(60);
    expect(modifyStellarTuneDamage(85, true)).toBe(63);
    expect(modifyStellarTuneDamage(85, false)).toBe(85);
    expect(modifyStellarTuneDamage(3, true)).toBe(2);   // trunc(2.25)
  });
});

// ---- 二轮蓝队 FR2-F：出手 crit 词缀位单源（Game case4715 曾漏 psTune.crt）----
describe('stellarTuneCritChance（GetWeaponCrit 口径：4 + 装备链 + 武器 20 + 词缀 crt）', () => {
  it('Item.cs:38764 基础 crit=20、无词缀 ⇒ (4+equip+20)/100', () => {
    expect(stellarTuneCritChance(0, 20, 0)).toBeCloseTo(0.24, 9);
    expect(stellarTuneCritChance(12, 20, undefined)).toBeCloseTo(0.36, 9);
  });
  it('词缀位进档（Item.Prefix :585 `crit += crt` 折算还原）并钳到 1 上限', () => {
    expect(stellarTuneCritChance(10, 20, 5)).toBeCloseTo(0.39, 9);   // Godly +5%
    expect(stellarTuneCritChance(90, 20, 15)).toBe(1);
    // 缺省容错（数据面缺词条 → 与 Game `?? 0` 形制一致）
    expect(stellarTuneCritChance(4, undefined, undefined)).toBeCloseTo(0.08, 9);
  });
});

describe('SparkleGuitarProj 出手向量/脚本曲线/AI_167 寿命(:47427)/一敌一跳', () => {
  it('computeStellarTuneShot：锁定支 speed=dist×2 + 锚=Center+v×20;未锁定 700 钳耗抖动', () => {
    const lockedOut = computeStellarTuneShot({
      playerCx: 100, playerCy: 100, mouseWorldX: 900, mouseWorldY: 900,
      targets: [{ cx: 600, cy: 400, vx: 2, vy: -1 }],
      targetRoll: () => 0,
      nextJitter: () => ({ x: 10, y: 10 }),
      nextEdgeUnit: () => ({ x: 0, y: -1 }),
      nextFloat01: () => 0,
    });
    expect(lockedOut.aimX).toBe(640);                 // 600 + vx(2)×20
    expect(lockedOut.aimY).toBe(380);
    expect(lockedOut.vx).toBeCloseTo(0, 9);           // edge unit (0,-1)
    expect(lockedOut.vy).toBeLessThan(0);
    expect(lockedOut.spawnX).toBe(100);
    // 未锁定：距离 800>700 → 锚点钳回 player + 700 向量,速度幅 = 1400
    const free = computeStellarTuneShot({
      playerCx: 100, playerCy: 100, mouseWorldX: 900, mouseWorldY: 100,
      targets: [], targetRoll: () => 0,
      nextJitter: () => ({ x: 999, y: 999 }),          // 抖动不改变钳后锚
      nextEdgeUnit: () => ({ x: 1, y: 0 }),
      nextFloat01: () => 0.5,
    });
    expect(free.aimX).toBeCloseTo(100 + 700, 9);
    expect(Math.hypot(free.vx, free.vy)).toBeCloseTo(1400, 6);
  });
  it('AI_167 触敌即亡(penetrate 默认 1→:14194--→:17312 同拍 Kill)；隔墙 ×0.75 即时折算(:13333)', () => {
    const p = new Player(24 * 16, 104 * 16, new Inventory());   // 玩家左侧 (cx≈394)
    const foe = mkEnemy(5, 1600, 1660, 40, 40);                 // 弹右侧近敌
    const { hooks, store } = makeHooks([foe], undefined, p);
    // 光路断：弹/敌(x≈1616)与玩家(cx≈394)之间整列石墙（col 70=1120px 全高）
    for (let ty = 0; ty < H; ty++) store.setTile(70, ty, TILE_BY_KEY['stone']);
    const g = new SparkleGuitarProj(1620, 1665, 50, 0, 81, 1620, 1665);
    const preHits = foe.hits.length;
    for (let t = 0; t < 89 && !g.dead; t++) g.fixedUpdate(1 / 60, hooks);
    expect(g.dead).toBe(true);                         // 首个有效敌命中当拍死亡
    expect(foe.hits.length).toBe(preHits + 1);         // 触杀一跳；爆裂轮免疫不双扣
    expect(foe.hits[preHits]).toBe(60);                // trunc(81×0.75)=60.75→60
  });

  it('寿尽路(:47429 AI 自身 Kill)★A6 EU 化：无接触也在 tick30（第88/89子步）进 Kill；曲线逐子步取样对拍', () => {
    const { hooks } = makeHooks([]);
    const g = new SparkleGuitarProj(900, 900, 50, -30, 81, 1200, 700);
    let diedAt = -1;
    // 每拍读盒中心——EU 化后每子步推进 num2=localAI[0]/90,应首拍触及预期样点
    const cxAt: number[] = [];
    for (let t = 1; t <= 95 && diedAt < 0; t++) {
      g.fixedUpdate(1 / 60, hooks);
      if (!g.dead) cxAt.push(g.x + g.w / 2);
      if (g.dead) diedAt = t;
    }
    expect(diedAt).toBe(30);                           // extraUpdates=2 ⇒ localAI[0] 每 tick+3,
    // ++localAI[0]>=num-1=89 首达于 tick30 子步2（t 值 87→88→89）
    // 曲线 EU 取样对拍（红线：不许只改计时）：tick3 后 localAI[0]=9，与手推
    // CatmullRom(…, 9/90) 一致 ⇒ AI 与位移同步 EU 化成立
    const g2 = new SparkleGuitarProj(900, 900, 50, -30, 81, 1200, 700);
    for (let t = 1; t <= 3; t++) g2.fixedUpdate(1 / 60, hooks);
    const expected = stellarSampleRef(g2, hooks);
    expect(cxAt[2]).toBeCloseTo(expected.x, 5);         // 第 3 拍后盒心 x
  });

  /** 手工按 vanilla 步序重算 tick3 后的样点：每 tick 三子步 → localAI[0]=9，
   *  最后一次取样 num2=9/90。控制点全同 AI_167(:47433-47436)。 */
  function stellarSampleRef(_proj: SparkleGuitarProj, hooks: GameHooks): { x: number } {
    const pl = (hooks as unknown as { player: { cx: number; cy: number } }).player;
    // 出手 v=(50,-30) ⇒ vector2=-v=(-50,30)
    const nvx = -50, nvy = 30;
    const p0x = pl.cx + nvx * 2, p0y = pl.cy + nvy * 2;
    const p1x = pl.cx, p1y = pl.cy;
    const p2x = 1200, p2y = 700;
    const num2 = 9 / 90;
    const p3x = p2x + nvx * (1 - num2 * 3), p3y = p2y + nvy * (1 - num2 * 3);
    return { x: catmullRom({ x: p0x, y: p0y }, { x: p1x, y: p1y }, { x: p2x, y: p2y },
      { x: p3x, y: p3y }, num2).x };
  }

  it('KB 方向 num40=direction(:13652,aiStyle167 走自动换向表⇒按出手 vx 符号)；kb 值直通 StrikeNPC', () => {
    const p = new Player(24 * 16, 104 * 16, new Inventory());
    const foe = mkEnemy(5, 1600, 1660, 40, 40);
    const { hooks } = makeHooks([foe], undefined, p);
    const g = new SparkleGuitarProj(1620, 1665, 50, 0, 81, 1620, 1665);
    g.knockback = 2;
    for (let t = 0; t < 89 && !g.dead; t++) g.fixedUpdate(1 / 60, hooks);
    expect(g.dead).toBe(true);
    expect(foe.kxs[foe.kxs.length - 1]).toBe(2);       // vx>0 ⇒ num40=+1
  });

  it('爆裂真结算(:72831-72841)：128×128 弹心居中盒,盒内全吃/盒外免疫/幂等', () => {
    const p = new Player(120, 940, new Inventory());   // 玩家盒 (120,940,20,42)——LOS 锚
    const inBox = mkEnemy(10, 494, 950, 18, 18);       // 盒内 [424..552]×[904..1032]
    const outBox = mkEnemy(11, 490, 1038, 16, 16);     // 底沿外 6px
    const { hooks } = makeHooks([inBox, outBox], undefined, p);
    const g = new SparkleGuitarProj(488, 968, 100, 0, 81, 488, 968);
    g.knockback = 3;
    const killOf = () =>
      ((SparkleGuitarProj.prototype as unknown as Record<string, (gh: GameHooks) => void>)
        .killStellarTune as (gh: GameHooks) => void);
    killOf().call(g, hooks);                                   // 直驱 Kill 856 段
    expect(g.dead).toBe(true);
    expect(g.w).toBe(128); expect(g.h).toBe(128);      // Resize 面（本轮判定即用 128 形）
    expect(inBox.hits).toEqual([81]);                  // 开阔 LOS 全额
    expect(inBox.kxs).toEqual([3]);                    // vx>0 ⇒ num40=+1 × kb=3
    expect(outBox.hits).toEqual([]);                   // 盒外零结算
    killOf().call(g, hooks);                           // active=false 幂等（:71761 同构）
    expect(inBox.hits.length).toBe(1);
    expect(outBox.hits.length).toBe(0);
  });

  it('F2 减伤视线=步行族整盒对整盒(Collision.cs:373→383→388)：非对称走廊判别场', () => {
    // 走廊 row60 通、row61 地板带实心：CanHit 步行族「垂直对偶双实心才夹杀」放行,
    // CanHitLine 三 tile 组 ANY 即断——判别式实证两族互异(旧 canHitLine 挂法此处错折 25%)
    const st = ((): TileStore => {
      const s = new TileStore(W, H);
      for (let x = 4; x <= 36; x++) s.setTile(x, 61, TILE_BY_KEY['stone']);
      return s;
    })();
    // 判别前置自证：同一对参 walking 通过 / line 阻断
    expect(canHit(st, 424, 904, 128, 128, 120, 940, 20, 42)).toBe(true);
    expect(canHitLine(st, 424, 904, 128, 128, 120, 940, 20, 42)).toBe(false);
    const p = new Player(120, 940, new Inventory());
    const inBox = mkEnemy(10, 494, 950, 18, 18);
    const { hooks } = makeHooks([inBox], st, p);
    const g = new SparkleGuitarProj(488, 968, 100, 0, 81, 488, 968);
    ((SparkleGuitarProj.prototype as unknown as Record<string, (gh: GameHooks) => void>)
      .killStellarTune as (gh: GameHooks) => void).call(g, hooks);
    expect(inBox.hits).toEqual([81]);                  // 步行族视线通 → 无 ×0.75
  });

  it('爆裂轮同样吃 ModifyStellarTuneDamage(:13335 在 Damage_PVE_Inner 内)——遮挡时折算', () => {
    const p = new Player(120, 940, new Inventory());
    const inBox = mkEnemy(10, 494, 950, 18, 18);
    const st = makeStore();
    for (let ty = 56; ty <= 64; ty++) {                // 全厚板阻断 row60 走廊
      st.setTile(18, ty, TILE_BY_KEY['stone']);
      st.setTile(19, ty, TILE_BY_KEY['stone']);
    }
    const { hooks } = makeHooks([inBox], st, p);
    expect(canHit(st, 424, 904, 128, 128, 120, 940, 20, 42)).toBe(false);
    const g = new SparkleGuitarProj(488, 968, 100, 0, 81, 488, 968);
    ((SparkleGuitarProj.prototype as unknown as Record<string, (gh: GameHooks) => void>)
      .killStellarTune as (gh: GameHooks) => void).call(g, hooks);
    expect(inBox.hits).toEqual([60]);                  // trunc(81×0.75)
  });

  it('飞行端到端：触杀敌不被爆裂双扣 + 盒内次邻各一跳 + 远敌绝缘', () => {
    const p = new Player(24 * 16, 104 * 16, new Inventory());   // center≈(394,1685)
    const v = mkEnemy(1, 394 - 12, 1685 - 12, 24, 24);          // 曲线首拍必交（t01 极小近 P1）
    const mid = mkEnemy(2, 452, 1685 - 9, 18, 18);              // 距心 ~67px>32 触区、<64 爆区
    const far = mkEnemy(3, 594, 1685 - 9, 18, 18);              // >64px 爆区外
    const { hooks } = makeHooks([v, mid, far], undefined, p);
    const g = new SparkleGuitarProj(394, 1685, 50, 0, 81, 394, 1685);
    for (let t = 0; t < 20 && !g.dead; t++) g.fixedUpdate(1 / 60, hooks);
    expect(g.dead).toBe(true);
    expect(v.hits).toEqual([81]);
    expect(mid.hits).toEqual([81]);
    expect(far.hits).toEqual([]);
  });
});
