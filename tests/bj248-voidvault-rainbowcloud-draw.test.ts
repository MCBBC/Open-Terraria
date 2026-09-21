// ★BJ248 清债双件绘制闸（2026-09-21）：tile 491 虚空宝库右半 + tile 719 彩虹云 14 相时-位钟。
//
// 原版锚（Terarria1457 亲读,1458 交叉同号）：
//   · 491：TileDrawing.cs:5405-5407 `case 491: tileTop=2; addFrX=54;`——【无条件】平赋值
//     （非 +=、无 %54 取模,与 733 条件型半 sheet 不同）→ 恒画右半。Tiles_491 原版
//     108×54=左右半各 3 列,右半才有内容（R2 实测半间差 3872 字节）。本仓曾整缺
//     +54 消费位=恒画左半错半。tileTop=2 已在 DRAW_Y_OFFSET（491:2）。
//   · 719：TileDrawing.cs:4608-4616 `num34=(x+y+(int)(GTW*15))%14; addFrX+=288*(num34/4);
//     addFrY+=270*(num34%4)`——14 相时-位钟。GTW=真实时间秒%3600（Main.cs:17014）→
//     15 相/秒=60fps 固定步每 4 tick 一相。(x+y) 逐格相位=原版【刻意】的对角彩虹
//     渐变——719=1×1 blend 云块（frameSize[[1,1]],与 189/196/460/717/718 云块族同款
//     TEdit 帧版式,sheet 1152×1080=64×60 格恰 4×4 相块,14 相块=同一版式的 14 个
//     彩虹相位,几何版式逐块全等→邻格跨相仍无缝）。本仓原注误把 719 划入
//     「Player.cs 手持物品 719 同号案」整删（28/105/470 删除正确,719 系误伤）——
//     R2 复核翻案恢复（TileDrawing 全文件唯一一处 GTW×15 块）。
//   · 719 不入 RATE/FRAMES/PITCH 三表（AnimateTiles 无 719 tileFrame 写位,golden
//     「无多」锁）→ 动态层走 isDynamicAnimSheet 719 特判（314 同款）;否则 chunk
//     烘焙相位定格=507/508 同族病。
//
// 变异证红映射：
//   M1  摘 case 491                      → T1/T4 红（回画左半）
//   M2  491 加 %54/条件化                → 合法域 {0,18,36} 上与原式恒等,域内不可判别（备案）
//   M3  摘 case 719                      → T3 红（相位偏移整缺=恒 0 相静止）
//   M4  719 步距 288/270 互换或钟 /4 改  → T3 红
//   M5  摘 isDynamicAnimSheet 719        → T5 红（退烘焙相位定格）
//   M6  719 复活进 RATE/FRAMES/PITCH     → T6 红（golden「无多」域破坏）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-ignore pngjs 无类型声明（同 tests/atlas-append-golden.test.ts 用法）
import { PNG } from 'pngjs';
import { drawVanillaCell, drawAdjust } from '../src/render/VanillaTiler';
import { isDynamicAnimSheet, TILE_ANIM_RATE, TILE_ANIM_FRAMES, TILE_ANIM_PITCH, tileAnim } from '../src/render/TileAnim';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { SpriteAtlas, DrawRect } from '../src/assets/SpriteAtlas';
import vanillaJson from '../public/sprites/vanilla.json';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = TILE_BY_KEY['v_491_void_vault']!;

/** 空表（drawAdjust 的 st 参数仅 593/594/529 等群系案消费;491/719 纯几何） */
const st = new TileStore(40, 80);

// ============================================================ 件 2：tile 491 恒右半（M1/M2）
describe('★BJ248 drawAdjust case 491：无条件 addFrX=54（TileDrawing.cs:5405-5407）', () => {
  it('T1 三列九格 sx=fx+54 恒右半（sy/尺寸不覆写）', () => {
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        const fx = dx * 18, fy = dy * 18;
        const a = drawAdjust(491, fx, fy, 20 + dx, 30 + dy, 108, 54, st, 40);
        expect(a.sx, `fx=${fx}`).toBe(fx + 54);
        expect(a.sy, `fy=${fy}`).toBeUndefined();          // sy 走通用帧（tileTop 已表载）
        expect(a.sw, 'sw 不覆写').toBeUndefined();
        expect(a.sh, 'sh 不覆写').toBeUndefined();
      }
    }
  });

  it('T4 端到端：3×3 虚空宝库 9 格源矩形全落右半（drawVanillaCell style 帧全链）', () => {
    // mock atlas：Tiles_491 真实几何（108×54,grid16 stride18 cols6 rows3,frameSize[[3,3]]）
    const fakeImg = { width: 108, height: 54 };
    const meta = { sheet: 'vanilla/Tiles_491.png', name: 'Void Vault', key: 'VoidVault',
      grid: [16, 16], stride: [18, 18], cols: 6, rows: 3 };
    const atlas = {
      vmeta: (s: number) => (s === 491 ? meta : null),
      ensureVImage: () => fakeImg as unknown as HTMLImageElement,
      vframeAt: (s: number, x: number, y: number): DrawRect | null => {
        if (s !== 491) return null;
        if (x < 0 || y < 0 || x + 16 > 108 || y + 16 > 54) return null;
        return { img: fakeImg as unknown as HTMLImageElement, sx: x, sy: y, sw: 16, sh: 16 };
      },
      vframe: (s: number): DrawRect | null => (s === 491 ? { img: fakeImg as unknown as HTMLImageElement, sx: 0, sy: 0, sw: 16, sh: 16 } : null),
      vImageFailed: () => false,
    } as unknown as SpriteAtlas;

    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        st.setTileSilent(10 + dx, 20 + dy, VAULT, dx * 18, dy * 18);
      }
    }
    const calls: Array<{ sx: number; sy: number }> = [];
    const ctx = {
      drawImage: (_img: unknown, sx: number, sy: number) => { calls.push({ sx, sy }); },
      save: () => {}, restore: () => {}, translate: () => {}, scale: () => {},
      imageSmoothingEnabled: false, globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        drawVanillaCell(ctx, atlas, 491, 'style', 3, 3, st, 10 + dx, 20 + dy, VAULT,
          () => false, (10 + dx) * 16, (20 + dy) * 16, st.frameX[st.idx(10 + dx, 20 + dy)],
          st.frameY[st.idx(10 + dx, 20 + dy)]);
      }
    }
    expect(calls).toHaveLength(9);
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        const c = calls[dx * 3 + dy];
        expect(c.sx, `[${dx},${dy}] sx`).toBe(dx * 18 + 54);   // ★恒右半（M1 摘支 → dx*18=左半红）
        expect(c.sy, `[${dx},${dy}] sy`).toBe(dy * 18);
      }
    }
  });
});

// ============================================================ 件 3：tile 719 十四相时-位钟（M3/M4）
describe('★BJ248 drawAdjust case 719：14 相时-位钟（TileDrawing.cs:4608-4616）', () => {
  it('T3 钟式钉值：n=(x+y+⌊tick/4⌋)%14 → sx=fx+288·⌊n/4⌋ / sy=fy+270·(n%4)', () => {
    const fx = 54, fy = 36;
    // tick=0：n=(3+5)%14=8 → ⌊8/4⌋=2、8%4=0
    tileAnim.tick = 0;
    expect(drawAdjust(719, fx, fy, 3, 5, 1152, 1080, st, 40)).toMatchObject({ sx: 54 + 576, sy: 36 });
    // tick=6：tIdx=⌊6/4⌋=1 → n=9 → ⌊9/4⌋=2、9%4=1
    tileAnim.tick = 6;
    expect(drawAdjust(719, fx, fy, 3, 5, 1152, 1080, st, 40)).toMatchObject({ sx: 54 + 576, sy: 36 + 270 });
    // n=13（顶相）：⌊13/4⌋=3 → sx+864;13%4=1 → sy+270——1134+18≤1152 / 1062+18≤1080 恰满
    tileAnim.tick = 0;
    expect(drawAdjust(719, 0, 0, 12, 1, 1152, 1080, st, 40)).toMatchObject({ sx: 864, sy: 270 });
    // 周期：tIdx 每 14 相回卷（tick 0 vs 56 同相）
    tileAnim.tick = 56;
    expect(drawAdjust(719, fx, fy, 3, 5, 1152, 1080, st, 40)).toMatchObject({ sx: 54 + 576, sy: 36 });
    tileAnim.tick = 0;
  });
});

// ============================================================ 动态层接线与三表禁域（M5/M6）
describe('★BJ248 719 动态层特判 + 三表「无多」域不破', () => {
  it('T5 isDynamicAnimSheet：719=true（进动态层防烘焙定格）;491=false（纯静态烘焙）', () => {
    expect(isDynamicAnimSheet(719)).toBe(true);
    expect(isDynamicAnimSheet(491)).toBe(false);
  });

  it('T6 三表禁域：RATE/FRAMES/PITCH 均无 719 键、RATE 无 491 键（AnimateTiles 无写位,golden「无多」锁）', () => {
    expect(TILE_ANIM_RATE[719]).toBeUndefined();
    expect(TILE_ANIM_FRAMES[719]).toBeUndefined();
    expect(TILE_ANIM_PITCH[719]).toBeUndefined();
    expect(TILE_ANIM_RATE[491]).toBeUndefined();    // TileAnim 头注 removed 锁「491 纯静态+addFrX 常量」
  });
});

// ============================================================ 数据面结构锁（图集容量）
describe('★BJ248 数据面：Tiles_491/Tiles_719 容量与源图字节锁定', () => {
  it('T7 vanilla.json 条目：491 cols6/rows3/frameSize[[3,3]];719 cols64/rows60/frameSize[[1,1]]', () => {
    const t = (vanillaJson as unknown as Record<string, Record<string, {
      rows: number; cols: number; grid: number[]; stride: number[]; frameSize: number[][];
    }>>).tiles;
    expect(t['491'].cols).toBe(6);            // 108px=左右半各 3 列
    expect(t['491'].rows).toBe(3);
    expect(t['491'].frameSize).toEqual([[3, 3]]);
    expect(t['719'].cols).toBe(64);           // 1152px=4 相块×16 列
    expect(t['719'].rows).toBe(60);           // 1080px=4 相块×15 行
    expect(t['719'].frameSize).toEqual([[1, 1]]);
  });

  it('T8 盘上 PNG 与原版提取源逐字节一致 + 尺寸（108×54 / 1152×1080,atlas 无罪钉值）', () => {
    for (const [id, w, h] of [['491', 108, 54], ['719', 1152, 1080]] as const) {
      const repo = readFileSync(join(ROOT, `public/sprites/vanilla/Tiles_${id}.png`));
      const src = readFileSync(join(ROOT, `../terraria-assets/Images/Tiles_${id}.png`));
      expect(createHash('md5').update(repo).digest('hex'))
        .toBe(createHash('md5').update(src).digest('hex'));
      const png = PNG.sync.read(repo);
      expect(png.width, `Tiles_${id} 宽`).toBe(w);
      expect(png.height, `Tiles_${id} 高`).toBe(h);
    }
  });
});
