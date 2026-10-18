// 金标提取：反射调用真·Terraria 1.4.5.6（Terraria.app 内 Terraria.exe + 反编译树 ReLogic.dll）
// 产出 WorldFileData.TranslateSeed / UnifiedRandom 的位级参考序列 → tests/golden/unified-random.json
// 用法：dotnet run tools/golden/rand-golden.cs
// double 一律转 int64 位串（"0x…"），避免任何序列化精度歧义。
using System;
using System.IO;
using System.Reflection;
using System.Text;

string resDir = Environment.GetEnvironmentVariable("SW_TERRARIA_RES") ?? "../../Library/Application Support/Steam/steamapps/common/Terraria/Terraria.app/Contents/Resources"; // ★C档可移植:本机 Steam 资源面,SW_TERRARIA_RES 可覆盖
string decDir = Environment.GetEnvironmentVariable("SW_PROJECT_ROOT") ?? "../../.."; // ★C档可移植:decDir/Terarria1456
AppDomain.CurrentDomain.AssemblyResolve += (s, e) => {
    var name = new AssemblyName(e.Name).Name + ".dll";
    foreach (var d in new[] { decDir, resDir }) {
        var p = Path.Combine(d, name);
        if (File.Exists(p)) { try { return Assembly.LoadFrom(p); } catch { } }
    }
    return null!;
};
var asm = Assembly.LoadFrom(Path.Combine(resDir, "Terraria.exe"));
var rel = Assembly.LoadFrom(Path.Combine(decDir, "Terraria.Libraries.ReLogic.ReLogic.dll"));
var urType = asm.GetType("Terraria.Utilities.UnifiedRandom")!;
var wfdType = asm.GetType("Terraria.IO.WorldFileData")!;
var translate = wfdType.GetMethod("TranslateSeed", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;

var sb = new StringBuilder();
sb.AppendLine("{");

// ---- TranslateSeed（数字→Abs；非数字→ReLogic Crc32，负值直出）----
string[] seedTexts = { "test", "SandboxWorld", "1.4.5.6", "12345", "-12345", "0", "2147483647", "-2147483648", "小世界", "seed with spaces", "", "9293480", "929393480" };
sb.AppendLine("  \"translateSeed\": {");
for (int i = 0; i < seedTexts.Length; i++)
    sb.AppendLine($"    {J(seedTexts[i])}: {translate.Invoke(null, new object[] { seedTexts[i] })}{(i < seedTexts.Length - 1 ? "," : "")}");
sb.AppendLine("  },");

// ---- UnifiedRandom 序列 ----
int[] seeds = { 0, 1, 2, 123456789, 2147483647, -1, -2147483648, 1511931452 };
sb.AppendLine("  \"sequences\": [");
var N = 12;
for (int si = 0; si < seeds.Length; si++)
{
    int seed = seeds[si];
    sb.AppendLine("    {");
    sb.AppendLine($"      \"seed\": {seed},");
    void Dump(string name, Func<object> f, bool bits, bool comma)
    {
        sb.Append($"      \"{name}\": [");
        for (int k = 0; k < N; k++)
        {
            var v = f();
            if (k > 0) sb.Append(", ");
            sb.Append(v is double d ? $"\"0x{BitConverter.DoubleToInt64Bits(d):x16}\"" : v.ToString());
        }
        sb.AppendLine($"]{(comma ? "," : "")}");
    }
    var r0 = Activator.CreateInstance(urType, seed)!;
    Dump("next", () => urType.InvokeMember("Next", BindingFlags.InvokeMethod, null, r0, null), false, true);
    var r1 = Activator.CreateInstance(urType, seed)!;
    Dump("nextDouble", () => urType.InvokeMember("NextDouble", BindingFlags.InvokeMethod, null, r1, null), true, true);
    var r2 = Activator.CreateInstance(urType, seed)!;
    Dump("next100", () => urType.InvokeMember("Next", BindingFlags.InvokeMethod, null, r2, new object[] { 100 }), false, true);
    var r3 = Activator.CreateInstance(urType, seed)!;
    Dump("next7to10", () => urType.InvokeMember("Next", BindingFlags.InvokeMethod, null, r3, new object[] { 7, 10 }), false, true);
    var r4 = Activator.CreateInstance(urType, seed)!;
    Dump("nextNeg5to5", () => urType.InvokeMember("Next", BindingFlags.InvokeMethod, null, r4, new object[] { -5, 5 }), false, true);
    // 混合流（跨 method 连续性）
    var r5 = Activator.CreateInstance(urType, seed)!;
    var mixed = new List<string>();
    for (int k = 0; k < 8; k++)
    {
        mixed.Add(((int)urType.InvokeMember("Next", BindingFlags.InvokeMethod, null, r5, null)).ToString());
        var d = (double)urType.InvokeMember("NextDouble", BindingFlags.InvokeMethod, null, r5, null);
        mixed.Add($"\"0x{BitConverter.DoubleToInt64Bits(d):x16}\"");
        mixed.Add(((int)urType.InvokeMember("Next", BindingFlags.InvokeMethod, null, r5, new object[] { 100 })).ToString());
        mixed.Add(((int)urType.InvokeMember("Next", BindingFlags.InvokeMethod, null, r5, new object[] { 7, 10 })).ToString());
    }
    sb.AppendLine($"      \"mixed\": [{string.Join(", ", mixed)}]");
    sb.AppendLine($"    }}{(si < seeds.Length - 1 ? "," : "")}");
}
sb.AppendLine("  ]");
sb.AppendLine("}");
File.WriteAllText("tests/golden/unified-random.json", sb.ToString());
Console.WriteLine("written tests/golden/unified-random.json");

static string J(string s)
{
    var sb = new StringBuilder("\"");
    foreach (var c in s) sb.Append(c switch { '"' => "\\\"", '\\' => "\\\\", _ => c });
    return sb.Append('"').ToString();
}
