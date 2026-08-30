// 打窝桶投掷物(Projectile 820,AI_163_Chum Projectile.cs:54413-54547)。
// Item 4608（Item.cs:38234-38246 useStyle1/shootSpeed7/shoot820/18×20/consumable/
// UseSound Item1/useTime=useAnimation19/noMelee）；弹 SetDefaults :8021-8031
// ——12×12/friendly/aiStyle163/tileCollide true/netImportant/penetrate −1/timeLeft 86400。
//
// 生产者接线（本文件 = chumBucket.ts 注册面的【活数据源】）：
//   每 tick `if (ai[0] < 10 && timeLeft > 60)` 门内 :54538-54546
//   spot = Center + UnitY*16 → chumReport(spot)；rx..rh 上报本弹矩形
//   （NPC.SharkSpawnChance 的 Collision.CanHit 面，消费端 world/spawn/VanillaSpawner.ts;
//    GetFishingPondState 渔力累进 +11/+6/+3 消费端 Bobber.getFishingPondState→chumsInTile）
//   ——chumOnPreUpdateAll 双缓冲翻转由 Game 每 tick 在实体更新前调用
//   （Main.cs:17721 OnPreUpdateAllProjectiles 同位次）。
// 物理（AI_163 :54413-54503）：
//   · 同型互斥：1000 内同 type 弹心差 |dx|+|dy| < width/2 时按方向 ±0.05 推开
//   · wet 分支：vx×0.9、vy>0 时 vy×0.5；Center 钉 GetWaterLine 液面（低于液面 →
//     vy−0.1 下限 −8,快到线则收敛 vy=line−cy；高于液面(含 vy≤0)→ 直接 vy=line−cy）
//   · dry 分支：vy==0 时 vx×0.95;恒 vx×0.98；vy+0.3 终端 15.9
//   · scale = lerp(timeLeft,60,0)（最后 1s 缩没）;rotation += vx×0.14
//   · frame 出生 rand(4)
//   · 出生动量出自射速 7 朝鼠标(ItemCheck_Shoot 向量式)
// 登记偏差：泡沫 gore(1201/1208)与浮泡粒子未接 GorePiece 表——以 spawnParticles 最小
//   视觉近似;同型互斥扫描按 game.projectiles() 只读桶等价(原版 Main.projectile 全扫);
//   液体 wet 判定 = 弹心格 liquid>0(Arrow 469 同口径近似原版 WetCollision)。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { TILE } from '../core/constants';
import { getWaterLine } from './npcLiquid';
import { chumReport } from './chumBucket';

export class ChumBucketProj extends Entity {
  w = 12; h = 12;
  dead = false;
  readonly projId = 820;
  /** 原版 timeLeft 86400t（一整天）——中文面打一次窝几乎不自然消散,Kill 主靠移出界 */
  life = 86_400;
  rot = 0;
  frame = 0;

  constructor(x: number, y: number, vx: number, vy: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.frame = (Math.random() * 4) | 0;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    const st = game.world.store;
    // ---- 出界防巡游（tile 越界即杀;原版由世界边缘 Kill 兜底）----
    const cxT = Math.floor(this.cx / TILE), cyT = Math.floor(this.cy / TILE);
    if (!st.inBounds(cxT, cyT)) { this.dead = true; return; }
    if (--this.life <= 0) { this.dead = true; return; }
    // ---- 同型互斥推挤（AI_163 :54415-54437）：|dx|+|dy| < w/2 → 按相对方位 ±0.05 ----
    const others = game.projectiles?.() ?? [];
    for (const o of others) {
      const ob = o as unknown as { projId?: number; x?: number; y?: number; dead?: boolean };
      if (!ob || ob === (this as unknown) || ob.dead || ob.projId !== 820) continue;
      const dx = this.x - (ob.x ?? 0), dy = this.y - (ob.y ?? 0);
      if (Math.abs(dx) + Math.abs(dy) >= this.w / 2) continue;
      if (dx < 0) this.vx -= 0.05; else this.vx += 0.05;
      if (dy < 0) this.vy -= 0.05; else this.vy += 0.05;
    }
    // ---- 湿身悬浮 vs 干抛物理（:54439-54502）----
    const liqHere = st.liquid[st.idx(cxT, cyT)] > 0;
    if (liqHere) {
      this.vx *= 0.9;
      if (this.vy > 0) this.vy *= 0.5;
      const wl = getWaterLine(st, cxT, cyT);
      if (wl.found) {
        // num6 = 液面线（AI_061_FishingBobber_GetWaterLine 同源公式）;found=false
        // （深处/超浅）放任下沉——vanilla 直拉收敛（:54478-54494）
        if (this.cy > wl.line) {
          this.vy -= 0.1;
          if (this.vy < -8) this.vy = -8;
          if (this.cy + this.vy < wl.line) this.vy = wl.line - this.cy;
        } else {
          this.vy = wl.line - this.cy;
        }
      }
    } else {
      if (this.vy === 0) this.vx *= 0.95;
      this.vx *= 0.98;
      this.vy += 0.3;
      if (this.vy > 15.9) this.vy = 15.9;
    }
    // ---- 自旋（:54522 rotation += vx*0.14）----
    this.rot += this.vx * 0.14;
    // ---- 入水泡沫最小视觉（gore 1201/1208 未建表——spawnParticles 近似,登记偏差）----
    if (liqHere && Math.random() < 0.05) {
      game.spawnParticles?.(this.x + 6, this.y + this.h,
        'rgba(220,240,255,0.55)', 1, 0.7,
        { life: 20, vx: (Math.random() - 0.5) * 1.4, vy: -Math.random(), damp: 0.96 });
    }
    // ---- chum 注册（AI_163 :54536-54546）----
    // ai[0]<10 && timeLeft>60 门内 AddChumLocation(spot)：spot=Center+UnitY*16。
    // 原版 ai[0] 出生 0 且 AI 内无人递增（NewProjectile default 全零）→ 门恒真,
    // 与 vanilla 同态=timeLeft 降过 60 前（本体后半段缩小窗）每 tick 上报。
    const timeLeftV = this.life;           // 原版 timeLeft（双缓冲读侧拿到的是上帧计数）
    if (timeLeftV > 60) {
      chumReport(this.cx, this.cy + 16, this.x, this.y, this.w, this.h);
    }
    // scale 缩没段仅视觉（lerp(timeLeft,60)）——画侧 s 由 drawScale 承载
    // ---- 位移（tileCollide=true:SetDefaults,通用单盒竖撞收口）----
    const nx = this.cx + this.vx, ny = this.cy + this.vy;
    const tnx = Math.floor(nx / TILE), tny = Math.floor(ny / TILE);
    if (st.inBounds(tnx, tny) && st.isActive(tnx, tny)) {
      // 撞实块停摆贴壁(干态落地待入水;湿态浮水面不会触底)
      if (this.vy > 0) {
        this.y = tny * TILE - this.h / 2 - 0.01;
        this.vy = 0;
      } else {
        this.vx = 0;
        this.vy = 0;
      }
    }
    this.x += this.vx;
    this.y += this.vy;
  }

  get drawScale(): number {
    return Math.max(0, Math.min(1, this.life / 60));
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; atlas?: { vimages: Map<string, ImageBitmap | HTMLImageElement>; ensureVImage?: (f: string) => ImageBitmap | HTMLImageElement | null } | null }): void {
    const ctx = r.ctx;
    if (!ctx || !r.atlas) return;
    const img = r.atlas.ensureVImage ? r.atlas.ensureVImage('vanilla/Projectile_820.png') : r.atlas.vimages.get('vanilla/Projectile_820.png');
    if (!img || !img.width) return;
    const s = Math.max(0.02, this.drawScale);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.drawImage(img, (-this.w / 2) * s, (-this.h / 2) * s, this.w * s, this.h * s);
    ctx.restore();
  }
}
