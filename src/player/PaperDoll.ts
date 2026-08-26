// 纸娃娃合成：把灰度通道帧表（Player_{v}_{n}.png + Player_Hair_N.png）调色合成为一张
// 40×(20×56) 的完整帧表，缓存复用。通道映射实测自 PlayerDrawLayers.cs：
//   0 头/3,5,7,9 身体/10 腿 = skinColor；4,8 = undershirt；6,13,14 = shirt；
//   11 = pants；12 = shoes；1 = 眼白(白)；2 = 瞳孔(eyeColor)；发型表 14 帧对齐身体帧 6-19。
import { bitmapize, freeBaked, type Baked } from '../render/bitmapize';
import { type Appearance, backHairDraw, MALE_VARIANTS } from './Appearance';
import { UITextures } from '../vui/assets/UITextures';
import { noteVuiConsumer } from '../assets/SpriteAtlas';
import { texReady } from '../render/texId';

export const BODY_FRAMES = 20;     // 身体帧数
export const FRAME_W = 40;
export const FRAME_H = 56;
export const HAIR_FRAMES = 14;     // 发型表帧数（对齐身体帧 6..19）

/** 通道索引 → 外观颜色字段（竖条 20 帧布局：头/眼/腿/裤/鞋） */
const VERTICAL_CHANNELS: Array<{ sheet: number; color: keyof Appearance | 'white' }> = [
  { sheet: 10, color: 'skinColor' },   // 腿皮肤
  { sheet: 11, color: 'pantsColor' },
  { sheet: 12, color: 'shoeColor' },
  { sheet: 0, color: 'skinColor' },    // 头
  { sheet: 1, color: 'white' },        // 眼白
  { sheet: 2, color: 'eyeColor' },     // 瞳
];

/**
 * 复合帧网格映射（1.4.5.6 PlayerDrawSet.CreateCompositeData：躯干/手臂/肩为 9列×4行 网格，
 * CreateCompositeFrameRect = x*40 + y*56；男用 0-1 行，女 +2 行）。
 * ★ 臂部像素偏移勘误(2026-08-10,用户报"部件不够贴合"):原版 GetCompositeOffset
 * (:4189-4197 的后臂 +6/+2、前臂 -5/0)是 DrawData 的 position 与 origin **共用**偏移——
 * 两者相消,所有复合部件左上角一律对齐躯干锚点(headgear 微偏除外),偏移量只作旋转轴心
 * (将来做 use 手臂旋转时 pivot = bodyVect(20,28)+偏移)。此前误当烘焙位移,导致后臂整体
 * 偏右下 (6,2)、前臂偏左 (5,0)——已归零对齐。
 * 前臂帧表 frameIndex2（按 bodyFrame 行 0..19）：
 *   0→(2,0) 1→(3,0) 2→(4,0) 3→(5,0) 4→(6,0) 5→(2,1) 6→(3,1)
 *   7-10→(4,1) 11-13→(3,1) 14→(5,1) 15,16→(6,1) 17→(5,1) 18,19→(3,1)
 * 后臂 = 前臂 Y+2；躯干 (0,0)（行5=跳跃 (1,0)）；后肩 (1,1)；前肩 (0,1)。
 */
const ARM_FRAME: ReadonlyArray<readonly [number, number]> = [
  [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [2, 1], [3, 1],
  [4, 1], [4, 1], [4, 1], [4, 1], [3, 1], [3, 1], [3, 1],
  [5, 1], [6, 1], [6, 1], [5, 1], [3, 1], [3, 1],
];

/** GetHairSettings（1456 Player.cs:16645-16760，switch(head) 精确提取）：
 *  fullHair 头盔露出完整发型 / hatHair 露出特制帽子发型(Player_HairAlt) / 其余完全隐藏 */
const FULL_HAIR_HEADS = new Set([10, 12, 28, 42, 62, 97, 106, 113, 116, 119, 133, 138, 139, 163, 178, 181, 191, 198, 217, 218, 220, 222, 224, 225, 228, 229, 230, 232, 235, 238, 242, 243, 244, 245, 272, 273, 274, 277, 284, 290]);
const HAT_HAIR_HEADS = new Set([13, 14, 15, 16, 18, 21, 24, 25, 26, 29, 40, 44, 51, 56, 59, 60, 63, 64, 65, 67, 68, 69, 81, 92, 94, 95, 100, 114, 121, 126, 130, 136, 140, 143, 145, 158, 159, 161, 182, 184, 190, 195, 215, 216, 219, 223, 226, 227, 231, 233, 234, 262, 263, 264, 265, 267, 275, 279, 280, 281, 286, 289, 292]);

/** 发型层信息（发色剂渲染拆层用）：mode=隐藏时 null */
export interface DollHairLayer {
  mode: 'full' | 'alt';
  /** 贴图名（Player_Hair_N / Player_HairAlt_N） */
  src: string;
  /** 后发层（backHairDraw :16771）——true 时全帧高先画、前发层只画顶部 26px */
  back: boolean;
}

/** 头盔下的发型档（GetHairSettings；compositePaperDoll 与发色剂叠层共用同一判定） */
export function dollHairLayer(a: Appearance, headIdx: number): DollHairLayer | null {
  const mode = headIdx === 0 || FULL_HAIR_HEADS.has(headIdx) ? 'full' as const
    : HAT_HAIR_HEADS.has(headIdx) ? 'alt' as const : null;
  if (!mode) return null;
  return {
    mode,
    src: mode === 'alt' ? `Player_HairAlt_${a.hair + 1}.png` : `Player_Hair_${a.hair + 1}.png`,
    back: backHairDraw(a.hair),
  };
}

/** 发色剂逐帧着色头发帧（40×56，动态染料每帧变色——不进 tintCache 防爆缓存）。
 *  复用 tint() 的 multiply+destination-in 模式，输出为共享 scratch（当帧即用勿存） */
export function hairFrameTinted(layer: DollHairLayer, row: number, color: { r: number; g: number; b: number }): Baked | null {
  const rect = UITextures.get(layer.src);
  if (!rect) return null;
  const hr = Math.max(0, Math.min(HAIR_FRAMES - 1, row - 6));
  const img = rect.img as HTMLImageElement;
  const sc = hairScratch ??= document.createElement('canvas');
  if (sc.width !== FRAME_W || sc.height !== FRAME_H) { sc.width = FRAME_W; sc.height = FRAME_H; }
  const sctx = sc.getContext('2d', { willReadFrequently: true })!;  // 发色 scratch 纯 CPU 合成,不占 IOSurface
  sctx.imageSmoothingEnabled = false;
  sctx.clearRect(0, 0, FRAME_W, FRAME_H);
  sctx.drawImage(img, 0, hr * FRAME_H, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
  sctx.globalCompositeOperation = 'multiply';
  sctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
  sctx.fillRect(0, 0, FRAME_W, FRAME_H);
  sctx.globalCompositeOperation = 'destination-in';
  sctx.drawImage(img, 0, hr * FRAME_H, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
  sctx.globalCompositeOperation = 'source-over';
  return sc;
}

/** 发色剂 scratch（每帧重画，contextlost 后内容自动补齐——勿缓存其结果） */
let hairScratch: HTMLCanvasElement | null = null;

/** 头甲贴图（Armor_Head_N.png；发色剂叠层时画在发层之后，与 composite 内层序一致） */
export function headArmorImage(headIdx: number): ImageBitmap | HTMLImageElement | null {
  if (!headIdx) return null;
  const r = UITextures.get(`Armor_Head_${headIdx}.png`);
  return r ? (r.img as HTMLImageElement) : null;
}

const cache = new Map<string, Baked>();   // 写一次合成 → 异步升格 ImageBitmap(bitmapize)
/** 调色缓存上限(2026-08-13 泄露 review):键=贴图×外观色(用户可控,键空间近无限),
 *  值=整图尺寸 canvas——无闸时长会话/选人界面拖色条无界增长(同文件 cache 有
 *  LRU 64 而此表漏配)。
 *  ★2026-08-25 二次修(用户实报"骰子随机几次后样式全空"):原"满 256 整表清空"
 *  = 数百 MB canvas 瞬间弃置 → 内存压力下浏览器丢弃存活 canvas 的后备存储 →
 *  后续 drawImage 画空气 → 烘焙空白被外观键缓存定格 = 样式全空不恢复。
 *  改【字节预算 + LRU】:超预算逐出最旧条目(纯弃引用),存活条目永不被殃及 */
const TINT_CACHE_MAX_ENTRIES = 256;
const TINT_CACHE_MAX_BYTES = 48 * 1024 * 1024;
const tintCache = new Map<string, Baked>();
let tintCacheBytes = 0;
/** WeakMap(2026-08-13):外层原为强引用 Map——会把已被 cache LRU 淘汰的合成
 *  canvas 钉住永不释放;改弱引用后源 canvas 回收时条目随之消失 */
const stealthTintCache = new WeakMap<Baked, Map<string, Baked>>();

/** 清空全部合成/调色缓存。
 *  缓存 canvas 在 GPU contextlost 后内容归零且不会自动重画——不失效就
 *  "角色/装备/时装全部隐形"(选人界面与游戏内 alike)。退出世界与进世界时调用。 */
export function clearPaperDollCache(): void {
  for (const c of cache.values()) freeBaked(c);
  for (const c of tintCache.values()) freeBaked(c);
  cache.clear();
  tintCache.clear();
  tintCacheBytes = 0;
}

function colorKey(color: { r: number; g: number; b: number }): string {
  return `${color.r},${color.g},${color.b}`;
}

/** 灰度图调色：multiply 铺色 + destination-in 用原 alpha 裁回 */
/** 贴图实例稳定 id(ImageBitmap 化后无 .src 可拼键——用 WeakMap 自增 id 防跨表碰撞) */
const tintImgId = new WeakMap<object, number>();
let tintImgSeq = 0;
function tint(img: CanvasImageSource & { width: number; height: number }, color: { r: number; g: number; b: number }): Baked {
  let id = tintImgId.get(img as object);
  if (id === undefined) { id = ++tintImgSeq; tintImgId.set(img as object, id); }
  const key = `t${id}|` + colorKey(color);
  let c: Baked | undefined = tintCache.get(key);
  if (c) return c;
  if (tintCache.size >= TINT_CACHE_MAX_ENTRIES) {  // 满即逐出最旧(防无界)
    for (const old of tintCache.values()) freeBaked(old);
    tintCache.clear();
    tintCacheBytes = 0;
  }
  const bytes = img.width * img.height * 4;
  while (tintCacheBytes + bytes > TINT_CACHE_MAX_BYTES && tintCache.size) {
    const oldest = tintCache.keys().next().value as string;
    const oldEntry = tintCache.get(oldest);
    tintCacheBytes -= (oldEntry?.width ?? 0) * (oldEntry?.height ?? 0) * 4;
    freeBaked(oldEntry);
    tintCache.delete(oldest);
  }
  const cv = document.createElement('canvas');
  c = cv;
  cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(img, 0, 0);
  tintCacheBytes += bytes;
  tintCache.set(key, c);
  bitmapize(tintCache, key);
  return c;
}

function appearanceKey(a: Appearance): string {
  return [
    a.skinVariant, a.hair,
    colorKey(a.skinColor), colorKey(a.undershirtColor), colorKey(a.pantsColor),
    colorKey(a.shoeColor), colorKey(a.shirtColor), colorKey(a.eyeColor), colorKey(a.hairColor),
  ].join('|');
}

function sheetRect(variant: number, sheet: number): ImageBitmap | HTMLImageElement | null {
  // 女性变体缺的通道回退男体（文件分布：Player_1_ 仅有 4,6,8,11,12,13）
  // 消费点埋点:回退 miss 时 vui 失配报告能给出"谁在查"
  noteVuiConsumer(`PaperDoll.sheetRect(v${variant},s${sheet})`);
  const r = UITextures.get(`Player_${variant}_${sheet}.png`) ?? UITextures.get(`Player_0_${sheet}.png`);
  return r ? (r.img as HTMLImageElement) : null;
}

/** 合成完整帧表（含发型+装备）。equip 为原版物品 id（Armor_Head_/Armor_Legs_/Armor_Armor_ 贴图索引）。
 *  opts.skipHair = 发色剂激活时拆层：头发与头甲都不进烘焙（调用方 hairFrameTinted/
 *  headArmorImage 按 后发→本体→前发→头甲 层序叠画——动态染料逐帧变色，烘焙缓存无法承载）
 *  opts.layer = stealth 视觉分层（PlayerDrawSet.cs:1523-1660）：'skin' = 皮肤/发/衣着
 *   （×s'² 消费）；'armor' = 三件甲贴图（×s' 消费，3106/蘑菇矿 B 分量 ×settled；
 *   'armorNoHead' 发色剂激活时头甲归叠层路径）。原版腿甲/身甲整体替代对应皮肤衣着
 *   （DrawPlayer_02/13 else-if 链）→ skin 层在有甲的槽位同样留空（甲覆盖语义一致） */
export type DollLayer = 'skin' | 'armor' | 'armorNoHead';
/** 三件拆分（死亡散飞用）：'head'=头皮肤/眼/发/头甲；'body'=躯干手臂复合网格+身甲；
 *  'legs'=腿皮肤/裤/鞋+腿甲——对应原版 headPosition/bodyPosition/legPosition 三层组
 *  （PlayerDrawLayers 逐层 + drawPlayer.headPosition/bodyPosition/legPosition 偏移） */
export type DollPart = 'head' | 'body' | 'legs';
/** body/legs 双行（原版身体帧 bodyFrame 与腿帧 legFrame 是两条独立状态机：
 *  Player.cs 腿链 :35718-35855、身体链 :35874-36186——use 行/静持行只钉身体，
 *  腿照常走 legFrame 循环；行走时身体同步腿（:36184-36186 bodyFrame.Y=legFrame.Y））。
 *  rows 模式烘焙出 40×56 单帧（身体件取 body 行、腿件取 legs 行） */
export interface DollRows { body: number; legs: number }
/** 抚摸复合后臂（ItemCheck_ApplyHoldStyle :49499-49508 petting 分支）：
 *  stretch = UpdateCompositeArm（PlayerDrawSet.cs:2210-2237）拉伸档帧行——
 *  0=Full / 1=ThreeQuarters（petting 仅这两档，miscCounter%14/7 两相切换，
 *  源格 = 复合网格列 8 后臂拉伸档，替代动画行后臂格）；
 *  rot = SetCompositeArmBack 传入角 −2π·(小宠 0.2 / 大宠 0.3)（右向局部空间值
 *  恒定——朝向镜像/重力翻转由消费方外层变换承担：原版 gravDir 取反 + XNA 翻转
 *  与本仓 scale(facing,1)/scale(1,-1) 镜像合成等价，见渲染侧注释） */
export interface DollPetArm { stretch: 0 | 1; rot: number }

/** 抚摸后臂档位/角度解算（ItemCheck_ApplyHoldStyle :49499-49508）：
 *  phase = pettingArmPhase（miscCounter%14/7 两相）→ 拉伸档行（UpdateCompositeArm
 *  :49499 num3==1 才 Full → 行 0；反相映射），rot = −2π·(isPetSmall?0.2:0.3)。
 *  纯函数供渲染与单测共用。 */
export function petArmParams(phase: 0 | 1, isPetSmall: boolean): DollPetArm {
  return { stretch: (1 - phase) as 0 | 1, rot: -Math.PI * 2 * (isPetSmall ? 0.2 : 0.3) };
}

/** 坐姿腿切片参数（DrawSittingLegs PlayerDrawLayers.cs:1585-1735 照抄） */
export interface DollSitting {
  /** 腿甲槽位 id（特殊切片表按 legIndex 分档；0/-1=默认切片） */
  legIndex: number;
  /** seatYOffset = -4 + (int)offsetForSeat.Y（PlayerSittingHelper.cs:29-31）——
   *  149/169/238/223 族切片表内用 vector.Y -= seatYOffset 对冲，需逐座位传值 */
  seatYOffset: number;
  /** 身甲槽位 id（193/194 族只在 body==218 时改切片） */
  body: number;
}
/** ArmorIDs.Head.Sets.HidesHead（ArmorIDs.cs:18）：头甲自带全脸时跳过 base 头/眼/眼睑
 *  （DrawPlayer_21_Head_TheFace :2577 flag 门——狼人头 38 全脸、幽灵脸 135 等） */
export const HIDES_HEAD = new Set([38, 135, 269, 282, 288]);

/** DrawSittingLegs 切片计划（局部坐标 = 帧锚点左上、朝右空间；外层 translate 已含
 *  seatYOffset 的整体座位偏移，故 evY 中 -sY 的对冲项即恢复原版净偏移）。
 *  n 从 num3 降到 0：源条 = 帧 srcRow 起 y+2n+num2、高 (n==num3 ? 56-num2-2n : 2)；
 *  目标 = (xShift+num+num4·n+num6+(n?num7:0)+num8, evY+2+num2+num5+num9) */
function sittingSlicePlan(legIndex: number, skin: boolean, bodyIdx: number, sY: number, srcRow: number):
  Array<{ sx: number; sy: number; sw: number; sh: number; dx: number; dy: number }> {
  // 默认档（PlayerDrawLayers.cs:1594-1602）：num=2/num2=42/num3=2/num4=2/num5=2
  let num = 2, num2 = 42, num3 = 2, num4 = 2, num5 = 2;
  let num6 = 0, num7 = 0, num8 = 0, num9 = 0;
  let evY = 0, xShift = 0, row = srcRow, full = false;
  if (legIndex === 169 || !skin) {
    switch (legIndex) {
      case 217: num = 0; num4 = 0; num5 = 0; num3 = 1; num2 = 0; full = true; break;
      case 149: case 171: case 172:
        num = -6; num4 = 2; num5 = 2; num3 = 4; num2 = 6; evY = 6 - sY; break;
      case 169:
        if (skin) { num = -6; num4 = 2; num5 = 2; num3 = 4; num2 = 6; evY = 6 - sY; }
        else { num = 0; num4 = 0; num5 = 0; num3 = 1; num2 = 0; evY = -sY; }  // flag(长袍) 族忽略
        break;
      case 238: case 239: num = 2; num4 = 2; num5 = -2; num2 = 42; evY = -sY; break;
      case 214: case 215: case 216:
        num = -6; num4 = 2; num5 = 2; num3 = 4; num2 = 6; evY = 6; break;
      case 106: case 143: case 226:
        num = 0; num4 = 0; num2 = 6; num5 = 0; evY = 4; row = 5; break;
      case 222: xShift = -2; break;
      case 223: xShift = -2; evY = -sY; break;
      case 132: num = -2; num7 = 2; break;
      case 193: case 194: if (bodyIdx === 218) { num = -2; num7 = 2; evY = 2; } break;
      case 177: case 178: case 181: case 182: case 206:
        num = 0; num4 = 0; num5 = 0; num3 = 1; num2 = 0; num8 = 4; num9 = 6; break;
    }
  }
  const out: Array<{ sx: number; sy: number; sw: number; sh: number; dx: number; dy: number }> = [];
  // dest Y（sY 对冲后局部值）：vector.Y(−2+sY+evY) + 2(Vector2(num,2)) + num2 + num5 + num9
  // —— −2/+2 相消 → evY + num2 + num5 + num9（默认 44；177 族可达 8+56=64 超帧底）
  const dy = evY + num2 + num5 + num9;
  for (let n = num3; n >= 0; n--) {
    let sy: number, sh: number;
    if (full) { sy = row * FRAME_H; sh = FRAME_H; }
    else {
      sy = row * FRAME_H + n * 2 + num2;
      sh = n === num3 ? FRAME_H - num2 - n * 2 : 2;
    }
    if (sh <= 0) continue;
    out.push({
      sx: 0, sy, sw: FRAME_W, sh,
      dx: xShift + num + num4 * n + num6 + (n !== 0 ? num7 : 0) + num8,
      dy,
    });
  }
  return out;
}

export function compositePaperDoll(
  a: Appearance,
  equip?: { head?: number | null; body?: number | null; legs?: number | null },
  opts?: { skipHair?: boolean; layer?: DollLayer; part?: DollPart; rows?: DollRows; sitting?: DollSitting; petArm?: DollPetArm },
): Baked | null {
  const key = appearanceKey(a) + (equip ? `|e${equip.head ?? 0},${equip.body ?? 0},${equip.legs ?? 0}` : '')
    + (opts?.skipHair ? '|nohair' : '') + (opts?.layer ? `|L${opts.layer}` : '')
    + (opts?.part ? `|P${opts.part}` : '')
    + (opts?.rows ? `|R${opts.rows.body},${opts.rows.legs}` : '')
    + (opts?.sitting ? `|S${opts.sitting.legIndex},${opts.sitting.seatYOffset},${opts.sitting.body}` : '')
    + (opts?.petArm ? `|pA${opts.petArm.stretch},${opts.petArm.rot.toFixed(4)}` : '');
  const hit = cache.get(key);
  if (hit) return hit;

  // 发型模式（GetHairSettings）：无头盔=完整；fullHair 头盔=完整；hatHair=帽子发型；其余=隐藏
  const headIdx = equip?.head ?? 0;
  const hairLayer = opts?.skipHair ? null : dollHairLayer(a, headIdx);
  const hairMode: 'full' | 'alt' | 'none' = !hairLayer ? 'none' : hairLayer.mode;
  const hairSrc = hairLayer ? hairLayer.src : '';

  // ---- 懒加载就绪预检(vanilla-ui 按需加载后必需):任一必需贴图未就绪 → 返回 null
  // 且【不缓存】(查询本身触发后台加载,消费方下帧重试)。否则首帧的空纸娃娃会被
  // 永久缓存——角色选择界面人物贴图就再也出不来了
  // part 拆分时只预检该件所需通道（死亡散飞只走 head/body/legs 各自的层组）
  const part = opts?.part;
  const needSheets = part === 'head' ? new Set<number>([0, 1, 2])
    : part === 'body' ? new Set<number>([3, 4, 5, 6, 7, 8, 13])
    : part === 'legs' ? new Set<number>([10, 11, 12])
    : new Set<number>([...VERTICAL_CHANNELS.map((ch) => ch.sheet), 3, 4, 5, 6, 7, 8, 13]);
  // ★texReady 就绪守卫(2026-08-25 用户实报"骰子随机几次后样式全空"):atlas 半加载/
  //   解码驱逐窗口内 drawImage 画不出内容,而 tint() 的 multiply+destination-in 会把
  //   不透明调色色块铺满画布 → 空白/色块 doll 被 appearanceKey 缓存+bitmapize 定格
  //   =永久空槽(texId.ts texReady 注释同款坑)。改用 texReady 实测可绘,不就绪返回
  //   null 不缓存 → CharCreation retry 链在贴图就绪帧重烘,自愈
  const ready = (name: string): boolean => {
    const r = UITextures.get(name);
    return !!r && texReady(r.img as ImageBitmap | HTMLImageElement);
  };
  for (const s of needSheets) {
    if (!ready(`Player_${a.skinVariant}_${s}.png`) && !ready(`Player_0_${s}.png`)) return null;
  }
  if (hairMode !== 'none' && (!part || part === 'head') && !ready(hairSrc)) return null;
  if (equip?.legs && (!part || part === 'legs') && !ready(`Armor_Legs_${equip.legs}.png`)) return null;
  if (equip?.body && (!part || part === 'body') && !ready(`Armor_Armor_${equip.body}.png`)) return null;
  if (equip?.head && (!part || part === 'head') && !ready(`Armor_Head_${equip.head}.png`)) return null;

  // rows 模式：单帧 40×56（body 件取 rows.body、legs 件取 rows.legs）
  const rowsMode = opts?.rows ?? null;
  const sit = opts?.sitting ?? null;
  const nFrames = rowsMode ? 1 : BODY_FRAMES;
  const c = document.createElement('canvas');
  c.width = FRAME_W;
  // 坐姿切片族（177/106 等）dest 可伸到 y=64（超帧底 8px——原版 DrawData 无裁剪、
  // 站姿帧底本有 ~2px 透明边距，脚底锚由消费方 spriteBottomPad 自适应）——扩高防截
  c.height = nFrames * FRAME_H + (sit ? 8 : 0);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const hasBackHair = hairMode !== 'none' && backHairDraw(a.hair);
  const hairRect = hairMode !== 'none' ? UITextures.get(hairSrc) : null;
  const hairTinted = hairRect ? tint(hairRect.img as HTMLImageElement, a.hairColor) : null;
  const onlyArmor = opts?.layer === 'armor' || opts?.layer === 'armorNoHead';
  const noArmor = opts?.layer === 'skin';
  // part 拆分门：head=发/头皮肤/眼白/瞳+头甲；body=复合网格+身甲；legs=腿皮肤/裤/鞋+腿甲
  const wantHead = !part || part === 'head';
  const wantBody = !part || part === 'body';
  const wantLegs = !part || part === 'legs';
  // HIDES_HEAD 头甲（ArmorIDs.Head.Sets.HidesHead）：狼人头 38 等全脸头甲跳过 base
  // 头皮肤/眼白/瞳（DrawPlayer_21_TheFace :2577-2580 flag 门；眼睑由渲染侧同门跳过）
  const hidesFace = HIDES_HEAD.has(equip?.head ?? 0);
  // 后发层（1.4.4+ PlayerDrawLayers:206-212：backHairDraw 时画在身体之后，即先画）
  if (!onlyArmor && wantHead && hairTinted && hasBackHair) {
    for (let i = 0; i < nFrames; i++) {
      const row = rowsMode ? rowsMode.body : i;
      const hr = Math.max(0, Math.min(HAIR_FRAMES - 1, row - 6));
      ctx.drawImage(hairTinted, 0, hr * FRAME_H, FRAME_W, FRAME_H, 0, i * FRAME_H, FRAME_W, FRAME_H);
    }
  }

  // ---- 竖条通道（腿/裤/鞋/头/眼：20 帧直排） ----
  const legsArmor = equip?.legs ? UITextures.get(`Armor_Legs_${equip.legs}.png`) : null;
  for (const ch of onlyArmor ? [] : VERTICAL_CHANNELS) {
    // part 拆分：竖条通道仅 10/11/12（腿组）与 0/1/2（头组）——body 件无竖条
    if (part && part !== (ch.sheet >= 10 && ch.sheet <= 12 ? 'legs' : 'head')) continue;
    if (legsArmor && (ch.sheet === 10 || ch.sheet === 11 || ch.sheet === 12)) continue; // 腿甲整体替代腿皮肤/裤/鞋（DrawPlayer_02 else-if）
    if (hidesFace && ch.sheet <= 2) continue;   // HidesHead：跳过头/眼白/瞳
    const img = sheetRect(a.skinVariant, ch.sheet);
    if (!img) continue;
    const color = ch.color === 'white' ? { r: 255, g: 255, b: 255 } : (a[ch.color] as { r: number; g: number; b: number });
    const tinted = tint(img, color);
    const isLegCh = ch.sheet >= 10 && ch.sheet <= 12;
    for (let i = 0; i < nFrames; i++) {
      const row = rowsMode ? (isLegCh ? rowsMode.legs : rowsMode.body) : i;
      if (sit && isLegCh) {
        // 坐姿腿切片（DrawPlayer_12_Skin_Composite :1289 / 13_Leggings :1497：皮肤族
        // legIndex==169 才走特殊表，其余默认切片）
        for (const s of sittingSlicePlan(equip?.legs ?? 0, true, equip?.body ?? 0, sit.seatYOffset, row)) {
          ctx.drawImage(tinted, s.sx, s.sy, s.sw, s.sh, s.dx, i * FRAME_H + s.dy, s.sw, s.sh);
        }
        continue;
      }
      ctx.drawImage(tinted, 0, row * FRAME_H, FRAME_W, FRAME_H, 0, i * FRAME_H, FRAME_W, FRAME_H);
    }
  }
  // 腿甲（竖条 20 帧，Armor_Legs_{id} 替代 pants+shoes；坐姿走切片表全档 :1473）
  if (legsArmor && !noArmor && wantLegs) {
    for (let i = 0; i < nFrames; i++) {
      const row = rowsMode ? rowsMode.legs : i;
      if (sit) {
        for (const s of sittingSlicePlan(equip?.legs ?? 0, false, equip?.body ?? 0, sit.seatYOffset, row)) {
          ctx.drawImage(legsArmor.img, s.sx, s.sy, s.sw, s.sh, s.dx, i * FRAME_H + s.dy, s.sw, s.sh);
        }
        continue;
      }
      ctx.drawImage(legsArmor.img, 0, row * FRAME_H, FRAME_W, FRAME_H, 0, i * FRAME_H, FRAME_W, FRAME_H);
    }
  }

  // ---- 复合网格通道（躯干/手臂/肩：9×4 网格，按 CreateCompositeData 逐行映射） ----
  const female = !MALE_VARIANTS.includes(a.skinVariant);
  const dy = female ? 2 : 0;
  const under = a.undershirtColor, shirt = a.shirtColor;
  // 抚摸复合后臂（petting）：后臂换列 8 拉伸档格（Full=行0/ThreeQuarters=行1，
  // UpdateCompositeArm 帧覆写 PlayerDrawSet.cs:2210-2237）绕肩轴旋转——替代
  // 动画行后臂格（compBackArmFrame 同格语义，DrawPlayer_12_SkinComposite_
  // BackArmShirt :1317-1426 全层共用）。旋转轴 = bodyVect(20,28)+
  // GetCompositeOffset_BackArm(6,2) = (26,30)（:4189-4192；position/origin 共
  // 偏移相消 → 部件左上对齐帧锚，偏移仅是 pivot——见文件头勘误注）。
  const pet = opts?.petArm ?? null;
  const PET_ARM_PIVOT: readonly [number, number] = [26, 30];
  // 身甲（Armor/Armor_{id} 复合网格，与玩家复合通道同构；有身甲时替代全部衣着层）
  const bodyArmor = equip?.body ? UITextures.get(`Armor_Armor_${equip.body}.png`) : null;
  const bodyArmorImg = bodyArmor ? (bodyArmor.img as HTMLImageElement) : null;
  const gridRect = (sheet: number, x: number, y: number, color: { r: number; g: number; b: number }) => {
    return { sheet, x, y, color };
  };
  for (let i = 0; i < nFrames; i++) {
    const row = rowsMode ? rowsMode.body : i;    // 复合网格属 body 件（bodyFrame 行）
    if (!wantBody) break;                        // part 拆分：复合网格只属 body 件
    if (onlyArmor && !bodyArmorImg) continue;    // armor 层无身甲槽则该层为空
    if (noArmor && bodyArmorImg) continue;       // skin 层身甲槽留空（甲覆盖语义）
    const torsoX = row === 5 ? 1 : 0;
    const arm = ARM_FRAME[row];
    const drawTinted = (img: ImageBitmap | HTMLImageElement, x: number, y: number, color: { r: number; g: number; b: number }, rot = 0) => {
      if (rot === 0) {
        // 全部部件左上角对齐帧锚点(原版 position-origin 相消;臂偏移仅是旋转 pivot,见文件头)
        ctx.drawImage(tint(img, color), x * FRAME_W, y * FRAME_H, FRAME_W, FRAME_H,
          0, i * FRAME_H, FRAME_W, FRAME_H);
        return;
      }
      // 帧内绕肩轴旋转（源格左上仍对齐帧锚点，pivot 处于格内 (26,30)）
      ctx.save();
      ctx.translate(PET_ARM_PIVOT[0], i * FRAME_H + PET_ARM_PIVOT[1]);
      ctx.rotate(rot);
      ctx.drawImage(tint(img, color), x * FRAME_W, y * FRAME_H, FRAME_W, FRAME_H,
        -PET_ARM_PIVOT[0], -PET_ARM_PIVOT[1], FRAME_W, FRAME_H);
      ctx.restore();
    };
    const drawArmorCell = (img: ImageBitmap | HTMLImageElement, x: number, y: number, rot = 0) => {
      if (rot === 0) {
        ctx.drawImage(img, x * FRAME_W, y * FRAME_H, FRAME_W, FRAME_H,
          0, i * FRAME_H, FRAME_W, FRAME_H);
        return;
      }
      ctx.save();
      ctx.translate(PET_ARM_PIVOT[0], i * FRAME_H + PET_ARM_PIVOT[1]);
      ctx.rotate(rot);
      ctx.drawImage(img, x * FRAME_W, y * FRAME_H, FRAME_W, FRAME_H,
        -PET_ARM_PIVOT[0], -PET_ARM_PIVOT[1], FRAME_W, FRAME_H);
      ctx.restore();
    };
    if (bodyArmorImg) {
      // 身甲复合绘制（PlayerDrawLayers:1345-1366 同构）：后肩→后臂→躯干→前肩→前臂，不再画衣着层
      drawArmorCell(bodyArmorImg, 1, 1 + dy);                          // 后肩
      // 后臂：petting 换列 8 拉伸档 + 旋转（甲臂同格；甲下皮肤臂层为既有
      // 静态臂同款省略——missingArm/missingHand 语义沿本仓甲覆盖口径，登记）
      if (pet) drawArmorCell(bodyArmorImg, 8, pet.stretch, pet.rot);   // 后臂（抚摸）
      else drawArmorCell(bodyArmorImg, arm[0], arm[1] + 2);            // 后臂
      drawArmorCell(bodyArmorImg, torsoX, dy);                         // 躯干
      drawArmorCell(bodyArmorImg, 0, 1 + dy);                          // 前肩
      drawArmorCell(bodyArmorImg, arm[0], arm[1]);                     // 前臂
      continue;
    }
    // 无盔甲复合绘制（DrawPlayer_12_SkinComposite_BackArmShirt :1385-1403 /
    // DrawPlayer_28_ArmOverItemComposite :3796-3803）：
    //   后臂层序 = 皮肤7→皮肤5→底衫8→衬衫13（:1385-1403）；
    //   前臂层序 = 皮肤7→底衫8→衬衫13→衬衫6（:3796-3803,第4层是 6 不是 5）；
    //   肩/躯干按层序:底衫4(后肩→躯干→前肩) → 衬衫6(同序)——对应原版 13/14 两个 pass
    //   petting：后臂四层全换列 8 拉伸档格 + 同角旋转（z 位不变，层序照旧）
    const petRot = pet ? pet.rot : 0;
    const backArmX = pet ? 8 : arm[0];
    const backArmY = pet ? pet.stretch : arm[1] + 2;
    const draws: Array<{ d: ReturnType<typeof gridRect>; rot?: boolean }> = [
      { d: gridRect(3, torsoX, dy, a.skinColor) },                              // 躯干皮肤(:1280)
      { d: gridRect(7, backArmX, backArmY, a.skinColor), rot: !!pet },          // 后臂皮肤 A
      { d: gridRect(5, backArmX, backArmY, a.skinColor), rot: !!pet },          // 后臂皮肤 B
      { d: gridRect(8, backArmX, backArmY, under), rot: !!pet },                // 后臂底衫
      { d: gridRect(13, backArmX, backArmY, shirt), rot: !!pet },               // 后臂衬衫
      { d: gridRect(4, 1, 1 + dy, under) },                                     // 后肩·底衫
      { d: gridRect(4, torsoX, dy, under) },                                    // 躯干·底衫
      { d: gridRect(4, 0, 1 + dy, under) },                                     // 前肩·底衫
      { d: gridRect(6, 1, 1 + dy, shirt) },                                     // 后肩·衬衫
      { d: gridRect(6, torsoX, dy, shirt) },                                    // 躯干·衬衫
      { d: gridRect(6, 0, 1 + dy, shirt) },                                     // 前肩·衬衫
      { d: gridRect(7, arm[0], arm[1], a.skinColor) },                          // 前臂皮肤
      { d: gridRect(8, arm[0], arm[1], under) },                                // 前臂底衫
      { d: gridRect(13, arm[0], arm[1], shirt) },                               // 前臂衬衫
      { d: gridRect(6, arm[0], arm[1], shirt) },                                // 前臂衬衫 B(:3803)
    ];
    for (const e of draws) {
      const img = sheetRect(a.skinVariant, e.d.sheet);
      if (!img) continue;
      drawTinted(img, e.d.x, e.d.y, e.d.color, e.rot ? petRot : 0);
    }
  }

  // 前发层（1.4.4+ PlayerDrawSet:1751-1753：backHairDraw 时裁 26px 高，与后发层分离）
  if (!onlyArmor && wantHead && hairTinted) {
    const frontH = hasBackHair ? 26 : FRAME_H;
    for (let i = 0; i < nFrames; i++) {
      const row = rowsMode ? rowsMode.body : i;
      const hr = Math.max(0, Math.min(HAIR_FRAMES - 1, row - 6));
      ctx.drawImage(hairTinted, 0, hr * FRAME_H, FRAME_W, frontH, 0, i * FRAME_H, FRAME_W, frontH);
    }
  }

  // 头甲（Armor_Head_{id} 竖条 20 帧，画在头发之后——头盔覆盖发型）。
  // skipHair 时一并让出（发色剂叠层路径由调用方在发层之后补画，保层序）
  if (equip?.head && !opts?.skipHair && !noArmor && opts?.layer !== 'armorNoHead' && wantHead) {
    const headArmor = UITextures.get(`Armor_Head_${equip.head}.png`);
    if (headArmor) {
      for (let i = 0; i < nFrames; i++) {
        const row = rowsMode ? rowsMode.body : i;
        ctx.drawImage(headArmor.img, 0, row * FRAME_H, FRAME_W, FRAME_H, 0, i * FRAME_H, FRAME_W, FRAME_H);
      }
    }
  }

  cache.set(key, c);
  bitmapize(cache, key);
  if (cache.size > 64) {
    // 简单淘汰：清一半最旧条目
    let i = 0;
    for (const k of cache.keys()) {
      if (i++ > 32) break;
      cache.delete(k);
    }
  }
  return c;
}

/** 眼睑帧表（DrawPlayer_21_Head_TheFace_Eyelid PlayerDrawLayers.cs:2640-2683：
 *  TextureAssets.Players[skinVar,15] = Player_0_15.png 40×168 三帧竖排（全变体共用
 *  此一张——terraria-assets 解包实证无 Player_1_15），色通道 = colorHead → skinColor
 *  调色（tint 缓存）。帧序 0 睁(空) 1 半闭 2 全闭（EyeFrameToShow） */
export function eyelidFrame(a: Appearance): Baked | null {
  const r = UITextures.get('Player_0_15.png');
  if (!r) return null;
  noteVuiConsumer('PaperDoll.eyelidFrame');
  return tint(r.img as HTMLImageElement, a.skinColor);
}

/** 取某一帧的绘制参数（供 UISpriteBatch.draw 直接使用） */
export function dollFrame(doll: Baked, frame: number): { img: Baked; sx: number; sy: number; sw: number; sh: number } {
  const idx = Math.max(0, Math.min(BODY_FRAMES - 1, frame));
  return { img: doll, sx: 0, sy: idx * FRAME_H, sw: FRAME_W, sh: FRAME_H };
}

/** 双行帧取帧：rows 模式产物是单帧（sy=0，坐姿可高至 64px），整表产物按 body 行取。
 *  rows.body===rows.legs 时调用方应优先走整表缓存路径（本函数也兼容） */
export function dollFrameRows(doll: Baked, rows: DollRows): { img: Baked; sx: number; sy: number; sw: number; sh: number } {
  if (doll.height < BODY_FRAMES * FRAME_H) {
    return { img: doll, sx: 0, sy: 0, sw: FRAME_W, sh: doll.height };
  }
  return dollFrame(doll, rows.body);
}

/** 行走动画帧号（UICharacter.UpdateAnim：(time/0.07 % 14 + 6)） */
export function walkFrame(timeSec: number): number {
  return (Math.floor(timeSec / 0.07) % 14 + 6);
}

/** 站立帧 */
export const IDLE_FRAME = 0;

/** 逐通道 RGB 缩调（stealth 分层消费：armor ×s'/B×settled、星璇 Lerp 通道）。
 *  multiply 铺 rgb(255·m) 逐通道乘 + destination-in 保原 alpha；mul 量化 1/128 防缓存爆 */
export function tintRGBA(src: Baked, mul: [number, number, number]): Baked {
  const q = mul.map((m) => Math.round(m * 128) / 128);
  const key = `${q[0]},${q[1]},${q[2]}`;
  let inner = stealthTintCache.get(src);
  if (!inner) { inner = new Map(); stealthTintCache.set(src, inner); }
  const hit = inner.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${Math.round(q[0] * 255)},${Math.round(q[1] * 255)},${Math.round(q[2] * 255)})`;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  inner.set(key, c);
  bitmapize(inner, key);
  if (inner.size > 48) {   // 量化档 ≤129；stealth 连续变化时留中段档位
    let i = 0;
    for (const k of inner.keys()) { if (i++ > 24) break; inner.delete(k); }
  }
  return c;
}
