// SW-FX39(2026-09-11)——vanilla 布局缺省转正刀:缺省翻转 + 差集审计终态锁 + 回退旗面。
//
// 用户拍板:vanilla(原版 1.4.5.7 布局,UI.ts buildVanillaInventoryPanel,几何单源
// vanillaInvLayout.ts)转正为缺省 UI;classic(旧自创 buildInventoryPanel)退居回退旗
// ?invlayout=legacy(Options.load 别名映射 classic;classic 历史名仍收=灰度期探针零改动)。
//
// 权威锚:
//   · 布局 1:1 面自 2026-09-07 刀 2 起逐行锚 Terarria1457/Terraria/Main.cs DrawInventory
//     族(见 vanillaInvLayout.ts 各常量注;本刀不改几何/行为,只翻缺省+补差集处置);
//   · 缺省翻转面 = src/core/Options.ts(初始值/坏值卫门/URL 会话覆盖);
//   · 差集处置面 = main.ts openInGamePause 停车坪(刀 3/刀 5:自创面入口挂暂停菜单,
//     inventoryLayout==='vanilla' 门控——缺省转正后即常态路径)。
//
// 变异证红纪律:缺省锁翻转(改回 classic 即红)/legacy 别名(摘映射即红)/停车坪门
// (摘 gate 即红)/classic canary(误删回退旗构建器即红)。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../src/save/KvStore', () => ({
  kvGet: vi.fn(async () => null),
  kvSet: vi.fn(async () => 'fail' as const),
  kvHas: vi.fn(async () => false),
  kvGetIdb: vi.fn(async () => null),
  kvSetIdb: vi.fn(async () => 'fail' as const),
  kvDelete: vi.fn(async () => undefined),
}));

import { OptionsStore } from '../src/core/Options';
import { kvGet, kvSet } from '../src/save/KvStore';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcOf = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const optionsSrc = srcOf('src/core/Options.ts');
const uiSrc = srcOf('src/ui/UI.ts');
const mainSrc = srcOf('src/main.ts');

// ============================================================
// ① 缺省翻转(Options.ts——红绿开关主体)
// ============================================================
describe('SW-FX39 ①缺省翻转(Options)', () => {
  beforeEach(() => {
    vi.mocked(kvGet).mockResolvedValue(null);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('缺省 = vanilla(初始值字面锁;翻回 classic 即红)', () => {
    expect(new OptionsStore().data.inventoryLayout).toBe('vanilla');
    expect(optionsSrc).toMatch(/inventoryLayout: 'vanilla',\s+\/\/ ★SW-FX39/);
  });

  it('load 坏值卫门回 vanilla(SW-FX39 标记在位)', async () => {
    vi.mocked(kvGet).mockResolvedValue(JSON.stringify({ inventoryLayout: 'modern' }));
    const s = new OptionsStore();
    await s.load();
    expect(s.data.inventoryLayout).toBe('vanilla');
    expect(optionsSrc).toContain('★SW-FX39(2026-09-11)缺省转正：坏值回新缺省 vanilla');
  });

  it('存档侧 classic(灰度期显式切换)保留不迁移', async () => {
    vi.mocked(kvGet).mockResolvedValue(JSON.stringify({ inventoryLayout: 'classic' }));
    const s = new OptionsStore();
    await s.load();
    expect(s.data.inventoryLayout).toBe('classic');
  });

  it('存档侧 vanilla 保留', async () => {
    vi.mocked(kvGet).mockResolvedValue(JSON.stringify({ inventoryLayout: 'vanilla' }));
    const s = new OptionsStore();
    await s.load();
    expect(s.data.inventoryLayout).toBe('vanilla');
  });
});

// ============================================================
// ② 回退旗面(?invlayout=legacy 别名 + 会话不落盘)
// ============================================================
describe('SW-FX39 ②回退旗面(URL 会话覆盖)', () => {
  beforeEach(() => {
    vi.mocked(kvGet).mockResolvedValue(null);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('?invlayout=legacy → classic(旧自创布局统一叫法;摘映射即红)', async () => {
    vi.stubGlobal('location', { search: '?invlayout=legacy' });
    const s = new OptionsStore();
    await s.load();
    expect(s.data.inventoryLayout).toBe('classic');
    expect(optionsSrc).toContain("qLayout === 'legacy' ? 'classic' : qLayout");
  });

  it('?invlayout=classic 历史名仍收(灰度期探针/测试零改动)', async () => {
    vi.stubGlobal('location', { search: '?invlayout=classic' });
    const s = new OptionsStore();
    await s.load();
    expect(s.data.inventoryLayout).toBe('classic');
  });

  it('?invlayout=vanilla 显式钉回缺省(探针双档复用)', async () => {
    vi.stubGlobal('location', { search: '?invlayout=vanilla' });
    const s = new OptionsStore();
    await s.load();
    expect(s.data.inventoryLayout).toBe('vanilla');
  });

  it('非法值忽略(维持缺省 vanilla)', async () => {
    vi.stubGlobal('location', { search: '?invlayout=terraria' });
    const s = new OptionsStore();
    await s.load();
    expect(s.data.inventoryLayout).toBe('vanilla');
  });

  it('legacy 覆盖仅会话生效:set() 落盘剥回存档侧值(红队 F1 语义不变)', async () => {
    vi.stubGlobal('location', { search: '?invlayout=legacy' });
    const s = new OptionsStore();
    await s.load();
    s.set('uiScale', 1.2);
    await new Promise((r) => setTimeout(r, 450));   // 落盘防抖 400ms
    const writes = vi.mocked(kvSet).mock.calls
      .map((c) => JSON.parse(c[1] as string) as { inventoryLayout?: string });
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(w.inventoryLayout).toBe('vanilla');   // 覆盖值绝不入档
  });
});

// ============================================================
// ③ 差集审计终态锁(vinv 面 = 原版 1:1 逐项在位;自创面 = 停车坪)
//    差集表全文见 SW-FX39 报告;此处钉「处置已落地」防静默回退。
// ============================================================
describe('SW-FX39 ③差集审计终态锁(vinv 缺省态逐面在位)', () => {
  const vinvRegion = (): string => {
    const a = uiSrc.indexOf('private buildVanillaInventoryPanel(): void {');
    const b = uiSrc.indexOf('private layoutVanilla(): void {');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    return uiSrc.slice(a, b) + uiSrc.slice(uiSrc.indexOf('private vinvBuildTrash(): HTMLElement {'), uiSrc.length);
  };
  const v = () => vinvRegion();

  it('原版交互面:Sort(FX29)/QuickStack/图鉴/表情/相机页签/热键锁/超级矿车/buff 列', () => {
    expect(v()).toContain('this.game.sortInventory();');                 // FX29 ItemSorting.SortInventory
    expect(v()).toContain('this.game.quickStackAllChests(options.data.quickStackMode);');
    expect(v()).toContain('this.vinvBestiaryBtn = b;');
    expect(v()).toContain('this.vinvEmoteBtn = b;');
    expect(v()).toContain('this.vinvTabCamera = mkTab(');                 // FX10 债⑥ 相机页签
    expect(v()).toContain('this.vinvLockEl = lock;');                     // FX10 债⑪ 热键锁
    expect(v()).toContain('this.game.player.enabledSuperCart = !this.game.player.enabledSuperCart;');   // FX10 债⑩
    expect(v()).toContain('this.miscBuffCol = col;');                     // FX10 债④ 杂项页 buff 列
  });

  it('槽位面:网格 0-49/钱币/弹药/垃圾桶/装备|时装|染料三列/杂项页/配装轨/PvP', () => {
    expect(v()).toContain("this.vinvMakeSlot('inv', COIN_START + k, COIN_AMMO_SCALE);");
    expect(v()).toContain("this.vinvMakeSlot('inv', AMMO_START + k, COIN_AMMO_SCALE);");
    expect(v()).toContain('private vinvBuildTrash(): HTMLElement {');
    expect(v()).toContain("buildEquipCol('vanity', [10, 11, 12, 13, 14, 15, 16, 17, 18, 19], VANITY_COL_X, INV_SCALE);");
    expect(v()).toContain("buildEquipCol('dye', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], DYE_COL_X, INV_SCALE);");
    expect(v()).toContain("this.vinvMakeSlot('misc', m, INV_SCALE);");
    expect(v()).toContain('loadoutRailRect(c.sw, c.num20, c.visibleRows)');
    expect(v()).toContain('pvpSwordXY(c.sw, c.mH, this.vinvPageCurrent === 2)');
  });

  it('容器面:箱条五钮(拿走/存放/快速堆叠/补货/排列)/商店货架/重铸原位/储蓄', () => {
    expect(v()).toContain("mkChestBtn(0, 'Mods.SandboxWorld.Chest.LootAll'");
    expect(v()).toContain("mkChestBtn(1, 'Mods.SandboxWorld.Chest.DepositAll'");
    expect(v()).toContain("mkChestBtn(2, 'Mods.SandboxWorld.Chest.QuickStack'");
    expect(v()).toContain("mkChestBtn(3, 'Mods.SandboxWorld.Chest.Restock'");
    expect(v()).toContain("mkChestBtn(4, 'Mods.SandboxWorld.Chest.Arrange'");
    expect(v()).toContain('private vinvBuildShop(): void {');            // FX32 店侧
    expect(v()).toContain('private vinvBuildReforge(): void {');         // 刀12 重铸原位
    expect(v()).toContain('coinSavingsByBank()');                        // FX32 储蓄行门
  });

  it('周边面:建筑配件图标列(FX19)/成就 Advisor/设置文字钮/住房页/网格切换钮(FX30)/就近箱钮', () => {
    expect(v()).toContain('this.vinvBuildBuilderAccToggles();');          // FX19
    expect(v()).toContain('createAchievementAdvisor(this.game)');
    expect(v()).toContain("const settingsBtn = el('button', 'vinv-txt') as HTMLButtonElement;");
    expect(v()).toContain('private vinvRefreshHousing(): void {');        // 刀3 住房页
    expect(v()).toContain('private vinvBuildGridToggle(): void {');       // FX30
    expect(v()).toContain("options.set('craftFromNearbyChests', !options.data.craftFromNearbyChests)");
  });

  it('★SW-RB14b 研究钮标签订正:LegacyInterface.112 原版=「你必须先设置边框」(1457 zh-Hans.Legacy.json :112,非研究面),三消费点改自有键', () => {
    // 原版锚:Terarria1457/Terraria.Localization.Content.zh-Hans.Legacy.json LegacyInterface.112
    //   = 你必须先设置边框 / en-US "You must first set a frame"——研究面原版键族 =
    //   Game.CreativePowers.InfiniteItemsCategory(Research);本仓研究 UI 自有键 Research.Title
    expect(srcOf('public/l10n/zh-Hans.json')).toContain('你必须先设置边框');   // 112 语义钉死(防键表漂移翻案)
    const ui = srcOf('src/ui/UI.ts');
    const res = srcOf('src/ui/ResearchUI.ts');
    expect(ui).toContain("Lang.text('Mods.SandboxWorld.Research.Title')");
    expect(res).toContain("Lang.text('Mods.SandboxWorld.Research.Title')");
    // 消费点订正(注释提及不在锁内):Lang.text('LegacyInterface.112') 直取式禁回潮
    expect(ui).not.toMatch(/Lang\.text\(['"]LegacyInterface\.112/);
    expect(res).not.toMatch(/Lang\.text\(['"]LegacyInterface\.112/);
  });

  it('自创面停车坪(main.ts):vanilla 门控下经暂停菜单可达——缺省转正后即常态路径', () => {
    expect(mainSrc).toContain("options.data.inventoryLayout === 'vanilla'");
    const pause = mainSrc.slice(mainSrc.indexOf('pausePanel = ui.showPause({'));
    for (const key of ['onHousing', 'onItemSearch', 'onWeather', 'onTime', 'onPlayerList', 'onJourney', 'onResearch']) {
      expect(pause).toContain(`${key}:`);
    }
    // UI.showPause 渲染侧同面在位(刀 5 停车坪)
    const showPause = uiSrc.slice(uiSrc.indexOf('showPause(handlers: {'));
    expect(showPause).toContain("if (handlers.onItemSearch) panel.appendChild(mkBtn('道具搜索'");
    expect(showPause).toContain("if (handlers.onWeather) panel.appendChild(mkBtn('天气控制'");
    expect(showPause).toContain("if (handlers.onTime) panel.appendChild(mkBtn('时间控制'");
  });
});

// ============================================================
// ④ 登记债锁(classic 独有 SW 自创 QoL 面,vinv 无 = 1:1 纪律)
// ============================================================
describe('SW-FX39 ④登记债锁(viaclassic 独有自创面备案)', () => {
  it('配方搜索框/合成站文字行 = classic 构建器专属(vinv 构建器域零出现)', () => {
    const a = uiSrc.indexOf('private buildVanillaInventoryPanel(): void {');
    const b = uiSrc.indexOf('private vinvBuildTrash(): HTMLElement {');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    const vinvBuilder = uiSrc.slice(a, b);
    expect(vinvBuilder).not.toContain('craftSearchEl');            // 配方搜索 = classic 专属
    expect(uiSrc).toContain("stations.dataset.role = 'stations';"); // 合成站文字行 = classic 专属
    // 债主:配方搜索随 FX30 modern 窗(原版 NewCraftingUI 自带搜索)分期;合成站文字行
    // 原版 1457 CraftingUI.cs:161-318 无此面(标题仅在 numAvailableRecipes>0 时画)。
  });

  it('classic 回退旗构建器仍完整在位(退役前可用;误删即红)', () => {
    expect(uiSrc).toContain('private buildInventoryPanel() {');
    expect(uiSrc).toContain("this.buildInventoryFor('classic');   // classic 原路径(构建器零改动)");
    expect(uiSrc).toContain("this.buildInventoryFor('vanilla');");
  });
});

// ============================================================
// ⑤ l10n 面设置行文案(经典=旧版;12 语言重建)
// ============================================================
describe('SW-FX39 ⑤设置行文案(经典→旧版)', () => {
  it('zh-Hans/en-US 产物已改旧版措辞(不再写「现行/current」)', async () => {
    const zh = JSON.parse(srcOf('public/l10n/zh-Hans.json')) as { Mods: Record<string, string> };
    const en = JSON.parse(srcOf('public/l10n/en-US.json')) as { Mods: Record<string, string> };
    expect(zh.Mods['SandboxWorld.Settings.InventoryLayoutClassic']).toBe('经典(旧版)');
    expect(en.Mods['SandboxWorld.Settings.InventoryLayoutClassic']).toBe('Classic (legacy)');
  });
});
