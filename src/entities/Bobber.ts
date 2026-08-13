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
import type { GameHooks } from './types';
import type { Player } from './Player';
import { GRAVITY, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import {
  fishingPowerMultiplier, rollDropLevels, rollJunk, heightLevelOf, prepareFishingContext,
  tryGetItemDrop, CAN_FISH_IN_LAVA_POLES, IS_LAVA_BAIT, ANGLER_QUEST_ITEMS,
  type ZoneInput,
} from '../data/vanillaFishing';
import { VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { VI_ID } from '../data/itemKeys';
import type { World } from '../world/World';
import { BuffType } from '../stats/Buffs';
import { Lang } from '../i18n/Lang';

type LiquidType = 'water' | 'lava' | 'honey';

/** Main.rand.Next(min, max)（左闭右开） */
function nextInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min));
}

interface PondState { lava: boolean; honey: boolean; waterTilesCount: number }

/** GetFishingPondState（Projectile.cs:20170-20201）1:1：
 *  先横向扩到水体边缘（GetFishingPondWidth :20203-20213，越界停于 10 / W-10），
 *  再逐列向下数液格（solid 或无液即停，越界停于 H-10）；蜂蜜池 ×1.5。 */
function getFishingPondState(game: GameHooks, x: number, y: number): PondState {
  const st = (game.world as World).store;
  const liquidAt = (i: number, j: number) =>
    st.inBounds(i, j) ? st.liquid[st.idx(i, j)] : 0;
  let minX = x, maxX = x;                                     // :20205-20212
  while (minX > 10 && liquidAt(minX, y) > 0 && !st.isSolid(minX, y)) minX--;
  while (maxX < st.w - 10 && liquidAt(maxX, y) > 0 && !st.isSolid(maxX, y)) maxX++;
  let lava = false, honey = false, numWaters = 0;             // :20174-20177
  for (let i = minX; i <= maxX; i++) {                        // :20180-20194
    for (let j = y; st.inBounds(i, j) && liquidAt(i, j) > 0 && !st.isSolid(i, j) && j < st.h - 10; j++) {
      numWaters++;
      const lt = st.liquidType[st.idx(i, j)];
      if (lt === 2) lava = true;                              // tile.lava()
      else if (lt === 3) honey = true;                        // tile.honey()
    }
  }
  if (honey) numWaters = Math.floor(numWaters * 1.5);         // :20197-20200
  return { lava, honey, waterTilesCount: numWaters };
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
  /** 鱼饵原版 id（IsLavaBait / CanFishInLava 三源判定用，:19230/:19371-19382） */
  baitVid = 0;
  private baitSlot: number;
  private baitPower: number;
  private ownerRef: () => Player | null;
  private bobPhase = Math.random() * Math.PI * 2;
  private airT = 0;
  /** ai[1]（AI_061）：0 = 等待累积中；<0 = 咬钩窗口（负值幅度 = rand(-240,-90) - 钓鱼力） */
  private ai1 = 0;
  /** localAI[1]：等待累积器（>660 触发 FishingCheck，:50943-50947） */
  private lAI1 = 0;

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
    if (p.equipStats.waterWalk) base += 5;  // canFloatInWater 漂浮态（:41546-41549;waterWalk 族=漂浮资格）   // 装备侧渔力（钓具族+渔夫甲+软糖虫,:12549-12556/:13022-13027/:12451）
    if (p.buffs.has(BuffType.Tipsy)) base += 5;                  // buff 25 :41542-41545
    if (game) {
      const w = game.world as World;
      const t = w.clock.timeOfDay;
      const isDay = w.clock.isDay; // 昼夜边界以 Clock 为准（4:30/19:30）
      base = Math.floor(base * fishingPowerMultiplier({          // :41555-41556
        raining: !!w.weather?.raining,
        cloudBGAlpha: w.weather?.cloudAlpha ?? 0,
        dayTime: isDay,
        time: isDay ? ((t - 0.25) / 0.5) * 54000 : ((((t - 0.75) + 1) % 1) / 0.5) * 32400,
        moonPhase: w.clock.moonPhase,
        bloodMoon: !!w.clock.bloodMoon,
      }));
    }
    return base;
  }

  fixedUpdate(dt: number, game: GameHooks) {
    void dt;
    const p = this.ownerRef();
    if (!p || p.dead) { this.dead = true; return; }
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
        this.vx = 0; this.vy = 0;
        // 原版浮标经 AI_061_GetWaterLine（:50947-50978）沉到液面以下、中心格 wet；
        // 此处把中心对齐到入液行中部，保证 FishingCheck 的 Center/16 坐标落在液格内
        const rowY = Math.floor((this.y + this.h) / TILE);
        this.y = rowY * TILE + (TILE - this.h) / 2;
        game.playSfx('splash', 0.6);
      } else if (liqType === 'lava') {
        // 岩浆：无熔线钓钩配饰则浮标烧毁（accLavaFishing 门）
        const canLava = this.ownerLavaOk();
        if (!canLava) { this.dead = true; return; }
        this.floating = true;
        this.vx = 0; this.vy = 0;
        const rowYL = Math.floor((this.y + this.h) / TILE);
        this.y = rowYL * TILE + (TILE - this.h) / 2;
      } else if (++this.airT > 600) {
        this.dead = true; // 落地未入水超时
      }
      return;
    }
    // 漂浮：水面起伏
    this.bobPhase += 0.15;
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
    const pond = getFishingPondState(game, tx, ty);   // GetFishingPondState :20170-20201
    if (pond.waterTilesCount < 75) return;            // :19206-19210 NotEnoughWater
    // 松露虫（:19212-19224）：永不出鱼；两侧海洋带（X<380||>w-380，浮标格）且池液>1000
    // 且场上无 Duke → 开咬钩窗（-280..-160，localAI[1]=1 "有咬"）
    if (this.baitVid === 2673) {
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
    const canFishInLava = CAN_FISH_IN_LAVA_POLES.has(this.poleVid)   // :19230 三源
      || IS_LAVA_BAIT.has(this.baitVid) || this.ownerLavaOk();
    // chumsInWater 三档加成（:19231-19242）——鱼饵桶投射物未实装，恒 0（登记）
    // 水量缩放（:19244-19261）：atmo = (Y/16 - (60 + 10·(W/4200)²)) / (地表/6) 截 [0.25,1]
    const atmoNum = (st.w / 4200) ** 2;
    let atmo = (this.y / TILE - (60 + 10 * atmoNum)) / (w.groundLevel / 6);
    if (atmo < 0.25) atmo = 0.25;
    if (atmo > 1) atmo = 1;
    const waterNeeded = Math.floor(300 * atmo);       // :19256 waterNeededToFish = 300 × atmo
    if (pond.waterTilesCount / waterNeeded < 1) {
      level = Math.floor(level * (pond.waterTilesCount / waterNeeded));   // :19258-19261
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
          const poolE = [620, 621, 586, 587];
          this.catchEnemy = Math.floor(Math.random() * 10) === 0 ? 618   // :19420-19423
            : poolE[Math.floor(Math.random() * poolE.length)];
        } else {
          this.catchEnemy = Math.random() < 0.5 ? 586 : 587;             // :19427
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
      zones, rolled: prepareFishingContext(zones, heightLevel, ty, w.rockLevel),   // :19451-19502
    });
    if (this.catchId > 0 || this.catchEnemy > 0) {
      this.openBiteWindow(level);                     // :19348/:19362
      game.playSfx('splash', 0.8);
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

  /** 收竿（窗口内）：返回渔获原版 id（0=没咬/没饵/血月敌怪——后者查 catchEnemy）；消耗鱼饵 */
  reel(game: GameHooks): number {
    if (this.biteT <= 0 || (!this.catchId && !this.catchEnemy && !this.truffleBite)) return 0;
    const p = this.ownerRef();
    if (!p) return 0;
    // 声呐药水（buff 122）：咬钩时已掷——由 Game 侧显示（本实体的 catchId 预存）
    this.consumeBait(p);
    if (this.truffleBite) {
      // 松露虫咬钩（PullBobber :51563-51576）：必耗饵 + 召 Duke——-1 哨兵交 Game 侧
      this.truffleBite = false;
      this.dead = true;
      void game;
      return -1;
    }
    const caught = this.catchId;
    this.catchId = 0;
    this.dead = true;
    void game;
    return caught;
  }

  /** 鱼饵消耗（:51640：1/(1+bait/6)，钓具箱 +1 分母） */
  private consumeBait(p: Player): boolean {
    const slot = p.inv.slots[this.baitSlot];
    if (!slot) return false;
    if (this.baitVid === 2673) {           // :51671-51674 松露虫必耗
      p.inv.removeAt(this.baitSlot, 1);
      return true;
    }
    const chance = 1 / (1 + this.baitPower / 6 + (this.tackleBox(p) ? 1 : 0));
    if (Math.random() < chance) p.inv.removeAt(this.baitSlot, 1);
    return true;
  }

  private tackleBox(p: Player): boolean {
    // 钓具箱族（accfx 未提取该字段——经装备名快速判定，渔夫耳环 2374/渔具袋 3721/钓具箱 2375）
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
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.fillStyle = this.biteT > 0 ? '#FF6060' : '#E04838';
    const dip = this.biteT > 0 ? 2 : Math.sin(this.bobPhase) * 1.5;
    ctx.beginPath();
    ctx.arc(0, dip, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(-1, dip - 6, 2, 4); // 竿线连杆近似
    // 声呐药水（buff 122,Projectile.cs:19340-19346）：咬钩时浮标上方弹渔获名——
    // 此前 sonarLabel 数据在而零消费（音效域 #19/钓鱼域 B19,2026-08-13 接）
    const owner = this.ownerRef();
    if (this.biteT > 0 && owner?.buffs.has(BuffType.Sonar)) {
      const label = this.sonarLabel();
      if (label) {
        const m = /^vi_(\d+)_/.exec(label);
        const vid = m ? +m[1] : 0;
        const name = vid > 0 ? (Lang as unknown as { itemName?: (v: number) => string }).itemName?.(vid) : null;
        ctx.fillStyle = '#9FD8FF';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(name ?? label, 0, -12);
      }
    }
    ctx.restore();
  }
}
