# 原版 NPC 对话头像「四模式」完整绘制与设置规格(1.4.5.7)

> 取证基准:`Terarria1457/`(唯一标杆);已对 `Terarria1458/` 逐段 diff 校验——
> `DrawNPCPortrait` 函数体、两张偏移字典、`NPCChatPanel.cs`、`IngameOptions` 设置行
> **全部逐字节全等**(1458 的 Main.cs 相应锚点整体 +6 行,见 §9)。行号未注明文件者均指
> `Terarria1457/Terraria/Main.cs`。
> 文档日期:2026-09-14。只读研究产出,用于本仓 `NpcDialog` 头像三分支与设置面的对齐复核。

---

## 0. 一页总览

```
枚举   Main.cs:184-189   DialoguePortraitDrawOption { Detailed, CloseUp, FullBodyRetro, Disabled }
设置态 Main.cs:2415      public static DialoguePortraitDrawOption DialoguePortraitPreference;
默认   Main.cs:67676     DialoguePortraitPreference = DialoguePortraitDrawOption.Detailed;  // Main 构造器
持久化 Main.cs:4304(写) / 4643(读)  config.json 键 "PortraitPreference"
循环   Main.cs:40989-41009 CycleNPCPortraitMode():Detailed→CloseUp→FullBodyRetro→Disabled→Detailed
入口① IngameOptions.cs:823-836   新设置 UI · category==1「Interface」页
入口② Main.cs:50761-50777        旧式菜单 menuMode==1112(界面页)
快捷键 【无】全仓仅上述两处设置行调用 CycleNPCPortraitMode,无任何键位绑定
消费站 Terraria.GameContent.UI/NPCChatPanel.cs:79 → Main.DrawNPCPortrait(:41012-41150)
贴图   详细模式 = NPCID.Sets.NPCPortraits[type](Images/TownNPCs/Portraits/Portrait_*,200×200)
       另两种 = NPC 实体贴图经 dummy NPC + DrawNPCDirect 直绘(无独立资产)
       底框   = TextureAssets.NpcPortraitBackground("Images\TownNPCs\Portraits\Portrait_Window",112×112)
```

---

## 1. 四模式各自的绘制消费站

### 1.1 唯一消费函数:`Main.DrawNPCPortrait`(:41012-41150)

签名与早退链(:41012-41028):

```csharp
public static void DrawNPCPortrait(Microsoft.Xna.Framework.Color chatBack, Vector2 npcChatTopLeft)
{
    DialoguePortraitDrawOption dialoguePortraitPreference = DialoguePortraitPreference;
    if (dialoguePortraitPreference == DialoguePortraitDrawOption.Disabled) { return; }   // :41015 模式④
    NPCID.Sets.NPCPortraitProvider nPCPortraitProvider = npcChatPortrait;                // :41019
    if (nPCPortraitProvider == null) { return; }                                         // :41020-41022 无头像类型
    nPCPortraitProvider.GetDrawData(out var texture, out var drawFrame);                 // :41024
    if (texture == null) { return; }                                                     // :41025 资产未加载
```

- **模式④ Disabled = 单点早退**(:41015),之后什么都不画(连底框也没有)。
- 贴图来源是**委托提供者** `Main.npcChatPortrait`(字段 :1846),不是直接查表——
  装配时机见 §5。三种模式共读同一份 `texture/drawFrame`(只有 Detailed 用它)。

### 1.2 头像贴图来源:`NPCID.Sets.NPCPortraitProvider` 家族(NPCID.cs:44-160)

```csharp
public interface NPCPortraitProvider                                        // NPCID.cs:44
{
    void GetDrawData(out Texture2D texture, out Rectangle drawFrame);
}
public class BasicNPCPortrait : NPCPortraitProvider { ... }                 // NPCID.cs:49-88
public class NPCPortraitSelector : NPCPortraitProvider { ... }              // NPCID.cs:90-142(With/Default 条件链)
```

`BasicNPCPortrait.GetDrawData`(NPCID.cs:67-79):懒加载 `Main.Assets.Request<Texture2D>(TexturePath, ImmediateLoad)`,
`drawFrame = texture.Frame(HorizontalFrames, VerticalFrames, FrameX, FrameY, PaddingX, PaddingY)`(缺省 1×1 帧全图)。
`NPCPortraitSelector.GetFirstValidatedEntry`(:130-139)按注册序取第一个条件成立的子像。

注册表 `NPCID.Sets.NPCPortraits`(NPCID.cs:216 起):**51 个 NPC type 键、54 个 BasicPortrait 引用**,
条目形如(NPCID.cs:220):

```csharp
{ 369, PrioritizedPortrait().With(ShimmeredPortraitCondition,
      BasicPortrait("Images/TownNPCs/Portraits/Portrait_Angler_shimmer"))
      .Default(BasicPortrait("Images/TownNPCs/Portraits/Portrait_Angler")) },
```

三类条件(NPCID.cs:4946-4960):
- `VariantPortraitCondition(n)`(:4946)= `NPCVariantChecker.Fits`(:145-159)= `Main.npc[talkNPC].townNpcVariationIndex == n`(宠物三族六变体,:369-389);
- `ShimmeredPortraitCondition()`(:4951-4958)= `Main.npc[talkNPC].IsShimmerVariant`(28 常规镇民带 `_shimmer` 像);
- 动物学家 633 三重臂(:332-333):微光×(人/狼人) × 非微光×(人/狼人),狼人态 = `NPC.ShouldBestiaryGirlBeLycantrope()`。

### 1.3 详细模式 Detailed(:41071-41074)

```csharp
if (dialoguePortraitPreference == DialoguePortraitDrawOption.Detailed)
{
    spriteBatch.Draw(texture, vector, drawFrame, Color.White, num5,
        drawFrame.Size() / 2f, scale, spriteEffects, 0f);      // :41073
}
```

- **原尺寸(scale=1)画** 200×200 头像贴图(实测 `Portrait_Merchant.png` = 200×200),
  中心对齐 `vector`,无任何裁剪(scissor)——贴图自带 ~50% alpha 留白是圆形窗设计的一部分,
  可见内容恰落在 112×112 底框内。

### 1.4 侧面特写 CloseUp(:41075-41117)

复用静态 dummy(`_portraitDummy`,Main.cs:2413 声明、:67674 构造)逐次重置:

```csharp
NPC portraitDummy = _portraitDummy;
portraitDummy.SetDefaults(nPC.type);                    // :41078
portraitDummy.whoAmI = nPC.whoAmI;                      // :41079
portraitDummy.GivenName = nPC.GivenName;                // :41080
portraitDummy.townNpcVariationIndex = nPC.townNpcVariationIndex;  // :41081
portraitDummy.FindFrame();                              // :41082
int num14 = 16;                                         // :41083 垂直基偏
portraitDummy.scale = 3f;                               // :41084 3 倍
int num15 = -portraitDummy.width / 2;                   // :41085 水平按碰撞盒宽居中
if (NPCID.Sets.IsTownPet[portraitDummy.type])           // :41086 城镇宠物特支
{
    num14 = -20;                                        // :41088
    portraitDummy.scale = 3f;                           // :41089(冗余显式)
    int num16 = 96;                                     // :41090
    num16 -= nPC.frame.Width;                           // :41091 注意:取【真身】当前帧宽
    num16 /= 2;  num16 /= 6;  num16 *= 6;               // :41092-41094 6 texel 组取整
    num15 = -36 + num16;                                // :41095
}
portraitDummy.position = vector + new Vector2(num15, 48 + num14);   // :41098 落位公式
if (NPCID.Sets.NPCPortraitsCloseUpOffsets.TryGetValue(nPC.type, out value))
    portraitDummy.position += value;                    // :41100-41103 逐 ID 微调表
portraitDummy.IsABestiaryIconDummy = true;              // :41104
portraitDummy.IsAPortraitDummy = true;                  // :41105(标记供管线分支,见 §6)
spriteBatch.End();                                      // :41106 退出世界批
Rectangle scissorRectangle = spriteBatch.GraphicsDevice.ScissorRectangle;   // :41107 存旧剪裁
spriteBatch.Begin(SpriteSortMode.Deferred, null, SamplerState.PointClamp,
    null, ScissorState, null, UIScaleMatrix);           // :41108 ScissorState=开剪裁光栅化(:67671-67675)
Rectangle scissorRectangle2 = Utils.CenteredRectangle(vector * UIScaleMatrix.M11,
    new Vector2(96f, 96f) * UIScaleMatrix.M11);         // :41109 UI 空间 96×96 中心剪裁窗
scissorRectangle2.Y -= 50;                              // :41110 向上扩 50(头顶溢出窗顶)
scissorRectangle2.Height += 50;                         // :41111 → 实际剪裁窗 96 宽×146 高
spriteBatch.GraphicsDevice.ScissorRectangle = scissorRectangle2;   // :41112
instance.DrawNPCDirect(spriteBatch, portraitDummy, behindTiles: false, Vector2.Zero);  // :41113
spriteBatch.End();  spriteBatch.GraphicsDevice.ScissorRectangle = scissorRectangle;   // :41114-41115 还原
spriteBatch.Begin(SpriteSortMode.Deferred, null, null, null, null, null, UIScaleMatrix);  // :41116
```

要点:
- 落位 `position = vector + (−width/2, 48+16=64)`(普通镇民)= **顶点在窗中心下方 64px、水平居中**,
  配合 scale=3 后由 DrawNPCDirect 以 bottom 锚绘制(§6.2),头部自然落在窗内。
- 剪裁窗(设备像素)= 中心 `vector`,宽 96,纵向从 `vector.Y−98` 到 `vector.Y+48`:**左右比 112 底框
  各窄 8px,向下止于窗中心下 48px**。
- 采样 `PointClamp`(像素锐利)、矩阵 `UIScaleMatrix`(UI 空间绘制)。

### 1.5 复古全身 FullBodyRetro(:41118-41144)

```csharp
NPC portraitDummy2 = _portraitDummy;
portraitDummy2.SetDefaults(nPC.type);                   // :41121 同款四件套重置(:41121-41125)
portraitDummy2.FindFrame();
int num17 = -portraitDummy2.height;                     // :41126 纵向 = 整个碰撞盒高
portraitDummy2.scale = 2f;                              // :41127 2 倍
int num18 = -portraitDummy2.width / 2;                  // :41128
portraitDummy2.position = vector + new Vector2(num18, 48 + num17);  // :41130 = 底边钉在窗中心下 48px
if (NPCID.Sets.NPCPortraitsFullBodyRetroOffsets.TryGetValue(nPC.type, out value2))
    portraitDummy2.position += value2;                  // :41132-41135
portraitDummy2.IsABestiaryIconDummy = true;             // :41136
portraitDummy2.IsAPortraitDummy = true;                 // :41137
spriteBatch.End();                                      // :41138
_ = spriteBatch.GraphicsDevice.ScissorRectangle;        // :41139 存了但丢弃(死码残留)
spriteBatch.Begin(SpriteSortMode.Deferred, null, SamplerState.PointClamp,
    null, null, null, UIScaleMatrix);                   // :41140 【无 ScissorState → 不剪裁】
instance.DrawNPCDirect(spriteBatch, portraitDummy2, behindTiles: false, Vector2.Zero);  // :41141
spriteBatch.End();  spriteBatch.Begin(...);             // :41142-41143
```

要点:
- **唯一区别于 CloseUp 的三件事**:scale 2(非 3)、`num17=−height`(全身底对齐)、**完全不剪裁**
  (`Begin` 光栅化传 `null` = 默认关剪裁;:41139 的保存值被 `_ =` 丢弃)——全身可向上越出窗顶,
  仅受屏幕裁剪。
- 无宠物特支(宠物走 :41086 的 CloseUp 支才会用到;Retro 只有微调表兜底)。

### 1.6 公共几何与动画(:41029-41069)

```csharp
int num = npcChatPortraitFrameCounter++;                // :41029 每帧自增( hop 计数器)
int num2 = 56;                                          // :41030 = 底框 112 的一半
Vector2 vector = npcChatTopLeft + new Vector2(-num2 - 6, num2 + 6);   // :41031 窗中心
                                                        //        = 对话框左上角 + (−62, +62)
Asset<Texture2D> npcPortraitBackground = TextureAssets.NpcPortraitBackground;  // :41032
Rectangle rectangle = npcPortraitBackground.Frame();    // :41033 全图(112×112)
Vector2 scale = new Vector2(1f, 1f);
int num3 = num % 120;  int num4 = num / 120;            // :41035-41036
bool num6 = num4 == 0;                                  // :41039 = hop 后前 120 帧
```

- **底框**:`spriteBatch.Draw(npcPortraitBackground.Value, vector, rectangle, chatBack, num5,
  rectangle.Size() / 2f, scale, spriteEffects, 0f)`(:41069)——112×112 窗贴图(资产实测 112×112)
  以 `chatBack`(NPCChatPanel 传入的 `new Color(200,200,200,200)`,NPCChatPanel.cs:62)染色,
  中心锚定 `vector`。
- **hop 弹跳**(:41049-41055):hop 后 0..80 帧,
  `vector += (0, −56 × 0.25 × (1 − EaseOutBounce(clamp(num3,0,80)/80)))`——抬起峰值
  56×0.25 = **14px**,按 `Utils.EaseOutBounce`(Utils.cs:355-366,`BounceEaseOut(t,4,2)` =
  `1 − (1−t)²·|sin(4πt)|`)带弹落。
- **两块死码**(反编译出的未启用特性,抄规格时**不要照抄也不必复刻**):
  - :41041-41048 `if (false)` 绕窗底中心的正弦摆动旋转(`num5`,量级 `2π×0.0045`);
  - :41056-41068 `if (flag)`(`flag` 恒 false)调用 `Utils.GetPortraitMovement`(Utils.cs:378-413,
    六段水平滑移+X 翻转动画,配合 `spriteEffects ^= FlipHorizontally`)。

### 1.7 窗内名字文本(:41145-41149)

```csharp
string givenOrTypeName = nPC.GivenOrTypeName;
DynamicSpriteFont value3 = FontAssets.ItemStack.Value;
Vector2 vector2 = value3.MeasureString(givenOrTypeName);
ChatManager.DrawColorCodedStringWithShadow(spriteBatch, value3, givenOrTypeName,
    vector + new Vector2(0f, num2 + 1), Color.White, 0f, vector2 / 2f, Vector2.One * 1f);  // :41149
```

名字(带昵称优先)以 `ItemStack` 字体、白色、**中心锚 `vector + (0, 57)`**(窗中心下 57px、
窗底上 1px)、scale 1 画在底框内。三种模式都会走到这里(Disabled 早退除外)。

---

## 2. 头像绘制位置:锚点公式汇总

坐标系全部是 **UI 像素**(UIScaleMatrix 空间),`npcChatTopLeft` = 对话面板矩形左上角:

```
面板矩形(NPCChatPanel.cs:65-68):
  width  = 500
  x      = Main.screenWidth/2 − 250        y = 100
  height = 30 + 30×行数 + 30×交互行数 + max(0, 2×(交互行数−1))

头像窗中心 P = npcChatTopLeft + (−62, +62)                       (Main.cs:41031)
  → 底框(112×112)左上角 = npcChatTopLeft + (−118, +6)
  → 头像整体悬在对话框【左外侧】上,窗顶与面板顶几乎平齐(差 6px)

Detailed    :texture 200×200 中心= P,scale 1,无剪裁
CloseUp     :dummy.position = P + (−width/2, 64) + CloseUpOffsets[type]     (scale 3;宠物 P + (−36+num16, 28))
              剪裁窗 = 96×146,中心 P、上沿 P.Y−98、下沿 P.Y+48
FullBodyRetro:dummy.position = P + (−width/2, 48−height) + RetroOffsets[type](scale 2,无剪裁)
名字        :P + (0, 57) 中心对齐
```

三模式差异一句话:**Detailed = 独立 200×200 精绘像素画原图直出;CloseUp = 实体贴图 ×3 只露
头胸(96 宽窗内);FullBodyRetro = 实体贴图 ×2 底对齐全身(不剪裁,可越窗)**。

---

## 3. dummy NPC 的绘制管线(三种模式共用基础设施)

CloseUp/Retro 不是「贴图裁剪」而是**渲染一个假 NPC**。`IsAPortraitDummy`(NPC.cs:6018)在原版
管线里的消费点:

| 站点 | 行号 | 行为 |
|---|---|---|
| `Main.DrawNPCDirect` | Main.cs:22723(函数头) | 完整城镇 NPC 直绘:档案贴图(Profiles.GetTextureNPCShouldUse)、帧动画、shimmerTransparency 透明度、GetAlpha/GetColor |
| 彩虹城镇史莱姆 shader 分支 | Main.cs:25765 / :25783(case 676/681) | dummy 存在时改用 `UIScaleMatrix + ScissorState` 重开批(保住 UI 空间剪裁再套 `RainbowTownSlime` shader) |
| `Main.DrawNPCExtras` | Main.cs:27315(nudge 在 :27580-27586) | `if (n.IsAPortraitDummy) { if (scale==2f) bottom.Y −= 4; if (scale==3f) bottom.Y −= 8; }`——**portrait dummy 专属上提**,抵消 bottom 锚的 4/8px 偏差 |
| `NPC.UsesPartyHat` | NPC.cs:67374(判定在 :67388-67390) | `if (!IsAPortraitDummy && IsABestiaryIconDummy) return false;`——**图鉴 dummy 不戴派对帽,头像 dummy 戴**(派对期间头像与图鉴 icon 行为分叉的唯一处) |

另外 `IsABestiaryIconDummy = true` 同时被设(:41104/:41136):dummy 不参与 AI/存档/网络,只吃渲染。

---

## 4. 两张逐 ID 微调偏移表(数据面权威)

`NPCID.cs`:

```csharp
public static Dictionary<int, Vector2> NPCPortraitsCloseUpOffsets = new Dictionary<int, Vector2>
{ { 17, new Vector2(6f, 0f) }, { 18, new Vector2(-6f, 0f) }, ...      // :4517 起,共 40 条

public static Dictionary<int, Vector2> NPCPortraitsFullBodyRetroOffsets = new Dictionary<int, Vector2>
{ { 18, new Vector2(-3f, 0f) }, { 20, new Vector2(-4f, 0f) }, ...     // :4681 起,共 21 条
```

- 向量语义:`portraitDummy.position += value`(:41102/:41134),即 **UI 像素位移**(x 右正,y 下正)。
- 代表值:CloseUp 17 商人 `(6,0)` / 18 护士 `(−6,0)` / 38 爆破专家 `(0,−6)`;Retro 124 机械师
  `(−6,2)` / 441 税务官 `(−10,0)`。
- 平行物:`ScriptSandbox.MethodForNPCPortraits_CloseUp`(:20)/`_FullBody`(:187)以 `ref Dictionary`
  形式内嵌同值全表——那是 tModLoader 式沙箱暴露面,运行时消费的仍是 NPCID.cs 两张静态表。
- **本仓已逐值对账**(python 全量 diff `game/src/data/vanilla-portrait-offsets.json` vs 反编译):
  CloseUp 40/40、Retro 21/21,零缺键零漂移。

---

## 5. 装配与触发链(谁在什么时候把头像装上/让头像跳)

1. **选像**:`Player.SetTalkNPC`(Player.cs:4362)尾段(:4381-4387):

```csharp
if (whoAmI == Main.myPlayer)
{
    Main.npcChatPortrait = null;
    if (nPC != null && NPCID.Sets.NPCPortraits.TryGetValue(nPC.type, out var value))
    {
        Main.npcChatPortrait = value;
        Main.DoNPCPortraitHop();        // Player.cs:4386
    }
}
```
   表外类型(无像 NPC)保持 null → `DrawNPCPortrait` :41020 早退,**原版不画任何东西**(连底框都没有)。

2. **hop 重置**:`DoNPCPortraitHop`(:41378-41381)= `npcChatPortraitFrameCounter = 0;`。
   触发点共 7 处:`SetTalkNPC`(Player.cs:4386)+ 六个对话动作
   (`NPCChatText_TavernkeepAdvice` :40686→hop:40691、`NPCChatText_PartyGirlSwapMusic` :40737→:40743、
   `NPCChatText_DoNurseHeal` :40796→:40870、`NPCChatText_DoTaxCollector` :40873→:40918、
   `NPCChatText_DoAnglerQuest` :40921→:40956、`DryadText_WorldPurityOrStardewValleyBit` :40959→:40961)。
   即:**点选项(治疗/任务/收税/建议/换曲/可乐)与重新对话都会让头像重新弹一次**。

3. **每帧消费**:`GUIChatDrawInner`(:40475)→ `_newChatPanel.Draw()`(:40477)→
   `NPCChatPanel.Draw`(NPCChatPanel.cs:52)画完聊天底板与文本后调
   `Main.DrawNPCPortrait(color, rectangle.TopLeft())`(NPCChatPanel.cs:79);
   `num = npcChatPortraitFrameCounter++`(:41029)每绘制帧自增,hop 后第 120 帧起动画态结束
   (`num6=false`),计数器继续增长无副作用(无回绕处理,溢出前不可达)。

---

## 6. 设置项

### 6.1 循环切换 `CycleNPCPortraitMode`(:40989-41009)

```csharp
public static void CycleNPCPortraitMode()
{
    DialoguePortraitDrawOption dialoguePortraitPreference = DialoguePortraitPreference;
    switch (DialoguePortraitPreference)
    {
    case DialoguePortraitDrawOption.Detailed:      dialoguePortraitPreference = DialoguePortraitDrawOption.CloseUp;       break;
    case DialoguePortraitDrawOption.CloseUp:       dialoguePortraitPreference = DialoguePortraitDrawOption.FullBodyRetro; break;
    case DialoguePortraitDrawOption.FullBodyRetro: dialoguePortraitPreference = DialoguePortraitDrawOption.Disabled;      break;
    case DialoguePortraitDrawOption.Disabled:      dialoguePortraitPreference = DialoguePortraitDrawOption.Detailed;      break;
    }
    DialoguePortraitPreference = dialoguePortraitPreference;
}
```

循环序 **Detailed → CloseUp → FullBodyRetro → Disabled → Detailed**(:40989-41009)。

### 6.2 入口①:新设置 UI(IngameOptions)

`IngameOptions.Draw(Main, sb)`(IngameOptions.cs:113)内,`category == 1` 分支(:702)= 左栏第二项
`Lang.menu[210]` = **"Interface"**(四分类:menu[114] General / menu[210] Interface / menu[63] Video /
menu[218] Cursor,IngameOptions.cs:223-262)。头像行(:823-836):

```csharp
if (DrawRightSide(sb, Main.DialoguePortraitPreference switch
{
    Main.DialoguePortraitDrawOption.CloseUp       => Language.GetTextValue("UI.PortraitsCloseUp"),
    Main.DialoguePortraitDrawOption.FullBodyRetro => Language.GetTextValue("UI.PortraitsFullBody"),
    Main.DialoguePortraitDrawOption.Disabled      => Language.GetTextValue("UI.PortraitsDisabled"),
    _                                             => Language.GetTextValue("UI.PortraitsDetailed"),
}, num17, vector6, vector7, rightScale[num17], (rightScale[num17] - num5) / (num6 - num5)))
{
    rightHover = num17;
    if (flag4) { Main.CycleNPCPortraitMode(); }      // :834 点击循环
}
```

同页邻行(可作页面定位指纹):前一行 = 生命/法力样式(`UI.SelectHealthStyle`,:814),后两行 =
Boss 血条文字(`UI.ShowBossLifeText*`,:837)、悬停文本框(:846 附近)。

### 6.3 入口②:旧式菜单

`menuMode == 1112`(Main.cs:50675)= 旧式界面设置页(首行 `showItemText` 开关 :50695-50697,
页内同款邻居:小地图边框/生命样式),头像行(:50761-50777):同款 switch 文案,点击
`SoundEngine.PlaySound(12); CycleNPCPortraitMode();`(:50776-50777)。

### 6.4 持久化与默认值

- 写:Main.cs:4304 `configuration.Put("PortraitPreference", DialoguePortraitPreference);`(settings.json 序列化链内)。
- 读:Main.cs:4643 `configuration.Get("PortraitPreference", ref DialoguePortraitPreference);`。
- 默认:Main.cs:67676(Main 构造器,紧邻 :67671-67675 的 `ScissorState = new RasterizerState
  { CullMode = CullMode.None, ScissorTestEnable = true }`——CloseUp 剪裁所用的光栅化状态)。
- **无循环快捷键**:全反编译树 `CycleNPCPortraitMode` 调用点仅 :834 与 :50777 两处(游戏手柄/键盘
  绑定表均不含),切换只能进设置页点行。

### 6.5 文案键(localization)

`UI.PortraitsDetailed / UI.PortraitsCloseUp / UI.PortraitsFullBody / UI.PortraitsDisabled`
(Terraria.Localization.Content.en-US.json:408-411 = "Portraits Style: Detailed / Profile / Retro /
Disabled";zh-Hans.json:408-411 = "肖像风格:精细 / 侧面 / 复古 / 禁用")。

---

## 7. 资产清单(原版)

| 资产 | 路径(AssetInitializer) | 实测尺寸 | 用途 |
|---|---|---|---|
| 底框窗 | `Images\TownNPCs\Portraits\Portrait_Window`(AssetInitializer.cs:949 → TextureAssets.cs:608) | 112×112 | 三模式共用的圆形底框,`chatBack` 染色 |
| 精绘头像 | `Images/TownNPCs/Portraits/Portrait_<Name>[_shimmer|_变体]`(NPCID.cs:216 起内嵌路径) | 200×200 | 仅 Detailed 模式消费(`npcChatPortrait` provider) |
| NPC 实体贴图 | `Images/TownNPCs/<档案>`(Profiles 管线) | 竖条多帧 | CloseUp/Retro 经 dummy 直绘 |

---

## 8. 本仓现状对照(game/)

### 8.1 已有的数据面(覆盖 ①Detailed 全量 + ②③偏移表全量)

- `src/data/npcPortraits.ts`:`NPC_PORTRAITS`(:7-15,28 常规镇民 vid→名)+ 宠物三族六变体
  (`CAT/DOG/BUNNY_VARIANTS` :18-20,vid 637/638/656,`.Default` 兜底 :22)+ 八城镇史莱姆
  (`SLIME_PORTRAITS` :24-33)+ 动物学家 633 人/狼人×微光四分支(:60-66,条件优先序与 NPCID.cs:332-337
  一致)+ 通用微光臂(:71,`SHIMMER_HAVE` :76-82 与实盘 30 张 `_shimmer` 资产对锁)。
  `portraitForNpc`(:54)= 原版 `NPCPortraitSelector` 条件链的等价实现。
- `src/data/vanilla-portrait-offsets.json`:closeUp 40 条 + fullBodyRetro 21 条,**与反编译逐值
  diff = 0**(2026-09-14 复核,零缺键零漂移)。
- `src/data/townNpcProfiles.ts`:`townNpcProfileSheet` = TownNPCProfiles/Profiles 四类档案的选图
  (Legacy/Transformable/Stacked/变体),CloseUp/Retro 直绘的贴图来源;Profile 缺档回落
  `vanilla/NPC_<vid>.png`。
- 资产:`public/sprites/portraits/` 86 张(200×200 精绘像全量);`Portrait_Window` 底框已在库
  (`public/sprites/vanilla/TownNPCs_Portraits_Portrait_Window.png` 与
  `Portraits_Portrait_Window.png`,112×112)——**但无任何 src 代码消费**(grep 零命中)。
- 载荷:`Game.ts:33425-33433 portraitPayloadOf` = `{ vanillaId, variationIndex, altTexture, shimmered,
  url }`(`DialoguePortraitPayload` 扩展 `PortraitNpcCtx`,npcPortraits.ts:88-91);开对话
  (Game.ts:33342)与刷新对话(:33771)双路注入。
- 诊断脚本:`scripts/_portrait-repro.mjs`、`_portrait-shots.mjs`、`_npc-btn-parity-probe.mjs`(:314-328
  已覆盖三模式截图探针)。

### 8.2 已有的绘制面(`src/ui/NpcDialog.ts`)

- 模式读取:`open()` :249-253 `const mode = options.data.dialoguePortraitMode` →
  `portraitOn = !!portrait && !!portrait.url && mode !== 'disabled'`(url=null 与 Disabled 都不画
  = 原版 :41015/:41020 双早退等价);canvas 152×184(2× 内部分辨率,CSS 76×92,:252)。
- `drawPortrait`(:325-431)三分支:
  - **CloseUp**(:368-386):`townNpcProfileSheet` 贴图行 0,scale 6(= 原版 scale 3 × canvas 2×);
    宠物特支 :374-381 复刻 :41086-41095 的 `num15 = −36+((96−fw)/2)/6*6` 6-texel 取整
    (isPet 名单 = 637/638/656/670/678-684,与 `NPCID.Sets.IsTownPet` = `CreateBoolSet(637,638,656,670,
    678,679,680,681,682,683,684)`(NPCID.cs:4446)**逐 id 全等**);lift 16/−20 对应 num14;
    偏移表 `off` 按 scale 乘算。
  - **FullBodyRetro**(:387-393):行 0 全帧高,scale 4(= scale 2 × 2×),底对齐 + RetroOffsets。
  - **Detailed**(:398-430):200×200 精绘图 alpha 包围盒(:404-423)→ cover 等比铺满 76×92。
- 自愈链:Profile 档缺失/加载失败 → `NPC_<id>` 兜底 → 1s/2s/4s 退避重试,TTL 10s(:342-359)。

### 8.3 已有的设置面

- `src/core/Options.ts`::144 类型 `'detailed'|'closeUp'|'fullBodyRetro'|'disabled'`;:342 缺省
  `'detailed'`(= Main.cs:67676);:464-467 坏值归一化卫门;持久化 `'sandboxworld.options'`
  (KvStore,:287/:397/:578)——对应原版 config.json `"PortraitPreference"`。
- `src/ui/Settings.ts`::427-437 循环行(界面组,:408 注释锚 IngameOptions.cs:823):文案复用
  `UI.Portraits*` 四键,循环序 detailed→closeUp→fullBodyRetro→disabled(:433-436)与原版
  `CycleNPCPortraitMode` 一致;无快捷键(与原版一致)。
- l10n:`UI.Portraits*` 四键经 `tools/l10n-custom` 通道在本仓 Lang 体系可用(Settings.ts:430-432)。

### 8.4 差异与缺口清单(对齐波候选)

| # | 类型 | 差异 | 原版锚 | 本仓锚 |
|---|---|---|---|---|
| D1 | 刻意分歧(已登记) | Detailed 定位:原版 200×200 **原尺寸**画进 112 窗(靠贴图自带 alpha 留白成圆框);本仓 alpha 包围盒 cover 铺满 76×92 矩形框 | :41073 | NpcDialog.ts:238-241(注释已登记)、:398-430 |
| D2 | 缺口 | 底框:原版 `Portrait_Window` 112×112 贴图 + `chatBack` 染色;本仓用 CSS 边框矩形。**资产已在库未消费** | :41032-41033/:41069;AssetInitializer.cs:949 | NpcDialog.ts:108-110 |
| D3 | 几何差异 | 剪裁窗:原版 CloseUp 96 宽×146 高(UI px,上越窗顶 42px/下止中心+48px);本仓以 canvas 76×92(UI 尺寸)为界 | :41109-41112 | NpcDialog.ts:252(canvas) |
| D4 | 几何差异 | FullBodyRetro 原版**无剪裁**可越窗上沿;本仓受 canvas 边界裁剪 | :41139-41140 | NpcDialog.ts:387-393 |
| D5 | 行为差异 | hop:原版 80 帧 `EaseOutBounce` 抬 14px,触发 = SetTalkNPC + 六个对话动作(§5.2);本仓 CSS `0.35s cubic-bezier` 抬 14px(:111-112),且 `refreshNpcDialog` 重建 canvas → 每次刷新台词都重播(原版刷新不 hop) | :41049-41055;:41378 | NpcDialog.ts:108-112 |
| D6 | 简化(可接受/登记) | CloseUp/Retro = 静态贴图行 0 直绘;原版走 `DrawNPCDirect` 全管线:party 帽(UsesPartyHat NPC.cs:67388)、`DrawNPCExtras` portrait nudge(scale2 −4px/scale3 −8px,Main.cs:27580-27586)、彩虹史莱姆 shader + UI 批重建(:25765/:25783)、shimmerTransparency | §3 表 | NpcDialog.ts:330-396 |
| D7 | 布局差异 | 名字:原版画在底框内底部 `P+(0,57)`(ItemStack 字体白字);本仓在面板标题行 `.sw-npc-name` | :41145-41149 | NpcDialog.ts:114-115/:263 |
| D8 | 布局差异 | 窗锚:原版头像悬在 500px 对话面板**左外侧**(P = 左上角 +(−62,+62));本仓头像为面板内 flex 左列 | NPCChatPanel.cs:65-79 | NpcDialog.ts:97-113/:262 |

无快捷键、循环序、缺省值、坏值归一、url=null 不画、宠物 11 型特支、两张偏移表——以上各项
本仓与原版**已 1:1**。

---

## 9. 1458 基线校验(2026-08-24 热补丁)

对 `Terarria1458/` 逐段 diff:①`Main.cs` DrawNPCPortrait 函数体(1457:41012-41151 vs 1458:41018-41157,
整体 +6 行)全等;②两张偏移字典(NPCID.cs:4517-4935)全等;③`NPCChatPanel.cs` 全文件全等;
④`IngameOptions.cs` :820-840 设置行全等。1458 在该特性面**零变更**,本文行号可直接使用;
1458 侧锚点(如需引用):CycleNPCPortraitMode :40997、DrawNPCPortrait :41018、设置旧菜单行 :50767。
