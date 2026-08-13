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
//  · 绳渲染为线段+钩头方块（原版 Chain 分节贴图，ChainID 表）——视觉近似，玩法数值 1:1
//  · 935 皇后钩瞬移走 moveAndCollide 逐步步进（原版 TileCollision 150 步 ×12px 同构）
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { BuffType } from '../stats/Buffs';
import { TILE } from '../core/constants';
import {
  HOOK_KILL_DISTANCE, HOOK_RETRACT_KILL_DIST, HOOK_TIME_LEFT, CRACKED_BRICK_SHEETS,
  TREE_TRUNK_SHEETS, TRACK_SHEET, TREE_SHEET, HOOK_PROJ_STATS, isHookProjectile,
} from '../data/grappleHooks';
import type { HookProjStats } from '../data/grappleHooks';
import { TILE_DEFS } from '../data/tiles';
import { projectileData } from '../data/vanillaProjectiles';

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

  // ---- 渲染（视觉近似：链 = 线段 + 钩头；原版 Chain 分节 ChainID 表）----
  draw(r: { ctx: CanvasRenderingContext2D }, _cam: unknown): void {
    const p = this.playerRef();
    if (!p) return;
    const ctx = r.ctx;
    const chain = HOOK_CHAIN_COLOR[this.projType] ?? '#9a92b8';
    ctx.save();
    ctx.strokeStyle = chain;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + p.w / 2, p.y + 12);
    ctx.lineTo(this.cx, this.cy);
    ctx.stroke();
    ctx.fillStyle = this.ai0 === GRAPPLE_LATCH ? '#E8E4F8' : chain;
    ctx.fillRect(this.x, this.y, this.projW, this.projH);
    ctx.restore();
  }
}

/** 各型号线色（视觉近似——原版为 ChainID 分节链贴图，本仓等价线段） */
const HOOK_CHAIN_COLOR: Record<number, string> = {
  13: '#9a92b8', 32: '#7BB254', 73: '#5A8FE8', 74: '#E85A5A', 165: '#D8D8E0',
  230: '#A02BE0', 231: '#E8B23A', 232: '#3A6AE8', 233: '#2ACC66', 234: '#D03A3A',
  235: '#3ADCE0', 256: '#C8C0A8', 315: '#4A3A58', 322: '#9A7448', 331: '#D84848',
  332: '#4AE058', 372: '#B89858', 396: '#58C8E8', 403: '#8890A0', 446: '#C858E8',
  486: '#C04848', 487: '#48A048', 488: '#88C8E8', 489: '#A88858', 646: '#E8A23A',
  647: '#58C858', 648: '#C858E8', 649: '#58A8E8', 652: '#D8D8E8', 753: '#E8A02A',
  865: '#A05828', 935: '#58B8E8',
};
