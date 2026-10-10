// BJ599 手持物潜行减色（BJ595 台账 M3 销案落刀）。
//
// 原版锚（Terarria1457 亲读）：
//   · PlayerDrawLayers.cs:3589-3605 DrawPlayer_27_HeldItem_ApplyStealthToColor——
//     触发门 flag = drawUseStyle && playerItem.ranged（:3591,挥舞中仅远程）、
//     flag2 = !drawUseStyle & drawHoldStyle（:3592,静持持位）;
//     蘑菇矿（:3594-3602）：s=max(stealth,0.03)、num2=(1+10s)/11、
//       color=(byte)(R*s),(byte)(G*s),(byte)(B*num2),(byte)(A*s)（raw 直乘截断）;
//     星旋（:3603-3605）：color.MultiplyRGBA(new Color(Lerp(One,(0,.12,.16,0),1-s)))。
//   · caller 门（:3188-3191）：drawUseStyle=itemAnimation>0 && useStyle!=0;
//     drawHoldStyle=holdStyle!=0 && !pulley && CanVisuallyHoldItem。
//   · Utils.cs:2116-2120 MultiplyRGBA=(byte)(a.C*b.C/255f) 逐通道截断;
//     FNA Color(Vector4)（FNA src/Color.cs:1576）=(byte)Clamp(v*255,0,255) 截断。
//   · 消费点：drawinfo.itemColor(:3193→主贴图 GetAlpha)、glow(:3272)、glowMask
//     color3(:3475)、3788 color4(:3483)、5670/5671(:3506)、火苗 color5(:3574)。
//
// 本仓落刀面：src/render/heldItemStealthDim.ts（纯函数+entry-owned bake）+
//   Renderer.ts 三站（静持 :19410 区/挥舞 :20508 区/火苗 :19462、:20572）+
//   TileFlames.ts drawHeldItemFlame dim 参（color5 面预乘进染色缓存键）。
//   ★BJ348b-3 判例：ctx.filter 禁用——减色一律逐像素 bake（arcanumDimTex 习语）,
//   shim/acc/GL 三态同结果（零 filter 分叉面）。
//
// 判别力设计：②减色式锁 = 测试内【独立转录】反编译公式（与实现零共享代码）,
//   全域扫描对拍;①门锁 = 真值表+钳档钉值;③不触发面 = 无套/无门/恒等三族零因子;
//   ④BJ348b-3 = 源文锁（零 ctx.filter 面+逐像素习语+三站 drawImage 快路径）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  heldItemStealthDim, applyStealthToColor, dimmedHeldRegion, mulByte,
  type HeldStealthDim,
} from '../src/render/heldItemStealthDim';

const RDR = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
const TF = readFileSync(join(__dirname, '../src/render/TileFlames.ts'), 'utf8');
const HSD = readFileSync(join(__dirname, '../src/render/heldItemStealthDim.ts'), 'utf8');

// ===================== ② 独立转录（反编译公式,判别力基准面） =====================

/** C# (byte)(float) 截断（float→byte unchecked 向零取整,[0,255] 域无溢出面） */
const cbyte = (v: number) => Math.trunc(v);
/** FNA Color(Vector4)（Color.cs:1576-1583）:(byte)Clamp(v*255,0,255) 截断 */
const fnaColorByte = (v: number) => Math.trunc(Math.min(255, Math.max(0, v * 255)));

/** :3594-3602 蘑菇矿支——raw 直乘（测试内独立转录） */
function vanillaShroomite(c: readonly [number, number, number, number], stealth: number):
  [number, number, number, number] {
  const s = stealth < 0.03 ? 0.03 : stealth;
  const num2 = (1 + s * 10) / 11;
  return [cbyte(c[0] * s), cbyte(c[1] * s), cbyte(c[2] * num2), cbyte(c[3] * s)];
}

/** Utils.MultiplyRGBA（:2116-2120）:(byte)(a.C*b.C/255f)——int 乘精确浮点域 */
function multiplyRGBA(a: readonly [number, number, number, number],
  b: readonly [number, number, number, number]): [number, number, number, number] {
  return [
    Math.trunc((a[0] * b[0]) / 255), Math.trunc((a[1] * b[1]) / 255),
    Math.trunc((a[2] * b[2]) / 255), Math.trunc((a[3] * b[3]) / 255),
  ];
}

/** :3603-3605 星旋支——MultiplyRGBA(新 Color(Lerp(One,(0,.12,.16,0),1-s))) */
function vanillaVortex(c: readonly [number, number, number, number], stealth: number):
  [number, number, number, number] {
  const s = stealth < 0.03 ? 0.03 : stealth;
  const k = 1 - s;
  const factor: [number, number, number, number] = [
    fnaColorByte(1 - k), fnaColorByte(1 - 0.88 * k), fnaColorByte(1 - 0.84 * k), fnaColorByte(1),
  ];
  return multiplyRGBA(c, factor);
}

/** :3589-3605 全式（两分支按序串联,套装互斥但实现保留序） */
function vanillaApplyStealthToColor(c: readonly [number, number, number, number],
  stealth: number, shroomiteSet: boolean, vortexSet: boolean):
  [number, number, number, number] {
  let out: [number, number, number, number] = [c[0], c[1], c[2], c[3]];
  if (shroomiteSet) out = vanillaShroomite(out, stealth);
  if (vortexSet) out = vanillaVortex(out, stealth);
  return out;
}

const STEALTH_SWEEP = [0, 0.015, 0.03, 0.045, 0.06, 0.08, 0.1, 0.2, 0.33, 0.5, 0.66, 0.75, 0.9, 0.96, 0.99, 1, 1.5];
const COLOR_SAMPLES: ReadonlyArray<readonly [number, number, number, number]> = [
  [255, 255, 255, 255],   // itemColor≡White（主贴图 dimmedWhite 面）
  [100, 100, 100, 0],     // 火苗默认 color5（A=0 纯加族）
  [50, 50, 100, 20],      // 5293 color5
  [255, 255, 255, 200],   // 5353 color5
  [250, 250, 250, 100],   // 翼叠画族基色
  [7, 37, 47, 255],       // 星旋深档因子复乘（幂等性探针）
];

// ===================== ① 触发门 + 逐档系数锁 =====================

describe('BJ599 ①触发门（:3591-3593 flag|flag2 + 双套旗,真值表）', () => {
  const dim = (o: Partial<Parameters<typeof heldItemStealthDim>[0]>): HeldStealthDim | null =>
    heldItemStealthDim({
      stealth: 0.5, shroomiteSet: false, vortexSet: false,
      drawUseStyle: false, drawHoldStyle: false, ranged: false, ...o,
    });

  it('挥舞支 flag：ranged 物减色,近战/工具（火把挥动帧）不减——:3591 原版语义', () => {
    expect(dim({ drawUseStyle: true, ranged: true, shroomiteSet: true })).not.toBeNull();
    expect(dim({ drawUseStyle: true, ranged: true, vortexSet: true })).not.toBeNull();
    expect(dim({ drawUseStyle: true, ranged: false, shroomiteSet: true })).toBeNull();
    expect(dim({ drawUseStyle: true, ranged: false, vortexSet: true })).toBeNull();
    // ★flag2 的 !drawUseStyle 因子（:3592）：holdStyle 物挥舞帧不减（火把
    //   useStyle1+holdStyle1 同体——挥动中非远程即灭灯,静持帧才减）
    expect(dim({ drawUseStyle: true, ranged: false, drawHoldStyle: true, shroomiteSet: true })).toBeNull();
    expect(dim({ drawUseStyle: true, ranged: false, drawHoldStyle: true, vortexSet: true })).toBeNull();
  });

  it('静持支 flag2：holdStyle 持位物全减（含非远程火把/荧光棒）——:3592 原版语义', () => {
    expect(dim({ drawHoldStyle: true, shroomiteSet: true })).not.toBeNull();
    expect(dim({ drawHoldStyle: true, vortexSet: true })).not.toBeNull();
    expect(dim({ drawHoldStyle: true, ranged: true, shroomiteSet: true })).not.toBeNull();
  });

  it('静持无持位（普通武器非使用期）/ pulley 挂绳（drawHoldStyle=false 入参）不减', () => {
    expect(dim({ shroomiteSet: true })).toBeNull();
    expect(dim({ vortexSet: true })).toBeNull();
    expect(dim({ drawHoldStyle: false, shroomiteSet: true })).toBeNull();
  });

  it('无套不减（shroomiteStealth/setVortex 双旗皆假——:3594/:3603 门）', () => {
    expect(dim({ drawUseStyle: true, ranged: true })).toBeNull();
    expect(dim({ drawHoldStyle: true })).toBeNull();
  });

  it('恒等档 stealth≥1 → null（两族乘子全 1,零 bake churn）', () => {
    expect(dim({ drawUseStyle: true, ranged: true, shroomiteSet: true, stealth: 1 })).toBeNull();
    expect(dim({ drawUseStyle: true, ranged: true, vortexSet: true, stealth: 1 })).toBeNull();
    expect(dim({ drawUseStyle: true, ranged: true, shroomiteSet: true, stealth: 1.5 })).toBeNull();
  });

  it('钳档 0.03 钉值（:3596/:3604——s<0.03 → 0.03）：蘑菇矿 [7,7,30,7] / 星旋 [7,37,47,255]', () => {
    expect(applyStealthToColor([255, 255, 255, 255],
      dim({ drawHoldStyle: true, shroomiteSet: true, stealth: 0 })!)).toEqual([7, 7, 30, 7]);
    expect(applyStealthToColor([255, 255, 255, 255],
      dim({ drawHoldStyle: true, vortexSet: true, stealth: 0 })!)).toEqual([7, 37, 47, 255]);
  });

  it('中档钉值：s=0.5 蘑菇矿 [127,127,139,127]（B×(1+10s)/11 保蓝）/ 星旋 [127,142,147,255]', () => {
    expect(applyStealthToColor([255, 255, 255, 255],
      dim({ drawHoldStyle: true, shroomiteSet: true, stealth: 0.5 })!)).toEqual([127, 127, 139, 127]);
    expect(applyStealthToColor([255, 255, 255, 255],
      dim({ drawHoldStyle: true, vortexSet: true, stealth: 0.5 })!)).toEqual([127, 142, 147, 255]);
  });

  it('星旋 A 面 255 恒不变（暗青只走 RGB 面,与本体减色 A×s 分域——:3605 MultiplyRGBA 因子 A=1）', () => {
    const d = dim({ drawHoldStyle: true, vortexSet: true, stealth: 0.1 })!;
    expect(applyStealthToColor([255, 255, 255, 255], d)[3]).toBe(255);
    const s = dim({ drawHoldStyle: true, shroomiteSet: true, stealth: 0.1 })!;
    expect(applyStealthToColor([255, 255, 255, 255], s)[3]).toBeLessThan(255);   // 蘑菇矿 A×s 渐隐
  });
});

// ===================== ② 减色式合成等价锁（全域转录对拍） =====================

describe('BJ599 ②减色式 = 反编译公式独立转录全域对拍（:3589-3605）', () => {
  const mk = (stealth: number, shroomiteSet: boolean, vortexSet: boolean): HeldStealthDim => {
    const d = heldItemStealthDim({
      stealth, shroomiteSet, vortexSet,
      drawUseStyle: false, drawHoldStyle: true, ranged: false,
    });
    expect(d, `stealth=${stealth} 应触发`).not.toBeNull();
    return d!;
  };

  it('蘑菇矿单套：applyStealthToColor ≡ (byte)(C*s)/(byte)(B*num2) raw 直乘（六色样×17 档扫）', () => {
    for (const st of STEALTH_SWEEP) {
      if (st >= 1) continue;
      const d = mk(st, true, false);
      expect(d.shroomiteRaw, `s=${st}`).not.toBeNull();
      expect(d.vortexBytes, `s=${st}`).toBeNull();
      for (const c of COLOR_SAMPLES) {
        expect(applyStealthToColor(c, d), `s=${st} c=${c}`)
          .toEqual(vanillaShroomite(c, st));
      }
    }
  });

  it('星旋单套：applyStealthToColor ≡ MultiplyRGBA(fnaColorByte(Lerp)) 字节乘（六色样×17 档扫）', () => {
    for (const st of STEALTH_SWEEP) {
      if (st >= 1) continue;
      const d = mk(st, false, true);
      expect(d.shroomiteRaw, `s=${st}`).toBeNull();
      expect(d.vortexBytes, `s=${st}`).not.toBeNull();
      for (const c of COLOR_SAMPLES) {
        expect(applyStealthToColor(c, d), `s=${st} c=${c}`)
          .toEqual(vanillaVortex(c, st));
      }
    }
  });

  it('双套串联序（实现保留原版序,套装互斥不变式面）：shroomite → vortex', () => {
    for (const st of [0, 0.03, 0.2, 0.5, 0.96]) {
      const d = mk(st, true, true);
      for (const c of COLOR_SAMPLES) {
        expect(applyStealthToColor(c, d), `s=${st} c=${c}`)
          .toEqual(vanillaApplyStealthToColor(c, st, true, true));
      }
    }
  });

  it('主贴图 dimmedWhite 面：White 全式 ≡ 独立转录（bake 因子面=applyStealthToColor([255⁴]) 单源）', () => {
    for (const st of STEALTH_SWEEP) {
      if (st >= 1) continue;
      for (const [sh, vx] of [[true, false], [false, true], [true, true]] as const) {
        expect(applyStealthToColor([255, 255, 255, 255], mk(st, sh, vx)), `s=${st} sh=${sh} vx=${vx}`)
          .toEqual(vanillaApplyStealthToColor([255, 255, 255, 255], st, sh, vx));
      }
    }
  });

  it('mulByte 核 ≡ Utils.MultiplyRGBA (byte)(a*b/255f)（:2116-2120）', () => {
    expect(mulByte(255, 255)).toBe(255);
    expect(mulByte(0, 255)).toBe(0);
    expect(mulByte(255, 7)).toBe(7);          // White×星旋R因子 = 因子本身
    expect(mulByte(100, 7)).toBe(2);          // trunc(700/255)=2
    expect(mulByte(100, 47)).toBe(18);        // trunc(4700/255)=18
    for (let a = 0; a <= 255; a += 5) {
      for (let b = 0; b <= 255; b += 7) {
        expect(mulByte(a, b)).toBe(Math.trunc((a * b) / 255));
      }
    }
  });
});

// ===================== ③ 不触发面（非潜行零变化） =====================

describe('BJ599 ③不触发面零因子（无套/无门/恒等——逐位原路径守卫）', () => {
  it('六态全 null：调用方 dimF=null 逐位走原 drawImage 路径（Renderer dimF 空支）', () => {
    const cases: Parameters<typeof heldItemStealthDim>[0][] = [
      { stealth: 0.5, shroomiteSet: false, vortexSet: false, drawUseStyle: true, drawHoldStyle: false, ranged: true },
      { stealth: 0.5, shroomiteSet: false, vortexSet: false, drawUseStyle: false, drawHoldStyle: true, ranged: false },
      { stealth: 0.5, shroomiteSet: true, vortexSet: false, drawUseStyle: false, drawHoldStyle: false, ranged: false },
      { stealth: 0.5, shroomiteSet: false, vortexSet: true, drawUseStyle: false, drawHoldStyle: false, ranged: false },
      { stealth: 0.5, shroomiteSet: true, vortexSet: false, drawUseStyle: true, drawHoldStyle: false, ranged: false },
      { stealth: 0.5, shroomiteSet: false, vortexSet: true, drawUseStyle: true, drawHoldStyle: false, ranged: false },
    ];
    for (const o of cases) {
      expect(heldItemStealthDim(o)).toBeNull();
    }
  });

  it('node 无 document：dimmedHeldRegion 自愈 null（调用方画原帧——首帧偏亮自愈面）', () => {
    const d = heldItemStealthDim({ stealth: 0.5, shroomiteSet: true, vortexSet: false,
      drawUseStyle: false, drawHoldStyle: true, ranged: false });
    expect(d).not.toBeNull();
    expect(dimmedHeldRegion({} as unknown as CanvasImageSource, 0, 0, 8, 8, d!)).toBeNull();
  });
});

// ===================== ④ BJ348b-3 判例锁（shim/acc/GL 三态同结果） =====================

describe('BJ599 ④BJ348b-3 判例锁（零 ctx.filter 面——shim/acc 栅格化分叉防御）', () => {
  it('heldItemStealthDim.ts 全文件零 ctx.filter API、逐像素 bake 习语（getImageData/putImageData）', () => {
    // ★needle = filter 赋值 API 面（注释含"ctx.filter"判例字样不判红）
    expect(/\.filter\s*=/.test(HSD)).toBe(false);
    expect(HSD.includes('getImageData')).toBe(true);
    expect(HSD.includes('putImageData')).toBe(true);
    expect(HSD.includes('globalCompositeOperation')).toBe(false);   // 逐像素直乘,非合成链
  });

  it('Renderer 三站接线：静持/挥舞 dimF 站 + dimmedHeldRegion bake + 火苗 dim 参', () => {
    expect(RDR.includes('heldItemStealthDim(')).toBe(true);
    // 静持站（drawHoldStyle 支）与挥舞站（drawUseStyle 支）各一
    expect((RDR.match(/heldItemStealthDim\(\{/g) ?? []).length).toBe(2);
    expect((RDR.match(/dimmedHeldRegion\(/g) ?? []).length).toBe(4);   // 3476×2 + 普通×2
    expect(RDR.includes("from './heldItemStealthDim'")).toBe(true);
    // 火苗 color5 消费点（:3574）：两站均传 dimF（缺省参不传 = 旧签名漂移）
    expect((RDR.match(/drawHeldItemFlame\(ctx, this\.atlas, (?:vid|fvid), p\.facing, \{[^}]+\}, flicker, dimF\)/g) ?? []).length).toBe(2);
  });

  it('TileFlames 火苗减色面：color5 全 RGBA（含 A 面）过 dim → 染色缓存键,A>0 走 AlphaBlend 真值', () => {
    expect(TF.includes('applyStealthToColor')).toBe(true);
    expect(TF.includes('dim?: HeldStealthDim | null')).toBe(true);
    expect(TF.includes('const dimmed = dim ? applyStealthToColor(c5, dim) : c5;')).toBe(true);
    // color5 = (RGB, spec.A) 全式（A 面逐件表 :3528-3551——近似忽略已移除）
    expect(TF.includes('tint?.[2] ?? 255, spec.a,')).toBe(true);
    // A=0 加性族 'lighter' / A>0 source-over ≙ XNA AlphaBlend 预乘（背景衰减+alpha 面）
    expect(TF.includes("ctx.globalCompositeOperation = (dimmed[3] > 0) ? 'source-over' : 'lighter';")).toBe(true);
    expect(TF.includes('a && a > 0 && a < 255')).toBe(true);   // cell A 面烘焙门
    expect(/\.filter\s*=/.test(TF)).toBe(false);
  });

  it('挥舞站 drawUseStyle 用物品真实 useStyle（itemFunc 表,缺表回退挥舞载荷档——:3188 门）', () => {
    expect(RDR.includes("const itemUs = heldVid >= 0 ? (itemFuncOfVid(heldVid)?.useStyle ?? null) : null;")).toBe(true);
    expect(RDR.includes('drawUseStyle: itemUs != null ? itemUs !== 0 : us !== 0,')).toBe(true);
    expect(RDR.includes('drawHoldStyle: !p.pulley,')).toBe(true);   // 静持站 pulley 门（:3190）
  });
});
