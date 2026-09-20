// SW-FX30 补债批（2026-09-11）UI 移债刀②+⑦：经典网格视图族 + 合成筛选（classic 域）。
// 正本：1457 反编译（Terarria1457/）——
//   刀② DrawGridToggle（CraftingUI.cs:267-330，Main.cs:42437-42439 @(94,450+adjY)）
//        + PipsUseGrid 态 + DrawRecipesGrid 经典网格（CraftingUI.cs:446-571）。
//   刀⑦ 站点 focus 钩 classic 支（Player.cs:33541-33547 尾臂 → :33555-33561 →
//        CraftingUI.OpenCloseFilter :146-159）+ 过滤判据（NewCraftingUI.cs:159-187）。
//   modern 面（NewCraftingUI 窗 + 11 类筛选条 :286-301）= 分期（见批报告分期表）。
// 变异证红纪律：纯函数矩阵即判别器（帧算式/几何/钳制/接受集任一漂移即红）+ 接线
//   锚定正则（UI.ts/Game.ts/mainFlow.ts/Options.ts 消费点漂移即红）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  craftGridGeometry, craftGridCellXY, craftGridPageBtnXY,
  clampCraftGridRecStart, craftGridRecStartAfterUp, craftGridRecStartAfterDown,
  craftToggleFrame, cycleCraftingGridControl, craftingWindowTextTipKey,
  craftSelectedBarRows, CRAFT_BAR_SOLID, CRAFT_GRID_SLOT_SCALE,
  craftingFilterForTile, recipeFilterAccepts, filterRemainOpen,
  stationAcceptTypes, doesNotNeedTileOrLiquid, DOES_NOT_OPEN_CRAFTING_MENU,
  CRAFT_GRID_LEFT, CRAFT_GRID_TOP, CRAFT_GRID_CELL,
} from '../src/ui/craftingGrid';
import { tileUsedInRecipes, COUNTS_AS_WATER_FOR_CRAFTING } from '../src/core/SmartInteractTiles';
import { VANILLA_RECIPES, type VanillaRecipeLike } from '../src/data/vanillaRecipes';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const uiSrc = read('src/ui/UI.ts');
const gameSrc = read('src/core/Game.ts');
const flowSrc = read('src/mainFlow.ts');
const optSrc = read('src/core/Options.ts');

const rec = (p: Partial<VanillaRecipeLike>): VanillaRecipeLike =>
  ({ create: 0, createStack: 1, tile: -1, items: [], groups: [], ...p } as VanillaRecipeLike);

// ============================================================
// 刀② 切换钮帧算式（CraftingUI.cs:281-293：num=2 → modern 可见 4 →
//   Recipes 页∧PipsUseGrid 0（后到=覆盖）→ +hover）
// ============================================================
describe('SW-FX30 帧算式 craftToggleFrame（CraftingUI.cs:281-293）', () => {
  it('list 态 2/3、grid 态 0/1、modern 窗态 4/5，grid 覆盖 modern 支', () => {
    expect(craftToggleFrame(false, false, false)).toBe(2);
    expect(craftToggleFrame(false, false, true)).toBe(3);
    expect(craftToggleFrame(false, true, false)).toBe(0);
    expect(craftToggleFrame(false, true, true)).toBe(1);
    expect(craftToggleFrame(true, false, false)).toBe(4);
    expect(craftToggleFrame(true, false, true)).toBe(5);
    // 覆盖序（:287 grid 支晚于 :283 modern 支）——网格态优先于窗态
    expect(craftToggleFrame(true, true, false)).toBe(0);
    expect(craftToggleFrame(true, true, true)).toBe(1);
  });
  it('六帧贴图在仓（public/sprites/vanilla-ui/UI_Craft_Toggle_0-5）', () => {
    for (let i = 0; i < 6; i++) {
      expect(read(`public/sprites/vanilla-ui/UI_Craft_Toggle_${i}.png`).length).toBeGreaterThan(100);
    }
  });
});

// ============================================================
// 刀② 网格几何（DrawRecipesGrid CraftingUI.cs:447-455）
// ============================================================
describe('SW-FX30 网格几何（CraftingUI.cs:447-455）', () => {
  it('cols=(sw-310-280)/42, rows=(sh-340-20)/42 整型截断', () => {
    expect(craftGridGeometry(1920, 1080)).toMatchObject({ cols: 31, rows: 17, left: 310, top: 340 });
    expect(craftGridGeometry(1280, 720)).toMatchObject({ cols: 16, rows: 8 });
    expect(craftGridGeometry(800, 600)).toMatchObject({ cols: 5, rows: 5 });
    // 负溢出截断方向 = C# (int) 朝零截断
    expect(craftGridGeometry(400, 300).cols).toBe(-4);
  });
  it('页钮 (290,342)/(290,362)（num10=310-20, num11=340+2 [+20]）', () => {
    expect(craftGridPageBtnXY('up')).toEqual({ x: 290, y: 342 });
    expect(craftGridPageBtnXY('down')).toEqual({ x: 290, y: 362 });
  });
  it('格坐标步距 42、满列换行（:544-566 num8/num9）', () => {
    expect(craftGridCellXY(0, 5)).toEqual({ x: 0, y: 0 });
    expect(craftGridCellXY(4, 5)).toEqual({ x: 168, y: 0 });
    expect(craftGridCellXY(5, 5)).toEqual({ x: 0, y: 42 });
    expect(craftGridCellXY(6, 5)).toEqual({ x: 42, y: 42 });
    expect(CRAFT_GRID_CELL).toBe(42);
    expect(CRAFT_GRID_SLOT_SCALE).toBe(0.75);      // 槽 52×0.75=39 视觉
  });
});

// ============================================================
// 刀② recStart 钳制三式（:461-467 绘制钳 / :476-481 上页 / :508-514 下页）
// ============================================================
describe('SW-FX30 recStart 钳制（CraftingUI.cs:461-514）', () => {
  it('绘制钳：recStart > avail-页容量 → 收到 avail-页容量，负回收 0', () => {
    expect(clampCraftGridRecStart(0, 10, 5, 5)).toBe(0);      // 10-25<0 → 0
    expect(clampCraftGridRecStart(90, 100, 5, 5)).toBe(75);   // 100-25=75
    expect(clampCraftGridRecStart(74, 100, 5, 5)).toBe(74);   // 未超不收
  });
  it('上页：-=cols，<0 回 0（:476-481）', () => {
    expect(craftGridRecStartAfterUp(30, 5)).toBe(25);
    expect(craftGridRecStartAfterUp(3, 5)).toBe(0);
    expect(craftGridRecStartAfterUp(0, 5)).toBe(0);
  });
  it('下页：+=cols，钳 avail-cols【非 avail-页】=原版逐字（:508-514 尾页半空网格）', () => {
    expect(craftGridRecStartAfterDown(0, 5, 100)).toBe(5);
    expect(craftGridRecStartAfterDown(96, 5, 100)).toBe(95);  // avail-cols=95（avail-页=75 的"合理"钳是变异体）
    expect(craftGridRecStartAfterDown(120, 5, 100)).toBe(95);
  });
});

// ============================================================
// 刀② 右键循环 + 悬停名键（CraftingUI.cs:322-331 / :91-97）
// ============================================================
describe('SW-FX30 模式循环与悬停名键', () => {
  it('Classic↔Modern 双态循环（:322-331 switch 两臂）', () => {
    expect(cycleCraftingGridControl('classic')).toBe('modern');
    expect(cycleCraftingGridControl('modern')).toBe('classic');
  });
  it('悬停名键分派（CraftingWindowTextTipKey :91-97）', () => {
    expect(craftingWindowTextTipKey('classic')).toBe('GameUI.CraftingWindowClassicTip');
    expect(craftingWindowTextTipKey('modern')).toBe('GameUI.CraftingWindowTip');
  });
  it('金标指示条行表（Utils.cs:2901-2910：16 行 2px α=(1-k/16)·0.6 + 实心 32×4）', () => {
    const rows = craftSelectedBarRows();
    expect(rows).toHaveLength(16);
    expect(rows[0]).toEqual({ y: 0, h: 2, a: 0 });            // k=16
    expect(rows[15]!.a).toBeCloseTo(0.5625, 6);               // k=1
    expect(CRAFT_BAR_SOLID).toEqual({ y: 16, h: 4 });
  });
});

// ============================================================
// 刀⑦ 站点/水源资格与过滤（Player.cs:33567-33587 + NewCraftingUI.cs:159-187
//   + Recipe.cs:106-116 + :593-602 TileUsedInRecipes 闭包回写）
// ============================================================
describe('SW-FX30 资格谓词 craftingFilterForTile（Player.cs:33567-33587）', () => {
  it('DoesNotOpenCraftingMenuOnInteract = {215, 207}（TileID.cs:279）', () => {
    expect([...DOES_NOT_OPEN_CRAFTING_MENU].sort()).toEqual([207, 215]);
  });
  it('站点门吃【闭包折叠集】（Recipe.cs:593-602 回写）——炼金台 355/699 无直接配方仍开门', () => {
    expect(craftingFilterForTile(18)).toEqual({ kind: 'station', tile: 18 });   // 工作台
    expect(craftingFilterForTile(16)).toEqual({ kind: 'station', tile: 16 });   // 铁砧
    // 355 炼药台：countsAs→13∈配方 ⇒ 运行时 TileUsedInRecipes[355]=真（:599）
    expect(tileUsedInRecipes().has(355)).toBe(true);
    expect(craftingFilterForTile(355)).toEqual({ kind: 'station', tile: 355 });
    // 水源：CountsAsWaterForCrafting（TileID.cs:281 = 172/207）
    expect([...COUNTS_AS_WATER_FOR_CRAFTING].sort()).toEqual([172, 207]);
    expect(craftingFilterForTile(172)).toEqual({ kind: 'water', tile: 172 });
    // 排除面：215 在配方站集但被 DoesNotOpen 门截；207 同时吃两门截（水源门在后）
    expect(tileUsedInRecipes().has(215)).toBe(true);
    expect(craftingFilterForTile(215)).toBeNull();
    expect(craftingFilterForTile(207)).toBeNull();
    // 普通格（土 0 / 石 1）不开
    expect(craftingFilterForTile(0)).toBeNull();
    expect(craftingFilterForTile(1)).toBeNull();
  });
});

describe('SW-FX30 过滤判据（NewCraftingUI.cs:159-187 + Recipe.cs:106-116）', () => {
  it('DoesNotNeedTileOrLiquid = tile<0 ∧ !honey ∧ !water ∧ !lava（Recipe.cs:106-116）', () => {
    expect(doesNotNeedTileOrLiquid(rec({ tile: -1 }))).toBe(true);
    expect(doesNotNeedTileOrLiquid(rec({ tile: -1, water: true }))).toBe(false);
    expect(doesNotNeedTileOrLiquid(rec({ tile: -1, honey: true }))).toBe(false);
    expect(doesNotNeedTileOrLiquid(rec({ tile: -1, lava: true }))).toBe(false);
    expect(doesNotNeedTileOrLiquid(rec({ tile: 18 }))).toBe(false);
  });
  it('站点接受集 = filter.tile + TileCountsAs 链【沿链正向】（NewCraftingUI.cs:141-157 AcceptTileType 递归 TileCountsAs[tileType]）', () => {
    expect(stationAcceptTypes(18).has(18)).toBe(true);
    // 17 countsAs→215：右键 17 开的过滤接受 17/215 配方（:566 AddTileCountsAs(17,215) 域）
    expect(stationAcceptTypes(17).has(215)).toBe(true);
    // 两跳正向：133→77→17→215 ⇒ 过滤 133 接受 17/215 配方
    expect(stationAcceptTypes(133).has(77)).toBe(true);
    expect(stationAcceptTypes(133).has(17)).toBe(true);
    expect(stationAcceptTypes(133).has(215)).toBe(true);
    // 134→16：右键 134 接受铁砧(16)配方（:567）
    expect(stationAcceptTypes(134).has(16)).toBe(true);
    // 反向不成立：铁砧(16)的接受集不含 134（AcceptTileType 只沿 countsAs 目标链）
    expect(stationAcceptTypes(16).has(134)).toBe(false);
    // 炼药台 355→13：接受放置瓶(13)配方
    expect(stationAcceptTypes(355).has(13)).toBe(true);
    expect(stationAcceptTypes(355).has(18)).toBe(false);
  });
  it('站点过滤判据矩阵（CraftStationRecipeFilter.Accepts :159-170）', () => {
    const f18 = { kind: 'station' as const, tile: 18 };
    expect(recipeFilterAccepts(rec({ tile: 18 }), f18)).toBe(true);            // 本站配方
    expect(recipeFilterAccepts(rec({ tile: 16 }), f18)).toBe(false);           // 他站
    expect(recipeFilterAccepts(rec({ tile: -1 }), f18)).toBe(true);            // 徒手配方恒过（:169）
    expect(recipeFilterAccepts(rec({ tile: -1, water: true }), f18)).toBe(false);   // 需水无站（:167）
    // 右键 134（countsAs→16）：接受需铁砧(16)配方（接受集 {134,16}）
    expect(recipeFilterAccepts(rec({ tile: 16 }), { kind: 'station', tile: 134 })).toBe(true);
  });
  it('水源过滤判据（WaterSourceRecipeFilter.Accepts :180-187：非徒手无液配方只认 needWater）', () => {
    const fw = { kind: 'water' as const, tile: 172 };
    expect(recipeFilterAccepts(rec({ tile: -1, water: true }), fw)).toBe(true);
    expect(recipeFilterAccepts(rec({ tile: -1, honey: true }), fw)).toBe(false);   // 蜜不进水滤
    expect(recipeFilterAccepts(rec({ tile: -1, lava: true }), fw)).toBe(false);
    // 需站+需水配方：!DoesNotNeed → 走 needWater（:182-185,tile 域不参与）
    expect(recipeFilterAccepts(rec({ tile: 18, water: true }), fw)).toBe(true);
    expect(recipeFilterAccepts(rec({ tile: 18 }), fw)).toBe(false);
    expect(recipeFilterAccepts(rec({ tile: -1 }), fw)).toBe(true);                 // 徒手恒过（:186）
  });
  it('CanRemainOpen = adjTile 闭包（SetAdjTile Player.cs:35924-35940 沿 TileCountsAs 链）', () => {
    expect(filterRemainOpen({ kind: 'station', tile: 18 }, [18, 106])).toBe(true);
    // 近站 17（countsAs 215）→ adjTile[215]=真 ⇒ 过滤 215 可驻留
    expect(filterRemainOpen({ kind: 'station', tile: 215 }, [17])).toBe(true);
    expect(filterRemainOpen({ kind: 'station', tile: 18 }, [16, 106])).toBe(false);
    expect(filterRemainOpen({ kind: 'water', tile: 172 }, [172])).toBe(true);
  });
  it('全配方域端到端：工作台过滤 = tile18 ∪ 徒手无液；铁砧/水配方被截', () => {
    const f18 = { kind: 'station' as const, tile: 18 };
    const kept = VANILLA_RECIPES.filter((r) => recipeFilterAccepts(r, f18));
    expect(kept.length).toBeGreaterThan(100);
    for (const r of kept) {
      expect(r.tile === 18 || doesNotNeedTileOrLiquid(r)).toBe(true);
    }
    // 判别力：铁砧独占配方（create 1130 tile16）与瓶装水（create 126 需水）被截
    expect(kept.some((r) => r.create === 1130 && r.tile === 16)).toBe(false);
    expect(kept.some((r) => r.create === 126 && r.tile === -1 && r.water)).toBe(false);
  });
});

// ============================================================
// 接线锚定（变异证红：消费点漂移即红）
// ============================================================
describe('SW-FX30 接线锚定：UI.ts vinv 网格域', () => {
  it('切换钮 @(94,450+adjY) top-left 约定 + 帧算式接线（Main.cs:42437-42439）', () => {
    expect(uiSrc).toMatch(/private vinvBuildGridToggle\(\): void \{/);
    // 钮位：top-left = 原版钮心坐标（与就近箱钮 7328 同列约定,偏差备案见方法头注）
    expect(uiSrc).toMatch(/return \{ x: 94, y: 450 \+ this\.vinvCraftAdjY\(c\.sh\) \};/);
    // 金标指示条 = 钮心下移 17（CRAFT_BAR_TOP_OFF）
    expect(uiSrc).toMatch(/450 \+ this\.vinvCraftAdjY\(c\.sh\) \+ CRAFT_BAR_TOP_OFF/);
    // ★RB29(2026-09-15)回归2连带:条随钮走——向导态支(Main.cs:42438
    //   num67=InGuideCraftMenu?300:450;条画在钮位 CraftingUI.cs:275-278。
    //   变异证红:删向导支=条滞留 450 位与钮脱钩,向导态旧钮位悬空金条)
    expect(uiSrc).toMatch(
      /if \(this\.vinvGuideMenuOpen\) return \{ x: 94, y: 300 \+ this\.vinvCraftAdjY\(c\.sh\) \+ CRAFT_BAR_TOP_OFF \};/,
    );
    // 帧算式单源接线（★SW-FX41 2026-09-12：modernVisible=窗开态 vinvModernCraftOpen
    //   ——NewCraftingUI 窗族已落地,FX30 期「≡false=窗族分期缺席」锚随之退役）
    expect(uiSrc).toMatch(/craftToggleFrame\(this\.vinvModernCraftOpen, this\.vinvPipsUseGrid, this\.vinvGridToggleHover\)/);
    expect(uiSrc).toMatch(/UI_Craft_Toggle_\$\{f\}\.png/);
  });
  it('左键 classic 支 = PipsUseGrid 翻转 + recStart 归零；右键 = 模式循环持久化', () => {
    // ★SW-FX41(2026-09-12)：classic 臂头部插入 vinvCloseModernCraft(true)
    //   （CraftingUI.cs:299-301 NewCraftingUI.Close(quiet:true,returnToInventory:true)
    //   ——窗开态右键切回 classic 后左键可达此臂,静默收窗面接通）
    expect(uiSrc).toMatch(/if \(options\.data\.craftingGridControl === 'classic'\) \{\s*\n\s*\/\/ ★SW-FX41:classic 左键支[^\n]*\n[^\n]*\n\s*this\.vinvCloseModernCraft\(true\);\s*\n\s*this\.vinvPipsUseGrid = !this\.vinvPipsUseGrid;/);
    expect(uiSrc).toMatch(/craftingGridControl',\s*\n\s*cycleCraftingGridControl\(options\.data\.craftingGridControl\)/);
    // 悬停名键随模式（CraftingWindowTextTipKey :91-97）
    expect(uiSrc).toMatch(/Lang\.text\(craftingWindowTextTipKey\(options\.data\.craftingGridControl\)\)/);
  });
  it('PipsUseGrid 生命周期：关包（Main.cs:43916+43934）/开箱（Player.cs:33787）', () => {
    expect(uiSrc).toMatch(/closeInventory\(\) \{[^]*?this\.vinvPipsUseGrid = false;\s*\n\s*this\.vinvCraftRecStart = 0;/);
    expect(uiSrc).toMatch(/private openChestPanel\(c: ChestData\) \{\s*\n\s*this\.openChest = c;[^]*?this\.vinvPipsUseGrid = false;/);
  });
  it('网格视图接线：DrawRecipesGrid 门 + 页钮 + 滚轮矩形 + 列表同滚', () => {
    expect(uiSrc).toMatch(/private vinvBuildCraftGrid\(\): void \{/);
    // 网格态吞箱条面（ChestUI.cs:81）★SW-RB14b:三门 verbatim 补 !NewCraftingUI.Visible
    expect(uiSrc).toMatch(/if \(!this\.openChest \|\| this\.vinvPipsUseGrid \|\| this\.vinvModernCraftOpen\) return null;/);
    expect(uiSrc).toMatch(/this\.openChest && !this\.vinvPipsUseGrid && !this\.vinvModernCraftOpen \? \{ x, y \} : null/);
    // 窗口级滚轮（容器 pointer-events:none=空档不拦世界,原版空档不置 mouseInterface 同相;
    // 句柄存储式挂/摘 = 布局拆解退订对称）
    expect(uiSrc).toMatch(/this\.vinvGridWheelHandler = \(e\) => this\.vinvGridWheelTick\(e\);/);
    expect(uiSrc).toMatch(/window\.addEventListener\('wheel', this\.vinvGridWheelHandler, \{ passive: true \}\)/);
    expect(uiSrc).toMatch(/window\.removeEventListener\('wheel', this\.vinvGridWheelHandler\)/);
    // 网格矩形命中（Main.cs:17602-17608）+ flag 支列表滚恒走（:17633-17640，★SW-RB13b 逐字重写）
    expect(uiSrc).toMatch(/lx >= geo\.left && ly >= geo\.top\s*\n\s*&& lx < geo\.left \+ geo\.w && ly < geo\.top \+ geo\.h\)/);
    expect(uiSrc).toMatch(/this\.vinvCraftWheel\(e\);\s*\/\/ :17633-17640 flag 支 ScrollCraftingList/);
    // playerInventory 调用域门（:17547——关包态窗口级监听不得滚列表）
    expect(uiSrc).toMatch(/if \(this\.invPanel\.style\.display !== 'block'\) return;\s*\/\/ playerInventory 门/);
    // ★SW-RB13b:格面不绑 wheel(stopPropagation 会吞窗口级分页——滚轮只在 3px 空档生效的倒挂)
    //   ★SW-FX41(2026-09-12):modern 窗格面绑 wheel 合法(窗列表滚动 UIList.cs:109-115),
    //   变量名用 slotEl 与本锚判别字「cell.」隔离——两域各自滚轮面并存
    expect(uiSrc).not.toMatch(/cell\.addEventListener\('wheel'/);
    // 下滚音只走下滚支（ScrollCraftingGrid :584 逐字）
    expect(uiSrc).toMatch(/craftGridRecStartAfterDown\(this\.vinvCraftRecStart, geo\.cols, avail\);[^]*?menuTick/);
  });
  it('网格每拍钳制 + 列表刷新挂网格重排', () => {
    expect(uiSrc).toMatch(/this\.vinvCraftRecStart = clampCraftGridRecStart\(this\.vinvCraftRecStart, availLen, geo\.cols, geo\.rows\);/);
    expect(uiSrc).toMatch(/this\.vinvUpdateCraftList\(\);\s*\n\s*this\.vinvUpdateCraftGrid\(\);/);
    // 格点选 = focus + PipsUseGrid=false + recStart 归零（CraftingUI.cs:520-527;
    //   ★SW-FX38:focus 走 vinvCraftFocusGoto 重锚播种 + :523 recFastScroll=true）
    expect(uiSrc).toMatch(/this\.vinvCraftFastScroll = true;[^\n]*\n\s*this\.vinvCraftFocusGoto\(i\);[^\n]*\n\s*this\.vinvPipsUseGrid = false;[^\n]*\n\s*this\.vinvCraftRecStart = 0;/);
  });
  it('刀⑦/★BJ85 债① 过滤域：净死对齐——ClearHacks 网入 CloseAll 尾 + 消费面退役（列表恒全量/头文字恒 inter[25]）', () => {
    // ★SW-BJ85(2026-09-15) 债①实锤：RecipeFilterHack(CraftingUI.cs:112-122)恒 null——
    //   非空写点仅 OpenCloseFilter :154，其后 :155 IngameUIWindows.CloseAll(quiet:true)
    //   尾部 ClearHacks(IngameUIWindows.cs:69 → CraftingUI.cs:143)同拍即净
    //   (1456/1457/1458 三版同构,IngameUIWindows.cs 三版字节全等)。净死 ⇒
    //   Recipe.UpdateRecipeList :252 filterHack==null 支恒走=经典列表恒【全量邻接配方】
    //   + DrawRecipesList :167-171 头文字恒 Lang.inter[25](GetWindowDescription 支不可达)。
    //   旧消费面(FX30 刀⑦列表过滤/站台名头文字/RB13b 失效拍)退役。变异证红：
    //   回植 avail.filter(recipeFilterAccepts)/vinvTickCraftFilter/filterActive 即红。
    // ClearHacks=原版 CloseAll 尾语句：vinvCloseAllQuiet 体序=对话→箱→modern 窗(quiet)→滤器净
    expect(uiSrc).toMatch(
      /private vinvCloseAllQuiet\(\): void \{\s*\n\s*this\.game\?\.closeNpcDialog\(true\);\s*\n\s*this\.closeChest\(\);\s*\n\s*this\.vinvCloseModernCraft\(true\);\s*\n\s*this\.vinvCraftFilter = null;/,
    );
    // 消费面退役：vinvRefreshCraft 体内不得出现经典滤器过滤/站台名头文字/失效拍
    //   （slice 界=vinvRefreshCraft→vinvRebuildCraftCells；modern 窗同字面在界外不受此锁）
    const refresh = uiSrc.slice(uiSrc.indexOf('private vinvRefreshCraft'), uiSrc.indexOf('private vinvRebuildCraftCells'));
    expect(refresh).not.toMatch(/recipeFilterAccepts/);
    expect(refresh).not.toMatch(/CombineFormat\.Crafting/);
    expect(refresh).not.toMatch(/vinvTickCraftFilter/);
    expect(refresh).not.toMatch(/const filterActive/);
    expect(refresh).toMatch(/this\.vinvCraftTitleEl\.textContent = Lang\.inter\(25\);/);   // :167
    // 失效拍死臂不移植（DrawGridToggle 头 :269-272 以 _lastFilter!=null 为门=原版本就净死）
    expect(uiSrc).not.toMatch(/private vinvTickCraftFilter\(\): void \{/);
    // modern 窗滤器消费面不误伤（NewCraftingUI._filter=活机制 NewCraftingUI.cs:421/:622/:642/:657）
    expect(uiSrc).toMatch(/recipeFilterAccepts\(r, this\.vinvModernCraftFilter\)/);
    expect(uiSrc).toMatch(/openCraftingStationFilter\(f: CraftingTileFilter\): void \{/);
    // OpenCloseFilter 开支：滤器置位 + CloseAll(quiet) 面 + 开包 + 网格态
    // （CraftingUI.cs:154-158;★BJ83:CloseAll(quiet) 面(:155 → IngameUIWindows.cs:17-66
    // 收 modern 窗/对话/箱)插在滤器置位与开包之间=原版序；★BJ85:ClearHacks 网
    // (IngameUIWindows.cs:69)在 vinvCloseAllQuiet 体内=置入同拍即净）
    expect(uiSrc).toMatch(/this\.vinvCraftFilter = f;[\s\S]{0,900}?this\.vinvCloseAllQuiet\(\);[\s\S]{0,300}?this\.openInventory\(true\);[\s\S]{0,200}?this\.vinvPipsUseGrid = true;/);
  });
  it('★BJ85 债② 关支：网格已开 → 清过滤 + LOUD CloseAll（CraftingUI.cs:148-153 三态开关）', () => {
    // 原版网格开态再右击站点=_lastFilter=null(:150)+IngameUIWindows.CloseAll()(:151,
    // LOUD:对话/箱/背包各音 11+modern 窗静默+ClearHacks)——旧刀「清过滤后照常全开」
    // =FX30 期偏差(RB19 揭出)已撤。变异证红：换回 vinvRefreshCraft()+return(照常全开)即红。
    expect(uiSrc).toMatch(
      /if \(invOpen && this\.vinvPipsUseGrid\) \{\s*\n\s*(?:[ \t]*\/\/[^\n]*\n)*[ \t]*this\.vinvCraftFilter = null;[^\n]*\n\s*this\.vinvCloseAllLoud\(\);[^\n]*\n\s*return;/,
    );
    // vinvCloseAllLoud=IngameUIWindows.CloseAll() LOUD 支(:10-70)：对话(:33-42 音11)/
    //   箱(:50-57 音11)/背包(:58-65 音11)/modern 窗恒静默(:63-68,走 closeInventory 内
    //   vinvCloseModernCraft(true))；背包面=closeInventory()=!playerInventory 次帧净态
    //   (Main.cs:43940 PipsUseGrid=false / :43933-43937 recStart=0)同相
    expect(uiSrc).toMatch(
      /private vinvCloseAllLoud\(\): void \{[\s\S]{0,200}?if \(game\?\.npcDialogActive\) game\.closeNpcDialog\(\);[\s\S]{0,200}?if \(this\.openChest\) \{[\s\S]{0,200}?this\.closeChest\(\);[\s\S]{0,200}?game\?\.sfx\.play\('menuClose', 1\);[\s\S]{0,300}?this\.closeInventory\(\);[^\n]*\n\s*this\.vinvRefreshCraft\(\);/,
    );
  });
});

describe('SW-FX30 接线锚定：Game.ts 尾臂 + mainFlow + Options', () => {
  it('interactAt 尾臂（Player.cs:33541-33547）：资格谓词 → rightDown 消费 + cb', () => {
    expect(gameSrc).toMatch(/import \{ craftingFilterForTile \} from '\.\.\/ui\/craftingGrid';/);
    // 臂序 = 分派链末位（pylon 臂后、方法闭括号前）
    expect(gameSrc).toMatch(/this\.usePylon\(tx, ty\);\s*\n\s*\}\s*\n\s*\/\/ ---- 合成站尾臂[^]*?const craftFilter = craftingFilterForTile\(sh\);\s*\n\s*if \(craftFilter\) \{\s*\n\s*this\.input\.rightDown = false;\s*\n\s*this\.cb\.onCraftingStationOpen\?\.\(craftFilter\);\s*\n\s*\}/);
  });
  it('mainFlow cb 接线（onCraftingStationOpen → openCraftingStationFilter）', () => {
    expect(flowSrc).toMatch(/onCraftingStationOpen: \(f\) => ui\.openCraftingStationFilter\(f\),/);
  });
  it('Options：缺省 modern（★SW-FX41 2026-09-12 缺省回切原版缺省 Modern Player.cs:363——FX30 期 classic 备案随窗族落地撤）+ 坏值守卫', () => {
    expect(optSrc).toMatch(/craftingGridControl: 'modern',/);
    expect(optSrc).toMatch(/if \(this\.data\.craftingGridControl !== 'classic' && this\.data\.craftingGridControl !== 'modern'\) \{\s*\n\s*this\.data\.craftingGridControl = 'modern';/);
  });
  it('l10n 原版键在仓（en-US/zh-Hans）', () => {
    const en = JSON.parse(read('public/l10n/en-US.json'));
    const zh = JSON.parse(read('public/l10n/zh-Hans.json'));
    expect(en.GameUI.CraftingWindowClassicTip).toBeTruthy();
    expect(en.GameUI.CraftingWindowTip).toBeTruthy();
    expect(en.CombineFormat.Crafting).toBeTruthy();
    expect(zh.GameUI.CraftingWindowClassicTip).toBeTruthy();
    expect(zh.CombineFormat.Crafting).toBeTruthy();
  });
});

// ============================================================
// SW-RB13b（2026-09-11）红蓝审计修复面：FX28×FX30 互踩四态矩阵 + 滚轮域语义。
// 变异证红：删重排调用/删 PipsUseGrid 入签/格面回绑 wheel/删 modern 副效应即红。
// ============================================================
describe('SW-RB13b 修复锚定（FX28×FX30 互踩面 + 滚轮域）', () => {
  it('PipsUseGrid 翻转三路全部触发重排（ChestUI.cs:81 吞箱条三门+变体回位 pos 闭包求值前提）', () => {
    // 切换钮 classic 支（:306 翻转后 relayout——vinvUpdateReforge 显隐 relayout 同族教训）。
    // 行界锚定逐段断言（禁 [^]*? 懒惰跨臂——classic/modern 两臂尾部同构,懒惰会跳臂假绿）
    expect(uiSrc).toMatch(/this\.vinvPipsUseGrid = !this\.vinvPipsUseGrid;[^\n]*\n\s*if \(!this\.vinvPipsUseGrid\) this\.vinvCraftRecStart = 0;[^\n]*\n\s*this\.vinvSyncGridToggle\(\);\s*\n\s*this\.vinvUpdateCraftGrid\(\);\s*\n(?:[^\n]*\n){3}\s*this\.vinvLayoutSig = '';\s*\n\s*this\.layoutVanilla\(\);\s*\n\s*\} else \{/);
    // 切换钮 modern 支（CraftingUI.cs:310-315 副效应 PipsUseGrid=false——★SW-FX41
    //   2026-09-12 窗族落地:副效应后接 vinvToggleModernCraft(false) = ToggleInInventory）
    expect(uiSrc).toMatch(/this\.vinvPipsUseGrid = false;\s*\n\s*this\.vinvCraftRecStart = 0;[^\n]*\n\s*this\.vinvSyncGridToggle\(\);\s*\n\s*this\.vinvUpdateCraftGrid\(\);\s*\n\s*this\.vinvLayoutSig = '';\s*\n\s*this\.layoutVanilla\(\);\s*\n\s*\/\/ ★SW-FX41 P2-2:modern 左键支[^\n]*\n[^\n]*\n\s*this\.vinvToggleModernCraft\(false\);/);
    // 站点过滤开支（OpenCloseFilter :157 置位后 relayout；★SW-FX41:else 臂改 modern
    //   状态机分支（else if _builtLayout==='vanilla'），classic×classic 布局退第三臂）
    expect(uiSrc).toMatch(/this\.vinvRefreshCraft\(\);\s*\n\s*\/\/ ★SW-RB13b:PipsUseGrid=true(?:[^\n]*\n){2}\s*this\.vinvLayoutSig = '';\s*\n\s*this\.layoutVanilla\(\);\s*\n\s*\} else if \(this\._builtLayout === 'vanilla'\) \{/);
  });
  it('layoutVanilla 签名含 PipsUseGrid 位（否则早退跳过 pos 循环=吞箱条门死码）+ cosUiVisible 谓词', () => {
    // ★SW-FX41:ChestOrShopUIVisible(Main.cs:3037 首支)再折 !NewCraftingUI.Visible
    expect(uiSrc).toMatch(/const cosUiVisible = chestOpen && !this\.vinvPipsUseGrid && !this\.vinvModernCraftOpen;/);
    expect(uiSrc).toMatch(/\$\{this\.vinvPipsUseGrid \? 1 : 0\}/);
    // ChestOrShopUIVisible 消费面：垃圾桶/图鉴/表情吃 cosUiVisible；QuickStack/Sort 保裸门
    expect(uiSrc).toMatch(/trashXY\(\!\!this\.vinvLayoutCtx\?\.cosUiVisible\)/);
    expect(uiSrc).toMatch(/bestiaryXY\(\!\!this\.vinvLayoutCtx\?\.cosUiVisible\)/);
    expect(uiSrc).toMatch(/emoteXY\(\!\!this\.vinvLayoutCtx\?\.cosUiVisible\)/);
    expect(uiSrc).toMatch(/trashXY\(cosUiVisible\)\.scale/);
    expect(uiSrc).toMatch(/quickStackXY\(\!\!this\.vinvLayoutCtx\?\.chestOpen\)/);   // :42548 chest==-1 裸门
    expect(uiSrc).toMatch(/sortXY\(\!\!this\.vinvLayoutCtx\?\.chestOpen\)/);   // :42586 同
  });
  it('列表滚轮 = ScrollCraftingList 整批直加（★SW-FX38 重锚:Main.cs:17593 Delta/120 截断档,CraftingUI.cs:574 focusRecipe += mouseWheel——旧 max(1,steps)+round 虚生档已废）', () => {
    expect(uiSrc).toMatch(/private vinvCraftWheel\(e: WheelEvent\): void \{/);
    expect(uiSrc).toMatch(/vanillaWheelNotches\(e\.deltaY, e\.deltaMode\)/);   // ★SW-RB14d：补传 deltaMode（Firefox 行模式归一）
    expect(uiSrc).toMatch(/this\.vinvCraftFocusV - num/);   // ★BJ189 用户明令分歧(2026-09-20):focusV−num=浏览器方向(原版同相 +num 退役=回滚哨兵,见 sw-fx38 ⑥)
    // 旧虚生档面残留 = 回归哨兵
    expect(uiSrc).not.toMatch(/Math\.max\(1, steps\)/);
    expect(uiSrc).not.toMatch(/Math\.round\(e\.deltaY \/ 120\)/);
  });
  it('★BJ85:RB13b 失效拍逐帧块随滤器消费面退役（原版 DrawGridToggle 头 :269-272 净死臂不移植）', () => {
    expect(uiSrc).not.toMatch(/站点过滤失效拍逐帧化/);
  });
  it('★BJ85:RecipeFilterHack 消费门退役（CraftingUI.cs:112-122 getter 恒 null ⇒ 无 filterActive 门；变异回植即红）', () => {
    expect(uiSrc).not.toMatch(/const filterActive = /);
  });
  it('网格容器/页钮 pos 闭包与 vinvUpdateCraftGrid 双写者一致化（防 relayout 冲掉几何与 recStart 门）', () => {
    // 容器 pos=网格原点（曾 (0,0):pos 循环把 (310,340) 冲回原点=格全体左上漂移）
    expect(uiSrc).toMatch(/pos: \(\) => this\.vinvPipsUseGrid \? \{ x: CRAFT_GRID_LEFT, y: CRAFT_GRID_TOP \} : null \}\)/);
    // 页钮可见门与 vinvUpdateCraftGrid 同谓词（:470/:501——pos 循环不得复现被门隐藏的钮）
    expect(uiSrc).toMatch(/if \(dir === 'up' \? this\.vinvCraftRecStart <= 0\s*\n\s*: this\.vinvCraftRecStart >= avail - geo\.cols \* geo\.rows\) return null;/);
  });
  it('FX28 箱条 cosmetic 清偿：名无命中盒/悬停金 OurFavoriteColor/钮竖直居中锚', () => {
    const chestBlock = uiSrc.slice(uiSrc.indexOf('private vinvBuildChest'), uiSrc.indexOf('private vinvUpdateChestName'));
    expect(chestBlock).toContain("nameEl.style.cssText += 'font-size:13px;'");   // 不再 pointer-events:auto（DrawName 无命中盒）
    expect(chestBlock).toContain("text-shadow:2px 0 0 #000,-2px 0 0 #000,0 2px 0 #000,0 -2px 0 #000;");   // ★F3/RB28 2026-09-14:2px 轴向族(与 canvas DrawBorderStringFourWay 统一)
    expect(chestBlock).toContain("b.style.color = 'rgb(255,231,69)';");   // Main.cs:886 OurFavoriteColor
    expect(chestBlock).not.toContain("'#c8f0c8'");
    expect(chestBlock).toContain('transform:translateY(-50%);');   // origin=vector/2 竖直居中（:234）
    expect(chestBlock).toContain('padding:5.5px 0');   // 24px 命中带（:223 Y-12..Y+12）
  });
});
