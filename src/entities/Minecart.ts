// 矿车实体(原版 Minecart 语义简化):沿轨道(v_314)骑行,无轨重力下落,跳车脱离。
// 轨道跟随:检测身体中心下方/前方轨道格,水平保持 vy=0 贴轨,左右加速 0.15/上限 8。
import { Entity } from './Entity';
import { TILE, GRAVITY } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

export class Minecart extends Entity {
  w = 16; h = 16;
  vx = 0;
  vy = 0;
  life = 3600;
  dead = false;
  mounted = false;   // 玩家是否骑乘中(由 Game 挂载)
  riderX = 0; riderY = 0; // 骑乘时玩家渲染位置跟随车

  private trackAt(game: GameHooks, tx: number, ty: number): boolean {
    const st = game.world.store;
    return !!(st.inBounds(tx, ty) && st.flags[st.idx(tx, ty)]
      && st.type[st.idx(tx, ty)] === (game as unknown as { trackTile: number }).trackTile);
  }

  draw(r: Renderer, cam: Camera): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const x = (this.x - cam.x) * cam.zoom + r.canvas.width / 2;
    const y = (this.y - cam.y) * cam.zoom + r.canvas.height / 2;
    // 车身近似:灰底+深轮(素材暂无独立 cart sprite,用主色块)
    ctx.fillStyle = '#7A6A50';
    ctx.fillRect(x, y + 6 * cam.zoom, this.w * cam.zoom, 8 * cam.zoom);
    ctx.fillStyle = '#3A3230';
    ctx.fillRect(x + 2 * cam.zoom, y + 12 * cam.zoom, 4 * cam.zoom, 4 * cam.zoom);
    ctx.fillRect(x + 10 * cam.zoom, y + 12 * cam.zoom, 4 * cam.zoom, 4 * cam.zoom);
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    if (--this.life <= 0) { this.dead = true; return; }
    const st = game.world.store;
    // 轨道检测:身体中心所在格及下一格
    const cx = Math.floor((this.x + this.w / 2) / TILE);
    const cy = Math.floor((this.y + this.h / 2) / TILE);
    const onTrack = this.trackAt(game, cx, cy) || this.trackAt(game, cx, cy + 1);
    if (onTrack) {
      // 贴轨:轨道中心线 = 格底
      const trackTop = (cy + 1) * TILE;
      this.y = trackTop - this.h + 2;
      this.vy = 0;
      // 无骑乘输入时轻微摩擦
      if (!this.mounted) this.vx *= 0.98;
    } else {
      this.vy = Math.min(this.vy + GRAVITY, 8);
    }
    this.x += this.vx;
    this.y += this.vy;
    // 撞墙停止
    const tx = Math.floor((this.x + this.w / 2 + Math.sign(this.vx) * this.w / 2) / TILE);
    if (st.isSolid(tx, Math.floor((this.y + this.h - 2) / TILE))) this.vx = 0;
    // 落地消失(非轨道地面)
    if (this.y > game.world.store.h * TILE - 32) this.dead = true;
  }
}
