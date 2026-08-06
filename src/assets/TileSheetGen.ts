// tile 贴图程序化生成。
// blend 类 tile：256 帧 sheet（16×16 网格），mask: bit0=N 1=E 2=S 3=W 4=NE 5=SE 6=SW 7=NW。
// framed 单格（火把/树/装饰）：按帧动画/变体排布。
// object 类（工作台/熔炉/铁砧/宝箱/门）：整体 sprite，锚点绘制。
import { TILE_DEFS, T } from '../data/tiles';
import { MATS, Mat, shade, mix } from './Palette';
import { RNG, hash2 } from '../core/rng';

const TS = 16;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

/** 逐像素画布帮助器 */
class Px {
  img: ImageData;
  constructor(public ctx: CanvasRenderingContext2D, public w: number, public h: number, public ox = 0, public oy = 0) {
    this.img = ctx.createImageData(w, h);
  }
  set(x: number, y: number, color: string) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const v = parseInt(color.slice(1), 16);
    const i = (y * this.w + x) * 4;
    this.img.data[i] = (v >> 16) & 255;
    this.img.data[i + 1] = (v >> 8) & 255;
    this.img.data[i + 2] = v & 255;
    this.img.data[i + 3] = 255;
  }
  flush() {
    this.ctx.putImageData(this.img, this.ox, this.oy);
  }
}

/** 材质噪声底纹 */
function fillNoise(px: Px, m: Mat, seed: number, roughness = 0.06) {
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      const n = hash2(x + seed * 131, y + seed * 77, seed);
      const f = 1 + (n - 0.5) * roughness * 2;
      px.set(x, y, shade(m.base, f));
    }
  }
}

/** 256 掩码 blend sheet。mask 位见文件头。 */
function genBlendSheet(m: Mat, seed: number, opts?: { topLight?: string }): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(TS * 16, TS * 16);
  for (let mask = 0; mask < 256; mask++) {
    const col = mask & 15, row = mask >> 4;
    const cx = col * TS, cy = row * TS;
    const px = new Px(ctx, TS, TS, cx, cy);
    fillNoise(px, m, seed + mask * 0.37);
    const n = !!(mask & 1), e = !!(mask & 2), s = !!(mask & 4), w = !!(mask & 8);
    const ne = !!(mask & 16), se = !!(mask & 32), sw = !!(mask & 64), nw = !!(mask & 128);
    // 暴露边描边：上/左亮、下/右暗
    if (n) for (let x = 0; x < TS; x++) px.set(x, 0, m.light2);
    if (w) for (let y = 0; y < TS; y++) px.set(0, y, m.light);
    if (s) for (let x = 0; x < TS; x++) px.set(x, TS - 1, m.dark);
    if (e) for (let y = 0; y < TS; y++) px.set(TS - 1, y, m.dark);
    // 角落处理：双邻暴露 → 圆角切角；斜邻相连 → 补角
    const corner = (exposed: boolean, diag: boolean, xs: number, xe: number, ys: number, ye: number) => {
      if (!exposed && !diag) return;
      if (exposed && diag) { px.set(xs, ys, m.base); return; }
      if (exposed) { px.set(xs, ys, mix(m.base, '#000000', 0.35)); }
      if (!exposed && diag) { px.set(xs, ys, m.base); }
    };
    corner(n && e, ne, TS - 1, 0, 0, 0);
    corner(s && e, se, TS - 1, 0, TS - 1, 0);
    corner(s && w, sw, 0, 0, TS - 1, 0);
    corner(n && w, nw, 0, 0, 0, 0);
    // 暴露角圆化：把最角落的像素与相邻边融合
    if (n && !e && !ne) px.set(TS - 1, 0, shade(m.base, 1.1));
    if (n && !w && !nw) px.set(0, 0, shade(m.base, 1.1));
    px.flush();
  }
  return canvas;
}

/** 矿石 tile：石底 + 矿物斑点簇 */
function genOreTile(metal: Mat, seed: number): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(TS, TS);
  const px = new Px(ctx, TS, TS);
  fillNoise(px, MATS.stone, seed);
  const rng = new RNG(seed);
  const blobs = 3 + rng.int(0, 2);
  for (let b = 0; b < blobs; b++) {
    const bx = rng.int(2, TS - 4), by = rng.int(2, TS - 4);
    const size = rng.int(1, 2);
    for (let dx = -size; dx <= size; dx++) {
      for (let dy = -size; dy <= size; dy++) {
        if (Math.abs(dx) + Math.abs(dy) > size + (b % 2)) continue;
        const c = dx === 0 && dy === -size ? metal.light2 : (Math.abs(dx) + Math.abs(dy) <= 1 ? metal.light : metal.base);
        px.set(bx + dx, by + dy, c);
      }
    }
  }
  px.flush();
  return canvas;
}

// ---- framed 单格 / object 绘制 ----

function genTorch(seed: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TS, TS);
  const px = new Px(ctx, TS, TS);
  // 木柄
  for (let y = 6; y <= 14; y++) {
    px.set(7, y, y === 6 ? MATS.wood.light : MATS.wood.base);
    px.set(8, y, y === 14 ? MATS.wood.dark : MATS.wood.base);
  }
  // 火焰（静态帧；动画由渲染时叠加闪烁）
  const f = MATS.fire;
  px.set(7, 3, f.light2); px.set(8, 3, f.light2);
  px.set(6, 4, f.light); px.set(7, 4, f.base); px.set(8, 4, f.base); px.set(9, 4, f.light);
  px.set(7, 5, f.dark); px.set(8, 5, f.dark);
  px.flush();
  return c;
}

function genWorkbench(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(32, TS);
  const px = new Px(ctx, 32, TS);
  const m = MATS.wood;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 32; x++) {
      let col = m.base;
      if (y < 6) col = (x % 8 < 1) ? m.dark : m.light;          // 桌面横纹
      else if (x % 10 < 2 || x > 29) col = m.dark;               // 桌腿
      if (y === 5) col = m.dark;
      if (y === 0) col = m.light2;
      px.set(x, y, col);
    }
  }
  px.flush();
  return c;
}

function genFurnace(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(48, 32);
  const px = new Px(ctx, 48, 32);
  const st = MATS.stone, fire = MATS.fire, met = MATS.metal;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 48; x++) {
      const n = hash2(x, y, 99);
      let col = shade(st.base, 0.85 + n * 0.3);
      if (y < 2 || x < 2) col = st.light;
      if (y > 29 || x > 45) col = st.dark;
      // 炉口
      const inMouth = x >= 16 && x <= 31 && y >= 16 && y <= 27;
      if (inMouth) {
        const fy = (y - 16) / 12;
        col = mix(fire.dark, fire.light2, 1 - fy) ;
        if (y === 28) col = met.dark;
      }
      // 烟囱口
      if (x >= 20 && x <= 27 && y >= 2 && y <= 8) col = mix('#202020', '#404040', n);
      px.set(x, y, col);
    }
  }
  px.flush();
  return c;
}

function genAnvil(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(32, TS);
  const px = new Px(ctx, 32, TS);
  const m = MATS.metal;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 32; x++) {
      let col: string | null = m.base;
      if (y < 4) col = (x < 3 || x > 28) ? null! : m.light2;   // 铁砧面
      if (y >= 4 && y < 6) col = x > 6 && x < 26 ? m.dark : null!;
      if (y >= 6 && y < 10) col = x > 12 && x < 20 ? m.dark : null!;
      if (y >= 10 && y < 12) col = x > 6 && x < 26 ? m.base : null!;
      if (y >= 12) col = x > 10 && x < 22 ? m.dark : null!;
      if (col) px.set(x, y, col);
    }
  }
  px.flush();
  return c;
}

function genChest(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(32, 32);
  const px = new Px(ctx, 32, 32);
  const wd = MATS.woodDark, gd = MATS.gold;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const n = hash2(x, y, 7);
      let col: string | null = shade(wd.base, 0.9 + n * 0.2);
      if (y < 3) col = null;                          // 顶部空缺圆弧
      if (y >= 3 && y < 13) col = shade(wd.light, 0.95 + n * 0.1); // 盖
      if (y === 13 || y === 14) col = '#5A4520';      // 盖缝
      // 金属包边与锁
      if (x < 2 || x > 29) col = gd.dark;
      if (y > 29) col = gd.dark;
      if (x >= 13 && x <= 18 && y >= 12 && y <= 19) col = (x === 13 || x === 18 || y === 19) ? gd.dark : gd.light;
      if (col) {
        px.set(x, y, col);
      } else { // 透明
        const i = (y * 32 + x) * 4;
        px.img.data[i + 3] = 0;
      }
    }
  }
  px.flush();
  return c;
}

function genDoor(open: boolean): HTMLCanvasElement {
  const wpx = open ? 32 : 16;
  const [c, ctx] = makeCanvas(wpx, 48);
  const px = new Px(ctx, wpx, 48);
  const m = MATS.wood;
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < wpx; x++) {
      const n = hash2(x, y, 31);
      let col = shade(m.base, 0.95 + n * 0.12);
      if (open) {
        // 开门：贴在门框侧，半宽门板
        if (x > 13 && y > 1 && y < 46) col = shade(m.dark, 0.95 + n * 0.12);
        else continue;
      } else {
        if (x === 0 || x === 15 || y === 0 || y === 47) col = m.dark;
        if ((x === 7 || x === 8) && y > 20 && y < 28) col = MATS.gold.light; // 把手
        if (y % 12 === 0 && y > 0 && y < 47) col = m.dark;                    // 门板横档
      }
      px.set(x, y, col);
    }
  }
  px.flush();
  return c;
}

function genTreePieces(): HTMLCanvasElement {
  // 竖排两帧：0=树干中段，1=树顶段（带枝杈）
  // 关键：竖向连续木纹（横向无重复接缝），消除"梯子感"
  const [c, ctx] = makeCanvas(TS, TS * 2);
  const px = new Px(ctx, TS, TS * 2);
  const bark = MATS.woodDark;
  // 竖向纹线位置（两条帧共用，保证上下连续）
  const grain = [1, 4, 7, 10, 13];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 16; x++) {
      const n = hash2(x, 0, 55);            // 只依赖 x：每行一致 → 竖向连续
      let col = shade(bark.base, 0.9 + n * 0.2);
      // 树皮边缘加深
      if (x <= 1 || x >= 14) col = shade(bark.dark, 0.9 + n * 0.15);
      // 竖向木纹沟壑
      if (grain.includes(x)) col = shade(bark.dark, 0.8 + hash2(x, 3, 7) * 0.2);
      if (grain.includes(x) && y % 8 === 5) col = bark.base; // 沟壑断点
      // 节疤
      if (x >= 6 && x <= 9 && y >= 12 && y <= 15 && y < 16) col = bark.dark;
      px.set(x, y, col);
    }
  }
  // 顶段：两侧短枝
  for (let i = 0; i < 4; i++) {
    px.set(2 - i, 19 + (i % 2), shade(bark.dark, 0.95));
    px.set(13 + i, 20 + (i % 2), shade(bark.dark, 0.95));
  }
  px.flush();
  return c;
}

function genLeaves(seed: number): HTMLCanvasElement {
  // 3 变体横排
  const [c, ctx] = makeCanvas(TS * 3, TS);
  for (let v = 0; v < 3; v++) {
    const px = new Px(ctx, TS, TS, v * TS, 0);
    const m = MATS.leaves;
    const rng = new RNG(seed + v * 17);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (rng.chance(0.14)) continue; // 碎叶镂空
        const edge = x < 2 || x > 13 || y < 2 || y > 13;
        const col = edge ? m.dark : (rng.chance(0.25) ? m.light : m.base);
        px.set(x, y, col);
      }
    }
    px.flush();
  }
  return c;
}

function genDecor(seed: number, kind: 'tallgrass' | 'flower' | 'mushroom'): HTMLCanvasElement {
  const variants = 3;
  const [c, ctx] = makeCanvas(TS * variants, TS);
  for (let v = 0; v < variants; v++) {
    const px = new Px(ctx, TS, TS, v * TS, 0);
    const rng = new RNG(seed + v * 23);
    if (kind === 'tallgrass') {
      const blades = 4 + rng.int(0, 2);
      for (let b = 0; b < blades; b++) {
        let bx = rng.int(2, 13);
        const h = rng.int(5, 11);
        const lean = rng.int(-1, 1);
        for (let i = 0; i < h; i++) {
          px.set(bx, 15 - i, i > h - 3 ? MATS.grass.light : MATS.grass.base);
          bx += i % 3 === 0 ? lean : 0;
        }
      }
    } else if (kind === 'flower') {
      let bx = rng.int(4, 11);
      const h = rng.int(6, 9);
      for (let i = 0; i < h; i++) px.set(bx, 15 - i, MATS.grassDark.base);
      const petal = rng.pick(['#D0699E', '#E8C34A', '#E8E8E8', '#C36927']);
      px.set(bx, 15 - h, petal);
      px.set(bx - 1, 15 - h + 1, petal);
      px.set(bx + 1, 15 - h + 1, petal);
      px.set(bx, 15 - h + 1, shade(petal, 0.7));
    } else {
      // 蘑菇
      const cx = 8, capY = 9;
      for (let x = cx - 2; x <= cx + 2; x++) px.set(x, capY + 1, '#E8DFC8');
      px.set(cx, capY + 2, '#D8CFB8'); px.set(cx, capY + 3, '#D8CFB8');
      for (let x = cx - 5; x <= cx + 5; x++) {
        const dy = Math.abs(x - cx);
        if (dy <= 4) px.set(x, capY, dy < 2 ? MATS.copper.light : MATS.copper.base);
        if (dy <= 3) px.set(x, capY - 1, dy < 1 ? MATS.copper.base : MATS.copper.dark);
      }
      px.set(cx - 2, capY - 1, '#F0E8D8'); px.set(cx + 3, capY, '#F0E8D8');
    }
    px.flush();
  }
  return c;
}

// ---- 汇总 ----
export interface TileSheetEntry {
  canvas: HTMLCanvasElement;
  kind: 'blend' | 'single' | 'object';
  w?: number; h?: number; // object 占格数
}

export function generateAllTileSheets(): Map<number, TileSheetEntry> {
  const map = new Map<number, TileSheetEntry>();
  const add = (id: number, e: TileSheetEntry) => map.set(id, e);
  add(T.DIRT, { canvas: genBlendSheet(MATS.dirt, 1), kind: 'blend' });
  add(T.STONE, { canvas: genBlendSheet(MATS.stone, 2), kind: 'blend' });
  add(T.GRASS, { canvas: genGrassSheet(), kind: 'blend' });
  add(T.SAND, { canvas: genBlendSheet(MATS.sand, 5), kind: 'blend' });
  add(T.SNOW, { canvas: genBlendSheet(MATS.snow, 6), kind: 'blend' });
  add(T.WOOD, { canvas: genBlendSheet(MATS.wood, 3), kind: 'blend' });
  add(T.ORE_COPPER, { canvas: genOreTile(MATS.copper, 11), kind: 'single' });
  add(T.ORE_IRON, { canvas: genOreTile(MATS.iron, 12), kind: 'single' });
  add(T.ORE_SILVER, { canvas: genOreTile(MATS.silver, 13), kind: 'single' });
  add(T.ORE_GOLD, { canvas: genOreTile(MATS.gold, 14), kind: 'single' });
  add(T.PLATFORM, { canvas: genPlatform(), kind: 'single' });
  add(T.TORCH, { canvas: genTorch(1), kind: 'single' });
  add(T.TREE, { canvas: genTreePieces(), kind: 'single' });
  add(T.LEAVES, { canvas: genLeaves(21), kind: 'single' });
  add(T.TALLGRASS, { canvas: genDecor(31, 'tallgrass'), kind: 'single' });
  add(T.FLOWER, { canvas: genDecor(32, 'flower'), kind: 'single' });
  add(T.MUSHROOM, { canvas: genDecor(33, 'mushroom'), kind: 'single' });
  add(T.WORKBENCH, { canvas: genWorkbench(), kind: 'object', w: 2, h: 1 });
  add(T.FURNACE, { canvas: genFurnace(), kind: 'object', w: 3, h: 2 });
  add(T.ANVIL, { canvas: genAnvil(), kind: 'object', w: 2, h: 1 });
  add(T.CHEST, { canvas: genChest(), kind: 'object', w: 2, h: 2 });
  add(T.DOOR_CLOSED, { canvas: genDoor(false), kind: 'object', w: 1, h: 3 });
  add(T.DOOR_OPEN, { canvas: genDoor(true), kind: 'object', w: 2, h: 3 });
  return map;
}

/** 草块：土身 + 顶部草皮（N 邻不接同类时显示草皮） */
function genGrassSheet(): HTMLCanvasElement {
  const grass = MATS.grass, dirt = MATS.dirt;
  const [canvas, ctx] = makeCanvas(TS * 16, TS * 16);
  for (let mask = 0; mask < 256; mask++) {
    const col = mask & 15, row = mask >> 4;
    const px = new Px(ctx, TS, TS, col * TS, row * TS);
    fillNoise(px, dirt, 44);
    const n = !!(mask & 1);
    if (!n) {
      // 草皮层 0-4px，锯齿
      const rng = new RNG(400 + mask);
      for (let x = 0; x < TS; x++) {
        const gh = 3 + Math.floor(hash2(x, mask, 9) * 2) + (rng.chance(0.2) ? 1 : 0);
        for (let y = 0; y < gh; y++) {
          px.set(x, y, y < 2 ? grass.light : grass.base);
        }
        px.set(x, gh, mix(grass.dark, dirt.base, 0.5));
      }
    }
    const e = !!(mask & 2), s = !!(mask & 4), w = !!(mask & 8);
    if (s) for (let x = 0; x < TS; x++) px.set(x, TS - 1, dirt.dark);
    if (e) for (let y = 0; y < TS; y++) px.set(TS - 1, y, dirt.dark);
    if (w) for (let y = 0; y < TS; y++) px.set(0, y, dirt.light);
    if (!n) { if (w) for (let y = 0; y < 4; y++) px.set(0, y, grass.dark); if (e) for (let y = 0; y < 4; y++) px.set(TS - 1, y, grass.dark); }
    px.flush();
  }
  return canvas;
}

function genPlatform(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TS, TS);
  const px = new Px(ctx, TS, TS);
  const m = MATS.wood;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 16; x++) {
      let col = y === 0 ? m.light2 : y < 3 ? m.light : m.base;
      if (y === 7) col = m.dark;
      if (x === 0 || x === 15) col = m.dark;
      if (y > 3 && (x === 3 || x === 12)) col = m.dark; // 支架
      px.set(x, y, col);
    }
  }
  px.flush();
  return c;
}
