// ⑧Shimmer() 弹幕微光行为·实体族接面回归（2026-09-07 缺面清单清偿批）
//   缺面登记清单（projWetSection.ts 头注）五族接入后的行为钉：
//     · GrenadeProj（aiStyle 16 → 弹反族 A 支 P.cs:22606-22625：深浸双格 Kill/
//       vy>0 弹反+timeLeft≡fuse 600 钳+−60/shimmerWet·wet 双清;655 蜂巢 aiStyle 25
//       → 召唤浮升支 :22707-22718;75/303/681 原版 hostile=true → 头门 :22566 拦）
//     · FlailProj（aiStyle 15 → 链球支 :22643-22654：vy>0 弹反+−0.4 钳 ≥−8,
//       【旗不清】无 timeLeft 面;ai[0]≡st）
//     · YoyoProj / CounterweightProj（aiStyle 99 → 悠悠球支 :22656-22668：vy>0
//       弹反+双清旗+vy>-8 → -8 强制上收;ai[0]==-1 回收态头门拦,-2 脱离照跑）
//     · 相刃 1059-1102（Boomerang 承载,aiStyle 3 域缺省支外唯 IsAPhaseblade 支
//       :22587-22604：ai[0]==1 返回态早退;ai[1]=ai[0]=0 复位+vy 浮升+vx×1.1 钳 ±14）
//   调用位 = projWetSection.projectileWetSection 的 hooks.shimmer（湿段 :16903-17113
//   后/:17114 位次,`if (!ignoreWater)` 整段门【外】——豁免弹亦驱动,共享体两支路
//   已收口;分派骨架本体=tests/proj-shimmer-step.test.ts,本文件只钉【接面】）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import {
  GrenadeProj, FlailProj, YoyoProj, CounterweightProj, Boomerang,
} from '../src/entities/WeaponProj';

const ROOT = join(__dirname, '..');

// ---- 微光液池：列 [30..40] 行 [60..70]（px [480,656]×[960,1136]）,amount 可调
//      （深浸判定 = 弹所在格 liquid==255 满格 + 上一格 >0,双格均 SHIMMER 型）----
function mkShimmerWorld(amount: number): World {
  const w = new World(120, 160, 30, 'open');
  w.clock.timeOfDay = 0;
  for (let x = 30; x <= 40; x++) {
    for (let y = 60; y <= 70; y++) {
      const i = w.store.idx(x, y);
      w.store.liquid[i] = amount;
      w.store.liquidType[i] = 4;   // LIQUID_TYPE.SHIMMER（原版 LiquidID+1 编码）
    }
  }
  return w;
}

function mkGame(w: World, px = 20 * TILE, py = 30 * TILE): { g: GameHooks; w: World; player: Player } {
  const pl = new Player(px, py, new Inventory());
  const g = {
    world: w,
    player: pl,
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDust: () => ({ vx: 0, vy: 0, scale: 1, alpha: 0, noGravity: false, color: null }),
    playSfxWav: () => {}, playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {},
    cutTile: () => {}, spawnDrop: () => null, damagePlayer: (): number => 0,
    addDamageNumber: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    notifyInventoryChanged: () => {}, mapFullscreen: () => false,
    spawnFriendlyProj: () => {}, addLightAt: () => {},
  } as unknown as GameHooks;
  return { g, w, player: pl };
}

type Wet = { wetSectionStep(g: GameHooks): void };
const wetStep = (e: object, g: GameHooks): void => (e as Wet).wetSectionStep(g);

// =====================================================================
// GrenadeProj（aiStyle 16 → 弹反族 A;655 → 25 支;75 → 头门）
// =====================================================================
describe('GrenadeProj shimmer 接面（弹反族 A + 655 召唤浮升 + 75 头门）', () => {
  it('浅浸弹反：vy>0 → ×-1 + fuse 600 钳/−60 + shimmerWet/wet 双清（:22613-22620）', () => {
    const h = mkGame(mkShimmerWorld(100));           // amount 100 → 非满格=非深浸
    let boom = 0;
    const e = new GrenadeProj(520, 1024, 0, 2, 30, 180, 28, () => { boom++; });
    wetStep(e, h.g);                                  // 首拍=出生预置（池内→shimmerWet）+shimmer 步
    expect(e.vy).toBe(-2);                            // :22613 弹反
    expect(e.fuse).toBe(120);                         // 180≤600 不触钳 → −60（timeLeft 面≡fuse）
    expect(e.shimmerWet).toBe(false);                 // :22619
    expect(e.wet).toBe(false);                        // :22620
    expect(e.dead).toBe(false);
    expect(boom).toBe(0);                             // 浅浸无 Kill
  });
  it('fuse>600 钳 600 再 −60（:22615-22618）', () => {
    const h = mkGame(mkShimmerWorld(100));
    const e = new GrenadeProj(520, 1024, 0, 2, 30, 900, 37, () => {});
    wetStep(e, h.g);
    expect(e.fuse).toBe(540);                         // 900>600 → 600 → −60
    expect(e.vy).toBe(-2);
  });
  it('深浸双格满微光液柱 → Kill=onExplode 弹体消亡（:22608-22610,Kill 支不动速度）', () => {
    const h = mkGame(mkShimmerWorld(255));            // 满格液柱 → 双格判定成立
    const booms: Array<[number, number]> = [];
    const e = new GrenadeProj(520, 1024, 0, 2, 30, 180, 28,
      (x, y) => { booms.push([x, y]); });
    expect(e.dead).toBe(false);
    wetStep(e, h.g);
    expect(e.dead).toBe(true);                        // 弹体 Kill 配方（dead+destroy+onExplode）
    expect(booms.length).toBe(1);                     // 爆炸面走 onExplode（Kill 等价,本类既案）
    expect(booms[0][0]).toBe(531);                    // 爆心=盒中心 x+w/2（28 盒 22×22 → 520+11）
    expect(e.vy).toBe(2);                             // Kill 支不改速度（if/else 互斥,原版同）
  });
  it('特案 75 快乐炸弹（原版 hostile=true :1557）→ 头门 :22566 拦=零微光行为', () => {
    const h = mkGame(mkShimmerWorld(100));
    const e = new GrenadeProj(520, 1024, 0, 2, 60, 180, 75, () => {});
    wetStep(e, h.g);
    expect(e.vy).toBe(2);                             // 弹反不跑
    expect(e.fuse).toBe(180);                         // timeLeft 面不动
    expect(e.shimmerWet).toBe(true);                  // 双清不跑（旗维持原版 hostile 弹态）
    expect(e.wet).toBe(true);
  });
  it('特案 655 蜂巢（friendly+hostile 双标,aiStyle 25 头门豁免）→ 召唤浮升支照跑（:22707-22712）', () => {
    const h = mkGame(mkShimmerWorld(100));
    const e = new GrenadeProj(520, 1024, 0, 12, 10, 3600, 655, () => {});
    wetStep(e, h.g);
    expect(e.vy).toBeCloseTo(12 * 0.97 - 0.7, 5);     // >10 先 ×0.97 再 −0.7
    expect(e.shimmerWet).toBe(true);                  // 25 支无双清
    expect(e.fuse).toBe(3600);                        // 无 timeLeft 面
    expect(e.dead).toBe(false);
  });
});

// =====================================================================
// FlailProj（aiStyle 15 → 链球支,旗不清;ai[0]≡st）
// =====================================================================
describe('FlailProj shimmer 接面（链球支 :22643-22654）', () => {
  it('弹反+旗不清（与弹反族 A/99 的分野）——差分对拍:微光池 vs 水池同 AI 位', () => {
    const run = (type: number): { vy: number; shimmerWet: boolean; wet: boolean } => {
      const h = mkGame(mkShimmerWorld(255), 508, 1010);   // 玩家贴池（链 AI 手位/近距）
      if (type === 1) {                               // 对照组:同几何改水带
        for (let x = 30; x <= 40; x++) {
          for (let y = 60; y <= 70; y++) {
            const i = h.w.store.idx(x, y);
            h.w.store.liquidType[i] = 1;              // LIQUID_TYPE.WATER
          }
        }
      }
      let held = false;
      // 光标在弹下方 → 掷出向（st0→1 转换掷速）向下,v 过 AI（case1 重力同向）仍 >0
      const f = new FlailProj(520, 1024, 10, 1, 25, () => held, () => ({ x: 528, y: 1200 }));
      f.fixedUpdate(1 / 60, h.g);
      return { vy: f.vy, shimmerWet: f.shimmerWet, wet: f.wet };
    };
    const shimmer = run(4);
    const water = run(1);
    expect(water.vy).toBeGreaterThan(0);              // 对照组无微光行为（AI 终速下坠）
    // :22645-22650 弹反 + −0.4;本例 AI 终速 >8 → 触 :22651-22653 钳 ≥-8
    expect(shimmer.vy).toBe(Math.max(-water.vy - 0.4, -8));
    expect(shimmer.shimmerWet).toBe(true);            // :22643 支【无双清】（链球留微光域）
    expect(shimmer.wet).toBe(true);
  });
  it('头门:st=4 回收态（ai[0]==4）早退=零微光行为（:22566）', () => {
    const h = mkGame(mkShimmerWorld(255));            // 玩家远位（近手回收 Kill 会跳过湿段）
    let held = true;                                  // 按住 → 回收态
    const f = new FlailProj(520, 1024, 10, 1, 25, () => held, () => ({ x: 528, y: 1200 }));
    (f as unknown as { st: number }).st = 4;
    f.vy = 2;
    f.fixedUpdate(1 / 60, h.g);
    expect(f.dead).toBe(false);
    expect(f.shimmerWet).toBe(true);                  // 头门拦 → 旗面无消费（对照:99 支会双清）
    expect(f.wet).toBe(true);
    // 弹反未跑：回收态 AI 自有 vy 编辑,此处只钉旗面（分派本体已由 proj-shimmer-step 钉）
  });
});

// =====================================================================
// YoyoProj / CounterweightProj（aiStyle 99 → 悠悠球支,双清旗+强制上收）
// =====================================================================
describe('YoyoProj shimmer 接面（悠悠球支 :22656-22668）', () => {
  it('活跃态:弹反+双清旗+钳 −8（:22659-22667）', () => {
    const h = mkGame(mkShimmerWorld(100), 508, 1010); // 玩家贴池（免 overRange 召回）
    const cur = { x: 520 + 8, y: 1024 + 8 };          // 光标=球心 → 死区（AI ×0.8 可预期）
    const y = new YoyoProj(520, 1024, 10, 0, 541, 0, () => true, () => cur);
    y.vy = 10;                                        // 下坠态（AI 死区 ×0.8 → 8 仍 >0）
    y.fixedUpdate(1 / 60, h.g);
    expect(y.vy).toBe(-8);                            // 弹反后 >-8 → 钳 -8（强制上收）
    expect(y.shimmerWet).toBe(false);                 // :22661
    expect(y.wet).toBe(false);                        // :22662
  });
  it('头门:ai[0]==-1 回收态早退=旗不清（:22566;-2/-3 不拦=原版只拦 -1）', () => {
    const h = mkGame(mkShimmerWorld(100), 508, 1010);
    const y = new YoyoProj(520, 1024, 10, 0, 541, 0, () => false, () => ({ x: 520, y: 1200 }));
    (y as unknown as { ai0: number }).ai0 = -1;       // 回收态（松手）
    y.vy = 10;
    y.fixedUpdate(1 / 60, h.g);
    expect(y.shimmerWet).toBe(true);                  // 头门拦 → 双清未跑
    expect(y.wet).toBe(true);
  });
});

describe('CounterweightProj shimmer 接面（99 支补遗:556-561/1079 同 DefaultToYoyo）', () => {
  it('脱离态（-2,头门不拦）:弹反+双清旗（:22659-22662）', () => {
    // ★amount 255：配重球 10×10 盒的湿检缩减盒仅 5px 高（Collision.cs:1578 缩减盒）,
    // amount 100 液面下探 9.75px → 探测盒悬于液面=不湿（ GrenadeProj 22 盒可触,差异面）
    const h = mkGame(mkShimmerWorld(255), 508, 1010);
    const cw = new CounterweightProj(520, 1024, 10, 1, 556, 0, {
      owner: () => h.player as never,
      channel: () => true,                            // 按住（false → AI 强转回收态,头门误拦）
      yoyoInPlay: () => true,
      mouseDelta: () => ({ dx: 0, dy: 0 }),
    } as never);
    (cw as unknown as { ai0: number }).ai0 = -2;      // 脱离坠落态（原版只拦 -1）
    cw.vy = 10;
    cw.fixedUpdate(1 / 60, h.g);
    expect(cw.vy).toBeLessThan(0);                    // 弹反已跑（无微光支时 AI 后 vy>0）
    expect(cw.shimmerWet).toBe(false);                // :22661 双清
    expect(cw.wet).toBe(false);
  });
  it('头门:ai[0]==-1 回收态早退=旗不清（:22566）', () => {
    const h = mkGame(mkShimmerWorld(255), 508, 1010);   // 255=湿检缩减盒可达液面（同上注）
    const cw = new CounterweightProj(520, 1024, 10, 1, 556, -1, {
      owner: () => h.player as never,
      channel: () => false,
      yoyoInPlay: () => true,
      mouseDelta: () => ({ dx: 0, dy: 0 }),
    } as never);
    cw.vy = 10;
    cw.fixedUpdate(1 / 60, h.g);
    expect(cw.shimmerWet).toBe(true);
    expect(cw.wet).toBe(true);
  });
});

// =====================================================================
// 相刃族（Boomerang 承载 1059-1102;aiStyle 3 域缺省支外唯相刃支）
// =====================================================================
describe('Boomerang shimmer 接面（相刃支 :22587-22604）', () => {
  it('出程态（ai0=2 悬停非门内）:ai[1]/ai[0] 复位 + vy 浮升 + vx×1.1（:22592-22601）', () => {
    const h = mkGame(mkShimmerWorld(100));
    const b = new Boomerang(520, 1024, 0, 3, 10, 0, 1059);
    (b as unknown as { ai0: number }).ai0 = 2;        // 悬停态（只拦 1 返回态）
    (b as unknown as { outT: number }).outT = 5;
    wetStep(b, h.g);
    expect((b as unknown as { ai0: number }).ai0).toBe(0);          // :22593
    expect((b as unknown as { outT: number }).outT).toBe(0);        // :22592（ai[1]≡outT 回写）
    expect(b.vy).toBeCloseTo(2.5, 6);                 // 3>−11 且 ≤16 → −0.5
    expect(b.vx).toBeCloseTo(0, 6);                   // 0×1.1=0
    expect(b.shimmerWet).toBe(true);                  // 相刃支无双清
  });
  it('vx×1.1 钳 ±14（:22601-22602）;ai0=1 返回态头门早退原样（:22589-22591）', () => {
    const h = mkGame(mkShimmerWorld(100));
    const b = new Boomerang(520, 1024, 0, 20, 10, 0, 1060);
    b.vx = 20;
    wetStep(b, h.g);
    expect(b.vy).toBeCloseTo(17.5, 6);                // 20>16 先 ×0.9=18 再 −0.5
    expect(b.vx).toBe(14);                            // 22 → 钳 14
    const ret = new Boomerang(520, 1024, 0, 3, 10, 0, 1059);
    (ret as unknown as { ai0: number }).ai0 = 1;
    (ret as unknown as { outT: number }).outT = 7;
    wetStep(ret, h.g);
    expect((ret as unknown as { ai0: number }).ai0).toBe(1);        // 原样
    expect((ret as unknown as { outT: number }).outT).toBe(7);
    expect(ret.vy).toBe(3);
  });
  it('域内非相刃（1052,aiStyle 3）→ 缺省支零动作（:22719 链尽即出）', () => {
    const h = mkGame(mkShimmerWorld(100));
    const b = new Boomerang(520, 1024, 0, 3, 10, 0, 1052);
    wetStep(b, h.g);
    expect(b.vy).toBe(3);
    expect(b.shimmerWet).toBe(true);
    expect(b.wet).toBe(true);
  });
});

// =====================================================================
// 接面落点（源级钉——五族 hooks.shimmer 面装配存在性/写回面回归）
// =====================================================================
describe('接面落点（源级钉）', () => {
  const lines = readFileSync(join(ROOT, 'src/entities/WeaponProj.ts'), 'utf8').split('\n');

  function classBlock(name: string): string {
    const start = lines.findIndex((l) => l.includes(`export class ${name} `));
    expect(start, `class ${name} not found`).toBeGreaterThan(-1);
    const out: string[] = [];
    for (let i = start; i < lines.length; i++) {
      if (i > start && /^export class /.test(lines[i])) break;
      out.push(lines[i]);
    }
    return out.join('\n');
  }

  it('五族各接一处 hooks.shimmer + projShimmerStep 调用', () => {
    for (const cls of ['GrenadeProj', 'FlailProj', 'YoyoProj', 'CounterweightProj', 'Boomerang']) {
      const blk = classBlock(cls);
      expect(blk.match(/shimmer: \(st, x, y, _w, _h\)/g)?.length, cls).toBe(1);
      expect(blk, cls).toContain('projShimmerStep(sf, st, x, y, this.cx)');
      expect(blk, cls).toContain('this.vx = sf.vx; this.vy = sf.vy;');
      expect(blk, cls).toContain('this.wet = sf.wet; this.shimmerWet = sf.shimmerWet;');
    }
  });
  it('面装配:aiStyle 数据面驱动/hostile 位/timeLeft 面逐族钉', () => {
    expect(classBlock('GrenadeProj')).toContain('aiStyle: projectileData(this.projId)?.aiStyle ?? -1');
    expect(classBlock('GrenadeProj')).toContain('hostile: GRENADE_SHIMMER_HOSTILE.has(this.projId)');
    expect(classBlock('GrenadeProj')).toContain('timeLeft: this.fuse');
    expect(classBlock('FlailProj')).toContain('ai0: this.st, ai1: this.stT');
    expect(classBlock('YoyoProj')).toContain('ai0: this.ai0, ai1: this.ai1');
    expect(classBlock('CounterweightProj')).toContain('ai0: this.ai0, ai1: 0');
    expect(classBlock('Boomerang')).toContain('ai0: this.ai0, ai1: this.outT');
    expect(classBlock('Boomerang')).toContain('this.ai0 = sf.ai0;');
    expect(classBlock('Boomerang')).toContain('this.outT = sf.ai1;');
  });
  it('GrenadeProj kill 面=弹体 Kill 配方（dead+destroy+onExplode+杀拍补跑）', () => {
    const blk = classBlock('GrenadeProj');
    expect(blk).toContain('this.dead = true;');
    expect(blk).toContain('this.destroy();');
    expect(blk).toContain('this.onExplode(this.x + this.w / 2, this.y + this.h / 2, this.damage, this.vx, this.vy);');
    expect(blk).toContain('this.wetSectionKillStep(game);');
    // Flail/Yoyo/CW/Boomerang 域无 Kill 支 → kill 缺省不接
    for (const cls of ['FlailProj', 'YoyoProj', 'CounterweightProj', 'Boomerang']) {
      expect(classBlock(cls).includes('kill: () =>'), cls).toBe(false);
    }
  });
});
