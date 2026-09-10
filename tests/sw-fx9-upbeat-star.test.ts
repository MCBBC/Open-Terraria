// ===========================================================================
// SW-FX9（2026-09-10）764 UpbeatStar FallenStar 覆绘 + 资产面收口钉
//   债源：approx-registry-2026-08-31.md「A/C|764 UpbeatStar 覆绘被 Item_75.png
//   缺资产卡死」；PetFollower 尾注登记债（2026-09-01 终零波批遗留）。
//   资产面裁决 = 索资产（非占位/跳过）：源池 terraria-assets/Images/Item_75.png
//   在案（22×208 竖 8 帧），经 scripts/atlas-append-1457.mjs 追加通道入库
//   （单图直引族,幂等,既有键零改动）→ 渲染面接通。
//   金标锚（Terarria1457）：
//   · AI_144 case 764（Projectile.cs:71205-71251）：localAI[0] 相位 120 wrap →
//     Opacity=Lerp(0.4,0.75,tri)（:71244-71245）；localAI[1] 自旋 +=vx×0.01+1/120
//     wrap ±2π、慢速 ×0.9（:71209-71225）；Y 波（:71249）
//   · 764 GetAlpha 恒 Color.White（Projectile.cs:80749-80751）
//   · DrawProjWithStarryTrail（Main.cs:38220-38333）：type 764 flag=true → 陨星
//     覆绘 EntitySpriteDraw(Item_75, Center, Frame(1,8) 顶帧, Color(255,255,255,
//     projectileColor.A−proj.alpha), rotation=proj.rotation+localAI[1](:38316),
//     origin=帧心, proj.scale, SpriteEffects.None)（:38326-38332）；画序在
//     DrawProjectiles else-if 链=本体 EntitySpriteDraw 之前（:33922-33925）
//   · AI_144 不写 rotation（764 无旋转写点）→ 覆绘 rotation = localAI[1]
// ===========================================================================
import { describe, it, expect } from 'vitest';
import { PetFollower } from '../src/entities/PetFollower';
import type { Renderer } from '../src/render/Renderer';
import type { GameHooks } from '../src/entities/types';

interface Rec { m: string; a: unknown[] }
function recCtx() {
  const calls: Rec[] = [];
  let alpha = 1;
  const ctx = {
    drawImage: (...a: unknown[]) => { calls.push({ m: 'drawImage', a }); },
    save: () => { calls.push({ m: 'save', a: [] }); },
    restore: () => { calls.push({ m: 'restore', a: [] }); },
    translate: (...a: unknown[]) => { calls.push({ m: 'translate', a }); },
    rotate: (...a: unknown[]) => { calls.push({ m: 'rotate', a }); },
    scale: (...a: unknown[]) => { calls.push({ m: 'scale', a }); },
    imageSmoothingEnabled: false,
    get globalAlpha() { return alpha; },
    set globalAlpha(v: number) { alpha = v; calls.push({ m: 'alpha', a: [v] }); },
  } as unknown as CanvasRenderingContext2D;
  return { calls, ctx };
}

const IMG_764 = { width: 20, height: 20 };      // Projectile_764（单帧）
const IMG_75 = { width: 22, height: 208 };      // Item_75（Frame(1,8) → 22×26）

function mockRenderer(withItem75: boolean): { r: Renderer; calls: Rec[] } {
  const { ctx, calls } = recCtx();
  const atlas = {
    ensureVImage: (f: string) =>
      f === 'vanilla/Projectile_764.png' ? IMG_764
        : f === 'vanilla/Item_75.png' ? (withItem75 ? IMG_75 : null)
          : null,
  };
  return { r: { ctx, atlas } as unknown as Renderer, calls };
}

function mkPet(): { pet: PetFollower; access: {
  starRot: number; starOpacity: number; starT: number;
  upbeatStarTick: (p: unknown, g: unknown) => void; vx: number; vy: number;
} } {
  const owner = { dead: false, cx: 100, cy: 100, x: 90, y: 80, facing: 1 };
  const pet = new PetFollower(100, 100, 764, () => owner as never);
  const access = pet as unknown as {
    starRot: number; starOpacity: number; starT: number; vx: number; vy: number;
    upbeatStarTick: (p: unknown, g: unknown) => void;
  };
  return { pet, access };
}

describe('SW-FX9 764 覆绘消费（DrawProjWithStarryTrail Item_75 支,Main.cs:38315-38333）', () => {
  it('①覆绘在位：本体【前】画 Item_75 顶帧(22×26),origin=帧心,自旋角=starRot,A=starOpacity', () => {
    const { pet, access } = mkPet();
    access.vx = 0; access.vy = 0;
    access.upbeatStarTick({}, {});          // 驱动 localAI[0]/[1] 累积一拍（慢速档 ×0.9）
    const starRot = access.starRot;
    const starOpacity = access.starOpacity;
    const { r, calls } = mockRenderer(true);
    pet.draw(r, {} as never);
    const imgs = calls.filter((c) => c.m === 'drawImage' && c.a.length === 9);
    expect(imgs.length, '覆绘+本体共两张').toBe(2);
    // 覆绘（先）：src (0,0,22,26) = Frame(1,8) 顶帧;dst (-11,-13,22,26) = Center+帧心 origin
    const a0 = imgs[0]!.a as number[];
    expect(a0[1]).toBe(0);
    expect(a0[2]).toBe(0);
    expect(a0[3], 'Frame(1,8) 帧宽 22').toBe(22);
    expect(a0[4], 'Frame(1,8) 帧高 26').toBe(26);
    expect(a0[5], 'Center 锚 dx=-帧宽/2').toBe(-11);
    expect(a0[6], 'Center 锚 dy=-帧高/2').toBe(-13);
    expect(a0[7]).toBe(22);
    expect(a0[8]).toBe(26);
    // 本体（后）：Projectile_764 整帧居中
    const a1 = imgs[1]!.a as number[];
    expect(a1[3], '本体宽 20').toBe(20);
    // 画序：覆绘先于本体（DrawProjWithStarryTrail 在 common draw 之前 :33922-33925）
    expect(calls.indexOf(imgs[0]!)).toBeLessThan(calls.indexOf(imgs[1]!));
    // rotation = proj.rotation(0,AI_144 无写点) + localAI[1] → rotate(starRot)
    const rots = calls.filter((c) => c.m === 'rotate').map((c) => (c.a as number[])[0]);
    expect(rots).toContain(starRot);
    // 覆绘 A 面 = 255×Opacity（:38303 color A = projectileColor.A−proj.alpha）
    const alphas = calls.filter((c) => c.m === 'alpha').map((c) => (c.a as number[])[0]);
    expect(alphas).toContain(starOpacity);
    void starOpacity;
  });

  it('②旋转累加面（Projectile.cs:71209-71225）:+=vx×0.01+1/120,wrap ±2π,慢速 ×0.9', () => {
    const { access } = mkPet();
    access.vx = 0; access.vy = 0;
    const r0 = access.starRot;
    access.upbeatStarTick({}, {});
    const r1 = access.starRot;
    expect(r1).toBeCloseTo((r0 + 1 / 120) * 0.9, 10);   // 慢速档 |v|<4 → ×0.9
    // wrap：大幅自旋不越 ±2π
    access.starRot = Math.PI * 2 - 0.001;
    access.upbeatStarTick({}, {});
    expect(Math.abs(access.starRot)).toBeLessThanOrEqual(Math.PI * 2 + 1e-9);
  });

  it('③alpha 三角脉冲（:71244-71245）:Opacity=Lerp(0.4,0.75,tri),120 拍折返', () => {
    const { access } = mkPet();
    access.vx = 0; access.vy = 0;
    for (let i = 0; i < 121; i++) access.upbeatStarTick({}, {});
    expect(access.starT, 'localAI[0] ++ 后 >120 归 0（:71206-71209）').toBe(0);
    for (let i = 0; i < 60; i++) access.upbeatStarTick({}, {});
    expect(access.starOpacity).toBeCloseTo(0.75, 5);     // tri(60/120→1)=1 → 0.75
    for (let i = 0; i < 60; i++) access.upbeatStarTick({}, {});
    expect(access.starOpacity).toBeCloseTo(0.4, 5);      // 120 → tri 折返 0 → 0.4
  });

  it('④资产懒加载窗：Item_75 未就绪(ensureVImage null)→ 覆绘静默跳过,本体照画', () => {
    const { pet, access } = mkPet();
    access.vx = 0; access.vy = 0;
    access.upbeatStarTick({}, {});
    const { r, calls } = mockRenderer(false);
    expect(() => pet.draw(r, {} as never)).not.toThrow();
    const imgs = calls.filter((c) => c.m === 'drawImage' && c.a.length === 9);
    expect(imgs.length, '仅本体一张（无覆绘）').toBe(1);
    expect((imgs[0]!.a as number[])[3]).toBe(20);
  });

  it('⑤AI 锚接通：fixedUpdate 764 分派 upbeatStarTick（Projectile.cs:66801 案,现 :71205）', () => {
    const owner = { dead: false, cx: 100, cy: 100, x: 90, y: 80, facing: 1 };
    const pet = new PetFollower(100, 100, 764, () => owner as never);
    const game = {
      world: { store: { inBounds: () => false, isSolid: () => false, isActive: () => false } },
      spawnDust: undefined,
      enemies: () => [], critters: () => [], npcs: () => [],
    } as unknown as GameHooks;
    const before = (pet as unknown as { starT: number }).starT;
    pet.fixedUpdate(1 / 60, game);
    expect((pet as unknown as { starT: number }).starT).toBe((before + 1) % 121 === 0 ? 0 : before + 1);
  });
});
