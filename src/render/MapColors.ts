// 生成期世界预览（GenWorldPreview / worker previewBitmap 共用）的 tile→RGB 逻辑。
// 返回 0xRRGGBB（字符串 hex 在热循环里太慢）。
// 注意：游戏内小地图（Renderer.colorFor/redrawAll LUT）是独立实现，未走本函数——
// 两份语义需保持一致（活性 tile > 液体 >32 > 墙 > 天空, MapHelper.cs GetWallType）。
// ★IIIII218（2026-09-08）预览↔游戏内地图色差定谳：天顶（tenthAnniversary→
// FinishTenthAnniversaryWorld）给地牢 41/43/44/677-679/48/487、神庙 226/61+墙87、
// 金字塔 151+墙34、云/沙/活树全图上漆（FinalCleanupPass paintThe*Tenth），游戏内
// 小地图走 mapPaintColor 而预览漏漆 ⇒ 地牢/金字塔/神庙双路径颜色不一致——本表补漆
// （MapHelper.cs:1812-1863 MapColor 单源 mapPaintColor，豁免面与 colorFor 同构）。
// ★IIIII227（2026-09-09）四涂装世界预览清偿：invisibleplane（coatEverythingEcho）
// 生成期给全域写隐形涂层（DoCoatEverythingEcho_SingleTile cs:937-966 →
// TileStore.coat invisibleBlock/invisibleWall 位），预览此前漏涂层门 ⇒ 预览全图显形、
// 进图后小地图/实时全隐——双路径不一致。本表补两道门（MapHelper.cs GetTileType
// :1934-1939 `invisibleBlock() → baseType=0; return` 落穿液体/墙/背景 + GetWallType
// :2000 `!invisibleWall()` 门），与游戏内 Renderer.coatHiddenBlock/coatHiddenWall
// 同构（showInvisibleBlocks=回声腔/幽灵护目镜总豁免；旗驱零扰动：coat=0 恒假）。
// fullbright 涂层（xrayvision）在原版地图=GetTileType :1935 `newLight=255` 光照地板
// ——本仓预览/地图不建模逐格光（恒全亮）+探索面=半径点亮（Game.markExplored），
// 语义已由「无光照模型」覆盖为 no-op，不设门（登记于 content-parity IIII227 章）。
import { TILE_DEFS, WALL_DEFS , TILE_BY_KEY } from '../data/tiles';
import {
  vanillaTileMapColor, vanillaTileMapColorOption, vanillaWallMapColor, vanillaLiquidColor,
  vanillaSkyColor, VANILLA_DIRT_BG, VANILLA_ROCK_BG, VANILLA_WALL_LOOKUP0,
} from '../data/vanillaMapColors';
import { mapPaintColor } from '../world/Paint';
import { TileStore } from '../world/TileStore';

function hexToRgb24(hex: string | undefined, fallback: number): number {
  if (!hex || hex[0] !== '#') return fallback;
  const v = parseInt(hex.slice(1, 7), 16);
  return Number.isFinite(v) ? v : fallback;
}

// 预解析颜色表（id → 0xRRGGBB）
const TILE_COLORS = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  if (TILE_DEFS[i]) TILE_COLORS.set(i, hexToRgb24(TILE_DEFS[i].mapColor, 0x808080));
}
const WALL_COLORS = new Map<number, number>();
for (let i = 0; i < WALL_DEFS.length; i++) {
  if (WALL_DEFS[i]) WALL_COLORS.set(i, hexToRgb24(WALL_DEFS[i].mapColor, 0x2e2e2e));
}

const UNKNOWN = 0x808080;
const UNKNOWN_WALL = 0x2e2e2e;

// 原版地图色（MapHelper.cs 全表，tools/extract-mapcolors.mjs）：
// tile 按 vanilla.sheet / 墙按原版 id 直查；液体四色；背景天空渐变/土层/石层
const pack = (c: readonly number[]): number => (c[0] << 16) | (c[1] << 8) | c[2];
const liqColor = (lt: number): number => pack(vanillaLiquidColor(lt >= 1 && lt <= 4 ? lt - 1 : 0));

/** 漆豁免面（Renderer.colorFor 同构；MapHelper.cs:1963-2005）：
 *  tile sheet 160=RainbowBrick 恒忽略漆（GetTileType `if (num == 160) newColor = 0`）。
 *  ★IIIII223 F-2：MAP_WALL_NO_PAINT(21/88-93/168/241) 整支废除——红队定谳该集实为
 *  玻璃族 wallLookup=0 哨兵（vanilla 地图不画，见 vanillaMapColors.VANILLA_WALL_LOOKUP0），
 *  落穿前置后墙漆分支对其永不可达=死代码；墙漆豁免面 vanilla 本就为空（MapColor :1854
 *  默认支无条件吃漆） */
const MAP_TILE_NO_PAINT_SHEET = 160;

/** tile → 0xRRGGBB。优先级：活性 tile > 液体 > 墙 > 背景（MapHelper 模型）。
 *  必须判 flags（=原版 tile.active()）：生成期 TileRunner 会在空气格写"幽灵 type"
 *  （原版 1:1 语义，数据层保留、finalize 净化）——不判 flags 会把幽灵画成实体，
 *  生成预览的天空就是被它们显形成"杂块"（游戏内渲染 ChunkCache 已判 flags）。
 *  bg：世界面上下文（tile 单位）——与游戏内小地图 Renderer.colorFor 尾段同式
 *  （MapHelper.cs GetBackgroundType :2020-2077）：
 *    y<groundLevel → remix ? mapType100(73,120,17) : 天空渐变（remix 分支
 *      cs:2025-2028 `if (Main.remixWorld) { newLight=5; return 100; }`——mapType100
 *      = colorLookup[100] = tile 80 仙人掌 option0 色，原版硬编码怪癖）；
 *    y<lavaLine(地狱顶) → 土层底/石层底；其余 → 地狱底 (50,44,38)（color11）。
 *    缺省 = 浅蓝兜底（无世界面早期）。
 *  ★漆（IIIII218）：tile paint / wall paint 经 mapPaintColor 换色（MapHelper.MapColor
 *  :1812-1863 逐行 1:1，与游戏内 colorFor/fillBand 同一单源）——豁免面见上。 */
export function mapColor24(st: TileStore, x: number, y: number,
  bg?: { groundLevel: number; rockLevel: number; underworld?: number; remix?: boolean }): number {
  const i = st.idx(x, y);
  // ★IIIII227 回声涂层双门（与 Renderer.coatHiddenBlock/coatHiddenWall 同构单源语义；
  //  MapHelper.cs GetTileType :1934-1939 / GetWallType :2000——showInvisibleBlocks
  //  （回声腔/幽灵护目镜）总豁免；普通世界 coat=0 恒假零扰动）
  const showInvis = st.showInvisibleBlocks;
  const invisBlock = (st.coat[i] & TileStore.COAT_INVISIBLE_BLOCK) !== 0 && !showInvis;
  const invisWall = (st.coat[i] & TileStore.COAT_INVISIBLE_WALL) !== 0 && !showInvis;
  const t = st.flags[i] ? st.type[i] : 0;
  if (t !== 0 && !invisBlock) {
    // 自研像素方块（F2 图片导入）：RGB 编码在 frameX/Y（r<<8|g, b）——按原像素色显示
    const PIX = TILE_BY_KEY['pixel_block'];
    if (PIX !== undefined && t === PIX) {
      const fx = st.frameX[i], fy = st.frameY[i];
      return ((fx >> 8) << 16) | ((fx & 255) << 8) | fy;
    }
    // 原版色优先（sheet 直查）；legacy def 回落 mapColor。
    // ★IIIII218 tileLookup=0 语义（MapHelper.cs GetTileType :1936 `baseType =
    //  tileLookup[num]` + :1961 `if (baseType != 0)`）：原版 Initialize 无色表条目的
    //  sheet（127 魔冰/135 压力板/210 地雷/428/504/541——tileOptionCounts=0 →
    //  tileLookup=0）不画 tile,落穿液体/墙/背景（神庙压力板格=墙 87 漆色,即本批
    //  77 格残差定谳）。def.mapColor 兜底仅保留给无 vanilla 映射的自研 tile。
    const sheet = TILE_DEFS[t]?.vanilla?.sheet;
    const p = st.paint[i];
    if (sheet !== undefined) {
      // ★IIIII223 F-3：GetTileType baseType=0/换色残余臂（Terraria.Map/MapHelper.cs
      //  :1949-1964，三路径同构）——① 51/697 蛛网 (x+y)%2==0 → baseType=0 棋盘半隐；
      //  ② 19 平台 frameY==864 底柱格不上图（其黑色 option1（GetTileBaseOption
      //  :2183-2190 frameY/18==48）被 baseType=0 整支屏蔽，原版不可达）；
      //  ③ 184 长苔 frameX/22==10 → num=627 苔色（option=(x+y)%9 :2105-2108）
      let vc = (sheet === 184 && Math.floor(st.frameX[i] / 22) === 10)
        ? vanillaTileMapColorOption(627, (x + y) % 9)
        : vanillaTileMapColor(sheet);
      if (sheet === 51 || sheet === 697) { if ((x + y) % 2 === 0) vc = null; }
      else if (sheet === 19) { if (st.frameY[i] === 864) vc = null; }
      if (vc) {
        if (p > 0 && sheet !== MAP_TILE_NO_PAINT_SHEET) return pack(mapPaintColor(false, [vc[0], vc[1], vc[2]], p));
        return pack(vc);
      }
      // sheet 有映射但原版无色表条目（或 F-3 baseType=0 臂命中）→ 落穿（vanilla tileLookup=0）
    } else {
      const c0 = TILE_COLORS.get(t);
      if (c0 !== undefined) {
        if (p > 0) return pack(mapPaintColor(false, [(c0 >> 16) & 255, (c0 >> 8) & 255, c0 & 255], p));
        return c0;
      }
    }
    // 落穿：液体 > 墙 > 背景（MapHelper GetWallType 液体优先序,见下）
  }
  if (st.liquid[i] > 32) return liqColor(st.liquidType[i]);
  const w = st.wall[i];
  // ★IIIII223 F-2：玻璃族 wallLookup=0 → 不上图落穿背景（vanilla GetWallType
  //  baseType=0 ⇒ CreateMapTile :1913-1917 背景支；液体支已在上方先行，与 vanilla
  //  GetWallType 液体优先序同构；与 tileLookup=0 落穿哨兵同族）
  //  ★IIIII227：回声涂层墙（invisibleWall）同门（GetWallType :2000 !invisibleWall()）
  if (w !== 0 && !invisWall && !VANILLA_WALL_LOOKUP0.has(w)) {
    const pw = st.paintWall[i];
    const vc = vanillaWallMapColor(w);
    if (vc) {
      if (pw > 0) return pack(mapPaintColor(true, [vc[0], vc[1], vc[2]], pw));
      return pack(vc);
    }
    const c0 = WALL_COLORS.get(w);
    if (c0 !== undefined) {
      if (pw > 0) {
        return pack(mapPaintColor(true, [(c0 >> 16) & 255, (c0 >> 8) & 255, c0 & 255], pw));
      }
      return c0;
    }
    return UNKNOWN_WALL;
  }
  // 背景：remix 上表 / 天空渐变 / 土层底 / 石层底 / 地狱底（MapHelper GetBackgroundType；
  // 无世界面时浅蓝兜底）。地狱底：原版 hellPosition 单色 (50,44,38)，不是石层底
  if (bg && bg.groundLevel > 0) {
    if (y < bg.groundLevel) {
      if (bg.remix) return REMIX_MAP_BG;
      return pack(vanillaSkyColor(y, bg.groundLevel));
    }
    const underworld = bg.underworld ?? 0;
    if (underworld > 0 && y >= underworld) return VANILLA_HELL_BG_PACKED;
    if (y < bg.rockLevel) return pack(VANILLA_DIRT_BG);
    return pack(VANILLA_ROCK_BG);
  }
  return SKY_FALLBACK;
}
const SKY_FALLBACK = 0x91b9ff; // vanillaSkyColor(浅 y) 近似（生成预览无世界面时的兜底）
/** remix 上表 mapType100（GetBackgroundType cs:2025-2028 `return 100` →
 *  colorLookup[100] = tileLookup[80]（仙人掌）option0 = (73,120,17)；原版怪癖硬编码） */
const REMIX_MAP_BG = (73 << 16) | (120 << 8) | 17;
/** 地狱背景底色（MapHelper.cs:1689 color11=(50,44,38)，GetBackgroundType 尾支 hellPosition） */
const VANILLA_HELL_BG_PACKED = (50 << 16) | (44 << 8) | 38;
