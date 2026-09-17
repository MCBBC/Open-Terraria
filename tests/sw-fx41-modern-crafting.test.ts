// SW-FX41 补债批(2026-09-12)UI 移债 modern 窗族:NewCraftingUI 窗体本体(P2-1)+
// 左键 modern 支接线+缺省回切 Modern(P2-2)+站点钩 modern 支(P2-3)+11 类筛选条(P2-4)。
// 正本:1457 反编译——
//   NewCraftingUI.cs:302-317(窗体 (20,312) 490×(sh-350))/:319-395(内衬/筛选条/网格)/
//   :409-429(UpdateCraftAreaSize/UpdateText)/:431-501(详情浮层+窗内钮锚)/:503-543
//   (HandleCraftSlot 点选-合成)/:866-970(Open/Close/Toggle/OpenCloseFilter+Matches)/
//   ItemFilters.cs(11 类判据)/EntryFilterer.cs:30-68(FitsFilter/ToggleFilter)/
//   UICreativeItemsInfiniteFilteringOptions.cs:36-135(单选条 40px 步距/tab 帧/icon)/
//   UIScrollbar.cs(UIList 滚轮)/Player.cs:363(缺省 Modern)/:33555-33561(模式分派)。
// 变异证红:几何逐值断言(漂移即红)+判据矩阵(真数据域,接受集漂移即红)+状态机四支
//   (支序漂移即红)+接线锚定正则(UI.ts/Options.ts 消费点漂移即红)。
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MCRAFT_ALL_BUTTONS, MCRAFT_FILTERS, MCRAFT_FALLBACK,
  MCRAFT_PANEL_BG, MCRAFT_PANEL_BORDER, MCRAFT_SEARCH_BG, MCRAFT_SEPARATOR_COLOR,
  MCRAFT_TAB_TEX, MCRAFT_ICON_TEX, MCRAFT_CELL_SCALE, MCRAFT_STATE_XY, MCRAFT_STATE_W,
  mcraftPanelRect, mcraftPanelInner, mcraftFilterBarRect, mcraftFilterBtnXY, mcraftTabFrame, mcraftIconBgX,
  mcraftGridGeometry, mcraftCellXY, clampViewPosition, mcraftMaterialPos,
  mcraftOwnedCountPos, mcraftOwnedCountColor, mcraftWindowToggleXY, mcraftDetailOrigin,
  mcraftTitleXY, MCRAFT_MISSING_KEY,
  MCRAFT_SCROLLBAR_TEX, MCRAFT_SCROLLBAR_HANDLE_ALPHA,
  filterItemOfVid, filterFits, filtererFits, toggleFilterRadio, searchFits, normalizeSearch,
  tileFilterMatches, openCloseFilterTransition, TOOL_ACCEPTED_IDS, TILE_WAND_ITEMS,
  shiftBlueToCyan, type FilterKind, type FilterItem,
} from '../src/ui/modernCrafting';
import { craftToggleFrame, cycleCraftingGridControl, recipeFilterAccepts, CRAFT_BAR_TOP_OFF, vanillaWheelNotches, type CraftingTileFilter } from '../src/ui/craftingGrid';
import { tileUsedInRecipes } from '../src/core/SmartInteractTiles';
import { VANILLA_RECIPES } from '../src/data/vanillaRecipes';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const uiSrc = read('src/ui/UI.ts');
const optSrc = read('src/core/Options.ts');

// ============================================================
// P2-1 窗体本体几何(NewCraftingUI.cs:302-317/319-395/409-429)
// ============================================================
describe('SW-FX41 P2-1 窗体几何(NewCraftingUI.cs:302-317)', () => {
  it('UIState (20,312) 490×(sh−350);UIPanel Top38 → (20,350) 490×(sh−388)', () => {
    expect(MCRAFT_STATE_XY).toEqual({ x: 20, y: 312 });        // :304-305 Left/Top
    expect(MCRAFT_STATE_W).toBe(490);                           // :306 Width
    expect(mcraftPanelRect(1080)).toEqual({ x: 20, y: 350, w: 490, h: 692 });   // 1080−388
    expect(mcraftPanelRect(720).h).toBe(332);                   // 720−388
    expect(mcraftPanelRect(1080).h).toBe(1080 + -350 + -38);    // Height(−350)−38(内衬 Top)
  });
  it('内衬 padding:UIPanel ctor corner12(:40-47 SetPadding)+PaddingRight8(:326)', () => {
    expect(mcraftPanelInner(mcraftPanelRect(1080))).toEqual({ x: 32, y: 362, w: 470, h: 668 });
  });
  it('标题/搜索条位(UIPanel 内 UIText −1,−2 :333-337;SearchBar top 12−4 高 24 :340-343)', () => {
    expect(mcraftTitleXY(mcraftPanelRect(1080))).toEqual({ x: 31, y: 360 });
  });
  it('11 类筛选条 (45,316) 40px 步距 11 钮(:389-393 HAlign.5/Top4 + :58 Left=40i)', () => {
    expect(mcraftFilterBarRect()).toEqual({ x: 45, y: 316, w: 440, h: 46, n: 11 });
    expect(mcraftFilterBtnXY(0)).toEqual({ x: 45, y: 316 });
    expect(mcraftFilterBtnXY(10)).toEqual({ x: 445, y: 316 });
  });
  it('tab/icon 贴图帧(2×4 帧 42×48 offset−2−2→40×46;icon 11×1 帧 30×30 offset−2→28×30)', () => {
    expect(MCRAFT_TAB_TEX).toMatchObject({ w: 84, h: 192, cols: 2, rows: 4, fw: 42, fh: 48, dw: 40, dh: 46 });
    expect(MCRAFT_ICON_TEX).toMatchObject({ w: 330, h: 30, cols: 11, fw: 30, dw: 28, dh: 30, ox: 6, oy: 8 });
    expect(mcraftIconBgX(5)).toBe(-150);                        // 帧×30
    // 帧素材在仓(Separator1 白模最小 81B → 阈值 50)
    expect(read('public/sprites/vanilla-ui/UI_Creative_Infinite_Tabs_B_2.png').length).toBeGreaterThan(50);
    expect(read('public/sprites/vanilla-ui/UI_Creative_Infinite_Icons.png').length).toBeGreaterThan(50);
    expect(read('public/sprites/vanilla-ui/UI_SearchCancel.png').length).toBeGreaterThan(50);
    expect(read('public/sprites/vanilla-ui/UI_Bestiary_Button_Search_2.png').length).toBeGreaterThan(50);
    expect(read('public/sprites/vanilla-ui/UI_Bestiary_Button_Search_Border.png').length).toBeGreaterThan(50);
    expect(read('public/sprites/vanilla-ui/UI_Scrollbar.png').length).toBeGreaterThan(50);
    expect(read('public/sprites/vanilla-ui/UI_ScrollbarInner.png').length).toBeGreaterThan(50);
    expect(read('public/sprites/vanilla-ui/UI_CharCreation_Separator1.png').length).toBeGreaterThan(50);
    expect(read('public/sprites/vanilla-ui/UI_Craft.png').length).toBeGreaterThan(50);   // 锤图标(:464)
  });
  it('网格几何 1080p:cols=10/list (32,446,450,584)/滚动条 (482,454) 高 572(:354-388+UpdateCraftAreaSize :409-417)', () => {
    const g = mcraftGridGeometry(1080, 0);
    expect(g.panel).toEqual({ x: 20, y: 350, w: 490, h: 692 });
    expect(g.inner).toEqual({ x: 32, y: 362, w: 470, h: 668 });         // padding 12/右 8
    expect(g.container).toEqual({ x: 32, y: 439, w: 470, h: 591 });     // inner.y+77(=362+77), h−77
    expect(g.list).toEqual({ x: 32, y: 446, w: 450, h: 584 });          // Width−20/Height−7
    expect(g.cols).toBe(10);                                            // floor(450/44) UpdateSize
    expect(g.separator).toEqual({ x: 36, y: 439, w: 462, h: 4 });       // Width−8 居中
    // ★FX41b(2026-09-15):VAlign=1 竖臂补正(UIElement.cs:326)→ y=container.y+15=454
    //   (旧 435=−4 漏乘 VAlign 臂,偏高 19px=RB28 登记项)
    expect(g.scrollbar).toMatchObject({ x: 482, y: 454, w: 20, h: 572, innerY: 459, innerH: 562 });  // HAlign1/Top−4/VAlign1/Height−19
    expect(g.startX).toBe(37);                                          // 中心 257−220(GetGridParameters)
    expect(g.startY).toBe(446);
  });
  it('向导态网格域:VAlign=1 底对齐 → 顶边=inner.y+130(下移 53px),格行从向导槽(44,443..495)/文案(96,458)下方起排(RB28b 2026-09-15 用户实报叠压)', () => {
    const g = mcraftGridGeometry(1080, 30, true);
    expect(g.container).toEqual({ x: 32, y: 492, w: 470, h: 538 });     // inner.y+130 / inner.h−130
    expect(g.container.y + g.container.h).toBe(362 + 668);              // 底边 = 内衬底(底对齐不变式)
    expect(g.list).toEqual({ x: 32, y: 499, w: 450, h: 531 });          // Height−7/VAlign1 → +7
    expect(g.separator).toEqual({ x: 36, y: 492, w: 462, h: 4 });
    expect(g.startY).toBe(499);                                         // 首行 y ≥ 向导槽底 495
    expect(g.startY).toBeGreaterThanOrEqual(mcraftDetailOrigin().guideSlot.y + 52);
    // normal 态几何不随向导支漂移(零回归锚)
    expect(mcraftGridGeometry(1080, 30).container).toEqual({ x: 32, y: 439, w: 470, h: 591 });
  });
  it('格步距 44/行主序;槽视觉缩放 = 44/52 = 0.84615386(UIDynamicItemCollection :20-22/:41)', () => {
    const g = mcraftGridGeometry(1080, 100);
    expect(mcraftCellXY(g, 0)).toEqual({ x: 37, y: 446 });
    expect(mcraftCellXY(g, 8)).toEqual({ x: 37 + 8 * 44, y: 446 });
    expect(mcraftCellXY(g, 9)).toEqual({ x: 37 + 9 * 44, y: 446 });   // 首行末列
    expect(mcraftCellXY(g, 10)).toEqual({ x: 37, y: 446 + 44 });      // 换行
    expect(MCRAFT_CELL_SCALE).toBe(0.84615386);   // 反编译字面(0.84615386f;≈44/52 的 f32 截断)
  });
  it('滚动钳(UIScrollbar.ViewPosition setter :33-40 Clamp 0..max−view)', () => {
    expect(clampViewPosition(-5, 100, 500)).toBe(0);
    expect(clampViewPosition(700, 100, 500)).toBe(400);
    expect(clampViewPosition(250, 100, 500)).toBe(250);
    expect(clampViewPosition(50, 100, 80)).toBe(0);                     // max<view(内容不足)=0
  });
  it('滚动条几何双态+视觉单源(★FX41b 2026-09-15:VAlign=1 竖臂 y=container.y+15;Cyan 主题 Scrollbar2;DrawBar 盖6/中4;柄 α0.85)', () => {
    // UIElement.cs:326 Y += parentH·VAlign − H·VAlign → −4+containerH−(containerH−19)
    //   = container.y+15(旧 −4 漏乘 VAlign 臂 = 偏高 19px,RB28 登记项;双态同式)
    const gn = mcraftGridGeometry(1080, 30);
    const gg = mcraftGridGeometry(1080, 30, true);
    expect(gn.scrollbar.y).toBe(gn.container.y + 15);
    expect(gg.scrollbar.y).toBe(gg.container.y + 15);
    expect(gn.scrollbar).toMatchObject({ x: 482, y: 454, w: 20, h: 572, innerY: 459, innerH: 562 });
    expect(gg.scrollbar).toMatchObject({ x: 482, y: 507, w: 20, h: 519, innerY: 512, innerH: 509 });
    expect(MCRAFT_SCROLLBAR_TEX).toMatchObject({
      track: 'sprites/vanilla-ui/UI_Scrollbar2.png',                    // Cyan 主题(:61-66;旧误用 Blue=UI_Scrollbar.png)
      handle: 'sprites/vanilla-ui/UI_ScrollbarInner.png',
      w: 20, h: 16, cap: 6, mid: 4,                                     // DrawBar :96-101 源行 0-6/6-10/10-16
    });
    expect(MCRAFT_SCROLLBAR_HANDLE_ALPHA).toBe(0.85);                   // :123 White*0.85(拖拽/悬停 1)
    expect(read('public/sprites/vanilla-ui/UI_Scrollbar2.png').length).toBeGreaterThan(50);
    // 消费面锚:UI.ts 轨/柄 border-image 三分(slice 6 0 fill)+盒=元素矩形本体、
    //   盖 ±6 绘制走内层 face(★RB29b F4 2026-09-15 命中域收口:±6 仅绘制越界,
    //   旧盒 ±6 扩张 = 点轨/拖拽/悬停域各多 12px)
    expect(uiSrc).toContain('border-image-slice:${MCRAFT_SCROLLBAR_TEX.cap} 0 fill');
    expect(uiSrc).toContain('g.scrollbar.y - panel.y');
    expect(uiSrc).toContain('height:calc(100% + ${MCRAFT_SCROLLBAR_TEX.cap * 2}px)');
    expect(uiSrc).toContain('top:${-MCRAFT_SCROLLBAR_TEX.cap}px');   // face 越界面绘制位
    expect(uiSrc).not.toContain('g.scrollbar.y - MCRAFT_SCROLLBAR_TEX.cap - panel.y');
    expect(uiSrc).not.toContain('handleH + MCRAFT_SCROLLBAR_TEX.cap * 2');
  });
  it('详情浮层 origin=(44,385)(:440 GetInnerDimensions.TopLeft+(24,73);FX30 craftDetailLayout 单源)', () => {
    const o = mcraftDetailOrigin();
    expect(o.origin).toEqual({ x: 44, y: 385 });
    expect(o.hammer).toEqual({ x: 91, y: 398 });                        // +(47,13)(:464)
    expect(o.materialsStart).toEqual({ x: 116, y: 391 });               // +(72,22−16·1)(:476)
    expect(o.guideSlot).toEqual({ x: 44, y: 443 });                     // +(0,58)(ctx7=本仓无域,备案)
  });
  it('材料行压缩(:469-485 num=min(11/材料数,1);列距 34·num、槽 0.7·num)', () => {
    // ★FX41b 遗留修(2026-09-16):返回值外露 num(:485 DrawOwnedItemCount mscale 契约)
    expect(mcraftMaterialPos({ x: 44, y: 385 }, 0, 3)).toEqual({ x: 116, y: 391, scale: 0.7, num: 1 });
    expect(mcraftMaterialPos({ x: 44, y: 385 }, 2, 3).x).toBeCloseTo(116 + 68, 6);   // 34·1·2
    const m12 = mcraftMaterialPos({ x: 44, y: 385 }, 1, 12);            // num=11/12
    expect(m12.x).toBeCloseTo(116 + 34 * (11 / 12), 6);
    expect(m12.y).toBeCloseTo(385 + (22 - 16 * (11 / 12)), 6);
    expect(m12.scale).toBeCloseTo(0.7 * (11 / 12), 8);
    expect(m12.num).toBeCloseTo(11 / 12, 8);
  });
  it('拥有数位/配色(DrawOwnedItemCount :555-561:+(3,32)·scale;足 (144,238,144)/缺 (255,140,160))', () => {
    expect(mcraftOwnedCountPos({ x: 116, y: 391, scale: 1 })).toEqual({ x: 119, y: 423 });
    expect(mcraftOwnedCountColor(true)).toBe('rgb(144,238,144)');
    expect(mcraftOwnedCountColor(false)).toBe('rgb(255,140,160)');
  });
  it('窗内钮锚(:486-499 钮心 num2=42 旅程 +40,num3=285;DrawGridToggle origin=size/2 → top-left=钮心−16/−17,FX43b)', () => {
    // 钮心 (42,285)/32×34 → rect (26,268)-(58,302);窗顶 312 − 钮底 302 = 原版间隙 10px
    expect(mcraftWindowToggleXY(false)).toEqual({ toggle: { x: 26, y: 268 }, nearby: { x: 66, y: 268 } });
    expect(mcraftWindowToggleXY(true)).toEqual({ toggle: { x: 66, y: 268 }, nearby: { x: 106, y: 268 } });
    // 条锚 = 钮心(CraftingUI.cs:275-278 Utils.DrawSelectedCraftingBarIndicator 行域 craftY..craftY+19)
    //  = 钮 top + CRAFT_BAR_TOP_OFF(17)——x = 钮 top-left(craftX−16)同列
    expect(268 + CRAFT_BAR_TOP_OFF).toBe(285);
  });
  it('面板色 = ShiftBlueToCyan((63,82,151)×0.7)×0.8(:328-331;XNA 逐通道乘截断)', () => {
    // (44,57,105) → hue−0.04/sat+0.2/lum+0.04 = (33,80,136) → ×0.8 = (26,64,108,142)
    expect(shiftBlueToCyan(44, 57, 105)).toEqual([33, 80, 136]);
    expect(MCRAFT_PANEL_BG).toMatch(/^rgba\(26,64,108,0\.55686/);       // α=178×0.8=142
    expect(MCRAFT_PANEL_BORDER).toBe('rgba(0,0,0,0.8)');                // Black 平移不变 ×0.8(:331)
    expect(MCRAFT_SEARCH_BG).toMatch(/^rgba\(27,56,111,1\)$/);          // (35,40,83) 平移(:135)
    expect(MCRAFT_SEPARATOR_COLOR).toMatch(/^rgba\(73,139,218,0\.89803/);   // (89,116,213)×0.9 平移(:365)
  });
});

// ============================================================
// P2-4 11 类筛选条(ItemFilters.cs + NewCraftingUI.cs:284-301 + UICreative…Options)
// ============================================================
describe('SW-FX41 P2-4 筛选条表(NewCraftingUI.cs:284-301 字面序 + ItemFilters.GetImage 帧)', () => {
  it('10 基类+MiscFallback 共 11 钮;icon 帧 = GetImage Frame(11,1,N)(Weapon=Frame(11)=0)', () => {
    expect(MCRAFT_FILTERS.map((f) => f.kind)).toEqual([
      'weapon', 'armor', 'vanity', 'buildingBlock', 'furniture', 'accessories',
      'miscAccessories', 'consumables', 'tools', 'materials',            // :284-296 字面序
    ]);
    expect(MCRAFT_FALLBACK.kind).toBe('miscFallback');                   // :297-299 list2 尾补
    expect(MCRAFT_ALL_BUTTONS).toHaveLength(11);                         // :42 count=11
    expect(MCRAFT_ALL_BUTTONS.map((f) => f.icon)).toEqual([0, 2, 8, 4, 7, 1, 9, 3, 6, 10, 5]);
    expect(MCRAFT_FALLBACK.l10n).toBe('CreativePowers.TabMisc');         // :427-430 同 Misc
  });
  it('l10n 官方键在仓(en-US/zh-Hans CreativePowers.Tab*)', () => {
    for (const lang of ['en-US', 'zh-Hans']) {
      const l10n = JSON.parse(read(`public/l10n/${lang}.json`));
      for (const f of MCRAFT_ALL_BUTTONS) {
        expect(l10n.CreativePowers[f.l10n.split('.')[1]]).toBeTruthy();
      }
      expect(l10n.GameUI.NotEnoughMaterials).toBeTruthy();               // MCRAFT_MISSING_KEY(:542)
      expect(MCRAFT_MISSING_KEY).toBe('GameUI.NotEnoughMaterials');
      expect(l10n.UI.PlayerNameSlot).toBeTruthy();                       // 搜索空文案(:81 缺省)
    }
  });
});

describe('SW-FX41 P2-4 筛选判据矩阵(ItemFilters.cs FitsFilter 族,真数据域)', () => {
  const fits = (kind: FilterKind, vid: number): boolean => filterFits(kind, filterItemOfVid(vid));

  it('Weapon = damage>0(:193-196;工具族 damage>0 同过=原版本相)', () => {
    expect(fits('weapon', 6)).toBe(true);          // IronShortsword damage 8
    expect(fits('weapon', 96)).toBe(true);         // Musket
    expect(fits('weapon', 1)).toBe(true);          // IronPickaxe damage 5(damage>0 门不看用途)
    expect(fits('weapon', 2)).toBe(false);         // Dirt Block
    expect(fits('weapon', 58)).toBe(false);        // Heart
  });
  it('Armor/Vanity = 盔甲槽 ∧ vanity 匹配(:216-231/:249-254 AArmor 双态)', () => {
    expect(fits('armor', 90)).toBe(true);          // IronHelmet headSlot
    expect(fits('vanity', 90)).toBe(false);
    expect(fits('armor', 239)).toBe(false);        // TopHat 社交甲(van=true)
    expect(fits('vanity', 239)).toBe(true);
    expect(fits('armor', 96)).toBe(false);         // Musket 非甲
    expect(fits('vanity', 327)).toBe(false);       // GoldenKey 非甲
  });
  it('BuildingBlock/Furniture = createWall/tileWand ∪ 非框架 createTile / 框架 createTile(:73-116)', () => {
    expect(fits('buildingBlock', 2)).toBe(true);   // Dirt Block createTile 0 非框架
    expect(fits('furniture', 2)).toBe(false);
    expect(fits('buildingBlock', 8)).toBe(false);  // Torch createTile 4 框架
    expect(fits('furniture', 8)).toBe(true);
    expect(fits('buildingBlock', 93)).toBe(true);  // Wood Wall createWall≠−1(:75)
    expect(fits('buildingBlock', 832)).toBe(true); // Living Wood Wand tileWand 9(:77-79)
    expect(fits('tools', 832)).toBe(true);         // tileWand 臂(:164-166)
    expect(fits('buildingBlock', 58)).toBe(false);
  });
  it('Accessories/MiscAccessories = !misc∧accessory / misc(:280-292+IsMiscEquipment :294-301)', () => {
    expect(fits('accessories', 84)).toBe(false);   // Grappling Hook = projHook[shoot] → misc
    expect(fits('miscAccessories', 84)).toBe(true);
    expect(fits('miscAccessories', 3855)).toBe(true);   // Gato 蛋(vanityPet)
    expect(fits('accessories', 3855)).toBe(false);
    expect(fits('miscAccessories', 2)).toBe(false);
  });
  it('Consumables = 267/1307 白名 ∪ consumable∧非放置物(:352-365)', () => {
    expect(fits('consumables', 28)).toBe(true);    // Lesser Healing Potion
    expect(fits('consumables', 8)).toBe(false);    // Torch 可放置(消耗放置)被逐(:359-363)
    expect(fits('consumables', 2)).toBe(false);    // Dirt Block createTile 逐
    expect(fits('consumables', 6)).toBe(false);
  });
  it('Tools = 四力 ∪ tileWand ∪ 硬编码集(:146-173;58 项字面集)', () => {
    expect(fits('tools', 1)).toBe(true);           // IronPickaxe pick 40
    expect(fits('tools', 7)).toBe(true);           // IronHammer
    expect(fits('tools', 10)).toBe(true);          // IronAxe
    expect(fits('tools', 207)).toBe(true);         // Lava Bucket ∈ 硬编码集(:138)
    expect(TOOL_ACCEPTED_IDS.size).toBe(58);       // :136-144 字面 58 项
    expect(TOOL_ACCEPTED_IDS.has(213)).toBe(true);
    expect(TOOL_ACCEPTED_IDS.has(6174)).toBe(true);
    expect(fits('tools', 58)).toBe(false);
  });
  it('Materials = entry.material ≡ ItemID.Sets.IsAMaterial(Item.cs:48687=配方原料闭包)', () => {
    expect(fits('materials', 22)).toBe(true);      // Iron Bar
    expect(fits('materials', 1611)).toBe(true);    // Butterfly Dust
    expect(fits('materials', 6)).toBe(false);      // Iron Shortsword 非原料
    // 铁砧在原料域但 tile 域不参与材料判定(数据面同源)
    expect(fits('materials', 327)).toBe(false);
  });
  it('MiscFallback = 十基类全不过(:417-425);全 vid 域与基类互斥(complement 性质)', () => {
    expect(fits('miscFallback', 327)).toBe(true);  // Golden Key 全类不过
    expect(fits('miscFallback', 58)).toBe(true);   // Heart(非消耗品/非工具/非放置)
    expect(fits('miscFallback', 207)).toBe(false); // Lava Bucket ∈ Tools 硬编码集
    expect(fits('miscFallback', 6)).toBe(false);
    // 数据域全扫:基础类命中 ⇔ 非命中 fallback(互斥完备;上限采样域 0..899 覆盖旧版全物)
    for (let vid = 1; vid < 900; vid++) {
      const it = filterItemOfVid(vid);
      const base = MCRAFT_FILTERS.some((f) => filterFits(f.kind, it));
      const fb = filterFits('miscFallback', it);
      expect(fb).toBe(!base);
    }
  });
  it('配方产物域端到端:全配方产物可被恰一分桶(基类∪fallback 覆盖完备)', () => {
    const vids = new Set(VANILLA_RECIPES.map((r) => r.create));
    expect(vids.size).toBeGreaterThan(800);
    for (const vid of vids) {
      const it = filterItemOfVid(vid);
      const hit = MCRAFT_ALL_BUTTONS.filter((f) => filterFits(f.kind, it));
      expect(hit.length).toBeGreaterThanOrEqual(1);   // 至少落一类(fallback 兜底)
      const baseHit = hit.filter((h) => h.kind !== 'miscFallback');
      if (baseHit.length > 0) expect(hit.some((h) => h.kind === 'miscFallback')).toBe(false);
    }
  });
  it('tileWand 六件手补表(Item.cs:11150/12149/12162/13889/30698/30711;提取器缺口)', () => {
    expect(TILE_WAND_ITEMS).toEqual({ 832: 9, 932: 154, 933: 9, 1129: 1124, 3360: 620, 3361: 620 });
  });
});

describe('SW-FX41 P2-4 filterer/搜索(EntryFilterer.cs + ItemFilters.BySearch)', () => {
  const itOf = (dmg: number, name: string): FilterItem => ({ ...filterItemOfVid(dmg > 0 ? 6 : 2), damage: dmg, tooltipLines: [name] });
  it('FitsFilter(EntryFilterer.cs:30-55):搜索 AND 门 → 激活集空=全过 → 任一过=过', () => {
    const sword = itOf(8, 'Iron Shortsword');
    expect(filtererFits(null, [], sword)).toBe(true);            // :43-45
    expect(filtererFits(null, ['weapon'], sword)).toBe(true);    // :47-53 OR
    expect(filtererFits(null, ['armor', 'weapon'], sword)).toBe(true);
    expect(filtererFits(null, ['armor'], sword)).toBe(false);
    expect(filtererFits('sword', ['weapon'], sword)).toBe(true); // 搜索与类【或】语义各自独立,搜索全局 AND(:31-35)
    expect(filtererFits('zzz', ['weapon'], sword)).toBe(false);  // 搜索过但类不过 → false
  });
  it('BySearch 检索 = tooltip 行忽略大小写子串(:28-48;行0=名)', () => {
    expect(searchFits('sword', ['Iron Shortsword', '8 damage'])).toBe(true);
    expect(searchFits('SWORD', ['iron shortsword'])).toBe(true);   // OrdinalIgnoreCase
    expect(searchFits('短剑', ['铁短剑'])).toBe(true);
    expect(searchFits('zzz', ['Iron Shortsword'])).toBe(false);
  });
  it('normalizeSearch(EntryFilterer.SetSearchFilter :85-94 IsNullOrWhiteSpace→null)', () => {
    expect(normalizeSearch('')).toBeNull();
    expect(normalizeSearch('   ')).toBeNull();
    expect(normalizeSearch(' sword ')).toBe(' sword ');
  });
  it('筛选条点击 = 单选-可反选(UICreative…Options.singleFilterButtonClick :81-101)', () => {
    expect(toggleFilterRadio([], 'weapon')).toEqual(['weapon']);          // 未激活→Clear+Toggle
    expect(toggleFilterRadio(['armor'], 'weapon')).toEqual(['weapon']);   // ★Clear 后单选(变异体:追加=[armor,weapon] 即红)
    expect(toggleFilterRadio(['weapon'], 'weapon')).toEqual([]);          // ToggleFilter remove 臂(:57-68)
    expect(toggleFilterRadio(['armor', 'weapon'], 'weapon')).toEqual(['armor']);
  });
});

// ============================================================
// P2-3 站点钩 modern 支(NewCraftingUI.cs:938-964 OpenCloseFilter + Matches)
// ============================================================
describe('SW-FX41 P2-3 OpenCloseFilter 状态机(NewCraftingUI.cs:938-964)', () => {
  const st18: CraftingTileFilter = { kind: 'station', tile: 18 };
  const st16: CraftingTileFilter = { kind: 'station', tile: 16 };
  const wt: CraftingTileFilter = { kind: 'water', tile: 172 };
  const closed = { visible: false, filter: null, openedWithoutFilter: false };
  it('四支:窗关→open;滤器空/异→setFilter;openedWithoutFilter→clearFilter;同滤器→close', () => {
    expect(openCloseFilterTransition(closed, st18)).toBe('open');                       // :940-943
    expect(openCloseFilterTransition({ ...closed, visible: true, filter: null }, st18)).toBe('setFilter');   // :944-954 _filter==null
    expect(openCloseFilterTransition({ ...closed, visible: true, filter: st16 }, st18)).toBe('setFilter');   // 异站
    expect(openCloseFilterTransition({ ...closed, visible: true, filter: st18 }, st16)).toBe('setFilter');
    expect(openCloseFilterTransition({ visible: true, filter: st18, openedWithoutFilter: true }, st18)).toBe('clearFilter');   // :955-959
    expect(openCloseFilterTransition({ visible: true, filter: st18, openedWithoutFilter: false }, st18)).toBe('close');        // :960-963
    expect(openCloseFilterTransition({ visible: true, filter: wt, openedWithoutFilter: true }, st18)).toBe('setFilter');       // 异类不 Match→setFilter(非 clear)
  });
  it('Matches 逐对(TileBasedRecipeFilter.Matches :115-131):同类同 tile;站≠水(风格不敏感=登记偏差)', () => {
    expect(tileFilterMatches(st18, st18)).toBe(true);
    expect(tileFilterMatches(st18, st16)).toBe(false);
    expect(tileFilterMatches(wt, { kind: 'water', tile: 172 })).toBe(true);
    expect(tileFilterMatches(wt, { kind: 'water', tile: 207 })).toBe(false);
    expect(tileFilterMatches(st18, wt)).toBe(false);
  });
});

// ============================================================
// P2-2 左键 modern 支接线 + 缺省回切 Modern(DrawGridToggle :308-316 + Player.cs:363)
// ============================================================
describe('SW-FX41 P2-2 切换钮 modern 支接线(CraftingUI.cs:294-331)', () => {
  it('帧算式窗态 4/5(NewCraftingUI.Visible→4 :283;grid 0 覆盖 :287)', () => {
    expect(craftToggleFrame(true, false, false)).toBe(4);
    expect(craftToggleFrame(true, false, true)).toBe(5);
    expect(craftToggleFrame(true, true, false)).toBe(0);
    expect(craftToggleFrame(true, true, true)).toBe(1);
  });
  it('模式循环双态(Classic↔Modern;右键 :322-331)——两态共存可循环回', () => {
    expect(cycleCraftingGridControl('modern')).toBe('classic');
    expect(cycleCraftingGridControl(cycleCraftingGridControl('modern'))).toBe('modern');
  });
  it('Options 缺省回切 modern(Player.cs:363 原版缺省)+坏值回 modern(守卫同相)', () => {
    expect(optSrc).toMatch(/craftingGridControl: 'modern',/);
    expect(optSrc).toMatch(/craftingGridControl !== 'modern'\) \{\s*\n\s*this\.data\.craftingGridControl = 'modern';/);
  });
  it('UI.ts 接线:左键 modern 支 = PipsUseGrid=false 副效应 + ToggleInInventory(:310-316)', () => {
    // modern 臂内先置 false 再开/关窗(副效应序 = 原版 :306→:308;注释两行后接 toggle)
    expect(uiSrc).toMatch(/this\.vinvPipsUseGrid = false;\s*\n\s*this\.vinvCraftRecStart = 0;[^\n]*\n\s*this\.vinvSyncGridToggle\(\);\s*\n\s*this\.vinvUpdateCraftGrid\(\);\s*\n\s*this\.vinvLayoutSig = '';\s*\n\s*this\.layoutVanilla\(\);\s*\n\s*\/\/ ★SW-FX41 P2-2:modern 左键支[^\n]*\n[^\n]*\n\s*this\.vinvToggleModernCraft\(false\);/);
    // classic 臂 = 先静默关窗(:299-301 NewCraftingUI.Close(quiet:true,returnToInventory:true))
    expect(uiSrc).toMatch(/this\.vinvCloseModernCraft\(true\);\s*\n\s*this\.vinvPipsUseGrid = !this\.vinvPipsUseGrid;/);
  });
  it('UI.ts 接线:站点钩 modern 支 = 先 OpenInventory 后四支状态机(Player.cs:33555-33561)', () => {
    expect(uiSrc).toMatch(/if \(this\.invPanel\.style\.display !== 'block'\) this\.openInventory\(true\);\s*\n\s*this\.vinvOpenCloseModernCraftFilter\(f\);/);
    // 状态机执行器走 openCloseFilterTransition 单源
    expect(uiSrc).toMatch(/const t = openCloseFilterTransition\(\s*\n\s*\{ visible: this\.vinvModernCraftOpen, filter: this\.vinvModernCraftFilter, openedWithoutFilter: this\.vinvModernOpenedWithoutFilter \},/);
  });
  it('UI.ts 接线:窗族生命周期(Main.cs:42418/17636/46438-46444/:3037)', () => {
    // 窗构建挂 vinvBuildCraft 尾(vinvBuildModernCraft)
    expect(uiSrc).toMatch(/this\.vinvBuildModernCraft\(\);/);
    // 经典合成面 = vinvClassicCraftVisible 门(else 分支不画;★2026-09-16 重铸态同支
    //   Main.cs:42418 else-if 头 !InReforgeMenu——重铸开启=列表/标题/材料行整支不画)
    expect(uiSrc).toMatch(/private vinvClassicCraftVisible\(\): boolean \{\s*\n\s*return !this\.vinvModernCraftOpen && !this\.vinvReforgeVisible\(\);\s*\n\s*\}/);
    // 列表滚停(Main.cs:17636-17639 flag=false)
    expect(uiSrc).toMatch(/if \(!this\.vinvModernCraftOpen\) \{\s*\n\s*this\.vinvCraftWheel\(e\);/);
    // 关包静默收窗(Main.cs:46444)
    expect(uiSrc).toMatch(/this\.vinvCloseModernCraft\(true\);/);
    // ChestOrShopUIVisible 折叠(Main.cs:3037)
    expect(uiSrc).toMatch(/const cosUiVisible = chestOpen && !this\.vinvPipsUseGrid && !this\.vinvModernCraftOpen;/);
    // 布局签名含窗开态(位序=PipsUseGrid 位后新增尾位)
    expect(uiSrc).toMatch(/\|\$\{this\.vinvGuideMenuOpen \? 1 : 0\}\|\$\{this\.vinvReforgeOpen \? 1 : 0\}`;/);   // ★刀19:向导/重铸态入签
    // 切换钮锚换位(窗开 → (42|82,285))
    expect(uiSrc).toMatch(/if \(this\.vinvModernCraftOpen\) \{\s*\n\s*return mcraftWindowToggleXY\(\!\!this\.game\?\.world\?\.isJourney\)\.toggle;\s*\n\s*\}/);
    // CanRemainOpen 失效自动关窗(NewCraftingUI.cs:655-665;remain 判定传 modern 滤器域)
    expect(uiSrc).toMatch(/if \(this\.vinvModernCraftOpen && this\.vinvModernCraftFilter !== null && this\._builtLayout === 'vanilla'\) \{\s*\n\s*if \(!this\.vinvFilterRemain\(this\.vinvModernCraftFilter\)\) this\.vinvCloseModernCraft\(false\);\s*\n\s*\}/);
    // 刷新挂 vinvRefreshCraft(UpdateContents 每拍语义)
    expect(uiSrc).toMatch(/if \(this\.vinvModernCraftOpen\) this\.vinvUpdateModernCraft\(\);/);
  });
  it('窗/格素材在仓 + 探针可达(toggle 六帧已由 FX30 锁,此处锁窗体素材)', () => {
    for (const f of ['UI_Craft_Toggle_4.png', 'UI_Craft_Toggle_5.png']) {
      expect(read(`public/sprites/vanilla-ui/${f}`).length).toBeGreaterThan(100);
    }
  });
});

// ============================================================
// ★FX41b(2026-09-15 用户实报三缺陷):详情/向导槽叠压+滚动条样式+点格滚动音序
// ============================================================
describe('SW-FX41b 详情浮层容器相对系+向导态显示语义(NewCraftingUI.cs:440-487)', () => {
  it('详情子件 = detail 容器相对系(容器由 vinvLayoutItems 定位 origin−state=(24,73);子件不得再写 win 绝对值=双重偏移压向导槽/网格首行)', () => {
    // 成品槽 = 容器原位(0,0)(DrawChildren :454 vector 本位);锤 +(47,13)(:464);
    // 材料行 = mcraftMaterialPos 零 origin 调(:469-485 相对臂)
    expect(uiSrc).toContain("slot.style.cssText = 'position:absolute; left:0; top:0;'");
    expect(uiSrc).toContain("hammer.style.cssText = 'position:absolute; left:47px; top:13px;'");
    expect(uiSrc).toContain('const mp = mcraftMaterialPos({ x: 0, y: 0 }, j, r.items.length);');
    // 旧双重偏移面(win 绝对值)不得回归
    expect(uiSrc).not.toContain('left:${o.origin.x - 20}px; top:${o.origin.y - 312}px');
  });
  it('向导态首入不画详情(:910 预选经 :619 SelectedEntry==null 清)+槽变 ResetRecipes(:596-598)+需求行不吃经典 fallback(:452-456)', () => {
    expect(uiSrc).toMatch(/this\.vinvModernSelected = this\.vinvGuideMenuOpen\s*\n\s*\? null\s*\n\s*: \(this\.vinvCraftAvailV\[this\.vinvCraftFocusV\]\?\.r \?\? null\);/);
    expect(uiSrc).toContain('if (this.vinvGuideMenuOpen && guideKey !== this.vinvModernResetForGuide) this.vinvModernResetRecipes();');
    expect(uiSrc).toContain('_resetForGuideItem');   // 反编译锚注释在档
    // SelectedEntry 解析域 = lookup 镜像(:619-620 lookup 空 → 清;ResetRecipes :575-587 本身不清选中)
    expect(uiSrc).toContain('private vinvModernLookup = new Set<VanillaRecipeLike>();');
    expect(uiSrc).toContain('if (!this.vinvModernLookup.has(this.vinvModernSelected)) this.vinvModernSelected = null;');
    expect(uiSrc).toMatch(/private vinvModernResetRecipes\(\): void \{\s*\n\s*this\.vinvModernEntries = \[\];\s*\n\s*this\.vinvModernLookup\.clear\(\);/);
    expect(uiSrc).toContain('if (!this.vinvModernLookup.has(row.r)) this.vinvModernLookup.add(row.r);');
    expect(uiSrc).toContain("const r = this.vinvModernSelected;\n      this.vinvGuideModernReqEl.textContent = r ? this.recipeEnvReqText(r, false) : '';");
  });
  it('向导态点选已选格不合成(Main.cs:42988 focusRecipe==recipeIndex && guideItem.IsAir 门;else-if(flag) 臂仅音 12)', () => {
    expect(uiSrc).toContain("if (this.guidePlaced) { this.game.sfx.play('menuTick', 1); return; }");
  });
  it('modern 窗开 = 吸附步进停摆(Main.cs:42418-42428 NewCraftingUI.Visible → else 分支 DrawRecipesList/AdjustRecipeOffsets 不画;窗关 PipsFastScroll 首拍瞬吸清账;★重铸态同支 !InReforgeMenu 步进同停)', () => {
    expect(uiSrc).toMatch(/if \(!this\.vinvModernCraftOpen && !this\.vinvReforgeVisible\(\)\) \{\s*\n(?:\s*\/\/[^\n]*\n)*\s*this\.vinvCraftGlideAcc \+= dt \/ \(1000 \/ 60\);/);
  });
});

// ============================================================
// P2-5/P2-6 备案锚(classic 构建器网格钮不接=用户约定自制面板;手柄无域)
// ============================================================
describe('SW-FX41 P2-5/P2-6 备案锚', () => {
  it('P2-5:classic 构建器(buildInventoryPanel classic)无网格钮接入——用户约定自制面板,登记债', () => {
    // classic 构建器域不引入 vinvBuildGridToggle/vinvBuildModernCraft(仅 vanilla 域)
    const idxVanilla = uiSrc.indexOf('private buildVanillaInventoryPanel(): void {');
    const srcVanilla = uiSrc.slice(idxVanilla, idxVanilla + 400000);
    expect(srcVanilla).toContain('this.vinvBuildModernCraft();');
    expect(uiSrc.slice(0, idxVanilla)).not.toContain('this.vinvBuildModernCraft();');
  });
  it('P2-6:手柄 UILinkPoint 导航无域——NewCraftingUI.cs:667-758 SetupGamepadPoints 整面备案不移植', () => {
    // 窗源码面不得出现 UILinkPoint(防误植;本仓无 gamepad UI 域)
    expect(read('src/ui/modernCrafting.ts')).not.toMatch(/UILinkPoint/);
  });
});

// ============================================================
// 守恒面:FX30 classic 域不回退(站点资格/网格门共存)
// ============================================================
describe('SW-FX41 守恒:FX30 基线共存(两态共存回归)', () => {
  it('classic 域滤器判据仍单源 craftingGrid.recipeFilterAccepts(窗内站点过滤同用)', () => {
    expect(uiSrc).toMatch(/recipeFilterAccepts\(r, this\.vinvModernCraftFilter\)/);
    const rec = { create: 1130, createStack: 1, tile: 16, items: [], groups: [] } as never;
    expect(recipeFilterAccepts(rec, { kind: 'station', tile: 16 })).toBe(true);
  });
  it('TileUsedInRecipes 闭包折叠集不被本刀扰动(站点资格谓词原相)', () => {
    expect(tileUsedInRecipes().has(18)).toBe(true);
    expect(tileUsedInRecipes().has(215)).toBe(true);
  });
  it('热文件卫生:modernCrafting.ts 独立单源,UI.ts 小粒度编辑(mtime 本批前已更新)', () => {
    // 窗模块零 DOM(import 面不含 document/window)
    const mod = read('src/ui/modernCrafting.ts');
    expect(mod).not.toMatch(/document\.|window\.|addEventListener/);
    expect(statSync(join(ROOT, 'src/ui/modernCrafting.ts')).size).toBeGreaterThan(8000);
  });
});

// ============================================================
// FX43b 滚轮手感三面同构(热栏/网格/经典列表;用户实报「modern 窗滚很远才动」)
// ============================================================
describe('SW-FX43b 滚轮三面同构:热栏(Input._wheelPxCarry)/网格(vinvModernWheelPendPx)/经典列表(vinvCraftWheelPendPx) 同一 RB14d/FX51 余数累计器语义', () => {
  // 原版语义:ScrollWheelValue 跨事件累计(PlayerInput.cs:1407)→ 帧差分 /120 量化
  //  (:901-902,Main.cs:17593)。Chrome ±100px/notch 重映射下逐事件 trunc 整类吞零。
  const model = (deltas: number[]): number[] => {   // RB14d 累计器转录(事件界量化)
    let carry = 0; const out: number[] = [];
    for (const d of deltas) {
      carry += d;
      const n = Math.trunc(-carry / 120);
      if (n !== 0) { carry += n * 120; out.push(n); } else out.push(0);
    }
    return out;
  };
  it('手感等价:Chrome 3×100px 下滚 = 300px→2 档(第 2 拍起;旧逐事件 trunc 面恒 0=迟滞根因),余数跨事件留置', () => {
    expect(model([100, 100, 100])).toEqual([0, -1, -1]);        // 300px→2 档,余 60
    expect(model([100, 100, 100, 100])).toEqual([0, -1, -1, -1]);
    expect(model([120, 120])).toEqual([-1, -1]);      // OS 原生 120/notch 一拍一档不回退
  });
  it('源锁:modern 面走「px 累计 → vanillaWheelNotches(carry) → 整档消费余数留置」(逐事件量化面退役);热栏/经典列表两基准面不回退', () => {
    const ui = read('src/ui/UI.ts');
    const fn = ui.slice(
      ui.indexOf('private vinvModernScrollBy'),
      ui.indexOf('private vinvModernGridGeometry'),
    );
    expect(fn).toContain('this.vinvModernWheelPendPx += wheelEventPx(e.deltaY, e.deltaMode);');
    expect(fn).toContain('const notches = vanillaWheelNotches(this.vinvModernWheelPendPx);');
    expect(fn).toContain('this.vinvModernWheelPendPx += notches * 120;');   // 消费整档余数留置
    expect(fn).not.toContain('vanillaWheelNotches(e.deltaY');               // 逐事件量化退役
    expect(ui).toContain('this.vinvModernWheelPendPx = 0;');                // 面板重建清零(经典面同律)
    expect(ui).toContain('this.vinvCraftWheelPendPx += wheelEventPx(e.deltaY, e.deltaMode);');   // 经典列表基准面
    const input = read('src/core/Input.ts');
    expect(input).toContain('this._wheelPxCarry -= wheelEventPx(e.deltaY, e.deltaMode);');       // 热栏基准面(FX51)
    expect(input).toContain('Math.trunc(this._wheelPxCarry / 120)');
  });
  it('符号/量纲:共享 vanillaWheelNotches(deltaMode 归一;XNA 上滚为正)', () => {
    expect(vanillaWheelNotches(-100, 0)).toBe(0);      // 子档拍零位移(累计器面留置)
    expect(vanillaWheelNotches(-120, 0)).toBe(1);
    expect(vanillaWheelNotches(120, 0)).toBe(-1);
    expect(vanillaWheelNotches(4, 1)).toBe(-1);        // 行模式 4 行×40=160>120
  });
});
