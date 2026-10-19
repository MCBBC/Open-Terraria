# 子系统缺口统一台账(2026-08-20 五路并行审计汇总)

方法:5 路只读审计代理(玩家/世界/物品/NPC/UI联机)对照 Terarria1456 反编译源码 +
wiki md + 2026-08-13 旧台账逐条核销。每条均经我方代码 grep 验证。交叉重复项已去重。

**总量**:L 级 2 项 / M 级 14 项 / S 级 28 项 / N-A(Web 平台不可达)6 项 / 口径纠正 9 项(原版无此系统,勿立项)。

---

## L 级(2)

| # | 缺口 | 依据 | 现状 | 备注 |
|---|---|---|---|---|
| L1 | **渔获匣开箱全族**(26 型号) | Player.cs:7667 OpenFishingCrate(木/铁/金/猩红/腐化/地牢/空岛/神圣/丛林/珍珠木/秘银/山铜/钛金…,普通/困难双档) | ✅已处置(2026-09-10 SW-FX13 复核定谳)——三面全通:26 vid 注册(atlas+VANILLA_ITEM_KEY_BY_ID)/openFishingCrate 开箱引擎=1457 :8052-9336 逐支对拍/匣掉落=vanilla-fishing.json 规则表 26 匣全量(1457 现役走 FishDropsDB.TryGetItemDropType,Projectile.cs:20959,RollItemDropOld :21032 为死码)/UI 右键开包已接(UI.ts tryOpenContainer,CanStack 谓词补 prefix 位)。测试=tests/fishing-crates + sw-fx13-crate-matrix(26 型三面矩阵+掷域校验脚本) | 钓鱼经济闭环最后一环 |
| L2 | **环境转换器族**(Clentaminator 779/5134+溶液 12 种+圣水/邪水/血水 422/423/3477) | Proj aiStyle 31 逐帧 Convert;Item.cs:6267/:6284/:31176 | ✅已处置(2026-09-10 SW-FX13 复核定谳,旧 claim 过时)——消费面四链全接:①溶液喷洒 SolutionProj(1457 Projectile.cs:27160-27259,conv 0-7 + Terraformer size3 + 寿命钳 133,Game.ts:14511)②粉末 10/11/463→conv 11/1/4(Game.applyPowder)③水瓶 69/70/621→conv 2/1/4 size4(Game.ts:15219)④叶绿 conv 8/9/10(WorldEvolution);case0/14-21 引擎早已在库。弹药链=PickAmmo 溶液加法+8 溶液弹药栏准入。conv 12/13 与 14-21 在 1457 本体即零运行时消费=API/生成期档(照抄无罪)。测试=tests/sw-fx13-convert-consumers(弹型表/加法链/消耗门/菱形门几何+变异双红) | 补物品+弹体+case 剩余半区即点亮全族 |

## M 级(14)

| # | 缺口 | 依据 | 现状 |
|---|---|---|---|
| M1 | 保卫勋章货币+商店自定义价 | Chest.cs:2950-3060(酒保 37 件 shopSpecialCurrency/shopCustomPrice) | ✅已处置(SW-FX17 2026-09-10 复核收口+补刀)——此前批次已建全链(src/stats/DefenderMedals.ts+DefenderMedal 条目 37 件/shop-currency.test);本批补刀:消费/储蓄两面取数域对齐五仓(CustomCurrencyManager.BuyItem :76-87 计数+TryPurchasing :88-121 扣款=背包+bank..bank4;旧实现仅扫背包,旧登记「本仓无账本系统」前提随 bank×4 在库失实——存进随身银行的勋章商店读不到)。储蓄显示=bank-only(DrawSavings :28-40)+支付能力=全量双值分流(NpcDialog medalsTotal)。获得面复核:全胜 3/15/60(OldOnesArmy:301=DD2Event.cs:329-340)+进波 1/3/6/11/25(:405-448→checkProgress)+水晶 548 落点(dropAtCrystal)。测试=tests/sw-fx17-defender-medals(54 断言级 23 测+四路内存变异全红) |
| M2 | 物品变体系统(特殊种子) | ItemVariants.cs(Stronger/Weaker/Rebalanced/DisabledBossSummon)+Item.cs 14 处分支 | ✅已处置(SW-FX17 2026-09-10 反编译定谳+复核收口)——定谳=秘密种子物品变体选择器(非 modern 商店/交换面,消费全在数值域:Item.SetDefaults ~24 处 Variant 分支+RefreshItems+DisabledBossSummon 使用拦截),**需建模**(数值域)。本仓 src/data/vanillaItemVariants.ts 投影式建模在库(注册表 25 条/覆写 22 件/world 态灌入 setItemVariantWorld@afterWorldLoad/l10n 五键)+tests/item-variants.test.ts 352 行数值面。本批补反编译金标 oracle:直接解析 1457 ItemVariants.cs 静态构造与仓注册表逐条 diff(漏/多/错种/序漂必红)+1458 逐字节同源钉+消费面四锚(数值取数口/UI 后缀/召唤门/世界态灌入)。测试=tests/sw-fx17-itemvariants-oracle |
| M3 | 聊天命令系统 | Terraria.Chat.Commands/ 14-16 条(Roll/RPS/Emoji/Emote/Help/ListPlayers/PartyChat/Death 系/BossDamage/Say) | ChatInput 纯文本,零斜杠解析 |
| M4 | 玩家表情窗口/轮盘 | UIEmotesMenu(658L,分类网格)+背包角按钮+EmoteID 解锁表 | 仅 NPC 反应表情+单键 emote 149 |
| M5 | 键位重映射(31 action) | PlayerInput.cs:214+UIManageControls | Input.ts 153 行硬编码 e.code |
| M6 | 拍照模式(F4) | Capture/ 5 文件 2439L+QuickScreenshot | 零代码(F1/F2 被调试占用) |
| M7 | Boss 特化血条族(19 类) | BigProgressBar/(EoW 分段/月总四目/四柱盾/Twins 双条…) | ✅已处置(2026-09-10 SW-FX14)——全 15 条类+NeverValid 已 1:1(BossBars.ts,1456=1457=1458 该目录逐字节同);本批勘误 DrawFancyBar 头像落点【双路径】(Helper.cs:80-81 生命重载中心锚 vec+(17,34) vs :147-148 盾量重载 vec+(4,20),旧一刀切使非 26×28 头像偏移,鹿角怪 50×48 达 -12,+10px)+ShowText 数字开关接线(BigProgressBarSystem.cs:76/Pref 键 :74) |
| M8 | 旅程物品浏览器(搜索/过滤/排序/翻页) | UICreativeItemsInfiniteFilteringOptions+SortingSteps+UISearchBar | 平铺网格,内核 1:1 |
| M9 | 旅程力量+研究进度联机同步 | NetCreativePowersModule+NetCreativeUnlocksPlayerReport | 多人房各端各自为政 |
| M10 | 液体联机收敛 | NetLiquidModule(60ms 节流) | protocol 注释"预留(客户端本地)" |
| M11 | 多人敌怪索敌 | NPC.cs:78539 TargetClosest 扫 255 玩家槽 | 恒取房主本地玩家 |
| M12 | 鹿角怪腿段(NPC 621-623) | SetDefaults:16903-16950(aiStyle6 蠕虫段四足) | ✅已处置(2026-08-20 NPC域批)——**口径纠正:621-623=血鳗鱼 BloodEel 三段(NPCID.cs:12307-12311),非鹿角怪腿**;1456 鹿角怪腿已并入本体贴图,AI_124_DeerclopsLeg/DrawNPCDirect_DeerclopsLeg 均为无调用死代码。已补 622/623 数据+wormFollow 链(15身+1尾共享6000血)+链门渐显+头舵机15/0.45+链距24 |
| M13 | 资源包系统 | UIResourcePackSelectionMenu(光标包/字体包) | 无加载链(Web 受限程度待评估) |
| M14 | IngameOptions 杂项排(11 项) | IngameOptions.cs:647-848(反转键/开门偏好/自动连用/物品名/入侵进度/放置预览/高亮新物品/建筑网格/光照模式/不透明提示/对话头像) | ✅已处置(2026-09-10 SW-FX14 收尾)——段内 18 项普查:10 项前批已接(Options.ts M14 组),本批补 4 项=悬停控制(HoverControl :671+锁存 Player.cs:25452-25484+TryingToHover 全消费面)/血条数字(ShowBossLifeText :806)/背包特效(FlashyEffects :833——★1457 全库零消费死设置,保态)/光照模式(LightMode :973-979,★White/Retro/Trippy 走 LegacyLighting 引擎未移植=三档暂同渲登记债);N-A 备案=手柄说明(:754 Web 无手柄提示层)/MapScale 滑条(:770-786 小地图盒 240×MapScale+全图 transform 与本仓独立缩放模型冲突,整挂登记债) |

## S 级(28,按域分组)

**世界(4)**:SlimeSky 天幕层 / MartianSky 天幕层 / 沙尘暴+暴雪全屏色罩(粒子已有色罩无)/ ~~Convert case0+14-21(L2 依赖半区)~~ ✅已处置(2026-09-10 SW-FX13 复核:case 0/14-21 均已在 WorldEvolution.convert,详见 L2 行)
**玩家(8)**:附近箱子快速堆叠(背包侧按钮+三模式)/ 造型师理发服务 / 旋涡潜行幻影分身 / 联觉药水(5101 零消费)/ The Constant 饥饿链 / 开发者套装掉落 / 抚摸宠物特效帧 / 相机修饰器通用栈(+翅膀专属粒子/Eyebrella/GlassSlipper 等视觉小件)
**物品(7)**:奇异植物换染料 / 锁盒+黑曜石锁盒 / 蠕虫罐/牡蛎/麒麟蛋开箱 / 钱槽(飞猪)/ 四叶草幸运装备 / 掉落条件恒假恒真残留 3 条 / 多人 loot 口径
**NPC(5)**:aiStyle 127 Palworld 双宠+NPC696 数据 / 树妖结界 buff 枝(dryadWard)/ HurtingBees NPC 互伤通道 / 图鉴女孩变身态 / 微光之灵自动生成 —— ✅五项全接(2026-08-20 NPC域批;变身条件勘误=血月夜/满月夜狼人态,与图鉴进度无关,TownNPCMood_BestiaryGirlTransformed 分节+对话 Lycantrope 池已通)
**UI/联机(4)**:M 键全屏地图+样式/透明度键族 / 地图 ping+全图箱名 hover / 聊天输入历史+队伍频道+表情 MP 同步 / 图鉴 MP+粒子 MP+环境 MP+晶塔权威模块+玩家列表面板+PvP 背包快切钮+F1-F3 配装热键+自动保存/暂停+光标包+屏幕滤镜着色器+Steam 云(轻件合并)

## N-A(Web 平台不可达,6)

TCP/Steam P2P(WS 替代)/ RGB 外设 53 shader / Steam 好友 Lobby / Steam 成就/富状态 / 创意工坊 / 虚拟键盘(DOM 原生)

## 口径纠正(原版无此系统,勿立项——审计任务清单勘误)

药水袋(1.4.5.6 无)/ Meld 合金 / Item.Combine API / 净化粉范围升级 / 存款利息 / 潮汐 / 洞穴回声独立系统 / 温泉钓鱼 / 虚拟键盘 / Cinematics(原版自身休眠代码,月总演出实际在 NPC.cs AI_077)

## 已查实覆盖(抽样锚点,勿重复审计)

钩爪玩法 1:1(仅链视觉)/ 死亡三档惩罚+墓碑 / 药水延迟 / 研究内核 / 坐骑 64/64 / 床马桶梳妆台 / 信息饰品 12 行 / 仪表盘表情(NPC 侧)/ 全屏地图+小地图 9 框 / 死亡界面 / 旅程力量面板 / 联机架构(strip 流式+AOI+SSC)/ 重铸 / Shimmer 312 对 / 商店进货 23NPC+动物学家图鉴门 / 掉落 626 规则 / 挖掘链 / 钥匙链 / 永久升级全集 / Boss 召唤物全表 / 开包族(Boss 袋/草药/礼盒)/ 粉末族 / NPC 性格快乐度 103 邻居 / 对话 28 分支 / 拜月四塔 / 18 Boss 全链(含 Mechdusa)/ 城镇宠物 / Boss 击杀联动 / 击退 / buffImmune 512 / 旗帜 / 环境音四表 / 战斗文本 / 月总天幕 / 住房 UI / 事件 NPC / 生物群系蔓延+苔藓+树苗 / 环境粒子 17 族 / 云实体 / TileEntities / 高尔夫 / 传送塔 / 四塔+入侵+月事件 / 风全模型 / 派对烟花 / 季节门 / 墓地群系 / 城镇史莱姆 / 沙尘暴生物 / 流星雨 / 绿洲
