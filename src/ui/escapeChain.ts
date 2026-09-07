// SW-BN3 2026-09-07（用户拍板方案 A：对齐原版）：Inventory/Esc 优先级链的【决策核】
// ——纯函数（状态进、动作出,零副作用零 DOM）,供 main.ts 执行器与 tests/sw-bn2+
// tests/sw-bn3 单测共用。执行器（面板开关/暂停旗/面板句柄）留在 main.ts：闭包模块
// 态 pausePanel/inGame/flow 不可注入,执行面薄到一次 switch,判别力集中在
// resolveEscapeChain。
//
// 原版锚（Terarria1457）：
// - Player.cs:4961 ToggleInv 优先序链——mapFullscreen(:4963) → InBuildingMode(:4972)
//   → ingameOptionsWindow=IngameOptions.Close()(:4978-4986) → inFancyUI=Close(:4987-4989)
//   → CaptureManager(:4996) → talkNPC(:5000-5013) → sign(:5014-5016) →
//   clothesWindow(:5017-5019) → NewCraftingUI(:5020-5022) → !playerInventory=
//   OpenInventory()(:5023-5025) → else 关背包(:5026-5057)。
//   本仓无 InBuildingMode/CaptureManager/clothesWindow/独立 NewCraftingUI 态
//   （不建模/并入背包链,备案),其余支序 1:1。
// - Esc→暂停浮层的原版落点 = Player.cs:17391 TryOpeningInGameOptionsBasedOnInput
//   （死亡态 Inventory 沿 → ingameOptionsWindow ? Close : IngameOptions.Open
//   :17393-17407,调用于 UpdateDead :17187 与 Ghost :6732）+ Main.cs:46287
//   DrawInterface_29_SettingsButton（设置钮可见态 = playerInventory ∥
//   ingameOptionsWindow ∥ dead,点击 = IngameOptions.Open/Close :46292-46301）。
//   ★SW-BN3（2026-09-07 用户拍板方案 A）：撤销 BN2「背包开着 Esc=暂停浮层」的
//   用户令分歧,对齐原版——inventoryOpen 态【所有触发面】（Esc/其余绑定键/触屏
//   背包钮/暂停钮）一律落 else 支关背包(:5026,原版 ToggleInv 无触发面区分)；
//   开背包二段=关背包,开关循环。「暂停浮层叠于背包」的 Esc 路径退役。
// - 暂停浮层（IngameOptions 等价面）的原版入口（本仓保留,均在链外）：
//   ①背包内设置钮 = Main.cs:46287 DrawInterface_29_SettingsButton（可见态 =
//   playerInventory ∥ ingameOptionsWindow ∥ dead;clickAction =
//   ingameOptionsWindow ? Close : Open :46292-46301——Open 不清 playerInventory,
//   浮层叠于背包,故链 :4978 支 Esc 只收浮层不动背包）；②死亡/幽灵态 =
//   Player.cs:17391 TryOpeningInGameOptionsBasedOnInput（调用于 UpdateDead :17187
//   与 Ghost :6732）：ingameOptionsWindow ? Close : Open :17393-17407——本仓
//   dead 支 1:1;③触屏暂停小钮（原版无对应物,SW 触屏官方同位钮,SW-BN2 备案）。
// - 单机暂停 = Main.cs:17493 CanPauseGame（1457 实测行号;1458 同位零漂移;
//   netMode==0 ∧ ingameOptionsWindow ∨ ManageControls/Achievements UI ∨
//   autoPause∧(playerInventory ∨ sign≥0 ∨ InGameUI)）,消费 = :17372-17379
//   gamePaused。本仓 game.paused 同旗：ingameOptionsWindow 臂=事件驱动
//   openInGamePause/closePause（main.ts,同效）;autoPause 臂=Game.applyAutoPauseUI
//   逐帧重算（playerInventory 臂已接;sign/InGameUI 臂未建模,备案）。
// - 模态让位支（uiBlocking）= 原版 inFancyUI 支语义：fancy UI 打开时 Inventory 沿
//   只关 fancy UI、不落到背包/暂停——本仓图鉴/研究/成就/旅程/表情/手册等模态
//   （uiBlocking=true）各带自己的 Esc 关闭监听,链在此让位返回 noop。

/** 链的触发源形态：
 *  - 'escape'    = 物理键 Escape（或调试 code 口直发）——Esc 面
 *  - 'inventory' = 其余 Inventory 绑定键 / 触屏背包钮——纯背包 toggle 面
 *  - 'pause'     = 触屏暂停小钮——暂停浮层面（无面板时直达暂停菜单,桌面无此键） */
export type EscapeIntent = 'escape' | 'inventory' | 'pause';

export type EscapeChainAction =
  | 'closeSummon'      // F6 召唤面板（SW 自有态,优先于一切——原版无对应物,历史序保留）
  | 'closeFullMap'     // 原版 mapFullscreen 支（Player.cs:4963-4971）
  | 'closePause'       // 原版 ingameOptionsWindow 支（:4978-4986 IngameOptions.Close）
  | 'closeNpcDialog'   // 原版 talkNPC 支（:5000-5013,Shop 随对话关）
  | 'closeSign'        // 原版 sign 支（:5014-5016）
  | 'noop'             // 原版 inFancyUI 支（:4987-4989）——模态自带 Esc,链让位
  | 'closeInventory'   // 原版 else 关背包（:5026-5057）
  | 'openInventory'    // 原版 !playerInventory 支（:5023-5025 OpenInventory）
  | 'openPause';       // 暂停浮层开启（SW-BN3 可达面：无面板+暂停钮面 / 死亡态;
                       //  背包开着 Esc 已退役=关背包,对齐原版 :5026）

/** 决策输入快照（执行器逐字段现采,调用点见 main.ts runInventoryEscapeChain） */
export interface EscapeChainState {
  summonOpen: boolean;
  fullMapOpen: boolean;
  pauseOpen: boolean;
  npcDialogActive: boolean;
  signDialogActive: boolean;
  uiBlocking: boolean;
  inventoryOpen: boolean;
  /** SW-RB6b 2026-09-07 补：死亡/幽灵态——原版此态 ToggleInv 整链不跑
   *  （Update :17185-17193 死亡走 UpdateDead 分支），Inventory 沿改道
   *  TryOpeningInGameOptionsBasedOnInput（:17391-17410，UpdateDead :17187 与
   *  Ghost :6732 调用）：ingameOptionsWindow ? Close : Open——只开关暂停/设置
   *  浮层,永不开关背包（本仓死亡每 tick 强收背包 tickChestAutoClose,旧码
   *  Esc→openInventory 开包即被收回 = 1 tick 闪窗伪响应） */
  dead: boolean;
}

export function resolveEscapeChain(s: EscapeChainState, intent: EscapeIntent): EscapeChainAction {
  if (s.summonOpen) return 'closeSummon';
  if (s.fullMapOpen) return 'closeFullMap';
  if (s.pauseOpen) return 'closePause';
  if (s.npcDialogActive) return 'closeNpcDialog';
  if (s.signDialogActive) return 'closeSign';
  if (s.uiBlocking) return 'noop';
  if (s.dead) return s.pauseOpen ? 'closePause' : 'openPause';   // SW-RB6b（:17391-17410）
  if (s.inventoryOpen) {
    // 背包开着：所有触发面一律关背包（SW-BN3 2026-09-07 对齐原版 else 支 :5026
    // ——ToggleInv 无触发面区分;BN2 的「Esc/暂停钮面→暂停浮层」支已退役）。浮层
    // 叠于背包的合法路径只剩链外入口：背包内设置钮（Main.cs:46287）与死亡态。
    return 'closeInventory';
  }
  // 无面板：Esc 面与背包面都开背包（原版 :5023-5025 OpenInventory——Inventory
  // trigger 的统一终点）;暂停钮面直达暂停菜单（触屏官方同位钮语义）。
  return intent === 'pause' ? 'openPause' : 'openInventory';
}
