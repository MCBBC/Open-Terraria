// MartianSky.cs(Terraria.GameContent.Skies/MartianSky.cs 全文)1:1——火星入侵 UFO 天幕。
// 激活链:DrawClouds 段轮询(Main.cs:58757-58763)——invasionType==4 && !IsActive →
// Activate("Martian");invasionType!=4 && IsActive → Deactivate。
// 贴图:近档 TextureAssets.Extra[5](28×42 三帧)+GlowMask[90],远档 Extra[6](70×90
// 三帧)+GlowMask[91]、Scale 0.5;帧推进 _frame%12、源帧行 _frame/4(FRAME_RATE 4)。
// 本文件纯逻辑零 DOM:UFO 持贴图/辉光索引,绘制由 SkyRenderer.drawMartianSky 承担。

export interface UfoSkyEnt {
  x: number; y: number;          // Position(世界 px)
  depth: number;                 // Depth(近档 rand×4+6.6 / 远档 rand×5+1.6)
  scale: number;                 // Scale(近 1 / 远 0.5;:318)
  opacity: number;               // Opacity(行为首尾 10tick ±0.1 淡入出)
  rotation: number;              // Rotation(Zip = 速度角 ±0.3 或 +π;Hover 0)
  frame: number;                 // _frame(0-11,setter %12;源帧行 = _frame/4)
  /** 贴图索引:0 = Extra_5(近档)/1 = Extra_6(远档) */
  tex: number;
  /** 辉光索引:0 = Glow_90 / 1 = Glow_91 */
  glow: number;
  active: boolean;               // IsActive
  /** IUfoController 具体类:0 = ZipBehavior / 1 = HoverBehavior */
  behavior: number;
  /** Zip 速度(InitializeUfo :38);Hover 恒 0 */
  vx: number; vy: number;
  ticks: number;                 // _ticks
  maxTicks: number;              // _maxTicks(Zip Next(400,500) / Hover Next(120,240))
}

/** C# 字面量双精度(f 修饰符的实际值):num2 = rand×0.6000000238418579 − 0.30000001192092896 */
const ZIP_ANGLE_SPAN = 0.6000000238418579;
const ZIP_ANGLE_OFF = -0.30000001192092896;

export class MartianSky {
  ufos: UfoSkyEnt[] = [];
  /** _maxUfos = (int)(256 × maxTilesX/4200) */
  maxUfos = 0;
  /** _activeUfos(活动前缀长度,见 update 注) */
  activeUfos = 0;
  /** _active */
  isActive = false;
  /** _leaving */
  isLeaving = false;
  /** maxTilesX << 4(世界宽 px;行为重掷的 X 域) */
  private worldPx = 1;

  constructor(private rnd: () => number = Math.random) {}

  /** Activate(:323-330) = _activeUfos=0 + GenerateUfos(:302-321) + Depth 降序排序 */
  activate(maxTilesX: number): void {
    const r = this.rnd;
    this.worldPx = maxTilesX * 16;
    this.maxUfos = Math.floor(256 * (maxTilesX / 4200));          // :304-305
    this.ufos = new Array(this.maxUfos);
    const near = this.maxUfos >> 4;                               // :307 num2(近档 1/16)
    for (let i = 0; i < this.maxUfos; i++) {
      const base = {
        x: 0, y: 0, depth: 0, scale: 1, opacity: 0, rotation: 0, frame: 0,
        active: false, behavior: 0, vx: 0, vy: 0, ticks: 0, maxTicks: 0,
      };
      if (i < near) {
        // :311-312 近档:Extra[5]、Depth rand×4+6.6、GlowMask[90]
        this.ufos[i] = { ...base, tex: 0, glow: 0, depth: r() * 4 + 6.6 };
      } else {
        // :317-319 远档:Extra[6]、Depth rand×5+1.6、Scale 0.5、GlowMask[91]
        this.ufos[i] = { ...base, tex: 1, glow: 1, depth: r() * 5 + 1.6, scale: 0.5 };
      }
    }
    this.ufos.sort((a, b) => b.depth - a.depth);                  // :327 ufo2.Depth.CompareTo(ufo1) = 降序
    this.activeUfos = 0;                                          // :325
    this.isActive = true;                                         // :328
    this.isLeaving = false;                                       // :329
  }

  /** Deactivate(:332-335) */
  deactivate(): void {
    this.isLeaving = true;
  }

  /** Reset(:342-345) */
  reset(): void {
    this.isActive = false;
  }

  /** AssignNewBehavior(:195-206):Next(2) → Zip(0) / Hover(1) */
  private assignNewBehavior(u: UfoSkyEnt): void {
    const r = this.rnd;
    if (Math.floor(r() * 2) === 0) {
      // ZipBehavior.InitializeUfo(:26-41)
      u.behavior = 0;
      u.x = r() * this.worldPx;                                   // :28 maxTilesX<<4
      u.y = r() * 5000;                                           // :29
      u.opacity = 0;                                              // :30
      const spd = r() * 5 + 10;                                   // :31 num
      let ang = r() * ZIP_ANGLE_SPAN + ZIP_ANGLE_OFF;             // :32 num2
      u.rotation = ang;                                           // :33
      if (Math.floor(r() * 2) === 0) ang += Math.PI;              // :34-37
      u.vx = Math.cos(ang) * spd;                                 // :38
      u.vy = Math.sin(ang) * spd;
      u.ticks = 0;                                                // :39
      u.maxTicks = 400 + Math.floor(r() * 100);                   // :40 Next(400,500)
    } else {
      // HoverBehavior.InitializeUfo(:69-77)
      u.behavior = 1;
      u.x = r() * this.worldPx;
      u.y = r() * 5000;
      u.opacity = 0;
      u.rotation = 0;                                             // :74
      u.ticks = 0;
      u.maxTicks = 120 + Math.floor(r() * 120);                   // :76 Next(120,240)
    }
  }

  /** IUfoController.Update(Zip :43-60 / Hover :79-95;淡入出与终判同构)。
   *  返回 false = 行为完成(调用方换行为或熄灭)。 */
  private stepUfo(u: UfoSkyEnt): boolean {
    if (u.ticks < 10) u.opacity += 0.1;                           // :45-47/:81-83
    else if (u.ticks > u.maxTicks - 10) u.opacity -= 0.1;         // :48-50/:84-86
    if (u.behavior === 0) {
      u.x += u.vx;                                                // :53 Zip 平移
      u.y += u.vy;
    }
    if (u.ticks === u.maxTicks) return false;                     // :54/:89
    u.ticks++;                                                    // :57/:92
    return true;
  }

  /** Update(:221-256)——单 60Hz tick。
   *  活动集是数组前缀:Spawn 补位按 num 下标递增(!leaving 时每 tick 恰一个);
   *  行为完成时非离场→换行为(仍活),离场→熄灭且 num--。 */
  update(): void {
    if (!this.isActive) return;                                   // SkyManager 只 Update 活动天空
    let num = this.activeUfos;                                    // :227
    for (const u of this.ufos) {
      if (!u.active) continue;                                    // :231
      u.frame = (u.frame + 1) % 12;                               // :233 Frame++(setter %12)
      if (!this.stepUfo(u)) {                                     // :234
        if (!this.isLeaving) {
          this.assignNewBehavior(u);                              // :238
        } else {
          u.active = false;                                       // :242
          num--;                                                  // :243
        }
      }
    }
    if (!this.isLeaving && num !== this.maxUfos) {                // :249
      this.ufos[num].active = true;                               // :251
      this.assignNewBehavior(this.ufos[num]);                     // :252 Controller setter → InitializeUfo
      num++;
    }
    this.isActive = !this.isLeaving || num !== 0;                 // :254
    this.activeUfos = num;                                        // :255
  }
}

/** Draw :283 UFO 着色(纯函数):color = ColorOfTheSkies×0.9+0.1(α=1;
 *  绘制时 ×Opacity → globalAlpha)。与剪影族不同:无 ×0.8/深度档。 */
export function ufoTintColor(cots: readonly [number, number, number]): { r: number; g: number; b: number } {
  const ch = (c: number) => c / 255 * 0.9 + 0.1;
  return { r: ch(cots[0]), g: ch(cots[1]), b: ch(cots[2]) };
}

/** Draw :288-291 视差投影(纯函数;无 X 环绕——与剪影/气球族差异点) */
export function ufoProject(
  x: number, y: number, depth: number,
  camX: number, camY: number, viewW: number, viewH: number,
): { x: number; y: number } {
  return {
    x: (x - camX) / depth + viewW / 2,
    y: (y - camY) * 0.9 / depth + viewH / 2,
  };
}
