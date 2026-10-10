// BJ601 Item.glowMask 消费面收编（BJ597 尾批③ + BJ599 新债②③合刀）。
//
// 原版锚（Terarria1457 亲读）：
//   · 数据面：Item.glowMask public short（Item.cs:195）SetDefaults 逐件赋值——
//     72 处赋值 = 67 件正值 + 5 件 -1 显式重置（2782-2786 日耀工具变体）。
//     提取器 tools/_bj601-glowmask-extract.mjs（SetDefaults1..5 逐 case 终值）。
//   · 手持两段：尾段（挥舞+静持共体）PlayerDrawLayers.cs:3499-3509（color 缺省
//     White :3204 + 逐案覆写 :3211-3226 + ApplyStealthToColor :3272）；useStyle 5
//     通用瞄准段 :3472-3477（color3=White+stealth :3475）。staff 支 return 早退
//     （:3363-3445）——3870 staff 支内自带 [238]×(255,255,255,127)（:3439-3445）。
//   · 掉落物：Main.cs DrawItem :39300（num2）/ :39387（3779→-1）/ :39408-39437
//     （门 num2!=-1 && type!=46 && type!=5462；色式 switch :39409-39427；
//     origin=glowmaskFrame.Size()/2 :39431/:39436 → 光罩中心≡物品中心）。
//   · pulley 门：PlayerDrawLayers.cs:3183 flag2 = holdStyle!=0 && !pulley ——
//     滑轮挂绳期静持物整不画（挥舞支 flag 不带 pulley 因子照画）。
//   · 色式（XNA AlphaBlend 预乘）：A=0 → 纯加算 'lighter'；A>0 → source-over×alpha。
//     光罩色不取光照=自发光 → 合成后逃逸队列（BJ509/BJ597 同判例域）；
//     46/3827 手持段 itemColor=Lighting.GetColor(玩家中心)（:3187）。
//
// 本仓落刀面：src/data/vanillaItemGlow.ts（数据面+纯函数）+ Renderer.ts 五站
//   （drawDrop 收集/静持收集/挥舞收集/flushItemGlow/pulley 门）。
//
// 判别力设计：②色式锁 = 测试内【独立转录】反编译公式（与实现零共享代码）全域
//   扫描对拍；①表锁 = 提取器钉值锚 + 计数 + 负面（-1 重置/无 glow 件不在表）；
//   ③掉落锁 = 排除面真值表 + 3858 动画帧矩形;④pulley 锁 = 纯门真值表 + Renderer
//   源文锁;⑤资产锁 = 67 mask 逐张 Glow_{N}.png 存在 + 3858 帧格尺寸。
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ITEM_GLOWMASK, DROP_GLOW_EXCLUDED, HAND_GLOW_SKIP, STAFF_GLOW_SPECIAL,
  heldGlowColors, dropGlowColors, dropGlowKind, heldGlowKind, xnaColorToOp,
  staticHoldDrawGate, monkT3GlowRect, glowSourceRect, MONK_T3_GLOW,
  emberPulseColor, lightsBaneColor, betsySwordColor, phaseColor,
  palGlowColor, white63Color, wrappedLerp, multiLerpColor,
} from '../src/data/vanillaItemGlow';

const RDR = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
const GLOW_SRC = readFileSync(join(__dirname, '../src/data/vanillaItemGlow.ts'), 'utf8');

// ===================== ② 独立转录（反编译公式,判别力基准面） =====================

/** C# (byte) 截断（float→byte unchecked 向零取整） */
const cbyte = (v: number) => Math.trunc(Math.min(255, Math.max(0, v)));
/** Utils.WrappedLerp（Utils.cs:305-313） */
function vWrappedLerp(a: number, b: number, t: number): number {
  let x = t * 2;
  if (x > 1) x = 2 - x;
  return a + (b - a) * x;
}
/** Utils.Remap（Utils.cs：Clamp01((v-min)/(max-min)) → newMin+(newMax-newMin)·t） */
function vRemap(v: number, min: number, max: number, newMin: number, newMax: number): number {
  const t = Math.min(1, Math.max(0, (v - min) / (max - min)));
  return newMin + (newMax - newMin) * t;
}
/** XNA Color*float（逐通道 (byte)(c·f) 截断） */
function colorMul(c: readonly number[], f: number): [number, number, number, number] {
  return [cbyte(c[0] * f), cbyte(c[1] * f), cbyte(c[2] * f), cbyte(c[3] * f)];
}
/** XNA Color.Lerp（逐通道 (byte)(a + t·(b−a)) 截断） */
function colorLerp(a: readonly number[], b: readonly number[], t: number): [number, number, number, number] {
  return [cbyte(a[0] + t * (b[0] - a[0])), cbyte(a[1] + t * (b[1] - a[1])),
    cbyte(a[2] + t * (b[2] - a[2])), cbyte(a[3] + t * (b[3] - a[3]))];
}

/** :3213-3216/:39417-39422 5669 橙脉冲（A=item.alpha=0）——测试内独立转录 */
function vEmber(miscCounter: number): [number, number, number, number] {
  const w = vWrappedLerp(0.5, 1, (miscCounter % 100) / 100);
  const c = colorLerp([255, 255, 255, 255], [180, 85, 30, 255], w);
  return [c[0], c[1], c[2], 0];
}
/** :3211-3216 46 光照渐隐（itemColor=光照,amount=Remap(len/1.731,.3,.5,1,0)） */
function vLightsBane(light: readonly [number, number, number] | null): [number, number, number, number] {
  let amount = 1;
  if (light) {
    const r = light[0] / 255, g = light[1] / 255, b = light[2] / 255;
    amount = vRemap(Math.sqrt(r * r + g * g + b * b) / 1.731, 0.3, 0.5, 1, 0);
  }
  return colorLerp([0, 0, 0, 0], colorMul([255, 255, 255, 127], 0.7), amount);
}
/** :3218-3221 3827（GetAlpha 默认支=itemColor 原样 → Lerp(·,White,.6) → A=66） */
function vBetsy(light: readonly [number, number, number] | null): [number, number, number, number] {
  const l = light ?? [255, 255, 255];
  const c = colorLerp([l[0], l[1], l[2], 255], [255, 255, 255, 255], 0.6);
  return [c[0], c[1], c[2], 66];
}
/** Main.hslToRgb（Main.cs:48689+hue2rgb :48726）——测试内独立转录 */
function vHue2rgb(cc: number, t1: number, t2: number): number {
  let c = cc;
  if (c < 0) c++;
  if (c > 1) c--;
  if (6 * c < 1) return t1 + (t2 - t1) * 6 * c;
  if (2 * c < 1) return t2;
  if (3 * c < 2) return t1 + (t2 - t1) * (2 / 3 - c) * 6;
  return t1;
}
function vHsl(h: number, s: number, l: number, a = 255): [number, number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v, a]; }
  const p = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const q = 2 * l - p;
  return [Math.round(vHue2rgb(h + 1 / 3, q, p) * 255), Math.round(vHue2rgb(h, q, p) * 255),
    Math.round(vHue2rgb(h - 1 / 3, q, p) * 255), a];
}
/** ItemSlot.GetTrustyPalGlowColor（:2957-2962）——测试内独立转录 */
function vPal(gtw: number): [number, number, number, number] {
  const num = vWrappedLerp(0, 1, (gtw / 3) % 1);
  const num2 = vRemap(num, 0.2, 1, 0, 1);
  const c = vHsl((0.04 + 0.07 * num) % 1, 1, 0.5, 127);
  return colorMul(colorMul(c, 0.5), num2);
}
/** Item.GetPhaseColorDirect（:49165-49199 乘子表 → FNA Color(float)=Clamp 截断） */
function vPhaseDirect(mul: readonly [number, number, number]): [number, number, number, number] {
  return [cbyte(mul[0] * 255), cbyte(mul[1] * 255), cbyte(mul[2] * 255), 255];
}
const V_PHASE_COLORS = [
  vPhaseDirect([0.1, 0.5, 1.2]), vPhaseDirect([1, 0.2, 0.1]), vPhaseDirect([0.1, 1, 0.2]),
  vPhaseDirect([0.8, 0.1, 1]), vPhaseDirect([0.8, 0.9, 1]), vPhaseDirect([0.8, 0.8, 0]),
  vPhaseDirect([0.9, 0.5, 0]), vPhaseDirect([1.05, 0.1, 0.4]), vPhaseDirect([0.1, 0.5, 1.2]),
];
/** Utils.MultiLerp Color 版（Utils.cs:293-303） */
function vMultiLerp(percent: number, colors: ReadonlyArray<readonly number[]>): [number, number, number, number] {
  const step = 1 / (colors.length - 1);
  let i = 0;
  while (percent / step > 1 && i < colors.length - 2) i++;
  const t = (percent - step * i) / step;
  return colorLerp(colors[i], colors[i + 1], t);
}
/** Item.GetPhaseColor（:49056-49163；1101/1102=MultiLerp 环,drawColor→A=127） */
function vPhase(shoot: number, miscCounter: number, drawColor: boolean): [number, number, number, number] {
  if (shoot !== 1101 && shoot !== 1102) return [255, 255, 255, 255];
  const c = vMultiLerp((miscCounter % 300) / 300, V_PHASE_COLORS);
  return drawColor ? [c[0], c[1], c[2], 127] : c;
}

const MISC_SWEEP = [0, 1, 7, 25, 49, 50, 51, 73, 99, 100, 149, 150, 151, 200, 250, 299, 300, 349, 425, 600];
const LIGHT_SWEEP: ReadonlyArray<readonly [number, number, number] | null> = [
  null, [0, 0, 0], [13, 13, 13], [64, 64, 64], [128, 100, 60], [192, 192, 192], [255, 255, 255],
  [255, 0, 0], [0, 255, 0], [0, 0, 255], [30, 200, 90],
];

// ===================== ① 表结构锁（67 件/锚/负面/值域） =====================

describe('BJ601 ① ITEM_GLOWMASK 表结构锁（提取器钉值）', () => {
  it('67 件整、值域 [0,383]=GlowMaskID 空间', () => {
    const entries = Object.entries(ITEM_GLOWMASK);
    expect(entries.length).toBe(67);
    for (const [, v] of entries) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(383);
    }
  });

  it('代表性 item→glow 映射锚（按类抽钉,提取器终值）', () => {
    // 旧日军团前杂件 / 月总防具 / 月总工具 / 火星科技 / 染料 / 家具 / 武器 / 浮漂 / 联办
    expect(ITEM_GLOWMASK[46]).toBe(328);      // LightsBane
    expect(ITEM_GLOWMASK[2757]).toBe(26);     // VortexHelmet
    expect(ITEM_GLOWMASK[2762]).toBe(30);     // NebulaLeggings
    expect(ITEM_GLOWMASK[2772]).toBe(1);      // VortexAxe
    expect(ITEM_GLOWMASK[2781]).toBe(10);     // NebulaPickaxe
    expect(ITEM_GLOWMASK[3466]).toBe(178);    // StardustPickaxe
    expect(ITEM_GLOWMASK[3525]).toBe(198);    // LunarHamaxeStardust
    expect(ITEM_GLOWMASK[2795]).toBe(47);     // LaserMachinegun
    expect(ITEM_GLOWMASK[2882]).toBe(102);    // ChargedBlasterCannon
    expect(ITEM_GLOWMASK[2863]).toBe(98);     // MartianHairDye
    expect(ITEM_GLOWMASK[2885]).toBe(106);    // InfernalWispDye
    expect(ITEM_GLOWMASK[3253]).toBe(129);    // LavaLamp
    expect(ITEM_GLOWMASK[3813]).toBe(244);    // DefendersForge
    expect(ITEM_GLOWMASK[3475]).toBe(191);    // VortexBeater
    expect(ITEM_GLOWMASK[3476]).toBe(194);    // NebulaArcanum（手持专支=Glow_195 另码）
    expect(ITEM_GLOWMASK[3540]).toBe(200);    // Phantasm
    expect(ITEM_GLOWMASK[3542]).toBe(207);    // NebulaBlaze
    expect(ITEM_GLOWMASK[3779]).toBe(218);    // SpiritFlame
    expect(ITEM_GLOWMASK[3827]).toBe(227);    // DD2SquireBetsySword
    expect(ITEM_GLOWMASK[3858]).toBe(233);    // MonkStaffT3
    expect(ITEM_GLOWMASK[3870]).toBe(238);    // ApprenticeStaffT3
    expect(ITEM_GLOWMASK[4722]).toBe(271);    // FirstFractal
    expect(ITEM_GLOWMASK[5462]).toBe(355);    // DeadCellsFlint
    expect(ITEM_GLOWMASK[5669]).toBe(374);    // TrueCopperShortsword
    expect(ITEM_GLOWMASK[5670]).toBe(372);    // RainbowPhaseblade
    expect(ITEM_GLOWMASK[5671]).toBe(373);    // RainbowPhasesaber
    expect(ITEM_GLOWMASK[5140]).toBe(318);    // FishingBobberGlowingStar
    expect(ITEM_GLOWMASK[5146]).toBe(324);    // FishingBobberGlowingRainbow
    expect(ITEM_GLOWMASK[6148]).toBe(379);    // PalworldMinionTrustyCattiva
    expect(ITEM_GLOWMASK[6174]).toBe(383);    // PalworldTrustyDigtoise
  });

  it('负面：2782-2786 日耀工具显式 -1 重置不入表；无 glow 件（火把 8/经典浮漂 5139）不在表', () => {
    for (const id of [2782, 2783, 2784, 2785, 2786]) expect(ITEM_GLOWMASK[id]).toBeUndefined();
    expect(ITEM_GLOWMASK[8]).toBeUndefined();     // Torch=flame 通道（ItemFlame）
    expect(ITEM_GLOWMASK[5139]).toBeUndefined();  // 经典浮漂无光罩（5140-5146 才有）
    expect(ITEM_GLOWMASK[75]).toBeUndefined();    // 坠星
  });
});

// ===================== ①b 手持两段色式锁（独立转录全域对拍） =====================

describe('BJ601 ② 手持两段叠画色式锁（:3204-3226 独立转录对拍）', () => {
  it('缺省 White（段 A color3/段 B color 同源）', () => {
    expect(heldGlowColors(2772, { miscCounter: 0, light: null })).toEqual([[255, 255, 255, 255]]);
    expect(heldGlowColors(5140, { miscCounter: 42, light: null })).toEqual([[255, 255, 255, 255]]);
    expect(heldGlowKind(2772)).toBe('white');
  });

  it('3870 staff 支内自带 (255,255,255,127)（:3439-3445）', () => {
    expect(heldGlowColors(3870, { miscCounter: 0, light: null })).toEqual([[255, 255, 255, 127]]);
    expect(heldGlowKind(3870)).toBe('staffWhite127');
    expect(STAFF_GLOW_SPECIAL).toBe(3870);
  });

  it('5669 橙脉冲 A=0（加算）——miscCounter 全域对拍独立转录', () => {
    for (const mc of MISC_SWEEP) {
      expect(emberPulseColor(mc)).toEqual(vEmber(mc));
      expect(heldGlowColors(5669, { miscCounter: mc, light: null })).toEqual([vEmber(mc)]);
    }
    // mc=0：WrappedLerp(0.5,1,0)=0.5 → Lerp 半程 → A=0 纯加算
    const c0 = emberPulseColor(0);
    expect(c0).toEqual([cbyte(255 + 0.5 * (180 - 255)), cbyte(255 + 0.5 * (85 - 255)), cbyte(255 + 0.5 * (30 - 255)), 0]);
    expect(xnaColorToOp(c0).blend).toBe('add');
  });

  it('46 光照渐隐——光照全域对拍独立转录（暗→(178,178,178,88)、亮→Transparent）', () => {
    for (const l of LIGHT_SWEEP) {
      expect(lightsBaneColor(l)).toEqual(vLightsBane(l));
      expect(heldGlowColors(46, { miscCounter: 0, light: l })).toEqual([vLightsBane(l)]);
    }
    // 暗：amount=1 → (178,178,178,88)（(255,255,255,127)*0.7 逐通道截断）
    expect(lightsBaneColor([0, 0, 0])).toEqual([178, 178, 178, 88]);
    expect(xnaColorToOp(lightsBaneColor([0, 0, 0])).blend).toBe('over');
    // 亮：len(White)=1.732 > 0.5·1.731 → amount=0 → Transparent≡不可见
    expect(lightsBaneColor([255, 255, 255])).toEqual([0, 0, 0, 0]);
  });

  it('3827 Lerp(光照,White,.6) A=66——光照全域对拍', () => {
    for (const l of LIGHT_SWEEP) {
      expect(betsySwordColor(l)).toEqual(vBetsy(l));
      expect(heldGlowColors(3827, { miscCounter: 0, light: l })).toEqual([vBetsy(l)]);
    }
    expect(betsySwordColor([255, 255, 255])).toEqual([255, 255, 255, 66]);
  });

  it('5670/5671 相位双画（先非 drawColor 后 drawColor A=127）——miscCounter 全域对拍', () => {
    for (const mc of MISC_SWEEP) {
      for (const vid of [5670, 5671]) {
        const shoot = vid === 5670 ? 1101 : 1102;
        expect(phaseColor(shoot, mc, false)).toEqual(vPhase(shoot, mc, false));
        expect(phaseColor(shoot, mc, true)).toEqual(vPhase(shoot, mc, true));
        expect(heldGlowColors(vid, { miscCounter: mc, light: null })).toEqual([
          vPhase(shoot, mc, false), vPhase(shoot, mc, true),
        ]);
      }
    }
    // drawColor A=127（:49109-49112 num=0.5）
    const c = phaseColor(1101, 0, true);
    expect(c[3]).toBe(127);
    const c0 = phaseColor(1101, 0, false);
    expect(c0[3]).toBe(255);
    expect(c0.slice(0, 3)).toEqual(c.slice(0, 3));
    expect(multiLerpColor(0, V_PHASE_COLORS)).toEqual(V_PHASE_COLORS[0]);
    expect(multiLerpColor(1, V_PHASE_COLORS)).toEqual(V_PHASE_COLORS[8]);
  });

  it('xnaColorToOp：A=0→add(alpha 1)/A>0→over(alpha=a/255)——xna-alpha0 判例面', () => {
    expect(xnaColorToOp([255, 255, 255, 0])).toEqual({ blend: 'add', tint: [1, 1, 1], alpha: 1 });
    expect(xnaColorToOp([255, 255, 255, 127])).toEqual({ blend: 'over', tint: [1, 1, 1], alpha: 127 / 255 });
    expect(xnaColorToOp([180, 85, 30, 0]).tint).toEqual([180 / 255, 85 / 255, 30 / 255]);
  });
});

// ===================== ①c 几何锁（glow 源矩形） =====================

describe('BJ601 ③ glow 源矩形锁（:39201-39266 glowmaskFrame 语义）', () => {
  it('缺省整张（67 件无 itemAnimations 注册件,glowmaskFrame=item 同帧整张）', () => {
    expect(glowSourceRect(210, 1, 0)).toEqual({ sy: 0, sh: 210 });
    expect(glowSourceRect(64, 1, 3)).toEqual({ sy: 0, sh: 64 });
  });

  it('3858 动画三帧条高−2（:39230-39235 Frame(1,3,0,idx)+Height-=2）', () => {
    expect(MONK_T3_GLOW).toEqual({ texW: 66, frameH: 70, frames: 3, frameHm2: 68, tickPerFrame: 5 });
    expect(monkT3GlowRect(0)).toEqual({ sy: 0, sh: 68 });
    expect(monkT3GlowRect(1)).toEqual({ sy: 70, sh: 68 });
    expect(monkT3GlowRect(2)).toEqual({ sy: 140, sh: 68 });
    expect(monkT3GlowRect(3)).toEqual({ sy: 0, sh: 68 });   // 回卷
    expect(monkT3GlowRect(-1)).toEqual({ sy: 140, sh: 68 }); // 负域归一
  });
});

// ===================== ② 掉落物光罩锁（Main.cs:39300-39437） =====================

describe('BJ601 ④ 掉落物光罩锁', () => {
  it('排除面 = {46,5462,3779}（:39408 外门 + :39387 num2=-1）恰三件', () => {
    expect([...DROP_GLOW_EXCLUDED].sort((a, b) => a - b)).toEqual([46, 3779, 5462]);
  });

  it('手持跳过面 = {3476,3779,5462}（专支×2 + Transparent）恰三件', () => {
    expect([...HAND_GLOW_SKIP].sort((a, b) => a - b)).toEqual([3476, 3779, 5462]);
  });

  it('掉落色式分派（:39409-39427 switch）', () => {
    expect(dropGlowKind(5670)).toBe('phaseDouble');
    expect(dropGlowKind(5671)).toBe('phaseDouble');
    expect(dropGlowKind(5146)).toBe('disco');
    expect(dropGlowKind(5669)).toBe('emberPulse');
    expect(dropGlowKind(3858)).toBe('white63');
    for (const v of [6148, 6149, 6150, 6151, 6174]) expect(dropGlowKind(v)).toBe('palGlow');
    expect(dropGlowKind(2772)).toBe('white');
    expect(dropGlowKind(46)).toBe('white');   // 虽在表,排除面拦截
  });

  it('掉落色式全域对拍独立转录', () => {
    const args = (mc: number, gtw: number): { miscCounter: number; globalTimeWrappedHourly: number; discoRGB: readonly [number, number, number] | null } =>
      ({ miscCounter: mc, globalTimeWrappedHourly: gtw, discoRGB: [200, 100, 50] });
    for (const mc of MISC_SWEEP) {
      expect(dropGlowColors(5670, args(mc, 0))).toEqual([vPhase(1101, mc, false), vPhase(1101, mc, true)]);
      expect(dropGlowColors(5669, args(mc, 0))).toEqual([vEmber(mc)]);
    }
    expect(dropGlowColors(3858, args(0, 0))).toEqual([[191, 191, 191, 47]]);   // (255,255,255,63)*0.75
    expect(white63Color()).toEqual([191, 191, 191, 47]);
    expect(dropGlowColors(5146, args(0, 0))).toEqual([[200, 100, 50, 255]]);   // Disco 直通
    expect(dropGlowColors(2772, args(0, 0))).toEqual([[255, 255, 255, 255]]);  // 缺省 White
    for (const gtw of [0, 0.5, 1.2, 1.5, 2.9, 3.7, 6.1]) {
      expect(palGlowColor(gtw)).toEqual(vPal(gtw));
      expect(dropGlowColors(6148, { miscCounter: 0, globalTimeWrappedHourly: gtw, discoRGB: null }))
        .toEqual([vPal(gtw)]);
    }
    // gtw=0：num=0 → num2=0 → 全零（Remap(num,0.2,1,0,1) 下端钳 0）
    expect(palGlowColor(0)).toEqual([0, 0, 0, 0]);
  });

  it('wrappedLerp 三角波对拍（Utils.cs:305-313）', () => {
    for (const t of [0, 0.2, 0.5, 0.7, 1, 1.5]) {
      let x = t * 2;
      if (x > 1) x = 2 - x;
      expect(wrappedLerp(0.3, 0.9, t)).toBeCloseTo(0.3 + (0.9 - 0.3) * x, 10);
    }
  });
});

// ===================== ④ pulley 门锁（PlayerDrawLayers.cs:3183） =====================

describe('BJ601 ⑤ pulley 门锁', () => {
  it('纯门真值表：pulley 期静持档归零（整不画）、非 pulley 透传', () => {
    expect(staticHoldDrawGate(0, false)).toBe(0);
    expect(staticHoldDrawGate(1, false)).toBe(1);
    expect(staticHoldDrawGate(2, false)).toBe(2);
    expect(staticHoldDrawGate(3, false)).toBe(3);
    expect(staticHoldDrawGate(8, false)).toBe(8);
    expect(staticHoldDrawGate(1, true)).toBe(0);
    expect(staticHoldDrawGate(2, true)).toBe(0);
    expect(staticHoldDrawGate(8, true)).toBe(0);
  });

  it('Renderer 源文锁：门接在静持面、身体行 holdStyleRaw 不受门、挥舞面无 pulley 因子', () => {
    expect(RDR.includes('staticHoldStyle = staticHoldDrawGate(staticHoldStyle, p.pulley);')).toBe(true);
    // holdStyleRaw = hs（身体行档在门之后仍取原值——:36025-36045 行档无 pulley 因子）
    expect(RDR.includes('holdStyleRaw = hs;')).toBe(true);
    expect(RDR.indexOf('holdStyleRaw = hs;')).toBeGreaterThan(
      RDR.indexOf('staticHoldStyle = staticHoldDrawGate(staticHoldStyle, p.pulley);'));
    // 门在 petting/hs4 两 caller 门之后（原版序 = flag2 因子链末端）
    expect(RDR.indexOf('staticHoldStyle = staticHoldDrawGate(staticHoldStyle, p.pulley);')).toBeGreaterThan(
      RDR.indexOf('if (hs === 4 && p.gravDir === -1) staticHoldStyle = 0;'));
  });
});

// ===================== ⑤ Renderer 消费面结构锁 =====================

describe('BJ601 ⑥ Renderer 五站结构锁', () => {
  it('收集站：掉落×1 + 静持×1 + 挥舞×1；冲刷站接在甲位 glow 后', () => {
    expect((RDR.match(/this\.collectDropItemGlow\(/g) ?? []).length).toBe(1);
    expect((RDR.match(/this\.collectHeldItemGlow\(/g) ?? []).length).toBe(2);
    expect((RDR.match(/this\.flushItemGlow\(\);/g) ?? []).length).toBe(1);
    expect(RDR.indexOf('this.flushItemGlow();')).toBeGreaterThan(RDR.indexOf('this.flushArmorGlow();'));
  });

  it('挥舞站 staff 支门（3870 唯一带 staff 支内自带 glow,其余 staff 跳过）', () => {
    expect(RDR.includes('(!STAFF_ITEMS.has(heldVid) || heldVid === STAFF_GLOW_SPECIAL)')).toBe(true);
    expect(RDR.includes('!HAND_GLOW_SKIP.has(heldVid)')).toBe(true);
  });

  it('掉落站 miscCounter 传参（:39424 LocalPlayer.miscCounter）', () => {
    expect(RDR.includes('private drawDrop(d: ItemDrop, miscCounter = 0)')).toBe(true);
    expect(RDR.includes('this.drawDrop(e, player.miscCounter);')).toBe(true);
  });

  it('静持站位次 = 本体后/火苗前（原版 glow :3499 < 火苗 :3567）——源序锁', () => {
    const staticSite = RDR.indexOf('★BJ601 静持段 glowMask 叠画');
    const flameSite = RDR.indexOf('if (ar && vid >= 0 && FLAME_ITEMS.has(vid) && this.atlas) {');
    expect(staticSite).toBeGreaterThan(0);
    expect(flameSite).toBeGreaterThan(staticSite);
  });

  it('掉落站 dest = 物品精灵中心（原版 origin=glowmaskFrame.Size()/2 :39431/:39436）', () => {
    // ★BJ603：rcx/rcy = ddx/ddy + 半尺寸（velocity 旋转支预计算的中心,末位 rot
    //   形参为 BJ603 掉落旋转臂新增——dest 语义=物品精灵中心不变）
    expect(RDR.includes('this.collectDropItemGlow(ctx, vid, ar, rcx, rcy, miscCounter, rot);')).toBe(true);
    expect(RDR.includes('const rcx = ddx + ar.sw / 2, rcy = ddy + ar.sh / 2;')).toBe(true);
    // 矩阵捕获 = 传入 ctx（drawPlayer 窗内 shim 代理,R3x 镜像;armorGlow 同判例）
    expect(RDR.includes('this.collectHeldItemGlow(ctx, p, vid,')).toBe(true);
    expect(RDR.includes('this.collectHeldItemGlow(ctx, p, heldVid,')).toBe(true);
    expect(RDR.includes('this.itemGlowQueue.push({ m: ctx.getTransform(), k: this._worldLowK, ops });')).toBe(true);
  });

  it('flush 非均匀 tint 走 tintSliceRGB 现烘（shim 窗外单槽许可）+ 白系快路径', () => {
    expect(RDR.includes('const sc = this.tintSliceRGB(img, op.sx, sy, op.sw, op.sh, op.tint, 1);')).toBe(true);
    expect(RDR.includes("ctx.globalCompositeOperation = op.blend === 'add' ? 'lighter' : 'source-over';")).toBe(true);
  });

  it('数据模块单源：无散落 glowMask 硬编码表（除 3476/195 既有专支）', () => {
    // Renderer 内不得再出现逐件 glowMask 数字表（单源 = vanillaItemGlow.ts）
    expect((RDR.match(/ITEM_GLOWMASK/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

// ===================== ⑥ 资产锁（67 mask 逐张在库 + 3858 帧格尺寸） =====================

describe('BJ601 ⑦ Glow_{N}.png 资产锁（384 张全在库面,消费 67 张逐张）', () => {
  const GLOW_DIR = join(__dirname, '../public/sprites/vanilla');

  it('67 mask 逐张 Glow_{N}.png 存在（缺资产列清单勿造占位——全在库=零缺）', () => {
    const missing: number[] = [];
    for (const [, mask] of Object.entries(ITEM_GLOWMASK)) {
      if (!existsSync(join(GLOW_DIR, `Glow_${mask}.png`))) missing.push(mask);
    }
    expect(missing).toEqual([]);
  });

  it('3858 光罩 Glow_233 = 66×210 三帧竖条（帧高 70）——帧格尺寸锁', () => {
    const png = readFileSync(join(GLOW_DIR, 'Glow_233.png'));
    // PNG IHDR：宽高 = 大端 uint32 @16/@20
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    expect(w).toBe(MONK_T3_GLOW.texW);
    expect(h).toBe(MONK_T3_GLOW.frameH * MONK_T3_GLOW.frames);
  });

  it('代表性光罩尺寸 = 物品贴图尺寸（同帧格布局;4722 FirstFractal 抽钉）', () => {
    // Item_4722 在 atlas（无单体文件）——以 Glow_271 尺寸为基准与提取器档案对拍:
    // BJ601 提取期实测 Glow_271=58×64 = Item_4722 全帧格。
    const png = readFileSync(join(GLOW_DIR, 'Glow_271.png'));
    expect(png.readUInt32BE(16)).toBe(58);
    expect(png.readUInt32BE(20)).toBe(64);
  });
});

// ===================== ⑦ 提取器对账锁（表=反编译源终值,防手改漂移） =====================

describe('BJ601 ⑧ 提取器脚本在位 + 表与提取器同源', () => {
  it('tools/_bj601-glowmask-extract.mjs 存在（SetDefaults1..5 逐 case 终值提取器）', () => {
    const t = readFileSync(join(__dirname, '../tools/_bj601-glowmask-extract.mjs'), 'utf8');
    expect(t.includes('SetDefaults1')).toBe(true);
    expect(t.includes('glowMask')).toBe(true);
  });

  it('数据模块头部锚（Item.cs:195 字段/GlowMaskID 0..383/四站行号）', () => {
    expect(GLOW_SRC.includes('Item.cs:195')).toBe(true);
    expect(GLOW_SRC.includes('3499-3509')).toBe(true);
    expect(GLOW_SRC.includes('39408-39437')).toBe(true);
    expect(GLOW_SRC.includes('3183')).toBe(true);
  });
});
