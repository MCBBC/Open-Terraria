// BJ327（2026-09-24）批4 HitEffect 尘面收官——402 oldPos 轨迹盒 / 426/427 SelectRandom 带权 id 环+
// noLight 转正 / 661 光女四缺口一次接齐。vanilla-npcdust.json 数据面金标 + 行为锁 + 边界 + 变异。
//
// ★post 算子定性三步（fadeIn 翻案判例必守）逐件定谳：
//   · 402（NPC.cs :84496-:84568 亲读）：原版语义=HitEffect 用 oldPos 轨迹盒+oldPos.Length 计数
//     （TrailingMode[402]=7 逐拍移入,TrailCacheLength[402]=36 NPCID.cs:4769/:4809,SetDefaults
//     :8480-8488 Array.Resize）→ 引擎字段在位=Enemy 轨迹环 histXAt/histYAt/historyDepth（容量
//     60≥36,recordTrailHistory mode7 逐拍推入）→ 引擎消费路径=本件 pos='oldPos'+over-oldPos 环
//     +brk（oldPos[i]==Zero break,原版掷门【后】求值——zero 前有 Next(4) 掷,深度 0 拍也耗掷）。
//   · 426/427（:83970/:84024）：SelectRandom<int> = choices[Next(len)]（Utils.cs:2628）——
//     idPick 表驱动带权 id（重复项=权重:426 [229,240,161] 均一/427 [229,229,240] 2:1）;
//     noLight=★BJ304「字段在位但引擎不消费」判词翻案（同 fadeIn 判例三步定性）——引擎光链
//     VanillaDust.ts :551 烟雾族（229）!noLight 门消费;240/161 原文本无光=no-op 同相。
//   · 661（:82666-:82722）：hslToRgb 纯函数 std-expressible（Main.cs :48689-:48717,hue=
//     (float)idx/100f%1f float32 链→fround,Math.Round=ToEven;乘色 float 域=LeashedCritter
//     .ts:1577 White×0.5={127.5×4} 同源判例）/NextVector2Circular（Utils.cs:1301-1303=
//     unit(θ)×(w,h)×NextFloat,2 掷:角+幅;Game.ts:42040 同源判例）/velocity=position−Center
//     （0 掷派生）/CloneDust 回声（Dust.cs :260-288,引擎 VanillaDust.clone 1:1 在位,
//     GameHooks.cloneDust 钩子新建;`numX != 6000` 池满守卫=spawn null 短路同面）。
//
// 断言面：
//   A. 数据面金标——402/661 全结构钉值（426/427 环钉值在 bj304 A 面更新件）。
//   B. 行为锁——确定性掷流（mockReturnValue 常量/循环序列）:
//      402 轨迹环 brk/skip/位置绑定/len=36 环长权威/掷门先于零位核验;
//      426/427 idPick 带权+noLight 落活尘+引擎光链消费锁;661 posCircular/velFromCenter/
//      fadeInR01/colorHsl 逐值/clone 回声三件套。
//   C. 边界——_meta.batch4 声明+pending 收敛（402/426/427/661 出清）。
//   D. 变异自证——M1 摘 noLight 算子=426 环 noLight 断言红;M2 摘 oldPos 绑定=402 轨迹位红。
//      npcdust-mutation-mutex 共锁（bj296/bj304 同锁,锚含批4）。
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { gateConsumerMutation, lockConsumerMutation, unlockConsumerMutation } from './npcdust-mutation-mutex';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { VanillaDust } from '../src/fx/VanillaDust';
import { TILE } from '../src/core/constants';
import npcDustJson from '../src/data/vanilla-npcdust.json';
import type { GameHooks } from '../src/entities/types';
import { seededRandom, BATTERY_SEED } from './seeded-rng';
import { spawnNpcHitDust, spawnNpcDeathDust } from '../src/entities/NpcHitDust';

beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(BATTERY_SEED)); });
afterEach(() => { vi.restoreAllMocks(); });

// ★残留检测闸（与 bj296/bj304 共锁,实现=tests/npcdust-mutation-mutex.ts;锚含批4 noLight）
beforeAll(() => { gateConsumerMutation('SW_BJ327_MUT', join(process.cwd(), 'src', 'entities', 'NpcHitDust.ts')); });

const W = 180, H = 150, FLOOR = 110;
const TABLE = npcDustJson as unknown as Record<string, {
  hit?: Array<Record<string, unknown>>; death?: Array<Record<string, unknown>>;
}> & { _meta: Record<string, unknown> };

type DustCall = {
  x: number; y: number; w: number; h: number; type: number;
  sx: number; sy: number; alpha: number; scale: number;
  noGravity: boolean; vx: number; vy: number; fadeIn: number;
  noLight: boolean; color: { r: number; g: number; b: number; a: number } | null;
};

function makeWorld(): World {
  const w = new World(W, H, 11, 'bj327-npcdust-batch4');
  const st = w.store;
  w.groundLevel = 40;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

function makeHooks(w: World, captured: DustCall[], clones?: DustCall[]): GameHooks {
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
      sx = 0, sy = 0, alpha = 0, color: DustCall['color'] = null, scale = 1, noGravity = false,
    ) => {
      const rec: DustCall = { x, y: yn, w: wn, h: hn, type, sx, sy, alpha, scale, noGravity, vx: sx, vy: sy, fadeIn: 0, noLight: false, color };
      captured.push(rec);
      return rec;
    },
    // ★批4 661 CloneDust 回声钩（Game.cloneDust 直通 VanillaDust.clone;测试侧字段级拷贝记录）
    cloneDust: (d: unknown) => {
      const c = { ...(d as DustCall) };
      clones?.push(c);
      return c;
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

/** Enemy 轨迹环手动推入（pushHistory 私有——白盒括号访问,批4 轨迹环判别专用） */
function pushHist(e: Enemy, x: number, y: number): void {
  e.x = x; e.y = y;
  (e as unknown as { pushHistory(): void }).pushHistory();
}

/** Math.random 耗掷计数（mock 之上再包一层计数） */
function countRolls(): { rolls: () => number } {
  const st = { n: 0 };
  const inner = Math.random as unknown as () => number;
  vi.spyOn(Math, 'random').mockImplementation(() => { st.n++; return inner(); });
  return { rolls: () => st.n };
}

/** 常量随机（确定性判别:0=全门过/0.99=全门败）——afterEach restoreAllMocks 兜底 */
function constRandom(v: number): void {
  vi.spyOn(Math, 'random').mockReturnValue(v);
}

/** 循环序列随机（661 判别:每拍 [gate=0 过, 角=0.125, 幅=0.8, fadeIn=0.5]） */
function seqRandom(seq: number[]): void {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => seq[i++ % seq.length]);
}

// ===================== A. 数据面金标（批4 手核 NPC.cs diff=0 组钉值） =====================
describe('BJ327 A. 批4 数据面金标', () => {
  it('402（:84496-:84568）：hit hitK3 循环组 [Next3→d17 透明0.75, Next2→d229+ng, oldPos 环 len36×(Next4→[brk, Next3→d17@oldPos, Next2→d229@oldPos+ng])]', () => {
    expect(TABLE['402'].hit).toEqual([
      { hitK: 3, body: [
        { roll: { k: 3, op: '==', v: 0 }, t: [{ dust: 17, sx: 'hd', sy: -1, color: { r: 0, g: 0, b: 0, a: 0 }, scale: 0.75, line: 84504 }], line: 84504 },
        { roll: { k: 2, op: '==', v: 0 }, t: [{ dust: 229, posts: [['ng', true]], line: 84508 }], line: 84508 },
        { over: 'oldPos', len: 36, body: [
          { roll: { k: 4, op: '==', v: 0 }, t: [
            { brk: true, line: 84516 },
            { roll: { k: 3, op: '==', v: 0 }, t: [{ dust: 17, pos: 'oldPos', sx: 'hd', sy: -1, color: { r: 0, g: 0, b: 0, a: 0 }, scale: 0.75, line: 84521 }], line: 84521 },
            { roll: { k: 2, op: '==', v: 0 }, t: [{ dust: 229, pos: 'oldPos', posts: [['ng', true]], line: 84525 }], line: 84525 },
          ], line: 84516 },
        ], line: 84516 },
      ], line: 84504 },
    ]);
  });

  it('402 death：n5×[Next3→d17, d229+ng+velMul3] + oldPos 环 len36×[Next4!=0 skip, brk, 循环2×[Next3→d17@oldPos, d229@oldPos+ng+velMul3]]', () => {
    expect(TABLE['402'].death).toEqual([
      { n: 5, body: [
        { roll: { k: 3, op: '==', v: 0 }, t: [{ dust: 17, sx: 'hd', sy: -1, line: 84538 }], line: 84538 },
        { dust: 229, posts: [['ng', true], ['velMul', 3]], line: 84540 },
      ], line: 84538 },
      { over: 'oldPos', len: 36, body: [
        { roll: { k: 4, op: '!=', v: 0 }, skip: true, line: 84548 },
        { brk: true, line: 84552 },
        { n: 2, body: [
          { roll: { k: 3, op: '==', v: 0 }, t: [{ dust: 17, pos: 'oldPos', sx: 'hd', sy: -1, line: 84559 }], line: 84559 },
          { dust: 229, pos: 'oldPos', posts: [['ng', true], ['velMul', 3]], line: 84561 },
        ], line: 84559 },
      ], line: 84548 },
    ]);
  });

  it('661（:82666-:82722）：hit hitK100/death n100——Next5 门→[d267 colorHsl(div100 sat1 lum0.5 mul0.5), posCircular, velFromCenter(1|0.6), ng, fadeInR01, scaleSet0.35, clone 回声]', () => {
    const hitLeaf = {
      dust: 267,
      colorHsl: { div: 100, sat: 1, lum: 0.5, mul: 0.5 },
      posts: [['posCircular'], ['velFromCenter', 1], ['ng', true], ['fadeInR01', 0.6, 0.7], ['scaleSet', 0.35]],
      clone: { posts: [['scaleDiv', 2], ['fadeInMul', 0.85], ['colorSet', { r: 127.5, g: 127.5, b: 127.5, a: 127.5 }]] },
      line: 82676,
    };
    const deathLeaf = {
      dust: 267,
      colorHsl: { div: 100, sat: 1, lum: 0.5, mul: 0.5 },
      posts: [['posCircular'], ['velFromCenter', 0.6], ['ng', true], ['fadeInR01', 0.7, 1.1], ['scaleSet', 0.35]],
      clone: { posts: [['scaleDiv', 2], ['fadeInMul', 0.85], ['colorSet', { r: 127.5, g: 127.5, b: 127.5, a: 127.5 }]] },
      line: 82702,
    };
    expect(TABLE['661'].hit).toEqual([{ roll: { k: 5, op: '==', v: 0 }, hitK: 100, t: [hitLeaf], line: 82676 }]);
    expect(TABLE['661'].death).toEqual([{ roll: { k: 5, op: '==', v: 0 }, n: 100, t: [deathLeaf], line: 82702 }]);
  });

  it('402/661 声明：_meta.batch4 收官面（oldPos 定谳/noLight 翻案/661 四缺口）', () => {
    expect(String(TABLE._meta.batch4)).toContain('oldPos');
    expect(String(TABLE._meta.batch4)).toContain('noLight');
    expect(String(TABLE._meta.batch4)).toContain('翻案');
    expect(String(TABLE._meta.batch4)).toContain('CloneDust');
    expect(String(TABLE._meta.schema)).toContain('idPick');
    expect(String(TABLE._meta.schema)).toContain('posCircular');
  });
});

// ===================== B. 行为锁（确定性掷流判别面） =====================
describe('BJ327 B. 批4 消费行为', () => {
  it('402 hit（深度2,全门过）:每拍 [d17@pos,d229@pos,d17@old0,d229@old0,d17@old1,d229@old1] 6 粒×3 拍=18 粒 27 掷;i=2 零位 brk（掷后求值）', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(402);
    pushHist(e, 5000, 3000);       // old1（旧）
    pushHist(e, 6000, 3100);       // old0（新）
    constRandom(0);                // 全门过（先定掷流再挂计数——spyOn 后者覆盖前者会丢计数）
    const r = countRolls();
    spawnNpcHitDust(e, g, 1, e.maxHp);   // dmg=maxHp → ceil(1×3)=3 拍
    expect(cap.length).toBe(18);
    expect(r.rolls()).toBe(27);          // 每拍 2(体)+3(i0)+3(i1)+1(i2 掷门→零位 brk)=9
    for (let k = 0; k < 3; k++) {
      const b = k * 6;
      expect(cap[b].type).toBe(17);      // d17@position（透明 0.75）
      expect(cap[b].x).toBe(e.x); expect(cap[b].y).toBe(e.y);
      expect(cap[b].scale).toBe(0.75);
      expect(cap[b].color).toEqual({ r: 0, g: 0, b: 0, a: 0 });
      expect(cap[b + 1].type).toBe(229); // d229@position + ng
      expect(cap[b + 1].noGravity).toBe(true);
      expect(cap[b + 2].type).toBe(17);  // d17@old0（轨迹环位绑定）
      expect(cap[b + 2].x).toBe(6000); expect(cap[b + 2].y).toBe(3100);
      expect(cap[b + 3].type).toBe(229);
      expect(cap[b + 3].x).toBe(6000);
      expect(cap[b + 4].type).toBe(17);  // d17@old1
      expect(cap[b + 4].x).toBe(5000); expect(cap[b + 4].y).toBe(3000);
      expect(cap[b + 5].type).toBe(229);
      expect(cap[b + 5].x).toBe(5000);
    }
  });

  it('402 hit（深度0,全门过）:i=0 掷门后零位 brk——每拍 3 掷 2 粒（★掷门先于零位核验,深度 0 拍照耗掷）', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(402);
    constRandom(0);
    const r = countRolls();
    spawnNpcHitDust(e, g, 1, e.maxHp);
    expect(cap.length).toBe(6);          // 3 拍×[d17@pos,d229@pos]（零轨迹=环首 index 即 brk）
    expect(r.rolls()).toBe(9);           // 每拍 2+1——若零位核验先于掷门则 2（判别面）
    expect(cap.every((d) => d.x === e.x && d.y === e.y)).toBe(true);
  });

  it('402 hit（深度2,全门败）:零尘 114 掷——36 index 逐个耗掷门（len=36 环长权威）', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(402);
    pushHist(e, 5000, 3000);
    pushHist(e, 6000, 3100);
    constRandom(0.99);
    const r = countRolls();
    spawnNpcHitDust(e, g, 1, e.maxHp);
    expect(cap.length).toBe(0);
    expect(r.rolls()).toBe(114);         // 3 拍×(2 + 36 掷门)=114——若环长错绑深度/60 即炸
  });

  it('402 hit（深度40>len36,全门过）:环长仍 36——每拍 110 掷（TrailCacheLength 权威,不随轨迹深度膨胀）', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(402);
    for (let i = 0; i < 40; i++) pushHist(e, 5000 + i, 3000);
    constRandom(0);
    const r = countRolls();
    spawnNpcHitDust(e, g, 1, e.maxHp);
    expect(r.rolls()).toBe(330);         // 3 拍×(2 + 36×3)=330——len=36 而非 depth=40（122×3=366 即错）
    expect(cap.length).toBe(222);        // 3 拍×(2 + 36×2)
  });

  it('402 death（深度2,全门过）:5×[d17,d229+ng+vel3] + 环 i0/i1 各 4 粒@old + i2 brk——18 粒 12 掷;skip 臂全败面 5 粒 41 掷', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(402);
    pushHist(e, 5000, 3000);
    pushHist(e, 6000, 3100);
    constRandom(0);
    const r = countRolls();
    spawnNpcDeathDust(e, g, 1);
    expect(cap.length).toBe(18);         // 10(位置环) + 8(轨迹环 2 index×2 拍×2 粒)
    expect(r.rolls()).toBe(12);          // 5 + (1+2)+(1+2) + 1(i2 掷门→brk)
    for (let k = 0; k < 5; k++) {
      expect(cap[k * 2].type).toBe(17);
      expect(cap[k * 2 + 1].type).toBe(229);
      expect(cap[k * 2 + 1].noGravity).toBe(true);
      expect(cap[k * 2 + 1].vx).toBeCloseTo(cap[k * 2 + 1].sx * 3, 10);   // velocity ×= 3f
    }
    const olds = cap.slice(10);
    expect(olds.filter((d) => d.x === 6000).length).toBe(4);   // i0: [d17,d229,d17,d229]
    expect(olds.filter((d) => d.x === 5000).length).toBe(4);   // i1
    expect(olds.every((d) => d.type === 17 || d.type === 229)).toBe(true);
    // 全门败面:Next(4)!=0 过 → skip（36 index 逐个耗掷）;d17 门败 → 仅 5 粒 d229@pos
    const cap2: DustCall[] = [];
    const g2 = makeHooks(w, cap2);
    const e2 = spawn(402, 110, FLOOR - 4);
    constRandom(0.99);
    const r2 = countRolls();
    spawnNpcDeathDust(e2, g2, 1);
    expect(cap2.length).toBe(5);
    expect(cap2.every((d) => d.type === 229)).toBe(true);
    expect(r2.rolls()).toBe(41);         // 5 + 36 掷门
  });

  it('426/427 death idPick 带权:0.99 → 426 环全 161（[229,240,161] 尾位）/427 环全 240（[229,229,240] 尾位）;noLight 落活尘', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(426, 110, FLOOR - 4);
    constRandom(0.99);
    spawnNpcDeathDust(e, g, 1);
    const ring = cap.filter((d) => d.type !== 241);
    expect(ring.length).toBe(30);
    expect(ring.every((d) => d.type === 161)).toBe(true);   // Next(3)=2 → idPick[2]
    expect(ring.every((d) => d.noLight)).toBe(true);
    const cap2: DustCall[] = [];
    const g2 = makeHooks(w, cap2);
    const e2 = spawn(427, 110, FLOOR - 4);
    spawnNpcDeathDust(e2, g2, 1);
    const ring2 = cap2.filter((d) => d.type !== 241);
    expect(ring2.length).toBe(20);
    expect(ring2.every((d) => d.type === 240)).toBe(true);
    expect(ring2.every((d) => d.noLight)).toBe(true);
  });

  it('noLight 引擎消费锁（★BJ304「引擎不消费」翻案）:229 带 noLight → 光链零推;裸 229 → 推光;clone 沿 :279 复制 noLight', () => {
    const vd = new VanillaDust();
    const d1 = vd.spawn(100, 100, 10, 10, 229)!;
    expect(d1.noLight).toBe(false);      // spawn 归位
    d1.noLight = true;
    vd.update(0, 0, 800, 600);
    expect(vd.lights.length).toBe(0);    // 烟雾族 :551 !noLight 门拦截（引擎消费实证）
    const d2 = vd.spawn(200, 100, 10, 10, 229)!;
    expect(d2.noLight).toBe(false);
    vd.update(0, 0, 800, 600);
    expect(vd.lights.length).toBeGreaterThan(0);   // 裸 229 推光（SMOKE_LIGHT[229]=(0.3,0.65,0.7)）
    const d3 = vd.spawn(300, 100, 10, 10, 229)!;
    d3.noLight = true;
    const c = vd.clone(d3)!;
    expect(c.noLight).toBe(true);        // CloneDust :279 noLight 字段复制（回声链保真）
  });

  it('661 hit（循环序列全过）:100 拍 400 掷;pos=Center+unit(θ)×(w,h)×mag;vel=pos−Center 逐值;fadeIn=0.95;scale=0.35', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const clones: DustCall[] = [];
    const g = makeHooks(w, cap, clones);
    const e = spawn(661);
    constRandom(0);
    seqRandom([0, 0.125, 0.8, 0.5]);     // [Next5 门=0 过, 角, 幅, fadeIn]（先定掷流再挂计数）
    const r = countRolls();
    spawnNpcHitDust(e, g, 1, e.maxHp);   // maxHp=5 → hitK=100
    expect(cap.length).toBe(100);
    expect(clones.length).toBe(100);
    expect(r.rolls()).toBe(400);         // 100×(门1+角1+幅1+fadeIn1)
    const a = 0.125 * Math.PI * 2;
    for (let k = 0; k < 100; k++) {
      const d = cap[k];
      expect(d.type).toBe(267);
      expect(d.x).toBe(e.cx + Math.cos(a) * e.w * 0.8);   // NextVector2Circular(width,height)=unit(θ)×(w,h)×mag
      expect(d.y).toBe(e.cy + Math.sin(a) * e.h * 0.8);
      expect(d.vx).toBe(d.x - e.cx);   // velocity = position − Center（hit 无 ×k）
      expect(d.vy).toBe(d.y - e.cy);
      expect(d.noGravity).toBe(true);
      expect(d.fadeIn).toBe(0.95);     // 0.6 + 0.5×0.7×1
      expect(d.scale).toBe(0.35);
      // clone 回声三件套（Dust.cs :288-:286 字段复制+批4 posts）
      const c = clones[k];
      expect(c.type).toBe(267);
      expect(c.x).toBe(d.x);           // position 复制
      expect(c.scale).toBe(d.scale / 2);          // scale /= 2f
      expect(c.fadeIn).toBeCloseTo(d.fadeIn * 0.85, 12);   // fadeIn ×= 0.85f
      expect(c.color).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 127.5 });   // White×0.5（float 域判例）
    }
  });

  it('661 colorHsl 彩虹逐值:k=0→(127.5,0,0,127.5)/k=25→(63.5,127.5,0,127.5)/k=50→(0,127.5,127.5,127.5)——hslToRgb(fround(k/100%1),1,0.5)×0.5 手核钉值', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(661);
    constRandom(0);
    seqRandom([0, 0.125, 0.8, 0.5]);
    spawnNpcHitDust(e, g, 1, e.maxHp);
    // HSL 标准色相钉值（hue 0=红/0.25=黄绿域/0.5=青;×0.5 后 a=127.5——C# double 链核验:
    //   k=25 r 通道=(1×(2/3−(0.25+1/3)))×6×255=127.50000000000005684→128（Math.Round ToEven,
    //   ULP 上方——IEEE754 double 与 C# 同构,非直觉 127.5 恰边界）→ ×0.5=64）
    expect(cap[0].color).toEqual({ r: 127.5, g: 0, b: 0, a: 127.5 });
    expect(cap[25].color).toEqual({ r: 64, g: 127.5, b: 0, a: 127.5 });
    expect(cap[50].color).toEqual({ r: 0, g: 127.5, b: 127.5, a: 127.5 });
  });

  it('661 death：vel=(pos−Center)×0.6 逐值;fadeIn=0.7+0.5×1.1=1.25;n=100 固定', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(661);
    constRandom(0);
    seqRandom([0, 0.125, 0.8, 0.5]);
    spawnNpcDeathDust(e, g, 1);
    expect(cap.length).toBe(100);
    const a = 0.125 * Math.PI * 2;
    for (const d of cap) {
      expect(d.x).toBe(e.cx + Math.cos(a) * e.w * 0.8);
      expect(d.vx).toBe((d.x - e.cx) * 0.6);   // death: velocity = (position − Center) × 0.6f
      expect(d.vy).toBe((d.y - e.cy) * 0.6);
      expect(d.fadeIn).toBe(1.25);             // 0.7 + 0.5×1.1×1
    }
  });
});

// ===================== C. 边界（_meta 收官声明 + pending 出清） =====================
describe('BJ327 C. 边界', () => {
  it('_meta：批4 四型入表（402/426/427/661）+ pending 型域出清（收官:滚动清单+根级门组外无登记）', () => {
    for (const vid of ['402', '426', '427', '661']) expect(TABLE[vid]).toBeDefined();
    const ids = Object.keys(TABLE).filter((k) => k !== '_meta');
    expect(ids.length).toBe(334);
    const pend = TABLE._meta.pending as Array<{ types: number[]; reason: string }>;
    const pendIds = new Set(pend.filter((p) => p.types.length < 100).flatMap((p) => p.types));
    for (const vid of [402, 426, 427, 661]) {
      expect(pendIds.has(vid)).toBe(false);   // 尘面收官:批4 四型 pending 出清
    }
    // 未接组滚动清单仍在（34/289 等 std-expressible 族——批4 noLight 转正后其阻塞面已清,待后续批接入）
    expect(String(TABLE._meta.batch4)).toContain('尘面收官');
  });
});

// ===================== D. 变异自证（原子+逐字节还原,共锁） =====================
describe('BJ327 D. 变异自证', () => {
  const CONSUMER = join(process.cwd(), 'src', 'entities', 'NpcHitDust.ts');
  const spawnVitest = (filter: string) => spawnSync('npx', ['vitest', 'run', 'tests/bj327-npcdust-batch4.test.ts', '--no-file-parallelism', '-t', filter], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
    env: { ...process.env, SW_BJ327_MUT: '1' },   // ★子进程豁免残留检测闸（对变异文件跑 B 面）
  });
  let PRISTINE = '';
  afterEach(() => { if (PRISTINE) writeFileSync(CONSUMER, PRISTINE); });
  beforeAll(() => {
    lockConsumerMutation();
    PRISTINE = readFileSync(CONSUMER, 'utf8');   // 锁内快照（互斥面内=恒净本）
  });
  afterAll(() => {
    if (PRISTINE) writeFileSync(CONSUMER, PRISTINE);
    unlockConsumerMutation();
  });

  it('M1 摘 noLight 算子应用（case 空转）→ 426 环 noLight 断言红（B 面 idPick 带权必炸）', () => {
    const TRIGGER = "      case 'noLight': d.noLight = op[1]; break;";
    expect(PRISTINE).toContain(TRIGGER);
    try {
      writeFileSync(CONSUMER, PRISTINE.replace(TRIGGER, "      case 'noLight': break; // ★变异:摘 noLight 应用"));
      const r = spawnVitest('426/427 death idPick');
      expect(r.status).not.toBe(0);               // ★变异证红:noLight 落活尘锁捕获
      expect(r.stdout).toContain('426/427 death idPick');
    } finally {
      writeFileSync(CONSUMER, PRISTINE);
    }
    expect(readFileSync(CONSUMER, 'utf8')).toBe(PRISTINE);
  });

  it('M2 摘 oldPos 绑定（恒取最新位）→ 402 轨迹位判别红（B 面 深度2 hit 必炸）', () => {
    const TRIGGER = '    x = e.histXAt(ctx.oldIdx);';
    expect(PRISTINE).toContain(TRIGGER);
    try {
      writeFileSync(CONSUMER, PRISTINE.replace(TRIGGER, '    x = e.histXAt(0); // ★变异:摘轨迹位绑定'));
      const r = spawnVitest('402 hit（深度2,全门过）');
      expect(r.status).not.toBe(0);               // ★变异证红:old0/old1 双位判别捕获
      expect(r.stdout).toContain('402 hit');
    } finally {
      writeFileSync(CONSUMER, PRISTINE);
    }
    expect(readFileSync(CONSUMER, 'utf8')).toBe(PRISTINE);
  });
});
