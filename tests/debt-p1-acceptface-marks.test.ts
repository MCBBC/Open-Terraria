// ★清偿刀 P1（2026-09-29,C5 红蓝定谳四连）：标记/计数与受理面不齐——门拒敌不落标。
//   原版纪律（Terarria1457/Terraria/Projectile.cs）：标记/计数/局部表写入全部在
//   【受理块内】——免疫门 :12635-12641（`immune[owner]==0 | flag3`）与 :12598
//   （dontTakeDamage,本仓 Enemy.hurt 头门 :14040/:14046 同面承载）拒收 return 在
//   任何写尾之前;受理写支梯 :14031-14183（IDStatic :14032-14037 / usesLocal
//   :14175-14178 / 显型专支）与 numHits++（:14263）全在其后。四处同根：
//     ① 645 爆相 hitSet（LunarNebula.ts）——局部表写 :14175-14178 受理支内;旧档
//       首次重叠即永久标记 → 近战刚命中（iframes=10）站进爆区的敌全程零爆伤,
//       原版 10t 期满后下一子步照吃。
//     ② 856 前置拒收门读错域（SparkleGuitarProj.ts）——原版门=弹幕域 immune[owner]
//       （:12635-12641）;旧档读近战域簿 meleeNpcImmuneGateOf（:44598 仓内独立簿）
//       → 弹幕域有窗敌被放行:落 hitOnce.add+killStellarTune（触敌即亡）,原版=门拒
//       return 不落标、弹体存活可后继命中。修=门位归 T 刀单源快照判据。
//     ③ settleCritterHit 返真=hurt 已调（projTargets.ts）——原版 victim 循环对
//       critter 与敌怪同链,门拒小动物整体跳过（不耗 keepIterating/不计数 :14263）;
//       旧档残窗小动物被计入 pveNumHits/hitCritters 布尔（弹因此爆/亡）。
//     ④ 251 segImmuneUntil 前置（RainbowProj.ts）——perIDStatic 写 :14033-14036 仅
//       受理支;旧档 set 在门判定前 → 残窗敌被整段 10t 静态窗吞。
//   判别力：夹具全用真 Enemy.fromVanilla（门在真 hurt 内部,debt-r/t/w 同式）+
//   stub critter（门拒形态 hurt 返假镜像 Enemy.hurt 早退）。旧码下四面全红。
//   判别力补强（C5 发现 A,debt-r pierce 档零判别定谳）：见文件尾 describe——
//   -2 档在 634 AoE 面单变量不可观测（架构正确性判谳）,补「写支同链覆写」钉面。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Enemy } from '../src/entities/Enemy';
import { LunarFlareStar, NebulaBlazeBolt } from '../src/entities/LunarNebula';
import { SparkleGuitarProj } from '../src/entities/SparkleGuitarProj';
import { RainbowSegment } from '../src/entities/RainbowProj';
import { hitCritters, hitCrittersAll } from '../src/entities/projTargets';

interface StealCall { kind: string; dmg: number; numHits: number }
interface ImmuneCall { id: number; ticks: number }

function makeGame(log: StealCall[], list: Enemy[], rec: ImmuneCall[] = [],
  critters: unknown[] = [], player: Record<string, unknown> | null = null): GameHooks {
  return {
    world: new World(200, 200, 30, 'debt-p1'),
    player: (player ?? null) as unknown,
    enemies: () => list,
    critters: () => critters,
    entities: { nextId: 1, add: () => {} },
    playSfxFiles: () => {}, playSfx: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: () => null,
    noteNpcPlayerImmune: (id: number, ticks: number) => { rec.push({ id, ticks }); },
    applyLifeSteal: (kind: 'vampire' | 'ghost', dmg: number, numHits: number) => {
      log.push({ kind, dmg, numHits });
      return 0;
    },
  } as unknown as GameHooks;
}

/** 坦克桩敌（真 Enemy 管线,debt-r/t/w 同式;血量抬高避开死亡管线）。
 *  静止不 tick → iframes 残窗保持到判别窗口结束（衰减语义外置模拟）。 */
function tankEnemy(game: GameHooks, cx: number, cy: number, id: number): Enemy {
  const e = Enemy.fromVanilla(15, cx, cy)!;   // 僵尸：friendly=false/非转换族
  expect(e).toBeTruthy();
  e.id = id;
  e.maxHp = 5000;
  e.hp = 5000;
  (game as unknown as { enemies: () => Enemy[] }).enemies().push(e);
  return e;
}

// ================= ① 645 爆相 hitSet：门拒敌不落标,窗期满后照吃 =================

describe('清偿刀 P1 ①：645 爆相局部表写=受理支内（:14175-14178 门拒不落标）', () => {
  it('残窗敌爆相零伤且不落标：窗期满（iframes 归 0）后同星下一子步照吃爆伤（旧码=永久标记零伤,红）', () => {
    const log: StealCall[] = [];
    const game = makeGame(log, []);
    const e = tankEnemy(game, 84 * TILE, 100 * TILE, 61);
    e.iframes = 10;                                 // 近战刚命中残窗（他源 10t,不 tick 不衰减）
    const hp0 = e.hp;
    // 星落点=敌中心（debt-l 同式）：首子步 60px AI 索敌支转爆（:57987-58006 无免疫门）
    const star = new LunarFlareStar(e.cx - 5, e.cy - 5, 0, 0, 100, 4.5, e.cy + 15);
    star.critChance = 0;
    for (let t = 0; t < 3; t++) star.fixedUpdate(1, game);
    expect((star as unknown as { exploded: boolean }).exploded).toBe(true);   // 已进爆相
    expect(e.hp).toBe(hp0);                         // 残窗爆相门拒零伤（:12636,debt-l 同面）
    expect(log.length).toBe(0);                     // 门拒不 proc
    expect(star.pveNumHits).toBe(0);
    // 窗期满（敌 tick 衰减语义外置模拟）
    e.iframes = 0;
    for (let t = 0; t < 40 && !star.dead; t++) star.fixedUpdate(1, game);
    expect(e.hp).toBeLessThan(hp0);                 // ★主判别面：期满后照吃爆伤（旧码 hitSet 已永久标记=零伤红）
    expect(log.length).toBe(1);                     // proc 恰一（受理恰一跳）
    expect(log[0].kind).toBe('ghost');
    expect(star.pveNumHits).toBe(1);                // 局部表写=受理支内（:14175-14178,标后各子步 hitSet 跳过）
    expect(star.dead).toBe(true);                   // 爆相 126 update 寿尽
  });
});

// ================= ② 856 前置拒收门：弹幕域判据,门拒不落标+弹体存活 =================

describe('清偿刀 P1 ②：856 前置拒收门归弹幕域快照（:12635-12641,错域读退役）', () => {
  it('弹幕域残窗敌直击门拒：hitOnce 不落标+弹体存活;窗期满后同弹照结（旧码=触敌即亡+永久标记,红）', () => {
    const log: StealCall[] = [];
    const rec: ImmuneCall[] = [];
    // 桩 player（856 样条锚/LOS 消费——debt-w stubPlayer 同式）
    const game = makeGame(log, [], rec, [], {
      cx: 1600, cy: 1600, x: 1600 - 10, y: 1600 - 21, w: 20, h: 42,
      slowMagicUse: false, getSlowMagicUseTime: (n: number) => n, addDPS: () => {},
    });
    const e = tankEnemy(game, 0, 0, 71);
    e.w = 600; e.h = 140;                           // 宽盒 1800..2400 × 1530..1670（样条 t01≈0.24..0.83 全程盒内）
    e.x = 1800; e.y = 1600 - 70;
    e.iframes = 10;                                 // 他弹残窗（弹幕域）——旧码读近战域簿（空）=误放行
    const s = new SparkleGuitarProj(1600, 1600, 800, 0, 100, 2000, 1600);
    s.critChance = 0;
    for (let t = 0; t < 15; t++) s.fixedUpdate(1, game);   // 45 子步,t01=0.5 深入盒内（重叠自 t01≈0.24/tick8 起）
    expect(s.dead).toBe(false);                     // ★门拒不 Kill（原版 return 不落任何写尾,弹体存活）
    expect(e.hp).toBe(5000);                        // 零伤
    expect(log.length).toBe(0);                     // 不 proc
    expect(rec.length).toBe(0);                     // 不落写尾（含近战域桥）
    // 窗期满 → 同弹（hitOnce 空=首轮未落标）后继子步照结（原版弹体存活可后继命中）
    e.iframes = 0;
    for (let t = 0; t < 40 && !s.dead; t++) s.fixedUpdate(1, game);
    expect(s.dead).toBe(true);                      // 受理命中 penetrate-- →0 同拍 Kill（爆裂轮 hitOnce 已标不双扣）
    expect(e.hp).toBeLessThan(5000);
    expect(log.length).toBe(1);
    expect(log[0].numHits).toBe(0);                 // 直击首跳 0 档（proc 读自增前值）
    expect(s.pveNumHits).toBe(1);
  });
});

// ================= ③ settleCritterHit：门拒小动物整体跳过（不计数不耗弹） =================

/** stub critter（hurt 形态镜像 Enemy.hurt：门拒=iframes>0/dontTakeDamage 早退返假;
 *  一击即死=返真+dead 置位（lifeMax=5 族）;非门拒返假=血尽级联/普通未致命尾档
 *  （黑化 critter lifeMax 25 吃 5 伤存活形态）） */
function mkCritter(x: number, y: number, opts: { iframes?: number; dontTakeDamage?: boolean;
  landed?: boolean } = {}) {
  const c = {
    x, y, w: 18, h: 20, dead: false,
    iframes: opts.iframes ?? 0,
    dontTakeDamage: opts.dontTakeDamage === true,
    calls: 0,
    hurt(): boolean {
      c.calls++;
      if (opts.landed !== false) c.dead = true;   // 受理即死（一击致死族,单源 dead 门承载去重）
      return opts.landed !== false;
    },
  };
  return c;
}

describe('清偿刀 P1 ③：settleCritterHit 受理面判据（门拒=返假不计数,与敌怪同面）', () => {
  it('残窗小动物：hitCritters false/hitCrittersAll 0（不计数）;dontTakeDamage 同面', () => {
    const cG = mkCritter(1280, 1600, { iframes: 10, landed: false });   // 门拒形态（hurt 返假）
    const game = makeGame([], [], [], [cG]);
    const box = { x: 1270, y: 1590, w: 40, h: 40, projId: 634 };
    expect(hitCritters(box, game, undefined)).toBe(false);              // ★门拒不耗弹（旧码 true=红）
    expect(cG.calls).toBe(1);                                           // hurt 被调（门在 hurt 头部,与敌怪同构）
    const cG2 = mkCritter(1280, 1600, { iframes: 10, landed: false });
    (game as unknown as { critters: () => unknown[] }).critters = () => [cG2];
    expect(hitCrittersAll(box, game, undefined)).toBe(0);               // ★不计数（:14263 门拒不达）
    expect(cG2.calls).toBe(1);
    const cD = mkCritter(1280, 1600, { dontTakeDamage: true, landed: false });
    (game as unknown as { critters: () => unknown[] }).critters = () => [cD];
    expect(hitCrittersAll(box, game, undefined)).toBe(0);
  });

  it('对照臂：一击即死（返真）照计数;非门拒返假（黑化存活形态）照计数=受理（勿过修）', () => {
    const cKill = mkCritter(1280, 1600, { landed: true });              // 一击即死（lifeMax=5 族）
    const game = makeGame([], [], [], [cKill]);
    const box = { x: 1270, y: 1590, w: 40, h: 40, projId: 634 };
    expect(hitCrittersAll(box, game, undefined)).toBe(1);               // 受理入账（:14263）
    const cTail = mkCritter(1280, 1600, { landed: false });             // 黑化存活形态（返假非门拒）
    (game as unknown as { critters: () => unknown[] }).critters = () => [cTail];
    expect(hitCrittersAll(box, game, undefined)).toBe(1);               // ★返假非门拒=受理（血尽级联/尾档族）
    expect(hitCritters(box, game, undefined)).toBe(true);
  });

  it('端到端 634：残窗小动物重叠飞行盒不爆不计数（弹续飞）;对照无窗小动物照爆', () => {
    const log: StealCall[] = [];
    const game = makeGame(log, [], [], [mkCritter(1290, 1610, { iframes: 10, landed: false })]);
    const b1 = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 0, 0, 130, 3, 634);
    b1.critChance = 0;
    b1.fixedUpdate(1, game);
    expect(b1.dead).toBe(false);                    // ★门拒不爆（旧码 hitCritters true→burst 红）
    expect(b1.pveNumHits).toBe(0);
    // 对照：无窗小动物 → 受理 → 飞行盒爆（penetrate 1→0 :14196 → Kill :17312 同相）
    const game2 = makeGame([], [], [], [mkCritter(1290, 1610, { landed: true })]);
    const b2 = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 0, 0, 130, 3, 634);
    b2.critChance = 0;
    b2.fixedUpdate(1, game2);
    expect(b2.dead).toBe(true);
    expect(b2.pveNumHits).toBe(1);
  });
});

// ================= ④ 251 perIDStatic 写=受理支内：残窗不吞静态窗 =================

describe('清偿刀 P1 ④：251 静态表写=受理支内（:14033-14036 门拒不落标）', () => {
  it('残窗敌首拍门拒零伤且【不落静态标】：窗期满后同段照吃;受理后 10t 静态窗照节流（旧码=set 前置永久吞,红）', () => {
    const log: StealCall[] = [];
    const rec: ImmuneCall[] = [];
    const game = makeGame(log, [], rec);
    const e = tankEnemy(game, 80 * TILE, 100 * TILE, 81);
    e.iframes = 10;                                 // 他源残窗
    const seg = new RainbowSegment(e.cx, e.cy, 1, 0, 100, 2);
    seg.critChance = 0;
    seg.fixedUpdate(1 / 60, game);
    expect(e.hp).toBe(5000);                        // 门拒零伤（:12636）
    expect(e.iframes).toBe(10);                     // 残窗原样
    expect(log.length).toBe(0);
    expect(rec.length).toBe(0);                     // 写尾不落
    // 窗期满 → 同段（segImmuneUntil 空=首轮未落标——★本刀判别主面）照吃
    e.iframes = 0;
    const hp1 = e.hp;
    seg.fixedUpdate(1 / 60, game);
    expect(e.hp).toBeLessThan(hp1);                 // 旧码：首轮已 set → 静态窗整段吞 → 零伤红
    expect(e.iframes).toBe(0);                      // 受理写尾=IDStatic 清零档（W 刀面）
    expect(rec).toContainEqual({ id: 81, ticks: 0 });
    expect(log.length).toBe(1);
    expect(seg.pveNumHits).toBe(1);
    // 受理已落标 → 10t 静态共享窗照节流（:12598 flag2 读门;real-time 10t 未满）
    seg.fixedUpdate(1 / 60, game);
    expect(seg.pveNumHits).toBe(1);                 // 静态窗内不再吃（节流面回归钉）
    expect(log.length).toBe(1);
  });
});

// ================= C5 发现 A：debt-r pierce 档判别力补强（定谳钉面） =================

describe('C5 发现 A 定谳：634 AoE pierce 档单变量不可观测（弹侧补写=窗值唯一有效定者）', () => {
  // 定谳链（Enemy.ts pierce 消费者全表,grep 亲证）：
  //   门 :14040 `pierce !== 1 && iframes > 0`——-2 与 0 同臂（均不豁免）,无差;
  //   写支 :14232-14233（假人支）/:14346-14347（通用支）——唯一两处分档点;
  //   634 AoE 面（LunarNebula.burst）：门位读=T 刀【前置快照】（hurt 前状态,写支
  //   不可达）;受理路径 hurt 返回后【同链同步】补写 iframes=5——补写前的中间
  //   10t（pierce=0 形态）零读者（strike 返值弃/proc 读 lastStrikeDealt/无 tick 边界）;
  //   门拒路径 hurt 在写支前早退（:14040/:14046）,两档同样零写。
  //   ⇒ -2↔0 单变量在当前架构完全不可观测,M5 变异全绿=架构正确性的正确表现
  //   （判别力债【不成立,销案】;-2 档本体判别由其另一消费位 567/568 孢子云承载:
  //   bj340-single-hit-window ②/sw-fx1-accessories 云命中窗）。本组钉的是该判谳的
  //   可观测承重半面：「hurt 内写支被同链补写覆写」——若未来撤弹侧补写,此面红。
  it('补写为窗值唯一定者：hurt 内写 10（pierce=0 形态写面）被弹侧 5t 补写同链覆写', () => {
    const log: StealCall[] = [];
    const game = makeGame(log, []);
    const a = tankEnemy(game, 81 * TILE, 100 * TILE, 91);           // 飞行盒面（debt-r A 靶,回归钉）
    // B 靶（debt-r 纯 AoE 几何）：hurt 桩内联模拟 pierce=0 通用尾档写支（Enemy.ts:14346-47）
    const b = {
      id: 92, x: 0, y: 0, w: 18, h: 42, dead: false, iframes: 0,
      maxHp: 5000, hp: 5000, lastStrikeDealt: 0,
      hurt(this: { iframes: number; hp: number; lastStrikeDealt: number }, dmg: number,
        _kx: number, _ky: number, _g: GameHooks, _pen: number, _crit: boolean,
        pierce: number): boolean {
        if (pierce !== 1 && this.iframes > 0) return false;         // 门（Enemy.ts:14040 同式）
        // ★受理写面无条件写 10（=pierce=0 通用尾档 Enemy.ts:14346-47 的写面模拟,
        //  不随实际档位分支——复合钉面：即便 hurt 内写支写了 10,弹侧补写 5 同链覆写）
        this.iframes = 10;
        this.hp -= dmg;
        this.lastStrikeDealt = dmg;
        return false;                                               // 普通未致命尾档返假（受理）
      },
    };
    b.x = 1277 - b.w;
    b.y = 1620 - b.h / 2;
    (game as unknown as { enemies: () => unknown[] }).enemies().push(b as never);
    const bolt = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 0, 0, 130, 3, 634);
    bolt.critChance = 0;
    for (let t = 0; t < 40 && !bolt.dead; t++) bolt.fixedUpdate(1, game);
    expect(b.hp).toBeLessThan(5000);                // 受理
    expect(b.iframes).toBe(5);                      // ★承重面：写支 10 被补写 5 覆写（:14080-14082 专支终值）
    expect(a.iframes).toBe(5);                      // 真 Enemy 面（debt-r 主判据回归）
    expect(log.length).toBe(2);                     // 双面 proc 照达（快照门读不受写支污染）
    expect(bolt.pveNumHits).toBe(2);
  });
});
