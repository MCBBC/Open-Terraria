// 装备钩爪（miscEquips[4]，移动端虚拟键触发）——最小实现：
// 飞行段：直线飞向发射方向（速度 13.5），命中实心格即锚定；
// 锚定段：每 tick 写 player.grappleTarget（Player.fixedUpdate 在移动积分前
// 以恒速 13.5 朝锚点覆盖 vx/vy——见 Player.ts grappleTarget 段）；
// 释放：玩家抵达锚点 20px 内 / 按跳 / 再次点击钩爪键（Game.useEquippedGrapple
// 重触发）/ 玩家死亡——proj.dead 时 Game 清 player.grappleTarget。
// 链条渲染 = 世界变换内直线段（锚点到玩家）。
// 与原版 AI_007 差异（记录）：单钩（无多钩叠加）、无伸缩衰减、无摆动保速——
// 待全量 AI_007 移植时替换本实体。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { TILE } from '../core/constants';
import { TILE_DEFS } from '../data/tiles';

export class GrappleProj extends Entity {
  w = 8; h = 8;
  vx: number;
  vy: number;
  anchored = false;
  life = 600;
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number,
    private playerRef: () => { cx: number; cy: number; x: number; y: number; w: number; h: number; dead: boolean; inputJump: boolean; grappleTarget: { x: number; y: number } | null } | null) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    const p = this.playerRef();
    if (!p || p.dead) { this.dead = true; p && (p.grappleTarget = null); return; }
    this.life--;
    if (this.life <= 0) { this.dead = true; p.grappleTarget = null; return; }
    const st = game.world.store;
    if (!this.anchored) {
      this.x += this.vx;
      this.y += this.vy;
      const ti = Math.floor((this.x + this.w / 2) / TILE);
      const tj = Math.floor((this.y + this.h / 2) / TILE);
      if (!st.inBounds(ti, tj)) { this.dead = true; p.grappleTarget = null; return; }
      const ii = st.idx(ti, tj);
      if (st.flags[ii] && TILE_DEFS[st.type[ii]]?.solid) {
        // 锚定（锚点 = 命中格中心）
        this.anchored = true;
        this.vx = 0; this.vy = 0;
        game.playSfx('tink', 0.8);
      }
      return;
    }
    // 锚定：牵引目标每 tick 刷新（Player 侧积分前消费）；
    // 释放条件在此终结（Player 侧只清目标不清弹——proj 活着会重写）
    const ax = this.x + this.w / 2, ay = this.y + this.h / 2;
    if (Math.hypot(p.cx - ax, p.cy - ay) < 24 || p.inputJump) {
      this.dead = true;
      p.grappleTarget = null;
      return;
    }
    p.grappleTarget = { x: ax, y: ay };
  }

  draw(r: { ctx: CanvasRenderingContext2D }, _cam: unknown): void {
    const p = this.playerRef();
    if (!p) return;
    const ctx = r.ctx;
    ctx.save();
    ctx.strokeStyle = '#9a92b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + p.w / 2, p.y + 12);
    ctx.lineTo(this.x + this.w / 2, this.y + this.h / 2);
    ctx.stroke();
    // 钩头
    ctx.fillStyle = this.anchored ? '#c8c0e8' : '#9a92b8';
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.restore();
  }
}
