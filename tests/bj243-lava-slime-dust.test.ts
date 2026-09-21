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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
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
