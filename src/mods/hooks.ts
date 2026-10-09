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
import { _resetModMusicForTests, setMenuMusicKey } from './music';   // BGM 面:菜单主题音乐键载体
import type { ModSpawnRule } from '../world/spawn/VanillaSpawner';

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
  /** ★三百四十五刀:右键使用态(C# Player.altFunctionUse;0=左键/2=右键) */
  altFunctionUse: number;
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

/** ★一百零八刀R2:mod 世界生成 pass 注册面(引擎 WorldGen 在 Beaches 后依序执行;
 *  fn 收 (store, rng, gs),gs.mods.tileIdByKey 供 tile 键解析;引擎零 mod 知识) */
export interface ModGenPass { name: string; fn: (store: unknown, rng: unknown, gs: unknown) => void; }
const modGenPasses: ModGenPass[] = [];
export function registerModGenPass(p: ModGenPass): void {
  if (modGenPasses.some((x) => x.name === p.name)) throw new Error(`[mod-hooks] genPass 重复注册: ${p.name}`);
  modGenPasses.push(p);
}
export function modGenPassesSnapshot(): readonly ModGenPass[] { return modGenPasses; }

/** ★三百三十三刀:mod 物品使用条件门(C# CanUseItem 同位;updateUse 预分流
 *  点消费;false=本拍禁用) */
const itemCanUse = new Map<number, (ctx: ModUseCtx) => boolean>();

export function registerModCanUse(vid: number, fn: (ctx: ModUseCtx) => boolean): void {
  if (itemCanUse.has(vid)) throw new Error(`[mod-hooks] canUse 重复注册: ${vid}`);
  itemCanUse.set(vid, fn);
}

export function runModCanUse(game: Game, def: ItemDef | null, item: InvItem | null): boolean {
  if (itemCanUse.size === 0 || !def || !item) return true;
  const vid = def.vid;
  if (vid === undefined || vid < MOD_ITEM_STABLE_BASE) return true;
  const fn = itemCanUse.get(vid);
  if (!fn) return true;
  try {
    return fn({ game, player: game.player, item, def, tileX: 0, tileY: 0,
      mouseX: game.input.mouseX, mouseY: game.input.mouseY,
      altFunctionUse: (game.player as unknown as { altFunctionUse?: number }).altFunctionUse ?? 0 });
  } catch { return true; }
}

/** ★三百三十五刀:mod 配饰效果钩(C# ModItem.UpdateAccessory 同位;Player
 *  配饰槽 3..9 每帧环内派发——装备期每 tick 调,卸下自然停调) */
/** 配饰效果累加器（computeEquipStats return 合并;闭包直改） */
export interface ModAccAccumulator { def?: number; mana?: number; life?: number; moveMult?: number; fish?: number; wingTime?: number }
const accEffects = new Map<number, (player: Player, game: unknown, acc: ModAccAccumulator) => void>();

export function registerModAccEffect(vid: number, fn: (player: Player, game: unknown, acc: ModAccAccumulator) => void): void {
  if (accEffects.has(vid)) throw new Error(`[mod-hooks] accEffect 重复注册: ${vid}`);
  accEffects.set(vid, fn);
}

export function runModAccEffect(vid: number, player: Player, game: unknown, acc: ModAccAccumulator): boolean {
  if (accEffects.size === 0 || vid < MOD_ITEM_STABLE_BASE) return false;
  const fn = accEffects.get(vid);
  if (!fn) return false;
  fn(player, game, acc);
  return true;
}

/** ★三百三十九刀:mod 手持效果钩(C# HoldItem 同位;手持该物品每 tick 调) */
const holdItems = new Map<number, (player: Player, game: unknown) => void>();

export function registerModHoldItem(vid: number, fn: (player: Player, game: unknown) => void): void {
  if (holdItems.has(vid)) throw new Error(`[mod-hooks] holdItem 重复注册: ${vid}`);
  holdItems.set(vid, fn);
}

export function runModHoldItem(vid: number, player: Player, game: unknown): void {
  if (holdItems.size === 0 || vid < MOD_ITEM_STABLE_BASE) return;
  holdItems.get(vid)?.(player, game);
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
  /** ★B7 一百零五刀:追踪加速度(向最近敌怪 accel/拍,800px 门,钳速;缺省无) */
  homing?: number;
  /** ★三百三十刀:追踪距离门(px;helper HomeInOnNPC distanceRequired 映射;缺省 800) */
  homingDist?: number;
  /** ★B7 一百零六刀:推进加速(沿初速向 accel/拍,钳 maxSpeed) */
  accelerate?: number;
  /** 回旋镖:飞行 maxTicks 后返程(向 owner 加速),拾取消亡 */
  boomerang?: { returnTicks: number; accel: number };
  /** 环绕:绕出生点半径 r 角速 w(t) 旋转 */
  orbit?: { radius: number; omega: number };
  /** ★三百五十一刀:holdout(Calamity Holdout 弹范式:跟随玩家/channel 左键门/
   *  魔耗节拍;RancorHoldout 同构) */
  holdout?: {
    manaRate?: number; manaCost?: number;
    /** ★三百五十六刀:节拍射击面(每 every tick 自动发射;vel 缺省 8;
     *  atMouse=true=目标弹在鼠标处生成)——节拍射击族 holdout 免写钩 */
    shoot?: { proj: string; every: number; vel?: number; atMouse?: boolean };
  };
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

export function registerModProj(projId: number, modId: string, spec: ModProjSpec, fullKey?: string): void {
  if (!(projId >= MOD_PROJ_ID_BASE)) throw new Error(`[mod-hooks] projId 须 ≥${MOD_PROJ_ID_BASE}: ${projId}`);
  if (projSpecs.has(projId)) throw new Error(`[mod-hooks] projectile 重复注册: ${projId}`);
  if (!spec.texture) throw new Error(`[mod-hooks] projectile 缺 texture: ${projId}`);
  projSpecs.set(projId, spec);
  projRegs.push({ projId, modId, spec });
  if (fullKey) projKeyIndex.set(fullKey, projId);   // ★三百五十六:键索引(holdout 节拍弹解析)
}

/** ★三百五十六:mod 弹全键→projId(引擎侧节拍弹生成;未注册 -1) */
export function modProjIdOfKey(fullKey: string): number {
  return projKeyIndex.get(fullKey) ?? -1;
}
const projKeyIndex = new Map<string, number>();

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

/** B6:mod 音频注册表(key→ArrayBuffer)——main.ts 在 game 创建后注入 Sfx.buffers */
const modWavData = new Map<string, ArrayBuffer>();
export function registerModWavData(key: string, data: ArrayBuffer): void { modWavData.set(key, data); }
export function getModWavData(): ReadonlyMap<string, ArrayBuffer> { return modWavData; }

/** B6:NPC 死亡钩注册表(Hive Tumor→Boss 遭遇链面) */
const onNpcDeath = new Map<number, (e: Enemy, game: Game) => void>();

/** CalPlayer 基建(六十三刀):玩家承伤修正链(仅 mod NPC 进攻面;ModifyHitByNPC 形)。
 *  fn(ctx) → number=修正后伤(可 0=吞)/undefined=不改。空表零成本。 */
const modifyHurtByNpc = new Map<string, (ctx: {
  player: unknown; game: Game; attackerVid: number; dmg: number;
  contact: boolean;
}) => number | void>();

export function registerModModifyHurtByNpc(modId: string, fn: (ctx: {
  player: unknown; game: Game; attackerVid: number; dmg: number; contact: boolean;
}) => number | void): void {
  if (modifyHurtByNpc.has(modId)) throw new Error(`[mod-hooks] modifyHurtByNpc 重复注册: ${modId}`);
  modifyHurtByNpc.set(modId, fn);
}

export function runModModifyHurtByNpc(
  player: unknown, game: Game, attackerVid: number, dmg: number, contact: boolean,
): number {
  if (attackerVid < MOD_NPC_ID_BASE || modifyHurtByNpc.size === 0) return dmg;
  let cur = dmg;
  for (const fn of modifyHurtByNpc.values()) {
    const r = fn({ player, game, attackerVid, dmg: cur, contact });
    if (typeof r === 'number' && Number.isFinite(r)) cur = Math.max(0, Math.round(r));
  }
  return cur;
}

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

/** CalPlayer 基建(六十四刀):mod NPC 接触命中玩家 → 施加声明面 debuff
 *  (OnHitPlayer AddBuff 形;buff=注册期已解析的 9000+ 域 id;chance 掷)。 */
const npcOnHitPlayerBuff = new Map<number, { buffId: number; duration: number; chance?: number }>();

export function registerModNpcOnHitPlayerBuff(
  npcId: number, spec: { buffId: number; duration: number; chance?: number },
): void {
  if (npcId < MOD_NPC_ID_BASE) throw new Error(`[mod-hooks] onHitPlayer npcId 须 ≥${MOD_NPC_ID_BASE}: ${npcId}`);
  if (npcOnHitPlayerBuff.has(npcId)) throw new Error(`[mod-hooks] onHitPlayer 重复注册: ${npcId}`);
  npcOnHitPlayerBuff.set(npcId, spec);
}

export function runModOnHitPlayerBuff(
  vanillaId: number | null | undefined, player: { buffs: { apply(id: number, seconds: number): void } }, game: unknown,
): void {
  if (vanillaId === null || vanillaId === undefined || vanillaId < MOD_NPC_ID_BASE || npcOnHitPlayerBuff.size === 0) return;
  const spec = npcOnHitPlayerBuff.get(vanillaId);
  if (!spec) return;
  if (spec.chance !== undefined && Math.random() >= spec.chance) return;
  player.buffs.apply(spec.buffId, spec.duration);
}

/** 近战命中结算缝(受理命中后):mod 物品带 onHit 钩时调用;空表零成本。 */
/** CalPlayer 基建(一百零四刀):玩家命中敌怪伤害修正链(ModifyHitNPC 形;资源增幅消费)。
 *  fn(ctx) → number=倍率(1=不变);多钩连乘。空表=1。 */
const modifyHitNpc = new Map<string, (ctx: {
  player: unknown; game: Game; vid: number; dmg: number;
}) => number | void>();

export function registerModModifyHitNpc(modId: string, fn: (ctx: {
  player: unknown; game: Game; vid: number; dmg: number;
}) => number | void): void {
  if (modifyHitNpc.has(modId)) throw new Error(`[mod-hooks] modifyHitNpc 重复注册: ${modId}`);
  modifyHitNpc.set(modId, fn);
}

export function runModModifyHitNpc(player: unknown, game: Game, vid: number, dmg: number): number {
  if (modifyHitNpc.size === 0) return dmg;
  let mult = 1;
  for (const fn of modifyHitNpc.values()) {
    const r = fn({ player, game, vid, dmg });
    if (typeof r === 'number' && Number.isFinite(r)) mult *= r;
  }
  return dmg * mult;
}

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
    altFunctionUse: (game.player as unknown as { altFunctionUse?: number }).altFunctionUse ?? 0,
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

/** ★一百一十六刀:mod 功能箱解锁条件链(chest.locked 消费;fn(world)=true 可开;
 *  未注册条件=自由开(零条件箱);fail-fast 不包 try=mod 可信代码纪律) */
const modChestUnlock = new Map<number, (world: unknown) => boolean>();

export function registerModChestUnlock(tileId: number, fn: (world: unknown) => boolean): void {
  if (!(tileId >= 0)) throw new Error(`[mod-hooks] chestUnlock tileId 非法: ${tileId}`);
  if (modChestUnlock.has(tileId)) throw new Error(`[mod-hooks] chestUnlock 重复注册: ${tileId}`);
  modChestUnlock.set(tileId, fn);
}

export function runModChestUnlock(tileId: number, world: unknown): boolean {
  if (modChestUnlock.size === 0) return true;
  const fn = modChestUnlock.get(tileId);
  return fn ? !!fn(world) : true;
}

/** ★一百一十七刀:mod 群系蔓延 face(tML ModBiomeConversion+RegisterSimpleConversion 形;
 *  WorldEvolution 蔓延扫描消费——spreads=源 tile 内部 id 集,tileMap=vanilla sheet→
 *  mod tile 内部 id 转换表) */
export interface ModBiomeConversion {
  spreads: ReadonlySet<number>;
  tileMap: Readonly<Record<number, number>>;
}
const modConversions: ModBiomeConversion[] = [];
export function registerModConversion(c: ModBiomeConversion): void {
  modConversions.push(c);
}
export function modConversionsSnapshot(): readonly ModBiomeConversion[] { return modConversions; }

/** ★一百三十六刀:NPC 出生 stats 修正钩(RevDeathStatChanges 面;spawnNpcByVanilla
 *  消费;fn(vanillaId, stats) 可改 lifeMaxScale=HP 乘) */
const npcSpawnStats = new Map<string, (vanillaId: number, stats: { lifeMaxScale: number }) => void>();

export function registerModNpcSpawnStats(modId: string, fn: (vanillaId: number, stats: { lifeMaxScale: number }) => void): void {
  if (npcSpawnStats.has(modId)) throw new Error(`[mod-hooks] npcSpawnStats 重复注册: ${modId}`);
  npcSpawnStats.set(modId, fn);
}

export function runModModifyNpcSpawnStats(vanillaId: number, stats: { lifeMaxScale: number }): void {
  if (npcSpawnStats.size === 0) return;
  for (const fn of npcSpawnStats.values()) fn(vanillaId, stats);
}

/** ★二百七十八刀:rev/death HP 乘表统一消费点(R4 定谳「npcSpawnStats 死表」:
 *  钩原只接 spawnNpcByVanilla,summonBossAtTx(物品召唤)/spawnBossOnPlayer(花苞等
 *  自然 Boss 召唤)/VanillaSpawner(自然刷怪)全绕行=复仇模式 Boss 血量恒原版)。
 *  C# 语义=SetDefaults 期对所有生成路径生效;本仓读档/联机傀儡不重过 NewNPC
 *  故不接(同 VanillaSpawner「持久实体不重掷」口径)。 */
export function applyModSpawnStats(vanillaId: number, e: { hp?: number; maxHp?: number }): void {
  if (npcSpawnStats.size === 0) return;
  const st = { lifeMaxScale: 1 };
  runModModifyNpcSpawnStats(vanillaId, st);
  if (st.lifeMaxScale !== 1 && e.maxHp) {
    e.maxHp = Math.max(1, Math.round(e.maxHp * st.lifeMaxScale));
    e.hp = Math.min(e.hp ?? e.maxHp, e.maxHp);
  }
}

/** ★二百八十七刀:mod 刷怪池独占面(C# EditSpawnPool pool.Clear 同构;酸雨事件
 *  消费:事件期硫海池整体顶替原版池)——hook 返回规则表=本拍 vanilla 选怪被
 *  顶替,只掷返回的规则;返回 null=不接管。 */
const modSpawnPools = new Map<string, (ctx: { game: Game; player: Player | null }) => ModSpawnRule[] | null>();

export function registerModSpawnPool(modId: string, fn: (ctx: { game: Game; player: Player | null }) => ModSpawnRule[] | null): void {
  if (modSpawnPools.has(modId)) throw new Error(`[mod-hooks] spawnPool 重复注册: ${modId}`);
  modSpawnPools.set(modId, fn);
}

/** 首个接管池(无 hook=零成本;hook 全 null=原路) */
export function takeModSpawnPool(ctx: { game: Game; player: Player | null }): ModSpawnRule[] | null {
  if (modSpawnPools.size === 0) return null;
  for (const fn of modSpawnPools.values()) {
    const r = fn(ctx);
    if (r) return r;
  }
  return null;
}

/** ★一百三十九刀:vanilla 敌怪 AI 覆盖钩(RevengeanceAndDeathAI 面;按 vanillaId
 *  接管整支 AI,共享尾段照走;与 takeModNpcAi 同位派发=先 vanilla 覆盖) */
const vanillaNpcAi = new Map<number, (e: Enemy, game: Game, player: Player | null) => void>();

export function registerVanillaNpcAi(vanillaId: number, fn: (e: Enemy, game: Game, player: Player | null) => void): void {
  if (!(vanillaId >= 0 && vanillaId < MOD_NPC_ID_BASE)) throw new Error(`[mod-hooks] vanillaNpcAi 仅原版 id 域: ${vanillaId}`);
  if (vanillaNpcAi.has(vanillaId)) throw new Error(`[mod-hooks] vanillaNpcAi 重复注册: ${vanillaId}`);
  vanillaNpcAi.set(vanillaId, fn);
}

export function takeVanillaNpcAiOverride(vanillaId: number): ((e: Enemy, game: Game, player: Player | null) => void) | null {
  if (vanillaNpcAi.size === 0 || vanillaId < 0 || vanillaId >= MOD_NPC_ID_BASE) return null;
  return vanillaNpcAi.get(vanillaId) ?? null;
}

/** ★三百二十一刀:BGM 群系曲选曲面(CalamityMod.UpdateMusic override 同构,2019
 *  CalamityMod.cs:1749-1843)——mod 群系旗活跃期覆写环境曲。priority 三档:
 *  bossMedium=无条件覆写(Cultist/DoG 倒计时支,2019 同);biomeHigh/environment=
 *  仅 !areThereAnyDamnBosses 时覆写(2019 群系曲门原文)。多注册后命中者按注册序
 *  后者胜(2019 顺序覆写语义同构)。 */
export interface ModBiomeMusicSpec {
  flag: string;
  musicId: number;
  priority: 'environment' | 'biomeHigh' | 'bossMedium';
}
const modBiomeMusicList: ModBiomeMusicSpec[] = [];

export function registerModBiomeMusic(modId: string, spec: ModBiomeMusicSpec): void {
  if (modBiomeMusicList.some((m) => m.flag === spec.flag)) {
    throw new Error(`[mod-hooks] biomeMusic 重复注册旗: ${spec.flag} (mod ${modId})`);
  }
  modBiomeMusicList.push(spec);
}

export function takeModBiomeMusic(): readonly ModBiomeMusicSpec[] {
  return modBiomeMusicList.length > 0 ? modBiomeMusicList : [];
}

/** ★三百二十二刀:BGM AI 期直写槽(2019 SCal 等逐相换曲=AI 内裸写 Main.music
 *  静态导入字段;JS 面=AI 期每帧覆写请求,选曲链本帧消费后清零——压一切含
 *  boss 曲/群系曲;不写=vanilla 接管) */
let modFrameMusic = 0;
export function requestModFrameMusic(id: number): void { modFrameMusic = id; }
export function takeModFrameMusic(): number { const v = modFrameMusic; modFrameMusic = 0; return v; }

/** 测试重置(模块态隔离;loader 单测同款纪律;WeakMap 存储随分代回收) */
/** ★三百十五:菜单主题面(C# MainMenu 类同构;Calamity 主菜单消费)——logo/
 *  background=SW 资源 URL(sprites/mods/...);music=mod 曲目全键(sw.music 注册,
 *  标题屏覆盖原版标题曲);TitleMenu/MenuBackground/Audio 消费 */
export interface ModMenuThemeSpec { logo?: string; background?: string; cinderTex?: string; music?: string }
let menuThemeSpec: ModMenuThemeSpec | null = null;
export function registerMenuTheme(modId: string, spec: ModMenuThemeSpec): void {
  void modId;
  menuThemeSpec = { ...spec };   // 单实例面(多 mod 后注册覆盖;菜单主题天然唯一)
  if (menuThemeSpec.music) setMenuMusicKey(menuThemeSpec.music);
  else setMenuMusicKey(null);
}
export function menuThemeSnapshot(): ModMenuThemeSpec | null {
  return menuThemeSpec;
}

export function _resetModHooksForTests(): void {
  menuThemeSpec = null;
  itemCanUse.clear();
  accEffects.clear();
  holdItems.clear();
  _resetModMusicForTests();
  modBiomeMusicList.length = 0;
  modFrameMusic = 0;
  npcAi.clear(); itemUse.clear(); systems.length = 0; onNpcDeath.clear();
  projSpecs.clear(); projRegs.length = 0; modBuffTicks.clear();
  modBuffNpcTicks.clear();
  onHitNpc.clear();
  modifyHurtByNpc.clear();
  npcOnHitPlayerBuff.clear();
  modifyHitNpc.clear();
  modGenPasses.length = 0;
  modChestUnlock.clear();
  modConversions.length = 0;
  npcSpawnStats.clear();
  vanillaNpcAi.clear();
}
