// ★B0 shim census 守卫（2026-09-22）
//
// GLShimCensus 分类语义（直映射档 vs 兜底档）+ 帧聚合/环形窗 + ?b0shadow 缺省零触碰。
// 注：B0 二段（shim 执行器 quad 批 + 影子 FBO 像素 diff）需 GL 运行时,node vitest
// 无法验证像素——移交件（B1+B2 立项前置）,仪具面 scripts/_b0-shadow-audit.mjs。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GLShimCensus } from '../src/render/glshim/GLShimCensus';

const src = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const rendererSrc = src('../src/render/Renderer.ts');
const censusSrc = src('../src/render/glshim/GLShimCensus.ts');

/** 桩 2D ctx（全方法 no-op;属性存取真实） */
function stubCtx(): CanvasRenderingContext2D {
  const target: Record<string, unknown> = {
    globalAlpha: 1, globalCompositeOperation: 'source-over', filter: 'none',
    imageSmoothingEnabled: true,
  };
  for (const m of ['drawImage', 'save', 'restore', 'setTransform', 'translate', 'scale',
    'rotate', 'fillRect', 'clip', 'fillText', 'beginPath', 'arc', 'stroke', 'fill',
    'getImageData', 'putImageData', 'createLinearGradient']) {
    target[m] = () => undefined;
  }
  return target as unknown as CanvasRenderingContext2D;
}

describe('B0 census 分类语义', () => {
  it('drawImage/仿射/save/restore/globalAlpha=直映射档', () => {
    const c = new GLShimCensus(stubCtx());
    const w = c.wrap();
    w.drawImage({} as CanvasImageSource, 0, 0);
    w.drawImage({} as CanvasImageSource, 0, 0, 8, 8);
    w.drawImage({} as CanvasImageSource, 0, 0, 8, 8, 1, 1, 8, 8);
    w.save(); w.save(); w.restore();
    w.translate(1, 2); w.scale(2, 2); w.rotate(0.1); w.setTransform(1, 0, 0, 1, 0, 0);
    w.globalAlpha = 0.5;
    c.endFrame();
    const s = c.snapshot();
    expect(s.frames[0].direct.drawImage).toBe(3);
    expect(s.frames[0].direct.save).toBe(2);
    expect(s.frames[0].direct.restore).toBe(1);
    expect(s.frames[0].direct.globalAlpha).toBe(1);
    expect(s.frames[0].fallback).toEqual({});           // 零兜底
    expect(s.frames[0].maxStackDepth).toBe(2);           // 栈深峰
  });

  it('clip/fillText/gradient/getImageData=兜底档;gCO lighter 直映射,multiply 兜底', () => {
    const c = new GLShimCensus(stubCtx());
    const w = c.wrap();
    w.clip();
    w.fillText('x', 0, 0);
    w.createLinearGradient(0, 0, 1, 1);
    w.getImageData(0, 0, 4, 4);
    w.globalCompositeOperation = 'lighter';
    w.globalCompositeOperation = 'multiply';
    (w as unknown as { filter: string }).filter = 'grayscale(1)';
    c.endFrame();
    const s = c.snapshot();
    expect(s.frames[0].fallback.clip).toBe(1);
    expect(s.frames[0].fallback.fillText).toBe(1);
    expect(s.frames[0].fallback.createLinearGradient).toBe(1);
    expect(s.frames[0].fallback.getImageData).toBe(1);
    expect(s.frames[0].fallback['globalCompositeOperation:multiply']).toBe(1);
    expect(s.frames[0].gco.lighter).toBe(1);
    expect(s.frames[0].gco.multiply).toBe(1);
    expect(Object.keys(s.frames[0].fallback).some((k) => k.startsWith('filter:'))).toBe(true);
  });

  it('drawImage 异常参数形态=兜底档', () => {
    const c = new GLShimCensus(stubCtx());
    const w = c.wrap();
    (w.drawImage as unknown as (a: unknown, b: number) => void)(1, 2);   // 2 参异常形态（绕 TS 签名）
    c.endFrame();
    expect(c.snapshot().frames[0].fallback['drawImage:2arg']).toBe(1);
  });

  it('endFrame 环形窗 600;快照隔离（slice 拷贝）', () => {
    const c = new GLShimCensus(stubCtx());
    const w = c.wrap();
    for (let i = 0; i < 605; i++) { w.drawImage({} as CanvasImageSource, 0, 0); c.endFrame(); }
    const s = c.snapshot();
    expect(s.frames.length).toBe(600);                   // 环形窗上限
    expect(s.frames[0].frame).toBe(6);                   // 最早 5 帧被逐出
  });
});

describe('B0 接线结构锁', () => {
  it('?b0shadow 旗在位（IIFE 惯例同源）;begin/endWorldLayer 挂 census;缺省零触碰', () => {
    expect(rendererSrc).toContain("new URLSearchParams(location.search).has('b0shadow')");
    expect(rendererSrc).toContain('Renderer.b0Shadow && !this._b0shim');
    expect(rendererSrc).toContain('this._b0shim?.endFrame()');
    expect(rendererSrc).toContain('this._b0Wrap ?? this.worldCtxLayer');
    expect(rendererSrc).toContain("from './glshim/GLShimCensus'");
  });

  it('捕获域=世界层 span（beginWorldLayer 返回包装面）——B 战役目标面口径', () => {
    const begin = rendererSrc.slice(
      rendererSrc.indexOf('private beginWorldLayer'),
      rendererSrc.indexOf('private endWorldLayer'),
    );
    expect(begin).toContain('this._b0shim.wrap()');
  });
});
