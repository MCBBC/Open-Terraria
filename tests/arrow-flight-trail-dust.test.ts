// Arrow Update 飞行尾尘通用段（P.cs:17141-17182）+ Kill 尘档（:77169-77257）金标：
//   飞行（Update 主体、numUpdates 循环外 → 每 tick 恰 1 粒，extraUpdates 无乘）：
//     2/82→d6 α100 / 172→d135 α100 / 103→d75 α100（1/2 noGravity+scale×2）/
//     278→d169 α100（1/2 noGravity+scale×1.5）/ 4→1/5 d14 α150 scale1.1 /
//     5→Next(3)∈{15,57,58} +v×0.5 α150 scale1.2
//   Kill（分档链，legacy PlaySound(0)=dig；5 特例 Item10）：2/82→d6×10 /
//     172→d135×20 / 103→d75×20（1/2 scale×2.5+noGravity+v×5）/
//     278→d169×20（1/2 scale×1.5+noGravity+v×5）/ 4→d14×10 α150 scale1.1 /
//     5→{15,57,58}×60 v×0.5 α150 scale1.5
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';
import { Arrow } from '../src/entities/Arrow';

interface DustRec { type: number; alpha: number; scale: number; noGravity: boolean; sx: number; sy: number; }

function makeGame(w: World, dusts: DustRec[], bucket?: unknown[]) {
  return {
    world: w, player: null as unknown, enemies: () => [], critters: () => [],
    projectiles: () => [],
    entities: { nextId: 1, add: (e: unknown) => { if (bucket) bucket.push(e); } },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    addLightAt: () => {},
    spawnDust: (_x: number, _y: number, _w: number, _h: number, type: number,
      sx = 0, sy = 0, alpha = 0, _c: unknown = null, scale = 1, ng = false) => {
      const d: DustRec & { vx: number; vy: number; x: number; y: number } = {
        type, alpha, scale, noGravity: !!ng, sx, sy, vx: 0, vy: 0, x: 0, y: 0 };
      dusts.push(d);
      return d;
    },
    broadcastParticleOrchestra: () => {},
  } as unknown as GameHooks;
}

function emptyWorld(): World {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  return w;
}

function flyFrames(a: Arrow, game: GameHooks, frames: number): void {
  for (let i = 0; i < frames && !a.dead; i++) a.fixedUpdate(1 / 60, game);
}

function kill(a: Arrow, game: GameHooks): void {
  (a as unknown as { killNow: (g: GameHooks) => void }).killNow(game);
}

const TYPES = (dusts: DustRec[]) => dusts.map((d) => d.type);

describe('AI Update 飞行尾尘通用段（P.cs:17141-17182;★R1:段在 numUpdates 循环内=每子步）', () => {
  it('弹 2 燃烧箭：10 帧 → d6 ×10（α100）', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    const a = new Arrow(400, 300, 6, 0, 10, 1, 2, null, { grav: 0, life: 600 });
    flyFrames(a, game, 10);
    expect(dusts.filter((d) => d.type === 6).length).toBe(10);
    expect(dusts.every((d) => d.alpha === 100)).toBe(true);
  });
  it('弹 82 敌燃烧箭：同 d6 每拍 1 粒', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    const a = new Arrow(400, 300, 6, 0, 10, 1, 82, null, { grav: 0, life: 600 });
    flyFrames(a, game, 8);
    expect(dusts.filter((d) => d.type === 6).length).toBe(8);
  });
  it('弹 172 毒镖：d135 ×10', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    const a = new Arrow(400, 300, 6, 0, 10, 1, 172, null, { grav: 0, life: 600 });
    flyFrames(a, game, 10);
    expect(dusts.filter((d) => d.type === 135).length).toBe(10);
  });
  it('弹 103 流星弹：d75 ×10，1/2 掷 noGravity+scale×2（比例在 20-80%）', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    const a = new Arrow(400, 300, 6, 0, 10, 1, 103, null, { grav: 0, life: 600 });
    // ★2026-09-02 flake 修：n=10 的 1/2 掷带宽 [2,8] 漏检率 ≈2.1%/次（二项 10,0.5）
    // ——闸门批量跑常假红。样本 30、带宽 ±3σ（期望 15）→ 漏检 ≈0.2%,比例语义不变
    flyFrames(a, game, 30);
    const d75 = dusts.filter((d) => d.type === 75);
    expect(d75.length).toBe(30);
    const boosted = d75.filter((d) => d.noGravity && d.scale > 1).length;
    expect(boosted).toBeGreaterThanOrEqual(7);
    expect(boosted).toBeLessThanOrEqual(23);
  });
  it('弹 278 绿藻弹：d169 ×60（30 帧 × EU=1 → ×2/帧;★R1 子步层级），1/2 掷 noGravity+scale×1.5', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    const a = new Arrow(400, 300, 6, 0, 10, 1, 278, null, { grav: 0, life: 600 });
    flyFrames(a, game, 30);
    const d169 = dusts.filter((d) => d.type === 169);
    expect(d169.length).toBe(60);
    const boosted = d169.filter((d) => d.noGravity && d.scale > 1).length;
    expect(boosted).toBeGreaterThanOrEqual(18);   // 二项(60,0.5) ±3σ
    expect(boosted).toBeLessThanOrEqual(42);
  });
  it('弹 4 星星：1/5 掷 d14（60 帧 → 6..24 粒，α150 scale1.1）', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    const a = new Arrow(400, 300, 6, 0, 10, 1, 4, null, { grav: 0, life: 600 });
    flyFrames(a, game, 60);
    const d14 = dusts.filter((d) => d.type === 14);
    expect(d14.length).toBeGreaterThanOrEqual(6);
    expect(d14.length).toBeLessThanOrEqual(24);
    expect(d14.every((d) => d.alpha === 150 && Math.abs(d.scale - 1.1) < 1e-9)).toBe(true);
  });
  it('弹 5 猎鹰刃：Next(3)∈{15,57,58} ×20（EU=1 → ×2/帧），speed=v×0.5（单次采样）', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    const a = new Arrow(400, 300, 6, 0, 10, 1, 5, null, { grav: 0, life: 600 });
    flyFrames(a, game, 10);
    expect(dusts.length).toBe(20);
    expect(dusts.every((d) => d.type === 15 || d.type === 57 || d.type === 58)).toBe(true);
    expect(dusts.every((d) => d.alpha === 150 && Math.abs(d.scale - 1.2) < 1e-9)).toBe(true);
    expect(dusts.every((d) => Math.abs(d.sx - 3) < 1e-9)).toBe(true);   // v=6 → sx=3
  });
});

describe('309 冰九头蛇冰弹（aiStyle28 尘尾 :26996-27004 每**子步**;EU=3 → ×4/帧）', () => {
  it('飞行：4 帧 → d185 ×48（α50 noGravity scale1.2,尘速×0.3）', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    const a = new Arrow(400, 300, 6, 0, 10, 1, 309, null, { grav: 0, life: 600 });
    flyFrames(a, game, 4);
    const d185 = dusts.filter((d) => d.type === 185);
    expect(d185.length).toBe(48);                      // 4 帧 × 4 子步 × 3 粒
    expect(d185.every((d) => d.alpha === 50 && d.noGravity)).toBe(true);
  });
  it('Kill：Item27 + d185×10（1/2 掷 v×2+noGravity+scale×1.75;40 次聚合 ±3σ 防单掷假红）', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    for (let k = 0; k < 40; k++) kill(new Arrow(400, 300, 6, 0, 10, 1, 309), game);
    const d185 = dusts.filter((d) => d.type === 185);
    expect(d185.length).toBe(400);
    const boosted = d185.filter((d) => d.noGravity && d.scale > 1).length;
    expect(boosted).toBeGreaterThanOrEqual(170);   // 二项(400,0.5) ±3σ
    expect(boosted).toBeLessThanOrEqual(230);
  });
});

describe('镖族 479/478 行为面（AI_001 :58288-58343）', () => {
  it('479 母镖:pierce=-1 无限穿;超阈分裂 2-4 枚子镖(pierce=1,ai1Mirror=-1000)+每枚 5×d170', () => {
    const dusts: DustRec[] = [];
    const bucket: unknown[] = [];
    const game = makeGame(emptyWorld(), dusts, bucket);
    const a = new Arrow(400, 300, 6, 0, 100, 2, 479, null, { grav: 0, life: 600 });
    flyFrames(a, game, 40);
    // ★R1 F3:分裂后(ai1Mirror=-1000)母镖 penetrate 每拍回落 1(:58291-58294 else 支)
    expect((a as unknown as { pierce: number }).pierce).toBe(1);
    const subs = bucket.filter((b) => (b as Arrow).projId === 479
      && (b as unknown as { ai1Mirror: number }).ai1Mirror === -1000) as Arrow[];
    expect(subs.length).toBeGreaterThanOrEqual(2);
    expect(subs.length).toBeLessThanOrEqual(4);
    expect((subs[0] as unknown as { pierce: number }).pierce).toBe(1);
    expect(dusts.filter((d) => d.type === 170).length).toBeGreaterThanOrEqual(subs.length * 5);
  });
  it('478 诅咒镖:周期放 480 诅咒火(dmg×0.8,kb×0.5)且 life 扣 20', () => {
    const dusts: DustRec[] = [];
    const bucket: unknown[] = [];
    const game = makeGame(emptyWorld(), dusts, bucket);
    const a = new Arrow(400, 300, 6, 0, 100, 2, 478, null, { grav: 0, life: 600 });
    const life0 = (a as unknown as { life: number }).life;
    flyFrames(a, game, 45);
    const fires = bucket.filter((b) => (b as Arrow).projId === 480) as Arrow[];
    expect(fires.length).toBeGreaterThanOrEqual(1);
    expect((fires[0] as unknown as { damage: number }).damage).toBe(80);   // 100×0.8
    expect((a as unknown as { life: number }).life).toBeLessThan(life0);
  });
});

describe('42 沙枪沙球（AI_010 per-type 尘链 :58852-58857,每子步 1/2 掷）', () => {
  it('飞行：8 帧 → d32 4..12 粒（EU=1 → 2 子步/帧 ×8 = 16 掷,1/2 期望 ~8）', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    const a = new Arrow(400, 300, 6, 0, 10, 1, 42, null, { grav: 0, life: 600 });
    flyFrames(a, game, 8);
    const d32 = dusts.filter((d) => d.type === 32);
    expect(d32.length).toBeGreaterThanOrEqual(4);
    expect(d32.length).toBeLessThanOrEqual(13);
  });
  it('354 维多利亚沙球 → d36（同 EU=1,8..24 掷）', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    const a = new Arrow(400, 300, 6, 0, 10, 1, 354, null, { grav: 0, life: 600 });
    flyFrames(a, game, 8);
    expect(dusts.filter((d) => d.type === 36).length).toBeGreaterThanOrEqual(3);
    expect(dusts.filter((d) => d.type === 36).length).toBeLessThanOrEqual(14);   // 16 掷 1/2 ±3σ
    expect(dusts.filter((d) => d.type === 32).length).toBe(0);
  });
});

describe('Kill 尘档（P.cs:77169-77257）', () => {
  it('弹 2：d6×10（α100）', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    kill(new Arrow(400, 300, 6, 0, 10, 1, 2), game);
    expect(dusts.filter((d) => d.type === 6).length).toBe(10);
  });
  it('弹 172：d135×20（α100）', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    kill(new Arrow(400, 300, 6, 0, 10, 1, 172), game);
    expect(dusts.filter((d) => d.type === 135).length).toBe(20);
  });
  it('弹 103：d75×20，1/2 掷 scale×2.5+noGravity+v×5', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    kill(new Arrow(400, 300, 6, 0, 10, 1, 103), game);
    const d75 = dusts.filter((d) => d.type === 75);
    expect(d75.length).toBe(20);
    const boosted = d75.filter((d) => d.noGravity && d.scale > 1).length;
    expect(boosted).toBeGreaterThanOrEqual(4);
    expect(boosted).toBeLessThanOrEqual(16);
  });
  it('弹 278：d169×20，1/2 掷 scale×1.5+noGravity+v×5', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    kill(new Arrow(400, 300, 6, 0, 10, 1, 278), game);
    const d169 = dusts.filter((d) => d.type === 169);
    expect(d169.length).toBe(20);
    const boosted = d169.filter((d) => d.noGravity && d.scale > 1).length;
    expect(boosted).toBeGreaterThanOrEqual(4);
    expect(boosted).toBeLessThanOrEqual(16);
  });
  it('弹 4：d14×10（α150 scale1.1）', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    kill(new Arrow(400, 300, 6, 0, 10, 1, 4), game);
    const d14 = dusts.filter((d) => d.type === 14);
    expect(d14.length).toBe(10);
    expect(d14.every((d) => d.alpha === 150 && Math.abs(d.scale - 1.1) < 1e-9)).toBe(true);
  });
  it('弹 5：{15,57,58}×60（v×0.5 α150 scale1.5）', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    kill(new Arrow(400, 300, 6, 0, 10, 1, 5), game);
    expect(dusts.length).toBe(60);
    expect(TYPES(dusts).every((t) => t === 15 || t === 57 || t === 58)).toBe(true);
    expect(dusts.every((d) => d.alpha === 150 && Math.abs(d.scale - 1.5) < 1e-9)).toBe(true);
  });
});
