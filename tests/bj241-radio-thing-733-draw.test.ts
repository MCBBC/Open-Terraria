// ★BJ241 tile 733 Radio Thing（收音机）绘制回归——用户实报「右键点击时贴图错误」定谳收口。
//
// 原版锚（Terarria1457）：
//   · 数据面：Tiles_733.png 原版即 108×54 仅 3 行（terraria-assets/Images/Tiles_733.png
//     亲证 108×54，本仓提取 1:1 无罪）——开/关不是上下行而是【左右半 sheet】：
//     左半 x0..53=开态亮屏 / 右半 x54..107=关态暗屏（PNG 两半亮度对比亲证）。
//   · 世界态：右键 Player.cs:31801-31808（733 在 monolith 列表）→ WorldGen.SwitchMonolith
//     （:51023-51169，733 区块宽 3 :51026-51028）case 733 frameY ±54（:51152-51159）——
//     off 行带 0/18/36 ↔ on 行带 54/72/90，frameY 仅开关标记；Wiring.cs:2033 电路同口。
//   · 绘制面：TileDrawing.cs GetTileDrawData case 733（:6081-6088）verbatim：
//     tileTop=2；tileFrameY<54（关）→ addFrX+=54（右半暗屏）；tileFrameX%=54、
//     tileFrameY%=54（折回 0..36 行带）。SceneMetrics.cs:575-580 fy≥54 → 滤镜激活。
// 本仓双刀：VanillaTiler drawAdjust case 733（绘制权威）+ 重建支折半（杀 recon
// 回退噪声，仿 93/139 折列先例）；右键/电路链 devices.ts switchMonolith 已 1:1
// （tests/monolith.test.ts 锁 3×3±54）。
//
// 旧缺陷：drawAdjust/重建支均无 733 特支 → off 态恒画左半=亮屏相（静默半错）；
// 右键后 fy=54 直接采样 54 高 sheet → vframeAt OOB → 链回退 (0,0)「整物第一格
// 平铺」= 用户所见错误贴图（debug-report tileFrames.anoms kind:"fallback"
// sheet:733 fx0/18/36 fy54 imgh54 imgW108 OOB! ×3 格）。
//
// 变异证红映射：
//   M1  摘 drawAdjust case 733             → T1/T2/T4 红（off 画左半/on 平铺 (0,0)）
//   M2  摘重建支折半                       → T3 红（vframeAt 收到裸 sy=54 → 表 OOB）
//   M3  折半方向反（fy≥54 才 +54）          → T1/T2/T4 红（左右半互换）
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-ignore pngjs 无类型声明（同 tests/atlas-append-golden.test.ts 用法）
import { PNG } from 'pngjs';
import { drawVanillaCell, drawAdjust, tileTopOf } from '../src/render/VanillaTiler';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import { Wiring } from '../src/world/Wiring';
import { switchMonolith } from '../src/world/wiring/devices';
import type { SpriteAtlas, DrawRect } from '../src/assets/SpriteAtlas';
import vanillaJson from '../public/sprites/vanilla.json';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457', 'terraria-assets'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RADIO = TILE_BY_KEY['v_733_radio_thing']!;

/** recording ctx：只记录 drawImage 的源矩形（sx,sy）与目标位 */
function recCtx() {
  const calls: Array<{ sx: number; sy: number; dx: number; dy: number; sw: number; sh: number }> = [];
  return {
    calls,
    ctx: {
      drawImage: (_img: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number) => {
        calls.push({ sx, sy, dx, dy, sw, sh });
      },
      save: () => {}, restore: () => {}, translate: () => {}, scale: () => {},
      imageSmoothingEnabled: false, globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D,
  };
}

/** mock atlas：Tiles_733 真实几何（108×54，grid16 stride18 cols6 rows3）。
 *  vframeAt 逐字节复刻真表 OOB 语义（SpriteAtlas.ts:300 同式）并记录调用——
 *  T3 用调用记录锁重建支折半（M2：摘折半 → on 态收到裸 sy=54 → 返回 null=回退）。 */
function mockAtlas733() {
  const fakeImg = { width: 108, height: 54 };
  const meta = { sheet: 'vanilla/Tiles_733.png', name: 'Radio Thing', key: 'RadioThingMonolith', grid: [16, 16], stride: [18, 18], cols: 6, rows: 3 };
  const vfaCalls: Array<[number, number]> = [];
  const atlas = {
    vmeta: (s: number) => (s === 733 ? meta : null),
    ensureVImage: () => fakeImg as unknown as HTMLImageElement,
    vframeAt: (s: number, x: number, y: number): DrawRect | null => {
      if (s !== 733) return null;
      vfaCalls.push([x, y]);
      if (x < 0 || y < 0 || x + 16 > 108 || y + 16 > 54) return null;
      return { img: fakeImg as unknown as HTMLImageElement, sx: x, sy: y, sw: 16, sh: 16 };
    },
    vframe: (s: number, _c: number, _r: number): DrawRect | null => (s === 733 ? { img: fakeImg as unknown as HTMLImageElement, sx: 0, sy: 0, sw: 16, sh: 16 } : null),
    vImageFailed: () => false,
  } as unknown as SpriteAtlas;
  return { atlas, vfaCalls };
}

/** 放一台 3×3 收音机：state off = frameY 行带 0/18/36；on = +54（SwitchMonolith 后形态） */
function placeRadio(st: TileStore, x0: number, y0: number, on: boolean): void {
  for (let dx = 0; dx < 3; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      st.setTileSilent(x0 + dx, y0 + dy, RADIO, dx * 18, (on ? 54 : 0) + dy * 18);
    }
  }
}

/** 逐格过 drawVanillaCell（Renderer.ts:5440 同参形态：frame='style' fw=fh=3） */
function drawAll(st: TileStore, atlas: SpriteAtlas, ctx: CanvasRenderingContext2D, x0: number, y0: number): void {
  for (let dx = 0; dx < 3; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      const i = st.idx(x0 + dx, y0 + dy);
      drawVanillaCell(ctx, atlas, 733, 'style', 3, 3, st, x0 + dx, y0 + dy, st.type[i],
        () => false, (x0 + dx) * 16, (y0 + dy) * 16, st.frameX[i], st.frameY[i]);
    }
  }
}

// ============================================================ 绘制权威面（M1/M3）
describe.skipIf(EXT_MISSING)('★BJ241 drawAdjust case 733：左右半 sheet 切换（TileDrawing.cs:6081-6088）', () => {
  const st = new TileStore(40, 80);

  it('T1 off 态（frameY<54）→ addFrX+=54 取右半暗屏：sx∈{54,72,90}/sy 折回行带', () => {
    expect(drawAdjust(733, 0, 0, 1, 1, 108, 54, st, 40)).toMatchObject({ sx: 54, sy: 0 });
    expect(drawAdjust(733, 18, 18, 1, 1, 108, 54, st, 40)).toMatchObject({ sx: 72, sy: 18 });
    expect(drawAdjust(733, 36, 36, 1, 1, 108, 54, st, 40)).toMatchObject({ sx: 90, sy: 36 });
  });

  it('T2 on 态（frameY≥54）→ 左半亮屏：sx 原列/sy−54；恒不越 54px 表', () => {
    expect(drawAdjust(733, 0, 54, 1, 1, 108, 54, st, 40)).toMatchObject({ sx: 0, sy: 0 });
    expect(drawAdjust(733, 18, 72, 1, 1, 108, 54, st, 40)).toMatchObject({ sx: 18, sy: 18 });
    expect(drawAdjust(733, 36, 90, 1, 1, 108, 54, st, 40)).toMatchObject({ sx: 36, sy: 36 });
  });

  it('T4 端到端：off/on 两态 9 格源矩形（drawVanillaCell style 帧全链）', () => {
    // off：每格 (fx+54, fy) —— 摘 M1 后画 (fx, fy)=左半亮屏相；摘 M3 后左右互换
    placeRadio(st, 10, 20, false);
    const off = recCtx();
    drawAll(st, mockAtlas733().atlas, off.ctx, 10, 20);
    expect(off.calls).toHaveLength(9);
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        const c = off.calls[dx * 3 + dy];
        expect(c.sx).toBe(dx * 18 + 54);
        expect(c.sy).toBe(dy * 18);
      }
    }
    // on：每格 (fx, fy−54) —— 旧缺陷下 vframeAt(…,54) OOB → 回退 (0,0) 平铺
    placeRadio(st, 10, 20, true);
    const on = recCtx();
    const { atlas, vfaCalls } = mockAtlas733();
    drawAll(st, atlas, on.ctx, 10, 20);
    expect(on.calls).toHaveLength(9);
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        const c = on.calls[dx * 3 + dy];
        expect(c.sx).toBe(dx * 18);
        expect(c.sy).toBe(dy * 18);
      }
    }
    // M2：重建支折半必须在 vframeAt 之前——on 态裸 fy∈{54,72,90} 直喂即 OOB 回退
    for (const [x, y] of vfaCalls) expect(y).toBeLessThan(54);
    expect(vfaCalls).toHaveLength(9);
  });
});

// ============================================================ 右键合成面（用户实报场景）
describe.skipIf(EXT_MISSING)('★BJ241 右键→翻态→绘制（SwitchMonolith ±54 + 左右半映射复合）', () => {
  it('T5 place off → switchMonolith → 绘制为左半亮屏（旧缺陷此场景平铺 (0,0)）', () => {
    const world = new World(60, 60, 7, 'open');
    const w = new Wiring(world.store);
    placeRadio(w.st, 20, 20, false);
    // off 态先画一遍：右半暗屏
    const pre = recCtx();
    drawAll(w.st, mockAtlas733().atlas, pre.ctx, 20, 20);
    expect(pre.calls[0].sx).toBe(54);
    // 右键翻态（devices.ts switchMonolith 733 宽 3 ±54——行为面 tests/monolith.test.ts 已锁）
    switchMonolith(w, 21, 21);
    for (let dy = 0; dy < 3; dy++) {
      expect(w.st.frameY[w.st.idx(20, 20 + dy)]).toBe(54 + dy * 18);
    }
    const post = recCtx();
    drawAll(w.st, mockAtlas733().atlas, post.ctx, 20, 20);
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        const c = post.calls[dx * 3 + dy];
        expect(c.sx).toBe(dx * 18);          // 左半
        expect(c.sy).toBe(dy * 18);          // 行带折回
        expect(c.sx).toBeLessThan(54);       // 恒不越右半界
      }
    }
  });
});

// ============================================================ 数据面结构锁（防表漂移/误补行）
describe.skipIf(EXT_MISSING)('★BJ241 数据面：Tiles_733 容量与源图字节锁定', () => {
  it('T6 vanilla.json 733 条目 rows=3/cols=6/grid16/stride18/frameSize[3,3]', () => {
    const t = (vanillaJson as unknown as Record<string, Record<string, {
      rows: number; cols: number; grid: number[]; stride: number[]; frameSize: number[][];
    }>>).tiles['733'];
    expect(t.rows).toBe(3);            // 原版即 3 行（54px）——开关走左右半,行容量恒 3
    expect(t.cols).toBe(6);            // 108px=6 列（左右半各 3 列）
    expect(t.grid).toEqual([16, 16]);
    expect(t.stride).toEqual([18, 18]);
    expect(t.frameSize).toEqual([[3, 3]]);
  });

  it('T7 盘上 PNG 与原版提取源逐字节一致 + 尺寸 108×54（atlas 无罪钉值）', () => {
    const repo = readFileSync(join(ROOT, 'public/sprites/vanilla/Tiles_733.png'));
    const src = readFileSync(join(ROOT, '..', 'terraria-assets/Images/Tiles_733.png'));
    expect(createHash('md5').update(repo).digest('hex'))
      .toBe(createHash('md5').update(src).digest('hex'));
    const png = PNG.sync.read(repo);
    expect(png.width).toBe(108);
    expect(png.height).toBe(54);       // 若未来有人误「补第 4 行」→ 此处爆红重审
  });

  it('T8 tileTop=2 双态恒定（monolith 族 :6083;DRAW_Y_OFFSET 静态表）', () => {
    expect(tileTopOf(733, 0, 0)).toBe(2);
    expect(tileTopOf(733, 0, 54)).toBe(2);
    expect(tileTopOf(733, 36, 90)).toBe(2);
  });
});
