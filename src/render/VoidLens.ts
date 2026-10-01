// 虚空保险库悬浮透镜纯算面（★BJ429,2026-09-23 用户实报"虚空保险库只剩一个底座,
// 上面的悬浮部分不见了"）——VoidLensHelper.cs 1:1 的可测判别层;画布消费端 =
// Renderer.drawVoidLenses（render 2c'.0,tile 层后、晶塔水晶 2c'.1 前）。
//
// 定谳锚（Terarria1457 亲读）:
//   · 悬浮透镜本体从不在 Tiles_491 内——tile 面采样带（右半,TileDrawing.cs:5405-5407
//     addFrX=54,BJ248 已对齐）只有底座行（sheet 左半才是整库旧画,原版永不采样）;
//   · 悬浮体 = 独立绘制面:TileDrawing.cs:700-705 对中心格（frameX==18&&frameY==18）
//     登记 VoidLens special point → DrawVoidLenses（:8876-8902）以 Projectile_734
//     贴图（34×48×8 帧条）画悬浮体;本仓 BJ248 只对齐 tile 面,special point 尾扫整缺
//     ⇒ 一切已放置库（新放/存档皆同）恒缺悬浮体——绘制层缺面,与锚/存档无关
//     （BJ377 修复面只触 21 箱锚,491 不在判别域）。
//
// 本模块全部为纯函数（无画布/无池/RNG 经形参注入）——判别测试
// tests/bj429-void-vault-lens.test.ts 钉值。

/** Projectile_734 帧栅格：34×384 = 8 帧 × 34×48（TileDrawing.cs:701 帧条;Extra_93 同构） */
export const VOID_LENS_FW = 34;
export const VOID_LENS_FH = 48;
/** 40 tick 循环 = 8 帧 × 5t（Main.cs:19410-19412 计数器回卷 40;:31 ÷5） */
export const VOID_LENS_FRAME_WRAP = 40;

/** 透镜心 = 中心格 ToWorldCoordinates(+8,+8) 再 Y−2（VoidLensHelper.cs ctor :28）。
 *  3×3 库体的几何中心=中心格心 (tx*16+8, ty*16+8),Y−2 后=上移 2px。 */
export function voidLensCenterOf(tx: number, ty: number): [number, number] {
  return [tx * 16 + 8, ty * 16 + 6];
}

/** 帧 = (int)((tileFrameCounter[491] + _position.X + _position.Y) % 40) / 5
 *  （ctor :31;C# 先 (int) 截断再整除 5,正数域=⌊x/5⌋）。含世界像素坐标 ⇒ 逐库错相。 */
export function voidLensFrameOf(tick: number, wx: number, wy: number): number {
  return Math.floor(((tick + wx + wy) % VOID_LENS_FRAME_WRAP) / 5);
}

/** 回声呼吸项 x = cos(GTW·2π/5)（DrawToDrawData :92-93,−1..1） */
export function voidLensEchoPulse(globalTimeWrappedHourly: number): number {
  return Math.cos(globalTimeWrappedHourly * (Math.PI * 2) / 5);
}

/** 回声 α = x·0.1 + 0.3（:93,0.2..0.4;XNA Color*float 全分量乘,A=0 纯加法惯式） */
export function voidLensEchoAlpha(pulse: number): number {
  return pulse * 0.1 + 0.3;
}

/** 回声轨道半径 = x·1 + 2（:94,1..3px 世界像素） */
export function voidLensEchoRadius(pulse: number): number {
  return pulse + 2;
}

/** 回声步进 {0, 0.34, 0.68}（:87 `for num=0; num<1; num+=0.34` 三圈） */
export const VOID_LENS_ECHO_PHASES = [0, 0.34, 0.68] as const;

/** 回声轨道相位 = (GTW/5 + num)·2π（:94;ToRotationVector2=(cos,sin)） */
export function voidLensEchoAngle(globalTimeWrappedHourly: number, num: number): number {
  return (globalTimeWrappedHourly / 5 + num) * Math.PI * 2;
}

export interface VoidLensDustSpec {
  type: number;
  x: number; y: number;
  vx: number; vy: number;
  scale: number;
  fadeIn: number;
}

/** SpawnVoidLensDust（:40-63）1:1——RNG 经 rand 注入（原版 Main.rand 序:Next(3) 门→
 *  Next(2) 支→SelectRandom(86,88)→Next(10,21)/Next(5,10) 半径→NewDustDirect 内掷+
 *  NextFloat scale;本仓调用侧 Math.random 独立流,掷序 1:1 但流不同=p现有惯例）。
 *  · 方向向量 = UnitY.RotatedByRandom(2π)×(0.5,1) 再 SafeNormalize（:45-46/:64-65;
 *    RotatedByRandom(max)=rand·max·2−max ⇒ 全向 [−2π,2π)）;
 *  · A 支:pos=心−n×Next(10,21)、v=RotatedBy(π/2)(n)×2（:48-52）;B 支:Next(5,10)、
 *    RotatedBy(−π/2)(n)×3（:67-71）;公共尾 pos+=v×10、v×−1（:60-62/:76-77）;
 *  · scale=0.5+NextFloat、fadeIn=0.5（:55-56/:72-73）;noGravity/noLightEmittance 由
 *    消费端置位（不设 noLight ⇒ GetAlpha :2511 走 (255,255,255,0) 纯加白闪档）;
 *  · customData=struct 装箱,Dust.cs :511-589 仅 Player/Projectile/int 三型消费位
 *    ⇒ 普通尘行为,不建模。 */
export function voidLensDustSpec(
  cx: number, cy: number, rand: () => number,
): VoidLensDustSpec | null {
  if (rand() >= 1 / 3) return null;                      // :42 Next(3)==0 门
  const branchA = rand() < 0.5;                          // :44 Next(2)==0
  const type = rand() < 0.5 ? 86 : 88;                   // SelectRandom(86,88)
  const dir = rand() * Math.PI * 4 - Math.PI * 2;        // RotatedByRandom(2π)
  const sx0 = -Math.sin(dir) * 0.5, sy0 = Math.cos(dir); // UnitY 旋 ×(0.5,1)
  const nl = Math.hypot(sx0, sy0) || 1;
  const nx = sx0 / nl, ny = sy0 / nl;                    // SafeNormalize（:49/:68）
  const r2 = branchA ? 10 + Math.floor(rand() * 11)      // Next(10,21)=10..20
    : 5 + Math.floor(rand() * 5);                        // Next(5,10)=5..9
  // RotatedBy(±π/2)：+π/2→(−y,x)（:51）、−π/2→(y,−x)（:70）
  const vx = branchA ? -ny * 2 : ny * 3;
  const vy = branchA ? nx * 2 : -nx * 3;
  return {
    type,
    x: cx - nx * r2 + vx * 10,                           // :48/:67 + :60/:75 pos+=v×10
    y: cy - ny * r2 + vy * 10,
    vx: -vx, vy: -vy,                                    // :61-62/:76-77 v×−1
    scale: 0.5 + rand(),                                 // :55/:71
    fadeIn: 0.5,                                         // :56/:72
  };
}
