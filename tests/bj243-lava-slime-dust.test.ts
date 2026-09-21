// BJ243（2026-09-21）熔岩史莱姆粒子面定谳+补口：
// ★用户实报"熔岩史莱姆原版有粒子,本仓没有"——定谳：熔岩史莱姆 = NPC 59
// （NPCID.cs:11189;实报文案里的"NPC 16"是母史莱姆 MotherSlime——16 无环境粒子面,
//  仅受击尘 :85677 尘 4 系,与本报无关）。
// 原版三面（Terarria1457/Terraria/NPC.cs,1458 同行号零变更）：
//   ① 环境尘 AI_001 :62068-62075——每 tick 无条件 1× 尘 6（Torch）Speed=velocity×0.2、
//      α100、scale1.7、noGravity=true + 点光 (1,0.3,0.1)（:62071,光半块本仓旧有）；
//   ② 受击尘 HitEffect life>0 :86539-86551——59/60/151 = ceil(dmg/lifeMax×80) 簇尘 6、
//      SpeedX=2×hitDirection/SpeedY=-1/α=npc.alpha/scale1.5、Next(8)!=0→noGravity；
//   ③ 死亡尘 life<=0 :86553-86560——40 簇同参数；随后 :86602 门 return=无 HitEffect gore。
// 断言：①每拍 1 粒（id/盒/速/α/scale/noGravity 逐值）②非 59 史莱姆零环境尘（对照弹）
// ③受击尘数=hp 差反推公式+逐参数 ④60/151 同族 ⑤死亡 40 簇 ⑥命中面非 59 零尘 6。
// BJ246（2026-09-21）追加：死亡泼岩浆行为面（NPC.cs:86561-86645）——专家/Skyblock 59
// 中心格 Next(50,150) 钉值/Skyblock 全盒 255、60/151 remix+getGood/lowTiles 门、
// 普通世界零泼面（原版本相锁）、实心/半砖/有液/越界/傀儡豁免面。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
import { LIQUID_TYPE } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';
import { seededRandom, BATTERY_SEED } from './seeded-rng';

beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(BATTERY_SEED)); });
afterEach(() => { vi.restoreAllMocks(); });

const W = 160, H = 140, FLOOR = 100;

type DustCall = {
  x: number; y: number; w: number; h: number; type: number;
  sx: number; sy: number; alpha: number; scale: number | undefined; noGravity: boolean;
};

function makeWorld(): World {
  const w = new World(W, H, 11, 'bj243-lava-slime');
  const st = w.store;
  w.groundLevel = 40;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

/** spawnDust 捕获桩（缺省=静默丢弃契约,此处全量记账） */
function makeHooks(w: World, captured: DustCall[], playerAt = { x: 5, y: FLOOR - 2 }) {
  const player = new Player(playerAt.x * TILE, playerAt.y * TILE, new Inventory());
  return {
    world: w, player,
    enemies: () => [] as Enemy[], critters: () => [], npcs: () => [],
    entities: { nextId: 1, add: () => {} },
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {}, cutTile: () => {},
    spawnDust: (
      x: number, y: number, wn: number, hn: number, type: number,
      sx = 0, sy = 0, alpha = 0, _color: unknown = null, scale = 1, noGravity = false,
    ) => {
      // 返回活对象引用——调用方后置写 noGravity（受击尘 Next(8)!=0 支）可观测
      const rec: DustCall = { x, y, w: wn, h: hn, type, sx, sy, alpha, scale, noGravity };
      captured.push(rec);
      return rec as unknown as { noGravity: boolean };
    },
    scene: {},
  } as unknown as GameHooks;
}

function spawn(vid: number, tx = 100, ty = FLOOR - 2): Enemy {
  const e = Enemy.fromVanilla(vid, tx * TILE, ty * TILE);
  expect(e).not.toBeNull();
  return e!;
}

function slimeAIOf(e: Enemy): (g: GameHooks, p: Player | null) => void {
  return (e as unknown as { slimeAI(h: GameHooks, p: Player | null): void }).slimeAI.bind(e);
}

describe('BJ243 熔岩史莱姆粒子面（NPC 59）', () => {
  it('① 环境尘：AI_001 每 tick 恰 1× 尘 6（速=velocity×0.2、α100、scale1.7、noGravity）', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(59);
    e.vx = 2;                                   // 定向初速（首拍摩擦前发射=0.4 可断言）
    e.vy = 0;
    const ai = slimeAIOf(e);
    const preW = e.w, preH = e.h;
    const TICKS = 20;
    // 逐拍快照：发射点在 AI 中段（物理前）——每拍尘位/尘速=当拍入位/入速
    const snap: Array<{ x: number; y: number; vx: number; vy: number }> = [];
    for (let t = 0; t < TICKS; t++) {
      snap.push({ x: e.x, y: e.y, vx: e.vx, vy: e.vy });
      ai(g, g.player);
    }
    // 恰 1 粒/tick（无掷率门=原版无条件面）
    expect(cap.length).toBe(TICKS);
    for (let t = 0; t < TICKS; t++) {
      const d = cap[t], s = snap[t];
      expect(d.type).toBe(6);                              // DustID.Torch（:62072）
      expect(d.w).toBe(preW); expect(d.h).toBe(preH);      // 盒=NPC 全盒（无 inset）
      expect(d.x).toBe(s.x); expect(d.y).toBe(s.y);        // 发射点=当拍 AI 入位
      expect(d.sx).toBeCloseTo(s.vx * 0.2, 5);             // velocity×0.2
      expect(d.sy).toBeCloseTo(s.vy * 0.2, 5);
      expect(d.alpha).toBe(100);                           // :62072 第 7 参
      expect(d.scale).toBe(1.7);                           // :62072 第 9 参
      expect(d.noGravity).toBe(true);                      // :62073（出生参直置）
    }
    expect(cap[0].sx).toBeCloseTo(0.4, 5);                 // 首拍 vx=2 → 0.4 定向锚
    // 点光半块（旧有,锚定不回退）：(1,0.3,0.1)（:62071）
    expect((e as unknown as { lightRGB: number[] }).lightRGB).toEqual([1, 0.3, 0.1]);
  });

  it('② 同族对照：非 59 史莱姆（1/2/16）环境零尘', () => {
    for (const vid of [1, 2, 16]) {
      const w = makeWorld();
      const cap: DustCall[] = [];
      const g = makeHooks(w, cap);
      const e = spawn(vid);
      const ai = slimeAIOf(e);
      for (let t = 0; t < 30; t++) ai(g, g.player);
      expect(cap.length, `vid=${vid} 环境尘应整缺`).toBe(0);
    }
  });

  it('③ 受击尘：ceil(防后伤/lifeMax×80) 簇尘 6（SpeedX=2×hitDirection/-1、α50、scale1.5、7/8 noGravity）', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(59);
    const hp0 = e.hp;
    e.hurt(20, 1, 0, g);                          // hitDirection=+1
    const dealt = hp0 - e.hp;                     // 防后实扣=原版 dmg 入参
    expect(dealt).toBeGreaterThan(0);
    expect(e.hp).toBeGreaterThan(0);              // 存活受击支
    const n = cap.filter((d) => d.type === 6).length;
    expect(n).toBe(Math.ceil((dealt / e.maxHp) * 80));
    for (const d of cap) {
      expect(d.type).toBe(6);
      expect(d.sx).toBe(2);                       // 2×hitDirection（kbx=+1）
      expect(d.sy).toBe(-1);
      expect(d.alpha).toBe(50);                   // npc.alpha（SetDefaults :9559）
      expect(d.scale).toBe(1.5);
    }
    // noGravity 7/8（Next(8)!=0）——播种确定性,带宽断言防脆
    const ng = cap.filter((d) => d.noGravity).length;
    expect(ng).toBeGreaterThanOrEqual(Math.floor(n * 0.6));
    expect(ng).toBeLessThanOrEqual(n);            // 上限=全 noGravity 不可能但恒真界
    expect(ng).toBeLessThan(n);                   // 至少 1 粒带重力（1/8 概率,n≥8 必现）
  });

  it('④ 同族 60/151：受击尘同式（α=0——SetDefaults 无 alpha 项）', () => {
    for (const vid of [60, 151]) {
      const w = makeWorld();
      const cap: DustCall[] = [];
      const g = makeHooks(w, cap);
      const e = spawn(vid);
      const hp0 = e.hp;
      e.hurt(20, 1, 0, g);
      const dealt = hp0 - e.hp;
      const n = cap.filter((d) => d.type === 6).length;
      expect(n, `vid=${vid}`).toBe(Math.ceil((dealt / e.maxHp) * 80));
      for (const d of cap) {
        expect(d.type).toBe(6);
        expect(d.alpha, `vid=${vid} α=npc.alpha`).toBe(e.spawnAlpha);
        expect(d.scale).toBe(1.5);
      }
    }
  });

  it('⑤ 死亡尘：40 簇尘 6 同参数（HitEffect life<=0 支）', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(59);
    e.hurt(e.hp + 9999, -1, 0, g);                // 致死,hitDirection=-1
    expect(e.dead).toBe(true);
    const n = cap.filter((d) => d.type === 6).length;
    expect(n).toBe(40);
    for (const d of cap) {
      expect(d.type).toBe(6);
      expect(d.sx).toBe(-2);                      // 2×hitDirection（kbx=-1）
      expect(d.sy).toBe(-1);
      expect(d.alpha).toBe(50);
      expect(d.scale).toBe(1.5);
    }
  });

  it('⑥ 对照弹：非岩浆族受击/死亡零尘 6（绿史莱姆血尘系=尘 4 家族,弹变异判别力）', () => {
    const w = makeWorld();
    const cap: DustCall[] = [];
    const g = makeHooks(w, cap);
    const e = spawn(1);
    e.hurt(10, 1, 0, g);                          // 存活受击
    expect(e.hp).toBeGreaterThan(0);
    expect(cap.filter((d) => d.type === 6).length).toBe(0);
    const e3 = spawn(1);
    e3.hurt(e3.hp + 9999, 1, 0, g);
    expect(cap.filter((d) => d.type === 6).length).toBe(0);
  });
});

// ===================== BJ246 岩浆族死亡泼岩浆（NPC.cs:86561-86645） =====================
// 59 中心格 px=(1600+w/2, 1568+h/2) → tile (100,98)（w∈[0,64)/h∈[16,32) 稳定;落地前
// sanity 预检空格）。RNG 钉值：Next(50,150)=50+⌊r×100⌋——r=0.5→100 / r=0.99→149。
describe('BJ246 岩浆族死亡泼岩浆', () => {
  /** 中心格坐标（与原版 (int)(Center.X/16f) 同式,测试侧独立复算） */
  function centerTileOf(e: Enemy): [number, number] {
    return [Math.trunc((e.x + e.w / 2) / 16), Math.trunc((e.y + e.h / 2) / 16)];
  }

  it('① 专家 59 死亡→中心格 liquid 钉值+lava 型（r=0.5→100,r=0.99→149;受击不泼）', () => {
    for (const [r, want] of [[0.5, 100], [0.99, 149]] as const) {
      const w = makeWorld();
      w.difficulty = 1;                           // Main.expertMode（世界难度轴）
      const cap: DustCall[] = [];
      const g = makeHooks(w, cap);
      const e = spawn(59);
      const [tx, ty] = centerTileOf(e);
      expect(tx).toBe(100); expect(ty).toBe(98);  // 几何钉（本测试世界固定落点）
      expect(w.store.isSolid(tx, ty)).toBe(false); // sanity：落点空格
      vi.spyOn(Math, 'random').mockReturnValue(r);
      // 受击（life>0 支）不泼——独立实体（同一实体受击后 iframes 会吞掉同拍致死击）
      const eHit = spawn(59);
      eHit.hurt(20, 1, 0, g);
      expect(eHit.hp).toBeGreaterThan(0);
      expect(w.store.liquid[w.store.idx(tx, ty)]).toBe(0);
      e.hurt(e.hp + 9999, 1, 0, g);               // 直接致死（首击,无敌帧零）
      expect(e.dead).toBe(true);
      const i = w.store.idx(tx, ty);
      expect(w.store.liquid[i]).toBe(want);       // (byte)Next(50,150) 钉值（:86591）
      expect(w.store.liquidType[i]).toBe(LIQUID_TYPE.LAVA);  // lava(true)（:86592）
    }
  });

  it('② 普通世界零泼面（原版本相锁）：经典 59/60/151 + 专家 60/151 死亡均零泼', () => {
    for (const [vid, diff] of [[59, 0], [60, 0], [151, 0], [60, 1], [151, 1]] as const) {
      const w = makeWorld();
      w.difficulty = diff;
      const g = makeHooks(w, []);
      const e = spawn(vid);
      const [tx, ty] = centerTileOf(e);
      e.hurt(e.hp + 9999, 1, 0, g);
      expect(e.dead).toBe(true);
      const i = w.store.idx(tx, ty);
      expect(w.store.liquid[i], `vid=${vid} diff=${diff} :86561/:86602 门均不满足`).toBe(0);
      expect(w.store.liquidType[i]).toBe(LIQUID_TYPE.NONE);
    }
  });

  it('③ remix 门（:86602）：remix+getGood 下 60/151 中心格泼;59 恒零泼（:86561 !remix 排除）;裸 remix 零泼', () => {
    // remix+getGood：60/151 泼（getGoodWorld 臂）;59 虽经 FTW 抬档 expertMode=true 仍被 !remixWorld 排除
    // （每 vid 独立世界——同格复用会吃到前例残液,液格豁免门会让断言串味）
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    for (const vid of [60, 151]) {
      const wA = makeWorld();
      wA.seedFlags = { remix: true, getGoodWorld: true };
      const gA = makeHooks(wA, []);
      const eA = spawn(vid);
      const [tx, ty] = centerTileOf(eA);
      eA.hurt(eA.hp + 9999, 1, 0, gA);
      const iA = wA.store.idx(tx, ty);
      expect(wA.store.liquid[iA], `vid=${vid}`).toBe(100);
      expect(wA.store.liquidType[iA]).toBe(LIQUID_TYPE.LAVA);
    }
    const wC = makeWorld();
    wC.seedFlags = { remix: true, getGoodWorld: true };
    const gA59 = makeHooks(wC, []);
    const e59 = spawn(59);
    const [tx59, ty59] = centerTileOf(e59);
    e59.hurt(e59.hp + 9999, 1, 0, gA59);
    expect(wC.store.liquid[wC.store.idx(tx59, ty59)], '59 remix 排除（:86561）').toBe(0);
    // 裸 remix（无 getGood/lowTiles）：60/151 不泼（:86602 末臂不满足）
    const wB = makeWorld();
    wB.seedFlags = { remix: true };
    for (const vid of [60, 151]) {
      const gB = makeHooks(wB, []);
      const eB = spawn(vid);
      const [tx, ty] = centerTileOf(eB);
      eB.hurt(eB.hp + 9999, 1, 0, gB);
      expect(wB.store.liquid[wB.store.idx(tx, ty)], `vid=${vid} 裸 remix`).toBe(0);
    }
  });

  it('④ Skyblock 全盒 255（:86565-86584）：经典 lowTiles 59 全盒含端四至;有液/实心格豁免;盒外零泼', () => {
    const w = makeWorld();
    w.skyblockLowTiles = true;                    // WorldGen.Skyblock.lowTiles（经典难度仍泼）
    const g = makeHooks(w, []);
    const e = spawn(59);
    // fromVanilla 以给定点为中心锚（e.x=1600−w/2）——盒四至按实体盒动态复算
    const x0 = Math.trunc(e.x / 16), x1 = Math.trunc((e.x + e.w) / 16);
    const y0 = Math.trunc(e.y / 16), y1 = Math.trunc((e.y + e.h) / 16);
    expect([Math.trunc((e.x + e.w / 2) / 16), Math.trunc((e.y + e.h / 2) / 16)]).toEqual([100, 98]);
    expect(x1 - x0).toBeGreaterThanOrEqual(1);    // 盒至少 2×2（w/h 跨格含端）
    expect(y1 - y0).toBeGreaterThanOrEqual(1);
    w.store.setLiquid(x1, y1, 128, LIQUID_TYPE.WATER);       // 盒内既有水格
    w.store.setTile(x1, y0, 1);                              // 盒内实心格
    e.hurt(e.hp + 9999, 1, 0, g);
    expect(e.dead).toBe(true);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const i = w.store.idx(x, y);
        if (x === x1 && y === y1) {
          expect(w.store.liquid[i]).toBe(128);               // 有液格豁免（liquid==0 门）
          expect(w.store.liquidType[i]).toBe(LIQUID_TYPE.WATER);
        } else if (x === x1 && y === y0) {
          expect(w.store.liquid[i]).toBe(0);                 // 实心格豁免（SolidTile 门）
        } else {
          expect(w.store.liquid[i], `${x},${y}`).toBe(255);  // byte.MaxValue（:86577）
          expect(w.store.liquidType[i]).toBe(LIQUID_TYPE.LAVA);
        }
      }
    }
    expect(w.store.liquid[w.store.idx(x1 + 1, y0)]).toBe(0); // 盒外零泼
    expect(w.store.liquid[w.store.idx(x0 - 1, y1)]).toBe(0);
    // 60/151 经典 lowTiles 不泼（:86602 remixWorld 门）——60 只有 remix+lowTiles 才全盒
    const w2 = makeWorld();
    w2.skyblockLowTiles = true;
    const g2 = makeHooks(w2, []);
    const e60 = spawn(60);
    const [tx, ty] = centerTileOf(e60);
    e60.hurt(e60.hp + 9999, 1, 0, g2);
    expect(w2.store.liquid[w2.store.idx(tx, ty)]).toBe(0);
    // remix+lowTiles（无 getGood）：60 全盒支
    const w3 = makeWorld();
    w3.skyblockLowTiles = true;
    w3.seedFlags = { remix: true };
    const g3 = makeHooks(w3, []);
    const e60b = spawn(60);
    const bx0 = Math.trunc(e60b.x / 16), bx1 = Math.trunc((e60b.x + e60b.w) / 16);
    const by0 = Math.trunc(e60b.y / 16), by1 = Math.trunc((e60b.y + e60b.h) / 16);
    e60b.hurt(e60b.hp + 9999, 1, 0, g3);
    let lavaCells = 0;
    for (let x = bx0; x <= bx1; x++) {
      for (let y = by0; y <= by1; y++) {
        const i = w3.store.idx(x, y);
        // 全盒支逐格（60 落点无既有液/实心格场景）——每格必 255 lava
        if (w3.store.liquidType[i] === LIQUID_TYPE.LAVA && w3.store.liquid[i] === 255) lavaCells++;
      }
    }
    expect(lavaCells).toBe((bx1 - bx0 + 1) * (by1 - by0 + 1));   // 全盒满格
  });

  it('⑤ 豁免面：中心实心格拒泼;半砖格仍泼（SolidTile 1:1 非 isSolid）;傀儡端零写', () => {
    // 实心格（dirt）→ SolidTile true → 拒泼（:86589）
    const w = makeWorld();
    w.difficulty = 1;
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const g = makeHooks(w, []);
    const e = spawn(59);
    const [tx, ty] = centerTileOf(e);
    w.store.setTile(tx, ty, 1);
    e.hurt(e.hp + 9999, 1, 0, g);
    expect(w.store.liquid[w.store.idx(tx, ty)]).toBe(0);
    // 半砖格 → 原版 SolidTile=false（:70650 !halfBrick 项）→ 仍泼——判别 isSolid 误用
    const w2 = makeWorld();
    w2.difficulty = 1;
    const g2 = makeHooks(w2, []);
    const e2 = spawn(59);
    const [tx2, ty2] = centerTileOf(e2);
    w2.store.setTile(tx2, ty2, 1);
    w2.store.half[w2.store.idx(tx2, ty2)] = 1;
    e2.hurt(e2.hp + 9999, 1, 0, g2);
    const i2 = w2.store.idx(tx2, ty2);
    expect(w2.store.liquid[i2]).toBe(100);
    expect(w2.store.liquidType[i2]).toBe(LIQUID_TYPE.LAVA);
    // 傀儡端（netPuppet=客户端 netMode==1 等价）：零写
    const w3 = makeWorld();
    w3.difficulty = 1;
    const g3 = makeHooks(w3, []);
    const e3 = spawn(59);
    e3.netPuppet = true;
    const [tx3, ty3] = centerTileOf(e3);
    e3.hurt(e3.hp + 9999, 1, 0, g3);
    expect(w3.store.liquid[w3.store.idx(tx3, ty3)]).toBe(0);
  });
});
