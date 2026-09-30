// ★清偿刀 R1（2026-09-30,BJ420/P1/Q4 登记债扫尾）判别测试。六件定谳锚：
//  D1 ghostHurt 同构五弹（BJ420 登记）：440（SetDefaults :5106-5117 magic :5116）/
//    704（:7449-7462 magic :7455）/ 731（:7696-7706 magic :7702）/ 950（:8958-8970
//    magic :8964）/ 482（:5574-5588 magic :5585）——原版触发链 Damage() :13712 flag10
//    → :13875 canGhostHeal → :13881-83 ghostHurt(num41, victimCenter)。受理面 =
//    dealContacts 内环免疫门（:12635/:12600 收编,在 onHit 前拒）⇒ onHit 位即
//    flag10 块可达面。ghostHeal 已接（BJ383）仅缺 hurt 面 → ghostHurtOnHit 单源零改动。
//  D2 静态窗 over-consumption（damageAlongBolt）：原版写梯 :14031-14038 受理后才写
//    （usesIDStatic 支 :14035-14036）——拒收拍（:12635 门）零写零耗。旧档 cd.ready
//    （1122 IDStatic 共享表【读+写】）先于免疫门 = 拒收先消费 10t 表行。
//  D3 applyProjStatus over-fire：StatusNPC :13634 在 :12635 门后 = 拒收不可达
//    （Arrow BJ395 受理面化同族）——旧档拒收拍照跑（1122 buff 400 照上）。
//  D4 1122 受理写面差：usesIDStatic 支真值 = `immune[owner]=0` 清窗+静态表行
//    （:14035-14036）——非 pierce=0 的 10t 新全局窗（:14180-14183 尾档）。1117/1091
//    无免疫旗 → 尾档 10t 真确（pierce=0 面正确不动;1091 hostile 排除=magic 门零行为）。
//  524 血舌球（Q4 verdict 落刀）：usesIDStatic（SetDefaults :5952-5953）⇒ flag3=false
//    ⇒ :12635 全局窗门生效（弹幕域 Enemy.iframes,清偿刀 T 单源快照）+ 写面 pierce=-2。
//  六读门面：856/978/977 判别面在 spectre/q4 既有测试（q4-volcano-muramasa-gate）,
//    本文件补 524 读门 + D1 五弹受理面负例。
//  变异证红（手工执行实录,逐字节还原+sha256 对拍）：
//    M1 482 onHit 摘 ghostHurtOnHit → §A-5 红（零 356）
//    M2 damageAlongBolt cd.ready 移回免疫门前 → §B-1 红（拒收拍先消费,次弹被表拒）
//    M3 applyProjStatus 提到门拒 continue 前 → §C-1 红（拒收拍 buff 400 照上）
//    M4 1122 pierce -2→0 → §D 红（写面 10t 新窗回归）
//    M5 524 门摘除 → §E-1 红（残窗敌被误放行）;524 pierce -2→0 → §E-2 红
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import {
  StormLightning, ThunderBoltShot, LaserMachinegunLaser, BookStormTwister,
  PrincessMagicCircle,
} from '../src/entities/proj1457';
import { ClingerStaffWallProj } from '../src/entities/ClingerStaffWallProj';
import { BladetongueGlobProj } from '../src/entities/meleeOnHitProjs';
import { playerHasGhostHurt, _resetGhostBudgetForTest } from '../src/entities/SpectreSoulProj';

interface StealCall {
  kind: string; dmg: number; numHits: number; x: number; y: number; isMagic: boolean;
}

/** 敌桩——hurt 语义镜像 Enemy.hurt 门面+写面（:14119 入口清零 / :14317-14318 pierce
 *  写梯 / 免疫·禁伤门早退）。pierceCalls 记录取 pierce 实参（D4/524 写面判据）。 */
function mkEnemy(id: number, tx: number, ty: number, w = 24, h = 24,
  vanillaId: number | null = 15) {
  const e = {
    id, x: tx * TILE, y: ty * TILE, w, h, dead: false, vanillaId, maxHp: 100, hp: 100,
    lastStrikeDealt: 0, attempts: 0, iframes: 0, dontTakeDamage: false,
    pierceCalls: [] as number[],
    // 状态字段预声明（applyProjStatus 经 SUPPORTED 表直写;D3 判据读域）
    redLightningT: 0, onFire3T: 0, ichorT: 0,
    // cx/cy 中心读数（索敌/MoveTowards 消费）
    get cx() { return this.x + this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    hurt(this: { lastStrikeDealt: number; attempts: number; iframes: number;
      dontTakeDamage: boolean; pierceCalls: number[] },
      dmg: number, _kx: number, _ky: number, _g: unknown, _pen: number, _crit: boolean,
      pierce: number): boolean {
      this.lastStrikeDealt = 0;                   // 入口清零（Enemy.ts:14119 同式）
      this.pierceCalls.push(pierce);
      if (this.iframes > 0 || this.dontTakeDamage) return false;   // 免疫/禁伤门早退
      this.attempts++;
      this.lastStrikeDealt = dmg;                 // 无防御桩:num41=dmg
      if (pierce === -3) this.iframes = 0;        // :14317 usesLocal 清零档
      else if (pierce !== -2 && pierce !== 1) this.iframes = 10;   // :14318 缺省 10t
      // pierce=-2 = IDStatic 三不写档（SporeGasCloud/482/1122 判例）
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
    startLoopSfx: () => ({ stop: () => {}, setVolume: () => {}, playing: true, dead: false }),
    spawnDust: () => null,
    applyLifeSteal: (kind: 'vampire' | 'ghost', dmg: number, numHits: number,
      x: number, y: number, isMagic?: boolean) => {
      opts.ste?.push({ kind, dmg, numHits, x, y, isMagic: !!isMagic });
      return 0;
    },
    noteNpcPlayerImmune: () => {},
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

const PX = 80;
const PY = 90;

function orbsOf(added: unknown[]): Array<{ damage: number; x: number; y: number;
  w: number; h: number }> {
  return added.filter((a) => (a as { projId?: number }).projId === 356) as never;
}

// ═══ D1：ghostHurt 同构五弹 → 356 浮魂（逐弹发射判别） ═══
describe('R1-D1:440/704/731/950/482 ghostHurt → 356（dealContacts 受理面 onHit）', () => {
  it('440 激光机枪弹（magic :5116）命中 → 356 伤=弹基伤 60 + 吸血同拍 + 计数 1', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const e = mkEnemy(101, PX, PY);
    const { hooks, added } = makeHooks({ enemies: [e], ste, player: ghostPlayer(PX, PY) });
    const p = new LaserMachinegunLaser(PX * TILE + 5, PY * TILE + 5, 0, 0, 60, 2);
    p.critChance = 0;
    p.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    expect(ste.length).toBe(1);                             // ghostHeal（BJ383 既有面不回归）
    expect(ste[0].numHits).toBe(0);                         // 自增前值
    expect(p.pveNumHits).toBe(1);
    const orbs = orbsOf(added);
    expect(orbs.length).toBe(1);                            // ★ghostHurt 缺面补齐
    expect(orbs[0].damage).toBe(60);
    expect(orbs[0].x + orbs[0].w / 2).toBeCloseTo(e.cx, 5); // 出生=受害者 Center
  });

  it('731 雷杖弹（magic :7702）命中 → 356 伤=24', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const e = mkEnemy(102, PX, PY);
    const { hooks, added } = makeHooks({ enemies: [e], ste, player: ghostPlayer(PX, PY) });
    const p = new ThunderBoltShot(PX * TILE, PY * TILE, 0, 0, 24, 3);
    p.critChance = 0;
    p.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    expect(p.pveNumHits).toBe(1);
    const orbs = orbsOf(added);
    expect(orbs.length).toBe(1);
    expect(orbs[0].damage).toBe(24);
  });

  it('704 书册风暴龙卷（magic :7455）命中 → 356 伤=63', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const e = mkEnemy(103, PX, PY);
    const { hooks, added } = makeHooks({ enemies: [e], ste, player: ghostPlayer(PX, PY) });
    const p = new BookStormTwister(PX * TILE, PY * TILE, 0, 63, 9);
    p.critChance = 0;
    p.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    expect(p.pveNumHits).toBe(1);
    const orbs = orbsOf(added);
    expect(orbs.length).toBe(1);
    expect(orbs[0].damage).toBe(63);
  });

  it('950 公主魔法阵（magic :8964,伤 ×0.98 折价 49）命中 → 356 伤=49', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const e = mkEnemy(104, PX, PY);
    const { hooks, added } = makeHooks({ enemies: [e], ste, player: ghostPlayer(PX, PY) });
    const p = new PrincessMagicCircle(PX * TILE, PY * TILE, 50, 2);
    p.critChance = 0;
    p.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    expect(p.pveNumHits).toBe(1);
    const orbs = orbsOf(added);
    expect(orbs.length).toBe(1);
    expect(orbs[0].damage).toBe(49);                        // :13575 (int)(dmg×0.98)
  });

  it('482 诅咒焰墙（magic :5585）命中 → 356 伤=50', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const e = mkEnemy(105, PX, PY);
    const { hooks, added } = makeHooks({ enemies: [e], ste, player: ghostPlayer(PX, PY) });
    const w = new ClingerStaffWallProj(PX * TILE, PY * TILE, PY * TILE, 240, 50, 2);
    w.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    expect(ste.length).toBe(1);
    expect(w.pveNumHits).toBe(1);
    const orbs = orbsOf(added);
    expect(orbs.length).toBe(1);
    expect(orbs[0].damage).toBe(50);
  });

  it('负例①无套装 → 命中照常、零 356（731）', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const e = mkEnemy(106, PX, PY);
    const { hooks, added } = makeHooks({ enemies: [e], ste });
    const p = new ThunderBoltShot(PX * TILE, PY * TILE, 0, 0, 24, 3);
    p.critChance = 0;
    p.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    expect(ste.length).toBe(1);                             // ghostHeal 照走（BJ383）
    expect(orbsOf(added).length).toBe(0);
  });

  it('负例②受理面门拒（482 iframes>0）→ 零 hurt/零 proc/零计数/零 356', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const e = mkEnemy(107, PX, PY);
    e.iframes = 5;                                          // 他弹 10t 免疫窗内（:12635）
    const { hooks, added } = makeHooks({ enemies: [e], ste, player: ghostPlayer(PX, PY) });
    const w = new ClingerStaffWallProj(PX * TILE, PY * TILE, PY * TILE, 240, 50, 2);
    w.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(0);
    expect(ste.length).toBe(0);
    expect(w.pveNumHits).toBe(0);
    expect(orbsOf(added).length).toBe(0);
  });
});

// ═══ D2：拒收拍不消耗 1122 IDStatic 共享表行（写梯 :14035-14036 受理后才写） ═══
describe('R1-D2:1122 静态窗拒收不消耗（damageAlongBolt 门位）', () => {
  it('拒收拍（iframes>0）不落表行 → 清窗后次弹当拍即受理', () => {
    _resetGhostBudgetForTest(0);
    const e = mkEnemy(201, PX, PY, 64, 64);
    e.iframes = 5;
    const { hooks } = makeHooks({ enemies: [e] });
    const b1 = new StormLightning(1122, PX * TILE + 8, PY * TILE + 8, 60, 2);
    b1.critChance = 0; b1.seed = 7;
    b1.fixedUpdate(1 / 60, hooks);                          // 门拒全静默（不落 :12635 之后的表行）
    expect(e.attempts).toBe(0);
    expect(b1.pveNumHits).toBe(0);
    e.iframes = 0;                                          // 窗清（他弹窗尽）
    const b2 = new StormLightning(1122, PX * TILE + 8, PY * TILE + 8, 60, 2);
    b2.critChance = 0; b2.seed = 7;
    b2.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);                             // ★共享表行未被拒收拍消费
  });

  it('正控：受理拍落表行 → 10t 型级窗内次弹被拒（表节流面不因刀位前移失效）', () => {
    _resetGhostBudgetForTest(0);
    const e = mkEnemy(202, PX, PY, 64, 64);
    const { hooks } = makeHooks({ enemies: [e] });
    const b1 = new StormLightning(1122, PX * TILE + 8, PY * TILE + 8, 60, 2);
    b1.critChance = 0; b1.seed = 7;
    b1.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    const b2 = new StormLightning(1122, PX * TILE + 8, PY * TILE + 8, 60, 2);
    b2.critChance = 0; b2.seed = 7;
    b2.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);                             // IDStatic 10t 共享窗照节流
  });
});

// ═══ D3：applyProjStatus 受理面化（StatusNPC :13634 在 :12635 门后=拒收不可达） ═══
describe('R1-D3:拒收拍零状态（1122 buff400 / 524 buff69 读域）', () => {
  it('1122 拒收拍（iframes>0）→ buff 400 不上;受理照上（正控）', () => {
    _resetGhostBudgetForTest(0);
    const e = mkEnemy(301, PX, PY, 64, 64);
    e.iframes = 5;
    const { hooks } = makeHooks({ enemies: [e] });
    const b1 = new StormLightning(1122, PX * TILE + 8, PY * TILE + 8, 60, 2);
    b1.critChance = 0; b1.seed = 7;
    b1.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(0);
    expect(e.redLightningT ?? 0).toBe(0);                   // ★拒收拍照跑=旧病灶（D3）
    const e2 = mkEnemy(302, PX, PY, 64, 64);
    const hooks2 = makeHooks({ enemies: [e2] }).hooks;
    const b2 = new StormLightning(1122, PX * TILE + 8, PY * TILE + 8, 60, 2);
    b2.critChance = 0; b2.seed = 7;
    b2.fixedUpdate(1 / 60, hooks2);
    expect(e2.attempts).toBe(1);
    expect((e2.redLightningT ?? 0)).toBeGreaterThan(0);     // 受理面 StatusNPC 照达
  });

  it('1117 受理拍 → buff 323 OnFire3 照上（状态面不因门位前移缺达）', () => {
    _resetGhostBudgetForTest(0);
    const e = mkEnemy(303, PX, PY, 64, 64);
    const { hooks } = makeHooks({ enemies: [e] });
    const b = new StormLightning(1117, PX * TILE + 8, PY * TILE + 8, 60, 2);
    b.critChance = 0;
    for (let i = 0; i < 80 && !b.dead; i++) b.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    expect((e.onFire3T ?? 0)).toBeGreaterThan(0);           // :11230 双条之一（323）
  });
});

// ═══ D4：1122 写面=-2 清窗档 / 1117·1091 尾档 pierce=0（:14031-14038 vs :14180-14183） ═══
describe('R1-D4:1122/1117/1091 受理写面 pierce 分档', () => {
  it('1122 受理 → hurt pierce=-2（usesIDStatic 支 :14035-14036=清窗+表行,非 10t 新窗）', () => {
    _resetGhostBudgetForTest(0);
    const e = mkEnemy(401, PX, PY, 64, 64);
    const { hooks } = makeHooks({ enemies: [e] });
    const b = new StormLightning(1122, PX * TILE + 8, PY * TILE + 8, 60, 2);
    b.critChance = 0; b.seed = 7;
    b.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    expect(e.pierceCalls).toEqual([-2]);                    // ★写面：三不写档（D4）
    expect(e.iframes).toBe(0);                              // 不开 10t 全局窗（镜像写梯）
  });

  it('1117 受理 → pierce=0（无免疫旗 → 尾档 :14180-14183 写 10t 真确,不动）', () => {
    _resetGhostBudgetForTest(0);
    const e = mkEnemy(402, PX, PY, 64, 64);
    const { hooks } = makeHooks({ enemies: [e] });
    const b = new StormLightning(1117, PX * TILE + 8, PY * TILE + 8, 60, 2);
    b.critChance = 0;
    for (let i = 0; i < 80 && !b.dead; i++) b.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    expect(e.pierceCalls).toEqual([0]);
    expect(e.iframes).toBe(10);                             // 尾档 10t 全局窗（原版同值）
  });

  it('1117 写出的 10t 全局窗拒后续弹（门位前移后 1117 节拍不变）→ 拒收拍零 proc 零计数', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const e = mkEnemy(403, PX, PY, 64, 64);
    const { hooks, added } = makeHooks({ enemies: [e], ste, player: ghostPlayer(PX, PY) });
    const b1 = new StormLightning(1117, PX * TILE + 8, PY * TILE + 8, 60, 2);
    b1.critChance = 0;
    for (let i = 0; i < 80 && !b1.dead; i++) b1.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    expect(b1.pveNumHits).toBe(1);
    const b2 = new StormLightning(1117, PX * TILE + 8, PY * TILE + 8, 60, 2);
    b2.critChance = 0;
    for (let i = 0; i < 80 && !b2.dead; i++) b2.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);                             // :12635 门拒（10t 窗内）
    expect(b2.pveNumHits).toBe(0);                          // 拒收不计数（D3 面同源）
    expect(ste.length).toBe(1);                             // 首弹 proc 恰一次
    expect(orbsOf(added).length).toBe(1);
  });

  it('1091 世界雷受理 → pierce=0（hostile 排除:magic 门零行为过滤,写面同 1117）', () => {
    _resetGhostBudgetForTest(0);
    const ste: StealCall[] = [];
    const e = mkEnemy(404, PX, PY, 64, 64);
    const { hooks, added } = makeHooks({ enemies: [e], ste, player: ghostPlayer(PX, PY) });
    const b = new StormLightning(1091, PX * TILE + 8, PY * TILE + 8, 60, 2);
    b.critChance = 0;
    (b as unknown as { life: number }).life = 2;
    for (let i = 0; i < 60 && !b.dead; i++) b.fixedUpdate(1 / 60, hooks);
    expect(e.attempts).toBe(1);
    expect(e.pierceCalls).toEqual([0]);
    expect(ste.length).toBe(0);                             // 无 magic 行+!hostile 段排除
    expect(orbsOf(added).length).toBe(0);
  });
});

// ═══ 524 血舌球：全局窗门（Q4 定谳落刀）+ 写面 pierce=-2 + 表节流 ═══
describe('R1-524:全局免疫窗门 + IDStatic 写面（BladetongueGlobProj）', () => {
  function mkGlobGame(...enemies: unknown[]) {
    const { hooks, added } = makeHooks({ enemies });
    return { gg: hooks, added };
  }
  function mkGlobEnemy(id: number, px: number, py: number,
    opts: { iframes?: number; dontTakeDamage?: boolean } = {}) {
    const e = mkEnemy(id, 0, 0, 16, 16);
    e.x = px; e.y = py;
    e.iframes = opts.iframes ?? 0;
    e.dontTakeDamage = opts.dontTakeDamage ?? false;
    return e;
  }

  it('残窗敌（iframes=10）→ 门拒：零 hurt/零 ichorT/零表行/弹存活;清窗后次球即受理', () => {
    const e = mkGlobEnemy(501, 450, 450, { iframes: 10 });
    const { gg } = mkGlobGame(e);
    const g1 = new BladetongueGlobProj(458, 458, 0, 0, 30, 2);
    g1.critChanceFn = () => 0;
    g1.fixedUpdate(1 / 60, gg);
    expect(e.pierceCalls).toHaveLength(0);                  // ★门拒（Q4 verdict:flag3=false）
    expect(e.ichorT ?? 0).toBe(0);
    expect(g1.dead).toBe(false);
    e.iframes = 0;
    const g2 = new BladetongueGlobProj(458, 458, 0, 0, 30, 2);
    g2.critChanceFn = () => 0;
    g2.fixedUpdate(1 / 60, gg);
    expect(e.pierceCalls).toHaveLength(1);                  // 拒收拍未落表行
    expect(e.pierceCalls[0]).toBe(-2);                      // ★写面：IDStatic 清窗档
  });

  it('受理 → pierce=-2 + 同拍次球被 10t 静态表节流（:14036 面）', () => {
    const e = mkGlobEnemy(502, 450, 450);
    const { gg } = mkGlobGame(e);
    const g1 = new BladetongueGlobProj(458, 458, 0, 0, 30, 2);
    g1.critChanceFn = () => 0;
    g1.fixedUpdate(1 / 60, gg);
    expect(e.pierceCalls).toEqual([-2]);
    // ★清偿刀 S2/R1-A（2026-09-30）兑现：StatusNPC :11393 Ichor(69) 180-420t 面
    //  已接线（BladetongueGlobProj 受理位 applyProjStatus 表驱动）——旧「缺面钉锚
    //  ichorT=0」按本行自带指令翻正移除,判别面迁 tests/s2-proj-acceptface-batch §A。
    expect(e.ichorT ?? 0).toBeGreaterThan(0);
    expect(e.ichorT ?? 0).toBeGreaterThanOrEqual(3);
    expect(e.ichorT ?? 0).toBeLessThanOrEqual(7);
    expect(e.pierceCalls).toHaveLength(1);                  // 静态表行已落（6 子步仅 1 结算）
    const g2 = new BladetongueGlobProj(458, 458, 0, 0, 30, 2);
    g2.critChanceFn = () => 0;
    g2.fixedUpdate(1 / 60, gg);
    expect(e.pierceCalls).toHaveLength(1);                  // 10t 型级窗节流（IDStatic）
  });

  it('dontTakeDamage → 拒（:12600 外环门同相）', () => {
    const e = mkGlobEnemy(503, 450, 450, { dontTakeDamage: true });
    const { gg } = mkGlobGame(e);
    const g = new BladetongueGlobProj(458, 458, 0, 0, 30, 2);
    g.critChanceFn = () => 0;
    g.fixedUpdate(1 / 60, gg);
    expect(e.pierceCalls).toHaveLength(0);
  });
});
