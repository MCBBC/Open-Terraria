// ★R3x（2026-09-28 雷击帧雨消失定谳）守卫锁:
//   病灶链 = acc 窗 accFail→degradeAcc→bridge(raw 惰性建面,空 save 栈) → 本帧后续
//   restore 弹镜像回世界变换而 raw.restore() 对空栈 no-op → raw 停在换桥瞬间局部
//   变换 → getTransform 消费面（雨 C5/雪沙 C5b/液体 liqgl/gore F-gore 批与 bolt
//   bake 的基 CTM）读 raw 现值 → 整批顶点按世界坐标直发=全落画布外=雨层整批消失
//   （用户截图 40/41:雷击帧雨消失,雷后 acc 复开复现）。
//   双刀:①wrap.getTransform 双态回镜像（消费面与实体 geo decode 同源零分叉）;
//        ②bridge 重建 raw save 栈到镜像深度（restore 双栈同步弹出）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';

const SRC = readFileSync(join(__dirname, '../src/render/glshim/GLShimExecutor.ts'), 'utf8');

// ---- 最小 DOMMatrix 桩（node 无;生产=浏览器原生） ----
class DOMMatrixStub {
  a: number; b: number; c: number; d: number; e: number; f: number;
  constructor(m: ArrayLike<number>) {
    this.a = m[0]; this.b = m[1]; this.c = m[2]; this.d = m[3]; this.e = m[4]; this.f = m[5];
  }
}
(globalThis as unknown as { DOMMatrix?: unknown }).DOMMatrix ??= DOMMatrixStub;

// ---- FakeCtx（b2-shim-executor 同款最小面+可观测 save 栈） ----
class FakeCtx {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = 'source-over';
  imageSmoothingEnabled = false;
  fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  font = '10px sans-serif';
  textAlign: CanvasTextAlign = 'left';
  lineCap: CanvasLineCap = 'butt';
  lineJoin: CanvasLineJoin = 'miter';
  miterLimit = 10;
  filter = 'none';
  stack: Array<Pick<FakeCtx, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'>> = [];
  getTransform() { return { a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f } as DOMMatrix; }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f; }
  save() { this.stack.push({ a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f }); }
  restore() { const s = this.stack.pop(); if (s) Object.assign(this, s); }
  translate(x: number, y: number) { this.e += this.a * x + this.c * y; this.f += this.b * x + this.d * y; }
  scale(x: number, y: number) { this.a *= x; this.b *= x; this.c *= y; this.d *= y; }
  drawImage(_img: unknown, ..._args: unknown[]) { /* no-op */ }
}

/** acc 态 host 桩（attachAcc 成功面;flush 面本组不触） */
function mkAccHost() {
  const layer = {
    unavailable: false,
    isAccumOpen: () => false,
    endAccumulate: () => null,
  };
  return {
    host: {
      acquireGl: () => (layer.unavailable ? null : (layer as never)),
      worldCtx: () => null,
      worldW: () => 1280, worldH: () => 800,
    },
    layer,
  };
}

const CAM: [number, number, number, number, number, number] = [1, 0, 0, 1, 640 - 33010, 400 - 3771];
const LOCAL: [number, number, number, number, number, number] = [1, 0, 0, 1, 1000, 500];

/** 复刻定谳帧序:acc 窗→世界变换（只进镜像）→save→精灵局部变换→bridge(fresh raw)
 *  →restore（镜像弹回世界变换）。返回换桥后的各方可观测态。 */
function bridgeMidSprite(opts: { restores?: number } = {}) {
  const { host } = mkAccHost();
  const ex = new GLShimExecutor(host);
  const w = ex.attachAcc();
  if (!w) throw new Error('attachAcc 失败');
  const ctx = w as unknown as FakeCtx;
  ctx.translate(640, 400);            // 世界变换:translate(lw/2,lh/2)
  ctx.scale(1, 1);                    // ×(z·wK)
  ctx.translate(-33010, -3771);       // ×translate(-camRX,-camRY)
  ctx.save();                         // 精灵绘制 save
  ctx.translate(1000, 500);           // 精灵局部变换
  const fresh = new FakeCtx();        // degradeAcc 惰性建 worldCanvas（空栈 identity）
  ex.bridge(fresh as unknown as CanvasRenderingContext2D);
  const restores = opts.restores ?? 1;
  for (let i = 0; i < restores; i++) ctx.restore();
  return { ex, ctx, fresh, mirror: (ex as unknown as { m: DOMMatrix }).m };
}

describe('R3x bridge/save栈失同步——雷击帧雨消失根因守卫', () => {
  it('结构锁:getTransform 双态回镜像 + bridge 栈重建在案', () => {
    // getTransform 分支在 accMode 分支【外】（双态可达）
    expect(SRC).toMatch(/const b = bound\[prop\];\s*\n\s*if \(b !== undefined\) return b;\s*\n\s*\/\/ ★R3x[^\n]*\n[\s\S]{0,900}?if \(prop === 'getTransform'\) \{\s*\n\s*const m = self\.m;\s*\n\s*return \(\) => new DOMMatrix\(\[m\.a, m\.b, m\.c, m\.d, m\.e, m\.f\]\);\s*\n\s*\}\s*\n\s*if \(self\.accMode\) \{/);
    // bridge 内 save 栈重建（自底向上 回放条目态→save,先于当前态回放）
    expect(SRC).toContain('★R3x（2026-09-28 雷击帧雨消失定谳）:raw 的 save 栈重建到镜像深度');
    expect(SRC).toMatch(/for \(const s of this\.stack\) \{\s*\n\s*raw\.setTransform\(s\.m\.a[\s\S]{0,600}?raw\.save\(\);[\s\S]{0,600}?raw\.setTransform\(this\.m\.a/);
  });

  it('换桥后 restore:raw 随镜像弹回世界变换（旧码停在换桥瞬间局部变换=雨批世界坐标病灶）', () => {
    const { fresh, mirror } = bridgeMidSprite();
    // 镜像弹回世界变换
    expect([mirror.a, mirror.b, mirror.c, mirror.d, Math.round(mirror.e), Math.round(mirror.f)])
      .toEqual([CAM[0], CAM[1], CAM[2], CAM[3], Math.round(CAM[4]), Math.round(CAM[5])]);
    // raw 同步弹回（旧码:raw 停在 LOCAL=病灶坐标）
    expect([fresh.a, fresh.b, fresh.c, fresh.d, Math.round(fresh.e), Math.round(fresh.f)])
      .toEqual([CAM[0], CAM[1], CAM[2], CAM[3], Math.round(CAM[4]), Math.round(CAM[5])]);
  });

  it('换桥后 wrap.getTransform() 回镜像世界变换（雨批基 CTM 消费面）', () => {
    const { ex, ctx, fresh } = bridgeMidSprite();
    // 换桥后 fresh 的真值为局部变换态（由 bridge 当前态回放定格;restore 已弹回）
    const t = (ctx as unknown as { getTransform(): DOMMatrix }).getTransform();
    expect([t.a, t.b, t.c, t.d, Math.round(t.e), Math.round(t.f)])
      .toEqual([CAM[0], CAM[1], CAM[2], CAM[3], Math.round(CAM[4]), Math.round(CAM[5])]);
    void ex; void fresh;
  });

  it('bridge 栈重建:raw save 栈深度=镜像栈深度;restore 双栈同步清零', () => {
    // 换桥瞬间（未 restore）:raw 栈深度=镜像栈深度=1（世界变换 save）
    const { ex: ex0, fresh: fresh0 } = bridgeMidSprite({ restores: 0 });
    expect(fresh0.stack.length).toBe((ex0 as unknown as { stack: unknown[] }).stack.length);
    expect(fresh0.stack.length).toBe(1);
    // restore 一次:双栈同步清零,raw=镜像=世界变换
    const { ex, fresh } = bridgeMidSprite();
    expect(fresh.stack.length).toBe((ex as unknown as { stack: unknown[] }).stack.length);
    expect(fresh.stack.length).toBe(0);
    // 再 restore 一次（栈已空,幂等）
    const { ex: ex2, fresh: fresh2 } = bridgeMidSprite({ restores: 2 });
    expect((ex2 as unknown as { stack: unknown[] }).stack.length).toBe(0);
    expect(fresh2.stack.length).toBe(0);
    // 弹空后镜像与 raw 同在世界变换（1 条 save 存的就是它）
    expect([fresh2.a, fresh2.b, fresh2.c, fresh2.d, Math.round(fresh2.e), Math.round(fresh2.f)])
      .toEqual([CAM[0], CAM[1], CAM[2], CAM[3], Math.round(CAM[4]), Math.round(CAM[5])]);
  });

  it('同步态零行为差:普通 attach 窗 save/translate/restore 后 raw 与镜像恒等', () => {
    const raw = new FakeCtx();
    const { host } = mkAccHost();
    const ex = new GLShimExecutor(host);
    const w = ex.attach(raw as unknown as CanvasRenderingContext2D);
    expect(w).not.toBeNull();
    const ctx = w as unknown as FakeCtx;
    ctx.save();
    ctx.translate(33, -7);
    ctx.restore();
    expect([raw.a, raw.b, raw.c, raw.d, raw.e, raw.f]).toEqual([(ex as unknown as { m: DOMMatrix }).m.a, (ex as unknown as { m: DOMMatrix }).m.b, (ex as unknown as { m: DOMMatrix }).m.c, (ex as unknown as { m: DOMMatrix }).m.d, (ex as unknown as { m: DOMMatrix }).m.e, (ex as unknown as { m: DOMMatrix }).m.f]);
    const t = (ctx as unknown as { getTransform(): DOMMatrix }).getTransform();
    expect([t.a, t.b, t.c, t.d, t.e, t.f]).toEqual([raw.a, raw.b, raw.c, raw.d, raw.e, raw.f]);
  });
});
