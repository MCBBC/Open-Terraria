// 原版图块通用渲染器：TEdit TileFraming.SelfFrame8Way 移植（8 向 47 项查找表）
// 用于 TileDef.vanilla.frame === 'auto' 的 1x1 实心块（泥土/矿石/冰雪等同表系）。
// 位序（与游戏 neighborMask 不同！）：U=1 L=2 R=4 D=8 UL=16 UR=32 DL=64 DR=128
// 变体选择 (x*7 + y*11) % 3；无条目/越界回退默认帧 (1,1)
import type { SpriteAtlas, DrawRect } from '../assets/SpriteAtlas';
import { TileStore } from '../world/TileStore';
import { TILE } from '../core/constants';
import { TILE_BY_KEY, TILE_DEFS, PLATFORMS_SHEETS } from '../data/tiles';
import { getUVForMasks } from './BlendFraming';
import { frameMergesWith, halfNeighborConnects, normalizedVidOf, vanillaIdOf } from './TileMergeFamily';
import { tileAnim } from './TileAnim';
import {
  sourceRectOf, boosterAnimFrame, drawLeftDecoration, drawRightDecoration,
  drawBumper, drawBouncyBumper,
  DECOR_LEFT_DOWN, DECOR_RIGHT_DOWN, DECOR_BOUNCY_BUMPER, DECOR_REGULAR_BUMPER,
} from '../world/MinecartTrack';
import { cageFamilyOf, drawCageCell } from './CritterCage';
import { tintedVanillaRegion } from './TileTint';
import { getTreeFoliageSettings, type LeafPaintSettings } from '../world/Paint';
import { inAPlaceWithWindTiles } from '../entities/Mounts';
import { xmasCell, xmasDecorStyle, XMAS_LIGHT_FRAMES } from '../world/XmasTree';
import { animFrameIdx, animYOffset, chimneyAddFrY, fireplaceAddFrY, cogAddFrY, crystalShardAddFrX, volcanoFrame59x, TILE_ANIM_RATE } from './TileAnim';
import { tileFrameCapture as cap } from '../debug/TileFrameCapture';

/** 捕获用素材宽读取（vmeta.sheet → ensureVImage 缓存直取，无请求副作用路径已有） */
function vImgW(atlas: SpriteAtlas, sheet: number): number {
  const m = atlas.vmeta(sheet);
  if (!m) return 0;
  const img = atlas.ensureVImage(m.sheet);
  return img ? img.width : 0;
}
import { vanillaFrameFor, vanillaFrameUnified, setVanillaSolidTables, deriveVanillaSolidTablesFromDefs, isVanillaMergeDirtFamily, isVanillaSeamPair } from './VanillaFraming';
// 原版 TileFrameCosmetic 全链分帧(2026-08-27 对齐工程;2026-08-28 转正默认启用)。
// ★回退开关(发现严重问题时无需改代码):
//   ①URL ?vf=0 —— 单次强制关,压过一切(含 localStorage);
//   ②localStorage sw_vanilla_framing=0 —— 持久关;
//   ③链未命中/越表时逐格自动回落 TEdit blend/auto 旧路径(下方代码原样保留=回退路径本体);
//   ④引擎回退:localStorage sw_vanilla_framing_codegen=0 → TileFrameCosmetic 解释器
//     (代码生成 tileframe-codegen 为默认引擎,见 VanillaFraming.ts)。
// 验收依据:金标四层+rig 1932 格逐位、worldwide 32003 格 interp==gen 零差、
// 真机 A/B 长任务 7163ms→0、斜坡/半砖 A/B 逐像素一致(用户验收)。
const SW_VANILLA_FRAMING = (() => {
  try {
    const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('vf');
    if (q === '1') return true;
    if (q === '0') return false;
  } catch { /* SSR/无 location */ }
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('sw_vanilla_framing') === '0') return false;
  } catch { /* node 测试环境 */ }
  return true; // ★2026-08-28 转正:默认启用
})();

/** 探针/测试专用只读:当前链启用态 */
export function isVanillaFramingEnabled(): boolean {
  return SW_VANILLA_FRAMING;
}
// vanilla solid/solidTop 表注入(初始化一次;solidTop 用 SW 平台表近似——矩阵对 426-434/727-732
// 皆整块,不涉 solidTop,误差面为零)
// ★2026-08-28:推导逻辑收敛到 VanillaFraming.deriveVanillaSolidTablesFromDefs——
// 此前按 def 序 last-write-wins 直写,pixel_block(sheet 0, solid=false) 后定义覆盖 dirt
// ⇒ solid[0]=false ⇒ 泥土被 TileMergeAttemptWeird 当非固体改写 -1,草/泥边界分支全翻转
// (用户实报「草下泥土出现暗色横线」根因,金标测试因注入 Main.cs 真值表而漏检)。
let _solidTablesInit = false;
function ensureSolidTables(): void {
  if (_solidTablesInit) return;
  _solidTablesInit = true;
  const { solid, solidTop } = deriveVanillaSolidTablesFromDefs();
  setVanillaSolidTables(solid, solidTop);
}
// vanilla 链帧生产者(auto/blend 分流的替代帧源):只产出帧与取帧矩形,不绘制。
// 绘制必须走 drawVanillaCell 与 auto 路径共享的原版 TileDrawing 对齐尾部
// (坡面切条 drawSlopedFrame/半砖下半切片/半砖衔接帧/drawAdjust/vectorOffset)——
// 链帧本就是普通合并帧(rig 实证:斜坡格存 (54,54) 等),斜坡/半砖的形状完全由
// 绘制层切出;此前链命中直画整块 ⇒ vf=1 斜坡/半砖全变完整方块(用户实报根因)。
//
// ★跨族边界统一视图(2026-08-30 用户实报「异族结合透背景墙」两批收敛;2026-08-31
// 第四批扩冰雪互斥对——用户实报「冰块×雪块跨类漏缝」,同政策归入统一视图):
// compiled-1458 rig 逐位仲裁证实——链输出的MERGE_DIRT跨族交界帧与原版服务器完全一致,
// 且这些官方过渡帧自带真透明缺口(绿底合成实验),即"细缝咬合"是原版本相;但用户实测
// 权威认定接缝应封闭。第一批尝试「该格回落旧近似路径」,第二批标注证明旧规则在这些
// 构型同样留缝(audit 34 格 notDiverted=0 全已走旧路径仍被标)⇒ 终态=仍用链、把
// 异族合并族邻居【视同本族】求帧(vanillaFrameUnified,独立缓存/不污染全局语义),
// 输出全连内帧族闭合接缝且与周边链格同几何家族。纯原版查验开关
// localStorage sw_vanilla_framing_strict=1 可切回逐位原版(含缝)。
const _VANILLA_STRICT = (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('sw_vanilla_framing_strict') === '1';
  } catch { return false; }
})();
function crossesForeignMergeDirt(st: TileStore, x: number, y: number): boolean {
  const ci = st.idx(x, y);
  if (!st.flags[ci]) return false;
  const van0 = vanillaIdOf(st.type[ci]);
  if (!isVanillaMergeDirtFamily(van0)) return false; // ★family 含 dirt(0),官方表无 tileMergeDirt[0]
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (!st.inBounds(nx, ny)) continue;
      const ni = st.idx(nx, ny);
      if (!st.flags[ni]) continue;
      const nv = vanillaIdOf(st.type[ni]);
      if (nv !== van0 && isVanillaMergeDirtFamily(nv)) return true;
    }
  }
  return false;
}
// 冰雪互斥对门(2026-08-31 用户实报「冰块×雪块跨类漏缝」):官方 tileBrick 超级
// 家族内经 DontMergeWithSnow/Snow/IcesSnow 排除表互斥的对(雪↔冰族/雪泥/松树块/
// 猫毛块、薄冰↔冰族+雪)——官方过渡帧自带真透明缺口,同 MERGE_DIRT 批政策
// (用户权威定案=封闭;sw_vanilla_framing_strict=1 切回逐位原版)。
function crossesSeamPair(st: TileStore, x: number, y: number): boolean {
  const ci = st.idx(x, y);
  if (!st.flags[ci]) return false;
  const van0 = vanillaIdOf(st.type[ci]);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (!st.inBounds(nx, ny)) continue;
      const ni = st.idx(nx, ny);
      if (!st.flags[ni]) continue;
      const nv = vanillaIdOf(st.type[ni]);
      if (nv !== van0 && isVanillaSeamPair(van0, nv)) return true;
    }
  }
  return false;
}
function vanillaChainFrame(
  atlas: SpriteAtlas, sheet: number,
  st: TileStore, x: number, y: number, type: number,
  world?: { rockLevel?: number },
): { r: DrawRect; fx: number; fy: number } | null {
  if (!SW_VANILLA_FRAMING) return null;
  ensureSolidTables();
  const meta = atlas.vmeta(sheet);
  const variant = ((x * 7) + (y * 11)) % 3;
  let v: { fx: number; fy: number };
  if (!_VANILLA_STRICT && (crossesForeignMergeDirt(st, x, y) || crossesSeamPair(st, x, y))) {
    // ★跨族统一视图:异族合并族/冰雪互斥对邻居视同本族求帧 ⇒ 全连内帧族闭合接缝(独立缓存)
    v = vanillaFrameUnified(st, x, y, variant, world?.rockLevel ?? 0);
  } else {
    v = vanillaFrameFor(st, x, y, st, variant, world?.rockLevel ?? 0);
  }
  if (v.fx < 0 || v.fy < 0) return null;
  if (meta && (v.fx + 16 > (meta.cols) * 18 || v.fy + 16 > (meta.rows) * 18)) return null; // 越表回退旧路径
  const r = atlas.vframe(sheet, Math.floor(v.fx / 18), Math.floor(v.fy / 18));
  if (!r) return null;
  return { r, fx: v.fx, fy: v.fy };
}

type Frame = [number, number];

// 47 项查找表（源：TEdit Render/TileFraming.cs BuildSelfFrame8WayLookup）
// 标准实心块 8 向掩码 → 候选帧(col,row,三变体取一)。1:1 机械生成自原版
// WorldGen.TileFrameCosmetic 判定链(WorldGen.cs:85144-85506):正交四向决定基础帧,
// 全连时按对角缺失选圆角帧;对角方向在非全连时不参与(原版同款)。
// 血案 2026-08-12(木材衔接):旧手写表仅覆盖 47/256 掩码(209 个回落 DEFAULT 平帧)
// 且 L 角坐标错指 13-17 列(原版实际 0-5 列 ×3-4 行;16/17 列越 16 列表宽被
// frameHasContent 兜底)——密集木结构衔接无边缘无圆角。重生成后全 256 覆盖。
// 重建脚本语义(与下表逐条对应,锚点=原版行号):
//   全连+缺上两角→[6,1]族(:85144) 缺下两角→[6,2](:85164) 缺左两角→[10,x](:85182)
//   缺右两角→[11,x](:85200) 全连→[1,1]族(:85218)
//   T形: UDL→[4,x](:85291) UDR→[0,x](:85273) ULR→[1,2]族(:85255) DLR→[1,0]族(:85237)
//   L角: UL→[1,4]族(:85363) UR→[0,4]族(:85345) DL→[1,3]族(:85327) DR→[0,3]族(:85309)
//   条带: 竖[5,x](:85381) 横[6,4]族(:85399) | 端点: 下连[6,0](:85417) 上连[6,3](:85435)
//   右连[9,x](:85453) 左连[12,x](:85471) | 孤立[9,3]族(:85489)
// 注:原版 :84986-85129 的坡面圆角带((18+n)*18 列)超出 16 列表宽,未移植(平块不受影响)。
const LOOKUP: Record<number, Frame[]> = {
  0: [[9,3],[10,3],[11,3]],
  1: [[6,3],[7,3],[8,3]],
  2: [[12,0],[12,1],[12,2]],
  3: [[1,4],[3,4],[5,4]],
  4: [[9,0],[9,1],[9,2]],
  5: [[0,4],[2,4],[4,4]],
  6: [[6,4],[7,4],[8,4]],
  7: [[1,2],[2,2],[3,2]],
  8: [[6,0],[7,0],[8,0]],
  9: [[5,0],[5,1],[5,2]],
  10: [[1,3],[3,3],[5,3]],
  11: [[4,0],[4,1],[4,2]],
  12: [[0,3],[2,3],[4,3]],
  13: [[0,0],[0,1],[0,2]],
  14: [[1,0],[2,0],[3,0]],
  15: [[6,1],[7,1],[8,1]],
  16: [[9,3],[10,3],[11,3]],
  17: [[6,3],[7,3],[8,3]],
  18: [[12,0],[12,1],[12,2]],
  19: [[1,4],[3,4],[5,4]],
  20: [[9,0],[9,1],[9,2]],
  21: [[0,4],[2,4],[4,4]],
  22: [[6,4],[7,4],[8,4]],
  23: [[1,2],[2,2],[3,2]],
  24: [[6,0],[7,0],[8,0]],
  25: [[5,0],[5,1],[5,2]],
  26: [[1,3],[3,3],[5,3]],
  27: [[4,0],[4,1],[4,2]],
  28: [[0,3],[2,3],[4,3]],
  29: [[0,0],[0,1],[0,2]],
  30: [[1,0],[2,0],[3,0]],
  31: [[6,2],[7,2],[8,2]],
  32: [[9,3],[10,3],[11,3]],
  33: [[6,3],[7,3],[8,3]],
  34: [[12,0],[12,1],[12,2]],
  35: [[1,4],[3,4],[5,4]],
  36: [[9,0],[9,1],[9,2]],
  37: [[0,4],[2,4],[4,4]],
  38: [[6,4],[7,4],[8,4]],
  39: [[1,2],[2,2],[3,2]],
  40: [[6,0],[7,0],[8,0]],
  41: [[5,0],[5,1],[5,2]],
  42: [[1,3],[3,3],[5,3]],
  43: [[4,0],[4,1],[4,2]],
  44: [[0,3],[2,3],[4,3]],
  45: [[0,0],[0,1],[0,2]],
  46: [[1,0],[2,0],[3,0]],
  47: [[6,2],[7,2],[8,2]],
  48: [[9,3],[10,3],[11,3]],
  49: [[6,3],[7,3],[8,3]],
  50: [[12,0],[12,1],[12,2]],
  51: [[1,4],[3,4],[5,4]],
  52: [[9,0],[9,1],[9,2]],
  53: [[0,4],[2,4],[4,4]],
  54: [[6,4],[7,4],[8,4]],
  55: [[1,2],[2,2],[3,2]],
  56: [[6,0],[7,0],[8,0]],
  57: [[5,0],[5,1],[5,2]],
  58: [[1,3],[3,3],[5,3]],
  59: [[4,0],[4,1],[4,2]],
  60: [[0,3],[2,3],[4,3]],
  61: [[0,0],[0,1],[0,2]],
  62: [[1,0],[2,0],[3,0]],
  63: [[6,2],[7,2],[8,2]],
  64: [[9,3],[10,3],[11,3]],
  65: [[6,3],[7,3],[8,3]],
  66: [[12,0],[12,1],[12,2]],
  67: [[1,4],[3,4],[5,4]],
  68: [[9,0],[9,1],[9,2]],
  69: [[0,4],[2,4],[4,4]],
  70: [[6,4],[7,4],[8,4]],
  71: [[1,2],[2,2],[3,2]],
  72: [[6,0],[7,0],[8,0]],
  73: [[5,0],[5,1],[5,2]],
  74: [[1,3],[3,3],[5,3]],
  75: [[4,0],[4,1],[4,2]],
  76: [[0,3],[2,3],[4,3]],
  77: [[0,0],[0,1],[0,2]],
  78: [[1,0],[2,0],[3,0]],
  79: [[6,1],[7,1],[8,1]],
  80: [[9,3],[10,3],[11,3]],
  81: [[6,3],[7,3],[8,3]],
  82: [[12,0],[12,1],[12,2]],
  83: [[1,4],[3,4],[5,4]],
  84: [[9,0],[9,1],[9,2]],
  85: [[0,4],[2,4],[4,4]],
  86: [[6,4],[7,4],[8,4]],
  87: [[1,2],[2,2],[3,2]],
  88: [[6,0],[7,0],[8,0]],
  89: [[5,0],[5,1],[5,2]],
  90: [[1,3],[3,3],[5,3]],
  91: [[4,0],[4,1],[4,2]],
  92: [[0,3],[2,3],[4,3]],
  93: [[0,0],[0,1],[0,2]],
  94: [[1,0],[2,0],[3,0]],
  95: [[11,0],[11,1],[11,2]],
  96: [[9,3],[10,3],[11,3]],
  97: [[6,3],[7,3],[8,3]],
  98: [[12,0],[12,1],[12,2]],
  99: [[1,4],[3,4],[5,4]],
  100: [[9,0],[9,1],[9,2]],
  101: [[0,4],[2,4],[4,4]],
  102: [[6,4],[7,4],[8,4]],
  103: [[1,2],[2,2],[3,2]],
  104: [[6,0],[7,0],[8,0]],
  105: [[5,0],[5,1],[5,2]],
  106: [[1,3],[3,3],[5,3]],
  107: [[4,0],[4,1],[4,2]],
  108: [[0,3],[2,3],[4,3]],
  109: [[0,0],[0,1],[0,2]],
  110: [[1,0],[2,0],[3,0]],
  111: [[1,1],[2,1],[3,1]],
  112: [[9,3],[10,3],[11,3]],
  113: [[6,3],[7,3],[8,3]],
  114: [[12,0],[12,1],[12,2]],
  115: [[1,4],[3,4],[5,4]],
  116: [[9,0],[9,1],[9,2]],
  117: [[0,4],[2,4],[4,4]],
  118: [[6,4],[7,4],[8,4]],
  119: [[1,2],[2,2],[3,2]],
  120: [[6,0],[7,0],[8,0]],
  121: [[5,0],[5,1],[5,2]],
  122: [[1,3],[3,3],[5,3]],
  123: [[4,0],[4,1],[4,2]],
  124: [[0,3],[2,3],[4,3]],
  125: [[0,0],[0,1],[0,2]],
  126: [[1,0],[2,0],[3,0]],
  127: [[1,1],[2,1],[3,1]],
  128: [[9,3],[10,3],[11,3]],
  129: [[6,3],[7,3],[8,3]],
  130: [[12,0],[12,1],[12,2]],
  131: [[1,4],[3,4],[5,4]],
  132: [[9,0],[9,1],[9,2]],
  133: [[0,4],[2,4],[4,4]],
  134: [[6,4],[7,4],[8,4]],
  135: [[1,2],[2,2],[3,2]],
  136: [[6,0],[7,0],[8,0]],
  137: [[5,0],[5,1],[5,2]],
  138: [[1,3],[3,3],[5,3]],
  139: [[4,0],[4,1],[4,2]],
  140: [[0,3],[2,3],[4,3]],
  141: [[0,0],[0,1],[0,2]],
  142: [[1,0],[2,0],[3,0]],
  143: [[6,1],[7,1],[8,1]],
  144: [[9,3],[10,3],[11,3]],
  145: [[6,3],[7,3],[8,3]],
  146: [[12,0],[12,1],[12,2]],
  147: [[1,4],[3,4],[5,4]],
  148: [[9,0],[9,1],[9,2]],
  149: [[0,4],[2,4],[4,4]],
  150: [[6,4],[7,4],[8,4]],
  151: [[1,2],[2,2],[3,2]],
  152: [[6,0],[7,0],[8,0]],
  153: [[5,0],[5,1],[5,2]],
  154: [[1,3],[3,3],[5,3]],
  155: [[4,0],[4,1],[4,2]],
  156: [[0,3],[2,3],[4,3]],
  157: [[0,0],[0,1],[0,2]],
  158: [[1,0],[2,0],[3,0]],
  159: [[1,1],[2,1],[3,1]],
  160: [[9,3],[10,3],[11,3]],
  161: [[6,3],[7,3],[8,3]],
  162: [[12,0],[12,1],[12,2]],
  163: [[1,4],[3,4],[5,4]],
  164: [[9,0],[9,1],[9,2]],
  165: [[0,4],[2,4],[4,4]],
  166: [[6,4],[7,4],[8,4]],
  167: [[1,2],[2,2],[3,2]],
  168: [[6,0],[7,0],[8,0]],
  169: [[5,0],[5,1],[5,2]],
  170: [[1,3],[3,3],[5,3]],
  171: [[4,0],[4,1],[4,2]],
  172: [[0,3],[2,3],[4,3]],
  173: [[0,0],[0,1],[0,2]],
  174: [[1,0],[2,0],[3,0]],
  175: [[10,0],[10,1],[10,2]],
  176: [[9,3],[10,3],[11,3]],
  177: [[6,3],[7,3],[8,3]],
  178: [[12,0],[12,1],[12,2]],
  179: [[1,4],[3,4],[5,4]],
  180: [[9,0],[9,1],[9,2]],
  181: [[0,4],[2,4],[4,4]],
  182: [[6,4],[7,4],[8,4]],
  183: [[1,2],[2,2],[3,2]],
  184: [[6,0],[7,0],[8,0]],
  185: [[5,0],[5,1],[5,2]],
  186: [[1,3],[3,3],[5,3]],
  187: [[4,0],[4,1],[4,2]],
  188: [[0,3],[2,3],[4,3]],
  189: [[0,0],[0,1],[0,2]],
  190: [[1,0],[2,0],[3,0]],
  191: [[1,1],[2,1],[3,1]],
  192: [[9,3],[10,3],[11,3]],
  193: [[6,3],[7,3],[8,3]],
  194: [[12,0],[12,1],[12,2]],
  195: [[1,4],[3,4],[5,4]],
  196: [[9,0],[9,1],[9,2]],
  197: [[0,4],[2,4],[4,4]],
  198: [[6,4],[7,4],[8,4]],
  199: [[1,2],[2,2],[3,2]],
  200: [[6,0],[7,0],[8,0]],
  201: [[5,0],[5,1],[5,2]],
  202: [[1,3],[3,3],[5,3]],
  203: [[4,0],[4,1],[4,2]],
  204: [[0,3],[2,3],[4,3]],
  205: [[0,0],[0,1],[0,2]],
  206: [[1,0],[2,0],[3,0]],
  207: [[6,1],[7,1],[8,1]],
  208: [[9,3],[10,3],[11,3]],
  209: [[6,3],[7,3],[8,3]],
  210: [[12,0],[12,1],[12,2]],
  211: [[1,4],[3,4],[5,4]],
  212: [[9,0],[9,1],[9,2]],
  213: [[0,4],[2,4],[4,4]],
  214: [[6,4],[7,4],[8,4]],
  215: [[1,2],[2,2],[3,2]],
  216: [[6,0],[7,0],[8,0]],
  217: [[5,0],[5,1],[5,2]],
  218: [[1,3],[3,3],[5,3]],
  219: [[4,0],[4,1],[4,2]],
  220: [[0,3],[2,3],[4,3]],
  221: [[0,0],[0,1],[0,2]],
  222: [[1,0],[2,0],[3,0]],
  223: [[1,1],[2,1],[3,1]],
  224: [[9,3],[10,3],[11,3]],
  225: [[6,3],[7,3],[8,3]],
  226: [[12,0],[12,1],[12,2]],
  227: [[1,4],[3,4],[5,4]],
  228: [[9,0],[9,1],[9,2]],
  229: [[0,4],[2,4],[4,4]],
  230: [[6,4],[7,4],[8,4]],
  231: [[1,2],[2,2],[3,2]],
  232: [[6,0],[7,0],[8,0]],
  233: [[5,0],[5,1],[5,2]],
  234: [[1,3],[3,3],[5,3]],
  235: [[4,0],[4,1],[4,2]],
  236: [[0,3],[2,3],[4,3]],
  237: [[0,0],[0,1],[0,2]],
  238: [[1,0],[2,0],[3,0]],
  239: [[1,1],[2,1],[3,1]],
  240: [[9,3],[10,3],[11,3]],
  241: [[6,3],[7,3],[8,3]],
  242: [[12,0],[12,1],[12,2]],
  243: [[1,4],[3,4],[5,4]],
  244: [[9,0],[9,1],[9,2]],
  245: [[0,4],[2,4],[4,4]],
  246: [[6,4],[7,4],[8,4]],
  247: [[1,2],[2,2],[3,2]],
  248: [[6,0],[7,0],[8,0]],
  249: [[5,0],[5,1],[5,2]],
  250: [[1,3],[3,3],[5,3]],
  251: [[4,0],[4,1],[4,2]],
  252: [[0,3],[2,3],[4,3]],
  253: [[0,0],[0,1],[0,2]],
  254: [[1,0],[2,0],[3,0]],
  255: [[1,1],[2,1],[3,1]],
};

const DEFAULT_FRAME: Frame = [1, 1];

/** 8 向邻居掩码（vanilla 位序：U=1 L=2 R=4 D=8 UL=16 UR=32 DL=64 DR=128）。
 *  含 BlockStyle 双向门控（与 blend 路径同款,Framing.cs:92-98/199-316）:
 *  half 断上;slope1 断上/右;2 断上/左;3 断下/右;4 断下/左;角落需对角反向两向放行 */
export function mask8(st: TileStore, x: number, y: number, type: number, same: (t: number) => boolean): number {
  const BS = [0b1111, 0b1110, 0b0110, 0b1010, 0b0101, 0b1001]; // bit0=up 1=down 2=left 3=right
  const edges = (ii: number) => {
    const b = st.half[ii] ? 1 : (st.slope[ii] >= 1 && st.slope[ii] <= 4 ? st.slope[ii] + 1 : 0);
    return BS[b];
  };
  const cE = edges(st.idx(x, y));
  // 各方向所需(中心 edge, 对面格 edge);角方向额外查对角格反向两向
  const NEED: Array<[number, number]> = [
    [0b0001, 0b0010], // U: 中心 up / 上邻 down
    [0b0100, 0b1000], // L: 中心 left / 左邻 right
    [0b1000, 0b0100], // R: 中心 right / 右邻 left
    [0b0010, 0b0001], // D: 中心 down / 下邻 up
  ];
  const diagNeed = (dx: number, dy: number): number => {
    // 对角格需放行朝向中心的两个反向边
    let need = 0;
    if (dy < 0) need |= 0b0010; else if (dy > 0) need |= 0b0001; // 对角在下→up / 在上→down
    if (dx < 0) need |= 0b1000; else if (dx > 0) need |= 0b0100; // 对角在右→left / 在左→right
    return need;
  };
  // ★幽灵保域（2026-09-03）：邻格首查 flags bit0——幽灵残型（flags=0,type≠0）视同
  // 空气（原版 active() 门;与 VanillaFraming 链 mkTile 的 act 门同语义）
  const at = (ax: number, ay: number) => {
    if (!st.inBounds(ax, ay)) return false;
    const ai = st.idx(ax, ay);
    return !!st.flags[ai] && same(st.type[ai]);
  };
  const cHalf = !!st.half[st.idx(x, y)];
  const cNum = normalizedVidOf(type);
  let m = 0;
  // 四正交（:70-73）：类型同 + BlockStyle 双向放行 + 半砖邻接覆写(WorldGen.cs:82398-82426)
  const sides: Array<[number, number, number]> = [[0, -1, 0], [-1, 0, 1], [1, 0, 2], [0, 1, 3]];
  const DIRCHAR = ['U', 'L', 'R', 'D'] as const;
  for (const [dx, dy, di] of sides) {
    const [cNeed, nNeed] = NEED[di];
    if ((cE & cNeed) !== cNeed) continue;
    const oi = st.idx(x + dx, y + dy);
    if ((edges(oi) & nNeed) !== nNeed) continue;
    if (!st.inBounds(x + dx, y + dy)) continue;
    const ot = st.type[oi];
    const chain = !!st.flags[oi] && (same(ot) || frameMergesWith(type, ot));   // ★幽灵残型不算连接
    if (!chain) continue;
    if (!halfNeighborConnects(DIRCHAR[di], cHalf, cNum, !!st.half[oi], vanillaIdOf(ot),
      !!TILE_DEFS[ot]?.platform, true)) continue;
    m |= 1 << di;
  }
  // 角（:75-78）：两正交均在 + 对角格反向两向放行 + 类型同
  const corners: Array<[number, number, number, number]> = [
    [-1, -1, 3, 16], [1, -1, 5, 32], [-1, 1, 10, 64], [1, 1, 12, 128], // dx,dy,正交位组合(U|L 等),角位
  ];
  for (const [dx, dy, combo, bit] of corners) {
    if ((m & combo) !== combo) continue;
    if (!at(x + dx, y + dy)) continue;
    const oi = st.idx(x + dx, y + dy);
    if ((edges(oi) & diagNeed(dx, dy)) !== diagNeed(dx, dy)) continue;
    m |= bit;
  }
  return m;
}

/** auto 帧格的实际渲染帧（col,row）——与渲染端同一查找表，供纠错面板定位 */
export function autoFrameAt(st: TileStore, x: number, y: number, type: number): { col: number; row: number } {
  const entry = LOOKUP[mask8(st, x, y, type, (t) => t === type || frameMergesWith(type, t))];
  if (!entry) return { col: DEFAULT_FRAME[0], row: DEFAULT_FRAME[1] };
  const v = ((x * 7) + (y * 11)) % 3 % entry.length;
  return { col: entry[v][0], row: entry[v][1] };
}

/** 'auto' 帧：查表 + 变体。返回 (col,row) 或 null（回退默认帧由调用方处理） */
export function frameFor(atlas: SpriteAtlas, sheet: number, st: TileStore, x: number, y: number, type: number, same: (t: number) => boolean): DrawRect | null {
  const entry = LOOKUP[mask8(st, x, y, type, same)];
  let r: DrawRect | null = null;
  if (entry) {
    const v = entry[((x * 7) + (y * 11)) % 3 % entry.length];
    r = atlas.vframe(sheet, v[0], v[1]);
    if (r && !frameHasContent(r)) r = null; // 空帧（如草皮表缺 13-17 列的边缘帧）→ 回退
  }
  if (!r) r = atlas.vframe(sheet, DEFAULT_FRAME[0], DEFAULT_FRAME[1]);
  return r;
}

/** auto 帧内容检测缓存：key = 图像:像素偏移。查找表引用的帧在部分表（草皮族等
 *  窄表）上是空像素，直画会整格空白 → 检出后回退默认帧 */
const frameContentCache = new Map<string, boolean>();
function frameHasContent(r: DrawRect): boolean {
  const key = `${(r.img as HTMLImageElement).width || r.img.width}x${r.img.height}:${r.sx},${r.sy}`;
  const hit = frameContentCache.get(key);
  if (hit !== undefined) return hit;
  let ok = false;
  try {
    const c = document.createElement('canvas');
    c.width = r.sw; c.height = r.sh;
    const cx = c.getContext('2d', { willReadFrequently: true })!;
    cx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
    const d = cx.getImageData(0, 0, r.sw, r.sh).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 16) { if (d[i] > 40 && ++n >= 4) { ok = true; break; } }
  } catch { ok = true; /* 采样失败按有内容处理 */ }
  frameContentCache.set(key, ok);
  return ok;
}

/** 树木专用渲染（tile 5，移植 TEdit WorldRenderXna 树逻辑）：
 *  - 树干帧（frameY < 198）：按树下草地生物群系选 Tiles_5_0..6 变体，取 (U,V,20,20) 压入 16px 格
 *  - 标记帧（frameX >= 22 且 frameY >= 198）：不采样 Tiles_5——
 *    U=22 树顶（Tree_Tops_style 80×80 底部锚定）、U=44 左枝（Tree_Branches 40×40 右锚定）、
 *    U=66 右枝（左锚定）；变体 x%3
 *  treeStyle 固定 0（wld 树样式段未解析，默认森林） */
// 树类 tile → Tree_Tops/Branches 样式（TEdit：5 森林 0 / 宝石树 583-589 → 22-28 /
// 装饰树 596 樱花→29、616 柳→30 / 灰烬树 634 → 31）
const TREE_SHEET_STYLES: Record<number, number> = { 5: 0, 596: 29, 616: 30, 634: 31 };
for (let i = 583; i <= 589; i++) TREE_SHEET_STYLES[i] = 22 + (i - 583);
/** 树冠帧尺寸按 PNG 实际宽度推导（3 变体等分 + 2px 间隔；高度 -2）：
 *  自动覆盖全部样式（森林 80×80 / 丛林·宝石 114-116×96 / 装饰 118×96 / 神圣 80-114×140） */
function treeTopSize(img: ImageBitmap | HTMLImageElement, style?: number): [number, number] {
  // 权威帧表（WorldGen FoliageData 出参，:62814-63060）：多数 style 3 帧 ×(w+2)
  // 步长与 PNG 推导一致；例外=非 3 帧表——style 3（神圣，738×142 = 9 帧 80×140，
  // 出参 h=140 :63011）/style 19（1098×142 = 9 帧 120×140）。PNG 推导对这两档
  // 会得出 244/364 宽三联冠（神圣树冠明显破碎）——按表取
  if (style === 3) return [80, 140];
  if (style === 19) return [120, 140];
  return [Math.floor(img.width / 3) - 2, img.height - 2];
}
// 树下草地 → 生物群系树干变体（TEdit treeType；-1 = 基础 Tiles_5）
const TREE_GROUND: Array<[string, number]> = [
  ['v_23_corrupt_grass_block', 0],
  ['v_60_jungle_grass_block', 1],
  ['v_109_hallowed_grass_block', 2],
  ['snow', 3],
  ['v_199_crimson_grass_block', 4],
  ['v_70_mushroom_grass_block', 6],
];
/** 原版 WorldGen.GetCommonTreeFoliageData 样式选择移植（WorldGen.cs:37381-37496）。
 *  trees = { treeX, treeStyle(header), treeTops(v≥211 权威 13 变体), worldSurface, worldW }
 *  变体来源优先 treeTops（GetTreeStyle(areaId)），空表回退 header treeStyle[0..3] */
function areaStyle(trees: TreeStyleData, areaId: number): number {
  if (trees.treeTops?.length) return trees.treeTops[areaId] ?? 0;
  return trees.treeStyle?.[areaId] ?? 0;
}

export function crownStyleFor(x: number, treeType: number, floorY: number, trees: TreeStyleData): number {
  const gs = (id: number) => areaStyle(trees, id);
  switch (treeType) {
    case 0: return 1;   // 23 腐化草
    case 1: {           // 60 丛林草：v[5]==1 → 11；深处 → 13（覆盖）；否则 2
      let st = gs(5) === 1 ? 11 : 2;
      if (floorY > (trees.worldSurface ?? 0)) st = 13;
      return st;
    }
    case 2: {           // 109/492 神圣草：GetHollowTreeFoliageStyle :63026-63036——hallowBG 是建世界背景样式菜单（WorldGen.cs:7391 case 4），本仓无该菜单=默认 0 → 恒 3 与原版默认世界一致（非近似）
      return 3;
    }
    case 3: {           // 147 雪原：完整 case-147 逻辑
      let st = 4;
      const v6 = gs(6);
      if (v6 === 0) { st = 12; if (x % 10 === 0) st = 18; }
      if (v6 === 2 || v6 === 3 || v6 === 32 || v6 === 4 || v6 === 42 || v6 === 5 || v6 === 7) {
        st = v6 % 2 !== 0
          ? (x <= (trees.worldW ?? 0) / 2 ? 17 : 16)
          : (x >= (trees.worldW ?? 0) / 2 ? 17 : 16);
      }
      return st;
    }
    case 4: return 5;   // 199 猩红草
    case 6: return 14;  // 70 蘑菇草
    default: {          // 2/477 普通草：四区 + 0→0/5→10/其余 5+s
      const num = x > (trees.treeX?.[0] ?? 0) ? (x > (trees.treeX?.[1] ?? 0) ? (x > (trees.treeX?.[2] ?? 0) ? gs(3) : gs(2)) : gs(1)) : gs(0);
      if (num === 0) return 0;
      return num === 5 ? 10 : 5 + num;
    }
  }
}

/** 向下扫描树下的草地定生物群系树型（原版 GetCommonTreeFoliageData 扫描）。
 *  返回 treeType（-1 普通草/森林）与发现草地的深度 floorY（丛林深处判定用） */
export function scanTreeType(st: TileStore, x: number, y: number): { type: number; floorY: number } {
  let type = -1;
  let floorY = y;
  for (let i = 0; i < 100; i++) {
    const ty = y + i;
    if (ty >= st.h) break;
    floorY = ty;
    const t = st.type[st.idx(x, ty)];
    if (t === 0) continue;
    if (t === TILE_BY_KEY['grass']) { type = -1; break; }
    const hit = TREE_GROUND.find(([k]) => TILE_BY_KEY[k] === t);
    if (hit) { type = hit[1]; break; }
  }
  return { type, floorY };
}

export interface TreeStyleData {
  treeX: number[];
  treeStyle: number[];
  treeTops?: number[];
  worldSurface?: number;
  worldW?: number;
  rockLevel?: number;
}

/** 634 灰烬树 glowmask 叠画（原版 DrawTrees :8291-8300/:8336-8345：顶 Glow_316 / 枝 Glow_317，
 *  与主贴图同矩形同变换白色彩——须在调用方的 save/restore 内执行） */
function drawTreeGlow(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas,
  sheet: number, anchor: number, sx: number, sy: number, sw: number, sh: number,
  dx: number, dy: number, dw = sw, dh = sh,
): void {
  if (sheet !== 634) return;
  const glow = atlas.ensureVImage(anchor === 0 ? 'vanilla/Glow_316.png' : 'vanilla/Glow_317.png');
  if (!glow || !(glow.width > 0) || glow.width === 0) return;
  if (sx + sw > glow.width || sy + sh > glow.height) return;
  ctx.drawImage(glow, sx, sy, sw, sh, dx, dy, dw, dh);
}

export function drawTreeCell(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas,
  st: TileStore, x: number, y: number, fx: number, fy: number, px: number, py: number,
  sheet = 5,
  foliageOnly = false,
  trees?: TreeStyleData,
  /** 风摆动值（GetWindCycle 树相位钟，WindSway.ts 注入；0=静态，烘焙路径不传）。
   *  偏移/旋转按原版 DrawTrees :8277-8460：树冠 ±2px/0.08rad、树枝 ±0.06rad */
  sway = 0,
  /** 冠样式直覆（tree-inspect 解剖台专用；缺省=原版 crownStyleFor 派生，游戏路径不受影响） */
  crownOverride?: number,
  /** ★IIIII227 四涂装世界：本格油漆 id（WindSway 摆动层/第四遍烘焙外扩遍传入）。
   *  树族大贴图不进烘焙油漆 pass（冠=摆动层逐帧、棕榈干/蘑菇顶=油漆 pass 之后的
   *  第四遍外扩遍）→ 绘制时按源矩形 tintedVanillaRegion 染色（TileTint 共享模块，
   *  applyPaintTint 同一真值）。0=直通（普通世界逐字节原路径,零扰动）。
   *  ★SW-FX12（2026-09-10）：树族 1-12 特判组已接线——冠/枝走 getTreeFoliageSettings
   *  (foliageIndex=冠贴图序号,foliageStyle)（TileDrawing.cs:8280/:8332/:8387/:8445
   *  GetTreeTop/BranchTexture → TilePaintSystemV2.cs:97/:113），棕榈冠 = 15/21 档
   *  (沙型,TreePaintSystemData.cs:339-357)；干身走调用方传入的 trunkSpecial
   *  （GetTileSettings(323,style) 棕榈干档）。13-30 漆不受特判组（函数内守卫）。 */
  paint = 0,
  /** 干身 blit 的特判组设置（棕榈干身第四遍传入 = getTilePaintSettings(323,style)；
   *  普通树干走烘焙油漆 pass 不经本通道）。冠/枝特判在函数内按 crown/palmType 派生，
   *  不吃本参。 */
  trunkSpecial?: LeafPaintSettings,
): void {
  const style = TREE_SHEET_STYLES[sheet] ?? 0;
  // ★IIIII227 油漆源染色直通（paint=0 → 与原 drawImage 逐参数同路径,零扰动）
  const blit = (img: ImageBitmap | HTMLImageElement, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw = sw, dh = sh, special?: LeafPaintSettings): void => {
    if (paint > 0) {
      const t = tintedVanillaRegion(img, sx, sy, sw, sh, paint, false, special);
      if (t) { ctx.drawImage(t, 0, 0, sw, sh, dx, dy, dw, dh); return; }
    }
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  };
  // 棕榈树（tile 323）：树冠帧藏在树干列内（frameX 88-132，无独立标记格）。
  //  TEdit：Tree_Tops_15（80×80、82px 步长），srcX = 变体×82、srcY = 沙型×82，
  //  底部锚定 + X 偏移 frameY/16 格；沙型 = 下方沙块种类（普通0/猩红1/珍珠2/腐化3）
  if (sheet === 323) {
    if (fx >= 88 && fx <= 132) {
      if (!foliageOnly) return; // 树冠/干身全部由外扩遍绘制（倾斜跨列/跨 chunk 防裁剪）
      const img15 = atlas.ensureVImage('vanilla/Tree_Tops_15.png');
      if (!img15) return;
      // 沙型：向下扫沙块
      let palmType = 0;
      for (let i = 0; i < 100; i++) {
        const ty = y + i;
        if (ty >= st.h) break;
        const pi = st.idx(x, ty);
        const t = st.type[pi];
        // ★幽灵保域（2026-09-03）：幽灵残型视同空气继续扫（原版 GetPalmTreeVariant
        // :3519-3543 对消费格查 active()——幽灵沙不得定沙型）
        if (t === 0 || !st.flags[pi]) continue;
        const tk = TILE_DEFS[t]?.key;
        palmType = tk === 'v_234_crimsand_block' ? 1 : tk === 'v_116_pearlsand_block' ? 2
          : tk === 'v_112_ebonsand_block' ? 3 : 0;
        break;
      }
      const v323 = Math.floor((fx - 88) / 22); // 0/1/2 变体（:8407-8419 case 110→1/132→2）
      // 绿洲棕榈（GetPalmTreeVariant :3519-3543：IsPalmOasisTree（:27352 = 海滩带
      // 【外】的棕榈，beachDistance=380 常量）→ biome+4）：Tree_Tops_21（348×392，
      // 帧 114×98、X 步长 116、Y 步长 98、X 偏移 48、Y 偏移 +2，:8421-8434）
      const oasis = x >= 380 && x <= st.w - 380;
      // ★SW-FX12：棕榈冠特判组（GetTreeFoliageSettings(15/21, biome)，TilePaintSystemV2
      //  TreeTopRenderTargetHolder.PrepareShader :97——TryGetTreeTopAndRequestIfNotReady
      //  的 TextureIndex/TextureStyle = 15/21 × GetPalmTreeBiome，TileDrawing :8445）
      const palIdx = oasis ? 21 : 15;
      const palSpecial = paint >= 1 && paint <= 12 ? getTreeFoliageSettings(palIdx, palmType) : undefined;
      if (oasis) {
        const img21 = atlas.ensureVImage('vanilla/Tree_Tops_21.png');
        if (!img21) return;
        const sx21 = v323 * 116, sy21 = palmType * 98;
        if (sx21 + 114 > img21.width || sy21 + 98 > img21.height) return;
        const lean21 = fy >= 32768 ? fy - 65536 : fy;
        if (sway !== 0) {
          const [dx21, dy21, w21, h21] = rectSnap(px - 48 + lean21 + sway * 2, py + TILE + 2 - 98 + Math.abs(sway) * 2, 114, 98);
          ctx.save();
          ctx.translate(dx21 + w21 / 2, dy21 + h21);
          ctx.rotate(sway * 0.08);
          ctx.translate(-(dx21 + w21 / 2), -(dy21 + h21));
          blit(img21, sx21, sy21, 114, 98, dx21, dy21, w21, h21, palSpecial);
          ctx.restore();
        } else {
          blit(img21, sx21, sy21, 114, 98, px - 48 + lean21, py + TILE + 2 - 98, 114, 98, palSpecial);
        }
        return;
      }
      const sx15 = v323 * 82, sy15 = palmType * 82;
      if (sx15 + 80 > img15.width || sy15 + 80 > img15.height) return;
      // 底部锚定居中 + X 偏移 = frameY【像素·有符号】（原版 dest.X += V*zoom/16，
      // zoom=16 即 V 像素；65534 = -2 的 u16 回绕）
      const leanCrown = fy >= 32768 ? fy - 65536 : fy;
      // 风摆（原版 :8423-8457 case 323：off ×2/|×2|、rot 0.08、绕底部中心）
      if (sway !== 0) {
        const [dx15, dy15, w15, h15] = rectSnap(px + (TILE - 80) / 2 + leanCrown + sway * 2, py + TILE - 80 + Math.abs(sway) * 2, 80, 80);
        ctx.save();
        ctx.translate(dx15 + w15 / 2, dy15 + h15);
        ctx.rotate(sway * 0.08);
        ctx.translate(-(dx15 + w15 / 2), -(dy15 + h15));
        blit(img15, sx15, sy15, 80, 80, dx15, dy15, w15, h15, palSpecial);
        ctx.restore();
      } else {
        blit(img15, sx15, sy15, 80, 80,
          px + (TILE - 80) / 2 + leanCrown, py + TILE - 80, 80, 80, palSpecial);
      }
      return;
    }
    // 干身（原版 GetTileDrawData case 323：20×20 顶锚定、X 居中 -2——向下溢出
    // 4px 盖住下方格顶,干底接缝由下溢覆盖;frameY 是**有符号像素偏移**——
    // 棕榈树干随高度倾斜，65534 = -2 的 u16 回绕）
    const img323 = atlas.ensureVImage('vanilla/Tiles_323.png');
    if (!img323 || fx + 20 > img323.width) return;
    const lean = fy >= 32768 ? fy - 65536 : fy; // 原版 vector2.X += frameY
    blit(img323, fx, 0, 20, 20, px - 2 + lean, py, 20, 20, trunkSpecial);
    return;
  }
  // 蘑菇树（tile 72）：独立渲染路径——U≥36 标记帧 = 巨蘑菇顶（Shroom_Tops，60×42、62px 步长、底部锚定）
  if (sheet === 72) {
    if (foliageOnly === false && fx >= 36) return; // 顶格由外扩遍画
    if (fx >= 36) {
      const img72 = atlas.ensureVImage('vanilla/Shroom_Tops.png');
      if (img72 && fx + 60 <= img72.width && fy + 42 <= img72.height) {
        // TEdit：source.X = (V/18)*62；60×42 底部锚定居中
        const sx72 = Math.floor(fy / 18) * 62;
        if (sx72 + 60 <= img72.width) {
          blit(img72, sx72, 0, 60, 42, px + (TILE - 60) / 2, py + TILE - 42, 60, 42);
        }
      }
      return;
    }
    // 干身：Tiles_72 直取（54×54 表，2×2 帧 18px 网格）
    const img72 = atlas.ensureVImage('vanilla/Tiles_72.png');
    if (img72 && fx + 16 <= img72.width && fy + 16 <= img72.height) {
      blit(img72, fx, fy, 16, 16, px, py, TILE, TILE);
    }
    return;
  }
  if (fy >= 198 && fx >= 22) {   // 冠/枝标记帧（原版只看 frameY；fx 22=顶 44/66=枝）
    // ★fx=0 稀有顶变体（1/13，TreePass crownFx :135）不进本块：原版 DrawTrees 门
    // frameX>=22（:8236）——fx=0 走 DrawSingleTile 普通 20×20 帧（:4691-4697
    // tileWidth/Height=20、X 居中 −2）= Tiles_5 (0,fy) 静态灌木小顶。烘焙路径
    // （foliageOnly=false）落入下方干身绘制；摆动层在干身段头部 foliageOnly 早退
    // = 不画不摆（2026-08-19 收齐：曾画静态大冠/误入枝分支）
    if (foliageOnly === false) return;
    // 变体来源 = 标记帧自身 frameY（原版 WorldGen.GetTreeFrame：198→0/220→1/242→2）
    const frame = fy >= 242 ? 2 : fy >= 220 ? 1 : 0;
    // 样式选择（原版 GetCommonTreeFoliageData；树族 tile 用固定样式映射）
    // 树型扫描列：左枝在右侧树干列找地 / 右枝在左侧（原版 xoffset）
    const scanX = x + (fx === 44 ? 1 : fx === 66 ? -1 : 0);
    const scan = scanTreeType(st, scanX, y);
    const crown = crownOverride !== undefined ? crownOverride
      : sheet === 5 && trees
        ? crownStyleFor(scanX, scan.type, scan.floorY, trees)
        : style;
    // ★SW-FX12（2026-09-10）：冠/枝特判组接线（Paint.ts 头注登记债清偿）——原版
    //  GetTreeTopTexture(treeStyle3, 0, color)/GetTreeBranchTexture(treeStyle2, 0, color)
    //  （TileDrawing :8280/:8332/:8387）→ TryGetTreeTop/BranchAndRequestIfNotReady →
    //  TreePaintSystemData.GetTreeFoliageSettings(TextureIndex=冠贴图序号, 0)
    //  （TilePaintSystemV2.cs:97/:113）。foliageIndex = crown（Tree_Tops_{crown}），
    //  foliageStyle 恒 0；灰烬树 634→crown 31 落 DefaultDirt 档 = 原版 default 分支。
    const foliageSpecial = paint >= 1 && paint <= 12 ? getTreeFoliageSettings(crown, 0) : undefined;
    let img: ImageBitmap | HTMLImageElement | null;
    let sx = 0, sy = 0, sw = 0, sh = 0, anchor = 0; // 0=底中(顶) 1=右中(左枝) 2=左中(右枝)
    if (fx === 22) {   // 顶冠（fx=0 已改道干身路径，见块头注释）
      img = atlas.ensureVImage(`vanilla/Tree_Tops_${crown}.png`)
        ?? atlas.ensureVImage(`vanilla/Tree_Tops_${style}.png`) ?? null;
      if (!img) return;
      // 帧尺寸：多数 style=3 帧×(w+2)（PNG 推导同值）；例外按原版出参表
      // （style 3/19 九帧表，见 treeTopSize 注释）
      [sw, sh] = treeTopSize(img, crown);
      // 神圣族变体帧推进（GetCommonTreeFoliageData case 109/492 :63026-63033：
      // 非 style 20 时 i%3==1 → +3 / ==2 → +6——9 帧表用满，非本仓 marker 帧 0-2 独占）
      let frame9 = frame;
      if (crown === 3 && scan.type === 2) {
        if (x % 3 === 1) frame9 += 3;
        else if (x % 3 === 2) frame9 += 6;
      }
      sx = frame9 * (sw + 2); anchor = 0;
    } else {
      // 分叉枝（原版固定 40×40 帧、42px 步长；左枝 X=0 / 右枝 X=42；Y = frame*42）
      img = atlas.ensureVImage(`vanilla/Tree_Branches_${crown}.png`)
        ?? atlas.ensureVImage(`vanilla/Tree_Branches_${style}.png`) ?? null;
      if (!img) return;
      sw = 40; sh = 40;
      sx = fx === 44 ? 0 : 42;
      sy = frame * 42; anchor = fx === 44 ? 1 : 2;
    }
    if (sx + sw > img.width || sy + sh > img.height) return;
    let dx = px, dy = py;
    if (anchor === 0) { dx = px + (TILE - sw) / 2; dy = py + TILE - sh; }
    else if (anchor === 1) { dx = px + TILE - sw; dy = py + (TILE - sh) / 2; }
    else { dy = py + (TILE - sh) / 2; }
    if (sway !== 0) {
      // 原版 DrawTrees 偏移/旋转（:8255-8428）：
      //   顶冠(anchor0)  off=(2s, 2|s|)、rot=0.08s、绕 dest 底中
      //   左枝(anchor1)  offX=(s>0?s:0)+2|s|、rot=0.06s、绕 dest+(40,24)
      //   右枝(anchor2)  offX=(s<0?s:0)-2|s|、rot=0.06s、绕 dest+(0,30)
      let offX = 0, offY = 0, rot = 0, pivOX = 0, pivOY = 0;
      if (anchor === 0) { offX = sway * 2; offY = Math.abs(sway) * 2; rot = sway * 0.08; pivOX = sw / 2; pivOY = sh; }
      else if (anchor === 1) { offX = (sway > 0 ? sway : 0) + Math.abs(sway) * 2; rot = sway * 0.06; pivOX = 40; pivOY = 24; }
      else { offX = (sway < 0 ? sway : 0) - Math.abs(sway) * 2; rot = sway * 0.06; pivOX = 0; pivOY = 30; }
      // ★设备像素吸附（2026-08-18 夜间横缝收官）：offX/offY 带小数 → 冠底边缘
      //   行逐帧落在不同设备像素行（最近邻），夜间剪影下 = 闪烁横缝
      const [rdx, rdy, rw2, rh2] = rectSnap(dx + offX, dy + offY, sw, sh);
      ctx.save();
      ctx.translate(rdx + rw2 / 2, rdy + rh2);
      ctx.rotate(rot);
      ctx.translate(-(rdx + rw2 / 2), -(rdy + rh2));
      blit(img, sx, sy, sw, sh, rdx, rdy, rw2, rh2, foliageSpecial);
      drawTreeGlow(ctx, atlas, sheet, anchor, sx, sy, sw, sh, rdx, rdy, rw2, rh2);
      ctx.restore();
    } else {
      blit(img, sx, sy, sw, sh, dx, dy, sw, sh, foliageSpecial);
      drawTreeGlow(ctx, atlas, sheet, anchor, sx, sy, sw, sh, dx, dy);
    }
    return;
  }
  if (foliageOnly) return; // 外扩遍只画树冠/树枝
  // 树干贴图来源（TileDrawing GetTileDrawData case 5 vs 583-589/596/616/634 实证）：
  // 仅 tile 5 普通树按树下草地生物群系选 Tiles_5_N 变体（frameX += 176*(biome+1)）；
  // 宝石树/装饰树/灰烬树的树干 = 自身 sheet（Tiles_596 等），不查生物群系——
  // 此前一律套 Tiles_5(_N) 致樱花树长出普通树干（用户标注）
  const img = sheet === 5
    ? (() => {
        // TEdit baseX 奇偶修正（特殊帧横向偏一列扫草地）+ 100 格深扫描
        let baseX = 0;
        if (fx === 66 && fy <= 45) baseX++;
        if (fx === 88 && fy >= 66 && fy <= 110) baseX--;
        if (fx === 22 && fy >= 132 && fy < 198) baseX--;
        if (fx === 44 && fy >= 132 && fy < 198) baseX++;
        const type = scanTreeType(st, x + baseX, y).type;
        return type >= 0
          ? atlas.ensureVImage(`vanilla/Tiles_5_${type}.png`) ?? atlas.ensureVImage('vanilla/Tiles_5.png')
          : atlas.ensureVImage('vanilla/Tiles_5.png');
      })()
    : atlas.ensureVImage(`vanilla/Tiles_${sheet}.png`);
  if (!img) return;
  if (fx + 20 <= img.width && fy + 20 <= img.height) {
    // 原版 GetTileDrawData case 5(:4688-4694)+ DrawBasicTile(:1019-1025):
    // 20×20 精灵**顶锚定**、X 居中 -2((20-16)/2)——向下溢出 4px 压住下方格顶,
    // 干底与草块的接缝由下溢覆盖。此前按测量美术高度底锚定,整体上移 4px,
    // 干底停在格边界 → wld 导入出现透明接缝(用户标注)
    blit(img, fx, fy, 20, 20, px - 2, py, 20, 20);
  }
}

/** 仙人掌渲染（tile 80，移植 TEdit WorldRenderXna 5467-5706）：
 *  wld 不存仙人掌帧——按邻接关系现场判定角色并取 Tiles_80（18px 网格）对应帧：
 *  - 列高比较：相邻列更高 → 本列是手臂（左臂 X=3 / 右臂 X=2；顶端 X=6）
 *  - 主干：顶格 Y=0（含手臂连接位 X=1/4/5），身格 (0,1)
 *  - 生物群系变体：向下扫 100 格沙类 → Evil/Good/Crimson_Cactus 独立贴图 */
/** 仙人掌生物群系贴图（向下扫沙类：腐化/猩红/神圣 → 独立变体贴图）。
 *  扫描带 baseX 偏移（TEdit 同款）：手臂格朝主干列方向扫——手臂列自身下方
 *  可能没有沙（如浮空装饰/黑檀石地基），直下扫会漏判 */
export function cactusTextureFor(atlas: SpriteAtlas, st: TileStore, x: number, y: number): ImageBitmap | HTMLImageElement | null {
  let img = atlas.ensureVImage('vanilla/Tiles_80.png');
  // 角色判定：与 cactusFrameAt 同一列高比较 → 决定扫描列偏移
  // ★幽灵保域（2026-09-03）：幽灵残型不算仙人掌/不算沙（cactusFrameAt 同款 flags 门）
  const isC = (ax: number, ay: number) =>
    st.inBounds(ax, ay) && !!st.flags[st.idx(ax, ay)] && st.type[st.idx(ax, ay)] === TILE_BY_KEY['v_80_cactus'];
  let top = y;
  while (isC(x, top - 1)) top--;
  const colH = (ax: number) => { let n = 0; while (isC(ax, top + n)) n++; return n; };
  const hSelf = colH(x), hR = colH(x + 1), hL = colH(x - 1);
  const baseX = hR > hSelf ? 1 : hL > hSelf ? -1 : 0; // 左臂扫 x+1 / 右臂扫 x-1 / 主干扫 x
  const ebonsand = TILE_BY_KEY['v_112_ebonsand_block'] ?? -1;
  const crimsand = TILE_BY_KEY['v_234_crimsand_block'] ?? -1;
  const pearlsand = TILE_BY_KEY['v_116_pearlsand_block'] ?? -1;
  for (let i = 0; i < 100 && y + i < st.h; i++) {
    const si2 = st.idx(x + baseX, y + i);
    const t = st.type[si2];
    if (t === 0 || !st.flags[si2]) continue;   // ★幽灵残型视同空气继续扫
    if (t === ebonsand) { img = atlas.ensureVImage('vanilla/Evil_Cactus.png') ?? img; break; }
    if (t === crimsand) { img = atlas.ensureVImage('vanilla/Crimson_Cactus.png') ?? img; break; }
    if (t === pearlsand) { img = atlas.ensureVImage('vanilla/Good_Cactus.png') ?? img; break; }
  }
  return img ?? null;
}

/** 仙人掌实际渲染帧——原版 WorldGen.CactusFrame(1456 :56354-56560)1:1。
 *  基列搜索:自 (x,y) 下行,列尽时向更长的邻臂列平移;num3 = x - 基列 ∈ {-1,0,1}。
 *  返回帧列/行(帧坐标 = col*18 / row*18;与原版 frameX ∈ {0,18,36,54,72,90,108}、
 *  frameY ∈ {0,18,36} 一致) */
export function cactusFrameAt(st: TileStore, x: number, y: number, type: number): { col: number; row: number } {
  const isC = (ax: number, ay: number) =>
    st.inBounds(ax, ay) && !!st.flags[st.idx(ax, ay)] && st.type[st.idx(ax, ay)] === type;
  // 基列搜索(:56362-56389)
  let num = y, num2 = x;
  while (isC(num2, num)) {
    num++;
    if (!st.inBounds(num2, num)) return { col: 0, row: 0 };
    if (!isC(num2, num)) {
      // 列尽:邻臂列在同深且其上一格也是仙人掌 → 基列平移到臂列
      if (isC(num2 - 1, num) && isC(num2 - 1, num - 1) && num2 >= x) num2--;
      if (isC(num2 + 1, num) && isC(num2 + 1, num - 1) && num2 <= x) num2++;
    }
  }
  num--;
  const num3 = x - num2;
  // 八邻类型(:56391-56427;inactive → -1;上方 227 视同仙人掌——原版原文如此)
  const tAt = (ax: number, ay: number): number => {
    if (!st.inBounds(ax, ay) || !st.flags[st.idx(ax, ay)]) return -1;
    return st.type[st.idx(ax, ay)];
  };
  const CACT = type;
  let num4 = tAt(x - 2, y), num5 = tAt(x - 1, y), num6 = tAt(x + 1, y);
  let num7 = tAt(x, y - 1), num8 = tAt(x, y + 1);
  const num9 = tAt(x - 1, y + 1), num10 = tAt(x + 1, y + 1);
  if (num7 !== -1 && TILE_DEFS[num7]?.vanilla?.sheet === 227) num7 = CACT;
  const solidT = (t: number) => t >= 0 && !!TILE_DEFS[t]?.solid;
  let fx = 0, fy = 0;
  switch (num3) {
    case 0:  // 主干列
      if (num7 !== CACT) {
        if (num5 === CACT && num6 === CACT && num9 !== CACT && num10 !== CACT && num4 !== CACT) { fx = 90; fy = 0; }
        else if (num5 === CACT && num9 !== CACT && num4 !== CACT) { fx = 72; fy = 0; }
        else if (num6 === CACT && num10 !== CACT) { fx = 18; fy = 0; }
        else { fx = 0; fy = 0; }
      } else {
        if (num5 === CACT && num6 === CACT && num9 !== CACT && num10 !== CACT && num4 !== CACT) { fx = 90; fy = 36; }
        else if (num5 === CACT && num9 !== CACT && num4 !== CACT) { fx = 72; fy = 36; }
        else if (num6 === CACT && num10 !== CACT) { fx = 18; fy = 36; }
        else if (num8 >= 0 && solidT(num8)) { fx = 0; fy = 36; }
        else { fx = 0; fy = 18; }
      }
      break;
    case -1:  // 西臂(基列在东侧)
      if (num6 === CACT) {
        if (num7 !== CACT && num8 !== CACT) { fx = 108; fy = 36; }
        else if (num8 !== CACT) { fx = 54; fy = 36; }
        else if (num7 !== CACT) { fx = 54; fy = 0; }
        else { fx = 54; fy = 18; }
      } else if (num7 !== CACT) { fx = 54; fy = 0; }
      else { fx = 54; fy = 18; }
      break;
    case 1:   // 东臂(基列在西侧)
      if (num5 === CACT) {
        if (num7 !== CACT && num8 !== CACT) { fx = 108; fy = 18; }
        else if (num8 !== CACT) { fx = 36; fy = 36; }
        else if (num7 !== CACT) { fx = 36; fy = 0; }
        else { fx = 36; fy = 18; }
      } else if (num7 !== CACT) { fx = 36; fy = 0; }
      else { fx = 36; fy = 18; }
      break;
  }
  void num4;
  return { col: fx / 18, row: fy / 18 };
}

export function drawCactusCell(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas,
  st: TileStore, x: number, y: number, type: number, px: number, py: number,
): void {
  const { col: ux, row: uy } = cactusFrameAt(st, x, y, type);
  // 生物群系变体:向下扫沙类(腐化/猩红/神圣)→ 拆行等价的独立贴图
  const img = cactusTextureFor(atlas, st, x, y);
  if (!img) return;
  // 原版 GetTileDrawData case 80(:5083-5085)：源 16×16、tileTop +2（插入沙面 2px）。
  // ★跨 chunk 溢出带由 ChunkCache 烘焙侧「上一行重画」补绘（bakeChunkBody 第 1.5 遍）：
  //  本格底部 2px（源帧 rows14-15）画在 y*16+16..+18，chunk 末行（y%16=15）被烘焙
  //  clip 裁掉且下 chunk 无人补 → 主干每跨一条 chunk 边界断 2px（2026-08-27 用户实报
  //  FTW V2 导入图仙人掌断缝，缝精确落在 chunk 边界）。2026-08-21 旧补丁在本格
  //  py+14 画帧 rows16-17 系双重误诊：rows16-17 是 18px 网格透明 padding（贴图逐像素
  //  实测仅 col0 部分帧有渗出描边，≠ 下格 rows0-1），且画在缝的错误一侧——实测反而把
  //  rows12-13 覆盖成 padding 渗出的描边色垃圾，已删。
  if (ux * 18 + 16 <= img.width && uy * 18 + 16 <= img.height) {
    ctx.drawImage(img, ux * 18, uy * 18, 16, 16, px, py + 2, TILE, TILE);
  }
}

/** 圣诞树单格绘制（TileDrawing.DrawXmasTree :3699-3799 逐格切片等价）。
 *  本体 = Tiles_171（≡ Xmas_0，16px 紧排 4×8 网格）；装饰层按锚点 frameY
 *  位段解码，变体在装饰贴图内 66px 步长、串灯 130px×帧号（4 帧循环，
 *  Main.cs:18609-18618 counter>16 推进）。*/
function drawXmasTreeCell(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas,
  st: TileStore, x: number, y: number, px: number, py: number,
): void {
  const cell = xmasCell(st, x, y);
  if (!cell) return;
  const { ax, ay, col, row } = cell;
  const body = atlas.ensureVImage('vanilla/Tiles_171.png');
  if (body && (body.width > 0) && body.width > 0
    && col * 16 + 16 <= body.width && row * 16 + 16 <= body.height) {
    ctx.drawImage(body, col * 16, row * 16, 16, 16, px, py, TILE, TILE);
  }
  // 装饰层（:3774-3797：topper=slot0 Xmas_3 / garland=slot1 Xmas_1 /
  // bulbs=slot2 Xmas_2 / lights=slot3 Xmas_4；变体号-1 取 0 基）
  const slots: Array<[number, string]> = [
    [0, 'vanilla/Xmas_3.png'],
    [1, 'vanilla/Xmas_1.png'],
    [2, 'vanilla/Xmas_2.png'],
    [3, 'vanilla/Xmas_4.png'],
  ];
  for (const [obj, tex] of slots) {
    const style = xmasDecorStyle(st, ax, ay, obj);
    if (style <= 0) continue;
    const img = atlas.ensureVImage(tex);
    if (!img || !(img.width > 0) || img.width === 0) continue;
    const vx = (style - 1) * 66 + col * 16;
    let vy = row * 16;
    // 串灯帧行：Main.cs AnimateTiles case 171 counter>16 → period17、frame>3 回卷
    // （17t/4f）——sheet 171 本体静态已从 TILE_ANIM_RATE 移除，此处自算解耦
    if (obj === 3) vy += (Math.floor(tileAnim.tick / 17) % 4) * 130;
    if (vx + 16 <= img.width && vy + 16 <= img.height) {
      ctx.drawImage(img, vx, vy, 16, 16, px, py, TILE, TILE);
    }
  }
}

/** 矿车轨道格绘制（TileDrawing.DrawTile_MinecartTrack :3823-3857 1:1）。
 *  frameX = 前轨连接 ID、frameY = 后轨连接 ID（0xFFFF = -1 无后轨）。
 *  层序：后轨 → 前轨 → 下行装饰(36/37, 画在下一格) → 挡板(39 普通 / 38 弹性, 画在上一格)。
 *  加速轨道（type 2）随 boosterAnimFrame() 滚动帧行（Main.cs:18734-18741） */
function drawMinecartTrackCell(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas,
  x: number, y: number, px: number, py: number, fx: number, fy: number,
): void {
  const back = fy === 0xFFFF ? -1 : fy;
  const front = fx >= 40 ? 0 : fx;
  const anim = boosterAnimFrame();
  const draw = (frameID: number, ox: number, oy: number): void => {
    const s = sourceRectOf(frameID, anim);
    if (!s) return;
    const r = atlas.vrect(314, s.sx, s.sy, 16, 16);
    if (r) ctx.drawImage(r.img, r.sx, r.sy, 16, 16, px + ox, py + oy, TILE, TILE);
  };
  if (back >= 0) draw(back, 0, 0);
  draw(front, 0, 0);
  if (back >= 0 && drawLeftDecoration(back)) draw(DECOR_LEFT_DOWN, 0, TILE);
  if (drawLeftDecoration(front)) draw(DECOR_LEFT_DOWN, 0, TILE);
  if (back >= 0 && drawRightDecoration(back)) draw(DECOR_RIGHT_DOWN, 0, TILE);
  if (drawRightDecoration(front)) draw(DECOR_RIGHT_DOWN, 0, TILE);
  if (drawBumper(front)) draw(DECOR_REGULAR_BUMPER, 0, -TILE);
  else if (drawBouncyBumper(front)) draw(DECOR_BOUNCY_BUMPER, 0, -TILE);
  void x; void y;
}

/** 绘制一格原版图块。 *  auto：现场算帧；style：显式 18px 帧偏移。
 *  重要修正：wld 里多格家具每格 frameX 往往全 0（不是 0/18 交错），
 *  直接用存储帧会让 2 格宽家具两格都画锚点帧（重复左侧贴图）。
 *  style 模式改为：若本格帧偏移为 0，向左/上扫描同类同物体格子，
 *  按到锚点的格距重算帧偏移（锚点=左侧或上方最近格） */
export function drawVanillaCell(  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas,
  sheet: number, frame: 'auto' | 'style' | 'blend', fw: number, fh: number,
  st: TileStore, x: number, y: number, type: number,
  same: (t: number) => boolean, px: number, py: number, fx: number, fy: number,
  trees?: TreeStyleData,
  // ★SW-BJ17 2026-09-07：宝箱开/关盖姿态（0 关/1 半开/2 全开）——来源
  //  chestLidPoseAt（Game.updateChestFrames 驱动 ChestData.frame，Chest.cs:3599-3657）
  chestPose = 0,
): void {
  // ★自研像素方块(F11 图片导入,原版无):RGB 编码在 frameX/frameY——
  // fx = ((r||1)<<8)|(g||1)、fy = (b||1)。纯色+斜面直画,不取素材表;
  // 空邻边缘加深描边呈现"方块"质感。实心 framed → 可镐挖/进存档/联机上报全走既有链路。
  const PIX = TILE_BY_KEY['pixel_block'];
  if (PIX !== undefined && type === PIX) { drawPixelBlock(ctx, st, x, y, fx, fy, px, py); return; }
  // 751/752(睡着的掘地龟/啮龙蛋):仅锚点帧 (0,0) 绘制,非锚点格整格跳过(:1034-1048)
  // ---- 吊挂火盆（tile 592，Hanging Brazier）专用切片 ----
  // 原版：TileDrawing.cs:5585-5587 addFrY = Main.tileFrame[592]*54；素材是
  // 宽 36px（两列 fx∈{0,18}）的紧凑竖条——每 style 组「火焰(顶)/吊链/盆体」
  // 按 18px 网格排布、纵向以 54px 为一个动画帧距共 8 帧。通用多格路径会请求
  // 越出图宽的大矩形 → vframeAt 落空回退 (0,0)＝整物第一格（火焰尖）平铺，
  // 盆体永不采样（用户实报"一团火悬浮"根因）。此处按原版语义逐格 18px 切片：
  //   src = (frameX, min(frameY + idx*54, H-18), 18, 18)
  if (sheet === 592) {
    const img2 = atlas.ensureVImage('vanilla/Tiles_592.png');
    if (img2) {
      const idx = animFrameIdx(592, 24 * 18);          // 与 ChunkCache 重烘登记同拍
      const syB = Math.min(fy + idx * 54, 432 - 18);
      const tDef592 = TILE_DEFS[type];
      const topShift = (tDef592 && (tDef592 as unknown as { tileTop?: number }).tileTop) ?? 0;
      ctx.drawImage(img2, fx === 0 ? 0 : 18, syB, 18, 18,
        px, py - topShift, 18, 18);
      return;
    }
    // 图未就绪→落回通用路径（瞬态自愈）
  }
  if ((sheet === 751 || sheet === 752) && (fx !== 0 || fy !== 0)) return;
  // 矿车轨道（tile 314）：frameX/frameY = 前/后轨【连接 ID】（0-35，非 18px 像素偏移！）。
  // 后轨先画、前轨后画；下行装饰画在下一格、挡板画在上一格（TileDrawing.cs:3823-3857）
  if (sheet === 314) { drawMinecartTrackCell(ctx, atlas, x, y, px, py, fx, fy); return; }
  // 树木族（tile 5 + 宝石树 583-589 + 装饰树 596/616 + 灰烬树 634 + 棕榈 323 + 蘑菇树 72）：
  // 树冠/树枝标记帧 + 生物群系树干（TEdit 同一套逻辑）。
  // 棕榈干身 frameY 是倾斜偏移（跨列）——主遍跳过，整棵由树族外扩遍绘制防裁剪
  if (frame === 'style' && (TREE_SHEET_STYLES[sheet] !== undefined || sheet === 323)) {
    if (sheet !== 323) drawTreeCell(ctx, atlas, st, x, y, fx, fy, px, py, sheet, false, trees);
    return;
  }
  // 仙人掌（tile 80）：wld 无帧，按邻接现场分帧 + 生物群系变体
  if (sheet === 80 && frame === 'style') {
    drawCactusCell(ctx, atlas, st, x, y, type, px, py);
    return;
  }
  // 圣诞树（tile 171）：整树 64×128 = 16px 紧排网格（Tiles_171 ≡ Xmas_0 逐字节相同），
  // 不是常规 18px 步长——通用 style 采样会逐列漂 2px。装饰层按锚点 frameY 位段
  // 解码（TileDrawing.DrawXmasTree :3699-3799）：Xmas_3 树顶饰 / Xmas_1 花环 /
  // Xmas_2 彩球 / Xmas_4 串灯（变体 66px 步长、串灯行 130×帧号动画）。
  // 逐格画本格切片（col/row 由 xmasCell 归一），无跨 chunk 裁剪问题
  if (sheet === 171 && frame === 'style') {
    drawXmasTreeCell(ctx, atlas, st, x, y, px, py);
    return;
  }
  // ★vanilla-exact 分帧(TileFrameCosmetic 全链移植):auto/blend 两近似路径的统一替代。
  // 链只产出帧 (fx,fy)+r;后续坡面切条/半砖切片/衔接帧/drawAdjust/vectorOffset 全走
  // 与 auto 路径共享的下方原版对齐尾部(斜坡/半砖的形状是绘制层切出来的,帧是普通合并帧)。
  // 未命中(越表/链未定)回落下方既有近似路径。
  let vfFrame: { r: DrawRect; fx: number; fy: number } | null = null;
  if ((frame === 'auto' || frame === 'blend') && SW_VANILLA_FRAMING) {
    vfFrame = vanillaChainFrame(atlas, sheet, st, x, y, type, trees);
  }
  // blend 类（泥土/石族/草族/沙/泥/雪）：TEdit BlendRules 移植
  // （掩码位序：E=0x1 N=0x10 W=0x100 S=0x1000；角 TR/TL/BL/BR <<16）
  // ★链已产出帧时跳过(vf 命中格不再走 TEdit 近似)
  if (vfFrame === null && frame === 'blend') {
    const myMeta = atlas.vmeta(sheet);
    const myMerge = myMeta?.mergeWith ?? null;
    const myStone = !!myMeta?.isStone;
    const nMeta = (t: number) => {
      const d = TILE_DEFS[t];
      return d?.vanilla ? atlas.vmeta(d.vanilla.sheet) : null;
    };
    // Merges() 链（TEdit TileProperty.Merges）：对方 mergeWith 指向我 / 我指向对方 / 双方同指
    const merges = (ot: number) => {
      if (ot === type) return true;
      const om = nMeta(ot);
      if (!om) return false;
      const oid = TILE_DEFS[ot]?.vanilla?.sheet ?? -1;
      if (om.mergeWith != null && om.mergeWith === sheet) return true;
      if (myMerge != null && myMerge === oid) return true;
      if (myMerge != null && om.mergeWith != null && myMerge === om.mergeWith) return true;
      return false;
    };
    const dirs: Array<[number, number, number]> = [
      [1, 0, 0x1], [0, -1, 0x10], [-1, 0, 0x100], [0, 1, 0x1000],          // E N W S
      [1, -1, 0x10000], [-1, -1, 0x100000], [-1, 1, 0x1000000], [1, 1, 0x10000000], // NE NW SW SE
    ];
    // 原版 BlockStyle 双向连通门控（Framing.cs:92-98 + SelfFrame8Way:199-316）：
    // 半砖/坡面按 blockStyleLookup 断开对应方向——half 断上；slope1 断上/右；
    // slope2 断上/左；slope3 断下/右；slope4 断下/左。中心与邻居两侧都要放行
    //（中心 own edge && 邻居 opposite edge；角落需相邻两条边同时放行）。
    // edge mask: bit0=up bit1=down bit2=left bit3=right（blockType 0-5，half=1 slope1-4=2-5）
    const BLOCK_STYLE = [0b1111, 0b1110, 0b0110, 0b1010, 0b0101, 0b1001];
    const edgesOf = (ii: number): number => {
      const b = st.half[ii] ? 1 : (st.slope[ii] >= 1 && st.slope[ii] <= 4 ? st.slope[ii] + 1 : 0);
      return BLOCK_STYLE[b];
    };
    const cE = edgesOf(st.idx(x, y));
    // 方向 (dx,dy) 连通 = 中心各分量 edge && 邻居各反向 edge。
    // 角方向额外要求两个正交邻居的交叉边（SelfFrame8Way:269-316 Clear() 语义：
    // 正交方向未连通时其 BlockStyle 被 Clear → 角检查随之失败）
    const DIR_EDGE: Array<[number, number]> = [
      [0b1000, 0b0100], // E: 中心 right / 邻居 left
      [0b0001, 0b0010], // N: 中心 up / 邻居 down
      [0b0100, 0b1000], // W: 中心 left / 邻居 right
      [0b0010, 0b0001], // S: 中心 down / 邻居 up
      [0b1001, 0b0110], // NE: 中心 up|right / 对角 left|down
      [0b0101, 0b1010], // NW: 中心 up|left / 对角 right|down
      [0b0110, 0b1001], // SW: 中心 down|left / 对角 up|right
      [0b1010, 0b0101], // SE: 中心 down|right / 对角 up|left
    ];
    // 角方向的正交邻居交叉边：[旁格坐标, 所需 edge]
    const CORNER_CROSS: Array<Array<[number, number, number]>> = [
      [], [],
      [], [],
      [[1, 0, 0b0101], [0, -1, 0b1010]],  // NE: E 邻 left|top, N 邻 down|right
      [[-1, 0, 0b1001], [0, -1, 0b0110]], // NW: W 邻 right|top, N 邻 down|left
      [[-1, 0, 0b1010], [0, 1, 0b0101]],  // SW: W 邻 right|down, S 邻 up|left
      [[1, 0, 0b0110], [0, 1, 0b1001]],   // SE: E 邻 left|down, S 邻 up|right
    ];
    const edgeOK = (ax: number, ay: number, need: number): boolean =>
      st.inBounds(ax, ay) && (edgesOf(st.idx(ax, ay)) & need) === need;
    let same = 0, mergeMask = 0;
    for (let di = 0; di < dirs.length; di++) {
      const [dx, dy, bit] = dirs[di];
      const [cNeed, nNeed] = DIR_EDGE[di];
      const ax = x + dx, ay = y + dy;
      if (!st.inBounds(ax, ay)) continue;
      const oi = st.idx(ax, ay);
      const ot = st.type[oi];
      // ★幽灵保域（2026-09-03）：幽灵残型视同空气（原版合并邻查 active() 门;
      // 链引擎 VanillaFraming 已门,此处为链未命中的 TEdit 近似回落路径同语义）
      if (ot === 0 || !st.flags[oi]) continue;
      // 中心或邻居任一侧 BlockStyle 断边 → 该方向不连通（不算 same/merge）
      if ((cE & cNeed) !== cNeed || (edgesOf(oi) & nNeed) !== nNeed) continue;
      // 角方向:两个正交邻居的交叉边也要放行
      if (di >= 4) {
        let ok = true;
        for (const [cdx, cdy, need] of CORNER_CROSS[di]) {
          if (!edgeOK(x + cdx, y + cdy, need)) { ok = false; break; }
        }
        if (!ok) continue;
      }
      const om = nMeta(ot);
      // 同型：石族按 isStone 互认，其余走 Merges 链；跨类型并上原版合并家族
      // (TileMergeFamily:地牢砖↔沙等同 tileBrick 家族按已连接取帧——否则边缘帧
      //  圆角透明像素在群系交界透出远景背景亮光,2026-08-20 用户实报根因)
      // 正交四向再过半砖邻接覆写(WorldGen.cs:82398-82426:上邻半砖强制连/整砖配
      // 异型半砖断/半砖配半砖任意型连/下邻半砖恒断)——原版在家族链之后覆写
      const chainOK = (myStone ? !!om?.isStone : merges(ot)) || frameMergesWith(type, ot);
      const gateOK = di >= 4 || halfNeighborConnects(
        (['R', 'U', 'L', 'D'] as const)[di],
        !!st.half[st.idx(x, y)], normalizedVidOf(type),
        !!st.half[oi], vanillaIdOf(ot), !!TILE_DEFS[ot]?.platform, true);
      if (chainOK && gateOK) same |= bit;
      // 合并位：邻居是 mergeWith 目标
      if (myMerge != null && (TILE_DEFS[ot]?.vanilla?.sheet ?? -1) === myMerge && gateOK) mergeMask |= bit;
    }
    const strictness = myMeta?.isGrass ? 2 : myMerge != null ? 1 : 0;
    // 注:2026-08-20 曾按 WorldGen.cs:82957-83093(flag7 草族表前四开侧分支)在
    // 此拦截帧选择、未列组合回退 (1,1) 内帧——用户实报"草地贴图全错了":
    // (1,1) 是埋土草帧(土棕底+绿斑,Tiles_2 逐像素实证),地表草行的草顶帧
    // (18-54,0) 在反编译链中的来源无法可靠追溯(分支 C 存在同文死码,证明
    // 该反编译帧表不可全信)。已整体回退,草渲染恢复 TEdit grassRules 既有
    // 行为;水|草交界漏光另行定位(勿再走"回退内帧"路线)。
    const variant = ((x * 7) + (y * 11)) % 3;
    const uv = getUVForMasks(same, mergeMask, strictness, variant);
    const r = atlas.vframe(sheet, uv.col, uv.row);
    if (r) {
      const si = st.idx(x, y);
      const slope = st.slope[si];
      const half = !!st.half[si];
      if (half && slope === 0) {
        // ★SW-BJ3 2026-09-06：半砖拍 1:1 重对（TileDrawing.cs:1016/:1022/:1653-1666）
        //  ——旧实现源 r.sy+8（帧下半）系上下半颠倒：对实心块丢顶面棱线；对平台
        //  材质（素材 plank 在帧上半 8px,下半全透明）→ 半砖平台整格隐形（物理仍在,
        //  用户可见"站空气"）。抽公共 helper（auto/共享尾两条同体分支合并防漂移）。
        drawHalfBrickCell(ctx, r, st, x, y, st.type[si], px, py);
      } else if (slope > 0 && !half) {
        // 坡面门控:421/422 专属坡帧整帧画;DontDrawTileSlopes 跳过切条走整帧
        if (HAS_SLOPE_FRAMES.has(sheet)) {
          ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, px, py, r.sw, r.sh);
        } else if (!DONT_DRAW_SLOPES.has(sheet)) {
          drawSlopedFrame(ctx, r, slope, px, py);
        } else {
          ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, px, py, TILE, TILE);
        }
      } else {
        // D1:左右邻半砖 → 预制衔接帧替代整帧(:1609-1652)
        if (drawHalfBrickSeam(ctx, r, st, x, y, sheet, px, py)) return;
        ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, px, py, TILE, TILE);
      }
      return;
    }
    const fb = atlas.vframe(sheet, 1, 1);
    if (fb) ctx.drawImage(fb.img, fb.sx, fb.sy, fb.sw, fb.sh, px, py, TILE, TILE);
    return;
  }
  let r: DrawRect | null = null;
  if (vfFrame) {
    // 链帧汇入共享尾部:后续坡面/半砖/衔接/drawAdjust 与 auto 路径完全同一体
    r = vfFrame.r;
    fx = vfFrame.fx;
    fy = vfFrame.fy;
    // 动画块叠加与 auto 分支同款(瀑布族 326/327/345/458/459:addFrY=帧序×90)
    if (TILE_ANIM_RATE[sheet]) {
      // 405 壁炉：frameX≥54 列静止（TileDrawing.cs:5524 门）；406 烟囱：带折算
      // （cs:5448-5462）——offset 后须钳制在素材界内，防止“播到透明区”整块消失
      // （2026-08-28 用户双帧实拍：烟囱周期性整体隐形）

      let extra = sheet === 405 ? fireplaceAddFrY(fx)
        : sheet === 406 ? chimneyAddFrY(fy)
        : sheet === 272 ? cogAddFrY(x, y)
        : animYOffset(sheet, (atlas.vmeta(sheet)?.rows ?? 0) * 18);
      const imgh = (atlas.vmeta(sheet)?.rows ?? 0) * 18;
      const reqExtra = extra;
      let clampMask = 0;
      if (imgh > 0 && r.sy + extra + r.sh > imgh) { extra = 0; clampMask |= 1; }   // 出界回退第 0 带
      if (extra < -(r.sy)) { extra = 0; clampMask |= 2; }                          // 负向越界同理
      cap.noteDraw('vf', sheet, x, y, fx, fy, r.sx, r.sy, r.sw, r.sh,
        reqExtra, extra, clampMask, vImgW(atlas, sheet), imgh);
      r = { ...r, sy: r.sy + extra };
    }
  } else if (frame === 'auto') {
    r = frameFor(atlas, sheet, st, x, y, type, same);
    // 动画 'auto' 块（瀑布族 326/327/345/458/459：Main.cs:18743-18793 8 帧回卷、
    // TileDrawing.cs:6085-6094 addFrY=frame*90）——TEdit 8 向帧取自首带,动画帧
    // = sy + 帧序×90。与 style 分支的 animYOffset 叠加语义一致（ChunkCache 已按
    // TILE_ANIM_RATE 登记重烘焙）
    if (r && TILE_ANIM_RATE[sheet]) {

      let extra = sheet === 405 ? fireplaceAddFrY(fx)
        : sheet === 406 ? chimneyAddFrY(fy)
        : sheet === 272 ? cogAddFrY(x, y)
        : animYOffset(sheet, (atlas.vmeta(sheet)?.rows ?? 0) * 18);
      const imgh = (atlas.vmeta(sheet)?.rows ?? 0) * 18;
      const reqExtra = extra;
      let clampMask = 0;
      if (imgh > 0 && r.sy + extra + r.sh > imgh) { extra = 0; clampMask |= 1; }
      if (extra < -(r.sy)) { extra = 0; clampMask |= 2; }
      cap.noteDraw('auto', sheet, x, y, fx, fy, r.sx, r.sy, r.sw, r.sh,
        reqExtra, extra, clampMask, vImgW(atlas, sheet), imgh);
      r = { ...r, sy: r.sy + extra };
    }
  } else if (vfFrame === null) {
    // 重建帧偏移：只针对帧数据全 0 的残缺物体（wld 部分家具）。
    // 邻居必须同样存 (0,0) 才视为同物体的待重建格——已带 18px 偏移的邻居
    // 一定是相邻物体的格子（如并排宝箱的 (18,0)），必须挡住扫描。
    // ★扫描到整段同类零帧 run 的【左/上边界】再按 fw/fh 模数切块（2026-08-17）：
    // run 左/上边界必是某物体的物体左/上边缘，(边界距离 % fw)*18 对相邻并排
    // 零帧物体（沙漠石堆 187 连排/地牢相邻陈设）逐格精确。旧实现扫描截断在
    // fw-1（ax=min(k,fw-1)），第 4 格起 ofx 恒 36 → 连排右列碎片重复=贴图错位
    let ofx = fx, ofy = fy;
    if (ofx === 0 && ofy === 0 && (fw > 1 || fh > 1)) {
      let ax = 0;
      for (let k = 1; k <= 256; k++) {
        if (!st.inBounds(x - k, y)) break;
        const li = st.idx(x - k, y);
        // ★幽灵保域（2026-09-03）：幽灵残型（零帧但 flags=0）不并进同物体 run
        if (st.flags[li] && st.type[li] === type && st.frameX[li] === 0 && st.frameY[li] === 0) ax = k;
        else break;
      }
      ofx = (ax % fw) * 18;
      let ay = 0;
      for (let k = 1; k <= 256; k++) {
        if (!st.inBounds(x, y - k)) break;
        const ui2 = st.idx(x, y - k);
        if (st.flags[ui2] && st.type[ui2] === type && st.frameX[ui2] === 0 && st.frameY[ui2] === 0) ay = k;
        else break;
      }
      ofy = (ay % fh) * 18;
    }
    // 灯族 93 样式折列（TileDrawing.cs:6518-6522 case 93 1:1）：存储帧=raw style*54
    // （Place1xX cs:39226 不折,可越 2048 表底）——`num70=frameY/1998`（1998=37 带×54）
    // → addFrY-=1998*n / addFrX+=36*n（折到第 n 列:每列 2 个 18px 竖带=灭/亮档,
    // Tiles_93 70×2048 实测内容列 0-15/18-33/36-51/54-69）。★必须在零帧重建门
    // （ofx===0&&ofy===0）之后折:预折会把 fy≥1998 的帧变 ofy=0 触发重建误扫描
    if (sheet === 93) {
      const wrapN = Math.floor(ofy / 1998);
      ofy -= 1998 * wrapN;
      ofx += 36 * wrapN;
    }
    // ★IIIII182（N5）：音乐盒 139 虚拟页折列（TileDrawing.cs:5093-5097 case 139 1:1）：
    //   wld 帧空间=style*36 无界（skyblock style87 = fy 3132/3150 越 2016 表底），
    //   绘制端 `num5=frameY/2016; addFrY-=2016*num5; addFrX+=72*num5` 折页。表只有
    //   4×56 盒,页 n 折到第 n+0/n+1 盒列（72px=2 盒）。与 finalize 帧净化 139 豁免
    //   （WorldGen.ts）同批——不折则 vframeAt 落空回退 (0,0)=整物第一格平铺。
    if (sheet === 139) {
      const pageNum = Math.floor(ofy / 2016);
      ofy -= 2016 * pageNum;
      ofx += 72 * pageNum;
    }
    // 旧版素材表【分带布局】兼容：wld 帧按新游戏单行布局存储（样式全部横排一行），
    // 而素材包里的表较窄、样式分多带排列（一行放不下就换到下一带）。
    // 样式索引超出一带容量 → 换带重算（如 Tiles_187：带宽 35 样式×54px，
    // 样式 52 头骨 wld 帧 (2808,0) → 实际 (52%35)*54=918, y+36）。
    // 带 = 物体占格宽×步长；带高 = 物体占格高×步长
    const meta = atlas.vmeta(sheet);
    if (meta && fw > 0) {
      const imgW = atlas.ensureVImage(meta.sheet)?.width ?? 0;
      if (imgW > 0 && ofx + meta.grid[0] > imgW) {
        const objW = fw * meta.stride[0];
        const bandH = (fh || 1) * meta.stride[1];
        const colsPerBand = Math.floor(imgW / objW);
        if (colsPerBand > 0) {
          const styleIdx = Math.floor(ofx / objW);
          if (styleIdx >= colsPerBand) {
            ofx = (styleIdx % colsPerBand) * objW + (ofx % objW);
            ofy += Math.floor(styleIdx / colsPerBand) * bandH;
          }
        }
      }
    }
    // 动画家具帧带偏移（原版 GetTileDrawData addFrY = tileFrame[type]*pitch，
    // Main.cs:18868-18874：355 镜像 354，8 帧回卷）——★必须在零帧重建与分带
    // 换算【之后】叠加：预加进 fy 会让重建门 (ofx===0&&ofy===0) 失效，零帧
    // 多格物体（dgWr 系放置/存量存档）整物塌成重复碎片。215 篝火与 207 喷泉
    // 例外：帧偏移由 ChunkCache 预加（campfireYOffset/fountainYOffset——两族
    // 均有"带 0 静止态门/相位"专属语义），勿在此重复叠加
    const reconBaseOfy = ofy;
    let reconExtra = 0;
    if (sheet !== 215 && sheet !== 207 && !(sheet === 405 && fx >= 54)) {
      // ★406 烟囱走 chimneyAddFrY（带折算 56 步距）——此前 recon 路径漏接，
      //   会叠加 animYOffset 默认 pitch 的错误偏移再与 drawAdjust 尾部二次相加
      reconExtra = sheet === 405 ? fireplaceAddFrY(fx)
        : sheet === 406 ? chimneyAddFrY(fy)
        : sheet === 272 ? cogAddFrY(x, y)   // ★272 经相位 helper，勿进通用偏移
        : animYOffset(sheet, (atlas.vmeta(sheet)?.rows ?? 0) * 18);
      ofy += reconExtra;
    }
    // 标准 18px stride 像素偏移直取（宝箱 Tiles_21 也是标准网格：
    // 样式横向排列 36px/个，closed 状态占前 2 行，下面是开启动画帧）
    // ★SW-BJ17 2026-09-07：宝箱开/关盖姿态带位移（TileDrawing.cs CacheSpecialDraws_
    //  Part2 :4340-4347 addFrY = frame×38,frame∈{0,1,2}——Tiles_21/467 三姿态竖带
    //  带距 38px：关 Y0-35 / 半开 Y38-73 / 全开 Y76-111,PNG 高 114 实证；BasicChest
    //  集 = TileID.cs:315 CreateBoolSet(21,467)）。对四格源 Y 一致平移（vanilla 对
    //  每格 drawData.addFrY 同值）。★必须在零帧重建门与分带换算之后叠加（预加会
    //  破坏 (ofx===0&&ofy===0) 重建扫描与 ofx 带折——同 animYOffset 预加禁令同源）
    if (chestPose > 0 && chestPoseSheet(sheet)) ofy += chestPose * 38;
    r = atlas.vframeAt(sheet, ofx, ofy);
    let reconFb = false;
    if (!r) { reconFb = true; r = atlas.vframeAt(sheet, 0, 0); }   // ★落空回退(0,0)="整物第一格平铺"指纹
    if (TILE_ANIM_RATE[sheet] || sheet === 405 || reconExtra !== 0 || reconFb) {
      const rm = atlas.vmeta(sheet);
      cap.noteDraw('recon', sheet, x, y, fx, fy, ofx, reconBaseOfy,
        rm?.grid[0] ?? 18, rm?.grid[1] ?? 18,
        reconExtra, reconExtra, reconFb ? 16 : 0, vImgW(atlas, sheet), (rm?.rows ?? 0) * 18);
    }
  }
  if (!r) {
    // 取帧双落空:img 加载中(瞬态,onVImageLoaded→重烘焙自愈,**不告警**)或
    // 永久缺失(vmeta 无 / img 加载失败)→ warn-once。此前瞬态也 warn,启动期
    // 懒加载未就绪刷一屏噪音(sheet 4/62/69/74 等常见块)
    const vFile = `vanilla/Tiles_${sheet}.png`;
    const transient = !atlas.vmeta(sheet) ? false
      : !atlas.vImageFailed(vFile) && !atlas.ensureVImage(vFile);
    if (!transient && !SRC_OOB_WARNED.has(`n${sheet}`)) {
      SRC_OOB_WARNED.add(`n${sheet}`);
      console.warn(`[VanillaTiler] sheet ${sheet} 取帧失败(永久): 帧(${fx},${fy})` +
        ` img=${atlas.ensureVImage(vFile) ? '已载' : (atlas.vImageFailed(vFile) ? '加载失败' : '未载')} vmeta=${atlas.vmeta(sheet) ? '有' : '无'}`);
    }
    return;
  }
  // tileTop(GetTileDrawData 权威,静态表 + 条件项)与 C 类手动偏移
  const cond = tileTopCond(sheet, fx, fy);
  let dyOff = cond !== null ? cond : (DRAW_Y_OFFSET[sheet] ?? 0);
  // 火把（tile 4）：上方实心 = 天花板火把 tileTop=4 下移(:4727-4730)
  if (sheet === 4 && st.inBounds(x, y - 1) && st.isSolid(x, y - 1)) dyOff += 4;
  // 518 悬挂火盆:tileTop 按本格水位动态上移(:4648-4675;无水时看下方格半砖/坡再补)
  if (sheet === 518) {
    const si518 = st.idx(x, y);
    let num28 = Math.floor(st.liquid[si518] / 16) - 3;
    const aboveFull = st.inBounds(x, y - 1) && (() => {
      const j = st.idx(x, y - 1);
      return !!st.flags[j] && !!TILE_DEFS[st.type[j]]?.solid && !st.half[j] && st.slope[j] === 0;
    })();
    if (aboveFull && num28 > 8) num28 = 8;
    if (st.liquid[si518] === 0 && st.inBounds(x, y + 1)) {
      const bj = st.idx(x, y + 1);
      if (st.flags[bj]) {
        if (st.half[bj]) num28 = -16 + Math.max(8, Math.floor(st.liquid[bj] / 16));
        else if (st.slope[bj] === 1 || st.slope[bj] === 2) num28 -= 4;
      }
    }
    dyOff -= num28;
  }

  // ---- 小动物笼族（TileID.Sets.CritterCageLidStyle ≥ 0 的 64 张 + 360 金蝴蝶笼）：
  //      动画帧行 + 首行格 CageTop 顶盖/本体下移 8px，详见 render/CritterCage.ts
  //      （TileDrawing.cs:5730-5974 帧带 / :1670-1716 顶盖段 1:1）。
  //      笼族非实心恒无坡面/半砖，先于坡面分支接管 ----
  const cageFam = cageFamilyOf(sheet);
  if (cageFam) {
    drawCageCell(ctx, atlas, cageFam, r, x, y, fx, fy, px, py, dyOff, r.img.height);
    return;
  }

  // ---- 坡面/半砖分支(原版 TileDrawing.cs:1314-1361) ----
  const si = st.idx(x, y);
  const slope = st.slope[si];
  const half = !!st.half[si];
  // 原版锚定公式(:1019-1025):X = x*16-(tileWidth-16)/2(711 豁免)、Y = y*16+tileTop
  // ——顶锚定,高>16 的精灵向下溢出盖住下格顶(接缝合拢)。此前的底锚定
  // (py+16-sh)整体上移 sh-16,是家具/植物悬浮与树干接缝的共同根因
  const dpx = px - (sheet === 711 ? 0 : (r.sw - TILE) / 2);
  const dpy = py + dyOff;
  if (half && slope === 0) {
    // ★SW-BJ3 2026-09-06：同 auto 路径半砖拍 1:1 重对（详见 drawHalfBrickCell 注）
    drawHalfBrickCell(ctx, r, st, x, y, st.type[si], dpx, dpy);
    return;
  }
  if (slope > 0 && !half) {
    // 平台坡面(TileDrawing.cs:1537-1575)1:1:整帧 + 下对角「原版实心」时
    // 背后层连接补片(slope1→右下 198/324、slope2→左下 162/306;下对角为
    // 平平台 → 换连接帧码)。★实心域 = 原版 Main.tileSolid(平台族在内!)——
    // 本仓 solid 域平台=false,曾漏画「楼梯接平平台走道」的 324/306 补片。
    // 抑制支(:1551/:1565):正下方为 BlocksStairs 族 {386,387,54,328,459,541}
    // 且 blockType∈{0,5}(整块/坡4) → 不补;echo 涂层(invisibleBlock)按
    // shouldShowInvisibleBlocks=false 语义排除。平台不走切条(原版在切条前 return)
    if (TILE_DEFS[st.type[si]]?.platform) {
      ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, dpx, dpy, r.sw, r.sh);
      // :1541/:1566 原版「下方格」三连门：active && 非echo && blockType∈{0,5|4} && BlocksStairs
      // ★SW-BJ3 2026-09-06：blockType 档两支不同——slope1 支（:1551）`!=0 && !=5`
      //  （whole/slope4 抑制）、slope2 支（:1565）`!=0 && !=4`（whole/slope3 抑制,
      //  blockType():slope()+1,Tile.cs:204-214）。旧实现两支共用 {0,5} →
      //  slope2 平台下邻 slope3 格漏抑制（多画一片补片）。
      const belowSuppresses = (): boolean => {
        if (!st.inBounds(x, y + 1)) return false;
        const bi = st.idx(x, y + 1);
        if (!st.flags[bi]) return false;
        if (st.coat[bi] & TileStore.COAT_INVISIBLE_BLOCK) return false;   // invisibleBlock 显示模式关
        const bt = st.slope[bi] > 0 ? st.slope[bi] + 1 : st.half[bi] ? 1 : 0;   // Tile.blockType()
        if (slope === 1 ? bt !== 0 && bt !== 5 : bt !== 0 && bt !== 4) return false;
        const bs = TILE_DEFS[st.type[bi]]?.vanilla?.sheet;
        return bs !== undefined && BLOCKS_STAIRS_SHEETS.has(bs);
      };
      // :1545/:1569 原版「下对角格」门：active && 非echo && 原版实心 && 对向坡非 && 非半砖
      const diagOK = (dx2: number): boolean => {
        if (!st.inBounds(x + dx2, y + 1)) return false;
        const j = st.idx(x + dx2, y + 1);
        if (!st.flags[j]) return false;
        if (st.coat[j] & TileStore.COAT_INVISIBLE_BLOCK) return false;
        const dj = TILE_DEFS[st.type[j]];
        if (!(dj && (dj.solid || dj.platform))) return false;   // Main.tileSolid 原版域
        if (st.slope[j] === (dx2 > 0 ? 2 : 1) || st.half[j]) return false;
        return !belowSuppresses();                              // :1551/:1565 抑制支
      };
      if (slope === 1 && diagOK(1)) {
        const j = st.idx(x + 1, y + 1);
        const flat = TILE_DEFS[st.type[j]]?.platform && st.slope[j] === 0;
        const fx2 = flat ? 324 : 198;
        if (fx2 + 16 <= r.img.width && r.sy + 16 <= r.img.height) {
          ctx.drawImage(r.img, fx2, r.sy, 16, 16, dpx, dpy + 16, 16, 16);
        }
      } else if (slope === 2 && diagOK(-1)) {
        const j = st.idx(x - 1, y + 1);
        const flat = TILE_DEFS[st.type[j]]?.platform && st.slope[j] === 0;
        const fx2 = flat ? 306 : 162;
        if (fx2 + 16 <= r.img.width && r.sy + 16 <= r.img.height) {
          ctx.drawImage(r.img, fx2, r.sy, 16, 16, dpx, dpy + 16, 16, 16);
        }
      }
      return;
    }
    // 坡面门控:421/422 专属坡帧整帧画;DontDrawTileSlopes 跳过切条走整帧
    if (HAS_SLOPE_FRAMES.has(sheet)) {
      ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, dpx, dpy, r.sw, r.sh);
    } else if (!DONT_DRAW_SLOPES.has(sheet)) {
      drawSlopedFrame(ctx, r, slope, dpx, dpy);
    } else {
      ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, dpx, dpy, r.sw, r.sh);
    }
    return;
  }
  // D1:整砖实心且左右邻半砖 → 预制衔接帧替代整帧(TileDrawing.cs:1609-1652)
  if (drawHalfBrickSeam(ctx, r, st, x, y, sheet, dpx, dpy)) return;
  // 帧源/尺寸调整(tileWidth/Height 覆写 + addFrX/Y 帧重排)
  const adj = drawAdjust(sheet, fx, fy, x, y, r.img.width, r.img.height, st, st.w);
  const asx = adj.sx ?? r.sx, asy = adj.sy ?? r.sy;
  const asw = adj.sw ?? r.sw, ash = adj.sh ?? r.sh;
  if (asx < 0 || asy < 0 || asx + asw > r.img.width || asy + ash > r.img.height) {
    // 源矩形越界:静默 return 曾让 id 空间碰撞 bug(物品 case 错抄进 drawAdjust,
    // sheet 28 陶罐被劫持)潜伏数日,表现为神秘空格。此处 warn-once 暴露同类问题。
    const bk = `b${sheet}:${asx},${asy},${asw}x${ash}`;
    if (!SRC_OOB_WARNED.has(bk)) {
      SRC_OOB_WARNED.add(bk);
      console.warn(`[VanillaTiler] 源矩形越界,该格不绘制(每键仅一次): sheet ${sheet} ` +
        `帧(${fx},${fy}) → 调整后(${asx},${asy} ${asw}x${ash}) > 表 ${r.img.width}x${r.img.height}`);
    }
    cap.noteTail(sheet, x, y, fx, fy, r.sy, asy, adj.sy !== undefined, true,
      r.img.width, r.img.height);   // ★2026-08-30:静默跳过必须现形(烟囱悬案盲区教训)
    return;
  }
  if (TILE_ANIM_RATE[sheet] || sheet === 405 || sheet === 406) {
    cap.noteTail(sheet, x, y, fx, fy, r.sy, asy, adj.sy !== undefined, false,
      r.img.width, r.img.height);
  }
  // 尺寸覆写后重新居中(711 豁免)
  const fdx = px - (sheet === 711 ? 0 : (asw - TILE) / 2);
  // C 类手动偏移(DrawSingleTile :1032-1186)
  const [vx, vy] = vectorOffset(sheet, fx, fy, slope);
  // ★BJ118① 水晶碎块质感层（TileDrawing.cs:1101-1118 + :1276-1293 净效果）:
  //   基底 α100 全亮 + 大簇 4 向彩虹辉光——接管常规尾画（129 不在 FLIP_X_EVEN/
  //   无坡/无半砖,早退安全）
  if (sheet === 129) {
    drawShardCell(ctx, r, asx, asy, fdx + vx, dpy + vy, x, y, fx);
    void fw; void fh;
    return;
  }
  // X 镜像(植物/藤蔓变体:x%2==0 翻转)
  if (FLIP_X_EVEN.has(sheet) && x % 2 === 0) {
    ctx.save();
    ctx.translate(fdx + vx + asw, dpy + vy);
    ctx.scale(-1, 1);
    ctx.drawImage(r.img, asx, asy, asw, ash, 0, 0, asw, ash);
    ctx.restore();
  } else {
    ctx.drawImage(r.img, asx, asy, asw, ash, fdx + vx, dpy + vy, asw, ash);
  }
  void fw; void fh;
}

/**
 * 坡面切条绘制(原版 TileDrawing.cs:1328-1360 1:1):非独立贴图帧,同帧错位采样。
 * slope1(左高右低)/2(右高左低):8 条 2px 竖条,每条从帧顶部取高 14-2i,
 * 目标 y 逐条下移 2i;补底部 16×2 整条。
 * slope3(左低右高)/4(右低左高):8 条 2px 竖条,源行偏移 2i(取帧中段),
 * 目标 y=0;补顶部 16×2 整条。
 */
function drawSlopedFrame(ctx: CanvasRenderingContext2D, r: { img: ImageBitmap | HTMLImageElement | HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number }, slope: number, px: number, py: number): void {
  const fx = r.sx, fy = r.sy;
  for (let i = 0; i < 8; i++) {
    let num19: number; // 源X/目标X
    let num17: number; // 条高
    let num18: number; // 源行偏移
    let num16: number; // 目标Y附加偏移
    if (slope === 1) { num16 = 0; num19 = i * 2; num17 = 14 - i * 2; num18 = 0; }
    else if (slope === 2) { num16 = 0; num19 = 16 - i * 2 - 2; num17 = 14 - i * 2; num18 = 0; }
    else if (slope === 3) { num16 = i * -2; num19 = i * 2; num17 = 16 - i * 2; num18 = 16 - num17; }
    else { num16 = i * -2; num19 = 16 - i * 2 - 2; num17 = 16 - i * 2; num18 = 16 - num17; }
    const dstY = i * 2 + num16;
    // 源矩形越界保护（HTMLImageElement/HTMLCanvasElement 均有 .width/.height）
    if (fx + num19 + 2 > r.img.width || fy + num18 + num17 > r.img.height) continue;
    ctx.drawImage(r.img, fx + num19, fy + num18, 2, num17, px + num19, py + dstY, 2, num17);
  }
  // 补条:slope 1/2 在底部 y=14,slope 3/4 在顶部 y=0
  const padY = slope <= 2 ? 14 : 0;
  if (fy + padY + 2 <= r.img.height) {
    ctx.drawImage(r.img, fx, fy + padY, 16, 2, px, py + padY, 16, 2);
  }
}

/** 原版 GetTileDrawData tileTop 权威表（TileDrawing.cs 巨型 switch 逐条提取；未列出 = 0）。
 *  2026-08-12 接缝审计换源:旧表取自 TileObjectData.DrawYOffset——该字段原版只用于
 *  放置预览虚影(TileObject.cs:911),世界渲染唯一权威是 GetTileDrawData 的 tileTop;
 *  两表大量重合但不等同(旧表 16 项多余、3 项值错、条件项全部缺失),已全量换血。
 *  227 仙人掌走 drawCactusCell 专属路径不在此表;518 按水位动态偏移未移植(备案)。 */
/** 有效绘制 y 位移（tileTopCond 优先、静态表兜底,与 drawVanillaCell 内部同式）——
 *  ChunkCache 底缝补绘门用：上一 chunk 末行 tile 若本值 >0,其绘制会下溢进本
 *  chunk 首行,而画布 clip 把溢出裁掉 ⇒ 本 chunk 须按 py=-TILE 重画补带 */
export function tileDrawYOffsetOf(sheet: number, fx: number, fy: number): number {
  const cond = tileTopCond(sheet, fx, fy);
  return cond !== null ? cond : (DRAW_Y_OFFSET[sheet] ?? 0);
}

/** tileTop 合一取值（动态层设备对齐用，2026-09-01 缝修复）：cond 优先、表兜底——
 *  与 drawVanillaCell 内部 `dyOff = cond !== null ? cond : (DRAW_Y_OFFSET[sheet] ?? 0)`
 *  完全同源。调用方（drawAnimatedTileLayer dev 包装）用它把格的【画稿 dest 盒】
 *  （= 格盒整体平移 dyOff）的上下边界在设备空间取整——相邻格共享边 =
 *  round(同一表达式) 恒等，消除 tileTop+缩放产生的分数边缘各自取整的 1px 缝。 */
export function tileTopOf(sheet: number, fx: number, fy: number): number {
  const cond = tileTopCond(sheet, fx, fy);
  return cond !== null ? cond : (DRAW_Y_OFFSET[sheet] ?? 0);
}

/** ★IIIII252：箱盖姿态消费面单源（与下方 :1438 附近 `sheet===21||sheet===467`
 *  位移消费同点集——BasicChest 集 TileID.cs:315 CreateBoolSet(21,467)）。
 *  chestLidPoseAt 是 O(chests) 全表线性查；两处烘焙调用面（ChunkCache 逐格 /
 *  TileShine.stampShineCell 逐 shine 格）曾对【全部】格急切求值——真实长龄世界
 *  数千箱 × 每格扫描 = 烘焙成本放大器（冰雪域数百 shine 格/chunk 最烈,用户
 *  trace TileShine 烘焙链 5.8s/49s）。非消费面格必须零成本短路（0=关盖,与
 *  查无登记同语义,产物逐位不变）。 */
export function chestPoseSheet(sheet: number): boolean {
  return sheet === 21 || sheet === 467;
}

/** ★SW-BJ17 2026-09-07：宝箱开/关盖姿态解析（TileDrawing.cs CacheSpecialDraws_Part2
 *  :4321-4341 1:1）。BasicChest 集（TileID.cs:315 CreateBoolSet(21,467)）的格按
 *  「frameX%36≠0 → 左退一格 / frameY%36≠0 → 上退一格」归一 2×2 锚点（:4324-4330）,
 *  再按 Chest.FindChest(锚点) 查 Main.chest[i].frame（本仓 = world.chests 命中格的
 *  frame 字段,由 Game.updateChestFrames 驱动,0 关/1 半开/2 全开）。查无箱登记
 *  （wld 缺箱数据/装饰箱未登记）→ 0 = 不位移（vanilla `_chestPositions[key] != -1`
 *  门 :4335 同语义）。纯函数：烘焙（ChunkCache）与动态层共用同一解析。 */
export function chestLidPoseAt(
  chests: Array<{ x: number; y: number; frame?: number }> | undefined,
  x: number, y: number, fx: number, fy: number,
): number {
  if (!chests || chests.length === 0) return 0;
  const ax = (fx % 36 !== 0) ? x - 1 : x;   // :4325-4327
  const ay = (fy % 36 !== 0) ? y - 1 : y;   // :4328-4330
  for (const c of chests) {
    if (c.x === ax && c.y === ay) return c.frame ?? 0;   // Chest.FindChest 锚点匹配
  }
  return 0;
}

export const DRAW_Y_OFFSET: Record<number, number> = {
  // ★12(生命水晶)/31(暗影球) 曾误标 +4：原版 36px 动画组（TileDrawing.cs :5524-5529
  //   case 12/31/96/639/665/696）只设 addFrY、tileTop 恒 0（DrawBasicTile 锚 y*16+0）——
  //   +4 遇 ChunkCache 256 无外扩裁剪 → 球骑 chunk 边界时中线裂 4px 缝（2026-08-13 实测）
  33: -4, 49: -4, 52: -2, 62: -2, 73: -12, 74: -12, 78: 2, 81: -8, 82: -2, 83: -2, 84: -2,
  85: 2, 89: 2, 100: 2, 102: 2, 105: 2, 113: -12, 115: -2, 132: 2, 133: 2, 134: 2, 135: 2,
  139: 2, 142: 2, 143: 2, 174: -4, 186: 2, 187: 2, 205: -2, 207: 2, 210: 2, 215: 2, 217: 2,
  218: 2, 219: 2, 220: 2, 228: 2, 231: 2, 243: 2, 244: 2, 247: 2, 254: 2, 275: 2, 282: 2,
  283: 2, 285: 2, 300: 2, 301: 2, 302: 2, 303: 2, 304: 2, 305: 2, 306: 2, 307: 2, 308: 2,
  330: 2, 331: 2, 332: 2, 333: 2, 336: 2, 340: 2, 341: 2, 342: 2, 343: 2, 344: 2, 349: 2,
  354: 2, 355: 2, 372: -4, 377: 2, 378: 2, 382: -2, 412: 2, 428: 4, 455: 2, 457: 2, 463: 2,
  464: 2, 466: 2, 470: 2, 475: 2, 485: 2, 489: 2, 490: 2, 491: 2, 493: 2, 494: 2, 499: 2,
  505: 2, 506: 2, 519: 2, 520: 2, 521: 2, 522: 2, 523: 2, 524: 2, 525: 2, 526: 2, 527: 2,
  528: -2, 529: -14, 530: 2, 543: 2, 547: 2, 548: 2, 552: 2, 560: 2, 564: 2, 565: 2, 568: 2,
  561: -2, 569: 2, 570: 2, 571: 2, 579: -2, 593: 2, 594: 2, 597: 2, 598: 2, 613: 2, 614: 2, 617: 2,
  621: 2, 622: 2, 624: 2, 636: -2, 638: -2, 646: -4, 654: 2,
  // ★656/701(Glow Tulip) :5170-5172 tileTop -= 16 ⇒ 恒 −16(2026-08-28 review 勘误:
  //   曾误改 +2——提取器正则只认 `tileTop =` 漏掉复合赋值 `-=`;579 同款勘误见下)
  656: -16, 700: 2, 701: -16, 705: 2,
  // ---- 2026-08-28 全量对账补遗（GetTileDrawData :4580-6100 逐 case 机械对账）：
  //      补 27 项静态 tileTop 缺失（均经 :5xxx 原文逐条直验为 `tileTop = N` 平赋值）
  // ★579(Rock Golem Head) :5174-5182 tileTop -= 2 ⇒ 恒 −2（review 勘误：曾误翻 +2）
  28: 2, 36: 2, 173: 2, 233: 2, 238: 2, 324: -2, 480: 2, 509: 2, 623: 2, 642: 2,
  647: 2, 648: 2, 649: 2, 650: 2, 651: 2, 652: 2, 653: 2, 657: 2, 658: 2, 699: 2,
  706: 2, 720: 2, 721: 2, 725: 2, 733: 2, 752: 2, 753: 2,
  // ---- 小动物笼族 93 张（GetTileDrawData 笼族四段全设 tileTop=2：大笼组 :5746、
  //      小笼组 :5873、罐缸 water 组 :5929-5989、水母 small 组 :5994）。
  //      旧表只收 275/285 两张——配套 CritterCage.ts 的顶盖/帧行动画 ----
  276: 2, 277: 2, 278: 2, 279: 2, 280: 2, 281: 2, 286: 2, 288: 2, 289: 2, 290: 2, 291: 2,
  292: 2, 293: 2, 294: 2, 295: 2, 296: 2, 297: 2, 298: 2, 299: 2,
  309: 2, 310: 2, 316: 2, 317: 2, 318: 2, 339: 2, 358: 2, 359: 2, 360: 2, 361: 2, 362: 2,
  363: 2, 364: 2, 391: 2, 392: 2, 393: 2, 394: 2, 413: 2, 414: 2, 532: 2, 533: 2, 538: 2,
  542: 2, 544: 2, 550: 2, 551: 2, 553: 2, 554: 2, 555: 2, 556: 2, 558: 2, 559: 2, 580: 2,
  582: 2, 599: 2, 600: 2, 601: 2, 602: 2, 603: 2, 604: 2, 605: 2, 606: 2, 607: 2, 608: 2,
  609: 2, 610: 2, 611: 2, 612: 2, 619: 2, 620: 2, 629: 2, 632: 2, 640: 2, 643: 2, 644: 2,
  645: 2, 710: 2,
};

/** 条件型 tileTop（按帧变化,GetTileDrawData 原文条件;返回 null = 走静态表） */
function tileTopCond(sheet: number, fx: number, fy: number): number | null {
  switch (sheet) {
    case 136: return fx === 0 ? 2 : 0;                                       // :4637-4642
    case 443: return fx / 36 >= 2 ? -2 : 2;                                  // :4612-4621
    case 81: return fx === 0 ? -6 : -8;   // :4979-4983 tileTop=2 + :5367 -=8 ⇒ fx==0 −6(2026-08-28 对账补)
    case 567: return fy === 0 ? -2 : 0;                                      // :5203-5206
    case 388: case 389: return (fy === 0 || fy === 94) ? -2 : 0;             // :5106-5119
    // ★185/186/187:tileTop 恒 2(:5218-5236 自成一块,内含 187 分带换算)——
    //  曾误读 C# fallthrough 方向塞进 184 的帧条件档(fy 条件只属 184:
    //  :5288-5292 fy≤36→+2/fy≤108→−2/余+2),fy∈(36,108] 样式曾错取 −2px
    case 184: return fy <= 36 ? 2 : fy <= 108 ? -2 : 2;                     // :5288-5292
    case 185: case 186: case 187: return 2;                                 // :5219 恒 2
    case 442: { const c = Math.floor(fx / 22); return c === 1 ? -4 : (c === 2 || c === 3) ? -2 : 0; } // :5704-5720
    case 178: return fy <= 36 ? 2 : 0;
    case 227: return fx === 238 ? -6 : -20;                                  // :5121-5131(染料植物/大仙人掌)
    default: return null;
  }
}

/** 火苗/叠画层的 tileTop 取值：与 drawVanillaCell 本体绘制同源（静态表 + 条件项 +
 *  火把天花板 +4）。供 TileFlames 等动态叠画对齐本体——原版 DrawSingleTile_Flames
 *  的目标位 = y*16 + drawData.tileTop（TileDrawing.cs:2718-2727），不重算会错位。 */
export function flameTileTop(sheet: number, st: TileStore, x: number, y: number, fx: number, fy: number): number {
  const cond = tileTopCond(sheet, fx, fy);
  let off = cond !== null ? cond : (DRAW_Y_OFFSET[sheet] ?? 0);
  // 火把（tile 4）：上方实心 = 天花板火把 tileTop=4 下移(:4727-4730)
  if (sheet === 4 && st.inBounds(x, y - 1) && st.isSolid(x, y - 1)) off += 4;
  return off;
}

/** C 类手动偏移(DrawSingleTile 第二段 switch,:1032-1186;blockType→slope 映射:bt2=slope1/bt3=slope2/bt4=slope3/bt5=slope4) */
function vectorOffset(sheet: number, fx: number, fy: number, slope: number): [number, number] {
  switch (sheet) {
    case 726: {   // :1069-1088:X 基础 -2;按 blockType 再 ±6/±2
      if (slope === 1) return [4, 2];   // bt2: -2+6, +2
      if (slope === 2) return [-8, 2];  // bt3: -2-6, +2
      if (slope === 3) return [4, 0];   // bt4: -2+6, 0
      if (slope === 4) return [-8, 0];  // bt5: -2-6, 0
      return [-2, 0];
    }
    case 129: return fy === 0 ? [0, 2] : fy < 36 ? [0, -2] : fy === 36 ? [2, 0] : [-2, 0]; // :1104-1121
    case 723: case 724: {  // :1122-1139
      const c = Math.floor(fx / 18);
      return c === 0 ? [0, 2] : c === 1 ? [0, -2] : c === 2 ? [-2, 0] : [2, 0];
    }
    case 751: return [11, -8];           // :1034-1041(锚点帧;非锚点帧原版跳过绘制,未移植)
    case 752: return [8, 0];             // :1042-1048(同上)
    case 136: { const c = Math.floor(fx / 18); return c === 1 ? [-2, 0] : c === 2 ? [2, 0] : [0, 0]; } // :1049-1059
    case 442: return Math.floor(fx / 22) === 3 ? [2, 0] : [0, 0];       // :1060-1068
    default: return [0, 0];
  }
}

/** 自研像素方块绘制:16×16 纯色 + 斜面(顶亮 18%/底暗 18%)+ 空邻边描边(-35%),
 *  复刻原版方块的光影质感(顶受光/底背光/悬空边缘显轮廓)。RGB 解码:
 *  r = fx>>8、g = fx&255、b = fy&255(写入端 ||1 防 0,0) */
function drawPixelBlock(
  ctx: CanvasRenderingContext2D, st: TileStore, x: number, y: number,
  fx: number, fy: number, px: number, py: number,
): void {
  const r = fx >> 8, g = fx & 255, b = fy & 255;
  const shade = (f: number) => `rgb(${Math.min(255, Math.round(r * f))},${Math.min(255, Math.round(g * f))},${Math.min(255, Math.round(b * f))})`;
  ctx.fillStyle = shade(1);
  ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = shade(1.18);                       // 顶受光带
  ctx.fillRect(px, py, TILE, 3);
  ctx.fillStyle = shade(0.82);                       // 底背光带
  ctx.fillRect(px, py + TILE - 3, TILE, 3);
  // 空邻边缘描边(左/右/上/下,有邻块则融合不描)
  ctx.fillStyle = shade(0.65);
  const emptyAt = (dx: number, dy: number) => !st.inBounds(x + dx, y + dy) || !st.flags[st.idx(x + dx, y + dy)];
  if (emptyAt(-1, 0)) ctx.fillRect(px, py, 1, TILE);
  if (emptyAt(1, 0)) ctx.fillRect(px + TILE - 1, py, 1, TILE);
  if (emptyAt(0, -1)) ctx.fillRect(px, py, TILE, 1);
  if (emptyAt(0, 1)) ctx.fillRect(px, py + TILE - 1, TILE, 1);
}

/** 坡面/邻接特判 Set(TileID.cs 原文) */
const DONT_DRAW_SLOPES = new Set([137, 235, 388, 476, 138, 664, 665, 630, 631, 711, 712, 713, 714, 715, 716, 723, 726]);
const HAS_SLOPE_FRAMES = new Set([421, 422]);
/** TileID.Sets.BlocksStairs（TileID.cs:357）——平台坡面连接补片的抑制族
 *  （TileDrawing.cs:1551/:1565：正下方为该族整块(blockType 0)/坡4(5) 时不补） */
const BLOCKS_STAIRS_SHEETS = new Set([386, 387, 54, 328, 459, 541]);
// ★SW-BJ3 2026-09-06：原版 tileSolid+tileSolidTop【双 true】sheet 全集（Main.cs:8031-8032
//  tile 19 / :9797-9800 tile 239 / :9799-9800 tile 380 / :10118-10119 tile 427 /
//  :10125-10130 循环 435-439——SW-RB2 B-3 定谳同表）。半砖 D2 支撑谓词原版读
//  _tileSolid[below.type]（TileDrawing.cs:1653）,平台族在内=「半砖压平台」算有支撑;
//  本仓 solid=参与碰撞域（≈tileSolid&&!solidTop）不含平台,渲染侧用本表补臂
// （Game.ts POUNDABLE_SOLID_TOP_SHEETS 为逻辑侧同值表,渲染层不 import 核心层,单源复制）
const VANILLA_TS_DOUBLE_TRUE = new Set([19, 427, 435, 436, 437, 438, 439, 239, 380]);
// ★SW-BJ3：TileID.Sets.Platforms（TileID.cs:243）——D2 平台支门用原版窄域
// （本仓 def.platform 旗是含 239/380 的单向门超集,239/380 半砖原版吃暗条支）
// ★BJ182b 收编单源 data/tiles.ts:PLATFORMS_SHEETS(sheet 域;逐值对拍全等,tests/tile-domain-sentinel §6d)
const VANILLA_PLATFORM_SHEETS = PLATFORMS_SHEETS;
const IGNORES_NEARBY_HALFBRICK = new Set([380, 476, 235, 138, 664, 137, 484, 421, 422, 711, 712, 713, 714, 715, 716]);
const NOT_REALLY_SOLID = new Set([387, 388, 10]);
const SMOOTH_BORDER = new Set([321, 157, 208, 159, 190, 80, 251, 202, 229, 56, 38, 39, 152, 118, 151, 148, 206, 119, 175, 46, 176, 45, 140, 347, 370, 121, 122, 680, 681, 682, 685, 686, 346, 687, 688, 689, 690, 691, 692, 160, 226, 54, 156, 155, 153, 154, 150, 250, 198, 273, 274, 325, 284, 348, 385, 327, 326, 345, 328, 329, 357, 369, 268, 261, 262, 255, 267, 260, 265, 258, 266, 259, 264, 257, 263, 256, 311, 426, 430, 431, 432, 433, 434, 727, 728, 729, 730, 731, 732, 272, 145, 146, 350, 127, 472, 473, 477, 478, 479, 492, 496, 507, 508, 563, 618, 708, 722, 735, 748]);

/** X 镜像翻转(GetTileDrawData:x % 2 == 0 → FlipHorizontally,植物/藤蔓变体的原版来源) */
const FLIP_X_EVEN = new Set([3, 20, 24, 52, 61, 62, 71, 73, 74, 81, 82, 83, 84, 110, 113, 115, 201, 205, 227, 270, 271, 324, 382, 519, 528, 529, 567, 571, 572, 581, 590, 595, 615, 624, 636, 638, 656, 660, 700, 701, 703]); // +567(:5207-5209 x%2 镜像,2026-08-28 对账补)
/** 源矩形越界 warn-once 键去重(防每帧刷屏;换世界不重置可接受——键含 sheet+矩形) */
const SRC_OOB_WARNED = new Set<string>();

/** tileHeight=18 组(:4933-4977 + 20/590/595/615/79/90 + 114 高度+2)——grid 仍是 16 的需覆写 */
// ★2026-08-28 全量对账补 19 项（14/15/21/27/132/135/172/376/388/389/410/411/441/
// 467/468/469/476/497/567）；90/114 为历史遗留（1457 无 h18,18px 多画的 2px 是
// 步进透明 padding,source-over 无副作用,保留防未知回归）
const HEIGHT_18 = new Set([14, 15, 16, 17, 20, 21, 26, 27, 32, 69, 72, 77, 79, 90, 114, 124, 132, 135, 137, 138, 172, 352, 376, 388, 389, 410, 411, 441, 462, 467, 468, 469, 476, 487, 488, 497, 567, 574, 575, 576, 577, 578, 590, 595, 615, 664, 695, 704, 712, 713, 714, 715, 716]);

/** 共用慢速旋转计数(Main.tileFrame[type] 的近似:原版各类型速率不同,装饰性轮换取统一慢速) */
function animRot(): number {
  return Math.floor(tileAnim.tick / 6);
}

/** 渲染帧共享态:由 Renderer 每帧刷新(chunk 烘焙期读取) */
export const renderEnv = {
  /** Main.WindForVisuals 近似 = 天气当前风速 */
  wind: 0,
  /** Main.worldSurface(DoesWindBlowAtThisHeight 用) */
  worldSurface: 0,
  /** Main.remixWorld("don't dig up"——DoesWindBlowAtThisHeight 翻转,Renderer 注入) */
  remix: false,
  /** 当前渲染 zoom（Renderer 每帧注入；摆动层设备像素吸附用——0=缺省 1） */
  zoom: 0,
};
/** 设备像素吸附：世界坐标 → 1/zoom 网格（冠/枝逐帧重绘的小数偏移在最近邻下
 *  会整行跳变——夜间剪影高对比下即用户报的"横缝"；吸附后运动按设备像素步进
 *  （1.25× 下 0.8 世界 px 步长，肉眼不可察），边缘恒稳定 */
const devSnap = (v: number): number => {
  const gz = renderEnv.zoom || 1;
  return Math.round(v * gz) / gz;
};
/** ★矩形双边缘吸附（2026-08-19 归位缝收官）：只吸附左上角不够——80px 冠在
 *  1.27× 下高 101.6 设备px，底边仍落小数像素，canvas 对几何边缘 AA → 冠底
 *  最后一整行半透明（摆动下压时混入干色不可见，归位 offY=0 时暴露=横贯全冠
 *  宽亮缝，用户截图 y≈190 实抓）。双边缘独立取整、宽高取差后底边恒整数像素，
 *  半覆盖行消失；1.25× 整数倍缩放下取整为无操作 */
const rectSnap = (x: number, y: number, w: number, h: number): [number, number, number, number] => {
  const gz = renderEnv.zoom || 1;
  const x0 = Math.round(x * gz) / gz, y0 = Math.round(y * gz) / gz;
  const x1 = Math.round((x + w) * gz) / gz, y1 = Math.round((y + h) * gz) / gz;
  return [x0, y0, x1 - x0, y1 - y0];
};
/** 428 测重板被踩状态(Game.triggerTiles428 镜像;原版 PressurePlateHelper.PressurePlatesPressed) */
export const plates428Pressed = new Set<number>();

/** WorldGen.InAPlaceWithWind 风门已收敛到 Mounts 单源（inAPlaceWithWindTiles，
 *  int 重载 tile 坐标域 1:1,WorldGen.cs:88141-88163）——旧本地版无 AllowsWall
 *  白名单（任何墙挡风=保守近似）且无 remix 翻转,双漂移 2026-09-04 收敛清偿。
 *  TileDrawing.cs:4562-4564 私有同名封装 = 本重载的 tile 域形态,消费位:
 *  489 风铃 2×3（:4802）/ 490 风向标 2×2（:4817）/ 493 旗 1×1（:5312,注意原文
 *  传 x 而非 num9=帧还原 x——下同款保留） */

/** 生物群系变体(529/530 的 GetBiomeInfluence 近似:看正下方格所属邪恶群系;海滩看 x) */
function biomeVariant529(st: TileStore, x: number, y: number, w: number): number {
  const CORRUPT = new Set(['v_25_ebonstone_block', 'v_23_corrupt_grass_block', 'v_112_ebonsand_block']);
  const CRIMSON = new Set(['v_203_crimstone_block', 'v_199_crimson_grass_block', 'v_234_crimsand_block']);
  const HALLOW = new Set(['v_117_pearlstone_block', 'v_109_hallowed_grass_block', 'v_116_pearlsand_block']);
  if (st.inBounds(x, y + 1)) {
    const k = TILE_DEFS[st.type[st.idx(x, y + 1)]]?.key ?? '';
    if (HALLOW.has(k)) return 2;
    if (CRIMSON.has(k)) return 3;
    if (CORRUPT.has(k)) return 4;
  }
  const beach = 380; // WorldGen.beachDistance 近似
  return x < beach || x > w - beach ? 1 : 0;
}

/** 帧源/尺寸调整(GetTileDrawData 的 tileWidth/Height 覆写 + addFrX/Y 帧重排)。
 *  返回部分覆盖;null 项 = 用 r 原值 */
/** ★导出面（BJ118② 变异证红用）：帧源/尺寸调整（tileWidth/Height 覆写 + addFrX/Y
 *  帧重排）——单测直调验证碑族门/横移钟/火山相位域,行为面与生产共用同一函数。 */
export function drawAdjust(
  sheet: number, fx: number, fy: number, x: number, y: number,
  imgW: number, imgH: number, st: TileStore, w: number,
): { sx?: number; sy?: number; sw?: number; sh?: number } {
  const a: { sx?: number; sy?: number; sw?: number; sh?: number } = {};
  const fit = (sx: number, sy: number, sw: number, sh: number) => sx >= 0 && sy >= 0 && sx + sw <= imgW && sy + sh <= imgH;
  switch (sheet) {
    case 529: {   // :4895-4918:源行整替为 34*生物群系变体,高 32
      const v = biomeVariant529(st, x, y, w);
      if (fit(fx, 34 * v, 16, 32)) { a.sy = 34 * v; a.sh = 32; }
      break;
    }
    case 698: {   // :4629-4636:36×44,fx 重排 (fx/18)*38
      const sx = Math.floor(fx / 18) * 38;
      if (fit(sx, fy, 36, 44)) { a.sx = sx; a.sw = 36; a.sh = 44; }
      break;
    }
    case 751: if (fit(fx, fy, 56, 46)) { a.sw = 56; a.sh = 46; } break;  // :4582-4589
    case 752: if (fit(fx, fy, 36, 38)) { a.sw = 36; a.sh = 38; } break;  // :4577-4581
    // ★2026-08-30 移除 case 405/406 残案（TileDrawing.cs:5443-5529 原样语义已由
    //   VanillaTiler 顶层的 fireplaceAddFrY/chimneyAddFrY 专属 helper 承担——本处旧式
    //   `animRot()%8` 走针钟与原版 rate 钟不同相、且给烟囱算出 ≥6 的相位落进纹理
    //   未用带（sy 最高 410>378），被末尾越界守卫静默跳过整格绘制 = 用户实报
    //   "烟囱一闪一闪/瞬间消失"真凶；同时其绝对值覆写曾使 helper 偏移整体失效。
    //   捕获报告实证：站点侧 fb/clamp 全零而视觉仍闪 ⇒ 盲区即在此。）----
    case 81: if (fit(fx, fy, 24, 26)) { a.sw = 24; a.sh = 26; } break;   // :4979-4983 珊瑚 24×26
    case 323: case 324: if (fit(fx, fy, 20, 20)) { a.sw = 20; a.sh = 20; } break; // :5059-5070
    // SW-BL1 2026-09-06：case 2（左装取向）tileWidth=24（:5704-5720 case 2 分支
    //  `tileTop=-2; tileWidth=24`——源矩形 24×20 后,主路径 fdx=−(24−16)/2=−4 的
    //  X 位移与 tileTop −2（tileTopCond）自动生效;曾恒 20×20=左装取向右缘缺 4px）
    case 442: {
      const c = Math.floor(fx / 22);
      const w442 = c === 2 ? 24 : 20;
      if (fit(fx, fy, w442, 20)) { a.sw = w442; a.sh = 20; }
      break;
    }
    case 476: if (fit(fx, fy, 20, 18)) { a.sw = 20; a.sh = 18; } break;  // 高尔夫奖杯 w20×h18
    case 567: if (fit(fx, fy, 26, 18)) { a.sw = 26; a.sh = 18; } break;  // :5203-5206 花园侏儒 26×18
    case 579: if (fit(fx, fy, 20, 20)) { a.sw = 20; a.sh = 20; } break;  // 石巨人头 20×20
    case 656: case 701: if (fit(fx, fy, 24, 34)) { a.sw = 24; a.sh = 34; } break; // :5168-5176 发光郁金香(本/仿) 24×34
    // h20 植物家具族(:4899-4917 等多组 h=20;摆动成员与静态烘焙共用 drawVanillaCell,表值双向生效)
    case 3: case 24: case 33: case 49: case 61: case 71: case 82: case 83: case 84:
    case 110: case 174: case 201: case 372: case 637: case 646: case 703:
      if (fit(fx, fy, 16, 20)) { a.sh = 20; } break;
    // h32 高植物族(:5038-5050 等 h=32,tileTop −12 已在表;同上共用入口)
    case 73: case 74: case 113:
      if (fit(fx, fy, 16, 32)) { a.sh = 32; } break;
    case 726: if (fit(fx, fy, 20, 20)) { a.sw = 20; a.sh = 20; } break;  // 炮弹 20×20
    case 184: if (fit(fx, fy, 20, 16)) a.sw = 20; break; // :5289 tileWidth=20 仅 184——曾误落 185-187
    //  (C# 无 fallthrough:187 块 :5218-5236 只设 tileTop+分带换算,宽 20 会让
    //   3×2 石堆每格多绘右邻 4px=接缝错位,2026-08-28 用户报)
    case 624: case 700: if (fit(fx, fy, 20, 16)) { a.sw = 20; a.sh = 16; } break; // :5153-5162(20×16;700 同组,2026-08-28 对账补)
    case 711: if (fx > 0 && fit(fx, fy, 18, 20)) { a.sw = 18; a.sh = 20; } break; // :5000-5008
    case 561: a.sh = 20; break;                                            // 落穿 388 前预置高 20
    case 270: case 271: case 581: {   // :5632-5659:横移 6 帧（萤火/闪电/熔岩瓶）
      // ★BJ118② 钟归正 animRot()→animFrameIdx(270)（原版 tileFrame[270] 每 9tick
      //   推进/6 帧回卷,Main.cs:18952-18964;271/581 别名同钟 verbatim）——旧 tick/6
      //   相位率快 50%。纵向 addFrY=0（:5654 verbatim）由 TILE_ANIM_PITCH[270]=0
      //   承担（旧默认 38:270/581 素材 36 高被越界钳制掩蔽、581 同;全表普查案）。
      let n = animFrameIdx(270, 36) + (x % 6);
      if (x % 2 === 0) n += 3;
      if (x % 3 === 0) n += 3;
      if (x % 4 === 0) n += 3;
      while (n > 5) n -= 6;
      a.sx = fx + n * 18;
      break;
    }
    case 660: {   // :5661-5686:横移 5 帧（精灵瓶）——钟归正同 270（:5663 每 9tick/5 帧）
      let n = animFrameIdx(660, 36) + (x % 5);
      if (x % 2 === 0) n += 3;
      if (x % 3 === 0) n += 3;
      if (x % 4 === 0) n += 3;
      while (n > 4) n -= 5;
      a.sx = fx + n * 18;
      break;
    }
    case 572: {   // :5688-5700:横移 4 帧（魂瓶）——钟 animFrameIdx(572)（rate 6=原版
      //   counter>=6 verbatim,Main.cs:19459）;addFrY=0（:5695）由 PITCH[572]=0 承担
      //   （素材 216 高不被钳,旧 38 纵走=可见乱带,129 同族病第二例）
      let n = animFrameIdx(572, 216) + (x % 4);
      while (n > 3) n -= 4;
      a.sx = fx + n * 18;
      break;
    }
    // ★BJ118② 火山 593/594（:5541-5560/:5562-5583 verbatim）：预热走 1..8 后恒
    //   5..8 四相（volcanoFrame59x）。★fx≥18/≥36 静止支原版 addFrY=0——须显式
    //   a.sy=fy 整替通用 animYOffset 纵偏（RATE 在表,漏整替则样式带照走=129 同族）;
    //   fx<18/<36 动画支旧 animRot()%8 踏进 0..4 样式带（原版恒 5..8）=乱帧真凶。
    //   （594 旧 fx≥18 → sx−18 中臂系 1456/1457 均无的自创支——大火山 style0 右格
    //   fx=18 应纵向动画而非横向折列,摘除。临时帧 Animation.GetTemporaryFrame 未移植,
    //   备案同前。）
    case 593:
      if (fx >= 18) { a.sx = fx - 18; a.sy = fy; }
      else a.sy = fy + 18 * volcanoFrame59x(tileAnim.tick);
      break;
    case 594:
      if (fx >= 36) { a.sx = fx - 36; a.sy = fy; }
      else a.sy = fy + 36 * volcanoFrame59x(tileAnim.tick);
      break;
    case 507: case 508:   // :6106-6112:90*((counter+x*11+y*27)%160)/20——原版 counter
      //   逐 tick ++（Main.cs:19166,num2=20×8 周期）,钟归正 animRot()（tick/6,慢 6 倍）
      //   → tileAnim.tick。登记债：507/508 不在 RATE 表（无 tileFrame 写位）→ 仍走
      //   chunk 烘焙,相位在烘焙时定格（原版为连续动画）;进动态层须先过密度 perf 关
      //   （272 齿轮判例:块状动画进动态层=重烘风暴同量级）。
      a.sy = fy + 90 * Math.floor(((tileAnim.tick + x * 11 + y * 27) % 160) / 20);
      break;
    // ★BJ118② 钟逐单归正（原版各单 tileFrame 域不同,不得共用 animRot）：
    //   336/340-344 rate5/4 帧（:6114-6121*90;340-344 系 for-loop 钟 Main.cs:19173,
    //   提取器盲区→RATE 键 PIN 备案）;739 rate11/4 帧、748 rate8/8 帧（:4595-4600,
    //   旧 %4 把 748 的 8 帧域砍半）。
    case 336: case 340: case 341: case 342: case 343: case 344:
      a.sy = fy + 90 * animFrameIdx(sheet, 360);
      break;
    case 739: a.sy = fy + 90 * animFrameIdx(739, 360); break;   // :4595-4600
    case 748: a.sy = fy + 90 * animFrameIdx(748, 720); break;
    case 617: a.sx = fx % 54; a.sy = fy % 144; break;    // :5351-5355
    case 129: { // :4682-4690 ★2026-09-18：钟归正 animRot()→crystalShardAddFrX（=tileFrame[129]
      //   每 8tick 推进/6 帧回卷 verbatim,此前 tick/6 相位率差 33%）；纵向 addFrY=0
      //   由 TILE_ANIM_PITCH[129]=0 承担（旧默认 38 纵向走带=用户报"发散两个方块"根因）
      const addFx = crystalShardAddFrX(fx);
      if (addFx !== 0) a.sx = fx + addFx;
      break;
    }
    case 530:   // :4757-4776:addFrY += 36*biome(同 529 变体近似)
      a.sy = fy + 36 * biomeVariant529(st, x, y, w);
      break;
    // ⚠已删除 case 28/105/470/719:那是 Player.cs 手持【物品】贴图的 14 相位
    // 动画(物品 id 空间),不是 tile sheet!错抄于此致 sheet 28(陶罐)被劫持——
    // sy+270×(t%4) 与 sx+288×(t/4) 随时间/位置变化 → 陶罐错位且开关门重建后
    // 错位形态改变(用户标注)。物品手持动画归 PlayerDrawLayers 体系,不归此处。
    case 227:   // :5121-5152:fx==204 时按下方仙人掌群系加变体列(原版原文如此)
      if (fx === 204) {
        const v = biomeVariant529(st, x, y, w);
        if (v === 2) a.sx = fx + 238;
        else if (v === 4) a.sx = fx + 204;
        else if (v === 3) a.sx = fx + 272;
      }
      if (fit(fx, fy, 32, 38)) { a.sw = 32; a.sh = 38; }   // :5126-5128 w32×h38(2026-08-28 对账补)
      break;
    case 485:   // :4780-4790:恒摆(无风门)
      a.sy = fy + 36 * (((Math.floor(tileAnim.tick / 5) + (y - Math.floor(fy / 18)) + (x - Math.floor(fx / 18))) % 4 + 4) % 4);
      break;
    case 489:   // :4791-4804:风门 2×3 → 16 帧快摆
      if (inAPlaceWithWindTiles(st, x - Math.floor(fx / 18), y - Math.floor(fy / 18), 2, 3, renderEnv.worldSurface, renderEnv.remix)) {
        a.sy = fy + 54 * (((Math.floor(tileAnim.tick / 5) + (y - Math.floor(fy / 18)) + (x - Math.floor(fx / 18))) % 16 + 16) % 16);
      }
      break;
    case 490: {  // :4805-4880:风门 2×2 → 帧率帧 + 强风摇晃偏移(weatherVaneBobframe 用 tick 采样近似)
      const ax = x - Math.floor(fx / 18), ay = y - Math.floor(fy / 18);
      const windy = inAPlaceWithWindTiles(st, ax, ay, 2, 2, renderEnv.worldSurface, renderEnv.remix);
      let n = windy ? animRot() % 8 : 0;
      let bob = 0;
      if (windy && Math.abs(renderEnv.wind) > 0.5) {
        bob = [0, 1, 2, 1, 0, -1, -2, -1][Math.floor(tileAnim.tick / 5) % 8];
      }
      n += bob;
      if (n < 0) n += 12;
      a.sy = fy + 36 * (n % 12);
      break;
    }
    case 493: {  // :5300-5332:风门 1×1,按风速分档 6/12 帧带
      if (fy === 0) {
        const ax = x - Math.floor(fx / 18), ay = y - Math.floor(fy / 18);
        let windAbs = inAPlaceWithWindTiles(st, x, ay, 1, 1, renderEnv.worldSurface, renderEnv.remix) ? Math.abs(renderEnv.wind) : 0;
        if (windAbs >= 0.1) {
          let n: number;
          if (windAbs < 0.5) {
            n = Math.floor(tileAnim.tick / 20) + ay + ax;
            n = ((n % 6) + 6) % 6;
            n = renderEnv.wind >= 0 ? n + 1 : 6 - n;
          } else {
            n = Math.floor(tileAnim.tick / 10) + ay + ax;
            n = ((n % 6) + 6) % 6;
            n = renderEnv.wind >= 0 ? n + 7 : 12 - n;
          }
          a.sy = fy + 36 * n;
        }
      }
      break;
    }
    // （case 405/406 已删：见上方 2026-08-30 移除注——chimney/fireplace 走顶层 helper）
    // ★BJ118② 钟归正批（2026-09-18 全表普查）：452 气球机 animRot()→animFrameIdx(452)
    //   （原版 tileFrame[452] counter>=5 推进/15 帧回卷,Main.cs:19263——旧 tick/6 且 %8
    //   把 15 帧域砍半）;454 皮纳塔原版 tileFrame[454] 无任何写入（grep 全量零命中）
    //   → addFrY = 0×54 = 0 恒静止——旧 animRot()%8·54 凭空动画（真实偏差,摘除）。
    case 452: a.sy = fy + (fx >= 54 ? 0 : animFrameIdx(452, 810)) * 54; break;  // :5468-5476
    case 454: break;   // :5490-5492 addFrY = tileFrame[454]×54,钟恒 0 → 静止（带 0）
    case 453: a.sy = fy + 54 * (((Math.floor(tileAnim.tick / 20) + (y - Math.floor(fy / 18)) + x) % 3 + 3) % 3); break; // :5493-5501
    // 456 气球束(:5503-5511):addFrY = (counter/20 坐标相位 %4)×54——原版 counter 每
    // tick += rand.Next(3)+1（均值 2/tick,Main.cs:19301）,本仓 tick/20 均速近似（APPROX
    // 备案同 453）。★步距 38→54 勘正（216=4×54 恰满,旧 PIN 38 缺证值）。
    case 456: a.sy = fy + 54 * (((Math.floor(tileAnim.tick / 20) + (y - Math.floor(fy / 18)) + (x - Math.floor(fx / 18))) % 4 + 4) % 4); break;
    // 455 派对碑(:5478-5488):addFrY = (PartyIsUp ? 1+tileFrame[455] : 0)×54——本仓无
    // 派对系统 → 恒 0 静止（band 0）。★须显式 a.sy=fy 整替通用 animYOffset(455) 纵偏
    // （455 在 RATE 表,不整替则 6 帧派对动画照播=真实偏差）。派对面落地时接事件旗。
    case 455: a.sy = fy; break;
    // ★BJ118② 碑族门面（2026-09-18 普查转正,case :6029-6079 verbatim）——表值只记
    //   步距（54/56）,「band0 静止档」门在此承担:通用 animYOffset 无门,不接管则
    //   静止档照走带（素材 1静+N动 带布局,PNG 容量互证见 TileAnim PITCH 表注）。
    case 410:   // 月主碑 :6029-6042:fy>=56 → tileFrame×56,否则静止;fy==36 → 高 18
      //   （原 tileHeight 覆写 verbatim——本 case 接管后 HEIGHT_18 默认臂不再命中,
      //   按原版收窄为 fy==36 单格,±2px 均透明 padding 无视觉差）
      if (fy === 36) a.sh = 18;
      a.sy = fy >= 56 ? fy + animFrameIdx(410, 504) * 56 : fy;
      break;
    case 480: case 509: case 657: case 720: case 721: case 725:
      // 血月/虚空/回响/CRT/复古/放映机碑 :6044-6059:fy>=54 → tileFrame×54,否则静止
      a.sy = fy >= 54 ? fy + animFrameIdx(sheet, 486) * 54 : fy;
      break;
    case 658: { // 微光碑 :6061-6079:tileFrame×54 + 变体子表基（fy/54==1 → +486、
      //   ==2 → +972;default 含 0 与 ≥3）。1620=30×54 容量互证。
      const band = Math.floor(fy / 54);
      a.sy = fy + animFrameIdx(658, 1620) * 54 + (band === 1 ? 486 : band === 2 ? 972 : 0);
      break;
    }
    case 244:   // 气泡机 :5595-5604:fx<54 → tileFrame×36,else 静止（style1 列静态）
      a.sy = fx < 54 ? fy + animFrameIdx(244, 216) * 36 : fy;
      break;
    case 565:   // 雾机 :5606-5615:fx<36 → tileFrame×36,else 静止（style1 列静态）
      a.sy = fx < 36 ? fy + animFrameIdx(565, 180) * 36 : fy;
      break;
    case 428:   // :5697-5703:被踩 → addFrX += 18
      if (plates428Pressed.has(st.idx(x, y))) a.sx = fx + 18;
      break;
    default:
      if (HEIGHT_18.has(sheet)) a.sh = 18;
      break;
  }
  return a;
}

// ================= ★BJ118①（G-129 质感层,2026-09-18）水晶碎块半透明 + 大簇彩虹辉光 =================
// TileDrawing.cs:1101-1118 case 129 第一段:finalColor = new Color(255,255,255,100)
// （半透明、全亮——覆写 GetFinalLight 光照结果 = 碎块暗处可见,原版相）;frameX>=324 →
// finalColor = Transparent,基底改由 glow 段 :1292 重画回 white/100——两态净效果同
// = 基底恒 α100。:1276-1293 glow 段:大簇 4 向 2px 叠画（num12 ∈ {0,π/2,π,3π/2} →
// ±(2,0)/(0,2)）,源带 = 帧带 +72（Tiles_129 432×144:上半 0..126 本体四朝向带、
// 72..144 平行辉光带,小簇 flag3=true 跳过）。色 = Main.hslToRgb(0.7 + sin(2π·
// GlobalTimeWrappedHourly·0.16 + x·0.3 + y·0.7)·0.16, 1, 0.5) → A/=2(=127) →
// ×0.3（FNA Color*float 逐通道 byte 截断）→ 有效 tint ≈ (r·0.3,g·0.3,b·0.3,α38)。
// ★钟源定谳：GlobalTimeWrappedHourly（:1284 实文;非 FlickerClock、非 Disco——
//   160/692 彩虹 moss 才走 Disco 钟）。本仓口径 = SkyColor.globalTimeWrappedHourly
//   同款 performance.now 秒 %3600（Main.cs:17014 TotalGameTime 秒 %3600）。

/** 基底 α（(255,255,255,100) → 纹理 α×100/255） */
export const SHARD_BASE_ALPHA = 100 / 255;

/** Main.GlobalTimeWrappedHourly（真实运行秒 %3600;无 performance 环境恒 0） */
export function shardGlowClock(): number {
  return typeof performance !== 'undefined' ? (performance.now() / 1000) % 3600 : 0;
}

/** Main.hslToRgb + hue2rgb verbatim（Main.cs:48689-48741,Math.Round ×255） */
export function shardHslToRgb(hue: number, sat: number, lum: number): [number, number, number] {
  if (sat === 0) {
    const v = Math.round(lum * 255);
    return [v, v, v];
  }
  const t2 = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
  const t1 = 2 * lum - t2;
  return [
    Math.round(hue2rgb(hue + 1 / 3, t1, t2) * 255),
    Math.round(hue2rgb(hue, t1, t2) * 255),
    Math.round(hue2rgb(hue - 1 / 3, t1, t2) * 255),
  ];
}

function hue2rgb(c: number, t1: number, t2: number): number {
  if (c < 0) c++;
  if (c > 1) c--;
  if (6 * c < 1) return t1 + (t2 - t1) * 6 * c;
  if (2 * c < 1) return t2;
  if (3 * c < 2) return t1 + (t2 - t1) * (2 / 3 - c) * 6;
  return t1;
}

/** 辉光 tint（:1284-1286 verbatim:A/=2 → ×0.3 截断）——纯函数供金标测试/变异证红 */
export function shardGlowTint(clockSec: number, x: number, y: number): [number, number, number, number] {
  const hue = 0.7 + Math.sin(Math.PI * 2 * clockSec * 0.16 + x * 0.3 + y * 0.7) * 0.16;
  const [r, g, b] = shardHslToRgb(hue, 1, 0.5);
  return [Math.floor(r * 0.3), Math.floor(g * 0.3), Math.floor(b * 0.3), Math.floor(255 / 2 * 0.3)];
}

const shardTintCache = new Map<string, HTMLCanvasElement>();
const shardTintImgIds = new WeakMap<object, number>();
let shardTintNextId = 1;
const SHARD_TINT_CACHE_CAP = 512;

/** 辉光带染色副本缓存（键=图像身份|源矩形|tint——tint 随 hue 量化连续变化,LRU 淘汰;
 *  逐像素 = XNA SpriteBatch 调制语义 texel×tint/255,α 同乘后 source-over 合成等价） */
function shardTintedCopy(r: { img: ImageBitmap | HTMLImageElement | HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number },
  tint: [number, number, number, number]): HTMLCanvasElement | null {
  let imgId = shardTintImgIds.get(r.img as object);
  if (imgId === undefined) { imgId = shardTintNextId++; shardTintImgIds.set(r.img as object, imgId); }
  const key = `${imgId}|${r.sx}|${r.sy}|${tint[0]},${tint[1]},${tint[2]}`;
  const hit = shardTintCache.get(key);
  if (hit) { shardTintCache.delete(key); shardTintCache.set(key, hit); return hit; }
  const c = document.createElement('canvas');
  c.width = r.sw; c.height = r.sh;
  const cx = c.getContext('2d', { willReadFrequently: true });
  if (!cx) return null;
  cx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
  const im = cx.getImageData(0, 0, r.sw, r.sh);
  const d = im.data;
  const [tr, tg, tb, ta] = tint;
  for (let p = 0; p < d.length; p += 4) {
    if (d[p + 3] === 0) continue;
    d[p] = Math.floor(d[p] * tr / 255);
    d[p + 1] = Math.floor(d[p + 1] * tg / 255);
    d[p + 2] = Math.floor(d[p + 2] * tb / 255);
    d[p + 3] = Math.floor(d[p + 3] * ta / 255);
  }
  cx.putImageData(im, 0, 0);
  if (shardTintCache.size >= SHARD_TINT_CACHE_CAP) {
    const oldest = shardTintCache.keys().next().value;
    if (oldest !== undefined) shardTintCache.delete(oldest);
  }
  shardTintCache.set(key, c);
  return c;
}

/** 水晶碎块整格绘制（TileDrawing.cs:1101-1118 + 1276-1293 净效果 1:1）：
 *  基底 α100 全亮;大簇（fx>=324）另加 4 向 2px 辉光副本（源带 sy+72,色随
 *  GlobalTimeWrappedHourly + 世界坐标相位脉动）。
 *  ★红蓝-G②（2026-09-18）绘序定谳：原版 glow 段先画 4×(band+72) 色副本
 *  （:1290-1295 tileBatch 入队）、「后」画 α100 基底（:1313 color2=(255,255,255,100)
 *  → !flag3 尾画）——16×18 核心叠域 4 副本互叠+基底盖顶 source-over 不可交换
 *  （Δ≈(1-αB)⁴ 序差 ×(基底−tint) 色差,非 0）。本仓曾反序（先基底后副本）→ 微弱
 *  色差,已按原版序调正。导出仅供绘序金标测试（记录 ctx 桩）。 */
export function drawShardCell(ctx: CanvasRenderingContext2D,
  r: { img: ImageBitmap | HTMLImageElement | HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number },
  sx: number, sy: number, dx: number, dy: number, x: number, y: number, fx: number): void {
  if (fx >= 324 && sy + 72 + r.sh <= r.img.height && sy + 72 >= 0) {   // 辉光带越界防御
    const tint = shardGlowTint(shardGlowClock(), x, y);
    const tex = shardTintedCopy({ img: r.img, sx, sy: sy + 72, sw: r.sw, sh: r.sh }, tint);
    if (tex) {
      ctx.globalAlpha = 1;
      for (const [ox, oy] of [[2, 0], [0, 2], [-2, 0], [0, -2]] as const) {
        ctx.drawImage(tex, 0, 0, r.sw, r.sh, dx + ox, dy + oy, r.sw, r.sh);
      }
    }
  }
  ctx.globalAlpha = SHARD_BASE_ALPHA;
  ctx.drawImage(r.img, sx, sy, r.sw, r.sh, dx, dy, r.sw, r.sh);
  ctx.globalAlpha = 1;
}

/** ★SW-BJ3（2026-09-06）：半砖格绘制 1:1（TileDrawing.cs:1016/:1022/:1653-1666）。
 *  原版基础拍：normalTileRect = (frameX+addFrX, frameY+addFrY, tileWidth,
 *  tileHeight - halfBrickHeight)（:1016——halfBrick 时高 16-8=8,即【帧上半】8px）、
 *  位置 y*16 + tileTop + halfBrickHeight（:1022 → 格内下半）。半砖素材语义 =
 *  顶面棱线在帧上半,画到格下半才是"矮台阶"顶面（D1 邻半砖衔接 :1610 的下半条
 *  fy+8 与此不同源,勿混）。
 *  D2 无支撑支（:1653）：下方 !active || !_tileSolid || halfBrick 时——
 *   · 平台（:1655 Platforms 支）仍画整 normalTileRect（=上半 8px,无暗条）;
 *   · 其余（:1658-1663）画 normalTileRect.Modified(0,0,0,-4)（帧顶 4px）+
 *     暗条 (144+addFrX, 66+addFrY, w, 4) @ y+12（素材表固定区,悬空断茬）。
 *  支撑域 _tileSolid = 原版 tileSolid（平台 19/427/435-439+239/380 双 true 在内）
 *  = 本仓 solid ∪ VANILLA_TS_DOUBLE_TRUE（旧谓词缺平台臂:平台上压半砖被误判
 *  悬空画暗条——用户实报"半砖放平台上出现黑条"同根）。
 *  auto/共享尾两条同体分支合并走本函数（此前两份手写已漂移出同 bug）。 */
function drawHalfBrickCell(
  ctx: CanvasRenderingContext2D,
  r: { img: ImageBitmap | HTMLImageElement | HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number },
  st: { idx(x: number, y: number): number; h: number; flags: Uint8Array; type: Uint16Array; half: Uint8Array },
  x: number, y: number, type: number, px: number, py: number,
): void {
  const bi = st.idx(x, y + 1);
  const belowDef = y + 1 < st.h && st.flags[bi] ? TILE_DEFS[st.type[bi]] : undefined;
  const belowVanillaSolid = !!belowDef
    && (!!belowDef.solid || VANILLA_TS_DOUBLE_TRUE.has(belowDef.vanilla?.sheet ?? -1));
  const noSupport = y + 1 >= st.h || !st.flags[bi] || !belowVanillaSolid || !!st.half[bi];
  const isPlatHalf = VANILLA_PLATFORM_SHEETS.has(TILE_DEFS[type]?.vanilla?.sheet ?? -1);
  if (noSupport && !isPlatHalf && r.sy + 4 <= r.img.height && 144 + r.sw <= r.img.width && 70 <= r.img.height) {
    ctx.drawImage(r.img, r.sx, r.sy, r.sw, 4, px, py + 8, r.sw, 4);          // 帧顶 4px
    ctx.drawImage(r.img, 144, 66, r.sw, 4, px, py + 12, r.sw, 4);            // D2 暗条
  } else {
    ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh - 8, px, py + 8, r.sw, r.sh - 8);   // 帧上半 8px @格下半
  }
}

/** D1 邻居半砖衔接(TileDrawing.cs:1609-1652):本格整砖实心、左右邻是半砖时,
 *  用素材表预制衔接帧(90/126/144/148/156 列)替代整帧,抹平 8px 高差。
 *  返回 true = 已绘制(调用方 return) */
function drawHalfBrickSeam(
  ctx: CanvasRenderingContext2D,
  r: { img: ImageBitmap | HTMLImageElement | HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number },
  st: TileStore, x: number, y: number, sheet: number, px: number, py: number,
): boolean {
  if (DONT_DRAW_SLOPES.has(sheet) || IGNORES_NEARBY_HALFBRICK.has(sheet) || NOT_REALLY_SOLID.has(sheet)) return false;
  const ti = st.idx(x, y);
  const td = TILE_DEFS[st.type[ti]];
  if (!td || !td.solid || td.platform || st.half[ti] || st.slope[ti] !== 0) return false;
  if (!st.inBounds(x - 1, y) || !st.inBounds(x + 1, y)) return false;
  const li = st.idx(x - 1, y), ri = st.idx(x + 1, y);
  const lh = !!st.flags[li] && !!st.half[li], rh = !!st.flags[ri] && !!st.half[ri];
  if (!lh && !rh) return false;
  const img = r.img, fx = r.sx, fy = r.sy, tw = r.sw, th = r.sh;
  const ok = (sx: number, sy: number, sw: number, sh: number) => sx >= 0 && sy >= 0 && sx + sw <= img.width && sy + sh <= img.height;
  if (!ok(fx, fy + 8, tw, 8)) return false;
  ctx.drawImage(img, fx, fy + 8, tw, 8, px, py + 8, tw, 8);  // 下半 8px 条(三分支共用)
  if (lh && rh) {
    // 上半通用衔接帧;上邻同型且非底坡 → (90,0),否则 (126,0)
    let ux = 126;
    if (y >= 1) {
      const ui = st.idx(x, y - 1);
      const sl = st.slope[ui];
      if (st.flags[ui] && sl !== 3 && sl !== 4 && TILE_DEFS[st.type[ui]]?.vanilla?.sheet === sheet) ux = 90;
    }
    if (ok(ux, 0, 16, 8)) ctx.drawImage(img, ux, 0, 16, 8, px, py, 16, 8);
    return true;
  }
  const num = SMOOTH_BORDER.has(sheet) ? 2 : 4;
  if (lh) {
    if (!ok(fx + num, fy, tw - num, th)) return true;
    ctx.drawImage(img, fx + num, fy, tw - num, th, px + num, py, tw - num, th);
    if (ok(144, 0, num, 8)) ctx.drawImage(img, 144, 0, num, 8, px, py, num, 8);
    if (num === 2 && ok(148, 0, 2, 2)) ctx.drawImage(img, 148, 0, 2, 2, px, py, 2, 2);
  } else {
    if (!ok(fx, fy, tw - num, th)) return true;
    ctx.drawImage(img, fx, fy, tw - num, th, px, py, tw - num, th);
    if (ok(144 + (16 - num), 0, num, 8)) ctx.drawImage(img, 144 + (16 - num), 0, num, 8, px + 16 - num, py, num, 8);
    if (num === 2 && ok(156, 0, 2, 2)) ctx.drawImage(img, 156, 0, 2, 2, px + 14, py, 2, 2);
  }
  return true;
}

// ===================== 树油漆 style 派生（TileDrawing.cs GetTreeBiome 族，2026-08-25 自 ChunkCache 迁入：WindSway 摆动层特判组分派需同源 style，避免 ChunkCache←→WindSway 环） =====================

/** GetTreeVariant（TileDrawing.cs:1801-1829）：树底地面型 → 树油漆 style。
 *  8 地面型 + 丛林地表(1)/地下(5)分裂（y > worldSurface）+ 未激活/表外 -1。 */
const TREE_GROUND_IDS = (() => {
  const g = (k: string) => TILE_BY_KEY[k] ?? -1;
  return {
    corrupt: g('v_23_corrupt_grass_block'),          // :1809-1811 → 0（661 腐化丛林草同档）
    corruptJungle: g('v_661_corrupt_jungle_grass_block'),
    jungle: g('v_60_jungle_grass_block'),            // :1812-1817 地表 1 / 地下 5
    mushroom: g('v_70_mushroom_grass_block'),        // :1818-1819 → 6
    hallow: g('v_109_hallowed_grass_block'),         // :1820-1822 → 2（492 修剪神圣草同档）
    hallowMowed: g('v_492_hallowed_mowed_grass_block'),
    snow: g('snow'),                                 // :1823-1824 → 3（147 雪块）
    crimson: g('v_199_crimson_grass_block'),         // :1825-1827 → 4（662 猩红丛林草同档）
    crimsonJungle: g('v_662_crimson_jungle_grass_block'),
  };
})();

export function treeGroundVariant(st: TileStore, x: number, y: number, worldSurface: number): number {
  if (!st.inBounds(x, y)) return -1;
  const i = st.idx(x, y);
  if (!st.flags[i]) return -1;                       // :1803-1805 未激活
  const t = st.type[i];
  const G = TREE_GROUND_IDS;
  if (t === G.corrupt || t === G.corruptJungle) return 0;
  if (t === G.jungle) return y > worldSurface ? 5 : 1;
  if (t === G.mushroom) return 6;
  if (t === G.hallow || t === G.hallowMowed) return 2;
  if (t === G.snow) return 3;
  if (t === G.crimson || t === G.crimsonJungle) return 4;
  return -1;                                         // :1828-1829 表外地面
}

/** GetTreeBiome（TileDrawing.cs:1758-1798）：树干格帧 → 列修正 → 向下扫到树底 → 变体。
 *  列修正是枝/顶标记帧的枝干在邻列（:1763-1793 frameX/frameY 四段 switch）。 */
export function treeTrunkPaintStyle(st: TileStore, x: number, y: number, tileFrameX: number, tileFrameY: number,
  worldSurface: number): number {
  let col = x;
  if (tileFrameX === 66 && tileFrameY <= 45) col++;             // :1763-1765
  if (tileFrameX === 88 && tileFrameY >= 66 && tileFrameY <= 110) col--; // :1767-1769
  if (tileFrameY >= 198) {
    if (tileFrameX === 66) col--;                               // :1771-1777
    else if (tileFrameX === 44) col++;                          // :1778-1780
  } else if (tileFrameY >= 132) {
    if (tileFrameX === 22) col--;                               // :1783-1789
    else if (tileFrameX === 44) col++;                          // :1790-1792
  }
  let row = y; // :1795 扫描：当前列自本行向下走到第一个非树格（越界=不激活，同 C# OOB 空格）
  for (; st.inBounds(col, row); row++) {
    const i = st.idx(col, row);
    if (!st.flags[i] || st.type[i] !== TREE_VANILLA.trunk) break;
  }
  return treeGroundVariant(st, col, row, worldSurface);         // :1798
}

/** GetPalmTreeBiome+GetPalmTreeVariant（TileDrawing.cs:1749-1756/:3519-3543）：
 *  向下扫到棕榈底 → 沙型(0/1/2/3) → 绿洲列 +4（★-1 也 +4 成 3 的原版行为 1:1 保留）。 */
export function palmTreePaintStyle(st: TileStore, x: number, y: number, worldW: number): number {
  let row = y; // :1752 扫描：type == 323 连续段
  for (; st.inBounds(x, row); row++) {
    const i = st.idx(x, row);
    if (!st.flags[i] || st.type[i] !== TREE_VANILLA.palm) break;
  }
  let variant = -1;                                             // :3520
  const gi = st.inBounds(x, row) ? st.idx(x, row) : -1;
  if (gi >= 0 && st.flags[gi]) {
    switch (TILE_DEFS[st.type[gi]]?.vanilla?.sheet) {
      case 53: variant = 0; break;                              // :3522-3524 沙
      case 234: variant = 1; break;                             // :3525-3527 猩红沙
      case 116: variant = 2; break;                             // :3528-3530 珍珠沙
      case 112: variant = 3; break;                             // :3531-3533 腐化沙
    }
  }
  if (x >= 380 && x <= worldW - 380) variant += 4;              // :3534-3537 IsPalmOasisTree(:27352-27359)
  return variant;                                               // :3538
}

/** 树干(5)/棕榈(323) 内部 id 解析（按 vanilla.sheet 反查；模块加载时一次） */
const TREE_VANILLA = (() => {
  let trunk = -1, palm = -1;
  for (let id = 0; id < TILE_DEFS.length; id++) {
    const s = TILE_DEFS[id]?.vanilla?.sheet;
    if (s === 5 && trunk < 0) trunk = id;
    else if (s === 323 && palm < 0) palm = id;
  }
  return { trunk, palm };
})();
