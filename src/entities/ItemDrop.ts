// 掉落物实体：重力、落地、磁吸拾取
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { GRAVITY, MAX_FALL_SPEED, MAGNET_RADIUS, PICKUP_DELAY, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { ITEM_DEFS } from '../data/items';
import { coinIndexOf } from '../items/Inventory';
import type { Player } from './Player';
import {
  canShimmerItem, coinLuckAmount, getTransformToItem,
  decraftOutcome, isItemDecraftableAndUnlocked,
  internalIdOfVanilla, vanillaIdOfItem,
} from '../stats/Shimmer';
import { VANILLA_ITEM_KEY_BY_ID } from '../data/items';

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
    if (player && !player.dead && this.age > PICKUP_DELAY) {
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
      this.shimmerWet = st0.liquidType[ci] === 4 && st0.liquid[ci] > 30;
      if (this.shimmered) {
        // 已微光化：无重力上浮（:486-511 gravity=0，vy -0.05/t 钳 -4）
        this.vy = Math.max(this.vy - 0.05, -4);
        this.vx *= 0.95;
      } else {
        // 微光浸入重力（:434-441：0.065 / maxFall 4，比水 0.08/5 更缓）
        const g = this.shimmerWet ? GRAVITY * 0.7 * (0.065 / 0.3) : GRAVITY * 0.7;
        const mf = this.shimmerWet ? 4 : MAX_FALL_SPEED;
        this.vy = Math.min(this.vy + g, mf);
        this.vx *= 0.96;
      }
      moveAndCollide(this, game.world, this.vx, this.vy);
    }
    // 入水小水花声（掉落物轻，音量小）。wet 判定排除岩浆/微光（Collision.cs:1418
    // WetCollision 只认 !lava && !shimmer）；微光入池走专属 Shimmer 音（:19 style 4）
    const st = game.world.store;
    const li = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))];
    const liqType = st.liquidType[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))];
    const wasWater = this.inWater;
    this.inWater = li > 80 && (liqType === 1 || liqType === 3);
    if (this.inWater && !wasWater && this.vy > 1.2) game.playSfx('splash', 0.35);
    if (this.shimmerWet && !this.shimmered) this.updateShimmer(game);
    void ITEM_DEFS;
  }

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
    if (inShimmer && canShimmerItem(vid, downedMoonlord, game.world.clock.moonPhase, decraftCtx)) {
      this.shimmerTime += 0.01;
      if (this.shimmerTime > 0.9) {
        this.shimmerTime = 0.9;
        this.getShimmered(game);
      }
    } else if (this.shimmerTime > 0) {
      this.shimmerTime = Math.max(0, this.shimmerTime - 0.01);
    }
  }

  /** WorldItem.GetShimmered（:1781-1931）分支顺序 1:1：钱币(:1790) →
   *  ShimmerTransformToItem(:1812) → decraft(:1878) → makeNPC/特例 4986、560
   *  登记未移植（Shimmer.ts GAP 清单）。**decraft 必须排在钱币/转化之后**：
   *  钱币 71-74 与火炬 8 等都有 IsCrafted 配方，放前面会抢走转化/coinLuck 分支 */
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
      const n = k + 1;   // 原版 num7 自 1 起（:1881/1929-1936）
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

  draw() { /* Renderer 统一绘制 */ }
}
