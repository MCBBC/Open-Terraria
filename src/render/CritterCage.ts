// 小动物笼族 tile 渲染 1:1（1.4.5.6 反编译 = Terarria1456）：
//   - TileID.Sets.CritterCageLidStyle（TileID.cs:199）：tile → CageTop_{n} 顶盖样式，
//     -1 = 非笼族。0-2 = 6×3 大笼（帧带 54px），3-4 = 3×2 小笼（36px）；
//     360 金蝴蝶笼无顶盖（蝴蝶族走 GetWaterAnimalCageFrame 槽位，TileDrawing.cs:5961-5974）
//   - GetTileDrawData（TileDrawing.cs:5730-5974）：笼族 tileTop 恒 2；addFrY =
//     动画帧 × 帧带高（54/36），710 河豚笼另有 addFrX 横带（帧 <33 时恒 0 偏移）
//   - 槽位哈希（TileDrawing.cs:6639-6652）：big = 物体锚 (x-fx/18)/6 × (y-fy/18)/4、
//     small = /3 × /3、water = /2 × /3，全部 mod Main.cageFrames(=25, Main.cs:1499)
//     ——同槽笼子共用一套帧态机（Main.*CageFrame[25] 数组）
//   - DrawSingleTile 顶盖段（TileDrawing.cs:1670-1716）：当前帧行的首行格
//     （(frameY+addFrY) % 帧带高 == 0）= 本体下移 8px（源裁去顶 8px）+ CageTop
//     顶盖画在 tileTop-2 处（源 16×10，style0 时 X 取 %108 剥河豚横带）；非首行整格画
// GAP 登记（render/docs 见汇报）：
//   ① AnimateTiles_CritterCages（Main.cs:13452-16530，约 25 族 × 逐族状态机）未逐族
//      1:1——此处用"空闲(30-900t) → 动作帧 5t/帧 → 回空闲"的同构确定性循环近似
//      （cageFrameRow），各族动作段/循环重掷（如兔子 2-3 嗅探 10t、4-10 耳动 5t、
//      双空闲帧 0/11）未区分；
//   ② 笼族放置链未实装（无 createTile 物品/放置入口，tiles.ts 仅有 tile 定义），
//      仅渲染侧 + wld 导入可见；
//   ③ 282/505/543 鱼缸、598 熔岩鱼缸、568-570 妖精罐、521-527 蜻蜓罐、316-318
//      水母笼不在本仓 tiles.ts，未收录。
import { tileAnim } from './TileAnim';

/** Main.cageFrames（Main.cs:1499）：每族 25 个独立槽位帧态 */
export const CAGE_FRAMES = 25;

/** 动作帧推进间隔（原版各族动作段以 5t/帧为主流：兔子耳动 :13507、松鼠 2-8 帧
 *  :13604；嗅探/跳跃类 10t 未区分，统一 5t） */
const ACTION_TICKS = 5;

/** TileID.Sets.CritterCageLidStyle（TileID.cs:199）非 -1 条目 1:1 */
const LID_STYLE: Record<number, number> = {
  // style 0（6×3 大笼）
  275: 0, 276: 0, 277: 0, 278: 0, 279: 0, 280: 0, 281: 0, 558: 0, 554: 0, 553: 0,
  551: 0, 550: 0, 542: 0, 413: 0, 309: 0, 297: 0, 296: 0, 645: 0, 643: 0, 644: 0,
  632: 0, 640: 0, 710: 0,
  // style 1（6×3 大笼）
  559: 1, 414: 1, 359: 1, 358: 1,
  // style 2（6×3 大笼）
  605: 2, 604: 2, 603: 2, 602: 2, 601: 2, 599: 2, 600: 2, 612: 2, 611: 2, 610: 2,
  609: 2, 608: 2, 606: 2, 607: 2,
  // style 3（3×2 小笼）
  285: 3, 286: 3, 582: 3, 555: 3, 538: 3, 533: 3, 532: 3, 394: 3, 393: 3, 392: 3,
  391: 3, 339: 3, 310: 3, 299: 3, 298: 3, 629: 3, 619: 3,
  // style 4（3×2 小笼）
  556: 4, 544: 4, 364: 4, 363: 4, 362: 4, 361: 4,
};

export type CageSlotKind = 'big' | 'small' | 'water';

export interface CageFamily {
  /** Main.{family}CageFrame 数组名（溯源用） */
  family: string;
  /** 动画族序号（帧态机哈希种子；同族同槽共享循环相位） */
  idx: number;
  /** 帧带高：54 = 6×3 大笼 / 36 = 3×2 小笼与蝴蝶笼（TileDrawing addFrY 步长） */
  step: 54 | 36;
  /** 槽位哈希族（TileDrawing.cs:6639-6652） */
  slot: CageSlotKind;
  /** TileID.Sets.CritterCageLidStyle（-1 = 无顶盖，360 金蝴蝶笼） */
  lid: number;
}

/** GetTileDrawData 笼族帧带映射（TileDrawing.cs:5730-5924 大笼 / :5871-5924 小笼 /
 *  :5961-5974 蝴蝶笼）——sheet → 动画族。本仓 tiles.ts 在库的全部 65 张笼表。 */
export const CAGE_FAMILY: Record<number, CageFamily> = {
  // bunny（:5777）：275 兔笼 + 359 金兔 + 599-605 gem bunny 族
  275: { family: 'bunny', idx: 0, step: 54, slot: 'big', lid: 0 },
  359: { family: 'bunny', idx: 0, step: 54, slot: 'big', lid: 1 },
  599: { family: 'bunny', idx: 0, step: 54, slot: 'big', lid: 2 },
  600: { family: 'bunny', idx: 0, step: 54, slot: 'big', lid: 2 },
  601: { family: 'bunny', idx: 0, step: 54, slot: 'big', lid: 2 },
  602: { family: 'bunny', idx: 0, step: 54, slot: 'big', lid: 2 },
  603: { family: 'bunny', idx: 0, step: 54, slot: 'big', lid: 2 },
  604: { family: 'bunny', idx: 0, step: 54, slot: 'big', lid: 2 },
  605: { family: 'bunny', idx: 0, step: 54, slot: 'big', lid: 2 },
  // turtle（:5781）
  550: { family: 'turtle', idx: 1, step: 54, slot: 'big', lid: 0 },
  551: { family: 'turtle', idx: 1, step: 54, slot: 'big', lid: 0 },
  // owl（:5784）
  542: { family: 'owl', idx: 2, step: 54, slot: 'big', lid: 0 },
  // squirrel（:5796；squirrelCageFrameOrange 共用 squirrel 机的 Orange 变体：414）
  276: { family: 'squirrel', idx: 3, step: 54, slot: 'big', lid: 0 },
  413: { family: 'squirrel', idx: 3, step: 54, slot: 'big', lid: 0 },
  414: { family: 'squirrel', idx: 3, step: 54, slot: 'big', lid: 1 },
  606: { family: 'squirrel', idx: 3, step: 54, slot: 'big', lid: 2 },
  607: { family: 'squirrel', idx: 3, step: 54, slot: 'big', lid: 2 },
  608: { family: 'squirrel', idx: 3, step: 54, slot: 'big', lid: 2 },
  609: { family: 'squirrel', idx: 3, step: 54, slot: 'big', lid: 2 },
  610: { family: 'squirrel', idx: 3, step: 54, slot: 'big', lid: 2 },
  611: { family: 'squirrel', idx: 3, step: 54, slot: 'big', lid: 2 },
  612: { family: 'squirrel', idx: 3, step: 54, slot: 'big', lid: 2 },
  // mallard（:5799）/ duck（:5802）/ grebe（:5805）/ seagull（:5808）
  277: { family: 'mallard', idx: 4, step: 54, slot: 'big', lid: 0 },
  278: { family: 'duck', idx: 5, step: 54, slot: 'big', lid: 0 },
  553: { family: 'grebe', idx: 6, step: 54, slot: 'big', lid: 0 },
  554: { family: 'seagull', idx: 7, step: 54, slot: 'big', lid: 0 },
  // bird（:5812，358 金鸟共用）/ blueBird（:5815）/ redBird（:5818）
  279: { family: 'bird', idx: 8, step: 54, slot: 'big', lid: 0 },
  358: { family: 'bird', idx: 8, step: 54, slot: 'big', lid: 1 },
  280: { family: 'blueBird', idx: 9, step: 54, slot: 'big', lid: 0 },
  281: { family: 'redBird', idx: 10, step: 54, slot: 'big', lid: 0 },
  // macaw（:5825：632/640/643-645 五色鹦鹉）
  632: { family: 'macaw', idx: 11, step: 54, slot: 'big', lid: 0 },
  640: { family: 'macaw', idx: 11, step: 54, slot: 'big', lid: 0 },
  643: { family: 'macaw', idx: 11, step: 54, slot: 'big', lid: 0 },
  644: { family: 'macaw', idx: 11, step: 54, slot: 'big', lid: 0 },
  645: { family: 'macaw', idx: 11, step: 54, slot: 'big', lid: 0 },
  // scorpion（:5829 二维 [0,slot]）/ penguin（:5832）/ seahorse（:5836）/ pufferfish（:5840）
  296: { family: 'scorpion', idx: 12, step: 54, slot: 'big', lid: 0 },
  297: { family: 'scorpion', idx: 12, step: 54, slot: 'big', lid: 0 },
  309: { family: 'penguin', idx: 13, step: 54, slot: 'big', lid: 0 },
  558: { family: 'seahorse', idx: 14, step: 54, slot: 'big', lid: 0 },
  559: { family: 'seahorse', idx: 14, step: 54, slot: 'big', lid: 1 },
  710: { family: 'pufferfish', idx: 15, step: 54, slot: 'big', lid: 0 },
  // ---- 小笼（36px）----
  285: { family: 'snail', idx: 16, step: 36, slot: 'small', lid: 3 },          // :5878
  286: { family: 'snail2', idx: 17, step: 36, slot: 'small', lid: 3 },         // :5882（582 共用）
  582: { family: 'snail2', idx: 17, step: 36, slot: 'small', lid: 3 },
  298: { family: 'frog', idx: 18, step: 36, slot: 'small', lid: 3 },           // :5886（361 共用）
  361: { family: 'frog', idx: 18, step: 36, slot: 'small', lid: 4 },
  339: { family: 'grasshopper', idx: 19, step: 36, slot: 'small', lid: 3 },    // :5890（362 共用）
  362: { family: 'grasshopper', idx: 19, step: 36, slot: 'small', lid: 4 },
  299: { family: 'mouse', idx: 20, step: 36, slot: 'small', lid: 3 },          // :5894（363 共用）
  363: { family: 'mouse', idx: 20, step: 36, slot: 'small', lid: 4 },
  310: { family: 'worm', idx: 21, step: 36, slot: 'small', lid: 3 },           // :5900 族
  364: { family: 'worm', idx: 21, step: 36, slot: 'small', lid: 4 },
  391: { family: 'worm', idx: 21, step: 36, slot: 'small', lid: 3 },
  619: { family: 'worm', idx: 21, step: 36, slot: 'small', lid: 3 },
  392: { family: 'slug', idx: 22, step: 36, slot: 'small', lid: 3 },           // :5905 [type-392]
  393: { family: 'slug', idx: 22, step: 36, slot: 'small', lid: 3 },
  394: { family: 'slug', idx: 22, step: 36, slot: 'small', lid: 3 },
  532: { family: 'maggot', idx: 23, step: 36, slot: 'small', lid: 3 },         // :5908
  533: { family: 'rat', idx: 24, step: 36, slot: 'small', lid: 3 },            // :5911
  538: { family: 'ladybug', idx: 25, step: 36, slot: 'small', lid: 3 },        // :5916 族
  544: { family: 'ladybug', idx: 25, step: 36, slot: 'small', lid: 4 },
  629: { family: 'ladybug', idx: 25, step: 36, slot: 'small', lid: 3 },
  555: { family: 'waterStrider', idx: 26, step: 36, slot: 'small', lid: 3 },   // :5920 族
  556: { family: 'waterStrider', idx: 26, step: 36, slot: 'small', lid: 4 },
  // 蝴蝶（:5961-5974：butterflyCageFrame[8,slot] × 36，water 槽位；无顶盖）
  360: { family: 'butterfly', idx: 27, step: 36, slot: 'water', lid: -1 },
};

/** 是否笼族 sheet（CAGE_FAMILY 在库即笼族） */
export function cageFamilyOf(sheet: number): CageFamily | null {
  return CAGE_FAMILY[sheet] ?? null;
}

/** 顶盖样式（TileID.cs:199；非笼族 -1） */
export function cageLidStyle(sheet: number): number {
  return CAGE_FAMILY[sheet]?.lid ?? -1;
}

/** 槽位哈希（TileDrawing.cs:6639-6652 1:1；x/y = 本格坐标，fx/fy = tile 帧偏移）。
 *  物体锚 = (x - fx/18, y - fy/18)；big 除 6×4、small 除 3×3、water 除 2×3，
 *  积 mod cageFrames(25)。JS 负数取模已归正（锚不可能为负，防御性） */
export function cageSlot(kind: CageSlotKind, x: number, y: number, fx: number, fy: number): number {
  const ox = x - Math.floor(fx / 18);
  const oy = y - Math.floor(fy / 18);
  const [dx, dy] = kind === 'big' ? [6, 4] : kind === 'small' ? [3, 3] : [2, 3];
  return (((Math.floor(ox / dx) * Math.floor(oy / dy)) % CAGE_FRAMES) + CAGE_FRAMES) % CAGE_FRAMES;
}

/** 确定性 32 位哈希（槽位/族种子化用；非密码学，只求均匀） */
function hash32(a: number, b: number): number {
  let h = (a * 0x9e3779b1) ^ (b * 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

/**
 * 笼内小动物动画帧行（≈ AnimateTiles_CritterCages Main.cs:13452-16530）。
 * 原版为逐族状态机（空闲 rand(30,900)t → 族专属动作段 5/10t 推进 → 回空闲，双空闲
 * 帧/循环重掷各族不同）；此处取同构确定性循环：空闲帧 0 停 [30,900)t（hash 种子，
 * 每 65536t 换一拍近似原版逐次重掷）→ 帧 1..frames-1 每 5t 一帧 → 回空闲。
 * @param family 动画族序号（CageFamily.idx）
 * @param slot   槽位（cageSlot）
 * @param tick   全局动画 tick（tileAnim.tick）
 * @param frames 该表帧行数（floor(表高/step)）
 */
export function cageFrameRow(family: number, slot: number, tick: number, frames: number): number {
  if (frames <= 1) return 0;
  const episode = Math.floor(tick / 65536);                       // 换拍周期
  const idle = 30 + hash32(family * 131 + slot, episode) % 871;   // rand.Next(30, 900)
  const action = (frames - 1) * ACTION_TICKS;
  const cycle = idle + action;
  const t = ((tick % cycle) + cycle) % cycle;
  if (t < idle) return 0;
  return 1 + Math.min(frames - 2, Math.floor((t - idle) / ACTION_TICKS));
}

/** 重烘焙节奏（ChunkCache.advanceAnim 用）：动作帧 5t/帧 → 每 5 tick 重烘焙含笼 chunk */
export function cageAnimRate(): number {
  return ACTION_TICKS;
}

export interface DrawSource { img: HTMLImageElement; sx: number; sy: number; sw: number; sh: number }

/**
 * 笼族一格绘制（TileDrawing.cs:1670-1716 顶盖段 1:1）。
 * @param r       drawVanillaCell 已取的本格帧（vframeAt 结果，含 18px 步长源坐标）
 * @param sheetH  笼表总像素高（算帧行数）
 * @param tileTop 本格 tileTop（DRAW_Y_OFFSET 恒 2）
 */
export function drawCageCell(
  ctx: CanvasRenderingContext2D, atlas: { ensureVImage: (f: string) => HTMLImageElement | null },
  fam: CageFamily, r: DrawSource, x: number, y: number, fx: number, fy: number,
  px: number, py: number, tileTop: number, sheetH: number,
): void {
  const rows = Math.max(1, Math.floor(sheetH / fam.step));
  // 槽位哈希用【存储帧】（物体锚还原，TileDrawing.cs:6646-6652 同式）
  const slot = cageSlot(fam.slot, x, y, fx, fy);
  const row = cageFrameRow(fam.idx, slot, tileAnim.tick, rows);
  const asx = r.sx;
  const asy = r.sy + row * fam.step;
  if (asy + r.sh > r.img.height) return;  // 帧行越界（表残缺）：整格跳过防画出邻带
  const baseY = py + tileTop;
  const isTopRow = asy % fam.step === 0;  // 当前帧行首行格（:1673/:1675 的 %54/%36）
  if (!isTopRow || fam.lid < 0) {
    ctx.drawImage(r.img, asx, asy, r.sw, r.sh, px, baseY, r.sw, r.sh);
    return;
  }
  // 首行格：本体下移 8px（源裁顶 8px，:1679-1686）+ 顶盖画在 tileTop-2（:1687-1694）
  ctx.drawImage(r.img, asx, asy + 8, r.sw, r.sh - 8, px, baseY + 8, r.sw, r.sh - 8);
  const lid = atlas.ensureVImage(`vanilla/CageTop_${fam.lid}.png`);
  if (!lid) return;
  // style 0 顶盖 X 取源 X %108（剥河豚横带；:1690-1693）；宽 16 高 10（:1694-1696）
  const lidX = fam.lid === 0 ? asx % 108 : asx;
  if (lidX + 16 > lid.width) return;
  ctx.drawImage(lid, lidX, 0, 16, 10, px, baseY - 2, 16, 10);
}
