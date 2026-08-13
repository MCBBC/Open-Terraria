// 掉落物实体：重力、落地、磁吸拾取
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { ITEM_GRAVITY, ITEM_MAX_FALL, MAGNET_RADIUS, PICKUP_DELAY, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { ITEM_DEFS } from '../data/items';
import { coinIndexOf } from '../items/Inventory';
import type { Player } from './Player';
import {
  canShimmerItem, coinLuckAmount, getTransformToItem,
  decraftOutcome, isItemDecraftableAndUnlocked,
  internalIdOfVanilla, vanillaIdOfItem,
  makeNpcOfItem, npcShimmerTransformTo,
} from '../stats/Shimmer';
import { VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { liquidCollision } from '../stats/TouchDamage';
import itemRareJson from '../data/vanilla-itemrare.json';
import { spawnWOF } from './bossAI_wof';
import type { TownNPC } from './TownNPC';

/** Item.rare（tools 提取，缺省 0 = 白色——Item.cs 类默认）
 *  CheckLavaDeath else 分支的 (rare==0 || rare==-1) 烧毁门用（WorldItem.cs:803） */
const ITEM_RARE = itemRareJson as Record<string, number>;
/** ItemID.Sets.IsLavaImmuneRegardlessOfRarity（ItemID.cs:62）：黑曜石肤族/
 *  熔岩护身符族等 18 件——rare 高于 0 也照烧豁免名单外，此名单内恒免疫 */
const LAVA_IMMUNE_ITEMS = new Set([
  318, 312, 173, 174, 175, 4422, 2701, 205, 206, 207, 1128, 2340, 2739, 2492, 1127, 85, 581, 582,
]);

export class ItemDrop extends Entity {
  w = 12; h = 12;
  itemId: number;
  stack: number;
  age = 0;
  bobPhase: number;
  /** 原版 Item.color（凝胶等掉落继承怪物色，逐像素乘法贴轮廓渲染） */
  color?: number[]; // [r, g, b, a]
  /** 心(58)/星(184) 是 pickup 类物品（ItemID.Sets.IsAPickup, ItemID.cs:248）：
   *  碰触即回血 20 / 回蓝 100 并消失，永不进背包（Player.PickupItem :34610-34630） */
  pickup?: 'heart' | 'star';
  /** 原版 Item.noGrabDelay：玩家主动抛出的物品 =100t（Player.cs:4990/:4996
   *  DropSelectedItem），期间抛出者拾不回；普通战利品 0（走全局 PICKUP_DELAY） */
  noGrabDelay = 0;
  // ---- 微光（WorldItem.cs:25-27/434/486-558/806-840/1781-1931）----
  /** 浸在微光中（Collision.shimmer 盒命中，:434/:944） */
  shimmerWet = false;
  /** 已被微光转化（上浮漂浮、暂不可拾取，:34466 速度 <0.2 才可拾） */
  shimmered = false;
  /** 微光浸入进度 0-1（:27/:806-840 +0.01/t，>0.9 触发 GetShimmered；离池衰减） */
  shimmerTime = 0;

  constructor(x: number, y: number, itemId: number, stack = 1, vx = 0, vy = -2) {
    super();
    this.x = x; this.y = y;
    this.itemId = itemId;
    this.stack = stack;
    this.vx = vx;
    this.vy = vy;
    this.bobPhase = Math.random() * Math.PI * 2;
  }

  fixedUpdate(dt: number, game: GameHooks) {
    this.age++;
    // 寿命（10 分钟）
    if (this.age > 60 * 600) { this.dead = true; return; }

    const player = (game as unknown as { player: Player }).player;
    let beingGrabbed = false;
    if (player && !player.dead && this.age > PICKUP_DELAY && this.age > this.noGrabDelay) {
      // 原版 GrabItems(Player.cs:34461-34524):hitbox 相交=直接拾取;
      // 否则玩家盒 ±42px(defaultItemGrabRange :2406)扩展盒相交=拉取；
      // 宝藏磁石(+94)/金戒指族(+12)扩展范围（Player.grabRangeBonus 聚合）
      const GRAB_RANGE = 42 + ((player as { grabRangeBonus?: number }).grabRangeBonus ?? 0)
        // 拾心药水（lifeMagnet）：红心单独扩大拾取范围
        + (this.pickup === 'heart' ? ((player as { heartGrabBonus?: number }).heartGrabBonus ?? 0) : 0)
        // 魔力磁石（manaMagnet：星 184/1735/1868 专用吸附，Player.cs:34495 专属拉取通道）
        + (this.pickup === 'star' ? ((player as { manaMagnetBonus?: number }).manaMagnetBonus ?? 0) : 0);
      const touching =
        this.x < player.x + player.w && this.x + this.w > player.x &&
        this.y < player.y + player.h && this.y + this.h > player.y;
      const inGrabRange =
        this.x < player.x + player.w + GRAB_RANGE && this.x + this.w > player.x - GRAB_RANGE &&
        this.y < player.y + player.h + GRAB_RANGE && this.y + this.h > player.y - GRAB_RANGE;
      // 微光化物品上浮中不可拾（GrabItems Player.cs:34466：shimmered 且速度 ≥0.2 跳过）
      const grabbable = !(this.shimmered && Math.hypot(this.vx, this.vy) >= 0.2);
      if (touching && grabbable) {
        if (this.pickup) {
          if (this.pickup === 'heart') {
            player.hp = Math.min(player.maxHp, player.hp + 20);
            game.addDamageNumber(player.cx, player.y, 20, false, '#40E080');
          } else {
            player.mana = Math.min(player.maxMana, player.mana + 100);
            game.addDamageNumber(player.cx, player.y, 100, false, '#4080FF');
          }
          this.dead = true;
          game.playSfx('pickup', 0.75); // 原版 SoundID 7 Grab
          return;
        }
        const before = this.stack;
        const left = player.inv.add(this.itemId, this.stack);
        // 成就：拾取通知（AchievementsHelper.NotifyItemPickup——仅入包部分；
        //  WorldItem 拾取路径，合成/初始装备不经此）
        if (left < before) {
          const vid = vanillaIdOfItem(this.itemId);
          if (vid > 0) game.achievements?.notifyItemPickup(vid);
        }
        if (left === 0) {
          this.dead = true;
          game.notifyInventoryChanged();
          // 钱币拾取用专属音效，其余走通用拾取（vi_71-74 单轨）
          // 音量略低（0.75）：拾取与挖掘声同时触发时两者都可闻，不被 Grab 盖住
          game.playSfx(coinIndexOf(this.itemId) >= 0 ? 'coin' : 'pickup', 0.75);
          const def = ITEM_DEFS[this.itemId];
          if (def) game.showPickupLabel(def.key);
          return;
        }
        if (left !== before) game.notifyInventoryChanged();
        this.stack = left;
      } else if (inGrabRange) {
        // PullItem_Common(:34533-34584):每轴 0.45 步进、钳 4(水平含 player.vx),
        // 速度反向时附加 ×0.75 反拉——被拉取帧跳过瓦片碰撞(WorldItem.cs:587-597
        // else 分支仅 position+=velocity),物品穿墙飞向玩家
        beingGrabbed = true;
        const SPEED = 0.45, MAXV = 4, BACK = 0.75;
        if (player.cx > this.cx) {
          if (this.vx < MAXV + player.vx) this.vx += SPEED;
          if (this.vx < 0) this.vx += SPEED * BACK;
        } else {
          if (this.vx > -MAXV + player.vx) this.vx -= SPEED;
          if (this.vx > 0) this.vx -= SPEED * BACK;
        }
        if (player.cy > this.cy) {
          if (this.vy < MAXV) this.vy += SPEED;
          if (this.vy < 0) this.vy += SPEED * BACK;
        } else {
          if (this.vy > -MAXV) this.vy -= SPEED;
          if (this.vy > 0) this.vy -= SPEED * BACK;
        }
      }
    }

    if (beingGrabbed) {
      // 原版被抓取帧:无重力无碰撞,直接位移(WorldItem.cs:596 ApplyMovement)
      this.x += this.vx;
      this.y += this.vy;
    } else {
      // 液体采样（身体中心格；本仓液体编码 1水 2岩浆 3蜂蜜 4微光）
      const st0 = game.world.store;
      const ci = st0.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE));
      const wetType = st0.liquid[ci] > 30 ? st0.liquidType[ci] : 0;
      this.shimmerWet = wetType === 4;
      if (this.shimmered) {
        // 已微光化：无重力上浮（:486-511 gravity=0，vy -0.05/t 钳 -4）
        this.vy = Math.max(this.vy - 0.05, -4);
        this.vx *= 0.95;
        // 上浮白光尘（WorldItem.cs:488-497）：1/30t 一枚 dust 309，盒内随机点 +
        // 抖动 X∈[-8,5) Y∈[-8,5)，四色表 1/1/1/3 权重（255,255,210 / 190,245,255 /
        // 255,150,255 / 190,175,255），scale×1.1、velocity×0.3 近似静态
        if (Math.random() < 1 / 30) {
          const c = Math.floor(Math.random() * 6);
          const color = c === 0 ? '#FFFFD2' : c === 1 ? '#BEF5FF' : c === 2 ? '#FF96FF' : '#BEAFFF';
          game.spawnParticles(
            this.x + Math.random() * this.w + (Math.random() * 13 - 8),
            this.y + Math.random() * this.h + (Math.random() * 13 - 8),
            color, 1, 0.3, { life: 40 + Math.random() * 12, grav: -0.01, size: 1.1 });
        }
      } else {
        // 掉落物液体物理（WorldItem.cs:418-450：空气 0.1/7、水 0.08/5、蜂蜜 0.05/3、
        // 微光 0.065/4；浸液加 wetVelocity 阻尼）——独立于玩家 GRAVITY
        const g = wetType === 1 ? 0.08 : wetType === 3 ? 0.05 : wetType === 4 ? 0.065 : ITEM_GRAVITY;
        const mf = wetType === 1 ? 5 : wetType === 3 ? 3 : wetType === 4 ? 4 : ITEM_MAX_FALL;
        this.vy = Math.min(this.vy + g, mf);
        // 水平摩擦（:928-932 vx*=0.95，|vx|<0.1 归零）
        this.vx *= 0.95;
        if (Math.abs(this.vx) < 0.1) this.vx = 0;
        if (wetType === 1 || wetType === 3) { this.vx *= 0.95; } // 浸液额外阻尼（:440 wetVelocity 近似）
      }
      moveAndCollide(this, game.world, this.vx, this.vy);
      // 岩浆死亡（WorldItem.Update :576-580：MoveInWorld 后 lavaWet → CheckLavaDeath）。
      // 仅非抓取帧（else 分支）——被抓取帧走 ApplyMovement 不检岩浆
      if (liquidCollision(game.world.store, this.x, this.y, this.w, this.h, 2)) {
        this.checkLavaDeath(game);
        if (this.dead) return;
      }
    }
    // 入水小水花声（掉落物轻，音量小）。wet 判定排除岩浆/微光（Collision.cs:1418
    // WetCollision 只认 !lava && !shimmer）；微光入池走专属 Shimmer 音（:19 style 4）
    const st = game.world.store;
    const li = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))];
    const liqType = st.liquidType[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))];
    const wasWater = this.inWater;
    this.inWater = li > 80 && (liqType === 1 || liqType === 3);
    if (this.inWater && !wasWater && this.vy > 1.2) game.playSfx('splash', 0.35);
    if (this.shimmerWet && !this.shimmered) {
      this.updateShimmer(game);
    } else if (this.shimmerTime > 0) {
      // WorldItem.cs:552-558（shimmered 也走）：转化后 shimmerTime 自 1 衰减 -0.01/t
      // ——驱动上浮白光渐亮（lightRGB 读 (1-shimmerTime)*0.8，:511）
      this.shimmerTime = Math.max(0, this.shimmerTime - 0.01);
    }
    void ITEM_DEFS;
  }

  /** 上浮白光（WorldItem.cs:511 AddLight(Center,(1-shimmerTime)*0.8 ×3)）：
   *  转化瞬间 shimmerTime=1 不发光，漂浮 100t 内渐亮至 0.8——Game 点光扫描
   *  drops 桶消费本 getter */
  get lightRGB(): [number, number, number] | null {
    if (!this.shimmered) return null;
    const k = (1 - this.shimmerTime) * 0.8;
    return [k, k, k];
  }
  /** 光源锚点缺省（实体中心，Game 扫描回退语义） */
  lightRGBAt: { x: number; y: number } | null = null;

  /** WorldItem.Shimmering（:806-840）：脚上方格是微光且可转化 → 进度 +0.01/t，
   *  >0.9 触发 GetShimmered；不在微光中则进度衰减。转化触发在本地玩家侧语义
   *  （netMode!=1 门对单人恒真） */
  private updateShimmer(game: GameHooks): void {
    const st = game.world.store;
    const tx = Math.floor(this.cx / TILE);
    // :810-812 采样 (Center.X/16, position.Y/16 - 1)——物品顶上一格
    const ty = Math.floor(this.y / TILE) - 1;
    const vid = vanillaIdOfItem(this.itemId);
    const inShimmer = st.inBounds(tx, ty)
      && st.liquid[st.idx(tx, ty)] > 0 && st.liquidType[st.idx(tx, ty)] === 4;
    const flags = (game.world as unknown as { flags: Record<string, boolean> }).flags ?? {};
    // :49056 decraft 位:有配方可分解的物品也进入微光(原先只有转化目标才进)
    const decraftCtx = {
      stack: this.stack,
      crimsonWorld: !!game.world.crimson,
      downedBoss3: !!(flags['downed_35'] || flags.downedSkeletron),
      downedGolemBoss: !!flags['downed_245'],
    };
    // 月后锁取世界 flags（原版 NPC.downedMoonlord；恒 false 会把月后物永久挡在微光外）
    const downedMoonlord = !!flags['downed_398'];
    // :49052/:49056 运行时门：560 雨中禁入 / 4986 已解锁彩虹史莱姆后禁入
    const shimmerCtx = {
      slimeRain: !!(game.world as unknown as { weather?: { slimeRain?: boolean } }).weather?.slimeRain,
      rainbowSlimeUnlocked: !!flags['unlockedSlimeRainbowSpawn'],
    };
    if (inShimmer && canShimmerItem(vid, downedMoonlord, game.world.clock.moonPhase, decraftCtx, shimmerCtx)) {
      this.shimmerTime += 0.01;
      if (this.shimmerTime > 0.9) {
        this.shimmerTime = 0.9;
        this.getShimmered(game);
      }
    } else if (this.shimmerTime > 0) {
      this.shimmerTime = Math.max(0, this.shimmerTime - 0.01);
    }
  }

  /** WorldItem.GetShimmered（:1781-1931）分支顺序 1:1：钱币(:1786) →
   *  ShimmerTransformToItem(:1809) → 4986 彩虹史莱姆解锁(:1816) → 560 史莱姆雨
   *  (:1838) → makeNPC 放生(:1855) → decraft(:1878)。**decraft 必须排在钱币/转化
   *  之后**：钱币 71-74 与火炬 8 等都有 IsCrafted 配方，放前面会抢走转化/coinLuck 分支 */
  private getShimmered(game: GameHooks): void {
    const vid = vanillaIdOfItem(this.itemId);
    if (vid === 71 || vid === 72 || vid === 73 || vid === 74) {
      // 钱币 → 微光化币（:1791-1810）：面额放大后 AddCoinLuck（距离 <1000px 才累计，
      // LuckState.addCoinLuck 1:1），物品消失
      const amount = coinLuckAmount(vid, this.stack);
      const player = (game as unknown as { player: Player }).player;
      const dist = Math.hypot(player.cx - this.cx, player.cy - this.cy);
      player.luckState.addCoinLuck(dist, amount);
      this.stack = 0;
      this.dead = true;
      return;
    }
    const target = getTransformToItem(vid, game.world.clock.moonPhase);   // 3461 月相砖动态分支
    if (target > 0) {
      const iid = internalIdOfVanilla(target);
      if (iid >= 0) {
        this.itemId = iid;       // SetDefaults(target) 原堆叠保留（:1813-1817）
        this.shimmered = true;    // 上浮漂浮
        this.shimmerTime = 1;
        this.vx *= 0.1; this.vy *= 0.1;
        game.playSfx('shimmerSplash', 0.75, this.cx, this.cy);
        return;
      }
    }
    // 4986 闪耀史莱姆气球（:1816-1837）：首次入微光 → 解锁彩虹史莱姆城镇 NPC 681
    // （从 Center.X+4 落点出生，继承物品速度，shimmerTransparency=1 渐显）并消耗 1 个；
    // 已解锁则整组分支跳过（return，物品原样滞留微光）
    if (vid === 4986) {
      const flags = (game.world as unknown as { flags: Record<string, boolean> }).flags ?? {};
      if (flags['unlockedSlimeRainbowSpawn']) return;         // :1818-1821
      flags['unlockedSlimeRainbowSpawn'] = true;              // NPC.unlockedSlimeRainbowSpawn
      const e = game.spawnNpcByVanilla?.(681, this.cx + 4, this.cy);
      if (e) { e.vx = this.vx; e.spawnAlpha = 254; e.alphaFade = true; }
      // WorldGen.CheckAchievement_RealEstateAndTownSlimes(:1831)——成就项未接，登记
      this.stack--;
      if (this.stack <= 0) { this.stack = 0; this.dead = true; }   // :1832-1836 type=0
      else this.shimmerTime = 1;                                   // :1948-1951 共尾
      this.vx *= 0.1; this.vy *= 0.1;                              // :1958
      game.playSfx('shimmerSplash', 0.75, this.cx, this.cy);
      return;
    }
    // 560 史莱姆王冠（:1838-1854）：雨未进行 → 触发史莱姆雨并消耗 1 个
    if (vid === 560) {
      const wd = (game.world as unknown as { weather?: { slimeRain?: boolean; startSlimeRain?: () => void } }).weather;
      if (wd?.slimeRain) return;                              // :1840-1843
      wd?.startSlimeRain?.();                                 // Main.StartSlimeRain
      this.stack--;
      if (this.stack <= 0) { this.stack = 0; this.dead = true; }   // :1845-1848
      else this.shimmered = true;                                  // :1850-1853
      game.playSfx('shimmerSplash', 0.75, this.cx, this.cy);
      return;
    }
    // makeNPC 瓶中小动物（:1855-1877）：逐个放生（上限 min(stack, 空闲 NPC 槽, 50)），
    // 放生目标优先 ShimmerTransformToNPC[makeNPC]（表内小动物全 → 677 微光蝇）
    const makeNpc = makeNpcOfItem(vid);
    if (makeNpc > 0) {
      const to = npcShimmerTransformTo(makeNpc);
      const npcId = to >= 0 ? to : makeNpc;                  // :1866
      // NPC.GetAvailableAmountOfNPCsToSpawnUpToSlot(:81435)：0..199 空闲槽数，钳 stack
      const active = (game.enemies?.().length ?? 0) + (game.critters?.().length ?? 0);
      let left = Math.min(this.stack, Math.max(0, 200 - active));
      for (let guard = 50; guard > 0 && left > 0 && this.stack > 0; guard--, left--) {  // :1860 num3=50
        this.stack--;
        const e = game.spawnNpcByVanilla?.(npcId, this.cx, this.y + this.h);
        if (e) { e.spawnAlpha = 254; e.alphaFade = true; }    // :1869 shimmerTransparency=1
      }
      this.shimmered = true;                                  // :1872
      if (this.stack <= 0) { this.stack = 0; this.dead = true; }   // :1873-1876
      else this.shimmerTime = 1;
      this.vx *= 0.1; this.vy *= 0.1;
      game.playSfx('shimmerSplash', 0.75, this.cx, this.cy);
      return;
    }
    this.tryDecraft(game, vid);   // :1878 else-if 链末端
  }

  /** WorldItem.GetShimmered decraft 分支（:1878-1946）1:1：
   *  纯计算走 Shimmer.decraftOutcome（材料序返还；组材料【替换】为组代表
   *  RecipeGroup.DecraftItemId——非追加；customShimmerResults 覆盖表；炼金逐单位
   *  1/3 蒸发；单垛 ≤9999）。此处仅负责逐垛 spawn（shimmered 上浮 + ≥2 材料
   *  按序号散射）与扣减 */
  private tryDecraft(game: GameHooks, vid: number): boolean {
    const flags = (game.world as unknown as { flags: Record<string, boolean> }).flags ?? {};
    const crimsonWorld = !!game.world.crimson;
    const downedBoss3 = !!(flags['downed_35'] || flags.downedSkeletron);
    const downedGolemBoss = !!flags['downed_245'];
    // :1878 入口 = IsItemDecraftableAndIsDecraftUnlocked（配方存在 ∧ 未锁 ∧ ≥1 次）
    if (!isItemDecraftableAndUnlocked(vid, this.stack, crimsonWorld, downedBoss3, downedGolemBoss)) {
      return false;
    }
    const outcome = decraftOutcome(vid, this.stack, crimsonWorld);
    if (!outcome) return false;   // 空垛不回退：炼金全蒸发时原版照扣 stack（:1879-1933）
    outcome.piles.forEach((p, k) => {
      const key = VANILLA_ITEM_KEY_BY_ID[p.vid];
      if (!key) return;
      // 散射序号按【材料】递增（原版 num7，:1900/1929-1936）而非按垛：超额拆垛
      // 共享同一序号、炼金全蒸发的材料序号不空缺——曾 k+1 按垛计数，拆垛后
      // 续材料的散射速度整体错档
      const n = outcome.slots[k];
      let vx = this.vx * 0.1;
      if (outcome.spread) vx = n * (1 + n * 0.05) * (n % 2 === 0 ? -1 : 1);
      const d = game.spawnDrop(this.cx, this.cy, key, p.stack, vx, this.vy * 0.1);
      if (!d) return;
      d.shimmered = true;   // :1924 上浮漂浮
      d.shimmerTime = 1;    // :1923
    });
    this.stack -= outcome.consumed;              // :1927 stack -= 次数×createStack
    if (this.stack <= 0) { this.stack = 0; this.dead = true; }
    else this.shimmerTime = 1;                   // :1936 剩余 stack 保留并重置浸入进度
    game.playSfx('shimmerSplash', 0.75, this.cx, this.cy);
    return true;
  }

  inWater = false;

  /** WorldItem.CheckLavaDeath（:731-804）1:1：
   *  - vid 267 向导巫毒娃娃：TurnToAir → 场上每只向导（type 22）
   *    StrikeNPCNoInteraction(9999, 10, -direction) 致死 + **每杀一只调一次**
   *    NPC.SpawnWOF(物品位置)（:736-752；首次生成后 AnyNPCs(113) 门挡掉后续调用，
   *    净效果 = 杀完全部向导再召）→ stack 余量随机处决城镇 NPC 直到扣完（:754-779）。
   *  - 其余物品（:800-804）：rare 0/-1 且不在 IsLavaImmuneRegardlessOfRarity → 烧毁。
   *  单人语义缺省：playerIndexTheItemIsReservedFor==myPlayer 恒真、netMode 门不适用。
   *  差异：原版 StrikeNPC 后 NPC 当 tick 仍 active（死亡在下一 Update 收口），余量
   *  随机池可能命中垂死向导；本仓 TownNPC.hurt 即时置 dead，池自然排除，净效果一致 */
  private checkLavaDeath(game: GameHooks): void {
    const vid = vanillaIdOfItem(this.itemId);
    if (vid === 267) {
      let num = this.stack;
      this.dead = true;                       // TurnToAir
      const npcs = ((game.npcs?.() ?? []) as TownNPC[]).filter((n) => !n.dead);
      let flag = false;
      for (const n of npcs) {
        if (n.vanillaId !== 22) continue;
        n.hurt(9999, 10 * (n.facing || 1), 0, game);   // StrikeNPCNoInteraction(9999, 10f, -dir)
        num--;
        flag = true;
        spawnWOF(game, this.x, this.y);       // :748 娃娃掉落位置（娃娃已烧，位置留用）
      }
      if (flag) {
        const pool = npcs.filter((n) => !n.dead);      // isLikeATownNPC ≙ 城镇 NPC 桶
        while (num > 0 && pool.length > 0) {
          const n = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
          n.hurt(9999, 10 * (n.facing || 1), 0, game);
          num--;
        }
      }
      return;
    }
    if (LAVA_IMMUNE_ITEMS.has(vid)) return;
    const rare = ITEM_RARE[String(vid)] ?? 0;
    if (rare === 0 || rare === -1) this.dead = true;
  }

  draw() { /* Renderer 统一绘制 */ }
}
