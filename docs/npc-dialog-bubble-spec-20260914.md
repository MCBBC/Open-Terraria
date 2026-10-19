# 原版 NPC 对话气泡与按钮精确绘制几何 spec(1.4.5.7 反编译提取)

> 提取日期:2026-09-07(档名沿用任务指定 20260914)。唯一标杆:`Terarria1457/` 反编译源码。
> 所有行号锚 = `Terarria1457/Terraria/Main.cs` 或文中标注的其他文件。所有几何均给公式,无凭印象项。

---

## 0. 架构定谳(先读:与任务前提的三处出入)

1. **`Main.DrawNPCChatButtons`(Main.cs:41177)在 1.4.5.7 是死代码。**
   全反编译树 grep `DrawNPCChatButtons` 仅 1 处命中 = 定义本身(Main.cs:41177);其专用状态位
   `npcChatFocus1..4`(Main.cs:1834/1836/1838/1840)的全部读写都在该函数体内
   (41203-41370),`Terraria/` 下无任何其他文件引用。1.4.4 起对话 UI 被
   `Terraria.GameContent.UI.NPCChatPanel` 取代(Main.cs:2409 `private NPCChatPanel _newChatPanel = new NPCChatPanel();`)。
2. **头顶世界空间气泡不承载台词文本。** 现役头顶气泡 `Main.DrawNPCChatBubble`(Main.cs:43865-43891)
   只画一张 32×26 的"…"提示泡贴图(`TextureAssets.Chat`),触发条件是"鼠标悬停/智能交互目标",
   与 `talkNPC` 无关;台词文本画在**屏幕空间顶部面板**(`NPCChatPanel.Draw`,NPCChatPanel.cs:52-86)。
   "对话文本画在 NPC 头顶气泡里"是 1.3 及更早版本的形态,1457 已不存在。
3. 任务给的三个站位归属:
   - **:44449** = `DrawHairWindow()` 自检门(发式窗口要求 `talkNPC == -1`,否则自取消)——**不是气泡绘制门**;
   - **:44950** = `DrawClothesWindow()` 自检门(衣柜窗口在 `talkNPC != -1` 时自取消)——**不是气泡绘制门**;
   - **:47490** = `GUIChatDraw()` 门——**这才是对话框面板的绘制门**(§5.2 逐字)。

---

## 1. 头顶悬停气泡 `DrawNPCChatBubble`(世界空间,Main.cs:43865-43891)

### 1.1 触发链(谁置位)

```
层 "Vanilla: Interface Logic 1"(接口层表 Main.cs:45475)
  └ DrawInterface_0_InterfaceLogic1 → DrawMouseOver()(Main.cs:43595)
      └ HoverOverNPCs(mouseRectangle)(Main.cs:43664 → 43715-43843)
          └ currentNPCShowingChatBubble = i(43799,先置 HoveringOverAnNPC=true、player.noThrow=4)
层 "Vanilla: Emote Bubbles"(Main.cs:45485-45489,InterfaceScaleType 缺省 = Game)
  └ DrawInterface_1_1_DrawEmoteBubblesInWorld(Main.cs:47230-47240)
      └ if (instance.currentNPCShowingChatBubble != -1) DrawNPCChatBubble(i)(47235-47237)
      └ instance.currentNPCShowingChatBubble = -1(47239,每帧用后即清 → 单实例,非多泡)
```

### 1.2 置位/压制条件(43742-43795 逐字)

```csharp
bool flag = mouseRectangle.Intersects(value);                                   // 43742 鼠标悬停 NPC 命中域
bool flag2 = flag || (SmartInteractShowingGenuine && SmartInteractNPC == i);    // 43743 或智能交互目标
if (flag2 && ((nPC.type != 85 && nPC.type != 341 && nPC.type != 629 && nPC.aiStyle != 87) || nPC.ai[0] != 0f)
        && (nPC.type != 694 || nPC.ai[3] != 3f) && nPC.type != 690 && nPC.type != 488)
{
    ...
    bool flag3 = SmartInteractShowingGenuine && SmartInteractNPC == i;          // 43774
    if (nPC.townNPC || nPC.type == 105 || nPC.type == 106 || nPC.type == 123 || nPC.type == 354
        || nPC.type == 376 || nPC.type == 579 || nPC.type == 453 || nPC.type == 589)   // 43775(453=SkeletonMerchant)
    {
        Rectangle value2 = new Rectangle((int)nPC.position.X, (int)nPC.position.Y, nPC.width, nPC.height);
        if (worldRegion.Intersects(value2)) flag3 = true;                       // 43777-43780 交互距离域
    }
    if (player.ownedProjectileCounts[651] > 0) flag3 = false;                   // 43783-43786 651=WireKite(电线风筝)持有即压制
    if (player.stinky) flag3 = false;                                           // 43787-43790
    if (player.mouseInterface) flag3 = false;                                   // 43791-43794(UI 悬停吞没)
    if (flag3 && !player.dead) { ... currentNPCShowingChatBubble = i; ... }     // 43795-43799
```

- `worldRegion = TileReachCheckSettings.Simple.GetWorldRegion(player)`(43718)。
  `Simple` = `{ TileRangeMultiplier = 1, TileReachLimit = 20 }`(TileReachCheckSettings.cs:15-20);
  `GetWorldRegion` = 格域×16(TileReachCheckSettings.cs:65-74):X 半径 = `min(Player.tileRangeX·1, 20) = 5` 格,
  Y 半径 = `min(Player.tileRangeY·1, 20) = 3` 格(`DefaultTileRangeX = 5` / `DefaultTileRangeY = 3`,Player.cs:2475/2477)。
  即玩家碰撞盒外扩 80px(横)/ 48px(纵)的世界像素域。
- 悬停命中域 `value`(43729):`new Rectangle((int)nPC.Bottom.X - nPC.frame.Width/2, (int)nPC.Bottom.Y - nPC.frame.Height, nPC.frame.Width, nPC.frame.Height)`,
  特例:87-92(史莱姆王系)→ 64×64 中心域(43732);677 → `CenteredRectangle(Center, 20×20)`(43736);
  695/696 → `CenteredRectangle(Bottom - (direction*-10, 20), 60×40)`(43740)。
- 同函数还负责右键开对话(43800-43814):`mouseRight && npcChatRelease` 且 `player.talkNPC != i && !player.tileInteractionHappened`
  → `IngameUIWindows.CloseAll(quiet:true)`、`player.SetTalkNPC(i)`、`npcChatText = nPC.GetChat()`、`SoundEngine.PlaySound(24)`。
- 悬停 NPC 名字文本(与泡同帧,43817-43831):`MouseTextHackZoom(nPC.GivenOrTypeName(: 血量))`——名字走鼠标悬停文本,不进气泡。

### 1.3 绘制几何(43865-43891 逐字)

```csharp
int num = -(npc[i].width / 2 + 8);                                              // 43867 尾巴水平偏移
float num2 = npc[i].position.Y - (float)TextureAssets.Chat.Height() - (float)(int)screenPosition.Y;  // 43868
if (npc[i].type == 637 && npc[i].ai[0] == 5f) num2 -= 18f;                      // 43869-43872 637=TownCat,坐姿(ai[0]==5)再抬 18px
SpriteEffects spriteEffects = SpriteEffects.None;
if (npc[i].spriteDirection == -1)
{
    spriteEffects = SpriteEffects.FlipHorizontally;
    num = npc[i].width / 2 + 8;                                                 // 43874-43878 朝左时镜像 + 尾偏移取反
}
if (player[myPlayer].gravDir != 1f)
{
    spriteEffects |= SpriteEffects.FlipVertically;
    num2 = (float)screenHeight - num2 - (float)TextureAssets.Chat.Height();     // 43879-43883 反重力竖直镜像
}
Vector2 position = new Vector2(npc[i].position.X + (float)(npc[i].width / 2) - screenPosition.X
                               - (float)(TextureAssets.Chat.Width() / 2) - (float)num, num2);  // 43884
spriteBatch.End();
spriteBatch.Begin(SpriteSortMode.Deferred, null, SamplerState.PointClamp, null, null, null, GameViewMatrix.ZoomMatrix);  // 43886 世界缩放域
PlayerInput.SetZoom_UI();
spriteBatch.Draw(TextureAssets.Chat.Value, position,
    new Rectangle(0, 0, TextureAssets.Chat.Width(), TextureAssets.Chat.Height()),
    new Color(mouseTextColor, mouseTextColor, mouseTextColor, mouseTextColor), 0f, default(Vector2), 1f, spriteEffects, 0f);  // 43888
spriteBatch.End();
spriteBatch.Begin(SpriteSortMode.Deferred, null, null, null, null, null, _uiScaleMatrix);   // 43890 batch 恢复到 UI 缩放域
```

公式化(正常重力、`spriteDirection == 1` 时,世界像素坐标):

```
泡宽 W = Chat.Width() = 32,泡高 H = Chat.Height() = 26
num   = -(npc.width/2 + 8)                         // spriteDirection==-1 时 = +(npc.width/2 + 8)
pos.X = npc.position.X + npc.width/2 - screenPosition.X - W/2 - num
      ⇔ spriteDirection==1(朝右): 泡左缘 = npc.position.X + npc.width - 8 - screenPosition.X   // 即 NPC 右缘内收 8px,泡体向右探出 24px
      ⇔ spriteDirection==-1(朝左): 泡左缘 = npc.position.X - 24 - screenPosition.X             // 泡体向左探出,与右侧对称
pos.Y = npc.position.Y - 26 - screenPosition.Y      // 泡底 = NPC 碰撞盒顶;猫坐姿 637 且 ai[0]==5 再 -18
颜色  = mouseTextColor 灰脉冲(§附录 B,190..255),alpha 同值
```

世界→屏幕换算 = `position - screenPosition`(相机世界像素),再乘 `GameViewMatrix.ZoomMatrix`(缩放域);
`_uiScaleMatrix` 即 `UIScaleMatrix`(Main.cs:2637 `public static Matrix UIScaleMatrix => _uiScaleMatrix;`,
:2656 `_uiScaleMatrix = Matrix.CreateScale(value, value, 1f)`)。

### 1.4 贴图资产

| 字段 | 加载锚 | 文件名 | 默认尺寸(TSV) | 实测 PNG |
|---|---|---|---|---|
| `TextureAssets.Chat`(悬停泡) | Terraria.Initializers/AssetInitializer.cs:862 | `Images\Chat` | 32×26(ResourcePacksDefaultInfo.tsv:1588) | 32×26,白底"…"三点泡,`game/public/sprites/vanilla/Chat.png` |
| `TextureAssets.Chat2`(签名泡) | AssetInitializer.cs:863 | `Images\Chat2` | 32×28(tsv:1589) | 32×28,尾朝下的三点泡,`vanilla/Chat2.png` |
| `TextureAssets.ChatBack`(面板底) | AssetInitializer.cs:864 | `Images\Chat_Back` | 500×500(tsv:1590) | 500×500,黑边圆角深蓝面板,`vanilla/Chat_Back.png` |

---

## 2. 对话框面板 `NPCChatPanel.Draw`(屏幕空间,NPCChatPanel.cs:52-86)

调用链:`DrawInterface_23_NPCSignsDialog`(Main.cs:46476-46479)→ `GUIChatDraw()`(:47486)→〔门,§5.2〕→
`GUIChatDrawInner()`(:40475-40478)→ `_newChatPanel.Draw()`。属接口层 "Vanilla: NPC / Sign Dialog"
(Main.cs:45574-45578,`InterfaceScaleType.UI`),即 UI 缩放域、坐标=屏幕 UI 像素。

### 2.1 面板几何(:62-72 逐字)

```csharp
Color color = new Color(200, 200, 200, 200);
int num = (mouseTextColor * 2 + 255) / 3;
Color color2 = new Color(num, num, num, num);
Point point = new Point(500, 500);
Rectangle rectangle = new Rectangle(Main.screenWidth / 2 - point.X / 2, 100, point.X, 30);
rectangle.Height += 30 * _textDisplayCache.AmountOfLines;
rectangle.Height += 30 * _neededInteractionLines + Math.Max(0, 2 * (_neededInteractionLines - 1));
{
    Main.spriteBatch.Draw(TextureAssets.ChatBack.Value, rectangle.TopLeft(),
        new Rectangle(0, 0, TextureAssets.ChatBack.Width(), rectangle.Height - 30), color, 0f, default(Vector2), 1f, SpriteEffects.None, 0f);   // 71 主体
    Main.spriteBatch.Draw(TextureAssets.ChatBack.Value, new Vector2(rectangle.TopLeft().X, rectangle.Y + rectangle.Height - 30),
        new Rectangle(0, TextureAssets.ChatBack.Height() - 30, TextureAssets.ChatBack.Width(), 30), color, ...);                                 // 72 底帽
}
```

公式:

```
panel.X = screenWidth/2 - 250          panel.Y = 100
panel.W = 500                          panel.H = 30 + 30·行数 + 30·按钮行数 + max(0, 2·(按钮行数-1))
行数 = AmountOfLines(§2.3);按钮行数 _neededInteractionLines = ceil(按钮数/4)(§3)
背景:Chat_Back(500×500)两段绘制——主体 source(0,0,500,470) 拉伸到 (500, panel.H-30) @ 左上角;
     底帽 source(0,470,500,30) 原尺寸 @ (panel.X, panel.Y+panel.H-30);颜色 (200,200,200,200)
(死分支 :74-76 `Utils.DrawInvBG` 被 `if (true)` 永久旁路)
```

### 2.2 门与自毁

- `Draw()` 首行(:54-58):`if (!CanHoldConversation()) { Close(); return; }`;
  `CanHoldConversation`(:278-285):`LocalPlayer.talkNPC < 0 && LocalPlayer.sign == -1` → false(即 talkNPC 或 sign 任一在即保持)。
- `Close()`(:267-276)→ `Main.npcChatText = ""`。

### 2.3 文本绘制 `DrawText`(:217-237 逐字要点)

```csharp
Vector2 vector = textArea.TopLeft() + new Vector2(20f, 20f);       // 219 文本起点 = 面板左上角 + (20,20)
DynamicSpriteFont value = FontAssets.MouseText.Value;              // 220 字体 = MouseText
string[] textLines = _textDisplayCache.TextLines;
int amountOfLines = _textDisplayCache.AmountOfLines;
for (int i = 0; i < amountOfLines; i++)
{
    if (allowRichText)                                             // 228 talkNPC != -1(:38)
        ChatManager.DrawColorCodedStringWithShadow(Main.spriteBatch, value, text, vector + new Vector2(0f, i * 30),
            textColor, 0f, Vector2.Zero, Vector2.One);             // 230 富文本行,行距 30,origin 零,缩放 1
    else
        Utils.DrawBorderStringFourWay(Main.spriteBatch, value, text, vector.X, vector.Y + (float)(i * 30),
            textColor, Color.Black, Vector2.Zero);                 // 234 签名文本:黑描边四向
}
```

- **换行宽度/行数**:`TextDisplayCache.PrepareCache`(TextDisplayCache.cs:22-24):
  `Utils.WordwrapString(text, FontAssets.MouseText.Value, 460, 10, out var lineAmount)` —— **宽 460px、上限 10 行**;
  缓存键 = 屏幕宽+高、原文、`PlayerInput.CurrentInputMode`(TextDisplayCache.cs:17-18)。
  `WordwrapString`(Utils.cs:874-881)= `font.CreateWrappedText(text, 460f, ActiveCulture.CultureInfo)` 后按 `'\n'` 切分,`lineAmount = min(行数, 10)`。
  (500 宽面板 - 左右各 20 边距 = 460,与换行宽自洽。)
- **文本颜色** `textColor` = `color2` = `new Color(num, num, num)`,`num = (mouseTextColor·2 + 255)/3`
  (:63-64;mouseTextColor 脉冲 190..255 → num ∈ [211,255],灰度呼吸)。
- **IME/光标**(:238-264):`Main.editSign` 时在最后一行尾接 composition string(超 460 折到第 `AmountOfLines` 行,:248-251),
  并画 20 tick 翻转的闪烁 `|`(:256-264)。`SetIMEPanelAnchor(vector2 + (0,54), 0f)`(:253)。
- `allowRichText = LocalPlayer.talkNPC != -1`(:38)——对话走富文本着色通道,签名走描边通道。

### 2.4 NPC 肖像 + 名字行 `Main.DrawNPCPortrait`(Main.cs:41012-41150)

```csharp
int num2 = 56;                                                    // 41030
Vector2 vector = npcChatTopLeft + new Vector2(-num2 - 6, num2 + 6);   // 41031 = 面板左上角 + (-62, +62)
// 背景框:TextureAssets.NpcPortraitBackground.Frame() @ vector,origin=frame 中心(41069)
// 开场弹跳:num = npcChatPortraitFrameCounter++(41029);num4 = num/120;num4==0 时前 120 帧:
//   vector.Y += -56 * 0.25 * (1 - EaseOutBounce(clamp(num3,0,80)/80))(41049-41055)→ 跳起 14px
//   DoNPCPortraitHop()(41378-41381)把计数清零 → 每次换台词回弹一次
// 名字行(41145-41149):
string givenOrTypeName = nPC.GivenOrTypeName;
DynamicSpriteFont value3 = FontAssets.ItemStack.Value;
Vector2 vector2 = value3.MeasureString(givenOrTypeName);
ChatManager.DrawColorCodedStringWithShadow(spriteBatch, value3, givenOrTypeName,
    vector + new Vector2(0f, num2 + 1), Color.White, 0f, vector2 / 2f, Vector2.One * num19);   // num19 = 1f
```

- 名字行:**会画**。位置 = 肖像中心 +(0, 57),即面板左上角左移 62px、下移 119px 处水平居中;字体 `ItemStack`,
  纯白、带影、缩放 1。
- 四种肖像模式(Main.cs:184-190 `DialoguePortraitDrawOption { Detailed, CloseUp, FullBodyRetro, Disabled }`,
  配置键 `"PortraitPreference"`(:4304/:4643),缺省 = 枚举 0 = Detailed):
  - Detailed:贴 `npcChatPortrait` 提供的 frame(41073);
  - CloseUp:3× 缩放 dummy NPC,96×96 剪裁域(ScissorRectangle `CenteredRectangle(vector*UIScale, (96,96)*UIScale)`,Y 上移 50,41083-41115);
  - FullBodyRetro:2× 缩放全身 dummy(41118-41144);Disabled:整体不画(41015-41018)。
- 面板右下角物品:`Main.DrawNPCChatBottomRightItem(rectangle.BottomRight())`(:40480-40515):
  `bottomRight -= Vector2.One * 8f`,物品最长边缩到 ≤32px;命中(物品矩形 `Contains(mouse)`)→ `cursorOverride = 2`,
  左键把它以 `[i]` 标签塞进玩家聊天框(`ChatManager.AddChatText`)。

---

## 3. 按钮行 `NPCChatPanel.DrawButtons`(NPCChatPanel.cs:88-162,现役实现)

### 3.1 集合与行数(:164-176)

```csharp
foreach (NPCInteraction item in NPCInteractions.All) if (item.Condition()) _interactions.Add(item);
_neededInteractionLines = (int)Math.Ceiling((float)count / 4f);        // 175,AllowedInteractionsPerLine = 4(:30)
```

按钮不写死:由 `NPCInteraction` 条件系统动态产出(如 Shop/Exit/幸福度/住房)。

### 3.2 位置公式(:93-135 逐字)

```csharp
Vector2 vector = panelArea.BottomLeft() + new Vector2(30f, -22 * _neededInteractionLines + Math.Max(0, 2 * (_neededInteractionLines - 1)) - 4);   // 93
Rectangle rectangle = new Rectangle((int)vector.X, (int)vector.Y, 100, 22);       // 97
foreach (NPCInteraction interaction in _interactions)
{
    ...
    if (num % 4 == 0) { rectangle.X = (int)vector.X; rectangle.Y = num / 4 * 22 + (int)vector.Y; }   // 103-107 换行
    ...
    rectangle.Width = (int)(stringSize.X * num5);                                  // 117 命中盒宽=压缩后文本宽
    ...
    rectangle.X += rectangle.Width + 30;                                           // 135 列距 30
}
```

公式:

```
anchor  = (panel.X, panel.Y + panel.H)          // 面板底左角
offsetY = -22·n + max(0, 2·(n-1)) - 4           // n = _neededInteractionLines;anchor.Y + offsetY = 按钮区顶
第 num 个按钮(0 基):行 = num/4,列 = num%4
命中盒 X = anchor.X + Σ(前列按钮压缩宽 + 30),Y = (anchor.Y + offsetY) + 行·22,高 22
→ 按钮行在面板内侧底部;面板高含 30·按钮行数,故按钮 Y 间接随台词行数下移(面板整体变高)
```

### 3.3 悬停变色 / 缩放 / 命中 / 点击(:101-155 逐字)

```csharp
byte b = mouseTextColor;                                                        // 101
chatColor = new Color(b, (int)((double)(int)b / 1.1), b / 2, b);                // 102 琥珀棕脉冲正文色
float num3 = 0.9f;                                                              // 96 基准缩放
Vector2 stringSize = ChatManager.GetStringSize(value, text, new Vector2(num3)); // 112
if (stringSize.X > 260f) num5 *= 260f / stringSize.X;                           // 113-115 超 260 横向压缩
bool flag = rectangle.Contains(new Point(Main.mouseX, Main.mouseY));            // 118 命中盒 = 矩形 Contains
Vector2 vector2 = new Vector2(flag ? 1.2f : num3);                              // 119 悬停放大到 1.2
Vector2 origin = new Vector2(0f, stringSize.Y * 0.5f);                          // 120 origin = 左中
Color baseColor = (flag ? Color.Brown : Color.Black);                           // 121 悬停影色 Brown,常态 Black
Vector2 vector3 = new Vector2(rectangle.Left, rectangle.Center.Y);              // 122 绘制点 = 命中盒左中
if (flag) {
    vector3.X -= (int)((1.2f - num3) * (float)rectangle.Width * 0.5f);          // 125 左扩补偿 0.3·W/2
    stringSize *= 1.2f / num3;                                                  // 126
}
if (flag) num2 = num;                                                           // 128-131 记录悬停索引
ChatManager.DrawColorCodedStringShadow(Main.spriteBatch, value, text, vector3, baseColor, 0f, origin, vector2 * num5);  // 132 影
ChatManager.DrawColorCodedString(Main.spriteBatch, value, text, vector3, chatColor, 0f, origin, vector2 * num5);        // 133 正文
UILinkPointNavigator.SetPosition(2500 + num, rectangle.Center.ToVector2());     // 134 手柄链接点 2500+num
...
if (!PlayerInput.IgnoreMouseInterface & flag) {                                 // 145
    LocalPlayer.mouseInterface = true; LocalPlayer.releaseUseItem = false; num2 = num;
    if (Main.mouseLeft && Main.mouseLeftRelease) { Main.mouseLeftRelease = false; interaction.Interact(); }   // 150-154 点击
}
...
if (_lastHovered != num2 && (!PlayerInput.UsingGamepad || num2 != -1)) SoundEngine.PlaySound(12);   // 157-160 悬停/移出 blip
_lastHovered = num2;                                                            // 161
```

要点:
- **正文色不是 superColor**:`new Color(b, b/1.1, b/2, b)`(b=mouseTextColor),随鼠标呼吸脉冲;`TryAddCoins`
  可改写 chatColor 并追加金币显示(:110)。
- **金币行**(:140-144):`ItemSlot.DrawMoney(spriteBatch, "", rectangle.X - 45, rectangle.Y - 44, Utils.CoinsSplit(coinValue), horizontal: true)`,
  之后 `rectangle.X += 106`。
- **感叹号**(:136-139):`ShowExclamation` → `Utils.DrawNotificationIcon(spriteBatch, vector3 + (stringSize.X*num5, 0) + (8, 0), 0f)`。
- **手柄 glyph**:现役按钮行**没有任何 glyph 精灵绘制**——只有 `UILinkPointNavigator.Shortcuts.NPCCHAT_ButtonsNew = true`、
  `NPCCHAT_ButtonsCount = _interactions.Count`(:90-91)与链接点 2500+num;虚拟键盘让位量
  `PrepareVirtualKeyboard`(:178-188):`num = 120 + AmountOfLines*30 + 30 - 235`(非手柄=9999),
  `UIVirtualKeyboard.ShouldHideText = !ShowGamepadHints`。

---

## 4. 死代码 `DrawNPCChatButtons`(Main.cs:41177-41376)全文精读(1.4.5.7 中无调用者)

> 以下公式对"复刻旧式按钮/写迁移测试"仍有价值;原版当前帧不执行此函数。签名:
> `private static void DrawNPCChatButtons(int superColor, Color chatColor, int numLines, string focusText, string focusText3)`(:41177)

### 4.1 公式核实(任务给的两式均成立)

```csharp
float y = 130 + numLines * 30;                        // 41179  ✓(行距 30,y 随台词行数变化)
int num = 180 + (screenWidth - 800) / 2;              // 41180  ✓
Vector2 vec = new Vector2(mouseX, mouseY);
Vector2 vector = new Vector2(num, y);                 // 41183 左按钮锚点
DynamicSpriteFont value = FontAssets.MouseText.Value;
Vector2 vector3 = new Vector2(0.9f);                  // 41187 基准缩放 0.9
Vector2 stringSize = ChatManager.GetStringSize(value, text, vector3);
if (stringSize.X > 260f) vector4.X *= 260f / stringSize.X;   // 41194-41197 超 260 压缩(与现役一致)
float num2 = 1.2f;                                    // 41193 悬停放大 1.2
```

- **左按钮**(focusText,如 "Shop"):锚 `(num, y)`,绘制中心 `vector2 + stringSize*vector4*0.5f`,origin=stringSize/2(41217-41218)。
- **中按钮**(`Lang.inter[52]`,现役 en-US 值 = **"Close"**,`Lang.cs:488 inter[k]=GetText("LegacyInterface."+k)`,en-US.json `LegacyInterface.52`):锚 `vector5 = (num + stringSize.X*vector4.X + 30, y)`(41224)——**列距 30,排在前一按钮宽之后**。
- **右按钮**(focusText3,可空):锚 `vector6 = (vector5.X + stringSize.X*vector4.X + 30, y)`(41265);空则
  `npcChatFocus3 = false`、`NPCCHAT_ButtonsRight = false`(41258-41262)。
- **第四键**(41298-41375):`remixWorld` 直接 return(41298-41301);
  `LocalPlayer.talkNPC >= 0 && npc.homeless && type != 37 && type != 368 && type != 453`(41302;37=OldMan,368=TravellingMerchant,453=SkeletonMerchant)
  → "Housing" 键,颜色 `new Color(superColor, superColor/1.1, superColor/2, superColor)`(41311);
  否则 `HappinessReport != ""` → "检查幸福度" 键,同款 superColor 色(41344-41351);`HappinessReport == ""` 时清 focus4(41338-41342)。

### 4.2 悬停/变色(41198-41218)

```csharp
if (vec.Between(vector2, vector2 + stringSize * vector3 * vector4.X) && !PlayerInput.IgnoreMouseInterface)
{
    player.mouseInterface = true;
    player.releaseUseItem = false;
    vector3 *= num2;                                   // 1.2
    if (!npcChatFocus2) SoundEngine.PlaySound(12);
    npcChatFocus2 = true;
}
else { if (npcChatFocus2) SoundEngine.PlaySound(12); npcChatFocus2 = false; }
ChatManager.DrawColorCodedStringShadow(..., baseColor: (!npcChatFocus2) ? Color.Black : Brown,
    position: vector2 + stringSize * vector4 * 0.5f, rotation: 0f, origin: stringSize * 0.5f, baseScale: vector3 * vector4);   // 41217
ChatManager.DrawColorCodedString(spriteBatch, value, text, vector2 + stringSize * vector4 * 0.5f, baseColor, 0f, stringSize * 0.5f, vector3 * vector4);  // 41218
```

- 命中盒 = `vec.Between(锚点, 锚点 + stringSize·0.9·压缩X)`;`Utils.Between`(Utils.cs:1806-1812)= 分量式闭区间
  `min.X ≤ x ≤ max.X && min.Y ≤ y ≤ max.Y`。**与现役的差异**:死代码用"文本尺寸对角点",现役用"修正过宽的矩形 Contains"。
- 悬停正文色不变(chatColor/superColor 原样),只有**影子色** Black→Brown。
- 中/右/第四键颜色 = `new Color(superColor, (int)(superColor/1.1), superColor/2, superColor)`(41230/41311/41351);
  左按钮与 focusText3 用传入 chatColor(41189/41271)。
- **无点击处理、无手柄 glyph 绘制**——只置 `npcChatFocus1..4`、`SoundEngine.PlaySound(12)`、
  `UILinkPointNavigator.SetPosition(2500/2501/2502/2503, 中心)` 与
  `Shortcuts.NPCCHAT_ButtonsLeft/Middle/Right/Right2`(41221-41222/41255-41256/41295-41296/41334-41335/41374-41375)。
  (点击当时由别处消费 focus 位;1457 中 focus 位全树无外部读者,佐证死代码。)

---

## 5. 层序关系与门(逐字)

### 5.1 接口层表相关条目(SetupDrawInterfaceLayers,Main.cs:45467-45680,依序)

| 序 | 层名 | 方法 | ScaleType |
|---|---|---|---|
| 0 | "Vanilla: Interface Logic 1" | DrawInterface_0_InterfaceLogic1(含 DrawMouseOver→HoverOverNPCs,置 `currentNPCShowingChatBubble`)| Game |
| 1 | "Vanilla: MP Player Names" | DrawInterface_20_MultiplayerPlayerNames | Game |
| 2 | **"Vanilla: Emote Bubbles"** | DrawInterface_1_1_DrawEmoteBubblesInWorld(EmoteBubble.DrawAll + **DrawNPCChatBubble**)| Game(缺省)|
| 3 | "Vanilla: Entity Markers" | DrawInterface_1_2_DrawEntityMarkersInWorld | Game |
| 20 | "Vanilla: Sign Tile Bubble" | DrawInterface_19_SignTileBubble(Chat2)| Game(缺省,:45561-45565)|
| 21 | "Vanilla: Hair Window" | DrawInterface_21_HairWindow | UI |
| 22 | "Vanilla: Dresser Window" | DrawInterface_22_DresserWindow | UI |
| 23 | **"Vanilla: NPC / Sign Dialog"** | DrawInterface_23_NPCSignsDialog → GUIChatDraw → **NPCChatPanel.Draw** | UI(:45574-45578)|
| 34 | "Vanilla: Mouse Text" | DrawInterface_33_MouseText | UI |
| 40 | "Vanilla: Mouse Over" | DrawInterface_39_MouseOver(DrawMouseOver:悬停名/牌文)| Game(缺省,:45651-45655)|

(`LegacyGameInterfaceLayer` 缺省第三参 = `InterfaceScaleType.Game`(LegacyGameInterfaceLayer.cs:9);
`GameInterfaceLayer.Draw` 对 Game → `SetZoom_World()` + `GameViewMatrix.ZoomMatrix`,UI → `SetZoom_UI()` + `UIScaleMatrix`(GameInterfaceLayer.cs:24-36)。)

**结论(谁先谁后)**:头顶悬停泡/表情泡(Game 域,序 2/20)先画;对话框面板(UI 域,序 23)后画;
二者不在同一批/同一矩阵(各自 End/Begin)。面板悬停置 `mouseInterface`(NPCChatPanel.cs:81-84)→
下一帧压制约泡(HoverOverNPCs :43791-43794),故**面板打开时鼠标所在处不会再弹出头顶泡**。

### 5.2 门条件逐字

- **对话框面板门**(Main.cs:47490,`GUIChatDraw`):
  ```csharp
  if ((npcChatText != "" || player[myPlayer].sign != -1) && !editChest)
  {
      GUIChatDrawInner();       // → _newChatPanel.Draw()
  }
  ```
  注意:门本身**不含** `playerInventory` / `talkNPC` 条件;`playerInventory` 打开时面板通常已因
  `npcChatText == ""`(开商店 `OpenShop()` 置空,Main.cs:41162-41170)而不画;`CanHoldConversation`
  (NPCChatPanel.cs:278-285)兜底:`talkNPC < 0 && sign == -1` → `Close()`(清文本)。
- **发式窗口门**(Main.cs:44449,`DrawHairWindow` 开头,与对话互斥 → 取消自己):
  ```csharp
  if (npcChatText != "" || playerInventory || player[myPlayer].chest != -1 || npcShop != 0 || player[myPlayer].talkNPC == -1 || InGuideCraftMenu)
  { CancelHairWindow(); return; }
  ```
- **衣柜窗口门**(Main.cs:44950,`DrawClothesWindow` 开头):
  ```csharp
  if (npcChatText != "" || playerInventory || player[myPlayer].chest != -1 || npcShop != 0 || player[myPlayer].talkNPC != -1 || InGuideCraftMenu)
  { CancelClothesWindow(); return; }
  ```
- **头顶悬停泡门**:无显式 `talkNPC`/`playerInventory` 条件(见 §1.2)——它是"悬停即显"的提示泡,
  由 `mouseInterface`/交互距离/特殊 NPC 排除表控制。

---

## 6. 多 NPC 同时头顶气泡:三套并存机制及其与对话框的区分

1. **EmoteBubble(表情泡,可多 NPC 同屏)** —— 这就是"NewBubble 机制"的真身。
   - 注册表:`byID` 字典,`DrawAll` 全量遍历绘制(NPCChatPanel 同层之前:DrawInterface_1_1_DrawEmoteBubblesInWorld 先 `EmoteBubble.DrawAll(spriteBatch)` 再画悬停泡,EmoteBubble.cs:67-76,Main.cs:47234)。
   - `EmoteBubble.NewBubble(int emoticon, WorldUIAnchor bubbleAnchor, int time)`(EmoteBubble.cs:116-132):
     单机直接入表,服务器 `NetMessage.SendData(91, ...)` 广播;`NewBubbleNPC(anchor, time, other = null)`(:134-150)
     = `new EmoteBubble(0, anchor, time)` + `PickNPCEmote(other)` 随机挑选表情(镇民对玩家/彼此的随机反应泡)。
   - 几何(`Draw`/`GetPosition`,EmoteBubble.cs:199-262):贴图 `TextureAssets.Extra[48]`,8 列 ×
     `EMOTE_SHEET_VERTICAL_FRAMES = 2 + (EmoteID.Count - 1)/4` 行(:42);
     Entity 锚位置 = `new Vector2(entity.Top.X, entity.VisualPosition.Y) + new Vector2(-direction*width*0.75f, 2f) - Main.screenPosition`
     (:245-247),origin = `(宽/2, 高)`(泡底贴锚点,:209);出生/消逝前后 6 帧画第 0 列开合帧(:205-206);
     反重力时 `ReverseGravitySupport` + 竖直翻转(:211-215)。泡上还可叠 NPC 头像(emote == -1 分支,:228-238)。
   - 台词相关调用点(非对话框):NPC.cs:69810/69826(睡觉镇民随机泡,112/60 帧)、NPC.cs:70049-70053
     (**两个镇民互相反应,双泡同时**)、NPC.cs:69743/69960/69964、Mount.cs:6187、MessageBuffer.cs:3930(网络泡)。
   - 玩家 emote:`MakeLocalPlayerEmote`(EmoteBubble.cs:283-291,360 帧)+ `CheckForNPCsToReactToEmoteBubble`
     (:152-167,200px 内 aiStyle 7 镇民置 `ai[0]=19, ai[1]=220` 转身回应)。
   - **与对话框的区分**:表情泡无文字、可多个、有寿命(lifeTime,帧)、网络包 91/120;对话框 = 单实例
     屏幕面板,内容由唯一字符串 `Main.npcChatText` 驱动、目标唯一 `player[myPlayer].talkNPC`。
2. **头顶悬停提示泡**(§1):每帧至多 1 个(`currentNPCShowingChatBubble` 先清后置),仅"…"贴图。
3. **玩家多人聊天气泡**(overhead chat,仅玩家):`DrawPlayerChatBubbles`(Main.cs:64208-64224),在
   Main.Draw 主循环 :63285-63287 的 `UIScaleMatrix` 批内调用;`GetChatDrawPosition`
   (:64203-64207)= `(gravDir==1 ? player.Top : player.Bottom) + netOffset + (0, gfxOffY) → ToScreenPosition() + (0,-2f)`,
   再 `Y -= msgH/2; 全量 -= msgSize/2`(底部居中锚在头顶,:64216-64219),`ChatManager.DrawColorCodedStringWithShadow`
   绘制 `player.chatOverhead.snippets`(富文本,带 hover 检测 out)。与 NPC 对话框完全无关。
4. **签名泡 Chat2**(`DrawInterface_19_SignTileBubble`,Main.cs:46502-46525):`signBubble` 由
   Player.cs:32345/34563(悬停牌匾 tile,`tileSign` 分支)置真;几何:
   `X = signX - screenX`,牌在玩家右侧(`signX > player右缘`)→ 水平翻转且 `X += -8 - Chat2.Width()`,否则 `X += 8`;
   `Y = signY - screenY - 22`(反重力:`screenHeight - (signY - screenY) - 32`);颜色 = mouseTextColor 灰脉冲。
   悬停牌匾文本本体在 `DrawMouseOver`(:43665-43711,`WordwrapString(..., 460, 10)` 后逐行 30px 画于鼠标附近)。

---

## 附录 A:关键常量速查

| 项 | 值 | 锚 |
|---|---|---|
| 悬停泡尺寸 | 32×26 | AssetInitializer.cs:862 / vanilla/Chat.png |
| 签名泡尺寸 | 32×28 | AssetInitializer.cs:863 / vanilla/Chat2.png |
| 面板底图 | 500×500 | AssetInitializer.cs:864 / vanilla/Chat_Back.png |
| 面板位置/宽 | x=screenWidth/2-250, y=100, w=500 | NPCChatPanel.cs:65-66 |
| 面板高 | 30 + 30·行数 + 30·按钮行数 + max(0, 2·(按钮行数-1)) | NPCChatPanel.cs:67-68 |
| 文本起点/行距/换行宽/行数上限 | +20,20 / 30 / 460 / 10 | NPCChatPanel.cs:219/230、TextDisplayCache.cs:23 |
| 按钮行高/列距/基准缩放/悬停缩放/压缩阈 | 22 / 30 / 0.9 / 1.2 / 260 | NPCChatPanel.cs:97/135/96/119/113 |
| 死代码按钮 y / x | 130 + numLines·30 / 180 + (screenWidth-800)/2 | Main.cs:41179/41180 |
| 交互距离域 | tileRangeX=5 格 / tileRangeY=3 格(上限 20) | Player.cs:2475/2477、TileReachCheckSettings.cs:15 |
| mouseTextColor 脉冲 | 190..255,±1/帧(255 回落,≤190 回升) | Main.cs:18398-18408 |
| 面板文本灰度 | (mouseTextColor·2+255)/3 → 211..255 | NPCChatPanel.cs:63 |
| 面板按钮正文色 | (b, b/1.1, b/2, b),b=mouseTextColor | NPCChatPanel.cs:102 |
| 面板背景/底帽色 | (200,200,200,200) | NPCChatPanel.cs:62/71-72 |

## 附录 B:提取方法备注(复核入口)

- 纹理默认尺寸取自 `Terarria1457/Terraria.IO.Data.ResourcePacksDefaultInfo.tsv:1588-1590`,并用本项目已提取
  PNG(`game/public/sprites/vanilla/Chat*.png`)`file` 实测复核,三者一致。
- `DrawNPCChatButtons` 死代码判定:全树 `grep -rn "DrawNPCChatButtons"`(仅 :41177)+ `grep -rn "npcChatFocus" 排除 Main.cs` 零命中。
- 反重力公式 `_uiScaleMatrix ≡ UIScaleMatrix`:Main.cs:2637/2656。
