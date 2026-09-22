// 物品图标程序化生成（16×16）
import { ITEM_DEFS, ITEM_BY_KEY } from '../data/items';
import { MATS, shade } from './Palette';
import { T, TILE_BY_KEY } from '../data/tiles';
import { RNG, hash2 } from '../core/rng';

function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  // ★willReadFrequently(#三开压测批 P0):图标画布生成后【只读】——消费=UI 的
  // toDataURL(UI.ts:239)与三处世界绘制(掉落物/手持/挥动,静态源按 generation
  // 缓存 GPU 副本,首用一次上传)。SHM 后备让 ~6059 张小画布不进 IOSurface 池
  // (macOS surface 数上限敏感);toDataURL/getImageData 还免 GPU 回读。
  // 注意:此 flag 只适用于"生成后只读"源——每帧采样的 tileSheets/角色表勿加
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  return [c, ctx];
}

/** 纯像素缓冲(worker 化 #perf-gpulog):生成期零 canvas/零 surface,
 *  putImageData 由调用方一次性落盘 */
export interface Px16 { data: Uint8ClampedArray }
function px16(): Px16 { return { data: new Uint8ClampedArray(16 * 16 * 4) }; }

function tileThumb(tileKey: string): Px16 {
  // 从 tile sheet 提取一个 16×16 缩样（用 mask=0 全边框帧）
  const px = px16();
  // 直接画简化方块
  const m = matForTile(tileKey);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = hash2(x, y, TILE_BY_KEY[tileKey] ?? 3);
      let f = 0.92 + n * 0.16;
      if (y === 0 || x === 0) f *= 1.18;
      if (y === 15 || x === 15) f *= 0.82;
      const v = parseInt(shade(m.base, f).slice(1), 16);
      const i = (y * 16 + x) * 4;
      px.data[i] = (v >> 16) & 255; px.data[i + 1] = (v >> 8) & 255; px.data[i + 2] = v & 255; px.data[i + 3] = 255;
    }
  }
  return px;
}

function matForTile(tileKey: string) {
  switch (tileKey) {
    case 'dirt': return MATS.dirt;
    case 'stone': return MATS.stone;
    case 'sand': return MATS.sand;
    case 'snow': return MATS.snow;
    case 'wood': return MATS.wood;
    case 'platform': return MATS.wood;
    default: return MATS.wood;
  }
}

function drawTool(kind: 'pick' | 'axe' | 'sword' | 'hammer', metal: Mat): Px16 {
  const px = px16();
  const set = (x: number, y: number, col: string) => {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    const v = parseInt(col.slice(1), 16);
    const i = (y * 16 + x) * 4;
    px.data[i] = (v >> 16) & 255; px.data[i + 1] = (v >> 8) & 255; px.data[i + 2] = v & 255; px.data[i + 3] = 255;
  };
  // 柄：左下到右上
  for (let i = 0; i < 10; i++) {
    const x = 3 + i, y = 13 - i;
    set(x, y, i % 3 === 0 ? MATS.woodDark.dark : MATS.wood.base);
    set(x + 1, y, MATS.woodDark.dark);
  }
  if (kind === 'pick') {
    // 镐头：弧形横跨右上
    const head = [[6, 2], [7, 1], [8, 1], [9, 1], [10, 1], [11, 2], [12, 3], [13, 4], [5, 3], [4, 4], [3, 5]];
    for (const [x, y] of head) {
      set(x, y, metal.light);
      set(x, y + 1, metal.base);
    }
    set(8, 2, metal.light2);
  } else if (kind === 'axe') {
    // 斧刃：右上三角
    for (let y = 1; y <= 6; y++) {
      for (let x = 9; x <= 14; x++) {
        if (x - 9 + (6 - y) < 5 && x + y > 12) set(x, y, (x === 9 || y === 6) ? metal.dark : metal.base);
      }
    }
    set(12, 1, metal.light); set(13, 2, metal.light);
  } else if (kind === 'hammer') {
    // 锤：方形锤头
    for (let y = 1; y <= 6; y++) {
      for (let x = 8; x <= 14; x++) {
        if (x === 8 || y === 1 || y === 6) set(x, y, metal.dark);
        else set(x, y, (x + y) % 3 === 0 ? metal.light : metal.base);
      }
    }
    set(11, 3, metal.light2);
  } else {
    // 剑：菱形刃
    for (let i = 0; i < 9; i++) {
      const wdt = i < 2 ? 1 : (i < 6 ? 2 : 1);
      const cx = 11, y = 1 + i;
      for (let dx = -wdt; dx <= wdt; dx++) {
        set(cx + dx, y, dx === 0 ? metal.light2 : (dx < 0 ? metal.light : metal.base));
      }
    }
    // 护手与柄
    for (let x = 7; x <= 15; x++) set(x, 10, x === 11 ? metal.light : metal.dark);
    set(10, 11, MATS.woodDark.base); set(10, 12, MATS.woodDark.dark);
  }
  return px;
}

function drawBar(metal: Mat): Px16 {
  const px = px16();
  const set = (x: number, y: number, col: string) => {
    const v = parseInt(col.slice(1), 16);
    const i = (y * 16 + x) * 4;
    px.data[i] = (v >> 16) & 255; px.data[i + 1] = (v >> 8) & 255; px.data[i + 2] = v & 255; px.data[i + 3] = 255;
  };
  // 梯形锭
  for (let y = 6; y <= 11; y++) {
    const inset = y < 8 ? (8 - y) : 0;
    for (let x = 2 + inset; x <= 13 - inset; x++) {
      set(x, y, y === 6 ? metal.light2 : y === 11 ? metal.dark : metal.base);
    }
  }
  set(4, 7, metal.light); set(5, 7, metal.light);
  return px;
}

function drawOreIcon(metal: Mat): Px16 {
  const px = px16();
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = hash2(x, y, 5);
      const v = parseInt(shade(MATS.stone.base, 0.85 + n * 0.3).slice(1), 16);
      const i = (y * 16 + x) * 4;
      px.data[i] = (v >> 16) & 255; px.data[i + 1] = (v >> 8) & 255; px.data[i + 2] = v & 255; px.data[i + 3] = 255;
    }
  }
  const rng = new RNG(9);
  for (let b = 0; b < 3; b++) {
    const bx = rng.int(2, 11), by = rng.int(2, 11);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      const i = ((by + dy) * 16 + bx + dx) * 4;
      const v = parseInt(metal.light.slice(1), 16);
      px.data[i] = (v >> 16) & 255; px.data[i + 1] = (v >> 8) & 255; px.data[i + 2] = v & 255;
    }
  }
  return px;
}

function simple(color: string, shape: (set: (x: number, y: number, c: string) => void) => void): Px16 {
  const px = px16();
  const set = (x: number, y: number, col: string) => {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    const v = parseInt(col.slice(1), 16);
    const i = (y * 16 + x) * 4;
    px.data[i] = (v >> 16) & 255; px.data[i + 1] = (v >> 8) & 255; px.data[i + 2] = v & 255; px.data[i + 3] = 255;
  };
  shape(set);
  return px;
}

import type { Mat } from './Palette';

export function genItemIconPixels(key: string): Px16 {
  const def = ITEM_DEFS[ITEM_BY_KEY[key]];
  const metals: Record<string, Mat> = {
    copper: MATS.copper, iron: MATS.iron, silver: MATS.silver, gold: MATS.gold,
  };
  // 方块类
  if (def.tile && ['dirt', 'stone', 'sand', 'snow', 'wood', 'platform'].includes(def.tile)) {
    return tileThumb(def.tile);
  }
  if (def.tile === 'torch') {
    return simple('#000', (s) => {
      for (let y = 7; y <= 14; y++) { s(7, y, MATS.wood.base); s(8, y, MATS.wood.dark); }
      s(7, 4, MATS.fire.light2); s(8, 4, MATS.fire.light2);
      s(6, 5, MATS.fire.light); s(7, 5, MATS.fire.base); s(8, 5, MATS.fire.base); s(9, 5, MATS.fire.light);
      s(7, 6, MATS.fire.dark); s(8, 6, MATS.fire.dark);
    });
  }
  if (def.tile === 'workbench') {
    return simple('#000', (s) => {
      for (let x = 1; x <= 14; x++) for (let y = 1; y <= 5; y++) s(x, y, y === 1 ? MATS.wood.light : MATS.wood.base);
      for (let y = 6; y <= 14; y++) { s(2, y, MATS.wood.dark); s(13, y, MATS.wood.dark); }
    });
  }
  if (def.tile === 'furnace') {
    return simple('#000', (s) => {
      for (let x = 1; x <= 14; x++) for (let y = 1; y <= 14; y++) s(x, y, (x === 1 || y === 1) ? MATS.stone.light : (x === 14 || y === 14) ? MATS.stone.dark : MATS.stone.base);
      for (let x = 5; x <= 10; x++) for (let y = 8; y <= 13; y++) s(x, y, y > 11 ? MATS.fire.light : MATS.fire.base);
    });
  }
  if (def.tile === 'anvil') {
    return simple('#000', (s) => {
      for (let x = 2; x <= 13; x++) { s(x, 3, MATS.metal.light2); s(x, 4, MATS.metal.base); }
      for (let y = 5; y <= 7; y++) for (let x = 6; x <= 9; x++) s(x, y, MATS.metal.dark);
      for (let x = 4; x <= 11; x++) { s(x, 8, MATS.metal.base); s(x, 9, MATS.metal.dark); }
    });
  }
  if (def.tile === 'chest') {
    return simple('#000', (s) => {
      for (let x = 2; x <= 13; x++) for (let y = 3; y <= 13; y++) s(x, y, y < 7 ? MATS.woodDark.light : MATS.woodDark.base);
      for (let x = 2; x <= 13; x++) s(x, 7, '#5A4520');
      s(7, 6, MATS.gold.light); s(8, 6, MATS.gold.light); s(7, 7, MATS.gold.base); s(8, 7, MATS.gold.base); s(7, 8, MATS.gold.dark); s(8, 8, MATS.gold.dark);
      for (let y = 3; y <= 13; y++) { s(2, y, MATS.gold.dark); s(13, y, MATS.gold.dark); }
    });
  }
  if (def.tile === 'door') {
    return simple('#000', (s) => {
      for (let x = 3; x <= 12; x++) for (let y = 1; y <= 14; y++) s(x, y, (x === 3 || x === 12 || y === 1 || y === 14) ? MATS.wood.dark : MATS.wood.base);
      s(7, 8, MATS.gold.light); s(8, 8, MATS.gold.light);
    });
  }
  // 工具（锤补入分派数组——drawTool 已有锤头分支，此前被漏过滤到此后的兜底图）
  if (def.tool && ['pick', 'axe', 'sword', 'hammer'].includes(def.tool.type)) {
    // vi_<id>_ 前缀先剥离再找金属段（vi_3509_copper_pickaxe → copper；
    // 此前 split('_')[0] 对 vi_* 键恒取 'vi' → 全部落到木色回退）
    const segs = key.replace(/^vi_\d+_/, '').split('_');
    const tier = segs.find((s) => metals[s]) ?? segs[0];
    const metal = metals[tier] ?? MATS.wood;
    return drawTool(def.tool.type as 'pick' | 'axe' | 'sword' | 'hammer', metal);
  }
  // 锭
  if (key.endsWith('_bar')) {
    return drawBar(metals[key.replace('_bar', '')] ?? MATS.iron);
  }
  // 矿石
  if (key.endsWith('_ore')) {
    return drawOreIcon(metals[key.replace('_ore', '')] ?? MATS.copper);
  }
  // (本地键专属像素画分支 gel/mushroom_item/lens/suspicious_eye/
  //  lesser_healing_potion/coin_copper 已随本地物品退役移除——vi_ 物品图标
  //  走原版 Item_Atlas,此兜底仅服务残余 place_v_/无素材条目)
  // 兜底：问号块
  return simple('#888', (s) => {
    for (let x = 3; x <= 12; x++) for (let y = 3; y <= 12; y++) s(x, y, '#777');
  });
}

/** canvas 包装(worker 不可用时的主线程回退路径用) */
export function genItemIconCanvas(key: string): HTMLCanvasElement {
  const px = genItemIconPixels(key);
  const [c, ctx] = mk(16, 16);
  // TS ImageDataArray 收窄:显式可变视图
  const clamped = new Uint8ClampedArray(px.data);
  ctx.putImageData(new ImageData(clamped, 16, 16), 0, 0);
  return c;
}

export function generateAllItemIcons(): Map<number, HTMLCanvasElement> {
  const map = new Map<number, HTMLCanvasElement>();
  // ★方案 A（BJ264）：ITEM_DEFS 重排后稀疏（洞=undefined）——!def 跳过
  for (const def of ITEM_DEFS) {
    if (!def) continue;
    map.set(ITEM_BY_KEY[def.key], genItemIconCanvas(def.key));
  }
  return map;
}

/** worker 载荷:全部图标平铺进一张图集 */
export interface IconAtlasPayload {
  rgba: ArrayBuffer;          // atlasW×atlasH×4(transferable)
  width: number; height: number;
  cols: number;               // 每行图标数(=atlasW/16)
  /** 按 ITEM_DEFS 下标序的 id 列表(与槽位一一对应) */
  ids: number[];
}
