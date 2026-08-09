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

// 杂项单图素材（呼吸气泡等，非表驱动）+ 树木专用贴图（TEdit WorldRenderXna 逻辑）
const MISC = [
  'Bubble.png',
  // 树冠/树枝（style 0 起步；TEdit GetTreeTops/GetTreeBranches）
  ...Array.from({ length: 32 }, (_, i) => `Tree_Tops_${i}.png`),
  ...Array.from({ length: 32 }, (_, i) => `Tree_Branches_${i}.png`),
  // 各生物群系树干（TEdit GetTree → Images/Tiles_5_N）
  ...Array.from({ length: 7 }, (_, i) => `Tiles_5_${i}.png`),
  // 仙人掌生物群系变体（腐化/神圣/猩红，与 Tiles_80 同 18px 网格）
  'Evil_Cactus.png', 'Good_Cactus.png', 'Crimson_Cactus.png',
  // 液体贴图（TEdit GetLiquid：0 水 / 1 岩浆 / 11 蜂蜜 / 14 微光）
  'Liquid_0.png', 'Liquid_1.png', 'Liquid_11.png', 'Liquid_14.png',
  // 1.4 原版液体主表（LiquidRenderer：0 水 / 1 岩浆 / 11 蜂蜜，48×1360）
  'Misc/water_0.png', 'Misc/water_1.png', 'Misc/water_11.png',
  // 蘑菇树树冠（tile 72 专用 ShroomTop）
  'Shroom_Tops.png',
];
for (const m of MISC) {
  const src = join(ASSETS, m);
  // 子目录展平（Misc/water_0 → Misc_water_0，目标目录无子目录结构）
  if (existsSync(src)) copyFileSync(src, join(OUT_DIR, m.replace(/\//g, '_')));
}

const hex = (c) => (c ? '#' + c.replace('#', '').slice(0, 6).toUpperCase() : '#808080');

const out = { tiles: {}, items: {}, walls: {}, npcs: {} };

// NPC 贴图表（纵向帧条）的帧高：原版帧数在二进制里，按已知贴图规格手配
const NPC_FRAME_H = {
  // 按透明分隔行实测（analyze-frames.mjs 探测）：帧高必须整除表高且对齐内容带
  46: 40, 74: 24, 299: 32, 300: 16, 355: 16, 356: 24,
  359: 20, 361: 22, 362: 40, 377: 12,
  442: 24, 443: 40, 444: 24, 445: 22, 446: 12, 447: 16,
  49: 32, // 洞穴蝙蝠：44x160，5 帧扑翼（带探测起始 ≈ 0/32/64/96/128）
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
    isStone: !!t.isStone,   // 石族（同类互连判定）
    isGrass: !!t.isGrass,   // 草族（strictness 2 草规则）
    mergeWith: t.mergeWith ?? null, // 合并目标（blend framing）
    cols: Math.floor(w / (grid[0] + gap[0])),
    rows: Math.floor(h / (grid[1] + gap[1])),
  };
}

// 阶段5:物品全量——有 Item_<id>.png 图标的全部注册(6146 件中约 6085 有图)
for (const it of items) {
  const id = it.id;
  const src = join(ASSETS, `Item_${id}.png`);
  if (!existsSync(src)) { missing.push(`Item_${id}`); continue; }
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
  // 墙表固定 32px 帧 + 4px 间隔（TEdit WorldRenderXna texsize=32, stride=36）
  const grid = [32, 32], stride = [36, 36];
  const { w: pw, h: ph } = pngSize(src);
  out.walls[id] = {
    name: w.name, key: w.key, sheet: `vanilla/Wall_${id}.png`,
    color: hex(w.color), grid, stride,
    cols: Math.floor(pw / stride[0]), rows: Math.floor(ph / stride[1]),
    largeFrame: w.largeFrameType ?? 0,
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

// 全量 tile/item 名称表（仅 id→name，约 30KB——兼容报告显示用，不拷 PNG）
out.tileNames = {};
for (const t of tiles) out.tileNames[t.id] = t.name;
out.itemNames = {};
for (const it of items) out.itemNames[it.id] = it.name;

// ---- UI 贴图段（vui 框架专用，独立目录 vanilla-ui/ 避免与旧 sprites/UI/ 冲突） ----
const UI_OUT_DIR = join(ROOT, 'public', 'sprites', 'vanilla-ui');
const UI_OUT_JSON = join(ROOT, 'public', 'sprites', 'vanilla-ui.json');
mkdirSync(UI_OUT_DIR, { recursive: true });
const uiList = JSON.parse(readFileSync(join(here, 'vanilla-ui-whitelist.json'), 'utf8'));
const uiOut = { files: {} };
const uiKeys = new Set();
let uiCopied = 0;
const uiMissing = [];
for (const rel of uiList) {
  const src = join(ASSETS, rel);
  if (!existsSync(src)) { uiMissing.push(rel); continue; }
  // 子目录下划线展平：UI/CharCreation/ColorHair.png → CharCreation_ColorHair.png
  const key = rel.replace(/\//g, '_');
  if (uiKeys.has(key)) throw new Error(`vanilla-ui 重名键: ${key}`);
  uiKeys.add(key);
  copyFileSync(src, join(UI_OUT_DIR, key));
  uiOut.files[key] = `vanilla-ui/${key}`;
  uiCopied++;
}
// 发型表（228 张，逐张单文件）
for (let i = 1; i <= 228; i++) {
  const src = join(ASSETS, `Player_Hair_${i}.png`);
  if (!existsSync(src)) { uiMissing.push(`Player_Hair_${i}`); continue; }
  copyFileSync(src, join(UI_OUT_DIR, `Player_Hair_${i}.png`));
  uiOut.files[`Player_Hair_${i}.png`] = `vanilla-ui/Player_Hair_${i}.png`;
  uiCopied++;
}
// 玩家身体帧表（skinVariant_clothStyle，40×~1120 = 20 帧×56px，灰度通道素材供纸娃娃调色）
for (let v = 0; v <= 11; v++) {
  for (let c = 0; c <= 15; c++) {
    const name = `Player_${v}_${c}.png`;
    const src = join(ASSETS, name);
    if (!existsSync(src)) continue;
    copyFileSync(src, join(UI_OUT_DIR, name));
    uiOut.files[name] = `vanilla-ui/${name}`;
    uiCopied++;
  }
}
writeFileSync(UI_OUT_JSON, JSON.stringify(uiOut));
console.log(`vanilla-ui: copied=${uiCopied}`);
if (uiMissing.length) console.warn('UI 缺失:', uiMissing.join(', '));

writeFileSync(OUT_JSON, JSON.stringify(out));
console.log(`vanilla-atlas: tiles=${Object.keys(out.tiles).length} items=${Object.keys(out.items).length} walls=${Object.keys(out.walls).length} copied=${copied}`);
if (missing.length) console.warn('缺失（白名单有但文件/数据不存在）:', missing.join(', '));
