// 掉落物实体：重力、落地、磁吸拾取
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { GRAVITY, MAX_FALL_SPEED, MAGNET_RADIUS, PICKUP_DELAY, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { ITEM_DEFS } from '../data/items';
import type { Player } from './Player';

export class ItemDrop extends Entity {
  w = 12; h = 12;
  itemId: number;
  stack: number;
  age = 0;
  bobPhase: number;
  /** 原版 Item.color（凝胶等掉落继承怪物色，逐像素乘法贴轮廓渲染） */
  color?: number[]; // [r, g, b, a]

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
      // 否则玩家盒 ±42px(defaultItemGrabRange :2406)扩展盒相交=拉取
      const GRAB_RANGE = 42;
      const touching =
        this.x < player.x + player.w && this.x + this.w > player.x &&
        this.y < player.y + player.h && this.y + this.h > player.y;
      const inGrabRange =
        this.x < player.x + player.w + GRAB_RANGE && this.x + this.w > player.x - GRAB_RANGE &&
        this.y < player.y + player.h + GRAB_RANGE && this.y + this.h > player.y - GRAB_RANGE;
      if (touching) {
        const before = this.stack;
        const left = player.inv.add(this.itemId, this.stack);
        if (left === 0) {
          this.dead = true;
          game.notifyInventoryChanged();
          // 铜币拾取用专属音效，其余走通用拾取
          // 音量略低（0.75）：拾取与挖掘声同时触发时两者都可闻，不被 Grab 盖住
          game.playSfx(ITEM_DEFS[this.itemId]?.key === 'coin_copper' ? 'coin' : 'pickup', 0.75);
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
      this.vy = Math.min(this.vy + GRAVITY * 0.7, MAX_FALL_SPEED);
      this.vx *= 0.96;
      moveAndCollide(this, game.world, this.vx, this.vy);
    }
    // 入水小水花声（掉落物轻，音量小）
    const st = game.world.store;
    const li = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))];
    const wasWater = this.inWater;
    this.inWater = li > 80;
    if (this.inWater && !wasWater && this.vy > 1.2) game.playSfx('splash', 0.35);
    void ITEM_DEFS;
  }

  inWater = false;

  draw() { /* Renderer 统一绘制 */ }
}
