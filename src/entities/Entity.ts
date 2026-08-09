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

  abstract fixedUpdate(dt: number, game: GameHooks): void;
  abstract draw(r: Renderer, cam: Camera): void;

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
