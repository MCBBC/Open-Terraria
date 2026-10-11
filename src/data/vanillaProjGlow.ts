// ★BJ603 Projectile.glowMask 弹幕域（BJ601 登记③收官刀）数据面 + 纯函数。
//
// 原版锚（Terarria1457 反编译亲读，1.4.5.7）：
//  · 数据面 = Projectile.glowMask【public short 字段】（Projectile.cs:782 缺省 -1），
//    SetDefaults 逐型赋值——grep 全量 10 处赋值 = 16 型正值
//    （312:257（:4057 JackOLantern）/ 427:2、428:3、429:7、430:8（:4990-5011 钻头族）
//    / 609:180、610:179（:5030-5037 钻头族）/ 987-993:318..324（:9434 发光浮漂族）
//    / 1101:372、1102:373（:10021/:10037 相刃族））。
//  · 绘制面两站（Main.cs DrawProjectiles 内 DrawProjDirect 两分支）：
//    ① bobber 分支 :35433-35441——proj.glowMask!=-1 → 源矩形 = GlowMask 贴图
//       【自身全幅】(0,0,value147.Width,value147.Height)，色 = proj.GetAlpha(White)
//       （993 → (DiscoR,DiscoG,DiscoB) :35434-35436），位姿同本体
//       （position+num153/num152、origin=(num153,h/2+num151)、rotation/scale/dir）。
//    ② 通用分支 :35498-35518——源矩形 = 弹幕贴图全幅（(0,0,projTexW,projTexH)，
//       光罩贴图与弹幕贴图同布局平行表——BJ601 抽样对拍同款），色 =
//       (250,250,250,proj.alpha) 缺省（:35504）；1101/1102 相位双画
//       （GetPhaseColor(proj.type)→drawColor 版 :35505-35510）；312 额外 4 份
//       种子化 ±2px 抖动副本 ×White×0.2（:35520-35530）。
//  · 位次 = 弹幕本体后（同 DrawProjDirect 尾段）；光罩色不取光照 = 自发光 →
//    本仓合成后逃逸队列（BJ601 itemGlowQueue 同域同判例）。
//  · 16 型 Main.projFrames 全零命中（grep Main.cs 无赋值）→ 光罩源矩形 = 全幅 =
//    本体帧矩形（无动画帧分帧）。
//  · 312 JackOLantern：本仓无 312 弹幕实体（物品 1735 投掷域未实装弹面）→
//    表内登记、消费休眠（口径与 209 传送门同）。

/** 16 型 glowMask 数据面（Projectile.cs SetDefaults 终值；键=原版弹型）。 */
export const PROJ_GLOWMASK: Readonly<Record<number, number>> = {
  312: 257,    // JackOLantern（:4057；本仓弹面未实装=休眠登记）
  427: 2,      // DrillsCobalt（:4990）
  428: 3,      // DrillsMythril（:4997）
  429: 7,      // DrillsAdamantite（:5004）
  430: 8,      // DrillsPalladium（:5011）
  609: 180,    // DrillsOrichalcum（:5037）
  610: 179,    // DrillsTitanium（:5030）
  987: 318,    // FishingBobberGlowingStar（:9434 987-993 连段 318+(type-987)）
  988: 319,    // FishingBobberGlowingLava
  989: 320,    // FishingBobberGlowingKrypton
  990: 321,    // FishingBobberGlowingXenon
  991: 322,    // FishingBobberGlowingArgon
  992: 323,    // FishingBobberGlowingViolet
  993: 324,    // FishingBobberGlowingRainbow（:35434 Disco 特例）
  1101: 372,   // 相刃 1101（:10021,相位双画 :35505-35510）
  1102: 373,   // 相刃 1102（:10037,同上）
};

/** 993 发光浮漂 Disco 特例（:35434-35436）。 */
export const PROJ_GLOW_DISCO = 993;
/** 相位双画族（:35505-35510——GetPhaseColor(proj.type)→drawColor 版两连画）。 */
export function isPhaseDoubleProj(projId: number): boolean {
  return projId === 1101 || projId === 1102;
}

// ---- 相位色（Item.GetPhaseColor 复用 vanillaItemGlow 同源式——独立转录防跨域耦合） ----

const cbyte = (v: number) => Math.trunc(Math.min(255, Math.max(0, v)));

/** Utils.MultiLerp Color 版（Utils.cs:293-303）——9 色分段线性,外插段钳尾。 */
function multiLerpColor(percent: number, colors: ReadonlyArray<readonly [number, number, number, number]>): [number, number, number, number] {
  const step = 1 / (colors.length - 1);
  let i = 0;
  while (percent / step > 1 && i < colors.length - 2) i++;
  const t = (percent - step * i) / step;
  const a = colors[i];
  const b = colors[i + 1];
  return [
    cbyte(a[0] + t * (b[0] - a[0])), cbyte(a[1] + t * (b[1] - a[1])),
    cbyte(a[2] + t * (b[2] - a[2])), cbyte(a[3] + t * (b[3] - a[3])),
  ];
}

/** Item.GetPhaseColorDirect（:49165-49199 乘子表 → FNA Color(float) 截断）——
 *  _phaseColors[9] = direct(1059..1075)+direct(1059) 收尾环（vanillaItemGlow 同源）。 */
const PHASE_COLORS: ReadonlyArray<readonly [number, number, number, number]> = [
  [25, 127, 255, 255], [255, 51, 25, 255], [25, 255, 51, 255], [204, 25, 255, 255],
  [204, 229, 255, 255], [204, 204, 0, 255], [229, 127, 0, 255], [255, 25, 102, 255],
  [25, 127, 255, 255],
];

/** GetPhaseColor（:49056-49163）：1101/1102 = MultiLerp 环
 *  （miscCounterNormalized=(miscCounter%300)/300）；drawColor → A=127（:49109-49112）。 */
export function projPhaseColor(projId: number, miscCounter: number, drawColor: boolean): readonly [number, number, number, number] {
  if (projId !== 1101 && projId !== 1102) return [255, 255, 255, 255];
  const c = multiLerpColor((miscCounter % 300) / 300, PHASE_COLORS);
  return drawColor ? [c[0], c[1], c[2], 127] : c;
}

// ===================== 绘制色序解算（扫描/收集侧入口） =====================

export type RGBA = readonly [number, number, number, number];

/** 弹幕光罩色序（缺省 (250,250,250,alpha)；993 Disco；1101/1102 相位双画）。
 *  alpha = proj.alpha（XNA A>0 → source-over×alpha、A=0 → 'lighter' 纯加算）。
 *  XNA Color(r,g,b,a) 逐分量 byte —— (250,250,250,proj.alpha) 直接 byte 语义。 */
export function projGlowColors(projId: number, alpha: number, args: {
  miscCounter: number;
  discoRGB: readonly [number, number, number] | null;
}): RGBA[] {
  if (isPhaseDoubleProj(projId)) {
    return [projPhaseColor(projId, args.miscCounter, false), projPhaseColor(projId, args.miscCounter, true)];
  }
  if (projId === PROJ_GLOW_DISCO) {
    return [args.discoRGB ? [args.discoRGB[0], args.discoRGB[1], args.discoRGB[2], 255] as RGBA : [255, 255, 255, 255] as RGBA];
  }
  return [[250, 250, 250, Math.max(0, Math.min(255, Math.trunc(alpha)))]];
}

// ---- ★BJ625件3（2026-10-10）688-690 闪电光环哨兵专绘支 glow 叠画 ----
//  原版锚（Main.cs:32481-32527 DrawProjDirect 专支,1456 :31680-31726 同式对拍）：
//   · Glow_228/229/230 与 Projectile_688/689/690 同布局平行表（22×180/28×192/34×304,
//     projFrames 6/6/8=Main.cs:8603-8605）——同矩形=value62.Frame(1,projFrames,0,frame)
//     逐帧切片叠画（:32505-32507）。
//   · 色：color73 = Color.Lerp(proj.GetAlpha(projectileColor), White, 0.5)（本体+底座
//     同色 :32497/:32524）;color74 = color73 截 A=127（glow :32498-32499）。688-690
//     SetDefaults 无 alpha（Projectile.cs:7327-7339）→ GetAlpha 恒等。
//   · projectileColor = proj 中心 tile 光照（:30068 Lighting.GetColor(center/16)）——
//     本仓弹幕域无 per-proj 光照色通道（合成后乘光=本体既有近似面）→ glow 走绘制侧
//     解算（lightAt 中心 tile）+ pushGlowOps 合成后逃逸（flushItemGlow bake/boost
//     分解同域）。暗处 net = 光×0.5+0.5（半亮自发光,非恒亮）。

/** glow 贴图分派（:32493-32501 switch：688→Glow_228/689→229/690→230,余 null）。 */
export function auraGlowMaskOf(projId: number): number | null {
  return projId === 688 ? 228 : projId === 689 ? 229 : projId === 690 ? 230 : null;
}

/** color73 RGB 面（Lerp(light,White,.5)——light=0-255 语域,GetAlpha 恒等态）→
 *  归一 tint；glow alpha 恒 127/255（color74.A=127）。 */
export function auraGlowTint(light: readonly [number, number, number]): [number, number, number] {
  return [
    (light[0] / 255) * 0.5 + 0.5,
    (light[1] / 255) * 0.5 + 0.5,
    (light[2] / 255) * 0.5 + 0.5,
  ];
}

/** color74.A（:32499）——XNA AlphaBlend dst 衰减面（A>0 → source-over ×alpha）。 */
export const AURA_GLOW_ALPHA = 127 / 255;

// ---- ★R15-F1/F2（2026-10-11 C15 清偿）哨兵族辉光数据面（Main.cs DrawProjDirect）----
//  · F1 火爆塔 663/665/667（:34426-34445）：GlowMask 221/222/223 与本体同布局平行表
//    （rectangle23 已在 :34077-34082 半宽化——X += Width iff ai[2]==1 携行）。脉冲驱动
//    =AI_130 每拍 `++localAI[0]>=300 → 0`（Projectile.cs:69183/:69235/:69287 三档同式,
//    300t 周期自由环）;num434 = (localAI[0]/100·2π).ToRotationVector2().X×1 + 1
//    = cos(θ)+1 ∈ [0,2]（:34430）;色 = Color(140,100,40,0)×(num434/4+0.5)（A=0 纯加法
//    ——XNA α=0 习语,dst 不衰减）×4 份（num435=0..3,offset=(k·π/2).ToRotationVector2()
//    ×num434,右/下/左/上,世界系偏移不随 dir 镜像）。锚/origin/rotation/scale/dir 同本体
//    663 支（vector99=Bottom、origin32=(半宽/2,半高−4)、:34444 同矩形同参）。
//  · F2 爆炸机关 691/692/693（:34507-34521）：GlowMask 235/236/237 同矩形（全帧宽——
//    691 支无半宽化 :34087-34096）,色 = Color(255,255,255,127) 字面（A=127 source-over
//    半透白,XNA AlphaBlend dst 衰减面——flushItemGlow over 支 bake/boost 分解承载）,
//    锚/origin 同本体（vector99/origin32 于 :34089-34096 非携行重锚;携行态=B 支缺省）。
//    均不取光照（字面色,非 color106/GetAlpha 链）→ 本仓 pushGlowOps 合成后逃逸
//    （BJ625件3 同判例）。
export const FLAMEBURST_GLOW_MASK: Readonly<Record<number, number>> = { 663: 221, 665: 222, 667: 223 };
export const TRAP_GLOW_MASK: Readonly<Record<number, number>> = { 691: 235, 692: 236, 693: 237 };

/** F1 num434（:34430）：(localAI[0]/100·2π) 旋转向量 X 分量 + 1 = cos(θ)+1 ∈ [0,2]。 */
export function flameburstGlowRadius(localAI0: number): number {
  return Math.cos((localAI0 / 100) * Math.PI * 2) + 1;
}

/** F1 color117（:34431）：Color(140,100,40,0)×(num434/4+0.5)——A=0 纯加法语义下
 *  贡献 = tex×(rgb/255)×乘子 → 本仓 'add' 支 tint=rgb/255、alpha=乘子。 */
export function flameburstGlowTintAlpha(localAI0: number): { tint: [number, number, number]; alpha: number } {
  return { tint: [140 / 255, 100 / 255, 40 / 255], alpha: flameburstGlowRadius(localAI0) / 4 + 0.5 };
}

/** F2 color74 同款白 A=127（:34521——与 AURA_GLOW_ALPHA 同值异源,独立转录防跨域耦合）。 */
export const TRAP_GLOW_ALPHA = 127 / 255;
