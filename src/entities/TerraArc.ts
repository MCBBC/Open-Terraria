// 泰拉刃伴生旋斩弧（Projectile 984，aiStyle 190 AI_190_NightsEdge）：
//   Player.cs:48313 出生：MountedCenter、velocity=(direction,0)、ai[0]=朝向、
//   ai[1]=itemAnimationMax、ai[2]=调整 scale。锚定玩家（Center=MountedCenter−velocity）、
//   rotation = π×ai0×(t/ai1) + vel角 + ai0×π（挥砍旋进）；scale=(1+0.6×num)×ai2；
//   t≥ai[1] Kill。绘制 = DrawProj_TerraBlade2（Main.cs:27630：Frame(1,4) 170×680
//   四帧分层——蓝/绿白内芯/绿/黄绿/帧3白芯三层 + 12 点星尘弧）；
//   opacity 拱形 Remap(num,0,.6,0,1)×Remap(num,.6,1,1,0)。首帧 Item60×0.65。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { projSprite } from './Arrow';
import { playerCanHitEnemy } from './projTargets';

interface ArcOwner { cx: number; cy: number; x: number; y: number; w: number; h: number; facing: number; dead: boolean }

export class TerraArc extends Entity {
  w = 16; h = 16;
  damage: number;
  /** ai[0] 朝向 ±1 / ai[1] itemAnimationMax / ai[2] scale */
  private ai0: number;
  private ai1: number;
  private ai2: number;
  private t = 0;
  private rot = 0;
  private scaleCur = 1;
  /** opacity 拱形（num3） */
  op = 0;
  private owner: ArcOwner;
  /** 同敌单次（localNPCHitCooldown=-1：每敌整生只中一跳） */
  private hitSet = new Set<number>();
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  lightRGB: [number, number, number] | null = null;

  constructor(owner: ArcOwner, animMax: number, damage: number, facing: number, scale: number) {
    super();
    this.owner = owner;
    this.ai0 = facing;
    this.ai1 = Math.max(1, animMax);
    this.ai2 = scale;
    this.damage = damage;
  }

  get num(): number { return this.t / this.ai1; }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.t++;
    if (this.t === 1) game.playSfxFiles(['Item_60'], 0.65, this.cx, this.cy);   // :39417 ×0.65
    if (this.owner.dead) { this.dead = true; return; }
    const num = this.num;
    // 旋转（:39425-39427）：π×ai0×num + vel角(0|π) + ai0×π（vel=(direction,0)）
    this.rot = Math.PI * this.ai0 * num + (this.ai0 > 0 ? 0 : Math.PI) + this.ai0 * Math.PI;
    // 锚定（:39449 Center=MountedCenter−velocity，vel 单位 x）
    this.x = this.owner.cx - this.w / 2 - Math.sign(this.ai0);
    this.y = this.owner.cy - this.h / 2;
    this.scaleCur = (1 + num * 0.6) * this.ai2;                                  // :39449-39450
    this.op = Math.min(1, Math.max(0, num / 0.6)) * (num <= 0.6 ? 1 : Math.max(0, (1 - num) / 0.4));
    this.lightRGB = [15 / 255, 84 / 255, 125 / 255];                             // :39533
    // 命中：穿透 3、同敌单跳（localNPCHitCooldown=-1 :9112-9113）
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || this.hitSet.has(e.id)) continue;
      // 弧判定：弹盒 16×16 太小，用 scale×85 半径的旋转盒近似（原版走 CanHitWithOwnBody
      // 的 190/191 扇形 EmitEnchantment 60px×4 + 自盒 16——取弧臂 85×scale 内 AABB 近似）
      const reach = 85 * this.scaleCur;
      const ex = this.cx + Math.cos(this.rot) * reach * 0.5;
      const ey = this.cy + Math.sin(this.rot) * reach * 0.5;
      const bw = reach, bh = 60 * this.scaleCur;
      if (!(ex - bw / 2 < e.x + e.w && ex + bw / 2 > e.x && ey - bh / 2 < e.y + e.h && ey + bh / 2 > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      e.hurt(dmg, this.ai0 * 6.5, 0, game, this.armorPen, crit, 0, true);   // fromPlayer=DPS 计
      this.hitSet.add(e.id);
    }
    if (this.t >= this.ai1) this.dead = true;                                    // :39554-39557
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }): void {
    const img = projSprite(984);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || img.width === 0 || !ctx) return;
    const fw = img.width, fh = img.height / 4;
    const num = this.num;
    const sc = this.scaleCur * 1.1;                       // :27636 num=proj.scale×1.1
    const layer = (frame: number, angOff: number, sy: number, alpha: number, flipV: boolean) => {
      if (alpha <= 0.02) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(this.cx, this.cy);
      ctx.rotate(this.rot + angOff * this.ai0);
      if (flipV) ctx.scale(1, -1);                        // effects=ai0<0 → FlipVertically（:27637）
      const dw = fw * sy * sc, dh = fh * sy * sc;
      ctx.drawImage(img, 0, frame * fh, fw, fh, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
      ctx.globalAlpha = 1;
    };
    ctx.imageSmoothingEnabled = false;
    const op = this.op;
    // :27648-27661 分层（蓝对/绿白内芯/绿/黄绿/帧3白芯三层）
    layer(0, -Math.PI / 4 * (1 - num), 0.95 * 0.95, 0.9 * op, this.ai0 < 0);   // 蓝（color 45,124,205 ≈0.9）
    layer(0, 0.01, 1, 0.15 * op, this.ai0 < 0);                                // 绿白内芯
    layer(0, 0, 1, 0.3 * op, this.ai0 < 0);                                    // 绿 (34,177,76)
    layer(0, 0, 0.975, 0.5 * op, this.ai0 < 0);                                // 黄绿 (181,230,29)
    layer(3, 0.01, 1, 0.6 * op, this.ai0 < 0);                                 // 帧3 白芯三层
    layer(3, -0.05, 0.8, 0.5 * op, this.ai0 < 0);
    layer(3, -0.1, 0.6, 0.4 * op, this.ai0 < 0);
  }
}
