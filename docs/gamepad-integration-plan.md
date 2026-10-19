# 手柄输入域规模定谳 + 分层接入批计划（gamepad-integration-plan）

> 定稿日期 2026-09-29 · 定谳刀 E 产物 · **零生产刀**（本文档为唯一产出，未触碰任何生产代码）
> 立案依据：X4-债8（BJ397 手柄 48f pan 档维持登记债）门控=本仓无手柄输入域；用户令
> 「缺失的子系统先补齐」。手柄域是横跨输入/UI/Player 三域的核心大系统，按 playbook
> 铁律先定规模再动刀。**本文档为后续实施批唯一蓝本。**
> 反编译标杆：`Terarria1457/`（1458 增量未触及 GameInput 域数值面，下述锚点两版同文
> 或已标注 1458 行号）。

---

## 1. 原版手柄域全谱（Terarria1457 亲读）

### 1.1 专属代码面规模

| 域 | 文件 | 行数 | 职责 |
|---|---|---|---|
| **Terraria.GameInput/**（11 文件，计 4775 行） | PlayerInput.cs | 2569 | 核心中枢：UpdateInput 主链（MouseInput→KeyboardInput→GamePadInput→Triggers.Update→PostInput，:872-912；主循环挂点 Main.cs:18558）、InputMode 切换、SettingsForUI 光标模式（Mouse/Gamepad 互换 :103-133）、Profile 管理与存取（:768-817）、虚拟鼠标（摇杆→MouseX/MouseY，GamePadInput 内 :1204-1345）、DpadSnap（:1718-1783）、重绑（:1598-1692）、BuildingMode、FastUse、手柄按键提示文案（ComposeInstructionsForGamepad :1794-1924） |
| | TriggersSet.cs | 945 | 61 触发器 bool 属性（KeyStatus 字典 :9）+ **CopyInto 触发器→Player.control\* 装配面**（:773-896：MouseLeft→controlUseItem 带 blockMouse/mouseInterface 门；HotbarPlus/Minus→HotbarScrollCD/HotbarHoldTime；Loadout1-3/Next/Previous 边沿；Dash/ArmorSetAbility）+ CopyIntoDuringChat（:899-928）+ GetNavigatorDirections（:745-757） |
| | LockOnHelper.cs | 538 | 手柄锁定辅助瞄准（LOCKON_RANGE=2000f、HoldLife 40 帧；FocusTarget/TargetClosest/ThreeDS 三模式 :13-18；消费面 IngameOptions.cs:1379-1396 + Player 攻击索敌） |
| | PlayerInputProfile.cs | 367 | 每档：按 InputMode 的 KeyConfiguration 表、死区组（TriggersDeadzone=0.3 / InterfaceDeadzoneX=0.2 / LeftThumbstickDeadzoneX=0.25 / Y=0.4）、摇杆反转位、**PanControl_Gamepad 缺省=OnAlways**（:61）、HotbarRadialHoldTimeRequired=16、InventoryMoveCD=6、Load/Save/版本迁移（:81-237）、四 Copy 族（:287-337） |
| | TriggerNames.cs | 124 | **61 个触发器名常量**（全名单见 §1.3） |
| | KeyConfiguration.cs | 94 | 触发器→按键/按钮列表映射（`trigger→List<string>`）+ **Processkey**（命中任一绑定→`set.KeyStatus[trigger]=true`，:25-40）+ WritePreferences 强制 MouseLeft/Inventory 非空（:84-91） |
| | SmartSelectGamepadPointer.cs | 68 | 手柄智能选取指针（ShouldBeUsed = UsingGamepad ∧ controlTorch ∧ SmartCursorIsUsed，:8-16；指针位=中心+归一偏移×(80,64)，:55-67）。**本仓已有死代码对照件 SmartSelect.ts** |
| | TriggersPack.cs | 43 | Current/Old/JustPressed/JustReleased 四套 + Update 差分（:21-24） |
| | PresetProfiles.cs | 10 | None/Redigit/Yoraiz0r/ConsolePS/ConsoleXBox 五预设 |
| | InputMode.cs | 10 | **Keyboard / KeyboardUI / Mouse / XBoxGamepad / XBoxGamepadUI** 五值 |
| | CursorMode.cs | 7 | Mouse / Gamepad |
| **Terraria.UI.Gamepad/**（6 文件，计 1507 行） | UILinkPointNavigator.cs | 596 | **UI 焦点导航中枢**：link point 注册/移动/高亮 + Shortcuts 静态状态仓（CRAFT_\*/NPCS_\*/INV_MOVE_OPTION_CD 等逐面板状态位 :13-约200） |
| | GamepadPointID.cs | 510 | 各 UI 面板 link point id 分配常量 |
| | UILinkPage.cs / UILinkPoint.cs / GamepadPageID.cs / GamepadMainMenuHandler.cs | 452 | 页/点结构 + 标题屏手柄处理 |
| **UI 状态件** | UIManageControls.cs | 1068 | 键位重绑 UI（游戏内+菜单） |
| | UIVirtualKeyboard.cs | 1082 | 手柄虚拟键盘 |
| | UIGamepadHelper.cs | 369 | 手柄帮助浮层 |

**专属面合计 ≈ 9900 行**（GameInput 4775 + UI.Gamepad 1507 + 三个 UI 状态件 2519 + LockOn/UI 零散）。

### 1.2 消费面普查（专属面之外的引用密度）

- `PlayerInput.UsingGamepad`：**132 处引用，39 个文件**。大头：Main.cs 38 / Player.cs 23 /
  ItemSlot.cs 9 / WiresUI.cs 9 / UICharacterCreation 3 / NPCChatPanel 3 / NewCraftingUI 3 /
  AHoverInteractionChecker 3 / Mount.cs 2 / SmartCursorHelper 2 / 各 UIStates 1-2。
- `PlayerInput.*` 全前缀：Main.cs **223 处**；`UILinkPointNavigator`：**40 个文件**
  （Main.cs 独占 84 处）。
- 语义分组（132 处 UsingGamepad 的去向，供分层对账）：
  - **世界交互面**：虚拟鼠标/瞄准（Main.cs 更新链+Player.cs 索敌/朝向/lock-on），
    ItemID 游戏柄射程扩张（GamepadExtraRange ItemID.cs:1164 / GamepadWholeScreenUseRange
    ItemID.cs:1166，61 件全屏射程表）；
  - **UI 语义门**：ItemSlot.cs:573/608/1638/1646/1667/2110（替代点击/Shift 垃圾桶禁用/
    手柄 UI 模式换装位）、radial 菜单（:3814/:3851 CircularRadial/QuicksRadial 透明度驱动、
    :3924 DpadHotbar）；
  - **提示面**：ComposeInstructionsForGamepad（按键提示条）、GameTipsProvider 加载提示池、
    ShowGamepadHints（Player.cs:17497 智能交互高亮门）；
  - **相机面**：pan 手柄档（§1.5）、SmartCursorWanted_GamePad 独立旗。
- 输入模式切换点（谁在写 CurrentInputMode）：MouseInput→Mouse（PlayerInput.cs:1450）、
  KeyboardInput→Keyboard（:1541）、GamePadInput→XBoxGamepad/UI（:1025/:1378，判定式：
  gameMenu ∨ UILinkPointNavigator.Available∧非建造 ∨ talkNPC ∨ sign ∨ IngameFancyUI.CanCover
  → XBoxGamepadUI，:999-1013）、鼠标动/滚轮→Mouse（SettingsForUI :123-133）。
  **裁决序 = 鼠标最后动优先回鼠标**（UpdateInput 内 MouseInput 先采样、GamePadInput 后覆盖，
  移动鼠标立即收回 CursorMode.Mouse）。

### 1.3 触发器全名单（61 个，TriggerNames.cs 逐字）

- **鼠标档**：MouseLeft、MouseRight
- **移动/动作**：Up、Down、Left、Right、Jump、Throw、Dash、Grapple
- **功能**：Inventory、SmartSelect、SmartCursor、QuickMount、QuickHeal、QuickMana、QuickBuff、
  LockOn、ArmorSetAbility
- **热栏**：Hotbar1-10、HotbarMinus、HotbarPlus、RadialHotbar、RadialQuickbar
- **地图**：MapZoomIn/Out、MapAlphaUp/Down、MapFull、MapStyle
- **视角**：ViewZoomIn、ViewZoomOut、ToggleCameraMode
- **配装**：Loadout1-3、NextLoadout、PreviousLoadout
- **手柄专供（键盘档不存在）**：DpadRadial1-4、DpadSnap1-4、MenuUp/Down/Left/Right、
  ToggleCreativeMenu
- 本仓 Keybinds.ts 现有 36 action = 上表的键盘子集；手柄接入需新增面=手柄专供组 +
  Throw + LockOn（MouseLeft/Right 为 Input 硬编码等价面）。

### 1.4 GamePadInput 主链机制（PlayerInput.cs:976-1394）

1. **设备扫描**：GamePad.GetState(PlayerIndex 0..3) 取首个 IsConnected（:982-993）；
   `Main.SettingBlockGamepadsEntirely` 总闸、FocusHelper 焦点闸。
2. **UI/游戏模式裁决**（§1.2 判定式）→ XBoxGamepadUI / XBoxGamepad。
3. **按钮枚举**：Buttons 枚举全值×掩码过滤→IsButtonDown→`keyConfiguration.Processkey`
   （触发器命中→KeyStatus[trigger]=true + LatestInputMode 记账）。
4. **摇杆→方向键**：右/左摇杆各四向，门=方向支配（`Dot(方向, 归一摇杆)≥num2`，
   游戏 0.6/UI 0.4）∧ 轴死区（LeftDeadzoneX 0.25/Y 0.4，RightDeadzone 0）→
   Processkey("LeftThumbstickLeft" 等合成键名)。
5. **扳机**：LT/RT > TriggersDeadzone(0.3)→Processkey；SteamDeck+鼠标光标模式特判
   RT→MouseLeft 直写。
6. **虚拟鼠标**（世界瞄准核心，:1204-1345）：
   - 基准点=玩家中心（全屏射程物→屏幕中心）；
   - 右摇杆×速度向量（8px 基数 + 手持物 tileBoost/GamepadExtraRange/yoyo+5/远程+10/
     blockRange 等加成，:1200-1218）×zoom→MouseX/MouseY；
   - 左摇杆副瞄准（AllowSecondaryGamepadAim，智能光标系）；
   - 钳位=格射程盒（tileRange±num4，×16，建筑物含 blockRange，全屏射程=半屏）；
   - smartSelectPointer.UpdateSize/Center 每帧同步；
   - DpadSnap：四向 dpad 离散挪格（冷却=useTime，:1718-1783）。
7. **CopyInto 装配**（TriggersSet.cs:773-896）→ Player.control\* 与 Main.mouseLeft/Right
   （PlayerInput.cs:907-908 `Main.mouseLeft = Triggers.Current.MouseLeft`——手柄 MouseLeft
   与物理鼠标同号入栈，消费侧无感知分叉）。
8. **PostInput**（:1694-1717）：GamepadCursorAlpha 渐变（虚拟光标淡入淡出）；HotbarPlus/Minus
   电平差→RadialHotbar/RadialQuickbar 旗（长按 16 帧阈值 HotbarRadialHoldTimeRequired）。

### 1.5 48f pan 档精确上下文（X4-债8 兑现锚）

`Main.GetPlayerControlledCameraPan`（Main.cs:63705-63785，1458 :63711-63791）：

```csharp
// :63719-63720 档位取值：手柄走 PanControl_Gamepad（缺省 OnAlways），键盘走 PanControl_Keyboard（缺省 Hold）
ButtonControlMode buttonControlMode = (PlayerInput.UsingGamepad
    ? PlayerInput.CurrentProfile.PanControl_Gamepad
    : PlayerInput.CurrentProfile.PanControl_Keyboard);
...
if (PlayerInput.UsingGamepad)                                   // :63762
{
    if (PlayerInput.GamepadThumbstickRight.Length() == 0f && SmartCursorIsUsed)
        return false;                                           // :63764-63766 右摇杆归零∧智能光标→不 pan
    if (buttonControlMode == ButtonControlMode.Click && !localPlayer.hasClickPanOn)
        return false;                                           // :63767-63769 Click 档未激活→不 pan
    maxPanSpeed = 48f;                                          // :63772 ← 48f 档本体
}
else if ((needsMouseRight && !flag2) || localPlayer.selectedItem == 58)  // :63774-63776 键盘门
    return false;
targetPan = vector * Camera.ScaledSize / 2f * panFactor;        // :63778 同式
```

- 摇杆死区：GamepadThumbstickRight 写点=PlayerInput.cs:1055（`(1,-1)` 翻 Y×反转位）；
  XNA 摇杆自带归一，死区由 Profile 的 RightThumbstickDeadzoneX/Y（缺省 0）+ pan 因子档
  （GetPanControlValues，Player.cs:6268-6289）联合裁决——**pan 面无独立死区常量**，
  `Length()==0` 即 XNA 精确零向量。
- 本仓挂点已备：pan 链在 Game.ts:11535-11630（档位面/Click 档/mount 门/BJ400 施加点
  全在位，手柄支维持登记注 :11581）；`Camera.advancePan`（Camera.ts:109-127）现取
  类常量 `Camera.PAN_MAX_SPEED=36`（:134-136 注已标 48f 登记债）——L1 需把 maxPanSpeed
  参数化（缺省 36，手柄支传 48，键盘路径零变化）。

---

## 2. 本仓接入点普查

### 2.1 既有手柄臂（刀 D 保留的死代码/登记注，共 10 锚）

| 锚 | 现状 | usingGamepad 真值接入后 |
|---|---|---|
| Game.ts:11581 | 48f 档登记注（pan 链内，链本体在 :11535-11630） | **L1 兑现点**：pan 链加手柄支 |
| Camera.ts:109 `advancePan` | maxPanSpeed 硬编码 PAN_MAX_SPEED=36 | L1 参数化（缺省 36 键盘零变） |
| Game.ts:13520 → SmartSelect.ts:153-154/:321-323 | smart-select env.usingGamepad=false；粘滞策略分支保留为死代码 | 真值后激活（行为=手柄下沿用上帧策略，原版语义） |
| Game.ts:45645 → DoorOpeningHelper.ts:30/:208-211 | doorHelper env.usingGamepad=false；`gamepadOnly` 谓词保留 | 真值后激活（设置页三档 SmartDoors 的 gamepadOnly 档从死档变活档） |
| Game.ts:28235 | 提取机产物出生点：手柄→玩家中心面「不建模」 | L2 建模（一行级：出生点分支） |
| Game.ts:36230-36231 | ShowGamepadHints 门 ≡ smartCursor.wanted（PC 恒 false 化简） | L2 按原式还原 `(!ShowGamepadHints && !SmartCursorIsUsed)` |
| Game.ts:37431/:37591 | GamepadDisableCursorItemIcon（Main.cs:2686-2694）不接线 | L2/L3 接线（虚拟光标淡出时藏手持物图标） |
| Game.ts:8804（fullMapWheelZoom :8809 区） | 全屏图滚轮缩放手柄臂 HotbarPlus/Minus ×0.1f（Player.cs:25391-25394）登记不建 | L2 建（与热栏滚动同触发器，一处取电平） |
| SlotActions.ts:184 | ItemSlot.cs:608 `DisableLeftShiftTrashCan && !UsingGamepad` 简化为 `disableLeftShiftTrashCan`（手柄臂丢弃） | 真值后**须补回取反臂**（手柄下 Shift 垃圾桶不再被该选项禁用——原版语义，注意这是行为变化点） |
| UIWorldLoadState.ts:62-73 | **全仓唯一活 Gamepad API 面**：`navigator.getGamepads()` 设备探测选加载提示池（IIIII229 登记面） | L1 起改读统一 usingGamepad 单源（现设备探测=近似口径，升级为输入态口径） |

另：SmartInteractTiles.ts:12（Player.cs:17497-17498 ShowGamepadHints 门注）、
Options.ts:105-107 + Settings.ts:708-716（智能门三档 UI——gamepadOnly 文案/循环序已 1:1
在位，只等谓词活）、Renderer.ts:13663（住房光标注）。

### 2.2 输入系统架构现状（手柄从哪接入）

- **Input.ts（533 行）单汇聚点**：物理键盘（`keys` Set + keydownHandlers 边沿）、
  虚拟 action 通道（`virtualActions` Set + `setVirtualAction`/`pressVirtual`——
  MobileControls 在用，mainFlow.ts:332 进世界挂载先例）、触摸合成（mouseDown/rightDown/
  长按右键脉冲）、滚轮（wheelDelta ±notch 档）、`uiBlocking` 总门。
- **action 化已就绪**：`downAction(action)`（Input.ts:398-403）= uiBlocking 门 ∧
  virtualActions ∨ 绑定码命中；Game.ts 消费点 17 处（inputX/Jump 装配 :9461-9468、
  SmartSelect :9480、SmartCursor :13381、torch :13513、QuickMount 闩 :13901-13935、
  运动门 :27173）。
- **Keybinds.ts（283 行）**：36 action 键盘子集、Redigit 预设、options.json 持久化、
  Settings.ts:242-282 重绑监听 UI。手柄档可直接平铺为第二张绑定表
  （对应原版 KeyConfiguration 按 InputMode 分表）。
- **结论**：手柄的生产者形态与 MobileControls 同构——**新增第三输入生产者
  （GamepadPoller），走同一 action/电平注入面**，消费侧 17 处 downAction 零改动；
  手柄独有面（摇杆模拟量/死区/虚拟鼠标/pan 档）在 poller 内结算后以
  MouseX/MouseY（=Input.mouseX/Y 写入）与 pan 向量出口。

### 2.3 UI 导航现状（L3 难度评估）

- **主 UI = DOM**（src/ui/UI.ts 11639 行 + 40 余面板件），hover 靠 CSS :hover 与 JS
  mousemove 监听；`Game.inpOverDomUi`（elementFromPoint）+ domTargets.ts 白名单承担
  「光标在 UI 上」判定。**无任何键盘/手柄焦点导航**（仅 Esc 链 escapeChain）。
- **VUI（src/vui）**= 原版 UIElement/UserInterface 的移植子集（UIWorldLoadState 等
  4 状态在用），UserInterface.update 只吃鼠标指针（UserInterface.ts:111-124），
  **无 UILinkPointNavigator 等价物**。
- 原 L3 若按原版 link-point 全谱复刻：40 消费文件 × Shortcuts 状态位，本仓 DOM 面板
  逐一挂焦点网格 ≈ 每面板独立改造，属最大不确定面。
- **替代路线（推荐）**：手柄虚拟光标 = 摇杆直写 Input.mouseX/mouseY（原版世界面同式）
  + DOM 面板内用「光标命中=elementFromPoint + 激活键合成 click/keydown」。DOM 面板
  零逐面板改造即可操作；CSS :hover 悬停态缺失为已知偏差（列表滚动/悬停 tooltip 需
  JS 合成 mousemove 或面板按需补 hover 等价回调）。
- 标题/设置等纯列表菜单可叠加轻量 roving-focus（行内高亮+MenuUp/Down），
  不必上全谱 link-point。

---

## 3. 分层计划与规模表

> 工时口径=本仓「专注日」（含配套测试/对账/复核）。校准参照：MoreAIPlayer 28.9k 净行
> ≈25-40 日 ⇒ 熟域移植 ~700-1000 行/日；本计划按含验收网的保守密度估。

### L1 最小可观测面——手柄仅 pan（清偿 X4-债8）【2-3 专注日】

**范围**：
1. `src/core/input/gamepad.ts` 新建：navigator.getGamepads() 每帧轮询（fixedUpdate 头）+
  `gamepadconnected/disconnected` 事件 + 双摇杆/按键原始态导出；
2. **usingGamepad 单源**：Input 上新增真值面（手柄任一输入沿→true；鼠标移动/点击沿→
  回 Mouse——原版 SettingsForUI.SetCursorMode/TryRevertingToMouseMode 语义
  PlayerInput.cs:103-133），全仓 10 锚的硬编码 false 改读单源（§2.1 表逐锚）；
3. **pan 手柄支**：Game.ts pan 链（:11535 区）加手柄支=右摇杆向量（(1,-1) 翻 Y）→
  targetPan（同 :63778 式），门=死区非零 ∧ ¬(归零∧智能光标) ∧ Click 档 hasClickPanOn；
  `advancePan` 加 maxPanSpeed 参数（缺省 36，手柄传 48）；
4. UIWorldLoadState.ts 探测口改读单源（行为等价升级）。

**验收网**：
- 单测：摇杆→targetPan 向量式对拍（:63778 逐式）；死区/翻 Y；Click 档 toggle 音；
  advancePan(48) 与 36 键盘路径逐位不变（金标=既有 pan 测试全绿零改）；
- usingGamepad 仲裁：手柄沿→true / 鼠标沿→false 的状态机表；
- 逐锚回归：§2.1 十锚真值后行为快照（doorHelper gamepadOnly 档活、SmartSelect 粘滞、
  SlotActions 取反臂恢复等=每锚一条红蓝测试）；
- 键鼠回归零变化（不插手柄=GamepadPoller 纯观察零写）。

**依赖**：无前置。L2/L3/L4 全部踩在本层之上（单源+poller 是公共地基）。

### L2 游戏内动作面——核心 Trigger 映射+虚拟鼠标【5-8 专注日】

**范围**：
1. **触发器层**（GameInput 等价首切片）：61 触发器名单落地（Keybinds.ts 扩手柄表）；
   TriggersPack 四套（Current/Old/JustPressed/JustReleased）+ Processkey；
   CopyInto 装配面与现 17 处 downAction 消费对接（移动/跳/使用/热栏优先）；
2. **绑定预设**：XBoxGamepad 档默认表（PlayerInput.Reset :2062-2140 手柄支逐项），
   A=Jump/B=Inventory/RT=MouseLeft/RB=Grapple 等；
3. **虚拟鼠标**（GamePadInput :1204-1345 1:1）：右摇杆瞄准、速度向量=手持物加成面
   （tileBoost/GamepadExtraRange ItemID.cs:1164 / WholeScreenUseRange :1166 两表入库）、
   格射程钳位、左摇杆副瞄准、DpadSnap 可选切片；
4. MouseLeft/MouseRight 同号入栈（blockMouse/delayUseItem 电平面直接复用 Input 既有
   语义）；HotbarPlus/Minus 滚动 + Game.ts:8804 全屏图 ×0.1f 臂补建 + RadialHotbar
   旗（radial UI 本体可后置，旗先记账）；
5. §2.1 尾锚补建：提取机手柄出生点、ShowGamepadHints 原式还原、GamepadDisableCursorItemIcon。

**验收网**：按钮→触发器映射表对拍原版预设（逐项 1:1）；死区支配门表测（Dot≥0.6/0.4）；
虚拟鼠标速度/钳位对拍（含 yoyo+5/远程+10 特例）；MouseLeft 电平与 blockMouse 交互回归
（既有 AF1/BJ1 测试全绿）；金标闸门全绿（数据面零接触）。

**依赖**：L1（单源+poller+pan）。Throw/LockOn 触发器此处仅记账（LockOn 本体在 L4）。

### L3 UI 导航面【6-12 专注日（按路线分档）】

**范围**：
1. **路线 A（推荐）虚拟光标**：手柄光标模式（CursorMode.Gamepad 等价）下摇杆驱动
   Input.mouseX/Y + 光标渲染（GamepadCursorAlpha 渐变 PostInput :1695）；激活键（A）=
   elementFromPoint 合成 click/键盘沿；B=Esc 链（escapeChain 已单源）；DOM 面板悬停
   等价=合成 mousemove 或高频面板逐个补 hover 回调；
2. **路线 B（全谱）link-point 复刻**：UILinkPointNavigator+GamepadPointID+Shortcuts
   移植到 VUI/DOM 双栈——40 消费文件面，报价 15-20+ 专注日，**不推荐首期**；
3. MenuUp/Down/Left/Right 轻量 roving-focus：标题/设置/世界选择等纯列表菜单先行；
   背包格盘导航（InventoryMoveCD=6 节流）作为 A 路线增强切片；
4. UIWorldLoadState 提示池、GameTipsProvider 手柄文案（l10n 键已在位三语）。

**验收网**：光标模式互换状态机（鼠标沿→Mouse/手柄沿→Gamepad，含 PreventCursorMode
SwappingToGamepad 抖动闸）；合成 click 命中=真实点击命中对照（DOM 逐槽等价——
FX28 判例复用）；Esc 链回归；每打开面板焦点可达性冒烟清单。

**依赖**：L1+L2（激活键依赖 MouseLeft 等触发器；光标淡入淡出依赖 PostInput 等价）。

### L4 完整 Profile+键位重绑 UI【6-10 专注日】

**范围**：
1. PlayerInputProfile 等价：死区五参/摇杆反转/InventoryMoveCD/HotbarRadialHoldTime
   + Profile 增删改存（options.json，对应原版 input profiles.json——FX16 载体判例同域）；
2. 重绑 UI：UIManageControls 等价（Settings.ts 扩手柄页；CheckRebindingProcessGamepad
   :1598-1642 监听语义=按下即绑定/同表反选解绑）；
3. Radial 热栏/快捷条 UI（ItemSlot.cs:3814/:3851）+ DpadRadial1-4 径向菜单；
4. LockOnHelper（538 行）+ LockOn 触发器（三模式+IngameOptions 循环序）；Throw 触发器；
5. ComposeInstructionsForGamepad 按键提示条（UI 面常驻提示）。

**验收网**：Profile 存取 round-trip（FX11 判据）；死区五参生效位单测；重绑冲突检测
（FixKeysConflict :1570）；LockOn 索敌对拍（2000f/40 帧三模式）。

**依赖**：L1-L3。LockOn/radial 若产品面砍需求可裁（不影响 L1-L3 独立闭环）。

### 总表

| 层 | 工时 | 核心交付 | 关键风险 |
|---|---|---|---|
| L1 | 2-3 日 | GamepadPoller+usingGamepad 单源+pan 手柄支+48f 档（**X4-债8 清偿**） | 死代码臂激活面（§2.1 十锚） |
| L2 | 5-8 日 | 61 触发器+预设绑定+虚拟鼠标+射程两表 | MouseLeft 电平语义与既有 AF1/BJ1 交互 |
| L3 | 6-12 日 | 光标模式互换+虚拟光标/roving-focus | DOM hover 缺口；光标所有权仲裁 |
| L4 | 6-10 日 | Profile/重绑/radial/LockOn/提示条 | 载体语义（profiles.json≠.plr 判例同域） |
| 合计 | **19-33 日** | 全谱 ≈1 万行等价面 | — |

---

## 4. 风险清单（Top3）

1. **usingGamepad 真值激活既有死代码臂（每锚需独立复核）**——§2.1 十锚中六处是
   「真值即行为变化」：SmartSelect 粘滞支、doorHelper gamepadOnly 谓词、SlotActions
   取反臂（**语义反转**：现恒走 `flag=disableLeftShiftTrashCan`，真值后=手柄下 Shift
   垃圾桶不再被禁）、UIWorldLoadState 提示池切 GamePad 档。缓解：L1 验收网逐锚红蓝
   测试 + 行为快照；任何一锚不确定先维持 false 局部冻结（per-consumer 灰度开关）。
2. **光标所有权仲裁（L3 最大不确定面）**——鼠标动→回 Mouse 模式与手柄沿→Gamepad 模式
   的竞态（原版靠帧内固定裁决序：Mouse 先采样、GamePad 后覆盖、鼠标沿下一帧收回）；
   DOM 面板 hover 缺口（CSS :hover 不响应合成坐标）与 elementFromPoint 白名单
   （domTargets.ts）共用即「光标在 UI 上」判定,分叉即双光标/双激活。缓解：裁决序
   单点化（poller 内固定序）+ 光标模式状态机表测 + FX28 DOM 逐槽命中等价判例复用。
3. **轮询节拍与电平保真**——Gamepad API 是拉模式（每帧 getGamepads 快照），tap 类
   短按可落在两个 fixedTick 之间（与触摸 pendingTapRelease 同族病，Input.ts:126-131
   有先例）；扳机/摇杆是模拟量，死区外的微小漂移会造成「幽灵电平」（原版 XNA 死区
   在硬件层，浏览器标准映射死区因驱动而异）。缓解：沿检测=帧间差分+亚帧缓冲
   （pendingTapRelease 同款兜底）；profile 死区参在 L1 就挂最小缺省（0.25/0.4 摇杆、
   0.3 扳机），L4 才开放 UI 调参。

**非风险项**：数据面（item/npc/atlas 金标）零接触——手柄域不触任何 json 数据资产；
1458 增量未动 GameInput 数值面（SetDefaults 零变更域同口径）。

---

## 5. 结论与建议

1. **48f 档在哪层兑现**：L1（它就是 pan 手柄支本体；Game.ts:11581 登记注与
   Camera.ts advancePan 参数化两处即全部挂点，清偿即摘 X4-债8）。
2. **L1 是否值得单独做**：值得。半径小（1 新文件+1 参数化+10 锚单源换接）、
   收益独立可观测（手柄插上=能 pan 镜头+加载提示池切档+智能门 gamepadOnly 档激活）、
   且是 L2-L4 唯一公共地基（poller+usingGamepad 单源）。L1 完成后每层可独立
   拍板是否续做，避免大爆炸批。
3. **推荐批次序**：L1（2-3 日）→ L2（5-8 日）→ L3 路线 A（6-12 日）→ L4 按需
   （6-10 日，radial/LockOn 可裁）。全谱 19-33 专注日；若产品面只要
   「能用手柄玩」，L1+L2+L3-A = 13-23 日即达可用线。
4. **实施时纪律**：每层走 playbook 每刀 Checklist；L1 落刀前重跑
   recon-item/recon-npc 双闸门确认数据面零漂；新 UI 文案先补
   `tools/l10n-custom/{zh-Hans,en-US}.json` 再 build-l10n（l10n-audit 硬门）；
   并行会话期探针走私有 vite 实例（5199 约定）。

## 附：本刀取证清单（零生产改动自证）

- 亲读：Terarria1457/Terraria.GameInput/ 全 11 文件（含 PlayerInput.cs:976-1394 全文、
  TriggersSet.cs CopyInto 域、PlayerInputProfile.cs 头域、KeyConfiguration.cs 全文、
  SmartSelectGamepadPointer.cs 全文、TriggersPack.cs 全文、InputMode/CursorMode/
  TriggerNames/PresetProfiles 全文）；Terraria.UI.Gamepad/UILinkPointNavigator.cs 头域；
  Main.cs:63700-63830（pan 全档）、:2686-2700（GamepadDisableCursorItemIcon）、
  Main.cs:18558（UpdateInput 挂点）；Player.cs:25385-25400（HotbarPlus ×0.1f 臂）；
  ItemID.cs:1164/:1166（射程两表）。
- 本仓：Game.ts:8795-8815/:11535-11630/:13460-13525/:28225-28240/:45620-45670；
  Input.ts 全文；Keybinds.ts 头域；Keybinds 消费面 grep（17 处）；MobileControls.ts
  虚拟通道；Camera.ts:105-136（advancePan/PAN_MAX_SPEED）；vui/core/UserInterface.ts;
  DoorOpeningHelper.ts/SmartSelect.ts/SlotActions.ts/SmartInteractTiles.ts/Options.ts/
  Settings.ts/UIWorldLoadState.ts 逐锚；registered-debts-x-waves.md X4-债8 全文。
- 写文件：仅本文档。生产代码 diff=0。
