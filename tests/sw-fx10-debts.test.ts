// SW-FX10 补债批（2026-09-10）：背包重构刀 9-11 后余 12 条登记债收官波。
// 正本：docs/vanilla-inventory-refactor-20260907.md「登记债」节；金标 = 1457 反编译
// （Terarria1457/，逐条行号锚见各段）。本文件覆盖本批清偿 5 条（④⑥⑨⑩⑪）的
// ①几何金标 ②门矩阵 ③接线锚定；另含 ⑤⑧⑫ 定谳面（已清偿/非债的反向锁定）。
// 备案 4 条（①箱子/商店内嵌布局 ②网格切换钮族 ③Sort=ItemSorting ⑦合成筛选条）
// 不在本文件锚定域，见批报告与登记债文档更新节。
//
// 变异证红纪律：每段断言即判别器——几何常量/门条件/接线行任一漂移即红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mHOf, equipAreaTop, hotbarLockXY, HOTBAR_LOCK_XY,
  MISC_BUFF_X, MISC_BUFF_Y_OFF, MISC_BUFF_STEP,
  miscBuffRowsPerCol, miscBuffCellXY,
} from '../src/ui/vanillaInvLayout';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import {
  availableRecipes, VANILLA_RECIPES, vanillaItemKey,
  type VanillaRecipe,
} from '../src/data/vanillaRecipes';
import { ITEM_BY_KEY } from '../src/data/items';
import { TILE_DEFS } from '../src/data/tiles';
import { isDomUiTarget } from '../src/core/input/domTargets';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const uiSrc = read('src/ui/UI.ts');
const gameSrc = read('src/core/Game.ts');
const domSrc = read('src/core/input/domTargets.ts');
const flowSrc = read('src/mainFlow.ts');
const saveSrc = read('src/save/SaveFile.ts');
const serSrc = read('src/save/serialize.ts');

/** 原版 vid → 仓内 item id（items.ts 稳定键桥） */
function internalIdOfVid(vid: number): number {
  const key = vanillaItemKey(vid);
  const id = key ? ITEM_BY_KEY[key] : undefined;
  if (id === undefined) throw new Error(`vid ${vid} 无仓内映射`);
  return id;
}

// ============================================================
// 债⑨ mH 小地图联动（Main.cs:46537-46561 DrawInterface_16_MapOrMinimap）
//   mH=0 早退（!mapEnabled）/ 全屏图开 / mapStyle≠1；仅 (mapEnabled && !mapFullscreen
//   && mapStyle==1) → mH=256，再钳 sh-PushUp（:46559-46561，可为负=原版同款）
// ============================================================
describe('SW-FX10 债⑨ mH 小地图联动（Main.cs:46537-46561）', () => {
  it('小地图开：mH=256，超屏钳到 sh-PushUp', () => {
    expect(mHOf(true, 1000, 600)).toBe(256);          // 256+600=856 ≤1000 → 不钳
    expect(mHOf(true, 800, 600)).toBe(200);           // 856>800 → 钳 sh-PushUp
  });
  it('小地图关（mapStyle≠1/全屏图开/mapEnabled 关）：mH=0，小屏可为负', () => {
    expect(mHOf(false, 1000, 600)).toBe(0);
    expect(mHOf(false, 500, 600)).toBe(-100);         // 钳支 :46559-46561 对 mH=0 同样生效
  });
  it('equipAreaTop 消费 mH（num20=174+mH, Main.cs:41854）', () => {
    expect(equipAreaTop(1000, 256, 8)).toBe(430);
    expect(equipAreaTop(1000, 0, 8)).toBe(174);
  });
  it('接线锚定：layoutVanilla 不再恒 true，改真实小地图态+签名联动', () => {
    // 变异证红：若回退恒 true（占位态），两锚同时失守
    expect(uiSrc).toMatch(/const minimapOn = this\.game\.renderer\.mapStyle === 1 && !this\.game\.mapFullscreen\(\);/);
    expect(uiSrc).toMatch(/mHOf\(minimapOn, sh, heartShown \|\| masterShown \? 610 : 600\)/);
    // 签名必须含 minimapOn（否则 Tab 循环地图样式后 num20 不重排=页签漂 256px）
    expect(uiSrc).toMatch(/\$\{minimapOn \? 1 : 0\}\$\{this\.game\.superCartUnlocked\(\) \? 1 : 0\}/);
  });
});

// ============================================================
// 债④ 页 2 buff 列（Main.cs:42008-42046 EquipPage==2 尾段）
//   num23=sw-92+8 → sw-84；num24=num20+247；列向左/行向下步距 46（num31=46）；
//   每列行数 num29=3 起，sh>630/680/730+260×(mapStyle==1) 各 +1
// ============================================================
describe('SW-FX10 债④ 杂项页 buff 列几何（Main.cs:42008-42046）', () => {
  it('首列 x=sw-84 / y=num20+247 / 步距 46', () => {
    expect(MISC_BUFF_X(1920)).toBe(1836);
    expect(MISC_BUFF_Y_OFF).toBe(247);
    expect(MISC_BUFF_STEP).toBe(46);
  });
  it('每列行数：阈值 630/680/730（无小地图）逐档 +1（:42014-42024）', () => {
    expect(miscBuffRowsPerCol(600, false)).toBe(3);
    expect(miscBuffRowsPerCol(631, false)).toBe(4);   // >630
    expect(miscBuffRowsPerCol(681, false)).toBe(5);   // >680
    expect(miscBuffRowsPerCol(731, false)).toBe(6);   // >730
  });
  it('每列行数：小地图开阈值整体 +260（num30=260×(mapStyle==1)）', () => {
    expect(miscBuffRowsPerCol(700, true)).toBe(3);    // 700 ≤ 890
    expect(miscBuffRowsPerCol(891, true)).toBe(4);    // >630+260
    expect(miscBuffRowsPerCol(941, true)).toBe(5);
    expect(miscBuffRowsPerCol(991, true)).toBe(6);
    // 同屏高对照：无小地图 731 已 6 行，有小地图仍 3 行（mH 推高装备区所致）
    expect(miscBuffRowsPerCol(731, false)).toBe(6);
    expect(miscBuffRowsPerCol(731, true)).toBe(3);
  });
  it('格坐标：列向左（负 x）/行向下，num32=n/rows=列、num33=n%rows=行（:42038-42040）', () => {
    expect(miscBuffCellXY(0, 3)).toEqual({ x: 0, y: 0 });
    expect(miscBuffCellXY(2, 3)).toEqual({ x: 0, y: 92 });
    expect(miscBuffCellXY(3, 3)).toEqual({ x: -46, y: 0 });
    expect(miscBuffCellXY(4, 3)).toEqual({ x: -46, y: 46 });
  });
  it('接线锚定：reflow 双向+三 append 面全走 buffHost', () => {
    // 宿主选择器：开包∧vanilla∧页2 → miscBuffCol，否则 buffBar
    expect(uiSrc).toMatch(/return \(invOpen && this\.miscBuffCol && this\._builtLayout === 'vanilla' && this\.vinvPageCurrent === 2\)/);
    // 页切换回流（vinvApplyPage）与关包回流（closeInventory）两沿
    expect(uiSrc).toMatch(/this\.reflowBuffs\(\);   \/\/ ★SW-FX10 债④:页2 ↔ buffBar 块容器随页搬运/);
    expect(uiSrc).toMatch(/this\.reflowBuffs\(\);             \/\/ ★SW-FX10 债④:页2 列内 buff 块回流 HUD 栏\(关包当帧\)/);
    // tickBuffLive 不再在页2 整帧早退（列内块也吃即时计数面）
    expect(uiSrc).toMatch(/const colVisible = invOpen && this\._builtLayout === 'vanilla' && this\.vinvPageCurrent === 2 && !!this\.miscBuffCol;/);
  });
});

// ============================================================
// 债⑩ 超级矿车开关（Player.cs:2037/3955-3961 + Mount.cs:4851 + Main.cs:41959-41995
//   + .plr PL:55572 位[1] 写 /:56368 位[1] 读）
// ============================================================
describe('SW-FX10 债⑩ 超级矿车开关', () => {
  it('Player.enabledSuperCart 缺省 true（Player.cs:2037）/ hbLocked 缺省 false（:1419）', () => {
    const p = new Player(100, 100, new Inventory());
    expect(p.enabledSuperCart).toBe(true);
    expect(p.hbLocked).toBe(false);
  });
  it('消费面 = UsingSuperCart 三元（Mount.cs:4851 → Player.cs:3955-3961）', () => {
    // 变异证红：回退单臂（只查解锁/只查开关）即红
    expect(gameSrc).toMatch(/cart\.superCart = this\.superCartUnlocked\(\) && this\.player\.enabledSuperCart;/);
  });
  it('解锁态公开（UI 显隐门 Main.cs:41963 flag2=unlockedSuperCart）', () => {
    expect(gameSrc).toMatch(/superCartUnlocked\(\): boolean \{/);
    expect(gameSrc).not.toMatch(/private superCartUnlocked/);
  });
  it('存档链 1:1（SaveFile 写 + mainFlow 读回 + view 类型）', () => {
    expect(saveSrc).toMatch(/hbLocked: player\.hbLocked \?\? false,\s*\/\/ SW-FX10 债⑪:PL:55543 hbLocked bool/);
    expect(saveSrc).toMatch(/enabledSuperCart: player\.enabledSuperCart \?\? true,/);
    expect(flowSrc).toMatch(/g\.player\.hbLocked = player\.hbLocked;/);
    expect(flowSrc).toMatch(/g\.player\.enabledSuperCart = player\.enabledSuperCart;/);
    expect(serSrc).toMatch(/hbLocked\?: boolean;/);
    expect(serSrc).toMatch(/enabledSuperCart\?: boolean;/);
  });
});

// ============================================================
// 债⑪ 热键锁 HbLock（Main.cs:43203-43237 DrawHotbarLockIcon + :44353/:44357 关包
//   快捷栏门 + .plr PL:55543 写/:56268 读 + 悬停名 inter[5]/[6]）
//   语义定谳：图标仅【开包态】画（DrawInventory :41755 调用），位置 (0,21)，
//   pushSideToolsUp（builderAcc 可见图标≥10=恶魔心+大师槽齐显）→ (0,0)；锁定只
//   拦【关包态】快捷栏鼠标（hover 门 :44353 整块不进+changeItem 门 :44357），
//   1-0 数字键与开包格交互不受影响
// ============================================================
describe('SW-FX10 债⑪ 热键锁 HbLock', () => {
  it('锁体位置：(0,21)/push→(0,0)（Main.cs:43205-43208）', () => {
    expect(hotbarLockXY(false)).toEqual(HOTBAR_LOCK_XY);
    expect(HOTBAR_LOCK_XY).toEqual({ x: 0, y: 21 });
    expect(hotbarLockXY(true)).toEqual({ x: 0, y: 0 });
  });
  it('图标接线：Lock_{0锁/1未锁} 双帧贴图 + unlock 音（SoundID 22 :43230）+ inter[5]/[6]', () => {
    expect(uiSrc).toMatch(/url\(sprites\/vanilla\/Lock_\$\{locked \? 0 : 1\}\.png\)/);
    expect(uiSrc).toMatch(/this\.game\.sfx\.play\('unlock', 1\);/);
    expect(uiSrc).toMatch(/Lang\.inter\(locked \? 6 : 5\)/);
    // ★SW-RB11e 勘误（2026-09-10）：pushSideToolsUp = GetBuilderAccsCountToShow.totalDrawnIcons≥10
    //  （Main.cs:41752-41753 同一变量喂 DrawHotbarLockIcon :41755/方块替换 :43247/群系炬 :43289/
    //  图标列 :48166；表式 :48381-48386,门=配饰装备态 Player.cs:12899-12915）——与 SW-FX19
    //  图标列单源同式。原刀误写 visibleRows≥10（装备列行数,另一量纲）已废,反向锁定禁回潮。
    expect(uiSrc).toMatch(/builderAccGateSet\(\(vid\) => playerAccessoryVidEquipped\(/);
    expect(uiSrc).toMatch(/builderAccTotalIcons\(\s*g, !!this\.game\?\.world\.flags\.unlockedBiomeTorches\) >= 10/);
    expect(uiSrc).not.toMatch(/hotbarLockXY\(\(this\.vinvLayoutCtx\?\.visibleRows \?\? 8\) >= 10\)/);
  });
  it('关包选中门（Main.cs:44357 changeItem 门）+ 透传豁免（:44353 hover 门整块不进）', () => {
    // mouseup 臂：锁定+关包 → 该格既不选中也不拾取（整格无动作,点击本体透传世界）
    expect(uiSrc).toMatch(/if \(from\.where === 'inv' && from\.i < 10 && !panelOpen\) \{\s*\n\s*if \(this\.game\.player\.hbLocked\) return;/);
    // mousedown 臂：passthrough 槽不 stopPropagation（事件达 window）
    expect(uiSrc).toMatch(/if \(s\.dataset\.swWorldPassthrough === '1'\) return;\n\s*e\.stopPropagation\(\);/);
    // domTargets 豁免：data-sw-world-passthrough="1" 子树不算 UI 目标
    // （dataset 守卫 = 真实 Element 恒有 dataset,closest 桩夹具无 dataset 走旧路径）
    expect(domSrc).toMatch(/if \(e\?\.dataset && e\.closest\?\.\('\[data-sw-world-passthrough="1"\]'\)\) return false;/);
    // 挂摘面：关包∧锁定才挂
    expect(uiSrc).toMatch(/const on = closed && !!this\.game\?\.player\.hbLocked;/);
  });
  it('透传豁免判别力（isDomUiTarget 门矩阵）', () => {
    // 无 DOM 环境下 dataset/closest 走桩：命中豁免 → false（点击归世界）
    const passthroughSlot = {
      dataset: { swWorldPassthrough: '1' },
      closest: (sel: string) => (sel.startsWith('[data-sw-world') ? {} : null),
    } as unknown as HTMLElement;
    expect(isDomUiTarget(passthroughSlot)).toBe(false);
    // 未挂豁免的正常槽：closest 命中 UI 选择器 → true
    const normalSlot = {
      dataset: {},
      closest: (sel: string) => (sel.includes('.sw-slot') ? {} : null),
    } as unknown as HTMLElement;
    expect(isDomUiTarget(normalSlot)).toBe(true);
    // 豁免子元素（槽号 span）：closest 走到带豁免的祖先 → false
    const spanInLockedSlot = {
      dataset: {},
      closest: (sel: string) => (sel.startsWith('[data-sw-world') ? {} : null),
    } as unknown as HTMLElement;
    expect(isDomUiTarget(spanInLockedSlot)).toBe(false);
  });
});

// ============================================================
// 债⑥ 相机页签（Main.cs:43549-43595：点击 → CaptureManager.Active=true +
//   blockMouse :43565-43568，成功 PlaySound(10) :43583；悬停名 inter[81]/[115]）
// ============================================================
describe('SW-FX10 债⑥ 相机页签接线（Main.cs:43549-43595）', () => {
  it('页签点击开 M6 拍照模式（CaptureManager.Active 等价面）', () => {
    expect(uiSrc).toMatch(/cm\.toggleRequest\(this\.game\.player, this\.game\.world\);/);
    expect(uiSrc).toMatch(/if \(!was && cm\.active\) this\.game\.sfx\.play\('menuOpen', 1\);/);
  });
  it('悬停名走原版键 inter[81]（Camera Mode；disabled 面 inter[115] 本仓 CaptureModeDisabled 恒 false）', () => {
    expect(uiSrc).toMatch(/mkTab\(TAB_CAMERA_SIZE\.w, TAB_CAMERA_SIZE\.h, 'UI_DisplaySlots_8\.png',\s*\n\s*Lang\.inter\(81\)\)/);
  });
});

// ============================================================
// 债⑫ 定谳（非债）：原版经典合成列表【不显示】材料缺失配方——UpdateRecipeList
//   三连门（Recipe.cs:252 filterHack∧environment∧CollectedEnoughItemsToCraft；
//   :280-298 HowManyTimesCanRecipeBeCrafted>0 即材料门）。
//   "站点匹配但材料缺失的置灰配方"是 NewCraftingUI（modern 网格）的行为面，
//   本仓 classic 竖列表与之同相。反向锁定：站点匹配但材料缺失 → 不出该行
// ============================================================
describe('SW-FX10 债⑫ 定谳：经典列表只出 count>0（Recipe.cs:252/280-298）', () => {
  // 找一张「单站点+单材料」配方做判别（避免组/多站点噪声）
  const wbRecipe: VanillaRecipe | undefined = VANILLA_RECIPES.find(
    (r) => r.tile >= 0 && r.items.length === 1,
  );
  it('夹具自证：存在单站点单材料配方', () => {
    expect(wbRecipe).toBeTruthy();
  });
  it('材料缺失（站点匹配）不入列；材料到位入列', () => {
    const rec = wbRecipe!;
    const inv = new Inventory();
    // ctx.nearbyInternal = 内部 tile id 域（Game.stationsNearby 口径）——经
    // expandStationTiles 的 vanilla sheet → TILE_DEFS.vanilla.sheet 反查内部 id
    const internalTiles = new Set<number>();
    for (const t of [rec.tile]) {
      const internal = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === t);
      if (internal >= 0) internalTiles.add(internal);
    }
    expect(internalTiles.size).toBe(1);   // 夹具自证：站点可落到内部 tile
    const ctx = { nearbyInternal: internalTiles };
    // 站点已匹配、背包空 → 缺料行不进列表（原版 :252 材料门）
    expect(availableRecipes(inv, ctx, []).some((e) => e.r === rec)).toBe(false);
    // 材料补足 → 入列（门确是材料而非列表恒空）
    inv.add(internalIdOfVid(rec.items[0].id), rec.items[0].stack);
    expect(availableRecipes(inv, ctx, []).some((e) => e.r === rec)).toBe(true);
  });
});

// ============================================================
// 债⑤（已清偿,反向锁定）/ 债⑧（定谳:非债）
// ============================================================
describe('SW-FX10 登记债⑤⑧ 定谳面反向锁定', () => {
  it('债⑤：重铸/锤/储蓄罐原位化已在刀12 清偿（vanilla 原位臂在盘,classic modal 保留）', () => {
    // Main.cs:42440 重铸 (50,270)（num53=50/num54=270）;本仓 vanilla 档原位臂锚
    expect(uiSrc).toMatch(/vinvReforgeOpen/);
    expect(uiSrc).toMatch(/:42277-42279:chest\/npcShop\/talkNPC\/guide 任一即 InReforgeMenu=false/);
  });
  it('债⑧：Images/UI/Craft.png 仅 NewCraftingUI.cs:464 消费（classic 面无此资产支）——classic 列表不画', () => {
    // 1457 AssetInitializer.cs 注册面（:548-606）只含 ChestCraft_0-3/Craft_Toggle_0-5/
    // RecUp/RecDown，无 UI\Craft 单帧注册；消费面唯一 = NewCraftingUI.DrawChildren
    // （modern 网格窗内成品→材料行间装饰,几何已建模 vanillaInvLayout craftDetailLayout）
    expect(uiSrc).not.toMatch(/sprites\/vanilla-ui\/UI_Craft\.png/);
  });
});
