// 双地牢家族二件套（IIIII59 批 2026-08-29 考证+移植）：
//   —— Terraria.GameContent.Generation.Dungeon.Features/DungeonDropTrap.cs（359 行）
//      与 /DungeonTileClump.cs（117 行）。1457↔1458 diff 零差异（2026-08-29 实测，
//      1458 未触动数值面），本移植以 1457 为准，行号即 Terraria.*（下称 cs）。
//
// 【域内聚】两家族唯一消费者 = DungeonGlobalEarlyDualDungeonFeatures.EarlyDungeonFeatures
//   （DungeonCrawler.cs:490，progress 0.7「DungeonEarly」——JS 侧对应 DungeonPass.dgEarly
//   所在时点：Early(:490)→Spikes(:496)→Doors(:500)→WallVariants(:503)→…序列之首位）。
//
// ★可达性考证结论（本批定谳）：两家族只在 **SecretSeed "double daring dangers"
//   (dualDungeons)** 启用时可达——DungeonCrawler.cs:116-131 仅在 SecretSeed.dualDungeons
//   时向 dungeonGenerationStyles 灌多条目（Cavern/Crimson|Corruption/Jungle/dungeonStyle 或
//   Snow/Desert/Hallow/Temple），cs:40-45 同旗才把 DungeonData.Type=DualDungeon：
//    - DropTrap 触发门 = 房间 style 字典 {3 Desert}/{2 Snow}/{1 Cavern}（cs:287/:314/:341）；
//    - TileClump 触发门 = dungeonGenerationStyles 迭代中 Style==3（×num7,num7,num7*2 次，
//      cs:395-510）/ Style==2（×num8,num8 次，cs:512-589）；CloneType 只取沙漠硬砂/雪冰族。
//   DRUNK/G/12345/ntb/notraps/const/m/skyblock 等**单地牢世界**：dungeonGenerationStyles
//   恒 [style0]（cs:131 else 支）、房间字典键恒 {0} ⇒ 两家族零触发零掷骰。接线后对全部
//   现行链纯惰性（与其余 EarlyDual 未移植段——风格雕像/orb/larva/Dual 坑陷阱/房内
//   GenerateEarlyDungeonFeaturesInRoom/Biome 祭坛——同属 dual-only 家族；遗留备案见
//   content-parity「IIIII59 批」章）。notraps 对本段的置零门（cs:87-91
//   actuallyNoTrapsForRealIMeanIt → num3=num4=num5=0）属调用方批职责,未随本移植落地。
//
// 【掷流】DropTrap 自身掷骰恰 2 枚（Next(6,12)/Next(6,14)，cs:130-131），全部位于各前置
//   早退门之后；TileClump 的"随机"全来自 new UnifiedRandom(settings.RandomSeed) 内部实例
//   （cs:47 ——★塔区先例 DU.cs 内部实例模式，与 entrance preSeed / LegacyRoom preSeed
//   同构：主流只耗种子一枚（调用方 genRand.Next()），clump 本体对主流零掷、可离线重放）。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import { UnifiedRandom } from '../../../core/rng';
import { TILE_DEFS, TILE_INTERNAL_BY_SHEET, PLATFORMS_SHEETS, BASIC_CHEST_SHEETS } from '../../../data/tiles';
import { genKillTile } from './FinalCleanupPass';
import { placePlate } from './TrapsPass';

/** DungeonGenerationStyleData 最小投影（现消费者只需这些字段；Style==0 的 genVars
 *  特典支见 dropTrap 头部 loud-fail 说明）。tile 字段均 vanilla sheet id 域；
 *  墙 id 即原版 id（本仓 wall 数组不换算）。 */
export interface DEStyle {
  /** cs DungeonGenerationStyles.Style 字节（Desert=3/Snow=2/Cavern=1…）。 */
  style: number;
  brickTileType: number;
  brickWallType: number;
  /** 结构位保留：三消费样式恒 null（cs:85-93 color 写入短路）；非 null 禁入。 */
  tilePaintColor?: null;
  wallPaintColor?: null;
}

export type DEDropKind = 'Sand' | 'Silt' | 'Slush' | 'Lava'; // DungeonDropTrapType.cs

export interface DECtx {
  st: TileStore;
  w: number; h: number;
  ws: number;                 // Main.worldSurface（double）
  uw: number;                 // Main.UnderworldLayer = maxTilesY-200 恒值属性
  rng: RNG;                   // WorldGen.genRand（主流）
  /** data.CanGenerateFeatureAt(this,x,y) 全链（InWorld5/wall350/入口盒/protected/
   *  features.Boxes/rooms.OuterBounds）——由 DungeonPass.featOK(x,y,0) 同源供给。 */
  canGenerateFeatureAt(x: number, y: number): boolean;
  /** ★IIIII108c 第④刀（DropTrap 盒注册 veto 面）：成功生成后上报最终 Bounds——
   *  cs DungeonDropTrap.cs:355-357 成功尾 SetBounds(i−n11−1, n10−n12, i+n11+1, n26)
   *  + ctor addToFeatures 默认 true 入 data.dungeonFeatures；CanGenerateFeatureAt
   *  恒 false ⇒ 该盒成为后续一切特征的拒收区。L/R/T/B=C# SetBounds 直值
   *  （hitbox=Rectangle(L,T,R−L,B−T) 半开，调用方 DBnd.set 同构，零换算）。 */
  registerDropBox?(box: { L: number; T: number; R: number; B: number }): void;
}

const fr = Math.fround;

// —— 原版集合投影 ——
// TileID.Sets.BasicChest（箱子两族；DropTrap ±25 扫描盒拒门 cs:146-150）。
const DE_BASIC_CHEST_SHEET = BASIC_CHEST_SHEETS;   // ★BJ218 收编单源（TileID.cs:315,§6j）
// TileID.Sets.Platforms（DropTrap 终界探深跳平台支 cs:370 !Platforms[tile.type]）。
// ★BJ182b 收编单源 data/tiles.ts:PLATFORMS_SHEETS(sheet 域;逐值对拍全等,tests/tile-domain-sentinel §6d)
const DE_PLATFORM_SHEET = PLATFORMS_SHEETS;

const innerOfSheet = (sheetId: number): number => TILE_INTERNAL_BY_SHEET.get(sheetId) ?? -1;
function sheetOf(st: TileStore, x: number, y: number): number {
  if (!st.inBounds(x, y)) return -1;
  return TILE_DEFS[st.type[st.idx(x, y)] ?? -1]?.vanilla?.sheet ?? -1;
}
function actAt(st: TileStore, x: number, y: number): boolean {
  return st.inBounds(x, y) && (st.flags[st.idx(x, y)] & 1) !== 0;
}
function isSolidCell(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i2 = st.idx(x, y);
  return (st.flags[i2] & 1) !== 0 && !!TILE_DEFS[st.type[i2]]?.solid;   // Main.tileSolid 裸表
}
/** Tile.cs:138-142 ClearTile = ClearSlope + active(false) + inActive(false)
 *  ——不清 type/wall/liquid/frame/paint（IIIII57 §⑤(a) 四位语义定罪的实例化）。 */
function clearTileKeepType(st: TileStore, idx: number): void {
  st.slope[idx] = 0; st.half[idx] = 0;
  st.flags[idx] &= ~1;
  st.wire[idx] &= ~(1 << 5);
}

/**
 * DungeonDropTrap.DropTrap（cs:75-358）1:1。
 * @param i,j     GenerateFeature 锚（EarlyDual 场景=dungeonRoom 域内下扫首实心格链）
 * @param style   settings.StyleData（Desert/Snow/Cavern 实参；Style==0 特典支不可达，loud-fail）
 * @param kind    DropTrapType（'Lava'|'Sand' 由调用方 Next(2)!=0 掷出，cs:330-331；
 *                'Slush'/'Silt' 恒置）
 * @returns 成功与否。成功时调用方应把 hitbox (i-n11-1, num10-num12)-(i+n11+1, num26)
 *          记入 dungeonFeatures 列表（cs:344-347 addToFeatures:false 后 Add——Base.
 *          CanGenerateFeatureAt=true 故默认不拦后续特型，仅占记账位）。
 */
export function dropTrap(
  ctx: DECtx,
  i: number,
  j: number,
  style: DEStyle,
  kind: DEDropKind,
): boolean {
  const { st, rng } = ctx;
  const inW = (x: number, y: number, fluff: number): boolean =>
    x >= fluff && y >= fluff && x < ctx.w - fluff && y < ctx.h - fluff;
  // cs:82 bool num = StyleData.Style==0 → num2/num3/b 取 genVars.dungeonStyle 特典支；
  // 单地牢世界不可达、dual 管线传常量样式。遇 0 直接抛错防未来静默用错表。
  if (style.style === 0) throw new Error('DEDropTrap: StyleData.Style==0 特典支(genVars.dungeonStyle)未建模');
  if (style.tilePaintColor != null || style.wallPaintColor != null) {
    throw new Error('DEDropTrap: TilePaintColor/WallPaintColor 非 null 输入未建模');
  }
  const num2v = innerOfSheet(style.brickTileType);            // 世界内部 id
  const num3 = style.brickWallType;
  let num5 = -1;                                              // 填充物 tile（vanilla id）
  let num4 = style.brickTileType;                             // 盖板（vanilla id）
  let lava = false;
  switch (kind) {                                             // cs:96-109 default=Sand
    case 'Sand': num5 = 53; num4 = 396; break;
    case 'Silt': num5 = 123; break;
    case 'Slush': num5 = 224; num4 = 147; break;
    case 'Lava': lava = true; break;
  }
  const n5 = innerOfSheet(num5), n4 = innerOfSheet(num4);
  const num7 = 6, num8 = 4, num9 = 25;
  void num7; void num8;

  let k = j;
  if (!inW(i, k, num9)) return false;                                   // cs:119
  for (; !actAt(st, i, k) && k < ctx.uw; k++) { /* 下扫首活性 */ }
  if (!inW(i, k, num9)) return false;                                   // cs:125
  if (actAt(st, i, k - 1)) return false;                                // 底板上邻须空
  {
    // !Main.tileSolid || halfBrick || topSlope → false（cs:127-129；裸表非 SolidTile 复合）
    const ti = st.idx(i, k);
    if (!TILE_DEFS[st.type[ti]]?.solid || st.half[ti] || st.slope[ti] === 1 || st.slope[ti] === 2) return false;
    const sh = sheetOf(st, i, k);
    if (!(sh === num5 || sh === num4 || sh === style.brickTileType) || st.wall[ti] !== num3) return false;
  }
  k--;                                                                  // 升入空气列底（cs:132）
  let num10 = -1;
  const num11 = rng.nextIntRange(6, 12);                                // Next(6,12) cs:135
  const num12 = rng.nextIntRange(6, 14);                                // Next(6,14) cs:136
  for (let l = i - num9; l <= i + num9; l++) {                          // ±25 方窗拒门 cs:141-155
    for (let m2 = k - num9; m2 < k + num9; m2++) {
      if (!st.inBounds(l, m2)) continue;
      const w2 = st.wire[st.idx(l, m2)];
      if ((w2 & 1) !== 0) return false;                                 // Tile.wire()=红线位
      const sh2 = sheetOf(st, l, m2);
      if (sh2 > 0 && DE_BASIC_CHEST_SHEET.has(sh2)) return false;
    }
  }
  // 天花砖扫描（cs:157-170）：向上 ≤30 行首个活性格必须是砖本体否则拒
  for (let m13 = k; m13 > k - 30; m13--) {
    if (actAt(st, i, m13)) {
      if (sheetOf(st, i, m13) === style.brickTileType) { num10 = m13; break; }
      return false;
    }
  }
  if (num10 <= -1) return false;
  if (k - num10 < num12 + num8) return false;                           // 井身深度门 cs:174
  let num14 = 0;                                                        // 密度门 cs:176-190
  for (let n = i - num11; n <= i + num11; n++) {
    for (let m15 = num10 - num12; m15 <= num10; m15++) {
      if (!st.inBounds(n, m15)) continue;
      const t2 = st.idx(n, m15);
      if ((st.flags[t2] & 1) !== 0 && !!TILE_DEFS[st.type[t2]]?.solid) num14++;
    }
  }
  if (num14 < ((num11 * 2 + 1) * (num12 + 1)) * 0.75) return false;
  {                                                                     // CanGenerateFeatureInArea cs:196
    const L = i - num11 - 1, T = num10 - num12, R = i + num11 + 1, B = num10 + 20;
    for (let a = L; a <= R; a++) {
      for (let b = T; b <= B; b++) {
        if (!ctx.canGenerateFeatureAt(a, b)) return false;
      }
    }
  }
  // —— 写面（cs:207-279）——
  for (let a = i - num11 - 1; a <= i + num11 + 1; a++) {
    for (let b = num10 - num12; b <= num10; b++) {
      if (!st.inBounds(a, b)) continue;
      const ti4 = st.idx(a, b);
      const flag = (st.flags[ti4] & 1) !== 0 && !!TILE_DEFS[st.type[ti4]]?.solid;
      if (b === num10) {                                                // 底行：清坡；空格填砖
        st.slope[ti4] = 0; st.half[ti4] = 0;
        if (!flag) { st.setTileSilent(a, b, num2v, 0, 0); st.flags[ti4] |= 1; }
        continue;
      }
      if (b === num10 - num12) {                                        // 顶行：ClearTile+活性；上邻实心→盖板
        clearTileKeepType(st, ti4);
        st.type[ti4] = flag && isSolidCell(st, a, b - 1) ? n4 : num2v;
        st.flags[ti4] |= 1;
        continue;
      }
      if (a === i - num11 - 1 || a === i + num11 + 1) {                 // 侧柱：空则清+填砖，实则压平
        if (!flag) {
          clearTileKeepType(st, ti4);
          st.type[ti4] = num2v; st.flags[ti4] |= 1;
        } else { st.slope[ti4] = 0; st.half[ti4] = 0; }
        continue;
      }
      clearTileKeepType(st, ti4);                                       // 腔体：岩浆保 type 幽灵位
      if (lava) { st.liquid[ti4] = 255; st.liquidType[ti4] = 2 /* LIQUID_TYPE.LAVA */; continue; }
      st.type[ti4] = n5; st.flags[ti4] |= 1;
    }
  }
  // 侧壁贴合带（cs:280-303）：rows∈[(int)(m-n12*0.66)..(int)(m-n12*0.33)]；循环变量 int
  // 取整而分支阈值仍是 double 字面量乘积——逐句保形
  for (
    let n19 = Math.trunc(num10 - num12 * 0.66);
    n19 <= num10 - num12 * 0.33;
    n19++
  ) {
    for (const cx of [i - num11 - 2, i + num11 + 2]) {
      if (!st.inBounds(cx, n19)) continue;
      const tiA = st.idx(cx, n19);
      if (n19 < num10 - num12 * 0.4) {
        if (st.slope[tiA] === 3 || st.slope[tiA] === 4) st.slope[tiA] = 0;    // bottomSlope→0
      } else if (n19 > num10 - num12 * 0.6) {
        if (st.slope[tiA] === 1 || st.slope[tiA] === 2) st.slope[tiA] = 0;    // topSlope→0+半砖去
        st.half[tiA] = 0;
      } else {
        st.half[tiA] = 0; st.slope[tiA] = 0;
      }
      if (!(st.flags[tiA] & 1) || !TILE_DEFS[st.type[tiA]]?.solid) {          // 空/非实心填砖
        clearTileKeepType(st, tiA);
        st.type[tiA] = num2v; st.flags[tiA] |= 1;
      }
    }
  }
  // 内四列压平（cs:305-315）：列 i-n11+{-2,-1,+1,+2}（跳过 i-n11 本列，逐原版）
  for (let n20 = num10 - num12; n20 <= num10; n20++) {
    for (const dx of [-2, -1, 1, 2]) {
      const x = i - num11 + dx;
      if (!st.inBounds(x, n20)) continue;
      const ti5 = st.idx(x, n20);
      st.slope[ti5] = 0; st.half[ti5] = 0;
    }
  }
  // 顶缘行压平（cs:316-324）：row=k-n12-1，x∈[i-n11-1, i+n11+1)
  for (let n21 = i - num11 - 1; n21 < i + num11 + 1; n21++) {
    const y2 = k - num12 - 1;
    if (!st.inBounds(n21, y2)) continue;
    const ti6 = st.idx(n21, y2);
    if (st.slope[ti6] === 3 || st.slope[ti6] === 4) st.slope[ti6] = 0;
    st.half[ti6] = 0;
  }
  // 出入口 KillTile ×4（世界生成期引擎镜像含尘掷级联）+ PlaceTile(135,mute,forced,-1,7)
  // （cs:325-332；placePlate=Place1x1 全链含尾 SquareTileFrame 分派）
  genKillTile(st, ctx.rng, i - 2, k);
  genKillTile(st, ctx.rng, i - 1, k);
  genKillTile(st, ctx.rng, i + 1, k);
  genKillTile(st, ctx.rng, i + 2, k);
  placePlate(st, i, k, 7, ctx.rng);
  // 报线/致动器环（cs:333-360）：f32 比较 (float)n23 ?± (float)n11*{0.8,0.6,0.4}
  for (let n23 = i - num11; n23 <= i + num11; n23++) {
    let num24 = k;
    const fin = fr(num11), fi = fr(i), fx = fr(n23);
    const c8 = fr(fin * fr(0.8)), c6 = fr(fin * fr(0.6)), c4 = fr(fin * fr(0.4));
    if (fx < fr(fi - c8) || fx > fr(fi + c8)) num24 = k - 3;
    else if (fx < fr(fi - c6) || fx > fr(fi + c6)) num24 = k - 2;
    else if (fx < fr(fi - c4) || fx > fr(fi + c4)) num24 = k - 1;
    for (let n25 = num10; n25 <= k; n25++) {
      if (!st.inBounds(n23, n25)) continue;
      const ti7 = st.idx(n23, n25);
      if (n23 === i && n25 <= k) st.wire[ti7] |= 1;                       // 中央柱红线
      if ((st.flags[ti7] & 1) !== 0 && !!TILE_DEFS[st.type[ti7]]?.solid) {
        if (n25 < num10 + num7 - 4) {                                     // 近顶带致动+红线
          st.wire[ti7] |= 16;                                             // actuator 位(bit4)
          st.wire[ti7] |= 1;
        } else if (n25 < num24) {
          genKillTile(st, ctx.rng, n23, n25);                             // 上腔扩挖 KillTile
        }
      }
    }
  }
  // 终界探深（cs:362-380）：逐列自当前最深界向下找首个实心非平台格，跨列取 min 更新 num26。
  let num26 = k;
  for (let n27 = i - num11; n27 <= i + num11; n27++) {
    for (let n28 = num26; n28 < ctx.uw; n28++) {
      if (n28 >= num26) {
        if (!st.inBounds(n27, n28)) continue;
        const shP = sheetOf(st, n27, n28);
        if (isSolidCell(st, n27, n28) && !(shP > 0 && DE_PLATFORM_SHEET.has(shP))) {
          num26 = n28;
          break;
        }
      }
    }
  }
  void num26;
  // ★IIIII108c 第④刀：终 Bounds 上报（cs:355 成功尾 SetBounds 直值；失败路径无此调用
  //  ——ctor 登记实例虽恒在,但 generated=false 的实例不参与 veto 扫描,与 cs 等价）
  ctx.registerDropBox?.({ L: i - num11 - 1, T: num10 - num12, R: i + num11 + 1, B: num26 });
  return true;
}

/**
 * DungeonTileClump.TileClump（cs:30-117）1:1。
 * @param p RandomSeed=调用方主流 Next() 一枚；strength/steps/tileType/wallType/
 *          onlyReplaceThisTileType/onlyReplaceThisWallType 均 vanilla sheet id 域，
 *          walls 直传原版 id；AreaToGenerateIn 仅 null 已建模（现消费者五处全 null）。
 * @returns 恒 true（vanilla 无失败路径）；**不做** dungeonFeatures 登记（cs 五处调用点
 *          均 new DungeonTileClump(settings).GenerateFeature(...) 且从不 Add——Bounds
 *          只在函数体内收敛后丢弃，后续 CanGenerateFeatureAt 不受其影响）。
 */
export interface DETileClumpParams {
  randomSeed: number;
  strength: number;
  steps: number;
  tileType: number;               // -1 关闭 tile 重写
  wallType: number;               // -1 关闭墙重写
  onlyReplaceThisTileType?: number | null;
  onlyReplaceThisWallType?: number | null;
}

export function tileClump(ctx: DECtx, i: number, j: number, p: DETileClumpParams): boolean {
  const { st } = ctx;
  // 内部实例（塔区 DU.cs 先例）：每跑 new UnifiedRandom(RandomSeed)，私有流与主世界无关。
  const ur = new UnifiedRandom(p.randomSeed >>> 0);
  const nxr = (): number => ur.nextIntRange(-10, 11);   // C# Next(-10,11)=[-10,11)
  const onlyTile = p.onlyReplaceThisTileType ?? null;
  const onlyWall = p.onlyReplaceThisWallType ?? null;
  const tileInternal = p.tileType >= 0 ? innerOfSheet(p.tileType) : -1;
  let num = p.strength;                    // strength（double）
  let num2 = p.steps;                      // steps（double）
  let vx = i, vy = j;                      // Vector2D val（double X/Y）
  let dvx = nxr() * 0.1, dvy = nxr() * 0.1;// val2 初速：Next(-10,11)*0.1（double 域）
  while (num > 0.0 && num2 > 0.0) {
    if (vy < 0.0 && num2 > 0.0 && p.tileType === 59) num2 = 0.0;    // 丛林草表截停（cs:65-68）
    num = p.strength * (num2 / p.steps);
    num2--;
    const bx0 = Math.max(0, Math.min(ctx.w, Math.trunc(vx - num * 0.5)));
    const bx1 = Math.max(0, Math.min(ctx.w, Math.trunc(vx + num * 0.5)));
    const by0 = Math.max(0, Math.min(ctx.h, Math.trunc(vy - num * 0.5)));
    const by1 = Math.max(0, Math.min(ctx.h, Math.trunc(vy + num * 0.5)));
    for (let kk = bx0; kk < bx1; kk++) {
      for (let ll = by0; ll < by1; ll++) {
        // 判据顺序逐 cs:83-88：椭圆判定【先掷】——area 门（恒 null）短路其后
        const roll = nxr();
        if (!(Math.abs(kk - vx) + Math.abs(ll - vy) < p.strength * 0.5 * (1.0 + roll * 0.015))) continue;
        if (!st.inBounds(kk, ll)) continue;
        const ti = st.idx(kk, ll);
        const wa = st.wire[ti];
        if ((st.flags[ti] & 1) !== 0 && ((((wa >> 4) & 1) !== 0) || ((wa & 15) !== 0))) continue;
        if (tileInternal !== -1 && (st.flags[ti] & 1) !== 0) {
          if (onlyTile != null && sheetOf(st, kk, ll) !== onlyTile) continue;
          st.type[ti] = tileInternal;
          st.paint[ti] = 0;                                    // WorldGen.paintTile(k,l,0)=块漆归零
        }
        if (p.wallType !== -1 && (onlyWall == null || st.wall[ti] === onlyWall)) {
          st.wall[ti] = p.wallType;
          st.paintWall[ti] = 0;                                // paintWall(k,l,0)=墙漆归零
        }
      }
    }
    vx += dvx; vy += dvy;
    dvx += fr(fr(nxr()) * fr(0.05));                           // val2.X+=(float)r*0.05f（f32 积再提升）
    if (dvx > 1.0) dvx = 1.0;
    else if (dvx < -1.0) dvx = -1.0;
    void dvy;                                                  // val2.Y 初速后恒定（vanilla 同构）
  }
  return true;
}
