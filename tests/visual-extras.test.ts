// 视觉三件套回归：Glow 发光覆层表 / 火苗族 tile 表 / LiquidSlope 斜面选择。
// 标杆 = ../Terarria1456（行号注释见各源文件）。
// 断言只读素材与导出的纯函数/静态表，不依赖 DOM（vitest node 环境，同
// tests/liquid-shimmer-render.test.ts 的既有用法）。
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
// pngjs 无类型声明（同 tests/liquid-shimmer-render.test.ts 的既有用法）
// @ts-ignore
import { PNG } from 'pngjs';
import { TORCH_FLAME_TILE, flameWobble, randomNextSeed } from '../src/render/TileFlames';
import { liquidSlopeSource, liquidSlopeSheet } from '../src/render/VanillaLiquidRenderer';
import { Renderer } from '../src/render/Renderer';

const VANILLA = join(__dirname, '..', 'public', 'sprites', 'vanilla');
const vanillaFile = (f: string) => join(VANILLA, f);
/** PNG IHDR 宽高（偏移 16/20） */
const pngSize = (f: string): [number, number] => {
  const b = readFileSync(vanillaFile(f));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
/** GLOW_{id}.png 全量清单（379 张，GlowMaskID 空间） */
const glowIds = readdirSync(VANILLA)
  .filter((f) => /^Glow_\d+\.png$/.test(f))
  .map((f) => Number(f.slice(5, -4)));

// Renderer.ts 是大模块，但 npcGlowEntries 是纯静态遍历，import 副作用仅模块级
// 常量，node 环境安全（不触碰 canvas/DOM）。

describe('① Glow 发光覆层表（Main.cs DrawNPC 尾段硬编码 GlowMask 绘制）', () => {
  it('表内每个贴图都真实存在于 public/sprites/vanilla（懒加载 ensureVImage 的前提）', () => {
    const entries = Renderer.npcGlowEntries();
    expect(entries.length).toBeGreaterThanOrEqual(50); // 旧两批 17 + 第三批通用化
    for (const [id, tex] of entries) {
      const rel = tex.replace(/^vanilla\//, '');
      expect(existsSync(vanillaFile(rel)), `npc ${id} → ${rel} 缺素材`).toBe(true);
    }
  });

  it('抽查 10 个 id：第三批新入库的贴图逐一在盘上（GlowMaskID 空间，非 NPC id）', () => {
    // 10 个抽样 = 月族 6 + 散件 2 + 城镇宝石小动物 2（覆盖三个来源段）
    const sample: Array<[number, string]> = [
      [411, 'Glow_136.png'],   // 观星者（Main.cs:25597）
      [409, 'Glow_138.png'],   // 闪耀喷射者（:25600）
      [424, 'Glow_144.png'],   // 预言者（:25615）
      [429, 'Glow_151.png'],   // 旋涡怪（:25636）
      [518, 'Glow_163.png'],   // 飞行种 frame4（:25720）
      [315, 'Glow_255.png'],   // 无头骑士 frame4（:25744）
      [24, 'Glow_360.png'],    // 火焰小鬼（:25044）
      [520, 'Glow_164.png'],   // 火星行者（:25422）
      [639, 'Glow_286.png'],   // 紫水晶松鼠（:25048）
      [652, 'Glow_287.png'],   // 紫水晶兔（:25052）
    ];
    const byId = new Map(Renderer.npcGlowEntries());
    for (const [id, file] of sample) {
      expect(byId.get(id), `npc ${id} 未入表`).toBe(`vanilla/${file}`);
      expect(existsSync(vanillaFile(file)), `${file} 缺素材`).toBe(true);
    }
  });

  it('Glow 素材是 GlowMaskID 空间（0..378 连续 379 张）——按 NPC id 猜文件名的回归闸', () => {
    expect(glowIds).toHaveLength(379);
    expect(Math.min(...glowIds)).toBe(0);
    expect(Math.max(...glowIds)).toBe(378);
  });

  it('专属分支 NPC（月总 396/397/398、女皇 636、鹿角怪 668、暗黑魔法师 564/565）不落通用表', () => {
    const byId = new Map(Renderer.npcGlowEntries());
    // 564/565 在表中有历史条目但其 drawEnemy 走 drawDarkMageGrid 专属 return，
    // 通用路径触不到；此处锁定 396/397/398/636/668 必须不在表中（它们各自独占绘制）
    for (const id of [396, 397, 398, 636, 668]) {
      expect(byId.has(id), `npc ${id} 不应入通用 Glow 表`).toBe(false);
    }
  });
});

describe('② 火苗族 tile 表（Main.tileFlame Main.cs:9210-9222 + TileDrawing.cs:2857-2893）', () => {
  it('13 个 tileFlame 成员与 Flame_{n} 索引逐一对应（num9 switch 1:1）', () => {
    expect(TORCH_FLAME_TILE).toEqual({
      4: 0,           // Torches
      33: 1, 174: 1,  // Candles / Platinum Candle
      100: 2, 173: 2, // Candelabras / Platinum Candelabra
      34: 3,          // Chandeliers
      93: 4,          // Lamps
      49: 5,          // Water Candle
      372: 16,        // Peace Candle
      646: 17,        // Shadow Candle
      98: 6,          // Skull Lantern
      35: 7,          // Jack 'O Lantern
      42: 13,         // Hanging Lanterns
    });
  });

  it('表内引用的 Flame_{n} 索引全部在盘（含篝火独占的 Flame_15）', () => {
    const idx = new Set([...Object.values(TORCH_FLAME_TILE), 15]);
    for (const n of idx) {
      expect(existsSync(vanillaFile(`Flame_${n}.png`)), `Flame_${n}.png 缺素材`).toBe(true);
    }
  });

  it('Flame_0 与 Torch_0 同布局（132×528 平行表）——源矩形直取本体帧的前提', () => {
    expect(pngSize('Flame_0.png')).toEqual(pngSize('Tiles_4.png'));
  });

  it('未点燃火把列（frameX 66/88/110）在火苗表里是全透明——无需额外门（原版同机制）', () => {
    const tex = PNG.sync.read(readFileSync(vanillaFile('Flame_0.png')));
    for (const fx of [66, 88, 110]) {
      let opaque = 0;
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 20; x++) {
          if (tex.data[(y * tex.width + fx + x) * 4 + 3] > 32) opaque++;
        }
      }
      expect(opaque, `frameX=${fx} 应为空单元`).toBe(0);
    }
  });

  it('抖动种子数学 = Utils.RandomNextSeed LCG（Utils.cs:2388-2391）', () => {
    expect(randomNextSeed(0n)).toBe(11n);
    // (0x5DEECE66D * 1 + 11) & (2^48-1)
    expect(randomNextSeed(1n)).toBe((0x5deece66dn * 1n + 11n) & ((1n << 48n) - 1n));
  });

  it('flameWobble：同种子同序列（确定性）、7 份、幅度钳在 ±1.65/±3.5', () => {
    const a = flameWobble(123n), b = flameWobble(123n);
    expect(a).toEqual(b);
    expect(a).toHaveLength(7);
    for (const [ox, oy] of a) {
      expect(Math.abs(ox)).toBeLessThanOrEqual(10 * 0.15 + 1e-9);
      expect(Math.abs(oy)).toBeLessThanOrEqual(10 * 0.35 + 1e-9);
    }
    // 不同种子 → 不同序列（火苗不齐闪）
    expect(flameWobble(124n)).not.toEqual(a);
  });
});

describe('③ LiquidSlope 斜面贴合（TileDrawing.cs:4526-4553 DrawPartialLiquid）', () => {
  it('三态选择：slope 0/半砖 → null（平面表）；slope 1..4 → 斜面表列 18×(slope-1)', () => {
    expect(liquidSlopeSource(0, 0, 4, 16, 12)).toBeNull();          // 平面（无坡）
    expect(liquidSlopeSource(1, 0, 4, 16, 12))                       // 左斜（右下坡）
      .toEqual({ sx: 0, sy: 4, sw: 16, sh: 12 });
    expect(liquidSlopeSource(2, 0, 4, 16, 12))                       // 右斜（左下坡）
      .toEqual({ sx: 18, sy: 4, sw: 16, sh: 12 });
    expect(liquidSlopeSource(3, 0, 0, 16, 16)).toEqual({ sx: 36, sy: 0, sw: 16, sh: 16 });
    expect(liquidSlopeSource(4, 0, 0, 16, 16)).toEqual({ sx: 54, sy: 0, sw: 16, sh: 16 });
    expect(liquidSlopeSource(5, 0, 0, 16, 16)).toBeNull();           // 越界编码兜底
  });

  it('斜面表 15 张全在盘且为 72×16（4 列×18px 间距的斜面片段网格）', () => {
    for (let n = 0; n < 15; n++) {
      const f = `LiquidSlope_${n}.png`;
      expect(existsSync(vanillaFile(f)), `${f} 缺素材`).toBe(true);
      expect(pngSize(f), f).toEqual([72, 16]);
    }
  });

  it('表文件映射：水=群系 style / 岩浆 1 / 蜂蜜 11 / 微光 14（TextureAssets.LiquidSlope[15]）', () => {
    expect(liquidSlopeSheet(0, 3)).toBe('vanilla/LiquidSlope_3.png');
    expect(liquidSlopeSheet(1)).toBe('vanilla/LiquidSlope_1.png');
    expect(liquidSlopeSheet(2)).toBe('vanilla/LiquidSlope_11.png');
    expect(liquidSlopeSheet(3)).toBe('vanilla/LiquidSlope_14.png');
    expect(liquidSlopeSheet(0, 99)).toBe('vanilla/LiquidSlope_14.png'); // 钳 0-14
  });
});

describe('④ Glow 环绕轨道族 + 特殊分支（第四批，Main.cs:25805-26204/:26086-26128 等）', () => {
  const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

  it('轨道参数表：541 沙元素 4 份/周期 2.4s/半径 4·num300+2（:25910-25914/:26091）', () => {
    // t=0：num300=cos(0)/2+0.5=1 → 半径 6；t=1.2（半周期）：num300=0 → 半径 2
    const p0 = Renderer.npcGlowOrbitParams(541, 0, 0)!;
    expect(p0.count).toBe(4);
    expect(near(p0.num300, 1)).toBe(true);
    expect(near(p0.radius, 6)).toBe(true);
    expect(near(p0.phase, 0)).toBe(true);
    const p1 = Renderer.npcGlowOrbitParams(541, 1.2, 0)!;
    expect(near(p1.num300, 0)).toBe(true);
    expect(near(p1.radius, 2)).toBe(true);
    // ai2 不参与 541（无 ai2 门）——任意值同结果
    expect(Renderer.npcGlowOrbitParams(541, 0, 50)!.radius).toBeCloseTo(6, 6);
  });

  it('轨道参数表：568/569 枯萎兽出生门 lai3>=60（:26116）+ 1.5s HotPink 包络（:25892-25898）', () => {
    expect(Renderer.npcGlowOrbitParams(568, 0, 0, 59)).toBeNull();   // 出生中不画
    expect(Renderer.npcGlowOrbitParams(569, 0, 0, 30)).toBeNull();
    const p = Renderer.npcGlowOrbitParams(568, 0, 0, 60)!;           // 出生完成态
    expect(p.count).toBe(4);
    expect(near(p.num300, 1 / 6 + 0.75, 1e-9)).toBe(true);           // cos(0)/6+0.75
    expect(near(p.radius, 4 * (1 / 6 + 0.75) + 2, 1e-9)).toBe(true);
    // 1.5s 周期呼吸：半周期处 cos(π)/6+0.75 = 7/12
    expect(near(Renderer.npcGlowOrbitParams(568, 0.75, 0, 60)!.num300, -1 / 6 + 0.75, 1e-9)).toBe(true);
  });

  it('轨道参数表：661 帝皇蝶 6 份、ai2 驱动半径/相位并钳 0..50（:25917-25922/:26100/:26106 + NPC.cs:45253）', () => {
    // ai2=0（神圣内常态）：无 ai2 增益，t=0 → num300=1 → 半径 2×1+2=4、相位 0
    const p0 = Renderer.npcGlowOrbitParams(661, 0, 0)!;
    expect(p0.count).toBe(6);
    expect(near(p0.radius, 4)).toBe(true);
    expect(near(p0.phase, 0)).toBe(true);
    // ai2=50（离神圣渐隐满档）：t=1.2 半周期（cos 项=0）→ num300 取下限 50/60、
    // 相位 3×50/60=2.5、半径 (2+50)·num300+2
    const p50 = Renderer.npcGlowOrbitParams(661, 1.2, 50)!;
    expect(near(p50.num300, 50 / 60, 1e-9)).toBe(true);
    expect(near(p50.phase, 2.5, 1e-9)).toBe(true);
    expect(near(p50.radius, 52 * (50 / 60) + 2, 1e-9)).toBe(true);
    // ai2 增益只抬下限：t=0（cos 项=1）时 num300 仍为 1
    expect(Renderer.npcGlowOrbitParams(661, 0, 50)!.num300).toBeCloseTo(1, 9);
    // 越界 ai2 按原版 Clamp(0,50) 归一
    expect(Renderer.npcGlowOrbitParams(661, 0, 999)!.phase).toBeCloseTo(2.5, 9);
    expect(Renderer.npcGlowOrbitParams(661, 0, -5)!.phase).toBe(0);
    // 未知 id 不入轨道族
    expect(Renderer.npcGlowOrbitParams(999, 0, 0)).toBeNull();
  });

  it('轨道染色：Gold/HotPink 常量 + 661 逐份 HSL 彩虹（:26087/:25895/:26105）', () => {
    expect(Renderer.npcGlowOrbitTint(541, 0, 0)).toEqual([255, 215, 0]);
    expect(Renderer.npcGlowOrbitTint(568, 3, 1.5)).toEqual([255, 105, 180]);
    // 661 hue = (GT + i/6)%1：t=0 时 i=0 → hue 0 = 纯红；i=3 → hue 0.5 = 纯蓝
    //（Main.cs:47282-47290 通道映射 R=hue+1/3 / G=hue / B=hue-1/3，非标准 HSL 的青）
    expect(Renderer.npcGlowOrbitTint(661, 0, 0)).toEqual([255, 0, 0]);
    expect(Renderer.npcGlowOrbitTint(661, 3, 0)).toEqual([0, 0, 255]);
    // hue 随时间旋转（GlobalTimeWrappedHourly 漂移）
    expect(Renderer.npcGlowOrbitTint(661, 0, 0.5)).not.toEqual([255, 0, 0]);
  });

  it('414 爬足虫尾受击红闪（:25656-25663）：RGB=(255-n,n,n)、A=255-n、负段 128+lai2', () => {
    expect(Renderer.npcGlowCrawltipedeFlash(0)).toBeNull();          // 无闪
    expect(Renderer.npcGlowCrawltipedeFlash(128)).toEqual({ rgb: [127, 128, 128], a: 127 });
    expect(Renderer.npcGlowCrawltipedeFlash(64)).toEqual({ rgb: [191, 64, 64], a: 191 });
    expect(Renderer.npcGlowCrawltipedeFlash(-128)).toEqual({ rgb: [255, 0, 0], a: 255 });
    expect(Renderer.npcGlowCrawltipedeFlash(-16)).toEqual({ rgb: [143, 112, 112], a: 143 });
  });

  it('387 特斯拉炮塔充能白化（:25451-25459）：静止 0.75/0.75 → 满充亮度→1、A→0', () => {
    const idle = Renderer.npcGlowTeslaFade(0, 0);
    expect(idle.bright).toBeCloseTo(191 / 255, 9);
    expect(idle.fadeA).toBeCloseTo(191 / 255, 9);
    const half = Renderer.npcGlowTeslaFade(29, 0);                   // amount7=(29+1)/60=0.5
    expect(half.bright).toBeCloseTo((191 + 32) / 255, 9);
    expect(half.fadeA).toBeCloseTo((191 * 0.5) / 255, 9);
    const full = Renderer.npcGlowTeslaFade(60, 0);                   // amount7=61/60 外推（原版不钳）
    expect(full.bright).toBeGreaterThan(1);
    expect(full.fadeA).toBeCloseTo(0, 9);
    // spawnAlpha 整体 ×Opacity
    expect(Renderer.npcGlowTeslaFade(0, 128).bright).toBeCloseTo((191 / 255) * (127 / 255), 9);
  });

  it('425 枪口星芒包络（:25631 + :34741-34745）：0→15 渐亮、30 满蓄、30→40 渐灭、冷却恒 0', () => {
    expect(Renderer.npcGlowSparkleEnvelope(0)).toEqual({ opacity: 0, num: 0 });
    expect(Renderer.npcGlowSparkleEnvelope(-150)).toEqual({ opacity: 0, num: 0 }); // 放射后冷却
    expect(Renderer.npcGlowSparkleEnvelope(15).opacity).toBeCloseTo(1, 9);
    expect(Renderer.npcGlowSparkleEnvelope(15).num).toBeCloseTo(0.5, 9);
    expect(Renderer.npcGlowSparkleEnvelope(30)).toEqual({ opacity: 1, num: 1 });   // 满蓄开火帧
    expect(Renderer.npcGlowSparkleEnvelope(33).num).toBeCloseTo(0.5, 9);
    expect(Renderer.npcGlowSparkleEnvelope(40).num).toBe(0);
  });

  it('160/209 微光/派对变体贴图档（:25769/:25783）', () => {
    expect(Renderer.npcGlowVariantTex(160, false, 0)).toBe('vanilla/Glow_166.png');
    expect(Renderer.npcGlowVariantTex(160, true, 0)).toBe('vanilla/Glow_352.png');
    expect(Renderer.npcGlowVariantTex(209, false, 1)).toBe('vanilla/Glow_167.png');
    expect(Renderer.npcGlowVariantTex(209, true, 0)).toBe('vanilla/Glow_350.png');
    expect(Renderer.npcGlowVariantTex(209, true, 1)).toBe('vanilla/Glow_351.png');
    expect(Renderer.npcGlowVariantTex(108, false, 0)).toBeNull();
  });

  it('表触发位：orbit 族 / 437 整图罩+fadeA / 425 星芒 / 520 指示灯 / 653 锚差', () => {
    expect(Renderer.npcGlowConfig(541)!.mode).toBe('orbit');
    expect(Renderer.npcGlowConfig(568)!.mode).toBe('orbit');
    expect(Renderer.npcGlowConfig(569)!.mode).toBe('orbit');
    expect(Renderer.npcGlowConfig(661)!.mode).toBe('orbit');
    expect(Renderer.npcGlowConfig(437)!.full).toBe('vanilla/Glow_108.png');
    expect(Renderer.npcGlowConfig(437)!.fadeA).toBeCloseTo(200 / 255, 9);
    expect(Renderer.npcGlowConfig(437)!.a).toBe(1);                  // RGB=白 → 加色满亮（A 只削底）
    expect(Renderer.npcGlowConfig(425)!.sparkle).toEqual({ tex: 'vanilla/Extra_98.png', dx: 27 });
    expect(Renderer.npcGlowConfig(520)!.spinner)
      .toEqual({ tex: 'vanilla/Extra_56.png', glow: 'vanilla/Glow_165.png', dy: 20 });
    expect(Renderer.npcGlowConfig(653)!.dy).toBe(-1);                // +3 vs 族内 +4（:25198/:25194）
    // 414/387 走运行时链（无表 fadeA——A 由 npcGlowCrawltipedeFlash/npcGlowTeslaFade 给出）
    expect(Renderer.npcGlowConfig(414)!.fadeA).toBeUndefined();
    expect(Renderer.npcGlowConfig(387)!.fadeA).toBeUndefined();
    expect(Renderer.npcGlowConfig(387)!.a).toBeUndefined();
  });

  it('第四批引用素材全在盘（Glow_216/224/108/165/350/351/352、NPC_661、Extra_56/98）', () => {
    const need = [
      'Glow_216.png', 'Glow_224.png', 'Glow_108.png', 'Glow_109.png',
      'Glow_165.png', 'Glow_164.png', 'Glow_350.png', 'Glow_351.png', 'Glow_352.png',
      'Glow_166.png', 'Glow_167.png', 'Glow_150.png', 'Glow_159.png', 'Glow_32.png',
      'Glow_288.png', 'NPC_661.png', 'Extra_56.png', 'Extra_98.png',
    ];
    for (const f of need) expect(existsSync(vanillaFile(f)), `${f} 缺素材`).toBe(true);
  });

  it('Color.A 背景衰减审计：仅 387/414/437 非零显著，轨道族恒 A=0（源色 A 通道乘 0）', () => {
    // 541/568/569/661 轨道族源色 Color(127-α,…,0)·MultiplyRGBA(tint) → A 恒 0（:26087/
    // :26117/:26105 的 .A=0 或乘 0），661 拷贝显式 newColor6.A=0（:26106）→ 纯加色无削底
    for (const id of [541, 568, 569, 661]) {
      const c = Renderer.npcGlowConfig(id)!;
      expect(c.fadeA, `npc ${id} 轨道族不应有背景衰减`).toBeUndefined();
    }
    // 425 星芒 drawColor/shineColor 均 A=0（:25633）→ 表内无 fadeA
    expect(Renderer.npcGlowConfig(425)!.fadeA).toBeUndefined();
    // 显著 A 三分支：437 表常数 200；387/414 运行时（上方纯函数断言已覆盖数值）
    expect(Renderer.npcGlowConfig(437)!.fadeA).toBeCloseTo(200 / 255, 9);
  });
});
