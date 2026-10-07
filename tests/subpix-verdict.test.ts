// ★subpix 定谳锁（2026-10-07;刀2「tile 渲染像素精度审查」销案判语）
//
// 【定谳=销案（粒度已用满;?subpix 旗不落刀——空转旗=伪旋钮,比缺位更劣）】
// 命题：恒速移动下 tile 对 CSS px 的 Math.round 阶跃跳动,dpr=2 上是否留有
// 「半步」粒度可提（flag 开=按设备像素取整）。
// 论证链（逐环源码锚）：
//  ①输出面分辨率=CSS：resize() `canvas.width = window.innerWidth`（无 dpr 因子;
//    c10eSyncCanvasSize 同式;sky2D/glCanvas 同尺寸）。全渲染栈
//    （Renderer/Camera/ChunkBake/GLPipeline/GLSpriteLayer）零 devicePixelRatio
//    引用（唯一触点=Game F5 遥测读数+vui DOM 文本层 FX58 档——非画布世界）。
//    ⇒ 浏览器在 DOM 合成期把整幅画布按 dpr 拉伸,dpr=2 的「2 设备 px 阶跃」
//    =画布上采样分辨率,不是渲染链任何一次取整的选择。
//  ②取整粒度=输出网格,已用满：camRX=round(cam.x·z)/z（世界变换吸附 1/z 世界
//    px=1 画布 px）→ drawChunkGrid/bglStageGrid 设备矩形
//    `ox+Math.round((worldPos−camRX)·zz)`（1 画布 px）。取整网格 ≡ 画布背板
//    像素网格——「按设备像素取整」无落点网格可对齐（画布内不存在更细的网格）,
//    该旗在机制上是空操作。
//  ③真正的修法=背板升格设备分辨率（canvas.width=innerWidth×dpr+ctx.scale）——
//    全局分辨率架构变更（主/sky/gl 三画布+worldLayer+ChunkBake 缓存+GL FBO 全
//    族 2-4× 显存/内存、2× 填充率、CSS 分辨率字节对拍金标全族重锚、共享边同
//    round 零缝 doctrine 重新论证）,独立立项,非一枚取整旗可承载。
//  ④配准不变式现状健康：相邻 chunk 共享边=同一表达式同 round（2026-08-18 缝
//    修复;2026-08-19 +1 拉伸缝撤除判例）,2D 与 GL 两路同式同源（:6012 注）。
// 本锁=定谳证据机械固化：①②④任一被「顺手改掉」（比如有人给画布乘 dpr 或动
// 取整式）即爆红——届时按 ③ 立项走分辨率战役,勿以取整旗名义动刀。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RDR = readFileSync(resolve(__dirname, '../src/render/Renderer.ts'), 'utf8');
const PIPE = readFileSync(resolve(__dirname, '../src/render/GLPipeline.ts'), 'utf8');
const LAYER = readFileSync(resolve(__dirname, '../src/render/GLSpriteLayer.ts'), 'utf8');
const BAKE = readFileSync(resolve(__dirname, '../src/render/ChunkBake.ts'), 'utf8');

describe('subpix 定谳①:输出面=CSS 分辨率（dpr 阶跃源=浏览器上采样,非渲染取整）', () => {
  it('主画布背板=window.innerWidth（无 dpr 因子;注释=CSS 全尺寸显式契约）', () => {
    expect(RDR).toContain('this.canvas.width = window.innerWidth;');
    expect(RDR).toContain('this.canvas.height = window.innerHeight;');
    expect(RDR).toContain('★主画布恒 CSS 全尺寸');
  });
  it('C10e 三画布同步同式（sky2D/glCanvas=HUD 尺寸,无 dpr）', () => {
    expect(RDR).toMatch(/private c10eSyncCanvasSize\(c: HTMLCanvasElement\): void \{\s*\n\s*const w = window\.innerWidth, h = window\.innerHeight;/);
  });
  it('世界渲染栈零 devicePixelRatio（Renderer/GLPipeline/GLSpriteLayer/ChunkBake 四文件逐字零命中）', () => {
    expect(RDR.includes('devicePixelRatio')).toBe(false);
    expect(PIPE.includes('devicePixelRatio')).toBe(false);
    expect(LAYER.includes('devicePixelRatio')).toBe(false);
    expect(BAKE.includes('devicePixelRatio')).toBe(false);
  });
});

describe('subpix 定谳②:取整粒度=画布像素网格（已用满;设备半步无落点）', () => {
  it('相机吸附=世界变换像素网格（round(cam·z)/z——1/z 世界 px=1 画布 px）', () => {
    expect(RDR).toContain('const camRX = Math.round(cam.x * z) / z;');
    expect(RDR).toContain('const camRY = Math.round(cam.y * z) / z;');
  });
  it('chunk 设备矩形取整=1 画布 px（2D drawChunkGrid 与 GL bglStageGrid 同式同源）', () => {
    expect(RDR).toContain('const xd0 = ox + Math.round((cx * CHUNK * ts - camRX) * zz);');
    expect(RDR).toContain('const oxg = Math.round(lw / 2), oyg = Math.round(lh / 2);');
    expect(RDR).toContain('与 drawChunkGrid 同式（共享边 round 同源 doctrine）');
  });
  it('?subpix 旗不落刀（销案=不产空转旋钮;渲染栈零 subpix 消费点）', () => {
    expect(RDR.includes("'subpix'")).toBe(false);
    expect(RDR.match(/subpix/g)?.length ?? 0).toBeLessThanOrEqual(2);   // 仅注释级提及容许
  });
});

describe('subpix 定谳④:共享边同 round 配准不变式（健康,禁单点改）', () => {
  it('零缝 doctrine 锚在（整数设备矩形+撤 +1 拉伸判例注释）', () => {
    expect(RDR).toContain('★整数设备矩形绘制（2026-08-18 修复"非整数 zoom 下树冠/仙人掌-地形接缝"）');
    expect(RDR).toContain('相邻块共享同一 round 值 = 精确边缘对接，\n          //   零缝零叠');
  });
});
