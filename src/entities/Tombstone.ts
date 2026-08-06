// 墓碑实体：死亡时从死亡点掉落，带重力/落地弹跳/空中翻滚物理，
// 落地弹跳几次能量耗尽后安放到最近的 90° 朝向（直立/侧躺/倒扣都可能）。
// 不可拾取、不消失（本局会话内持续存在）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { GRAVITY, MAX_FALL_SPEED } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';

/** 程序化像素墓碑贴图（16×22：圆顶石碑 + 底座 + 刻痕 + 左亮右暗） */
let tombstoneCanvas: HTMLCanvasElement | null = null;
export function getTombstoneCanvas(): HTMLCanvasElement {
  if (!tombstoneCanvas) {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 22;
    const x = c.getContext('2d')!;
    const stone = '#A8A8B4', dark = '#70707E', light = '#C4C4D0', en = '#585864';
    // 圆顶石碑
    x.fillStyle = stone;
    x.fillRect(4, 2, 8, 2);
    x.fillRect(3, 4, 10, 10);
    x.fillRect(2, 14, 12, 3);
    // 底座
    x.fillStyle = dark;
    x.fillRect(1, 17, 14, 2);
    x.fillRect(2, 19, 12, 1);
    // 立体感：左缘亮、右缘暗
    x.fillStyle = light;
    x.fillRect(3, 5, 1, 11);
    x.fillStyle = dark;
    x.fillRect(12, 5, 1, 11);
    // 刻痕（三行短横，墓志铭感）
    x.fillStyle = en;
    x.fillRect(6, 6, 4, 1);
    x.fillRect(5, 9, 6, 1);
    x.fillRect(6, 12, 4, 1);
    tombstoneCanvas = c;
  }
  return tombstoneCanvas;
}

export class Tombstone extends Entity {
  w = 14; h = 14;
  angle = 0;           // 当前倾角（弧度，0 = 直立）
  /** 原版墓碑样式：Tiles_85 偶数列起的 2×2 样式块（21 列 → 11 种） */
  styleCol = 0;
  private angVel = 0;  // 空中翻滚角速度
  private restAngle = 0;  // 安放目标角（最近的 90° 倍数）
  private settled = false;
  private bounces = 0;

  constructor(x: number, y: number) {
    super();
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.vx = (Math.random() - 0.5) * 2.4;   // 随机水平抛出
    this.vy = -1.2 - Math.random();          // 小幅上抛再坠落
    this.angVel = (Math.random() - 0.5) * 0.32;
    this.styleCol = 2 * Math.floor(Math.random() * 11); // 随机样式块
  }

  fixedUpdate(dt: number, game: GameHooks) {
    // 已安放：缓慢转正到目标角后完全静止
    if (this.settled) {
      const diff = this.restAngle - this.angle;
      this.angle += diff * 0.12;
      if (Math.abs(diff) < 0.01) this.angle = this.restAngle;
      return;
    }

    const impact = this.vy; // 碰撞前的下落速度（反弹力度依据）
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    this.vx *= 0.995;
    moveAndCollide(this, game.world, this.vx, this.vy);
    this.angle += this.angVel;

    if (this.onGround) {
      const energy = Math.abs(impact) + Math.abs(this.vx) * 0.5 + Math.abs(this.angVel);
      if (impact > 2.2 && energy > 3) {
        // 落地弹跳：弹性 0.5，翻滚角速度反弹 + 随机扰动（四处乱蹦的喜感）
        // 不设次数上限——由能量耗尽收敛（每跳冲击递减，数学上必停）
        this.vy = -impact * 0.5;
        this.angVel = this.angVel * -0.6 + (Math.random() - 0.5) * 0.14;
        this.vx = this.vx * 0.8 + (Math.random() - 0.5) * 0.8;
        this.bounces++;
        this.onGround = false;
      } else {
        // 地面滚停期：摩擦消耗残余动量（位移与角速度同步衰减，防无限微抖）
        this.vx *= 0.82;
        this.angVel *= 0.82;
        if (Math.abs(this.vx) < 0.08 && Math.abs(this.angVel) < 0.02) {
          // 完全静止 → 安放。直立偏好：偏离直立 <35° 一律立正（动静不大不侧躺），
          // 超过才倒向最近的 90°（侧躺/倒扣）
          this.vx = 0; this.vy = 0; this.angVel = 0;
          const q = Math.PI / 2;
          const turns = Math.round(this.angle / q);
          const off = this.angle - turns * q; // -90°..90° 偏离
          this.restAngle = Math.abs(off) < (35 * Math.PI) / 180 ? turns * q : turns * q + Math.sign(off || 1) * q;
          this.settled = true;
        }
      }
    }
    if (this.hitWall) { this.vx = -this.vx * 0.55; this.angVel *= -0.55; }
    void dt;
  }

  draw() { /* Renderer 统一绘制 */ }
}
