// Caves-chain oracle：独立复刻原版 1456「Reset + Terrain + Dunes→…→SurfaceCaves」
// 普通世界全链（4200×1200），UnifiedRandom 反射真·Terraria.exe（零转写风险）。
// 每 pass 后输出 type/active/wall/liquid 的 FNV-1a 哈希 → JSON，
// 与 JS 侧 tests/pass-hash.test.ts 的洞穴链检查点对账。
// 用法：dotnet run tools/golden/caves-oracle.cs <seedInt> <evil:0|1> <out.json>
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text;

int seed = int.Parse(args[0]);
int evil = int.Parse(args[1]);
string outPath = args[2];
// 多尺寸支持（2026-08-16）：第 4 参 size ∈ {0小,1中,2大}（默认 0）——GetWorldSize() 语义
int worldSize = args.Length > 3 ? int.Parse(args[3]) : 0;
int W = worldSize == 1 ? 6400 : worldSize == 2 ? 8400 : 4200;
int H = worldSize == 1 ? 1800 : worldSize == 2 ? 2400 : 1200;
const int BEACH_DISTANCE = 380; // WorldGen.beachDistance（cs:4102）

var asm = Assembly.LoadFrom("/Users/vinlic/Library/Application Support/Steam/steamapps/common/Terraria/Terraria.app/Contents/Resources/Terraria.exe");
dynamic r = Activator.CreateInstance(asm.GetType("Terraria.Utilities.UnifiedRandom")!, seed)!;

// ★每 pass 种子重播（2026-08-16 num4 破解收尾：RunPass 语义推广全链）——
// 原版每个 GenPass 执行前 Main.rand = new UnifiedRandom(_seed)
// （1456 WorldGenerator.cs:497；服务器 exe IL RunPass：newobj UnifiedRandom::
// ctor(Int32) + stsfld Main::rand），GenBase._random => genRand => Main.rand
// ⇒ 每个 pass 的掷骰流各自从 stream(seed) 第 0 掷开始，pass 间【不续流】。
// terrain 段下方 :199 的重绑即此语义；本改造把它推广到链内全部 44 个 pass 边界
// （对照 AddGenerationPass 注册序 WorldGen.cs:11540-15887）。pass 内多检查点段
// （Desert 的 mound/entrance/hive、Dungeon 的 17 段、Shimmer 的 shell/pillars/
// open）是【一个 pass 的内部段】，只在 pass 头重播一次。
Type URType = asm.GetType("Terraria.Utilities.UnifiedRandom")!;
void Replay() => r = (dynamic)Activator.CreateInstance(URType, seed)!;


// ---- 网格（vanilla tile id；行主序 y*W+x，同 JS TileStore）----
var act = new byte[W * H];
var typ = new ushort[W * H];
var wal = new ushort[W * H];
var liq = new byte[W * H];
var liqT = new byte[W * H];
// ★oracle 同步批（2026-08-17）：half/slope/frX/frY 四内部通道——desert F/G 批
//（SmoothSlope postEffectMap/入口 Actions.Smooth/坡位感知 SolidTile 族门）、
// marble/granite I/J 批（PlaceSlab smoothSlope+165 重查）、TileRunner X 批
//（SAVE_SLOPES 清坡）、livingtree D 批（Check3x2 帧重建）的必要状态。检查点
// 哈希仍四通道（typ/act/wal/liq）不变——这些通道只参与门判定与写入语义。
// frX/frY=65535 表 -1（KillTile 帧清位）；默认 0 同 TileStore。
var half = new byte[W * H];
var slope = new byte[W * H];
var frX = new ushort[W * H];
var frY = new ushort[W * H];
var checkpoints = new List<string>();
var jsegPts = new List<string>();   // jungle 段级流指纹（对拍原版 JungleProbe）

static byte[] ToBytes(ushort[] a) { var b = new byte[a.Length * 2]; Buffer.BlockCopy(a, 0, b, 0, b.Length); return b; }
uint Fnv16(ushort[] a) { uint h = 0x811c9dc5; foreach (var v in a) { h = (h ^ (uint)(v & 0xff)) * 16777619u; h = (h ^ (uint)((v >> 8) & 0xff)) * 16777619u; } return h; }
static uint Fnv8(byte[] a) { uint h = 0x811c9dc5; foreach (var v in a) { h = (h ^ v) * 16777619u; h = h * 16777619u; } return h; }
// 只比活性 type（非活性格的幽灵 type 归零——与 JS 侧 hashGrids 口径一致；
// 幽灵 parity 是独立对账项：原版幽灵会存盘、我们 finalize 清除，玩法无差）
var hashTyp = new ushort[W * H];
var hashGho = new ushort[W * H];
var ghostPts = new List<string>();
void Checkpoint(string name)
{
    for (int i = 0; i < typ.Length; i++) {
        hashTyp[i] = (ushort)(act[i] != 0 ? typ[i] : 0);
        hashGho[i] = (ushort)(act[i] == 0 ? typ[i] : 0); // inactive 格残留 type（幽灵 parity）
    }
    checkpoints.Add($"{name}|{Fnv16(hashTyp):x8} {Fnv8(act):x8} {Fnv16(wal):x8} {Fnv8(liq):x8}");
    ghostPts.Add($"{name}|{Fnv16(hashGho):x8}");
    if (Environment.GetEnvironmentVariable("STREAM_PRINT") != null)
        Console.WriteLine($"STREAM {name}|{StreamHash():x8}");
    // GRID_DUMP=pyramids:/tmp/cs-pyr → 命中检查点时落 typ(LE16)/act/wal(LE16)/liq 裸数组（对拍用）
    var gd = Environment.GetEnvironmentVariable("GRID_DUMP");
    if (gd != null && gd.Split(':')[0] == name)
    {
        string p = gd.Split(':')[1];
        File.WriteAllBytes(p + ".typ", ToBytes(typ));
        File.WriteAllBytes(p + ".act", act);
        File.WriteAllBytes(p + ".wal", ToBytes(wal));
        File.WriteAllBytes(p + ".liq", liq);
        File.WriteAllBytes(p + ".half", half); File.WriteAllBytes(p + ".slope", slope);   // A/B 诊断通道
        Console.WriteLine($"griddump {name} -> {p}");
    }
    // STATE_DUMP=dirtwallcleanup:/tmp/cs-st39 → 同上 + UnifiedRandom 内部态（结构段状态恢复对拍：
    // 上游 pass 多代理并发修改期，从该态直跑 #40-44 裁决，等价全链且不受上游 WIP 影响）
    var sd = Environment.GetEnvironmentVariable("STATE_DUMP");
    if (sd != null && sd.Split(':')[0] == name)
    {
        string p2 = sd.Split(':')[1];
        using var fs = File.Create(p2);
        using var bw = new BinaryWriter(fs);
        var urt = asm.GetType("Terraria.Utilities.UnifiedRandom")!;
        var usa = (int[])urt.GetField("SeedArray", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(r)!;
        var uix = (uint)urt.GetField("inext", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(r)!;
        bw.Write(W); bw.Write(H); bw.Write(uix);
        for (int q = 0; q < 56; q++) bw.Write(usa[q]);
        bw.Write(act, 0, act.Length);
        bw.Write(ToBytes(typ), 0, W * H * 2);
        bw.Write(ToBytes(wal), 0, W * H * 2);
        bw.Write(liq, 0, liq.Length);
        bw.Write(liqT, 0, liqT.Length);
        Console.WriteLine($"statedump {name} -> {p2}");
    }
}

// solid 表：源自仓库 TILE_DEFS（已对原版全表审计，见 vanilla-solid-audit 记忆）。
// 反射 Main.tileSolid 会触发 FNA 静态构造，不可行。
// 兼容旧引用（NOT_CLEAR 仍用于 TileRunner flag4/Cavinator）
var SOLID = new HashSet<ushort> { 0,1,2,7,6,9,8,30,10,53,147,57,166,167,168,169,22,37,58,204,
   107,108,111,221,222,223,211,63,64,65,66,67,68,161,162,206,148,396,397,404,
   40,54,56,38,39,59,123,368,226,367,633,181,189,183,536,225,483,224,383,179,
   384,273,381,48,192,191,196,118,321,152,158,357,272,229,311,130,193,190,350,369,
   137,117,112,232,274,322,109,312,422,495,479,477,380,230,562,371,668,398,379,618,
   484,138,388,387,235,625,151,234,182,45,399,248,175,539,481,119,120,714,664,711,
   715,716,713,23,41,75,199,60,70,25,202,43,44,203,255,256,257,258,259,260,
   261,262,263,264,265,266,267,268,421,476,546,557,482,163,200,116,76,46,47,115,
   121,122,127,140,145,146,150,153,154,155,156,157,159,160,164,170,176,177,180,188,
   194,195,197,198,208,239,249,250,251,252,253,284,313,315,325,326,327,328,329,336,
   341,342,343,344,345,346,347,348,351,365,366,370,385,400,401,402,403,407,408,409,
   415,416,417,418,426,427,430,431,432,433,434,435,436,437,438,439,446,447,448,449,
   450,451,458,459,460,472,473,474,478,492,496,498,500,501,502,503,507,508,512,513,
   514,515,516,517,534,535,537,540,541,563,566,626,627,628,635,641,659,661,662,666,
   667,669,670,671,672,673,674,675,676,677,678,679,680,681,682,683,684,685,686,687,
   688,689,690,691,692,708,712,717,718,719,722,726,727,728,729,730,731,732,734,735,
   736,737,738,739,740,741,742,743,744,745,746,747,748,749,750, };

// ★TileRunner framed 跳过精确集（I 批 DirtToMud 同步，cs:77217 首门禁）：
// Main.cs 全量 frameImportant(411) 扣 tileCut(41)——484(滚动仙人掌)/485(蚁狮幼虫)
// frameImportant=true 但 tileCut=true → **不跳**（耗 dist 掷+可被泥覆写）。旧近似集
// 含 484/485 → DirtToMud 起 dist 流偏 ~4.7k 掷。与 JS TileRunner
// FRAME_IMPORTANT_SKIP_SHEETS 逐元素同源（383 sheet）。
// GrowTree 墙白名单（JS TreePass.DEFAULT_TREE_WALLS）与 EmptyTileCheck 空格白名单
// （JS GEM_EMPTY_ALLOW = sheet 3,24,32,61,62,69,71,73,74,82,83,84,110,113,184,201,233,352,485,529,530,637,655）
var TREE_WALLS = new HashSet<ushort> { 0, 150, 138, 145, 107, 152, 140, 139, 141, 106, 245, 315, 317, 63, 64, 65, 66, 67, 68, 69, 81, 70, 264, 268, 265, 74, 80 };
var EMPTY_ALLOW = new HashSet<ushort> { 3, 24, 32, 61, 62, 69, 71, 73, 74, 82, 83, 84, 110, 113, 184, 201, 233, 352, 485, 529, 530, 637, 655 };
var FRAMED_NOT_CUT = new HashSet<ushort> { 4,5,10,11,12,13,14,15,16,17,18,19,20,21,26,27,29,31,33,34,35,36,42,49,50,55,72,77,78,79,81,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,114,125,126,128,129,132,133,134,135,136,137,138,139,141,142,143,144,149,165,171,172,173,174,178,185,186,187,207,209,210,212,215,216,217,218,219,220,227,228,233,235,237,238,239,240,241,242,243,244,245,246,247,269,270,271,275,276,277,278,279,280,281,282,283,285,286,287,288,289,290,291,292,293,294,295,296,297,298,299,300,301,302,303,304,305,306,307,308,309,310,314,316,317,318,319,320,323,324,334,335,337,338,339,349,354,355,356,358,359,360,361,362,363,364,372,373,374,375,376,377,378,380,386,387,388,389,390,391,392,393,394,395,405,406,410,411,412,413,414,419,420,423,424,425,427,428,429,435,436,437,438,439,440,441,442,443,445,452,453,455,456,457,461,462,463,464,465,466,467,468,469,470,471,475,476,480,486,487,488,489,490,491,493,494,497,499,505,506,509,510,511,520,521,522,523,524,525,526,527,530,531,532,533,538,542,543,544,545,547,548,550,551,552,553,554,555,556,558,559,560,564,565,567,568,569,570,571,572,573,579,580,581,582,583,584,585,586,587,588,589,590,591,592,593,594,595,596,597,598,599,600,601,602,603,604,605,606,607,608,609,610,611,612,613,614,615,616,617,619,620,621,622,623,624,629,630,631,632,634,639,640,642,643,644,645,646,647,648,649,650,651,652,653,656,657,658,660,663,664,665,693,694,695,696,698,699,700,701,702,703,704,705,706,707,709,710,712,713,714,715,716,720,721,723,724,725,726,733,751,752 };
var NOT_CLEAR = new HashSet<ushort> { 396, 400, 401, 397, 398, 399, 404, 368, 367, 41, 43, 44, 481, 482, 483, 226, 237 };
bool CanBeCleared(ushort t) => !NOT_CLEAR.Contains(t);
bool IsSolidT(ushort t) => SOLID.Contains(t);
// ---- oracle 同步批（2026-08-17）新表 ----
// Main.wallLargeFrames 全 22 项（1=phlebas 2=lazure，Main.cs:9652-9820）——这些墙的
// Framing.WallFrame(resetFrame) 走查表分支不耗掷（F/G 批 SquareWallFrame 掷骰还原）。
var WALL_LARGE_FRAMES = new HashSet<ushort> { 146, 147, 167, 179, 185, 224, 274, 323, 324, 325, 326, 327, 328, 329, 330, 354, 355, 358, 359, 362, 363, 366 };
// CanPoundTile 排除表（HalfBrickPass：黑名单+Boulders+生成期追加+ForbidsSloping 上格）
// NO_POUND_SHEETS=黑名单 9 项（MarbleGranite tileSmoothSlope 的轻门只用这 9 项）
var NO_POUND_SHEETS = new HashSet<ushort> { 10, 48, 137, 232, 380, 387, 388, 476, 484 };
var BOULDERS_G = new HashSet<ushort> { 138, 484, 664, 665, 711, 712, 713, 714, 715, 716 };
var POUND_GEN_SKIP = new HashSet<ushort> { 190, 30 };
var FORBIDS_SLOPING = new HashSet<ushort> { 21, 26, 77, 88, 235, 237, 441, 467, 468, 470, 475, 488, 597 };
// 液体交互表（LiquidSim 提取，H/L 批 QuickWater 用）：tileObsidianKill =
// tileLavaDeath ∪ tileWaterDeath ∪ 附加 − {88}；容器 {21,467,88}；裁切植物 CUT。
var OBSIDIAN_KILL = new HashSet<ushort> {
    630,631,571,579,591,538,544,629,550,551,533,553,554,555,556,558,559,599,600,601,602,603,604,605,606,607,608,609,610,611,612,632,640,643,644,645,710,568,569,570,580,582,619,620,572,560,564,567,565,654,529,530,705,484,3,5,10,11,12,13,14,469,486,488,704,487,489,490,15,497,16,17,18,19,24,27,28,29,32,33,34,35,36,42,49,50,707,51,697,52,55,61,703,62,69,655,71,72,73,74,79,80,81,86,87,88,89,90,91,92,93,94,95,96,97,98,100,101,102,103,104,106,110,113,115,125,126,128,149,172,173,174,184,201,205,209,210,212,213,353,215,216,217,218,219,642,220,227,228,233,236,702,238,240,241,242,243,244,245,246,247,254,269,270,271,581,698,660,275,413,276,277,278,279,280,281,282,283,285,286,287,288,289,290,291,292,293,294,295,296,297,298,299,300,301,302,303,304,305,306,307,308,309,310,532,316,317,318,319,354,355,699,499,323,335,338,339,528,636,352,382,425,453,456,463,464,465,485,511,510,547,548,552,573,621,622,623,624,700,656,701,493,395,520,471,405,406,452,457,454,494,387,386,388,389,646,372,639,668,324,427,390,
    4,98,546,77,78,82,83,84,85,105,129,132,133,134,135,136,139,165,178,185,186,187,231,337,349,506,314
};
OBSIDIAN_KILL.Remove((ushort)88);
var CONTAINER_S = new HashSet<ushort> { 21, 467, 88 };
var CUT_S = new HashSet<ushort> { 654, 518, 519, 549, 529, 637, 231, 484, 711, 201, 3, 24, 28, 32, 51, 52, 61, 62, 69, 655, 71, 73, 74, 82, 83, 84, 110, 113, 115, 184, 205, 352, 382, 528, 636, 638, 444, 485, 454, 254, 236 };
// TileID.Sets.SaveSlopes（X 批 TileRunner 清坡）：启动期默认 tileSolid 快照 ∪
// NonSolidSaveSlopes{131,351,336,340-344}——生成期 tileSolid 翻转不回写（快照于
// SOLID.Remove(484) 之前冻结，484 在默认表内）。写 type 时 !SaveSlopes → ClearSlope。
var SAVE_SLOPES = new HashSet<ushort>(SOLID);
SAVE_SLOPES.UnionWith(new HashSet<ushort> { 131, 351, 336, 340, 341, 342, 343, 344 });
// 全量 tileFrameImportant（Main.cs 404 赋值 + AddEchoFurnitureTile 家族 + 循环 435-439 = 411；
// 与 FRAMED_NOT_CUT 不同：不扣 tileCut——DgStairsCanPlace 与 CanPoundTile(!framed) 用全表。
// ★2026-08-17 上移至头部（原在 dungeon 段 4395）：desert 段 CanPoundGen 先于其执行）
var FRAMED_ALL = new HashSet<ushort> {
    3,4,5,10,11,12,13,14,15,16,17,18,19,20,21,24,26,27,28,29,31,33,34,35,
    36,42,49,50,55,61,71,72,73,74,77,78,79,81,82,83,84,85,86,87,88,89,90,91,
    92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,110,113,114,125,126,128,129,132,133,
    134,135,136,137,138,139,141,142,143,144,149,165,171,172,173,174,178,184,185,186,187,201,207,209,
    210,212,215,216,217,218,219,220,227,228,231,233,235,236,237,238,239,240,241,242,243,244,245,246,
    247,254,269,270,271,275,276,277,278,279,280,281,282,283,285,286,287,288,289,290,291,292,293,294,
    295,296,297,298,299,300,301,302,303,304,305,306,307,308,309,310,314,316,317,318,319,320,323,324,
    334,335,337,338,339,349,354,355,356,358,359,360,361,362,363,364,372,373,374,375,376,377,378,380,
    386,387,388,389,390,391,392,393,394,395,405,406,410,411,412,413,414,419,420,423,424,425,427,428,
    429,435,436,437,438,439,440,441,442,443,444,445,452,453,454,455,456,457,461,462,463,464,465,466,
    467,468,469,470,471,475,476,480,484,485,486,487,488,489,490,491,493,494,497,499,505,506,509,510,
    511,518,519,520,521,522,523,524,525,526,527,529,530,531,532,533,538,542,543,544,545,547,548,549,
    550,551,552,553,554,555,556,558,559,560,564,565,567,568,569,570,571,572,573,579,580,581,582,583,
    584,585,586,587,588,589,590,591,592,593,594,595,596,597,598,599,600,601,602,603,604,605,606,607,
    608,609,610,611,612,613,614,615,616,617,619,620,621,622,623,624,629,630,631,632,634,637,639,640,
    642,643,644,645,646,647,648,649,650,651,652,653,654,656,657,658,660,663,664,665,693,694,695,696,
    698,699,700,701,702,703,704,705,706,707,709,710,711,712,713,714,715,716,720,721,723,724,725,726,
    733,751,752
};
var TILE_DUNGEON = new HashSet<ushort> { 41, 43, 44, 677, 678, 679 };
var WALL_DUNGEON = new HashSet<ushort> { 7, 8, 9, 94, 95, 96, 97, 98, 99 };
var FLAG3_ALWAYS = new HashSet<ushort> { 45, 147, 189, 190, 196, 460, 717, 718, 719 };
var CLOUDS = new HashSet<ushort> { 189, 196, 460, 717, 718, 719 };

// ================= Reset 掷骰（cs:11159-11472，与 terrain-oracle.cs 相同的已验证序列）=================
r.Next(5);                                                    // jungleHut
r.Next(2);                                                    // crimsonLeft
r.Next(10, 200);                                              // numClouds
while (true) { double wf = (double)r.NextDouble(); r.Next(2); if (wf != 0) break; }
{ var p = new List<int> { 274, 220, 112, 218, 3019 }; while (p.Count > 0) p.RemoveAt((int)r.Next(p.Count)); }
r.Next(86400 * 2, 86400 * 3); r.Next(8640, 86400);
bool oreCu166 = (int)r.Next(2) == 0;                            // 矿石替代对（cs:11292-11311）
bool oreFe167 = (int)r.Next(2) == 0;                            // Next(2)==0 → 166/167/168/169
bool oreAg168 = (int)r.Next(2) == 0;
bool oreAu169 = (int)r.Next(2) == 0;
int oreCu = oreCu166 ? 166 : 7, oreFe = oreFe167 ? 167 : 6, oreAg = oreAg168 ? 168 : 9, oreAu = oreAu169 ? 169 : 8;
bool crimson = (int)r.Next(2) == 0;
if (evil == 0) crimson = false; if (evil == 1) crimson = true;
r.Next(int.MaxValue);                                         // WorldId
// RandomizeTreeStyle/RandomizeCaveBackgrounds 尺寸分支（真 exe :8082/:8157，2026-08-16 多尺寸化）
if (W == 4200)
{
    r.Next(1050, 3150);                                       // treeX[0]（W/2±W/4 取整=1050/3150）
    int ts0 = (int)r.Next(6); int ts1 = (int)r.Next(6);
    while (ts1 == ts0) ts1 = (int)r.Next(6);
    for (int i = 0; i < 2; i++) { int s = i == 0 ? ts0 : ts1; if (s == 0) r.Next(3); }
    r.Next(1050, 3150);                                       // caveBackX[0]
    int cb0 = (int)r.Next(8); int cb1 = (int)r.Next(8);
    while (cb1 == cb0) cb1 = (int)r.Next(8);
}
else if (W == 6400)
{
    r.Next(857, 3417); r.Next(2988, 5548);                   // treeX[0/1]（0.334±0.2/0.667±0.2 取整=857/3417/2988/5548，7 个真实 .wld 落值佐证）
    int ts0 = (int)r.Next(6); int ts1 = (int)r.Next(6); int ts2 = (int)r.Next(6);
    while (ts1 == ts0) ts1 = (int)r.Next(6);
    while (ts2 == ts0 || ts2 == ts1) ts2 = (int)r.Next(6);
    for (int i = 0; i < 3; i++) { int s = i == 0 ? ts0 : i == 1 ? ts1 : ts2; if (s == 0) r.Next(3); }
    r.Next(857, 3417); r.Next(2988, 5548);                   // caveBackX[0/1]（同取整）
    int cb0 = (int)r.Next(8); int cb1 = (int)r.Next(8); int cb2 = (int)r.Next(8);
    while (cb1 == cb0) cb1 = (int)r.Next(8);
    while (cb2 == cb0 || cb2 == cb1) cb2 = (int)r.Next(8);
}
else
{
    r.Next(840, 3360); r.Next(2940, 5460); r.Next(5040, 7560); // treeX[0/1/2]（0.25/0.5/0.75±0.15 取整，真实 .wld 佐证）
    int ts0 = (int)r.Next(6); int ts1 = (int)r.Next(6); int ts2 = (int)r.Next(6); int ts3 = (int)r.Next(6);
    while (ts1 == ts0) ts1 = (int)r.Next(6);
    while (ts2 == ts0 || ts2 == ts1) ts2 = (int)r.Next(6);
    while (ts3 == ts0 || ts3 == ts1 || ts3 == ts2) ts3 = (int)r.Next(6);
    for (int i = 0; i < 4; i++) { int s = i switch { 0 => ts0, 1 => ts1, 2 => ts2, _ => ts3 }; if (s == 0) r.Next(3); }
    r.Next(840, 3360); r.Next(2940, 5460); r.Next(5040, 7560); // caveBackX[0/1/2]（同取整）
    int cb0 = (int)r.Next(8); int cb1 = (int)r.Next(8); int cb2 = (int)r.Next(8); int cb3 = (int)r.Next(8);
    while (cb1 == cb0) cb1 = (int)r.Next(8);
    while (cb2 == cb0 || cb2 == cb1) cb2 = (int)r.Next(8);
    while (cb3 == cb0 || cb3 == cb1 || cb3 == cb2) cb3 = (int)r.Next(8);
}
// RandomizeCaveBackgrounds 尾部无条件 3 掷(cs:8211-8213;2026-08-12 审计补,ilspycmd 对真 exe 已复核)
r.Next(4); r.Next(3); r.Next(2);
Func<int> RollForest = () => {
    int n = (int)r.Next(14);
    if ((n == 1 || n == 2) && (int)r.Next(2) == 0) n = (int)r.Next(14);
    if (n == 0) n = (int)r.Next(14);
    if (n == 3 && (int)r.Next(3) == 0) n = 31;
    if (n == 5 && (int)r.Next(2) == 0) n = 51;
    if (n == 7 && (int)r.Next(4) == 0) n = (int)r.Next(71, 74);
    return n;
};
int fb1 = RollForest(); int fb2 = RollForest(); while (fb2 == fb1) fb2 = RollForest();
int fb3 = RollForest(); while (fb3 == fb1 || fb3 == fb2) fb3 = RollForest();
int fb4 = RollForest(); while (fb4 == fb1 || fb4 == fb2 || fb4 == fb3) fb4 = RollForest();
{ int n = (int)r.Next(6); if (n == 5) r.Next(2); }            // Corruption 背景
r.Next(7);                                                    // jungle 背景
int snowBG = (int)r.Next(9);
if (snowBG == 2 && (int)r.Next(2) == 0) r.Next(2);
if (snowBG == 3 && (int)r.Next(2) == 0) r.Next(2);
if (snowBG == 4 && (int)r.Next(2) == 0) r.Next(2);
r.Next(6); r.Next(7);
{ int n = (int)r.Next(6); if (n == 5) r.Next(5); }            // Desert 背景
r.Next(8); r.Next(5); r.Next(3);
r.Next(9);                                                    // moonType
bool dungeonRight = !((int)r.Next(2) == 0);
int jungleX = dungeonRight
    ? (int)(W * ((int)r.Next(15, 30) * 0.01))
    : (int)(W * (1.0 - (int)r.Next(15, 30) * 0.01));
int num7 = (int)r.Next(W);
if (dungeonRight) { while (num7 < W * 0.6 || num7 > W * 0.75) num7 = (int)r.Next(W); }
else { while (num7 < W * 0.25 || num7 > W * 0.4) num7 = (int)r.Next(W); }
double num9s = W / 4200.0;
Func<int> SnowHalf = () => (int)r.Next(50, 90) + (int)((int)r.Next(20, 40) * num9s) + (int)((int)r.Next(20, 40) * num9s);
int snowL = Math.Max(0, num7 - SnowHalf());
int snowR = Math.Min(W, num7 + SnowHalf());
int leftBeachEnd = (int)r.Next(300, 340) + (dungeonRight ? 40 : 20);
int rightBeachStart = W - (int)r.Next(300, 340) - (dungeonRight ? 20 : 40);
int dungeonLocation = !dungeonRight
    ? (int)r.Next(leftBeachEnd + 50, (int)(W * 0.2))
    : (int)r.Next((int)(W * 0.8), rightBeachStart - 50);

// ★cs:11500 generateWorld 尾 `Main.tileSolid[659] = false`（Reset 期唯一翻转；659 以太石
//   Main.cs:9538 初值 true，生成全程无还原点）——JS GenSolid.resetGenSolid+flipGenSolid
//   ([659],false) 在 runResetAndTerrain 尾接线，生成期一切实心查询恒非实心
SOLID.Remove((ushort)659);
// ★★★ num4 悬案根因修复（2026-08-16 Tier B IL 探针裁决）★★★
// 原版每个 GenPass 执行前都重播种子：WorldGenerator.RunPass 开头
// `Main.rand = new UnifiedRandom(_seed)`（1456 WorldGenerator.cs:497；服务器 exe IL
// RunPass: newobj UnifiedRandom::.ctor(Int32) + stsfld Main::rand），而
// GenBase._random => WorldGen.genRand => Main.rand（GenBase.cs:9 / WorldGen.cs:4391）。
// 故 TerrainPass（所有 GenPass）从 stream(seed) 第 0 掷开始——与 Reset 期消费无关。
// 此前把 Reset 流续进 terrain 是 rockLayer Δrl≠0 的根因（探针实测 9293480：
// 原版 num4init=464.808=(434.4)*1.07 即 N1=108/N2=107=第 0/1 掷；续流则 385.648）。
r = (dynamic)Activator.CreateInstance(asm.GetType("Terraria.Utilities.UnifiedRandom")!, seed)!;
var TraceCols = new List<string>();   // （Tier B 对拍工具，2026-08-16 保留）
// ================= TerrainPass（cs:56-244）=================
int feature = 0, counter = leftBeachEnd + flatBeachPadding();
static int flatBeachPadding() => 5;
double num3w = (double)H * 0.3;
num3w *= (double)(int)r.Next(90, 110) * 0.005;
double num4w = num3w + (double)H * 0.2;
num4w *= (double)(int)r.Next(90, 110) * 0.01;
double num5w = num3w, num6w = num3w, num7w = num4w, num8w = num4w;
double num9t = (double)H * 0.23;
double num10 = 0.17 + (worldSize == 0 ? 0.02 : 0.0), num11 = 0.26; // cs:129-131：仅小世界 +0.02
var history = new List<double>();
var surf = new int[W];
Action<int, double> Retarget = null!;
Retarget = (targetX, targetHeight) => {
    int len = history.Count;
    for (int i1 = 0; i1 < len / 2; i1++)
    {
        if (history[len - 1] <= targetHeight) break;
        for (int j = 0; j < len - i1 * 2; j++)
        {
            double v = history[len - j - 1] - 1.0;
            history[len - j - 1] = v;
            if (v <= targetHeight) break;
        }
    }
    for (int k = 0; k < len; k++)
    {
        int x = targetX - k;
        if (x >= 0 && x < W)
        {
            int ws = (int)history[len - k - 1];
            for (int y = 0; y < ws; y++) act[y * W + x] = 0;
            for (int y = ws; y < H; y++) { act[y * W + x] = 1; if (typ[y * W + x] != 1) typ[y * W + x] = 0; }
        }
    }
};
Func<int, double> GenOffset = f => {
    // ★真 exe ilspycmd 权威反汇编（2026-08-13）：普通世界=else 分支——
    // Plateau Next(0,7)、Hill/Dale Next(0,4)、Mountain/Valley Next(0,2)==0。
    // 6/3/!=0 长爬升表是 drunk/getGood/remix 专用，勿混。
    double n = 0.0;
    switch (f)
    {
        case 0: while ((int)r.Next(0, 7) == 0) n += (int)r.Next(-1, 2); break;
        case 1: while ((int)r.Next(0, 4) == 0) n -= 1.0; while ((int)r.Next(0, 10) == 0) n += 1.0; break;
        case 2: while ((int)r.Next(0, 4) == 0) n += 1.0; while ((int)r.Next(0, 10) == 0) n -= 1.0; break;
        case 3: while ((int)r.Next(0, 2) == 0) n -= 1.0; while ((int)r.Next(0, 6) == 0) n += 1.0; break;
        case 4: while ((int)r.Next(0, 2) == 0) n += 1.0; while ((int)r.Next(0, 5) == 0) n -= 1.0; break;
    }
    return n;
};
for (int i = 0; i < W; i++)
{
    num5w = Math.Min(num3w, num5w);
    num6w = Math.Max(num3w, num6w);
    num7w = Math.Min(num4w, num7w);
    num8w = Math.Max(num4w, num8w);
    if (counter <= 0)
    {
        feature = (int)r.Next(0, 5);
        counter = (int)r.Next(5, 40);
        if (feature == 0) counter *= (int)((double)(int)r.Next(5, 30) * 0.2);
    }
    counter--;
    if ((double)i > W * 0.45 && (double)i < W * 0.55 && (feature == 3 || feature == 4)) feature = (int)r.Next(3);
    if ((double)i > W * 0.48 && (double)i < W * 0.52) feature = 0;
    num3w += GenOffset(feature);
    if (i < leftBeachEnd + flatBeachPadding() || i > rightBeachStart - flatBeachPadding())
        num3w = Math.Clamp(num3w, H * num10, num9t);
    else if (num3w < H * num10) { num3w = H * num10; counter = 0; }
    else if (num3w > H * num11) { num3w = H * num11; counter = 0; }
    while ((int)r.Next(0, 3) == 0) num4w += (int)r.Next(-2, 3);
    if (num4w < num3w + H * 0.06) num4w += 1.0;
    if (num4w > num3w + H * 0.35) num4w -= 1.0;
    history.Add(num3w);
    // :F3→:R（2026-08-16 Tier B 对拍需要位级精度；与原版探针 ToString("R") 同口径）
    if (Environment.GetEnvironmentVariable("TRACE_COLS") != null) TraceCols.Add($"{i},{feature},{counter},{num3w:R},{num4w:R}");
    if (history.Count > 500) history.RemoveAt(0);
    // FillColumn：y < (int)num3 空气；[.., num4) 泥(0)；≥num4 石(1)。无墙（DirtWallBg 稍后）
    int st = (int)num3w;
    for (int y = 0; y < st; y++) { act[y * W + i] = 0; }
    for (int y = st; y < H; y++) { act[y * W + i] = 1; typ[y * W + i] = (ushort)((double)y < num4w ? 0 : 1); }
    surf[i] = st;
    if (i == rightBeachStart - flatBeachPadding())
    {
        if (num3w > num9t) Retarget(i, num9t);
        feature = 0; counter = W - i;
    }
}
int worldSurface = (int)(num6w + 25.0);
double rockLayerD = num8w;
double num12 = (int)((rockLayerD - worldSurface) / 6.0) * 6;
int rockLayer = (int)(worldSurface + num12);
int waterLine = (int)((rockLayer + (double)H) / 2) + (int)r.Next(-100, 20);
int lavaLine = waterLine + (int)r.Next(50, 80);
int num14 = 20;
if (num7w < num6w + num14)
{
    double mid = (num7w + num6w) / 2.0;
    double spread = Math.Abs(num7w - num6w); if (spread < num14) spread = num14;
    num7w = mid + spread / 2.0; num6w = mid - spread / 2.0;
}
// GenVars 口径（后续 pass 消费）
double gvWorldSurfaceLow = num5w, gvWorldSurfaceHigh = num6w;
double gvRockLayerLow = num7w, gvRockLayerHigh = num8w;
double gvWorldSurface = num3w, gvRockLayer = num4w;
Checkpoint("terrain");


Console.WriteLine($"terrain ok: worldSurface={worldSurface} rockLayer={rockLayer} waterLine={waterLine} lavaLine={lavaLine}");

// ================= 原语 =================
bool mudWallFlag = false;
// 原版 WorldGen.PlaceWall（cs:75189）：边界 (1,W-2)x(1,H-2) 内 **仅 wall==0 时**落墙，
// 且成功落墙必经 SquareWallFrame→Framing.WallFrame(resetFrame:true) 掷 1 颗
// genRand.Next(0,3)（cs:390；墙 15/64/178/180 均非 wallLargeFrames 1/2 表 → 必掷）。
// 曾无条件覆写+零掷骰 → jungle 段流指纹与墙网双双分叉（j_r1 起即错）。
void PlaceWall(int k, int l, int type)
{
    if (k <= 1 || l <= 1 || k >= W - 2 || l >= H - 2) return;
    int wi = l * W + k;
    if (wal[wi] == 0) { wal[wi] = (ushort)type; r.Next(0, 3); }
}

// ================= oracle 同步批（2026-08-17）公共 helper =================
// Framing.WallFrame(i,j,resetFrame=true) 掷骰语义（F/G 批 #19 根因；Framing.cs:326-406）：
// 边界 (1,max-2) 早退；wall==0 早退；wallLargeFrames 查表分支不掷；否则 1×Next(0,3)，
// 墙 21 命中 Next(0,3) 后再掷 Next(2)。
void WallFrameDraw(int wx, int wy)
{
    if (wx <= 0 || wy <= 0 || wx >= W - 1 || wy >= H - 1) return;
    ushort wv = wal[wy * W + wx];
    if (wv == 0 || WALL_LARGE_FRAMES.Contains(wv)) return;
    r.Next(0, 3);
    if (wv == 21) r.Next(2);
}
// WorldGen.SquareWallFrame(i,j)（cs:80937-80948）：九邻 WallFrame 仅中心格传 resetFrame
// ——至多 1 掷。
void SquareWallFrameDraw(int wx, int wy) => WallFrameDraw(wx, wy);
// MarbleGranitePass.squareWallFrameRoll 同款（无边界门——JS 调用点已界内）：
// wall!=0 且非大帧墙 → 1×Next(0,3)（大理石 PlaceSlab/花岗岩 PlaceDecorations 每格）。
void SquareWallFrameRoll(int wx, int wy)
{
    if (wx < 0 || wx >= W || wy < 0 || wy >= H) return;
    ushort wv = wal[wy * W + wx];
    if (wv != 0 && !WALL_LARGE_FRAMES.Contains(wv)) r.Next(0, 3);
}
// SolidOrSlopedTile（cs:70064）：active && tileSolid && !tileSolidTop && !inActive——
// half/slope 不参与（坡面算"实或坡"）。SOLID=tileSolid∖tileSolidTop（平台 19 族
// 本链 pass32 前不存在，等价 JS genSolidType）。
bool SolidOrSlopedGen(int x, int y)
    => x >= 0 && x < W && y >= 0 && y < H && act[y * W + x] != 0 && SOLID.Contains(typ[y * W + x]);
// WorldGen.SolidTile 五门（cs:70155）：实或坡 + !halfBrick && slope==0——I 批后
// 大理石 PlaceSlab 的 SmoothSlope 写坡面，后续门骰必须判非实心。
bool Solid5Gen(int x, int y)
{
    if (!SolidOrSlopedGen(x, y)) return false;
    int i = y * W + x;
    return half[i] == 0 && slope[i] == 0;
}
// CanPoundTile（cs:81434，HalfBrickPass 全门）：黑名单/Boulders/生成期追加/上格
// ForbidsSloping/!framed（!framed≈!FRAMED_ALL）——Desert smoothSlope 前置门。
bool CanPoundGen(int x, int y)
{
    if (!SolidOrSlopedGen(x, y)) return false;
    ushort t = typ[y * W + x];
    if (t == 0) return false;
    if (NO_POUND_SHEETS.Contains(t) || BOULDERS_G.Contains(t) || POUND_GEN_SKIP.Contains(t)) return false;
    if (y - 1 >= 0 && act[(y - 1) * W + x] != 0 && FORBIDS_SLOPING.Contains(typ[(y - 1) * W + x])) return false;
    return !FRAMED_ALL.Contains(t);
}
// Tile.SmoothSlope 核心位形（Tile.cs:822-880）：num=上<<3|下<<2|左<<1|右；
// case10→slope3/case9→slope4/case6→slope1/case5→slope2/case4→半砖/其余整砖。
void SmoothSlopeCore(int x, int y)
{
    int i = y * W + x;
    bool flag = y - 1 >= 0 && act[(y - 1) * W + x] != 0;          // TileEmpty(x,y-1)：非活性即空
    bool flag2 = !SolidOrSlopedGen(x, y - 1) && flag;
    bool flag3 = SolidOrSlopedGen(x, y + 1);
    bool flag4 = SolidOrSlopedGen(x - 1, y);
    bool flag5 = SolidOrSlopedGen(x + 1, y);
    int num = ((flag ? 1 : 0) << 3) | ((flag3 ? 1 : 0) << 2) | ((flag4 ? 1 : 0) << 1) | (flag5 ? 1 : 0);
    switch (num)
    {
        case 10: if (!flag2) { half[i] = 0; slope[i] = 3; } break;
        case 9: if (!flag2) { half[i] = 0; slope[i] = 4; } break;
        case 6: half[i] = 0; slope[i] = 1; break;
        case 5: half[i] = 0; slope[i] = 2; break;
        case 4: slope[i] = 0; half[i] = 1; break;
        default: half[i] = 0; slope[i] = 0; break;
    }
}
// HalfBrickPass.smoothSlope（applyToNeighbors=false，DesertPass 消费）：CanPound||SolidOrSloped 门
void SmoothSlopeDesert(int x, int y)
{
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    if (!CanPoundGen(x, y) || !SolidOrSlopedGen(x, y)) return;
    SmoothSlopeCore(x, y);
}
// MarbleGranitePass.tileSmoothSlope（Tile.SmoothSlope applyToNeighbors=true）：
// 邻序 (x+1,y)→(x-1,y)→(x,y+1)→(x,y-1) 后自身；轻门=NO_POUND_SHEETS||!SolidOrSloped。
void SmoothSlopeSlabSelf(int x, int y)
{
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    int i = y * W + x;
    if (NO_POUND_SHEETS.Contains(typ[i]) || !SolidOrSlopedGen(x, y)) return;
    SmoothSlopeCore(x, y);
}
void SmoothSlopeSlab(int x, int y)
{
    SmoothSlopeSlabSelf(x + 1, y); SmoothSlopeSlabSelf(x - 1, y);
    SmoothSlopeSlabSelf(x, y + 1); SmoothSlopeSlabSelf(x, y - 1);
    SmoothSlopeSlabSelf(x, y);
}
// ---- 钟乳石 165 生命周期（ShimmerPass 1:1；I/J 批）----
// MOSS_SHEETS（TileID.cs tileMoss）：182,180,179,381,183,181,534,536,539,625,627
var MOSS_SHEETS = new HashSet<ushort> { 179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627 };
// STYLE_BY_FX54（cs:38690）/FX_BASE_BY_STYLE（cs:38696-38720）
int StalStyleOfFx(int fx) => (fx / 54) switch { 0 => 7, 1 => 0, 2 => 11, 3 => 12, 4 => 1, 5 => 2, 6 => 3, 7 => 4, 8 => 5, 9 => 6, 10 => 8, 11 => 9, 12 => 10, _ => -1 };
int[] FX_BASE_BY_STYLE = { 54, 216, 270, 324, 378, 432, 486, 0, 540, 594, 648, 108, 162 };
// GetDesiredStalagtiteStyle（cs:38746-38847）：fail=true → UpdateStalagtiteStyle false → 击杀
(int fail, int style, int height, int y) GetDesiredStalStyle(int x, int j)
{
    int i0 = j * W + x;
    int fy = frY[i0];
    int num = 0, y = j, height = 1;
    int sup;
    int SheetActive(int sx, int sy) => (sx < 0 || sx >= W || sy < 0 || sy >= H || act[sy * W + sx] == 0) ? -1 : typ[sy * W + sx];
    if (fy == 72) { num = 0; sup = SheetActive(x, j - 1); }
    else if (fy == 90) { num = 1; sup = SheetActive(x, j + 1); }
    else if (fy >= 36) { if (fy == 54) y--; height = 2; num = 4; sup = SheetActive(x, y + 2); }
    else { if (fy == 18) y--; height = 2; num = 3; sup = SheetActive(x, y - 1); }
    if (sup == 1 || MOSS_SHEETS.Contains((ushort)sup))
        return (0, num == 3 && wal[i0] == 62 ? 11 : 0, height, y);
    switch (sup)
    {
        case 200: return (0, 10, height, y);
        case 164: return (0, 8, height, y);
        case 163: return (0, 9, height, y);
        case 117: case 402: case 403: return (0, 1, height, y);
        case 25: case 398: case 400: return (0, 2, height, y);
        case 203: case 399: case 401: return (0, 3, height, y);
        case 396: case 397: return (0, 4, height, y);
        case 367: return (0, 6, height, y);
        case 368: return (0, 5, height, y);
        case 147: case 161: return (0, 7, height, y);
    }
    if ((num == 0 || num == 1) && sup == 225) return (0, 12, height, y);
    return (1, 0, height, y);
}
// UpdateStalagtiteStyle（cs:38669）：style!=desired → 掷 1×Next(3) 并重写 height 格列帧
bool UpdateStalStyle(int x, int j)
{
    int i0 = j * W + x;
    int style = StalStyleOfFx(frX[i0]);
    if (style < 0) return false;
    var d = GetDesiredStalStyle(x, j);
    if (d.fail != 0) return false;
    if (style != d.style)
    {
        int fx = (int)r.Next(3) * 18 + FX_BASE_BY_STYLE[d.style];
        for (int k = d.y; k < d.y + d.height; k++)
            if (k >= 0 && k < H) frX[k * W + x] = (ushort)fx;
    }
    return true;
}
// KillTile 生成期（cs:63933-63968，165 族零尘掷）：active(false)+half 0+帧 -1+type=0 →
// SquareTileFrame 列主序级联（cs:80924：x-1 列先行——J 批修复）。
void KillStalTile(int x, int y)
{
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    int i = y * W + x;
    if (act[i] == 0) return;
    act[i] = 0; half[i] = 0; frX[i] = 65535; frY[i] = 65535; typ[i] = 0;
    for (int dx = -1; dx <= 1; dx++)
        for (int dy = -1; dy <= 1; dy++)
            Frame165(x + dx, y + dy);
}
// CheckStalactite（cs:39022）四分支：击杀带类型门（J 批——仅 type==165 的格被杀）
void CheckStalactite(int x, int j)
{
    if (x < 0 || x >= W || j < 0 || j >= H) return;
    int i0 = j * W + x;
    if (act[i0] == 0) return;
    int fy = frY[i0];
    if (fy == 72)
    {
        bool flag = !Solid5Gen(x, j - 1);
        if (!flag && !UpdateStalStyle(x, j)) flag = true;
        if (flag) KillStalTile(x, j);
        return;
    }
    if (fy == 90)
    {
        bool flag2 = !Solid5Gen(x, j + 1);
        if (!flag2 && !UpdateStalStyle(x, j)) flag2 = true;
        if (flag2) KillStalTile(x, j);
        return;
    }
    if (fy >= 36)
    {
        int num = j;
        if (frY[i0] == 54) num--;
        bool flag3 = !Solid5Gen(x, num + 2);
        bool aOk = num >= 0 && num < H, bOk = num + 1 >= 0 && num + 1 < H;
        if (!aOk || !bOk) { KillStalTile(x, num); return; }
        int a = num * W + x, b = (num + 1) * W + x;
        if (act[a] == 0 || act[b] == 0 || typ[b] != typ[a]) flag3 = true;
        if (frX[b] != frX[a]) flag3 = true;
        if (!flag3 && !UpdateStalStyle(x, num)) flag3 = true;
        if (flag3)
        {
            if (typ[a] == typ[i0]) KillStalTile(x, num);
            if (typ[b] == typ[i0]) KillStalTile(x, num + 1);
        }
        return;
    }
    int num2 = j;
    if (frY[i0] == 18) num2--;
    bool flag4 = !Solid5Gen(x, num2 - 1);
    bool aOk2 = num2 >= 0 && num2 < H, bOk2 = num2 + 1 >= 0 && num2 + 1 < H;
    if (!aOk2 || !bOk2) { KillStalTile(x, num2); return; }
    int a2 = num2 * W + x, b2 = (num2 + 1) * W + x;
    if (act[a2] == 0 || act[b2] == 0 || typ[b2] != typ[a2]) flag4 = true;
    if (frX[b2] != frX[a2]) flag4 = true;
    if (!flag4 && !UpdateStalStyle(x, num2)) flag4 = true;
    if (flag4)
    {
        if (typ[a2] == typ[i0]) KillStalTile(x, num2);
        if (typ[b2] == typ[i0]) KillStalTile(x, num2 + 1);
    }
}
// WorldUtils.TileFrame 生成期（cs:82067）：!active → 清 half/slope 返回；165 → CheckStalactite
void Frame165(int x, int y)
{
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    int i = y * W + x;
    if (act[i] == 0) { half[i] = 0; slope[i] = 0; return; }
    if (typ[i] == 165) CheckStalactite(x, y);
}
// PlaceUncheckedStalactite（cs:38371，spiders=false）1:1：材质分派帧组（后写覆盖式）
int StalBase(int a)
{
    if (a == 1 || MOSS_SHEETS.Contains((ushort)a)) return 54;
    if (a == 117) return 216;
    if (a == 25) return 270;
    if (a == 203) return 324;
    if (a == 396 || a == 397) return 378;
    if (a == 368) return 432;
    if (a == 367) return 486;
    if (a == 147 || a == 161) return 0;
    if (a == 163) return 594;
    if (a == 164) return 540;
    if (a == 200) return 648;
    return -1;
}
void PlaceStalactiteFull(int x, int y, bool preferSmall, int variation)
{
    if (x < 0 || x >= W || y < 0 || y + 1 >= H) return;
    int SheetOf(int sx, int sy) => (sx < 0 || sx >= W || sy < 0 || sy >= H || act[sy * W + sx] == 0) ? -1 : typ[sy * W + sx];
    void Put(int ax, int ay, int fx, int fy2)
    {
        if (ax < 0 || ax >= W || ay < 0 || ay >= H) return;
        int i = ay * W + ax;
        typ[i] = 165; act[i] = 1; slope[i] = 0; frX[i] = (ushort)fx; frY[i] = (ushort)fy2;
    }
    bool ICE_FAM(int a) => a == 147 || a == 161 || a == 163 || a == 164 || a == 200;
    bool Hangable(int a) => StalBase(a) >= 0 && a != 225;
    bool Groundable(int a) => StalBase(a) >= 0 && a != 225 && !ICE_FAM(a);
    if (Solid5Gen(x, y - 1) && act[y * W + x] == 0 && act[(y + 1) * W + x] == 0)
    {
        int above = SheetOf(x, y - 1);
        if (Hangable(above))
        {
            int wall = wal[y * W + x];
            int bx = (above == 1 || MOSS_SHEETS.Contains((ushort)above)) && wall == 62 ? 108 : StalBase(above);
            if (preferSmall) Put(x, y, bx + variation * 18, 72);
            else { Put(x, y, bx + variation * 18, 0); Put(x, y + 1, bx + variation * 18, 18); }
        }
        if (above == 225) Put(x, y, 162 + variation * 18, 72);
        if (above == 396 || above == 397)
        {
            if (preferSmall) Put(x, y, 378 + variation * 18, 72);
            else { Put(x, y, 378 + variation * 18, 0); Put(x, y + 1, 378 + variation * 18, 18); }
        }
        if (above == 368)
        {
            if (preferSmall) Put(x, y, 432 + variation * 18, 72);
            else { Put(x, y, 432 + variation * 18, 0); Put(x, y + 1, 432 + variation * 18, 18); }
        }
        if (above == 367)
        {
            if (preferSmall) Put(x, y, 486 + variation * 18, 72);
            else { Put(x, y, 486 + variation * 18, 0); Put(x, y + 1, 486 + variation * 18, 18); }
        }
        return;
    }
    if (!Solid5Gen(x, y + 1) || act[y * W + x] != 0 || act[(y - 1) * W + x] != 0) return;
    int below = SheetOf(x, y + 1);
    if (Groundable(below))
    {
        if (preferSmall) Put(x, y, StalBase(below) + variation * 18, 90);
        else { Put(x, y - 1, StalBase(below) + variation * 18, 36); Put(x, y, StalBase(below) + variation * 18, 54); }
    }
    if (below == 225) Put(x, y, 162 + variation * 18, 90);
    if (below == 368)
    {
        if (preferSmall) Put(x, y, 432 + variation * 18, 90);
        else { Put(x, y - 1, 432 + variation * 18, 36); Put(x, y, 432 + variation * 18, 54); }
    }
    if (below == 367)
    {
        if (preferSmall) Put(x, y, 486 + variation * 18, 90);
        else { Put(x, y - 1, 486 + variation * 18, 36); Put(x, y, 486 + variation * 18, 54); }
    }
}
// PlaceTight（cs:38329）1:1：shimmer/幼虫门 → 恒掷 Next(2)+Next(3) → 放置 →
// 落格 165 → CheckStalactite（cs:38345 尾）。oracle liqT：3=shimmer。
void PlaceTightFull(int x, int y)
{
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    int ti = y * W + x;
    if (liq[ti] > 0 && liqT[ti] == 3) return;
    if (act[ti] != 0 && typ[ti] == 231) return;
    bool preferSmall = (int)r.Next(2) == 0;
    int variation = (int)r.Next(3);
    PlaceStalactiteFull(x, y, preferSmall, variation);
    if (act[ti] != 0 && typ[ti] == 165) CheckStalactite(x, y);
}
// Check3x2 type=187（D 批活树/cs:49190-49438 帧重建 + G 批沙漠底材击杀）
// 沙漠版（DesertHive）：三列底任一不在沙族（TileID.cs:30-34；404 化石在外）→ 六格整组
// KillTile（active=false+type=0+清坡+帧 -1——cs:63933 生成期零掷）。
var SAND_FAM = new HashSet<ushort> { 53, 112, 116, 234, 396, 397, 398, 399, 402, 400, 403, 401 };
void Check3x2Kill187(int ax, int ay)
{
    for (int k = -1; k <= 1; k++)
    {
        int bi = (ay + 1) * W + ax + k;
        if (bi >= 0 && bi < W * H && act[bi] != 0 && !SAND_FAM.Contains(typ[bi]))
        {
            for (int kk = -1; kk <= 1; kk++)
                for (int l = -1; l <= 0; l++)
                {
                    int ki = (ay + l) * W + ax + kk;
                    if (ki >= 0 && ki < W * H) { act[ki] = 0; typ[ki] = 0; half[ki] = 0; slope[ki] = 0; frX[ki] = 65535; frY[ki] = 65535; }
                }
            return;
        }
    }
}
// 活树版（cs:49190-49438）：由帧重建 3×2 原点，六格 type+帧一致 + 支撑行实心；
// 失败 → KillTile 六格中仍为 187 的 active 格（类型门）。
void Check3x2Pile(int i, int j)
{
    if (i < 0 || i >= W || j < 0 || j >= H) return;
    int ii = j * W + i;
    if (act[ii] == 0 || typ[ii] != 187) return;
    int frameX = frX[ii], frameY = frY[ii];
    int num3 = frameY / 36, num4 = frameY % 36;
    int num = j - num4 / 18;
    int n5 = frameX / 18, n6 = 0;
    while (n5 > 2) { n5 -= 3; n6++; }
    n5 = i - n5;
    int num7 = n6 * 54, num8 = num + 2;
    bool flag = false;
    for (int k = n5; k < n5 + 3; k++)
    {
        for (int l = num; l < num8; l++)
        {
            if (k < 0 || k >= W || l < 0 || l >= H) { flag = true; continue; }
            int idx2 = l * W + k;
            if (act[idx2] == 0 || typ[idx2] != 187 || frX[idx2] != (ushort)((k - n5) * 18 + num7) || frY[idx2] != (ushort)((l - num) * 18 + num3 * 36)) flag = true;
        }
        if (!SolidTileGen(k, num8)) flag = true;   // 活树 solidAt：无 slope 门（LivingTreePass 口径）
    }
    if (!flag) return;
    for (int k = n5; k < n5 + 3; k++)
        for (int l = num; l < num8; l++)
        {
            if (k < 0 || k >= W || l < 0 || l >= H) continue;
            int idx2 = l * W + k;
            if (act[idx2] != 0 && typ[idx2] == 187)
            {
                act[idx2] = 0; half[idx2] = 0; frX[idx2] = 65535; frY[idx2] = 65535; typ[idx2] = 0;
            }
        }
}
// SquareTileFrame（cs:80924）活树语境子集：3×3 逐格 → 仅 187 走 Check3x2Pile
void SquareTileFramePile(int x, int y)
{
    for (int dy = -1; dy <= 1; dy++)
        for (int dx = -1; dx <= 1; dx++)
            Check3x2Pile(x + dx, y + dy);
}
bool TRTRACE = Environment.GetEnvironmentVariable("DG_TR_TRACE") != null;
int TRTRACE_STEP = 0;
void TileRunner(double i, double j, double strength, int steps, int type,
    bool addTile = false, double speedX = 0.0, double speedY = 0.0, bool noYChange = false,
    bool overRide = true, int ignoreTileType = -1)
{
    double num1 = strength, num2 = steps;
    double px = i, py = j;
    int trR0 = DgRolls();
    double vx = (int)r.Next(-10, 11) * 0.1, vy = (int)r.Next(-10, 11) * 0.1;
    if (speedX != 0.0 || speedY != 0.0) { vx = speedX; vy = speedY; }
    int num3l = 0;
    r.Next(4); // num3 液体类型（普通世界结果弃用）
    if (TRTRACE) Console.Error.WriteLine($"TR in @({i},{j}) s={strength} st={steps} t={type} rolls0={trR0}");
    while (num1 > 0.0 && num2 > 0.0)
    {
        if (TRTRACE) Console.Error.WriteLine($"TR step {TRTRACE_STEP++} num1={num1:F3} px={px:F2} py={py:F2} box=x[{(int)(px - num1 * 0.5)},{(int)(px + num1 * 0.5)}) y[{(int)(py - num1 * 0.5)},{(int)(py + num1 * 0.5)}) rolls={DgRolls()}");
        if (py < 0.0 && num2 > 0.0 && type == 59) num2 = 0.0;
        num1 = strength * (num2 / steps);
        num2 -= 1.0;
        int x0 = (int)(px - num1 * 0.5), x1 = (int)(px + num1 * 0.5);
        int y0 = (int)(py - num1 * 0.5), y1 = (int)(py + num1 * 0.5);
        if (x0 < 1) x0 = 1; if (x1 > W - 1) x1 = W - 1;
        if (y0 < 1) y0 = 1; if (y1 > H - 1) y1 = H - 1;
        for (int x = x0; x < x1; x++)
        {
            if (x < BEACH_DISTANCE + 50 || x >= W - BEACH_DISTANCE - 50) num3l = 0;
            for (int y = y0; y < y1; y++)
            {
                int ti = y * W + x;
                if (act[ti] != 0 && FRAMED_NOT_CUT.Contains(typ[ti])) continue;      // cs:77217
                if (ignoreTileType >= 0 && act[ti] != 0 && typ[ti] == ignoreTileType) continue;  // cs:77219
                double dist = Math.Abs(x - px) + Math.Abs(y - py);
                if (dist >= strength * 0.5 * (1.0 + (int)r.Next(-10, 11) * 0.015)) continue;
                if (mudWallFlag && y > worldSurface && wal[(y - 1) * W + x] != 2
                    && y < H - 210 - (int)r.Next(3)
                    && dist < strength * 0.45 * (1.0 + (int)r.Next(-10, 11) * 0.01))
                {
                    if (y > lavaLine - (int)r.Next(0, 4) - 50)
                    {
                        if (wal[(y-1) * W + x] != 64 && wal[(y+1) * W + x] != 64 && wal[y * W + x - 1] != 64 && wal[y * W + x + 1] != 64) PlaceWall(x, y, 15);
                    }
                    else if (wal[(y-1) * W + x] != 15 && wal[(y+1) * W + x] != 15 && wal[y * W + x - 1] != 15 && wal[y * W + x + 1] != 15)
                    {
                        PlaceWall(x, y, 64);
                    }
                }
                if (type < 0)
                {
                    if (act[ti] == 1 && typ[ti] == 53) continue;
                    if (type == -2 && act[ti] == 1 && (y < waterLine || y > lavaLine))
                    {
                        liq[ti] = 255; liqT[ti] = (byte)num3l;
                        if (y > lavaLine) liqT[ti] = 1; // lava（普通世界 remix 除外）
                    }
                    act[ti] = 0;
                }
                else
                {
                    bool flag4 = false;
                    ushort cur = typ[ti];
                    if (overRide && act[ti] == 1)
                    {
                        // Main.tileStone[type]（Main.cs tileStone[63-68,130,131,566]=true）：
                        // 宝石/活失活石/琥珀石铺设时仅替换石头，其余活性块保护。
                        // 丛林链 r1/r2/r3 与收尾 loop 都铺宝石——缺失会让宝石覆盖活性泥，
                        // 污染后续 type==59 拒绝采样 → 石囊位置整体错位
                        if ((type >= 63 && type <= 68) || type == 130 || type == 131 || type == 566)
                        {
                            if (cur != 1) flag4 = true;
                        }
                        if (NOT_CLEAR.Contains(cur)) flag4 = true;
                        if (cur == 1 && type == 59)
                        {
                            int f4r = (int)r.Next(-50, 50);
                            if (y < worldSurface + f4r) flag4 = true;
                        }
                        else if (FLAG3_ALWAYS.Contains(cur)) flag4 = true;
                        else if (cur == 53)
                        {
                            if (type == 40) flag4 = true;
                            if (y < worldSurface && type != 59) flag4 = true;
                        }
                        else if (cur == 396 || cur == 397) flag4 = !IsOre(type);
                        else if (cur == 367 || cur == 368) { if (type == 59) flag4 = true; }
                    }
                    if (!flag4)
                    {
                        typ[ti] = (ushort)type;
                        // cs:77338-77341（X 批）：flag = type>=0 && !SaveSlopes[type] → 写后
                        // ClearSlope（Tile.cs:160=slope0+half0）——非实心类型（蛛网51/泥59/
                        // 矿石等）覆盖已带坡格必须清坡位，否则 #19 平滑坡幸存成幻影坡。
                        if (!SAVE_SLOPES.Contains((ushort)type)) { half[ti] = 0; slope[ti] = 0; }
                    }
                    if (addTile) { act[ti] = 1; liq[ti] = 0; }
                    if (noYChange && y < worldSurface && type != 59) wal[ti] = 2;
                    if (type == 59 && y > waterLine && liq[ti] > 0) liq[ti] = 0;
                }
            }
        }
        px += vx; py += vy;
        // 大半径阶梯（cs:77370-77450）：50..900 每档 val+=vel, num2-=1, 2 发速度骰（Y 先 X 后）
        double[] thrs = { 50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900 };
        foreach (var thr in thrs)
        {
            if (num1 > thr)
            {
                px += vx; py += vy; num2 -= 1.0;
                vy += (int)r.Next(-10, 11) * 0.05;
                vx += (int)r.Next(-10, 11) * 0.05;
            }
            else break;
        }
        vx += (int)r.Next(-10, 11) * 0.05;
        if (vx > 1.0) vx = 1.0; if (vx < -1.0) vx = -1.0;
        if (!noYChange)
        {
            vy += (int)r.Next(-10, 11) * 0.05;
            if (vy > 1.0) vy = 1.0; if (vy < -1.0) vy = -1.0;
        }
        else if (type != 59 && num1 < 3.0)
        {
            if (vy > 1.0) vy = 1.0; if (vy < -1.0) vy = -1.0;
        }
        if (type == 59 && !noYChange)
        {
            if (vy > 0.5) vy = 0.5; if (vy < -0.5) vy = -0.5;
            if (py < rockLayer + 100.0) vy = 1.0;
            if (py > H - 300) vy = -1.0;
        }
    }
}
// TileID.Sets.Ore（TileID.cs:399）：19 个。曾误抄成 20/203/70/21/116/234/1110 的杂表
// → 沙岩(396/397)上铺矿的 flag4 判定与 JS ORE_SET 分叉（ores checkpoint 纯 type 差）
static bool IsOre(int t) =>
    t is 7 or 166 or 6 or 167 or 9 or 168 or 8 or 169 or 22 or 204 or 37 or 58
      or 107 or 221 or 108 or 222 or 111 or 223 or 211;

(double, double) DigTunnel(double X, double Y, double xDir, double yDir, int steps, int size, bool wet = false)
{
    double x = X, y = Y;
    x = Math.Clamp(x, size + 1.0, W - size - 1.0);
    y = Math.Clamp(y, size + 1.0, H - size - 1.0);
    double n3 = 0.0, n4 = 0.0, radius = size;
    for (int s = 0; s < steps; s++)
    {
        int x0 = (int)(x - radius), x1 = (int)(x + radius);
        int y0 = (int)(y - radius), y1 = (int)(y + radius);
        for (int ix = x0; ix <= x1; ix++)
        {
            for (int iy = y0; iy <= y1; iy++)
            {
                if (Math.Abs(ix - x) + Math.Abs(iy - y) < radius * (1.0 + (int)r.Next(-10, 11) * 0.005)
                    && ix >= 0 && ix < W && iy >= 0 && iy < H)
                {
                    int ti = iy * W + ix;
                    act[ti] = 0;
                    if (wet) { liq[ti] = 255; liqT[ti] = 0; }
                }
            }
        }
        radius += (int)r.Next(-50, 51) * 0.03;
        if (radius < size * 0.6) radius = size * 0.6;
        if (radius > size * 2) radius = size * 2;
        n3 += (int)r.Next(-20, 21) * 0.01;
        n4 += (int)r.Next(-20, 21) * 0.01;
        if (n3 < -1.0) n3 = -1.0; if (n3 > 1.0) n3 = 1.0;
        if (n4 < -1.0) n4 = -1.0; if (n4 > 1.0) n4 = 1.0;
        x += (xDir + n3) * 0.6;
        y += (yDir + n4) * 0.6;
    }
    return (x, y);
}

void Caverer(int X, int Y)
{
    if ((int)r.Next(2) == 0)
    {
        int segs = (int)r.Next(7, 9);
        (double dx, double dy) = RandDir();
        double px = X, py = Y;
        for (int k = 0; k < segs; k++)
        {
            (px, py) = DigTunnel(px, py, dx, dy, (int)r.Next(6, 20), (int)r.Next(4, 9));
            dx += (int)r.Next(-20, 21) * 0.1; dy += (int)r.Next(-20, 21) * 0.1;
            if (dx < -1.5) dx = -1.5; if (dx > 1.5) dx = 1.5;
            if (dy < -1.5) dy = -1.5; if (dy > 1.5) dy = 1.5;
            var (bx, by) = RandDir();
            var (ex, ey) = DigTunnel(px, py, bx, by, (int)r.Next(30, 50), (int)r.Next(3, 6));
            TileRunner((int)ex, (int)ey, (int)r.Next(10, 20), (int)r.Next(5, 10), -1);
        }
    }
    else
    {
        int segs = (int)r.Next(15, 30);
        (double dx, double dy) = RandDir();
        double px = X, py = Y;
        for (int k = 0; k < segs; k++)
        {
            (px, py) = DigTunnel(px, py, dx, dy, (int)r.Next(5, 15), (int)r.Next(2, 6), true);
            dx += (int)r.Next(-20, 21) * 0.1; dy += (int)r.Next(-20, 21) * 0.1;
            if (dx < -1.5) dx = -1.5; if (dx > 1.5) dx = 1.5;
            if (dy < -1.5) dy = -1.5; if (dy > 1.5) dy = 1.5;
        }
    }
}
(double, double) RandDir()
{
    double dx = (int)r.Next(0, 100) * 0.01, dy = 1.0 - dx;
    if ((int)r.Next(2) == 0) dx = -dx;
    if ((int)r.Next(2) == 0) dy = -dy;
    return (dx, dy);
}

int mountRolls = 0;
void Mountinater(int i, int j)
{
    double num = (int)r.Next(80, 120);
    double num2 = num;
    double num3 = (int)r.Next(40, 55);
    double px = i, py = j + num3 / 2.0;
    double vx = (int)r.Next(-10, 11) * 0.1, vy = (int)r.Next(-20, -10) * 0.1;
    while (num > 0.0 && num3 > 0.0)
    {
        num -= (int)r.Next(4);
        num3 -= 1.0;
        int x0 = (int)(px - num * 0.5), x1 = (int)(px + num * 0.5);
        int y0 = (int)(py - num * 0.5), y1 = (int)(py + num * 0.5);
        if (x0 < 0) x0 = 0; if (x1 > W) x1 = W;
        if (y0 < 0) y0 = 0; if (y1 > H) y1 = H;
        num2 = num * (int)r.Next(80, 120) * 0.01;
        for (int x = x0; x < x1; x++)
            for (int y = y0; y < y1; y++)
            {
                double ddx = Math.Abs(x - px), ddy = Math.Abs(y - py);
                if (Math.Sqrt(ddx * ddx + ddy * ddy) < num2 * 0.4 && act[y * W + x] == 0)
                { act[y * W + x] = 1; typ[y * W + x] = 0; }
            }
        px += vx; py += vy;
        vx += (int)r.Next(-10, 11) * 0.05;
        vy += (int)r.Next(-10, 11) * 0.05;
        if (vx > 0.5) vx = 0.5; if (vx < -0.5) vx = -0.5;
        if (vy > -0.5) vy = -0.5; if (vy < -1.5) vy = -1.5;
    }
}

Replay(); // ▶pass 头重播：DunesAndPyramidLocations cs:11540
// ================= Pass 1：Dunes（cs:11540-11602 + DunesBiome.cs + SurfaceMap.cs）=================
int dungeonTheme = (int)r.Next(3); // DungeonCrawler.SetupDungeonGenVarVariables（cs:11542 + DungeonCrawler.cs:56）——地牢砖主题 0/1/2=蓝/绿/粉

// ★入口三掷归位（2026-08-16 每 pass 重播改造）：SetupDungeonGenVarVariables 尾段
//   的入口类型掷①② Next(3)（DungeonCrawler.cs:174/177，Legacy→Dome→Tower 门）
//   + MakeDungeon_GetEntranceSettings.RandomSeed Next()（:856）原版就在【Dunes pass 头】
//   消耗——此前 oracle/JS 同步延后到 Dungeon pass 头是续流期的历史妥协；pass 边界
//   重播后 dunes 流须与原版逐掷对齐，三掷随主题掷后即掷。A/B 结果照掷照弃
//   （Legacy 路径不消费——转写债，两侧同构），entSeed 供 DgEntrance 消费。
int dgEntA = (int)r.Next(3);        // 入口类型掷①（普通世界 flag 即真只跑一轮）
int dgEntB = (int)r.Next(3);        // 入口类型掷②
int dgEntSeed = (int)r.Next();      // preGenDungeonEntranceSettings.RandomSeed（Legacy 不预计算位置）
// Count：WorldGenRange(1,2,ScaleWith:WorldWidth) → Next((int)(w/4200*1), (int)(w/4200*2)+1)
int dunesCount = (int)r.Next((int)(W / 4200.0 * 1), (int)(W / 4200.0 * 2) + 1);
var pyrX = new List<int>(); var pyrY = new List<int>();
for (int i = 0; i < dunesCount; i++)
{
    int ox, oy, tries = 0;
    for (; ; )
    {
        ox = (int)r.Next(500, W - 500);
        oy = (int)r.Next(0, H);
        bool fJungle = Math.Abs(ox - jungleX) < (int)(600.0 * (W / 4200.0));
        bool fCenter = Math.Abs(ox - W / 2) < 300;
        bool fSnow = ox > snowL - 300 && ox < snowR + 300;
        tries++;
        if (tries >= W) fJungle = false;
        if (tries >= W * 2) fSnow = false;
        if (!(fJungle || fCenter || fSnow)) break;
    }
    DunesPlace(ox, oy);
    if ((double)r.NextDouble() <= 0.8)
    {
        int px2 = (int)r.Next(ox - 200, ox + 200);
        for (int j = 0; j < H; j++)
        {
            if (act[j * W + px2] == 1) { pyrX.Add(px2); pyrY.Add(j + 20); break; }
        }
    }
}
void DunesPlace(int originX, int originY)
{
    // DunesBiome.Place（DunesBiome.cs:56-70）：heightScale=1（Configuration.json）
    int height = (int)((int)r.Next(60, 100) * 1.0);
    int height2 = (int)((int)r.Next(60, 100) * 1.0);
    // SingleDunesWidth：Min150 Max250 ScaleWith=None → Next(150,251) 不缩放
    int rand1 = (int)r.Next(150, 251);
    int rand2 = (int)r.Next(150, 251);
    // ★CreateFromPlacement ×2（SurfaceMap 采样+风向掷）都先于 PlaceSingle ×2
    //（DunesBiome.cs:62-65：两图均为 pre-dune1 地形）
    int l1 = originX - rand1 / 2 + 30 - rand1 / 2, l2 = originX + rand2 / 2 - 30 - rand2 / 2;
    var surf1 = SurfaceFromArea(l1 - 20, rand1 + 40);
    bool wind1 = (int)r.Next(2) != 0;
    var surf2 = SurfaceFromArea(l2 - 20, rand2 + 40);
    bool wind2 = (int)r.Next(2) != 0;
    DunesSingle(l1, originY, rand1, height, wind1, surf1);
    DunesSingle(l2, originY, rand2, height2, wind2, surf2);
}
void DunesSingle(int left, int originY, int width, int height, bool windRight, int[] surface)
{
    int top = originY - height / 2;
    int centerX = left + width / 2;
    int num = (int)r.Next(3) + 8;
    for (int i = 0; i < num - 1; i++)
    {
        int num2 = (int)(2.0 / num * width);
        int num3 = (int)((double)i / num * width + left) + num2 * 2 / 5;
        num3 += (int)r.Next(-5, 6);
        double num4 = (double)i / (num - 2);
        double num5 = 1.0 - Math.Abs(num4 - 0.5) * 2.0;
        PlaceHill(num3 - num2 / 2, num3 + num2 / 2, num5 * 0.3 + 0.2, surface, left, width, centerX, windRight);
    }
    int num6 = (int)r.Next(2) + 1;
    for (int j = 0; j < num6; j++)
    {
        int num7 = width / 2;
        int x = centerX + (int)r.Next(-10, 11);
        PlaceHill(x - num7 / 2, x + num7 / 2, 0.8, surface, left, width, centerX, windRight);
    }
}
int[] SurfaceFromArea(int startX, int width)
{
    int half = H / 2;
    var arr = new int[width];
    for (int i = startX; i < startX + width; i++)
    {
        if (i < 0 || i >= W) { arr[i - startX] = half + 50; continue; }
        bool flag = false; int num2 = 0;
        for (int j = 50; j < 50 + half; j++)
        {
            int ti = j * W + i;
            if (act[ti] == 1)
            {
                if (CLOUDS.Contains(typ[ti])) flag = false;
                else if (!flag) { num2 = j; flag = true; }
            }
            if (!flag) num2 = half + 50;
        }
        arr[i - startX] = num2;
    }
    return arr;
}
void PlaceHill(int startX, int endX, double scale, int[] surface, int left, int width, int centerX, bool windRight)
{
    int sy0 = surface[startX - (left - 20)], sy1 = surface[endX - (left - 20)];
    int midX = (startX + endX) / 2, midY = (sy0 + sy1) / 2 - (int)(35.0 * scale);
    int num = (endX - midX) / 4;
    int minV = (endX - midX) / 16;
    if (!windRight) midX -= (int)r.Next(minV, num + 1);
    else midX += (int)r.Next(minV, num + 1);
    int aX = 0, aY = (int)(scale * 12.0);
    PlaceCurvedLine(startX, sy0, midX, midY, windRight ? (-aX / 2, -aY / 2) : (aX, aY), surface, left, width, centerX);
    // line2 锚（cs 源码：WindDirection == Left ? point3 : point2 —— Right 风用 p2，与 line1 相反）
    PlaceCurvedLine(midX, midY, endX, sy1, windRight ? (aX, aY) : (-aX / 2, -aY / 2), surface, left, width, centerX);
}
void PlaceCurvedLine(int sx, int sy, int ex, int ey, (int, int) anchor, int[] surface, int left, int width, int centerX)
{
    int px = (sx + ex) / 2 + anchor.Item1, py = (sy + ey) / 2 + anchor.Item2;
    double step = 0.5 / (double)(ex - sx);
    int prevX = -1, prevY = -1;
    for (double t = 0.0; t <= 1.0; t += step)
    {
        double lx = sx + (px - sx) * t, ly = sy + (py - sy) * t;
        double rx = px + (ex - px) * t, ry = py + (ey - py) * t;
        int cx = (int)(lx + (rx - lx) * t), cy = (int)(ly + (ry - ly) * t);
        if (cx == prevX && cy == prevY) continue;
        prevX = cx; prevY = cy;
        if (cx < 0 || cx >= W) continue;
        int num3 = width / 2 - Math.Abs(cx - centerX);
        // (int)NaN x86 语义（int.MinValue）——dotnet ARM64 原生给 0，须显式模拟（金标实证）
        double sq = Math.Sqrt(num3) * 3.0;
        int sqi = double.IsNaN(sq) ? int.MinValue : (int)sq;
        int num4 = surface[cx - (left - 20)] + sqi;
        for (int i2 = cy - 10; i2 < cy; i2++)
        {
            if (i2 < 0 || i2 >= H) continue;
            int ti = i2 * W + cx;
            if (act[ti] == 1 && typ[ti] != 53) { act[ti] = 0; typ[ti] = 0; wal[ti] = 0; liq[ti] = 0; }
        }
        for (int j2 = cy; j2 < num4; j2++)
        {
            if (j2 < 0 || j2 >= H) continue;
            int ti = j2 * W + cx;
            act[ti] = 1; typ[ti] = 53;
        }
    }
}
Checkpoint("dunes");

Replay(); // ▶pass 头重播：OceanSand cs:11603
// ================= Pass 2：OceanSand（cs:11603-11711）=================
for (int i = 0; i < 3; i++)
{
    int x0 = (int)r.Next(0, W);
    while (x0 > W * 0.40 && x0 < W * 0.60) x0 = (int)r.Next(0, W);
    int leftW = (int)r.Next(35, 90);
    if (i == 1) leftW += (int)((int)r.Next(20, 40) * (W / 4200.0));
    if ((int)r.Next(0, 3) == 0) leftW *= 2;
    if (i == 1) leftW *= 2;
    int rightW = (int)r.Next(35, 90);
    if ((int)r.Next(0, 3) == 0) rightW *= 2;
    if (i == 1) rightW *= 2;
    int num4b = x0 - leftW, num5b = x0 + rightW;
    if (num4b < 0) num4b = 0;
    if (num5b > W) num5b = W;
    if (i == 1) continue;
    if (i == 0) { num4b = 0; num5b = leftBeachEnd; }
    if (i == 2) { num4b = rightBeachStart; num5b = W; }
    int depth = (int)r.Next(50, 100);
    for (int j = num4b; j < num5b; j++)
    {
        if ((int)r.Next(0, 2) == 0)
        {
            depth += (int)r.Next(-1, 2);
            if (depth < 50) depth = 50;
            if (depth > 200) depth = 200;
        }
        for (int k = 0; (double)k < (worldSurface + rockLayer) / 2.0; k++)
        {
            int ti = k * W + j;
            if (act[ti] == 0) continue;
            if (j == (num4b + num5b) / 2 && (int)r.Next(0, 6) == 0) { pyrX.Add(j); pyrY.Add(k); }
            int num7b = depth;
            if (j - num4b < num7b) num7b = j - num4b;
            if (num5b - j < num7b) num7b = num5b - j;
            int thick = num7b + (int)r.Next(0, 5);
            for (int l = k; l < k + thick && l < H; l++)
            {
                if (j > num4b + (int)r.Next(0, 5) && j < num5b - (int)r.Next(0, 5))
                    typ[l * W + j] = 53;
            }
            break;
        }
    }
}
// 逐列沙顶剖面（诊断用）
Checkpoint("oceansand");

Replay(); // ▶pass 头重播：SandPatches cs:11712
// ================= Pass 3：SandPatches（cs:11712-11737）=================
{
    int num = (int)((double)W * 0.013);
    for (int i = 0; i < num; i++)
    {
        int num2 = (int)r.Next(0, W);
        int num3 = (int)r.Next(worldSurface, rockLayer);
        while (num2 > W * 0.46 && num2 < W * 0.54 && num3 < worldSurface + 150)
        { num2 = (int)r.Next(0, W); num3 = (int)r.Next(worldSurface, rockLayer); }
        TileRunner(num2, num3, (int)r.Next(15, 70), (int)r.Next(20, 130), 53);
    }
}
Checkpoint("sandpatches");

Replay(); // ▶pass 头重播：Tunnels cs:11743
// ================= Pass 4：Tunnels（cs:11745-11808）=================
int dsX = 0, dsY = 0, dsR = 0, dsB = 0;
int grassSpread = 0;   // SpreadGrass 洪水计数（mushroom/corruption 共用）   // UndergroundDesertLocation（corruption 避让消费）
var tunX = new List<int>();              // GenVars.tunnelX（Lakes 避让消费）
int snowTopGen = 0, snowBottomGen = 0;   // GenVars.snowTop/snowBottom（Slush 消费）
{
    int num = (int)((double)W * 0.0015);
    int numTunnels = 0;
    for (int i = 0; i < num; i++)
    {
        if (numTunnels >= 49) break;
        var array = new int[10]; var array2 = new int[10];
        int num2 = (int)r.Next(450, W - 450);
        while (num2 > W * 0.4 && num2 < W * 0.6) num2 = (int)r.Next(450, W - 450);
        int j = 0; bool flag;
        do
        {
            flag = false;
            for (int k = 0; k < 10; k++)
            {
                num2 %= W;
                while (j < H && act[j * W + num2] == 0) j++;
                if (typ[j * W + num2] == 53) flag = true;
                array[k] = num2;
                array2[k] = j - (int)r.Next(11, 16);
                num2 += (int)r.Next(5, 11);
            }
        } while (flag);
        numTunnels++;
        tunX.Add(array[5]);                    // GenVars.tunnelX[numTunnels] = array[5]（Lakes 避让用）
        for (int l = 0; l < 10; l++)
        {
            TileRunner(array[l], array2[l], (int)r.Next(5, 8), (int)r.Next(6, 9), 0, true, -2.0, -0.3);
            TileRunner(array[l], array2[l], (int)r.Next(5, 8), (int)r.Next(6, 9), 0, true, 2.0, -0.3);
        }
    }
}
Checkpoint("tunnels");

var mCaveX = new List<int>();
var mCaveY = new List<int>();

Replay(); // ▶pass 头重播：MountainCaves cs:11809
// ================= Pass 5：MountainCaves（cs:11809-11882，山丘本体；pass 34 开口在 Beaches 后）=================
{
    int num = (int)((double)W * 0.001);
    for (int i = 0; i < num; i++)
    {
        int tries = 0; bool giveUp = false, done = false;
        int num3 = (int)r.Next((int)(W * 0.25), (int)(W * 0.75));
        while (!done)
        {
            done = true;
            while (num3 > W / 2 - 90 && num3 < W / 2 + 90)
            {
                num3 = (int)r.Next((int)(W * 0.25), (int)(W * 0.75));
            }
            for (int j = 0; j < mCaveX.Count; j++)
            {
                if (Math.Abs(num3 - mCaveX[j]) < 100) { tries++; done = false; break; }
            }
            if (tries >= W / 5) { giveUp = true; break; }
        }
        if (giveUp) continue;
        for (int k = 0; (double)k < worldSurface; k++)
        {
            if (act[k * W + num3] == 1)
            {
                bool sand = false;
                for (int l = num3 - 50; l < num3 + 50; l++)
                    for (int m = k - 25; m < k + 25; m++)
                    {
                        if (l < 0 || l >= W || m < 0 || m >= H) continue;
                        if (act[m * W + l] == 1 && (typ[m * W + l] == 53 || typ[m * W + l] == 151 || typ[m * W + l] == 274)) sand = true;
                    }
                if (!sand) { Mountinater(num3, k); mCaveX.Add(num3); mCaveY.Add(k); }
                break;
            }
        }
    }
}
Checkpoint("mountaincaves");

Replay(); // ▶pass 头重播：DirtWallBackgrounds cs:11883
// ================= Pass 6：DirtWallBackgrounds（cs:11883-11921）=================
{
    int num = 0;
    for (int i = 1; i < W - 1; i++)
    {
        ushort wall = 2;
        num += (int)r.Next(-1, 2);
        if (num < 0) num = 0;
        if (num > 10) num = 10;
        bool flag = false;
        for (int j = 0; (double)j < worldSurface + 10.0 && !((double)j > worldSurface + num); j++)
        {
            int ti = j * W + i;
            if (act[ti] == 1) wall = (ushort)(typ[ti] != 147 ? 2 : 40);
            if (flag && wal[ti] != 64) wal[ti] = wall;
            if (act[ti] == 1 && act[j * W + i - 1] == 1 && act[j * W + i + 1] == 1
                && act[(j + 1) * W + i] == 1 && act[(j + 1) * W + i - 1] == 1 && act[(j + 1) * W + i + 1] == 1)
                flag = true;
        }
    }
}
Checkpoint("dirtwallbg");

Replay(); // ▶pass 头重播：RocksInDirt cs:11922
// ================= Pass 7-9：RocksInDirt / DirtInRocks / Clay（cs:11922-12033）=================
int oreCalls = 0;
void OreBand(double count, int yMin, int yMax, int type, int sMin, int sMax, int stMin, int stMax)
{
    for (int n = 0; n < count; n++)
    {
        int rx = (int)r.Next(0, W), ry = (int)r.Next(Math.Max(0, yMin), Math.Min(H - 1, yMax) + 1);
        int rs = (int)r.Next(sMin, sMax + 1), rt = (int)r.Next(stMin, stMax + 1);
        oreCalls++;
        TileRunner(rx, ry, rs, rt, type);
    }
}
OreBand(W * H * 0.00015, 0, (int)gvWorldSurfaceLow, 1, 4, 14, 5, 39); // Next(0,(int)WSL+1)
{
    double num = W * H * 0.0002;
    for (int n = 0; n < num; n++)
    {
        int i = (int)r.Next(0, W);
        int j = (int)r.Next((int)gvWorldSurfaceLow, (int)gvWorldSurfaceHigh + 1);
        if (act[Math.Max(0, j - 10) * W + i] == 0)
            j = (int)r.Next((int)gvWorldSurfaceLow, (int)gvWorldSurfaceHigh + 1);
        TileRunner(i, j, (int)r.Next(4, 10), (int)r.Next(5, 30), 1);
    }
}
OreBand(W * H * 0.0045, (int)gvWorldSurfaceHigh, (int)gvRockLayerHigh, 1, 2, 6, 2, 22);
Replay(); // ▶pass 头重播：DirtInRocks cs:11952（rocksclay 内部边界）
OreBand(W * H * 0.005, (int)gvRockLayerLow, H - 1, 0, 2, 5, 2, 39);
Replay(); // ▶pass 头重播：Clay cs:11985（rocksclay 内部边界）
OreBand((int)(W * H * 0.00002), 0, (int)gvWorldSurfaceLow - 1, 40, 4, 13, 10, 49);
OreBand((int)(W * H * 0.00005), (int)gvWorldSurfaceLow, (int)gvWorldSurfaceHigh, 40, 8, 13, 15, 44);
OreBand((int)(W * H * 0.00002), (int)gvWorldSurfaceHigh, (int)gvRockLayerHigh, 40, 8, 14, 5, 49);
// 表层粘土清除（cs:12023-12025）：type=0 保持 active
for (int x = 5; x < W - 5; x++)
{
    for (int y = 1; y < worldSurface - 1; y++)
    {
        if (act[y * W + x] == 0) continue;
        for (int y2 = y; y2 < y + 5; y2++)
            if (y2 < H && typ[y2 * W + x] == 40) typ[y2 * W + x] = 0;
        break;
    }
}
Checkpoint("rocksclay");

Replay(); // ▶pass 头重播：SmallHoles cs:12034
// ================= Pass 10：SmallHoles（cs:12034-12092）=================
{
    double wsh = gvWorldSurfaceHigh; // raw double
    int num = (int)((double)(W * H) * 0.0015);
    for (int i = 0; i < num; i++)
    {
        int type = -1;
        if ((int)r.Next(0, 5) == 0) type = -2;
        int num2 = (int)r.Next(0, W);
        int num3 = (int)r.Next((int)gvWorldSurfaceHigh, H);
        while (((num2 < 340 || num2 > W - 340) && num3 < wsh) || (num2 > W * 0.45 && num2 < W * 0.55 && num3 < gvWorldSurface))
        { num2 = (int)r.Next(0, W); num3 = (int)r.Next((int)gvWorldSurfaceHigh, H); }
        int num4 = (int)r.Next(2, 5);
        int num5 = (int)r.Next(2, 20);
        TileRunner(num2, num3, num4, num5, type);
        num2 = (int)r.Next(0, W);
        num3 = (int)r.Next((int)gvWorldSurfaceHigh, H);
        while (((num2 < 340 || num2 > W - 340) && num3 < wsh) || (num2 > W * 0.45 && num2 < W * 0.55 && num3 < gvWorldSurface))
        { num2 = (int)r.Next(0, W); num3 = (int)r.Next((int)gvWorldSurfaceHigh, H); }
        num4 = (int)r.Next(8, 15);
        num5 = (int)r.Next(7, 30);
        TileRunner(num2, num3, num4, num5, type);
    }
}
Checkpoint("smallholes");

Replay(); // ▶pass 头重播：DirtLayerCaves cs:12094
// ================= Pass 11：DirtLayerCaves（cs:12094-12134）=================
{
    double wsh = gvWorldSurfaceHigh;
    int num = (int)((double)(W * H) * 3E-05);
    for (int i = 0; i < num; i++)
    {
        int type = -1;
        if ((int)r.Next(0, 6) == 0) type = -2;
        int num2 = (int)r.Next(0, W);
        int num3 = (int)r.Next((int)gvWorldSurfaceLow, (int)gvRockLayerHigh + 1);
        while (((num2 < 340 || num2 > W - 340) && num3 < wsh) || ((double)num2 >= W * 0.45 && (double)num2 <= W * 0.55 && num3 < worldSurface))
        { num2 = (int)r.Next(0, W); num3 = (int)r.Next((int)gvWorldSurfaceLow, (int)gvRockLayerHigh + 1); }
        TileRunner(num2, num3, (int)r.Next(5, 15), (int)r.Next(30, 200), type);
    }
}
Checkpoint("dirtlayer");

Replay(); // ▶pass 头重播：RockLayerCaves cs:12135
// ================= Pass 12：RockLayerCaves（cs:12135-12165）=================
{
    int num = (int)((double)(W * H) * 0.00013);
    for (int i = 0; i < num; i++)
    {
        int type = -1;
        if ((int)r.Next(0, 10) == 0) type = -2;
        int s = (int)r.Next(6, 20);
        int st = (int)r.Next(50, 300);
        TileRunner((int)r.Next(0, W), (int)r.Next((int)gvRockLayerHigh, H), s, st, type);
    }
}
Checkpoint("rocklayer");

Replay(); // ▶pass 头重播：SurfaceCaves cs:12191
// ================= Pass 13：SurfaceCaves（cs:12191-12300）=================
{
    int beachL = leftBeachEnd + 20, beachR = rightBeachStart - 20;
    Action<int, double, double, Action<int, int>> SurfaceCaveGroup = (count, lo, hi, runners) => {
        for (int n = 0; n < count; n++)
        {
            int x = (int)r.Next(0, W);
            while ((x > W * lo && x < W * hi) || x < beachL || x > beachR) x = (int)r.Next(0, W);
            int sy = -1;
            for (int y = 0; (double)y < gvWorldSurfaceHigh && y < H; y++)
                if (act[y * W + x] == 1) { sy = y; break; }
            if (sy < 0) continue;
            runners(x, sy);
        }
    };
    SurfaceCaveGroup((int)(W * 0.002), 0.45, 0.55, (x, y) =>
        TileRunner(x, y, (int)r.Next(3, 6), (int)r.Next(5, 50), -1, false, (int)r.Next(-10, 11) * 0.1, 1.0));
    SurfaceCaveGroup((int)(W * 0.0007), 0.43, 0.57, (x, y) =>
        TileRunner(x, y, (int)r.Next(10, 15), (int)r.Next(50, 130), -1, false, (int)r.Next(-10, 11) * 0.1, 2.0));
    SurfaceCaveGroup((int)(W * 0.0003), 0.40, 0.60, (x, y) => {
        TileRunner(x, y, (int)r.Next(12, 25), (int)r.Next(150, 500), -1, false, (int)r.Next(-10, 11) * 0.1, 4.0);
        TileRunner(x, y, (int)r.Next(8, 17), (int)r.Next(60, 200), -1, false, (int)r.Next(-10, 11) * 0.1, 2.0);
        TileRunner(x, y, (int)r.Next(5, 13), (int)r.Next(40, 170), -1, false, (int)r.Next(-10, 11) * 0.1, 2.0);
    });
    SurfaceCaveGroup((int)(W * 0.0004), 0.40, 0.60, (x, y) =>
        TileRunner(x, y, (int)r.Next(7, 12), (int)r.Next(150, 250), -1, false, 0.0, 1.0, true));
    int cavCount = (int)(5.0 * (W / 4200.0));
    int yLo = rockLayer, yHi = H - 400;
    if (yLo >= yHi) yLo = yHi - 1;
    for (int n = 0; n < cavCount; n++)
        Caverer((int)r.Next(340, W - 340), (int)r.Next(yLo, yHi));
}
Checkpoint("surfacecaves");


Replay(); // ▶pass 头重播：IceBiome cs:12343
// ================= Pass 16：IceBiome（cs:12343-12440，1456 注册序紧跟 SurfaceCaves）=================
var snowMinXArr = new int[H];
var snowMaxXArr = new int[H];
{
    snowTopGen = worldSurface;
    int snowTop = worldSurface;
    int convLine = lavaLine - (int)r.Next(160, 200);
    int left = snowL, right = snowR;
    int num5 = 10;
    for (int i = 0; i <= lavaLine - 140; i++)
    {
        left += (int)r.Next(-4, 4);
        right += (int)r.Next(-3, 5);
        if (i > 0)
        {
            left = (left + snowMinXArr[i - 1]) / 2;
            right = (right + snowMaxXArr[i - 1]) / 2;
        }
        if (dungeonRight) { if ((int)r.Next(4) == 0) { left++; right++; } }
        else if ((int)r.Next(4) == 0) { left--; right--; }
        snowMinXArr[i] = left;
        snowMaxXArr[i] = right;
        if (snowBottomGen < i) snowBottomGen = i;   // GenVars.snowBottom（cs:12447）
        for (int j = left; j < right; j++)
        {
            if (j < 0 || j >= W) continue; // vanilla 落 padding（丢弃）
            if (i < convLine)
            {
                int ti = i * W + j;
                if (wal[ti] == 2) wal[ti] = 40;
                if (typ[ti] is 0 or 2 or 23 or 40 or 53) typ[ti] = 147;
                else if (typ[ti] == 1) typ[ti] = 161;
            }
            else
            {
                num5 += (int)r.Next(-3, 4);
                if ((int)r.Next(3) == 0)
                {
                    num5 += (int)r.Next(-4, 5);
                    if ((int)r.Next(3) == 0) num5 += (int)r.Next(-6, 7);
                }
                if (num5 < 0) num5 = (int)r.Next(3);
                else if (num5 > 50) num5 = 50 - (int)r.Next(3);
                for (int k = i; k < i + num5; k++)
                {
                    if (k >= H) break;
                    int ti = k * W + j;
                    if (wal[ti] == 2) wal[ti] = 40;
                    if (typ[ti] is 0 or 2 or 23 or 40 or 53) typ[ti] = 147;
                    else if (typ[ti] == 1) typ[ti] = 161;
                }
            }
        }
    }
}
Checkpoint("icebiome");

Replay(); // ▶pass 头重播：Grass cs:12454
// ================= Grass（cs:12454-12507）=================
{
    double count = (double)(W * H) * 0.002;
    for (int i = 0; (double)i < count; i++)
    {
        int x1 = (int)r.Next(1, W - 1);
        int y1 = (int)r.Next((int)gvWorldSurfaceLow, (int)gvWorldSurfaceHigh);
        if (y1 >= H) y1 = H - 2;
        if (x1 >= 1 && x1 < W - 1 && y1 >= 1 && y1 < H - 1
            && act[y1 * W + x1 - 1] == 1 && typ[y1 * W + x1 - 1] == 0
            && act[y1 * W + x1 + 1] == 1 && typ[y1 * W + x1 + 1] == 0
            && act[(y1 - 1) * W + x1] == 1 && typ[(y1 - 1) * W + x1] == 0
            && act[(y1 + 1) * W + x1] == 1 && typ[(y1 + 1) * W + x1] == 0)
        { act[y1 * W + x1] = 1; typ[y1 * W + x1] = 2; }
        int x2 = (int)r.Next(1, W - 1);
        int y2 = (int)r.Next(5, (int)gvWorldSurfaceLow);
        if (y2 >= H) y2 = H - 2;
        if (x2 >= 1 && x2 < W - 1 && y2 >= 1 && y2 < H - 1
            && act[y2 * W + x2 - 1] == 1 && typ[y2 * W + x2 - 1] == 0
            && act[y2 * W + x2 + 1] == 1 && typ[y2 * W + x2 + 1] == 0
            && act[(y2 - 1) * W + x2] == 1 && typ[(y2 - 1) * W + x2] == 0
            && act[(y2 + 1) * W + x2] == 1 && typ[(y2 + 1) * W + x2] == 0)
        { act[y2 * W + x2] = 1; typ[y2 * W + x2] = 2; }
    }
}
Checkpoint("grass");

Replay(); // ▶pass 头重播：JunglePass cs:12497
// ================= Jungle（JunglePass.cs 全文 1:1）=================
{
    double ws = W / 4200.0 * 1.5;
    int jx = jungleX, jy = (H + rockLayer) / 2;
    int zeroX = 0, zeroY = 0;
    void Move(ref int x, ref int y, int xr, int yr)
    {
        x += (int)r.Next((int)(-xr * ws), 1 + (int)(xr * ws));
        y += (int)r.Next((int)(-yr * ws), 1 + (int)(yr * ws));
        y = Math.Clamp(y, rockLayer, H);
    }
    void PlaceFirstPassMud(int x, int y, int xSpeedScale)
    {
        mudWallFlag = true;
        TileRunner(x, y, (int)r.Next((int)(250 * ws), (int)(500 * ws)), (int)r.Next(50, 150), 59, false, (dungeonRight ? 1 : -1) * xSpeedScale, 0.0);
        mudWallFlag = false;
    }
    void PlaceGemsAt(int x, int y, int baseGem, int variants)
    {
        for (int i = 0; (double)i < 6.0 * ws; i++)
            TileRunner(x + (int)r.Next(-(int)(125 * ws), (int)(125 * ws)), y + (int)r.Next(-(int)(125 * ws), (int)(125 * ws)), (int)r.Next(3, 7), (int)r.Next(3, 8), (int)r.Next(baseGem, baseGem + variants));
    }
    Move(ref jx, ref jy, 100, 100); zeroX += jx; zeroY += jy;
    PlaceFirstPassMud(jx, jy, 3);
    PlaceGemsAt(jx, jy, 63, 2);
    JSeg("j_r1");
    Move(ref jx, ref jy, 250, 150); zeroX += jx; zeroY += jy;
    PlaceFirstPassMud(jx, jy, 0);
    PlaceGemsAt(jx, jy, 65, 2);
    JSeg("j_r2");
    int oldX = jx, oldY = jy;
    Move(ref jx, ref jy, 400, 150); zeroX += jx; zeroY += jy;
    PlaceFirstPassMud(jx, jy, -3);
    PlaceGemsAt(jx, jy, 67, 2);
    JSeg("j_r3");
        jx = zeroX / 3; jy = zeroY / 3;
    int bigNum = (int)r.Next((int)(400 * ws), (int)(600 * ws));
    int pad = (int)(25 * ws);
    jx = Math.Clamp(jx, leftBeachEnd + bigNum / 2 + pad, rightBeachStart - bigNum / 2 - pad);
    mudWallFlag = true;
    TileRunner(jx, jy, bigNum, 10000, 59, false, 0.0, -20.0, true);
    mudWallFlag = false;
    JSeg("j_big");
        // GenerateTunnelToSurface（cs:131-200）
    double num = (int)r.Next(5, 11);
    double px = jx, py = jy;
    double vx = (int)r.Next(-10, 11) * 0.1, vy = (int)r.Next(10, 20) * 0.1;
    int num2 = 0; bool flag = true;
    while (flag)
    {
        if (py < worldSurface)
        {
            // ★原版：value=(int)val.X 钳 [10, W-10]；value2=(int)val.Y 钳 [10, H-10]，
            // value2<5 → 5；检查 (value, value2-{0..5})——曾 x/y 互换
            int vv = (int)px; vv = Math.Clamp(vv, 10, W - 10);
            int vvy = (int)py; vvy = Math.Clamp(vvy, 10, H - 10);
            if (vvy < 5) vvy = 5;
            bool openAll = true;
            for (int d = 0; d <= 5; d++)
            {
                int ii = (vvy - d) * W + vv;
                if (vvy - d < 0 || vvy - d >= H) { openAll = false; break; }
                if (wal[ii] != 0 || act[ii] == 1) { openAll = false; break; }
            }
            if (openAll) flag = false;
        }
        num += (int)r.Next(-20, 21) * 0.1;
        if (num < 5) num = 5; if (num > 10) num = 10;
        int x0 = Math.Clamp((int)(px - num * 0.5), 10, W - 10);
        int x1 = Math.Clamp((int)(px + num * 0.5), 10, W - 10);
        int y0 = Math.Clamp((int)(py - num * 0.5), 10, H - 10);
        int y1 = Math.Clamp((int)(py + num * 0.5), 10, H - 10);
        for (int x = x0; x < x1; x++)
            for (int y = y0; y < y1; y++)
                if (Math.Abs(x - px) + Math.Abs(y - py) < num * 0.5 * (1 + (int)r.Next(-10, 11) * 0.015))
                {
                    // 原版 WorldGen.KillTile（cs:63559，worldgen 期）：活性格 active=false
                    // **且 type=0**（cs:63970 尾部 tile.type=0；SquareTileFrame 的
                    // Next(0,3) 在 !generatingWorld 门内不掷）。非活性格早退不动（保留
                    // TileRunner 挖空的幽灵 type）。曾"保留 type"→ 收尾拒绝采样
                    //（type!=59 读幽灵）与 typ 网分叉。
                    int ki = y * W + x;
                    if (act[ki] == 1) { act[ki] = 0; typ[ki] = 0; }
                }
        num2++;
        if (num2 > 10 && (int)r.Next(50) < num2)
        {
            num2 = 0;
            // 原版 num4=-2; if(Next(2)==0) num4=2（JunglePass.cs:178-182）——Next(2)==0 → +2
            int side = (int)r.Next(2) == 0 ? 2 : -2;
            // ★mudWall=true（JunglePass.cs:54 置位、:59 才复位）——分支洞穴也在
            // mudWall 期内：每格 l>worldSurface && wall(k,l-1)!=2 耗 Next(3)、
            // 过阈再耗 Next(-10,11) 铺丛林墙 15/64（JS JunglePass 17:2x 修复镜像）
            mudWallFlag = true;
            TileRunner((int)px, (int)py, (int)r.Next(3, 20), (int)r.Next(10, 100), -1, false, side);
            mudWallFlag = false;
        }
        px += vx; py += vy;
        vy += (int)r.Next(-10, 11) * 0.01;
        if (vy > 0) vy = 0; if (vy < -2) vy = -2;
        vx += (int)r.Next(-10, 11) * 0.1;
        if (px < jx - 200) vx += (int)r.Next(5, 21) * 0.1;
        if (px > jx + 200) vx -= (int)r.Next(5, 21) * 0.1;
        if (vx > 1.5) vx = 1.5; if (vx < -1.5) vx = -1.5;
    }
        var CPH = new List<string> { $"tun={(int)r.Peek()}" };
    JSeg("j_tunnel");
    // GenerateHolesInMudWalls + MudWallRunner（cs:203-217 + 77584）
    void MudWallRunner(int i, int j)
    {
        double m1 = (int)r.Next(8, 21), m2 = (int)r.Next(8, 33);
        double m3 = m2;
        double mx = i, my = j;
        double mvx = (int)r.Next(-10, 11) * 0.1, mvy = (int)r.Next(-10, 11) * 0.1;
        while (m1 > 0 && m3 > 0)
        {
            double m4 = m1 * (m3 / m2);
            m3 -= 1;
            int x0 = (int)(mx - m4 * 0.5), x1 = (int)(mx + m4 * 0.5);
            int y0 = (int)(my - m4 * 0.5), y1 = (int)(my + m4 * 0.5);
            if (x0 < 0) x0 = 0; if (x1 > W) x1 = W;
            if (y0 < 0) y0 = 0; if (y1 > H) y1 = H;
            for (int x = x0; x < x1; x++)
                for (int y = y0; y < y1; y++)
                    if (Math.Abs(x - mx) + Math.Abs(y - my) < m1 * 0.5 * (1 + (int)r.Next(-10, 11) * 0.015) && y > worldSurface)
                        wal[y * W + x] = 0;
            mx += mvx; my += mvy;
            mvx += (int)r.Next(-10, 11) * 0.05;
            if (mvx > 1) mvx = 1; if (mvx < -1) mvx = -1;
            mvy += (int)r.Next(-10, 11) * 0.05;
            if (mvy > 1) mvy = 1; if (mvy < -1) mvy = -1;
        }
    }
    for (int i = 0; i < W / 4; i++)
    {
        // ★GenVars.worldSurface（=Terrain 游走终值 num3w，TerrainPass.cs:235）**非**
        // Main.worldSurface（=max+25）——JunglePass.cs:220 用的是 GenVars 值！掷骰数
        // 相同（每样本恒 1 颗）但 y 映射不同 → 拒绝采样落点不同、清墙区域平移
        //（流哈希不变、墙网分叉，j_h12 起拒绝次数才真正分叉）。
        int holeLo = (int)num3w + 10;
        int hx = (int)r.Next(20, W - 20), hy = (int)r.Next(holeLo, H - 200);
        while (!(wal[hy * W + hx] == 64 || wal[hy * W + hx] == 15))
        { hx = (int)r.Next(20, W - 20); hy = (int)r.Next(holeLo, H - 200); }
        MudWallRunner(hx, hy);
    }
    JSeg("j_holes");
    // GenerateFinishingTouches（cs:219-280）
    int fx = oldX, fy = oldY;
    for (int i = 0; (double)i <= 20.0 * ws; i++)
    {
        fx += (int)r.Next((int)(-5 * ws), (int)(6 * ws));
        fy += (int)r.Next((int)(-5 * ws), (int)(6 * ws));
        TileRunner(fx, fy, (int)r.Next(40, 100), (int)r.Next(300, 500), 59);
    }
    JSeg("j_fin1");
    for (int j = 0; (double)j <= 10.0 * ws; j++)
    {
        int c2x = oldX + (int)r.Next(-(int)(600 * ws), (int)(600 * ws));
        int c2y = oldY + (int)r.Next(-(int)(200 * ws), (int)(200 * ws));
        while (c2x < 1 || c2x >= W - 1 || c2y < 1 || c2y >= H - 1 || typ[c2y * W + c2x] != 59)
        { c2x = oldX + (int)r.Next(-(int)(600 * ws), (int)(600 * ws)); c2y = oldY + (int)r.Next(-(int)(200 * ws), (int)(200 * ws)); }
        for (int k = 0; (double)k < 8.0 * ws; k++)
        {
            c2x += (int)r.Next(-30, 31); c2y += (int)r.Next(-30, 31);
            int type = (int)r.Next(7) == 0 ? -2 : -1;
            TileRunner(c2x, c2y, (int)r.Next(10, 20), (int)r.Next(30, 70), type);
        }
    }
    JSeg("j_fin2");
    for (int l = 0; (double)l <= 300.0 * ws; l++)
    {
        int c3x = oldX + (int)r.Next(-(int)(600 * ws), (int)(600 * ws));
        int c3y = oldY + (int)r.Next(-(int)(200 * ws), (int)(200 * ws));
        while (c3x < 1 || c3x >= W - 1 || c3y < 1 || c3y >= H - 1 || typ[c3y * W + c3x] != 59)
        { c3x = oldX + (int)r.Next(-(int)(600 * ws), (int)(600 * ws)); c3y = oldY + (int)r.Next(-(int)(200 * ws), (int)(200 * ws)); }
        int sStr = (int)r.Next(4, 10), sStp = (int)r.Next(5, 30);
        TileRunner(c3x, c3y, sStr, sStp, 1);
        int gate = (int)r.Next(4);
        if (gate == 0)
        { int gt = (int)r.Next(63, 69); int gx = c3x + (int)r.Next(-1, 2); int gy = c3y + (int)r.Next(-1, 2); int gstr = (int)r.Next(3, 7); int gstp = (int)r.Next(4, 8);
          TileRunner(gx, gy, gstr, gstp, gt); }
    }
    JSeg("j_end");
}
Checkpoint("jungle");

Replay(); // ▶pass 头重播：MudCavesToJungleGrass cs:12499
// ================= MudCavesToJungleGrass（cs:12499-12530，零 RNG 状态机）=================
{

    void SpreadGrass(int i, int j)
    {
        if (i < 10 || i >= W - 10 || j < 10 || j >= H - 10) return; // InWorld(i,j,10)
        int ci = j * W + i;
        if (act[ci] == 0 || typ[ci] != 59) return;
        int x0 = Math.Max(0, i - 1), x1 = Math.Min(W, i + 2);
        int y0 = Math.Max(0, j - 1), y1 = Math.Min(H, j + 2);
        bool enclosed = true;
        for (int k = x0; k < x1; k++)
        {
            for (int l = y0; l < y1; l++)
            {
                int wi = l * W + k;
                if (act[wi] == 0 || !IsSolidT(typ[wi])) enclosed = false;
                if (liqT[wi] == 1 && liq[wi] > 0) { enclosed = true; break; } // lava 只 break 内层
            }
        }
        if (enclosed || !CanBeCleared(typ[ci])) return;
        typ[ci] = 60;
        for (int m = x0; m < x1; m++)
            for (int n = y0; n < y1; n++)
            {
                int ni = n * W + m;
                if (act[ni] == 1 && typ[ni] == 59 && grassSpread < 1000)
                {
                    grassSpread++;
                    SpreadGrass(m, n);
                    grassSpread--;
                }
            }
    }
    for (int i = 0; i < W; i++)
        for (int j = 0; j < H; j++)
            if (act[j * W + i] == 1) { grassSpread = 0; SpreadGrass(i, j); }
    // ScanTileColumnAndRemoveClumps（cs:10164-10192 + tileCounter cs:10029-10070）
    const int CMAX = 20;
    int[] cx = new int[CMAX], cy = new int[CMAX];
    int cn = 0;
    void Flood(int x, int y)
    {
        if (cn >= CMAX || x < 5 || x >= W - 5 || y < 5 || y >= H - 5) return;
        int i = y * W + x;
        if (act[i] == 0 || !IsSolidT(typ[i]) || !CanBeCleared(typ[i])) return;
        for (int n = 0; n < cn; n++) if (cx[n] == x && cy[n] == y) return;
        cx[cn] = x; cy[cn] = cn >= 0 ? y : y; cn++;
        Flood(x - 1, y); Flood(x + 1, y); Flood(x, y - 1); Flood(x, y + 1);
    }
    for (int x = 10; x < W - 10; x++)
    {
        int run = 0, runY = 0;
        for (int y = 10; y < H - 10; y++)
        {
            int i = y * W + x;
            if (act[i] == 1 && IsSolidT(typ[i]) && CanBeCleared(typ[i]))
            {
                if (run == 0) runY = y;
                run++;
                continue;
            }
            if (run > 0 && run < CMAX)
            {
                cn = 0;
                Flood(x, runY);
                if (cn < CMAX) for (int n = 0; n < cn; n++) act[cy[n] * W + cx[n]] = 0;
            }
            run = 0;
        }
    }
}
Checkpoint("mudcaves");

Replay(); // ▶pass 头重播：DesertBiome cs:12532（整 pass 一次）
// ================= Desert Sub-A（DesertBiome pass cs:12532 + DesertDescription + SandMound）=================
// Sub-B（DesertHive）与 Sub-C（入口 4 形状）转录至 Checkpoint("desertdone")。
// ★cs:12537 pass 首句 `Main.tileSolid[484] = false`：滚动仙人掌自本 pass 起生成期
// 恒非实心（此后 cs:15114/15831/16292 均为冗余重放，无 =true）——AddTileVariance
// 装饰门禁的 SolidTile2/SolidTile 查询读的就是这个翻转态，SOLID 必须同步摘除，
// 否则已放置的 484 会被当实心底座（原版拒放 484/485/187）。
SOLID.Remove((ushort)484);
// DesertDescription 字段（DesertDescription.cs:73-83；普通世界 num7=0）
int dBC = 0, dBR = 0, dX = 0, dTop = 0, dW = 0, dH = 0, dHiveTop = 0;
int[] SurfFromArea(int startX, int width)
{
    int half = H / 2;
    var arr = new int[width];
    for (int i = 0; i < width; i++)
    {
        int x = startX + i;
        bool flag = false; int y = half + 50;
        if (x >= 0 && x < W)
        {
            for (int j = 50; j < 50 + half; j++)
            {
                int ti = j * W + x;
                if (act[ti] == 1)
                {
                    if (typ[ti] == 189 || typ[ti] == 196 || typ[ti] == 460 || typ[ti] == 717 || typ[ti] == 718 || typ[ti] == 719) flag = false;
                    else if (!flag) { y = j; flag = true; }
                }
                if (!flag) y = half + 50;
            }
        }
        arr[i] = y;
    }
    return arr;
}
(int[], double, int) SurfStats(int[] hs)
{
    long sum = 0; int mn = int.MaxValue, mx = 0;
    foreach (var v in hs) { sum += v; mn = Math.Min(mn, v); mx = Math.Max(mx, v); }
    int cap = worldSurface - 10;
    if (mx > cap) mx = cap;
    return (hs, (double)sum / hs.Length, mx);
}
bool DesertPlaceMound(int x)
{
    double factor = W / 4200.0;
    int blockCols = (int)(80.0 * factor);
    int blockRows = (int)(((double)r.NextDouble() * 0.5 + 1.5) * 170.0 * factor);
    int dw = (int)(4.0 * blockCols), dh = (int)(2.0 * blockRows);
    int ox = x - dw / 2;
    var pre = SurfFromArea(ox - 5, dw + 10);
    var (_, avg, bottom) = SurfStats(pre);
    for (int i = ox; i < ox + dw; i++)
    {
        if (i < 0 || i >= W) continue;
        ushort t = typ[bottom * W + i];
        if (t == 59 || t == 60 || t == 161 || t == 147) return false;
    }
    int topY = (int)(avg + (double)bottom) / 2;
    int hiveTop = topY + (int)r.Next(40, 60);
    int desertH = hiveTop + dh / 2 - topY;
    int moundH = Math.Min(desertH, dh / 2);
    int moundBottom = topY + moundH;
    int sandBottom = topY + desertH;
    int coarse = 0, fine = 0;
    for (int i = -5; i < dw + 5; i++)
    {
        int cx = ox + i;
        double tv = Math.Abs((i + 5) / (double)(dw + 10)) * 2.0 - 1.0;
        tv = Math.Clamp(tv, -1.0, 1.0);
        if (i % 3 == 0) { coarse += (int)r.Next(-1, 2); coarse = Math.Clamp(coarse, -10, 10); }
        fine += (int)r.Next(-1, 2); fine = Math.Clamp(fine, -10, 10);
        double prof = Math.Sqrt(1.0 - tv * tv * tv * tv);
        int surfY = moundBottom - (int)(prof * moundH) + coarse;
        if (Math.Abs(tv) < 1.0 && cx >= 0 && cx < W)
        {
            double ramp = (Math.Abs(tv) - 0.5) / 0.3;
            int val = Math.Min(10 + (int)((double)topY - ramp * ramp * ramp * 20.0) + fine, surfY);
            int si = Math.Clamp(i + 5, 0, pre.Length - 1);
            for (int j = pre[si] - 1; j < val; j++)
            {
                if (j < 0 || j >= H) continue;
                act[j * W + cx] = 0;
                wal[j * W + cx] = 0;
            }
        }
        for (int y = surfY + (sandBottom - surfY) - 1; y >= surfY; y--)
        {
            if (y < 0 || y >= H) continue;
            typ[y * W + cx] = 53; act[y * W + cx] = 1; liq[y * W + cx] = 0;
            SquareWallFrameDraw(cx, y);   // PlaceSandColumn 尾（SandMound.cs:73，F 批掷骰还原）
        }
    }
    dBC = blockCols; dBR = blockRows; dX = ox; dTop = topY; dW = dw; dH = dh; dHiveTop = hiveTop;
    return true;
}
{
    int halfW = W / 2;
    int side = dungeonRight ? 1 : -1;
    int tries = 0, flips = 0; bool skipCheck = false;
    int num4 = (int)r.Next(0, halfW) / 8 + halfW / 8;
    int dx0 = halfW + num4 * -side;
    while (!DesertPlaceMound(dx0))
    {
        num4 = (int)r.Next(0, halfW) / 2 + halfW / 8 + (int)r.Next(0, tries / 12);
        dx0 = halfW + num4 * -side;
        if (++tries > W / 4)
        {
            side = -side;
            tries = 0;
            if (++flips >= 2) skipCheck = true;
        }
        if (skipCheck) { DesertPlaceMound(dx0); break; }
    }
}
Checkpoint("desertmound");

// ================= Desert Sub-C 入口（DesertBiome.cs:22-40 + Biomes/Desert/*Entrance.cs）=================
// ChanceOfEntrance 被 Configuration.json 覆盖为 0.5（代码默认 0.3333 是坑）
// ExportDescriptionToEngine（DesertBiome.cs:54-56）：CombinedArea.Inflate(10,10)
dsX = dX - 10; dsY = dTop - 10; dsR = dX + dW + 10; dsB = dTop + dHiveTop + dH - dTop + 10;
int[] dSurf2 = SurfFromArea(dX - 5, dW + 10);   // UpdateSurfaceMap（DesertBiome.cs:22）
int DSurf(int ax) => dSurf2[ax - (dX - 5)];      // SurfaceMap.this[absoluteX]
WC.A = act; WC.T = typ; WC.Wl = wal; WC.L = liq; WC.R = r; WC.SOLID = SOLID; WC.W = W; WC.H = H;
WC.Hf = half; WC.Sl = slope; WC.SqWF = SquareWallFrameDraw; WC.SmoothSelf = SmoothSlopeDesert;

// ---- ChambersEntrance.cs 1:1 ----
void DesertChambers()
{
    int num = (dX + dW / 2) + (int)r.Next(-40, 41);       // Desert.Center.X + Next(-40,41)
    int px = num, py = DSurf(num);
    var shapeData = new HashSet<long>();
    var data = new HashSet<long>();
    int ox = px, oy = py + 2;
    GW.GenCircle(ox, oy, 24, 12, GW.Chain(new GW.BlotchesA(), GW.Out(new GW.SetTileA(53), shapeData)));
    int hnum = dHiveTop - py;                             // Hive.Top - position.Y
    int num2 = (int)r.Next(2) != 0 ? 1 : -1;
    var list = new List<(double x, double y, double dir)> { (px + -num2 * 26, (double)(py - 8), (double)num2) };
    int num3 = (int)r.Next(2, 4);
    for (int i = 0; i < num3; i++)
    {
        int num4 = (int)((double)(i + 1) / (double)num3 * (double)hnum) + (int)r.Next(-8, 9);
        int num5 = num2 * (int)r.Next(20, 41);
        int num6 = (int)r.Next(18, 29);
        GW.GenCircle(px, py, num6 / 2, 3, GW.Chain(new GW.OffsetA(num5, num4), new GW.BlotchesA(), GW.Out(new GW.ClearA(), data), new GW.PlaceWallA(187)));
        list.Add((num5 + num6 / 2 * -num2 + px, (double)(num4 + py), (double)(-num2)));
        num2 *= -1;
    }
    GW.GenOutline(px, py, data, GW.Chain(new GW.ExpandA(1), new GW.OnlyTilesA(53), new GW.SetTileA(397), new GW.PlaceWallA(187)));
    GA pairAct = GW.Chain(new GW.IsSolidA(), new GW.BlotchesA(), new GW.ClearA(), new GW.ExpandA(1), new GW.PlaceWallA(187), new GW.OnlyTilesA(53), new GW.SetTileA(397));
    for (int j = 1; j < list.Count; j++)
    {
        var pa = list[j - 1]; var pb = list[j];
        double connLen = Math.Abs(pb.x - pa.x) * 1.5;
        for (double t = 0.0; t <= 1.0; t += 0.02)
        {
            double ax = pa.x + pa.dir * connLen * t, ay = pa.y;
            double bx = pb.x + pb.dir * connLen * (1.0 - t), by = pb.y;
            double cx = pa.x + (pb.x - pa.x) * t, cy = pa.y + (pb.y - pa.y) * t;   // Lerp(p0,p1,t)
            double dx = ax + (cx - ax) * t, dy = ay + (cy - ay) * t;                // Lerp(v,v3,t)
            double ex = cx + (bx - cx) * t, ey = cy + (by - cy) * t;                // Lerp(v3,v2,t)
            double fx = dx + (ex - dx) * t, fy = dy + (ey - dy) * t;                // Lerp(v4,v5,t)
            GW.GenRectWH((int)fx, (int)fy, 2, 4, pairAct);
        }
    }
    GW.GenRect(ox, oy, -29, -12, 29, 0, GW.Chain(new GW.NotInShapeA(shapeData), new GW.ExpandA(1), new GW.PlaceWallA(0)));
}

// ---- AnthillEntrance.cs 1:1 ----
void DesertAnthill()
{
    int num = (int)r.Next(2, 4);
    for (int i = 0; i < num; i++)
    {
        int holeRadius = (int)r.Next(15, 18);
        int num2 = (int)((double)(i + 1) / (double)(num + 1) * (double)(dW + 10)) + dX;  // Surface.Width=dW+10
        DesertAnthillAt(num2, DSurf(num2), holeRadius);
    }
}
void DesertAnthillAt(int px, int py, int holeRadius)
{
    var data = new HashSet<long>();
    int ox = px, oy = py + 6;
    GW.GenTail(ox, oy, holeRadius * 2, 0.0, -(double)holeRadius * 1.5, GW.Out(new GW.SetTileA(53), data));
    GA pairA = GW.Chain(new GW.BlotchesA(), new GW.IsSolidA(), new GW.ClearA(), new GW.PlaceWallA(187));
    GA pairB = GW.Chain(new GW.IsSolidA(), new GW.ClearA(), new GW.PlaceWallA(187));
    GA pairC = GW.Chain(new GW.IsSolidA(), new GW.SetTileA(397), new GW.PlaceWallA(187));
    GA pairD = GW.Chain(new GW.SkipWallsA(187), new GW.SetTileA(53));
    GA pairE = new GW.PlaceWallA(187);
    int num = px;
    for (int i = py - holeRadius - 3; i < dHiveTop + (py - dTop) * 2 + 12; i++)
    {
        GW.GenRectWH(num, i, 1, 1, i < py ? pairB : pairA);
        GW.GenCircle(num, i, 2, 3, pairC);
        if (i % 3 == 0 && i >= py)
        {
            num += (int)r.Next(-1, 2);
            GW.GenRectWH(num, i, 1, 1, pairA);
            if (i >= py + 5)
            {
                GW.GenCircle(num, i, holeRadius, 3, pairD);
                GW.GenCircle(num, i, holeRadius - 2, 3, pairE);
            }
            GW.GenCircle(num, i, 2, 3, pairC);
        }
    }
    GW.GenCircle(ox, oy - (int)((double)holeRadius * 1.5) + 3, holeRadius / 2, holeRadius / 3, GW.Chain(new GW.ClearTileA(), new GW.ExpandA(1), new GW.PlaceWallA(0)));
    // AnthillEntrance.cs:52：All(data)+Smooth（F 批——坡面写入改写后续门禁，不可省略）
    GW.GenAll(ox, oy, data, new GW.SmoothA());
}

// ---- LarvaHoleEntrance.cs 1:1 ----
void DesertLarvaHole()
{
    int num = (int)r.Next(2, 4);
    for (int i = 0; i < num; i++)
    {
        int holeRadius = (int)r.Next(13, 16);
        int num2 = (int)((double)(i + 1) / (double)(num + 1) * (double)(dW + 10)) + dX;
        DesertLarvaAt(num2, DSurf(num2), holeRadius);
    }
}
void DesertLarvaAt(int px, int py, int holeRadius)
{
    var data = new HashSet<long>();
    GW.GenRect(px, py, -holeRadius, -holeRadius * 2, holeRadius, 0, GW.Out(new GW.ClearA(), data));
    GW.GenTail(px, py, holeRadius * 2, 0.0, (double)holeRadius * 1.5, GW.Out(new GW.ClearA(), data));
    // LarvaHoleEntrance.cs:29：All(data)+Offset(0,1)+Expand(1)+IsSolid+Smooth（带邻）
    GW.GenAll(px, py, data, GW.Chain(new GW.OffsetA(0, 1), new GW.ExpandA(1), new GW.IsSolidA(), new GW.SmoothA(true)));
    GA pairA = GW.Chain(new GW.BlotchesA(), new GW.IsSolidA(), new GW.ClearA(), new GW.PlaceWallA(187));
    GA pairB = GW.Chain(new GW.IsSolidA(), new GW.SetTileA(397), new GW.PlaceWallA(187));
    int num = px;
    for (int i = py + (int)((double)holeRadius * 1.5); i < dHiveTop + (py - dTop) * 2 + 12; i++)
    {
        GW.GenRectWH(num, i, 1, 1, pairA);
        GW.GenCircle(num, i, 2, 3, pairB);
        if (i % 3 == 0)
        {
            num += (int)r.Next(-1, 2);
            GW.GenRectWH(num, i, 1, 1, pairA);
            GW.GenCircle(num, i, 2, 3, pairB);
        }
    }
    GW.GenAll(px, py + 2, data, new GW.PlaceWallA(0));
}

// ---- PitEntrance.cs 1:1（零掷骰）----
double PitSmootherStep(double delta)
{
    delta = Math.Clamp(delta, 0.0, 1.0);
    return 1.0 - Math.Cos(delta * 3.1415927410125732) * 0.5 - 0.5;
}
double PitScale(double yProgress)
    => yProgress < 0.6 ? 1.0 : (1.0 - PitSmootherStep((yProgress - 0.6) / 0.4)) * 0.5 + 0.5;
void DesertPit()
{
    int holeRadius = (int)r.Next(6, 9);
    int px = dX + dW / 2, py = DSurf(dX + dW / 2);        // CombinedArea.Center.X
    for (int i = -holeRadius - 3; i < holeRadius + 3; i++)
    {
        int cx = i + px;
        if (cx < 0 || cx >= W) continue;
        int sj = DSurf(cx);
        for (int j = sj; j <= dHiveTop + 10; j++)
        {
            if (j < 0 || j >= H) continue;
            double value = Math.Clamp((double)(j - sj) / (double)(dHiveTop - dTop), 0.0, 1.0);
            int num3 = (int)(PitScale(value) * (double)holeRadius);
            int ti = j * W + cx;
            if (Math.Abs(i) < num3) { act[ti] = 0; typ[ti] = 0; wal[ti] = 0; liq[ti] = 0; }        // ClearEverything
            else if (Math.Abs(i) < num3 + 3 && value > 0.35) { typ[ti] = 397; act[ti] = 1; liq[ti] = 0; }  // ResetToType(397)
            double num4 = Math.Abs((double)i / (double)holeRadius);
            num4 *= num4;
            if (Math.Abs(i) < num3 + 3 && (double)(j - py) > 15.0 - 3.0 * num4)
            {
                wal[ti] = 187;
                SquareWallFrameDraw(cx, j - 1);   // PitEntrance.cs 墙带写后 SquareWallFrame(x,j-1)+(x,j)
                SquareWallFrameDraw(cx, j);
            }
        }
    }
    holeRadius += 4;
    for (int k = -holeRadius; k < holeRadius; k++)
    {
        int cx = k + px;
        if (cx < 0 || cx >= W) continue;
        int num5 = Math.Min(10, (holeRadius - Math.Abs(k)) * (holeRadius - Math.Abs(k)));
        for (int l = 0; l < num5; l++)
        {
            int y = l + DSurf(cx);
            if (y < 0 || y >= H) continue;
            int ti = y * W + cx;
            act[ti] = 0; typ[ti] = 0; wal[ti] = 0; liq[ti] = 0;
        }
    }
}

if ((double)r.NextDouble() <= 0.5)
{
    switch ((int)r.Next(4))
    {
        case 0: DesertChambers(); break;
        case 1: DesertAnthill(); break;
        case 2: DesertLarvaHole(); break;
        case 3: DesertPit(); break;
    }
}
Checkpoint("desertentrance");

// 沙漠装饰放置（AddTileVariance 第二遍；与 JS DesertPass.placeDeco 同锚：
// 底行锚 yBottom、向上 fh 行；越界整组放弃——JS 侧 return 语义一致）
void PlaceDesertDeco(int dx0, int dyBot, ushort dtile, int dfw, int dfh, int fxBase = -1)
{
    for (int ddx = 0; ddx < dfw; ddx++)
        for (int ddy = 0; ddy < dfh; ddy++)
        {
            int dax = dx0 + ddx, day = dyBot - ddy;
            if (dax < 0 || day < 0 || dax >= W || day >= H) return;
            act[day * W + dax] = 1;
            typ[day * W + dax] = dtile;
            // 帧写（187 帧组：fx=style*54+列*18，fy=自底向上 (1-ddy)*18——Check3x2 重建用）
            if (fxBase >= 0) { frX[day * W + dax] = (ushort)(fxBase + ddx * 18); frY[day * W + dax] = (ushort)((dfh - 1 - ddy) * 18); }
        }
}

// ================= Desert Sub-B Hive（DesertHive.cs 1:1）=================
{
    // ---- ClusterGroup.Generate（椭圆散点→深度2 DFS→AttemptClaim→≥4 重组）----
    var dhMap = new bool[dBC, dBR];
    {
        int e1 = dBC / 2 - 1, e2 = dBR / 2 - 1;
        int e3 = (e1 + 1) * (e1 + 1);
        for (int ei = 0; ei <= e2 * 2; ei++)      // 原版 i ∈ [0, 2*(H/2-1)]——末行不散点！
        {
            double e4 = (double)e1 / (double)e2 * (double)(ei - e2);
            int e5 = Math.Min(e1, (int)Math.Sqrt((double)e3 - e4 * e4));
            for (int ej = e1 - e5; ej <= e1 + e5; ej++)
                dhMap[ej, ei] = (int)r.Next(2) == 0;
        }
    }
    var dhPCs = new List<List<(int x, int y)>>();
    void dhSearch(int x, int y, int level, List<(int x, int y)> pc)
    {
        pc.Add((x, y));
        dhMap[x, y] = false;
        level--;
        if (level == -1) return;
        if (x > 0 && dhMap[x - 1, y]) dhSearch(x - 1, y, level, pc);
        if (x < dBC - 1 && dhMap[x + 1, y]) dhSearch(x + 1, y, level, pc);
        if (y > 0 && dhMap[x, y - 1]) dhSearch(x, y - 1, level, pc);
        if (y < dBR - 1 && dhMap[x, y + 1]) dhSearch(x, y + 1, level, pc);
    }
    for (int sk = 0; sk < dBC; sk++)
        for (int sl = 0; sl < dBR; sl++)
            if (dhMap[sk, sl] && (int)r.Next(2) == 0)
            {
                var spc = new List<(int x, int y)>();
                dhSearch(sk, sl, 2, spc);
                if (spc.Count > 2) dhPCs.Add(spc);
            }
    var dhIdx = new int[dBC, dBR];
    for (int fm = 0; fm < dBC; fm++)
        for (int fn = 0; fn < dBR; fn++)
            dhIdx[fm, fn] = -1;
    for (int fc = 0; fc < dhPCs.Count; fc++)
        foreach (var fp in dhPCs[fc]) dhIdx[fp.x, fp.y] = fc;
    void dhClaim(int x, int y, int index)
    {
        int cn = dhIdx[x, y];
        if (cn == -1 || cn == index) return;
        int cv = (int)r.Next(2) == 0 ? -1 : index;
        foreach (var cp in dhPCs[cn]) dhIdx[cp.x, cp.y] = cv;
    }
    for (int gc = 0; gc < dhPCs.Count; gc++)
        foreach (var gp in dhPCs[gc])
        {
            if (dhIdx[gp.x, gp.y] == -1) break;
            int gi = dhIdx[gp.x, gp.y];
            if (gp.x > 0) dhClaim(gp.x - 1, gp.y, gi);
            if (gp.x < dBC - 1) dhClaim(gp.x + 1, gp.y, gi);
            if (gp.y > 0) dhClaim(gp.x, gp.y - 1, gi);
            if (gp.y < dBR - 1) dhClaim(gp.x, gp.y + 1, gi);
        }
    {
        foreach (var pc0 in dhPCs) pc0.Clear();
        for (int rx = 0; rx < dBC; rx++)
            for (int ry = 0; ry < dBR; ry++)
                if (dhIdx[rx, ry] != -1) dhPCs[dhIdx[rx, ry]].Add((rx, ry));
        foreach (var pc1 in dhPCs)
            if (pc1.Count < 4) pc1.Clear();
    }
    var dhClusters = new List<List<(double x, double y)>>();
    foreach (var pc2 in dhPCs)
    {
        if (pc2.Count <= 0) continue;
        var cl = new List<(double x, double y)>();
        foreach (var bp in pc2)
            cl.Add((bp.x + ((double)r.NextDouble() - 0.5) * 0.5, bp.y + ((double)r.NextDouble() - 0.5) * 0.5));
        dhClusters.Add(cl);
    }

    // ---- PlaceClustersArea（场强分层；shell 类型骰与 0.25 门用 FastRandom，非 genRand！）----
    var dhFr = new FR((ulong)(long)seed).Mod(57005UL);
    // ★G 批：postEffectMap（DesertHive.cs:193-198/310/314/345/361/388）——各层 ResetToType/
    //  ClearEverything 的格标 Smooth（tier3.5 恒标），循环外统一 Tile.SmoothSlope
    // （:213-222）——坡面/半砖是后续 AddTileVariance 门禁的一等输入（#19 残余根因）
    var dhSmooth = new bool[dW + 40, dH + 40];
    for (int hi = dX - 20; hi < dX + dW + 20; hi++)
    {
        for (int hj = dHiveTop - 20; hj < dHiveTop + dH + 20; hj++)
        {
            if (hi < 1 || hi >= W - 1 || hj < 1 || hj >= H - 1) continue;   // InWorld(i,j,1)
            int hti = hj * W + hi;
            double f1 = 0.0; int f2 = -1; double f3 = 0.0;
            ushort hType = 53;
            if (dhFr.Next(3) == 0) hType = 397;
            int n4 = hi - dX, n5 = hj - dHiveTop;
            double vx = ((double)n4 - 2.0) / (double)dW * (double)dBC;   // (p-BlockScale/2)/Hive*Cluster
            double vy = ((double)n5 - 1.0) / (double)dH * (double)dBR;
            for (int hk = 0; hk < dhClusters.Count; hk++)
            {
                var hcl = dhClusters[hk];
                if (Math.Abs(hcl[0].x - vx) > 10.0 || Math.Abs(hcl[0].y - vy) > 10.0) continue;
                double f6 = 0.0;
                foreach (var hb in hcl)
                {
                    double ddx = hb.x - vx, ddy = hb.y - vy;
                    f6 += 1.0 / (ddx * ddx + ddy * ddy);
                }
                if (f6 > f1) { if (f1 > f3) f3 = f1; f1 = f6; f2 = hk; }
                else if (f6 > f3) f3 = f6;
            }
            double f7 = f1 + f3;
            double hex = ((double)n4 - 2.0) / (double)dW * 2.0 - 1.0;
            double hey = ((double)n5 - 1.0) / (double)dH * 2.0 - 1.0;
            bool hEdge = Math.Sqrt(hex * hex + hey * hey) >= 0.8;        // Vector2D.Length()
            bool hFlag2 = true;
            if (f7 > 3.5)
            {
                act[hti] = 0; typ[hti] = 0; wal[hti] = 0; liq[hti] = 0;  // ClearEverything
                half[hti] = 0; slope[hti] = 0;
                wal[hti] = 187;
                if (f2 % 15 == 2) { typ[hti] = 404; act[hti] = 1; liq[hti] = 0; half[hti] = 0; slope[hti] = 0; }  // ResetToType
                dhSmooth[n4 + 20, n5 + 20] = true;                       // :314 恒标
            }
            else if (f7 > 1.8)
            {
                wal[hti] = 187;
                if ((double)hj < (double)worldSurface) liq[hti] = 0;     // else lava()：liq 量不变
                else liqT[hti] = 1;                                      // ★lava 类型位（JS liquidType=2）
                if (!hEdge || act[hti] != 0) { typ[hti] = 396; act[hti] = 1; liq[hti] = 0; half[hti] = 0; slope[hti] = 0; dhSmooth[n4 + 20, n5 + 20] = true; }  // :345
            }
            else if (f7 > 0.7 || !hEdge)
            {
                wal[hti] = 216;
                liq[hti] = 0;
                if (!hEdge || act[hti] != 0) { typ[hti] = hType; act[hti] = 1; liq[hti] = 0; half[hti] = 0; slope[hti] = 0; dhSmooth[n4 + 20, n5 + 20] = true; }  // :361
            }
            else if (f7 > 0.25)
            {
                var hFr2 = dhFr.ModXY(n4, n5);
                double f8 = (f7 - 0.25) / 0.45;
                if (hFr2.NextDouble() < f8)
                {
                    wal[hti] = 187;
                    if ((double)hj < (double)worldSurface) liq[hti] = 0;
                    else liqT[hti] = 1;                                  // ★lava 类型位
                    if (act[hti] != 0) { typ[hti] = hType; act[hti] = 1; liq[hti] = 0; half[hti] = 0; slope[hti] = 0; dhSmooth[n4 + 20, n5 + 20] = true; }  // :388
                }
            }
            else hFlag2 = false;
            // hFlag2 → UpdateDesertHiveBounds（纯边界追踪，无哈希效应）
        }
    }
    // PlaceClusters 尾 postEffect 循环（DesertHive.cs:213-222）：标记格 SmoothSlope
    for (int hi = dX - 20; hi < dX + dW + 20; hi++)
        for (int hj = dHiveTop - 20; hj < dHiveTop + dH + 20; hj++)
            if (dhSmooth[hi - dX + 20, hj - dHiveTop + 20]) SmoothSlopeDesert(hi, hj);

    // ---- AddTileVariance（DesertHive.cs:413-499）----
    for (int vi = -20; vi < dW + 20; vi++)
    {
        for (int vj = -20; vj < dH + 20; vj++)
        {
            int vx2 = vi + dX, vy2 = vj + dHiveTop;
            if (vx2 < 1 || vx2 >= W - 1 || vy2 < 1 || vy2 >= H - 1) continue;
            int vti = vy2 * W + vx2;
            // ★SolidTile(Tile)（cs:70018）五门：含 !half && slope==0——PlaceClusters 尾
            // SmoothSlope 给壳面铺了坡面/半砖，酥化判定必须含坡位（G 批，曾 53>397×739 残差）
            bool vs1 = Solid5Gen(vx2, vy2 + 1);
            bool vs2 = Solid5Gen(vx2, vy2 + 2);
            if (typ[vti] == 53 && (!vs1 || !vs2)) typ[vti] = 397;
        }
    }
    // ★placeTight（ShimmerPass 1:1，G 批替换旧哈希镜像）：SolidTile 锚门禁含 slope/half，
    // 放置落 165 → 尾部 CheckStalactite（坡位锚在门口即拦）；帧写入 frX/frY。
    Func<int, int, bool> SolidAt = (sx, sy) => Solid5Gen(sx, sy);
    Func<int, int, bool> FreeAt = (fx, fy) => fx >= 0 && fx < W && fy >= 0 && fy < H && act[fy * W + fx] == 0;
    // Place2x2（WorldGen.cs:51352）门禁镜像：2x2 区全空 + 双底列 nactive&&(solid||tileTable)
    //（区内无 table 类；SolidTile2 的 slope==0 以坡度不建模近似）。过门才落格（原版 return）。
    Func<int, int, bool> P2Gate = (ax, ay) =>
    {
        if (ax < 5 || ax > W - 5 || ay < 5 || ay > H - 5) return false;
        for (int k = 0; k < 2; k++)
        {
            if (!FreeAt(ax - 1 + k, ay - 1) || !FreeAt(ax - 1 + k, ay)) return false;
            if (!SolidAt(ax - 1 + k, ay + 1)) return false;
        }
        return true;
    };
    // Place3x2（WorldGen.cs:52097）flag2 门禁镜像：3x2 区全空 + 三列底 SolidTile2 +
    // 187 专属底 Boulders 禁——任一失败整组不放
    Func<int, int, bool> P3Gate = (ax, ay) =>
    {
        if (ax < 5 || ax > W - 5 || ay < 5 || ay > H - 5) return false;
        for (int k = -1; k <= 1; k++)
        {
            if (!FreeAt(ax + k, ay - 1) || !FreeAt(ax + k, ay)) return false;
            int bi = (ay + 1) * W + (ax + k);
            ushort bt = typ[bi];
            if (bt == 138 || bt == 484 || bt == 664 || bt == 665 || bt == 711 || bt == 712 || bt == 713 || bt == 714 || bt == 715 || bt == 716) return false;
            if (!SolidAt(ax + k, ay + 1)) return false;
        }
        return true;
    };
    // PlaceObject→TileObjectData[485]（TileObjectData.cs:3511）门禁镜像：CanPlace 先掷
    // 1×Next(4)（RandomStyleRange=4，genRand≡Main.rand :4391，成败都掷）；门禁=4 格全空
    // 且无液体（LavaPlacement 默认 NotAllowed :1768）+ 双底锚 active&&solid
    Func<int, int, bool> P485Gate = (ax, ay) =>
    {
        if (ax < 5 || ax + 2 > W - 5 || ay - 1 < 5 || ay + 1 > H - 5) return false;
        for (int k = 0; k < 2; k++)
        {
            if (!FreeAt(ax + k, ay - 1) || !FreeAt(ax + k, ay)) return false;
            if (liq[(ay - 1) * W + ax + k] > 0 || liq[ay * W + ax + k] > 0) return false;
        }
        return SolidAt(ax, ay + 1) && SolidAt(ax + 1, ay + 1);
    };
    for (int wk = -20; wk < dW + 20; wk++)
    {
        for (int wl = -20; wl < dH + 20; wl++)
        {
            int wx = wk + dX, wy = wl + dHiveTop;
            if (wx < 5 || wx >= W - 5 || wy < 5 || wy >= H - 5) continue;
            int wti = wy * W + wx;
            if (act[wti] == 0 || typ[wti] != 396) continue;
            bool wFlag = true;
            for (int wn = -1; wn >= -3; wn--)
                if (wy + wn >= 0 && (act[(wy + wn) * W + wx] != 0 || act[(wy + wn) * W + wx + 1] != 0)) { wFlag = false; break; }
            bool wFlag2 = true;
            for (int wm = 1; wm <= 3; wm++)
                if (wy + wm < H && (act[(wy + wm) * W + wx] != 0 || act[(wy + wm) * W + wx + 1] != 0)) { wFlag2 = false; break; }
            // 装饰放置（485/751/484/165/187，DesertHive.cs:466-496）。★2026-08-13：
            // forced 只放行 PlaceTile 入口门，各放置函数自有门禁与锚点几何逐项对齐
            // 1456（PlaceTile :59366 派发）——两侧曾一致无条件落格且锚点列偏 1，
            // 新骰值下对拍 13988 格分叉：
            //   485 → PlaceObject（Origin(0,1)）占 (wx..wx+1)，先掷 Next(4) 再门禁；
            //   751/484 → Place2x2（先 x--/y--）占 (wx-1..wx)，P2Gate；
            //   187 → Place3x2 占 (wx-1..wx+1)，P3Gate；
            //   165 → PlaceTightMirror（锚=py+(flag?-1:+1)，Next(2)+Next(3) 恒掷）。
            // 哈希只看 type/act，帧不计。187 分支成功后补 Next(6)（原版 cs:494-496）
            if (wFlag && (int)r.Next(20) == 0)
            {
                int wStyle = (int)r.Next(4);
                if ((int)r.Next(30) == 0) { if (P2Gate(wx, wy - 1)) PlaceDesertDeco(wx - 1, wy - 1, 751, 2, 2); }
                else { int _ = (int)r.Next(4); if (P485Gate(wx, wy - 1)) PlaceDesertDeco(wx, wy - 1, 485, 2, 2); }
            }
            else if (wFlag && (int)r.Next(5) == 0) { if (P2Gate(wx, wy - 1)) PlaceDesertDeco(wx - 1, wy - 1, 484, 2, 2); }
            else if ((wFlag ^ wFlag2) && (int)r.Next(5) == 0)
            {
                PlaceTightFull(wx, wFlag ? wy - 1 : wy + 1);
            }
            else if (wFlag && (int)r.Next(5) == 0)
            {
                int wS2 = (int)r.Next(6);
                if (P3Gate(wx, wy - 1))
                {
                    PlaceDesertDeco(wx - 1, wy - 1, 187, 3, 2, 29 * 54 + wS2 * 54);
                    // ★G 批根因③：PlaceTile(187)→SquareTileFrame→TileFrameImportant→Check3x2
                    // 材质复核（cs:49324-49344，style 29-34 底须沙族；404 化石违例击杀六格）
                    Check3x2Kill187(wx, wy - 1);
                }
            }
        }
    }
}
// CleanupArea（DesertBiome.cs:55-71）：Hive±20 逐格 SquareWallFrame——★F 批：每「有墙
// 且非大幅墙」格掷 1×Next(0,3)（曾按「无哈希效应」省略 → pass 尾流错位，下游全偏）。
// TileFrame 生成期零掷（TileFrameCosmetic 被 !generatingWorld 门拦；TileFrameImportant
// 仅 178/苔藓/仙人掌三支掷——沙漠区无涉）。
// ★检查点位对齐：JS caves-checkpoint 的 deserthive/desertdone 快照均在
// runDesertEntrancesAndHive 返回后（含 CleanupArea）——cleanup 须在两个检查点之前。
for (int ci = dX - 20; ci < dX + dW + 20; ci++)
    for (int cj = dHiveTop - 20; cj < dHiveTop + dH + 20; cj++)
        if (ci > 0 && ci < W - 1 && cj > 0 && cj < H - 1) SquareWallFrameDraw(ci, cj);
Checkpoint("deserthive");
if (Environment.GetEnvironmentVariable("HIVE_DUMP") != null) {
    var hb = new byte[W * H * 2]; System.Buffer.BlockCopy(typ, 0, hb, 0, hb.Length);
    File.WriteAllBytes(Environment.GetEnvironmentVariable("HIVE_DUMP"), hb);
    File.WriteAllText(Environment.GetEnvironmentVariable("HIVE_DUMP") + ".act", string.Join("", act.Select(a => a == 0 ? "0" : "1")));
    return;
}
Checkpoint("desertdone");   // CleanupArea 已在 deserthive 前执行（见上——JS 快照点口径）

Replay(); // ▶pass 头重播：GlowingMushroomPatches cs:12581
// ================= Pass 20 GlowingMushroomPatches（cs:12581-12709 + ShroomPatch cs:80540 + SpreadGrass cs:75210）=================
void SpreadGrassGen(int gi, int gj, int gdirt, int ggrass, bool grepeat = true)
{
    // SpreadGrass（cs:75210-75324）1:1。isGenerating=true、growGrassUnderground=false。
    if (gi < 10 || gi >= W - 10 || gj < 10 || gj >= H - 10) return;   // InWorld(i,j,10)
    int gi2 = gj * W + gi;
    if (act[gi2] == 0 || typ[gi2] != gdirt) return;
    if (ggrass == 199 || ggrass == 23)
    {
        // cs:75223-75229：生成期邪恶草——中央 10%（(0.45X, 0.55X]）与滩带（beachDistance=380）内禁长
        if (((double)gi > (double)W * 0.45 && (double)gi <= (double)W * 0.55) || gi < BEACH_DISTANCE || gi >= W - BEACH_DISTANCE) return;
    }
    else if (typ[gi2] != gdirt || act[gi2] == 0 || ((double)gj >= worldSurface && gdirt == 0))
    {
        return;   // growGrassUnderground=false → 直接 return
    }
    int gx0 = Math.Max(0, gi - 1), gx1 = Math.Min(W, gi + 2);
    int gy0 = Math.Max(0, gj - 1), gy1 = Math.Min(H, gj + 2);
    bool gEnclosed = true;
    for (int gk = gx0; gk < gx1; gk++)
        for (int gl = gy0; gl < gy1; gl++)
        {
            int gti = gl * W + gk;
            if (act[gti] == 0 || !SOLID.Contains(typ[gti])) gEnclosed = false;
            if (liqT[gti] == 1 && liq[gti] > 0) { gEnclosed = true; break; }   // lava
        }
    if (gEnclosed || NOT_CLEAR.Contains(typ[gi2])) return;    // CanBeClearedDuringGeneration
    // cs:75266：向日葵 27 在头顶 → 邪恶草族（23/661/199/662/109）禁长（生成期无 27，零影响保门）
    if ((ggrass == 23 || ggrass == 661 || ggrass == 199 || ggrass == 662 || ggrass == 109) && typ[(gj - 1) * W + gi] == 27) return;
    typ[gi2] = (ushort)ggrass;
    if (!grepeat) return;
    for (int gm = gx0; gm < gx1; gm++)
        for (int gn = gy0; gn < gy1; gn++)
        {
            int gni = gn * W + gm;
            if (act[gni] != 0 && typ[gni] == gdirt && grassSpread < 1000)
            {
                grassSpread++;
                SpreadGrassGen(gm, gn, gdirt, ggrass, true);
                grassSpread--;
            }
        }
}
void ShroomPatch(int si, int sj)
{
    double sn = (int)r.Next(80, 100);
    double sn2 = (int)r.Next(20, 26);
    double sn3 = W / 4200.0;
    sn *= sn3; sn2 *= sn3;
    double sn4 = sn2 - 1.0, sn5 = sn;
    double svx = si, svy = sj - sn2 * 0.3;
    double sv2x = (int)r.Next(-100, 101) * 0.005, sv2y = (int)r.Next(-200, -100) * 0.005;
    while (sn > 0.0 && sn2 > 0.0)
    {
        sn -= (int)r.Next(3);
        sn2 -= 1.0;
        int sx0 = Math.Max(0, (int)(svx - sn * 0.5)), sx1 = Math.Min(W, (int)(svx + sn * 0.5));
        int sy0 = Math.Max(0, (int)(svy - sn * 0.5)), sy1 = Math.Min(H, (int)(svy + sn * 0.5));
        sn5 = sn * (int)r.Next(80, 120) * 0.01;
        for (int sk = sx0; sk < sx1; sk++)
            for (int sl = sy0; sl < sy1; sl++)
            {
                double sd0 = Math.Abs((double)sk - svx);
                double sd1 = Math.Abs(((double)sl - svy) * 2.3);
                double sd2 = Math.Sqrt(sd0 * sd0 + sd1 * sd1);
                int sti = sl * W + sk;
                if (sd2 < sn5 * 0.8 && liqT[sti] == 1) liq[sti] = 0;    // tile.lava()
                if (sd2 < sn5 * 0.2 && (double)sl < svy)
                {
                    act[sti] = 0;
                    if (wal[sti] > 0) wal[sti] = 80;
                }
                else if (sd2 < sn5 * 0.4 * (0.95 + (double)r.NextDouble() * 0.1))
                {
                    typ[sti] = 59;
                    if (sn2 == sn4 && (double)sl > svy) act[sti] = 1;
                    if (wal[sti] > 0) wal[sti] = 80;
                }
            }
        svx += sv2x; svy += sv2y;
        svx += sv2x;                                  // 原版 val+=val2 后再 val.X+=val2.X（X 双倍步进）
        sv2x += (int)r.Next(-100, 110) * 0.005;
        sv2y -= (int)r.Next(110) * 0.005;
        if (sv2x > -0.5 && sv2x < 0.5) sv2x = sv2x < 0.0 ? -0.5 : 0.5;
        if (sv2x > 0.5) sv2x = 0.5;
        if (sv2x < -0.5) sv2x = -0.5;
        if (sv2y > 0.5) sv2y = 0.5;
        if (sv2y < -0.5) sv2y = -0.5;
        for (int sm = 0; sm < 2; sm++)
        {
            int s13 = (int)svx + (int)r.Next(-20, 20);
            int s14 = (int)svy + (int)r.Next(0, 20);
            while (s13 >= 0 && s13 < W && s14 >= 0 && s14 < H && act[s14 * W + s13] == 0 && typ[s14 * W + s13] != 59)
            { s13 = (int)svx + (int)r.Next(-20, 20); s14 = (int)svy + (int)r.Next(0, 20); }
            TileRunner(s13, s14, (int)r.Next(10, 20), (int)r.Next(10, 20), 59, false, 0.0, 2.0, true);
        }
    }
}
{
    double mnCount = W / 700.0;
    if (mnCount > 50) mnCount = 50;                  // GenVars.maxMushroomBiomes = 50
    var mushPts = new List<(int x, int y)>();
    int mushN = 0;
    // UndergroundDesertLocation 见顶级 dsX/dsY/dsR/dsB（沙漠段落盘后回填）
    for (int mk = 0; (double)mk < mnCount; mk++)
    {
        int m2 = 0; bool mflag = true;
        while (mflag)
        {
            int m3 = (int)r.Next((int)(W * 0.2), (int)(W * 0.8));
            if (m2 > W / 4) m3 = (int)r.Next((int)(W * 0.025), (int)(W * 0.975));
            int m4 = (int)r.Next(rockLayer + 50, H - 300);   // Main.rockLayer
            mflag = false;
            for (int ml = m3 - 100; ml < m3 + 100; ml += 3)
                for (int mm = m4 - 100; mm < m4 + 100; mm += 3)
                {
                    if (ml >= 0 && ml < W && mm >= 0 && mm < H)
                    {
                        int mti = mm * W + ml;
                        if (act[mti] != 0)
                        {
                            ushort mtt = typ[mti];
                            if (mtt == 147 || mtt == 161 || mtt == 162 || mtt == 60 || mtt == 368 || mtt == 367) { mflag = true; break; }
                        }
                        if (ml >= dsX && ml < dsR && mm >= dsY && mm < dsB) { mflag = true; break; }
                    }
                    else { mflag = true; break; }
                }
            if (!mflag)
                for (int mp = 0; mp < mushN; mp++)
                    if (Math.Sqrt((double)((mushPts[mp].x - m3) * (mushPts[mp].x - m3) + (mushPts[mp].y - m4) * (mushPts[mp].y - m4))) < 500.0) mflag = true;
            if (!mflag && mushN < 50)
            {
                ShroomPatch(m3, m4);
                for (int mq = 0; mq < 5; mq++) ShroomPatch(m3 + (int)r.Next(-40, 41), m4 + (int)r.Next(-40, 41));
                mushPts.Add((m3, m4)); mushN++;
            }
            m2++;
            if (m2 > W / 2) break;
        }
    }
    // SpreadGrass 扫描（cs:12721-12730 普通世界分支；InWorld(i,j,50)）
    for (int sgx = 0; sgx < W; sgx++)
        for (int sgy = worldSurface; sgy < H; sgy++)
        {
            int sgti = sgy * W + sgx;
            if (sgx >= 50 && sgx < W - 50 && sgy >= 50 && sgy < H - 50 && act[sgti] != 0)
                SpreadGrassGen(sgx, sgy, 59, 70, grepeat: false);   // cs:12717 repeat:false
        }
    // 蘑菇草饰面第二循环（cs:12731-12769）：KillTile/PlaceTile(59)/Next(4) 散点
    for (int h2x = 0; h2x < W; h2x++)
        for (int h2y = worldSurface; h2y < H; h2y++)
        {
            int h2ti = h2y * W + h2x;
            if (act[h2ti] == 0 || typ[h2ti] != 70) continue;
            for (int ix = h2x - 1; ix <= h2x + 1; ix++)
                for (int iy = h2y - 1; iy <= h2y + 1; iy++)
                {
                    if (ix < 0 || ix >= W || iy < 0 || iy >= H) continue;
                    int iti = iy * W + ix;
                    bool iwL = ix > 0 && act[iy * W + ix - 1] != 0, iwR = ix < W - 1 && act[iy * W + ix + 1] != 0;
                    bool iwU = iy > 0 && act[(iy - 1) * W + ix] != 0, iwD = iy < H - 1 && act[(iy + 1) * W + ix] != 0;
                    if (act[iti] != 0)
                    {
                        // ★K 批：KillTile 生成期语义（cs:63970 尾）= active(false) **且 type=0**
                        //（曾只清 active 留幽灵 70 → 后续 type==70 quirk 读写踩幽灵级联）
                        if (!iwL && !iwR) { act[iti] = 0; typ[iti] = 0; }
                        else if (!iwU && !iwD) { act[iti] = 0; typ[iti] = 0; }
                    }
                    else if (iwL && iwR)
                    {
                        typ[iti] = 59; act[iti] = 1;                    // PlaceTile(59) 默认分支
                        if (ix > 0 && typ[h2y * W + ix - 1] == 70) typ[h2y * W + ix - 1] = 59;
                        if (ix < W - 1 && typ[h2y * W + ix + 1] == 70) typ[h2y * W + ix + 1] = 59;
                    }
                    else if (iwU && iwD)
                    {
                        typ[iti] = 59; act[iti] = 1;
                        // ★K 批竖桥 quirk（cs:12764-12767）：写的 x 是 **ix（被放格列）**、
                        // y 是 h2y±1（锚行）——曾误用锚列 h2x → 偏列一格的 70→59 级联
                        if (h2y > 0 && typ[(h2y - 1) * W + ix] == 70) typ[(h2y - 1) * W + ix] = 59;
                        if (h2y < H - 1 && typ[(h2y + 1) * W + ix] == 70) typ[(h2y + 1) * W + ix] = 59;
                    }
                }
            if ((int)r.Next(4) == 0)
            {
                int scx = h2x + (int)r.Next(-20, 21), scy = h2y + (int)r.Next(-20, 21);
                if (scx >= 0 && scx < W && scy >= 0 && scy < H && typ[scy * W + scx] == 59) typ[scy * W + scx] = 70;
            }
        }
}
Checkpoint("mushroom");

// ================= Pass 21/22 共用：BiomeTileCheck（cs:10949）+ PlaceTight/Stalactite（cs:38329/38353）=================
bool BiomeTileCheck(int bx, int by)
{
    for (int i = bx - 50; i <= bx + 50; i++)
        for (int j = by - 50; j <= by + 50; j++)
        {
            if (i < 0 || i >= W || j < 0 || j >= H) continue;
            int ti = j * W + i;
            if (act[ti] != 0)
            {
                ushort t = typ[ti];
                if (t == 368 || t == 367 || t == 147 || t == 161 || t == 162 || t == 70 || t == 72 || t == 396 || t == 397) return true;
            }
            if (wal[ti] == 187 || wal[ti] == 216) return true;
        }
    return false;
}
bool SolidTileGen(int sx, int sy) => sx >= 0 && sx < W && sy >= 0 && sy < H && act[sy * W + sx] != 0 && SOLID.Contains(typ[sy * W + sx]);
void PlaceStalactite(int x, int y, bool preferSmall, int variation)   // PlaceUncheckedStalactite 全链（帧写入，I/J 批）
{
    PlaceStalactiteFull(x, y, preferSmall, variation);
}
void PlaceTightGen(int tx, int ty)   // cs:38329 → PlaceTightFull（G/I 批全链：含 shimmer/幼虫门+帧+尾查）
{
    PlaceTightFull(tx, ty);
}

Replay(); // ▶pass 头重播：Marble cs:12800
// ================= Pass 21 Marble（cs:12800 + MarbleBiome.cs）=================
bool MarblePlace(int mox, int moy)
{
    if (BiomeTileCheck(mox, moy)) return false;
    int bn = (int)r.Next(80, 150) / 3;
    int bn2 = (int)r.Next(40, 60) / 3;
    int bn3 = (bn2 * 3 - (int)r.Next(20, 30)) / 3;
    int bOX = mox - bn * 3 / 2, bOY = moy - bn2 * 3 / 2;
    // Slab 状态机（MarbleBiome.SlabStates）：0空 1实心 2半砖 3右下 4左下 5右上 6左上
    var slabState = new int[bn + 2, bn2 + 2];
    var slabWall = new bool[bn + 2, bn2 + 2];
    bool GroupSolid(int gxx, int gyy)
    {
        // ★I 批：IsGroupSolid 用 SolidOrSlopedTile（坡面/半砖算实心，无形状门）
        int cnt = 0;
        for (int a = 0; a < 3; a++) for (int b = 0; b < 3; b++) if (SolidOrSlopedGen(gxx + a, gyy + b)) cnt++;
        return cnt > 0;   // scale/4*3 = 0（int 除）
    }
    for (int bi = -1; bi < bn + 1; bi++)
    {
        double bn4 = (double)(bi - bn / 2) / (double)bn + 0.5;
        int bn5 = (int)((0.5 - Math.Abs(bn4 - 0.5)) * 5.0) - 2;
        for (int bj = -1; bj < bn2 + 1; bj++)
        {
            bool bHasWall = true, bFlag = false;
            bool bFlag2 = GroupSolid(bi * 3 + bOX, bj * 3 + bOY);
            int bn6 = Math.Abs(bj - bn2 / 2) - bn3 / 4 + bn5;
            if (bn6 > 3) { bFlag = bFlag2; bHasWall = false; }
            else if (bn6 > 0) { bFlag = bj - bn2 / 2 > 0 || bFlag2; bHasWall = bj - bn2 / 2 < 0 || bn6 <= 2; }
            else if (bn6 == 0) bFlag = (int)r.Next(2) == 0 && (bj - bn2 / 2 > 0 || bFlag2);
            if (Math.Abs(bn4 - 0.5) > 0.35 + (double)r.NextDouble() * 0.1 && !bFlag2) { bHasWall = false; bFlag = false; }
            slabState[bi + 1, bj + 1] = bFlag ? 1 : 0;
            slabWall[bi + 1, bj + 1] = bHasWall;
        }
    }
    bool SlabSolid(int st, int lx, int ly, int scale) => st switch
    {
        0 => false, 1 => true, 2 => ly >= scale / 2, 3 => lx >= scale - ly,
        4 => lx < ly, 5 => lx > ly, 6 => lx < scale - ly, _ => true,
    };
    for (int bk = 0; bk < bn; bk++)          // SmoothSlope（slab 状态形状重分类）
        for (int bl = 0; bl < bn2; bl++)
        {
            int sx2 = bk + 1, sy2 = bl + 1;
            if (slabState[sx2, sy2] == 0) continue;
            bool up = slabState[sx2, sy2 - 1] != 0, dn = slabState[sx2, sy2 + 1] != 0;
            bool lf = slabState[sx2 - 1, sy2] != 0, rt = slabState[sx2 + 1, sy2] != 0;
            int code = ((up ? 1 : 0) << 3) | ((dn ? 1 : 0) << 2) | ((lf ? 1 : 0) << 1) | (rt ? 1 : 0);
            slabState[sx2, sy2] = code switch { 10 => 6, 9 => 5, 6 => 4, 5 => 3, 4 => 2, _ => 1 };
        }
    int bn7 = bn / 2, bn8 = bn2 / 2;
    int bn9 = (bn8 + 1) * (bn8 + 1);
    double bvv = (double)r.NextDouble() * 2.0 - 1.0;
    double bvv2 = (double)r.NextDouble() * 2.0 - 1.0;
    double bvv3 = (double)r.NextDouble() * 2.0 - 1.0;
    double bn11 = 0.0;
    for (int bm = 0; bm <= bn; bm++)
    {
        double bn12 = (double)bn8 / (double)bn7 * (double)(bm - bn7);
        int bn13 = Math.Min(bn8, (int)Math.Sqrt(Math.Max(0.0, (double)bn9 - bn12 * bn12)));
        bn11 = bm >= bn / 2 ? bn11 + (bvv2 + (bvv3 - bvv2) * ((double)bm / (double)(bn / 2) - 1.0))
                            : bn11 + (bvv + (bvv2 - bvv) * ((double)bm / (double)(bn / 2)));
        for (int bnn = bn8 - bn13; bnn <= bn8 + bn13; bnn++)
        {
            int pOX = bm * 3 + bOX, pOY = bnn * 3 + bOY + (int)bn11;
            int pst = slabState[bm + 1, bnn + 1];
            bool pWall = slabWall[bm + 1, bnn + 1];
            int pn4 = 0, pn5 = 3;             // PlaceSlab(scale=3)
            for (int pi = -1; pi < 4; pi++)
            {
                if ((pi == -1 || pi == 3) && (int)r.Next(2) == 0) continue;
                if ((int)r.Next(2) == 0) pn4--;
                if ((int)r.Next(2) == 0) pn5++;
                for (int pj = pn4; pj < pn5; pj++)
                {
                    int px = pOX + pi, py = pOY + pj;
                    if (px < 0 || px >= W || py < 0 || py >= H) continue;
                    int pti = py * W + px;
                    typ[pti] = IsOre(typ[pti]) ? typ[pti] : (ushort)367;   // ResetToType：矿石保留
                    act[pti] = SlabSolid(pst, pi, pj, 3) ? (byte)1 : (byte)0;
                    liq[pti] = 0;
                    half[pti] = 0; slope[pti] = 0;       // ResetToType 清 sTileHeader（I 批）
                    if (pWall) wal[pti] = 178;           // wall 独立字段，ResetToType 不清墙
                    // WorldUtils.TileFrame(frameNeighbors:true)：中心+四邻 165 重查（J 批
                    // CheckStalactite 击杀级联+UpdateStalagtiteStyle 失配掷）
                    Frame165(px, py);
                    Frame165(px + 1, py); Frame165(px - 1, py); Frame165(px, py + 1); Frame165(px, py - 1);
                    // SquareWallFrame 中心格 WallFrame(resetFrame:true) 掷 1×Next(0,3)（I 批）
                    SquareWallFrameRoll(px, py);
                    // Tile.SmoothSlope(applyToNeighbors=true)：写 half/slope（无掷，I 批）
                    SmoothSlopeSlab(px, py);
                    if (Solid5Gen(px, py - 1) && (int)r.Next(4) == 0) PlaceTightGen(px, py);
                    if (Solid5Gen(px, py) && (int)r.Next(4) == 0) PlaceTightGen(px, py - 1);
                }
            }
        }
    }
    return true;
}
{
    int mbCount = (int)r.Next(4, 9);                 // WorldGenRange(4,8,WorldArea) scale=1
    int mbPlaced = 0, mbFails = 0;
    while (mbPlaced < mbCount)
    {
        double mb5 = (double)mbPlaced / (double)mbCount;
        int mbX = 0, mbY = 0; bool mbFlag = false;
        int mb6 = 100;
        while (!mbFlag)
        {
            mb6--;
            if (mb6 <= 0) break;
            int mbx0 = (int)(mb5 * (double)(W - 200)) + 100;
            mbX = (int)r.Next(mbx0, mbx0 + (int)((double)(W - 160) / (double)mbCount));
            int mby0 = (int)gvRockLayer + 20;        // GenVars.rockLayer（raw double 截断）
            mbY = (int)r.Next(mby0, mby0 + (H - ((int)gvRockLayer + 40) - 200));
            while ((double)mbX > W * 0.45 && (double)mbX < W * 0.55) mbX = (int)r.Next(BEACH_DISTANCE, W - BEACH_DISTANCE);
            mbFlag = true;
        }
        mbFails++;
        if (mbFlag && MarblePlace(mbX, mbY)) { mbPlaced++; mbFails = 0; }
        else if (mbFails > W * 10) { mbCount = mbPlaced; mbPlaced++; mbFails = 0; }
    }
}
Checkpoint("marble");

Replay(); // ▶pass 头重播：Granite cs:12884
// ================= Pass 22 Granite（cs:12884 + GraniteBiome.cs）=================
void GranitePlace(int gox0, int goy0)
{
    if (gox0 < 0 || gox0 >= W || goy0 < 0 || goy0 >= H || act[goy0 * W + gox0] != 0) return;
    int gox = gox0 - 100, goy = goy0 - 100;          // 200×200 magma 图
    var gPres = new double[200, 200];
    var gRes = new double[200, 200];
    var gAct = new bool[200, 200];
    for (int a = 0; a < 200; a++)
        for (int b = 0; b < 200; b++)
            gRes[a, b] = Solid5Gen(a + gox, b + goy) ? 4.0 : 1.0;   // SolidTile 五门（I 批 slope 感知）
    // 8 邻域单位向量（Vector2D.Normalize）
    double[] nvx = { -0.7071067811865476, -1, -0.7071067811865476, 0, 0, 0, 0.7071067811865476, 1, 0.7071067811865476 };
    double[] nvy = { -0.7071067811865476, 0, 0.7071067811865476, -1, 0, 1, -0.7071067811865476, 0, 0.7071067811865476 };
    int gx3 = 100, gx4 = 100, gy3 = 100, gy4 = 100;
    // ★BuildMagmaMap（GraniteBiome.cs:96-107）原版语义：target = source 的同值别名
    //（`_targetMagmaMap[i,j] = _sourceMagmaMap[i,j]`，Magma 引用型不可变 → 未写格
    //   恒读初值 Pressure=0/Resistance=1or4/inactive）。此后 300 轮不再全量拷贝，循环只写
    //   被激活/过压力门的格，轮末 Swap（:186-187）：未写格保留 i-2 轮值。
    //   JS 侧已修齐（tPres0/tRes0/tAct0 = Float64Array.from(pres/res/mact) 快照）。
    //   曾镜像 JS 旧偏差置 tRes=0（岩浆以更低压渗入实心岩，花岗岩体偏大）——已翻回。
    var tPres = new double[200, 200];
    var tRes = new double[200, 200];
    var tAct = new bool[200, 200];
    for (int a = 0; a < 200; a++)
        for (int b = 0; b < 200; b++)
        { tPres[a, b] = 0.0; tRes[a, b] = gRes[a, b]; tAct[a, b] = false; }
    for (int it = 0; it < 300; it++)
    {
        for (int j = gx3; j <= gx4; j++)
            for (int k = gy3; k <= gy4; k++)
            {
                if (!gAct[j, k]) continue;
                double sum = 0.0, vx = 0.0, vy = 0.0;
                for (int l = -1; l <= 1; l++)
                    for (int m = -1; m <= 1; m++)
                    {
                        if (l == 0 && m == 0) continue;
                        int vi = (l + 1) * 3 + (m + 1);
                        double np = gPres[j + l, k + m];
                        if (gPres[j, k] > 0.01 && !gAct[j + l, k + m])
                        {
                            if (l == -1) gx3 = Math.Clamp(j + l, 1, gx3); else gx4 = Math.Clamp(j + l, gx4, 198);
                            if (m == -1) gy3 = Math.Clamp(k + m, 1, gy3); else gy4 = Math.Clamp(k + m, gy4, 198);
                            tPres[j + l, k + m] = np;                  // ToFlow(:31)：保压/保阻，置 active——稀疏写下须整格写入 target
                            tRes[j + l, k + m] = gRes[j + l, k + m];
                            tAct[j + l, k + m] = true;
                        }
                        sum += np;
                        vx += np * nvx[vi]; vy += np * nvy[vi];
                    }
                sum /= 8.0;
                if (sum > gRes[j, k])
                {
                    double len = Math.Sqrt(vx * vx + vy * vy) / 8.0;
                    double nv = Math.Max(sum - len - gPres[j, k], 0.0) + len + gPres[j, k] * 0.875 - gRes[j, k];
                    nv = Math.Max(0.0, nv);
                    tPres[j, k] = nv;
                    tRes[j, k] = Math.Max(0.0, gRes[j, k] - nv * 0.02);
                    // GraniteBiome.cs:179 `_targetMagmaMap[j,k]=Magma.CreateFlow(val3,…)`
                    // ——CreateFlow 恒 active:true（granite 首红猎杀 2026-08-17）。
                    // 曾漏写激活位：稀疏双缓冲下本格 target 残留 i-2 轮 inactive 态
                    // → CA 细胞提前死亡、花岗岩体比原版小（truth@22 差 15,546 活性格
                    // +2,383 坡位；JS 侧 MarbleGranitePass.ts 同修注释在案）。
                    tAct[j, k] = true;
                }
            }
        // CreateFlow(25.0) 默认 resistance=0（Magma.cs:34）——中心注入须清 tRes
        //（曾残留初值 1/4，中心压差差一个量级并外传全图）
        if (it < 2) { tPres[100, 100] = 25.0; tRes[100, 100] = 0.0; tAct[100, 100] = true; }
        var sp1 = gPres; gPres = tPres; tPres = sp1;
        var sp2 = gRes; gRes = tRes; tRes = sp2;
        var sp3 = gAct; gAct = tAct; tAct = sp3;
    }
    bool GraniteUseLava()
    {
        if (goy + 100 <= lavaLine - 30) return false;
        for (int a = -50; a < 50; a++)
            for (int b = -50; b < 50; b++)
            {
                int ax = gox + 100 + a, ay = goy + 100 + b;
                if (ax >= 10 && ax < W - 10 && ay >= 10 && ay < H - 10 && act[ay * W + ax] != 0)
                {
                    ushort t = typ[ay * W + ax];
                    if (t == 147 || t == 200 || (t >= 161 && t <= 163)) return false;
                }
            }
        return true;
    }
    bool useLava = GraniteUseLava();
    for (int i = gx3; i <= gx4; i++)
        for (int j = gy3; j <= gy4; j++)
        {
            int tx = gox + i, ty = goy + j;
            if (tx < 10 || tx >= W - 10 || ty < 10 || ty >= H - 10 || !gAct[i, j]) continue;
            int ti = ty * W + tx;
            double gnum = Math.Sin((double)(goy + j) * 0.4) * 0.7 + 1.2;
            double gnum2 = 0.2 + 0.5 / Math.Sqrt(Math.Max(0.0, gPres[i, j] - gRes[i, j]));
            if (Math.Max(1.0 - Math.Max(0.0, gnum * gnum2), gPres[i, j] / 15.0) > 0.35 + (Solid5Gen(tx, ty) ? 0.0 : 0.5))
            {
                typ[ti] = IsOre(typ[ti]) ? typ[ti] : (ushort)368;
                act[ti] = 1; liq[ti] = 0;
                half[ti] = 0; slope[ti] = 0;       // ResetToType 清坡位（I 批）
                wal[ti] = 180;
            }
            else if (gRes[i, j] < 0.01)
            {
                act[ti] = 0;                       // ClearTile
                half[ti] = 0; slope[ti] = 0;       // ClearSlope（I 批）
                wal[ti] = 180;
            }
            if (liq[ti] > 0 && useLava) liqT[ti] = 1;
        }
    // CleanupTiles：3×3 实心邻 <3 的活性花岗岩清除
    var cleanList = new List<(int x, int y)>();
    for (int i = gx3; i <= gx4; i++)
        for (int j = gy3; j <= gy4; j++)
        {
            if (!gAct[i, j]) continue;
            int tx = gox + i, ty = goy + j;
            if (tx < 10 || tx >= W - 10 || ty < 10 || ty >= H - 10 || !Solid5Gen(tx, ty)) continue;   // 五门（I 批）
            int cnt = 0;
            for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) if (Solid5Gen(tx + a, ty + b)) cnt++;
            if (cnt < 3) cleanList.Add((tx, ty));
        }
    foreach (var cp in cleanList) { act[cp.y * W + cp.x] = 0; half[cp.y * W + cp.x] = 0; slope[cp.y * W + cp.x] = 0; wal[cp.y * W + cp.x] = 180; }
    // PlaceDecorations：FastRandom(seed).WithModifier(65440) 独立流
    var gFr = new FR((ulong)(long)seed).Mod(65440UL);
    for (int i = gx3; i <= gx4; i++)
        for (int j = gy3; j <= gy4; j++)
        {
            int tx = gox + i, ty = goy + j;
            if (tx < 10 || tx >= W - 10 || ty < 10 || ty >= H - 10 || !gAct[i, j]) continue;
            // WorldUtils.TileFrame → 165 重查（J 批 GraniteBiome.cs:345）；SquareWallFrame
            // 非零墙掷 1×Next(0,3)（I 批 GraniteBiome.cs:346 每格）
            Frame165(tx, ty);
            SquareWallFrameRoll(tx, ty);
            var gFr2 = gFr.ModXY(tx, ty);
            if (gFr2.Next(8) == 0 && act[ty * W + tx] != 0)
            {
                if (ty + 1 < H && act[(ty + 1) * W + tx] == 0) PlaceStalactite(tx, ty + 1, gFr2.Next(2) == 0, gFr2.Next(3));
                if (ty - 1 >= 0 && act[(ty - 1) * W + tx] == 0) PlaceStalactite(tx, ty - 1, gFr2.Next(2) == 0, gFr2.Next(3));
            }
            if (gFr2.Next(2) == 0) SmoothSlopeSlab(tx, ty);   // Tile.SmoothSlope（GraniteBiome.cs:352，I 批）
        }
}
{
    int gnCount = (int)r.Next(4, 9);                 // WorldGenRange(4,8,WorldWidth) scale=1
    var gnPts = new List<(int x, int y)>();
    int gnPlaced = 0, gnFails = 0;
    while (gnPlaced < gnCount)
    {
        double gn5 = (double)gnPlaced / (double)gnCount;
        int gnX = 0, gnY = 0; bool gnFlag = false;
        int gn7 = 100;
        while (!gnFlag)
        {
            gn7--;
            if (gn7 <= 0) break;
            int gnx0 = (int)(gn5 * (double)(W - 200)) + 100;
            gnX = (int)r.Next(gnx0, gnx0 + (int)((double)(W - 200) / (double)gnCount));
            int gny0 = (int)gvRockLayer + 20;
            gnY = (int)r.Next(gny0, gny0 + (H - ((int)gvRockLayer + 40) - 200));
            while ((double)gnX > W * 0.45 && (double)gnX < W * 0.55) gnX = (int)r.Next(BEACH_DISTANCE, W - BEACH_DISTANCE);
            gnFlag = true;
        }
        gnFails++;
        if (gnFlag && !BiomeTileCheck(gnX, gnY) && !(gnX >= 0 && gnX < W && gnY >= 0 && gnY < H && act[gnY * W + gnX] != 0))
        { gnPts.Add((gnX, gnY)); gnPlaced++; }
        else if (gnFails > W * 10) { gnCount = gnPlaced; gnPlaced++; gnFails = 0; }
    }
    for (int gi = 0; gi < gnCount && gi < gnPts.Count; gi++) GranitePlace(gnPts[gi].x, gnPts[gi].y);
}
Checkpoint("granite");

Replay(); // ▶pass 头重播：FloatingIslands cs:12976
// ================= Pass 23 FloatingIslands（cs:12976 + CloudIsland cs:78618 + CloudLake cs:79068）=================
bool WaterStaysPut(int wx, int wy)   // WillWaterPlacedHereStayPut（cs:79050）
{
    bool Side(int ax, int ay)
    {
        if (ax < 0 || ax >= W || ay < 0 || ay >= H) return false;
        int ti = ay * W + ax;
        return (act[ti] != 0 && SOLID.Contains(typ[ti])) || liq[ti] == 255;
    }
    return Side(wx, wy + 1) && Side(wx - 1, wy) && Side(wx + 1, wy);
}
void CloudIsland(int ci, int cj)
{
    double inum = (int)r.Next(100, 150);
    double inum2 = inum;
    double inum3 = (int)r.Next(20, 30);
    int i4 = ci, i5 = ci, i6 = cj, i7 = cj;
    ushort iTile = 189;
    double ivx = ci, ivy = cj;
    double iv2x = (int)r.Next(-20, 21) * 0.2;
    while (iv2x > -2.0 && iv2x < 2.0) iv2x = (int)r.Next(-20, 21) * 0.2;
    double iv2y = (int)r.Next(-20, -10) * 0.02;
    while (inum > 0.0 && inum3 > 0.0)            // ① 主体云盘
    {
        inum -= (int)r.Next(4);
        inum3 -= 1.0;
        int ix0 = Math.Max(0, (int)(ivx - inum * 0.5)), ix1 = Math.Min(W, (int)(ivx + inum * 0.5));
        int iy0 = Math.Max(0, (int)(ivy - inum * 0.5)), iy1 = Math.Min(H, (int)(ivy + inum * 0.5));
        inum2 = inum * (int)r.Next(80, 120) * 0.01;
        double iTop = ivy + 1.0;
        for (int ik = ix0; ik < ix1; ik++)
        {
            if ((int)r.Next(2) == 0) iTop += (int)r.Next(-1, 2);
            if (iTop < ivy) iTop = ivy;
            if (iTop > ivy + 2.0) iTop = ivy + 2.0;
            for (int im = iy0; im < iy1; im++)
            {
                if ((double)im <= iTop) continue;
                double idx = Math.Abs((double)ik - ivx);
                double idy = Math.Abs((double)im - ivy) * 3.0;
                if (Math.Sqrt(idx * idx + idy * idy) >= inum2 * 0.4) continue;
                if (ik < i4) i4 = ik;
                if (ik > i5) i5 = ik;
                if (im < i6) i6 = im;
                if (im > i7) i7 = im;
                int iti = im * W + ik;
                act[iti] = 1; typ[iti] = iTile;
            }
        }
        ivx += iv2x; ivy += iv2y;
        iv2x += (int)r.Next(-20, 21) * 0.05;
        if (iv2x > 1.0) iv2x = 1.0;
        if (iv2x < -1.0) iv2x = -1.0;
        if (iv2y > 0.2) iv2y = -0.2;
        if (iv2y < -0.2) iv2y = -0.2;
    }
    int ir17 = i4 + (int)r.Next(5);              // ② 底缘雨云凸包
    int ir19 = 0;
    for (; ir17 < i5; ir17 += (int)r.Next(ir19, (int)((double)ir19 * 1.5)))
    {
        int ir18 = i7;
        while (ir17 >= 15 && ir17 < W - 15 && ir18 >= 15 && ir18 < H - 15 && act[ir18 * W + ir17] == 0) ir18--;
        ir18 += (int)r.Next(-3, 4);
        ir19 = (int)r.Next(4, 8);
        int ir20 = iTile;
        if ((int)r.Next(4) == 0) ir20 = 196;
        for (int an = ir17 - ir19; an <= ir17 + ir19; an++)
            for (int ay = ir18 - ir19; ay <= ir18 + ir19; ay++)
            {
                if (ay <= i6 || an < 0 || an >= W || ay < 0 || ay >= H) continue;
                double ddx = Math.Abs(an - ir17);
                double ddy = Math.Abs(ay - ir18) * 2;
                if (Math.Sqrt(ddx * ddx + ddy * ddy) < (double)(ir19 + (int)r.Next(2)))
                {
                    act[ay * W + an] = 1; typ[ay * W + an] = (ushort)ir20;
                }
            }
    }
    inum = (int)r.Next(80, 95);                  // ③ 土芯：云→土(0)
    inum2 = inum;
    inum3 = (int)r.Next(10, 15);
    ivx = ci; ivy = i6;
    iv2x = (int)r.Next(-20, 21) * 0.2;
    while (iv2x > -2.0 && iv2x < 2.0) iv2x = (int)r.Next(-20, 21) * 0.2;
    iv2y = (int)r.Next(-20, -10) * 0.02;
    while (inum > 0.0 && inum3 > 0.0)
    {
        inum -= (int)r.Next(4);
        inum3 -= 1.0;
        int ix0 = Math.Max(0, (int)(ivx - inum * 0.5)), ix1 = Math.Min(W, (int)(ivx + inum * 0.5));
        int iy0 = Math.Max(0, i6 - 1), iy1 = Math.Min(H, (int)(ivy + inum * 0.5));
        inum2 = inum * (int)r.Next(80, 120) * 0.01;
        double iTop2 = ivy + 1.0;
        for (int ik = ix0; ik < ix1; ik++)
        {
            if ((int)r.Next(2) == 0) iTop2 += (int)r.Next(-1, 2);
            if (iTop2 < ivy) iTop2 = ivy;
            if (iTop2 > ivy + 2.0) iTop2 = ivy + 2.0;
            for (int im = iy0; im < iy1; im++)
            {
                if ((double)im <= iTop2) continue;
                int iti = im * W + ik;
                double idx = Math.Abs((double)ik - ivx);
                double idy = Math.Abs((double)im - ivy) * 3.0;
                if (Math.Sqrt(idx * idx + idy * idy) < inum2 * 0.4 && typ[iti] == iTile) typ[iti] = 0;
            }
        }
        ivx += iv2x; ivy += iv2y;
        iv2x += (int)r.Next(-20, 21) * 0.05;
        if (iv2x > 1.0) iv2x = 1.0;
        if (iv2x < -1.0) iv2x = -1.0;
        if (iv2y > 0.2) iv2y = -0.2;
        if (iv2y < -0.2) iv2y = -0.2;
    }
    int ir29 = i4 + (int)r.Next(5);              // ④ 土面云斑
    while (ir29 < i5)
    {
        int ir30 = i7;
        while ((ir30 < 0 || ir30 >= H || ir29 < 0 || ir29 >= W || act[ir30 * W + ir29] == 0 || typ[ir30 * W + ir29] != 0) && ir29 < i5)
        {
            ir30--;
            if (ir30 < i6) { ir30 = i7; ir29 += (int)r.Next(1, 4); }
        }
        if (ir29 >= i5) continue;
        ir30 += (int)r.Next(0, 4);
        int ir31 = (int)r.Next(2, 5);
        for (int an = ir29 - ir31; an <= ir29 + ir31; an++)
            for (int ay = ir30 - ir31; ay <= ir30 + ir31; ay++)
            {
                if (ay <= i6 || an < 0 || an >= W || ay < 0 || ay >= H) continue;
                double ddx = Math.Abs(an - ir29);
                double ddy = Math.Abs(ay - ir30) * 2;
                if (Math.Sqrt(ddx * ddx + ddy * ddy) < (double)ir31) typ[ay * W + an] = iTile;
            }
        ir29 += (int)r.Next(ir31, (int)((double)ir31 * 1.5));
    }
    for (int an = i4 - 20; an <= i5 + 20; an++)  // ⑤ 全实心区填墙 73
        for (int ay = i6 - 20; ay <= i7 + 20; ay++)
        {
            if (an < 0 || an >= W || ay < 0 || ay >= H) continue;
            bool ok = true;
            for (int ox = an - 1; ox <= an + 1; ox++)
                for (int oy = ay - 1; oy <= ay + 1; oy++)
                {
                    if (ox < 0 || ox >= W || oy < 0 || oy >= H) { ok = false; continue; }
                    int oti = oy * W + ox;
                    if (act[oti] == 0 || (wal[oti] > 0 && wal[oti] != 73)) ok = false;
                }
            if (ok) { wal[ay * W + an] = 73; WallFrameDraw(an, ay); }   // cs:78968 SquareWallFrame（G 批——wall73 格必掷）
        }
    for (int ax = i4; ax <= i5; ax++)            // ⑥ 岛面水池
    {
        int ay2 = i6 - 10;
        while (ay2 + 1 < H && act[(ay2 + 1) * W + ax] == 0) ay2++;
        if (ay2 >= i7) continue;
        if (ax < 0 || ax >= W || ay2 + 1 >= H || typ[(ay2 + 1) * W + ax] != iTile) continue;
        if ((int)r.Next(10) == 0)
        {
            int wid = (int)r.Next(1, 3);
            for (int wx = ax - wid; wx <= ax + wid; wx++)
            {
                if (wx < 0 || wx >= W) continue;
                if (ay2 >= 0 && ay2 < H && typ[ay2 * W + wx] == iTile && WaterStaysPut(wx, ay2)) { act[ay2 * W + wx] = 0; liq[ay2 * W + wx] = 255; liqT[ay2 * W + wx] = 0; }
                if (ay2 + 1 < H && typ[(ay2 + 1) * W + wx] == iTile && WaterStaysPut(wx, ay2 + 1)) { act[(ay2 + 1) * W + wx] = 0; liq[(ay2 + 1) * W + wx] = 255; liqT[(ay2 + 1) * W + wx] = 0; }
                if (wx > ax - wid && wx < ax + 2 && ay2 + 2 < H && typ[(ay2 + 2) * W + wx] == iTile && WaterStaysPut(wx, ay2 + 2)) { act[(ay2 + 2) * W + wx] = 0; liq[(ay2 + 2) * W + wx] = 255; liqT[(ay2 + 2) * W + wx] = 0; }
            }
        }
        if (ax >= 0 && ax < W && ay2 >= 0 && ay2 < H)
        {
            if ((int)r.Next(5) == 0 && WaterStaysPut(ax, ay2)) liq[ay2 * W + ax] = 255;
            liqT[ay2 * W + ax] = 0;
        }
    }
    int iPuffs = (int)r.Next(4);                 // ⑦ 岛上方云 puff + 水滴
    for (int ip = 0; ip <= iPuffs; ip++)
    {
        int ipx = (int)r.Next(i4 - 5, i5 + 5);
        int ipy = i6 - (int)r.Next(20, 40);
        int ipr = (int)r.Next(4, 8);
        int ipMat = iTile;
        if ((int)r.Next(2) == 0) ipMat = 196;
        for (int an = ipx - ipr; an <= ipx + ipr; an++)
            for (int ay = ipy - ipr; ay <= ipy + ipr; ay++)
            {
                if (an < 0 || an >= W || ay < 0 || ay >= H) continue;
                double ddx = Math.Abs(an - ipx);
                double ddy = Math.Abs(ay - ipy) * 2;
                if (Math.Sqrt(ddx * ddx + ddy * ddy) < (double)(ipr + (int)r.Next(-1, 2)))
                {
                    act[ay * W + an] = 1; typ[ay * W + an] = (ushort)ipMat;
                }
            }
        for (int an = ipx - ipr + 2; an <= ipx + ipr - 2; an++)
        {
            int ay3 = ipy - ipr;
            while (ay3 < H && act[ay3 * W + an] == 0) ay3++;
            if (an >= 0 && an < W && ay3 >= 0 && ay3 < H && WaterStaysPut(an, ay3))
            {
                act[ay3 * W + an] = 0; liq[ay3 * W + an] = 255; liqT[ay3 * W + an] = 0;
            }
        }
    }
}
void CloudLake(int ci, int cj)
{
    double lnum = (int)r.Next(100, 150);
    double lnum2 = lnum;
    double lnum3 = (int)r.Next(20, 30);
    int l4 = ci, l5 = ci, l6 = cj, l7 = cj;
    ushort lTile = 189;
    double lvx = ci, lvy = cj;
    double lv2x = (int)r.Next(-20, 21) * 0.2;
    while (lv2x > -2.0 && lv2x < 2.0) lv2x = (int)r.Next(-20, 21) * 0.2;
    double lv2y = (int)r.Next(-20, -10) * 0.02;
    while (lnum > 0.0 && lnum3 > 0.0)            // ① 主体云盘（同 CloudIsland）
    {
        lnum -= (int)r.Next(4);
        lnum3 -= 1.0;
        int ix0 = Math.Max(0, (int)(lvx - lnum * 0.5)), ix1 = Math.Min(W, (int)(lvx + lnum * 0.5));
        int iy0 = Math.Max(0, (int)(lvy - lnum * 0.5)), iy1 = Math.Min(H, (int)(lvy + lnum * 0.5));
        lnum2 = lnum * (int)r.Next(80, 120) * 0.01;
        double lTop = lvy + 1.0;
        for (int ik = ix0; ik < ix1; ik++)
        {
            if ((int)r.Next(2) == 0) lTop += (int)r.Next(-1, 2);
            if (lTop < lvy) lTop = lvy;
            if (lTop > lvy + 2.0) lTop = lvy + 2.0;
            for (int im = iy0; im < iy1; im++)
            {
                if ((double)im <= lTop) continue;
                double idx = Math.Abs((double)ik - lvx);
                double idy = Math.Abs((double)im - lvy) * 3.0;
                if (Math.Sqrt(idx * idx + idy * idy) >= lnum2 * 0.4) continue;
                if (ik < l4) l4 = ik;
                if (ik > l5) l5 = ik;
                if (im < l6) l6 = im;
                if (im > l7) l7 = im;
                act[im * W + ik] = 1; typ[im * W + ik] = lTile;
            }
        }
        lvx += lv2x; lvy += lv2y;
        lv2x += (int)r.Next(-20, 21) * 0.05;
        if (lv2x > 1.0) lv2x = 1.0;
        if (lv2x < -1.0) lv2x = -1.0;
        if (lv2y > 0.2) lv2y = -0.2;
        if (lv2y < -0.2) lv2y = -0.2;
    }
    int lr17 = l4 + (int)r.Next(5);              // ② 底缘雨云凸包
    int lr19 = 0;
    for (; lr17 < l5; lr17 += (int)r.Next(lr19, (int)((double)lr19 * 1.5)))
    {
        int lr18 = l7;
        while (lr18 >= 0 && act[lr18 * W + lr17] == 0) lr18--;   // CloudLake 无 InWorld 门
        lr18 += (int)r.Next(-3, 4);
        lr19 = (int)r.Next(4, 8);
        int lr20 = lTile;
        if ((int)r.Next(4) == 0) lr20 = 196;
        for (int an = lr17 - lr19; an <= lr17 + lr19; an++)
            for (int ay = lr18 - lr19; ay <= lr18 + lr19; ay++)
            {
                if (ay <= l6) continue;
                double ddx = Math.Abs(an - lr17);
                double ddy = Math.Abs(ay - lr18) * 2;
                if (Math.Sqrt(ddx * ddx + ddy * ddy) < (double)(lr19 + (int)r.Next(2)))
                {
                    act[ay * W + an] = 1; typ[ay * W + an] = (ushort)lr20;
                }
            }
    }
    lnum = (int)r.Next(80, 95);                  // ③ 湖盆挖除 + 灌水
    lnum2 = lnum;
    lnum3 = (int)r.Next(10, 15);
    lvx = ci; lvy = l6;
    lv2x = (int)r.Next(-20, 21) * 0.2;
    while (lv2x > -2.0 && lv2x < 2.0) lv2x = (int)r.Next(-20, 21) * 0.2;
    lv2y = (int)r.Next(-20, -10) * 0.02;
    while (lnum > 0.0 && lnum3 > 0.0)
    {
        lnum -= (int)r.Next(4);
        lnum3 -= 1.0;
        int ix0 = Math.Max(0, (int)(lvx - lnum * 0.5)), ix1 = Math.Min(W, (int)(lvx + lnum * 0.5));
        int iy0 = Math.Max(0, l6 - 1), iy1 = Math.Min(H, (int)(lvy + lnum * 0.5));
        lnum2 = lnum * (int)r.Next(80, 120) * 0.01;
        double lTop2 = lvy + 1.0;
        for (int ik = ix0; ik < ix1; ik++)
        {
            if ((int)r.Next(2) == 0) lTop2 += (int)r.Next(-1, 2);
            if (lTop2 < lvy) lTop2 = lvy;
            if (lTop2 > lvy + 2.0) lTop2 = lvy + 2.0;
            for (int im = iy0; im < iy1; im++)
            {
                if ((double)im <= lTop2 - 2.0) continue;
                int lti = im * W + ik;
                double idx = Math.Abs((double)ik - lvx);
                double idy = Math.Abs((double)im - lvy) * 3.0;
                if (!(Math.Sqrt(idx * idx + idy * idy) < lnum2 * 0.4) || typ[lti] != lTile) continue;
                act[lti] = 0;
                wal[lti] = 0;
                if (ik - 1 >= 0) wal[im * W + ik - 1] = 0;
                if (ik + 1 < W) wal[im * W + ik + 1] = 0;
                if (im - 1 >= 0) wal[(im - 1) * W + ik] = 0;
                if (ik - 1 >= 0 && im - 1 >= 0) wal[(im - 1) * W + ik - 1] = 0;
                if (ik + 1 < W && im - 1 >= 0) wal[(im - 1) * W + ik + 1] = 0;
                if ((double)im > lTop2 + 1.0)
                {
                    if (WaterStaysPut(ik, im)) liq[lti] = 255;
                    liqT[lti] = 0;
                }
            }
        }
        lvx += lv2x; lvy += lv2y;
        lv2x += (int)r.Next(-20, 21) * 0.05;
        if (lv2x > 1.0) lv2x = 1.0;
        if (lv2x < -1.0) lv2x = -1.0;
        if (lv2y > 0.2) lv2y = -0.2;
        if (lv2y < 0.0) lv2y = 0.0;              // CloudLake 湖盆段 Y 下限 0（非 -0.2）
    }
    for (int an = l4 - 20; an <= l5 + 20; an++)  // ④ 墙 73（同 CloudIsland）
        for (int ay = l6 - 20; ay <= l7 + 20; ay++)
        {
            if (an < 0 || an >= W || ay < 0 || ay >= H) continue;
            bool ok = true;
            for (int ox = an - 1; ox <= an + 1; ox++)
                for (int oy = ay - 1; oy <= ay + 1; oy++)
                {
                    if (ox < 0 || ox >= W || oy < 0 || oy >= H) { ok = false; continue; }
                    int oti = oy * W + ox;
                    if (act[oti] == 0 || (wal[oti] > 0 && wal[oti] != 73)) ok = false;
                }
            if (ok) wal[ay * W + an] = 73;
        }
    for (int ax = l4; ax <= l5; ax++)            // ⑤ 湖面水
    {
        int ay2 = l6 - 10;
        while (ay2 + 1 < H && act[(ay2 + 1) * W + ax] == 0) ay2++;
        if (ay2 >= l7) continue;
        if (ax < 0 || ax >= W || ay2 + 1 >= H || typ[(ay2 + 1) * W + ax] != lTile) continue;
        if ((int)r.Next(10) == 0)
        {
            int wid = (int)r.Next(1, 3);
            for (int wx = ax - wid; wx <= ax + wid; wx++)
            {
                if (wx < 0 || wx >= W) continue;
                if (ay2 >= 0 && ay2 < H && typ[ay2 * W + wx] == lTile && WaterStaysPut(wx, ay2)) { act[ay2 * W + wx] = 0; liq[ay2 * W + wx] = 255; liqT[ay2 * W + wx] = 0; }
                if (ay2 + 1 < H && typ[(ay2 + 1) * W + wx] == lTile && WaterStaysPut(wx, ay2 + 1)) { act[(ay2 + 1) * W + wx] = 0; liq[(ay2 + 1) * W + wx] = 255; liqT[(ay2 + 1) * W + wx] = 0; }
                if (wx > ax - wid && wx < ax + 2 && ay2 + 2 < H && typ[(ay2 + 2) * W + wx] == lTile && WaterStaysPut(wx, ay2 + 2)) { act[(ay2 + 2) * W + wx] = 0; liq[(ay2 + 2) * W + wx] = 255; liqT[(ay2 + 2) * W + wx] = 0; }
            }
        }
        if (ax >= 0 && ax < W && ay2 >= 0 && ay2 < H)
        {
            if ((int)r.Next(5) == 0 && WaterStaysPut(ax, ay2)) liq[ay2 * W + ax] = 255;
            liqT[ay2 * W + ax] = 0;
        }
    }
    // ⑥ 湖上方云 puff（cs:79442-79481，G 批补段）——与 CloudIsland ⑦ 差异：数量
    // Next(1,4)（非 Next(4)）、材质门反向（Next(4)!=0 → 雨云 196，==0 才云 189）。
    // 曾整段缺失 → 湖岛上方 ~76 格雨云 puff + 中心注水丢失（#23 残余）。
    int lPuffs = (int)r.Next(1, 4);
    for (int lp = 0; lp <= lPuffs; lp++)
    {
        int lpx = (int)r.Next(l4 - 5, l5 + 5);
        int lpy = l6 - (int)r.Next(20, 40);
        int lpr = (int)r.Next(4, 8);
        int lpMat = lTile;
        if ((int)r.Next(4) != 0) lpMat = 196;                       // 反向门
        for (int an = lpx - lpr; an <= lpx + lpr; an++)
            for (int ay = lpy - lpr; ay <= lpy + lpr; ay++)
            {
                if (an < 0 || an >= W || ay < 0 || ay >= H) continue;
                double ddx = Math.Abs(an - lpx);
                double ddy = Math.Abs(ay - lpy) * 2;
                if (Math.Sqrt(ddx * ddx + ddy * ddy) < (double)(lpr + (int)r.Next(-1, 2)))
                {
                    act[ay * W + an] = 1; typ[ay * W + an] = (ushort)lpMat;
                }
            }
        for (int an = lpx - lpr + 2; an <= lpx + lpr - 2; an++)     // 中心注水
        {
            int ay3 = lpy - lpr;
            while (ay3 < H && act[ay3 * W + an] == 0) ay3++;
            if (an >= 0 && an < W && ay3 >= 0 && ay3 < H && WaterStaysPut(an, ay3))
            {
                act[ay3 * W + an] = 0; liq[ay3 * W + an] = 255; liqT[ay3 * W + an] = 0;
            }
        }
    }
}
{
    int isCount = (int)(W * 0.0008);              // 3（4200 宽）
    int isLakes = 0;
    int isTotal = isCount + 1;                    // GenVars.skyLakes = 1（4200 宽）
    var isHousesX = new List<int>();
    var isHousesY = new List<int>();
    for (int ii = 0; (double)ii < (double)isTotal; ii++)
    {
        int isBudget = W;
        while (--isBudget > 0)
        {
            bool isOk = true;
            int isX = (int)r.Next((int)(W * 0.1), (int)(W * 0.9));
            while (isX > W / 2 - 150 && isX < W / 2 + 150) isX = (int)r.Next((int)(W * 0.1), (int)(W * 0.9));
            for (int hj = 0; hj < isHousesX.Count; hj++)
                if (isX > isHousesX[hj] - 180 && isX < isHousesX[hj] + 180) { isOk = false; break; }
            if (!isOk) continue;
            isOk = false;
            int isY = 0;
            for (int k = 200; k < worldSurface && k < H; k++)
                if (act[k * W + isX] != 0) { isY = k; isOk = true; break; }
            if (!isOk) continue;
            isBudget = -1;
            int isTop = Math.Min((int)r.Next(90, isY - 100), (int)gvWorldSurfaceLow - 50);
            bool isLake = isLakes >= isCount;
            if (isLake) CloudLake(isX, isTop);
            else CloudIsland(isX, isTop);
            isHousesX.Add(isX); isHousesY.Add(isTop);
            isLakes++;
        }
    }
}
Checkpoint("islands");

Replay(); // ▶pass 头重播：DirtToMud cs:13172
// ================= Pass 24 DirtToMud（cs:13172-13191）=================
{
    double dmCount = (double)(W * H) * 0.001;
    for (int dmi = 0; (double)dmi < dmCount; dmi++)
        TileRunner((int)r.Next(0, W), (int)r.Next((int)gvRockLayerLow, H), (int)r.Next(2, 6), (int)r.Next(2, 40), 59, false, 0.0, 0.0, false, true, 53);
}
Checkpoint("dirttomud");

Replay(); // ▶pass 头重播：Silt cs:13192
// ================= Pass 25 Silt（cs:13192-13231）=================
{
    int siCount = (int)((float)(W * H) * 0.0001f);
    for (int si1 = 0; si1 < siCount; si1++)
    {
        int sx = (int)r.Next(0, W);
        int sy = (int)r.Next((int)gvRockLayerHigh, H);
        if (wal[sy * W + sx] != 187 && wal[sy * W + sx] != 216)
            TileRunner(sx, sy, (int)r.Next(5, 12), (int)r.Next(15, 50), 123);
    }
    int siCount2 = (int)((float)(W * H) * 0.0005f);
    for (int si2 = 0; si2 < siCount2; si2++)
    {
        int sx = (int)r.Next(0, W);
        int sy = (int)r.Next((int)gvRockLayerHigh, H);
        if (wal[sy * W + sx] != 187 && wal[sy * W + sx] != 216)
            TileRunner(sx, sy, (int)r.Next(2, 5), (int)r.Next(2, 5), 123);
    }
}
Checkpoint("silt");

Replay(); // ▶pass 头重播：OresAndShinies cs:13233
// ================= Pass 26 OresAndShinies（cs:13233-13658 普通世界分支）=================
void ShinyBand(double oCount, int yMin, int yMax, int sMin, int sMax, int stMin, int stMax, int oType)
{
    for (int oi = 0; oi < (int)oCount; oi++)   // 原版计数先 (int) 截断（cs:13455）
        TileRunner((int)r.Next(0, W), (int)r.Next(yMin, yMax), (int)r.Next(sMin, sMax), (int)r.Next(stMin, stMax), oType);
}
{
    double area = (double)(W * H);
    ShinyBand(area * 6E-05, (int)gvWorldSurfaceLow, (int)gvWorldSurfaceHigh, 3, 6, 2, 6, oreCu);
    ShinyBand(area * 8E-05, (int)gvWorldSurfaceHigh, (int)gvRockLayerHigh, 3, 7, 3, 7, oreCu);
    ShinyBand(area * 0.0002, (int)gvRockLayerLow, H, 4, 9, 4, 8, oreCu);
    ShinyBand(area * 3E-05, (int)gvWorldSurfaceLow, (int)gvWorldSurfaceHigh, 3, 7, 2, 5, oreFe);
    ShinyBand(area * 8E-05, (int)gvWorldSurfaceHigh, (int)gvRockLayerHigh, 3, 6, 3, 6, oreFe);
    ShinyBand(area * 0.0002, (int)gvRockLayerLow, H, 4, 9, 4, 8, oreFe);
    ShinyBand(area * 2.6E-05, (int)gvWorldSurfaceHigh, (int)gvRockLayerHigh, 3, 6, 3, 6, oreAg);
    ShinyBand(area * 0.00015, (int)gvRockLayerLow, H, 4, 9, 4, 8, oreAg);
    ShinyBand(area * 0.00012, (int)gvRockLayerLow, H, 4, 8, 4, 8, oreAu);
    ShinyBand(area * 0.00017, 0, (int)gvWorldSurfaceLow, 4, 9, 4, 8, oreAg);
    ShinyBand(area * 0.00012, 0, (int)gvWorldSurfaceLow - 20, 4, 8, 4, 8, oreAu);
    // 邪恶矿：crimson→204，否则 22（drunk 分支不适用）
    ShinyBand(area * 2.25E-05, rockLayer, H, 3, 6, 4, 8, crimson ? 204 : 22);
}
Checkpoint("ores");

Replay(); // ▶pass 头重播：Webs cs:13659
// ================= Pass 27 Webs（cs:13659-13696）=================
{
    int wbCount = (int)((double)(W * H) * 0.0006);
    for (int wi = 0; wi < wbCount; wi++)
    {
        int wj = (int)r.Next(20, W - 20);
        int wn = (int)r.Next((int)gvWorldSurfaceHigh, H - 20);
        if (wi < mCaveX.Count) { wj = mCaveX[wi]; wn = mCaveY[wi]; }   // 前 numMCaves 个锚在山洞口
        if (act[wn * W + wj] == 0 && ((double)wn > (double)worldSurface || wal[wn * W + wj] > 0))
        {
            while (act[wn * W + wj] == 0 && wn > (int)gvWorldSurfaceLow) wn--;
            wn++;
            int wdir = (int)r.Next(2) == 0 ? -1 : 1;
            for (; act[wn * W + wj] == 0 && wj > 10 && wj < W - 10; wj += wdir) { }
            wj -= wdir;
            if ((double)wn > (double)worldSurface || wal[wn * W + wj] > 0)
                TileRunner(wj, wn, (int)r.Next(4, 11), (int)r.Next(2, 4), 51, true, wdir, -1.0, false, false, -1);
        }
    }
}
Checkpoint("webs");

// GrowAshTree —— JS TreePass.growTreeWithSettings(ASH_PROFILE) 哈希通道镜像。
// 只需 type/active 落点一致 + 掷骰序一致（帧值不入哈希）：干身行循环的
// num6(含冲突重掷)/num5/左右枝 k、tuft 双门、基座、树冠骰全部照 JS 顺序。
void GrowAshTree(int tx, int ty)
{
    // 越过树苗（灰烬区无树苗 → 立即停）
    int num = ty;
    while (num < H && act[num * W + tx] != 0 && typ[num * W + tx] == 590) num++;   // 树苗 590
    if (num >= H || num < 1) return;
    // 基座上一格三列无液体
    if (liq[(num - 1) * W + tx - 1] != 0 || liq[(num - 1) * W + tx] != 0 || liq[(num - 1) * W + tx + 1] != 0) return;
    int gi = num * W + tx;
    if (act[gi] == 0) return;                                  // 基座须整砖（half/slope 此阶段无）
    if (!TREE_WALLS.Contains(wal[(num - 1) * W + tx])) return; // 墙白名单
    if (typ[gi] != 633) return;                                // AshTreeGroundTest：仅灰烬草
    bool sideFit(int dx) => tx + dx >= 0 && tx + dx < W && act[num * W + tx + dx] != 0 && typ[num * W + tx + dx] == 633;
    if (!sideFit(-1) && !sideFit(1)) return;
    int height = (int)r.Next(7, 13);
    int num4 = height + 4;                                     // TreeTopPaddingNeeded = 4
    if (tx - 2 < 0 || tx + 2 >= W || num - num4 < 0) return;
    for (int ex = tx - 2; ex <= tx + 2; ex++)
        for (int ey = num - num4; ey <= num - 1; ey++)
        {
            int ei = ey * W + ex;
            if (act[ei] == 0) continue;
            if (!EMPTY_ALLOW.Contains(typ[ei])) return;        // EmptyTileCheck 白名单
        }
    void Put(int ax, int ay) { if (ax >= 0 && ax < W && ay >= 0 && ay < H) { typ[ay * W + ax] = 634; act[ay * W + ax] = 1; } }
    bool flagL = false, flagR = false;
    for (int i = num - height; i < num; i++)
    {
        int num5 = (int)r.Next(3);                              // ★cs:30595 先掷帧变体（与 GrowGemTreeFn 同步修正）
        int num6 = (int)r.Next(10);                             // cs:30596 后掷枝型
        if (i == num - 1 || i == num - height) num6 = 0;
        while (((num6 == 5 || num6 == 7) && flagL) || ((num6 == 6 || num6 == 7) && flagR)) num6 = (int)r.Next(10);
        flagL = false; flagR = false;
        if (num6 == 5 || num6 == 7) flagL = true;
        if (num6 == 6 || num6 == 7) flagR = true;
        Put(tx, i);
        if (num6 == 5 || num6 == 7) { int k = (int)r.Next(3); int f = (int)r.Next(3); Put(tx - 1, i); }   // 左枝 2 骰
        if (num6 == 6 || num6 == 7) { int k = (int)r.Next(3); int f = (int)r.Next(3); Put(tx + 1, i); }   // 右枝 2 骰
    }
    // 基座 tuft：两侧地面须灰烬草（GEM_TREE_FIT 口径此处即 633）——地狱腔天然全跳
    bool tuftFit(int dx) => tx + dx >= 0 && tx + dx < W && act[num * W + tx + dx] != 0 && typ[num * W + tx + dx] == 633;
    bool tL = tuftFit(-1), tR = tuftFit(1);
    if ((int)r.Next(3) == 0) tL = false;
    if ((int)r.Next(3) == 0) tR = false;
    if (tR) { int k = (int)r.Next(3); Put(tx + 1, num - 1); }
    if (tL) { int k = (int)r.Next(3); Put(tx - 1, num - 1); }
    int baseK = (int)r.Next(3);                                 // ★cs:30906 无条件掷（与 JS TreePass 同步修正）
    if (tL || tR) Put(tx, num - 1);
    int crownFx = (int)r.Next(13) != 0 ? 22 : 0;               // 帧值不入哈希，仅保骰
    int crownK = (int)r.Next(3);
    Put(tx, num - height);
}

int[] uwConv={0}, uwCand={0}, uwGrow={0};
Replay(); // ▶pass 头重播：Underworld cs:13697
// ================= Pass 28 Underworld（cs:13697-13918 普通世界分支）=================
// ★Liquid.QuickWater(-2)（cs:13788）——H/L 批接线（曾注释「两侧一致省略」被 dump027→028
//   云湖排空证伪：vanilla 在此把云湖水/岩浆板整体沉降，~48.7 万湿格重排）。全程不掷
//   genRand（KillTile 尘掷族走 LiquidSim 私有 mulberry32/生成期零掷，接线零流影响）。
//   SettleWaterAt 落水越 waterLine → 岩浆（Liquid.cs:177-190）；地牢墙豁免本时点可证
//   无操作（地牢墙族 dump027=0，Dungeon pass 32 在其后）——不接线（与 JS 同口径）。
//   AddHellHouses 两侧均为独立槽（本链外）——检查点链一致。
{
    int uwNum = H - (int)r.Next(150, 190);
    int uwNum2 = H - (int)r.Next(40, 70);
    for (int ux = 0; ux < W; ux++)               // ① 灰烬带 + 界下清空
    {
        uwNum += (int)r.Next(-3, 4);
        if (uwNum < H - 190) uwNum = H - 190;
        if (uwNum > H - 160) uwNum = H - 160;
        for (int uy = uwNum - 20 - (int)r.Next(3); uy < H; uy++)
        {
            int uti = uy * W + ux;
            if (uy >= uwNum) { act[uti] = 0; liqT[uti] = 0; liq[uti] = 0; }   // active(false)（type 保留）
            else typ[uti] = 57;                                               // ★只写 type 不激活（原版语义）
        }
    }
    for (int ux = 10; ux < W - 10; ux++)         // ② 岩浆线
    {
        uwNum2 += (int)r.Next(-10, 11);
        if (uwNum2 > H - 60) uwNum2 = H - 60;
        if (uwNum2 < H - 100) uwNum2 = H - 120;
        for (int uy = uwNum2; uy < H - 10; uy++)
        {
            int uti = uy * W + ux;
            if (act[uti] == 0) { liqT[uti] = 1; liq[uti] = 255; }
        }
    }
    for (int ux = 0; ux < W; ux++)               // ③ 1/50 列大灰烬丘陵
    {
        if ((int)r.Next(50) == 0)
        {
            int uy = H - 65;
            while (act[uy * W + ux] == 0 && uy > H - 135) uy--;
            TileRunner((int)r.Next(0, W), uy + (int)r.Next(20, 50), (int)r.Next(15, 20), 1000, 57, true, 0.0, (int)r.Next(1, 3), true);
        }
    }
    // ---- Liquid.QuickWater(-2)（cs:13788，H 批接线；LiquidSim.ts quickWater 1:1）----
    // tilesIgnoreWater(true)（Liquid.cs:68-72）：巨石家族全局非实心（含 484 滚动仙人掌
    // ——地下沙漠大量活性 484，缺此翻转=沙漠水池沉降路径整体错位）；tileSolid[379]=true
    //（379 本就在 SOLID 表）。liquidType 编码：oracle 0水/1岩浆/2蜜/3微光（JS +1）。
    {
        var qwSkip = new HashSet<ushort> { 138, 484, 664, 711, 712, 713, 714, 715, 716, 546 };
        bool QWBlocks(int qx, int qy)
        {
            if (qx < 0 || qy < 0 || qx >= W || qy >= H) return true;
            int qi = qy * W + qx;
            if (act[qi] == 0) return false;                          // nactive：幽灵 type 不算实心
            return SOLID.Contains(typ[qi]) && !qwSkip.Contains(typ[qi]);
        }
        bool QWSolidFull(int qx, int qy)                              // WorldGen.SolidTile 五门
        {
            if (qx < 0 || qy < 0 || qx >= W || qy >= H) return false;
            int qi = qy * W + qx;
            if (act[qi] == 0) return false;
            return SOLID.Contains(typ[qi]) && !qwSkip.Contains(typ[qi]) && half[qi] == 0 && slope[qi] == 0;
        }
        void KillTileGenGrid(int kx, int ky)                          // 生成期 KillTile（无掷，grid-only）
        {
            if (kx < 0 || ky < 0 || kx >= W || ky >= H) return;
            int ki = ky * W + kx;
            if (act[ki] == 0) return;
            if (typ[ki] == 58 && ky > H - 200) { liq[ki] = 128; liqT[ki] = 1; }   // cs:63941 地狱石灌岩浆 128
            act[ki] = 0; typ[ki] = 0; half[ki] = 0; slope[ki] = 0; frX[ki] = 65535; frY[ki] = 65535;
        }
        void LiquidOverwriteStrip(int sx, int sy, int stripType)      // Liquid.cs:1338-1352
        {
            for (int nx = sx; nx >= 0 && liq[sy * W + nx] > 0; nx--) liqT[sy * W + nx] = (byte)stripType;
            for (int nx = sx; nx < W && liq[sy * W + nx] > 0; nx++) liqT[sy * W + nx] = (byte)stripType;
        }
        void CreateMergeTileGen(int mx, int my, int tileType)         // 生成期 → strip（不落块）
        {
            int stripType = -1;
            if (tileType == 229) stripType = 0;                       // 蜂蜜块 → 水
            else if (tileType == 230 || tileType == 56) stripType = 1; // 脆蜂蜜/黑曜石 → 岩浆
            else if (tileType == 659) stripType = 3;                   // Aetherium → 微光
            if (my >= H - 200) stripType = 1;                          // 地狱层强制岩浆
            if (stripType >= 0) LiquidOverwriteStrip(mx, my, stripType);
        }
        void LavaCheckQW(int lx, int ly)
        {
            // 头部沙漠分支（Liquid.cs:1457-1465）：生成期 + 7×7 含墙 187/216 → 整块 7×7
            // 液体类型转岩浆（lava(true) 不动量）——地下沙漠底岩浆池来源（L 批）
            bool desertNear = false;
            for (int dj = ly - 3; dj <= ly + 3 && !desertNear; dj++)
                for (int di = lx - 3; di <= lx + 3; di++)
                {
                    if (di < 0 || dj < 0 || di >= W || dj >= H) continue;
                    ushort dv = wal[dj * W + di];
                    if (dv == 187 || dv == 216) { desertNear = true; break; }
                }
            if (desertNear)
                for (int dj = ly - 3; dj <= ly + 3; dj++)
                    for (int di = lx - 3; di <= lx + 3; di++)
                    {
                        if (di < 0 || dj < 0 || di >= W || dj >= H) continue;
                        liqT[dj * W + di] = 1;
                    }
            if (QWSolidFull(lx, ly)) return;                          // 半砖/坡面放行（Liquid.cs:898）
            int i5 = ly * W + lx, il = i5 - 1, ir = i5 + 1, iu = i5 - W, id = i5 + W;
            byte lq = liq[il], rq = liq[ir], uq = liq[iu], dq = liq[id];
            byte lt = liqT[il], rt = liqT[ir], ut = liqT[iu], dt = liqT[id];
            if ((lq > 0 && lt != 1) || (rq > 0 && rt != 1) || (uq > 0 && ut != 1))
            {
                // 情形 A：左右/上方有非岩浆液体 → 产物在岩浆格（Liquid.cs:905-959）
                int sum = 0, type = 56;
                if (lt != 1) { sum += lq; liq[il] = 0; }
                if (rt != 1) { sum += rq; liq[ir] = 0; }
                if (ut != 1) { sum += uq; liq[iu] = 0; }
                if (lt == 2 || rt == 2 || ut == 2) type = 230;        // 蜂蜜在场 → 脆蜂蜜
                if (lt == 3 || rt == 3 || ut == 3) type = 659;        // 微光优先级最高（L1443-1451）
                if (sum < 24) return;                                  // 1456 统一阈值 24
                if (act[i5] != 0 && !OBSIDIAN_KILL.Contains(typ[i5])) return;
                liq[i5] = 0; liqT[i5] = 0;
                CreateMergeTileGen(lx, ly, type);
            }
            else
            {
                if (dq <= 0 || dt == 1) return;
                // 情形 B：仅下方有水/蜂蜜/微光 → 产物在下方格（Liquid.cs:961-1014）
                bool belowAct = act[id] != 0;
                ushort belowT = typ[id], selfT = typ[i5];
                bool containerOk = act[i5] != 0 && CONTAINER_S.Contains(selfT) && !(belowAct && CONTAINER_S.Contains(belowT));
                if (selfT != 1 && belowAct && CUT_S.Contains(belowT)) KillTileGenGrid(lx, ly + 1);  // 下方裁切植物
                if (act[id] != 0 && !OBSIDIAN_KILL.Contains(belowT) && !containerOk) return;
                if (liq[i5] < 24) { liq[i5] = 0; liqT[i5] = 0; return; }
                int type2 = dt == 3 ? 659 : dt == 2 ? 230 : 56;
                liq[i5] = 0; liqT[i5] = 0;
                liq[id] = 0; liqT[id] = 0;
                CreateMergeTileGen(lx, ly + 1, type2);
            }
        }
        // honey/shimmer 检查体（Liquid.cs:1017-1115 同构）：本时点（pass 28）全图无蜂蜜/微光
        // 液体（蜂巢 #47/微光 #40 均在其后）——attemptToMove 的 diff 门恒 false，检查体
        // 不可达，两侧一致不落地（JS 同链调用在 LiquidSim 内可达但零触发）。
        void AttemptToMoveLiquid(int ax, int ay, byte srcType, byte targetType)
        {
            bool srcIs = srcType == targetType;
            bool Diff(int dx, int dy)
            {
                if (dx < 0 || dy < 0 || dx >= W || dy >= H) return false;
                int di = dy * W + dx;
                return liq[di] > 0 && ((liqT[di] == targetType) != srcIs);
            }
            if (Diff(ax - 1, ay)) { if (srcIs) LavaCheckQW(ax, ay); else LavaCheckQW(ax - 1, ay); }
            else if (Diff(ax + 1, ay)) { if (srcIs) LavaCheckQW(ax, ay); else LavaCheckQW(ax + 1, ay); }
            else if (Diff(ax, ay - 1)) { if (srcIs) LavaCheckQW(ax, ay); else LavaCheckQW(ax, ay - 1); }
            else if (Diff(ax, ay + 1)) { if (srcIs) LavaCheckQW(ax, ay); else LavaCheckQW(ax, ay + 1); }
        }
        void SettleWaterAt(int ox, int oy)
        {
            int oi = oy * W + ox;
            if (liq[oi] == 0) return;
            int X = ox, Y = oy;
            byte srcType = liqT[oi];
            byte type = srcType;
            int liquid = liq[oi];
            liq[oi] = 0;
            bool flag1 = true;
            for (; ; )
            {
                bool flag2 = false;
                while (Y < H - 5 && liq[(Y + 1) * W + X] == 0 && !QWBlocks(X, Y + 1)) { Y++; flag2 = true; flag1 = false; }
                // Liquid.cs:177-190：本轮有下落、源非蜜非微光 → 越过 waterLine 落点转岩浆
                if (flag2 && srcType != 2 && srcType != 3)
                {
                    if (Y > waterLine) type = 1;
                    // 地牢豁免（:186-188）本时点无地牢墙——不接线
                }
                int dir = -1, step = 0, lastDir = -1, lastStep = 0;
                bool hitL = false, hitR = false, dropped = false;
                for (; ; )
                {
                    int probeX = X + step * dir;
                    if (probeX < 0 || probeX >= W)
                    {
                        if (dir == -1) hitL = true; else hitR = true;
                        if (hitL && hitR) break;
                        if (hitR) { dir = -1; step++; }
                        else if (hitL) { if (dir == 1) step++; dir = 1; }
                        else { if (dir == 1) step++; dir = -dir; }
                        continue;
                    }
                    int ci = Y * W + probeX;
                    if (liq[ci] == 0) { lastDir = dir; lastStep = step; }
                    if (dir == -1 && probeX < 5) hitL = true;
                    else if (dir == 1 && probeX > W - 5) hitR = true;
                    int bi = (Y + 1) * W + probeX;
                    if (liq[bi] != 0 && liq[bi] != 255 && liqT[bi] == type)
                    {
                        int t = 255 - liq[bi];
                        if (t > liquid) t = liquid;
                        liq[bi] += (byte)t; liquid -= t;
                        if (liquid == 0) break;
                    }
                    if (Y >= H - 5 || liq[bi] != 0 || QWBlocks(probeX, Y + 1))
                    {
                        int aheadX = X + (step + 1) * dir;
                        bool inRange = aheadX >= 0 && aheadX < W;
                        int nAmt = inRange ? liq[Y * W + aheadX] : 0;
                        bool nSolid = inRange ? QWBlocks(aheadX, Y) : true;
                        if ((nAmt != 0 && (!flag1 || dir != 1)) || nSolid)
                        {
                            if (dir == 1) hitR = true; else hitL = true;
                        }
                        if (hitL && hitR) break;
                        if (hitR) { dir = -1; step++; }
                        else if (hitL) { if (dir == 1) step++; dir = 1; }
                        else { if (dir == 1) step++; dir = -dir; }
                    }
                    else { dropped = true; break; }
                }
                X = Math.Max(2, Math.Min(W - 3, X + lastStep * lastDir));
                if (liquid != 0 && dropped) Y++;
                else break;
            }
            int fi = Y * W + X;
            liq[fi] = (byte)liquid;
            liqT[fi] = type;
            if (liq[fi] > 0)
            {
                AttemptToMoveLiquid(X, Y, srcType, 1);   // 岩浆邻
                AttemptToMoveLiquid(X, Y, srcType, 2);   // 蜂蜜邻（本时点不可达）
                AttemptToMoveLiquid(X, Y, srcType, 3);   // 微光邻（本时点不可达）
            }
        }
        for (int qy = H - 3; qy >= 3; qy--)
            for (int qx = 4; qx < W - 4; qx++)
                if (liq[qy * W + qx] != 0) SettleWaterAt(qx, qy);
    }
    for (int ux = 0; ux < W; ux++)               // ④ 1/13 列灰烬柱 + 横团 + 挖掘
    {
        if ((int)r.Next(13) == 0)
        {
            int uy = H - 65;
            while ((liq[uy * W + ux] > 0 || act[uy * W + ux] != 0) && uy > H - 140) uy--;
            TileRunner(ux, uy - (int)r.Next(2, 5), (int)r.Next(5, 30), 1000, 57, true, 0.0, (int)r.Next(1, 3), true);
            double uwS = (int)r.Next(1, 3);
            if ((int)r.Next(3) == 0) uwS *= 0.5;
            if ((int)r.Next(2) == 0)
                TileRunner(ux, uy - (int)r.Next(2, 5), (int)((double)(int)r.Next(5, 15) * uwS), (int)((double)(int)r.Next(10, 15) * uwS), 57, true, 1.0, 0.3);
            if ((int)r.Next(2) == 0)
            {
                uwS = (int)r.Next(1, 3);
                TileRunner(ux, uy - (int)r.Next(2, 5), (int)((double)(int)r.Next(5, 15) * uwS), (int)((double)(int)r.Next(10, 15) * uwS), 57, true, -1.0, 0.3);
            }
            TileRunner(ux + (int)r.Next(-10, 10), uy + (int)r.Next(-10, 10), (int)r.Next(5, 15), (int)r.Next(5, 10), -2, false, (int)r.Next(-1, 3), (int)r.Next(-1, 3));
            if ((int)r.Next(3) == 0)
                TileRunner(ux + (int)r.Next(-10, 10), uy + (int)r.Next(-10, 10), (int)r.Next(10, 30), (int)r.Next(10, 20), -2, false, (int)r.Next(-1, 3), (int)r.Next(-1, 3));
            if ((int)r.Next(5) == 0)
                TileRunner(ux + (int)r.Next(-15, 15), uy + (int)r.Next(-15, 10), (int)r.Next(15, 30), (int)r.Next(5, 20), -2, false, (int)r.Next(-1, 3), (int)r.Next(-1, 3));
        }
    }
    for (int un = 0; un < W; un++)               // ⑤ 随机小挖掘
        TileRunner((int)r.Next(20, W - 20), (int)r.Next(H - 180, H - 10), (int)r.Next(2, 7), (int)r.Next(2, 7), -2);
    for (int ux = 0; ux < W; ux++)               // ⑥ 底部岩浆层 h-145/144
    {
        for (int dy = 145; dy >= 144; dy--)
        {
            int uti = (H - dy) * W + ux;
            if (act[uti] == 0) { liq[uti] = 255; liqT[uti] = 1; }
        }
    }
    int uwOre = (int)((double)(W * H) * 0.0008); // ⑦ 地狱石脉
    for (int un = 0; un < uwOre; un++)
        TileRunner((int)r.Next(0, W), (int)r.Next(H - 140, H), (int)r.Next(2, 7), (int)r.Next(3, 7), 58);
    // ⑧ 灰烬草 633 + 灰烬树 634（cs:13869-13915，外缘 17% 带）
    for (int ux = 25; ux < W - 25; ux++)
    {
        if ((double)ux < (double)W * 0.17 || (double)ux > (double)W * 0.83)
        {
            // ★H 批：`Next(-1,2)` 是 for 条件表达式——C# 每迭代重掷（曾提为列首单掷，
            // 漏 ~20 万掷使尾段树/HF 流整体错位）；JS 同款逐迭代求值
            for (int uy = H - 300; uy < H - 100 + (int)r.Next(-1, 2); uy++)
            {
                int uti = uy * W + ux;
                if (typ[uti] != 57 || act[uti] == 0) continue;
                bool exposed = false;
                for (int ox = -1; ox <= 1 && !exposed; ox++)
                    for (int oy = -1; oy <= 1; oy++)
                        if (act[(uy + oy) * W + ux + ox] == 0) { exposed = true; break; }
                if (exposed) { typ[uti] = 633; uwConv[0]++; }
            }
        }
    }
    for (int ux = 25; ux < W - 25; ux++)
    {
        if ((double)ux < (double)W * 0.17 || (double)ux > (double)W * 0.83)
        {
            for (int uy = H - 200; uy < H - 50; uy++)
            {
                int uti = uy * W + ux;
                if (typ[uti] != 633 || act[uti] == 0 || act[(uy - 1) * W + ux] != 0) continue;
                uwCand[0]++;
                if ((int)r.Next(3) == 0) { uwGrow[0]++; GrowAshTree(ux, uy); }
            }
        }
    }
}
Checkpoint("underworld");

Replay(); // ▶pass 头重播：CorruptionAndCrimson cs:13919
// ================= Pass 29 CorruptionAndCrimson（cs:13919-14613 + ChasmRunnerSideways cs:75323 + CanEvilReplace cs:75527 + CrimStart cs:75543 + CrimPlaceHearts cs:75854 + ChasmRunner cs:76066）=================
// 普通世界：flipInfections/drunk/remix/tenthAnniversary 全 false；dungeonSide = dungeonRight ? 1 : -1
// WallID.Sets.WallTypeToTerrainTileType（WallID.cs:66）：40→147、71→161、15→59、
// 86→225、3→25、83→203、178→367、180→368，未映射默认 0
ushort WallToTerrain(ushort w) => w switch
{
    40 => 147, 71 => 161, 15 => 59, 86 => 225, 3 => 25, 83 => 203,
    178 => 367, 180 => 368, _ => 0
};
bool CanEvilReplace(int cx, int cy)
{
    int t = act[cy * W + cx] != 0 ? typ[cy * W + cx] : -1;
    ushort wl = wal[cy * W + cx];
    if (t >= 0 && (TILE_DUNGEON.Contains((ushort)t) || (t >= 481 && t <= 483))) return false;
    if (WALL_DUNGEON.Contains(wl)) return false;
    return true;
}
bool IsTileNearby26(int nx, int ny, int type, int distance)
{
    for (int i = nx - distance; i <= nx + distance; i++)
        for (int j = ny - distance; j <= ny + distance; j++)
        {
            if (i < 0 || i >= W || j < 0 || j >= H) continue;
            int ti = j * W + i;
            if (act[ti] != 0 && typ[ti] == (ushort)type) return true;
        }
    return false;
}
void Place3x2Altar(int px, int py, int style)
{
    if (px < 5 || px > W - 5 || py < 5 || py > H - 5) return;
    bool ok = true;
    for (int i = px - 1; i < px + 2; i++)
    {
        for (int j = py - 1; j < py + 1; j++)
            if (act[j * W + i] != 0) ok = false;
        if (!SolidTileGen(i, py + 1)) ok = false;   // SolidTile2≈SolidTile（无半砖阶段）
        if (typ[(py + 1) * W + i] == 138 || typ[(py + 1) * W + i] == 484 || (typ[(py + 1) * W + i] >= 664 && typ[(py + 1) * W + i] <= 665) || (typ[(py + 1) * W + i] >= 711 && typ[(py + 1) * W + i] <= 716)) ok = false;   // TileID.Sets.Boulders(TileID.cs:195)
    }
    if (!ok) return;
    short f = (short)(54 * style);
    for (int i = 0; i < 3; i++)
        for (int j = 0; j < 2; j++)
        {
            int ti = (py - 1 + j) * W + (px - 1 + i);
            typ[ti] = 26; act[ti] = 1;
        }
}
void AddShadowOrbGen(int ox, int oy, bool crimsonHeart)
{
    if (ox < 10 || ox > W - 10 || oy < 10 || oy > H - 10) return;
    for (int i = ox - 1; i < ox + 1; i++)
        for (int j = oy - 1; j < oy + 1; j++)
            if (act[j * W + i] != 0 && typ[j * W + i] == 31) return;
    for (int i = 0; i < 2; i++)
        for (int j = 0; j < 2; j++)
        {
            int ti = (oy - 1 + j) * W + (ox - 1 + i);
            typ[ti] = 31; act[ti] = 1;
        }
}
var heartPosG = new List<(int x, int y)>();
void ChasmRunnerSidewaysGen(int i, int j, int direction, int steps)
{
    double sn = steps;
    double vx = i, vy = j;
    double vx2 = (int)r.Next(10, 21) * 0.1 * direction;
    double vy2 = (int)r.Next(-10, 10) * 0.01;
    double rad = (int)r.Next(5) + 7;
    while (rad > 0.0)
    {
        if (sn > 0.0)
        {
            rad += (int)r.Next(3);
            rad -= (int)r.Next(3);
            if (rad < 7.0) rad = 7.0;
            if (rad > 20.0) rad = 20.0;
            if (sn == 1.0 && rad < 10.0) rad = 10.0;
        }
        else rad -= (int)r.Next(4);
        if (vy > rockLayer && sn > 0.0) sn = 0.0;
        sn -= 1.0;
        int x0 = Math.Max(0, (int)(vx - rad * 0.5)), x1 = Math.Min(W - 1, (int)(vx + rad * 0.5));
        int y0 = Math.Max(0, (int)(vy - rad * 0.5)), y1 = Math.Min(H, (int)(vy + rad * 0.5));
        for (int k = x0; k < x1; k++)
            for (int l = y0; l < y1; l++)
            {
                int ti = l * W + k;
                if (CanEvilReplace(k, l) && Math.Abs((double)k - vx) + Math.Abs((double)l - vy) < rad * 0.5 * (1.0 + (int)r.Next(-10, 11) * 0.015)
                    && typ[ti] != 31 && typ[ti] != 22 && typ[ti] != 204)
                    act[ti] = 0;
            }
        vx += vx2; vy += vy2;
        vy2 += (int)r.Next(-10, 10) * 0.1;
        if (vy < (double)(j - 20)) vy2 += (int)r.Next(20) * 0.01;
        if (vy > (double)(j + 20)) vy2 -= (int)r.Next(20) * 0.01;
        if (vy2 < -0.5) vy2 = -0.5;
        if (vy2 > 0.5) vy2 = 0.5;
        vx2 += (int)r.Next(-10, 11) * 0.01;
        if (direction == -1) { if (vx2 > -0.5) vx2 = -0.5; if (vx2 < -2.0) vx2 = -2.0; }
        else { if (vx2 < 0.5) vx2 = 0.5; if (vx2 > 2.0) vx2 = 2.0; }
        int x2 = Math.Max(1, (int)(vx - rad * 1.1)), x3 = Math.Min(W - 1, (int)(vx + rad * 1.1));
        int y2 = Math.Max(0, (int)(vy - rad * 1.1)), y3 = Math.Min(H, (int)(vy + rad * 1.1));
        for (int k = x2; k < x3; k++)
            for (int l = y2; l < y3; l++)
            {
                int ti = l * W + k;
                if (CanEvilReplace(k, l) && Math.Abs((double)k - vx) + Math.Abs((double)l - vy) < rad * 1.1 * (1.0 + (int)r.Next(-10, 11) * 0.015) && wal[ti] != 3)
                {
                    if (act[ti] == 0 || (typ[ti] != 31 && typ[ti] != 22 && typ[ti] != 204)) typ[ti] = 25;
                    act[ti] = 1;
                    if (wal[ti] == 2) wal[ti] = 0;
                }
            }
        for (int k = x2; k < x3; k++)
            for (int l = y2; l < y3; l++)
            {
                int ti = l * W + k;
                if (CanEvilReplace(k, l) && Math.Abs((double)k - vx) + Math.Abs((double)l - vy) < rad * 1.1 * (1.0 + (int)r.Next(-10, 11) * 0.015) && wal[ti] != 3)
                {
                    if (act[ti] == 0 || (typ[ti] != 31 && typ[ti] != 22 && typ[ti] != 204)) typ[ti] = 25;
                    act[ti] = 1;
                    // ★K 批：壳2 墙写入 = WorldGen.PlaceWall 语义（cs:75508→75189）：界外门
                    // (1,max-2) + 仅 wall==0 才写（曾裸写=3 覆掉墙 2/15/64/80）+ 成功写掷
                    // 1×Next(0,3)（SquareWallFrame 中心格 WallFrame(resetFrame:true)；墙 3 非大帧墙）
                    if (k > 1 && l > 1 && k < W - 2 && l < H - 2 && wal[ti] == 0)
                    {
                        wal[ti] = 3;
                        r.Next(0, 3);
                    }
                }
            }
    }
    if ((int)r.Next(3) == 0)
    {
        int ox = (int)vx, oy = (int)vy;
        while (oy < H && act[oy * W + ox] == 0) oy++;
        TileRunner(ox, oy, (int)r.Next(2, 6), (int)r.Next(3, 7), 22);
    }
}
void ChasmRunnerGen(int i, int j, int steps, bool makeOrb)
{
    double wsN = worldSurface;
    bool flag = false, flag2 = !makeOrb, flag3 = false;
    double sn = steps;
    double vx = i, vy = j;
    double vx2 = (int)r.Next(-10, 11) * 0.1;
    double vy2 = (int)r.Next(11) * 0.2 + 0.5;
    int num3 = 5;
    double rad = (int)r.Next(5) + 7;
    while (rad > 0.0)
    {
        if (sn > 0.0)
        {
            rad += (int)r.Next(3);
            rad -= (int)r.Next(3);
            if (rad < 7.0) rad = 7.0;
            if (rad > 20.0) rad = 20.0;
            if (sn == 1.0 && rad < 10.0) rad = 10.0;
        }
        else if (vy > wsN + 45.0) rad -= (int)r.Next(4);
        if (vy > rockLayer && sn > 0.0) sn = 0.0;
        sn -= 1.0;
        if (!flag && vy > wsN + 20.0)
        {
            flag = true;
            ChasmRunnerSidewaysGen((int)vx, (int)vy, -1, (int)r.Next(20, 40));
            ChasmRunnerSidewaysGen((int)vx, (int)vy, 1, (int)r.Next(20, 40));
        }
        if (sn > (double)num3)
        {
            int x0 = Math.Max(0, (int)(vx - rad * 0.5)), x1 = Math.Min(W - 1, (int)(vx + rad * 0.5));
            int y0 = Math.Max(0, (int)(vy - rad * 0.5)), y1 = Math.Min(H, (int)(vy + rad * 0.5));
            for (int k = x0; k < x1; k++)
                for (int l = y0; l < y1; l++)
                {
                    int ti = l * W + k;
                    if (Math.Abs((double)k - vx) + Math.Abs((double)l - vy) < rad * 0.5 * (1.0 + (int)r.Next(-10, 11) * 0.015)
                        && CanEvilReplace(k, l) && typ[ti] != 31 && typ[ti] != 22 && typ[ti] != 204)
                        act[ti] = 0;
                }
        }
        if (sn <= 2.0 && vy < wsN + 45.0) sn = 2.0;
        if (sn <= 0.0)
        {
            if (!flag2)
            {
                flag2 = true;
                AddShadowOrbGen((int)vx, (int)vy, false);
            }
            else if (!flag3)
            {
                flag3 = false;
                bool done = false;
                int tries = 0;
                while (!done)
                {
                    int ox = (int)r.Next((int)vx - 25, (int)vx + 25);
                    int oy = (int)r.Next((int)vy - 50, (int)vy);
                    if (ox < 5) ox = 5;
                    if (ox > W - 5) ox = W - 5;
                    if (oy < 5) oy = 5;
                    if (oy > H - 5) oy = H - 5;
                    if ((double)oy > wsN)
                    {
                        if (!IsTileNearby26(ox, oy, 26, 3)) Place3x2Altar(ox, oy, 0);
                        if (typ[oy * W + ox] == 26) { done = true; continue; }
                        tries++;
                        if (tries >= 10000) done = true;
                    }
                    else done = true;
                }
            }
        }
        vx += vx2; vy += vy2;
        vx2 += (int)r.Next(-10, 11) * 0.01;
        if (vx2 > 0.3) vx2 = 0.3;
        if (vx2 < -0.3) vx2 = -0.3;
        int x0b = Math.Max(1, (int)(vx - rad * 1.1)), x1b = Math.Min(W - 1, (int)(vx + rad * 1.1));
        int y0b = Math.Max(0, (int)(vy - rad * 1.1)), y1b = Math.Min(H, (int)(vy + rad * 1.1));
        for (int k = x0b; k < x1b; k++)
            for (int l = y0b; l < y1b; l++)
            {
                int ti = l * W + k;
                if (CanEvilReplace(k, l) && Math.Abs((double)k - vx) + Math.Abs((double)l - vy) < rad * 1.1 * (1.0 + (int)r.Next(-10, 11) * 0.015))
                {
                    if (typ[ti] != 25 && l > j + (int)r.Next(3, 20)) act[ti] = 1;
                    if (steps <= num3) act[ti] = 1;
                    if (typ[ti] != 31) typ[ti] = 25;
                }
            }
        for (int k = x0b; k < x1b; k++)
            for (int l = y0b; l < y1b; l++)
            {
                int ti = l * W + k;
                if (CanEvilReplace(k, l) && Math.Abs((double)k - vx) + Math.Abs((double)l - vy) < rad * 1.1 * (1.0 + (int)r.Next(-10, 11) * 0.015))
                {
                    if (typ[ti] != 31) typ[ti] = 25;
                    if (steps <= num3) act[ti] = 1;
                    if (l > j + (int)r.Next(3, 20)) wal[ti] = 3;
                }
            }
    }
}
void CrimVeinGen(double px, double py, double ivx, double ivy)
{
    double rad = (int)r.Next(15, 26);
    bool flag = true;
    double vx = ivx, vy = ivy;
    double sx = px, sy = py;
    int trip = (int)r.Next(100, 150);
    if (ivy < 0.0) trip -= 25;
    while (flag)
    {
        rad += (int)r.Next(-50, 51) * 0.02;
        if (rad < 15.0) rad = 15.0;
        if (rad > 25.0) rad = 25.0;
        for (int i = (int)(px - rad / 2.0); (double)i < px + rad / 2.0; i++)
            for (int j = (int)(py - rad / 2.0); (double)j < py + rad / 2.0; j++)
            {
                if (i < 0 || i >= W || j < 0 || j >= H) continue;
                if (!CanEvilReplace(i, j)) continue;
                int ti = j * W + i;
                double d = Math.Sqrt((double)(i - px) * (i - px) + (double)(j - py) * (j - py));
                if (d < rad * 0.2)
                {
                    act[ti] = 0; wal[ti] = 83;
                }
                else if (d < rad * 0.5 && wal[ti] != 83)
                {
                    act[ti] = 1; typ[ti] = 203;
                    if (d < rad * 0.4) wal[ti] = 83;
                }
            }
        vx += (int)r.Next(-50, 51) * 0.05;
        vy += (int)r.Next(-50, 51) * 0.05;
        if (vy < ivy - 0.75) vy = ivy - 0.75;
        if (vy > ivy + 0.75) vy = ivy + 0.75;
        if (vx < ivx - 0.75) vx = ivx - 0.75;
        if (vx > ivx + 0.75) vx = ivx + 0.75;
        px += vx; py += vy;
        if (Math.Abs(px - sx) + Math.Abs(py - sy) > (double)trip) flag = false;
    }
    heartPosG.Add(((int)px, (int)py));
}
void CrimEntGen(double px, double py, int crimDir)
{
    double num = 0.0;
    double rad = (int)r.Next(6, 11);
    bool flag = true;
    double vx = 2.0, vy = (int)r.Next(-20, 0) * 0.01;
    vx *= -crimDir;
    while (flag)
    {
        num += 1.0;
        if (num >= 20.0) flag = false;
        rad += (int)r.Next(-10, 11) * 0.02;
        if (rad < 6.0) rad = 6.0;
        if (rad > 10.0) rad = 10.0;
        for (int i = (int)(px - rad / 2.0); (double)i < px + rad / 2.0; i++)
            for (int j = (int)(py - rad / 2.0); (double)j < py + rad / 2.0; j++)
            {
                if (i < 0 || i >= W || j < 0 || j >= H) continue;
                if (!CanEvilReplace(i, j)) continue;
                int ti = j * W + i;
                if (Math.Sqrt((double)(i - px) * (i - px) + (double)(j - py) * (j - py)) < rad * 0.5 && act[ti] != 0 && typ[ti] == 203)
                {
                    act[ti] = 0;
                    flag = true;
                    num = 0.0;
                }
            }
        px += vx; py += vy;
    }
}
void CrimStartGen(int i, int j)
{
    double wsN = worldSurface;
    int crimDir = 1;
    int k = j;
    if ((double)k > wsN) k = (int)wsN;
    for (; k < H && !SolidTileGen(i, k); k++) { }
    int startY = k;
    double vx = i, vy = k;
    double vx2 = (int)r.Next(-20, 21) * 0.1;
    double vy2 = (int)r.Next(20, 201) * 0.01;
    if (vx2 < 0.0) crimDir = -1;
    double rad = (int)r.Next(15, 26);
    bool flag = true;
    int num4 = 0;
    while (flag)
    {
        rad += (int)r.Next(-50, 51) * 0.01;
        if (rad < 15.0) rad = 15.0;
        if (rad > 25.0) rad = 25.0;
        for (int l = (int)(vx - rad / 2.0); (double)l < vx + rad / 2.0; l++)
            for (int m = (int)(vy - rad / 2.0); (double)m < vy + rad / 2.0; m++)
            {
                if (l < 0 || l >= W || m < 0 || m >= H) continue;
                if (!CanEvilReplace(l, m)) continue;
                int ti = m * W + l;
                if (m > startY)
                {
                    if (Math.Abs((double)l - vx) + Math.Abs((double)m - vy) < rad * 0.3)
                    {
                        act[ti] = 0; wal[ti] = 83;
                    }
                    else if (Math.Abs((double)l - vx) + Math.Abs((double)m - vy) < rad * 0.8 && wal[ti] != 83)
                    {
                        act[ti] = 1; typ[ti] = 203;
                        if (Math.Abs((double)l - vx) + Math.Abs((double)m - vy) < rad * 0.6) wal[ti] = 83;
                    }
                }
                else if (Math.Abs((double)l - vx) + Math.Abs((double)m - vy) < rad * 0.3 && act[ti] != 0)
                {
                    act[ti] = 0; wal[ti] = 83;
                }
            }
        if (vx > (double)(i + 50)) num4 = -100;
        if (vx < (double)(i - 50)) num4 = 100;
        if (num4 < 0) vx2 -= (int)r.Next(20, 51) * 0.01;
        else if (num4 > 0) vx2 += (int)r.Next(20, 51) * 0.01;
        else vx2 += (int)r.Next(-50, 51) * 0.01;
        vy2 += (int)r.Next(-50, 51) * 0.01;
        if (vy2 < 0.25) vy2 = 0.25;
        if (vy2 > 2.0) vy2 = 2.0;
        if (vx2 < -2.0) vx2 = -2.0;
        if (vx2 > 2.0) vx2 = 2.0;
        vx += vx2; vy += vy2;
        if (vy > wsN + 100.0) flag = false;
    }
    rad = (int)r.Next(40, 55);
    for (int n = 0; n < 50; n++)
    {
        int cx = (int)vx + (int)r.Next(-20, 21);
        int cy = (int)vy + (int)r.Next(-20, 21);
        for (int i2 = (int)((double)cx - rad / 2.0); (double)i2 < (double)cx + rad / 2.0; i2++)
            for (int j2 = (int)((double)cy - rad / 2.0); (double)j2 < (double)cy + rad / 2.0; j2++)
            {
                if (i2 < 0 || i2 >= W || j2 < 0 || j2 >= H) continue;
                if (!CanEvilReplace(i2, j2)) continue;
                int ti = j2 * W + i2;
                double ddx = Math.Abs(i2 - cx), ddy = Math.Abs(j2 - cy);
                double s1 = 1.0 + (int)r.Next(-20, 21) * 0.01;
                double s2 = 1.0 + (int)r.Next(-20, 21) * 0.01;
                double d = Math.Sqrt(ddx * ddx * s1 * s1 + ddy * ddy * s2 * s2);
                if (d < rad * 0.25)
                {
                    act[ti] = 0; wal[ti] = 83;
                }
                else if (d < rad * 0.4 && wal[ti] != 83)
                {
                    act[ti] = 1; typ[ti] = 203;
                    if (d < rad * 0.35) wal[ti] = 83;
                }
            }
    }
    int veinCount = (int)r.Next(5, 9);
    var veinDirs = new List<(double x, double y)>();
    for (int n = 0; n < veinCount; n++)
    {
        int sx = (int)vx, sy = (int)vy;
        int tries = 0;
        bool flag2 = true;
        double dx3 = (int)r.Next(-20, 21) * 0.15, dy3 = (int)r.Next(0, 21) * 0.15;
        while (flag2)
        {
            dx3 = (int)r.Next(-20, 21) * 0.15; dy3 = (int)r.Next(0, 21) * 0.15;
            while (Math.Abs(dx3) + Math.Abs(dy3) < 1.5)
            {
                dx3 = (int)r.Next(-20, 21) * 0.15; dy3 = (int)r.Next(0, 21) * 0.15;
            }
            flag2 = false;
            for (int p = 0; p < n; p++)
            {
                // ★原版 quirk：此处比较的是 val2（主通道末速度）而非新采样的 val3（cs:75790-75797）
                if (vx2 > veinDirs[p].x - 0.75 && vx2 < veinDirs[p].x + 0.75 && vy2 > veinDirs[p].y - 0.75 && vy2 < veinDirs[p].y + 0.75)
                {
                    flag2 = true; tries++;
                    break;
                }
            }
            if (tries > 10000) break;
        }
        veinDirs.Add((dx3, dy3));
        CrimVeinGen((double)sx, (double)sy, dx3, dy3);
    }
    int shellMinX = W, shellMaxX = 0;
    vx = i; vy = startY;
    rad = (int)r.Next(25, 35);
    double rise = (int)r.Next(0, 6);
    for (int n = 0; n < 50; n++)
    {
        if (rise > 0.0)
        {
            double step = (int)r.Next(10, 30) * 0.01;
            rise -= step;
            vy -= step;
        }
        int cx = (int)vx + (int)r.Next(-2, 3);
        int cy = (int)vy + (int)r.Next(-2, 3);
        for (int i2 = (int)((double)cx - rad / 2.0); (double)i2 < (double)cx + rad / 2.0; i2++)
            for (int j2 = (int)((double)cy - rad / 2.0); (double)j2 < (double)cy + rad / 2.0; j2++)
            {
                if (i2 < 0 || i2 >= W || j2 < 0 || j2 >= H) continue;
                if (!CanEvilReplace(i2, j2)) continue;
                int ti = j2 * W + i2;
                double ddx = Math.Abs(i2 - cx), ddy = Math.Abs(j2 - cy);
                double s1 = 1.0 + (int)r.Next(-20, 21) * 0.005;
                double s2 = 1.0 + (int)r.Next(-20, 21) * 0.005;
                double d = Math.Sqrt(ddx * ddx * s1 * s1 + ddy * ddy * s2 * s2);
                if (d < rad * 0.2 * ((int)r.Next(90, 111) * 0.01))
                {
                    act[ti] = 0; wal[ti] = 83;
                }
                else if (d < rad * 0.45)
                {
                    if (i2 < shellMinX) shellMinX = i2;
                    if (i2 > shellMaxX) shellMaxX = i2;
                    if (wal[ti] != 83)
                    {
                        act[ti] = 1; typ[ti] = 203;
                        if (d < rad * 0.35) wal[ti] = 83;
                    }
                }
            }
    }
    for (int x = shellMinX; x <= shellMaxX; x++)
    {
        int y = startY;
        while (y < H && ((act[y * W + x] != 0 && typ[y * W + x] == 203) || wal[y * W + x] == 83)) y++;
        int fill = (int)r.Next(15, 20);
        while (y < H && act[y * W + x] == 0 && fill > 0 && wal[y * W + x] != 83)
        {
            if (CanEvilReplace(x, y))
            {
                fill--;
                typ[y * W + x] = 203; act[y * W + x] = 1;
                y++;
            }
        }
    }
    CrimEntGen(vx, vy, crimDir);
}
void CrimPlaceHeartsGen()
{
    for (int i = 0; i < heartPosG.Count; i++)
    {
        int num = (int)r.Next(16, 21);
        int x = heartPosG[i].x, y = heartPosG[i].y;
        for (int j = x - num / 2; j < x + num / 2; j++)
            for (int k = y - num / 2; k < y + num / 2; k++)
            {
                if (j < 0 || j >= W || k < 0 || k >= H) continue;
                if (Math.Sqrt((double)(j - x) * (j - x) + (double)(k - y) * (k - y)) < (double)num * 0.4)
                {
                    int ti = k * W + j;
                    act[ti] = 1; typ[ti] = 203; wal[ti] = 83;
                }
            }
    }
    for (int i = 0; i < heartPosG.Count; i++)
    {
        int num = (int)r.Next(10, 14);
        int x = heartPosG[i].x, y = heartPosG[i].y;
        for (int j = x - num / 2; j < x + num / 2; j++)
            for (int k = y - num / 2; k < y + num / 2; k++)
            {
                if (j < 0 || j >= W || k < 0 || k >= H) continue;
                if (Math.Sqrt((double)(j - x) * (j - x) + (double)(k - y) * (k - y)) < (double)num * 0.3)
                {
                    int ti = k * W + j;
                    act[ti] = 0; wal[ti] = 83;
                }
            }
    }
    for (int i = 0; i < heartPosG.Count; i++)
        AddShadowOrbGen(heartPosG[i].x, heartPosG[i].y, true);
}
{
    double cNum = gvWorldSurfaceLow;                 // GenVars.worldSurfaceLow（raw double）
    double cNum2 = worldSurface;                    // Main.worldSurface
    int jMin = W, jMax = 0, sMin = W, sMax = 0;
    for (int i = 0; i < W; i++)
        for (int j = 0; (double)j < cNum2; j++)
        {
            int ti = j * W + i;
            if (act[ti] == 0) continue;
            if (typ[ti] == 60) { if (i < jMin) jMin = i; if (i > jMax) jMax = i; }
            else if (typ[ti] == 147 || typ[ti] == 161) { if (i < sMin) sMin = i; if (i > sMax) sMax = i; }
        }
    int pad = 10;
    jMin -= pad; jMax += pad; sMin -= pad; sMax += pad;
    int beachAvoid = 380;                           // evilBiomeBeachAvoidance = 320+60（仅 zLo/zHi 钳位）
    int centerAvoid = 500;                          // ★中心采样 num8=500（cs:13976/14012），非 380
    int dungeonAvoid = 100;
    int midFixer = 50;                              // evilBiomeAvoidanceMidFixer
    double groupCount = (double)W * 0.00045;        // ★裸 double：4200 → 1.89 → 两组！
    int dSide = dungeonRight ? 1 : -1;
    // oceanDepths（cs:10978）：y>oceanLevel→false；x<beachDistance||x>w-beachDistance→true。
    // oceanLevel=(worldSurface+rockLayer)/2+40（cs:4393）
    bool OceanDepths(int ox, int oy)
    {
        if ((double)oy > (worldSurface + (double)rockLayer) / 2.0 + 40.0) return false;
        if (ox < BEACH_DISTANCE || ox > W - BEACH_DISTANCE) return true;
        return false;
    }
    int crCx = 0;
    for (int g = 0; (double)g < groupCount; g++)
    {
        int snowLo = sMin, snowHi = sMax, jungLo = jMin, jungHi = jMax;
        int cx = 0, zLo = 0, zHi = 0;
        bool ok = false;
        while (!ok)
        {
            ok = true;
            int mid = W / 2, midAvoid = 200;
            cx = (int)r.Next(centerAvoid, W - centerAvoid);
            zLo = cx - (int)r.Next(200) - 100;
            zHi = cx + (int)r.Next(200) + 100;
            if (zLo < beachAvoid) zLo = beachAvoid;
            if (zHi > W - beachAvoid) zHi = W - beachAvoid;
            if (cx < zLo + midFixer) cx = zLo + midFixer;
            if (cx > zHi - midFixer) cx = zHi - midFixer;
            if (dSide <= -1 && zLo < 400) zLo = 400;
            else if (dSide >= 1 && zLo > W - 400) zLo = W - 400;
            if (zLo < dungeonLocation + dungeonAvoid && zHi > dungeonLocation - dungeonAvoid) ok = false;
            if (cx > mid - midAvoid && cx < mid + midAvoid) ok = false;
            if (zLo > mid - midAvoid && zLo < mid + midAvoid) ok = false;
            if (zHi > mid - midAvoid && zHi < mid + midAvoid) ok = false;
            // UndergroundDesertLocation（Inflate(10,10) 后）
            if (cx > dsX && cx < dsR) ok = false;
            if (zLo > dsX && zLo < dsR) ok = false;
            if (zHi > dsX && zHi < dsR) ok = false;
            if (zLo < snowHi && zHi > snowLo) { snowLo++; snowHi--; ok = false; }
            if (zLo < jungHi && zHi > jungLo) { jungLo++; jungHi--; ok = false; }
        }
        crCx = cx;
        if (crimson)
        {
            CrimStartGen(cx, (int)cNum - 10);
            // 丛林草→猩红丛林草（cs:14110-14122：仅 type 60）
            for (int l = zLo; l < zHi; l++)
            {
                for (int n = (int)cNum; (double)n < cNum2 - 1.0; n++)
                {
                    if (act[n * W + l] != 0)
                    {
                        int end = n + (int)r.Next(10, 14);
                        for (int n2 = n; n2 < end; n2++)
                        {
                            if (act[n2 * W + l] != 0 && typ[n2 * W + l] == 60 && l >= zLo + (int)r.Next(5) && l < zHi - (int)r.Next(5))
                                typ[n2 * W + l] = 662;
                        }
                        break;
                    }
                }
            }
            // 地表转换带（cs:14131-14199）
            double band = cNum2 + 40.0;
            for (int x = zLo; x < zHi; x++)
            {
                band += (double)(int)r.Next(-2, 3);
                if (band < cNum2 + 30.0) band = cNum2 + 30.0;
                if (band > cNum2 + 50.0) band = cNum2 + 50.0;
                bool first = false;
                double bandStart = cNum;
                for (int y = (int)bandStart; (double)y < band; y++)
                {
                    // 边缘抖动门（cs:14145-14147）：内圈免骰，外圈 Next(2)
                    if (!((x > zLo + 1 && x < zHi - 2) || (int)r.Next(2) != 0)) continue;
                    if (!((!(y <= bandStart + 1.0) && !(y >= band - 2.0)) || (int)r.Next(2) != 0)) continue;
                    int ti = y * W + x;
                    if (act[ti] == 0) continue;
                    if (typ[ti] == 53 && x >= zLo + (int)r.Next(5) && x <= zHi - (int)r.Next(5)) typ[ti] = 234;
                    if ((double)y < cNum2 - 1.0 && !first)
                    {
                        if (typ[ti] == 0) { grassSpread = 0; SpreadGrassGen(x, y, 0, 199); }   // SpreadGrass(0→199, repeat:true)
                        else if (typ[ti] == 59) { grassSpread = 0; SpreadGrassGen(x, y, 59, 662); }
                    }
                    first = true;
                    if (wal[ti] == 216) wal[ti] = 218;
                    else if (wal[ti] == 187) wal[ti] = 221;
                    if (typ[ti] == 1)
                    {
                        if (x >= zLo + (int)r.Next(5) && x <= zHi - (int)r.Next(5)) typ[ti] = 203;
                    }
                    else if (typ[ti] == 2) typ[ti] = 199;
                    else if (typ[ti] == 60) typ[ti] = 662;
                    else if (typ[ti] == 161) typ[ti] = 200;
                    else if (typ[ti] == 396) typ[ti] = 401;
                    else if (typ[ti] == 397) typ[ti] = 399;
                }
            }
            // 祭坛（cs:14201-14239）
            int altarCount = (int)r.Next(10, 15);
            for (int a = 0; a < altarCount; a++)
            {
                int tries = 0, widen = 0;
                bool done = false;
                while (!done)
                {
                    tries++;
                    int ax = (int)r.Next(zLo - widen, zHi + widen);
                    int ay = (int)r.Next((int)(cNum2 - (double)(widen / 2)), (int)(cNum2 + 100.0 + (double)widen));
                    // ★落点掷出海洋带则两点重掷（cs:14252-14256）
                    while (OceanDepths(ax, ay))
                    {
                        ax = (int)r.Next(zLo - widen, zHi + widen);
                        ay = (int)r.Next((int)(cNum2 - (double)(widen / 2)), (int)(cNum2 + 100.0 + (double)widen));
                    }
                    if (tries > 100) { widen++; tries = 0; }
                    if (act[ay * W + ax] == 0)
                    {
                        for (; ay < H && act[ay * W + ax] == 0; ay++) { }
                        ay--;
                    }
                    else
                    {
                        while (ay >= 0 && act[ay * W + ax] != 0 && (double)ay > cNum2) ay--;
                    }
                    if ((widen > 10 || (act[(ay + 1) * W + ax] != 0 && typ[(ay + 1) * W + ax] == 203)) && !IsTileNearby26(ax, ay, 26, 3))
                    {
                        Place3x2Altar(ax, ay, 1);
                        if (typ[ay * W + ax] == 26) done = true;
                    }
                    if (widen > 100) done = true;
                }
            }
        }
        else
        {
            // 腐化裂隙（cs:14368-14390）
            int cooldown = 0;
            for (int l = zLo; l < zHi; l++)
            {
                if (cooldown > 0) cooldown--;
                if (l == cx || cooldown == 0)
                {
                    for (int n = (int)cNum; (double)n < cNum2 - 1.0; n++)
                    {
                        if (act[n * W + l] != 0 || wal[n * W + l] > 0)
                        {
                            if (l == cx)
                            {
                                cooldown = 20;
                                ChasmRunnerGen(l, n, (int)r.Next(150) + 150, true);
                            }
                            else if ((int)r.Next(35) == 0 && cooldown == 0)
                            {
                                cooldown = 30;
                                ChasmRunnerGen(l, n, (int)r.Next(50) + 50, true);
                            }
                            break;
                        }
                    }
                }
                // 丛林草→腐化丛林草（cs:14392-14404）
                for (int n = (int)cNum; (double)n < cNum2 - 1.0; n++)
                {
                    if (act[n * W + l] != 0)
                    {
                        int end = n + (int)r.Next(10, 14);
                        for (int n2 = n; n2 < end; n2++)
                        {
                            if (act[n2 * W + l] != 0 && typ[n2 * W + l] == 60 && l >= zLo + (int)r.Next(5) && l < zHi - (int)r.Next(5))
                                typ[n2 * W + l] = 661;
                        }
                        break;
                    }
                }
            }
            // 地表转换带（cs:14406-14484）
            double band = cNum2 + 40.0;
            for (int x = zLo; x < zHi; x++)
            {
                band += (double)(int)r.Next(-2, 3);
                if (band < cNum2 + 30.0) band = cNum2 + 30.0;
                if (band > cNum2 + 50.0) band = cNum2 + 50.0;
                bool first = false;
                double bandStart = cNum;
                for (int y = (int)bandStart; (double)y < band; y++)
                {
                    if (!((x > zLo + 1 && x < zHi - 2) || (int)r.Next(2) != 0)) continue;
                    if (!((!(y <= bandStart + 1.0) && !(y >= band - 2.0)) || (int)r.Next(2) != 0)) continue;
                    int ti = y * W + x;
                    if (act[ti] == 0) continue;
                    if (typ[ti] == 53 && x >= zLo + (int)r.Next(5) && x <= zHi - (int)r.Next(5)) typ[ti] = 112;
                    if ((double)y < cNum2 - 1.0 && !first)
                    {
                        if (typ[ti] == 0) { grassSpread = 0; SpreadGrassGen(x, y, 0, 23); }    // SpreadGrass(0→23, repeat:true)
                        else if (typ[ti] == 59) { grassSpread = 0; SpreadGrassGen(x, y, 59, 661); }
                    }
                    first = true;
                    if (wal[ti] == 216) wal[ti] = 217;
                    else if (wal[ti] == 187) wal[ti] = 220;
                    if (typ[ti] == 1)
                    {
                        if (x >= zLo + (int)r.Next(5) && x <= zHi - (int)r.Next(5)) typ[ti] = 25;
                    }
                    else if (typ[ti] == 2) typ[ti] = 23;
                    else if (typ[ti] == 60) typ[ti] = 661;
                    else if (typ[ti] == 161) typ[ti] = 163;
                    else if (typ[ti] == 396) typ[ti] = 400;
                    else if (typ[ti] == 397) typ[ti] = 398;
                }
            }
            // 暗影球周黑檀石囊（cs:14546-14581，仅本组区间）
            for (int x = zLo; x < zHi; x++)
            {
                for (int y = 0; y < H - 50; y++)
                {
                    if (act[y * W + x] == 0 || typ[y * W + x] != 31) continue;
                    for (int dx = -13; dx < 13; dx++)
                    {
                        if (x + dx <= 10 || x + dx >= W - 10) continue;
                        for (int dy = -13; dy < 13; dy++)
                        {
                            int y2 = y + dy;
                            if (y2 < 0 || y2 >= H) continue;
                            int ti = y2 * W + (x + dx);
                            if (Math.Abs(dx) + Math.Abs(dy) < 9 + (int)r.Next(11) && (int)r.Next(3) != 0 && typ[ti] != 31)
                            {
                                act[ti] = 1; typ[ti] = 25;
                                if (Math.Abs(dx) <= 1 && Math.Abs(dy) <= 1) act[ti] = 0;
                            }
                            if (typ[ti] != 31 && Math.Abs(dx) <= 2 + (int)r.Next(3) && Math.Abs(dy) <= 2 + (int)r.Next(3))
                                act[ti] = 0;      // 原版仅 active=false（type 保留为幽灵）
                        }
                    }
                }
            }
        }
    }
    if (crimson)
    {
        CrimPlaceHeartsGen();
    }   // cs:14331：全组结束后一次性放心（普通世界 !flipInfections）
}
Checkpoint("corruption");
if (Environment.GetEnvironmentVariable("GHOST_DUMP") != null) {
    var gbuf = new byte[W * H * 2]; System.Buffer.BlockCopy(typ, 0, gbuf, 0, gbuf.Length);
    File.WriteAllBytes(Environment.GetEnvironmentVariable("GHOST_DUMP"), gbuf);
    File.WriteAllText(Environment.GetEnvironmentVariable("GHOST_DUMP") + ".act", string.Join("", act.Select(a => a == 0 ? "0" : "1")));
    return;
}


List<int>? lkXOut = null;            // GenVars.LakeX（Lakes 诊断导出用）
// tileSolidTop 表（Main.tileSolidTop）——Lakes WillWater / Dungeon SolidTileX 共用
var dgSolidTop = new HashSet<int> { 14,16,18,19,87,88,101,114,134,239,275,276,277,278,279,280,281,285,286,296,297,298,299,309,310,339,358,359,361,362,363,364,376,380,391,392,393,394,405,413,414,427,469,532,533,538,542,544,550,551,553,554,555,556,558,559,582,599,600,601,602,603,604,605,606,607,608,609,610,611,612,619,629,632,640,643,644,645,710 };

Replay(); // ▶pass 头重播：Lakes cs:14613
// ================= Pass 30 Lakes（cs:14613-14755 + SonOfLakinater cs:80354）=================
// 注：#29 Corruption（cs:13919）未转录——插入位在本块之前（JS 侧在 vanillaBiomes 内已先跑）
// SpreadGrass(i,j,59,60)（cs:75210 普通种子路径，L 批 #30）：活跃泥→丛林草即时传播
//（3×3 递归、深度闸 1000、岩浆邻阻断、全实心 enclosed 拒、零掷骰）。vanGenSolid ≈ SOLID
//（本时点无平台族活性块）。
int lakeGrassDepth = 0;
void SpreadJungleGrassLake(int gi, int gj)
{
    if (gi < 10 || gi >= W - 10 || gj < 10 || gj >= H - 10) return;
    int gi2 = gj * W + gi;
    if (act[gi2] == 0 || typ[gi2] != 59) return;
    bool enclosed = true;
    for (int gk = gi - 1; gk <= gi + 1; gk++)
        for (int gl = gj - 1; gl <= gj + 1; gl++)
        {
            int gti = gl * W + gk;
            if (act[gti] == 0 || !SOLID.Contains(typ[gti])) enclosed = false;
            if (liq[gti] > 0 && liqT[gti] == 1) { enclosed = true; goto done; }   // 岩浆邻
        }
    done:
    if (enclosed) return;
    typ[gi2] = 60;
    if (lakeGrassDepth >= 1000) return;
    lakeGrassDepth++;
    for (int gm = gi - 1; gm <= gi + 1; gm++)
        for (int gn = gj - 1; gn <= gj + 1; gn++)
        {
            int gni = gn * W + gm;
            if (act[gni] != 0 && typ[gni] == 59) SpreadJungleGrassLake(gm, gn);
        }
    lakeGrassDepth--;
}
void SonOfLakinater(int li, int lj)
{
    // liquidType：1/3 概率（getGood/drunk 分支不适用 → 恒 0=水）
    int lType = 0;
    if ((int)r.Next(3) == 0) { /* getGoodWorldGen false → 保持水 */ }
    double lnum = (int)r.Next(15, 31);
    double lnum2 = (int)r.Next(30, 61);
    if ((int)r.Next(5) == 0) { lnum *= 1.3; lnum2 *= 1.3; }
    double lvx = li, lvy = lj;
    double lnum3 = (double)r.NextDouble() * 0.002;
    double lv2x, lv2y;
    if ((int)r.Next(4) != 0) lv2x = (int)r.Next(-15, 16) * 0.01;
    else { lv2x = (int)r.Next(-50, 51) * 0.01; lnum3 = (double)r.NextDouble() * 0.004 + 0.001; }
    lv2y = (int)r.Next(101) * 0.01;
    double lnum5 = lnum2;
    while (lnum > 3.0 && lnum2 > 0.0)
    {
        lnum -= (int)r.Next(11) * 0.1;
        lnum2 -= 1.0;
        int lx0 = Math.Max(0, (int)(lvx - lnum * 4.0)), lx1 = Math.Min(W, (int)(lvx + lnum * 4.0));
        int ly0 = Math.Max(0, (int)(lvy - lnum * 3.0)), ly1 = Math.Min(H, (int)(lvy + lnum * 2.0));
        double lnum4 = lnum;
        int lEntr = lj + 5;
        for (int lk = lx0; lk < lx1; lk++)
        {
            for (int ll = ly0; ll < ly1; ll++)
            {
                double lvA = Math.Abs((double)lk - lvx) * 0.6;
                double lvB = Math.Abs((double)ll - lvy) * 1.4;
                double lvC = Math.Abs((double)lk - lvx) * 0.3;
                double lvD = Math.Abs((double)ll - lvy) * 5.0;
                // ★原版 Utils.Lerp（Utils.cs:107）= value1+(value2-value1)*amount，**无 [0,1]
                //   钳制**。num5 可为小数（steps*1.3，如 49.4），末步 num2 减到负值（-0.6）→
                //   t=-0.012 外扩使个别边界格过 dist<r 门被腔壁壳激活——原版行为，保留裸除。
                //   曾镜像 JS 旧偏差钳 t 到 [0,1]（湖缘丢 6 格腔壁壳激活）——已翻回。
                double lt = lnum2 / lnum5;
                lvA = lvA + (lvC - lvA) * lt;
                lvB = lvB + (lvD - lvB) * lt;
                double ldist = Math.Sqrt(lvA * lvA + lvB * lvB);
                int lti = ll * W + lk;
                if (ldist < lnum4 * 0.4)
                {
                    if (ll >= lj)
                    {
                        if (ll <= lj + 1)
                        {
                            // WillWaterPlacedHereStayPut（cs:79059-79067）1:1：下/左/右三格
                            // 全部满足 (active && tileSolid && !tileSolidTop) || liquid==255
                            // 才放得住。曾只查"下方 active 且自身无液体"→ 湖缘液体外溢
                            bool Stay(int sx, int sy)
                            {
                                if (sx < 0 || sx >= W || sy < 0 || sy >= H) return false;
                                int si = sy * W + sx;
                                if (liq[si] == 255) return true;
                                return act[si] != 0 && SOLID.Contains(typ[si]) && !dgSolidTop.Contains(typ[si]);
                            }
                            if (Stay(lk, ll + 1) && Stay(lk - 1, ll) && Stay(lk + 1, ll))
                            { liq[lti] = 255; liqT[lti] = (byte)lType; }
                        }
                        else { liq[lti] = 255; liqT[lti] = (byte)lType; }
                    }
                    act[lti] = 0;                     // 湖腔掏空（type 保留=幽灵）
                    // cs:80470-80475（L 批）：被清格幽灵 type∈{59,60} → 对左/右/下三邻
                    // SpreadGrass 59→60 即时传播（曾「两侧一致省略」→ ghost 差 59>60×1202）
                    if (typ[lti] == 59 || typ[lti] == 60)
                    {
                        SpreadJungleGrassLake(lk - 1, ll);
                        SpreadJungleGrassLake(lk + 1, ll);
                        SpreadJungleGrassLake(lk, ll + 1);
                    }
                }
                else if (ll > lj + 1 && ldist < lnum4 && liq[lti] == 0)
                {
                    // 腔壁壳（cs:80477-80484）：窄处+★非活性+四邻有墙 →
                    //   type = WallTypeToTerrainTileType[wall] 再激活（漏斗门禁已含 active）
                    if (Math.Abs((double)lk - lvx) * 0.8 < lnum4 && act[lti] == 0 && wal[lti] > 0
                        && wal[ll * W + lk - 1] > 0 && wal[ll * W + lk + 1] > 0 && wal[(ll + 1) * W + lk] > 0)
                    {
                        typ[lti] = WallToTerrain(wal[lti]);
                        act[lti] = 1;
                    }
                }
                else
                {
                    // 首步上方漏斗入口
                    if (ll >= lj || lnum2 != lnum5 - 1.0 || !((double)ll > gvWorldSurfaceLow - 20.0) || act[lti] == 0 || CLOUDS.Contains(typ[lti])) continue;
                    double fx = Math.Abs(lk - li) * 0.7;
                    double fy = Math.Abs(ll - lEntr) * 1.35;
                    ldist = Math.Sqrt(fx * fx + fy * fy);
                    double lnum12 = lnum4 * 0.4;
                    double lnum13 = (double)Math.Abs(lk - li) / (double)(lx1 - li);
                    lnum13 = 1.0 - lnum13;
                    lnum13 *= 2.3;
                    lnum13 *= lnum13;
                    lnum13 *= lnum13;
                    if (ll < lEntr && fx < lnum12 + (double)Math.Abs(ll - lEntr) * 0.5 * lnum13)
                    {
                        act[lti] = 0;
                        // cs:80512-80519（L 批）：漏斗挖掘同样触发 59→60 邻格传播
                        if (typ[lti] == 59 || typ[lti] == 60)
                        {
                            SpreadJungleGrassLake(lk - 1, ll);
                            SpreadJungleGrassLake(lk + 1, ll);
                            SpreadJungleGrassLake(lk, ll + 1);
                        }
                    }
                }
            }
        }
        lvx += lv2x; lvy += lv2y;
        lv2x += (int)r.Next(-100, 101) * lnum3;
        lv2y += (int)r.Next(-100, 101) * 0.01;
        if (lv2x > 1.0) lv2x = 1.0;
        if (lv2x < -1.0) lv2x = -1.0;
        if (lv2y > 1.0) lv2y = 1.0;
        double lfloor = 0.5 * (1.0 - lnum2 / lnum5);
        if (lv2y < lfloor) lv2y = lfloor;
    }
}
{
    double lkNum = W / 4200.0;
    int lkTries = (int)r.Next((int)(lkNum * 3.0), (int)(lkNum * 6.0));
    var lkX = new List<int>();
    lkXOut = lkX;
    int lkNum3 = W / 4;
    for (int lki = 0; lki < lkTries; lki++)
    {
        if (lkX.Count >= 50 - 1) break;                       // GenVars.maxLakes = 50
        while (lkNum3 > 0)
        {
            bool lkFlag = false;
            lkNum3--;
            int lkX0 = (int)r.Next(340, W - 340);              // lakesBeachAvoidance = 320+20
            while ((double)lkX0 > W * 0.45 && (double)lkX0 < W * 0.55) lkX0 = (int)r.Next(340, W - 340);
            for (int j = 0; j < lkX.Count; j++)
                if (Math.Abs(lkX0 - lkX[j]) < 150) { lkFlag = true; break; }
            for (int k = 0; k < mCaveX.Count; k++)
                if (Math.Abs(lkX0 - mCaveX[k]) < 100) { lkFlag = true; break; }
            for (int l = 0; l < tunX.Count; l++)
                if (Math.Abs(lkX0 - tunX[l]) < 100) { lkFlag = true; break; }
            if (lkFlag) continue;
            int lkY = (int)gvWorldSurfaceLow - 20;
            while (act[lkY * W + lkX0] == 0)
            {
                lkY++;
                if ((double)lkY >= (double)worldSurface || wal[lkY * W + lkX0] > 0) { lkFlag = true; break; }
            }
            if (!lkFlag && typ[lkY * W + lkX0] == 53) { lkFlag = true; }
            if (lkFlag) continue;
            for (int m = lkX0 - 50; m <= lkX0 + 50; m++)
                for (int n = lkY - 50; n <= lkY + 50; n++)
                {
                    if (m < 0 || m >= W || n < 0 || n >= H) continue;
                    // ★原版不判 active：type==203/25（猩红石/黑檀石）即拒
                    if (typ[n * W + m] == 203 || typ[n * W + m] == 25) { lkFlag = true; break; }
                }
            if (lkFlag) continue;
            int lkAnchor = lkY;
            while (!SolidTileGen(lkX0 - 20, lkY) || !SolidTileGen(lkX0 + 20, lkY))
            {
                lkY++;
                if ((double)lkY > (double)worldSurface - 50.0) lkFlag = true;
            }
            if (lkFlag) continue;
            // cs:14716 `if (num5 - num7 <= 10)`——下沉 ≤10 格（平坦位）才进入放置路径。
            // 曾写反成 `<= 10 continue`（湖只落在崎岖位，根因级反转）
            if (lkY - lkAnchor > 10) continue;
            for (int m = lkX0 - 60; m <= lkX0 + 60; m++)
            {
                int ty2 = lkY - 20;
                if (m < 0 || m >= W || ty2 < 0 || ty2 >= H) continue;
                if (act[ty2 * W + m] != 0 || wal[ty2 * W + m] > 0) { lkFlag = true; }
            }
            if (lkFlag) continue;
            int lkSolid = 0;
            for (int m = lkX0 - 60; m <= lkX0 + 60; m++)
                for (int n = lkY; n <= lkY + 120; n++)
                {
                    if (m < 0 || m >= W || n < 0 || n >= H) continue;
                    if (SolidTileGen(m, n)) lkSolid++;
                }
            int lkTotal = 121 * 121;
            if (!((double)lkSolid < (double)lkTotal * 0.8))
            {
                // cs:14740-14742：!UndergroundDesertLocation.Intersects(Rectangle(x-8,y-8,16,16))
                // 才放。UndergroundDesertLocation = CombinedArea.Inflate(10,10)
                //（DesertBiome.cs:54-58）；CombinedArea=(dX,dTop,dW,dHiveTop+dH-dTop)
                // ——曾以墙 187/216/217 逐格反推（沙丘墙未及处误收 → 沙漠内出湖）
                int udX0 = Math.Max(0, dX - 10), udY0 = Math.Max(0, dTop - 10);
                int udX1 = Math.Min(W, dX + dW + 10), udY1 = Math.Min(H, dHiveTop + dH + 10);
                bool lkDesert = lkX0 + 8 > udX0 && lkX0 - 8 < udX1 && lkY + 8 > udY0 && lkY - 8 < udY1;
                if (!lkDesert)
                {
                    SonOfLakinater(lkX0, lkY);
                    lkX.Add(lkX0);
                    break;
                }
            }
        }
    }
}
Checkpoint("lakes");
if (Environment.GetEnvironmentVariable("LAKE_DUMP") != null) {
    var lbuf = new byte[W * H * 2]; System.Buffer.BlockCopy(wal, 0, lbuf, 0, lbuf.Length);
    File.WriteAllBytes(Environment.GetEnvironmentVariable("LAKE_DUMP"), lbuf);
    File.WriteAllText(Environment.GetEnvironmentVariable("LAKE_DUMP") + ".act", string.Join("", act.Select(a => a == 0 ? "0" : "1")));
    var tbuf = new byte[W * H * 2]; System.Buffer.BlockCopy(typ, 0, tbuf, 0, tbuf.Length);
    File.WriteAllBytes(Environment.GetEnvironmentVariable("LAKE_DUMP") + ".typ", tbuf);
    File.WriteAllText(Environment.GetEnvironmentVariable("LAKE_DUMP") + ".lakes", string.Join(",", lkXOut ?? new List<int>()));
    return;
}

Replay(); // ▶pass 头重播：Slush cs:14756
// ================= Pass 31 StoneToIceAndSiltPlusMudIntoSlush（cs:14756-14815）=================
{
    for (int sy = snowTopGen; sy < snowBottomGen; sy++)
    {
        for (int sx = snowMinXArr[sy]; sx < snowMaxXArr[sy]; sx++)
        {
            ushort st = typ[sy * W + sx];
            switch (st)
            {
                case 123: typ[sy * W + sx] = 224; break;      // 沙泥→雪泥（不判 active）
                case 59:
                {
                    bool ok = true;
                    for (int k = sx - 3; k <= sx + 3; k++)
                        for (int l = sy - 3; l <= sy + 3; l++)
                        {
                            if (k < 0 || k >= W || l < 0 || l >= H) continue;
                            ushort t2 = typ[l * W + k];
                            if (act[l * W + k] != 0 && (t2 == 60 || t2 == 70 || t2 == 71 || t2 == 72)) { ok = false; break; }
                        }
                    if (ok) typ[sy * W + sx] = 224;
                    break;
                }
                case 1: typ[sy * W + sx] = 161; break;        // 石→冰（不判 active）
            }
        }
    }
}
Checkpoint("slush");
Replay(); // ▶pass 头重播：Dungeon cs:14816（17 内部检查点不中间重播）
// —— DG_ROLL_SEARCH：从本 pass 头流态直推 K 步后的 FNV，反解 x86 真值掷数 ——
//   DG_ROLL_SEARCH2=<hex>:<from>:<to>：任意目标哈希反解（U 批：段级真值掷数定位）
if (Environment.GetEnvironmentVariable("DG_ROLL_SEARCH2") != null)
{
    var parts2 = Environment.GetEnvironmentVariable("DG_ROLL_SEARCH2")!.Split(':');
    var targets2 = new HashSet<uint>(parts2[0].Split(',').Select(s => uint.Parse(s, System.Globalization.NumberStyles.HexNumber)));
    int from2 = int.Parse(parts2[1]), to2 = int.Parse(parts2[2]);
    var probe2 = Activator.CreateInstance(asm.GetType("Terraria.Utilities.UnifiedRandom")!, seed)!;
    for (int k = 0; k < from2; k++) probe2.GetType().GetMethod("Next", Type.EmptyTypes)!.Invoke(probe2, null);
    for (int k = from2; k <= to2; k++)
    {
        uint fv2 = FnvState2(probe2);
        if (targets2.Contains(fv2)) Console.Error.WriteLine($"DG_ROLL_SEARCH2 {fv2:x8} hit at k={k}");
        probe2.GetType().GetMethod("Next", Type.EmptyTypes)!.Invoke(probe2, null);
    }
    Console.Error.WriteLine("DG_ROLL_SEARCH2 done");
}
uint FnvState2(object o)
{
    var urtRS2 = asm.GetType("Terraria.Utilities.UnifiedRandom")!;
    var usa2 = (int[])urtRS2.GetField("SeedArray", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(o)!;
    uint uix2 = (uint)urtRS2.GetField("inext", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(o)!;
    uint fh2 = 2166136261u;
    for (int q = 0; q < 56; q++) { uint v = (uint)usa2[q]; for (int s = 0; s < 32; s += 8) fh2 = (fh2 ^ ((v >> s) & 0xffu)) * 16777619u; }
    for (int s = 0; s < 32; s += 8) fh2 = (fh2 ^ ((uix2 >> s) & 0xffu)) * 16777619u;
    return fh2;
}
if (Environment.GetEnvironmentVariable("DG_ROLL_SEARCH") != null)
{
    var urtRS = asm.GetType("Terraria.Utilities.UnifiedRandom")!;
    dynamic mkState = null;
    var probe = Activator.CreateInstance(urtRS, seed)!;
    uint FnvState(object o)
    {
        var usa = (int[])urtRS.GetField("SeedArray", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(o)!;
        uint uix = (uint)urtRS.GetField("inext", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(o)!;
        uint fh = 2166136261u;
        for (int q = 0; q < 56; q++) { uint v = (uint)usa[q]; for (int s = 0; s < 32; s += 8) fh = (fh ^ ((v >> s) & 0xffu)) * 16777619u; }
        for (int s = 0; s < 32; s += 8) fh = (fh ^ ((uix >> s) & 0xffu)) * 16777619u;
        return fh;
    }
    for (int k = 0; k < 200000; k++) probe.GetType().GetMethod("Next", Type.EmptyTypes)!.Invoke(probe, null);
    for (int k = 200000; k <= 300000; k++)
    {
        uint fv = FnvState(probe);
        if (fv == 0xf890f8a6u) Console.Error.WriteLine($"DG_ROLL_SEARCH truth at k={k}");
        probe.GetType().GetMethod("Next", Type.EmptyTypes)!.Invoke(probe, null);
    }
    Console.Error.WriteLine("DG_ROLL_SEARCH done");
}
// —— DG_ISO=<dumpBase>：隔离重放钩（_d24iso 同款口径，oracle 侧）——
//    用真原版 pass 边界 dump（typ/act/wal/liq 四面）覆写本 pass 输入态，剥离上游
//    未同步段的网格噪声，使 dungeon 段流指纹/网格对拍只反映本段保真度。
//    liquidType 不在 dump 内 → liqT 归零（地牢段清水场景为主，通道外）。
var dgIsoBase = Environment.GetEnvironmentVariable("DG_ISO");
if (dgIsoBase != null)
{
    Buffer.BlockCopy(File.ReadAllBytes(dgIsoBase + ".act"), 0, act, 0, W * H);
    Buffer.BlockCopy(File.ReadAllBytes(dgIsoBase + ".typ"), 0, typ, 0, W * H * 2);
    Buffer.BlockCopy(File.ReadAllBytes(dgIsoBase + ".wal"), 0, wal, 0, W * H * 2);
    Buffer.BlockCopy(File.ReadAllBytes(dgIsoBase + ".liq"), 0, liq, 0, W * H);
    for (int dgi = 0; dgi < W * H; dgi++) liqT[dgi] = 0;
    Console.Error.WriteLine($"DG_ISO loaded {dgIsoBase} (typ/act/wal/liq; liqT zeroed)");
}
// 段级 genRand 掷数对账（DGFLOW）：r 包一层计数器，逐检查点打点（stderr）
r = new DgCR { inner = r };
int DgRolls() => ((object)r) is DgCR dc ? dc.n : -1;
// DG_SEG_HASH=1：DgFlow 追打主流态 FNV（与 vanilla DgSegProbe/PassChainProbe.StreamHash
// 逐字节同构——SeedArray[56]+inext 的 FNV-1a）→ 段级掷数真值对拍（U 批 2026-08-17）
void DgFlow(string tag)
{
    Console.Error.WriteLine($"DGFLOWSEC {tag} rolls={DgRolls()}");
    if (Environment.GetEnvironmentVariable("DG_SEG_HASH") != null)
    {
        var urtSH = asm.GetType("Terraria.Utilities.UnifiedRandom")!;
        var innerR = ((object)r) is DgCR dc2 ? dc2.inner : r;
        var usaSH = (int[])urtSH.GetField("SeedArray", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(innerR)!;
        uint uixSH = (uint)urtSH.GetField("inext", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(innerR)!;
        uint fhSH = 2166136261u;
        for (int q = 0; q < 56; q++) { uint v = (uint)usaSH[q]; for (int s = 0; s < 32; s += 8) fhSH = (fhSH ^ ((v >> s) & 0xffu)) * 16777619u; }
        for (int s = 0; s < 32; s += 8) fhSH = (fhSH ^ ((uixSH >> s) & 0xffu)) * 16777619u;
        Console.Error.WriteLine($"DGSEGHASH {tag} {fhSH:x8}");
    }
}
// —— DG_WATCH=x,y：单格写点观察哨（ChTile/ChWall 全钩）——
int dgWatchIdx = -1;
string dgWriter = "?";
{
    var wEnv = Environment.GetEnvironmentVariable("DG_WATCH");
    if (wEnv != null) { var wx = int.Parse(wEnv.Split(',')[0]); var wy = int.Parse(wEnv.Split(',')[1]); dgWatchIdx = wy * W + wx; }
}
bool dgCTrace = Environment.GetEnvironmentVariable("DG_C_TRACE") != null;   // C/G 箱落位逐 attempt 观测（DG_C_TRACE）
DgCR.LogRolls = Environment.GetEnvironmentVariable("DG_ROLL_LOG") != null;        // 逐掷值日志（DG_ROLL_LOG）
// —— TileObject.CanPlace chest21/467 锚定门常量（Main.cs tileCut/tileNoAttach/tileTable 原值）——
// tileCut（Main.cs:7312-10158 全 41 项）∩ 可放覆盖 = ∖{484,654}；BreakableWhenPlacing（TileID.cs:379）
var DG_TILE_CUT_DG = new HashSet<ushort> { 3,24,28,32,51,52,61,62,69,71,73,74,82,83,84,110,113,115,184,201,205,231,236,254,352,382,444,454,484,485,518,519,528,529,549,636,637,638,654,655,711 };
var DG_BREAK_PLACE_DG = new HashSet<ushort> { 324,186,187,185,165,530,233,227,485,81,624 };
var DG_BOULDERS_DG = new HashSet<ushort> { 138,484,664,665,711,712,713,714,715,716 };
// tileNoAttach（Main.cs:7725-9901 含 435-439 循环）/ anchorInvalidTiles（TileObjectData.cs:2113）
// / Platforms（TileID.cs:243）/ tileTable（Main.cs:9900 段，含 435-439 循环）
var DG_NO_ATTACH_DG = new HashSet<ushort> { 3,4,10,13,14,15,16,17,18,19,20,21,27,50,86,87,88,89,90,91,92,93,94,95,96,97,98,99,101,102,110,114,134,387,388,390,427,435,436,437,438,439,441,467,468,469,486,487,488,489,490,497,507,564,565,568,569,570,572,580,590,593,594,595,615,620,704,707 };
var DG_CHEST_ANCH_INVALID = new HashSet<ushort> { 127,138,664,665,484,711,712,713,714,715,716 };
var DG_PLATFORMS_DG = new HashSet<ushort> { 19,427,435,436,437,438,439 };
var DG_TILE_TABLE_DG = new HashSet<ushort> { 14,18,19,87,88,101,114,275,276,277,278,279,281,285,286,296,297,298,299,309,310,339,358,359,361,362,363,364,376,380,391,392,393,394,405,413,414,427,435,436,437,438,439,469,532,533,538,542,544,550,551,553,554,555,556,558,559,582,599,600,601,602,603,604,605,606,607,608,609,610,611,612,619,629,632,640,643,644,645,710 };
// 锚腿判定（TileObject.cs:376-442 AnchorBottom 链，chest 21/467）：
//   ①SolidTile：tileSolid&&!solidTop&&!noAttach&&!anchorInvalid（FlattenAnchors=false 须
//     blockType()==0——pass 内无半砖/坡（HalfBrick/Smooth 均在后段），恒成立）；
//   ②SolidWithTop|Table：平台（Platforms 含 19/427/435-439）properTopFrame——帧面未建模，
//     P 段平台运行段帧均在 0-7 族（备案：seed1/seed2 实测 G/C 箱腿全 41/43/44 砖，不触达）；
//     或 tileSolid&&tileSolidTop（直过）；或 tileTable（F 段前不存在，恒不触达）；
//   ③SolidSide blockType∈{4,5}：pass 内无半砖/坡，不触达。
//   EmptyTile 不在 chest 锚类型 → 非活动腿恒 false。
bool DgChestLegOK(int lx, int ly)
{
    int li = ly * W + lx;
    if (act[li] == 0) return false;
    ushort t = typ[li];
    bool invalid = DG_CHEST_ANCH_INVALID.Contains(t);
    if (SOLID.Contains(t) && !dgSolidTop.Contains(t) && !DG_NO_ATTACH_DG.Contains(t) && !invalid) return true;
    if (DG_PLATFORMS_DG.Contains(t)) return !invalid;
    if (SOLID.Contains(t) && dgSolidTop.Contains(t)) return true;
    if (DG_TILE_TABLE_DG.Contains(t)) return true;
    return false;
}
// ================= Pass 32 Dungeon（cs:14816 + DungeonCrawler.cs + Legacy* 全家 1:1）=================
// ★2026-08-17 oracle 侧同步终态（对照 /tmp/sw-num4/van_x86_g/032_Dungeon.* 真值，DG_ISO 隔离重放）：
//   已同步 §5 全 8 件（A1 房位不回写/A2 steps 掷序/A3 门洞半边墙+eb.Upd/B1 走廊门 Fluff10/
//   B2 平台 hf 房3廊5/B3 书架注释/B4 吊灯墙门）+ 新发现两件（见各 ★ 注）：
//   · GenerateDungeonStairs 整段缺失（HasStairs 普通世界=TRUE）→ 堡右 45° 阶梯 ~3.9k 格已补；
//   · 门洞 Bounds.UpdateBounds 缺（仅影响 BiomeChests 排除带）。
//   ★2026-08-17 终清批重定位（推翻旧 (207,876) 墙带假说，方法与证据链）：
//   · 掷数真值精确锚定：DG_ROLL_SEARCH 从本 pass 头流态直推 → x86 真值 FNV f890f8a6 命中
//     **k=243,293**（oracle 232,392，差 -10,901 属实）。
//   · (207,876) 洗清：pit a44(199,865,w8) 全部门读（±width 墙/锚/清障窗/内盒门）与 vanilla
//     逐格核对一致——DgHall 墙带写语义无差；该格 oracle 墙 9 系 pre-pit 大厅带真值
//     （vanilla-final 亦 9），旧"oracle 有 9/vanilla 无"为跨段误读。
//   · 真根因=pre-pit 流位差 + 后段转录差：vanilla 首个 pit 命中（真值流唯一签名）
//     k=6977=x3 343/y2 836/w 16/h 27/num2 870/num 881（洪泛盒 [327..359]×[870..908] 逐格
//     实证，num44=337=worldSurface），为 6 掷/attempt 布局 → vanilla Pi 段起点 k0≡6977 mod 6
//     （≠oracle 6664≡4 mod 6）。DG_SET_ROLLS 全模族扫描：k0≡0/1/2/3/4/5(mod 6) 各得
//     206,241/225,844/214,444/226,926/232,392/209,351（模族内平移不变——pit 值序列随 6 掷
//     平移完全重复），无一=243,293 ⇒ 除 k0 残差外，S/D/W/P/C/B/G/I/T/F/Pa/Ba 段仍有
//     转录掷差（族内最大 232,392 距真值仍 -10,901）。
//   · Pit 转录本体无罪：k0=6665 直跑 Python 全 gate 复算+写集仿真，洪泛对拍 5,037,446/
//     5,040,000=99.95% 一致（残差来自简化 solid 模型，非转录）。
//   诊断钩（本批新增）：DG_ROLL_SEARCH（真值掷数反解）、DG_WATCH=x,y（单格写点观察哨，
//   ChTile/ChWall 全钩带 writer 态）、DG_PIT_FAIL_AT=n（强拒某 pit——判翻转归因）、
//   DG_PREPIT_EXTRA=N / DG_SET_ROLLS=k（流位拨针——k0 模族定标）、PIT num44 首attempt打印。
//   ★2026-08-17 凌晨终清批（详见 docs/worldgen/content-parity-vs-vanilla-2026-08-16.md #32 三件）：
//   · k0 定界完成：family≡5 组全门仿真（/tmp/dgu/pitgates.py）在静态 pre-pit 网格仅 6731/6977
//     命中 ⇒ k0_v∈[6737,6977]（≡5 mod 6）；DG_SET_ROLLS=6977 时 oracle 首 hit=(343,836,16,27)
//     逐位复现真值、Pi=9433 与 pitloop.py 仿真一致（pit2/3 与真值 blob 精确一致）。
//   · F 段三漏掷已补（椅 Next(2) 方向/床/浴缸 Next(2) dir）；Place* 家族 14 helper（DgP*）+
//     TILE_TABLE/TILE_LIGHTED 全表替换 DgPlaceSimple 一格近似；B 段书/瓶 OnTable1x1、Pa 三型
//     墙挂（240/241/242）、Ba PlaceBanner。END(k0=6977)=237,730（真值 243,293，残 -5,563）。
//   · 残差定位：S/D/W/P(0掷正确)/C/B(书177/178)/I(灯笼56=56)/T(飞镖8=8) 全对齐 ⇒ 债在 F 内部
//     自级联，根因=G 段宝箱落位（TileObject.CanPlace 锚点调整未移植，15/18 箱位差）。
//     B 段 61% 嫌疑排除（Default 样式 item 数组全 int[0]，无 GetPlatformStyle 掷）。
//   · JS 侧 468 格垛口差=rig 假差（_dgestairs 缺 Dunes reseed→entSeed 落 #17259 而非 #4），
//     已修，JS↔oracle E 四通道 0 差。JS DungeonPass 已同构镜像（14 helper+3 漏掷+tileLighted 门）。
//   ★2026-08-17 U 批收官（三探针 IL 注入 vanilla 实证：DgSegProbe=UpdateDungeonProgress 头
//   19 点段级流指纹 / DgChestProbe=AddBuriedChest 7 参入口 / DgItemProbe=SetDefaults·Prefix
//   / DgCanPlaceProbe=TileObject.CanPlace / DgPlaceTileProbe+DgTileFrameProbe——app 副本
//   /tmp/dgu/TerrariaSeg.app + segpatch Cecil 注入器，全 /tmp 不触共享 app）：
//   · **k0_v = 6977 证明**：DG_SEG_HASH 段级指纹 ↔ vanilla DgSegProbe 逐段对拍——
//     Pi=3b7d0182 / S=5358192a / D=3cafec22 / W=P=2214dd4d **四段哈希逐位全等**
//     （Mark(p) 语义=该段前流态；DG_SET_ROLLS=6977 即 vanilla 真位）。
//   · **C 段收口（roll=14400/hash=6e16ad9d 双精确）**，三根因（JS 侧同步）：
//     ① TileObject.CanPlace 锚定门全链（DgChestLegOK 双腿 SolidTile 路 + 内盒可切覆盖
//       + 边界 5 垫 + 巨石双腿读 typ）；
//     ② cs:37578 单次落位语义——PlaceChest 败即 return false（k 扫描只在首实心行掷一次；
//       DgCanPlaceProbe 实证失败调用恰 1 条 CanPlace 记录，旧续扫=箱位差第二根因）；
//     ③ 上锁箱尾段三掷：flag9 Next(8)（:37432 无 !flag10 门，21 块内）+ (num9∈23..27
//       &&Next(2)) 残片（:37476）/ 467 块 (num9==13&&Next(2))（:37543）+ Next(12) 命中
//       再 GetRandomVoiceItem=Next(14)（DgItemProbe 逐 SetDefaults 段账实证 +1/箱）。
//     另修：PlaceOnTable1x1 书 50 命中即 frameX=18*Next(5)（cs:45377，B 段 177 本全带）。
//   · 残余（-6,183 → END=237,110）：**B 段 +2,092**（oracle 158,133 vs vanilla 156,041）——
//     224 件书/瓶/烛 PlaceTile 事件全对齐（k 逐位），首分歧在尾段（末书 k=151,816 后
//     vanilla 另落 ~9 座隐形书架（flag3=false 无书无瓶）为本端口所拒；TileFrame 平台
//     帧副作用为首选嫌疑——书架 tile 写后 TileFrameImportant(19) 递归邻格可改实占）；
//     G/F/Pa/Ba 段随之全数流偏（19/19 箱数已对，7/19 箱位待 B 收口后收敛）。
//     E 段 pre-pit +313（oracle 6664 vs vanilla 6977）维持 DG_SET_ROLLS 拨针备案。
//   下一步：① B 段 TileFrame(19) 平台帧副作用建模（DgTileFrameProbe 已采证）；
//   ② B 收口后 G/F 对拍；③ E 段 +313 根因（pre-pit 上游）。
// 普通世界 = Legacy 路径：LegacyDungeonLayoutProvider(LegacyDungeonLayout) +
// LegacyDungeonHall / LegacyEntranceDungeonHall / LegacyDungeonRoom / LegacyDungeonEntrance
// + DungeonGlobal{Early/Spikes/Doors/WallVariants/Platforms/BiomeChests/Bookshelves/
//   BasicChests/Lights/Traps/GroundFurniture/Paintings/Banners/Late} 特征管线。
// ★掷骰位移说明（2026-08-16 已消除）：入口类型 2 掷 + entrance RandomSeed
// 原版在 **Dunes pass 头**消耗（cs:11542）——现已随每 pass 重播改造归位 Dunes 头（两侧同步），本注释留档；本 oracle 与 JS 侧
// 同步**延后到本 pass 头**（相对序保持 A→B→Seed→shelf→lantern→skewed）——
// pre-dungeon 检查点哈希保持现状，两端口径一致。
var dgUR = asm.GetType("Terraria.Utilities.UnifiedRandom")!;
// ★DC:344 MakeDungeon 头 `Main.tileSolid[481/482/483] = false`（裂纹砖族，Main.cs:7865-69
//   初值 true）——JS 侧 TILE_DEFS 已预翻 solid:false（数据不可动）+ WorldGen 接线时间线
//   存档；生成期实心查询自本 pass 起恒非实心（还原点 SmoothWorld 头 cs:16510 在
//   Beaches 之后，不在本 oracle 覆盖段）
SOLID.Remove((ushort)481); SOLID.Remove((ushort)482); SOLID.Remove((ushort)483);
int dgBrick = dungeonTheme == 0 ? 41 : dungeonTheme == 1 ? 43 : 44;          // SetupDungeonGenVarVariables（cs:63-93）
int dgWall = dungeonTheme == 0 ? 7 : dungeonTheme == 1 ? 8 : 9;
int dgCrack = dungeonTheme == 0 ? 481 : dungeonTheme == 1 ? 482 : 483;
var dgWallVariants = new int[3];                                              // SetupDungeonDataVariables（cs:202-221）
if (dgWall == 8) { dgWallVariants[0] = 8; dgWallVariants[1] = 98; dgWallVariants[2] = 99; }
else if (dgWall == 9) { dgWallVariants[0] = 9; dgWallVariants[1] = 96; dgWallVariants[2] = 97; }
else { dgWallVariants[0] = 7; dgWallVariants[1] = 94; dgWallVariants[2] = 95; }
// outerPotentialDungeonBounds（CreatePotentialDungeonBounds，DungeonUtils.cs:2058-2077：
// percentInMiddle=0.10/percentOnEdges=0.05；入口下延段的跳过带用）
double dgPotTp = (worldSurface + 10.0) / (double)H;
double dgPotBt = ((double)(H - 200) - 10.0) / (double)H;
int dgPotL = dungeonRight ? (int)(W * (0.5 + 0.05000000074505806)) : (int)(W * 0.05000000074505806);
int dgPotR = dungeonRight ? W - (int)(W * 0.05000000074505806) : (int)(W * (0.5 - 0.05000000074505806));
int dgPotT = Math.Clamp((int)((double)H * dgPotTp), 10, H - 10);
int dgPotB = Math.Clamp((int)((double)H * dgPotBt), 10, H - 10);
dgPotL = Math.Clamp(dgPotL, 10, W - 10); dgPotR = Math.Clamp(dgPotR, 10, W - 10);
// （入口三掷 dgEntA/dgEntB/dgEntSeed 已随每 pass 重播改造归位 Dunes pass 头）
var dgShelf = new int[3];           // cs:243-254 书架平台样式（三选不重复）
dgShelf[0] = (int)r.Next(9, 13);
do { dgShelf[1] = (int)r.Next(9, 13); } while (dgShelf[1] == dgShelf[0]);
dgShelf[2] = (int)r.Next(9, 13);
while (dgShelf[2] == dgShelf[0] || dgShelf[2] == dgShelf[1]) dgShelf[2] = (int)r.Next(9, 13);
var dgLantern = new int[3];         // cs:255-266 灯笼样式
dgLantern[0] = (int)r.Next(7);
do { dgLantern[1] = (int)r.Next(7); } while (dgLantern[1] == dgLantern[0]);
dgLantern[2] = (int)r.Next(7);
while (dgLantern[2] == dgLantern[0] || dgLantern[2] == dgLantern[1]) dgLantern[2] = (int)r.Next(7);
var dgBanner = new int[6] { 10, 11, 12, 13, 14, 15 };                          // cs:267-273
// 全量 tileFrameImportant（411 项）——★2026-08-17 上移至头部表区（desert 段
// CanPoundGen 先于 dungeon 执行，顶层语句变量须先声明）；此处仅存指针。
bool dgSkewed = (int)r.Next(4) == 0;                                           // cs:274 useSkewedDungeonEntranceHalls
// ★XX 批（2026-08-18）：PrecalculateEntrancePosition 拒绝环（DungeonCrawler.cs:275-322）。
//   入口类型掷②==0→Tower/①==0→Dome（Dunes 头掷，dgEntA/dgEntB）＝precalc 路径；
//   RoughHeight Tower120/Dome55。3000 次尝试：Next(200) 偏移 ±100 → 海滩带内自 y=10
//   下爬首 active/liquid/wall → 双云层排除（TileID.Sets.Clouds={189,196,460,717,718,719}，
//   AreAnyTilesInSetNearby 方形 ±15/±50）+ num2-40-rough>0。成功改写 genVars.dungeonLocation
//   （+25-Next(50)，pass :14827 随后读到新值）；失败回退 Legacy（无掷）。Legacy 种子零触碰。
int dgEntKind = dgEntB == 0 ? 2 : (dgEntA == 0 ? 1 : 0);
// 窗口样式表（Tower/Dome 窗族消费；声明前置——局部函数定赋值分析要求）
int dgWinGlass = dungeonTheme == 0 ? 91 : dungeonTheme == 1 ? 92 : 90;
int dgWinClosed = dungeonTheme == 0 ? 96 : dungeonTheme == 1 ? 94 : 98;
int dgWinEdge = dungeonTheme == 0 ? 8 : dungeonTheme == 1 ? 9 : 7;
int dgWinPlatStyle = dungeonTheme == 0 ? 8 : dungeonTheme == 1 ? 7 : 6;
var dgClouds = new HashSet<ushort> { 189, 196, 460, 717, 718, 719 };
bool DgCloudsNear(int cx, int cy, int dist)
{
    for (int x = cx - dist; x <= cx + dist; x++)
        for (int y = cy - dist; y <= cy + dist; y++)
        {
            if (x < 0 || x >= W || y < 0 || y >= H) continue;
            int i = y * W + x;
            if (act[i] != 0 && dgClouds.Contains(typ[i])) return true;
        }
    return false;
}
int dgLoc = dungeonLocation;
int dgEntX = 0, dgEntY = 0; bool dgPrecalcOK = false;    // dungeonEntrancePosition（Zero=未预计算）
if (dgEntKind != 0)
{
    int rough = dgEntKind == 2 ? 120 : 55;
    int tries = 3000;
    while (true)
    {
        tries--;
        if (tries <= 0) break;
        int nx = dgLoc - 100 + (int)r.Next(200);
        if (nx > 380 && nx < W - 380)                    // WorldGen.beachDistance（cs:4102）
        {
            int ny = 10;
            while (ny < H && act[ny * W + nx] == 0 && liq[ny * W + nx] <= 0 && wal[ny * W + nx] <= 0) ny++;
            if (!DgCloudsNear(nx, ny, 15) && !DgCloudsNear(nx, Math.Max(50, ny - 50), 50) && ny - 40 - rough > 0)
            {
                dgLoc = nx + 25 - (int)r.Next(50);       // genVars.dungeonLocation 改写（:308）
                dgEntX = nx; dgEntY = ny; dgPrecalcOK = true;
                break;
            }
        }
    }
}
int dgDoorStyle = dungeonTheme == 0 ? 16 : dungeonTheme == 1 ? 17 : 18;        // Item 1411/1412/1413 placeStyle（Item.cs:17460/17472/17484）
bool dgShadowKey = false, dgRamRune = false;                   // GenVars.generatedShadowKey/RamRune（AddBuriedChest 用）
if (Environment.GetEnvironmentVariable("DG_ENT_DBG") != null)
    Console.Error.WriteLine($"DGENT A={dgEntA} B={dgEntB} kind={dgEntKind} precalc={dgPrecalcOK} entX={dgEntX} entY={dgEntY} dgLoc={dgLoc}");
// —— 深度锚点（cs:14828-14870）：(ws+rock)/2 ± Next(-200,200)；下方 10 格无实心则下扫
// 到实心；起点即实心则上爬（上限 60）首个非实心再下压 60-num4 ——
int dgX0 = dgLoc;   // ★XX 批：precalc 改写后的 genVars.dungeonLocation（:14827 在 Setup 后读）
int dgY0 = (int)((worldSurface + rockLayer) / 2.0) + (int)r.Next(-200, 200);
{
    int dgCap = (int)((worldSurface + rockLayer) / 2.0) + 200;
    bool dgSol = false;
    for (int k = 0; k < 10; k++) if (DgSolid(dgX0, dgY0 + k)) { dgSol = true; break; }
    if (!dgSol) { while (dgY0 < dgCap && !DgSolid(dgX0, dgY0 + 10)) dgY0++; }
    if (dgSol)
    {
        int n4 = 0;
        while (DgSolid(dgX0, dgY0 - n4)) { n4++; if (n4 == 60) break; }
        if (n4 < 60) dgY0 += 60 - n4;
    }
}
// —— MakeDungeon（DungeonCrawler.cs:327-505）状态 ——
var dgRooms = new List<DRoom>();
var dgHalls = new List<DHall>();
var dgDoors = new List<DDoor>();
var dgPlats = new List<DPlat>();
var dgPits = new List<DBnd>();      // 已落成 DungeonPitTrap 的 Bounds（CanGenerateFeatureAt 门）
var dgBounds = new DBnd();          // data.dungeonBounds
var dgEntBounds = new DBnd();       // dungeonEntrance.Bounds
bool dgEntExists = false;
bool dgEntOnSurface = false;        // createdDungeonEntranceOnSurface
double dgLastHallX = 0.0, dgLastHallY = 0.0;   // lastDungeonHall（Vector2D）
int dgTraceCount = 0;                          // DG_TRACE 幂等计数(dormant)
bool dgPitFlood = true;             // makeNextPitTrapFlooded（cs:345 初值 true）
int dgLootStyle = 0;                // genVars.dungeonLootStyle
int dgPosX, dgPosY, dgTopX;         // generatingDungeonPositionX/Y + generatingDungeonTopX
int dgDungeonX = 0, dgDungeonY = 0; // Main.dungeonX/Y（老头锚；Early pit 陷阱 num44 下限用）

// —— ★2026-08-17 终清批：Place* 家族（帧不入 dump 四通道，只保成功判定+写集
//    footprint——对拍口径 act/typ/wal；Main.cs tileTable/tileLighted 全表提取）——
var TILE_TABLE = new HashSet<ushort> { 14,18,19,87,88,101,114,275,276,277,278,279,280,281,285,286,296,297,298,
   299,309,310,339,358,359,361,362,363,364,376,380,391,392,393,394,405,413,414,427,469,532,533,538,542,
   544,550,551,553,554,555,556,558,559,582,599,600,601,602,603,604,605,606,607,608,609,610,611,612,619,
   629,632,640,643,644,645,710 };
var TILE_LIGHTED = new HashSet<ushort> { 4,17,19,20,22,26,27,31,33,34,35,37,42,49,58,61,70,71,72,76,77,83,
   84,92,93,95,96,98,100,109,125,126,129,133,140,149,160,171,173,174,184,190,204,209,215,237,238,270,271,
   286,302,316,317,318,327,336,340,341,342,343,344,346,347,348,349,350,354,356,370,372,381,390,391,405,
   415,416,417,418,429,463,491,500,501,502,503,517,519,528,534,535,536,537,539,540,548,564,568,569,570,
   572,578,580,581,582,592,593,594,597,598,613,614,619,620,625,626,627,628,633,634,637,638,646,656,658,
   659,660,663,667,684,687,688,689,690,691,692,695,696,699,701,703,708,711,717,718,719,739 };
void DgWr(int x, int y, int t) { int ti = y * W + x; act[ti] = 1; typ[ti] = (ushort)t; }
bool DgClr(int x, int y) { return DgInWorld(x, y, 0) && act[y * W + x] == 0; }
// Place3x2（cs:52097 桌14/钢琴87/梳妆台88/长凳89）：x-1..x+1 × y-1..y 净空 + 逐列 SolidTile2(y+1)
bool DgP3x2(int x, int y, int t)
{
    if (x < 5 || x > W - 5 || y < 5 || y > H - 5) return false;
    for (int i = x - 1; i < x + 2; i++)
    {
        for (int j = y - 1; j < y + 1; j++) if (!DgClr(i, j)) return false;
        if (!DgSolid2(i, y + 1)) return false;
    }
    for (int i = x - 1; i < x + 2; i++) for (int j = y - 1; j < y + 1; j++) DgWr(i, j, t);
    return true;
}
// Place2x1（cs:47371 工作台18）：x..x+1 × y 净空 + 两列 SolidTile2(y+1)；103 骷髅=桌上版（tileTable 支撑）
bool DgP2x1(int x, int y, int t)
{
    bool skull = t == 103;
    for (int i = x; i <= x + 1; i++)
    {
        if (!DgClr(i, y)) return false;
        int bi = (y + 1) * W + i;
        if (skull) { if (act[bi] == 0 || !TILE_TABLE.Contains(typ[bi])) return false; }
        else if (!DgSolid2(i, y + 1)) return false;
    }
    DgWr(x, y, t); DgWr(x + 1, y, t);
    return true;
}
// Place1x2（cs:46665 椅15）：SolidTile2(x,y+1) 且 (x,y-1) 净空 → (x,y-1)+(x,y)
bool DgP1x2(int x, int y, int t)
{
    if (!DgSolid2(x, y + 1) || !DgClr(x, y - 1)) return false;
    if (!DgClr(x, y)) return false;
    DgWr(x, y - 1, t); DgWr(x, y, t);
    return true;
}
// PlaceOnTable1x1（cs:45346 蜡烛33/水瓶49/书50/瓶13）：净空 + 下方 nactive 且 tileTable
// ★type 50 书：命中放置即 frameX = 18*Next(5)（cs:45377）——每次成功的书放置耗 1 骰
//   （DgPlaceTileProbe 实证 B 段 177 本书全带此掷；曾漏掷 → B 段流偏）
bool DgPOnTable(int x, int y, int t)
{
    if (!DgClr(x, y) || !DgInWorld(x, y + 1, 0)) return false;
    int bi = (y + 1) * W + x;
    if (act[bi] == 0 || !TILE_TABLE.Contains(typ[bi])) return false;
    DgWr(x, y, t);
    if (t == 50) r.Next(5);                          // cs:45377 frameX=18*Next(5)
    return true;
}
// Place2xX（cs:39705 钟104 h5/雕像105 h3）：x..x+1 × y-h+1..y 净空 + 两列 SolidTile2
bool DgP2xX(int x, int y, int t, int hgt)
{
    for (int j = y - hgt + 1; j <= y; j++)
        if (!DgClr(x, j) || !DgClr(x + 1, j)) return false;
    if (!DgSolid2(x, y + 1) || !DgSolid2(x + 1, y + 1)) return false;
    for (int j = y - hgt + 1; j <= y; j++) { DgWr(x, j, t); DgWr(x + 1, j, t); }
    return true;
}
// Place1xX（cs:39203 路灯93 h3）：单列净空+无液 + SolidTile2(x,y+1)
bool DgP1xX(int x, int y, int t, int hgt)
{
    for (int j = y - hgt + 1; j <= y; j++)
        if (!DgClr(x, j) || liq[y * W + x] > 0) return false;
    if (!DgSolid2(x, y + 1)) return false;
    for (int j = y - hgt + 1; j <= y; j++) DgWr(x, j, t);
    return true;
}
// Place3x4（cs:51943 书架101）：x-1..x+1 × y-3..y 净空 + 逐列 SolidTile2
bool DgP3x4(int x, int y, int t)
{
    for (int i = x - 1; i < x + 2; i++)
    {
        for (int j = y - 3; j < y + 1; j++) if (!DgClr(i, j)) return false;
        if (!DgSolid2(i, y + 1)) return false;
    }
    for (int i = x - 1; i < x + 2; i++) for (int j = y - 3; j < y + 1; j++) DgWr(i, j, t);
    return true;
}
// Place4x2（cs:50534 床79/浴缸90 direction）：x-1..x+2 × y-1..y 净空 + 逐列 SolidTile2
bool DgP4x2(int x, int y, int t, int dir)
{
    if (x < 5 || x > W - 5 || y < 5 || y > H - 5) return false;
    for (int a = x - 1; a < x + 3; a++)
    {
        for (int b = y - 1; b < y + 1; b++) if (!DgClr(a, b)) return false;
        if (!DgSolid2(a, y + 1)) return false;
    }
    for (int a = x - 1; a < x + 3; a++) for (int b = y - 1; b < y + 1; b++) DgWr(a, b, t);
    return true;
}
// Place2x2（cs:51352 烛台100）：x-1..x × y-1..y 净空 + 下方活性且（SolidTile2 或 tileTable）
bool DgP2x2(int x, int y, int t)
{
    for (int i = x - 1; i < x + 1; i++)
    {
        for (int j = y - 1; j < y + 1; j++) if (!DgClr(i, j)) return false;
        int bi = (y + 1) * W + i;
        if (act[bi] == 0 || (!DgSolid2(i, y + 1) && !TILE_TABLE.Contains(typ[bi]))) return false;
    }
    for (int i = x - 1; i < x + 1; i++) for (int j = y - 1; j < y + 1; j++) DgWr(i, j, t);
    return true;
}
// Place3x3（cs:53549 354/355 分支A）：x-1..x+1 × y-2..y 净空 + 逐列 SolidTile2(y+1)
bool DgP3x3(int x, int y, int t)
{
    for (int i = x - 1; i < x + 2; i++)
    {
        for (int j = y - 2; j < y + 1; j++) if (!DgClr(i, j)) return false;
        if (!DgSolid2(i, y + 1)) return false;
    }
    for (int i = x - 1; i < x + 2; i++) for (int j = y - 2; j < y + 1; j++) DgWr(i, j, t);
    return true;
}
// Place3x3Wall（cs:44281 画240）：3×3 净空 + wall≠0
bool DgP3x3Wall(int x, int y, int t)
{
    for (int i = x - 1; i < x + 2; i++)
        for (int j = y - 1; j < y + 2; j++)
            if (!DgClr(i, j) || wal[j * W + i] == 0) return false;
    for (int i = x - 1; i < x + 2; i++) for (int j = y - 1; j < y + 2; j++) DgWr(i, j, t);
    return true;
}
// Place4x3Wall（cs:44874 画241）：x-1..x+2 × y-1..y+1 净空 + wall≠0
bool DgP4x3Wall(int x, int y, int t)
{
    for (int i = x - 1; i < x + 3; i++)
        for (int j = y - 1; j < y + 2; j++)
            if (!DgClr(i, j) || wal[j * W + i] == 0) return false;
    for (int i = x - 1; i < x + 3; i++) for (int j = y - 1; j < y + 2; j++) DgWr(i, j, t);
    return true;
}
// Place6x4Wall（cs:44959 画242）：x-2..x+3 × y-2..y+1 净空 + wall≠0
bool DgP6x4Wall(int x, int y, int t)
{
    for (int i = x - 2; i < x + 4; i++)
        for (int j = y - 2; j < y + 2; j++)
            if (!DgClr(i, j) || wal[j * W + i] == 0) return false;
    for (int i = x - 2; i < x + 4; i++) for (int j = y - 2; j < y + 2; j++) DgWr(i, j, t);
    return true;
}
// PlaceBanner（cs:46270 旗91）：(x,y-1) 活性+solid+非solidTop；(x,y..y+2) 净空 → 竖 3 格
bool DgPBanner(int x, int y, int t)
{
    int ui = (y - 1) * W + x;
    if (!DgInWorld(x, y - 1, 0) || act[ui] == 0 || !SOLID.Contains(typ[ui]) || dgSolidTop.Contains(typ[ui])) return false;
    if (!DgClr(x, y) || !DgClr(x, y + 1) || !DgClr(x, y + 2)) return false;
    DgWr(x, y, t); DgWr(x, y + 1, t); DgWr(x, y + 2, t);
    return true;
}
double dgS1X = (int)r.Next(25, 30), dgS1Y = (int)r.Next(20, 25);   // cs:349-352
double dgS2X = (int)r.Next(35, 50), dgS2Y = (int)r.Next(10, 15);
int dgNum = W / 60; dgNum += (int)r.Next(0, dgNum / 3);             // cs:353-355（dungeonStepScalar=1）
dgPosX = dgX0; dgPosY = dgY0;
dgBounds.Set(dgX0, dgY0, dgX0, dgY0);
DgLayout(dgNum);                                   // LegacyDungeonLayoutProvider.LegacyDungeonLayout
// cs:374-396：默认地牢取**已生成房间中最高的 InnerBounds 顶部中心**回写 generatingDungeonPosition
{
    var ib = dgRooms[0].Inner;
    float bx = (ib.L + ib.R) / 2f, by = ib.T;
    for (int i = 1; i < dgRooms.Count; i++)
    {
        if (!dgRooms[i].Generated) continue;
        var b2 = dgRooms[i].Inner;
        float cx = (b2.L + b2.R) / 2f, cy = b2.T;
        if (cy < by) { bx = cx; by = cy; }
    }
    dgPosX = (int)bx; dgPosY = (int)by; dgTopX = (int)bx;
}
Checkpoint("dungeonL"); DgFlow("L");
if (Environment.GetEnvironmentVariable("DGL_DUMP") != null) {
    var dgbuf = new byte[W * H * 2]; System.Buffer.BlockCopy(typ, 0, dgbuf, 0, dgbuf.Length);
    File.WriteAllBytes(Environment.GetEnvironmentVariable("DGL_DUMP"), dgbuf);
    File.WriteAllText(Environment.GetEnvironmentVariable("DGL_DUMP") + ".act", string.Join("", act.Select(a => a == 0 ? "0" : "1")));
    File.WriteAllText(Environment.GetEnvironmentVariable("DGL_DUMP") + ".wall", string.Join(",", wal.Select(a => a.ToString())));
    var inv = new System.Text.StringBuilder();
    inv.AppendLine($"anchor dgX0={dgX0} dgY0={dgY0} dgNum={dgNum} rooms={dgRooms.Count} halls={dgHalls.Count}");
    for (int qi = 0; qi < dgRooms.Count; qi++)
    { var q = dgRooms[qi]; inv.AppendLine($"R{qi} seed={q.Seed} start={q.Start} outer=({q.Outer.L},{q.Outer.T},{q.Outer.R},{q.Outer.B}) inner=({q.Inner.L},{q.Inner.T},{q.Inner.R},{q.Inner.B}) ex={q.EX:F1} ey={q.EY:F1}"); }
    for (int qi = 0; qi < dgHalls.Count; qi++)
    { var q = dgHalls[qi]; inv.AppendLine($"H{qi} seed={q.Seed} forceX={q.ForceX} bounds=({q.Bounds.L},{q.Bounds.T},{q.Bounds.R},{q.Bounds.B}) sx={q.SX:F1} sy={q.SY:F1} ex={q.EX:F1} ey={q.EY:F1} sd=({q.SDX},{q.SDY})"); }
    File.WriteAllText("/tmp/oracle-dg-inventory.txt", inv.ToString());
    return;
}
// —— 爬升入口大厅（cs:398-449）：上限 100 轮；roomDelay 归零后 1/5 且 y>ws+100 时
// 插入 halls(forceX)+room 分支（位置还原）。★XX 批（2026-08-18）precalc 支：
//   MakeDungeon :418-420 改走 GenerateNextEntranceHall_Precalculated（DC.cs:558-585）——
//   dist 循环外定格、amountPassed=(int)dist 递减 Next(10,30)（超余钳 max(1,(int)dist-ap)）、
//   目标 Lerp(currentPos,entrance,ap/dist)、每厅 2 掷；ap<=0 → 出地表。currentPos 为
//   上一厅 lerp 目标（halls 链由目标点接力，与 genVars 终值解耦）。Legacy 支照旧盲爬。
dgEntOnSurface = false;
{
    bool clTr = Environment.GetEnvironmentVariable("DG_CLIMB_TRACE") != null;
    int clIt = 0;
    int roomDelay = 5;
    int guard = 100;
    double curX = dgPosX + 0.0, curY = dgPosY + 0.0;          // currentPos（局部）
    double dist = dgPrecalcOK ? Math.Sqrt((dgEntX - curX) * (dgEntX - curX) + (dgEntY - curY) * (dgEntY - curY)) : 0.0;
    int amountPassed = (int)dist;
    while (!dgEntOnSurface)
    {
        guard--;
        if (guard <= 0) break;
        if (roomDelay > 0) roomDelay--;
        if (clTr) Console.Error.WriteLine($"CLB i{clIt++} g={guard} rd={roomDelay} pos={dgPosX},{dgPosY} rolls={DgRolls()}");
        if (roomDelay == 0 && (int)r.Next(5) == 0 && (double)dgPosY > worldSurface + 100.0)
        {
            roomDelay = 10;
            int sx = dgPosX, sy = dgPosY;
            DgHall(new DHall { Seed = (int)r.Next(), ForceX = false });       // MakeDungeon_GetHallSettings(Legacy)
            if (clTr) Console.Error.WriteLine($"CLB-INSERT hall posAfterHall={dgPosX},{dgPosY}");
            DgRoom(new DRoom { Seed = (int)r.Next(), X = dgPosX, Y = dgPosY, Start = false });
            dgPosX = sx; dgPosY = sy;
        }
        if (dgPrecalcOK)
        {
            int nsteps = (int)r.Next(10, 30);
            if ((double)nsteps > dist - (double)amountPassed) nsteps = Math.Max(1, (int)dist - amountPassed);
            double t = dist > 0 ? amountPassed / dist : 0;
            double tgX = curX + (dgEntX - curX) * t, tgY = curY + (dgEntY - curY) * t;
            DgEntHallPrecalc((int)r.Next(), curX, curY, tgX, tgY);
            amountPassed -= nsteps;
            curX = tgX; curY = tgY;
            if (amountPassed <= 0) dgEntOnSurface = true;
        }
        else
        {
            DgEntHall((int)r.Next());                                         // GenerateNextEntranceHall_Legacy
        }
        if (clTr) Console.Error.WriteLine($"CLB-ENT done pos={dgPosX},{dgPosY} rolls={DgRolls()}");
    }
}
// MakeDungeon_GetEntrance（:450）——Tower=TowerDungeonEntrance（XX 批 1:1）；Dome 体未
// 转录（WorldUtils 形状族另案）——precalc 链照走、入口体以 Legacy 城堡近似（与 JS 同口径）。
if (dgEntKind == 2) { r.Next(); DgTowerEntrance(dgPosX, dgPosY, dgEntSeed); }
else DgEntrance((int)r.Next(), dgEntSeed);   // MakeDungeon_GetEntrance（含 GetEntranceSettings 的 1 颗废弃掷）
Checkpoint("dungeonE"); DgFlow("E");
// —— 门/平台候选收集（cs:456-471：仅 Processed 即 generated 的房/廊）——
for (int i = 0; i < dgRooms.Count; i++) if (dgRooms[i].Generated) DgRoomPlatformsDoors(dgRooms[i]);
for (int i = 0; i < dgHalls.Count; i++) if (dgHalls[i].Generated) DgHallPlatformsDoors(dgHalls[i]);
Checkpoint("dungeonPD"); DgFlow("PD");
if (Environment.GetEnvironmentVariable("DPD_DUMP") != null) {
    var pdbuf = new byte[W * H * 2]; System.Buffer.BlockCopy(wal, 0, pdbuf, 0, pdbuf.Length);
    File.WriteAllBytes(Environment.GetEnvironmentVariable("DPD_DUMP"), pdbuf);
    File.WriteAllText(Environment.GetEnvironmentVariable("DPD_DUMP") + ".act", string.Join("", act.Select(a => a == 0 ? "0" : "1")));
    var pdt = new byte[W * H * 2]; System.Buffer.BlockCopy(typ, 0, pdt, 0, pdt.Length);
    File.WriteAllBytes(Environment.GetEnvironmentVariable("DPD_DUMP") + ".typ", pdt);
    return;
}
// —— DG_PREPIT_EXTRA=N：pit 循环前把主流多拨 N 骰（δ 定标实验：判 vanilla Pi 起点 6665 假说）——
{
    var pe = Environment.GetEnvironmentVariable("DG_PREPIT_EXTRA");
    if (pe != null) { int pn = int.Parse(pe); for (int pq = 0; pq < pn; pq++) r.Next(); Console.Error.WriteLine($"DG_PREPIT_EXTRA consumed {pn}, rolls now {DgRolls()}"); }
    // ★Z 批：DG_SET_ROLLS 硬跳已撤——E 段 +169（PlaceWall 连掷）归位后主流自然
    //   在 k=6833 起坑；坑前 144 掷=24 次 6 掷失败尝试（makeNextPitTrapFlooded=true
    //   短路 Next(8)，首中前每尝试恰 6 骰），第 25 次尝试 k=6977 命中 (343,836)。
    //   旧 6977 拨针的 Pi/S/D/W/P 对拍结论全部保留（自然收敛到同一位）。
}
DgEarly(); Checkpoint("dungeonPi"); DgFlow("Pi");     // DungeonGlobalEarlyDualDungeonFeatures（Default → 仅 pit 陷阱循环）
if (Environment.GetEnvironmentVariable("DGP_DUMP") != null) {
    var dpbuf = new byte[W * H * 2]; System.Buffer.BlockCopy(typ, 0, dpbuf, 0, dpbuf.Length);
    File.WriteAllBytes(Environment.GetEnvironmentVariable("DGP_DUMP"), dpbuf);
    File.WriteAllText(Environment.GetEnvironmentVariable("DGP_DUMP") + ".act", string.Join("", act.Select(a => a == 0 ? "0" : "1")));
    File.WriteAllText(Environment.GetEnvironmentVariable("DGP_DUMP") + ".wall", string.Join(",", wal.Select(a => a.ToString())));
    return;
}
DgSpikes(); Checkpoint("dungeonS"); DgFlow("S");     // DungeonGlobalSpikes
DgDoorsF(); Checkpoint("dungeonD"); DgFlow("D");     // DungeonGlobalDoors
DgWallVariants(); Checkpoint("dungeonW"); DgFlow("W"); // DungeonGlobalWallVariants
DgPlatforms(); Checkpoint("dungeonP"); DgFlow("P");    // DungeonGlobalPlatforms
DgBiomeChests(); Checkpoint("dungeonC"); DgFlow("C");  // DungeonGlobalBiomeChests（5 个上锁生物群系箱）
if (Environment.GetEnvironmentVariable("DGC_DUMP") != null) {
    var dcbbuf = new byte[W * H * 2]; System.Buffer.BlockCopy(typ, 0, dcbbuf, 0, dcbbuf.Length);
    File.WriteAllBytes(Environment.GetEnvironmentVariable("DGC_DUMP"), dcbbuf);
    File.WriteAllText(Environment.GetEnvironmentVariable("DGC_DUMP") + ".act", string.Join("", act.Select(a => a == 0 ? "0" : "1")));
    return;
}
DgBookshelves(); Checkpoint("dungeonB"); DgFlow("B");  // DungeonGlobalBookshelves
if (Environment.GetEnvironmentVariable("DGB_DUMP") != null) {
    var dbbuf = new byte[W * H * 2]; System.Buffer.BlockCopy(typ, 0, dbbuf, 0, dbbuf.Length);
    File.WriteAllBytes(Environment.GetEnvironmentVariable("DGB_DUMP"), dbbuf);
    File.WriteAllText(Environment.GetEnvironmentVariable("DGB_DUMP") + ".act", string.Join("", act.Select(a => a == 0 ? "0" : "1")));
    return;
}
DgBasicChests(); Checkpoint("dungeonG"); DgFlow("G");  // DungeonGlobalBasicChests（房间金箱）
dgBounds.Inflate(25);                     // cs:489-490
DgLights(); Checkpoint("dungeonI"); DgFlow("I");       // DungeonGlobalLights
DgTraps(); Checkpoint("dungeonT"); DgFlow("T");        // DungeonGlobalTraps
DgFurniture(); Checkpoint("dungeonF"); DgFlow("F");    // DungeonGlobalGroundFurniture
DgPaintings(); Checkpoint("dungeonPa"); DgFlow("Pa");   // DungeonGlobalPaintings
if (Environment.GetEnvironmentVariable("DGPB_DUMP") != null) {
    var dppbuf = new byte[W * H * 2]; System.Buffer.BlockCopy(typ, 0, dppbuf, 0, dppbuf.Length);
    File.WriteAllBytes(Environment.GetEnvironmentVariable("DGPB_DUMP"), dppbuf);
    File.WriteAllText(Environment.GetEnvironmentVariable("DGPB_DUMP") + ".act", string.Join("", act.Select(a => a == 0 ? "0" : "1")));
    return;
}
DgBanners(); Checkpoint("dungeonBa"); DgFlow("Ba");     // DungeonGlobalBanners
if (Environment.GetEnvironmentVariable("DGBA_DUMP") != null) {
    var dbabuf = new byte[W * H * 2]; System.Buffer.BlockCopy(typ, 0, dbabuf, 0, dbabuf.Length);
    File.WriteAllBytes(Environment.GetEnvironmentVariable("DGBA_DUMP"), dbabuf);
    File.WriteAllText(Environment.GetEnvironmentVariable("DGBA_DUMP") + ".act", string.Join("", act.Select(a => a == 0 ? "0" : "1")));
    return;
}
// Late 双地牢特征（Default 无 BiomeDungeonRoom/BrickGrass → 纯空转）
Checkpoint("dungeon"); DgFlow("END");   // #32 转录落地（原 slush 同态占位已替换）
// —— Dungeon pass 流指纹（passchain 第 6 列口径：pass 末 Main.rand 态 FNV-1a
//    over SeedArray[56]+inext；x86 真值 f890f8a6，seed 9293480/evil0）——
{
    object rTarget = ((object)r) is DgCR dcr ? dcr.inner : (object)r;
    var urt2 = asm.GetType("Terraria.Utilities.UnifiedRandom")!;
    var usa2 = (int[])urt2.GetField("SeedArray", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(rTarget)!;
    var uix2 = (uint)urt2.GetField("inext", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(rTarget)!;
    uint fh = 2166136261u;
    for (int q = 0; q < 56; q++)
    {
        uint v = (uint)usa2[q];
        for (int s = 0; s < 32; s += 8) fh = (fh ^ ((v >> s) & 0xffu)) * 16777619u;
    }
    for (int s = 0; s < 32; s += 8) fh = (fh ^ ((uix2 >> s) & 0xffu)) * 16777619u;
    Console.Error.WriteLine($"DGFLOW dungeon-rand-fnv={fh:x8} (x86真值 f890f8a6)");
}
// ---- Dungeon 局部函数（均在隐式 Main 作用域内，可前向引用）----
// InAnyPotentialDungeonBounds（outer，fluff=0 → Rectangle.Contains 半开区间）
bool DgPotContains(int x, int y) => x >= dgPotL && x < dgPotR && y >= dgPotT && y < dgPotB;
bool DgSolid(int x, int y)
{
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    int i = y * W + x;
    if (act[i] == 0) return false;
    ushort t = typ[i];
    if (!SOLID.Contains(t) || dgSolidTop.Contains(t)) return false;
    if (t == 481 || t == 482 || t == 483) return false;   // SetCrackedBrickSolidity(false)（cs:344，pass 内恒非实心）
    return true;
}
bool DgIsDW(int w) => w > 0 && WALL_DUNGEON.Contains((ushort)w);          // IsConsideredDungeonWall（DungeonUtils.cs:1904）
bool DgIsDT(int t) => t > 0 && TILE_DUNGEON.Contains((ushort)t);          // IsConsideredDungeonTile（:1843）
bool DgInWorld(int x, int y, int fluff) => x >= fluff && x < W - fluff && y >= fluff && y < H - fluff;
// GetHighestProtectionTypeFromPoint（DungeonUtils.cs:1704）——Legacy 房 _innerShapeData 恒空 →
// 基类实现：OuterBounds.Contains ? Walls : None
int DgProt(int x, int y, List<DRoom> rooms)
{
    int prot = 0;   // 0=None 1=Tiles 2=Walls 3=TilesAndWalls
    for (int k = 0; k < rooms.Count; k++)
    {
        int p = rooms[k].Outer.Contains(x, y) ? 2 : 0;
        if (p == 1) prot = (prot == 2) ? 3 : 1;
        else if (p == 2) prot = (prot == 1) ? 3 : 2;
        else if (p == 3) prot = 3;
        if (prot == 3) break;
    }
    return prot;
}
List<DRoom> DgRoomsInSpots(double sx, double sy, double ex, double ey, int fluff)
{
    // GetAllRoomsInSpots（DungeonUtils.cs:1773）：起点/中点/终点三取样，OuterBounds 含 fluff 缓冲
    var list = new List<DRoom>();
    double mx = sx + (ex - sx) / 2.0, my = sy + (ey - sy) / 2.0;
    for (int i = 0; i < dgRooms.Count; i++)
    {
        var rm = dgRooms[i];
        if (rm.Outer.ContainsF((int)sx, (int)sy, fluff) || rm.Outer.ContainsF((int)mx, (int)my, fluff) || rm.Outer.ContainsF((int)ex, (int)ey, fluff))
            list.Add(rm);
    }
    return list;
}
void DgChTile(int i, ushort t, bool reset)
{
    if (dgWatchIdx >= 0 && i == dgWatchIdx) Console.Error.WriteLine($"WATCH {i%W},{i/W} {dgWriter} ChTile t={t} reset={reset} (prev typ={typ[i]} act={act[i]} wal={wal[i]}) rolls={DgRolls()}");
    if (reset) { typ[i] = 0; wal[i] = 0; liq[i] = 0; liqT[i] = 0; act[i] = 0; }
    act[i] = 1; typ[i] = t;
    half[i] = 0; slope[i] = 0;   // ChangeTileType 无条件 Clear(Slope)（DungeonUtils.cs:1611-1612——
                                 // Tile.Clear(Slope)=halfBrick(false)+slope(0)；JS DungeonPass chTile :361 同款。
                                 // 链外扩展批（2026-08-17）补：曾缺此清位 → 地牢砖格残留上游坡面 203 格，
                                 // 直至 QuickCleanup(e) 首个坡位敏感消费端显形 4 格 typ/act 分歧）
}
void DgChWall(int i, ushort w, bool reset)
{
    if (dgWatchIdx >= 0 && i == dgWatchIdx) Console.Error.WriteLine($"WATCH {i%W},{i/W} {dgWriter} ChWall w={w} reset={reset} (prev typ={typ[i]} act={act[i]} wal={wal[i]}) rolls={DgRolls()}");
    if (reset) { typ[i] = 0; wal[i] = 0; liq[i] = 0; liqT[i] = 0; act[i] = 0; }
    wal[i] = w;
}
// DungeonHall.CanPlaceTileAt（DungeonHall.cs:161）——普通世界：仅非地牢墙处置砖
bool DgCanPlaceTileAt(int idx)
{
    if (DgIsDW(wal[idx]))
    {
        if (act[idx] != 0)
        {
            if (DgIsDT(typ[idx])) return false;          // IsHigherOrEqualTieredDungeonTile：tileDungeon 同档
            return typ[idx] != dgCrack;
        }
        return false;
    }
    return true;
}
// LegacyDungeonLayoutProvider.LegacyDungeonLayout（:25-98）
void DgLayout(int steps)
{
    int maxSteps = steps;
    // ★XX 批（2026-08-18）：LegacyDungeonLayoutProvider.cs:27-31 precalc 起点漂移——
    //   posX=-10+entranceX+Next(20)（1 掷）、posY=entranceY+30。初始 bounds 由
    //   MakeDungeon :348 以（改写后 dungeonLocation,y0）SetBounds——provider 内不重置
    //   （原 new DBnd()+Set(posX,posY) 对 Legacy 与调用点同值冗余、precalc 会错抹锚点）。
    if (dgPrecalcOK) { dgPosX = -10 + dgEntX + (int)r.Next(20); dgPosY = dgEntY + 30; }
    // ★原版 LegacyDungeonLayoutProvider.cs:36-43：起始房前先
    //   `hallSettings.RandomSeed = Next()` + `roomSettings.RandomSeed = Next()` 各掷一颗
    //   （两 settings 仅作模板、每次生成前都会重设种子，故这两掷是纯流消耗）。
    //   曾镜像 JS 旧偏差删掉这两掷（起始房种子前移 2 → 全地牢分叉）——JS 已补回，翻回原版。
    int hallSeed = (int)r.Next();      // legacyDungeonHallSettings.RandomSeed（:37）
    int roomSeed = (int)r.Next();      // legacyDungeonRoomSettings.RandomSeed（:42）
    DgRoom(new DRoom { Seed = (int)r.Next(), X = dgPosX, Y = dgPosY, Start = true });   // 起始房（:44-50）
    int roomDelay = 5;
    while (steps > 0)
    {
        dgBounds.Upd(dgPosX, dgPosY);
        steps--;
        if (roomDelay > 0) roomDelay--;
        if ((roomDelay == 0) & ((int)r.Next(3) == 0))   /* 1456 LegacyDungeonLayoutProvider.cs:61: 非短路and, roomDelay>0 照耗一骰 */
        {
            roomDelay = 5;
            if ((int)r.Next(2) == 0)
            {
                int sx = dgPosX, sy = dgPosY;
                DgHall(new DHall { Seed = (int)r.Next() });
                if ((int)r.Next(2) == 0) DgHall(new DHall { Seed = (int)r.Next() });
                DgRoom(new DRoom { Seed = (int)r.Next(), X = dgPosX, Y = dgPosY, Start = false });
                dgPosX = sx; dgPosY = sy;
            }
            else
            {
                DgRoom(new DRoom { Seed = (int)r.Next(), X = dgPosX, Y = dgPosY, Start = false });
            }
        }
        else
        {
            DgHall(new DHall { Seed = (int)r.Next() });
        }
    }
    DgRoom(new DRoom { Seed = (int)r.Next(), X = dgPosX, Y = dgPosY, Start = false });   // 尾房（:94-96）
}
// LegacyDungeonRoom.LegacyRoom（Rooms/LegacyDungeonRoom.cs:104-304）
void DgRoom(DRoom s)
{
    dynamic rr = Activator.CreateInstance(dgUR, s.Seed)!;
    double num = 1.0 * 1.0;                                   // roomStrengthScalar（StartingRoom→1）
    double num2 = (int)(15.0 * num) + (int)rr.Next(15);
    double vx = (int)rr.Next(-10, 11) * 0.1 * 1.0;            // roomSlantVariantScalar=1
    double vy = (int)rr.Next(-10, 11) * 0.1 * 1.0;
    if (vx == 0.0 && vy == 0.0)
    {
        if ((int)rr.Next(2) == 0) vx = ((int)rr.Next(2) != 0) ? 1 : -1;
        else vy = ((int)rr.Next(2) != 0) ? 1 : -1;
    }
    double px = s.X, py = s.Y - num2 / 2.0;
    double num3 = 1.0;                                        // roomStepScalar（StartingRoom→1）
    int num4 = (int)(10.0 * num3) + (int)rr.Next(10);
    double num5 = num2, num6 = 0.5;                           // roomInteriorToExteriorRatio
    var rm = new DRoom { Seed = s.Seed, X = s.X, Y = s.Y, Start = s.Start, Generated = true };
    rm.Inner.Set((int)px, (int)py, (int)px, (int)py);
    rm.Outer.Set((int)px, (int)py, (int)px, (int)py);
    dgRooms.Add(rm);
    while (num4 > 0)
    {
        num4--;
        int x0 = Math.Max(0, Math.Min(W - 1, (int)(px - num2 * 0.800000011920929 - 5.0)));
        int x1 = Math.Max(0, Math.Min(W - 1, (int)(px + num2 * 0.800000011920929 + 5.0)));
        int y0 = Math.Max(0, Math.Min(H - 1, (int)(py - num2 * 0.800000011920929 - 5.0)));
        int y1 = Math.Max(0, Math.Min(H - 1, (int)(py + num2 * 0.800000011920929 + 5.0)));
        dgBounds.Upd(x0, y0, x1 - 1, y1 - 1);
        rm.Outer.Upd(x0, y0, x1 - 1, y1 - 1);
        int ix0 = Math.Max(0, Math.Min(W - 1, (int)(px - num2 * num6)));
        int ix1 = Math.Max(0, Math.Min(W - 1, (int)(px + num2 * num6)));
        int iy0 = Math.Max(0, Math.Min(H - 1, (int)(py - num2 * num6)));
        int iy1 = Math.Max(0, Math.Min(H - 1, (int)(py + num2 * num6)));
        rm.Inner.Upd(ix0, iy0, ix1 - 1, iy1 - 1);
        for (int x = x0; x < x1; x++)
            for (int y = y0; y < y1; y++)
            {
                int i = y * W + x;
                liq[i] = 0;
                if (!DgIsDW(wal[i])) DgChTile(i, (ushort)dgBrick, true);   // IsHigherOrEqualTieredDungeonWall
            }
        for (int x = x0 + 1; x < x1 - 1; x++)
            for (int y = y0 + 1; y < y1 - 1; y++)
                DgChWall(y * W + x, (ushort)dgWall, false);
        for (int x = ix0; x < ix1; x++)
            for (int y = iy0; y < iy1; y++)
                DgChWall(y * W + x, (ushort)dgWall, true);
        px += vx; py += vy;
        vx = Math.Max(-1.0, Math.Min(1.0, vx + (int)rr.Next(-10, 11) * 0.05 * 1.0));
        vy = Math.Max(-1.0, Math.Min(1.0, vy + (int)rr.Next(-10, 11) * 0.05 * 1.0));
    }
    rm.SX = s.X; rm.SY = s.Y - num2 / 2.0; rm.EX = px; rm.EY = py; rm.Strength = (int)num5;
    // ★2026-08-16 审计 A1：LegacyDungeonRoom **不回写** generatingDungeonPositionX/Y
    //   （1456 全 Rooms 目录零赋值，仅 LegacyDungeonHall.cs:862 / LegacyEntranceDungeonHall.cs:367
    //   两处写）。曾 `dgPosX=(int)px` 使房间后位置瞬移房尾——起始房后首走廊起点、
    //   循环 room-only 分支后续走廊全部错位（原版"房团"形态来源）。已同步 JS 修复摘除。
}
// LegacyDungeonHall.LegacyHall（Halls/LegacyDungeonHall.cs:65-876）
void DgHall(DHall s)
{
    dynamic rr = Activator.CreateInstance(dgUR, s.Seed)!;
    double vx = 0, vy = 0;
    int num = (int)(4.0 * 1.0) + (int)rr.Next(2);             // hallStrengthScalar=1
    double px = dgPosX, py = dgPosY;
    double sx = px, sy = py;
    int num2 = 1;
    double hallStepScalar = 1.0;
    int num3 = (int)(35.0 * hallStepScalar) + (int)rr.Next(45);
    bool dangerous = (double)rr.NextDouble() <= 0.166;        // CrackedBrickChance（DungeonHallSettings.cs:15）
    if (s.ForceX) { num3 += (int)(20.0 * hallStepScalar); dgLastHallX = 0; dgLastHallY = 0; }
    else if ((int)rr.Next(5) == 0) { num *= 2; num3 /= 2; }
    int steps = num3;
    int num4 = num;
    double num5 = 0.5;                                        // hallInteriorToExteriorRatio
    bool flag2 = false;                                       // Zigzag
    int num6 = (H - 200) - (int)(100.0 * 1.0);                // UnderworldLayer-100*max(scalars)
    bool first = true;
    bool done = false;
    double z2x = 0, z2y = 0;                                  // zero2
    while (!done)
    {
        bool horiz = false;
        if (first && !s.ForceX)
        {
            bool f7 = true, f8 = true, f9 = true, f10 = true, f11 = false;
            int n7 = num3; bool f12 = false;
            for (int y = (int)py; y > (int)py - n7; y--)
            {
                if (!DgInWorld((int)px, y, 50)) { f7 = false; break; }
                if (DgIsDW(wal[y * W + (int)px])) { if (f12) { f7 = false; break; } }
                else f12 = true;
            }
            f12 = false;
            for (int y = (int)py; y < (int)py + n7; y++)
            {
                if (!DgInWorld((int)px, y, 50)) { f8 = false; break; }
                if (y >= num6) { f11 = true; f8 = false; break; }
                if (DgIsDW(wal[y * W + (int)px])) { if (f12) { f8 = false; break; } }
                else f12 = true;
            }
            f12 = false;
            for (int x = (int)px; x > (int)px - n7; x--)
            {
                if (!DgInWorld(x, (int)py, 50)) { f9 = false; break; }
                if (DgIsDW(wal[(int)py * W + x])) { if (f12) { f9 = false; break; } }
                else f12 = true;
            }
            f12 = false;
            for (int x = (int)px; x < (int)px + n7; x++)
            {
                if (!DgInWorld(x, (int)py, 50)) { f10 = false; break; }
                if (DgIsDW(wal[(int)py * W + x])) { if (f12) { f10 = false; break; } }
                else f12 = true;
            }
            if (!f9 && !f10 && !f7 && !f8)
            {
                num2 = ((int)rr.Next(2) != 0) ? 1 : -1;
                if ((int)rr.Next(2) == 0) horiz = true;
                if (num2 == 1 && !horiz && f11)
                {
                    num2 = ((int)rr.Next(2) == 0) ? 1 : -1;
                    horiz = true;
                }
            }
            else
            {
                int n10 = 0, n11 = 100;
                do
                {
                    n11--;
                    if (n11 <= 0) { n10 = 0; break; }
                    n10 = (int)rr.Next(4);
                    if (n10 == 1 && f11) n10 = ((int)rr.Next(2) == 0) ? 2 : 3;
                }
                while (!(n10 == 0 && f7) && !(n10 == 1 && f8) && !(n10 == 2 && f9) && !(n10 == 3 && f10));
                switch (n10)
                {
                    case 0: num2 = -1; break;
                    case 1: num2 = 1; break;
                    default: horiz = true; num2 = (n10 != 2) ? 1 : -1; break;
                }
            }
        }
        else
        {
            num2 = ((int)rr.Next(2) != 0) ? 1 : -1;
            if ((int)rr.Next(2) == 0) horiz = true;
            if (num2 == 1 && py + num3 >= num6)
            {
                num2 = ((int)rr.Next(2) != 0) ? 1 : -1;
                horiz = true;
            }
        }
        first = false;
        if (s.ForceX) horiz = true;
        if (horiz)
        {
            z2x = -num2; z2y = 0;
            vy = 0; vx = num2;
            if ((int)rr.Next(3) == 0)
            {
                if ((int)rr.Next(2) == 0) vy = -0.20000000298023224;
                else vy = 0.20000000298023224;               // hallSlantVariantScalar=1
            }
        }
        else
        {
            num++;
            vy = num2; vx = 0;
            z2x = 0; z2y = -num2;
            if (0.66 > 0.0 && (double)rr.NextDouble() <= 0.66)   // ZigzagChance=0.66
            {
                flag2 = true;
                if ((int)rr.Next(2) == 0) vx = (int)rr.Next(10, 20) * 0.1;
                else vx = (-(int)rr.Next(10, 20)) * 0.1;
            }
            else if ((int)rr.Next(2) == 0)
            {
                if ((int)rr.Next(2) == 0) vx = (int)rr.Next(20, 40) * 0.01;
                else vx = (-(int)rr.Next(20, 40)) * 0.01;
            }
            else num3 /= 2;
        }
        if (dgLastHallX != z2x || dgLastHallY != z2y) done = true;
    }
    float n13 = W * 0.25f, n14 = W * 0.75f;
    bool f13 = py < rockLayer + 100.0;
    bool f14 = px < W / 2 && px > n13;
    bool f15 = px > W / 2 && px < n14;
    if (!s.ForceX)
    {
        if (px > W - 200)
        {
            num2 = -1; z2x = -num2; z2y = 0; vx = num2; vy = 0;   // ★zero.X=num2（:527-530）→ sd=-z2
            if ((int)rr.Next(3) == 0) { if ((int)rr.Next(2) == 0) vy = -0.20000000298023224; else vy = 0.20000000298023224; }
        }
        else if (px < 200.0)
        {
            num2 = 1; z2x = -num2; z2y = 0; vx = num2; vy = 0;
            if ((int)rr.Next(3) == 0) { if ((int)rr.Next(2) == 0) vy = -0.20000000298023224; else vy = 0.20000000298023224; }
        }
        else if (py >= num6)
        {
            num2 = -1; num++; z2x = 0; z2y = -num2; vx = 0; vy = num2;
            if ((int)rr.Next(2) == 0)
            {
                if ((int)rr.Next(2) == 0) vx = (int)rr.Next(20, 50) * 0.01;
                else vx = (-(int)rr.Next(20, 50)) * 0.01;
            }
        }
        else if (py < 200.0)
        {
            num2 = 1; num++; z2x = 0; z2y = -num2; vx = 0; vy = num2;
            if ((int)rr.Next(2) == 0)
            {
                if ((int)rr.Next(2) == 0) vx = (int)rr.Next(20, 50) * 0.01;
                else vx = (-(int)rr.Next(20, 50)) * 0.01;
            }
        }
        else if (f13)
        {
            num2 = 1; num++; z2x = 0; z2y = -num2; vx = 0; vy = num2;
            if (0.66 > 0.0 && (double)rr.NextDouble() <= 0.66)
            {
                flag2 = true;
                if ((int)rr.Next(2) == 0) vx = (int)rr.Next(10, 20) * 0.1;
                else vx = (-(int)rr.Next(10, 20)) * 0.1;
            }
            else if ((int)rr.Next(2) == 0)
            {
                if ((int)rr.Next(2) == 0) vx = (int)rr.Next(20, 50) * 0.01;
                else vx = (int)rr.Next(20, 50) * 0.01;        // ★反编译原样：else 分支同号（:628-633）
            }
        }
        else if (f14)
        {
            num2 = -1; z2y = 0; z2x = -num2; vy = 0; vx = num2;   // f14
            if ((int)rr.Next(3) == 0) { if ((int)rr.Next(2) == 0) vy = -0.20000000298023224; else vy = 0.20000000298023224; }
        }
        else if (f15)
        {
            num2 = 1; z2y = 0; z2x = -num2; vy = 0; vx = num2;   // f15
            if ((int)rr.Next(3) == 0) { if ((int)rr.Next(2) == 0) vy = -0.20000000298023224; else vy = 0.20000000298023224; }
        }
    }
    double sdX = -z2x, sdY = -z2y;                            // startDirection = zero = -zero2
    dgLastHallX = -z2x; dgLastHallY = -z2y;                    // dungeonData.lastDungeonHall = zero
    if (Math.Abs(vx) > Math.Abs(vy) && (int)rr.Next(3) != 0)
        num = (int)((float)num4 * ((float)(int)rr.Next(110, 150) * 0.01f));
    int traceIdx = -1;                                          // DG_TRACE:dungeonL 微差对账(dormant)
    if (Environment.GetEnvironmentVariable("DG_TRACE") != null)
    {
        traceIdx = dgTraceCount++;
        Console.Error.WriteLine($"H {traceIdx} seed={s.Seed} sx={sx:F3} sy={sy:F3} num2={num2} vx={vx:F6} vy={vy:F6} num={num} steps={num3} zig={(flag2 ? 1 : 0)} sdX={sdX} sdY={sdY}");
    }
    var hb = new DBnd();
    hb.Set((int)px, (int)py, (int)px, (int)py);
    var hall = new DHall { Seed = s.Seed, Generated = true, Bounds = hb };
    dgHalls.Add(hall);
    var roomsInArea = DgRoomsInSpots(px, py, px + vx * num3, py + vy * num3, num3 / 2 + num);
    int cnt = 0;
    while (num3 > 0)
    {
        cnt++;
        if (sdX > 0 && px > W - 100) num3 = 0;
        else if (sdX < 0 && px < 100) num3 = 0;
        else if (sdY > 0 && py >= num6) num3 = 0;
        else if (sdY < 0 && py < 100) num3 = 0;
        else if (sdY < 0 && py < rockLayer + 50.0) num3 = 0;
        num3--;
        int x0 = Math.Max(0, Math.Min(W - 1, (int)(px - num - 4.0 - (int)rr.Next(6))));
        int x1 = Math.Max(0, Math.Min(W - 1, (int)(px + num + 4.0 + (int)rr.Next(6))));
        int y0 = Math.Max(0, Math.Min(H - 1, (int)(py - num - 4.0 - (int)rr.Next(6))));
        int y1 = Math.Max(0, Math.Min(H - 1, (int)(py + num + 4.0 + (int)rr.Next(6))));
        dgBounds.Upd(x0, y0, x1, y1);
        hb.Upd(x0, y0, x1, y1);
        for (int x = x0; x < x1; x++)
            for (int y = y0; y < y1; y++)
            {
                int i = y * W + x;
                int prot = DgProt(x, y, roomsInArea);
                if (prot == 3) continue;
                bool f16 = prot != 1;
                liq[i] = 0;
                if (f16 && y <= (H - 200) + 7 && DgCanPlaceTileAt(i)) DgChTile(i, (ushort)dgBrick, true);
            }
        for (int x = x0 + 1; x < x1 - 1; x++)
            for (int y = y0 + 1; y < y1 - 1; y++)
            {
                if (y >= (H - 200) + 7) continue;
                int i = y * W + x;
                int prot = DgProt(x, y, roomsInArea);
                if (prot == 3) continue;
                bool f17 = true;
                if (prot == 2 && DgIsDW(wal[i])) f17 = false;
                if (f17) DgChWall(i, (ushort)dgWall, false);
            }
        int n21 = 0;
        if (vy == 0.0 && (int)rr.Next(num + 1) == 0) n21 = (int)rr.Next(1, 3);
        else if (vx == 0.0 && (int)rr.Next(num - 1) == 0) n21 = (int)rr.Next(1, 3);
        else if ((int)rr.Next(num * 3) == 0) n21 = (int)rr.Next(1, 3);
        if (traceIdx >= 0)
            Console.Error.WriteLine($"S {traceIdx} cnt={cnt} px={px:F3} py={py:F3} num={num} n21={n21} x0={x0} x1={x1} y0={y0} y1={y1} left={num3}");
        int kx0 = Math.Max(0, Math.Min(W - 1, (int)(px - num * num5 - n21)));
        int kx1 = Math.Max(0, Math.Min(W - 1, (int)(px + num * num5 + n21)));
        int ky0 = Math.Max(0, Math.Min(H - 1, (int)(py - num * num5 - n21)));
        int ky1 = Math.Max(0, Math.Min(H - 1, (int)(py + num * num5 + n21)));
        for (int x = kx0; x < kx1; x++)
            for (int y = ky0; y < ky1; y++)
            {
                int i = y * W + x;
                int prot = DgProt(x, y, roomsInArea);
                if (prot == 3) continue;
                bool f18 = prot != 1;
                bool f19 = true;
                if (prot == 2 && DgIsDW(wal[i])) f19 = false;
                if (dangerous)
                {
                    if ((act[i] != 0 || !DgIsDW(wal[i])) && y < H - 200)
                    {
                        act[i] = 0;                            // ClearTile（不清水不清墙——外圈已清）
                        if (f18) DgChTile(i, (ushort)dgCrack, false);
                    }
                }
                else act[i] = 0;
                if (f19 && y < H - 200) DgChWall(i, (ushort)dgWall, false);
            }
        px += vx; py += vy;
        if (flag2 && cnt > (int)rr.Next(10, 20)) { cnt = 0; vx *= -1.0; }
    }
    dgPosX = (int)px; dgPosY = (int)py;
    dgLastHallX = sdX; dgLastHallY = sdY;
    hall.SX = sx; hall.SY = sy; hall.EX = px; hall.EY = py;
    hall.SDX = sdX; hall.SDY = sdY; hall.EDX = sdX; hall.EDY = sdY;
}
// LegacyEntranceDungeonHall.LegacyHall（Halls/LegacyEntranceDungeonHall.cs:23-380，UsePrecalculatedEntrance=false）
void DgEntHall(int seed)
{
    dynamic rr = Activator.CreateInstance(dgUR, seed)!;
    double px = dgPosX, py = dgPosY;
    double sx = px, sy = py;
    int num = (int)rr.Next(5, 9);
    // ★2026-08-16 审计 A2：steps=Next(10,30) 原版在 :136（num=Next(5,9) :131 之后、
    //   方向/增幅掷 :148-158 **之前**）。曾挪到方向掷后 → strength 吃方向骰、方向骰
    //   吃 steps 骰，整条爬升走廊轨迹错位。已归位原版掷序（同 JS 修复）。
    int steps = (int)rr.Next(10, 30);
    int dir = (px <= dgTopX) ? 1 : -1;
    if (px > W - 400) dir = -1;
    else if (px < 400) dir = 1;
    double vx = dir, vy = -1.0;
    if ((int)rr.Next(3) != 0) vx *= 1 + (int)rr.Next(0, 200) * 0.01;
    else if ((int)rr.Next(3) == 0) vx *= (int)rr.Next(50, 76) * 0.01;
    else if ((int)rr.Next(6) == 0) vy *= 2.0;
    if (dgSkewed)
    {
        if (dgPosX < W / 2 && vx < 0.0 && vx < -0.5) vx = 0.5;
        if (dgPosX > W / 2 && vx > 0.0 && vx > 0.5) vx = -0.5;
    }
    else
    {
        if (dgPosX < W / 2 && vx < -0.5) vx = -0.5;
        if (dgPosX > W / 2 && vx > 0.5) vx = 0.5;
    }
    double num5 = 0.5;
    int n6 = 30, n7 = 10;
    if (Environment.GetEnvironmentVariable("DG_CLIMB_TRACE") != null)
        Console.Error.WriteLine($"ENT seed={seed} px={px:F1} py={py:F1} num={num} steps={steps} vx={vx:F3} vy={vy:F3}");
    var hb = new DBnd();
    hb.Set((int)px, (int)py, (int)px, (int)py);
    var hall = new DHall { Seed = seed, Generated = true, Bounds = hb, IsEntrance = true };
    dgHalls.Add(hall);
    var roomsInArea = DgRoomsInSpots(px, py, px + vx * steps, py + vy * steps, steps / 2 + num);
    int num4 = steps;
    while (num4 > 0)
    {
        num4--;
        if (!DgInWorld((int)px, (int)py, n6 + 5)) break;
        int x0 = Math.Max(n6, Math.Min(W - n6 - 1, (int)(px - num - 4.0 - (int)rr.Next(6))));
        int x1 = Math.Max(n6, Math.Min(W - n6 - 1, (int)(px + num + 4.0 + (int)rr.Next(6))));
        int y0 = Math.Max(n6, Math.Min(H - n6 - 1, (int)(py - num - 4.0)));
        int y1 = Math.Max(n6, Math.Min(H - n6 - 1, (int)(py + num + 4.0 + (int)rr.Next(6))));
        dgBounds.Upd(x0, y0, x1, y1);
        hb.Upd(x0, y0, x1, y1);
        int n13 = px > W / 2 ? -1 : 1;
        int n14 = (int)(px + dgS1X * 0.6 * n13 + dgS2X * n13);
        int n15 = (int)(dgS2Y * 0.5);
        if (py < worldSurface - 5.0)
        {
            int wy = (int)(py - num - 6.0 + n15);
            bool open = DgInWorld(n14, wy, 0) && wal[wy * W + n14] == 0
                && DgInWorld(n14, wy - 1, 0) && wal[(wy - 1) * W + n14] == 0
                && DgInWorld(n14, wy - 2, 0) && wal[(wy - 2) * W + n14] == 0;
            if (open)
            {
                dgEntOnSurface = true;
                TileRunner(n14, wy, (int)rr.Next(25, 35), (int)rr.Next(10, 20), -1, false, 0.0, -1.0);
            }
        }
        for (int x = x0; x < x1; x++)
            for (int y = y0; y < y1; y++)
            {
                int i = y * W + x;
                int prot = DgProt(x, y, roomsInArea);
                if (prot == 3) continue;
                bool f2 = prot != 1;
                liq[i] = 0;
                if (f2 && DgCanPlaceTileAt(i)) DgChTile(i, (ushort)dgBrick, true);
            }
        for (int x = x0 + 1; x < x1 - 1; x++)
            for (int y = y0 + 1; y < y1 - 1; y++)
            {
                int i = y * W + x;
                int prot = DgProt(x, y, roomsInArea);
                if (prot == 3) continue;
                bool f3 = true;
                if (prot == 2 && DgIsDW(wal[i])) f3 = false;
                if (f3) DgChWall(i, (ushort)dgWall, false);
            }
        int n16 = 0;
        if ((int)rr.Next(num) == 0) n16 = (int)rr.Next(1, 3);
        int kx0 = Math.Max(n6, Math.Min(W - n6 - 1, (int)(px - num * num5 - n16)));
        int kx1 = Math.Max(n6, Math.Min(W - n6 - 1, (int)(px + num * num5 + n16)));
        int ky0 = Math.Max(n6, Math.Min(H - n6 - 1, (int)(py - num * num5 - n16)));
        int ky1 = Math.Max(n6, Math.Min(H - n6 - 1, (int)(py + num * num5 + n16)));
        for (int x = kx0; x < kx1; x++)
            for (int y = ky0; y < ky1; y++)
            {
                int i = y * W + x;
                int prot = DgProt(x, y, roomsInArea);
                if (prot == 3) continue;
                bool f4 = true;
                if (prot == 2 && DgIsDW(wal[i])) f4 = false;
                act[i] = 0;                                    // ClearTile
                if (f4) DgChWall(i, (ushort)dgWall, false);
            }
        if (dgEntOnSurface) num4 = 0;
        px += vx; py += vy;
        if (py < worldSurface) vy *= 0.9800000190734863;
    }
    // ★2026-08-16 审计 A4：cs:367-368 每条爬升走廊终点都覆写 generatingDungeonPosition
    //   ——pass 终值=最后一条爬升走廊终点（入口 X），:394 最高房中心只是瞬态。
    //   下游金字塔回避带（cs:15450）/神庙镜像（cs:15991）消费的正是该终值。
    dgPosX = (int)px; dgPosY = (int)py;
    hall.SX = sx; hall.SY = sy; hall.EX = px; hall.EY = py;
    hall.SDX = vx; hall.SDY = vy; hall.EDX = vx; hall.EDY = vy;
}
// LegacyDungeonEntrance.LegacyEntrance（Entrances/LegacyDungeonEntrance.cs:31-619）
// ============ LegacyEntranceDungeonHall precalc 支（:23-380，UsePrecalculatedEntrance=true）============
// XX 批（2026-08-18，与 JS DungeonPass.dgEntHallPrecalc 同构）。CalculateHall
// (OverrideStart=currentPos→OverrideEnd=lerp 目标) 后生成：直线+steps=ceil(段距)
//（:157-171），strength=Next(5,9) 存活；无出地表探测/TileRunner/0.98 衰减；
// 每 10 步记平台候选（InAHallway → Hf=5，PlacePotsChance=0.25）。
void DgEntHallPrecalc(int seed, double sx0, double sy0, double tgx, double tgy)
{
    dynamic rr = Activator.CreateInstance(dgUR, seed)!;
    int num = (int)rr.Next(5, 9);                 // strength（存活）
    int stepsRolled = (int)rr.Next(10, 30);       // 覆写弃值保位
    _ = stepsRolled;
    if ((int)rr.Next(3) != 0) { int d1 = (int)rr.Next(0, 200); _ = d1; }
    else if ((int)rr.Next(3) == 0) { int d2 = (int)rr.Next(50, 76); _ = d2; }
    else if ((int)rr.Next(6) == 0) { }
    double dvx = tgx - sx0, dvy = tgy - sy0;
    double len = Math.Sqrt(dvx * dvx + dvy * dvy);
    double vx = len == 0 ? 1 : dvx / len, vy = len == 0 ? 0 : dvy / len;
    int steps = (int)Math.Ceiling(len);
    double px = sx0, py = sy0;
    double num5 = 0.5;
    int n6 = 30;
    var hb = new DBnd();
    hb.Set((int)px, (int)py, (int)px, (int)py);
    var hall = new DHall { Seed = seed, Generated = true, Bounds = hb, IsEntrance = true };
    dgHalls.Add(hall);
    var roomsInArea = DgRoomsInSpots(px, py, px + vx * steps, py + vy * steps, steps / 2 + num);
    int n8 = 0;
    while (steps > 0)
    {
        steps--;
        if (!DgInWorld((int)px, (int)py, n6 + 5)) break;
        int x0 = Math.Max(n6, Math.Min(W - n6 - 1, (int)(px - num - 4.0 - (int)rr.Next(6))));
        int x1 = Math.Max(n6, Math.Min(W - n6 - 1, (int)(px + num + 4.0 + (int)rr.Next(6))));
        int y0 = Math.Max(n6, Math.Min(H - n6 - 1, (int)(py - num - 4.0)));
        int y1 = Math.Max(n6, Math.Min(H - n6 - 1, (int)(py + num + 4.0 + (int)rr.Next(6))));
        dgBounds.Upd(x0, y0, x1, y1);
        hb.Upd(x0, y0, x1, y1);
        for (int x = x0; x < x1; x++)
            for (int y = y0; y < y1; y++)
            {
                int i = y * W + x;
                int pr = DgProt(x, y, roomsInArea);
                if (pr == 3) continue;
                bool f2 = pr != 1;
                liq[i] = 0;
                if (f2 && DgCanPlaceTileAt(i)) DgChTile(i, (ushort)dgBrick, true);
            }
        for (int x = x0 + 1; x < x1 - 1; x++)
            for (int y = y0 + 1; y < y1 - 1; y++)
            {
                int i = y * W + x;
                int pr = DgProt(x, y, roomsInArea);
                if (pr == 3) continue;
                bool f3 = true;
                if (pr == 2 && DgIsDW(wal[i])) f3 = false;
                if (f3) DgChWall(i, (ushort)dgWall, false);
            }
        int n16 = 0;
        if ((int)rr.Next(num) == 0) n16 = (int)rr.Next(1, 3);
        int kx0 = Math.Max(n6, Math.Min(W - n6 - 1, (int)(px - num * num5 - n16)));
        int kx1 = Math.Max(n6, Math.Min(W - n6 - 1, (int)(px + num * num5 + n16)));
        int ky0 = Math.Max(n6, Math.Min(H - n6 - 1, (int)(py - num * num5 - n16)));
        int ky1 = Math.Max(n6, Math.Min(H - n6 - 1, (int)(py + num * num5 + n16)));
        n8--;
        if (n8 <= 0) { n8 = 10; dgPlats.Add(new DPlat { X = (int)px, Y = (int)py, Hall = true, Hf = 5, Pots = 0.25 }); }
        for (int x = kx0; x < kx1; x++)
            for (int y = ky0; y < ky1; y++)
            {
                int i = y * W + x;
                int pr = DgProt(x, y, roomsInArea);
                if (pr == 3) continue;
                bool f4 = true;
                if (pr == 2 && DgIsDW(wal[i])) f4 = false;
                act[i] = 0;
                DgClearSlope(i);
                if (f4) DgChWall(i, (ushort)dgWall, false);
            }
        px += vx; py += vy;                        // flag=true → 无 0.98 衰减
    }
    dgPosX = (int)px; dgPosY = (int)py;
}

// ================= TowerDungeonEntrance.TowerEntrance（Entrances/TowerDungeonEntrance.cs:40-461）=================
// XX 批（2026-08-18）1:1 转录（与 JS dgTowerEntrance 同构）。窗口样式表：
//   glass/closed/edge + 窗台平台（WindowPlatformItemTypes 蓝主题 1386→8/绿 1385→7/粉 1384→6，
//   与主平台 6/8/7 倒置——原版如此）。
void DgClearSlope(int i) { half[i] = 0; slope[i] = 0; }   // Tile.Clear(Slope)
bool DgSolidOrSloped(int x, int y) => x >= 0 && x < W && y >= 0 && y < H && act[y * W + x] != 0 && SOLID.Contains(typ[y * W + x]);
void DgSmoothSlope(int x, int y)
{
    if (!DgSolidOrSloped(x, y) || FRAMED_ALL.Contains(typ[y * W + x])) return;   // CanPound 近似（简表，同 JS）
    SmoothSlopeCore(x, y);
}
// DungeonPillar.GenerateTileStrip（Pillar 版 :88-190）——height 0=自动扫描；返回 (topY,bottomY)
(int, int) DgPillarStrip(int px, int py, int height, bool up, bool smoothTop, bool smoothBottom, bool always)
{
    int placeY = py;
    int num3 = height;
    if (num3 == 0)
    {
        num3 = 0; int i2 = 0;
        if (up) { while (i2 > -100 && DgInWorld(px, placeY + i2, 10) && act[(placeY + i2) * W + px] == 0) i2--; num3 = -i2; }
        else
        {
            while (i2 < 100 && DgInWorld(px, placeY + i2, 10) && act[(placeY + i2) * W + px] == 0) i2++;
            num3 = i2; placeY += num3 - 1;
        }
    }
    if (num3 == 0) return (placeY, placeY);
    int lo = -num3 + 1, hi = 0;
    int topY = placeY, bottomY = placeY;
    int jStart = up ? lo : hi, jEnd = up ? hi : lo, jStep = up ? 1 : -1;
    for (int j = jStart; up ? j <= jEnd : j >= jEnd; j += jStep)
    {
        int cy = placeY + j;
        if (up) { if (cy <= 10) break; } else if (cy >= H - 10) break;
        if (px < 0 || px >= W || cy < 0 || cy >= H) continue;
        int ti = cy * W + px;
        if (!always && act[ti] != 0) break;
        act[ti] = 1; typ[ti] = (ushort)dgBrick; DgClearSlope(ti);
        if ((j == lo && smoothTop) || (j == hi && smoothBottom)) DgSmoothSlope(px, cy);
        if (cy < topY) topY = cy;
        if (cy > bottomY) bottomY = cy;
    }
    return (topY, bottomY);
}
// DungeonPillar.Pillar（:28-84）
void DgPillar(int px, int py, int width, bool crownTop, bool crownBottom, int height, bool always)
{
    int num = 3;
    for (int k = 0; k < width; k++)
    {
        int cx = px + k - width / 2;
        var (topY2, bottomY) = DgPillarStrip(cx, py, height, true, false, false, always);
        if (crownTop)
        {
            if (k == 0) DgPillarStrip(cx - 1, topY2 + num, 0, true, false, true, always);
            else if (k == width - 1) DgPillarStrip(cx + 1, topY2 + num, 0, true, false, true, always);
        }
        if (crownBottom)
        {
            if (k == 0) DgPillarStrip(cx - 1, bottomY - num, 0, false, true, false, always);
            else if (k == width - 1) DgPillarStrip(cx + 1, bottomY - num, 0, false, true, false, always);
        }
    }
}
// GenerateBottomWedge（DU:447-459）：crowning → width+=2；逐列三角带（DungeonUtils 版
// strip：显式高、无 active-break）+ 尾部 SmoothSlope（★原版平滑中心列 placeX 逐深度）
void DgBottomWedge(int px, int py, int width0, bool left)
{
    int width = width0 + 2;
    for (int i2 = 0; i2 <= width; i2++)
    {
        int cx = px + i2 - width / 2;
        int hgt = left ? i2 + 1 : width - (i2 - 1);
        for (int j = 0; j <= hgt - 1; j++)
        {
            int cy = py + j;
            if (!DgInWorld(cx, cy, 10)) continue;
            int ti = cy * W + cx;
            act[ti] = 1; typ[ti] = (ushort)dgBrick; DgClearSlope(ti);
        }
    }
    for (int j2 = 0; j2 <= width; j2++)
    {
        int num = left ? j2 + 1 : width - (j2 - 1);
        DgSmoothSlope(px, py + num);
    }
}
// TowerEntrance_LineOfFence（:463-476）：y<=10 直退；PlaceWall(245)（成功落墙才掷——
// 与 jungle PlaceWall 同口径，XX 批 x86 对拍实证写门内掷）
void DgLineOfFence(int lx, int rx, int y)
{
    if (y <= 10) return;
    if (!(lx >= 10 && rx <= W - 10)) return;
    for (int x = lx; x <= rx; x++) PlaceWall(x, y, 245);
}
// TowerEntrance_OuterPillar（:478-516）：7×3+5×7 方柱 + PlaceTile(215 篝火, Place3x2 零掷)
// + 9 格 245 栅栏墙
void DgOuterPillar(int px, int py)
{
    DgPillar(px, py - 1, 7, false, false, 3, false);
    DgPillar(px, py - 4, 5, false, false, 7, false);
    if (py - 11 >= 10) DgPCampfire(px, py - 11);
    for (int k = 0; k < 5; k++) PlaceWall(px - 2 + k, py - 11, 245);
    if (py - 12 >= 10) { PlaceWall(px - 2, py - 12, 245); PlaceWall(px + 2, py - 12, 245); }
    if (py - 10 >= 10) { PlaceWall(px - 2, py - 10, 245); PlaceWall(px + 2, py - 10, 245); }
}
// PlaceTile(215)→Place3x2（cs:60020 case 215，零掷；3×2 净空+SolidTile2 门）
bool DgPCampfire(int x, int y)
{
    if (x < 5 || x > W - 5 || y < 5 || y > H - 5) return false;
    for (int i = x - 1; i < x + 2; i++)
    {
        for (int j = y - 1; j < y + 1; j++) if (!DgClr(i, j)) return false;
        if (!DgSolid2(i, y + 1)) return false;
    }
    for (int i = x - 1; i < x + 2; i++) for (int j = y - 1; j < y + 1; j++) DgWr(i, j, 215);
    return true;
}
// DungeonWindowBasic.Window（:26-105）——GetWindowPlatformStyle 恒耗 1 骰（Next(1) 单元素）
bool DgWinSpot(int x, int y, int ww, int wh)
{
    if (x < 0 || y < 0 || x >= ww || y >= wh) return false;
    return !(y == 0 && (x == 0 || x == ww - 1));
}
void DgSetWall(int x, int y, int v) { if (x >= 0 && x < W && y >= 0 && y < H) wal[y * W + x] = (ushort)v; }
void DgWindowBasic(int px, int py, int ww, int wh, int overrideGlass)
{
    r.Next(1);
    int glass = overrideGlass > 0 ? overrideGlass : dgWinGlass;
    for (int i2 = 0; i2 < ww; i2++)
    {
        int cx = px + i2 - ww / 2;
        for (int j2 = 0; j2 < wh; j2++)
        {
            if (!DgWinSpot(i2, j2, ww, wh)) continue;
            int cy = py + j2 - wh / 2;
            if (i2 == ww / 2 || j2 == wh / 2) DgSetWall(cx, cy, dgWinEdge);
            else DgSetWall(cx, cy, glass);
            if (!DgWinSpot(i2 - 1, j2, ww, wh)) DgSetWall(cx - 1, cy, dgWinEdge);
            if (!DgWinSpot(i2 + 1, j2, ww, wh)) DgSetWall(cx + 1, cy, dgWinEdge);
            if (!DgWinSpot(i2, j2 - 1, ww, wh)) DgSetWall(cx, cy - 1, dgWinEdge);
            if (!DgWinSpot(i2, j2 + 1, ww, wh))
            {
                DgSetWall(cx, cy + 1, dgWinEdge);
                if (cx >= 0 && cx < W && cy + 1 >= 0 && cy + 1 < H)
                {
                    int ti = (cy + 1) * W + cx;
                    act[ti] = 1; typ[ti] = 19; DgClearSlope(ti);
                }
            }
        }
    }
}
// DungeonWindowMosaic.Window_Skeletron（:46-190）
bool DgSkullOK(int x, int y, int ww, int wh)
{
    if (x < 0 || y < 0 || x >= ww || y >= wh) return false;
    if (y == 0 && (x <= 5 || x >= ww - 6)) return false;
    if (y == 1 && (x <= 3 || x >= ww - 4)) return false;
    if (y == 2 && (x <= 1 || x >= ww - 2)) return false;
    if (y == 3 && (x == 0 || x >= ww - 1)) return false;
    if ((x == 0 && y >= wh - 2) || (x <= 1 && y == wh - 1) || (x == ww - 1 && y >= wh - 2) || (x >= ww - 2 && y == wh - 1)) return false;
    return true;
}
bool DgJawOK(int x, int y, bool isGlass, int ww, int wh)
{
    if (isGlass) return true;
    if (x < 0 || y < 0 || x >= ww || y >= wh) return false;
    if (y == wh - 1 && (x <= 2 || x >= ww - 3)) return false;
    if (y == wh - 2 && (x <= 1 || x >= ww - 2)) return false;
    if (y == wh - 3 && (x == 0 || x == ww - 1)) return false;
    return true;
}
void DgWindowMosaicSkel(int px, int py, int glass)
{
    int n1 = 17, n2 = n1 / 2, n3 = 15, n4 = n3 / 2;
    int n5 = 11, n6 = n5 / 2, n7 = 7, n8 = n7 / 2;
    for (int i2 = 0; i2 < n1; i2++)
    {
        int cx = px + i2 - n2;
        for (int j2 = 0; j2 < n3; j2++)
        {
            if (!DgSkullOK(i2, j2, n1, n3)) continue;
            int cy = py + j2 - n4;
            DgSetWall(cx, cy, glass);
            if (!DgSkullOK(i2 - 1, j2, n1, n3)) DgSetWall(cx - 1, cy, dgWinEdge);
            if (!DgSkullOK(i2 + 1, j2, n1, n3)) DgSetWall(cx + 1, cy, dgWinEdge);
            if (!DgSkullOK(i2, j2 - 1, n1, n3)) DgSetWall(cx, cy - 1, dgWinEdge);
            if (j2 < n3 - 1 && !DgSkullOK(i2, j2 + 1, n1, n3)) DgSetWall(cx, cy + 1, dgWinEdge);
        }
    }
    for (int k = 0; k < n5; k++)
    {
        int cx = px + k - n6;
        for (int l = 0; l < n7; l++)
        {
            int cy = py + l + n4 + n8 - 2;
            if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue;
            bool jawIsGlass = wal[cy * W + cx] == glass;
            if (!DgJawOK(k, l, jawIsGlass, n5, n7)) continue;
            DgSetWall(cx, cy, glass);
            int xl = cx - 1, xr = cx + 1, yu = cy - 1, yd = cy + 1;
            bool gL = xl >= 0 && xl < W && yu >= 0 && wal[cy * W + xl] == glass;
            bool gR = xr >= 0 && xr < W && wal[cy * W + xr] == glass;
            bool gU = yu >= 0 && yu < H && wal[yu * W + cx] == glass;
            bool gD = yd >= 0 && yd < H && wal[yd * W + cx] == glass;
            if (!DgJawOK(k - 1, l, gL, n5, n7)) DgSetWall(cx - 1, cy, dgWinEdge);
            if (!DgJawOK(k + 1, l, gR, n5, n7)) DgSetWall(cx + 1, cy, dgWinEdge);
            if (!DgJawOK(k, l - 1, gU, n5, n7)) DgSetWall(cx, cy - 1, dgWinEdge);
            if (!DgJawOK(k, l + 1, gD, n5, n7)) DgSetWall(cx, cy + 1, dgWinEdge);
        }
    }
    int p2y = py + n4 - 2;
    for (int m = 0; m < n1; m++)
    {
        int cx = px - n2 + m;
        if (m >= 2 && m <= 5)
        {
            int n14 = m - 2;
            for (int n9 = 0; n9 < 6; n9++)
                if ((n14 != 3 || n9 > 1) && (n14 != 2 || n9 != 0) && (n14 != 1 || n9 != 5) && (n14 != 0 || n9 < 4))
                    DgSetWall(cx, py + n9 - 1, dgWinEdge);
        }
        if (m >= 11 && m <= 14)
        {
            int n15 = m - 11;
            for (int n16v = 0; n16v < 6; n16v++)
                if ((n15 != 0 || n16v > 1) && (n15 != 1 || n16v != 0) && (n15 != 2 || n16v != 5) && (n15 != 3 || n16v < 4))
                    DgSetWall(cx, py + n16v - 1, dgWinEdge);
        }
        if (m >= 7 && m <= 9)
        {
            int n17 = m - 7;
            for (int n18 = 0; n18 < 4; n18++)
                if (((n17 != 0 && n17 != 2) || n18 != 0) && (n17 != 1 || n18 != 3))
                    DgSetWall(cx, py + n18 + 3, dgWinEdge);
        }
        int n19 = p2y + 1;
        if (m >= 2 && m <= 3) n19++;
        else if (m >= 4 && m <= 6) n19 += 2;
        else if (m >= 7 && m <= 9) n19 += 3;
        else if (m >= 10 && m <= 12) n19 += 2;
        else if (m >= 13 && m <= 14) n19++;
        DgSetWall(cx, n19, dgWinEdge);
        if (m == 0 || m == n1 - 1) { DgSetWall(cx, n19 - 1, dgWinEdge); DgSetWall(cx, n19 + 1, dgWinEdge); }
        if (m == 4 || m == 6 || m == 8 || m == 10 || m == 12)
            for (int n20 = 0; n20 < 4; n20++) DgSetWall(cx, n19 + n20, dgWinEdge);
        if (m >= 5 && m <= 11)
        {
            int n21 = p2y + 7;
            if (m >= 7 && m <= 9) n21++;
            DgSetWall(cx, n21, dgWinEdge);
        }
    }
}
// DungeonWindowMosaic.Window_MoonLord（:192-330）
bool DgSideEyeOK(int x, int y, bool left, int ww, int wh)
{
    if (x < 0 || y < 0 || x >= ww || y >= wh) return false;
    if (left && ((x <= 1 && y == wh - 1) || (x == ww - 1 && y <= 1))) return false;
    if (left && ((x == 0 && y >= wh - 2) || (x >= ww - 2 && y == 0))) return false;
    if (!left && ((x <= 1 && y == 0) || (x >= ww - 2 && y == wh - 1))) return false;
    if (!left && ((x == 0 && y <= 1) || (x == ww - 1 && y >= wh - 2))) return false;
    return true;
}
bool DgMidEyeOK(int x, int y, int ww, int wh)
{
    if (x < 0 || y < 0 || x >= ww || y >= wh) return false;
    if ((y == 1 && (x == 0 || x == ww - 1)) || (y == wh - 2 && (x == 0 || x == ww - 1))) return false;
    if (y == 0 && ((x >= 0 && x <= 1) || (x >= ww - 2 && x <= ww - 1))) return false;
    if (y == wh - 1 && ((x >= 0 && x <= 1) || (x >= ww - 2 && x <= ww - 1))) return false;
    return true;
}
void DgWindowMosaicMoon(int px, int py, int glass)
{
    int n1 = 8, n2 = n1 - 1, n3 = 7, n4 = n3 - 1, n5 = 7, n6 = n5 + 1, n7 = 9;
    for (int side = 0; side < 2; side++)
    {
        bool left = side == 0;
        for (int j = 0; j < n1; j++)
            for (int k = 0; k < n2; k++)
            {
                if (!DgSideEyeOK(j, k, left, n1, n2)) continue;
                int cx = px + j + (left ? -n7 - 1 : n7 - n1 + 2);
                int cy = py + k + n2 - 2;
                DgSetWall(cx, cy, glass);
                if (!DgSideEyeOK(j - 1, k, left, n1, n2)) DgSetWall(cx - 1, cy, dgWinEdge);
                if (!DgSideEyeOK(j + 1, k, left, n1, n2)) DgSetWall(cx + 1, cy, dgWinEdge);
                if (!DgSideEyeOK(j, k - 1, left, n1, n2)) DgSetWall(cx, cy - 1, dgWinEdge);
                if (!DgSideEyeOK(j, k + 1, left, n1, n2)) DgSetWall(cx, cy + 1, dgWinEdge);
            }
        for (int l = 0; l < n3; l++)
            for (int m = 0; m < n4; m++)
            {
                if (!DgSideEyeOK(l, m, left, n3, n4)) continue;
                int cx = px + l + (left ? -n7 + 1 : n7 - n3);
                int cy = py + m - n4 + 2;
                DgSetWall(cx, cy, glass);
                if (!DgSideEyeOK(l - 1, m, left, n3, n4)) DgSetWall(cx - 1, cy, dgWinEdge);
                if (!DgSideEyeOK(l + 1, m, left, n3, n4)) DgSetWall(cx + 1, cy, dgWinEdge);
                if (!DgSideEyeOK(l, m - 1, left, n3, n4)) DgSetWall(cx, cy - 1, dgWinEdge);
                if (!DgSideEyeOK(l, m + 1, left, n3, n4)) DgSetWall(cx, cy + 1, dgWinEdge);
            }
    }
    for (int n9 = 0; n9 < n5; n9++)
        for (int n12 = 0; n12 < n6; n12++)
        {
            if (!DgMidEyeOK(n9, n12, n5, n6)) continue;
            int cx = px + n9 - n5 / 2;
            int cy = py + n12 - n4 - n6;
            DgSetWall(cx, cy, glass);
            if (!DgMidEyeOK(n9 - 1, n12, n5, n6)) DgSetWall(cx - 1, cy, dgWinEdge);
            if (!DgMidEyeOK(n9 + 1, n12, n5, n6)) DgSetWall(cx + 1, cy, dgWinEdge);
            if (!DgMidEyeOK(n9, n12 - 1, n5, n6)) DgSetWall(cx, cy - 1, dgWinEdge);
            if (!DgMidEyeOK(n9, n12 + 1, n5, n6)) DgSetWall(cx, cy + 1, dgWinEdge);
        }
}
// TowerEntrance_Door（:433-461）
void DgTowerDoor(int i, int floorY, int outer, int inner, bool left)
{
    int num = left ? inner - 1 : -outer - 2;
    int num2 = left ? outer + 2 : -inner + 1;
    int p1x = i + (left ? outer - 1 : -outer + 1);
    int p2x = i + (left ? inner + 1 : -inner - 1);
    for (int j = num; j <= num2; j++)
        for (int k = -3; k <= 1; k++)
        {
            int x = i + j, y = floorY + k;
            if (x < 0 || x >= W || y < 0 || y >= H) continue;
            int ti = y * W + x;
            if ((left && x >= p1x) || (!left && x <= p1x)) wal[ti] = 0;
            if (k >= -2 && k <= 0) { act[ti] = 0; DgClearSlope(ti); }
        }
    DgPlaceDoor(p1x, floorY, 13);
    DgPlaceDoor(p2x, floorY, 13);
}
// ClearEverything（Tile.cs:140-151）
void DgClrAll(int i)
{
    typ[i] = 0; wal[i] = 0; liq[i] = 0; liqT[i] = 0; act[i] = 0; DgClearSlope(i);
}
void DgTowerEntrance(int i, int j, int preSeed)
{
    dynamic rr = Activator.CreateInstance(dgUR, preSeed)!;
    int windowType = (int)rr.Next(3);
    bool leftSide = !dungeonRight;                  // flag = dungeonSide==Left
    for (int x = i - 60; x < i + 60; x++)
        for (int y = j - 60; y < j + 60; y++)
            if (DgInWorld(x, y, 0)) { int ti = y * W + x; liq[ti] = 0; liqT[ti] = 0; DgClearSlope(ti); }
    int n2 = 5, n3 = 35, n4 = 40, n5 = 100;
    int n7 = j - 30;
    int n8 = 30, n9 = 25, n10 = 30, n11 = 20, n12 = 50, n13 = 15, n14 = 20, n16 = 95;
    int minY = n7 - n16, maxY = n7 + 10;
    // 塔侧地表圆清 Circle(15)+Actions.Clear（Shapes.Circle.Perform 椭圆逐行）
    {
        int cx = leftSide ? i + n3 - 1 : i - n3 + 1;
        int cy = n7 - 15, rad = 15, sq = (rad + 1) * (rad + 1);
        for (int yy = cy - rad; yy <= cy + rad; yy++)
        {
            int num2 = yy - cy;
            int num3 = Math.Min(rad, (int)Math.Sqrt(sq - num2 * num2));
            for (int xx = cx - num3; xx <= cx + num3; xx++)
                if (DgInWorld(xx, yy, 0)) DgClrAll(yy * W + xx);
        }
    }
    dgEntBounds.Set(i - n4, minY, i + n4 + 1, maxY);
    dgEntExists = true;
    // 基座箱（:100-213）
    for (int n = -n4; n <= n4; n++)
        for (int m = -5; m < n5; m++)
        {
            int x = i + n, y = n7 + m;
            if (!DgInWorld(x, y, 0)) continue;
            int ti = y * W + x;
            bool f2 = act[ti] != 0 && !(typ[ti] == dgBrick || typ[ti] == dgCrack);
            bool f3 = wal[ti] != dgWall;
            bool f4 = DgIsDW(wal[ti]);
            if (m < 0) DgClrAll(ti);
            else if (m < 5)
            {
                if ((n >= -n4 + n2 && n <= -n4 + n2 * 2 - 1) || (n >= n4 - n2 * 2 + 1 && n <= n4 - n2))
                {
                    DgClrAll(ti);
                    if (!f4) wal[ti] = (ushort)dgWall;
                }
                else if (!f4)
                {
                    liq[ti] = 0; liqT[ti] = 0;
                    DgChTile(ti, (ushort)dgBrick, false);
                    if (n != -n4 && n != n4) wal[ti] = (ushort)dgWall;
                }
            }
            else if (m < 10)
            {
                if (n >= -n4 + n2 && n <= n4 - n2)
                {
                    DgClrAll(ti);
                    wal[ti] = (ushort)dgWall;
                }
                else if (!f4)
                {
                    liq[ti] = 0; liqT[ti] = 0;
                    DgChTile(ti, (ushort)dgBrick, false);
                    if (n != -n4 && n != n4) wal[ti] = (ushort)dgWall;
                }
            }
            else if ((act[ti] != 0 && f2) || !f4)
            {
                liq[ti] = 0; liqT[ti] = 0;
                DgChTile(ti, (ushort)dgBrick, false);
                if (n != -n4 && n != n4) wal[ti] = (ushort)dgWall;
            }
            else if (f3)
            {
                liq[ti] = 0; liqT[ti] = 0;
                if (n != -n4 && n != n4) wal[ti] = (ushort)dgWall;
            }
            if (m == 1 && (n == -n4 + n2 || n == n4 - n2 * 2)) dgPlats.Add(new DPlat { X = x, Y = y, Hf = 0, Force = true, Pots = 0.33000001311302185 });
            if (m == 10 && n == 0) dgPlats.Add(new DPlat { X = x, Y = y, Hf = 0, Force = true, Pots = 0.33000001311302185 });
        }
    // 下行收敛通道（:214-244）
    {
        int num23 = -1, num24 = 6;
        for (int m = 10; m < 50; m++)
        {
            if (num23 == -1 && act[(n7 + m) * W + i] == 0) num23 = 15;
            if (num23 > 0)
            {
                num23--;
                if (num23 <= 0) break;
                if (num23 <= 5) num24--;
            }
            for (int k = -num24; k <= num24; k++)
            {
                int x = i + k, y = n7 + m;
                if (!DgInWorld(x, y, 0)) continue;
                int ti = y * W + x;
                DgClrAll(ti);
                wal[ti] = (ushort)dgWall;
            }
        }
    }
    // 塔体（:246-301）三段收窄
    for (int n26 = -n4; n26 <= n4; n26++)
    {
        int x = i + n26;
        for (int n28 = 0; n28 <= n16; n28++)
        {
            int y = n7 - n28;
            if (!DgInWorld(x, y, 5)) continue;
            int ti = y * W + x;
            if (n28 <= n8)
            {
                if (n26 >= -n3 && n26 <= n3) DgChWall(ti, (ushort)dgWall, true);
                else
                {
                    if (n26 > -n4 && n26 < n4) DgChWall(ti, (ushort)dgWall, true);
                    DgChTile(ti, (ushort)dgBrick, false);
                }
                if (n28 >= n8 - n2 && (n26 < -n9 || n26 > n9)) DgChTile(ti, (ushort)dgBrick, false);
            }
            else if (n28 >= n8 - n2 && n28 <= n12 && n26 >= -n10 && n26 <= n10)
            {
                if (n26 >= -n9 && n26 <= n9) DgChWall(ti, (ushort)dgWall, true);
                else
                {
                    if (n26 > -n10 && n26 < n10) DgChWall(ti, (ushort)dgWall, true);
                    DgChTile(ti, (ushort)dgBrick, false);
                }
                if (n28 >= n12 - n2 && (n26 < -n13 || n26 > n13)) DgChTile(ti, (ushort)dgBrick, false);
            }
            else
            {
                if (n28 < n12 - n2 || n28 > n16 || n26 < -n14 || n26 > n14) continue;
                if (n26 >= -n13 && n26 <= n13) DgChWall(ti, (ushort)dgWall, true);
                else
                {
                    if (n26 > -n14 && n26 < n14) DgChWall(ti, (ushort)dgWall, true);
                    DgChTile(ti, (ushort)dgBrick, false);
                }
                if (n28 >= n16 - n2) DgChTile(ti, (ushort)dgBrick, false);
            }
        }
    }
    // 四根 3 宽 BlockActuated 立柱（actuated 位不入 dump 通道，跳过）
    DgPillar(i - n9 - 3, n7, 3, true, true, 0, true);
    DgPillar(i + n9 + 3, n7, 3, true, true, 0, true);
    DgPillar(i - n13 - 3, n7, 3, true, true, 0, true);
    DgPillar(i + n13 + 3, n7, 3, true, true, 0, true);
    // 六组楔底+外柱（:315-331）
    DgBottomWedge(i - n4 - 4, n7 - n8, 5, true);
    DgOuterPillar(i - n4 - 4, n7 - n8);
    DgBottomWedge(i - n10 - 4, n7 - n12, 5, true);
    DgOuterPillar(i - n10 - 4, n7 - n12);
    DgBottomWedge(i - n14 - 4, n7 - n16, 5, true);
    DgOuterPillar(i - n14 - 4, n7 - n16);
    DgBottomWedge(i + n4 + 3, n7 - n8, 5, false);
    DgOuterPillar(i + n4 + 4, n7 - n8);
    DgBottomWedge(i + n10 + 3, n7 - n12, 5, false);
    DgOuterPillar(i + n10 + 4, n7 - n12);
    DgBottomWedge(i + n14 + 3, n7 - n16, 5, false);
    DgOuterPillar(i + n14 + 4, n7 - n16);
    // 檐口 5 宽方柱 + 栅栏线 + 双顶楔（:333-360）
    DgPillar(i - n4 + 5, n7 - n8 - 1, 5, false, false, 2, false);
    DgLineOfFence(i - n4 - 2, i - n10 + 1, n7 - n8 - 1);
    DgPillar(i - n10 + 5, n7 - n12 - 1, 5, false, false, 2, false);
    DgLineOfFence(i - n10 - 2, i - n14 + 1, n7 - n12 - 1);
    DgPillar(i - n14 + 5, n7 - n16 - 1, 5, false, false, 2, false);
    DgPillar(i - n14 + 13, n7 - n16 - 1, 5, false, false, 2, false);
    DgPillar(i + n4 - 5, n7 - n8 - 1, 5, false, false, 2, false);
    DgLineOfFence(i + n10 - 1, i + n4 + 2, n7 - n8 - 1);
    DgPillar(i + n10 - 5, n7 - n12 - 1, 5, false, false, 2, false);
    DgLineOfFence(i + n14 - 1, i + n10 + 2, n7 - n12 - 1);
    DgPillar(i + n14 - 5, n7 - n16 - 1, 5, false, false, 2, false);
    DgPillar(i + n14 - 13, n7 - n16 - 1, 5, false, false, 2, false);
    DgLineOfFence(i - n14 - 2, i + n14 + 2, n7 - n16 - 1);
    DgBottomWedge(i - n13, n7 - n16 + n2, 3, false);
    DgBottomWedge(i + n13 - 1, n7 - n16 + n2, 3, true);
    // 九处平台候选（:362-373，OverrideHeightFluff=0）
    dgPlats.Add(new DPlat { X = i - n10 - 2, Y = n7 - n8 + 15, Hf = 0, Force = true, Pots = 0.33000001311302185, Books = 0.75, Bottles = 0.10000000149011612 });
    dgPlats.Add(new DPlat { X = i - n10 - 2, Y = n7 - n8 + 21, Hf = 0, Force = true, Pots = 0.33000001311302185, Books = 0.75, Bottles = 0.10000000149011612 });
    dgPlats.Add(new DPlat { X = i - n14 - 2, Y = n7 - n12 + 15, Hf = 0, Force = true, Pots = 0.33000001311302185, Books = 0.75, Bottles = 0.10000000149011612 });
    dgPlats.Add(new DPlat { X = i - n14 - 2, Y = n7 - n12 + 21, Hf = 0, Force = true, Pots = 0.33000001311302185, Books = 0.75, Bottles = 0.10000000149011612 });
    dgPlats.Add(new DPlat { X = i + n10 + 2, Y = n7 - n8 + 15, Hf = 0, Force = true, Pots = 0.33000001311302185, Books = 0.75, Bottles = 0.10000000149011612 });
    dgPlats.Add(new DPlat { X = i + n10 + 2, Y = n7 - n8 + 21, Hf = 0, Force = true, Pots = 0.33000001311302185, Books = 0.75, Bottles = 0.10000000149011612 });
    dgPlats.Add(new DPlat { X = i + n14 + 2, Y = n7 - n12 + 15, Hf = 0, Force = true, Pots = 0.33000001311302185, Books = 0.75, Bottles = 0.10000000149011612 });
    dgPlats.Add(new DPlat { X = i + n14 + 2, Y = n7 - n12 + 21, Hf = 0, Force = true, Pots = 0.33000001311302185, Books = 0.75, Bottles = 0.10000000149011612 });
    dgPlats.Add(new DPlat { X = i, Y = n7 - n12 + n2 - 3, Hf = 0, Force = true, Pots = 0.33000001311302185, Books = 0.75, Bottles = 0.10000000149011612 });
    // 窗族（:375-429）
    {
        int n30 = n7 - n16 + 20;
        if (windowType == 0)
        {
            DgWindowBasic(i - 9, n30 + 4, 5, 24, -1);
            DgWindowBasic(i + 9, n30 + 4, 5, 24, -1);
            DgWindowBasic(i, n30 + 3, 5, 28, -1);
        }
        else if (windowType == 1) DgWindowMosaicSkel(i, n30 - 1, 89);
        else DgWindowMosaicMoon(i, n30 + 5, 91);
        DgWindowBasic(i - 8, n7 - 16, 9, 24, -1);
        DgWindowBasic(i + 8, n7 - 16, 9, 24, -1);
        DgWindowBasic(i - 10, n7 - 37, 7, 11, -1);
        DgWindowBasic(i + 10, n7 - 37, 7, 11, -1);
        DgWindowBasic(i, n7 - 39, 7, 13, -1);
    }
    // 双侧门洞（:431-433）
    DgTowerDoor(i, n7, n4, n3, leftSide);
    DgTowerDoor(i, n7, n4, n3, !leftSide);
    // 老头锚（SetOldManSpawnAndSpawnOldManIfDefaultDungeon :1659）
    dgDungeonX = i; dgDungeonY = n7;
    // 阶梯双侧（:437-443，depth=num5=100）
    DgStairs(i + n4, n7, 1, n5);
    DgStairs(i - n4, n7, -1, n5);
}
void DgEntrance(int seed, int preSeed)
{
    dynamic rr = Activator.CreateInstance(dgUR, preSeed)!;
    int i = dgPosX, j = dgPosY;
    for (int x = i - 60; x < i + 60; x++)
        for (int y = j - 60; y < j + 60; y++)
            if (DgInWorld(x, y, 0)) { int ti = y * W + x; liq[ti] = 0; liqT[ti] = 0; }
    double cx = i, cy = j - dgS1Y / 2.0;
    dgBounds.TopSet((int)cy);
    int num2 = i > W / 2 ? -1 : 1;
    var eb = new DBnd();
    dgEntBounds = eb;
    dgEntExists = true;
    eb.Set((int)cx, (int)cy, (int)cx, (int)cy);
    Action<int, int, int, int, bool> solidBox = (x0, y0, x1, y1, inner) =>
    {
        for (int x = x0; x < x1; x++)
            for (int y = y0; y < y1; y++)
            {
                if (!DgInWorld(x, y, 0)) continue;
                int ti = y * W + x;
                liq[ti] = 0;
                if (wal[ti] != dgWall)
                {
                    wal[ti] = 0;
                    if (inner && x > x0 + 1 && x < x1 - 2 && y > y0 + 1 && y < y1 - 2) wal[ti] = (ushort)dgWall;
                    DgChTile(ti, (ushort)dgBrick, false);
                }
            }
    };
    Action<int, int, int, int> fillIfNotDW = (x0, y0, x1, y1) =>
    {
        for (int x = x0; x < x1; x++)
            for (int y = y0; y < y1; y++)
            {
                if (!DgInWorld(x, y, 0)) continue;
                int ti = y * W + x;
                liq[ti] = 0;
                if (!DgIsDW(wal[ti])) DgChTile(ti, (ushort)dgBrick, false);
            }
    };
    int n3 = Math.Max(0, Math.Min(W - 1, (int)(cx - dgS1X * 0.6000000238418579 - (int)rr.Next(2, 5))));
    int n4 = Math.Max(0, Math.Min(W - 1, (int)(cx + dgS1X * 0.6000000238418579 + (int)rr.Next(2, 5))));
    int n5 = Math.Max(0, Math.Min(H - 1, (int)(cy - dgS1Y * 0.6000000238418579 - (int)rr.Next(2, 5))));
    int n6 = Math.Max(0, Math.Min(H - 1, (int)(cy + dgS1Y * 0.6000000238418579 + (int)rr.Next(8, 16))));
    eb.Upd(n3, n5, n4, n6);
    solidBox(n3, n5, n4, n6, true);
    // 垛口（左/右）
    {
        int a0 = Math.Max(0, Math.Min(W - 1, n3));
        int a1 = Math.Max(0, Math.Min(W - 1, n3 + 5 + (int)rr.Next(4)));
        int b0 = Math.Max(0, Math.Min(H - 1, n5 - 3 - (int)rr.Next(3)));
        eb.Upd(a0, b0, a1, n5);
        fillIfNotDW(a0, b0, a1, n5);
        int c0 = Math.Max(0, Math.Min(W - 1, n4 - 5 - (int)rr.Next(4)));
        int c1 = Math.Max(0, Math.Min(W - 1, n4));
        int d0 = Math.Max(0, Math.Min(H - 1, n5 - 3 - (int)rr.Next(3)));
        eb.Upd(c0, d0, c1, n5);
        fillIfNotDW(c0, d0, c1, n5);
    }
    // 顶齿（周期 num15 刷 num15 跳）
    {
        int n15 = 2 + (int)rr.Next(4);
        int n16 = 1 + (int)rr.Next(2);
        int n17 = 0;
        int n18 = Math.Max(0, Math.Min(H - 1, n5 - n16));
        dgBounds.Upd(n3, n18, n4, n5);
        for (int x = n3; x < n4; x++)
        {
            for (int y = n18; y < n5; y++)
            {
                if (!DgInWorld(x, y, 0)) continue;
                int ti = y * W + x;
                liq[ti] = 0;
                if (!DgIsDW(wal[ti])) DgChTile(ti, (ushort)dgBrick, false);
            }
            n17++;
            if (n17 >= n15) { x += n15; n17 = 0; }
        }
    }
    // 下延到 worldSurface（cs:215-251：StyleData.TileIsInStyle 判定 + 潜在带跳过）
    for (int x = n3; x < n4; x++)
        for (int y = n5; y < worldSurface; y++)
        {
            if (!DgInWorld(x, y, 0)) continue;
            int ti = y * W + x;
            liq[ti] = 0;
            if (DgPotContains(x, y - 5)) continue;
            bool f1 = act[ti] != 0 && typ[ti] != dgBrick && typ[ti] != dgCrack;
            bool f2 = wal[ti] != dgWall;
            bool f3 = DgIsDW(wal[ti]);
            if ((act[ti] != 0 && f1) || !f3)
            {
                DgChTile(ti, (ushort)dgBrick, false);
                if (x > n3 && x < n4 - 1) wal[ti] = (ushort)dgWall;
            }
            else if (f2 && x > n3 && x < n4 - 1) wal[ti] = (ushort)dgWall;
        }
    // 0.5 框塔内厅
    {
        int a0 = Math.Max(0, Math.Min(W - 1, (int)(cx - dgS1X * 0.5)));
        int a1 = Math.Max(0, Math.Min(W - 1, (int)(cx + dgS1X * 0.5)));
        int b0 = Math.Max(0, Math.Min(H - 1, (int)(cy - dgS1Y * 0.5)));
        int b1 = Math.Max(0, Math.Min(H - 1, (int)(cy + dgS1Y * 0.5)));
        eb.Upd(a0, b0, a1, b1);
        for (int x = a0; x < a1; x++)
            for (int y = b0; y < b1; y++)
            {
                if (!DgInWorld(x, y, 0)) continue;
                int ti = y * W + x;
                liq[ti] = 0; act[ti] = 0; wal[ti] = (ushort)dgWall;
            }
    }
    // 门厅平台候选（:269-303：自塔心向两侧找 非实心+地牢墙 列）
    // ★Z 批修复 2：vanilla :270-275 的 0.5 框把 num5/num6 重赋为 ±S1Y*0.5，
    //   :277 num27=num6 取的是 0.5 框底（=zero.Y+S1Y*0.5≈j），非首段城堡盒的
    //   num6（zero.Y+S1Y*0.6+Next(8,16)）。曾沿用旧 n6 → 平台行落到 251..263
    //   （实测 257）而 vanilla 在 249（=num26 扫描起点列）。
    {
        int n27 = Math.Max(0, Math.Min(H - 1, (int)(cy + dgS1Y * 0.5)));   // = 0.5 框底 b1（:275 num6）
        int n26 = (int)cx;
        for (int k = 0; k < 20; k++)
        {
            n26 = (int)cx - k;
            if (n26 <= 0) break;
            if (act[n27 * W + n26] == 0 && DgIsDW(wal[n27 * W + n26])) { dgPlats.Add(new DPlat { X = n26, Y = n27, Hall = false }); break; }
            n26 = (int)cx + k;
            if (n26 >= W) break;
            if (act[n27 * W + n26] == 0 && DgIsDW(wal[n27 * W + n26])) { dgPlats.Add(new DPlat { X = n26, Y = n27, Hall = false }); break; }
        }
    }
    // —— 第二段（外门厅）——
    cx += dgS1X * 0.6000000238418579 * num2;
    cy += dgS1Y * 0.5;
    double sX = dgS2X, sY = dgS2Y;
    cx += sX * 0.550000011920929 * num2;
    cy -= sY * 0.5;
    n3 = Math.Max(0, Math.Min(W - 1, (int)(cx - sX * 0.6000000238418579 - (int)rr.Next(1, 3))));
    n4 = Math.Max(0, Math.Min(W - 1, (int)(cx + sX * 0.6000000238418579 + (int)rr.Next(1, 3))));
    n5 = Math.Max(0, Math.Min(H - 1, (int)(cy - sY * 0.6000000238418579 - (int)rr.Next(1, 3))));
    n6 = Math.Max(0, Math.Min(H - 1, (int)(cy + sY * 0.6000000238418579 + (int)rr.Next(6, 16))));
    eb.Upd(n3, n5, n4, n6);
    for (int x = n3; x < n4; x++)
        for (int y = n5; y < n6; y++)
        {
            if (!DgInWorld(x, y, 0)) continue;
            int ti = y * W + x;
            if (act[ti] != 0 && typ[ti] == dgBrick) continue;
            liq[ti] = 0;
            bool f4 = true;
            if (num2 < 0) { if (x < cx - sX * 0.5) f4 = false; }
            else if (x > cx + sX * 0.5 - 1.0) f4 = false;
            if (f4) { wal[ti] = 0; DgChTile(ti, (ushort)dgBrick, false); }
        }
    eb.Upd(n3, n5, n4, worldSurface);
    for (int x = n3; x < n4; x++)
        for (int y = n6; y < worldSurface; y++)
        {
            if (!DgInWorld(x, y, 0)) continue;
            int ti = y * W + x;
            liq[ti] = 0;
            if (DgPotContains(x, y - 5)) continue;
            bool f5 = act[ti] != 0 && typ[ti] != dgBrick && typ[ti] != dgCrack;
            bool f6 = wal[ti] != dgWall;
            bool f7 = DgIsDW(wal[ti]);
            if ((act[ti] != 0 && f5) || !f7)
            {
                DgChTile(ti, (ushort)dgBrick, false);
                if (x > n3 && x < n4 - 1) wal[ti] = (ushort)dgWall;
            }
            else if (f6 && x > n3 && x < n4 - 1) wal[ti] = (ushort)dgWall;
        }
    // 第二段垛口+顶齿
    int m7 = Math.Max(0, Math.Min(W - 1, (int)(cx - sX * 0.5)));
    int m8 = m7;
    if (num2 < 0) m8 = Math.Max(0, Math.Min(W - 1, m8 + 1));
    int e1 = Math.Max(0, Math.Min(W - 1, m8 + 5 + (int)rr.Next(4)));
    int f1v = Math.Max(0, Math.Min(H - 1, n5 - 3 - (int)rr.Next(3)));
    eb.Upd(m8, f1v, e1, n5);
    fillIfNotDW(m8, f1v, e1, n5);
    int g0 = Math.Max(0, Math.Min(W - 1, Math.Max(0, Math.Min(W - 1, (int)(cx + sX * 0.5))) - 5 - (int)rr.Next(4)));
    int g1 = Math.Max(0, Math.Min(W - 1, (int)(cx + sX * 0.5)));
    int h0 = Math.Max(0, Math.Min(H - 1, n5 - 3 - (int)rr.Next(3)));
    eb.Upd(g0, h0, g1, n5);
    fillIfNotDW(g0, h0, g1, n5);
    int n4b = g1;
    if (num2 < 0) n4b++;
    {
        int n16b = 1 + (int)rr.Next(2);
        int n15b = 2 + (int)rr.Next(4);
        int n17 = 0;
        for (int x = m7 + 1; x < n4b - 1; x++)
        {
            for (int y = Math.Max(0, Math.Min(H - 1, n5 - n16b)); y < n5; y++)
            {
                if (!DgInWorld(x, y, 0)) continue;
                int ti = y * W + x;
                liq[ti] = 0;
                if (wal[ti] != dgWall) DgChTile(ti, (ushort)dgBrick, false);
            }
            n17++;
            if (n17 >= n15b) { x += n15b; n17 = 0; }
        }
    }
    // 0.6 框清墙（cs:465-483：normal 世界必跑）
    {
        int a0 = Math.Max(0, Math.Min(W - 1, (int)(cx - sX * 0.6000000238418579)));
        int a1 = Math.Max(0, Math.Min(W - 1, (int)(cx + sX * 0.6000000238418579)));
        int b0 = Math.Max(0, Math.Min(H - 1, (int)(cy - sY * 0.6000000238418579)));
        int b1 = Math.Max(0, Math.Min(H - 1, (int)(cy + sY * 0.6000000238418579)));
        eb.Upd(a0, b0, a1, b1);
        for (int x = a0; x < a1; x++)
            for (int y = b0; y < b1; y++)
                if (DgInWorld(x, y, 0)) { int ti = y * W + x; liq[ti] = 0; wal[ti] = 0; }
    }
    // 0.5 框开放门厅（active=false + wall=0）+ 老头锚
    {
        int a0 = Math.Max(0, Math.Min(W - 1, (int)(cx - sX * 0.5)));
        int a1 = Math.Max(0, Math.Min(W - 1, (int)(cx + sX * 0.5)));
        int b0 = Math.Max(0, Math.Min(H - 1, (int)(cy - sY * 0.5)));
        int b1 = Math.Max(0, Math.Min(H - 1, (int)(cy + sY * 0.5)));
        eb.Upd(a0, b0, a1, b1);
        for (int x = a0; x < a1; x++)
            for (int y = b0; y < b1; y++)
            {
                if (!DgInWorld(x, y, 0)) continue;
                int ti = y * W + x;
                liq[ti] = 0; act[ti] = 0; wal[ti] = 0;
            }
        dgDungeonX = (int)cx; dgDungeonY = b1;    // SetOldManSpawnAndSpawnOldManIfDefaultDungeon
    }
    // ★2026-08-17 真值对拍发现（堡右 45° 下行阶梯整体缺失 ~3.9k 格）：
    //   SpecialSeedFeatures.DungeonEntranceHasStairs 普通世界为 TRUE（= !IsUnderground
    //   && !roundLandmasses，SpecialSeedFeatures.cs:41-48）——LegacyDungeonEntrance.cs:462-468
    //   在老头锚后、条纹窗墙前调 DungeonUtils.GenerateDungeonStairs（DungeonUtils.cs:1222-1310）。
    //   曾整段缺失 → 堡侧阶梯丢失 + S 段起墙判定/变体锚/掷流全错位。JS 侧 DungeonPass.ts 同缺。
    {
        int sti = num2 == 1 ? Math.Max(0, Math.Min(W - 1, (int)(cx + sX * 0.5)))
                            : Math.Max(0, Math.Min(W - 1, (int)(cx - sX * 0.5)));   // i2 = num4/num3（0.5 盒缘，:463）
        int stj = Math.Max(0, Math.Min(H - 1, (int)(cy + sY * 0.5)));              // j = num6
        int stdep = (dgPotT - 10) - stj + 5;                   // GetDualDungeonBrickSupportCutoffY(=outerPotTop-10) - num6 + 5
        DgStairs(sti, stj, num2, stdep);
    }
    // 条纹窗墙（PlaceWall，墙==0 才写）
    {
        int n16c = 1 + (int)rr.Next(2);
        int n15c = 2 + (int)rr.Next(4);
        int n17 = 0;
        int a0 = (int)(cx - sX * 0.5), a1 = (int)(cx + sX * 0.5);
        int b0 = Math.Max(0, Math.Min(H - 1, (int)(cy - sY * 0.5)));
        int b1 = Math.Max(0, Math.Min(H - 1, (int)(cy + sY * 0.5)));
        a0 = Math.Max(0, Math.Min(W - 1, a0 + 2)); a1 = Math.Max(0, Math.Min(W - 1, a1 - 2));
        for (int x = a0; x < a1; x++)
        {
            for (int y = b0; y < b1 + 1; y++)
            {
                // ★Z 批修复 1：WorldGen.PlaceWall 每次调用耗 1 颗主流骰（vanilla
                //   DgZProbe 实证：条纹窗墙 169 连调用=169 连掷 6661→6830 逐位 k+1，
                //   PlaceWall→SquareWallFrame 链，与 wall==0 门无关——每次调用恒耗）。
                //   曾零耗 → E 段少掷 +169（X 批误判为"入口走廊少掷"的真根）。
                r.Next();
                if (x > 1 && y > 1 && x < W - 2 && y < H - 2 && wal[y * W + x] == 0) wal[y * W + x] = (ushort)dgWall;
            }
            n17++;
            if (n17 >= n15c) { x += n15c * 2; n17 = 0; }
        }
    }
    // 门洞：15×3 清空 + PlaceTile(10, style 13)
    cx -= sX * 0.6000000238418579 * num2;
    cy += sY * 0.5;
    cy -= 1.5;
    {
        int dL = (int)(cx - 7.5), dR = (int)(cx + 7.5);
        int dT = (int)(cy - 1.5), dB = (int)(cy + 1.5);
        eb.Upd(dL, dT, dR, dB);                              // ★Bounds.UpdateBounds(:600，num2<0 偏移前)——曾缺
        for (int x = dL; x < dR; x++)
            for (int y = dT; y < dB; y++)
            {
                if (!DgInWorld(x, y, 0)) continue;
                int ti = y * W + x;
                act[ti] = 0;
                // ★2026-08-16 审计 A3：cs:606-611 门洞清空时对"内侧半边"
                //   （num2>0 取 x<val.X、num2<0 取 x>val.X，val.X=num2<0 偏移-1 后
                //   的 zero.X）回写 wall=brickWallType——曾只清 active 不写墙
                //   （门洞内半边墙缺失，wallDungeon 判定双差）。underground/buried
                //   = SpecialSeedFeatures（普通世界恒 false）不计。
                double valX = num2 < 0 ? cx - 1.0 : cx;
                if ((num2 > 0 && x < valX) || (num2 < 0 && x > valX)) wal[ti] = (ushort)dgWall;
            }
        if (num2 < 0) cx -= 1.0;
        int dx = (int)cx, dy = (int)cy + 1;                  // PlaceTile((int)val.X, (int)val.Y+1)（val.Y=cy+1）
        DgPlaceDoor(dx, dy, 13);
    }
}
// —— DungeonUtils.GenerateDungeonStairs（:1222-1310）+ CanPlaceTile（:1312-1329）——
// 全量 tileFrameImportant（Main.cs 404 赋值 + AddEchoFurnitureTile 家族 + 循环 435-439 = 411；
// 与 FRAMED_NOT_CUT 不同：不扣 tileCut——CanPlaceTile 判定用全表）
// （FRAMED_ALL 声明已上移至 dungeon 段头部——顶层流先于 DgEntrance 执行）
bool DgStairsCanPlace(int x, int y)
{
    if (y >= dgPotT - 5) return false;                       // outerPotentialBounds.Top-5 门（:1316）
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    int ti = y * W + x;
    if (act[ti] != 0)
    {
        if (!DgCanKill(x, y)) return false;                  // WorldGen.CanKillTile（§4-B 同款建模）
        if (FRAMED_ALL.Contains(typ[ti])) return false;      // tileFrameImportant（:1324）
    }
    return true;
}
void DgStairs(int i, int j, int dir, int depth)
{
    if (!DgInWorld(i, j, 20)) return;                        // :1226
    int num = depth, num2 = depth;
    int num3 = dir == 1 ? 1 : -1;
    int num4 = 0;
    for (int k = i; (dir == 1) ? (k < i + num2) : (k > i - num2); k += num3)
    {
        num4++;
        for (int l = j + num4; l < j + num; l++)
            if (DgInWorld(k, l, 10) && !DgStairsCanPlace(k, l + 5) && num > l) { num = l; break; }
    }
    num2 = num;
    int sdep = num;
    num4 = 0;
    for (int m = i; (dir == 1) ? (m < i + num2) : (m > i - num2); m += num3)
    {
        num4++;
        for (int n = j + num4; n < j + sdep; n++)
        {
            if (!DgInWorld(m, n, 10) || n >= dgPotT - 5) continue;
            for (int q = 0; q < 4; q++)                      // n..n-3 清液（:1276-1279）
                if (n - q >= 0 && m >= 0 && m < W) liq[(n - q) * W + m] = 0;
            if (!DgStairsCanPlace(m, n)) continue;
            int ti = n * W + m;
            bool fl = wal[ti] == dgWall;                      // WallIsInStyle（Default 单样式）
            if (fl)
            {
                if (act[ti] != 0) { act[ti] = 1; typ[ti] = (ushort)dgBrick; }
                wal[ti] = (ushort)dgWall;
            }
            else
            {
                act[ti] = 1; typ[ti] = (ushort)dgBrick;
                if (n != j + num4) wal[ti] = (ushort)dgWall;  // 台面行不写墙（:1301-1304）
            }
        }
    }
}
// —— 门/平台候选 ——
// CalculatePlatformsAndDoorsOnEdgesOfRoom（DungeonUtils.cs:91-224，doorFluff=platformFluff=3）
void DgRoomPlatformsDoors(DRoom rm)
{
    int num = Math.Max(5, rm.Inner.L), num2 = Math.Min(W - 5, rm.Inner.R);
    int num3 = Math.Max(5, rm.Inner.T), num4 = Math.Min(H - 5, rm.Inner.B);
    bool f2 = false, f3 = false;
    for (int x = num; x <= num2; x++)
    {
        if (!f2 && !DgInWorld(x, num3 - 1, 0) == false && act[(num3 - 1) * W + x] == 0)
        { dgPlats.Add(new DPlat { X = x, Y = num3 - 1, Hall = false, Hf = 3 }); f2 = true; }   // ★B2：platformFluff=3（DungeonRoom.cs:161）
        if (!f3 && DgInWorld(x, num4 + 1, 0) && act[(num4 + 1) * W + x] == 0)
        { dgPlats.Add(new DPlat { X = x, Y = num4 + 1, Hall = false, Hf = 3 }); f3 = true; }
        if (f2 && f3) break;
    }
    bool f4 = false, f5 = false;
    for (int y = num3; y <= num4; y++)
    {
        if (!f4 && DgInWorld(num - 1, y, 0) && act[y * W + num - 1] == 0)
        { dgDoors.Add(new DDoor { X = num - 1, Y = y, Dir = -1, Hall = false, Fluff = 3, Clear = true }); f4 = true; }
        if (!f5 && DgInWorld(num2 + 1, y, 0) && act[y * W + num2 + 1] == 0)
        { dgDoors.Add(new DDoor { X = num2 + 1, Y = y, Dir = 1, Hall = false, Fluff = 3, Clear = true }); f5 = true; }
        if (f4 && f5) break;
    }
}
// LegacyDungeonHall.CalculatePlatformsAndDoors（:26-34；LegacyEntrance 覆写为空）
void DgHallPlatformsDoors(DHall h)
{
    if (h.IsEntrance) return;
    // ★2026-08-16 审计 B1：走廊门无 OverrideWidthFluff → DungeonGlobalDoors.cs:56
    //   缺省 num4=10（20 列扫描窗；仅房间门 OverrideWidthFluff=3）。曾 Fluff=0
    //   只扫门位单列 → 大量走廊门放不出。平台候选无 OverrideHeightFluff → hf=5。
    if (Math.Abs(h.SDY) <= 0.1) dgDoors.Add(new DDoor { X = (int)h.SX, Y = (int)h.SY, Dir = 0, Hall = true, Fluff = 10, Clear = true });
    else dgPlats.Add(new DPlat { X = (int)h.SX, Y = (int)h.SY, Hall = true, Hf = 5 });
    if (Math.Abs(h.EDY) <= 0.1) dgDoors.Add(new DDoor { X = (int)h.EX, Y = (int)h.EY, Dir = 0, Hall = true, Fluff = 10, Clear = true });
    else dgPlats.Add(new DPlat { X = (int)h.EX, Y = (int)h.EY, Hall = true, Hf = 5 });
}
// —— DungeonGlobalEarlyDualDungeonFeatures（Default：仅尾部 pit 陷阱循环，cs:662-700）——
void DgEarly()
{
    bool pitTr = Environment.GetEnvironmentVariable("DG_PIT_TRACE") != null;
    // —— DG_PIT44_FAIL：a44 强制拒绝（n==88）——判"-10,901 掷差是否全部来自 a44 翻转"——
    int pitFailAt = -1;
    {
        var pf = Environment.GetEnvironmentVariable("DG_PIT_FAIL_AT");
        if (pf != null) pitFailAt = int.Parse(pf);
    }
    int pitAtt = 0;
    int cnt = (int)(W * 2.0 * 1.0);
    for (int n = 0; n < cnt; n++)
    {
        int x3 = (int)r.Next(dgBounds.L, dgBounds.R);
        int n44 = dgBounds.T;
        if (n44 < dgDungeonY + 25) n44 = dgDungeonY + 25;
        if (n44 < worldSurface) n44 = worldSurface;
        int y2 = (int)r.Next(n44, dgBounds.B);
        if (pitTr && n == 0) Console.Error.WriteLine($"PIT num44={n44} (bounds.T={dgBounds.T} dungeonY+25={dgDungeonY + 25} worldSurface={worldSurface})");
        bool flooded = dgPitFlood || (int)r.Next(8) == 0;
        int n45 = (int)r.Next(6, 10);
        int wid = (int)r.Next(8, 19), hgt = (int)r.Next(19, 46), ew = (int)r.Next(6, 10);
        if (pitTr) Console.Error.WriteLine($"PIT a{pitAtt++} n={n} rolls={DgRolls()} x3={x3} y2={y2} fl={flooded} w={wid} h={hgt} ew={ew} td={n45} anchorW={wal[y2 * W + x3]} anchorA={act[y2 * W + x3]}");
        bool pitHit = DgPitTrap(x3, y2, wid, hgt, ew, n45, flooded);
        if (pitHit && pitFailAt >= 0 && n == pitFailAt) { pitHit = false; if (pitTr) Console.Error.WriteLine($"PIT a{pitAtt - 1} FORCED-FAIL"); }
        if (pitHit)
        {
            if (pitTr) Console.Error.WriteLine($"PITHIT a{pitAtt - 1} x3={x3} y2={y2} fl={flooded} n={n}");
            if (flooded) dgPitFlood = false;
            n += 1500;
        }
        else n++;
    }
}
// DungeonPitTrap.PitTrap（Features/DungeonPitTrap.cs:42-390，Default：flag=false/裂砖 PitTrapTile）
bool DgPitTrap(int i, int j, int width, int height, int edgeW, int topD, bool flooded)
{
    int num = j, num2 = j;
    if (width < 1 || height < 1) return false;
    int n6 = width + edgeW, n7 = height + topD;
    if (!DgInWorld(i, num, Math.Max(n6, n7))) return false;
    if (!DgIsDW(wal[num * W + i])) return false;
    if (act[num * W + i] != 0) return false;
    for (int k = num; k < H; k++)
    {
        if (k > H - 200) return false;
        if (act[k * W + i] != 0 && DgSolid(i, k))
        {
            if (typ[k * W + i] == 48) return false;
            num = k; num2 = k;
            break;
        }
    }
    if (!DgIsDW(wal[num * W + (i - width)]) || !DgIsDW(wal[num * W + (i + width)])) return false;
    int n8 = 30;
    bool found = false;
    for (int n = num; n < num + n8; n++)
    {
        bool ok = true;
        for (int x = i - width; x <= i + width; x++)
            if (act[n * W + x] != 0 && DgIsDT(typ[n * W + x])) { ok = false; break; }
        if (ok) { num = n; found = true; break; }
    }
    if (!found) { /* 30 行内未找到净空行 → num 保持原值（原版 flag5 恒真语义） */ }
    if (num + n7 >= H - 200) return false;
    for (int x = i - width; x <= i + width; x++)
        for (int y = num; y <= num + height; y++)
            if (act[y * W + x] != 0 && (DgIsDT(typ[y * W + x]) || typ[y * W + x] == dgCrack)) return false;
    for (int x = i - width; x <= i + width; x++)
        for (int y = num2; y <= num + height; y++)
        {
            int ti = y * W + x;
            if (act[ti] != 0 && DgIsDT(typ[ti]))
            {
                DgChTile(ti, (ushort)dgCrack, true);
                DgChWall(ti, (ushort)dgWall, false);
            }
        }
    for (int x = i - n6; x <= i + n6; x++)
        for (int y = num2; y <= num + n7; y++)
        {
            int ti = y * W + x;
            liqT[ti] = 0; liq[ti] = 0;
            if (DgIsDW(wal[ti])) continue;
            if (x > i - n6 && x < i + n6 && y < num + n7)
            {
                int ow = wal[ti];
                DgChTile(ti, (ushort)dgBrick, true);
                if (!DgIsDW(ow)) DgChWall(ti, (ushort)dgWall, false);
            }
            else DgChTile(ti, (ushort)dgBrick, false);
        }
    for (int x = i - width; x <= i + width; x++)
        for (int y = num2; y <= num + height; y++)
        {
            int ti = y * W + x;
            bool f6 = typ[ti] != dgCrack;
            if (!f6) continue;
            if (flooded) { liqT[ti] = 0; liq[ti] = 255; }
            else { liqT[ti] = 0; liq[ti] = 0; }
            bool a = x == i - width && act[y * W + x - 1] != 0;
            bool b = x == i + width && act[y * W + x + 1] != 0;
            bool c = y == num + height && act[(y + 1) * W + x] != 0;
            bool d = x == i - width + 1 && y % 2 == 0 && act[y * W + x - 1] != 0;
            bool e = x == i + width - 1 && y % 2 == 0 && act[y * W + x + 1] != 0;
            bool f = y == num + height - 1 && x % 2 == 0 && act[(y + 1) * W + x] != 0;
            if (a || b || c || d || e || f) DgChTile(ti, 48, false);
            else act[ti] = 0;
        }
    var pb = new DBnd();
    pb.Set(i - n6, num2, i + n6, num + n7);
    dgPits.Add(pb);
    return true;
}
// —— DungeonGlobalSpikes（:900-1105）——
bool DgCanSupportSpike(int x, int y)
{
    int ti = y * W + x;
    if (act[ti] == 0) return false;
    ushort t = typ[ti];
    if (FRAMED_NOT_CUT.Contains(t)) return false;             // tileFrameImportant && !tileCut
    if (t == 481 || t == 482 || t == 483) return false;        // IsConsideredCrackedDungeonTile
    return true;
}
void DgSpikes()
{
    bool spTr = Environment.GetEnvironmentVariable("DG_SPIKE_TRACE") != null;
    int spAtt = 0;
    int num = dgWallVariants[0];
    double num6 = Math.Max(1.0, 1.0 * 0.25);
    int num7 = (int)(42f * ((float)W / 4200f) * num6);   // ★cs:41 (float)maxTilesX/4200f——曾 int 除法（size1/2 世界 42≠64/84）
    for (int round = 0; round < 2; round++)
    {
        int n3 = 0, n4 = 1000, n5 = 0;
        while (n5 < num7)
        {
            n3++;
            int x = (int)r.Next(dgBounds.L, dgBounds.R);
            int y = (int)r.Next(worldSurface + 25, dgBounds.B);
            if (spTr) Console.Error.WriteLine($"SPK r{round} a{spAtt++} x={x} y={y} rolls={DgRolls()} wall={wal[y * W + x]} act={act[y * W + x]}");
            if (wal[y * W + x] == num && act[y * W + x] == 0)
            {
                int d = 1;
                if ((int)r.Next(2) == 0) d = -1;
                int wx = x, wy = y;
                while (DgInWorld(wx, wy, 0) && act[wy * W + wx] == 0)
                {
                    if (round == 0) wy += d; else wx += d;
                }
                bool hit = DgInWorld(wx, wy, 0);
                bool okA, okB, okC, okD2, okE;
                if (round == 0)
                {
                    okA = hit && DgInWorld(wx - 1, wy, 0) && act[wy * W + wx - 1] != 0;
                    okB = hit && DgInWorld(wx + 1, wy, 0) && act[wy * W + wx + 1] != 0;
                    okC = hit && DgInWorld(wx - 1, wy, 0) && DgCanSupportSpike(wx - 1, wy);
                    okD2 = hit && DgInWorld(wx - 1, wy - d, 0) && act[(wy - d) * W + wx - 1] == 0;
                    okE = hit && DgInWorld(wx + 1, wy - d, 0) && act[(wy - d) * W + wx + 1] == 0;
                }
                else
                {
                    okA = hit && DgInWorld(wx, wy - 1, 0) && act[(wy - 1) * W + wx] != 0;
                    okB = hit && DgInWorld(wx, wy + 1, 0) && act[(wy + 1) * W + wx] != 0;
                    okC = hit && DgInWorld(wx, wy - 1, 0) && DgCanSupportSpike(wx, wy - 1);
                    okD2 = hit && DgInWorld(wx - d, wy - 1, 0) && act[(wy - 1) * W + wx - d] == 0;
                    okE = hit && DgInWorld(wx - d, wy + 1, 0) && act[(wy + 1) * W + wx - d] == 0;
                }
                if (okA && okB && okC && okD2 && okE)
                {
                    n5++;
                    if (spTr) Console.Error.WriteLine($"SPKHIT r{round} a{spAtt - 1} x={x} y={y} wx={wx} wy={wy} d={d} n5={n5} rolls={DgRolls()}");
                    // ★D8：两段起点对齐原版（DungeonGlobalSpikes.cs:66-72/:163-170）——命中判定后
                    // 不预偏移，首刺落在命中格本身，while 条件查"步进方向下一格"支撑、放置当前格
                    //（:73-96/:170-193）。曾先 -1 使整段尖刺列整体错位一格、丢命中格尖刺。
                    // ★D9（2026-08-14）：round1 与 round0 同构走步——vanilla round1 第一段 while 条件
                    // 查 (j, num12-1) 支撑（cs:170）、放置 (j, num12)、步进 num12--（cs:191）；第二段
                    // 查 (j, num12+1)（cs:196）、步进 num12++（cs:217）。曾误传 step=0：支撑查当前格、
                    // 永不走步，每段只落 1 根尖刺（与 JS 侧 DungeonPass.ts dgSpikes 对不上）。
                    // 第一段：沿主轴负向刻尖刺（起点=命中格）
                    int n11 = (int)r.Next(5, 13);
                    int cx = wx, cy = wy;
                    DgSpikeRun(round, ref cx, ref cy, wx, wy, d, ref n11, step: -1);
                    // 第二段：沿主轴正向刻尖刺（round0 起点=原始采样 x+1 即 cs:105 num9+1；
                    // round1 起点=原始采样 y+1 即 cs:190 num13+1，非命中格 wy+1）
                    n11 = (int)r.Next(5, 13);
                    cx = round == 0 ? x + 1 : wx; cy = round == 0 ? wy : y + 1;
                    DgSpikeRun(round, ref cx, ref cy, wx, wy, d, ref n11, step: 1);
                }
            }
            if (n3 > n4) { n3 = 0; n5++; }
        }
    }
}
// 单段尖刺刻划（DungeonGlobalSpikes.cs:950-999 round0 / :1047-1096 round1）
void DgSpikeRun(int round, ref int cx, ref int cy, int wx, int wy, int d, ref int n11, int step)
{
    while (n11 > 0)
    {
        bool cond;
        if (round == 0)
        {
            int nb = cx + step;
            cond = DgInWorld(nb, wy, 0) && act[wy * W + nb] != 0 && DgCanSupportSpike(nb, wy)
                && DgInWorld(cx, wy + d, 0) && act[(wy + d) * W + cx] != 0
                && DgInWorld(cx, wy, 0) && act[wy * W + cx] != 0
                && DgInWorld(cx, wy - d, 0) && act[(wy - d) * W + cx] == 0;
        }
        else
        {
            int nb = cy + step;
            cond = DgInWorld(wx, nb, 0) && act[nb * W + wx] != 0 && DgCanSupportSpike(wx, nb)
                && DgInWorld(wx + d, cy, 0) && act[cy * W + wx + d] != 0
                && DgInWorld(wx, cy, 0) && act[cy * W + wx] != 0
                && DgInWorld(wx - d, cy, 0) && act[cy * W + wx - d] == 0;
        }
        if (!cond) break;
        int fx = round == 0 ? cx : wx, fy = round == 0 ? wy : cy;
        if (!DgFeatureOK(fx, fy, 0) || !DgFeatureOK(fx, round == 0 ? wy - d : cy - d, 0))
        {
            if (round == 0) cx += step; else cy += step;
            n11 = 0;
            continue;
        }
        typ[fy * W + fx] = 48;
        if (round == 0)
        {
            if (DgInWorld(cx - 1, wy - d, 0) && act[(wy - d) * W + cx - 1] == 0
                && DgInWorld(cx + 1, wy - d, 0) && act[(wy - d) * W + cx + 1] == 0)
            {
                int t2 = (wy - d) * W + cx; typ[t2] = 48; act[t2] = 1;
                int t3 = (wy - d * 2) * W + cx; typ[t3] = 48; act[t3] = 1;
            }
            cx += step;
        }
        else
        {
            if (DgInWorld(wx - d, cy - 1, 0) && act[(cy - 1) * W + wx - d] == 0
                && DgInWorld(wx - d, cy + 1, 0) && act[(cy + 1) * W + wx - d] == 0)
            {
                int t2 = cy * W + wx - d; typ[t2] = 48; act[t2] = 1;
                int t3 = cy * W + wx - d * 2; typ[t3] = 48; act[t3] = 1;
            }
            cy += step;
        }
        n11--;
    }
}
// DungeonData.CanGenerateFeatureAt（DungeonData.cs:132-166；pit 陷阱仅放行 Paintings/WallVariants；
// 入口 Bounds 仅拦 BiomeChests）。feat: 0=常规特征 1=BiomeChests 2=Paintings/WallVariants
bool DgFeatureOK(int x, int y, int feat)
{
    if (!DgInWorld(x, y, 5)) return false;
    if (wal[y * W + x] == 350) return false;
    if (feat == 1 && dgEntExists && dgEntBounds.Contains(x, y)) return false;
    if (feat != 2)
        for (int i = 0; i < dgPits.Count; i++)
            if (dgPits[i].Contains(x, y)) return false;
    return true;
}
bool DgFeatureAt(int x, int y, bool allowPW) => DgFeatureOK(x, y, allowPW ? 2 : 0);
// —— DungeonGlobalDoors（:24-294）——
bool DgCanKill(int x, int y)
{
    if (!DgInWorld(x, y, 0)) return false;
    int ti = y * W + x;
    if (act[ti] == 0) return false;
    if (wal[ti] == 350) return false;
    ushort t = typ[ti];
    if (t == 10) return false;                                 // IsLockedDoor(style13)=true
    if (t == 21 || t == 467 || t == 88) return false;          // CanDestroyChest：生成期箱内有物
    return true;
}
void DgDoorsF()
{
    ushort brickTile = (ushort)dgBrick;
    ushort brickWall = (ushort)dgWall;
    for (int i = 0; i < dgDoors.Count; i++)
    {
        var d = dgDoors[i];
        if (!DgInWorld(d.X, d.Y, 30)) continue;
        ushort bt = brickTile, bw = brickWall;
        int style = 13;
        if ((int)r.Next(3) == 0) style = dgDoorStyle;          // 1/3 换蓝/绿/粉门（无 OverrideStyle）
        int num2 = 20, num4 = d.Fluff;   // ★B1：d.Fluff——房间门 3（OverrideWidthFluff）、走廊门 10（cs:56 缺省）
        int n5 = Math.Max(25, Math.Min(W - 25, d.X - num4));
        int n6 = Math.Max(25, Math.Min(W - 25, Math.Max(n5, d.X + num4 - 1)));
        int n7 = 100, n8 = 0, n9 = 0, n10 = 0;
        for (int x = n5; x <= n6; x++)
        {
            bool flag = true;
            int y = d.Y;
            while (y > 10 && act[y * W + x] == 0) y--;
            if (!DgIsDT(typ[y * W + x])) flag = false;
            n9 = y;
            for (y = d.Y; act[y * W + x] == 0; y++) { if (!DgInWorld(x, y + 1, 0)) break; }
            if (!DgIsDT(typ[y * W + x])) flag = false;
            n10 = y;
            if (n10 - n9 < 3) continue;
            if (!d.SkipOther)
            {
                for (int a = x - 20; a < x + 20; a++)
                    for (int b = n10 - 10; b < n10 + 10; b++)
                        if (DgInWorld(a, b, 0) && act[b * W + a] != 0 && typ[b * W + a] == 10) { flag = false; break; }
            }
            if (flag && !d.SkipSpace)
                for (int m = n10 - 3; m < n10; m++)
                    for (int n = x - 3; n <= x + 3; n++)
                        if (DgInWorld(n, m, 0) && act[m * W + n] != 0) { flag = false; break; }
            if (flag && n10 - n9 < num2)
            {
                bool f2 = false;
                if (d.Dir == 0 && n10 - n9 < n7) f2 = true;
                if (d.Dir == -1 && x > n8) f2 = true;
                if (d.Dir == 1 && (x < n8 || n8 == 0)) f2 = true;
                if (f2) { n8 = x; n7 = n10 - n9; }
            }
        }
        if (n7 >= num2) continue;
        int n16 = n8;
        int n17 = d.Y, n18 = d.Y;
        while (DgInWorld(n16, n17, 0) && act[n17 * W + n16] == 0) n17++;
        while (n18 > 0 && act[n18 * W + n16] == 0) n18--;
        n17--; n18++;
        for (int y = n18; y < n17 - 2; y++)
        {
            int ti = y * W + n16;
            DgChTile(ti, bt, false);
            if (DgInWorld(n16 - 1, y, 0) && act[y * W + n16 - 1] != 0 && DgCanKill(n16 - 1, y))
            { int k = y * W + n16 - 1; act[k] = 0; wal[k] = bw; }
            if (DgInWorld(n16 - 2, y, 0) && act[y * W + n16 - 2] != 0 && DgCanKill(n16 - 2, y))
            { int k = y * W + n16 - 2; act[k] = 0; wal[k] = bw; }
            if (DgInWorld(n16 + 1, y, 0) && act[y * W + n16 + 1] != 0 && DgCanKill(n16 + 1, y))
            { int k = y * W + n16 + 1; act[k] = 0; wal[k] = bw; }
            if (DgInWorld(n16 + 2, y, 0) && act[y * W + n16 + 2] != 0 && DgCanKill(n16 + 2, y))
            { int k = y * W + n16 + 2; act[k] = 0; wal[k] = bw; }
        }
        DgPlaceDoor(n16, n17, style);
        n16--;
        int n20 = n17 - 3;
        while (n20 > 0 && act[n20 * W + n16] == 0) n20--;
        bool f3 = n17 - n20 < n17 - n18 + 5 && DgIsDT(typ[n20 * W + n16]);
        if (d.Clear || f3)
        {
            for (int y = n17 - 4 - (int)r.Next(3); y > n20; y--)
            {
                if (f3) DgChTile(y * W + n16, bt, false);
                if (d.Clear || typ[y * W + n16 - 1] == bt) { int k = y * W + n16 - 1; act[k] = 0; wal[k] = bw; }
                if (d.Clear || typ[y * W + n16 - 2] == bt) { int k = y * W + n16 - 2; act[k] = 0; wal[k] = bw; }
            }
        }
        n16 += 2;
        n20 = n17 - 3;
        while (n20 > 0 && act[n20 * W + n16] == 0) n20--;
        f3 = n17 - n20 < n17 - n18 + 5 && DgIsDT(typ[n20 * W + n16]);
        if (d.Clear || f3)
        {
            for (int y = n17 - 4 - (int)r.Next(3); y > n20; y--)
            {
                if (f3) DgChTile(y * W + n16, bt, false);
                if (d.Clear || typ[y * W + n16 + 1] == bt) { int k = y * W + n16 + 1; act[k] = 0; wal[k] = bw; }
                if (d.Clear || typ[y * W + n16 + 2] == bt) { int k = y * W + n16 + 2; act[k] = 0; wal[k] = bw; }
            }
        }
        n17++;
        n16--;
        for (int y = n17 - 8; y < n17; y++)
        {
            if (d.Clear || typ[y * W + n16 + 2] == bt) { int k = y * W + n16 + 2; act[k] = 0; wal[k] = bw; }
            if (d.Clear || typ[y * W + n16 + 3] == bt) { int k = y * W + n16 + 3; act[k] = 0; wal[k] = bw; }
            if (d.Clear || typ[y * W + n16 - 2] == bt) { int k = y * W + n16 - 2; act[k] = 0; wal[k] = bw; }
            if (d.Clear || typ[y * W + n16 - 3] == bt) { int k = y * W + n16 - 3; act[k] = 0; wal[k] = bw; }
        }
        DgChTile(n17 * W + n16 - 1, bt, false);
        DgChTile(n17 * W + n16 + 1, bt, false);
    }
}
// PlaceTile(10)（WorldGen.cs:59868-52994 门分支）+ PlaceDoor（:31938）
void DgPlaceDoor(int x, int y, int style)
{
    if (!DgInWorld(x, y, 1)) return;
    if (DgInWorld(x, y - 1, 0) && act[(y - 1) * W + x] == 0 && DgInWorld(x, y - 2, 0) && act[(y - 2) * W + x] == 0
        && DgInWorld(x, y - 3, 0) && act[(y - 3) * W + x] != 0 && SOLID.Contains(typ[(y - 3) * W + x]))
        DgPlaceDoorAt(x, y - 1, style);
    else if (DgInWorld(x, y + 1, 0) && act[(y + 1) * W + x] == 0 && DgInWorld(x, y + 2, 0) && act[(y + 2) * W + x] == 0
        && DgInWorld(x, y + 3, 0) && act[(y + 3) * W + x] != 0 && SOLID.Contains(typ[(y + 3) * W + x]))
        DgPlaceDoorAt(x, y + 1, style);
}
void DgPlaceDoorAt(int i2, int j2, int style)
{
    if (!DgInWorld(i2, j2 - 2, 0) || !DgInWorld(i2, j2 + 2, 0)) return;
    if (!(act[(j2 - 2) * W + i2] != 0 && SOLID.Contains(typ[(j2 - 2) * W + i2]))) return;
    if (!DgSolid(i2, j2 + 2)) return;
    for (int k = -1; k <= 1; k++)
    {
        int ti = (j2 + k) * W + i2;
        act[ti] = 1; typ[ti] = 10;
        r.Next(3);                                            // frameX = Next(3)*18（PlaceDoor:31951 等）
    }
}
// —— DungeonGlobalWallVariants（:1149-1252）——
void DgWallVariants()
{
    // —— DG_W_SEARCH=<vanBase032>：W 段流偏移 Δ 搜索（判 pre-W 漂移量的诊断钩）——
    // 以本 oracle 的 W 输入墙图为底，把流拨到 k+Δ 重建 15 锚，跑同款变体铺放，
    // 与 vanilla 终态 96/97 图对分；命中 Δ≠0 ⇒ 漂移在 W 之前（E/Pi/S/D 段）。
    var wSearch = Environment.GetEnvironmentVariable("DG_W_SEARCH");
    if (wSearch != null)
    {
        var van = File.ReadAllBytes(wSearch + ".wal");
        var snap = (ushort[])wal.Clone();
        int k0 = DgRolls();
        Console.Error.WriteLine($"DG_W_SEARCH k0={k0} bounds={dgBounds.L},{dgBounds.T},{dgBounds.R},{dgBounds.B}");
        var urtW = asm.GetType("Terraria.Utilities.UnifiedRandom")!;
        void setInnerAt(int offset)
        {
            dynamic nr = Activator.CreateInstance(urtW, seed)!;
            for (int q = 0; q < offset; q++) nr.Next();
            if (((object)r) is DgCR dc2) { dc2.inner = nr; dc2.n = offset; }
            else r = nr;
        }
        // 阶段①：原始样本预取（Next()=InternalSample；Next(a,b)=(int)(s*C*(b-a))+a），
        // 对每个 Δ 只做 45 次算术重建，按"锚点中心==其变体墙"打分（真 Δ 应近满分）。
        int maxK = k0 + 40000 + 64;
        var smp = new int[maxK + 1];
        {
            dynamic sr = Activator.CreateInstance(urtW, seed)!;
            for (int q = 0; q <= maxK; q++) smp[q] = sr.Next();
        }
        const double C = 4.656612875245797E-10;
        int bw = dgBounds.R - dgBounds.L, bh = dgBounds.B - dgBounds.T;
        int bestEx = -1, bestDelta = int.MinValue, bestNear = -1;
        var tops = new List<(int d, int ex, int near)>();
        for (int delta = -k0; delta <= 40000; delta++)
        {
            int ex = 0, near = 0;
            for (int t = 0; t < 15; t++)
            {
                int j = t % 3;
                if (j == 0) continue;
                double s0 = smp[k0 + delta + 3 * t] * C, s1 = smp[k0 + delta + 3 * t + 1] * C, s2 = smp[k0 + delta + 3 * t + 2] * C;
                int n3 = dgBounds.L + (int)(s1 * bw), n4 = dgBounds.T + (int)(s2 * bh);
                if (n3 < 2 || n3 >= W - 2 || n4 < 2 || n4 >= H - 2) continue;
                ushort want = (ushort)dgWallVariants[j];
                int vi = n4 * W + n3;
                ushort vw = (ushort)(van[vi * 2] | (van[vi * 2 + 1] << 8));
                if (vw == want) ex++;
                int cnt = 0;
                for (int a = -2; a <= 2 && cnt < 3; a++)
                    for (int b = -2; b <= 2; b++)
                    {
                        int xx = n3 + a, yy = n4 + b;
                        if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
                        int vj = yy * W + xx;
                        if ((ushort)(van[vj * 2] | (van[vj * 2 + 1] << 8)) == want) cnt++;
                    }
                if (cnt >= 3) near++;
            }
            if (ex > bestEx || (ex == bestEx && near > bestNear)) { bestEx = ex; bestNear = near; bestDelta = delta; }
            if (ex >= 5 || (ex >= 4 && near >= 6)) tops.Add((delta, ex, near));
        }
        Console.Error.WriteLine($"DG_W_SEARCH stage1 bestDelta={bestDelta} exact={bestEx}/10 near={bestNear}/10 (candidates={tops.Count})");
        for (int ti = 0; ti < tops.Count && ti < 12; ti++) Console.Error.WriteLine($"DG_W_CAND delta={tops[ti].Item1} exact={tops[ti].Item2} near={tops[ti].Item3}");
        // 阶段②：对 bestDelta 做一次完整铺放对分（击中/越界）
        if (bestDelta != int.MinValue)
        {
            Buffer.BlockCopy(snap, 0, wal, 0, snap.Length * 2);
            setInnerAt(k0 + bestDelta);
            DgWallVariantsRun();
            long hit = 0, over = 0;
            for (int q = 0; q < W * H; q++)
            {
                ushort vw = (ushort)(van[q * 2] | (van[q * 2 + 1] << 8));
                if (vw == 96 || vw == 97) { if (wal[q] == vw) hit++; }
                else if (wal[q] == 96 || wal[q] == 97) over++;
            }
            Console.Error.WriteLine($"DG_W_VERIFY delta={bestDelta} hit={hit} over={over} (van-variants=56420)");
        }
        Buffer.BlockCopy(snap, 0, wal, 0, snap.Length * 2);
        return;   // 诊断运行：不落正常 W 段（后续检查点无意义）
    }
    DgWallVariantsRun();
}
void DgWallVariantsRun()
{
    for (int i = 0; i < 5; i++)
        for (int j = 0; j < 3; j++)
        {
            int n2 = (int)r.Next(40, 240);
            int n3 = (int)r.Next(dgBounds.L, dgBounds.R);
            int n4 = (int)r.Next(dgBounds.T, dgBounds.B);
            for (int x = n3 - n2; x < n3 + n2; x++)
                for (int y = n4 - n2; y < n4 + n2; y++)
                {
                    if ((double)y <= worldSurface || !DgInWorld(x, y, 2)) continue;
                    int dx = Math.Abs(n3 - x), dy = Math.Abs(n4 - y);
                    if (Math.Sqrt(dx * dx + dy * dy) >= (double)(n2 * 0.4f)) continue;
                    if (DgIsDW(wal[y * W + x])) DgSpreadWall(x, y, (ushort)dgWallVariants[j]);
                }
        }
}
void DgSpreadWall(int x, int y, ushort wallType)
{
    if (!DgInWorld(x, y, 0)) return;
    var list2 = new List<(int, int)> { (x, y) };
    var seen = new HashSet<(int, int)>();
    while (list2.Count > 0)
    {
        var list = new List<(int, int)>(list2);
        list2.Clear();
        while (list.Count > 0)
        {
            var p = list[0];
            list.RemoveAt(0);
            if (!DgInWorld(p.Item1, p.Item2, 1)) continue;
            seen.Add(p);
            int ti = p.Item2 * W + p.Item1;
            if (wal[ti] == 0 || wal[ti] == wallType || wal[ti] == 244 || wal[ti] == 62 || !DgFeatureAt(p.Item1, p.Item2, true)) continue;
            if (dgEntExists && dgEntBounds.Contains(p.Item1, p.Item2))
            {
                if (wal[ti] != dgWall) continue;
            }
            else if (wal[ti] != dgWall) continue;
            if (!DgSolid(p.Item1, p.Item2))
            {
                wal[ti] = wallType;
                foreach (var q in new[] { (p.Item1 - 1, p.Item2), (p.Item1 + 1, p.Item2), (p.Item1, p.Item2 - 1), (p.Item1, p.Item2 + 1) })
                    if (!seen.Contains(q)) list2.Add(q);
            }
            else if (act[ti] != 0) wal[ti] = wallType;
        }
    }
}
// —— DungeonGlobalPlatforms（:24-214）——
// ★XX 批（2026-08-18）扩 ForcePlacement/IsAShelf 支（DGP.cs:66-121+:168-213，与 JS
//   dgPlatforms 同构）：force 候选跳中心 active 拒绝/长度门/邻平台门/净空门，尾门改
//   (!force || num2<=0)；IsAShelf（pots/bottles/books/candles 任一>0）逐列 else-if 链
//   ——门掷短路，命中即放置（pot: Next(10,13)+PlacePot 内含成功 Next(3)；bottle:
//   PlaceOnTable1x1(13)+type==13 后 Next(2)；book: 内含 Next(5)（NoWaterbolt 无
//   Next(50)）；candle: 零掷）。Default 候选概率全 0 → 链整段跳过——Legacy 流零变化。
void DgDungeonPot(int x, int y)
{
    int style = (int)r.Next(10, 13);
    bool ok = true;
    for (int dx = 0; dx < 2 && ok; dx++)
    {
        for (int dy = -1; dy <= 0; dy++)
            if (!DgInWorld(x + dx, y + dy, 0) || act[(y + dy) * W + x + dx] != 0) { ok = false; break; }
        if (!DgInWorld(x + dx, y + 1, 0)) { ok = false; break; }
        int gi = (y + 1) * W + x + dx;
        if (act[gi] == 0 || half[gi] != 0 || slope[gi] != 0 || !SOLID.Contains(typ[gi])) { ok = false; break; }
    }
    if (!ok) return;
    r.Next(3);                                          // PlacePot 变体掷（成功才掷）
    for (int dx = 0; dx < 2; dx++)
        for (int dy = -1; dy <= 0; dy++)
        {
            int ti = (y + dy) * W + x + dx;
            act[ti] = 1; typ[ti] = 28; DgClearSlope(ti);
        }
}
void DgPlatforms()
{
    for (int i = 0; i < dgPlats.Count; i++)
    {
        var d = dgPlats[i];
        if (!DgInWorld(d.X, d.Y, 30)) continue;
        bool force = d.Force;
        int style = -1;                                        // platformItemType 1384-1386 不消费（OverrideStyle=-1）
        int x = d.X, y = d.Y;
        int row = -1;
        int n3 = d.Hf, n4 = y < worldSurface + 50.0 ? 20 : 10; // ★B2：num3=OverrideHeightFluff（房间 3 / 走廊·入口 5，cs:44-57）
        double n5 = d.Hall ? 1.0 : 1.0;                        // HallSizeScalar=RoomSizeScalar=1
        n4 = (int)(n4 * n5);
        for (int j = y - n3; j <= y + n3; j++)
        {
            int n6 = x, n7 = x;
            bool bad = false;
            if (!force && act[j * W + x] != 0) bad = true;
            else
            {
                while (DgInWorld(n6, j, 0) && act[j * W + n6] == 0)
                {
                    n6--;
                    if (!DgInWorld(n6, j, 0)) { break; }
                    if (!force && ((act[j * W + n6] != 0 && !DgIsDT(typ[j * W + n6])) || n6 == 0)) { bad = true; break; }
                    if (n6 <= 10) break;
                }
                while (DgInWorld(n7, j, 0) && act[j * W + n7] == 0)
                {
                    n7++;
                    if (!DgInWorld(n7, j, 0)) { break; }
                    if (!force && ((act[j * W + n7] != 0 && !DgIsDT(typ[j * W + n7])) || n7 == W - 1)) { bad = true; break; }
                    if (n7 >= W - 10) break;
                }
            }
            if (bad || (!force && n7 - n6 > n4)) continue;
            bool ok = true;
            if (!force)
            {
                int a0 = Math.Max(0, x - n4 / 2 - 2), a1 = Math.Min(W - 1, x + n4 / 2 + 2);
                int b0 = j - n3, b1 = j + n3;
                for (int a = a0; a <= a1 && ok; a++)
                    for (int b = b0; b <= b1; b++)
                        if (DgInWorld(a, b, 0) && act[b * W + a] != 0 && typ[b * W + a] == 19) { ok = false; break; }
                if (ok)
                    for (int b = j + 3; b >= j - 5; b--)
                        if (DgInWorld(x, b, 0) && act[b * W + x] != 0) { ok = false; break; }
            }
            if (ok) { row = j; break; }
        }
        if ((!force || row <= 0) && (row <= y - n3 - 5 || row >= y + n3 + 5)) continue;
        int px = x, py = row, qx = x + 1;
        while (DgInWorld(px, py, 0) && act[py * W + px] == 0)
        {
            int ti = py * W + px;
            act[ti] = 1; typ[ti] = 19;
            px--;
            if (px <= 10) break;
        }
        while (DgInWorld(qx, py, 0) && act[py * W + qx] == 0)
        {
            int ti = py * W + qx;
            act[ti] = 1; typ[ti] = 19;
            qx++;
            if (qx >= W - 10) break;
        }
        // 书架链（:168-213）——px/qx 为两侧首个 active 格（含左端点）
        if (d.Pots > 0 || d.Bottles > 0 || d.Books > 0 || d.Candles > 0)
        {
            for (int m = px; m < qx; m++)
            {
                if (d.Candles > 0 && r.NextDouble() < d.Candles)
                {
                    DgPOnTable(m, py - 1, 49);          // GenerateDungeonWaterCandle
                }
                else if (d.Pots > 0 && r.NextDouble() < d.Pots)
                {
                    DgDungeonPot(m, py - 1);
                }
                else if (d.Bottles > 0 && r.NextDouble() < d.Bottles)
                {
                    DgPOnTable(m, py - 1, 13);
                    if (typ[(py - 1) * W + m] == 13) r.Next(2);
                }
                else if (d.Books > 0 && r.NextDouble() < d.Books)
                {
                    DgPOnTable(m, py - 1, 50);          // NoWaterbolt=true → 无 Next(50)；内含 Next(5)
                }
            }
        }
    }
}
// —— Prefix(-1) 掷骰（Item.cs:486-560 + GetRollablePrefixes:1083 + PrefixLegacy.Prefixes）——
int[] DgPrefixClass(int item) => item switch
{
    155 => DgPre.Swords, 156 => DgPre.Acc, 157 => DgPre.Magic, 163 => DgPre.Spears, 113 => DgPre.Magic,
    3317 => DgPre.Boom, 164 => DgPre.Guns, 1156 => DgPre.Guns, 1571 => DgPre.Boom, 1569 => DgPre.Boom,
    1260 => DgPre.Magic, 1572 => DgPre.Summon, 4607 => DgPre.Summon, 5465 => DgPre.Acc, _ => null
};
void DgPrefixRolls(int item)
{
    var arr = DgPrefixClass(item);
    if (arr == null) return;                                   // CanHavePrefixes=false（钥匙/药水/锭…）
    if ((int)r.Next(4) != 0)
    {
        int rolled = arr[(int)r.Next(arr.Length)];
        if (DgPre.Reduced.Contains(rolled)) r.Next(3);
    }
}
// AddBuriedChest（WorldGen.cs:35920-37600）——放置 + 战利品掷骰流（物品不入哈希，仅流对齐）
bool DgAddBuriedChest(int i, int j, int mainItem, int style, ushort chestTile)
{
    for (int k = j; k < H - 10; k++)
    {
        if (act[k * W + i] != 0 && typ[k * W + i] == 231) return false;
        bool boulder = false;
        for (int a = i - 2; a <= i + 2 && !boulder; a++)
            for (int b = k - 2; b <= k + 2; b++)
            {
                if (!DgInWorld(a, b, 100)) continue;
                ushort t = typ[b * W + a];
                if (act[b * W + a] != 0 && (t == 138 || t == 484 || t == 664 || t == 665 || (t >= 711 && t <= 716) || t == 26 || t == 237)) { boulder = true; break; }
            }
        if (boulder) return false;
        if (!DgSolid(i, k)) continue;
        int num7 = k;
        int num9 = style, num10 = mainItem;
        bool flag2 = false, flag3 = false, flag6 = false, flag7 = false, flag9 = false, flag10 = false, flag12 = false;
        if (chestTile == 21 && num9 != 0 && num7 >= worldSurface && DgIsDW(wal[num7 * W + i])) flag9 = true;
        if ((chestTile == 21 && (uint)(num9 - 23) <= 4u) || (chestTile == 467 && num9 == 13)) { flag9 = true; flag10 = true; }
        // —— PlaceChest（:57828）→ TileObject.CanPlace chest21/467 全链（TileObject.cs:174-857）——
        // ★G 落位根因修复（2026-08-17）：旧近似只查右列实心+2×2 act==0——缺左腿锚定门/
        //   可切覆盖/边界 5 垫/巨石双腿门（读 typ 不读 act，:57832 语义）→ 15/18 箱位差+
        //   C/G 重试流级联。chest TileObjectData（TileObjectData.cs:3459-3466）：Style2x2、
        //   Origin(0,1)、AnchorBottom=SolidTile|SolidWithTop|Table|SolidSide ×2 列、
        //   LavaDeath=false（LavaPlacement 承基 NotAllowed）、Alternates 空、RandomStyleRange=0。
        //   调用点 PlaceChest(i-1, num7-1)（cs:36254）→ 内盒占 (px,py-1)..(px+1,py)、
        //   锚腿 (px,num7)/(px+1,num7) 双过（num24==num25=2 → num35=1）。
        int px = i - 1, py = num7 - 1;
        {
            int cx = px, cy = py - 1;                          // num8/num9 = 入参 - Origin(0,1)
            bool ok = !(DG_BOULDERS_DG.Contains(typ[num7 * W + px]) || DG_BOULDERS_DG.Contains(typ[num7 * W + px + 1]));
            if (ok) ok = cx >= 5 && cx + 2 <= W - 5 && cy >= 5 && cy + 2 <= H - 5;   // :215 边界 5 垫
            for (int a = 0; ok && a < 2; a++)                  // 内盒 :337-375（LavaPlacement=NotAllowed；
                for (int b = 0; b < 2; b++)                    // 地牢段无岩浆+DG_ISO liqT 清零 → 液检不触达）
                {
                    int ci = (cy + b) * W + cx + a;
                    if (act[ci] == 0) continue;
                    ushort t2 = typ[ci];
                    if (!((DG_TILE_CUT_DG.Contains(t2) && t2 != 484 && t2 != 654) || DG_BREAK_PLACE_DG.Contains(t2)))
                    { ok = false; break; }                      // 可覆盖=tileCut∖{484,654}∪BreakableWhenPlacing
                }
            if (ok && !(DgChestLegOK(px, num7) && DgChestLegOK(px + 1, num7))) ok = false;
            if (dgCTrace) Console.Error.WriteLine($"DGC   k-scan num7={num7} legs=({typ[num7 * W + px]}/{act[num7 * W + px]},{typ[num7 * W + px + 1]}/{act[num7 * W + px + 1]}) interiorFree={ok} -> {(ok ? "PLACE" : "FAIL")}");
            // ★cs:37578：PlaceChest 败 = 本调用即 return false——k 循环只在**首实心行**掷一次
            //   （DgCanPlaceProbe 实证：vanilla 每失败调用恰 1 条 CanPlace 记录）。旧版续扫
            //   会在更深处凭空落箱（原 15/18 箱位差的第二根因，与锚定门叠加）。
            if (!ok) return false;
            for (int a = 0; a < 2; a++)
                for (int b = 0; b < 2; b++)
                {
                    int ti = (cy + b) * W + cx + a;            // TileObject.Place：占格 active+type
                    act[ti] = 1; typ[ti] = chestTile;          // （可切格先 KillTile=无掷，覆盖等价）
                }
        }
        // —— 战利品掷骰（深/金/表三分支 + 尾段；与 JS rollChestLoot 同构 + Prefix(-1) 补齐）——
        bool surf = num7 < worldSurface + 25 && false;          // flag/flag6 恒 false
        bool gold = num7 < rockLayer;
        if (surf)
        {
            if (num10 > 0) DgPrefixRolls(num10);
            else r.Next(10);
            if ((int)r.Next(6) == 0) r.Next(40, 76);           // 荧光棒 282
            if ((int)r.Next(6) == 0) r.Next(150, 301);          // 飞刀 279
            if ((int)r.Next(6) == 0) { int n = 1; if (r.Next(5) == 0) n += r.Next(2); if (r.Next(10) == 0) n += r.Next(3); }
            if ((int)r.Next(6) == 0) { int n = 1; if (r.Next(5) == 0) n += r.Next(2); if (r.Next(10) == 0) n += r.Next(3); }
            if (r.Next(3) == 0) r.Next(3, 6);                   // 手雷 168
            if (r.Next(2) == 0) { r.Next(2); var _dg = r.Next(8) + 3; }
            if (r.Next(2) == 0) r.Next(50, 101);                // 绳 965
            if (r.Next(3) != 0) { r.Next(2); var _dg2 = r.Next(26) + 25; }
            if (r.Next(2) == 0) { var _dg7b = r.Next(3) + 3; }                  // 药水 28
            if (r.Next(3) != 0) r.Next(3, 6);                   // 回城 2350
            if (r.Next(3) > 0) { r.Next(6); r.Next(1, 3); }
            if (r.Next(2) == 0) { r.Next(2); var _dg5 = r.Next(11) + 10; }
            if (r.Next(2) == 0) r.Next(10, 30);
            if (r.Next(2) == 0) r.Next(50, 100);
        }
        else if (gold)
        {
            if (num10 > 0)
            {
                DgPrefixRolls(num10);
                if (flag9 && !flag10)
                {
                    if (!dgShadowKey || r.Next(3) == 0) dgShadowKey = true;
                    if (!dgRamRune || r.Next(8) == 0) { dgRamRune = true; DgPrefixRolls(5465); }
                }
            }
            else
            {
                r.Next(6);
                if (r.Next(20) == 0) { }
                else if (r.Next(20) == 0) { var _dg2 = r.Next(26) + 25; }
            }
            if (flag3) { if (r.Next(3) == 0) r.Next(10, 20); }
            else if (r.Next(3) == 0) r.Next(10, 20);
            if (r.Next(5) == 0) { }                             // 天使雕像 52
            if (r.Next(3) == 0) r.Next(50, 101);
            if (r.Next(2) == 0) { r.Next(2); var _dg3 = r.Next(10) + 5; }
            if (r.Next(2) == 0) { r.Next(2); var _dg4 = r.Next(25) + 25; }
            if (r.Next(2) == 0) { var _dg7b = r.Next(3) + 3; }
            if (r.Next(3) > 0) { r.Next(9); r.Next(1, 3); }
            if (r.Next(3) != 0) r.Next(2, 5);
            if (r.Next(2) == 0) { var _dg5b = r.Next(11) + 10; }
            if (r.Next(2) == 0) r.Next(50, 90);
        }
        else if (num7 < H - 250)
        {
            if (num10 > 0)
            {
                DgPrefixRolls(num10);
                if (flag2 && r.Next(5) == 0) { }
                if (flag3) { if (r.Next(7) == 0) { } if (r.Next(15) == 0) { } }
                if (flag9 && !flag10)
                {
                    if (!dgShadowKey || r.Next(3) == 0) dgShadowKey = true;
                    if (!dgRamRune || r.Next(8) == 0) { dgRamRune = true; DgPrefixRolls(5465); }
                }
            }
            else
            {
                int num25 = (int)r.Next(7);
                if ((int)r.Next(20) == 0 && num7 > lavaLine) { }
                else if ((int)r.Next(15) == 0) { }
                else if (num25 == 6) { var _dg2 = r.Next(26) + 25; }
            }
            if (r.Next(5) == 0) { }                             // 可疑眼球 43
            if (r.Next(3) == 0) { }                             // 炸药 167
            if (r.Next(4) == 0) r.Next(25, 51);                 // 小丑箭 51
            if (r.Next(2) == 0) { r.Next(2); r.Next(3, 11); }
            if (r.Next(2) == 0) { r.Next(2); r.Next(25, 51); }
            if (r.Next(2) == 0) r.Next(3, 6);                   // 药水 188
            if (r.Next(3) > 0) { r.Next(6); r.Next(1, 3); }
            if (r.Next(3) > 1) { r.Next(6); r.Next(1, 3); }
            if (r.Next(2) == 0) r.Next(2, 5);                   // 回城 2350
            if (r.Next(2) == 0) { r.Next(2); r.Next(15, 31); }
            if (r.Next(2) == 0) r.Next(1, 3);                   // 金币 73
        }
        else
        {
            if (num10 > 0) DgPrefixRolls(num10);
            else r.Next(4);
            if (r.Next(3) == 0) { }                             // 炸药 167
            if (r.Next(2) == 0) { r.Next(2); r.Next(15, 30); }
            if (r.Next(2) == 0) { r.Next(2); r.Next(50, 75); }
            if (r.Next(2) == 0) { var _dg6b = r.Next(6) + 15; }                 // 再生药水 227
            if (r.Next(3) > 0) { r.Next(8); r.Next(1, 3); }
            if (r.Next(3) > 1) { r.Next(8); r.Next(1, 3); }
            { r.Next(1, 3); r.Next(2); }
            if (r.Next(2) == 0) { r.Next(2); r.Next(15, 30); }
            if (r.Next(2) == 0) r.Next(2, 5);
        }
        // 尾段（cs:37414-37560）：21 块 = flag9 1/8 砍刀（:37432 无 !flag10 门——上锁箱也掷！）
        //   + (num9∈23..27)&&1/2 残片 5234（:37476）+ voice 门 Next(12)（:37554，命中再
        //   GetRandomVoiceItem=Next(14)）；467 块独立 = (num9==13)&&Next(2) 残片（:37543）。
        //   ★U 批修正（DgItemProbe 逐 SetDefaults/Prefix 实证 call0 段账）：旧近似把
        //   flag9 Next(8) 误挂 !flag10 门 + 残片门误并 flag10 → 上锁 21 箱每箱少掷 1 颗
        //   → C 段起全段流偏（vanilla 尾 = Next(8)+Next(2)+Next(12) 三掷）。
        if (flag9 && chestTile == 21) { if (r.Next(8) == 0) { } }   // :37432（21 尾块内——467 走 467 块无此掷）
        if (chestTile == 21 && num9 >= 23 && num9 <= 27) { if (r.Next(2) == 0) { } }
        else if (chestTile == 467 && num9 == 13) { if (r.Next(2) == 0) { } }
        if (r.Next(12) == 0) r.Next(14);              // AddVoiceChangeItemToChest → GetRandomVoiceItem
        return true;
    }
    return false;
}
// —— DungeonGlobalBiomeChests.BiomeChests（:104-180，Default 分支）——
void DgBiomeChests()
{
    if (dgCTrace) Console.Error.WriteLine($"DGC bounds L={dgBounds.L} R={dgBounds.R} T={dgBounds.T} B={dgBounds.B} ws={worldSurface} ent={(dgEntExists ? $"{dgEntBounds.L},{dgEntBounds.T},{dgEntBounds.R},{dgEntBounds.B}" : "none")}");
    int num = 5;
    for (int i = 0; i < num; i++)
    {
        bool flag = false;
        int n3 = 1000;
        while (!flag)
        {
            n3--;
            if (n3 <= 0) break;
            int x = (int)r.Next(dgBounds.L, dgBounds.R);
            int y = (int)r.Next(worldSurface, dgBounds.B);
            if (dgCTrace) Console.Error.WriteLine($"DGC i={i} n3={n3} roll={DgRolls()} try=({x},{y}) ent={(dgEntExists && dgEntBounds.Contains(x, y))} dw={DgIsDW(wal[y * W + x])} act={act[y * W + x]}");
            if ((dgEntExists && dgEntBounds.Contains(x, y)) || !DgIsDW(wal[y * W + x]) || act[y * W + x] != 0) continue;
            ushort chestTile = 21;
            int mainItem = 0, chestStyle = 0;
            switch (i % num)
            {
                case 0: chestStyle = 23; mainItem = 1156; break;
                case 1: if (!crimson) { chestStyle = 24; mainItem = 1571; } else { chestStyle = 25; mainItem = 1569; } break;
                case 2: chestStyle = 26; mainItem = 1260; break;
                case 3: chestStyle = 27; mainItem = 1572; break;
                case 4: chestTile = 467; chestStyle = 13; mainItem = 4607; break;
            }
            flag = DgAddBuriedChest(x, y, mainItem, chestStyle, chestTile);
        }
    }
}
// —— DungeonGlobalBasicChests（:21-34）+ GenerateDungeonRegularChest（DungeonUtils.cs:351-403）——
void DgBasicChests()
{
    for (int i = 0; i < dgRooms.Count; i++)
    {
        var rm = dgRooms[i];
        int half = (int)(rm.Strength * 0.4f);
        for (int j = 0; j < 1000; j++)
        {
            int num = (int)((double)(rm.EX - half) + ((double)(rm.EX + half) - (double)(rm.EX - half)) * (double)r.NextDouble());
            int num2 = (int)((double)(rm.EY - half) + ((double)(rm.EY + half) - (double)(rm.EY - half)) * (double)r.NextDouble());
            if (!DgFeatAreaOK(num, num2, 1)) continue;          // CanGenerateFeatureInArea(feature, num, num2, 1)
            int itemType, chestStyle = 2;
            DgLootStyle(num2, out itemType, ref chestStyle);
            if (DgAddBuriedChest(num, num2, itemType, chestStyle, 21)) { dgLootStyle++; break; }
        }
    }
}
bool DgFeatAreaOK(int x, int y, int fluff)
{
    for (int a = x - fluff; a <= x + fluff; a++)
        for (int b = y - fluff; b <= y + fluff; b++)
            if (!DgFeatureOK(a, b, 0)) return false;
    return true;
}
// GetDungeonLootAndChestStyle（WorldGen.cs:35843-35891）
void DgLootStyle(int y, out int itemType, ref int chestStyle)
{
    itemType = 0;
    chestStyle = 2;
    if (dgLootStyle >= 8) dgLootStyle = 0;
    switch (dgLootStyle)
    {
        default: itemType = 155; break;
        case 1: itemType = 156; break;
        case 2: itemType = 157; break;
        case 3: itemType = 163; break;
        case 4: itemType = 113; break;
        case 5: itemType = 3317; break;
        case 6: itemType = 327; chestStyle = 0; break;
        case 7: itemType = 164; break;
    }
    if ((double)y < worldSurface + 50.0) { itemType = 327; chestStyle = 0; }
}
// —— DungeonGlobalBookshelves（:23-208）——
void DgBookshelves()
{
    int num = 0, num3 = 0;
    while (num3 < W / 20)
    {
        num++;
        int x = (int)r.Next(dgBounds.L, dgBounds.R);
        int y = (int)r.Next(dgBounds.T, dgBounds.B);
        if (dgCTrace) Console.Error.WriteLine($"DGB iter n3={num3} n={num} roll={DgRolls()} try=({x},{y}) dw={DgIsDW(wal[y * W + x])} act={act[y * W + x]}");
        bool flag = true;
        if (DgIsDW(wal[y * W + x]) && act[y * W + x] == 0)
        {
            int n7 = 1;
            if ((int)r.Next(2) == 0) n7 = -1;
            while (flag && DgInWorld(x, y, 0) && act[y * W + x] == 0)
            {
                x -= n7;
                if (x < 5 || x > W - 5) flag = false;
                else if (act[y * W + x] != 0 && !DgIsDT(typ[y * W + x])) flag = false;
            }
            if (flag && DgInWorld(x, y, 0) && act[y * W + x] != 0 && DgIsDT(typ[y * W + x])
                && act[(y - 1) * W + x] != 0 && DgIsDT(typ[(y - 1) * W + x])
                && act[(y + 1) * W + x] != 0 && DgIsDT(typ[(y + 1) * W + x]))
            {
                x += n7;
                for (int a = x - 3; a <= x + 3 && flag; a++)
                    for (int b = y - 3; b <= y + 3; b++)
                        if (DgInWorld(a, b, 0) && act[b * W + a] != 0 && typ[b * W + a] == 19) { flag = false; break; }
                if (flag && DgInWorld(x, y - 1, 0) && act[(y - 1) * W + x] == 0
                    && DgInWorld(x, y - 2, 0) && act[(y - 2) * W + x] == 0
                    && DgInWorld(x, y - 3, 0) && act[(y - 3) * W + x] == 0)
                {
                    if (!DgFeatureOK(x, y, 0)) { flag = false; continue; }
                    int k = x, num8 = x;
                    while (k > dgBounds.L && k < dgBounds.R && act[y * W + k] == 0 && act[(y - 1) * W + k] == 0 && act[(y + 1) * W + k] == 0) k += n7;
                    k = Math.Abs(x - k);
                    bool flag3 = (int)r.Next(2) == 0;
                    if (k > 5)
                    {
                        int n10 = (int)r.Next(1, 4);
                        if (dgCTrace) Console.Error.WriteLine($"DGB shelf start=({x},{y}) n10={n10} flag3={flag3} roll={DgRolls()}");
                        while (n10 > 0)
                        {
                            int ti = y * W + x;
                            // ★B3：frameY = 18*shelfStyles[档]（cs:112-138：墙==wallVariants[1]/[2]
                            //   换档；Default GetPlatformStyle 恒 -1 不覆写）。曾误用 dgPlatforms
                            //   的 platformStyle（那是平台件样式）→ 书架长成主题平台贴图。
                            //   frameY 通道不在 typ/act/wal/liq dump 内，此处仅注释留档。
                            act[ti] = 1; typ[ti] = 19;
                            if (flag3)
                            {
                                DgPOnTable(x, y - 1, 50);          // ★PlaceTile(50)→PlaceOnTable1x1（平台19 ∈ tileTable）
                                if ((int)r.Next(50) == 0 && (double)y > (worldSurface + rockLayer) / 2.0) { }
                            }
                            x += n7;
                            n10--;
                        }
                        num = 0; num3++;
                        if (!flag3 && (int)r.Next(2) == 0)
                        {
                            x = num8; y--;
                            int n12 = (int)r.Next(4) == 0 ? 1 : 0;
                            n12 = n12 == 0 ? 13 : 49;
                            DgPOnTable(x, y, n12);                 // ★13/49 同为 PlaceOnTable1x1
                            if (DgInWorld(x, y, 0) && typ[y * W + x] == 13) r.Next(2);
                        }
                    }
                }
            }
        }
        if (num > 1000) { num = 0; num3++; }
    }
}
// —— DungeonGlobalLights（:24-141）+ Lights_GenerateSwitch ——
void DgLights()
{
    bool lgTr = Environment.GetEnvironmentVariable("DG_LIGHTS_TRACE") != null;
    if (lgTr)
    {
        Console.WriteLine($"DG LG n5={(int)(28f * (W / 4200f) * 1.0)} bnd={dgBounds.L},{dgBounds.T},{dgBounds.R},{dgBounds.B} ent={(dgEntExists ? 1 : 0)} eb={dgEntBounds.L},{dgEntBounds.T},{dgEntBounds.R},{dgEntBounds.B}");
        Console.Write("DG PITS");
        for (int pi = 0; pi < dgPits.Count; pi++) Console.Write($" {dgPits[pi].L},{dgPits[pi].T},{dgPits[pi].R},{dgPits[pi].B}");
        Console.WriteLine();
    }
    int num5 = (int)(28f * (W / 4200f) * 1.0);
    int num2 = 0, num4 = 0;
    while (num4 < num5)
    {
        num2++;
        int x = (int)r.Next(dgBounds.L, dgBounds.R);
        int y = (int)r.Next(dgBounds.T, dgBounds.B);
        if (DgIsDW(wal[y * W + x]))
        {
            for (int cy = y; cy > dgBounds.T; cy--)
            {
                if (!(DgInWorld(x, cy - 1, 0) && act[(cy - 1) * W + x] != 0 && DgIsDT(typ[(cy - 1) * W + x])
                    && DgFeatureOK(x, cy, 0)
                    && ((dgEntExists && dgEntBounds.Contains(x, cy)) || DgIsDW(wal[cy * W + x])))) continue;
                bool near = false;
                for (int a = x - 15; a < x + 15 && !near; a++)
                    for (int b = cy - 15; b < cy + 15; b++)
                        if (DgInWorld(a, b, 0) && act[b * W + a] != 0 && (typ[b * W + a] == 42 || typ[b * W + a] == 34)) { near = true; break; }
                if (DgInWorld(x - 1, cy, 0) && act[cy * W + x - 1] != 0
                    || DgInWorld(x + 1, cy, 0) && act[cy * W + x + 1] != 0
                    || DgInWorld(x - 1, cy + 1, 0) && act[(cy + 1) * W + x - 1] != 0
                    || DgInWorld(x + 1, cy + 1, 0) && act[(cy + 1) * W + x + 1] != 0
                    || DgInWorld(x, cy + 2, 0) && act[(cy + 2) * W + x] != 0) near = true;
                if (lgTr) Console.WriteLine($"DG CAN n2={num2} n4={num4} x={x} y={y} cy={cy} near={(near ? 1 : 0)}");
                if (near) break;
                bool placed = false;
                int r7 = (int)r.Next(7);
                if (lgTr) Console.WriteLine($"DG R7 x={x} cy={cy} v={r7}");
                if (r7 == 0)
                {
                    bool blocked = false;
                    for (int k = 0; k < 15; k++) if (DgInWorld(x, cy + k, 0) && DgSolid(x, cy + k)) { blocked = true; break; }
                    if (lgTr) Console.WriteLine($"DG CH x={x} cy={cy} blocked={(blocked ? 1 : 0)}");
                    // ★2026-08-16 审计 B4：cs:77-78 吊灯支要求 GetStyleForWall!=null ——
                    //   Default 样式 WallIsInStyle 仅 wall==主砖墙命中，变体墙(94-99)
                    //   返 null → 跳过吊灯直接落灯笼。曾变体墙也试吊灯（Next(7) 掷序
                    //   两侧一致，仅放置集分叉）。
                    if (!blocked && wal[cy * W + x] == dgWall && DgPlaceChand(x, cy))
                    {
                        placed = true; num2 = 0; num4++;
                        DgSwitch(x, cy);
                    }
                }
                if (placed) break;
                // 灯笼（Place1x2Top：上方实心且下方净空 → 42 两格）
                if (DgInWorld(x, cy - 1, 0) && act[(cy - 1) * W + x] != 0 && SOLID.Contains(typ[(cy - 1) * W + x]) && !dgSolidTop.Contains(typ[(cy - 1) * W + x])
                    && DgInWorld(x, cy + 1, 0) && act[(cy + 1) * W + x] == 0)
                {
                    if (lgTr) Console.WriteLine($"DG LP x={x} cy={cy} typAbv={typ[(cy - 1) * W + x]}");
                    act[cy * W + x] = 1; typ[cy * W + x] = 42;
                    act[(cy + 1) * W + x] = 1; typ[(cy + 1) * W + x] = 42;
                    placed = true; num2 = 0; num4++;
                    DgSwitch(x, cy);
                }
                break;                                          // 灯笼尝试后必 break（:131）
            }
        }
        if (num2 > 1000) { num4++; num2 = 0; }
    }
}
// PlaceChand（WorldGen.cs:52753）：3×3 净空 + 上方实心 → type 34
bool DgPlaceChand(int x, int y)
{
    for (int a = x - 1; a < x + 2; a++)
        for (int b = y; b < y + 3; b++)
            if (!DgInWorld(a, b, 0) || act[b * W + a] != 0) return false;
    if (!(DgInWorld(x, y - 1, 0) && act[(y - 1) * W + x] != 0 && SOLID.Contains(typ[(y - 1) * W + x]) && !dgSolidTop.Contains(typ[(y - 1) * W + x]))) return false;
    for (int a = x - 1; a < x + 2; a++)
        for (int b = y; b < y + 3; b++)
        { int ti = b * W + a; act[ti] = 1; typ[ti] = 34; }
    return true;
}
// Lights_GenerateSwitch（:144-193）：随机找开关位（Collision.CanHit 视线通）→ PlaceTile(136)
void DgSwitch(int x, int y)
{
    bool swTr = Environment.GetEnvironmentVariable("DG_LIGHTS_TRACE") != null;
    for (int i = 0; i < 1000; i++)
    {
        int a = x + (int)r.Next(-12, 13);
        int b = y + (int)r.Next(3, 21);
        bool sgInW = DgInWorld(a, b, 0) && DgInWorld(a, b + 1, 0);
        bool sgAct = sgInW && act[b * W + a] == 0 && act[(b + 1) * W + a] == 0;
        bool sgL = sgAct && DgInWorld(a - 1, b, 0) && DgIsDT(typ[b * W + a - 1]);
        bool sgR = sgL && DgInWorld(a + 1, b, 0) && DgIsDT(typ[b * W + a + 1]);
        bool sgH = sgR && DgCanHit(a, b, x, y);
        if (swTr) Console.WriteLine($"DG SW i={i} x={x} y={y} a={a} b={b} inW={(sgInW ? 1 : 0)} act={(sgAct ? 1 : 0)} dtL={(sgL ? 1 : 0)} dtR={(sgR ? 1 : 0)} hit={(sgH ? 1 : 0)} tL={(sgInW && DgInWorld(a - 1, b, 0) ? typ[b * W + a - 1] : -1)} tR={(sgInW && DgInWorld(a + 1, b, 0) ? typ[b * W + a + 1] : -1)} aL={(sgInW ? act[b * W + a - 1] : -1)} aR={(sgInW ? act[b * W + a + 1] : -1)}");
        if (!sgInW) continue;
        if (!sgAct) continue;
        if (!sgL) continue;
        if (!sgR) continue;
        if (!sgH) continue;
        bool anchor = (DgSolid(a - 1, b) && typ[b * W + a - 1] != 10) || (DgSolid(a + 1, b) && typ[b * W + a + 1] != 10) || DgSolid(a, b + 1);
        if (anchor && DgIsDW(wal[b * W + a]) && (DgIsDT(typ[b * W + a - 1]) || DgIsDT(typ[b * W + a + 1])))
        {
            if (act[b * W + a] == 0) { act[b * W + a] = 1; typ[b * W + a] = 136; }
        }
        if (act[b * W + a] == 0) continue;
        if ((int)r.Next(3) > 0) { }                             // frameX=18（不入哈希）
        if (swTr) Console.WriteLine($"DG SWX i={i} a={a} b={b}");
        break;
    }
}
// Collision.CanHit（Collision.cs:388-460）——两点视线（仅实心非 solidTop 拦截）
bool DgCanHit(int x1, int y1, int x2, int y2)
{
    int cx = Math.Clamp(x1, 1, W - 1), cy = Math.Clamp(y1, 1, H - 41);
    int tx = Math.Clamp(x2, 1, W - 1), ty = Math.Clamp(y2, 1, H - 41);
    while (true)
    {
        int dx = Math.Abs(cx - tx), dy = Math.Abs(cy - ty);
        if (cx == tx && cy == ty) return true;
        if (dx > dy)
        {
            cx += cx >= tx ? -1 : 1;
            if (!DgInWorld(cx, cy - 1, 0) || !DgInWorld(cx, cy + 1, 0)) return false;
            if (DgBlockPair(cx, cy - 1, cx, cy + 1)) return false;
        }
        else
        {
            cy += cy >= ty ? -1 : 1;
            if (!DgInWorld(cx - 1, cy, 0) || !DgInWorld(cx + 1, cy, 0)) return false;
            if (DgBlockPair(cx - 1, cy, cx + 1, cy)) return false;
        }
    }
}
bool DgBlockPair(int ax, int ay, int bx, int by)
{
    bool f(int x, int y)
    {
        if (!DgInWorld(x, y, 0) || act[y * W + x] == 0) return false;
        ushort t = typ[y * W + x];
        return SOLID.Contains(t) && !dgSolidTop.Contains(t);
    }
    return f(ax, ay) && f(bx, by);
}
// —— DungeonGlobalTraps（:23-152，Default：placeTrap(x,y,0) 飞镖）——
void DgTraps()
{
    int num5 = (int)(8.4f * (W / 4200f) * 1.0);
    int num2 = 0, num4 = 0;
    while (num4 < num5)
    {
        num2++;
        int x = (int)r.Next(dgBounds.L, dgBounds.R);
        int y = (int)r.Next(worldSurface, dgBounds.B);
        if (DgIsDW(wal[y * W + x]) && DgPlaceTrap0(x, y)) num2 = 1000;
        if (num2 > 1000) { num4++; num2 = 0; }
    }
}
// placeTrap type=0（WorldGen.cs:8875-9150 飞镖分支）
bool DgPlaceTrap0(int x2, int y2)
{
    int num = y2;
    while (!DgSolid(x2, num))
    {
        num++;
        if (num > H - 10) return false;
    }
    num--;
    if (!DgInWorld(x2, num, 3)) return false;
    for (int a = x2 - 20; a <= x2 + 20; a++)
        for (int b = num - 20; b <= num + 20; b++)
            if (DgInWorld(a, b, 0) && act[b * W + a] != 0 && typ[b * W + a] == 70) return false;
    if (wal[num * W + x2] == 87 || wal[num * W + x2] == 350) return false;
    bool lava = liq[num * W + x2] > 0 && liqT[num * W + x2] == 1;
    if (lava) return false;
    for (int a = 0; a <= 2; a++)
        for (int b = -2; b <= 0; b++)
        {
            int xx = x2 + (a == 0 ? 0 : a == 1 ? -1 : 1);
            int yy = num + b;
            if (DgInWorld(xx, yy, 0) && act[yy * W + xx] != 0) return false;
        }
    if (DgInWorld(x2, num + 1, 0) && (typ[(num + 1) * W + x2] == 48 || typ[(num + 1) * W + x2] == 232)) return false;
    if (!DgInWorld(x2, num + 1, 0) || !DgSolid(x2, num + 1)) return false;   // CanGeneratePressurePlateAt
    {
        ushort bt = typ[(num + 1) * W + x2];
        if (bt == 138 || bt == 484 || bt == 664 || bt == 665 || (bt >= 711 && bt <= 716)) return false;
        if (wal[(num + 1) * W + x2] == 350) return false;
    }
    int num27 = num - (int)r.Next(3);
    int num28 = x2;
    while (!(DgInWorld(num28, num27, 0) && DgSolid(num28, num27)) && !(DgInWorld(num28, num27, 0) && act[num27 * W + num28] != 0 && (typ[num27 * W + num28] == 481 || typ[num27 * W + num28] == 482 || typ[num27 * W + num28] == 483)))
    {
        num28--;
        if (num28 < 0) return false;
    }
    int num29 = x2;
    while (!(DgInWorld(num29, num27, 0) && DgSolid(num29, num27)) && !(DgInWorld(num29, num27, 0) && act[num27 * W + num29] != 0 && (typ[num27 * W + num29] == 481 || typ[num27 * W + num29] == 482 || typ[num27 * W + num29] == 483)))
    {
        num29++;
        if (num29 > W) return false;
    }
    int n30 = x2 - num28, n31 = num29 - x2;
    bool f5 = n30 > 5 && n30 < 50, f6 = n31 > 5 && n31 < 50;
    if (f5 && !DgSolid(num28, num27 + 1)) f5 = false;
    if (f6 && !DgSolid(num29, num27 + 1)) f6 = false;
    if (f5 && ((DgInWorld(num28, num27, 0) && act[num27 * W + num28] != 0 && (typ[num27 * W + num28] == 10 || typ[num27 * W + num28] == 48))
        || (DgInWorld(num28, num27 + 1, 0) && act[(num27 + 1) * W + num28] != 0 && (typ[(num27 + 1) * W + num28] == 10 || typ[(num27 + 1) * W + num28] == 48)))) f5 = false;
    if (f6 && ((DgInWorld(num29, num27, 0) && act[num27 * W + num29] != 0 && (typ[num27 * W + num29] == 10 || typ[num27 * W + num29] == 48))
        || (DgInWorld(num29, num27 + 1, 0) && act[(num27 + 1) * W + num29] != 0 && (typ[(num27 + 1) * W + num29] == 10 || typ[(num27 + 1) * W + num29] == 48)))) f6 = false;
    int num26, num32;
    if (f5 && f6) { num32 = 1; num26 = num28; if ((int)r.Next(2) == 0) { num26 = num29; num32 = -1; } }
    else if (f6) { num26 = num29; num32 = -1; }
    else { if (!f5) return false; num26 = num28; num32 = 1; }
    if (typ[num27 * W + num26] == 190) return false;
    if (wal[num27 * W + num26] == 350) return false;
    if (wal[num * W + x2] > 0) { int ti = num * W + x2; act[ti] = 1; typ[ti] = 135; }
    else { int ti = num * W + x2; act[ti] = 1; typ[ti] = 135; r.Next(2, 4); }
    act[num27 * W + num26] = 0;                                // KillTile（生成期 noItem）
    { int ti = num27 * W + num26; act[ti] = 1; typ[ti] = 137; }
    return true;
}
// —— DungeonGlobalGroundFurniture.GroundFurniture（Default，:187-253）——
void DgFurniture()
{
    int num2 = (int)(2000f * (W / 4200f) * 1.0);
    int alch = 1 + (int)(W / 4200f), bew = 1 + (int)(W / 4200f);
    int num3 = 2000;
    for (int j = 0; j < num2; j++)
    {
        if (alch > 0 || bew > 0)
        {
            j--;
            num3--;
            if (num3 <= 0) break;
        }
        int x = (int)r.Next(dgBounds.L, dgBounds.R);
        int y = (int)r.Next(Math.Max(dgBounds.T, worldSurface + 10), dgBounds.B);
        int n5 = 1000;
        while (!DgIsDW(wal[y * W + x]) || act[y * W + x] != 0)
        {
            n5--;
            if (n5 <= 0) break;
            x = (int)r.Next(dgBounds.L, dgBounds.R);
            y = (int)r.Next(Math.Max(dgBounds.T, worldSurface + 10), dgBounds.B);
        }
        if (DgIsDW(wal[y * W + x]) && act[y * W + x] == 0)
        {
            while (!DgSolid(x, y) && y < H - 200) y++;
            y--;
            DgFurnAt(x, y, ref alch, ref bew, j < num2 / 2);
        }
    }
}
// GroundFurniture_ActuallyGenerateFurniture（:255-861，Default/style0 路径）
bool DgFurnAt(int i, int j, ref int alch, ref int bew, bool stricter)
{
    int num = i, k = i;
    while (DgInWorld(num, j, 0) && act[j * W + num] == 0 && DgSolid(num, j + 1)) num--;
    num++;
    while (DgInWorld(k, j, 0) && act[j * W + k] == 0 && DgSolid(k, j + 1)) k++;
    k--;
    int num2 = k - num, num3 = (k + num) / 2;
    if (!DgFeatureOK(num3, j, 0)) return false;
    if (DgInWorld(num3, j, 0) && act[j * W + num3] == 0 && DgIsDW(wal[j * W + num3]) && DgSolid(num3, j + 1) && typ[(j + 1) * W + num3] != 48)
    {
        int[] it = dungeonTheme == 0
            ? new[] { 1396, 1397, 1398, 1405, 1408, 1414, 1470, 2376, 2386, 2402, 2658, 2664, 2645, 3900 }
            : dungeonTheme == 1
                ? new[] { 1399, 1400, 1401, 1406, 1409, 1415, 1471, 2377, 2387, 2403, 2659, 2665, 2646, 3901 }
                : new[] { 1402, 1403, 1404, 1407, 1410, 1416, 1472, 2378, 2388, 2404, 2660, 2666, 2647, 3902 };
        int iChair = it[0], iTable = it[1], iWork = it[2], iCandle = it[3], iVase = it[4], iBook = it[5], iBed = it[6];
        int iPiano = it[7], iDress = it[8], iSofa = it[9], iTub = it[10], iCand = it[11], iLamp = it[12], iClock = it[13];
        int wv = wal[j * W + num3];
        if (wv >= 94 && wv <= 105)
        {
            iChair = 1509; iTable = 1510; iWork = 1511; iCandle = 5743; iVase = -1; iBook = 1512; iBed = 5740;
            iPiano = 5750; iDress = 5741; iSofa = 5753; iTub = 5739; iCand = 5742; iLamp = 5748; iClock = 5746;
        }
        int num18 = (int)r.Next(13);
        if ((num18 == 10 || num18 == 11 || num18 == 12) && (int)r.Next(4) != 0) num18 = (int)r.Next(13);
        while ((num18 == 2 && iVase == -1) || (num18 == 5 && iBed == -1) || (num18 == 6 && iPiano == -1) || (num18 == 7 && iDress == -1)
            || (num18 == 8 && iSofa == -1) || (num18 == 9 && iTub == -1) || (num18 == 10 && iCand == -1) || (num18 == 11 && iLamp == -1) || (num18 == 12 && iClock == -1))
            num18 = (int)r.Next(13);
        int num19 = num18 switch { 0 => 5, 1 => 4, 2 => 3, 3 => 4, 4 => 3, 5 => 5, 6 => 5, 7 => 5, 8 => 5, 9 => 5, 10 => 2, 11 => 3, _ => 2 };
        int num20 = num18 switch { 0 => 4, 1 => 3, 2 => 5, 3 => 6, 4 => 3, 5 => 3, 6 => 4, 7 => 4, 8 => 4, 9 => 3, 10 => 4, 11 => 3, _ => 5 };
        bool flag3 = false, flag4 = false;
        int num21 = (alch > 0 || bew > 0) ? 15 : 0;
        for (int a = num3 - num19 - num21; a <= num3 + num19 + num21; a++)
            for (int b = j - num20 - num21; b <= j + num21; b++)
            {
                if (!DgInWorld(a, b, 0)) continue;
                if (a >= num3 - num19 && a <= num3 + num19 && b >= j - num20 && b <= j)
                {
                    if (!DgFeatureOK(a, b, 0)) { flag3 = true; break; }
                    if (act[b * W + a] != 0) { num18 = -1; break; }
                }
                if (stricter && (alch > 0 || bew > 0) && act[b * W + a] != 0 && (typ[b * W + a] == 355 || typ[b * W + a] == 354)) flag4 = true;
            }
        if (flag3) return false;
        if ((float)num2 < (float)num19 * 1.75f) num18 = -1;
        if (!flag4 && (alch > 0 || bew > 0))
        {
            if (alch > 0)
            {
                if (DgP3x3(num3, j, 355)) { alch--; return true; }
            }
            else if (DgP3x3(num3, j, 354)) { bew--; return true; }
        }
        else if (num18 == 0)
        {
            if (DgP3x2(num3, j, DgTileOf(iTable)))
            {
                if (iChair > -1)
                {
                    if (DgInWorld(num3 - 2, j, 0) && act[j * W + num3 - 2] == 0) DgP1x2(num3 - 2, j, DgTileOf(iChair));
                    if (DgInWorld(num3 + 2, j, 0) && act[j * W + num3 + 2] == 0) DgP1x2(num3 + 2, j, DgTileOf(iChair));
                }
                for (int n = num3 - 1; n <= num3 + 1; n++)
                {
                    if ((int)r.Next(2) != 0 || !DgInWorld(n, j - 2, 0) || act[(j - 2) * W + n] != 0) continue;
                    int n23 = (int)r.Next(5);
                    ushort lt = DgInWorld(n - 1, j - 2, 0) ? typ[(j - 2) * W + n - 1] : (ushort)0;   // tileLighted 门（ghost type 亦读）
                    if (iCandle > -1 && n23 <= 1 && !TILE_LIGHTED.Contains(lt)) DgPOnTable(n, j - 2, DgTileOf(iCandle));
                    else if (n23 == 2 && !TILE_LIGHTED.Contains(lt)) DgPOnTable(n, j - 2, 49);
                    else if (n23 == 3) DgPOnTable(n, j - 2, 50);
                    else if (n23 == 4) DgP2x1(n, j - 2, 103);
                }
                return true;
            }
        }
        else if (num18 == 1)
        {
            if (DgP2x1(num3, j, DgTileOf(iWork)))
            {
                if (iChair > -1)
                {
                    if ((int)r.Next(2) == 0)
                    {
                        if (DgInWorld(num3 - 1, j, 0) && act[j * W + num3 - 1] == 0) DgP1x2(num3 - 1, j, DgTileOf(iChair));
                    }
                    else if (DgInWorld(num3 + 2, j, 0) && act[j * W + num3 + 2] == 0) DgP1x2(num3 + 2, j, DgTileOf(iChair));
                }
                for (int n = num3; n <= num3 + 1; n++)
                {
                    if ((int)r.Next(2) != 0 || !DgInWorld(n, j - 1, 0) || act[(j - 1) * W + n] != 0) continue;
                    int n26 = (int)r.Next(5);
                    ushort lt = DgInWorld(n - 1, j - 1, 0) ? typ[(j - 1) * W + n - 1] : (ushort)0;
                    if (iCandle > -1 && n26 <= 1 && !TILE_LIGHTED.Contains(lt)) DgPOnTable(n, j - 1, DgTileOf(iCandle));
                    else if (n26 == 2 && !TILE_LIGHTED.Contains(lt)) DgPOnTable(n, j - 1, 49);
                    else if (n26 == 3) DgPOnTable(n, j - 1, 50);
                    else if (n26 == 4) DgP2x1(n, j - 1, 103);
                }
                return true;
            }
        }
        else if (num18 == 2) { if (iVase > -1 && DgP2xX(num3, j, DgTileOf(iVase), 3)) return true; }
        else if (num18 == 3) { if (iBook > -1) DgP3x4(num3, j, DgTileOf(iBook)); }
        else if (num18 == 4)
        {
            // ★cs:794-807 椅分支：Next(2) 方向掷（frameX+18 镜像，帧不入 dump 但掷必耗）
            if (iChair > -1)
            {
                bool mir = (int)r.Next(2) == 0;
                DgP1x2(num3, j, DgTileOf(iChair));
                if (DgInWorld(num3, j, 0) && act[j * W + num3] != 0 && typ[j * W + num3] == DgTileOf(iChair)) return true;
            }
        }
        else if (num18 == 5)
        {
            // ★cs:820-829 床分支：Next(2) direction 掷 → Place4x2(dir)
            if (iBed > -1)
            {
                int dir = (int)r.Next(2) == 0 ? 1 : -1;
                if (DgP4x2(num3, j, DgTileOf(iBed), dir)) return true;
            }
        }
        else if (num18 == 6) { if (iPiano > -1 && DgP3x2(num3, j, DgTileOf(iPiano))) return true; }
        else if (num18 == 7) { if (iDress > -1 && DgP3x2(num3, j, DgTileOf(iDress))) return true; }
        else if (num18 == 8) { if (iSofa > -1 && DgP3x2(num3, j, DgTileOf(iSofa))) return true; }
        else if (num18 == 9)
        {
            // ★cs:833-842 浴缸分支：Next(2) direction 掷
            if (iTub > -1)
            {
                int dir = (int)r.Next(2) == 0 ? 1 : -1;
                if (DgP4x2(num3, j, DgTileOf(iTub), dir)) return true;
            }
        }
        else if (num18 == 10) { if (iLamp > -1 && DgP1xX(num3, j, DgTileOf(iLamp), 3)) return true; }
        else if (num18 == 11) { if (iCand > -1 && DgP2x2(num3, j, DgTileOf(iCand))) return true; }
        else if (num18 == 12) { if (iClock > -1 && DgP2xX(num3, j, DgTileOf(iClock), 5)) return true; }
    }
    return false;
}
// 家具 item → tile 映射（Item.cs createTile：椅15 桌14 工作台18 蜡烛33 雕像105
// 书架101 床79 钢琴87 梳妆台88 沙发89 浴缸90 烛台100 路灯93 钟104）
int DgTileOf(int item) => item switch
{
    1396 or 1399 or 1402 or 1509 => 15,
    1397 or 1400 or 1403 or 1510 => 14,
    1398 or 1401 or 1404 or 1511 => 18,
    1405 or 1406 or 1407 or 5743 => 33,
    1408 or 1409 or 1410 => 105,
    1414 or 1415 or 1416 or 1512 => 101,
    1470 or 1471 or 1472 or 5740 => 79,
    2376 or 2377 or 2378 or 5750 => 87,
    2386 or 2387 or 2388 or 5741 => 88,
    2402 or 2403 or 2404 or 5753 => 89,
    2658 or 2659 or 2660 or 5739 => 90,
    2664 or 2665 or 2666 or 5742 => 100,
    2645 or 2646 or 2647 or 5748 => 93,
    3900 or 3901 or 3902 or 5746 => 104,
    _ => -1
};
// PlaceTile 近似：目标格净空 + 有墙/侧邻/底邻锚 → 单格放置（帧不入哈希）
bool DgPlaceSimple(int x, int y, int type)
{
    if (type < 0 || !DgInWorld(x, y, 1) || act[y * W + x] != 0) return false;
    bool anchor = wal[y * W + x] > 0
        || (DgInWorld(x - 1, y, 0) && act[y * W + x - 1] != 0 && SOLID.Contains(typ[y * W + x - 1]) && !dgSolidTop.Contains(typ[y * W + x - 1]))
        || (DgInWorld(x + 1, y, 0) && act[y * W + x + 1] != 0 && SOLID.Contains(typ[y * W + x + 1]) && !dgSolidTop.Contains(typ[y * W + x + 1]))
        || (DgInWorld(x, y + 1, 0) && act[(y + 1) * W + x] != 0 && SOLID.Contains(typ[(y + 1) * W + x]) && !dgSolidTop.Contains(typ[(y + 1) * W + x]));
    if (!anchor) return false;
    act[y * W + x] = 1; typ[y * W + x] = (ushort)type;
    return true;
}
// Place4x2（WorldGen.cs:50534）：4×2 净空 + 下方实心
bool DgPlace4x2(int x, int y, int type)
{
    if (type < 0 || x < 5 || x > W - 5 || y < 5 || y > H - 5) return false;
    for (int a = x - 1; a < x + 3; a++)
    {
        for (int b = y - 1; b < y + 1; b++)
            if (!DgInWorld(a, b, 0) || act[b * W + a] != 0) return false;
        if (!DgSolid2(a, y + 1)) return false;
    }
    for (int a = x - 1; a < x + 3; a++)
        for (int b = y - 1; b < y + 1; b++)
        { int ti = b * W + a; act[ti] = 1; typ[ti] = (ushort)type; }
    return true;
}
bool DgSolid2(int x, int y)
{
    if (!DgInWorld(x, y, 0) || act[y * W + x] == 0) return false;
    return SOLID.Contains(typ[y * W + x]);
}
// —— DungeonGlobalPaintings（:28-321）——
int dgLihzPlaced = 0, dgLihzMax = 1;
void DgPaintings()
{
    dgLihzPlaced = 0;
    dgLihzMax = 1;                                             // 世界尺寸中档（GetWorldSize==1 → 2）★按 4200=large 取 2？——Configuration：4200=Large → case 2 → 2+Next(2)
    dgLihzMax = 2 + (int)r.Next(2);
    int num2v = dgWallVariants[0];
    double num3v = Math.Max(1.0, 1.0 * 0.75);
    int num4 = (int)(100f * (W / 4200f) * num3v);
    int num5 = num4 * 3;
    for (int i = 0; i < num4; i++)
    {
        num5--;
        if (num5 <= 0) break;
        int x = (int)r.Next(dgBounds.L, dgBounds.R);
        int y = (int)r.Next(worldSurface, dgBounds.B);
        int n8 = 1000;
        while (!DgIsDW(wal[y * W + x]) || act[y * W + x] != 0)
        {
            n8--;
            if (n8 <= 0) break;
            x = (int)r.Next(dgBounds.L, dgBounds.R);
            y = (int)r.Next(worldSurface, dgBounds.B);
        }
        Console.WriteLine($"S {x} {y}");
        int n9 = x, n10 = x, n11 = y, n12 = y;
        for (int t = 0; t < 2; t++)
        {
            n9 = x; n10 = x;
            while (n9 > 20 && act[y * W + n9] == 0 && DgIsDW(wal[y * W + n9])) n9--;
            n9++;
            while (n10 < W - 20 && act[y * W + n10] == 0 && DgIsDW(wal[y * W + n10])) n10++;
            n10--;
            x = (n9 + n10) / 2;
            n11 = y; n12 = y;
            while (n11 > 20 && act[n11 * W + x] == 0 && DgIsDW(wal[n11 * W + x])) n11--;
            n11++;
            while (n12 < H - 20 && act[n12 * W + x] == 0 && DgIsDW(wal[n12 * W + x])) n12++;
            n12--;
            y = (n11 + n12) / 2;
        }
        n9 = x; n10 = x;
        while (n9 > 20 && act[y * W + n9] == 0 && act[(y - 1) * W + n9] == 0 && act[(y + 1) * W + n9] == 0) n9--;
        n9++;
        while (n10 < W - 20 && act[y * W + n10] == 0 && act[(y - 1) * W + n10] == 0 && act[(y + 1) * W + n10] == 0) n10++;
        n10--;
        n11 = y; n12 = y;
        while (n11 > 20 && act[n11 * W + x] == 0 && act[n11 * W + x - 1] == 0 && act[n11 * W + x + 1] == 0) n11--;
        n11++;
        while (n12 < H - 20 && act[n12 * W + x] == 0 && act[n12 * W + x - 1] == 0 && act[n12 * W + x + 1] == 0) n12++;
        n12--;
        x = (n9 + n10) / 2;
        y = (n11 + n12) / 2;
        int n13 = n10 - n9, n14 = n12 - n11;
        Console.WriteLine($"A {n13} {n14} @{x},{y}");
        if (n13 <= 7 || n14 <= 5) continue;
        var arr = new bool[3] { true, false, false };
        if (n13 > n14 * 3 && n13 > 21) arr[1] = true;
        if (n14 > n13 * 3 && n14 > 21) arr[2] = true;
        int n15 = (int)r.Next(3);
        if (wal[y * W + x] == num2v) n15 = 0;
        while (!arr[n15]) n15 = (int)r.Next(3);
        if (DgNearPicture2(x, y)) n15 = -1;
        Console.WriteLine($"N {n15} np2={n15 == -1}");
        // ★D10（2026-08-14）：对齐原版调用序——GetPaintingEntry 选型掷骰在门槛判定**之前**
        // 消耗（DungeonGlobalPaintings.cs:167-168/:183-184/:281-283/:296-298，不放画也耗）；
        // CanGenerateFeatureInArea fluff=3（7×7 区）非 2。
        if (n15 == 0)
        {
            int e = DgPaintingEntry(x, y);
            if (DgFeatArea3(x, y, 3) && !DgNearPicture(x, y)) DgPlacePainting(x, y, e);
        }
        else if (n15 == 1)
        {
            int e = DgPaintingEntry(x, y);
            if (!DgFeatArea3(x, y, 3)) continue;
            if (act[y * W + x] == 0) DgPlacePainting(x, y, e);
            if (act[y * W + x] != 0) continue;
            int baseY = y;
            for (int m = 0; m < 2; m++)
            {
                x += 7;
                int a1 = baseY, a2 = baseY;
                while (a1 > 0 && act[a1 * W + x] == 0 && act[a1 * W + x - 1] == 0 && act[a1 * W + x + 1] == 0) a1--;
                a1++;
                while (a2 < H - 1 && act[a2 * W + x] == 0 && act[a2 * W + x - 1] == 0 && act[a2 * W + x + 1] == 0) a2++;
                a2--;
                int ny = (a1 + a2) / 2;
                if (DgFeatArea3(x, ny, 3))
                {
                    e = DgPaintingEntry(x, ny);
                    if (Math.Abs(baseY - ny) >= 4 || DgNearPicture(x, ny)) break;
                    DgPlacePainting(x, ny, e);
                }
            }
            for (int m = 0; m < 2; m++)
            {
                x -= 7;
                int a1 = baseY, a2 = baseY;
                while (a1 > 0 && act[a1 * W + x] == 0 && act[a1 * W + x - 1] == 0 && act[a1 * W + x + 1] == 0) a1--;
                a1++;
                while (a2 < H - 1 && act[a2 * W + x] == 0 && act[a2 * W + x - 1] == 0 && act[a2 * W + x + 1] == 0) a2++;
                a2--;
                int ny = (a1 + a2) / 2;
                if (DgFeatArea3(x, ny, 3))
                {
                    e = DgPaintingEntry(x, ny);
                    if (Math.Abs(baseY - ny) >= 4 || DgNearPicture(x, ny)) break;
                    DgPlacePainting(x, ny, e);
                }
            }
        }
        else if (n15 == 2)
        {
            int e = DgPaintingEntry(x, y);
            if (!DgFeatArea3(x, y, 3)) continue;
            if (act[y * W + x] == 0) DgPlacePainting(x, y, e);
            if (act[y * W + x] != 0) continue;
            int baseX = x;
            for (int m = 0; m < 3; m++)
            {
                y += 7;
                int a1 = baseX, a2 = baseX;
                while (a1 > 0 && act[y * W + a1] == 0 && act[(y - 1) * W + a1] == 0 && act[(y + 1) * W + a1] == 0) a1--;
                a1++;
                while (a2 < W - 1 && act[y * W + a2] == 0 && act[(y - 1) * W + a2] == 0 && act[(y + 1) * W + a2] == 0) a2++;
                a2--;
                int nx = (a1 + a2) / 2;
                if (DgFeatArea3(nx, y, 3))
                {
                    e = DgPaintingEntry(nx, y);
                    if (Math.Abs(baseX - nx) >= 4 || DgNearPicture(nx, y)) break;
                    DgPlacePainting(nx, y, e);
                }
            }
            for (int m = 0; m < 3; m++)
            {
                y -= 7;
                int a1 = baseX, a2 = baseX;
                while (a1 > 0 && act[y * W + a1] == 0 && act[(y - 1) * W + a1] == 0 && act[(y + 1) * W + a1] == 0) a1--;
                a1++;
                while (a2 < W - 1 && act[y * W + a2] == 0 && act[(y - 1) * W + a2] == 0 && act[(y + 1) * W + a2] == 0) a2++;
                a2--;
                int nx = (a1 + a2) / 2;
                if (DgFeatArea3(nx, y, 3))
                {
                    e = DgPaintingEntry(nx, y);
                    if (Math.Abs(baseX - nx) >= 4 || DgNearPicture(nx, y)) break;
                    DgPlacePainting(nx, y, e);
                }
            }
        }
    }
}
bool DgFeatArea3(int x, int y, int fluff)
{
    for (int a = x - fluff; a <= x + fluff; a++)
        for (int b = y - fluff; b <= y + fluff; b++)
            if (!DgFeatureOK(a, b, 2)) return false;
    return true;
}
// nearPicture/nearPicture2（WorldGen.cs:34704/34719）
bool DgNearPicture(int x, int y)
{
    for (int a = x - 4; a <= x + 3; a++)
        for (int b = y - 3; b <= y + 2; b++)
            if (DgInWorld(a, b, 0) && act[b * W + a] != 0) return true;
    return false;
}
bool DgNearPicture2(int x, int y)
{
    int rad1 = (wal[y * W + x] != 7 && wal[y * W + x] != 8 && wal[y * W + x] != 9) ? 8 : 15;
    int rad2 = (wal[y * W + x] != 7 && wal[y * W + x] != 8 && wal[y * W + x] != 9) ? 5 : 10;
    for (int a = x - rad1; a <= x + rad1; a++)
        for (int b = y - rad2; b <= y + rad2; b++)
            if (DgInWorld(a, b, 0) && act[b * W + a] != 0 && (typ[b * W + a] == 240 || typ[b * W + a] == 241 || typ[b * W + a] == 242)) return true;
    return false;
}
// Paintings_PlacePainting + Paintings_GetPaintingEntry（style0：主墙→RandomDungeonPainting，变体墙→RandomBonePainting）
// Paintings_GetPaintingEntry（DungeonGlobalPaintings.cs:327-360）：选型掷骰照原版序消耗
//（style 不入哈希——DgPlaceSimple 不落帧；tile 型 240/241/242 入哈希）。
int DgPaintingEntry(int x, int y)
{
    Console.WriteLine($"E {x} {y}");
    int tile = 240;
    if (wal[y * W + x] == dgWall)
    {
        int n = (int)r.Next(3);
        if (n <= 1)
        {
            int n2 = (int)r.Next(7);
            if (n2 == 6) n2 = (int)r.Next(7);
        }
        else
        {
            tile = 242;
            int n2 = (int)r.Next(17);
        }
    }
    else
    {
        int n = (int)r.Next(2);
        if (n == 0) { int n3 = (int)r.Next(2); }
        else { tile = 241; int n4 = (int)r.Next(9); }
    }
    return tile;
}
void DgPlacePainting(int x, int y, int tile)
{
    // ★cs:59962-59985：240→Place3x3Wall / 241→Place4x3Wall / 242→Place6x4Wall（帧不入 dump）
    if (tile == 240) DgP3x3Wall(x, y, tile);
    else if (tile == 241) DgP4x3Wall(x, y, tile);
    else if (tile == 242) DgP6x4Wall(x, y, tile);
    else DgPlaceSimple(x, y, tile);
    if (wal[y * W + x] == 87) dgLihzPlaced++;
}
// —— DungeonGlobalBanners（:24-104）——
void DgBanners()
{
    double num2 = Math.Max(1.0, 1.0 * 0.75);
    int num3 = (int)(200f * (W / 4200f) * num2);
    for (int i = 0; i < num3; i++)
    {
        int x = (int)r.Next(dgBounds.L, dgBounds.R);
        int y = (int)r.Next(dgBounds.T, dgBounds.B);
        int n6 = 1000;
        while (!DgIsDW(wal[y * W + x]) || act[y * W + x] != 0)
        {
            n6--;
            if (n6 <= 0) break;
            x = (int)r.Next(dgBounds.L, dgBounds.R);
            y = (int)r.Next(dgBounds.T, dgBounds.B);
        }
        n6 = 1000;
        while (!DgSolid(x, y) && y > 10)
        {
            n6--;
            if (n6 <= 0) break;
            y--;
        }
        y++;
        if (!DgFeatureOK(x, y, 0) || !DgIsDW(wal[y * W + x])
            || (DgInWorld(x, y - 1, 0) && typ[(y - 1) * W + x] == 48)
            || act[y * W + x] != 0
            || (DgInWorld(x, y + 1, 0) && act[(y + 1) * W + x] != 0)
            || (DgInWorld(x, y + 2, 0) && act[(y + 2) * W + x] != 0)
            || (DgInWorld(x, y + 3, 0) && act[(y + 3) * W + x] != 0)) continue;
        bool near = false;
        for (int a = x - 1; a <= x + 1; a++)
            for (int b = y; b <= y + 3; b++)
                if (DgInWorld(a, b, 0) && act[b * W + a] != 0 && (typ[b * W + a] == 10 || typ[b * W + a] == 11 || typ[b * W + a] == 91)) near = true;
        if (near) continue;
        int num8 = 0;
        if (wal[y * W + x] == dgWallVariants[1]) num8 = 1;
        if (wal[y * W + x] == dgWallVariants[2]) num8 = 2;
        num8 *= 2;
        num8 += (int)r.Next(2);
        int style = dgBanner[num8];
        // ★cs:100 PlaceTile(91) → PlaceBanner（cs:46270 竖 3 格，上挂实心非 solidTop）
        DgPBanner(x, y, 91);
    }
}
// ★#29 Corruption（cs:13919）与 #32 Dungeon（cs:14816）尚未转录——转录后须插在

Replay(); // ▶pass 头重播：MountainCaveOpenings cs:14932
// ================= Pass 33：MountainCaveOpenings（cs:14932-14947）+ Pass 34：Beaches（cs:14947-15087）=================
// 1456 注册序在 Dungeon(32) 之后——本 oracle 尚未转录 26-32 段（Mushroom/Marble/
// Granite/Islands/DirtToMud/Silt/Ores/Underworld/Corruption/Lakes/Slush/Dungeon），
// 故暂挂在 desertdone 之后；★26-32 段转录后须把本块插回其前（即 Dungeon 之后）。
void CaveOpenater(int i, int j)
{
    double num = (int)r.Next(7, 12);
    double num2 = num;
    int dir = 1;
    if ((int)r.Next(2) == 0) dir = -1;
    if ((int)r.Next(10) != 0) dir = (i < W / 2) ? 1 : -1;
    double px = i, py = j;
    int steps = 100;
    double vx = dir, vy = 0.0;
    while (steps > 0)
    {
        int hx = (int)px, hy = (int)py;
        if (hx < 0) hx = 0; if (hx > W - 1) hx = W - 1;
        if (hy < 0) hy = 0; if (hy > H - 1) hy = H - 1;
        int hi = hy * W + hx;
        if (wal[hi] == 0 || (act[hi] == 1 && NOT_CLEAR.Contains(typ[hi]))) steps = 0;
        steps--;
        int x0 = (int)(px - num * 0.5), x1 = (int)(px + num * 0.5);
        int y0 = (int)(py - num * 0.5), y1 = (int)(py + num * 0.5);
        if (x0 < 0) x0 = 0; if (x1 > W) x1 = W;
        if (y0 < 0) y0 = 0; if (y1 > H) y1 = H;
        num2 = num * (int)r.Next(80, 120) * 0.01;
        for (int x = x0; x < x1; x++)
            for (int y = y0; y < y1; y++)
            {
                double ddx = Math.Abs(x - px), ddy = Math.Abs(y - py);
                if (Math.Sqrt(ddx * ddx + ddy * ddy) < num2 * 0.4 && !NOT_CLEAR.Contains(typ[y * W + x]))
                    act[y * W + x] = 0;
            }
        px += vx; py += vy;
        vx += (int)r.Next(-10, 11) * 0.05;
        vy += (int)r.Next(-10, 11) * 0.05;
        if (vx > dir + 0.5) vx = dir + 0.5;
        if (vx < dir - 0.5) vx = dir - 0.5;
        if (vy > 0.0) vy = 0.0;
        if (vy < -0.5) vy = -0.5;
    }
}
void Cavinator2(int i, int j, int steps)
{
    double num = (int)r.Next(7, 15);
    double num2 = num;
    int dir = 1;
    if ((int)r.Next(2) == 0) dir = -1;
    double px = i, py = j;
    int num4 = (int)r.Next(20, 40);
    double vx = dir, vy = (int)r.Next(10, 20) * 0.01;
    while (num4 > 0)
    {
        num4--;
        int x0 = (int)(px - num * 0.5), x1 = (int)(px + num * 0.5);
        int y0 = (int)(py - num * 0.5), y1 = (int)(py + num * 0.5);
        if (x0 < 0) x0 = 0; if (x1 > W) x1 = W;
        if (y0 < 0) y0 = 0; if (y1 > H) y1 = H;
        num2 = num * (int)r.Next(80, 120) * 0.01;
        bool stop = false;
        for (int x = x0; x < x1 && !stop; x++)
        {
            for (int y = y0; y < y1; y++)
            {
                double ddx = Math.Abs(x - px), ddy = Math.Abs(y - py);
                if (Math.Sqrt(ddx * ddx + ddy * ddy) < num2 * 0.4)
                {
                    int ti = y * W + x;
                    if ((act[ti] == 1 && TILE_DUNGEON.Contains(typ[ti])) || WALL_DUNGEON.Contains(wal[ti]))
                    { num4 = 0; stop = true; break; }
                    // 原版 cs:80763：active && (!CanBeCleared || type==53) → continue（跳过不可清/沙）
                    if (act[ti] == 1 && (NOT_CLEAR.Contains(typ[ti]) || typ[ti] == 53)) { /* skip */ }
                    else if (act[ti] == 1) act[ti] = 0;
                }
                if (num4 <= 0) break;
            }
            if (num4 <= 0) break;
        }
        if (num4 <= 0) break;
        px += vx; py += vy;
        vx += (int)r.Next(-10, 11) * 0.05;
        vy += (int)r.Next(-10, 11) * 0.05;
        if (vx > dir + 0.5) vx = dir + 0.5;
        if (vx < dir - 0.5) vx = dir - 0.5;
        if (vy > 2.0) vy = 2.0;
        if (vy < 0.0) vy = 0.0;
    }
    if (steps > 0 && (int)py < rockLayer + 50) Cavinator2((int)px, (int)py, steps - 1);
}
for (int i = 0; i < mCaveX.Count; i++)
{
    CaveOpenater(mCaveX[i], mCaveY[i]);
    Cavinator2(mCaveX[i], mCaveY[i], (int)r.Next(40, 50));
}
Checkpoint("mcopenings");

Replay(); // ▶pass 头重播：BeachesAndOceanCleanup cs:14947
// ---- Beaches（cs:14947-15087 + TuneOceanDepth cs:27104）----
{
    bool floridaL = false, floridaR = false;
    if ((int)r.Next(4) == 0)
    {
        if ((int)r.Next(2) == 0) floridaL = true; else floridaR = true;
    }

    for (int side = 0; side < 2; side++)
    {
        if (side == 0)
        {
            int waterX = (int)r.Next(220, 260);
            if (dungeonRight) waterX = 275;
            int cap = leftBeachEnd - 50;
            if (waterX > cap) waterX = cap;
            int j = 0;
            while (j < H && act[j * W + (waterX - 1)] == 0) j++;
            j += (int)r.Next(1, 5);
            int count = 0; double depth = 1.0;
            for (int x = waterX - 1; x >= 0; x--)
            {
                if (x > 30) { count++; depth = TuneOceanDepth(count, depth, floridaL); }
                else depth += 1.0;
                int pad = (int)r.Next(15, 20);
                // cs:15009/15069：`(double)k < j + num6 + num9` 纯 double 比较——depth 累积
                // 小数部分几乎恒 >0 → 每列多挖一行（曾 (int) 截断，海盆底每列浅一格）
                for (int y = 0; (double)y < (double)j + depth + (double)pad && y < H; y++)
                {
                    int ti = y * W + x;
                    if ((double)y < (double)j + depth * 0.75 - 3.0)
                    {
                        act[ti] = 0;
                        if (y > j) liq[ti] = 255;
                        else if (y == j) liq[ti] = 127;
                    }
                    else if (y > j) { typ[ti] = 53; act[ti] = 1; }
                    wal[ti] = 0;
                }
            }
        }
        else
        {
            int waterX = W - (int)r.Next(220, 260);
            if (!dungeonRight) waterX = W - 275;
            int cap = rightBeachStart + 50;
            if (waterX < cap) waterX = cap;
            int l = 0;
            while (l < H && act[l * W + waterX] == 0) l++;
            l += (int)r.Next(1, 5);
            int count = 0; double depth = 1.0;
            for (int x = waterX; x < W; x++)
            {
                if (x < W - 30) { count++; depth = TuneOceanDepth(count, depth, floridaR); }
                else depth += 1.0;
                int pad = (int)r.Next(15, 20);
                for (int y = 0; (double)y < (double)l + depth + (double)pad && y < H; y++)   // 纯 double 比较（cs:15069）
                {
                    int ti = y * W + x;
                    if ((double)y < (double)l + depth * 0.75 - 3.0)
                    {
                        act[ti] = 0;
                        if (y > l) liq[ti] = 255;
                        else if (y == l) liq[ti] = 127;
                    }
                    else if (y > l) { typ[ti] = 53; act[ti] = 1; }
                    wal[ti] = 0;
                }
            }
        }
    }
}
Checkpoint("beaches");
//   本行与 mcopenings 块之间（原版真实位 29/32）。

// ================= RNG 流位置指纹（UnifiedRandom 内部态哈希）=================
// 对账用探针：与逐 pass 网格哈希正交——若本指纹一致而网格哈希分叉，分歧是
// 「写格内容」而非「掷骰数」；两者皆分叉则是流已分叉（上游 pass 掷骰数不同）。
// JS 侧对应 tests/shimmer-checkpoint.test.ts 的 streamHash()（同字节序同算法）。
var streamPts = new List<string>();
uint StreamHash()
{
    var t = asm.GetType("Terraria.Utilities.UnifiedRandom")!;
    var sa = (int[])t.GetField("SeedArray", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(r)!;
    var ix = (uint)t.GetField("inext", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(r)!;
    uint h = 0x811c9dc5;
    foreach (var v in sa) { for (int b = 0; b < 4; b++) h = (h ^ (uint)((v >> (8 * b)) & 0xff)) * 16777619u; }
    for (int b = 0; b < 4; b++) h = (h ^ (uint)((ix >> (8 * b)) & 0xff)) * 16777619u;
    return h;
}
void StreamPt(string n) => streamPts.Add($"{n}|{StreamHash():x8}");
void JSeg(string n) => jsegPts.Add($"{n}|{StreamHash():x8}");
StreamPt("beaches");

Replay(); // ▶pass 头重播：Gems cs:15109
// ================= Pass 35 Gems（cs:15109-15196 普通世界分支）=================
// 头句 `Main.tileSolid[484] = false`（cs:15114）是对 cs:12537 DesertBiome 头的
// 冗余重放——本 oracle :1284 已删 484，此处不再重复（HashSet.Remove 幂等，语义同）。
{
    for (int gi = 63; gi <= 68; gi++)
    {
        double gnum = gi switch { 67 => (double)W * 0.5, 66 => (double)W * 0.45, 63 => (double)W * 0.3, 65 => (double)W * 0.25, 64 => (double)W * 0.1, _ => (double)W * 0.05 };
        gnum *= 0.2;
        for (int j = 0; (double)j < gnum; j++)          // ★裸 double 比较，不取整（cs:15142）
        {
            int num2 = 3, num3, num4;
            do
            {
                num3 = (int)r.Next(0, W);
                num4 = (int)r.Next(worldSurface, H);
            }
            while ((act[num4 * W + num3] == 0 || typ[num4 * W + num3] != 1) && --num2 > 0);
            if (num2 != 0) TileRunner(num3, num4, (int)r.Next(2, 6), (int)r.Next(3, 7), gi);
        }
    }
    // 浮沙拱形化（cs:15159-15195）：地下沙漠列跳过（Left/Right 严格界外才处理）
    var TILE_SAND = new HashSet<ushort> { 53, 112, 116, 234 };   // Main.tileSand（Main.cs:7177-7180）
    for (int k = 0; k < 2; k++)
    {
        int gemStep = 1, gemFrom = 5, gemTo = W - 5;
        if (k == 1) { gemStep = -1; gemFrom = W - 5; gemTo = 5; }
        for (int l = gemFrom; l != gemTo; l += gemStep)
        {
            if (l <= dsX || l >= dsR)                    // cs:15172 GenVars.UndergroundDesertLocation
            {
                for (int m = 10; m < H - 10; m++)
                {
                    if (act[m * W + l] != 0 && act[(m + 1) * W + l] != 0 && TILE_SAND.Contains(typ[m * W + l]) && TILE_SAND.Contains(typ[(m + 1) * W + l]))
                    {
                        ushort type = typ[m * W + l];
                        int gemSide = l + gemStep, n = m + 1;
                        if (act[m * W + gemSide] == 0 && act[n * W + gemSide] == 0)
                        {
                            for (; act[n * W + gemSide] == 0 && gemSide >= 10 && gemSide < W - 10 && n >= 10 && n < H - 10; n++) { }
                            n--;
                            act[m * W + l] = 0;          // active(false)：type 保留（幽灵语义）
                            act[n * W + gemSide] = 1;
                            typ[n * W + gemSide] = type;
                        }
                    }
                }
            }
        }
    }
}
Checkpoint("gems");
StreamPt("gems");

Replay(); // ▶pass 头重播：GravitatingSandCleanup cs:15198
// ================= Pass 36 GravitatingSandCleanup（cs:15198-15226）=================
// 零掷骰纯扫描。SolidOrSlopedTile（cs:70064）= active && tileSolid && !tileSolidTop
// （half/slope 此链位恒 0，SolidTileGen 即等价）；TileID.Sets.Falling（TileID.cs:391）。
{
    var FALLING = new HashSet<ushort> { 53, 234, 112, 116, 224, 123, 330, 331, 332, 333, 495 };
    for (int i = 0; i < W; i++)
    {
        bool flag = false;
        int num = 0;
        for (int num2 = H - 1; num2 > 0; num2--)
        {
            if (SolidTileGen(i, num2))
            {
                ushort type = typ[num2 * W + i];
                if (flag && num2 < worldSurface && num2 != num - 1 && FALLING.Contains(type))
                {
                    for (int j = num2; j < num; j++)
                    {
                        // Tile.ResetToType（Tile.cs:279-289）：sTileHeader=32（=active 位 0x20，
                        // 其余位清零→slope/halfBrick 归零）+液体清零+帧清零，wall 不动。
                        // 链外扩展批（2026-08-17）补 slope/half 清位——曾漏 → 落沙格残留
                        // 上游坡面（(2626,235) 坡 4），QuickCleanup(e) 首个坡位消费端显形。
                        typ[j * W + i] = type;
                        act[j * W + i] = 1;
                        liq[j * W + i] = 0;
                        liqT[j * W + i] = 0;
                        half[j * W + i] = 0;
                        slope[j * W + i] = 0;
                    }
                }
                flag = true;
                num = num2;
            }
        }
    }
}
Checkpoint("gravitatingsand");
StreamPt("gravitatingsand");

Replay(); // ▶pass 头重播：OceanCaves cs:15228
// ================= Pass 37 OceanCaves（cs:15228-15254 + oceanCave :76686-76990）=================
bool BadOceanCaveTiles(int x, int y)
{
    if (x < 0 || x >= W || y < 0 || y >= H) return true;   // JS inBounds 防御同口径
    int ti = y * W + x;
    return wal[ti] == 83 || wal[ti] == 3 || WALL_DUNGEON.Contains(wal[ti])
        || typ[ti] == 203 || typ[ti] == 25 || TILE_DUNGEON.Contains(typ[ti]) || typ[ti] == 26 || typ[ti] == 31;
}
void OceanCaveFn(int i, int j)
{
    // GenVars.numOceanCaveTreasure 复位/宝藏点登记：无掷骰无写格，哈希通道省略
    double vx = i, vy = j;
    double dirX = i < W / 2 ? 0.25 + r.NextDouble() * 0.25 : -0.35 - r.NextDouble() * 0.5;
    double dirY = 0.4 + r.NextDouble() * 0.25;
    ushort cavity = 264, sand = 53, hardsand = 397;
    double num4 = (int)r.Next(17, 25);
    double num5 = (int)r.Next(600, 800);
    double num6 = 4.0;
    bool flag = true;     // 初期陡降
    bool flag2 = false;   // dualDungeons（普通世界恒 false）
    while (num4 > num6 && num5 > 0.0)
    {
        bool flag3 = true, flag4 = true, flag5 = true;
        if (flag2 || (vx > (double)(BEACH_DISTANCE - 50) && vx < (double)(W - BEACH_DISTANCE + 50)))
        {
            num4 *= 0.96;
            num5 *= 0.96;
        }
        if (num4 < num6 + 2.0 || num5 < 20.0) flag5 = false;
        if (flag) { num4 -= 0.01 + r.NextDouble() * 0.01; num5 -= 0.5; }
        else { num4 -= 0.02 + r.NextDouble() * 0.02; num5 -= 1.0; }
        int num7 = (int)(vx - num4 * 3.0);
        int num8 = (int)(vx + num4 * 3.0);
        int num9 = (int)(vy - num4 * 3.0);
        int num10 = (int)(vy + num4 * 3.0);
        if (num7 < 1) num7 = 1;
        if (num8 > W - 1) num8 = W - 1;
        if (num9 < 1) num9 = 1;
        if (num10 > H - 1) num10 = H - 1;
        for (int k = num7; k < num8; k++)
        {
            for (int l = num9; l < num10; l++)
            {
                if (BadOceanCaveTiles(k, l)) continue;
                double num11 = Math.Sqrt(Math.Abs((double)k - vx) * Math.Abs((double)k - vx) + Math.Abs((double)l - vy) * Math.Abs((double)l - vy)); // Vector2D.Length()
                int ti = l * W + k;
                if (flag5 && num11 < num4 * 0.5 + 1.0)
                {
                    typ[ti] = cavity;
                    act[ti] = 0;
                }
                else if (num11 < num4 * 1.5 + 1.0 && typ[ti] != cavity)
                {
                    if ((double)l < vy)
                    {
                        if ((dirX < 0.0 && (double)k < vx) || (dirX > 0.0 && (double)k > vx))
                        {
                            if (num11 < num4 * 1.1 + 1.0)
                            {
                                typ[ti] = hardsand;
                                if (liq[ti] == 255) wal[ti] = 0;
                            }
                            else if (typ[ti] != hardsand)
                            {
                                typ[ti] = sand;
                            }
                        }
                    }
                    else if ((dirX < 0.0 && k < i) || (dirX > 0.0 && k > i))
                    {
                        if (liq[ti] == 255) wal[ti] = 0;
                        typ[ti] = sand;
                        act[ti] = 1;
                        if (k == (int)vx && flag3)
                        {
                            flag3 = false;
                            int num12 = 50 + (int)r.Next(3);
                            int num13 = 43 + (int)r.Next(3);
                            int num14 = 20 + (int)r.Next(3);
                            int num15 = k, num16 = k + num14;
                            if (dirX < 0.0) { num15 = k - num14; num16 = k; }
                            if (num5 < 100.0)
                            {
                                num12 = (int)((double)num12 * (num5 / 100.0));
                                num13 = (int)((double)num13 * (num5 / 100.0));
                                num14 = (int)((double)num14 * (num5 / 100.0));
                            }
                            if (num4 < num6 + 5.0)
                            {
                                double num17 = (num4 - num6) / 5.0;
                                num12 = (int)((double)num12 * num17);
                                num13 = (int)((double)num13 * num17);
                                num14 = (int)((double)num14 * num17);
                            }
                            for (int m = num15; m <= num16; m++)
                            {
                                for (int n = l; n < l + num12 && !BadOceanCaveTiles(m, n); n++)
                                {
                                    if (n > l + num13)
                                    {
                                        if (SolidTileGen(m, n) && typ[n * W + m] != sand) break;
                                        typ[n * W + m] = hardsand;
                                    }
                                    else
                                    {
                                        typ[n * W + m] = sand;
                                    }
                                    act[n * W + m] = 1;
                                    if ((int)r.Next(3) == 0) { typ[n * W + m - 1] = sand; act[n * W + m - 1] = 1; }
                                    if ((int)r.Next(3) == 0) { typ[n * W + m + 1] = sand; act[n * W + m + 1] = 1; }
                                }
                            }
                        }
                    }
                }
                if (num11 < num4 * 1.3 + 1.0 && l > j - 10)
                {
                    liq[ti] = 255;
                    liqT[ti] = 0;    // liquidType(0)=水
                }
                if (!flag4 || k != (int)vx || !((double)l > vy)) continue;
                flag4 = false;
                for (int num20 = k - 2; num20 <= k + 2; num20++)
                {
                    for (int num21 = l; num21 < l + 100; num21++)
                    {
                        if (!BadOceanCaveTiles(num20, num21))
                        {
                            liq[num21 * W + num20] = 255;
                            liqT[num21 * W + num20] = 0;
                        }
                    }
                }
            }
        }
        vx += dirX;
        vy += dirY;
        dirX += r.NextDouble() * 0.1 - 0.05;
        dirY += r.NextDouble() * 0.1 - 0.05;
        if (flag)
        {
            if (vy > (worldSurface * 2.0 + rockLayer) / 3.0 && vy > (double)(j + 30)) flag = false;
            dirY = Math.Clamp(dirY, 0.35, 1.0);
        }
        else
        {
            if (vx < (double)(W / 2)) { if (dirX < 0.5) dirX += 0.02; }
            else if (dirX > -0.5) dirX -= 0.02;
            if (!flag5)
            {
                if (dirY < 0.0) dirY *= 0.95;
                dirY += 0.04;
            }
            else if (vy < (worldSurface * 4.0 + rockLayer) / 5.0)
            {
                if (dirY < 0.0) dirY *= 0.97;
                dirY += 0.02;
            }
            else if (dirY > -0.1)
            {
                dirY *= 0.99;
                dirY -= 0.01;
            }
            dirY = Math.Clamp(dirY, -1.0, 1.0);
        }
        if (vx < (double)(W / 2)) dirX = Math.Clamp(dirX, 0.1, 1.0);
        else dirX = Math.Clamp(dirX, -1.0, -0.1);
    }
}
{
    for (int i = 0; i < 2; i++)
    {
        // i==0 需 dungeonSide<Right（非右=左）；i==1 需 dungeonSide>Left（右）
        if ((i != 0 || !dungeonRight) && (i != 1 || dungeonRight) && (int)r.Next(3) == 0)
        {
            int num = (int)r.Next(55, 95);
            if (i == 1) num = (int)r.Next(W - 95, W - 55);
            int j;
            for (j = 0; act[j * W + num] == 0; j++) { }
            OceanCaveFn(num, j);
        }
    }
}
Checkpoint("oceancaves");
StreamPt("oceancaves");

Replay(); // ▶pass 头重播：Shimmer cs:15256（shell/pillars/open 内部段不重播；重播在 SW_DUMP_SHIMMER 之前）
// ================= Pass 38 Shimmer（cs:15256-15308 + ShimmerMakeBiome :34889-35093）=================
// GemTreeGroundTest（cs:30461）= Conversion.Stone{1,25,117,203} ∪ Conversion.Moss
// （Moss 表见 TileID.Sets.cs:37；本链位无苔藓格，保留全集备哈希）
var GEM_GROUND = new HashSet<ushort> { 1, 25, 117, 203, 182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627 };
// GemTreeWallTest（cs:30426-30458）= DefaultTreeWallTest ∪ 宝石墙补充表
var GEM_WALLS = new HashSet<ushort> { 0, 150, 138, 145, 107, 152, 140, 139, 141, 106, 245, 315, 317, 63, 64, 65, 66, 67, 68, 69, 81, 70, 264, 268, 265, 74, 80,
    2, 54, 55, 56, 57, 58, 59, 61, 185, 196, 197, 198, 199, 208, 209, 210, 211, 212, 213, 214, 215 };
// IsTileTypeFitForTree（cs:29852）：基座 tuft 判定用草族全集
var TREE_FIT = new HashSet<ushort> { 2, 23, 60, 70, 109, 147, 199, 477, 492, 633, 661, 662 };
void GrowGemTreeFn(int tx, int ty, int treeTile)
{
    // GrowTreeWithSettings（cs:30546-31004）宝石树分支：帧值不入哈希，只保掷骰序
    // 门禁序：液体→nactive→墙→基座→侧基→高度掷→净空（cs:30551-30585）
    int num = ty;
    while (act[num * W + tx] != 0 && typ[num * W + tx] == 590) num++;   // 树苗 590（本链位无）
    if (liq[(num - 1) * W + tx - 1] != 0 || liq[(num - 1) * W + tx] != 0 || liq[(num - 1) * W + tx + 1] != 0) return;
    int gi = num * W + tx;
    if (act[gi] == 0) return;                                   // nactive（half/slope 此链位恒 0）
    if (!GEM_WALLS.Contains(wal[(num - 1) * W + tx])) return;
    if (!GEM_GROUND.Contains(typ[gi])) return;
    bool sideFit(int dx) => tx + dx >= 0 && tx + dx < W && act[num * W + tx + dx] != 0 && GEM_GROUND.Contains(typ[num * W + tx + dx]);
    if (!sideFit(-1) && !sideFit(1)) return;
    int height = (int)r.Next(7, 13);
    int num4 = height + 4;                                      // TreeTopPaddingNeeded = 4
    if (tx - 2 < 0 || tx + 2 >= W || num - num4 < 0) return;
    for (int ex = tx - 2; ex <= tx + 2; ex++)
        for (int ey = num - num4; ey <= num - 1; ey++)
        {
            int ei = ey * W + ex;
            if (act[ei] == 0) continue;
            if (!EMPTY_ALLOW.Contains(typ[ei])) return;         // EmptyTileCheck ignoreID=20
        }
    void Put(int ax, int ay) { if (ax >= 0 && ax < W && ay >= 0 && ay < H) { typ[ay * W + ax] = (ushort)treeTile; act[ay * W + ax] = 1; } }
    bool flagL = false, flagR = false;
    for (int i = num - height; i < num; i++)
    {
        int num5 = (int)r.Next(3);                              // ★cs:30595 先掷帧变体
        int num6 = (int)r.Next(10);                             // cs:30596 后掷枝型（掷序即哈希语义）
        if (i == num - 1 || i == num - height) num6 = 0;
        while (((num6 == 5 || num6 == 7) && flagL) || ((num6 == 6 || num6 == 7) && flagR)) { num6 = (int)r.Next(10); }
        flagL = false; flagR = false;
        if (num6 == 5 || num6 == 7) flagL = true;
        if (num6 == 6 || num6 == 7) flagR = true;
        Put(tx, i);
        if (num6 == 5 || num6 == 7) { int k = (int)r.Next(3); int f = (int)r.Next(3); Put(tx - 1, i); }   // 左枝 2 骰
        if (num6 == 6 || num6 == 7) { int k = (int)r.Next(3); int f = (int)r.Next(3); Put(tx + 1, i); }   // 右枝 2 骰
    }
    // 基座 tuft（cs:30846-30861）：两侧草族才置位 + 各 1/3 概率抹除（2 骰无条件）
    bool tuftFit(int dx) => tx + dx >= 0 && tx + dx < W && act[num * W + tx + dx] != 0 && TREE_FIT.Contains(typ[num * W + tx + dx]);
    bool tL = tuftFit(-1), tR = tuftFit(1);
    if ((int)r.Next(3) == 0) tL = false;
    if ((int)r.Next(3) == 0) tR = false;
    if (tR) { int k = (int)r.Next(3); Put(tx + 1, num - 1); }
    if (tL) { int k = (int)r.Next(3); Put(tx - 1, num - 1); }
    int baseK = (int)r.Next(3);                                 // ★cs:30906 无条件掷（基座干身帧骰）
    if (tL || tR) Put(tx, num - 1);
    int crownFx = (int)r.Next(13) != 0 ? 22 : 0;                // cs:30961 树冠骰
    int crownK = (int)r.Next(3);
    Put(tx, num - height);
}
void ShimmerOpeningFn(int direction, int X, int Y, int caveOpeningSize)
{
    int num = X;
    caveOpeningSize--;
    bool flag;
    do
    {
        num += direction;
        flag = true;
        for (int i = Y - caveOpeningSize + 1; i < Y - 1; i++)
        {
            if (SolidTileGen(num, i)) flag = false;
            if (SolidTileGen(num + direction, i)) flag = false;
            if (SolidTileGen(num + direction * 2, i)) flag = false;
            if (num >= 0 && num < W && i >= 0 && i < H) act[i * W + num] = 0;
        }
        for (int j = Y - caveOpeningSize; j < Y; j++)
        {
            if (num - direction >= 0 && num - direction < W && j >= 0 && j < H) act[j * W + (num - direction)] = 0;
        }
        if (SolidTileGen(num - direction, Y - caveOpeningSize - 1)) wal[(Y - caveOpeningSize - 1) * W + (num - direction)] = 0;
        if (SolidTileGen(num - direction, Y)) wal[Y * W + (num - direction)] = 0;
        if ((int)r.Next(2) == 0) Y += (int)r.Next(-1, 2);
    }
    while (!flag && num >= 50 && num <= W - 50 && Math.Abs(num - X) <= 100);
}
bool ShimmerMakeBiomeFn(int X, int Y)
{
    int num = (int)r.Next(2);                                   // cs:34891 双 variant
    double num2 = 0.6, num3 = 1.3, num4 = 0.3;
    if (num == 0) { num2 = 0.55; num3 = 2.0; }
    num2 *= 1.05 - r.NextDouble() * 0.1;
    num3 *= 1.05 - r.NextDouble() * 0.1;
    num4 *= 1.0 - r.NextDouble() * 0.1;
    int num5 = (int)r.Next(105, 125);
    int num6 = (int)((double)num5 * num4);
    int num7 = (int)((double)num5 * num2);
    int num8 = (int)r.Next(9, 13);
    int num9 = X - num5, num10 = X + num5, num11 = Y - num5, num12 = Y + num5;
    for (int i = num11; i <= num12; i++)
    {
        for (int j = num9; j <= num10; j++)
        {
            if (!(j >= 50 && i >= 50 && j < W - 50 && i < H - 50)) return false;   // InWorld(j,i,50)
            if (typ[i * W + j] == 203 || typ[i * W + j] == 25) return false;
        }
    }
    int num13 = Y;
    if ((int)r.Next(4) == 0) num13 = Y - (int)r.Next(2);
    int num14 = Y - num8;
    if ((int)r.Next(4) == 0) num14 = Y - num8 - (int)r.Next(2);
    for (int k = num11; k <= num12; k++)
    {
        for (int l = num9; l <= num10; l++)
        {
            int ti = k * W + l;
            liq[ti] = 0;
            if ((int)r.Next(4) == 0) num13 = Y - (int)r.Next(2);
            if ((int)r.Next(4) == 0) num14 = Y - num8 + (int)r.Next(2);
            int num15 = (k <= Y)
                ? (int)Math.Sqrt(Math.Pow((double)Math.Abs(l - X) * (1.0 + r.NextDouble() * 0.02), 2.0) + Math.Pow((double)Math.Abs(k - Y) * 1.4 * (1.0 + r.NextDouble() * 0.02), 2.0))
                : (int)Math.Sqrt(Math.Pow((double)Math.Abs(l - X) * (1.0 + r.NextDouble() * 0.02), 2.0) + Math.Pow((double)Math.Abs(k - Y) * 1.2 * (1.0 + r.NextDouble() * 0.02), 2.0));
            if (num15 < num5)
            {
                typ[ti] = 1;
                if (l > num9 + 5 + (int)r.Next(2) && l < num10 - 5 - (int)r.Next(2)) act[ti] = 1;
                if ((double)num15 < (double)num5 * 0.9) wal[ti] = 0;
            }
            num15 = (int)Math.Sqrt(Math.Pow((double)Math.Abs(l - X) * (1.0 + r.NextDouble() * 0.02), 2.0) + Math.Pow((double)Math.Abs(k - Y) * num3 * (1.0 + r.NextDouble() * 0.02), 2.0));
            if (k > num14 && k < num13) act[ti] = 0;
            if (k < num13 && num15 < (int)((double)num7 * (1.0 + r.NextDouble() * 0.02))) act[ti] = 0;
            num15 = (int)Math.Sqrt(Math.Pow((double)Math.Abs(l - X) * (1.0 + r.NextDouble() * 0.02), 2.0) + Math.Pow((double)(Math.Abs(k - Y) * 2) * (1.0 + r.NextDouble() * 0.02), 2.0));
            if (k < Y - 1 || num15 >= (int)((double)num6 * (1.0 + r.NextDouble() * 0.025))) continue;
            if (k <= Y + 2 || num15 != num6 - 1 || (int)r.Next(2) != 0) act[ti] = 0;
            if (k >= Y)
            {
                liq[ti] = (byte)(k == Y ? 127 : 255);
                liqT[ti] = 3;                                   // shimmer(true)
            }
        }
    }
    Checkpoint("shimmershell");
    StreamPt("shimmershell");
    if (num == 0)
    {
        num9 = (int)((double)X - (double)num5 * num4) - (int)r.Next(-15, 1) - 5;
        num10 = (int)((double)X + (double)num5 * num4) + (int)r.Next(0, 16);
        int m = num9;
        int num16 = 0;
        for (; m < num10; m += (int)r.Next(9, 14))
        {
            int num17 = Y - 3;
            while (num17 >= 0 && act[num17 * W + m] == 0) num17--;
            num17 -= 4;
            int num18 = (int)r.Next(5, 10);
            int num19 = (int)r.Next(15, 21);
            int n = m - num18;
            while (num18 > 0)
            {
                for (n = m - num18; n < m + num18; n++) { if (n >= 0 && n < W) { act[num17 * W + n] = 1; typ[num17 * W + n] = 1; } }
                num16++;
                if ((int)r.Next(3) < num16) { num16 = 0; num18--; m += (int)r.Next(-1, 2); }
                if (num19 <= 0) num18--;
                num19--;
                num17++;
            }
            n -= (int)r.Next(1, 3);
            act[(num17 - 2) * W + n] = 1; typ[(num17 - 2) * W + n] = 1;
            act[(num17 - 1) * W + n] = 1; typ[(num17 - 1) * W + n] = 1;
            act[num17 * W + n] = 1; typ[num17 * W + n] = 1;
            if ((int)r.Next(2) == 0) { act[(num17 + 1) * W + n] = 1; typ[(num17 + 1) * W + n] = 1; PlaceTightGen(n, num17 + 2); }
            else PlaceTightGen(n, num17 + 1);
        }
    }
    Checkpoint("shimmerpillars");
    StreamPt("shimmerpillars");
    ShimmerOpeningFn(-1, X - num5, Y, num8);
    ShimmerOpeningFn(1, X + num5, Y, num8);
    Checkpoint("shimmeropen");
    StreamPt("shimmeropen");
    for (int num21 = 0; num21 < 500; num21++)
    {
        int num22 = (int)r.Next(X - 70, X + 70);
        int num23 = (int)r.Next(Y - 2, Y + 3);
        int num24 = (int)r.Next(7);
        int treeTileType = num24 switch { 0 => 583, 1 => 584, 2 => 585, 3 => 586, 4 => 587, 5 => 588, _ => 589 };
        if (SolidTileGen(num22 - 1, num23) && SolidTileGen(num22 + 1, num23)) GrowGemTreeFn(num22, num23, treeTileType);
    }
    Checkpoint("shimmer");
    StreamPt("shimmer");
    return true;
}
int shimmerXOut = 0, shimmerYOut = 0;
// ===== 微光 pass 输入态 dump（SW_DUMP_SHIMMER=1 → <out>.shimstate）=====
// 独立裁决通道：上游 pass（地牢等）多代理并发修改期，全链流可能临时分叉——
// 把「Shimmer pass 之前」的完整网格 + UnifiedRandom 内部态落盘，JS 侧
// （tests/shimmer-checkpoint.test.ts 的状态恢复用例）直接在此态上跑
// runShimmerPass 对账，裁决力与全链等价且不受上游 WIP 影响。
if (Environment.GetEnvironmentVariable("SW_DUMP_SHIMMER") == "1")
{
    using var fs = File.Create(outPath + ".shimstate");
    using var bw = new BinaryWriter(fs);
    var urt = asm.GetType("Terraria.Utilities.UnifiedRandom")!;
    var usa = (int[])urt.GetField("SeedArray", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(r)!;
    var uix = (uint)urt.GetField("inext", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(r)!;
    bw.Write(W); bw.Write(H);
    bw.Write(uix);
    for (int q = 0; q < 56; q++) bw.Write(usa[q]);
    // 固定长度裸写（Write(byte[],0,len) 无长度前缀；JS 侧按 n/2n/2n/n/n 定长读）
    var typB = ToBytes(typ);
    var walB = ToBytes(wal);
    bw.Write(act, 0, act.Length);
    bw.Write(typB, 0, typB.Length);
    bw.Write(walB, 0, walB.Length);
    bw.Write(liq, 0, liq.Length);
    bw.Write(liqT, 0, liqT.Length);
}
{
    int num2 = (int)(worldSurface + rockLayer) / 2 + 50;
    int num3 = (int)((H - 250) * 2 + rockLayer) / 3;
    if (num3 > H - 330 - 100 - 30) num3 = H - 330 - 100 - 30;
    if (num3 <= num2) num3 = num2 + 50;
    int num4 = (int)r.Next(num2, num3);
    int num5 = !dungeonRight ? (int)r.Next((int)(W * 0.89), W - 200) : (int)r.Next(200, (int)(W * 0.11));
    int num8 = 0;
    while (!ShimmerMakeBiomeFn(num5, num4))
    {
        num8++;
        if (num8 > 20000)
        {
            num4 = (int)r.Next(worldSurface + 100 + 20, num3);
            num5 = !dungeonRight ? (int)r.Next((int)(W * 0.8), W - 200) : (int)r.Next(200, (int)(W * 0.2));
        }
        else
        {
            num4 = (int)r.Next((int)(worldSurface + rockLayer) / 2 + 20, num3);
            num5 = !dungeonRight ? (int)r.Next((int)(W * 0.89), W - 200) : (int)r.Next(200, (int)(W * 0.11));
        }
    }
    shimmerXOut = num5;
    shimmerYOut = num4;
}

// ================= Pass 39-44 公共表/辅助（1456 反编译源 1:1 转录）=================
// TileID.Sets.Boulders（TileID.cs:195）
var BOULDERS = new HashSet<ushort> { 138, 484, 664, 665, 711, 712, 713, 714, 715, 716 };
// Main.tileSolidTop（Main.cs:6764-6825 全表）
var SOLID_TOP = new HashSet<ushort> { 275,280,276,277,278,279,281,605,604,603,602,601,599,600,612,611,610,609,608,606,607,
    558,554,553,551,550,542,413,309,297,296,645,643,644,632,640,559,414,359,358,285,286,582,555,538,533,532,
    394,393,392,391,339,310,299,298,629,619,556,544,364,363,362,361,710,376,19,18,14,469,16,134,114,87,88,101,405,239,380,427 };
// Main.tileNoAttach（Main.cs:7260-7292 全表）——chest 锚腿用
var NO_ATTACH = new HashSet<ushort> { 568,569,570,580,620,572,564,565,593,594,590,595,615,110,3,4,10,50,707,20,19,13,14,469,486,488,704,487,489,490,15,497,16,134,17,18,21,467,441,468,27,114,86,87,88,89,90,101,102,94,95,96,97,98,99,91,92,93,387,388,427,390 };
// PlaceChest 锚腿禁表（TileObjectData.cs:2113 anchorInvalidTiles）
var CHEST_ANCHOR_INVALID = new HashSet<ushort> { 127, 138, 664, 665, 484, 711, 712, 713, 714, 715, 716 };
// AddBuriedChest 跨箱状态（GenVars）
bool genShadowKey = false, genRamRune = false, genMahogany = false;
// 锭 id（Reset cs:11286-11311：替代矿档 → 703/704/705/706）
int copperBar = oreCu == 166 ? 703 : 20, ironBar = oreFe == 167 ? 704 : 22;
int silverBar = oreAg == 168 ? 705 : 21, goldBar = oreAu == 169 ? 706 : 19;
bool InB(int x, int y) => x >= 0 && x < W && y >= 0 && y < H;
bool IsDungeonW(int x, int y) => y >= 0 && y < H && x >= 0 && x < W && (double)y >= (double)worldSurface && WALL_DUNGEON.Contains(wal[y * W + x]);

// WorldGen.PlaceTile（cs:59366）——本段所需类型分支。入口门（cs:59397
// `forced || EmptyTile || !tileSolid[...]`）对 10/15/19/91/187/304 均因非 tileSolid
// 恒过；液体门（cs:59480）只拒火把与清单类型——本组液体中可放。
bool PlaceTileGen(int i, int j, int type, int style)
{
    if (i < 0 || i >= W || j < 0 || j >= H) return false;
    switch (type)
    {
        case 19:   // 平台（cs:60242 case 19）：1×1 无条件写
            typ[j * W + i] = 19; act[j * W + i] = 1; return true;
        case 10:   // 门（cs:59867）：上方 3 格实心 → 上行 PlaceDoor(i,j-1)；下方 3 格实心 → PlaceDoor(i,j+1)
        {
            if (!InB(i, j - 3) || !InB(i, j + 3)) return false;
            if (act[(j - 1) * W + i] == 0 && act[(j - 2) * W + i] == 0 && act[(j - 3) * W + i] != 0 && SOLID.Contains(typ[(j - 3) * W + i]))
                return PlaceDoorGen(i, j - 1, style);
            if (act[(j + 1) * W + i] != 0 || act[(j + 2) * W + i] != 0 || act[(j + 3) * W + i] == 0 || !SOLID.Contains(typ[(j + 3) * W + i]))
                return false;
            return PlaceDoorGen(i, j + 1, style);
        }
        case 15:   // 椅（cs:60059 → Place1x2 cs:46665）：占 (x,y-1)..(x,y)，仅需下方 SolidTile2 且 (x,y-1) 空
        {
            if (j - 1 < 0 || j + 1 >= H) return false;
            if (SolidTileGen(i, j + 1) && act[(j - 1) * W + i] == 0)
            {
                typ[(j - 1) * W + i] = 15; act[(j - 1) * W + i] = 1;
                typ[j * W + i] = 15; act[j * W + i] = 1;
                return true;
            }
            return false;
        }
        case 91:   // 旗帜（cs:60152 → PlaceBanner cs:46270）：顶锚 (x,y-1) 实心非 solidTop，下方 3 格空
        {
            if (!InB(i, j - 1) || !InB(i, j + 2)) return false;
            if (act[(j - 1) * W + i] != 0 && SOLID.Contains(typ[(j - 1) * W + i]) && !SOLID_TOP.Contains(typ[(j - 1) * W + i])
                && act[j * W + i] == 0 && act[(j + 1) * W + i] == 0 && act[(j + 2) * W + i] == 0)
            {
                for (int dy = 0; dy <= 2; dy++) { typ[(j + dy) * W + i] = 91; act[(j + dy) * W + i] = 1; }
                return true;
            }
            return false;
        }
        case 187:  // LargePiles2（cs:60027 → Place3x2 cs:52097）——D 批 PlaceTile(187) 全链：
        {          // 头部门槛 + 锚格 inactive 时 Clear（cs:59497-59499，幽灵归零）+ Place3x2 +
                   // case 尾 SquareTileFrame(i,j)（成败都跑）→ Check3x2 一致性清除
            if (i < 0 || i >= W || j < 0 || j >= H) return false;
            int ai = j * W + i;
            if (act[ai] == 0)
            {
                // Tile.Clear(Tile|TilePaint|Slope)（Tile.cs:774-782/803-807）
                typ[ai] = 0; frX[ai] = 0; frY[ai] = 0; slope[ai] = 0; half[ai] = 0;
            }
            bool ok187 = true;
            if (i < 5 || i > W - 5 || j < 5 || j > H - 5) ok187 = false;
            if (ok187)
                for (int c = i - 1; c <= i + 1; c++)
                {
                    for (int d = j - 1; d <= j; d++)
                        if (d < 0 || d >= H || act[d * W + c] != 0) { ok187 = false; break; }
                    if (j + 1 >= H || act[(j + 1) * W + c] != 0 && BOULDERS.Contains(typ[(j + 1) * W + c])) { ok187 = false; break; }
                    if (!SolidTileGen(c, j + 1)) { ok187 = false; break; }
                }
            if (ok187)
                for (int c = i - 1; c <= i + 1; c++)
                    for (int d = j - 1; d <= j; d++)
                    {
                        int pi = d * W + c;
                        typ[pi] = 187; act[pi] = 1;
                        frX[pi] = (ushort)(style * 54 + (c - (i - 1)) * 18);   // vanilla 平铺帧
                        frY[pi] = (ushort)((d - (j - 1)) * 18);
                    }
            SquareTileFramePile(i, j);   // cs:60026 case 尾：3×3 → 仅 187 走 Check3x2（成败都跑）
            return ok187;
        }
        case 26:   // 祭坛（#43 直调 Place3x2）：同 3×2 底锚
        {
            if (i < 5 || i > W - 5 || j < 5 || j > H - 5) return false;
            bool ok = true;
            for (int c = i - 1; c <= i + 1; c++)
            {
                for (int d = j - 1; d <= j; d++)
                    if (act[d * W + c] != 0) ok = false;
                if (type == 26 && act[(j + 1) * W + c] != 0 && BOULDERS.Contains(typ[(j + 1) * W + c])) ok = false;
                if (!SolidTileGen(c, j + 1)) ok = false;
            }
            if (ok)
            {
                for (int c = i - 1; c <= i + 1; c++)
                    for (int d = j - 1; d <= j; d++) { typ[d * W + c] = (ushort)type; act[d * W + c] = 1; }
                return true;
            }
            return false;
        }
        case 304:  // 活木织机（cs:29409 → Place3x3 cs:53549 num=-2 分支）：3×3 底锚
        {
            bool ok = true;
            for (int c = i - 1; c <= i + 1; c++)
            {
                for (int d = j - 2; d <= j; d++)
                    if (!InB(c, d) || act[d * W + c] != 0) ok = false;
                if (!SolidTileGen(c, j + 1)) ok = false;
            }
            if (ok)
            {
                for (int c = i - 1; c <= i + 1; c++)
                    for (int d = j - 2; d <= j; d++) { typ[d * W + c] = 304; act[d * W + c] = 1; }
                return true;
            }
            return false;
        }
    }
    return false;
}
// WorldGen.PlaceDoor（cs:31938）：占 (i,j-1..j+1)；上 (i,j-2) nactive+solid、下 (i,j+2) SolidTile；
// ★帧变体三掷 genRand.Next(3)（哈希无关、流有关）
bool PlaceDoorGen(int i, int j, int style)
{
    if (!InB(i, j - 2) || !InB(i, j + 2)) return false;
    if (act[(j - 2) * W + i] != 0 && SOLID.Contains(typ[(j - 2) * W + i]) && SolidTileGen(i, j + 2))
    {
        r.Next(3); r.Next(3); r.Next(3);
        for (int dy = -1; dy <= 1; dy++) { typ[(j + dy) * W + i] = 10; act[(j + dy) * W + i] = 1; }
        return true;
    }
    return false;
}
// WorldGen.PlaceSmallPile（cs:46831）：size0 1×1 / size1 2×1；type185 加基座 Boulders 拒绝
bool PlaceSmallPileGen(int i, int j, int pileStyle, int pileSize)
{
    if (!InB(i + 1, j + 1) || !InB(i, j + 1)) return false;
    if (liq[j * W + i] == 255 && liqT[j * W + i] == 1) return false;   // anyLava
    if (pileSize == 1)
    {
        bool ok = SolidTileGen(i, j + 1) && SolidTileGen(i + 1, j + 1) && act[j * W + i] == 0 && act[j * W + i + 1] == 0;
        if (ok && (InvalidPiles(i, j + 1) || InvalidPiles(i + 1, j + 1))) ok = false;
        if (ok) { typ[j * W + i] = 185; act[j * W + i] = 1; typ[j * W + i + 1] = 185; act[j * W + i + 1] = 1; return true; }
    }
    else if (SolidTileGen(i, j + 1) && act[j * W + i] == 0)
    {
        typ[j * W + i] = 185; act[j * W + i] = 1; return true;
    }
    return false;
}
bool InvalidPiles(int x, int y) => InB(x, y) && act[y * W + x] != 0 && BOULDERS.Contains(typ[y * W + x]);
// WorldGen.PlacePot（cs:54082）：2×2 占 (x..x+1,y-1..y)，腿 (y+1) nactive+solid；★1 掷 Next(3)（帧变体）
bool PlacePotGen(int x, int y, int style)
{
    bool ok = true;
    for (int c = x; c < x + 2; c++)
    {
        for (int d = y - 1; d <= y; d++)
            if (!InB(c, d) || act[d * W + c] != 0) ok = false;
        if (!SolidTileGen(c, y + 1)) ok = false;
    }
    if (!ok) return false;
    r.Next(3);
    for (int c = x; c < x + 2; c++)
        for (int d = y - 1; d <= y; d++) { typ[d * W + c] = 28; act[d * W + c] = 1; }
    return true;
}
// WorldGen.IsTileNearby（cs:8828）：distance 方框内 active type（step 1——type!=235）
bool IsTileNearbyG(int x, int y, int type, int distance)
{
    for (int i = x - distance; i <= x + distance; i++)
        for (int j = y - distance; j <= y + distance; j++)
            if (InB(i, j) && act[j * W + i] != 0 && typ[j * W + i] == type) return true;
    return false;
}
// WorldGen.oceanDepths（cs:10978）：y ≤ oceanLevel 且海滩带内
bool OceanDepthsG(int x, int y)
{
    if ((double)y > (double)(worldSurface + rockLayer) / 2.0 + 40.0) return false;
    if (x < BEACH_DISTANCE || x > W - BEACH_DISTANCE) return true;
    return false;
}

// WorldGen.AddBuriedChest（cs:35920-37569）——本段两调用点（金字塔 style1 主件
// 848/857/934；世界树房 style12 主件 832/4281）路径转录；trySlope 恒 false。
// 战利品内容不入哈希，只保掷骰序（SetDefaults/Prefix(-1) 均不掷）。
// chest 放置（PlaceChest cs:57828 → TileObject.CanPlace chest21/467：Origin(0,1)、
// AnchorBottom SolidTile|SolidWithTop|SolidSide 2 列）：占 (i-1..i)×(num7-2..num7-1)、
// 腿 (i-1,num7)/(i,num7)。SolidWithTop（平台顶帧）路径本段不触达（房地板均 191/151），备案。
bool AddBuriedChestGen(int i, int j, int mainItemInChest, int chestStyle, ushort chestTileTypeIn)
{
    ushort chestTileType = chestTileTypeIn == 0 ? (ushort)21 : chestTileTypeIn;
    if (i < 2 || i >= W - 2) return false;
    for (int k = j; k < H - 10; k++)
    {
        bool fWood = false, fIce = false, fDesert = false, fIvy = false, fWater = false, fSky = false,
             fMush = false, fHell = false, fDun = false, fLock = false, fPyr = false, fSkyTheme = false, fTemple = false;
        int ti = k * W + i;
        if (liq[ti] == 255 && liqT[ti] == 3) return false;            // anyShimmer
        if (act[ti] != 0 && typ[ti] == 231) return false;             // 幼虫
        for (int n = i - 2; n <= i + 2; n++)                          // cs:35992 ±2 巨石/祭坛（逐行）
            for (int m = k - 2; m <= k + 2; m++)
                if (n >= 100 && m >= 100 && n < W - 100 && m < H - 100)
                {
                    int bi = m * W + n;
                    if (act[bi] != 0 && (BOULDERS.Contains(typ[bi]) || typ[bi] == 26 || typ[bi] == 237)) return false;
                }
        if (!SolidTileGen(i, k)) continue;
        int num7 = k;
        int num9 = 0, num10 = 0;
        bool flag15 = (double)num7 >= (double)worldSurface + 25.0;
        if (flag15 || num10 > 0) num9 = 1;
        if (chestStyle >= 0) num9 = chestStyle;
        if (mainItemInChest >= 0) num10 = mainItemInChest;
        // errorWorld 重掷门省略（false）；flag16/17/18 均 false
        if (chestTileType == 21 && (chestStyle == 0 || (chestStyle == -1 && num9 == 0))) fWood = true;
        // 沙漠门（cs:36066）/冰箱门（cs:36107）：三析取均需 chestStyle 10/42/11/24 或
        // num10==0（本段主件>0）→ 恒不触发（掷骰省略安全）
        if (chestTileType == 21 && num9 == 12)                        // cs:36171 世界树天空箱门
        {
            if (wal[(num7 - 1) * W + (i - 1)] != 244) { num9 = 0; num10 = 0; fWood = true; }
            else fSky = true;                                         // getGoodWorldGen=false → 无掷
        }
        if (chestTileType == 21 && num9 != 0 && IsDungeonW(i, k)) fDun = true;
        if (chestTileType == 21 && num9 != 0 && (num10 == 848 || num10 == 857 || num10 == 934)) fPyr = true;
        // PlaceChest
        int num8 = -1;
        int cx = i - 1, cy = num7 - 2;
        bool ok = !(act[num7 * W + (i - 1)] != 0 && BOULDERS.Contains(typ[num7 * W + (i - 1)]))
               && !(act[num7 * W + i] != 0 && BOULDERS.Contains(typ[num7 * W + i]));
        if (ok) ok = cx >= 5 && cx + 2 <= W - 5 && cy >= 5 && cy + 2 <= H - 5;
        for (int dx = 0; ok && dx < 2; dx++)
            for (int dy = 0; dy < 2; dy++)
            {
                int ci = (cy + dy) * W + cx + dx;
                bool blocked = act[ci] != 0 && (!EMPTY_ALLOW.Contains(typ[ci]) || typ[ci] == 484 || typ[ci] == 654);
                if (liq[ci] > 0 && liqT[ci] == 1) blocked = true;     // LavaPlacement=NotAllowed
                if (blocked) ok = false;
            }
        for (int dx = 0; ok && dx < 2; dx++)
        {
            int li = num7 * W + (cx + dx);
            if (act[li] == 0 || !SOLID.Contains(typ[li]) || SOLID_TOP.Contains(typ[li]) || NO_ATTACH.Contains(typ[li]) || CHEST_ANCHOR_INVALID.Contains(typ[li]))
                ok = false;
        }
        if (ok)
        {
            for (int dx = 0; dx < 2; dx++)
                for (int dy = 0; dy < 2; dy++)
                {
                    int ci = (cy + dy) * W + cx + dx;
                    if (!InB(cx + dx, cy + dy)) { ok = false; break; }
                    typ[ci] = chestTileType; act[ci] = 1;
                }
            if (ok) num8 = 0;
        }
        if (num8 < 0) return false;
        // ---- 战利品掷骰（cs:36266-37569）----
        int itemIndex = 0;
        while (itemIndex == 0)
        {
            bool flag23 = (double)num7 < (double)worldSurface + 25.0;
            if ((flag23 && (fWood || fSky)) || fPyr)
            {
                // 地表/金字塔分支（cs:36283-36517）
                if (num10 > 0)
                {
                    itemIndex++;                                      // 主件（848→866/832→933 附赠无掷）
                    if (fSky && (int)r.Next(3) == 0) itemIndex++;
                    if (fSky && (int)r.Next(6) == 0) { r.Next(2); itemIndex++; }
                    if (fSky && (int)r.Next(3) != 0) itemIndex++;
                }
                else { r.Next(10); itemIndex++; }
                if ((int)r.Next(6) == 0) { r.Next(40, 76); itemIndex++; }
                if ((int)r.Next(6) == 0) { r.Next(150, 301); itemIndex++; }
                if ((int)r.Next(6) == 0) { if ((int)r.Next(5) == 0) r.Next(2); if ((int)r.Next(10) == 0) r.Next(3); itemIndex++; }
                if ((int)r.Next(6) == 0) { if ((int)r.Next(5) == 0) r.Next(2); if ((int)r.Next(10) == 0) r.Next(3); itemIndex++; }
                if ((int)r.Next(3) == 0) { r.Next(3, 6); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(2); r.Next(8); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(50, 101); itemIndex++; }
                if ((int)r.Next(3) != 0) { r.Next(2); r.Next(26); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(3); itemIndex++; }
                if ((int)r.Next(3) != 0) { r.Next(2, 5); itemIndex++; }
                if ((int)r.Next(3) > 0) { r.Next(6); r.Next(1, 3); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(2); r.Next(11); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(10, 30); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(50, 100); itemIndex++; }
            }
            else if ((double)num7 < (double)rockLayer)
            {
                // 金箱分支（cs:36518-36846）
                if (num10 > 0)
                {
                    itemIndex++;                                      // 832 → 933 前插无掷 + 主件
                    if (fWater) { if ((int)r.Next(2) == 0) itemIndex++; if ((int)r.Next(2) == 0) itemIndex++; }
                    if (fSkyTheme && (int)r.Next(40) == 0) itemIndex++;
                    if (fSky) { if ((int)r.Next(3) == 0) itemIndex++; if ((int)r.Next(6) == 0) { r.Next(2); itemIndex++; } if ((int)r.Next(3) != 0) itemIndex++; }
                    if (fDun && !fLock)
                    {
                        if (!genShadowKey || (int)r.Next(3) == 0) { genShadowKey = true; itemIndex++; }
                        if (!genRamRune || (int)r.Next(8) == 0) { genRamRune = true; itemIndex++; }
                    }
                }
                else
                {
                    r.Next(6); itemIndex++;                           // 主件表（vampire/errorWorld 无掷省略）
                    if ((int)r.Next(20) == 0) itemIndex++;
                    else if ((int)r.Next(20) == 0) { itemIndex++; r.Next(26); itemIndex++; }
                    if (fMush) { if ((int)r.Next(2) == 0) itemIndex++; else itemIndex += 3; }
                }
                if (fDesert) { if ((int)r.Next(3) == 0) { r.Next(10, 20); itemIndex++; } }
                else if ((int)r.Next(3) == 0) { r.Next(10, 20); itemIndex++; }
                if ((int)r.Next(5) == 0) itemIndex++;
                if ((int)r.Next(3) == 0) { r.Next(50, 101); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(2); r.Next(10); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(2); r.Next(25); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(3); itemIndex++; }
                if ((int)r.Next(3) > 0) { r.Next(9); r.Next(1, 3); itemIndex++; }
                if ((int)r.Next(3) != 0) { r.Next(2, 5); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(11); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(50, 90); itemIndex++; }
            }
            else if (num7 < H - 250)
            {
                // 洞穴分支（cs:36847-37236）
                if (num10 > 0)
                {
                    itemIndex++;
                    if (fIce && (int)r.Next(5) == 0) itemIndex++;
                    if (fDesert) { if ((int)r.Next(7) == 0) itemIndex++; if ((int)r.Next(15) == 0) itemIndex++; }
                    if (fIvy)
                    {
                        if (!genMahogany || (int)r.Next(5) == 0) { genMahogany = true; itemIndex += 2; }
                        if ((int)r.Next(10) == 0) itemIndex++;
                        if ((int)r.Next(10) == 0) itemIndex++;
                    }
                    if (fWater) { if ((int)r.Next(2) == 0) itemIndex++; if ((int)r.Next(2) == 0) itemIndex++; }
                    if (fDun && !fLock)
                    {
                        if (!genShadowKey || (int)r.Next(3) == 0) { genShadowKey = true; itemIndex++; }
                        if (!genRamRune || (int)r.Next(8) == 0) { genRamRune = true; itemIndex++; }
                    }
                }
                else
                {
                    int num25 = (int)r.Next(7);
                    bool flag24 = num7 > lavaLine;
                    if ((int)r.Next(20) == 0 && flag24) itemIndex++;
                    else if ((int)r.Next(15) == 0) itemIndex++;
                    else { if (num25 == 6) { itemIndex++; r.Next(26); itemIndex++; } }
                    itemIndex++;
                    if (fMush) { if ((int)r.Next(2) == 0) itemIndex++; else itemIndex += 3; }
                }
                if ((int)r.Next(5) == 0) itemIndex++;
                if ((int)r.Next(3) == 0) itemIndex++;
                if ((int)r.Next(4) == 0) { r.Next(26); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(2); r.Next(8); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(2); r.Next(26); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(3); itemIndex++; }
                if ((int)r.Next(3) > 0) { r.Next(6); r.Next(1, 3); itemIndex++; }
                if ((int)r.Next(3) > 1) { r.Next(6); r.Next(1, 3); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(2, 5); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(2); r.Next(15, 31); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(1, 3); itemIndex++; }
            }
            else
            {
                // 地狱分支（cs:37237-37406）
                if (num10 > 0)
                {
                    itemIndex++;
                    if (fHell && (int)r.Next(5) == 0) itemIndex++;
                    if (fHell && (int)r.Next(10) == 0) itemIndex++;
                    if (fHell && (int)r.Next(10) == 0) itemIndex++;
                    if (fHell && (int)r.Next(10) == 0) itemIndex++;
                }
                else { r.Next(4); itemIndex++; }
                if ((int)r.Next(3) == 0) itemIndex++;
                if ((int)r.Next(2) == 0) { r.Next(2); r.Next(15); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(2); r.Next(25); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(6); itemIndex++; }
                if ((int)r.Next(4) > 0) { r.Next(8); r.Next(1, 3); itemIndex++; }
                if ((int)r.Next(3) > 0) { r.Next(8); r.Next(1, 3); itemIndex++; }
                if ((int)r.Next(3) == 0) { r.Next(1, 3); r.Next(2); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(2); r.Next(15); itemIndex++; }
                if ((int)r.Next(2) == 0) { r.Next(2, 5); itemIndex++; }
            }
            if (itemIndex > 0 && chestTileType == 21)
            {
                if (fIvy && (int)r.Next(4) == 0) itemIndex++;
                if (fIce && (int)r.Next(7) == 0) itemIndex++;
                if (fSkyTheme && (int)r.Next(3) == 0) itemIndex++;
                if (fTemple) itemIndex++;
                if (fDun && (int)r.Next(8) == 0) itemIndex++;
                if (fSkyTheme) { r.Next(6); r.Next(50, 101); }
                if ((num9 == 23 || num9 == 24 || num9 == 25 || num9 == 26 || num9 == 27) && (int)r.Next(2) == 0) itemIndex++;
                if (fTemple) { if ((int)r.Next(5) == 0) itemIndex++; else { r.Next(3, 8); itemIndex++; } }
            }
            if ((int)r.Next(12) == 0) r.Next(14);                     // AddVoiceChangeItemToChest（Item.GetRandomVoiceItem 内 Next(14)）
        }
        return true;
    }
    return false;
}

Replay(); // ▶pass 头重播：DirtWallCleanup cs:15310
// ================= Pass 39 DirtWallCleanup（cs:15310-15425）=================
// 纯墙 pass：typ/act/liq 不动。两遍扫描（左→右 i∈[3,W-4]；右→左 num2∈[W-5..5]）。
// 中央列墙集 {2,40,64,86}/{2,40,64}；邻列恒 {2,40}（反编译 `==2||==40||==40` 的
// 40 重复——行为等价）；±2/±3 的 Next(2) 仅当邻列墙∈{2,40} 才掷（&& 短路）。
{
    void DirtWallSweep(bool ltr)
    {
        int from = ltr ? 3 : W - 5, to = ltr ? W - 4 : 5;
        for (int col = from; ltr ? (col <= to) : (col >= to); col += ltr ? 1 : -1)
        {
            bool open = true;
            for (int row = 0; (double)row < (double)worldSurface; row++)
            {
                int ci = row * W + col;
                if (open)
                {
                    ushort wc = wal[ci];
                    if (wc == 2 || wc == 40 || wc == 64 || (ltr && wc == 86)) wal[ci] = 0;
                    bool sand = act[ci] != 0 && (ltr
                        ? (typ[ci] == 53 || typ[ci] == 112 || typ[ci] == 234)
                        : typ[ci] == 53);
                    if (!sand)
                    {
                        int l1 = row * W + col - 1, l2 = row * W + col - 2, l3 = row * W + col - 3;
                        int r1 = row * W + col + 1, r2 = row * W + col + 2, r3 = row * W + col + 3;
                        if (wal[l1] == 2 || wal[l1] == 40) wal[l1] = 0;
                        if ((wal[l2] == 2 || wal[l2] == 40) && (int)r.Next(2) == 0) wal[l2] = 0;
                        if ((wal[l3] == 2 || wal[l3] == 40) && (int)r.Next(2) == 0) wal[l3] = 0;
                        if (wal[r1] == 2 || wal[r1] == 40) wal[r1] = 0;
                        if ((wal[r2] == 2 || wal[r2] == 40) && (int)r.Next(2) == 0) wal[r2] = 0;
                        if ((wal[r3] == 2 || wal[r3] == 40) && (int)r.Next(2) == 0) wal[r3] = 0;
                        if (act[ci] != 0) open = false;
                    }
                }
                else if (wal[ci] == 0
                    && wal[(row + 1) * W + col] == 0 && wal[(row + 2) * W + col] == 0
                    && wal[(row + 3) * W + col] == 0 && wal[(row + 4) * W + col] == 0
                    && wal[row * W + col - 1] == 0 && wal[row * W + col + 1] == 0
                    && wal[row * W + col - 2] == 0 && wal[row * W + col + 2] == 0
                    && act[ci] == 0 && act[(row + 1) * W + col] == 0
                    && act[(row + 2) * W + col] == 0 && act[(row + 3) * W + col] == 0)
                {
                    open = true;
                }
            }
        }
    }
    DirtWallSweep(true);
    DirtWallSweep(false);
}
Checkpoint("dirtwallcleanup");
StreamPt("dirtwallcleanup");

Replay(); // ▶pass 头重播：Pyramids cs:15426
// ================= Pass 40 Pyramids（cs:15426-15535 + Pyramid cs:27816-28122）=================
// WorldGen.Pyramid（cs:27816）：沙岩砖 151 主体 + 墙 34 + 入口阶梯掏空 → 之字形
// 下行隧道（端点房间：金箱 style1 主件 848/857/934、小堆 185、旗帜 91×4、瓦罐 28）
// → 长出口隧道（末端界检查带掷骰）。
bool PyramidGen(int i, int j, int pyramidMinDepth, int pyramidMaxDepth, bool noTunnel)
{
    ushort num = 151, wall = 34;
    if (act[j * W + i] != 0 && (typ[j * W + i] == 151 || wal[j * W + i] == 151)) return false;
    // dualDungeons/秘密种子 IsTileNearby 门省略（普通世界 false）
    int num2 = j - (int)r.Next(0, 7);
    int num3 = (int)r.Next(9, 13);
    int num4 = 1;
    int num5 = j + (int)r.Next(pyramidMinDepth, pyramidMaxDepth);
    bool pyrTr = Environment.GetEnvironmentVariable("PYR_TRACE") != null;
    if (pyrTr) Console.WriteLine($"PYR enter i={i} j={j} num2={num2} num3={num3} num5={num5}");
    for (int k = num2; k < num5; k++)
    {
        for (int l = i - num4; l < i + num4 - 1; l++)
            if (InB(l, k)) { typ[k * W + l] = num; act[k * W + l] = 1; }
        num4++;
    }
    for (int m = i - num4 - 5; m <= i + num4 + 5; m++)
    {
        for (int n = j - 1; n <= num5 + 1; n++)
        {
            bool all = true;
            for (int a = m - 1; a <= m + 1; a++)
                for (int b = n - 1; b <= n + 1; b++)
                    if (!InB(a, b) || act[b * W + a] == 0 || typ[b * W + a] != num) all = false;
            if (all && InB(m, n)) wal[n * W + m] = 34;
        }
    }
    int num8 = 1;
    if ((int)r.Next(2) == 0) num8 = -1;
    int num9 = i - num3 * num8;
    int num10 = j + num3;
    int num11 = (int)r.Next(5, 8);
    bool flag2 = true;
    int num12 = (int)r.Next(20, 30);
    if (pyrTr) Console.WriteLine($"PYR tunnel num8={num8} num9={num9} num10={num10} num11={num11} num12={num12}");
    int pyrIt = 0;
    while (flag2)
    {
        if (pyrTr && pyrIt < 400) Console.WriteLine($"PYR stair it{pyrIt} num9={num9} num10={num10}");
        pyrIt++;
        flag2 = false;
        bool flag3 = false;
        for (int num13 = num10; num13 <= num10 + num11; num13++)
        {
            int num14 = num9;
            if (InB(num14, num13 - 1) && act[(num13 - 1) * W + num14] != 0 && typ[(num13 - 1) * W + num14] == 53) flag3 = true;
            if (InB(num14, num13) && act[num13 * W + num14] != 0 && typ[num13 * W + num14] == num)
            {
                if (InB(num14, num13 + 1)) wal[(num13 + 1) * W + num14] = wall;
                if (InB(num14 + num8, num13)) wal[num13 * W + num14 + num8] = wall;
                act[num13 * W + num14] = 0;
                flag2 = true;
            }
            if (flag3 && InB(num14, num13))
            {
                typ[num13 * W + num14] = 53; act[num13 * W + num14] = 1;
            }
        }
        num9 -= num8;
    }
    num9 = i - num3 * num8;
    bool flag4 = true, flag5 = false;
    flag2 = true;
    pyrIt = 0;
    while (flag2)
    {
        if (pyrTr && pyrIt < 500) Console.WriteLine($"PYR zig it{pyrIt} num9={num9} num10={num10} num12={num12} f4={flag4} f5={flag5}");
        pyrIt++;
        for (int num15 = num10; num15 <= num10 + num11; num15++)
            if (InB(num9, num15)) act[num15 * W + num9] = 0;
        num9 += num8;
        num10++;
        num12--;
        if (num10 >= num5 - num11 * 2) num12 = 10;
        if (num12 <= 0)
        {
            bool flag6 = false;
            if (!flag4 && !flag5)
            {
                if (noTunnel) flag2 = false;
                flag5 = true;
                flag6 = true;
                int num17 = (int)r.Next(7, 13);
                int num18 = (int)r.Next(23, 28);
                int num19 = num18;
                int num20 = num9;
                while (num18 > 0)
                {
                    for (int num21 = num10 - num17 + num11; num21 <= num10 + num11; num21++)
                    {
                        if (num18 == num19 || num18 == 1)
                        {
                            if (num21 >= num10 - num17 + num11 + 2 && InB(num9, num21)) act[num21 * W + num9] = 0;
                        }
                        else if (num18 == num19 - 1 || num18 == 2 || num18 == num19 - 2 || num18 == 3)
                        {
                            if (num21 >= num10 - num17 + num11 + 1 && InB(num9, num21)) act[num21 * W + num9] = 0;
                        }
                        else if (InB(num9, num21)) act[num21 * W + num9] = 0;
                    }
                    num18--;
                    num9 += num8;
                }
                int num22 = num9 - num8;
                int num23 = num22, num24 = num20;
                if (num22 > num20) { num23 = num20; num24 = num22; }
                int num25 = (int)r.Next(3);
                if (num25 == 0) num25 = (int)r.Next(3);
                int mainItem = num25 switch { 0 => 848, 1 => 857, _ => 934 };
                if (pyrTr) Console.WriteLine($"PYR room num17={num17} n23={num23} n24={num24} chestX={(num23 + num24) / 2} num10={num10} main={mainItem} st={StreamHash():x8}");
                AddBuriedChestGen((num23 + num24) / 2, num10, mainItem, 1, 0);
                int num26 = (int)r.Next(1, 10);
                if (pyrTr) Console.WriteLine($"PYR rm1 num26={num26} st={StreamHash():x8}");
                for (int num27 = 0; num27 < num26; num27++)
                {
                    int i2 = (int)r.Next(num23, num24);
                    int j2 = num10 + num11;
                    PlaceSmallPileGen(i2, j2, (int)r.Next(16, 19), 1);
                }
                if (pyrTr) Console.WriteLine($"PYR rm2 piles-done st={StreamHash():x8}");
                PlaceTileGen(num23 + 2, num10 - num17 + num11 + 1, 91, (int)r.Next(4, 7));
                PlaceTileGen(num23 + 3, num10 - num17 + num11, 91, (int)r.Next(4, 7));
                PlaceTileGen(num24 - 2, num10 - num17 + num11 + 1, 91, (int)r.Next(4, 7));
                PlaceTileGen(num24 - 3, num10 - num17 + num11, 91, (int)r.Next(4, 7));
                if (pyrTr) Console.WriteLine($"PYR rm3 torches-done st={StreamHash():x8}");
                for (int num28 = num23; num28 <= num24; num28++)
                    PlacePotGen(num28, num10 + num11, (int)r.Next(25, 28));
                if (pyrTr) Console.WriteLine($"PYR rm4 pots-done st={StreamHash():x8}");
            }
            if (flag4)
            {
                flag4 = false;
                num8 *= -1;
                num12 = (int)r.Next(15, 20);
            }
            else if (flag6) num12 = (int)r.Next(10, 15);
            else
            {
                num8 *= -1;
                num12 = (int)r.Next(20, 40);
            }
        }
        if (num10 >= num5 - num11) flag2 = false;
    }
    if (noTunnel) return true;
    int num29 = (int)r.Next(100, 200);
    int num30 = (int)r.Next(500, 800);
    flag2 = true;
    int num31 = num11;
    num12 = (int)r.Next(10, 50);
    if (num8 == 1) num9 -= num31;
    int num32 = (int)r.Next(5, 10);
    while (flag2)
    {
        num29--; num30--; num12--;
        // cs:28073 出口隧道扫掠界：上界每判一掷 Next(0,2)（起界仅一次）
        for (int num33 = num9 - num32 - (int)r.Next(0, 2); num33 <= num9 + num31 + num32 + (int)r.Next(0, 2); num33++)
        {
            int num34 = num10;
            if (num33 >= num9 && num33 <= num9 + num31)
            {
                if (InB(num33, num34)) act[num34 * W + num33] = 0;
            }
            else if (InB(num33, num34) && !WALL_DUNGEON.Contains(wal[num34 * W + num33]))
            {
                typ[num34 * W + num33] = num; act[num34 * W + num33] = 1;
            }
            if (InB(num33, num34) && num33 >= num9 - 1 && num33 <= num9 + 1 + num31 && !WALL_DUNGEON.Contains(wal[num34 * W + num33]))
                wal[num34 * W + num33] = wall;
        }
        num10++;
        num9 += num8;
        if (num29 <= 0)
        {
            flag2 = false;
            for (int num35 = num9 + 1; num35 <= num9 + num31 - 1; num35++)
                if (InB(num35, num10) && act[num10 * W + num35] != 0) flag2 = true;
        }
        if (num12 < 0)
        {
            num12 = (int)r.Next(10, 50);
            num8 *= -1;
        }
        if (num30 <= 0) flag2 = false;
    }
    return true;
}
{
    // PyrX/PyrY：Dunes（oracle :542）与 OceanSand 沙丘（oracle :686）两处落盘
    int dungeonSide = dungeonRight ? 1 : -1;
    for (int pi = 0; pi < pyrX.Count; pi++)
    {
        int num = pyrX[pi];
        int k = pyrY[pi];
        int pyramidMinDepth = 75, pyramidMaxDepth = 125;
        bool noTunnel = false;
        if (num > 300 && num < W - 300
            && (dungeonSide > -1 || !((double)num < (double)dgPosX + (double)W * 0.15))
            && (dungeonSide < 1 || !((double)num > (double)dgPosX - (double)W * 0.15)))
        {
            for (; k < H && act[k * W + num] == 0 && (double)k < (double)worldSurface; k++) { }
            if (k < H && (double)k < (double)worldSurface && typ[k * W + num] == 53)
            {
                int num3 = W;
                for (int l = 0; l < pi; l++)
                {
                    int num4 = Math.Abs(num - pyrX[l]);
                    if (num4 < num3) num3 = num4;
                }
                int num5 = 220;
                if (Environment.GetEnvironmentVariable("PYR_TRACE") != null) Console.WriteLine($"PYR cand#{pi} x={num} k={k} minDist={num3} {(num3 >= num5 ? "ACCEPT" : "REJECT-dist")}");
                if (num3 >= num5)
                {
                    k--;
                    PyramidGen(num, k, pyramidMinDepth, pyramidMaxDepth, noTunnel);
                }
            }
        }
    }
}
if (Environment.GetEnvironmentVariable("GV_DUMP") != null)
    Console.WriteLine($"GVDUMP worldSurface={worldSurface} rockLayer={rockLayer} lavaLine={lavaLine} waterLine={waterLine} worldSurfaceLow={gvWorldSurfaceLow.ToString(System.Globalization.CultureInfo.InvariantCulture)} dungeonRight={(dungeonRight ? 1 : 0)} dgPosX={dgPosX} crimson={(crimson ? 1 : 0)} shimmerX={shimmerXOut} shimmerY={shimmerYOut} pyrX={string.Join(",", pyrX)} pyrY={string.Join(",", pyrY)} mCaveX={string.Join(",", mCaveX)} mCaveY={string.Join(",", mCaveY)}");
Checkpoint("pyramids");
StreamPt("pyramids");

Replay(); // ▶pass 头重播：DirtRockWallRunner cs:15536
// ================= Pass 41 DirtRockWallRunner（cs:15536-15550 + DirtyRockRunner cs:77503-77579）=================
void DirtyRockRunnerG(int i, int j)
{
    double num = (int)r.Next(2, 6);
    double num2 = (int)r.Next(5, 50);
    double num3 = num2;
    double vx = i, vy = j;
    double spx = (int)r.Next(-10, 11) * 0.1, spy = (int)r.Next(-10, 11) * 0.1;
    while (num > 0.0 && num3 > 0.0)
    {
        double num4 = num * (num3 / num2);
        num3 -= 1.0;
        int x0 = (int)(vx - num4 * 0.5), x1 = (int)(vx + num4 * 0.5);
        int y0 = (int)(vy - num4 * 0.5), y1 = (int)(vy + num4 * 0.5);
        if (x0 < 0) x0 = 0; if (x1 > W) x1 = W;
        if (y0 < 0) y0 = 0; if (y1 > H) y1 = H;
        for (int k = x0; k < x1; k++)
            for (int l = y0; l < y1; l++)
            {
                // cs:77544 Next 在 `<` 右值内——盒内每格无条件一掷；wall==2 才写
                if (Math.Abs((double)k - vx) + Math.Abs((double)l - vy) < num * 0.5 * (1.0 + (int)r.Next(-10, 11) * 0.015)
                    && k >= 0 && k < W && l >= 0 && l < H && wal[l * W + k] == 2)
                    wal[l * W + k] = 59;
            }
        vx += spx; vy += spy;
        spx += (int)r.Next(-10, 11) * 0.05;
        if (spx > 1.0) spx = 1.0; if (spx < -1.0) spx = -1.0;
        spy += (int)r.Next(-10, 11) * 0.05;
        if (spy > 1.0) spy = 1.0; if (spy < -1.0) spy = -1.0;
    }
}
{
    bool drwrTr = Environment.GetEnvironmentVariable("DRWR_TRACE") != null;
    int drwrHits = 0;
    for (int i = 0; i < W; i++)
    {
        int num = (int)r.Next(10, W - 10);
        int num2 = (int)r.Next(10, worldSurface);
        if (num >= 0 && num < W && num2 >= 0 && num2 < H && wal[num2 * W + num] == 2)
        {
            drwrHits++;
            if (drwrTr && drwrHits <= 500) Console.WriteLine($"DRWR hit#{drwrHits} i={i} x={num} y={num2}");
            DirtyRockRunnerG(num, num2);
            if (drwrTr && drwrHits <= 500) Console.WriteLine($"DRWR done#{drwrHits} st={StreamHash():x8}");
        }
    }
    if (drwrTr) Console.WriteLine($"DRWR total hits={drwrHits}");
}
Checkpoint("dirtrockwallrunner");
StreamPt("dirtrockwallrunner");

Replay(); // ▶pass 头重播：LivingTrees cs:15551
// ================= Pass 42 LivingTrees（cs:15551-15791 + GrowLivingTree cs:28123-28759）=================
uint LtGridHash()
{
    // 与 JS 侧 ltGridHash 同算法：active→typ(vanilla) / inactive→0 + act + wal 的 FNV-1a
    uint h = 0x811c9dc5;
    for (int i = 0; i < W * H; i++)
    {
        ushort t = act[i] != 0 ? typ[i] : (ushort)0;
        h = (h ^ (uint)(t & 0xff)) * 16777619u; h = (h ^ (uint)((t >> 8) & 0xff)) * 16777619u;
        h = (h ^ act[i]) * 16777619u;
        ushort w = wal[i];
        h = (h ^ (uint)(w & 0xff)) * 16777619u; h = (h ^ (uint)((w >> 8) & 0xff)) * 16777619u;
    }
    return h;
}
bool GrowLivingTree_CanPlaceLeavesG(int i, int j)
{
    if (!(i >= 5 && j >= 5 && i < W - 5 && j < H - 5)) return false;
    ushort wl = wal[j * W + i];
    if (wl == 244 || wl == 78 || WALL_DUNGEON.Contains(wl)) return false;
    if (act[j * W + i] == 0) return true;
    ushort t = typ[j * W + i];
    if (t == 191 || CLOUDS.Contains(t)) return false;
    return true;
}
bool GrowLivingTree_HorizontalTunnelG(int i, int j)
{
    int num = i, num2 = i;
    int num3 = 80;
    bool flag = false;
    int num4 = 1;
    if ((int)r.Next(2) == 0) num4 *= -1;
    for (int k = 0; k < 2; k++)
    {
        flag = false;
        if (num2 == i && num4 > 0)
        {
            for (int l = i + 5; l < i + num3; l++)
            {
                if (!(l >= 10 && j >= 10 && l < W - 10 && j < H - 10)) return false;
                if (typ[j * W + l] == 48) { flag = true; break; }
                if (typ[j * W + l] == 191)
                {
                    for (int n = j - 2; n <= j; n++)
                        if (wal[n * W + (l + 2)] != 244) flag = true;
                    if (!flag) { k = 2; num2 = l + 2; }
                    break;
                }
                if (act[j * W + l] != 0) continue;
                bool flag2 = true;
                for (int n5 = j - 2; n5 <= j; n5++)
                {
                    if ((double)j < (double)worldSurface + 3.0
                        && (wal[n5 * W + (l + 1)] == 0 || wal[n5 * W + (l + 2)] == 0 || wal[n5 * W + (l + 3)] == 0))
                        return false;
                    if (act[n5 * W + l] != 0 || act[n5 * W + (l + 1)] != 0 || act[n5 * W + (l + 2)] != 0) flag2 = false;
                }
                if (flag2) { k = 2; num2 = l; break; }
            }
        }
        flag = false;
        if (num == i && num4 < 0)
        {
            for (int num6 = i - 5; num6 > i - num3; num6--)
            {
                if (!(num6 >= 10 && j >= 10 && num6 < W - 10 && j < H - 10)) return false;
                if (typ[j * W + num6] == 48) { flag = true; break; }
                if (typ[j * W + num6] == 191)
                {
                    for (int num8 = j - 2; num8 <= j; num8++)
                        if (wal[num8 * W + (num6 - 3)] != 244) flag = true;
                    if (!flag) { k = 2; num = num6 - 2; }
                    break;
                }
                if (act[j * W + num6] == 0)
                {
                    bool flag3 = true;
                    for (int num9 = j - 2; num9 <= j; num9++)
                    {
                        if ((double)j < (double)worldSurface + 3.0
                            && (wal[num9 * W + (num6 - 1)] == 0 || wal[num9 * W + (num6 - 2)] == 0 || wal[num9 * W + (num6 - 3)] == 0))
                            return false;
                        if (act[num9 * W + num6] != 0 || act[num9 * W + (num6 - 1)] != 0 || act[num9 * W + (num6 - 2)] != 0) flag3 = false;
                    }
                    if (flag3) { k = 2; num = num6; break; }
                }
            }
        }
        num4 *= -1;
        if (k >= 2) break;
    }
    if (num == num2) return false;
    bool flag4 = false, flag5 = false;
    for (int num10 = j - 5; num10 <= j + 1; num10++)
    {
        for (int num11 = num; num11 <= num2; num11++)
        {
            int num12 = 2;
            if (Math.Abs(num11 - num2) > 3 && Math.Abs(num11 - num) > 3) num12 = 4;
            if (wal[num10 * W + num11] != 244 && typ[num10 * W + num11] != 19 && typ[num10 * W + num11] != 15
                && typ[num10 * W + num11] != 304 && typ[num10 * W + num11] != 21 && typ[num10 * W + num11] != 10)
            {
                if (!WALL_DUNGEON.Contains(wal[num10 * W + num11])
                    && (act[num10 * W + num11] == 0
                        || (!WALL_DUNGEON.Contains(wal[(num10 - 1) * W + num11]) && !WALL_DUNGEON.Contains(wal[(num10 + 1) * W + num11])))
                    && (act[num10 * W + num11] != 0 || wal[num10 * W + num11] != 34))
                {
                    typ[num10 * W + num11] = 191; act[num10 * W + num11] = 1;
                }
                if (typ[(num10 - 1) * W + num11] == 40) typ[(num10 - 1) * W + num11] = 0;
                if (typ[(num10 + 1) * W + num11] == 40) typ[(num10 + 1) * W + num11] = 0;
            }
            if (num10 >= j - num12 && num10 <= j
                && typ[num10 * W + num11] != 19 && typ[num10 * W + num11] != 15 && typ[num10 * W + num11] != 304
                && typ[num10 * W + num11] != 21 && typ[num10 * W + num11] != 10
                && typ[(num10 - 1) * W + num11] != 15 && typ[(num10 - 1) * W + num11] != 304
                && typ[(num10 - 1) * W + num11] != 21 && typ[(num10 - 1) * W + num11] != 10
                && typ[(num10 + 1) * W + num11] != 10)
            {
                if (!WALL_DUNGEON.Contains(wal[num10 * W + num11])) wal[num10 * W + num11] = 244;
                liq[num10 * W + num11] = 0;
                act[num10 * W + num11] = 0;
            }
            if (num10 != j) continue;
            int style = 7;
            if (WALL_DUNGEON.Contains(wal[num10 * W + num11]) || WALL_DUNGEON.Contains(wal[(num10 - 1) * W + num11]) || WALL_DUNGEON.Contains(wal[(num10 - 2) * W + num11]))
                style = 13;
            if (num11 <= num + 4 && !flag4)
            {
                if (typ[num10 * W + (num11 - 1)] == 10 || typ[num10 * W + (num11 + 1)] == 10) flag4 = true;
                else if ((int)r.Next(3) == 0)
                {
                    PlaceTileGen(num11, num10, 10, style);
                    if (typ[num10 * W + num11] == 10) flag4 = true;
                }
            }
            if (num11 < num2 - 4 || flag5) continue;
            if (typ[num10 * W + (num11 - 1)] == 10 || typ[num10 * W + (num11 + 1)] == 10) flag5 = true;
            else if ((int)r.Next(3) == 0)
            {
                PlaceTileGen(num11, num10, 10, style);
                if (typ[num10 * W + num11] == 10) flag5 = true;
            }
        }
    }
    return true;
}
void GrowLivingTreePassageRoomG(int minl, int minr, int Y)
{
    bool ltTrRM = Environment.GetEnvironmentVariable("LT_TRACE") != null;
    int num = (int)r.Next(2);
    if (num == 0) num = -1;
    int num2 = Y - 2;
    int num3 = (minl + minr) / 2;
    if (num < 0) num3--;
    if (num > 0) num3++;
    int num4 = (int)r.Next(15, 30);
    if (ltTrRM) Console.WriteLine($"R1 st={StreamHash():x8} num={num} num3={num3} num5num={num4}");
    int num5 = num3 + num4;
    if (num < 0) { num5 = num3; num3 -= num4; }
    for (int i = num3; i < num5; i++)
    {
        for (int j = Y - 20; j < Y + 10; j++)
        {
            if (!InB(i, j)) continue;
            if (wal[j * W + i] == 0 && act[j * W + i] == 0 && (double)j < (double)worldSurface) return;
        }
    }
    for (int k = num3; k <= num5; k++)
    {
        for (int l = num2 - 2; l <= Y + 2; l++)
        {
            // 四邻粘土 40 → 泥土 0（只改 type，active 不动）
            if (InB(k - 1, l) && typ[l * W + (k - 1)] == 40) typ[l * W + (k - 1)] = 0;
            if (InB(k + 1, l) && typ[l * W + (k + 1)] == 40) typ[l * W + (k + 1)] = 0;
            if (InB(k, l - 1) && typ[(l - 1) * W + k] == 40) typ[(l - 1) * W + k] = 0;
            if (InB(k, l + 1) && typ[(l + 1) * W + k] == 40) typ[(l + 1) * W + k] = 0;
            if (InB(k, l) && wal[l * W + k] != 244 && typ[l * W + k] != 19)
            {
                typ[l * W + k] = 191; act[l * W + k] = 1;
            }
            if (InB(k, l) && l >= num2 && l <= Y)
            {
                liq[l * W + k] = 0;
                wal[l * W + k] = 244;
                act[l * W + k] = 0;
            }
        }
    }
    bool door1 = PlaceTileGen((minl + minr) / 2 + 3 * num, Y, 10, 7);
    if (ltTrRM) Console.WriteLine($"R2door ok={door1} st={StreamHash():x8}");
    int num6 = (int)r.Next(5, 9);
    int num7 = (int)r.Next(4, 6);
    if (ltTrRM) Console.WriteLine($"R3 st={StreamHash():x8} num6={num6} num7={num7}");
    if (num < 0) { num5 = num3 + num6; num3 -= num6; }
    else { num3 = num5 - num6; num5 += num6; }
    num2 = Y - num7;
    for (int m = num3 - 2; m <= num5 + 2; m++)
    {
        for (int n = num2 - 2; n <= Y + 2; n++)
        {
            // cs:29369-29395 四邻 `type==40 → type=40` 自赋值——no-op
            if (InB(m, n) && wal[n * W + m] != 244 && typ[n * W + m] != 19)
            {
                typ[n * W + m] = 191; act[n * W + m] = 1;
            }
            if (InB(m, n) && n >= num2 && n <= Y && m >= num3 && m <= num5)
            {
                liq[n * W + m] = 0;
                wal[n * W + m] = 244;
                act[n * W + m] = 0;
            }
        }
    }
    int i2 = num < 0 ? num5 + 2 : num3 - 2;
    bool door2 = PlaceTileGen(i2, Y, 10, 7);
    if (ltTrRM) Console.WriteLine($"R4door ok={door2} st={StreamHash():x8}");
    int num8 = num < 0 ? num3 : num5;
    int num9 = 2;
    if ((int)r.Next(num9) == 0)
    {
        num9 += 2;
        bool ch1 = PlaceTileGen(num8, Y, 15, 5);
        if (ltTrRM) Console.WriteLine($"R5chair ok={ch1} st={StreamHash():x8} num9={num9}");
    }
    num8 = num < 0 ? num3 + 2 : num5 - 2;
    bool loomOk = PlaceTileGen(num8, Y, 304, 0);
    if (ltTrRM) Console.WriteLine($"R6loom ok={loomOk} st={StreamHash():x8}");
    num8 = num < 0 ? num3 + 4 : num5 - 4;
    if ((int)r.Next(num9) == 0)
    {
        bool ch2 = PlaceTileGen(num8, Y, 15, 5);
        if (ltTrRM) Console.WriteLine($"R7chair ok={ch2} st={StreamHash():x8}");
    }
    num8 = num < 0 ? num3 + 8 : num5 - 7;
    int mainItemInChest = 832;
    if ((int)r.Next(3) == 0) mainItemInChest = 4281;
    if (ltTrRM) Console.WriteLine($"R8pre st={StreamHash():x8}");
    AddBuriedChestGen(num8, Y, mainItemInChest, 12, 0);
    if (ltTrRM) Console.WriteLine($"R8chest st={StreamHash():x8}");
}
void GrowLivingTree_MakePassageG(int j, int Wd, ref int minl, ref int minr, bool noSecretRoom)
{
    bool ltTrMP = Environment.GetEnvironmentVariable("LT_TRACE") != null;
    bool flag = noSecretRoom;
    int num = minl, num2 = minr;
    bool flag2 = false;
    int num3 = 5;
    int num4 = j - 6;
    int num5 = 50;
    int num6 = (int)r.Next(400, 700);
    int num8 = 0;
    bool flag3 = true;
    int num9 = (int)r.Next(5, 16);
    if (ltTrMP) Console.WriteLine($"MP enter st={StreamHash():x8} num6={num6} num9={num9}");
    while (num6 > 0)
    {
        if (num4 > H - 200 + (int)r.Next(15, 31)) num6 = 0;    // Main.UnderworldLayer = maxY-200
        num4++;
        num6--;
        num5--;
        int num10 = (minl + minr) / 2;
        if (InB(minl, num4) && act[num4 * W + minl] == 0 && wal[num4 * W + minl] == 244
            && act[num4 * W + minr] == 0 && wal[num4 * W + minr] == 244)
        {
            num6 = 0;
            break;
        }
        int num11 = 1;
        if (num4 > j && Wd <= 4) num11++;
        for (int i = minl - num11; i <= minr + num11; i++)
        {
            if (!InB(i, num4)) continue;
            if (WALL_DUNGEON.Contains(wal[num4 * W + i])) { flag = true; flag2 = true; }
            if (i > num10 - 2 && i <= num10 + 1)
            {
                if (num4 > j - 4)
                {
                    bool flag4 = true;
                    if (InB(i, num4 + 1) && act[(num4 + 1) * W + i] == 0 && wal[(num4 + 1) * W + i] == 34) flag4 = false;
                    if (typ[num4 * W + i] != 19 && typ[num4 * W + i] != 15 && typ[num4 * W + i] != 304
                        && typ[num4 * W + i] != 21 && typ[num4 * W + i] != 10
                        && typ[(num4 - 1) * W + i] != 15 && typ[(num4 - 1) * W + i] != 304
                        && typ[(num4 - 1) * W + i] != 21 && typ[(num4 - 1) * W + i] != 10
                        && typ[(num4 + 1) * W + i] != 10)
                        act[num4 * W + i] = 0;
                    if (!WALL_DUNGEON.Contains(wal[num4 * W + i]) && wal[num4 * W + i] != 3 && wal[num4 * W + i] != 83)
                        wal[num4 * W + i] = 244;
                    if (!WALL_DUNGEON.Contains(wal[num4 * W + (i - 1)]) && (wal[num4 * W + (i - 1)] > 0 || (double)num4 >= (double)worldSurface))
                        wal[num4 * W + (i - 1)] = 244;
                    if (!WALL_DUNGEON.Contains(wal[num4 * W + (i + 1)]) && (wal[num4 * W + (i + 1)] > 0 || (double)num4 >= (double)worldSurface))
                        wal[num4 * W + (i + 1)] = 244;
                    if (num4 == j && i > num10 - 2 && i <= num10 + 1 && flag4)
                    {
                        if (InB(i, num4 + 1)) act[(num4 + 1) * W + i] = 0;
                        PlaceTileGen(i, num4 + 1, 19, 23);
                    }
                }
            }
            else
            {
                if (typ[num4 * W + i] != 15 && typ[num4 * W + i] != 304 && typ[num4 * W + i] != 21 && typ[num4 * W + i] != 10
                    && typ[num4 * W + (i - 1)] != 10 && typ[num4 * W + (i + 1)] != 10)
                {
                    if (!WALL_DUNGEON.Contains(wal[num4 * W + i]) && wal[num4 * W + i] != 3 && wal[num4 * W + i] != 83
                        && (act[num4 * W + i] != 0 || wal[num4 * W + i] != 34))
                    {
                        typ[num4 * W + i] = 191; act[num4 * W + i] = 1;
                    }
                    if (InB(i - 1, num4) && typ[num4 * W + (i - 1)] == 40) typ[num4 * W + (i - 1)] = 0;
                    if (InB(i + 1, num4) && typ[num4 * W + (i + 1)] == 40) typ[num4 * W + (i + 1)] = 0;
                }
                if (num4 <= j && num4 > j - 4 && i > minl - num11 && i <= minr + num11 - 1)
                    wal[num4 * W + i] = 244;
            }
        }
        num8++;
        if (num8 >= 6)
        {
            num8 = 0;
            int num12 = (int)r.Next(3);
            if (num12 == 0) num12 = -1;
            if (flag3) num12 = 2;
            if (num12 == -1 && InB(minl - num3, num4) && wal[num4 * W + (minl - num3)] == 244) num12 = 1;
            else if (num12 == 1 && InB(minr + num3, num4) && wal[num4 * W + (minr + num3)] == 244) num12 = -1;
            if (num12 == 2)
            {
                flag3 = false;
                int style = 23;
                if (WALL_DUNGEON.Contains(wal[(num4 + 1) * W + minl])
                    || WALL_DUNGEON.Contains(wal[(num4 + 1) * W + (minl + 1)])
                    || WALL_DUNGEON.Contains(wal[(num4 + 1) * W + (minl + 2)]))
                    style = 12;
                for (int k = minl; k <= minr; k++)
                {
                    if (k > num10 - 2 && k <= num10 + 1)
                    {
                        if (InB(k, num4 + 1)) act[(num4 + 1) * W + k] = 0;
                        PlaceTileGen(k, num4 + 1, 19, style);
                    }
                }
            }
            else
            {
                minl += num12;
                minr += num12;
            }
            if (ltTrMP) Console.WriteLine($"MP6 st={StreamHash():x8} num4={num4} num12={num12} minl={minl} minr={minr}");
            if (noSecretRoom)
            {
                num9--;
                if (num9 <= 0)
                    num9 = (!GrowLivingTree_HorizontalTunnelG(num10, num4)) ? (int)r.Next(2, 11) : (int)r.Next(5, 21);
                if (ltTrMP) Console.WriteLine($"MPt st={StreamHash():x8} num4={num4}");
            }
            if (num5 <= 0 && !flag)
            {
                flag = true;
                GrowLivingTreePassageRoomG(minl, minr, num4);
                if (ltTrMP) Console.WriteLine($"MPr st={StreamHash():x8} num4={num4}");
            }
        }
        if (flag2)
        {
            bool flag5 = true;
            for (int l = minl; l <= minr; l++)
            {
                for (int m = num4 + 1; m <= num4 + 2; m++)
                    if (SolidTileGen(l, m)) flag5 = false;
            }
            if (flag5) num6 = 0;
        }
        else
        {
            if (num5 > 0) continue;
            bool flag6 = true;
            for (int n = minl; n <= minr; n++)
            {
                for (int num13 = num4 + 1; num13 <= num4 + 4; num13++)
                    if (SolidTileGen(n, num13)) flag6 = false;
            }
            if (flag6) num6 = 0;
        }
    }
    if (ltTrMP) Console.WriteLine($"MP exit st={StreamHash():x8} num4={num4}");
    minl = num;
    minr = num2;
    for (int num14 = minl; num14 <= minr; num14++)
    {
        for (int num15 = j - 3; num15 <= j; num15++)
        {
            if (!InB(num14, num15)) continue;
            act[num15 * W + num14] = 0;
            bool flag7 = true;
            for (int num16 = num14 - 1; num16 <= num14 + 1; num16++)
                for (int num17 = num15 - 1; num17 <= num15 + 1; num17++)
                    if (InB(num16, num17) && act[num17 * W + num16] == 0 && wal[num17 * W + num16] == 0) flag7 = false;
            if (flag7 && !WALL_DUNGEON.Contains(wal[num15 * W + num14]))
                wal[num15 * W + num14] = 244;
        }
    }
}
bool GrowLivingTreeG(int i, int j, bool patch)
{
    int[] array = new int[1000], array2 = new int[1000], array3 = new int[1000], array4 = new int[1000];
    int num2c = 0;
    int[] array5 = new int[2000], array6 = new int[2000];
    bool[] array7 = new bool[2000];
    bool ltTr2 = Environment.GetEnvironmentVariable("LT_TRACE") != null;
    if (!SolidTileGen(i, j + 1)) { if (ltTr2) Console.WriteLine($"GLT r1 x={i} j={j} !solid-foot"); return false; }
    if (act[j * W + i] != 0) { if (ltTr2) Console.WriteLine($"GLT r2 x={i} j={j} anchor-active"); return false; }
    ushort gt = typ[(j + 1) * W + i];
    if (gt != 0 && gt != 2 && gt != 1 && gt != 40 && !IsOre(gt)) { if (ltTr2) Console.WriteLine($"GLT r3 x={i} j={j} ground={gt}"); return false; }
    if (j < 150) { if (ltTr2) Console.WriteLine($"GLT r4 x={i} j={j} <150"); return false; }
    int num3 = i - (int)r.Next(2, 3);
    int num4 = i + (int)r.Next(2, 3);
    if ((int)r.Next(5) == 0)
    {
        if ((int)r.Next(2) == 0) num3--;
        else num4++;
    }
    int num5 = num4 - num3;
    bool flag = num5 >= 4;
    int num6 = i - 50, num7 = i + 50;
    if (patch)
    {
        num6 = i - 20; num7 = i + 20;
        num3 = i - (int)r.Next(1, 3);
        num4 = i + (int)r.Next(1, 3);
        flag = num5 >= 4;
    }
    for (int k = num6; k <= num7; k++)
        for (int l = 5; l < j - 5; l++)
        {
            if (k < 0 || k >= W || l < 0 || l >= H) continue;
            if (act[l * W + k] != 0)
            {
                if (!patch) { if (ltTr2) Console.WriteLine($"GLT r5 x={i} j={j} clear-hit ({k},{l})"); return false; }
                ushort t = typ[l * W + k];
                if (t != 2 && t != 0 && t != 1 && t != 191 && t != 192 && t != 383 && t != 384) { if (ltTr2) Console.WriteLine($"GLT r6 x={i} j={j} patch-badtype ({k},{l}) t={t}"); return false; }
            }
        }
    SOLID.Remove(48);                       // cs:28257（函数尾 28757 还原）
    int num9 = num3, num10 = num4;
    int minl = num3, minr = num4;
    int num11 = j;
    bool flag2 = true;
    int num12 = (int)r.Next(-8, -4);
    int num13 = (int)r.Next(2);
    int num14 = (int)r.Next(5, 15);
    int maxValue = 2;
    int num = 0;
    if (ltTr2) Console.WriteLine($"GLTp head st={StreamHash():x8} g={LtGridHash():x8} num3={num3} num4={num4} num5={num5}");
    while (flag2)
    {
        num12++;
        if (num12 > num14)
        {
            num14 = (int)r.Next(5, 15);
            num12 = 0;
            array2[num] = num11 + (int)r.Next(5);
            if ((int)r.Next(5) == 0) num13 = num13 == 0 ? 1 : 0;
            if (num13 == 0)
            {
                array3[num] = -1;
                array[num] = num3;
                array4[num] = num4 - num3;
                if ((int)r.Next(maxValue) == 0) num3++;
                num9++;
                num13 = 1;
            }
            else
            {
                array3[num] = 1;
                array[num] = num4;
                array4[num] = num4 - num3;
                if ((int)r.Next(maxValue) == 0) num4--;
                num10--;
                num13 = 0;
            }
            if (num9 == num10) flag2 = false;
            num++;
        }
        for (int m = num3; m <= num4; m++)
            if (InB(m, num11) && !WALL_DUNGEON.Contains(wal[num11 * W + m]))
            {
                typ[num11 * W + m] = 191; act[num11 * W + m] = 1;
            }
        num11--;
    }
    if (ltTr2) Console.WriteLine($"GLTp trunk st={StreamHash():x8} g={LtGridHash():x8} num={num}");
    for (int num15 = 0; num15 < num - 1; num15++)
    {
        int num16 = array[num15] + array3[num15];
        int num17 = array2[num15];
        int num18 = (int)((double)array4[num15] * (1.0 + (double)(int)r.Next(20, 30) * 0.1));
        if (InB(num16, num17 + 1) && !WALL_DUNGEON.Contains(wal[(num17 + 1) * W + num16]))
        {
            typ[(num17 + 1) * W + num16] = 191; act[(num17 + 1) * W + num16] = 1;
        }
        int num19 = (int)r.Next(3, 5);
        while (num18 > 0)
        {
            num18--;
            if (InB(num16, num17) && !WALL_DUNGEON.Contains(wal[num17 * W + num16]))
            {
                typ[num17 * W + num16] = 191; act[num17 * W + num16] = 1;
            }
            if ((int)r.Next(10) == 0) num17 = (int)r.Next(2) != 0 ? num17 + 1 : num17 - 1;
            else num16 += array3[num15];
            if (num19 > 0) num19--;
            else if ((int)r.Next(2) == 0)
            {
                num19 = (int)r.Next(2, 5);
                if (InB(num16, num17) && !WALL_DUNGEON.Contains(wal[num17 * W + num16]))
                {
                    if ((int)r.Next(2) == 0)
                    {
                        typ[num17 * W + num16] = 191; act[num17 * W + num16] = 1;
                        if (InB(num16, num17 - 1)) { typ[(num17 - 1) * W + num16] = 191; act[(num17 - 1) * W + num16] = 1; }
                        array5[num2c] = num16; array6[num2c] = num17; num2c++;
                    }
                    else
                    {
                        typ[num17 * W + num16] = 191; act[num17 * W + num16] = 1;
                        if (InB(num16, num17 + 1)) { typ[(num17 + 1) * W + num16] = 191; act[(num17 + 1) * W + num16] = 1; }
                        array5[num2c] = num16; array6[num2c] = num17; num2c++;
                    }
                }
            }
            if (num18 == 0)
            {
                array5[num2c] = num16; array6[num2c] = num17; num2c++;
            }
        }
    }
    int num20 = (num3 + num4) / 2;
    int num21 = num11;
    int num22 = (int)r.Next(num5 * 3, num5 * 5);
    int num23 = 0, num24 = 0;
    while (num22 > 0 && num21 >= 30)
    {
        if (InB(num20, num21) && !WALL_DUNGEON.Contains(wal[num21 * W + num20]))
        {
            typ[num21 * W + num20] = 191; act[num21 * W + num20] = 1;
        }
        if (num23 > 0) num23--;
        if (num24 > 0) num24--;
        for (int num25 = -1; num25 < 2; num25++)
        {
            if (num25 == 0 || ((num25 >= 0 || num23 != 0) && (num25 <= 0 || num24 != 0)) || (int)r.Next(2) != 0) continue;
            int num26 = num20, num27 = num21;
            int num28 = (int)r.Next(num5, num5 * 3);
            if (num25 < 0) num23 = (int)r.Next(3, 5);
            if (num25 > 0) num24 = (int)r.Next(3, 5);
            int num29 = 0;
            while (num28 > 0)
            {
                num28--;
                num26 += num25;
                if (InB(num26, num27) && !WALL_DUNGEON.Contains(wal[num27 * W + num26]))
                {
                    typ[num27 * W + num26] = 191; act[num27 * W + num26] = 1;
                }
                if (num28 == 0)
                {
                    array5[num2c] = num26; array6[num2c] = num27; array7[num2c] = true; num2c++;
                }
                if ((int)r.Next(5) == 0)
                {
                    num27 = (int)r.Next(2) != 0 ? num27 + 1 : num27 - 1;
                    if (InB(num26, num27) && !WALL_DUNGEON.Contains(wal[num27 * W + num26]))
                    {
                        typ[num27 * W + num26] = 191; act[num27 * W + num26] = 1;
                    }
                }
                if (num29 > 0) num29--;
                else if ((int)r.Next(3) == 0)
                {
                    num29 = (int)r.Next(2, 4);
                    int num30 = num26, num31 = num27;
                    num31 = (int)r.Next(2) != 0 ? num31 + 1 : num31 - 1;
                    if (InB(num30, num31) && !WALL_DUNGEON.Contains(wal[num31 * W + num30]))
                    {
                        typ[num31 * W + num30] = 191; act[num31 * W + num30] = 1;
                    }
                    array5[num2c] = num30; array6[num2c] = num31; array7[num2c] = true; num2c++;
                    array5[num2c] = num30 + (int)r.Next(-5, 6); array6[num2c] = num31 + (int)r.Next(-5, 6); array7[num2c] = true; num2c++;
                }
            }
        }
        array5[num2c] = num20; array6[num2c] = num21; num2c++;
        if ((int)r.Next(4) == 0)
        {
            num20 = (int)r.Next(2) != 0 ? num20 + 1 : num20 - 1;
            if (InB(num20, num21) && !WALL_DUNGEON.Contains(wal[num21 * W + num20]))
            {
                typ[num21 * W + num20] = 191; act[num21 * W + num20] = 1;
            }
        }
        num21--;
        num22--;
    }
    if (ltTr2) Console.WriteLine($"GLTp top st={StreamHash():x8} g={LtGridHash():x8}");
    for (int num32 = minl; num32 <= minr; num32++)
    {
        int num33 = (int)r.Next(1, 6);
        int num34 = j + 1;
        while (num33 > 0)
        {
            if (SolidTileGen(num32, num34)) num33--;
            if (InB(num32, num34)) { typ[num34 * W + num32] = 191; act[num34 * W + num32] = 1; }
            num34++;
        }
        int num35 = num34;
        int num36 = (int)r.Next(2, num5 + 1);
        for (int num37 = 0; num37 < num36; num37++)
        {
            num34 = num35;
            int num38 = (minl + minr) / 2;
            int num39 = num32 >= num38 ? 1 : -1;
            int num40 = 1;
            if (num32 == num38 || (num5 > 6 && (num32 == num38 - 1 || num32 == num38 + 1))) num39 = 0;
            int num41 = num39;
            int num42 = num32;
            num33 = (int)r.Next((int)((double)num5 * 3.5), num5 * 6);
            while (num33 > 0)
            {
                num33--;
                num42 += num39;
                // 1456 cs:28606/28619 主步写门 = `wall != 244`（1405:12796/12803 同）；
                // 步进 cs:28612 `num34 += num40`——2026-08-16 对拍裁决（曾误 wallDungeon 门/步进写死 1）
                if (InB(num42, num34) && wal[num34 * W + num42] != 244)
                {
                    typ[num34 * W + num42] = 191; act[num34 * W + num42] = 1;
                }
                num34 += num40;
                if (InB(num42, num34) && wal[num34 * W + num42] != 244)
                {
                    typ[num34 * W + num42] = 191; act[num34 * W + num42] = 1;
                }
                if (InB(num42, num34 + 1) && act[(num34 + 1) * W + num42] == 0) { num39 = 0; num40 = 1; }
                if ((int)r.Next(3) == 0)
                {
                    num39 = num41 < 0 ? (num39 == 0 ? -1 : 0) : (num41 <= 0 ? (int)r.Next(-1, 2) : (num39 == 0 ? 1 : 0));
                }
                if ((int)r.Next(3) == 0) num40 = num40 == 0 ? 1 : 0;
            }
        }
    }
    if (ltTr2) Console.WriteLine($"GLTp roots st={StreamHash():x8} g={LtGridHash():x8}");
    for (int num43 = 0; num43 < num2c; num43++)
    {
        int num44 = (int)r.Next(5, 8);
        num44 = (int)((double)num44 * (1.0 + (double)num5 * 0.05));
        if (array7[num43]) num44 = (int)r.Next(6, 12) + num5;
        int num45 = array5[num43] - num44 * 2;
        int num46 = array5[num43] + num44 * 2;
        int num47 = array6[num43] - num44 * 2;
        int num48 = array6[num43] + num44 * 2;
        double num49 = 2.0 - (double)(int)r.Next(5) * 0.1;
        for (int num50 = num45; num50 <= num46; num50++)
        {
            for (int num51 = num47; num51 <= num48; num51++)
            {
                if (!GrowLivingTree_CanPlaceLeavesG(num50, num51)) continue;
                if (array7[num43])
                {
                    double dx = (double)array5[num43] - (double)num50, dy = (double)array6[num43] - (double)num51;
                    if (Math.Sqrt(dx * dx + dy * dy) < (double)num44 * 0.9)
                    {
                        typ[num51 * W + num50] = 192; act[num51 * W + num50] = 1;
                    }
                }
                else if ((double)Math.Abs(array5[num43] - num50) + (double)Math.Abs(array6[num43] - num51) * num49 < (double)num44)
                {
                    typ[num51 * W + num50] = 192; act[num51 * W + num50] = 1;
                }
            }
            if ((int)r.Next(30) == 0)
            {
                int num52 = num47;
                if (num50 >= 5 && num52 >= 5 && num50 < W - 5 && num52 < H - 5 && act[num52 * W + num50] == 0)
                {
                    for (; InB(num50, num52 + 1) && act[(num52 + 1) * W + num50] == 0 && num52 < num48; num52++) { }
                    if (InB(num50, num52 + 1) && typ[(num52 + 1) * W + num50] == 192)
                        PlaceTileGen(num50, num52, 187, (int)r.Next(50, 52));
                }
            }
            if (array7[num43] || (int)r.Next(15) != 0) continue;
            int num53 = num48;
            int num54 = num53 + 100;
            if (InB(num50, num53) && act[num53 * W + num50] != 0) continue;
            for (; InB(num50, num53 + 1) && act[(num53 + 1) * W + num50] == 0 && num53 < num54; num53++) { }
            if (InB(num50, num53 + 1) && typ[(num53 + 1) * W + num50] == 192) continue;
            if ((int)r.Next(2) == 0)
            {
                PlaceTileGen(num50, num53, 187, (int)r.Next(47, 50));
                continue;
            }
            int num55 = (int)r.Next(2);
            int pileStyle = 72;
            if (num55 == 1) pileStyle = (int)r.Next(59, 62);
            PlaceSmallPileGen(num50, num53, pileStyle, num55);
        }
    }
    if (ltTr2) Console.WriteLine($"GLTp leaves st={StreamHash():x8} g={LtGridHash():x8} num2c={num2c}");
    if (flag)
    {
        bool flag4 = false;
        int num56 = j, num57 = j + 20;
        for (int num58 = num56; num58 < num57 && !((double)num58 >= (double)worldSurface - 2.0); num58++)
        {
            for (int num59 = minl; num59 <= minr; num59++)
                if (InB(num59, num58) && wal[num58 * W + num59] == 0 && !SolidTileGen(num59, num58)) flag4 = true;
        }
        if (!flag4)
        {
            GrowLivingTree_MakePassageG(j, num5, ref minl, ref minr, patch);
        }
    }
    SOLID.Add(48);                          // cs:28757 还原
    return true;
}
{
    int num = 200;
    int num2 = 0;
    double num3 = (double)W / 4200.0;
    int num4 = (int)r.Next(0, (int)(2.0 * num3) + 1);
    if (num4 == 0 && (int)r.Next(2) == 0) num4++;
    bool ltTr = Environment.GetEnvironmentVariable("LT_TRACE") != null;
    if (ltTr) Console.WriteLine($"LT count num4={num4}");
    for (int i = 0; i < num4; i++)
    {
        bool flag = false;
        int num5 = 0;
        while (!flag)
        {
            num5++;
            if (num5 > W / 2) flag = true;
            int num6 = (int)r.Next(BEACH_DISTANCE, W - BEACH_DISTANCE);
            if (num6 <= W / 2 - num || num6 >= W / 2 + num)
            {
                int j = num2;
                for (; j < H && act[j * W + num6] == 0 && (double)j < (double)worldSurface; j++) { }
                if ((double)j >= (double)worldSurface) continue;
                if (typ[j * W + num6] == 0)
                {
                    j--;
                    if (j > 150)
                    {
                        bool flag2 = true;
                        if (IsTileNearbyG(num6, j, 191, 10) || IsTileNearbyG(num6, j, 192, 10)) flag2 = false;
                        if (flag2)
                        {
                            for (int k = num6 - 50; k < num6 + 50; k++)
                            {
                                for (int l = j - 50; l < j + 50; l++)
                                {
                                    if (!InB(k, l) || act[l * W + k] == 0) continue;
                                    ushort t = typ[l * W + k];
                                    if (t == 41 || t == 43 || t == 44 || t == 481 || t == 482 || t == 483) flag2 = false;
                                    else if (t == 189 || t == 196 || t == 460 || t == 717 || t == 718 || t == 719) flag2 = false;
                                }
                            }
                        }
                        for (int m = 0; m < mCaveX.Count; m++)
                        {
                            if (num6 > mCaveX[m] - 50 && num6 < mCaveX[m] + 50)
                            {
                                flag2 = false;
                                break;
                            }
                        }
                        if (flag2)
                        {
                            if (ltTr) Console.WriteLine($"LT try x={num6} j={j} st={StreamHash():x8}");
                            flag = GrowLivingTreeG(num6, j, false);
                            if (ltTr) Console.WriteLine($"LT result x={num6} ok={flag} st={StreamHash():x8}");
                            if (flag)
                            {
                                for (int n = -1; n <= 1; n++)
                                {
                                    if (n == 0) continue;
                                    int a7 = num6;
                                    int num8 = (int)r.Next(4);
                                    for (int num9 = 0; num9 < num8; num9++)
                                    {
                                        a7 += (int)r.Next(13, 31) * n;
                                        if (a7 <= W / 2 - num || a7 >= W / 2 + num)
                                        {
                                            int a10 = j;
                                            if (InB(a7, a10) && act[a10 * W + a7] != 0)
                                            {
                                                while (a10 > 0 && act[a10 * W + a7] != 0) a10--;
                                            }
                                            else
                                            {
                                                for (; a10 < H - 1 && act[a10 * W + a7] == 0; a10++) { }
                                                a10--;
                                            }
                                            bool flag2b = true;
                                            for (int a11 = num6 - 50; a11 < num6 + 50; a11++)
                                            {
                                                for (int a12 = j - 50; a12 < j + 50; a12++)
                                                {
                                                    if (!InB(a11, a12) || act[a12 * W + a11] == 0) continue;
                                                    ushort t2 = typ[a12 * W + a11];
                                                    if (t2 == 41 || t2 == 43 || t2 == 44 || t2 == 481 || t2 == 482 || t2 == 483) flag2b = false;
                                                    else if (t2 == 189 || t2 == 196 || t2 == 460 || t2 == 717 || t2 == 718 || t2 == 719) flag2b = false;
                                                }
                                            }
                                            if (flag2b) { if (ltTr) Console.WriteLine($"LT patch x={a7} j={a10}"); GrowLivingTreeG(a7, a10, true); }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    SOLID.Remove(192);                      // cs:15789 `Main.tileSolid[192] = false`（pass 尾，永久）
}
Checkpoint("livingtrees");
StreamPt("livingtrees");

Replay(); // ▶pass 头重播：LivingTreeWalls cs:15792
// ================= Pass 42b LivingTreeWalls（cs:15792-15824，零掷骰）=================
{
    for (int i = 25; i < W - 25; i++)
    {
        for (int j = 25; (double)j < (double)worldSurface; j++)
        {
            if (!InB(i, j) || !InB(i, j - 1)) continue;
            if (typ[j * W + i] == 191 || typ[(j - 1) * W + i] == 191 || typ[j * W + (i - 1)] == 191
                || typ[j * W + (i + 1)] == 191 || (!InB(i, j + 1) ? false : typ[(j + 1) * W + i] == 191))
            {
                bool flag = true;
                for (int k = i - 1; k <= i + 1; k++)
                {
                    for (int l = j - 1; l <= j + 1; l++)
                    {
                        if (k != i && l != j && (!InB(k, l) || act[l * W + k] == 0 || typ[l * W + k] != 191) && (!InB(k, l) || wal[l * W + k] != 244))
                            flag = false;
                    }
                }
                if (flag) wal[j * W + i] = 244;
            }
        }
    }
}
Checkpoint("livingtreewalls");
StreamPt("livingtreewalls");

Replay(); // ▶pass 头重播：DemonAndCrimsonAltars cs:15825
// ================= Pass 43 DemonAndCrimsonAltars（cs:15825-15885）=================
{
    // cs:15831 `Main.tileSolid[484] = false` —— oracle :1284 已摘除（幂等）
    int num = (int)((double)(W * H) * 3.3E-06);
    for (int i = 0; i < num; i++)
    {
        for (int j = 0; j < 10000; j++)
        {
            int num2 = (int)r.Next(281, W - 3 - 280);
            while ((double)num2 > (double)W * 0.45 && (double)num2 < (double)W * 0.55)
                num2 = (int)r.Next(281, W - 3 - 280);
            int num3 = (int)r.Next((int)((double)worldSurface * 2.0 + (double)rockLayer) / 3,
                (int)((double)rockLayer + (double)((H - 350) * 2)) / 3);
            while (OceanDepthsG(num2, num3)
                || Math.Sqrt((double)(num2 - shimmerXOut) * (double)(num2 - shimmerXOut) + (double)(num3 - shimmerYOut) * (double)(num3 - shimmerYOut)) < 150.0)
            {
                num2 = (int)r.Next(281, W - 3 - 280);
                while ((double)num2 > (double)W * 0.45 && (double)num2 < (double)W * 0.55)
                    num2 = (int)r.Next(281, W - 3 - 280);
                num3 = (int)r.Next((int)((double)worldSurface * 2.0 + (double)rockLayer) / 3,
                    (int)((double)rockLayer + (double)((H - 350) * 2)) / 3);
            }
            int style = crimson ? 1 : 0;
            if (!IsTileNearbyG(num2, num3, 26, 3))
                PlaceTileGen(num2, num3, 26, style);
            if (InB(num2, num3) && typ[num3 * W + num2] == 26) break;
        }
    }
}
Checkpoint("altars");
StreamPt("altars");

Replay(); // ▶pass 头重播：SurfaceWaterInJungle cs:15887
// ================= Pass 44 SurfaceWaterInJungle（cs:15887-15910，零掷骰）=================
{
    for (int i = 0; i < W; i++)
    {
        for (int j = (int)gvWorldSurfaceLow; (double)j < (double)worldSurface - 1.0; j++)
        {
            if (j < 0 || j >= H || !InB(i, j)) continue;
            if (act[j * W + i] != 0)
            {
                if (typ[j * W + i] == 60)
                {
                    if (InB(i, j - 1)) { liq[(j - 1) * W + i] = 255; liqT[(j - 1) * W + i] = 0; }
                    if (InB(i, j - 2)) { liq[(j - 2) * W + i] = 255; liqT[(j - 2) * W + i] = 0; }
                }
                break;
            }
        }
    }
}
Checkpoint("surfacewaterinjungle");
StreamPt("surfacewaterinjungle");

// ================= 检查点链向链外 pass 扩展（2026-08-17 扩展批）=================
// FF 批跳过清单的链外项补检查点：Statues(#58) / CaveWalls(#67) / UndergroundJungle
// Trees(#68) / QuickCleanup(#70)。当前以「整 pass 跳段」推进：被跳 pass（#46-#57、
// #59-#66、#69）两侧（本 oracle 与 JS tests/caves-checkpoint chainCheckpoints）同
// skip——每 pass 头 Replay() 隔离掷骰流，跳段对在跑 pass 的流零影响；tileSolid
// 翻转由各转录段头尾自镜像（与 JS runner 内 flipGenSolid 同点位同值，SOLID 集合
// 直接增删）。后续批次补转录被跳 pass 后，本段检查点值将整体变化——预期（终局
// 窗口统一再生金标）。仍未覆盖项及原因（2026-08-17 现况）：
//   #47 Beehives——主巢/蜂蜜斑选址门依赖全链 StructureMap 保护登记（protectedRects）
//     + GeneralPlacementTiles 内容扫描：oracle 无该基础设施，须先移植登记链；
//   #59-#60 BuriedChests/SurfaceChests——洞穴房 CaveHouse 族 ~1.3k 行（另批）；
//   #82 Trees / #97 SettleLiquidsPart2 / #98 Cactus / #101 MicroBiomes——各自
//     0.6k-1.8k 行转录量 + #97 需液体模拟引擎（另批）。

Replay(); // ▶pass 头重播：Statues cs:16947（island：#46-#57 跳段）
// ================= Pass 58 Statues（cs:16947-17055 + statueList cs:4395-4433）=================
{
    // statueList 73 项 (tile,style)：0-43 段 (105,i) 但 [34]=(349,0)、[43]=(105,50)，
    // 尾接 29 项样式（JS StatuesPass.STATUE_LIST 同构，R 批归位后对该 x86 归零）。
    var statueList = new (int tile, int style)[73];
    for (int si = 0; si < 44; si++) statueList[si] = (105, si);
    statueList[34] = (349, 0);
    statueList[43] = (105, 50);
    int[] tailStyles = { 63, 64, 65, 66, 68, 69, 70, 71, 72, 73, 75, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 77, 78, 67, 74, 37, 2 };
    for (int si = 0; si < tailStyles.Length; si++) statueList[44 + si] = (105, tailStyles[si]);
    var trapStatueIdx = new HashSet<int> { 4, 7, 10, 18 };   // GenVars.StatuesWithTraps（列表索引）
    void PlaceStatueTrapG(int x, int y)      // cs:4436（wire 布线不入四通道哈希——JS 写 wire 位对 typ/act/wal/liq 零影响，两侧同省略）
    {
        if (!InB(x, y) || x < 20 || x > W - 21 || y < 20 || y > H - 21) return;
        for (int i = -10; i <= 10; i++)
        {
            for (int j = -10; j <= 10; j++)
            {
                int tx = x + i, ty = y + j;
                if (tx < 0 || tx >= W || ty < 0 || ty + 1 >= H) continue;
                if (act[ty * W + tx] != 0) continue;                                   // 上格须空
                if (act[(ty + 1) * W + tx] == 0 || !SOLID.Contains(typ[(ty + 1) * W + tx])) continue; // 下格实心
                if (typ[(ty + 1) * W + tx] == 162) continue;                            // 冰特判
                int ti = ty * W + tx;
                typ[ti] = 137; act[ti] = 1; frX[ti] = 0; frY[ti] = 0;
                return;
            }
        }
    }
    int stCount = (int)Math.Floor(73 * 2 * ((double)W / 4200.0));
    int num = 0;                                          // 样式游标（cs:16970 顺序轮换）
    int yMin = (int)Math.Floor(((double)worldSurface * 2.0 + (double)rockLayer) / 3.0);
    for (int i2 = 0; i2 < stCount; i2++)
    {
        if (num >= 73) num = 0;
        int sheet = statueList[num].tile, style = statueList[num].style;
        bool done = false; int fail = 0;
        while (!done)
        {
            int x = (int)r.Next(20, W - 20);
            int y = (int)r.Next(yMin, H - 300);
            // 海洋回避（cs:16989 oceanDepths）：y>oceanLevel 直接放行（前置判定防深层海滩列误拒）
            double oceanTop = ((double)worldSurface + (double)rockLayer) / 2.0 + 40.0;
            int guard = 100;
            while ((double)y <= oceanTop && (x < BEACH_DISTANCE || x > W - BEACH_DISTANCE) && guard-- > 0)
            { x = (int)r.Next(20, W - 20); y = (int)r.Next(yMin, H - 300); }
            if (guard <= 0) { done = true; break; }
            while (y < H && act[y * W + x] == 0) y++;    // 向下扫到首个 active 格
            if (y >= H) { done = true; break; }
            y--;
            if (y < 2 || x + 1 >= W || y - 2 < 0) { fail++; if (fail >= 10000) done = true; continue; }
            bool ok = true;                               // 2×3 净空（PlaceTile forced 占用门）
            for (int dx = 0; dx < 2 && ok; dx++) for (int dy = -2; dy <= 0 && ok; dy++)
                if (act[(y + dy) * W + x + dx] != 0) ok = false;
            if (!ok) { fail++; if (fail >= 10000) done = true; continue; }
            int row = style / 55;                         // 雕像帧换行（Tiles_105 宽 55 列）
            for (int dx = 0; dx < 2; dx++) for (int dy = 0; dy < 3; dy++)
            {
                int ii = (y - 2 + dy) * W + x + dx;
                typ[ii] = (ushort)(sheet == 349 ? 349 : 105); act[ii] = 1;
                frX[ii] = (ushort)((style - row * 55) * 36 + dx * 18);
                frY[ii] = (ushort)(row * 54 + dy * 18);
            }
            if (trapStatueIdx.Contains(num)) PlaceStatueTrapG(x, y);
            num++; done = true;
        }
    }
}
Checkpoint("statues");
StreamPt("statues");

Replay(); // ▶pass 头重播：CaveWallsInEnclosedSpaces cs:17819（island：#59-#66 跳段）
// ================= Pass 67 CaveWallsInEnclosedSpaces（cs:17819-17948）=================
// pass 头 tileSolid 翻转（cs:17821-17823，持久不还原）：162 薄冰/232 木刺→非实心，
// 226 蜥蜴砖→实心（默认已实心，幂等）——countTiles 洪泛与选点门随之判定。
SOLID.Remove(162); SOLID.Add(226); SOLID.Remove(232);
{
    (int count, int shroom, int rock, int ice, int sand, int lava) CountTilesG(int sx, int sy, bool jungle, bool lavaOk)
    {
        var cr = (count: 0, shroom: 0, rock: 0, ice: 0, sand: 0, lava: 0);
        var counted = new HashSet<int>();                // ★只登记非实心格（cs:9585）——实心邻格可被
        void Nxt(int x, int y)                           //   多路重复访问，类型计数器随之重复累加
        {
            if (cr.count >= 1500) return;
            if (x <= 1 || x >= W - 1 || y <= 1 || y >= H - 1) { cr.count = 1500; return; }
            int ii = y * W + x;
            if (counted.Contains(ii)) return;
            if (wal[ii] == 244) { cr.count = 1500; return; }               // 活木墙封顶
            if (liq[ii] > 0 && liqT[ii] == 3) { cr.count = 1500; return; } // 微光（oracle 3=JS liquidType 4）
            if (!jungle)
            {
                if (wal[ii] != 0) { cr.count = 1500; return; }             // 已有墙封顶
                if (liq[ii] > 0 && liqT[ii] == 1)                          // 岩浆（oracle 1=JS 2）
                { cr.lava++; if (!lavaOk) { cr.count = 1500; return; } }
            }
            if (act[ii] != 0)
            {
                if (typ[ii] == 70) cr.shroom++;
                if (typ[ii] == 1) cr.rock++;
                if (typ[ii] == 147 || typ[ii] == 161) cr.ice++;
                if (typ[ii] == 53 || typ[ii] == 396 || typ[ii] == 397) cr.sand++;
            }
            if (!Solid5Gen(x, y))
            {
                counted.Add(ii); cr.count++;
                Nxt(x - 1, y); Nxt(x + 1, y); Nxt(x, y - 1); Nxt(x, y + 1);
            }
        }
        Nxt(sx, sy);
        return cr;
    }
    void SpreadWallG(int sx, int sy, ushort wallType)    // Spread.Wall（cs:3327-3385）波前 BFS
    {
        if (!InB(sx, sy)) return;
        var seen = new HashSet<int>();
        var frontier = new List<(int x, int y)> { (sx, sy) };
        while (frontier.Count > 0)
        {
            var nxt = new List<(int x, int y)>();
            foreach (var (x, y) in frontier)
            {
                if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;  // InWorld(x,y,1)
                int ii = y * W + x;
                if (seen.Contains(ii)) continue;
                seen.Add(ii);
                if (Solid5Gen(x, y) || wal[ii] != 0)
                {
                    if (act[ii] != 0 && wal[ii] == 0) wal[ii] = wallType;  // 实心背面墙
                    continue;
                }
                wal[ii] = wallType;
                foreach (var (dx, dy) in new[] { (-1, 0), (1, 0), (0, -1), (0, 1) })
                    if (!seen.Contains((y + dy) * W + x + dx)) nxt.Add((x + dx, y + dy));
            }
            frontier = nxt;
        }
    }
    // ---- 主段（cs:17827-17871）：w*0.04 次，封闭腔(10≤air<1500)刷洞穴背景墙 ----
    int maxY = H - 220;
    int minY = (int)(((double)worldSurface + (double)rockLayer) / 2.0);
    int n1 = (int)((double)W * 0.04);
    for (int i = 0; i < n1; i++)
    {
        int tries = 0;
        int x = (int)r.Next(200, W - 200);
        int y = (int)r.Next(minY, maxY);
        var c = CountTilesG(x, y, false, true);
        while ((c.count >= 1500 || c.count < 10) && tries < 500)
        {
            tries++;
            x = (int)r.Next(200, W - 200); y = (int)r.Next(minY, maxY);
            c = CountTilesG(x, y, false, true);
        }
        if (tries >= 500) continue;
        int wallType = (int)r.Next(2);                   // 恒消费一次（cs:17856，分支可整体覆写）
        if ((double)c.shroom > (double)c.rock * 0.75) wallType = 80;
        else if (c.ice > 0) wallType = wallType == 0 ? 40 : 71;
        else if (c.lava > 0) wallType = 79;
        else { int[] pick = { 59, 61, 170, 171 }; wallType = pick[(int)r.Next(4)]; }
        SpreadWallG(x, y, (ushort)wallType);
    }
    // ---- 次段（cs:17920-17946）：w*0.02 次，丛林墙(64)腔刷泥墙 15（Spread.Wall2）----
    int maxY2 = (int)lavaLine;
    int n2 = (int)((double)W * 0.02);
    var WALL_CANNOT_REPLACE = new HashSet<ushort> { 4, 40, 3, 83, 87, 244, 34 };
    void SpreadWall2G(int sx, int sy, ushort wallType)   // Spread.Wall2（cs:3387-3492；墙 15 非 stopsAtAir 族）
    {
        if (!InB(sx, sy)) return;
        int out2 = 0;
        var seen = new HashSet<int>();
        var frontier = new List<(int x, int y)> { (sx, sy) };
        while (frontier.Count > 0)
        {
            var nxt = new List<(int x, int y)>();
            foreach (var (x, y) in frontier)
            {
                if (x < 1 || x >= W - 1 || y < 1 || y >= H - 1) continue;
                int ii = y * W + x;
                if (seen.Contains(ii)) continue;
                seen.Add(ii);
                if (wal[ii] == wallType || WALL_CANNOT_REPLACE.Contains(wal[ii])) continue;
                if (!Solid5Gen(x, y))
                {
                    out2++;
                    if (out2 >= 5000) continue;           // maxWallOut2（cs:4196）
                    wal[ii] = wallType;
                    nxt.Add((x - 1, y)); nxt.Add((x + 1, y)); nxt.Add((x, y - 1)); nxt.Add((x, y + 1));
                }
                else if (act[ii] != 0) wal[ii] = wallType;  // 实心背面墙，不入队扩散
            }
            frontier = nxt;
        }
    }
    for (int k = 0; k < n2; k++)
    {
        int tries = 0;
        int x = (int)r.Next(200, W - 200);
        int y = (int)r.Next((int)worldSurface, maxY2);
        int c = wal[y * W + x] == 64 ? CountTilesG(x, y, true, false).count : 0;
        while ((c >= 1500 || c < 10) && tries < 1000)
        {
            tries++;
            x = (int)r.Next(200, W - 200); y = (int)r.Next((int)worldSurface, maxY2);
            int wl = wal[y * W + x];
            if (wl != 244) c = wl == 64 ? CountTilesG(x, y, true, false).count : 0;
        }
        if (tries < 1000) SpreadWall2G(x, y, 15);
    }
}
Checkpoint("cavewalls");
StreamPt("cavewalls");

Replay(); // ▶pass 头重播：UndergroundJungleTrees cs:17952
// ================= Pass 68 UndergroundJungleTrees（cs:17952-17970 + GrowUndergroundTree cs:31007-31457）=================
{
    SOLID.Add(379);   // cs:17956 头 tileSolid[379]=true（本表已含，幂等——JS flipGenSolid 同值）
    bool EmptyTileCheckSapling(int x0, int x1, int y0, int y1)  // EmptyTileCheck(…,20)（cs:31611-31699）
    {
        if (x0 < 0 || x1 >= W || y0 < 0 || y1 >= H) return false;
        for (int x = x0; x <= x1; x++) for (int y = y0; y <= y1; y++)
        {
            int ii = y * W + x;
            if (act[ii] == 0) continue;
            ushort t = typ[ii];
            if (t == 20 || t == 590 || t == 595 || t == 615) continue;      // CommonSapling
            if (t == 3 || t == 24 || t == 32 || t == 61 || t == 62 || t == 69 || t == 71 || t == 73
                || t == 74 || t == 82 || t == 83 || t == 84 || t == 110 || t == 113 || t == 184
                || t == 201 || t == 233 || t == 352 || t == 485 || t == 529 || t == 530
                || t == 637 || t == 655) continue;                           // 植物白名单（cs:31669-31691）
            return false;
        }
        return true;
    }
    int[][] TRUNKU = {                                                    // Trees_5 干身帧表（num5×num4）
        new[]{0,0},   new[]{0,22},  new[]{0,44},      // case 0 default
        new[]{0,66},  new[]{0,88},  new[]{0,110},     // case 1
        new[]{22,0},  new[]{22,22}, new[]{22,44},     // case 2
        new[]{44,66}, new[]{44,88}, new[]{44,110},    // case 3
        new[]{22,66}, new[]{22,88}, new[]{22,110},    // case 4
        new[]{88,0},  new[]{88,22}, new[]{88,44},     // case 5 左枝
        new[]{66,66}, new[]{66,88}, new[]{66,110},    // case 6 右枝
        new[]{110,66},new[]{110,88},new[]{110,110},   // case 7 双枝
        new[]{0,0},   new[]{0,22},  new[]{0,44},      // case 8 default
        new[]{0,0},   new[]{0,22},  new[]{0,44},      // case 9 default
    };
    void PutTree(int x, int y, int fx, int fy2)
    {
        if (x < 0 || x >= W || y < 0 || y >= H) return;
        int ii = y * W + x;
        typ[ii] = 5; act[ii] = 1; frX[ii] = (ushort)fx; frY[ii] = (ushort)fy2;
    }
    void GrowUndergroundTreeG(int i, int y)
    {
        if (i < 0 || i >= W || y < 0 || y >= H) return;
        int gi = y * W + i;
        if (act[gi] == 0 || typ[gi] != 60 || half[gi] == 1 || slope[gi] != 0) return;  // 基座=丛林草整砖
        bool sideL = InB(i - 1, y) && act[y * W + i - 1] != 0 && typ[y * W + i - 1] == 60;
        bool sideR = InB(i + 1, y) && act[y * W + i + 1] != 0 && typ[y * W + i + 1] == 60;
        if (!sideL && !sideR) return;                                     // 左右邻至少一侧丛林草
        int num2 = (int)r.Next(5, 15);                                    // 高度（EmptyTileCheck 前消耗）
        int num3 = num2 + 2 + 5;                                          // +2（cs:31015）+5（type==60 恒真）
        if (!EmptyTileCheckSapling(i - 1, i + 1, y - num3, y - 1)) return;
        bool flagL = false, flagR = false;
        for (int j = y - num2; j < y; j++)                                // ★num4 先掷 num5 后掷（GrowTree 反序）
        {
            int num4 = (int)r.Next(3);
            int num5 = (int)r.Next(10);
            if (j == y - 1 || j == y - num2) num5 = 0;
            while (((num5 == 5 || num5 == 7) && flagL) || ((num5 == 6 || num5 == 7) && flagR))
                num5 = (int)r.Next(10);
            flagL = false; flagR = false;
            if (num5 == 5 || num5 == 7) flagL = true;
            if (num5 == 6 || num5 == 7) flagR = true;
            var fr = TRUNKU[num5 * 3 + num4];
            PutTree(i, j, fr[0], fr[1]);
            if (num5 == 5 || num5 == 7)                                   // 左枝（变体掷在 <2 门之前）
            {
                int k = (int)r.Next(3);
                if ((int)r.Next(3) < 2) PutTree(i - 1, j, 44, 198 + k * 22);
                else PutTree(i - 1, j, 66, k * 22);
            }
            if (num5 == 6 || num5 == 7)                                   // 右枝
            {
                int k = (int)r.Next(3);
                if ((int)r.Next(3) < 2) PutTree(i + 1, j, 66, 198 + k * 22);
                else PutTree(i + 1, j, 88, 66 + k * 22);
            }
        }
        int num6 = (int)r.Next(3);                                        // 根部方向
        bool RootFit(int dx)
        {
            if (!InB(i + dx, y)) return false;
            int si = y * W + i + dx;
            ushort st = typ[si];
            return act[si] != 0 && half[si] == 0 && slope[si] == 0
                && (st == 2 || st == 23 || st == 60 || st == 109 || st == 147);
        }
        bool fitL = RootFit(-1), fitR = RootFit(1);
        if (!fitL) { if (num6 == 0) num6 = 2; else if (num6 == 1) num6 = 3; }
        if (!fitR) { if (num6 == 0) num6 = 1; else if (num6 == 2) num6 = 3; }
        if (fitL && !fitR) num6 = 2;
        if (fitR && !fitL) num6 = 1;
        if (num6 == 0 || num6 == 1) PutTree(i + 1, y - 1, 22, 132 + (int)r.Next(3) * 22);  // 三掷各自独立
        if (num6 == 0 || num6 == 2) PutTree(i - 1, y - 1, 44, 132 + (int)r.Next(3) * 22);
        int baseK = (int)r.Next(3);                                       // 无条件掷（num6==3 掷而不用）
        int baseFx = num6 == 0 ? 88 : num6 == 1 ? 0 : num6 == 2 ? 66 : -1;
        if (baseFx >= 0) PutTree(i, y - 1, baseFx, 132 + baseK * 22);
        int crownFx = (int)r.Next(8) != 0 ? 22 : 0;                       // 树冠门 Next(8)（GrowTree 是 13，勿搬）
        PutTree(i, y - num2, crownFx, 198 + (int)r.Next(3) * 22);
        // gs.genTrees 砍伐登记（JS 侧）不入四通道哈希——省略
    }
    int yStart = (int)worldSurface - 1;
    int yEnd = H - 350;
    for (int i = 0; i < W; i++)
        for (int j = yStart; j < yEnd; j++)
            if ((int)r.Next(10) == 0) GrowUndergroundTreeG(i, j);         // Next(10)==0 门
}
Checkpoint("undergroundjungletrees");
StreamPt("undergroundjungletrees");

Replay(); // ▶pass 头重播：QuickCleanup cs:17987（island：#69 IslandHouses 跳段）
// ================= Pass 70 QuickCleanup（cs:17987-18107 五子段）=================
{
    SOLID.Remove(137); SOLID.Remove(130);                 // cs:17997-98 头翻（尾 cs:18104-05 还原）
    var NON_SOLID_SAVE_SLOPES = new HashSet<ushort> { 131, 351, 336, 340, 341, 342, 343, 344 };
    var PLATFORMS_QC = new HashSet<ushort> { 19, 427, 435, 436, 437, 438, 439 };
    bool SaveSlopeQ(ushort t) => SOLID.Contains(t) || NON_SOLID_SAVE_SLOPES.Contains(t);
    bool SolidQC(int x, int y)                            // WorldGen.SolidTile（tileSolidTop 以 platform 近似=JS 同口径）
    {
        if (!InB(x, y)) return false;
        int i = y * W + x;
        return act[i] != 0 && SOLID.Contains(typ[i]) && !PLATFORMS_QC.Contains(typ[i]) && half[i] == 0 && slope[i] == 0;
    }
    bool OceanDepthsQ(int x, int y)
    {
        if ((double)y > ((double)worldSurface + (double)rockLayer) / 2.0 + 40.0) return false;
        return x < BEACH_DISTANCE || x > W - BEACH_DISTANCE;
    }
    for (int i = 20; i < W - 20; i++)
    {
        for (int j = 20; j < H - 20; j++)
        {
            int t = j * W + i;
            // (a) 海洋带非水液体 → 水（cs:18005-18008）
            if (OceanDepthsQ(i, j) && liq[t] > 0 && liqT[t] != 0) liqT[t] = 0;
            // (b) 海洋带表面沙下方填土（cs:18009-18022）。Next(4,7) 在 for 条件内=逐判定掷
            if ((double)j < worldSurface && OceanDepthsQ(i, j) && act[t] != 0 && typ[t] == 53)
            {
                if (slope[t] == 3 || slope[t] == 4) slope[t] = 0;        // bottomSlope → slope(0)
                for (int k = j + 1;
                    k < j + (int)r.Next(4, 7)
                    && (act[k * W + i] == 0 || (typ[k * W + i] != 397 && typ[k * W + i] != 53))
                    && (act[(k + 1) * W + i] == 0 || (typ[(k + 1) * W + i] != 397 && typ[(k + 1) * W + i] != 53 && typ[(k + 1) * W + i] != 495))
                    && (act[(k + 2) * W + i] == 0 || (typ[(k + 2) * W + i] != 397 && typ[(k + 2) * W + i] != 53 && typ[(k + 2) * W + i] != 495));
                    k++)
                {
                    int ki = k * W + i;                                   // 泥土=vanilla type 0（active 置位区分于清格）
                    typ[ki] = 0; act[ki] = 1; half[ki] = 0; slope[ki] = 0; // 原版 type=0+active(true)+halfBrick(false)+slope(0)
                }
            }
            // (c) 沙岩/硬化沙墙内杂块转硬化沙 + 液体二分（cs:18023-18045，不查 active——幽灵 type 同改）
            if (wal[t] == 187 || wal[t] == 216)
            {
                if (typ[t] == 59 || typ[t] == 123 || typ[t] == 224) typ[t] = 397;
                if (typ[t] == 368 || typ[t] == 367) typ[t] = 397;
                if ((double)j <= rockLayer) liq[t] = 0;
                else if (liq[t] > 0) { liq[t] = 255; liqT[t] = 1; }
            }
            // (d) 表面悬空沙下墙补齐（cs:18046-18069）。★break 只断内层 m 循环——num=最右
            //     一列（含墙者）的最上方墙值（bug-for-bug 保留）
            if ((double)j < worldSurface && act[t] != 0 && typ[t] == 53
                && wal[(j + 1) * W + i] == 0 && !SolidQC(i, j + 1))
            {
                ushort numW = 0;
                for (int l = i - 3; l <= i + 3; l++)
                {
                    for (int m = j - 3; m <= j + 3; m++)
                    {
                        if (!InB(l, m)) continue;                          // JS OOB 读 wall=undefined>0=false（等价跳过）
                        if (wal[m * W + l] > 0) { numW = wal[m * W + l]; break; }
                    }
                }
                if (numW > 0)
                {
                    wal[(j + 1) * W + i] = numW;
                    if (wal[t] == 0) wal[t] = numW;
                }
            }
            // (e) SaveSlopes 坡面/半砖归一（cs:18070-18101）
            if (act[t] == 0 || !SaveSlopeQ(typ[t]))
            {
                slope[t] = 0; half[t] = 0;                                // ClearSlope
            }
            else if (!PLATFORMS_QC.Contains(typ[t]) && !NOT_CLEAR.Contains(typ[t]))
            {
                bool topSlope = slope[t] == 1 || slope[t] == 2;
                bool bottomSlope = slope[t] == 3 || slope[t] == 4;
                if (topSlope || half[t] == 1)
                {
                    if (typ[t] != 225 || half[t] == 0)                    // 蜂巢块半砖档豁免（cs:18078）
                    {
                        if (!SolidQC(i, j + 1)) { act[t] = 0; typ[t] = 0; half[t] = 0; slope[t] = 0; }
                        if (typ[j * W + i + 1] == 137 || typ[j * W + i - 1] == 137) { act[t] = 0; typ[t] = 0; half[t] = 0; slope[t] = 0; }
                    }
                }
                else if (bottomSlope)
                {
                    if (!SolidQC(i, j - 1)) { act[t] = 0; typ[t] = 0; half[t] = 0; slope[t] = 0; }
                    if (typ[j * W + i + 1] == 137 || typ[j * W + i - 1] == 137) { act[t] = 0; typ[t] = 0; half[t] = 0; slope[t] = 0; }
                }
            }
        }
    }
    SOLID.Add(137); SOLID.Add(130);                       // cs:18104-05 尾还原
}
Checkpoint("quickcleanup");
StreamPt("quickcleanup");

// ═══════════════════ QQ 批追加区（2026-08-18）：Beehives→Piles→Trees→SettleLiquidsPart2→Cactus ═══════════════════
// 协商约束：YY 独占 dungeon 段——本批全部新代码落在末尾追加区（quickcleanup 之后）。
// ★Beehives 原版注册位 cs:16005（statues 16947 之前），此处受段位约束延后执行：
//   本 oracle 与 JS 链（tests/caves-checkpoint.test.ts 同批扩展）同序推进，链内
//   parity 不受影响；与绝对原版序的网格差（蜂巢挖掘晚于雕像/洞穴墙/快清理）为
//   备案偏差，终局金标窗口统一再生时归位。追加区内保持相对注册序：
//   Beehives(16005) < Piles(18900) < Trees(20085) < SettleLiquidsPart2(21051) <
//   Cactus(21115)；#71-76/78-81/83-96/99-100 等仍跳段（另批）。
// 平台族（tileSolidTop 近似，QuickCleanup 段同款表）
var QQ_PLATFORMS = new HashSet<ushort> { 19, 427, 435, 436, 437, 438, 439 };
bool QQInW(int x, int y) => x >= 0 && y >= 0 && x < W && y < H;

// ---- StructureMap 基础设施（GenState.protectedRects 镜像）----
var protRects = new List<(int x0, int y0, int x1, int y1)>();
// 链内前置唯一登记源 = 微光 pass（cs:15307 的 200×200 pad0，中心=ShimmerMakeBiome 成功落点）
protRects.Add((shimmerXOut - 100, shimmerYOut - 100, shimmerXOut + 100, shimmerYOut + 100));
// TileID.Sets.GeneralPlacementTiles（TileID.cs:311——CreateBoolSet(true,…)：28 项列举即拒放）
var QQ_PLACE_BAD = new HashSet<ushort> { 225, 41, 481, 43, 482, 44, 483, 226, 203, 112, 25, 70, 151, 21, 31, 696, 467, 12, 665, 639, 138, 664, 711, 712, 713, 714, 715, 716 };
bool QQCanPlace(int bx0, int by0, int bx1, int by1, int pad)
{
    if (bx0 < 0 || by0 < 0 || bx1 > W - 1 || by1 > H - 1) return false;
    int px0 = bx0 - pad, py0 = by0 - pad, px1 = bx1 + pad, py1 = by1 + pad;
    foreach (var pr in protRects)
        if (px0 < pr.x1 && pr.x0 < px1 && py0 < pr.y1 && pr.y0 < py1) return false;
    for (int px = px0; px < px1; px++)
        for (int py = py0; py < py1; py++)
        {
            if (!QQInW(px, py)) continue;
            int pi = py * W + px;
            if (act[pi] != 0 && QQ_PLACE_BAD.Contains(typ[pi])) return false;
        }
    return true;
}
void QQAddProt(int bx0, int by0, int bx1, int by1, int pad) => protRects.Add((bx0 - pad, by0 - pad, bx1 + pad, by1 + pad));

// ═════════ Pass 47 Beehives（cs:16005-16058 + HiveBiome.cs + HoneyPatchBiome.cs，HiveSpiderPass.ts 镜像）═════════
Replay(); // ▶pass 头重播：Beehives cs:16005
{
    // Modifiers.IsSolid（=SolidOrSlopedTile：无 half/slope 门；wire inActive 位生成期恒 0）
    bool HvSolidOrSloped(int hx, int hy)
    {
        if (!QQInW(hx, hy)) return false;
        int hi = hy * W + hx;
        return act[hi] != 0 && SOLID.Contains(typ[hi]) && !QQ_PLATFORMS.Contains(typ[hi]);
    }
    // WorldGen.SolidTile 五门（HiveSpiderPass solidTileHB：含 !half/slope==0）
    bool HvSolidTile(int hx, int hy)
    {
        if (!QQInW(hx, hy)) return false;
        int hi = hy * W + hx;
        if (act[hi] == 0) return false;
        return SOLID.Contains(typ[hi]) && !QQ_PLATFORMS.Contains(typ[hi]) && half[hi] == 0 && slope[hi] == 0;
    }
    // CanPoundTile（HalfBrickPass：黑名单+巨石+生成期跳过+上格禁坡+实心非平台非框架物）
    bool HvCanPound(int hx, int hy)
    {
        if (!QQInW(hx, hy)) return false;
        int hi = hy * W + hx;
        if (act[hi] == 0 || typ[hi] == 0) return false;
        ushort t = typ[hi];
        if (NO_POUND_SHEETS.Contains(t) || BOULDERS_G.Contains(t) || POUND_GEN_SKIP.Contains(t)) return false;
        if (hy - 1 >= 0 && act[(hy - 1) * W + hx] != 0 && FORBIDS_SLOPING.Contains(typ[(hy - 1) * W + hx])) return false;
        return SOLID.Contains(t) && !QQ_PLATFORMS.Contains(t) && !FRAMED_ALL.Contains(t);
    }
    void HvPoundTile(int hx, int hy)
    {
        if (!HvCanPound(hx, hy)) return;
        int hi = hy * W + hx;
        half[hi] = (byte)(half[hi] != 0 ? 0 : 1);
        if (half[hi] != 0) slope[hi] = 0;
    }
    void HvSetTile(int hx, int hy, ushort t)   // setTileSilent
    {
        if (!QQInW(hx, hy)) return;
        int hi = hy * W + hx;
        typ[hi] = t; act[hi] = (byte)(t != 0 ? 1 : 0);
        if (t == 0) { half[hi] = 0; slope[hi] = 0; }
    }
    // Shapes.Circle 行主序枚举（(r+1)² 判据）
    void HvCircleRows(int hR, int vR, Action<int, int> fn)
    {
        int rr = (hR + 1) * (hR + 1);
        for (int dy = -vR; dy <= vR; dy++)
        {
            double n2 = (double)hR / vR * dy;
            int half2 = Math.Min(hR, (int)Math.Truncate(Math.Sqrt(rr - n2 * n2)));
            for (int dx = -half2; dx <= half2; dx++) fn(dx, dy);
        }
    }
    // CreateHiveTunnel（HiveBiome.cs:135）：基础半径 12-20，步数每迭代净 -2，三阈值各自独立抖动
    (double, double) HiveTunnel(int sx, int sy)
    {
        int baseR = (int)r.Next(12, 21);
        int num2 = (int)r.Next(10, 21);
        double vx = (int)r.Next(-10, 11) * 0.2, vy = (int)r.Next(-10, 11) * 0.2;
        double px = sx, py = sy;
        while (num2 > 0)
        {
            if (py > H - 250) num2 = 0;
            double rad = baseR * (1 + (int)r.Next(-20, 20) * 0.01);
            int next2 = num2 - 1;
            int x0 = Math.Max(1, (int)Math.Floor(px - rad)), x1 = Math.Min(W - 1, (int)Math.Floor(px + rad));
            int y0 = Math.Max(1, (int)Math.Floor(py - rad)), y1 = Math.Min(H - 1, (int)Math.Floor(py + rad));
            for (int tx = x0; tx < x1; tx++)
            {
                for (int ty = y0; ty < y1; ty++)
                {
                    if (tx < 50 || ty < 50 || tx >= W - 50 || ty >= H - 50) next2 = 0;
                    else
                    {
                        if ((QQInW(tx - 10, ty) && wal[ty * W + tx - 10] == 87)
                            || (QQInW(tx + 10, ty) && wal[ty * W + tx + 10] == 87)
                            || (QQInW(tx, ty - 10) && wal[(ty - 10) * W + tx] == 87)
                            || (QQInW(tx, ty + 10) && wal[(ty + 10) * W + tx] == 87)) next2 = 0;
                        if (ty < worldSurface && QQInW(tx, ty - 5) && wal[(ty - 5) * W + tx] == 0) next2 = 0;
                    }
                    int ti = ty * W + tx;
                    double d2 = Math.Sqrt((tx - px) * (tx - px) + (ty - py) * (ty - py));
                    if (d2 < baseR * 0.4 * (1 + (int)r.Next(-10, 11) * 0.005))
                    {
                        if ((int)r.Next(3) == 0) liq[ti] = 255;
                        liqT[ti] = 2;                       // honey（JS 编码 3 → oracle 2）
                        wal[ti] = 86;
                        act[ti] = 0;                       // active(false) 保留幽灵 type
                    }
                    else if (d2 < baseR * 0.75 * (1 + (int)r.Next(-10, 11) * 0.005))
                    {
                        liq[ti] = 0;
                        if (wal[ti] != 86 && wal[ti] != 244) { typ[ti] = 225; act[ti] = 1; }
                    }
                    if (d2 < baseR * 0.6 * (1 + (int)r.Next(-10, 11) * 0.005)) wal[ti] = 86;
                }
            }
            px += vx; py += vy;
            num2 = next2 - 1;
            vy += (int)r.Next(-10, 11) * 0.05;
            vx += (int)r.Next(-10, 11) * 0.05;
        }
        return (px, py);
    }
    void BlockedHoneyCube(int hx, int hy)
    {
        for (int ix = hx - 1; ix <= hx + 2; ix++)
            for (int iy = hy - 1; iy <= hy + 2; iy++)
            {
                if (!QQInW(ix, iy)) continue;
                int i = iy * W + ix;
                if (ix >= hx && ix <= hx + 1 && iy >= hy && iy <= hy + 1)
                {
                    act[i] = 0;                           // 幽灵 type 保留
                    liq[i] = 255; liqT[i] = 2;
                }
                else { typ[i] = 225; act[i] = 1; }
            }
    }
    void DentForHoneyFall(int hx, int hy, int dirIn)
    {
        int dir = -dirIn;
        hy++;
        int num = 0, cx = hx;
        while ((num < 4 || HvSolidTile(cx, hy)) && cx > 10 && cx < W - 10)
        {
            num++;
            cx += dir;
            if (HvSolidTile(cx, hy))
            {
                HvPoundTile(cx, hy);
                if (QQInW(cx, hy + 1) && act[(hy + 1) * W + cx] == 0) { typ[(hy + 1) * W + cx] = 225; act[(hy + 1) * W + cx] = 1; }
            }
        }
    }
    // HoneyPatchBiome.Place（cs:8-48）——★data 用有序 List+Contains 保 JS Set 插入序
    bool PlaceHoneyPatch(int ox, int oy)
    {
        if (QQInW(ox, oy) && act[oy * W + ox] != 0 && HvSolidTile(ox, oy)) return false;   // 锚点实心拒
        int ry = -1;
        bool CondSolid(int px, int py)
        {
            if (px < 10 || py < 10 || px >= W - 10 || py >= H - 10) return false;
            return act[py * W + px] != 0 && SOLID.Contains(typ[py * W + px]);
        }
        for (int k = 0; k < 80 && oy + k < H; k++)
            if (CondSolid(ox, oy + k)) { ry = oy + k; break; }
        if (ry < 0) return false;
        ry += 2;
        int rx = ox;
        int solid = 0, mudOrGrass = 0, grass = 0;
        HvCircleRows(15, 15, (dx, dy) =>
        {
            if (!QQInW(rx + dx, ry + dy)) return;
            if (!HvSolidOrSloped(rx + dx, ry + dy)) return;
            solid++;
            if (typ[(ry + dy) * W + rx + dx] == 60 || typ[(ry + dy) * W + rx + dx] == 59) mudOrGrass++;
            if (typ[(ry + dy) * W + rx + dx] == 60) grass++;
        });
        if (solid == 0 || (double)mudOrGrass / solid < 0.75 || grass < 2) return false;
        int solid8 = 0;
        HvCircleRows(8, 8, (dx, dy) => { if (HvSolidOrSloped(rx + dx, ry + dy)) solid8++; });
        if (solid8 < 20) return false;
        if (!QQCanPlace(rx - 8, ry - 8, rx + 8, ry + 8, 0)) return false;
        if (ry >= H - 200 - 30) return false;             // UnderworldLayer-30（h-200 恒值）
        bool tooClose = false;
        for (int i2 = rx - 150; i2 < rx + 150; i2 += 10)
        {
            if (i2 <= 0 || i2 > W - 1) continue;
            for (int j2 = ry - 150; j2 < ry + 150; j2 += 10)
            {
                if (j2 <= 0 || j2 > H - 1) continue;
                int ii = j2 * W + i2;
                if (act[ii] != 0 && typ[ii] == 226) tooClose = true;
                if (wal[ii] == 83 || wal[ii] == 3 || wal[ii] == 87) tooClose = true;
                if (tooClose) return false;
            }
        }
        // 圆 8 RadialDither(0,10) + IsSolid → SetTile(229)（每点 1 掷先于判定）
        HvCircleRows(8, 8, (dx, dy) =>
        {
            double n2 = Math.Max(0.0, Math.Min(1.0, Math.Sqrt(dx * dx + dy * dy) / 10.0));
            if (r.NextDouble() > n2 && HvSolidOrSloped(rx + dx, ry + dy))
            {
                int i = (ry + dy) * W + rx + dx;
                typ[i] = 229; act[i] = 1; wal[i] = 0; liq[i] = 0; liqT[i] = 0; slope[i] = 0; half[i] = 0;
            }
        });
        // 圆(4,3) Blotches(2,0.3) + IsSolid + ClearTile + 掩码 [-6,6]×[0,3] 灌蜜
        long HKey(int qx, int qy) => ((long)qx + 16) * 64 + (qy + 16);
        var data = new List<long>();
        HvCircleRows(4, 3, (dx, dy) =>
        {
            r.NextDouble();                               // Blotches 首掷丢弃
            var pts = new List<(int, int)>();
            if (r.NextDouble() < 0.3)
            {
                int bx0 = (int)r.Next(-1, 1), bx1 = (int)r.Next(0, 2);
                int by0 = (int)r.Next(-1, 1), by1 = (int)r.Next(0, 2);
                for (int bi = bx0; bi <= bx1; bi++) for (int bj = by0; bj <= by1; bj++) pts.Add((dx + bi, dy + bj));
            }
            else pts.Add((dx, dy));
            foreach (var (qx, qy) in pts)
            {
                if (!HvSolidOrSloped(rx + qx, ry + qy)) continue;
                int i = (ry + qy) * W + rx + qx;
                act[i] = 0; slope[i] = 0; half[i] = 0;     // ClearTile（幽灵 type 留）
                if (qx >= -6 && qx <= 6 && qy >= 0 && qy <= 3)
                {
                    long k2 = HKey(qx, qy);
                    if (!data.Contains(k2)) data.Add(k2);
                    liq[i] = 255; liqT[i] = 2;
                }
            }
        });
        // InnerOutline(data)@origin+(0,1) + IsEmpty + 掩码 [-6,6]×[1,3] → 泥 59
        int[] NE8 = { 1, 0, -1, 0, 0, 1, 0, -1, 1, 1, 1, -1, -1, 1, -1, -1 };
        foreach (var k2 in data)
        {
            int qx = (int)(k2 / 64) - 16, qy = (int)(k2 % 64) - 16;
            bool edge = false;
            for (int n2i = 0; n2i < 16; n2i += 2)
                if (!data.Contains(HKey(qx + NE8[n2i], qy + NE8[n2i + 1]))) { edge = true; break; }
            if (!edge) continue;
            int px = rx + qx, py = ry + 1 + qy;
            if (!QQInW(px, py)) continue;
            int i = py * W + px;
            if (act[i] != 0) continue;                    // IsEmpty
            if (qx < -6 || qx > 6 || qy < 1 || qy > 3) continue;
            typ[i] = 59; act[i] = 1; wal[i] = 0; liq[i] = 0; liqT[i] = 0; slope[i] = 0; half[i] = 0;
        }
        // All(data)@origin + Expand(1) + IsBelowHeight(含锚行) + IsNotSolid + NoLiquid(蜜) → 蜂壳 229
        foreach (var k2 in data)
        {
            int qx = (int)(k2 / 64) - 16, qy = (int)(k2 % 64) - 16;
            for (int ex = -1; ex <= 1; ex++)
                for (int ey = -1; ey <= 1; ey++)
                {
                    int px = rx + qx + ex, py = ry + qy + ey;
                    if (!QQInW(px, py) || py < ry) continue;
                    int i = py * W + px;
                    if (HvSolidOrSloped(px, py)) continue;
                    if (liq[i] > 0 && liqT[i] == 2) continue;
                    typ[i] = 229; act[i] = 1; wal[i] = 0; liq[i] = 0; liqT[i] = 0; slope[i] = 0; half[i] = 0;
                }
        }
        QQAddProt(rx - 8, ry - 8, rx + 8, ry + 8, 0);
        return true;
    }
    // ---- pass 主体（cs:16005-16058 驱动环）----
    double sc = (double)W / 4200.0;
    int count = 1 + (int)r.Next((int)(5.0 * sc), (int)(8.0 * sc));
    int yMin = (int)Math.Floor((worldSurface + rockLayer) / 2.0);
    int placed = 0, budget10000 = 10000;
    while (placed < count && budget10000 > 0)
    {
        budget10000--;
        int x = (int)r.Next(20, W - 20);
        int y = (int)r.Next(yMin, H - 300);
        if (!QQInW(x, y)) continue;                        // RandomWorldPoint(top,right,bottom,left)
        if (!QQCanPlace(x - 50, y - 50, x + 50, y + 50, 0)) continue;
        bool tooClose = false;
        for (int ti = x - 150; ti < x + 150 && !tooClose; ti += 10)
        {
            if (ti <= 0 || ti > W - 1) continue;
            for (int tj = y - 150; tj < y + 150; tj += 10)
            {
                if (tj <= 0 || tj > H - 1) continue;
                int tii = tj * W + ti;
                if ((act[tii] != 0 && typ[tii] == 226) || wal[tii] == 83 || wal[tii] == 3 || wal[tii] == 87) { tooClose = true; break; }
            }
        }
        if (tooClose) continue;
        int solid = 0, mudOrGrass = 0, grass = 0;
        int crr = 256;
        for (int dy = -15; dy <= 15; dy++)
        {
            int halfW = Math.Min(15, (int)Math.Truncate(Math.Sqrt(crr - dy * dy)));
            for (int dx = -halfW; dx <= halfW; dx++)
            {
                if (!QQInW(x + dx, y + dy)) continue;
                if (!HvSolidOrSloped(x + dx, y + dy)) continue;
                solid++;
                int i = (y + dy) * W + x + dx;
                if (typ[i] == 60 || typ[i] == 59) mudOrGrass++;
                if (typ[i] == 60) grass++;
            }
        }
        if (solid == 0 || (double)mudOrGrass / solid < 0.75 || grass < 2) continue;
        // 隧道链：2-4 段；每段 2-4 条全部从段起点出发，段位置=最后一条终点
        double px2 = x, py2 = y;
        var segEnds = new List<(int, int)>();
        int segs = (int)r.Next(2, 5);
        for (int seg = 0; seg < segs; seg++)
        {
            int tunnels = (int)r.Next(2, 5);
            double ex2 = px2, ey2 = py2;
            for (int t = 0; t < tunnels; t++)
            {
                (ex2, ey2) = HiveTunnel((int)Math.Floor(px2), (int)Math.Floor(py2));
            }
            px2 = ex2; py2 = ey2;
            segEnds.Add(((int)Math.Floor(px2), (int)Math.Floor(py2)));
        }
        // FrameOutAllHiveContents（HiveBiome.cs:128-146）：±50 钳 [10,max-10) 行主序——wall 86 每格掷 Next(3)
        {
            int fx0 = Math.Max(10, x - 50), fx1 = Math.Min(W - 10, x + 50);
            int fy0 = Math.Max(10, y - 50), fy1 = Math.Min(H - 10, y + 50);
            for (int ix = fx0; ix < fx1; ix++)
                for (int iy = fy0; iy < fy1; iy++)
                    if (wal[iy * W + ix] == 86) r.Next(3);
        }
        // 蜂蜜坠落块：每个段终点 2×2 实心处放封蜜块+凹槽
        foreach (var (ex2, ey2) in segEnds)
        {
            int dir = (int)r.Next(2) == 0 ? -1 : 1;
            int hx = ex2, guard = 0;
            while (guard++ < 60 && Math.Abs(hx - ex2) <= 50
                && !(act[ey2 * W + hx] != 0 && act[(ey2 + 1) * W + hx] != 0
                    && act[ey2 * W + hx + 1] != 0 && act[(ey2 + 1) * W + hx + 1] != 0))
                hx += dir;
            if (Math.Abs(hx - ex2) > 50) continue;
            int x2 = hx + dir;
            bool notInHive = false;
            for (int ix = x2 - 1; ix <= x2 + 2 && !notInHive; ix++)
            {
                for (int iy = ey2 - 1; iy <= ey2 + 2; iy++)
                {
                    if (ix < 10 || ix > W - 10) { notInHive = true; break; }
                    if (act[iy * W + ix] != 0 && typ[iy * W + ix] != 225) { notInHive = true; break; }
                }
            }
            if (!notInHive) { BlockedHoneyCube(x2, ey2); DentForHoneyFall(x2, ey2, dir); }
        }
        // 幼虫托台（CreateStandForLarva：清空 3 列×3 行 + 底行铺 225；幼虫 231 由 BeeLarva pass 放）
        int lx = (int)Math.Floor(px2), ly = (int)Math.Floor(py2);
        for (int ix = lx - 1; ix <= lx + 1 && ix > 0 && ix < W; ix++)
            for (int iy = ly - 2; iy <= ly + 1 && iy > 0 && iy < H; iy++)
            {
                int ii = iy * W + ix;
                if (iy != ly + 1) act[ii] = 0;
                else { typ[ii] = 225; act[ii] = 1; slope[ii] = 0; half[ii] = 0; }
            }
        QQAddProt(x - 50, y - 50, x + 50, y + 50, 5);
        // 蜂蜜斑（HoneyPatchBiome）：目标数 Next(5)、预算 10000
        int patches = (int)r.Next(5);
        int done = 0, budgetP = 10000;
        while (done < patches && budgetP > 0)
        {
            double rad = r.NextDouble() * 60.0 + 30.0;
            double ang = r.NextDouble() * 6.2831854820251465;
            int hx = (int)Math.Truncate(Math.Cos(ang) * rad) + x;
            int hy = (int)Math.Truncate(Math.Sin(ang) * rad) + y;
            budgetP--;
            bool patched = hx > 50 && hx < W - 50 && PlaceHoneyPatch(hx, hy);
            if (patched) done++;
        }
        placed++;
    }
}
Checkpoint("beehives");
StreamPt("beehives");
// ═════════ Pass 77 Piles（cs:18900-19599 七子段，PilesPass.ts 镜像）═════════
Replay(); // ▶pass 头重播：Piles cs:18900
{
    // pass 头 tileSolid 翻转（cs:18906-18916）：379/229/190/196/189/717-719/202/460/484 → 非实心
    foreach (var f in new ushort[] { 379, 229, 190, 196, 189, 717, 718, 719, 202, 460, 484 }) SOLID.Remove(f);
    int ws = worldSurface;
    var TILE_MOSS_P = new HashSet<ushort> { 182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627 };
    var WALL_DUNGEON_P = new HashSet<ushort> { 7, 8, 9, 94, 95, 96, 97, 98, 99 };
    var TILE_DUNGEON_P = new HashSet<ushort> { 41, 43, 44, 677, 678, 679 };
    var BOULDERS_P = new HashSet<ushort> { 138, 484, 664, 665, 711, 712, 713, 714, 715, 716 };
    bool ActAt(int ax, int ay) => QQInW(ax, ay) && act[ay * W + ax] != 0;
    int SheetAt(int ax, int ay) => QQInW(ax, ay) && act[ay * W + ax] != 0 ? typ[ay * W + ax] : -1;
    // SolidTile2（cs:46862）：active && tileSolid && slope==0 && !half（GenSolid 覆写生效=SOLID 现值）
    bool SolidTile2(int ax, int ay)
    {
        if (!QQInW(ax, ay)) return false;
        int i = ay * W + ax;
        return act[i] != 0 && SOLID.Contains(typ[i]) && slope[i] == 0 && half[i] == 0;
    }
    // SolidTileAllowBottomSlope（cs:70211）：active && (solid||platform) && !half && 非顶坡(1/2)
    bool SolidAllowBottom(int ax, int ay)
    {
        if (!QQInW(ax, ay)) return false;
        int i = ay * W + ax;
        if (act[i] == 0) return false;
        return (SOLID.Contains(typ[i]) || QQ_PLATFORMS.Contains(typ[i])) && half[i] == 0 && slope[i] != 1 && slope[i] != 2;
    }
    void SetTS(int ax, int ay, ushort t, int fx, int fy2)
    {
        if (!QQInW(ax, ay)) return;
        int i = ay * W + ax;
        typ[i] = t; act[i] = 1; frX[i] = (ushort)fx; frY[i] = (ushort)fy2;
    }
    bool PlaceSmallPile(int ax, int ay, int pileStyle, int pileSize)
    {
        if (!QQInW(ax, ay)) return false;
        int i = ay * W + ax;
        if (liq[i] > 0 && liqT[i] == 1) return false;      // anyLava 拒绝
        if (pileSize == 1)
        {
            if (!SolidTile2(ax, ay + 1) || !SolidTile2(ax + 1, ay + 1)) return false;
            if (ActAt(ax, ay) || ActAt(ax + 1, ay)) return false;
            if (BOULDERS_P.Contains((ushort)SheetAt(ax, ay + 1)) || BOULDERS_P.Contains((ushort)SheetAt(ax + 1, ay + 1))) return false;
            SetTS(ax, ay, 185, pileStyle * 36, 18);
            SetTS(ax + 1, ay, 185, pileStyle * 36 + 18, 18);
            return true;
        }
        if (!SolidTile2(ax, ay + 1) || ActAt(ax, ay)) return false;
        SetTS(ax, ay, 185, pileStyle * 18, 0);
        return true;
    }
    bool PlacePile3x2(int ax, int ay, ushort type, int style)
    {
        for (int k = 0; k < 3; k++)
        {
            for (int l = -1; l <= 0; l++)
                if (!QQInW(ax + k, ay + l) || act[(ay + l) * W + ax + k] != 0) return false;
            if (!SolidAllowBottom(ax + k, ay + 1)) return false;
        }
        for (int k = 0; k < 3; k++)
            for (int l = -1; l <= 0; l++)
                SetTS(ax + k, ay + l, type, style * 54 + k * 18, (l + 1) * 18);
        return true;
    }
    int Attempts() => W / 2;                               // GetPileGenerationAttempts（cs:23873）
    bool OceanAt(int ax, int ay) => !(ay > (worldSurface + rockLayer) / 2.0 + 40) && (ax < BEACH_DISTANCE || ax > W - BEACH_DISTANCE);
    bool ShimmerAt(int ax, int ay) => QQInW(ax, ay) && liq[ay * W + ax] > 0 && liqT[ay * W + ax] == 3;
    int DropTo(int ax, int ay)
    {
        int j = ay;
        while (!ActAt(ax, j + 1) && j < H - 5) j++;
        return j;
    }
    void Scatter(int ax, int ay)
    {
        int n = (int)r.Next(1, 5);
        for (int k = 0; k < n; k++)
        {
            int sx = ax + (int)r.Next(-10, 11);
            int sy0 = ay - (int)r.Next(5);
            if (!ActAt(sx, sy0))
            {
                int sy = DropTo(sx, sy0);
                PlaceSmallPile(sx, sy, (int)r.Next(12, 36), 0);
            }
        }
    }
    ushort Pick(int type) => type == 186 ? (ushort)186 : (ushort)187;
    // ===== ① 洞穴堆（cs:18924-19044）：w*0.06 =====
    for (double i0 = 0; i0 < W * 0.06; i0++)
    {
        int budget = Attempts(); bool flag = false;
        while (!flag && budget > 0)
        {
            budget--;
            int x = (int)r.Next(25, W - 25);
            int y = (int)r.Next(ws, H - 300);
            while (OceanAt(x, y)) { x = (int)r.Next(25, W - 25); y = (int)r.Next(ws, H - 300); }
            if (!ActAt(x, y))
            {
                int type = 186;
                y = DropTo(x, y);
                ushort wall = wal[y * W + x];
                int below = SheetAt(x, y + 1);
                if (below >= 0)
                {
                    int style = (int)r.Next(22);
                    if (style >= 16 && style <= 22) style = (int)r.Next(22);
                    if ((below == 0 || below == 1 || TILE_MOSS_P.Contains((ushort)below)) && (int)r.Next(5) == 0)
                    {
                        style = (int)r.Next(23, 29); type = 187;
                    }
                    if (y > H - 300 || WALL_DUNGEON_P.Contains(wall) || below == 30 || below == 19 || below == 25 || below == 203)
                    {
                        style = (int)r.Next(7); type = 186;
                    }
                    if (below == 147 || below == 161 || below == 162) { style = (int)r.Next(26, 32); type = 186; }
                    if (below == 60) { type = 187; style = (int)r.Next(6); }
                    if ((below == 57 || below == 58) && (int)r.Next(3) < 2) { type = 187; style = (int)r.Next(6, 9); }
                    if (below == 226) { type = 187; style = (int)r.Next(18, 23); }
                    if (below == 70) { style = (int)r.Next(32, 35); type = 186; }
                    if (below == 396 || below == 397 || below == 404) { style = (int)r.Next(29, 35); type = 187; }
                    if (below == 368) { style = (int)r.Next(35, 41); type = 187; }
                    if (below == 367) { style = (int)r.Next(41, 47); type = 187; }
                    if (type == 186 && style >= 7 && style <= 15 && (int)r.Next(75) == 0) { type = 187; style = 17; }
                    if (WALL_DUNGEON_P.Contains(wall) && (int)r.Next(3) != 0) flag = true;
                    else
                    {
                        bool placedQ = !ShimmerAt(x, y) && PlacePile3x2(x, y, Pick(type), style);
                        if (placedQ) flag = true;
                        if (flag && type == 186 && style <= 7) Scatter(x, y);
                    }
                }
            }
        }
    }
    // ===== ② 深层堆（cs:19049-19116）：w*0.01，y∈[h-300,h-10) =====
    for (double i0 = 0; i0 < W * 0.01; i0++)
    {
        int budget = Attempts(); bool flag = false;
        while (!flag && budget > 0)
        {
            budget--;
            int x = (int)r.Next(25, W - 25);
            int y = (int)r.Next(H - 300, H - 10);
            if (!ActAt(x, y))
            {
                int type = 186;
                y = DropTo(x, y);
                ushort wall = wal[y * W + x];
                int below = SheetAt(x, y + 1);
                if (below >= 0)
                {
                    int style = (int)r.Next(22);
                    if (style >= 16 && style <= 22) style = (int)r.Next(22);
                    if (y > H - 300 || WALL_DUNGEON_P.Contains(wall) || below == 30 || below == 19) style = (int)r.Next(7);
                    if ((below == 57 || below == 58) && (int)r.Next(3) < 2) { type = 187; style = (int)r.Next(6, 9); }
                    if (below == 147 || below == 161 || below == 162) style = (int)r.Next(26, 32);
                    bool placedQ = PlacePile3x2(x, y, Pick(type), style);
                    if (placedQ) flag = true;
                    if (flag && type == 186 && style <= 7) Scatter(x, y);
                }
            }
        }
    }
    // ===== ③ 地表堆（cs:19118-19182）：w*0.03 =====
    for (double i0 = 0; i0 < W * 0.03; i0++)
    {
        int budget = Attempts(); bool flag = false;
        while (!flag && budget > 0)
        {
            budget--;
            int type = 186;
            int x = (int)r.Next(25, W - 25);
            int y = (int)r.Next(10, ws);
            while (OceanAt(x, y)) { x = (int)r.Next(25, W - 25); y = (int)r.Next(10, ws); }
            if (!ActAt(x, y))
            {
                y = DropTo(x, y);
                ushort wall = wal[y * W + x];
                int below = SheetAt(x, y + 1);
                if (below >= 0)
                {
                    int style = (int)r.Next(7, 13);
                    if (y > H - 300 || WALL_DUNGEON_P.Contains(wall) || below == 30 || below == 19
                        || below == 25 || below == 204 || below == 234 || below == 112
                        || TILE_DUNGEON_P.Contains((ushort)below)) style = -1;
                    if (below == 147 || below == 161 || below == 162) style = (int)r.Next(26, 32);
                    if (below == 53) { type = 187; style = (int)r.Next(52, 55); }
                    if (below == 2 || (ActAt(x - 1, y + 1) && SheetAt(x - 1, y + 1) == 2)
                        || (ActAt(x + 1, y + 1) && SheetAt(x + 1, y + 1) == 2)) { type = 187; style = (int)r.Next(14, 17); }
                    if (below == 151 || below == 274) { type = 186; style = (int)r.Next(7); }
                    bool placedQ = style >= 0 && PlacePile3x2(x, y, Pick(type), style);
                    if (placedQ) flag = true;
                }
            }
        }
    }
    // ===== ④ 地表带墙堆（cs:19184-19259）：w*0.0035，起始格须有墙 =====
    for (double i0 = 0; i0 < W * 0.0035; i0++)
    {
        int budget = Attempts(); bool flag = false;
        while (!flag && budget > 0)
        {
            budget--;
            int type = 186;
            int x = (int)r.Next(25, W - 25);
            int y = (int)r.Next(10, ws);
            if (!ActAt(x, y) && wal[y * W + x] > 0)
            {
                y = DropTo(x, y);
                ushort wall = wal[y * W + x];
                int below = SheetAt(x, y + 1);
                if (below >= 0)
                {
                    int style = (int)r.Next(7, 13);
                    if (y > H - 300 || WALL_DUNGEON_P.Contains(wall) || below == 30 || below == 19
                        || TILE_DUNGEON_P.Contains((ushort)below)) style = -1;
                    if (below == 25) style = (int)r.Next(7);
                    if (below == 147 || below == 161 || below == 162) style = (int)r.Next(26, 32);
                    if (below == 2 || (ActAt(x - 1, y + 1) && SheetAt(x - 1, y + 1) == 2)
                        || (ActAt(x + 1, y + 1) && SheetAt(x + 1, y + 1) == 2)) { type = 187; style = (int)r.Next(14, 17); }
                    if (below == 151 || below == 274) { type = 186; style = (int)r.Next(7); }
                    bool placedQ = style >= 0 && PlacePile3x2(x, y, Pick(type), style);
                    if (placedQ) flag = true;
                    if (flag && style <= 7) Scatter(x, y);
                }
            }
        }
    }
    // ===== ⑤ 全洞穴 185 小堆（cs:19261-19409）：w*0.6 =====
    for (double i0 = 0; i0 < W * 0.6; i0++)
    {
        int budget = Attempts(); bool flag = false;
        while (!flag && budget > 0)
        {
            budget--;
            int x = (int)r.Next(25, W - 25);
            int y = (int)r.Next(ws, H - 20);
            if (wal[y * W + x] == 87 && (int)r.Next(2) == 0)
            {
                x = (int)r.Next(25, W - 25);
                y = (int)r.Next(ws, H - 20);
            }
            while (OceanAt(x, y)) { x = (int)r.Next(25, W - 25); y = (int)r.Next(ws, H - 20); }
            if (!ActAt(x, y))
            {
                y = DropTo(x, y);
                ushort wall = wal[y * W + x];
                int below = SheetAt(x, y + 1);
                if (below >= 0)
                {
                    int size = (int)r.Next(2);
                    int style = (int)r.Next(36);
                    if (style >= 28 && style <= 35) style = (int)r.Next(36);
                    if (size == 1)
                    {
                        style = (int)r.Next(25);
                        if (style >= 16 && style <= 24) style = (int)r.Next(25);
                    }
                    if (y > H - 300)
                    {
                        if (size == 0) style = (int)r.Next(12, 28);
                        if (size == 1) style = (int)r.Next(6, 16);
                    }
                    if (WALL_DUNGEON_P.Contains(wall) || wall == 87 || below == 30 || below == 19 || below == 25 || below == 203)
                    {
                        if (size == 0 && style < 12) style += 12;
                        if (size == 1 && style < 6) style += 6;
                        if (size == 1 && style >= 17) style -= 10;
                    }
                    if (below == 147 || below == 161 || below == 162)
                    {
                        if (size == 0 && style < 12) style += 36;
                        if (size == 1 && style >= 20) style += 6;
                        if (size == 1 && style < 6) style += 25;
                    }
                    if (liq[y * W + x] <= 0 && (below == 53 || below == 397 || below == 396))
                    {
                        if (size == 0) style = (int)r.Next(73, 78);
                        if (size == 1) style = (int)r.Next(62, 65);
                    }
                    if (below == 151 || below == 274)
                    {
                        if (size == 0) style = (int)r.Next(12, 28);
                        if (size == 1) style = (int)r.Next(12, 19);
                    }
                    if (below == 368)
                    {
                        if (size == 0) style = (int)r.Next(60, 66);
                        if (size == 1) style = (int)r.Next(47, 53);
                    }
                    if (below == 367)
                    {
                        if (size == 0) style = (int)r.Next(66, 72);
                        if (size == 1) style = (int)r.Next(53, 59);
                    }
                    if (TILE_DUNGEON_P.Contains((ushort)below)) flag = false;
                    else if (WALL_DUNGEON_P.Contains(wall) && (int)r.Next(3) != 0) flag = true;
                    else if (!ShimmerAt(x, y)) flag = PlaceSmallPile(x, y, style, size);
                    if (flag && size == 1 && style >= 6 && style <= 15) Scatter(x, y);
                }
            }
        }
    }
    // ===== ⑥ 地表 185 小堆（cs:19411-19470）：w*0.02 =====
    for (double i0 = 0; i0 < W * 0.02; i0++)
    {
        int budget = Attempts(); bool flag = false;
        while (!flag && budget > 0)
        {
            budget--;
            int x = (int)r.Next(25, W - 25);
            int y = (int)r.Next(15, ws);
            while (OceanAt(x, y)) { x = (int)r.Next(25, W - 25); y = (int)r.Next(15, ws); }
            if (!ActAt(x, y))
            {
                y = DropTo(x, y);
                ushort wall = wal[y * W + x];
                int below = SheetAt(x, y + 1);
                if (below >= 0)
                {
                    int size = (int)r.Next(2);
                    int style = (int)r.Next(11);
                    if (size == 1) style = (int)r.Next(5);
                    if (below == 147 || below == 161 || below == 162)
                    {
                        if (size == 0 && style < 12) style += 36;
                        if (size == 1 && style >= 20) style += 6;
                        if (size == 1 && style < 6) style += 25;
                    }
                    if (liq[y * W + x] <= 0 && (below == 53 || below == 397 || below == 396))
                    {
                        if (size == 0) style = (int)r.Next(73, 77);
                        if (size == 1) style = (int)r.Next(62, 65);
                    }
                    if (below == 2 && size == 1) style = (int)r.Next(38, 41);
                    if (below == 151 || below == 274)
                    {
                        if (size == 0) style = (int)r.Next(12, 28);
                        if (size == 1) style = (int)r.Next(12, 19);
                    }
                    bool bad = WALL_DUNGEON_P.Contains(wall) || below == 30 || below == 19 || below == 41
                        || below == 43 || below == 44 || below == 481 || below == 482 || below == 483
                        || below == 45 || below == 46 || below == 47 || below == 175 || below == 176
                        || below == 177 || below == 25 || below == 203 || TILE_DUNGEON_P.Contains((ushort)below);
                    if (!bad) flag = PlaceSmallPile(x, y, style, size);
                }
            }
        }
    }
    // ===== ⑦ 地表墙 2/40 小堆（cs:19472-19566）：w*0.15 =====
    for (double i0 = 0; i0 < W * 0.15; i0++)
    {
        int budget = Attempts(); bool flag = false;
        while (!flag && budget > 0)
        {
            budget--;
            int x = (int)r.Next(25, W - 25);
            int y = (int)r.Next(15, ws);
            if (!ActAt(x, y) && (wal[y * W + x] == 2 || wal[y * W + x] == 40))
            {
                y = DropTo(x, y);
                ushort wall = wal[y * W + x];
                int below = SheetAt(x, y + 1);
                if (below >= 0)
                {
                    int size = (int)r.Next(2);
                    int style = (int)r.Next(11);
                    if (size == 1) style = (int)r.Next(5);
                    if (below == 147 || below == 161 || below == 162)
                    {
                        if (size == 0 && style < 12) style += 36;
                        if (size == 1 && style >= 20) style += 6;
                        if (size == 1 && style < 6) style += 25;
                    }
                    if (liq[y * W + x] <= 0 && (below == 53 || below == 397 || below == 396))
                    {
                        if (size == 0) style = (int)r.Next(73, 77);
                        if (size == 1) style = (int)r.Next(62, 65);
                    }
                    if (below == 2 && size == 1) style = (int)r.Next(38, 41);
                    if (below == 151 || below == 274)
                    {
                        if (size == 0) style = (int)r.Next(12, 28);
                        if (size == 1) style = (int)r.Next(12, 19);
                    }
                    bool special = liq[y * W + x] == 255 && below == 53 && wall == 0;
                    bool bad = !special && (WALL_DUNGEON_P.Contains(wall) || below == 30 || below == 19
                        || below == 41 || below == 43 || below == 44 || below == 481 || below == 482
                        || below == 483 || below == 45 || below == 46 || below == 47 || below == 175
                        || below == 176 || below == 177 || below == 25 || below == 203 || TILE_DUNGEON_P.Contains((ushort)below));
                    if (!bad) flag = PlaceSmallPile(x, y, style, size);
                }
            }
        }
    }
    // pass 尾 tileSolid 还原族（cs:19591-19602）：229/484 不在还原列
    foreach (var f in new ushort[] { 190, 192, 196, 189, 717, 718, 719, 202, 225, 460, 379 }) SOLID.Add(f);
}
Checkpoint("piles");
StreamPt("piles");
// ═════════ Pass 82 Trees（cs:20085-20108 + AddTrees:31523-31578 + GrowTree/EpicTree/PalmTree/VanityTree，TreePass.ts 镜像）═════════
Replay(); // ▶pass 头重播：Trees cs:20085
{
    // IsTileTypeFitForTree（cs:29852 草族 12 种）——= 头部 TREE_FIT 表
    var PALM_GROUND_T = new HashSet<ushort> { 53, 234, 116, 112 };
    var COMMON_SAPLING_T = new HashSet<ushort> { 20, 590, 595, 615 };
    var VANITY_GROUND_T = new HashSet<ushort> { 2, 109, 477, 492 };
    var EPIC_FAMILY_T = new HashSet<ushort> { 2, 23, 60, 109 };
    void SetTS(int ax, int ay, ushort t, int fx, int fy2)   // setTileSilent（type!=0 不清 half/slope）
    {
        if (!QQInW(ax, ay)) return;
        int i = ay * W + ax;
        typ[i] = t; act[i] = (byte)(t != 0 ? 1 : 0);
        if (t == 0) { half[i] = 0; slope[i] = 0; }
        frX[i] = (ushort)fx; frY[i] = (ushort)fy2;
    }
    // EmptyTileCheck（cs:31611-31683）：ignoreID=-1 任何活性格 false；20 族=sapling∪装饰容忍
    bool EmptyTileCheckT(int x0, int x1, int y0, int y1, int ignoreVan)
    {
        if (x0 < 0 || x1 >= W || y0 < 0 || y1 >= H) return false;
        bool saplingMode = ignoreVan != -1 && COMMON_SAPLING_T.Contains((ushort)ignoreVan);
        for (int x = x0; x <= x1; x++)
            for (int y = y0; y <= y1; y++)
            {
                int i = y * W + x;
                if (act[i] == 0) continue;
                ushort t = typ[i];
                if (ignoreVan == -1) return false;
                if (ignoreVan == 11 || ignoreVan == 71) { if (t != 11 && t != 71) return false; continue; }
                if (saplingMode)
                {
                    if (COMMON_SAPLING_T.Contains(t)) continue;
                    if (EMPTY_ALLOW.Contains(t)) continue;
                    return false;
                }
            }
        return true;
    }
    // 干身帧表（TRUNK，L14213-14425）——帧不入哈希（棕榈域 529/530 帧另有消费，干身帧无消费方）
    void GrowTrunkT(int i, int index1, int height, ushort treeTile)
    {
        bool flagL = false, flagR = false;
        for (int y = index1 - height; y < index1; y++)
        {
            int num4 = (int)r.Next(3);                     // 干身变体（先掷）
            int num5 = (int)r.Next(10);                    // 枝型（后掷）
            if (y == index1 - 1 || y == index1 - height) num5 = 0;
            while (((num5 == 5 || num5 == 7) && flagL) || ((num5 == 6 || num5 == 7) && flagR)) num5 = (int)r.Next(10);
            flagL = false; flagR = false;
            if (num5 == 5 || num5 == 7) flagL = true;
            if (num5 == 6 || num5 == 7) flagR = true;
            SetTS(i, y, treeTile, 0, 0);                   // 帧值不消费（见上注）
            if (num5 == 5 || num5 == 7)
            {
                int k = (int)r.Next(3);
                int f2 = (int)r.Next(3);                   // <2 判定（帧不入哈希，骰照掷）
                SetTS(i - 1, y, treeTile, 0, 0);
            }
            if (num5 == 6 || num5 == 7)
            {
                int k = (int)r.Next(3);
                int f2 = (int)r.Next(3);
                SetTS(i + 1, y, treeTile, 0, 0);
            }
        }
        // 基座方向 num6：两侧整砖+适树适配翻转
        bool FitSide(int dx) => QQInW(i + dx, index1) && act[index1 * W + i + dx] != 0
            && half[index1 * W + i + dx] == 0 && slope[index1 * W + i + dx] == 0
            && TREE_FIT.Contains(typ[index1 * W + i + dx]);
        int num7 = (int)r.Next(3);
        bool sideL = FitSide(-1), sideR = FitSide(1);
        if (!sideL) { if (num7 == 0) num7 = 2; else if (num7 == 1) num7 = 3; }
        if (!sideR) { if (num7 == 0) num7 = 1; else if (num7 == 2) num7 = 3; }
        if (sideL && !sideR) num7 = 2;
        if (sideR && !sideL) num7 = 1;
        if (num7 == 0 || num7 == 1) { int k2 = (int)r.Next(3); SetTS(i + 1, index1 - 1, treeTile, 22, 132 + k2 * 22); }
        if (num7 == 0 || num7 == 2) { int k2 = (int)r.Next(3); SetTS(i - 1, index1 - 1, treeTile, 44, 132 + k2 * 22); }
        int baseFx = num7 == 0 ? 88 : num7 == 1 ? 0 : num7 == 2 ? 66 : -1;
        int k8 = (int)r.Next(3);                           // 基座骰无条件掷（num7==3 无帧写）
        if (baseFx >= 0) SetTS(i, index1 - 1, treeTile, baseFx, 132 + k8 * 22);
        int crownFx = (int)r.Next(13) != 0 ? 22 : 0;
        int crownK = (int)r.Next(3);
        SetTS(i, index1 - height, treeTile, crownFx, 198 + crownK * 22);
    }
    // GrowTree（cs:29924-30395）常规树：height=Next(5,17)，丛林草净空 +5
    bool GrowTreeT(int i, int y)
    {
        int index1 = y;
        while (QQInW(i, index1) && act[index1 * W + i] != 0 && typ[index1 * W + i] == 20) index1++;
        if (!QQInW(i, index1) || index1 < 1) return false;
        int gi = index1 * W + i;
        if (liq[(index1 - 1) * W + i - 1] > 0 || liq[(index1 - 1) * W + i] > 0 || liq[(index1 - 1) * W + i + 1] > 0) return false;
        if (act[gi] == 0 || half[gi] != 0 || slope[gi] != 0 || !TREE_FIT.Contains(typ[gi])) return false;
        if (!TREE_WALLS.Contains(wal[(index1 - 1) * W + i])) return false;
        bool FitSide(int dx) => QQInW(i + dx, index1) && act[index1 * W + i + dx] != 0 && TREE_FIT.Contains(typ[index1 * W + i + dx]);
        if (!FitSide(-1) && !FitSide(1)) return false;
        int height = (int)r.Next(5, 17);
        int clear = height + 4;
        if (typ[gi] == 60) clear += 5;
        bool flag2 = false;
        if (typ[gi] == 70 && EmptyTileCheckT(i - 2, i + 2, index1 - clear, index1 - 3, 20) && EmptyTileCheckT(i - 1, i + 1, index1 - 2, index1 - 1, 20)) flag2 = true;
        if (EmptyTileCheckT(i - 2, i + 2, index1 - clear, index1 - 1, 20)) flag2 = true;
        if (!flag2) return false;
        GrowTrunkT(i, index1, height, 5);
        return true;
    }
    // GrowEpicTree（cs:27361-27760）：基座严格草 2、净空 55、height=Next(20,30)
    bool GrowEpicTreeT(int i, int y)
    {
        int index1 = y;
        while (QQInW(i, index1) && act[index1 * W + i] != 0 && typ[index1 * W + i] == 20) index1++;
        if (!QQInW(i, index1) || index1 < 1) return false;
        int gi = index1 * W + i;
        if (act[gi] == 0 || half[gi] != 0 || slope[gi] != 0 || typ[gi] != 2) return false;
        if (wal[(index1 - 1) * W + i] != 0 || liq[(index1 - 1) * W + i] > 0) return false;
        bool FitSide(int dx) => QQInW(i + dx, index1) && act[index1 * W + i + dx] != 0 && EPIC_FAMILY_T.Contains(typ[index1 * W + i + dx]);
        if (!FitSide(-1) && !FitSide(1)) return false;
        if (!EmptyTileCheckT(i - 2, i + 2, index1 - 55, index1 - 1, 20)) return false;
        GrowTrunkT(i, index1, (int)r.Next(20, 30), 5);
        return true;
    }
    // ── 棕榈尾帧扫（RangeFrame 生成期子集：529 水检击杀 / 530 块校验整块清除）──
    bool SolidTileHB(int ax, int ay)
    {
        if (!QQInW(ax, ay)) return false;
        int i = ay * W + ax;
        if (act[i] == 0 || typ[i] == 0) return false;
        return SOLID.Contains(typ[i]) && !QQ_PLATFORMS.Contains(typ[i]) && half[i] == 0 && slope[i] == 0;
    }
    // SeaOatWaterCheck（cs:58269-58313）
    bool SeaOatWaterCheck(int ax, int ay)
    {
        int num = 45, num2 = 20;
        bool flag = false;
        if (ax <= BEACH_DISTANCE || ax >= W - BEACH_DISTANCE) { flag = true; num = 65; num2 += 5; }
        int sum = 0;
        for (int i2 = ax - num; i2 <= ax + num; i2++)
            for (int j2 = ay - num2; j2 <= ay + num2; j2++)
                if (QQInW(i2, j2) && !SolidTileHB(i2, j2)) sum += liq[j2 * W + i2];
        if ((int)Math.Truncate(sum / 255.0) >= 20) return !flag;
        return flag;
    }
    // CheckOasisPlant（cs:47617-47690）：按帧重建 3×2 块原点，校验失败 → 整块 KillTile + 尾扫
    void CheckOasisPlantAt(int i, int j)
    {
        int k = j * W + i;
        int num = j;
        int num2 = frY[k] % 36;
        num += (int)Math.Truncate(num2 / 18.0) * -1;
        int num3 = (int)Math.Truncate(frX[k] / 18.0);
        int num4 = 0;
        while (num3 > 2) { num3 -= 3; num4++; }
        num3 = i - num3;
        int num5 = num4 * 54;
        bool flag = false;
        for (int kk = num3; kk < num3 + 3; kk++)
        {
            for (int ll = num; ll < num + 2; ll++)
            {
                if (!QQInW(kk, ll)) { flag = true; continue; }
                int k2 = ll * W + kk;
                if (act[k2] == 0 || typ[k2] != 530
                    || frX[k2] != (kk - num3) * 18 + num5 || frY[k2] != (ll - num) * 18) flag = true;
            }
            if (!QQInW(kk, num + 2)) { flag = true; continue; }
            int kb = (num + 2) * W + kk;
            if (act[kb] == 0 || half[kb] != 0 || slope[kb] != 0
                || !(typ[kb] == 53 || typ[kb] == 112 || typ[kb] == 116 || typ[kb] == 234)) flag = true;
        }
        if (!flag) return;
        for (int kk = num3; kk < num3 + 3; kk++)
            for (int ll = num; ll < num + 2; ll++)
            {
                if (!QQInW(kk, ll)) continue;
                int k2 = ll * W + kk;
                if (act[k2] != 0 && typ[k2] == 530) KillTileGenSilentT(kk, ll);
            }
        for (int kk = num3 - 1; kk <= num3 + 4; kk++)
            for (int ll = num - 1; ll <= num + 2; ll++) FrameCellGenT(kk, ll);
    }
    void FrameCellGenT(int ax, int ay)
    {
        if (!QQInW(ax, ay)) return;
        int k = ay * W + ax;
        if (act[k] == 0) { half[k] = 0; slope[k] = 0; return; }
        if (typ[k] == 530) { CheckOasisPlantAt(ax, ay); return; }
        if (typ[k] == 529) { if (!SeaOatWaterCheck(ax, ay)) KillTileGenSilentT(ax, ay); return; }
    }
    void KillTileGenSilentT(int ax, int ay)
    {
        if (!QQInW(ax, ay)) return;
        int k = ay * W + ax;
        if (act[k] == 0) return;
        SetTS(ax, ay, 0, 0, 0);
        for (int dx = -1; dx <= 1; dx++) for (int dy = -1; dy <= 1; dy++) FrameCellGenT(ax + dx, ay + dy);
    }
    void PalmRangeFrameT(int x0, int y0, int x1, int y1)
    {
        for (int x = x0; x <= x1; x++)
            for (int y = y0; y <= y1; y++) FrameCellGenT(x, y);
    }
    // GrowPalmTree（cs:27260-27359）——#98 水盒棕榈/绿洲段复用
    bool GrowPalmTreeT(int i, int y)
    {
        if (!QQInW(i, y)) return false;
        int index1 = y;
        while (QQInW(i, index1) && act[index1 * W + i] != 0 && typ[index1 * W + i] == 20) index1++;
        if (!QQInW(i, index1) || index1 < 1) return false;
        int gi = index1 * W + i;
        if (act[gi] == 0 || half[gi] != 0 || slope[gi] != 0) return false;
        if (!TREE_WALLS.Contains(wal[(index1 - 1) * W + i]) || liq[(index1 - 1) * W + i] > 0) return false;
        if (!PALM_GROUND_T.Contains(typ[gi])) return false;
        if (!EmptyTileCheckT(i, i, index1 - 2, index1 - 1, 20)) return false;
        if (!EmptyTileCheckT(i - 1, i + 1, index1 - 20, index1 - 3, 20)) return false;
        int height = (int)r.Next(10, 21);
        int target = (int)r.Next(-8, 9) * 2;
        int tilt = 0;
        for (int kk = 0; kk < height; kk++)
        {
            if (kk == 0) { SetTS(i, index1 - 1, 323, 66, 0); continue; }
            if (kk == height - 1) { SetTS(i, index1 - 1 - kk, 323, 22 * (int)r.Next(4, 7), tilt); continue; }
            if (tilt != target)
            {
                double prog = (double)kk / height;
                if (prog >= 0.25 && ((prog < 0.5 && (int)r.Next(13) == 0)
                    || (prog < 0.7 && (int)r.Next(9) == 0)
                    || (prog < 0.95 && (int)r.Next(5) == 0) || true))
                    tilt += Math.Sign(target) * 2;
            }
            SetTS(i, index1 - 1 - kk, 323, 22 * (int)r.Next(3), tilt);
        }
        PalmRangeFrameT(i - 2, index1 - height - 1, i + 2, index1 + 1);
        return true;
    }
    // GrowTreeWithSettings 观赏树骨架（cs:30546-30967）：柳 616/樱 596
    bool GrowVanityTreeT(int x, int y, bool willow)
    {
        ushort treeTile = willow ? (ushort)616 : (ushort)596;
        ushort sapling = willow ? (ushort)615 : (ushort)595;
        int num = y;
        while (QQInW(x, y) && act[y * W + x] != 0 && QQInW(x, num) && typ[num * W + x] == sapling) num++;
        if (!QQInW(x, num) || num < 1) return false;
        if (liq[(num - 1) * W + x - 1] != 0 || liq[(num - 1) * W + x] != 0 || liq[(num - 1) * W + x + 1] != 0) return false;
        int gi = num * W + x;
        if (act[gi] == 0 || half[gi] != 0 || slope[gi] != 0) return false;
        if (!TREE_WALLS.Contains(wal[(num - 1) * W + x])) return false;
        if (!VANITY_GROUND_T.Contains(typ[gi])) return false;
        bool FitSide(int dx) => QQInW(x + dx, num) && act[num * W + x + dx] != 0 && VANITY_GROUND_T.Contains(typ[num * W + x + dx]);
        if (!FitSide(-1) && !FitSide(1)) return false;
        int height = (int)r.Next(7, 13);
        int num4 = height + 4;
        if (!EmptyTileCheckT(x - 2, x + 2, num - num4, num - 1, 20)) return false;
        // 干身循环（与 GrowTrunk 同表同掷序；帧无消费方）
        bool flagL = false, flagR = false;
        for (int i = num - height; i < num; i++)
        {
            int num5 = (int)r.Next(3);
            int num6 = (int)r.Next(10);
            if (i == num - 1 || i == num - height) num6 = 0;
            while (((num6 == 5 || num6 == 7) && flagL) || ((num6 == 6 || num6 == 7) && flagR)) num6 = (int)r.Next(10);
            flagL = false; flagR = false;
            if (num6 == 5 || num6 == 7) flagL = true;
            if (num6 == 6 || num6 == 7) flagR = true;
            SetTS(x, i, treeTile, 0, 0);
            if (num6 == 5 || num6 == 7) { int k = (int)r.Next(3); int f2 = (int)r.Next(3); SetTS(x - 1, i, treeTile, 0, 0); }
            if (num6 == 6 || num6 == 7) { int k = (int)r.Next(3); int f2 = (int)r.Next(3); SetTS(x + 1, i, treeTile, 0, 0); }
        }
        bool TuftFit(int dx) => QQInW(x + dx, num) && act[num * W + x + dx] != 0
            && half[num * W + x + dx] == 0 && slope[num * W + x + dx] == 0 && TREE_FIT.Contains(typ[num * W + x + dx]);
        bool tL = TuftFit(-1), tR = TuftFit(1);
        if ((int)r.Next(3) == 0) tL = false;
        if ((int)r.Next(3) == 0) tR = false;
        if (tR) { int k2 = (int)r.Next(3); SetTS(x + 1, num - 1, treeTile, 22, 132 + k2 * 22); }
        if (tL) { int k2 = (int)r.Next(3); SetTS(x - 1, num - 1, treeTile, 44, 132 + k2 * 22); }
        int baseK = (int)r.Next(3);                        // cs:30906 无条件掷
        if (tL && tR) SetTS(x, num - 1, treeTile, 88, 132 + baseK * 22);
        else if (tL) SetTS(x, num - 1, treeTile, 0, 132 + baseK * 22);
        else if (tR) SetTS(x, num - 1, treeTile, 66, 132 + baseK * 22);
        int crownFx = (int)r.Next(13) != 0 ? 22 : 0;
        int crownK = (int)r.Next(3);
        SetTS(x, num - height, treeTile, crownFx, 198 + crownK * 22);
        return true;
    }
    // ---- AddTrees 主体（cs:31523-31578）----
    for (double n = 0; n < W * 0.003; n++)                  // EpicTree 林区（L9656-9666）
    {
        int cx = (int)r.Next(50, W - 50);
        int hw = (int)r.Next(25, 50);
        for (int x = cx - hw; x < cx + hw; x++)
            for (int y = 20; y < worldSurface; y++) GrowEpicTreeT(x, y);
    }
    double palmL = 0.1 + r.NextDouble() * 0.35;
    double palmR = 0.1 + r.NextDouble() * 0.35;
    for (int x = 1; x < W - 1; x++)
    {
        for (int y = 20; y < worldSurface; y++)
        {
            if (x < 380)
            {
                if (r.NextDouble() < palmL && liq[y * W + x] == 0) GrowPalmTreeT(x, y);
            }
            else if (x > W - 380)
            {
                if (r.NextDouble() < palmR && liq[y * W + x] == 0) GrowPalmTreeT(x, y);
            }
            int yi = y * W + x;
            if (act[yi] != 0 && typ[yi] == 2 && (int)r.Next(20) == 0)   // 1/20 观赏树
            {
                GrowVanityTreeT(x, y, (int)r.Next(2) == 0);
                continue;
            }
            GrowTreeT(x, y);
        }
        if ((int)r.Next(3) == 0) x++;
        if ((int)r.Next(4) == 0) x++;
    }
}
Checkpoint("trees");
StreamPt("trees");
// ═════════ Pass 97 SettleLiquidsPart2AndNotTheBees（cs:21051-21113 = settleWorldLiquids('gen') 全量镜像）═════════
// LiquidSim（JS src/world/liquid/LiquidSim.ts——Liquid.cs 1:1 移植的权威复刻）生成路径：
// quickWater → waterCheck → 10 轮 quickSettle updateLiquid（轮预算=活量×5，恒跑满）→
// worldGenTilesIgnoreWater(false) → waterCheck → finalGenMergeCheck（cs:22639-22650 收尾全图
// LiquidCheck(createMergeTilesDuringGen:true)）。掷骰（254→255 的 Next(30)/KillTile 尘掷族/
// SquareWallFrame）走 pass 链流（passRand：gen 期 genRand≡Main.rand 同对象）。
// liquidType 编码 oracle：0水/1岩浆/2蜜/3微光（JS +1）。
Replay(); // ▶pass 头重播：SettleLiquidsPart2 cs:21051
{
    // ---- 表（LiquidSim.ts 同源字面量）----
    var LS_WATER_DEATH = new HashSet<ushort> { 215, 4, 51, 697, 93, 98, 552, 405, 646, 372 };
    var LS_LAVA_DEATH = new HashSet<ushort> { 630, 631, 571, 579, 591, 538, 544, 629, 550, 551, 533, 553, 554, 555, 556, 558, 559, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 632, 640, 643, 644, 645, 710, 568, 569, 570, 580, 582, 619, 620, 572, 560, 564, 567, 565, 654, 529, 530, 705, 484, 3, 5, 10, 11, 12, 13, 14, 469, 486, 488, 704, 487, 489, 490, 15, 497, 16, 17, 18, 19, 24, 27, 28, 29, 32, 33, 34, 35, 36, 42, 49, 50, 707, 51, 697, 52, 55, 61, 703, 62, 69, 655, 71, 72, 73, 74, 79, 80, 81, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 100, 101, 102, 103, 104, 106, 110, 113, 115, 125, 126, 128, 149, 172, 173, 174, 184, 201, 205, 209, 210, 212, 213, 353, 215, 216, 217, 218, 219, 642, 220, 227, 228, 233, 236, 702, 238, 240, 241, 242, 243, 244, 245, 246, 247, 254, 269, 270, 271, 581, 698, 660, 275, 413, 276, 277, 278, 279, 280, 281, 282, 283, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 532, 316, 317, 318, 319, 354, 355, 699, 499, 323, 335, 338, 339, 528, 636, 352, 382, 425, 453, 456, 463, 464, 465, 485, 511, 510, 547, 548, 552, 573, 621, 622, 623, 624, 700, 656, 701, 493, 395, 520, 471, 405, 406, 452, 457, 454, 494, 387, 386, 388, 389, 646, 372, 639, 668, 324, 427, 390 };
    var LS_BURN_AIR = new HashSet<ushort> { 2, 23, 109, 199, 477, 492 };
    var LS_BURN_DIRT = new HashSet<ushort> { 60, 70, 661, 662 };
    var LS_DUST_ZERO = new HashSet<ushort> { 654, 630, 631, 125, 138, 172, 287, 300, 301, 302, 303, 304, 305, 306, 307, 308, 354, 355, 373, 374, 375, 376, 461, 484, 499, 564, 565, 593, 594, 617, 664, 665, 699, 709, 711, 712, 713, 714, 715, 716 };
    var LS_DUST_FIVE = new HashSet<ushort> { 534, 536, 539, 625, 627 };
    var LS_DUST_ONE = new HashSet<ushort> { 23, 24, 661, 25, 27, 32, 2, 477, 109, 492, 204, 478, 58, 76, 77, 684, 633, 641, 370, 171, 238, 231, 352, 583, 584, 585, 586, 587, 588, 589, 595, 596, 615, 616, 385, 34, 42 };
    // tilesIgnoreWater 家族（Liquid.cs:68-72 boulder+546 / 74-79 worldGen 族）
    var LS_BOULDER = new HashSet<ushort> { 138, 484, 664, 711, 712, 713, 714, 715, 716 };
    var LS_WG_IGNORE = new HashSet<ushort> { 10, 190, 191, 192 };
    int qqRollN = 0;
    int LSRoll(int max)                                    // passRand：pass 链流
    {
        var v = (int)r.Next(max);
        if (Environment.GetEnvironmentVariable("QQ_ROLL_LOG") != null && qqRollN < 100000)
            Console.Error.WriteLine($"QQROLL {qqRollN++} Next({max}) -> {v}");
        return v;
    }
    int LsDustAmount(ushort s)
    {
        if (LS_DUST_ZERO.Contains(s)) return 0;
        if (s == 231) return 6;
        if (s == 481 || s == 482 || s == 483) return 3;
        if (s == 541) return 1;
        if (s == 549) return 2;
        if (LS_DUST_FIVE.Contains(s)) return 5;
        if (s == 184) return -1;                           // frameX/22>=5 ? 5 : 10
        return 10;
    }
    int LsDustRolls(ushort s, int fx)
    {
        if (s == 634) return 2;
        if (s == 31 || s == 696) return fx < 36 ? 1 : 0;
        if (s == 26 || s == 695) return fx < 54 ? 1 : 0;
        if (s == 35) return fx < 36 ? 1 : 0;
        return LS_DUST_ONE.Contains(s) ? 1 : 0;
    }
    // ---- 状态 ----
    var lq = new List<(int x, int y, int kill, int delay)>();
    int numLiquid = 0;
    var checking = new byte[W * H];
    var skipB = new byte[W * H];
    int cycles = 10, curMaxLiquid = 25000, wetCounter = 0;
    bool quickSettle = false, quickFall = false, stuck = false;
    int stuckCount = 0, stuckAmount = 0;
    const int BUF_CAP = 49998;
    var bufX = new int[BUF_CAP]; var bufY = new int[BUF_CAP];
    int bufHead = 0, bufTail = 0;
    bool lsGenWorld = true;                                 // generatingWorld
    bool mergeTilesDuringGen = false;                       // finalGenMergeCheck 窗口
    HashSet<ushort> tiwOff = new();                         // tilesIgnoreWater 生效域
    HashSet<ushort> wgOff = new();                          // worldGenTilesIgnoreWater 生效域
    (int x, int y)? lsShimmer = shimmerXOut > 0 ? ((int x, int y)?)(shimmerXOut, shimmerYOut) : null;  // 以太中心
    int dgSide = dungeonRight ? 1 : -1;
    int dgEx0 = dgSide < 0 ? (int)(W * 0.05) : (int)(W * 0.55);
    int dgEx1 = dgSide < 0 ? (int)(W * 0.45) : W - (int)(W * 0.05);
    int dgEy0 = worldSurface + 10, dgEy1 = (H - 200) - 10;
    bool SolidNP(ushort t) => SOLID.Contains(t) && !tiwOff.Contains(t) && !wgOff.Contains(t);
    bool BlocksLiquid(int bx, int by)
    {
        if (bx < 0 || by < 0 || bx >= W || by >= H) return true;
        int i = by * W + bx;
        if (act[i] == 0) return false;
        return SolidNP(typ[i]);
    }
    bool SolidTileFull(int bx, int by)
    {
        if (bx < 0 || by < 0 || bx >= W || by >= H) return true;
        int i = by * W + bx;
        if (act[i] == 0) return false;
        return SolidNP(typ[i]) && half[i] == 0 && slope[i] == 0;
    }
    void LsKillTileGen(int kx, int ky)                      // 生成期 KillTile（尘掷占流位）
    {
        if (!QQInW(kx, ky)) return;
        int ki = ky * W + kx;
        if (act[ki] == 0) return;
        ushort sheet = typ[ki];
        if (sheet == 51 && wal[ki] == 62) LSRoll(4);        // 蛛网带蜘蛛墙（cs:63904）
        int n = LsDustAmount(sheet);
        int amt = n == -1 ? (frX[ki] / 22 >= 5 ? 5 : 10) : n;
        int per = LsDustRolls(sheet, frX[ki]);
        for (int k = 0; k < amt; k++) for (int q = 0; q < per; q++) LSRoll(6);
        if (sheet == 58 && ky > H - 200) { liq[ki] = 128; liqT[ki] = 1; }   // 地狱石灌岩浆 128
        typ[ki] = 0; act[ki] = 0; half[ki] = 0; slope[ki] = 0;
    }
    bool LsDiesIn(ushort t, int fx, int fy2, bool isLava)   // TileObjectData.CheckLava/WaterDeath
    {
        if (!TOD.T.TryGetValue(t, out var rec) || (rec.DL == -1 && rec.DW == -1 && rec.Subs == null && rec.Alts == null))
            return isLava ? LS_LAVA_DEATH.Contains(t) : LS_WATER_DEATH.Contains(t);
        int Trunc(int v, int d) => (int)Math.Truncate((double)v / d);   // C# int 除法（向零截断）
        int num = Trunc(fx, rec.Fw), num2 = Trunc(fy2, rec.Fh);
        int swl = rec.Swl == 0 ? 1 : rec.Swl;
        int n4 = rec.Sh == 1 ? num2 * swl + num : num * swl + num2;
        int style = Trunc(n4, rec.Sm), alt = ((n4 % rec.Sm) + rec.Sm) % rec.Sm;
        if (rec.Sls > 1)
        {
            if (rec.Sh == 1) { style = Trunc(num2, rec.Sls) * swl + num; alt = ((num2 % rec.Sls) + rec.Sls) % rec.Sls; }
            else { style = Trunc(num, rec.Sls) * swl + num2; alt = ((num % rec.Sls) + rec.Sls) % rec.Sls; }
        }
        int? dl = rec.DL == -1 ? null : rec.DL, dw = rec.DW == -1 ? null : rec.DW;
        TodAlt[] alts = rec.Alts ?? Array.Empty<TodAlt>();
        if (rec.Subs != null && rec.Subs.TryGetValue(style, out var sub))
        {
            dl = sub.DL == -1 ? null : sub.DL; dw = sub.DW == -1 ? null : sub.DW;
            alts = sub.Alts ?? Array.Empty<TodAlt>();
        }
        foreach (var a in alts)
        {
            if (a.A0 <= alt && alt <= a.A0 + a.A1)
            {
                dl = a.DL == -1 ? null : a.DL; dw = a.DW == -1 ? null : a.DW;
                break;
            }
        }
        int? d = isLava ? dl : dw;
        if (d == null || d == -1) return isLava ? LS_LAVA_DEATH.Contains(t) : LS_WATER_DEATH.Contains(t);
        return d == 1;
    }
    void AddWater(int ax, int ay)
    {
        if (ax >= W - 5 || ay >= H - 5 || ax < 5 || ay < 5) return;
        int i = ay * W + ax;
        if (checking[i] != 0 || liq[i] == 0) return;
        ushort t = typ[i];
        if (t != 0 && act[i] != 0 && SolidNP(t) && t != 546) return;
        if (numLiquid >= curMaxLiquid - 1)
        {
            if (bufTail - bufHead < BUF_CAP)
            {
                if (bufTail == BUF_CAP)
                {
                    Array.Copy(bufX, bufHead, bufX, 0, bufTail - bufHead);
                    Array.Copy(bufY, bufHead, bufY, 0, bufTail - bufHead);
                    bufTail -= bufHead; bufHead = 0;
                }
                bufX[bufTail] = ax; bufY[bufTail] = ay; bufTail++;
                checking[i] = 1;                            // LiquidBuffer.AddBuffer :115
            }
            return;
        }
        checking[i] = 1;
        skipB[i] = 0;
        if (numLiquid < lq.Count) lq[numLiquid] = (ax, ay, 0, 0);
        else lq.Add((ax, ay, 0, 0));
        numLiquid++;
        // 岩浆/水冲毁死亡方块链（L1199 门）：生成期 isGeneratingOrLoadingWorld=true 不发击杀
    }
    void TilesIgnoreWater(bool on)
    {
        if (on) { if (tiwOff.Count != 0) return; tiwOff = new HashSet<ushort>(LS_BOULDER); tiwOff.Add(546); }
        else tiwOff = new HashSet<ushort>();
    }
    void LiquidOverwriteStrip(int sx, int sy, byte stripType)
    {
        for (int nx = sx; nx >= 0 && liq[sy * W + nx] > 0; nx--) liqT[sy * W + nx] = stripType;
        for (int nx = sx; nx < W && liq[sy * W + nx] > 0; nx++) liqT[sy * W + nx] = stripType;
    }
    void CreateMergeTile(int mx, int my, ushort tileType, byte thisType, byte mergeType)
    {
        if (!mergeTilesDuringGen)
        {
            byte stripType = 255;
            if (tileType == 229) stripType = 0;             // 蜂蜜块 → 水
            else if (tileType == 230 || tileType == 56) stripType = 1;   // 脆蜂蜜/黑曜石 → 岩浆
            else if (tileType == 659) stripType = 3;        // Aetherium → 微光
            if (my >= H - 200) stripType = 1;               // 地狱层强制岩浆
            if (stripType != 255) LiquidOverwriteStrip(mx, my, stripType);
            return;
        }
        int mi = my * W + mx;                               // 收尾落块路径
        if (act[mi] != 0) LsKillTileGen(mx, my);
        typ[mi] = tileType; act[mi] = 1; half[mi] = 0; slope[mi] = 0; wal[mi] = 0; liq[mi] = 0; liqT[mi] = 0;
    }
    bool UndergroundDesertCheck(int ax, int ay)
    {
        for (int j = ay - 3; j <= ay + 3; j++)
            for (int i = ax - 3; i <= ax + 3; i++)
            {
                if (!QQInW(i, j)) continue;
                ushort wv = wal[j * W + i];
                if (wv == 187 || wv == 216) return true;
            }
        return false;
    }
    void LavaCheck(int ax, int ay)
    {
        if (lsGenWorld && UndergroundDesertCheck(ax, ay))
            for (int j = ay - 3; j <= ay + 3; j++)
                for (int i = ax - 3; i <= ax + 3; i++)
                {
                    if (!QQInW(i, j)) continue;
                    liqT[j * W + i] = 1;
                }
        if (SolidTileFull(ax, ay)) return;
        int i5 = ay * W + ax, il = i5 - 1, ir = i5 + 1, iu = i5 - W, id = i5 + W;
        byte lq2 = liq[il], rq2 = liq[ir], uq2 = liq[iu], dq2 = liq[id];
        byte lt = liqT[il], rt = liqT[ir], ut = liqT[iu], dt = liqT[id];
        if ((lq2 > 0 && lt != 1) || (rq2 > 0 && rt != 1) || (uq2 > 0 && ut != 1))
        {
            int sum = 0; ushort type = 56; byte mergeType = 1;
            if (lt != 1) { sum += lq2; liq[il] = 0; }
            if (rt != 1) { sum += rq2; liq[ir] = 0; }
            if (ut != 1) { sum += uq2; liq[iu] = 0; }
            if (lt == 2 || rt == 2 || ut == 2) { type = 230; mergeType = 2; }
            if (lt == 3 || rt == 3 || ut == 3) { type = 659; mergeType = 3; }
            if (sum < 24) return;
            if (act[i5] != 0 && !OBSIDIAN_KILL.Contains(typ[i5])) return;
            liq[i5] = 0; liqT[i5] = 0;
            CreateMergeTile(ax, ay, type, 1, mergeType);
        }
        else
        {
            if (dq2 <= 0 || dt == 1) return;
            bool selfAct = act[i5] != 0; ushort selfT = typ[i5];
            bool belowAct = act[id] != 0; ushort belowT = typ[id];
            bool containerOk = selfAct && CONTAINER_S.Contains(selfT) && !(belowAct && CONTAINER_S.Contains(belowT));
            if (selfT != 0 && belowAct && CUT_S.Contains(belowT)) LsKillTileGen(ax, ay + 1);
            if (act[id] != 0 && !OBSIDIAN_KILL.Contains(typ[id]) && !containerOk) return;
            if (liq[i5] < 24) { liq[i5] = 0; liqT[i5] = 0; return; }
            ushort type2 = dt == 3 ? (ushort)659 : dt == 2 ? (ushort)230 : (ushort)56;
            liq[i5] = 0; liqT[i5] = 0;
            liq[id] = 0; liqT[id] = 0;
            CreateMergeTile(ax, ay + 1, type2, 1, dt);
        }
    }
    void HoneyCheck(int ax, int ay)
    {
        if (SolidTileFull(ax, ay)) return;
        int i5 = ay * W + ax, il = i5 - 1, ir = i5 + 1, iu = i5 - W, id = i5 + W;
        byte lq2 = liq[il], rq2 = liq[ir], uq2 = liq[iu], dq2 = liq[id];
        byte lt = liqT[il], rt = liqT[ir], ut = liqT[iu], dt = liqT[id];
        if ((lq2 > 0 && lt != 2) || (rq2 > 0 && rt != 2) || (uq2 > 0 && ut != 2))
        {
            int sum = 0;
            if (lt != 2) { sum += lq2; liq[il] = 0; }
            if (rt != 2) { sum += rq2; liq[ir] = 0; }
            if (ut != 2) { sum += uq2; liq[iu] = 0; }
            if (sum < 24) return;
            ushort type = (lt == 3 || rt == 3 || ut == 3) ? (ushort)659 : (lt == 1 || rt == 1 || ut == 1) ? (ushort)230 : (ushort)229;
            byte mergeType = (byte)((lt == 3 || rt == 3 || ut == 3) ? 3 : (lt == 1 || rt == 1 || ut == 1) ? 1 : 0);
            if (act[i5] != 0 && !OBSIDIAN_KILL.Contains(typ[i5])) return;
            liq[i5] = 0; liqT[i5] = 0;
            CreateMergeTile(ax, ay, type, 2, mergeType);
        }
        else
        {
            if (dq2 <= 0 || dt == 2) return;
            bool selfAct = act[i5] != 0; ushort selfT = typ[i5];
            bool belowAct = act[id] != 0; ushort belowT = typ[id];
            bool containerOk = selfAct && CONTAINER_S.Contains(selfT) && !(belowAct && CONTAINER_S.Contains(belowT));
            if (selfT != 0 && belowAct && CUT_S.Contains(belowT)) LsKillTileGen(ax, ay + 1);
            if (act[id] != 0 && !OBSIDIAN_KILL.Contains(typ[id]) && !containerOk) return;
            if (liq[i5] < 24) { liq[i5] = 0; liqT[i5] = 0; return; }
            ushort type2 = dt == 3 ? (ushort)659 : dt == 1 ? (ushort)230 : (ushort)229;
            liq[i5] = 0; liqT[i5] = 0;
            liq[id] = 0; liqT[id] = 0;
            CreateMergeTile(ax, ay + 1, type2, 2, dt);
        }
    }
    void ShimmerCheck(int ax, int ay)
    {
        if (SolidTileFull(ax, ay)) return;
        int i5 = ay * W + ax, il = i5 - 1, ir = i5 + 1, iu = i5 - W, id = i5 + W;
        byte lq2 = liq[il], rq2 = liq[ir], uq2 = liq[iu], dq2 = liq[id];
        byte lt = liqT[il], rt = liqT[ir], ut = liqT[iu], dt = liqT[id];
        if ((lq2 > 0 && lt != 3) || (rq2 > 0 && rt != 3) || (uq2 > 0 && ut != 3))
        {
            int sum = 0;
            if (lt != 3) { sum += lq2; liq[il] = 0; }
            if (rt != 3) { sum += rq2; liq[ir] = 0; }
            if (ut != 3) { sum += uq2; liq[iu] = 0; }
            if (sum < 24 || lt == 3 || rt == 3 || ut == 3) return;
            if (act[i5] != 0 && !OBSIDIAN_KILL.Contains(typ[i5])) return;
            liq[i5] = 0; liqT[i5] = 0;
            byte mt = lt != 3 ? lt : rt != 3 ? rt : ut;
            if (mt == 0) mt = 0;
            CreateMergeTile(ax, ay, 659, 3, (byte)(mt == 0 ? 0 : mt));
        }
        else
        {
            if (dq2 <= 0 || dt == 3) return;
            bool selfAct = act[i5] != 0; ushort selfT = typ[i5];
            bool belowAct = act[id] != 0; ushort belowT = typ[id];
            bool containerOk = selfAct && CONTAINER_S.Contains(selfT) && !(belowAct && CONTAINER_S.Contains(belowT));
            if (selfT != 0 && belowAct && CUT_S.Contains(belowT)) LsKillTileGen(ax, ay + 1);
            if (act[id] != 0 && !OBSIDIAN_KILL.Contains(typ[id]) && !containerOk) return;
            if (liq[i5] < 24) { liq[i5] = 0; liqT[i5] = 0; return; }
            liq[i5] = 0; liqT[i5] = 0;
            liq[id] = 0; liqT[id] = 0;
            CreateMergeTile(ax, ay + 1, 659, 3, dt);
        }
    }
    void DelWater(int l)
    {
        var e = lq[l];
        int x = e.x, y = e.y;
        int i5 = y * W + x, il = i5 - 1, ir = i5 + 1, id = i5 + W;
        int amt = liq[i5];
        if (amt < 2)
        {
            liq[i5] = 0;
            if (liq[il] < 2) liq[il] = 0; else AddWater(x - 1, y);
            if (liq[ir] < 2) liq[ir] = 0; else AddWater(x + 1, y);
        }
        else if (amt < 20)
        {
            int lq2 = liq[il], rq2 = liq[ir], dq2 = liq[id];
            if ((lq2 < amt && !BlocksLiquid(x - 1, y)) || (rq2 < amt && !BlocksLiquid(x + 1, y))
                || (dq2 < 255 && !BlocksLiquid(x, y + 1))) liq[i5] = 0;
        }
        else if (liq[id] < 255 && !BlocksLiquid(x, y + 1) && !stuck && !BlocksLiquid(x, y))
        {
            lq[l] = (e.x, e.y, 0, e.delay);                 // 下方未满：留列继续流（kill=0）
            return;
        }
        if (liq[i5] < 250 && liq[i5 - W] > 0) AddWater(x, y - 1);
        if (liq[i5] == 0) liqT[i5] = 0;
        else
        {
            int rq2 = liq[ir], lq2 = liq[il];
            if (rq2 > 0 && rq2 < 250 && !BlocksLiquid(x + 1, y) && liq[i5] != rq2) AddWater(x + 1, y);
            if (lq2 > 0 && lq2 < 250 && !BlocksLiquid(x - 1, y) && liq[i5] != lq2) AddWater(x - 1, y);
            if (liqT[i5] == 1)
            {
                LavaCheck(x, y);
                for (int dy = -1; dy <= 1; dy++)           // 岩浆 3×3 烧除（L1557+）
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        int nx = x + dx, ny = y + dy;
                        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
                        int ni = ny * W + nx;
                        ushort t = typ[ni];
                        if (t == 0) continue;
                        if (LS_BURN_AIR.Contains(t)) { typ[ni] = 0; act[ni] = 0; half[ni] = 0; slope[ni] = 0; }
                        else if (LS_BURN_DIRT.Contains(t)) { typ[ni] = 59; act[ni] = 1; }
                    }
            }
            else if (liqT[i5] == 2) HoneyCheck(x, y);
            else if (liqT[i5] == 3) ShimmerCheck(x, y);
        }
        // swap-remove（:1193 只搬 x/y/kill，delay 保留本槽旧值）
        numLiquid--;
        checking[i5] = 0;
        var tail = lq[numLiquid];
        lq[l] = (tail.x, tail.y, tail.kill, lq[l].delay);
        lq.RemoveAt(numLiquid);
        // DelWater 尾（:1607 CheckAlch/CheckLilyPad）：链内无 82/83/84 草药与 518 睡莲
        //（AlchemyHerbs/DyePlants/Lilypads pass 跳段）——复查分支不可达，备案省略
    }
    int LsCsRound(double v) => (int)Math.Round(v);          // C# Math.Round = banker's（1456 同）
    void SideFlow(int x, int y, int i5)
    {
        byte myType = liqT[i5];
        int il = i5 - 1, ir = i5 + 1, iu = i5 - W, im2 = i5 - 2, ip2 = i5 + 2, im3 = i5 - 3, ip3 = i5 + 3;
        int lq2 = liq[il], rq2 = liq[ir];
        bool f1 = true, f2 = true, f3 = true, f4 = true;
        if (BlocksLiquid(x - 1, y)) f1 = false;
        else if (lq2 > 0 && liqT[il] != myType) f1 = false;
        else if (BlocksLiquid(x - 2, y)) f3 = false;
        else if (liq[im2] == 0) f3 = false;
        else if (liqT[im2] != myType) f3 = false;
        if (BlocksLiquid(x + 1, y)) f2 = false;
        else if (rq2 > 0 && liqT[ir] != myType) f2 = false;
        else if (BlocksLiquid(x + 2, y)) f4 = false;
        else if (liq[ip2] == 0) f4 = false;
        else if (liqT[ip2] != myType) f4 = false;
        int num1 = 0;
        if (liq[i5] < 3) num1 = -1;
        if (liq[i5] > 250) { f3 = false; f4 = false; }
        if (f1 && f2)
        {
            if (f3 && f4)
            {
                bool f5 = true, f6 = true;
                if (BlocksLiquid(x - 3, y)) f5 = false;
                else if (liq[im3] == 0) f5 = false;
                else if (liqT[im3] != myType) f5 = false;
                if (BlocksLiquid(x + 3, y)) f6 = false;
                else if (liq[ip3] == 0) f6 = false;
                else if (liqT[ip3] != myType) f6 = false;
                if (f5 && f6)
                {
                    int m = LsCsRound((lq2 + rq2 + liq[im2] + liq[ip2] + liq[im3] + liq[ip3] + liq[i5] + num1) / 7.0);
                    int same = 0;
                    if (lq2 != m) { liqT[il] = myType; liq[il] = (byte)m; AddWater(x - 1, y); } else { liqT[il] = myType; same++; }
                    if (rq2 != m) { liqT[ir] = myType; liq[ir] = (byte)m; AddWater(x + 1, y); } else { liqT[ir] = myType; same++; }
                    if (liq[im2] != m) { liqT[im2] = myType; liq[im2] = (byte)m; AddWater(x - 2, y); } else { liqT[im2] = myType; same++; }
                    if (liq[ip2] != m) { liqT[ip2] = myType; liq[ip2] = (byte)m; AddWater(x + 2, y); } else { liqT[ip2] = myType; same++; }
                    if (liq[im3] != m) { liqT[im3] = myType; liq[im3] = (byte)m; AddWater(x - 3, y); } else { liqT[im3] = myType; same++; }
                    if (liq[ip3] != m) { liqT[ip3] = myType; liq[ip3] = (byte)m; AddWater(x + 3, y); } else { liqT[ip3] = myType; same++; }
                    if (liq[il] != m || liq[i5] != m) AddWater(x - 1, y);
                    if (liq[ir] != m || liq[i5] != m) AddWater(x + 1, y);
                    if (liq[im2] != m || liq[i5] != m) AddWater(x - 2, y);
                    if (liq[ip2] != m || liq[i5] != m) AddWater(x + 2, y);
                    if (liq[im3] != m || liq[i5] != m) AddWater(x - 3, y);
                    if (liq[ip3] != m || liq[i5] != m) AddWater(x + 3, y);
                    if (same != 6 || liq[iu] <= 0) liq[i5] = (byte)m;
                }
                else
                {
                    int m = LsCsRound((lq2 + rq2 + liq[im2] + liq[ip2] + liq[i5] + num1) / 5.0);
                    int same = 0;
                    if (lq2 != m) { liqT[il] = myType; liq[il] = (byte)m; AddWater(x - 1, y); } else { liqT[il] = myType; same++; }
                    if (rq2 != m) { liqT[ir] = myType; liq[ir] = (byte)m; AddWater(x + 1, y); } else { liqT[ir] = myType; same++; }
                    if (liq[im2] != m) { liqT[im2] = myType; liq[im2] = (byte)m; AddWater(x - 2, y); } else { liqT[im2] = myType; same++; }
                    if (liq[ip2] != m) { liqT[ip2] = myType; liq[ip2] = (byte)m; AddWater(x + 2, y); } else { liqT[ip2] = myType; same++; }
                    if (liq[il] != m || liq[i5] != m) AddWater(x - 1, y);
                    if (liq[ir] != m || liq[i5] != m) AddWater(x + 1, y);
                    if (liq[im2] != m || liq[i5] != m) AddWater(x - 2, y);
                    if (liq[ip2] != m || liq[i5] != m) AddWater(x + 2, y);
                    if (same != 4 || liq[iu] <= 0) liq[i5] = (byte)m;
                }
            }
            else if (f3)
            {
                int m = LsCsRound((lq2 + rq2 + liq[im2] + liq[i5] + num1) / 4.0);
                liqT[il] = myType;
                if (lq2 != m || liq[i5] != m) { liq[il] = (byte)m; AddWater(x - 1, y); }
                liqT[ir] = myType;
                if (rq2 != m || liq[i5] != m) { liq[ir] = (byte)m; AddWater(x + 1, y); }
                liqT[im2] = myType;
                if (liq[im2] != m || liq[i5] != m) { liq[im2] = (byte)m; AddWater(x - 2, y); }
                liq[i5] = (byte)m;
            }
            else if (f4)
            {
                int m = LsCsRound((lq2 + rq2 + liq[ip2] + liq[i5] + num1) / 4.0);
                liqT[il] = myType;
                if (lq2 != m || liq[i5] != m) { liq[il] = (byte)m; AddWater(x - 1, y); }
                liqT[ir] = myType;
                if (rq2 != m || liq[i5] != m) { liq[ir] = (byte)m; AddWater(x + 1, y); }
                liqT[ip2] = myType;
                if (liq[ip2] != m || liq[i5] != m) { liq[ip2] = (byte)m; AddWater(x + 2, y); }
                liq[i5] = (byte)m;
            }
            else
            {
                int m = LsCsRound((lq2 + rq2 + liq[i5] + num1) / 3.0);
                if (m == 254 && LSRoll(30) == 0) m = 255;   // 254→255 补满（pass 链流）
                if (lq2 != m) { liqT[il] = myType; liq[il] = (byte)m; AddWater(x - 1, y); } else liqT[il] = myType;
                if (rq2 != m) { liqT[ir] = myType; liq[ir] = (byte)m; AddWater(x + 1, y); } else liqT[ir] = myType;
                liq[i5] = (byte)m;
            }
        }
        else if (f1)
        {
            int m = LsCsRound((lq2 + liq[i5] + num1) / 2.0);
            if (lq2 != m) liq[il] = (byte)m;
            liqT[il] = myType;
            if (liq[i5] != m || liq[il] != m) AddWater(x - 1, y);
            liq[i5] = (byte)m;
        }
        else if (f2)
        {
            int m = LsCsRound((rq2 + liq[i5] + num1) / 2.0);
            if (rq2 != m) liq[ir] = (byte)m;
            liqT[ir] = myType;
            if (liq[i5] != m || liq[ir] != m) AddWater(x + 1, y);
            liq[i5] = (byte)m;
        }
    }
    void LsUpdate(int l)
    {
        var e = lq[l];
        int x = e.x, y = e.y;
        int i5 = y * W + x;
        if (BlocksLiquid(x, y)) { lq[l] = (x, y, 999, e.delay); return; }
        int startAmt = liq[i5];
        if (y > H - 200 && liqT[i5] == 0 && liq[i5] > 0)    // 地狱蒸发：水每 tick -2
            liq[i5] = (byte)Math.Max(0, liq[i5] - 2);
        if (liq[i5] == 0) { lq[l] = (x, y, 999, e.delay); return; }
        byte myType = liqT[i5];
        if (myType == 1)                                     // 岩浆：先交互再降速
        {
            LavaCheck(x, y);
            if (!quickFall)
            {
                if (e.delay < 5) { lq[l] = (x, y, e.kill, e.delay + 1); return; }
                lq[l] = (x, y, e.kill, 0);
                e = lq[l];
            }
        }
        else
        {
            for (int t = 0; t < 4; t++)                      // 唤醒岩浆邻居
            {
                int nx = x + (t == 0 ? -1 : t == 1 ? 1 : 0);
                int ny = y + (t == 2 ? -1 : t == 3 ? 1 : 0);
                if (!QQInW(nx, ny)) continue;
                int ni = ny * W + nx;
                if (liq[ni] > 0 && liqT[ni] == 1) AddWater(nx, ny);
            }
            if (myType == 2)                                 // 蜂蜜
            {
                HoneyCheck(x, y);
                if (!quickFall)
                {
                    if (e.delay < 10) { lq[l] = (x, y, e.kill, e.delay + 1); return; }
                    lq[l] = (x, y, e.kill, 0);
                    e = lq[l];
                }
            }
            else
            {
                for (int t = 0; t < 4; t++)                  // 唤醒蜂蜜邻居
                {
                    int nx = x + (t == 0 ? -1 : t == 1 ? 1 : 0);
                    int ny = y + (t == 2 ? -1 : t == 3 ? 1 : 0);
                    if (!QQInW(nx, ny)) continue;
                    int ni = ny * W + nx;
                    if (liq[ni] > 0 && liqT[ni] == 2) AddWater(nx, ny);
                }
                if (myType == 3) ShimmerCheck(x, y);         // 微光：流动性同水，无降速
                else
                {
                    for (int t = 0; t < 4; t++)              // 唤醒微光邻居
                    {
                        int nx = x + (t == 0 ? -1 : t == 1 ? 1 : 0);
                        int ny = y + (t == 2 ? -1 : t == 3 ? 1 : 0);
                        if (!QQInW(nx, ny)) continue;
                        int ni = ny * W + nx;
                        if (liq[ni] > 0 && liqT[ni] == 3) AddWater(nx, ny);
                    }
                }
            }
        }
        // 向下全量下灌
        {
            int bi = i5 + W;
            int belowAmt = liq[bi];
            byte belowType = liqT[bi];
            bool belowBlocks = y + 1 >= H ? true : BlocksLiquid(x, y + 1);
            if (!belowBlocks && (belowAmt <= 0 || belowType == myType) && belowAmt < 255)
            {
                int t = 255 - belowAmt;
                if (t > liq[i5]) t = liq[i5];
                bool flag = t == 1 && liq[i5] == 255;        // 缺口 1 满格不扣源
                if (!flag) liq[i5] -= (byte)t;
                liq[bi] += (byte)t;
                liqT[bi] = myType;
                AddWater(x, y + 1);
                skipB[bi] = 1;
                skipB[i5] = 1;
                if (quickSettle && liq[i5] > 250) liq[i5] = 255;
                else if (!flag) { AddWater(x - 1, y); AddWater(x + 1, y); }
            }
        }
        if (liq[i5] > 0) SideFlow(x, y, i5);
        // kill 维护
        e = lq[l];
        if (liq[i5] != startAmt)
        {
            if (liq[i5] == 254 && startAmt == 255)
            {
                if (quickSettle) liq[i5] = 255;
                lq[l] = (x, y, e.kill + 1, e.delay);
            }
            else
            {
                AddWater(x, y - 1);
                lq[l] = (x, y, 0, e.delay);
            }
        }
        else lq[l] = (x, y, e.kill + 1, e.delay);
    }
    void UpdateLiquidInner()
    {
        const int killThreshold = 8;
        quickFall = quickSettle;                            // Liquid.cs:752-755（quickSettle 轮内随动）
        wetCounter++;
        int slice = curMaxLiquid / cycles;
        int start = slice * (wetCounter - 1);
        int end = slice * wetCounter;
        if (wetCounter == cycles) end = numLiquid;
        if (end > numLiquid) { end = numLiquid; wetCounter = cycles; }
        if (quickFall)
        {
            for (int l = start; l < end; l++)
            {
                var e = lq[l];
                lq[l] = (e.x, e.y, e.kill, 10);
                LsUpdate(l);
                skipB[lq[l].y * W + lq[l].x] = 0;
            }
        }
        else
        {
            for (int l = start; l < end; l++)
            {
                var e = lq[l];
                int i = e.y * W + e.x;
                if (skipB[i] == 0) LsUpdate(l);
                else skipB[i] = 0;
            }
        }
        if (wetCounter >= cycles)
        {
            wetCounter = 0;
            for (int l = numLiquid - 1; l >= 0; l--)        // 清扫：kill≥8 → 254 补满 255 出列
            {
                var e = lq[l];
                if (e.kill >= killThreshold)
                {
                    int i = e.y * W + e.x;
                    if (liq[i] == 254) liq[i] = 255;
                    DelWater(l);
                }
            }
            if (bufTail > bufHead)                           // LiquidBuffer 回灌
            {
                int free = Math.Min(curMaxLiquid - numLiquid, bufTail - bufHead);
                for (int n = 0; n < free; n++)
                {
                    int bx = bufX[bufHead], by = bufY[bufHead];
                    bufHead++;
                    checking[by * W + bx] = 0;
                    AddWater(bx, by);
                }
            }
            if (numLiquid > 0 && numLiquid > stuckAmount - 50 && numLiquid < stuckAmount + 50)
            {
                stuckCount++;
                if (stuckCount >= 10000)
                {
                    stuck = true;
                    for (int l = numLiquid - 1; l >= 0; l--) DelWater(l);
                    stuck = false;
                    stuckCount = 0;
                }
            }
            else { stuckCount = 0; stuckAmount = numLiquid; }
        }
    }
    void UpdateLiquid()
    {
        TilesIgnoreWater(true);                              // Liquid.cs:993 首尾包裹
        try { UpdateLiquidInner(); } finally { TilesIgnoreWater(false); }
    }
    void ShimmerRemoveWater()
    {
        if (lsShimmer == null) return;
        var c = lsShimmer.Value;
        const int R = 150;
        for (int y = c.y - R; y <= c.y + R / 2; y++)
            for (int x = c.x - R; x <= c.x + R; x++)
            {
                if (!QQInW(x, y)) continue;
                int dx = Math.Abs(x - c.x), dy = Math.Abs(y - c.y);
                if ((int)Math.Truncate(Math.Sqrt(dx * dx + dy * dy)) >= R) continue;
                int i = y * W + x;
                if (liqT[i] != 3) liq[i] = 0;
                if (typ[i] == 162) act[i] = 0;               // 去活薄冰（幽灵 type 由 finalize 归零）
            }
    }
    void LiquidInteractionsCleanup()                         // cs:23898-24015（含原版上邻微光计水笔误）
    {
        for (int x = 1; x < W - 2; x++)
            for (int y = 1; y < H - 2; y++)
            {
                int i = y * W + x;
                if (act[i] == 0) continue;
                ushort sheet = typ[i];
                if (sheet != 56 && sheet != 659) continue;
                liq[i] = 0; liqT[i] = 0;
                int l = i - 1, rr2 = i + 1, u = i - W, d = i + W;
                int Wet(int j) => act[j] == 0 && liq[j] > 0 ? liqT[j] - 1 : -1;
                int num = Wet(l), num2 = Wet(rr2), num3 = Wet(u), num4 = Wet(d);
                int n5 = 0, n6 = 0, n7 = 0, n8 = 0;
                if (num == 0) n5++; if (num2 == 0) n5++; if (num3 == 0) n5++; if (num4 == 0) n5++;
                if (num == 1) n6++; if (num2 == 1) n6++; if (num3 == 1) n6++; if (num4 == 1) n6++;
                if (num == 2) n7++; if (num2 == 2) n7++; if (num3 == 2) n7++; if (num4 == 2) n7++;
                if (num == 3) n8++; if (num2 == 3) n8++;
                if (num3 == 3) n5++;                         // 原版笔误（cs:23968）
                if (num4 == 3) n8++;
                if ((n5 > 0 && (n6 > 0 || n7 > 0 || n8 > 0)) || (n6 > 0 && (n5 > 0 || n7 > 0 || n8 > 0))
                    || (n7 > 0 && (n5 > 0 || n6 > 0 || n8 > 0)) || (n8 > 0 && (n5 > 0 || n6 > 0 || n7 > 0))) continue;
                byte liquidType = 0;
                if (n5 == 0 && n6 == 0 && n7 == 0 && n8 == 0) liquidType = sheet == 56 ? (byte)1 : (byte)3;
                if (n5 > 0) liquidType = 0;
                else if (n6 > 0) liquidType = 1;
                else if (n7 > 0) liquidType = 2;
                else if (n8 > 0) liquidType = 3;
                typ[i] = 0; act[i] = 0; half[i] = 0; slope[i] = 0; wal[i] = 0;   // ClearEverything
                liq[i] = 255; liqT[i] = liquidType;
            }
    }
    void AttemptToMoveLiquid(int ax, int ay, byte srcType, byte targetType)
    {
        bool srcIs = srcType == targetType;
        bool Diff(int dx, int dy)
        {
            if (!QQInW(dx, dy)) return false;
            int di = dy * W + dx;
            return liq[di] > 0 && (liqT[di] == targetType) != srcIs;
        }
        void Check(int cx, int cy)
        {
            if (targetType == 1) LavaCheck(cx, cy);
            else if (targetType == 2) HoneyCheck(cx, cy);
            else ShimmerCheck(cx, cy);
        }
        if (Diff(ax - 1, ay)) { if (srcIs) Check(ax, ay); else Check(ax - 1, ay); }
        else if (Diff(ax + 1, ay)) { if (srcIs) Check(ax, ay); else Check(ax + 1, ay); }
        else if (Diff(ax, ay - 1)) { if (srcIs) Check(ax, ay); else Check(ax, ay - 1); }
        else if (Diff(ax, ay + 1)) { if (srcIs) Check(ax, ay); else Check(ax, ay + 1); }
    }
    void SettleWaterAt(int originX, int originY)
    {
        int oi = originY * W + originX;
        if (act[oi] != 0 && typ[oi] == 379) return;          // 泡泡格液体原地保留
        if (liq[oi] == 0) return;
        int X = originX, Y = originY;
        byte srcType = liqT[oi];
        ushort originWall = wal[oi];
        byte type = srcType;
        int liquid = liq[oi];
        liq[oi] = 0;
        bool flag1 = true;
        for (; ; )
        {
            bool flag2 = false;
            while (Y < H - 5 && liq[(Y + 1) * W + X] == 0 && !BlocksLiquid(X, Y + 1)) { Y++; flag2 = true; flag1 = false; }
            // Liquid.cs:177-190：本轮有下落、源非蜜非微光 → 越过 waterLine 落点转岩浆
            if (flag2 && srcType != 2 && srcType != 3)
            {
                if (Y > waterLine) type = 1;
                if (lsGenWorld                                    // 地牢豁免（:186-188）
                    && X >= dgEx0 && X <= dgEx1 && Y >= dgEy0 && Y <= dgEy1
                    && (originWall == 7 || originWall == 8 || originWall == 9
                        || (originWall >= 94 && originWall <= 99))) type = 0;
            }
            int dir = -1, step = 0, lastDir = -1, lastStep = 0;
            bool hitL = false, hitR = false, dropped = false;
            for (; ; )
            {
                int probeX = X + step * dir;
                if (probeX < 0 || probeX >= W)
                {
                    if (dir == -1) hitL = true; else hitR = true;
                    if (hitL && hitR) break;
                    if (hitR) { dir = -1; step++; }
                    else if (hitL) { if (dir == 1) step++; dir = 1; }
                    else { if (dir == 1) step++; dir = -dir; }
                    continue;
                }
                int ci = Y * W + probeX;
                if (liq[ci] == 0) { lastDir = dir; lastStep = step; }
                if (dir == -1 && probeX < 5) hitL = true;
                else if (dir == 1 && probeX > W - 5) hitR = true;
                int bi = (Y + 1) * W + probeX;
                if (liq[bi] != 0 && liq[bi] != 255 && liqT[bi] == type)
                {
                    int t = 255 - liq[bi];
                    if (t > liquid) t = liquid;
                    liq[bi] += (byte)t; liquid -= t;
                    if (liquid == 0) break;
                }
                if (Y >= H - 5 || liq[bi] != 0 || BlocksLiquid(probeX, Y + 1))
                {
                    int aheadX = X + (step + 1) * dir;
                    bool inRange = aheadX >= 0 && aheadX < W;
                    int nAmt = inRange ? liq[Y * W + aheadX] : 0;
                    bool nSolid = inRange ? BlocksLiquid(aheadX, Y) : true;
                    if ((nAmt != 0 && (!flag1 || dir != 1)) || nSolid)
                    {
                        if (dir == 1) hitR = true; else hitL = true;
                    }
                    if (hitL && hitR) break;
                    if (hitR) { dir = -1; step++; }
                    else if (hitL) { if (dir == 1) step++; dir = 1; }
                    else { if (dir == 1) step++; dir = -dir; }
                }
                else { dropped = true; break; }
            }
            X = Math.Max(2, Math.Min(W - 3, X + lastStep * lastDir));
            if (liquid != 0 && dropped) Y++;
            else break;
        }
        int fi = Y * W + X;
        liq[fi] = (byte)liquid;
        liqT[fi] = type;
        if (liq[fi] > 0)
        {
            AttemptToMoveLiquid(X, Y, srcType, 1);
            AttemptToMoveLiquid(X, Y, srcType, 2);
            AttemptToMoveLiquid(X, Y, srcType, 3);
        }
    }
    void QuickWater(int minY, int maxY)
    {
        if (lsGenWorld) ShimmerRemoveWater();
        SOLID.Add(379);                                     // Main.tileSolid[379]=true（持续不恢复）
        TilesIgnoreWater(true);
        int yMax = maxY < 0 ? H - 3 : maxY;
        for (int y = yMax; y >= minY; y--)
            for (int x = 4; x < W - 4; x++)
                if (liq[y * W + x] != 0) SettleWaterAt(x, y);
        TilesIgnoreWater(false);
        if (lsGenWorld) ShimmerRemoveWater();
        if (lsGenWorld) LiquidInteractionsCleanup();
    }
    void WaterCheckInner()
    {
        lq.Clear();
        numLiquid = 0;
        bufHead = 0; bufTail = 0;
        Array.Clear(checking, 0, checking.Length);
        for (int x = 1; x < W - 1; x++)
            for (int y = H - 2; y > 0; y--)
            {
                int i = y * W + x;
                if (liq[i] == 0) continue;
                ushort t = typ[i];
                if (t != 0 && act[i] != 0)
                {
                    if (SolidNP(t))
                    {
                        if (t != 379) liq[i] = 0;           // 实心格内液体清零（379 例外保留）
                        continue;
                    }
                    if (liqT[i] == 1) { if (LsDiesIn(t, frX[i], frY[i], true)) LsKillTileGen(x, y); }
                    else if (LsDiesIn(t, frX[i], frY[i], false)) LsKillTileGen(x, y);
                }
                int id = i + W;
                int dq2 = liq[id];
                if (!BlocksLiquid(x, y + 1) && dq2 < 255)
                {
                    if (dq2 > 250) liq[id] = 255;
                    else AddWater(x, y);
                }
                int il = i - 1, ir = i + 1;
                if (!BlocksLiquid(x - 1, y) && liq[il] != liq[i]) AddWater(x, y);
                else if (!BlocksLiquid(x + 1, y) && liq[ir] != liq[i]) AddWater(x, y);
                if (liqT[i] == 1)
                {
                    int iu = i - W;
                    if ((liq[il] > 0 && liqT[il] != 1) || (liq[ir] > 0 && liqT[ir] != 1)
                        || (liq[iu] > 0 && liqT[iu] != 1) || (dq2 > 0 && liqT[id] != 1)) AddWater(x, y);
                }
            }
    }
    void WaterCheck()
    {
        TilesIgnoreWater(true);
        try { WaterCheckInner(); } finally { TilesIgnoreWater(false); }
    }
    // ---- settleWorldLiquids('gen') 主序 ----
    // 生成期 GenSolid 覆写快照注入=SOLID 现值（裂纹砖 481-483/484/192 等各 pass 翻转已落表）
    foreach (var t in LS_WG_IGNORE) wgOff.Add(t);           // worldGenTilesIgnoreWater(true)
    QuickWater(3, -1);
    WaterCheck();
    quickSettle = true;
    for (int round = 0; round < 10; round++)
    {
        int maxIter = (numLiquid + (bufTail - bufHead)) * 5;    // 轮预算=轮始活量×5（无下限）
        int roundIter = 0;
        while (numLiquid > 0 && roundIter < maxIter) { UpdateLiquid(); roundIter++; }
        WaterCheck();
    }
    quickSettle = false;
    wgOff = new HashSet<ushort>();                          // worldGenTilesIgnoreWater(false)
    WaterCheck();
    // finalGenMergeCheck（cs:22639-22650 收尾全图 LiquidCheck，允许落块）
    mergeTilesDuringGen = true;
    for (int y = 1; y < H - 1; y++)
    {
        int row = y * W;
        for (int x = 1; x < W - 1; x++)
        {
            int i = row + x;
            if (liq[i] == 0) continue;
            byte t = liqT[i];
            if (t == 1) LavaCheck(x, y);
            else if (t == 2) HoneyCheck(x, y);
            else if (t == 3) ShimmerCheck(x, y);
        }
    }
    mergeTilesDuringGen = false;
    SOLID.Remove(484);                                      // pass 尾 tileSolid[484]=false（cs:21111）
}
Checkpoint("settle2");
StreamPt("settle2");
// ═════════ Pass 98 CactusPalmTreesAndCoral（cs:21115-21325，StructuresPass.ts 镜像）═════════
Replay(); // ▶pass 头重播：Cactus cs:21115
{
    var SAND_CONV_C = new HashSet<ushort> { 53, 112, 116, 234 };
    var SAND_GATE_C = new HashSet<ushort> { 53, 112, 234 };
    const int CW_W = 50, CW_H = 25, CW_LIM = 25;
    void SetTS(int ax, int ay, ushort t, int fx, int fy2)
    {
        if (!QQInW(ax, ay)) return;
        int i = ay * W + ax;
        typ[i] = t; act[i] = (byte)(t != 0 ? 1 : 0);
        if (t == 0) { half[i] = 0; slope[i] = 0; }
        frX[i] = (ushort)fx; frY[i] = (ushort)fy2;
    }
    bool ActAt(int ax, int ay) => QQInW(ax, ay) && act[ay * W + ax] != 0;
    bool IsCactus(int ax, int ay) => QQInW(ax, ay) && act[ay * W + ax] != 0 && typ[ay * W + ax] == 80;
    bool SolidTileHB(int ax, int ay)
    {
        if (!QQInW(ax, ay)) return false;
        int i = ay * W + ax;
        if (act[i] == 0 || typ[i] == 0) return false;
        return SOLID.Contains(typ[i]) && !QQ_PLATFORMS.Contains(typ[i]) && half[i] == 0 && slope[i] == 0;
    }
    // ---- CheckCactus（cs:54132-54174）：支撑复查 + 击杀链 ----
    void KillCactus(int ax, int ay)
    {
        if (!QQInW(ax, ay)) return;
        int k = ay * W + ax;
        if (act[k] == 0) return;
        SetTS(ax, ay, 0, 0, 0);
        FrameAroundCactus(ax, ay);
    }
    void CheckCactus(int ax, int ay)
    {
        int num = ay, num2 = ax;
        while (IsCactus(num2, num))
        {
            num++;
            if (!IsCactus(num2, num))
            {
                if (IsCactus(num2 - 1, num) && IsCactus(num2 - 1, num - 1) && num2 >= ax) num2--;
                if (IsCactus(num2 + 1, num) && IsCactus(num2 + 1, num - 1) && num2 <= ax) num2++;
            }
        }
        if (!QQInW(num2, num)) return;
        int bi = num * W + num2;
        if (act[bi] == 0 || half[bi] != 0 || slope[bi] != 0 || !SAND_CONV_C.Contains(typ[bi]))
        {
            KillCactus(ax, ay);
            return;
        }
        if (ax != num2)
        {
            if (!IsCactus(ax, ay + 1) && !IsCactus(ax - 1, ay) && !IsCactus(ax + 1, ay)) { KillCactus(ax, ay); return; }
        }
        else
        {
            bool belowOk = QQInW(ax, ay + 1) && act[(ay + 1) * W + ax] != 0
                && (typ[(ay + 1) * W + ax] == 80 || SAND_CONV_C.Contains(typ[(ay + 1) * W + ax]));
            if (!belowOk) { KillCactus(ax, ay); return; }
        }
    }
    void FrameCellGenC(int ax, int ay)
    {
        if (!QQInW(ax, ay)) return;
        int k = ay * W + ax;
        if (act[k] == 0) { half[k] = 0; slope[k] = 0; return; }
        if (typ[k] == 80) CheckCactus(ax, ay);
    }
    void FrameAroundCactus(int ax, int ay)                 // SquareTileFrame 3×3（列主序）
    {
        for (int dx = -1; dx <= 1; dx++)
            for (int dy = -1; dy <= 1; dy++)
                FrameCellGenC(ax + dx, ay + dy);
    }
    // ---- GrowCactus（cs:56584-56805）----
    void PlaceCactusCell(int ax, int ay)
    {
        SetTS(ax, ay, 80, 0, 0);
        FrameAroundCactus(ax, ay);
    }
    void GrowCactus(int ax, int ay)
    {
        if (ay <= 0 || !QQInW(ax, ay) || !QQInW(ax, ay - 1)) return;
        int anchor = ay * W + ax;
        ushort anchorType = typ[anchor];
        if (act[anchor] == 0 || half[anchor] != 0
            || (anchorType != 80 && !SAND_CONV_C.Contains(anchorType))
            || liq[(ay - 1) * W + ax] > 0) return;
        // 50×25 水盒（[i-50,i+50)×[j-25,j+25)）
        int water = 0;
        for (int k = ax - CW_W; k < ax + CW_W; k++)
            for (int l = ay - CW_H; l < ay + CW_H; l++)
                if (QQInW(k, l)) water += liq[l * W + k];
        if ((int)Math.Truncate(water / 255.0) > CW_LIM) return;
        if (SAND_CONV_C.Contains(anchorType))
        {
            // 沙锚：上格冒新仙人掌（cs:56611-56642）
            if (ActAt(ax, ay - 1) || ActAt(ax - 1, ay - 1) || ActAt(ax + 1, ay - 1)) return;
            int cacti = 0, sand = 0;
            bool breakOut = false;
            for (int m = ax - 6; m <= ax + 6 && !breakOut; m++)
            {
                for (int n = ay - 3; n <= ay + 1; n++)
                {
                    if (m < 5 || m >= W - 5 || n < 5 || n >= H - 5) continue;   // InWorld(,5)
                    int kk = n * W + m;
                    if (act[kk] == 0) continue;
                    ushort t = typ[kk];
                    if (t == 80)
                    {
                        cacti++;
                        if (cacti >= 4) return;             // 邻域仙人掌 ≥4 即停
                    }
                    if (SAND_CONV_C.Contains(t))
                    {
                        sand++;
                        if (sand > 10) { breakOut = true; break; }
                    }
                }
            }
            if (sand > 10)
            {
                if ((int)r.Next(2) == 0) slope[anchor] = 0; // cs:56640（生成期恒真）
                PlaceCactusCell(ax, ay - 1);
            }
            return;
        }
        if (anchorType != 80) return;
        // 仙人掌锚：向顶扫基列（cs:56644-56661）
        int num = ax, num2 = ay;
        while (IsCactus(num, num2))
        {
            num2++;
            if (!IsCactus(num, num2))
            {
                if (IsCactus(num - 1, num2) && IsCactus(num - 1, num2 - 1) && num >= ax) num--;
                if (IsCactus(num + 1, num2) && IsCactus(num + 1, num2 - 1) && num <= ax) num++;
            }
        }
        num2--;
        int num6 = num2 - ay;
        int num7 = ax - num;
        num = ax - num7;
        num2 = ay;
        int num8 = 11 - num6;
        // 高度门（cs:56666-56679）：盒内仙人掌计数 ≥ Next(11,13) 即停
        int num9 = 0;
        for (int num10 = num - 2; num10 <= num + 2; num10++)
            for (int num11 = num2 - num8; num11 <= num2 + num6; num11++)
                if (IsCactus(num10, num11)) num9++;
        if (num9 >= (int)r.Next(11, 13)) return;
        num = ax; num2 = ay;
        if (num7 == 0)
        {
            if (num6 == 0)
            {
                if (!ActAt(num, num2 - 1)) PlaceCactusCell(num, num2 - 1);   // 孤格直上一格
                return;
            }
            // 横向分叉三选一（cs:56703-56758）
            bool flag = false, flag2 = false;
            if (IsCactus(num, num2 - 1))
            {
                if (!ActAt(num - 1, num2) && !ActAt(num - 2, num2 + 1) && !ActAt(num - 1, num2 - 1)
                    && !ActAt(num - 1, num2 + 1) && !ActAt(num - 2, num2)) flag = true;
                if (!ActAt(num + 1, num2) && !ActAt(num + 2, num2 + 1) && !ActAt(num + 1, num2 - 1)
                    && !ActAt(num + 1, num2 + 1) && !ActAt(num + 2, num2)) flag2 = true;
            }
            int num12 = (int)r.Next(3);                     // 三选一
            if (num12 == 0 && flag) PlaceCactusCell(num - 1, num2);
            else if (num12 == 1 && flag2) PlaceCactusCell(num + 1, num2);
            else if (num6 < (int)r.Next(2, 8)               // 上长门
                && !IsCactus(num - 1, num2 - 1) && !IsCactus(num + 1, num2 - 1)
                && !ActAt(num, num2 - 1)) PlaceCactusCell(num, num2 - 1);
        }
        else if (!ActAt(num, num2 - 1) && !ActAt(num, num2 - 2)
            && !ActAt(num + num7, num2 - 1) && IsCactus(num - num7, num2 - 1))
        {
            PlaceCactusCell(num, num2 - 1);                 // 臂列锚补直上一格
        }
    }
    void PlantCactus(int ax, int ay)
    {
        GrowCactus(ax, ay);
        for (int k = 0; k < 150; k++)                       // 150 次随机邻域尝试
        {
            int i2 = (int)r.Next(ax - 1, ax + 2);
            int j2 = (int)r.Next(ay - 10, ay + 2);
            GrowCactus(i2, j2);
        }
    }
    // ---- 珊瑚/贝壳（cs:21283-21299）----
    int RollSeaShellStyle()
    {
        int result = (int)r.Next(2);
        if ((int)r.Next(10) == 0) result = 2;
        if ((int)r.Next(10) == 0) result = 3;
        if ((int)r.Next(50) == 0) result = 4;
        return result;
    }
    bool PlaceCoral(int ax, int ay)
    {
        if (!QQInW(ax, ay) || !QQInW(ax, ay - 1) || !QQInW(ax, ay + 1)) return false;
        if (act[(ay - 1) * W + ax] != 0) return false;
        int bi = (ay + 1) * W + ax;
        if (act[bi] == 0 || !SOLID.Contains(typ[bi]) || half[bi] != 0 || slope[bi] != 0) return false;
        SetTS(ax, ay, 81, 26 * (int)r.Next(6), 0);
        return true;
    }
    bool PlaceSeaShell(int ax, int ay, int style)
    {
        if (!QQInW(ax, ay) || !QQInW(ax, ay + 1)) return false;
        int bi = (ay + 1) * W + ax;
        if (!(act[bi] != 0 && SOLID.Contains(typ[bi]) && slope[bi] == 0 && half[bi] == 0)) return false;
        SetTS(ax, ay, 324, 22 * (int)r.Next(3), 22 * style);
        return true;
    }
    // ---- 燕麦/绿洲植物（PlantSeaOat cs:58315 / PlaceOasisPlant cs:47543 + OasisPlantWaterCheck cs:47511）----
    bool SolidAllowBottom(int ax, int ay)                   // cs:70211（出界 true 原版怪癖）
    {
        if (!QQInW(ax, ay)) return true;
        int i = ay * W + ax;
        if (act[i] == 0 || typ[i] == 0) return false;
        return (SOLID.Contains(typ[i]) || QQ_PLATFORMS.Contains(typ[i]))
            && slope[i] != 1 && slope[i] != 2 && half[i] == 0;
    }
    bool SeaOatWaterCheck(int ax, int ay)
    {
        int num = 45, num2 = 20;
        bool flag = false;
        if (ax <= BEACH_DISTANCE || ax >= W - BEACH_DISTANCE) { flag = true; num = 65; num2 += 5; }
        int sum = 0;
        for (int i2 = ax - num; i2 <= ax + num; i2++)
            for (int j2 = ay - num2; j2 <= ay + num2; j2++)
                if (QQInW(i2, j2) && !SolidTileHB(i2, j2)) sum += liq[j2 * W + i2];
        if ((int)Math.Truncate(sum / 255.0) >= 20) return !flag;
        return flag;
    }
    bool PlantSeaOat(int ax, int ay)
    {
        if (!QQInW(ax, ay) || !QQInW(ax, ay + 1)) return false;
        int i = ay * W + ax;
        if (wal[i] > 0 || act[i] != 0 || liq[i] > 0) return false;
        if (!SolidAllowBottom(ax, ay + 1)) return false;
        if (!SAND_CONV_C.Contains(typ[(ay + 1) * W + ax])) return false;
        if (!SeaOatWaterCheck(ax, ay)) return false;
        SetTS(ax, ay, 529, 18 * (int)r.Next(5), 0);
        return true;
    }
    void GrowSeaOat(int ax, int ay)
    {
        int i = ay * W + ax;
        if (QQInW(ax, ay) && frX[i] < 180) frX[i] += 90;
    }
    bool OasisPlantWaterCheck(int ax, int ay)               // cs:47511-47536（含原版 x/j 笔误照抄）
    {
        if (ax <= BEACH_DISTANCE || ax >= W - BEACH_DISTANCE) return false;
        int sum = 0;
        for (int i2 = ax - 45; i2 <= ax + 45; i2++)
            for (int j2 = ay - 20; j2 <= ay + 20; j2++)
                if (QQInW(i2, j2) && !SolidTileHB(i2, j2)) sum += liq[j2 * W + i2];
        return (int)Math.Truncate(sum / 255.0) >= 20;
    }
    // 棕榈尾帧扫复用（trees 段同款：529 水检击杀 / 530 块校验清除——局部函数互递归免前向声明）
    void CheckOasisPlantAt(int i, int j)
    {
        int k = j * W + i;
        int num = j;
        int num2 = frY[k] % 36;
        num += (int)Math.Truncate(num2 / 18.0) * -1;
        int num3 = (int)Math.Truncate(frX[k] / 18.0);
        int num4 = 0;
        while (num3 > 2) { num3 -= 3; num4++; }
        num3 = i - num3;
        int num5 = num4 * 54;
        bool flag = false;
        for (int kk = num3; kk < num3 + 3; kk++)
        {
            for (int ll = num; ll < num + 2; ll++)
            {
                if (!QQInW(kk, ll)) { flag = true; continue; }
                int k2 = ll * W + kk;
                if (act[k2] == 0 || typ[k2] != 530
                    || frX[k2] != (kk - num3) * 18 + num5 || frY[k2] != (ll - num) * 18) flag = true;
            }
            if (!QQInW(kk, num + 2)) { flag = true; continue; }
            int kb = (num + 2) * W + kk;
            if (act[kb] == 0 || half[kb] != 0 || slope[kb] != 0 || !SAND_CONV_C.Contains(typ[kb])) flag = true;
        }
        if (!flag) return;
        for (int kk = num3; kk < num3 + 3; kk++)
            for (int ll = num; ll < num + 2; ll++)
            {
                if (!QQInW(kk, ll)) continue;
                int k2 = ll * W + kk;
                if (act[k2] != 0 && typ[k2] == 530) KillTileGenSilentX(kk, ll);
            }
        for (int kk = num3 - 1; kk <= num3 + 4; kk++)
            for (int ll = num - 1; ll <= num + 2; ll++) FrameCellGenX(kk, ll);
    }
    void PlaceOasisPlant(int ax, int ay)
    {
        int style = (int)r.Next(9);                         // cs:47546 早退门之前必掷
        if (ax < BEACH_DISTANCE || ax > W - BEACH_DISTANCE || ay < 5 || ay > H - 5) return;
        bool flag = true;
        for (int i2 = ax - 1; i2 <= ax + 1; i2++)
        {
            for (int j2 = ay - 1; j2 <= ay; j2++)           // cs:47555：j < Y+1（两行）
            {
                if (!QQInW(i2, j2)) continue;
                int k = j2 * W + i2;
                if (act[k] != 0 && typ[k] != 529) flag = false;
                if (liq[k] > 0) flag = false;
            }
            if (!QQInW(i2, ay + 1) || !SolidTileHB(i2, ay + 1) || !SAND_CONV_C.Contains(typ[(ay + 1) * W + i2])) flag = false;
        }
        if (!flag || !OasisPlantWaterCheck(ax, ay)) return;
        for (int i2 = ax - 1; i2 <= ax + 1; i2++)           // 清盒（KillTile noItem 零掷）
            for (int j2 = ay - 1; j2 <= ay; j2++)
            {
                if (!QQInW(i2, j2)) continue;
                int k = j2 * W + i2;
                if (act[k] != 0)
                {
                    SetTS(i2, j2, 0, 0, 0);
                    half[k] = 0; slope[k] = 0;
                    for (int dx = -1; dx <= 1; dx++) for (int dy = -1; dy <= 1; dy++) FrameCellGenX(i2 + dx, j2 + dy);
                }
            }
        int fx = 54 * style;
        for (int i2 = ax - 1; i2 <= ax + 1; i2++)
            for (int j2 = ay - 1; j2 <= ay; j2++)
                SetTS(i2, j2, 530, fx + 18 * (i2 - (ax - 1)), 18 * (j2 - (ay - 1)));
    }
    // 蛛网/燕麦帧扫族
    void FrameCellGenX(int ax, int ay)
    {
        if (!QQInW(ax, ay)) return;
        int k = ay * W + ax;
        if (act[k] == 0) { half[k] = 0; slope[k] = 0; return; }
        if (typ[k] == 530) { CheckOasisPlantAt(ax, ay); return; }
        if (typ[k] == 529) { if (!SeaOatWaterCheck(ax, ay)) KillTileGenSilentX(ax, ay); return; }
    }
    void KillTileGenSilentX(int ax, int ay)
    {
        if (!QQInW(ax, ay)) return;
        int k = ay * W + ax;
        if (act[k] == 0) return;
        SetTS(ax, ay, 0, 0, 0);
        for (int dx = -1; dx <= 1; dx++) for (int dy = -1; dy <= 1; dy++) FrameCellGenX(ax + dx, ay + dy);
    }
    // ---- 水盒棕榈（cs:21257-21273，TreePass.waterBoxPalmCheck）----
    bool GrowPalmTreeC(int i, int y)
    {
        if (!QQInW(i, y)) return false;
        int index1 = y;
        while (QQInW(i, index1) && act[index1 * W + i] != 0 && typ[index1 * W + i] == 20) index1++;
        if (!QQInW(i, index1) || index1 < 1) return false;
        int gi = index1 * W + i;
        if (act[gi] == 0 || half[gi] != 0 || slope[gi] != 0) return false;
        if (!TREE_WALLS.Contains(wal[(index1 - 1) * W + i]) || liq[(index1 - 1) * W + i] > 0) return false;
        if (!SAND_CONV_C.Contains(typ[gi])) return false;
        bool EmptyChk(int x0, int x1, int y0, int y1)
        {
            if (x0 < 0 || x1 >= W || y0 < 0 || y1 >= H) return false;
            for (int x = x0; x <= x1; x++)
                for (int yy = y0; yy <= y1; yy++)
                {
                    if (act[yy * W + x] == 0) continue;
                    ushort t = typ[yy * W + x];
                    if (t == 20 || t == 590 || t == 595 || t == 615) continue;
                    if (EMPTY_ALLOW.Contains(t)) continue;
                    return false;
                }
            return true;
        }
        if (!EmptyChk(i, i, index1 - 2, index1 - 1)) return false;
        if (!EmptyChk(i - 1, i + 1, index1 - 20, index1 - 3)) return false;
        int height = (int)r.Next(10, 21);
        int target = (int)r.Next(-8, 9) * 2;
        int tilt = 0;
        for (int kk = 0; kk < height; kk++)
        {
            if (kk == 0) { SetTS(i, index1 - 1, 323, 66, 0); continue; }
            if (kk == height - 1) { SetTS(i, index1 - 1 - kk, 323, 22 * (int)r.Next(4, 7), tilt); continue; }
            if (tilt != target)
            {
                double prog = (double)kk / height;
                if (prog >= 0.25 && ((prog < 0.5 && (int)r.Next(13) == 0)
                    || (prog < 0.7 && (int)r.Next(9) == 0)
                    || (prog < 0.95 && (int)r.Next(5) == 0) || true))
                    tilt += Math.Sign(target) * 2;
            }
            SetTS(i, index1 - 1 - kk, 323, 22 * (int)r.Next(3), tilt);
        }
        for (int x = i - 2; x <= i + 2; x++)
            for (int y2 = index1 - height - 1; y2 <= index1 + 1; y2++) FrameCellGenX(x, y2);
        return true;
    }
    bool WaterBoxPalmCheck(int ax, int ay)
    {
        int sum = 0;
        for (int k = ax - 50; k < ax + 50; k++)
            for (int l = ay - 25; l < ay + 25; l++)
                if (QQInW(k, l)) sum += liq[l * W + k];
        if ((int)Math.Truncate(sum / 255.0) > 25)
        {
            if ((int)r.Next(4) == 0) GrowPalmTreeC(ax, ay);
            return true;
        }
        return false;
    }
    // ---- pass 主体（cs:21115-21325；绿洲消费段 gs.numOasis=0 跳段——Oasis pass 未入链）----
    int cNum7 = 380;
    int maxL = (int)r.Next(3, 13);
    int maxR = (int)r.Next(3, 13);
    r.Next(2, 6); r.Next(2, 6);                             // cs:21125-21126 死骰
    int yTop = worldSurface - 1;
    for (int n = 0; n < 3; n++)
    {
        int x0, x1; bool flagMid; int maxValue;
        if (n == 0) { x0 = 5; x1 = cNum7; flagMid = false; maxValue = maxL; }
        else if (n == 1) { x0 = 400; x1 = W - 400; flagMid = true; maxValue = 8; }
        else { x0 = W - cNum7; x1 = W - 5; flagMid = false; maxValue = maxR; }
        for (int x = x0; x < x1; x++)
        {
            if ((int)r.Next(maxValue) != 0)
            {
                // 尾部燕麦段（cs:21302-21320）：未命中列整列铺燕麦/530（y 自 0 起）
                for (int y = 0; y < yTop && y < H; y++)
                {
                    if (PlantSeaOat(x, y))
                    {
                        if ((int)r.Next(2) == 0) GrowSeaOat(x, y);
                        if ((int)r.Next(2) == 0) GrowSeaOat(x, y);
                    }
                    PlaceOasisPlant(x, y);
                }
                continue;
            }
            for (int y = 1; y < yTop && y < H; y++)
            {
                int ti = y * W + x;
                if (act[ti] == 0 || !SAND_GATE_C.Contains(typ[ti])) continue;
                int ai = (y - 1) * W + x;
                if (act[ai] != 0 || wal[ai] != 0) continue;
                if (flagMid)
                {
                    if (!WaterBoxPalmCheck(x, y)) PlantCactus(x, y);
                }
                else
                {
                    if (QQInW(x, y - 4)
                        && liq[(y - 2) * W + x] == 255 && liq[(y - 3) * W + x] == 255 && liq[(y - 4) * W + x] == 255)
                    {
                        if ((int)r.Next(2) == 0) PlaceCoral(x, y - 1);
                        else PlaceSeaShell(x, y - 1, RollSeaShellStyle());
                        break;
                    }
                    if (QQInW(x, y - 2) && liq[(y - 2) * W + x] == 0 && y < worldSurface)
                    {
                        PlaceSeaShell(x, y - 1, RollSeaShellStyle());
                        break;
                    }
                }
            }
        }
    }
}
Checkpoint("cactus");
StreamPt("cactus");
// ==QQ-APPEND-TAIL==

double TuneOceanDepth(int count, double depth, bool florida)
{
    double Inc(double f) => depth + (int)r.Next(10, 20) * f;
    if (!florida)
    {
        if (count < 3) return Inc(0.2);
        if (count < 6) return Inc(0.15);
        if (count < 9) return Inc(0.1);
        if (count < 15) return Inc(0.07);
        if (count < 50) return Inc(0.05);
        if (count < 75) return Inc(0.04);
        if (count < 100) return Inc(0.03);
        if (count < 125) return Inc(0.02);
        if (count < 150) return Inc(0.01);
        if (count < 175) return Inc(0.005);
        if (count < 200) return Inc(0.001);
        if (count < 230) return Inc(0.01);
        if (count < 235) return Inc(0.05);
        if (count < 240) return Inc(0.1);
        if (count < 245) return Inc(0.05);
        if (count < 255) return Inc(0.01);
        return depth;
    }
    if (count < 3) return Inc(0.001);
    if (count < 6) return Inc(0.002);
    if (count < 9) return Inc(0.004);
    if (count < 15) return Inc(0.007);
    if (count < 50) return Inc(0.01);
    if (count < 75) return Inc(0.014);
    if (count < 100) return Inc(0.019);
    if (count < 125) return Inc(0.027);
    if (count < 150) return Inc(0.038);
    if (count < 175) return Inc(0.052);
    if (count < 200) return Inc(0.08);
    if (count < 230) return Inc(0.12);
    if (count < 235) return Inc(0.16);
    if (count < 240) return Inc(0.27);
    if (count < 245) return Inc(0.43);
    if (count < 255) return Inc(0.6);
    return depth;
}

// ================= 输出 =================
var sb = new StringBuilder();
sb.AppendLine("{");
sb.AppendLine($"  \"seed\": {seed}, \"evil\": {evil},");
sb.AppendLine($"  \"worldSurface\": {worldSurface}, \"rockLayer\": {rockLayer}, \"waterLine\": {waterLine}, \"lavaLine\": {lavaLine},");
sb.AppendLine($"  \"shimmerX\": {shimmerXOut}, \"shimmerY\": {shimmerYOut}, \"dungeonRight\": {(dungeonRight ? 1 : 0)},");
sb.AppendLine("  \"checkpoints\": [");
for (int i = 0; i < checkpoints.Count; i++)
    sb.AppendLine($"    \"{checkpoints[i]}\"{(i < checkpoints.Count - 1 ? "," : "")}");
sb.AppendLine("  ],");
sb.AppendLine("  \"stream\": [");
for (int i = 0; i < streamPts.Count; i++)
    sb.AppendLine($"    \"{streamPts[i]}\"{(i < streamPts.Count - 1 ? "," : "")}");
sb.AppendLine("  ]");
sb.AppendLine("}");
File.WriteAllText(outPath, sb.ToString());
File.WriteAllText(outPath + ".ghost", string.Join("\n", ghostPts));
File.WriteAllText(outPath + ".jseg", string.Join("\n", jsegPts));
Console.WriteLine($"written {outPath} ({checkpoints.Count} checkpoints)");

// ================= Terraria.Utilities.FastRandom（FastRandom.cs 1:1）=================
class FR
{
    static ulong FrNextSeed(ulong s) => (s * 25214903917UL + 11UL) & 0xFFFFFFFFFFFFUL;
    public ulong S;
    public FR(ulong s) { S = s; }
    public FR Mod(ulong m) => new FR(FrNextSeed(m) ^ S);                       // WithModifier(ulong)
    public FR ModXY(int x, int y) => Mod((ulong)(x + 2654435769u + ((long)y << 6)) + ((ulong)y >> 2)); // WithModifier(int,int)
    int Bits(int bits) { S = FrNextSeed(S); return (int)(S >> (48 - bits)); }   // NextBits
    public int Next(int max)
    {
        if ((max & -max) == max) return (int)((long)max * (long)Bits(31) >> 31);
        int num, r2;
        do { num = Bits(31); r2 = num % max; } while (num - r2 + (max - 1) < 0);
        return r2;
    }
    public double NextDouble() => (float)Bits(32) * 4.656613E-10f;
}

// ================= WorldBuilding 微框架（GenAction/GenShape/Actions/Modifiers/Shapes 1:1）=================
// 只实现沙漠入口用到的子集；哈希无关的副作用（SquareWallFrame/SmoothSlope）省略。
static class WC
{
    public static byte[] A; public static ushort[] T, Wl; public static byte[] L;
    public static dynamic R; public static HashSet<ushort> SOLID;
    public static int W, H;
    // ★oracle 同步批（2026-08-17）：half/slope 通道与 SquareWallFrame 掷骰/SmoothSlope
    // 绑定顶层 helper（静态类不可直接引用顶层局部函数——以委托桥接）
    public static byte[] Hf, Sl;
    public static Action<int, int> SqWF;        // WallFrameDraw（SquareWallFrame 掷骰）
    public static Action<int, int> SmoothSelf;  // HalfBrickPass.smoothSlope（self）
    public static bool InW(int x, int y) => x >= 0 && x < W && y >= 0 && y < H;
    public static long Key(int dx, int dy) => ((long)dx << 22) | (uint)(dy + (1 << 21));
}

abstract class GA
{
    public GA N;                       // NextAction
    public HashSet<long> O;            // OutputData
    public abstract bool Apply(int ox, int oy, int x, int y);
    protected bool UA(int ox, int oy, int x, int y)
    {
        if (O != null) O.Add(WC.Key(x - ox, y - oy));
        return N?.Apply(ox, oy, x, y) ?? true;
    }
}

static class GW
{
    public static GA Chain(params GA[] xs)   // Actions.Chain：串 NextAction，返回链首
    {
        for (int i = 0; i < xs.Length - 1; i++) xs[i].N = xs[i + 1];
        return xs[0];
    }
    public static GA Out(GA a, HashSet<long> o) { a.O = o; return a; }  // GenAction.Output

    // ---- Modifiers（Modifiers.cs 1:1）----
    public class BlotchesA : GA   // 默认 scale=2 chance=0.3：先掷 1 次 NextDouble 弃，再判 chance
    {
        public override bool Apply(int ox, int oy, int x, int y)
        {
            WC.R.NextDouble();
            if ((double)WC.R.NextDouble() < 0.3)
            {
                bool f = false;
                int a = (int)WC.R.Next(-1, 1), b = (int)WC.R.Next(0, 2), c = (int)WC.R.Next(-1, 1), d = (int)WC.R.Next(0, 2);
                for (int i = a; i <= b; i++)
                    for (int j = c; j <= d; j++)
                        f |= !UA(ox, oy, x + i, y + j);
                return !f;
            }
            return UA(ox, oy, x, y);
        }
    }
    public class OffsetA : GA
    {
        public int X, Y;
        public OffsetA(int x, int y) { X = x; Y = y; }
        public override bool Apply(int ox, int oy, int x, int y) => UA(ox, oy, x + X, y + Y);
    }
    public class ExpandA : GA
    {
        public int E;
        public ExpandA(int e) { E = e; }
        public override bool Apply(int ox, int oy, int x, int y)
        {
            bool f = false;
            for (int i = -E; i <= E; i++)
                for (int j = -E; j <= E; j++)
                    f |= !UA(ox, oy, x + i, y + j);
            return !f;
        }
    }
    public class IsSolidA : GA   // active && tileSolid[type]（SolidOrSlopedTile 简化——此阶段无坡面/半砖）
    {
        public override bool Apply(int ox, int oy, int x, int y)
        {
            if (!WC.InW(x, y)) return false;
            int i = y * WC.W + x;
            if (WC.A[i] == 0 || !WC.SOLID.Contains(WC.T[i])) return false;
            return UA(ox, oy, x, y);
        }
    }
    public class NotInShapeA : GA
    {
        public HashSet<long> D;
        public NotInShapeA(HashSet<long> d) { D = d; }
        public override bool Apply(int ox, int oy, int x, int y)
            => D.Contains(WC.Key(x - ox, y - oy)) ? false : UA(ox, oy, x, y);
    }
    public class OnlyTilesA : GA
    {
        public ushort Tt;
        public OnlyTilesA(ushort t) { Tt = t; }
        public override bool Apply(int ox, int oy, int x, int y)
        {
            if (!WC.InW(x, y)) return false;
            int i = y * WC.W + x;
            if (WC.A[i] == 0 || WC.T[i] != Tt) return false;
            return UA(ox, oy, x, y);
        }
    }
    public class SkipWallsA : GA
    {
        public ushort Wt;
        public SkipWallsA(ushort w) { Wt = w; }
        public override bool Apply(int ox, int oy, int x, int y)
        {
            if (!WC.InW(x, y)) return false;
            if (WC.Wl[y * WC.W + x] == Wt) return false;
            return UA(ox, oy, x, y);
        }
    }

    // ---- Actions（Actions.cs 1:1）----
    public class ClearA : GA   // ClearEverything（含 half/slope 清位）
    {
        public override bool Apply(int ox, int oy, int x, int y)
        {
            if (WC.InW(x, y)) { int i = y * WC.W + x; WC.A[i] = 0; WC.T[i] = 0; WC.Wl[i] = 0; WC.L[i] = 0; WC.Hf[i] = 0; WC.Sl[i] = 0; }
            return UA(ox, oy, x, y);
        }
    }
    public class ClearTileA : GA   // ClearTile()：active=false（type/wall/liquid 保留；half/slope 清）
    {
        public override bool Apply(int ox, int oy, int x, int y)
        {
            if (WC.InW(x, y)) { int i = y * WC.W + x; WC.A[i] = 0; WC.Hf[i] = 0; WC.Sl[i] = 0; }
            return UA(ox, oy, x, y);
        }
    }
    public class SetTileA : GA  // Clear(~(Wiring|Actuator)) + type + active → wall/liquid/half/slope 清零
    {
        public ushort Tt;
        public SetTileA(ushort t) { Tt = t; }
        public override bool Apply(int ox, int oy, int x, int y)
        {
            if (WC.InW(x, y)) { int i = y * WC.W + x; WC.T[i] = Tt; WC.A[i] = 1; WC.Wl[i] = 0; WC.L[i] = 0; WC.Hf[i] = 0; WC.Sl[i] = 0; }
            return UA(ox, oy, x, y);
        }
    }
    public class PlaceWallA : GA // Actions.PlaceWall：写墙 + SquareWallFrame(x,y)+四邻（neighbors=true）
    {
        public ushort Wt;
        public PlaceWallA(ushort w) { Wt = w; }
        public override bool Apply(int ox, int oy, int x, int y)
        {
            if (WC.InW(x, y)) WC.Wl[y * WC.W + x] = Wt;
            // ★F 批掷骰还原（Actions.cs:516-541）：写后 SquareWallFrame(x,y)+四邻，各至多
            // 1 掷（中心格 resetFrame）——曾按「哈希无关」省略致 pass 内流错位
            WC.SqWF(x, y); WC.SqWF(x + 1, y); WC.SqWF(x - 1, y); WC.SqWF(x, y - 1); WC.SqWF(x, y + 1);
            return UA(ox, oy, x, y);
        }
    }
    public class SmoothA : GA   // Actions.Smooth（Actions.cs:600）→ Tile.SmoothSlope
    {
        public bool Wn;         // applyToNeighbors（LarvaHole :29 用 true；Anthill :52 用 false）
        public SmoothA(bool wn = false) { Wn = wn; }
        public override bool Apply(int ox, int oy, int x, int y)
        {
            if (Wn) { WC.SmoothSelf(x + 1, y); WC.SmoothSelf(x - 1, y); WC.SmoothSelf(x, y + 1); WC.SmoothSelf(x, y - 1); }
            WC.SmoothSelf(x, y);
            return UA(ox, oy, x, y);
        }
    }

    // ---- Shapes（Shapes.cs 1:1；quitOnFail 恒 false → Apply 返回值不中断遍历）----
    public static void GenCircle(int ox, int oy, int hR, int vR, GA act)
    {
        int num = (hR + 1) * (hR + 1);
        for (int i = oy - vR; i <= oy + vR; i++)
        {
            double n2 = (double)hR / (double)vR * (double)(i - oy);
            int n3 = Math.Min(hR, (int)Math.Sqrt((double)num - n2 * n2));
            for (int j = ox - n3; j <= ox + n3; j++) act.Apply(ox, oy, j, i);
        }
    }
    public static void GenRect(int ox, int oy, int l, int t, int r, int b, GA act)
    {
        for (int i = ox + l; i < ox + r; i++)
            for (int j = oy + t; j < oy + b; j++) act.Apply(ox, oy, i, j);
    }
    public static void GenRectWH(int ox, int oy, int w, int h, GA act) => GenRect(ox, oy, 0, 0, w, h, act);
    public static (int dx, int dy) Decode(long k) => ((int)(k >> 22), (int)((k & ((1L << 22) - 1)) - (1 << 21)));
    public static void GenAll(int ox, int oy, HashSet<long> d, GA act)   // ModShapes.All
    {
        foreach (var k in d)
        {
            var (dx, dy) = Decode(k);
            act.Apply(ox, oy, ox + dx, oy + dy);
        }
    }
    public static void GenOutline(int ox, int oy, HashSet<long> d, GA act)   // OuterOutline（useDiagonals=true）
    {
        int[] offs = { 1, 0, -1, 0, 0, 1, 0, -1, 1, 1, 1, -1, -1, 1, -1, -1 };
        foreach (var k in d)
        {
            var (dx, dy) = Decode(k);
            for (int i = 0; i < 16; i += 2)
                if (!d.Contains(WC.Key(dx + offs[i], dy + offs[i + 1])))
                    act.Apply(ox, oy, ox + dx + offs[i], oy + dy + offs[i + 1]);
        }
    }
    public static void GenTail(int ox, int oy, double width, double ex, double ey, GA act)   // Shapes.Tail
    {
        double w = width * 16.0, exo = ex * 16.0, eyo = ey * 16.0;
        double sx = ox << 4, sy = oy << 4;
        PlotTileTale(sx, sy, sx + exo, sy + eyo, w, (x, y) => { act.Apply(ox, oy, x, y); return true; });
    }
    static bool PlotLineAct(int x0, int y0, int x1, int y1, Func<int, int, bool> plot, bool jump)  // Utils.PlotLine
    {
        if (x0 == x1 && y0 == y1) return plot(x0, y0);
        bool flag = Math.Abs(y1 - y0) > Math.Abs(x1 - x0);
        if (flag) { (x0, y0) = (y0, x0); (x1, y1) = (y1, x1); }
        int num = Math.Abs(x1 - x0), num2 = Math.Abs(y1 - y0);
        int num3 = num / 2, num4 = y0;
        int num5 = x0 < x1 ? 1 : -1, num6 = y0 < y1 ? 1 : -1;
        for (int i = x0; i != x1; i += num5)
        {
            if (flag) { if (!plot(num4, i)) return false; }
            else if (!plot(i, num4)) return false;
            num3 -= num2;
            if (num3 >= 0) continue;
            num4 += num6;
            if (!jump)
            {
                if (flag) { if (!plot(num4, i)) return false; }
                else if (!plot(i, num4)) return false;
            }
            num3 += num;
        }
        return true;
    }
    static void PlotTileTale(double startX, double startY, double endX, double endY, double width, Func<int, int, bool> plot)  // Utils.PlotTileTale
    {
        double halfWidth = width / 2.0;
        double vx = endX - startX, vy = endY - startY;
        double len = Math.Sqrt(vx * vx + vy * vy);
        double ux = vx / len, uy = vy / len;
        double px = -uy, py = ux;
        int psx = (int)(startX / 16.0), psy = (int)(startY / 16.0);
        int pex = (int)(endX / 16.0), pey = (int)(endY / 16.0);
        int length = 0;
        PlotLineAct(psx, psy, pex, pey, (x, y) => { length++; return true; }, true);
        length--;
        int curLength = 0;
        PlotLineAct(psx, psy, pex, pey, delegate (int x, int y)
        {
            double num = 1.0 - (double)curLength / (double)length;
            curLength++;
            int p2x = (int)((startX - px * halfWidth * num) / 16.0), p2y = (int)((startY - py * halfWidth * num) / 16.0);
            int p3x = (int)((startX + px * halfWidth * num) / 16.0), p3y = (int)((startY + py * halfWidth * num) / 16.0);
            return PlotLineAct(x + p2x - psx, y + p2y - psy, x + p3x - psx, y + p3y - psy, plot, jump: false);
        }, jump: true);
    }
}

// ================= Pass 32 Dungeon 数据类型（DungeonBounds/DRoom/DHall/DDoor/DPlat）=================
// DungeonBounds（DungeonBounds.cs：Left/Right 钳 [10,maxX-10]、Top/Bottom 钳 [10,maxY-10]；
// CalculateHitbox 保证 R>L、B>T；Contains=Rectangle.Contains 半开区间）
sealed class DBnd
{
    public int L = 10, R = 10, T = 10, B = 10;
    public bool Has;
    static int Cx(int v) => Math.Clamp(v, 10, 4200 - 10);
    static int Cy(int v) => Math.Clamp(v, 10, 1200 - 10);
    public void Set(int l, int t, int rr, int b) { L = Cx(l); R = Cx(rr); T = Cy(t); B = Cy(b); Calc(); }
    public void Calc() { if (R <= L) R = L + 1; if (B <= T) B = T + 1; Has = true; }
    public void Upd(int x, int y) { if (x < L) L = Cx(x); if (x > R) R = Cx(x); if (y < T) T = Cy(y); if (y > B) B = Cy(y); Has = true; }
    public void Upd(int minX, int minY, int maxX, int maxY)
    { if (minX < L) L = Cx(minX); if (maxX > R) R = Cx(maxX); if (minY < T) T = Cy(minY); if (maxY > B) B = Cy(maxY); Has = true; }
    public void TopSet(int t) { T = Cy(t); Has = true; }
    public void Inflate(int a) => Set(L - a, T - a, R + a, B + a);
    public bool Contains(int x, int y) => Has && x >= L && x < R && y >= T && y < B;
    public bool ContainsF(int x, int y, int fluff) => fluff == 0 ? Contains(x, y) : (Has && x >= L - fluff && x < R + fluff && y >= T - fluff && y < B + fluff);
}
sealed class DRoom
{
    public int Seed, X, Y;
    public bool Start, Generated;
    public DBnd Inner = new(), Outer = new();
    public double SX, SY;          // StartPosition/EndPosition（LegacyRoom：val3/val2 终点）
    public double EX, EY;          // EndPosition（金箱候选中心）
    public int Strength;
}
sealed class DHall
{
    public int Seed;
    public bool Generated, ForceX, IsEntrance;
    public DBnd Bounds = new();
    public double SX, SY, EX, EY;  // StartPosition/EndPosition
    public double SDX, SDY, EDX, EDY;
}
sealed class DDoor
{
    public int X, Y, Dir;
    public bool Hall, SkipOther, SkipSpace, Clear;
    public int Fluff;
}
sealed class DPlat
{
    public int X, Y;
    public bool Hall;
    public int Hf = 5;             // OverrideHeightFluff（B2：房间 3 / 走廊·入口缺省 5）
    public bool Force;             // ForcePlacement（XX 批：Tower/Dome 入口候选）
    public double Pots, Bottles, Books, Candles;   // 置物概率（IsAShelf=任一>0，DungeonPlatformData.cs:34-43）
}
// Dungeon pass 段 genRand 计数包装（流对账用：passchain 指纹只计 Main.rand 掷数，
// 结构内 new UnifiedRandom(seed) 子流不计——两口径分离见 2026-08-17 段落盘注）
sealed class DgCR
{
    public dynamic inner = null!;
    public int n;
    public static bool LogRolls;                                  // DG_ROLL_LOG=1：逐掷值日志（stderr）
    void Log(string op, object ret) { if (LogRolls) Console.Error.WriteLine($"DGROLL {n} {op} -> {ret}"); }
    public int Next() { n++; var v = inner.Next(); Log("Next()", v); return v; }
    public int Next(int maxValue) { n++; var v = inner.Next(maxValue); Log($"Next({maxValue})", v); return v; }
    public int Next(int minValue, int maxValue) { n++; var v = inner.Next(minValue, maxValue); Log($"Next({minValue},{maxValue})", v); return v; }
    public double NextDouble() { n++; var v = inner.NextDouble(); Log("NextDouble()", v); return v; }
}

// PrefixLegacy.Prefixes 前缀池（PrefixLegacy.cs:9-64）+ PrefixID.Sets.ReducedNaturalChance（:9）
static class DgPre
{
    public static readonly int[] Swords = { 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,36,37,38,53,54,55,39,40,56,41,57,42,43,44,45,46,47,48,49,50,51,59,60,61,81 };
    public static readonly int[] Spears = { 36,37,38,53,54,55,39,40,56,41,57,59,60,61 };
    public static readonly int[] Guns = { 16,17,18,19,20,21,22,23,24,25,58,36,37,38,53,54,55,39,40,56,41,57,42,44,45,46,47,48,49,50,51,59,60,61,82 };
    public static readonly int[] Magic = { 26,27,28,29,30,31,32,33,34,35,52,36,37,38,53,54,55,39,40,56,41,57,42,43,44,45,46,47,48,49,50,51,59,60,61,83 };
    public static readonly int[] Summon = { 85,86,87,88,89,90,91,92,93,94,95,96,97,55,38,54,53,57,40,56,41,39 };
    public static readonly int[] Boom = { 36,37,38,53,54,55,39,40,56,41,57,59,60,61 };
    public static readonly int[] Acc = { 62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80 };
    public static readonly HashSet<int> Reduced = new HashSet<int> { 7,8,9,10,11,22,23,24,29,30,31,39,40,56,41,47,48,49 };
}

// ═════════ QQ 批（2026-08-18）：TileObjectData 死亡真值表（tile-object-death-table.ts 镜像，365 条）═════════
// 键=原版 sheet id。DL/DW=-1=UsesGlobalLiquidChecks（回退全局 tileLava/WaterDeath 表）。
// 与 LiquidSim.diesIn 的 style 解析（C# int 除法向零截断）配套——settle2 段 WaterCheck 击杀链用。
sealed class TodAlt { public int A0, A1, DL, DW; }
sealed class TodSub { public int DL = -1, DW = -1; public TodAlt[] Alts = Array.Empty<TodAlt>(); }
sealed class TodRec { public int Fw, Fh, Sh, Swl, Sm, Sls; public int DL = -1, DW = -1; public Dictionary<int, TodSub>? Subs; public TodAlt[]? Alts; }
static class TOD
{
    public static readonly Dictionary<ushort, TodRec> T = Build();
    static Dictionary<ushort, TodRec> Build()
    {
        var d = new Dictionary<ushort, TodRec>();
        void Add(ushort k, int fw, int fh, int sh, int swl, int sm, int sls, int dl, int dw, (int, TodSub)[]? subs, TodAlt[]? alts)
        {
            var rec = new TodRec { Fw = fw, Fh = fh, Sh = sh, Swl = swl, Sm = sm, Sls = sls, DL = dl, DW = dw, Alts = alts };
            if (subs != null)
            {
                rec.Subs = new Dictionary<int, TodSub>();
                foreach (var (st, sv) in subs) rec.Subs[st] = sv;
            }
            d[k] = rec;
        }
        Add(4, 22,22,1,6,6,1,1,1,new (int,TodSub)[]{(8,S(8,0,0,A(1,0,0,0),A(2,0,0,0),A(0,0,0,0))),(11,S(11,0,0,A(1,0,0,0),A(2,0,0,0),A(0,0,0,0))),(17,S(17,0,0,A(1,0,0,0),A(2,0,0,0),A(0,0,0,0)))},new TodAlt[]{A(1,0,1,1),A(2,0,1,1),A(0,0,1,1)});
        Add(10, 18,54,0,36,1,3,1,0,new (int,TodSub)[]{(19,S(19,0,0,A(0,0,0,0),A(0,0,0,0))),(48,S(48,0,0,A(0,0,0,0),A(0,0,0,0)))},new TodAlt[]{A(0,0,1,0),A(0,0,1,0)});
        Add(11, 36,54,0,36,1,2,1,0,new (int,TodSub)[]{(19,S(19,0,0,A(0,0,0,0),A(0,0,0,0),A(1,0,0,0),A(1,0,0,0),A(1,0,0,0))),(48,S(48,0,0,A(0,0,0,0),A(0,0,0,0),A(1,0,0,0),A(1,0,0,0),A(1,0,0,0)))},new TodAlt[]{A(0,0,1,0),A(0,0,1,0),A(1,0,1,0),A(1,0,1,0),A(1,0,1,0)});
        Add(12, 36,36,0,0,1,1,1,0,null,null);
        Add(13, 18,18,1,0,1,1,1,0,null,null);
        Add(14, 54,38,1,0,1,1,1,0,new (int,TodSub)[]{(13,S(13,0,0)),(25,S(25,1,0))},null);
        Add(15, 18,40,1,2,2,1,1,0,new (int,TodSub)[]{(16,S(16,0,0,A(1,0,0,0))),(47,S(47,0,0,A(1,0,0,0))),(51,S(51,1,0,A(1,0,1,0))),(52,S(52,1,0,A(1,0,1,0))),(53,S(53,1,0,A(1,0,1,0))),(54,S(54,1,0,A(1,0,1,0))),(55,S(55,1,0,A(1,0,1,0))),(56,S(56,1,0,A(1,0,1,0))),(57,S(57,1,0,A(1,0,1,0))),(58,S(58,1,0,A(1,0,1,0))),(59,S(59,1,0,A(1,0,1,0))),(60,S(60,1,0,A(1,0,1,0))),(61,S(61,1,0,A(1,0,1,0))),(62,S(62,1,0,A(1,0,1,0))),(63,S(63,1,0,A(1,0,1,0))),(64,S(64,1,0,A(1,0,1,0))),(65,S(65,1,0,A(1,0,1,0))),(66,S(66,1,0,A(1,0,1,0))),(67,S(67,1,0,A(1,0,1,0)))},new TodAlt[]{A(1,0,1,0)});
        Add(16, 36,20,1,0,1,1,1,0,null,null);
        Add(17, 54,38,1,0,1,1,1,0,null,null);
        Add(18, 36,20,1,0,1,1,1,0,new (int,TodSub)[]{(14,S(14,0,0)),(43,S(43,0,0))},null);
        Add(19, 18,18,1,27,27,1,1,0,new (int,TodSub)[]{(13,S(13,0,0)),(43,S(43,0,0)),(47,S(47,0,0))},null);
        Add(20, 18,38,1,0,1,1,1,0,null,new TodAlt[]{A(3,3,1,0),A(6,3,1,0),A(9,3,1,0),A(12,3,1,0),A(15,3,1,0),A(18,3,1,0),A(21,3,1,0),A(24,3,1,0),A(27,3,1,0),A(30,3,1,0)});
        Add(21, 36,38,1,0,1,1,0,0,null,null);
        Add(26, 54,38,1,0,1,1,0,0,null,null);
        Add(27, 36,74,1,0,1,1,1,0,null,null);
        Add(29, 36,18,1,0,1,1,1,0,null,null);
        Add(33, 18,22,0,0,1,1,1,0,new (int,TodSub)[]{(25,S(25,0,0)),(39,S(39,1,0)),(41,S(41,0,0))},null);
        Add(34, 54,54,0,37,1,2,1,0,new (int,TodSub)[]{(32,S(32,0,0)),(46,S(46,1,0)),(48,S(48,0,0))},null);
        Add(35, 36,36,0,0,1,1,1,0,null,null);
        Add(36, 18,18,1,0,1,1,1,0,null,null);
        Add(42, 18,36,0,0,1,1,1,0,new (int,TodSub)[]{(32,S(32,0,0,A(0,0,1,0))),(46,S(46,1,0,A(0,0,1,0))),(48,S(48,0,0,A(0,0,1,0)))},new TodAlt[]{A(0,0,1,0)});
        Add(49, 18,22,0,0,1,1,1,0,null,null);
        Add(50, 18,18,1,0,1,1,1,0,null,null);
        Add(55, 36,36,1,0,1,1,1,0,null,new TodAlt[]{A(1,0,1,0),A(2,0,1,0),A(3,0,1,0),A(4,0,1,0)});
        Add(77, 54,38,1,0,1,1,0,0,null,null);
        Add(78, 18,18,0,0,1,1,0,0,null,null);
        Add(79, 72,36,1,2,2,1,1,0,new (int,TodSub)[]{(8,S(8,0,0,A(1,0,0,0))),(42,S(42,0,0,A(1,0,0,0))),(56,S(56,1,0,A(1,0,1,0))),(57,S(57,1,0,A(1,0,1,0))),(58,S(58,1,0,A(1,0,1,0))),(59,S(59,1,0,A(1,0,1,0))),(60,S(60,1,0,A(1,0,1,0))),(61,S(61,1,0,A(1,0,1,0))),(62,S(62,1,0,A(1,0,1,0))),(63,S(63,1,0,A(1,0,1,0))),(64,S(64,1,0,A(1,0,1,0)))},new TodAlt[]{A(1,0,1,0)});
        Add(81, 26,28,1,0,1,1,1,0,null,null);
        Add(82, 18,22,1,0,1,1,1,0,new (int,TodSub)[]{(1,S(1,1,0)),(2,S(2,1,0)),(3,S(3,1,0)),(4,S(4,1,0)),(5,S(5,0,0)),(6,S(6,1,0))},null);
        Add(83, 18,22,1,0,1,1,1,0,new (int,TodSub)[]{(1,S(1,1,0)),(2,S(2,1,0)),(3,S(3,1,0)),(4,S(4,1,0)),(5,S(5,0,0)),(6,S(6,1,0))},null);
        Add(84, 18,22,1,0,1,1,1,0,new (int,TodSub)[]{(1,S(1,1,0)),(2,S(2,1,0)),(3,S(3,1,0)),(4,S(4,1,0)),(5,S(5,0,0)),(6,S(6,1,0))},null);
        Add(85, 36,36,1,0,1,1,0,0,null,null);
        Add(86, 54,36,1,0,1,1,1,0,null,null);
        Add(87, 54,36,1,0,1,1,1,0,new (int,TodSub)[]{(15,S(15,0,0)),(42,S(42,0,0))},null);
        Add(88, 54,36,1,0,1,1,0,0,new (int,TodSub)[]{(9,S(9,0,0)),(42,S(42,0,0))},null);
        Add(89, 54,36,1,0,1,1,1,0,new (int,TodSub)[]{(10,S(10,0,0)),(46,S(46,0,0))},null);
        Add(90, 72,36,1,2,2,1,1,0,new (int,TodSub)[]{(25,S(25,0,0,A(1,0,0,0))),(42,S(42,0,0,A(1,0,0,0))),(56,S(56,1,0,A(1,0,1,0))),(57,S(57,1,0,A(1,0,1,0))),(58,S(58,1,0,A(1,0,1,0))),(59,S(59,1,0,A(1,0,1,0))),(60,S(60,1,0,A(1,0,1,0))),(61,S(61,1,0,A(1,0,1,0))),(62,S(62,1,0,A(1,0,1,0))),(63,S(63,1,0,A(1,0,1,0))),(64,S(64,1,0,A(1,0,1,0)))},new TodAlt[]{A(1,0,1,0)});
        Add(91, 18,54,1,111,1,1,1,0,null,new TodAlt[]{A(0,0,1,0)});
        Add(92, 18,108,0,0,1,1,1,0,null,null);
        Add(93, 18,54,0,0,1,2,1,1,new (int,TodSub)[]{(23,S(23,0,1)),(40,S(40,1,0)),(42,S(42,0,1))},null);
        Add(94, 36,36,0,0,1,1,1,0,null,null);
        Add(95, 36,36,0,0,1,1,1,0,null,null);
        Add(96, 36,36,1,0,1,1,1,0,null,null);
        Add(97, 36,36,0,0,1,1,1,0,null,null);
        Add(98, 36,36,0,0,1,1,1,1,null,null);
        Add(99, 36,36,0,0,1,1,0,0,null,null);
        Add(100, 36,36,0,0,1,2,1,0,new (int,TodSub)[]{(25,S(25,0,0)),(40,S(40,1,0)),(42,S(42,0,0))},null);
        Add(101, 54,72,1,0,1,1,1,0,new (int,TodSub)[]{(4,S(4,0,0)),(43,S(43,0,0))},null);
        Add(102, 54,72,1,0,1,1,1,0,null,null);
        Add(103, 36,18,1,0,1,1,1,0,null,null);
        Add(104, 36,90,1,0,1,1,1,0,new (int,TodSub)[]{(17,S(17,0,0)),(43,S(43,0,0))},null);
        Add(105, 36,54,1,55,1,1,0,0,null,new TodAlt[]{A(165,0,0,0)});
        Add(106, 54,54,0,0,1,1,1,0,null,null);
        Add(114, 54,38,1,0,1,1,0,0,null,null);
        Add(125, 36,36,0,0,1,1,1,0,null,null);
        Add(126, 36,36,0,0,1,1,1,0,null,null);
        Add(128, 36,54,1,0,1,1,1,0,null,new TodAlt[]{A(1,0,0,0)});
        Add(132, 36,38,1,0,1,1,0,0,null,new TodAlt[]{A(2,0,0,0)});
        Add(133, 54,38,1,0,1,1,0,0,null,null);
        Add(134, 36,18,1,0,1,1,0,0,null,null);
        Add(135, 16,18,0,0,1,1,0,0,null,null);
        Add(136, 18,18,1,0,1,1,0,0,null,new TodAlt[]{A(1,0,0,0),A(2,0,0,0),A(3,0,0,0)});
        Add(138, 36,38,0,0,1,1,0,0,null,null);
        Add(139, 36,36,0,0,1,1,0,0,null,null);
        Add(141, 18,18,0,0,1,1,0,0,null,null);
        Add(142, 36,36,0,0,1,1,0,0,null,null);
        Add(143, 36,36,0,0,1,1,0,0,null,null);
        Add(144, 18,18,1,0,1,1,0,0,null,null);
        Add(149, 18,18,1,6,1,1,0,0,null,new TodAlt[]{A(12,0,0,0),A(6,0,0,0),A(18,0,0,0)});
        Add(171, 64,128,0,0,1,1,0,0,null,null);
        Add(172, 36,38,0,0,1,1,1,0,new (int,TodSub)[]{(13,S(13,0,0)),(43,S(43,0,0))},null);
        Add(173, 36,36,0,0,1,1,1,0,null,null);
        Add(174, 18,22,0,0,1,1,1,0,null,null);
        Add(178, 18,18,1,7,1,1,0,0,null,new TodAlt[]{A(63,0,0,0),A(21,0,0,0),A(42,0,0,0)});
        Add(184, 18,18,1,11,1,1,-1,-1,null,new TodAlt[]{A(33,0,-1,-1),A(66,0,-1,-1),A(99,0,-1,-1)});
        Add(186, 54,36,1,0,1,1,0,0,new (int,TodSub)[]{(26,S(26,0,0)),(27,S(27,0,0)),(28,S(28,0,0)),(29,S(29,0,0)),(30,S(30,0,0)),(31,S(31,0,0)),(32,S(32,0,0)),(33,S(33,0,0)),(34,S(34,0,0))},null);
        Add(187, 54,36,1,35,1,1,0,0,new (int,TodSub)[]{(0,S(0,0,0)),(1,S(1,0,0)),(2,S(2,0,0)),(3,S(3,0,0)),(4,S(4,0,0)),(5,S(5,0,0)),(6,S(6,0,0)),(7,S(7,0,0)),(8,S(8,0,0)),(29,S(29,0,0)),(30,S(30,0,0)),(31,S(31,0,0)),(32,S(32,0,0)),(33,S(33,0,0)),(34,S(34,0,0))},null);
        Add(207, 36,72,1,0,1,1,0,0,null,null);
        Add(209, 72,54,1,0,1,1,1,0,null,null);
        Add(210, 18,18,0,0,1,1,1,0,null,null);
        Add(212, 54,54,1,0,1,1,1,0,null,new TodAlt[]{A(1,0,1,0)});
        Add(215, 54,36,1,16,1,1,1,1,new (int,TodSub)[]{(1,S(1,1,0)),(4,S(4,1,0)),(9,S(9,1,0)),(17,S(17,1,0)),(20,S(20,1,0)),(25,S(25,1,0))},null);
        Add(216, 18,40,0,0,1,1,1,0,null,null);
        Add(217, 54,36,1,0,1,1,1,0,null,null);
        Add(218, 54,36,1,0,1,1,1,0,null,null);
        Add(219, 54,54,0,0,1,1,1,0,null,null);
        Add(220, 54,54,0,0,1,1,1,0,null,null);
        Add(227, 34,40,1,0,1,1,1,0,new (int,TodSub)[]{(3,S(3,1,0)),(4,S(4,1,0)),(5,S(5,1,0)),(6,S(6,1,0)),(7,S(7,1,0))},null);
        Add(228, 54,54,0,0,1,1,1,0,null,null);
        Add(231, 54,54,0,0,1,1,0,0,null,null);
        Add(235, 54,18,0,0,1,1,0,0,null,null);
        Add(237, 54,36,1,0,1,1,0,0,null,null);
        Add(239, 18,18,1,0,1,1,0,0,null,null);
        Add(240, 54,54,1,36,1,1,1,0,null,null);
        Add(241, 72,54,0,0,1,1,1,0,null,null);
        Add(242, 108,72,0,27,1,1,1,0,null,null);
        Add(243, 54,54,0,0,1,1,1,0,null,null);
        Add(244, 54,36,1,0,1,1,1,0,null,null);
        Add(245, 36,54,1,0,1,1,1,0,new (int,TodSub)[]{(15,S(15,1,0))},null);
        Add(246, 54,36,0,0,1,1,1,0,null,null);
        Add(247, 54,54,0,0,1,1,1,0,null,null);
        Add(254, 36,36,0,6,6,1,1,0,null,null);
        Add(269, 36,54,1,0,1,1,1,0,null,new TodAlt[]{A(1,0,0,0)});
        Add(270, 18,36,0,0,1,1,1,0,null,new TodAlt[]{A(0,0,1,0)});
        Add(271, 18,36,0,0,1,1,1,0,null,new TodAlt[]{A(0,0,1,0)});
        Add(275, 108,54,0,0,1,1,1,0,null,null);
        Add(276, 108,54,0,0,1,1,1,0,null,null);
        Add(277, 108,54,0,0,1,1,1,0,null,null);
        Add(278, 108,54,0,0,1,1,1,0,null,null);
        Add(279, 108,54,0,0,1,1,1,0,null,null);
        Add(280, 108,54,0,0,1,1,1,0,null,null);
        Add(281, 108,54,0,0,1,1,1,0,null,null);
        Add(282, 36,36,0,0,1,1,1,0,null,null);
        Add(283, 54,54,0,0,1,1,1,0,null,null);
        Add(285, 54,36,0,0,1,1,1,0,null,null);
        Add(286, 54,36,0,0,1,1,1,0,null,null);
        Add(287, 36,36,0,0,1,1,1,0,null,null);
        Add(288, 36,36,0,0,1,1,1,0,null,null);
        Add(289, 36,36,0,0,1,1,1,0,null,null);
        Add(290, 36,36,0,0,1,1,1,0,null,null);
        Add(291, 36,36,0,0,1,1,1,0,null,null);
        Add(292, 36,36,0,0,1,1,1,0,null,null);
        Add(293, 36,36,0,0,1,1,1,0,null,null);
        Add(294, 36,36,0,0,1,1,1,0,null,null);
        Add(295, 36,36,0,0,1,1,1,0,null,null);
        Add(296, 108,54,0,0,1,1,1,0,null,null);
        Add(297, 108,54,0,0,1,1,1,0,null,null);
        Add(298, 54,36,0,0,1,1,1,0,null,null);
        Add(299, 54,36,0,0,1,1,1,0,null,null);
        Add(300, 54,54,0,0,1,1,1,0,null,null);
        Add(301, 54,54,0,0,1,1,1,0,null,null);
        Add(302, 54,54,0,0,1,1,1,0,null,null);
        Add(303, 54,54,0,0,1,1,1,0,null,null);
        Add(304, 54,54,0,0,1,1,1,0,null,null);
        Add(305, 54,54,0,0,1,1,1,0,null,null);
        Add(306, 54,54,0,0,1,1,1,0,null,null);
        Add(307, 54,54,0,0,1,1,1,0,null,null);
        Add(308, 54,54,0,0,1,1,1,0,null,null);
        Add(309, 108,54,0,0,1,1,1,0,null,null);
        Add(310, 54,36,0,0,1,1,1,0,null,null);
        Add(316, 36,36,0,0,1,1,1,0,null,null);
        Add(317, 36,36,0,0,1,1,1,0,null,null);
        Add(318, 36,36,0,0,1,1,1,0,null,null);
        Add(319, 36,36,0,0,1,1,1,0,null,null);
        Add(320, 36,54,1,0,1,1,0,0,null,null);
        Add(324, 22,22,1,3,1,1,1,0,null,null);
        Add(334, 54,54,1,0,1,1,0,0,null,new TodAlt[]{A(1,0,0,0)});
        Add(335, 36,36,0,0,1,1,1,0,null,null);
        Add(337, 36,54,1,0,1,1,0,0,null,null);
        Add(338, 18,36,0,0,1,1,1,0,null,null);
        Add(339, 54,36,0,0,1,1,1,0,null,null);
        Add(349, 36,54,1,7,1,1,0,0,null,new TodAlt[]{A(7,0,0,0)});
        Add(354, 54,54,0,0,1,1,0,0,null,null);
        Add(355, 54,54,0,0,1,1,0,0,null,null);
        Add(356, 36,54,1,0,1,1,0,0,null,null);
        Add(358, 108,54,0,0,1,1,1,0,null,null);
        Add(359, 108,54,0,0,1,1,1,0,null,null);
        Add(360, 36,36,0,0,1,1,1,0,null,null);
        Add(361, 54,36,0,0,1,1,1,0,null,null);
        Add(362, 54,36,0,0,1,1,1,0,null,null);
        Add(363, 54,36,0,0,1,1,1,0,null,null);
        Add(364, 54,36,0,0,1,1,1,0,null,null);
        Add(372, 18,22,0,0,1,1,1,0,null,null);
        Add(376, 36,38,1,0,1,1,1,0,null,null);
        Add(377, 54,36,1,0,1,1,1,0,null,null);
        Add(378, 36,54,1,2,2,1,0,0,null,new TodAlt[]{A(1,0,0,0)});
        Add(386, 36,36,1,0,1,1,1,0,null,null);
        Add(387, 36,18,1,0,1,1,1,0,null,null);
        Add(388, 18,94,0,2,2,1,1,0,null,new TodAlt[]{A(0,0,1,0),A(0,0,1,0),A(0,0,1,0),A(0,0,1,0),A(1,0,1,0),A(1,0,1,0),A(1,0,1,0),A(1,0,1,0),A(1,0,1,0)});
        Add(389, 18,94,0,2,2,1,1,0,null,new TodAlt[]{A(0,0,1,0),A(0,0,1,0),A(0,0,1,0),A(0,0,1,0),A(1,0,1,0),A(1,0,1,0),A(1,0,1,0),A(1,0,1,0),A(1,0,1,0)});
        Add(390, 18,36,0,0,1,1,1,0,null,null);
        Add(391, 54,36,0,0,1,1,1,0,null,null);
        Add(392, 54,36,0,0,1,1,1,0,null,null);
        Add(393, 54,36,0,0,1,1,1,0,null,null);
        Add(394, 54,36,0,0,1,1,1,0,null,null);
        Add(395, 36,36,1,0,1,1,1,0,null,new TodAlt[]{A(1,0,1,0),A(2,0,1,0),A(3,0,1,0),A(4,0,1,0)});
        Add(405, 54,36,1,0,1,1,1,0,null,null);
        Add(406, 54,54,0,0,1,1,1,0,null,null);
        Add(410, 36,56,1,0,1,1,0,0,null,null);
        Add(411, 36,36,0,0,1,1,0,0,null,null);
        Add(412, 54,54,0,0,1,1,1,0,null,null);
        Add(413, 108,54,0,0,1,1,1,0,null,null);
        Add(414, 108,54,0,0,1,1,1,0,null,null);
        Add(419, 18,18,1,0,1,1,0,0,null,null);
        Add(420, 18,18,0,0,1,1,0,0,null,null);
        Add(423, 18,18,0,0,1,1,0,0,null,null);
        Add(424, 18,18,0,0,1,1,0,0,null,null);
        Add(425, 36,36,1,0,1,1,1,0,null,new TodAlt[]{A(1,0,1,0),A(2,0,1,0),A(3,0,1,0),A(4,0,1,0)});
        Add(427, 18,18,1,27,27,1,1,0,null,null);
        Add(428, 16,18,0,0,1,1,0,0,null,null);
        Add(429, 18,18,0,0,1,1,0,0,null,null);
        Add(435, 18,18,1,27,27,1,1,0,null,null);
        Add(436, 18,18,1,27,27,1,1,0,null,null);
        Add(437, 18,18,1,27,27,1,1,0,null,null);
        Add(438, 18,18,1,27,27,1,1,0,null,null);
        Add(439, 18,18,1,27,27,1,1,0,null,null);
        Add(440, 54,54,1,36,1,1,1,0,null,null);
        Add(441, 36,38,1,0,1,1,0,0,null,null);
        Add(442, 22,22,1,4,4,1,0,0,null,new TodAlt[]{A(1,0,0,0),A(2,0,0,0),A(3,0,0,0)});
        Add(443, 36,18,1,0,1,1,0,0,null,new TodAlt[]{A(1,0,0,0),A(2,0,0,0),A(3,0,0,0)});
        Add(444, 36,36,0,0,1,1,1,0,null,null);
        Add(445, 18,18,0,0,1,1,0,0,null,null);
        Add(452, 54,54,0,0,1,1,1,0,null,null);
        Add(453, 18,54,1,0,1,1,1,0,null,new TodAlt[]{A(1,0,1,0)});
        Add(454, 72,54,0,0,1,1,1,0,null,null);
        Add(455, 54,54,0,0,1,1,1,0,null,null);
        Add(456, 36,54,1,0,1,1,0,0,null,null);
        Add(457, 36,36,1,0,1,1,1,0,null,null);
        Add(462, 36,18,1,0,1,1,1,0,null,null);
        Add(463, 54,72,1,0,1,1,1,0,null,null);
        Add(464, 90,72,0,0,1,1,1,0,null,null);
        Add(465, 36,54,1,0,1,1,1,0,null,new TodAlt[]{A(0,0,1,0)});
        Add(466, 90,72,0,0,1,1,1,0,null,null);
        Add(467, 36,38,1,0,1,1,0,0,null,null);
        Add(468, 36,38,1,0,1,1,0,0,null,null);
        Add(469, 54,38,1,0,1,1,1,0,new (int,TodSub)[]{(11,S(11,0,0))},null);
        Add(470, 36,54,1,0,1,1,0,0,null,new TodAlt[]{A(1,0,0,0)});
        Add(471, 54,54,1,0,1,1,0,0,null,new TodAlt[]{A(1,0,0,0)});
        Add(475, 54,72,1,0,1,1,0,0,null,new TodAlt[]{A(1,0,0,0)});
        Add(476, 22,20,0,0,1,1,0,0,null,null);
        Add(480, 36,54,1,0,1,1,0,0,null,null);
        Add(484, 36,36,0,0,1,1,1,0,null,null);
        Add(485, 36,36,1,4,1,1,1,0,null,null);
        Add(486, 54,38,1,0,1,1,0,0,null,null);
        Add(487, 72,38,1,0,1,1,0,0,null,null);
        Add(488, 54,36,1,0,1,1,0,0,null,null);
        Add(489, 36,54,1,0,1,1,0,0,null,null);
        Add(490, 36,36,1,0,1,1,1,0,null,null);
        Add(491, 54,54,0,0,1,1,0,0,null,null);
        Add(493, 18,36,1,6,1,1,1,0,null,null);
        Add(494, 18,18,0,0,1,1,1,0,null,null);
        Add(497, 18,40,1,2,2,1,1,0,new (int,TodSub)[]{(14,S(14,0,0,A(1,0,0,0))),(42,S(42,0,0,A(1,0,0,0))),(51,S(51,1,0,A(1,0,1,0))),(52,S(52,1,0,A(1,0,1,0))),(53,S(53,1,0,A(1,0,1,0))),(54,S(54,1,0,A(1,0,1,0))),(55,S(55,1,0,A(1,0,1,0))),(56,S(56,1,0,A(1,0,1,0))),(57,S(57,1,0,A(1,0,1,0))),(58,S(58,1,0,A(1,0,1,0))),(59,S(59,1,0,A(1,0,1,0))),(60,S(60,1,0,A(1,0,1,0))),(61,S(61,1,0,A(1,0,1,0))),(62,S(62,1,0,A(1,0,1,0))),(63,S(63,1,0,A(1,0,1,0))),(64,S(64,1,0,A(1,0,1,0)))},new TodAlt[]{A(1,0,1,0)});
        Add(499, 54,54,0,0,1,1,1,0,null,null);
        Add(505, 36,36,0,0,1,1,1,0,null,null);
        Add(506, 36,54,1,0,1,1,1,0,null,new TodAlt[]{A(1,0,1,0)});
        Add(509, 36,54,1,0,1,1,0,0,null,null);
        Add(510, 36,36,1,0,1,1,1,0,null,new TodAlt[]{A(1,0,1,0),A(2,0,1,0),A(3,0,1,0),A(4,0,1,0)});
        Add(511, 36,36,1,0,1,1,1,0,null,new TodAlt[]{A(1,0,1,0),A(2,0,1,0),A(3,0,1,0),A(4,0,1,0)});
        Add(520, 18,18,1,0,1,1,1,0,null,new TodAlt[]{A(1,0,1,0)});
        Add(521, 36,36,0,0,1,1,1,0,null,null);
        Add(522, 36,36,0,0,1,1,1,0,null,null);
        Add(523, 36,36,0,0,1,1,1,0,null,null);
        Add(524, 36,36,0,0,1,1,1,0,null,null);
        Add(525, 36,36,0,0,1,1,1,0,null,null);
        Add(526, 36,36,0,0,1,1,1,0,null,null);
        Add(527, 36,36,0,0,1,1,1,0,null,null);
        Add(531, 36,54,1,0,1,1,1,0,null,null);
        Add(532, 54,36,0,0,1,1,1,0,null,null);
        Add(533, 54,36,0,0,1,1,1,0,null,null);
        Add(538, 54,36,0,0,1,1,1,0,null,null);
        Add(542, 108,54,0,0,1,1,1,0,null,null);
        Add(543, 36,36,0,0,1,1,1,0,null,null);
        Add(544, 54,36,0,0,1,1,1,0,null,null);
        Add(545, 36,54,1,2,1,1,0,0,null,new TodAlt[]{A(2,0,0,0)});
        Add(547, 36,90,1,0,1,1,1,0,null,null);
        Add(548, 54,108,1,0,1,1,1,0,new (int,TodSub)[]{(7,S(7,0,0)),(8,S(8,0,0))},null);
        Add(550, 108,54,0,0,1,1,1,0,null,null);
        Add(551, 108,54,0,0,1,1,1,0,null,null);
        Add(552, 54,36,1,0,1,1,1,1,null,null);
        Add(553, 108,54,0,0,1,1,1,0,null,null);
        Add(554, 108,54,0,0,1,1,1,0,null,null);
        Add(555, 54,36,0,0,1,1,1,0,null,null);
        Add(556, 54,36,0,0,1,1,1,0,null,null);
        Add(558, 108,54,0,0,1,1,1,0,null,null);
        Add(559, 108,54,0,0,1,1,1,0,null,null);
        Add(560, 36,54,1,0,1,1,0,0,null,null);
        Add(564, 36,36,0,0,1,1,1,0,null,null);
        Add(565, 36,36,0,0,1,1,1,0,null,null);
        Add(567, 28,40,1,0,1,1,1,0,null,null);
        Add(568, 36,36,0,0,1,1,1,0,null,null);
        Add(569, 36,36,0,0,1,1,1,0,null,null);
        Add(570, 36,36,0,0,1,1,1,0,null,null);
        Add(572, 18,36,0,6,1,1,1,0,null,new TodAlt[]{A(0,0,1,0)});
        Add(573, 36,36,1,0,1,1,1,0,null,new TodAlt[]{A(1,0,1,0),A(2,0,1,0),A(3,0,1,0),A(4,0,1,0)});
        Add(579, 22,22,1,0,1,1,1,0,null,new TodAlt[]{A(1,0,1,0)});
        Add(580, 36,36,0,0,1,1,1,0,null,null);
        Add(581, 18,36,0,0,1,1,1,0,null,new TodAlt[]{A(0,0,1,0)});
        Add(582, 54,36,0,0,1,1,1,0,null,null);
        Add(590, 18,38,1,0,3,1,0,0,null,null);
        Add(591, 36,54,1,0,1,1,1,0,null,new TodAlt[]{A(0,0,1,0)});
        Add(592, 36,54,1,0,1,1,1,0,null,new TodAlt[]{A(0,0,1,0)});
        Add(593, 18,18,0,0,1,1,1,0,null,null);
        Add(594, 36,36,0,0,1,1,1,0,null,null);
        Add(595, 18,38,1,0,3,1,0,0,null,null);
        Add(597, 54,72,1,0,1,1,0,0,null,null);
        Add(598, 36,36,0,0,1,1,1,0,null,null);
        Add(599, 108,54,0,0,1,1,1,0,null,null);
        Add(600, 108,54,0,0,1,1,1,0,null,null);
        Add(601, 108,54,0,0,1,1,1,0,null,null);
        Add(602, 108,54,0,0,1,1,1,0,null,null);
        Add(603, 108,54,0,0,1,1,1,0,null,null);
        Add(604, 108,54,0,0,1,1,1,0,null,null);
        Add(605, 108,54,0,0,1,1,1,0,null,null);
        Add(606, 108,54,0,0,1,1,1,0,null,null);
        Add(607, 108,54,0,0,1,1,1,0,null,null);
        Add(608, 108,54,0,0,1,1,1,0,null,null);
        Add(609, 108,54,0,0,1,1,1,0,null,null);
        Add(610, 108,54,0,0,1,1,1,0,null,null);
        Add(611, 108,54,0,0,1,1,1,0,null,null);
        Add(612, 108,54,0,0,1,1,1,0,null,null);
        Add(613, 54,90,1,0,1,1,0,0,null,null);
        Add(614, 54,108,1,0,1,1,0,0,null,null);
        Add(615, 18,38,1,0,3,1,0,0,null,null);
        Add(617, 54,72,0,2,2,1,0,0,null,new TodAlt[]{A(1,0,0,0)});
        Add(619, 54,36,0,0,1,1,1,0,null,null);
        Add(620, 36,36,0,0,1,1,1,0,null,null);
        Add(621, 36,36,0,0,1,1,1,0,null,null);
        Add(622, 36,36,0,0,1,1,1,0,null,null);
        Add(623, 36,90,1,0,1,1,1,0,null,null);
        Add(624, 18,18,0,0,1,1,1,0,null,null);
        Add(629, 54,36,0,0,1,1,1,0,null,null);
        Add(630, 18,18,1,0,1,1,1,0,null,new TodAlt[]{A(1,0,1,0),A(2,0,1,0),A(3,0,1,0),A(4,0,1,0)});
        Add(631, 18,18,1,0,1,1,1,0,null,new TodAlt[]{A(1,0,1,0),A(2,0,1,0),A(3,0,1,0),A(4,0,1,0)});
        Add(632, 108,54,0,0,1,1,1,0,null,null);
        Add(639, 36,36,0,0,1,1,1,0,null,null);
        Add(640, 108,54,0,0,1,1,1,0,null,null);
        Add(642, 54,54,0,0,1,1,1,0,null,null);
        Add(643, 108,54,0,0,1,1,1,0,null,null);
        Add(644, 108,54,0,0,1,1,1,0,null,null);
        Add(645, 108,54,0,0,1,1,1,0,null,null);
        Add(646, 18,22,0,0,1,1,1,0,null,null);
        Add(647, 54,36,1,0,1,1,1,0,null,null);
        Add(648, 54,36,1,35,1,1,1,0,null,null);
        Add(649, 36,18,1,53,1,1,1,0,null,null);
        Add(650, 18,18,1,0,1,1,1,0,null,null);
        Add(651, 54,36,1,0,1,1,1,0,null,null);
        Add(652, 36,36,1,0,1,1,1,0,null,null);
        Add(653, 36,36,1,3,1,1,1,0,null,null);
        Add(654, 36,38,0,0,1,1,1,0,null,null);
        Add(656, 18,18,0,0,1,1,1,0,null,null);
        Add(657, 36,54,1,0,1,1,0,0,null,null);
        Add(658, 36,54,1,0,1,1,0,0,null,null);
        Add(660, 18,36,0,0,1,1,1,0,null,new TodAlt[]{A(0,0,1,0)});
        Add(663, 36,54,1,0,1,1,0,0,null,null);
        Add(664, 36,38,0,0,1,1,0,0,null,null);
        Add(665, 36,36,0,0,1,1,1,0,null,null);
        Add(693, 18,18,1,39,1,1,1,0,new (int,TodSub)[]{(39,S(39,1,0)),(40,S(40,1,0)),(41,S(41,1,0)),(42,S(42,1,0)),(43,S(43,1,0)),(44,S(44,1,0)),(45,S(45,1,0)),(46,S(46,1,0)),(47,S(47,1,0)),(48,S(48,1,0)),(49,S(49,1,0)),(50,S(50,1,0)),(51,S(51,1,0)),(52,S(52,1,0)),(53,S(53,1,0)),(54,S(54,1,0)),(55,S(55,1,0)),(56,S(56,1,0)),(57,S(57,1,0)),(58,S(58,1,0)),(59,S(59,1,0)),(60,S(60,1,0)),(61,S(61,1,0)),(62,S(62,1,0)),(63,S(63,1,0)),(64,S(64,1,0)),(65,S(65,1,0)),(66,S(66,1,0)),(67,S(67,1,0)),(68,S(68,1,0)),(69,S(69,1,0)),(70,S(70,1,0)),(71,S(71,1,0)),(72,S(72,1,0)),(73,S(73,1,0)),(74,S(74,1,0)),(75,S(75,1,0)),(76,S(76,1,0)),(77,S(77,1,0))},null);
        Add(694, 18,36,1,39,1,1,1,0,new (int,TodSub)[]{(39,S(39,1,0)),(40,S(40,1,0)),(41,S(41,1,0)),(42,S(42,1,0)),(43,S(43,1,0)),(44,S(44,1,0)),(45,S(45,1,0)),(46,S(46,1,0)),(47,S(47,1,0)),(48,S(48,1,0)),(49,S(49,1,0)),(50,S(50,1,0)),(51,S(51,1,0)),(52,S(52,1,0)),(53,S(53,1,0)),(54,S(54,1,0)),(55,S(55,1,0)),(56,S(56,1,0)),(57,S(57,1,0)),(58,S(58,1,0)),(59,S(59,1,0)),(60,S(60,1,0)),(61,S(61,1,0)),(62,S(62,1,0)),(63,S(63,1,0)),(64,S(64,1,0)),(65,S(65,1,0)),(66,S(66,1,0)),(67,S(67,1,0)),(68,S(68,1,0)),(69,S(69,1,0)),(70,S(70,1,0)),(71,S(71,1,0)),(72,S(72,1,0)),(73,S(73,1,0)),(74,S(74,1,0)),(75,S(75,1,0)),(76,S(76,1,0)),(77,S(77,1,0))},null);
        Add(695, 54,38,1,0,1,1,0,0,null,null);
        Add(696, 36,36,1,0,1,1,1,0,null,null);
        Add(698, 18,36,1,0,1,1,1,0,new (int,TodSub)[]{(1,S(1,1,0)),(2,S(2,1,0))},null);
        Add(699, 72,72,1,0,1,1,1,0,null,null);
        Add(700, 22,18,0,0,1,1,1,0,null,null);
        Add(701, 26,36,0,0,1,1,1,0,null,null);
        Add(702, 36,36,1,0,1,1,1,1,null,null);
        Add(703, 18,18,1,0,1,1,1,0,null,null);
        Add(704, 54,36,1,0,1,1,0,0,null,null);
        Add(705, 54,36,1,9,1,1,0,0,null,null);
        Add(706, 54,36,1,0,1,1,1,0,null,null);
        Add(707, 18,18,1,0,1,1,1,0,null,null);
        Add(710, 108,54,0,0,1,1,1,0,null,null);
        Add(711, 36,38,0,0,1,1,0,0,null,null);
        Add(712, 36,38,0,0,1,1,0,0,null,null);
        Add(713, 36,36,0,0,1,1,1,0,null,null);
        Add(714, 36,36,0,0,1,1,1,0,null,null);
        Add(715, 36,36,0,0,1,1,1,0,null,null);
        Add(716, 36,36,0,0,1,1,1,0,null,null);
        Add(720, 36,54,1,0,2,1,0,0,null,new TodAlt[]{A(1,0,0,0)});
        Add(721, 36,54,1,0,2,1,0,0,null,new TodAlt[]{A(1,0,0,0)});
        Add(723, 18,18,1,0,1,1,0,0,null,new TodAlt[]{A(1,0,0,0),A(2,0,0,0),A(3,0,0,0),A(4,0,0,0)});
        Add(724, 18,18,1,5,5,1,0,0,null,new TodAlt[]{A(1,0,0,0),A(2,0,0,0),A(3,0,0,0),A(4,0,0,0)});
        Add(725, 36,54,1,0,2,1,0,0,null,new TodAlt[]{A(1,0,0,0)});
        Add(733, 54,54,0,0,1,1,1,0,null,null);
        Add(751, 36,36,0,0,1,1,1,0,null,null);
        Add(752, 36,36,0,0,1,1,1,0,null,null);
        return d;
    }
    static TodSub S(int style, int dl, int dw, params TodAlt[] alts)
        => new TodSub { DL = dl, DW = dw, Alts = alts.Length > 0 ? alts : Array.Empty<TodAlt>() };
    static TodAlt A(int a0, int a1, int dl, int dw) => new TodAlt { A0 = a0, A1 = a1, DL = dl, DW = dw };
}
