// 原版素材接入：按白名单从 terraria-assets 拷贝 PNG + 提取 TEdit 元数据 → public/sprites/vanilla.json
// 原版 Tiles 表无 .meta（不同于 Maples Unity 项目），按 textureGrid+frameGap 网格寻址：
//   帧 (col,row) 位于 (col*(gridX+gapX), row*(gridY+gapY))，帧尺寸 = textureGrid
// 用法：node scripts/vanilla-atlas.mjs
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
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
  // 原版云朵（Cloud.cs 常用 0-3；9-13 雨云/18-21 风暴云随天气系统后补）
  'Cloud_0.png', 'Cloud_1.png', 'Cloud_2.png', 'Cloud_3.png',
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
  // 电路渲染(Main.cs:43543 DrawWires):导线图集 + 致动器覆盖
  'WiresNew.png',
  'Actuator.png',
  // 电路陷阱弹幕(Wiring.cs:1495-1743)
  'Projectile_98.png', 'Projectile_99.png', 'Projectile_184.png',
  'Projectile_185.png', 'Projectile_186.png', 'Projectile_187.png', 'Projectile_654.png',
  // Boss 弹幕(机械三王/血肉墙/蜂后/世花/石巨人/猪鲨/月总/邪教徒/光女/史后)
  // 83 雷眼绿激光 / 96 诅咒焰 / 100,101,102 激光系 / 183 毒刺 / 407-410 猪鲨泡泡+鲨鱼
  // 522,526,527 蜂后机关枪弹 / 441,442 光女飞刀 / 545 世花种子 / 612 石巨人火球
  // 836-840 月总真眼弹幕 / 950 邪教徒闪电 / 754,755,756 邪教徒弹
  'Projectile_83.png', 'Projectile_96.png', 'Projectile_100.png', 'Projectile_101.png', 'Projectile_102.png',
  'Projectile_183.png', 'Projectile_407.png', 'Projectile_408.png', 'Projectile_410.png',
  'Projectile_522.png', 'Projectile_526.png', 'Projectile_527.png',
  'Projectile_441.png', 'Projectile_442.png', 'Projectile_545.png', 'Projectile_612.png',
  'Projectile_836.png', 'Projectile_838.png', 'Projectile_839.png', 'Projectile_840.png',
  'Projectile_950.png', 'Projectile_754.png', 'Projectile_755.png', 'Projectile_756.png',
  // 邪教徒(464 冰雾/465 闪电/467 火球/468/490 仪式) + 光女(872 永恒彩虹/873 射线/874 极光/
  // 919 光枪/922 王冠凝珠/923 太阳舞/926 凝胶珠)
  'Projectile_464.png', 'Projectile_465.png', 'Projectile_467.png', 'Projectile_468.png', 'Projectile_490.png',
  'Projectile_872.png', 'Projectile_873.png', 'Projectile_874.png', 'Projectile_919.png',
  'Projectile_922.png', 'Projectile_923.png', 'Projectile_926.png',
  // 蜂后毒刺 719 + 世花种子 275/276/277
  'Projectile_719.png', 'Projectile_275.png', 'Projectile_276.png', 'Projectile_277.png',
  // 日月(Main.cs:62279 DrawSunAndMoon):太阳整图 + 月亮 8 相位竖条(Moon_N 50×400)
  'Sun.png',
  ...Array.from({ length: 9 }, (_, i) => `Moon_${i}.png`),
  // 世界背景图全量（地表视差层/地下层/地狱层；仅落盘，运行时由 BiomeBackground 懒加载——
  // 不进 SpriteAtlas VANILLA_MISC 常驻表，避免 344 张整图常驻内存）
  ...Array.from({ length: 344 }, (_, i) => `Background_${i}.png`),
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
  67: 34, // 螃蟹：44x272，8 帧行走（透明带探测）
  602: 36, // 海鸥：44x540，15 帧
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
// 盔甲贴图索引表：原版 Armor_Head/Armor_Body(Armor_Armor)/Armor_Legs 贴图按 item.head/body/legs
// 槽位序号索引（非物品 id！铁甲三件都是 2）。供纸娃娃装备渲染用。
out.armorIndex = {};
for (const it of items) {
  if (it.head || it.body || it.legs) {
    out.armorIndex[it.id] = { head: it.head || 0, body: it.body || 0, legs: it.legs || 0 };
  }
}

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
// 发型表（228 张，逐张单文件）+ 帽子发型（Player_HairAlt，hatHair 头盔露出用）
for (let i = 1; i <= 228; i++) {
  const src = join(ASSETS, `Player_Hair_${i}.png`);
  if (!existsSync(src)) { uiMissing.push(`Player_Hair_${i}`); continue; }
  copyFileSync(src, join(UI_OUT_DIR, `Player_Hair_${i}.png`));
  uiOut.files[`Player_Hair_${i}.png`] = `vanilla-ui/Player_Hair_${i}.png`;
  uiCopied++;
  const altSrc = join(ASSETS, `Player_HairAlt_${i}.png`);
  if (existsSync(altSrc)) {
    copyFileSync(altSrc, join(UI_OUT_DIR, `Player_HairAlt_${i}.png`));
    uiOut.files[`Player_HairAlt_${i}.png`] = `vanilla-ui/Player_HairAlt_${i}.png`;
    uiCopied++;
  }
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
// 盔甲贴图（纸娃娃装备渲染）：Armor_Head_{itemId}（20帧竖条）/ Armor_Legs_{itemId}（竖条）/
// Armor/Armor_{itemId}（9×4 复合网格，与玩家复合通道同构）
const armorFiles = readdirSync(ASSETS).filter((f) => /^Armor_(Head|Legs)_\d+\.png$/.test(f));
for (const f of armorFiles) {
  copyFileSync(join(ASSETS, f), join(UI_OUT_DIR, f));
  uiOut.files[f] = `vanilla-ui/${f}`;
  uiCopied++;
}
const armorDir = join(ASSETS, 'Armor');
if (existsSync(armorDir)) {
  for (const f of readdirSync(armorDir).filter((f) => /^Armor_\d+\.png$/.test(f))) {
    const key = `Armor_${f}`; // Armor/Armor_81.png → Armor_Armor_81.png（展平加前缀防撞名）
    copyFileSync(join(armorDir, f), join(UI_OUT_DIR, key));
    uiOut.files[key] = `vanilla-ui/${key}`;
    uiCopied++;
  }
}
writeFileSync(UI_OUT_JSON, JSON.stringify(uiOut));
console.log(`vanilla-ui: copied=${uiCopied}`);
if (uiMissing.length) console.warn('UI 缺失:', uiMissing.join(', '));

writeFileSync(OUT_JSON, JSON.stringify(out));
console.log(`vanilla-atlas: tiles=${Object.keys(out.tiles).length} items=${Object.keys(out.items).length} walls=${Object.keys(out.walls).length} copied=${copied}`);
if (missing.length) console.warn('缺失（白名单有但文件/数据不存在）:', missing.join(', '));
