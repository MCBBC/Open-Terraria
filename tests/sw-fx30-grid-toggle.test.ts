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
    // 帧算式单源接线（modernVisible≡false=窗族分期缺席）
    expect(uiSrc).toMatch(/craftToggleFrame\(false, this\.vinvPipsUseGrid, this\.vinvGridToggleHover\)/);
    expect(uiSrc).toMatch(/UI_Craft_Toggle_\$\{f\}\.png/);
  });
  it('左键 classic 支 = PipsUseGrid 翻转 + recStart 归零；右键 = 模式循环持久化', () => {
    expect(uiSrc).toMatch(/if \(options\.data\.craftingGridControl === 'classic'\) \{\s*\n\s*this\.vinvPipsUseGrid = !this\.vinvPipsUseGrid;/);
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
    // 网格态吞箱条面（ChestUI.cs:81）
    expect(uiSrc).toMatch(/if \(!this\.openChest \|\| this\.vinvPipsUseGrid\) return null;/);
    expect(uiSrc).toMatch(/this\.openChest && !this\.vinvPipsUseGrid \? \{ x, y \} : null/);
    // 窗口级滚轮（容器 pointer-events:none=空档不拦世界,原版空档不置 mouseInterface 同相;
    // 句柄存储式挂/摘 = 布局拆解退订对称）
    expect(uiSrc).toMatch(/this\.vinvGridWheelHandler = \(e\) => this\.vinvGridWheelTick\(e\);/);
    expect(uiSrc).toMatch(/window\.addEventListener\('wheel', this\.vinvGridWheelHandler, \{ passive: true \}\)/);
    expect(uiSrc).toMatch(/window\.removeEventListener\('wheel', this\.vinvGridWheelHandler\)/);
    // 网格矩形命中（Main.cs:17602-17608）+ flag 支列表滚恒走（:17633-17640，★SW-RB13b 逐字重写）
    expect(uiSrc).toMatch(/lx >= geo\.left && ly >= geo\.top\s*\n\s*&& lx < geo\.left \+ geo\.w && ly < geo\.top \+ geo\.h\)/);
    expect(uiSrc).toMatch(/this\.vinvCraftWheel\(e, steps\);\s*\/\/ :17633-17640 flag 支 ScrollCraftingList/);
    // playerInventory 调用域门（:17547——关包态窗口级监听不得滚列表）
    expect(uiSrc).toMatch(/if \(this\.invPanel\.style\.display !== 'block'\) return;\s*\/\/ playerInventory 门/);
    // ★SW-RB13b:格面不绑 wheel(stopPropagation 会吞窗口级分页——滚轮只在 3px 空档生效的倒挂)
    expect(uiSrc).not.toMatch(/cell\.addEventListener\('wheel'/);
    // 下滚音只走下滚支（ScrollCraftingGrid :584 逐字）
    expect(uiSrc).toMatch(/craftGridRecStartAfterDown\(this\.vinvCraftRecStart, geo\.cols, avail\);[^]*?menuTick/);
  });
  it('网格每拍钳制 + 列表刷新挂网格重排', () => {
    expect(uiSrc).toMatch(/this\.vinvCraftRecStart = clampCraftGridRecStart\(this\.vinvCraftRecStart, availLen, geo\.cols, geo\.rows\);/);
    expect(uiSrc).toMatch(/this\.vinvUpdateCraftList\(\);\s*\n\s*this\.vinvUpdateCraftGrid\(\);/);
    // 格点选 = focus + PipsUseGrid=false + recStart 归零（CraftingUI.cs:520-527）
    expect(uiSrc).toMatch(/this\.vinvCraftFocusV = i;\s*\n\s*this\.vinvPipsUseGrid = false;\s*\n\s*this\.vinvCraftRecStart = 0;/);
  });
  it('刀⑦ 过滤域：失效拍 + 列表头文字 + 可用行过滤', () => {
    expect(uiSrc).toMatch(/private vinvTickCraftFilter\(\): void \{/);
    expect(uiSrc).toMatch(/avail = avail\.filter\(\(\{ r \}\) => recipeFilterAccepts\(r, f\)\);/);
    expect(uiSrc).toMatch(/Lang\.text\('CombineFormat\.Crafting', name\)/);   // NewCraftingUI.cs:101-104
    expect(uiSrc).toMatch(/this\.vinvCraftTitleEl\.textContent = Lang\.inter\(25\);/);   // :167 复位
    expect(uiSrc).toMatch(/openCraftingStationFilter\(f: CraftingTileFilter\): void \{/);
    // OpenCloseFilter 开支：滤器置位 + 开包 + 网格态（CraftingUI.cs:154-158）
    expect(uiSrc).toMatch(/this\.vinvCraftFilter = f;[^\n]*\n\s*this\.openInventory\(true\);[^\n]*\n\s*this\.vinvPipsUseGrid = true;/);
    // 关支：网格已开 → 清过滤（:148-153）
    expect(uiSrc).toMatch(/if \(invOpen && this\.vinvPipsUseGrid\) \{\s*\n\s*this\.vinvCraftFilter = null;/);
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
  it('Options：缺省 classic（原版 Modern Player.cs:363 偏差备案）+ 坏值守卫', () => {
    expect(optSrc).toMatch(/craftingGridControl: 'classic',/);
    expect(optSrc).toMatch(/if \(this\.data\.craftingGridControl !== 'classic' && this\.data\.craftingGridControl !== 'modern'\) \{\s*\n\s*this\.data\.craftingGridControl = 'classic';/);
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
    // 切换钮 modern 支（CraftingUI.cs:310-315 副效应 PipsUseGrid=false——窗族缺席但可关网格）
    expect(uiSrc).toMatch(/this\.vinvPipsUseGrid = false;\s*\n\s*this\.vinvCraftRecStart = 0;[^\n]*\n\s*this\.vinvSyncGridToggle\(\);\s*\n\s*this\.vinvUpdateCraftGrid\(\);\s*\n\s*this\.vinvLayoutSig = '';\s*\n\s*this\.layoutVanilla\(\);\s*\n\s*\}\s*\n\s*\/\/ modern 支/);
    // 站点过滤开支（OpenCloseFilter :157 置位后 relayout）
    expect(uiSrc).toMatch(/this\.vinvRefreshCraft\(\);\s*\n\s*\/\/ ★SW-RB13b:PipsUseGrid=true(?:[^\n]*\n){2}\s*this\.vinvLayoutSig = '';\s*\n\s*this\.layoutVanilla\(\);\s*\n\s*\} else \{/);
  });
  it('layoutVanilla 签名含 PipsUseGrid 位（否则早退跳过 pos 循环=吞箱条门死码）+ cosUiVisible 谓词', () => {
    expect(uiSrc).toMatch(/const cosUiVisible = chestOpen && !this\.vinvPipsUseGrid;/);
    expect(uiSrc).toMatch(/\$\{this\.vinvPipsUseGrid \? 1 : 0\}/);
    // ChestOrShopUIVisible 消费面：垃圾桶/图鉴/表情吃 cosUiVisible；QuickStack/Sort 保裸门
    expect(uiSrc).toMatch(/trashXY\(\!\!this\.vinvLayoutCtx\?\.cosUiVisible\)/);
    expect(uiSrc).toMatch(/bestiaryXY\(\!\!this\.vinvLayoutCtx\?\.cosUiVisible\)/);
    expect(uiSrc).toMatch(/emoteXY\(\!\!this\.vinvLayoutCtx\?\.cosUiVisible\)/);
    expect(uiSrc).toMatch(/trashXY\(cosUiVisible\)\.scale/);
    expect(uiSrc).toMatch(/quickStackXY\(\!\!this\.vinvLayoutCtx\?\.chestOpen\)/);   // :42548 chest==-1 裸门
    expect(uiSrc).toMatch(/sortXY\(\!\!this\.vinvLayoutCtx\?\.chestOpen\)/);   // :42586 同
  });
  it('列表滚轮 steps=档数（ScrollCraftingList mouseWheel :390-397 focusRecipe += mouseWheel）', () => {
    expect(uiSrc).toMatch(/private vinvCraftWheel\(e: WheelEvent, steps = 1\): void \{/);
    expect(uiSrc).toMatch(/this\.vinvCraftFocusV \+ dir \* Math\.max\(1, steps\)/);
  });
  it('过滤失效拍逐帧化（DrawGridToggle 头 :268-272 每帧执行；事件驱动刷新下走远站不清滤）', () => {
    expect(uiSrc).toMatch(/if \(this\.vinvCraftFilter && this\._builtLayout === 'vanilla'\) \{[^]*?vinvFilterRemain\(\)\) \{\s*\n\s*this\.vinvCraftFilter = null;\s*\n\s*this\.vinvRefreshCraft\(\);/);
  });
  it('滤器消费门 = RecipeFilterHack getter（CraftingUI.cs:121-127 control≠Classic → null）', () => {
    expect(uiSrc).toMatch(/const filterActive = this\.vinvCraftFilter !== null && options\.data\.craftingGridControl === 'classic';/);
  });
  it('网格容器/页钮 pos 闭包与 vinvUpdateCraftGrid 双写者一致化（防 relayout 冲掉几何与 recStart 门）', () => {
    // 容器 pos=网格原点（曾 (0,0):pos 循环把 (310,340) 冲回原点=格全体左上漂移）
    expect(uiSrc).toMatch(/pos: \(\) => this\.vinvPipsUseGrid \? \{ x: CRAFT_GRID_LEFT, y: CRAFT_GRID_TOP \} : null \}\)/);
    // 页钮可见门与 vinvUpdateCraftGrid 同谓词（:470/:501——pos 循环不得复现被门隐藏的钮）
    expect(uiSrc).toMatch(/if \(dir === 'up' \? this\.vinvCraftRecStart <= 0\s*\n\s*: this\.vinvCraftRecStart >= avail - geo\.cols \* geo\.rows\) return null;/);
  });
  it('FX28 箱条 cosmetic 清偿：名无命中盒/悬停金 OurFavoriteColor/钮竖直居中锚', () => {
    const chestBlock = uiSrc.slice(uiSrc.indexOf('private vinvBuildChest'), uiSrc.indexOf('private vinvUpdateChestName'));
    expect(chestBlock).toContain("nameEl.style.cssText += 'font-size:13px;';");   // 不再 pointer-events:auto（DrawName 无命中盒）
    expect(chestBlock).toContain("b.style.color = 'rgb(255,231,69)';");   // Main.cs:886 OurFavoriteColor
    expect(chestBlock).not.toContain("'#c8f0c8'");
    expect(chestBlock).toContain('transform:translateY(-50%);');   // origin=vector/2 竖直居中（:234）
    expect(chestBlock).toContain('padding:5.5px 0');   // 24px 命中带（:223 Y-12..Y+12）
  });
});
