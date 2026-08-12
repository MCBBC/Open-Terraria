// 城镇 NPC：游走、夜间回家、对话气泡
// 贴图 = 原版 Images/NPC_{id}（Terarria1456 素材条），帧语义按原版 FindFrame 城镇分支
// （NPC.cs:69152+）：地面站定=帧0；腾空=帧1；行走帧 2..frames-extra-1 循环
// （frameCounter += |vx|*2+1 每 tick，>6 推进一帧，越界回卷帧2）
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { openDoor, closeDoor as closeDoorTile, shiftTallGate } from '../world/Door';
import { TILE_BY_KEY as TILE_BY_KEY_DOOR_TILES } from '../data/tiles';
import { TOWN_NPC_IDS, VANILLA_NPCS } from '../data/vanillaNpcs';
import { isNpcTownShimmerable } from '../stats/Shimmer';
import { newNpcName } from '../i18n/RandomText';
import { canHit } from '../physics/LineOfSight';
import {
  TOWN_ATTACK_TIME, TOWN_ATTACK_CHANCE, TOWN_ATTACK_TYPE, TOWN_DANGER_RANGE,
  TOWN_MELEE, TOWN_BOW, TOWN_MAGIC, TOWN_SWING, TOWN_PRETTY_SAFE,
  type TownShotParams, townNpcDamageMult,
} from '../data/vanillaTownAttack';
import { TownShot } from './TownShot';

export interface NpcHome { x: number; y: number; }

export class TownNPC extends Entity {
  w = 20; h = 42;
  stepUp = true; // 原版 NPC 全体走 Collision.StepUp（NPC.cs:54382）
  npcKey: string; // 'guide'
  /** 原版 NPCID（TOWN_NPC_IDS；Renderer 经 atlas.vnpc 取 NPC_{id}.png 贴图条） */
  vanillaId: number;
  facing = 1;
  /** 随机名字（NPC.getNewNPCNameInner 名字池；无池类型如守卫老人为空串） */
  givenName = '';
  animT = 0;
  frame = 0;       // 当前贴图帧（原版 frame.Y/帧高）
  frameT = 0;      // 行走帧累加器（≈原版 frameCounter）
  wanderT = 0;
  home: NpcHome | null = null;
  /** 定点站岗（守卫老人）：门口地带是山坡+塔心竖井,白天的自由游走会坠入地牢；
   *  原版观感也是整日守在门口走廊 */
  stationary = false;
  /** 被绑待救援（原版为独立 NPC 类型：BoundGoblin105/BoundWizard106/BoundMechanic123/
   *  WebbedStylist354/GolferRescue589，本作以本标记近似；渲染按真帧走各捆绑姿态表——
   *  Renderer.BOUND_NPC_SHEET。原地不动，右键解救 → savedXxx 旗标置位成为正式城镇 NPC） */
  bound = false;
  // ---- NPC 开关门（原版 AI_007，NPC.cs:54478 开门 / 54243 过门关门）----
  private closeDoor = false;
  private doorX = 0; private doorY = 0;
  /** 白天游走但不远离 home(守卫老人:锚地牢门口走廊,防走失) */
  leashHome = false;
  /** 正在与玩家对话（原版 AI_007 :53721：talkNPC==本体 → ai[0]=0 站定、面向玩家） */
  talking = false;
  talkCooldown = 0;
  /** 微光化变体（NPCID.Sets.ShimmerTownTransform 入微光 → NPC.cs:92560-92573
   *  ai[0]=25 传送离场回归；本仓 = 标记 + 回家，变体贴图/对话差分登记 GAP） */
  shimmered = false;

  /** 生命（原版城镇 NPC 可被陷阱弹幕误伤：vanilla-npcs.json lifeMax 250 / defense 15） */
  hp: number;
  maxHp: number;
  iframes = 0;
  // ---- 自卫攻击（AI_007 攻击态 ai[0]=10/12/14/15,NPC.cs:54747-55538）----
  /** 当前攻击态(0 空闲 / 10 近战弹 / 12 弓 / 14 魔法 / 15 挥击) */
  private atkState = 0;
  /** ai[1]:态倒计时(AttackTime) */
  private atkTimer = 0;
  /** localAI[1]:触发冷却(flag31 门) */
  private atkCd = 0;
  /** localAI[3]:态内 tick 计数 */
  private atkTick = 0;
  /** 当前发射档 num46/55/65(连发升级链推进) */
  private atkNextShot = 0;
  private atkBurstIdx = 0;
  /** world.flags.hardMode 缓存(attackUpdate 每 tick 刷新) */
  private hardModeFlag = false;

  constructor(key: string, x: number, y: number) {
    super();
    this.npcKey = key;
    this.x = x;
    this.y = y - this.h;
    const town = TOWN_NPC_IDS[key];
    this.vanillaId = town?.id ?? 22; // 未登记 key 兜底向导贴图
    this.givenName = newNpcName(this.vanillaId);
    const v = VANILLA_NPCS[String(this.vanillaId)];
    this.maxHp = this.hp = v?.lifeMax ?? 250;
  }

  /** 被陷阱弹幕等命中：dmg - defense*0.5（下限 1），8 tick 无敌帧；
   *  死亡即移除——"重生"由入驻轮承担（原版 UpdateTime_SpawnTownNPCs：不在场且
   *  条件满足 → 重新入驻，≈次日回归），无需独立重生系统 */
  hurt(dmg: number, kbx: number, _kby: number, game: GameHooks): boolean {
    if (this.iframes > 0 || this.dead) return false;
    const books = (game.world.flags.combatBookWasUsed ? 1 : 0) + (game.world.flags.combatBookVolumeTwoWasUsed ? 1 : 0);
    const def = (VANILLA_NPCS[String(this.vanillaId)]?.defense ?? 15) + books * 8; // NPC.cs:53419
    dmg = Math.max(1, Math.round(dmg - def * 0.5));
    this.hp -= dmg;
    this.iframes = 8;
    game.addDamageNumber(this.cx, this.y, dmg, false, '#FFD060');
    this.vx += kbx * 0.6;
    if (this.hp <= 0) {
      this.dead = true;
      game.spawnParticles(this.cx, this.cy, '#C03030', 8, 2);
      game.spawnParticles(this.cx, this.cy, '#8A1818', 4, 1.2);
      game.playSfxFiles(['NPC_Killed_1'], 0.8);
    } else {
      game.playSfxFiles(['NPC_Hit_1'], 0.6);
    }
    return true;
  }

  /** 战斗书增益（NPC.cs:53419-53430：每本 lifeMax+250 / 伤害出力×0.8 / 移速+0.25 /
   *  防+8——伤害/移速两项无对应战斗系统，落 lifeMax/防；每本可叠加，由调用方按旗标次数调） */
  applyCombatBook(): void {
    this.maxHp += 250;
    this.hp = Math.min(this.maxHp, this.hp + 250);
  }

  private cbApplied = false;
  fixedUpdate(dt: number, game: GameHooks) {
    this.animT++;
    if (this.iframes > 0) this.iframes--;
    const world = game.world;
    // 战斗书增益一次性套用（后入驻的 NPC 在首 tick 补；使用书时对在场者即时叠）
    if (!this.cbApplied) {
      this.cbApplied = true;
      const books0 = (world.flags.combatBookWasUsed ? 1 : 0) + (world.flags.combatBookVolumeTwoWasUsed ? 1 : 0);
      for (let k = 0; k < books0; k++) this.applyCombatBook();
    }

    // 微光化城镇变体（NPC.GetShimmered :92560-92573：ShimmerTownTransform → ai[0]=25
    // 微光传送离场，回归后为微光变体 IsShimmerVariant）。本仓净效果：入微光即标记
    // 微光化并传送回家（原版 AI_007_TownEntities_Shimmer_TeleportToLandingSpot 的
    // "离场→稍后回归"由入驻轮天然承担）。变体贴图/对话差分未接（GAP）
    if (!this.shimmered && isNpcTownShimmerable(this.vanillaId)) {
      const si = world.store.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE));
      if (world.store.liquid[si] > 30 && world.store.liquidType[si] === 4) {
        this.shimmered = true;
        game.spawnParticles(this.cx, this.cy, '#BFE8FF', 14, 1.4, { life: 30, grav: -0.04 });
        game.playSfx('shimmerSplash', 0.75, this.cx, this.cy);
        if (this.home) {
          this.x = this.home.x * TILE + 8 - this.w / 2;
          this.y = this.home.y * TILE - this.h;
          this.vx = 0; this.vy = 0;
        }
      }
    }

    // 被绑待救援：原地不动（仅重力落定），解救在 Game.talkToNearbyNpc / 净化粉
    // （原版 bound 类型同走 TargetClosest + spriteDirection，NPC.cs:19813-19816：
    //  恒面向最近玩家——捆绑姿态转向救援者）
    if (this.bound) {
      const bp = (game as unknown as { player: Player }).player;
      if (bp && !bp.dead) this.facing = bp.cx < this.cx ? -1 : 1;
      this.vx = 0;
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(this, world, this.vx, this.vy);
      return;
    }

    let wantDir = 0;
    // 对话中站定并面向玩家（原版 AI_007 NPC.cs:53721-53742：talkNPC==本体 →
    // ai[0]=0 停走、ai[1]=300、direction 指向玩家——杜绝"聊着聊着走开丢对话"）
    if (this.talking) {
      const p = (game as unknown as { player: Player }).player;
      if (p) this.facing = p.cx < this.cx ? -1 : 1;
      this.vx *= 0.6;
      this.wanderT = 0;
    } else if (!this.stationary && world.clock.isDay) {
      // 白天家门口附近游走;leashHome 者离 home 超过 ~10 格时折返(守卫老人不离地牢)
      if (this.leashHome && this.home
        && Math.abs(this.cx - (this.home.x * TILE + 8)) > 10 * TILE) {
        wantDir = Math.sign(this.home.x * TILE + 8 - this.cx);
      } else {
        this.wanderT--;
        if (this.wanderT <= 0) {
          this.wanderT = 90 + Math.random() * 180;
          this.facing = Math.random() < 0.5 ? -1 : 1;
          if (Math.random() < 0.35) this.facing = 0;
        }
        wantDir = this.facing;
      }
    } else if (this.home) {
      // 夜间回家
      const dx = this.home.x * TILE + 8 - this.cx;
      if (Math.abs(dx) > TILE) wantDir = Math.sign(dx);
    }

    // ---- 自卫攻击（AI_007 攻击态 ：54747-55538;攻击中站定替代游走）----
    if (this.attackUpdate(world, game)) wantDir = 0;

    this.vx += wantDir * 0.06;
    this.vx = Math.max(-0.8, Math.min(0.8, this.vx));
    if (wantDir === 0) {
      // 原版驻留刹车（NPC.cs:54096-54106）：不走路时每 tick ±0.1 主动减速。
      // 缺此刹车时 facing=0（站立意图）仍以 0.8px/tick 惯性滑行且贴图不镜像
      // → 向右滑行显示朝左贴图（偶发"太空步"）
      if (this.vx > 0.1) this.vx -= 0.1;
      else if (this.vx < -0.1) this.vx += 0.1;
      else this.vx = 0;
    }
    if (this.onGround && this.hitWall && wantDir !== 0) this.vy = -6; // 跳台阶
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(this, world, this.vx, this.vy);
    if (this.hitWall) this.vx *= 0.5;
    if (wantDir !== 0) this.facing = wantDir;
    // 开关门（原版 54478-54500：撞到关着的门 → 1/10（或卡住必试）开门，两方向回退；
    // 54243-54252：走过门 >2 格关门，>4 格放弃）
    this.npcDoorUpdate(world, game);

    // ---- 原版 FindFrame 城镇分支（NPC.cs:70172-70262）----
    // 腾空=帧1；地面站定=帧0、计数清零；行走 frameCounter += |vx|*2+1，>6 推进，
    // 帧区间 2..frames-extra-1（越界回卷帧2）
    if (!this.onGround) {
      this.frame = 1;
      this.frameT = 0;
    } else if (Math.abs(this.vx) < 0.05) {
      this.frame = 0;
      this.frameT = 0;
    } else {
      const total = VANILLA_NPCS[String(this.vanillaId)]?.frames ?? 1;
      const extra = TOWN_NPC_IDS[this.npcKey]?.extra ?? 2;
      this.frameT += Math.abs(this.vx) * 2 + 1;
      if (this.frame < 2) this.frame = 2;
      if (this.frameT > 6) {
        this.frameT = 0;
        this.frame++;
      }
      if (this.frame >= total - extra) this.frame = 2;
    }

  }

  /** 城镇 NPC 自卫攻击（AI_007 攻击态机,NPC.cs:54747-55538 + 触发门 :55621-55966）。
   *  返回 true = 攻击态中(调用方停走)。语义对照:
   *  - flag31 门 ≈ 空闲+站地+触发冷却尽+探测范围内有可打敌(flag16;stinky 分支无系统跳过)
   *  - 掷骰 rand(max(1,chance×num3))==0,num3=2(209 ÷3),:53813/:53562
   *  - 入态:ai[1]=AttackTime,面向目标;态内每 tick ai[1]--/localAI[3]++/vx×0.8
   *  - 发射档:localAI[3]==num46/55/65;连发链 `localAI[3]>档 → 推下一档`(:55066 族)
   *  - 退出:ai[1]<=0 → 冷却 localAI[1] = cdBase/2 + rand(cdRand)(:54927-54934 族)
   *  近似项:难度伤害缩放恒 Classic=1(Journey/Expert 切换未接);633 狼人变体/
   *  108 连发 1-3/160·663 落点弹重掷等特化在发射端按 note 近似 */
  private attackUpdate(world: import('../world/World').World, game: GameHooks): boolean {
    if (this.atkCd > 0) this.atkCd--;
    const atkType = TOWN_ATTACK_TYPE[this.vanillaId];
    if (atkType === undefined) return false;
    this.hardModeFlag = !!(world.flags as Record<string, boolean>).hardMode;
    if (this.atkState === 0) {
      // 触发门:站地 + 冷却尽 + 探测范围内有 LOS 敌(:55621 flag31 + :55864 族掷骰)
      if (!this.onGround || this.atkCd > 0 || this.talking) return false;
      const range = TOWN_DANGER_RANGE[this.vanillaId] ?? 200;
      const target = this.pickSideTarget(world, game, range);
      if (!target) return false;
      let chance = TOWN_ATTACK_CHANCE[this.vanillaId] ?? 1;
      let num3 = 2;                             // :53413(Skyblock ÷1.5 未接)
      if (this.vanillaId === 209) num3 /= 3;    // :53548 蒸汽朋克人三倍勤
      const gate = Math.max(1, Math.floor(chance * num3));
      if (Math.random() >= 1 / gate) return false;  // rand(gate)==0
      const params = this.atkParams(atkType);
      if (!params && atkType !== 3) return false;
      this.atkState = atkType === 0 ? 10 : atkType === 1 ? 12 : atkType === 2 ? 14 : 15;
      this.atkTimer = TOWN_ATTACK_TIME[this.vanillaId] ?? 30;
      this.atkTick = 0;
      this.atkBurstIdx = 0;
      this.atkNextShot = (params as TownShotParams | undefined)?.shootTick ?? 1;
      this.facing = (target as { cx: number }).cx < this.cx ? -1 : 1;
      return true;
    }
    // ---- 态内推进 ----
    this.atkTimer--;
    this.atkTick++;
    this.vx *= 0.8;
    const range = TOWN_DANGER_RANGE[this.vanillaId] ?? 200;
    if (this.atkState === 15) {
      this.swingUpdate(world, game);
    } else {
      const params = this.atkParams(TOWN_ATTACK_TYPE[this.vanillaId]) as TownShotParams;
      // 连发链:localAI[3] 超过当前档 → 推下一档(原版逐档 if 链)
      const burst = params.burst ?? [];
      while (this.atkBurstIdx < burst.length && this.atkTick > this.atkNextShot) {
        this.atkNextShot = burst[this.atkBurstIdx++];
      }
      if (this.atkTick === this.atkNextShot) this.shootAt(world, game, params, range);
    }
    if (this.atkTimer <= 0) {
      // 退出 + 冷却(:54927/:55199/:55397/:55529 族):localAI[1] = cdBase/2 + rand(cdRand)
      const p = this.atkParams(TOWN_ATTACK_TYPE[this.vanillaId]);
      const cdBase = (p as TownShotParams | undefined)?.cdBase ?? 10;
      const cdRand = (p as TownShotParams | undefined)?.cdRand ?? 1;
      this.atkState = 0;
      this.atkCd = Math.floor(cdBase / 2) + Math.floor(Math.random() * Math.max(1, cdRand));
    }
    return true;
  }

  /** 当前类型的态参数(10/12/14;15 走 TOWN_SWING);hardMode 覆盖按 world.flags */
  private atkParams(atkType: 0 | 1 | 2 | 3): TownShotParams | undefined {
    const table = atkType === 0 ? TOWN_MELEE : atkType === 1 ? TOWN_BOW : atkType === 2 ? TOWN_MAGIC : undefined;
    if (!table) return undefined;
    const base = table[this.vanillaId];
    if (!base) return undefined;
    if (base.hardMode && this.hardModeFlag) return { ...base, ...base.hardMode } as TownShotParams;
    return base;
  }


  /** 挥击态(15):前方矩形近战判定(:55469-55494;原版逐 tick 弧形挥击,近似中段一击) */
  private swingUpdate(_world: import('../world/World').World, game: GameHooks): void {
    const sw = TOWN_SWING[this.vanillaId];
    if (!sw) return;
    const t = TOWN_ATTACK_TIME[this.vanillaId] ?? 15;
    if (this.atkTick !== Math.max(1, Math.floor(t / 2))) return; // 挥击中段
    const rect = sw.rect;
    const rx = this.facing === 1 ? this.cx : this.cx - rect;
    const ry = this.cy - rect / 2;
    let dmg = sw.dmg;
    let kb = sw.kb;
    if (this.vanillaId === 441 && this.givenName === 'Andrew') { dmg *= 2; kb *= 2; } // 猫单特典 :55431
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; dead: boolean;
        hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean };
      if (e.dead) continue;
      if (!(rx < e.x + e.w && rx + rect > e.x && ry < e.y + e.h && ry + rect > e.y)) continue;
      if (e.hurt(Math.round(dmg * townNpcDamageMult(0)), this.facing * kb, 0, game)) {
        game.addDamageNumber(e.x, e.y, dmg, false, '#FFD060');
      }
    }
  }

  /** 探测范围内按侧取最近可打敌(:53887-53958 近侧目标;LOS=Collision.CanHit) */
  private pickSideTarget(world: import('../world/World').World, game: GameHooks, range: number):
    { cx: number; cy: number } | null {
    let bestL: { cx: number; cy: number; d: number } | null = null;
    let bestR: { cx: number; cy: number; d: number } | null = null;
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; dead: boolean };
      if (e.dead) continue;
      // 中心由 x/y/w/h 推导(敌实体有 cx/cy,但勿依赖——判距门曾因 NaN 恒假失效)
      const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
      const dx = ecx - this.cx;
      const d = Math.hypot(dx, ecy - this.cy);
      if (d >= range) continue;
      if (!canHit(world.store, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
      const cand = { cx: ecx, cy: ecy, d };
      if (dx < 0) { if (!bestL || d < bestL.d) bestL = cand; }
      else { if (!bestR || d < bestR.d) bestR = cand; }
    }
    // num15 侧选择(:53960):两侧都有 → 距离近者;仅一侧 → 该侧
    if (bestL && bestR) return bestL.d <= bestR.d ? bestL : bestR;
    return bestL ?? bestR;
  }

  /** 发射(:54903/:55175/:55325 三族瞄准公式统一在此) */
  private shootAt(world: import('../world/World').World, game: GameHooks, params: TownShotParams, range: number): void {
    const st = world.store;
    let proj = params.proj;
    let dmg = params.dmg;
    let speed = params.speed;
    let kb = params.kb;
    let spread = params.spread;
    // 229 PrettySafe 近距保命换炮弹(:55128-55135)
    const pretty = TOWN_PRETTY_SAFE[this.vanillaId];
    const target = this.pickSideTarget(world, game, range);
    if (params.panic && pretty && target && Math.hypot(target.cx - this.cx, target.cy - this.cy) < pretty
      && this.atkTick === params.shootTick) {
      proj = params.panic.proj; dmg = params.panic.dmg; speed = params.panic.speed;
      kb = params.panic.kb; spread = params.panic.spread;
    }
    // 209 三选一弹(:55139)
    if (this.vanillaId === 209 && !params.panic) {
      const pick = [134, 133, 135][Math.floor(Math.random() * 3)];
      proj = pick;
      const m: Record<number, [number, number, number, number, number]> = {
        134: [20, 13, 4, 0.1, 20], 133: [25, 10, 6, 0.2, 10], 135: [30, 12, 7, 0.2, 30],
      };
      [dmg, speed, kb, spread] = [m[pick][0], m[pick][1], m[pick][2], m[pick][3]];
    }
    // 瞄准:弓 = 目标上抬 aimLift 取向;近战/魔法 = aimLiftScaled×(dist/range 归一)上抬
    let vx = this.facing, vy = 0;
    if (target) {
      let lift = params.aimLift ?? 0;
      if (this.atkState === 10 || this.atkState === 14) {
        const dist = Math.hypot(target.cx - this.cx, target.cy - this.cy);
        lift = (params.aimLiftScaled ?? 0) * Math.max(0, Math.min(1, dist / range));
        vy = -1; // 近战/魔法默认上抛分量(初值 -UnitY)
      }
      const dx = target.cx - this.cx;
      const dy = target.cy - lift - this.cy;
      const dl = Math.hypot(dx, dy) || 1;
      vx = dx / dl; vy = dy / dl;
      if (Math.sign(vx) !== this.facing) { vx = this.facing; vy = this.atkState === 12 ? 0 : -1; }
    } else if (this.atkState !== 12) {
      vy = -1;
    }
    vx *= speed; vy *= speed;
    // 散布(Utils.RandomVector2 ±spread;近战态恒 0)
    if (spread > 0) {
      vx += (Math.random() * 2 - 1) * spread;
      vy += (Math.random() * 2 - 1) * spread;
    }
    const dmgFinal = Math.round(dmg * townNpcDamageMult(0));
    const sx = this.cx + this.facing * 16 - 5;
    const sy = this.cy - 2 - 5;
    // 落点弹(160/663):目标区域生成 velocity=0;实心重掷近似 ≤5 次
    if (speed === 0 && target) {
      for (let k = 0; k < 5; k++) {
        const px = target.cx - 16 + Math.random() * 32;
        const py = target.cy - 16 + Math.random() * 32;
        if (!st.isSolid(Math.floor(px / TILE), Math.floor(py / TILE))) {
          game.spawnTownShot?.(new TownShot(px - 5, py - 5, 0, 0, dmgFinal, kb, proj, { noGravity: true }));
          return;
        }
      }
      return;
    }
    game.spawnTownShot?.(new TownShot(sx, sy, vx, vy, dmgFinal, kb, proj, {
      life: this.vanillaId === 588 ? 480 : undefined,
    }));
  }

  /** 城镇 NPC 开关门（原版 NPC.cs:54478-54500/54243-54252，含高门 389 族 ShiftTallGate） */
  private npcDoorUpdate(world: import('../world/World').World, game: GameHooks) {
    const st = world.store;
    const DOOR_OPEN = TILE_BY_KEY_DOOR_TILES['door_open'] ?? -1;
    const GATE_OPEN = TILE_BY_KEY_DOOR_TILES['tall_gate_open'] ?? -1;
    // 过门关门：中心距门 >2 格 → 关；>4 格或换层 → 放弃（原版 54243-54252）
    if (this.closeDoor) {
      const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
      if (Math.abs(tx - this.doorX) > 2 || Math.abs(ty - this.doorY) > 4) {
        const doorType = st.type[st.idx(this.doorX, this.doorY)];
        if (Math.abs(tx - this.doorX) <= 4 && Math.abs(ty - this.doorY) <= 4) {
          if (doorType === DOOR_OPEN) closeDoorTile(st, this.doorX, this.doorY);
          else if (doorType === GATE_OPEN) {
            // 高门关门（原版 54266-54274：ShiftTallGate(closing:true)，tile 389 → 388）
            shiftTallGate(st, this.doorX, this.doorY, true, () => game.playSfx('door_close', 0.8, this.cx, this.cy));
          }
        }
        this.closeDoor = false;
      }
      return;
    }
    // 撞门开门：前方碰撞点是关着的普通门（10）或高门（388）
    // （原版 54478-54500：Next(10)==0；普通门两方向回退，高门 ShiftTallGate(closing:false)）
    if (!this.hitWall) return;
    const fx = Math.floor((this.cx + this.facing * (this.w / 2 + 2)) / TILE);
    const fy = Math.floor((this.y + this.h - 8) / TILE);
    for (const dy of [0, -1]) {
      const x = fx, y = fy + dy;
      if (x < 1 || y < 1 || x >= st.w - 1 || y >= st.h - 1) continue;
      const t = st.type[st.idx(x, y)];
      if (Math.random() >= 0.1) return;   // 原版 Next(10)==0
      if (t === TILE_BY_KEY_DOOR_TILES['door_closed']) {
        const before = st.type[st.idx(x, y)];
        const opened = openDoor(st, x, y, this.facing) || openDoor(st, x, y, -this.facing);
        if (opened && before !== st.type[st.idx(x, y)]) {
          this.closeDoor = true;
          this.doorX = x; this.doorY = y;
          game.playSfx('door_open', 0.8, this.cx, this.cy);
        }
        return;
      }
      if (t === TILE_BY_KEY_DOOR_TILES['tall_gate_closed']) {
        const anchor = shiftTallGate(st, x, y, false, () => game.playSfx('door_open', 0.8, this.cx, this.cy));
        if (anchor) {
          this.closeDoor = true;
          this.doorX = anchor[0]; this.doorY = anchor[1];
        }
        return;
      }
    }
  }

  draw() { /* Renderer 统一绘制 */ }
}
