// ★BJ444（2026-10-03）：KillTile 统一尘系统 1:1 移植——用户实报「打碎杂草/藤蔓、
// 砍树、挖掘方块均无粒子效果」的机制级修复。
//
// 反编译锚（Terarria1457/Terraria/WorldGen.cs，唯一标杆）：
//   · KillTile_GetTileDustAmount(bool fail, Tile) :67119-67208 —— per-type 尘数量表
//     （缺省 fail=false 打碎 10 粒 / fail=true 敲击 3 粒;特例逐条）。
//   · KillTile_MakeTileDust(int i, int j, Tile) :67209-69696 —— per-type 尘 id/数量/
//     位置/速度/颜色形态表（2488 行巨型 if/switch 洗衣单,机械逐条移植,禁抽样）。
//   · 主触发面 KillTile 本体 :64212-64216（PlaySounds :64064 之后、Drops :64375 之前）
//     —— fail 两态都出尘;effectOnly 也出尘（:64217 effectOnly return 在尘之后）。
//   · 其余触发面：Player.MowGrassTile :20523-20526、Player.PlaceThing_TryReplacingTiles
//     :40190-40193、WorldGen.ReplaceTile :63072-63077、Projectile.SpawnChlorophyte
//     SporeCloud :42651（×6）、NPC.AI_110_Betsy :62814-62824、Mount 落腿尘 :4724-4732。
//
// 流归属定谳（★⑦批判例）：WorldGen.genRand ≡ Main.rand（WorldGen.cs:4362 别名属性
// `public static UnifiedRandom genRand => Main.rand`）——本表全部 genRand.Next 骰与
// :69654 num139 支的 Main.rand.Next(4) 同流;本移植统一走注入的 ctx.rand()（Game 侧
// = Math.random,与既有尘域口径一致;测试可注入种子流）。
//
// 结构注：本表是「顺序洗若单」——先 `int num = 0`,后面全是独立 if/else-if 链 +
// 两段 switch,【后面的赋值覆盖前面的】（如 460 先 :68900 →16 再 :69213 →108,后者
// 胜出;187 的 `<=1132` 重复臂为原文死支,保留形态）。移植顺序=原文顺序,禁止合并。

import { TILE_DEFS } from '../data/tiles';
import type { TileStore } from './TileStore';

/** WorldGen.beachDistance（WorldGen.cs:4071 `public static readonly int beachDistance = 380`）
 *  ——529 香蒲 289/290 分档门（:67643 `i >= beachDistance && i <= Main.maxTilesX - beachDistance`） */
const BEACH_DISTANCE = 380;

/** Main.tileStone 全表（Main.cs:7568/:8092-8111 `tileStone[x] = true` 逐条提取,9 项）。
 *  MakeTileDust 石族支（:67289 :67289-67305 长链成员）消费 */
const VANILLA_TILE_STONE_SHEETS: ReadonlySet<number> = new Set([
  63, 64, 65, 66, 67, 68, 130, 131, 566,
]);

/** Main.tileMoss 全表（Main.cs:7146-7186 11 项）——苔石支（:67602-67612）消费。
 *  与 data/tiles.ts MOSS_SHEETS 同表（此处显式收录保持本文件自足,值恒等）。 */
const VANILLA_TILE_MOSS_SHEETS: ReadonlySet<number> = new Set([
  179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627,
]);

/** Main.tileAlch 全表（Main.cs:7945-7947 3 项）——药草支（:69296-69323）消费 */
const VANILLA_TILE_ALCH_SHEETS: ReadonlySet<number> = new Set([82, 83, 84]);

/** TorchID.Dust（ID/TorchID.cs:75-99,24 档）——tile 4 火把支（:69375-69378）
 *  `num = TorchID.Dust[Clamp(frameY/22, 0, Count-1)]` */
const TORCH_DUST: readonly number[] = [
  6, 59, 60, 61, 62, 63, 64, 65, 75, 135,
  158, 169, 156, 234, 66, 242, 293, 294, 295, 296,
  297, 298, 307, 310,
];
const TORCH_DUST_COUNT = 24;   // TorchID.Count :132

/** tile 529/530 基座映射支（:67635-67642/:68929-68935）公共形状 */
function grassBaseDust(baseSheet: number, fallback: number): number {
  switch (baseSheet) {
    case 116: return 47;
    case 234: return 125;
    case 112: return 17;
    default: return fallback;
  }
}

/**
 * KillTile_GetTileDustAmount（WorldGen.cs:67119-67208）1:1。
 * @param fail   true=敲击未碎（KillTile fail:true 面）;false=打碎
 * @param sheet  原版 tile sheet（tileCache.type）
 * @param frameX 原版帧 X（184 长苔帧档 :67196-67205 消费）
 */
export function getTileDustAmount(fail: boolean, sheet: number, frameX: number): number {
  switch (sheet) {
    default:
      return fail ? 3 : 10;
    case 654:
      return 0;
    case 630:
    case 631:
      return 0;
    case 231:
      return fail ? 3 : 6;
    case 481:
    case 482:
    case 483:
      return 3;
    case 541:
      return 1;
    case 549:
      return 2;
    case 125:
    case 138:
    case 172:
    case 287:
    case 300:
    case 301:
    case 302:
    case 303:
    case 304:
    case 305:
    case 306:
    case 307:
    case 308:
    case 354:
    case 355:
    case 373:
    case 374:
    case 375:
    case 376:
    case 461:
    case 484:
    case 499:
    case 564:
    case 565:
    case 593:
    case 594:
    case 617:
    case 664:
    case 665:
    case 699:
    case 709:
    case 711:
    case 712:
    case 713:
    case 714:
    case 715:
    case 716:
      return 0;
    case 534:
    case 536:
    case 539:
    case 625:
    case 627:
      return fail ? 3 : 5;
    case 184:
      if (Math.floor(frameX / 22) >= 5) {
        return 5;
      }
      return fail ? 3 : 10;
  }
}

/** 尘发射回调返回的可后置改写句柄（=原版 Main.dust[idx] 字段面;null=池满未生成） */
export interface DustLike {
  vx: number;
  vy: number;
  scale: number;
  fadeIn: number;
  noGravity: boolean;
  noLight: boolean;
  noLightEmittance: boolean;
}

export type DustColorTuple = { r: number; g: number; b: number; a: number };

/** Dust.NewDust 形参面（Dust.cs:75）——返回句柄供后置赋值,null=本仓池满（原版池
 *  固定 1000 恒有槽,本地池满=静默弃,后置赋值一并跳过） */
export type DustSpawn = (
  x: number, y: number, w: number, h: number,
  type: number, speedX: number, speedY: number,
  alpha: number, color: DustColorTuple | null, scale: number,
) => DustLike | null;

/** 邻格/环境读数上下文（KillTile_MakeTileDust 体内对 Main.tile[...] 的外部读 + 环境） */
export interface TileDustCtx {
  /** 原版 Main.tile[x,y] != null 语义 = 界内（空格/非活格【都是】非 null——
   *  5/323 基座下扫会穿空格直落实心底,WorldGen.cs:68651/:68737） */
  inBoundsAt(x: number, y: number): boolean;
  /** 原版 Main.tile[x,y].type 直读语义 → sheet：出界 -1;界内读 RAW sheet
   *  （空格=internal 0 无 vanilla 映射亦 -1,非活格残型也读——原版对 null 外的格直取 .type） */
  sheetAt(x: number, y: number): number;
  /** tile.active()（inBounds ∧ flags≠0;出界 false） */
  activeAt(x: number, y: number): boolean;
  /** Main.tileSolid[sheet] ∧ active()（5/323 基座下扫停止判,WorldGen.cs:68651/:68737
   *  `!active || !tileSolid[type]` 的否定——【含】平台双 true 家族 {19,427,435-439,239,380}
   *  （Main.cs:8031-8032/:9798-9800）,【不含】halfBrick/slope/solidTop 排除与致动位） */
  tileSolidAt(x: number, y: number): boolean;
  /** WorldGen.SolidTile(x,y)（active ∧ tileSolid ∧ !solidTop ∧ !halfBrick ∧ slope==0;越界 false）——518 支 SolidTile(i,j-1) 消费 */
  solidAt(x: number, y: number): boolean;
  /** Main.DiscoR/G/B（彩虹时钟,0-255 整数） */
  disco(): [number, number, number];
  /** Main.rand.NextDouble() ∈ [0,1)（genRand ≡ Main.rand,见头注） */
  rand(): number;
  /** Main.maxTilesX（5/323 基座扫描界门 + 529 beachDistance 门） */
  maxTilesX: number;
}

/** 原版 Main.rand.Next 语义（UnifiedRandom.Next）:
 *  Next(n) ∈ [0,n);Next(min,max) ∈ [min,max) */
function nextN(rand: () => number, n: number): number {
  return Math.floor(rand() * n);
}
function nextRange(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min));
}

/** 本仓 tile → 原版 sheet（-1=出界;界内含非活格 RAW 读——原版 Main.tile[x,y].type 直读语义） */
function sheetOfTile(st: TileStore, i: number, j: number): number {
  if (!st.inBounds(i, j)) return -1;
  const idx = st.idx(i, j);
  return TILE_DEFS[st.type[idx]]?.vanilla?.sheet ?? -1;
}

/** 无尘哨兵（原版尾 `return 6000`——num<0 时返回值;调用方忽略返回值,Projectile.cs:42651
 *  族引用型调用面在 num<0 tile 上原版本就取不到 amount>0,不触雷） */
export const TILE_DUST_NONE = 6000;

/**
 * KillTile_MakeTileDust（WorldGen.cs:67209-69696）1:1——发射【一粒】tile 尘。
 * 顺序洗衣单：后面的赋值覆盖前面的（原文如斯）。返回尘槽句柄索引或 TILE_DUST_NONE。
 * @param src 可选 tileCache 分离源（ReplaceTile :63075 `KillTile_MakeTileDust(x, y,
 *   tileSafely)`——位置/邻读用 (i,j)=锚,被尘 tile 的型/帧/液读 src=原点击格;缺省同格）
 */
export function makeTileDust(
  st: TileStore, i: number, j: number, ctx: TileDustCtx, spawn: DustSpawn,
  src?: { x: number; y: number },
): number {
  const idx = (src && st.inBounds(src.x, src.y)) ? st.idx(src.x, src.y) : st.idx(i, j);
  const sheet = TILE_DEFS[st.type[idx]]?.vanilla?.sheet ?? -1;
  const frameX = st.frameX[idx];
  const frameY = st.frameY[idx];
  const rand = ctx.rand;
  const emit = (
    x: number, y: number, w: number, h: number,
    type: number, speedX: number, speedY: number,
    alpha: number, color: DustColorTuple | null, scale: number,
  ): number => {
    const d = spawn(x, y, w, h, type, speedX, speedY, alpha, color, scale);
    return d ? 1 : TILE_DUST_NONE;
  };

  let num = 0;

  if (sheet === 216) {
    num = -1;
  }
  if (sheet === 324) {
    num = frameY !== 0 ? 281 + Math.floor(frameX / 18) : 280;
  }
  if (sheet === 216) {
    num = -1;
  }
  if (sheet === 335) {
    num = -1;
  }
  if (sheet === 338) {
    num = -1;
  }
  if (sheet === 0) {
    num = 0;
  }
  if (sheet === 192) {
    num = 3;
  }
  if (sheet === 208) {
    num = 126;
  } else if (sheet === 408 || sheet === 409) {
    num = 265;
  } else if (sheet === 669) {
    num = 314;
  } else if (sheet === 670) {
    num = 315;
  } else if (sheet === 671) {
    num = 316;
  } else if (sheet === 672) {
    num = 317;
  } else if (sheet === 673) {
    num = 318;
  } else if (sheet === 674) {
    num = 319;
  } else if (sheet === 675) {
    num = 320;
  } else if (sheet === 676) {
    num = 321;
  }
  if (sheet === 16) {
    num = 1;
    if (frameX >= 36) {
      num = 82;
    }
  } else if (sheet === 415 || sheet === 500) {
    num = 6;
  } else if (sheet === 416 || sheet === 501) {
    num = 61;
  } else if (sheet === 417 || sheet === 502) {
    num = 242;
  } else if (sheet === 418 || sheet === 503) {
    num = 135;
  } else if (sheet === 474) {
    num = 18;
  }
  if (sheet === 1 || sheet === 17 || sheet === 38 || sheet === 39 || sheet === 41 || sheet === 43 || sheet === 44 || sheet === 481 || sheet === 482 || sheet === 483 || sheet === 48 || VANILLA_TILE_STONE_SHEETS.has(sheet) || sheet === 85 || sheet === 90 || sheet === 92 || sheet === 96 || sheet === 97 || sheet === 99 || sheet === 117 || sheet === 130 || sheet === 131 || sheet === 132 || sheet === 135 || sheet === 142 || sheet === 143 || sheet === 144 || sheet === 210 || sheet === 207 || sheet === 235 || sheet === 247 || sheet === 272 || sheet === 273 || sheet === 283 || sheet === 410 || sheet === 480 || sheet === 509 || sheet === 618 || sheet === 657 || sheet === 658 || sheet === 677 || sheet === 678 || sheet === 679 || sheet === 720 || sheet === 721 || sheet === 725 || sheet === 733) {
    num = 1;
  }
  if (sheet === 753) {
    num = -1;
  }
  if (sheet === 379) {
    num = 257;
  }
  if (sheet === 751 || sheet === 752) {
    num = -1;
  }
  if (sheet === 311) {
    num = 207;
  }
  if (sheet === 312) {
    num = 208;
  }
  if (sheet === 313) {
    num = 209;
  }
  if (sheet === 104) {
    num = -1;
  }
  if (sheet === 95 || sheet === 98 || sheet === 100 || sheet === 174 || sheet === 173) {
    num = 6;
  }
  if (sheet === 30 || sheet === 86 || sheet === 94 || sheet === 106 || sheet === 114 || sheet === 124 || sheet === 128 || sheet === 269) {
    num = 7;
  }
  if (sheet === 372) {
    num = 242;
  }
  if (sheet === 646) {
    num = 29;
  }
  if (sheet === 49) {
    num = 29;
  }
  if (sheet === 371) {
    num = 243;
  }
  if (sheet === 334) {
    num = 7;
  }
  switch (sheet) {
    case 10:
    case 11:
    case 87:
    case 89:
    case 93:
    case 139:
    case 209:
    case 319:
    case 320:
    case 386:
    case 387:
    case 390:
    case 405:
    case 406:
    case 411:
    case 412:
    case 419:
    case 420:
    case 421:
    case 422:
    case 423:
    case 424:
    case 425:
    case 428:
    case 429:
    case 441:
    case 442:
    case 445:
    case 446:
    case 447:
    case 448:
    case 449:
    case 450:
    case 451:
    case 452:
    case 453:
    case 455:
    case 456:
    case 457:
    case 462:
    case 463:
    case 464:
    case 465:
    case 466:
    case 468:
    case 476:
    case 486:
    case 487:
    case 489:
    case 490:
    case 491:
    case 493:
    case 494:
    case 497:
    case 510:
    case 511:
    case 520:
    case 521:
    case 522:
    case 523:
    case 524:
    case 525:
    case 526:
    case 527:
    case 531:
    case 545:
    case 547:
    case 548:
    case 560:
    case 564:
    case 565:
    case 567:
    case 572:
    case 579:
    case 591:
    case 592:
    case 593:
    case 594:
    case 613:
    case 614:
    case 621:
    case 622:
    case 623:
    case 624:
    case 630:
    case 631:
    case 656:
    case 700:
    case 701:
    case 726:
      num = -1;
      break;
    case 668:
      num = 0;
      break;
    case 407:
      num = 10;
      break;
    case 454:
      num = 139;
      break;
    case 41:
    case 481:
    case 677:
      num = 275;
      break;
    case 43:
    case 482:
    case 678:
      num = 276;
      break;
    case 44:
    case 483:
    case 679:
      num = 277;
      break;
    case 473:
      num = 82;
      break;
    case 472:
    case 546:
    case 557:
      num = 8;
      break;
    case 498:
      num = 30;
      break;
    case 517:
    case 687:
      num = 258;
      break;
    case 535:
    case 689:
      num = 299;
      break;
    case 537:
    case 690:
      num = 300;
      break;
    case 540:
    case 688:
      num = 301;
      break;
    case 626:
    case 691:
      num = 305;
      break;
    case 184: {
      const num2 = Math.floor(frameX / 22);
      switch (num2) {
        case 5: num = 258; break;
        case 6: num = 299; break;
        case 7: num = 300; break;
        case 8: num = 301; break;
        case 9: num = 305; break;
        case 10: num = 267; break;
        default: num = 93 + num2; break;
      }
      break;
    }
    case 515:
      num = 96;
      break;
    case 516:
      num = 97;
      break;
    case 514:
      num = 95;
      break;
    case 513:
      num = 94;
      break;
    case 512:
      num = 93;
      break;
    case 541:
      num = 226;
      break;
    case 590:
      num = 1;
      break;
    case 583:
      num = nextN(rand, 10) !== 0 ? 1 : 87;
      break;
    case 584:
      num = nextN(rand, 10) !== 0 ? 1 : 86;
      break;
    case 585:
      num = nextN(rand, 10) !== 0 ? 1 : 88;
      break;
    case 586:
      num = nextN(rand, 10) !== 0 ? 1 : 89;
      break;
    case 587:
      num = nextN(rand, 10) !== 0 ? 1 : 90;
      break;
    case 588:
      num = nextN(rand, 10) !== 0 ? 1 : 91;
      break;
    case 589:
      num = nextN(rand, 10) !== 0 ? 1 : 138;
      break;
    case 595:
      num = 78;
      break;
    case 596:
      num = 78;
      break;
    case 615:
      num = 78;
      break;
    case 616:
      num = 78;
      break;
    case 633:
      num = nextN(rand, 6) !== 0 ? 237 : 36;
      break;
    case 637:
    case 638:
      num = 237;
      break;
    case 634:
      num = nextN(rand, 10) !== 0 ? 36 : 31;
      if (nextN(rand, 12) === 0) {
        num = 6;
      }
      break;
  }
  if (VANILLA_TILE_MOSS_SHEETS.has(sheet)) {
    num = sheet === 381 ? 258
      : sheet === 534 ? 299
        : sheet === 536 ? 300
          : sheet === 539 ? 301
            : sheet === 625 ? 305
              : sheet !== 627 ? sheet - 179 + 93 : 267;
  }
  if (sheet === 240) {
    let num3 = Math.floor(frameX / 54);
    if (frameY >= 54) {
      num3 += 36 * Math.floor(frameY / 54);
    }
    num = 7;
    if (num3 === 16 || num3 === 17) {
      num = 26;
    }
    if (num3 >= 46 && num3 <= 49) {
      num = -1;
    }
    if (num3 === 100) {
      num = -1;
    }
  }
  if (sheet === 241) {
    num = 1;
  }
  if (sheet === 242) {
    num = -1;
  }
  if (sheet === 529) {
    const base = ctx.sheetAt(i, j + 1);
    num = base === 116 ? 47
      : base === 234 ? 125
        : base === 112 ? 17
          : (i >= BEACH_DISTANCE && i <= ctx.maxTilesX - BEACH_DISTANCE) ? 289 : 290;
  }
  if (sheet === 356) {
    num = -1;
  }
  if (sheet === 663) {
    num = -1;
  }
  if (sheet === 351) {
    num = -1;
  }
  if (sheet === 246) {
    num = -1;
  }
  if (sheet === 36) {
    num = -1;
  }
  if (sheet === 365) {
    num = 239;
  }
  if (sheet === 366) {
    num = 30;
  }
  if (sheet === 504) {
    num = -1;
  }
  if (sheet === 357 || sheet === 367 || sheet === 561) {
    num = 236;
  }
  if (sheet === 368 || sheet === 369 || sheet === 576) {
    num = 240;
  }
  if (sheet === 170) {
    num = 196;
  }
  if (sheet === 315) {
    num = 225;
  }
  if (sheet === 641) {
    num = nextN(rand, 2) !== 0 ? 161 : 243;
  }
  if (sheet === 659) {
    num = 308;
  }
  if (sheet === 667) {
    num = 308;
  }
  if (sheet === 346) {
    num = 128;
  }
  if (sheet === 347) {
    num = 117;
  }
  if (sheet === 348) {
    num = 42;
  }
  if (sheet === 350) {
    num = 226;
  }
  if (sheet === 370) {
    num = nextN(rand, 2) !== 0 ? 23 : 6;
  }
  if (sheet === 171) {
    num = nextN(rand, 2) !== 0 ? -1 : 196;
  }
  if (sheet === 326) {
    num = 13;
  }
  if (sheet === 327) {
    num = 13;
  }
  if (sheet === 345) {
    num = 13;
  }
  if (sheet === 708) {
    num = 13;
  }
  if (sheet === 458) {
    num = 13;
  }
  if (sheet === 459) {
    num = 13;
  }
  if (sheet === 336) {
    num = 6;
  }
  if (sheet === 340) {
    num = 75;
  }
  if (sheet === 341) {
    num = 65;
  }
  if (sheet === 342) {
    num = 135;
  }
  if (sheet === 343) {
    num = 169;
  }
  if (sheet === 344) {
    num = 156;
  }
  if (sheet === 328) {
    num = 13;
  }
  if (sheet === 329) {
    num = 13;
  }
  if (sheet === 507) {
    num = 13;
  }
  if (sheet === 508) {
    num = 13;
  }
  if (sheet === 562) {
    num = 273;
  }
  if (sheet === 571) {
    num = 40;
  }
  if (sheet === 563) {
    num = 273;
  }
  if (sheet === 330) {
    num = 9;
  }
  if (sheet === 331) {
    num = 11;
  }
  if (sheet === 332) {
    num = 19;
  }
  if (sheet === 333) {
    num = 11;
  }
  if (sheet === 722) {
    num = 57;
  }
  if (sheet === 734) {
    num = 0;
  }
  if (sheet === 735) {
    num = 10;
  }
  if (sheet === 736) {
    num = 277;
  }
  if (sheet === 737) {
    num = 26;
  }
  if (sheet === 738) {
    num = 277;
  }
  if (sheet === 739) {
    num = 68;
  }
  if (sheet === 740) {
    num = 1;
  }
  if (sheet === 741) {
    num = 78;
  }
  switch (sheet) {
    case 750: num = 26; break;
    case 749: num = 1; break;
    case 748: num = 13; break;
    case 747: num = 10; break;
    case 746: num = 148; break;
    case 745: num = 26; break;
    case 744: num = 78; break;
    case 742: num = 96; break;
    case 743: num = 236; break;
  }
  if (sheet === 101) {
    num = -1;
  }
  if (sheet === 19) {
    switch (Math.floor(frameY / 18)) {
      case 0: num = 7; break;
      case 1: num = 77; break;
      case 2: num = 78; break;
      case 3: num = 79; break;
      case 4: num = 26; break;
      case 5: num = 126; break;
      case 6: num = 275; break;
      case 7: num = 277; break;
      case 8: num = 276; break;
      case 9: num = 1; break;
      case 10: num = 214; break;
      case 11: num = 214; break;
      case 12: num = 214; break;
      case 13: num = 109; break;
      case 14: num = 13; break;
      case 15: num = 189; break;
      case 16: num = 191; break;
      case 17: num = 215; break;
      case 18: num = 26; break;
      case 19: num = 214; break;
      case 20: num = 4; break;
      case 21: num = 10; break;
      case 22: num = 32; break;
      case 23: num = 78; break;
      case 24: num = 147; break;
      case 25: num = 40; break;
      case 26: num = 226; break;
      case 27: num = 23; break;
      case 28: num = 240; break;
      case 29: num = 236; break;
      case 30: num = 68 + nextN(rand, 3); break;
      case 31: num = 10; break;
      case 32: num = 78; break;
      case 33: num = 148; break;
      case 34: num = 5; break;
      case 35: num = 80; break;
      case 37: num = 18; break;
      case 38: num = 6; break;
      case 39: num = 61; break;
      case 40: num = 242; break;
      case 41: num = 135; break;
      case 42: num = 287; break;
      case 44: num = 273; break;
      case 45: num = 243; break;
      case 46: num = 243; break;
      case 47: num = 36; break;
      case 48: num = 226; break;
      case 49: num = 16; break;
      case 50: num = 309; break;
      default: num = 1; break;
    }
  }
  if (sheet === 79) {
    const num4 = Math.floor(frameY / 36);
    num = num4 === 0 ? 7
      : num4 === 1 ? 77
        : num4 === 2 ? 78
          : num4 === 3 ? 79
            : num4 === 4 ? 126
              : num4 === 8 ? 109
                : num4 < 9 ? 1 : -1;
  }
  if (sheet === 18) {
    switch (Math.floor(frameX / 36)) {
      case 0: num = 7; break;
      case 1: num = 77; break;
      case 2: num = 78; break;
      case 3: num = 79; break;
      case 4: num = 26; break;
      case 5: num = 40; break;
      case 6: num = 5; break;
      case 7: num = 26; break;
      case 8: num = 4; break;
      case 9: num = 126; break;
      case 10: num = 148; break;
      case 11:
      case 12:
      case 13:
        num = 1;
        break;
      case 14: num = 109; break;
      case 15: num = 126; break;
      default: num = -1; break;
    }
  }
  if (sheet === 14 || sheet === 87 || sheet === 88 || sheet === 469) {
    num = -1;
  }
  if (sheet >= 255 && sheet <= 261) {
    const num5 = sheet - 255;
    num = 86 + num5;
    if (num5 === 6) {
      num = 138;
    }
  }
  if (sheet >= 262 && sheet <= 268) {
    const num6 = sheet - 262;
    num = 86 + num6;
    if (num6 === 6) {
      num = 138;
    }
  }
  if (sheet === 178) {
    const num7 = Math.floor(frameX / 18);
    num = 86 + num7;
    if (num7 === 6) {
      num = 138;
    }
  }
  if (sheet === 440) {
    switch (Math.floor(frameX / 54)) {
      case 0: num = 90; break;
      case 1: num = 88; break;
      case 2: num = 89; break;
      case 3: num = 87; break;
      case 4: num = 86; break;
      case 5: num = 91; break;
      case 6: num = 138; break;
      default: num = -1; break;
    }
    if (frameY < 54) {
      num = -1;
    }
  }
  switch (sheet) {
    case 426:
    case 427:
    case 727:
      num = 90;
      break;
    case 430:
    case 435:
    case 728:
      num = 89;
      break;
    case 431:
    case 436:
    case 729:
      num = 88;
      break;
    case 432:
    case 437:
    case 730:
      num = 87;
      break;
    case 433:
    case 438:
    case 731:
      num = 86;
      break;
    case 434:
    case 439:
    case 732:
      num = 91;
      break;
    case 496:
      num = 109;
      break;
    case 549:
      num = 3;
      break;
    case 552:
      num = 32;
      break;
  }
  if (sheet === 186) {
    num = frameX <= 360 ? 26
      : frameX <= 846 ? 1
        : frameX <= 954 ? 9
          : frameX <= 1062 ? 11
            : frameX <= 1170 ? 10
              : frameX > 1332 ? (frameX > 1386 ? 80 : 10) : 0;
  }
  if (sheet === 187) {
    if (frameX <= 144) {
      num = 1;
    } else if (frameX <= 306) {
      num = 38;
    } else if (frameX <= 468) {
      num = 36;
    } else if (frameX <= 738) {
      num = 30;
    } else if (frameX <= 970) {
      num = 1;
    } else if (frameX <= 1132) {
      num = 148;
    } else if (frameX <= 1132) {
      // 原文死支（:68204 重复同界,永不可达）——1:1 保留形态
      num = 155;
    } else if (frameX <= 1348) {
      num = 1;
    } else if (frameX <= 1564) {
      num = 0;
    } else if (frameX <= 1890) {
      num = 250;
    } else if (frameX <= 2196) {
      num = 240;
    } else if (frameX <= 2520) {
      num = 236;
    }
  }
  if (sheet === 647) {
    const num8 = Math.floor(frameX / 54);
    if (num8 < 7) {
      num = 26;
    } else if (num8 < 16) {
      num = 1;
    } else if (num8 < 18) {
      num = 9;
    } else if (num8 < 20) {
      num = 11;
    } else if (num8 < 22) {
      num = 10;
    } else if (num8 < 26) {
      num = 7;
    } else if (num8 < 32) {
      num = 80;
    } else if (num8 < 35) {
      num = 80;
    }
  }
  if (sheet === 648) {
    let num9 = Math.floor(frameX / 54);
    num9 += Math.floor(frameY / 36) * 35;
    if (num9 < 3) {
      num = 1;
    } else if (num9 < 6) {
      num = 38;
    } else if (num9 < 9) {
      num = 36;
    } else if (num9 < 14) {
      num = 30;
    } else if (num9 < 17) {
      num = 1;
    } else if (num9 < 18) {
      num = 1;
    } else if (num9 < 21) {
      num = 148;
    } else if (num9 < 29) {
      num = 155;
    } else if (num9 < 35) {
      num = 287;
    } else if (num9 < 41) {
      num = 240;
    } else if (num9 < 47) {
      num = 236;
    } else if (num9 < 50) {
      num = 0;
    } else if (num9 < 52) {
      num = 2;
    } else if (num9 < 55) {
      num = 26;
    }
  }
  if (sheet === 706) {
    num = 1;
  }
  if (sheet === 105) {
    num = 1;
    if (frameX >= 1548 && frameX <= 1654 && frameY < 54) {
      num = 148;
    }
  }
  if (sheet === 349) {
    num = 1;
  }
  if (sheet === 337 || sheet === 506) {
    num = 1;
  }
  if (sheet === 239) {
    const num10 = Math.floor(frameX / 18);
    if (num10 === 0) {
      num = 9;
    }
    if (num10 === 1) {
      num = 81;
    }
    if (num10 === 2) {
      num = 8;
    }
    if (num10 === 3) {
      num = 82;
    }
    if (num10 === 4) {
      num = 11;
    }
    if (num10 === 5) {
      num = 83;
    }
    if (num10 === 6) {
      num = 10;
    }
    if (num10 === 7) {
      num = 84;
    }
    if (num10 === 8) {
      num = 14;
    }
    if (num10 === 9) {
      num = 23;
    }
    if (num10 === 10) {
      num = 25;
    }
    if (num10 === 11) {
      num = 48;
    }
    if (num10 === 12) {
      num = 144;
    }
    if (num10 === 13) {
      num = 49;
    }
    if (num10 === 14) {
      num = 145;
    }
    if (num10 === 15) {
      num = 50;
    }
    if (num10 === 16) {
      num = 146;
    }
    if (num10 === 17) {
      num = 128;
    }
    if (num10 === 18) {
      num = 84;
    }
    if (num10 === 19) {
      num = 117;
    }
    if (num10 === 20) {
      num = 42;
    }
    if (num10 === 21) {
      num = -1;
    }
    if (num10 === 22) {
      num = 265;
    }
  }
  if (sheet === 185) {
    if (frameY === 18) {
      const num11 = Math.floor(frameX / 36);
      if (num11 < 6) {
        num = 1;
      } else if (num11 < 16) {
        num = 26;
      } else if (num11 === 16) {
        num = 9;
      } else if (num11 === 17) {
        num = 11;
      } else if (num11 === 18) {
        num = 10;
      } else if (num11 === 19) {
        num = 86;
      } else if (num11 === 20) {
        num = 87;
      } else if (num11 === 21) {
        num = 88;
      } else if (num11 === 22) {
        num = 89;
      } else if (num11 === 23) {
        num = 90;
      } else if (num11 === 24) {
        num = 91;
      } else if (num11 < 31) {
        num = 80;
      } else if (num11 < 33) {
        num = 7;
      } else if (num11 < 34) {
        num = 8;
      } else if (num11 < 38) {
        num = 30;
      } else if (num11 < 41) {
        num = 1;
      } else if (num11 < 47) {
        num = 287;
      } else if (num11 < 53) {
        num = 240;
      } else if (num11 < 59) {
        num = 236;
      }
    } else {
      const num12 = Math.floor(frameX / 18);
      if (num12 < 6) {
        num = 1;
      } else if (num12 < 12) {
        num = 0;
      } else if (num12 < 28) {
        num = 26;
      } else if (num12 < 33) {
        num = 1;
      } else if (num12 < 36) {
        num = 0;
      } else if (num12 < 48) {
        num = 80;
      } else if (num12 < 54) {
        num = 30;
      } else if (num12 < 60) {
        num = 287;
      } else if (num12 < 66) {
        num = 240;
      } else if (num12 < 72) {
        num = 236;
      } else if (num12 < 73) {
        num = 0;
      } else if (num12 < 77) {
        num = 32;
      }
    }
  }
  if (sheet === 649) {
    const num13 = Math.floor(frameX / 36) + Math.floor(frameY / 18) * 53;
    if (num13 < 6) {
      num = 1;
    } else if (num13 < 16) {
      num = 26;
    } else if (num13 === 16) {
      num = 9;
    } else if (num13 === 17) {
      num = 11;
    } else if (num13 === 18) {
      num = 10;
    } else if (num13 === 19) {
      num = 86;
    } else if (num13 === 20) {
      num = 87;
    } else if (num13 === 21) {
      num = 88;
    } else if (num13 === 22) {
      num = 89;
    } else if (num13 === 23) {
      num = 90;
    } else if (num13 === 24) {
      num = 91;
    } else if (num13 < 31) {
      num = 80;
    } else if (num13 < 33) {
      num = 7;
    } else if (num13 < 34) {
      num = 8;
    } else if (num13 < 38) {
      num = 30;
    } else if (num13 < 41) {
      num = 1;
    } else if (num13 < 47) {
      num = 287;
    } else if (num13 < 53) {
      num = 240;
    } else if (num13 < 59) {
      num = 236;
    } else if (num13 < 62) {
      num = 0;
    } else if (num13 < 64 || (num13 >= 65 && num13 <= 67)) {
      num = 32;
    } else if (num13 === 64) {
      num = 40;
    }
  }
  if (sheet === 650) {
    const num14 = Math.floor(frameX / 18);
    if (num14 < 6) {
      num = 1;
    } else if (num14 < 12) {
      num = 0;
    } else if (num14 < 28) {
      num = 26;
    } else if (num14 < 33) {
      num = 1;
    } else if (num14 < 36) {
      num = 0;
    } else if (num14 < 48) {
      num = 80;
    } else if (num14 < 54) {
      num = 30;
    } else if (num14 < 60) {
      num = 287;
    } else if (num14 < 66) {
      num = 240;
    } else if (num14 < 72) {
      num = 236;
    } else if (num14 < 73) {
      num = 0;
    } else {
      switch (num14) {
        case 73:
        case 74:
        case 76:
        case 78:
        case 79:
        case 80:
        case 81:
          num = 32;
          break;
        default:
          if (num14 === 75 || num14 === 77) {
            num = 40;
          }
          break;
      }
    }
  }
  if (sheet === 237) {
    num = 148;
  }
  if (sheet === 157) {
    num = 77;
  }
  if (sheet === 158 || sheet === 232 || sheet === 383 || sheet === 575) {
    num = 78;
  }
  if (sheet === 159) {
    num = 78;
  }
  if (sheet === 15) {
    num = -1;
  }
  if (sheet === 191) {
    num = 7;
  }
  if (sheet === 5) {
    num = 7;
    if (i > 5 && i < ctx.maxTilesX - 5) {
      let num15 = i;
      let k = j;
      if (frameX === 66 && frameY <= 45) {
        num15++;
      }
      if (frameX === 88 && frameY >= 66 && frameY <= 110) {
        num15--;
      }
      if (frameX === 22 && frameY >= 132 && frameY <= 176) {
        num15--;
      }
      if (frameX === 44 && frameY >= 132 && frameY <= 176) {
        num15++;
      }
      if (frameX === 44 && frameY >= 132 && frameY <= 176) {
        // 原文重复段（:68662-68665 两个相同 if 连写）——列移 +2,1:1 保留
        num15++;
      }
      if (frameX === 44 && frameY >= 198) {
        num15++;
      }
      if (frameX === 66 && frameY >= 198) {
        num15--;
      }
      for (; ctx.inBoundsAt(num15, k) && !ctx.tileSolidAt(num15, k); k++) {
      }
      if (ctx.inBoundsAt(num15, k)) {
        const base = ctx.sheetAt(num15, k);
        if (!ctx.activeAt(num15, k)) {
          // 原版逐 case `active() && type == N`——非活格不落任何映射
        } else if (base === 23) {
          num = 77;
        }
        if (base === 661) {
          num = 77;
        }
        if (base === 60) {
          num = 78;
        }
        if (base === 70) {
          num = 26;
        }
        if (base === 109) {
          num = 79;
        }
        if (base === 199) {
          num = 121;
        }
        if (base === 662) {
          num = 121;
        }
        if (base === 147) {
          num = 122;
        }
      }
    }
  }
  if (sheet === 323) {
    num = 215;
    if (i > 5 && i < ctx.maxTilesX - 5) {
      let l = j;
      for (; ctx.inBoundsAt(i, l) && !ctx.tileSolidAt(i, l); l++) {
      }
      if (ctx.inBoundsAt(i, l)) {
        const base = ctx.sheetAt(i, l);
        if (!ctx.activeAt(i, l)) {
          // 原版逐 case `active() && type == N`——非活格不落任何映射
        } else if (base === 234) {
          num = 121;
        }
        if (base === 116) {
          num = 79;
        }
        if (base === 112) {
          num = 77;
        }
      }
    }
  }
  if (sheet === 137) {
    switch (Math.floor(frameY / 18)) {
      default:
        num = 1;
        break;
      case 1:
      case 2:
      case 3:
      case 4:
        num = 148;
        break;
      case 5:
        num = 1;
        break;
    }
  }
  if (sheet === 443) {
    num = 1;
  }
  if (sheet === 444) {
    num = -1;
  }
  if (sheet === 212) {
    num = -1;
  }
  if (sheet === 213) {
    num = 129;
  }
  if (sheet === 214) {
    num = 1;
  }
  if (sheet === 215) {
    num = -6;
  }
  if (sheet === 325) {
    num = 81;
  }
  if (sheet === 251) {
    num = 189;
  }
  if (sheet === 252) {
    num = 190;
  }
  if (sheet === 253) {
    num = 191;
  }
  if (sheet === 254) {
    if (frameX < 72) {
      num = 3;
    } else if (frameX < 108) {
      num = 3;
      if (nextN(rand, 3) === 0) {
        num = 189;
      }
    } else if (frameX < 144) {
      num = 3;
      if (nextN(rand, 2) === 0) {
        num = 189;
      }
    } else {
      num = 3;
      if (nextN(rand, 4) !== 0) {
        num = 189;
      }
    }
  }
  if (sheet === 467) {
    num = -1;
  }
  if (sheet === 21) {
    num = frameX >= 1008 ? -1
      : frameX >= 612 ? 11
        : frameX >= 576 ? 148
          : frameX >= 540 ? 26
            : frameX >= 504 ? 126
              : frameX >= 468 ? 116
                : frameX >= 432 ? 7
                  : frameX >= 396 ? 11
                    : frameX >= 360 ? 10
                      : frameX >= 324 ? 79
                        : frameX >= 288 ? 78
                          : frameX >= 252 ? 77
                            : frameX >= 216 ? 1
                              : frameX >= 180 ? 7
                                : frameX >= 108 ? 37
                                  : frameX < 36 ? 7 : 10;
  }
  if (sheet === 382) {
    num = 3;
  }
  if (sheet === 2 || sheet === 477) {
    num = nextN(rand, 2) !== 0 ? 2 : 0;
  }
  if (sheet === 127) {
    num = 67;
  }
  if (sheet === 91) {
    num = -1;
  }
  if (sheet === 198) {
    num = 109;
  }
  if (sheet === 34) {
    num = -1;
  }
  if (sheet === 6) {
    num = 8;
  }
  if (sheet === 7 || sheet === 47 || sheet === 284 || sheet === 682) {
    num = 9;
  }
  if (sheet === 8 || sheet === 45 || sheet === 102 || sheet === 680) {
    num = 10;
  }
  if (sheet === 9 || sheet === 42 || sheet === 46 || sheet === 126 || sheet === 136 || sheet === 681) {
    num = 11;
  }
  if (sheet === 166 || sheet === 175) {
    num = 81;
  }
  if (sheet === 167) {
    num = 82;
  }
  if (sheet === 168 || sheet === 176) {
    num = 83;
  }
  if (sheet === 169 || sheet === 177) {
    num = 84;
  }
  if (sheet === 199 || sheet === 662) {
    num = 117;
  }
  if (sheet === 205) {
    num = 125;
  }
  if (sheet === 201) {
    num = 125;
  }
  if (sheet === 211) {
    num = 128;
  }
  if (sheet === 227) {
    switch (Math.floor(frameX / 34)) {
      case 0:
      case 1:
        num = 26;
        break;
      case 3:
        num = 3;
        break;
      case 2:
      case 4:
      case 5:
      case 6:
        num = 40;
        break;
      case 7:
        num = 117;
        break;
      case 8:
        num = 17;
        break;
      case 9:
        num = 6;
        break;
      case 10:
        num = 3;
        break;
      case 11:
        num = 26;
        break;
    }
  }
  if (sheet === 204 || sheet === 478) {
    num = 117;
    if (nextN(rand, 2) === 0) {
      num = 1;
    }
  }
  if (sheet === 203) {
    num = 117;
  }
  if (sheet === 243) {
    num = nextN(rand, 2) !== 0 ? 13 : 7;
  }
  if (sheet === 219) {
    num = -1;
  }
  if (sheet === 642) {
    num = -128;
  }
  if (sheet === 244) {
    num = nextN(rand, 2) === 0 ? 1 : 13;
  }
  if (sheet === 597) {
    num = -1;
  } else if ((sheet >= 358 && sheet <= 364) || (sheet >= 275 && sheet <= 282) || sheet === 285 || sheet === 286 || (sheet >= 288 && sheet <= 297) || (sheet >= 316 && sheet <= 318) || sheet === 298 || sheet === 299 || sheet === 309 || sheet === 310 || sheet === 339 || sheet === 538 || sheet === 413 || sheet === 414 || sheet === 505 || sheet === 521 || sheet === 522 || sheet === 523 || sheet === 524 || sheet === 525 || sheet === 526 || sheet === 527 || sheet === 532 || sheet === 543 || sheet === 544 || sheet === 550 || sheet === 551 || sheet === 533 || sheet === 553 || sheet === 554 || sheet === 555 || sheet === 556 || sheet === 558 || sheet === 559 || sheet === 542 || sheet === 391 || sheet === 394 || sheet === 392 || sheet === 393 || sheet === 568 || sheet === 569 || sheet === 570 || sheet === 582 || sheet === 580 || sheet === 598 || sheet === 599 || sheet === 600 || sheet === 601 || sheet === 602 || sheet === 603 || sheet === 604 || sheet === 605 || sheet === 606 || sheet === 607 || sheet === 608 || sheet === 609 || sheet === 610 || sheet === 611 || sheet === 612 || sheet === 619 || sheet === 620 || sheet === 629 || sheet === 632 || sheet === 640 || sheet === 643 || sheet === 644 || sheet === 645 || sheet === 710) {
    num = 13;
    if (nextN(rand, 3) !== 0) {
      num = -1;
    }
  }
  if (sheet === 13) {
    num = frameX < 90 ? 13 : -1;
  }
  if (sheet === 189) {
    num = 16;
  }
  if (sheet === 717) {
    num = 326;
  }
  if (sheet === 718) {
    num = 327;
  }
  if (sheet === 719) {
    num = 328;
  }
  if (sheet === 460) {
    num = 16;
  }
  if (sheet === 530) {
    const base = ctx.sheetAt(i, j + 2 - Math.floor(frameY / 18));
    num = grassBaseDust(base, frameX >= 270 ? 291 : 40);
  }
  if (sheet === 705) {
    const num16 = Math.floor(frameX / 54) + Math.floor(frameY / 36) * 10;
    const flag = frameX % 486 < 270;
    num = (num16 >= 0 && num16 <= 8) ? (flag ? 291 : 40)
      : (num16 >= 9 && num16 <= 17) ? 47
        : (num16 < 18 || num16 > 26) ? 17 : 125;
  }
  if (sheet === 518) {
    if (frameY === 0) {
      num = 3;
    } else if (frameY === 18) {
      num = 47;
    } else if (frameY === 36) {
      num = 40;
    }
  } else if (sheet === 519) {
    if (frameY === 0) {
      num = 3;
    } else if (frameY === 18) {
      num = 40;
    } else if (frameY === 36) {
      num = 47;
    } else if (frameY === 54) {
      num = 125;
    } else if (frameY === 72) {
      num = 17;
    } else if (frameY === 90) {
      num = 26;
    }
  } else if (sheet === 636) {
    num = 17;
  } else if (sheet === 528) {
    num = 26;
  }
  if (sheet === 12) {
    num = 12;
  }
  if (sheet === 639) {
    num = 48;
  }
  if (sheet === 3 || sheet === 73) {
    num = 3;
  }
  if (sheet === 54) {
    num = 13;
  }
  if (sheet === 22 || sheet === 140) {
    num = 14;
  }
  if (sheet === 78) {
    num = 22;
  }
  if (sheet === 28 || sheet === 653) {
    num = 22;
    if (frameY >= 72 && frameY <= 90) {
      num = 1;
    }
    if (frameY >= 144 && frameY <= 234) {
      num = 48;
    }
    if (frameY >= 252 && frameY <= 358) {
      num = 85;
    }
    if (frameY >= 360 && frameY <= 466) {
      num = 26;
    }
    if (frameY >= 468 && frameY <= 574) {
      num = 36;
    }
    if (frameY >= 576 && frameY <= 790) {
      num = 18;
    }
    if (frameY >= 792 && frameY <= 898) {
      num = 5;
    }
    if (frameY >= 900 && frameY <= 1006) {
      num = 0;
    }
    if (frameY >= 1008 && frameY <= 1114) {
      num = 148;
    }
    if (frameY >= 1116 && frameY <= 1222) {
      num = 241;
    }
    if (frameY >= 1224 && frameY <= 1330) {
      num = 287;
    }
  }
  if (sheet === 163) {
    num = 118;
  }
  if (sheet === 164) {
    num = 119;
  }
  if (sheet === 200) {
    num = 120;
  }
  if (sheet === 221 || sheet === 248) {
    num = 144;
  }
  if (sheet === 222 || sheet === 249) {
    num = 145;
  }
  if (sheet === 223 || sheet === 250) {
    num = 146;
  }
  if (sheet === 224) {
    num = 149;
  }
  if (sheet === 225) {
    num = 147;
  }
  if (sheet === 229) {
    num = 153;
  }
  if (sheet === 231) {
    num = 153;
    if (nextN(rand, 3) === 0) {
      num = 26;
    }
  }
  if (sheet === 226) {
    num = 148;
  }
  if (sheet === 103) {
    num = -1;
  }
  if (sheet === 29) {
    num = 23;
  }
  if (sheet === 40) {
    num = 28;
  }
  if (sheet === 50 || sheet === 707) {
    num = 22;
  }
  if (sheet === 51 || sheet === 697) {
    num = 30;
  }
  if (sheet === 52 || sheet === 353) {
    num = 3;
  }
  if (sheet === 53 || sheet === 81 || sheet === 151 || sheet === 202 || sheet === 274 || sheet === 495) {
    num = 32;
  }
  if (sheet === 56 || sheet === 152) {
    num = 37;
  }
  if (sheet === 75 || sheet === 683) {
    num = 109;
  }
  if (sheet === 57 || sheet === 119 || sheet === 141 || sheet === 234 || sheet === 635 || sheet === 654) {
    num = 36;
  }
  if (sheet === 59 || sheet === 120) {
    num = 38;
  }
  if (sheet === 61 || sheet === 703 || sheet === 62 || sheet === 74 || sheet === 80 || sheet === 188 || sheet === 233 || sheet === 236 || sheet === 702 || sheet === 384 || sheet === 652 || sheet === 651) {
    num = 40;
  }
  if (sheet === 485) {
    num = 32;
  }
  if (sheet === 238) {
    num = nextN(rand, 3) !== 0 ? 166 : 167;
  }
  if (sheet === 69) {
    num = 7;
  }
  if (sheet === 655) {
    num = 166;
  }
  if (sheet === 71 || sheet === 72 || sheet === 190 || sheet === 578) {
    num = 26;
  }
  if (sheet === 70) {
    num = 17;
  }
  if (sheet === 112) {
    num = 14;
  }
  if (sheet === 123) {
    num = 53;
  }
  if (sheet === 161) {
    num = 80;
  }
  if (sheet === 206) {
    num = 80;
  }
  if (sheet === 162) {
    num = 80;
  }
  if (sheet === 165 || sheet === 693 || sheet === 694) {
    switch (Math.floor(frameX / 54)) {
      case 0: num = 80; break;
      case 1: num = 1; break;
      case 2: num = 30; break;
      case 3: num = 147; break;
      case 4: num = 51; break;
      case 5: num = 14; break;
      case 6: num = 117; break;
      case 7: num = 250; break;
      case 8: num = 240; break;
      case 9: num = 236; break;
      case 10: num = 119; break;
      case 11: num = 118; break;
      case 12: num = 120; break;
      default: num = 1; break;
    }
  }
  if (sheet === 666) {
    num = 322;
  }
  if (sheet === 193) {
    num = 4;
  }
  if (sheet === 194) {
    num = 26;
  }
  if (sheet === 195) {
    num = 5;
  }
  if (sheet === 196) {
    num = 108;
  }
  if (sheet === 460) {
    num = 108;
  }
  if (sheet === 197) {
    num = 4;
  }
  if (sheet === 153) {
    num = 26;
  }
  if (sheet === 154) {
    num = 32;
  }
  if (sheet === 155) {
    num = 2;
  }
  if (sheet === 156) {
    num = 1;
  }
  if (sheet === 116 || sheet === 117 || sheet === 118 || sheet === 147 || sheet === 148) {
    num = 51;
  }
  if (sheet === 109 || sheet === 492) {
    num = nextN(rand, 2) !== 0 ? 47 : 0;
  }
  if (sheet === 110 || sheet === 113 || sheet === 115) {
    num = 47;
  }
  if (sheet === 107 || sheet === 121 || sheet === 685) {
    num = 48;
  }
  if (sheet === 108 || sheet === 122 || sheet === 146 || sheet === 686) {
    num = 49;
  }
  if (sheet === 111 || sheet === 145 || sheet === 150) {
    num = 50;
  }
  if (sheet === 133) {
    num = 50;
    if (frameX >= 54) {
      num = 146;
    }
  }
  if (sheet === 134) {
    num = 49;
    if (frameX >= 36) {
      num = 145;
    }
  }
  if (sheet === 149) {
    num = 49;
  }
  if (VANILLA_TILE_ALCH_SHEETS.has(sheet)) {
    const num17 = Math.floor(frameX / 18);
    if (num17 === 0) {
      num = 3;
    }
    if (num17 === 1) {
      num = 3;
    }
    if (num17 === 2) {
      num = 7;
    }
    if (num17 === 3) {
      num = 17;
    }
    if (num17 === 4) {
      num = 289;
    }
    if (num17 === 5) {
      num = 6;
    }
    if (num17 === 6) {
      num = 224;
    }
  }
  if (sheet === 58 || sheet === 76 || sheet === 77 || sheet === 684) {
    num = nextN(rand, 2) !== 0 ? 25 : 6;
  }
  if (sheet === 37) {
    num = nextN(rand, 2) !== 0 ? 23 : 6;
  }
  if (sheet === 32) {
    num = nextN(rand, 2) !== 0 ? 24 : 14;
  }
  if (sheet === 352) {
    num = nextN(rand, 3) !== 0 ? 125 : 5;
  }
  if (sheet === 23 || sheet === 24 || sheet === 661) {
    num = nextN(rand, 2) !== 0 ? 17 : 14;
  }
  if (sheet === 25 || sheet === 31 || sheet === 696) {
    num = ((sheet === 31 || sheet === 696) && frameX >= 36) ? 5 : (nextN(rand, 2) !== 0 ? 1 : 14);
  }
  if (sheet === 26 || sheet === 695) {
    num = frameX >= 54 ? 5 : (nextN(rand, 2) !== 0 ? 1 : 14);
  }
  if (sheet === 20) {
    switch (Math.floor(frameX / 54)) {
      case 1: num = 122; break;
      case 2: num = 78; break;
      case 3: num = 77; break;
      case 4: num = 121; break;
      case 5: num = 79; break;
      default: num = 7; break;
    }
  }
  if (sheet === 27) {
    num = nextN(rand, 2) !== 0 ? 19 : 3;
  }
  if (sheet === 129) {
    if (frameX >= 324) {
      num = 69;
    }
    num = (frameX !== 0 && frameX !== 54 && frameX !== 108)
      ? ((frameX !== 18 && frameX !== 72 && frameX !== 126) ? 70 : 69)
      : 68;
  }
  if (sheet === 385) {
    num = nextRange(rand, 68, 71);
  }
  if (sheet === 4) {
    let num18 = Math.floor(frameY / 22);
    if (num18 < 0) num18 = 0;
    if (num18 > TORCH_DUST_COUNT - 1) num18 = TORCH_DUST_COUNT - 1;   // MathHelper.Clamp
    num = TORCH_DUST[num18];
  }
  if (sheet === 35) {
    num = 189;
    if (frameX < 36 && nextN(rand, 2) === 0) {
      num = 6;
    }
  }
  if ((sheet === 34 || sheet === 42) && nextN(rand, 2) === 0) {
    num = 6;
  }
  if (sheet === 270) {
    num = -1;
  }
  if (sheet === 271) {
    num = -1;
  }
  if (sheet === 581) {
    num = -1;
  }
  if (sheet === 660) {
    num = -1;
  }
  if (sheet === 698) {
    num = -1;
  }
  if (sheet === 79 || sheet === 90 || sheet === 101) {
    num = -1;
  }
  if (sheet === 33 || sheet === 34 || sheet === 42 || sheet === 93 || sheet === 100) {
    num = -1;
  }
  if (sheet === 321 || sheet === 574) {
    num = 214;
  }
  if (sheet === 322) {
    num = 215;
  }
  if (sheet === 635) {
    num = 36;
  }
  let flag2 = sheet === 178 || sheet === 440;
  switch (sheet) {
    case 178:
    case 426:
    case 427:
    case 430:
    case 431:
    case 432:
    case 433:
    case 434:
    case 435:
    case 436:
    case 437:
    case 438:
    case 439:
    case 440:
    case 727:
    case 728:
    case 729:
    case 730:
    case 731:
    case 732:
      flag2 = true;
      break;
  }

  // ---- 发射段（:69457-69696）——num<0 = 不出尘（原版 return 6000）----
  if (num >= 0) {
    const px = i * 16;
    const py = j * 16;
    if (sheet === 627 || sheet === 628 || (sheet === 184 && Math.floor(frameX / 22) === 10)) {
      const [dr, dg, db] = ctx.disco();
      const d = spawn(px, py, 16, 16, num, 0, 0, 0, { r: dr, g: dg, b: db, a: 255 }, 1);
      if (!d) return TILE_DUST_NONE;
      d.noGravity = true;
      d.noLightEmittance = true;
      return 1;
    }
    if (sheet === 518) {
      let num20 = Math.floor(st.liquid[idx] / 16);
      num20 -= 3;
      if (ctx.solidAt(i, j - 1) && num20 > 8) {
        num20 = 8;
      }
      return emit(px, py - num20, 16, 16, num, 0, 0, 0, null, 1);
    }
    if (sheet === 352 && num === 5) {
      const d = spawn(px, py, 16, 16, 5, 0, 0, 100, null, 1.5);
      if (!d) return TILE_DUST_NONE;
      d.scale = 1.5;
      d.noGravity = true;
      d.vx *= 1.65;
      d.vy *= 1.65;
      d.fadeIn = 1.6;
      return 1;
    }
    if (sheet === 160 || sheet === 692) {
      const [dr, dg, db] = ctx.disco();
      const d = spawn(px, py, 16, 16, 66, 0, 0, 100, { r: dr, g: dg, b: db, a: 255 }, 0.75);
      if (!d) return TILE_DUST_NONE;
      d.noGravity = true;
      return 1;
    }
    if (sheet === 323) {
      return emit(px + frameY, py, 16, 16, num, 0, 0, 0, null, 1);
    }
    if (sheet === 314) {
      const d = spawn(px, py, 16, 16, 213, nextRange(rand, -2, 3), nextRange(rand, -2, 3), 0, null, 1);
      if (!d) return TILE_DUST_NONE;
      d.noGravity = true;
      d.fadeIn = d.scale + 1 + 0.01 * nextRange(rand, 0, 51);
      d.noGravity = true;
      return 1;
    }
    if (flag2) {
      const d = spawn(px, py, 16, 16, num, 0, 0, 75, null, 0.75);
      if (!d) return TILE_DUST_NONE;
      d.noLight = true;
      return 1;
    }
    if (sheet === 193 || (sheet === 18 && num === 4) || (sheet === 19 && num === 4)) {
      return emit(px, py, 16, 16, num, 0, 0, 75, { r: 0, g: 80, b: 255, a: 100 }, 0.75);
    }
    if (sheet === 197) {
      return emit(px, py, 16, 16, num, 0, 0, 75, { r: 97, g: 200, b: 255, a: 100 }, 0.75);
    }
    if (sheet === 185 && num >= 86 && num <= 91) {
      const d = spawn(px, py, 16, 16, num, 0, 0, 75, null, 0.75);
      if (!d) return TILE_DUST_NONE;
      d.noLight = true;
      return 1;
    }
    if (sheet === 4 && num === 66) {
      const [dr, dg, db] = ctx.disco();
      const d = spawn(px, py, 16, 16, num, 0, 0, 0, { r: dr / 255, g: dg / 255, b: db / 255, a: 255 }, 1);
      if (!d) return TILE_DUST_NONE;
      d.noGravity = true;
      return 1;
    }
    if (num === 139) {
      return emit(px, py, 16, 16, num + nextN(rand, 4), 0, 0, 0, null, 1);
    }
    if (sheet === 722) {
      const d = spawn(px, py, 16, 16, num, 0, 0, 0, null, 1);
      if (!d) return TILE_DUST_NONE;
      d.vx *= 0.4;
      d.vy *= 0.4;
      return 1;
    }
    return emit(px, py, 16, 16, num, 0, 0, 0, null, 1);
  }
  return TILE_DUST_NONE;
}

/** Main.tileSolid 双 true 平台家族（Main.cs:8031-8032 {19,427,435-439} 平台族 +
 *  :9798-9800 {239,380}）——本仓数据面 platform 旗与 solid 旗分立,主 tileSolid
 *  判定需补此族（tileSolidAt 消费） */
const TILE_SOLID_EXTRA_SHEETS: ReadonlySet<number> = new Set([19, 427, 435, 436, 437, 438, 439, 239, 380]);

function tileSolidSheetAt(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const idx = st.idx(x, y);
  if (st.flags[idx] === 0) return false;             // active()
  const def = TILE_DEFS[st.type[idx]];
  if (!def) return false;
  return def.solid || TILE_SOLID_EXTRA_SHEETS.has(def.vanilla?.sheet ?? -1);
}

/** 邻格读数默认实现（TileStore 适配,Game/测试共用）。solidAt 缺省=st.isSolid
 *  （本仓 SolidTile 等价,active∧!致动∧solid LUT——平台族不在 solid LUT 内,与
 *  原版 SolidTile 排除 solidTop 同面）;disco 缺省恒 (255,0,0)（Main 初值,
 *  Game 侧注入活时钟）;rand 缺省 Math.random。 */
export function makeTileDustCtx(
  st: TileStore,
  opts?: {
    rand?: () => number;
    disco?: () => [number, number, number];
    solidAt?: (x: number, y: number) => boolean;
  },
): TileDustCtx {
  return {
    inBoundsAt: (x, y) => st.inBounds(x, y),
    sheetAt: (x, y) => sheetOfTile(st, x, y),
    activeAt: (x, y) => st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0,
    tileSolidAt: (x, y) => tileSolidSheetAt(st, x, y),
    solidAt: opts?.solidAt ?? ((x, y) => st.isSolid(x, y)),
    disco: opts?.disco ?? (() => [255, 0, 0]),
    rand: opts?.rand ?? Math.random,
    maxTilesX: st.w,
  };
}
