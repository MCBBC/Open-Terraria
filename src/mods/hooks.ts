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
  if (itemCanUse.size === 0 && modCanUseRules.size === 0) return true;
  if (!def || !item) return true;
  const vid = def.vid;
  if (vid === undefined || vid < MOD_ITEM_STABLE_BASE) return true;
  // ★刀5-A 族:声明规则解释器先于代码钩(数据面优先;ownedProjBelow=在场弹补位门)
  const rule = modCanUseRules.get(vid);
  if (rule?.ownedProjBelow) {
    const g = (globalThis as unknown as { __swGame?: { entities?: { projectiles?: Array<{ projId?: number; dead?: boolean }> } } }).__swGame;
    const list = g?.entities?.projectiles;
    if (!list) return true;
    let n = 0;
    for (const q of list) if (!q.dead && q.projId === rule.ownedProjBelow.proj) n++;
    return n < rule.ownedProjBelow.lt;
  }
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
export interface ModAccAccumulator {
  def: number; mana: number; life: number; moveMult: number; fish: number; wingTime: number;
  /** ★四百八十四刀:系别伤害/暴击/减伤加算面(aggro 环同链:C# GetDamage<系>/
   *  GetCritChance<系>/endurance;聚合显式合并) */
  dmgMelee?: number; dmgRanged?: number; dmgMagic?: number; dmgAll?: number;
  critMelee?: number; critRanged?: number; critMagic?: number; critAll?: number;
  endurance?: number; dmgMinion?: number;
  /** ★五百八十七:挖矿速度折扣加算池(Mining 套 pickSpeedOff 同池;C# pickSpeed-=0.1) */
  pickSpeedOff?: number;
  /** ★595:随从上限加算(statis_blessing +2/voltaic_jelly +1/starbuster_core +1;
   *  C# maxMinions++ UpdateAccessory;cache-period 静态面) */
  minionSlots?: number;
  /** ★四百七十二刀:冲刺授予档(原版 dashType 1=忍者/盾冲族;聚合取 max) */
  dash?: number;
  /** ★四百七十二刀:vanilla-accfx 键形旗包(dashType/blackBelt/noFallDmg/accFlipper/
   *  spikedBoots/waterWalk/jumpBoost/fireWalk/autoJump/noKnockback;聚合显式合并) */
  van?: Record<string, number | boolean>;
}
const accEffects = new Map<number, (player: Player, game: unknown, acc: ModAccAccumulator) => void>();

export function registerModAccEffect(vid: number, fn: (player: Player, game: unknown, acc: ModAccAccumulator) => void): void {
  if (accEffects.has(vid)) throw new Error(`[mod-hooks] accEffect 重复注册: ${vid}`);
  accEffects.set(vid, fn);
}

/** ★四百八十六刀:accEffect 追加链(同 vid 多闭包——数据族批(hand 先/后)与
 *  专属闭包的结构性并置;C# 单 UpdateAccessory 的本仓拆分面)。追加闭包在
 *  主闭包后依注册序执行,累加器共享(加算语义天然可链)。 */
const accEffectExtras = new Map<number, Array<(player: Player, game: unknown, acc: ModAccAccumulator) => void>>();

export function appendModAccEffect(vid: number, fn: (player: Player, game: unknown, acc: ModAccAccumulator) => void): void {
  const list = accEffectExtras.get(vid);
  if (list) list.push(fn);
  else accEffectExtras.set(vid, [fn]);
}

export function runModAccEffect(vid: number, player: Player, game: unknown, acc: ModAccAccumulator): boolean {
  const extras = accEffectExtras.get(vid);
  if (accEffects.size === 0 && !extras) return false;
  if (vid < MOD_ITEM_STABLE_BASE) return false;
  const fn = accEffects.get(vid);
  if (fn) fn(player, game, acc);
  if (extras) for (const x of extras) x(player, game, acc);
  return !!(fn || extras);
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
    /** ★五百七十一/五百八十二:channel 结束钩(松开左键/死亡/魔耗失败时在 kill 前
     *  调用;返回 true=释放存续——Condemnation 转储/M1Garand 再装填弹体存续面,
     *  update 钩自管后续与 kill;void/false=照旧消亡) */
    onChannelEnd?: (p: any, game: any) => boolean | void;
  };
  /** 寿命 tick(缺省 3600) */
  lifetime?: number;
  /** 穿透次数(缺省 1;≤0=无限穿透) */
  pierce?: number;
  /** ★五百八十五:竖排帧数(贴图高=frames×单帧高;绘制按 (ageTicks/6)%frames 切行) */
  frames?: number;
  /** ★619-R3F13:帧节奏(tick/帧;缺省 6=C# 常见档;3/5/8 档族可声明) */
  frameRate?: number;
  /** ★五百八十五:同敌重击窗(tick;常驻召唤体可再命中;缺省 0=永久去重) */
  hitRefresh?: number;
  /** ★618-R2F9:接触伤害豁免(C# CanDamage()=false 同位——healer/defense 守卫;
   *  true=本弹不结算接触伤) */
  noContactDamage?: boolean;
  /** 撞块消亡(缺省 true) */
  tileCollide?: boolean;
  /** 贴图 textures/ 相对路径(经 mod 资产注入,Projectile_<projId> 语义) */
  texture: string;
  /** 弹盒宽高 px(缺省 16×16) */
  width?: number;
  height?: number;
  /** 绘制旋转=速度向(箭类;缺省 false) */
  rotateToVelocity?: boolean;
  /** ★刀2-C1:A=0 纯加性(XNA 预乘恒等式='lighter'+ga=1;拖尾/光晕族) */
  additive?: boolean;
  /** ★刀2-C1:全亮(projFullbrightQueue 乘光后重绘) */
  fullbright?: boolean;
  /** ★刀2-C1:画在玩家之后(drawLayer 4/7/8 族) */
  overPlayers?: boolean;
  /** ★刀2-C2:自绘全权(tML ModProjectile.Draw 形;缺省绘制被替换) */
  draw?: (p: unknown, ctx: ModDrawCtx) => void;
  /** ★刀2-C2:绘制前钩(false=跳默认绘制段,mod 全权——含 additive/fullbright 面) */
  preDraw?: (p: unknown, ctx: ModDrawCtx) => boolean | void;
  /** ★刀2-C2:绘制后钩(默认/自绘段后;层序=本体同位) */
  postDraw?: (p: unknown, ctx: ModDrawCtx) => void;
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
  /** ★刀2-C2:自绘三钩(PreDraw false=跳默认段/Draw 全权/PostDraw 后随) */
  preDraw?: ModProjSpec['preDraw'];
  draw?: ModProjSpec['draw'];
  postDraw?: ModProjSpec['postDraw'];
  /** ★五百八十二:channel 结束钩(仅 holdout 弹;返回 true=释放存续——C#
   *  Condemnation 转储/M1Garand 装填弹体存续面;非 holdout 弹 fail-fast) */
  onChannelEnd?: (p: any, game: any) => boolean | void;
}): void {
  const spec = projSpecs.get(projId);
  if (!spec) throw new Error(`[mod-hooks] projectileHook 引用未注册弹: ${projId}`);
  if (hooks.update) spec.update = hooks.update;
  if (hooks.onHit) spec.onHit = hooks.onHit;
  if (hooks.preDraw) spec.preDraw = hooks.preDraw;
  if (hooks.draw) spec.draw = hooks.draw;
  if (hooks.postDraw) spec.postDraw = hooks.postDraw;
  if (hooks.onHitPlayer) spec.onHitPlayer = hooks.onHitPlayer;
  if (hooks.onTileHit) spec.onTileHit = hooks.onTileHit;
  if (hooks.onChannelEnd) {
    if (!spec.holdout) throw new Error(`[mod-hooks] onChannelEnd 仅 holdout 弹可挂: ${projId}`);
    spec.holdout.onChannelEnd = hooks.onChannelEnd;
  }
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

/** ★619:mod debuff 读取面(abaddon 散播拷贝——源敌 mod debuff 逐条转嫁;
 *  返回副本 Map,写侧仍走 applyModNpcBuff) */
export function readModNpcBuffs(enemy: object): Map<number, number> {
  return new Map(npcBuffStore.get(enemy) ?? []);
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

/** ★四百七十刀:OnHit 域通用命中钩(C# CalamityPlayerOnHit.cs ItemOnHit/ProjOnHit
 *  形;per-mod 单链,Enemy.hurt 受理面尾段派发——fromPlayer 门,存活/击杀双支)。
 *  任何玩家来源伤害(近战扫/弹幕/爆炸/mod 弹)进链;免疫帧拒收/dontTakeDamage/
 *  零伤转换支不进(原版 OnHitNPC 同相=只吃受理伤害)。game=GameHooks 宽接口
 *  (Enemy.hurt 调用域同款,mod 侧按 unknown 消费)。 */
type ModOnHitAnyCtx = { e: Enemy; game: unknown;
  damage: number; crit: boolean; killed: boolean; projId: number; melee: boolean };
type ModOnHitAnyFn = (ctx: ModOnHitAnyCtx) => void;
/** ★五百九十一:per-mod 追加链(多闭包;域模块各自挂链——acc-extra/effects 双域
 *  同用;旧单闭包 fail-fast 形与域拆分冲突) */
const onHitAny = new Map<string, ModOnHitAnyFn[]>();

export function registerModOnHitAny(modId: string, fn: ModOnHitAnyFn): void {
  const list = onHitAny.get(modId);
  if (list) list.push(fn);
  else onHitAny.set(modId, [fn]);
}

/** Enemy.hurt 受理面尾段派发(killed=crit 双支 return 前;零注册=零成本)。 */
export function runModOnHitAny(e: Enemy, game: unknown, ctx: {
  damage: number; crit: boolean; killed: boolean; projId: number; melee: boolean;
}): void {
  if (onHitAny.size === 0) return;
  for (const list of onHitAny.values()) {
    for (const fn of list) {
      try { fn({ e, game, ...ctx }); } catch (err) { console.warn('[mod-hooks] onHitAny', err); }
    }
  }
}

/** ★四百八十八刀:mod 承伤面 thorns 链(C# CalamityPlayerHitHurt crawCarapace/
 *  baroclaw=玩家接触受击反伤+推离+debuff;damagePlayer 荆棘面尾派发——
 *  contactOnly+非 pvp+flag3 免疫门同 thorns 面;零注册零成本)。 */
type ModPlayerThornsFn = (ctx: { p: unknown; game: unknown; e: Enemy; dmg: number }) => void;
const playerThorns = new Map<string, ModPlayerThornsFn>();

export function registerModPlayerThorns(modId: string, fn: ModPlayerThornsFn): void {
  if (playerThorns.has(modId)) throw new Error(`[mod-hooks] playerThorns 重复注册: ${modId}`);
  playerThorns.set(modId, fn);
}

export function runModPlayerThorns(p: unknown, game: unknown, e: Enemy, dmg: number): void {
  if (playerThorns.size === 0) return;
  for (const fn of playerThorns.values()) {
    try { fn({ p, game, e, dmg }); } catch (err) { console.warn('[mod-hooks] playerThorns', err); }
  }
}

/** ★609:mod 键位(id=mod:<modId>:<name>;Keybinds mod 注册表) */
export function registerModKeybindFace(id: string, defaultKeys: readonly string[]): void {
  // 动态 import 防环(Keybinds 不依赖 hooks)——单键位量级,微任务内生效可接受
  void import('../core/Keybinds').then(({ registerModKeybind }) => registerModKeybind(id, defaultKeys));
}

/** ★609:mod 键位按下查询(bindsOfMod 转发;keys=Input.keys 实时集) */
let bindsOfModFn: ((id: string) => readonly string[]) | null = null;
export function modKeybindDown(id: string, keys: ReadonlySet<string>): boolean {
  if (!bindsOfModFn) return false;
  for (const code of bindsOfModFn(id)) if (keys.has(code)) return true;
  return false;
}
void import('../core/Keybinds').then((m) => { bindsOfModFn = m.bindsOfMod; });

/** ★609:mod parry 窗口门(C# divineProvidence/flameLickedShell 30t 窗——
 *  mod 自管窗态;Game 接触 parry 门=shieldParry ‖ 本门;任一 true=可 parry) */
const modParryGates = new Map<string, Array<(player: unknown) => boolean>>();

export function registerModParryGate(modId: string, fn: (player: unknown) => boolean): void {
  const list = modParryGates.get(modId);
  if (list) list.push(fn);
  else modParryGates.set(modId, [fn]);
}

/** ★611:parry 成功钩(canParryMod 受理后派发——反冲弹/音效/屏幕震动族;
 *  mod 自管一次性效果) */
const modParrySuccess = new Map<string, Array<(player: unknown, game: unknown) => void>>();

export function registerModParrySuccess(modId: string, fn: (player: unknown, game: unknown) => void): void {
  const list = modParrySuccess.get(modId);
  if (list) list.push(fn);
  else modParrySuccess.set(modId, [fn]);
}

export function runModParrySuccess(player: unknown, game: unknown): void {
  if (modParrySuccess.size === 0) return;
  for (const list of modParrySuccess.values()) {
    for (const fn of list) {
      try { fn(player, game); } catch (err) { console.warn('[mod-hooks] parrySuccess', err); }
    }
  }
}

export function runModParryActive(player: unknown): boolean {
  if (modParryGates.size === 0) return false;
  for (const list of modParryGates.values()) {
    for (const fn of list) {
      try { if (fn(player)) return true; } catch (err) { console.warn('[mod-hooks] parryGate', err); }
    }
  }
  return false;
}

/** ★606:mod dash 类(C# PlayerDashEffect 同位——Calamity 自定义冲刺;
 *  slot=dashType 数 ≥7(6=坐骑段);speed=初速;decelMult=滑行阻尼覆写;
 *  shieldSlam=接触伤害(dash2 同款 eoc 扫敌);midDash=滑行期逐帧钩)
 *  装备侧经 acc.dash=max 链入(聚合链既有语义) */
export interface ModDashSpec {
  speed: number;
  decelMult?: number;
  shieldSlam?: boolean;
  midDash?: (p: unknown, game: unknown) => void;
}
const modDashTypes = new Map<number, ModDashSpec>();

export function registerModDashType(slot: number, spec: ModDashSpec): void {
  if (slot < 7) throw new Error(`[mod-hooks] dash slot 须 ≥7(1-3 原版/5 水晶/6 坐骑): ${slot}`);
  modDashTypes.set(slot, spec);
}

export function modDashSpecOf(slot: number): ModDashSpec | null {
  return modDashTypes.get(slot) ?? null;
}

/** ★605:mod 伤害闸(C# 能量盾类同位——HasAnyEnergyShield damagePlayer 头吸伤;
 *  fn(player, dmg)→剩余伤(可 0);Player.damage 头派发[防御计算前];
 *  多 mod 连减;零注册零成本) */
const damageGates = new Map<string, Array<(player: unknown, dmg: number) => number>>();

export function registerModDamageGate(modId: string, fn: (player: unknown, dmg: number) => number): void {
  const list = damageGates.get(modId);
  if (list) list.push(fn);
  else damageGates.set(modId, [fn]);
}

export function runModDamageGate(player: unknown, dmg: number): number {
  if (damageGates.size === 0) return dmg;
  for (const list of damageGates.values()) {
    for (const fn of list) {
      try {
        const r = fn(player, dmg);
        if (typeof r === 'number' && Number.isFinite(r) && r >= 0) dmg = r;
      } catch (err) { console.warn('[mod-hooks] damageGate', err); }
    }
  }
  return dmg;
}

/** ★594:mod 受击钩(C# OnHurt face 同位——Player.damage 伤害落地后派发;
 *  ctx={player, game, dmg=实扣};rBrain 墨云/墨炸弹/百年魔典等受击响应面;
 *  多 mod 逐个派发,零注册零成本) */
const playerHurts = new Map<string, Array<(ctx: { player: unknown; game: unknown; dmg: number }) => void>>();

export function registerModPlayerHurt(modId: string, fn: (ctx: { player: unknown; game: unknown; dmg: number }) => void): void {
  const list = playerHurts.get(modId);
  if (list) list.push(fn);
  else playerHurts.set(modId, [fn]);
}

export function runModPlayerHurt(player: unknown, game: unknown, dmg: number): void {
  if (playerHurts.size === 0) return;
  for (const list of playerHurts.values()) {
    for (const fn of list) {
      try { fn({ player, game, dmg }); } catch (err) { console.warn('[mod-hooks] playerHurt', err); }
    }
  }
}

/** ★593:mod 闪避掷门(灾厄 DodgeEffects 消费品闪避族同位——C# CalamityPlayerHitHurt
 *  :824 procDodgeEffects→Consumable Dodge 步;fn(player, game)→true=本拍闪避成立
 *  [效果+冷却 mod 自管];多 mod 任一 true 即闪避。零注册零成本) */
const dodgeRolls = new Map<string, Array<(player: unknown, game: unknown, dmg: number) => boolean>>();

export function registerModDodgeRoll(modId: string, fn: (player: unknown, game: unknown, dmg: number) => boolean): void {
  const list = dodgeRolls.get(modId);
  if (list) list.push(fn);
  else dodgeRolls.set(modId, [fn]);
}

export function runModDodgeRoll(player: unknown, game: unknown, dmg: number): boolean {
  if (dodgeRolls.size === 0) return false;
  for (const list of dodgeRolls.values()) {
    for (const fn of list) {
      try { if (fn(player, game, dmg)) return true; } catch (err) { console.warn('[mod-hooks] dodgeRoll', err); }
    }
  }
  return false;
}

/** ★五百四十八:治疗物使用钩(C# CalamityGlobalItem 治疗物交互面——jelly 光环族/
 *  Bloom Stone=healLife 消费后派发;零注册零成本)。 */
const healItem = new Map<string, (vid: number, heal: number) => void>();

export function registerModHealItem(modId: string, fn: (vid: number, heal: number) => void): void {
  if (healItem.has(modId)) throw new Error(`[mod-hooks] healItem 重复注册: ${modId}`);
  healItem.set(modId, fn);
}

export function runModHealItem(vid: number, heal: number): void {
  if (healItem.size === 0) return;
  for (const fn of healItem.values()) {
    try { fn(vid, heal); } catch (err) { console.warn('[mod-hooks] healItem', err); }
  }
}

/** ★四百八十三刀:mod tile 右键面(C# ModTile.RightClick 同位——AstralBeacon
 *  星核仪式/SCalAltar 终末坛等 tile 右键召唤通道;interactAt 尾臂派发,
 *  返回 true=消费 rightDown;零注册零成本)。 */
const tileInteract = new Map<number, (tx: number, ty: number, game: unknown) => boolean>();

export function registerModTileInteract(tileInternal: number, fn: (tx: number, ty: number, game: unknown) => boolean): void {
  if (tileInteract.has(tileInternal)) throw new Error(`[mod-hooks] tileInteract 重复注册: ${tileInternal}`);
  tileInteract.set(tileInternal, fn);
}

export function runModTileInteract(tileInternal: number, tx: number, ty: number, game: unknown): boolean {
  if (tileInteract.size === 0) return false;
  const fn = tileInteract.get(tileInternal);
  if (!fn) return false;
  try { return !!fn(tx, ty, game); } catch (err) { console.warn('[mod-hooks] tileInteract', err); return false; }
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

/** CalPlayer 基建(六十三刀):玩家承伤修正链(ModifyHitByNPC 形)。
 *  ★刀4-A(2026-10-13)扩域:原版攻端亦进链(工坊普查五刀战役;灾厄 CalPlayer.ModifyHitByNPC
 *  语义=全部 NPC 来源受击,ctx.attackerVid ≥800=mod 攻端供分支)。零注册恒等。
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
  // ★刀4-A:域门撤除(原版攻端亦进链;attackerVid 判域移交 mod 侧 ctx 分支)——
  //  空表短路保持首行,零 mod 逐字节恒等不变
  if (modifyHurtByNpc.size === 0) return dmg;
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
  /** ★刀4-A ctx 加宽(近战掷后装配;旧消费者零感知): */
  crit?: boolean; kb?: number; armorPen?: number;
}) => number | void>();

export function registerModModifyHitNpc(modId: string, fn: (ctx: {
  player: unknown; game: Game; vid: number; dmg: number;
  crit?: boolean; kb?: number; armorPen?: number;
}) => number | void): void {
  if (modifyHitNpc.has(modId)) throw new Error(`[mod-hooks] modifyHitNpc 重复注册: ${modId}`);
  modifyHitNpc.set(modId, fn);
}

export function runModModifyHitNpc(player: unknown, game: Game, vid: number, dmg: number,
  extra?: { crit?: boolean; kb?: number; armorPen?: number }): number {
  if (modifyHitNpc.size === 0) return dmg;
  let mult = 1;
  for (const fn of modifyHitNpc.values()) {
    const r = fn({ player, game, vid, dmg, ...extra });
    if (typeof r === 'number' && Number.isFinite(r)) mult *= r;
  }
  return dmg * mult;
}

// ---- ★刀4-A 批(2026-10-13):命中链弹侧两钩(工坊普查五刀战役;锚点详见
//      docs/mod-five-knives-recon-2026-10-13.md 刀4 节) ----

/** 玩家弹幕命中 NPC 伤害修正链(tML ModifyHitNPCWithProj 形;P1457 dealContacts/
 *  WeaponProj hitEnemies(!vanillaGated 受理位)/hitTownNpcs 城镇支(免疫窗外)三受理
 *  位派发;倍率连乘;空表=1)。game=GameHooks 宽接口(弹侧调用域同款,mod 侧按
 *  unknown 消费,onHitAny 判例)。
 *  ★红队 R1-F3 ctx.dmg 域声明(逐站):P1457=DamageVar+damageAdj 后【pre-crit】基伤;
 *  WPROJ=DamageVar/dmgScale/parry/nano 后【post-crit×2】;城镇=settle 后【pre-crit】
 *  (TownNPC.hurt 防后×2)。纯倍率三站终值可交换;mod 按 crit 分支/加法时须知此差。
 *  ★红队 R1-F4 覆盖边界:独立结算面(StormLightning/Prism/Rainbow/MagnetSphere/
 *  SpectreSoul/TideSlash/Volcano/scarab 等)本批未接=B 批账,见 recon doc。 */
type ModModifyHitNpcByProjFn = (ctx: {
  player: unknown; game: unknown; projVid: number; targetVid: number; dmg: number; crit: boolean;
}) => number | void;
const modifyHitNpcByProj = new Map<string, ModModifyHitNpcByProjFn>();

export function registerModModifyHitNpcByProj(modId: string, fn: ModModifyHitNpcByProjFn): void {
  if (modifyHitNpcByProj.has(modId)) throw new Error(`[mod-hooks] modifyHitNpcByProj 重复注册: ${modId}`);
  modifyHitNpcByProj.set(modId, fn);
}

export function runModModifyHitNpcByProj(
  player: unknown, game: unknown, projVid: number, targetVid: number, dmg: number, crit: boolean,
): number {
  if (modifyHitNpcByProj.size === 0) return dmg;
  let mult = 1;
  for (const fn of modifyHitNpcByProj.values()) {
    const r = fn({ player, game, projVid, targetVid, dmg, crit });
    if (typeof r === 'number' && Number.isFinite(r)) mult *= r;
  }
  return dmg * mult;
}

/** 敌方弹幕命中玩家伤害修正链(tML ModifyHitByProjectile 形;PTGT hitPlayer resistCold
 *  后、hostileDifficulty 缩放前派发——纯倍率与缩放可交换;pvp/trap 透传供分支;
 *  倍率连乘;空表=1。★红队 R1-F6 边界:仅敌弹面;直调 damagePlayer 的弹幕语义伤
 *  (duke 龙卷等)经 opts.projDomain 排除接触链=两链皆不进,直调面覆盖=B 批账)。 */
type ModModifyHitPlayerByProjFn = (ctx: {
  player: unknown; game: unknown; projVid: number; dmg: number; trap: boolean; pvp: boolean;
}) => number | void;
const modifyHitPlayerByProj = new Map<string, ModModifyHitPlayerByProjFn>();

export function registerModModifyHitPlayerByProj(modId: string, fn: ModModifyHitPlayerByProjFn): void {
  if (modifyHitPlayerByProj.has(modId)) throw new Error(`[mod-hooks] modifyHitPlayerByProj 重复注册: ${modId}`);
  modifyHitPlayerByProj.set(modId, fn);
}

export function runModModifyHitPlayerByProj(
  player: unknown, game: unknown, projVid: number, dmg: number, trap: boolean, pvp: boolean,
): number {
  if (modifyHitPlayerByProj.size === 0) return dmg;
  let mult = 1;
  for (const fn of modifyHitPlayerByProj.values()) {
    const r = fn({ player, game, projVid, dmg, trap, pvp });
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

// ---- mod 全屏后处理 pass(2026-10-12;lights-and-shadows 首消费方) ----
//
// 定位 ≙ tML 模组挂钩 FilterManager.EndCapture 的 MonoMod 前缀(反编译
// FilterManager.cs:150-210:ColorOfTheSkies 乘法仅发生在各 Filter Apply 绘制时,
// 无滤镜走 Color.White——故本钩子快照/输入纹理均为【未乘天色】场景,与原版
// mod 所见一致;mod pass 插入滤镜链最前=先于 orig(EndCapture) 同位)。
// 执行机 = GLScreenFilters pipeRunPasses('ModScreenFx' 分支):exec 收链输入
// (恒等布局)与输出槽 fboA(GL 朝向契约),内部子管线自管(自有 FBO/程序)。
// 纪律同全局:①空注册零成本(collect 首行 length 短路,快照不装配);
// ②注册只在 loader 脚本相位;③fail-fast 重复 id;④import type 单向零环。
import type { GLPipeline, PipelineFbo } from '../render/GLPipeline';

/** 每帧游戏状态快照(渲染 7d 组装端装配;只读——mod 不得改写) */
export interface ModScreenFxState {
  /** 原版分段 Main.time(昼 0..54000 自 4:30AM、夜 0..32400 自 7:30PM;Clock.vanillaMainTime) */
  time: number;
  dayTime: boolean;
  /** 地表高度(tile;world.groundLevel) */
  worldSurface: number;
  /** 0=满月 4=新月(world.clock.moonPhase,原版 Main.moonPhase 同域) */
  moonPhase: number;
  /** 天景色 RGB(0-255;Renderer.colorOfTheSkies) */
  colorOfTheSkies: readonly [number, number, number];
  /** 屏幕左上世界 px(Main.screenPosition 同域) */
  screenX: number;
  screenY: number;
  /** 链面尺寸(主画布 px) */
  viewW: number;
  viewH: number;
  /** 玩家中心世界 px */
  playerCx: number;
  playerCy: number;
  /** 1=正常 -1=反转重力 */
  gravDir: number;
  zoneSnow: boolean;
  zoneCrimson: boolean;
  zoneCorrupt: boolean;
  /** Main.bgAlphaFrontLayer[7]/[2] 等价(biomeBg.frontLayer()) */
  bgAlphaFrontSnow: number;
  bgAlphaFrontDesert: number;
  /** Main.snowBG[0]/desertBG[0] 等价(活动样式三元组首元;非对应群系时仍有种子值,
   *  消费方按 zone 旗门控) */
  snowBgStyle: number;
  desertBgStyle: number;
}

/** mod pass 执行契约:输出须写 outFbo(链输出槽,GL 朝向——与滤镜 pass 出口同,
 *  直通 blit/present 据此闭合);inputTex=链输入(恒等布局,v0=图像顶)。
 *  exec 全权管理自身子管线(自有 pipe.program/fbo),返回前 outFbo 须绑定为
 *  当前 FRAMEBUFFER。GL 丢失自判(gl.isContextLost 由执行机兜底)。 */
export type ModScreenFxExec = (
  gl: WebGL2RenderingContext, pipe: GLPipeline,
  inputTex: WebGLTexture, outFbo: PipelineFbo, w: number, h: number,
  state: ModScreenFxState,
) => void;

export interface ModScreenFxPass { id: string; exec: ModScreenFxExec }

const modScreenFx: ModScreenFxPass[] = [];

export function registerModScreenFx(p: ModScreenFxPass): void {
  if (modScreenFx.some((x) => x.id === p.id)) throw new Error(`[mod-hooks] screenFx 重复注册: ${p.id}`);
  modScreenFx.push(p);
}

/** 渲染端组装口:空注册零成本短路(不装配快照);非空调用时返回已绑状态的
 *  链 pass 载体(GLScreenFilters 'ModScreenFx' 消费) */
export interface ModScreenFxChainPass {
  kind: 'ModScreenFx';
  exec: (gl: WebGL2RenderingContext, pipe: GLPipeline,
    inputTex: WebGLTexture, outFbo: PipelineFbo, w: number, h: number) => void;
}
export function collectModScreenFx(makeState: () => ModScreenFxState): readonly ModScreenFxChainPass[] {
  if (modScreenFx.length === 0) return [];   // 空注册零成本:快照工厂不调用
  const state = makeState();
  return modScreenFx.map((p) => ({
    kind: 'ModScreenFx' as const,
    exec: (gl, pipe, inputTex, outFbo, w, h) => p.exec(gl, pipe, inputTex, outFbo, w, h, state),
  }));
}

// ---- ★刀2-C2(2026-10-13):实体自绘钩(tML ModNPC.PreDraw/PostDraw 与
//      ModItem.PreDrawInWorld/PostDrawInWorld 形)。ModDrawCtx=受限算子面
//      (draw/drawAdd/tinted 三算子,不裸发 ctx——GL 冲窗风险面隔离;光照=
//      逐格 lightAt+中心预采样;生产=Renderer.buildModDrawCtx)。纪律同族:
//      空注册零成本/装载相位注册/fail-fast。 ----

/** 自绘上下文(受限算子面;Renderer.buildModDrawCtx 产) */
export interface ModDrawCtx {
  /** source-over 块拷贝(rot=绕目标中心/mirror=水平翻/alpha 0-1) */
  draw(img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
    o?: { rot?: number; alpha?: number; mirror?: boolean }): void;
  /** A=0 纯加性('lighter'+ga=1;拖尾/光晕族) */
  drawAdd(img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
    o?: { rot?: number; alpha?: number; mirror?: boolean }): void;
  /** 保形染烘焙(BJ551 tintedTex WeakMap 缓存;rgb 0-255 三元,alpha 保形;
   *  null=node 无 DOM 跳笔) */
  tinted(img: ImageBitmap | HTMLImageElement | HTMLCanvasElement,
    rgb: readonly [number, number, number]): HTMLCanvasElement | null;
  /** 逐格光(0-255 rgb;tile 坐标) */
  lightAt(tx: number, ty: number): readonly [number, number, number];
  /** 实体中心格预采样光 */
  readonly light: readonly [number, number, number];
  /** 世界→屏幕(相机系含 zoom;无 cam 域=恒等回退) */
  worldToScreen(wx: number, wy: number): readonly [number, number];
  /** globalTimeWrappedHourly(BJ330 单源) */
  readonly gtW: number;
  /** 实体中心(世界 px) */
  readonly cx: number;
  readonly cy: number;
}

/** mod NPC 自绘面(键=npcId;preDraw false=跳原版本体段[含叠画]=mod 全权) */
export interface ModNpcDrawSpec {
  preDraw?: (e: unknown, ctx: ModDrawCtx) => boolean | void;
  postDraw?: (e: unknown, ctx: ModDrawCtx) => void;
}
const modNpcDraws = new Map<number, ModNpcDrawSpec>();

export function registerModNpcDraw(npcId: number, spec: ModNpcDrawSpec): void {
  if (!(npcId >= MOD_NPC_ID_BASE)) throw new Error(`[mod-hooks] npcDraw id 须 ≥${MOD_NPC_ID_BASE}: ${npcId}`);
  if (modNpcDraws.has(npcId)) throw new Error(`[mod-hooks] npcDraw 重复注册: ${npcId}`);
  modNpcDraws.set(npcId, spec);
}

export function modNpcDrawSpecOf(npcId: number): ModNpcDrawSpec | null {
  if (modNpcDraws.size === 0 || !(npcId >= MOD_NPC_ID_BASE)) return null;
  return modNpcDraws.get(npcId) ?? null;
}

/** mod 物品世界自绘面(键=stableId;掉落/手持图标绘制位消费) */
export interface ModItemDrawSpec {
  preDrawInWorld?: (d: unknown, ctx: ModDrawCtx) => boolean | void;
  postDrawInWorld?: (d: unknown, ctx: ModDrawCtx) => void;
}
const modItemDraws = new Map<number, ModItemDrawSpec>();

export function registerModItemDraw(vid: number, spec: ModItemDrawSpec): void {
  if (!(vid >= MOD_ITEM_STABLE_BASE)) throw new Error(`[mod-hooks] itemDraw vid 须 ≥${MOD_ITEM_STABLE_BASE}: ${vid}`);
  if (modItemDraws.has(vid)) throw new Error(`[mod-hooks] itemDraw 重复注册: ${vid}`);
  modItemDraws.set(vid, spec);
}

export function modItemDrawSpecOf(vid: number): ModItemDrawSpec | null {
  if (modItemDraws.size === 0 || !(vid >= MOD_ITEM_STABLE_BASE)) return null;
  return modItemDraws.get(vid) ?? null;
}

// ---- ★刀5(2026-10-13):具名修正槽(tML detour 等价物·修正形;K5 方案 A/B 收敛)。
//  机制:①槽名封闭集(VANILLA_OVERRIDE_SLOTS,引擎占位点逐个文档化) ②注册必带
//  anchor(槽语义版本——引擎改站点语义时 bump,旧 mod 装载 fail-loud=弃用回原版)
//  ③per-mod 链(注册序求值,值链=后钩吃前钩产物;非有限返值跳过) ④空槽零成本
//  (size 短路,零分配直通)。K5 方案 B 的「orig 闭包覆写槽」=控制流替换形,现无
//  生产需求不落(recon doc D 台账);sw.tune 纯参数表=每键即引擎槽,按需增键。

/** 引擎覆写槽注册表(封闭集;新增槽=引擎侧占位+本表登记+anchor 置 1) */
export const VANILLA_OVERRIDE_SLOTS = {
  /** 治疗量修正(quickConsume healLife 面;fn(ctx:{value,vid}) → number|void) */
  'Player.ApplyLifeAndOrMana': { anchor: 1, desc: '治疗量修正(healLife 面)' },
  /** 装备回复通道量修正(每秒 HP;fn(ctx:{value,player,game}) → number|void;
   *  自然 9 档公式不在槽内=登记 D 台账) */
  'Player.UpdateLifeRegen': { anchor: 1, desc: '装备回复通道量修正(hpPerSec 面)' },
} as const;
export type VanillaOverrideSlot = keyof typeof VANILLA_OVERRIDE_SLOTS;

const vanillaOverrides = new Map<string, Map<string, (ctx: Record<string, unknown>) => number | void>>();

export function registerVanillaOverride(
  slot: VanillaOverrideSlot, anchor: number, modId: string,
  fn: (ctx: Record<string, unknown>) => number | void,
): void {
  const def = (VANILLA_OVERRIDE_SLOTS as Record<string, { anchor: number; desc: string }>)[slot];
  if (!def) throw new Error(`[mod-hooks] 未知覆写槽: ${String(slot)}`);
  if (def.anchor !== anchor) {
    throw new Error(`[mod-hooks] 覆写槽 ${slot} anchor 不匹配(引擎=${def.anchor} mod=${anchor})——mod 基于旧槽语义构建,拒载(回原版行为=不注册)`);
  }
  let perMod = vanillaOverrides.get(slot);
  if (!perMod) { perMod = new Map(); vanillaOverrides.set(slot, perMod); }
  if (perMod.has(modId)) throw new Error(`[mod-hooks] 覆写槽 ${slot} 重复注册: ${modId}`);
  perMod.set(modId, fn);
}

/** 值链求值(空槽=直通零分配;非有限返值跳过)。ctx.value 可变携带,后钩吃前钩产物。 */
export function runVanillaOverrideValue(
  slot: VanillaOverrideSlot, value: number, ctx?: Record<string, unknown>,
): number {
  const perMod = vanillaOverrides.get(slot);
  if (!perMod || perMod.size === 0) return value;
  const c: { value: number } & Record<string, unknown> = { ...ctx, value };
  for (const fn of perMod.values()) {
    const r = fn(c);
    if (typeof r === 'number' && Number.isFinite(r)) c.value = r;
  }
  return c.value;
}

// ---- ★刀5-A 族:canuse-rules 数据解释器(灾厄 sidecar 同形下沉——
//  「在场弹计数门」声明化,引擎解释,mod 零胶水) ----

export interface ModCanUseRule {
  /** 本弹在场数 < lt 才可用(召唤/炮台类「补位门」;proj=解析后 projId) */
  ownedProjBelow?: { proj: number; lt: number };
}
const modCanUseRules = new Map<number, ModCanUseRule>();

export function registerModCanUseRule(vid: number, rule: ModCanUseRule): void {
  if (!(vid >= MOD_ITEM_STABLE_BASE)) throw new Error(`[mod-hooks] canUseRule vid 须 ≥${MOD_ITEM_STABLE_BASE}: ${vid}`);
  if (modCanUseRules.has(vid)) throw new Error(`[mod-hooks] canUseRule 重复注册: ${vid}`);
  modCanUseRules.set(vid, rule);
}

export function _resetModHooksForTests(): void {
  menuThemeSpec = null;
  modScreenFx.length = 0;
  itemCanUse.clear();
  accEffects.clear();
  accEffectExtras.clear();
  holdItems.clear();
  _resetModMusicForTests();
  modBiomeMusicList.length = 0;
  modFrameMusic = 0;
  npcAi.clear(); itemUse.clear(); systems.length = 0; onNpcDeath.clear();
  projSpecs.clear(); projRegs.length = 0; modBuffTicks.clear();
  modBuffNpcTicks.clear();
  onHitNpc.clear();
  onHitAny.clear();
  dodgeRolls.clear();
  playerHurts.clear();
  damageGates.clear();
  modDashTypes.clear();
  modParryGates.clear();
  modParrySuccess.clear();
  tileInteract.clear();
  playerThorns.clear();
  healItem.clear();
  modifyHurtByNpc.clear();
  npcOnHitPlayerBuff.clear();
  modifyHitNpc.clear();
  modifyHitNpcByProj.clear();
  modifyHitPlayerByProj.clear();
  modNpcDraws.clear();
  modItemDraws.clear();
  vanillaOverrides.clear();
  modCanUseRules.clear();
  modGenPasses.length = 0;
  modChestUnlock.clear();
  modConversions.length = 0;
  npcSpawnStats.clear();
  vanillaNpcAi.clear();
}
