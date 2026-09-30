// 原版 1.4.5.7 背包布局纯几何模块(2026-09-07 刀 1)——零 DOM、可 vitest 算术验证。
//
// 权威:Terarria1457/Terraria/Main.cs DrawInventory 族(逐行锚见各函数注释);
// 与 docs/inventory-crafting-research-1456.md §四 交叉验证一致。
// 坐标系 = 原版 UI 逻辑空间:消费方(.sw-vinv 容器 transform:scale(K))内
// sw = 视口宽/K、sh = 视口高/K,右锚列(sw-92 等)随缩放层成立。
// inventoryScale 在 DrawInventory 内写死 0.85(Main.cs:41726;字段缺省 0.75 不采)。
// 取整纪律:原版逐槽 (int) 截断——本模块对每槽坐标 Math.trunc 整表达式,
// K=1 时与原版逐像素相等,不允许先除后乘的浮点漂移。

/** 槽位缩放(DrawInventory 开包恒 0.85,Main.cs:41726) */
export const INV_SCALE = 0.85;
/** 网格步距 = 56 × 0.85(Main.cs:41735-41736) */
export const CELL_STEP = 56 * INV_SCALE;          // 47.6
/** 槽底贴图边长(Inventory_Back 系实测 52×52) */
export const SLOT_TEX = 52;
/** 配饰段组距(Main.cs:42085 num35=4:第 4 行起整体再下移 4px) */
export const ACC_GAP = 4;

// ---- 背包网格 10×5(槽 0-49;热键栏=第 0 行)Main.cs:41731-41750 ----
//   x=(int)(20 + (i%10)*56*0.85)  y=(int)(20 + ⌊i/10⌋*56*0.85)
export function gridSlotXY(i: number): { x: number; y: number } {
  return {
    x: Math.trunc(20 + (i % 10) * 56 * INV_SCALE),
    y: Math.trunc(20 + Math.floor(i / 10) * 56 * INV_SCALE),
  };
}
/** 网格整块鼠标拦截区(Main.cs:41727:20..20+560*0.85 × 20..20+280*0.85) */
export function gridHitRect(): { x: number; y: number; w: number; h: number } {
  return { x: 20, y: 20, w: Math.trunc(560 * INV_SCALE), h: Math.trunc(280 * INV_SCALE) };
}

// ---- 标题/热键锁(Main.cs:41725 Lang.inter[4] @(40,0);43205 HbLock @(0,21)) ----
export const TITLE_XY = { x: 40, y: 0 } as const;
export const HOTBAR_LOCK_XY = { x: 0, y: 21 } as const;
/** 热键锁 y(Main.cs:43205-43208:pushSideToolsUp(.builderAcc 可见图标≥10=恶魔心+大师
 *  槽齐显) → (0,0),否则 (0,21)。push 判据经 ctx.visibleRows≥10 同义) */
export function hotbarLockXY(pushSideToolsUp: boolean): { x: number; y: number } {
  return pushSideToolsUp ? { x: 0, y: 0 } : HOTBAR_LOCK_XY;
}

// ---- 成就 Advisor(Main.cs:41758-41763 @(501,25) large) ----
export const ADVISOR_XY = { x: 501, y: 25 } as const;

// ---- 钱币/弹药列(Main.cs:42460-42495) ----
//   标签 Coins(496,84)/Ammo(532,84);槽 x=497/534,y=(int)(85+k*56*0.6+20),scale 0.6
export const COIN_AMMO_SCALE = 0.6;
export const COIN_LABEL_XY = { x: 496, y: 84 } as const;
export const AMMO_LABEL_XY = { x: 532, y: 84 } as const;
export function coinSlotXY(k: number): { x: number; y: number } {
  return { x: 497, y: Math.trunc(85 + k * 56 * COIN_AMMO_SCALE + 20) };
}
export function ammoSlotXY(k: number): { x: number; y: number } {
  return { x: 534, y: Math.trunc(85 + k * 56 * COIN_AMMO_SCALE + 20) };
}

// ---- 垃圾桶(Main.cs:43073-43090 (448,258) scale0.85;开箱/商店 (453,426) scale0.755) ----
export function trashXY(chestOrShopOpen: boolean): { x: number; y: number; scale: number } {
  return chestOrShopOpen ? { x: 453, y: 426, scale: 0.755 } : { x: 448, y: 258, scale: INV_SCALE };
}

// ---- 2×2 快捷钮(Main.cs:42551/42588/43147/43093) ----
//   QuickStack(498,244) 32×30 / Sort(534,244) 30×30 —— 开箱/商店不画(42548);
//   Bestiary(498,278) / Emote(534,278) —— 开箱/商店移 (503,446)/(539,446)(43103-43108)
export function quickStackXY(chestOrShopOpen: boolean): { x: number; y: number } | null {
  return chestOrShopOpen ? null : { x: 498, y: 244 };
}
export function sortXY(chestOrShopOpen: boolean): { x: number; y: number } | null {
  return chestOrShopOpen ? null : { x: 534, y: 244 };
}
export function bestiaryXY(chestOrShopOpen: boolean): { x: number; y: number } {
  return chestOrShopOpen ? { x: 503, y: 446 } : { x: 498, y: 278 };
}
export function emoteXY(chestOrShopOpen: boolean): { x: number; y: number } {
  return chestOrShopOpen ? { x: 539, y: 446 } : { x: 534, y: 278 };
}

// ---- 箱条(开箱态内嵌面板,SW-FX28 刀①;ChestUI.cs Draw 域) ----
//   原版无独立箱子面板:开箱时 ChestUI.Draw(Main.cs:42552 调)在背包网格正下方
//   叠画箱格,与钱币/弹药列/垃圾桶共存一体。invBottom=258(Main.cs:6746 定值)。
/** 箱条缩放(ChestUI.cs:83/:358 `Main.inventoryScale = 0.755f`;商店同值 Main.cs:42516) */
export const CHEST_SCALE = 0.755;
/** 箱名落位(ChestUI.cs:158 DrawName `new Vector2(504f, Main.instance.invBottom)`;
 *  商店店名/储蓄同行 Main.cs:42502-42503 同位——同构面) */
export const CHEST_NAME_XY = { x: 504, y: 258 } as const;
/** 箱条 40 槽(ChestUI.cs:324-386 DrawSlots:num=10 列×num2=4 行;
 *  ChestUI.cs:375 `num5=(int)(73f+(float)(i*56)*scale)` / ChestUI.cs:376 `num6=(int)(invBottom+(j*56)*scale)`;
 *  商店货架同格几何 Main.cs:42523-42524 context 15)。
 *  i = 行主序槽号(ChestUI.cs:372 num4=i+j*10) */
export function chestSlotXY(i: number): { x: number; y: number } {
  return {
    x: Math.trunc(73 + (i % 10) * 56 * CHEST_SCALE),
    y: Math.trunc(258 + Math.floor(i / 10) * 56 * CHEST_SCALE),
  };
}
/** 箱操作钮(ChestUI.cs:182-188 DrawButtons→ChestUI.cs:186 `DrawButton(i, 506, invBottom+40)`;
 *  ChestUI.cs:198 `Y += ID * 26`)。id = ButtonID:0 拿走全部/1 存放全部/2 快速堆叠/3 补货/4 排列
 *  (ID5/6 重命名 = 登记债 editChest IME 流,本仓未画但公式同源) */
export function chestButtonXY(id: number): { x: number; y: number } {
  return { x: 506, y: 258 + 40 + id * 26 };
}

// ---- 商店货架(SW-FX32 刀①店侧分期二;Main.cs:42500-42532 DrawInventory 商店段) ----
//   原版店开态无独立面板:货架 40 格与箱条同格同几何(context 15),店名/储蓄/快乐度
//   画在 (504,invBottom) 同一列;PipsUseGrid 态整段不画(Main.cs:42500 门)。
/** 店名/储蓄落位(Main.cs:42502-42503 @(504,invBottom)——与 CHEST_NAME_XY 同构面,
 *  同一常量对象单源,禁另立字面) */
export const SHOP_TITLE_XY = CHEST_NAME_XY;
/** 货架 40 槽(Main.cs:42522-42524:num78=(int)(73+num76·56·scale)/num79=(int)(invBottom+
 *  num77·56·scale),slot=num76+num77·10 行主序;Main.cs:42529 context 15)=箱条同格
 *  (ChestUI.cs:375-376 同式——FX28 chestSlotXY 单源,本函数为店侧可读别名) */
export function shopSlotXY(i: number): { x: number; y: number } {
  return chestSlotXY(i);
}
/** 货架整带鼠标拦截区(Main.cs:42514-42516:73..73+560·0.755 × invBottom..invBottom+
 *  224·0.755——原版只置 mouseInterface 不动作;DOM 面格间缝隙不建节点=与箱条同面) */
export function shopShelfBand(): { x: number; y: number; w: number; h: number } {
  return { x: 73, y: 258, w: Math.trunc(560 * CHEST_SCALE), h: Math.trunc(224 * CHEST_SCALE) };
}
/** 快乐度表情档位(Main.cs:42506 三元链:pa≤0.82→0/≤1→1/≤1.1→2/其余→3;
 *  NPCHappiness 贴图 4 帧 Frame(4,1,frameX) Main.cs:42507)。1458 Main.cs:42512 同式 */
export function happinessFrameX(pa: number): 0 | 1 | 2 | 3 {
  if (pa <= 0.82) return 0;
  if (pa <= 1) return 1;
  if (pa <= 1.1) return 2;
  return 3;
}
/** 快乐度图标/百分比文字偏移(Main.cs:67677-67680 赋值;1458 :67683-67686 同值:
 *  text(26,98)/icon(12,108))+invBottom 落位(Main.cs:42508/:42512)。
 *  图标 = 中心锚(rectangle2.Size()/2 origin :42509)——iconXY 为【中心】点 */
export const SHOP_HAPPINESS_TEXT_OFFSET = { x: 26, y: 98 } as const;
export const SHOP_HAPPINESS_ICON_OFFSET = { x: 12, y: 108 } as const;
export function shopHappinessTextXY(): { x: number; y: number } {
  return { x: 504 + SHOP_HAPPINESS_TEXT_OFFSET.x, y: 258 + SHOP_HAPPINESS_TEXT_OFFSET.y };
}
export function shopHappinessIconXY(): { x: number; y: number } {
  return { x: 504 + SHOP_HAPPINESS_ICON_OFFSET.x, y: 258 + SHOP_HAPPINESS_ICON_OFFSET.y };
}
/** 储蓄行(ItemSlot.cs:3712-3757 DrawSavings→DrawMoney vertical fromSavings)。
 *  语义:【只】合计 bank..bank4 币值(存钱罐/保险箱/熔炉/虚空保险库)>0 才画整行;
 *  文字 = Lang.inter[66] @(shopx,shopy+40)(ItemSlot.cs:3671);币图标 @(shopx+11+24j,
 *  shopy+75) j=0..3 = 74-ji(铂/金/银/铜)(ItemSlot.cs:3699-3701);数量文字在图标下
 *  (ItemStack 字体 0.75 缩放,基线偏移=字体度量——DOM 以 CSS 近似,偏差备案) */
export const SHOP_SAVED_LABEL_OFF = { x: 0, y: 40 } as const;
export function shopSavingsLabelXY(): { x: number; y: number } {
  return { x: 504 + SHOP_SAVED_LABEL_OFF.x, y: 258 + SHOP_SAVED_LABEL_OFF.y };
}
export function shopSavingsCoinXY(j: number): { x: number; y: number } {
  return { x: 504 + 11 + 24 * j, y: 258 + 75 };
}
/** 四银行小图标落位(ItemSlot.cs:3727-3740;CenteredRectangle 中心点,贴图 ×0.65):
 *  bank4 虚空袋 4076 (70,45)/bank3 守护者熔炉 3813 (92,45)/bank2 保险箱 346 (80,50)/
 *  bank 存钱罐 87 (70,60)——bank = 本仓 p.banks 下标(-2 存钱罐..-5 虚空对应 0..3) */
export const SHOP_SAVINGS_BANK_ICONS = [
  { vid: 4076, off: { x: 70, y: 45 }, bank: 3 },
  { vid: 3813, off: { x: 92, y: 45 }, bank: 2 },
  { vid: 346, off: { x: 80, y: 50 }, bank: 1 },
  { vid: 87, off: { x: 70, y: 60 }, bank: 0 },
] as const;
/** 银行图标缩放(ItemSlot.cs:3728 等 itemFrame.Size()*0.65) */
export const SHOP_SAVINGS_ICON_SCALE = 0.65;

// ---- 小地图占位 mH(Main.cs:46535-46561) ----
//   小地图开启(mapEnabled && mapStyle==1)→256,再钳 sh-PushUp(:46559-46561,可为负=
//   原版同款;PushUp=RecommendedEquipmentAreaPushUp Main.cs:3063-3071——恶魔心/大师槽
//   可显示时 610+PushEquipmentAreaUp·30,本仓无该设置取 610=偏差备案,否则 600)
export function mHOf(minimapOn: boolean, sh: number, pushUp = 600): number {
  return Math.min(minimapOn ? 256 : 0, sh - pushUp);
}

// ---- 装备区顶 num20(Main.cs:41854-41861) ----
//   num20 = 174 + mH;sh<950 且可见行≥10 再上移 (int)(56*0.85*(num19-9))
//   visibleRows = 装备列可见行数(num19 = 8 + 额外配饰槽数)
export function equipAreaTop(sh: number, mH: number, visibleRows: number): number {
  let top = 174 + mH;
  if (sh < 950 && visibleRows >= 10) top -= Math.trunc(CELL_STEP * (visibleRows - 9));
  return top;
}

// ---- 装备区三列 x(Main.cs:42115/42186/42219;右锚绝对式) ----
export const EQUIP_COL_X = (sw: number): number => sw - 92;   // 装备 armor[0-2]+[3-9]
export const VANITY_COL_X = (sw: number): number => sw - 139; // 时装 armor[10-12]+[13-19]
export const DYE_COL_X = (sw: number): number => sw - 186;    // 染料 dye[0-9]
/** 可见性勾选框 x(Main.cs:42118:sw-58) */
export const ACCESSORY_CHECK_X = (sw: number): number => sw - 58;

/** 列内行 y(Main.cs:42124 等:num20 + (int)(row*56*0.85),第 4 行起 +num35(4))。
 *  row = 剔除隐藏槽后重编号的可见行号(num39) */
export function equipRowY(num20: number, row: number): number {
  return num20 + Math.trunc(row * CELL_STEP) + (row >= 3 ? ACC_GAP : 0);
}
/** 勾选框 y(Main.cs:42124:num20-2+行距,第 4 行起 +4) */
export function accessoryCheckY(num20: number, row: number): number {
  return num20 - 2 + Math.trunc(row * CELL_STEP) + (row >= 3 ? ACC_GAP : 0);
}

// ---- 配装钮(DrawLoadoutButtons Main.cs:42651-42707) ----
//   ★FX29 定谳:42667 的 4px rectangle(sw-44, num20, 4, ≈num·47.6)仅作钮定位锚,
//   原版【不渲染】——全方法无 spriteBatch.Draw(rectangle);42668 GetLoadoutColor
//   (CurrentLoadoutIndex) 返回值被弃(ItemSlot.cs:2832-2835 纯函数);Extra_259
//   114×102=9 帧 38×34 无轨美术。钮恒 3 颗 32×32 @(sw-40, num20+36i)
//   (:42676 rectangle.X+rectangle.Width=sw-40,步距 num5+num6=36)
export function loadoutBtnXY(sw: number, num20: number, i: number): { x: number; y: number } {
  return { x: sw - 40, y: num20 + 36 * i };
}
export const LOADOUT_BTN_SIZE = { w: 32, h: 32 } as const;

// ---- 防御计数器(DrawDefenseCounter Main.cs:42826) ----
//   中心 (num41-10-47-47-14, 末可见行 y + 52*0.5) = (sw-210, 末行 y+26)
export function defenseCenterXY(sw: number, num20: number, lastVisibleRow: number) {
  const y = equipRowY(num20, lastVisibleRow);
  return { x: sw - 210, y: y + 26 };
}

// ---- 装备列尾行族(Main.cs:42091-42102;★BJ416 2026-09-30 单源) ----
//   num37 = num19-1 = 末可见行号(防御盾行,:42132-42135 num39==num37 → DrawDefenseCounter);
//   设置钮挤碰侧移(_settingsButtonIsPushedToSide)时 num37 再 -1(:42094-42097);
//   num38 = num37-1 = 成就顾问行(:42098;:42127-42131 num39==num38 ∧ !CanDrawAboveCoins
//   → DrawOneAchievement @(num41-10-47-47-14-14, num42+8))。HasSpace 不过时 num38=-1=不画。
//   ★BJ416 病灶=旧刀把顾问钉在 last(=num37)行:比原版低 1-2 行,卡体(58×61 竖式)
//   正压下一行防御盾+设置钮——用户实报"成就按钮跑到右下角紧邻设置"。
export function defenseRowOf(visibleRows: number, settingsPushed: boolean): number {
  return visibleRows - 1 - (settingsPushed ? 1 : 0);
}
/** 成就顾问内联行(Main.cs:42098 num38 = num37-1;HasSpace=false 时调用方须改判 -1 不画) */
export function advisorRowOf(visibleRows: number, settingsPushed: boolean): number {
  return defenseRowOf(visibleRows, settingsPushed) - 1;
}
/** 顾问内联落位(Main.cs:42129:num41=sw-92 → x=sw-224;y=num42+8) */
export function advisorInlineXY(sw: number, num20: number, row: number): { x: number; y: number } {
  return { x: sw - 224, y: equipRowY(num20, row) + 8 };
}

// ---- 设置钮锚(RefreshSettingsButtonStatus Main.cs:46254-46285;★BJ416 单源) ----
//   缺省 (sw-110, sh-20) 文本中心;挤碰判据 posY-28 <= num3,num3 = (174+mH) +
//   (int)(47.600002f*(8+extraAcc))(:46269-46275 自算 174+mH——【不采】DrawInventory
//   num20 的 sh<950 矮屏压缩(:41858-41861),含恶魔心/大师槽时两域差 47.6/格);
//   挤碰 → posX-=140 / posY=num3-47+30,并置 _settingsButtonIsPushedToSide
//   (:46278-46282)。死亡 posX+=40(:46261-46265)不建:本仓死亡强收包
//   (DrawInterface_26 playerInventory=false 等价),设置钮不画=同语义面。
export function settingsAnchorOf(sw: number, sh: number, mH: number, visibleRows: number): { x: number; y: number; pushed: boolean } {
  const num3 = 174 + mH + Math.trunc(CELL_STEP * visibleRows);
  if (sh - 20 - 28 <= num3) return { x: sw - 110 - 140, y: num3 - 17, pushed: true };
  return { x: sw - 110, y: sh - 20, pushed: false };
}

/** HasSpaceForControllerAchievementAdvisor(Main.cs:3019-3033)1:1——无可显卡
 *  (HasAvailableCardToDisplay,AchievementAdvisor.cs:185-197)或(挤碰侧移 ∧ 无
 *  恶魔心/大师槽 ∧ INFOACCCOUNT≥9)→ 内联顾问不画(:42099-42102 num38=-1)。
 *  extraAccRows = GetAmountOfExtraAccessorySlotsToShow(Player.cs:4279-4291);
 *  infoAccCount = GetDrawInfoAccCount(Main.cs:47505-47553) 开包全计臂 */
export function hasSpaceForInlineAdvisor(hasCard: boolean, extraAccRows: number, infoAccCount: number, settingsPushed: boolean): boolean {
  if (!hasCard) return false;
  return !(settingsPushed && extraAccRows === 0 && infoAccCount >= 9);
}

// ---- 页签(DrawPageIcons Main.cs:43511-43593;y=num20-32) ----
//   杂项 x=sw-80(DisplaySlots_2/3 28×26)/住房 x=sw-128(_4/5 22×24)/相机 x=sw-176(_8/10 32×32)
export const TAB_Y = (num20: number): number => num20 - 32;
export const TAB_MISC_X = (sw: number): number => sw - 80;
export const TAB_HOUSING_X = (sw: number): number => sw - 128;
export const TAB_CAMERA_X = (sw: number): number => sw - 176;
export const TAB_MISC_SIZE = { w: 28, h: 26 } as const;
export const TAB_HOUSING_SIZE = { w: 22, h: 24 } as const;
export const TAB_CAMERA_SIZE = { w: 32, h: 32 } as const;

// ---- 杂项页(EquipPage==2 Main.cs:41886-41932) ----
//   两列 x=sw-92(miscEquips)/sw-139(miscDyes);行 y=num20+m*47(★整型 47 非 47.6)
export const MISC_COL_EQUIP_X = (sw: number): number => sw - 92;
export const MISC_COL_DYE_X = (sw: number): number => sw - 139;
export const MISC_ROW_STEP = 47;
export function miscRowY(num20: number, m: number): number {
  return num20 + m * MISC_ROW_STEP;
}
/** 杂项开关勾选框(Main.cs:41934-41935 @(槽左+34, 顶-2)) */
export function miscCheckXY(slotXY: { x: number; y: number }): { x: number; y: number } {
  return { x: slotXY.x + 34, y: slotXY.y - 2 };
}

// ---- 杂项页 buff 列(SW-FX10 债④清偿;Main.cs:42008-42046 EquipPage==2 尾段) ----
//   首列 x = sw-84(num23=杂项列 sw-92 → +=8 :42008),y = num20+247(num24 += 247 :42008);
//   第 col 列向【左】步进 46(px = num32*-46 :42040),行向下步进 46(num31=46 :42026)
export const MISC_BUFF_X = (sw: number): number => sw - 84;
export const MISC_BUFF_Y_OFF = 247;
export const MISC_BUFF_STEP = 46;
/** 每列行数(Main.cs:42014-42024:num29=3 起底,sh>630/680/730 + 260×(mapStyle==1) 各 +1;
 *  260 = num30,小地图(mapStyle 1)开时装备区被 mH=256 上推 → 阈值同步抬) */
export function miscBuffRowsPerCol(sh: number, minimapStyle1: boolean): number {
  const t = 260 * (minimapStyle1 ? 1 : 0);
  let rows = 3;
  if (sh > 630 + t) rows++;
  if (sh > 680 + t) rows++;
  if (sh > 730 + t) rows++;
  return rows;
}
/** 第 n 个 buff 的格坐标(Main.cs:42038-42040:num32=n/rows=列,num33=n%rows=行)。
 *  x 用 `0 - col*step` 形式——`-col*step` 在 col=0 时产出 -0,Object.is 语义异物 */
export function miscBuffCellXY(n: number, rowsPerCol: number): { x: number; y: number } {
  const col = Math.floor(n / rowsPerCol);
  const row = n % rowsPerCol;
  return { x: 0 - col * MISC_BUFF_STEP, y: row * MISC_BUFF_STEP };
}

// ---- 住房页(EquipPage==1 DrawNPCHousesInUI Main.cs:42709-42822) ----
//   头像槽列 x=sw-92,y=trunc(num20+n·47.6)+num2;落位前判 y>sh-80 → 换列 -48 且
//   num2 -= (y-num20) 吸收全局分数残量(:42751-42758,num 不归零——逐列归零有 1px 漂移)
export function housingSlotPositions(count: number, sw: number, num20: number, sh: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  let x = sw - 92;
  let num2 = 0;
  for (let num = 0; num < count; num++) {
    let y = num20 + Math.trunc(num * CELL_STEP) + num2;
    if (y > sh - 80) { x -= 48; num2 -= y - num20; y = num20; }   // 换列(:42755-42758)
    out.push({ x, y });
  }
  return out;
}

// ---- PvP/队伍(DrawPVPIcons Main.cs:43389-43443) ----
//   scale 0.6;剑 (sw-227, 179+mH)(页 2 x+46 :43392-43395);队伍 2×3 步 20:
//   x=num2-10(num2 先吃 +46 再 -10 → 页 2 = sw-181 :43433-43443),y=239+mH
export const PVP_SCALE = 0.6;
export function pvpSwordXY(sw: number, mH: number, miscPage: boolean): { x: number; y: number } {
  return { x: sw - 227 + (miscPage ? 46 : 0), y: 179 + mH };
}
export function pvpTeamXY(sw: number, mH: number, i: number, miscPage: boolean): { x: number; y: number } {
  return { x: sw - 227 + (miscPage ? 46 : 0) + (i % 2) * 20, y: 239 + mH + Math.floor(i / 2) * 20 };
}

// ---- 现代合成面板(NewCraftingUI.cs:302-307/UIDynamicItemCollection.cs:20-22) ----
//   面板 (20,312) 490×(sh-350);内衬顶 38;配方格 44×44 步距 44
export const CRAFT_PANEL_X = 20;
export const CRAFT_PANEL_Y = 312;
export const CRAFT_PANEL_W = 490;
export const CRAFT_PANEL_H_OFF = -350;   // h = sh - 350
export const CRAFT_PANEL_INNER_TOP = 38;
export const CRAFT_CELL = 44;
export function craftPanelRect(sh: number) {
  return { x: CRAFT_PANEL_X, y: CRAFT_PANEL_Y, w: CRAFT_PANEL_W, h: sh + CRAFT_PANEL_H_OFF };
}
export function craftCellXY(col: number, row: number): { x: number; y: number } {
  return { x: col * CRAFT_CELL, y: row * CRAFT_CELL };
}
/** 选中详情浮层(NewCraftingUI.cs:431-501)。★origin = 面板自身左上+(24,73)
 *  (:431 GetInnerDimensions = UIState 自身,SetPadding(0) :313——无内区 padding!)。
 *  成品/向导槽 52px(scale 1 :470);材料行起点 origin+(72,22-16·num)、列距
 *  34·num、槽 52×0.7·num(num=min(11/材料数,1) :477-485),拥有数=每槽+(3,32)·num
 *  (:555-558)。panelX/panelY = 面板左上(20,312) */
export interface CraftDetailLayout {
  origin: { x: number; y: number };
  resultSlot: { x: number; y: number };
  hammer: { x: number; y: number };
  materialsStart: { x: number; y: number };
  materialGap: number;
  guideSlot: { x: number; y: number };
}
export function craftDetailLayout(panelX: number, panelY: number): CraftDetailLayout {
  const origin = { x: panelX + 24, y: panelY + 73 };
  return {
    origin,
    resultSlot: { x: origin.x + 0, y: origin.y + 0 },
    hammer: { x: origin.x + 47, y: origin.y + 13 },       // scale 0.8
    materialsStart: { x: origin.x + 72, y: origin.y + 6 },   // 22-16·num,num=1
    materialGap: 34,                                       // ×num 压缩
    guideSlot: { x: origin.x + 0, y: origin.y + 58 },      // ctx7 向导槽
  };
}
/** 就近箱参与制作钮 = 网格切换钮旁 +40(NewCraftingUI.cs:486-499;旅程 +40 顺延) */
export const CRAFT_NEARBY_BTN_OFF = 40;

// ---- 容器缩放(本仓登记偏差:原版小屏直接裁切,本仓整体等比) ----
//   K = clamp(uiScale × min(1, vw/720, vh/780), 0.5, 1.15)
//   下限保证 10×5 网格(476px)+右列(~278px)在 844×390 竖屏不溢出
export function vanillaScaleFor(vw: number, vh: number, uiScale = 1): number {
  const k = uiScale * Math.min(1, vw / 720, vh / 780);
  return Math.min(1.15, Math.max(0.5, k));
}

// ---- 道具搜索浮窗几何(★SW-BJ81 2026-09-14 用户规格③;本面=FX39 停车坪自创 QoL,
//      原版无对应物——非反编译锚面,几何判据=「不与物品栏占位面重叠+在视口内」) ----
// 物品栏占位面(本模块既有单源):网格 gridSlotXY 20..496 × 20..258(gridHitRect)、
// 钱币/弹药列 coinSlotXY/ammoSlotXY x 497..586、装备三列 EQUIP_COL_X..sw-58、
// 合成面板 craftPanelRect (20,312)。旧实现=全屏模态(居中 560px+压暗底)——
// 与规格④「搜索开着物品栏必须在场可点」互斥,改右置浮窗。
/** 浮窗逻辑左缘 = 钱币/弹药列右缘(586)之外留 24 间距(规格③「往右一些」) */
export const ITEMSEARCH_X = 610;
/** 浮窗逻辑顶缘 = 与背包网格顶对齐(gridSlotXY(0).y=20) */
export const ITEMSEARCH_Y = 20;
/** 浮窗逻辑宽缺省 = 340(旧 modal 560 → 缩窄,规格③「缩小一些」) */
export const ITEMSEARCH_W = 340;
/** 浮窗逻辑宽下限(窄窗退化档)——压到下限仍放不进时按视口钳位优先 */
export const ITEMSEARCH_W_MIN = 220;
/** 右缘护栏 = 装备列左缘(sw-186)再留 22 间距:右缘不得越 sw-208 */
export const ITEMSEARCH_RIGHT_GUARD = 208;
/** 浮窗逻辑高上限(结果列表内滚,不给视口压出滚动条) */
export const ITEMSEARCH_H_MAX = 460;
/** 视口贴边余量(右/下) */
export const ITEMSEARCH_VIEWPORT_PAD = 4;
/** 浮窗矩形(物理 px;调用方直喂 style.left/top/width/max-height)。
 *  窄窗退化序:①宽钳 [W_MIN, W];②左缘钳视口内(此档允许压住钱币/弹药列,
 *  但 gridHitRect 右缘 496 仍不让——x ≥ 496 恒成立,720 逻辑宽下限保证) */
export function itemSearchPanelRect(vw: number, vh: number, uiScale = 1): { x: number; y: number; w: number; h: number } {
  const K = vanillaScaleFor(vw, vh, uiScale);
  const sw = vw / K, sh = vh / K;
  const w = Math.max(ITEMSEARCH_W_MIN, Math.min(ITEMSEARCH_W, sw - ITEMSEARCH_X - ITEMSEARCH_RIGHT_GUARD));
  const x = Math.min(ITEMSEARCH_X, sw - w - ITEMSEARCH_VIEWPORT_PAD);
  const h = Math.min(ITEMSEARCH_H_MAX, sh - ITEMSEARCH_Y - ITEMSEARCH_VIEWPORT_PAD * 2);
  return { x: x * K, y: ITEMSEARCH_Y * K, w: w * K, h: h * K };
}
