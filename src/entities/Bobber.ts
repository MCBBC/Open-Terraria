// 钓鱼浮标实体：抛竿抛物线 → 落水漂浮 → 咬钩窗口 → 收竿掷渔获。
// 原版 Projectile.AI_061_FishingBobber（Projectile.cs:50762-50937）1:1：
//   抛出 grav 抛物线；入液（水/蜜/岩浆）转漂浮；等待 = localAI[1] 累积器
//   （:50930-50947：每 tick += ⌊FinalFishingLevel/30⌋ + rand(1,3) + rand(300)<力 ? rand(1,3) : 0
//   + 1/60 概率 +60；>660 触发 FishingCheck）；
//   FishingCheck（:19175-19187）→ TryBuildFishingContext（:19189-19331，本实体
//   fishingCheck 内 1:1：水量/atmo 缩放/幸运度/heightLevel/junk/五档/任务鱼探测）
//   → 咬钩门 rand(100) <= ⌊(力+75)/2⌋ → SetFishingCheckResults（:19333-19396：
//   敌怪先掷、渔获后掷）→ FishDropRuleList 全量表掷渔获（FishDropRule.cs:31-51）；
//   咬钩窗口 = ai[1] 取 rand(-240,-90) - 力 的负值，每 tick += rand(1,5)，
//   归零即逃脱（渔获作废，:50949-50960 / :19348/:19362）；
//   窗口内收竿 → 消耗鱼饵（消耗率 1/(1+bait/6)，钓具箱 +1 分母）。
import { Entity } from './Entity';
import { projFrameImg } from './Arrow';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { GRAVITY, TILE } from '../core/constants';
import { Clock } from '../world/World';
import { moveAndCollide } from '../physics/TileCollision';
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
/** 浮漂弹盒（SetDefaults :4511-4522 width=height=14——Kill 触玩家盒判定用） */
export const BOBBER_BOX = 14;

/** Main.rand.Next(min, max)（左闭右开） */
function nextInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min));
}

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
  w = 8; h = 8;
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
  /** 渔获原版 id → 钓起时落物用 */
  private polePower: number;
  poleVid = 0;
  /** 原版弹型（鱼竿→浮标映射，bobberProjIdFor；ProjLight 光由 Game 标量循环结算：
   *  987-993 七色浮漂 light=1×各乘区——曾在无 projId 下整族无光） */
  projId = 360;
  /** 鱼饵原版 id（IsLavaBait / CanFishInLava 三源判定用，:19230/:19371-19382） */
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
  /** localAI[1]：等待累积器（>660 触发 FishingCheck，:50943-50947） */
  private lAI1 = 0;
  /** ai[0]（AI_061 :54635 起）：0=飞行/漂浮；1=收线中（PullFishingBobbers :53031 /
   *  超 900px :54704）；2=断线/敌怪收线（收线首 tick 播 Item17+溅水一次后自增 3，
   *  :54636-54645）。收线飞行 tileCollide=false 直移、触玩家盒即 Kill（:54666-54668） */
  retract = 0;
  /** 当前浮着液体（入液时登记；AI_061 wet/lavaWet/honeyWet 三位最小投影——
   *  收线断线溅水门 :54641-54644 岩浆/蜂蜜免溅用） */
  liquidKind: 'water' | 'lava' | 'honey' | null = null;
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
    //      ★切物品即断线收漂的原版语义（此前缺失=换手持竿浮漂永生）----
    const held = p.inv.heldItem();
    const hdef = held ? ITEM_DEFS[held.id] : undefined;
    const hv = hdef ? +(/^vi_(\d+)_/.exec(hdef.key)?.[1] ?? -1) : -1;
    const hf = hv >= 0 ? itemFuncOfVid(hv) : null;
    const lavaBobberAcc = this.projId >= 986 && this.projId <= 993;
    if (!((hf?.fishingPole ?? 0) > 0) || p.cced || p.buffs.has(BuffType.Cursed)
      || (!lavaBobberAcc && (hf?.shoot ?? 0) !== this.projId)
      || p.pulley) {
      this.dead = true;
      return;
    }
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
      this.x += this.vx;
      this.y += this.vy;                    // tileCollide=false（:54652）无碰撞直移
      // Hitbox.Intersects(player.Hitbox)（:54666-54668）：14×14 弹盒 vs 玩家盒
      if (this.cx + BOBBER_BOX / 2 > p.x && this.cx - BOBBER_BOX / 2 < p.x + p.w
        && this.cy + BOBBER_BOX / 2 > p.y && this.cy - BOBBER_BOX / 2 < p.y + p.h) {
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
      moveAndCollide(this, game.world, this.vx, this.vy);
      if (liqType === 'water' || liqType === 'honey') {
        this.floating = true;
        this.liquidKind = liqType;
        this.vx = 0; this.vy = 0;
        // 原版浮标经 AI_061_GetWaterLine（:50947-50978）沉到液面以下、中心格 wet；
        // 此处把中心对齐到入液行中部，保证 FishingCheck 的 Center/16 坐标落在液格内
        const rowY = Math.floor((this.y + this.h) / TILE);
        this.y = rowY * TILE + (TILE - this.h) / 2;
        game.playSfx('splash', 1);
      } else if (liqType === 'lava') {
        // 岩浆：无熔线钓钩配饰则浮标烧毁（accLavaFishing 门）
        const canLava = this.ownerLavaOk();
        if (!canLava) { this.dead = true; return; }
        this.floating = true;
        this.liquidKind = 'lava';
        this.vx = 0; this.vy = 0;
        const rowYL = Math.floor((this.y + this.h) / TILE);
        this.y = rowYL * TILE + (TILE - this.h) / 2;
      } else if (++this.airT > 600) {
        this.dead = true; // 落地未入水超时
      }
      return;
    }
    if (this.ai1 < 0) {
      // 咬钩窗口（AI_061 :50918-50934）：ai[1] 每 tick += rand(1,5)；
      // 归零 = 逃脱——localAI[1] 清零（渔获作废），回到等待累积
      this.ai1 += nextInt(1, 5);
      if (this.ai1 >= 0) {
        this.ai1 = 0;        // :50930
        this.lAI1 = 0;       // :50931（渔获作废）
        this.catchId = 0;
        this.catchEnemy = 0;
        this.truffleBite = false;
      }
      return;
    }
    // 等待累积（AI_061 :50897-50915）
    const level = this.fishingPower(p, game);
    if (Math.floor(Math.random() * 300) < level) this.lAI1 += nextInt(1, 3);   // :50900-50902
    this.lAI1 += Math.floor(level / 30);                                       // :50903
    this.lAI1 += nextInt(1, 3);                                                // :50904
    if (Math.floor(Math.random() * 60) === 0) this.lAI1 += 60;                 // :50905-50908
    if (this.lAI1 > 660) {
      this.lAI1 = 0;                                                           // :50912
      this.fishingCheck(p, game, idx);
    }
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
    // heightLevel（:19306-19325 非 remix 分支）/ junk（:19326）/ 五档（:19327）
    const heightLevel = heightLevelOf(ty, w.groundLevel, w.rockLevel, st.h);
    const junk = rollJunk(level, pond.waterTilesCount, waterNeeded);
    const levels = rollDropLevels(level, p.buffs.has(BuffType.Crate));
    const questFish = this.probeQuestFish(p, game);   // :19328 → :20089-20104
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
    // AnyEnemies stopper 居表首 → 敌怪已掷出时恒 0（互斥由表保证）
    const zones = this.zonesOf(game);
    this.catchId = tryGetItemDrop({
      inLava: pond.lava, inHoney: pond.honey, junk, crate: levels.crate,
      common: levels.common, uncommon: levels.uncommon, rare: levels.rare,
      veryrare: levels.veryrare, legendary: levels.legendary,
      anyEnemies: this.catchEnemy > 0, canFishInLava,
      x: tx, y: ty, waterTilesCount: pond.waterTilesCount,
      rockLayer: w.rockLevel, maxTilesX: st.w, heightLevel, questFish,
      hardMode: !!w.flags.hardMode, bloodMoon: !!w.clock.bloodMoon,
      combatBookWasUsed: !!w.flags.combatBookWasUsed, remix: false,
      zones, rolled: prepareFishingContext(zones, heightLevel, ty, w.rockLevel,
        undefined, !!w.seedFlags?.notTheBees),   // :19451-19502（R14-E13② NTB 弃丛林掷）
    });
    if (this.catchId > 0 || this.catchEnemy > 0) {
      this.openBiteWindow(level);                     // :19348/:19362
      game.playSfx('splash', 1);
      // 声呐药水音效（Projectile.cs:19340-19346 SoundID Item9——文字已接、音效 2026-08-13 补）
      if (p.buffs.has(BuffType.Sonar)) game.playSfxFile?.('Item_9', 0.8, this.cx, this.cy);
      game.spawnParticles(this.cx, this.cy, this.catchEnemy > 0 ? '#C04040' : '#80B8FF',
        6, 1.5, { life: 24 });
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

  /** AI_061_FishingBobber_DoASplash（Projectile.cs:54839-54852）近似：
   *  水花尘团（原版 100 粒水尘 noGravity，此处粒子池口径 24 粒）+ 溅水音 19 */
  private doSplash(game: GameHooks): void {
    game.spawnParticles(this.cx, this.cy - 4, '#A8D8F0', 24, 2, { life: 30 });
    game.playSfx('splash', 1);
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
    // 收到即得，无飞行携物），浮漂此处即灭=竿静持随之解除
    this.dead = true;
    void game;
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
