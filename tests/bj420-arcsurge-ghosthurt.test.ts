// ★BJ420（2026-09-30）用户实报定谳刀：「电弧涌动」6173（弹 1122 StormLightning）触发
//  不了幽灵面具套装 ghostHurt → 356 浮魂。定谳锚：
//  - 物品面：Terarria1457/Terraria/Item.cs:47556-47564 `case 6173: DefaultToStaff(1122,
//    8f,18,18); useTime=6; SetWeaponValues(180,4f)` → shoot=1122,魔法杖系（DefaultToStaff
//    置 magic）。
//  - 弹数据面：Projectile.cs:10439-10447 type==1122 `friendly=magic=true`（1117 同段
//    :10433-10437）；1091（:10178-10186）friendly+hostile+trap 且无 magic 行。
//  - 原版触发面：Projectile.Damage() :13712 flag10 = num41>0 ∧ lifeMax>5 ∧ friendly ∧
//    !hostile ∧ aiStyle≠59 → :13875 canGhostHeal|flag9 → :13881-83 ghostHurt(...) →
//    :12068-12069 NewProjectile(356, num=damage 基伤)（:12021-12070 方法体,!magic||
//    damage<=0 早退）。
//  - 本仓缺面层：proj1457.StormLightning.damageAlongBolt（bolt Kill 帧结算）只接了
//    ghostHealProc（BJ383），ghostHurtOnHit 整缺 = 用户实报病灶；同批 1.4.5 新增魔法弹
//    1115/1116（6153 冰川之牙/6154 神秘绽放,DefaultToMagicWeapon :47425/:47437）同缺。
//  - 落刀：damageAlongBolt 补受理面前置快照（清偿刀 T 族规——:12635-12638 immune[owner]
//    门 :12600 dontTakeDamage 外环门读 StrikeNPC 前态,门拒整跳 ⇒ flag10 块与 :14263
//    numHits++ 全不达）+ !vanillaGated 内接 ghostHurtOnHit 单源;1115/1116 经
//    dealContacts（内环免疫门红蓝-L1① 已收编=受理面）onHit 内补 ghostHurtOnHit。
//  判别面：装幽灵套 → 该弹命中 → 356 发射（伤=弹基伤）;受理面/受害者门/数据面 magic 门
//  逐条反例。356 弹实体行为（预热/触敌即亡/无递归）由 spectre-stellar-procs 与
//  spectre-ghosthurt-audit 既有覆盖,不重测。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import {
  StormLightning, PetalstormShot, GlacierFangShot,
  type GlacierFangCtl,
} from '../src/entities/proj1457';
import { playerHasGhostHurt, _resetGhostBudgetForTest } from '../src/entities/SpectreSoulProj';

interface StealCall {
  kind: string; dmg: number; numHits: number; x: number; y: number; isMagic: boolean;
}

/** 敌桩——hurt 语义镜像 Enemy.hurt 门面（pierce≠1 且 iframes>0 / dontTakeDamage →
 *  早退拒收,lastStrikeDealt 入口清零 :14119;受理路径写 lastStrikeDealt=num41）。 */
function mkEnemy(id: number, tx: number, ty: number, w = 24, h = 24,
  vanillaId: number | null = 15) {
  const e = {
    id, x: tx * TILE, y: ty * TILE, w, h, dead: false, vanillaId, maxHp: 100, hp: 100,
    lastStrikeDealt: 0, attempts: 0, iframes: 0, dontTakeDamage: false,
    // cx/cy 中心读数（StormLightning 索敌/MoveTowards 消费——缺读=NaN 沿锁直写）
    get cx() { return this.x + this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    hurt(this: { lastStrikeDealt: number; attempts: number; iframes: number;
      dontTakeDamage: boolean }, dmg: number): boolean {
      this.lastStrikeDealt = 0;                   // 入口清零（Enemy.ts:14119 同式）
      if (this.iframes > 0 || this.dontTakeDamage) return false;   // 免疫/禁伤门早退
      this.attempts++;
      this.lastStrikeDealt = dmg;                 // 无防御桩:num41=dmg
      return true;
    },
  };
  return e;
}

function makeHooks(opts: {
  enemies?: unknown[]; critters?: unknown[]; ste?: StealCall[];
  player?: Record<string, unknown>;
} = {}): { hooks: GameHooks; added: unknown[] } {
  const player = opts.player ?? {
    equipStats: {}, cx: 80 * TILE, cy: 90 * TILE, x: 80 * TILE - 10, y: 90 * TILE - 21,
    w: 20, h: 42, dead: false, facing: 1, vx: 0, vy: 0,
    buffs: { has: () => false },
  };
  const added: unknown[] = [];
  const hooks = {
    world: { store: new TileStore(200, 120) } as never,
    player,
    enemies: () => opts.enemies ?? [],
    critters: () => opts.critters ?? [],
    projectiles: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {}, playSfxAt: () => {},
    showPickupLabel: () => {},
    addLightAt: () => {},
    punchCamera: () => {},
    spawnDust: () => null,
    applyLifeSteal: (kind: 'vampire' | 'ghost', dmg: number, numHits: number,
      x: number, y: number, isMagic?: boolean) => {
      opts.ste?.push({ kind, dmg, numHits, x, y, isMagic: !!isMagic });
      return 0;
    },
    stack: { anyTagged: () => false, hasActiveEffect: () => false },
  };
  (hooks as unknown as Record<string, unknown>).entities = {
    add: (e: unknown) => { added.push(e); },
  };
  return { hooks: hooks as unknown as GameHooks, added };
}

/** 幽灵面具套装玩家形（playerHasGhostHurt 判据 equipStats.setBonus.ghostHurt） */
function ghostPlayer(px = 60, py = 90): Record<string, unknown> {
  return {
    dead: false, cx: px * TILE, cy: py * TILE, x: px * TILE - 10, y: py * TILE - 21,
    w: 20, h: 42, equipStats: { setBonus: { ghostHurt: true } },
  };
}

const PX = 80;      // 敌基准格
const PY = 90;

describe('BJ420:1122 电弧涌动 ghostHurt → 356 浮魂（用户实报面）', () => {
  it('装幽灵面具套 → Kill 帧 bolt 命中敌 → 356 发射（伤=弹基伤）+ 吸血 proc 同拍有序', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const e = mkEnemy(1, PX, PY, 64, 64);                  // 大盒盖 MultiPointHitbox ±8
    const { hooks, added } = makeHooks({ enemies: [e], ste, player: ghostPlayer(60, PY) });
    expect(playerHasGhostHurt((hooks as unknown as { player: unknown }).player)).toBe(true);
    const bolt = new StormLightning(1122, PX * TILE + 8, PY * TILE + 8, 60, 2);
    bolt.critChance = 0;
    bolt.seed = 7;                                          // ai2 出手种子（折线几何随机化）
    bolt.fixedUpdate(1 / 60, hooks);                        // timeLeft=1 → 出生首拍即 Kill 落雷
    expect(e.attempts).toBe(1);                             // 敌面受理
    expect(e.lastStrikeDealt).toBe(60);                     // num41=弹基伤（无防御桩）
    expect(bolt.pveNumHits).toBe(1);                        // :14263 受理计数
    expect(ste.length).toBe(1);                             // ghostHeal（:13877-79）先达
    expect(ste[0].kind).toBe('ghost');
    expect(ste[0].dmg).toBe(60);
    const orbs = added.filter((a) => (a as { projId?: number }).projId === 356);
    expect(orbs.length).toBe(1);                            // ★356 浮魂发射（:12068-12069）
    const orb = orbs[0] as { damage: number; x: number; y: number; w: number; h: number };
    expect(orb.damage).toBe(60);                            // 伤=弹基伤（非实扣 dealt）
    expect(orb.x + orb.w / 2).toBeCloseTo(e.cx, 5);         // 出生=受害者 Center（:13883 实参）
    expect(orb.y + orb.h / 2).toBeCloseTo(e.cy, 5);
  });

  it('无套装 → 命中照常/吸血照走,零 356（负判别面）', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const e = mkEnemy(2, PX, PY, 64, 64);
    const { hooks, added } = makeHooks({ enemies: [e], ste });   // 缺省玩家无套装
    const bolt = new StormLightning(1122, PX * TILE + 8, PY * TILE + 8, 60, 2);
    bolt.critChance = 0;
    bolt.seed = 7;
    bolt.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    expect(bolt.pveNumHits).toBe(1);
    expect(ste.length).toBe(1);
    expect(added.filter((a) => (a as { projId?: number }).projId === 356).length).toBe(0);
  });

  it('受理面判据：外源免疫窗（iframes>0）→ 门拒整跳=零 hurt/零 proc/零计数/零 356', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const e = mkEnemy(3, PX, PY, 64, 64);
    e.iframes = 5;                                          // 他弹 10t 免疫窗内（:12635 门）
    const { hooks, added } = makeHooks({ enemies: [e], ste, player: ghostPlayer(60, PY) });
    const bolt = new StormLightning(1122, PX * TILE + 8, PY * TILE + 8, 60, 2);
    bolt.critChance = 0;
    bolt.seed = 7;
    bolt.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(0);                             // StrikeNPC 不达（Enemy.hurt 拒收）
    expect(ste.length).toBe(0);                             // ghostHeal 不达（flag10 块整跳）
    expect(bolt.pveNumHits).toBe(0);                        // :14263 不达（BJ420 收口）
    expect(added.filter((a) => (a as { projId?: number }).projId === 356).length).toBe(0);
  });

  it('受害者门（canGhostHeal=false 族 vanillaId=384）→ 零 356/零吸血,命中照常', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const e = mkEnemy(4, PX, PY, 64, 64, 384);              // NPC.cs:13921 canGhostHeal=false
    const { hooks, added } = makeHooks({ enemies: [e], ste, player: ghostPlayer(60, PY) });
    const bolt = new StormLightning(1122, PX * TILE + 8, PY * TILE + 8, 60, 2);
    bolt.critChance = 0;
    bolt.seed = 7;
    bolt.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);                             // :13875 门只拦 proc 不拦伤害
    expect(bolt.pveNumHits).toBe(1);                        // numHits++ 无条件（:14263）
    expect(ste.length).toBe(0);
    expect(added.filter((a) => (a as { projId?: number }).projId === 356).length).toBe(0);
  });
});

describe('BJ420:1091 世界雷反例 + 1117 同族正例', () => {
  it('1091 同结算面 → 零 356/零吸血（SetDefaults :10178-10186 无 magic 行+hostile）', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const e = mkEnemy(5, PX, PY, 64, 64);
    const { hooks, added } = makeHooks({ enemies: [e], ste, player: ghostPlayer(60, PY) });
    const bolt = new StormLightning(1091, PX * TILE + 8, PY * TILE + 8, 60, 2);
    bolt.critChance = 0;
    (bolt as unknown as { life: number }).life = 2;         // 压寿命直达 doKill（缺省 240）
    for (let i = 0; i < 60 && !bolt.dead; i++) bolt.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);                             // 敌面照常结算
    expect(ste.length).toBe(0);
    expect(added.filter((a) => (a as { projId?: number }).projId === 356).length).toBe(0);
  });

  it('1117 闪电之击（6155）同类同面 → 356 发射（同批普查件）', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const e = mkEnemy(6, PX, PY, 64, 64);
    const { hooks, added } = makeHooks({ enemies: [e], ste, player: ghostPlayer(60, PY) });
    const bolt = new StormLightning(1117, PX * TILE + 8, PY * TILE + 8, 60, 2);
    bolt.critChance = 0;
    for (let i = 0; i < 80 && !bolt.dead; i++) bolt.fixedUpdate(1 / 60, hooks);
    expect(bolt.dead).toBe(true);                           // 寿命 30+尸检 45 走完
    expect(e.attempts).toBe(1);
    expect(ste.length).toBe(1);                             // ghostHeal（magic :10433）
    const orbs = added.filter((a) => (a as { projId?: number }).projId === 356);
    expect(orbs.length).toBe(1);
    expect((orbs[0] as { damage: number }).damage).toBe(60);
  });
});

describe('BJ420:1.4.5 同批新增魔法弹 1116/1115 ghostHurt 面（dealContacts 受理面）', () => {
  it('1116 神秘绽放（6154）命中敌 → 356 发射+吸血同拍+弹亡（penetrate=1 :10422）', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const e = mkEnemy(7, PX, PY);
    const { hooks, added } = makeHooks({ enemies: [e], ste, player: ghostPlayer(PX, PY) });
    const p = new PetalstormShot(PX * TILE, PY * TILE, 0, 0, 50, 2, 0);
    p.critChance = 0;
    p.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    expect(ste.length).toBe(1);                             // ghostHeal 先达
    expect(ste[0].numHits).toBe(0);                         // 自增前值
    expect(p.pveNumHits).toBe(1);
    expect(p.dead).toBe(true);
    const orbs = added.filter((a) => (a as { projId?: number }).projId === 356);
    expect(orbs.length).toBe(1);
    expect((orbs[0] as { damage: number }).damage).toBe(50);
  });

  it('1116 无套装 → 零 356（负判别）', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const e = mkEnemy(8, PX, PY);
    const { hooks, added } = makeHooks({ enemies: [e], ste });
    const p = new PetalstormShot(PX * TILE, PY * TILE, 0, 0, 50, 2, 0);
    p.critChance = 0;
    p.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    expect(added.filter((a) => (a as { projId?: number }).projId === 356).length).toBe(0);
  });

  it('1115 冰川之牙（6153）释放拍命中敌 → 356 发射', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const { hooks, added } = makeHooks({ ste, player: ghostPlayer(PX, PY) });
    const ctl: GlacierFangCtl = {
      channel: () => false, aim: () => ({ x: 0, y: 0 }), payMana: () => {},
      chargeRate: () => 1,
    };
    const shot = new GlacierFangShot(PX * TILE, PY * TILE, 0, 0, 60, 2, ctl);
    shot.critChance = 0;
    shot.fixedUpdate(1 / 60, hooks);                        // 释放拍（charge=0 → penTier=1）
    const e = mkEnemy(9, (shot.x + 4) / TILE, (shot.y + 4) / TILE);
    (hooks as unknown as { enemies: () => unknown[] }).enemies = () => [e];
    shot.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    expect(ste.length).toBe(1);                             // ghostHeal（magic :10469）
    expect(shot.dead).toBe(true);                           // hits=1 ≥ penTier=1
    const orbs = added.filter((a) => (a as { projId?: number }).projId === 356);
    expect(orbs.length).toBe(1);
    expect((orbs[0] as { damage: number }).damage).toBe(60);
  });
});
