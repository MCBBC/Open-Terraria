// Terrain oracle：独立复刻原版 1456 的「Reset 掷骰 + TerrainPass」（普通世界分支，
// 4200×1200），UnifiedRandom 用反射调真·Terraria.exe 的实现（零转写风险）。
// 输出逐列地表 (int)num3 + 关键常量 → 指定 JSON，供 JS 侧逐列对账。
// 用法：dotnet run tools/golden/terrain-oracle.cs <seedInt> <evil:0|1> <out.json>
using System;
using System.IO;
using System.Reflection;
using System.Text;

int seed = int.Parse(args[0]);
int evil = int.Parse(args[1]);
string outPath = args[2];
const int W = 4200, H = 1200;

var asm = Assembly.LoadFrom("/Users/vinlic/Library/Application Support/Steam/steamapps/common/Terraria/Terraria.app/Contents/Resources/Terraria.exe");
var urType = asm.GetType("Terraria.Utilities.UnifiedRandom")!;
dynamic r = Activator.CreateInstance(urType, seed)!;

var sb = new StringBuilder();
sb.AppendLine("{");
sb.AppendLine($"  \"seed\": {seed}, \"evil\": {evil},");

// ================= Reset 掷骰（cs:11159-11472 普通世界逐行转写）=================
r.Next(5);                                                    // jungleHut
r.Next(2);                                                    // crimsonLeft
r.Next(10, 200);                                              // numClouds
while (true) { double wf = (double)r.NextDouble(); r.Next(2); if (wf != 0) break; } // 风速
// 地狱箱主件洗牌
var pool = new System.Collections.Generic.List<int> { 274, 220, 112, 218, 3019 };
var hellItems = new System.Collections.Generic.List<int>();
while (pool.Count > 0) { int idx = (int)r.Next(pool.Count); hellItems.Add(pool[idx]); pool.RemoveAt(idx); }
r.Next(86400 * 2, 86400 * 3);                                 // slimeRainTime
r.Next(8640, 86400);                                          // cloudBGActive
int oreC = (int)r.Next(2); int oreI = (int)r.Next(2); int oreS = (int)r.Next(2); int oreG = (int)r.Next(2);
bool crimson = (int)r.Next(2) == 0;
if (evil == 0) crimson = false; if (evil == 1) crimson = true;
r.Next(int.MaxValue);                                         // WorldId
// RandomizeTreeStyle（4200 分支）
r.Next(1050, 3150);
int ts0 = (int)r.Next(6); int ts1 = (int)r.Next(6);
while (ts1 == ts0) ts1 = (int)r.Next(6);
for (int i = 0; i < 2; i++) { int s = i == 0 ? ts0 : ts1; if (s == 0 && (int)r.Next(3) != 0) { if (i == 0) ts0 = 4; else ts1 = 4; } }
// RandomizeCaveBackgrounds（4200 分支）
r.Next(1050, 3150);
int cb0 = (int)r.Next(8); int cb1 = (int)r.Next(8);
while (cb1 == cb0) cb1 = (int)r.Next(8);
// RandomizeCaveBackgrounds 尾部无条件 3 掷(cs:8211-8213;2026-08-12 审计补)
r.Next(4); r.Next(3); r.Next(2);
// RandomizeBackgrounds
Func<int> rollForest = () => {
    int n = (int)r.Next(14);
    if ((n == 1 || n == 2) && (int)r.Next(2) == 0) n = (int)r.Next(14);
    if (n == 0) n = (int)r.Next(14);
    if (n == 3 && (int)r.Next(3) == 0) n = 31;
    if (n == 5 && (int)r.Next(2) == 0) n = 51;
    if (n == 7 && (int)r.Next(4) == 0) n = (int)r.Next(71, 74);
    return n;
};
int bg1 = rollForest(); int bg2 = rollForest(); while (bg2 == bg1) bg2 = rollForest();
int bg3 = rollForest(); while (bg3 == bg1 || bg3 == bg2) bg3 = rollForest();
int bg4 = rollForest(); while (bg4 == bg1 || bg4 == bg2 || bg4 == bg3) bg4 = rollForest();
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
// 地牢/丛林/雪原/海滩
bool dungeonRight = !((int)r.Next(2) == 0);                   // Left if Next(2)==0
int jungleX = dungeonRight
    ? (int)(W * ((int)r.Next(15, 30) * 0.01))
    : (int)(W * (1.0 - (int)r.Next(15, 30) * 0.01));
int num7 = (int)r.Next(W);
if (dungeonRight) { while (num7 < W * 0.6 || num7 > W * 0.75) num7 = (int)r.Next(W); }
else { while (num7 < W * 0.25 || num7 > W * 0.4) num7 = (int)r.Next(W); }
double num9s = W / 4200.0;
Func<int> snowHalf = () => (int)r.Next(50, 90) + (int)((int)r.Next(20, 40) * num9s) + (int)((int)r.Next(20, 40) * num9s);
int snowL = Math.Max(0, num7 - snowHalf());
int snowR = Math.Min(W, num7 + snowHalf());
int leftBeachEnd = (int)r.Next(300, 340) + (dungeonRight ? 40 : 20);
int rightBeachStart = W - (int)r.Next(300, 340) - (dungeonRight ? 20 : 40);
int dungeonLocation = !dungeonRight
    ? (int)r.Next(leftBeachEnd + 50, (int)(W * 0.2))
    : (int)r.Next((int)(W * 0.8), rightBeachStart - 50);

// ★RunPass 重播（num4 悬案根因，2026-08-16 Tier B IL 探针裁决）：
// 原版每个 GenPass 前 `Main.rand = new UnifiedRandom(_seed)`（1456
// WorldGenerator.cs:497；服务器 exe IL RunPass: newobj UnifiedRandom::.ctor(Int32)
// + stsfld Main::rand），GenBase._random => WorldGen.genRand => Main.rand
//（GenBase.cs:9 / WorldGen.cs:4391）→ TerrainPass 从 stream(seed) 第 0 掷开始。
// 探针实测（IL 注入原版服务器 7 种子逐列）：重播后 4200/4200 列位级一致。
r = (dynamic)Activator.CreateInstance(urType, seed)!;
// ================= TerrainPass.ApplyPass（cs:56-244 普通分支逐行转写）=================
int flatBeachPadding = 5;
int feature = 0; // Plateau
int counter = leftBeachEnd + flatBeachPadding;
double num3 = (double)H * 0.3;
num3 *= (double)(int)r.Next(90, 110) * 0.005;
double num4 = num3 + (double)H * 0.2;
num4 *= (double)(int)r.Next(90, 110) * 0.01;
double num5 = num3, num6 = num3, num7r = num4, num8r = num4;
double num9t = (double)H * 0.23;
double num10 = 0.17 + 0.02; // 小世界（GetWorldSize()==0）
double num11 = 0.26;
var history = new System.Collections.Generic.List<double>(); // 有序近 500 列（Retarget 用）
var surf = new int[W];
Action<int, double> retarget = (targetX, targetHeight) => {
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
        if (x >= 0 && x < W) surf[x] = (int)history[len - k - 1];
    }
};
Func<double, int, double> genOffset = (dummy, f) => {
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
    num5 = Math.Min(num3, num5);
    num6 = Math.Max(num3, num6);
    num7r = Math.Min(num4, num7r);
    num8r = Math.Max(num4, num8r);
    if (counter <= 0)
    {
        feature = (int)r.Next(0, 5);
        counter = (int)r.Next(5, 40);
        if (feature == 0) counter *= (int)((double)(int)r.Next(5, 30) * 0.2);
    }
    counter--;
    if ((double)i > W * 0.45 && (double)i < W * 0.55 && (feature == 3 || feature == 4))
        feature = (int)r.Next(3);
    if ((double)i > W * 0.48 && (double)i < W * 0.52)
        feature = 0;
    num3 += genOffset(0, feature);
    if (i < leftBeachEnd + flatBeachPadding || i > rightBeachStart - flatBeachPadding)
    {
        num3 = Math.Clamp(num3, H * num10, num9t);
    }
    else if (num3 < H * num10) { num3 = H * num10; counter = 0; }
    else if (num3 > H * num11) { num3 = H * num11; counter = 0; }
    while ((int)r.Next(0, 3) == 0) num4 += (int)r.Next(-2, 3);
    if (num4 < num3 + H * 0.06) num4 += 1.0;
    if (num4 > num3 + H * 0.35) num4 -= 1.0;
    history.Add(num3);
    if (history.Count > 500) history.RemoveAt(0);
    surf[i] = (int)num3; // FillColumn 最终态：y < (int)num3 空气
    if (i == rightBeachStart - flatBeachPadding)
    {
        if (num3 > num9t) retarget(i, num9t);
        feature = 0;
        counter = W - i;
    }
}
int worldSurface = (int)(num6 + 25.0);
double rockLayerD = num8r;
double num12 = (int)((rockLayerD - worldSurface) / 6.0) * 6;
int rockLayer = (int)(worldSurface + num12);
int waterLine = (int)((rockLayer + (double)H) / 2) + (int)r.Next(-100, 20);
int lavaLine = waterLine + (int)r.Next(50, 80);
int num14 = 20;
if (num7r < num6 + num14)
{
    double mid = (num7r + num6) / 2.0;
    double spread = Math.Abs(num7r - num6);
    if (spread < num14) spread = num14;
    num7r = mid + spread / 2.0;
    num6 = mid - spread / 2.0;
}

// ================= 输出 =================
sb.AppendLine($"  \"dungeonRight\": {(dungeonRight ? "true" : "false")}, \"jungleX\": {jungleX}, \"dungeonX\": {num7},");
sb.AppendLine($"  \"snowL\": {snowL}, \"snowR\": {snowR}, \"leftBeachEnd\": {leftBeachEnd}, \"rightBeachStart\": {rightBeachStart},");
sb.AppendLine($"  \"dungeonLocation\": {dungeonLocation}, \"crimson\": {(crimson ? "true" : "false")},");
sb.AppendLine($"  \"oreTiers\": [{oreC},{oreI},{oreS},{oreG}], \"hellItems\": [{string.Join(",", hellItems)}],");
sb.AppendLine($"  \"worldSurface\": {worldSurface}, \"rockLayer\": {rockLayer}, \"waterLine\": {waterLine}, \"lavaLine\": {lavaLine},");
sb.Append("  \"surf\": [");
for (int i = 0; i < W; i++) { if (i > 0) sb.Append(','); sb.Append(surf[i]); }
sb.AppendLine("]");
sb.AppendLine("}");
File.WriteAllText(outPath, sb.ToString());
Console.WriteLine($"written {outPath} (surf[0]={surf[0]}, surf[100]={surf[100]}, worldSurface={worldSurface})");
