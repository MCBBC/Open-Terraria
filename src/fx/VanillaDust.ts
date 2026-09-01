// 原版 Dust 引擎（Dust.cs NewDustPerfect :52-63 / NewDust :75-285 / CloneDust
// :260-288 / UpdateDust :423-2450 / Main.DrawDust :38266-38436 / GetAlpha
// :2469-2772 / GetColor :2773-2817）——翅膀视觉批引入，拴绳小动物批扩表。
//
// 范围说明：本引擎按"消费方已用到的 type"精植（翅膀尘埃 13 型：6/31/43/55/58/76/
// 86/182/217/229/240/261/264；拴绳批 5 型：43/15/267/278/6；钻头坐骑 230——
// 见各 case 行号），逐型带源码行号；NewDust 初始化链与通用老化链
// （fadeIn=生长目标语义 :2148-2171：0<fadeIn<100 时 scale += 0.03/t 至超 fadeIn
// 转衰落；否则 scale -= 0.01/t）全量 1:1。后续其它系统接入新 type 时按同法扩表。
//
// 结构澄清（1456 Dust.cs 两处易混的 else-if 链，扩表时勿再合并）：
//  ① 883 起的独占链（…235/烟雾族 890/…31 组 1336/…55 组 1759/76@1810/…重力 1884）：
//     命中任一链接即跳过其余链接与 :1884 重力——本引擎 chainLink=true 对应；
//  ② 2080 起的另一条独占链（41@2080/44@2108/兜底 2136 vx×0.99）：与 ① 平行，
//     **全体尘都会评估**（含 ① 已命中者）。本引擎沿用既有近似——链 A 命中者不乘
//     0.99（效应每 tick ×0.99，翅膀尘场景不可辨），独立段型（230/217/240）按源码
//     显式乘。230/644、240/592、263/625 等独立 if 段不属于任何链，逐段全执行。
//
// UpdateDust 结构（照源码三分段，勿合并）：
//  ① 链 A 独占 else-if 链（:423-2139）：一尘至多命中一链接，命中者跳过 :1884
//     通用重力与 :2136 兜底 vx×0.99（267/278 例外见 case 注）；
//  ② 公共段：:2144 旋转 + :2148 fadeIn 老化（全体）；
//  ③ 链 B 独占链（:2197-2386）：130-134/278/219-223/226/272/331 + :2379 兜底
//     （type!=304 && noGravity → velocity×0.92、fadeIn==0 时 scale−0.04）。
//     ★R4-30：226/272/331 三档已实装（226 固定蓝光/272 固定紫光/331=1457 新自色光
//     受 noLightEmittance 门）——头注曾虚标覆盖、实际 switch 缺 case（226 被闪电弹
//     真实消费落 default）。331 绘制端拖影/四向贴片（M57:39639-39695）未建模（登记）。
//  本引擎 switch(链A)+老化后 switch(链B) 两段对应；261/264/182 维持翅膀批
//  既有链 A 单段近似（其后通用重力照旧——扩表时勿动）。
//
// 光照：261/264/182/43/15 族/267/278/6 逐尘 AddLight（update 期收集 → Game 推
// LightingEngine）；43 型需读光（Lighting.GetColor :1475 照度门）——update 由
// Game 注入 lightAt 采样器；278 型入实心格收缩（:2264 WorldGen.SolidTile）需
// solidTileAt 探针；两者缺省 = 全亮/不实心（无注入时门不误杀）。
// 绘制：亮色族 {6,15,59-64}（DrawDust 强制 White :38406）画在光照合成之后
// （= 原版 GetColor(White) 等价），其余画在合成前（逐像素乘光 ≈ 原版逐尘取光）。
// 双 pass：本体（GetAlpha）+ 自定义色 pass（GetColor 加性钳位 :2773）。

export interface DustColor { r: number; g: number; b: number; a: number }

export interface VDust {
  active: boolean;
  x: number; y: number;
  vx: number; vy: number;
  type: number;
  scale: number;
  alpha: number;
  /** 生长目标（0<值<100 时逐 tick +0.03 至超越转 0；0 = 直接衰落） */
  fadeIn: number;
  noGravity: boolean;
  noLight: boolean;
  noLightEmittance: boolean;
  color: DustColor | null;
  rotation: number;
  /** Dust.png 格坐标（10px 格、8×8 取样框） */
  fx: number; fy: number;
  /** customData = 主角（旧位跟随；263/264/182 一次性后清除，261 持续） */
  followPlayer: boolean;
  followOnce: boolean;
  /** 染料 vid（-1 无；GetSecondaryShader(cShoe/cWings) 等价——渲染端跑
   *  SM2 染料字节码（63 pass 全技术，含彩虹/反射/凝胶等动态族）） */
  dyeVid: number;
}

/** Main.maxDustToDraw 的实用上限（翅膀场景并发 ≤40；6000 池的密度门是满载启发式，
 *  此规模永不触发——dCount 五档缩放不建模） */
const POOL = 512;

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/** C# default(Color)（NewDust :170 dust.color = newColor 的缺省实参）= (0,0,0,0)。
 *  逐型分支读 color.R/G/B 时按此兜底——无色尘的发光贡献恒 0（与原版一致）。 */
const BLACK: DustColor = { r: 0, g: 0, b: 0, a: 0 };

/** NewDust 帧映射（:176-191）：X = 10·type，type≥100 每 100 减 1000 加 Y+30。
 *  导出供回归测试锚定（dust 268 帧曾因心算少一轮循环裁成 (680,20)=dust 168 格,
 *  蓝十字×沙色=暗绿"树叶",2026-08-31 定谳——本公式是唯一权威,禁手算内联） */
export function dustFrameOf(type: number): { fx: number; fy: number } {
  let fx = 10 * type, fy = 10 * (Math.random() * 3 | 0);
  let t = type;
  while (t >= 100) { t -= 100; fx -= 1000; fy += 30; }
  return { fx, fy };
}

export class VanillaDust {
  private pool: VDust[] = [];
  private cursor = 0;
  /** update 期收集的光照（Game 每帧推 LightingEngine 后清空） */
  lights: Array<{ x: number; y: number; r: number; g: number; b: number }> = [];

  constructor() {
    for (let i = 0; i < POOL; i++) {
      this.pool.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0, type: 0, scale: 1, alpha: 0,
        fadeIn: 0, noGravity: false, noLight: false, noLightEmittance: false,
        color: null, rotation: 0, fx: 0, fy: 0, followPlayer: false, followOnce: false, dyeVid: -1,
      });
    }
  }

  /** NewDust（:75-285）：位置/速度抖动、scale 抖动、type-6 烟雾初速特例、
   *  屏外裁剪（±400·(1−dCount) 外圈不生成——满池启发式不建模，取 400 常量门）。
   *
   *  opts.perfect = NewDustPerfect 变体通道（Dust.cs:52-63）：内部仍走完整 NewDust
   *  初始化链（含 0 宽盒抖动窗/rand ±2 初速/烟雾族特例），随后仅两个字段被完整
   *  覆写——`dust.position = Position`（盒抖动消解）、Velocity.HasValue 时
   *  `dust.velocity = Velocity.Value`（本仓调用侧恒传具体向量）。由此：
   *  · 烟雾族特例（216-222 型表 242/75/169 等）的 vy 重掷与 vx×0.3 被覆写消解，
   *    定向速度向量原样入池（调用侧全责定义速率域）；
   *  · 其余字段（scale 含 ×0.7 烟雾衰减、alpha/color/frame/fadeIn 等）保持
   *    NewDust 结果——原版 Perfect 不覆写它们，调用侧可像原文那样后置赋值。 */
  spawn(x: number, y: number, w: number, h: number, type: number,
    speedX = 0, speedY = 0, alpha = 0, color: DustColor | null = null, scale = 1,
    opts?: { perfect?: boolean }): VDust | null {
    // 屏外裁剪需要视口信息——由 Game 侧 update 先暂存；spawn 时跳过（池小、
    // 视口裁剪在 update/draw 双重兜底），此处仅密度池满兜底
    let d: VDust | null = null;
    for (let i = 0; i < POOL; i++) {
      const c = this.pool[(this.cursor + i) % POOL];
      if (!c.active) { d = c; this.cursor = (this.cursor + i + 1) % POOL; break; }
    }
    if (!d) return null;
    const w2 = Math.max(5, w), h2 = Math.max(5, h);
    d.active = true;
    d.type = type;
    d.noGravity = false;
    d.color = color;
    d.alpha = alpha;
    d.x = x + (Math.random() * (w2 - 4) | 0) + 4;
    d.y = y + (Math.random() * (h2 - 4) | 0) + 4;
    d.vx = ((Math.random() * 41 | 0) - 20) * 0.1 + speedX;
    d.vy = ((Math.random() * 41 | 0) - 20) * 0.1 + speedY;
    const f = dustFrameOf(type);
    d.fx = f.fx; d.fy = f.fy;
    d.rotation = 0;
    d.scale = (1 + ((Math.random() * 41 | 0) - 20) * 0.01) * scale;
    d.noLight = false;
    d.fadeIn = 0;
    d.noLightEmittance = false;
    d.followPlayer = false;
    d.followOnce = false;
    d.dyeVid = -1;
    // :221-226 烟雾族初速特例（本批 type 6 命中；59-65 等后续接入同享）
    if (type === 228 || type === 279 || type === 269 || type === 135 || type === 6
      || type === 242 || type === 75 || type === 169 || type === 29 || (type >= 59 && type <= 65)
      || type === 158 || (type >= 293 && type <= 298) || type === 302 || type === 307 || type === 310) {
      d.vy = ((Math.random() * 16 | 0) - 10) * 0.1;
      d.vx *= 0.3;
      d.scale *= 0.7;
    }
    // :52-63 NewDustPerfect：dust.position = Position；Velocity.HasValue →
    // dust.velocity = Velocity.Value（仅这两项覆写——scale 等照走 NewDust 结果）
    if (opts?.perfect) {
      d.x = x;
      d.y = y;
      d.vx = speedX;
      d.vy = speedY;
    }
    return d;
  }

  /** CloneDust（:260-288）：NewDust 复入池后逐字段覆写复原（spawn 的抖动/烟雾
   *  特例全部被覆盖）。dustIndex==maxDustToDraw 自身返回（:267-270）在池模型下
   *  等价于"源尘失活/池满返回 null"。注意 noLightEmittance 不复制（原版字段表
   *  :273-286 无此项——NewDust 重置为 false） */
  clone(rf: VDust): VDust | null {
    if (!rf.active) return rf;
    const c = this.spawn(rf.x, rf.y, 5, 5, rf.type, rf.vx, rf.vy, rf.alpha, rf.color, 1);
    if (!c) return null;
    c.x = rf.x; c.y = rf.y;                    // :273 position
    c.vx = rf.vx; c.vy = rf.vy;                // :274 velocity
    c.fadeIn = rf.fadeIn;                      // :275
    c.noGravity = rf.noGravity;                // :276
    c.scale = rf.scale;                        // :277
    c.rotation = rf.rotation;                  // :278
    c.noLight = rf.noLight;                    // :279
    c.active = rf.active;                      // :280
    c.type = rf.type;                          // :281
    c.color = rf.color;                        // :282
    c.alpha = rf.alpha;                        // :283
    c.fx = rf.fx; c.fy = rf.fy;                // :284 frame（原样复制，非重掷）
    c.followPlayer = rf.followPlayer;          // :286 customData=Player
    c.followOnce = rf.followOnce;
    return c;
  }

  /** UpdateDust（:423-2450，消费型精植）。playerDelta = 主角本 tick 位移
   *  （oldPosition 差——customData=Player 跟随用）。
   *  lightAt = Lighting.GetColor(tx,ty) 采样器（43 型照度门 :1475-1484；缺省全亮）；
   *  solidTileAt = WorldGen.SolidTile 探针（278 型入实心格收缩 :2264-2268；缺省恒假）；
   *  player = 主角探针（230 型钻头尘吸向玩家中心 :655-663 / 76 型雪尘随玩家下坠
   *  :1814-1822 读 Main.player[myPlayer] 速度；缺省 = 两效应关闭） */
  update(screenX: number, screenY: number, screenW: number, screenH: number,
    playerDx = 0, playerDy = 0,
    lightAt: ((tx: number, ty: number) => [number, number, number]) | null = null,
    solidTileAt: ((tx: number, ty: number) => boolean) | null = null,
    player: { cx: number; cy: number; vy: number } | null = null): void {
    this.lights.length = 0;
    for (const d of this.pool) {
      if (!d.active) continue;
      // :445 scale>10 兜底
      if (d.scale > 10) { d.active = false; continue; }
      // :469 position += velocity
      d.x += d.vx; d.y += d.vy;
      // :598-602 鸟粪尘（329,独立 if 段,在 883 链之前）：Collision.SolidCollision
      // (position,4,4) 命中实心 → scale ×0.8（4×4 盒跨至多 2×2 格,四角判定）
      if (d.type === 329 && solidTileAt) {
        const bx0 = Math.floor(d.x / 16), by0 = Math.floor(d.y / 16);
        const bx1 = Math.floor((d.x + 3) / 16), by1 = Math.floor((d.y + 3) / 16);
        if (solidTileAt(bx0, by0) || solidTileAt(bx1, by0)
          || solidTileAt(bx0, by1) || solidTileAt(bx1, by1)) {
          d.scale *= 0.8;
        }
      }
      // ---- 链 A 独占段（:883-1894 独占链：命中者跳过其余链接与 :1884 重力）----
      //  230/217/240 是独立段/无档型（非 883 链链接）：chainLink 不置位，重力门
      //  照常评估，:2136 vx×0.99 显式乘（链 A 命中型的 0.99 沿用既有近似不乘，
      //  见文件头结构澄清 ②）。
      let chainLink = false;
      switch (d.type) {
        case 230: { // :644-663 钻头坐骑尘（独立 if 段，非链 A 链接）
          const k = d.scale * 0.6;                        // :646（自增前取值）
          // :654 无 noLight 门恒发光——光源 = (scale·0.6)²×(0.5,0.9,1)
          this.lights.push({ x: d.x, y: d.y, r: k * k * 0.5, g: k * k * 0.9, b: k * k });
          d.scale += 0.02;                                // :653
          if (d.followPlayer && player) {                 // :655-663 customData=Player 吸引
            const rx = d.x - player.cx, ry = d.y - player.cy;
            const len = Math.hypot(rx, ry);
            if (len > 0) {                                // len==0 原版 0/0=NaN，防御跳过
              d.scale = Math.min(d.scale, len / 24 - 1);  // :661
              const pull = 100 / Math.max(50, len);       // :662
              d.vx -= (rx / len) * pull;
              d.vy -= (ry / len) * pull;
            }
          }
          d.vx *= 0.99;                                   // :2136-2139 兜底（230≠304 恒命中）
          break;
        }
        case 264:   // :625-641：光 + 一次性主角跟随
          if (!d.noLight) {
            this.lights.push({ x: d.x, y: d.y, r: (d.color?.r ?? 0) / 255 * d.scale * 0.4,
              g: (d.color?.g ?? 0) / 255 * d.scale * 0.4, b: (d.color?.b ?? 0) / 255 * d.scale * 0.4 });
          }
          if (d.followPlayer) {
            d.x += playerDx; d.y += playerDy;
            if (d.followOnce) d.followPlayer = false;
          }
          break;
        case 182:   // :685-705：rotation+1 + 光(1,0.2,0.1)×min(scale·0.25,1) + 一次性跟随
          d.rotation += 1;
          if (!d.noLight) {
            const k = Math.min(d.scale * 0.25, 1);
            this.lights.push({ x: d.x, y: d.y, r: k, g: k * 0.2, b: k * 0.1 });
          }
          if (d.followPlayer) {
            d.x += playerDx; d.y += playerDy;
            if (d.followOnce) d.followPlayer = false;
          }
          break;
        case 261:   // :705-727：光(0.4,0.6,0.7)×min(scale·0.3,1) + 阻尼×2 档 + 持续跟随
          if (!d.noLight && !d.noLightEmittance) {
            const k = Math.min(d.scale * 0.3, 1);
            this.lights.push({ x: d.x, y: d.y, r: k * 0.4, g: k * 0.6, b: k * 0.7 });
          }
          if (d.noGravity) {
            d.vx *= 0.93; d.vy *= 0.93;
            if (d.fadeIn === 0) d.scale += 0.0025;
          }
          d.vx *= 0.97; d.vy *= 0.99;
          d.scale -= 0.0025;
          if (d.followPlayer) { d.x += playerDx; d.y += playerDy; }
          break;
        case 6: case 229: {  // :890-1092 烟雾族链接：轻重力 + 光（229 = 星璇潜行尘）
          if (!d.noGravity) d.vy += 0.05;                 // :892-895（非通用 0.1）
          if (d.type === 229 && d.followPlayer) {         // :896-917（_NPC/_Vector2 两档
            d.x += playerDx; d.y += playerDy;             //  本仓无消费方——备案不建）
          }
          if (!d.noLight && !d.noLightEmittance) {        // :918
            if (d.type === 229) {                          // :976-983 蓝 青 光
              const k = Math.min(d.scale * 1.4, 1);
              this.lights.push({ x: d.x, y: d.y, r: k * 0.3, g: k * 0.65, b: k * 0.7 });
            } else {                                       // :1083-1090 尾档（6 型灰橙）
              const k = Math.min(d.scale * 1.4, 0.6);
              this.lights.push({ x: d.x, y: d.y, r: k, g: k * 0.65, b: k * 0.4 });
            }
          }
          chainLink = true;
          break;
        }
        case 31: {  // :1336-1394（链 A 326-328/14/16/31/46/124/186/188/303 组链接）
          d.vy *= 0.98; d.vx *= 0.98;                     // :1338-1339
          if (d.noGravity) {                              // :1367-1377（customData=float/_NPC
            d.vx *= 1.02; d.vy *= 1.02;                   //  两档本仓无消费方——备案不建）
            d.scale += 0.02;
            d.alpha += 4;
            if (d.alpha > 255) { d.scale = 0.0001; d.alpha = 255; }
          }
          chainLink = true;
          break;
        }
        case 55: {  // :1759-1799（链 A 55/56/73/74 组链接）
          d.vx *= 0.98; d.vy *= 0.98;                     // :1761
          if (!d.noLightEmittance) {                      // :1762
            const k = Math.min(d.scale * 0.8, 1);         // :1764-1771 白 黄 光
            this.lights.push({ x: d.x, y: d.y, r: k, g: k, b: k * 0.6 });
          }
          chainLink = true;
          break;
        }
        case 76: {  // :1810-1828 雪尘专档（链 A 单型链接）
          d.scale += 0.009;                               // :1813
          const pvy = player?.vy ?? 0;                    // :1814 Main.player[myPlayer].velocity.Y
          if (pvy > 0 && d.fadeIn === 0 && d.vy < pvy) {  // :1815-1818
            d.vy += (pvy - d.vy) * 0.04;                  // Lerp(vy, y, 0.04)
          }
          if (!d.noLight && pvy > 0) d.y += pvy * 0.2;    // :1819-1822
          if (d.fadeIn === 0 && solidTileAt               // :1823-1827（Collision.SolidCollision
            && solidTileAt(Math.floor(d.x / 16), Math.floor(d.y / 16))) {  //  10×10 盒≈本格，备案）
            d.scale *= 0.9;
            d.vx *= 0.25; d.vy *= 0.25;
          }
          // :1812 Main.snowDust++ 是全屏雪密度计数（无本仓等价物）——备案不建
          chainLink = true;
          break;
        }
        case 217:  // 1456 Dust.cs 全文无 217 分支——无链 A 专档，仅兜底
          d.vx *= 0.99;                                   // :2136-2139
          break;   // chainLink 不置位 → 重力门照常（翅膀 26 尘 noGravity 不加重力）
        case 240:  // :592-599 独立段仅 customData=Projectile 跟随（本仓消费方
          d.vx *= 0.99;   // 均不设——备案）；其余同 217 走兜底
          break;
        case 43: {  // :1472-1518 金尘：旋转 + 照度门 + 两段缩放 + 持续玩家跟随
          d.rotation += 0.1 * d.scale;                    // :1474
          const lc = lightAt
            ? lightAt(Math.floor(d.x / 16), Math.floor(d.y / 16)) : [255, 255, 255];
          const c = d.color ?? BLACK;                     // :1479-1481（default(Color)=黑）
          const lr = (lc[0] / 270) * d.scale * 1.07 * (c.r / 255);
          const lg = (lc[1] / 270) * d.scale * 1.07 * (c.g / 255);
          const lb = (lc[2] / 270) * d.scale * 1.07 * (c.b / 255);
          if (d.alpha < 255) {                            // :1485-1493 生长档
            d.scale += 0.09;
            if (d.scale >= 1) { d.scale = 1; d.alpha = 255; }
          } else {                                        // :1494-1504 双段收缩
            if (d.scale < 0.8) d.scale -= 0.01;
            if (d.scale < 0.5) d.scale -= 0.01;
          }
          if (lr < 0.05 && lg < 0.05 && lb < 0.05) {      // :1505-1508 照度门
            d.active = false;
          } else if (!d.noLightEmittance) {               // :1509-1512
            this.lights.push({ x: d.x, y: d.y, r: lr, g: lg, b: lb });
          }
          if (d.followPlayer) { d.x += playerDx; d.y += playerDy; }   // :1513-1517
          chainLink = true;
          break;
        }
        case 15: case 57: case 58: case 274: case 292: {  // :1519-1551 Recall/魔光族
          d.vy *= 0.98; d.vx *= 0.98;                     // :1521-1522
          if (!d.noLightEmittance) {                      // :1523-1550
            let k = d.type === 15 ? d.scale : d.scale * 0.8;   // :1525-1529
            if (d.noLight) { d.vx *= 0.95; d.vy *= 0.95; }     // :1530-1533
            if (k > 1) k = 1;                             // :1534-1537
            if (d.type === 15) {                          // :1538-1541
              this.lights.push({ x: d.x, y: d.y, r: k * 0.45, g: k * 0.55, b: k });
            } else if (d.type === 57) {                   // :1542-1545
              this.lights.push({ x: d.x, y: d.y, r: k * 0.95, g: k * 0.95, b: k * 0.45 });
            } else if (d.type === 58) {                   // :1546-1549
              this.lights.push({ x: d.x, y: d.y, r: k, g: k * 0.55, b: k * 0.75 });
            }
            // 274/292：仅阻尼无光（原版同链无 AddLight 分支）
          }
          chainLink = true;
          break;
        }
        case 267: {  // :1660-1686 帝皇蝶尘：方向旋转 + 阻尼 + 生长 + 自色光
          d.rotation += d.vx < 0 ? -1 : 1;                // :1662-1669
          d.vy *= 0.98; d.vx *= 0.98;                     // :1670-1671
          d.scale += 0.02;                                // :1672
          const k = Math.min(d.scale * 0.8, 1);           // :1673-1677
          if (d.noLight) d.noLight = false;               // :1678-1681 自愈
          if (!d.noLight && !d.noLightEmittance) {        // :1682-1685
            const c = d.color ?? BLACK;
            this.lights.push({ x: d.x, y: d.y, r: k * c.r / 255, g: k * c.g / 255, b: k * c.b / 255 });
          }
          chainLink = true;
          break;
        }
        case 278:   // :2240-2269 妖精尘：链 A 无专档，仅命中 :2136-2139 兜底
          d.vx *= 0.99;
          chainLink = true;
          break;
        default:
          break;
      }
      // :1884-1894 重力（链 A 命中者由其链接自管速度，跳过；链头特型不在消费集）
      if (!chainLink && !d.noGravity && d.type !== 41 && d.type !== 44 && d.type !== 309) {
        d.vy += 0.1;
      }
      // :1895-1897 血尘 5/273 悬浮档（noGravity 时额外收缩——本引擎产 5 号恒重力档
      // （NewDust noGravity 恒 false），门随源码保留防未来悬浮产尘漏缩）
      if ((d.type === 5 || d.type === 273) && d.noGravity) d.scale -= 0.04;
      // :2144-2146 通用旋转
      if (d.type !== 79 && d.type !== 268 && d.type !== 304) {
        d.rotation += d.vx * 0.5;
      }
      // :2148-2171 fadeIn 生长目标语义
      if (d.fadeIn > 0 && d.fadeIn < 100) {
        if (d.type === 46 || d.type === 213 || d.type === 260) d.scale += 0.1;
        else if (d.type === 235) d.scale += 0.007;
        else d.scale += 0.03;
        if (d.scale > d.fadeIn) d.fadeIn = 0;
      } else if (d.type !== 304) {
        if (d.type === 213 || d.type === 260) d.scale -= 0.2;
        else d.scale -= 0.01;
      }
      // ---- 链 B 独占段（:2197-2386，公共老化之后）----
      switch (d.type) {
        // R4-30：226/272/331 三档补（Dust.cs:2317-2400;1456 无 331,226/272 曾落
        // default 无光无阻尼——226 被 LightningBoltProj 真实消费）。customData
        // （Player 跟随/Color 自色光）本仓无该字段=不建模（备案）
        case 226: {  // :2317-2350：固定光 (0.2,0.7,1.0)×min(scale,1) + 0.93 阻尼
          const k = Math.min(d.scale, 1);
          if (!d.noLight) {
            this.lights.push({ x: d.x, y: d.y, r: 0.2 * k, g: 0.7 * k, b: 1.0 * k });
          }
          if (d.noGravity) {
            d.vx *= 0.93; d.vy *= 0.93;
            if (d.fadeIn === 0) d.scale += 0.0025;
          }
          d.vx *= 0.97; d.vy *= 0.99;                    // :2339 velocity *= (0.97,0.99)
          d.scale -= 0.01;
          break;
        }
        case 331: {  // :2352-2371（1457 新）：自色光 color RGB×min(scale,1) 受 noLightEmittance 门
          const k = Math.min(d.scale, 1);
          if (d.noGravity) {                             // 1457 语义:noGravity 才 0.93 阻尼（无 else 档）
            d.vx *= 0.93; d.vy *= 0.93;
            if (d.fadeIn === 0) d.scale += 0.0025;
          }
          d.vx *= 0.97; d.vy *= 0.99;
          if (!d.noLightEmittance) {
            const c = d.color ?? BLACK;
            this.lights.push({ x: d.x, y: d.y, r: c.r / 255 * k, g: c.g / 255 * k, b: c.b / 255 * k });
          }
          d.scale -= 0.01;
          break;
        }
        case 272: {  // :2373-2400：固定光 (0.5,0.2,0.8)×min(scale,1) + 0.93 阻尼
          const k = Math.min(d.scale, 1);
          if (!d.noLight) {
            this.lights.push({ x: d.x, y: d.y, r: 0.5 * k, g: 0.2 * k, b: 0.8 * k });
          }
          if (d.noGravity) {
            d.vx *= 0.93; d.vy *= 0.93;
            if (d.fadeIn === 0) d.scale += 0.0025;
          }
          d.vx *= 0.97; d.vy *= 0.99;
          d.scale -= 0.01;
          break;
        }
        case 278: {  // :2240-2269：自色光 + 双档阻尼 + 入实心格收缩
          const k = Math.min(d.scale, 1);                 // :2242-2246
          if (!d.noLight && !d.noLightEmittance) {        // :2247-2250
            const c = d.color ?? BLACK;
            this.lights.push({ x: d.x, y: d.y, r: c.r / 255 * k, g: c.g / 255 * k, b: c.b / 255 * k });
          }
          if (d.noGravity) {                              // :2251-2258
            d.vx *= 0.93; d.vy *= 0.93;
            if (d.fadeIn === 0) d.scale += 0.0025;
          } else {                                        // :2259-2263
            d.vx *= 0.95; d.vy *= 0.95;
            d.scale -= 0.0025;
          }
          if (solidTileAt && d.fadeIn === 0 && !d.noGravity   // :2264-2268
            && solidTileAt(Math.floor(d.x / 16), Math.floor(d.y / 16))) {
            d.scale *= 0.9;
            d.vx *= 0.25; d.vy *= 0.25;
          }
          break;
        }
        case 6: case 15: case 43: case 57:
        case 58: case 267: case 274: case 292:
        case 229: case 230: case 31: case 55:
        case 76: case 217: case 240:
          // :2379-2386 链 B 兜底（type!=304 && noGravity 才有效应——拴绳批诸型
          // 多为 noGravity=false 不命中；267/229/230/31/76/217/240 恒命中）
          if (d.noGravity) {
            d.vx *= 0.92; d.vy *= 0.92;
            if (d.fadeIn === 0) d.scale -= 0.04;
          }
          break;
        default:
          break;
      }
      // :2387 屏底清除
      if (d.y > screenY + screenH) { d.active = false; continue; }
      // :2432-2436 缩没清除（dCount 五档密度缩放不建模——池小永不触发）
      if (d.scale < 0.1) d.active = false;
    }
  }

  /** 活动尘迭代（绘制用；fullbright=true 只取亮色族 {6,15,59-64}，false 取其余） */
  *each(fullbright: boolean): Generator<VDust> {
    for (const d of this.pool) {
      if (!d.active) continue;
      if (fullbrightnessWanted(fullbright, d)) yield d;
    }
  }

  /** GetAlpha（:2469-2772 消费型精植）：返回乘数 [rgb, alpha]（0-1） */
  static alphaOf(d: VDust): { rgb: number; a: number } {
    const num = (255 - d.alpha) / 255;
    switch (d.type) {
      case 261: return { rgb: 230 / 255, a: 115 / 255 };                       // :2521
      case 6: return { rgb: 1, a: 25 / 255 };                                   // :2583
      case 182: return { rgb: 1, a: 0 };                                        // :2517
      case 267: return { rgb: 1, a: 0 };                                        // :2743-2746 Color(color.RGB,0)——色走 color pass
      case 278: return { rgb: 1, a: 25 / 255 };                                 // :2632-2637 newColor×color, A=25
      case 58: return { rgb: 1, a: 0 };                                         // :2721-2724 Color(255,255,255,0)
      case 230: return { rgb: 1, a: 0 };   // :2616-2619 Color(255,255,255,0)——钻头尘本体透明，纯光源
      case 229: return { rgb: 1, a: 25 / 255 };   // :2659-2663（Lerp(lighting,White,0.6) 近似为全亮基底，备案）
      case 55: return { rgb: (num + 3) / 4, a: num };   // :2725-2727（num+3)/4 光乘区折减族
      // 15/57/274 亮色族走默认档：本体 A=255−alpha（:2756-2759），(num+3)/4 的
      // 光乘区折减由"画在合成后强制 White"（DrawDust :38406）等价表达
      case 264: {                                                               // :2508
        const c = d.color ?? { r: 0, g: 0, b: 0, a: 0 };
        return { rgb: 0.5, a: (clamp255(c.a / 8) / 255) * 0.5 };
      }
      case 86: case 87: case 88: case 89: case 90: case 91:
        if (!d.noLight) return { rgb: 1, a: 0 };                                // :2511
        return { rgb: num, a: num };
      default:
        return { rgb: num, a: num };
    }
  }

  /** GetColor（:2773-2817 加性钳位）：second pass 色（尘自定义色与基色的叠加） */
  static colorPass(d: VDust, baseRgb: number, baseA: number): DustColor | null {
    if (!d.color) return null;
    return {
      r: clamp255(d.color.r - (255 - baseRgb * 255)) / 255,
      g: clamp255(d.color.g - (255 - baseRgb * 255)) / 255,
      b: clamp255(d.color.b - (255 - baseRgb * 255)) / 255,
      a: clamp255(d.color.a - (255 - baseA * 255)) / 255,
    };
  }
}

function fullbrightnessWanted(wantFb: boolean, d: VDust): boolean {
  const fb = d.type === 6 || d.type === 15 || (d.type >= 59 && d.type <= 64);
  return wantFb === fb;
}
