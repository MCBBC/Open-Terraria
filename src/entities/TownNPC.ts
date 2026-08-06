// 城镇 NPC（向导）：游走、夜间回家、对话气泡
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';

export interface NpcHome { x: number; y: number; }

export class TownNPC extends Entity {
  w = 20; h = 42;
  npcKey: string; // 'guide'
  facing = 1;
  animT = 0;
  wanderT = 0;
  home: NpcHome | null = null;
  talkCooldown = 0;
  bubble: string | null = null;
  bubbleT = 0;

  constructor(key: string, x: number, y: number) {
    super();
    this.npcKey = key;
    this.x = x;
    this.y = y - this.h;
  }

  fixedUpdate(dt: number, game: GameHooks) {
    this.animT++;
    if (this.talkCooldown > 0) this.talkCooldown--;
    if (this.bubbleT > 0) { this.bubbleT--; if (this.bubbleT === 0) this.bubble = null; }
    const world = game.world;
    const player = (game as unknown as { player: Player }).player;

    let wantDir = 0;
    if (world.clock.isDay) {
      // 白天家门口附近游走
      this.wanderT--;
      if (this.wanderT <= 0) {
        this.wanderT = 90 + Math.random() * 180;
        this.facing = Math.random() < 0.5 ? -1 : 1;
        if (Math.random() < 0.35) this.facing = 0;
      }
      wantDir = this.facing;
    } else if (this.home) {
      // 夜间回家
      const dx = this.home.x * TILE + 8 - this.cx;
      if (Math.abs(dx) > TILE) wantDir = Math.sign(dx);
    }

    this.vx += wantDir * 0.06;
    this.vx = Math.max(-0.8, Math.min(0.8, this.vx));
    if (this.onGround && this.hitWall && wantDir !== 0) this.vy = -6; // 跳台阶
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(this, world, this.vx, this.vy);
    if (this.hitWall) this.vx *= 0.5;
    if (wantDir !== 0) this.facing = wantDir;

    // 对话气泡：玩家靠近时偶发展示
    if (player && !player.dead && this.talkCooldown === 0) {
      const d = Math.hypot(player.cx - this.cx, player.cy - this.cy);
      if (d < TILE * 4 && Math.random() < 0.004) {
        this.bubble = this.npcKey === 'guide'
          ? '你好！用镐挖矿，用工作台做工具。'
          : '……';
        this.bubbleT = 240;
        this.talkCooldown = 1200;
      }
    }
  }

  draw() { /* Renderer 统一绘制 */ }
}
