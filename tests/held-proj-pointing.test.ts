// heldProj / 手持投射物指向(渲染层)回归 —— 源锚见 src/render/heldProj.ts 头注:
//   · AI_AdjustPlayerItemRotationToFaceProjectile(Projectile.cs:21161-21191)逐字移植
//   · 消费门:HeldItem.shoot==type(:21167)/ alpha==0(:21163)/ minSpeed(:21183)
//   · useStyle 5 持物才消费(itemfunc 全表:链枷/悠悠球/长枪/鞭 noUseGraphic,
//     PlayerDrawLayers.cs:3192 不画持物 → 无可见消费;唯一交集 = 食人鱼枪
//     1156→190,aiStyle 39 尾部 :26313 调用)
//   · 优先序:Main.cs:17685 玩家 Update 先于投射物 AI → 活体在场指向胜;
//     非 useStyle 5 动画(挥砍/饮用)与 noGraphic(短剑)让位
//   · swing 过期合成 = aiStyle 39 SetDummyItemTime(5)(Projectile.cs:26086)渲染侧等价
import { describe, it, expect, beforeEach } from 'vitest';
import {
  heldProjItemRotation, heldProjAimWorld, heldProjFrameBegin, noteHeldProjEntity,
  heldProjSample, applyHeldProjPointing, type HeldProjSwing,
} from '../src/render/heldProj';
import { Renderer } from '../src/render/Renderer';
import { ITEM_BY_KEY } from '../src/data/items';

const TAU = Math.PI * 2;
/** 角等价(模 2π) */
function angEq(a: number, b: number): boolean {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return Math.abs(d) < 1e-9;
}

// 食人鱼枪本仓物品 id(vi_ 单空间,数组索引=id ≠ 原版 id 1156——必须走 ITEM_BY_KEY)
const PIRANHA_GUN_ID: number = ITEM_BY_KEY['vi_1156_piranha_gun'];

function playerAt(cx: number, cy: number, heldId: number | null = PIRANHA_GUN_ID) {
  return { cx, cy, inv: { heldItem: () => (heldId === null ? null : { id: heldId }) } };
}

describe('heldProjItemRotation(AI_Adjust :21161-21191 逐字)', () => {
  it('投射物在右:flip=-1,角=atan2(−dy,−dx)', () => {
    // player(100,100) proj(130,120):x=−30 y=−20 → atan2(20,30)
    expect(angEq(heldProjItemRotation(100, 100, 130, 120)!, Math.atan2(20, 30))).toBe(true);
  });
  it('投射物在左:flip=+1,角=atan2(dy,dx) 含 π 翻转', () => {
    // player(100,100) proj(70,120):x=30 y=−20 → atan2(−20,30)
    expect(angEq(heldProjItemRotation(100, 100, 70, 120)!, Math.atan2(-20, 30))).toBe(true);
  });
  it('gfxOffY 只进 y 项(:21178 MountedCenter.Y + gfxOffY − Center.Y)', () => {
    const base = heldProjItemRotation(100, 100, 130, 120)!;
    const off = heldProjItemRotation(100, 100, 130, 120, { gfxOffY: 5 })!;
    // y = 100 + 5 − 120 = −15 → 未翻转 atan2(−y,−x) = atan2(15,30)
    expect(angEq(off, Math.atan2(20 - 5, 30))).toBe(true);
    expect(angEq(base, off)).toBe(false);
  });
  it('minSpeed 门:|x|+|y|<=minSpeed 不更新(:21183)', () => {
    // |x|+|y| = 30+20 = 50;门取 <= → 恰好相等也拦
    expect(heldProjItemRotation(100, 100, 130, 120, { minSpeed: 50 })).toBeNull();
    expect(heldProjItemRotation(100, 100, 130, 120, { minSpeed: 50.0001 })).toBeNull();
    expect(heldProjItemRotation(100, 100, 130, 120, { minSpeed: 49.9999 })).not.toBeNull();
    expect(heldProjItemRotation(100, 100, 130, 120, { minSpeed: 0 })).not.toBeNull();
  });
});

describe('heldProjAimWorld(玩家→投射物世界角,与 swing.aim 同约定)', () => {
  it('两侧都等于 atan2(projY−pY, projX−pX)', () => {
    expect(angEq(heldProjAimWorld(100, 100, 130, 120)!, Math.atan2(20, 30))).toBe(true);
    // 在左:vanilla 角含 π 翻转,此函数必须还原成真实世界指向角
    expect(angEq(heldProjAimWorld(100, 100, 70, 120)!, Math.atan2(20, -30))).toBe(true);
  });
  it('minSpeed 门透传 → null', () => {
    expect(heldProjAimWorld(100, 100, 130, 120, { minSpeed: 50 })).toBeNull();
  });
});

describe('帧内账本', () => {
  beforeEach(() => heldProjFrameBegin());

  it('非目标弹型静默跳过(连枷 25/悠悠球 541 原版不画持物,勿登记)', () => {
    noteHeldProjEntity({ projId: 25, x: 0, y: 0, w: 22, h: 22, dead: false });
    noteHeldProjEntity({ projId: 541, x: 0, y: 0, w: 16, h: 16, dead: false });
    noteHeldProjEntity({ projId: 1, x: 0, y: 0, w: 10, h: 10, dead: false });
    expect(heldProjSample(25)).toBeUndefined();
    expect(heldProjSample(541)).toBeUndefined();
  });
  it('190 登记:中心=碰撞盒中心,alpha 随实体;dead 跳过', () => {
    noteHeldProjEntity({ projId: 190, x: 200, y: 300, w: 22, h: 22, pAlpha: 0, dead: false });
    expect(heldProjSample(190)).toEqual({ projId: 190, cx: 211, cy: 311, alpha: 0 });
    noteHeldProjEntity({ projId: 190, x: 0, y: 0, w: 22, h: 22, dead: true });
    expect(heldProjSample(190)!.cx).toBe(211);   // dead 不覆盖
  });
  it('多弹取最后登记(≈原版高槽位者胜);帧首清账', () => {
    noteHeldProjEntity({ projId: 190, x: 10, y: 10, w: 10, h: 10, pAlpha: 0, dead: false });
    noteHeldProjEntity({ projId: 190, x: 500, y: 10, w: 10, h: 10, pAlpha: 0, dead: false });
    expect(heldProjSample(190)!.cx).toBe(505);
    heldProjFrameBegin();
    expect(heldProjSample(190)).toBeUndefined();
  });
});

describe('applyHeldProjPointing(消费门 + 覆写/合成)', () => {
  beforeEach(() => heldProjFrameBegin());

  function putPiranha(cx: number, cy: number, alpha = 0): void {
    noteHeldProjEntity({ projId: 190, x: cx - 11, y: cy - 11, w: 22, h: 22, pAlpha: alpha, dead: false });
  }

  it('无活体样本/无持有物 → 原样返回(恒等)', () => {
    const p = playerAt(100, 100);
    const sw: HeldProjSwing = { t: 15, dur: 30, item: PIRANHA_GUN_ID, useStyle: 5, aim: 0.2 };
    expect(applyHeldProjPointing(p, sw)).toBe(sw);
    putPiranha(150, 150);
    expect(applyHeldProjPointing(playerAt(100, 100, null), sw)).toBe(sw);
  });
  it('持有物不匹配(HeldItem.shoot != type,:21167)→ 原样返回', () => {
    putPiranha(150, 150);
    const other = playerAt(100, 100, 164);   // 164 手枪(shoot≠190)
    const sw: HeldProjSwing = { t: 15, dur: 30, item: 164, useStyle: 5, aim: 0.2 };
    expect(applyHeldProjPointing(other, sw)).toBe(sw);
  });
  it('useStyle 5 swing:aim 覆写为指向角,其余字段不动', () => {
    putPiranha(160, 140);                     // 右上 → atan2(40,60)
    const sw: HeldProjSwing = { t: 7, dur: 30, item: PIRANHA_GUN_ID, useStyle: 5, aim: 0.2 };
    const out = applyHeldProjPointing(playerAt(100, 100), sw);
    expect(out).not.toBe(sw);
    expect(out!.t).toBe(7);
    expect(out!.dur).toBe(30);
    expect(out!.item).toBe(PIRANHA_GUN_ID);
    expect(out!.useStyle).toBe(5);
    expect(angEq(out!.aim!, Math.atan2(40, 60))).toBe(true);
  });
  it('非 useStyle 5(挥砍/饮用)与 noGraphic(短剑)让位:挥舞动画优先', () => {
    putPiranha(160, 140);
    const swing1: HeldProjSwing = { t: 20, dur: 30, item: 155, useStyle: 1, aim: 0.5 };
    expect(applyHeldProjPointing(playerAt(100, 100), swing1)).toBe(swing1);
    const ng: HeldProjSwing = { t: 10, dur: 25, item: PIRANHA_GUN_ID, useStyle: 13, aim: 0.5, noGraphic: true };
    expect(applyHeldProjPointing(playerAt(100, 100), ng)).toBe(ng);
  });
  it('alpha>0(淡入,:21163)不抢瞄准角', () => {
    putPiranha(160, 140, 255);
    const sw: HeldProjSwing = { t: 15, dur: 30, item: PIRANHA_GUN_ID, useStyle: 5, aim: 0.2 };
    expect(applyHeldProjPointing(playerAt(100, 100), sw)).toBe(sw);
  });
  it('swing 过期(null)→ 合成 useStyle 5(= SetDummyItemTime(5) 渲染侧等价)', () => {
    putPiranha(70, 130);                      // 左侧
    const out = applyHeldProjPointing(playerAt(100, 100), null);
    expect(out).not.toBeNull();
    expect(out!.t).toBe(1);
    expect(out!.dur).toBe(1);
    expect(out!.item).toBe(PIRANHA_GUN_ID);
    expect(out!.useStyle).toBe(5);
    expect(out!.noGraphic).toBeFalsy();
    expect(angEq(out!.aim!, Math.atan2(30, -30))).toBe(true);
  });
});

describe('绘制调用采样(drawUseItem 消费指向角)', () => {
  beforeEach(() => heldProjFrameBegin());

  /** 空壳 Renderer + 记录型 ctx:atlasIcon 无 atlas 返 null → 只走变换不画贴图 */
  function sampleRotate(facing: 1 | -1, swing: HeldProjSwing, px = 100, py = 100): number[] {
    const rots: number[] = [];
    const ctx = {
      save: () => {}, restore: () => {},
      translate: () => {}, scale: () => {},
      rotate: (a: number) => { rots.push(a); },
      drawImage: () => {},
    } as unknown as CanvasRenderingContext2D;
    const r = Object.create(Renderer.prototype) as unknown as Record<string, unknown>;
    r.atlas = null;
    r.animTick = 0;
    r.itemIcon = () => null;
    r.ctx = ctx;
    // equipStats：drawUseItem 手套族 meleeScaleGlove 缩放档读该对象（缺省空 = 不缩放）
    const p = { cx: px, cy: py, x: px - 8, y: py - 14, w: 16, h: 28, facing, equipStats: {} };
    (Renderer.prototype as unknown as {
      drawUseItem(c: CanvasRenderingContext2D, pl: unknown, s: HeldProjSwing, f: unknown): void;
    }).drawUseItem.call(r, ctx, p, swing, null);
    return rots;
  }

  it('朝右:绘制旋转角 = 指向角(枪口指向食人鱼)', () => {
    noteHeldProjEntity({ projId: 190, x: 250, y: 100, w: 22, h: 22, pAlpha: 0, dead: false });
    const swing = applyHeldProjPointing(playerAt(100, 100), { t: 15, dur: 30, item: PIRANHA_GUN_ID, useStyle: 5, aim: 0 })!;
    const rots = sampleRotate(1, swing);
    expect(rots.length).toBeGreaterThan(0);
    expect(angEq(rots[0], swing.aim!)).toBe(true);        // facing=+1:局部角=世界角
  });
  it('朝左:绘制旋转角 = π−aim(镜像空间换算,世界指向不变)', () => {
    noteHeldProjEntity({ projId: 190, x: 250, y: 100, w: 22, h: 22, pAlpha: 0, dead: false });
    const swing = applyHeldProjPointing(playerAt(100, 100), { t: 15, dur: 30, item: PIRANHA_GUN_ID, useStyle: 5, aim: 0 })!;
    const rots = sampleRotate(-1, swing);
    expect(rots.length).toBeGreaterThan(0);
    expect(angEq(rots[0], Math.PI - swing.aim!)).toBe(true);   // facing=−1:π−aim
  });
  it('合成 swing 的 bodyFrame 行随指向角走 useStyle 5 档(Player.cs:35986-36005)', () => {
    const proto = Renderer.prototype as unknown as {
      useStyleBodyRow(s: HeldProjSwing, pl: unknown): number;
    };
    const p = { facing: 1 } as never;
    // 右侧平指:itemRotation*dir ∈ (−0.75, 0.6) → 行 3
    noteHeldProjEntity({ projId: 190, x: 200, y: 90, w: 22, h: 22, pAlpha: 0, dead: false });
    const flat = applyHeldProjPointing(playerAt(100, 100), null)!;
    expect(proto.useStyleBodyRow.call(Object.create(Renderer.prototype), flat, p)).toBe(3);
    heldProjFrameBegin();
    // 左上陡指:itemRotation*dir > 0.6 → 行 4(举臂)
    noteHeldProjEntity({ projId: 190, x: 40, y: 120, w: 22, h: 22, pAlpha: 0, dead: false });
    const steep = applyHeldProjPointing(playerAt(100, 100), null)!;
    expect(proto.useStyleBodyRow.call(Object.create(Renderer.prototype), steep, p)).toBe(4);
  });
});
