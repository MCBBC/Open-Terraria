// L2 mod 入口 API 门面(2026-10-04 P1/P2/P4)。entry.js 形状(刻意贴 tML 概念,知识可迁移):
//
//   export default function main(sw) {
//     sw.npcAi('demo_slime', (e, game, player) => { /* 接管 AI;不注册=走 aiStyle 家族 */ });
//     sw.itemUse('demo_sword', (ctx) => { ctx.applyBuff('my_buff', 120); return true; });
//     sw.projectileHook('demo_bolt', { update(p, game) {}, onHit(p, enemy, game) {} });
//     sw.buff('my_buff', { name: '神力', texture: 'textures/buff/might.png',
//       onTick(player) { /* 自管效果 */ } });
//     sw.system({ preUpdate(g,dt){}, postEntities(g,dt){}, postUpdate(g){},
//                 onWorldLoad(g){}, onWorldUnload(g){} });
//     sw.config.get('power'); sw.config.set('power', 2);
//     sw.log('ready');
//   }
//  ★弹幕内容走 content/projectiles/*.json 声明面(plan 期确定性分配 projId);
//    sw.projectileHook 只挂代码钩(P4 红蓝修正 C-MINOR-7:头注曾误载不存在的 sw.projectile)
//
// 内容(物品/NPC/tile 数据)一律走 content/*.json 声明面(L1 单管线=确定性 id);
// entry.js 只挂行为/弹幕/配置。键解析经分配表,未注册键 fail-fast。
import { registerDirectorHost } from './director';
import type { ModIdAllocation } from './types';

/** ★622:gen pass 源码收集(worker 注入队列;装载期填充,世界创建时读取) */
const __swGenPassSrc: Array<{ name: string; src: string }> = [];
export function getGenPassSources() { return __swGenPassSrc; }
import {
  registerModDodgeRoll,
  registerModPlayerHurt,
  registerModDamageGate,
  registerModDashType,
  registerModKeybindFace, registerModParryGate, registerModParrySuccess, modKeybindDown, readModNpcBuffs,
  registerNpcAi, registerModOnHitNpc, registerModNpcDeath, registerModOnHitAny, registerModTileInteract, registerModPlayerThorns, registerModHealItem, registerItemUse, registerSystem, registerProjHooks, playModSound, applyModNpcBuff,
  registerModModifyHurtByNpc, registerModModifyHitNpc, registerModModifyHitNpcByProj, registerModModifyHitPlayerByProj, registerModChestUnlock, registerModConversion, registerModNpcSpawnStats, registerVanillaNpcAi,
  registerModSpawnPool, registerMenuTheme, registerModBiomeMusic, requestModFrameMusic, registerModCanUse, registerModAccEffect, appendModAccEffect, registerModHoldItem, modProjSpecOf,
  registerModScreenFx,
  registerModNpcDraw, registerModItemDraw, registerVanillaOverride, registerGlobalNpcHooks, registerModPlayerPreHurt, registerModPlayerPostHurt, registerModPlayerRespawn, registerModPlayerUpdateDead, registerModPlayerModifyMoveSpeed, registerModPlayerDraw, registerModTooltip,
  type ModScreenFxPass, type ModSystemHooks, type ModUseCtx, type ModDrawCtx,
} from './hooks';
import { registerModShader } from './modShader';   // ★Tier1-b
import { createModClipboard } from './modClipboard';   // ★Tier1-b
import { createModNet } from './modNet';   // ★Tier1-c
import { modWorkerOf } from './modWorker';   // ★Tier1-c
import { modUiPanel, modUiCloseAllOf } from './ui';   // ★刀1:mod UI 宿主面板
import { modHtmlUiPage } from './modHtmlUi';   // ★Tier1-a:富 DOM overlay
import { createModStorage } from './modStorage';   // ★Tier1-a:持久 KV
import { applyBuffTicks } from '../entities/projStatus';   // ★四百九十刀:敌侧原版 debuff
import { projClassOfProjId } from '../entities/projTargets';   // ★四百九十一刀:系别探针
import { registerModBuff, modBuffTypeOf, type ModBuffSpec } from './buffs';
import { registerModMusic, registerModBossMusic, modMusicIdOfFull } from './music';   // ★BGM 面
import { registerGenPass } from '../world/gen/WorldGen';
import { registerModTileEntity, getModTileEntitiesOfTile } from './tileEntities';   // ★TE 梯队
import { TILE_INTERNAL_OF_STABLE, TILE_DEFS, TILE_BY_KEY } from '../data/tiles';   // ★magic-storage:stableId→内部 id 域映射
import { collectModAchievement, completeModAchievement } from './modAchievements';   // ★成就域
import { registerModInfoDisplay } from './infoDisplay';   // ★InfoDisplay 域
import { registerModRecipeGroupItems } from '../data/vanillaRecipes';
import { registerModArmorSet } from '../data/vanillaArmorSets';   // ★四百八十二刀
import { registerModBiomeFlag } from '../world/SceneMetrics';   // ★一百二十刀
import { rollNaturalPrefixForVid } from '../data/vanillaPrefixes';   // ★一百二十二刀
import { isPrefixableAccessory } from '../items/Inventory';
import type { ModConfigState } from './config';

export interface ModContext {
  readonly id: string;
  /** 接管本 mod NPC 的自定义 AI(每 fixedUpdate 调,共享尾段[接触伤害/击退/掉落]照走) */
  npcAi(key: string, fn: (e: unknown, game: unknown, player: unknown) => void): void;
  /** 接管本 mod 物品的左键使用;返回 true=已消费(useTime 节奏自管) */
  itemUse(key: string, fn: (ctx: ModUseCtx) => boolean): void;
  /** B6:本 mod 物品近战命中敌怪钩(受理命中后;ModItem.OnHitNPC 形) */
  onHitNpc(key: string, fn: (e: unknown, game: unknown, ctx: { damage: number; crit: boolean; killed: boolean }) => void): void;
  /** B6:本 mod NPC 死亡钩(击杀单口;Hive Tumor→Boss 遭遇链面) */
  onNpcDeath(key: string, fn: (e: unknown, game: unknown) => void): void;
  /** ★四百七十刀:通用命中钩(C# CalamityPlayerOnHit.ItemOnHit/ProjOnHit 形;
   *  任何玩家来源伤害受理后调一次——ctx={e,game,damage,crit,killed,projId,melee};
   *  免疫帧拒收/dontTakeDamage 不进=原版 OnHitNPC 同相) */
  onHitAny(fn: (ctx: Record<string, unknown>) => void): void;
  /** ★二百八十七刀:mod 刷怪池独占面(pool.Clear 语义;返回规则表=本拍顶替
   *  原版选怪池,只掷返回规则;null=不接管;酸雨事件消费) */
  spawnPool(fn: (ctx: { game: unknown; player: unknown }) => Array<Record<string, unknown>> | null): void;
  /** ★三百零一:mod 配方组注册(RecipeGroup.RegisterGroup 同构;假 id=1010000+ 注册序
   *  ——提取器 recipe-groups.json 按名称排序同序;items=vid∪mod item 键) */
  recipeGroups(defs: Array<{ name: string; items: Array<number | string> }>): void;
  /** ★三百十五:菜单主题面(logo/background=pack 相对路径→SW mod 缓存 URL;
   *  TitleMenu logo 换图/MenuBackground 整幅替换+Cinders 粒子消费) */
  menuTheme(spec: { logo?: string; background?: string; cinderTex?: string; music?: string }): void;
  /** ★BGM 面:注册曲目(pack 相对路径;返回槽位 id 5000+;bossMusic/menuTheme.music
   *  引用面用键即可) */
  music(key: string, file: string): number;
  /** ★BGM 面:Boss 换曲绑定(npc=本 mod npc 键或原版 id;music=sw.music 键/槽位
   *  id/原版 MusicID——活动期事件曲覆盖) */
  bossMusic(npc: number | string, music: string | number): void;
  /** ★三百二十一刀:群系曲绑定(flag=sw.biomeFlag 注册的旗名;music=sw.music 键/
   *  槽位 id/原版 MusicID 兜底;priority=环境/biomeHigh/bossMedium——2019
   *  CalamityMod.UpdateMusic 三档同构) */
  biomeMusic(flag: string, music: string | number,
    opts?: { priority?: 'environment' | 'biomeHigh' | 'bossMedium' }): void;
  /** ★三百二十二刀:AI 期音乐直写(每帧调=本帧覆写压一切;2019 Main.music 裸写
   *  黑魔法同位;逐相换曲消费面) */
  setMusic(id: number): void;
  /** mod 曲键→槽位 id(fail-loud;AI 钩内解析用) */
  musicIdOf(key: string): number;
  /** B6:播原版 SoundID 键音效(位置可选;mod 音频装载=余段) */
  playSound(files: string[], volume?: number, x?: number, y?: number): void;
  /** 给声明弹幕(content/projectiles/*.json)追加代码钩(update/onHit 族;
   *  未注册键 fail-fast;★五百八十二:onChannelEnd 仅 holdout 弹——返回 true=
   *  释放存续,update 钩自管转储/装填/kill) */
  projectileHook(key: string, hooks: {
    update?: (p: unknown, game: unknown) => void;
    onHit?: (p: unknown, enemy: unknown, game: unknown) => boolean | void;
    onHitPlayer?: (p: unknown, game: unknown) => boolean | void;
    onTileHit?: (p: unknown, game: unknown) => boolean | void;
    onChannelEnd?: (p: unknown, game: unknown) => boolean | void;
    /** ★刀2-C2:自绘三钩(preDraw false=跳默认绘制段/draw 全权/postDraw 后随) */
    preDraw?: (p: unknown, ctx: ModDrawCtx) => boolean | void;
    draw?: (p: unknown, ctx: ModDrawCtx) => void;
    postDraw?: (p: unknown, ctx: ModDrawCtx) => void;
  }): void;
  /** ★刀2-C2:本 mod NPC 自绘(tML ModNPC.PreDraw/PostDraw 形;preDraw 返 false=
   *  跳原版本体段含叠画=mod 全权;ModDrawCtx=受限算子面 draw/drawAdd/tinted) */
  npcDraw(key: string, spec: {
    preDraw?: (e: unknown, ctx: ModDrawCtx) => boolean | void;
    postDraw?: (e: unknown, ctx: ModDrawCtx) => void;
  }): void;
  /** ★刀2-C2:本 mod 物品世界自绘(tML ModItem.PreDrawInWorld/PostDrawInWorld 形;
   *  掉落物绘制位消费) */
  itemDraw(key: string, spec: {
    preDrawInWorld?: (d: unknown, ctx: ModDrawCtx) => boolean | void;
    postDrawInWorld?: (d: unknown, ctx: ModDrawCtx) => void;
  }): void;
  /** ★刀1:游戏内 UI 面板(vui 保留树晋升;拖拽标题栏/关闭钮/级联定位;
   *  Esc 链 closeModPanels 支+世界输入让位全桥接。同键重开=聚焦既有面板) */
  ui: {
    panel(key: string, opts: {
      title?: string; x?: number; y?: number; width: number; height: number;
      draggable?: boolean; closable?: boolean;
      /** ★D15余债:全屏页宿主(可见期 uiBlocking+整屏让位;Esc 关最上层) */
      fullscreen?: boolean;
    }): import('./ui').ModPanelHandle;
    /** 关全部本 mod 面板 */
    closeAll(): void;
    /** ★Tier1-a(2026-10-14):富 DOM overlay 页(sw.ui.htmlPage)——HTML+CSS
     *  (自动 scope)+data-act 声明式事件;ESC 收最上层;世界卸载全清。
     *  返回句柄(q 查询/setHtml 重挂/show/hide/toggle/close) */
    htmlPage(key: string, spec: {
      html: string;
      css?: string;
      className?: string;
      visible?: boolean;
      actions?: Record<string, (el: HTMLElement, page: import('./modHtmlUi').ModHtmlPageHandle) => void>;
    }): import('./modHtmlUi').ModHtmlPageHandle;
  };
  /** ★刀5:具名修正槽(tML detour 等价物·修正形)。槽名封闭集见引擎
   *  VANILLA_OVERRIDE_SLOTS('Player.ApplyLifeAndOrMana'=治疗量/
   *  'Player.UpdateLifeRegen'=装备回复量);anchor=槽语义版本(引擎 bump 时旧 mod
   *  fail-loud 弃用回原版);fn(ctx:{value,...}) → number=修正后值/undefined=不改;
   *  per-mod 单注册,值链=后钩吃前钩产物 */
  vanillaOverride(slot: 'Player.ApplyLifeAndOrMana' | 'Player.UpdateLifeRegen', anchor: number,
    fn: (ctx: Record<string, unknown>) => number | void): void;
  /** ★B/C 批:全局 NPC 钩(tML GlobalNPC 形;全域 NPC 含原版) */
  globalNpc(spec: {
    /** 原版 AI 前;返 false=本 tick 跳过 AI 派发 */
    preAi?: (e: unknown, game: unknown) => boolean | void;
    /** AI 派发完成后 */
    postAi?: (e: unknown, game: unknown) => void;
    /** 防御结算后伤害值链(fn(ctx:{value}) → number=修正后值;DR 族) */
    incomingHit?: (e: unknown, ctx: { value: number }) => number | void;
    /** 受击任意来源全域(fromPlayer 门不设;ctx:{damage,crit,killed,projId}) */
    onHitByAny?: (e: unknown, ctx: { damage: number; crit: boolean; killed: boolean; projId: number }) => void;
    /** 击杀(原版域含) */
    onKill?: (e: unknown, game: unknown) => void;
  }): void;
  /** ★第四批:玩家外观自绘(drawPlayer 返回后 overlay;aura/拖尾/发光类。
   *  ModDrawCtx 受限算子面 draw/drawAdd/tinted;ctx.cx/cy=玩家中心世界 px) */
  playerDraw(spec: {
    postDraw?: (p: unknown, ctx: ModDrawCtx) => void;
  }): void;
  /** ★第五批:tooltip 修改钩(tML ModifyTooltips 形;itemKey=mod 键;
   *  fn(lines,ctx) → void 修改行数组(增/删/改) */
  modifyTooltip(itemKey: string, fn: (lines: { text: string; color?: string }[], ctx: { key: string; vid: number; rare: number }) => void): void;
  /** 注册 mod buff(本地玩家;onTick 逐 tick;图标/名称/buff 栏全链) */
  buff(key: string, spec: ModBuffSpec): void;
  /** 系统/世界生命周期钩子(全可选) */
  system(hooks: ModSystemHooks): void;
  /** ★导演模式（2026-10-14）：注册 cutscene 宿主（相机目标/输入锁/玩家隐藏/顶层绘制）。
   *  同 mod 唯一宿主;卸载时引擎自动置 null（teardown 调 directorDetach）。 */
  director(host: {
    camTarget(): { x: number; y: number } | null;
    inputLocked(): boolean;
    playerHidden(): boolean;
    overlay(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  }): void;
  /** mod 全屏后处理 pass(Renderer 7d 滤镜链最前执行;tML FilterManager.
   *  EndCapture MonoMod 前缀同位——lights-and-shadows 首消费方) */
  screenFx(pass: ModScreenFxPass): void;
  /** ★Tier1-b(2026-10-14):GLSL 屏幕后处理声明面——只写片元源+uniforms
   *  (float/vec2/vec3/vec4),引擎编译/绑纹理/链入 7d 滤镜链最前;编译失败=
   *  warn+恒等直通(不炸帧)。采样器固定 uTexture;禁 #version/#extension */
  shader(spec: { src: string; uniforms?: Record<string, number | readonly number[]> }): void;
  /** ★Tier1-b(2026-10-14):剪贴板(写 256KB 限/读 3s 授权超时;读拒绝=null) */
  clipboard: {
    write(text: string): Promise<boolean>;
    read(): Promise<string | null>;
  };
  /** ★Tier1-c(2026-10-14):联网 fetch(mod.json "net" 域白名单声明;未声明域
   *  runtime throw;仅 https+localhost;超时 10s/响应 4MB 限) */
  net: {
    fetchJson<T>(url: string, opts?: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string; timeoutMs?: number }): Promise<T>;
    fetchText(url: string, opts?: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string; timeoutMs?: number }): Promise<string>;
  } | null;
  /** ★Tier1-c(2026-10-14):计算卸载 worker(pack 内 workers/<path>.js;脚本声明
   *  onmessageRun(data, reply)——引擎胶水 id 路由;run 结构化克隆往返) */
  worker(path: string): { run<TIn, TOut>(data: TIn): Promise<TOut>; terminate(): void };
  /** 声明式配置读写(mod.json config 表声明的键;set 即持久化) */
  config: {
    get(key: string): boolean | number | string;
    set(key: string, value: boolean | number | string): void;
  };
  /** ★Tier1-a(2026-10-14):per-mod 持久 KV 存储(任意 JSON 值;跨会话跨世界;
   *  键空间 sandboxworld.mods.<modId>.;配额 2MB/mod) */
  storage: {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<boolean>;
    delete(key: string): Promise<void>;
  };
  /** mod 弹幕分配 id(GLM娘 rivals 批新增:entry.js 无 import 面,AI 态机拿数字 id
   *  计数/自造用;fail-fast) */
  projIdOf(key: string): number;
  /** ★三百三十三刀:使用条件门(fn 返回 false=本拍禁用;C# CanUseItem 同位) */
  canUse(key: string, fn: (ctx: unknown) => boolean): void;
  /** ★四百八十二刀:mod 套装加成注册(h/b/l=本 mod 物品键;bonus=数值/旗面,
   *  与原版 ARMOR_SET_BONUSES 同消费面——穿戴三件即亮) */
  armorSet(spec: { h: string; b: string; l: string; bonus: Record<string, unknown>;
    /** ★四百九十八:悬停套装提示文本(desc 直挂=mod 文本) */
    tipName?: string; tipText?: string }): void;
  /** ★四百八十三刀:mod tile 右键钩(fn 返回 true=消费右键;C# ModTile.RightClick 同位) */
  tileInteract(key: string, fn: (tx: number, ty: number, game: unknown) => boolean): void;
  /** ★四百八十三刀:mod 物品键→vid(fail-fast;运行时闭包解析用——gs.mods.itemIdByKey
   *  仅生成期在场) */
  itemIdOf(key: string): number;
  /** ★magic-storage(2026-10-14):mod tile 键→内部 id(fail-fast;tileInteract/
   *  tileEntity 网络扫描/TE 跨读用) */
  tileIdOf(key: string): number;
  /** ★magic-storage(2026-10-14):枚举某 mod tile 的全部 TE 实例句柄(网络泛洪/
   *  跨实例读 state;世界未绑/无实例=空) */
  tileEntitiesOf(key: string): Array<{ x: number; y: number; key: string; state: Record<string, unknown> }>;
  /** ★四百八十八刀:承伤面 thorns 钩(玩家接触受击荆棘面调;ctx={p,game,e,dmg};
   *  反伤自调 e.hurt 或 spawnProj) */
  playerThorns(fn: (ctx: Record<string, unknown>) => void): void;
  /** ★五百四十八:治疗物使用钩(healLife 消费后派发;ctx={vid,heal}) */
  healItem(fn: (vid: number, heal: number) => void): void;
  /** ★三百三十五刀:配饰效果钩(装备期每 tick 调;C# UpdateAccessory 同位;
   *  fn(player, game)) */
  accEffect(key: string, fn: (player: unknown, game: unknown) => void): void;
  /** ★四百八十六刀:配饰效果追加链(同 vid 多闭包;主闭包后依注册序执行,
   *  累加器共享——数据族批与专属闭包结构性并置用) */
  accEffectAppend(key: string, fn: (player: unknown, game: unknown) => void): void;
  /** ★593:mod 闪避掷门(DodgeEffects 消费品闪避族;fn→true=本拍闪避成立,
   *  效果+冷却 mod 自管;单注册) */
  dodgeRoll(fn: (player: unknown, game: unknown, dmg: number) => boolean): void;
  /** ★594:mod 受击钩(C# OnHurt 同位;伤害落地后派发,ctx={player,game,dmg=实扣};
   *  rBrain 墨云/墨炸弹族消费;单注册) */
  playerHurt(fn: (ctx: { player: unknown; game: unknown; dmg: number }) => void): void;
  /** ★605:mod 伤害闸(能量盾族同位;Player.damage 头派发[防御计算前],
   *  fn(player,dmg)→剩余伤;多 mod 连减;单注册) */
  damageGate(fn: (player: unknown, dmg: number) => number): void;
  /** ★606:mod dash 类(PlayerDashEffect 同位;slot≥7;speed=初速;decelMult=
   *  滑行阻尼;shieldSlam=接触伤害;midDash=滑行期钩) */
  dashType(spec: { slot: number; speed: number; decelMult?: number; shieldSlam?: boolean;
    midDash?: (p: unknown, game: unknown) => void }): void;
  /** ★609:mod 键位(id=`mod:<modId>:<name>`;默认键=Keyboard code;重绑 UI=登记) */
  keybind(name: string, defaultKey: string): void;
  /** ★609:mod 键位按下查询(边沿=mod 自管上一帧态) */
  keyDown(name: string): boolean;
  /** ★609:mod parry 窗口门(fn(player)→窗口激活;同向谓词引擎共享) */
  parryGate(fn: (player: unknown) => boolean): void;
  /** ★611:parry 成功钩(窗口内接触 parry 受理后派发;反冲弹族消费) */
  parrySuccess(fn: (player: unknown, game: unknown) => void): void;
  /** ★619:mod debuff 读取面(abaddon 散播拷贝——源敌 mod debuff 逐条转嫁) */
  readModNpcBuffs(enemy: unknown): Map<number, number>;
  /** ★三百三十九刀:手持效果钩(手持该物品每 tick 调;C# HoldItem 同位) */
  holdItem(key: string, fn: (player: unknown, game: unknown) => void): void;
  /** ★三百四十四刀:给玩家施加本 mod buff(npcAi/holdItem 闭包内用;
   *  key=sw.buff 注册键;秒数,每帧重调=max 合并即持续) */
  playerBuff(key: string, seconds: number, player: unknown): void;
  /** ★四百八十九刀:给敌怪施加本 mod debuff(同上;applyModNpcBuff max 合并;
   *  onNpcTick=声明面 npcDps/代码钩族) */
  enemyBuff(e: unknown, key: string, seconds: number): void;
  /** ★四百九十刀:给敌怪施加原版 debuff(vid=原版 BuffID;applyBuffTicks max 合并
   *  +NPC 免疫表门——SUPPORTED 表内 33 debuff 生效,表外=登记) */
  enemyBuffVanilla(e: unknown, vanillaBuffId: number, seconds: number): void;
  /** ★四百九十一刀:弹幕系别探针(projId→'melee'|'ranged'|'magic'|'summon'|null;
   *  C# CountsAsClass<X> 同位——onHitAny 系别门用,替换 !melee 近似) */
  projClassOf(projId: number): 'melee' | 'ranged' | 'magic' | 'summon' | null;
  /** ★三百六十四刀:mod buff 免疫(装备期每帧调=immuneMod 每帧 add;
   *  key=sw.buff 注册键) */
  playerImmune(key: string, player: unknown): void;
  /** mod NPC 分配 id(同上) */
  npcIdOf(key: string): number;
  /** ★五百八十五:本 mod 弹幕在场计数(C# Player.ownedProjectileCounts 同位;
   *  召唤体「owned<N 才补生」门消费;未注册键 fail-fast) */
  ownedProjCount(key: string): number;
  /** ★CalPlayer 基建(六十三刀):玩家侧钩;kind='modifyHurtByNpc'=承伤修正链
   *  (fn(ctx: {player, game, attackerVid, dmg, contact}) → number=修正后伤/
   *  undefined=不改;★刀4-A 扩域:全部 NPC 攻端进入,attackerVid≥800=mod 攻端) */
  /** playerHook 九 kind(★刀4-A+刀B/C 扩容):
   *  modifyHurtByNpc=承伤修正链(值链;全 NPC 攻端)
   *  modifyHitNpc=近战命中伤害增幅链(倍率链;ctx 含 crit/kb/armorPen)
   *  modifyHitNpcByProj=玩家弹命中 NPC 增幅链(倍率;ctx: projVid/targetVid/dmg/crit)
   *  modifyHitPlayerByProj=敌弹命中玩家增幅链(倍率;ctx: projVid/dmg/trap/pvp)
   *  ★B/C 批五 kind:
   *  preHurt=承伤值链(闪避族前;返 ≤0=拒伤[无无敌帧=tML Cancelled 同相;满填帧
   *    需求走 postHurt 自管 AddBuff])
   *  postHurt=伤害落地通知(ctx.reduction=实扣;仅存活拍[tML statLife>0 同相];
   *    载荷贫面:无 crit/pvp/hitDirection——需攻端信息走 modifyHurtByNpc 系)
   *  respawn=重生通知(hardcore 不发)
   *  updateDead=死亡态每 tick(ctx.respawnTimer/deadTime)
   *  modifyMoveSpeed=移速乘区链(返乘数,≥0 钳;消费面=maxRun,dash 加速/骑乘不吃) */
  playerHook(kind: 'modifyHurtByNpc' | 'modifyHitNpc' | 'modifyHitNpcByProj' | 'modifyHitPlayerByProj'
    | 'preHurt' | 'postHurt' | 'respawn' | 'updateDead' | 'modifyMoveSpeed',
    fn: (ctx: Record<string, unknown>) => number | void): void;
  /** ★一百零八R2:世界生成 pass 注册(Beaches 后依序执行;引擎零 mod 知识) */
  registerGenPass(name: string, fn: (store: unknown, rng: unknown, gs: unknown) => void): void;
  /** ★一百一十六刀:mod 功能箱解锁条件(chest.locked 消费面;fn(world)=true 可开) */
  chestUnlockCondition(key: string, fn: (world: unknown) => boolean): void;
  /** ★一百一十七刀:mod 群系蔓延注册(tML ModBiomeConversion 形;spreads=mod tile
   *  键数组,tileMap=vanilla sheet→mod tile 键;引擎 WorldEvolution 蔓延扫描消费) */
  biomeConversion(spec: { spreads: string[]; tileMap: Record<number, string> }): void;
  /** ★TE 梯队(2026-10-14):mod tile entity(tML ModTileEntity 形;绑定本 mod tile。
   *  放置[锚格 frame 0,0]自愈建/破坏 onDestroy/逐 tick update/存读 save+load 钩;
   *  state=自由对象,缺省 save=state 直存[须 JSON-able]) */
  /** ★成就域(2026-10-14):mod 成就注册(原版条件状态机直接复用)。conditions:
   *  npcKilled/itemPickup/itemCraft/tileDestroyed=引擎通知自动驱动(keys=mod/
   *  vanilla 键或裸 vid;many=逐 id 独立);custom=mod 自管逻辑直完。持久化=
   *  原版 completed 表。 */
  achievement(key: string, spec: {
    title: string; desc?: string; category?: number; icon?: string;
    conditions: Array<{ kind: 'npcKilled' | 'itemPickup' | 'itemCraft' | 'tileDestroyed' | 'custom';
      keys?: Array<string | number>; many?: boolean }>;
  }): void;
  /** ★成就域:mod 成就直接完成(custom 条件消费;幂等;无实例沿=暂存回放) */
  completeAchievement(key: string): void;
  /** ★InfoDisplay 域(2026-10-14):mod 信息栏行(原版 DrawInfoAccs 追加行;
   *  update 逐帧产文本 null=本帧省行;label=悬停标签;gold=金行) */
  infoDisplay(key: string, spec: {
    label: string;
    update?(game: unknown): string | null;
    gold?: boolean;
  }): void;
  tileEntity(tileKey: string, spec: {
    create?(): Record<string, unknown>;
    update?(te: { readonly x: number; readonly y: number; readonly key: string; state: Record<string, unknown> }, game: unknown): void;
    onDestroy?(te: { readonly x: number; readonly y: number; readonly key: string; state: Record<string, unknown> }): void;
    save?(te: { readonly x: number; readonly y: number; readonly key: string; state: Record<string, unknown> }): Record<string, unknown> | undefined;
    load?(te: { readonly x: number; readonly y: number; readonly key: string; state: Record<string, unknown> }, data: unknown): void;
  }): void;
  /** ★一百二十刀:mod 群系旗注册(AbyssLayer 复合面;depth=(y−rock)/h 带,
   *  xDist=边缘带绝对距;tiles=mod tile 键) */
  biomeFlag(flag: string, spec: { tiles: string[]; threshold?: number; depth?: { min: number; max: number }; xDist?: number }): void;
  /** ★一百三十七刀:NPC 出生 stats 修正钩(复仇/死亡 HP 乘表消费) */
  npcSpawnStats(fn: (vanillaId: number, stats: { lifeMaxScale: number }) => void): void;
  /** ★一百三十九刀:vanilla 敌怪 AI 覆盖(ids=原版 id 集;整支接管,共享尾段照走) */
  vanillaNpcAi(ids: number[], fn: (e: unknown, game: unknown, player: unknown) => void): void;
  /** ★两百一十七刀:mod 侧物品掉落生成(ItemDrop 直构;entities.add drops 桶) */
  spawnItem(game: unknown, itemId: number, x: number, y: number, stack?: number): void;
  /** ★一百二十二刀:随机词缀掷(Item.Prefix(-1) 1:1 通道;vid=任意内部物品 id;
   *  返回词缀 id(0=无)——mod loot/掉落面消费) */
  rollPrefixFor(vid: number): number;
  /** 生成 mod 弹幕(npcAi 闭包内持 game,回传本面构造 ModProj 并入桶——L2 唯一
   *  弹幕生成通道;ownerIsPlayer=false=mod NPC 弹打玩家) */
  spawnProj(game: unknown, key: string, x: number, y: number, vx: number, vy: number,
    damage: number, knockback?: number, ownerIsPlayer?: boolean): void;
  /** 生成 mod NPC(rivals 批新增:多段体节/护卫体由主 AI 按需派生;入 enemies 桶) */
  spawnNpc(game: unknown, key: string, x: number, y: number): void;
  log(...args: unknown[]): void;
}

/** 测试/装载器注入的入口模块形(动态 import 的 default export) */
export type ModEntry = (sw: ModContext) => void;

export function createModContext(
  modId: string,
  alloc: ModIdAllocation,
  config: ModConfigState,
  opts?: {
    /** itemUse 上下文增强(applyBuff 等;装载器注入 buff 解析) */
    decorateUseCtx?: (ctx: ModUseCtx) => ModUseCtx;
    /** ★Tier1-c:manifest net 域白名单(未声明=sw.net 整缺) */
    manifestNetHosts?: string[];
    /** ★Tier1-c:workers/<path> 脚本字节(loader 注入;缺=throw) */
    workerScriptOf?: (path: string) => Uint8Array | null;
  },
): ModContext {
  const manifestNetHosts = opts?.manifestNetHosts;
  const workerScriptOf = opts?.workerScriptOf ?? (() => null);
  const idOf = (kind: 'items' | 'npcs' | 'tiles', key: string): number => {
    const full = key.startsWith('mod_') ? key : `mod_${modId}_${key}`;
    const id = alloc[kind].get(full);
    if (id === undefined) throw new Error(`[mod-api] mod ${modId} 引用未注册 ${kind} 键: ${key}`);
    return id;
  };
  // ★2026-10-14 域防线(helper):mod tile 键→内部 id——①查不到=缺映射(旧行为)
  // ②键回查 TILE_DEFS[internal].key === 全键=**域污染哨兵**(错域时映射偶合命中/
  // 越段也会因键不符炸——不再依赖"恰好缺失"才暴露;深链审计案教训)。
  const tileInternalOf = (key: string): number => {
    const full = key.startsWith('mod_') ? key : `mod_${modId}_${key}`;
    const internal = TILE_INTERNAL_OF_STABLE[idOf('tiles', key)];
    const hit = internal ? TILE_DEFS[internal] : undefined;
    if (!internal || hit?.key !== full) {
      throw new Error(`[mod-api] mod ${modId} tile 键域校验失败: ${key}(internal=${internal}, 实际键=${hit?.key ?? '无'}——id 域错位,勿直喂 stableId)`);
    }
    return internal;
  };
  return {
    id: modId,
    npcAi(key, fn) { registerNpcAi(idOf('npcs', key), fn as Parameters<typeof registerNpcAi>[1]); },
    onHitNpc(key: string, fn: (e: unknown, game: unknown, ctx: { damage: number; crit: boolean; killed: boolean }) => void) {
      registerModOnHitNpc(idOf('items', key), fn as Parameters<typeof registerModOnHitNpc>[1]);
    },
    onNpcDeath(key: string, fn: (e: unknown, game: unknown) => void) {
      registerModNpcDeath(idOf('npcs', key), fn as Parameters<typeof registerModNpcDeath>[1]);
    },
    onHitAny(fn: (ctx: Record<string, unknown>) => void) {
      registerModOnHitAny(modId, fn as unknown as Parameters<typeof registerModOnHitAny>[1]);
    },
    spawnPool(fn: (ctx: { game: unknown; player: unknown }) => Array<Record<string, unknown>> | null) {
      registerModSpawnPool(modId, fn as unknown as Parameters<typeof registerModSpawnPool>[1]);
    },
    recipeGroups(defs: Array<{ name: string; items: Array<number | string> }>) {
      for (const d of defs) {
        const ids = d.items.map((r) => (typeof r === 'number' ? r : idOf('items', r)));
        registerModRecipeGroupItems(ids);
      }
    },
    menuTheme(spec: { logo?: string; background?: string; cinderTex?: string; music?: string }) {
      const url = (p?: string) => (p ? `sprites/mods/${modId}/${p}` : undefined);
      // music=mod 曲键 → 全键归一(须先经 sw.music 注册;未注册 fail-loud)
      const musFull = spec.music
        ? (spec.music.startsWith('mod_') ? spec.music : `mod_${modId}_${spec.music}`)
        : undefined;
      if (musFull && modMusicIdOfFull(musFull) == null) {
        throw new Error(`[mod-api] menuTheme.music 引用未注册曲目: ${spec.music}`);
      }
      registerMenuTheme(modId, {
        logo: url(spec.logo), background: url(spec.background), cinderTex: url(spec.cinderTex),
        ...(musFull ? { music: musFull } : {}),
      });
    },
    music(key: string, file: string): number {
      return registerModMusic(modId, key, file);
    },
    bossMusic(npc: number | string, music: string | number): void {
      registerModBossMusic(modId, npc, music);
    },
    biomeMusic(flag: string, music: string | number, opts?: { priority?: 'environment' | 'biomeHigh' | 'bossMedium' }): void {
      // music 解析:数字=MusicID 原样(原版曲兜底支,2019 else 支同构);字符串=sw.music 键(fail-loud)
      let musicId: number;
      if (typeof music === 'number') musicId = music;
      else {
        const full = music.startsWith('mod_') ? music : `mod_${modId}_${music}`;
        const v = modMusicIdOfFull(full);
        if (v == null) throw new Error(`[mod-api] biomeMusic 引用未注册曲目: ${music}`);
        musicId = v;
      }
      registerModBiomeMusic(modId, { flag, musicId, priority: opts?.priority ?? 'biomeHigh' });
    },
    setMusic(id: number): void {
      requestModFrameMusic(id);
    },
    musicIdOf(key: string): number {
      const full = key.startsWith('mod_') ? key : `mod_${modId}_${key}`;
      const v = modMusicIdOfFull(full);
      if (v == null) throw new Error(`[mod-api] musicIdOf 引用未注册曲目: ${key}`);
      return v;
    },
    playSound(files: string[], volume = 1, x?: number, y?: number) {
      playModSound(files, volume, x, y);
    },
    itemUse(key, fn) {
      const vid = idOf('items', key);
      registerItemUse(vid, (ctx) => fn(opts?.decorateUseCtx ? opts.decorateUseCtx(ctx) : ctx));
    },
    projectileHook(key, hooks) {
      const full = key.startsWith('mod_') ? key : `mod_${modId}_${key}`;
      const id = alloc.projs.get(full);
      if (id === undefined) throw new Error(`[mod-api] mod ${modId} 引用未注册弹幕: ${key}`);
      registerProjHooks(id, hooks as Parameters<typeof registerProjHooks>[1]);
    },
    // ★刀2-C2:实体自绘面(NPC/物品;ModDrawCtx 受限算子面)
    npcDraw(key, spec) {
      registerModNpcDraw(idOf('npcs', key), spec as Parameters<typeof registerModNpcDraw>[1]);
    },
    itemDraw(key, spec) {
      registerModItemDraw(idOf('items', key), spec as Parameters<typeof registerModItemDraw>[1]);
    },
    // ★刀1:游戏内 UI 面板(vui 晋升;面板=运行时对象非装载期注册,同键重开=聚焦)
    ui: {
      panel(key, opts) {
        return modUiPanel(modId, key, opts);
      },
      closeAll() {
        modUiCloseAllOf(modId);
      },
      // ★Tier1-a:富 DOM 页
      htmlPage(key, spec) {
        return modHtmlUiPage(modId, key, spec as never) as never;
      },
    },
    // ★Tier1-a:持久 KV
    storage: createModStorage(modId),
    // ★刀5:具名修正槽(anchor 版本锚 fail-loud;per-mod 单注册)
    vanillaOverride(slot, anchor, fn) {
      registerVanillaOverride(slot, anchor, modId, fn as Parameters<typeof registerVanillaOverride>[3]);
    },
    // ★B/C 批:全局 NPC 钩(GlobalNPC 形;per-mod 单注册)
    globalNpc(spec) {
      registerGlobalNpcHooks(modId, spec as Parameters<typeof registerGlobalNpcHooks>[1]);
    },
    // ★第四批:玩家外观自绘(per-mod 单注册)
    playerDraw(spec) {
      registerModPlayerDraw(modId, spec as Parameters<typeof registerModPlayerDraw>[1]);
    },
    // ★第五批:tooltip 修改钩(tML ModifyTooltips 形;itemKey=mod 键)
    modifyTooltip(itemKey: string, fn: (lines: { text: string; color?: string }[], ctx: { key: string; vid: number; rare: number }) => void) {
      registerModTooltip(modId, itemKey, fn as Parameters<typeof registerModTooltip>[2]);
    },
    buff(key, spec) { registerModBuff(modId, key, spec); },
    system(hooks) { registerSystem(hooks); },
    director(host) { registerDirectorHost(host); },
    screenFx(pass) { registerModScreenFx(pass); },
    // ★Tier1-b:GLSL 声明面/剪贴板
    shader(spec) { registerModShader(modId, spec as never); },
    clipboard: createModClipboard(modId),
    // ★Tier1-c:联网/worker
    net: createModNet(modId, manifestNetHosts ?? []),
    worker(path) {
      const bytes = workerScriptOf(path);
      if (!bytes) throw new Error(`[mod-api] mod ${modId} 引用未注册 worker 脚本: workers/${path}`);
      return modWorkerOf(modId, path, bytes);
    },
    projIdOf(key) { return idOf('projs' as 'items', key); },
    canUse(key, fn) {
      registerModCanUse(idOf('items', key), fn as Parameters<typeof registerModCanUse>[1]);
    },
    // ★四百八十二刀:mod 套装加成(键→内部物品 id=stableId 三元组入 ARMOR_SET_BONUSES;
    //  hs/bs/ls 匹配键由 extract-armor-slots 写入 content stats 三方同源)
    armorSet(spec) {
      const internal = (k: string) => idOf('items', k);
      registerModArmorSet(
        internal(spec.h), internal(spec.b), internal(spec.l),
        spec.bonus as Parameters<typeof registerModArmorSet>[3],
        spec.tipName && spec.tipText ? { name: spec.tipName, desc: spec.tipText } : undefined,
      );
    },
    // ★四百八十三刀:mod tile 右键(tiles 域 id 解析→interactAt 尾臂派发)
    tileInteract(key, fn) {
      // ★2026-10-14 域修正:interactAt 尾臂以 store.type(内部 id)派发——stableId 直喂=永不命中
      registerModTileInteract(tileInternalOf(key), fn as Parameters<typeof registerModTileInteract>[1]);
    },
    itemIdOf(key) { return idOf('items', key); },
    tileIdOf(key) { return tileInternalOf(key); },   // ★域哨兵(helper 回查)
    tileEntitiesOf(key) { return getModTileEntitiesOfTile(tileInternalOf(key)); },   // ★magic-storage:TE 枚举
    dodgeRoll(fn) {
      registerModDodgeRoll(modId, fn as Parameters<typeof registerModDodgeRoll>[1]);
    },
    playerHurt(fn) {
      registerModPlayerHurt(modId, fn as Parameters<typeof registerModPlayerHurt>[1]);
    },
    damageGate(fn) {
      registerModDamageGate(modId, fn as Parameters<typeof registerModDamageGate>[1]);
    },
    dashType(spec) {
      registerModDashType(spec.slot, spec as Parameters<typeof registerModDashType>[1]);
    },
    keybind(name, defaultKey) {
      registerModKeybindFace(`mod:${modId}:${name}`, [defaultKey]);
    },
    keyDown(name) {
      const g = (globalThis as { __swGame?: { input?: { keys?: Set<string>; touchKeys?: Set<string> } } }).__swGame;
      const keys = g?.input?.keys;
      if (!keys) return false;
      return modKeybindDown(`mod:${modId}:${name}`, keys);
    },
    parryGate(fn) {
      registerModParryGate(modId, fn as Parameters<typeof registerModParryGate>[1]);
    },
    parrySuccess(fn) {
      registerModParrySuccess(modId, fn as Parameters<typeof registerModParrySuccess>[1]);
    },
    readModNpcBuffs(enemy: unknown) {
      return readModNpcBuffs(enemy as object);
    },
    playerThorns(fn) {
      registerModPlayerThorns(modId, fn as unknown as Parameters<typeof registerModPlayerThorns>[1]);
    },
    /** ★五百四十八:治疗物使用钩(healLife 消费后派发) */
    healItem(fn: (vid: number, heal: number) => void): void {
      registerModHealItem(modId, fn);
    },
    accEffect(key, fn) {
      registerModAccEffect(idOf('items', key), fn as Parameters<typeof registerModAccEffect>[1]);
    },
    accEffectAppend(key, fn) {
      appendModAccEffect(idOf('items', key), fn as Parameters<typeof appendModAccEffect>[1]);
    },
    holdItem(key, fn) {
      registerModHoldItem(idOf('items', key), fn as Parameters<typeof registerModHoldItem>[1]);
    },
    playerBuff(key, seconds, player) {
      (player as { buffs: { apply(t: number, s: number): void } }).buffs.apply(
        modBuffTypeOf(modId, key), seconds);
    },
    // ★四百八十九刀:敌侧 mod debuff(applyModNpcBuff max 合并=原版 AddBuff 语义;
    //  npcBuffStore 内部面经 hooks 导出通道)
    enemyBuff(e, key, seconds) {
      applyModNpcBuff(e as object, modBuffTypeOf(modId, key), seconds);
    },
    // ★四百九十刀:敌侧原版 debuff(applyBuffTicks=SUPPORTED 表面 max 合并+免疫门)
    enemyBuffVanilla(e, vanillaBuffId, seconds) {
      applyBuffTicks(e as never, vanillaBuffId, Math.max(1, Math.round(seconds * 60)));
    },
    // ★四百九十一刀:弹幕系别探针(projTargets 投影序=melee→ranged→magic→minion)
    projClassOf(projId: number) {
      return projClassOfProjId(projId);
    },
    playerImmune(key, player) {
      const bt = modBuffTypeOf(modId, key);
      const im = (player as { buffs?: { immuneMod?: Set<number> } }).buffs?.immuneMod;
      if (im) im.add(bt);
    },
    npcIdOf(key) { return idOf('npcs', key); },
    // ★五百八十五:本 mod 弹幕在场计数(ownedProjectileCounts 同位;
    //  全局面 __swGame 实体桶直读——召唤体补生门消费)
    ownedProjCount(key) {
      const full = key.startsWith('mod_') ? key : `mod_${modId}_${key}`;
      const pid = alloc.projs.get(full);
      if (pid === undefined) throw new Error(`[mod-api] mod ${modId} 引用未注册弹幕: ${key}`);
      // ★619-R3F12:计数缓存(per-frame;缓存键=frame tick,帧内首调算后续读——
      //  多召唤体同帧多键各 O(n) 一次/帧=可接受;跨帧失效)
      const g = (globalThis as unknown as { __swGame?: { entities?: { projectiles?: Array<{ projId?: number; dead?: boolean }>; tickCount?: number } } }).__swGame;
      if (!g?.entities?.projectiles) return 0;
      const gg = g as { tickCount?: number; __swOpCache?: { frame: number; counts: Map<number, number> } };
      const cache = gg.__swOpCache ?? (gg.__swOpCache = { frame: -1, counts: new Map<number, number>() });
      if (cache.frame !== gg.tickCount) { cache.frame = gg.tickCount ?? 0; cache.counts.clear(); }
      if (cache.counts.has(pid)) return cache.counts.get(pid) ?? 0;
      const n = g.entities.projectiles.filter((q) => !q.dead && q.projId === pid).length;
      cache.counts.set(pid, n);
      return n;
    },
    // ★CalPlayer 基建(六十三刀):玩家承伤修正链(ModifyHitByNPC 形)
    //  ★刀4-A:四 kind(承伤值链/近战倍率链/弹命中 NPC 倍率链/敌弹命中玩家倍率链)
    playerHook(kind: string, fn: (ctx: Record<string, unknown>) => number | void) {
      if (kind === 'modifyHurtByNpc') {
        registerModModifyHurtByNpc(modId, fn as Parameters<typeof registerModModifyHurtByNpc>[1]);
      } else if (kind === 'modifyHitNpc') {
        registerModModifyHitNpc(modId, fn as Parameters<typeof registerModModifyHitNpc>[1]);
      } else if (kind === 'modifyHitNpcByProj') {
        registerModModifyHitNpcByProj(modId, fn as Parameters<typeof registerModModifyHitNpcByProj>[1]);
      } else if (kind === 'modifyHitPlayerByProj') {
        registerModModifyHitPlayerByProj(modId, fn as Parameters<typeof registerModModifyHitPlayerByProj>[1]);
      }
      // ★B/C 批:ModPlayer 级五 kind
      else if (kind === 'preHurt') {
        registerModPlayerPreHurt(modId, fn as Parameters<typeof registerModPlayerPreHurt>[1]);
      } else if (kind === 'postHurt') {
        registerModPlayerPostHurt(modId, fn as Parameters<typeof registerModPlayerPostHurt>[1]);
      } else if (kind === 'respawn') {
        registerModPlayerRespawn(modId, fn as Parameters<typeof registerModPlayerRespawn>[1]);
      } else if (kind === 'updateDead') {
        registerModPlayerUpdateDead(modId, fn as Parameters<typeof registerModPlayerUpdateDead>[1]);
      } else if (kind === 'modifyMoveSpeed') {
        registerModPlayerModifyMoveSpeed(modId, fn as Parameters<typeof registerModPlayerModifyMoveSpeed>[1]);
      } else throw new Error(`[mod-api] 未知 playerHook: ${kind}`);
    },
    /** ★B7 一百零八R2:世界生成 pass 注册(Beaches 后依序执行;引擎零 mod 知识) */
    registerGenPass(name: string, fn: (store: unknown, rng: unknown, gs: unknown) => void): void {
      registerGenPass({ name, fn });
      // ★622:序列化 gen pass 源码(worker 注入——Worker 模块实例独立,主线程注册不可见)
      __swGenPassSrc.push({ name, src: fn.toString() });
    },
    // ★一百一十六刀:mod 箱解锁条件(tiles 域 id 解析)
    chestUnlockCondition(key: string, fn: (world: unknown) => boolean): void {
      // ★2026-10-14 域修正:消费面 Game.ts:31089 st.get(内部 id)——同 tileInteract 换域
      registerModChestUnlock(tileInternalOf(key), fn);
    },
    // ★一百一十七刀:mod 群系蔓延(键→内部 id 解析;tileMap 键=vanilla sheet)
    biomeConversion(spec: { spreads: string[]; tileMap: Record<number, string> }): void {
      const tid = (k: string) => {
        const full = k.startsWith('mod_') ? k : `mod_${modId}_${k}`;
        const v = alloc.tiles.get(full);
        if (v === undefined) throw new Error(`[mod-api] biomeConversion 引用未注册 tile: ${k}`);
        return v;
      };
      const map: Record<number, number> = {};
      for (const [sheet, key] of Object.entries(spec.tileMap)) map[Number(sheet)] = tid(key);
      registerModConversion({ spreads: new Set(spec.spreads.map(tid)), tileMap: map });
    },    // ★一百二十二刀:随机词缀掷(rollNaturalPrefixForVid 1:1 通道直通)
    rollPrefixFor(vid: number): number {
      return rollNaturalPrefixForVid(vid, isPrefixableAccessory(vid), () => Math.random());
    },
    // ★一百二十刀:mod 群系旗(AbyssLayer 复合面;键→内部 id)
    // ★成就域:mod 成就(收集;loader 出口统一翻译)
    achievement(key, spec) {
      collectModAchievement(modId, key, spec as never);
    },
    completeAchievement(key) {
      completeModAchievement(modId, key);
    },
    // ★InfoDisplay 域:mod 信息栏行
    infoDisplay(key, spec) {
      registerModInfoDisplay(`mod_${modId}_${key}`, spec);
    },
    // ★TE 梯队:mod tile entity(tiles 域 id 解析→registry)
    tileEntity(tileKey, spec) {
      // ★2026-10-14 域修正:TE listener 吃内部 id——stableId 直喂=TE 永不建(深链
      //  审计链B定谳)。helper 回查键=域污染哨兵。
      registerModTileEntity(modId, tileInternalOf(tileKey), tileKey, spec as never);
    },
    biomeFlag(flag: string, spec: { tiles: string[]; threshold?: number; depth?: { min: number; max: number }; xDist?: number }): void {
      const tidF = (k: string) => {
        const full = k.startsWith('mod_') ? k : `mod_${modId}_${k}`;
        const v = alloc.tiles.get(full);
        if (v === undefined) throw new Error(`[mod-api] biomeFlag 引用未注册 tile: ${k}`);
        // ★2026-10-14 域修正:counts 键=内部 id(SceneMetrics `counts.set(st.type[i])`)
        return tileInternalOf(k);
      };
      registerModBiomeFlag({
        flag,
        tileIds: spec.tiles.map(tidF),
        threshold: spec.threshold ?? 40,
        ...(spec.depth ? { depth: spec.depth } : {}),
        ...(spec.xDist !== undefined ? { xDist: spec.xDist } : {}),
      });
    },
    // ★一百三十七刀:NPC 出生 stats 修正(复仇/死亡 HP 乘表消费)
    npcSpawnStats(fn: (vanillaId: number, stats: { lifeMaxScale: number }) => void): void {
      registerModNpcSpawnStats(modId, fn);
    },
    // ★一百三十九刀:vanilla AI 覆盖(ids 集批量注册)
    vanillaNpcAi(ids: number[], fn: (e: unknown, game: unknown, player: unknown) => void): void {
      for (const id of ids) registerVanillaNpcAi(id, fn as Parameters<typeof registerVanillaNpcAi>[1]);
    },
    // ★两百一十七刀:mod 侧物品掉落生成
    spawnItem(game: unknown, itemId: number, x: number, y: number, stack = 1): void {
      void import('../entities/ItemDrop').then(({ ItemDrop }) => {
        const g = game as { entities: { add(e: unknown, bucket: string): void } };
        g.entities.add(new ItemDrop(x, y, itemId, stack), 'drops');
      });
    },
    // ★异步构造:动态 import ModProj(与 loader 的 entry 动态装载同型);AI 每 tick
    //  调用高频路径,import 缓存后 microtask 内落桶,同 tick 内稍后帧可见=可接受
    spawnProj(game, key, x, y, vx, vy, damage, knockback = 2, ownerIsPlayer = false) {
      const full = key.startsWith('mod_') ? key : `mod_${modId}_${key}`;
      const pid = alloc.projs.get(full);
      if (pid === undefined) throw new Error(`[mod-api] mod ${modId} 引用未注册弹幕: ${key}`);
      const g = game as { entities: { projectiles: Array<{ projId?: number; dead?: boolean }>; add(e: unknown, bucket: string): void } };
      // ★五百八十二:holdout 同型独占(C# Player.CantUseHoldout 语义——channel 期
      //  重入 itemUse 不叠弹;释放存续期同在册=同样拦)
      if (ownerIsPlayer && modProjSpecOf(pid)?.holdout) {
        // ★619-R3F7:ownerIsPlayer 限定(联机远端傀儡弹 projId 同但 host 权威不可拦)
        if (g.entities.projectiles.some((q) => !q.dead && q.projId === pid
          && (q as unknown as { ownerIsPlayer?: boolean }).ownerIsPlayer !== false)) return;
      }
      void import('../entities/ModProj').then(({ ModProj }) => {
        g.entities.add(new ModProj(x, y, vx, vy, damage, knockback, pid, ownerIsPlayer), 'projectiles');
      });
    },
    // ★多段体节通道(rivals 批):key→分配 id→**Enemy.fromVanilla**(占位 ctor 不自载
    //   def——'v_*' key 只是占位,必须 fromVanilla 覆写;与 debugSpawnNpc 同链);
    //   主 AI 侧用唯一性旗防重复派生
    spawnNpc(game, key, x, y) {
      const full = key.startsWith('mod_') ? key : `mod_${modId}_${key}`;
      const nid = alloc.npcs.get(full);
      if (nid === undefined) throw new Error(`[mod-api] mod ${modId} 引用未注册 NPC: ${key}`);
      const g = game as { entities: { add(e: unknown, bucket: string): void } };
      void import('../entities/Enemy').then(({ Enemy }) => {
        g.entities.add(Enemy.fromVanilla(nid, x, y), 'enemies');
      });
    },
    config: {
      get: (key) => config.get(key),
      set: (key, value) => config.set(key, value),
    },
    log(...args) { console.log(`[mod:${modId}]`, ...args); },
  };
}
