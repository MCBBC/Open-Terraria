// ★1457 语义存档（KKKKKK 批 2026-08-22 从 TemplePass.ts 回滚时摘存）。
// ★2026-08-23 1457 对齐档 2：**已接线**——TemplePass 本批把 1456「全房对四角连线」
//   换回 makeTemple_GenerateBricks（本文件 makeTempleGenerateBricks,已 export），
//   roomDepths 深度组记账在 TemplePass 房间链环内同步复线。
// 1457 差异（相对 1456，源=Terarria1457/Terraria/WorldGen.cs）：
//   makeTemple（cs:33730-34591）把 1456 的「全房对四角连线」（cs:33700-33760,
//   k×l×m×n 四重环+三坐标同步步进逐列填 226,零掷骰）替换为 makeTemple_GenerateBricks
//   （cs:34592-34665）：房间按深度组 roomDepths（makeTemple 内 array2[i]=num13,
//   换向次数,cs:33789-33791 记录）并界 → DungeonBounds.Inflate(10)+CalculateHitbox
//   → 组界全填 ClearEverything+226 → 两两深度组四角 StrictAngles L 形线
//   （Vector2 float32 步进+FillY/FillX 补柱）。房间链布局/实心填/双遍挖腔/
//   templePather/outerTempled/入口/清理/祭坛各段 1456≡1457（仅变量改名与
//   `||`→`|` 无副作用改写）。
// 1456 真值=Terarria1456/Terraria/WorldGen.cs cs:33573-34493（IIIIII IL 复裁裁决
//   1.4.5.6 二进制为准）。
import { TileStore } from '../../../TileStore';
import { TILE_BY_KEY } from '../../../../data/tiles';

const BRICK = TILE_BY_KEY['v_226_lihzahrd_brick']!;

interface Room { x: number; y: number; w: number; h: number }


/** Tile.ClearEverything + active + type 226（1457 cs:34620-34624 / 34726-34729）：
 *  与 setBrick 差在**清墙/清帧/清漆/清线**（ClearEverything 全清后重置活性与类型）——
 *  GenerateBricks 家族专用（房间实心填与挖腔仍走 setBrick,不清墙）。 */
function setBrickClearAll(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.type[i] = BRICK; st.flags[i] = 1;
  st.wall[i] = 0; st.liquid[i] = 0; st.liquidType[i] = 0;
  st.half[i] = 0; st.slope[i] = 0;
  st.frameX[i] = 0; st.frameY[i] = 0;
  st.wire[i] = 0; st.paint[i] = 0; st.paintWall[i] = 0;
}

/** 砖线活动格判定（`!tile.active() || tile.type != 226` 的反谓词,FillX/FillY 用）。
 *  ★LLL 批（2026-08-25）#46 定罪修：必须比对 **JS tile id**（TILE_BY_KEY[
 *  'v_226_lihzahrd_brick']=87,id=注册序非 vanilla sheet 号!）。曾直比字面量 226
 *  ——本仓 id 226=v_300_bone_welder、砖 id=87 → 谓词恒假,FillY/FillX 探柱扫描
 *  永不命中既有砖 → count 恒跑到 ≥300/出界 → 整段 return **零填柱**；细线基格
 *  再被 templeCleaner(≤1 邻砖) 清光 → #46 缺 ~4.6k 砖格形状差（六链同签名）。 */
function isActiveBrick226(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  return !!st.flags[i] && st.type[i]! === BRICK;
}

/** C# Math.Round（银行家舍入,ToEven）——JS Math.round 是 half-away,轴对齐整数
 *  分量下两者同值,斜线分量为无理数不触 .5;保留显式实现对齐语义。 */
function roundBanker(v: number): number {
  const f = Math.floor(v), d = v - f;
  if (d === 0.5) return f % 2 === 0 ? f : f + 1;
  if (d === -0.5) return f % 2 === 0 ? f : f - 1;
  return Math.round(v);
}

/** makeTemple_GenerateBricks（1457 cs:34592-34665,零掷骰）：①房间按深度组并界
 *  （DungeonBounds.UpdateBounds）②组界 Inflate(10)（setter 钳 [10, 尺寸-10]）+
 *  CalculateHitbox（Right≤Left→Left+1）→ 组界全填 ClearEverything+226 ③两两深度组
 *  四角 StrictAngles 连线（Left/Right × Top/Bottom）。 */
export function makeTempleGenerateBricks(st: TileStore, rooms: Room[], depths: number[]): void {
  const AMOUNT = 10;
  const clamp = (v: number, hi: number) => Math.max(10, Math.min(hi - 10, v));
  type Bnd = { l: number; t: number; r: number; b: number };
  const groups: Array<Bnd | null> = depths.map(() => null);
  for (let i = 0; i < rooms.length; i++) {
    const d = depths[i];
    const r = rooms[i];
    const L = r.x, T = r.y, R = r.x + r.w, B = r.y + r.h;   // Rectangle.Left/Top/Right/Bottom
    const g = groups[d];
    if (!g) groups[d] = { l: L, t: T, r: R, b: B };
    else {
      if (L < g.l) g.l = L;
      if (R > g.r) g.r = R;
      if (T < g.t) g.t = T;
      if (B > g.b) g.b = B;
    }
  }
  for (const g of groups) {
    if (!g) continue;
    g.l = clamp(g.l, st.w); g.r = clamp(g.r, st.w);
    g.t = clamp(g.t, st.h); g.b = clamp(g.b, st.h);
    g.l = clamp(g.l - AMOUNT, st.w); g.r = clamp(g.r + AMOUNT, st.w);
    g.t = clamp(g.t - AMOUNT, st.h); g.b = clamp(g.b + AMOUNT, st.h);
    // ★批4 review P2-7（DungeonBounds.CalculateHitbox cs:47-100）：退化修正是
    //   `Right = Left + 1` **经属性 setter**（再钳 ≤max-10）——Left 已被钳到
    //   maxTilesX-10 时 Right 钳回同值（宽度 0）;曾直写 g.l+1 无钳 → 多填一列/行。
    if (g.r <= g.l) g.r = clamp(g.l + 1, st.w);
    if (g.b <= g.t) g.b = clamp(g.t + 1, st.h);
    for (let k = g.l; k <= g.r; k++) {
      for (let l = g.t; l <= g.b; l++) setBrickClearAll(st, k, l);
    }
  }
  for (let m = 0; m < groups.length; m++) {
    const a = groups[m];
    if (!a) continue;
    for (let n = m + 1; n < groups.length; n++) {
      const b = groups[n];
      if (!b) continue;
      tmBricksLineStrictAngles(st, a.l, a.t, b.l, b.t, false, false);
      tmBricksLineStrictAngles(st, a.r, a.t, b.r, b.t, true, false);
      tmBricksLineStrictAngles(st, a.l, a.b, b.l, b.b, false, true);
      tmBricksLineStrictAngles(st, a.r, a.b, b.r, b.b, true, true);
    }
  }
}

/** C# Vector2（FNA）float32 仿真：float 逐运算舍入（fround）+ (float)Math.Sqrt。
 *  ★批4 review P2-6：StrictAngles 距离/Line 步进曾全 double——C# `Vector2` 全
 *  float32（Length≈1f 但可差 1 ULP → `num-=num2` 步数在整数边界差 1;坐标累积
 *  误差可致尾格 round 差 1;Distance 的 d1/d2 相等性可翻转换端选择）。 */
const fr32 = Math.fround;
/** Vector2.Length()（FNA）：(float)Math.Sqrt((X*X)+(Y*Y)),内层 float 逐运算 */
function vec2LengthF32(x: number, y: number): number {
  return fr32(Math.sqrt(fr32(fr32(x * x) + fr32(y * y))));
}
/** Vector2.Distance(a,b)（FNA）：分量差 float 减 → 平方和 float 加 → Sqrt→float */
function vec2DistanceF32(ax: number, ay: number, bx: number, by: number): number {
  const dx = fr32(ax - bx), dy = fr32(ay - by);
  return fr32(Math.sqrt(fr32(fr32(dx * dx) + fr32(dy * dy))));
}

/** makeTemple_GenerateBricks_Line_StrictAngles（1457 cs:34667）：共线直连;否则从
 *  「fillUpwards? (endX,startY) : (startX,endY)」原点取较远端做对角步进至共线,
 *  拆两段直线;500 步守卫超限回退整段直线。 */
function tmBricksLineStrictAngles(st: TileStore, startX: number, startY: number,
  endX: number, endY: number, fillLeft: boolean, fillUpwards: boolean): void {
  if (startX === endX || startY === endY) {
    tmBricksLine(st, startX, startY, endX, endY, fillLeft, fillUpwards);
    return;
  }
  const oX = fillUpwards ? endX : startX;
  const oY = fillUpwards ? startY : endY;
  const d1 = vec2DistanceF32(oX, oY, startX, startY);   // origin.Distance(start)
  const d2 = vec2DistanceF32(oX, oY, endX, endY);       // origin.Distance(end)
  let vX = startX, vY = startY, wX = endX, wY = endY;
  if (d2 > d1) { vX = endX; vY = endY; wX = startX; wY = startY; }
  let cX = vX, cY = vY;
  const sx = wX > vX ? 1 : -1;
  const sy = wY > vY ? 1 : -1;
  let guard = 500;
  while (cX !== wX && cY !== wY) {
    guard--;
    if (guard < 0) break;
    cX += sx; cY += sy;
  }
  if (guard < 0) {
    tmBricksLine(st, startX, startY, endX, endY, fillLeft, fillUpwards);
    return;
  }
  tmBricksLine(st, startX, startY, cX, cY, fillLeft, fillUpwards);
  tmBricksLine(st, cX, cY, endX, endY, fillLeft, fillUpwards);
}

/** makeTemple_GenerateBricks_Line（1457 cs:34709）：归一化步进逐格 ClearEverything+226,
 *  每格接 FillY/FillX 补柱;2000 步守卫;InWorld(5) 出界即停。
 *  ★批4 review P2-6：SafeNormalize/Length/步进全按 C# float32 语义（Utils.cs:1936
 *  SafeNormalize=零向量→默认 UnitX,否则 Vector2.Normalize=1f/(float)Math.Sqrt(X²+Y²)
 *  逐 float 舍入后分量相乘;num-=num2 每步 fround）。 */
function tmBricksLine(st: TileStore, startX: number, startY: number,
  endX: number, endY: number, fillLeft: boolean, fillUpwards: boolean): void {
  const dX = fr32(endX - startX), dY = fr32(endY - startY);   // Vector2 减法（整数域精确）
  if (dX === 0 && dY === 0) return;                            // vector2 == Vector2.Zero
  const len = vec2LengthF32(dX, dY);
  // SafeNormalize(UnitX)：零向量 → 默认（此处 len>0 恒不走默认支,守卫照写）
  const nX = len === 0 ? 1 : fr32(dX * fr32(1 / len));
  const nY = len === 0 ? 0 : fr32(dY * fr32(1 / len));
  const stepLen = vec2LengthF32(nX, nY);      // num2 = vector3.Length()（循环外一次）
  let vX = fr32(startX), vY = fr32(startY);
  let remain = len;                           // num（float32 剩余长度）
  let budget = 2000;
  let lastXAdj = -1, lastYAdj = -1;
  while (remain > 0) {
    budget--;
    if (budget > 0) {
      const px = roundBanker(vX), py = roundBanker(vY);
      if (px >= 5 && px < st.w - 5 && py >= 5 && py < st.h - 5) {   // InWorld(px,py,5)
        setBrickClearAll(st, px, py);
        tmBricksLineFillY(st, fillUpwards, lastXAdj, px, py);
        tmBricksLineFillX(st, fillLeft, lastYAdj, px, py);
        lastXAdj = px; lastYAdj = py;
        vX = fr32(vX + nX); vY = fr32(vY + nY);
        remain = fr32(remain - stepLen);   // num -= num2（float32 每步舍入）
        continue;
      }
      break;
    }
    break;
  }
}

/** makeTemple_GenerateBricks_Line_FillY（1457 cs:34750）：从当前格向 fill 方向探到
 *  首个 226 实格（≤300 步、InWorld(5) 界内、y∈(10, h-10) 开区间）,回退重走逐格填 226。 */
function tmBricksLineFillY(st: TileStore, fillUpwards: boolean, lastXAdjusted: number,
  currentX: number, currentY: number): void {
  if (currentX === lastXAdjusted) return;
  const step = fillUpwards ? -1 : 1;
  let num2 = currentY + step;
  let count = 0;
  while (!isActiveBrick226(st, currentX, num2)) {
    count++;
    num2 += step;
    if (!st.inBounds(currentX, num2) || num2 < 5 || num2 >= st.h - 5) break;   // tile==null || !InWorld(5)
  }
  if (count >= 300 || num2 <= 10 || num2 >= st.h - 10) return;
  num2 = currentY + step;
  while (!isActiveBrick226(st, currentX, num2)) {
    setBrickClearAll(st, currentX, num2);
    num2 += step;
    if (!st.inBounds(currentX, num2) || num2 < 5 || num2 >= st.h - 5) break;
  }
}

/** makeTemple_GenerateBricks_Line_FillX（1457 cs:34791）：FillY 的 X 轴镜像
 *  （fillLeft=false 向 +x;界 y∈(10, w-10)）。 */
function tmBricksLineFillX(st: TileStore, fillLeft: boolean, lastYAdjusted: number,
  currentX: number, currentY: number): void {
  if (currentY === lastYAdjusted) return;
  const step = fillLeft ? -1 : 1;
  let num2 = currentX + step;
  let count = 0;
  while (!isActiveBrick226(st, num2, currentY)) {
    count++;
    num2 += step;
    if (!st.inBounds(num2, currentY) || num2 < 5 || num2 >= st.w - 5) break;
  }
  if (count >= 300 || num2 <= 10 || num2 >= st.w - 10) return;
  num2 = currentX + step;
  while (!isActiveBrick226(st, num2, currentY)) {
    setBrickClearAll(st, num2, currentY);
    num2 += step;
    if (!st.inBounds(num2, currentY) || num2 < 5 || num2 >= st.w - 5) break;
  }
}

