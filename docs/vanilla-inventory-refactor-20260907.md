# 背包界面重构为原版 1.4.5.7 布局 —— 批章(2026-09-07/08)

> 方案:~/.claude/plans/compressed-beaming-stonebraker.md(用户批准)。
> 权威:Terarria1457/Terraria/Main.cs DrawInventory 族(逐行锚);几何单源
> `src/ui/vanillaInvLayout.ts`(刀 1,vitest 全公式断言)。
> 架构:双构建器 + `inventoryLayout` flag(缺省 classic → **★SW-FX39 2026-09-11 缺省转正
> 为 vanilla**;classic 退居 `?invlayout=legacy` 回退旗,过渡一个版本后退役,见文末 FX39 节)。

## 已落刀

| 刀 | 内容 | 验证 |
|---|---|---|
| 刀 0 | flag 面:Options.inventoryLayout(缺省 classic+坏值回退+URL `?invlayout=` 会话覆盖不落盘)/Settings 行/12 语言×3 键 | flag 测试 6/6+12 语言产物断言+l10n 双闸 |
| 刀 1 | `vanillaInvLayout.ts` 纯几何(网格/钱币弹药/垃圾桶双位置/2×2 钮/mH 钳/装备区顶+矮屏压缩/三列/配装轨/防御/页签/杂项页/住房页换列/PvP/合成面板/详情浮层/K)+ `SlotActions.selectEquipPageOf`(ItemSlot.cs:4641-4671 分支序 1:1)+ `equipPageCapOf` | 几何/页码 23 断言全绿 |
| 刀 2 | `buildVanillaInventoryPanel` 主体(50 槽网格/标题/Advisor/钱币弹药/垃圾桶/2×2 钮(QuickStack 右键循环 quick↔smart=原版 StackToChestsPreferredMode 本仓映射)/装备三列+追加槽重编号+勾选框列+配装轨+防御/页签/杂项页/PvP/teardown+rebuild)+ 共享守卫 6 处(initInGame 分派/positionInvPanel/refreshHotbar 开包早退/refreshAllNow 补绘/closeInventory 还原刷/构造器 onChange) | 探针 16/16(classic 守恒+vanilla 几何/页签)+classic srcMatch 锁全绿+截图对拍 |
| 刀 3 | EquipPage 状态机(每帧重算+记忆页+SelectEquipPage 自动翻页)/住房页 1:1(查询器 0 号位+NPC 头像列+housingMode 游标直连)/HousingPanel 停车坪入口(暂停菜单)/`housingHeadRows` 抽取共享 | 探针 10/10(住房页/自动翻页/记忆页/live 切换重建)+housing-ui 34 绿 |
| 刀 4 | 现代合成面板:(20,312) 490×(sh-350)+搜索右上+44px 网格滚动+详情浮层(成品槽点击合成/材料行距 34/拥有数绿 144,238,144 红 255,140,160/向导槽直连 guidePlaced 对换) | 探针待跑(机器被并行会话占满,见下) |
| 刀 5 | 停车坪:道具搜索/天气/时间/玩家列表/旅程/研究 → 暂停菜单(vanilla 门控,classic 不传不渲染) | tsc 净;探针待跑 |

## 收官验证(2026-09-08)

- **综合验收探针 22/22 全绿**(`scripts/_vanilla-inv-final-acceptance.mjs`):
  蓝方 16 项=网格起点/钱币弹药/垃圾桶/三列 x/勾选框/配装轨 3 钮/防御计数/PvP 剑/杂项页两列/住房页查询器/合成面板 490×650+网格+详情浮层;
  红方 6 项=面板内零白名单外文本钮/关包热键栏还原/刷新风暴 img 复用 Δ≤3/无页面错误/classic 守恒(40 格+坞+合成列表+配装钮)/classic 无错误。
- 三档视口截图存档:/tmp/vinv-accept-{1280x800,t1-1024x768,t3-844x390}.png(K=1/0.85/0.5 等比缩放)。
- vitest 守卫:vanilla-inv-layout **39/39**(flag 三态/几何全公式/页码分支表/12 语言/结构锁+classic canary)+ housing-ui + sw-au2/sw-ay1/ui-smallpack/l10n-audit 全绿。
- 全量套件:938/949 文件过;18 个失败**全部位于并行会话在途域**(Game.ts 结构锁×2/敌怪 AI/弹幕 AI/plr/音频/Lang token——对方 2026-09-08 01:29 起在改 Game.ts),零个在 本批改动面;详见上节已知红。

## 红蓝对抗 review(2026-09-08,三刃独立审查+定谳清偿)

三刃:几何对勘(反编译逐句)/构建器集成面(git diff+引用链)/横切面(flag 语义/l10n/探针卫生)。

**HIGH(全部清偿)**:
- F1 Options URL 会话覆盖污染用户档:set() 全量序列化把 `?invlayout=` 覆盖值连带落盘。修=persistedLayout 快照+set 剥离+显式 set 更新基准+覆盖块移出 try(隐私模式仍生效);注释/测试/批章假语义三方订正。
- F2 vanilla 构建器无每世界重入卫生:closeAll 清 DOM 不清实例态 → 重进世界布局冻结+住房页空白+resize 监听泄漏+pvpTeamBtns 累积。修=buildVanillaInventoryPanel 首行 teardown;★伴生定谳:`_builtLayout` 登记必须在构建**后**(teardown 会清它——修复过程中实测再踩一次,NUL 哨兵字符一并规范化)。

**MAJOR(全部清偿)**:
- M1 配装轨高=n 钮数(142.8px)→ 可见行数(缺省 8=380px,y=num20+2,截断);M2 详情浮层原点误读内区(+8/+38)→ 面板+(24,73)(GetInnerDimensions=UIState 自身 SetPadding(0));M3 材料行补 −16·num 偏移+全材料压缩(删 slice(0,11) 丢弃,Recipe.maxRequirements=15);
- 集成 MAJOR-1/2 详情浮层两类陈旧化:签名改=当前配方材料实有数+guidePlaced+heldStack(旧 owned.slice(0,40) 截断=远端材料数冻结);MAJOR-3 住房重建滤除旧布局项(原无界增长+死节点求 pos)。

**MINOR(全部清偿)**:m1 mH PushUp 变体 610+关图负钳;m2 队伍格页 2 +46;m3 垃圾桶 52×0.85(旧 44×0.85 双重缩放);m4 住房槽 ×0.85;m5 住房换列全局分数残量(num 不归零,1px 族);MINOR-4 布局签名补 uiScale;MINOR-6 携带 NPC 离场降级查询器;n1 杂项页文字标签摘除(原版零 DrawString);n2 页签 ×0.9;m8b Advisor sw<1000 第二落位;m8c 面板自带切换钮(网格钮 no-op=债#2 顺延,就近箱=真开关);n4 住房 4 列隐 PvP;F3 探针诚实性(伪断言/死指标/头注虚报清理,knife4 选择器修正);F5 结构锁脱敏(去注释后缀);F6 死字段(vinvHousingSlots/vinvCraftSig/ownedText)清除。

**登记不修(note)**:m6 editChest+24(本仓无宝箱重命名概念,N/A);n3 craftCellXY 等模块常量=规格文档用途;n5 钱币标签 y 字宽校正;n6 配方网格底对齐(债);m8a 小地图 4 钮(债,Renderer 域);MINOR-7 搜索零命中回退全量(与 classic 同构,parity 保留);NOTE-8 手持物页码覆盖=原版忠实非竞态。

**清偿后回归**:综合验收探针 **24/24**(新增轨高 380/详情原点 (24,73) 两断言)+ knife3 探针 11/11(live 切换)+ 守恒电池 **10 文件 225/225**(sw-bp1 已被并行会话修复)+ tsc 净。

## 用户实测反馈轮(2026-09-08,刀 9)

用户实玩 `?invlayout=vanilla` 报四处偏差,全部对码确认并修复:
1. **配方格排成单列竖排**(实 bug:vinvBuildCraft 容器漏网格布局)→ 44px 步距 10 列 grid;
2. **槽底无半透** → `.sw-vinv` 作用域缺省 `--slot-alpha:0.575`(与 classic/热键栏同档),hover 全亮;配方格/详情浮层的内联 `--slot-alpha:1` 全部摘除;
3. **合成面板实底背景板** → 改 UIPanel 半透渐变(.sw-panel 同款,PanelBackground×Color(63,82,151)×0.785),弃 invBgDataUrl 实底;
4. **配方悬停无信息气泡** → cells mouseover 走 `showTooltipFor` override 通道(物品搜索面板同款),悬停配方=完整物品 tooltip(稀有度着色/词缀/统计),mouseleave 隐藏。
回归:综合验收探针 24/24(视觉修复后)+ vanilla-inv-layout/housing-ui/l10n-audit 46/46 + tsc 净。(注:私有实例探针在并行会话 load≈19 时世界生成被饿死,复验以用户实玩为准。)

## 用户实测反馈轮 2(2026-09-08,刀 10;用户给出原版参考截图)

用户对照原版实测报四点,全部对码确认并修复:
1. **合成区形态根本性修正**:用户原版参考图证实合成=左下角**竖向列表**(无面板底/无搜索框/无网格)——Modern 网格面板(刀 4)整体退役,重写为经典列表(CraftingUI.DrawRecipesList :161-318 逐式:鱼眼 scale/alpha/x 位移/制作标题/材料行;交互=HoverOverCraftingItemButton Main.cs:42971-43036:点非焦点=居中+音12、点焦点=合成 Shift×10、滚轮滚动)。登记偏差:吸附动画以瞬时重排替代。焦点=0 语义修正(teardown 残留 Modern 时代 -1 哨兵致首配方不聚焦——探针 dbg 实证)。
2. **槽底半透对齐原版 ground truth**:vanilla `inventoryBack=Color(invAlpha)` 且 invAlpha **每拍 ±0.2 脉冲 180↔240**(Main.cs:46460-46474,亮度+不透明度同脉,10s 周期)——非静态 0.575(classic 自创档)。修=rAF 单点驱动 `--invpulse`(root 单写,全槽 calc 派生,dt 归一);经典列表格显式退出脉冲(距离渐隐走元素 opacity)。
3. **宝箱 UI 落位**:独立 modal 退役(vanilla 模式跳过 buildChestPanel+openChestPanel 分支),改 **ChestUI.Draw 原版落位**:40 槽 10×4 直接叠背包下方(trunc(73+col·56·0.755), trunc(258+row·56·0.755))、名字 @(504,258)、按钮列(全部取出/存入全部/快速堆叠=复用 chestLootAll/DepositAll/QuickStack;Rename 族=债)。防 chest 槽双份(全局 slotEl 首匹配)由 initInGame 跳过 classic 面板保证。
4. **配方格/材料格滚轮失效**(格不在 listHit 子树):滚轮处理器抽 `vinvCraftWheel` 绑到列表命中区+每格+每材料格。
回归:综合验收探针 24/24 + 守恒电池 135/135 + tsc 净。knife4 探针(Modern 面板)退役。

## 用户实测反馈轮 3(2026-09-08,刀 11)

1. **配方格 hover 态**:悬停非焦点配方=描金背景(Back14)+焦点语义保持(mouseenter/leave 回写 --slot-bgimg);
2. **设置文字钮补建**:DrawInterface_29_SettingsButton(Main.cs:46286-46301)——(sw-110,sh-20) 文本钮 Lang.inter[62],悬停放大,与装备列底碰撞左推 140 贴列底上(:46266-46282),点击=onPauseMenu 开/关设置浮层(SW-BN3 同相)。红队 m8b 轮曾误判「原版无此钮」——用户实测纠偏,债清单该条作废;
3. **标签字号**:物品栏 20→16 / 钱币·弹药 15→13 / 制作 17→14 / 箱名 15→13(MouseText 同档)。
回归:守恒电池 135/135 + 综合验收 24/24 + tsc 净。

## 用户要求:哥布林重铸检查+交互 UI 原位化(2026-09-09,刀 12)

**重铸功能检查**:端到端探针(modal 形态)11/11 双布局全绿——对话入口/overlay/放件/扣费 666 铜/词缀变化/取回/关闭全链正常,结论=可用。过程排除探针自身三误(哥布林 vid=107 非 388、NpcDialog 钮绑 click 非 mousedown、未重铸件词缀=null 合法)。

**重铸原位化(债 #5 vanilla 档清偿)**:Main.cs:42268-42393 逐式——重铸槽 (50,270) ctx5 整件克隆放入/取回、费用文字 (100,270) 四币分档染色(inter[15-18])、锤钮 (120,310) UI_Reforge[0|1] hover 换图+cooldown 60t+BuyItem 静默失败、储蓄 (180,258) DrawSavings 四库合计(ItemSlot.cs:四库有钱画图标+inter[66] 总额)。显示门 `vinvReforgeVisible()`=:42277 四条件(无箱/无商店/无对话/ReforgeOpen);开箱自动退出;showReforge vanilla 分支原位开启,modal 保留 classic。探针:槽/锤坐标、放入、点锤扣费+词缀、开箱退出、无 modal 全过。

**待复核(机器负载 20-60,世界生成探针饿死,未跑完)**:①储蓄显示(bank 注铜币后 content 空——疑探针注钱方式,UI 代码读面无误:vanilla 语义=库里有钱才显示储蓄行);②宝箱条显示(代码链全:40 槽构建/sig 含 chestOpen/paint;上轮探针 display:none 系假箱不在世界箱列表被 tickChestAutoClose 立关——已改直设 ui.openChest 的探针未跑成)。两条请用户实测:①放存钱罐存钱→找哥布林重铸→(180,258) 应显储蓄行;②开世界里的箱子→黄格子应叠物品栏下方。

## 用户实测反馈轮 4(2026-09-09,刀 13:宝箱对齐+重铸检查)

用户给原版猪猪储蓄罐截图,要求对齐宝箱功能与 UI。对勘+实现+验证:

**新移植(1:1)**:
1. **Restock 补货**(ChestUI.Restock ChestUI.cs:867-992 1:1)= chestRestock():容器无词缀件向背包同类未满堆补满(ammo 门/OnlyNeedOne 门/57..0 降序跳钱币),容器件清空后可换入空弹药格,flag→Grab 音;
2. **排列物品**(ButtonID 4 → ItemSorting.SortChest → Sort :1436-1556)= chestSortChest():未收藏件并堆→sortingLayerIndex 层序分组(层内稳定,登记偏差:各层 SortingMethod 细则谓词以层内稳定序近似)→可用槽(未收藏+空)升序回填,收藏格原位;守恒+聚前探针验证;
3. **宝箱条五钮 1:1**:Y=invBottom+40+ID·26 跳号位,ID0-4=拿走全部/存放全部/快速堆叠/补货/排列物品(重命名 ID5/6=真箱+editChest 域=债);
4. **bank/虚空槽贴图**:ctx4/32=Inventory_Back2(黄,ItemSlot.cs :2200 区)——修正本仓 chest 一律 Back5 的偏差(经典 chestPanel 既存偏差不动);收藏 Back10 保持;
5. **l10n**:inter[29/30] 官中现译=拿走全部/存放全部,与 vanilla 分片(全部拿走/全部放入)不符——merge 序 custom 负于 vanilla 分片(非 en),改走自有键 Mods.SandboxWorld.Chest.*(五钮 12 语言)。

**验证(探针 13/13 全绿,`scripts/_reforge-e2e-probe.mjs`)**:重铸原位(槽 50,270/锤 120,310/放入/扣费 666 铜+词缀)+储蓄显示(bank 注铜币→存款行+币图标)+开 bank 自动退出重铸(走真实 g.openChest 链)+宝箱 40 槽叠背包下方+Back2+五钮位+补货全并(包 10→60 箱清)+排列守恒聚前+关包隐藏+无页面错误。守恒电池 156/156。

**探针工程教训(登记)**:①假 ChestData 不在世界箱列表 → tickChestAutoClose 原位 tile 校验秒关——探针须真 tile+world.chests 登记;②ui.openChest 直设绕过 openChestPanel → 走 g.openChest 链才触发退出逻辑;③刷新级联中段采样会得到半成品布局——断言前须双 refreshAllAsync;④本探针文件曾被并行会话陈旧缓冲整文件回退(共享文件事故同族)——重写后单文件单 Write。

## 红蓝对抗:全容器类型显示+交互(2026-09-10,刀 14)

用户要求确保一切宝箱类型/物件交互正确显示。五类容器全量验证(探针 `scripts/_chests-x9-probe.mjs`):

| 容器 | 名字 | 贴图 | 判定 |
|---|---|---|---|
| 世界箱(ctx3) | LegacyChestType[frameX/36](tile frame 权威读面;frameX=144→锁住的暗影箱 实测) | Inventory_Back5 | PASS |
| 猪猪储蓄罐(-2,ctx4) | 猪猪存钱罐(itemName 87=inter[32] 同值) | Inventory_Back2 黄 | PASS |
| 保险箱(-3,ctx4) | 保险箱(inter[33]) | Inventory_Back2 | PASS |
| 守护者熔炉(-4,ctx4) | 护卫熔炉(itemName 3813) | Inventory_Back2 | PASS |
| 虚空保险库(-5,ctx32) | 虚空保险库(itemName 4076) | Inventory_Back2;**收藏件=Back19**(ItemSlot.cs :2131-2134) | PASS |

**交互**:放入/取回=makeSlotEl 拖拽协议(与 classic 同码路径);**Loot 跳过收藏**=探针实测收藏件留库(skipFavorited :4691);补货/排列=刀 13 已验。五钮@Y=invBottom+40+ID·26 全命中。

**新修**:虚空收藏 Back19(曾一律 Back10)、世界箱型名(frameX 权威读面,替换 宝箱 兜底)。

**登记债**: ChestType 完整层内排序细则(层内稳定序近似——同刀 13); 重命名 ID5/6(editChest IME 流); 排列 Glow 反馈。

**探针工程**:本批探针文件遭并行会话多次陈旧回写(_chests-* 族)——最终以独立文件名+单命令写入即运行规避;console.log 在 evaluate 内不透传 run-diag,取证须走返回值(node 侧打印)。

## 用户实测反馈轮 5(2026-09-11,刀 15)

1. **信息栏排布核对**:用户问原版是否「图标在右、文字居右」——反编译 GetInfoAccIconPosition+DrawInfoAccs(Main.cs :47759-48060):**图标竖列在 X=screenWidth-280,文字同行从 X 向右延展**(行高 22、行宽 >215 压缩、scaleX<0.58 缩 Y)——即【图标列在左、文字向右】;本仓 InfoAccsLayer.ts 已是该式逐式移植(X=canvasW-280/图标列/215 压缩/悬停下一行压暗),**无需改动**。用户记忆与反编译不符,以反编译为权威。
2. **小地图下方 ⛅/± 两钮去除**:Renderer.ts hudBtns 恒 false(两钮不绘制/不命中);天气/时间面板本体不受影响(暂停菜单入口经 timePanelOpen/weatherPanelOpen 仍可开)。timeUiHover/weatherUiHover 的 btnHover 支随 false,面板命中保留。

回归:tsc 净 + vanilla-inv-layout/au2/ay1/l10n-audit 82/82。

## 已知红(签名记账,非本批回归)

- `tests/sw-bp1-composite-debts.test.ts` 位次锁 `paintAt > grassAt`:**并行会话** 2026-09-08 01:29 修改 Game.ts(:22478 新增 `PlaceIt_AutoPaintAndActuate` 注释提及)使 indexOf 首现位移到 KillGrass 调用点之前。本批未触碰 Game.ts。锁本身(首现 indexOf)对热文件注释脆弱,归并行会话域处置。

## 登记债(逐条归属刀序,均不阻塞灰度)

> **SW-FX10 收官(2026-09-10)**:12 条→清偿 5(④⑥⑨⑩⑪)+定谳非债 2(⑧⑫)+前置已清偿 1(⑤)=8 条销项;备案在途 4(①②③⑦),各带 1457 金标锚与移债路径,逐条见 tests/sw-fx10-debts.test.ts(几何金标/门矩阵/接线锚定,变异证红)+scripts/_fx10-debts-probe.mjs(实机 20 断言 ALL PASS)。

1. 箱子/商店 UI 原版内嵌式布局——**箱侧清偿(SW-FX28 刀① 2026-09-11);店侧分期二清偿(SW-FX32 刀① 2026-09-11)**:原版=ChestUI.Draw(Main.cs:42552 调)把箱格/钱币/弹药列/垃圾桶并进同一 inventoryScale 组,本仓 chestPanel(独立 fixed 面板)+NpcShop 独立面板。刀 9-11 已把**开箱态变体几何**(垃圾桶 (453,426)/2×2 钮让位/Bestiary/Emote (503,446))做齐;**刀①(2026-09-11)箱侧清偿**:vinvBuildChest 槽/名/钮几何迁 vanillaInvLayout 单源(CHEST_SCALE=0.755/chestSlotXY=trunc(73+col·56·0.755),trunc(258+row·56·0.755)/CHEST_NAME_XY=(504,258)/chestButtonXY=(506,298+id·26);金标=ChestUI.cs:372/:375-376/:158/:186/:198,invBottom=258 Main.cs:6746),守卫=tests/sw-fx28-chest-embed.test.ts(几何金标+单源接线反锁+开箱流 D0/绑定面,变异证红:几何常量变异 4 红/消费面回退 2 红)+scripts/_sw-fx28-chest-probe.mjs(实机 13 断言 ALL PASS:40 槽逐槽零差/名/钮/让位共存/命中域/开-关-重开-同箱再点流);chest 基线 17 文件+slot 2 文件全绿。**刀①(2026-09-11)店侧分期二清偿(SW-FX32)**:vinvBuildShop 落 .sw-vinv 原版位——货架 40 格=箱条同格(shopSlotXY=chestSlotXY 别名单源,Main.cs:42522-42524 context 15)/店名+储蓄 @(504,258)(SHOP_TITLE_XY=CHEST_NAME_XY 同对象,Main.cs:42502-42503)/储蓄行全簇(标签 (504,298) ItemSlot.cs:3671/币图标 (515+24j,333) :3699-3710 计数帽 999/四银行小图标 :3727-3740 ×0.65,数据面 Game.coinSavingsCopper/ByBank/Split=Utils.CoinsCount/Split 1:1)/快乐度图标帧3档+倍率文字((516,366) 中心锚/:42506 三元链 happinessFrameX+offsets Main.cs:67677-67680,1458 同值)/**Set-Back 钮退役**(原版全段无关闭钮——关店=Esc/对话关闭/走远 closeNpcDialog→npcShopClose;classic 浮面板同撤)。PipsUseGrid 门=Main.cs:42500 同面(网格态整段不画);NpcShop 浮面板=classic 专属面(FX28 chestPanel 同例)。守卫=tests/sw-fx32-shop-embed.test.ts(29 断言:几何金标+单源接线反锁+储蓄数据面+买卖接线,变异证红:帧档边界 1.1→1.2 红/币图标步距 11→12 红/卖出接线换 npcShopSell 红)+scripts/_sw-fx32-shop-probe.mjs(实机 15 断言 ALL PASS:40 槽逐槽零差/店名"商店"/快乐度帧+120%/储蓄行全簇/卖 0→58 币+回购上 shelf/买 116→58/命中域/PipsUseGrid 门/关店收面;探针曾抓真 bug=店名文案未回写+快乐度图标缺 position:absolute,均修)。六基线 sw-bj8/bj22/bj23/bn5/shop-currency/moon-shop+fx28+vanilla-inv-layout+fx29+bj52 共 209+159 测全绿。店侧余债:储蓄行计数文字=XNA ItemStack 字体 DOM 近似(字体度量备案)/四银行图标用 32px iconUrl 代理贴图(原版=itemFrame 原尺寸×0.65)/买不起调暗=经典面同款呈现(原版无调暗)/货架格间缝隙点击穿透(与箱条同面,原版=mouseInterface)。箱侧余债不变:重命名 ID5/6(editChest IME 流)/排列 Glow 反馈/钮 hover 缩放动画(ChestUI.cs:53-77 0.75↔1)。
2. ~~经典列表/经典网格/切换钮 (94,450)~~——**SW-FX30 刀②已清偿(2026-09-11,classic 域满额)**:切换钮落地 vinv 埃 @(94,450+adjY)(top-left 约定与就近箱钮成列,+16/+17 对原版 origin=size/2 居中锚偏差备案),Craft_Toggle 六帧算式(craftToggleFrame:list 2/3、grid 0/1、modern 4/5,单源 src/ui/craftingGrid.ts);左键 classic 支=PipsUseGrid 翻转+recStart 归零(Main.cs:43926-43930),右键=CraftingGridControl Classic↔Modern 循环(CraftingUI.cs:322-331,options.craftingGridControl 持久化,★缺省 classic=对原版 Modern(Player.cs:363)偏差备案,modern 窗族落地时回切);经典网格视图 DrawRecipesGrid(CraftingUI.cs:446-571)满额移植=(310,340) 起 42px 格距 cols=(sw-590)/42、rows=(sh-360)/42、RecUp/RecDown @(290,342)/(290,362) 分页(下页钳 avail-cols 逐字)、窗口级滚轮矩形命中(Main.cs:17602-17608)+列表同拍滚(:17629-17632 flag 语义)、格点选=focus+关网格(CraftingUI.cs:520-527)、网格开态吞箱条面(ChestUI.cs:81)、金标指示条(Utils.cs:2901-2910)。**modern 支分期**:左键 modern 支(:308-316 NewCraftingUI.ToggleInInventory)=窗族未建,本刀=声效面+悬停名键切换,缺席面见 SW-FX30 报告分期表。
3. Sort 钮功能——**备案(域=ItemSorting 整库)**:vanilla 点击=ItemSorting.SortInventory(Main.cs:42602;Sort 主干 ItemSorting.cs:1436-1558+SortInventory :1560+SortCoins/SortAmmo :1626+,52 层谓词+比较器 SortIndicesStable :1142)。已核实移债面:层映射表已提取(vanilla-itemsorting.json 6147 条 type→层,tools/extract-itemsorting.mjs;白名单序=SetupWhiteLists :1272,运行时层序=白名单 0-3 玩家伤害排名+4-51 静态序);缺=21 张 SortingPriority 集+IsFood/IsFishingCrate/IsBasicFish/projHook/lightPet/vanityPet/Mount.Sets.Cart/BuffID.SortingPriorityFoodBuffs 提取(itemfunc/equip/rare 既有 json 覆盖比较器字段面~90%)+52 比较器+金标。UI.ts:6566 已挂定谳注。
4. ~~页 2 buff 列(sw-84,num20+247)~~——**SW-FX10 已清偿**:列容器入 pageMisc(几何 vanillaInvLayout MISC_BUFF_*/miscBuffRowsPerCol,金标 Main.cs:42008-42046);buff 块 reflow 双向(reflowBuffs:开包∧页2→列,否则→HUD 栏),块本体/悬停/右键取消复用 makeBuffBlock(原版两态同源 DrawBuffIcon :44043);vinvPulseTick 每帧挂 mH 新鲜度。探针列几何/右键取消/回流全过。
5. ~~重铸 (50,270)/锤 (120,310)/储蓄罐 (180,258) 原位化~~——**刀 12 已清偿**(vanilla 档原位,classic 保留 modal)
6. ~~相机页签→CaptureMode 接线~~——**SW-FX10 已清偿**:页签点击=renderer.captureMode.toggleRequest(=原版 CaptureManager.Active=true Main.cs:43565-43568),成功播 menuOpen(PlaySound(10) :43583),悬停名 inter[81];死亡/幽灵拒开门内置 toggleRequest(游戏 pad QuickScreenshot 支=触屏同走开界面,备案)。探针 active 翻转全过。
7. ~~合成筛选条(11 类)+站点交互 focus 钩~~——**SW-FX30 刀⑦已清偿(classic 域)/分期(modern 域)(2026-09-11)**:classic 域满额=合成站尾臂(Player.cs:33541-33547,Game.interactAt 分派链末位;flag2=rightDown 消费)+资格谓词 GetCraftingFilterForTile(:33567-33587,DoesNotOpenCraftingMenuOnInteract={215,207} TileID.cs:279;TileUsedInRecipes=**闭包折叠集** Recipe.cs:593-602 回写,:15153 调用——炼药台 355/699 无直接配方亦开门)+InteractWithCraftingStation 模式分派(:33555-33561)→classic 支 OpenCloseFilter(CraftingUI.cs:146-159)=开包+网格态+站点过滤(再点=清过滤 :148-153;走远 CanRemainOpen=adjTile SetAdjTile Player.cs:35924-35940 失效清 :269-273);过滤判据=CraftStationRecipeFilter.Accepts(NewCraftingUI.cs:159-170,接受集=filter.tile+TileCountsAs 链)/WaterSourceRecipeFilter(:180-187 只认 needWater)+列表头 CombineFormat.Crafting(NewCraftingUI.cs:101-104,族级 tileName 备案 cosmetic 偏差)。纯逻辑单源 src/ui/craftingGrid.ts。**分期**:11 类筛选条(:286-301 Weapon/…/Materials+MiscFallback)与 BySearch 全部住 modern 窗(NewCraftingUI),随窗族整刀落地;经典竖列表原版无筛选条(头文字=Lang.inter[25] :167-171)=现实现即 1:1。
8. ~~详情浮层锤图标(Images/UI/Craft.png 资产未入仓)~~——**SW-FX10 定谳:非债**。Images/UI/Craft 在 1457 注册面**不存在**(AssetInitializer.cs:548-606 只注册 ChestCraft_0-3/Craft_Toggle_0-5/RecUp/RecDown),唯一消费点=NewCraftingUI.DrawChildren(NewCraftingUI.cs:464,modern 窗内成品→材料行装饰,scale 0.8 @(origin+47,13));资产文件本仓 public/sprites/vanilla-ui/UI_Craft.png 早已有(2026-08-13),几何已建模(vanillaInvLayout craftDetailLayout.hammer)。classic 面无此支=现实现即 1:1。
9. ~~mH 小地图联动~~——**SW-FX10 已清偿**:layoutVanilla 改真实小地图态(mapStyle===1∧非全屏图=Main.cs:46537-46561,mH=256 再钳 sh-PushUp;本仓无 mapEnabled 独立设置面=默认开,偏差同前);签名+vinvPulseTick 每帧新鲜度(Tab 循环样式/全屏图开关当帧重排,探针实测页签 y 398↔142=±256)。
10. ~~杂项页超级矿车开关(Extra[255]/[256])~~——**SW-FX10 已清偿**:杂项页 m=2 勾选框(unlockedSuperCart 门 Main.cs:41963;Extra_255 开/256 关 18×18 全白;点击翻 enabledSuperCart+menuTick;悬停 GameUI.SuperCart{Enabled,Disabled});Player.enabledSuperCart 缺省 true(Player.cs:2037)+存档链三面(SaveFile/serialize/mainFlow,PL:55572 位[1]);消费面=UsingSuperCart 三元(Mount.cs:4851→Player.cs:3955-3961,Game.superCartUnlocked 改公开)。
11. ~~热键锁图标(HbLock (0,21))~~——**SW-FX10 已清偿**(债面「本仓无 hotbar lock 概念」已补齐语义建模):图标仅开包态画 @(0,21),pushSideToolsUp(恶魔心+大师槽齐显=visibleRows≥10)→(0,0)(Main.cs:43205-43208);Lock_0 锁/1 未锁双帧+悬停金描帧;点击 PlaySound(22)=unlock+hbLocked 翻转(:43230-43231),悬停名 inter[5]/[6];锁定消费面=关包快捷栏:选中门(mouseup 臂 :44357 changeItem 门)+整格透传世界(data-sw-world-passthrough 豁免 domTargets=:44353 非 mouseInterface 同相,对快捷栏区挖/放即本功能用途;1-0 数字键照常);.plr 持久化(PL:55543/56268)。备案:悬停名抑制面未接(cosmetic;DOM hover 通道另一域)。
12. ~~站点匹配但材料缺失的置灰配方~~——**SW-FX10 定谳:非债(判归 NewCraftingUI 域)**。原版经典列表三连门 UpdateRecipeList(Recipe.cs:252)=filterHack∧环境∧CollectedEnoughItemsToCraft(材料门 :280-298 HowManyTimesCanRecipeBeCrafted>0)——**经典列表本就只出可合成行**;「缺料置灰」是 modern 网格(NewCraftingUI)行为面。反向锁定测试在 sw-fx10-debts(站点匹配缺料不入列/补料入列)。

## 红蓝对抗 SW-RB13b(FX28×FX30 审计,2026-09-11:9 findings 全修)

- **F1 HIGH(互踩)**:PipsUseGrid 翻转三路(切换钮 classic/modern 左键/openCraftingStationFilter)不触发重排——FX28 箱条吞门(ChestUI.cs:81 名/槽/钮 pos 闭包)只在 layoutVanilla pos 循环求值,且 PipsUseGrid 不在布局签名 ⇒ 签名早退跳过 pos 循环,开箱+开网格态箱条滞留与网格叠画(探针实捕)。修=翻转三路 `vinvLayoutSig=''`+`layoutVanilla()`+签名入 PipsUseGrid 位(vinvUpdateReforge 显隐 relayout 同族教训)。
- **F2 MEDIUM**:垃圾桶/图鉴/表情变体谓词裸读 chestOpen——原版=ChestOrShopUIVisible(Main.cs:3035-3046)=chest/shop ∧ !PipsUseGrid(QuickStack/Sort 仍走 :42548/:42586 chest==-1 裸门不折)。修=vinvLayoutCtx.cosUiVisible 消费面(43078/43103/43158)。
- **F3 HIGH**:网格格面绑 vinvCraftWheel(stopPropagation)吞掉窗口级分页——滚轮只在 3px 格间空档生效(格覆盖 93% 面积,与 Main.cs:17602-17608 矩形域倒挂)。修=格面不绑 wheel,窗口级 vinvGridWheelTick 独管。
- **F4 MEDIUM**:窗口级滚轮在网格矩形外早退——原版 flag 语义(:17633-17640)列表滚恒走(开包态全域)。修=vinvGridWheelTick 按 DoScrollingInInventory 逐字重写(playerInventory 门 :17547/PipsUseGrid 支不清 flag/箱行滚支=40 槽箱死支备案)+vinvCraftWheel steps=档数(ScrollCraftingList :390-397)。
- **F5 LOW-MED**:滤器失效拍事件驱动——原版 DrawGridToggle 头 :268-272 每帧执行(adjTile 每拍 AdjTiles),走远站无事件不清滤。修=vinvPulseTick 逐帧门(filter 非空才扫,vanillaNearbyStations ±5/±3 盒)。
- **F6 LOW**:滤器消费缺 RecipeFilterHack getter 门(CraftingUI.cs:121-127 control≠Classic→null)——classic 置入的滤器切 modern 后仍滤列表。修=vinvRefreshCraft filterActive 门(_lastFilter 本体不清,切回 classic 恢复=原版同相)。
- **F7 LOW**:modern 左键缺 PipsUseGrid=false 副效应(:310-315)——modern 态已开的网格无法经切换钮关。修=副效应面落地(窗族缺席不变)。
- **F8/F9 LOW(cosmetic)**:箱名 pointer-events:auto=无处理器世界点击死区(DrawName :158 无命中盒,(504,258) 在 :84 域 x≤495.8 外)→none;箱钮悬停色 #c8f0c8 自创绿→OurFavoriteColor(Main.cs:886=255,231,69;DrawButton :227),钮竖直居中锚补齐(origin=vector/2 :234+命中带 24px :223,translateY(-50%)+padding 5.5px)。
- **F10(探针实捕,FX30 潜伏 bug 被签名位激活)**:网格容器 pos 闭包 (0,0) 与 vinvUpdateCraftGrid 的 (310,340) 双写者冲突+页钮 pos 循环冲掉 recStart 可见门——修=容器 pos=CRAFT_GRID_LEFT/TOP、页钮闭包同谓词(:470/:501),两写者一致化。
- 复核=RB12 待验项**定谳成立**:TileUsedInRecipes 闭包折叠集(SetupTileInheritance :561-572 九映射/AddRecipe :16804 直写/UpdateInheritedTilesUsedInRecipes :593-602 于 SetupRecipes 尾 :15153 调用)⇒ 炼药台 355/699 运行时开门,仓内 tileUsedInRecipes 不动点=结果集等价;1458 同域核对=ChestUI/CraftingUI/NewCraftingUI 全等+Main/Player 审计区行移后逐字等价。守卫=sw-fx30-grid-toggle RB13b 段(变异证红 9 红:删重排/删签名位/格面回绑 wheel/删 modern 副效应/删 classic 消费门/删 cosUiVisible 折叠/删逐帧失效拍/容器 pos 回 0,0/删页钮门)+scripts/_rb13b-chest-grid-matrix.mjs(实机 13 断言 ALL PASS:四态矩阵全走查);三探针 fx28 13/fx30 20/rb13b 13 全绿,18 文件 384 测全绿,tsc 本批面零错。
- **备案不修**:切换钮悬停盒=DOM 整钮(原版 ±15 居中 30×30,与 +16/+17 锚备案同族);箱钮文本 13px vs 原版缩放字(ButtonScale 0.75↔1 动画=既有登记债);滚轮档数 deltaY/120 取整 vs 原版整除(trackpad 亚档差异);箱条域整域拦截(ChestUI.cs:84-88 FloatIntersect→mouseInterface)与箱/店格间 3px 缝隙点击穿透=同一缺口(世界点击不被吞),随格间缝债共管。

## 偏差备案(与原版的刻意分歧,均有据)

- **整体等比缩放**:原版小屏直接裁切;本仓 `.sw-vinv` 容器 `scale(K)`(K=clamp(min(1,vw/720,vh/780)×uiScale,0.5,1.15))——几何关系 1:1,整体等比。用户口径「全档统一原版」的实现载体。
- **QuickStack 右键**:原版循环 StackToChestsPreferredMode;本仓映射为 quick↔smart 双态循环(options.quickStackMode)。
- **PvP 剑视觉**:锚点取原版 (sw-227,179+mH);帧制沿用 classic 36×37@400%×600%(原版 76×32 整帧×0.6)——refreshPvpButtons 帧算依赖。
- **队列常开语义**:原版 ShouldPVPDraw=仅联机;本仓 PvP/队伍常开(classic 同款,2026-08-27 定策)。

## 共享区改动白名单(classic 行为零变化;源码级新增分支)

initInGame 分派(:5792)/positionInvPanel 首行守卫/refreshHotbar 开包早退/refreshAllNow 补绘门/closeInventory 尾刷新/构造器 onChange。flag=classic 时全部短路。

## ★SW-FX39(2026-09-11)缺省转正刀

用户拍板:vanilla 布局转正为缺省 UI,旧自创布局退居回退旗(过渡一个版本)。

- **缺省翻转**(`src/core/Options.ts`):初始值/坏值卫门回 `vanilla`;存档侧 classic
  (灰度期经设置行显式切换)=用户意志保留不迁移;红队 F1 覆盖不落盘语义不变。
- **回退旗**:`?invlayout=legacy`(别名映射 classic,统一叫法)+ `?invlayout=classic`
  历史名仍收(灰度期探针/测试零改动)+ `?invlayout=vanilla` 显式钉回;均为会话
  覆盖不落盘。设置行文案「经典(现行)」→「经典(旧版)」(12 语言重建)。
- **差集审计**(逐面:vinv 有/处置):原版 1:1 面全在位——Sort(FX29)/QuickStack/
  图鉴/表情/相机页签/热键锁/超级矿车开关/buff 列(FX10)/箱条五钮/货架(FX32)/
  重铸原位(刀12)/建筑配件列(FX19)/成就 Advisor/设置钮/住房页(刀3)/配装轨/PvP/
  防御/网格切换钮(FX30)/就近箱钮。自创面(道具搜索/天气/时间/玩家列表/旅程/
  研究/HousingPanel)停于暂停菜单停车坪(main.ts `inventoryLayout==='vanilla'`
  门控——缺省转正后即常态路径)。**登记债(不补,理由)**:①配方搜索框=classic
  专属 SW 自创面,原版 1457 CraftingUI.cs:161-318 无此面;债主=FX30 modern 窗
  分期(原版 NewCraftingUI 自带搜索);②合成站文字行=classic 专属 SW 自创面,
  原版同段无(标题仅 numAvailableRecipes>0 时画)。
- **守卫**:`tests/sw-fx39-default-flip.test.ts`(缺省锁/legacy 别名/覆盖不落盘/
  差集终态锁/停车坪门/classic canary/12 语言文案)+ `vanilla-inv-layout.test.ts`
  flag 面迁移(缺省锁翻转/存档侧 classic 保留)。

## 红蓝对抗 SW-RB14b(FX32×FX39 审计,2026-09-12:6 findings 全修)

- **F1 MEDIUM(关包不关店)**:原版 `!playerInventory ⇒ npcShop=0`(Main.cs:42496-42499
  DrawInventory 每帧门 + :46434-46441 dead→playerInventory=false 链;1458 :42502/:46440
  同式)——本仓 npcShopOpen 只在 closeNpcDialog 链清,closeInventory(设置浮层 openInGamePause
  收包/死亡 tickChestAutoClose 强收包)后残值 ⇒ 重开背包货架复活(原版需重按商店钮)。
  修=closeInventory 补 `npcShopClose()`(Esc 链先走的路径幂等 no-op)。守卫=fx32 测 F1 段
  (结构锁+门序)+探针 P9(实机:开店→closeInventory→npcShopOpen=false)。
- **F2 MEDIUM(箱条缺第三门,邻批 FX41 激活)**:ChestUI.cs:81 三门
  `chest!=-1 && !PipsUseGrid && !NewCraftingUI.Visible`(1458 同行)——箱名/40 槽/五钮 pos
  闭包只有前两门;FX41 落地 modern 窗+craftingGridControl 缺省回切 modern 后,开箱→开窗
  原版箱条整面让位,本仓曾滞留叠画(20,312) 490 宽窗与 (73,258)-(495,427) 箱条域重叠。
  修=三闭包补 `!this.vinvModernCraftOpen`(商店段 :42500 无此门=原版本相,货架不折,勿跟改)。
  守卫=fx28/fx30 结构锁重锚三门 verbatim(变异证红 M2)。
- **F5 MEDIUM(换店不清回购记/回购件,邻批 BJ8/BJ22 会话面)**:OpenShop(Main.cs:41162-41170)
  每次点击重跑 SetupShop(Chest.cs:1357-1361 整面 `new Item()` 回填⇒回购件不跨重建)+
  UpdateOldNPCShop(1457:18387-18393,1458 同位;1456:18054——旧注 18056-18064 系 1456 锚,
  **F4 行号订正**)npcShop 变更才清 shopSellbackHelper。本仓 openNpcShop 兼职刷新不可清,
  两面整缺 ⇒ 对话 A→B 后点 B 商店钮=旧店回购件+卖差价记串进新货架;同店再点回购件滞留。
  修=`openShopFromButton(decor)`(会话身份 `(decor,npc)`:A→B→A 不点 B 店不清=原版
  npcShop 恒 A 同相;A 常规→A 装饰专柜=索引 15→25 变更清)+npcShopClose 复位身份。
  守卫=fx32 测 F5 段(接线+四支行为矩阵,变异证红 M3)。
- **F6 LOW-MED(研究钮错标签,FX39 停车坪常态可达面)**:三消费点(classic 面板钮 UI.ts:3799/
  停车坪钮 :6074/ResearchUI 标题 :85)用 `LegacyInterface.112`——原版 zh-Hans=「你必须先设置
  边框」(1457 zh-Hans.Legacy.json :112,en "You must first set a frame"),非研究面;研究原版
  键族=Game.CreativePowers.InfiniteItemsCategory。实机效应=停车坪研究钮显示错文案且按文本
  查找不可点(探针 P7 实捕)。修=三处改 `Mods.SandboxWorld.Research.Title`(研究/Research,
  12 语言已在档零新增)。守卫=fx39 测 F6 段(112 语义钉死+消费式禁回潮)。
- **F3 LOW(cosmetic)**:店名 15px vs 箱名/储蓄/快乐度 13px——原版四处同为 scale-1
  MouseText(Main.cs:42502 vs ChestUI.cs:161 vs DrawMoney :3671 vs :42512),同面两档=内
  不一致(刀11 箱名 15→13 用户定标后,FX32 刀①新立店名未随族)。修=店名 13px 对齐。
- **F4 LOW(锚订正)**:UpdateOldNPCShop 五处注释(Main/UI/NpcDialog/SellChain)陈旧 1456 锚
  18056-18064 → 订正 1457:18387-18393(1458 同位/1456:18054 双版本并注)。
- **变异证红**:M1 删 closeInventory npcShopClose→F1 红;M2 撤箱槽第三门→fx28+fx30 双红;
  M3 删 openShopFromButton 清记→F5 接线+行为双红。
- **探针**:`scripts/_rb14b-parking-lot-probe.mjs` 11/11 ALL PASS(补 FX39 探针 A14 只查
  按钮在位的缺口——停车坪七入口逐入口 click 直读:住房/道具搜索/时间/天气/研究/力量菜单
  全开+玩家列表单机缺席=门语义+F1 关包关店门实机+零页面错误);fx32 探针修前修后各一轮
  15/15 ALL PASS。工程债(不修):fx39 探针 A14 只断言文本在位未点穿,已由 RB14b 探针补位。
- **回归**:UI/商店/布局族 17 文件 400+ 测全绿(fx28/fx30/fx32/fx39/fx41/fx10/bj8/bj17/
  bj22/bj23/bj52/bn2/bn3/bn5/shop-currency/moon-shop/vanilla-inv-layout)+tsc 本批面零错
  (存余 426 错全在并行会话域 worldgen/fx/gen/tests,与既有签名一致)。
- **备案不修**:①商品格间 3px 缝隙点击穿透/箱条域整域拦截(RB13b 共管,同面);②买不起调暗
  (原版无调暗,呈现偏差既有备案);③储蓄行计数文字 XNA 字体度量 DOM 近似(既有备案);
  ④开门包→关包瞬态双写(货架与箱条 DOM 同格并存≤1 帧,原版同为同帧叠画,Game 层互斥
  已闭环:开箱关对话×3 臂+对话保持复查 chestOpen 臂)。

## 用户实测反馈轮 6(2026-09-13,刀 16;六项)

1. **滚轮全域滚动配方列表 → 定谳=原版本相,不修行为**:反编译定谳
   `DoScrollingInInventory`(Main.cs:17592-17643)经典列表支**位置不设门**——
   grid 矩形支(:17596-17617)与箱滚支(:17619-17631)才域判,`NewCraftingUI.Visible`
   支(:17636-17639)抑制后,`if (flag) ScrollCraftingList(num)`(:17641-17643)对开包态
   任意滚轮走 `CraftingUI.ScrollCraftingList`(CraftingUI.cs:572-581)移 focusRecipe,
   `InPipCrafting`(Main.cs:2929-2937)缺省恒真(Recipes 页缺省)。即原版开包态滚轮
   【没有其他功能面】,列表滚=唯一语义,观感怪但 1:1。本刀只清自创 `listHit` 巨带
   (冗余双绑:window 级 vinvGridWheelTick——SW-RB13b F4 逐字重写——已覆盖全域),
   行为零变化;配方格/材料格的元素级 stopPropagation 绑定保留(防 window 级双计)。
2. **设置钮字号** 15→18px(:7067),其余钮 13px 保持。
3. **成就卡对齐格顶**:advisor y 25→20(:6649-6650,与背包格顶 y=20 对齐;vanilla
   ADVISOR_XY.y=25=5px 刻意偏差备案——用户准绳 outrank 原版 1:1)。
4. **#363B52 线条**:配装轨装饰线整删(全仓零命中),右列三列+轨纯原版几何。
5. **Classic Crafting Window 翻译+功能**:l10n-custom 补 `GameUI.CraftingWindowClassic`
   (制作窗口(经典))/`Tip`(切换经典制作列表与网格视图,zh-Hans/zh-Hant+en 基线);
   功能面=vinvBuildGridToggle 已满额(FX30 刀②:左键 PipsUseGrid 翻转+recStart 归零、
   右键 classic↔modern 循环持久化、六帧贴图+金标指示条),本轮 hover 改自有气泡。
6. **附近箱钮 hover 态**:mouseenter 帧切换(UI_ChestCraft_0/2→1/3)+进入音
   menuTick(DoStatefulTickSound Main.cs:3333-3344 沿)+showBuffTooltip(:7475-7490)。
7. **title 气泡全量清偿(本轮扩面)**:用户指认「title 气泡慢」后,vinv 构建区全部
   原生 title 改自有气泡——新增 `vinvBindHoverTip(btn, textFn)`(惰性求值,mouseenter
   显/mouseleave 隐);改造 12 站:Sort/图鉴/表情/页签×3(mkTab)/热键锁/超级矿车/
   住房头像槽/网格切换钮/modern 筛选钮×2/建筑配件图标列(paintSlot 抽 baccTipOf)/
   方块替换/群系炬;切换型钮 mousedown 后即时刷新气泡(mousedown 必在悬停态,
   原版 MouseText 每帧重绘语义)。**共享槽 chrome eye(:1491/:1499)与 classic 构建
   器 title 不动**(classic 行为零变化白名单)。

验证:vanilla-inv-layout 结构锁同步(teardown 锁 `vinvCraftListEl`→`vinvCraftTitleEl`,
刀 16 连字段清);4 文件 108 测试全绿;tsc 本批面零错。

### 反馈轮 6 验证(2026-09-13 补)

- **探针** `scripts/_fx16-round6-probe.mjs`(私有 52xx):19 断言全 PASS——vinv 域
  零原生 title/Sort·页签·切换钮·附近箱钮 hover 自有气泡/切换钮 classic 左键翻转
  网格往返+中文文案「制作窗口(经典)\n右键点击 切换样式」/附近箱钮 hover 帧
  UI_ChestCraft_0/2→1/3 往返/成就卡顶对齐格顶(slot0=adv=20.0)/设置钮 18px/
  滚轮焦点动(格上 +1、空白 −1=原版本相定谳面)/无页面错误。
- **追加改造(探针驱动)**:①共享 `paintAccEye/paintPetEye` 加 `vinvEyeTip` 路由——
  判据=元素类名 `vinv-btn`(非 `_builtLayout`:构建期先构建后登记,布局判据会让仅
  构建期 paint 的杂项页宠物/光源眼误走 classic 分支残留 title);vinv 元素懒绑定
  气泡+清 title+dataset 刷文案,classic 元素原样 title。②`refreshPvpButtons` 同
  门:classic 保持 title,vanilla 悬停态显气泡(仅在 hover 时 show——本函数在共享
  刷新链每拍跑,不可无条件 hide);vinv 构建区 sword/队格 mouseleave 补 hideBuffTooltip。
- **回归**:本批 19 文件 406 测试 405 绿;唯一红 `sw-az1` removeHeld 计数锁 57→56
  =并行会话 17:25 改 Game.ts 所致(本批零触碰,同 sw-bp1 位次锁签名,归属对方)。

## 用户实测反馈轮 7(2026-09-14,刀 17;三项定谳+一修复)

1. **标尺开关"错位"→ 定谳=中心锚缺顶,已修(用户原版截图证伪旧判定)**:用户提供
   原版 1.4.5.7 截图逐像素测量——原版图标精灵实测 UI ≈(4,70)-(16,86),我们旧实现
   画在 (10,77) 顶格。反编译复核 Main.cs:48354:
   `spriteBatch.Draw(value, vector, rectangle, color, 0f, rectangle.Size()/2f, ...)`
   ——**origin=尺寸/2,vector=(10,77+24n) 是【中心锚】**,精灵左上=vector-(7,7)=(3,70+24n),
   与 hover 盒 CenteredRectangle(vector,14)(:48197)同心。旧判定错误根源:把 vector
   当 top-left 锚(方块替换/群系炬两图标确为 top-left=default(Vector2) 原点,:43273/:43316,
   我们实现无差——仅图标列是中心锚)。修=vinvBuildBuilderAccToggles pos 改
   (10-7, y0+drawn·24-7);DOM 14×14 钮随精灵落 (3,70) 后与原版 hover 盒 (3,70)-(17,84)
   亦逐像素同心。对拍截图(原版 vs 本仓左缘裁切)相对对齐一致。
   附带全链取证(仍有效):仅开包态绘制(:48151)/恒显(rulerLine 两版仅三处写位全 true)/
   层序 BuilderAcc(:45619)在 Inventory(:45594)后/1458 零变更。
   **修复(附带实锤)**:`unlockedBiomeTorches` 入布局签名(:48166 start.Y+=24·torchGodIcons
   列体位移+:48370 炬图标显隐的输入;旗翻不入签=列体滞留旧位与炬图标重叠——实测修复后
   列体 77→101、炬图标 (0,68) 显,与原版同相)。
2. **切换钮左+右双键位 → 定谳=原版逐字,不改**:CraftingUI.cs:309-331——左键
   classic 支=PipsUseGrid 翻转(:301-303)/modern 支=NewCraftingUI.ToggleInInventory
   (:305-310);右键=CraftingGridControl classic↔modern 循环(:319-331)。双键位并存
   即原版设计。
3. **切换后"两种制作方式并存" → 定谳=原版本相,不改**:DrawRecipesList 无
   PipsUseGrid 门(Main.cs:42425)+网格叠加绘制(:42448-42455)——网格=配方浏览面
   (格点击 focusRecipe=i+PipsUseGrid=false 回列表,CraftingUI.cs:520-527),列表恒
   为制作本体。探针实测:pipsGrid=true 时列表 2 格+网格 2 格并存,网格域 (310,340)
   1008×630 ✓。用户处于 classic 控制模式(FX41 前(09-12)旧缺省 classic 持久化所致;
   现缺省已回切原版 modern=Options.ts:369)——右键切换钮或设置页「制作窗口(经典)」
   行可切回 modern(原版缺省体验,无网格面)。
4. **Sort"只能开启无法关闭" → 排序面探针全绿,定谳=原版一次性语义**:vanilla
   Sort(withFeedback,inv,params ignoreSlots)(ItemSorting.cs:1436)——入参 0-9/
   50-58=【保护位】,排序域=10-49(热栏/钱币/弹药/垃圾不动);一次性动作无开关无撤销
   (再点=幂等重排,探针二次点击序全等 ✓);hover 帧点击后移出恢复 UI_Sort_0 ✓;
   glow 5s 自熄 ✓。若仍有"异常"需用户给具体表现。

验证:tsc 本批面零错;vanilla-inv-layout+rb14d 63 测试全绿。

### 反馈轮 7 补遗(2026-09-14):ESC 开包热栏格气泡钉左上角 → 已修

- **定谳**:showTooltipFor 定位回退 `slotEl(i,where)` **全局首匹配**——vanilla 开包态
  槽 0-9 命中 DOM 序在前的【隐藏热键栏】元素(既知坑族),rect=(0,0,0,0) → 气泡钉
  (8,0) 左上角。classic 不受影响(热键栏可见,锚=同位)。
- **修**:makeSlotEl 的 bindHint 回调显式传自身元素为 anchor(vanilla 门控;classic
  不传=零变化白名单);showTooltipFor override 类型 slot 改可选(仅锚定位不覆写内容,
  LoadoutShare 空槽代打判据改按 `override?.slot` 算=内容面行为不变)。探针
  `_fx17-tooltip-probe.mjs` 5 断言全 PASS(开包槽 0 气泡锚槽右 +8/关包热栏锚正确/
  classic 零变化 Δ=0)。

## 用户实测反馈轮 8(2026-09-14,刀 18;四项)

1. **设置钮贴底 → 定谳=又一处中心锚差,已修**:(sw-110, sh-20) 是文本【中心】
   (DrawSettingButton :46344 origin=vector3.Size()/2f),文字底距屏底 ~10px;旧
   top-left 画法文字底距 ~2px=用户报贴底。修=元素级 `translate(-50%,-50%)` 承载
   居中(pos 写中心点;★不用 pos 内 offsetWidth——build 期 root 尚 display:none,
   度量为 0 会退化回左上),hover scale 与 translate 合并书写。
2. **暂停菜单重组**:住房入口摘除(原版 EquipPage=1 页签面已在背包,冗余);图鉴
   入口摘除(背包 2×2 图鉴钮已覆盖);天气控制/时间控制/道具搜索收入
   **「开发者选项」子视图**(l10n 新键 Mods.SandboxWorld.UI.DevOptions,zh/en;
   子视图含返回钮=复用 MP.Back 键;视图切换后 applyBg 重算面板底)。
   玩家列表/旅程/研究三钮保留主视图。
3. **设置窗口**:CatTouch 页签摘除、成就页签摘除(页签列=sound/ui/game/controls;
   残 cat 语言重建卫门落回 sound)。成就面板仍可经其余入口(FX18 停车坪链)。
4. **游戏组**:开发者模式勾选行+其提示行摘除(devMode 选项面保留,走 URL/控制台);
   「帧模式(原版 FrameSkipMode)」→「帧模式」(l10n 值修正 zh/en)。

验证:`_fx18-pause-settings-probe.mjs` 14 断言全 PASS(设置钮中心 x/y 逐像素+底距
7.5px/菜单面/子视图往返/页签列/游戏组三处);sw-fx39 结构锁同步(onHousing 摘除面);
7 文件 100 测试全绿;tsc 零错。

## 刀 19(2026-09-14):向导制作菜单 1:1 + 重铸态会话保持修

### 一、向导 NPC「制作」菜单(NPCChatText_GuideReverseCrafting Main.cs:40724-40732)

- **入口**:modern 控制模式(缺省)→ `vinvOpenModernCraft(null, quiet)` 开现代窗
  (:40729-40731);classic 控制模式 → 经典位向导槽(不開窗)。classic 布局仍走
  自创反查浮层(零变化白名单)。
- **modern 窗内向导件**(DrawChildren NewCraftingUI.cs:441-458):槽 ctx7
  @(44,443)=detailOrigin+(0,58);文案 @(96,458)=inter[24](空)/inter[21]+名(有件;
  ★inter[21] 原版 zh=「所显示的配方使用此物品:」Legacy.json:988);环境需求行
  @(96,421)=GetRecipeRequirementsText(选中配方,:42908-42958 纯环境面)。
- **GetNumRecipes 门**(:256-262):向导态∧空槽 → 配方 0;有件 → CollectGuideRecipes
  (Recipe.cs:441-460 全表 items 组匹配,不问站点/材料/可制性,UpdateRecipeList
  :235-241 早退=filterHack 不消费)。classic 支空槽 → 常规可制列表(:42427 无门)。
- **材料面**(:474/:482):向导态材料全亮+拥有数整支不画;成品不灰化。
- **经典位向导槽**(Main.cs:42401-42415):@(73,331+num52) ctx7 scale0.85+
  DrawGuideCraftText(:42901-42924,槽+50 文案/两行 26px 步距)——仅向导态∧窗关。
- **切换钮上移**(:42438 num67=300+num52)+**就近箱钮整隐**(:42440/NewCraftingUI.cs:496)。
- **打造门**(:42988 guideItem.IsAir):反查态点焦点成品/窗成品槽=不合成。
- **ctx7 槽语义共享体**:openGuideSearch 内核迁 `guideSlotMouseDown(e,repaint)`
  (浮层与两窗位共用;guideRefresh 钩保持)。
- **几何**:mcraftGridGeometry 加 guide 参(UpdateCraftAreaSize :409-416 网格域
  −130/−77)。
- **布局签名**:+向导态/重铸态(显隐 pos 门随拍重估)。

### 二、重铸态会话保持修(用户报"远离哥布林后重铸槽滞留")

- **定谳**:原版重铸入口(NPCChatText_TinkererReforge :40717-40722)只清
  npcChatText,**talkNPC 保持**——对话距离保持链(tickNpcDialogKeepAlive
  Player.cs:27698-27709)走远 → SetTalkNPC(-1) → :42282-42285 四条件退出门
  (chest/shop/talkNPC==-1/向导态)消费。旧实现入口 `closeNpcDialog()` 清会话
  =走远无从检测,且 `vinvReforgeVisible` 的 `!dlgNpc` 极性反写(对话消失反而可见)。
- **修**:①`minimizeNpcDialog()`(Game 新增:只收 DOM 面板,dialogNpc/keepAlive
  保留)=重铸/向导两入口共用;②退出门双支(重铸 :42282-42285+向导 :42396-42400,
  每刷新拍消费;重铸退出不清 reforgeItem=原版静态量同相);③`vinvReforgeVisible`
  极性改正(`!!dlgNpc`)。
- **附带**:重铸槽 0.85 缩放落地(原版视觉 44.2,文本 +50 → 缝 5.8px;旧未缩放
  =文本压槽 2px,用户报"格子太近")。

验证:`_fx19-guide-probe.mjs` 18 断言全 PASS(modern 槽几何/空槽 0 配方/反查 135
条/全亮无拥有数/打造门/取回/走远退出/经典位几何/切换钮上移/会话保持/互斥);
fx30/fx41/vanilla-inv-layout 结构锁同步;11 文件 274 测试绿(az1 计数锁仍=并行会话域)。

### NPC 交互系统全面复核(2026-09-14,刀 19 连带)

- **按钮注册表**:复核 NPCInteractions.All(:489-531)注册序/条件门——shop×25/
  painterDecor(227 双店)/tax(应收>0 金币条)/nurse(费用条)/close(注册位)/
  stardew⊕dryad status 互斥/angler quest(excl=未完成)/town pet/old man curse(夜间)/
  guide help+craft/party girl music/tinkerer reforge/stylist hair/happiness⊕home
  (remix 门 :41304)——与 2026-08-30 对齐面零漂移。
- **会话语义逐入口核对**:OpenShop(:41162-41169 npcChatText=""+talkNPC 保持)=
  openShopFromButton 不清会话 ✓ 同相(走远 keepAlive → npcShopClose=RB14b F1 链);
  TinkererReforge/GuideReverseCrafting=刀 19 已修(minimizeNpcDialog 会话保持);
  hair/curse/quest/plant/help/music/collect/heal 各带原版锚未触动。
- **回归**:NPC 交互面 7 文件 170 测试全绿;宽域 139/142——3 红=finalzero
  GRAB_RANGE(拾取磁化域,本批零触碰=并行会话域);az1 计数锁同前=并行域。
- **登记差异(既有)**:OpenSign(:517)不并入对话框(路牌独立面板)。

### 对话框呈现面审计结论(2026-09-14)

交互层(按钮注册/条件门/会话语义/handler)已 1:1;**呈现层=登记差异族**:
本仓 NpcDialog=底部居中固定面板(fixed left:50% bottom:120px,76×92 头像卡);
原版=NPC 世界锚定气泡(DrawDialog 跟随 NPC 头顶)+文本行按钮(DrawNPCChatButtons
:41179-41186 y=130+numLines·30,x=180+(sw-800)/2,悬停变色)+头像四模式
(DialoguePortraitDrawOption Detailed/CloseUp/FullBodyRetro/Disabled,CycleNPCPortraitMode
:40989 可循环)。头像载荷系统已按四模式建(portraitPayloadOf),面板几何/按钮呈现
未对齐=登记债(归属新刀:气泡世界锚定+文本行按钮+头像模式循环键)。

## 刀 20(收官,2026-09-14):对话框呈现 1:1(用户令「呈现效果也要一致」)

> 开工取锚勘误(§〇 定谳采纳):开工注的 `DrawNPCChatButtons`(:41177,文本行按钮
> y=130+numLines·30)在 1457 是死码、` :44449/:44950` 是发式/衣柜窗自检门而非气泡门——
> 现役真身 = `Terraria.GameContent.UI.NPCChatPanel`(屏空间 top-center 面板)+ 世界锚定
> 仅 hover 小泡(Chat.png)。详见 npc-dialog-bubble-spec-20260914.md / npc-portrait-spec-20260914.md /
> npc-dialog-integration-20260914.md 三 spec。

### 一、实施记录(只动呈现层,交互层零触碰)

- **主写 `src/ui/NpcDialog.ts`**(NpcShop/NpcHappinessPanel 不动):
  - **面板几何**(NPCChatPanel.cs:52-86 1:1):`fixed left:calc(50% - 250px); top:100px; width:500px`,
    高 = `30 + 30·行数 + 30·按钮行数 + max(0,2·(按钮行数-1))`(行数按本仓字体
    scrollHeight/30 实测,pre-wrap 460px 换行,≤10 行封顶=max-height 整行截断 ≙
    `WordwrapString(...,460,10)`,TextDisplayCache.cs:23)。旧「fixed bottom:120px 宽 560」退役。
  - **Chat_Back 两段绘制**(:71-72):主体=源(0,0,500,470)纵向拉伸到 (500,H-30)、
    底帽=源(0,470,500,30) 原尺寸@底缘——DOM 用 overflow 容器 + 纵向缩放 img 实现
    (CSS 无法裁源矩形);乘色 (200,200,200,200) → opacity+brightness 各 200/255。
    资产 `public/sprites/vanilla/Chat_Back.png`(500×500,零搬运,首度消费)。
  - **台词区**(DrawText :217-237):TopLeft+(20,20)、行距 30、宽 460;色 =
    (mouseTextColor·2+255)/3 灰呼吸 → CSS 2.167s 三角波动画 rgb(211↔255)。
  - **按钮行**(DrawButtons :93-135):锚=面板底左角+(30,−22n+max(0,2(n−1))−4),
    行高 22/列距 30/4 列换行,逐钮绝对定位;文本行无底框(旧盒式按钮退役);
    基准 0.9(12px 字号近似)悬停 1.2(transform translateX(−15%) scale(1.3333),
    origin left center ≙ :125 左扩补偿)+影 Black→Brown(:121);正文色
    (b,b/1.1,b/2,b) 琥珀棕脉冲(:102)→ CSS 动画 rgb(190,172,95↔255,231,127);
    >260 横向压缩(:113-115,内层 span scaleX);悬停音效改**进/出双边沿**(:157-161
    _lastHovered,旧 mouseenter 单沿)。
  - **金币条**(:140-144):DrawMoney @ (rect.X−45,rect.Y−44) 后 rect.X+=106 →
    按钮相对 (−151,−44) 绝对定位,占位推进 106 进 X 游标(后续按钮随移)。
  - **感叹号**(:136-139):文字右 +8px、行中锚、不入命中盒(改 absolute,不再撑宽)。
  - **右下角物品**(Main.cs:40480-40543):>0=bottomRight−8、−1=bottomRight−12,
    收进面板内缘(旧 right:−34 出框位退役);窄屏媒体查询改「整体等比缩放」
    (620px/420px 两档 scale,内部几何不变)。
  - **头像四模式**(DrawNPCPortrait Main.cs:41012-41150):窗中心 P=面板左上角+(−62,+62),
    悬在面板左外侧;**Portrait_Window 112×112 底框首度消费**
    (`vanilla/Portraits_Portrait_Window.png`,chatBack 同色染色,:41069);名字行从面板
    标题迁入窗内(P+(0,57) 中心锚、白字、ItemStack 字体以 UI 像素字体近似,:41145-41149);
    画布 200×200(canvas-local P=(100,100)):Detailed=200×200 原尺寸直绘(:41073);
    CloseUp=行 0 ×3,帧底=盒底+4(DrawNPCDirect 尾锚)、剪裁窗 96×146@P+(−48,−98)
    (ctx.clip,:41109-41112)、宠物 num14=−20/num15=−36+((96−fw)/2/6)·6 特支
    (:41086-41095,旧实现漏 ×6 已按原版整数序修正)、偏移表改**不随缩放**加算
    (:41102 position+=value 语义);FullBodyRetro=×2 帧底=P.y+52、无剪裁(:41140);
    Disabled/url=null=单点早退连底框也不画(:41015/:41020)。
  - **hop**(D5 修):80 帧 EaseOutBounce(Utils.cs:354-366 = 1−(1−t)²|sin(4πt)|)
    关键帧 JS 生成(偏移=−14·(1−t)²|sin(4πt)|,:41049-41055);触发面 1:1 =
    SetTalkNPC(open-from-closed)+九个 Interact 动作(NPCInteractions.cs
    StardewValleyBit:99/DryadPurification:121/GuideTip:217/ReportHappiness:310/
    RequestHome:332 + Main.cs 六站)——呈现层以 HOP_BUTTONS 集合
    {heal,collect,quest,advice,music,status,stardew,help,home} 置 pending 闩,
    普通 refresh(plant 等)重建不重播(旧「每次重建必重播」过 hop 修掉)。
  - **按钮激活接线**(与旧实现等价单发):click(历史锚,integration §一)+
    mousedown 直驱兼容(_fx19c 全 DOM 链探针)——armed 闩保证同一次按压只发一次;
    Game 层无双触(Input.ts window mousedown 对 isDomUiTarget(.sw-root 子树)直 return;
    UI.ts heldStack mousedown 对 .sw-npc-dialog 直 return)。
- **探针同步**:`scripts/_npc-btn-parity-probe.mjs` B1 金币几何阈值改 −151 锚
  (±30);`scripts/_fx19c-reforge-dom.mjs` 加验「关闭钮=面板收+dialogNpc 清」。
- **新探针**:`scripts/_fx20-dialog-panel-probe.mjs` 27 断言(宽 500/y=100/居中/
  文本 inset 20,20/换行宽 460/行距 30/面板高公式/Chat_Back 两段/按钮行高 22·列距
  30·4 列换行/金币条 (−151,−44)/头像四模式渲染+底框 (−118,+6)+名字 P+(0,57)/
  closeUp 96×146 剪裁外零像素/disabled 整段不画/hop 首开有·刷新无/≤10 行封顶/
  关闭钮 mousedown 直驱)全 PASS;截图 /tmp/fx20-dialog.png(+wide 含头像窗)。
- **验证**:tsc 本刀触碰文件零错(全仓 435 错均系并行会话域:src/world/gen/*、
  tests/coating-system 等);vitest 15 文件 355 测试全绿(必测 4:sw-bh1/sw-bj1/
  vanilla-inv-layout/l10n-audit + NPC 交互面 11:esc-align/bj25/bj66/fx32/system-coverage/
  bj8/bj22/fx17/bn2/bj52/achievements);_fx19c 双场景全绿(重铸槽在+关闭收面清会话);
  _portrait-shots 三模式截图正常。
- **设置面**:Settings.ts 界面组「头像模式」循环行/Options.ts
  dialoguePortraitMode+load 卫门/l10n UI.Portraits* 四键——2026-08-30 对齐波已落,
  本刀核对一致零改动(portrait spec §8.3)。

### 二、偏差登记(呈现近似,全部 1:1 可复核)

1. **字体面**:台词/按钮/名字行以仓 UI 像素字体(Fusion Pixel 12px)近似原版
   MouseText/ItemStack——字号 13px/12px(≙0.9)/14px 为近似钉值;行数实测随本仓
   字体度量(与 CreateWrappedText 行数可差)。Item_Stack 位图字体仅数字+/(11 字形),
   不能渲名字(CombatTextFont.ts)。
2. **XNA tint 近似**:(200,200,200,200) 乘色以 opacity+brightness 各 200/255 近似
   (预乘语义判例,xna-alpha0-additive/glass 暗晕族);非逐通道精确。
3. **CloseUp/Retro 静态直绘**(D6 维持登记):行 0 帧直绘,不含 DrawNPCDirect 全管线
   (party 帽/DrawNPCExtras nudge/彩虹史莱姆 shader/shimmerTransparency);帧底锚
   「盒底+4」与逐 ID 偏移表为 1:1,per-type 帽偏移(num5/num6/nudge −4/−8)不入。
4. **FullBodyRetro 画布界**(D4 近似):原版无剪裁仅受屏幕裁;本仓以 200×200 画布为界
   (镇民帧高 ≤56·2=112 px,画布 P.y−100..P.y+100 域,现役镇民无一越界)。
5. **hop 六动作以外的 Interact hop**(GuideTip/RequestHome/StardewValleyBit/
   DryadPurification)按 NPCInteractions.cs Interact 体补全(portrait spec §5.2
   「共 7 处」系只扫 Main.cs 的欠账,本刀全表 9 动作+SetTalkNPC);happiness 动作
   原版 hop 但本仓走独立浮层不重建面板,不列。
6. **死码不实施**:DrawNPCChatButtons(Main.cs:41177-41376,1457 零调用,
   npcChatFocus1..4 全部读写都在其体内)按 spec 备案不复刻;其「y=130+numLines·30,
   x=180+(sw−800)/2」公式不得再作取锚源。
7. **头顶 32×26 悬停提示泡缺口(不强改,登记)**:Main.DrawNPCChatBubble
   (Main.cs:43865-43891,Chat.png 32×26、mouseTextColor 脉冲、spriteDirection 翻转、
   坐猫 637 ai[0]==5 再抬 18px、反重力竖翻)本仓无渲染消费者——仓内只有悬停**态**
   (Game.npcChatBubbleHovered:33158,坐椅闩消费,flag3 链 1:1)无**绘制面**;
   与面板互斥关系(面板 mouseInterface 压制下一帧泡,:43791-43794)随之缺席。
   资产 Chat.png(32×26)已在库。归属新刀(世界锚定 hover 泡,Renderer 世界 pass,
   signBubbleScreen 先例)。
8. **窄屏适配形差**:旧 max-width:94vw 压宽+角标收位媒体查询退役,改整体 scale
   两档(620px→0.68/420px→0.52)——内部几何恒 1:1,视觉缩放为仓内适配。
9. **路牌不并入**(既有登记维持):原版 NPC 对话与路牌共用 NPCChatPanel
   (:47490 门 npcChatText≠""),本仓路牌独立面板(OpenSign 不注册)。


### 附:信息栏悬停标签层级修(2026-09-14,用户实报)

根因=标签(cursorItemIconText)唯一绘制站嵌在 drawCursorItemIcon(原版层 40 域,先执行),信息行(步骤 9,层 28 域)后画压住标签;原版=MouseTextNoOverride 只置缓存,实际绘制在全部界面层后的 DrawPendingMouseText(Main.cs:45781-45788)。修=迁出独立 drawMouseTextLayer(render 尾步骤 13,主画布最顶、光标之下),锚/字体/描边逐字保留+uiHeld||uiBlocking 门随迁;顺带修正孤儿箱名/NPC 名同类压层。验证:tsc 零错+七套 114 测试绿+探针 7 断言(同帧 fillText 序 209>204=标签在上)。

### 追补:向导「制作」开包强制面(FX23,2026-09-14 用户实报「和向导NPC对话变成直接打开物品栏——只见物品栏、无任何对话/制作 UI」)

- **定谳**(探针 `scripts/_fx23-guide-talk.mjs` 先复现;真实链=真实 TownNPC 向导
  22+`openNpcDialog`(真 cb.onNpcDialog 开面板)→页面真实鼠标点「制作」DOM 钮,
  ×双 craftingGridControl(modern/classic)×双入口态(背包关/背包已开)四象限):
  - 背包关(两模式)全绿:仅开对话时背包不开;点「制作」→面板收+背包开+
    modern 窗显(vinvModernCraftOpen=true 且 vinvModernCraftEl @(20,312) 490×650)/
    classic 三件套显(槽 @(73,331+num52)+「在此放置材料」+切换钮 @(94,300+num52)
    +经典列表)。
  - **背包已开=用户实报复现**:`mainFlow.onGuideCraftOpen` 旧走 `ui.openInventory()`
    缺省=开/关**翻转** → 点「制作」把背包关掉(vinvRoot≡invPanel display:none),
    向导态+modern 窗(vinvModernCraftOpen=true、winDisplay='')全落在隐藏面板内
    → 用户只见对话收起、无任何制作 UI(探针 B8/B9 实锤)。
- **原版锚**:NPCChatText_GuideReverseCrafting(Main.cs:40724)`playerInventory = true`
  【无条件置位】;且 `Player.OpenInventory`(Player.cs:5071-5075)本体=force-open
  (`Main.playerInventory = true`+ResetInventoryState)——开/关翻转属 `ToggleInv`
  (:4959)Esc 链语义。本仓 openInventory 缺省翻转+force 形参,凡镜像原版
  OpenInventory 的调用点必须传 force(showReforge/开箱/商店/合成站各支早已如此)。
- **修**(两处一 token,Game.npcDialogButtons/分支零触碰):
  1. `src/mainFlow.ts` onGuideCraftOpen → `ui.openInventory(true)`(vanilla/classic
     布局双支同漏斗);
  2. `src/ui/UI.ts` showNpcDialog 角标 -1 支(RequestHome 装备页快捷图标,
     Main.cs:40536→Player.OpenInventory 同族)→ `this.openInventory(true)`。
- **验证**:探针 27 断言全 PASS(B8 背包保持开+B9 modern 窗可见复验;截图
  /tmp/fx23-guide.png(modern 背包关)+/tmp/fx23-guide-invopen.png(修复后背包开态
  窗显)+/tmp/fx23-guide-classic.png(classic 三件套));tsc 触碰文件(mainFlow.ts/
  UI.ts)零错(全仓余错均系并行会话域 px_*.gen.ts 等既有基线)。
- **登记(观感非遗漏)**:classic 模式向导呈现 = Main.cs:42401-42415 本相——空槽
  52px(0.85 缩放)+inter[24] 单行文案,列表为常规可制集;探针 C6-C9 断言三件套
  齐显,不属缺陷。

### 追补二:真实右键向导对话不开(FX23-R,2026-09-14 用户复测「和向导对话直接打开物品栏,对话框根本不出现」)

- **定谳**(探针扩 PHASE R:真实鼠标右键驱动 `rightClickTileNpcDispatch` 全链+
  `Error().stack` 栈捕获+工作台同格场景):右键落在向导躯干格、而该格脚下恰有
  **合成站/箱等可交互 tile**(向导站家门前=工作台/箱常态)→ 格臂先于交谈臂吞掉
  右键:`interactAt` 合成站尾臂 → `cb.onCraftingStationOpen` →
  `UI.openCraftingStationFilter` → `openInventory(true)`(栈实锤:
  interactAt ← rightClickTileNpcDispatch ← updateUse),`rightDown` 被消费 →
  交谈臂永不跑 → **物品栏直开、对话不开**。
- **翻案终审(原版闩回归)**:`Player.cs:32188-32197` 交谈闩——光标悬停城镇 NPC
  交谈气泡(currentNPCShowingChatBubble>-1 ∧ (talkNPC==-1 ∨ !npcChatRelease))→
  `releaseUseTile=false` ⇒ `:32414 if(flag)` 包住的【全部】标准格交互支让位 ⇒
  交谈臂(Main.cs:43807 !tileInteractionHappened)开对话。本仓 2026-09-07 任务书
  判「格交互恒赢」(BJ25 诚实偏离,依据=向导旁猪罐右键=开罐)被本实报推翻。
  **原版闩天然仲裁双向**:光标在帧盒内=NPC 赢;帧盒外(BJ25 猪罐主诉的光标落在
  罐格、向导只是邻位)=格臂照常——两代用户实报并存自洽。
- **修**(`src/core/Game.ts` rightClickTileNpcDispatch 头 `bubbleLatch`,谓词=
  SW-BJ66 坐椅支同式 `npcChatBubbleHovered ∧ (未对话 ∨ _prevRightDown)`,只辖
  箱臂/chestTile 臂/interactAt 三格臂;**物品层右键臂**(矿车套件 5289/可疑之眼
  43/altUse 放置族)原版属 ItemCheck 域先于 LookForTileInteractions,不受闩辖,
  分派序原位)。闩施放不消费 rightDown(原版闩只消 releaseUseTile,交谈消费仍
  在尾臂)。坐椅支 BJ66 闩被头闩包含,保留原位作 interactAt 直调面防御。
- **测试**:`tests/sw-bj25-interact-priority.test.ts` 重锚终审——①(a) 帧盒内
  猪罐格=对话赢(原版)、①(b) 帧盒外猪罐=开罐(BJ25 主诉存活面)、③④ 补帧盒
  外光标采样+帧盒内闩面;②⑤⑥⑦ 期望不变全数存活。16/16 绿;
  bh1/bj52/bj66/fx30/bn3 邻域 126 测试全绿。
- **探针**:PHASE R 四态全绿——R1 洁净右键=只开对话(invPanel 不动+零
  openInventory);R2 工作台同格右键向导=闩让格臂+对话开(零 openInventory/零
  站点过滤);R5 帧盒外右键工作台=格交互照常(开包+站点过滤 station/18);
  R4 点「住房」→ DisplaySlots_5 角标显 → 点角标=对话收+开背包(原版
  :40535-40536)。A/B/C 三相(制作钮三态)保持全绿,合计 45 断言。
  探针注意事项:真实右键按住须 ≥500ms(首秒 vite 编译抖动会让 220ms 按压
  跨过零个已处理 tick=边沿丢失伪影);帧循环熔断异常走 console.error 不进
  pageerror,探针须挂 console 捕获+`g.running` 检查。

---

## 附节:downed* 旗面存档审计批(2026-09-14,ox-alpha)

> 用户关切:【已击败 BOSS 在世界存档的存储是否正常,避免打败后又反复出现】。
> 审计范围:原版旗面(NPC.cs downed* 族+序列化站)→ 本仓写点 → 序列化面 → 消费面。
> 台账定位:不属 FX33/FX11 既有账(save-parity-gaps.md 无本批五项,均为新定谳)。

### 一、原版旗面(锚)

- **声明**:NPC.cs:6352-6434 downed* 静态族(downedBoss1/2/3/QueenBee/SlimeKing/
  Goblins/Frost/Pirates/Clown/PlantBoss/GolemBoss/Martians/Fishron/HalloweenTree/
  HalloweenKing/ChristmasIceQueen/ChristmasTree/ChristmasSantank/AncientCultist/
  Moonlord/TowerSolar/Vortex/Nebula/Stardust/EmpressOfLight/QueenSlime/Deerclops/
  MechBossAny/1/2/3)。
- **写点**:NPC.checkDead switch(NPC.cs:80100-80310)——四塔 80137-80156、245/370/
  636/668/657 80162-80174、小丑 80193-80196、222/439/398/50 80203-80232、
  125/126→MechBoss2+Any 80239-80244、262 80249、4 80257、13/14/15/266→Boss2 80266-80279、
  35 80281-80285、127→MechBoss3+Any 80287-80291、134→MechBoss1+Any 80293-80297、
  113→hardMode 80299-80310;五节日 Boss(NPC.cs:80029-80053,南瓜/霜月门内);
  入侵四连(Main.UpdateInvasion Main.cs:65305-65326);DD2 三档(DD2Event.Save
  DD2Event.cs:151-157=DownedInvasionT1-3,WL 段 WF:1369)。
- **序列化站**:WorldFile.SaveWorldFlags(:1264-1437)逐位 bool 写/Load(:2088-2391)
  逐位读(v118 史王/v131 三位/v140 四塔/v223 光女史后/v240 鹿角怪版本门)。
- **本仓建模**:save.flags 为 Record<string,boolean>(JSON 全键往返,serialize.ts:565
  写/SaveFile.ts:417 读回),boss 击败链统一写 `downed_<vanillaId>`(Game.ts
  `downed_${vanillaId}`,双子归一 125=原版 downedMechBoss2 双 case 同旗),.wld 域经
  WldParser(导入)/WldHeaderFields(导出)双向映射。

### 二、定谳五项(均=键域断裂,行为面不显——序列化 Record 全键往返本就无损)

| # | 缺口 | 原版锚 | 修 |
|---|---|---|---|
| 1 | **downedMechBossAny 运行时零写**:击败链只写 downed_134/125/127;仓内消费面全派生所以无感,.wld 导出 getter 单读命名键→自建国度击机械后导出恒 false | NPC.cs:80243/80286/80293 | Game.ts 击败链 125/126/127/134 双写命名键;导出 getter 改并读(vid 四键∪命名) |
| 2 | **downedClown 运行时只写 downed_109**(命名键导入才有):导出恒 false | NPC.cs:80193-80196 | Game.ts 小丑记账双写;WldParser 导入双写 downed_109;getter 并读 |
| 3 | **五节日 Boss 只写 vid 键 downed_325/327/344/345/346**(Pumpking/哀木/常绿树/冰女王/圣诞坦克):导出(读命名键)与表情门(读 vid 键)双向半瞎——导入域曾只落驼峰键=表情 54-58 永不解锁(镜像 R3-C3 downedFishron 同族) | NPC.cs:80029-80053 | Game.ts 月事件击杀链双写命名键;WldParser:463-467 双写 vid 键;getter 并读;EmoteMenu 双读 |
| 4 | **DD2 键域分裂**:运行时写 downedOldOnesArmyT1-3(存档 JSON 域),导入/导出域用 dd2DownedT1-3(DD2Event.Save 位)——自建国度 DD2 胜利导出三位恒 false;旧导入档表情 133/ctx.dd2Active 不解锁 | DD2Event.cs:151-157/318 | OldOnesArmy WinInvasionInternal 双写;getter 并读;Game.ts:5481/EmoteMenu:103 双读 |
| 5 | **downedBoss2 导出 getter 单读 downed_13**:只杀过克脑(266)的世界导出 downedBoss2 恒 false(仓内消费面 OR 口径无感,.wld 域丢位→原版读档陨石/进度域回退) | WF:2089/:2106 | getter 改 downed_13‖downed_266 并读 |

附:**键语义勘误**(行为等价,归正防新消费点踩坑):Game.ts 向导 helpText 聚合
`iceQueen/xmasTree/santank` 三 vid 键互换(344↔345↔346,NPCID.cs:11759-11763)——
唯一消费点 1156 提示门三者任一即隐,三键互换后行为恰好等价,已归正键位。

### 三、「反复出现」路径判别(消费面巡检结论)

- **旗驱动不该再触发(已验闭)**:EoC 夜间自然生成 `!downed_4`(Game.ts:10007);
  机械自然 roll 三王全灭即停(:10017);骷髅王败→老人自灭/裁缝转正(:9561 链+9712);
  Deerclops 暴雪雨夜 `!downed_668‖1/4`(原版同款降频,非禁刷:Main.cs:64598-64614);
  石碑/邪教徒链门 hardMode+downed_245+downed_35(:9474 区)。
- **原版允许再召唤(非缺陷)**:机械/史王/蜂后/史后/光女/猪鲨召唤物不设门;
  Plantera 花苞再生、Golem 神庙祭坛、哥布林/海盗/雪军团/火星入侵可重复(击败只降
  自然 roll 频率 Game.ts:9907/9917 原版 Main.cs:66429/:66441 同式);南瓜/霜月夜夜
  可开;小丑血月再现(原版无 downed 门)。以上旗位只挂灯笼夜/表情/图鉴/向导提示
  等周边,不构成"该停不停"。
- **序列化面结论**:save.flags Record 全键 JSON 往返无损(SaveFile.ts:75/194/417),
  缺位=缺省 false 向后兼容;.wld 导出位与原版 SaveWorldFlags 同序同版本门
  (WldHeaderFields 写侧恒 v325);FX33/FX11 判例域未重报。

### 四、验证

- 新测试 `tests/downed-flags-roundtrip.test.ts`(8/8 绿):①存档 JSON 全 downed 键
  round-trip 全等+缺位缺省 ②运行时键态→exportWld→parseWldToSave 逐 vanilla 位
  为真(五项修复回归锁) ③旧导入档命名键态→导出位为真(旧档兼容) ④变异证红×2
  ⑤表情门双键两态解锁 54-58/133。
- 既有套件全绿(共 345 例):save/wld 域 sw-fx11-save-parity/save/wld-export/wld/
  save-migration-v4/banner-kills-save/golden-wld-meta/sw-fx43-wld-compat/wld-real/
  wld-secret-seed-import/zz-red-wld-oxalpha;boss 域 boss-summon/boss-bars/
  boss-pylons/boss-music-parity/bossAI-deerclops;事件域 eclipse-lunar/
  lunar-final-audit/old-ones-army/iii224/iiiii225/emote-menu/emote-pick。
- tsc 触碰文件(Game.ts/OldOnesArmy.ts/WldParser.ts/WldHeaderFields.ts/EmoteMenu.ts/
  新测试)零错;全仓余错均系 px_*.gen.ts 生成域既有基线。
- 实机探针未加(判据:round-trip 测试直用生产 saveGame/loadSave/exportWld/
  parseWldToSave 四函数=与实机同一条持久化链,无浏览器分支;浏览器探针不增判别力)。

---

## RB28 渲染域红队三 findings(2026-09-14,ox-alpha)

> 探针 `scripts/_rb28-render.mjs`(FX21/24/25/26+轮8-FX27 散修对抗面)红队复核
> 定谳三 findings:F1 通支尺寸(MED)、F2 MouseText 三源 claim 序(LOW,三处)、
> F3 描边两族统一(LOW)。原版锚全数 1457 反编译直读。

### F1(MED):drawProj 通支 dest=碰撞盒 → 贴图原生×scale

- **定谳**:`src/entities/WeaponProj.ts` drawProj 通支(frames≤1 且 drawSize=0 缺省)
  曾以 `dw=e.w`(碰撞盒宽)为绘制宽、按贴图纵横比推高 → 贴图宽≠盒宽的投射物被
  拉伸到命中盒。原版 DrawProjDirect 通支(Main.cs:35475)=source `(0,0,texW,texH)`、
  `scale=proj.scale`(origin40.x=num153=(texW−proj.width)×0.5+proj.width×0.5
  =:30130 化简 texW/2,与本函数 num145 同式,锚点不动)。实锤:雨云雨滴
  239(贴图 2×40)误绘 4×80、245(2×30)误绘 4×60。
- **修**:`dw = drawSize>0 ? drawSize : (img0 有图 ? img0.width : e.w)`——drawSize>0
  保留调用点显式覆盖;0 与 -1 归一为贴图原生语义;无图 fallback=e.w 不变。帧支
  dest 宽同源修正(237/238/243/244 盒宽=贴图宽,几何零变化)。
- **验证**:探针 C2b=239 bbox 2×40/245 bbox 2×30(修前 4×80/4×60);C1/C3/C4
  帧通道面零回归;rain-cloud/rain-cloud-mp/enemy-proj-draw-parity/cloud-parity/
  weapon-proj-ledger-clean/dynbox-anchor/ai016-bomb-ballistics 等 7 文件 152 测试绿。

### F2(LOW):MouseText 三源 claim 序对齐原版

- **a) NPC 名赢箱文本**:`tickHoverNpcName` 让位门(原 `cursorItemIconText!==''`
  即让位)撤销——原版 :43820 门=`flag && !mouseText`(接口层 claim 域);箱文本属
  DrawInterface_40 层绘制(:45859),被 39 层 HoveringOverAnNPC+40 头门
  `if (HoveringOverAnNPC || mouseInterface) return`(:45794/:45858-45861)压制,
  非让位集。城镇 NPC 帧盒悬停时覆盖 claim(=NPC 名赢)。
- **b) 信息图标悬停置前**:`tickInfoAccs` 的 infoAccHover 检测不再以
  `cursorItemIconText===''` 为门——原版 layer 28 MouseTextNoOverride 先 claim 锁死
  后续(Main.cs:20345-20348 noOverride 锁缓存/:48075 调用站);旧门读 tickCursorIcon
  先行写入的世界 claim → infoAccHover 恒 -1,hideInfo 点击整链丢失。现无条件
  hitTest,命中即覆盖 claim(=label 置前;对 NPC 名/箱文本的仲裁=原版 28<39 先
  claim 锁后续同效)。调用序面:tickCursorIcon(Game.ts:9090)先于
  tickInfoAccs(:10540)。
- **c) 持物不早退改锚偏移**:`Renderer.drawMouseTextLayer` uiHeld 整支早退撤销,
  改 `mouseTextAnchor(..., { heldOnCursor: c.uiHeld })`(锚 X+=34)——原版
  MouseTextInner `if (!mouseItem.IsAir) X += 34`(:20390-20392)仅偏移不早退,NPC 名
  在拖拽物下仍显示;债 BJ7-R1 清偿(删"helper 留参不接线"错误注释)。uiBlocking
  (mouseInterface)早退保留(:45794 40 层头门域);drawCursorItemIcon 图标支
  uiHeld 门保留(持物不画图标)。
- **验证**:探针 B2=uiHeld 名照画且正文锚 dx=+34;B3 uiBlocking 零绘制;BJ7/BJ1
  测试重锚(fx30 结构锁限 drawMouseTextLayer 切片;BJ1"前置 claim 让位"用例翻转为
  F2a 覆盖语义)后 19+28 全绿;sw-bj72/cursor-color/tool-cursor-icon/
  info-accs/info-accs-p0 全绿。

### F3(LOW):描边两族统一 2px 轴向

- **定谳**:canvas 族(InfoAccsLayer/drawMouseTextLayer)已按原版
  DrawBorderStringFourWay ±2px 轴向;DOM 族仅 vinvBuildChest 箱名+箱钮两处为
  1px 对角 text-shadow。
- **修**:`src/ui/UI.ts` vinvBuildChest 两处统一
  `text-shadow:2px 0 0 #000,-2px 0 0 #000,0 2px 0 #000,0 -2px 0 #000`
  (经典布局零变化,白名单外)。sw-fx30 结构锁同步更新。
- **验证**:探针 E1 computed style=2px 轴向族;sw-fx30-grid-toggle/vanilla-inv-
  layout/sw-fx28-chest-embed 全绿(vanilla-inv-layout 一条 BJ81 域 `.sw-itemsearch`
  断言漂移系既有基线红,非本批)。

### 验证汇总与登记

- 探针 `SW_ORIGIN=http://localhost:5214 node tools/run-diag.mjs scripts/_rb28-render.mjs`
  =23/23 PASS(A/B/C/D/E 五相);E2(对话框圆角兜底)转 SKIP——`.sw-npc-bg`/
  Chat_Back 8px 兜底域已不在当前盘面(对话框 DOM 并行批重构),分镜面漂移待对话
  框域批重锚,非本批域(登记债)。
- tsc 触碰文件(WeaponProj.ts/Game.ts/Renderer.ts/UI.ts+测试)零错。
- 收官测试:rain-cloud 族+投射物绘制面 152+cursor/chest 域 113+BJ7/BJ1/fx30
  全绿。

## RB28 对话域红队三 findings(2026-09-14,ox-alpha)

> 探针 `scripts/_rb28-dialog.mjs`(刀19/20+FX22/23/27 对抗面;本批复跑 47 断言
> ALL PASS)。定谳三 findings:F1 发型入口缺 minimize(MED)、F2 快乐度浮层 Esc
> 死码注释(LOW)、F3 按钮悬停命中盒扩张(LOW)。原版锚全数 1457 反编译直读。
> (注:Game.ts:10017 另有既有「RB28-F1」标记属 EoC 别名键并读,不同波次,勿混)

### F1(MED):发型入口补 minimize(会话保持)

- **定谳**:`npcDialogButton('hair')`(Game.ts:34825)只播音效+`cb.onHairWindow`,
  面板不动 → 理发窗(CharCreation)叠在对话面板上双面板同显。原版
  StylistHairWindow.Interact(NPCInteractions.cs:437-440)→ OpenHairWindow
  (Main.cs:44390-44403)=`npcChatText=""` 且 talkNPC 不清(:44396)=刀19 minimize
  同语义(旧注释锚 Main.cs:43073 系行移陈旧,已勘误)。
- **修**:hair 分支补 `this.minimizeNpcDialog()`——面板收+理发窗独显+dialogNpc 活;
  apply/cancel 链 closeNpcDialog 已在 mainFlow.ts:500/:502 落位。登记差异:原版
  :44395 `playerInventory=false` 半边未接(理发窗全屏模态无共显面,不影响语义)。
- **验证**:探针 H1=面板收+理发窗开+会话保持;H2=物理 Esc 一发理发窗收+会话清
  (NpcDialog Esc 闩随 minimize 对称摘除,Esc 直达 CharCreation onCancel=
  CancelHairWindow SetTalkNPC(-1) 同相;main.ts 链 closeNpcDialog 幂等收敛)。

### F2(LOW):快乐度浮层 Esc 死码注释更正(行为面不动)

- **定谳**:NpcHappinessPanel.open 的 window capture Esc 监听(NpcDialog.ts:690)
  原注释称「只关浮层,不连带关背后对话框」与行为相反——NpcDialog 自身 Esc 闩
  (同为 window capture,:435)注册在先(浮层只能从对话按钮点开,对话闩必然先挂),
  同节点同相位按注册序派发,闩的 stopImmediatePropagation 先行吞事件,浮层监听
  永不可达;Esc 实际=对话+浮层双收。与原版同相:ReportHappiness(NPCInteractions.cs
  :303-313)把报告整段写进 npcChatText,原版无独立浮层,Esc 整段关——按最小修
  原则更正注释+登记脆弱点(若对话闩日后摘除/改序,浮层监听原地复活静默把 Esc
  翻成「只关浮层」,届时须删监听或显式接正),行为面零改动。
- **验证**:探针 K2 改直驱 `ui.showNpcHappiness`(原钮门=无家 NPC 无 happiness 钮,
  曾点 status 空转=断言空转,已修)=浮层曾开→Esc 一发浮层+对话双收,实证死码定谳。

### F3(LOW):按钮 hover 命中盒扩张 → 绘制/命中解耦

- **定谳**:`.sw-npc-btn:hover{transform:translateX(-15%) scale(1.3333)}` 直接在
  button 上=DOM 命中盒随悬停 24→32px(NPCChatPanel.cs:117-118 flag=
  rectangle.Contains 恒为压缩文本矩形;1.2 悬停缩放只作用文字绘制 :120-125,
  左扩补偿=0.15×压缩宽);右缘外 elementFromPoint 中自身+行向缝被劫走。
- **修**:缩放承载移至内层 `.sw-npc-btn-t`(pointer-events:none),button 本体零
  transform=命中盒恒宽;压缩系数与悬停左扩补偿走 CSS 变量 --cx/--hx(TS 逐钮置
  值——span 版面宽=未压缩宽,--hx=15%×压缩宽/自然宽换算,直接 -15% 在压缩钮上
  会过量左移);`.sw-npc-excl` 补 pointer-events:none(:136-139 图标在命中矩形外,
  旧实现命中右缘恒 +14px 同族)。悬停绘制几何零变化(matrix scale=1.3333+左移)。
- **验证**:探针 P1a-P1d=命中盒恒定(24→24)+span 缩放 1.3333/shiftX −4px+右缘外
  不中自身+30px 行缝不劫走;P4 窄屏(面板 scale 0.68)命中面零回归。

### 验证汇总与登记

- 探针 `SW_ORIGIN=http://localhost:5216 node tools/run-diag.mjs --timeout=420000
  scripts/_rb28-dialog.mjs` =47/47 ALL PASS(原 41 断言+H1-H3+P1 一拆四;S/E 相
  会话建立偶发环境抖动=NPC 游走 keepAlive 正确行为,重跑自愈,非本批域)。
- tsc 触碰文件(Game.ts/NpcDialog.ts)零错(px_*.gen 与 world/gen 模块解析为既有
  基线噪音)。
- 守卫五件套:sw-bj25/sw-bj66/sw-fx32/sw-bn3/sw-bh1 = 95/95 全绿。
- 登记债:①`?play` 快开链 selectedAppearance=null→onHairWindow 防御早退
  (mainFlow.ts:491)——真实游玩链 appearance 恒在,探针以 defaultAppearance 自备
  (循 E8 金币自备先例);②OpenHairWindow `playerInventory=false` 半边未接
  (F1 修内注释已标)。

## RB29 向导制作双回归(2026-09-15,用户实报「classic 点制作开 modern 窗」+「窗关后两钮消失」)

> 探针 `scripts/_fx28-guide-regress.mjs`(37 断言,P0/A/B/C/D 五相)——私有 vite
> SW_PORT=5217。定谳:回归1=BJ83 烤档迁移没收用户显式 classic(Options load 卫门,
> 真缺陷已修);回归2=切换钮/就近箱钮消失**不成立**(现码探针钉死在位,就近箱隐=
> 原版本相),真可见异常=金标指示条缺向导支(连带修)。

### 回归1(MED,已修):classic 控制下点「制作」开 modern 窗

- **根因**:BJ83(2026-09-14)烤档一次性迁移(Options.ts load 卫门
  `!craftingGridControlMigrated && craftingGridControl==='classic'` → modern+落旗)
  对存储态**无法区分「FX30 窗口期烤档 classic」与「用户右键切换钮显式 classic」**
  (CraftingUI.cs:322-331 右键循环=唯一持久化写点)——用户显式 classic 于 BJ83 落地
  后首次 load 被无声翻 modern → `openVanillaGuideCraft` 走 modern 支(:40729-40731)
  开窗。**分支门本身无失效**(探针 A 相:classic 态点制作=经典三件套+窗不开,42401-42415
  本相全绿);被改的是门**读到的存档值**。
- **取证**(探针 P0 相,修前红/修后绿):set(classic) 落盘 → reload →
  control=modern+migrated=true(修复前)/classic 原样(修复后)+端到端点制作不开窗。
- **修**:迁移块**退役**(Options.ts 迁移位注释全存档)。依据:①BJ83 目标人群
  (烤档卡 FX30 宫格)在 09-14 起每次 load 已全部迁移+落旗,撤除对已迁移档零影响;
  ②classic 域自 FX30 刀②+BJ85 功能面完满,未知归属 classic 档保持 classic=忠实存档;
  ③新档缺省仍 modern(Player.cs:363)。`craftingGridControlMigrated` 字段保留
  (旧档记账,无写点)。
- **用户恢复路径**:右键切换钮一轮即回 classic(退役后持久化不再被任何 load 卫门冲写);
  此前被翻档者需手动切回一次(状态已不可逆,登记)。

### 回归2(定谳不成立+连带一修):窗经切换钮关闭后「两钮消失」

- **切换钮**:探针 C 相实锤——窗经窗内切换钮(42,285)关闭后,切换钮回
  (94,300+adjY) 显(Main.cs:42438 `num67=InGuideCraftMenu?300:450`+num52)、offsetParent
  非空、帧 2(list);用户截图所述「消失」在现码不可复现(截图疑为 BJ85 前盘面或
  观感误读——钮位于向导槽 (73,331+adjY) 右上 20px,视觉贴槽)。
- **就近箱钮**:向导态隐=**原版本相**(Main.cs:42440
  `if (!InGuideCraftMenu && InPipCrafting)` 门——InGuideCraftMenu 期间不画;pos 闭包
  `vinvGuideMenuOpen→null` 非过杀,探针 C7 钉死)。
- **连带真修(LOW)**:金标指示条 pos 闭包缺向导支——条滞留 (94,450+adjY+17) 与钮
  (94,300+adjY) 脱钩,向导态旧钮位悬空金条=截图可见异常。原版条画在**钮位**
  (CraftingUI.cs:275-278 `Utils.DrawSelectedCraftingBarIndicator(craftX,craftY)`,
  craftY=num67)。修=闭包补 `vinvGuideMenuOpen → (94,300+adjY+17)` 支(UI.ts)。
- **「关闭」对话钮路径**(探针 D 相):向导态内面板已收(minimize),用户实际路径=
  再交谈重开面板(原版开话链首站 IngameUIWindows.CloseAll(quiet) 先收背包,FX23
  B-pre 同相)→ 点「关闭」=面板收+会话清 → 重开背包后两钮回 (94,450/490+adjY)
  常规位+向导槽隐+条回位,全绿。

### 验证汇总

- 探针 `_fx28-guide-regress.mjs` =**37/37 ALL PASS**(P0 根因取证 5/A classic 12/
  B modern 4/C 窗关 8/D 关闭路径 8);截图 /tmp/fx28-guide-{classic,modern,
  window-closed,after-close}.png。
- 复核探针:`_bj83-station-mutex.mjs` ALL PASS(MG 相翻新=RB29 退役面:烤档 classic
  重载原样存续+显式 classic 保留);`_fx23-guide-talk.mjs` 45/45 ALL PASS;
  `_fx19-guide-probe.mjs` ALL PASS。
- vitest:sw-bj83(迁移 describe 重锚=RB29 退役锁:禁回植+RB29 标记在档+缺省仍
  modern)/sw-fx30(补条随钮向导支锚,变异证红)/sw-fx28/sw-fx32/sw-fx39/
  vanilla-inv-layout/sw-fx10-debts/sw-fx41-modern-crafting = 8 文件 253 测全绿。
- tsc 触碰文件(Options.ts/UI.ts+两测试)零错。
- **改动面**:`src/core/Options.ts`(迁移退役+两注释)/`src/ui/UI.ts`(指示条向导支)/
  `tests/sw-bj83-station-dispatch.test.ts`(重锚)/`tests/sw-fx30-grid-toggle.test.ts`
  (补锚)/`scripts/_fx28-guide-regress.mjs`(新)/`scripts/_bj83-station-mutex.mjs`
  (MG 相翻新)。
