# 原版 1456 背包 + 合成系统深度调研与移植方案

> 调研对象：Terarria1456（1.4.5.6）。三个并行调研代理报告汇总。行号均为该反编译源码。

## 一、槽位结构（Player.cs:1352-1476）

### inventory[59]
```
0-9    快捷栏（selectedItem）
10-49  背包主体（10×4，UI 是 10 列×5 行 = 0-49 全画）
50-53  钱币栏（铜71/银72/金73/铂74；UI x=497 scale0.6）
54-57  弹药栏 ×4（UI x=534）
58     Main.mouseItem 的每帧镜像（影子槽，非真实槽）
```

### armor[20]（不是 3-5 时装！）
```
0-2    功能盔甲 头/身/腿
3-7    基础 5 配饰（8 需恶魔之心、9 限大师）
10-12  时装盔甲（镜像 0-2）
13-19  时装配饰（镜像 3-9，index 差 10）
```
- 染料独立：`dye[10]`（0-2 盔甲+3-9 配饰）+ `miscDye[5]`
- 杂项：`miscEquips[5]` = 宠物/光源/矿车/坐骑/钩爪
- `trashItem`（单槽，持久，死亡即清空 Player.cs:53394）
- `hideVisibleAccessory[10]` 配饰可见性勾
- `Loadouts[3]` 三套装备预设（Armor20+Dye10+Hide10）
- bank/bank2/bank3/bank4 = Chest 各 40 格 ✓（我们已有）

## 二、交互语义（Terraria.UI/ItemSlot.cs）

- **左键**：拿起/放下/交换/合并（合并时互换 favorited）；装备槽放 1 个；染料槽校验 dye>0。
- **右键**：背包内 stack==1 可装备物 → **一键装备 SwapEquip**；否则拆堆一次取 1（按住连取，30 帧冷却 RefreshStackSplitCooldown）；时装槽右键 = 功能/时装互换 SwapVanityEquip。
- **Shift+左键**（GetAlternateClickAction :563-662 + OverrideLeftClick :664-800）：开箱→入箱；装备→卸回背包；箱内→入背包；无箱→垃圾桶（覆盖旧内容）；Ctrl+左键=快速丢弃。**favorited 禁止一切快速转移**。
- **Alt+左键**：收藏/取消（仅 context 0/1/2/32），星标边框 InventoryBack10。
- **右键可开袋**：OpenableBag（礼袋）拆袋。
- **重铸**：Main.reforgeItem 槽 context 5，费用 value×stack，Prefix(-2) 保最优档。

### 拾取优先级（Player.GetItem :38657-38736）
1. 钱币先扫 50-53 再 0-49；2. 弹药 FitsAmmoSlot→FillAmmo(54-57)；3. 合并已有堆（先于空槽）；4. 有 useStyle 物品先试快捷栏 0-9；5. 空槽：favorited 升序、普通**降序**（从背包末尾填）；6. 全满→虚空库（IsVoidVaultEnabled）。

### 钱币（DoCoins :38573-38589）
100铜→银/100银→金/100金→铂自动合成（stack==100 时触发，递归）。maxStack：钱币=100，**其余默认 9999**。死亡掉钱：普通掉一半/专家 1/4/**大师不掉**（:53351-53390）。

## 三、合成系统（1.4.5 大重构）

- **2732 条配方**，`Main.recipe[3600]`，单例 currentRecipe+AddRecipe 注册（Recipe.cs:600-15029）。
- **requiredTile 单值**（-1=徒手）+ `TileCountsAs` 继承（秘银砧→铁砧、炼金台→瓶子、玻璃窑→熔炉…Recipe.cs:555-567）。
- **anyX 布尔废除** → **RecipeGroup 32 组**（Wood/Sand/IronBar/Stone/PressurePlate…RecipeGroups.cs），组 id≥1000000 假 id 聚合计数。
- 站点配方量级：工作台 ~614、铁砧 ~281、锯木机 ~231、秘银砧 ~197、远古操纵机 136、工匠作坊 ~129、染缸 120、熔炉 77、织布机 73、烹饪锅 68、重型工作台 69、瓶子(炼金) 62、天空磨 27、固化机 26、水晶球 25、祭坛 23、篝火 9…徒手 300+。
- **可用性每帧重扫** UpdateRecipeList（Recipe.cs:229-258）：adjTile 环境（Player.AdjTiles :35210，±20 格含液体源）× 材料计数（背包 58 格 + **附近箱子** CraftingUI.CraftFromNearbyChests + 组聚合）。
- **执行**（CraftingRequests.cs）：成品**默认进鼠标**（Shift ×10；手柄 quickCraft 直接入包）；炼金台配方 alchemy=true 且 alchemyTable 时**每材料 1/3 概率免费**；连点渐加速 superFastStack。
- **向导反查**：guideItem 槽（context 7）→ CollectGuideRecipes（组匹配生效）。
- **无配方发现/学习系统**（已核实零命中）——全部即时可见。
- 1.4.5 双 UI：Classic 鱼眼列表（scale=100/(|Δy|+100) 下限 0.75，y=410+Δy·s-30·s+adjY，槽距 65，滚动 ±6.5/帧 + 越档音效）+ Modern 网格（490 宽面板，11 类过滤器+搜索栏，材料行 min(11/n,1) 压缩，拥有数绿/红着色）。
- 右键合成站 = 站点过滤器（CraftStationRecipeFilter，离开范围自动关闭，徒手/液体配方照常放行）。

## 四、UI 布局（DrawInventory Main.cs:40443）

- 背包 10×5：`x=20+(i*56)*0.85`（无 inventoryBack 常量，全字面量）；整块命中区 560×280×scale。
- 快捷栏：每格独立 scale 动画（0.75→1.0±0.05/帧），选中=放大+上移 `20+22*(1-s)`+提亮 `75+150*s`；物品名居中第一格上方。
- 钱币 x=497/弹药 x=534（scale 0.6），标签 Coins/Ammo。
- 装备三列 x=sw-92/-139/-186（盔甲/时装/染料），盔甲与配饰间 4px 空隙，配饰可见性小勾 (sw-58, y-2)，防御计数在末配饰格。
- 垃圾桶 (448,258) scale0.85，开箱时 (453,426) scale0.755。
- 箱子 UI（ChestUI.cs）：名称 (504,invBottom) 字号1.5；**按钮 x=506,y=invBottom+40+ID*26**：LootAll(inter[29])/DepositAll(30,仅入箱内不存在类型,跳钱币)/QuickStack(31,只堆已存在类型)/Rename(47,61)；就近堆叠按钮 (498,244)。
- Tooltip：随鼠标 +14（持物 +34）；不透明背景 (23,25,81)×0.925；**稀有度 15 档颜色表**（:20415-20473）；词缀对比行红(190,120,120)/绿(120,190,120)；速度 8 档/击退 9 档文案；价格行。

## 五、我们现状与差距（摸底结论）

| 项 | 现状 | 差距 |
|---|---|---|
| 背包 | 10×4 (0-39) | 缺第 5 行；INV_SIZE=54 布局自创（40-44配饰/45-47盔甲/48-50时装/51-53钱币3种） |
| 钱币 | 3 格无铂金 | 原版 4 格+100 自动合成+死亡按难度掉钱 |
| 弹药/染料/杂项/预设 | 无 | 全缺 |
| 垃圾桶 | UI 层关闭即删 | 原版 trashItem 持久槽（关背包保留、死亡清空） |
| 交互 | 左拖整叠/右拆半 | 缺 Shift 快移/Alt 收藏/右键一键装备/袋拆分/装备槽放 1 个 |
| 箱子 | 仅开合 | 缺 LootAll/DepositAll/QuickStack/重命名/就近堆叠 |
| 合成 | 92 条 4 站点 DOM 平铺 | 原版 2732 条 40+ 站点、组匹配、附近箱取料、鱼眼列表/Modern 网格、向导反查、炼金折扣 |
| 配方数据 | recipes.ts 手写 | 有 3 处重复条目 |
| Tooltip | 固定黄名 | 缺稀有度 15 档色/词缀对比/价格行/越界回推 |

## 六、移植方案（分阶段）

### P0 槽位结构对齐（数据层）
1. Inventory 槽位重排到原版：0-49 背包（10×5）/50-53 钱币×4（含铂金）/54-57 弹药；armor/dye 独立数组；trashItem 持久槽；favorited/prefix 字段加入 ItemDef 实例态。存档迁移（旧 54 槽布局 → 新布局）。
2. 拾取优先级 1:1（GetItem 顺序+FillAmmo+DoCoins 100 自动合成）。
3. maxStack 表修正（默认 9999、钱币 100）。

### P1 交互语义
Shift 快移（开箱入箱/装备卸下/垃圾桶覆盖）、Alt 收藏（星标+禁快移）、右键一键装备+拆 1、装备槽放 1、袋拆分、trashItem 持久化（死亡清空、存档含 trash）。

### P2 箱子系统
ChestUI 三按钮 1:1（LootAll/DepositAll[仅新类型跳钱币]/QuickStack[只堆已有]）+ 重命名 + 就近堆叠按钮 + bank MoveCoins。

### P3 合成系统（大件，拆两步）
1. **配方数据管线**：tools/extract-recipes.mjs 从 Recipe.cs SetupRecipes 解析 2732 条（requiredTile 单值/SetIngredients/RequireGroup/CreateResult 前缀池）→ src/data/vanilla-recipes.json；RecipeGroup 32 组注册表；TileCountsAs 继承表；站点点 AdjTiles 扫描（±20 格）。
2. **合成逻辑**：可用性每帧重扫（背包+附近箱+组计数）、成品进鼠标、Shift×10、炼金 1/3 折扣、向导反查（guideItem）。

### P4 UI（Classic 优先，Modern 可后补）
背包 10×5 原版公式、装备三列右缘、钱币/弹药列、垃圾桶持久、快捷栏缩放动画、箱子按钮、鱼眼合成列表（scale 公式+焦点+滚动）、Tooltip 稀有度色/词缀行/价格行。

### P5 可选
染料系统、杂项装备页、三套 Loadout、重铸（哥布林）、Modern 合成网格、向导对话入口。

## 验证
- 单测：拾取优先级/DoCoins 合成链/Shift 动作分发/组计数/配方可用性（固定背包）。
- 探针：开箱三按钮数据断言、合成列表鱼眼 scale 断言、2732 条配方加载计数。
