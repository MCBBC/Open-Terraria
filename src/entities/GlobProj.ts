// 水枪/微光枪黏液弹(Projectile 358 / 1042,AI_060 家族与史莱姆枪 406 同构)。
// 锚点：Item.cs case 2272 :22877-22889(shoot 358 speed11) / case 5495 :43314-43329
// (shoot 1042 speed10)；Projectile.cs SetDefaults :4489-4497(358)/:9850-9858(1042)
// ——18×18/aiStyle60/penetrate −1/extraUpdates2/ignoreWater true；
// AI :29430-29700；Kill 尘爆 :75465(358 d211)/:75549(1042 d324)。
//
// 行为逐项（AI_060 :29430-29608）：
//   · scale −0.015/t → ≤0 即 velocity*=5 + oldVelocity=velocity + Kill()（寿命收口）
//   · ai[0]>3 门内做施加扫描——ai[1] 步进率出生定(NewProjectile 特案表 :10908-10926
//     仅覆盖 206/335/358/406,其余型走 default 吃调用方显式参) 每 tick 尾
//     `ai[0]+=ai[1]`：
//       358 = 特案 rand(10,31)×0.1 ∈[1.0,3.0]（水枪 2272 无发射专案可依）
//       1042 = 恒 1.0（微光枪 5495 发射专案 Player.cs 1458 :49635-49641 显式传
//             ai0=0f/ai1=1f；1457 :49637 / 1456 :48509 同款,非 1458 新增）
//       ⇒ 首扫 358 第 2-4 拍 / 1042 恰第 5 拍
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
//     （:29609-29655）；1042 = 同布局 6×d324 四色调色板（switch(Main.rand.Next(6))
//     非均匀抽,:29740-29754）+ 1/4 概率 ×d324 0.6 同式抽（:29758-29779）。dust.NewDust
//     α 基值 75 上三掷各 +25 → 不透明度 0.29±~0.10。
//   · Kill 尘爆 = 50 粒家族尘（vel=oldVelocity×0.2 基向量散布,oldV×0.2 老速度语义
//     与 SlimeGlob 同源承自 :75466/:75550）。
// 登记偏差：extraUpdates=2 三子步未展开、单步等速直线（同 SlimeGlob 家族档）；
//   alpha=255 按 SetDefaults 终值不透明绘制(SlimeGlob 同判);d211 无逐色映射以 rgba
//   近似;d324 色相按原版调色板映射（权重 [1,1,1,3],pickGlobDustColor）但无调色板位,
//   rgba 直出(SlimeGlob d4 同法)。
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

/** 原版色抽权重表（缺省 = 调用侧均匀抽取）；d324 权重见 pickGlobDustColor 头注 */
const GLOB_SPEC: Record<number, GlobSpec & { trailColors: string[]; trailWeights?: number[] }> = {
  // 358 水枪：Wet(103) 1500t=25s（AI :29454）；尘族 d211 浅蓝
  358: {
    buffId: 103, buff: 103, durTicks: 1500,
    trailColors: ['rgba(130,185,255,', 'rgba(110,170,240,'],
  },
  // 1042 微光枪：Shimmered(353) 100t≈1.67s(:29456-29458)；尘族 d324 四色调色板——
  // ★A-d324 复核：原版 switch(Main.rand.Next(6)) 非均匀抽(曾误写均匀 4 选 1),
  // default 主色占一半——权重 [1,1,1,3]
  1042: {
    buffId: 353, buff: 353, durTicks: 100,
    trailColors: ['rgba(255,255,220,', 'rgba(230,255,255,', 'rgba(255,210,255,', 'rgba(225,210,255,'],
    trailWeights: [1, 1, 1, 3],              // case0/1/2 各 1 档,default 三档(:75599)
  },
};

/**
 * 家族尾迹/Kill 尘调色板抽（rand 可注入供金标测试定掷复现）。
 * ★A-d324 复核定罪（d324 蓝白漂白族）：原版三处同式 switch(Main.rand.Next(6))——
 * 尾迹逐粒 :29740-29754、1/4 补粒 :29764-29778、Kill 尘爆 :75587-75601；
 * case0=(255,255,220)/case1=(230,255,255)/case2=(255,210,255) 各 1 档(16.7%),
 * default=(225,210,255) 占 3 档(50%)——红队备选色 (140,140,225)/(80,80,255)/
 * (175,175,255) 经查 Projectile.cs 全文不存在,四色实值即上表。无专档族
 * (358 的 d211 近似色对,原版无色抽开关)保持均匀抽取。
 */
export function pickGlobDustColor(
  colors: readonly string[],
  weights: readonly number[] | undefined,
  rand: () => number = Math.random,
): string {
  if (!weights || weights.length !== colors.length || weights.length === 0) {
    return colors[(rand() * colors.length) | 0];
  }
  let total = 0;
  for (const w of weights) total += w;
  const roll = rand() * total;
  let acc = 0;
  for (let i = 0; i < colors.length; i++) {
    acc += weights[i];
    if (roll < acc) return colors[i];
  }
  return colors[colors.length - 1];          // roll==total 浮点护栏（恒 unreachable）
}

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

  constructor(projId: number, x: number, y: number, vx: number, vy: number, aiRate?: number) {
    super();
    const spec = globSpec(projId);
    if (!spec) throw new Error(`GlobProj 不支持 projId=${projId}`);
    this.projId = projId;
    this.spec = spec;
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.oldVx = vx; this.oldVy = vy;    // Kill(:75466/:75550 velocity=oldVelocity*0.2)
    // ai[1] 步进率——NewProjectile 出生面（Owner==myPlayer 特案表 Projectile.cs
    // 1458 :10910-10926）：仅 206/335/358/406 被覆写,其余型 default 吃调用方参。
    //   显式入参 = 发射链逐条对应（fireGlobGun 对 5495 传 1f,同 Player.cs 专案）；
    //   缺省兜底按类型终态：358=特案 Next(10,31)×0.1；1042 无专案=恒 1.0。
    //   曾按 406 同式给 1042 近似 rand∈[1,2]——施门提前 1-2 拍+节奏偏移,红队 A-3 已纠。
    this.aiRate = aiRate ?? (projId === 358 ? 1.0 + Math.random() * 2.0    // Next(10,31)×0.1
      : 1.0);                                                              // 1042=default 参 1f
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
    // 尾迹（type==358 支 :29609-29655 / 1042 支 :29706-29780）：6 粒沿速度梯度排布
    // Center−v×k/6，速度 = ((v×0.3)+v×0.5)×0.2 ≈ v×0.16（NewDust 后置覆写链合并）
    const pick = (): string => pickGlobDustColor(this.spec.trailColors, this.spec.trailWeights);
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

  /** Kill 尘爆（:75465-75504 / :75548-75603）：50 粒家族尘,基向量 oldVelocity×0.2,
   *  vel ±Next(-50,51)×0.015 抖动；50% 缩小档（vanilla 尺寸二选 ↔ noGravity 大粒）；
   *  d324 色抽同尾迹式 Next(6) 权重(:75587-75601) */
  private killBurst(game: GameHooks): void {
    const bx = this.oldVx * 0.2, by = this.oldVy * 0.2;
    const pick = (): string => pickGlobDustColor(this.spec.trailColors, this.spec.trailWeights);
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
    // 懒加载通道(lazyload-guards):ensureVImage miss 返 null→本帧早退,下帧自愈;禁直取贴图表
    const img = r.atlas.ensureVImage?.(key) ?? null;
    if (!img || !img.width) return;
    const s = Math.max(0.05, this.scale);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.drawImage(img, (-this.w / 2) * s, (-this.h / 2) * s, this.w * s, this.h * s);
    ctx.restore();
  }
}

function globSpec(id: number): (GlobSpec & { trailColors: string[]; trailWeights?: number[] }) | undefined {
  return GLOB_SPEC[id];
}
