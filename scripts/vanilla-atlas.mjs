// 原版素材接入：按白名单从 terraria-assets 拷贝 PNG + 提取 TEdit 元数据 → public/sprites/vanilla.json
// 原版 Tiles 表无 .meta（不同于 Maples Unity 项目），按 textureGrid+frameGap 网格寻址：
//   帧 (col,row) 位于 (col*(gridX+gapX), row*(gridY+gapY))，帧尺寸 = textureGrid
// 用法：node scripts/vanilla-atlas.mjs
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
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
  // 液体贴图（TEdit GetLiquid：0-13 群系水色 + 1 岩浆 11 蜂蜜 14 微光）
  ...Array.from({ length: 14 }, (_, i) => `Liquid_${i}.png`),
  'Liquid_14.png',
  // 1.4 原版液体主表（LiquidRenderer：0-10/12/13 群系水色 CalculateWaterStyle + 1 岩浆 11 蜂蜜 14 微光，48×1360）
  ...Array.from({ length: 11 }, (_, i) => `Misc/water_${i}.png`),
  'Misc/water_12.png', 'Misc/water_13.png', 'Misc/water_14.png',
  // 长柱瀑布胶片条（WaterfallManager:水类型绘制走 num12=Style=waterStyle,:528）
  ...Array.from({ length: 14 }, (_, i) => `Waterfall_${i}.png`),
  'Waterfall_25.png', 'Waterfall_26.png', 'Waterfall_27.png',
  // 蘑菇树树冠（tile 72 专用 ShroomTop）
  'Shroom_Tops.png',
  // 电路渲染(Main.cs:43543 DrawWires):导线图集 + 致动器覆盖
  'WiresNew.png',
  'Actuator.png',
  // 电路陷阱弹幕(Wiring.cs:1495-1743)
  'Projectile_98.png', 'Projectile_99.png', 'Projectile_184.png',
  'Projectile_185.png', 'Projectile_186.png', 'Projectile_187.png', 'Projectile_654.png',
  // 炮弹族（Wiring.cs case 209/212 → WorldGen.ShootFromCannon）：
  // 162 炮弹 18×18 / 166 雪球 14×14 / 281 爆炸兔兔 28×28（整图单帧）
  'Projectile_162.png', 'Projectile_166.png', 'Projectile_281.png',
  // 烟花三件套（Wiring.cs:1492-1553）：167-170 烟花火箭 / 415-418 烟花盒火箭 /
  // 419-422 喷泉火花；733 马桶水花 alpha=255 隐形纯发射器，不入表
  'Projectile_167.png', 'Projectile_168.png', 'Projectile_169.png', 'Projectile_170.png',
  'Projectile_415.png', 'Projectile_416.png', 'Projectile_417.png', 'Projectile_418.png',
  'Projectile_419.png', 'Projectile_420.png', 'Projectile_421.png', 'Projectile_422.png',
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
  // DD2 军队弹幕（ProjectileID.cs:840/:1676-1734）：240 荷兰飞船炮弹 / 675 暗影矢 /
  // 682 电弧 / 686 Betsy 火球 / 687 Betsy 喷焰——此前以 21/173/15 代渲(RENDER_PROXY 已退役)
  'Projectile_240.png', 'Projectile_675.png', 'Projectile_682.png',
  'Projectile_686.png', 'Projectile_687.png',
  // 日月(Main.cs:62279 DrawSunAndMoon):太阳整图 + 月亮 8 相位竖条(Moon_N 50×400)
  'Sun.png',
  ...Array.from({ length: 9 }, (_, i) => `Moon_${i}.png`),
  // 世界背景图全量（地表视差层/地下层/地狱层；仅落盘，运行时由 BiomeBackground 懒加载——
  // 不进 SpriteAtlas VANILLA_MISC 常驻表，避免 344 张整图常驻内存）
  ...Array.from({ length: 344 }, (_, i) => `Background_${i}.png`),
  // ---- NPC GlowMask 体系（Main.cs DrawNPC 硬编码发光叠画，GlowMaskID 逐处引用）----
  // 火星飞碟族 392/395/394（Main.cs:24218-24226 Color(200,200,200,0) 叠画）
  'Glow_48.png', 'Glow_49.png', 'Glow_50.png',
  // 四天界塔（Main.cs:23746-23776：493→132 星璇? 见表内注释 / 507→143 / 422→149 / 517→162，
  // 各以速度向量四向偏移画 4 份灰 A=64 拷贝）
  'Glow_132.png', 'Glow_143.png', 'Glow_149.png', 'Glow_162.png',
  // 银河织带 402-404（Main.cs:23878-23886 拖尾白 Glow 133/134 + 本体 135）
  'Glow_133.png', 'Glow_134.png', 'Glow_135.png',
  // 暗黑魔法师 564/565（Main.cs:23480-23492 white×Opacity + 4 环绕残影）/ Betsy 551（:23099）
  'Glow_225.png', 'Glow_226.png',
  // 永恒水晶 548（Main.cs:23594 彩虹脉冲底层）
  'Glow_239.png',
  // ---- 月总手-躯干连接（Main.cs:24325-24540 case 396/397/398 独占分支）----
  // 398:Extra_13 躯干双半(镜像)+Extra_14 上臂+Extra_16 胸甲;397:Extra_15 前臂+Extra_17/19 眼
  // 396:Extra_18/19 双眼+Extra_25/29 破体阶段;Extra_26 眼窝闲置帧(397 ai[0]==-2)
  'Extra_13.png', 'Extra_14.png', 'Extra_15.png', 'Extra_16.png', 'Extra_17.png',
  'Extra_18.png', 'Extra_19.png', 'Extra_25.png', 'Extra_26.png', 'Extra_29.png',
  // ---- 光之女皇 636（DrawNPCDirect_HallowBoss Main.cs:26364-26554）----
  // 157 着色器层(此处直画近似)/158 左臂/159 翅膀(1×11 帧 scale×2)/160 右臂
  // 187 二阶段翅膀(1×8 帧)/188 二阶段头冠
  'Extra_157.png', 'Extra_158.png', 'Extra_159.png', 'Extra_160.png',
  'Extra_187.png', 'Extra_188.png',
  // 塔护盾 ForceField 着色器载体（Main.cs:23806 DrawData 600×600 原图 Misc/Perlin）
  'Misc/Perlin.png',
  // ---- 风摆动/自然粒子（WindSway/NatureParticles）----
  // 落叶 gore（GetTreeLeaf 表 + SpecialAI 3 族 910-925/1113-1121/1248-1255,1257）
  'Gore_910.png', 'Gore_911.png', 'Gore_912.png', 'Gore_913.png', 'Gore_914.png',
  'Gore_915.png', 'Gore_916.png', 'Gore_917.png', 'Gore_918.png', 'Gore_919.png',
  'Gore_920.png', 'Gore_921.png', 'Gore_922.png', 'Gore_923.png', 'Gore_924.png',
  'Gore_925.png',
  'Gore_1113.png', 'Gore_1114.png', 'Gore_1115.png', 'Gore_1116.png', 'Gore_1117.png',
  'Gore_1118.png', 'Gore_1119.png', 'Gore_1120.png', 'Gore_1121.png',
  'Gore_1248.png', 'Gore_1249.png', 'Gore_1250.png', 'Gore_1251.png', 'Gore_1252.png',
  'Gore_1253.png', 'Gore_1254.png', 'Gore_1255.png', 'Gore_1257.png',
  // 滴水 gore（EmitLiquidDrops 水型映射 706-717 + 1147/943/1160-1162/1383）
  'Gore_706.png', 'Gore_707.png', 'Gore_708.png', 'Gore_709.png', 'Gore_710.png',
  'Gore_711.png', 'Gore_712.png', 'Gore_713.png', 'Gore_714.png', 'Gore_715.png',
  'Gore_716.png', 'Gore_717.png', 'Gore_943.png', 'Gore_1147.png',
  'Gore_1160.png', 'Gore_1161.png', 'Gore_1162.png', 'Gore_1383.png',
  // 自然层 glowmask（634 树 315/316/317、592 吊挂 294、656/701 摆动草 329）
  'Glow_294.png', 'Glow_315.png', 'Glow_316.png', 'Glow_317.png', 'Glow_329.png',
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
  488: 50, // 训练假人：32x550，11 帧（0 站立 + 双向摇动 5+5）
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

// 阶段5:物品全量——shelf-pack 打包成少数 Item_Atlas_k.png 图集(6059 张单体 → ~3 张)。
//  请求粒度优化:运行时 preloadIcons 只取图集,不再逐张 Item_N.png(此前 6000+ 网络请求)。
//  2048² 货架,按高度降序;2px gutter 防 UI 32×32 缩小采样串色;解码失败回退单体路径。
import { PNG } from 'pngjs';
const ATLAS_W = 2048, ATLAS_H = 2048, GUTTER = 2;
// 先 IHDR 读尺寸(不解码)→ 按高度降序排序,货架密度更高
const itemFiles = [];
for (const it of items) {
  const src = join(ASSETS, `Item_${it.id}.png`);
  if (!existsSync(src)) { missing.push(`Item_${it.id}`); continue; }
  try { itemFiles.push({ it, src, ...pngSize(src) }); } catch { missing.push(`Item_${it.id}(IHDR)`); }
}
itemFiles.sort((a, b) => b.h - a.h);
let atlasPage = null, atlasX = 0, atlasY = 0, shelfH = 0, atlasIdx = -1;
const flushAtlas = () => {
  if (!atlasPage) return;
  writeFileSync(join(OUT_DIR, `Item_Atlas_${atlasIdx}.png`), PNG.sync.write(atlasPage));
  atlasPage = null;
};
const newAtlasPage = () => {
  flushAtlas();
  atlasIdx++;
  atlasPage = new PNG({ width: ATLAS_W, height: ATLAS_H });
  atlasX = GUTTER; atlasY = GUTTER; shelfH = 0;
  console.log(`item atlas #${atlasIdx} open`);
};
for (const { it, src, w: iw0, h: ih0 } of itemFiles) {
  const id = it.id;
  let png = null;
  try { png = PNG.sync.read(readFileSync(src)); } catch { png = null; }
  const base = {
    name: it.name,
    key: it.key,
    createTile: it.createTile ?? null,
  };
  if (!png) {
    // 解码失败兜底:保持旧单体路径(同时拷贝单体)
    copyFileSync(src, join(OUT_DIR, `Item_${id}.png`)); copied++;
    out.items[id] = { ...base, icon: `vanilla/Item_${id}.png` };
    continue;
  }
  if (!atlasPage) newAtlasPage();
  const iw = png.width, ih = png.height;
  if (atlasX + iw + GUTTER > ATLAS_W) { atlasX = GUTTER; atlasY += shelfH + GUTTER; shelfH = 0; }
  if (atlasY + ih + GUTTER > ATLAS_H) newAtlasPage();
  PNG.bitblt(png, atlasPage, 0, 0, iw, ih, atlasX, atlasY);
  out.items[id] = {
    ...base,
    icon: `vanilla/Item_Atlas_${atlasIdx}.png`,
    ix: atlasX, iy: atlasY, iw, ih,
  };
  atlasX += iw + GUTTER;
  if (ih > shelfH) shelfH = ih;
}
flushAtlas();
console.log(`item atlas pages: ${atlasIdx + 1}`);
// 清理旧单体残留(图集化前的产物,已无任何引用;readdirSync+unlinkSync 避免与白名单拷贝混淆)
{
  let removed = 0;
  for (const f of readdirSync(OUT_DIR)) {
    if (/^Item_\d+\.png$/.test(f)) { unlinkSync(join(OUT_DIR, f)); removed++; }
  }
  if (removed) console.log(`removed ${removed} legacy Item monoliths`);
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
