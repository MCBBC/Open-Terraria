// FX45 腐化者唾液（Vile Spit）粒子站 1:1 回归（2026-09-16 用户实报"弹幕只有球体，
// 原版飞行时滴落粒子尾迹"）。
// 病根：AI_009 的 112/666 飞行尾迹支整缺（NPC.cs:21644-21650，num133<2 双循环内
// 每 tick 2 粒尘 18 CorruptGibs）；出生相 ai[0]==2 的 20 粒爆裂被 '#7A4FB0' 泛色
// spawnParticles 伪造（原版 :21560-21572 = NPC_Killed_9 音 + 20× 尘 18 α100
// scale1.8 尘速×1.3+弹速 noGravity）；死亡 20 粒（HitEffect :86360-86374）落通用
// 彩色粒子近似。三站全部对齐后此测试钉死：尘型/频数/α/scale/速度算子五要素。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { bouncingBallAI } from '../src/entities/bossAI_moon_events';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';

const W = 160, H = 140, FLOOR = 100;

interface DustCall {
  x: number; y: number; w: number; h: number;
  type: number; sx: number; sy: number; alpha: number; scale: number;
  noGravity: boolean;
  // 调用侧后置覆写后的终态（stub 直接把形参装进返回对象,AI 再原地改写）
  vx: number; vy: number;
}

function makeHooks() {
  const dusts: DustCall[] = [];
  const particles: unknown[] = [];
  const sfx: string[][] = [];
  const w = new World(W, H, 11, 'fx45');
  const st = w.store;
  for (let x = 0; x < W; x++) st.setTile(x, FLOOR, 1);   // 空旷空气域飞行
  // 玩家在弹体左侧且 cy 对齐 → num125=7 直飞 vx=−7 / vy=0（尾迹速度钉值可断言）
  const player = { x: 20 * TILE, y: (FLOOR - 4) * TILE + 8 - 21, w: 20, h: 42, cx: 20 * TILE + 10, cy: (FLOOR - 4) * TILE + 8, dead: false } as unknown as Player;
  const hooks = {
    world: w,
    player,
    dust: { spawn: () => null },
    // 原版 NewDust 形参直装（无池内 ±2 速度抖/±0.01 scale 抖）→ 调用侧算子可精确断言
    spawnDust: (x: number, y: number, bw: number, bh: number, type: number,
      sx = 0, sy = 0, alpha = 0, _c: unknown = null, scale = 1, noGravity = false) => {
      const d: DustCall = {
        x, y, w: bw, h: bh, type, sx, sy, alpha, scale, noGravity,
        vx: sx, vy: sy,
      };
      dusts.push(d);
      return d;
    },
    spawnParticles: (...a: unknown[]) => { particles.push(a); return null; },
    playSfxFiles: (files: string[]) => { sfx.push(files); },
    playSfx: () => {}, playSfxWav: () => {},
    addDamageNumber: () => {}, spawnDrop: () => null, onEnemyKilled: () => {},
    spawnEnemy: () => {}, addLightAt: () => {}, notifyInventoryChanged: () => {},
    enemies: () => [], critters: () => [], npcs: () => [],
    entities: { add: () => {} },
    scene: { zoneGraveyard: false },
  } as unknown as GameHooks;
  return { hooks, dusts, particles, sfx, player, world: w };
}

const spawnSpit = (h: ReturnType<typeof makeHooks>, vid: 112 | 666): Enemy => {
  const e = Enemy.fromVanilla(vid, 40 * TILE, (FLOOR - 4) * TILE)!;
  return e;
};

// ===========================================================================
// ① 飞行尾迹（NPC.cs:21644-21650）：每 tick 恰 2 粒（num133<2 双循环）——
//    尘 18、盒 (pos.X, pos.Y+2, w, h)、sp=v×0.1、α80（≠同族其余支的 100）、
//    scale1.3、尘速 ×0.3、noGravity
// ===========================================================================
describe('FX45 ① VileSpit 飞行尾迹（NPC.cs:21644-21650 每 tick 2 粒 d18）', () => {
  it('每 tick 恰 2 粒；type 18 / α80 / scale1.3 / noGravity / 盒 (x, y+2, w, h)', () => {
    const h = makeHooks();
    const e = spawnSpit(h, 112);
    const perTick: DustCall[][] = [];
    for (let t = 0; t < 10; t++) {
      const from = h.dusts.length;
      bouncingBallAI(e, h.hooks, h.player);
      perTick.push(h.dusts.slice(from));
      // 尘锚 = 位移积分前的弹体位（积分在尾迹站之后 +vx）→ d.x = e.x − vx
      for (const d of perTick[t]) {
        expect(d.type, '尘型 = 18 CorruptGibs').toBe(18);
        expect(d.noGravity, '尾迹/爆裂两站均 noGravity').toBe(true);
        expect(d.x).toBeCloseTo(e.x - e.vx, 9);    // 盒 X 不偏移（Y+2 是取尘锚）
        expect(d.y).toBeCloseTo(e.y - e.vy + 2, 9);
        expect(d.w).toBe(e.w);
        expect(d.h).toBe(e.h);
      }
    }
    // tick1 = 2 尾迹；tick2 = 20 出生爆裂 + 2 尾迹；tick3..10 = 2×8 尾迹
    expect(h.dusts.length).toBe(2 + 22 + 2 * 8);
    const trail = h.dusts.filter((d) => d.alpha === 80);
    const burst = h.dusts.filter((d) => d.alpha === 100);
    expect(trail.length).toBe(2 * 10);
    expect(burst.length).toBe(20);
    for (const d of trail) expect(d.scale).toBe(1.3);
  });

  it('速度算子：sp = 弹速 ×0.1 入参，调用侧再 ×0.3（终速 = 弹速×0.03）', () => {
    const h = makeHooks();
    const e = spawnSpit(h, 112);
    // 玩家 cy 精确对齐弹体（112 scale0.9 → h 非整 16,硬编码对不齐）→ vy=0 钉值
    (h.player as unknown as { cy: number }).cy = e.cy;
    (h.player as unknown as { y: number }).y = e.cy - 21;
    for (let t = 0; t < 3; t++) bouncingBallAI(e, h.hooks, h.player);
    const trail = h.dusts.filter((d) => d.alpha === 80);
    expect(e.vx).toBeCloseTo(-7, 9);               // num125=7 直飞档（玩家在左）
    expect(e.vy).toBeCloseTo(0, 9);                // cy 对齐
    for (const d of trail) {
      expect(d.sx).toBeCloseTo(e.vx * 0.1, 9);
      expect(d.sy).toBeCloseTo(e.vy * 0.1, 9);
      expect(d.vx).toBeCloseTo(e.vx * 0.1 * 0.3, 9);
      expect(d.vy).toBeCloseTo(e.vy * 0.1 * 0.3, 9);
    }
    expect(trail[0].vx).toBeCloseTo(-0.21, 9);     // −7×0.1×0.3（钉值）
  });
});

// ===========================================================================
// ② 出生相（NPC.cs:21560-21572）：ai[0]==2 → 双倍位移 + PlaySound(4,…,9)
//    (= NPC_Killed_9) + 20× 尘 18（α100、scale1.8、尘速 ×1.3 后 += 弹速）
// ===========================================================================
describe('FX45 ② VileSpit 出生相爆裂（NPC.cs:21560-21572：20× d18 α100 s1.8）', () => {
  it('恰 ai0==2 拍爆发 20 粒 + NPC_Killed_9 音；尘速 = 弹速（×1.3 后 += 弹速）', () => {
    const h = makeHooks();
    const e = spawnSpit(h, 112);
    bouncingBallAI(e, h.hooks, h.player);
    expect(h.dusts.length).toBe(2);                // 首拍无爆裂
    expect(h.sfx.length).toBe(0);
    const vx0 = e.vx, vy0 = e.vy, x0 = e.x, y0 = e.y;
    bouncingBallAI(e, h.hooks, h.player);
    expect(h.sfx.length).toBe(1);
    expect(h.sfx[0], 'PlaySound(4,x,y,9) = NPC_Killed 库 style9').toEqual(['NPC_Killed_9']);
    const burst = h.dusts.filter((d) => d.scale === 1.8);
    expect(burst.length).toBe(20);
    for (const d of burst) {
      expect(d.type).toBe(18);
      expect(d.alpha).toBe(100);
      expect(d.noGravity).toBe(true);
      // stub 形参直装（sp0/0）→ ×1.3 后 += 弹速 = 弹速原值
      expect(d.vx).toBeCloseTo(vx0, 9);
      expect(d.vy).toBeCloseTo(vy0, 9);
      // 爆裂锚在双倍位移后的新位（积分再 +vx → d.x = 末位 − vx）
      expect(d.x).toBeCloseTo(e.x - e.vx, 9);
      expect(d.y).toBeCloseTo(e.y - e.vy + 2, 9);
    }
    // 双倍位移（:21561 position += velocity + 末端积分）
    expect(e.x - x0).toBeCloseTo(vx0 * 2, 9);
    expect(e.y - y0).toBeCloseTo(vy0 * 2, 9);
    // 第三拍起 ai0 钳 3,不再爆发（2 尾迹/tick 恒在）
    bouncingBallAI(e, h.hooks, h.player);
    expect(h.dusts.length).toBe(2 + 20 + 2 + 2);
    expect(h.sfx.length).toBe(1);
  });
});

// ===========================================================================
// ③ 死亡尘（HitEffect 顶层支 NPC.cs:86360-86374）：20× 尘 18（α100、scale2、
//    sp0/0、盒 (pos.X, pos.Y+2, w, h)）、Next(2)==0 → scale×0.6,否则尘速 ×1.4
//    + noGravity——此前落通用 def.gore 三簇彩色粒子近似
// ===========================================================================
describe('FX45 ③ VileSpit 死亡尘（NPC.cs:86360-86374：20× d18 s2 二分支）', () => {
  it('致死拍恰 20 粒 d18；scale×0.6 支与 ×1.4+noGravity 支互斥必居其一', () => {
    const h = makeHooks();
    const e = spawnSpit(h, 112);
    e.hurt(9999, 0, 0, h.hooks);
    expect(h.dusts.length).toBe(20);
    expect(h.particles.length, '通用 gore 色粒子近似已被门掉').toBe(0);
    for (const d of h.dusts) {
      expect(d.type).toBe(18);
      expect(d.alpha).toBe(100);
      expect(d.sx).toBe(0);
      expect(d.sy).toBe(0);
      expect(d.y).toBe(e.y + 2);
      if (d.noGravity) {
        // 速度支：scale 保持 2、尘速 ×1.4（stub 0 速 → 0）
        expect(d.scale).toBeCloseTo(2, 9);
        expect(d.vx).toBeCloseTo(0, 9);
        expect(d.vy).toBeCloseTo(0, 9);
      } else {
        // scale 支：scale×0.6 → 1.2、noGravity 不置
        expect(d.scale).toBeCloseTo(1.2, 9);
      }
    }
  });

  it('两分支均有可达面（30 次死亡 600 粒,50/50 掷两侧都出现）', () => {
    const seen = { scale: 0, vel: 0 };
    for (let round = 0; round < 30; round++) {
      const h = makeHooks();
      const e = spawnSpit(h, 112);
      e.hurt(9999, 0, 0, h.hooks);
      expect(h.dusts.length).toBe(20);
      for (const d of h.dusts) {
        if (d.noGravity) { seen.vel++; expect(Math.abs(d.scale - 2)).toBeLessThan(1e-9); }
        else { seen.scale++; expect(d.scale).toBeCloseTo(1.2, 9); }
      }
    }
    expect(seen.scale).toBeGreaterThan(0);
    expect(seen.vel).toBeGreaterThan(0);
  });

  it('666（VileSpitEaterOfWorlds）同站共享受', () => {
    const h = makeHooks();
    const e = spawnSpit(h, 666);
    e.hurt(9999, 0, 0, h.hooks);
    expect(h.dusts.length).toBe(20);
    for (const d of h.dusts) expect(d.type).toBe(18);
  });
});
