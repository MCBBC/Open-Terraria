# 全量"近似/未接/登记"代码审计（2026-08-18）

方法：grep 全 src/（365 文件）注释标记（近似/登记/暂不/未接/未实装/GAP/等价边界/
TODO 族），剔除历史叙述（"曾/旧/已废"）与功能性命名，按当前仍生效的缺口归类。
TODO/FIXME/XXX/HACK 零真命中（两个标识符误报）。

## 总量

| 级 | 条数 | 定义 |
|---|---|---|
| A | 35 | 功能完全缺失，玩家可感知 |
| B | 110 | 行为简化/数值近似 |
| C | 36 | 纯视觉/音效 |
| D | 19 | 多人/存档/秘密种子边角 |

## A 级 35 条（按主题聚类）

### 引擎级系统缺失（8）
- ✅(2026-09-10 SW-FX18 复核定谳=平行批已实装) 坐骑装备槽 UI — MobileControls:289——miscRail 五槽(宠物/光源/矿车/坐骑/抓钩 context 19/20/18/17/16)+miscSlotAccepts 分类门(ItemSlot.cs:1305-1317)+quickMount miscEquips[3] 优先(Player.cs:6174-6187)+serialize v4/plr 持久化;守卫测试=tests/sw-fx18-mount-slot
- ✅(2026-09-10 SW-FX18 定谳+实装) 高尔夫球车坐骑 — Game:4659——★登记 ID 有误:3611=宏伟蓝图 WireKite(ItemID.cs:8768,接线工具,已在库);真身=高尔夫球车钥匙 4264(ItemID.cs:10074,Item.cs:36676 mountType=17)+mount 17 GolfCartSomebodySaveMe(MountID.cs:68,非 Cart 集不上轨)。本批补齐:UpdateFrame_GolfCart 前倾副帧 0↔2(:4614-4647)+车轮尘(:4661-4662/:4710-4742)+车头灯锥光+Extra_96 第 4 行纯加法灯辉层(:4685-4703/:6043-6054);EmitGolfCartSmoke(:4667)=原版死码不移植(登记);GolfState 3611 误注正名。数据链(高球手 3208 出售/ITEM_TO_MOUNT/buff 212/Extra_96·97 贴图)平行批已在。测试=tests/sw-fx18-golf-cart(14 测+5 变异红)
- ✅(2026-08-30 孤儿武器 B3 波实装;2026-09-10 SW-FX17 四层语义复核收口) 虚空袋 VoidBag bank4 路径 — Game:5505(旧行号已漂)——①槽域: banks[3] 40 槽/chest==-5 面板/透镜 734(containerIndex=-5)+tile 491 支;②存读档: SaveFile banks[3] 全字段+PlrImport favorited≥255/voidVaultInfo 字节;③打开距离门: ClosestPointInRect+Simple 射程(petInRange)+T2 出射程关面板;④吸入: 满背包溢流 depositIntoVoidVault(CanVoidVaultAccept=questItem∪3822 拒)+quick-stack/LootAll/recipe 四消费臂。测试=tests/sw-fx17-voidbag-bank4(四层矩阵+三路内存变异)
- 涂层系统（4668/5344 物品惰性）— Game:10259 / Paint:19
- ✅(2026-09-10 SW-FX18 复核定谳=平行批已实装) 公告盒牌面文字编辑 UI — devices:872——tileSign 族{55,85,425,573}(Main.cs:10220-10223)右键→openSignEditor 懒建(Sign.cs:45-59)→UI.showSignDialog 读/编辑双态(NPCInteractions.cs:20-39 inter[47]/[48])→setSignText 写回(Sign.TextSign);devices.ts 过时登记注已销。守卫测试=tests/sw-fx18-announce-achievements
- ✅(2026-09-10 SW-FX18 补齐双入口;面板平行批已实装) 成就页 UI — UI:2859——面板(分类过滤/进度条/137 行/弹窗定位)+Advisor 卡已在;本批补原版两入口:标题主菜单第三钮(Main.cs:49733 menuMode 0 menu[131])+游戏内设置左列(IngameOptions.cs:292-298 OpenAchievements),AchievementsHost 结构化双宿主(标题屏走 __swAchievements 菜单级桥)。测试=tests/sw-fx18-announce-achievements+探针 scripts/_swfx18_entries.mjs
- ✅(2026-08-19 E批) FlexibleTileWand 全族 30 件落地 — src/world/FlexibleTileWands.ts（五表机械提取 flexible-wands.json：弹药合桶+per-option tile）+Game.tryPlace 接线（背包首桶选样/cycleOffset 模容量/↑↓ 循环/弹药消耗门）；tests/flexible-wands 9 绿
- 反重力 gravDir — Game:5860（SmartCursor 同口径恒 1）

### 怪物/ Boss 行为（7）
- ✅(2026-08-18 B3批) 食人鱼枪行为层
- ✅(2026-08-18 B批) 教徒龙首/鱿鱼头召唤已接 — 仪式圈 age==300 召 454（455-458身+459尾，realLife 共享头 10000 血，渐显段 :51379-51400）/ 521；455-458 数据补齐+454 对齐 1456（100/15/10000）
- ✅(2026-08-18 A批) 火星死光 447 实体化 MartianDeathray（AI_079 :29714-29798 垂直光束锚定 392/395）
- ✅(2026-08-18 B批) 宝箱怪引导链 — fairyAI 状态 2-7 + fairyTreasureCoords（FAIRY_LURE_SHEETS 优先级表+oreFinder frameX 门）
- ✅(2026-08-18 B批) 书怪 693/694 全链落地 — 694 AI_010 多状态机（伪装3/觉醒4/冲刺链/咒球链+帧机）/ 693 贴书传送 NearBooks；spawner 1/8→694(伪装态)+1/10→693 于书位出生；书掉落链（frameX90→vi_165 水术/其余 vi_149）+放置帧随机+桌面锚点门
- ✅(2026-08-17 遗留批) 星尘细胞孵化链 — 弹 540 星尘标记 AI_103+BFS 世代链
- ✅(2026-08-18 A批) 魂镰 3006 SoulDrain — buff 107 枚举+1100px 扫描+Game 侧计数链
- ✅(2026-08-18 A批) 弹 655 蜂巢反弹+裂蜂链 / 608 追踪报复弹实体化

### NPC/商店（5）
- ✅(2026-08-18 B4批) 许可证商店+城镇宠物三族
- ✅(2026-08-18 C批) {Bartender} 走 townName(tavernkeep) 含名字
- ✅(2026-08-19 E批) RerollVariation 全链 — TOWN_PET_VARIANTS 三族×6（rand(6)+≤100 掷环）；variationIndex 字段+townSheet 变体档 {root}_{Variant}.png（18 张具名贴图）；许可证二用=重掷+名字池+满血+粒子+成功/失败公告；tests/pet-reroll 4 绿
- ✅(2026-08-18 C批核实) 687 BoundTownSlimeYellow 净化粉链已在（applyPowder：解锁旗+TownSlimeYellow+公告）
- ✅(2026-08-18 C批核实) placeSleepingAngler+freeBoundNpc 闭环（放置侧确定性补放，差异登记）

### 战斗/交互（6）
- ✅(2026-08-18 B2批) 狙击镜 zoom
- ✅(2026-08-18 D批) 平台族锤循环+坡面平台楼梯 — Game canPoundTile+四拍循环 1:1；TileCollision.slopeCollide 平台单向门（脚带/方向档/dropThrough/num4 不钳）；渲染楼梯背面填充本就有
- builderAccStatus 开关 UI（喷漆器/致动器三开关恒默认）— Game:10791
- ✅(2026-08-18 B1批) 三家具 buff 效果位已接线
- 鞭 TagEffectState 计数链（310 镰刀标记依赖）— WhipProj:57
- ✅(2026-08-18 D批) 老鼠坐骑 55 爬墙 — WallClimbMovement :21329-21450 非 spiked 支（按向墙+墙延脚下：上-2/下4/松手0.5、fallStart 重置、爬墙期平台穿透 :27777）；重力后钉速

### 物品（4）
- CTF 大宝石 1522-1527/3643（有意：原版不可获取）
- ✅(2026-08-18 C批) vi_5395 注册（tile v_666_poo）+TryToPoop 1:1（移除饱食+叠数=剩余分钟×tier 钳999+OnlyBadLuckExtreme ×1.2+noGrabDelay100）
- ✅(2026-08-18 D批核实) 商店门 25 token 全映射（shopCondOk——数据侧 cond 全集核对零缺）
- ✅(2026-08-18 B2批) 护士折扣+shopHappinessMul

## B 级 110 条（聚类摘要）

- **提取器数据回填近似**（~20）：TileObjectData 锚点表、useTurn 列、essScale、钓具箱 accfx、AllowsWind 墙表、KillWall 掉落表、248 箭音等
- **可见性/范围近似**（~10）：PlayerLOS 50 格、luck 邻域 ±640px、Danger 小集合、AnyDanger 压制、CanHitLine 视线门
- **状态/系统依赖近似**（~25）：回归药水回出生点、MagicConch 落点带、商店折扣、护士排除表、甲虫窗口蓄能、泰坦手套 scale、雕像产怪、ghostHurt、弹幕 AI 族（36/137/425/016）
- **worldgen 残余**（~18）：Webs pass 27、FillWallHoles、巨型蘑菇树、绿洲棕榈 530 段、tile 重力触发链、海洋贝壳/蘑菇树再生、进化 Convert 半表、地牢 Dome 体
- **渲染/光照**（~12）：涂装覆盖固定色、深层漆不分层、ChunkCache 涂色按格、bodyRotation 恒 0、json 缺 589 族

## C 级 36 条摘要

近义 buff 图标（月噬/遮挡/食物三档）、四柱天空 shader、月总眼睛变换、出生紫雾替代、
EmoteBubble 单实体、坡面液体双 pass、光门二值、尘风场/雪计数、5 个 wav 未提取。

## D 级 19 条摘要

秘密种子分支（remix/getGood/Skyblock/notTheBees/FTW 深层）恒 false、多人广播
（液体/拴绳/gore）、killClothier/旗帜计数不落盘、队伍发色剂恒白、WOF 多实体联动备案。

## 已核销确认（防重复排查）

坐椅系统✓ 钩爪✓ 油漆刷/滚/刮✓ 矿车✓ 日食四塔✓ 墓园✓ 鞭主干✓ 哨兵✓ 高尔夫✓
渔夫任务✓ 卖出链✓ 成就内核✓ PvP✓ 联机基础✓ 移动端✓ 尘染料✓ 血条✓ 图鉴✓
（CritterCage:20 与 LeashedCritter 台账口径矛盾——后者"已对齐"为准，笼残余仅 Kite/DrawBubble 两条 C 级）

## 建议优先序（按性价比）

1. **磨刀石/附魔台/战争桌 buff 效果位**（三件家具已可得，效果位 3 行接线）
2. **许可证商店**（三个城镇宠物整族死链 + 成就/图鉴联动）
3. **食人鱼枪行为层**（已有 PiranhaCtl 状态机骨架在 Arrow.ts）
4. **狙击镜 zoom**（配饰已有、门两行）
5. **商店折扣/事件门**（骨架在、查表接）
6. 涂层系统/公告盒编辑/坐骑槽 UI（各自独立批）
