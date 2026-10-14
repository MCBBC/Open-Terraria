/**
 * SandboxWorld Mod API 类型声明(2026-10-04 P4;★D19-F11 2026-10-13 全量对齐)
 * ============================================================
 * 供 mod 工程 TS 开发用(与引擎 src/mods/api.ts ModContext 手写镜像;
 * 引擎侧为权威——升级引擎后请随批章更新本文件)。
 *
 * 用法:放到 mod 工程根,tsconfig `"include": ["mod-api.d.ts", "scripts/**/*.ts"]`。
 * entry.js 可用 TS 编写(esbuild/tsc 打包为单文件 main.js 后随 .swmod 分发)。
 *
 * ★渲染尺寸语义(2026-10-14,R-C-F10):content/npcs 的 width/height 仅定义【命中盒】
 *  (碰撞/攻击判定),渲染=贴图【整幅 1:1 绘制】(frames=1 时无缩放无裁切)——
 *  声明 48×48 的 NPC 配 224×144 贴图会画出 224×144 全图。要小体型=贴图本身缩小。
 *  帧表:贴图宽=单帧宽,高=frames×单帧高(竖排),帧选择=(ageTicks/frameRate)%frames。
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
  /** 右键使用态(0=左键/2=右键) */
  altFunctionUse: number;
  /** 返回 true=已消费(updateUse 立即返回;useTime 节奏自管) */
}

export declare interface ModProjLike {
  x: number; y: number; vx: number; vy: number; w: number; h: number;
  projId: number; damage: number; knockback: number; pierce: number;
  dead: boolean; ageTicks: number;
  kill(): void;
}

/** ★D19-F11:受限自绘算子面(ModDrawCtx 镜像;Renderer.buildModDrawCtx 产) */
export declare interface ModDrawCtx {
  draw(img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
    o?: { rot?: number; alpha?: number; mirror?: boolean }): void;
  /** A=0 纯加性('lighter';拖尾/光晕族) */
  drawAdd(img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
    o?: { rot?: number; alpha?: number; mirror?: boolean }): void;
  tinted(img: ImageBitmap | HTMLImageElement | HTMLCanvasElement,
    rgb: readonly [number, number, number]): HTMLCanvasElement | null;
  lightAt(tx: number, ty: number): readonly [number, number, number];
  readonly light: readonly [number, number, number];
  worldToScreen(wx: number, wy: number): readonly [number, number];
  readonly gtW: number;
  readonly cx: number;
  readonly cy: number;
}

export declare interface ModProjSpec {
  update?(p: ModProjLike, game: object): void;
  onHit?(p: ModProjLike, enemy: object, game: object): boolean | void;
  onHitPlayer?(p: ModProjLike, game: object): boolean | void;
  onTileHit?(p: ModProjLike, game: object): boolean | void;
  npcDebuff?: { buff: string; duration: number; chance?: number };
  gravity?: number;
  homing?: number;
  homingDist?: number;
  accelerate?: number;
  boomerang?: { returnTicks: number; accel: number };
  orbit?: { radius: number; omega: number };
  holdout?: {
    manaRate?: number; manaCost?: number;
    shoot?: { proj: string; every: number; vel?: number; atMouse?: boolean };
    onChannelEnd?(p: ModProjLike, game: object): boolean | void;
  };
  lifetime?: number;
  pierce?: number;
  frames?: number;
  frameRate?: number;
  hitRefresh?: number;
  noContactDamage?: boolean;
  tileCollide?: boolean;
  texture: string;
  width?: number;
  height?: number;
  rotateToVelocity?: boolean;
  additive?: boolean;
  fullbright?: boolean;
  overPlayers?: boolean;
  preDraw?(p: unknown, ctx: ModDrawCtx): boolean | void;
  draw?(p: unknown, ctx: ModDrawCtx): void;
  postDraw?(p: unknown, ctx: ModDrawCtx): void;
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

/** ★刀5:mod 全屏后处理 pass(GL 滤镜链最前;lights-and-shadows 首消费方) */
export declare interface ModScreenFxState {
  time: number; dayTime: boolean; worldSurface: number; moonPhase: number;
  colorOfTheSkies: readonly [number, number, number];
  screenX: number; screenY: number; viewW: number; viewH: number;
  playerCx: number; playerCy: number; gravDir: number;
  zoneSnow: boolean; zoneCrimson: boolean; zoneCorrupt: boolean;
  bgAlphaFrontSnow: number; bgAlphaFrontDesert: number;
  snowBgStyle: number; desertBgStyle: number;
}

/** ★TE 梯队:mod tile entity 句柄 */
export declare interface ModTEHandle {
  readonly x: number;
  readonly y: number;
  /** te 全键(mod_<modId>_<key>) */
  readonly key: string;
  state: Record<string, unknown>;
}

export declare interface ModContext {
  readonly id: string;
  /** 接管本 mod NPC 自定义 AI(每 fixedUpdate;共享尾段照走) */
  npcAi(key: string, fn: (e: any, game: any, player: any) => void): void;
  /** 本 mod 物品左键使用(返 true=已消费) */
  itemUse(key: string, fn: (ctx: ModUseCtx) => boolean): void;
  /** B6:本 mod 物品近战命中敌怪钩(受理命中后;ModItem.OnHitNPC 形) */
  onHitNpc(key: string, fn: (e: unknown, game: unknown, ctx: { damage: number; crit: boolean; killed: boolean }) => void): void;
  /** B6:本 mod NPC 死亡钩(击杀单口) */
  onNpcDeath(key: string, fn: (e: unknown, game: unknown) => void): void;
  /** ★四百七十刀:通用命中钩(任何玩家来源伤害受理后;免役帧拒收不进) */
  onHitAny(fn: (ctx: Record<string, unknown>) => void): void;
  /** ★二百八十七刀:mod 刷怪池独占面(pool.Clear 语义;null=不接管) */
  spawnPool(fn: (ctx: { game: unknown; player: unknown }) => Array<Record<string, unknown>> | null): void;
  /** ★三百零一:mod 配方组注册(假 id=1010000+;items=vid∪mod item 键) */
  recipeGroups(defs: Array<{ name: string; items: Array<number | string> }>): void;
  /** ★三百十五:菜单主题面(logo/background=pack 相对路径) */
  menuTheme(spec: { logo?: string; background?: string; cinderTex?: string; music?: string }): void;
  /** BGM 面:注册曲目(pack 相对路径;返回槽位 id 5000+) */
  music(key: string, file: string): number;
  /** BGM 面:Boss 换曲绑定(npc=mod npc 键或原版 id) */
  bossMusic(npc: number | string, music: string | number): void;
  /** ★三百二十一:群系曲绑定(flag=sw.biomeFlag 注册旗名) */
  biomeMusic(flag: string, music: string | number,
    opts?: { priority?: 'environment' | 'biomeHigh' | 'bossMedium' }): void;
  /** ★三百二十二:AI 期音乐直写(每帧调=本帧覆写压一切) */
  setMusic(id: number): void;
  /** mod 曲键→槽位 id(fail-loud) */
  musicIdOf(key: string): number;
  /** B6:播原版 SoundID 键音效(位置可选) */
  playSound(files: string[], volume?: number, x?: number, y?: number): void;
  /** 声明弹幕追加代码钩(★刀2-C2:自绘三钩) */
  projectileHook(key: string, hooks: {
    update?(p: ModProjLike, game: any): void;
    onHit?(p: ModProjLike, enemy: any, game: any): boolean | void;
    onHitPlayer?(p: ModProjLike, game: any): boolean | void;
    onTileHit?(p: ModProjLike, game: any): boolean | void;
    onChannelEnd?(p: any, game: any): boolean | void;
    preDraw?(p: unknown, ctx: ModDrawCtx): boolean | void;
    draw?(p: unknown, ctx: ModDrawCtx): void;
    postDraw?(p: unknown, ctx: ModDrawCtx): void;
  }): void;
  /** ★刀2-C2:本 mod NPC 自绘(preDraw 返 false=跳原版本体段=mod 全权) */
  npcDraw(key: string, spec: {
    preDraw?(e: unknown, ctx: ModDrawCtx): boolean | void;
    postDraw?(e: unknown, ctx: ModDrawCtx): void;
  }): void;
  /** ★刀2-C2:本 mod 物品世界自绘 */
  itemDraw(key: string, spec: {
    preDrawInWorld?(d: unknown, ctx: ModDrawCtx): boolean | void;
    postDrawInWorld?(d: unknown, ctx: ModDrawCtx): void;
  }): void;
  /** ★刀1:游戏内 UI 面板(vui 保留树晋升;拖拽标题栏/关闭钮/Esc 关最上层/
   *  世界输入自动让位+DOM 吞门。同键重开=聚焦既有面板) */
  ui: {
    panel(key: string, opts: {
      title?: string; x?: number; y?: number; width: number; height: number;
      draggable?: boolean; closable?: boolean;
      /** ★D15:全屏页宿主(IngameFancyUI 同位)——可见期 uiBlocking=true+整屏让位;
       *  Esc 仍关最上层 */
      fullscreen?: boolean;
    }): {
      readonly key: string;
      readonly visible: boolean;
      addText(text: string, o: { x: number; y: number; scale?: number; large?: boolean }): void;
      addButton(text: string, o: { x: number; y: number; w?: number; h?: number; onClick: () => void }): void;
      /** ★第五批:物品槽(mod 自管库存;atlasIconForKey 物品图标) */
      addSlot(o: { x: number; y: number; getItem(): { key: string; stack: number } | null; onLeftClick?: () => void; onRightClick?: () => void }): void;
      /** ★D15:mod 贴图(tex=pack 相对路径,须落 textures/ui/*.png 约定目录;
       *  scale=整图缩放,或 w+h=盒适配) */
      addImage(o: { x: number; y: number; tex: string; scale?: number; w?: number; h?: number }): void;
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
  /** ★B/C 批:全局 NPC 钩(tML GlobalNPC 形;全域 NPC 含原版) */
  globalNpc(spec: {
    preAi?(e: object, game: object): boolean | void;
    postAi?(e: object, game: object): void;
    incomingHit?(e: object, ctx: { value: number }): number | void;
    onHitByAny?(e: object, ctx: { damage: number; crit: boolean; killed: boolean; projId: number }): void;
    onKill?(e: object, game: object): void;
  }): void;
  /** ★第四批:玩家外观自绘(drawPlayer 返回后 overlay;ctx.cx/cy=玩家中心世界 px) */
  playerDraw(spec: { postDraw?(p: unknown, ctx: ModDrawCtx): void }): void;
  /** ★第五批:tooltip 修改钩(tML ModifyTooltips 形;itemKey=mod 键) */
  modifyTooltip(itemKey: string, fn: (lines: { text: string; color?: string }[],
    ctx: { key: string; vid: number; rare: number }) => void): void;
  /** 注册 mod buff(本地玩家;onTick 逐 tick) */
  buff(key: string, spec: ModBuffSpec): void;
  /** 系统/世界生命周期钩子(全可选) */
  system(hooks: ModSystemHooks): void;
  /** mod 全屏后处理 pass(GL 滤镜链最前;输出须写 outFbo) */
  screenFx(pass: { id: string; exec: (gl: WebGL2RenderingContext, pipe: object,
    inputTex: WebGLTexture, outFbo: object, w: number, h: number, state: ModScreenFxState) => void }): void;
  /** 声明式配置读写(mod.json config 表声明键;set 即持久化) */
  config: {
    get(key: string): boolean | number | string;
    set(key: string, value: boolean | number | string): void;
  };
  /** mod 弹幕分配 id(fail-fast) */
  projIdOf(key: string): number;
  /** ★三百三十三:使用条件门(fn 返 false=本拍禁用) */
  canUse(key: string, fn: (ctx: unknown) => boolean): void;
  /** ★四百八十二:mod 套装加成(穿戴三件即亮;tipName/tipText=悬停文本) */
  armorSet(spec: { h: string; b: string; l: string; bonus: Record<string, unknown>;
    tipName?: string; tipText?: string }): void;
  /** ★四百八十三:mod tile 右键钩(fn 返 true=消费右键) */
  tileInteract(key: string, fn: (tx: number, ty: number, game: unknown) => boolean): void;
  /** ★四百八十三:mod 物品键→vid(fail-fast;运行时闭包解析用) */
  itemIdOf(key: string): number;
  /** ★四百八十八:承伤面 thorns 钩(玩家接触受击;反伤自调 e.hurt/spawnProj) */
  playerThorns(fn: (ctx: Record<string, unknown>) => void): void;
  /** ★五百四十八:治疗物使用钩(healLife 消费后派发) */
  healItem(fn: (vid: number, heal: number) => void): void;
  /** ★三百三十五:配饰效果钩(装备期每 tick;UpdateAccessory 同位) */
  accEffect(key: string, fn: (player: unknown, game: unknown) => void): void;
  /** ★四百八十六:配饰效果追加链(同 vid 多闭包,累加器共享) */
  accEffectAppend(key: string, fn: (player: unknown, game: unknown) => void): void;
  /** ★593:mod 闪避掷门(fn→true=本拍闪避成立;单注册) */
  dodgeRoll(fn: (player: unknown, game: unknown, dmg: number) => boolean): void;
  /** ★594:mod 受击钩(伤害落地后;ctx.dmg=实扣;单注册) */
  playerHurt(fn: (ctx: { player: unknown; game: unknown; dmg: number }) => void): void;
  /** ★605:mod 伤害闸(能量盾族;Player.damage 头吸伤;多 mod 连减;单注册) */
  damageGate(fn: (player: unknown, dmg: number) => number): void;
  /** ★606:mod dash 类(slot≥7;shieldSlam=接触伤害) */
  dashType(spec: { slot: number; speed: number; decelMult?: number; shieldSlam?: boolean;
    midDash?(p: unknown, game: unknown): void }): void;
  /** ★609:mod 键位(id=mod:<modId>:<name>) */
  keybind(name: string, defaultKey: string): void;
  /** ★609:mod 键位按下查询(边沿=mod 自管上一帧态) */
  keyDown(name: string): boolean;
  /** ★609:mod parry 窗口门 */
  parryGate(fn: (player: unknown) => boolean): void;
  /** ★611:parry 成功钩 */
  parrySuccess(fn: (player: unknown, game: unknown) => void): void;
  /** ★619:mod debuff 读取面(源敌 mod debuff 逐条转嫁用;副本 Map) */
  readModNpcBuffs(enemy: unknown): Map<number, number>;
  /** ★三百三十九:手持效果钩(手持该物品每 tick) */
  holdItem(key: string, fn: (player: unknown, game: unknown) => void): void;
  /** 给玩家施加本 mod buff(秒;每帧重调=max 合并) */
  playerBuff(key: string, seconds: number, player: unknown): void;
  /** ★四百八十九:给敌怪施加本 mod debuff(max 合并) */
  enemyBuff(e: unknown, key: string, seconds: number): void;
  /** ★四百九十:给敌怪施加原版 debuff(SUPPORTED 表内 33 debuff 生效) */
  enemyBuffVanilla(e: unknown, vanillaBuffId: number, seconds: number): void;
  /** ★四百九十一:弹幕系别探针(projId→系别/null) */
  projClassOf(projId: number): 'melee' | 'ranged' | 'magic' | 'summon' | null;
  /** ★三百六十四:mod buff 免疫(装备期每帧调) */
  playerImmune(key: string, player: unknown): void;
  /** mod NPC 分配 id(fail-fast) */
  npcIdOf(key: string): number;
  /** ★五百八十五:本 mod 弹幕在场计数(召唤体补位门;帧内缓存) */
  ownedProjCount(key: string): number;
  /** ★CalPlayer 基建:玩家侧钩(值链/倍率链/通知链;kind 见引擎 api.ts 注) */
  playerHook(kind: string, fn: (ctx: Record<string, unknown>) => number | void): void;
  /** ★一百零八R2:世界生成 pass 注册(Beaches 后依序) */
  registerGenPass(name: string, fn: (store: unknown, rng: unknown, gs: unknown) => void): void;
  /** ★一百一十六:mod 功能箱解锁条件(fn(world)=true 可开) */
  chestUnlockCondition(key: string, fn: (world: unknown) => boolean): void;
  /** ★一百一十七:mod 群系蔓延注册(tileMap=vanilla sheet→mod tile 键) */
  biomeConversion(spec: { spreads: string[]; tileMap: Record<number, string> }): void;
  /** ★成就域(2026-10-14):mod 成就注册(原版条件状态机直接复用)。conditions:
   *  npcKilled/itemPickup/itemCraft/tileDestroyed=引擎通知自动驱动(keys=mod/
   *  vanilla 键或裸 vid;many=逐 id 独立);custom=mod 自管逻辑直完。 */
  achievement(key: string, spec: {
    title: string; desc?: string; category?: number; icon?: string;
    conditions: Array<{ kind: 'npcKilled' | 'itemPickup' | 'itemCraft' | 'tileDestroyed' | 'custom';
      keys?: Array<string | number>; many?: boolean }>;
  }): void;
  /** ★成就域:mod 成就直接完成(custom 条件消费;幂等;无实例沿=暂存回放) */
  completeAchievement(key: string): void;
  /** ★InfoDisplay 域(2026-10-14):mod 信息栏行(update 逐帧产文本 null=本帧省行) */
  infoDisplay(key: string, spec: {
    label: string;
    update?(game: object): string | null;
    gold?: boolean;
  }): void;
  /** ★TE 梯队(2026-10-14):mod tile entity(tML ModTileEntity 形;绑定本 mod tile。
   *  放置[锚格]自愈建/破坏 onDestroy/逐 tick update/存读 save+load;state 须 JSON-able
   *  [缺省 save=state 直存]) */
  tileEntity(tileKey: string, spec: {
    create?(): Record<string, unknown>;
    update?(te: ModTEHandle, game: object): void;
    onDestroy?(te: ModTEHandle): void;
    save?(te: ModTEHandle): Record<string, unknown> | undefined;
    load?(te: ModTEHandle, data: unknown): void;
  }): void;
  /** ★一百二十:mod 群系旗注册(depth=(y−rock)/h 带;xDist=边缘带绝对距) */
  biomeFlag(flag: string, spec: { tiles: string[]; threshold?: number;
    depth?: { min: number; max: number }; xDist?: number }): void;
  /** ★一百三十七:NPC 出生 stats 修正钩(复仇/死亡 HP 乘表消费) */
  npcSpawnStats(fn: (vanillaId: number, stats: { lifeMaxScale: number }) => void): void;
  /** ★一百三十九:vanilla 敌怪 AI 覆盖(ids=原版 id 集;整支接管) */
  vanillaNpcAi(ids: number[], fn: (e: unknown, game: unknown, player: unknown) => void): void;
  /** ★两百一十七:mod 侧物品掉落生成(ItemDrop 直构) */
  spawnItem(game: unknown, itemId: number, x: number, y: number, stack?: number): void;
  /** ★一百二十二:随机词缀掷(Item.Prefix(-1) 通道;返回词缀 id 0=无) */
  rollPrefixFor(vid: number): number;
  /** 生成 mod 弹幕(ownerIsPlayer=false=mod NPC 弹打玩家) */
  spawnProj(game: unknown, key: string, x: number, y: number, vx: number, vy: number,
    damage: number, knockback?: number, ownerIsPlayer?: boolean): void;
  /** 生成 mod NPC(多段体节/护卫体由主 AI 按需派生) */
  spawnNpc(game: unknown, key: string, x: number, y: number): void;
  log(...args: unknown[]): void;
}

/** entry.js 的 default export 形(main(sw) 同步执行;内容数据一律走 content/*.json) */
export type ModEntry = (sw: ModContext) => void;
