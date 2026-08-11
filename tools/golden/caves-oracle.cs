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
r.Next(2); r.Next(2); r.Next(2); r.Next(2);                   // 矿石替代对
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
    var GP2C = steps == 10000 ? new List<string>() : null;
    int ITRN = 0;
    long GP2C_N = 0;
    double vx = (int)r.Next(-10, 11) * 0.1, vy = (int)r.Next(-10, 11) * 0.1;
    if (speedX != 0.0 || speedY != 0.0) { vx = speedX; vy = speedY; }
    int num3l = 0;
    r.Next(4); // num3 液体类型（普通世界结果弃用）
    if (GP2C != null) GP2C.Add($"CALL i={i:R} j={j:R} s={strength} st={steps} t={type} at={addTile} ny={noYChange} ov={overRide} mw={mudWallFlag}");
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
                if (GP2C != null) {
                    GP2C_N++;
                    if ((GP2C_N >= 673000 && GP2C_N <= 674100) || GP2C_N % 50000 == 0) {
                        GP2C.Add($"c{GP2C_N}@{x},{y}a{act[ti]}t{typ[ti]}=pk{(int)r.Peek()}");
                    }
                }
                if (GP2C != null && x == 3401 && y == 581) GP2C.Add($"S@{px:0.0},{py:0.0} a{act[ti]}t{typ[ti]}=pk{(int)r.Peek()}");
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
                        // Main.tileStone[type]：宝石族——本链放置类型不含，恒 false
                        if (NOT_CLEAR.Contains(cur)) flag4 = true;
                        if (cur == 1 && type == 59)
                        {
                            int f4r = (int)r.Next(-50, 50);
                            if (x == 3405 && y == 308) Console.WriteLine($"CF4 roll={f4r} y={y} wS={worldSurface} pass={y < worldSurface + f4r} py={py:0.0}");
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
        ITRN++;
        if (GP2C != null && ITRN <= 210) GP2C.Add($"it{ITRN} px={px:R} py={py:R} vx={vx:R} vy={vy:R} n1={num1:R} n2={num2:R} pk={(int)r.Peek()}");
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
        if (GP2C != null) File.WriteAllText("/tmp/cs-gp2.txt", string.Join(" ", GP2C));
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
{
    var prof = new List<string>();
    for (int x = 2300; x < 2760; x++)
    {
        int top = -1;
        for (int y = 0; y < 600; y++) if (act[y * W + x] == 1 && typ[y * W + x] == 53) { top = y; break; }
        prof.Add(top.ToString());
    }
    File.WriteAllText("/tmp/cs-sand.txt", string.Join(",", prof));
}
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
File.WriteAllBytes("/tmp/cs-typ2.bin", ToBytes(typ));
File.WriteAllBytes("/tmp/cs-act2.bin", act);
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

// ================= Pass 34：MountainCaveOpenings（cs:14932-14947，按我们的执行序紧跟洞穴链）=================
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

// ================= Beaches（cs:14947-15087 + TuneOceanDepth cs:27104）=================
var beachDbg = new List<string>();
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
                if (x >= 134 && x <= 156) beachDbg.Add($"{x}:w{j}:y{yEnd}:d{depth:0.0}");
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
File.WriteAllBytes("/tmp/cs-act4.bin", act);
File.WriteAllBytes("/tmp/cs-act5.bin", act);
File.WriteAllText("/tmp/cs-beach2.txt", string.Join(" ", beachDbg));
Checkpoint("beaches");

// ================= IceBiome（cs:12343-12440，按我们的执行序：生物群系链首）=================
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
    var CGH = new List<string>();
    Action<string> ghAt = (tag) => { int ii = 315 * W + 3395; CGH.Add($"{tag}:t{typ[ii]}a{act[ii]}"); };
    ghAt("entry");
    Move(ref jx, ref jy, 100, 100); zeroX += jx; zeroY += jy;
    var CJP3 = new List<string>();
    PlaceFirstPassMud(jx, jy, 3);
    PlaceGemsAt(jx, jy, 63, 2); ghAt("r1");
    Move(ref jx, ref jy, 250, 150); zeroX += jx; zeroY += jy;
    PlaceFirstPassMud(jx, jy, 0);
    PlaceGemsAt(jx, jy, 65, 2); ghAt("r2");
    int oldX = jx, oldY = jy;
    Move(ref jx, ref jy, 400, 150); zeroX += jx; zeroY += jy;
    PlaceFirstPassMud(jx, jy, -3);
    PlaceGemsAt(jx, jy, 67, 2); ghAt("r3");
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
    var CPT = new List<string>();
    // GenerateFinishingTouches（cs:219-280）
    CPT.Add($"g3_t={typ[308 * W + 3405]}a{act[308 * W + 3405]}");
    int fx = oldX, fy = oldY;
    for (int i = 0; (double)i <= 20.0 * ws; i++)
    {
        fx += (int)r.Next((int)(-5 * ws), (int)(6 * ws));
        fy += (int)r.Next((int)(-5 * ws), (int)(6 * ws));
        TileRunner(fx, fy, (int)r.Next(40, 100), (int)r.Next(300, 500), 59);
    }
    CPT.Add($"big_t={typ[308 * W + 3405]}a{act[308 * W + 3405]}");
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
    CPT.Add($"holes_t={typ[308 * W + 3405]}a{act[308 * W + 3405]}");
    ghAt("big");
    File.WriteAllText("/tmp/cs-pt.txt", string.Join(" ", CPT) + " || " + string.Join(" ", CGH));
    File.WriteAllBytes("/tmp/cs-act6.bin", act);
    File.WriteAllBytes("/tmp/cs-jt.bin", ToBytes(typ));
    for (int l = 0; (double)l <= 300.0 * ws; l++)
    {
        int c3x = oldX + (int)r.Next(-(int)(600 * ws), (int)(600 * ws));
        int c3y = oldY + (int)r.Next(-(int)(200 * ws), (int)(200 * ws));
        while (c3x < 1 || c3x >= W - 1 || c3y < 1 || c3y >= H - 1 || typ[c3y * W + c3x] != 59)
        { c3x = oldX + (int)r.Next(-(int)(600 * ws), (int)(600 * ws)); c3y = oldY + (int)r.Next(-(int)(200 * ws), (int)(200 * ws)); }
        TileRunner(c3x, c3y, (int)r.Next(4, 10), (int)r.Next(5, 30), 1);
        if ((int)r.Next(4) == 0)
            TileRunner(c3x + (int)r.Next(-1, 2), c3y + (int)r.Next(-1, 2), (int)r.Next(3, 7), (int)r.Next(4, 8), (int)r.Next(63, 69));
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
// 注意：入口(33%+Next4)与 Hive 未含——本检查点只到 mound 完成后
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
