// 钩爪弹体——Terraria1456 Projectile.AI_007_GrapplingHooks（Projectile.cs:49647-49980）1:1。
//
// 三态 ai[0]（= 本类 ai0）：
//   0 飞行  : 速度恒定直线（AI_007 不改速度，仅超程门）→ 超 range 转 1（:49706-49747）
//   1 回收  : 速度 = 朝玩家方向 × retractSpeed（:49894-49927），贴身 <24px 死（:49888）
//   2 锚定  : 每帧校验锚格仍可挂（:49944-49960），否则回 1；每帧向玩家锚点表重登记
//
// 挂墙扫描（:49777-49800）：锚盒 = 中心 ±5px 的 10×10 盒与 tile AABB 相交；
// 列优先（i 外层 x、j 内层 y）保证首个命中格与原版一致。
// CanTileBeLatchedOnTo（:49961-49977）：nactive && (tileSolid | 轨道314)，
// 403 只挂轨道，865 额外放行树干族/323。
//
// 等价边界（与原版差异，见 tests/grapple.test.ts 头注）：
//  · 挂墙当帧不计牵引（本仓玩家先于弹桶积分——锚点表下一 tick 才被消费，16.7ms）
//  · 链/钩头渲染已 1:1 分节贴图（src/data/grappleChains.ts，ChainID 表）；贴图未就绪
//    或缺失时回退旧线段+方块渲染（下帧自愈，全表贴图已解包=恒不触发）
//  · 935 皇后钩瞬移走 moveAndCollide 逐步步进（原版 TileCollision 150 步 ×12px 同构）
//
// ★通用湿段接入（2026-09-06 溅花缺口杂项批）：钩爪全族（13/32/73/74/165/230-235/
// 256/315/322/331/332/372/396/403/446/486-489/646-649/652/753/865/935）SetDefaults
// 逐 id 核验【均无 ignoreWater 行】（13 :942-951、74 :1539-1549、165 :2541-2550、
// 256 :3391-3402、315 :4080-4089、322 :4152-4161、331 :4238-4247、332 :4249-4259、
// 372 :4555-4564、396 :4772-4782、403 :4839-4848、446 :5179-5189、652 :7004-7013、
// 753 :7759-7768、865 :8304-8313、935 :8887-8897;73/230-235/486-489/646-649 走
// OR-链/共档亦无）→ 全员受段。钩爪入水溅花 = 原版真行为（通用湿段 :16903 对所有
// 非 ignoreWater 弹逐 Update 维护）。AI_007 全段无 wet 消费（:53483-54250 grep 实证）
// → 溅花+旗维护即全部效果。★阻尼 N/A 定谳：钩爪 tileCollide=false（各 SetDefaults
// 显式 false）⇒ wetVelocity 恒=velocity（:16870 初始化,阻尼算式只存在于
// HandleMovement 的 tileCollide 支 :17583/:17721-17764）→ 位移不折减。
// 位序：本仓 substep 头调用 = 原文「上子步 UpdatePosition 后位 → 湿段(:16903) →
// 本子步 AI(:16880)/UpdatePosition(:19973)」——采样位逐子步与原文全等（首子步=
// 出生位=NewProjectile :10886-10892 预置位）。登记有界偏差：doLatch 直写吸附位,
// 锚定子步的湿段采样位较原文晚一子步（原文 AI 写位后即采样）;AI 杀拍（超程/回收
// 贴身）不跑湿段=仓内湿段批统一口径。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { BuffType } from '../stats/Buffs';
import { TILE } from '../core/constants';
import { projectileWetSection } from './projWetSection';
import {
  HOOK_KILL_DISTANCE, HOOK_RETRACT_KILL_DIST, HOOK_TIME_LEFT, CRACKED_BRICK_SHEETS,
  TREE_TRUNK_SHEETS, TRACK_SHEET, TREE_SHEET, HOOK_PROJ_STATS, isHookProjectile,
} from '../data/grappleHooks';
import type { HookProjStats } from '../data/grappleHooks';
import { TILE_DEFS } from '../data/tiles';
import { projectileData } from '../data/vanillaProjectiles';
import {
  hookChainOf, hookHeadOf, SKELETRON_HAND_ROT,
} from '../data/grappleChains';
import type { HookChainSpec } from '../data/grappleChains';

/** ai[0] 三态（AI_007 各分支） */
export const GRAPPLE_FLY = 0;    // :49705 分支
export const GRAPPLE_RETRACT = 1; // :49881 分支
export const GRAPPLE_LATCH = 2;   // :49942 分支

/** 锚格视觉盒（WorldGen.GetTileVisualHitbox，WorldGen.cs:66633-66653）：
 *  323 树木 X += frameY；半砖 Y += 8 且高 8 → 返回锚点中心 */
function tileVisualCenter(st: { half: Uint8Array; frameY: Uint16Array; idx(x: number, y: number): number },
  x: number, y: number, sheet: number): { x: number; y: number } {
  let cx = x * TILE + TILE / 2;
  let cy = y * TILE + TILE / 2;
  const i = st.idx(x, y);
  if (sheet === TREE_SHEET) cx += st.frameY[i];          // :66643-66645
  if (st.half[i]) cy += TILE / 2;                        // :66647-66650（下半 8px 中心）
  return { x: cx, y: cy };
}

/** CanTileBeLatchedOnTo（Projectile.cs:49961-49977）。
 *  Main.tileSolid 在本仓数据模型的映射 = TILE_DEFS.solid ∪ TILE_DEFS.platform
 *  （原版平台 19 同时在 tileSolid/tileSolidTop，Main.cs:7841-7842——钩爪可挂平台） */
export function canTileBeLatchedOnTo(
  st: { isActive(x: number, y: number): boolean; get(x: number, y: number): number },
  x: number, y: number, projType: number,
): boolean {
  if (!st.isActive(x, y)) return false;                  // :49963-49965 !nactive → false
  const def = TILE_DEFS[st.get(x, y)];
  const sheet = def?.vanilla?.sheet ?? -1;
  if (projType === 403 && sheet !== TRACK_SHEET) return false; // :49966-49968
  return def?.solid === true || def?.platform === true    // Main.tileSolid
    || sheet === TRACK_SHEET                               // :49969 `theTile.type == 314`
    || (projType === 865 && TREE_TRUNK_SHEETS.has(sheet))  // :49970 IsATreeTrunk（TileID.cs:161）
    || (projType === 865 && sheet === TREE_SHEET);         // :49971 `type == 323`
}

export class GrappleProj extends Entity {
  /** 弹体型号（ProjectileID：13 普通 / 230 宝石 / 646 月亮 / 652 静态 / 865 松鼠…） */
  readonly projType: number;
  /** 玩法数值（HOOK_PROJ_STATS） */
  readonly stats: HookProjStats;
  /** ai[0] 三态 */
  ai0 = GRAPPLE_FLY;
  /** timeLeft（SetDefaults `timeLeft *= 10` = 36000；Projectile.cs:527） */
  timeLeft = HOOK_TIME_LEFT;
  /** 弹体宽高（Projectile.cs SetDefaults，vanilla-projectiles.json 全量提取） */
  projW = 18;
  projH = 18;
  /** 朝玩家方向角（AI_007 :49658 `rotation = atan2(num2, num) - 1.57f`）——渲染/松鼠钩力 */
  rot = 0;
  /** 锚定格（挂墙后写入；回收前保留） */
  latchX = -1;
  latchY = -1;
  /** 446 反重力钩 localAI[0]（0..27 循环，Projectile.cs:49686-49696）——链贴图
   *  帧行 = ⌊lai0/7⌋ ∈ 0..3（Main.cs:28895-28900），纯视觉 */
  lai0 = 0;
  // ---- ★通用湿段旗（ProjWetFlags 同形;projectileWetSection 共享体逐值维护）----
  wet = false;
  lavaWet = false;
  honeyWet = false;
  shimmerWet = false;
  /** 出水溅花冷却窗（Projectile.wetCount :16984 置 10 / :17109-17112 逐子步折减） */
  wetCount = 0;
  /** 出生预置已做（NewProjectile :10886-10892 等价;共享体首调自做） */
  presetDone = false;
  /** 652 静态钩钩头帧（6 帧循环，Projectile.cs:49697-49704；projFrames=6 Main.cs:8450）——纯视觉 */
  headFrame = 0;
  /** 652 帧计数器（++frameCounter >= 7 推帧） */
  private frameCounter = 0;
  /** 本帧是否处于锚定态的锚点登记源（GetGrapplingForces 只取 ai0==2） */
  get latched(): boolean { return this.ai0 === GRAPPLE_LATCH; }

  constructor(x: number, y: number, vx: number, vy: number, projType: number,
    private playerRef: () => Player | null) {
    super();
    this.projType = projType;
    if (!isHookProjectile(projType)) throw new Error(`GrappleProj: ${projType} 非 aiStyle7 钩爪`);
    this.stats = HOOK_PROJ_STATS[projType];
    const pd = projectileData(projType);
    this.projW = pd?.width ?? 18;
    this.projH = pd?.height ?? 18;
    this.w = this.projW;
    this.h = this.projH;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
  }

  /** 所属玩家（AI_007 全程经 Main.player[owner] 访问） */
  owner(): Player | null { return this.playerRef(); }

  fixedUpdate(_dt: number, game: GameHooks): void {
    // sub-step = 1 + extraUpdates（Projectile.extraUpdates；256=1、935=3）
    for (let step = 0; step <= this.stats.extraUpdates; step++) {
      // ---- ★通用湿段（:16903-17113,共享体;溅花尘/音=wetSplashStepShared 弹面 10 粒）----
      // 子步头位采样 = 上子步 UpdatePosition 结算位（首子步=出生位=预置位）——
      // 逐 id 豁免面/阻尼 N/A 见头注;AI_007 无湿旗消费者 → 段调用不拆 AI
      projectileWetSection(this, game, game.world.store, this.x, this.y, this.projW, this.projH,
        this.projType, !!projectileData(this.projType)?.ignoreWater);
      this.aiStep(game);
      if (this.dead) return;
    }
    // timeLeft 递减（Projectile.Update :23193 timeLeft--；归零 Kill）
    if (--this.timeLeft <= 0) this.kill();
  }

  private aiStep(game: GameHooks): void {
    const p = this.playerRef();
    // :49649-49657 玩家 dead/stoned/webbed/frozen → Kill。
    // 等价边界：本仓 Buff 系无 Stoned(156)/Webbed(149)——该两门恒 false（原版无此 buff 时同）
    if (!p || p.dead || p.buffs.has(BuffType.Frozen) || p.buffs.has(BuffType.Stoned)) { this.kill(); return; }
    const mountedCx = p.cx;
    const mountedCy = p.cy;                              // MountedCenter（:49659）
    const dx = mountedCx - this.cx;
    const dy = mountedCy - this.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    this.rot = Math.atan2(dy, dx) - Math.PI / 2;         // :49658
    if (this.ai0 === GRAPPLE_LATCH && this.projType === 865) {
      // :49660-49665 松鼠钩：rotation 吸附到 90° 倍数
      const q = Math.PI / 2;
      this.rot = Math.round(this.rot / q) * q;
    }
    // :49666-49683 裂砖刮擦：本体中心格为裂砖族 → 1/16 击碎（Main.rand.Next(16)==0）
    {
      const cti = Math.floor(this.cx / TILE);
      const ctj = Math.floor(this.cy / TILE);
      const st0 = game.world.store;
      if (st0.inBounds(cti, ctj) && st0.isActive(cti, ctj)
        && CRACKED_BRICK_SHEETS.has(TILE_DEFS[st0.get(cti, ctj)]?.vanilla?.sheet ?? -1)
        && Math.floor(Math.random() * 16) === 0) {
        game.breakTile?.(cti, ctj);                      // WorldGen.KillTile
      }
    }
    // :49668-49671 距玩家超 2500 → Kill
    if (dist > HOOK_KILL_DISTANCE) { this.kill(); return; }
    // :49681-49684 256 骷髅王之手：rotation 覆写 = atan2 + 3.9250002（钩头绘制用；
    //  通用 atan2−1.57 在 :49658 已赋）——纯视觉，GetGrapplingForces 仅 865 消费 rotation
    if (this.projType === 256) this.rot = Math.atan2(dy, dx) + SKELETRON_HAND_ROT;
    // :49685-49696 446 反重力钩：localAI[0] 每 tick +1、≥28 归 0（链帧行驱动）——纯视觉。
    //  同段 AddLight(mountedCenter,(0,0.4,0.3))+PlotTileLine 沿线发光 → 下方
    //  lineLight 段（AI 期，与原版同段同拍）
    if (this.projType === 446) { this.lai0 += 1; if (this.lai0 >= 28) this.lai0 = 0; }
    // :49697-49704 652 静态钩：++frameCounter ≥7 → 推帧（6 帧循环）——纯视觉
    if (this.projType === 652 && ++this.frameCounter >= 7) {
      this.frameCounter = 0;
      this.headFrame += 1;
      if (this.headFrame >= 6) this.headFrame = 0;
    }
    // :49687-49694（446）/ :49708-49727（646-649）沿线发光——原版 AI 期 AddLight
    // （状态机分派前）。本仓 AI 期经 GameHooks.addLightAt 注册：fixedUpdate 内
    // 登记 → 本 tick 尾 LightingEngine.compute 的 dirty 快进（LightingEngine.ts
    // compute/runFullCycle）同帧消费呈现——与原版"AI 期注册 → 渲染期 LightTiles
    // 快进消费"同为当帧可见。曾移至 draw() 期注册 = 经下一 tick compute 恒 1 tick
    // 延迟（2026-08-21 复审③回迁）。★332/488 段光原版即 draw 期发射
    // （Main.cs:28796-28816/:28970），仍留 drawChain——见该处注释。
    const lineLight = hookChainOf(this.projType)?.lineLight;
    if (lineLight) this.emitLineLight(game, p, lineLight);

    if (this.ai0 === GRAPPLE_FLY) {
      this.stepFly(game, dist);
    } else if (this.ai0 === GRAPPLE_RETRACT) {
      this.stepRetract(dist, dx, dy);
    } else {
      this.stepLatched(game);
    }
  }

  /** ai[0]==0 飞行段（:49705-49879）。时序对齐原版：Projectile.Update 先积分位置
   *  （tileCollide=false 无碰撞），AI_007 再做超程门 + 锚盒扫描 → 本法先移后判 */
  private stepFly(game: GameHooks, dist: number): void {
    const st = game.world.store;
    // 位移积分（Projectile.Update 位置推进；AI_007 不改速度 → 直线匀速）
    this.x += this.vx;
    this.y += this.vy;
    // 超程门（:49706-49747）：range 为 null（403）则永不因射程回收
    const range = this.stats.range;
    if (range != null && dist > range) {
      this.ai0 = GRAPPLE_RETRACT;                        // :49733 ai[0] = 1f
      return;
    }
    // 锚盒扫描区（:49772-49773）：cx±5-16 .. cx±5+32 取整
    const v3x = this.cx - 5, v3y = this.cy - 5;
    const x0 = Math.max(0, Math.floor((v3x - 16) / TILE));
    const x1 = Math.min(st.w, Math.floor((this.cx + 5 + 32) / TILE));
    const y0 = Math.max(0, Math.floor((v3y - 16) / TILE));
    const y1 = Math.min(st.h, Math.floor((this.cy + 5 + 32) / TILE));
    for (let i = x0; i < x1; i++) {                      // :49787 i 外层（列优先）
      for (let j = y0; j < y1; j++) {                    // :49788 j 内层
        // :49794-49796 相交测试：cx+5 > i*16 && cx-5 < i*16+16 && cy+5 > j*16 && cy-5 < j*16+16
        if (!(v3x + 10 > i * TILE) || !(v3x < i * TILE + TILE)
          || !(v3y + 10 > j * TILE) || !(v3y < j * TILE + TILE)) continue;
        if (!canTileBeLatchedOnTo(st, i, j, this.projType)) continue;      // :49792
        if (this.playerRef()?.isBlacklistedForGrappling(i, j)) continue;   // :49792
        this.doLatch(game, i, j);
        return;                                          // :49868 break 双层
      }
    }
  }

  /** 挂墙结算（:49798-49866） */
  private doLatch(game: GameHooks, i: number, j: number): void {
    const p = this.playerRef()!;
    // :49797-49801 登记（grapCount < 10 上限）
    p.registerGrapple(this);
    // :49803-49836 同主人并存锚数门（num17）：超限杀最旧（timeLeft 最小 :49842-49850）。
    // num14 统计 = 同主人全部 aiStyle7 且 ai[0]==2 的锚 + 自身（:49837-49841）
    let count = 0;
    let oldest: GrappleProj | null = null;
    for (const g of p.grappleProjs) {
      if (g === this || g.ai0 === GRAPPLE_LATCH) {
        count++;
        if (!oldest || g.timeLeft < oldest.timeLeft) oldest = g;
      }
    }
    if (count > this.stats.maxLatched && oldest) oldest.kill();   // :49852-49854
    // :49856-49862 音效 + 速度清零 + 态翻转 + 吸附到格中心
    game.playSfx('dig', 1, i * TILE, j * TILE);         // SoundEngine.PlaySound(0, …)
    this.vx = 0;
    this.vy = 0;
    this.ai0 = GRAPPLE_LATCH;
    this.latchX = i;
    this.latchY = j;
    this.x = i * TILE + TILE / 2 - this.projW / 2;        // :49859-49860
    this.y = j * TILE + TILE / 2 - this.projH / 2;
    // :49861-49864 视觉盒（半砖/树木偏移）→ Center = 视觉盒中心
    const st = game.world.store;
    const vc = tileVisualCenter(st, i, j, TILE_DEFS[st.get(i, j)]?.vanilla?.sheet ?? -1);
    this.x = vc.x - this.projW / 2;
    this.y = vc.y - this.projH / 2;
    // :49865 damage = 0（钩爪不伤怪）+ netUpdate；挂墙粒子近似
    game.spawnParticles?.(i * TILE + 8, j * TILE + 8, '#B0A890', 4, 1.2, { life: 18, grav: 0.06 });
    // :49870-49874 黑名单刷新（Player.UpdateBlacklistedTilesForGrappling）
    p.updateBlacklistedTilesForGrappling(game.world.store);
    // :49876-49879 皇后钩 935：挂墙瞬移（Player.DoQueenSlimeHookTeleport :22488-22505）
    if (this.projType === 935) p.doQueenSlimeHookTeleport(this.cx, this.cy, game);
  }

  /** ai[0]==1 回收段（:49881-49930） */
  private stepRetract(dist: number, dx: number, dy: number): void {
    const speed = this.stats.retract;                    // num18（:49894-49927）
    if (dist < HOOK_RETRACT_KILL_DIST) { this.kill(); return; }   // :49888-49890
    const k = dist > 0 ? speed / dist : 0;               // :49892 num3 = num18 / num3
    this.vx = dx * k;                                    // :49893-49894
    this.vy = dy * k;
    this.x += this.vx;
    this.y += this.vy;
  }

  /** ai[0]==2 锚定段（:49942-49959） */
  private stepLatched(game: GameHooks): void {
    const st = game.world.store;
    const cti = Math.floor(this.cx / TILE);              // :49944 Center.ToTileCoordinates
    const ctj = Math.floor(this.cy / TILE);
    if (!canTileBeLatchedOnTo(st, cti, ctj, this.projType)) {
      this.ai0 = GRAPPLE_RETRACT;                        // :49949-49850 锚格失效 → 回收
      return;
    }
    // :49954-49957 每帧重登记（玩家锚点表每 tick 重建——Player.cs:27991-27992 清表）
    this.playerRef()?.registerGrapple(this);
  }

  /** Kill 语义（Projectile.Kill + RemoveAllGrapplingHooks 对 aiStyle7 的清除链） */
  kill(): void {
    if (this.dead) return;
    this.dead = true;
    this.vx = 0;
    this.vy = 0;
    this.playerRef()?.unregisterGrapple(this);
  }

  // ---- 渲染（Main.cs DrawProjDirect 链段 if-else 链 :28188-29206 + 通用钩头绘制 1:1）----
  draw(r: GrappleDrawHost, _cam: unknown): void {
    const p = this.playerRef();
    if (!p) return;
    const ctx = r.ctx;
    const spec = hookChainOf(this.projType);
    const atlas = r.atlas ?? null;
    // 链贴图（ensureVImage 懒加载：未就绪返回 null → 本帧走旧线段兜底，下帧自愈）
    const img = spec && atlas ? asImg(atlas.ensureVImage(`vanilla/${spec.tex}`)) : null;
    const glow = spec?.glowTex && atlas ? asImg(atlas.ensureVImage(`vanilla/${spec.glowTex}`)) : null;
    const head = atlas ? asImg(atlas.ensureVImage(`vanilla/Projectile_${this.projType}.png`)) : null;
    if (spec && img) this.drawChain(r, p, spec, img, glow);
    else this.drawLegacyChain(ctx, p);                       // 兜底（全表贴图已解包，恒不触发）
    if (head) this.drawHead(ctx, head);
    else this.drawLegacyHead(ctx);                            // 兜底
  }

  /** 分节链拼装（各分支几何统一参数化，见 src/data/grappleChains.ts 逐型号行号） */
  private drawChain(r: GrappleDrawHost, p: Player, spec: HookChainSpec,
    img: Img2D, glow: Img2D | null): void {
    const ctx = r.ctx;
    const mcx = p.cx, mcy = p.cy;                    // MountedCenter（:49659 同源）
    let px = this.cx, py = this.cy;                  // vectorN = 弹体中心（各分支同）
    let dx = mcx - px, dy = mcy - py;
    const texW = img.width, texH = img.height;
    const frameH = spec.frameRows ? (spec.frameH ?? texH / 4) : 0;
    const stepPx = spec.step ?? (spec.frameRows ? frameH : texH); // num112 = 贴图高
    const stopDist = spec.stop ?? stepPx + 1;        // 大分支 :28932 `< num112 + 1f`
    // 旋转 = 初始链向 atan2 − 1.57（各分支循环外一次；256 另 −0.785）。
    // 32 型取偏移前方向（:28196 早于 :28203 反退）；大分支 hookBack 族取偏移后
    // 方向（:28915 rotation16 在 num113 偏移块之后）
    const preRot = Math.atan2(dy, dx) - Math.PI / 2 + (spec.rotOff ?? 0);
    if (spec.backOff != null) {                      // 32 型起点反退 8（:28198-28208）
      if (dx === 0 && dy === 0) return;              // :28202-28204 零向量不铺链
      const k = spec.backOff / Math.hypot(dx, dy);
      px -= dx * k; py -= dy * k;
      dx = mcx - px; dy = mcy - py;
    }
    if (spec.hookBack != null) {                     // 大分支锚端偏移 num113（:28890-28900）
      const a = this.rot - Math.PI / 2;              // vector19 = (cos(rot−1.57), sin(rot−1.57))
      px -= Math.cos(a) * spec.hookBack;
      py -= Math.sin(a) * spec.hookBack;
      const ux = mcx - px, uy = mcy - py;
      const ul = Math.hypot(ux, uy) || 1;
      px -= (ux / ul) * stepPx / 2;                  // center -= 归一化链向 × num112/2
      py -= (uy / ul) * stepPx / 2;
      dx = mcx - px; dy = mcy - py;
    }
    const rot = spec.backOff != null ? preRot
      : Math.atan2(dy, dx) - Math.PI / 2 + (spec.rotOff ?? 0);
    const fo: [number, number] = spec.frameOrigin ?? [texW / 2, texH / 8]; // 帧行 origin
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (spec.alphaFactor != null) ctx.globalAlpha = spec.alphaFactor; // 396 ×155/255
    let ci = 0;
    for (;;) {
      const dist = Math.hypot(dx, dy);
      if (!Number.isFinite(dist) || dist < stopDist) break;   // NaN 门 + 残距停铺
      if (spec.segLightCycle) {          // 332：推进前取格、四色循环（:28796-28814）
        // ★原版即 draw 期发射（Main.cs:28796-28816 DrawProjDirect 链铺循环内）——
        //  非 AI 期；本仓 draw 期注册 → 下一 tick compute 的 dirty 快进消费
        //  （恒 1 tick 相位差,原版 draw 期光同样要等下一轮 LightTiles 扫描态）
        const c = spec.segLightCycle[ci % 4];
        r.lighting?.addLight(Math.floor(px / TILE), Math.floor(py / TILE), c[0], c[1], c[2]);
      }
      const k = stepPx / dist;
      px += dx * k; py += dy * k;                   // 推进一节
      dx = mcx - px; dy = mcy - py;
      const skip = spec.skipFirst === true && ci === 0;       // 865/935 首节不绘制
      if (!skip) {
        const row = spec.frameRows === 'seg' ? ci % 4
          : spec.frameRows === 'tick7' ? Math.floor(this.lai0 / 7) : -1;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        if (row >= 0) {
          ctx.drawImage(img, 0, row * frameH, texW, frameH, -fo[0], -fo[1], texW, frameH);
          if (glow) {
            ctx.globalAlpha = 127 / 255;
            ctx.drawImage(glow, 0, row * frameH, texW, frameH, -fo[0], -fo[1], texW, frameH);
            ctx.globalAlpha = spec.alphaFactor ?? 1;
          }
        } else {
          ctx.drawImage(img, -texW / 2, -texH / 2);           // origin = 贴图中心
          if (glow) {                                         // 646-649 发光层（α=127/255）
            ctx.globalAlpha = 127 / 255;
            ctx.drawImage(glow, -glow.width / 2, -glow.height / 2);
            ctx.globalAlpha = spec.alphaFactor ?? 1;
          }
        }
        ctx.restore();
      }
      if (spec.segLight) {               // 488：推进后取格（:28971 AddLight(center)）
        // ★原版即 draw 期发射（Main.cs:28970 DrawProjDirect type==488 段）——同 332
        const c = spec.segLight;
        r.lighting?.addLight(Math.floor(px / TILE), Math.floor(py / TILE), c[0], c[1], c[2]);
      }
      ci++;
    }
    ctx.restore();
  }

  /** 钩头本体（通用绘制公式 Main.cs:29886 同构：pivot = (盒左+贴图宽/2+n144,
   *  盒上+盒高/2)、origin = (贴图宽/2, 盒高/2+n143)、rotation = AI_007 的
   *  proj.rotation、无翻转（AI_007 不改 spriteDirection）） */
  private drawHead(ctx: CanvasRenderingContext2D, head: Img2D): void {
    const hs = hookHeadOf(this.projType);
    const frames = hs.frames ?? 1;
    const rowH = Math.floor(head.height / frames);
    const row = frames > 1 ? this.headFrame : 0;
    const n143 = hs.n143 ?? 0, n144 = hs.n144 ?? 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(this.x + head.width / 2 + n144, this.y + this.projH / 2);
    ctx.rotate(this.rot);
    ctx.drawImage(head, 0, row * rowH, head.width, rowH,
      -head.width / 2, -(this.projH / 2 + n143), head.width, rowH);
    ctx.restore();
  }

  /** 446/646-649 端点 + 沿线 8px 逐格发光（AI_007 :49685-49727 原版 AI 期执行，
   *  本仓同在 AI 期——aiStep 经 GameHooks.addLightAt 注册，本 tick 尾
   *  LightingEngine.compute 的 dirty 快进同帧消费呈现（调用点注释见 aiStep
   *  lineLight 段）；PlotTileLine = Utils.cs:2428 + PlotLine :2329 + CastLightOpen
   *  门 :729-743 */
  private emitLineLight(game: GameHooks, p: Player, rgb: readonly [number, number, number]): void {
    const add = game.addLightAt;
    if (!add) return;                       // 测试桩无光照通道（types.ts:111 可选钩子）
    const hx = this.cx, hy = this.cy, mx = p.cx, my = p.cy;
    add(mx, my, rgb[0], rgb[1], rgb[2]);    // AddLight(mountedCenter)（:49688/:49725）
    add(hx, hy, rgb[0], rgb[1], rgb[2]);    // AddLight(Center)（:49726；446 由线首格覆盖）
    const st = game.world.store;
    // ±width/2(4px) 垂直带 → tile 偏移（通常 (0,0)/(±1,0)）
    const len = Math.hypot(mx - hx, my - hy) || 1;
    const ox = (-(my - hy) / len) * 4, oy = ((mx - hx) / len) * 4;
    const stx = Math.floor(hx / TILE), sty = Math.floor(hy / TILE);
    const etx = Math.floor(mx / TILE), ety = Math.floor(my / TILE);
    const minOX = Math.floor((hx - ox) / TILE) - stx, minOY = Math.floor((hy - oy) / TILE) - sty;
    const maxOX = Math.floor((hx + ox) / TILE) - stx, maxOY = Math.floor((hy + oy) / TILE) - sty;
    // CastLightOpen：界外停；!nactive || solidTop || !solid → 加光
    // （tileSolid ≈ solid∪platform、tileSolidTop ≈ platform → 门化简 = !isActive || !solid）
    const plot = (x: number, y: number): boolean => {
      if (!st.inBounds(x, y)) return false;
      if (st.isActive(x, y) && TILE_DEFS[st.get(x, y)]?.solid === true) return true;
      add(x * TILE, y * TILE, rgb[0], rgb[1], rgb[2]);   // 像素→格（floor(x*16/16)=x 恒等）
      return true;
    };
    plotLine(stx, sty, etx, ety,
      (x, y) => plotLine(x + minOX, y + minOY, x + maxOX, y + maxOY, plot, false), true);
  }

  /** 兜底：链贴图未就绪/缺失时旧"线段"渲染（等价边界；下帧自愈） */
  private drawLegacyChain(ctx: CanvasRenderingContext2D, p: Player): void {
    const chain = HOOK_CHAIN_COLOR[this.projType] ?? '#9a92b8';
    ctx.save();
    ctx.strokeStyle = chain;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + p.w / 2, p.y + 12);
    ctx.lineTo(this.cx, this.cy);
    ctx.stroke();
    ctx.restore();
  }

  /** 兜底：钩头贴图未就绪/缺失时旧"方块"渲染 */
  private drawLegacyHead(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.ai0 === GRAPPLE_LATCH ? '#E8E4F8' : (HOOK_CHAIN_COLOR[this.projType] ?? '#9a92b8');
    ctx.fillRect(this.x, this.y, this.projW, this.projH);
  }
}

/** draw() 宿主（Renderer 的结构子集；测试可注入 mock） */
export interface GrappleDrawHost {
  ctx: CanvasRenderingContext2D;
  /** SpriteAtlas 懒加载取图（未就绪返回 null） */
  atlas?: { ensureVImage(file: string): CanvasImageSource | null } | null;
  /** 光照引擎（332/488 段光——原版即 draw 期发射，Main.cs:28796-28816/:28970；
   *  446/646-649 沿线光已回迁 AI 期（aiStep→addLightAt），不经本宿主；无则跳过） */
  lighting?: { addLight(x: number, y: number, r: number, g: number, b: number): void } | null;
  /** 世界（旧沿线光的 CastLightOpen 实心门用——段光不查地形，保留兼容测试桩） */
  world?: { store: ChainLightStore } | null;
}

/** 沿线光的 tile 存取子集 */
interface ChainLightStore {
  inBounds(x: number, y: number): boolean;
  isActive(x: number, y: number): boolean;
  get(x: number, y: number): number;
}

/** 带尺寸的贴图（HTMLImageElement/ImageBitmap） */
type Img2D = CanvasImageSource & { width: number; height: number };
function asImg(src: CanvasImageSource | null): Img2D | null {
  if (!src) return null;
  const w = (src as Img2D).width, h = (src as Img2D).height;
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? (src as Img2D) : null;
}

/** Utils.PlotLine（:2329-2368）1:1：Bresenham，jump=true 跳过阶梯次点，终点不绘 */
function plotLine(x0: number, y0: number, x1: number, y1: number,
  plot: (x: number, y: number) => boolean, jump = true): boolean {
  if (x0 === x1 && y0 === y1) return plot(x0, y0);
  const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
  if (steep) {
    let t = x0; x0 = y0; y0 = t;
    t = x1; x1 = y1; y1 = t;
  }
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let err = (dx / 2) | 0;
  let y = y0;
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  const emit = (i: number): boolean => (steep ? plot(y, i) : plot(i, y));
  for (let i = x0; i !== x1; i += sx) {
    if (!emit(i)) return false;
    err -= dy;
    if (err >= 0) continue;
    y += sy;
    if (!jump && !emit(i)) return false;
    err += dx;
  }
  return true;
}

/** 兜底线色（贴图缺失时旧渲染用；正常路径不走） */
const HOOK_CHAIN_COLOR: Record<number, string> = {
  13: '#9a92b8', 32: '#7BB254', 73: '#5A8FE8', 74: '#E85A5A', 165: '#D8D8E0',
  230: '#A02BE0', 231: '#E8B23A', 232: '#3A6AE8', 233: '#2ACC66', 234: '#D03A3A',
  235: '#3ADCE0', 256: '#C8C0A8', 315: '#4A3A58', 322: '#9A7448', 331: '#D84848',
  332: '#4AE058', 372: '#B89858', 396: '#58C8E8', 403: '#8890A0', 446: '#C858E8',
  486: '#C04848', 487: '#48A048', 488: '#88C8E8', 489: '#A88858', 646: '#E8A23A',
  647: '#58C858', 648: '#C858E8', 649: '#58A8E8', 652: '#D8D8E8', 753: '#E8A02A',
  865: '#A05828', 935: '#58B8E8',
};
