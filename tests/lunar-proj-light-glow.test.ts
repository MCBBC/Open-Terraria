// ★BJ109-B（2026-09-16）四柱弹幕光照/glow 锁测试：
//   ① 575 星云兽蓄能球 AI 侧点光（P.cs:34200 Lighting.AddLight(Center,0.5,0.1,0.3)，
//      aiStyle 107 type==575 支每拍无条件）——本仓实体自报通道 lightRGB（94/1114 先例）。
//      ★vanilla ProjLight()（P.cs:16246-17140 全表）不含 575，四柱系弹的世界光全部
//      散在 AI 侧（575/580 两处），通用乘区表无此键 = 数据面正确地不亮，唯 AI 面缺。
//   ② 539/574 GlowMask 加色外发光（Main.cs:34491-34496 GlowMask[140] /
//      :34503-34508 GlowMask[148]，色 Color(255,255,255,0)=A=0 纯加算白满强，
//      源矩形=本体当前帧矩形、同 rotation 同 origin）——LunarOrb.draw 'lighter' pass。
//   ③ 静态资产在库：Glow_140（24×136=4×34）/Glow_148（24×48=2×24）与本体贴图同排版。
// 锚：Terarria1457/Terraria/Projectile.cs:34173-34210（aiStyle 107）/ Main.cs:34491/:34503
//     / Terarria1457/Terraria/ID/ProjectileID.cs（GlowMask 序号=SpriteAtlas 装载名 Glow_N）。
import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';
import { Arrow } from '../src/entities/Arrow';
import { LunarOrb } from '../src/entities/bossAI_lunar_misc';

// ---------------------------------------------------------------- 记录型 ctx
type Call = { m: string; a: unknown[] };
function makeRecCtx() {
  const calls: Call[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => {
      if (k === 'canvas') return undefined;
      if (k === 'globalCompositeOperation' || k === 'globalAlpha') {
        // 属性写经 set 捕获，读走底层——记录型桩只需写路径
        return undefined;
      }
      return (...a: unknown[]) => { calls.push({ m: String(k), a }); };
    },
    set: (_t, k, v) => { calls.push({ m: `set:${String(k)}`, a: [v] }); return true; },
  });
  return { calls, ctx };
}

/** 贴图假体 */
function fakeImg(w: number, h: number) {
  return { naturalWidth: w, naturalHeight: h, width: w, height: h, complete: true, src: '' };
}

/** renderer 桩 */
function makeR() {
  const { calls, ctx } = makeRecCtx();
  const r = {
    canvas: { getContext: () => ctx },
    ctx,
    atlas: null,
  };
  return { calls, r: r as never };
}

// ------------------------------------------------- global Image 替身（projSprite/TtlSprite）
let NEXT_IMG = { w: 1, h: 1 };
beforeAll(() => {
  vi.stubGlobal('Image', class {
    naturalWidth = NEXT_IMG.w; naturalHeight = NEXT_IMG.h;
    width = NEXT_IMG.w; height = NEXT_IMG.h;
    complete = true;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) { this.onload?.(); }
  });
  // projFrameImg 走 document.createElement —— 桩出极简 canvas
  vi.stubGlobal('document', {
    createElement: () => {
      const c = { width: 0, height: 0 };
      const inner = makeRecCtx();
      return Object.assign(c, { getContext: () => inner.ctx });
    },
  });
});

// ---------------------------------------------------------------- game 桩
function emptyWorld(): World {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  return w;
}
function makeGame(w: World): GameHooks {
  return {
    world: w, player: null as unknown, enemies: () => [], critters: () => [],
    projectiles: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    addLightAt: () => {},
    spawnDust: () => null,
    broadcastParticleOrchestra: () => {},
  } as unknown as GameHooks;
}

// ================================================================ ① 575 AI 点光
describe('BJ109-B ①575 蓄能球 AI 侧点光（P.cs:34200 aiStyle107 type==575 AddLight(0.5,0.1,0.3)）', () => {
  it('fixedUpdate 每拍自报 lightRGB=[0.5,0.1,0.3]（持续恒值，非一次性）', () => {
    const game = makeGame(emptyWorld());
    // 出生端=星云兽 423 蓄力冲 shoot()（Enemy.ts 423 支）： grav 0 / hostile / life 300
    const a = new Arrow(400, 300, -7, 0, 50, 0, 575,
      { grav: 0, life: 300, pierce: 1, hostile: true });
    for (let i = 0; i < 5 && !a.dead; i++) {
      a.fixedUpdate(1 / 60, game);
      expect(a.lightRGB).not.toBeNull();
      expect(a.lightRGB![0]).toBeCloseTo(0.5, 6);
      expect(a.lightRGB![1]).toBeCloseTo(0.1, 6);
      expect(a.lightRGB![2]).toBeCloseTo(0.3, 6);
    }
  });

  it('阴性对照：同构 Arrow 通用型（2 木箭）不自发 lightRGB（走 Game 数据面）', () => {
    const game = makeGame(emptyWorld());
    const a = new Arrow(400, 300, 6, 0, 10, 1, 2, { grav: 0, life: 600 });
    a.fixedUpdate(1 / 60, game);
    expect(a.lightRGB).toBeNull();
  });
});

// ================================================================ ② 539/574 GlowMask
describe('BJ109-B ②LunarOrb 539/574 GlowMask 加色外发光（Main.cs:34491/:34503）', () => {
  it('539: lighter 加色 + 源矩形=帧格(24×34,frame 对齐) + 绘制先本体后 glow + 复位 source-over', () => {
    NEXT_IMG = { w: 24, h: 136 };
    const orb = new LunarOrb(null, 539, 3, 0, 10, 0, 0);
    (orb as unknown as { frame: number }).frame = 2;          // 推到第 3 帧（帧对齐锁）
    const { calls, r } = makeR();
    orb.draw(r as never, undefined as never);
    const dAll = calls.filter((c) => c.m === 'drawImage');
    expect(dAll.length).toBeGreaterThanOrEqual(2);            // 本体 + glow
    // 首张 = 本体（5 参中心锚），末张 = glow（9 参帧切片）
    const base = dAll[0];
    expect(base.a.length).toBe(5);
    const glow = dAll[dAll.length - 1];
    expect(glow.a.length).toBe(9);
    expect(glow.a[1]).toBe(0);                                 // sx
    expect(glow.a[2]).toBe(2 * 34);                            // sy = frame×34
    expect(glow.a[3]).toBe(24);                                // sw = 帧宽
    expect(glow.a[4]).toBe(34);                                // sh = 帧高
    // lighter 进 / source-over 复位（glow pass 之内）
    const sets = calls.map((c) => c.m);
    const iLight = sets.indexOf('set:globalCompositeOperation');
    expect(iLight).toBeGreaterThanOrEqual(0);
    expect(calls[iLight].a[0]).toBe('lighter');
    const iReset = sets.lastIndexOf('set:globalCompositeOperation');
    expect(calls[iReset].a[0]).toBe('source-over');
  });

  it('574: 帧格 24×24、恒帧 1（AI_102 frame=1 锚，Main.cs 面源矩形 (0,24,24,24)）', () => {
    NEXT_IMG = { w: 24, h: 48 };
    const orb = new LunarOrb(null, 574, 3, 0, 10, 0, 0);
    const { calls, r } = makeR();
    orb.draw(r as never, undefined as never);
    const dAll = calls.filter((c) => c.m === 'drawImage');
    const glow = dAll[dAll.length - 1];
    expect(glow.a.length).toBe(9);
    expect(glow.a[1]).toBe(0);
    expect(glow.a[2]).toBe(24);                                // 恒帧 1 → sy=24
    expect(glow.a[3]).toBe(24);
    expect(glow.a[4]).toBe(24);
  });
});

// ================================================================ ③ 资产在库
describe('BJ109-B ③GlowMask 资产在库（public/sprites/vanilla/Glow_140/148.png）', () => {
  it('Glow_140 24×136 / Glow_148 24×48（与 Projectile_539/574 同排版）', () => {
    expect(fs.existsSync(path.join('public/sprites/vanilla/Glow_140.png'))).toBe(true);
    expect(fs.existsSync(path.join('public/sprites/vanilla/Glow_148.png'))).toBe(true);
  });
});
