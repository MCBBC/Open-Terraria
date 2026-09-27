// ★I类 单槽复用重入（2026-09-27 定谳+修复锁）:bolt 烘焙面共享 boltScratch 同帧多次
//  烘焙（1 实体 ≤7 bolts、ArcSurge ≤13 bolts×3 发/帧）——旧链 flush 期逐 rec
//  texRefresh 全部读到【最后烘焙】的字节=先行 bolt quad 错拿末次内容（bgl/acc 态;
//  裸 2D 态逐 bolt 即画无此病）。修=bake 期立即上传（uploadScratchNow）到
//  (实体 id,bolt 序号) 稳定键+rec.preTex 直取（resolveTex 绝不再重传共享 scratch）。
//  GL 行为面 node vitest 不可跑（b0 判例）——以结构锁+接线不变式固化。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SHIM = readFileSync(new URL('../src/render/glshim/GLShimExecutor.ts', import.meta.url), 'utf8');
const PROJ = readFileSync(new URL('../src/entities/proj1457.ts', import.meta.url), 'utf8');
const RDR = readFileSync(new URL('../src/render/Renderer.ts', import.meta.url), 'utf8');

describe('★I类 bolt 烘焙共享 scratch 多雷同帧修复', () => {
  it('uploadScratchNow:bake 期立即上传到调用方稳定键+挂 pending（无 GL no-op）', () => {
    expect(SHIM).toContain('uploadScratchNow(img: HTMLCanvasElement, key: string): void {');
    expect(SHIM).toContain('const e = this.glw.texRefresh(key, img);');
    expect(SHIM).toContain('if (e) this.bakedTexPending = { img, tex: e };');
    expect(SHIM).toContain('if (!this.active || !this.glw || this.glw.unavailable) return;');
  });

  it('resolveTex:preTex 直取支在前（flush 期绝不再重传共享 scratch 末次字节）', () => {
    const rt = SHIM.indexOf('private resolveTex(');
    const pre = SHIM.indexOf('if (p.preTex) return glw.texAlive(p.preTex) ? p.preTex : null;');
    const dyn = SHIM.indexOf("const key = this.dynKeys.get(p.img as object)", rt);
    expect(pre).toBeGreaterThan(rt);
    expect(pre).toBeLessThan(dyn);
    expect(SHIM).toContain('rec.preTex = preTex;');
  });

  it('接线:pending 由同 img 的 acc drawImage 消费并清位（防跨 rec 陈旧挂载）', () => {
    expect(SHIM).toContain('const preTex = this.bakedTexPending && this.bakedTexPending.img === img');
    expect(SHIM).toContain('this.bakedTexPending = null;');
  });

  it('bakeBolt:稳定键=(实体 id,bolt 序号),draw 全路径传 bi（主雷补发=n-1）', () => {
    expect(PROJ).toContain('r9.markWorldDynamicScratch(sc, `boltBake:${this.id}:${bi}`);');
    expect(PROJ.match(/this\.drawBolt\(ctx, r, b, inten, progress, opacity, anim, waveInP, waveOutP, /g)?.length).toBe(2);
    expect(PROJ).toContain('waveInP: number, waveOutP: number, bi = 0): void {');
  });

  it('Renderer 中介:key 透传 uploadScratchNow,无 key 保持 markDynamic 旧语义', () => {
    expect(RDR).toContain('markWorldDynamicScratch(img: HTMLCanvasElement, key?: string): void {');
    expect(RDR).toContain('if (key) this.bglShimReg().uploadScratchNow(img, key);');
    expect(RDR).toContain('else this.bglShimReg().markDynamic(img);');
  });
});
