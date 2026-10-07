// ★BJ553（2026-10-07）：鞭标记不显示复验——定位面钉值测试。
//  定谳（探针 scripts/_bj553-{f,h,l} 三段取证 + 原版亲读）：
//  · BJ512 块原落世界层（实体段后、compositeLight 前）→ 标记吃全屏光照乘——
//    昼夜对拍实锤：正午 maxΔ=163/α=0.348 ↔ 午夜 maxΔ=14/α=0.023 ↔ 复照
//    maxΔ=163（确定性昼夜摆动,非漂移）=夜晚/洞穴乘黑≈不可见=用户复报
//    「tagDamage/集火生效但视觉标记不显示」。
//  · 原版 DrawInterface_1_2_DrawEntityMarkersInWorld（Main.cs:47250-47284）=
//    SetupDrawInterfaceLayers 接口层（:45499）——世界渲染+光照【之后】无光直绘
//    （与 BJ509 四塔残影/BJ422 标尺同判例域）。
//  · 落刀=块挪至 compositeLight 之后全亮域（flushTrailShade 后、7a-pre 标尺前，
//    层内序=接口层 1_2<4）+ gravDir 显式镜像（:47259-47261 vector.Y=screenHeight−
//    vector.Y——本域在呈现面镜像点之后,整幅镜像不覆盖须自镜像）。
//  · 写链/清链/数据面 BJ512 全锚沿用（本套件补钉：帧矩形参数序 Utils.cs:1389
//    Frame(horizontalFrames,verticalFrames,frameX,frameY,dx,dy) 亲读=16×18 去尾
//    2px→16×16,regression=Frame 参数序读反）。
//  变异证红：
//   M1 块挪回 compositeLight 之前（旧病位）→ ①红
//   M2 删 flipY 镜像支（恒用 worldToScreen Y）→ ③红
//   M3 帧矩形 sy 去 ×18（16px 步进读半帧）→ ④红
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  whipMarkerFrameIndex, whipMarkerFrameRect, WHIP_MARKER_ALPHA, WHIP_MARKER_TINT_RGB,
} from '../src/render/Renderer';

const HERE = dirname(fileURLToPath(import.meta.url));
const rendererSrc = readFileSync(join(HERE, '..', 'src', 'render', 'Renderer.ts'), 'utf8');

describe('① 标记绘制位=光照合成之后（原版接口层 1_2 语义;M1 证红面）', () => {
  it('BJ553 标记块在 compositeLight 调用之后（旧病位=世界层内被乘光）', () => {
    const compIdx = rendererSrc.indexOf('this.compositeLight(cam, viewW, viewH');
    const markerIdx = rendererSrc.indexOf('// ★BJ553（2026-10-07）：鞭 tag/召唤集火目标标记');
    expect(compIdx).toBeGreaterThan(0);                 // 合成调用存在
    expect(markerIdx).toBeGreaterThan(compIdx);         // 旧病位（世界层内）=此断言红
  });
  it('旧世界层槽位已摘除：ent 窗段（emote 后 prePlayerDraws 前）不再持标记绘制', () => {
    const emoteIdx = rendererSrc.indexOf('if (eb) drawEmotes(this.ctx, eb);');
    const flushIdx = rendererSrc.indexOf('for (const draw of prePlayerDraws) draw();');
    expect(emoteIdx).toBeGreaterThan(0);
    expect(flushIdx).toBeGreaterThan(emoteIdx);
    const entWindow = rendererSrc.slice(emoteIdx, flushIdx);
    expect(entWindow).not.toContain('whipMarkerTintedSheet');  // 旧块残留=红
    expect(entWindow).not.toContain('WHIP_MARKER_ALPHA');
  });
});

describe('② 数据面沿用（BJ512 锚不回归）', () => {
  it('色 α = Color.White×0.7f 后 A/=2 = (178,178,178,89)（:47272-47273）', () => {
    expect(WHIP_MARKER_TINT_RGB).toBe(178);
    expect(WHIP_MARKER_ALPHA).toBeCloseTo(89 / 255, 10);
  });
  it('帧序 = (int)(GTW×10)%4（:47268）', () => {
    expect(whipMarkerFrameIndex(0)).toBe(0);
    expect(whipMarkerFrameIndex(0.35)).toBe(3);
    expect(whipMarkerFrameIndex(0.4)).toBe(0);
  });
});

describe('③ 屏空间映射（光照后直绘域;M2 证红面）', () => {
  it('gravDir=-1 显式屏 Y 镜像（:47259-47261 vector.Y=screenHeight−vector.Y 1:1）', () => {
    // 旧病位依赖世界变换整幅镜像承载;挪出后本域在镜像点之后=须自镜像
    expect(rendererSrc).toContain('cam.flipY ? viewH - smy0 : smy0');
  });
  it('ZoomMatrix 1:1=绘制尺寸×z（16×z 方形;恒 16px=缩放档错相）', () => {
    expect(rendererSrc).toContain('const zw = fr.sw * z, zh = fr.sh * z;');
  });
});

describe('④ 帧矩形参数序（Utils.cs:1389 亲读钉死;M3 证红面）', () => {
  it('Frame(1,4,0,frameY,0,-2)：72/4=18px 行距,去尾 2px=16×16（sy=frameY×18）', () => {
    expect(whipMarkerFrameRect(0)).toEqual({ sx: 0, sy: 0, sw: 16, sh: 16 });
    expect(whipMarkerFrameRect(1)).toEqual({ sx: 0, sy: 18, sw: 16, sh: 16 });
    expect(whipMarkerFrameRect(2)).toEqual({ sx: 0, sy: 36, sw: 16, sh: 16 });
    expect(whipMarkerFrameRect(3)).toEqual({ sx: 0, sy: 54, sw: 16, sh: 16 });
  });
});
