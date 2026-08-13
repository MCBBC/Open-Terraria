// 实体基类与分桶管理器
import type { GameHooks } from './types';
import type { Camera } from '../render/Camera';
import type { Renderer } from '../render/Renderer';

export abstract class Entity {
  id = 0;
  x = 0; y = 0;          // 左上角 px
  w = 16; h = 16;
  vx = 0; vy = 0;
  dead = false;
  onGround = false;
  hitWall = false;
  hitHead = false;
  dropThrough = false;
  /** 液体位移减速因子（原版 waterMovementSpeed 族，NPC.cs:5946 默认 水/岩浆 .5、
   *  蜂蜜 .25、微光 .375）。1=dry 不减速；Enemy 侧 npcLiquid.updateNpcLiquid 每 tick 写，
   *  moveAndCollide 入口缩 dx/dy（velocity 不变——同 Collision_MoveWhileWet :93986） */
  liqFactor = 1;
  // ---- 联机傀儡标记（v3 实体同步）：快照驱动实体，本地不跑 AI/命中判定 ----
  netPuppet = false;
  /** 联机实体号（拥有者 slot 高 8 位 + 本地 id 低 24 位；见 net/entitySyncHooks） */
  netId = 0;
  // ---- P3.2 傀儡插值缓冲（15Hz 快照 × 60TPS 渲染的平滑桥）----
  /** 最新权威快照位（NPC 接触判定用；弹幕侧判定用渲染位——见 Game 两处接触注释） */
  netAx = 0; netAy = 0;
  /** 插值起点（快照到达时的渲染位）与进度（1=已到目标，纯外推） */
  netIx = 0; netIy = 0; netIt = 1;
  private netSnapIvt = 4;

  abstract fixedUpdate(dt: number, game: GameHooks): void;
  abstract draw(r: Renderer, cam: Camera): void;

  /** 快照到达（Game.netApplyNpcSnaps / netApplyProjSnaps 调用）：设插值目标。
   *  从当前渲染位连续出发（中途到包不跳变）；intervalTicks = 快照周期（15Hz=4 tick） */
  netSnapTo(x: number, y: number, intervalTicks = 4) {
    this.netIx = this.x; this.netIy = this.y;
    this.netAx = x; this.netAy = y;
    this.netIt = 0;
    this.netSnapIvt = Math.max(1, intervalTicks);
  }

  /** 傀儡每 tick 推进：未到目标走 smoothstep 插值（一个快照周期到达），到后纯速度外推 */
  netPuppetStep() {
    if (this.netIt < 1) {
      this.netIt = Math.min(1, this.netIt + 1 / this.netSnapIvt);
      const t = this.netIt * this.netIt * (3 - 2 * this.netIt); // smoothstep
      this.x = this.netIx + (this.netAx - this.netIx) * t;
      this.y = this.netIy + (this.netAy - this.netIy) * t;
      return;
    }
    this.x += this.vx;
    this.y += this.vy;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  aabbOverlaps(o: Entity): boolean {
    return this.x < o.x + o.w && this.x + this.w > o.x && this.y < o.y + o.h && this.y + this.h > o.y;
  }
}

/** 就地剔除 dead 实体(保持顺序,零分配) */
function compact(list: Entity[]): void {
  let w = 0;
  for (let r = 0; r < list.length; r++) {
    const e = list[r];
    if (!e.dead) list[w++] = e;
  }
  list.length = w;
}

export class EntityManager {
  nextId = 1;
  enemies: Entity[] = [];
  drops: Entity[] = [];
  npcs: Entity[] = [];
  projectiles: Entity[] = [];
  props: Entity[] = [];   // 场景物件（墓碑等不可拾取物理实体）
  critters: Entity[] = []; // 小动物（无害被动生物）

  add(e: Entity, bucket: 'enemies' | 'drops' | 'npcs' | 'projectiles' | 'props' | 'critters') {
    e.id = this.nextId++;
    this[bucket].push(e);
  }

  update(dt: number, game: GameHooks) {
    // 就地压缩替代 6×filter(2026-08 审计 G9:每 tick 6 个新数组,60Hz 恒定分配)
    for (const list of [this.enemies, this.drops, this.npcs, this.projectiles, this.props, this.critters]) {
      for (const e of list) e.fixedUpdate(dt, game);
      compact(list);
    }
  }

  clear() {
    this.enemies.length = 0;
    this.drops.length = 0;
    this.npcs.length = 0;
    this.projectiles.length = 0;
    this.props.length = 0;
    this.critters.length = 0;
  }

  all(): Entity[] {
    return [...this.enemies, ...this.drops, ...this.npcs, ...this.projectiles, ...this.props, ...this.critters];
  }
}
