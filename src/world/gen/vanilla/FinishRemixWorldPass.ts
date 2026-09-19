// 原版 FinishRemixWorld（1457 WorldGen.cs:26617-26991）1:1 整段移植 —— ★IIIII203 主刀。
// 调用点：FinalCleanup pass 体内（cs:22645 `if (remixWorldGen) FinishRemixWorld();`），
// 序在 FinishNoTraps/Tenth/Drunk/NotTheBees/FinishGetGoodWorld 之后、vampire 块 +
// SecretSeed.FinalizeSecretSeeds + TenthPaintTrees + ShimmerCleanUp 之前（vanilla/
// FinalCleanupPass.ts 内 runFinishGetGoodWorld 块之后接线）。
//
// ★三源零差：1457(26617-26991) ≡ 1458(26625-26999) ≡ 1456(26493-26867) 逐行全同
//   （/tmp/iii203-out/frw-{1456,1457,1458}.txt diff 空输出）——不套 hfIs1457 双态门。
//
// 八链（对应关系按 cs 行序）：
//   ① 云转化扫描（26619-26689，x∈[25,w-26)×y∈[25,h-26) 列优先）：
//      活性 ∧ (TileID.Sets.Clouds{189,196,460,717,718,719} ∨ type==202) →
//      num=最深云行（被②的 `l>num` 消费）；!tenth∨gg 时按 drunk 半场/crimson 改写
//      云块 sheet（crimson→195 Flesh / 否则 474 Lesion；drunk 左右分流各掷 Next(-2,3)）
//      ——remix 纯旗零掷。墙 73/82 同构改写（crimson→77 / 否则 233）。
//   ② 全图大环（26691-26871，k,l∈[25,-26)）：每格 **恒掷两颗**——
//      `l<ws+Next(3)` 门（命中 → Convert(k,l,conv)：remix 纯旗=crimson?4:1，单格
//      版 walls 连墙）+ `l<ws-Next(19,22)` 门（命中 ∧ 墙 178/180 → wall=0）。
//      4200×1200 计 (w-50)(h-50)×2 ≈ 954 万掷=本 pass 掷流主体（#105 最大单项）。
//      中段三支：墙 87 液体→liquidType(0)；getGood/ntb/drunk∧tenth 各转化支；
//      活性 type==56 → KillTile；`l>rockLayer ∧ l<h-350 ∧ 裸type==0 ∧ active ∧
//      八邻缺` → 裸 type=2（洞穴泥挂草，Remix 深带泥面成活的机制面）。
//   ③ Liquid.QuickWater(-2)（26873）。
//   ④ 出生腔清液 while（26875-26894）：randomSpawn 旗关；带 (0.38w..0.62w+15)×
//      (h-200..h-126)（**double 乘**——4200→1596/2604，≠ mound 的 f32 1595/2603）
//      液清 + 裸 type 58→57 + 裸 type 230/56/659 失活 → QuickWater(-2) →
//      spawn 列 [spawnY-14, spawnY+10] 逐格查液，有液重跑。
//   ⑤ AddTrees(undergroundOnly:true)（26900 → 31647-31733）：**头两颗 NextDouble
//      恒掷**（棕榈概率 num/num2，undergroundOnly 支被弃=被弃值是活掷判例）；
//      地下树环 x∈[1,w-2)×y∈[(int)ws, h-300)：活性草 ∧ Next(7)==0（tenth 短路）
//      → Next(2) 柳616/樱596，否则 TryGrowingTreeByType(5)。与 runTreePass 的
//      remix 尾段同构（R13-3③），此为 FinishRemixWorld 的第二实例。
//   ⑥ 地牢涂装（26903-26968，x∈[10,w-11) 列优先 ×y∈[10,h-11)）：!tenth∨gg 时
//      color=color2=22（drunk 半场/crimson→13）；tileDungeon{41,43,44,677-679}∨
//      CrackedBricks{481,482,483}（★TileID.cs:183 终值——FTW 链 CRACKED_FGG={48,487}
//      系另域旧值，本刀不沿用）→ color；wallDungeon{7,8,9,94-99}→wallColor(25)+
//      (type19∧frameY≠180→color)；菌草 226 / 草60 下格226 / 藤137 frameY 行1..4 →
//      color(color2)；墙 244(!noSurface)/34/87 → wallColor(25)（87 另 color(color2)）。
//   ⑦ 地狱沙帧重排（26970-26989）：num11=w/4200.0×Next(2,5)；每次 attempt
//      Next(0.39w,0.61w)+Next(10,31)，num15 含端 ±num14 × num16∈[h-250,h-26)：
//      裸 type==637 → frameX=18×Main.rand.Next(6,11)（★genRand≡Main.rand 单流，
//      WorldGen.cs:4362 别名 + WorldGenerator.cs:499 每 pass 重播——同一 pass 流）。
//   ⑧ notTheBees 墙 86 清除臂（26991-27017，组合域）+ QuickWater(-2)（27019）+
//      睡莲尾扫（27021-27029，全图 [0,w)×[0,h) 裸 type==518 → CheckLilyPad）。
//
// ★IIIII203（2026-09-03）：REMIX #105 满绿主刀。掷流敏感位——①②⑤⑥⑦ 全部消费
//   本 pass 流（runFinalCleanupPass 的 rng）；②每格恒两颗、⑤恒两颗 NextDouble、
//   ⑦ 每次 attempt 两颗+每命中格一颗。接线位次敏感（GG 块之后、beforeShimmer 之前
//   ——FinalizeSecretSeeds/ShimmerCleanUp 在其后的掷位全靠本位次锚定）。
import type { TileStore } from '../../TileStore';
import { LIQUID_TYPE } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import type { World } from '../../World';
import { T, TILE_DEFS, TILE_DUNGEON_SHEETS, WALL_DUNGEON_SHEETS } from '../../../data/tiles';
import { LiquidSim, LAVA_DEATH_SHEETS } from '../../liquid/LiquidSim';
import { flipGenSolid, genSolidType, snapshotGenSolid, VAN_TILE_SOLID_EXTRA } from './GenSolid';
import { setBoulderSolidity } from './TrapsPass';
import { convertSingleCell } from './SecretSeedDoEndsPass';
import { genKillTile, genTileFrameNeighbor, genSquareTileFrame, genCheckLilyPad } from './FinalCleanupPass';
import { growTree, growVanityTree } from './TreePass';

/** 内部 tile id ↔ 原版 sheet 映射（FinishDrunkGenPass 同款，模块载入一次性构建） */
const SHEET_OF: number[] = [];
const ID_BY_SHEET = new Map<number, number>();
for (let t = 0; t < TILE_DEFS.length; t++) {
  const sh = TILE_DEFS[t]?.vanilla?.sheet ?? -1;
  if (sh >= 0) {
    SHEET_OF[t] = sh;
    if (!ID_BY_SHEET.has(sh)) ID_BY_SHEET.set(sh, t);
  }
}
const sheetOf = (t: number): number => SHEET_OF[t] ?? -1;
const one = (s: number): number => ID_BY_SHEET.get(s) ?? -1;

/** TileID.Sets.Clouds（TileID.cs:197）+ 本函数显式 `type==202` 支 */
const CLOUD_SHEETS = new Set([189, 196, 460, 717, 718, 719]);
/** Main.tileDungeon（Main.cs:8131-8136）——★BJ187 收编 data/tiles.ts:
 *  TILE_DUNGEON_SHEETS 单源（6 项逐值全等） */
const TILE_DUNGEON = TILE_DUNGEON_SHEETS;
/** TileID.Sets.CrackedBricks（TileID.cs:183 终值 481-483） */
const CRACKED_BRICKS = new Set([481, 482, 483]);
/** Main.wallDungeon（Main.cs:10734-10745）——wall id 即原版 id——★BJ187 收编
 *  data/tiles.ts:WALL_DUNGEON_SHEETS 单源（9 项逐值全等） */
const WALL_DUNGEON = WALL_DUNGEON_SHEETS;

const T_FLESH_195 = one(195);
const T_LESION_474 = one(474);
const T_GRASS_2 = T.GRASS;          // sheet 2（=T.GRASS，runTreePass 同锚）
const T_DIRT_0 = one(0);            // sheet 0（C# 裸 type=0 直写=泥，非空格！）
const T_ASH_57 = one(57);

/** WorldGen.SolidTile(i,j)（cs:70642）生成期口径：active ∧ gen tileSolid ∧ 非
 *  tileSolidTop 族 ∧ 非半砖 ∧ 非坡 ∧ 非 inActive（quickWaterBracketed 同构判定） */
function solidTileFRW(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;                        // C# 越界 → catch → false
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  if ((st.wire[i] & 32) !== 0) return false;                   // inActive（致动位）
  const sh = sheetOf(st.type[i]);
  if (sh < 0 || VAN_TILE_SOLID_EXTRA.has(sh)) return false;    // tileSolidTop 家族
  return genSolidType(st.type[i]) && !st.half[i] && st.slope[i] === 0;
}

/** Liquid.QuickWater(-2)（Liquid.cs:104-148）一次性 LiquidSim 接线——
 *  UnderworldPass mound/SpreadingGrass 臂⑥ 同款（★IIIII100d passRand 入 pass 流）。
 *  头臂 [379]=true 持续不恢复；tilesIgnoreWater 巨石括弧在 sim.quickWater 内部
 *  自带（solidNP 备份/复原）；setBoulderSolidity/546 全局面括弧照 proven 包装形状
 *  （本 pass 窗内无 sim 外实心读者，与 C# noTraps 门在纯 remix 域不可观测等价）。 */
function quickWaterFRW(st: TileStore, rng: RNG, gs: GenState): void {
  const sim = new LiquidSim({ store: st, seed: gs.seed } as unknown as World);
  sim.isGeneratingOrLoadingWorld = true;
  sim.generatingWorld = true;
  sim.passRand = (max) => rng.nextInt(max);
  sim.passRng = rng;
  sim.genWaterLine = gs.waterLine;
  if (!!gs.seedFlags.remix) {
    sim.remixWaterRule = true;               // Liquid.cs:182-185 remix 落水分型带
    sim.remixLavaLine = gs.lavaLine;
    sim.remixRockLevel = gs.rockLevel;
    sim.remixOceanLevel = (gs.worldSurface + gs.rockLevel) / 2 + 40;
  }
  sim.remixWorldGen = !!gs.seedFlags.remix;
  sim.dualDungeonsSeed = !!gs.seedFlags.dualDungeons;
  if (gs.shimmerX > 0) sim.shimmerCenter = { x: gs.shimmerX, y: gs.shimmerY };
  // solidNP ← 当前 GenSolid 面板（C# settle 读 Main.tileSolid 全局含生成期覆写；
  //   先注面板后翻括弧保序——SpreadingGrass 臂⑥同序）
  sim.applyGenSolidOverrides(snapshotGenSolid());
  flipGenSolid([379], true);
  setBoulderSolidity(false);
  flipGenSolid([546], false);
  sim.quickWater();
  sim.dispose();
  setBoulderSolidity(true);
  flipGenSolid([546], true);
}

/** FinishRemixWorld(cs:26617-26991) 全段。spawnX/spawnY = Main.spawnTileX/Y
 *  （SpawnPoint pass 出口值；④ 出生列复检消费）。 */
export function runFinishRemixWorld(
  st: TileStore, rng: RNG, gs: GenState,
  spawnX: number, spawnY: number,
): void {
  const w = st.w, h = st.h;
  const F = gs.seedFlags;
  const crimson = !!gs.crimson;
  const drunk = !!F.drunkWorld;
  const tenth = !!F.tenthAnniversary;
  const gg = !!F.getGoodWorld;
  const ntb = !!F.notTheBees;
  const act = (x: number, y: number): boolean => st.flags[st.idx(x, y)] !== 0;

  // ── ① 云转化扫描（cs:26619-26689）——x 外 y 内列优先 ──
  let num = 0;                                   // 最深云行（②的 l>num 消费）
  for (let i = 25; i < w - 25; i++) {
    for (let j = 25; j < h - 25; j++) {
      const t = st.idx(i, j);
      const sh = st.flags[t] ? sheetOf(st.type[t]) : -1;
      if (st.flags[t] && (CLOUD_SHEETS.has(sh) || sh === 202)) {
        if (j > num) num = j;
        if (!tenth || gg) {
          if (drunk) {
            // cs:26630-26647：GenVars.crimsonLeft 左右分流（Next(-2,3)=int(-2,2)）
            if (gs.crimsonLeft) {
              if (i < Math.trunc(w / 2) + rng.int(-2, 2)) st.type[t] = T_FLESH_195;
              else st.type[t] = T_LESION_474;
            } else if (i < Math.trunc(w / 2) + rng.int(-2, 2)) {
              st.type[t] = T_LESION_474;
            } else {
              st.type[t] = T_FLESH_195;
            }
          } else if (crimson) {
            st.type[t] = T_FLESH_195;
          } else {
            st.type[t] = T_LESION_474;
          }
        }
      }
      // cs:26660-26662：墙 73/82 门（!tenth∨gg 才进；否则 continue 跳过本格墙支）
      const wl = st.wall[t];
      if ((wl !== 73 && wl !== 82) || (tenth && !gg)) continue;
      if (drunk) {
        if (gs.crimsonLeft) {
          if (i < Math.trunc(w / 2) + rng.int(-2, 2)) st.wall[t] = 77;
          else st.wall[t] = 233;
        } else if (i < Math.trunc(w / 2) + rng.int(-2, 2)) {
          st.wall[t] = 233;
        } else {
          st.wall[t] = 77;
        }
      } else if (crimson) {
        st.wall[t] = 77;
      } else {
        st.wall[t] = 233;
      }
    }
  }

  // ── ② 全图大环（cs:26691-26871）——每格恒掷两颗（Next(3)+Next(19,22)）──
  for (let k = 25; k < w - 25; k++) {
    // ★IIIII101e 段标（列级掷位仪,与 rig TSEG|rxC 同位同口径）
    if (k % 50 === 27) { try { (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg?.('rxC', String(k)); } catch { /* probe */ } }
    for (let l = 25; l < h - 25; l++) {
      const conversionType = crimson ? 4 : 1;    // cs:26692-26696
      // cs:26698：云行下带门（|| 逐支——errorWorld/surfaceIsInSpace 组合域旗）
      if ((l > num || !!F.errorWorld || !!F.surfaceIsInSpace)
        && l < gs.worldSurface && k > gs.beachDistance && k < w - gs.beachDistance) {
        const t = st.idx(k, l);
        if (st.wall[t] === 87) {
          if (st.liquid[t] > 0) st.liquidType[t] = LIQUID_TYPE.WATER;   // liquidType(0)
        } else if (gg) {
          // cs:26707-26727（FTW 组合域）：岩浆杀+ lava 化/374 化/植物杀/82-84 重帧
          if (st.liquid[t] > 0) {
            if (LAVA_DEATH_SHEETS.has(sheetOf(st.type[t]))) genKillTile(st, rng, k, l);
            st.liquidType[t] = LIQUID_TYPE.LAVA;                         // lava(true)
          }
          const shg = sheetOf(st.type[t]);
          if (shg === 375 || shg === 373 || shg === 709) st.type[t] = one(374);
          const shk = sheetOf(st.type[t]);
          if (shk === 230 || shk === 229 || shk === 659 || shk === 56) genKillTile(st, rng, k, l);
          const shf = sheetOf(st.type[t]);
          if (shf === 82 || shf === 83 || shf === 84) genTileFrameNeighbor(st, rng, k, l);
        } else if (ntb) {
          // cs:26728-26751（NTB 组合域）：蜂蜜化/375 化/植物杀/82-84 重帧
          if (st.liquid[t] > 0) st.liquidType[t] = LIQUID_TYPE.HONEY;    // honey(true)
          const shg = sheetOf(st.type[t]);
          if (shg === 374 || shg === 373 || shg === 709) st.type[t] = one(375);
          const shk = sheetOf(st.type[t]);
          if (shk === 230 || shk === 229 || shk === 659 || shk === 56) genKillTile(st, rng, k, l);
          const shf = sheetOf(st.type[t]);
          if (shf === 82 || shf === 83 || shf === 84) genTileFrameNeighbor(st, rng, k, l);
        } else if (drunk && tenth) {
          // cs:26752-26773（drunk+十周年组合域）：微光化/709 化/植物杀/82-84 重帧
          if (st.liquid[t] > 0) {
            if (LAVA_DEATH_SHEETS.has(sheetOf(st.type[t]))) genKillTile(st, rng, k, l);
            st.liquidType[t] = LIQUID_TYPE.SHIMMER;                      // shimmer(true)
          }
          const shg = sheetOf(st.type[t]);
          if (shg === 374 || shg === 373 || shg === 375) st.type[t] = one(709);
          const shk = sheetOf(st.type[t]);
          if (shk === 230 || shk === 229 || shk === 659 || shk === 56) genKillTile(st, rng, k, l);
          const shf = sheetOf(st.type[t]);
          if (shf === 82 || shf === 83 || shf === 84) genTileFrameNeighbor(st, rng, k, l);
        }
      }
      // cs:26815：`l < ws + Next(3)` ——Next(3) 每格恒掷（门序敏感）
      if (l < gs.worldSurface + rng.nextInt(3)) {
        const t = st.idx(k, l);
        if (tenth && !gg) {
          // cs:26817-26846（十周年组合域）：墙 3/83 豁免 + 神圣化 + 661/662→109 +
          //   SquareTileFrame + 顶空植 110（HallowedPlants：目标格恒活性 →
          //   Collision.EmptyTile 假 ∧ tileSolid[110]=false 进支 → CanPlace 拒 →
          //   零写零掷）+ 7×7 泥清除
          if (st.wall[t] !== 3 && st.wall[t] !== 83) {
            convertSingleCell(st, rng, gs, k, l, 2);
            const shc = sheetOf(st.type[t]);
            if (shc === 661 || shc === 662) {
              st.type[t] = one(109);
              genSquareTileFrame(st, rng, k, l);
              if (solidTileFRW(st, k, l) && !act(k, l - 1)) {
                // PlaceTile(k,l,110)（cs:26833）——活性目标格恒拒置零掷（见上注）
              }
              for (let m = k - 3; m <= k + 3; m++) {
                for (let n = l - 3; n <= l + 3; n++) {
                  if (!st.inBounds(m, n)) continue;
                  const q = st.idx(m, n);
                  if (sheetOf(st.type[q]) === 59) st.type[q] = T_DIRT_0; // C# type=0=泥（非空格）
                }
              }
            }
          }
        } else if (drunk) {
          // cs:26848-26870：drunk 左右分流 Convert（Next(-2,3) 分流掷）
          if (gs.crimsonLeft) {
            if (k < Math.trunc(w / 2) + rng.int(-2, 2)) convertSingleCell(st, rng, gs, k, l, 4);
            else convertSingleCell(st, rng, gs, k, l, 1);
          } else if (k < Math.trunc(w / 2) + rng.int(-2, 2)) {
            convertSingleCell(st, rng, gs, k, l, 1);
          } else {
            convertSingleCell(st, rng, gs, k, l, 4);
          }
        } else {
          convertSingleCell(st, rng, gs, k, l, conversionType);
        }
      }
      // cs:26873-26879：`l < ws - Next(19,22)` ——Next(19,22) 每格恒掷；墙 178/180 清零
      {
        const t = st.idx(k, l);
        if (l < gs.worldSurface - rng.nextIntRange(19, 22)
          && (st.wall[t] === 178 || st.wall[t] === 180)) {
          st.wall[t] = 0;
        }
        // cs:26881-26883：活性 type==56 → KillTile
        if (st.flags[t] && sheetOf(st.type[t]) === 56) genKillTile(st, rng, k, l);
        // cs:26885-26892：深带裸泥挂草（八邻缺一 → 裸 type=2）
        if (l > gs.rockLevel && l < h - 350 && sheetOf(st.type[t]) === 0 && st.flags[t]
          && (!act(k - 1, l - 1) || !solidTileFRW(st, k, l - 1) || !act(k + 1, l - 1)
            || !act(k - 1, l) || !act(k + 1, l)
            || !act(k - 1, l + 1) || !act(k, l + 1) || !act(k + 1, l + 1))) {
          st.type[t] = T_GRASS_2;
        }
      }
    }
  }

  // ── ③ QuickWater(-2)（cs:26873…行号 cs:26895）──
  quickWaterFRW(st, rng, gs);

  // ── ④ 出生腔清液 while（cs:26897-26917）──
  let flag = true;
  if (!!F.randomSpawn) flag = false;             // cs:26898-26900 randomSpawn 旗关
  while (flag) {
    const num2 = Math.trunc(w * 0.38);           // double 乘（4200→1596；≠mound f32 1595）
    const num3 = Math.trunc(w * 0.62);           // 4200→2604
    const num4 = h - 135;
    for (let num5 = num2; num5 < num3 + 15; num5++) {
      for (let num6 = h - 200; num6 < num4 + 10; num6++) {
        if (!st.inBounds(num5, num6)) continue;
        const t = st.idx(num5, num6);
        st.liquid[t] = 0;
        if (sheetOf(st.type[t]) === 58) st.type[t] = T_ASH_57;           // 裸 type 读
        const shd = sheetOf(st.type[t]);
        if (shd === 230 || shd === 56 || shd === 659) st.flags[t] = 0;   // active(false) 裸读
      }
    }
    quickWaterFRW(st, rng, gs);
    flag = false;
    for (let num7 = -10; num7 < 15; num7++) {
      const sy = spawnY - num7;
      if (sy >= 0 && sy < h && spawnX >= 0 && spawnX < w
        && st.liquid[st.idx(spawnX, sy)] > 0) {
        flag = true;
        break;
      }
    }
  }

  // ── ⑤ AddTrees(undergroundOnly:true)（cs:26900→31647-31733）──
  {
    // cs:31649-31651：头两颗 NextDouble（棕榈概率）——undergroundOnly 支不消费值，
    //   但 **恒掷**（被弃值是活掷判例 #64/#65/#67 族）
    const _palmL = 0.1 + rng.next() * 0.35;
    const _palmR = 0.1 + rng.next() * 0.35;
    void _palmL; void _palmR;
    // cs:31697-31733：!remixWorldGen 早退之后的地带树环（remix 恒到）
    const yTop = Math.floor(gs.worldSurface);    // (int)Main.worldSurface
    for (let k = 1; k < w - 1; k++) {
      for (let l = yTop; l < h - 300; l++) {
        if (!st.inBounds(k, l)) continue;
        const yi = st.idx(k, l);
        if (st.flags[yi] && st.type[yi] === T_GRASS_2
          && (tenth || rng.int(0, 6) === 0)) {
          growVanityTree(st, rng, k, l, rng.int(0, 1) === 0, 0, false, gs);
        } else {
          growTree(st, rng, gs, k, l);
        }
      }
    }
  }

  // ── ⑥ 地牢涂装（cs:26903-26968）——!tenth∨gg 时跑；x 外 y 内列优先 ──
  if (!tenth || gg) {
    for (let num8 = 10; num8 < w - 10; num8++) {
      let color = 22;
      let color2 = 22;
      if (drunk) {
        if ((gs.crimsonLeft && num8 < Math.trunc(w / 2))
          || (!gs.crimsonLeft && num8 > Math.trunc(w / 2))) {
          color2 = 13;
          color = 13;
        }
      } else if (crimson) {
        color2 = 13;
        color = 13;
      }
      for (let num9 = 10; num9 < h - 10; num9++) {
        const t = st.idx(num8, num9);
        const sh = st.flags[t] ? sheetOf(st.type[t]) : -1;
        if (st.flags[t] && (TILE_DUNGEON.has(sh) || CRACKED_BRICKS.has(sh))) {
          st.paint[t] = color;                                   // color(color)
        }
        if (WALL_DUNGEON.has(st.wall[t])) {
          st.paintWall[t] = 25;                                  // wallColor(25)
          if (sh === 19 && st.frameY[t] !== 180) st.paint[t] = color;
        }
        if (st.flags[t]) {
          let flag2 = false;
          if (tenth) {
            // cs:26925-26932（十周年组合域）：noSurface 豁免 + 191/151 支
            if (!F.noSurface && sh === 191) flag2 = true;
            if (st.flags[t] && sh === 151) st.paint[t] = color;
          }
          if (sh === 226) flag2 = true;                          // 菌草
          if (sh === 61 && st.inBounds(num8, num9 + 1)
            && sheetOf(st.type[st.idx(num8, num9 + 1)]) === 226) flag2 = true;
          if (sh === 137) {
            const row = Math.trunc(st.frameY[t]! / 18);
            if (row >= 1 && row <= 4) flag2 = true;              // 垂叶 frameY 行 1..4
          }
          if (flag2) st.paint[t] = color2;
        }
        if (!F.noSurface && st.wall[t] === 244) st.paintWall[t] = 25;
        if (st.wall[t] === 34) st.paintWall[t] = 25;
        if (st.wall[t] === 87) {
          st.paintWall[t] = 25;
          st.paint[t] = color2;
        }
      }
    }
  }

  // ── ⑦ 地狱沙帧重排（cs:26970-26989）──
  {
    let num11 = w / 4200.0;
    num11 *= rng.nextIntRange(2, 5);
    for (let num12 = 0; num12 < num11; num12++) {
      const num13 = rng.nextIntRange(Math.trunc(w * 0.39), Math.trunc(w * 0.61));
      const num14 = rng.nextIntRange(10, 31);
      for (let num15 = num13 - num14; num15 <= num13 + num14; num15++) {
        if (num15 < 0 || num15 >= w) continue;                   // 防御守卫（4200 档不可达）
        for (let num16 = h - 250; num16 < h - 25; num16++) {
          if (num16 < 0 || num16 >= h) continue;
          const t = st.idx(num15, num16);
          if (sheetOf(st.type[t]) === 637) {                     // 裸 type 读
            st.frameX[t] = 18 * rng.nextIntRange(6, 11);         // Main.rand ≡ pass 流
          }
        }
      }
    }
  }

  // ── ⑧ NTB 墙 86 清除臂（cs:26991-27017，组合域）──
  if (ntb) {
    for (let num17 = 3; num17 < w - 3; num17++) {
      let flag3 = true;
      for (let num18 = 0; num18 < gs.worldSurface; num18++) {
        if (!st.inBounds(num17, num18)) continue;
        const t = st.idx(num17, num18);
        if (flag3) {
          if (st.wall[t] === 86) st.wall[t] = 0;
          if (st.flags[t]) flag3 = false;
        } else if (st.wall[t] === 0 && st.inBounds(num17, num18 + 4)
          && st.wall[st.idx(num17, num18 + 1)] === 0
          && st.wall[st.idx(num17, num18 + 2)] === 0
          && st.wall[st.idx(num17, num18 + 3)] === 0
          && st.wall[st.idx(num17, num18 + 4)] === 0
          && st.wall[st.idx(num17 - 1, num18)] === 0
          && st.wall[st.idx(num17 + 1, num18)] === 0
          && st.wall[st.idx(num17 - 2, num18)] === 0
          && st.wall[st.idx(num17 + 2, num18)] === 0
          && !st.flags[t]
          && !st.flags[st.idx(num17, num18 + 1)]
          && !st.flags[st.idx(num17, num18 + 2)]
          && !st.flags[st.idx(num17, num18 + 3)]) {
          flag3 = true;
        }
      }
    }
  }

  // ── QuickWater(-2)（cs:27019）──
  quickWaterFRW(st, rng, gs);

  // ── 睡莲尾扫（cs:27021-27029）：全图裸 type==518 → CheckLilyPad ──
  for (let num19 = 0; num19 < w; num19++) {
    for (let num20 = 0; num20 < h; num20++) {
      const t = st.idx(num19, num20);
      if (sheetOf(st.type[t]) === 518) genCheckLilyPad(st, rng, num19, num20);
    }
  }
}
