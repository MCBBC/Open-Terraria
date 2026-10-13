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
  /** playerHook 九 kind(刀4-A 四+刀B/C 五):
   *  preHurt=承伤值链(闪避族前;返 0=拒伤)/postHurt=落地通知(ctx.reduction)
   *  respawn=重生通知/updateDead=死亡态每 tick(ctx.respawnTimer/deadTime)
   *  modifyMoveSpeed=移速乘区链(返乘数,缺省 1) */
  playerHook(kind: string, fn: (ctx: Record<string, unknown>) => number | void): void;
  /** 世界生成 pass 注册(Beaches 后依序执行) */
  registerGenPass(name: string, fn: (store: any, rng: any, gs: any) => void): void;
  system(hooks: ModSystemHooks): void;
  /** ★刀2-C2:NPC 自绘(preDraw 返 false=跳原版/postDraw 后随) */
  npcDraw(key: string, spec: {
    preDraw?(e: unknown, ctx: Record<string, unknown>): boolean | void;
    postDraw?(e: unknown, ctx: Record<string, unknown>): void;
  }): void;
  /** ★刀2-C2:物品世界自绘(preDrawInWorld 返 false=跳原版) */
  itemDraw(key: string, spec: {
    preDrawInWorld?(d: unknown, ctx: Record<string, unknown>): boolean | void;
    postDrawInWorld?(d: unknown, ctx: Record<string, unknown>): void;
  }): void;
  /** ★B/C 批:全局 NPC 钩(tML GlobalNPC 形;全域 NPC 含原版) */
  globalNpc(spec: {
    /** 原版 AI 前;返 false=本 tick 跳过 AI 派发 */
    preAi?(e: object, game: object): boolean | void;
    /** AI 派发完成后 */
    postAi?(e: object, game: object): void;
    /** 防御结算后伤害值链(fn(ctx:{value}) → number=修正后值;DR 族) */
    incomingHit?(e: object, ctx: { value: number }): number | void;
    /** 受击任意来源全域(fromPlayer 门不设;ctx:{damage,crit,killed,projId}) */
    onHitByAny?(e: object, ctx: { damage: number; crit: boolean; killed: boolean; projId: number }): void;
    /** 击杀(原版域含) */
    onKill?(e: object, game: object): void;
  }): void;
  /** ★刀1:游戏内 UI 面板(vui 保留树晋升;拖拽标题栏/关闭钮/Esc 关最上层/
   *  世界输入自动让位。同键重开=聚焦既有面板;面板保留可 show/hide 重开) */
  ui: {
    panel(key: string, opts: {
      title?: string; x?: number; y?: number; width: number; height: number;
      draggable?: boolean; closable?: boolean;
    }): {
      readonly key: string;
      readonly visible: boolean;
      addText(text: string, o: { x: number; y: number; scale?: number; large?: boolean }): void;
      addButton(text: string, o: { x: number; y: number; w?: number; h?: number; onClick: () => void }): void;
      setPosition(x: number, y: number): void;
      moveBy(dx: number, dy: number): void;
      show(): void; hide(): void; toggle(): void; close(): void;
    };
    closeAll(): void;
  };
  /** ★刀5:具名修正槽(tML detour 等价物·修正形)。槽名封闭集:
   *  'Player.ApplyLifeAndOrMana'=治疗量修正 / 'Player.UpdateLifeRegen'=装备回复量修正;
   *  anchor=槽语义版本(引擎 bump 时旧 mod fail-loud 弃用回原版);
   *  fn(ctx:{value,...}) → number=修正后值/undefined=不改;per-mod 单注册,值链 */
  vanillaOverride(slot: 'Player.ApplyLifeAndOrMana' | 'Player.UpdateLifeRegen', anchor: number,
    fn: (ctx: Record<string, unknown>) => number | void): void;
  config: {
    get(key: string): boolean | number | string;
    set(key: string, value: boolean | number | string): void;
  };
  log(...args: unknown[]): void;
}

/** entry.js 的 default export 形(main(sw) 同步执行;内容数据一律走 content/*.json) */
export type ModEntry = (sw: ModContext) => void;
