/**
 * SandboxWorld Mod API 类型声明(2026-10-04 P4)
 * ============================================================
 * 供 mod 工程 TS 开发用(与引擎 src/mods/{api,hooks,buffs,config}.ts 手写镜像;
 * 引擎侧为权威——升级引擎后请随批章更新本文件)。
 *
 * 用法:放到 mod 工程根,tsconfig `"include": ["mod-api.d.ts", "scripts/**/*.ts"]`。
 * entry.js 可用 TS 编写(esbuild/tsc 打包为单文件 main.js 后随 .swmod 分发)。
 */

export declare interface ModUseCtx {
  /** 游戏实例(fixedUpdate 同源全量 Game) */
  game: object;
  /** 本地玩家(可读 hp/x/y 等;写属性=自担平衡) */
  player: Record<string, any>;
  /** 手持物品槽 {id, stack, prefix?} */
  item: { id: number; stack: number; prefix?: number };
  /** 物品定义(vid=stable id≡30000+ 段) */
  def: Record<string, any>;
  /** 钳后目标 tile 坐标 */
  tileX: number;
  tileY: number;
  mouseX: number;
  mouseY: number;
  /** 给本地玩家施加本 mod buff(秒;max 合并语义) */
  applyBuff(key: string, seconds: number): void;
  /** 返回 true=已消费(updateUse 立即返回;useTime 节奏自管) */
}

export declare interface ModProjLike {
  x: number; y: number; vx: number; vy: number; w: number; h: number;
  projId: number; damage: number; knockback: number; pierce: number;
  dead: boolean; ageTicks: number;
  kill(): void;
}

export declare interface ModProjSpec {
  update?(p: ModProjLike, game: object): void;
  onHit?(p: ModProjLike, enemy: object, game: object): boolean | void;
  onHitPlayer?(p: ModProjLike, game: object): boolean | void;
  onTileHit?(p: ModProjLike, game: object): boolean | void;
  npcDebuff?: { buff: string; duration: number; chance?: number };
  gravity?: number;
  lifetime?: number;
  pierce?: number;
  tileCollide?: boolean;
  texture: string;
  width?: number;
  height?: number;
  rotateToVelocity?: boolean;
}

export declare interface ModBuffSpec {
  name: string;
  texture: string;
  onTick?(player: Record<string, any>, game: object): void;
  onNpcTick?(enemy: Record<string, any>, game: object): void;
  desc?: string;
}

export declare interface ModSystemHooks {
  preUpdate?(game: object, dt: number): void;
  postEntities?(game: object, dt: number): void;
  postUpdate?(game: object): void;
  onWorldLoad?(game: object): void;
  onWorldUnload?(game: object): void;
}

export declare interface ModContext {
  readonly id: string;
  npcAi(key: string, fn: (e: any, game: any, player: any) => void): void;
  itemUse(key: string, fn: (ctx: ModUseCtx) => boolean): void;
  /** B6:本 mod 物品近战命中敌怪钩(受理命中后;ModItem.OnHitNPC 形) */
  onHitNpc(key: string, fn: (e: unknown, game: unknown, ctx: { damage: number; crit: boolean; killed: boolean }) => void): void;
  projectileHook(key: string, hooks: {
    update?(p: ModProjLike, game: any): void;
    onHit?(p: ModProjLike, enemy: any, game: any): boolean | void;
    onHitPlayer?(p: ModProjLike, game: any): boolean | void;
    onTileHit?(p: ModProjLike, game: any): boolean | void;
  }): void;
  buff(key: string, spec: ModBuffSpec): void;
  /** 玩家侧钩(刀4-A 四 kind):
   *  'modifyHurtByNpc'=承伤修正链(值链;★全 NPC 攻端,ctx.attackerVid≥800=mod 攻端;
   *    fn(ctx:{player,game,attackerVid,dmg,contact}) → number=修正后伤/undefined=不改)
   *  'modifyHitNpc'=近战命中增幅链(倍率;ctx:{player,game,vid,dmg,crit?,kb?,armorPen?})
   *  'modifyHitNpcByProj'=玩家弹命中 NPC 增幅链(倍率;ctx:{player,game,projVid,targetVid,dmg,crit})
   *  'modifyHitPlayerByProj'=敌弹命中玩家增幅链(倍率;ctx:{player,game,projVid,dmg,trap,pvp}) */
  playerHook(kind: string, fn: (ctx: Record<string, unknown>) => number | void): void;
  /** 世界生成 pass 注册(Beaches 后依序执行) */
  registerGenPass(name: string, fn: (store: any, rng: any, gs: any) => void): void;
  system(hooks: ModSystemHooks): void;
  config: {
    get(key: string): boolean | number | string;
    set(key: string, value: boolean | number | string): void;
  };
  log(...args: unknown[]): void;
}

/** entry.js 的 default export 形(main(sw) 同步执行;内容数据一律走 content/*.json) */
export type ModEntry = (sw: ModContext) => void;
