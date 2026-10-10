// Mod 类型面(2026-10-04,P0 L1 数据 mod)。
// 设计锚:game/docs/mod-loader-design.md;基线=session-13 规划(2026-08-11)。
// 能力分层:L1 纯数据(本文件全部类型)/L2 脚本(P1)/L3 白名单补丁(P2+)。
import type { ModTownArrivalSpec } from '../data/vanillaNpcs';

/** mod 清单(mod.json)。id=命名空间,全仓唯一。 */
export interface ModManifest {
  /** ^[a-z][a-z0-9_]{1,31}$;存档/联机 key 与 l10n 命名空间 Mods.<id>.* 由此派生 */
  id: string;
  name: string;
  /** semver x.y.z(解析为数字三元组比较) */
  version: string;
  author?: string;
  description?: string;
  /** mod API 版本(当前 1);引擎不认的 api 拒载 */
  api: number;
  side: 'both' | 'client' | 'server';
  /** 依赖:modId → 版本约束(^1.2.3 前缀式或精确 x.y.z) */
  dependencies?: Record<string, string>;
  /** ★P2:声明式配置表(键→类型+缺省;entry 经 sw.config 读写;面板内联编辑) */
  config?: Record<string, {
    type: 'bool' | 'number' | 'string';
    default: boolean | number | string;
    label?: string;
    min?: number;
    max?: number;
  }>;
}

/** L1 物品内容(content/items/*.json)。字段面=ItemDef/itemfunc/itemcombat/itemstats
 *  三表的 mod 子集——注册时拆写到各运行时表,白嫖原版派发面(updateUse/combatWeapon)。 */
export interface ModItemContent {
  /** mod 内唯一键;运行时全键 = `mod_<modid>_<key>` */
  key: string;
  name: string;
  rare?: number;
  value?: number;
  maxStack?: number;
  /** 战斗面(vanilla-itemcombat 语义)。shoot:数字=原版弹 vid;字符串 `proj:<key>`=
   *  本 mod 声明弹幕(P2,plan 期换算 allocated projId) */
  combat?: {
    damage?: number; knockBack?: number; useTime?: number; useAnimation?: number;
    shoot?: number | string; shootSpeed?: number; mana?: number;
    /** ★P7 红蓝补(M2):弹药流消费面——引擎 rangedAmmoWeapon 读 combat.useAmmo */
    useAmmo?: number;
    melee?: boolean; ranged?: boolean; magic?: boolean; summon?: boolean;
    noMelee?: boolean; autoReuse?: boolean; useTurn?: boolean; crit?: number;
    /** ★三百六十八:右键换弹(altFunctionUse==2 时覆写 combat.shoot) */
  altShoot?: string | number;
};
  /** 功能面(vanilla-itemfunc 语义):工具力/放置/药水/弹药 */
  func?: {
    useStyle?: number; pick?: number; axe?: number; hammer?: number;
    createTile?: number; placeStyle?: number;
    consumable?: number; potion?: number;
    healLife?: number; healMana?: number; buffType?: number; buffTime?: number;
    ammo?: number; useAmmo?: number;
    autoReuse?: number; useTime?: number; useTurn?: number;
    /** B6:宝藏袋开包面(右键/使用消耗,AllOptionsAtOnce+保底语义;item=本 mod 键或
     *  原版 vid 数字串;chance 0-1 缺省 1;全空掷=保底首条×1)。
     *  coins=按 NPC 价值掷币(CoinsBasedOnNPCValue;值=本 mod 键或原版 npcId) */
    bagLoot?: Array<{ item?: string | number; coins?: string | number; min?: number; max?: number; chance?: number }>;
  };
  /** 盔甲/配饰面(vanilla-itemstats 语义)。def=防御;s='h'|'b'|'l';acc=1 功能配饰/0 社交;
   *  life=生命回复(hpPerSec=life/2);dmg 各系/crit 各系/moveMult/endurance=UpdateEquip
   *  加法形(六十六刀;引擎 PlayerEquipStats 同名面,读侧=聚合器环) */
  stats?: { def?: number; s?: 'h' | 'b' | 'l'; acc?: 0 | 1; van?: 1; life?: number;
    dmgMelee?: number; dmgRanged?: number; dmgMagic?: number; dmgAll?: number;
    critMelee?: number; critRanged?: number; critMagic?: number;
    moveMult?: number; endurance?: number;
    /** ★四百八十二刀:盔甲绘制槽序号(套装匹配键;extract-armor 写入,3000+ 段) */
    hs?: number; bs?: number; ls?: number; };
  /** P4:旅程研究所需献祭数(缺省=不可研究) */
  research?: number;
  /** 可放置:目标 tile 键(本 mod tile 键或原版 tile 键 v_<TileID>_*);缺省=不可放置 */
  placeTile?: string;
  /** 贴图(textures/ 下相对路径);缺省=无名占位(灰格) */
  texture?: string;
}

/** mod tile 稳定段上限(B5 扩窗定谳:原 2047=保守帽;全仓审计零 11 位打包——
 *  存档 RLE/联机 tile 通道均 u16(65535)语义,4095 留 4× 余量,u16 内零破坏) */
export const MOD_TILE_STABLE_MAX = 4095;
/** L1 tile 内容(content/tiles/*.json)。稳定 id 走 1030-4095 空闲区(append-only)。 */
export interface ModTileContent {
  key: string;
  name?: string;
  solid?: boolean; platform?: boolean; decor?: boolean;
  /** 多格框架物体(B5b 站点族):framed=true + w/h=占格数;渲染 fw/fh=w/h 同源 */
  framed?: boolean; w?: number; h?: number;
  /** B6:兼用原版站点(AdjTiles 语义;如 CosmicAnvil≈铁砧+秘银砧) */
  adjTiles?: number[];
  /** ★一百一十三刀:功能性宝箱 tile(2×2;开箱 UI/箱实体绑定;loot 走生成期
   *  gs.mods.chests sink) */
  chest?: boolean;
  opacity?: number;
  pick?: number; axe?: number;
  mapColor?: string;
  /** 帧模式:'auto'=8 向融合(需整表),'style'=逐 style 竖帧,'blend'=独立块。缺省 style */
  frame?: 'auto' | 'style' | 'blend';
  /** 贴图表(textures/ 相对路径,Tiles_N.png 同构整表) */
  texture: string;
  /** 单帧尺寸(px);缺省 16×16 */
  frameWidth?: number; frameHeight?: number;
  /** style 数(帧表竖向/横向 style 槽数;缺省 1) */
  styles?: number;
  /** 破坏掉落:本 mod 物品键;缺省=不掉落 */
  dropItem?: string;
  /** ★B7 七十八刀:树数据面(GrowsOnTileId 生长锚/树苗 tile 键;引擎树砍链接=余段) */
  growsOn?: string | null;
  sapling?: string | null;
  /** ★一百零八审计修:群系旗声明(键→'astral'/'sulphurous' 等;装载期注册
   *  registerModBiomeFlag,SceneMetrics 派生 modBiomes 旗) */
  biomeFlag?: string;
}

/** L1 NPC 内容(content/npcs/*.json)。原版 VanillaNpc 形子集;id 走 800+。
 *  aiStyle 复用原版已移植 AI 核(Enemy.ts switch);自定义 AI=L2。 */
export interface ModNpcContent {
  key: string;
  name: string;
  aiStyle: number;
  lifeMax: number;
  damage: number;
  defense: number;
  knockBackResist?: number;
  width?: number; height?: number;
  frames?: number;
  /** 行走帧回卷上界 extra(ExtraFramesCount 语义;仅 townNPC 消费)。
   *  缺省启发式 max(2, frames−16)——人形族 14 帧行走区(2..frames−extra−1)惯例;
   *  自制帧表请显式声明(frames=26 → 10) */
  extraFrames?: number;
  scale?: number;
  friendly?: boolean; townNPC?: boolean;
  noGravity?: boolean; noTileCollide?: boolean;
  critter?: boolean;
  HitSound?: string;
  DeathSound?: string | null;
  /** 价值(金币掷,原版 npcvalue 语义) */
  value?: number;
  /** 简单掉落表(chance 0-1;缺省 1)。item:本 mod 物品键 或 原版 vid 数字串(P7)。
   *  bossBag:1=专家档掉袋(BossBag=DropBasedOnExpertMode(DropNothing,1×bag);零值袋) */
  drops?: Array<{ item: string | number; min?: number; max?: number; chance?: number; bossBag?: number }>;
  /** ★CalPlayer 基建(六十四刀):接触命中玩家施加 debuff(OnHitPlayer AddBuff 形;
   *  buff=本 mod sw.buff 键,duration=秒,chance 0-1 缺省 1;实扣>0 才授) */
  onHitPlayer?: { buff: string; duration: number; chance?: number };
  /** ★B7 一百零八刀:自然生成行(zone=vanilla 群系键;water=水域门;mult=权重倍;
   *  无声明=不自然刷。灾厄群系门件=世界生成接入后启用) */
  spawn?: { zone?: string; water?: boolean; mult?: number; maxCount?: number; depth?: { min: number; max: number }; requireFlags?: string[]; blockFlags?: string[] }
    | Array<{ zone?: string; water?: boolean; mult?: number; maxCount?: number; depth?: { min: number; max: number }; requireFlags?: string[]; blockFlags?: string[] }>;   // ★二百八十八刀:多规则 OR 档(PerforatorCyst 三层血量门族)
  /** ★P8:Boss 位(血条/Boss 槽/掉落锚定;三消费点 VANILLA_BOSS_IDS.has 直亮) */
  boss?: boolean;
  /** ★P8:SetDefaults alpha 语义(出生透明度/渐显;透传 VanillaNpc.alpha) */
  alpha?: number;
  /** ★P8:behindTiles(钻地族被前景方块遮挡;透传 VanillaNpc.behindTiles) */
  behindTiles?: boolean;
  /** ★P8:蠕虫链声明(头条目专用;body×bodyCount + tail,原版 87/454 spec 同构)。
   *  声明后自然生成/F6/召唤三条建链路自动建链(mod 头 800+) */
  worm?: { body: string; tail: string; bodyCount: number };
  /** 贴图(textures/ 相对路径;NPC_<id>.png 语义) */
  texture?: string;
  /** 头贴(textures/ 相对路径;24×24,NPC_Head_{idx} 语义——住房UI行/地图图标/旗帜)。
   *  仅 townNPC 消费;索引由注册面自增分配 */
  head?: string;
  /** 对话头像(textures/ 相对路径;Detailed 模式 <img> 用,mod 包内 png 走 blob
   *  objectURL;CloseUp/Retro 用本体帧 0 现算,与本字段无关) */
  portrait?: string;
  /** 入驻条件(townNPC 消费;全缺省=不在场即候选;条件 AND) */
  arrival?: ModTownArrivalSpec;
}

/** P2 弹幕内容(content/projectiles/*.json)。数据 spec=ModProj 内置缺省行为参数;
 *  代码钩(update/onHit 族)经 entry 的 sw.projectileHook 追加。projId 2000+ 段。 */
export interface ModProjContent {
  key: string;
  /** 贴图 textures/ 相对路径(Projectile_<projId>.png 语义) */
  texture: string;
  gravity?: number;
  lifetime?: number;
  /** 穿透次数(缺省 1;≤0=无限) */
  pierce?: number;
  tileCollide?: boolean;
  width?: number;
  height?: number;
  rotateToVelocity?: boolean;
  /** ★三百三十:追踪 profile(homing accel/距离门;分类器回填) */
  homing?: number;
  homingDist?: number;
  /** ★三百五十一:holdout(channel 魔耗面;声明面直通) */
  holdout?: { manaRate?: number; manaCost?: number };
}

/** P3 商店上架(content/shops.json)。npcId=原版 NPC id(城镇商);price 缺省=物品
 *  value(与原版 shopstock price:null→value 语义同相)。 */
export interface ModShopContent {
  npcId: number | string;   // ★三百十七:string=npcKey(解析走 allocation.npcs)
  items: Array<{ item: string | number; price?: number }>;
}

/** L1 buff 内容(content/buffs/*.json)。BuffType 运行时追加域(9000+ 伪 vanilla);
 *  声明面=名称/贴图/debuff 位;Update 逻辑=代码钩(B6 OnHit/弹幕 debuff 连锁前置)。 */
export interface ModBuffContent {
  key: string;
  name?: string;
  /** 图标(textures/ 相对路径;必填——buff 栏全链依赖) */
  texture: string;
  /** B6 数据面:NPC 侧每秒伤害(dot;OnHit/弹幕 debuff 施加后的可见效果) */
  npcDps?: number;
}

/** L1 配方(content/recipes.json)。VanillaRecipe 形(vid 域=本 mod 物品 stable id/
 *  原版 vid 混用——配方消费面按内部 id 求值,mod stable id 天然同域)。 */
export interface ModRecipeContent {
  create: string;            // 本 mod 物品键
  createStack?: number;
  /** 站点:原版 TileID(-1=徒手);或本 mod tile 键 */
  tile?: number | string;
  items?: Array<{ item: string; stack: number }>;   // item=本 mod 键或原版 vid 数字串
  /** 原版物品材料:vid 数字(与 mod 键混用) */
  vanillaItems?: Array<{ id: number; stack: number }>;
  water?: boolean; honey?: boolean; lava?: boolean;
}

// ================= ID 分配域(design.md §2) =================
/** mod 物品 stable 段基址(plan-A 恒等域扩展段;硬顶 65535=Uint16Array 上限) */
export const MOD_ITEM_STABLE_BASE = 30000;
/** mod tile stable 段基址(PRIV_TILE_STABLE 表尾 1029 之后;硬顶 2047) */
export const MOD_TILE_STABLE_BASE = 1030;
/** mod NPC id 段基址(原版 Count=697;成就门 vanillaId<697=原版域边界) */
export const MOD_NPC_ID_BASE = 800;
/** mod 弹幕 projId 段基址(原版 1457 至 1135;2000+ 留缓冲;弹域无硬表上限——
 *  Arrow/碰撞/绘制全按值查表,缺表=默认行为) */
export const MOD_PROJ_ID_BASE = 2000;
/** mod buff 伪 vanillaBuff 段基址(BuffType 运行时另配;图标键 Buff_<伪id> 走
 *  mods/buffs.ts 的 objectURL 覆盖,不落 /sprites/vanilla) */
export const MOD_BUFF_VANILLA_BASE = 9000;

/** id 分配快照(确定性:拓扑序 + mod id 字典序 + mod 内键字典序) */
export interface ModIdAllocation {
  /** 全物品键 `mod_<modid>_<key>` → stable id */
  items: Map<string, number>;
  /** 全 tile 键 `mod_<modid>_<key>` → stable id */
  tiles: Map<string, number>;
  /** 全 NPC 键 `mod_<modid>_<key>` → npc id */
  npcs: Map<string, number>;
  /** 全弹幕键 `mod_<modid>_<key>` → projId(P2;2000+ 段) */
  projs: Map<string, number>;
  /** 全 buff 键 `mod_<modid>_<key>` → 伪 vanilla id(B6 声明 buff;9000+ 段) */
  buffs: Map<string, number>;
}

/** 注册计划(plan 纯数据 → register.ts 消费;loader 与数据模块解耦) */
export interface RegistrationPlan {
  mods: Array<{ manifest: ModManifest; pack: ModPack }>;
  /** 拓扑序(依赖在前) */
  order: string[];
  allocation: ModIdAllocation;
  itemSpecs: Array<{ modId: string; spec: ModItemContent; stableId: number; fullKey: string }>;
  tileSpecs: Array<{ modId: string; spec: ModTileContent; stableId: number; fullKey: string }>;
  npcSpecs: Array<{ modId: string; spec: ModNpcContent; npcId: number; fullKey: string }>;
  projSpecs: Array<{ modId: string; spec: ModProjContent; projId: number; fullKey: string }>;
  shops: Array<{ modId: string; spec: ModShopContent }>;
  recipes: Array<{ modId: string; spec: ModRecipeContent }>;
  /** B6:声明 buff 计划(确定性伪 vanilla id 已分配) */
  buffSpecs: Array<{ modId: string; spec: ModBuffContent; pseudoVanilla: number; fullKey: string }>;
}

/** 解析后的 mod 包(zip 展开) */
export interface ModPack {
  manifest: ModManifest;
  /** 相对路径(如 'content/items/sword.json'/'textures/x.png')→ 字节 */
  files: Map<string, Uint8Array>;
}

/** 装载结果(UI 面板/日志/存档头消费) */
export interface ModLoadResult {
  loaded: Array<{ manifest: ModManifest; counts: { items: number; tiles: number; npcs: number; projs: number; recipes: number; buffs: number } }>;
  errors: Array<{ modId: string; error: string }>;
  allocation: ModIdAllocation | null;
}

/** 存档头 mod 清单项(serialize SaveData.mods 可选键)。
 *  ★P5 id 平移完整解:itemIds/tileIds=存档期分配映射(fullKey→stableId)——读档
 *  构建 savedStable→currentStable 重映射,卸/换前排位 mod 时后位 mod 内容不错位
 *  (缺键=内容已移除→既有 ??0 占位语义)。 */
export interface SaveModEntry {
  id: string;
  version: string;
  items: number; tiles: number; npcs: number;
  itemIds?: Array<[string, number]>;
  tileIds?: Array<[string, number]>;
}
