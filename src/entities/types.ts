// 实体与 Game 交互的接口（避免循环依赖，只放类型）
import type { World } from '../world/World';

export interface GameHooks {
  world: World;
  /** 主角(投射物命中判定用) */
  player: import('./Player').Player;
  /** 敌人列表(投射物命中判定用) */
  enemies(): unknown[];
  /** 小动物列表(弹幕命中判定用;近战挥砍在 Game 内直接遍历桶) */
  critters(): unknown[];
  /** 在世界上生成掉落物（返回实体便于染色等后处理） */
  spawnDrop(x: number, y: number, itemKey: string, count?: number, vx?: number, vy?: number): import('./ItemDrop').ItemDrop | null;
  /** 对玩家造成伤害（attacker 用于荆棘反伤） */
  damagePlayer(dmg: number, srcX: number, srcY: number, attacker?: unknown): void;
  /** 伤害数字飘字 */
  addDamageNumber(x: number, y: number, amount: number, crit: boolean, color?: string): void;
  /** 弹幕砍 tileCut 物（Projectile.CutTiles 语义：箭扫过杂草/瓦罐 → Game 内部分流） */
  cutTile(x: number, y: number): void;
  /** 传送门弹 601 落门（PortalHelper.TryPlacingPortal + AddPortal；Game 实现入 props 桶） */
  placePortal?(x: number, y: number, vx: number, vy: number, form: number): void;
  /** 敌人死亡 */
  onEnemyKilled(key: string, enemy?: import('../entities/Enemy').Enemy): void;
  /** 出生敌人 */
  spawnEnemy(key: string, x: number, y: number): void;
  /** 粒子 */
  spawnParticles(
    x: number, y: number, color: string, count: number, speed?: number,
    opts?: { life?: number; damp?: number; grav?: number; size?: number },
  ): void;
  /** 定向粒子爆发（烟花爆花/喷泉/马桶水花等原版 dust 带初速方向的场景；
   *  spawnParticles 为全向均匀发射，无法表达定向）。dir 为中心角、spread 为半散布，
   *  xMul/yMul 为原版轴向压缩（如 168 尘 y×0.75、马桶尘 x×0.5） */
  spawnBurst?(
    x: number, y: number, color: string, count: number, speed: number,
    dir: number, spread: number,
    opts?: { life?: number; damp?: number; grav?: number; xMul?: number; yMul?: number },
  ): void;
  /** 拾取物品后刷新 UI（掉落物实体调用） */
  notifyInventoryChanged(): void;
  /** 播放音效 */
  // 世界坐标声（原版 SoundEngine.PlaySound 带 x/y）：x/y 省略 = UI/玩家动作声不衰减
  playSfx(name: string, vol?: number, x?: number, y?: number): void;
  playSfxFiles(files: string[], vol?: number, x?: number, y?: number): void; // 怪物专属声效（原版文件名列表）
  /** 按原版文件名直播（无合成兜底；缓冲未就位时仅触发后台懒加载，本播静默） */
  playSfxFile?(file: string, vol?: number, x?: number, y?: number): void;
  /** 拾取物品时在主角旁飘出物品名 */
  showPickupLabel(itemKey: string): void;
  /** 掉落系统补充上下文（灵魂/钥匙/风筝等条件）：Game 实现，缺省则这些条件按 false */
  dropContext?(): import('../drops/NpcDrops').DropExtras;
  /** 月事件上下文（南瓜月/霜月 wave-gate 掉落条件）：Game 实现，缺省按无事件（恒 false） */
  moonEventCtx?(): { kind: 1 | 2; wave: number } | null;
  /** 环境判定（Game.scene，SceneMetrics 每 15t 以玩家为中心刷新；Boss 暴怒度/石巨人
   *  脱庙加成读 zoneJungle/zoneTemple——原版 Main.player[target].ZoneJungle/ZoneLihzhardTemple） */
  scene?: import('../world/SceneMetrics').SceneFlags;
}
