// BJ304（2026-09-23）批3 fadeIn 定谳翻案族接入——vanilla-npcdust.json 数据面金标 + 行为锁 + 边界。
//
// ★定谳翻案（BJ296 批2 报告曾按「fadeIn=alpha 渐入,本仓不可用」登记 postUnsupported）：
//   原版语义=生长目标（Dust.cs :2148-2171,0<fadeIn<100 时 scale += 0.03/t(46/213/260=0.1,
//   235=0.007) 至超 fadeIn 归零转衰落,无 alpha 参与）;本仓 VDust.fadeIn 在位+老化链 1:1
//   （fx/VanillaDust.ts :740-745）+spawnDust 返活尘 → `fadeIn = N` 收编 std 算子。
//   源锚：NPC.cs :83673-:84330（415-429/518 fadeIn 叶族）/:83960-:84030（426/427 SelectRandom
//   死亡环=noLight+idPick 真缺口,半接）/:84683-:84744（524-527 num205 运行时门+per-type 局部 id）/
//   :82666-:82722（661 四缺口,零尘登记）。1458 同区逐字节全等。
//
// 断言面：
//   A. 数据面金标——批3 代表组钉值（fadeIn 叶 posts/循环组/掷门/typed 局部 id/掷流占位）。
//   B. 行为锁——NpcHitDust 消费面：fadeIn 落活尘字段、叶序 d241→掷→d6、524 占位耗掷零尘、
//      525 per-type id d75、426/427 death 半接（d241 主环+SelectRandom 环零发零掷）。
//   C. 边界——661 四缺口零尘+pending 精确登记（noLight=id 字段在位引擎不消费）、_meta.batch3。
//   D. 变异自证——M1 摘 fadeIn 算子应用=叶 fadeIn 断言红；M2 摘无臂占位掷流=524 耗掷锁红。
//      原子+逐字节还原（禁 git checkout）。
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { gateConsumerMutation, lockConsumerMutation, unlockConsumerMutation } from './npcdust-mutation-mutex';
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

// ★残留检测闸（文件级 beforeAll,先于 A/B/C 面执行）：等在途变异窗结束+锚校验——上轮
//   变异残留或并行覆写会让消费面静默中毒,此处 loud 红。★变异子进程以 SW_BJ304_MUT=1 豁免
//   （子进程就是要对变异文件跑 B 面）。实现=tests/npcdust-mutation-mutex.ts（与 bj296 D 面共锁）。
beforeAll(() => { gateConsumerMutation('SW_BJ304_MUT', join(process.cwd(), 'src', 'entities', 'NpcHitDust.ts')); });

const W = 180, H = 150, FLOOR = 110;
const TABLE = npcDustJson as unknown as Record<string, {
  hit?: Array<Record<string, unknown>>; death?: Array<Record<string, unknown>>;
}> & { _meta: Record<string, unknown> };

type DustCall = {
  x: number; y: number; w: number; h: number; type: number;
  sx: number; sy: number; alpha: number; scale: number;
  noGravity: boolean; vx: number; vy: number; fadeIn: number;
};

function makeWorld(): World {
  const w = new World(W, H, 11, 'bj304-npcdust-batch3');
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
      const rec: DustCall = { x, y: yn, w: wn, h: hn, type, sx, sy, alpha, scale, noGravity, vx: sx, vy: sy, fadeIn: 0 };
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

// ===================== A. 数据面金标（批3 手核 NPC.cs diff=0 组钉值） =====================
describe('BJ304 A. 批3 数据面金标（手核 NPC.cs diff=0 组钉值）', () => {
  it('416/518（:83673-:83710）：hit hitK20/death n20 循环组 [d241, Next(4|3)==0→d6 叶 ng+scale1.5+fadeIn1+velMul3]', () => {
    const hit = { hitK: 20, body: [
      { dust: 241, sx: 'hd', sy: -1, line: 83679 },
      { roll: { k: 4, op: '==', v: 0 }, t: [{ dust: 6, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: 83682 }], line: 83682 },
    ], line: 83679 };
    const death = { n: 20, body: [
      { dust: 241, sx: 'hd', sy: -1, line: 83695 },
      { roll: { k: 3, op: '==', v: 0 }, t: [{ dust: 6, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: 83698 }], line: 83698 },
    ], line: 83695 };
    expect(TABLE['416'].hit).toEqual([hit]);
    expect(TABLE['416'].death).toEqual([death]);
    expect(TABLE['518'].hit).toEqual(TABLE['416'].hit);    // 同块 `type == 518 || type == 416`
    expect(TABLE['518'].death).toEqual(TABLE['416'].death);
  });

  it('415（:83776-:83806）：hit Next(4)==0 分支;death n40 循环组 [d241, d6 叶] 无门双发', () => {
    expect(TABLE['415'].hit).toEqual([
      { hitK: 20, body: [
        { dust: 241, sx: 'hd', sy: -1, line: 83782 },
        { roll: { k: 4, op: '==', v: 0 }, t: [{ dust: 6, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: 83785 }], line: 83785 },
      ], line: 83782 },
    ]);
    expect(TABLE['415'].death).toEqual([
      { n: 40, body: [
        { dust: 241, sx: 'hd', sy: -1, line: 83798 },
        { dust: 6, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: 83799 },
      ], line: 83798 },
    ]);
  });

  it('417/418/419（:83810-:83746）：掷门 k 值逐型钉（417 Next4/2、418 Next2/death 无门 n20、419 Next4/3）', () => {
    expect((TABLE['417'].hit as Array<{ body: Array<Record<string, unknown>> }>)[0].body[1]).toEqual({ roll: { k: 4, op: '==', v: 0 }, t: [{ dust: 6, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: 83821 }], line: 83821 });
    expect((TABLE['417'].death as Array<{ body: Array<Record<string, unknown>> }>)[0].body[1]).toEqual({ roll: { k: 2, op: '==', v: 0 }, t: [{ dust: 6, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: 83837 }], line: 83837 });
    expect((TABLE['418'].hit as Array<{ body: Array<Record<string, unknown>> }>)[0].body[1]).toEqual({ roll: { k: 2, op: '==', v: 0 }, t: [{ dust: 6, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: 83864 }], line: 83864 });
    expect(TABLE['418'].death).toEqual([
      { n: 20, body: [
        { dust: 241, sx: 'hd', sy: -1, line: 83877 },
        { dust: 6, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: 83878 },
      ], line: 83877 },
    ]);
    expect((TABLE['419'].hit as Array<{ body: Array<Record<string, unknown>> }>)[0].body[1]).toEqual({ roll: { k: 4, op: '==', v: 0 }, t: [{ dust: 6, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: 83722 }], line: 83722 });
    expect((TABLE['419'].death as Array<{ body: Array<Record<string, unknown>> }>)[0].body[1]).toEqual({ roll: { k: 3, op: '==', v: 0 }, t: [{ dust: 6, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: 83738 }], line: 83738 });
  });

  it('420/421/423/424（:84185-:84330）：d249+d242 亚族钉值（420/421 Next2+death n10 无门、423 hitK50、424 Next4/3）', () => {
    for (const vid of ['420', '421']) {
      expect((TABLE[vid].hit as Array<{ body: Array<Record<string, unknown>> }>)[0].body[0]).toEqual({ dust: 249, sx: 'hd', sy: -1, line: vid === '420' ? 84307 : 84272 });
      expect((TABLE[vid].hit as Array<{ body: Array<Record<string, unknown>> }>)[0].body[1]).toEqual({ roll: { k: 2, op: '==', v: 0 }, t: [{ dust: 242, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: vid === '420' ? 84310 : 84275 }], line: vid === '420' ? 84310 : 84275 });
      expect(TABLE[vid].death).toEqual([
        { n: 10, body: [
          { dust: 249, sx: 'hd', sy: -1, line: vid === '420' ? 84323 : 84288 },
          { dust: 242, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: vid === '420' ? 84324 : 84289 },
        ], line: vid === '420' ? 84323 : 84288 },
      ]);
    }
    expect((TABLE['423'].hit as Array<Record<string, unknown>>)[0].hitK).toBe(50);
    expect((TABLE['423'].hit as Array<{ body: Array<Record<string, unknown>> }>)[0].body[1]).toEqual({ roll: { k: 4, op: '==', v: 0 }, t: [{ dust: 242, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: 84240 }], line: 84240 });
    expect((TABLE['424'].hit as Array<{ body: Array<Record<string, unknown>> }>)[0].body[1]).toEqual({ roll: { k: 4, op: '==', v: 0 }, t: [{ dust: 242, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: 84200 }], line: 84200 });
    expect((TABLE['424'].death as Array<{ body: Array<Record<string, unknown>> }>)[0].body[1]).toEqual({ roll: { k: 3, op: '==', v: 0 }, t: [{ dust: 242, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: 84216 }], line: 84216 });
  });

  it('425/429（:84122-:84064）：d241+d229 亚族（425 Next4/3、429 Next4/3）', () => {
    for (const [vid, lh, ll, dh, dl] of [['425', 84128, 84131, 84144, 84147], ['429', 84044, 84047, 84060, 84063]] as const) {
      expect((TABLE[vid].hit as Array<{ body: Array<Record<string, unknown>> }>)[0].body[1]).toEqual({ roll: { k: 4, op: '==', v: 0 }, t: [{ dust: 229, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: ll }], line: ll });
      expect((TABLE[vid].death as Array<{ body: Array<Record<string, unknown>> }>)[0].body[1]).toEqual({ roll: { k: 3, op: '==', v: 0 }, t: [{ dust: 229, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: dl }], line: dl });
      void lh; void dh;
    }
  });

  it('426/427（:83944-:84030）：hit 相 d229 叶入表;death d241 主环+SelectRandom 环已随 BJ327 批4 转正（idPick 带权+noLight 算子）', () => {
    expect(TABLE['426'].hit).toEqual([
      { hitK: 50, body: [
        { dust: 241, sx: 'hd', sy: -1, line: 83949 },
        { roll: { k: 4, op: '==', v: 0 }, t: [{ dust: 229, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: 83952 }], line: 83952 },
      ], line: 83949 },
    ]);
    // ★BJ327 批4:death 第二环入表——idPick=[229,240,161]（Utils.SelectRandom 直译,均一）+
    //   复合 scale+fadeIn0.25+velMul2+noLight（算子转正:引擎光链 VanillaDust.ts :551 消费）
    expect(TABLE['426'].death).toEqual([
      { dust: 241, n: 20, sx: 'hd', sy: -1, line: 83965 },
      { dust: 0, idPick: [229, 240, 161], n: 30, posts: [['ng', true], ['scaleSet', 1.25], ['scaleAddR01'], ['fadeIn', 0.25], ['velMul', 2], ['noLight', true]], line: 83970 },
    ]);
    expect(TABLE['427'].hit).toEqual([
      { hitK: 20, body: [
        { dust: 241, sx: 'hd', sy: -1, line: 84003 },
        { roll: { k: 2, op: '==', v: 0 }, t: [{ dust: 229, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: 84006 }], line: 84006 },
      ], line: 84003 },
    ]);
    // ★427 idPick=[229,229,240]——重复项=权重（2:1）;velMul3
    expect(TABLE['427'].death).toEqual([
      { dust: 241, n: 10, sx: 'hd', sy: -1, line: 84019 },
      { dust: 0, idPick: [229, 229, 240], n: 20, posts: [['ng', true], ['scaleSet', 1.25], ['scaleAddR01'], ['fadeIn', 0.25], ['velMul', 3], ['noLight', true]], line: 84024 },
    ]);
    // ★BJ327 批4:pending 清空（SelectRandom 环不再登记）
    const pend = TABLE._meta.pending as Array<{ types: number[]; reason: string; line: number }>;
    expect(pend.find((p) => p.types.includes(426) || p.types.includes(427))).toBeUndefined();
  });

  it('524-527（:84683-:84744）：num205 per-type 局部 id（0/75/170/67）;524 掷流占位空分支（无 t 臂）', () => {
    expect(TABLE['524'].hit).toEqual([
      { hitK: 20, body: [
        { dust: 5, sx: 'hd', sy: -1, line: 84707 },
        { roll: { k: 4, op: '==', v: 0 }, line: 84710 },   // num205=0 静态死→占位（roll 照耗）
      ], line: 84707 },
    ]);
    expect(TABLE['524'].death).toEqual([
      { n: 20, body: [
        { dust: 5, sx: 'hd', sy: -1, line: 84723 },
        { roll: { k: 3, op: '==', v: 0 }, line: 84726 },
      ], line: 84723 },
    ]);
    for (const [vid, leaf] of [['525', 75], ['526', 170], ['527', 67]] as const) {
      expect(TABLE[vid].hit).toEqual([
        { hitK: 20, body: [
          { dust: 5, sx: 'hd', sy: -1, line: 84707 },
          { roll: { k: 4, op: '==', v: 0 }, t: [{ dust: leaf, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: 84710 }], line: 84710 },
        ], line: 84707 },
      ]);
      expect(TABLE[vid].death).toEqual([
        { n: 20, body: [
          { dust: 5, sx: 'hd', sy: -1, line: 84723 },
          { roll: { k: 3, op: '==', v: 0 }, t: [{ dust: leaf, posts: [['ng', true], ['scaleSet', 1.5], ['fadeIn', 1], ['velMul', 3]], line: 84726 }], line: 84726 },
        ], line: 84723 },
      ]);
    }
  });
});

// ===================== B. 行为锁（NpcHitDust 消费面） =====================
describe('BJ304 B. 批3 消费行为（fadeIn 落尘/占位耗掷/半接零掷）', () => {
  it('416 hit：20 迭代 [d241→掷→d6 叶];叶 noGravity+scale1.5+fadeIn1 落活尘字段', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(416);
    spawnNpcHitDust(e, g, 1, e.maxHp);                     // dmg=lifeMax → 20 迭代
    const d241s = cap.filter((d) => d.type === 241);
    const d6s = cap.filter((d) => d.type === 6);
    expect(d241s.length).toBe(20);
    expect(d6s.length).toBeGreaterThan(0);
    expect(d6s.length).toBeLessThan(20);
    expect(d241s.every((d) => d.sx === 1 && d.sy === -1)).toBe(true);
    for (const d of d6s) {
      expect(d.noGravity).toBe(true);
      expect(d.scale).toBe(1.5);
      expect(d.fadeIn).toBe(1);                            // ★批3 新算子:活尘对象 fadeIn 落值
      const idx = cap.indexOf(d);
      expect(cap[idx - 1].type).toBe(241);                 // 交错序:叶前必有主尘（循环组逐拍 body 序）
    }
    // 掷流：每迭代恰一掷（Next(4)）
    const cap2: DustCall[] = [];
    const g2 = makeHooks(w, cap2);
    const e2 = spawn(416, 110, FLOOR - 4);
    const r2 = countRolls();
    spawnNpcHitDust(e2, g2, 1, e2.maxHp);
    expect(r2.rolls()).toBe(20);
  });

  it('415 death：40 拍 [d241, d6] 无门双发（80 粒交错）;418 death n20 同构', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(415, 110, FLOOR - 4);
    spawnNpcDeathDust(e, g, 1);
    expect(cap.length).toBe(80);
    for (let k = 0; k < 40; k++) {
      expect(cap[k * 2].type).toBe(241);
      expect(cap[k * 2 + 1].type).toBe(6);
      expect(cap[k * 2 + 1].fadeIn).toBe(1);
    }
    const cap2: DustCall[] = [];
    const g2 = makeHooks(w, cap2);
    const e2 = spawn(418, 110, FLOOR - 4);
    spawnNpcDeathDust(e2, g2, 1);
    expect(cap2.length).toBe(40);
    expect(cap2.filter((d) => d.type === 241).length).toBe(20);
    expect(cap2.filter((d) => d.type === 6).length).toBe(20);
  });

  it('524 hit：20 粒 d5+20 掷（占位空分支 roll 照耗）零叶尘;525 叶 d75 现身（per-type id）', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(524);
    const r = countRolls();
    spawnNpcHitDust(e, g, 1, e.maxHp);
    expect(cap.length).toBe(20);                           // 仅主尘 d5
    expect(cap.every((d) => d.type === 5)).toBe(true);
    expect(r.rolls()).toBe(20);                            // ★占位掷流:roll 照耗（&& 左先同相）
    const cap2: DustCall[] = [];
    const g2 = makeHooks(w, cap2);
    const e2 = spawn(525, 110, FLOOR - 4);
    const r2 = countRolls();
    spawnNpcHitDust(e2, g2, 1, e2.maxHp);
    const d75s = cap2.filter((d) => d.type === 75);
    expect(cap2.filter((d) => d.type === 5).length).toBe(20);
    expect(d75s.length).toBeGreaterThan(0);                // num205=75 per-type id 现身
    expect(d75s.length).toBeLessThan(20);
    expect(d75s.every((d) => d.fadeIn === 1 && d.noGravity)).toBe(true);
    expect(r2.rolls()).toBe(20);
    // 526/527：per-type id 170/67
    const cap3: DustCall[] = [];
    const g3 = makeHooks(w, cap3);
    const e3 = spawn(526, 120, FLOOR - 4);
    spawnNpcHitDust(e3, g3, 1, e3.maxHp);
    const cap4: DustCall[] = [];
    const g4 = makeHooks(w, cap4);
    const e4 = spawn(527, 130, FLOOR - 4);
    spawnNpcHitDust(e4, g4, 1, e4.maxHp);
    expect(cap3.some((d) => d.type === 170)).toBe(true);
    expect(cap4.some((d) => d.type === 67)).toBe(true);
    expect(cap3.some((d) => d.type === 75)).toBe(false);   // 不串型
  });

  it('426/427 death（★BJ327 批4 转正）：d241 主环+SelectRandom 环齐发（noLight/fadeIn0.25/复合 scale 落活尘;逐尘 2 掷=idPick+scaleAddR01）', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(426, 110, FLOOR - 4);
    const r = countRolls();
    spawnNpcDeathDust(e, g, 1);
    expect(cap.length).toBe(50);                           // 20 d241 主环 + 30 SelectRandom 环
    expect(cap.filter((d) => d.type === 241).length).toBe(20);
    expect(cap.filter((d) => d.type !== 241).length).toBe(30);
    for (const d of cap) {
      if (d.type === 241) continue;
      expect(d.fadeIn).toBe(0.25);                         // 环尘 fadeIn=0.25（生长目标）
      expect(d.scale).toBeGreaterThanOrEqual(1.25);        // scale=1.25+NextFloat()（复合算子）
      expect(d.scale).toBeLessThan(2.25);
      expect(d.noGravity).toBe(true);
      expect((d as unknown as { noLight: boolean }).noLight).toBe(true);   // ★noLight 落活尘（引擎光链消费位）
      expect(d.vx).toBeCloseTo(d.sx * 2, 10);              // velocity ×= 2（426）
    }
    expect(r.rolls()).toBe(60);                            // 30×(idPick 1 掷+scaleAddR01 1 掷)
    const cap2: DustCall[] = [];
    const g2 = makeHooks(w, cap2);
    const e2 = spawn(427, 110, FLOOR - 4);
    spawnNpcDeathDust(e2, g2, 1);
    expect(cap2.length).toBe(30);                          // 10 d241 + 20 环
    expect(cap2.filter((d) => d.type === 241).length).toBe(10);
    for (const d of cap2) {
      if (d.type === 241) continue;
      expect((d as unknown as { noLight: boolean }).noLight).toBe(true);
      expect(d.vx).toBeCloseTo(d.sx * 3, 10);              // velocity ×= 3（427）
    }
  });

  it('429 death：20 迭代 [d241, Next(3)==0→d229];叶 posts 同相（ng/scale/fadeIn）', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(429, 110, FLOOR - 4);
    spawnNpcDeathDust(e, g, 1);
    const d241s = cap.filter((d) => d.type === 241);
    const d229s = cap.filter((d) => d.type === 229);
    expect(d241s.length).toBe(20);
    expect(d229s.length).toBeGreaterThan(0);
    for (const d of d229s) {
      expect(d.noGravity).toBe(true);
      expect(d.scale).toBe(1.5);
      expect(d.fadeIn).toBe(1);
    }
  });
});

// ===================== C. 边界（661 已随 BJ327 批4 转正 + _meta 声明） =====================
describe('BJ304 C. 边界', () => {
  it('661（光女,四缺口已随 BJ327 批4 一次接齐——判别面移 tests/bj327-npcdust-batch4.test.ts）出尘型域+落尘面锁', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(661);
    // ★直驱（661 仓内 stats 缺口 maxHp=5,与尘面无关——查表钉面走 NpcHitDust 单源）
    spawnNpcHitDust(e, g, 1, 10);
    spawnNpcDeathDust(e, g, 1);
    expect(cap.length).toBeGreaterThan(0);             // 批4 转正:Next(5) 门 d267 彩虹环出尘
    expect(cap.every((d) => d.type === 267)).toBe(true);
    expect(TABLE['661']).toBeDefined();               // 表内登记（四缺口:colorHsl/posCircular/velFromCenter/clone）
  });

  it('_meta 声明：batch3 翻案面 + pending 收敛（fadeIn 族/524-527/426/427/661 批4 后全不在 pending）', () => {
    expect(String(TABLE._meta.batch3)).toContain('翻案');
    expect(String(TABLE._meta.batch3)).toContain('生长目标');
    const ids = Object.keys(TABLE).filter((k) => k !== '_meta');
    expect(ids.length).toBe(335);                      // 332 + 402/661（★BJ327 批4 转正;426/427 批3 已在;BJ411 23）
    for (const vid of ['415', '416', '417', '418', '419', '420', '421', '423', '424', '425', '426', '427', '429', '518', '524', '525', '526', '527']) {
      expect(TABLE[vid]).toBeDefined();
    }
    const pend = TABLE._meta.pending as Array<{ types: number[]; reason: string }>;
    const pendIds = new Set(pend.filter((p) => p.types.length < 100).flatMap((p) => p.types));
    for (const vid of [415, 416, 417, 418, 419, 420, 421, 423, 424, 425, 429, 518, 524, 525, 526, 527, 426, 427, 661, 402]) {
      expect(pendIds.has(vid)).toBe(false);            // 全接型 pending 清空（★批4 收官含 426/427/661/402）
    }
  });
});

// ===================== D. 变异自证（原子+逐字节还原） =====================
// ★快照在模块加载期取（先于全部测试执行）——D 面 afterEach 无条件还原：任何一步
//   失败/中断都不会把变异残留进后续运行（曾因 guard 在 try 外失败跳过 finally,
//   上轮残留毒化下轮 B 面——快照+afterEach 双保险后,残留至多活到本轮 afterEach）。
const CONSUMER = join(process.cwd(), 'src', 'entities', 'NpcHitDust.ts');
// ★消费面变异互斥（与 bj296 D 面共锁,实现=tests/npcdust-mutation-mutex.ts）
describe('BJ304 D. 变异自证', () => {
  // ★子进程模式（era-guard ④/bj296 D 同款）：变异写盘 → 子 vitest 只跑 B 面（-t 过滤,D 面
  //   不注册执行=无递归）→ 判别面红 = 行为锁对变异有捕获力;finally+afterEach 逐字节还原
  //   （禁 git checkout）。
  const spawnVitest = (filter: string) => spawnSync('npx', ['vitest', 'run', 'tests/bj304-npcdust-batch3.test.ts', '--no-file-parallelism', '-t', filter], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
    env: { ...process.env, SW_BJ304_MUT: '1' },   // ★子进程豁免残留检测闸（对变异文件跑 B 面）
  });
  // ★快照在【持锁后】取（D beforeAll）——模块加载期快照在并行运行下可能读到他文件
  //   变异窗内的内容（bj296 D 面共锁,错拍加载→毒快照回写=残留根因）;锁内读盘=免毒。
  let PRISTINE = '';
  afterEach(() => { if (PRISTINE) writeFileSync(CONSUMER, PRISTINE); });
  beforeAll(() => {
    lockConsumerMutation();
    PRISTINE = readFileSync(CONSUMER, 'utf8');   // 锁内快照（互斥面内=恒净本）
  });
  afterAll(() => {
    if (PRISTINE) writeFileSync(CONSUMER, PRISTINE);   // 出闸前再钉一次原样（防最后一条用例中断残留）
    unlockConsumerMutation();
  });

  it('M1 摘 fadeIn 算子应用（case 空转）→ 叶 fadeIn=1 断言红（B 面 416 hit 必炸）', () => {
    const TRIGGER = "      case 'fadeIn': d.fadeIn = op[1]; break;";
    expect(PRISTINE).toContain(TRIGGER);                 // 快照自证（残留→loud 红,不静默）
    try {
      writeFileSync(CONSUMER, PRISTINE.replace(TRIGGER, "      case 'fadeIn': break; // ★变异:摘 fadeIn 应用"));
      const r = spawnVitest('BJ304 B. 批3 消费行为');
      expect(r.status).not.toBe(0);                       // ★变异证红:fadeIn 落尘锁捕获
      expect(r.stdout).toContain('416 hit');              // 指名判别组
    } finally {
      writeFileSync(CONSUMER, PRISTINE);                  // 逐字节还原（禁 git checkout）
    }
    expect(readFileSync(CONSUMER, 'utf8')).toBe(PRISTINE);
  });

  it('M2 摘无臂占位掷流（空分支提前 continue）→ 524 耗掷锁红（B 面 524 hit 必炸）', () => {
    const TRIGGER = "      const roll = Math.floor(Math.random() * el.roll.k);\n      const pass = el.roll.op === '==' ? roll === el.roll.v : roll !== el.roll.v;\n      const arm = pass ? el.t : el.e;";
    expect(PRISTINE).toContain(TRIGGER);
    try {
      writeFileSync(CONSUMER, PRISTINE.replace(TRIGGER, "      if (!el.t && !el.e) { continue; } // ★变异:摘占位掷流\n" + TRIGGER));
      const r = spawnVitest('BJ304 B. 批3 消费行为');
      expect(r.status).not.toBe(0);                       // ★变异证红:占位耗掷锁捕获
      expect(r.stdout).toContain('524 hit');              // 指名判别组
    } finally {
      writeFileSync(CONSUMER, PRISTINE);
    }
    expect(readFileSync(CONSUMER, 'utf8')).toBe(PRISTINE);
  });
});
