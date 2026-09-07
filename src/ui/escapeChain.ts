// SW-BN2 2026-09-07（用户令#2）：Inventory/Esc 优先级链的【决策核】——纯函数
// （状态进、动作出,零副作用零 DOM）,供 main.ts 执行器与 tests/sw-bn2 单测共用。
// 执行器（面板开关/暂停旗/面板句柄）留在 main.ts：闭包模块态 pausePanel/inGame/
// flow 不可注入,执行面薄到一次 switch,判别力集中在 resolveEscapeChain。
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
//   ★用户令（2026-09-07）：本仓把「背包开着再按 Esc」直接路由到该暂停/设置浮层
//   （原版 ToggleInv 同态是关背包 :5026——此一处为用户明令的行为分歧,其余 1:1）。
// - 单机暂停 = Main.cs:17484 CanPauseGame（netMode==0 ∧ ingameOptionsWindow →
//   gamePaused :17372-17376 消费）——本仓 game.paused 同旗;autoPause 臂
//   （playerInventory 开包暂停 :17500-17504）已独立接 Game.applyAutoPauseUI
//   （逐帧重算,不在此链,互不耦合）。
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
  | 'openPause';       // 用户令#2：背包开着 Esc（或暂停钮）→ 暂停/设置浮层

/** 决策输入快照（执行器逐字段现采,调用点见 main.ts runInventoryEscapeChain） */
export interface EscapeChainState {
  summonOpen: boolean;
  fullMapOpen: boolean;
  pauseOpen: boolean;
  npcDialogActive: boolean;
  signDialogActive: boolean;
  uiBlocking: boolean;
  inventoryOpen: boolean;
}

export function resolveEscapeChain(s: EscapeChainState, intent: EscapeIntent): EscapeChainAction {
  if (s.summonOpen) return 'closeSummon';
  if (s.fullMapOpen) return 'closeFullMap';
  if (s.pauseOpen) return 'closePause';
  if (s.npcDialogActive) return 'closeNpcDialog';
  if (s.signDialogActive) return 'closeSign';
  if (s.uiBlocking) return 'noop';
  if (s.inventoryOpen) {
    // 背包开着：纯背包面=关背包（原版 :5026）;Esc/暂停钮面=暂停浮层（用户令#2,
    // 原版此态是关背包 :5026——分歧已锚注）。浮层可叠于背包（原版 IngameOptions
    // 开时 playerInventory 不清,DrawInterface_29_SettingsButton 即此态的设置入口）。
    return intent === 'inventory' ? 'closeInventory' : 'openPause';
  }
  // 无面板：Esc 面与背包面都开背包（原版 :5023-5025 OpenInventory——Inventory
  // trigger 的统一终点）;暂停钮面直达暂停菜单（触屏官方同位钮语义）。
  return intent === 'pause' ? 'openPause' : 'openInventory';
}
