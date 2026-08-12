// 钓鱼浮标实体（R7）：抛竿抛物线 → 落水漂浮 → 咬钩窗口 → 收竿掷渔获。
// 原版 Projectile.AI_061_FishingBobber（Projectile.cs:50762-50937）1:1：
//   抛出 grav 抛物线；入液（水/蜜/岩浆）转漂浮；等待 = localAI[1] 累积器
//   （:50897-50914：每 tick += ⌊钓鱼力/30⌋ + rand(1,3) + rand(300)<力 ? rand(1,3) : 0
//   + 1/60 概率 +60；>660 触发 FishingCheck）；
//   咬钩门（FishingCheck :19179-19184）：rand(100) <= ⌊(力+75)/2⌋ 才真咬；
//   咬钩窗口 = ai[1] 取 rand(-240,-90) - 力 的负值，每 tick += rand(1,5)，
//   归零即逃脱（渔获作废，:50918-50934 / :19334/:19344）；
//   窗口内收竿 → rollCatch 掷渔获 + 消耗鱼饵（消耗率 1/(1+bait/6)，钓具箱 +1 分母）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { GRAVITY, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { pickPool, rollCatch, rollRarities, fishingPowerMultiplier } from '../data/vanillaFishing';
import { VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { TILE_DEFS } from '../data/tiles';
import type { World } from '../world/World';
import { BuffType } from '../stats/Buffs';

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
  /** 血月咬钩敌怪（FishingCheck_RollEnemySpawns）——收竿由 Game 侧生成 */
  catchEnemy = 0;
  /** 渔获原版 id → 钓起时落物用 */
  private polePower: number;
  poleVid = 0;
  private baitSlot: number;
  private baitPower: number;
  private ownerRef: () => Player | null;
  private bobPhase = Math.random() * Math.PI * 2;
  private airT = 0;
  /** ai[1]（AI_061）：0 = 等待累积中；<0 = 咬钩窗口（负值幅度 = rand(-240,-90) - 钓鱼力） */
  private ai1 = 0;
  /** localAI[1]：等待累积器（>660 触发 FishingCheck，:50912-50915） */
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

  /** 钓鱼力（竿+饵+药水 121 +15；声呐 122/宝匣 123 由收竿侧消费）。
   *  game 传入时追加 Fishing_GetPowerMultiplier 乘区（Player.cs:41560-41605：
   *  雨/云/晨昏/正午/前半夜/月相/血月） */
  private fishingPower(p: Player, game?: GameHooks): number {
    // buff 121 钓鱼药水 +15（Player.cs:9831 fishingSkill += 15）
    let lvl = this.polePower + this.baitPower + (p.buffs.has(BuffType.Fishing) ? 15 : 0);
    // 幸运度修正（Projectile.cs:19267-19276 FishingAttempt 主干，1:1）：
    //   luck<0 且 rand<|luck| → ×(0.9 - rand*0.3)（0.6-0.9 倍）
    //   luck>0 且 rand<luck  → ×(1.1 + rand*0.3)（1.1-1.4 倍）
    const luck = p.luck;
    if (luck < 0) {
      if (Math.random() < -luck) lvl = Math.floor(lvl * (0.9 - Math.random() * 0.3));
    } else if (Math.random() < luck) {
      lvl = Math.floor(lvl * (1.1 + Math.random() * 0.3));
    }
    // Fishing_GetPowerMultiplier（:41560-41605）：天气/时段/月相/血月乘区
    if (game) {
      const w = game.world as World;
      const t = w.clock.timeOfDay;
      const isDay = w.clock.isDay; // 昼夜边界以 Clock 为准（4:30/19:30）
      lvl = Math.floor(lvl * fishingPowerMultiplier({
        raining: !!w.weather?.raining,
        cloudBGAlpha: w.weather?.cloudAlpha ?? 0,
        dayTime: isDay,
        time: isDay ? ((t - 0.25) / 0.5) * 54000 : ((((t - 0.75) + 1) % 1) / 0.5) * 32400,
        moonPhase: w.clock.moonPhase,
        bloodMoon: !!w.clock.bloodMoon,
      }));
    }
    return lvl;
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

  /** FishingCheck（Projectile.cs:19175-19185）+ TryBuildFishingContext 水体段
   *  （:19188-19249）：咬钩门 rand(100) <= ⌊(钓鱼力+75)/2⌋；水体 <75 直接不咬。 */
  private fishingCheck(p: Player, game: GameHooks, idx: number): void {
    const w = game.world as World;
    const st = w.store;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
    const pond = getFishingPondState(game, tx, ty);   // GetFishingPondState :20170-20201
    if (pond.waterTilesCount < 75) return;            // :19208-19211 NotEnoughWater
    let level = this.fishingPower(p, game);           // FinalFishingLevel（Player.cs:41536-41557）
    // 水量缩放（:19234-19249）：atmo = ⌊(Y/16 - (60 + 10·(W/4200)²)) / (地表/6)⌋ 截 [0.25,1]
    const atmoNum = (st.w / 4200) ** 2;
    let atmo = (this.y / TILE - (60 + 10 * atmoNum)) / (w.groundLevel / 6);
    if (atmo < 0.25) atmo = 0.25;
    if (atmo > 1) atmo = 1;
    const waterNeeded = Math.floor(300 * atmo);       // waterNeededToFish = 300 × atmo
    if (waterNeeded > 0) {
      const quality = pond.waterTilesCount / waterNeeded;
      if (quality < 1) level = Math.floor(level * quality);   // :19244-19246
    }
    // 咬钩门（:19179-19184）：Next(100) <= ⌊(力+75)/2⌋ 才真咬（否则空拍再等下一轮）
    const num = Math.floor((level + 75) / 2);
    if (Math.floor(Math.random() * 100) > num) return;
    // 血月钓鱼敌怪（FishingCheck_RollEnemySpawns :19399-19427，SetFishingCheckResults
    // 内先敌怪后渔获）：水中、血月夜、1/6（血肉抛竿 4325 → 1/3）→ 咬的是敌怪：
    // 困难 {620,621,586,587}+1/10 恐惧鹦鹉螺 618；非困难 {586,587}。
    this.catchEnemy = 0;
    const inWater = st.liquidType[idx] !== 2 && st.liquidType[idx] !== 3;
    if (inWater && w.clock.bloodMoon && !w.clock.isDay) {
      const chance = this.poleVid === 4325 ? 3 : 6;
      if (Math.random() < 1 / chance) {
        // 红色城镇史莱姆首获（:19413-19416：世界级一次性旗标，1/5 优先于敌怪表；
        //  收竿侧置 unlockedSlimeRedSpawn）
        if (!w.flags.unlockedSlimeRedSpawn && Math.random() < 0.2) {
          this.catchEnemy = 682;
        } else {
          const hard = w.flags.hardMode;
          const poolE = hard ? [620, 621, 586, 587] : [586, 587];
          this.catchEnemy = hard && Math.random() < 0.1 ? 618
            : poolE[Math.floor(Math.random() * poolE.length)];
        }
        this.openBiteWindow(level);
        game.playSfx('splash', 0.8);
        game.spawnParticles(this.cx, this.cy, '#C04040', 6, 1.5, { life: 24 });
        return;
      }
    }
    const pool = pickPool({
      liquid: (st.liquidType[idx] === 2 ? 'lava' : st.liquidType[idx] === 3 ? 'honey' : 'water'),
      zone: this.zoneOf(game),
      depth: this.depthOf(game),
      zoneOcean: this.zoneOcean(game, pond.waterTilesCount),
    });
    this.catchId = rollCatch(level, pool, p.buffs.has(BuffType.Crate), {
      rarity: rollRarities(level),
      bloodMoon: !!w.clock.bloodMoon,
      combatBook: !!w.flags.combatBookWasUsed,
    });
    this.openBiteWindow(level);
    game.playSfx('splash', 0.8);
    game.spawnParticles(this.cx, this.cy, '#80B8FF', 6, 1.5, { life: 24 });
  }

  /** 开咬钩窗口（SetFishingCheckResults :19334 / :19344）：
   *  ai[1] = rand(-240,-90) - 钓鱼力（负值，窗口长短随钓鱼力递增） */
  private openBiteWindow(level: number): void {
    this.ai1 = nextInt(-240, -90) - level;
  }

  /** 收竿（窗口内）：返回渔获原版 id（0=没咬/没饵/血月敌怪——后者查 catchEnemy）；消耗鱼饵 */
  reel(game: GameHooks): number {
    if (this.biteT <= 0 || (!this.catchId && !this.catchEnemy)) return 0;
    const p = this.ownerRef();
    if (!p) return 0;
    // 声呐药水（buff 122）：咬钩时已掷——由 Game 侧显示（本实体的 catchId 预存）
    this.consumeBait(p);
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

  private zoneOf(game: GameHooks): string {
    const w = game.world as World;
    const x = Math.floor(this.cx / TILE);
    const y = Math.floor(this.cy / TILE);
    const st = w.store;
    // 按 tile key 采样（玩家 zone 通道未接此处，浮标位置独立判定）
    for (let dy = -2; dy <= 0; dy++) {
      const t = st.get(x, y + dy);
      const key = t ? TILE_DEFS[t]?.key ?? '' : '';
      if (!key) continue;
      if (/corrupt/.test(key)) return 'corrupt';
      if (/crimson/.test(key)) return 'crimson';
      if (/hallow/.test(key)) return 'hallow';
      if (/jungle/.test(key)) return 'jungle';
      if (/snow/.test(key)) return 'snow';
    }
    return 'forest';
  }

  private depthOf(game: GameHooks): 'sky' | 'surface' | 'cavern' | 'underworld' {
    const w = game.world as World;
    const y = Math.floor(this.cy / TILE);
    if (y < Math.floor(w.groundLevel * 0.35)) return 'sky';
    if (y <= w.groundLevel + 10) return 'surface';
    if (y > (w.lavaLine || w.store.h - 200)) return 'underworld';
    return 'cavern';
  }

  /** 海洋判定（FishingCheck_RollItemDropOld :19886）：heightLevel <= 1（浮标在地表以上，
   *  即 Y < worldSurface）&& 横向边缘 380 格内 && 该处水体 >1000 格——三者同时成立。 */
  private zoneOcean(game: GameHooks, waterTilesCount: number): boolean {
    const w = game.world as World;
    const x = Math.floor(this.cx / TILE);
    const y = Math.floor(this.cy / TILE);
    return y < w.groundLevel && (x < 380 || x > w.store.w - 380) && waterTilesCount > 1000;
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
    ctx.restore();
  }
}
