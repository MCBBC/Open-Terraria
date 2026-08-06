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
    for (const list of [this.enemies, this.drops, this.npcs, this.projectiles, this.props, this.critters]) {
      for (const e of list) e.fixedUpdate(dt, game);
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.drops = this.drops.filter((e) => !e.dead);
    this.npcs = this.npcs.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((e) => !e.dead);
    this.props = this.props.filter((e) => !e.dead);
    this.critters = this.critters.filter((e) => !e.dead);
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
