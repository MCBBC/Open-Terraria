// ★清偿刀 W（2026-09-29,X4-债13）：弹幕域写面档位三弹判别测试（清偿刀 T 读侧快照
//   X4-债12 之写面残差收口,弹幕域末刀）。
//   病灶：251/632/856 三弹受理尾全走 Enemy.hurt 通用尾档（pierce=0 → iframes=10,
//   Enemy.ts:14297-14298）,与原版写梯（Terarria1457/Terraria/Projectile.cs）三支不符：
//     251 :14032-14037 IDStatic 支   → immune[owner]=0（节流归 perIDStatic 10t 共享表）
//     632 :14056-14058 显型专支      → immune[owner]=GetSlowMagicUseTime(5)（常态 5t/
//                                      蓝空过载 slowMagicUse ×2.5=12t,Player.cs:47425）
//     856 :14175-14178 usesLocal 支  → immune[owner]=0（节流归弹内局部表 cd=-1）
//   旧码两向偏差：
//     ① 251/856 写 10t：251=静态期内误拦他型弹（原版单表跨弹语义,Arrow B6D 刀②
//        Arrow.ts:9445 同范式清窗缺口）；856=背靠背二奏 10t 内被 hurt 头门
//        （Enemy.ts:13991 `pierce!==1 && iframes>0`）整拒——零伤（节流本就由 hitOnce
//        〔localNPCHitCooldown=-1 每敌终生一跳〕承载,10t 全局窗纯多余）；
//     ② 632 写 10t：hitCd 5t 期满后 5..10t 段再命中被头门整拒——真机再命中节拍
//        10t vs 原版 5t（DPS 半折）。
//   落刀形态（R 刀「豁免/专支档+弹侧补写」范式推广,Enemy.ts 写支零改动）：
//     251 pierce=0 保持+B6D 式受理面清窗（iframes=0）+近战域桥写（face=idStatic→0）；
//     632 pierce=0 保持+受理面双域写 win=GetSlowMagicUseTime(5)（hitCd 同源单值）；
//     856 pierce=-3（usesLocal 族清零档,Enemy.ts:14297 现役,BJ398 656 先例）+受理面
//        近战域桥写（face=usesLocal→0 出表）——旧 sparkImmuneWindowClear 无条件裸清
//        退役（拒收跳也清=over-clear,现归受理面=拒收不落任何写尾）。
//   判别力：夹具全用真 Enemy.fromVanilla（门/写支在真 hurt 内部,debt-r/t 同式）——
//   旧码下 251 iframes=10+他弹拒收红、632 iframes=10 红、856 二奏零伤+iframes=10 红;
//   新码全绿。门拒面（外源残窗）零回归=拒收零伤零 proc 零写尾。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Enemy } from '../src/entities/Enemy';
import { RainbowSegment } from '../src/entities/RainbowProj';
import { PrismProng } from '../src/entities/PrismProj';
import { SparkleGuitarProj } from '../src/entities/SparkleGuitarProj';

interface StealCall { kind: string; dmg: number; numHits: number }
interface ImmuneCall { id: number; ticks: number }

/** 桩 player（632 慢施换算/856 样条与 LOS 消费；addDPS=真 hurt fromPlayer 支必需） */
function stubPlayer(slowMagic: boolean): Record<string, unknown> {
  return {
    cx: 1600, cy: 1600, x: 1600 - 10, y: 1600 - 21, w: 20, h: 42,
    slowMagicUse: slowMagic,
    getSlowMagicUseTime: (n: number) => (slowMagic ? Math.trunc(2.5 * n) : n),
    addDPS: () => {},
  };
}

function makeGame(log: StealCall[], list: Enemy[], rec: ImmuneCall[],
  player: Record<string, unknown> | null): GameHooks {
  return {
    world: new World(200, 200, 30, 'debt-w'),
    player: (player ?? null) as unknown,
    enemies: () => list,
    critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfxFiles: () => {}, playSfx: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: () => null,
    // ★GC1 近战域表记录器（noteVanillaProjImmune 桥出口消费;id,0=出表/N=登记窗）
    noteNpcPlayerImmune: (id: number, ticks: number) => { rec.push({ id, ticks }); },
    applyLifeSteal: (kind: 'vampire' | 'ghost', dmg: number, numHits: number) => {
      log.push({ kind, dmg, numHits });
      return 0;
    },
  } as unknown as GameHooks;
}

/** 坦克桩敌（真 Enemy 管线,debt-r/t 同式;血量抬高避开死亡管线=判别面只看门+写支）。
 *  静止不 tick → iframes 残窗保持到判别窗口结束。 */
function tankEnemy(game: GameHooks, cx: number, cy: number, id: number): Enemy {
  const e = Enemy.fromVanilla(15, cx, cy)!;   // 僵尸：friendly=false/非转换族
  expect(e).toBeTruthy();
  e.id = id;
  e.maxHp = 5000;
  e.hp = 5000;
  (game as unknown as { enemies: () => Enemy[] }).enemies().push(e);
  return e;
}

/** 632 束面靶（放大盒钉进光束带：束自棱镜 (1300,1600) 向 +x,厚 30.8,束长 1800） */
function beamEnemy(game: GameHooks, id: number): Enemy {
  const e = tankEnemy(game, 0, 0, id);
  e.w = 140; e.h = 140;
  e.x = 1500; e.y = 1600 - 70;               // 盒 1500..1640 × 1530..1670
  return e;
}

describe('清偿刀 W：写面档位三弹（251 IDStatic 清零/632 专支 5t/856 usesLocal 清零）', () => {
  it('251 受理写 0（:14032-14037 IDStatic 支）：全局窗清零+近战域出表——静态期内他弹照达', () => {
    const log: StealCall[] = []; const rec: ImmuneCall[] = [];
    const game = makeGame(log, [], rec, null);
    const e = tankEnemy(game, 80 * TILE, 100 * TILE, 1);
    const seg = new RainbowSegment(e.cx, e.cy, 1, 0, 100, 2);
    seg.critChance = 0;
    seg.fixedUpdate(1, game);
    expect(e.hp).toBeLessThan(5000);                    // 受理
    expect(e.iframes).toBe(0);                          // ★主判别（旧码=10 红）
    expect(rec).toContainEqual({ id: 1, ticks: 0 });    // ★近战域出表（桥 face=idStatic→0）
    expect(log.length).toBe(1);                         // proc 照达
    expect(log[0].kind).toBe('ghost');
    // 残窗（segImmuneUntil 10t 静态窗仍在）内他型弹照达：通用 pierce=0 通道直调
    // =他弹 hurt 头门同式读 iframes——旧码 iframes=10 → 门拒零伤（红）
    const hp1 = e.hp;
    e.hurt(10, 0, 0, game, 0, false, 0, true);
    expect(e.hp).toBeLessThan(hp1);
  });

  it('251 外源残窗拒收：零伤+窗原样+proc/写尾全不落（受理面化钉）', () => {
    const log: StealCall[] = []; const rec: ImmuneCall[] = [];
    const game = makeGame(log, [], rec, null);
    const e = tankEnemy(game, 84 * TILE, 100 * TILE, 2);
    e.iframes = 8;                                      // 他源残窗
    const seg = new RainbowSegment(e.cx, e.cy, 1, 0, 100, 2);
    seg.critChance = 0;
    seg.fixedUpdate(1, game);
    expect(e.hp).toBe(5000);                            // 门拒零伤
    expect(e.iframes).toBe(8);                          // 残窗原样
    expect(log.length).toBe(0);                         // proc 不达
    expect(rec.length).toBe(0);                         // 写尾不落（拒收 return 在梯前）
  });

  it('632 受理写 GetSlowMagicUseTime(5)（:14056-14058 专支）：常态 5t 非 10t 尾档', () => {
    const log: StealCall[] = []; const rec: ImmuneCall[] = [];
    const game = makeGame(log, [], rec, stubPlayer(false));
    const e = beamEnemy(game, 1);
    const prong = new PrismProng(0, 100, 3);
    prong.critChance = 0;
    prong.parent = { dead: false, charge: 180, dirX: 1, dirY: 0, cx: 1300, cy: 1600 } as never;
    prong.fixedUpdate(1, game);
    expect(e.hp).toBeLessThan(5000);                    // 受理
    expect(e.iframes).toBe(5);                          // ★主判别（旧码=10 红）
    expect(rec).toContainEqual({ id: 1, ticks: 5 });    // 近战域同值（桥慢施换算缺省 5）
    expect(log.length).toBe(1);                         // proc 照达
  });

  it('632 蓝空过载（slowMagicUse）×2.5=12t（GetSlowMagicUseTime 换算,hitCd 同源单值）', () => {
    const log: StealCall[] = []; const rec: ImmuneCall[] = [];
    const game = makeGame(log, [], rec, stubPlayer(true));
    const e = beamEnemy(game, 2);
    const prong = new PrismProng(0, 100, 3);
    prong.critChance = 0;
    prong.parent = { dead: false, charge: 180, dirX: 1, dirY: 0, cx: 1300, cy: 1600 } as never;
    prong.fixedUpdate(1, game);
    expect(e.hp).toBeLessThan(5000);
    expect(e.iframes).toBe(12);                         // ★(int)(2.5×5)=12（旧码=10 红）
    expect(rec).toContainEqual({ id: 2, ticks: 12 });   // 桥同源换算
  });

  it('856 受理写 0（:14175-14178 usesLocal 支）：背靠背二奏 10t 内照达（旧 pierce=0 写 10=头门整拒）', () => {
    const log: StealCall[] = []; const rec: ImmuneCall[] = [];
    const game = makeGame(log, [], rec, stubPlayer(false));
    const e = tankEnemy(game, 0, 0, 1);
    e.w = 140; e.h = 140;
    e.x = 2000 - 70; e.y = 1600 - 70;                   // 盒 1930..2070 × 1530..1670
    // 一奏：出手点=玩家中心 (1600,1600),锚=敌心 (2000,1600),v=dist×2=(800,0)
    // ——CatmullRom 水平直线,t01≈0.24（子步 ~22,tick ~8）入盒直击
    const s1 = new SparkleGuitarProj(1600, 1600, 800, 0, 100, 2000, 1600);
    s1.critChance = 0;
    for (let t = 0; t < 40 && !s1.dead; t++) s1.fixedUpdate(1, game);
    expect(s1.dead).toBe(true);
    expect(e.hp).toBeLessThan(5000);                    // 一奏受理
    expect(e.iframes).toBe(0);                          // ★清零档（旧码=10 红）
    expect(rec).toContainEqual({ id: 1, ticks: 0 });    // 近战域出表
    // 二奏（新弹实例,hitOnce 空）：旧码 iframes=10 → hurt 头门整拒零伤（红）
    const hp1 = e.hp;
    const s2 = new SparkleGuitarProj(1600, 1600, 800, 0, 100, 2000, 1600);
    s2.critChance = 0;
    for (let t = 0; t < 40 && !s2.dead; t++) s2.fixedUpdate(1, game);
    expect(e.hp).toBeLessThan(hp1);                     // ★二奏照达
    expect(log.length).toBe(2);                         // 两奏 proc 各一
  });

  it('856 外源残窗拒收：零伤+窗原样+proc/写尾全不落（pierce=-3 门照走,清窗已归受理面）', () => {
    const log: StealCall[] = []; const rec: ImmuneCall[] = [];
    const game = makeGame(log, [], rec, stubPlayer(false));
    const e = tankEnemy(game, 0, 0, 2);
    e.w = 140; e.h = 140;
    e.x = 2000 - 70; e.y = 1600 - 70;
    e.iframes = 6;                                      // 他源残窗
    const s = new SparkleGuitarProj(1600, 1600, 800, 0, 100, 2000, 1600);
    s.critChance = 0;
    for (let t = 0; t < 40 && !s.dead; t++) s.fixedUpdate(1, game);
    expect(e.hp).toBe(5000);                            // 门拒零伤
    expect(e.iframes).toBe(6);                          // 残窗原样
    expect(log.length).toBe(0);                         // proc 不达
    expect(rec.length).toBe(0);                         // ★旧无条件清窗在此=over-clear 红面
  });
});
