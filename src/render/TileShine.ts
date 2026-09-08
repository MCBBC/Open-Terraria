// TileShine — Main.tileShine2 / Main.shine tile 顶点色提亮通道移植（蓝队 2026-09-07）
//
// 【用户实报】"生命水晶（水晶之心）暗处看不见"——tiles.ts:156 crystal_heart 挂账
//   "暗处可见性归 Main.tileShine[12]=300 闪光（未实装，登记债）"的本体即本通道：
//   原版 tile 12（Heart）无静态光（无 tileLighted、ApplyTileLight 主 switch 无
//   case 12），但 sprite 绘制顶点色带 ×1.6 提亮（Main.tileShine2[12]=true，
//   Main.cs:7298），暗处本体呈暗红可读——这正是原版截图"暗处本体可见"的机制，
//   本仓此前缺此通道。
//
// 【原版权威面（1457 反编译逐句核对）】
//   · TileDrawing.cs:4429-4441 GetFinalLight(Vector3 主批路径)：
//       tileLight *= tint; if (inActive) actColor;
//       else if (ShouldTileShine(type, frameX)) Main.shine(ref tileLight, type);
//     （Color 重载 :4394-4417 多一道 fullbrightBlock→White 前置门，其余同序）
//   · TileDrawing.cs:4443-4471 ShouldTileShine：
//       (shimmerAlpha>0 && tileSolid[type]) || type==165 || 693 || 694 → true；
//       !tileShine2[type] → false；467/468 frameX∈[144,178)；21/441 frameX∈[36,178)；
//       default → true
//     ★F6a（2026-09-08）：tileShine2[185]/[186] 是【按帧动态赋值】的成员
//       （TileDrawing.cs:5223-5231/:5239-5247 GetTileDrawData 内逐格写表；
//       DrawSingleTile :884 GetTileDrawData 先于 :1028 GetFinalLight → 每格自洽，
//       无跨格泄漏）：185 = frameY==18 ∧ frameX∈[576,882]（双端闭）、
//       186 = frameX∈[864,1170]（双端闭）——上界闭与 467/468 的 <178 开区间不同源。
//       机制 = 入 SHINE2_SHEETS + shouldTileShine 帧门（frameY 形参为 185 新增）。
//   · Main.cs:21868-21951 Main.shine(ref Vector3, type)：num=0.6 缺省；逐 case 乘区
//       （全表见 shineMultiplier）；case 262-268 = XYZ += 0.39【加法支】；
//       default = tileShine2[type] → 全通道 ×1.6；尾段 shimmerAlpha>0 时向
//       (1.2,1.0,1.6) 逐通道 lerp 并钳 1（shimmerShine 全库仅此一处赋值）。
//   · Main.tileShine2 全表（Main.cs:7276-7331 区块 + :7656/:9792/:10141-10155/
//       :10212/:10315/:10420-10431 散点 + :10478-10481 循环 262..268）= 59 静态型
//       + 2 动态型（185/186,TileDrawing.cs 逐格按帧赋值,见 ShouldTileShine 注）
//       = 61 条目，见 SHINE2_SHEETS。
//
// 【架构落点（为什么是"合成前 lighter 加进世界层"）】本仓 tile = 世界层画未调色
//   sprite → compositeLight 全层乘光照图；逐格顶点色通道不存在（荧光涂层叠层
//   drawCoatGlowGrid 先例 = 合成后叠，但那要求逐格采样 lightAt 且低清档与拉伸后
//   底图错位）。乘法支 delta = sprite×L×(k−1)：在【合成前】以 'lighter' 加进世界层，
//   合成乘光后 = (底图 + delta)×L = sprite×L×k —— 与底图同乘同一光照图，数学恒等，
//   且与世界层内后画的实体/前景水保持原版 tile 批次覆盖序（实体盖掉所站格的
//   shine，原版顶点色同理）。+0.39 加法支（262-268 Gemspark）原版加在
//   【顶点色(光)】上、与 L 无关 → 必须合成后平加（drawTileShineAdditive，
//   设备矩形仿 drawCoatGlowGrid 先例）。
//
// 【缓存】每 chunk 一张 256² 乘法 delta 画布（已烘焙 delta 色）+ 一张 +0.39 平加
//   画布（懒分配），WeakMap<ChunkPair> 键控——ChunkCache 重烘焙恒新建 pair 对象
//   （ChunkCache.ts:532 `pair = { wall, tile, ... }`），pair 身份变更 = 底图重烘
//   信号，与底图重烘节奏天然同源（油漆/涂层/宝箱姿态失效链零侵入复用）。
//   cache 键含 shimmerAlpha 量化档（重烘节流）。逐帧动态支：动画格（12 生命水晶/
//   639 魔力水晶——TILE_ANIM_RATE 表，TileAnim.ts:37/:99）与脉动矿（204 Crimtane/
//   211 Chlorophyte，tint 随 mouseTextColor 呼吸）不进 chunk 烘焙（烘焙会冻结
//   呼吸/引发重烘风暴，机制同 ChunkCache"动画格不进烘焙"判例），逐帧小scratch
//   直绘——屏内数量级：水晶个位数、脉动矿数十，成本有界。
//
// 【登记近似】① case 25 黑曜石 delta = (−0.05,−0.15,+0.1)——'lighter' 加法无法
//   表达负 delta，负通道钳 0（仅此一型，量级 ≤0.15×L）。② 原版钳 1 发生在【光】上
//   （min(1, L×k)）；本仓钳位发生在画布合成（min(255, sprite×L×k)）——仅 L×k>1 且
//   texel<255 的亮区有差（暗区恒精确，即本通道的目标域）。③ 动画/脉动逐帧支用
//   逐格设备矩形（与 drawAnimatedTileLayer dev 数学同式）；?dynsnap0 逃生门下底图
//   走世界坐标线性映射，与设备矩形差 ≤0.5px（乘法 delta 的半像素错位不可感）。
//   ④ Main.tileSolid 取值：vanilla-journeycat.json tileSolid 字面量表优先，表外
//   回落 TILE_DEFS.solid（平台族 repo=false 与原版 tileSolid=true 有差，仅影响
//   shimmer 支归类）。⑤ 动态支 scratch 经 tileTop/dyOff 后整幅锚定「世界格左上」
//   设备位，与 drawAnimatedTileLayer 的盒顶锚定在 dyOff≠0 时差 ≤1px（shine2 动态
//   族 12/639 dyOff=0，实际恒精确）。
import { CHUNK, TILE } from '../core/constants';
import { TILE_DEFS } from '../data/tiles';
import catRaw from '../data/vanilla-journeycat.json';
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import type { World } from '../world/World';
import type { ChunkPair } from './ChunkCache';
import { TileStore } from '../world/TileStore';
import { drawVanillaCell, chestLidPoseAt } from './VanillaTiler';
import { frameMergesWith } from './TileMergeFamily';
import { isDynamicAnimSheet } from './TileAnim';
import { getTilePaintSettings, type LeafPaintSettings } from '../world/Paint';
import { tintRegion } from './TileTint';
import type { Camera } from './Camera';

// ---- Main.tileShine2 全表（Main.cs 赋值点见文件头；名字取 Terraria.ID.TileID.cs）----
export const SHINE2_SHEETS: ReadonlySet<number> = new Set([
  6, 7, 8, 9,            // Iron/Copper/Gold/Silver 矿（TileID.cs:449-455）
  12,                    // Heart 生命水晶（:461）
  21,                    // Containers 宝箱（:479）
  22,                    // Demonite（:481）
  25,                    // Ebonstone（:487）
  45, 46, 47,            // Gold/Silver/Copper Brick（:527-531）
  63, 64, 65, 66, 67, 68,// Sapphire/Ruby/Emerald/Topaz/Amethyst/Diamond 宝石矿（:563-573）
  107, 108, 111,         // Cobalt/Mythril/Adamantite（:651-659）
  117,                   // Pearlstone（:671）
  121, 122,              // Cobalt/Mythril Brick（:679-681）
  147,                   // SnowBlock（:731）
  161, 163, 164,         // IceBlock/CorruptIce/HallowedIce（:759-765）
  166, 167, 168, 169,    // Tin/Lead/Tungsten/Platinum（:769-775）
  178,                   // ExposedGems（:793）
  185, 186,              // ★F6a SmallPiles/LargePiles（Main.cs 无静态赋值——TileDrawing.cs:5223-5231/:5239-5247 按帧动态赋值,帧门在 shouldTileShine;本仓 v_185_small_decos/v_186_decos_3x2 在册=活成员）
  204,                   // Crimtane（:845）
  211,                   // Chlorophyte（:859）
  221, 222, 223,         // Palladium/Orichalcum/Titanium（:879-883）
  262, 263, 264, 265, 266, 267, 268, // Amethyst..Amber Gemspark（:961-973;Main.cs:10478 循环）
  346, 347, 348,         // ChlorophyteBrick/CrimtaneBrick/ShroomitePlating（:1129-1133）
  370,                   // MeteoriteBrick（:1177）
  407,                   // FossilOre（:1251）
  441, 467, 468,         // FakeContainers/Containers2/FakeContainers2（:1319-1373）
  566,                   // AmberStoneBlock（:1569）
  639,                   // ManaCrystal 魔力水晶（:1715）
  680, 681, 682, 685, 686, // Ancient 金/银/铜/钴/秘银砖（:1797-1809）
]);

/** Main.shine case 204(Crimtane)/211(Chlorophyte) 脉动支：num = 0.3 +
 *  mouseTextColor/300（Main.cs:21886/:21892；mouseTextColor 190↔255 步进 1/帧 =
 *  呼吸）。tint 逐帧变 → 不进 chunk 烘焙，走 drawTileShineGrid 逐帧动态支。 */
export function isPulseShineSheet(sheet: number): boolean {
  return sheet === 204 || sheet === 211;
}

/** Main.shine 加法支：case 262-268 Gemspark 顶点色 += 0.39（switch case 直落 break，
 *  不吃 ×1.6 缺省支）。两个重载形态：Vector3 重载（Main.cs:21920-21930,GetFinalLight
 *  Vector3 路 :4438 消费）XYZ += 0.39；Color 重载（Main.cs:21828-21830,:4424 消费）
 *  逐通道 +100/255 后尾段钳 255（:21850-21856）——亮处（L≈1 的 Gemspark 自光域）
 *  +0.39 被钳没。交付层 = 合成后平加（drawTileShineAdditive,精度边界见其注）。 */
export const SHINE_ADDITIVE = 0.39;
export function isAdditiveShineSheet(sheet: number): boolean {
  return sheet >= 262 && sheet <= 268;
}

/** Main.shine 逐 case 乘区（Main.cs:21874-21927 全 case 提取；Vector3 重载，
 *  未列通道 = ×1）。default 支 = tileShine2[type] → 全通道 ×(1+0.6)。 */
export function shineMultiplier(sheet: number, mouseTextColor: number): [number, number, number] {
  switch (sheet) {
    case 25:    return [0.95, 0.85, 1.1];            // :21875-21879
    case 117:   return [1.1, 1, 1.2];                // :21880-21884（Y 不动）
    case 204: {                                      // :21885-21890（X×1.3×num）
      const num = 0.3 + mouseTextColor / 300;
      return [1.3 * num, 1, 1];
    }
    case 211: {                                      // :21891-21896（Y×1.5×num Z×1.1×num）
      const num = 0.3 + mouseTextColor / 300;
      return [1, 1.5 * num, 1.1 * num];
    }
    case 147:                                        // :21897-21901（147/161 同支）
    case 161:   return [1.1, 1.12, 1.15];
    case 163:   return [1.05, 1.1, 1.15];            // :21902-21906
    case 164:   return [1.1, 1.1, 1.2];              // :21907-21911
    case 178:   return [1.5, 1.5, 1.5];              // :21912-21917（num4=0.5）
    // case 185/186（SmallPiles/LargePiles ×1.3,Main.cs:21913-21919）——★F6a 销账：
    //  旧注"tileShine2[185/186] 无赋值（全库 grep 零命中）→ dead for tiles"系
    //  截断假象：TileDrawing.cs:5223-5231/:5239-5247 GetTileDrawData 按堆叠帧
    //  【动态赋值】（185: frameY==18 ∧ frameX∈[576,882]；186: frameX∈[864,1170]），
    //  这些帧原版吃 ×1.3（帧门见 shouldTileShine）。
    case 185:
    case 186:   return [1.3, 1.3, 1.3];
    case 262:                                        // :21924-21931 加法支（不走乘法）
    case 263:
    case 264:
    case 265:
    case 266:
    case 267:
    case 268:   return [1, 1, 1];
    default:
      // :21932-21939 default：tileShine2[type] → ×(1+num)，num=0.6
      return SHINE2_SHEETS.has(sheet) ? [1.6, 1.6, 1.6] : [1, 1, 1];
  }
}

/** Main.shine 尾段 shimmer lerp（Main.cs:21940-21953）：shimmerAlpha>0 时向
 *  shimmerShine(1.2,1.0,1.6) 逐通道 lerp → 乘子 (1+0.2a, 1, 1+0.6a)。
 *  原版 lerp 后逐通道钳 1（钳在光上）；本仓钳位在合成（登记近似②）。 */
export function shimmerTailMultiplier(shimmerAlpha: number): [number, number, number] {
  if (shimmerAlpha <= 0) return [1, 1, 1];
  return [1 + 0.2 * shimmerAlpha, 1, 1 + 0.6 * shimmerAlpha];
}

/** ShouldTileShine 1:1（TileDrawing.cs:4443-4471）。vanillaSolid = Main.tileSolid[type]。
 *  ★F6a：frameY 形参（缺省 0,既有调用面零改动）——仅 185 的动态赋值帧门需要
 *  （TileDrawing.cs:5223-5231 `tileFrameY == 18 && tileFrameX >= 576 && <= 882`）；
 *  186 只看 frameX（:5239-5247）。两门上界【闭】区间,与 467/468 的 <178 开区间
 *  不同源,勿归一。 */
export function shouldTileShine(
  sheet: number, frameX: number, vanillaSolid: boolean, shimmerAlpha: number,
  frameY = 0,
): boolean {
  if ((shimmerAlpha > 0 && vanillaSolid) || sheet === 165 || sheet === 693 || sheet === 694) {
    return true;
  }
  if (!SHINE2_SHEETS.has(sheet)) return false;
  if (sheet === 185) return frameY === 18 && frameX >= 576 && frameX <= 882;  // :5223-5231 动态帧门
  if (sheet === 186) return frameX >= 864 && frameX <= 1170;                  // :5239-5247 动态帧门
  if (sheet === 467 || sheet === 468) return frameX >= 144 && frameX < 178;   // :4463-4468
  if (sheet === 21 || sheet === 441) return frameX >= 36 && frameX < 178;     // :4469-4474
  return true;                                                                // :4475 default
}

// Main.tileSolid：journeycat 字面量表优先（TileID.cs/Main.cs 字面量提取），表外回落
// repo def.solid（登记近似④）。memoize：动态支逐帧查询。
const SHEET_SOLID = new Map<number, boolean>();
function vanillaTileSolid(sheet: number): boolean {
  let v = SHEET_SOLID.get(sheet);
  if (v === undefined) {
    const hit = (catRaw as { tileSolid?: Record<string, number> }).tileSolid?.[String(sheet)];
    v = hit !== undefined ? hit !== 0
      : !!TILE_DEFS.find((d) => d?.vanilla?.sheet === sheet)?.solid;
    SHEET_SOLID.set(sheet, v);
  }
  return v;
}

/** 乘法 delta（(k−1)⁺ 逐通道；负通道钳 0——登记近似①）。null = 零 delta（跳过）。 */
export function shineDelta(
  sheet: number, mouseTextColor: number, shimmerAlpha: number,
): [number, number, number] | null {
  const k = shineMultiplier(sheet, mouseTextColor);
  const tail = shimmerTailMultiplier(shimmerAlpha);
  const dR = Math.max(0, k[0] * tail[0] - 1);
  const dG = Math.max(0, k[1] * tail[1] - 1);
  const dB = Math.max(0, k[2] * tail[2] - 1);
  if (dR <= 0 && dG <= 0 && dB <= 0) return null;
  return [dR, dG, dB];
}

// ---- 绘制层 ----

interface ShineChunkEntry {
  /** 乘法 delta 层（合成前 'lighter' 叠进世界层；undefined = 本 chunk 无乘法支格） */
  mul?: HTMLCanvasElement;
  /** +0.39 平加层（合成后叠；undefined = 本 chunk 无 Gemspark 格） */
  add?: HTMLCanvasElement;
  _mulCtx?: CanvasRenderingContext2D;
  _addCtx?: CanvasRenderingContext2D;
  shimmerQ: number;
}

const S = CHUNK * TILE;          // 256
const PAD = 12;                  // 逐格 scratch 留白（18px 格盒 ±1 + tileTop 溢出带）
const SCR = TILE + PAD * 2;      // 40

const shineCache = new WeakMap<ChunkPair, ShineChunkEntry>();
let scratch: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;
let mask: HTMLCanvasElement | null = null;
let maskCtx: CanvasRenderingContext2D | null = null;

function devTools(): { s: CanvasRenderingContext2D; m: CanvasRenderingContext2D;
  sc: HTMLCanvasElement; mk: HTMLCanvasElement } | null {
  if (typeof document === 'undefined') return null;
  if (!scratch) {
    scratch = document.createElement('canvas');
    scratch.width = SCR; scratch.height = SCR;
    scratchCtx = scratch.getContext('2d');
    mask = document.createElement('canvas');
    mask.width = SCR; mask.height = SCR;
    maskCtx = mask.getContext('2d');
  }
  return scratchCtx && maskCtx && scratch && mask
    ? { s: scratchCtx, m: maskCtx, sc: scratch, mk: mask }
    : null;
}

/** 与 chunk 烘焙同款 merge 谓词（ChunkCache.ts:716 `(t) => t === type || frameMergesWith(type, t)`） */
function sameFn(type: number): (t: number) => boolean {
  return (t: number) => t === type || frameMergesWith(type, t);
}

/** 逐格烘 delta：drawVanillaCell 画进 scratch（与底图同一渲染权威——blend 邻接取帧/
 *  坡面/半砖/衔接帧/宝箱姿态/动画帧行/油漆全同源），multiply 烘 delta 色，
 *  destination-in 裁回 alpha，再整幅盖到 dest。dest 盒 = (dx,dy,dw,dh)，
 *  chunk 烘焙路径 1:1（dx=lx*16−PAD）；逐帧动态路径按格设备缩放。 */
function stampShineCell(
  atlas: SpriteAtlas, world: World, x: number, y: number,
  sheet: number, frame: 'auto' | 'style' | 'blend', fw: number, fh: number,
  type: number, fx: number, fy: number,
  delta: [number, number, number],
  dest: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number,
  additiveFlat = false,
): void {
  const t = devTools();
  if (!t) return;
  const { s, m, sc, mk } = t;
  const van = TILE_DEFS[type]?.vanilla;
  if (!van) return;
  const st = world.store;
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.clearRect(0, 0, SCR, SCR);
  m.setTransform(1, 0, 0, 1, 0, 0);
  m.clearRect(0, 0, SCR, SCR);
  s.imageSmoothingEnabled = false;
  // 与底图同源调用面（ChunkCache.ts:712-724）：px/py=PAD 是自由目标参数，
  // x/y 是取帧/邻接逻辑坐标——内容落在 scratch [PAD−1, PAD+17) 18px 格盒，
  // 格芯 16×16 = [PAD, PAD+16)。
  drawVanillaCell(
    s, atlas, sheet, frame, fw, fh,
    st, x, y, type,
    sameFn(type),
    PAD, PAD, fx, fy,
    undefined,
    chestLidPoseAt(world.chests, x, y, fx, fy),
  );
  // alpha 蒙版 = delta 烘焙前的格形状（multiply 会把透明像素染成实色——裁回，
  // 手法同 TileFlames.tintedFlameCell :498-500；蒙版须拷贝而非重画源矩形：
  // drawVanillaCell 输出含坡切/半砖/衔接帧等非源矩形成分）
  m.drawImage(sc, 0, 0);
  // 油漆（原版 tileShader 按格取 paint；本仓 = 烘焙侧 tintRegion 16×16 格芯语义，
  // ChunkCache.ts:805-814 同式——溢出带不上漆与底图一致）
  const paint = st.paint[st.idx(x, y)];
  if (paint > 0) {
    const special: LeafPaintSettings | undefined = paint >= 1 && paint <= 12
      ? getTilePaintSettings(sheet, 0) ?? undefined : undefined;
    s.globalCompositeOperation = 'source-over';
    tintRegion(s, sc, PAD, PAD, paint, PAD, PAD, false, special);
  }
  // delta 色 = (k−1)⁺（乘法支）/ 0.39 恒值（Gemspark 加法支——合成后平加,不经乘光）
  const dR = additiveFlat ? SHINE_ADDITIVE : delta[0];
  const dG = additiveFlat ? SHINE_ADDITIVE : delta[1];
  const dB = additiveFlat ? SHINE_ADDITIVE : delta[2];
  if (dR <= 0 && dG <= 0 && dB <= 0) return;
  s.globalCompositeOperation = 'multiply';
  const q = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  s.fillStyle = `rgb(${q(dR)},${q(dG)},${q(dB)})`;
  s.fillRect(0, 0, SCR, SCR);
  s.globalCompositeOperation = 'destination-in';
  s.drawImage(mk, 0, 0);
  s.globalCompositeOperation = 'source-over';
  dest.drawImage(sc, dx, dy, dw, dh);
}

function bakeShineChunk(
  atlas: SpriteAtlas, world: World, cx: number, cy: number, shimmerQ: number,
): ShineChunkEntry {
  const entry: ShineChunkEntry = { shimmerQ };
  const st = world.store;
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const x = x0 + lx, y = y0 + ly;
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      // 原版语义:非活性格不渲染（TileRunner 会给空气格写幽灵 type）;bit0 = active
      // 位（TileStore flags 编码注）——幽灵格清扫 doctrine = active() 消费者读 bit0
      if (!st.hasTile(x, y)) continue;
      const type = st.type[i];
      const van = TILE_DEFS[type]?.vanilla;
      if (!van) continue;
      const sheet = van.sheet;
      // 动画格不进静态烘焙（ChunkCache 同款分工,isDynamicAnimSheet）
      if (isDynamicAnimSheet(sheet)) continue;
      // 脉动支（204 Crimtane/211 Chlorophyte）逐帧动态,烘焙会冻结呼吸
      if (isPulseShineSheet(sheet)) continue;
      // 已致动（inActive）→ 原版走 actColor 分支,不吃 shine（TileDrawing.cs:4438）
      if ((st.wire[i] & TileStore.WIRE_ACTUATED) !== 0) continue;
      // 回声隐形块不绘制（TileDrawing.IsVisible :1434-1452;ChunkCache 同门）
      if ((st.coat[i] & TileStore.COAT_INVISIBLE_BLOCK) !== 0 && !st.showInvisibleBlocks) continue;
      // 荧光涂层块：GetFinalLight(Color) :4408 fullbrightBlock→White 先于 shine,
      // White×1.6 钳回白 = shine 被吸收;glow 叠层已全亮,再叠 delta 必过亮 → 跳过
      if ((st.coat[i] & TileStore.COAT_FULLBRIGHT_BLOCK) !== 0) continue;
      const additive = isAdditiveShineSheet(sheet);
      const delta = additive ? null : shineDelta(sheet, 0, shimmerQ);
      if (!additive && !delta) continue;
      if (!shouldTileShine(sheet, st.frameX[i], vanillaTileSolid(sheet), shimmerQ, st.frameY[i])) continue;
      if (additive) {
        if (!entry.add) {
          entry.add = document.createElement('canvas');
          entry.add.width = S; entry.add.height = S;
          const ac = entry.add.getContext('2d')!;
          ac.imageSmoothingEnabled = false;
          entry._addCtx = ac;
        }
        stampShineCell(atlas, world, x, y, sheet, van.frame, van.fw ?? 1, van.fh ?? 1,
          type, st.frameX[i], st.frameY[i], [0, 0, 0],
          entry._addCtx!, lx * TILE - PAD, ly * TILE - PAD, SCR, SCR, true);
      } else if (delta) {
        if (!entry.mul) {
          entry.mul = document.createElement('canvas');
          entry.mul.width = S; entry.mul.height = S;
          const mc = entry.mul.getContext('2d')!;
          mc.imageSmoothingEnabled = false;
          entry._mulCtx = mc;
        }
        stampShineCell(atlas, world, x, y, sheet, van.frame, van.fw ?? 1, van.fh ?? 1,
          type, st.frameX[i], st.frameY[i], delta,
          entry._mulCtx!, lx * TILE - PAD, ly * TILE - PAD, SCR, SCR);
      }
    }
  }
  return entry;
}

function ensureEntry(
  atlas: SpriteAtlas, world: World, pair: ChunkPair, cx: number, cy: number, shimmerQ: number,
): ShineChunkEntry {
  const e = shineCache.get(pair);
  if (e && e.shimmerQ === shimmerQ) return e;
  const ne = bakeShineChunk(atlas, world, cx, cy, shimmerQ);
  shineCache.set(pair, ne);
  return ne;
}

export interface ShineDev { zz: number; ox: number; oy: number; camRX: number; camRY: number }

/** 乘法 delta 层（render() 世界段、drawAnimatedTileLayer 之后调用）。ctx 处于世界
 *  变换;本函数按 drawChunkGrid 同款 save→恒等 setTransform→设备矩形→restore
 *  （与底图 chunk 共享边同 round 表达式,像素级配准;设备数学处于恒等武装态内 =
 *  dynnap-space-wrapper doctrine）。逐帧动态支（动画 shine 格 + 脉动矿）同函数
 *  尾段交付。 */
export function drawTileShineGrid(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, world: World,
  chunks: { get(cx: number, cy: number): ChunkPair },
  cam: Camera, viewW: number, viewH: number, z: number,
  dev: ShineDev, shimmerAlpha: number, mouseTextColor: number,
): void {
  const st = world.store;
  // 调试逃生门（同 __SW_DYNSNAP_OFF 惯例）：A/B 探针/取证时秒关本通道
  if ((globalThis as { __SW_SHINE_OFF?: boolean }).__SW_SHINE_OFF) return;
  // shimmer 量化进 cache 键（微光浸没期重烘节流;8 档/全程,档间强度阶跃不可感）
  const shimmerQ = shimmerAlpha > 0 ? Math.min(1, Math.ceil(shimmerAlpha * 8) / 8) : 0;
  // chunk 界（drawCoatGlowGrid 同式）
  const bx0 = Math.floor((cam.x - viewW / 2 / z) / (CHUNK * TILE)) - 1;
  const bx1 = Math.floor((cam.x + viewW / 2 / z) / (CHUNK * TILE)) + 1;
  const by0 = Math.floor((cam.y - viewH / 2 / z) / (CHUNK * TILE)) - 1;
  const by1 = Math.floor((cam.y + viewH / 2 / z) / (CHUNK * TILE)) + 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);   // 恒等武装（dynsnap doctrine;设备数学在此内）
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';   // A=0 预乘加色语义（同 TileFlames 文件头注）
  try {
    for (let cy = by0; cy <= by1; cy++) {
      for (let cx = bx0; cx <= bx1; cx++) {
        if (cx < 0 || cy < 0 || cx * CHUNK >= world.w || cy * CHUNK >= world.h) continue;
        const e = ensureEntry(atlas, world, chunks.get(cx, cy), cx, cy, shimmerQ);
        if (!e.mul) continue;
        // 设备矩形 = drawChunkGrid 同一表达式（共享边同 round → 与底图像素配准）
        const xd0 = dev.ox + Math.round((cx * CHUNK * TILE - dev.camRX) * dev.zz);
        const yd0 = dev.oy + Math.round((cy * CHUNK * TILE - dev.camRY) * dev.zz);
        const xd1 = dev.ox + Math.round(((cx + 1) * CHUNK * TILE - dev.camRX) * dev.zz);
        const yd1 = dev.oy + Math.round(((cy + 1) * CHUNK * TILE - dev.camRY) * dev.zz);
        ctx.drawImage(e.mul, 0, 0, S, S, xd0, yd0, xd1 - xd0, yd1 - yd0);
      }
    }
    // ---- 逐帧动态支：动画 shine 格（12 生命水晶/639 魔力水晶…）+ 脉动矿（204/211）----
    //   界 = drawAnimatedTileLayer 同式;格盒设备缩放 s 与其 dev 数学同源（配准底图）
    const tx0 = Math.max(0, Math.floor((cam.x - viewW / 2 / z) / TILE) - 1);
    const tx1 = Math.min(world.w - 1, Math.ceil((cam.x + viewW / 2 / z) / TILE) + 1);
    const ty0 = Math.max(0, Math.floor((cam.y - viewH / 2 / z) / TILE) - 1);
    const ty1 = Math.min(world.h - 1, Math.ceil((cam.y + viewH / 2 / z) / TILE) + 1);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!st.hasTile(tx, ty)) continue;
        const i = st.idx(tx, ty);
        const type = st.type[i];
        const van = TILE_DEFS[type]?.vanilla;
        if (!van) continue;
        const sheet = van.sheet;
        if (!isDynamicAnimSheet(sheet) && !isPulseShineSheet(sheet)) continue;
        if ((st.wire[i] & TileStore.WIRE_ACTUATED) !== 0) continue;
        if ((st.coat[i] & TileStore.COAT_INVISIBLE_BLOCK) !== 0 && !st.showInvisibleBlocks) continue;
        if ((st.coat[i] & TileStore.COAT_FULLBRIGHT_BLOCK) !== 0) continue;
        if (!shouldTileShine(sheet, st.frameX[i], vanillaTileSolid(sheet), shimmerAlpha, st.frameY[i])) continue;
        const additive = isAdditiveShineSheet(sheet);
        const delta = additive ? null : shineDelta(sheet, mouseTextColor, shimmerAlpha);
        if (!additive && !delta) continue;
        const dxa = dev.ox + Math.round((tx * TILE - dev.camRX) * dev.zz);
        const dxb = dev.ox + Math.round(((tx + 1) * TILE - dev.camRX) * dev.zz);
        const dya = dev.oy + Math.round((ty * TILE - dev.camRY) * dev.zz);
        const s = (dxb - dxa) / TILE;
        if (s <= 0) continue;
        if (additive) {
          stampShineCell(atlas, world, tx, ty, sheet, van.frame, van.fw ?? 1, van.fh ?? 1,
            type, st.frameX[i], st.frameY[i], [0, 0, 0],
            ctx, dxa - PAD * s, dya - PAD * s, SCR * s, SCR * s, true);
        } else if (delta) {
          stampShineCell(atlas, world, tx, ty, sheet, van.frame, van.fw ?? 1, van.fh ?? 1,
            type, st.frameX[i], st.frameY[i], delta,
            ctx, dxa - PAD * s, dya - PAD * s, SCR * s, SCR * s);
        }
      }
    }
  } finally {
    ctx.restore();
  }
}

/** +0.39 平加层（render() 光照合成后、drawCoatGlowGrid 之后调用）。设备矩形与
 *  drawCoatGlowGrid 同式（含低清 wKg 约定——同先例同空间）。'lighter' 平加 =
 *  原版 case 262-268 顶点色 +=0.39 的 sprite×0.39 项。★F6b（2026-09-08 注释销账,
 *  行为不动=登记近似②既有备案）精度边界如实声明：原版把 +0.39 加在【光】上再
 *  逐通道钳 1（Color 重载 +100/255 后钳 255,Main.cs:21828-21830/:21850-21856）——
 *  亮 texel（L≈1 的 Gemspark 自光域）+0.39 被钳没=原版零增量;本仓合成后平加,
 *  亮 texel 最多 +39% 过亮（近似上界）。暗区恒精确：L 小时钳不触发,平加 =
 *  sprite×(L+0.39) ≡ 原版 sprite×clamp(L+0.392)（本通道目标域）。 */
export function drawTileShineAdditive(
  ctx: CanvasRenderingContext2D, world: World,
  chunks: { get(cx: number, cy: number): ChunkPair },
  cam: Camera, viewW: number, viewH: number, z: number, lowK: number,
): void {
  if ((globalThis as { __SW_SHINE_OFF?: boolean }).__SW_SHINE_OFF) return;
  const wKg = lowK || 1;
  const lwg = Math.round(viewW * wKg), lhg = Math.round(viewH * wKg);
  const ox = Math.round(lwg / 2), oy = Math.round(lhg / 2);
  const zz = z * wKg;
  const camRX = Math.round(cam.x * z) / z;
  const camRY = Math.round(cam.y * z) / z;
  const bx0 = Math.floor((cam.x - viewW / 2 / z) / (CHUNK * TILE)) - 1;
  const bx1 = Math.floor((cam.x + viewW / 2 / z) / (CHUNK * TILE)) + 1;
  const by0 = Math.floor((cam.y - viewH / 2 / z) / (CHUNK * TILE)) - 1;
  const by1 = Math.floor((cam.y + viewH / 2 / z) / (CHUNK * TILE)) + 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  try {
    for (let cy = by0; cy <= by1; cy++) {
      for (let cx = bx0; cx <= bx1; cx++) {
        if (cx < 0 || cy < 0 || cx * CHUNK >= world.w || cy * CHUNK >= world.h) continue;
        const e = shineCache.get(chunks.get(cx, cy));
        if (!e?.add) continue;
        const xd0 = ox + Math.round((cx * CHUNK * TILE - camRX) * zz);
        const yd0 = oy + Math.round((cy * CHUNK * TILE - camRY) * zz);
        const xd1 = ox + Math.round(((cx + 1) * CHUNK * TILE - camRX) * zz);
        const yd1 = oy + Math.round(((cy + 1) * CHUNK * TILE - camRY) * zz);
        ctx.drawImage(e.add, 0, 0, S, S, xd0, yd0, xd1 - xd0, yd1 - yd0);
      }
    }
  } finally {
    ctx.restore();
  }
}
