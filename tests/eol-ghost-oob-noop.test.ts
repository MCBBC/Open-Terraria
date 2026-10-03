// ★EoL 残影风暴定谳刀（2026-10-03）判别力锁:drawImage 源矩形与图像交集为空
// = 2D spec no-op（canvas 有源裁剪语义:交集空→不落笔）→ shim 直返不 flush 不回退。
// 定谳面=scripts/_eol-ghost-census.mjs:光女战 719 帧 fallback 47290 次 100%
// srcOOB-empty（873 光鞭 g873 帧行进负回绕,72×72 sy∈{−12,−24} sh=10,
// 风暴帧 448 回退=7 弹×32 槽×2 笔逐值命中,presentBatch p95=83/帧）。
// 本测试锁四条边:①空交集类直返(不 flush 不回退不重放) ②部分越界不误吞
// (仍 flush+raw 重放=旧链) ③NaN/负源尺寸不入门(落既有门) ④回滚口
// SRC_OOB_NOOP_OFF 恢复旧链。像素位级对拍=探针活机 A/B(该面 node 无 canvas)。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';

const EXEC = readFileSync(join(__dirname, '../src/render/glshim/GLShimExecutor.ts'), 'utf8');

// ---- 夹具（b2-shim-executor.test.ts 同族 FakeCtx/host——GL 不可用路径,
// flush=2D 重放;raw 日志=重放落点可观测） ----
class FakeCtx {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = 'source-over';
  imageSmoothingEnabled = false;
  fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  font = '10px sans-serif'; textAlign: CanvasTextAlign = 'left';
  log: Array<{ op: string; args: unknown[]; gco: string }> = [];
  getTransform() { return { a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f } as DOMMatrix; }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f; }
  save() { /* 镜像栈在执行器侧;raw 侧 no-op 足矣 */ }
  restore() { /* 同上 */ }
  translate() { /* 重放面走 drawRec2D 设备矩形,不消费 */ }
  scale() { /* 同上 */ }
  rotate() { /* 同上 */ }
  drawImage(_img: unknown, ...args: unknown[]) { this.log.push({ op: 'draw', args, gco: this.globalCompositeOperation }); }
  fillRect(x: number, y: number, w: number, h: number) { this.log.push({ op: 'fill', args: [x, y, w, h], gco: this.globalCompositeOperation }); }
}

function mkHost() {
  const layer = { unavailable: false, isAccumOpen: (_n: string) => false, endAccumulate: () => null } as { unavailable: boolean };
  return {
    layer,
    host: {
      acquireGl: () => (layer.unavailable ? null : (layer as never)),
      worldCtx: () => null,
      worldW: () => 1280, worldH: () => 720,
    },
  };
}

/** 873 残影同形源:72×72 贴图（ih=72→sh=10,rh=12;g873 负回绕 sy∈{−12m}）。 */
function mkImg873(): CanvasImageSource {
  return { width: 72, height: 72 } as unknown as CanvasImageSource;
}

function setup() {
  const raw = new FakeCtx();
  const { host } = mkHost();
  const ex = new GLShimExecutor(host);
  const wrap = ex.attach(raw as unknown as CanvasRenderingContext2D);
  expect(wrap).not.toBeNull();
  return { raw, ex, wrap: wrap as unknown as FakeCtx };
}

describe('EoL 源交集为空 no-op 门（定谳刀判别力）', () => {
  it('结构锁:SRC_OOB_NOOP_OFF 回滚口+门判据在 OOB 回退门之前', () => {
    expect(EXEC).toContain('static SRC_OOB_NOOP_OFF = false;');
    expect(EXEC).toContain('!GLShimExecutor.SRC_OOB_NOOP_OFF && sw > 0 && sh > 0');
    // 门必须在「源越界=回退」既有门之前（源码序）
    const noopIdx = EXEC.indexOf('SRC_OOB_NOOP_OFF && sw > 0');
    const oobIdx = EXEC.indexOf('// 源越界=2D 有源裁剪+dst 补偿语义');
    expect(noopIdx).toBeGreaterThan(-1);
    expect(oobIdx).toBeGreaterThan(noopIdx);
  });

  it('空交集（sy+sh≤0,873 同形）:直返——raw 零落笔、fallback 零计、前序队列不被 flush', () => {
    const { raw, ex, wrap } = setup();
    const img = mkImg873();
    // 前序合法 op 入队（若门失效,本 op 会被 fallback 的 flush 冲走重放）
    wrap.drawImage(img, 0, 0, 72, 10, 100, 100, 72, 10);
    expect(ex.stats.emitSO).toBe(1);
    // 873 负回绕档:sh=10 槽 sy=−12/−24（sy+sh=−2/−14<0）→ 交集空
    wrap.drawImage(img, 0, -12, 72, 10, 300, 100, 72, 10);
    wrap.drawImage(img, 0, -24, 72, 10, 300, 140, 72, 10);
    // 右侧完全越界/下方完全越界同类（判据四臂全覆盖）
    wrap.drawImage(img, 72, 0, 72, 10, 300, 180, 72, 10);   // sx≥iw
    wrap.drawImage(img, 0, 72, 72, 10, 300, 220, 72, 10);   // sy≥ih
    expect(ex.stats.fallback).toBe(0);      // 零回退
    expect(ex.stats.flushes).toBe(0);       // 前序队列未被冲（GL 不可用路径 flush=重放,raw.log 必空）
    expect(raw.log).toHaveLength(0);        // raw 零落笔（无 flush 重放无直绘）
    // detach flush:前序 op 照常重放=队列未丢
    ex.detach();
    expect(raw.log).toHaveLength(1);
  });

  it('判别力①:部分越界（sy=−2,sh=10→sy+sh=8>0 交集非空）不误吞——仍 flush+raw 重放（旧链）', () => {
    const { raw, ex, wrap } = setup();
    const img = mkImg873();
    wrap.drawImage(img, 0, 0, 72, 10, 100, 100, 72, 10);   // 前序入队
    wrap.drawImage(img, 0, -2, 72, 10, 300, 100, 72, 10);  // 部分越界=真实裁剪输出
    expect(ex.stats.fallback).toBe(1);      // 旧链回退
    // 本桩 GL 不可用,flush 走 replay2D 早退（不计 stats.flushes）——重放证据在 raw.log:
    // 前序 op 被冲重放+部分越界 op 直绘,均达 raw
    expect(raw.log.length).toBeGreaterThanOrEqual(2);
    // 重放含前序 op（fallback 前的队列内容不丢）
    expect(raw.log.some((r) => r.op === 'draw' && r.args[4] === 100)).toBe(true);
  });

  it('判别力②:边界触碰 sy+sh=0 = 空集直返;sy+sh=1 = 有输出走旧链', () => {
    const { raw, ex, wrap } = setup();
    const img = mkImg873();
    wrap.drawImage(img, 0, -10, 72, 10, 100, 100, 72, 10);  // sy+sh=0 恰空
    expect(ex.stats.fallback).toBe(0);
    expect(raw.log).toHaveLength(0);        // 未落 raw 未 flush（队列为空,flushForFallback no-op）
    wrap.drawImage(img, 0, -9, 72, 10, 100, 140, 72, 10);   // sy+sh=1 交集 1px
    expect(ex.stats.fallback).toBe(1);
    expect(raw.log.length).toBeGreaterThanOrEqual(1);   // 直绘达 raw
  });

  it('判别力③:NaN 源参/负源尺寸不入 no-op 门——落既有回退门（2D 语义不越权）', () => {
    const { raw, ex, wrap } = setup();
    const img = mkImg873();
    wrap.drawImage(img, 0, NaN, 72, 10, 100, 100, 72, 10);
    wrap.drawImage(img, 0, 0, -72, 10, 100, 100, 72, 10);   // 负 sw=非法源
    expect(ex.stats.fallback).toBe(2);
    expect(raw.log.length).toBeGreaterThanOrEqual(2);
  });

  it('判别力④:回滚口 SRC_OOB_NOOP_OFF=true 恢复旧链（全量 flush+回退）,finally 复位', () => {
    const { raw, ex, wrap } = setup();
    const img = mkImg873();
    GLShimExecutor.SRC_OOB_NOOP_OFF = true;
    try {
      wrap.drawImage(img, 0, -12, 72, 10, 300, 100, 72, 10);
      expect(ex.stats.fallback).toBe(1);    // 旧链:回退照走
      expect(raw.log.length).toBeGreaterThanOrEqual(1);
    } finally {
      GLShimExecutor.SRC_OOB_NOOP_OFF = false;
    }
    expect(GLShimExecutor.SRC_OOB_NOOP_OFF).toBe(false);
    // 复位后同形 op 回到直返支
    wrap.drawImage(img, 0, -12, 72, 10, 300, 100, 72, 10);
    expect(ex.stats.fallback).toBe(1);      // 不再 +1
  });

  it('873 实形回归账:in-bounds 槽照常入队批化（cut=SO/add=ADD 双笔面不回归）', () => {
    const { ex, wrap } = setup();
    const img = mkImg873();
    // g873 行进中 in-bounds 槽（k≡0 mod 7 → sy=0;k=1 → sy=12）
    wrap.drawImage(img, 0, 0, 72, 10, 300, 100, 72, 10);
    wrap.drawImage(img, 0, 12, 72, 10, 300, 140, 72, 10);
    expect(ex.stats.emitSO).toBe(2);
    expect(ex.stats.fallback).toBe(0);
    // aMul<1 族的 add 笔（lighter=tier1）同面
    wrap.globalCompositeOperation = 'lighter';
    wrap.drawImage(img, 0, 0, 72, 10, 300, 180, 72, 10);
    expect(ex.stats.emitADD).toBe(1);
  });
});
