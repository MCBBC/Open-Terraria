// 星尘标记弹（proj 540 StardustTowerMark，aiStyle 103，Projectile.cs:5873-5879 规格 +
// :32272-32299 AI + Main.cs:32360/:32589-32616 绘制）。调用方：NPC 402 星尘织带蠕虫
// 570t 冲刺点（SpawnStardustMark_StardustWorm，NPC.cs:44230-44314）；星尘塔 493 侧
// （SpawnStardustMark_StardustTower :44142-44228，差异仅根锚点=塔 Top-120 与 402 池
// <2）——2026-08-19 塔侧已从 towerAI 旧「折叠直生」迁到本链（Enemy.towerAI 493 段）。
//
// 规格（SetDefaults :5873-5879）：20×20 / aiStyle 103 / hostile=true 但 NewProjectile
//   damage=0（:44297）——原版伤害结算门 damage>0 不满足，标记弹不伤玩家（本仓同理
//   不判玩家命中）/ penetrate -1 / timeLeft 300（AI 淡出更早杀，此为兜底）/ alpha 255。
// AI（:32272-32299）：scale=ai1；ai0 每 tick 先 +1（初值 = −世代×10 = 出场延迟）：
//   ai0<0 静默等待；0≤ai0<30 淡入 alpha−=25，首破 0 时 NPC.NewNPC(localAI0 类型)@
//   ((int)Center.X, (int)Bottom.Y)（localAI1 门防重复孵化）；ai0≥30 淡出 alpha+=25，
//   ≥250 Kill。弹体恒静止（UpdatePosition :19028 对 540 早退——velocity 只作落点束
//   的方向/长度参数，不作位移）。
// 孵化节律（按初值 ai0=−10D 推演）：世代 D≥1 破零在第 10D+10 tick 孵化、10D+39 tick
//   消亡；世代 0 无负延迟，第 11 tick 孵化、39 tick 消亡。
// 绘制：GetAlpha=(255−α,255−α,255−α,0)（:76248-76251）——A=0 在 XNA AlphaBlend
//   预乘语义下 = 纯加色（见 Renderer.ts:241 头注同解）：lighter 画 Projectile_540.png
//   （72×72 单帧，projFrames 无 540 条目）×scale=ai1 居中（:32360 大表分支）；
//   ai0∈[10,20] 且 v≠0 时 Extra_47（10×72 竖条）落点束（:32589-32616）：脉冲
//   (ai0−10)/10 升 /(20−ai0)/10 降、亮度 ×0.7、旋 v角−π/2、Y 缩 |v|/贴图高、
//   顶中锚 @Center。无光照/无尘（Projectile.cs 无 540 AddLight/NewDust 条目）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { projSprite } from './Arrow';
import { TtlSprite } from '../assets/ttlSprite';
import { spawnVanillaEnemy } from './bossAI';
import { projectileWetSection } from './projWetSection';
import { projectileData } from '../data/vanillaProjectiles';

/** Extra_47 落点束贴图懒加载（Arrow.projSprite 同款模式；不 import Renderer 运行时
 *  以免 Enemy→StardustMarkProj→Renderer→Enemy 运行时环） */
const beamSpriteTtl = new TtlSprite('sprites/vanilla/Extra_47.png');
function beamSprite(): ImageBitmap | HTMLImageElement | null {
  return beamSpriteTtl.get();   // TTL 自愈装载(2026-08-25 同类扫描)
}

export class StardustMarkProj extends Entity {
  w = 20; h = 20;                       // SetDefaults :5874-5875
  /** ai[0]：世代延迟计数（初值 −gen×10；先自增再分支——:32275-32276） */
  private ai0: number;
  /** ai[1]：scale（出生掷 0.5+NextFloat()*0.5——:44297） */
  private readonly ai1: number;
  /** localAI[0]：孵化 NPC 类型（0 = 纯装饰标记——BFS 链仅【最后一只】回填，:44308） */
  hatchType = 0;
  /** localAI[1]：已孵化门（防 alpha 破零段重复孵化） */
  private hatched = false;
  private alpha = 255;
  private timeLeft = 300;                // :5878 兜底（AI 淡出更早杀）

  // ---- ★通用湿段（Projectile.cs:16895-17113 全体弹共用段;2026-09-06 杂项弹簇批）----
  //  豁免核对：540 SetDefaults（P.cs:6153-6161：20×20/aiStyle 103/penetrate −1/
  //  timeLeft 300/alpha 255）【无 ignoreWater 行】= 受段（数据面同向）。
  //  阻尼不适用（双证）：①UpdatePosition 早退表（P.cs:20549-20553 `type == 540` →
  //  position 不积分——velocity 只作落点束方向/长度参数）;②本仓弹体恒静止。
  //  插位=tick 头：弹体恒静止 → 采样位逐拍同点 ≡ 原版任意插位（AI(:32272-32299)
  //  无 position 写）。杀拍口径（Arrow.ts ⑥配方逐位核）：杀位=timeLeft 300 兜底
  //  （fixedUpdate 头杀）与 alpha≥250 淡出杀（:32277-32282,AI 段内）——tick 头单
  //  调用点两者天然覆盖（湿段先于两杀位跑）,双调用点/防双跑机不适用。
  //  IsDestroyedByWater 域不含 540（{85,15,188,34,1097,1106}）→ hooks 不接。
  wet = false;
  lavaWet = false;
  honeyWet = false;
  shimmerWet = false;
  /** 出水溅花冷却窗（Projectile.wetCount :16984 置 10 / :17109-17112 逐拍 −1） */
  wetCount = 0;
  /** 出生预置已做（一次;NewProjectile :10886-10893 等价;共享体首调自做） */
  presetDone = false;
  /** 原版弹型 id（SetDefaults :6153-6161）——湿段按真 id 传参 */
  readonly projId = 540;

  /** x/y = NewProjectile 的 position（左上角原样传入，非中心）；vx/vy = 落点束
   *  方向/长度（不作位移——UpdatePosition :19028 对 540 早退）；gen = 世代 num5 */
  constructor(x: number, y: number, vx: number, vy: number, gen: number) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.ai0 = -gen * 10;                // ai[0] = -num5*10（:44296）
    this.ai1 = 0.5 + Math.random() * 0.5;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    // ---- ★通用湿段（:16895-17113,共享体;溅花尘/音=wetSplashStepShared 弹面 10 粒）----
    //  tick 头插位（杀拍覆盖见字段块头注）;静止弹/UpdatePosition 早退 → 阻尼不适用。
    projectileWetSection(this, game, game.world.store, this.x, this.y, this.w, this.h,
      this.projId, !!projectileData(this.projId)?.ignoreWater);
    if (--this.timeLeft <= 0) { this.dead = true; return; }   // timeLeft 300 兜底
    this.ai0 += 1;                                            // :32275-32276 先自增
    if (this.ai0 >= 30) {                                      // :32277-32282 淡出
      this.alpha += 25;
      if (this.alpha >= 250) { this.dead = true; return; }     // Kill()
    } else {
      if (this.ai0 < 0) return;                                // :32285-32288 负延迟静默
      this.alpha -= 25;                                        // :32289 淡入
      if (this.alpha < 0) {
        this.alpha = 0;
        if (!this.hatched && this.hatchType !== 0) {           // :32291-32297
          this.hatched = true;
          // NPC.NewNPC(source, (int)Center.X, (int)Bottom.Y, (int)localAI[0])——
          // NewNPC 为中心锚语义，fromVanilla/spawnVanillaEnemy 同（e.x=x−w/2）
          // ★NewNPC 是 Bottom 锚（NPC.cs:81547 nPC.Bottom=(X,Y)）——Enemy 构造是中心锚
          //  （x-w/2, y-h/2）→ 须传弹底再回退半身高（2026-08-18 审查：曾差 h/2 半身嵌地）
          const hatched = spawnVanillaEnemy(game, this.hatchType, this.cx, this.y + this.h);
          if (hatched) { hatched.y -= hatched.h / 2; }
        }
      }
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const bright = (255 - this.alpha) / 255;   // GetAlpha 白度（A=0 → lighter 纯加色）
    if (bright <= 0) return;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = bright;
    const img = projSprite(540);
    if (img && img.width > 0) {
      const sz = img.width * this.ai1;         // 72×72 单帧 × scale=ai1（:32364-32367）
      ctx.drawImage(img, cx - sz / 2, cy - sz / 2, sz, sz);
    } else {
      // 贴图未就绪兜底：星尘白星近似（同亮度脉冲）
      ctx.fillStyle = '#E8F0FF';
      ctx.beginPath();
      ctx.arc(cx, cy, 12 * this.ai1 * bright, 0, Math.PI * 2);
      ctx.fill();
    }
    // Extra_47 落点束（Main.cs:32589-32616）：ai0∈[10,20] 三角脉冲、v≠0
    let pulse = 0;
    if (this.ai0 >= 10) pulse = (this.ai0 - 10) / 10;
    if (this.ai0 >= 20) pulse = (20 - this.ai0) / 10;
    pulse = Math.max(0, Math.min(1, pulse));
    if (pulse > 0 && (this.vx !== 0 || this.vy !== 0)) {
      const beam = beamSprite();
      const len = Math.hypot(this.vx, this.vy);
      ctx.globalAlpha = Math.max(0, Math.min(1, bright * pulse * 0.7));
      ctx.translate(cx, cy);
      ctx.rotate(Math.atan2(this.vy, this.vx) - Math.PI / 2);   // :32611 旋 v角−π/2
      if (beam && beam.width > 0) {
        ctx.drawImage(beam, -beam.width / 2, 0, beam.width, len); // 顶中锚 + Y缩=|v|
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, len);
        grad.addColorStop(0, 'rgba(232,240,255,1)');
        grad.addColorStop(1, 'rgba(232,240,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(-2, 0, 4, len);
      }
    }
    ctx.restore();
  }
}

/** SpawnStardustMark（NPC.cs:44142-44314 两变体共用核，1:1）：
 *  孵化池 = {405∪406<2 → 405, 402<(worm 3/tower 2) → 402, 407<1 → 407} 随机选一
 *  （CountNPCS 按活跃同型计数）；空池 → 返回 null（蠕虫版静默 return :44244-44247；
 *  塔版 ai[1]=30 冷却由调用方处理）。随后 BFS 世代展开一串标记弹 540：
 *  根锚（worm=NPC.Center / tower=Top−UnitY*120）起步，每子代沿 (−UnitY) 旋
 *  num10 角掷 num11 距离的向量前进（gen0 近竖直上行 ±π/8、距离 100+100r；
 *  偶代基角 0/奇代 π 再 ±π/8 随机 + dir·π/4 交替翻转——之字游走），深度耗尽的
 *  末梢 v=(0,0)；仅【最后生成的】那只回填 hatchType（localAI[0]=num，:44308）。
 *  @returns 生成的标记弹列表（末位=孵化者）；空池返回 null */
export function spawnStardustMarks(
  game: GameHooks, anchorX: number, anchorY: number, variant: 'worm' | 'tower',
): StardustMarkProj[] | null {
  const em = (game as unknown as {
    entities?: { add?: (e: unknown, b: string) => void };
  }).entities;
  const count = (id: number): number => {
    let n = 0;
    for (const o of game.enemies() as unknown[]) {
      const e = o as { dead?: boolean; vanillaId?: number | null };
      if (!e.dead && e.vanillaId === id) n++;
    }
    return n;
  };
  // 孵化池（:44231-44240；塔版 402 上限 2、蠕虫版 3）
  const pool: number[] = [];
  if (count(405) + count(406) < 2) pool.push(405);
  if (count(402) < (variant === 'worm' ? 3 : 2)) pool.push(402);
  if (count(407) < 1) pool.push(407);
  if (pool.length === 0) return null;
  const hatchType = pool[(Math.random() * pool.length) | 0];   // SelectRandom
  const rootDepth = 3 + ((Math.random() * 3) | 0);             // Next(3,6) ∈ [3,5]
  let branchBudget = (Math.random() * 4) | 0;                  // Next(0,4) ∈ [0,3]
  // BFS 队列（num5=世代 / num6=本层剩余——层尽世代 +1）
  const queue: Array<{ x: number; y: number; depth: number; dir: number }> = [
    { x: anchorX, y: anchorY, depth: rootDepth, dir: 0 },
  ];
  const marks: StardustMarkProj[] = [];
  let gen = 0, rowLeft = queue.length;
  while (queue.length > 0) {
    const node = queue[0];
    let childCount = 1, splitDepth = 1;
    // 分叉掷（:44251-44256）：gen>0 且预算>0 且 (Next(3)≠0 || gen==1)
    if (gen > 0 && branchBudget > 0
      && (((Math.random() * 3) | 0) !== 0 || gen === 1)) {
      splitDepth = (Math.random() * Math.max(1, node.depth)) | 0;  // Next(max(1,depth))
      childCount = 2;
      branchBudget--;
    }
    for (let i = 0; i < childCount; i++) {
      let dir = node.dir;
      if (gen === 0) dir = Math.random() < 0.5 ? -1 : 1;      // SelectRandom(-1,1)
      else if (i === 1) dir *= -1;                            // 次子镜像
      // num10（:44263）：(偶代 0/奇代 π) + (0.5−r)·π/4 + dir·π/4·(偶 +1/奇 −1)
      let ang = (gen % 2 === 0 ? 0 : Math.PI) + (0.5 - Math.random()) * (Math.PI / 4)
        + dir * (Math.PI / 4) * (gen % 2 === 0 ? 1 : -1);
      let dist = 100 + 50 * Math.random();                    // num11
      let childDepth = node.depth;
      if (i !== 0) childDepth = splitDepth;
      if (gen === 0) {                                        // 根代近竖直上行（:44268-44272）
        ang = (0.5 - Math.random()) * (Math.PI / 4);
        dist = 100 + 100 * Math.random();
      }
      // (−UnitY).RotatedBy(ang) = (sin, −cos)（RotatedBy CCW）
      let vx = Math.sin(ang) * dist, vy = -Math.cos(ang) * dist;
      if (childDepth - 1 < 0) { vx = 0; vy = 0; }             // 深度耗尽末梢（:44288-44291）
      const mark = new StardustMarkProj(node.x, node.y, vx, vy, gen);
      em?.add?.(mark, 'projectiles');
      marks.push(mark);
      if (gen < rootDepth && node.depth > 0) {                // :44295-44298
        queue.push({ x: node.x + vx, y: node.y + vy, depth: childDepth - 1, dir });
      }
    }
    queue.shift();
    if (--rowLeft === 0) { rowLeft = queue.length; gen++; }   // :44300-44304 层尽 +1
  }
  // 仅最后一只标记孵化（Main.projectile[num4].localAI[0] = num，:44308）
  if (marks.length > 0) marks[marks.length - 1].hatchType = hatchType;
  return marks;
}
