// SlimeSky.cs(Terraria.GameContent.Skies/SlimeSky.cs 全文)1:1——史莱姆雨天幕剪影族。
// 激活链:StartSlimeRain(Main.cs:64221 netMode1 /:64237 单机)→ SkyManager.Instance
//  .Activate("Slime");StopSlimeRain(:64261/:64277)→ Deactivate。Update 随
// SkyManager.Update 60Hz(dayRate 遍,正常=1);Draw 在 DrawSurfaceBG 的
// SkyManager.DrawToDepth 深度交错段(实体 Depth 1.6-3.85 ≈ 近景 parallax 0.5-0.26 带)
// ——本仓画在群系背景之上、tile 之下(Renderer 1.55 drawAmbience 槽)。
// 本文件纯逻辑零 DOM:实体持贴图索引 0-3(Images/Misc/Sky_Slime_1-4,四帧竖排),
// 位图装载/染色/绘制由 SkyRenderer.drawSlimeSky 承担。

/** Slime 结构(:11-63)本仓表示(Position/Depth/Speed/Frame/Active + 贴图索引) */
export interface SlimeSkyEnt {
  x: number; y: number;          // Position(世界 px)
  depth: number;                 // Depth(1.6 基带 + 0..1.75 指数位 + 稀有 +0.5)
  speed: number;                 // Speed(px/tick,下落)
  frame: number;                 // _frame(0-23,setter %24;帧行 = _frame/6 → 0-3)
  tex: number;                   // _textures 下标:0/1 常规(Next(2))、2 稀有 1/30、3 稀有 1/60
  active: boolean;               // Active(leaving 落地即熄)
}

/** Activate 所需世界/屏幕参数(GenerateSlimes :87-112 的输入) */
export interface SlimeSkyGenInput {
  maxTilesX: number;
  maxTilesY: number;
  /** Main.worldSurface × 16(生成带下界/重生线共用) */
  surfacePx: number;
  /** Main.screenPosition.Y(屏顶世界 px,生成带锚 :92) */
  screenTopY: number;
  /** Main.screenHeight */
  screenHeight: number;
}

export class SlimeSky {
  entities: SlimeSkyEnt[] = [];
  /** _slimesRemaining */
  remaining = 0;
  /** _isActive */
  isActive = false;
  /** _isLeaving(Deactivate 后落地即熄,不清场) */
  isLeaving = false;
  private surfacePx = 0;
  private maxTilesX = 1;

  constructor(private rnd: () => number = Math.random) {}

  /** Activate(:230-235) = GenerateSlimes(:87-112) + isActive/!isLeaving */
  activate(g: SlimeSkyGenInput): void {
    const r = this.rnd;
    this.surfacePx = g.surfacePx;
    this.maxTilesX = g.maxTilesX;
    const n = Math.floor(g.maxTilesY / 6);                        // :89 maxTilesY/6 整除
    this.entities = new Array(n);
    // :92-94 生成带:num = (int)(screenTopY×0.7 − screenHeight)、min = num − surfacePx,
    // Y ∈ [min, num)(Next(minValue,num));X ∈ [0,maxTilesX)×16
    const num = Math.trunc(g.screenTopY * 0.7 - g.screenHeight);
    const minValue = Math.trunc(num - g.surfacePx);
    for (let i = 0; i < n; i++) {
      const e: SlimeSkyEnt = {
        x: Math.floor(r() * g.maxTilesX) * 16,                    // :94 Next(0,maxTilesX)*16
        y: minValue + Math.floor(r() * (num - minValue)),         // :94 Next(minValue,num)
        depth: (i / n) * 1.75 + 1.6,                              // :96
        speed: 5 + 3 * r(),                                       // :95
        frame: 0,
        tex: Math.floor(r() * 2),                                 // :97 _textures[Next(2)]
        active: true,
      };
      if (Math.floor(r() * 60) === 0) {                           // :98 稀有 1/60 → 大史莱姆
        e.tex = 3;                                                // :100
        e.speed = 6 + 3 * r();                                    // :101
        e.depth += 0.5;                                           // :102
      } else if (Math.floor(r() * 30) === 0) {                    // :104 稀有 1/30 → 中史莱姆
        e.tex = 2;                                                // :106
        e.speed = 6 + 2 * r();                                    // :107
      }
      this.entities[i] = e;
    }
    this.remaining = n;                                           // :111
    this.isActive = true;                                         // :233
    this.isLeaving = false;                                       // :234
  }

  /** Deactivate(:237-240):进入离场(逐个落地熄灭) */
  deactivate(): void {
    this.isLeaving = true;
  }

  /** Reset(:242-245) */
  reset(): void {
    this.isActive = false;
  }

  /** Update(:114-160)——单 60Hz tick(Frame 推进/下落/落地重生或离场熄灭) */
  update(): void {
    if (!this.isActive) return;                                   // SkyManager 只 Update 活动天空
    const r = this.rnd;
    const n = this.entities.length;
    for (let i = 0; i < n; i++) {
      const s = this.entities[i];
      if (!s.active) continue;                                    // :122
      s.frame = (s.frame + 1) % 24;                               // :126 Frame++(setter %24)
      s.y += s.speed;                                             // :127
      if (s.y <= this.surfacePx) continue;                        // :128 !> worldSurface×16
      if (!this.isLeaving) {
        // :132-148 落地重生:深度复位基带公式,顶边 -100 重掷(与生成同稀有支)
        s.depth = (i / n) * 1.75 + 1.6;                           // :134
        s.x = Math.floor(r() * this.maxTilesX) * 16;              // :135 Next(0,maxTilesX)*16
        s.y = -100;                                               // :135
        s.tex = Math.floor(r() * 2);                              // :136
        s.speed = 5 + 3 * r();                                    // :137
        if (Math.floor(r() * 60) === 0) {                         // :138-143
          s.tex = 3;
          s.speed = 6 + 3 * r();
          s.depth += 0.5;
        } else if (Math.floor(r() * 30) === 0) {                  // :144-148
          s.tex = 2;
          s.speed = 6 + 2 * r();
        }
      } else {
        s.active = false;                                         // :152
        this.remaining--;                                         // :153
      }
    }
    if (this.remaining === 0) this.isActive = false;              // :156-158
  }
}

/** Draw :193-212 剪影着色(纯函数,0-1 浮点):
 *  基色 = (ColorOfTheSkies×0.9+0.1)×0.8 → 深度档 num3(>3→0.6 / >2.5→0.7 /
 *  >2→0.8 / >1.5→0.9 / 其余 1)×0.8 全通道乘 → rgb=(c×0.9+0.1)×0.64×档、α=0.64×档。
 *  (XNA 两处 0.8:Color×0.8f 与 num3×=0.8——α 同乘,α=1×0.8×num3) */
export function slimeSilhouetteTint(
  cots: readonly [number, number, number], depth: number,
): { r: number; g: number; b: number; a: number } {
  let tier = 1;                                                   // :194
  if (depth > 3) tier = 0.6;                                      // :195-197
  else if (depth > 2.5) tier = 0.7;                               // :199-200
  else if (depth > 2) tier = 0.8;                                 // :202-203
  else if (depth > 1.5) tier = 0.9;                               // :206-207
  const mul = tier * 0.8;                                         // :211
  const ch = (c: number) => (c / 255 * 0.9 + 0.1) * 0.8 * mul;
  return { r: ch(cots[0]), g: ch(cots[1]), b: ch(cots[2]), a: 1 * 0.8 * mul };
}

/** Draw :213-221 视差投影(纯函数):vector2=(1/d, 0.9/d),绕屏中心(=相机中心)
 *  投影后 X 4000 环绕((px+500)%4000 负数补 4000 再 −500)。 */
export function slimeProject(
  x: number, y: number, depth: number,
  camX: number, camY: number, viewW: number, viewH: number,
): { x: number; y: number } {
  const px = (x - camX) / depth + viewW / 2;
  const py = (y - camY) * 0.9 / depth + viewH / 2;
  return {
    x: (((px + 500) % 4000) + 4000) % 4000 - 500,
    y: py,
  };
}
