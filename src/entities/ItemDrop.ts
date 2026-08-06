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
    let magnetized = false;
    if (player && !player.dead && this.age > PICKUP_DELAY) {
      const dx = player.cx - this.cx, dy = player.cy - this.cy;
      const dist = Math.hypot(dx, dy);
      // 碰到身体直接拾取（AABB 重叠），避免中心点距离判定漏拾
      const touching =
        this.x < player.x + player.w && this.x + this.w > player.x &&
        this.y < player.y + player.h && this.y + this.h > player.y;
      if (touching || dist < TILE * 1.7) {
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
      } else if (dist < MAGNET_RADIUS) {
        // 磁吸：近处强拉（平方衰减），确保能战胜重力
        magnetized = true;
        const f = Math.pow(1 - dist / MAGNET_RADIUS, 1.5);
        const pull = 0.35 + f * 1.1;
        this.vx += (dx / (dist || 1)) * pull;
        this.vy += (dy / (dist || 1)) * pull;
        this.vx = Math.max(-5, Math.min(5, this.vx));
        this.vy = Math.max(-6, Math.min(5, this.vy));
      }
    }

    // 磁吸状态下大幅减重，保证能被吸向玩家
    const g = magnetized ? GRAVITY * 0.25 : GRAVITY * 0.7;
    this.vy = Math.min(this.vy + g, MAX_FALL_SPEED);
    this.vx *= 0.96;
    moveAndCollide(this, game.world, this.vx, this.vy);
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
