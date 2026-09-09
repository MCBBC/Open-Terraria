// 钓鱼浮标实体：抛竿抛物线 → 落水漂浮 → 咬钩窗口 → 收竿掷渔获。
// 原版 Projectile.AI_061_FishingBobber（1457 :54595-54803）1:1：
//   抛出抛物线；入液（水/蜜/岩浆）转漂浮（浮支物理 = GetWaterLine 液面回拉
//   :54699-54740/:54805-54833，settled 门 :54736-54739）；等待 = localAI[1] 累积器
//   （:54766-54784：每 tick += ⌊FinalFishingLevel/30⌋ + rand(1,3) + rand(300)<力 ? rand(1,3) : 0
//   + 1/60 概率 +60；>660 触发 FishingCheck）；
//   FishingCheck（:20703-20712）→ TryBuildFishingContext（:20714-20859，本实体
//   fishingCheck 内 1:1：水量/atmo 缩放/幸运度/heightLevel/junk/五档/任务鱼探测）
//   → 咬钩门 rand(100) <= ⌊(力+75)/2⌋ → SetFishingCheckResults（:20861-20924：
//   敌怪先掷、渔获后掷）→ FishDropRuleList 全量表掷渔获（FishDropRule.cs:31-51）；
//   咬钩窗口 = ai[1] 取 rand(-240,-90) - 力 的负值，每 tick += rand(1,5)（抖动踢+
//   湿三旗复位 :54785-54802），归零即逃脱（渔获作废，:54796-54801 / :20876/:20890）；
//   窗口内收竿 → 消耗鱼饵（消耗率 1/(1+bait/6)，钓具箱 +1 分母）；
//   饵 2673 松露虫渔情警告每拍写（:54754-54757,浮/飞两段同写——显示侧
//   Game.tickInfoAccs 只读粘性缓存）；浮支收敛尾 = XNA float32 语义（Math.fround
//   站点模拟——float64 尾撞 ULP64 墙晚 ~29 拍,咬钩重抖节拍翻倍,B1 定谳 2026-09-07）。
import { Entity } from './Entity';
import { projFrameImg } from './Arrow';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { GRAVITY, TILE } from '../core/constants';
import { Clock } from '../world/World';
import { moveAndCollide } from '../physics/TileCollision';
import { projectileWetSection, projWaterDragFactor } from './projWetSection';
import { projectileData } from '../data/vanillaProjectiles';
import { dustWaterFor } from '../render/WeatherRenderer';   // Dust.dustWater()（Dust.cs:405-421,waterStyle 映射）
import {
  fishingPowerMultiplier, rollDropLevels, rollJunk, heightLevelOf, prepareFishingContext,
  tryGetItemDrop, CAN_FISH_IN_LAVA_POLES, IS_LAVA_BAIT, ANGLER_QUEST_ITEMS,
  type ZoneInput,
} from '../data/vanillaFishing';
import { VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../data/items';
import { itemFuncOfVid } from '../data/vanillaItemFunc';
import vanillaRareJson from '../data/vanilla-itemrare.json';
import { chumsInTile } from './chumBucket';
import { VI_ID } from '../data/itemKeys';

/** 原版 rare 表（vanilla-itemrare.json,extract-itemrare.mjs）——垃圾渔获 rare<0 判定 */
const ITEM_RARE = vanillaRareJson as Record<string, number>;
import type { World } from '../world/World';
import { BuffType } from '../stats/Buffs';
import { Lang } from '../i18n/Lang';
import { drawFishingStringLine, stringColorOpts } from '../render/StringLine';
// FakeFish 钓鱼装饰鱼群（FakeFishParticle 移植;clientOnly 编排=纯本地不上网）
import {
  spawnFakeFishInWater, requestFakeFishSpawn, magnetFakeFish,
  pingFakeFish, pushAwayFakeFish, releaseCaughtFakeFish,
  type FakeFishLatchTarget,
} from './FakeFish';
import type { FishingRollCtx } from '../data/vanillaFishing';

type LiquidType = 'water' | 'lava' | 'honey';

// ---- AI_061 收线/断线常量（Projectile.cs:54635-54668 / :54701-54705，1456=1457=1458 同值）----
/** 玩家中心与浮漂中心距离 >900px → ai[0]=1 自动收线（:54703-54705） */
export const RETRACT_DIST = 900;
/** 收线飞行中距离 >3000px → 直接 Kill（:54656-54658） */
export const KILL_DIST = 3000;
/** 收线速度平滑窗 num=10（velocity = (v×9 + 目标)/10，:54659/:54663-54664） */
export const REEL_SMOOTH = 10;
/** 收线目标速度上限（方向归一 ×15.9 px/t，:54660） */
export const REEL_SPEED = 15.9;
/** 浮漂弹盒钉值（SetDefaults :4510-4520 width=height=14）——收线触玩家盒判定已改读
 *  真盒 w/h（同值 14）;常量保留为 SetDefaults 钉值导出（tests/fishing-rod-hold 直测） */
export const BOBBER_BOX = 14;

/** Main.rand.Next(min, max)（左闭右开） */
function nextInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min));
}

// ---- XNA float32 常量（C# 字面 0.9f/0.1f/0.015f/0.01f 的单精度值。运算前先对常量
//      fround 消双重舍入：fround(x×fround(0.9)) ≙ fl32(x*0.9f)，直写 fround(x*0.9)
//      是 fl64(x*0.9) 再舍入 ≠ 原版。B1 浮态收敛尾定谳 2026-09-07）----
const F32_09 = Math.fround(0.9);
const F32_01 = Math.fround(0.1);
const F32_015 = Math.fround(0.015);
const F32_001 = Math.fround(0.01);

/** 鱼竿物品 id → 浮标弹型（Item.cs SetDefaults :23001 `shoot = 361 + type - 2291`
 *  （竿 2291-2296 → 361-366）、2289 显式 360 / 4325 血肉竿 760 / 4442 热钓竿 775。
 *  ★5139-5146 不是钓竿而是【浮漂饰品】（Item.cs:41803-41840 DefaultToAccessory）——
 *  其弹型覆写走装备链 overrideFishingBobber（Player.UpdateFishingBobber :36244-36272
 *  → 986-993；ItemCheck :46551-46553 抛竿改用覆写值），不经本函数） */
export function bobberProjIdFor(poleVid: number): number {
  if (poleVid >= 2291 && poleVid <= 2296) return 361 + (poleVid - 2291);
  if (poleVid === 2289) return 360;
  // 血肉抛竿 2421 / 热线 2422（Item.cs:23074 共享块 shoot = 381 + type - 2421）
  // ——曾漏映射落到缺省 360（浮漂贴图/配对错竿，2026-08-25 R32 补）
  if (poleVid === 2421) return 381;
  if (poleVid === 2422) return 382;
  if (poleVid === 4325) return 760;
  if (poleVid === 4442) return 775;
  return 360;
}

interface PondState { lava: boolean; honey: boolean; waterTilesCount: number; chums: number }

/** GetFishingPondState（Projectile.cs:20170-20201；1458 :21699-21730 同构+chum 累计）
 *  1:1：先横向扩到水体边缘（GetFishingPondWidth :20203-20213，越界停于 10 / W-10），
 *  再逐列向下数液格（solid 或无液即停，越界停于 H-10）；蜂蜜池 ×1.5。
 *  ★R25-E10：逐水格累计 chum 注册面计数（:21721-21722
 *  `chumCount += GetChumsInLocation(tileCoords)`）——弹体 820 落点表见 chumBucket.ts。 */
function getFishingPondState(game: GameHooks, x: number, y: number): PondState {
  const st = (game.world as World).store;
  const liquidAt = (i: number, j: number) =>
    st.inBounds(i, j) ? st.liquid[st.idx(i, j)] : 0;
  let minX = x, maxX = x;                                     // :20205-20212
  while (minX > 10 && liquidAt(minX, y) > 0 && !st.isSolid(minX, y)) minX--;
  while (maxX < st.w - 10 && liquidAt(maxX, y) > 0 && !st.isSolid(maxX, y)) maxX++;
  let lava = false, honey = false, numWaters = 0, chums = 0;  // :21701-21704
  for (let i = minX; i <= maxX; i++) {                        // :20180-20194
    for (let j = y; st.inBounds(i, j) && liquidAt(i, j) > 0 && !st.isSolid(i, j) && j < st.h - 10; j++) {
      numWaters++;
      const lt = st.liquidType[st.idx(i, j)];
      if (lt === 2) lava = true;                              // tile.lava()
      else if (lt === 3) honey = true;                        // tile.honey()
      chums += chumsInTile(i, j);                             // :21722 池内逐格累计
    }
  }
  if (honey) numWaters = Math.floor(numWaters * 1.5);         // :20197-20200
  return { lava, honey, waterTilesCount: numWaters, chums };
}

export class Bobber extends Entity {
  // 弹盒 = SetDefaults（Projectile.cs:4510-4520,360-366/381/382/760/775 共块）
  // width=height=14——2026-09-06 残差批由 8×8 修 14×14;消费位逐面核对（湿段 WetCollision
  // 翻转点/doSplash 盒 w+12/渔线锚盒心·盒顶 10%/收线触玩家盒——均盒相对,随盒自适应,
  // 唯旧 BOBBER_BOX 常量代读改真盒,见 retract 段注）
  w = 14; h = 14;
  dead = false;
  /** 漂浮中（已落液） */
  floating = false;
  /** 咬钩窗口剩余 tick（>0 = 咬钩中，可收竿）。原版 ai[1] 的正值镜像
   *  （AI_061 :50918-50934：负值每 tick += rand(1,5)，归零 = 逃脱） */
  get biteT(): number { return this.ai1 < 0 ? Math.ceil(-this.ai1) : 0; }
  /** 咬钩时的渔获（声呐药水预掷展示） */
  catchId = 0;
  /** 松露虫咬钩标记（localAI[1]=1 语义，Projectile.cs:19219）——收竿召 Duke */
  truffleBite = false;
  /** 血月咬钩敌怪（FishingCheck_RollEnemySpawns）——收竿由 Game 侧生成 */
  catchEnemy = 0;
  /** 收竿带渔获镜像（Player.cs:53082 bobber.ai[1]=localAI[1],±id）——FakeFish
   *  CheckLatch 收线路（FakeFishParticle.cs:158-165）的配对判定源 */
  caughtVid = 0;
  /** 渔获原版 id → 钓起时落物用 */
  private polePower: number;
  poleVid = 0;
  /** 原版弹型（鱼竿→浮标映射，bobberProjIdFor；ProjLight 光由 Game 标量循环结算：
   *  987-993 七色浮漂 light=1×各乘区——曾在无 projId 下整族无光） */
  projId = 360;
  /** 鱼饵原版 id（IsLavaBait / CanFishInLava 三源判定用，1457: Projectile.cs:20758
   *  与空咬加速 :20896-20911;旧注 :19230/:19371-19382 系 1456 行号,SW-BJ44 订正） */
  baitVid = 0;
  private baitSlot: number;
  private baitPower: number;
  private ownerRef: () => Player | null;
  /** 绘制旋转缓存（AI_61 收线段 rotation=atan2(v)+π/2,:50833;静浮时保持末值） */
  private drawRot = 0;
  /** localAI[0]（AI_61 :50809-50811）：出竿后 0→100 渐增——钓线摆垂权重
   *  1−lai0/100（DrawProj_FishingLine :35173-35174）随时间收敛 */
  lai0 = 0;
  private airT = 0;
  /** ai[1]（AI_061）：0 = 等待累积中；<0 = 咬钩窗口（负值幅度 = rand(-240,-90) - 钓鱼力） */
  private ai1 = 0;
  /** localAI[1]：等待累积器（>660 触发 FishingCheck，:54779-54783） */
  private lAI1 = 0;
  /** localAI[2]（AI_061）：微光 Splash_2 一次门（:54693-54697 置 1）；咬钩时被
   *  SetFishingCheckResults 覆写为饵 vid（:20878/:20892）——ConsumeBait 的
   *  localAI[2] 消费本仓由 baitSlot 承载（ItemCheck_CheckFishingBobber_ConsumeBait
   *  :53093 槽位投影），本字段只服务微光音门生命周期（咬钩后 >0 → 微光音不再重播,
   *  与原版「每浮漂至多一声」同态） */
  private lai2 = 0;
  /** ai[0]（AI_061 :54635 起）：0=飞行/漂浮；1=收线中（PullFishingBobbers :53031 /
   *  超 900px :54704）；2=断线/敌怪收线（收线首 tick 播 Item17+溅水一次后自增 3，
   *  :54636-54645）。收线飞行 tileCollide=false 直移、触玩家盒即 Kill（:54666-54668） */
  retract = 0;
  /** 当前浮着液体（入液时登记；AI_061 wet/lavaWet/honeyWet 三位最小投影——
   *  收线断线溅水门 :54641-54644 岩浆/蜂蜜免溅用） */
  liquidKind: 'water' | 'lava' | 'honey' | null = null;

  // ---- ★通用湿段（Projectile.cs:16903-17113 全体弹共用段,2026-09-06 残差批接入;
  //  2026-09-05 溅花台账登记"浮漂入水声乱掷属通用弹湿段域"就此清偿）----
  //  豁免核对：SetDefaults :4510-4520（360-366/381/382/760/775 共块 w=h=14 aiStyle61
  //  bobber）无 ignoreWater 行 → 受段（360-366 是原版真弹非豁免）。溅花两支分野（勿混）：
  //  本湿段 = 入/出水【盒沿】触发 10 粒四液花 + Splash_1（:16948-16976/:17029-17031,
  //  出生盒沿第一次触液即溅）——AI_061_DoASplash（:54839-54852,收线断线/拉杆 100 粒
  //  Splash_0,doSplash 承载）是另一条独立原版支,并存不重复。
  //  位序：本调用在收线/飞行各支【之前】——收线相位（ai[0]>=1）原版无湿段豁免,
  //  出水溅花/位移阻尼在收线飞行同样成立（UpdatePosition :20557 每子步消费 wetVelocity）。
  //  浮漂 AI 侧 wet 旗消费面：漂浮门/微光 buff353（:54685-54698）与咬钩抖动三旗复位
  //  （:54791-54793）2026-09-06 二批已接（浮态段直读共享体旗——shimmerWet 真蕴含 wet,
  //  ≙ 原版嵌套门;湿段拍头 → 消费滞后原版一拍,位序登记）;收线免溅 :54641-54644 仍走
  //  liquidKind 投影（tests/player-bobber-splash-1457 桩直设 liquidKind,勿改旗读法）。
  wet = false;
  lavaWet = false;
  honeyWet = false;
  shimmerWet = false;
  /** 出水溅花冷却窗（Projectile.wetCount :16984 置 10 / :17109-17112 逐 update −1） */
  wetCount = 0;
  /** 出生预置已做（NewProjectile :10886-10892 等价;共享体首调用执行） */
  presetDone = false;
  /** 收线态只读（Game.reelBobber 尾部 Kill 门消费——原版收线非即时消失） */
  get retracting(): boolean { return this.retract >= 1; }

  constructor(
    x: number, y: number, vx: number, vy: number,
    polePower: number, baitSlot: number, baitPower: number,
    owner: () => Player | null,
  ) {
    super();
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.polePower = polePower;
    this.baitSlot = baitSlot;
    this.baitPower = baitPower;
    this.ownerRef = owner;
  }

  /** PlayerFishingConditions.FinalFishingLevel（Player.cs:41528-41557）1:1：
   *  饵力+竿力+钓鱼技能(药水 121 +15，Player.cs:9831) + 三项 +5 加成，再乘
   *  Fishing_GetPowerMultiplier（:41560-41604）。★幸运度不在此处——原版在
   *  TryBuildFishingContext 水量缩放**之后**才掷（:19267-19277），见 fishingCheck。
   *  canFloatInWater&&wet（:41546-41549）与坐姿（:41550-41553）两状态本仓未
   *  跟踪，对应 +5 未接（登记）；Tipsy +5 已接（:41542-41545）。 */
  private fishingPower(p: Player, game?: GameHooks): number {
    let base = this.polePower + this.baitPower + (p.buffs.has(BuffType.Fishing) ? 15 : 0)
      + p.equipStats.fishingSkill;
    // R14-E11：canFloatInWater（4404 水上漂/buff265 脚蹼药水）且 wet（水/蜜）才 +5
    // （:41546-41549）——曾用 waterWalk 族无 wet 门（陆地也加,且物品族错位）
    if (p.equipStats.canFloat && (p.inWater || p.inHoney)) base += 5;
    if ((p as unknown as { isSitting?: boolean }).isSitting) base += 5;  // 坐姿（:41550-41553）   // 装备侧渔力（钓具族+渔夫甲+软糖虫,:12549-12556/:13022-13027/:12451）
    if (p.buffs.has(BuffType.Tipsy)) base += 5;                  // buff 25 :41542-41545
    if (game) {
      const w = game.world as World;
      const t = w.clock.timeOfDay;
      const isDay = w.clock.isDay; // 昼夜边界以 Clock 为准（4:30/19:30）
      base = Math.floor(base * fishingPowerMultiplier({          // :41555-41556
        raining: !!w.weather?.raining,
        // R14-E2：cloudBGAlpha（阴天层常驻>0,Main.cs:60291-60302 缓动）——曾误读
        // 雨强 cloudAlpha,非雨天恒缺 ×1.1
        cloudBGAlpha: w.weather?.cloudBGAlpha ?? 0,
        dayTime: isDay,
        // R14-E1：Main.time 轴 = 昼 0..54000(昼长 0.625 圈,起点 4:30)/夜 0..32400
        // (0.375 圈)——曾按昼起点 0.25/昼长 0.5 映射,晨昏 ×1.3/正午 ×0.8 窗整体
        // 平移 1-1.5 小时;与 Game.playerFishingConditions(:20456)同式对齐
        time: isDay ? ((t - Clock.DAWN) / 0.625) * 54000 : ((((t - Clock.DUSK) + 1) % 1) / 0.375) * 32400,
        moonPhase: w.clock.moonPhase,
        bloodMoon: !!w.clock.bloodMoon,
      }));
    }
    return base;
  }

  /** InfoAccs 渔情行消费(Main.cs:46300-46316 语义):浮漂在液 → 现算渔力;
   *  调用方自管 displayedFishingInfo 粘性缓存 */
  public currentFishingPower(game?: GameHooks): number {
    const p = this.ownerRef();
    if (!p) return 0;
    return this.fishingPower(p, game);
  }

  fixedUpdate(dt: number, game: GameHooks) {
    void dt;
    const p = this.ownerRef();
    if (!p || p.dead) { this.dead = true; return; }
    // ---- AI_061 存活门（Projectile.cs:54605-54621 flag2 五支，1456=1457=1458 同构）：
    //      手持非钓竿 / CCed / noItems(诅咒 23=本仓 Cursed buff) / 手持竿 shoot 与
    //      本弹型不符（浮漂饰品覆写弹 986-993 豁免，flag :54604） / pulley 绳悬 → Kill。
    //      ★切物品即断线收漂的原版语义（此前缺失=换手持竿浮漂永生）。
    //      ★shoot 比对取 bobberProjIdFor(手持竿 vid)（=Item.cs:23001 SetDefaults
    //      shoot 表的移植），不读 itemfunc.shoot——该表仅 2289/4325/4442 有 shoot 键，
    //      直读会让金竿/玻纤/强化/机械/坐鸭/热线的浮漂一出生即被误杀（2026-08-25
    //      用户实报"挥不出鱼线"）----
    const held = p.inv.heldItem();
    const hdef = held ? ITEM_DEFS[held.id] : undefined;
    const hv = hdef ? +(/^vi_(\d+)_/.exec(hdef.key)?.[1] ?? -1) : -1;
    const hf = hv >= 0 ? itemFuncOfVid(hv) : null;
    const lavaBobberAcc = this.projId >= 986 && this.projId <= 993;
    if (!((hf?.fishingPole ?? 0) > 0) || p.cced || p.buffs.has(BuffType.Cursed)
      || (!lavaBobberAcc && bobberProjIdFor(hv) !== this.projId)
      || p.pulley) {
      this.dead = true;
      return;
    }
    // ---- ★通用湿段（:16903-17113,共享体;溅花尘/音=wetSplashStepShared 弹面 10 粒;
    //      位序/分野见字段块注）----
    projectileWetSection(this, game, game.world.store, this.x, this.y, this.w, this.h,
      this.projId, !!projectileData(this.projId)?.ignoreWater);
    // ---- 收线态（ai[0]>=1，:54635-54668）：断线哨(2→3 播 Item17+溅水一次) →
    //      localAI[0] 0→100（钓线摆垂权重收敛，:54647-54649）→ tileCollide=false
    //      直移朝玩家（平滑窗 10、速度归一 ×15.9）→ >3000 Kill / 触玩家盒 Kill ----
    if (this.retract >= 1) {
      if (this.retract === 2) {
        this.retract = 3;
        game.playSfxFile?.('Item_17', 0.9, this.cx, this.cy);   // SoundID.Item17（:54640）
        if (this.liquidKind === 'water' || this.liquidKind === null) this.doSplash(game);
      }
      if (this.lai0 < 100) this.lai0 += 1;
      const dxp = p.cx - this.cx, dyp = p.cy - this.cy;
      const d = Math.sqrt(dxp * dxp + dyp * dyp);
      if (d > KILL_DIST) { this.dead = true; return; }          // :54656-54658
      const txv = d > 1e-6 ? (dxp / d) * REEL_SPEED : 0;
      const tyv = d > 1e-6 ? (dyp / d) * REEL_SPEED : 0;
      this.vx = (this.vx * (REEL_SMOOTH - 1) + txv) / REEL_SMOOTH;   // :54659-54664
      this.vy = (this.vy * (REEL_SMOOTH - 1) + tyv) / REEL_SMOOTH;
      // ★水中位移阻尼（HandleMovement :17721-17764 → UpdatePosition :20557 湿态
      //  position += wetVelocity）：直积分乘进位移行,速度【场】vx/vy 不动
      const dfR = projWaterDragFactor(this);
      this.x += this.vx * dfR;
      this.y += this.vy * dfR;              // tileCollide=false（:54652）无碰撞直移
      // Hitbox.Intersects(player.Hitbox)（:54666-54668）：弹盒 vs 玩家盒——盒改 14×14
      // 后改读真盒 w/h（原 BOBBER_BOX 常量代读退役;常量保留=SetDefaults 钉值导出供测试）
      if (this.cx + this.w / 2 > p.x && this.cx - this.w / 2 < p.x + p.w
        && this.cy + this.h / 2 > p.y && this.cy - this.h / 2 < p.y + p.h) {
        this.dead = true;
        return;
      }
      return;
    }
    // ---- 距离门（:54701-54705）：玩家走远 >900px → ai[0]=1 自动收线断线 ----
    {
      const dxp = p.cx - this.cx, dyp = p.cy - this.cy;
      if (Math.sqrt(dxp * dxp + dyp * dyp) > RETRACT_DIST) { this.retract = 1; return; }
    }
    const st = (game.world as World).store;
    const idx = st.idx(Math.floor(this.cx / TILE), Math.floor((this.y + this.h) / TILE));
    const liq = st.liquid[idx];
    const liqType: LiquidType | null = liq > 60 ? ((st.liquidType[idx] === 2 ? 'lava' : st.liquidType[idx] === 3 ? 'honey' : 'water')) : null;

    if (!this.floating) {
      this.vy = Math.min(this.vy + GRAVITY * 0.7, 8);
      this.vx *= 0.99;
      // ★水中位移阻尼（HandleMovement :17721-17764 → UpdatePosition :20557）：因子乘进
      // dx/dy 入参（moveAndCollide 契约——采纳处原样回读勿除回）,速度场不减
      const dfF = projWaterDragFactor(this);
      moveAndCollide(this, game.world, this.vx * dfF, this.vy * dfF);
      // 咬钩饵警告每拍写在飞行段同样成立（:54754-54757 位=干物理后/!flag3 早退前,
      // 原版飞行中即写;条件口径同浮态段注——抛竿拍快照 baitVid）
      if (this.baitVid === 2673) {
        p.displayedFishingInfo = Lang.text('GameUI.FishingWarning');
      }
      if (liqType === 'water' || liqType === 'honey') {
        this.floating = true;
        this.liquidKind = liqType;
        // 原版入液【不清速度、不钉位】（AI_061 无此二行）——速度由浮支物理衰减
        // （vy>0 每拍 ×0.5 + GetWaterLine 液面回拉 :54699-54740,2-6 拍 settled），
        // settled 点 = 液面（表层液格内）→ FishingCheck 的 Center/16 仍落液格;
        // 入水溅花/音已上移通用湿段（10 粒四液花 + Splash_1 原版 style1）——旧
        // playSfx('splash') 六变体乱掷近似退役（2026-09-06 残差清偿,见字段块注）
      } else if (liqType === 'lava') {
        // ★SW-BJ44（2026-09-09）：岩浆入浮——原版浮标【不】因岩浆销毁：AI_061 浮支
        // 三液对称（Projectile.cs:54684-54753 wet 浮支对岩浆同效;GetWaterLine
        // :54805-54833 液体类型无关），共享湿段 LavaCollision 只置 lavaWet 恒不 Kill
        // （:16906-16911;Projectile.AI 内 lavaWet→Kill 唯一支 :26071 属 aiStyle 22,
        // 与 aiStyle 61 浮标无关;1458 :16907-16912/:26072/:54599 同构）。岩浆钓合法性
        // 由 fishingCheck 三源门裁决（Projectile.cs:20758 CanFishInLava[竿 2422]
        // ||IsLavaBait[饵 4845/4847/4849]||accLavaFishing[4881/5064 → Player.cs
        // :14774-14776/:14787-14790]）+ 渔获表 LavaDrops AddStopper(InLava)
        // （GameContentFishDropPopulator.cs:247）——三源皆无 = 浮标永浮、渔获表全空 =
        // 永不咬钩（原版即静默无提示）。旧「无配饰即烧毁」为自创机制（IsLavaBait
        // 岩浆饵 4845/4847/4849 无配饰整族被拒 = 用户实报「地狱鱼饵也没能在岩浆钓鱼」
        // 根因），退役。
        this.floating = true;
        this.liquidKind = 'lava';
      } else if (++this.airT > 600) {
        this.dead = true; // 落地未入水超时
      }
      return;
    }
    // ---- 浮态（AI_061 if (wet) 浮支 :54684-54753 1:1；2026-09-06 二批——旧
    //      「入液行静态钉位 + 速度清零 + 累积无 settled 门」近似整体退役：
    //      settled 门（:54736-54739/:54758-54764）、咬钩抖动（:54785-54802）、
    //      液面回拉皆依赖本段）----
    //      ★分支选择器 = floating（本仓 wet 最小投影,任务面口径）：原版选择器是
    //      湿旗,但弹湿旗扫描窗 y 钳 maxTilesY−40（Collision.cs:1596 Utils.Clamp,
    //      共享段同源）——测试小世界深池/地狱底 40 行读不到湿（真实世界鱼池永不落
    //      钳制窗,钳制无行为差）;floating 由入液格探针直读注册（无钳）,湿旗仍逐拍
    //      维护供微光面/咬钩溅花重触发消费。水位被抽走时原版走 else 重力支
    //      （:54741-54753）,此处浮支物理以缺省液面=盒底（GetWaterLine :54807）
    //      匀速下沉承接——既存近似登记,终态同（触底即驻,settled 门挡累积）。
    // 微光钩爪面（:54685-54698）：浮在微光里 → owner 每 tick AddBuff(353,60)（微光化）
    // + localAI[2] 一次门播 PlaySound(19,…,2)=Splash_2（声源=玩家坐标,style 2 直映
    //   LegacySoundPlayer.cs:874 case19）。★353=Shimmered 微光化（Player.cs:27944-27951
    //   玩家涉微光同款授予）,非"微光免疫"——任务面曾误标,以反编译为准。
    //   原版无 shimmerImmune/UnderworldLayer 门（那两门在玩家自涉支 :27944-27948,
    //   浮漂支没有）——1:1 不加门
    if (this.shimmerWet) {
      p.buffs.apply(BuffType.Shimmered, 1);          // :54691 AddBuff(353,60)（myPlayer==owner 单机恒真;60t=1s）
      if (this.lai2 === 0) {                         // :54693-54697 一次门
        this.lai2 = 1;
        game.playSfxWav?.('Splash_2', 1, p.x, p.y);  // PlaySound(19,(int)player.position.X/Y,2)
      }
    }
    // 浮支物理（:54699-54740）——★float32 语义模拟（B1 定谳落刀 2026-09-07）：
    //   XNA 全程 float32，本仓 float64 的 halving 收敛尾要降到 ULP64(y≈2048)≈4.5e-13
    //   才撞墙，原版 fl32 在 ULP32≈2.4e-4 即落地——收敛尾多 ~29 拍 → 咬钩重抖/重溅
    //   节拍 123t vs 原版 59t（仿真三臂对拍：fl32=59 / float64=117~123 / 修后=59 且与
    //   fl32 逐拍恒等）。修=浮支全体 float 站点 Math.fround（常量先 fround，见模块头）
    //   + 湿位移和取整（下方 moveAndCollide 后）。飞行段不包：入水前状态本仓抛竿向量
    //   式与原版 ItemCheck_Shoot 异源，逐位对齐不可达，墙标度由浮支自建（飞段 vy 公式
    //   本就近似档）；x 轴位移和取整省略（vx 无精确等门消费面，只进画线摆垂）。
    const cyF = Math.fround(this.cy);        // Center.Y（fl32(position.Y+7f) 单精度和）
    this.drawRot = 0;                        // rotation = 0f（:54699——浮态恒正立）
    this.vx = Math.fround(this.vx * F32_09); // :54700 velocity.X *= 0.9f
    // :54701-54712 盒沿 tile 空分配探针=行为死码（只 new Tile 不读）不移植;
    if (this.vy > 0) this.vy = Math.fround(this.vy * 0.5);   // :54713-54716（×0.5 精确,包裹为语义完整）
    const wl = this.getWaterLine(st, Math.floor(this.cx / TILE), Math.floor(this.cy / TILE));
    if (cyF > wl) {                          // :54720-54731
      this.vy = Math.fround(this.vy - F32_01);              // velocity.Y -= 0.1f
      if (this.vy < -8) this.vy = -8;
      if (Math.fround(cyF + this.vy) < wl) {                // fl32(Center.Y+velocity.Y) < num10
        this.vy = Math.fround(wl - cyF);                    // velocity.Y = num10 - Center.Y
      }
    } else {
      this.vy = Math.fround(wl - cyF);       // :54732-54735 else 直拉
    }
    let flag3 = this.vy >= -0.01 && this.vy <= 0.01;   // :54736-54739 settled（(double)vy 比较,双精度字面）
    // ---- 咬钩饵警告（AI_061 :54754-54757,每拍）：myPlayer==owner（单机恒真）且
    //      饵=松露虫 2673 → displayedFishingInfo=FishingWarning。写位=浮/干物理之后、
    //      累积/咬钩之前——FishingCheck 同拍后写者胜＝原版同构；显示侧
    //      Game.tickInfoAccs 浮标在场只读粘性缓存（R25-E16 补写位）。★条件口径：原版
    //      = GetFishingConditions().BaitItemType 现算（Fishing_GetBait :42578 逐帧扫
    //      盘）；本仓 bobber 域饵源=抛竿拍快照 baitVid（fishingCheck 松露虫支/
    //      consumeBait/IsLavaBait 同源）——中途换饵的现算差=快照口径既有域，非本刀面。 ----
    if (this.baitVid === 2673) {
      p.displayedFishingInfo = Lang.text('GameUI.FishingWarning');
    }
    // ---- 累积/咬钩（:54758-54802；原版 !flag3 早退 :54762-54764）----
    if (this.ai1 !== 0) flag3 = true;        // :54758-54761（咬钩窗内不受 settled 门）
    if (flag3) {
      if (this.ai1 === 0) {
        // 等待累积（:54766-54784）
        const level = this.fishingPower(p, game);
        if (Math.floor(Math.random() * 300) < level) this.lAI1 += nextInt(1, 3);   // :54769-54772
        this.lAI1 += Math.floor(level / 30);                                       // :54773
        this.lAI1 += nextInt(1, 3);                                                // :54774
        if (Math.floor(Math.random() * 60) === 0) this.lAI1 += 60;                 // :54775-54778
        if (this.lAI1 > 660) {
          this.lAI1 = 0;                                                           // :54781
          this.fishingCheck(p, game, idx);
        }
      } else if (this.ai1 < 0) {
        // 咬钩窗（:54785-54802）：ai[1] 每 tick += rand(1,5)；归零 = 逃脱——
        // localAI[1] 清零（渔获作废），回到等待累积
        if (this.vy === 0 || (this.honeyWet && Math.abs(this.vy) <= F32_001)) {
          // 抖动踢（:54789-54790）+ 三旗复位（:54791-54793 wet/lavaWet/honeyWet——
          // ★任务面"localAI[0] 等"系误记,原文三旗即湿旗）:复位后下一拍共享湿段
          //  !wet && wetCount==0 → 重触发入水溅花 10 粒+Splash_1（:16948 门）＝原版
          //  咬钩水花;本仓湿段在拍头 → 溅花滞后一拍（位序登记,projWetSection 头注同源）
          //  踢幅 = fl32(Next×0.015f)（:54789-54790 字面 0.015f）→ 值域 [1.5, 7.48499966]
          //  （fl32(100×0.015f) 舍入恰回 1.5;float64 直乘 7.485 顶=近似值,已正）
          this.vy = Math.fround(nextInt(100, 500) * F32_015);      // (float)Next(100,500)*0.015f 下沉
          this.vx = Math.fround(nextInt(-100, 101) * F32_015);     // (float)Next(-100,101)*0.015f ±1.5
          this.wet = false;
          this.lavaWet = false;
          this.honeyWet = false;
        }
        this.ai1 += nextInt(1, 5);               // :54795
        if (this.ai1 >= 0) {                     // :54796-54801 归零逃脱
          this.ai1 = 0;
          this.lAI1 = 0;
          this.catchId = 0;
          this.catchEnemy = 0;
          this.truffleBite = false;
        }
      }
    }
    // 位移积分（HandleMovement :17721-17764 湿阻尼 ×0.5/0.25/0.375 只进位移,
    // 速度场不减）——置于 ai1 分支之后＝原版 AI(:16880)→湿段(:16895)→
    // HandleMovement(:17120) 同拍尾序：咬钩踢速度当拍即入位移（抖动当拍可见）
    const dfW = projWaterDragFactor(this);
    moveAndCollide(this, game.world, this.vx * dfW, this.vy * dfW);
    // ★position += wetVelocity 的 fl32 和取整（UpdatePosition :20555 `if (wet)
    //  position += wetVelocity`——XNA Vector2 加法单精度）：B1 收敛尾墙标度本体。
    //  moveAndCollide 内和为 float64 精确和（两 float32 值之和 ≤49 位恒精确）,
    //  此处 fround ≙ fl32(y_prev+Δ)；碰撞钳位/贴面吸附写整值恒 fl32 恒等,零扰动
    this.y = Math.fround(this.y);
  }

  /** AI_061_FishingBobber_GetWaterLine（Projectile.cs:54805-54833）1:1：探中心列
   *  Y-1/Y/Y+1 三格液面高、首中即返；缺省=盒底（position.Y+height）。液面 =
   *  行底 − liquid/16（C# 整除）；越界格=无液（原版 Main.tile 越界 null 由调用侧
   *  空分配守卫,行为等价无液支）。settled 点即本值——FishingCheck 的 Center/16
   *  落点恒在表层液格内（液面 ≥ 行底−15 < 行底） */
  private getWaterLine(st: World['store'], xT: number, yT: number): number {
    const liq = (i: number, j: number): number =>
      st.inBounds(i, j) ? st.liquid[st.idx(i, j)] : 0;
    const l1 = liq(xT, yT - 1);
    if (l1 > 0) return yT * TILE - Math.floor(l1 / 16);              // :54814-54817
    const l2 = liq(xT, yT);
    if (l2 > 0) return (yT + 1) * TILE - Math.floor(l2 / 16);        // :54818-54821
    const l3 = liq(xT, yT + 1);
    if (l3 > 0) return (yT + 2) * TILE - Math.floor(l3 / 16);        // :54822-54825
    return this.y + this.h;                                          // :54807 缺省=盒底
  }

  /** FishingCheck（Projectile.cs:19175-19187）+ TryBuildFishingContext
   *  （:19189-19331）+ SetFishingCheckResults（:19333-19396）1:1：
   *  上下文构建（水体/缩放/幸运/高度/垃圾档/五档/任务鱼探测）→ 咬钩门
   *  rand(100) <= ⌊(力+75)/2⌋ → 敌怪掷（:19398-19429）→ 全量规则表掷渔获
   *  （FishDropRuleList，表首 AnyEnemies stopper 保证敌怪与渔获互斥）→
   *  二者皆空则不开窗（:19337-19367 flag=false），岩浆另加等待加速（:19368-19391）。 */
  private fishingCheck(p: Player, game: GameHooks, idx: number): void {
    const w = game.world as World;
    const st = w.store;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
    // R14-E12：玩家湿身且浮标高于玩家中心 → 不可钓（TryBuildFishingContext 首门
    // PRJ57:20710-20714 `player.wet && !(Center.Y >= player.Center.Y)`）
    if (p.inWater && this.cy < p.cy) return;
    const pond = getFishingPondState(game, tx, ty);   // GetFishingPondState :20170-20201
    // R14-E13①：NotTheBees 世界 1/2 掷把蜂蜜池当水（PRJ57:20730-20732,在 <75 门之前）
    if (w.seedFlags?.notTheBees && Math.floor(Math.random() * 2) === 0) pond.honey = false;
    if (pond.waterTilesCount < 75) {
      // R25-E16：渔情文本（:20735-20740 displayedFishingInfo=NotEnoughWater）——
      // 显示侧 Game.tickInfoAccs 浮标在场只读粘性缓存,本处即写入口
      p.displayedFishingInfo = Lang.text('GameUI.NotEnoughWater');
      return;
    }
    // 松露虫（:19212-19224）：永不出鱼；两侧海洋带（X<380||>w-380，浮标格）且池液>1000
    // 且场上无 Duke → 开咬钩窗（-280..-160，localAI[1]=1 "有咬"）
    if (this.baitVid === 2673) {
      p.displayedFishingInfo = Lang.text('GameUI.FishingWarning');   // :20743-20745
      if ((tx < 380 || tx > st.w - 380) && pond.waterTilesCount > 1000
        && !(game.enemies() as Array<{ vanillaId?: number }>)
          .some((e) => !((e as { dead?: boolean }).dead) && e.vanillaId === 370)) {
        this.ai1 = nextInt(-180, -60) - 100;
        this.truffleBite = true;
      }
      return;   // :19223 松露虫钓鱼恒不出鱼
    }
    let level = this.fishingPower(p, game);           // :19225 FinalFishingLevel
    if (level === 0) return;                          // :19226-19229
    // Chum Bucket（:20759-20770）：池内 chum 标记（弹体 820 注册面,chumBucket.ts）
    // 累进加成——>0:+11 / >1:+6 / >2:+3 三段【叠加】(曾误写单档取一,最高只 +11;
    // 亦曾错扫地面掉落物 4608 当计数源=桶扔地上白吃加成,R25-E10 双修)
    if (pond.chums > 0) level += 11;
    if (pond.chums > 1) level += 6;
    if (pond.chums > 2) level += 3;
    p.displayedFishingInfo = Lang.text('GameUI.FishingPower', level);   // :20771-20772
    const canFishInLava = CAN_FISH_IN_LAVA_POLES.has(this.poleVid)   // :19230 三源
      || IS_LAVA_BAIT.has(this.baitVid) || this.ownerLavaOk();
    // 水量缩放（:19244-19261）：atmo = (Y/16 - (60 + 10·(W/4200)²)) / (地表/6) 截 [0.25,1]
    const atmoNum = (st.w / 4200) ** 2;
    let atmo = (this.y / TILE - (60 + 10 * atmoNum)) / (w.groundLevel / 6);
    if (atmo < 0.25) atmo = 0.25;
    if (atmo > 1) atmo = 1;
    const waterNeeded = Math.floor(300 * atmo);       // :19256 waterNeededToFish = 300 × atmo
    if (pond.waterTilesCount / waterNeeded < 1) {
      level = Math.floor(level * (pond.waterTilesCount / waterNeeded));   // :20787-20790
    }
    // 池水不足额 → FullFishingPower 覆写（:20792-20795）：q=count/needed 缩放后
    // q=1−q,显示 −Round(q×100)（如半池水 → "X（-50%）渔力"）
    if (pond.waterTilesCount < waterNeeded) {
      p.displayedFishingInfo = Lang.text('GameUI.FullFishingPower', level,
        -Math.round((1 - pond.waterTilesCount / waterNeeded) * 100));
    }
    // 幸运度（:19267-19277）：负运 ×(0.9-rand*0.3) / 正运 ×(1.1+rand*0.3)，掷中才乘
    const luck = p.luck;
    if (luck < 0) {
      if (Math.random() < -luck) level = Math.floor(level * (0.9 - Math.random() * 0.3));
    } else if (Math.random() < luck) {
      level = Math.floor(level * (1.1 + Math.random() * 0.3));
    }
    // heightLevel（:19306-19325 非 remix 分支 / ★IIIII228 :20808-20833 remix 重映射
    //  +带 2 的 1/2 下沉掷）/ junk（:19326）/ 五档（:19327）
    const remixWorld = !!w.seedFlags?.remix;
    const heightLevel = heightLevelOf(ty, w.groundLevel, w.rockLevel, st.h,
      remixWorld, remixWorld ? Math.floor(Math.random() * 2) === 0 : null);
    const junk = rollJunk(level, pond.waterTilesCount, waterNeeded);
    const levels = rollDropLevels(level, p.buffs.has(BuffType.Crate));
    const questFish = this.probeQuestFish(p, game);   // :19328 → :20089-20104
    // ---- FakeFish 生成门（Projectile.cs:20709 SpawnFakeFishInWater）----
    // TryBuildFishingContext 成功即跑、先于咬钩掷骰且与其独立；展示条件与实际渔获
    // 共用同一掷（junk/五档/rolled 即本 tick 掷值,GetDisplayableDrops 只查条件不掷
    // chance）。clientOnly 编排 = 纯本地特效不上网。★zones/rolled 求值点自渔获掷前
    // 提至咬钩门前（prepareFishingContext 仅 zone 冲突时掷 Math.random,无种子流依赖）
    const zones = this.zonesOf(game);
    const rollCtx: FishingRollCtx = {
      inLava: pond.lava, inHoney: pond.honey, junk, crate: levels.crate,
      common: levels.common, uncommon: levels.uncommon, rare: levels.rare,
      veryrare: levels.veryrare, legendary: levels.legendary,
      anyEnemies: false, canFishInLava,   // 原版门内 rolledEnemySpawn 尚未掷=恒 false
      x: tx, y: ty, waterTilesCount: pond.waterTilesCount,
      rockLayer: w.rockLevel, maxTilesX: st.w, heightLevel, questFish,
      hardMode: !!w.flags.hardMode, bloodMoon: !!w.clock.bloodMoon,
      combatBookWasUsed: !!w.flags.combatBookWasUsed, remix: remixWorld,   // ★IIIII228 :20995/:21020
      zones, rolled: prepareFishingContext(zones, heightLevel, ty, w.rockLevel,
        undefined, !!w.seedFlags?.notTheBees, remixWorld),   // :20979-21032（NTB 弃丛林/腐猩清旗/remixOcean 掷）
    };
    spawnFakeFishInWater(game, tx, ty, rollCtx);
    // 咬钩门（:19181-19184）：Next(100) <= ⌊(力+75)/2⌋ 才真咬（否则空拍再等下一轮）
    if (Math.floor(Math.random() * 100) > Math.floor((level + 75) / 2)) return;
    // ---- SetFishingCheckResults（:19333-19396）----
    // 敌怪掷（FishingCheck_RollEnemySpawns :19398-19429）：池含岩浆/蜂蜜即豁免、
    // 血月夜、1/6（血肉抛竿 4325 → 1/3）→ 困难 {620,621,586,587}+1/10 恐惧鹦鹉螺
    // 618；非困难 {586,587}；红城镇史莱姆 682 世界级一次性 1/5 优先（:19413-19416）
    this.catchEnemy = 0;
    this.catchId = 0;
    if (!pond.lava && !pond.honey && w.clock.bloodMoon && !w.clock.isDay) {
      const chance = this.poleVid === 4325 ? 3 : 6;   // :19404-19408
      if (Math.floor(Math.random() * chance) === 0) {
        if (!w.flags.unlockedSlimeRedSpawn && Math.floor(Math.random() * 5) === 0) {
          this.catchEnemy = 682;                      // :19413-19416
        } else if (w.flags.hardMode) {
          // R14-E14 掷序对齐（PRJ57:20947-20950）：先 SelectRandom 池(1 掷)再 1/10 覆写 618
          const poolE = [620, 621, 586, 587];
          this.catchEnemy = poolE[Math.floor(Math.random() * poolE.length)];
          if (Math.floor(Math.random() * 10) === 0) this.catchEnemy = 618;
        } else {
          // :20955 SelectRandom({586,587}) = 1 掷均匀
          this.catchEnemy = [586, 587][Math.floor(Math.random() * 2)];
        }
      }
    }
    // 渔获掷（FishingCheck_RollItemDrop :19431-19449 → FishDropRuleList）：
    // AnyEnemies stopper 居表首 → 敌怪已掷出时恒 0（互斥由表保证）。
    // ★rollCtx.anyEnemies 覆写为敌怪掷后真值（生成门内原版读到的仍是掷前 0——
    //   两时点同构,FishingContext.Fisher.rolledEnemySpawn 在 RollEnemySpawns 后才置位）
    rollCtx.anyEnemies = this.catchEnemy > 0;
    this.catchId = tryGetItemDrop(rollCtx);
    // ---- FakeFish 咬钩联动（FishingCheck_RollItemDrop :20962-20977）----
    // 声呐药水：浮标下 24px 处先补一条【渔获同款】鱼（UniqueInfoPiece=rolledItemDrop、
    //   MovementVector=Center+(0,24)）+ Ping/PushAway;磁化恒跑——距离序最近配型鱼
    //   吸附到浮标（TryToMagnetizeTo）。clientOnly = 纯本地不上网
    if (this.catchId > 0) {
      if (p.buffs.has(BuffType.Sonar)) {
        requestFakeFishSpawn(
          this.cx + (Math.random() * 2 - 1) * 16,   // NextVector2Circular(16,0)
          this.cy + 24, this.cx, this.cy + 24, this.catchId);
        pingFakeFish(st, this.cx, this.cy, this.catchId);
        pushAwayFakeFish(st, this.cx, this.cy, this.catchId);
      }
      magnetFakeFish(st, this.fakeFishView(), this.catchId);
    }
    // 成就：GO_LAVA_FISHING（SetFishingCheckResults 尾 Projectile.cs:20921-20923：
    // `if (fisher.CanFishInLava && fisher.inLava) HandleSpecialEvent(player, 19)`——
    // CanFishInLava 三源（:20758 CanFishInLava[竿]||IsLavaBait[饵]||accLavaFishing,与
    // canFishInLava 同式）;抵达 SetFishingCheckResults 的每次 FishingCheck 均发（咬钩/
    // 空咬两支同发——原版该门在 flag if/else 之后;上方 <75 水/松露虫/渔力 0 早退支
    // 原版即不发）。flag 幂等
    const fireLavaFishingAch = (): void => {
      if (canFishInLava && pond.lava) {
        game.achievements?.handleSpecialEvent(19,
          { statLifeMax: p.maxHp, statManaMax: p.maxMana });
      }
    };
    if (this.catchId > 0 || this.catchEnemy > 0) {
      this.lai2 = this.baitVid;                       // :20878/:20892 localAI[2]=BaitItemType（微光音一次门就此闭锁）
      this.openBiteWindow(level);                     // :19348/:19362
      // ★咬钩无声定谳（2026-09-06 残差批）：FishingCheck(:20703-20712)/
      //   SetFishingCheckResults(:20861-20924) 全文无 PlaySound——仅 sonarPotion 门
      //   两处 SoundID.SonarPotion（:20873/:20888,下行保留）。旧 playSfx('splash')
      //   咬钩声=自创,删;咬钩的原版可感反馈=抖动踢+共享湿段重溅（浮态段 :54787-54794）
      //   + 旧 spawnParticles 6 粒色方块近似同批退役（原版咬钩无此尘）
      // 声呐药水咬钩音（Projectile.cs SetFishingCheckResults :20874/:20888 sonarPotion
      //   门 → SoundID.SonarPotion=sonar_potion.wav：SoundID.cs:1128 WithVolume(0.65)
      //   经 FILE_CASE_VOL 库层生效、WithPitchVariance(0.03)→PITCH_CASE ±0.03）。
      //   旧 'Item_9'（水晶风暴连发音）冒名已正（2026-08-26）
      if (p.buffs.has(BuffType.Sonar)) game.playSfxWav?.('sonar_potion', 1, this.cx, this.cy);
      fireLavaFishingAch();                           // :20921 尾奏（咬钩支同发）
      return;
    }
    // 二者皆空（:19368-19391）：岩浆且三源 ≥2 → 累积器 +240/+480 加速下一咬
    if (pond.lava) {
      let n = 0;
      if (IS_LAVA_BAIT.has(this.baitVid)) n++;        // :19371-19374
      if (CAN_FISH_IN_LAVA_POLES.has(this.poleVid)) n++;   // :19375-19378
      if (this.ownerLavaOk()) n++;                    // :19379-19382
      if (n >= 3) this.lAI1 += 480;                   // :19383-19386
      else if (n >= 2) this.lAI1 += 240;              // :19387-19390
    }
    fireLavaFishingAch();                             // :20921 尾奏（空咬支同发）
  }

  /** FishingCheck_ProbeForQuestFish（:20089-20104）1:1：当日任务鱼；玩家已持有 /
   *  场上无渔夫 369 / 今日已完成 → -1（不可再钓） */
  private probeQuestFish(p: Player, game: GameHooks): number {
    const w = game.world as World;
    const quest = ANGLER_QUEST_ITEMS[w.anglerQuest] ?? -1;
    if (quest === -1) return -1;
    const id = VI_ID(quest);
    if (id > 0 && p.inv.slots.some((s) => s && s.id === id && s.stack > 0)) return -1;  // :20092-20095
    const anglerAlive = (game.npcs?.() ?? []).some(
      (n) => (n as { vanillaId?: number; dead?: boolean }).vanillaId === 369
        && !(n as { dead?: boolean }).dead);                                           // :20096-20099
    if (!anglerAlive) return -1;
    if (w.anglerQuestFinished) return -1;               // :20100-20103
    return quest;
  }

  /** 玩家 zone 快照（PrepareFishingContext :19453-19490 的输入源 = 玩家 zone，
   *  本仓取 Game.scene——SceneMetrics 以玩家为中心扫描；dungeon 折 downedBoss3
   *  门 :19458-19461，地牢为真时弃沙漠 :19487-19490） */
  private zonesOf(game: GameHooks): ZoneInput {
    const s = game.scene;
    const w = game.world as World;
    const dungeon = !!s?.zoneDungeon
      && !!(w.flags.downedSkeletron || w.flags['downed_35']);   // downedBoss3 双键同 Game.ts:8062
    return {
      corrupt: !!s?.zoneCorrupt,
      crimson: !!s?.zoneCrimson,
      jungle: !!s?.zoneJungle,
      snow: !!s?.zoneSnow,
      dungeon,
      desert: !!s?.zoneDesert && !dungeon,
      hallow: !!s?.zoneHallow,
      beach: !!s?.zoneBeach,
      glowshroom: !!s?.zoneGlowshroom,
    };
  }

  /** 开咬钩窗口（SetFishingCheckResults :19334 / :19344）：
   *  ai[1] = rand(-240,-90) - 钓鱼力（负值，窗口长短随钓鱼力递增） */
  private openBiteWindow(level: number): void {
    this.ai1 = nextInt(-240, -90) - level;
  }

  /** FakeFish latch 目标视图（FakeFishLatchTarget：原版 _latchedProjectile 字段投影）。
   *  缓存单例——鱼以对象引用识别宿主浮漂（matchesLatch），getter 活读本实体字段 */
  private ffView: FakeFishLatchTarget | null = null;
  fakeFishView(): FakeFishLatchTarget {
    if (!this.ffView) {
      const self = this;
      this.ffView = {
        get cx() { return self.cx; },
        get cy() { return self.cy; },
        get active() { return !self.dead; },
        get projType() { return self.projId; },
        get retract() { return self.retract; },      // ai[0]
        get ai1() { return self.ai1; },              // ai[1] 原值（负=咬钩窗）
        get caughtVid() { return self.caughtVid; },
      };
    }
    return this.ffView;
  }

  /** AI_061_FishingBobber_DoASplash（Projectile.cs:54839-54852）1:1（2026-09-04 升格,
   *  曾 spawnParticles 24 粒色方块近似+playSfx('splash') Splash_0..5 六变体乱掷）：
   *  100×Dust.dustWater()（waterStyle→33/98-105/123/288）盒 (x−6, y−10, w+12, 24)
   *  vy−4 vx×2.5 scale0.8 α100 noGravity + PlaySound(19,…,0)=Splash_0（:54852）。
   *  ★水族尘的 NewDust 型内预处理（33/98-105: v×0.5+Y++、α=170,Dust.cs:234-237）
   *  VanillaDust.spawn 已植同值;123/288 原文本就无 → 调用侧 vy−4/vx×2.5 后置覆写
   *  即逐位等价;scale/α 为绝对覆写（消解 NewDust ±0.2 scale 抖）。waterStyle 探测
   *  同 FakeFish 结构化约定（renderer?.waterStyle,测试 mock 兼容） */
  private doSplash(game: GameHooks): void {
    const waterStyle = (game as { renderer?: { waterStyle?: number } }).renderer?.waterStyle ?? 0;
    for (let i = 0; i < 100; i++) {
      const d = game.spawnDust?.(this.x - 6, this.y - 10, this.w + 12, 24, dustWaterFor(waterStyle));
      if (d) {
        d.vy -= 4;
        d.vx *= 2.5;
        d.scale = 0.8;
        d.alpha = 100;
        d.noGravity = true;
      }
    }
    game.playSfxWav?.('Splash_0', 1, this.x, this.y);
  }

  /** 收竿（窗口内）：返回渔获原版 id（0=没咬/没饵/血月敌怪——后者查 catchEnemy）；消耗鱼饵。
   *  ★无咬收竿 = ai[0]=1 收线飞行（ItemCheck_PullFishingBobbers :53019-53043：湿态
   *  vy>-10 上提一记，飞行触玩家盒才 Kill :54666-54668）——此前即时消失=收线无动画 */
  reel(game: GameHooks): number {
    if (this.biteT <= 0 || (!this.catchId && !this.catchEnemy && !this.truffleBite)) {
      this.startReel(1);
      return 0;
    }
    const p = this.ownerRef();
    if (!p) return 0;
    // 声呐药水（buff 122）：咬钩时已掷——由 Game 侧显示（本实体的 catchId 预存）
    this.consumeBait(p, game);
    if (this.truffleBite) {
      // 松露虫咬钩（PullBobber :51563-51576）：必耗饵 + 召 Duke——-1 哨兵交 Game 侧
      this.truffleBite = false;
      this.dead = true;
      void game;
      return -1;
    }
    const caught = this.catchId;
    this.catchId = 0;
    // R14-E6：收竿 1/7 断线（PullBobber :53076-53079 `Next(7)==0 && !accFishingLine`
    // → ai[0]=2 渔获作废）——仅物品渔获支（敌怪/松露虫支无断线掷）;饵已在上文消耗
    // （ConsumeBait 先于 PullBobber,:53031-53033）。高测钓线族 equipStats.fishingLine 免疫
    if (caught > 0
      && !(p as unknown as { equipStats?: { fishingLine?: boolean } }).equipStats?.fishingLine
      && Math.floor(Math.random() * 7) === 0) {
      this.startReel(2);   // 断线（PullBobber :53076-53079 ai[0]=2）——首 tick 播 Item17+溅水
      return 0;
    }
    // 命中渔获：原版 ai[1]=itemType 随收线飞行、触玩家盒 Kill 时 GiveItemToPlayer
    // （Projectile.cs:73234-73241）——本仓 Game.reelBobber 即时入包契约不变（登记偏差：
    // 收到即得，无飞行携物），浮漂此处即灭=竿静持随之解除。
    // ★拉杆溅花补位（AI_061 :54626-54631 `ai[1]>0 && localAI[1]!=0 → DoASplash`，即
    //   PullBobber else 支 :53082 bobber.ai[1]=localAI[1] 后的第一拍）——原版物品渔获
    //   拉出水面必溅;本仓携物飞行缺席=拉杆拍即溅花位。岩浆/蜂蜜免溅门
    //   `!lavaWet && !honeyWet`（:54629）以 liquidKind 承载（同 :243 断线位口径——
    //   两溅花位判值时刻浮漂均尚在液内,静态位 ≙ 原版粘滞位）。断线支（retract=2）
    //   的溅花在 fixedUpdate :243 侧,与此互斥不重播
    // ★收竿带渔获置位（Player.cs:53082 else 支 bobber.ai[1]=localAI[1],断线/敌怪支
    //   不置）——FakeFish CheckLatch(:158-165) 据此判「本鱼即渔获」自灭;本仓浮漂即时
    //   Kill 等不到鱼下一 tick 的检查,releaseCaughtFakeFish 时点直驱补偿
    this.ai1 = caught;
    this.caughtVid = caught;
    // 拉杆溅花（:54626-54631 补位,见上注）——渔获拉出水面即溅（岩浆/蜂蜜免溅）
    if (this.liquidKind === 'water' || this.liquidKind === null) this.doSplash(game);
    releaseCaughtFakeFish(this.fakeFishView(), caught);
    this.dead = true;
    return caught;
  }

  /** PullFishingBobbers 收线置位（Player.cs:53030-53035）：ai[0]==0 才置；湿态上提 */
  private startReel(mode: 1 | 2): void {
    if (this.retract === 0) this.retract = mode;
    if (this.floating && this.vy > -10) this.vy = -10;
  }

  /** 鱼饵消耗（ItemCheck_CheckFishingBobber_ConsumeBait PLA57:53106-53165 全支 1:1）：
   *  ① 基础掷 NextFloat()×num2<1（num2=max(1,1+bait/6)+钓具箱）→ ② 松露虫标记
   *  localAI[1]==-1 必耗 → ③ 渔获 rare<0（垃圾三件 2337/2338/2339,ITM57:23488-23490）
   *  flag=false 不耗 → ④ 金蠕虫 2895 改掷 Next(20)==0（1/20）→ ⑤ 瓢虫饵 2673 必耗；
   *  消耗时瓢虫饵触发 LadyBugKilled 坏运（NPC.cs:82403,距离<400 门+金瓢虫×2）+
   *  Main.ladyBugRainBoost += 1800 钳 18000（:82405-82409）。R14-E5 */
  private consumeBait(p: Player, game?: GameHooks): boolean {
    const slot = p.inv.slots[this.baitSlot];
    if (!slot) return false;
    let flag = Math.random() < 1 / (1 + this.baitPower / 6 + (this.tackleBox(p) ? 1 : 0));
    if (this.truffleBite) flag = true;                                   // :53144-53147
    else if (this.catchId > 0 && (ITEM_RARE[String(this.catchId)] ?? 0) < 0) flag = false;  // :53148-53156
    if (this.baitVid === 2895) flag = Math.floor(Math.random() * 20) === 0;  // :53160-53162
    if (this.baitVid === 2673) flag = true;                              // :53163-53165
    if (flag) {
      if (this.baitVid === 4361 || this.baitVid === 4362) {
        p.luckState.applyLadyBugKilled(Math.hypot(this.cx - p.cx, this.cy - p.cy), this.baitVid === 4362);
        // Main.ladyBugRainBoost 承接在 Weather 侧（Weather.ts:210）——曾写 World 根对象
        // （类型错误+运行时挂垃圾属性，雨调度读不到；2026-08-25 R32 顺手修）
        const w = game?.world as World | undefined;
        if (w?.weather) w.weather.ladyBugRainBoost = Math.min(18000, w.weather.ladyBugRainBoost + 1800);
      }
      p.inv.removeAt(this.baitSlot, 1);
    }
    return true;
  }

  private tackleBox(p: Player): boolean {
    // 钓具箱族 accTackleBox（equipStats.fishingTackle——2026-08-22 配饰审计补字段：
    // 2375 钓具箱/3721 渔具袋/5064 防熔渔具袋 :14123-14140；渔夫耳环 2374 只有钓技+10 不在此族）
    return (p as unknown as { equipStats: { fishingTackle?: boolean } }).equipStats?.fishingTackle ?? false;
  }

  private ownerLavaOk(): boolean {
    const p = this.ownerRef();
    if (!p) return false;
    return (p as unknown as { equipStats: { lavaFishing?: boolean } }).equipStats?.lavaFishing ?? false;
  }

  /** 声呐预展示的渔获名（Game 侧在浮标上方画字） */
  sonarLabel(): string | null {
    if (this.biteT > 0 && this.catchId) {
      const key = VANILLA_ITEM_KEY_BY_ID[this.catchId];
      return key ? key : null;
    }
    return null;
  }

  draw(r: import('../render/Renderer').Renderer): void {
    const ctx = r.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const owner = this.ownerRef();
    // ---- 钓线（DrawProj_FishingLine,Main.cs:34967-35201 1:1;2026-08-19 清零近似,
    //      曾画 2×4 白杆"连杆"）----
    if (owner) drawFishingLine(ctx, r, this, owner);
    // ---- 浮标本体（通用绘制 :34040 + bobber→num143=8,Main.cs:29411）----
    // 贴图左上 = (盒左, 盒上−8);rotation = 收线段 atan2(v)+π/2(AI_61 :50833)
    const img = projFrameImg(this.projId, 0);
    if (img) {
      const num145 = (img.width + this.w) / 2;
      ctx.translate(this.cx - this.w / 2 + num145, this.cy);
      if (Math.abs(this.vx) + Math.abs(this.vy) > 0.01) {
        this.drawRot = Math.atan2(this.vy, this.vx) + Math.PI / 2;
      }
      if (this.drawRot !== 0) ctx.rotate(this.drawRot);
      ctx.drawImage(img, -num145, -(this.h / 2 + 8), img.width, img.height);
    } else {
      // 兜底（贴图懒加载未就绪）：近似色块
      ctx.translate(this.cx, this.cy);
      ctx.fillStyle = this.biteT > 0 ? '#FF6060' : '#E04838';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // 声呐药水（buff 122,Projectile.cs:19340-19346 渔获 / :19354-19361 敌怪）：
    // 咬钩时浮标上方弹渔获名/血月敌怪名——此前 sonarLabel 数据在而零消费
    // （音效域 #19/钓鱼域 B19,2026-08-13 接；敌怪名 2026-08-21 复审 P3① 补）
    if (this.biteT > 0 && owner?.buffs.has(BuffType.Sonar)) {
      let name: string | null = null;
      if (this.catchEnemy > 0) {
        name = Lang.npcName(this.catchEnemy);   // SonarAlert 弹 NPC 名（:19358）
      } else {
        const label = this.sonarLabel();
        if (label) {
          const m = /^vi_(\d+)_/.exec(label);
          const vid = m ? +m[1] : 0;
          name = vid > 0
            ? (Lang as unknown as { itemName?: (v: number) => string }).itemName?.(vid) ?? null
            : null;
          if (!name) name = label;
        }
      }
      if (name) {
        ctx.fillStyle = this.catchEnemy > 0 ? '#C04040' : '#9FD8FF';   // 敌怪红名（同预掷尘色）
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(name, 0, -12);
      }
    }
    ctx.restore();
  }
}

// ================= 钓线（DrawProj_FishingLine,Main.cs:34967-35201 1:1）=================

/** 竿尖偏移表（:35017-35106 逐 case;dir<0 再 −13;Y 项 ×gravDir（:35023 等
 *  −M·gravDir——gravDir=-1 重力药水倒置时取反））——1457/1458 同值（1458 Main.cs:36145-36233 复核） */
export const POLE_TIP: Record<number, [number, number]> = {
  2289: [43, -36], 2291: [43, -34], 2292: [46, -34], 2293: [43, -34],
  2294: [43, -30], 2295: [43, -30], 2296: [43, -30],
  2421: [47, -36], 2422: [47, -32], 4325: [44, -32], 4442: [44, -32],
};
/** 线色（:34988-35010;基色 (200,200,200,100) + 逐竿覆写;α=100 半透） */
export const POLE_STRING_COLOR: Record<number, [number, number, number]> = {
  2294: [100, 180, 230], 2295: [250, 90, 70], 2293: [203, 190, 210],
  2421: [183, 77, 112], 2422: [255, 226, 116], 4325: [200, 100, 100],
  4442: [100, 100, 200],
};

/**
 * ItemCheck_HackHoldStyles（Player.cs:53483-53492，1456=1457=1458 同构）纯判定：
 * 钓竿族 holdStyle 先清零；仅当【使用动画窗已收】(ItemTimeIsZero && itemAnimation==0)
 * 且场上存在本人浮漂弹时运行时置 1 → ItemCheck_ApplyHoldStyle :50879/:51002 静持绘制。
 * 返回：-1 = 非钓竿（不接管，沿用物品自身 holdStyle）；0/1 = 钓竿生效档。
 * （Renderer 手持层门 + tests/fishing-rod-hold 直测双消费）
 */
export function hackHoldStyleActive(
  fishingPole: number, hasBobber: boolean, animWindowOver: boolean,
): -1 | 0 | 1 {
  if (fishingPole <= 0) return -1;
  return hasBobber && animWindowOver ? 1 : 0;
}

/** 钓线竿尖起点（Main.cs:34969-35111 全链，纯函数——tests/string-anchor 直测）：
 *  mountedCenter → [mount52 死支] → ApplyItemPositionOffsetFromMount → +gfxOffY
 *  → 逐竿竿尖偏移（dir<0 再 −13；−M·gravDir）→ 倒置抬 12 →
 *  RotatedRelativePoint(+（8,8)−(8,8)（addGfxOffY 默认开——与 :34982 的 +gfxOffY
 *  合计双计，原版同款行为照抄）。 */
export function fishingPoleTipStart(
  owner: import('./Player').Player, poleVid: number,
): { x: number; y: number } {
  // :34969-34982 mountedCenter → mount52 死支（:34973-34976 写 polePos 后被
  // :34979-34980 覆写丢弃——原版同款死代码）→ mount 持物偏移 → +gfxOffY
  const a = owner.fishingPoleAnchorBase();
  let poleX = a.x, poleY = a.y;
  // 逐竿竿尖偏移（:35017-35104）：+N·direction（dir<0 再 −13）、−M·gravDir
  const dir = owner.facing || 1;
  const [ox, oy] = POLE_TIP[poleVid] ?? [0, 0];
  poleX += ox * dir - (dir < 0 ? 13 : 0);
  poleY += oy * owner.gravDir;
  // :35106-35109 倒置再抬 12（gravDir=-1——重力药水）
  if (owner.gravDir === -1) poleY -= 12;
  // :35110-35111 甩竿姿态旋转变换（矿车 TrackRotation/坐骑 Hover 机身角经
  // anchorFullRotation 生效）
  const v = owner.rotatedRelativePoint(poleX + 8, poleY + 8);
  return { x: v.x - 8, y: v.y - 8 };
}

/** 钓线段链绘制（:35112-35201）：竿尖→浮标中心,12px 段;速度/张力摆垂;
 *  FishingLine.png(12×12,取 (0,0,W,(int)num5) 竖条) 逐段旋贴。线色 =
 *  竿基色 → TryApplyingPlayerStringColor(线饰品染料,Main.cs:35013) → GetColor
 *  alpha 重置 255（StringLine 共享模块——预乘混合精确等价;实体层画在光照合成前
 *  =整链自动乘光）。 */
function drawFishingLine(
  ctx: CanvasRenderingContext2D, r: import('../render/Renderer').Renderer,
  b: Bobber, owner: import('./Player').Player,
): void {
  const tex = r.atlas?.ensureVImage?.('vanilla/FishingLine.png');
  if (!tex) return;
  const { x: px, y: py } = fishingPoleTipStart(owner, b.poleVid);
  const base = POLE_STRING_COLOR[b.poleVid] ?? [200, 200, 200];
  drawFishingStringLine(ctx, tex, px, py,
    { x: b.x, y: b.y, w: b.w, h: b.h, vx: b.vx, vy: b.vy, lai0: b.lai0 },
    base, owner.equipStats.stringColor, stringColorOpts(r.lighting?.clock));
}
