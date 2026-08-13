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
