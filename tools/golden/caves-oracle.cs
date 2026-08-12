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
r.Next(int.MaxValue);                                         // WorldId
r.Next(1050, 3150);                                           // treeX[0]
int ts0 = (int)r.Next(6); int ts1 = (int)r.Next(6);
while (ts1 == ts0) ts1 = (int)r.Next(6);
for (int i = 0; i < 2; i++) { int s = i == 0 ? ts0 : ts1; if (s == 0) r.Next(3); }
r.Next(1050, 3150);                                           // caveBackX[0]
int cb0 = (int)r.Next(8); int cb1 = (int)r.Next(8);
while (cb1 == cb0) cb1 = (int)r.Next(8);
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
static bool IsOre(int t) =>
    t is 7 or 166 or 6 or 167 or 9 or 168 or 8 or 169 or 20 or 203 or 70 or 107 or 21 or 204 or 108 or 221 or 37 or 1110 or 6 or 116 or 234;

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
r.Next(3); // DungeonCrawler.SetupDungeonGenVarVariables（cs:11542 + DungeonCrawler.cs:56）
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
            int side = (int)r.Next(2) == 0 ? -2 : 2;
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
    int grassSpread = 0;
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
            // 装饰（485/751/484/165/187）两侧一致省略放置，掷骰照原序消耗保持流对齐
            if (wFlag && (int)r.Next(20) == 0) { int wStyle = (int)r.Next(4); if ((int)r.Next(30) == 0) wStyle = 0; }
            else if (wFlag && (int)r.Next(5) == 0) { }
            else if ((wFlag ^ wFlag2) && (int)r.Next(5) == 0) { }
            else if (wFlag && (int)r.Next(5) == 0) { }
        }
    }
}
Checkpoint("deserthive");
Checkpoint("desertdone");   // CleanupArea 仅 SquareWallFrame/TileFrame——无哈希效应

// ================= Pass 20 GlowingMushroomPatches（cs:12581-12709 + ShroomPatch cs:80540 + SpreadGrass cs:75210）=================
void SpreadGrassGen(int gi, int gj, int gdirt, int ggrass)
{
    if (gi < 10 || gi >= W - 10 || gj < 10 || gj >= H - 10) return;   // InWorld(i,j,10)
    int gi2 = gj * W + gi;
    if (act[gi2] == 0 || typ[gi2] != gdirt) return;
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
    typ[gi2] = (ushort)ggrass;
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
    int dsX = dX - 10, dsY = dTop - 10, dsR = dX - 10 + dW + 20, dsB = dTop - 10 + dHiveTop + dH - dTop + 20;  // UndergroundDesertLocation
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
                SpreadGrassGen(sgx, sgy, 59, 70);
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
    for (int oi = 0; (double)oi < oCount; oi++)
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
