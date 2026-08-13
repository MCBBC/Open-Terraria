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
const int W = 4200, H = 1200;
const int BEACH_DISTANCE = 380; // WorldGen.beachDistance（cs:4102）

var asm = Assembly.LoadFrom("/Users/vinlic/Library/Application Support/Steam/steamapps/common/Terraria/Terraria.app/Contents/Resources/Terraria.exe");
dynamic r = Activator.CreateInstance(asm.GetType("Terraria.Utilities.UnifiedRandom")!, seed)!;


// ---- 网格（vanilla tile id；行主序 y*W+x，同 JS TileStore）----
var act = new byte[W * H];
var typ = new ushort[W * H];
var wal = new ushort[W * H];
var liq = new byte[W * H];
var liqT = new byte[W * H];
var checkpoints = new List<string>();

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

// tileFrameImportant && !tileCut（cs:77217 TileRunner 首门禁）——项目侧近似集，
// 与 JS TileRunner 的 `TILE_DEFS[].framed && !decor` 同源生成（pass 20 起世界出现 165 等活性 framed 物）
// GrowTree 墙白名单（JS TreePass.DEFAULT_TREE_WALLS）与 EmptyTileCheck 空格白名单
// （JS GEM_EMPTY_ALLOW = sheet 3,24,32,61,62,69,71,73,74,82,83,84,110,113,184,201,233,352,485,529,530,637,655）
var TREE_WALLS = new HashSet<ushort> { 0, 150, 138, 145, 107, 152, 140, 139, 141, 106, 245, 315, 317, 63, 64, 65, 66, 67, 68, 69, 81, 70, 264, 268, 265, 74, 80 };
var EMPTY_ALLOW = new HashSet<ushort> { 3, 24, 32, 61, 62, 69, 71, 73, 74, 82, 83, 84, 110, 113, 184, 201, 233, 352, 485, 529, 530, 637, 655 };
var FRAMED_NOT_CUT = new HashSet<ushort> { 5,10,13,16,17,18,21,26,29,36,50,55,77,81,82,86,91,93,97,99,102,103,105,106,110,113,114,125,128,129,132,133,134,135,136,137,138,141,144,165,171,172,178,184,185,186,187,207,215,217,218,219,220,227,228,231,233,235,236,237,238,239,240,241,242,243,245,246,247,254,269,270,271,275,276,277,278,279,280,281,282,283,285,286,287,288,289,290,291,292,293,294,295,296,297,298,299,300,301,302,303,304,305,306,307,308,309,310,314,316,317,318,319,320,323,324,334,337,339,349,354,355,356,358,359,360,361,362,363,364,373,374,375,376,377,378,387,388,389,390,391,392,393,394,395,405,406,411,412,413,414,427,435,436,437,438,439,443,444,453,454,456,457,461,462,463,464,465,466,467,469,470,471,475,476,484,485,486,487,488,489,490,491,493,494,499,505,506,510,511,518,519,520,521,522,523,524,525,526,527,529,530,532,533,538,542,543,544,545,547,548,549,550,551,552,553,554,555,556,558,559,560,567,568,569,570,571,572,573,579,580,581,582,583,584,585,586,587,588,589,590,591,592,595,596,597,598,599,600,601,602,603,604,605,606,607,608,609,610,611,612,613,614,615,616,617,619,620,621,622,623,624,629,630,631,632,634,637,639,640,642,643,644,645,646,647,648,649,650,651,652,653,654,656,657,658,660,663,664,665,693,694,695,696,698,699,700,701,702,703,704,705,706,707,709,710,711,712,713,714,715,716,720,721,723,724,725,726,733,751,752 };
var NOT_CLEAR = new HashSet<ushort> { 396, 400, 401, 397, 398, 399, 404, 368, 367, 41, 43, 44, 481, 482, 483, 226, 237 };
bool CanBeCleared(ushort t) => !NOT_CLEAR.Contains(t);
bool IsSolidT(ushort t) => SOLID.Contains(t);
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
int WorldIdV = (int)r.Next(int.MaxValue);                     // WorldId
r.Next(1050, 3150);                                           // treeX[0]
int ts0 = (int)r.Next(6); int ts1 = (int)r.Next(6);
while (ts1 == ts0) ts1 = (int)r.Next(6);
for (int i = 0; i < 2; i++) { int s = i == 0 ? ts0 : ts1; if (s == 0) r.Next(3); }
r.Next(1050, 3150);                                           // caveBackX[0]
int cb0 = (int)r.Next(8); int cb1 = (int)r.Next(8);
while (cb1 == cb0) cb1 = (int)r.Next(8);
// RandomizeCaveBackgrounds 尾部无条件 3 掷(cs:8211-8213;2026-08-12 审计补)
int IceV = 0, JunV = 0, HellV = 0;
// ★诊断开关：DROP_TAIL3=1 时摘除（验证磁盘反编译与真 exe 的差）
if (Environment.GetEnvironmentVariable("DROP_TAIL3") != "1") { IceV = (int)r.Next(4); HellV = (int)r.Next(3); JunV = (int)r.Next(2); }
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
int MoonV = (int)r.Next(9);                                   // moonType
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

var TraceCols = new List<string>();
// ★诊断：terrain 前额外吞 k 掷（环境变量 EXTRA_ROLLS），验证 Reset/terrain 流错位假设
int extraK = 0;
{ var ek = Environment.GetEnvironmentVariable("EXTRA_ROLLS"); if (ek != null) int.TryParse(ek, out extraK); }
for (int q = 0; q < extraK; q++) r.Next();
// ★诊断：Reset 产物逐值打印（对比 wld 头部定位首个分叉掷）
Console.WriteLine($"RESETVALS worldId={WorldIdV} ts0={ts0} ts1={ts1} cb0={cb0} cb1={cb1} ice={IceV} jun={JunV} hell={HellV} moon={MoonV} side={dungeonRight} jx={jungleX} num7={num7} snowL={snowL} snowR={snowR} lb={leftBeachEnd} rb={rightBeachStart} dl={dungeonLocation}");
// ================= TerrainPass（cs:56-244）=================
int feature = 0, counter = leftBeachEnd + flatBeachPadding();
static int flatBeachPadding() => 5;
double num3w = (double)H * 0.3;
num3w *= (double)(int)r.Next(90, 110) * 0.005;
double num4w = num3w + (double)H * 0.2;
num4w *= (double)(int)r.Next(90, 110) * 0.01;
double num5w = num3w, num6w = num3w, num7w = num4w, num8w = num4w;
double num9t = (double)H * 0.23;
double num10 = 0.17 + 0.02, num11 = 0.26;
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
    // ★诊断 NUM4FLIP/NUM4STEP/NUM4COND 变体扫描（鉴别真 IL 语义）
    {
        int stepHi = 3; var sh = Environment.GetEnvironmentVariable("NUM4STEP"); if (sh != null) int.TryParse(sh, out stepHi);
        int condHi = 3; var ch2 = Environment.GetEnvironmentVariable("NUM4COND"); if (ch2 != null) int.TryParse(ch2, out condHi);
        bool flip = Environment.GetEnvironmentVariable("NUM4FLIP") == "1";
        bool cont = (int)r.Next(0, condHi) == 0;
        if (flip) cont = !cont;
        while (cont) { num4w += (int)r.Next(-2, stepHi); cont = (int)r.Next(0, condHi) == 0; if (flip) cont = !cont; }
    }
    if (num4w < num3w + H * 0.06) num4w += 1.0;
    if (num4w > num3w + H * 0.35) num4w -= 1.0;
    history.Add(num3w);
    if (Environment.GetEnvironmentVariable("TRACE_COLS") != null) TraceCols.Add($"{i},{feature},{counter},{num3w:F3},{num4w:F3}");
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

if (Environment.GetEnvironmentVariable("TRACE_COLS") != null) File.WriteAllText(Environment.GetEnvironmentVariable("TRACE_COLS"), string.Join("\n", TraceCols));

Console.WriteLine($"terrain ok: worldSurface={worldSurface} rockLayer={rockLayer} waterLine={waterLine} lavaLine={lavaLine}");
if (Environment.GetEnvironmentVariable("TERRAIN_ONLY") == "1") { Console.WriteLine("TERRAIN_ONLY exit"); return; }

// ================= 原语 =================
bool mudWallFlag = false;
void TileRunner(double i, double j, double strength, int steps, int type,
    bool addTile = false, double speedX = 0.0, double speedY = 0.0, bool noYChange = false,
    bool overRide = true, int ignoreTileType = -1)
{
    double num1 = strength, num2 = steps;
    double px = i, py = j;
    double vx = (int)r.Next(-10, 11) * 0.1, vy = (int)r.Next(-10, 11) * 0.1;
    if (speedX != 0.0 || speedY != 0.0) { vx = speedX; vy = speedY; }
    int num3l = 0;
    r.Next(4); // num3 液体类型（普通世界结果弃用）
    while (num1 > 0.0 && num2 > 0.0)
    {
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
                        if (wal[(y-1) * W + x] != 64 && wal[(y+1) * W + x] != 64 && wal[y * W + x - 1] != 64 && wal[y * W + x + 1] != 64) wal[ti] = 15;
                    }
                    else if (wal[(y-1) * W + x] != 15 && wal[(y+1) * W + x] != 15 && wal[y * W + x - 1] != 15 && wal[y * W + x + 1] != 15)
                    {
                        wal[ti] = 64;
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
                    if (!flag4) typ[ti] = (ushort)type;
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

// ================= Pass 1：Dunes（cs:11540-11602 + DunesBiome.cs + SurfaceMap.cs）=================
int dungeonTheme = (int)r.Next(3); // DungeonCrawler.SetupDungeonGenVarVariables（cs:11542 + DungeonCrawler.cs:56）——地牢砖主题 0/1/2=蓝/绿/粉
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
OreBand(W * H * 0.005, (int)gvRockLayerLow, H - 1, 0, 2, 5, 2, 39);
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
    Move(ref jx, ref jy, 250, 150); zeroX += jx; zeroY += jy;
    PlaceFirstPassMud(jx, jy, 0);
    PlaceGemsAt(jx, jy, 65, 2);
    int oldX = jx, oldY = jy;
    Move(ref jx, ref jy, 400, 150); zeroX += jx; zeroY += jy;
    PlaceFirstPassMud(jx, jy, -3);
    PlaceGemsAt(jx, jy, 67, 2);
        jx = zeroX / 3; jy = zeroY / 3;
    int bigNum = (int)r.Next((int)(400 * ws), (int)(600 * ws));
    int pad = (int)(25 * ws);
    jx = Math.Clamp(jx, leftBeachEnd + bigNum / 2 + pad, rightBeachStart - bigNum / 2 - pad);
    mudWallFlag = true;
    TileRunner(jx, jy, bigNum, 10000, 59, false, 0.0, -20.0, true);
    mudWallFlag = false;
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
                    act[y * W + x] = 0;
        num2++;
        if (num2 > 10 && (int)r.Next(50) < num2)
        {
            num2 = 0;
            // 原版 num4=-2; if(Next(2)==0) num4=2（JunglePass.cs:178-182）——Next(2)==0 → +2
            int side = (int)r.Next(2) == 0 ? 2 : -2;
            TileRunner((int)px, (int)py, (int)r.Next(3, 20), (int)r.Next(10, 100), -1, false, side);
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
        int hx = (int)r.Next(20, W - 20), hy = (int)r.Next(worldSurface + 10, H - 200);
        while (!(wal[hy * W + hx] == 64 || wal[hy * W + hx] == 15))
        { hx = (int)r.Next(20, W - 20); hy = (int)r.Next(worldSurface + 10, H - 200); }
        MudWallRunner(hx, hy);
    }
    // GenerateFinishingTouches（cs:219-280）
    int fx = oldX, fy = oldY;
    for (int i = 0; (double)i <= 20.0 * ws; i++)
    {
        fx += (int)r.Next((int)(-5 * ws), (int)(6 * ws));
        fy += (int)r.Next((int)(-5 * ws), (int)(6 * ws));
        TileRunner(fx, fy, (int)r.Next(40, 100), (int)r.Next(300, 500), 59);
    }
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
}
Checkpoint("jungle");

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

// ================= Desert Sub-A（DesertBiome pass cs:12532 + DesertDescription + SandMound）=================
// Sub-B（DesertHive）与 Sub-C（入口 4 形状）转录至 Checkpoint("desertdone")。
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
    // All(data)+Smooth：仅坡面/半砖——哈希无关，两侧一致省略
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
    // All(data)+Offset(0,1)+Expand(1)+IsSolid+Smooth：仅坡面——哈希无关，省略
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
            if (Math.Abs(i) < num3 + 3 && (double)(j - py) > 15.0 - 3.0 * num4) wal[ti] = 187;
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
void PlaceDesertDeco(int dx0, int dyBot, ushort dtile, int dfw, int dfh)
{
    for (int ddx = 0; ddx < dfw; ddx++)
        for (int ddy = 0; ddy < dfh; ddy++)
        {
            int dax = dx0 + ddx, day = dyBot - ddy;
            if (dax < 0 || day < 0 || dax >= W || day >= H) return;
            act[day * W + dax] = 1;
            typ[day * W + dax] = dtile;
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
                wal[hti] = 187;
                if (f2 % 15 == 2) { typ[hti] = 404; act[hti] = 1; liq[hti] = 0; }  // ResetToType
            }
            else if (f7 > 1.8)
            {
                wal[hti] = 187;
                if ((double)hj < (double)worldSurface) liq[hti] = 0;     // else lava()：liq 量不变
                else liqT[hti] = 1;                                      // ★lava 类型位（JS liquidType=2）
                if (!hEdge || act[hti] != 0) { typ[hti] = 396; act[hti] = 1; liq[hti] = 0; }
            }
            else if (f7 > 0.7 || !hEdge)
            {
                wal[hti] = 216;
                liq[hti] = 0;
                if (!hEdge || act[hti] != 0) { typ[hti] = hType; act[hti] = 1; liq[hti] = 0; }
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
                    if (act[hti] != 0) { typ[hti] = hType; act[hti] = 1; liq[hti] = 0; }
                }
            }
            else hFlag2 = false;
            // hFlag2 → UpdateDesertHiveBounds（纯边界追踪，无哈希效应）
        }
    }

    // ---- AddTileVariance（DesertHive.cs:413-499）----
    for (int vi = -20; vi < dW + 20; vi++)
    {
        for (int vj = -20; vj < dH + 20; vj++)
        {
            int vx2 = vi + dX, vy2 = vj + dHiveTop;
            if (vx2 < 1 || vx2 >= W - 1 || vy2 < 1 || vy2 >= H - 1) continue;
            int vti = vy2 * W + vx2;
            bool vs1 = vy2 + 1 < H && act[(vy2 + 1) * W + vx2] != 0 && SOLID.Contains(typ[(vy2 + 1) * W + vx2]);
            bool vs2 = vy2 + 2 < H && act[(vy2 + 2) * W + vx2] != 0 && SOLID.Contains(typ[(vy2 + 2) * W + vx2]);
            if (typ[vti] == 53 && (!vs1 || !vs2)) typ[vti] = 397;
        }
    }
    // placeTight（ShimmerPass.ts:227）哈希镜像：两掷恒耗 + 钟乳石 1x1/1x2 放置
    Action<int, int> PlaceTightMirror = (tx, ty) =>
    {
        int ti0 = ty * W + tx;
        if (liq[ti0] > 0 && liqT[ti0] == 3) return;                 // shimmer（oracle 编码 3）
        if (act[ti0] != 0 && typ[ti0] == 231) return;               // 幼虫
        bool preferSmall = (int)r.Next(2) == 0;
        int variation = (int)r.Next(3);
        if (tx < 0 || tx >= W || ty < 0 || ty + 1 >= H) return;
        Func<int, int, int> SheetOf = (sx, sy) => (sx < 0 || sx >= W || sy < 0 || sy >= H || act[sy * W + sx] == 0) ? -1 : typ[sy * W + sx];
        Func<int, bool> BaseOk = a => a == 1 || a == 117 || a == 25 || a == 203 || a == 396 || a == 397 || a == 368 || a == 367 || a == 147 || a == 161 || a == 163 || a == 164 || a == 200;
        Action<int, int> Put165 = (px2, py2) => { int pi = py2 * W + px2; typ[pi] = 165; act[pi] = 1; };
        Func<int, int, bool> SolidAt = (sx, sy) => sx >= 0 && sx < W && sy >= 0 && sy < H && act[sy * W + sx] != 0 && SOLID.Contains(typ[sy * W + sx]);
        // 垂挂：上方实心 + 本格/下格净空
        if (SolidAt(tx, ty - 1) && act[ti0] == 0 && act[(ty + 1) * W + tx] == 0)
        {
            int above = SheetOf(tx, ty - 1);
            if (BaseOk(above)) { Put165(tx, ty); if (!preferSmall) Put165(tx, ty + 1); }
            if (above == 225) Put165(tx, ty);
            return;
        }
        // 地面：下方实心 + 本格/上格净空
        if (!SolidAt(tx, ty + 1) || act[ti0] != 0 || act[(ty - 1) * W + tx] != 0) return;
        int below = SheetOf(tx, ty + 1);
        if (BaseOk(below)) { if (preferSmall) Put165(tx, ty); else { Put165(tx, ty - 1); Put165(tx, ty); } }
        if (below == 225) Put165(tx, ty);
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
            // 装饰放置（485/751/484/165/187，DesertHive.cs:466-496）——与 JS DesertPass
            // placeDeco 同锚：2x2/3x2 底行贴 396 顶；165 的 flag 地面/!flag 倒挂。
            // 哈希只看 type/act，帧不计。187 分支成功后补 Next(6)（原版 cs:494-496，
            // 两侧曾一致漏掷——2026-08-12 与 JS 同步补齐）
            if (wFlag && (int)r.Next(20) == 0)
            {
                int wStyle = (int)r.Next(4);
                ushort dType = 485;
                if ((int)r.Next(30) == 0) dType = 751;
                PlaceDesertDeco(wx, wy - 1, dType, 2, 2);
            }
            else if (wFlag && (int)r.Next(5) == 0) { PlaceDesertDeco(wx, wy - 1, 484, 2, 2); }
            else if ((wFlag ^ wFlag2) && (int)r.Next(5) == 0)
            {
                // ★2026-08-13：165 改走 placeTight 镜像（JS ShimmerPass.placeTight 1:1，
                // DesertPass 13:21 版对齐）——锚=py+(flag?-1:+1)、shimmer/幼虫门、
                // Next(2)+Next(3) 两掷恒耗、1x1/1x2 钟乳石格效应（哈希只看 type/act）
                PlaceTightMirror(wx, wFlag ? wy - 1 : wy + 1);
            }
            else if (wFlag && (int)r.Next(5) == 0) { int wS2 = (int)r.Next(6); PlaceDesertDeco(wx, wy - 1, 187, 3, 2); }
        }
    }
}
Checkpoint("deserthive");
Checkpoint("desertdone");   // CleanupArea 仅 SquareWallFrame/TileFrame——无哈希效应

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
                        if (!iwL && !iwR) act[iti] = 0;                 // KillTile（生成期无掉落无 RNG）
                        else if (!iwU && !iwD) act[iti] = 0;
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
                        if (h2y > 0 && typ[(h2y - 1) * W + h2x] == 70) typ[(h2y - 1) * W + h2x] = 59;
                        if (h2y < H - 1 && typ[(h2y + 1) * W + h2x] == 70) typ[(h2y + 1) * W + h2x] = 59;
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
void PlaceStalactite(int x, int y, bool preferSmall, int variation)   // PlaceUncheckedStalactite 哈希通道语义
{
    variation = Math.Clamp(variation, 0, 2);
    void Put(int ax, int ay) { if (ax >= 0 && ax < W && ay >= 0 && ay < H) { typ[ay * W + ax] = 165; act[ay * W + ax] = 1; } }
    if (SolidTileGen(x, y - 1) && y >= 0 && y < H && act[y * W + x] == 0 && y + 1 >= 0 && y + 1 < H && act[(y + 1) * W + x] == 0)
    {
        ushort ab = y - 1 >= 0 ? typ[(y - 1) * W + x] : (ushort)0;
        bool rockFam = ab == 1 || ab == 117 || ab == 25 || ab == 203;   // tileMoss 此阶段无
        if (ab == 147 || ab == 161 || ab == 163 || ab == 164 || ab == 200) { if (preferSmall) Put(x, y); else { Put(x, y); Put(x, y + 1); } }
        if (rockFam) { if (preferSmall) Put(x, y); else { Put(x, y); Put(x, y + 1); } }
        if (ab == 225) Put(x, y);
        if (ab == 396 || ab == 397) { if (preferSmall) Put(x, y); else { Put(x, y); Put(x, y + 1); } }
        if (ab == 368) { if (preferSmall) Put(x, y); else { Put(x, y); Put(x, y + 1); } }
        if (ab == 367) { if (preferSmall) Put(x, y); else { Put(x, y); Put(x, y + 1); } }
    }
    else if (SolidTileGen(x, y + 1) && y >= 0 && y < H && act[y * W + x] == 0 && y - 1 >= 0 && y - 1 < H && act[(y - 1) * W + x] == 0)
    {
        ushort bl = y + 1 < H ? typ[(y + 1) * W + x] : (ushort)0;
        bool rockFam = bl == 1 || bl == 117 || bl == 25 || bl == 203;
        if (rockFam) { if (preferSmall) Put(x, y); else { Put(x, y - 1); Put(x, y); } }
        if (bl == 225) Put(x, y);
        if (bl == 396 || bl == 397) { if (preferSmall) Put(x, y); else { Put(x, y - 1); Put(x, y); } }
        if (bl == 368) { if (preferSmall) Put(x, y); else { Put(x, y - 1); Put(x, y); } }
        if (bl == 367) { if (preferSmall) Put(x, y); else { Put(x, y - 1); Put(x, y); } }
    }
}
void PlaceTightGen(int tx, int ty)   // cs:38329（生成期 shimmer 恒无 → 门禁只剩 231）
{
    if (tx < 0 || tx >= W || ty < 0 || ty >= H) return;
    int tti = ty * W + tx;
    if (act[tti] != 0 && typ[tti] == 231) return;
    PlaceStalactite(tx, ty, (int)r.Next(2) == 0, (int)r.Next(3));
}

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
        int cnt = 0;
        for (int a = 0; a < 3; a++) for (int b = 0; b < 3; b++) if (SolidTileGen(gxx + a, gyy + b)) cnt++;
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
                    if (pWall) wal[pti] = 178;
                    if (SolidTileGen(px, py - 1) && (int)r.Next(4) == 0) PlaceTightGen(px, py);
                    if (SolidTileGen(px, py) && (int)r.Next(4) == 0) PlaceTightGen(px, py - 1);
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
            gRes[a, b] = SolidTileGen(a + gox, b + goy) ? 4.0 : 1.0;
    // 8 邻域单位向量（Vector2D.Normalize）
    double[] nvx = { -0.7071067811865476, -1, -0.7071067811865476, 0, 0, 0, 0.7071067811865476, 1, 0.7071067811865476 };
    double[] nvy = { -0.7071067811865476, 0, 0.7071067811865476, -1, 0, 1, -0.7071067811865476, 0, 0.7071067811865476 };
    int gx3 = 100, gx4 = 100, gy3 = 100, gy4 = 100;
    var tPres = new double[200, 200];
    var tRes = new double[200, 200];
    var tAct = new bool[200, 200];
    for (int it = 0; it < 300; it++)
    {
        for (int a = 0; a < 200; a++) for (int b = 0; b < 200; b++) { tPres[a, b] = gPres[a, b]; tRes[a, b] = gRes[a, b]; tAct[a, b] = gAct[a, b]; }
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
                }
            }
        if (it < 2) { tPres[100, 100] = 25.0; tAct[100, 100] = true; }
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
            if (Math.Max(1.0 - Math.Max(0.0, gnum * gnum2), gPres[i, j] / 15.0) > 0.35 + (SolidTileGen(tx, ty) ? 0.0 : 0.5))
            {
                typ[ti] = IsOre(typ[ti]) ? typ[ti] : (ushort)368;
                act[ti] = 1; liq[ti] = 0;
                wal[ti] = 180;
            }
            else if (gRes[i, j] < 0.01)
            {
                act[ti] = 0;                       // ClearTile
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
            if (tx < 10 || tx >= W - 10 || ty < 10 || ty >= H - 10 || !SolidTileGen(tx, ty)) continue;
            int cnt = 0;
            for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) if (SolidTileGen(tx + a, ty + b)) cnt++;
            if (cnt < 3) cleanList.Add((tx, ty));
        }
    foreach (var cp in cleanList) { act[cp.y * W + cp.x] = 0; wal[cp.y * W + cp.x] = 180; }
    // PlaceDecorations：FastRandom(seed).WithModifier(65440) 独立流
    var gFr = new FR((ulong)(long)seed).Mod(65440UL);
    for (int i = gx3; i <= gx4; i++)
        for (int j = gy3; j <= gy4; j++)
        {
            int tx = gox + i, ty = goy + j;
            if (tx < 10 || tx >= W - 10 || ty < 10 || ty >= H - 10 || !gAct[i, j]) continue;
            var gFr2 = gFr.ModXY(tx, ty);
            if (gFr2.Next(8) == 0 && act[ty * W + tx] != 0)
            {
                if (ty + 1 < H && act[(ty + 1) * W + tx] == 0) PlaceStalactite(tx, ty + 1, gFr2.Next(2) == 0, gFr2.Next(3));
                if (ty - 1 >= 0 && act[(ty - 1) * W + tx] == 0) PlaceStalactite(tx, ty - 1, gFr2.Next(2) == 0, gFr2.Next(3));
            }
            if (gFr2.Next(2) == 0) { /* Tile.SmoothSlope —— 坡面哈希无关 */ }
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
            if (ok) wal[ay * W + an] = 73;
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

// ================= Pass 24 DirtToMud（cs:13172-13191）=================
{
    double dmCount = (double)(W * H) * 0.001;
    for (int dmi = 0; (double)dmi < dmCount; dmi++)
        TileRunner((int)r.Next(0, W), (int)r.Next((int)gvRockLayerLow, H), (int)r.Next(2, 6), (int)r.Next(2, 40), 59, false, 0.0, 0.0, false, true, 53);
}
Checkpoint("dirttomud");

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
        int num6 = (int)r.Next(10);
        if (i == num - 1 || i == num - height) num6 = 0;
        while (((num6 == 5 || num6 == 7) && flagL) || ((num6 == 6 || num6 == 7) && flagR)) num6 = (int)r.Next(10);
        flagL = false; flagR = false;
        if (num6 == 5 || num6 == 7) flagL = true;
        if (num6 == 6 || num6 == 7) flagR = true;
        int num5 = (int)r.Next(3);                              // 干身帧骰（帧值不入哈希）
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
    if (tL || tR) { int k = (int)r.Next(3); Put(tx, num - 1); }
    int crownFx = (int)r.Next(13) != 0 ? 22 : 0;               // 帧值不入哈希，仅保骰
    int crownK = (int)r.Next(3);
    Put(tx, num - height);
}

int[] uwConv={0}, uwCand={0}, uwGrow={0};
// ================= Pass 28 Underworld（cs:13697-13918 普通世界分支）=================
// ★Liquid.QuickWater(-2)（cs:13788）两侧一致省略（液体模拟子系统，见遗留）；
//  AddHellHouses 在 JS 侧为独立槽（本链其后）——两侧一致。
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
            int uwEnd = H - 100 + (int)r.Next(-1, 2);
            for (int uy = H - 300; uy < uwEnd; uy++)
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
        if (typ[(py + 1) * W + i] == 523) ok = false;  // TileID.Sets.Boulders（巨石）
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
                    wal[ti] = 3;
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


// ================= Pass 30 Lakes（cs:14613-14755 + SonOfLakinater cs:80354）=================
// 注：#29 Corruption（cs:13919）未转录——插入位在本块之前（JS 侧在 vanillaBiomes 内已先跑）
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
                            // WillWaterPlacedHereStayPut（JS 近似：下方实心且自身无液体）
                            bool stay = ll + 1 < H && act[(ll + 1) * W + lk] != 0 && liq[lti] == 0;
                            if (stay) { liq[lti] = 255; liqT[lti] = (byte)lType; }
                        }
                        else { liq[lti] = 255; liqT[lti] = (byte)lType; }
                    }
                    act[lti] = 0;                     // 湖腔掏空（type 保留=幽灵，SpreadGrass 邻传两侧一致省略）
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
                    if (ll < lEntr && fx < lnum12 + (double)Math.Abs(ll - lEntr) * 0.5 * lnum13) act[lti] = 0;
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
            if (lkY - lkAnchor <= 10) continue;
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
                // UndergroundDesertLocation.Intersects(±8) —— 墙 187/216 近似（JS 同口径）
                bool lkDesert = false;
                for (int m = -8; m <= 8 && !lkDesert; m++)
                    for (int n = -8; n <= 8; n++)
                    {
                        int mx = lkX0 + m, my = lkY + n;
                        if (mx < 0 || mx >= W || my < 0 || my >= H) continue;
                        ushort wl = wal[my * W + mx];
                        if (wl == 187 || wl == 216 || wl == 217) { lkDesert = true; break; }
                    }
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
// ================= Pass 32 Dungeon（cs:14816 + DungeonCrawler.cs + Legacy* 全家 1:1）=================
// 普通世界 = Legacy 路径：LegacyDungeonLayoutProvider(LegacyDungeonLayout) +
// LegacyDungeonHall / LegacyEntranceDungeonHall / LegacyDungeonRoom / LegacyDungeonEntrance
// + DungeonGlobal{Early/Spikes/Doors/WallVariants/Platforms/BiomeChests/Bookshelves/
//   BasicChests/Lights/Traps/GroundFurniture/Paintings/Banners/Late} 特征管线。
// ★掷骰位移说明：SetupDungeonGenVarVariables 的入口类型 2 掷 + entrance RandomSeed
// 原版在 **Dunes pass 头**消耗（cs:11542，先于中间全部 pass）；本 oracle 与 JS 侧
// 同步**延后到本 pass 头**（相对序保持 A→B→Seed→shelf→lantern→skewed）——
// pre-dungeon 检查点哈希保持现状，两端口径一致。
var dgUR = asm.GetType("Terraria.Utilities.UnifiedRandom")!;
var dgSolidTop = new HashSet<int> { 14,16,18,19,87,88,101,114,134,239,275,276,277,278,279,280,281,285,286,296,297,298,299,309,310,339,358,359,361,362,363,364,376,380,391,392,393,394,405,413,414,427,469,532,533,538,542,544,550,551,553,554,555,556,558,559,582,599,600,601,602,603,604,605,606,607,608,609,610,611,612,619,629,632,640,643,644,645,710 };
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
int dgEntA = (int)r.Next(3);        // 入口类型掷①（普通世界 flag 即真只跑一轮；结果不消费照掷）
int dgEntB = (int)r.Next(3);        // 入口类型掷②
int dgEntSeed = (int)r.Next();      // preGenDungeonEntranceSettings.RandomSeed（Legacy 不预计算位置）
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
bool dgSkewed = (int)r.Next(4) == 0;                                           // cs:274 useSkewedDungeonEntranceHalls
int dgDoorStyle = dungeonTheme == 0 ? 16 : dungeonTheme == 1 ? 17 : 18;        // Item 1411/1412/1413 placeStyle（Item.cs:17460/17472/17484）
// —— 深度锚点（cs:14828-14870）：(ws+rock)/2 ± Next(-200,200)；下方 10 格无实心则下扫
// 到实心；起点即实心则上爬（上限 60）首个非实心再下压 60-num4 ——
int dgX0 = dungeonLocation;
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
bool dgPitFlood = true;             // makeNextPitTrapFlooded（cs:345 初值 true）
int dgLootStyle = 0;                // genVars.dungeonLootStyle
int dgPosX, dgPosY, dgTopX;         // generatingDungeonPositionX/Y + generatingDungeonTopX
int dgDungeonX = 0, dgDungeonY = 0; // Main.dungeonX/Y（老头锚；Early pit 陷阱 num44 下限用）
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
Checkpoint("dungeonL");
// —— 爬升入口大厅（cs:398-449）：上限 100 轮；roomDelay 归零后 1/5 且 y>ws+100 时
// 插入 halls(forceX)+room 分支（位置还原）；legacy 无预计算 → 只走盲爬 ——
dgEntOnSurface = false;
{
    int roomDelay = 5;
    int guard = 100;
    while (!dgEntOnSurface)
    {
        guard--;
        if (guard <= 0) break;
        if (roomDelay > 0) roomDelay--;
        if (roomDelay == 0 && (int)r.Next(5) == 0 && (double)dgPosY > worldSurface + 100.0)
        {
            roomDelay = 10;
            int sx = dgPosX, sy = dgPosY;
            DgHall(new DHall { Seed = (int)r.Next(), ForceX = false });       // MakeDungeon_GetHallSettings(Legacy)
            DgRoom(new DRoom { Seed = (int)r.Next(), X = dgPosX, Y = dgPosY, Start = false });
            dgPosX = sx; dgPosY = sy;
        }
        DgEntHall((int)r.Next());                                             // GenerateNextEntranceHall_Legacy
    }
}
DgEntrance((int)r.Next(), dgEntSeed);   // MakeDungeon_GetEntrance（含 GetEntranceSettings 的 1 颗废弃掷）
Checkpoint("dungeonE");
// —— 门/平台候选收集（cs:456-471：仅 Processed 即 generated 的房/廊）——
for (int i = 0; i < dgRooms.Count; i++) if (dgRooms[i].Generated) DgRoomPlatformsDoors(dgRooms[i]);
for (int i = 0; i < dgHalls.Count; i++) if (dgHalls[i].Generated) DgHallPlatformsDoors(dgHalls[i]);
Checkpoint("dungeonPD");
DgEarly(); Checkpoint("dungeonPi");     // DungeonGlobalEarlyDualDungeonFeatures（Default → 仅 pit 陷阱循环）
DgSpikes(); Checkpoint("dungeonS");     // DungeonGlobalSpikes
DgDoorsF(); Checkpoint("dungeonD");     // DungeonGlobalDoors
DgWallVariants(); Checkpoint("dungeonW"); // DungeonGlobalWallVariants
DgPlatforms(); Checkpoint("dungeonP");    // DungeonGlobalPlatforms
DgBiomeChests(); Checkpoint("dungeonC");  // DungeonGlobalBiomeChests（5 个上锁生物群系箱）
DgBookshelves(); Checkpoint("dungeonB");  // DungeonGlobalBookshelves
DgBasicChests(); Checkpoint("dungeonG");  // DungeonGlobalBasicChests（房间金箱）
dgBounds.Inflate(25);                     // cs:489-490
DgLights(); Checkpoint("dungeonI");       // DungeonGlobalLights
DgTraps(); Checkpoint("dungeonT");        // DungeonGlobalTraps
DgFurniture(); Checkpoint("dungeonF");    // DungeonGlobalGroundFurniture
DgPaintings(); Checkpoint("dungeonPa");   // DungeonGlobalPaintings
DgBanners(); Checkpoint("dungeonBa");     // DungeonGlobalBanners
// Late 双地牢特征（Default 无 BiomeDungeonRoom/BrickGrass → 纯空转）
Checkpoint("dungeon");   // #32 转录落地（原 slush 同态占位已替换）
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
    if (reset) { typ[i] = 0; wal[i] = 0; liq[i] = 0; liqT[i] = 0; act[i] = 0; }
    act[i] = 1; typ[i] = t;
}
void DgChWall(int i, ushort w, bool reset)
{
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
    dgBounds = new DBnd();
    dgBounds.Set(dgPosX, dgPosY, dgPosX, dgPosY);
    int hallSeed = (int)r.Next();      // legacyDungeonHallSettings.RandomSeed（:37）
    int roomSeed = (int)r.Next();      // legacyDungeonRoomSettings.RandomSeed（:42）
    DgRoom(new DRoom { Seed = (int)r.Next(), X = dgPosX, Y = dgPosY, Start = true });   // 起始房（:44-50）
    int roomDelay = 5;
    while (steps > 0)
    {
        dgBounds.Upd(dgPosX, dgPosY);
        steps--;
        if (roomDelay > 0) roomDelay--;
        if (roomDelay == 0 && (int)r.Next(3) == 0)
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
    dgPosX = (int)px; dgPosY = (int)py;
}
// LegacyDungeonHall.LegacyHall（Halls/LegacyDungeonHall.cs:65-876）
void DgHall(DHall s)
{
    dynamic rr = Activator.CreateInstance(dgUR, s.Seed)!;
    double vx = 0, vy = 0;
    int num = (int)(4.0 * 1.0) + (int)rr.Next(2);             // hallStrengthScalar=1
    double px = s.X < 0 ? dgPosX : s.X, py = s.Y < 0 ? dgPosY : s.Y;
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
            num2 = -1; z2x = num2; z2y = 0; vx = num2; vy = 0;
            if ((int)rr.Next(3) == 0) { if ((int)rr.Next(2) == 0) vy = -0.20000000298023224; else vy = 0.20000000298023224; }
        }
        else if (px < 200.0)
        {
            num2 = 1; z2x = num2; z2y = 0; vx = num2; vy = 0;
            if ((int)rr.Next(3) == 0) { if ((int)rr.Next(2) == 0) vy = -0.20000000298023224; else vy = 0.20000000298023224; }
        }
        else if (py >= num6)
        {
            num2 = -1; num++; z2x = 0; z2y = num2; vx = 0; vy = num2;
            if ((int)rr.Next(2) == 0)
            {
                if ((int)rr.Next(2) == 0) vx = (int)rr.Next(20, 50) * 0.01;
                else vx = (-(int)rr.Next(20, 50)) * 0.01;
            }
        }
        else if (py < 200.0)
        {
            num2 = 1; num++; z2x = 0; z2y = num2; vx = 0; vy = num2;
            if ((int)rr.Next(2) == 0)
            {
                if ((int)rr.Next(2) == 0) vx = (int)rr.Next(20, 50) * 0.01;
                else vx = (-(int)rr.Next(20, 50)) * 0.01;
            }
        }
        else if (f13)
        {
            num2 = 1; num++; z2x = 0; z2y = num2; vx = 0; vy = num2;
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
            num2 = -1; z2y = 0; z2x = num2; vy = 0; vx = num2;
            if ((int)rr.Next(3) == 0) { if ((int)rr.Next(2) == 0) vy = -0.20000000298023224; else vy = 0.20000000298023224; }
        }
        else if (f15)
        {
            num2 = 1; z2y = 0; z2x = num2; vy = 0; vx = num2;
            if ((int)rr.Next(3) == 0) { if ((int)rr.Next(2) == 0) vy = -0.20000000298023224; else vy = 0.20000000298023224; }
        }
    }
    double sdX = -z2x, sdY = -z2y;                            // startDirection = zero = -zero2
    dgLastHallX = -z2x; dgLastHallY = -z2y;                    // dungeonData.lastDungeonHall = zero
    if (Math.Abs(vx) > Math.Abs(vy) && (int)rr.Next(3) != 0)
        num = (int)((float)num4 * ((float)(int)rr.Next(110, 150) * 0.01f));
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
    int steps = (int)rr.Next(10, 30);
    double num5 = 0.5;
    int n6 = 30, n7 = 10;
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
    dgPosX = (int)px; dgPosY = (int)py;
    hall.SX = sx; hall.SY = sy; hall.EX = px; hall.EY = py;
    hall.SDX = vx; hall.SDY = vy; hall.EDX = vx; hall.EDY = vy;
}
// LegacyDungeonEntrance.LegacyEntrance（Entrances/LegacyDungeonEntrance.cs:31-619）
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
    {
        int n26 = (int)cx, n27 = n6;
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
    int f1 = Math.Max(0, Math.Min(H - 1, n5 - 3 - (int)rr.Next(3)));
    eb.Upd(m8, f1, e1, n5);
    fillIfNotDW(m8, f1, e1, n5);
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
                if (x > 1 && y > 1 && x < W - 2 && y < H - 2 && wal[y * W + x] == 0) wal[y * W + x] = (ushort)dgWall;
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
        for (int x = dL; x < dR; x++)
            for (int y = dT; y < dB; y++)
                if (DgInWorld(x, y, 0)) act[y * W + x] = 0;
        if (num2 < 0) cx -= 1.0;
        int dx = (int)cx, dy = (int)cy + 1;                  // PlaceTile((int)val.X, (int)val.Y+1)（val.Y=cy+1）
        DgPlaceDoor(dx, dy, 13);
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
        { dgPlats.Add(new DPlat { X = x, Y = num3 - 1, Hall = false }); f2 = true; }
        if (!f3 && DgInWorld(x, num4 + 1, 0) && act[(num4 + 1) * W + x] == 0)
        { dgPlats.Add(new DPlat { X = x, Y = num4 + 1, Hall = false }); f3 = true; }
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
    if (Math.Abs(h.SDY) <= 0.1) dgDoors.Add(new DDoor { X = (int)h.SX, Y = (int)h.SY, Dir = 0, Hall = true, Clear = true });
    else dgPlats.Add(new DPlat { X = (int)h.SX, Y = (int)h.SY, Hall = true });
    if (Math.Abs(h.EDY) <= 0.1) dgDoors.Add(new DDoor { X = (int)h.EX, Y = (int)h.EY, Dir = 0, Hall = true, Clear = true });
    else dgPlats.Add(new DPlat { X = (int)h.EX, Y = (int)h.EY, Hall = true });
}
// —— DungeonGlobalEarlyDualDungeonFeatures（Default：仅尾部 pit 陷阱循环，cs:662-700）——
void DgEarly()
{
    int cnt = (int)(W * 2.0 * 1.0);
    for (int n = 0; n < cnt; n++)
    {
        int x3 = (int)r.Next(dgBounds.L, dgBounds.R);
        int n44 = dgBounds.T;
        if (n44 < dgDungeonY + 25) n44 = dgDungeonY + 25;
        if (n44 < worldSurface) n44 = worldSurface;
        int y2 = (int)r.Next(n44, dgBounds.B);
        bool flooded = dgPitFlood || (int)r.Next(8) == 0;
        int n45 = (int)r.Next(6, 10);
        int wid = (int)r.Next(8, 19), hgt = (int)r.Next(19, 46), ew = (int)r.Next(6, 10);
        if (DgPitTrap(x3, y2, wid, hgt, ew, n45, flooded))
        {
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
    int num = dgWallVariants[0];
    double num6 = Math.Max(1.0, 1.0 * 0.25);
    int num7 = (int)(42f * (W / 4200f) * num6);
    for (int round = 0; round < 2; round++)
    {
        int n3 = 0, n4 = 1000, n5 = 0;
        while (n5 < num7)
        {
            n3++;
            int x = (int)r.Next(dgBounds.L, dgBounds.R);
            int y = (int)r.Next(worldSurface + 25, dgBounds.B);
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
                    // 第一段：沿主轴负向刻尖刺
                    int n11 = (int)r.Next(5, 13);
                    int cx = round == 0 ? wx - 1 : wx, cy = round == 0 ? wy : wy - 1;
                    DgSpikeRun(round, ref cx, ref cy, wx, wy, d, ref n11, step: round == 0 ? -1 : 0, decY: round != 0);
                    // 第二段：沿主轴正向刻尖刺
                    n11 = (int)r.Next(5, 13);
                    cx = round == 0 ? x + 1 : wx; cy = round == 0 ? wy : wy + 1;
                    DgSpikeRun(round, ref cx, ref cy, wx, wy, d, ref n11, step: round == 0 ? 1 : 0, decY: round != 0);
                }
            }
            if (n3 > n4) { n3 = 0; n5++; }
        }
    }
}
// 单段尖刺刻划（DungeonGlobalSpikes.cs:950-999 round0 / :1047-1096 round1）
void DgSpikeRun(int round, ref int cx, ref int cy, int wx, int wy, int d, ref int n11, int step, bool decY)
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
        int num2 = 20, num4 = d.Fluff;
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
void DgPlatforms()
{
    for (int i = 0; i < dgPlats.Count; i++)
    {
        var d = dgPlats[i];
        if (!DgInWorld(d.X, d.Y, 30)) continue;
        int style = -1;                                        // platformItemType 1384-1386 不消费（OverrideStyle=-1）
        int x = d.X, y = d.Y;
        int row = -1;
        int n3 = 5, n4 = y < worldSurface + 50.0 ? 20 : 10;
        double n5 = d.Hall ? 1.0 : 1.0;                        // HallSizeScalar=RoomSizeScalar=1
        n4 = (int)(n4 * n5);
        for (int j = y - n3; j <= y + n3; j++)
        {
            int n6 = x, n7 = x;
            bool bad = false;
            if (act[j * W + x] != 0) bad = true;
            else
            {
                while (DgInWorld(n6, j, 0) && act[j * W + n6] == 0)
                {
                    n6--;
                    if (!DgInWorld(n6, j, 0)) { break; }
                    if (act[j * W + n6] != 0 && !DgIsDT(typ[j * W + n6])) { bad = true; break; }
                    if (n6 <= 10) break;
                }
                while (DgInWorld(n7, j, 0) && act[j * W + n7] == 0)
                {
                    n7++;
                    if (!DgInWorld(n7, j, 0)) { break; }
                    if (act[j * W + n7] != 0 && !DgIsDT(typ[j * W + n7])) { bad = true; break; }
                    if (n7 >= W - 10) break;
                }
            }
            if (bad || n7 - n6 > n4) continue;
            bool ok = true;
            int a0 = Math.Max(0, x - n4 / 2 - 2), a1 = Math.Min(W - 1, x + n4 / 2 + 2);
            int b0 = j - n3, b1 = j + n3;
            for (int a = a0; a <= a1 && ok; a++)
                for (int b = b0; b <= b1; b++)
                    if (DgInWorld(a, b, 0) && act[b * W + a] != 0 && typ[b * W + a] == 19) { ok = false; break; }
            if (ok)
                for (int b = j + 3; b >= j - 5; b--)
                    if (DgInWorld(x, b, 0) && act[b * W + x] != 0) { ok = false; break; }
            if (ok) { row = j; break; }
        }
        if (row <= y - n3 - 5 || row >= y + n3 + 5) continue;
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
        // 书架平台（PlaceBooksChance 等）Default 无 → IsAShelf=false
    }
}
// —— Prefix(-1) 掷骰（Item.cs:486-560 + GetRollablePrefixes:1083 + PrefixLegacy.Prefixes）——
static readonly int[] DgPreSwords = { 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,36,37,38,53,54,55,39,40,56,41,57,42,43,44,45,46,47,48,49,50,51,59,60,61,81 };
static readonly int[] DgPreSpears = { 36,37,38,53,54,55,39,40,56,41,57,59,60,61 };
static readonly int[] DgPreGuns = { 16,17,18,19,20,21,22,23,24,25,58,36,37,38,53,54,55,39,40,56,41,57,42,44,45,46,47,48,49,50,51,59,60,61,82 };
static readonly int[] DgPreMagic = { 26,27,28,29,30,31,32,33,34,35,52,36,37,38,53,54,55,39,40,56,41,57,42,43,44,45,46,47,48,49,50,51,59,60,61,83 };
static readonly int[] DgPreSummon = { 85,86,87,88,89,90,91,92,93,94,95,96,97,55,38,54,53,57,40,56,41,39 };
static readonly int[] DgPreBoom = { 36,37,38,53,54,55,39,40,56,41,57,59,60,61 };
static readonly int[] DgPreAcc = { 62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80 };
static readonly HashSet<int> DgPreReduced = new HashSet<int> { 7,8,9,10,11,22,23,24,29,30,31,39,40,56,41,47,48,49 };
int[] DgPrefixClass(int item) => item switch
{
    155 => DgPreSwords, 156 => DgPreAcc, 157 => DgPreMagic, 163 => DgPreSpears, 113 => DgPreMagic,
    3317 => DgPreBoom, 164 => DgPreGuns, 1156 => DgPreGuns, 1571 => DgPreBoom, 1569 => DgPreBoom,
    1260 => DgPreMagic, 1572 => DgPreSummon, 4607 => DgPreSummon, 5465 => DgPreAcc, _ => null
};
void DgPrefixRolls(int item)
{
    var arr = DgPrefixClass(item);
    if (arr == null) return;                                   // CanHavePrefixes=false（钥匙/药水/锭…）
    if ((int)r.Next(4) != 0)
    {
        int rolled = arr[(int)r.Next(arr.Length)];
        if (DgPreReduced.Contains(rolled)) r.Next(3);
    }
}
bool dgShadowKey = false, dgRamRune = false;                   // GenVars.generatedShadowKey/RamRune
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
        // PlaceChest（:57828）：±2 无滚石 + 2×2 净空
        int px = i - 1, py = num7 - 1;
        if (!DgInWorld(px, py, 0) || !DgInWorld(px + 1, py + 1, 0)) continue;
        if (typ[(py + 1) * W + px] == 138 || typ[(py + 1) * W + px + 1] == 138) continue;
        bool free = true;
        for (int a = 0; a < 2 && free; a++)
            for (int b = 0; b < 2; b++)
                if (act[(py + b) * W + px + a] != 0) { free = false; break; }
        if (!free) continue;
        for (int a = 0; a < 2; a++)
            for (int b = 0; b < 2; b++)
            {
                int ti = (py + b) * W + px + a;
                act[ti] = 1; typ[ti] = chestTile;              // PlaceChestDirect 语义
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
            if (r.Next(2) == 0) { r.Next(2); r.Next(8) + 3; }
            if (r.Next(2) == 0) r.Next(50, 101);                // 绳 965
            if (r.Next(3) != 0) { r.Next(2); r.Next(26) + 25; }
            if (r.Next(2) == 0) r.Next(3) + 3;                  // 药水 28
            if (r.Next(3) != 0) r.Next(3, 6);                   // 回城 2350
            if (r.Next(3) > 0) { r.Next(6); r.Next(1, 3); }
            if (r.Next(2) == 0) { r.Next(2); r.Next(11) + 10; }
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
                else if (r.Next(20) == 0) { r.Next(26) + 25; }
            }
            if (flag3) { if (r.Next(3) == 0) r.Next(10, 20); }
            else if (r.Next(3) == 0) r.Next(10, 20);
            if (r.Next(5) == 0) { }                             // 天使雕像 52
            if (r.Next(3) == 0) r.Next(50, 101);
            if (r.Next(2) == 0) { r.Next(2); r.Next(10) + 5; }
            if (r.Next(2) == 0) { r.Next(2); r.Next(25) + 25; }
            if (r.Next(2) == 0) r.Next(3) + 3;
            if (r.Next(3) > 0) { r.Next(9); r.Next(1, 3); }
            if (r.Next(3) != 0) r.Next(2, 5);
            if (r.Next(2) == 0) r.Next(11) + 10;
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
                else if (num25 == 6) { r.Next(26) + 25; }
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
            if (r.Next(2) == 0) r.Next(6) + 15;                 // 再生药水 227
            if (r.Next(3) > 0) { r.Next(8); r.Next(1, 3); }
            if (r.Next(3) > 1) { r.Next(8); r.Next(1, 3); }
            { r.Next(1, 3); r.Next(2); }
            if (r.Next(2) == 0) { r.Next(2); r.Next(15, 30); }
            if (r.Next(2) == 0) r.Next(2, 5);
        }
        // 尾段（cs:37361-37560）：地牢 flag9 1/8 砍刀 + 上锁箱 1/2 残片 + voice 门 1 掷
        if (flag9 && !flag10) { if (r.Next(8) == 0) { } }
        if (flag10) { if (r.Next(2) == 0) { } }
        r.Next(12);
        return true;
    }
    return false;
}
// —— DungeonGlobalBiomeChests.BiomeChests（:104-180，Default 分支）——
void DgBiomeChests()
{
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
            int num = (int)System.Math.Lerp((double)(rm.Ex - half), rm.Ex + half, (double)r.NextDouble());
            int num2 = (int)System.Math.Lerp((double)(rm.Ey - half), rm.Ey + half, (double)r.NextDouble());
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
                        while (n10 > 0)
                        {
                            int ti = y * W + x;
                            act[ti] = 1; typ[ti] = 19;          // frameY = 18*shelfStyle（不入哈希）
                            if (flag3)
                            {
                                DgPlaceSimple(x, y - 1, 50);
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
                            DgPlaceSimple(x, y, n12);
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
                if (near) break;
                bool placed = false;
                if ((int)r.Next(7) == 0)
                {
                    bool blocked = false;
                    for (int k = 0; k < 15; k++) if (DgInWorld(x, cy + k, 0) && DgSolid(x, cy + k)) { blocked = true; break; }
                    if (!blocked && DgPlaceChand(x, cy))
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
    for (int i = 0; i < 1000; i++)
    {
        int a = x + (int)r.Next(-12, 13);
        int b = y + (int)r.Next(3, 21);
        if (!DgInWorld(a, b, 0) || !DgInWorld(a, b + 1, 0)) continue;
        if (act[b * W + a] != 0 || act[(b + 1) * W + a] != 0) continue;
        if (!DgInWorld(a - 1, b, 0) || !DgIsDT(typ[b * W + a - 1])) continue;
        if (!DgInWorld(a + 1, b, 0) || !DgIsDT(typ[b * W + a + 1])) continue;
        if (!DgCanHit(a, b, x, y)) continue;
        bool anchor = (DgSolid(a - 1, b) && typ[b * W + a - 1] != 10) || (DgSolid(a + 1, b) && typ[b * W + a + 1] != 10) || DgSolid(a, b + 1);
        if (anchor && DgIsDW(wal[b * W + a]) && (DgIsDT(typ[b * W + a - 1]) || DgIsDT(typ[b * W + a + 1])))
        {
            if (act[b * W + a] == 0) { act[b * W + a] = 1; typ[b * W + a] = 136; }
        }
        if (act[b * W + a] == 0) continue;
        if ((int)r.Next(3) > 0) { }                             // frameX=18（不入哈希）
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
                if (DgPlaceSimple(num3, j, 355)) { alch--; return true; }
            }
            else if (DgPlaceSimple(num3, j, 354)) { bew--; return true; }
        }
        else if (num18 == 0)
        {
            if (DgPlaceSimple(num3, j, DgTileOf(iTable)))
            {
                if (iChair > -1)
                {
                    if (DgInWorld(num3 - 2, j, 0) && act[j * W + num3 - 2] == 0) DgPlaceSimple(num3 - 2, j, DgTileOf(iChair));
                    if (DgInWorld(num3 + 2, j, 0) && act[j * W + num3 + 2] == 0) DgPlaceSimple(num3 + 2, j, DgTileOf(iChair));
                }
                for (int n = num3 - 1; n <= num3 + 1; n++)
                {
                    if ((int)r.Next(2) != 0 || !DgInWorld(n, j - 2, 0) || act[(j - 2) * W + n] != 0) continue;
                    int n23 = (int)r.Next(5);
                    if (iCandle > -1 && n23 <= 1) DgPlaceSimple(n, j - 2, DgTileOf(iCandle));
                    else if (n23 == 2) DgPlaceSimple(n, j - 2, 49);
                    else if (n23 == 3) DgPlaceSimple(n, j - 2, 50);
                    else if (n23 == 4) DgPlaceSimple(n, j - 2, 103);
                }
                return true;
            }
        }
        else if (num18 == 1)
        {
            if (DgPlaceSimple(num3, j, DgTileOf(iWork)))
            {
                if (iChair > -1)
                {
                    if ((int)r.Next(2) == 0)
                    {
                        if (DgInWorld(num3 - 1, j, 0) && act[j * W + num3 - 1] == 0) DgPlaceSimple(num3 - 1, j, DgTileOf(iChair));
                    }
                    else if (DgInWorld(num3 + 2, j, 0) && act[j * W + num3 + 2] == 0) DgPlaceSimple(num3 + 2, j, DgTileOf(iChair));
                }
                for (int n = num3; n <= num3 + 1; n++)
                {
                    if ((int)r.Next(2) != 0 || !DgInWorld(n, j - 1, 0) || act[(j - 1) * W + n] != 0) continue;
                    int n26 = (int)r.Next(5);
                    if (iCandle > -1 && n26 <= 1) DgPlaceSimple(n, j - 1, DgTileOf(iCandle));
                    else if (n26 == 2) DgPlaceSimple(n, j - 1, 49);
                    else if (n26 == 3) DgPlaceSimple(n, j - 1, 50);
                    else if (n26 == 4) DgPlaceSimple(n, j - 1, 103);
                }
                return true;
            }
        }
        else if (num18 == 2) { if (iVase > -1 && DgPlaceSimple(num3, j, DgTileOf(iVase))) return true; }
        else if (num18 == 3) { if (iBook > -1) DgPlaceSimple(num3, j, DgTileOf(iBook)); }
        else if (num18 == 4)
        {
            if (iChair > -1)
            {
                DgPlaceSimple(num3, j, DgTileOf(iChair));
                if (DgInWorld(num3, j, 0) && act[j * W + num3] != 0 && typ[j * W + num3] == DgTileOf(iChair)) return true;
            }
        }
        else if (num18 == 5) { if (iBed > -1 && DgPlace4x2(num3, j, DgTileOf(iBed))) return true; }
        else if (num18 == 6) { if (iPiano > -1 && DgPlaceSimple(num3, j, DgTileOf(iPiano))) return true; }
        else if (num18 == 7) { if (iDress > -1 && DgPlaceSimple(num3, j, DgTileOf(iDress))) return true; }
        else if (num18 == 8) { if (iSofa > -1 && DgPlaceSimple(num3, j, DgTileOf(iSofa))) return true; }
        else if (num18 == 9) { if (iTub > -1 && DgPlace4x2(num3, j, DgTileOf(iTub))) return true; }
        else if (num18 == 10) { if (iLamp > -1 && DgPlaceSimple(num3, j, DgTileOf(iLamp))) return true; }
        else if (num18 == 11) { if (iCand > -1 && DgPlaceSimple(num3, j, DgTileOf(iCand))) return true; }
        else if (num18 == 12) { if (iClock > -1 && DgPlaceSimple(num3, j, DgTileOf(iClock))) return true; }
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
        if (n13 <= 7 || n14 <= 5) continue;
        var arr = new bool[3] { true, false, false };
        if (n13 > n14 * 3 && n13 > 21) arr[1] = true;
        if (n14 > n13 * 3 && n14 > 21) arr[2] = true;
        int n15 = (int)r.Next(3);
        if (wal[y * W + x] == num2v) n15 = 0;
        while (!arr[n15]) n15 = (int)r.Next(3);
        if (DgNearPicture2(x, y)) n15 = -1;
        if (n15 == 0)
        {
            if (DgFeatArea3(x, y, 2) && !DgNearPicture(x, y)) DgPaintingAt(x, y);
        }
        else if (n15 == 1)
        {
            if (!DgFeatArea3(x, y, 2)) continue;
            if (act[y * W + x] == 0) DgPaintingAt(x, y);
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
                if (DgFeatArea3(x, ny, 2))
                {
                    if (Math.Abs(baseY - ny) >= 4 || DgNearPicture(x, ny)) break;
                    DgPaintingAt(x, ny);
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
                if (DgFeatArea3(x, ny, 2))
                {
                    if (Math.Abs(baseY - ny) >= 4 || DgNearPicture(x, ny)) break;
                    DgPaintingAt(x, ny);
                }
            }
        }
        else if (n15 == 2)
        {
            if (!DgFeatArea3(x, y, 2)) continue;
            if (act[y * W + x] == 0) DgPaintingAt(x, y);
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
                if (DgFeatArea3(nx, y, 2))
                {
                    if (Math.Abs(baseX - nx) >= 4 || DgNearPicture(nx, y)) break;
                    DgPaintingAt(nx, y);
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
                if (DgFeatArea3(nx, y, 2))
                {
                    if (Math.Abs(baseX - nx) >= 4 || DgNearPicture(nx, y)) break;
                    DgPaintingAt(nx, y);
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
void DgPaintingAt(int x, int y)
{
    int tile = 240, style = 0;
    if (wal[y * W + x] == dgWall)
    {
        int n = (int)r.Next(3);
        if (n <= 1)
        {
            tile = 240;
            int n2 = (int)r.Next(7);
            if (n2 == 6) n2 = (int)r.Next(7);
            style = n2 switch { 0 => 12, 1 => 13, 2 => 14, 3 => 15, 4 => 18, 5 => 19, _ => 23 };
        }
        else
        {
            tile = 242;
            int n2 = (int)r.Next(17);
            style = n2 switch { 14 => 15, 15 => 16, 16 => 30, _ => n2 };
        }
    }
    else
    {
        int n = (int)r.Next(2);
        if (n == 0) { tile = 240; style = (int)r.Next(2) == 0 ? 16 : 17; }
        else { tile = 241; style = (int)r.Next(9); }
    }
    DgPlaceSimple(x, y, tile);
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
        DgPlaceSimple(x, y, 91);
    }
}
// ★#29 Corruption（cs:13919）与 #32 Dungeon（cs:14816）尚未转录——转录后须插在

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
                int yEnd = (int)((double)j + depth + pad);
                for (int y = 0; y < yEnd && y < H; y++)
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
                int yEnd = (int)((double)l + depth + pad);
                for (int y = 0; y < yEnd && y < H; y++)
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
sb.AppendLine("  \"checkpoints\": [");
for (int i = 0; i < checkpoints.Count; i++)
    sb.AppendLine($"    \"{checkpoints[i]}\"{(i < checkpoints.Count - 1 ? "," : "")}");
sb.AppendLine("  ]");
sb.AppendLine("}");
File.WriteAllText(outPath, sb.ToString());
File.WriteAllText(outPath + ".ghost", string.Join("\n", ghostPts));
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
    public class ClearA : GA   // ClearEverything
    {
        public override bool Apply(int ox, int oy, int x, int y)
        {
            if (WC.InW(x, y)) { int i = y * WC.W + x; WC.A[i] = 0; WC.T[i] = 0; WC.Wl[i] = 0; WC.L[i] = 0; }
            return UA(ox, oy, x, y);
        }
    }
    public class ClearTileA : GA   // ClearTile()：active=false（type/wall/liquid 保留）
    {
        public override bool Apply(int ox, int oy, int x, int y)
        {
            if (WC.InW(x, y)) WC.A[y * WC.W + x] = 0;
            return UA(ox, oy, x, y);
        }
    }
    public class SetTileA : GA  // Clear(~(Wiring|Actuator)) + type + active → wall/liquid 清零
    {
        public ushort Tt;
        public SetTileA(ushort t) { Tt = t; }
        public override bool Apply(int ox, int oy, int x, int y)
        {
            if (WC.InW(x, y)) { int i = y * WC.W + x; WC.T[i] = Tt; WC.A[i] = 1; WC.Wl[i] = 0; WC.L[i] = 0; }
            return UA(ox, oy, x, y);
        }
    }
    public class PlaceWallA : GA // wall = type（SquareWallFrame 哈希无关）
    {
        public ushort Wt;
        public PlaceWallA(ushort w) { Wt = w; }
        public override bool Apply(int ox, int oy, int x, int y)
        {
            if (WC.InW(x, y)) WC.Wl[y * WC.W + x] = Wt;
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
}
