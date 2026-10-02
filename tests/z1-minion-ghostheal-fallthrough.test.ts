// ★清偿刀 Z1（2026-10-02）MinionProj 域漏修批判别测试——D1② ghostHeal 白耗面逐环 +
// D1③ 预算序面 + BJ433/D5 平台下穿链 + D1④ WhipProj GC1 桥对称 + D1② Arrow 翻案证据。
//  定谳锚（Terarria1457/Terraria/Projectile.cs 亲读）：
//   · ghostHeal 白耗/治疗面 = Damage() 通用 on-hit 段 :13877-84（:13875 canGhostHeal|flag9
//     门 / flag10 :13712 = num41>0∧lifeMax>5∧friendly∧!hostile∧aiStyle≠59）——对【一切】
//     可伤玩家弹照跑,无随从/武器分叉;原位=StrikeNPC(:13702)后/写梯(:14031)前/numHits++
//     (:14263)前。ghostHealProc 单源（SpectreSoulProj:137,S2-债1 摘 magic 预门形态）——
//     isMagic 数据面忠实直传（随从族全非 magic ⇒ 白耗面,:12090 lifeSteal 先扣/:12091-93
//     !magic return 预算照扣不出治疗球=原版本相）。
//   · BJ433/D5 平台下穿链：decidesManualFallThrough=true 13 处（12 SetDefaults：379/
//     393-395/758/833/834/835/951/1022/1036/1093/1112/1118 + 1 动态 aiStyle5 :24101）,
//     每拍写 shouldFallThrough（:50454 玩家脚−12 低于盒底 / :52112 目标心低于盒底）→
//     HandleMovement :17692-17694 `flag6 = shouldFallThrough` 平台承接关闭。旧注
//     「仅 379 置真→AI_067 全族域内死码」系与 BJ435 亲数矛盾的毒注,随批清。
//   · D1④ WhipProj GC1 桥：写梯 usesLocal 主支 :14175-14179 清零档——近战域表
//     （Game.meleeNpcImmuneGateOf 消费）单域记账对称面（原版单表 immune[owner] 读写域
//     不分敌怪/城镇/弹种）。
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';
import { Enemy } from '../src/entities/Enemy';
import { TownNPC } from '../src/entities/TownNPC';
import { MinionProj, TigerPounce } from '../src/entities/MinionProj';
import { Arrow } from '../src/entities/Arrow';
import { WhipProj } from '../src/entities/WhipProj';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY } from '../src/data/tiles';

interface StealCall {
  kind: string; dmg: number; numHits: number; x: number; y: number; isMagic: boolean;
}

function makeGame(list: Enemy[], towns: TownNPC[] = [], steals?: StealCall[],
  bridges?: Array<[number, number]>): { hooks: GameHooks; player: Player; projectiles: unknown[] } {
  const w = new World(200, 120, 7, 'z1-minion');
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) w.store.setTile(x, y, 1);
  w.groundLevel = 100;
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const projectiles: unknown[] = [];
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
    enemies: () => list,
    npcs: () => towns,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    spawnFriendlyProj: () => undefined,
    entities: { add: (e: unknown) => { projectiles.push(e); }, nextId: 1, projectiles } as never,
    // ★预算 spy：镜像 Game.applyLifeSteal 预算扣面（真体面见 §B——:43621 先扣后判）
    applyLifeSteal: (kind: 'vampire' | 'ghost', dmg: number, numHits: number,
      x: number, y: number, isMagic?: boolean) => {
      steals?.push({ kind, dmg, numHits, x, y, isMagic: !!isMagic });
      return 0;
    },
    tickCount: 0,
    noteNpcPlayerImmune: (npcId: number, ticks: number) => { bridges?.push([npcId, ticks]); },
  } as unknown as GameHooks;
  return { hooks, player, projectiles };
}

/** 僵尸桩（真 Enemy 管线,同 bj436/s3b 夹具法;vid 3 非 canGhostHeal=false 族） */
function zombie(hooks: GameHooks, uid: number, px = 400, py = 600): Enemy {
  const z = Enemy.fromVanilla(3, px, py)!;
  z.id = uid;
  z.maxHp = 5000;
  z.hp = 5000;
  (hooks as unknown as { enemies: () => Enemy[] }).enemies().push(z);
  return z;
}

/** 向导桩（vid 22,巫毒窄门正靶;Y2 同法） */
function guide(hooks: GameHooks, towns: TownNPC[], px = 400, py = 600): TownNPC {
  const g = new TownNPC('guide', px, py);
  g.id = 100 + towns.length;
  g.maxHp = 5000;
  g.hp = 5000;
  towns.push(g);
  return g;
}

const voodooOn = (p: Player): void => {
  Object.defineProperty(p, 'equipStats', {
    value: Object.freeze({ ...p.equipStats, killGuide: true }), configurable: true,
  });
};

const mk = (projId: number, player: Player, x: number, y: number, sentry = false): MinionProj =>
  new MinionProj(x, y, projId, 30, 2, sentry, 0, false, () => player);
const contactDirect = (m: MinionProj, hooks: GameHooks, dmg = 30, cd?: number): boolean =>
  (m as unknown as { contact: (g: GameHooks, d: number, cdIn?: number, pad?: number) => boolean })
    .contact(hooks, dmg, cd);
const priv = (m: MinionProj): Record<string, unknown> => m as unknown as Record<string, unknown>;

// ═══════════ §A D1②：ghostHeal 白耗面逐环判别（旧码零 proc 全红） ═══════════

describe('Z1-§A：MinionProj 各受理位 ghostHeal 白耗面（:13877-84 通用 on-hit 段）', () => {
  it('A1 敌怪环 contact()（266 idStatic 族）：proc isMagic=false/numHits=0/位=受害心/计数入账', () => {
    const steals: StealCall[] = [];
    const { hooks, player } = makeGame([], [], steals);
    const z = zombie(hooks, 4011);
    const m = mk(266, player, z.cx - 8, z.cy - 8);
    z.iframes = 0;
    expect(contactDirect(m, hooks, 30)).toBe(true);
    expect(steals.length).toBe(1);                      // ← 旧码=0（整缺）
    expect(steals[0].kind).toBe('ghost');
    expect(steals[0].isMagic).toBe(false);              // 随从族数据面非 magic=白耗面
    expect(steals[0].dmg).toBeGreaterThan(0);           // num41 等位（Enemy.lastStrikeDealt）
    expect(steals[0].numHits).toBe(0);                  // 自增前值（:14263 位 ++ 在后）
    expect(steals[0].x).toBeCloseTo(z.cx, 0);           // 受害者 Center（:13879）
    expect(priv(m).pveNumHits).toBe(1);                 // 受理入账
  });

  it('A2 门拒拍零 proc：窗内拒收（:12636 共门在 :13877 前）不白耗不计数', () => {
    const steals: StealCall[] = [];
    const { hooks, player } = makeGame([], [], steals);
    const z = zombie(hooks, 4012);
    const m = mk(317, player, z.cx - 14, z.cy - 14);
    z.iframes = 10;                                     // 他弹残窗
    expect(contactDirect(m, hooks, 30, 5)).toBe(false);
    expect(steals.length).toBe(0);                      // proc 与 numHits 同面（门拒不达）
    expect(priv(m).pveNumHits).toBe(0);
  });

  it('A3 城镇臂 contactTown（voodoo 放行）：proc 面=lastStrikeDealt/numHits 自增', () => {
    const steals: StealCall[] = [];
    const towns: TownNPC[] = [];
    const { hooks, player } = makeGame([], towns, steals);
    voodooOn(player);
    const g = guide(hooks, towns);
    const m = mk(317, player, g.cx - 14, g.cy - 14);
    expect(contactDirect(m, hooks, 30, 5)).toBe(true);
    expect(5000 - g.hp).toBeGreaterThan(0);
    expect(steals.length).toBe(1);                      // ← 旧码=0（城镇臂整缺）
    expect(steals[0].isMagic).toBe(false);
    expect(priv(m).pveNumHits).toBe(1);
  });

  it('A4 拳盒 623（状态 2 冲刺拳击,80×40 盒）：proc 照达', () => {
    const steals: StealCall[] = [];
    const { hooks, player } = makeGame([], [], steals);
    // 主 (960,1440);守护者距主 <500（:42196 flag5）+敌在拳盒（cx+direction×40,80×40）
    const z = zombie(hooks, 4013, 1000, 1100);
    const m = mk(623, player, 960, 1100);
    priv(m).gA0 = 2;
    priv(m).gA1 = z.id;                                 // 冲刺锁靶
    m.fixedUpdate(1 / 60, hooks);
    expect(steals.length).toBe(1);                      // ← 旧码=0
    expect(steals[0].isMagic).toBe(false);
  });

  it('A5 光环 688-690 场伤（塔本体载体）：proc 照达且塔身 numHits 累计', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const steals: StealCall[] = [];
    const { hooks, player } = makeGame([], [], steals);
    const tower = mk(688, player, 61 * 16, 96 * 16, true);   // 场心悬空（地面行 100 上方,LOS 通）
    tower.fixedUpdate(1, hooks);                        // sInit 净空测量出 auraSide/auraCy
    const auraCy = (tower as unknown as { auraCy: number }).auraCy;
    const z = zombie(hooks, 4014, tower.cx, auraCy);
    z.iframes = 0;
    tower.fixedUpdate(1, hooks);
    expect(steals.length).toBe(1);                      // ← 旧码=0
    expect(steals[0].isMagic).toBe(false);
    expect(priv(tower).pveNumHits).toBe(1);             // 塔本体计数（非瞬态 0 档）
    vi.restoreAllMocks();
  });

  it('A6 爆炸机关 694-696（爆炸弹瞬态载体）：proc projId=694/numHits=0（每颗独立起算）', () => {
    const steals: StealCall[] = [];
    const { hooks, player } = makeGame([], [], steals);
    const z = zombie(hooks, 4015, 400, 600);
    const tower = mk(691, player, 400, 648, true);      // 探测盒心 = 塔心上方 48px
    tower.fixedUpdate(1, hooks);                        // sCool 0→探测→爆炸
    expect(steals.length).toBe(1);
    expect(steals[0].isMagic).toBe(false);
    expect(priv(tower).pveNumHits).toBe(0);             // 瞬态弹计数不入塔身
  });

  it('A7 爆裂弹 644（彩虹水晶 volley,瞬态载体）：proc projId=644/numHits=0', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.5);   // 落点零散布=正中敌心
    const steals: StealCall[] = [];
    const { hooks, player } = makeGame([], [], steals);
    const z = zombie(hooks, 4016, 480, 600);
    const tower = mk(643, player, 400, 600, true);
    tower.fixedUpdate(1, hooks);                        // volley=3 连发
    expect(steals.length).toBeGreaterThanOrEqual(1);
    expect(steals[0].isMagic).toBe(false);
    expect(priv(tower).pveNumHits).toBe(0);
    vi.restoreAllMocks();
  });

  it('A8 扑击弹 818（TigerPounce 逐段瞬态）：proc projId=818/numHits=0', () => {
    const steals: StealCall[] = [];
    const { hooks, player } = makeGame([], [], steals);
    const z = zombie(hooks, 4017);
    z.iframes = 0;
    const t = new TigerPounce(z.cx, z.cy, 0, 0, 40, () => player, 0, 60);
    t.fixedUpdate(1 / 60, hooks);
    expect(5000 - z.hp).toBeGreaterThan(0);
    expect(steals.length).toBe(1);                      // ← 旧码=0
    expect(steals[0].isMagic).toBe(false);
  });

  it('A9 946 泰拉棱镜体触（tHitTick）：proc 照达', () => {
    const steals: StealCall[] = [];
    const { hooks, player } = makeGame([], [], steals);
    const z = zombie(hooks, 4018);
    const m = mk(946, player, z.cx - 8, z.cy - 12);
    (m as unknown as { tHitTick(g: GameHooks, p: Player, d: number): void }).tHitTick(hooks, player, 30);
    expect(steals.length).toBe(1);                      // ← 旧码=0
    expect(steals[0].isMagic).toBe(false);
  });
});

// ═══════════ §B D1③：白耗预算序面（applyLifeSteal 真体——player.lifeSteal 递减） ═══════════

describe('Z1-§B：幽魂帽+非 magic 命中 → player.lifeSteal 递减（Game.applyLifeSteal :43621 真体）', () => {
  const realSteal = Game.prototype.applyLifeSteal;
  const hoodOn = (p: Player): void => {
    Object.defineProperty(p, 'equipStats', {
      value: Object.freeze({ ...p.equipStats, setBonus: { ...(p.equipStats.setBonus ?? {}), ghostHeal: true } }),
      configurable: true,
    });
  };

  it('B1 幽魂兜帽在身+非 magic（isMagic=false）→ lifeSteal 白扣 20%（无治疗弹）', () => {
    const p = new Player(0, 0, new Inventory());
    hoodOn(p);
    p.lifeSteal = 80;
    const heals: unknown[] = [];
    const fakeThis = { player: p, entities: { add: (e: unknown) => { heals.push(e); } } } as unknown as Game;
    realSteal.call(fakeThis, 'ghost', 100, 0, 0, 0, false);   // numHits=0 → 率 0.2
    expect(p.lifeSteal).toBeCloseTo(60, 6);             // ★主判别：白耗卸除（M8 复挂 magic 预门=不减）必红
    expect(heals.length).toBe(0);                       // 非魔法不回复（:43433/:11418-21）
  });

  it('B2 magic=true → 同额递减+治疗弹出（治疗面不回归）;无套装 → 零递减', () => {
    const p = new Player(0, 0, new Inventory());
    hoodOn(p);
    p.lifeSteal = 80;
    const heals: unknown[] = [];
    const fakeThis = { player: p, entities: { add: (e: unknown) => { heals.push(e); } } } as unknown as Game;
    realSteal.call(fakeThis, 'ghost', 100, 0, 0, 0, true);
    expect(p.lifeSteal).toBeCloseTo(60, 6);
    expect(heals.length).toBe(1);                       // 298 鬼疗弹
    const p2 = new Player(0, 0, new Inventory());       // 无 ghostHeal 套装
    p2.lifeSteal = 80;
    const fakeThis2 = { player: p2, entities: { add: () => {} } } as unknown as Game;
    realSteal.call(fakeThis2, 'ghost', 100, 0, 0, 0, false);
    expect(p2.lifeSteal).toBe(80);                      // 套装门 :12885 位（扣前）
  });
});

// ═══════════ §C BJ433/D5：平台下穿链（:50454/:52112 两写位 → dropThrough 实体化） ═══════════

const PLAT = TILE_BY_KEY['platform']!;

/** 平台世界：平台行 56（列 57-63）+ 地面行 66（列 52-68）——其余全空 */
function makePlatformGame(): { hooks: GameHooks; player: Player; cat: MinionProj } {
  const w = new World(80, 80, 7, 'z1-fall');
  for (let x = 52; x <= 68; x++) for (let y = 66; y < 80; y++) w.store.setTile(x, y, 1);
  for (let x = 57; x <= 63; x++) w.store.setTile(x, 56, PLAT);
  w.groundLevel = 66;
  const player = new Player(60 * 16, 66 * 16 - 42, new Inventory());
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
    enemies: () => [], npcs: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {}, spawnFriendlyProj: () => undefined,
    entities: { add: () => {}, nextId: 1, projectiles: [] } as never,
    applyLifeSteal: () => 0,
  } as unknown as GameHooks;
  const cat = new MinionProj(60 * 16 - 7, 56 * 16 - 22, 1093, 10, 2, false, 0, false, () => player);
  return { hooks, player, cat };
}

describe('Z1-§C：猫 1093 平台下穿链（decidesManualFallThrough :10209 → :50454/:17694）', () => {
  it('C1 主在平台下方：猫穿平台下落归主（旧码站平台不下穿=用户实报,必红位）', () => {
    const { hooks, cat } = makePlatformGame();          // 主在地面行 66（平台下方 10 格）
    for (let k = 0; k < 60; k++) cat.fixedUpdate(1 / 60, hooks);
    expect(cat.y + cat.h).toBeGreaterThan(56 * 16 + 12); // ★主判别：盒底越过平台顶面
    expect(cat.y + cat.h).toBeGreaterThan(60 * 16);      // 已深入平台下方（非边缘滑落量级）
  });

  it('C2 主站平台上（脚−12 高于猫盒底）：不下穿（:50454 判别式负相,平台承接保持）', () => {
    const { hooks, player, cat } = makePlatformGame();
    player.x = 59 * 16; player.y = 56 * 16 - 42;         // 主站平台（脚=平台顶 896）
    for (let k = 0; k < 60; k++) cat.fixedUpdate(1 / 60, hooks);
    expect(Math.abs(cat.y + cat.h - 56 * 16)).toBeLessThanOrEqual(2);   // 仍站平台
  });

  it('C3 :52112 锚（目标盒底低于盒底 → 下穿追敌）：833 虎有敌在平台下 → dropThrough 置真', () => {
    const list: Enemy[] = [];
    const { hooks, player } = makeGame(list);
    const w = (hooks as unknown as { world: { store: import('../src/world/TileStore').TileStore } }).world.store;
    for (let x = 56; x <= 64; x++) w.setTile(x, 96, PLAT);   // 虎脚下平台（地面行 100 在下）
    const z = Enemy.fromVanilla(3, 68 * 16, 99 * 16)!;       // 平台下侧方敌（列外,LOS 不穿平台）
    z.id = 5001; z.maxHp = 5000; z.hp = 5000;
    list.push(z);
    const t = mk(833, player, 60 * 16 - 13, 96 * 16 - 20);   // 站平台
    priv(t).pounceCd = 1000;                                 // 关闭 818 链门（首拍特殊攻击早退会整跳目标支,ledger 同法）
    t.fixedUpdate(1, hooks);
    expect(priv(t).dropThrough).toBe(true);                  // ★:52112 锚（tgt.cy > 盒底）
  });
});

// ═══════════ §D D1④：WhipProj GC1 桥对称（敌怪环+城镇臂） ═══════════

const landOneHit = (w: WhipProj, hooks: GameHooks, ...targets: Array<{ x: number; y: number; w: number; h: number }>): void => {
  for (let i = 0; i < 9; i++) w.fixedUpdate(1, hooks);
  const p = w.pointsAt(20, true)[10];
  for (const t of targets) { t.x = p.x - t.w / 2; t.y = p.y - t.h / 2; }
  w.fixedUpdate(1, hooks);
};
const mkWhip = (player: Player, dmg: number, projId = 841, itemId = 4672): WhipProj =>
  new WhipProj(player.cx, player.cy, 0, projId, itemId, dmg, 4, 30, 4, () => player);

describe('Z1-§D：WhipProj noteVanillaProjImmune 桥对称（BJ436 MinionProj 同构;清零档写 0）', () => {
  it('D1 敌怪环受理命中 → 桥写 [id,0]（usesLocal 主支清零档,近战域表单域记账对称）', () => {
    const bridges: Array<[number, number]> = [];
    const list: Enemy[] = [];
    const { hooks, player } = makeGame(list, [], undefined, bridges);
    const e = zombie(hooks, 4021);
    landOneHit(mkWhip(player, 60), hooks, e);
    expect(5000 - e.hp).toBeGreaterThan(0);
    expect(bridges).toContainEqual([e.id, 0]);          // ★主判别（旧码零桥写必红）
  });

  it('D2 门拒拍（残窗）桥不写（受理面化,:12636 整跳 :14175 不达）', () => {
    const bridges: Array<[number, number]> = [];
    const list: Enemy[] = [];
    const { hooks, player } = makeGame(list, [], undefined, bridges);
    const e = zombie(hooks, 4022);
    e.iframes = 10;
    landOneHit(mkWhip(player, 60), hooks, e);
    expect(e.hp).toBe(5000);
    expect(bridges.length).toBe(0);
  });

  it('D3 城镇臂受理命中（巫毒放行）→ 桥写 [townId,0]（原版单表不分敌怪/城镇）', () => {
    const bridges: Array<[number, number]> = [];
    const list: Enemy[] = [];
    const towns: TownNPC[] = [];
    const { hooks, player } = makeGame(list, towns, undefined, bridges);
    voodooOn(player);
    const g = guide(hooks, towns);
    landOneHit(mkWhip(player, 60), hooks, g);
    expect(5000 - g.hp).toBeGreaterThan(0);
    expect(bridges).toContainEqual([g.id, 0]);          // ★主判别（城镇臂桥缺必红）
  });
});

// ═══════════ §E D1② 翻案证据：Arrow whipTagShot 哨兵弹路径已由通用环承载 ═══════════

describe('Z1-§E：whipTagShot 哨兵弹 ghostHeal 照达（Arrow 通用环 :9731 白耗臂既有面）', () => {
  it('E1 哨兵射弹（664,whipTagShot 置标）命中 → ghost proc isMagic=false', () => {
    const steals: StealCall[] = [];
    const { hooks } = makeGame([], [], steals);
    const z = zombie(hooks, 4031, 480, 256);
    z.iframes = 0;
    const a = new Arrow(450, 264, 6, 0, 60, 0, 664, { grav: 0, life: 300, pierce: 1 });
    (a as unknown as { whipTagShot: boolean }).whipTagShot = true;   // 哨兵/随从射弹置标（MinionProj 出膛同式）
    for (let i = 0; i < 40 && !a.dead; i++) a.fixedUpdate(1 / 60, hooks);
    expect(z.hp).toBeLessThan(5000);
    expect(steals.length).toBe(1);                      // D1②「Arrow whipTagShot 零 proc」判谳=翻案（既有面）
    expect(steals[0].kind).toBe('ghost');
    expect(steals[0].isMagic).toBe(false);
  });
});
