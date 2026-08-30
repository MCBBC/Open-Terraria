// 坐骑战斗通道（运输域两个缺失伤害面）：
//
// ①矿车高速撞击 NPC——原版 Player.Update_bfi 矿车段（1457 Player.cs:27748-27831 /
//   1456 :27225 起）：mount.Cart && velocity.Length()>4f 时以车身盒按速度逐轴扩张
//   扫敌怪桶，无 LOS 门是原版设计（矿车本就贴轨碾过、隔半块砖照样撞），勿补。
//   伤害表 GetMinecartDamage（1457 :29474-29518 / 1456 :28776-28820）：
//     默认/绝大多数矿车型        25 + 55×速比
//     mount 13 木质矿车          15 + 30×速比（唯一特例 case）
//     UsingSuperCart             50 + 100×速比（整体覆写并【重新掷】DamageVar）
//     击退 = 10 + 40×速比（无波动）；hardMode ×1.5 再 expertMode ×1.5（各 (int) 截断）
//   命中 → ApplyDamageToNPC(sourceItemId=2343 轨道物品，仅 DPS 记账用，无独立音效)
//   → StrikeNPC 族音效=敌怪自带 HitSound 链；npc.immune[whoAmI]=30。
//
// ②史莱姆坐骑弹跳踩踏——JumpMovement 头部三个垂直踩踏循环（1457 Player.cs:20693-
//   20801 / 1456 :20254-20362），四个相似循环中第三个（水平侧撞族 CollideWithNPCs，
//   1457 :20268-20330 mounts ?/14/17）不在本通道、见批注报告：
//     A 史莱姆坐骑弹跳：IsConsideredASlimeMount(type 3|50) && wetSlime==0 && vy>0
//       盒 = 身体 rect.Offset(0,height-1).Height=2.Inflate(12,6)（脚底 ±(12,6) 横带）
//       damage=(int)(40×minionDamage) kb=5 npc.immune=10 **velocity.Y=-10 弹跳**
//       GiveImmuneTimeForCollisionAttack(6) sourceItemId=2430(SlimySaddle)
//     B 死亡细胞冲撞符文下砸：isPerformingJump_DownDash && vy>0（同盒同数值，
//       无弹跳位移，immune=10 GiveImmune(6)，sourceItemId=5465 DeadCellsRamRune）
//       ——本仓引擎尚无 DownDash 触发源，入口 ramRuneDownDashStomp 显式暴露不自动挂。
//     C 高尔夫球车（type 17）下压：vy>0 同盒，damage=40（**无 minionDamage 乘区**）
//       kb=5 npc.immune=12 GiveImmune(12) sourceItemId=4264(GolfCart)、无弹跳。
//   ★三循环 ApplyDamageToNPC 一律字面 crit:false（1457 :20717/:20755/:20791）——
//   与任务书"crit 三择大"说法不符时以反编译源码为准，此处照抄无暴击掷骰。
//   命中门 = 敌怪 (noTileCollide || Collision.CanHit(position,w,h,nPC...)) 直判短式
//   CanHit（非四射线长链）→ 本仓 LineOfSight.canHit 等价形复用；
//   CanNPCBeHitByPlayerOrPlayerProjectile（1457 :20673 / 1456 :20234）的 critter 豁免
//   分支在本仓天然成立（小动物不入 enemies 桶），friendly 门走 playerCanHitEnemy。
//
// 免疫冷却位映射说明：原版 npc.immune[whoAmI] 是 per-玩家槽（255 格 byte 数组），
// 本仓单机语境塌缩为 Enemy.iframes 单计数器——命中前 gate 读 iframes==0（等价
// immune[i]==0）、命中后直写 iframes=30/10/12（等价 immune[i]=N）。若未来多人
// 需要 per-slot 语义再升级为 Map<playerSlot,n>（现 swingHitSet 族同为单计数器近似，
// 一致性优先）。玩家侧 GiveImmuneTimeForCollisionAttack（1457 :20654-20666）的
// _immuneStrikes 3 连击豁免规则以 WeakMap 计数器建模（见函数注释）。
import type { GameHooks } from './types';
import { damageVar } from '../stats/ScaleStats';
import { canHit } from '../physics/LineOfSight';
import { playerCanHitEnemy as _playerCanHitEnemy } from './projTargets';
import type { TileStore } from '../world/TileStore';

/** IsConsideredASlimeMount（Mount.cs:522-533）：type==3 SlimySaddle ∪ type==50 QueenSlime */
export function isConsideredASlimeMount(mountType: number): boolean {
  return mountType === 3 || mountType === 50;
}

/** JumpMovement 触发的 sourceItemId（NPCDamageTracker 击杀记账用，无独立音效面） */
export const STOMP_SOURCE_ITEMS = {
  slimySaddle: 2430,      // ItemID.SlimySaddle（A 支）
  ramRune: 5465,          // ItemID.DeadCellsRamRune（B 支）
  golfCart: 4264,         // ItemID.GolfCart（C 支）
} as const;

/** 矿车碾压伤害的 sourceItemId = 轨道物品 2343（Player.cs:27816） */
export const MINECART_HIT_SOURCE_ITEM = 2343;

// ---------------------------------------------------------------------------
// ①矿车高速撞击 NPC
// ---------------------------------------------------------------------------

export interface Rect {
  x: number; y: number; w: number; h: number;
}

/** 矿车冲撞盒扩张（1457 Player.cs:27751-27768 / 1456 :27228-27245）：基盒 =
 *  position/width/height 整值化（骑乘态玩家 hitbox 即车盒），逐轴按速度扩张：
 *  vx<-1 x-=15 / vx>1 w+=15 / vx<-10 x 再-=10 / vx>10 w 再+=10 / vy<-1 y-=10 / vy>1 h+=10 */
export function minecartRampageBox(x: number, y: number, w: number,
  h: number, vx: number, vy: number): Rect {
  const r: Rect = { x: Math.trunc(x), y: Math.trunc(y), w, h };
  if (vx < -1) r.x -= 15;
  if (vx > 1) r.w += 15;
  if (vx < -10) r.x -= 10;
  if (vx > 10) r.w += 10;
  if (vy < -1) r.y -= 10;
  if (vy > 1) r.h += 10;
  return r;
}

export interface MinecartDamageCtx {
  /** Mount.Type（默认档含除 13 外全部矿车型；13 木质矿车单独低配档） */
  mountType: number;
  /** Player.UsingSuperCart（unlockedSuperCart && enabledSuperCart，Player.cs:3950-3957） */
  superCart: boolean;
  hardMode: boolean;
  expertMode: boolean;
}

/** GetMinecartDamage 的基础面（未过 DamageVar 波动）（1457 :29474-29518）：
 *  默认 25+55s / mount 13 为 15+30s / SuperCart 整体覆写 50+100s；
 *  knockback = 10+40s。s = velocity.Length()/maxRunSpeed（骑乘态 maxRunSpeed=
 *  mount.RunSpeed，SuperCart 生效期被 Mount.cs:480-486 整体覆写为 20——由调用方
 *  传入 effectiveRunSpeed 时统一口径） */
export function minecartDamageBase(currentSpeed: number,
  ctx: MinecartDamageCtx): { base: number; knockback: number } {
  let base = ctx.mountType === 13 ? 15 + 30 * currentSpeed : 25 + 55 * currentSpeed;
  if (ctx.superCart) base = 50 + 100 * currentSpeed;              // :29512-29515
  return { base, knockback: 10 + 40 * currentSpeed };             // :29516-29517
}

/** GetMinecartDamage 全链（DamageVar ±15%/luck 波动 + hardMode ×1.5 与 expertMode ×1.5
 *  两个独立 (int) 截断乘区；kb 不吃波动不吃难度乘区）。
 *  rnd 可注入确定性随机（测试/deterministic 复放用，缺省 Math.random）。 */
export function getMinecartDamage(currentSpeed: number, ctx: MinecartDamageCtx,
  luck = 0, rnd: () => number = Math.random): { damage: number; knockback: number } {
  const base = minecartDamageBase(currentSpeed, ctx);
  // :29486 Main.DamageVar(base,luck)；SuperCart 支 :29514 是第二次独立 DamageVar 掷骰
  //（覆写在掷骰之后重新掷——同一 luck 参数重抽，等价于对覆写基数再取波动）
  let dmg = ctx.superCart
    ? damageVar(50 + 100 * currentSpeed, luck, rnd)
    : damageVar(ctx.mountType === 13 ? 15 + 30 * currentSpeed : 25 + 55 * currentSpeed, luck, rnd);
  if (ctx.hardMode) dmg = Math.trunc(dmg * 1.5);                  // :29518-29520 (int)(double*1.5)
  if (ctx.expertMode) dmg = Math.trunc(dmg * 1.5);                // :29521-29523（expert 在 hardmode 上叠——JS 主机专家必含 hardmode 标志，两支幂等）
  return { damage: dmg, knockback: base.knockback };
}

/** 冲撞目标的窄结构视图（Enemy/FakeFish 等 hurt 四参形制一致即可） */
interface RampageTarget {
  x: number; y: number; w: number; h: number;
  dead?: boolean; iframes?: number; dontTakeDamage?: boolean;
  def?: { friendly?: boolean; knockBackResist?: number };
  hurt(dmg: number, kbx: number, kby: number, g: GameHooks, armorPen?: number,
    crit?: boolean, pierce?: number, fromPlayer?: boolean): boolean;
}

/** 矿车撞怪主入口（1457 Player.cs:27748-27831 / 1456 :27225 起）——
 *  Minecart.fixedUpdate 每 tick 调一次（速度>4f 才进循环）。cart 取结构窄视图
 *  （runSpeed = 生效档 RunSpeed 值，Minecart 的 superCart-aware getter 取值即可）。
 *  返回命中数（测试断言用）。 */
export function minecartNpcRampage(cart: {
  x: number; y: number; w: number; h: number; vx: number; vy: number;
  mountId: number; superCart: boolean; runSpeed: number;
}, game: GameHooks): number {
  const p = game.player as unknown as {
    cx: number; cy: number; luck: number;
    critChance(k: 'melee' | 'ranged' | 'magic'): number;
    tryConsumingTimerCrit?(g: GameHooks, rx: number, ry: number, rw: number, rh: number): boolean;
    dead?: boolean;
  } | null;
  if (!p || p.dead) return 0;
  const spd = Math.hypot(cart.vx, cart.vy);
  if (spd <= 4) return 0;                                         // :27748 门
  // 速比分母 = maxRunSpeed = 骑乘态整体覆写后的 mount.RunSpeed（:26329；
  // SuperCart 生效 = 20——Minecart.runSpeed getter 取值已含 SuperCart 覆写）
  const ratio = spd / cart.runSpeed;
  const box = minecartRampageBox(cart.x, cart.y, cart.w, cart.h, cart.vx, cart.vy);
  const dir = cart.vx < 0 ? -1 : 1;                               // :27802-27806
  // 暴击 = max(melee,ranged,magic) 三择大掷骰（:27777-27792：rand.Next(1,101)<=crit
  // ⇔ floor(rand*100)+1<=crit 整数均匀分布）；后接 TryConsumingTimerCrit 强暴 OR 进。
  const critChanceMax = Math.max(p.critChance('melee'), p.critChance('ranged'), p.critChance('magic'));
  const ctx: MinecartDamageCtx = {
    mountType: cart.mountId,
    superCart: cart.superCart,
    hardMode: !!game.world.flags?.hardMode,
    expertMode: game.world.isExpert,
  };
  const { damage, knockback } = getMinecartDamage(ratio, ctx, p.luck);
  let hits = 0;
  for (const ent of game.enemies()) {
    const e = ent as RampageTarget;
    // 门串（:27772-27773）active && !dontTakeDamage && !friendly && immune[whoAmI]==0 &&
    // CanNPCBeHitByPlayerOrPlayerProjectile && 盒相交——immune==0 ↔ 本仓 e.iframes==0。
    // playerCanHitEnemy 是 friendly 门的超集（多 voodoo 臭蛋例外，矿车本无可触发物品）；
    // ★无 LOS 门为原版设计，勿加。
    if (e.dead || e.dontTakeDamage) continue;
    if (!_playerCanHitEnemy(e, game)) continue;
    if (e.iframes !== undefined && e.iframes !== 0) continue;
    if (!(box.x < e.x + e.w && box.x + box.w > e.x && box.y < e.y + e.h && box.y + box.h > e.y)) continue;
    // TryConsumingTimerCrit(Rectangle.Intersect(value3, nPC.Hitbox), ref crit)（:27793）
    const ix = Math.max(box.x, e.x), iy = Math.max(box.y, e.y);
    const iw = Math.min(box.x + box.w, e.x + e.w) - ix, ih = Math.min(box.y + box.h, e.y + e.h) - iy;
    let crit = (Math.floor(Math.random() * 100) + 1) <= critChanceMax;
    const forced = p.tryConsumingTimerCrit?.(game, ix, iy, iw, ih) ?? false;
    crit = crit || forced;
    // 0<knockBackResist<1 预除抗性（:27807-27810——hurt 管线内部再乘回，净效果击退
    // 不随抗性衰减；resist>=1 或 ==0 不动）
    const resist = e.def?.knockBackResist ?? 1;
    const kb = resist > 0 && resist < 1 ? knockback / resist : knockback;
    // ApplyDamageToNPC(...,sourceItemId=2343)（:27816）——StrikeNPC 族受击音/飘值/
    // 掉物走 Enemy.hurt 单点管线；fromPlayer=true 计入 DPS
    e.hurt(damage, dir * kb, 0, game, 0, crit, 0, true);
    hits++;
    e.iframes = 30;                                               // :27819 immune[i]=30
    if (e.dead) {
      // :27821-27823 AchievementsHelper.HandleSpecialEvent(this,9) VEHICULAR_MANSLAUGHTER
      game.achievements?.handleSpecialEvent(9,
        { statLifeMax: (game.player as unknown as { maxHp: number }).maxHp,
          statManaMax: (game.player as unknown as { maxMana: number }).maxMana });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// ②史莱姆坐骑弹跳踩踏（JumpMovement 头部三循环）
// ---------------------------------------------------------------------------

/** 踩踏循环公共参数（四循环差异只在盒/数值/免疫时长/是否弹跳——统一一个扫掠核心） */
interface StompCfg {
  /** 盒 = 玩家 rect.Offset(0,height-1).Height=2.Inflate(12,6)（脚底横带，恒同式） */
  damage(p: PlayerLike): number;
  knockback: number;
  npcImmune: number;
  playerImmune: number;
  /** A 支 true：命中后 velocity.Y=-10 反向弹跳 */
  bounce: boolean;
  sourceItem: number;
}

interface PlayerLike {
  x: number; y: number; w: number; h: number; vx: number; vy: number;
  facing: number;
  mount: { active: boolean; type: number };
  wetSlime?: number;
  iframes?: number;
  summonDamageMult: number;   // minionDamage 链终值（Player.summonDamageMult getter）
}

/** A 支史莱姆踩踏参数（:20693-20726）/ B 支死亡细胞下砸（:20731-20765）共用面 */
const SLIME_STOMP: StompCfg = {
  damage: (p) => Math.trunc(40 * p.summonDamageMult),   // float num = 40f*minionDamage;(int) 截断
  knockback: 5,
  npcImmune: 10,
  playerImmune: 6,
  bounce: true,
  sourceItem: STOMP_SOURCE_ITEMS.slimySaddle,
};

/** B 支（伤害/kb/免疫与 A 完全同构，仅无弹跳位移且不经坐骑门） */
const RAM_RUNE_STOMP: StompCfg = {
  damage: (p) => Math.trunc(40 * p.summonDamageMult),
  knockback: 5,
  npcImmune: 10,
  playerImmune: 6,
  bounce: false,
  sourceItem: STOMP_SOURCE_ITEMS.ramRune,
};

/** C 支高尔夫球车下压（:20768-20801）——damage 40 无 minionDamage 乘区 */
const GOLF_CART_STOMP: StompCfg = {
  damage: () => 40,
  knockback: 5,
  npcImmune: 12,
  playerImmune: 12,
  bounce: false,
  sourceItem: STOMP_SOURCE_ITEMS.golfCart,
};

/** 踩踏扇区公共扫掠（对应三个循环的循环体同型部分，1457 :20704-20726 同款）：
 *  盒相交 + (noTileCollide || Collision.CanHit 直判短式) → 结算 → break（每 tick 至多
 *  一个目标， vanilla 循环体 hit 后 break——多目标不连穿） */
function stompSweep(p: PlayerLike, game: GameHooks,
  cfg: StompCfg, st: TileStore | undefined): number {
  // rect = getRect().Offset(0,height-1).Height=2.Inflate(12,6)
  const bx = p.x - 12, by = p.y + p.h - 1 - 6, bw = p.w + 24, bh = 2 + 12;
  for (const ent of game.enemies()) {
    const e = ent as unknown as StompTarget2;
    if (!e || e.dead || e.dontTakeDamage) continue;
    if (!_playerCanHitEnemy(e, game)) continue;
    if (e.iframes !== undefined && e.iframes !== 0) continue;    // nPC.immune[whoAmI]!=0
    if (!(bx < e.x + e.w && bx + bw > e.x && by < e.y + e.h && by + bh > e.y)) continue;
    // 直判短式 LOS（nPC.noTileCollide || Collision.CanHit(position,w,h,nPC.position,...)）
    if (!(e.noTileCollide || (st ? canHit(st, p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h) : true))) continue;
    const dmg = cfg.damage(p);
    // 方向：num2=direction，vx<0→-1 / vx>0→1（:20711-20717，静止时取朝向）
    let dir = p.facing;
    if (p.vx < 0) dir = -1;
    else if (p.vx > 0) dir = 1;
    e.hurt(dmg, dir * cfg.knockback, 0, game, 0, false, 0, true);   // crit:false 字面（见文件头注）
    e.iframes = cfg.npcImmune;                                     // nPC.immune[whoAmI]=10/12
    if (cfg.bounce) p.vy = -10;                                    // velocity.Y=-10f（仅 A 支）
    giveImmuneTimeForCollisionAttackImpl(p, cfg.playerImmune);
    return 1;
  }
  return 0;
}

interface StompTarget2 {
  x: number; y: number; w: number; h: number;
  dead?: boolean; iframes?: number; dontTakeDamage?: boolean;
  noTileCollide?: boolean;
  def?: { friendly?: boolean };
  hurt(dmg: number, kbx: number, kby: number, g: GameHooks, armorPen?: number,
    crit?: boolean, pierce?: number, fromPlayer?: boolean): boolean;
}

/** GiveImmuneTimeForCollisionAttack（1457 Player.cs:20654-20666）建模：
 *  _timeSinceLastImmuneGet<=20t 内连续获取则 _immuneStrikes++ 否则归 1；
 *  strikes<3 且 (!immune || immuneTime<=time) 才授予（3 连击拒发防无敌滥用）。
 *  本仓无独立 immune/immuneTime 字段 → 以 p.iframes>0 当 immune、lastGrant 存池当
 *  immuneTime 近似；tick 时钟由 mountJumpStomps 每帧推进（玩家侧碰撞攻击仅在
 *  JumpMovement 族内使用，其它 GiveImmuneTimeForCollisionAttack 调用点——日耀盾
 *  滑行 :21351 等——仍走各自旧近似，不并入）。 */
const IMMUNE_STRIKES = new WeakMap<object, { lastClock: number; strikes: number; lastGrant: number }>();
let stompClock = 0;

function giveImmuneTimeForCollisionAttackImpl(p: { iframes?: number }, time: number): void {
  let s = IMMUNE_STRIKES.get(p);
  if (!s) { s = { lastClock: -999, strikes: 0, lastGrant: 0 }; IMMUNE_STRIKES.set(p, s); }
  s.strikes = stompClock - s.lastClock <= 20 ? s.strikes + 1 : 1;
  s.lastClock = stompClock;
  if (s.strikes < 3 && ((p.iframes ?? 0) <= 0 || s.lastGrant <= time)) {
    p.iframes = Math.max(p.iframes ?? 0, time);
    s.lastGrant = time;
  }
}

/** JumpMovement 头部踩踏段总入口（A+C 支；B 支无引擎触发源走显式入口）——
 *  Player.fixedUpdate 每 tick 调一次（vanilla :26945 移动尾无条件调 JumpMovement）。
 *  返回命中数。同时推进免疫连击时钟（见上）。 */
export function mountJumpStomps(p: {
  x: number; y: number; w: number; h: number; vx: number; vy: number;
  facing: number; cy: number; iframes?: number; wetSlime?: number;
  summonDamageMult: number;
  mount: { active: boolean; type: number };
}, game: GameHooks): number {
  stompClock++;
  const st: TileStore | undefined = game.world?.store;
  let hits = 0;
  // A 支：mount.Active && IsConsideredASlimeMount && wetSlime==0 && velocity.Y>0（:20693）
  if (p.mount.active && isConsideredASlimeMount(p.mount.type) && (p.wetSlime ?? 0) === 0
    && p.vy > 0) {
    hits += stompSweep(p, game, SLIME_STOMP, st);
  }
  // C 支：mount.Active && mount.Type==17（GolfCart）&& velocity.Y>0（:20768）
  if (p.mount.active && p.mount.type === 17 && p.vy > 0) {
    hits += stompSweep(p, game, GOLF_CART_STOMP, st);
  }
  return hits;
}

/** B 支死亡细胞冲撞符文下砸（isPerformingJump_DownDash && vy>0，:20731-20765）。
 *  引擎暂无 hasDeadCellsDownDash/isPerformingJump_DownDash 触发源（装备链未实装），
 *  本入口保持未接线——将来落 DeadCells 下砸态机时在 dash 期间显式调用即可。 */
export function ramRuneDownDashStomp(p: Parameters<typeof mountJumpStomps>[0],
  game: GameHooks): number {
  if (p.vy <= 0) return 0;
  return stompSweep(p, game, RAM_RUNE_STOMP, game.world?.store);
}

// ---------------------------------------------------------------------------
// wetSlime（史莱姆坐骑液体态，1457 :28160-28207 / 1456 :27653-27689）
// ---------------------------------------------------------------------------

/** 史莱姆坐骑液体态滴答：wetSlime--（:28173-28175）；浸液（原版 wet 不分液体种类）
 *  且骑史莱姆族时 wetSlime=30 + 浮力档（:28195-28207：vy>2 ×0.9 缓降、vy-=0.5
 *  浮升、vy<-4 钳回 —— 从史莱姆座上入水会缓缓下沉不被冻住）。 */
export function tickSlimeWetState(p: {
  inWater?: boolean; inLava?: boolean; inHoney?: boolean; vy: number; wetSlime?: number;
  mount: { active: boolean; type: number };
}): void {
  if ((p.wetSlime ?? 0) > 0) p.wetSlime = (p.wetSlime ?? 0) - 1;   // :28173-28175
  if (!p.mount.active) return;
  if (!(p.inWater || p.inLava || p.inHoney)) return;
  if (!isConsideredASlimeMount(p.mount.type)) return;
  p.wetSlime = 30;                                                // :28196-28197
  if (p.vy > 2) p.vy *= 0.9;                                      // :28198-28200
  p.vy -= 0.5;                                                    // :28202
  if (p.vy < -4) p.vy = -4;                                       // :28203-28205
}

/** JumpMovement controlJump 头部的湿清除（1457 :28108-28114 / 1456 :20375-20377）：
 *  按住跳键瞬间清湿史莱姆（wetSlime=0 + flag 让后续起跳门放行水下起跳）。
 *  返回 true = 本帧有清湿发生（调用方可据此放宽水中起跳门）。 */
export function consumeWetSlimeOnJumpControl(p: {
  inputJump?: boolean; wetSlime?: number;
  mount: { active: boolean; type: number };
}): boolean {
  if (p.inputJump && p.mount.active && isConsideredASlimeMount(p.mount.type)
    && (p.wetSlime ?? 0) > 0) {
    p.wetSlime = 0;
    return true;
  }
  return false;
}
