// 实体与 Game 交互的接口（避免循环依赖，只放类型）
import type { World } from '../world/World';

export interface GameHooks {
  world: World;
  /** 主角(投射物命中判定用) */
  player: import('./Player').Player;
  /** 敌人列表(投射物命中判定用) */
  enemies(): unknown[];
  /** 在世界上生成掉落物 */
  spawnDrop(x: number, y: number, itemKey: string, count?: number, vx?: number, vy?: number): void;
  /** 对玩家造成伤害（attacker 用于荆棘反伤） */
  damagePlayer(dmg: number, srcX: number, srcY: number, attacker?: unknown): void;
  /** 伤害数字飘字 */
  addDamageNumber(x: number, y: number, amount: number, crit: boolean, color?: string): void;
  /** 敌人死亡 */
  onEnemyKilled(key: string): void;
  /** 出生敌人 */
  spawnEnemy(key: string, x: number, y: number): void;
  /** 粒子 */
  spawnParticles(
    x: number, y: number, color: string, count: number, speed?: number,
    opts?: { life?: number; damp?: number; grav?: number },
  ): void;
  /** 拾取物品后刷新 UI（掉落物实体调用） */
  notifyInventoryChanged(): void;
  /** 播放音效 */
  playSfx(name: string, vol?: number): void; // vol 0-1 按距离衰减
  playSfxFiles(files: string[], vol?: number): void; // 怪物专属声效（原版文件名列表）
  /** 拾取物品时在主角旁飘出物品名 */
  showPickupLabel(itemKey: string): void;
}
