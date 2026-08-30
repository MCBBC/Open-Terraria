// 水枪/微光枪黏液弹(Projectile 358 / 1042,AI_060 家族与史莱姆枪 406 同构)。
// 锚点：Item.cs case 2272 :22877-22889(shoot 358 speed11) / case 5495 :43314-43329
// (shoot 1042 speed10)；Projectile.cs SetDefaults :4489-4497(358)/:9850-9858(1042)
// ——18×18/aiStyle60/penetrate −1/extraUpdates2/ignoreWater true；
// AI :29430-29700；Kill 尘爆 :75465(358 d211)/:75549(1042 d324)。
//
// 行为逐项（AI_060 :29430-29608）：
//   · scale −0.015/t → ≤0 即 velocity*=5 + oldVelocity=velocity + Kill()（寿命收口）
//   · ai[0]>3 门内做施加扫描——ai[1] 步进率出生掷定(NewProjectile :10921-10926：
//     358=rand(10,31)×0.1 ∈[1.0,3.0] / 1042 同段 default 无专档……实测 1458 未给
//     1042 专案——走 default ai0=ai1=0 ⇒【永不进入扫描门】? 反证：家族 AI 形态一致,
//     施加面以 wiki 行为(微光枪只 NPC 微光化)成立为准,此处按 358 同式给率登记偏差)
//     每 tick 尾 `ai[0]+=ai[1]`：首扫最早第 2-4 拍
//   · NPC 扫描：重叠(active/dontTakeDamage/lifeMax<=1 剔除) → AddBuff + Kill()
//       358 → Wet(103) 1500t=25s   （:29454 num452=103/num453=1500）
//       1042 → Shimmered(353) 100t （:29456-29458，flag25=false 玩家不吃=只 NPC）
//   · 玩家扫描：仅 flag25(103 有)：num455 != owner 的【其它玩家】→ ApplyBuffTo(:29663-
//     :29677)。单人模式恒无目标(排除自己)；本仓 MP 访客经 candidatePlayers 排除本地后
//     施加 Player.buffs.apply(Wet)
//   · 液体触杀（:29584-29602）：弹盒覆盖格任一 liquid>0 且 Bottom 低于该格水面线
//     (y > ty*16 + (256−liquid)/32×2) → Kill()（1042 走 353 同式段——水枪怕水是本体
//     行为的一部分）
//   · 重力：ai[0]>30 后 vy += 0.1/tick（:29605-29607,原版顺序=先判后加）
//   · 尾迹尘：358 = 每 tick 6×d211 α75 scale1.2 沿速度梯度 + 1/4 概率 ×d211 0.65
//     （:29609-29656）；1042 = 同布局 6×d324 四色漂白调色板 + 1/4 ×d324 0.6
//     （:29696-29789）。dust.NewDust α 基值 75 上三掷各 +25 → 不透明度 0.29±~0.10。
//   · Kill 尘爆 = 50 粒家族尘（vel=oldVelocity×0.2 基向量散布,oldV×0.2 老速度语义
//     与 SlimeGlob 同源承自 :75466/:75550）。
// 登记偏差：extraUpdates=2 三子步未展开、单步等速直线（同 SlimeGlob 家族档）；
//   alpha=255 按 SetDefaults 终值不透明绘制(SlimeGlob 同判);d211/d324 无逐色映射,
//   以 rgba 近似(粒子系统无调色板位,SlimeGlob d4 同法)。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { TILE } from '../core/constants';
import { applyBuffTicks } from './projStatus';
import { BuffType } from '../stats/Buffs';

interface GlobSpec {
  buffId: 103 | 353;
  durTicks: number;
  /** buff id（applyBuffTicks 表键） */
  buff: number;
}

const GLOB_SPEC: Record<number, GlobSpec & { trailColors: string[] }> = {
  // 358 水枪：Wet(103) 1500t=25s（AI :29454）；尘族 d211 浅蓝
  358: {
    buffId: 103, buff: 103, durTicks: 1500,
    trailColors: ['rgba(130,185,255,', 'rgba(110,170,240,'],
  },
  // 1042 微光枪：Shimmered(353) 100t≈1.67s(:29456-29458)；尘族 d324 四色调色板
  1042: {
    buffId: 353, buff: 353, durTicks: 100,
    trailColors: ['rgba(255,255,220,', 'rgba(230,255,255,', 'rgba(255,210,255,', 'rgba(225,210,255,'],
  },
};

export class GlobProj extends Entity {
  w = 18; h = 18;
  dead = false;
  readonly projId: number;
  private spec: NonNullable<ReturnType<typeof globSpec>>;
  private scale = 1;
  private ai0 = 0;                       // AI_060 ai[0]
  /** NewProjectile 出生掷定的 ai[1] 步进率 */
  private readonly aiRate: number;
  private readonly oldVx: number;
  private readonly oldVy: number;

  constructor(projId: number, x: number, y: number, vx: number, vy: number) {
    super();
    const spec = globSpec(projId);
    if (!spec) throw new Error(`GlobProj 不支持 projId=${projId}`);
    this.projId = projId;
    this.spec = spec;
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.oldVx = vx; this.oldVy = vy;    // Kill(:75466/:75550 velocity=oldVelocity*0.2)
    this.aiRate = spec.buff === 103 ? 1.0 + Math.random() * 2.0      // Next(10,31)×0.1
      : 1.0 + Math.random() * 1.0;                                   // Next(10,21)×0.1 同式近似
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    const st = game.world.store;
    // 寿命衰减（AI :29431-29437）：scale −0.015/t → ≤0 冲刺 ×5 收口 Kill
    this.scale -= 0.015;
    if (this.scale <= 0) {
      this.killBurst(game);
      this.dead = true;
      return;
    }
    // 施加扫描门（AI :29438 `if (this.ai[0] > 3f)`——出生速率决定首扫拍数）
    if (this.ai0 > 3) {
      let hitNpc = false;
      // NPC 侧（:29444-29461）：active/dontTakeDamage/lifeMax<=1 剔除,重叠即 AddBuff+Kill
      for (const ent of game.enemies()) {
        const e = ent as unknown as {
          x: number; y: number; w: number; h: number; dead?: boolean;
          dontTakeDamage?: boolean; lifeMax?: number;
        };
        if (!e || e.dead || e.dontTakeDamage || (e.lifeMax !== undefined && e.lifeMax <= 1)) continue;
        if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
        applyBuffTicks(e as unknown as { [field: string]: number | undefined },
          this.spec.buff, this.spec.durTicks);
        hitNpc = true;
      }
      if (hitNpc) { this.killBurst(game); this.dead = true; return; }
      // 其它玩家侧（:29664-29678 仅 flag25=true=Wet；num455 != owner 排除射手本身——
      // 单人模式恒空转；MP 下其它代理玩家 buffs.apply(Wet,25s)。AddBuff max 合并语义）
      if (this.spec.buff === 103) {
        const others = (game.candidatePlayers?.() ?? [game.player]).filter((p) => p !== game.player);
        for (const p of others) {
          if ((p as unknown as { dead?: boolean }).dead) continue;
          const pb = p as unknown as { x: number; y: number; w: number; h: number };
          if (!(this.x < pb.x + pb.w && this.x + this.w > pb.x && this.y < pb.y + pb.h && this.y + this.h > pb.y)) continue;
          p.buffs.apply(BuffType.Wet, this.spec.durTicks / 60);
          this.killBurst(game);
          this.dead = true;
          return;
        }
      }
      // 液面触杀（:29584-29601）：弹盒覆盖 tile 列行扫,任一液格水面低于 Bottom 即 Kill
      {
        const txL = Math.floor(this.x / TILE), txR = Math.floor((this.x + this.w) / TILE);
        const tyT = Math.floor(this.y / TILE), tyBot = Math.floor((this.y + this.h) / TILE);
        for (let i = txL; i <= txR; i++) {
          for (let j = tyT; j <= tyBot; j++) {
            if (!st.inBounds(i, j)) continue;
            const liq = st.liquid[st.idx(i, j)];
            if (liq > 0) {
              // num462 = (256−liquid)/32 整除;水面 y = j*16 + num462*2（:29590-29595）
              const surfY = j * TILE + Math.trunc((256 - liq) / 32) * 2;
              if (this.y + this.h > surfY) {
                this.killBurst(game);
                this.dead = true;
                return;
              }
            }
          }
        }
      }
    }
    // 位移（直线,extraUpdates 三子步未展开——文件头偏差登记）
    this.x += this.vx;
    this.y += this.vy;
    // 重力（AI :29605-29607，原版顺序：先判 >30 再累加）
    if (this.ai0 > 30) this.vy += 0.1;
    this.ai0 += this.aiRate;
    if (!st.inBounds(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) { this.dead = true; return; }
    // 尾迹（type==358 支 :29609-29656 / 1042 支 :29696-29789）：6 粒沿速度梯度排布
    // Center−v×k/6，速度 = ((v×0.3)+v×0.5)×0.2 ≈ v×0.16（NewDust 后置覆写链合并）
    const colors = this.spec.trailColors;
    const pick = (): string => colors[(Math.random() * colors.length) | 0];
    // 三掷 +25α 的合并不透明度：0.29 − 掷中次数×0.098（rand<0.5 各一掷）
    let a = 0.29;
    if (Math.random() < 0.5) a -= 0.098;
    if (Math.random() < 0.5) a -= 0.098;
    if (Math.random() < 0.5) a -= 0.098;
    for (let k = 0; k < 6; k++) {
      game.spawnParticles?.(
        this.cx - (this.vx / 6) * k,
        this.cy - (this.vy / 6) * k,
        pick() + a.toFixed(2) + ')', 1, 1.2,
        { life: 16 + (Math.random() * 8 | 0), vx: this.vx * 0.16, vy: this.vy * 0.16, damp: 0.98 });
    }
    // 1/4 小号补粒（:29655-29656 / :29779-29788 同门,scale 0.65）
    if (Math.random() < 0.25) {
      game.spawnParticles?.(this.cx, this.cy, pick() + '0.29)', 1, 0.65,
        { life: 14, vx: this.vx * 0.25, vy: this.vy * 0.25 });
    }
  }

  /** Kill 尘爆（:75465-75504 / :75549-75592）：50 粒家族尘,基向量 oldVelocity×0.2,
   *  vel ±Next(-50,51)×0.015 抖动；50% 缩小档（vanilla 尺寸二选 ↔ noGravity 大粒） */
  private killBurst(game: GameHooks): void {
    const bx = this.oldVx * 0.2, by = this.oldVy * 0.2;
    const colors = this.spec.trailColors;
    const pick = (): string => colors[(Math.random() * colors.length) | 0];
    for (let k = 0; k < 50; k++) {
      game.spawnParticles?.(
        this.cx, this.cy,
        pick() + '0.29)',
        Math.random() < 0.5 ? 1 : 1.2,
        1.2,
        {
          life: 18 + (Math.random() * 12 | 0),
          vx: bx + ((Math.random() * 101 | 0) - 50) * 0.015,
          vy: by + ((Math.random() * 101 | 0) - 50) * 0.015,
          damp: 0.97, grav: 0.06,
        });
    }
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; atlas?: { vimages: Map<string, ImageBitmap | HTMLImageElement>; ensureVImage?: (f: string) => ImageBitmap | HTMLImageElement | null } | null }): void {
    const ctx = r.ctx;
    if (!ctx || !r.atlas) return;
    const key = `vanilla/Projectile_${this.projId}.png`;
    const img = r.atlas.ensureVImage ? r.atlas.ensureVImage(key) : r.atlas.vimages.get(key);
    if (!img || !img.width) return;
    const s = Math.max(0.05, this.scale);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.drawImage(img, (-this.w / 2) * s, (-this.h / 2) * s, this.w * s, this.h * s);
    ctx.restore();
  }
}

function globSpec(id: number): (GlobSpec & { trailColors: string[] }) | undefined {
  return GLOB_SPEC[id];
}
