// DOM UI 目标判定(2026-08-29 手机适配 P0):此前 mousedown 门(Input.mousedown)与
// 触摸合成门(Input.isUiTarget)各自手维护一份类名清单且内容漂移(touch 版多
// .sw-mobile/.sw-hotbar/.sw-tooltip/.sw-ach-panel/.sw-res-panel/.sw-drag-ghost),
// 漏登记会把 UI 点击漏成世界挥剑(2026-08-28 商店案同族)。现收口为【唯一数组】,
// 所有"这个点击算不算 UI"的判定都走这里;新增触屏面板一律挂 .sw-mobile 子树或
// 把类名登记进本表(二选一,禁止另起第二份名单)。
//
// 取并集原则:并集只会让"本应是 UI 的点击"更不会穿透为游戏输入;.sw-mobile 等
// 仅触屏渲染的层在桌面不可见,并集对桌面 mousedown 门零影响(逐字节等价)。
export const DOM_UI_TARGET_SELECTOR =
  '.sw-root, .sw-panel, .sw-slot, .sw-recipe, .sw-btn, .sw-chatbox,' +
  '.sw-mobile, .sw-hotbar, .sw-tooltip, .sw-drag-ghost,' +
  '.sw-ach-panel, .sw-res-panel, .sw-eqdock, .sw-vinv, .sw-summon-panel,' +
  '.sw-npc-dialog, .sw-npc-shop, .sw-happy-panel';
  // .sw-npc-dialog/.sw-npc-shop/.sw-happy-panel = NPC 对话面板/商店浮面板(classic
  //  档)/快乐度浮层根（FX22 2026-09-14 用户实报:点对话「关闭」钮有几率开火/耗弹）。
  //  附着态点击本就靠 .sw-root 祖先命中;但这三个面板的左键处理会在【事件派发中途】
  //  同步 remove 面板——对话钮 close/refresh 全走重建式 open() 首行 this.close(),
  //  商店格买入 npcShopBuy→openNpcShop→NpcShop.open() 首行 this.close()——事件继续
  //  冒泡到 window 时 target 已脱离 .sw-root 子树,closest('.sw-root') 落空 ⇒ Input.ts
  //  mousedown 门(:229)放行 → mouseDown 置位=世界开火/耗弹。登记面板根类后,detached
  //  子树 closest 仍命中面板根,守卫与派发时序解耦（2026-08-28 商店案曾在 Input 白名单
  //  登记 .sw-npc-shop,08-29 名单收口时该类被 .sw-root 覆盖面假设顶掉=洞重开;UI.ts
  //  heldStack 门对同三类的 closest 早退本就按面板根判,此处对齐同名单同源）。
  // .sw-summon-panel = F6 召唤面板根节点（SW-BJ32 2026-09-08）：裸 div 曾不在本表
  // ⇒ 面板点击漏成世界挥击/挖掘 + inpOverDomUi 盲区（见 DebugSummonPanel.show 注）
  // .sw-eqdock = 右下角无框装备/杂项坞(2026-09-02):无 .sw-panel 底框,不登记会把
  // 坞上标签/缝隙点击漏成世界挥击(槽/钮本身已被 .sw-slot/.sw-btn 覆盖)
  // .sw-vinv = 原版布局全屏层(2026-09-07 刀 2):pointer-events:none 根+绝对定位子元素,
  // 不登记则列间缝隙点击穿透成世界挥剑(eqdock 同族事故)

/** event.target 是否落在 DOM UI 上(命中=点击归 UI,不透传为世界输入)。
 *  ★SW-FX10 债⑪：`data-sw-world-passthrough="1"` 子树豁免——热键锁开启且关包时,
 *  快捷栏格在原版不是 mouseInterface（Main.cs:44353 `!player.hbLocked` hover 门整体
 *  不进）,点击须透传为世界输入（对着快捷栏区域挖矿/放置正是本功能的用途）。
 *  属性面由 UI.paintHotbarLockState 按态挂摘;closest 形式覆盖格内子元素（槽号/幽灵图）。
 *  守卫 = `e?.dataset` 存在才走豁免支:真实 Element 恒有 dataset;测试桩
 *  （closest 恒回真值的合成对象,如 rightclick-subframe/bj32 夹具）无 dataset,
 *  保持旧判定路径——豁免支不得改变「closest 桩语义」既有契约。 */
export function isDomUiTarget(t: EventTarget | null | undefined): boolean {
  const e = t as HTMLElement | null | undefined;
  if (e?.dataset && e.closest?.('[data-sw-world-passthrough="1"]')) return false;
  return !!e && e.closest?.(DOM_UI_TARGET_SELECTOR) != null;
}
