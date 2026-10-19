# NPC 对话呈现 1:1 重写 · 接入面盘点(2026-09-14,只读盘点)

为「对话框呈现 1:1 重写」(vanilla-inventory-refactor-20260907.md 刀20)做的接入面分析。
交互层(Game.ts `npcDialogButtons`/`npcDialogButton` 回调链)**保持不动,只动呈现**。
所有锚均已亲读源码核对(仓库侧 TS + 反编译 1457)。

---

## 〇、先定谳:原版呈现真相(★修正刀20 取锚,动刀前必读)

刀20 注「气泡=世界锚定 NPC 头顶,待下窗精读 :44950 域取气泡偏移」——**已精读,两处旧锚均系误锚**:

1. **对话面板不是世界锚定,是屏空间 top-center 面板。**
   原版 1457 对话渲染器 = `Terarria1457/Terraria.GameContent.UI/NPCChatPanel.cs`(1.4.5 新面板,
   取代 1.4.4 旧 `Main.DrawNPCChat`):
   - 调度:`Main.GUIChatDraw`(Main.cs:47486,门 = `npcChatText != "" || player.sign != -1`,且 `!editChest`)
     ← `DrawInterface_23_NPCSignsDialog`(Main.cs:46475)——**NPC 对话与路牌共用同一面板层**(本仓路牌是独立 DOM 面板,登记差异)。
   - `NPCChatPanel.Draw()`(NPCChatPanel.cs:52-86):面板矩形 =
     `Rectangle(screenWidth/2 - 250, 100, 500, 30 + 30*台词行数 + 30*按钮行数 + max(0, 2*(按钮行数-1)))`
     (:65-68)——宽 500、**屏幕水平居中、y=100 顶置**;底 = `TextureAssets.ChatBack`(ChatBack.png)
     两段式贴图(主体切片 + 底部 30px 帽,:71-72),乘色 (200,200,200,200)。
   - 文本:`DrawText`(:217-265)= 面板 TopLeft+(20,20) 起、行高 30、MouseText 字体;
     `talkNPC != -1` 时富文本(ChatManager.DrawColorCodedStringWithShadow),路牌编辑态走四向描边。
   - 头像:`Main.DrawNPCPortrait(chatBack, rectangle.TopLeft())`(Main.cs:41012-41173,**由面板 TopLeft 锚定,
     画在面板左外侧**):圆框中心 = TopLeft + **(-56-6, 56+6)**(:41020-41022);打开首 120 帧有
     EaseOutBounce 落下动画(80 帧程,:41033-41037);Detailed=贴图帧居中直绘;CloseUp=dummy NPC scale3 +
     96×96 scissor(Y 上让 50,:41066-41101);FullBodyRetro=scale2 底对齐(:41103-41120);Disabled=整段不画。
     名字 = `GivenOrTypeName`,ItemStack 字体、白色、圆框底心(框心 + (0, 57),:41122-41128)。
   - 按钮:`NPCChatPanel.DrawButtons`(:88-162)= **面板 BottomLeft + (30, -22*按钮行数 + max(0,2*(行数-1)) - 4)**
     起排(:93),**每行 4 个、行高 22px**(:103-107),文字 scale 0.9、悬停 1.2 + 阴影 Brown(:96/:119/:121),
     悬停音效 12 走**进/出双边沿**(`_lastHovered` 语义,:157-161);金币条 = `ItemSlot.DrawMoney`
     画在该按钮 (X-45, Y-44),随后游标 X+=106(:140-144);感叹图标 = 文字右 +8px(:136-139);
     点击 = 面板内 `mouseLeft && mouseLeftRelease` → `interaction.Interact()`(:145-155);
     整个面板矩形含鼠标即置 `mouseInterface`(吞世界点击,:81-84)。
   - 角落物品:`Main.DrawNPCChatBottomRightItem(rectangle.BottomRight())`(:80 → Main.cs:40480)。
2. **世界锚定的只有 NPC 头顶的小对话泡(hover 指示),且由悬停置位而非对话会话。**
   `Main.DrawNPCChatBubble(int i)`(Main.cs:43865-43890)= `TextureAssets.Chat`(Chat.png)画在
   `npc.position.Y - Chat.Height()`(头顶),X = NPC 中心 ± (width/2+8)(尾巴朝向按 `spriteDirection` 翻),
   `mouseTextColor` 白脉动乘色,`gravDir != 1` 时整泡垂直翻转(:43881-43882);画在
   `DrawInterface_1_1_DrawEmoteBubblesInWorld`(Main.cs:47231-47240)的 **GameViewMatrix.ZoomMatrix 世界 pass**
   (与 EmoteBubble 同层同矩阵 = 随 zoom 缩放)。置位点 Main.cs:43799 = **悬停** NPC 命中帧盒时
   `currentNPCShowingChatBubble = i`(单值;stinky/mouseInterface/dead 压制)。
3. **刀20 引的 `Main.DrawNPCChatButtons`(Main.cs:41177-41246,y=130+numLines·30, x=180+(sw-800)/2)
   在 1457 全树零调用站 = 死码**(1.4.4 旧渲染器残留;`command grep -rn` 全树仅定义行)。
   文本行按钮的活实现是上表 `NPCChatPanel.DrawButtons`(面板相对几何)。**重写按死码几何取数 = 整体错位。**
   另:刀20 注「:44950 域」实为 `DrawClothesWindow` 的门(Main.cs:44950),非气泡绘制。

> 结论:重写目标几何 = **屏空间 top-center ChatBack 面板(500 宽,y=100)+ 面板内文本行按钮 +
> 面板左外侧头像圆框四模式 + 面板右下角标 + 世界锚定 hover 小泡(Chat.png,ZoomMatrix pass)**。
> 「NPC 世界锚定气泡」只覆盖最后一项,不是对话面板本体。

---

## 一、NpcDialog.ts 全结构(`game/src/ui/NpcDialog.ts`,603 行)

模块级导出:`NpcButtonId`(19 键,:22-24)/`NpcButtonMeta`(:27)/`HappinessInfo`(:34-40)/
`happinessFace`/`happinessPct`(:43-53,Main.cs:41235-41240 四档)/`ShopEntry`(:55-77)/
`ShopCellHover`(:83-88)/`formatCopper`(:209-211,Lang.ValueToCoins)/`medalPriceText`(:92-94);
数据:`PORTRAIT_OFFSETS`(vanilla-portrait-offsets.json,NPCID.cs:4517/:4681)。

CSS 常量(:96-205,ctor 里按 `#sw-npc-style` 幂等注入一次,:219-224):
- `.sw-npc-dialog`:**fixed left:50% bottom:120px translateX(-50%)**,宽 560/max-94vw,z-index 22,
  `pointer-events: auto`(★父 `.sw-root` 是 pointer-events:none,子面板必须显式开,:100 注)。
- `.sw-npc-body/.sw-npc-portrait`(76×92 canvas,`sw-portrait-hop` 弹跳 keyframes ≙ 原版 EaseOutBounce 落下)、
  `.sw-npc-name/.sw-npc-chat/.sw-npc-btns`(flex-wrap,每 4 个换行近似原版 num%4)、
  `.sw-npc-coins`(按钮上方 abspos)、`.sw-corner-item/.sw-corner-equip`(**@media (max-width:560px),(pointer:coarse) 收位**,:131-134)、
  `.sw-npc-excl`(UI_quickicon1 亮度脉冲,Utils.cs:448)。
- 同文件还有 `.sw-npc-shop`(SW-BJ22 货架 10×4=42px 格)与 `.sw-happy-panel`(bottom:200px 浮层)。

`class NpcDialog`(:213-443):
- ctor(parent, onButton, onCorner?)(:217-225):parent = `ui.root`(.sw-root)。
- `open(name, chat, buttons, portrait?, vanillaId?, corner?)`(:230-317):
  首行 `this.close()`(**重建式刷新**——refreshNpcDialog 每次全 DOM 重建);innerHTML 一次成型;
  金币条挂在**按钮自身**(button 已 relative;曾插容器被 flex static-position 坑成最左,审查 P1,:265-278);
  角标 corner>0=任务鱼 img(title 已注入名),corner=-1=DisplaySlots_5/7 hover 换图快捷图标(:254-293);
  按钮 hover=`UISfx.hover`、click=`UISfx.click`+`onButton(dataset.b)`(:294-300);
  **Esc 捕获监听**(:306-316):capture 阶段 `stopImmediatePropagation`+`preventDefault` → `onButton('close')`;
  `chatInput.isOpen` 时让位(先收聊天,:310);开时音效 menuOpen 由 Game 侧播。
- `drawPortrait`(:325-431)三分支:Detailed=Portrait 圆框图 alpha 包围盒 cover 铺满(本仓矩形框适配);
  CloseUp=变体贴图行 0 ×6(宠物 num15 特支 :374-385);FullBodyRetro=行 0 ×4 底对齐;
  IMG-SELF-HEAL 两段 URL + 1s/2s/4s 退避 TTL 10s(:342-359)。
- `close()`(:433-440):**capture 位对称摘除**(监听器身份含 capture,漏传=全局 Esc 永久截胡,P0 判例);
  `isOpen` getter(:442)。

`class NpcShop`(:445-557)/`class NpcHappinessPanel`(:563-603)同文件:**不在本刀范围**
(商店 SW-FX32 已迁 vanilla 内嵌货架,仅 classic 面板保留;心情浮层=登记差异)——重写时勿动坏,
注意它们共享同一份 CSS 常量与 `#sw-npc-style` 注入。

## 二、回调链(全参数 + 消费点)

```
Game.openNpcDialog(npc, chatOverride?)        Game.ts:33303(调用站 :33212/:33243 右键/唤醒)
  └ cb.onNpcDialog(name, chat, buttons, portrait, vanillaId, cornerItem)   :33341
      └ mainFlow.ts:433 → ui.showNpcDialog(name, chat, buttons, portrait, vanillaId, cornerItem)  UI.ts:6311
          └ NpcDialog.open(...)               按钮点击/角标点击/物理 Esc →
            onButton(id) → game.npcDialogButton(id)          UI.ts:6313-6317
            onCornerItem(vid) → vid=-1: game.closeNpcDialog()+openInventory;
                                 vid>0: game.insertChatItemTag(vid)        UI.ts:6318-6327
Game.refreshNpcDialog(npc, chat, corner?)     Game.ts:33766(台词区重绘;corner 显式覆写 dialogCornerItem)
  └ 同一 cb.onNpcDialog 六参透传            :33770-33771
Game.npcDialogButton(id)                      Game.ts:34735('close'→closeNpcDialog;各分支见 §二.3)
Game.minimizeNpcDialog()                      Game.ts:35264 → 仅 cb.onNpcDialogClose()
Game.closeNpcDialog(silent=false)             Game.ts:35268 → talking=false → dialogNpc=null →
  dialogHappiness=null → npcShopClose() → !silent&&menuClose → cb.onNpcDialogClose()
  └ mainFlow.ts:434 → ui.closeNpcDialog()     UI.ts:6342(npcDialog+npcShop+npcHappiness 三收
      + _builtLayout==='vanilla' 时 refreshAll(FX32 内嵌货架 display 门))
```

1. **cb.onNpcDialog 六参**(声明 Game.ts:2560):`name`(FullName 拼装,zh "{1}{0}")、
   `chat`(formatDialogTags 后成品)、`buttons`(NpcButtonMeta:id/label/excl/coins)、
   `portrait`(DialoguePortraitPayload:vanillaId/variationIndex/altTexture/shimmered/url,Game.ts:33408)、
   `vanillaId`、`cornerItem`(0=无/-1=RequestHome/>0=渔夫任务鱼 vid;Game.ts:36159,openNpcDialog:33338 置位)。
   消费点:仅 `ui.showNpcDialog`(UI.ts:6311-6340);corner 装配在 UI 侧(iconUrl 懒解析 miss 时整角标不画,:6331-6338)。
2. **cb.onNpcDialogClose**(Game.ts:2561)消费点:仅 `ui.closeNpcDialog`(mainFlow:434);
   另 UI.closeAll(:6172→:6192)与 ui.closeNpcDialog 自身都幂等收敛。
3. **npcDialogButton(id)**(Game.ts:34735-34910)分支与呈现相关语义:
   - `close` → closeNpcDialog(会话清);`shop`/`shopDecor` → openShopFromButton(**会话保持**,:35950 域);
   - `reforge` → **minimizeNpcDialog()+onReforgeOpen**(刀19:会话保持,走远退出门 :42283);`craft` 同构(:34791);
   - `help`/`music`/`advice`/`home`/`stardew`/`status`/`plant`(dyeTrader) → refreshNpcDialog(重建面板);
   - `heal`/`collect` 带 coins;`pet` → petDialogAnimal → closeNpcDialog(:33721)。
4. **刀19 两语义**(呈现重写绝不可破):
   - `minimizeNpcDialog()`(:35264)= 只收 DOM 面板,`dialogNpc`/keepAlive 保留 ≙ 原版 `npcChatText=""`+talkNPC 保持;
   - `tickNpcDialogKeepAlive()`(:35293,固定步内 :7931):Stinky→silent close;dn.dead/开箱/
     worldRegionIntersects 出界 → close(Player.cs:27698-27709)。
5. **Escape 双路**(现状,须原样保持):
   - 物理键 Esc:NpcDialog 自身 capture 监听截胡(:306-316)→ onButton('close') → game.npcDialogButton('close');
   - 虚拟沿(触屏暂停钮/重绑 Inventory 键):`main.ts runInventoryEscapeChain`(:417)现采
     `npcDialogActive: game.npcDialogActive`(:431)→ `resolveEscapeChain`(escapeChain.ts:86,
     序 summon→fullMap→pause→**npcDialogActive**→sign→uiBlocking→dead→inventory)→ 'closeNpcDialog' 分支
     (main.ts:458-466)= `game.closeNpcDialog()` + `ui.inventoryOpen && closeInventory()`。
   - `npcDialogActive` getter(Game.ts:36161)= `dialogNpc !== null`——**minimize 期间仍为 true**,
     会话保持下虚拟 Esc = 真关对话(原版同相)。

## 三、改呈现的触碰面清单

### 3.1 必改/必读文件(mtime 纪律:均为并行会话热文件,开工先重读盘上最新再小粒度 Edit)

| 文件 | 角色 | mtime(2026-09-14 盘点时) |
|---|---|---|
| `game/src/ui/NpcDialog.ts` | 呈现核心(§一全部) | 09-12 03:58(本刀主战场) |
| `game/src/ui/UI.ts` | showNpcDialog:6311 / closeNpcDialog:6342 / showNpcShop:6351(vinv 分支勿动) / closeAll:6172 | **12:50** |
| `game/src/mainFlow.ts` | cb 接线 433/434/448/450 | **12:26** |
| `game/src/main.ts` | Esc 链执行器 :417-466 | **11:53** |
| `game/src/core/Game.ts` | §二全部交互层;若呈现层需要对话/hover 态须开只读口 | **13:17(最新)** |

共享热文件纪律(CLAUDE.md):禁止整文件回写;对方 mtime 比自己读时新 → 先重读;每批编辑后 grep 自己的标记复核。

### 3.2 DOM_UI_TARGET_SELECTOR(`game/src/core/input/domTargets.ts`)

- 表内**已含 `.sw-root`**(:11)——现有 NpcDialog 面板挂在 `ui.root`(.sw-root)子树内,自动被
  `isDomUiTarget` 命中(消费点:`core/Input.ts:229/:289` mousedown/touch 门、`Game.ts:12420` 光标域)。
- **结论**:呈现重写若仍以 DOM 节点挂 `.sw-root` 子树(absolute 定位 + 每帧写 left/top),**零登记改动**;
  若挂到 `.sw-root` 之外(如 body 直挂)则必须把类名登记进本表(仓规:禁止第二份名单);
  若改为 canvas 绘制则点击命中不走 DOM(见 3.4),本表同样零改动。
- 现面板 CSS `pointer-events:auto` 是因为 `.sw-root` 全层穿透——世界锚定气泡若希望空白区透传,
  须在气泡根上显式 `pointer-events:none`、仅按钮/文本行开 auto(参考 `.sw-vinv` none 根+可点子元素模式)。

### 3.3 世界坐标→屏幕坐标换算(单源)

- **`game/src/render/Camera.ts`**:
  - `worldToScreen(wx, wy)`(:75-77)= `(wx - cam.x + punchX) * zoom + viewW/2`——含震屏 punch 与 zoom;
    `cam.x/y` 为视野中心(**世界 px;÷16 = tile**,lavaslope 判例)。
  - `worldToScreenDisplayed(wx, wy)`(:96-99)——★SW-FX27 呈现面垂直镜像(gravDir=-1)下,
    **画在翻转点之后的屏空间层**必须用这个(原版手翻 `screenHeight - y`);世界变换内绘制用 `worldToScreen`。
  - `screenToWorld`(:78-88)输入侧已内置翻转感知;zoom 域 [1,2](Main.GameZoomTarget,2026-09-08 拍板)。
- 渲染插入点先例(`game/src/render/Renderer.ts`):
  - **世界变换内**:表情气泡 `drawEmotes`(:3900 世界 pass、实现 `render/EmoteBubble.ts`;
    锚 = 头顶 + (-dir*w*0.75, 2)、origin 底中、dir≠-1 水平翻转——头顶锚定最贴近的现成先例)。
  - **翻转点**::4239-4256(flipY 整幅自拷镜像)。
  - **翻转后屏空间层**:`signBubbleScreen`(Chat2.png 头顶小泡,:3186 置位/:4288 计算屏幕锚/:15101-15124 绘制,
    `worldToScreenDisplayed` 消费)与 `signHoverText`(MouseText 460px wordwrap+DrawInvBG 底板+四向描边,
    :15125 起)——**「世界锚定 + 文本泡」的完整仓内先例**。
- 每帧驱动通道:canvas 层随 `Renderer.render` 每帧重算(暂停也跟随,推荐);DOM 层现成逐帧通道只有
  `cb.onBuffsFrame`(Game.ts:10430,tick 内 60Hz,**暂停停摆**;`camera.easeZoom` 同在 tick 内 :10446,
  暂停时 zoom 缓动也冻结,故 DOM 桶暂停期视觉一致,但失焦/帧率上限下跟随粒度更粗)。
- canvas 可点 UI 先例:InfoAccsLayer(`render/InfoAccsLayer.ts` 导出 `iconRects` +
  `Game.ts:35223-35250` hover 命中/`_infoAccClickLatch` 单发闩/`renderer.timeUiHover` 吞世界点击)——
  文本行按钮走 canvas 时照此,并把面板矩形并入 `mouseInterface` 等价门(原版 NPCChatPanel.cs:81-84)。

### 3.4 素材(已就位,零搬运)

`game/public/sprites/vanilla/` 已有 `Chat_Back.png`(ChatBack 面板底)、`Chat.png`(头顶泡)、`Chat2.png`(已用)。
src 目前**无任何消费者**(grep 零命中)——即三项都是新增引用。新增 atlas 引用走
`node scripts/atlas-append-1457.mjs` 追加通道,**禁止全量重跑 `scripts/vanilla-atlas.mjs`**。

### 3.5 头像四模式(载荷面已备齐,重写只搬几何)

- 循环键已有:`options.data.dialoguePortraitMode`(detailed/closeUp/fullBodyRetro/disabled,
  Options.ts:144/:342/:465)+ Settings 循环项(Settings.ts:429-436)。
- 载荷已有:`portraitPayloadOf`(Game.ts:33408)一次成型;现算三分支在 `NpcDialog.drawPortrait`(:325-431)。
- 重写要点:圆框几何(TopLeft+(-62,+62))、名字行(GivenOrTypeName/ItemStack 字体/白)、
  EaseOutBounce 落下动画、CloseUp 的 96×96 scissor 语义(本仓用矩形框天然 scissor 近似)。
- `portraitPayloadOf`/`drawPortrait` 的载荷与兜底逻辑(IMG-SELF-HEAL 退避链)原样保留。

### 3.6 勿动面与回归锚

- 勿动:`npcDialogButtons` 注册表(Game.ts:33349)、`npcDialogButton` 分支(:34735)、
  `tickNpcDialogKeepAlive`/`minimize`/`close` 语义、`escapeChain.ts`、NpcShop/NpcHappinessPanel。
- 测试锚(交互层,呈现重写应零红):`tests/sw-bn3-esc-vanilla-align.test.ts`(Esc 链)、
  `sw-bh1-npc-interact-range`、`sw-bj25-interact-priority`、`sw-bj66-sit-npc-priority`、
  `sw-fx32-shop-embed`、`sw-bj8-shop-sell-flow`、`sw-bj22-shop-sell-interaction`、`system-coverage`。
- 探针锚(DOM 类名):`scripts/_portrait-shots.mjs`、`_portrait-repro.mjs`、`_npc-btn-parity-probe.mjs`
  均以 `.sw-npc-dialog`/`button[data-b=…]` 为锚——重写改类名/结构会撕探针,须同步改探针
  (跑法:`tools/run-diag.mjs` + 私有 52xx vite 实例 + SW_ORIGIN,见 CLAUDE.md 防打断约定)。
- 已知既有缺陷(顺手修的候选):`Renderer.ts:4457` 信息饰品隐藏门传的是
  `(player as {talking?}).talking`——Player 实体**无该字段**(Game 只置 `npc.talking` on TownNPC),
  门恒不触发,对话中信息饰品列不隐藏(原版 Main.cs:3103 npcChat 非空∧未开箱即隐藏)。
  重写接对话态时以 `game.npcDialogActive` 为源顺带接正。

## 四、风险清单

1. **取锚定谳风险(最高)**:按「气泡跟随 NPC 头顶」重写整个面板 = 与原版整体错位。原版面板是
   屏空间 top-center(§〇);世界锚定仅 hover 小泡。重写前先原版对照截图/TEdit 定格几何再动刀(迭代准则:先定谳)。
2. **按钮 hover 命中与音效边沿**:canvas 文本行按钮需自建矩形命中 + `mouseInterface` 等价门
   (吞挖掘/放置点击),InfoAccs 先例;原版 hover 音效是**进/出双边沿**(`_lastHovered`,
   NPCChatPanel.cs:157-161),现 DOM 版是 mouseenter 单沿——1:1 重写须改边沿语义。
   DOM 版则注意非矩形/透明区点击穿透与 `pointer-events` 分域。
3. **Escape 链不被破坏的保证点**:①`npcDialogActive` 必须仍由 `Game.dialogNpc !== null` 派生,
   呈现层不得私设开/关态;②minimizeNpcDialog(重铸/向导入口)只收面板不清会话——呈现层若把
   「面板不可见」当「对话结束」会令刀19 修复(重铸槽走远滞留/向导态走远退出)复发;③NpcDialog Esc
   capture 监听与 close() 的**对称摘除**(capture 位含监听器身份,P0 判例)——要么原样保留,要么把物理 Esc
   整体移交 main.ts 链并删监听,**不可两处并存**;④`chatInput.isOpen` 让位支(任务鱼插签后 Esc 先收聊天)不可丢;
   ⑤商店开态 Esc = 关对话级联关店(closeNpcDialog→npcShopClose),呈现层不得单独拦 Esc 关店。
4. **多 NPC/悬停泡与对话泡同屏**:原版 `currentNPCShowingChatBubble` 单值且由悬停置位——对话中悬停
   自己(talkNPC==i)仍可显示小泡(重谈被 :43807 门压),呈现层需明确「对话中 hover 泡照画」;
   repo 侧 hover 判定源 = `Game.npcHoverHit`/`smartInteractNpcId`(Game.ts:33048/:33126,render 层需新开只读态)。
5. **对话时暂停态**:`game.paused` 只冻结固定步,Renderer.render 照跑——canvas 层无碍;
   DOM 层走 onBuffsFrame 时暂停期不更新(相机/NPC 同冻,视觉一致但失焦下跟随粗)。
   autoPause 门只看 `__swUI.inventoryOpen`(Game.applyAutoPauseUI:7714)——**对话开不暂停 = 原版同相**
   (CanPauseGame 无 talkNPC 臂),呈现层不得把对话面板计入任何「界面开」门。
6. **触屏档(T1-T3)与 uiScale**:现面板靠 `@media (pointer:coarse)/(max-width:560px)` 做角标收位,
   改 canvas 后媒体查询失效,须走 `hudTier()`(HudScale.ts d0/t1/t2/t3)分支;世界锚定小泡在 T2/T3
   可能落进 MobileControls 虚拟摇杆/跳钮域(右下瞄准摇杆按 `camera.worldToScreen(玩家)` 搬光标,
   MobileControls.ts:583 先例)造成遮挡/误触;uiScale(0.75..1.5)现只作用 vui/UIScale 与
   vinv K=vanillaScaleFor,不吃 `.sw-root` 面板——原版对话面板画在 `_uiScaleMatrix` 域(吃 UIScale),
   重写需拍板本仓对话面板/按钮文字吃不吃 `UIScale.userScale`(现成物 `vui/draw/UIScale.ts`)。
7. **重建式刷新语义**:`refreshNpcDialog` → `NpcDialog.open` 首行 close = 全 DOM 重建;
   角标(dialogCornerItem 覆写链:status→home 连点保持,审查 P2)、金币条、excl 图标依赖每次全量重画;
   重写若改增量更新必须保这三者的全量刷等价面。UI.closeNpcDialog 的 vanilla 布局 `refreshAll`
   (FX32 内嵌货架 display 门)不可丢。
