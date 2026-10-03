// ★BJ446（2026-10-03）：Enemy 域三债打包独立复核判别面（X4-债14/X4-债11/X4-债15）。
// 【复核定谳】三债在登记账仍写「登记待清」期间已由 2026-09-29 清偿链各刀落刀（登记账
//  处置行滞后,本批复核同步翻账）：
//   债14 = 清偿刀 Y —— Enemy.ts hurt 死亡级联六分支补 dontTakeDamage 真旗
//          （盘面锚：月总族 :14871/猪鲨 371 :14883/石巨人头 246 :14902/四塔 :14913,
//          免疫门 dontTakeDamage 头门 :14457）；专测 tests/debt-y-death-conversion
//          -window.test.ts 七案。
//   债11 = 清偿刀 R —— LunarNebula.ts 634/635 Kill AoE 环 strike pierce 0→-2
//          （:410-411,门照走+写支三不写）+ 受理面弹侧补写 iframes=5（:417,专支
//          :14080-14082 承载式）；专测 tests/debt-r-634-aoe-window5.test.ts 三案。
//          选型勘误：登记账候选「pierce=-3」不采——634/635 SetDefaults
//          （Terarria1457/Terraria/Projectile.cs:6818-6839）无 usesLocalNPCImmunity
//          行=非局部族,原版写支是【显型定档 5t】非 usesLocal 清零支（:14175-14178）；
//          -2 档+弹侧补写 5 与原版序等价（写位 :14080 在 proc :13877 后,ghostHeal
//          不读窗）。
//   债15 = 清偿刀 F + P3-F1 翻案 —— Enemy.fixedUpdate lovestruck 块接
//          GorePiece.newLovestruckHeart 单源（Enemy.ts :2685-2690,发射调用 :2688；
//          门=逐实例 canDisplayBuffs,FTW 石巨人四件拒发/普通世界照发）；专测
//          tests/enemy-lovestruck-heart.test.ts 五段。
// 本文件 = P4「独立复核」步骤的第二判别面：不复用刀测代码,断言独立重derive；
//   变异三发（摘护窗 :14871/摘补写 5 :417/摘 gore :2688）→ 对应 describe 红,
//   逐字节还原 + sha256 对拍（记录见 BJ446 收尾报告）。
// 原版锚（Terarria1457 亲读,登记账行号漂移记录）：
//   PrepareForDeathAnimation :78836-78842（登记写 :78835-78841,+1 漂移）——
//     life=lifeMax; dontTakeDamage=true; netUpdate=true; SetStrikePhaseChange;
//   checkDead :78844,转换族 :78850-78854（371,无 ai 守卫直调）/:78866-78876
//     （396/397）/:78878-78882（398,ai[0]!=2 守卫）——登记写「:78841-78875 附近」；
//     原版 checkDead 无 246 支（挂载头致死=HitEffect 召 249 + active 门天然拒,
//     NPC.cs:85913-85920）——本仓 246 支=boss#19 定案架构,Y 刀只补旗；
//   634/635 Kill :73267-73269（maxPenetrate=penetrate=-1 → Damage(),无漂移）；
//   Damage() 634/635 专支 :14080-14082 immune[owner]=5（无漂移）;proc :13877-13879;
//   UpdateNPC_BuffApplyVFX loveStruck 环 :92455-92466（登记行号吻合,1/5 掷+331+
//     sticky=false+×0.4+vy−0.6+档 Next(40,121)×0.01）。
// 验收④「649/634」按 645 判读（笔误）：645 先例不回归由 tests/debt-l-645-local-
//   immunity-gate.test.ts 既有锁承载（BJ446 回归跑,不在此重复建面）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Enemy } from '../src/entities/Enemy';
import { dukeBubbleAI } from '../src/entities/bossAI_duke_moonlord';
import { NebulaBlazeBolt } from '../src/entities/LunarNebula';
import { GorePiece } from '../src/entities/GorePiece';
import { TILE_BY_KEY } from '../src/data/tiles';

// ===========================================================================
// 债14 复核：血尽转换放行支 kill-tick 护窗（清偿刀 Y 形态,真 Enemy 管线）
// ===========================================================================
function makeGame14(list: Enemy[]): GameHooks {
  return {
    world: new World(200, 200, 30, 'bj446-debt14'),
    player: {
      dead: false, cx: 0, cy: 0, luck: 0, hp: 400, maxHp: 400, mana: 100, maxMana: 100,
    } as unknown,
    enemies: () => list,
    critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfxFiles: () => {}, playSfx: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: () => null,
    applyLifeSteal: () => 0,
  } as unknown as GameHooks;
}

describe('BJ446-债14：血尽转换放行支 kill-tick 护窗（清偿刀 Y 独立复核）', () => {
  it('397 血尽转换拍写真旗：同拍清零档（-3）与 flag3（pierce=1）两路补刀全拒零结算', () => {
    const list: Enemy[] = [];
    const game = makeGame14(list);
    const eye = Enemy.fromVanilla(397, 80 * TILE, 100 * TILE)!;
    expect(eye).toBeTruthy();
    list.push(eye);
    eye.hp = 1;
    // 致死拍：清零档写入方弹（567/568/656/251/856 同档）——结算照走（原版 StrikeNPC
    // 受理面）,转换放行支写 PrepareForDeathAnimation 真旗（:78870→:78838）
    expect(eye.hurt(100, 0, 0, game, 0, false, -3)).toBe(false);
    expect(eye.hp).toBeLessThanOrEqual(0);
    expect(eye.iframes).toBe(0);              // 清零档写支原样（写支 1:1 禁改钉面）
    expect(eye.dontTakeDamage).toBe(true);    // ★护窗（摘此行=本案红）
    const hp0 = eye.hp;
    expect(eye.hurt(200, 0, 0, game, 0, false, -3)).toBe(false);  // 同拍清零档补刀（旧码 iframes=0 门洞开）
    expect(eye.hurt(200, 0, 0, game, 0, false, 1)).toBe(false);   // flag3 豁免 iframes 路同样拒（:14457 真旗闸）
    expect(eye.hp).toBe(hp0);                 // 两路全零结算
  });

  it('371 爆裂泡泡引信态场景：致死拍写旗→同拍补刀拒→AI 首 tick 引信态（满血）旗维持→补刀仍拒', () => {
    const list: Enemy[] = [];
    const game = makeGame14(list);
    const bub = Enemy.fromVanilla(371, 80 * TILE, 100 * TILE)!;
    list.push(bub);
    expect(bub.maxHp).toBe(1);                // SetDefaults :13754 lifeMax=1
    expect(bub.hurt(100, 0, 0, game, 0, false, -3)).toBe(false);   // 致死拍（:78854 直调,无 ai 守卫）
    expect(bub.dontTakeDamage).toBe(true);    // ★护窗
    const hpKill = bub.hp;
    expect(bub.hurt(100, 0, 0, game, 0, false, -3)).toBe(false);   // 同拍补刀（旧码引信前窗可再扣血）
    expect(bub.hp).toBe(hpKill);
    // AI 首 tick：dukeBubbleAI 首行转换（ai0=1/ai1=4+满血+旗）——状态转换仍在 AI（台账②架构不动）
    dukeBubbleAI(bub, game, null);
    expect(bub.ai0).toBe(1);
    expect(bub.ai1).toBe(3);                  // ai1=4 置位后同 tick 引信支即 -1
    expect(bub.hp).toBe(bub.maxHp);
    expect(bub.dontTakeDamage).toBe(true);    // 引信态每 tick 重写（台账①面）
    expect(bub.hurt(100, 0, 0, game, 0, false, -3)).toBe(false);   // 引信态补刀（清零档）
    expect(bub.hurt(100, 0, 0, game, 0, false, 1)).toBe(false);    // 引信态补刀（flag3）
    expect(bub.hp).toBe(bub.maxHp);
  });
});

// ===========================================================================
// 债11 复核：634 Kill AoE 专支 5t 窗 + 受理面 proc/入账（清偿刀 R 形态,真 Enemy）
// ===========================================================================
interface StealCall { kind: string; dmg: number; numHits: number }

function makeGame11(log: StealCall[], list: Enemy[]): GameHooks {
  return {
    world: new World(200, 200, 30, 'bj446-debt11'),
    player: null as unknown,
    enemies: () => list,
    entities: { nextId: 1, add: () => {} },
    playSfxFiles: () => {}, playSfx: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, critters: () => [], notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: () => null,
    applyLifeSteal: (kind: 'vampire' | 'ghost', dmg: number, numHits: number) => {
      log.push({ kind, dmg, numHits });
      return 0;
    },
  } as unknown as GameHooks;
}

/** 坦克桩敌（真 Enemy 管线,血量抬高避开死亡管线;不 tick 敌=残窗保持到判别窗口尾）。 */
function tankEnemy(game: GameHooks, cx: number, cy: number, id: number): Enemy {
  const e = Enemy.fromVanilla(15, cx, cy)!;
  e.id = id;
  e.maxHp = 5000;
  e.hp = 5000;
  (game as unknown as { enemies: () => Enemy[] }).enemies().push(e);
  return e;
}

/** 出生点 (1280,1600) 40×40 飞行盒重叠 A 靶 → 首拍命中 penetrate 1→0 → Kill=burst
 *  （skipId=A）。速度 (0,0)=首拍命中不位移（爆盒锚恒 1275..1325×1595..1645）。 */
function fireBolt(game: GameHooks): NebulaBlazeBolt {
  const bolt = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 0, 0, 130, 3, 634);
  bolt.critChance = 0;
  for (let t = 0; t < 40 && !bolt.dead; t++) bolt.fixedUpdate(1, game);
  expect(bolt.dead).toBe(true);
  return bolt;
}

describe('BJ446-债11：634 Kill AoE 专支 5t 窗+受理 proc/入账（清偿刀 R 独立复核）', () => {
  it('纯 AoE 靶受理：iframes===5（专支 :14080-14082,非 10t 尾档）+ ghostHeal proc 达 + pveNumHits===2', () => {
    const log: StealCall[] = [];
    const game = makeGame11(log, []);
    const a = tankEnemy(game, 81 * TILE, 100 * TILE, 1);          // A：交飞行盒（skipId 面,F 刀形态回归钉）
    const b = tankEnemy(game, 0, 0, 2);                            // B：右缘钉 1277 ∈ (爆盒 1275, 飞行盒 1280] = 纯 AoE 面
    b.x = 1277 - b.w;
    b.y = 1620 - b.h / 2;
    expect(a.x + a.w > 1280 && a.x < 1320).toBe(true);             // 前置自检：A 交飞行盒
    expect(b.x + b.w).toBeGreaterThan(1275);                       // 前置自检：B 交爆盒
    expect(b.x + b.w).toBeLessThanOrEqual(1280);                   // 前置自检：B 不交飞行盒

    const hpA0 = a.hp, hpB0 = b.hp;
    const bolt = fireBolt(game);

    expect(a.hp).toBeLessThan(hpA0);                               // 飞行盒受理
    expect(a.iframes).toBe(5);                                     // 弹侧补写（专支 5t）
    expect(log[0].numHits).toBe(0);                                // 首结 0 档（:14263 自增在 proc 后）
    expect(b.hp).toBeLessThan(hpB0);                               // ★AoE 受理（旧 pierce=0 写支污染致 proc/入账恒跳）
    expect(b.iframes).toBe(5);                                     // ★窗值钉 5t（旧 10t 红）
    expect(log.length).toBe(2);                                    // ★proc 不再跳（旧=1 红）
    expect(log[1].kind).toBe('ghost');
    expect(log[1].dmg).toBeGreaterThan(0);                         // num41 防后实扣等位
    expect(log[1].numHits).toBe(1);                                // A 先入账 1 → B proc 读 1 档
    expect(bolt.pveNumHits).toBe(2);                               // ★入账达（飞行盒 1+AoE 1,旧=1 红）
  });

  it('5t 窗内第二发 AoE 免疫门拦（:12636 flag3=假照走）：零伤零 proc 窗原样', () => {
    const log: StealCall[] = [];
    const game = makeGame11(log, []);
    const a = tankEnemy(game, 81 * TILE, 100 * TILE, 1);
    const b = tankEnemy(game, 0, 0, 2);
    b.x = 1277 - b.w;
    b.y = 1620 - b.h / 2;
    fireBolt(game);
    expect(b.iframes).toBe(5);
    const hpB1 = b.hp, logLen1 = log.length;

    fireBolt(game);                                                // 敌不 tick,窗活着
    expect(b.hp).toBe(hpB1);                                       // AoE 门拒零伤
    expect(log.length).toBe(logLen1 + 1);                          // 仅 A 飞行盒再 proc（flag3 pierce=1 照打）
    expect(log[logLen1].numHits).toBe(0);                          // 第二弹自计数器首跳 0
    expect(b.iframes).toBe(5);                                     // 门拒不写支,窗原样（摘补写 5=本案红：窗 0 → 二发受理 hp 变）
  });
});

// ===========================================================================
// 债15 复核：Enemy 桶 Lovestruck 头爱心 gore 331（清偿刀 F+P3-F1 形态）
// ===========================================================================
const realRandom446 = Math.random;
afterEach(() => { Math.random = realRandom446; vi.restoreAllMocks(); });

function flatWorld446(): World {
  const world = new World(200, 200, 100, 'bj446-debt15');
  for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, 100, TILE_BY_KEY['dirt']!);
  world.clock.timeOfDay = 0.5;
  return world;
}
function makeGame15(world: World): GameHooks {
  return {
    world,
    player: { x: -9999, y: -9999, w: 0, h: 0, dead: true, sitting: false },
    enemies: () => [], npcs: () => [], critters: () => [],
    spawnTownShot: () => {}, spawnParticles: () => {}, spawnBurst: () => {},
    spawnDust: () => {}, spawnDrop: () => null, damagePlayer: () => 0,
    playSfx: () => {}, playSfxFiles: () => {}, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
  } as unknown as GameHooks;
}
function heartSpy446() {
  const captured: Array<{ type: number; x: number; y: number; vx0: number; vy0: number; scale: number | undefined; ret: GorePiece }> = [];
  const spy = vi.spyOn(GorePiece, 'newGore').mockImplementation(((type, x, y, vx, vy, scale) => {
    if (type !== 331) return null;
    const ret = { sticky: true, vx: 1, vy: 2 } as unknown as GorePiece;   // NewGore 后基速桩
    captured.push({ type, x, y, vx0: vx, vy0: vy, scale, ret });
    return ret;
  }) as typeof GorePiece.newGore);
  return { captured, spy };
}

describe('BJ446-债15：Enemy 桶 lovestruck 头爱心 gore 331 发射（清偿刀 F 独立复核）', () => {
  it('在位发射：冻结掷流 0 → 1 发 331,速/档下沿 + 调用侧三连（sticky=false/×0.4/vy−0.6）', () => {
    const e = new Enemy('zombie', 100 * 16, 96 * 16);
    const game = makeGame15(flatWorld446());
    for (let i = 0; i < 12; i++) e.fixedUpdate(1 / 60, game);      // 物理落定
    const { captured } = heartSpy446();
    Math.random = () => 0;   // 全掷下沿：1/5 门中、向 (-10,-10)、位偏 0、spd 0.99、档 0.4
    e.lovestruckT = 30;
    const x0 = e.x, y0 = e.y;
    e.fixedUpdate(1 / 60, game);
    const x1 = e.x, y1 = e.y;
    expect(captured.length).toBe(1);                               // ★发射位已接（摘 gore 调用=本案红）
    const c = captured[0];
    expect(c.type).toBe(331);
    expect(c.x === x0 || c.x === x1).toBe(true);                   // 位=盒左上+Next(w+1) 下沿 0
    expect(c.y === y0 || c.y === y1).toBe(true);
    expect(c.scale).toBe(0.4);                                     // Next(40,121)×0.01 下沿
    const ul = Math.hypot(-10, -10);
    expect(c.vx0).toBeCloseTo((-10 / ul) * 0.66 * 0.99, 12);       // 单位向（X×0.66）×Next(3,6)×0.33
    expect(c.vy0).toBeCloseTo((-10 / ul) * 0.99, 12);
    expect(c.ret.sticky).toBe(false);                              // :92464
    expect(c.ret.vx).toBeCloseTo(0.4, 12);                         // ×0.4（:92465）
    expect(c.ret.vy).toBeCloseTo(0.2, 12);                         // 2×0.4−0.6（:92466）
  });

  it('1/5 概率门：Math.random=0.2（≥1/5）→ 零发射且递减照走（:92455 Next(5)==0 门）', () => {
    const e = new Enemy('zombie', 100 * 16, 96 * 16);
    const game = makeGame15(flatWorld446());
    for (let i = 0; i < 12; i++) e.fixedUpdate(1 / 60, game);
    Math.random = () => 0.2;
    e.lovestruckT = 30;
    const { spy } = heartSpy446();
    e.fixedUpdate(1 / 60, game);
    expect(spy.mock.calls.filter(([id]) => id === 331).length).toBe(0);
    expect(e.lovestruckT).toBeCloseTo(30 - 1 / 60, 12);            // 倒数在门外恒走
  });

  it('canDisplayBuffs=false（P3-F1 门,FTW 石巨人面同位）→ 零发射且递减照走（门在发射前不在倒数前）', () => {
    const e = new Enemy('zombie', 100 * 16, 96 * 16);
    const game = makeGame15(flatWorld446());
    for (let i = 0; i < 12; i++) e.fixedUpdate(1 / 60, game);
    e.canDisplayBuffs = false;
    Math.random = () => 0;
    e.lovestruckT = 30;
    const { spy } = heartSpy446();
    e.fixedUpdate(1 / 60, game);
    expect(spy.mock.calls.filter(([id]) => id === 331).length).toBe(0);
    expect(e.lovestruckT).toBeCloseTo(30 - 1 / 60, 12);            // 块执行证明：递减已发生
  });
});
