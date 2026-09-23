// BJ296（2026-09-23）批2 概率门族接入——vanilla-npcdust.json 数据面金标 + 行为锁 + 边界。
//
// 数据源：tools/extract-npcdust.mjs 帧树逐型臂解析重产（批2 = 概率门族 15 型：
// 134-136/262-265/407/409/410/411/428/478/516/636）。手核反编译 diff=0 组（NPC.cs 亲读）：
// 636（:82775-:82800）、516（:83895-:83908）、428（:84164-:84190）、409/410/407/411
// （:84405-:84595）、262-265（:88152-:88221）、134-136（:90330-:90393）、478（:84900-:84920）、
// 245-249（:85904-:85959 else 链 life 取反修正）、186/432/632（掷流占位）。
//
// 断言面：
//   A. 数据面金标——批2 代表组掷门数值钉（roll 单掷/循环组/pre 臂条件/gate 区域门/idRand）。
//   B. 行为锁——NpcHitDust 消费面：单掷二选一、循环组逐拍交错、pre 短路不耗掷、
//      gate 判负零尘零掷、idRand 逐尘掷、409 死亡支 [d17,d229] 交错序。
//   C. 边界——批3/4 未接组零尘（419/402）、deadArms 死臂登记、_meta 声明。
//   D. 变异自证——M1 摘分支单掷（恒 t 臂）=636 死亡 d69 消失；M2 摘 pre 短路=
//      262 低血拍耗掷。原子+逐字节还原（禁 git checkout）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
import npcDustJson from '../src/data/vanilla-npcdust.json';
import type { GameHooks } from '../src/entities/types';
import { seededRandom, BATTERY_SEED } from './seeded-rng';
import { spawnNpcHitDust, spawnNpcDeathDust } from '../src/entities/NpcHitDust';

beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(BATTERY_SEED)); });
afterEach(() => { vi.restoreAllMocks(); });

const W = 180, H = 150, FLOOR = 110;
const TABLE = npcDustJson as unknown as Record<string, {
  hit?: Array<Record<string, unknown>>; death?: Array<Record<string, unknown>>;
}> & { _meta: Record<string, unknown> };

type DustCall = {
  x: number; y: number; w: number; h: number; type: number;
  sx: number; sy: number; alpha: number; scale: number;
  noGravity: boolean; vx: number; vy: number;
};

function makeWorld(): World {
  const w = new World(W, H, 11, 'bj296-npcdust-batch2');
  const st = w.store;
  w.groundLevel = 40;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

function makeHooks(w: World, captured: DustCall[]): GameHooks {
  const player = new Player(20 * TILE, (FLOOR - 2) * TILE, new Inventory());
  return {
    world: w, player,
    enemies: () => [] as Enemy[], critters: () => [], npcs: () => [],
    entities: { nextId: 1, add: () => {} },
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {}, cutTile: () => {},
    spawnDust: (
      x: number, yn: number, wn: number, hn: number, type: number,
      sx = 0, sy = 0, alpha = 0, _color: unknown = null, scale = 1, noGravity = false,
    ) => {
      const rec: DustCall = { x, y: yn, w: wn, h: hn, type, sx, sy, alpha, scale, noGravity, vx: sx, vy: sy };
      captured.push(rec);
      return rec;
    },
    dust: { spawn: () => null },
    scene: {},
  } as unknown as GameHooks;
}

function spawn(vid: number, tx = 100, ty = FLOOR - 2): Enemy {
  const e = Enemy.fromVanilla(vid, tx * TILE, ty * TILE);
  expect(e).not.toBeNull();
  return e!;
}

/** Math.random 耗掷计数（mock 之上再包一层计数） */
function countRolls(): { rolls: () => number } {
  const st = { n: 0 };
  const inner = Math.random as unknown as () => number;
  vi.spyOn(Math, 'random').mockImplementation(() => { st.n++; return inner(); });
  return { rolls: () => st.n };
}

// ===================== A. 数据面金标（批2 掷门数值钉） =====================
describe('BJ296 A. 批2 数据面金标（手核 NPC.cs diff=0 组钉值）', () => {
  it('636 沙元素（:82780-:82798）：hit/death 单掷分支 Next(2)==0→d67 else d69（death e 臂 2hd）', () => {
    expect(TABLE['636'].hit).toEqual([
      { roll: { k: 2, op: '==', v: 0 }, hitK: 100, t: [{ dust: 67, sx: 'hd', sy: -1, line: 82780 }], e: [{ dust: 69, sx: 'hd', sy: -1, line: 82784 }], line: 82780 },
    ]);
    expect(TABLE['636'].death).toEqual([
      { roll: { k: 2, op: '==', v: 0 }, n: 50, t: [{ dust: 67, sx: 'hd', sy: -1, line: 82794 }], e: [{ dust: 69, sx: '2hd', sy: -1, line: 82798 }], line: 82794 },
    ]);
  });

  it('516（:83896-:83905）：both 相循环组 20×[d6 velMul3+scaleAddR01, Next(2)==0→d259 ng]', () => {
    const el = { n: 20, body: [
      { dust: 6, sx: '2.5hd', sy: -2.5, posts: [['velMul', 3], ['scaleAddR01']], line: 83896 },
      { roll: { k: 2, op: '==', v: 0 }, t: [{ dust: 259, sx: '2.5hd', sy: -2.5, posts: [['ng', true]], line: 83903 }], line: 83903 },
    ], line: 83896 };
    expect(TABLE['516'].hit).toEqual([el]);
    expect(TABLE['516'].death).toEqual([el]);   // 无 life 门 → both 同发
  });

  it('262（:88157）：hit 臂条件 pre lifeGtHalf+Next(3)!=0→d166 else d167；death 恒 d167×150（死臂剪枝后无掷）', () => {
    expect(TABLE['262'].hit).toEqual([
      { pre: ['lifeGtHalf'], roll: { k: 3, op: '!=', v: 0 }, hitK: 100, t: [{ dust: 166, sx: 'hd', sy: -1, line: 88157 }], e: [{ dust: 167, sx: 'hd', sy: -1, line: 88165 }], line: 88157 },
    ]);
    expect(TABLE['262'].death).toEqual([{ dust: 167, n: 150, sx: '2hd', sy: -2, line: 88178 }]);
  });

  it('263/264（:88165/:88178）：hit/death 全恒 d167（type==262/265 臂对组内静态死,零掷）', () => {
    for (const vid of ['263', '264']) {
      expect(TABLE[vid].hit).toEqual([{ dust: 167, hitK: 100, sx: 'hd', sy: -1, line: 88165 }]);
      expect(TABLE[vid].death).toEqual([{ dust: 167, n: 150, sx: '2hd', sy: -2, line: 88178 }]);
    }
  });

  it('265（:88214/:88218）：death 分支 gate lifeLt0+Next(3)!=0→d166 else d167；受击零尘', () => {
    expect(TABLE['265'].hit).toEqual([]);
    expect(TABLE['265'].death).toEqual([
      { gate: ['lifeLt0'], roll: { k: 3, op: '!=', v: 0 }, n: 15, t: [{ dust: 166, sx: 'hd', sy: -1, line: 88214 }], e: [{ dust: 167, sx: 'hd', sy: -1, line: 88218 }], line: 88214 },
    ]);
  });

  it('407（:84467/:84481）：hit 循环组 hitK50 [d17 Transparent 0.75, Next(2)==0→d229 ng]；death 循环组 n20 [Next(3)!=0→d17, d229 ng+velMul3]', () => {
    expect(TABLE['407'].hit).toEqual([
      { hitK: 50, body: [
        { dust: 17, sx: 'hd', sy: -1, color: { r: 0, g: 0, b: 0, a: 0 }, scale: 0.75, line: 84467 },
        { roll: { k: 2, op: '==', v: 0 }, t: [{ dust: 229, posts: [['ng', true]], line: 84470 }], line: 84470 },
      ], line: 84467 },
    ]);
    expect(TABLE['407'].death).toEqual([
      { n: 20, body: [
        { roll: { k: 3, op: '!=', v: 0 }, t: [{ dust: 17, sx: 'hd', sy: -1, line: 84481 }], line: 84481 },
        { dust: 229, posts: [['ng', true], ['velMul', 3]], line: 84483 },
      ], line: 84481 },
    ]);
  });

  it('409/410/411（:84412-:84590）：hitK 循环组内掷门副尘;死亡支别名拷贝链补全 velMul3', () => {
    expect(TABLE['409'].hit).toEqual([
      { hitK: 50, body: [
        { dust: 17, sx: 'hd', sy: -1, line: 84412 },
        { roll: { k: 4, op: '==', v: 0 }, t: [{ dust: 229, posts: [['ng', true]], line: 84415 }], line: 84415 },
      ], line: 84412 },
    ]);
    expect(TABLE['409'].death).toEqual([
      { n: 20, body: [
        { dust: 17, sx: 'hd', sy: -1, line: 84424 },
        { dust: 229, posts: [['ng', true], ['velMul', 3]], line: 84425 },
      ], line: 84424 },
    ]);
    expect(TABLE['410'].hit).toEqual([
      { hitK: 10, body: [
        { dust: 17, sx: 'hd', sy: -1, line: 84441 },
        { roll: { k: 4, op: '==', v: 0 }, t: [{ dust: 229, posts: [['ng', true]], line: 84444 }], line: 84444 },
      ], line: 84441 },
    ]);
    expect(TABLE['410'].death).toEqual([
      { n: 5, body: [
        { dust: 17, sx: 'hd', sy: -1, line: 84453 },
        { dust: 229, posts: [['ng', true], ['velMul', 3]], line: 84454 },
      ], line: 84453 },
    ]);
    expect(TABLE['411'].hit).toEqual([
      { hitK: 20, body: [
        { dust: 17, sx: 'hd', sy: -1, line: 84575 },
        { roll: { k: 4, op: '==', v: 0 }, t: [{ dust: 229, posts: [['ng', true]], line: 84578 }], line: 84578 },
      ], line: 84575 },
    ]);
    // 411 死亡支掷门 k=2（hit 臂 k=4）
    expect(TABLE['411'].death).toEqual([
      { n: 20, body: [
        { dust: 17, sx: 'hd', sy: -1, line: 84587 },
        { roll: { k: 2, op: '==', v: 0 }, t: [{ dust: 229, posts: [['ng', true]], line: 84590 }], line: 84590 },
      ], line: 84587 },
    ]);
  });

  it('428（:84177-:84184）：death 循环组 10×[d241, Next(2)==0→d229 else d240]；hit hitK20 d241', () => {
    expect(TABLE['428'].hit).toEqual([{ dust: 241, hitK: 20, sx: 'hd', sy: -1, line: 84170 }]);
    expect(TABLE['428'].death).toEqual([
      { n: 10, body: [
        { dust: 241, sx: 'hd', sy: -1, line: 84177 },
        { roll: { k: 2, op: '==', v: 0 }, t: [{ dust: 229, line: 84180 }], e: [{ dust: 240, line: 84184 }], line: 84180 },
      ], line: 84177 },
    ]);
  });

  it('134/135/136（:90359-:90369）：death 单臂 Next(2)==0→[d31×10 velMul1.4, 循环组 5×[d6 ng+velMul5, d6 velMul3]]；受击零尘', () => {
    for (const vid of ['134', '135', '136']) {
      expect(TABLE[vid].hit).toEqual([]);
      expect(TABLE[vid].death).toEqual([
        { roll: { k: 2, op: '==', v: 0 }, t: [
          { dust: 31, n: 10, alpha: 100, scale: 1.5, posts: [['velMul', 1.4]], line: 90359 },
          { n: 5, body: [
            { dust: 6, alpha: 100, scale: 2.5, posts: [['ng', true], ['velMul', 5]], line: 90365 },
            { dust: 6, alpha: 100, scale: 1.5, posts: [['velMul', 3]], line: 90369 },
          ], line: 90365 },
        ], line: 90359 },
      ]);
    }
  });

  it('478（:84914）：death id=237+Next(2) 逐尘掷;hit d238×10 ng', () => {
    expect(TABLE['478'].hit).toEqual([{ dust: 238, n: 10, sx: 'hd', sy: -1, posts: [['ng', true]], line: 84906 }]);
    expect(TABLE['478'].death).toEqual([{ dust: 237, idRand: 2, n: 50, sx: '2.5hd', sy: -2.5, line: 84914 }]);
  });

  it('245-249 修正（:85904-:85959）：hit 恒 hitK100 单簇（旧表 hit 误叠死亡 n50）;246 死亡零尘（246 臂=NewNPC probe）', () => {
    for (const vid of ['245', '247', '248', '249']) {
      expect(TABLE[vid].hit).toEqual([{ dust: 148, hitK: 100, sx: 'hd', sy: -1, line: 85910 }]);
      expect(TABLE[vid].death).toEqual([{ dust: 148, n: 50, sx: '2hd', sy: -2, line: 85924 }]);
    }
    expect(TABLE['246']).toEqual({ hit: [{ dust: 148, hitK: 100, sx: 'hd', sy: -1, line: 85910 }], death: [] });
  });

  it('186/432/632 掷流占位（gore 专属 Next 门）+ _meta.deadArms 死臂登记', () => {
    // 186 hit：:87925 `type==186 && Next(5)==0`（体仅 gore）→ 空分支耗掷占位;death :88116 Next(2)
    expect(TABLE['186'].hit).toEqual([
      { dust: 5, hitK: 100, sx: 'hd', sy: -1, line: 87923 },
      { roll: { k: 5, op: '==', v: 0 }, line: 87926 },
    ]);
    expect(TABLE['186'].death).toEqual([
      { dust: 5, n: 50, sx: '2.5hd', sy: -2.5, line: 87951 },
      { roll: { k: 2, op: '==', v: 0 }, line: 88117 },
    ]);
    expect(TABLE['632'].hit).toEqual([
      { dust: 5, hitK: 100, sx: 'hd', sy: -1, line: 87923 },
      { roll: { k: 5, op: '==', v: 0 }, line: 87930 },
    ]);
    expect(TABLE['432'].hit).toEqual([{ dust: 5, hitK: 100, sx: 'hd', sy: -1, line: 87923 }]);
    expect(TABLE['432'].death).toEqual([
      { dust: 5, n: 50, sx: '2.5hd', sy: -2.5, line: 87951 },
      { roll: { k: 2, op: '==', v: 0 }, line: 88117 },
    ]);
    // 死臂登记：262-264 块内 type==265 臂（:88161/:88174）对组内全型静态死
    expect(TABLE._meta.deadArms).toEqual([
      { line: 88161, types: [265], enclosing: [262, 263, 264] },
      { line: 88174, types: [265], enclosing: [262, 263, 264] },
    ]);
  });
});

// ===================== B. 行为锁（NpcHitDust 消费面） =====================
describe('BJ296 B. 批2 消费行为（掷序/短路/单掷/循环组交错）', () => {
  it('636 hit：恰 ceil(dmg/lifeMax×100) 粒,单掷二选一（67/69 互斥补齐）,sx=hd sy=-1', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(636);
    const hp0 = e.hp;
    e.hurt(20, 1, 0, g);
    const dealt = hp0 - e.hp;
    expect(e.hp).toBeGreaterThan(0);
    expect(cap.length).toBe(Math.ceil((dealt / e.maxHp) * 100));   // 循环一次出恰一粒
    for (const d of cap) {
      expect(d.sx).toBe(1);
      expect(d.sy).toBe(-1);
    }
    // 两臂互斥补齐：半血直接驱动 ~50 迭代（种子流下两臂必齐现;P(miss)≈2⁻⁴⁹）
    const cap2: DustCall[] = [];
    const g2 = makeHooks(w, cap2);
    const e2 = spawn(636, 110, FLOOR - 4);
    spawnNpcHitDust(e2, g2, 1, Math.ceil(e2.maxHp / 2));
    expect(cap2.length).toBe(Math.ceil((1 / 2) * 100));
    const ids = new Set(cap2.map((d) => d.type));
    expect(ids.size).toBe(2);
    expect(ids.has(67)).toBe(true);
    expect(ids.has(69)).toBe(true);
  });

  it('636 death：恰 50 粒,d69 臂 sx=2hd（-2）,d67 臂 sx=hd（-1）', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(636, 110, FLOOR - 4);
    e.hurt(e.hp + 9999, -1, 0, g);
    expect(e.dead).toBe(true);
    expect(cap.length).toBe(50);
    for (const d of cap) {
      if (d.type === 67) expect(d.sx).toBe(-1);
      else { expect(d.type).toBe(69); expect(d.sx).toBe(-2); }
    }
  });

  it('516 both：hit 20×d6+掷门 d259 交错序（d6→掷→d259）;scaleAddR01 落 scale∈[2.5,3.5)', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(516);
    spawnNpcHitDust(e, g, 1, 10);                          // 直驱 hit 相（fixed n=20,与 dmg 无关）
    // hit 相：20 迭代,每迭代恰 1 粒 d6;d259 数=Next(2)==0 命中数
    const d6s = cap.filter((d) => d.type === 6);
    const d259s = cap.filter((d) => d.type === 259);
    expect(d6s.length).toBe(20);
    expect(d259s.length).toBeGreaterThan(0);
    expect(d259s.length).toBeLessThan(20);
    expect(d259s.every((d) => d.noGravity)).toBe(true);
    // 交错序：每粒 d259 前必有一粒 d6（循环组逐拍 body 序）
    for (const d of d259s) {
      const idx = cap.indexOf(d);
      expect(cap[idx - 1].type).toBe(6);
    }
    // scaleAddR01：终值 scale = 1 + rand01（活尘对象可观测）
    for (const d of d6s) expect(d.scale).toBeGreaterThanOrEqual(1);
  });

  it('262 pre 短路：hp≤maxHp/2 时全 d167 且【零耗掷】;hp>half 时掷门生效', () => {
    const w = makeWorld();
    // 低血拍：先扣到半血以下再打
    const capLo: DustCall[] = [];
    const gLo = makeHooks(w, capLo);
    const eLo = spawn(262);
    eLo.hurt(Math.ceil(eLo.maxHp / 2) + 10, 1, 0, gLo);   // 打穿半线以下
    expect(eLo.hp).toBeGreaterThan(0);
    expect(eLo.hp).toBeLessThanOrEqual(Math.floor(eLo.maxHp / 2));
    const n0 = capLo.length;
    const lo = countRolls();
    spawnNpcHitDust(eLo, gLo, 1, 10);
    expect(capLo.length - n0).toBe(Math.ceil((10 / eLo.maxHp) * 100));
    expect(capLo.slice(n0).every((d) => d.type === 167)).toBe(true);
    const loRolls = lo.rolls();
    // 满血拍
    const capHi: DustCall[] = [];
    const gHi = makeHooks(w, capHi);
    const eHi = spawn(262, 110, FLOOR - 4);
    const hi = countRolls();
    spawnNpcHitDust(eHi, gHi, 1, 10);
    const hiRolls = hi.rolls();
    expect(hiRolls).toBe(Math.ceil((10 / eHi.maxHp) * 100));  // 每迭代一掷
    expect(hiRolls).toBeGreaterThan(loRolls);              // 低血拍零掷（&& 短路）
    expect(loRolls).toBe(0);
    void capHi;
  });

  it('265 gate lifeLt0：death hp==0 拍零尘零掷（life>=0 return）;hp<0 拍 15 迭代分支', () => {
    const w = makeWorld();
    const cap0: DustCall[] = [];
    const g0 = makeHooks(w, cap0);
    const e0 = spawn(265);
    e0.hurt(e0.hp, 1, 0, g0);                              // 恰好打空：life==0
    expect(e0.dead).toBe(true);
    expect(cap0.length).toBe(0);                           // gate 判负→零尘
    const r0 = countRolls();
    spawnNpcDeathDust(e0, g0, 1);
    expect(r0.rolls()).toBe(0);                            // 零耗掷

    const capN: DustCall[] = [];
    const gN = makeHooks(w, capN);
    const eN = spawn(265, 110, FLOOR - 4);
    eN.hurt(eN.hp + 1, 1, 0, gN);                          // hp<0
    expect(eN.dead).toBe(true);
    expect(capN.length).toBe(15);                          // 每迭代恰一粒
    expect(new Set(capN.map((d) => d.type)).size).toBe(2);
  });

  it('478 idRand：death 50 粒 id∈{237,238} 两值均现', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(478, 110, FLOOR - 4);
    e.hurt(e.hp + 9999, 1, 0, g);
    expect(e.dead).toBe(true);
    expect(cap.length).toBe(50);
    const ids = new Set(cap.map((d) => d.type));
    expect(ids.has(237)).toBe(true);
    expect(ids.has(238)).toBe(true);
    expect(ids.size).toBe(2);
    for (const d of cap) expect(d.sx).toBe(2.5);
  });

  it('409 death：[d17, d229] 交错 20 组（循环组逐拍序）;428 death [d241, 229|240] 交错', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(409, 110, FLOOR - 4);
    e.hurt(e.hp + 9999, 1, 0, g);
    expect(e.dead).toBe(true);
    expect(cap.length).toBe(40);
    for (let k = 0; k < 20; k++) {
      expect(cap[k * 2].type).toBe(17);
      expect(cap[k * 2 + 1].type).toBe(229);
      expect(cap[k * 2 + 1].noGravity).toBe(true);
    }

    const cap2: DustCall[] = [];
    const g2 = makeHooks(w, cap2);
    const e2 = spawn(428, 110, FLOOR - 4);
    e2.hurt(e2.hp + 9999, 1, 0, g2);
    expect(cap2.length).toBe(20);
    for (let k = 0; k < 10; k++) {
      expect(cap2[k * 2].type).toBe(241);
      expect(cap2[k * 2 + 1].type === 229 || cap2[k * 2 + 1].type === 240).toBe(true);
    }
  });

  it('245 回归：hit = ceil(dmg/lifeMax×100) 单簇（旧表 hit 误叠死亡 n50 已修）', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(245);
    const hp0 = e.hp;
    e.hurt(20, 1, 0, g);
    const dealt = hp0 - e.hp;
    expect(e.hp).toBeGreaterThan(0);
    expect(cap.length).toBe(Math.ceil((dealt / e.maxHp) * 100));
    expect(cap.every((d) => d.type === 148)).toBe(true);
  });
});

// ===================== C. 边界（批3/4 未接组零尘 + _meta 声明） =====================
describe('BJ296 C. 边界', () => {
  it('402（oldPos 轨迹盒,批4）：受击/死亡零尘=未接组原版相保守（整组 pending 无半接）', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(402);
    e.hurt(10, 1, 0, g);
    expect(e.hp).toBeGreaterThan(0);
    expect(cap.length).toBe(0);
    const e2 = spawn(402, 110, FLOOR - 4);
    e2.hurt(e2.hp + 9999, 1, 0, g);
    expect(e2.dead).toBe(true);
    expect(cap.length).toBe(0);
  });

  it('_meta 声明：batch2 接入 15 型 + noGenericTail 维持 + pending 不含已接型', () => {
    expect(String(TABLE._meta.batch2)).toContain('概率门族');
    expect(String(TABLE._meta.noGenericTail)).toContain('原版无通用尘尾');
    // 根级门组（daybreak/gold-critter/484-487,type 无域）pending 逐型膨胀=全型登记,豁免;
    // 型域组（types 收敛）不含已接型
    const pendIds = new Set((TABLE._meta.pending as Array<{ types?: number[] }>)
      .filter((p) => (p.types?.length ?? 0) < 100)
      .flatMap((p) => p.types ?? []));
    for (const vid of [134, 135, 136, 262, 263, 264, 265, 407, 409, 410, 411, 428, 478, 516, 636]) {
      expect(pendIds.has(vid)).toBe(false);
    }
    // 批3/4 边界（★BJ304 后收敛）：fadeIn 族/524-527 已入表（fadeIn 定谳翻案=生长目标语义,
    // VDust.fadeIn 引擎 1:1）;661（四缺口）/402（oldPos,批4）仍零尘
    const ids = Object.keys(TABLE).filter((k) => k !== '_meta');
    expect(ids.length).toBe(332);
    for (const vid of ['661', '402']) expect(TABLE[vid]).toBeUndefined();
  });
});

// ===================== D. 变异自证（原子+逐字节还原） =====================
describe('BJ296 D. 变异自证', () => {
  const CONSUMER = join(process.cwd(), 'src', 'entities', 'NpcHitDust.ts');
  // ★子进程模式（era-guard ④ 同款）：变异写盘 → 子 vitest 只跑 B 面（-t 过滤,D 面不注册执行
  //   = 无递归）→ 判别面红 = 消费行为锁对变异有捕获力;finally 逐字节还原（禁 git checkout）。
  const spawnVitest = (filter: string) => spawnSync('npx', ['vitest', 'run', 'tests/bj296-npcdust-batch2.test.ts', '--no-file-parallelism', '-t', filter], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
  });

  it('M1 摘分支单掷（roll 恒真=恒 t 臂）→ 恒 t 臂两臂齐现面红（B 面 636 hit 必炸）', () => {
    const src = readFileSync(CONSUMER, 'utf8');
    const TRIGGER = "      const roll = Math.floor(Math.random() * el.roll.k);\n      const pass = el.roll.op === '==' ? roll === el.roll.v : roll !== el.roll.v;";
    expect(src).toContain(TRIGGER);
    try {
      writeFileSync(CONSUMER, src.replace(TRIGGER, '      const pass = true; // ★变异:摘单掷'));
      const r = spawnVitest('BJ296 B. 批2 消费行为');
      expect(r.status).not.toBe(0);                       // ★变异证红:两臂互斥+掷序锁捕获
      expect(r.stdout).toContain('636 hit');              // 指名判别组（恒 t 臂 → 两臂齐现断言炸）
    } finally {
      writeFileSync(CONSUMER, src);                       // 逐字节还原（禁 git checkout）
    }
    expect(readFileSync(CONSUMER, 'utf8')).toBe(src);
  });

  it('M2 摘 pre 短路（臂条件失效恒掷）→ 262 低血拍零耗掷锁红（B 面 262 pre 短路必炸）', () => {
    const src = readFileSync(CONSUMER, 'utf8');
    const TRIGGER = "      if (!prePass(el.pre, e)) {                        // 臂条件判负：走 else 臂,不耗掷（&& 短路同相）";
    expect(src).toContain(TRIGGER);
    try {
      writeFileSync(CONSUMER, src.replace(TRIGGER, '      if (false) { // ★变异:摘 pre 短路'));
      const r = spawnVitest('BJ296 B. 批2 消费行为');
      expect(r.status).not.toBe(0);                       // ★变异证红:零耗掷锁捕获
      expect(r.stdout).toContain('262 pre');              // 指名判别组
    } finally {
      writeFileSync(CONSUMER, src);
    }
    expect(readFileSync(CONSUMER, 'utf8')).toBe(src);
  });
});
