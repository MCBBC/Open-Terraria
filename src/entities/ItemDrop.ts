// 掉落物实体：重力、落地、磁吸拾取
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { ITEM_GRAVITY, ITEM_MAX_FALL, MAGNET_RADIUS, PICKUP_DELAY, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { ITEM_DEFS, ITEM_RECOVERABLE_IMPORTANT } from '../data/items';
import { coinIndexOf } from '../items/Inventory';
import type { Player } from './Player';
import { IGNORES_ENCUMBERING_STONE_VIDS } from './Player';
import { getDropScanCtx } from './dropScanCtx';
import {
  canShimmerItem, coinLuckAmount, getTransformToItem,
  decraftOutcome, isItemDecraftableAndUnlocked,
  internalIdOfVanilla, vanillaIdOfItem,
  makeNpcOfItem, npcShimmerTransformTo,
} from '../stats/Shimmer';
import { VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { VANILLA_ITEM_COLOR } from '../data/vanillaItemColor';

/** CantTakeLunchMoney（NPCID.cs:4468,39 型）——专家模式怪捡钱豁免表（R14-A3） */
const CANT_TAKE_LUNCH_MONEY = new Set([394, 393, 392, 690, 492, 491, 662, 384, 478, 535,
  658, 659, 660, 128, 131, 129, 130, 139, 267, 247, 248, 246, 249, 245, 409, 410,
  397, 396, 401, 400, 440, 68, 534, 316, 259, 260, 43, 175, 101]);
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
  /** 原版 Item.color（Item.cs SetDefaults 静态表——凝胶 23 蓝/316-319 青；
   *  构造期按 vid 自 VANILLA_ITEM_COLOR 注入，Renderer 两遍着色消费） */
  color?: number[]; // [r, g, b, a]
  /** 心(58)/星(184) 是 pickup 类物品（ItemID.Sets.IsAPickup, ItemID.cs:248）：
   *  碰触即回血 20 / 回蓝 100 并消失，永不进背包（Player.PickupItem :34610-34630） */
  pickup?: 'heart' | 'star' | 'manastar';
  /** 原版 Item.noGrabDelay：玩家主动抛出的物品 =100t（Player.cs:4990/:4996
   *  DropSelectedItem），期间抛出者拾不回；普通战利品 0（走全局 PICKUP_DELAY） */
  noGrabDelay = 0;
  /** 实例级放置样式（旗 place_v_91:掉旗时注入 bannerId;拾取随实例流转——
   *  ItemDef.placeStyle 是类级,多 style 单物品需实例位,2026-08-13） */
  placeStyle?: number;
  prefix?: number;   // 词缀（Item.prefix,随实例流转）
  // ---- 微光（WorldItem.cs:25-27/434/486-558/806-840/1781-1931）----
  /** 浸在微光中（Collision.shimmer 盒命中，:434/:944） */
  shimmerWet = false;
  /** 已被微光转化（上浮漂浮、暂不可拾取，:34466 速度 <0.2 才可拾） */
  shimmered = false;
  /** 微光浸入进度 0-1（:27/:806-840 +0.01/t，>0.9 触发 GetShimmered；离池衰减） */
  shimmerTime = 0;
  /** 本端私有实例（原版 Item.instanced，MessageBuffer.cs:1468 case 90 落位）：
   *  per-client 掉落（Boss 袋族）各端经 module14 各得一份——不上报 msg21
   *  （netDropSweep/SimHost.dropSweep 跳过），仅本端玩家可见可拾（原版
   *  playerIndexTheItemIsReservedFor=Main.myPlayer 语义——各端只持有自己的副本,
   *  天然互不可见）。拾取后入包照常（转为随身物品,跨端同步走 msg5） */
  netLocalOnly = false;
  /** 被玩家拉取/抓取中（原版 beingGrabbed——星白天消失的豁免位,拉取路径置位） */
  grabbed = false;

  constructor(x: number, y: number, itemId: number, stack = 1, vx = 0, vy = -2) {
    super();
    this.x = x; this.y = y;
    this.itemId = itemId;
    this.stack = stack;
    this.vx = vx;
    this.vy = vy;
    this.bobPhase = Math.random() * Math.PI * 2;
    // 原版 Item.color 静态表（Item.cs SetDefaults，凝胶 23 染蓝等）——SetDefaults
    // 语义随实例走：掉落物一落地就带着色，渲染端 tintedSprite 消费（此前无人赋值
    // = 死代码，凝胶掉地上也是灰的）。存档/重建走构造自愈，无需序列化。
    const vid = vanillaIdOfItem(itemId);
    const ic = vid > 0 ? VANILLA_ITEM_COLOR[vid] : undefined;
    if (ic && ic[3] > 0) this.color = [...ic];
  }

  fixedUpdate(dt: number, game: GameHooks) {
    this.age++;
    this.grabbed = false;   // beingGrabbed 每 tick 复位（WorldItem.cs:437,拉取路径再置位）
    const vid = vanillaIdOfItem(this.itemId);   // 全函数消费（岩浆/微光/吸附等段）

    // R14-A3：专家模式怪捡钱币（WorldItem.GetPickedUpByMonsters_Money :1127-1219,
    // Update 入口 :412-416 `if (Main.expertMode && IsACoin)`）——命中合格怪吸收
    // 50-75%（铜 +0-50%、银 +0-25%,钳 1）入 enemy.extraValue,死亡并入钱币掉落
    // （NPC.cs:80497 num += extraValue）;CantTakeLunchMoney 39 型豁免(NPCID.cs:4468)。
    // 此前整链缺失=专家"怪偷钱→杀怪夺回"经济循环缺位
    if ((this.age & 3) === 0) {
      const mVid = vanillaIdOfItem(this.itemId);
      if (mVid >= 71 && mVid <= 74) {
        const w = game.world as unknown as { isExpert?: boolean; flags?: Record<string, boolean> };
        if (w?.isExpert) {
          for (const n of game.enemies()) {
            const e = n as unknown as {
              dead?: boolean; vanillaId?: number; x: number; y: number; w: number; h: number;
              lifeMax?: number; friendly?: boolean; spawnedFromStatue?: boolean; extraValue?: number;
              immortal?: boolean; dontTakeDamage?: boolean;
            };
            if (e.dead || e.vanillaId == null) continue;
            if ((e.lifeMax ?? 0) <= 5 || e.friendly || e.immortal || e.dontTakeDamage
              || e.spawnedFromStatue) continue;
            if (CANT_TAKE_LUNCH_MONEY.has(e.vanillaId)) continue;
            if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
            // 吸收比（:1178-1190）：Next(50,76)×0.01 基础；铜 71 再 +Next(51)×0.01、
            // 银 72 再 +Next(26)×0.01；钳 1；吸收量 = stack×ratio（不足 1 不吸收）
            let ratio = (50 + Math.floor(Math.random() * 26)) * 0.01;
            if (mVid === 71) ratio += Math.floor(Math.random() * 51) * 0.01;
            if (mVid === 72) ratio += Math.floor(Math.random() * 26) * 0.01;
            if (ratio > 1) ratio = 1;
            const take = Math.floor(this.stack * ratio);
            if (take < 1) break;
            e.extraValue = (e.extraValue ?? 0) + take * (mVid === 74 ? 1000000 : mVid === 73 ? 10000 : mVid === 72 ? 100 : 1);
            this.stack -= take;
            if (this.stack <= 0) { this.stack = 0; this.dead = true; }
            game.spawnParticles?.(e.x + e.w / 2, e.y + e.h / 2, '#FFD966', 6, 1.2, { life: 18 });   // moneyPing 尘近似
            break;
          }
        }
      }
    }

    // 铜物品落在可转化史莱姆上（WorldItem.GetPickedUpByMonsters_Special :1160-1191）：
    // 铜盔 89 / 铜短剑 3507 且未解锁 → 命中 {1 蓝史莱姆, 302 蒙面, 333-336 缎带} →
    // TransformCopperSlime（侍从史莱姆 684 + unlockedSlimeCopperSpawn，NPC.cs:19099-19121）
    // 并消耗 1 个（:1186-1190）
    if ((this.age & 3) === 0) {
      const cVid = vanillaIdOfItem(this.itemId);
      if ((cVid === 89 || cVid === 3507)) {
        const flags = (game.world as unknown as { flags: Record<string, boolean> }).flags ?? {};
        if (!flags['unlockedSlimeCopperSpawn']) {
          for (const n of game.enemies()) {
            const e = n as { dead?: boolean; vanillaId?: number; x: number; y: number; w: number; h: number };
            if (e.dead || e.vanillaId == null) continue;
            const id = e.vanillaId;
            if (id !== 1 && id !== 302 && (id < 333 || id > 336)) continue;
            if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
            flags['unlockedSlimeCopperSpawn'] = true;
            e.dead = true;   // Transform 原位换体
            game.spawnParticles?.(e.x + e.w / 2, e.y + e.h / 2, '#E8A060', 10, 1.5, { life: 24 });
            game.spawnNpcByVanilla?.(684, e.x, e.y);
            this.stack--;
            if (this.stack <= 0) { this.stack = 0; this.dead = true; }
            break;
          }
        }
      }
    }

    const player = (game as unknown as { player: Player }).player;
    let beingGrabbed = false;
    if (player && !player.dead && this.age > PICKUP_DELAY && this.age > this.noGrabDelay) {
      // 顶部速度门（GrabItems Player.cs:34466）：shimmered 且速度 ≥0.2 → **拾取与
      // 拉取整体跳过**（此前只拦拾取不拦拉动 → 拉动加速反而把物品锁死在 ≥0.2 永不可拾）
      const grabbable = !(this.shimmered && Math.hypot(this.vx, this.vy) >= 0.2);
      if (grabbable) {
      // 原版 GrabItems(Player.cs:34461-34524):hitbox 相交=直接拾取;
      // 否则玩家盒 ±42px(defaultItemGrabRange :2406)扩展盒相交=拉取；
      // 宝藏磁石(+94)/金戒指族(+12)扩展范围（Player.grabRangeBonus 聚合）
      // ★帧扫描快照（dropScanCtx.ts 头注；trace 实测 equip 热点 54.4% 主线程自耗
      //   时——grabRangeBonus/canAccept 曾每帧每物触发 equipStats 内容键全量重建）。
      //   三项加成与 preventAll 在一帧内恒定（拾取写面不触及任何输入域），同值严格
      //   等价；快照缺席（单测/探针直调本 fixedUpdate 不经 Entities.update）回退旧逐
      //   次计算路径。
      const scan = getDropScanCtx(player);
      const vidThis = vanillaIdOfItem(this.itemId);
      let GRAB_RANGE: number;
      let canAccept: boolean;
      if (scan) {
        GRAB_RANGE = 42 + scan.grab
          // 拾心药水（lifeMagnet）：红心单独扩大拾取范围
          + (this.pickup === 'heart' ? scan.heart : 0)
          // 魔力磁石（manaMagnet：星 184/1735/1868 专用吸附，Player.cs:34495 专属拉取通道）
          + (this.pickup === 'star' ? scan.star : 0);
        canAccept = !scan.preventAll || IGNORES_ENCUMBERING_STONE_VIDS.has(vidThis);
      } else {
        GRAB_RANGE = 42 + ((player as { grabRangeBonus?: number }).grabRangeBonus ?? 0)
          + (this.pickup === 'heart' ? ((player as { heartGrabBonus?: number }).heartGrabBonus ?? 0) : 0)
          + (this.pickup === 'star' ? ((player as { manaMagnetBonus?: number }).manaMagnetBonus ?? 0) : 0);
        canAccept = (player as unknown as {
          canAcceptItemIntoInventory?: (vid: number) => boolean;
        }).canAcceptItemIntoInventory?.(vidThis) ?? true;
      }
      const touching =
        this.x < player.x + player.w && this.x + this.w > player.x &&
        this.y < player.y + player.h && this.y + this.h > player.y;
      const inGrabRange =
        this.x < player.x + player.w + GRAB_RANGE && this.x + this.w > player.x - GRAB_RANGE &&
        this.y < player.y + player.h + GRAB_RANGE && this.y + this.h > player.y - GRAB_RANGE;
      // ★F5① preventAllItemPickups 消费端（CanAcceptItemIntoInventory Player.cs
      //  :35172-35179）：4346 拖累石在场（机械族三路聚合 → equipStats 位）时,世界
      //  物品的【拾取与拉取】两通道只放行 IgnoresEncumberingStone 白名单成员
      //  （心/星族,ItemID.cs:250）——vanilla GrabItems :35187 把该门挂在循环 continue
      //  上（两通道一并跳过）、CanPullItem :39453 复判同一门。心/星吸附本就属白名单,
      //  阻挡面=其余一切物品。MP 候补：packet 自报 take 只在本地拾取成立后发生,
      //  无独立 intake 位可漏。
      if (touching && canAccept) {
        if (this.pickup) {
          if (this.pickup === 'heart') {
            player.hp = Math.min(player.maxHp, player.hp + 20);
            game.addDamageNumber(player.cx, player.y, 20, false, '#40E080');
          } else if (this.pickup === 'manastar') {
            // 法力斗篷之星 4143(Player.cs:35357-35371):音 7 + 魔力 +50 + ManaHeat(0.2,2s)
            player.mana = Math.min(player.maxMana, player.mana + 50);
            player.tryApplyManaHeat(0.2, 2);
            game.addDamageNumber(player.cx, player.y, 50, false, '#4080FF');
          } else {
            player.mana = Math.min(player.maxMana, player.mana + 100);
            // 1457: 拾取魔力星附加 ManaHeat(0.2, 2s)（PickupItem :35346-35351——
            //   184/1735/1868 星族分支内 myPlayer 门下 TryApplyManaHeat）
            player.tryApplyManaHeat(0.2, 2);
            game.addDamageNumber(player.cx, player.y, 100, false, '#4080FF');
          }
          this.dead = true;
          game.recLog?.('pickup', { key: this.pickup, n: 1 });   // 行为录制：心/星碰触即取
          game.playSfx('pickup', 1); // 原版 SoundID 7 Grab
          return;
        }
        const before = this.stack;
        let left = player.inv.add(this.itemId, this.stack, this.prefix, this.placeStyle);
        // 成就：拾取通知（AchievementsHelper.NotifyItemPickup——仅入包部分；
        //  WorldItem 拾取路径，合成/初始装备不经此）
        if (left < before) {
          const vid = vanillaIdOfItem(this.itemId);
          if (vid > 0) game.achievements?.notifyItemPickup(vid);
        }
        // ---- 虚空袋溢流兜底（孤儿武器 B3 波 工单1；Player.GetItem_VoidVault
        //  :39703-39760：PickupItemFromWorld.CanGoIntoVoidVault=true 门下,背包
        //  接不住的余量灌 bank4=banks[3]。原版 vaul【不】持续吸物——本支只在
        //  left>0（有装不下的余量）时触达，即满背包装不下的溢流语义）----
        if (left > 0 && player.useVoidBag()) {
          const preVoid = left;
          const dep = player.depositIntoVoidVault(this.itemId, left);
          if (dep < preVoid) {
            const vidV = vanillaIdOfItem(this.itemId);
            if (vidV > 0) game.achievements?.notifyItemPickup(vidV);   // :39768 NotifyItemPickup
            game.notifyInventoryChanged();
            game.recLog?.('pickup', { key: ITEM_DEFS[this.itemId]?.key ?? this.itemId, vid: vidV, n: preVoid - dep, void: true });
            game.playSfx(coinIndexOf(this.itemId) >= 0 ? 'coin' : 'pickup', 0.75);  // SoundID 7/38(:39753)
            const defV = ITEM_DEFS[this.itemId];
            if (defV) game.showPickupLabel(defV.key, preVoid - dep, this.prefix);   // PopupText ItemPickupToVoidContainer(:39760)
            left = dep;
          }
        }
        if (left === 0) {
          // MP：整堆拾取即时自报 take（op1）——替代傀儡清扫的对死推断
          // （清扫无法区分"被拾取"与"TTL 超时"，曾把超时误报成拾取反杀真身）
          if (this.netPuppet && this.netId) game.puppetDropTaken?.(this);
          this.dead = true;
          game.recLog?.('pickup', { key: ITEM_DEFS[this.itemId]?.key ?? this.itemId, n: before, vid: vanillaIdOfItem(this.itemId) });   // 行为录制：整堆拾取
          game.notifyInventoryChanged();
          // 钱币拾取用专属音效，其余走通用拾取（vi_71-74 单轨）
          // 音量略低（0.75）：拾取与挖掘声同时触发时两者都可闻，不被 Grab 盖住
          game.playSfx(coinIndexOf(this.itemId) >= 0 ? 'coin' : 'pickup', 0.75);
          const def = ITEM_DEFS[this.itemId];
          // 飘字计数（PopupText.NewText :38609）：picked = 实际入包数
          if (def) game.showPickupLabel(def.key, before, this.prefix);
          return;
        }
        if (left !== before) {
          game.notifyInventoryChanged();
          // 部分拾取（背包该堆被填满）同样飘字（:38623——picked = 填入的差额）
          const def = ITEM_DEFS[this.itemId];
          if (def) game.showPickupLabel(def.key, before - left, this.prefix);
        }
        this.stack = left;
        // MP：他人掉落的残余上报（msg21 op3 携余量全态，形状与 spawn 同）——原版
        // msg21 为服务器权威单向广播，本仓所有权分散在生成端，拾取端必须把
        // "还剩多少"报回去，否则拥有者 60t 重 assert 会用陈旧全量把残余刷回去
        // （人人可再捡 = 物品复制）。★仅在本次拾取真实改变余量时发（背包已满
        // 的持续重叠不得每拍一帧刷屏——2026-08-28 全面 review 收口） */
        if (left > 0 && left !== before && this.netPuppet && this.netId) game.puppetDropResidue?.(this);
      } else if (inGrabRange && canAccept) {   // ★F5① 拉取面同门（CanPullItem :39453）
        // PullItem_Common(:34533-34584):每轴 0.45 步进、钳 4(水平含 player.vx),
        // 速度反向时附加 ×0.75 反拉——被拉取帧跳过瓦片碰撞(WorldItem.cs:587-597
        // else 分支仅 position+=velocity),物品穿墙飞向玩家。
        // ★CanPullItem 分支先清 shimmered（Player.cs:34498）——拉动一旦开始,
        // 微光速度门解除,后续按普通物品吸走拾取（此前不清 → 拉动中恒 ≥0.2 死锁）
        this.shimmered = false;
        beingGrabbed = true;
        this.grabbed = true;
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
      }   // /if (grabbable) —— 顶部速度门（Player.cs:34466）
    }

    if (beingGrabbed) {
      // 原版被抓取帧:无重力无碰撞,直接位移(WorldItem.cs:596 ApplyMovement)
      this.x += this.vx;
      this.y += this.vy;
    } else {
      // 液体采样（身体中心格；本仓液体编码 1水 2岩浆 3蜂蜜 4微光）——仅作重力档选择
      const st0 = game.world.store;
      const ci = st0.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE));
      const wetType = st0.liquid[ci] > 30 ? st0.liquidType[ci] : 0;
      // shimmerWet = Collision.shimmer（WorldItem :949-951 ← LiquidCollision :1600-1655）：
      // 整盒擦到任一 liquid>0 微光格即 true（坡面格另判上格液体）。★旧实现中心单格
      // >30——浅液面/盒缘擦液时 Shimmering 不跑 → 同一物品"有时能分解有时不能"根因
      this.shimmerWet = liquidCollision(st0, this.x, this.y, this.w, this.h, 4);
      if (this.shimmered) {
        // 已微光化：无重力（:487 gravity=0）。上浮/悬停三分支（:515-536）：
        //  ① shimmerWet（身在微光中）→ vy-0.05/t 钳 -4 继续上浮；
        //  ② 干态但**下方 2 格内仍有微光**（还悬在微光柱上方）→ 同①继续上浮；
        //  ③ 干态且下方无微光 → vy×0.9 衰减悬停——速度降到 <0.2 才可被拾取
        //    （此前漏了②③：恒加速上浮 → 撞顶也不减速 → 永远 ≥0.2 永不可拾）
        let rising: boolean;
        if (this.shimmerWet) {
          rising = true;
        } else {
          rising = false;
          const bx = Math.floor(this.cx / TILE), by = Math.floor(this.cy / TILE);
          for (let j = by; j < by + 2; j++) {
            if (st0.inBounds(bx, j)) {
              const bi = st0.idx(bx, j);
              if (st0.liquid[bi] > 0 && st0.liquidType[bi] === 4) { rising = true; break; }
            }
          }
        }
        if (rising) { if (this.vy > -4) this.vy -= 0.05; }
        else this.vy *= 0.9;
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
        if (wetType === 1 || wetType === 3) { this.vx *= 0.95; } // 浸液额外阻尼（:440 wetVelocity 近似）
      }
      // 水平摩擦（:927-932 通用段：vx*=0.95，|vx|<0.1 归零）——★shimmered 物品
      // 同样执行。曾误放非 shimmered 分支内：decraft 散射初速永不衰减 → 产物无限
      // 横漂 + 速度恒 >0.2 永不可拾取
      this.vx *= 0.95;
      if (Math.abs(this.vx) < 0.1) this.vx = 0;
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
    if (this.inWater && !wasWater && this.vy > 1.2) game.playSfx('splash', 1);
    if (this.shimmerWet && !this.shimmered) {
      this.updateShimmer(game);
    } else if (this.shimmerTime > 0) {
      // WorldItem.cs:552-558（shimmered 也走）：转化后 shimmerTime 自 1 衰减 -0.01/t
      // ——驱动上浮白光渐亮（lightRGB 读 (1-shimmerTime)*0.8，:511）
      this.shimmerTime = Math.max(0, this.shimmerTime - 0.01);
    }
    void ITEM_DEFS;
    // ---- 消失条件 = 原版 DespawnIfMeetingConditions（WorldItem.cs:652-690）----
    // 时序 = Update 尾部（抓取置位后判定,与原版同拍）。★1.4 已移除通用 5 分钟
    // 消失——仅四类特例+出界+堆叠归零,无 age 上限;曾自创 600s 全体消失=掉落配额
    // （Item.MechSpawn）饱和后的自愈节奏与原版不符（2026-08-27 用户定案完全对齐）。
    {
      const dvid = vanillaIdOfItem(this.itemId);
      const wd = (game.world ?? {}) as unknown as {
        w?: number; h?: number; spawnX?: number; spawnY?: number;
        clock?: { isDay?: boolean }; seedFlags?: { remix?: boolean };
        oldOnesArmy?: { ongoing?: boolean };
      };
      // ① 陨星 75：白天（非 remix/未微光）→ 星尘 15×10 + 星星碎砾 16-18×3。
      //   ★原版 !beingGrabbed 条件为死逻辑：beingGrabbed 在物品自身 Update 头被
      //   无条件复位（WorldItem.cs:437），Player 侧置位先于复位被抹（单人恒 false）——
      //   本仓 grabbed 置位发生在同方法内（复位之后），判读会泄漏 → 不进判定
      if (dvid === 75 && wd.clock?.isDay && !wd.seedFlags?.remix && !this.shimmered) {
        game.spawnParticles?.(this.x + 11, this.y + 11, '#FFECB3', 10, 1.2, { life: 20 });
        this.dead = true; return;
      }
      // ② 4143：生成超 300t → 靛蓝尘×20（:664）
      if (dvid === 4143 && this.age > 300) {
        game.spawnParticles?.(this.x + 11, this.y + 11, '#4169E1', 20, 1.0, { life: 20 });
        this.dead = true; return;
      }
      // ③ 3822：非 DD2 进行中 → 金尘×(18-24)（:672）
      if (dvid === 3822 && !wd.oldOnesArmy?.ongoing) {
        game.spawnParticles?.(this.x + 11, this.y + 11, '#FFD966', 18 + Math.floor(Math.random() * 7), 1.5, { life: 24 });
        this.dead = true; return;
      }
      // ④ 出界（InWorld 20 格余量外,:580-612）：
      //    RecoverableImportantItem → Center=出生点坐标(回出生点,velocity 清零)
      //    其余 → 消失
      if (typeof wd.w === 'number' && typeof wd.h === 'number') {
        const tx2 = Math.floor(this.x / 16), ty2 = Math.floor(this.y / 16);
        if (tx2 < 20 || ty2 < 20 || tx2 >= wd.w - 20 || ty2 >= wd.h - 20) {
          if (ITEM_RECOVERABLE_IMPORTANT.has(dvid) && typeof wd.spawnX === 'number' && typeof wd.spawnY === 'number') {
            this.x = wd.spawnX * 16 + 8 - this.w / 2;
            this.y = wd.spawnY * 16 + 8 - this.h / 2;   // Center = 出生点格中心
            this.vx = 0; this.vy = 0;
          } else {
            this.dead = true;
          }
          return;
        }
      }
    }
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
    // 微光转化完成音 = SoundID.Item176（WorldItem.cs:1689-1696 ShimmerEffect——
    // GetShimmered 全部分支【共尾】单点调用 :1875,钱币支不 return 也走）。
    // 音量 ×0.9 = LegacySoundPlayer.cs:520-521（case 2 num==176 支）。
    // 本仓链是早退分支结构 → 每个落地分支补一次（下方各支同款行）
    const shimmerDoneSfx = (): void => game.playSfxFile?.('Item_176', 0.9, this.cx, this.cy);
    if (vid === 71 || vid === 72 || vid === 73 || vid === 74) {
      // 钱币 → 微光化币（:1791-1810）：面额放大后 AddCoinLuck（距离 <1000px 才累计，
      // LuckState.addCoinLuck 1:1），物品消失
      const amount = coinLuckAmount(vid, this.stack);
      const player = (game as unknown as { player: Player }).player;
      const dist = Math.hypot(player.cx - this.cx, player.cy - this.cy);
      player.luckState.addCoinLuck(dist, amount);
      shimmerDoneSfx();                                        // 原版共尾 :1875
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
        game.playSfx('shimmerSplash', 1, this.cx, this.cy);
        shimmerDoneSfx();                                      // Item176（WorldItem.cs:1875 共尾）
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
      game.playSfx('shimmerSplash', 1, this.cx, this.cy);
      shimmerDoneSfx();                                      // Item176（WorldItem.cs:1875 共尾）
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
      game.playSfx('shimmerSplash', 1, this.cx, this.cy);
      shimmerDoneSfx();                                      // Item176（WorldItem.cs:1875 共尾）
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
      game.playSfx('shimmerSplash', 1, this.cx, this.cy);
      shimmerDoneSfx();                                      // Item176（WorldItem.cs:1875 共尾）
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
    game.playSfx('shimmerSplash', 1, this.cx, this.cy);
    // Item176 转化音（WorldItem.cs:1875 GetShimmered 共尾 → ShimmerEffect :1689-1696；
    // ×0.9 = LegacySoundPlayer.cs:520）——decraft 支同走该尾
    game.playSfxFile?.('Item_176', 0.9, this.cx, this.cy);
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
    if (rare === 0 || rare === -1) {
      this.dead = true;
      game.recLog?.('burn', { vid, n: this.stack });   // 行为录制：掉落物岩浆烧毁
    }
  }

  draw() { /* Renderer 统一绘制 */ }
}
