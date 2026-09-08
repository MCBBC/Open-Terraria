// 原版 KillTile 掉落全表金标（1457 权威 = WorldGen.cs KillTile_GetItemDrops
// :64503-66611 主 switch 机械提取,2026-09-07 掉落全表对账批）。
//
// 语义定谳（对账前置结论）：
// - 主 switch 三类出口：const/expr（恒掉 N 件）｜no-drop 组（342 型共享 break,掉落全走
//   TileFrame Check* 帧检——本仓由 styleDropVidOfFrames 样式表 / place_v_ 回收 /
//   breakTile 特支承载）｜cond（帧/掷/世界条件,本仓部分建模）。
// - includeLargeObjectDrops 支（:64485-64501 箱 21/467/梳妆台 88/营火 215）只在
//   ReplaceTile 走 true;玩家破坏面掉落=Check* 帧检（样式表已承载）,主 switch 侧
//   这四型均在 no-drop 组——不设独立表。
// - KillTile 本体另有非 GetItemDrops 掉落面（:64073 模特 128/269 服装、:64117 帽架
//   334、:64168+ 物品框/武器架/食物盘/展示罐 TE DropItem）与 KillTile_DropBait
//   （:66784 小动物）——由 breakTile 特支/挂物族承载,不在本表。
// - 本仓 drop 解析链（breakTileBody）：killTileDropItems 条件表 → 特支 →
//   styleDropVidOfFrames 样式表 → def.drop（数字=VI(vid)）→ place_v_ 回收门。
//   本测试冻结【def.drop 数字面】与原版表的一致性,并钉死 null 侧豁免账本。
import { describe, it, expect } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';

/** 1457 权威掉落表（sheet → item id；expr 已按 type 解开,700 含 noPrefix 面同值）。
 *  行号锚：case 0/2/109/199/477/492→2 :64540、6/7/8/9→11/12/13/14 :64548、
 *  427→3622 :64587、435-439→3638-3642 :64590-64604、677/678/679→5417/5419/5421
 *  :64704-64712、650 带 :65868、194→154 :64652、330-333→71-74 :64197、
 *  255-261→1970+s-255 :65433、262-268→1970+s-262 :65442、700→5114 :64964。 */
const VANILLA_KILTILE_DROPS: Record<number, number> = {
  0: 2, 1: 3, 2: 2, 6: 11, 7: 12, 8: 13, 9: 14, 22: 56, 23: 2, 25: 61,
  30: 9, 36: 1869, 37: 116, 38: 129, 39: 131, 40: 133, 41: 134, 43: 137, 44: 139, 45: 141,
  46: 143, 47: 145, 48: 147, 49: 148, 51: 150, 53: 169, 54: 170, 56: 173, 57: 172, 58: 174,
  59: 176, 60: 176, 63: 177, 64: 178, 65: 179, 66: 180, 67: 181, 68: 182, 70: 176, 75: 192,
  76: 214, 78: 222, 80: 276, 81: 275, 107: 364, 108: 365, 109: 2, 111: 366, 112: 370, 116: 408,
  117: 409, 118: 412, 119: 413, 120: 414, 121: 415, 122: 416, 123: 424, 124: 480, 130: 511, 131: 512,
  136: 538, 140: 577, 141: 580, 145: 586, 146: 591, 147: 593, 148: 594, 150: 604, 151: 607, 152: 609,
  153: 611, 154: 612, 155: 613, 156: 614, 157: 619, 158: 620, 159: 621, 160: 662, 161: 664, 163: 833,
  164: 834, 166: 699, 167: 700, 168: 701, 169: 702, 170: 1872, 174: 713, 175: 717, 176: 718, 177: 719,
  179: 3, 180: 3, 181: 3, 182: 3, 183: 3, 188: 276, 189: 751, 190: 183, 191: 9, 193: 762,
  194: 154, 195: 763, 196: 765, 197: 767, 198: 775, 199: 2, 200: 835, 202: 824, 203: 836, 204: 880,
  206: 883, 208: 911, 210: 937, 211: 947, 213: 965, 214: 85, 221: 1104, 222: 1105, 223: 1106, 224: 1103,
  226: 1101, 229: 1125, 230: 1127, 232: 1150, 234: 1246, 248: 1589, 249: 1591, 250: 1593, 251: 1725, 252: 1727,
  253: 1729, 255: 1970, 256: 1971, 257: 1972, 258: 1973, 259: 1974, 260: 1975, 261: 1976, 262: 1970, 263: 1971,
  264: 1972, 265: 1973, 266: 1974, 267: 1975, 268: 1976, 272: 1344, 273: 2119, 274: 2120, 284: 2173, 311: 2260,
  312: 2261, 313: 2262, 315: 2435, 321: 2503, 322: 2504, 325: 2692, 326: 2693, 327: 2694, 328: 2695, 329: 2697,
  330: 71, 331: 72, 332: 73, 333: 74, 336: 2701, 340: 2751, 341: 2752, 342: 2753, 343: 2754, 344: 2755,
  345: 2787, 346: 2792, 347: 2793, 348: 2794, 350: 2860, 351: 2868, 353: 2996, 357: 3066, 365: 3077, 366: 3078,
  367: 3081, 368: 3086, 369: 3087, 370: 3100, 371: 3113, 372: 3117, 379: 3214, 381: 3, 383: 620, 385: 3234,
  396: 3271, 397: 3272, 398: 3274, 399: 3275, 400: 3276, 401: 3277, 402: 3338, 403: 3339, 404: 3347, 407: 3380,
  408: 3460, 409: 3461, 415: 3573, 416: 3574, 417: 3575, 418: 3576, 421: 3609, 422: 3610, 424: 3616, 426: 3621,
  427: 3622, 429: 3629, 430: 3633, 431: 3634, 432: 3635, 433: 3636, 434: 3637, 435: 3638, 436: 3639, 437: 3640,
  438: 3641, 439: 3642, 442: 3707, 445: 3725, 446: 3736, 447: 3737, 448: 3738, 449: 3739, 450: 3740, 451: 3741,
  458: 3754, 459: 3755, 460: 3756, 472: 3951, 473: 3953, 474: 3955, 476: 4040, 477: 2, 478: 4050, 479: 4051,
  492: 2, 494: 4089, 495: 4090, 496: 4091, 498: 4139, 500: 4229, 501: 4230, 502: 4231, 503: 4232, 507: 4277,
  508: 4278, 512: 129, 513: 129, 514: 129, 515: 129, 516: 129, 517: 129, 520: 4326, 534: 3, 535: 129,
  536: 3, 537: 129, 539: 3, 540: 129, 541: 4392, 546: 4422, 557: 4422, 561: 4554, 562: 4564, 563: 4547,
  566: 999, 574: 4717, 575: 4718, 576: 4719, 577: 4720, 578: 4721, 579: 4761, 593: 4868, 618: 4962, 624: 5114,
  625: 3, 626: 129, 627: 3, 628: 129, 630: 5137, 631: 5138, 633: 172, 635: 5215, 641: 5306, 646: 5322,
  656: 5333, 659: 5349, 661: 176, 662: 176, 666: 5395, 667: 5398, 668: 5400, 669: 5401, 670: 5402, 671: 5403,
  672: 5404, 673: 5405, 674: 5406, 675: 5407, 676: 5408, 677: 5417, 678: 5419, 679: 5421, 680: 5423, 681: 5425,
  682: 5427, 683: 5433, 684: 5435, 685: 5429, 686: 5431, 687: 5439, 688: 5440, 689: 5441, 690: 5442, 691: 5443,
  692: 5444, 697: 5471, 700: 5114, 701: 5333, 708: 5493, 717: 5569, 718: 5570, 719: 5571, 722: 5622, 726: 929,
  727: 5674, 728: 5675, 729: 5676, 730: 5677, 731: 5678, 732: 5679, 734: 5710, 735: 5733, 736: 5920, 737: 5922,
  738: 5924, 739: 5926, 740: 5928, 741: 5930, 742: 5953, 743: 5996, 744: 6019, 745: 6042, 746: 6065, 747: 6088,
  748: 6109, 749: 6132, 750: 6134,
};

/** no-drop 组（KillTile 无直掉;掉落面全走 Check* 帧检/TE/特支,或真无掉落）。 */
const VANILLA_NODROP_SHEETS = new Set<number>([
  10, 11, 12, 14, 15, 16, 17, 18, 20, 21, 26, 27, 28, 29, 31, 32, 34, 35, 42, 55,
  69, 77, 79, 82, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100,
  101, 102, 103, 104, 105, 106, 113, 114, 115, 125, 126, 127, 128, 132, 133, 134, 138, 139, 142, 143,
  162, 165, 172, 173, 184, 185, 186, 187, 192, 205, 207, 209, 212, 215, 216, 217, 218, 219, 220, 228,
  231, 233, 235, 236, 237, 238, 240, 241, 242, 243, 244, 245, 246, 247, 254, 269, 270, 271, 275, 276,
  277, 278, 279, 280, 281, 282, 283, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297,
  298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 316, 317, 318, 319, 320, 334, 335,
  337, 338, 339, 349, 352, 354, 355, 356, 358, 359, 360, 361, 362, 363, 364, 373, 374, 375, 376, 377,
  378, 384, 386, 387, 388, 389, 390, 391, 392, 393, 394, 395, 405, 406, 410, 411, 412, 413, 414, 425,
  440, 441, 443, 444, 452, 453, 454, 455, 456, 457, 461, 462, 463, 464, 465, 466, 467, 468, 469, 470,
  471, 475, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 493, 497, 499, 504, 505, 506,
  509, 510, 511, 518, 521, 522, 523, 524, 525, 526, 527, 529, 530, 531, 532, 533, 538, 542, 543, 544,
  545, 547, 548, 549, 550, 551, 552, 553, 554, 555, 556, 558, 559, 560, 564, 565, 567, 568, 569, 570,
  572, 573, 580, 581, 582, 590, 591, 592, 594, 595, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606,
  607, 608, 609, 610, 611, 612, 613, 614, 615, 617, 619, 620, 621, 622, 623, 629, 632, 636, 638, 639,
  640, 642, 643, 644, 645, 647, 648, 649, 651, 652, 653, 654, 655, 657, 658, 660, 663, 664, 665, 694,
  695, 696, 698, 699, 702, 704, 705, 706, 709, 710, 711, 712, 713, 714, 715, 716, 720, 721, 723, 724,
  725, 733,
]);

/** cond 组（帧/掷/世界条件——本仓建模状态各异,数字面只许 = pin 基档）。 */
const VANILLA_COND_SHEETS = new Set<number>([
  3, 4, 5, 13, 19, 24, 33, 50, 52, 61, 62, 71, 72, 73, 74, 83, 84, 110, 129, 135,
  137, 144, 149, 171, 178, 201, 225, 227, 239, 314, 323, 324, 380, 382, 419, 420, 423, 428, 519, 528,
  571, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634, 637, 650, 693, 703, 707,
]);

/** cond 基档 pin 账本（sheet → 本仓 def.drop 允许值=基档/最常见档;逐档建模状态见注）。 */
const COND_PIN_BASE: Record<number, { vid: number; why: string }> = {
  4: { vid: 8, why: ':65106 火把 style 表（styleDropVid 火把 TORCH 全表已备,pin 基档）' },
  19: { vid: 94, why: ':65591 GetItemDrop_Platforms（style 表已入 styleDropVid,pin 基档）' },
  33: { vid: 105, why: ':65595 GetItemDrop_Candles（style 表已入 styleDropVid,pin 基档）' },
  3: { vid: 5, why: ':65506 fx==144 蘑菇档（killTileDropItems sheet-3 全条件已建模,mushroom def 锚）' },
  137: { vid: 539, why: ':65597 fy/18 六档（1146-1149/5135 余档未建模,v_137 先例 pin）' },
  324: { vid: 2625, why: ':65793 fy/22 五档（2626/4072/4073/4071 未建模,本轮 pin）' },
  380: { vid: 3215, why: ':65726 3215+fy/18 八档（未建模,本轮 pin）' },
  650: { vid: 3, why: ':65868 带表 13 带（逐带已入 echoResourceDropVid case 650,2026-09-08 移交批;def.drop=3 系首带 pin）' },
  693: { vid: 664, why: ':65560 GetStalactiteEchoDrop 13 档（693/694 已并表 echoResourceDropVid 共用 case,2026-09-08 移交批;def.drop=664 系 style0 pin）' },
  707: { vid: 149, why: ':66183 fx==90→165 否则 149（双档已入 styleDropVidOfFrames 特例,2026-09-08 移交批;def.drop=149 系基档 pin）' },
  571: { vid: 4564, why: ':64903-64905 4564×Next(1,3)（stack 已入 killTileDropItems 竹支 2026-09-08;def.drop=null 豁免+place_v_ 回收压门,本 pin 留档基值）' },
  5: { vid: 9, why: 'KillTile_GetTreeDrops 基掉 9 木（:66745+;fellTree/dropVanillaTreeLoot 已建模,own tree 锚）' },
};

/** no-drop sheet 上允许的数值锚（Check* 帧检 / GetItemDrop 样式表 style0 的真物品,
 *  对应原版破坏返还;全部带 Check* 行号锚,禁无锚新增）。 */
const ANCHOR_DROPS: Record<number, { vid: number; why: string }> = {
  18: { vid: 36, why: 'Check3x2 case 18 GetItemDrop_Workbenches(0)' },
  17: { vid: 33, why: 'Check3x2 case 17 GetItemDrop_Furnaces(0)' },
  16: { vid: 35, why: 'Check3x2 case 16 GetItemDrop_Anvils(0)' },
  21: { vid: 48, why: 'CheckChest :57938 → GetItemDrop_Chests(0,false)' },
  10: { vid: 25, why: 'CheckDoorClosed :87159 → GetDoorItem(0)' },
  11: { vid: 25, why: 'CheckDoorOpen :87093 → GetDoorItem(0) 开态同掉门件' },
  14: { vid: 32, why: 'Check3x2 case 14 GetItemDrop_Tables(0)' },
  15: { vid: 34, why: 'Check3x2 case 15 GetItemDrop_Chair(0)' },
  79: { vid: 224, why: 'Check4x2 case 79 GetItemDrop_Beds(0)' },
  101: { vid: 354, why: 'Check3x4 case 101 GetItemDrop_Bookcases(0)' },
  104: { vid: 359, why: 'Check3x2 case 104 GetItemDrop_Clocks(0)' },
  87: { vid: 333, why: 'Check3x2 case 87 GetItemDrop_Pianos(0)' },
  88: { vid: 334, why: 'Check3x2 case 88 → GetItemDrop_Dressers(0) :50136' },
  89: { vid: 335, why: 'Check3x2 case 89 GetItemDrop_Benches(0)' },
  90: { vid: 336, why: 'Check4x2 case 90 GetItemDrop_Bathtubs(0)' },
  94: { vid: 352, why: 'Check3x2 case 94 GetItemDrop_Kegs(0)' },
  96: { vid: 345, why: 'Check2x2Style case 96 :52430 → 345(0)' },
  85: { vid: 321, why: 'CheckSign case 85 :43737 → 321(0)' },
  12: { vid: 29, why: 'CheckOrb case 12 :54700 → 29（心水晶破坏返还）' },
  34: { vid: 106, why: 'CheckChand case 34 GetItemDrop_Chandeliers(0)' },
  42: { vid: 136, why: 'Check2xX case 42 GetItemDrop_Lanterns(0)' },
  100: { vid: 349, why: 'Check2x2Style case 100 GetItemDrop_Candelabras(0)' },
  95: { vid: 344, why: 'Check2x2Style case 95 → 344 中式灯笼(0)' },
  98: { vid: 347, why: 'Check2x2Style case 98 → 347 骷髅灯笼(0)' },
  29: { vid: 87, why: 'Check2x1 case 29 → 87 存钱罐（储物族注）' },
  463: { vid: 3813, why: 'Check3x4 case 463 :50591 恒掉 3813' },
  395: { vid: 3270, why: 'CheckSign case 395 :44141 恒掉 3270（TEItemFrame 有物先 DropItem :64168）' },
  642: { vid: 5296, why: 'Check3x3 case 642 :53634 恒掉 5296' },
  97: { vid: 346, why: 'Check2x2 case 97 → 346 保险箱（储物族注）' },
  425: { vid: 3617, why: 'CheckSign case 425 :44145 恒掉 3617' },
  334: { vid: 2699, why: 'CheckWeaponsRack :46796 → 2699（:46855）;TE 有物另算' },
  486: { vid: 4063, why: 'Check3x2 case 486 :49985 恒掉 4063' },
  510: { vid: 4319, why: 'CheckSign case 510 :44154 恒掉 4319' },
  511: { vid: 4320, why: 'CheckSign case 511 :44151 恒掉 4320' },
  573: { vid: 4710, why: 'CheckSign case 573 :44148 恒掉 4710' },
  581: { vid: 4848, why: 'Check1x2Top case 581 :47208 恒掉 4848' },
  660: { vid: 5351, why: 'Check1x2Top case 660 :47211 恒掉 5351' },
  698: { vid: 5472, why: 'Check1x2Top case 698 :47198 恒掉 5472（TE 有物先 DropItem :64177）' },
  99: { vid: 348, why: 'Check2x2 case 99 :49099 恒掉 348 TrashCan（无放置物品,曾真缺）' },
  134: { vid: 525, why: 'Check2x1 case 134 :47667 pin style0 MythrilAnvil（1220 档未建模）' },
  649: { vid: 3, why: 'Check2x1 case 649 :47677 带表（逐带已入 echoResourceDropVid case 649,2026-09-08 移交批;def.drop=3 系首带 pin）' },
  86: { vid: 332, why: 'Check3x2 case 86 :50123 恒掉 332 Loom' },
  106: { vid: 363, why: 'Check3x3 case 106 :53623 恒掉 363 Sawmill' },
  125: { vid: 487, why: 'Check2x2 case 125 :49125 恒掉 487 Crystal Ball' },
  132: { vid: 513, why: 'Check2x2 case 132 :49137 恒掉 513 Lever' },
  77: { vid: 221, why: 'Check3x2 case 77 :50120 恒掉 221 Hellforge' },
  55: { vid: 171, why: 'CheckSign default :44158 恒掉 171' },
  102: { vid: 355, why: 'Check3x4 case 102 :50589 恒掉 355 Throne' },
  639: { vid: 109, why: 'CheckOrb case 639 :54704 恒掉 109 ManaCrystal（放置物 5287≠返还,曾回收错值）' },
  // ── Check2x2 回收身份升级批（2026-09-07，43 def；vanilla 返还==放置物品逐条经
  //  public/sprites/vanilla.json createTile 反查 ==sheet 全绿——原 place_v_ 合成件
  //  value 1 无名牌=登记债清偿。行号=1457 WorldGen.cs num14 赋值行）──
  126: { vid: 488, why: 'Check2x2 case 126 :49133 恒掉 488 DiscoBall（返还=放置物）' },
  142: { vid: 581, why: 'Check2x2 case 142 :49141 恒掉 581 InletPump' },
  143: { vid: 582, why: 'Check2x2 case 143 :49145 恒掉 582 OutletPump' },
  173: { vid: 714, why: 'Check2x2 case 173 :49121 恒掉 714 PlatinumCandelabra' },
  235: { vid: 1263, why: 'Check3x1 case 235 :49594 恒掉 1263 Teleporter（3 宽件,Check2x2 表外）' },
  282: { vid: 250, why: 'Check2x2 case 282 :49149 恒掉 250 FishBowl' },
  287: { vid: 2177, why: 'Check2x2 case 287 :49129 恒掉 2177 AmmoBox' },
  288: { vid: 2178, why: 'Check2x2 :49069 带 288-295→2178+type-288（MonarchButterflyJar）' },
  289: { vid: 2179, why: 'Check2x2 :49069 带 288-295→2178+type-288（PurpleEmperorButterflyJar）' },
  290: { vid: 2180, why: 'Check2x2 :49069 带 288-295→2178+type-288（RedAdmiralButterflyJar）' },
  291: { vid: 2181, why: 'Check2x2 :49069 带 288-295→2178+type-288（UlyssesButterflyJar）' },
  292: { vid: 2182, why: 'Check2x2 :49069 带 288-295→2178+type-288（SulphurButterflyJar）' },
  293: { vid: 2183, why: 'Check2x2 :49069 带 288-295→2178+type-288（TreeNymphButterflyJar）' },
  294: { vid: 2184, why: 'Check2x2 :49069 带 288-295→2178+type-288（ZebraSwallowtailButterflyJar）' },
  295: { vid: 2185, why: 'Check2x2 :49069 带 288-295→2178+type-288（JuliaButterflyJar）' },
  316: { vid: 2439, why: 'Check2x2 :49073 带 316-318→2439+type-316（BlueJellyfishJar）' },
  317: { vid: 2440, why: 'Check2x2 :49073 带 316-318→2439+type-316（GreenJellyfishJar）' },
  318: { vid: 2441, why: 'Check2x2 :49073 带 316-318→2439+type-316（PinkJellyfishJar）' },
  319: { vid: 2490, why: 'Check2x2 case 319 :49153 恒掉 2490 ShipInABottle' },
  335: { vid: 2700, why: 'Check2x2 case 335 :49105 恒掉 2700 FireworksBox' },
  360: { vid: 3072, why: 'Check2x2 case 360 :49037 恒掉 3072 GoldButterflyCage' },
  411: { vid: 3545, why: 'Check2x2 case 411 :49109 恒掉 3545 Detonator' },
  490: { vid: 4075, why: 'Check2x2 case 490 :49157 恒掉 4075 WeatherVane' },
  505: { vid: 4275, why: 'Check2x2 case 505 :49049 恒掉 4275 GoldGoldfishBowl' },
  521: { vid: 4327, why: 'Check2x2 case 521 :48995 恒掉 4327 BlackDragonflyJar' },
  522: { vid: 4328, why: 'Check2x2 case 522 :48998 恒掉 4328 BlueDragonflyJar' },
  523: { vid: 4329, why: 'Check2x2 case 523 :49001 恒掉 4329 GreenDragonflyJar' },
  524: { vid: 4330, why: 'Check2x2 case 524 :49004 恒掉 4330 OrangeDragonflyJar' },
  525: { vid: 4331, why: 'Check2x2 case 525 :49007 恒掉 4331 RedDragonflyJar' },
  526: { vid: 4332, why: 'Check2x2 case 526 :49010 恒掉 4332 YellowDragonflyJar' },
  527: { vid: 4333, why: 'Check2x2 case 527 :49013 恒掉 4333 GoldDragonflyJar' },
  543: { vid: 4398, why: 'Check2x2 case 543 :49053 恒掉 4398 PupfishBowl' },
  564: { vid: 4553, why: 'Check2x2 case 564 :49016 恒掉 4553 PlasmaLamp' },
  565: { vid: 4552, why: 'Check2x2 case 565 :49019 恒掉 4552 FogMachine' },
  568: { vid: 4655, why: 'Check2x2 case 568 :49057 恒掉 4655 PinkFairyJar' },
  569: { vid: 4656, why: 'Check2x2 case 569 :49061 恒掉 4656 GreenFairyJar' },
  570: { vid: 4657, why: 'Check2x2 case 570 :49065 恒掉 4657 BlueFairyJar' },
  580: { vid: 4846, why: 'Check2x2 case 580 :49041 恒掉 4846 HellButterflyJar' },
  594: { vid: 4869, why: 'Check2x2 case 594 :49022 恒掉 4869 VolcanoLarge' },
  598: { vid: 4880, why: 'Check2x2 case 598 :49033 恒掉 4880 LavaFishbowl' },
  620: { vid: 4964, why: 'Check2x2 case 620 :49045 恒掉 4964 EmpressButterflyJar' },
  621: { vid: 3750, why: 'Check2x2 case 621 :49025 恒掉 3750 SliceOfCake' },
  622: { vid: 5008, why: 'Check2x2 case 622 :49028 恒掉 5008 TeaKettle' },
};

/** KillTile 主 switch 无 case（751+）但 Check* 面有恒掉档的 sheet（禁无锚新增）。 */
const EXTRA_CASE_ANCHORS: Record<number, { vid: number; why: string }> = {
  751: { vid: 5667, why: 'Check2x2 case 751 :48988 恒掉 5667 Digtoise' },
  752: { vid: 6142, why: 'Check2x2 case 752 :48991 恒掉 6142 Huge Dragon Egg' },
  753: { vid: 6147, why: 'Check3x3 case 753 :53724 恒掉 6147 Giant Tiki' },
};

/** 掉落值由 styleDropVidOfFrames/killTileDropItems/fellImportedTree/breakTile 特支
 *  承载 → def.drop 留 null 合法的 const-dropped sheet 豁免账本（禁无账新增）。 */
const NULL_JUSTIFIED_CONST_SHEETS = new Set<number>([
  51,   // 蛛网→150（killTileDropItems,墙62 门）
  80,   // 仙人掌→276/格（fellCactus）
  194,  // 骨块→154（styleDropVidOfFrames 特例）
  255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, // 宝石火花→1970+（styleDropVidOfFrames 区段）
  330, 331, 332, 333, // 钱币堆→71-74（styleDropVid CoinPiles）
]);

/** ③回收债账本（2026-09-07 定谳）：vanilla 破坏【零返还】(KillTile no-drop 且 Check*
 *  无 Item.NewItem)但 place_v_ 回收门仍会返还放置物——与滴水装饰家族同病,修在
 *  Game.ts ADRIP_TILE_SHEETS 门（:1536/:20264,本轮文件域外=移交）。
 *  590 宝石树苗（gemcorn 4851-4857 放置,Check1x2 :86818 仅成长检）
 *  595 樱花树苗（4871,同上 :86819）｜615 黄柳树苗（4907,同上 :86820）
 *  484 滚石仙人掌（4390,Check2x2 仅弹 727 :49177-49179 无 Item.NewItem） */
const NO_RETURN_RECYCLE_DEBT: Array<[number, string]> = [
  [590, '宝石树苗（gemcorn 放置;砍苗零返还,回收=gemcorn 白嫖链）'],
  [595, '樱花树苗（VanityTreeSakuraSeed）'],
  [615, '黄柳树苗（VanityTreeYellowWillowSeed）'],
  [484, '滚石仙人掌（RollingCactus;破坏仅滚弹无物品）'],
];

const defsBySheet = (s: number) => TILE_DEFS.filter((d) => d?.vanilla?.sheet === s);
const byKey = (k: string) => TILE_DEFS.find((d) => d.key === k);

describe('tile 掉落全表金标（1457 KillTile_GetItemDrops :64503-66611 对账）', () => {
  it('原版掉落表规模自检（提取器完整性）', () => {
    expect(Object.keys(VANILLA_KILTILE_DROPS).length).toBeGreaterThanOrEqual(330);
    expect(VANILLA_NODROP_SHEETS.size).toBeGreaterThanOrEqual(340);
    expect(VANILLA_COND_SHEETS.size).toBeGreaterThanOrEqual(55);
    // 三集互斥（case 不可重复,分类错=提取器 bug;700 在 drops 表内已含,勿重复计数）
    const all = [...Object.keys(VANILLA_KILTILE_DROPS).map(Number), ...VANILLA_NODROP_SHEETS, ...VANILLA_COND_SHEETS];
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeGreaterThanOrEqual(750);
  });

  it('def.drop 数字面逐 def 对拍（const/expr 必等值;no-drop 只许 ANCHOR;cond 只许 pin 基档）', () => {
    const broken: string[] = [];
    for (const d of TILE_DEFS) {
      const s = d?.vanilla?.sheet;
      if (s === undefined || s === 0) continue;
      if (typeof d.drop !== 'number') continue;
      if (VANILLA_KILTILE_DROPS[s] !== undefined) {
        if (d.drop !== VANILLA_KILTILE_DROPS[s]) {
          broken.push(`${d.key}(sheet ${s}): drop ${d.drop} ≠ 原版 ${VANILLA_KILTILE_DROPS[s]}`);
        }
      } else if (VANILLA_NODROP_SHEETS.has(s)) {
        const a = ANCHOR_DROPS[s];
        if (!a) { broken.push(`${d.key}(sheet ${s}): no-drop 组带数值 ${d.drop} 无 ANCHOR 账`); continue; }
        if (d.drop !== a.vid) broken.push(`${d.key}(sheet ${s}): ${d.drop} ≠ ANCHOR ${a.vid}（${a.why}）`);
      } else if (VANILLA_COND_SHEETS.has(s)) {
        const p = COND_PIN_BASE[s];
        if (!p) { broken.push(`${d.key}(sheet ${s}): cond 组带数值 ${d.drop} 无 pin 账`); continue; }
        if (d.drop !== p.vid) broken.push(`${d.key}(sheet ${s}): ${d.drop} ≠ pin ${p.vid}（${p.why}）`);
      } else if (EXTRA_CASE_ANCHORS[s]) {
        if (d.drop !== EXTRA_CASE_ANCHORS[s].vid) {
          broken.push(`${d.key}(sheet ${s}): ${d.drop} ≠ EXTRA ${EXTRA_CASE_ANCHORS[s].vid}（${EXTRA_CASE_ANCHORS[s].why}）`);
        }
      } else {
        broken.push(`${d.key}(sheet ${s}): 原版 KillTile 无此 case 却带数值 ${d.drop}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('const-dropped sheet 的 null 豁免逐 sheet 对账（表内必数值,表外必豁免）', () => {
    const broken: string[] = [];
    for (const [k, vid] of Object.entries(VANILLA_KILTILE_DROPS)) {
      const s = +k;
      for (const d of defsBySheet(s)) {
        // sheet 0 共享域：dirt=原版 tile 0（必校验）;pixel_block=自研 F11 借 0 号表渲染,
        // 非原版 tile（tiles.ts :449 注）,不入原版对账
        if (s === 0 && d.key !== 'dirt') continue;
        const isNull = d.drop === null || d.drop === undefined;
        if (NULL_JUSTIFIED_CONST_SHEETS.has(s)) {
          if (!isNull) broken.push(`${d.key}: 豁免 sheet ${s} 应保持 null（掉落走样式表/特支）,现 ${JSON.stringify(d.drop)}`);
        } else if (isNull) {
          broken.push(`${d.key}: 原版恒掉 ${vid} 却缺 def.drop（应在位或入 NULL_JUSTIFIED 账本）`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('本轮对账落刀位抽检（改前改后锚）', () => {
    // 队伍平台 427/435-439：曾 null 走 place_v_ 回收,现掉真物品
    expect(byKey('v_427_red_team_platform')?.drop).toBe(3622);
    expect(byKey('v_435_green_team_platform')?.drop).toBe(3638);
    expect(byKey('v_439_white_team_platform')?.drop).toBe(3642);
    // 古砖 677/678/679：曾 null,现 5417/5419/5421
    expect(byKey('v_677_ancient_blue_brick')?.drop).toBe(5417);
    expect(byKey('v_678_ancient_green_brick')?.drop).toBe(5419);
    expect(byKey('v_679_ancient_pink_brick')?.drop).toBe(5421);
    // 魔法水晶 639：CheckOrb 还 109（非放置物 5287 RepairedManaCrystal）
    expect(byKey('v_639_mana_crystal')?.drop).toBe(109);
    // 树苗/草丛：no-drop 组曾掉 27 橡果
    expect(byKey('acorn_sapling')?.drop).toBeNull();
    expect(byKey('tallgrass')?.drop).toBeNull();
    // cond pin 基档
    expect(byKey('v_324_seashells')?.drop).toBe(2625);
    expect(byKey('v_380_planter_boxes')?.drop).toBe(3215);
    expect(byKey('v_693_mitey_titey')?.drop).toBe(664);
    expect(byKey('v_650_small_rubble_1x1')?.drop).toBe(3);
    expect(byKey('v_707_books_echo')?.drop).toBe(149);
    // 二批（Check* 面扫出）：垃圾桶/古兽蛋系真缺补掉,瑟银砧 pin style0
    expect(byKey('v_99_trash_can')?.drop).toBe(348);
    expect(byKey('v_751_sleeping_digtoise')?.drop).toBe(5667);
    expect(byKey('v_752_chillet_egg')?.drop).toBe(6142);
    expect(byKey('v_649_medium_rubble_2x1')?.drop).toBe(3);
    expect(byKey('v_134_anvils_hardmode')?.drop).toBe(525);
    // 三批（2026-09-07 Check2x2 回收身份升级,43 def 全账见 ANCHOR_DROPS 尾段）：
    // 抽检 8 位——龙蝇罐 521 / 萤火虫罐 568 / 鱼缸 282 / 瓶中船 319 / 引爆器 411 /
    // 白金烛台 173 / 传送器 235（Check3x1 :49594 表外支）/ 茶壶 622
    expect(byKey('v_521_black_dragonfly_jar')?.drop).toBe(4327);
    expect(byKey('v_568_pink_fairy_jar')?.drop).toBe(4655);
    expect(byKey('v_282_fish_bowl')?.drop).toBe(250);
    expect(byKey('v_319_ship_in_a_bottle')?.drop).toBe(2490);
    expect(byKey('v_411_detonator')?.drop).toBe(3545);
    expect(byKey('v_173_platinumcandelabra')?.drop).toBe(714);
    expect(byKey('v_235_teleporter')?.drop).toBe(1263);
    expect(byKey('v_622_teapot')?.drop).toBe(5008);
  });

  it('③回收债账本钉死（零返还族不许数值化,待 Game.ts ADRIP 门扩展）', () => {
    for (const [s, label] of NO_RETURN_RECYCLE_DEBT) {
      for (const d of defsBySheet(s)) {
        expect(d.drop ?? null, `${d.key}（${label}）`).toBeNull();
      }
      expect(label.length).toBeGreaterThan(0);
    }
    // 滴水五型在位（Game.ts ADRIP_TILE_SHEETS 消费面,本表侧仅验 def 存在）
    for (const s of [373, 374, 375, 461, 709]) {
      expect(defsBySheet(s).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('ANCHOR/COND_PIN 账本自洁（锚值必须仍是 no-drop/cond 组成员,防表漂移）', () => {
    for (const s of Object.keys(ANCHOR_DROPS).map(Number)) {
      expect(VANILLA_NODROP_SHEETS.has(s), `ANCHOR sheet ${s} 应在 no-drop 组`).toBe(true);
    }
    for (const s of Object.keys(COND_PIN_BASE).map(Number)) {
      expect(VANILLA_COND_SHEETS.has(s), `pin sheet ${s} 应在 cond 组`).toBe(true);
    }
    for (const s of NULL_JUSTIFIED_CONST_SHEETS) {
      expect(VANILLA_KILTILE_DROPS[s], `豁免 sheet ${s} 应在掉落表`).toBeDefined();
    }
  });
});
