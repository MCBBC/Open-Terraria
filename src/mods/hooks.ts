// L2 脚本 mod 运行时钩子注册表(2026-10-04,P1)。
// 设计纪律(design.md §2.3):
//   ① 空注册零成本——各 run*/take* 首行按 Map.size/length 短路,热路径无 try/catch
//     (tML 同哲学:mod=可信代码,错误 loud 暴露,不做 per-frame 包装);
//   ② 注册只发生在 loader 脚本相位(启动链 L1 注册之后),运行期无并发写;
//   ③ fail-fast 重复注册(对齐 plan-A 双射纪律);
//   ④ import type 单向——本文件不 import Game/Enemy 运行时面(零环)。
import type { Enemy } from '../entities/Enemy';
import type { Game } from '../core/Game';
import type { Player } from '../entities/Player';
import type { ItemDef } from '../data/items';
import type { InvItem } from '../items/Inventory';
import { MOD_ITEM_STABLE_BASE, MOD_NPC_ID_BASE, MOD_PROJ_ID_BASE, MOD_BUFF_VANILLA_BASE } from './types';

/** mod 物品 use 上下文(updateUse 预分流点供给) */
export interface ModUseCtx {
  game: Game;
  player: Player;
  item: InvItem;
  def: ItemDef;
  /** 钳后目标 tile 坐标(updateUse 的 tx/ty,世界缘钳后) */
  tileX: number;
  tileY: number;
  mouseX: number;
  mouseY: number;
  /** 给本地玩家施加本 mod buff(ModContext 装配时注入;未注册键 fail-fast) */
  applyBuff?(key: string, seconds: number): void;
  /** 返回 true=已消费(updateUse 立即 return;useTime 节奏由 handler 自管,
   *  与 digtoise/无人机原版专支同语义) */
}

/** mod 系统/世界生命周期钩子(全可选) */
export interface ModSystemHooks {
  /** fixedUpdate 头(mouseOvers/tickCount 之后、一切系统之前) */
  preUpdate?: (game: Game, dt: number) => void;
  /** entities.update 之后(实体桶 enemies→drops→npcs→projectiles 全部步进完) */
  postEntities?: (game: Game, dt: number) => void;
  /** postUpdate 头(联机 tick 前) */
  postUpdate?: (game: Game) => void;
  /** afterWorldLoad 尾(新世界/读档全链落定) */
  onWorldLoad?: (game: Game) => void;
  /** Game.destroy(退世界/换世界拆实例) */
  onWorldUnload?: (game: Game) => void;
}

const npcAi = new Map<number, (e: Enemy, game: Game, player: Player | null) => void>();
const itemUse = new Map<number, (ctx: ModUseCtx) => boolean>();
const systems: ModSystemHooks[] = [];

// ---- mod 弹幕注册面(P2) ----

/** mod 弹幕行为 spec(ModProj 实体消费) */
export interface ModProjSpec {
  /** 每 tick 行为钩(重力/位移/寿命内置后的追加;可改 p.vx/p.vy/p.dead 等) */
  update?: (p: ModProjLike, game: Game) => void;
  /** 命中敌怪钩(内置【伤害结算前】调,swallow=true 吞掉本次伤害;
   *  ★swallow=true 不落 hitSet——穿透弹对重叠敌怪每 tick 重复触发,mod 自管) */
  onHit?: (p: ModProjLike, enemy: unknown, game: Game) => boolean | void;
  /** 命中玩家钩(hostile 弹;返回 true=吞掉内置伤害) */
  onHitPlayer?: (p: ModProjLike, game: Game) => boolean | void;
  /** 撞块钩(内置消亡前;返回 true=不消亡=穿透) */
  onTileHit?: (p: ModProjLike, game: Game) => boolean | void;
  /** 命中敌怪施加 mod debuff(P4;命中结算后掷):buff=本 mod sw.buff 键,
   *  duration=秒,chance 缺省 1 */
  npcDebuff?: { buff: string; duration: number; chance?: number };
  /** 重力/tick(缺省 0=直线) */
  gravity?: number;
  /** 寿命 tick(缺省 3600) */
  lifetime?: number;
  /** 穿透次数(缺省 1;≤0=无限穿透) */
  pierce?: number;
  /** 撞块消亡(缺省 true) */
  tileCollide?: boolean;
  /** 贴图 textures/ 相对路径(经 mod 资产注入,Projectile_<projId> 语义) */
  texture: string;
  /** 弹盒宽高 px(缺省 16×16) */
  width?: number;
  height?: number;
  /** 绘制旋转=速度向(箭类;缺省 false) */
  rotateToVelocity?: boolean;
}

/** ModProj 暴露给 mod 钩子的最小面 */
export interface ModProjLike {
  x: number; y: number; vx: number; vy: number; w: number; h: number;
  projId: number; damage: number; knockback: number; pierce: number;
  dead: boolean; ageTicks: number;
  kill(): void;
}

const projSpecs = new Map<number, ModProjSpec>();
/** 资产相位遍历簿(注册序=确定性分配序) */
const projRegs: Array<{ projId: number; modId: string; spec: ModProjSpec }> = [];

/** projId 分配器:全局注册序(拓扑序 mod × 入口代码序)=确定性(联机一致根) */
export function allocateModProjId(): number {
  return MOD_PROJ_ID_BASE + projRegs.length;
}

export function registerModProj(projId: number, modId: string, spec: ModProjSpec): void {
  if (!(projId >= MOD_PROJ_ID_BASE)) throw new Error(`[mod-hooks] projId 须 ≥${MOD_PROJ_ID_BASE}: ${projId}`);
  if (projSpecs.has(projId)) throw new Error(`[mod-hooks] projectile 重复注册: ${projId}`);
  if (!spec.texture) throw new Error(`[mod-hooks] projectile 缺 texture: ${projId}`);
  projSpecs.set(projId, spec);
  projRegs.push({ projId, modId, spec });
}

export function modProjSpecOf(projId: number): ModProjSpec | null {
  if (projSpecs.size === 0 || projId < MOD_PROJ_ID_BASE) return null;
  return projSpecs.get(projId) ?? null;
}

/** entry 相位:给声明弹追加代码钩(update/onHit 族;合并进已注册 spec)。
 *  未注册 projId fail-fast;重复挂同型钩=覆写(幂等语义)。 */
export function registerProjHooks(projId: number, hooks: {
  update?: ModProjSpec['update'];
  onHit?: ModProjSpec['onHit'];
  onHitPlayer?: ModProjSpec['onHitPlayer'];
  onTileHit?: ModProjSpec['onTileHit'];
}): void {
  const spec = projSpecs.get(projId);
  if (!spec) throw new Error(`[mod-hooks] projectileHook 引用未注册弹: ${projId}`);
  if (hooks.update) spec.update = hooks.update;
  if (hooks.onHit) spec.onHit = hooks.onHit;
  if (hooks.onHitPlayer) spec.onHitPlayer = hooks.onHitPlayer;
  if (hooks.onTileHit) spec.onTileHit = hooks.onTileHit;
}

/** 资产相位:全部 mod 弹注册簿(注入 vanilla/Projectile_<id>.png 覆盖键用) */
export function modProjRegs(): readonly Readonly<{ projId: number; modId: string; spec: ModProjSpec }>[] {
  return projRegs;
}

/** projId → 所属 modId(npcDebuff 键解析用;未注册=null) */
export function modProjModIdOf(projId: number): string | null {
  return projRegs.find((r) => r.projId === projId)?.modId ?? null;
}

// ---- mod NPC debuff 存储/tick(P4) ----

/** NPC 侧 mod buff 存活态(秒):Enemy → (buffType → 剩余秒)。
 *  WeakMap=随实体死亡自动回收,零 Enemy 类侵入 */
const npcBuffStore = new WeakMap<object, Map<number, number>>();

export function applyModNpcBuff(enemy: object, buffType: number, seconds: number): void {
  if (buffType < 0 || !(seconds > 0)) return;
  let m = npcBuffStore.get(enemy);
  if (!m) { m = new Map(); npcBuffStore.set(enemy, m); }
  m.set(buffType, Math.max(m.get(buffType) ?? 0, seconds));   // max 合并=原版 AddBuff 语义
}

const modBuffNpcTicks = new Map<number, (enemy: Enemy, game: Game) => void>();

export function registerModBuffNpcTick(buffType: number, fn: (enemy: Enemy, game: Game) => void): void {
  if (modBuffNpcTicks.has(buffType)) throw new Error(`[mod-hooks] buff npcTick 重复注册: ${buffType}`);
  modBuffNpcTicks.set(buffType, fn);
}

/** runModPostEntities 派发:存活敌怪的 mod debuff 逐个 onNpcTick+倒计时 */
function tickNpcBuffs(game: Game, dt: number): void {
  const entities = (game as unknown as { entities: { enemies: Enemy[] } }).entities;
  for (const e of entities.enemies) {
    const m = npcBuffStore.get(e);
    if (!m || m.size === 0) continue;
    for (const [bt, left] of m) {
      const fn = modBuffNpcTicks.get(bt);
      if (fn && !e.dead) fn(e, game);
      const next = left - dt;
      if (next <= 0) m.delete(bt); else m.set(bt, next);
    }
  }
}

export function registerNpcAi(npcId: number, fn: (e: Enemy, game: Game, player: Player | null) => void): void {
  if (!(npcId >= MOD_NPC_ID_BASE)) throw new Error(`[mod-hooks] npcId 须 ≥${MOD_NPC_ID_BASE}: ${npcId}`);
  if (npcAi.has(npcId)) throw new Error(`[mod-hooks] npc AI 重复注册: ${npcId}`);
  npcAi.set(npcId, fn);
}

export function registerItemUse(vid: number, fn: (ctx: ModUseCtx) => boolean): void {
  if (!(vid >= MOD_ITEM_STABLE_BASE)) throw new Error(`[mod-hooks] vid 须 ≥${MOD_ITEM_STABLE_BASE}: ${vid}`);
  if (itemUse.has(vid)) throw new Error(`[mod-hooks] item use 重复注册: ${vid}`);
  itemUse.set(vid, fn);
}

export function registerSystem(hooks: ModSystemHooks): void {
  systems.push(hooks);
}

// ---- B6:OnHitNPC 代码钩(tModLoader ModItem.OnHitNPC 形;P7 GAPS 头号项) ----
const onHitNpc = new Map<number, (e: Enemy, game: Game, ctx: { damage: number; crit: boolean; killed: boolean }) => void>();

export function registerModOnHitNpc(
  vid: number, fn: (e: Enemy, game: Game, ctx: { damage: number; crit: boolean; killed: boolean }) => void,
): void {
  if (!(vid >= MOD_ITEM_STABLE_BASE)) throw new Error(`[mod-hooks] onHitNpc vid 须 ≥${MOD_ITEM_STABLE_BASE}: ${vid}`);
  if (onHitNpc.has(vid)) throw new Error(`[mod-hooks] onHitNpc 重复注册: ${vid}`);
  onHitNpc.set(vid, fn);
}

/** B6:mod 音效通道(原版 SoundID 键;mod 音频装载=余段)。sink=main.ts 注入
 *  (代理 game.playSfxFiles);Boss AI 钩内 sw.playSound(...) 即播。 */
let modAudioSink: ((files: string[], volume: number, x?: number, y?: number) => void) | null = null;

export function setModAudioSink(fn: (files: string[], volume: number, x?: number, y?: number) => void): void {
  modAudioSink = fn;
}

export function playModSound(files: string[], volume = 1, x?: number, y?: number): void {
  if (modAudioSink) modAudioSink(files, volume, x, y);
}

/** B6:NPC 死亡钩注册表(Hive Tumor→Boss 遭遇链面) */
const onNpcDeath = new Map<number, (e: Enemy, game: Game) => void>();

export function registerModNpcDeath(npcId: number, fn: (e: Enemy, game: Game) => void): void {
  if (!(npcId >= MOD_NPC_ID_BASE)) throw new Error(`[mod-hooks] npcDeath id 须 ≥${MOD_NPC_ID_BASE}: ${npcId}`);
  if (onNpcDeath.has(npcId)) throw new Error(`[mod-hooks] npcDeath 重复注册: ${npcId}`);
  onNpcDeath.set(npcId, fn);
}

/** 击杀单口派发(onEnemyKilled 头):mod NPC 死亡钩;空表零成本。 */
export function runModOnNpcDeath(vanillaId: number | null | undefined, e: Enemy, game: Game): void {
  if (vanillaId === null || vanillaId === undefined || vanillaId < MOD_NPC_ID_BASE || onNpcDeath.size === 0) return;
  const fn = onNpcDeath.get(vanillaId);
  if (fn) fn(e, game);
}

/** 近战命中结算缝(受理命中后):mod 物品带 onHit 钩时调用;空表零成本。 */
export function runModOnHitNpc(
  vid: number | undefined, e: Enemy, game: Game, ctx: { damage: number; crit: boolean; killed: boolean },
): void {
  if (vid === undefined || vid < MOD_ITEM_STABLE_BASE || onHitNpc.size === 0) return;
  const fn = onHitNpc.get(vid);
  if (fn) fn(e, game, ctx);
}

/** Enemy.fixedUpdate AI 派发缝:mod NPC(800+)带自定义 ai 时返回处理器(接管整支,
 *  共享尾段照走);否则 null=原版 aiStyle switch 照旧。null vanillaId/原版域=零成本。 */
export function takeModNpcAi(vanillaId: number | null): ((e: Enemy, game: Game, player: Player | null) => void) | null {
  if (vanillaId === null || vanillaId < MOD_NPC_ID_BASE || npcAi.size === 0) return null;
  return npcAi.get(vanillaId) ?? null;
}

/** updateUse 预分流:mod 物品带 use 处理器时调用之;返回 true=已消费。 */
export function runModItemUse(
  game: Game, def: ItemDef | null, item: InvItem | null, tileX: number, tileY: number,
): boolean {
  if (itemUse.size === 0 || !def || !item) return false;
  const vid = def.vid;
  if (vid === undefined || vid < MOD_ITEM_STABLE_BASE) return false;
  const fn = itemUse.get(vid);
  if (!fn) return false;
  return fn({
    game, player: game.player, item, def, tileX, tileY,
    mouseX: game.input.mouseX, mouseY: game.input.mouseY,
  });
}

export function runModPreUpdate(game: Game, dt: number): void {
  if (systems.length > 0) {
    for (let i = 0; i < systems.length; i++) systems[i]!.preUpdate?.(game, dt);
  }
  // ★mod buff tick(P2):本地玩家激活的 mod buff 逐个 onTick——并入 preUpdate 派发
  //  (零新增 Game.ts 刀点;独立于 systems 门——只有 buff 的 mod 也要走)。域判定:
  //  modBuffTicks 键=mod buff type(300+),原版 type 恒 miss。
  if (modBuffTicks.size > 0) {
    const buffs = (game.player as unknown as { buffs?: { active?: Map<number, number> } }).buffs;
    if (buffs?.active) {
      for (const [bt] of buffs.active) {
        const fn = modBuffTicks.get(bt);
        if (fn) fn(game.player, game);
      }
    }
  }
}

export function runModPostEntities(game: Game, dt: number): void {
  if (systems.length > 0) {
    for (let i = 0; i < systems.length; i++) systems[i]!.postEntities?.(game, dt);
  }
  // ★mod NPC debuff tick(P4):独立于 systems 门(同 buff tick 纪律)
  if (modBuffNpcTicks.size > 0) tickNpcBuffs(game, dt);
}

export function runModPostUpdate(game: Game): void {
  if (systems.length === 0) return;
  for (let i = 0; i < systems.length; i++) systems[i]!.postUpdate?.(game);
}

export function runModOnWorldLoad(game: Game): void {
  if (systems.length === 0) return;
  for (let i = 0; i < systems.length; i++) systems[i]!.onWorldLoad?.(game);
}

export function runModOnWorldUnload(game: Game): void {
  if (systems.length === 0) return;
  for (let i = 0; i < systems.length; i++) systems[i]!.onWorldUnload?.(game);
}

// ---- mod buff tick 注册面(P2;注册表/图标/名称在 mods/buffs.ts) ----

const modBuffTicks = new Map<number, (player: Player, game: Game) => void>();

export function registerModBuffTick(buffType: number, fn: (player: Player, game: Game) => void): void {
  if (buffType < 0) throw new Error(`[mod-hooks] buffType 非法: ${buffType}`);
  if (modBuffTicks.has(buffType)) throw new Error(`[mod-hooks] buff tick 重复注册: ${buffType}`);
  modBuffTicks.set(buffType, fn);
}

export function modBuffTypesActive(): ReadonlySet<number> {
  return new Set([...modBuffTicks.keys()]);
}

/** mod buff 伪 vanillaBuff 域判定(图标 URL 覆盖键判定用;9000+) */
export function isModBuffVanilla(vanillaBuffId: number): boolean {
  return vanillaBuffId >= MOD_BUFF_VANILLA_BASE;
}

/** 测试重置(模块态隔离;loader 单测同款纪律;WeakMap 存储随分代回收) */
export function _resetModHooksForTests(): void {
  npcAi.clear(); itemUse.clear(); systems.length = 0; onNpcDeath.clear();
  projSpecs.clear(); projRegs.length = 0; modBuffTicks.clear();
  modBuffNpcTicks.clear();
  onHitNpc.clear();
}
