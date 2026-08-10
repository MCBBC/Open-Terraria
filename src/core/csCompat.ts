// C# → JS 数值语义兼容助手（世界生成移植用）。
// 背景：C#→JS 移植已出过两类事故（位运算有符号返回、Math.round≠C# 舍入），
// 移植 C# 源码时凡涉及以下语义一律用本模块，不要手写近似：
//   (int)x        → ctrunc(x)   向零截断（负数 -1.5 → -1，区别 Math.floor 的 -2）
//   a / b (int)   → cdiv(a, b)  整除（C# int 除法=向零截断；操作数非负时同 Math.floor）
//   Math.Round(x) → cround(x)   默认 MidpointRounding.ToEven（银行家舍入：0.5→0、1.5→2）
//   (float)x      → fround(x)   float32 单步舍入（C# float 运算每步舍到 32 位；
//                               JS double 全程双精度，随机游走数百列后会累积漂移）
// 位运算：JS `<<`/`^`/`|`/`&` 返回有符号 int32、`1<<31` 为负——
//   结果用作索引/上界一律 `>>> 0` 收尾（范本：BiomeBackground.seedPick / lighting/FastRandom）。

/** C# (int) 强转：向零截断 */
export function ctrunc(x: number): number {
  return (x < 0 ? Math.ceil(x) : Math.floor(x)) + 0; // +0 归一 -0（C# int 无负零）
}

/** C# int 除法 a/b：向零截断（非负操作数等价 Math.floor(a/b)） */
export function cdiv(a: number, b: number): number {
  return ctrunc(a / b);
}

/** C# Math.Round 默认重载：MidpointRounding.ToEven（银行家舍入） */
export function cround(x: number): number {
  // Math.round 是 .5 向 +∞；ToEven 需在 .5 处取偶：先 round 再对 .5 偏移修正
  const r = Math.round(x);
  if (Math.abs(x - Math.trunc(x) - 0.5) > 1e-9 && Math.abs(x - Math.trunc(x) + 0.5) > 1e-9) return r;
  // 恰在 .5：取偶数方向
  const fl = Math.floor(x);
  return fl % 2 === 0 ? fl : fl + 1;
}

/** C# (float) 强转：单步舍入到 float32（长程随机游走用，防 double 累积漂移） */
export function fround(x: number): number {
  return Math.fround(x);
}
