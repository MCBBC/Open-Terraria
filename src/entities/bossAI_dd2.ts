// DD2/旧日军团 + 沙漠族 AI 家族 1:1 移植（Terarria1456, 1.4.5.6）：
//   aiStyle 93  荷兰飞盗船 491            NPC.cs:40918-41028（首帧生成 4×荷兰大炮 492
//                                          （ai[0..3]=炮位,出生间隔 ai[3]=60*i）;炮全灭 →
//                                          StrikeNPCNoInteraction(9999) 自毁;1/300t 船口
//                                          跳海盗 212-215(vy-8.01);贴地巡航保持离地 350-450px;
//                                          SetDefaults dontTakeDamage=true :14581 → 炮在世恒无敌）
//   aiStyle 102 沙尘精 541                NPC.cs:42224-42620（walker 核 + ai[0] 攻击循环：
//                                          0→1 起手,54t 在玩家预测位（vx*30）±30 格放 ≤3 枚
//                                          沙暴标记 658（需 CanSpawnSandstormHostile 三列净空
//                                          ≥22 格,StrayMethods.cs:47;标记 damage 0 纯视觉,
//                                          Projectile.cs:6792 + aiStyle128 尘柱）;135t → -300
//                                          冷却;血 <50% knockBackResist=0）
//   aiStyle 103 沙鲨族 542-545            NPC.cs:42621-42805（沙/沙岩/硬化沙中巡游;碰撞走
//                                          Collision.AdvancedTileCollision(ForSandshark) :93812
//                                          ——沙族 tile 无视碰撞,其余照撞;玩家在上方且距 >150px
//                                          → 对准（目标-80px）12 速跃沙扑咬,30t 冷却（ai[2]）;
//                                          离沙 → 重力 0.3 落地爬行 ±1 速）
//   aiStyle 104 DD2AttackerTest 547       NPC.cs:42807-42809（active=false——出生即消,
//                                          原版内部测试残留物）
//   aiStyle 105 永恒水晶 548              NPC.cs:42810-43062（ai[1] 0: 首帧起 180t 倒计时 →
//                                          CheckArenaScore(StrayMethods.cs:83 SendWalker 双向
//                                          扫场)两端各送 1×神秘传送门 549（右门 ai[2]=1）;
//                                          1=败北演出（上浮渐隐 600t）/2=胜利演出（600t 尘涡）,
//                                          收场调 DD2Event.StopInvasion——事件依赖见下）
//   aiStyle 106 神秘传送门 549            NPC.cs:43063-43152（LaneSpawnRate 节拍出怪 →
//                                          DD2Event.SpawnMonsterFromGate;localAI[0] 满 180 且
//                                          水晶在世 → dontTakeDamage 驻守;水晶亡 → ai[1]=1,
//                                          500-600t scale 1→0.05 缩放消散,550t 自灭）
//   aiStyle 108 俯冲飞行族                NPC.cs:43157 → AI_108_DivingFlyer :65959
//          埃特尼亚飞龙 T1/T2/T3 558/559/560 + 小妖魔滑翔怪 T2/T3 574/575
//                                          （0 悬空逼近（LOS+下视野门,ai[3] 120t 宽限）→
//                                           1 瞄准 num5 t（v×0.95,小妖魔 vy-0.1 点火）→
//                                           2 俯冲追踪（超时/低于 6 速 → 0;小妖魔 flag2=
//                                           撞实心块/贴目标 64px → 3 自爆 192² 伤 80）→
//                                           4 回旋（ai[1]=45,每 tick -3）;出生 60t 渐显 +
//                                           同族 0.05/0.1 分离）
//   aiStyle 109 黑暗魔法师 564/565        NPC.cs:43161 → AI_109_DarkMage :66392
//                                          （walker 核（与 102 同构,参数漂移：重力 0.05/
//                                           落速 0.2）+ 三连招循环 ai[1]: 0 暗影矢 675（97t,
//                                           ai[0]==32 发,14 速 40 伤）/ 1 治疗（127t,ai[0]=40/
//                                           48/56 在 ±240 格地面各放 674 → 1000px 内友军
//                                           +500×3,Projectile.cs:35510）/ 2 召骷髅 673（183t,
//                                           ai[0]==64 发,DD2Event.RaiseGoblins 事件依赖）;
//                                           招式选择：±600×±200 内受伤友军 <2 → 强制 2）
//   aiStyle 110 双足翼龙 Betsy 551        NPC.cs:43165 → AI_110_Betsy :62266
//                                          （0 入场 10t → 1 悬停 30t 按 ai[3] 八槽轮换选招：
//                                           2 风压冲 23 速（30t）/ 3 火焰吐息（40t 接位 →
//                                           687 喷焰 80t 横冲 10→20 速）/ 4 空袭（60t 接位 →
//                                           686 火球 ×6 每 10t + 60t 贴地掠射）/ 5 翻转俯冲
//                                           （60t,32 速螺旋 +0.1 升降）/ 6 召唤（贴水晶 350px
//                                           或 180t → 90t 内 ai[1]=20/45/70 各召 560×(1+门数3));
//                                           ai[3]==5 且 1/3 概率 → 追加二次 5;选完 ai[3]+1
//                                           （≥8 回 0）;rotation 每态 AngleTowards 目标角）
//   aiStyle 111 埃特尼亚荧光虫 578        NPC.cs:43169 → AI_111_DD2LightningBug :66799
//                                          （0.96 阻尼悬停,LOS 内静止蓄电：localAI[0] 满 5 →
//                                           发 682 电弧（50 伤 10 速,±25px 抖动 + 双重
//                                           ±0.5%/±0.625% 速度扰动）,-30t 冷却;目标在上/
//                                           埋块 → vy-0.2 上浮;出生 60t 渐显 + 同族分离）
// 勘误（任务卡普查映射 vs 1456 原文逐一核实）：
//   - 574/575 小妖魔滑翔怪是 aiStyle 108（AI_108_DivingFlyer 的 KoboldFlyer 档,
//     flag2=true 撞块自爆）,不是 111;578 荧光虫才是 111。
//   - 547=104（DD2AttackerTest,出生即消）/548=105（永恒水晶）/549=106（神秘传送门）,
//     与普查一致;549 的"入场语义"= 105 水晶 180t 倒计时后由 CheckArenaScore 双端放置。
//   - 飞龙 T1-3（558-560）与普通飞龙族（aiStyle 6 蠕虫链）无共用——DD2 飞龙是单体
//     俯冲飞行族（AI_108）,不生成体段。
//   - 541 沙尘精/542-545 沙鲨未被沙尘暴或其它批覆盖（Enemy.ts 此前落 default zombieAI,
//     沙尘暴刷怪器 VanillaSpawner.ts:1449 已在出 541 → 本批补 AI）。
// 去重：aiStyle 107（552-557/561-563/566-573/576/577 地面 walker 族）已由 Enemy.ts
//   case 107 chargerAI(game,p,1)（ImprovedWalkers 档）落位,本批不重复;492 荷兰大炮
//   aiStyle 75 → Enemy.ts case 75 分发进 bossAI_martian.martianSaucerPartAI,其顶部
//   转发本文件 dutchmanCannonAI（cs:35889-35904 锚船偏移 + :36008-36070 240t 装填炮击）。
// 事件依赖登记（任务约定：本批只做 AI 1:1,DD2Event 未移植。DD2_EVENT_HOOKS 占位,
//   Game 侧接线后自动生效,不接线按"无事件"语义运行）：
//   laneSpawnRate()/enemySpawningOnHold()/spawnMonsterFromGate()（106 出怪节拍）、
//   raiseGoblins()/canRaiseGoblinsHere()（109 召骷髅）、stopInvasion()（105 胜负收场）、
//   reportLoss()（105 败北）、findArenaHitbox()（105）、difficulty()（DD2 难度档,默认 1）。
//   DD2 敌怪索敌语义（NPCUtils.cs:261/:308）：场上有水晶 548 → 咬水晶;否则咬玩家。
// 弹幕贴图：Projectile_{240,675,682,686,687}.png 已入 sprites/vanilla 管线（见
//   shootD 上方注记）；658/673/674 三枚 0 伤效果弹无弹体（粒子降级）,速度/伤害/节拍 1:1。
import type { Enemy } from './Enemy';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { spawnPart, losClear } from './bossAI';
import { Arrow } from './Arrow';
import { TILE_DEFS } from '../data/tiles';

// 弹幕贴图:Projectile_{240,675,682,686,687}.png 已自 terraria-assets/Images 入
// sprites/vanilla 管线(scripts/vanilla-atlas.mjs MISC 表),Arrow 按 projId 懒加载真图——
// RENDER_PROXY 代渲登记退役。687 喷焰原版为 Main.cs:31282 自定义 15 层火舌程序化
// 绘制,此处按整条贴图(98×686 单帧)近似;682 电弧 4 帧竖条(projFrames=4,Main.cs:8482)
// 同按整条绘制。
/** 原版 localAI[0..3]（Enemy 只有 ai0-ai3 对应 ai[],localAI 独立 → WeakMap 落盘） */
const localAI = new WeakMap<Enemy, number[]>();
/** 491 渲染帧源（localAI[3] 0..63 循环，:40971-40974）——渲染侧只读访问 */
export const dutchmanAnim = (e: Enemy): number => localAI.get(e)?.[3] ?? 0;

export const dd2LocalAI = (e: Enemy): number[] => {
  let a = localAI.get(e);
  if (!a) { a = [0, 0, 0, 0]; localAI.set(e, a); }
  return a;
};
/** 原版 oldVelocity（碰撞前一帧速度,cs:93795 collideX/collideY 判定源）→ WeakMap */
const oldVel = new WeakMap<Enemy, { x: number; y: number }>();

const TAU = Math.PI * 2;
const rnd = (n: number): number => Math.floor(Math.random() * n);
const rndRange = (a: number, b: number): number => a + Math.floor(Math.random() * (b - a));
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);
/** Utils.GetLerpValue(clamped) */
const lerpValue = (a: number, b: number, v: number): number =>
  b === a ? (v < a ? 0 : 1) : clamp((v - a) / (b - a), 0, 1);
/** MathHelper.AngleTowards：最短弧步进 */
const angleTowards = (cur: number, tgt: number, maxStep: number): number => {
  let d = tgt - cur;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  if (Math.abs(d) <= maxStep) return tgt;
  return cur + sign(d) * maxStep;
};

// ---------------------------------------------------------------------------
// DD2Event 事件依赖占位（Game 未接线 → 全部按"无事件"语义:不出怪/不召骷髅/
// 胜负演出不触发事件收场）。Game 接线示例：
//   DD2_EVENT_HOOKS.spawnMonsterFromGate = (g, x, y, left) => ...
//
// ★ 事件本体接线登记（2026-08-12 收尾批精确登记，未实现）——依赖清单：
//   1. 状态机宿主：Terraria.GameContent.Events/DD2Event.cs 全文（_downedGoblins、
//      OngoingDifficulty、LaneSpawnRate/UpdateTime/UpdateSpawns/SpawnMonsterFromGate
//      :556、RaiseGoblins :732、FindArenaHitbox、StopInvasion/ReportLoss）。
//      本仓落位建议 src/world/OldOnesArmy.ts（状态机/波次表已有：enemiesForWave/
//      pointsWorth/checkProgress/updateTime/startInvasion/stopInvasion 全 1:1），
//      缺的是"以太水晶放置物 612 站上水晶 548 → startInvasion"的触发链与
//      Game 每 tick 的 updateTime/checkProgress 驱动。
//   2. 触发链：物品 3827/3828/3829（三档魔杖）放 Stand 466（ElderCrystalStand，ItemCheck 系）+
//      Stand 上交互 → 放水晶 NPC 548（ETowerCrystalCheck，Projectile 660）→
//      事件 30t 后开波（DD2Event.cs TimeCRotate 到点开打）。
//   3. 九钩子接线位：Game.ts 每 tick 驱动 + 下方 DD2_EVENT_HOOKS 赋值：
//      laneSpawnRate/enemySpawningOnHold/spawnMonsterFromGate（106 出怪节拍）、
//      raiseGoblins/canRaiseGoblinsHere（109 召骷髅）、stopInvasion/reportLoss
//      （105 胜负收场）、findArenaHitbox（105）、difficulty（DD2 难度档）。
//   4. 产出收益：酒保 579 敷援链（docs/spawn-parity-gaps.md 登记）、
//      ShouldDropCrystals 3822（NPCLoot :80084 已读 DD2Event 位）、
//      readyForTier2/Tier3（OldOnesArmy.ts 已有）。
// ---------------------------------------------------------------------------
export const DD2_EVENT_HOOKS = {
  /** DD2Event.LaneSpawnRate（默认 60,:59） */
  laneSpawnRate: (): number => 60,
  /** DD2Event.EnemySpawningIsOnHold（波间间歇,:113） */
  enemySpawningOnHold: (): boolean => false,
  /** DD2Event.SpawnMonsterFromGate（:556,按 OngoingDifficulty 分表） */
  spawnMonsterFromGate: null as null | ((g: GameHooks, x: number, y: number, leftGate: boolean) => void),
  /** DD2Event.RaiseGoblins（:732,从 _deadGoblinSpots 复活骷髅） */
  raiseGoblins: null as null | ((g: GameHooks, x: number, y: number) => void),
  /** DD2Event.CanRaiseGoblinsHere（:715,800px 内 ≥3 处尸点才可召） */
  canRaiseGoblinsHere: (_g: GameHooks, _x: number, _y: number): boolean => false,
  /** DD2Event.StopInvasion（胜负收场） */
  stopInvasion: null as null | ((g: GameHooks, win: boolean) => void),
  /** DD2Event.ReportLoss */
  reportLoss: null as null | ((g: GameHooks) => void),
  /** DD2Event.FindArenaHitbox */
  findArenaHitbox: null as null | ((g: GameHooks) => void),
  /** DD2Event.OngoingDifficulty（1/2/3,T1/T2/T3） */
  difficulty: (): number => 1,
};

// ---------------------------------------------------------------------------
// 弹幕：ProjectileID.cs：240 CannonballHostile（荷兰大炮炮弹,14 速-5 上抛）/
// 658 SandnadoHostileMark（沙暴标记,damage 0 纯视觉尘柱）/ 673 DD2DarkMageRaise
//（召骷髅阵眼,0 伤）/ 674 DD2DarkMageHeal（治疗脉动,落地 40t 后 1000px 内友军
// +500,0 伤）/ 675 DD2DarkMageBolt（暗影矢 14 速 40 伤）/ 682 DD2LightningBugZap
//（电弧 10 速 50 伤）/ 686 DD2BetsyFireball（空袭火球,继承机速）/ 687
// DD2BetsyFlameBreath（喷焰,10 速横冲）。
// 伤害弹（240/675/682/686/687）走 Arrow 真图（RENDER_PROXY 已退役）;三枚 0 伤
// 效果弹（658/673/674）不生成弹体——Arrow 命中敌怪会 hurt(0)（假命中音+0 伤害数字）
// 且瞬间耗尽 pierce,与原版"纯视觉/纯疗效"语义相反 → 降级为粒子（674 疗效已由
// darkMageAI 在节拍帧直接结算）。
// ---------------------------------------------------------------------------
function shootD(
  game: GameHooks, x: number, y: number, vx: number, vy: number,
  dmg: number, projId: number, life = 300, grav = 0, pierce = 1,
): void {
  (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
    new Arrow(x, y, vx, vy, dmg, 0, projId, null, { grav, life, pierce, hostile: true }),
    'projectiles');
}

// ---------------------------------------------------------------------------
// tile 辅助
// ---------------------------------------------------------------------------
/** vanilla tile sheet id → 内部 tile id（TILE_DEFS 下标;同 SceneMetrics.SHEET_MAP 建法） */
const SHEET = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i];
  if (d?.vanilla && !SHEET.has(d.vanilla.sheet)) SHEET.set(d.vanilla.sheet, i);
}
const tileIds = (arr: number[]): Set<number> =>
  new Set(arr.map((n) => SHEET.get(n)).filter((v): v is number => v != null));
/** TileID.Sets.Conversion（TileID.cs:30-34）：Sand 53/112/116/234、HardenedSand
 *  397/398/402/399、Sandstone 396/400/403/401 */
const CONV_SAND = tileIds([53, 112, 116, 234]);
const CONV_HARDENED = tileIds([397, 398, 402, 399]);
const CONV_SANDSTONE = tileIds([396, 400, 403, 401]);
/** TileID.Sets.ForAdvancedCollision.ForSandshark（沙鲨碰撞豁免表,cs:93812） */
const SANDSHARK_PASS = tileIds([53, 112, 116, 234, 397, 398, 402, 399, 396, 400, 403, 401]);

const solidAt = (game: GameHooks, tx: number, ty: number): boolean => {
  const st = game.world.store;
  return st.inBounds(tx, ty) && st.isSolid(tx, ty);
};
const tileTypeAt = (game: GameHooks, tx: number, ty: number): number => {
  const st = game.world.store;
  return st.inBounds(tx, ty) ? st.type[st.idx(tx, ty)] : 0;
};
const liquidAt = (game: GameHooks, tx: number, ty: number): number => {
  const st = game.world.store;
  return st.inBounds(tx, ty) ? st.liquid[st.idx(tx, ty)] : 0;
};
/** 实心或有液体（原版 nactive()&&tileSolid || liquid>0 探测语义） */
const blockedAt = (game: GameHooks, tx: number, ty: number): boolean =>
  solidAt(game, tx, ty) || liquidAt(game, tx, ty) > 0;

/** Collision.ExpandVertically（Collision.cs:4403）：从 (x,y) 向上/下穿非实心格扩张 */
function expandVertically(
  game: GameHooks, x: number, y: number, maxUp: number, maxDown: number,
): [number, number] {
  let top = y, bottom = y;
  for (let i = 0; i < maxUp; i++) {
    if (top <= 0 || top < 10) break;
    if (solidAt(game, x, top)) break;
    top--;
  }
  const st = game.world.store;
  for (let j = 0; j < maxDown; j++) {
    if (bottom >= st.h - 10) break;
    if (solidAt(game, x, bottom)) break;
    bottom++;
  }
  return [top, bottom];
}

/** StrayMethods.CanSpawnSandstormHostile（StrayMethods.cs:47）：三列各 ±15 格净空,
 *  内缩后竖向跨度 ≥20 格 */
function canSpawnSandstormHostile(game: GameHooks, tx: number, ty: number): boolean {
  for (let i = -1; i <= 1; i++) {
    const [top, bottom] = expandVertically(game, tx + i, ty, 15, 15);
    if (bottom - 1 - (top + 1) < 20) return false;
  }
  return true;
}

/** StrayMethods.SendWalker（StrayMethods.cs:115）：沿地面走向 direction,返回最远落脚点 */
function sendWalker(
  game: GameHooks, start: { x: number; y: number }, height: number, dir: number, maxDist: number,
): { x: number; y: number } {
  let px = start.x, py = start.y - 1;
  let covered = 0;
  let last = { x: px, y: py };
  for (let i = 0; i < maxDist; i++) {
    for (let j = 0; j < 3; j++) {
      if (!solidAt(game, px, py)) break;
      py--;                                     // 最多上爬 3 格脱出实心
    }
    const [topY, bottomY] = expandVertically(game, px, py, height, 2);
    const top = topY + 1, bottom = bottomY - 1;
    if (!solidAt(game, px, bottom + 1)) {
      // 落脚跨度下无地面：再探 6 格,仍悬空 → 停
      const [, b2] = expandVertically(game, px, bottom, 0, 6);
      if (!solidAt(game, px, b2)) break;
    }
    if (bottom - top < height - 1) break;       // 净空不足（walker 高 10）
    covered += dir;
    px += dir;
    py = bottom;
    last = { x: px, y: py };
    if (Math.abs(covered) >= maxDist) break;
  }
  return last;
}

/** StrayMethods.CheckArenaScore（StrayMethods.cs:83）：水晶落点双向 walker 扫场端点 */
export function checkArenaScore(
  game: GameHooks, cx: number, cy: number,
): { left: { x: number; y: number }; right: { x: number; y: number } } {
  const maxDist = 100; // Main.MaxWorldViewSize.X/16 的常见档（SendWalker 默认 100）
  const ptx = Math.floor(cx / TILE), pty = Math.floor(cy / TILE);
  const [, floorY] = expandVertically(game, ptx, pty, 0, 4);
  const start = { x: ptx, y: floorY };
  const l = sendWalker(game, start, 10, -1, maxDist);
  const r = sendWalker(game, start, 10, 1, maxDist);
  return { left: { x: l.x + 1, y: l.y }, right: { x: r.x - 1, y: r.y } };
}

// ---------------------------------------------------------------------------
// DD2 索敌（NPCUtils.TargetClosestOldOnesInvasion :261 / TargetClosestBetsy :308）：
// 场上有水晶 548 → 咬水晶;否则咬玩家
// ---------------------------------------------------------------------------
function findCrystal(game: GameHooks): Enemy | null {
  for (const n of game.enemies() as Enemy[]) {
    if (!n.dead && n.vanillaId === 548) return n;
  }
  return null;
}
function dd2Target(
  game: GameHooks, e: Enemy, player: Player | null,
): { x: number; y: number } | null {
  const crystal = findCrystal(game);
  if (crystal) return { x: crystal.cx, y: crystal.cy };
  if (player && !player.dead) return { x: player.cx, y: player.cy };
  void e;
  return null;
}

/** 原版 CS 直积分（noTileCollide 族） */
const fly = (e: Enemy): void => { e.x += e.vx; e.y += e.vy; };
/** 向目标方向单位向量（DirectionTo） */
function dirTo(e: Enemy, tx: number, ty: number): { x: number; y: number } {
  const dx = tx - e.cx, dy = ty - e.cy;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}
/** SimpleFlyMovement（NPC.cs:78100 原版逐轴步进,反向时双倍） */
function simpleFlyMove(e: Enemy, dvx: number, dvy: number, acc: number): void {
  if (e.vx < dvx) { e.vx += acc; if (e.vx < 0 && dvx > 0) e.vx += acc; }
  else if (e.vx > dvx) { e.vx -= acc; if (e.vx > 0 && dvx < 0) e.vx -= acc; }
  if (e.vy < dvy) { e.vy += acc; if (e.vy < 0 && dvy > 0) e.vy += acc; }
  else if (e.vy > dvy) { e.vy -= acc; if (e.vy > 0 && dvy < 0) e.vy -= acc; }
}

// ---------------------------------------------------------------------------
// AI_093 荷兰飞盗船 491（NPC.cs:40918-41028）
// ---------------------------------------------------------------------------
export function flyingDutchmanAI(e: Enemy, game: GameHooks, player: Player | null) {
  const x = dd2LocalAI(e);
  // ---- 首帧生成 4 炮（:40920-40936）：ai[0..3]=炮位 ai[3]=60*i 出生错峰 ----
  if (!e.bInit) {
    e.bInit = true;
    e.ai0 = -1; e.ai1 = -1; e.ai2 = -1; e.ai3 = -1;
    for (let i = 0; i < 4; i++) {
      const c = spawnPart(game, e, 492);
      if (c) {
        c.master = e;
        c.ai0 = e.id;      // 原版 ai[0] = 船 whoAmI（锚定引用）
        c.ai1 = i;         // 槽位 0-3（决定船体偏移 -122+68*i）
        c.ai2 = 0;
        c.ai3 = 60 * i;    // 装填错峰（:40928 60*num1464）
        c.despawnTimer = 600; // timeLeft = 600
        if (i === 0) e.ai0 = c.id;
        else if (i === 1) e.ai1 = c.id;
        else if (i === 2) e.ai2 = c.id;
        else e.ai3 = c.id;
      }
    }
  }
  e.despawnTimer = 750;    // netAlways：不入 CheckActive 消退（入侵旗舰）
  // ---- 炮位存活盘点（:40938-40957）：全灭 → 自毁 ----
  const slots = [e.ai0, e.ai1, e.ai2, e.ai3];
  const enemies = game.enemies() as Enemy[];
  let anyAlive = false;
  for (let i = 0; i < 4; i++) {
    const id = slots[i];
    if (id >= 0) {
      const c = enemies.find((n) => n.id === id);
      if (!c || c.dead || c.vanillaId !== 492) {
        if (i === 0) e.ai0 = -1; else if (i === 1) e.ai1 = -1;
        else if (i === 2) e.ai2 = -1; else e.ai3 = -1;
      } else anyAlive = true;
    }
  }
  if (!anyAlive) {
    e.iframes = 0;
    e.hp = 0;
    e.hurt(9999, 0, 0, game);   // StrikeNPCNoInteraction(9999) → 标准死亡管线
    return;
  }
  e.iframes = 2;   // SetDefaults dontTakeDamage=true（:14581）：炮在世恒无敌
  // ---- 海盗跳舱（:40959-40970）：1/300t 从船口弹射 212-215 ----
  if (rnd(300) === 0) {
    const p = spawnPart(game, e, [213, 215, 214, 212][rnd(4)]);
    if (p) {
      p.vx = (Math.random() - 0.5) * 5 + e.vx;
      p.vy = -8.01 + e.vy;
      p.despawnTimer = 600;
    }
  }
  // ---- 动画计数（:40971-40974 localAI[3] 64t 循环,渲染帧源） ----
  x[3] += 1;
  if (x[3] >= 64) x[3] = 0;
  // ---- 索敌（:40975 TargetClosest） ----
  const tx = player && !player.dead ? player.cx : e.cx;
  const ty = player && !player.dead ? player.cy : e.cy;
  if (player && !player.dead) e.facing = tx > e.cx ? 1 : -1;
  // ---- 贴地巡航（:40976-41005）：前方 10 格列扫描地面,保持离地 350-450px ----
  const st = game.world.store;
  const colX = clamp(Math.floor(e.cx / TILE) + sign(e.vx) * 10, 1, st.w - 2);
  const colY = Math.floor((e.y + e.h) / TILE);
  let n = 0;
  if (solidAt(game, colX, colY)) {
    n = 1;
  } else {
    for (; n < 150 && colY + n < st.h; n++) {
      if (solidAt(game, colX, colY + n)) { n--; break; }
    }
  }
  const gap = n * TILE;
  if (gap < 350) {
    let a = gap - 350;
    if (a < -4) a = -4;
    e.vy = lerp(e.vy, a, 0.05);
  } else if (gap > 450) {
    let a = gap - 350;
    if (a > 4) a = 4;
    e.vy = lerp(e.vy, a, 0.05);
  } else {
    e.vy *= 0.95;
  }
  // ---- 水平逼近（:41006-41010）：距 ≥300px 且未达 6 速 → 朝向 +0.06 ----
  const dxp = tx - e.cx;
  if (Math.abs(dxp) >= 300 && (Math.abs(e.vx) < 6 || sign(e.vx) !== e.facing)) {
    e.vx += e.facing * 0.06;
  }
  e.visAngle = e.vx * 0.025;                    // rotation = vx*0.025（:41011）
  e.facing = e.vx === 0 ? e.facing : -sign(e.vx); // spriteDirection = -sign(vx)（:41012）
  // ---- 船底烟尘（:41013-41024 dust 228） ----
  if (Math.random() < 0.5) {
    game.spawnParticles(
      e.cx + (Math.random() - 0.5) * (e.w - 70), e.y + e.h - 10,
      '#E06A24', 1, 0.4, { life: 40, grav: -0.02, damp: 0.94 });
  }
  moveAndCollide(e, game.world, e.vx, e.vy);
  void ty;
}

// ---------------------------------------------------------------------------
// 荷兰大炮 492（aiStyle 75 分发 → 此处;NPC.cs:35889-35904 锚定 + :36008-36070 炮击）
// ai[0]=船 id（master 引用）,ai[1]=槽位,ai[2]=瞄准帧,ai[3]=装填计数（出生 60*i）
// ---------------------------------------------------------------------------
export function dutchmanCannonAI(e: Enemy, game: GameHooks, player: Player | null) {
  const ship = e.master;
  if (!ship || ship.dead || ship.vanillaId !== 491) { e.dead = true; return; }
  e.despawnTimer = Math.max(e.despawnTimer, Math.min(ship.despawnTimer, 600));
  // ---- 锚船偏移（:35889-35899）：(-122+68*slot)×朝向镜像,-6,随船 rotation 旋转 ----
  const sd = ship.facing === 1 ? 1 : -1;
  const ox = (-122 + 68 * e.ai1) * (sd !== 1 ? 1 : -1);
  const oy = -6;
  const rot = ship.visAngle;
  const rx = ox * Math.cos(rot) - oy * Math.sin(rot);
  const ry = ox * Math.sin(rot) + oy * Math.cos(rot);
  e.vx = ship.vx; e.vy = ship.vy;
  e.x = ship.cx - e.w / 2 + rx;
  e.y = ship.cy - e.h / 2 + ry;
  e.visAngle = rot;
  e.facing = sd;
  // ---- 装填（:36010-36016）：ai[3] 数到 240（出生错峰） ----
  if (e.ai3 < 240) e.ai3 += 1;
  // ---- 炮击（:36018-36052）：LOS 通 → 装满即朝玩家发 240 炮弹（14 速,-5 上抛） ----
  if (player && !player.dead && losClear(game, e.x, e.y, player.x, player.y)) {
    if (e.ai3 >= 240) {
      e.ai3 = 0;
      const d = dirTo(e, player.cx, player.cy);
      let vx = d.x * 14, vy = d.y * 14 - 5;
      const v = Math.hypot(vx, vy);
      if (v > 0.001) { vx = (vx / v) * 14; vy = (vy / v) * 14; }
      else { vx = 0; vy = 14; }
      vy -= 5;
      shootD(game, e.cx, e.cy, vx, vy, 30, 240, 300, 0.25);
    } else {
      // 瞄准帧（8 向索引,:36054-36070 的 ai[2] 语义;渲染未接,仅保状态）
      let best = 0, bestD = Infinity;
      for (let k = 0; k < 8; k++) {
        const ax = e.cx + Math.cos(k * (-Math.PI / 4)) * 50;
        const ay = e.cy + Math.sin(k * (-Math.PI / 4)) * 50;
        const d = Math.hypot(ax - player.cx, ay - player.cy);
        if (d < bestD) { bestD = d; best = k; }
      }
      e.ai2 = (sd === 1 ? 9 - (best + 1) : best + 1);
    }
  } else if (e.ai2 !== 0) {
    e.ai2 = 0;
  }
}

// ---------------------------------------------------------------------------
// walker 共享核（AI_102 尾段 cs:42406-42620 与 AI_109 尾段 cs:66577-66797 逐行同构）
// x[0..2]=卡位锚点（localAI[0..2]）;p=族参数;castDamp>0 时施法僵直（v*=damp 后返回）
// ---------------------------------------------------------------------------
interface WalkerP {
  frontDepth: number;   // 前方探测行数（num1568/num）
  headClear: number;    // 头顶净空行数（num1569/num2,headScan 才生效）
  bottomDepth: number;  // 底部探测行数（num1570/num3）
  grav: number;         // 悬空重力（num1571/num4）
  maxFall: number;      // 落速钳（num1572/num5）
  upAccel: number;      // 贴地升速（num1573/num6,负值）
  maxUp: number;        // 升速钳（num1574/num7,负值）
  headScan: boolean;    // 头顶净空扫描（flag113/flag5;541/564/565 均关）
  maxH: number;         // 水平极速（num1575/num8）
  accelH: number;       // 水平加速（num1576/num9）
  maxV: number;         // 垂直极速（num1577/num10）
  accelV: number;       // 垂直加速（num1578/num11）
}
function walkerKernel(
  e: Enemy, game: GameHooks, player: Player | null,
  x: number[], p: WalkerP, castDamp: number,
): void {
  // ---- 卡位/跳墙（cs:42391-42426 / :66557-66592） ----
  if (e.justHit) x[2] = 0;
  let jump = false;   // flag109：主动跳
  if (x[2] >= 0) {
    let range = 16;
    let fx = false, fy = false;
    if (e.x > x[0] - range && e.x < x[0] + range) fx = true;
    else if ((e.vx < 0 && e.facing > 0) || (e.vx > 0 && e.facing < 0)) { fx = true; range += 24; }
    if (e.y > x[1] - range && e.y < x[1] + range) fy = true;
    if (fx && fy) {
      x[2] += 1;
      if (x[2] >= 30 && range === 16) jump = true;
      if (x[2] >= 60) {
        x[2] = -180;
        e.facing *= -1;
        e.vx *= -1;
        e.hitWall = false;
      }
    } else {
      x[0] = e.x; x[1] = e.y; x[2] = 0;
    }
    if (player && !player.dead) e.facing = e.seekDirX(player);  // TargetClosest
  } else {
    x[2] += 1;
    if (player && !player.dead) e.facing = e.seekDirX(player);
  }
  // ---- 施法僵直（cs:42387-42389 / :66554-66555）：AI 早退但碰撞步照跑 ----
  if (castDamp > 0) {
    e.vx *= castDamp;
    e.vy *= castDamp;
    oldVel.set(e, { x: e.vx, y: e.vy });
    moveAndCollide(e, game.world, e.vx, e.vy);
    if (e.hitWall) e.vx = 0;
    if (e.onGround || e.hitHead) e.vy = 0;
    return;
  }
  // ---- 前方/底部/头顶探测（cs:42428-42475 / :66594-66651） ----
  const frontX = Math.floor((e.x + e.w / 2) / TILE) + e.facing * 2;
  const frontY = Math.floor((e.y + e.h) / TILE);
  const bottomY = Math.floor((e.y + e.h) / TILE);
  const bottomX = Math.floor((e.x + e.w / 2) / TILE);
  let onSurface = true;   // flag111：悬空（无支撑）
  let nearFloor = false;  // flag112：贴地
  for (let ty = frontY; ty < frontY + p.frontDepth; ty++) {
    if (blockedAt(game, frontX, ty)) {
      if (ty <= frontY + 1) nearFloor = true;
      onSurface = false;
      break;
    }
  }
  for (let ty = bottomY; ty < bottomY + p.bottomDepth; ty++) {
    if (blockedAt(game, bottomX, ty)) {
      nearFloor = true;
      onSurface = false;
      break;
    }
  }
  if (p.headScan) {
    for (let ty = frontY - p.headClear; ty < frontY; ty++) {
      if (blockedAt(game, frontX, ty)) {
        nearFloor = false;
        jump = true;
        break;
      }
    }
  }
  if (jump) { nearFloor = false; onSurface = true; }
  // ---- 重力/升力（cs:42477-42495 / :66653-66671） ----
  if (onSurface) {
    e.vy += p.grav;
    if (e.vy > p.maxFall) e.vy = p.maxFall;
  } else {
    if ((e.dirY < 0 && e.vy > 0) || nearFloor) e.vy += p.upAccel;
    if (e.vy < p.maxUp) e.vy = p.maxUp;
  }
  // ---- 碰撞反弹（cs:42497-42519 / :66673-66695;oldVelocity=碰撞前速度） ----
  const ov = oldVel.get(e) ?? { x: e.vx, y: e.vy };
  if (e.hitWall) {
    e.vx = ov.x * -0.4;
    if (e.facing === -1 && e.vx > 0 && e.vx < 1) e.vx = 1;
    if (e.facing === 1 && e.vx < 0 && e.vx > -1) e.vx = -1;
  }
  if (e.onGround || e.hitHead) {
    e.vy = ov.y * -0.25;
    if (e.vy > 0 && e.vy < 1) e.vy = 1;
    if (e.vy < 0 && e.vy > -1) e.vy = -1;
  }
  // ---- 朝向加速（cs:42521-42559 / :66697-66735;方向档速度模型） ----
  if (e.facing === -1 && e.vx > -p.maxH) {
    e.vx -= p.accelH;
    if (e.vx > p.maxH) e.vx -= p.accelH;
    else if (e.vx > 0) e.vx += p.accelH / 2;
    if (e.vx < -p.maxH) e.vx = -p.maxH;
  } else if (e.facing === 1 && e.vx < p.maxH) {
    e.vx += p.accelH;
    if (e.vx < -p.maxH) e.vx += p.accelH;
    else if (e.vx < 0) e.vx -= p.accelH / 2;
    if (e.vx > p.maxH) e.vx = p.maxH;
  }
  if (e.dirY === -1 && e.vy > -p.maxV) {
    e.vy -= p.accelV;
    if (e.vy > p.maxV) e.vy -= p.accelV * 1.25;
    else if (e.vy > 0) e.vy += p.accelV * 0.75;
    if (e.vy < -p.maxV) e.vy = -p.maxH;
  } else if (e.dirY === 1 && e.vy < p.maxV) {
    e.vy += p.accelV;
    if (e.vy < -p.maxV) e.vy += p.accelV * 1.25;
    else if (e.vy < 0) e.vy -= p.accelV * 0.75;
    if (e.vy > p.maxV) e.vy = p.maxV;
  }
  // ---- 碰撞（原版 Collision_MoveNormal 零速语义:撞轴清零该轴速度） ----
  oldVel.set(e, { x: e.vx, y: e.vy });
  moveAndCollide(e, game.world, e.vx, e.vy);
  if (e.hitWall) e.vx = 0;
  if (e.onGround || e.hitHead) e.vy = 0;
}

// ---------------------------------------------------------------------------
// AI_102 沙尘精 541（NPC.cs:42224-42620）
// ---------------------------------------------------------------------------
export function sandElementalAI(e: Enemy, game: GameHooks, player: Player | null) {
  if (!e.bInit) { e.bInit = true; e.ai0 = 0; }
  const x = dd2LocalAI(e);
  // ---- 族参数（:42225-42243 默认档 → :42246-42252 的 541 覆盖） ----
  const p: WalkerP = {
    frontDepth: 4, headClear: 3, bottomDepth: 3,
    grav: 0.1, maxFall: 2, upAccel: -0.1, maxUp: -4,
    headScan: false,
    maxH: 2, accelH: 0.1, maxV: 1, accelV: 0.04,
  };
  e.visAngle = e.vx * 0.04;                       // rotation = vx*0.04（:42249）
  // 血量越低越快（:42255-42257 num1575/num1576 随亏血加成）+ 半血免击退（:42258-42261）
  const ratio = e.hp / e.maxHp;
  p.maxH += (1 - ratio) * 2;
  p.accelH += (1 - ratio) * 0.02;
  e.def.knockbackResist = ratio < 0.5 ? 0 : e.def.knockbackResist; // def 存承受比例：0=免疫
  // ---- 攻击循环（:42263-42389） ----
  let castDamp = 0;
  if (e.ai0 < 0) e.ai0 = Math.min(e.ai0 + 1, 0);   // 冷却回摆（:42267-42269）
  if (e.ai0 > 0) {
    castDamp = 0.96;                                // flag114 → 施法僵直 ×0.96
    e.ai0 += 1;
    if (e.ai0 >= 135) { e.ai0 = -300; }             // 135t → -300 冷却（:42273-42276）
    if (e.ai0 === 54 && player && !player.dead) {
      // 玩家预测位 ±30 格找 ≤3 个落点放沙暴标记 658（:42300-42342）
      const px = player.cx + player.vx * 30;
      const py = player.cy;
      if (Math.hypot(px - e.cx, py - e.cy) < 2000) {
        const ptx = Math.floor(px / TILE), pty = Math.floor(py / TILE);
        const picks: Array<{ x: number; y: number }> = [];
        for (let t = 0; t < 1000 && picks.length < 3; t++) {
          const col = rndRange(ptx - 30, ptx + 31);
          if (picks.some((q) => Math.abs(q.x - col) < 10)) continue;
          const startY = pty - 20;
          const [, bottomY] = expandVertically(game, col, startY, 1, 51);
          const my = bottomY - 15;
          if (canSpawnSandstormHostile(game, col, my)) picks.push({ x: col, y: my });
        }
        for (const q of picks) {
          // 658 沙暴标记：原版 damage 0 纯视觉（尘柱 900t）——粒子代,不生成弹体
          game.spawnParticles(q.x * TILE + 8, q.y * TILE + 8, '#E0A050', 8, 1.4, { life: 60, grav: -0.06 });
        }
      } else {
        e.ai0 = -200;                               // 太远 → 缩短冷却（:42344-42347）
      }
    }
  }
  if (e.ai0 === 0) e.ai0 = 1;                       // 起手（:42387-42389）
  walkerKernel(e, game, player, x, p, castDamp);
}

// ---------------------------------------------------------------------------
// 沙鲨碰撞（Collision.AdvancedTileCollision + ForSandshark,cs:93808-93814）：
// 沙族 tile 无视碰撞,其余照撞;撞轴清零该轴速度并置 collideX/collideY 旗标。
// 湿身另按 UpdateCollision 的 Collision_MoveWhileWet 缩位移（:93762 waterMovementSpeed
// =0.5,542-545 不在 DD2/612/613 全速豁免表）——视水为可穿沙介质但移动仍半速
// ---------------------------------------------------------------------------
function moveSandShark(e: Enemy, game: GameHooks, vx: number, vy: number): void {
  const st = game.world.store;
  // NPC.Collision_MoveWhileWet（:93986）：velocity 不变,只缩位移
  const lf = e.liqFactor;
  if (lf !== undefined && lf !== 1) { vx *= lf; vy *= lf; }
  const passable = (tx: number, ty: number): boolean => {
    if (!st.inBounds(tx, ty)) return false;
    return st.isSolid(tx, ty) && !SANDSHARK_PASS.has(st.type[st.idx(tx, ty)]);
  };
  e.hitWall = false; e.onGround = false; e.hitHead = false;
  // X 轴
  const nx = e.x + vx;
  if (vx !== 0) {
    const d = sign(vx);
    const edge = d > 0 ? nx + e.w : nx;
    const tx = Math.floor(edge / TILE);
    const y0 = Math.floor(e.y / TILE);
    const y1 = Math.floor((e.y + e.h - 0.01) / TILE);
    let hit = false;
    for (let ty = y0; ty <= y1; ty++) {
      if (passable(tx, ty)) { hit = true; break; }
    }
    if (hit) { e.hitWall = true; e.vx = 0; } else e.x = nx;
  }
  // Y 轴
  const ny = e.y + vy;
  if (vy !== 0) {
    const d = sign(vy);
    const edge = d > 0 ? ny + e.h : ny;
    const ty = Math.floor(edge / TILE);
    const x0 = Math.floor(e.x / TILE);
    const x1 = Math.floor((e.x + e.w - 0.01) / TILE);
    let hit = false;
    for (let tx = x0; tx <= x1; tx++) {
      if (passable(tx, ty)) { hit = true; break; }
    }
    if (hit) {
      if (d > 0) e.onGround = true; else e.hitHead = true;
      e.vy = 0;
    } else {
      e.y = ny;
    }
  }
}

// ---------------------------------------------------------------------------
// AI_103 沙鲨族 542-545（NPC.cs:42621-42805）
// ---------------------------------------------------------------------------
export function sandSharkAI(e: Enemy, game: GameHooks, player: Player | null) {
  if (!e.bInit) { e.bInit = true; e.ai0 = 1; e.ai1 = 0; e.ai2 = 0; e.dirY = 1; }
  const x = dd2LocalAI(e);
  if (e.facing === 0) e.facing = player ? e.seekDirX(player) : -1;   // :42625-42627
  // ---- 在沙判定（:42629-42634）：中心格是沙族 tile（须 nactive）或湿 ----
  // flag119 |= wet：沙鲨视水为沙——水中同样进入巡游/扑咬态（水豁免,原版 :42634）
  const ctx = Math.floor(e.cx / TILE), cty = Math.floor(e.cy / TILE);
  const st0 = game.world.store;
  const sandMedium = (t: number, tx: number, ty: number): boolean =>
    (CONV_SAND.has(t) || CONV_SANDSTONE.has(t) || CONV_HARDENED.has(t))
    && st0.inBounds(tx, ty) && st0.isActive(tx, ty);    // 原文 tileSafely7.nactive()
  const isSandTile = sandMedium(tileTypeAt(game, ctx, cty), ctx, cty);
  const inSand = isSandTile || e.inWater;
  // ---- 扑咬门（:42637-42642 flag120）：玩家在上方（vy 不上升）且距 >150px ----
  const tgt = player && !player.dead ? { x: player.cx, y: player.cy } : null;
  const canLunge = !!tgt
    && player!.vy > -0.1
    && Math.hypot(tgt!.x - e.cx, tgt!.y - e.cy) > 150;
  if (x[0] === -1 && !inSand) x[0] = 20;           // 跃出后落回非沙 → 短冷却（:42643-42645）
  if (x[0] > 0) x[0] -= 1;
  if (inSand) {
    // ---- 沙中巡游（:42652-42745） ----
    e.ai2 = Math.min(e.ai2 + 1, 30);               // 扑咬回充（:42660-42662）
    if (canLunge) {
      e.facing = tgt!.x > e.cx ? 1 : -1;            // TargetClosest
      e.vx += e.facing * 0.15;
      e.vy += e.dirY * 0.15;
      e.vx = clamp(e.vx, -5, 5);
      e.vy = clamp(e.vy, -3, 3);
      // 前方是否仍是沙（:42677-42689）：中心+速度方向×体半径+速度
      const vv = Math.hypot(e.vx, e.vy);
      const ax = e.cx + (vv > 0 ? e.vx / vv : 0) * Math.hypot(e.w, e.h) / 2 + e.vx;
      const ay = e.cy + (vv > 0 ? e.vy / vv : 0) * Math.hypot(e.w, e.h) / 2 + e.vy;
      const at = tileTypeAt(game, Math.floor(ax / TILE), Math.floor(ay / TILE));
      let aheadSand = sandMedium(at, Math.floor(ax / TILE), Math.floor(ay / TILE));
      // 水豁免（:42696-42699）：前方非沙且自身湿 → 前方有液体即视为仍在介质中
      if (!aheadSand && e.inWater) aheadSand = liquidAt(game, Math.floor(ax / TILE), Math.floor(ay / TILE)) > 0;
      const range = 400;
      if (!aheadSand && sign(e.vx) === e.facing
        && Math.hypot(tgt!.x - e.cx, tgt!.y - e.cy) < range
        && (e.ai2 >= 30 || e.ai2 < 0)) {
        if (x[0] === 0) x[0] = -1;                 // 出沙音效节拍（:42704-42707）
        e.ai2 = -30;
        const d = dirTo(e, tgt!.x, tgt!.y - 80);   // 跃沙扑咬 12 速（:42708-42711）
        e.vx = d.x * 12;
        e.vy = d.y * 12;
      }
    } else {
      // 沙下巡航（:42713-42745）：撞轴反弹 + 蛇形升降
      if (e.hitWall) { e.vx *= -1; e.facing *= -1; }
      if (e.onGround || e.hitHead) {
        e.vy *= -1;
        e.dirY = sign(e.vy) || 1;
        e.ai0 = e.dirY;
      }
      e.vx += e.facing * 0.1;
      if (e.vx < -6 || e.vx > 6) e.vx *= 0.95;
      // 贴沙探测（flag121,:42655-42659）：采样 = (Center+(0,24)).ToTileCoordinates().Y − 2
      // ——即中心行或其上一行（反编译表达式原样,非"下方 24px"）;水中巡游时该处非沙 →
      // ai[0]=1 下潜回沙
      const bt = tileTypeAt(game, ctx, Math.floor((e.cy + 24) / TILE) - 2);
      const floorNear = sandMedium(bt, ctx, Math.floor((e.cy + 24) / TILE) - 2);
      e.ai0 = floorNear ? -1 : 1;
      const osc = 0.06, step = 0.01;
      if (e.ai0 === -1) {
        e.vy -= step;
        if (e.vy < -osc) e.ai0 = 1;
      } else {
        e.vy += step;
        if (e.vy > osc) e.ai0 = -1;
      }
      if (e.vy > 0.4 || e.vy < -0.4) e.vy *= 0.95;
    }
  } else {
    // ---- 离沙（:42747-42763）：重力下落 + 贴地爬行 ----
    if (e.vy === 0 && canLunge) e.facing = tgt!.x > e.cx ? 1 : -1;
    if (e.vy === 0) {
      e.vx += e.facing * 0.1;
      if (e.vx < -1 || e.vx > 1) e.vx *= 0.95;
    }
    e.vy += 0.3;
    if (e.vy > 10) e.vy = 10;
    e.ai0 = 1;
  }
  // ---- 俯仰角（:42765-42772 rotation=vy*dir*0.1 钳 ±0.2） ----
  e.visAngle = clamp(e.vy * e.facing * 0.1, -0.2, 0.2);
  moveSandShark(e, game, e.vx, e.vy);
}

// ---------------------------------------------------------------------------
// AI_104 DD2AttackerTest 547（NPC.cs:42807-42809）——原版即 active=false
// ---------------------------------------------------------------------------
export function dd2AttackerTestAI(e: Enemy, game: GameHooks): void {
  void game;
  e.dead = true;
}

// ---------------------------------------------------------------------------
// AI_105 永恒水晶 548（NPC.cs:42810-43062）
// ai[1] 0=倒计时+放门 / 1=败北演出 / 2=胜利演出（后两者依赖 DD2Event 触发）
// ---------------------------------------------------------------------------
export function eterniaCrystalAI(e: Enemy, game: GameHooks, player: Player | null) {
  if (!e.bInit) { e.bInit = true; e.ai0 = 0; e.ai1 = 0; }
  const x = dd2LocalAI(e);
  e.despawnTimer = 750;   // netAlways：不参与离屏消退
  if (e.spawnAlpha === 0) e.lightRGB = [1.3, 0.5, 1.5];   // :42813-42816
  void player;
  if (e.ai1 === 0) {
    // ---- 倒计时 + 双端放门（:42818-42845） ----
    if (e.ai0 > 0) e.ai0 -= 1;
    if (e.ai0 !== 0) return;
    e.ai0 = 180;
    if (x[0] === 0) {
      x[0] = 1;
      const ends = checkArenaScore(game, e.cx, e.y + e.h);
      ends.left.x += 2; ends.right.x -= 2;        // :42832-42833
      for (const [end, gate] of [[ends.left, 0], [ends.right, 1]] as const) {
        const portal = spawnPart(game, e, 549);
        if (portal) {
          portal.ai0 = 0; portal.ai1 = 0;
          portal.ai2 = gate;                      // 右门 ai[2]=1（leftGate 判定源）
          portal.x = end.x * TILE + 8 - portal.w / 2;
          portal.y = end.y * TILE + 16 - portal.h; // Bottom = 端点 ToWorldCoordinates(8,16)
        }
      }
      DD2_EVENT_HOOKS.findArenaHitbox?.(game);    // DD2Event.FindArenaHitbox（:42841）
    }
  } else if (e.ai1 === 2) {
    // ---- 胜利演出（:42846-42958,依赖 DD2Event 置 ai[1]=2） ----
    e.iframes = 2;                                 // dontTakeDamageFromHostiles + 满血
    e.hp = e.maxHp;
    if (e.ai0 === 3) {
      for (const n of game.enemies() as Enemy[]) {
        if (!n.dead && n.vanillaId === 549) { n.ai1 = 1; n.ai0 = 0; }
      }
      game.spawnParticles(e.cx, e.cy - 40, '#B0FFD0', 24, 3, { life: 60 });
    }
    e.ai0 += 1;
    if (e.ai0 <= 120) {
      // 升空小回旋（:42866-42873）
      e.vy = Math.cos((e.ai0 / 120) * TAU) * 0.25 - 0.25;
    } else {
      e.vy = 0;
    }
    // 尘涡（:42894-42958 的 264 号白尘双环,粒子近似）
    if (e.ai0 < 540 && Math.random() < 0.6) {
      const a = Math.random() * TAU;
      game.spawnParticles(
        e.cx + Math.cos(a) * (110 + Math.random() * 600),
        e.cy - 20 + Math.sin(a) * (110 + Math.random() * 600),
        '#FFFFFF', 1, 0.5, { life: 40 });
    }
    if (e.ai0 >= 600) {
      DD2_EVENT_HOOKS.stopInvasion?.(game, true);  // DD2Event.StopInvasion(win:true)
      e.iframes = 0;
      e.hp = 0;
      e.hurt(9999, 0, 0, game);
    }
  } else if (e.ai1 === 1) {
    // ---- 败北演出（:42959-43061,依赖 DD2Event.ReportLoss） ----
    e.iframes = 2;
    e.hp = e.maxHp;
    if (e.ai0 === 0) {
      for (const n of game.enemies() as Enemy[]) {
        if (!n.dead && n.vanillaId === 549) { n.ai1 = 1; n.ai0 = 0; }
      }
      DD2_EVENT_HOOKS.reportLoss?.(game);
      game.spawnParticles(e.cx, e.cy - 40, '#FF6A6A', 24, 3, { life: 60 });
    }
    e.ai0 += 1;
    if (e.ai0 < 96) e.vy = lerp(0, -1, e.ai0 / 96);   // :42993-42997 上浮
    if (e.ai0 >= 96) e.spawnAlpha = Math.min(255, e.spawnAlpha + 50);  // 渐隐
    if (Math.random() < 0.6) {
      const a = Math.random() * TAU;
      game.spawnParticles(
        e.cx + Math.cos(a) * (70 + Math.random() * 600),
        e.cy - lerp(0, 70, lerpValue(0, 300, e.ai0)) + Math.sin(a) * 40,
        '#FFB0B0', 1, 0.5, { life: 40 });
    }
    if (e.ai0 >= 600) {
      DD2_EVENT_HOOKS.stopInvasion?.(game, false);
      e.iframes = 0;
      e.hp = 0;
      e.hurt(9999, 0, 0, game);
    }
  }
}

// ---------------------------------------------------------------------------
// AI_106 神秘传送门 549（NPC.cs:43063-43152）
// ai[2]=0 左门/1 右门;ai[1] 0=开门出怪（事件依赖）→ 1=缩放消散
// ---------------------------------------------------------------------------
export function lanePortalAI(e: Enemy, game: GameHooks, player: Player | null) {
  if (!e.bInit) { e.bInit = true; e.ai0 = 0; e.ai1 = 0; e.ai2 = e.ai2 === 1 ? 1 : 0; }
  const x = dd2LocalAI(e);
  const leftGate = e.ai2 === 0;
  e.despawnTimer = 750;   // netAlways
  if (e.spawnAlpha === 0) e.lightRGB = [0.5, 0.1, 0.3];   // :43066-43068
  void player;
  const crystal = findCrystal(game);
  if (crystal) e.iframes = 2;   // SetDefaults dontTakeDamage=true（:15987）
  if (e.ai1 === 0) {
    // ---- 开门出怪（:43071-43116） ----
    if (x[0] === 0) {
      game.playSfx('portal', 0.5, e.cx, e.cy);    // DD2_EtherianPortalOpen（:43073）
    }
    if (!DD2_EVENT_HOOKS.enemySpawningOnHold()) e.ai0 += 1;
    const rate = DD2_EVENT_HOOKS.laneSpawnRate();
    if (e.ai0 >= rate * 3) e.ai0 = 0;             // :43085-43088 三拍归零
    if (e.ai0 % rate === 0) {
      DD2_EVENT_HOOKS.spawnMonsterFromGate?.(game, e.cx, e.y + e.h, leftGate);
    }
    x[0] += 1;
    if (x[0] > 180) x[0] = 180;
    if (x[0] >= 180) {
      if (crystal) return;                        // 水晶在世 → 驻守（:43109-43113）
      e.ai1 = 1;                                  // 水晶亡 → 开始消散
      e.ai0 = 0;
    }
  } else if (e.ai1 === 1) {
    // ---- 缩放消散（:43118-43146） ----
    e.ai0 += 1;
    e.vanillaScale = lerp(1, 0.05, lerpValue(500, 600, e.ai0));
    if (e.ai0 >= 550) {
      e.iframes = 0;
      e.hp = 0;
      e.hurt(9999, 0, 0, game);
    }
  }
}

// ---------------------------------------------------------------------------
// AI_108 俯冲飞行族（NPC.cs:43157 → AI_108_DivingFlyer :65959）
// 558/559/560 埃特尼亚飞龙 T1/T2/T3 + 574/575 小妖魔滑翔怪 T2/T3
// ---------------------------------------------------------------------------
interface FlyerP {
  kbMult: number; hoverUp: number; range: number; approach: number; aimT: number;
  damp: number; jitter: number; diveSpeed: number; recoverLerp: number; diveDist: number;
  steerLerp: number; speedAdd: number; minSpeed: number; explode: boolean; fade: boolean;
  grav: number; sep: number;
}
function flyerParams(id: number): FlyerP {
  // 默认档（:65986-66002,本族无默认成员,保留作基线）
  const base: FlyerP = {
    kbMult: 0.4, hoverUp: 200, range: 750, approach: 30, aimT: 30, damp: 0.95,
    jitter: 50, diveSpeed: 14, recoverLerp: 30, diveDist: 100, steerLerp: 20,
    speedAdd: 0, minSpeed: 7, explode: false, fade: false, grav: 0, sep: 0.05,
  };
  if (id === 558 || id === 559 || id === 560) {
    // 飞龙档（:66004-66022）
    return {
      ...base,
      kbMult: id === 558 ? 0.7 : id === 559 ? 0.5 : 0.2,
      hoverUp: 400, range: 500, approach: 90, aimT: 20,
      jitter: 0, diveSpeed: 8, diveDist: 150, steerLerp: 60,
      speedAdd: 0.05, minSpeed: 6, explode: false, fade: true, grav: 0,
    };
  }
  // 小妖魔滑翔怪档（:66024-66042）
  return {
    ...base,
    kbMult: id === 575 ? 0.4 : 0.6,
    hoverUp: 400, range: 500, approach: 90, aimT: 30,
    jitter: 3, diveSpeed: 8, diveDist: 150, steerLerp: 10,
    speedAdd: 0.05, minSpeed: 0, explode: true, fade: true, grav: -0.1, sep: 0.05,
  };
}

export function divingFlyerAI(e: Enemy, game: GameHooks, player: Player | null) {
  if (!e.bInit) { e.bInit = true; e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
  const x = dd2LocalAI(e);
  const p = flyerParams(e.vanillaId ?? 0);
  const LOS_GRACE = 120;   // num14（:66003）
  // ---- 出生渐显（:66062-66092 flag5） ----
  if (p.fade) {
    if (x[0] === 0) e.spawnAlpha = 255;
    if (x[0] === 30) game.playSfx('spawn', 0.4, e.cx, e.cy); // DD2_EtherianPortalSpawnEnemy
    if (x[0] < 60) {
      x[0] += 1;
      e.spawnAlpha = Math.max(0, e.spawnAlpha - 5);
      e.alphaFade = false;   // 接管 fromVanilla 的通用渐显（原版由本 AI 驱动）
    }
  }
  // ---- 索敌（:66044 NPCUtils.TargetClosestOldOnesInvasion） ----
  const tgt = dd2Target(game, e, player);
  // ---- 同族分离（:66094-66116 flag4） ----
  for (const n of game.enemies() as Enemy[]) {
    if (n === e || n.dead || n.vanillaId !== e.vanillaId) continue;
    if (Math.abs(e.x - n.x) + Math.abs(e.y - n.y) < e.w) {
      if (e.x < n.x) e.vx -= p.sep; else e.vx += p.sep;
      if (e.y < n.y) e.vy -= p.sep; else e.vy += p.sep;
    }
  }
  // ---- 朝向与俯仰（:66118-66130） ----
  e.visAngle = Math.atan2(e.vy, e.vx);
  if (sign(e.vx) !== 0) e.facing = -sign(e.vx);
  if (e.visAngle < -Math.PI / 2) e.visAngle += Math.PI;
  if (e.visAngle > Math.PI / 2) e.visAngle -= Math.PI;
  if (!tgt) { fly(e); return; }
  const txc = tgt.x, tyc = tgt.y;
  const LOS = losClear(game, e.cx, e.cy, txc, tyc);
  const speedAdd = p.speedAdd * p.steerLerp;   // num12 *= num11（:66132）
  if (e.ai0 === 0) {
    // ---- 悬空逼近（:66134-66190） ----
    // 原版：vector = normalize(Δ)*num（逼近速:飞龙 3/小妖魔 4）;vector2 = normalize(vector-(0,num2))*num
    const num = e.vanillaId === 574 || e.vanillaId === 575 ? 4 : 3;
    const dx = txc - e.cx, dy = tyc - e.cy;
    const dist = Math.hypot(dx, dy);
    const ux = dist > 0 ? dx / dist : 0, uy = dist > 0 ? dy / dist : 0;
    const vx1 = ux * num, vy1 = uy * num;
    let hvx = vx1, hvy = vy1 - p.hoverUp;
    const hl = Math.hypot(hvx, hvy) || 1;
    hvx = (hvx / hl) * num;
    hvy = (hvy / hl) * num;
    let los = LOS;
    if (e.ai3 >= LOS_GRACE) los = true;            // 120t 视线宽限（:66152-66154）
    const ang = Math.atan2(uy, ux);
    los = los && ang > Math.PI / 8 && ang < Math.PI - Math.PI / 8;  // 下视野门（:66156-66158）
    if (dist > p.range || !los) {
      e.vx = (e.vx * (p.approach - 1) + hvx) / p.approach;
      e.vy = (e.vy * (p.approach - 1) + hvy) / p.approach;
      if (tyc < e.cy) {
        e.vy -= 0.2;
        if (e.vy < -10) e.vy = -10;
      }
      if (!los) {
        e.ai3 += 1;                                 // 视线中断计数（:66170-66179）
      } else {
        e.ai3 = 0;
      }
    } else {
      e.ai0 = 1;                                    // 进入瞄准（:66181-66186）
      e.ai2 = vx1;
      e.ai3 = vy1;
    }
  } else if (e.ai0 === 1) {
    // ---- 瞄准（:66192-66232） ----
    e.vx *= p.damp;
    e.vy *= p.damp;
    e.vy += p.grav;                                 // 小妖魔下沉点火（num16）
    e.ai1 += 1;
    if (e.ai1 === p.aimT) {
      // 俯冲音（:66202-66222,DD2_WyvernDiveDown / KoboldFlyerChargeScream）
      game.playSfx('roar', 0.25, e.cx, e.cy);
    }
    if (e.ai1 >= p.aimT) {
      e.ai0 = 2;
      e.ai1 = 0;
      let jx = e.ai2 + rndRange(-p.jitter, p.jitter + 1) * 0.04;
      let jy = e.ai3 + rndRange(-p.jitter, p.jitter + 1) * 0.04;
      const jl = Math.hypot(jx, jy) || 1;
      jx = (jx / jl) * p.diveSpeed;
      jy = (jy / jl) * p.diveSpeed;
      e.vx = jx; e.vy = jy;
    }
  } else if (e.ai0 === 2) {
    // ---- 俯冲追踪（:66234-66296） ----
    e.ai1 += 1;
    const dist = Math.hypot(txc - e.cx, tyc - e.cy);
    let past = dist > p.diveDist && e.cy > tyc;     // 冲过目标下方（flag7）
    if (p.explode) past = false;                    // flag3：小妖魔不提前收（:66248）
    if ((e.ai1 >= p.recoverLerp && past) || Math.hypot(e.vx, e.vy) < p.minSpeed) {
      e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
      e.vx /= 2; e.vy /= 2;
      e.ai1 = 45;                                   // flag=true：回旋态（:66260-66264）
      e.ai0 = 4;
    } else {
      const dx = txc - e.cx, dy = tyc - e.cy;
      const d = Math.hypot(dx, dy) || 1;
      const spd = Math.hypot(e.vx, e.vy);
      e.vx = (e.vx * (p.steerLerp - 1) + (dx / d) * (spd + speedAdd)) / p.steerLerp;
      e.vy = (e.vy * (p.steerLerp - 1) + (dy / d) * (spd + speedAdd)) / p.steerLerp;
    }
    // 撞实心块 → 自爆（:66288-66294,flag2 仅小妖魔）
    if (p.explode && solidBody(game, e)) { e.ai0 = 3; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
  } else if (e.ai0 === 4) {
    // ---- 回旋（:66298-66308） ----
    e.ai1 -= 3;
    if (e.ai1 <= 0) { e.ai0 = 0; e.ai1 = 0; }
    e.vx *= 0.95;
    e.vy *= 0.95;
  }
  // ---- 贴身自爆（:66316-66324,flag2 仅小妖魔,距目标 <64px） ----
  if (p.explode && e.ai0 !== 3 && Math.hypot(txc - e.cx, tyc - e.cy) < 64) {
    e.ai0 = 3; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
  }
  if (e.ai0 === 3) {
    // ---- 自爆（:66326-66380）：扩盒 192²、伤 80、3t 后消散 ----
    e.x = e.cx; e.y = e.cy;
    e.w = 192; e.h = 192;
    e.x -= e.w / 2; e.y -= e.h / 2;
    e.vx = 0; e.vy = 0;
    e.def.damage = 80;                              // GetAttackDamage_ScaledByDifficulty(80)
    e.spawnAlpha = 255;
    if (e.ai1 === 0) {
      game.spawnParticles(e.cx, e.cy, '#FFD24A', 20, 4, { life: 30, grav: -0.05 });
      game.spawnParticles(e.cx, e.cy, '#FF9A3C', 12, 3, { life: 40 });
    }
    e.ai1 += 1;
    if (e.ai1 >= 3) {
      game.playSfx('explosion', 1, e.cx, e.cy);     // SoundID.Item14
      game.spawnParticles(e.cx, e.cy, '#FFB060', 30, 5, { life: 36 });
      e.dead = true;                                // 原版 life=0 + active=false（不走掉落管线）
    }
    return;
  }
  fly(e);
}

/** 身体任意角/中心埋实心块（Collision.SolidCollision 近似） */
function solidBody(game: GameHooks, e: Enemy): boolean {
  const pts = [
    [e.x + 2, e.y + 2], [e.x + e.w - 2, e.y + 2],
    [e.x + 2, e.y + e.h - 2], [e.x + e.w - 2, e.y + e.h - 2],
    [e.cx, e.cy],
  ];
  return pts.some(([px, py]) => solidAt(game, Math.floor(px / TILE), Math.floor(py / TILE)));
}

// ---------------------------------------------------------------------------
// AI_109 黑暗魔法师 564/565（NPC.cs:43161 → AI_109_DarkMage :66392）
// ---------------------------------------------------------------------------
export function darkMageAI(e: Enemy, game: GameHooks, player: Player | null) {
  if (!e.bInit) { e.bInit = true; e.ai0 = 0; e.ai1 = 0; }
  const x = dd2LocalAI(e);
  const p: WalkerP = {
    frontDepth: 4, headClear: 3, bottomDepth: 2,
    grav: 0.05, maxFall: 0.2, upAccel: -0.05, maxUp: -0.4,
    headScan: false,
    maxH: 0.5, accelH: 0.1, maxV: 0.5, accelV: 0.02,
  };
  const tgt = dd2Target(game, e, player);
  const txc = tgt ? tgt.x : e.cx, tyc = tgt ? tgt.y : e.cy;
  // ---- 出生渐显（:66478-66508 localAI[3]） ----
  if (x[3] === 0) e.spawnAlpha = 255;
  if (x[3] === 30) game.playSfx('spawn', 0.4, e.cx, e.cy);
  if (x[3] < 60) {
    x[3] += 1;
    e.spawnAlpha = Math.max(0, e.spawnAlpha - 5);
    e.alphaFade = false;
    if (Math.random() < 0.2) {
      game.spawnParticles(e.cx, e.cy, '#B080FF', 1, 0.6, { life: 30 });
    }
  }
  e.visAngle = e.vx * 0.04;                        // rotation = vx*0.04（:66415）
  let castDamp = 0;
  if (e.ai0 < 0) e.ai0 = Math.min(e.ai0 + 1, 0);   // 招间冷却（:66421-66423）
  if (e.ai0 > 0) {
    castDamp = 0.9;                                 // num12=0.9 施法僵直（:66427）
    e.ai0 -= 1;                                     // 注：109 是递减（102 递增）
    // 召骷髅（:66431-66435）：ai[1]==2 且 ai[0]==64 → 673 阵眼 + RaiseGoblins
    if (e.ai1 === 2 && e.ai0 === 64) {
      DD2_EVENT_HOOKS.raiseGoblins?.(game, e.cx, e.cy);
      game.spawnParticles(e.cx + e.facing * 24, e.cy - 40, '#C060FF', 10, 2, { life: 40 });
    }
    // 暗影矢（:66437-66446）：ai[1]==0 且 ai[0]==32 → 675（14 速 40 伤）
    if (e.ai1 === 0 && e.ai0 === 32) {
      const ox = e.cx + e.facing * 10, oy = e.cy - 16;
      const d = dirTo(e, txc, tyc);
      e.facing = d.x > 0 ? 1 : -1;
      shootD(game, ox, oy, d.x * 14, d.y * 14, 40, 675, 300);
    }
    // 治疗（:66453-66461）：ai[1]==1 且 ai[0]=40/48/56 → 674 落地脉动
    if (e.ai1 === 1 && (e.ai0 === 40 || e.ai0 === 48 || e.ai0 === 56)) {
      const gx = Math.floor((e.cx + e.facing * 240) / TILE);
      const gy = Math.floor(e.cy / TILE);
      const [, bottom] = expandVertically(game, gx, gy, 0, 50);
      game.spawnParticles(gx * TILE + 8, bottom * TILE, '#FF7AE0', 8, 1.6, { life: 50 });
      // Projectile 674 落地 40t 后的疗效（Projectile.cs:35544-35570）：1000px 内友军
      // （伤 ≥1、lifeMax ≥30、非 564/565）各 +500（封顶补满）——事件投射物系统未实装,
      // 疗效在此直接落地（时序 40t 差以 ±8t 粒度近似并入三连发节拍）
      for (const n of game.enemies() as Enemy[]) {
        if (n === e || n.dead || n.vanillaId === 564 || n.vanillaId === 565) continue;
        if (n.def.damage < 1 || n.maxHp < 30) continue;
        if (Math.hypot(n.cx - e.cx, n.cy - e.cy) > 1000) continue;
        const heal = Math.min(500, n.maxHp - n.hp);
        if (heal > 0) {
          n.hp += heal;
          game.addDamageNumber(n.cx, n.cy - 10, -heal, false, '#7CFF6A');
        }
      }
    }
    if (e.ai0 <= 0) {
      // 招式轮换（:66463-66474）：0→1→2→0;非 0 招后冷却 -120,0 招后 -20
      const prev = e.ai1;
      e.ai1 += 1;
      if (e.ai1 >= 3) e.ai1 = 0;
      e.ai0 = prev === 0 ? -20 : -120;
    }
  }
  // ---- 招式选择（:66476-66484,ai[0]==0 且出生 60t 后） ----
  if (e.ai0 === 0 && x[3] >= 60) {
    let next = 0;
    // ±600×±200 内受伤友军 <2 → 强制召骷髅（:66478-66492）
    let hurt = 0;
    for (const n of game.enemies() as Enemy[]) {
      if (n.dead || n.hp >= n.maxHp) continue;
      if (Math.abs(n.cx - e.cx) <= 600 && Math.abs(n.cy - e.cy) <= 200) hurt++;
    }
    if (hurt < 2) next = 2;
    if (next === 2 && !DD2_EVENT_HOOKS.canRaiseGoblinsHere(game, e.cx, e.cy)) next = 0;
    let ok = true;                                   // flag9（:66494-66498）
    if (next === 0
      && (Math.hypot(txc - e.cx, tyc - e.cy) >= 1000
        || !losClear(game, e.cx, e.cy, txc, tyc))) ok = false;
    if (ok) {
      e.ai1 = next;
      e.ai0 = next === 0 ? 97 : next === 1 ? 127 : 183;   // :66500-66510
    }
  }
  walkerKernel(e, game, tgt ? { cx: txc, cy: tyc, dead: false } as unknown as Player : null, x, p, castDamp);
}

// ---------------------------------------------------------------------------
// AI_110 双足翼龙 Betsy 551（NPC.cs:43165 → AI_110_Betsy :62266）
// ---------------------------------------------------------------------------
export function betsyAI(e: Enemy, game: GameHooks, player: Player | null) {
  if (!e.bInit) { e.bInit = true; e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
  const x = dd2LocalAI(e);
  e.despawnTimer = 750;   // netAlways：不入 CheckActive 消退
  // 常量（:62277-62318）
  const DMG_BREATH = 35, DMG_FIREBALL = 35;
  const INTRO_T = 10, FLY_ACC = 0.45, FLY_SPD = 7.5;
  const HOVER_T = 30, WIND_T = 30, DIVE_SPD = 23;
  const FLAME_OFF = 600, FLAME_APPR = 12, FLAME_T0 = 40, FLAME_T1 = 80;
  const BOMB_OFF = 1500, BOMB_APR_T = 60, BOMB_ACC = 1 / 30, BOMB_SPD = 12;
  const FIREBALL_EVERY = 10, FIREBALL_N = 6 * FIREBALL_EVERY, TAIL_T = 60;
  const BOMB_TOTAL = BOMB_APR_T + FIREBALL_N + TAIL_T;
  const SPIN_T = 60, SPIN_RATE = TAU / SPIN_T, SPIN_RISE = 0.1, SKYDIVE_SPD = 32;
  const SUMMON_T = 90, SUMMON_AT = 20;
  // ---- 索敌（:62276 NPCUtils.TargetClosestBetsy）：水晶优先,否则玩家 ----
  const tgt = dd2Target(game, e, player);
  if (!tgt) {
    e.vy -= 0.05;
    fly(e);
    return;
  }
  const txc = tgt.x, tyc = tgt.y;
  let timeScale = 1;   // num2：各态动画步进倍率
  if (e.ai0 === 0) {
    // ---- 入场（:62321-62330） ----
    e.ai1 += 1;
    if (e.ai1 >= INTRO_T) { e.ai1 = 0; e.ai0 = 1; e.ai2 = 0; }
  } else if (e.ai0 === 1) {
    // ---- 悬停选招（:62332-62416） ----
    if (e.ai2 === 0) e.ai2 = e.cx < txc ? 1 : -1;
    const destX = txc - e.ai2 * 300, destY = tyc - 200;
    const d = dirTo(e, destX, destY);
    simpleFlyMove(e, d.x * FLY_SPD, d.y * FLY_SPD, FLY_ACC);
    e.facing = e.cx < txc ? 1 : -1;
    e.ai1 += 1;
    if (e.ai1 >= HOVER_T) {
      // ai[3]==5 且 1/3 概率 → 追加一轮（:62344-62347）
      if (e.ai3 === 5 && rnd(3) === 0) e.ai3 += 1;
      let next = 1;                                  // :62349-62370 八槽表
      const s = e.ai3 | 0;
      if (s === 0 || s === 1 || s === 3) next = 2;
      else if (s === 2) next = 3;
      else if (s === 4) next = 4;
      else if (s === 5) next = 5;
      else if (s === 6) next = 3;
      else if (s === 7) next = 6;
      e.ai0 = next;
      e.ai1 = 0; e.ai2 = 0;
      e.ai3 += 1;
      if (e.ai3 >= 8) e.ai3 = 0;
      if (next === 2 || next === 5) {
        // 直冲起手（:62373-62400）：朝目标 23/32 速,rotation 对准
        const v = dirTo(e, txc, tyc);
        e.facing = v.x > 0 ? 1 : -1;
        e.visAngle = Math.atan2(v.y, v.x) + (e.facing === -1 ? Math.PI : 0);
        e.vx = v.x * (next === 2 ? DIVE_SPD : SKYDIVE_SPD);
        e.vy = v.y * (next === 2 ? DIVE_SPD : SKYDIVE_SPD);
      } else if (next === 3) {
        // 火焰吐息起手（:62402-62408）：反向 2 速退位
        const d3 = txc > e.cx ? 1 : -1;
        e.facing = d3;
        e.vx = -2 * d3;
        e.vy = 0;
      }
    }
  } else if (e.ai0 === 2) {
    // ---- 风压冲（:62418-62427） ----
    if (e.ai1 === 0) game.playSfx('roar', 0.3, e.cx, e.cy);   // DD2_BetsyWindAttack
    e.ai1 += 1;
    if (e.ai1 >= WIND_T) { e.ai0 = 1; e.ai1 = 0; e.ai2 = 0; }
  } else if (e.ai0 === 3) {
    // ---- 火焰吐息（:62429-62487） ----
    e.ai1 += 1;
    e.ai2 = e.cx < txc ? 1 : -1;
    if (e.ai1 < FLAME_T0) {
      // 接位：目标反向 600px 上空（:62435-62447）
      const dx = txc - e.ai2 * FLAME_OFF, dy = tyc - 250;
      const d = dirTo(e, dx, dy);
      if (Math.hypot(dx - e.cx, dy - e.cy) < FLAME_APPR) {
        e.x = dx - e.w / 2; e.y = dy - e.h / 2;   // 原版 base.Center = vector4 直接贴位
      } else {
        e.x += d.x * FLAME_APPR;
        e.y += d.y * FLAME_APPR;
      }
      if (Math.hypot(dx - e.cx, dy - e.cy) < 16) e.ai1 = FLAME_T0 - 1;
      timeScale = 1.5;
    }
    if (e.ai1 === FLAME_T0) {
      // 喷焰起手（:62449-62461）：10 速横冲 + 687 喷焰
      const d3 = txc > e.cx ? 1 : -1;
      e.vx = d3 * 10;
      e.vy = 0;
      e.facing = d3;
      shootD(game, e.cx, e.cy, e.vx, e.vy, DMG_BREATH, 687, 300, 0, 20);
      game.playSfx('flames', 0.5, e.cx, e.cy);    // DD2_BetsyFlameBreath
    }
    if (e.ai1 >= FLAME_T0) {
      timeScale = 1.5;
      if (Math.abs(txc - e.cx) > 550 && Math.abs(e.vx) < 20) {
        e.vx += sign(e.vx) * 0.5;                  // 远距提速（:62465-62469）
      }
    }
    if (e.ai1 >= FLAME_T0 + FLAME_T1) { e.ai0 = 1; e.ai1 = 0; e.ai2 = 0; }
  } else if (e.ai0 === 4) {
    // ---- 空袭（:62489-62583） ----
    e.ai2 = e.cx < txc ? 1 : -1;
    if (e.ai1 < BOMB_APR_T) {
      // 高位接位（:62493-62509）：反向 1500px、-350 上空
      const dx = txc - e.ai2 * BOMB_OFF, dy = tyc - 350;
      const d = dirTo(e, dx, dy);
      e.vx = lerp(e.vx, d.x * BOMB_SPD, BOMB_ACC);
      e.vy = lerp(e.vy, d.y * BOMB_SPD, BOMB_ACC);
      e.facing = e.cx < txc ? 1 : -1;
      if (Math.hypot(dx - e.cx, dy - e.cy) < 16) e.ai1 = BOMB_APR_T - 1;
      timeScale = 1.5;
    } else if (e.ai1 === BOMB_APR_T) {
      // 俯冲突进（:62511-62521）：12 速贴地掠射
      let v = dirTo(e, txc, tyc);
      v = { x: v.x, y: v.y * 0.25 };
      const vl = Math.hypot(v.x, v.y) || 1;
      v = { x: v.x / vl, y: v.y / vl };
      e.facing = v.x > 0 ? 1 : -1;
      e.visAngle = Math.atan2(v.y, v.x) + (e.facing === -1 ? Math.PI : 0);
      e.vx = v.x * BOMB_SPD;
      e.vy = v.y * BOMB_SPD;
    } else {
      // 掠射（:62523-62543）：水平 7/t、垂直 6/t 贴地,每 10t 投 686 火球 ×6
      const dTo = dirTo(e, txc, tyc);
      e.x += dTo.x * 7;
      e.y += dirTo(e, txc, tyc - 400).y * 6;
      if (e.ai1 <= BOMB_TOTAL - TAIL_T) timeScale = 1.5;
      const ox = (110 + 30) * e.facing, oy = 20;
      const rx = e.cx + ox * Math.cos(e.visAngle) - oy * Math.sin(e.visAngle);
      const ry = e.cy + ox * Math.sin(e.visAngle) + oy * Math.cos(e.visAngle);
      const n = Math.floor(e.ai1 - BOMB_APR_T + 1);
      if (n <= FIREBALL_N && n % FIREBALL_EVERY === 0) {
        shootD(game, rx, ry, e.vx, e.vy, DMG_FIREBALL, 686, 300, 0.08, 3);
      }
    }
    if (e.ai1 > BOMB_TOTAL - TAIL_T) e.vy -= 0.1;   // 尾段拉起（:62545-62547）
    e.ai1 += 1;
    if (e.ai1 >= BOMB_TOTAL) { e.ai0 = 1; e.ai1 = 0; e.ai2 = 0; }
  } else if (e.ai0 === 5) {
    // ---- 翻转俯冲（:62585-62604） ----
    const rot = -SPIN_RATE * e.facing;
    const c = Math.cos(rot), s = Math.sin(rot);
    const nvx = e.vx * c - e.vy * s;
    const nvy = e.vx * s + e.vy * c;
    e.vx = nvx; e.vy = nvy;
    e.y -= SPIN_RISE;
    const d = dirTo(e, txc, tyc);
    e.x += d.x * 10;
    e.y += d.y * 10;
    e.visAngle -= SPIN_RATE * e.facing;
    timeScale *= 0.7;
    if (e.ai1 === 1) game.playSfx('roar', 0.35, e.cx, e.cy);  // DD2_BetsyFlyingCircleAttack
    e.ai1 += 1;
    if (e.ai1 >= SPIN_T) {
      e.ai0 = 1; e.ai1 = 0; e.ai2 = 0;
      e.vx /= 2; e.vy /= 2;
    }
  } else if (e.ai0 === 6) {
    // ---- 召唤（:62606-62655） ----
    if (e.ai1 === 0) {
      // 贴水晶上空（:62608-62620）
      const d = dirTo(e, txc, tyc - 200);
      simpleFlyMove(e, d.x * FLY_SPD * 2, d.y * FLY_SPD * 2, FLY_ACC * 2);
      e.facing = e.cx < txc ? 1 : -1;
      e.ai2 += 1;
      if (Math.hypot(txc - e.cx, tyc - e.cy) < 350 || e.ai2 >= 180) e.ai1 = 1;
    } else {
      if (e.ai1 === 1) game.playSfx('roar', 0.5, e.cx, e.cy);  // DD2_BetsyScream
      if (e.ai1 < SUMMON_AT) { e.vx *= 0.95; e.vy *= 0.95; }
      else { e.vx *= 0.98; e.vy *= 0.98; }
      if (e.ai1 === SUMMON_AT) {
        if (e.vy > 0) e.vy /= 3;
        e.vy -= 3;                                   // 跃起（:62630-62634）
        game.spawnParticles(e.cx, e.cy + e.h / 2, '#C8A060', 26, 4, { life: 40 });
      }
      timeScale *= 0.85;
      // 召唤窗口（:62657-62696）：场上 560 ≤4 才召;自周 300px 环 + 传送门各出 560
      if (e.ai1 === SUMMON_AT || e.ai1 === 45 || e.ai1 === 70) {
        const wyverns = (game.enemies() as Enemy[])
          .filter((n) => !n.dead && n.vanillaId === 560).length;
        if (wyverns <= 4) {
          const a = Math.random() * TAU;
          const sx = e.cx + Math.cos(a) * 2 * 300 * (0.6 + Math.random() * 0.4);
          const sy = e.cy + Math.sin(a) * 1 * 300 * (0.6 + Math.random() * 0.4);
          if (Math.hypot(sx - txc, sy - tyc) > 100) {
            const w = spawnPart(game, e, 560);
            if (w) { w.x = sx - w.w / 2; w.y = sy - w.h / 2; }
          }
          const portals = (game.enemies() as Enemy[])
            .filter((n) => !n.dead && n.vanillaId === 549);
          for (let k = 0; k < 3 && portals.length > 0; k++) {
            const portal = portals[rnd(portals.length)];
            const w = spawnPart(game, e, 560);
            if (w) { w.x = portal.cx - w.w / 2; w.y = portal.cy - w.h / 2; }
          }
          game.playSfx('roar', 0.3, e.cx, e.cy);    // DD2_BetsySummon
        }
      }
      e.ai1 += 1;
    }
    if (e.ai1 >= SUMMON_T) { e.ai0 = 1; e.ai1 = 0; e.ai2 = 0; }
  }
  // ---- 拍翼帧计数（:62657-62666 localAI[0]/[1]） ----
  x[0] += timeScale;
  if (x[0] >= 36) x[0] = 0;
  x[1] += 1;
  if (x[1] >= 60) x[1] = 0;
  // ---- rotation 收敛（:62668-62716） ----
  const dTo = dirTo(e, txc, tyc);
  let tgtAng = Math.atan2(dTo.y, dTo.x);
  let step = 0.04;
  const s0 = e.ai0 | 0;
  if (s0 === 2 || s0 === 5) step = 0;
  else if (s0 === 3) {
    step = 0.01;
    tgtAng = e.facing === -1 ? -Math.PI : 0;
    if (e.ai1 >= FLAME_T0) { tgtAng += e.facing * Math.PI / 12; step = 0.05; }
  } else if (s0 === 4) {
    step = 0.01;
    tgtAng = e.facing === 1 ? Math.PI * 2 : Math.PI;
  } else if (s0 === 6) {
    step = 0.02;
    tgtAng = e.facing === -1 ? -Math.PI : 0;
  }
  if (e.facing === -1) tgtAng += Math.PI;
  if (step !== 0) e.visAngle = angleTowards(e.visAngle, tgtAng, step);
  fly(e);
}

// ---------------------------------------------------------------------------
// AI_111 埃特尼亚荧光虫 578（NPC.cs:43169 → AI_111_DD2LightningBug :66799）
// ---------------------------------------------------------------------------
export function dd2LightningBugAI(e: Enemy, game: GameHooks, player: Player | null) {
  if (!e.bInit) { e.bInit = true; }
  const x = dd2LocalAI(e);
  // 族参数（:66803-66813 默认档 → :66828-66844 的 578 覆盖）
  const SPEED = 4;            // num
  const LERP_FAR = 20;        // num2
  const LERP_NEAR = 20;       // num3
  const MIN_SPD = 1;          // num4
  const DAMP = 0.96;          // num5
  const SHOOT_T = 5;          // num6
  const COOLDOWN = 30;        // num7
  const RANGE = 200;          // num8
  const ZAP_DMG = 50;         // num9
  const ZAP_PROJ = 682;       // num10
  const ZAP_SPD = 10;         // num11
  const HEIGHT_GATE = 50;     // num12
  const SEP = 0.1;            // num13
  // ---- 出生渐显（:66846-66876 flag3） ----
  if (x[1] === 0) e.spawnAlpha = 255;
  if (x[1] === 30) game.playSfx('spawn', 0.3, e.cx, e.cy);
  if (x[1] < 60) {
    x[1] += 1;
    e.spawnAlpha = Math.max(0, e.spawnAlpha - 5);
    e.alphaFade = false;
  }
  // ---- 索敌（:66816 TargetClosestOldOnesInvasion） ----
  const tgt = dd2Target(game, e, player);
  // ---- 同族分离（:66878-66900 flag2,cs:66878-66900） ----
  for (const n of game.enemies() as Enemy[]) {
    if (n === e || n.dead || n.vanillaId !== e.vanillaId) continue;
    if (Math.abs(e.x - n.x) + Math.abs(e.y - n.y) < e.w) {
      if (e.x < n.x) e.vx -= SEP; else e.vx += SEP;
      if (e.y < n.y) e.vy -= SEP; else e.vy += SEP;
    }
  }
  e.visAngle = Math.abs(e.vx) * e.facing * 0.1;    // rotation（:66902）
  // ---- 电光尘（:66846-66862 的 272 号尘,粒子近似） ----
  if (Math.random() < 1 / 80) {
    const a = Math.random() * TAU;
    game.spawnParticles(e.cx, e.cy, '#B0E0FF', 2, 0.8, { life: 30 });
    void a;
  }
  if (!tgt) { fly(e); return; }
  const txc = tgt.x, tyc = tgt.y;
  const muzzleX = e.cx - e.facing * 20, muzzleY = e.cy + 10;   // center 偏移（:66841）
  const dx = txc - muzzleX, dy = tyc - muzzleY;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist, uy = dy / dist;
  const los = losClear(game, e.cx, e.cy, txc, tyc);
  if (x[0] < 0) x[0] += 1;                          // 冷却回摆（:66911-66912）
  if (dist > RANGE || !los) {
    // ---- 远距/断视：逼近（:66916-66918） ----
    e.vx = (e.vx * (LERP_FAR - 1) + ux * SPEED) / LERP_FAR;
    e.vy = (e.vy * (LERP_FAR - 1) + uy * SPEED) / LERP_FAR;
  } else if (dy < HEIGHT_GATE) {
    // ---- 目标高位差小：微升（:66920-66922） ----
    e.vy -= 0.03;
  } else if (x[0] >= 0) {
    // ---- 静止蓄电（:66924-66946） ----
    e.vx *= DAMP;
    e.vy *= DAMP;
    if (Math.hypot(e.vx, e.vy) < MIN_SPD) {
      x[0] += 1;
      if (x[0] >= SHOOT_T) {
        x[0] = -COOLDOWN;
        e.facing = ux > 0 ? 1 : -1;                 // direction = spriteDirection
        // 速度扰动（:66934-66944）：±25px 抖动 + 两级 ±0.5%/±0.625% 缩放
        let sx = dx + rndRange(-25, 26), sy = dy + rndRange(-25, 26);
        sx *= 1 + rndRange(-20, 21) * 0.005;
        sy *= 1 + rndRange(-20, 21) * 0.005;
        const sl = Math.hypot(sx, sy) || 1;
        sx = (sx / sl) * ZAP_SPD;
        sy = (sy / sl) * ZAP_SPD;
        sx *= 1 + rndRange(-20, 21) * (1 / 160);
        sy *= 1 + rndRange(-20, 21) * (1 / 160);
        shootD(game, muzzleX, muzzleY, sx, sy, ZAP_DMG, ZAP_PROJ, 300, 0, 3);
      }
    }
  }
  // ---- 上浮（:66950-66970）：目标在上或自身埋块 → vy-0.2 钳 -10 ----
  let rise = tyc < e.cy;
  if (!rise) {
    const etx = Math.floor(e.cx / TILE), ety = Math.floor(e.cy / TILE);
    if (solidAt(game, etx, ety)) rise = true;
  }
  if (rise) {
    e.vy -= 0.2;
    if (e.vy < -10) e.vy = -10;
  }
  fly(e);
}
