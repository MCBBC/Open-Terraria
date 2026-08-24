// 炸弹 28/雷管 29/手雷 30 绘制锚点 1:1 回归(2026-08-24 用户报"雷管碰撞盒不对"复核):
//   原版 1457 DrawProjDirect else 支旧式公式(Main.cs:35492):
//     anchor = (盒左 + num153 + num152, 盒上 + 盒高/2),origin = (num153, 盒高/2 + num151)
//     num153 = (贴图宽−盒宽)/2 + 盒宽/2 = 贴图宽/2 ⇒ 贴图左上 = (盒左 + num152, 盒上 − num151)
//   num151/152 表(Main.cs:30262-30269):28 族=8 / 29 族=11 / 30 无条目=0;X 全 0。
//   碰撞盒 = SetDefaults(Projectile.cs:1108-1132):28=22×22 / 29=10×10 / 30=14×14。
// ★结论备案:雷管贴图 10×32(引线+棒身)远大于 10×10 盒,盒罩贴图 11-21 行中带
//   (引线上探 11、体下悬 11)= 原版真态,非 bug;调试盒目视"贴顶部"即此几何+旋转所致。
// 本测试锁死:盒尺寸、锚点平移、origin 偏移、原生尺寸绘制(与判定盒解耦)。
import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GrenadeProj } from '../src/entities/WeaponProj';

// ------------------------------------------------------------ 记录型 ctx
type Call = { m: string; a: unknown[] };
function makeRecCtx() {
  const calls: Call[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => {
      if (k === 'canvas') return undefined;
      return (...a: unknown[]) => { calls.push({ m: String(k), a }); };
    },
  });
  return { calls, ctx };
}
function fakeR(ctx: unknown) {
  return { canvas: { getContext: () => ctx }, ctx, atlas: null } as never;
}

// ------------------------------------------------- global Image 替身(projSprite)
let NEXT_IMG = { w: 1, h: 1 };
beforeAll(() => {
  vi.stubGlobal('Image', class {
    naturalWidth = NEXT_IMG.w; naturalHeight = NEXT_IMG.h;
    width = NEXT_IMG.w; height = NEXT_IMG.h;
    complete = true;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) { this.onload?.(); }   // 同步装载
  });
});

/** 真实贴图尺寸(资产健康门:repo 资产必须=原版 Projectile_N.png) */
function pngSize(id: number): { w: number; h: number } {
  const b = fs.readFileSync(path.join(__dirname, '..', 'public', 'sprites', 'vanilla', `Projectile_${id}.png`));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function setScale(id: number) {
  const s = pngSize(id);
  NEXT_IMG = s;
  return s;
}

// [projId, 盒宽(SetDefaults), num151(1457 表)] —— num152 全 0
const CASES: Array<[number, number, number]> = [[28, 22, 8], [29, 10, 11], [30, 14, 0]];

describe('爆炸族绘制锚点(1457 Main.cs:35492 旧式公式 1:1)', () => {
  it.each(CASES)('弹 %i:盒=%i×%i,贴图左上=(盒左, 盒上−num151)', (id, box, num151) => {
    const tex = setScale(id);
    const p = new GrenadeProj(100, 200, 0, 0, 50, 180, id, () => {});
    // SetDefaults 碰撞盒(Projectile.cs:1108-1132)
    expect(p.w).toBe(box);
    expect(p.h).toBe(box);
    const { calls, ctx } = makeRecCtx();
    p.draw(fakeR(ctx), undefined as never);
    const tr = calls.find((c) => c.m === 'translate');
    const di = calls.find((c) => c.m === 'drawImage');
    expect(tr, '应走 drawProj 通用路径').toBeTruthy();
    expect(di, '应绘制贴图(原生尺寸)').toBeTruthy();
    // anchor = (盒左 + texW/2, 盒上 + 盒高/2)
    expect(tr!.a[0] as number).toBeCloseTo(100 + tex.w / 2, 6);
    expect(tr!.a[1] as number).toBeCloseTo(200 + box / 2, 6);
    // origin = (texW/2, 盒高/2 + num151) ⇒ drawImage 局部偏移取负
    expect(di!.a[1] as number).toBeCloseTo(-tex.w / 2, 6);
    expect(di!.a[2] as number).toBeCloseTo(-(box / 2 + num151), 6);
    // 绘制尺寸 = 贴图原生(drawSize=-1,与判定盒解耦——雷管 10×32 勿拉方)
    expect(di!.a[3] as number).toBe(tex.w);
    expect(di!.a[4] as number).toBeCloseTo(tex.h, 6);   // dw×(h/w) 浮点残差
    // 展开不变量:贴图左上 = (盒左, 盒上 − num151) —— 原版几何本体
    expect((tr!.a[0] as number) + (di!.a[1] as number)).toBeCloseTo(100, 6);
    expect((tr!.a[1] as number) + (di!.a[2] as number)).toBeCloseTo(200 - num151, 6);
  });
});
