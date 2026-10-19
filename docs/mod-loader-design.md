# SandboxWorld Mod Loader 设计与定谳(2026-10-04)

> 基线:session-13 规划(2026-08-11,`session-archives/sessions/13_260811_…/conversation.part1.md`
> 465-630 行)× 本批四路探法定谳修订。方法论:campaign-playbook(先定谳再动刀;每刀
> 中立性自证;滚动认证;永久守卫)。
> 目标:tModLoader 同型 mod 平台——L1 数据 mod / L2 脚本 mod / L3 白名单补丁(后置)。
> 零破坏铁律:**零 mod 时注册表与运行时行为逐字节恒等**。

## 1. 定谳结论(本批探法,全部带锚)

| 注册面 | 现状 | mod 接入点 |
|---|---|---|
| 物品 | `ITEM_DEFS`(plan-A 后 internal≡stable≡vid,长 20754,稀疏洞纪律全仓既有);`ITEM_BY_KEY` 值=stable;恒等表 `ITEM_STABLE_OF_INTERNAL` 是 `let`(items.ts:2350)+ `ITEM_INTERNAL_OF_STABLE` Map(items.ts:2352) | mod 段 **30000+**(顶 65535);文件尾(plan-A 块后)追加 `registerModItem()`;恒等表按需重建(plan-A ⑤ 同式;`.length` 消费仅 TenthAnniversaryImprove.ts:82 且带 ≥length 守卫) |
| 物品功能/战斗/装备数值 | `FUNC/RAW→TABLE/STATS` 三张运行时 Record(手填补丁先例大量存在);`itemFuncOfVid`/`itemCombat`/stats 访问器按 vid 键查 | mod 条目按 mod vid(=stable id)写同表;白嫖原版派发面(updateUse/useCombatWeapon),**零改派发代码** |
| NPC | `vanillaNpc(id)` 访问器读 `VANILLA_NPCS` 对象(vanillaNpcs.ts:158);`Enemy.fromVanilla` 全链吃 VanillaNpc 形 | mod id **800+**(原版 Count=697;成就门 `vanillaId<697` 即原版域边界);`registerModNpc()` 写注册表对象 |
| tile | `TILE_DEFS` 注册序数组;稳定 id=`PRIV_TILE_STABLE ?? vanilla.sheet`;`TILE_STABLE_OF_INTERNAL`(tiles.ts:1018,`export const` Uint16Array(TILE_DEFS.length))、`TILE_INTERNAL_OF_STABLE`(固定 2048) | mod tile 用 **1030-2047 空闲区**(append-only 纪律);不扩容(联机 tile 通道 u16 语义不动=零破坏决策);`TILE_STABLE_OF_INTERNAL` const→let(消费面仅 4 文件,全为下标读) |
| 配方 | `VANILLA_RECIPES` 数组 + decraft 索引表**模块加载期构建**(vanillaRecipes.ts:53-64) | `registerModRecipes()` 运行时 push;mod 配方一律 `notDecraftable`(decraft 索引晚于 mod 装载,已知限制) |
| 掉落 | `resolveDrops(ctx)` 规则树按 npc id 求值(NpcDrops.ts:698) | P0:mod NPC 掉落=小映射缝;复杂规则树 P1 |
| 贴图 | `vicon(itemId)` **资源包覆盖键 `vanilla/Item_<id>.png` 整图直取**(SpriteAtlas.ts:510-512)优先于图集 | mod 物品贴图=同键注入 vimages,**零改 SpriteAtlas**;tile sheet 走运行时 vmeta 注册缝 |
| l10n | `Mods.SandboxWorld.*` 命名空间已按 tML 惯例在产(510 键);运行时 `Lang.text` 通用路径 | mod i18n 运行时合并进 `Mods.<ModId>.*` |
| 存档 | stable-id 双向查表 `?? 0` 兜底(未知 id 静默归 0=天然占位语义);`serializeSave` 重建对象**未知键不透传** | mod 数据键须显式登记;存档头加 `mods` 清单(可选键,旧端忽略=零破坏);`.plr/.wld` 兼容格式不加段(导出写 0=tML 同款) |
| 联机 | msg21/23 按字符串 key 同步(双端同名即通);msg10/17 tile 裸 internal id;弹幕 kind 枚举带降级矩阵 | mod id 确定性分配(拓扑序+字典序);tile 通道要求双端注册序一致=分配算法确定性;P0 不动 protocol |
| worker | save.worker/worldGen.worker 独立上下文,模块表各自持有 | **worker 桥**:mod 装载后向存活的 SaveClient/WorldGenClient 推 id 映射增量(物品=恒等表扩长;tile=对偶表);懒创建 worker 在 init 握手补发 |
| Electron | preload 最小暴露面(sandbox:true);主进程环回静态服务(main.mjs) | 桌面 mod 目录=主进程挂 `<userData>/mods` 路由(后置);P0 web 通道 zip 导入 KvStore |

## 2. ID 分配(确定性=联机与存档一致性的根)

- 物品 stable:30000 起,按「拓扑排序后 mod id 字典序」逐 mod 分配;mod 内按内容键字典序。
- tile stable:1030 起,同上;NPC id:800 起;上限 2047/65535 硬顶,fail-fast 不静默。
- 分配器输出快照进存档头(mod 清单含每 mod 内容计数),读档校验缺 mod → 静默降级(现状 `?? 0` 语义)。

## 3. 包格式 .swmod(zip)

```
mod.json          清单:id/name/version/api/side/dependencies/content 声明
content/*.json    items/tiles/npcs/recipes(L1 schema 校验,零代码执行)
textures/**.png   独立纹理(运行时注入,绝不写 vanilla.json)
i18n/<lang>.json  Mods.<ModId>.* 键
scripts/main.js   L2 入口(P1)
```

## 4. 装载时序(main.ts 启动链)

```
options.load → Lang.init → [P1]loadModsPhase1(内容注册+id 分配+worker 桥)
→ loadAssets():atlas.load → remaster → resourcepacks → [P2]applyModAssets(atlas)
→ splash → flow.showTitle(mods 面板入口)
```

## 5. 阶段刀序(每刀中立性测试先行)

1. ModLoader 纯核(manifest/pack/topo/loader)+vitest ←—— 本批
2. Registry 注册 API 六件套 + 中立性金标 ←—— 本批
3. 存档身份+worker 桥+round-trip
4. 资产注入+l10n 合并
5. Mods 面板+boot 接线+l10n 键
6. 示范 mod 全链 E2E(物品两件+NPC(原版 aiStyle)+配方+贴图+l10n)
7. final-gate --quick 收口+守恒链零漂移

## 6. 已知限制(P0 边界,登记债)

- mod 自定义弹幕/buff 效果/配饰特效/自定义 AI=L2(P1);P0 弹幕只可引用原版 proj。
- decraft 索引不含 mod 配方(mod 配方强制 notDecraftable)。
- 旅行商/商店货架/图鉴/成就/旅程研究未接 mod 内容(P1+)。
- `?play`/`?quickload` 旁路路径同样走 mod 装载(同链),但 worker 桥失败时 mod tile 存读
  静默降级为空气(`?? 0` 既有语义,不炸)。
