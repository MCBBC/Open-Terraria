// 原版素材接入：按白名单从 terraria-assets 拷贝 PNG + 提取 TEdit 元数据 → public/sprites/vanilla.json
// 原版 Tiles 表无 .meta（不同于 Maples Unity 项目），按 textureGrid+frameGap 网格寻址：
//   帧 (col,row) 位于 (col*(gridX+gapX), row*(gridY+gapY))，帧尺寸 = textureGrid
// 用法：node scripts/vanilla-atlas.mjs
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const ASSETS = join(ROOT, '..', 'terraria-assets', 'Images');
const TEDIT_DATA = join(ROOT, '..', 'Terraria-Map-Editor', 'src', 'TEdit.Terraria', 'Data');
const OUT_DIR = join(ROOT, 'public', 'sprites', 'vanilla');
const OUT_JSON = join(ROOT, 'public', 'sprites', 'vanilla.json');
const whitelist = JSON.parse(readFileSync(join(here, 'vanilla-whitelist.json'), 'utf8'));

/** 读 PNG IHDR（8 字节签名 + 4 长度 + 4 类型后即宽高，各 4 字节大端） */
function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const tiles = JSON.parse(readFileSync(join(TEDIT_DATA, 'tiles.json'), 'utf8'));
const items = JSON.parse(readFileSync(join(TEDIT_DATA, 'items.json'), 'utf8'));
const walls = JSON.parse(readFileSync(join(TEDIT_DATA, 'walls.json'), 'utf8'));
const tileById = new Map(tiles.map((t) => [t.id, t]));
const itemById = new Map(items.map((i) => [i.id, i]));
const wallById = new Map(walls.map((w) => [w.id, w]));

mkdirSync(OUT_DIR, { recursive: true });

// 杂项单图素材（呼吸气泡等，非表驱动）
const MISC = ['Bubble.png'];
for (const m of MISC) {
  const src = join(ASSETS, m);
  if (existsSync(src)) copyFileSync(src, join(OUT_DIR, m));
}

const hex = (c) => (c ? '#' + c.replace('#', '').slice(0, 6).toUpperCase() : '#808080');

const out = { tiles: {}, items: {}, walls: {}, npcs: {} };

// NPC 贴图表（纵向帧条）的帧高：原版帧数在二进制里，按已知贴图规格手配
const NPC_FRAME_H = {
  // 按透明分隔行实测（analyze-frames.mjs 探测）：帧高必须整除表高且对齐内容带
  46: 40, 74: 24, 299: 32, 300: 16, 355: 16, 356: 24,
  359: 20, 361: 22, 362: 40, 377: 12,
  442: 24, 443: 40, 444: 24, 445: 22, 446: 12, 447: 16,
};

let copied = 0, missing = [];

for (const id of whitelist.tiles) {
  const t = tileById.get(id);
  const src = join(ASSETS, `Tiles_${id}.png`);
  if (!t || !existsSync(src)) { missing.push(`Tiles_${id}`); continue; }
  copyFileSync(src, join(OUT_DIR, `Tiles_${id}.png`)); copied++;
  const grid = t.textureGrid ?? [16, 16];
  const gap = t.frameGap ?? [2, 2];
  const { w, h } = pngSize(src);
  out.tiles[id] = {
    name: t.name,
    key: t.key,
    sheet: `vanilla/Tiles_${id}.png`,
    solid: !!t.isSolid,
    blend: !!t.canBlend,
    framed: !!t.isFramed,
    light: !!t.isLight,
    color: hex(t.color),
    placement: t.placement ?? null,
    grid, // 帧像素尺寸（蜡烛类 [16,20]）
    stride: [grid[0] + gap[0], grid[1] + gap[1]], // 表内帧步长
    frameSize: t.frameSize ?? [[1, 1]], // 每个占格数（多格家具）
    cols: Math.floor(w / (grid[0] + gap[0])),
    rows: Math.floor(h / (grid[1] + gap[1])),
  };
}

for (const id of whitelist.items) {
  const it = itemById.get(id);
  const src = join(ASSETS, `Item_${id}.png`);
  if (!it || !existsSync(src)) { missing.push(`Item_${id}`); continue; }
  copyFileSync(src, join(OUT_DIR, `Item_${id}.png`)); copied++;
  out.items[id] = {
    name: it.name,
    key: it.key,
    icon: `vanilla/Item_${id}.png`,
    createTile: it.createTile ?? null,
  };
}

for (const id of whitelist.walls) {
  const w = wallById.get(id);
  const src = join(ASSETS, `Wall_${id}.png`);
  if (!w || !existsSync(src)) { missing.push(`Wall_${id}`); continue; }
  copyFileSync(src, join(OUT_DIR, `Wall_${id}.png`)); copied++;
  const grid = w.textureGrid ?? [16, 16];
  const gap = w.frameGap ?? [2, 2];
  const { w: pw, h: ph } = pngSize(src);
  out.walls[id] = {
    name: w.name, key: w.key, sheet: `vanilla/Wall_${id}.png`,
    color: hex(w.color), grid, stride: [grid[0] + gap[0], grid[1] + gap[1]],
    cols: Math.floor(pw / (grid[0] + gap[0])), rows: Math.floor(ph / (grid[1] + gap[1])),
  };
}


// NPC 贴图表（纵向帧条）：帧高手配（原版帧数存于二进制，按贴图规格配）
for (const id of whitelist.npcs ?? []) {
  const src = join(ASSETS, `NPC_${id}.png`);
  if (!existsSync(src)) { missing.push(`NPC_${id}`); continue; }
  copyFileSync(src, join(OUT_DIR, `NPC_${id}.png`)); copied++;
  const { w, h } = pngSize(src);
  const frameH = NPC_FRAME_H[id] ?? h;
  out.npcs[id] = {
    sheet: `vanilla/NPC_${id}.png`,
    frameW: w, frameH,
    count: Math.max(1, Math.floor(h / frameH)),
  };
}

writeFileSync(OUT_JSON, JSON.stringify(out));
console.log(`vanilla-atlas: tiles=${Object.keys(out.tiles).length} items=${Object.keys(out.items).length} walls=${Object.keys(out.walls).length} copied=${copied}`);
if (missing.length) console.warn('缺失（白名单有但文件/数据不存在）:', missing.join(', '));
