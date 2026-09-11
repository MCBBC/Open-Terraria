// 背包布局灰度 flag(vanilla 1.4.5.7 布局重构)守卫 —— 2026-09-07 用户定策
//
// 口径(用户拍板,方案 /Users/vinlic/.claude/plans/compressed-beaming-stonebraker.md):
//   · 完全 1:1 原版布局,但【缺省关】——验证通过前不替换现行布局(刀 7 才切缺省);
//   · classic=现行 buildInventoryPanel 零行为改动;vanilla=双构建器分派。
// 本文件随刀序增长:刀0=flag 面;刀1=几何/页码;刀2+=srcMatch 结构锁+classic canary。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/save/KvStore', () => ({
  kvGet: vi.fn(async () => null),
  kvSet: vi.fn(async () => 'fail' as const),
  kvHas: vi.fn(async () => false),
  kvGetIdb: vi.fn(async () => null),
  kvSetIdb: vi.fn(async () => 'fail' as const),
  kvDelete: vi.fn(async () => undefined),
}));

import { OptionsStore } from '../src/core/Options';
import { kvGet } from '../src/save/KvStore';

describe('刀0 flag 面:inventoryLayout(Options)', () => {
  beforeEach(() => {
    vi.mocked(kvGet).mockResolvedValue(null);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('★缺省锁(SW-FX39 缺省转正红绿开关):new OptionsStore() 缺省 vanilla', () => {
    expect(new OptionsStore().data.inventoryLayout).toBe('vanilla');
  });

  it('load 坏值回退 vanilla(存档含非法值/旧档缺键同语义;SW-FX39 新缺省)', async () => {
    vi.mocked(kvGet).mockResolvedValue(JSON.stringify({ inventoryLayout: 'modern' }));
    const s = new OptionsStore();
    await s.load();
    expect(s.data.inventoryLayout).toBe('vanilla');
  });

  it('load 合法 vanilla 保留(用户显式选择不被卫门吞)', async () => {
    vi.mocked(kvGet).mockResolvedValue(JSON.stringify({ inventoryLayout: 'vanilla' }));
    const s = new OptionsStore();
    await s.load();
    expect(s.data.inventoryLayout).toBe('vanilla');
  });

  it('★SW-FX39 存档侧 classic 保留不迁移(灰度期经设置行显式切换=用户意志,回退旗面)', async () => {
    vi.mocked(kvGet).mockResolvedValue(JSON.stringify({ inventoryLayout: 'classic' }));
    const s = new OptionsStore();
    await s.load();
    expect(s.data.inventoryLayout).toBe('classic');
  });

  it('URL 会话覆盖 ?invlayout=vanilla(不落盘:仅 load 内存改写,非 set 通道)', async () => {
    vi.stubGlobal('location', { search: '?invlayout=vanilla' });
    const s = new OptionsStore();
    await s.load();
    expect(s.data.inventoryLayout).toBe('vanilla');
  });

  it('URL 覆盖 ?invlayout=classic 可反向钉回(探针双档复用)', async () => {
    vi.stubGlobal('location', { search: '?invlayout=classic' });
    vi.mocked(kvGet).mockResolvedValue(JSON.stringify({ inventoryLayout: 'vanilla' }));
    const s = new OptionsStore();
    await s.load();
    expect(s.data.inventoryLayout).toBe('classic');
  });

  it('URL 非法值忽略(维持存档/缺省;SW-FX39 后无存档=vanilla)', async () => {
    vi.stubGlobal('location', { search: '?invlayout=terraria' });
    const s = new OptionsStore();
    await s.load();
    expect(s.data.inventoryLayout).toBe('vanilla');
  });

  it('★SW-FX39 回退旗 ?invlayout=legacy → classic(旧自创布局统一叫法,过渡期面)', async () => {
    vi.stubGlobal('location', { search: '?invlayout=legacy' });
    const s = new OptionsStore();
    await s.load();
    expect(s.data.inventoryLayout).toBe('classic');
  });

  it('★SW-FX39 回退旗仅会话生效:set() 落盘剥回存档侧值(红队 F1 语义对 legacy 同样成立)', async () => {
    vi.stubGlobal('location', { search: '?invlayout=legacy' });
    const s = new OptionsStore();
    await s.load();
    expect(s.data.inventoryLayout).toBe('classic');
    s.set('uiScale', 1.2);
    await new Promise((r) => setTimeout(r, 450));   // 落盘防抖 400ms
    const { kvSet } = await import('../src/save/KvStore');
    const writes = vi.mocked(kvSet).mock.calls.map((c) => JSON.parse(c[1] as string) as { inventoryLayout?: string });
    expect(writes.length).toBeGreaterThan(0);
    // 无存档 case:persistedLayout=缺省 vanilla → 落盘恒 vanilla;legacy 覆盖值绝不入档
    for (const w of writes) expect(w.inventoryLayout).toBe('vanilla');
  });
});

describe('刀0 flag 面:Settings 行与 l10n', () => {
  it('Settings.ts 消费三键(行存在性 srcMatch)', async () => {
    const src = await import('node:fs').then((m) => m.readFileSync('src/ui/Settings.ts', 'utf8'));
    expect(src.includes('Mods.SandboxWorld.Settings.InventoryLayout')).toBe(true);
    expect(src.includes('Mods.SandboxWorld.Settings.InventoryLayoutClassic')).toBe(true);
    expect(src.includes('Mods.SandboxWorld.Settings.InventoryLayoutVanilla')).toBe(true);
    // 循环切换写回 Options(双态 cycle)
    expect(src.includes("d.inventoryLayout === 'vanilla' ? 'classic' : 'vanilla'")).toBe(true);
  });

  it('12 语言产物齐备(公开包已重建;嵌套源展平后键无 Mods. 重复前缀,与 CraftFromNearbyChests 同形)', async () => {
    const fs = await import('node:fs');
    const langs = ['zh-Hans', 'zh-Hant', 'en-US', 'de-DE', 'es-ES', 'fr-FR', 'it-IT',
      'ja-JP', 'ko-KR', 'pl-PL', 'pt-BR', 'ru-RU'];
    for (const lang of langs) {
      const pack = JSON.parse(fs.readFileSync(`public/l10n/${lang}.json`, 'utf8')) as {
        Mods: Record<string, string>;
      };
      expect(typeof pack.Mods['SandboxWorld.Settings.InventoryLayout'], lang).toBe('string');
      expect(typeof pack.Mods['SandboxWorld.Settings.InventoryLayoutClassic'], lang).toBe('string');
      expect(typeof pack.Mods['SandboxWorld.Settings.InventoryLayoutVanilla'], lang).toBe('string');
    }
  });
});

// ---- 刀 1:纯几何模块(原版逐槽截断纪律,K=1 与原版逐像素相等) ----
import {
  gridSlotXY, gridHitRect, coinSlotXY, ammoSlotXY, trashXY,
  quickStackXY, sortXY, bestiaryXY, emoteXY,
  mHOf, equipAreaTop, equipRowY, accessoryCheckY,
  EQUIP_COL_X, VANITY_COL_X, DYE_COL_X, ACCESSORY_CHECK_X,
  loadoutRailRect, loadoutBtnXY, defenseCenterXY,
  TAB_Y, TAB_MISC_X, TAB_HOUSING_X, TAB_CAMERA_X,
  miscRowY, miscCheckXY, housingSlotPositions,
  pvpSwordXY, pvpTeamXY, craftPanelRect, craftCellXY, craftDetailLayout,
  vanillaScaleFor,
} from '../src/ui/vanillaInvLayout';
import { selectEquipPageOf, equipPageCapOf, type EquipPageCap } from '../src/ui/SlotActions';
import { ITEM_DEFS } from '../src/data/items';

const cap = (o: Partial<EquipPageCap>): EquipPageCap => ({
  projHook: false, mountType: false, vanityPet: false, lightPet: false,
  dye: false, legSlot: false, headSlot: false, bodySlot: false, accessory: false, ...o,
});

describe('刀1 几何:网格 10×5(Main.cs:41731-41750,逐槽截断)', () => {
  it('起点 (20,20)、步距截断序列与第 5 行落位', () => {
    expect(gridSlotXY(0)).toEqual({ x: 20, y: 20 });
    expect(gridSlotXY(1).x).toBe(67);     // trunc(67.6)
    expect(gridSlotXY(2).x).toBe(115);    // trunc(115.2)
    expect(gridSlotXY(3).x).toBe(162);    // trunc(162.8)
    expect(gridSlotXY(5).x).toBe(258);    // trunc(258.0)
    expect(gridSlotXY(7).x).toBe(353);    // trunc(353.2)
    expect(gridSlotXY(9).x).toBe(448);    // trunc(448.4)
    expect(gridSlotXY(10)).toEqual({ x: 20, y: 67 });
    expect(gridSlotXY(49)).toEqual({ x: 448, y: 210 });   // 第 5 行末格(热键栏=第 0 行)
  });
  it('整块拦截区(Main.cs:41727)', () => {
    expect(gridHitRect()).toEqual({ x: 20, y: 20, w: 476, h: 238 });
  });
});

describe('刀1 几何:钱币/弹药/垃圾桶/2×2 钮', () => {
  it('钱币 x=497 / 弹药 x=534,y=105 起步距 33.6 截断(Main.cs:42467-42486)', () => {
    expect(coinSlotXY(0)).toEqual({ x: 497, y: 105 });
    expect(coinSlotXY(1).y).toBe(138);      // trunc(138.6)
    expect(coinSlotXY(2).y).toBe(172);      // trunc(172.2)
    expect(coinSlotXY(3).y).toBe(205);      // trunc(205.8)
    expect(ammoSlotXY(0)).toEqual({ x: 534, y: 105 });
  });
  it('垃圾桶双位置(Main.cs:43073-43090)', () => {
    expect(trashXY(false)).toEqual({ x: 448, y: 258, scale: 0.85 });
    expect(trashXY(true)).toEqual({ x: 453, y: 426, scale: 0.755 });
  });
  it('2×2 钮:开箱/商店态堆叠/排序消失、图鉴/表情移位(Main.cs:42548/43103)', () => {
    expect(quickStackXY(false)).toEqual({ x: 498, y: 244 });
    expect(quickStackXY(true)).toBeNull();
    expect(sortXY(true)).toBeNull();
    expect(bestiaryXY(false)).toEqual({ x: 498, y: 278 });
    expect(bestiaryXY(true)).toEqual({ x: 503, y: 446 });
    expect(emoteXY(true)).toEqual({ x: 539, y: 446 });
  });
});

describe('刀1 几何:mH 与装备区顶(Main.cs:46535-46561/41854-41861)', () => {
  it('mH=小地图 256 钳 sh-600(600 高视口钳 0 分支)', () => {
    expect(mHOf(true, 1080)).toBe(256);
    expect(mHOf(true, 800)).toBe(200);      // min(256,200)
    expect(mHOf(true, 600)).toBe(0);        // 钳制分支
    expect(mHOf(false, 800)).toBe(0);
    // ★红队 m1 清偿:PushUp 变体(恶魔心/大师 610)+关图负钳(Main.cs:3063-3071)
    expect(mHOf(true, 780, 610)).toBe(170);
    expect(mHOf(false, 500, 610)).toBe(-110);   // 关图仍钳,可为负=原版同款
  });
  it('num20=174+mH;矮屏(<950 且行≥10)上移 47.6*(n-9)', () => {
    expect(equipAreaTop(1080, 256, 8)).toBe(430);
    expect(equipAreaTop(800, 200, 12)).toBe(232);   // 374 - trunc(47.6*3)
    expect(equipAreaTop(800, 200, 9)).toBe(374);    // 行<10 不压缩
    expect(equipAreaTop(1000, 256, 12)).toBe(430);  // sh≥950 不压缩
  });
});

describe('刀1 几何:三列/行 y/勾选框/配装轨/防御(Main.cs:42085-42899/42651-42707)', () => {
  const sw = 1280, num20 = 430;
  it('列 x=sw-92/-139/-186,勾选框 sw-58', () => {
    expect(EQUIP_COL_X(sw)).toBe(1188);
    expect(VANITY_COL_X(sw)).toBe(1141);
    expect(DYE_COL_X(sw)).toBe(1094);
    expect(ACCESSORY_CHECK_X(sw)).toBe(1222);
  });
  it('行 y 截断 + 第 4 行起 +4(num35)', () => {
    expect(equipRowY(num20, 0)).toBe(430);
    expect(equipRowY(num20, 2)).toBe(525);    // +trunc(95.2)
    expect(equipRowY(num20, 3)).toBe(576);    // +trunc(142.8)+4
    expect(equipRowY(num20, 8)).toBe(814);    // +trunc(380.8)+4
    expect(accessoryCheckY(num20, 3)).toBe(574);   // 430-2+trunc(142.8)+4
  });
  it('配装竖轨/钮(sw-44 轨,sw-40+36i 钮)', () => {
    // ★红队 M1 清偿:轨高 n=装备列可见行数(:42653-42662 缺省 8),y=num20+2,截断
    expect(loadoutRailRect(sw, num20, 8)).toEqual({ x: 1236, y: 432, w: 4, h: 380 });
    expect(loadoutBtnXY(sw, num20, 0)).toEqual({ x: 1240, y: 430 });
    expect(loadoutBtnXY(sw, num20, 2)).toEqual({ x: 1240, y: 502 });
  });
  it('防御计数中心 (sw-210, 末行 y+26)', () => {
    expect(defenseCenterXY(sw, num20, 7)).toEqual({ x: 1070, y: 793 });
  });
});

describe('刀1 几何:页签/杂项页/住房页/PvP/合成面板', () => {
  const sw = 1280, num20 = 430;
  it('页签 y=num20-32,x=sw-80/-128/-176', () => {
    expect(TAB_Y(num20)).toBe(398);
    expect(TAB_MISC_X(sw)).toBe(1200);
    expect(TAB_HOUSING_X(sw)).toBe(1152);
    expect(TAB_CAMERA_X(sw)).toBe(1104);
  });
  it('杂项页行距整型 47(Main.cs:41905 区别于 47.6)', () => {
    expect(miscRowY(num20, 4)).toBe(618);
    expect(miscCheckXY({ x: 100, y: 50 })).toEqual({ x: 134, y: 48 });
  });
  it('住房页超 sh-80 向左换列 -48 回顶(Main.cs:42755)', () => {
    const pos = housingSlotPositions(20, sw, num20, 800);
    expect(pos[0]).toEqual({ x: 1188, y: 430 });
    expect(pos[6].y).toBe(715);             // trunc(6*47.6)=285+430=715 ≤ 720
    expect(pos[7]).toEqual({ x: 1140, y: 430 });   // 763>720 → 换列
    // ★红队 m5 清偿:num2 吸收全局分数残量(num 不归零,:42751-42758)——
    // 第 2 列第 4 槽(n=10):trunc(430+476)-333=573(旧逐列归零=572)
    expect(pos[10]).toEqual({ x: 1140, y: 573 });
  });
  it('PvP 剑/队伍网格(Main.cs:43389-43443)', () => {
    expect(pvpSwordXY(sw, 200, false)).toEqual({ x: 1053, y: 379 });
    expect(pvpSwordXY(sw, 200, true).x).toBe(1099);   // 页 2 x+46
    expect(pvpTeamXY(sw, 200, 0, false)).toEqual({ x: 1053, y: 439 });
    expect(pvpTeamXY(sw, 200, 3, false)).toEqual({ x: 1073, y: 459 });
    expect(pvpTeamXY(sw, 200, 0, true).x).toBe(1099);   // ★红队 m2:页 2 +46(Main.cs:43395-43397)
  });
  it('合成面板 (20,312) 490×(sh-350);44px 格;详情浮层偏移(NewCraftingUI.cs)', () => {
    expect(craftPanelRect(800)).toEqual({ x: 20, y: 312, w: 490, h: 450 });
    expect(craftCellXY(2, 1)).toEqual({ x: 88, y: 44 });
    // ★红队 M2 清偿:GetInnerDimensions=UIState 自身(SetPadding(0))——origin=面板+(24,73)
    const d = craftDetailLayout(20, 312);
    expect(d.origin).toEqual({ x: 44, y: 385 });
    expect(d.hammer).toEqual({ x: 91, y: 398 });
    expect(d.materialsStart).toEqual({ x: 116, y: 391 });   // 22-16·num(num=1)
    expect(d.guideSlot).toEqual({ x: 44, y: 443 });
  });
  it('容器缩放钳 [0.5,1.15](本仓登记偏差:整体等比)', () => {
    expect(vanillaScaleFor(1280, 800)).toBe(1);
    expect(vanillaScaleFor(1920, 1080)).toBe(1);
    expect(vanillaScaleFor(844, 390)).toBe(0.5);
    expect(vanillaScaleFor(400, 300)).toBe(0.5);
    expect(vanillaScaleFor(1600, 1200, 1.5)).toBe(1.15);
  });
});

describe('刀1 页码:selectEquipPageOf(ItemSlot.cs:4641-4671 分支序 1:1)', () => {
  it('钩链/坐骑/矿车/宠物/光宠 → 页 2(优先序)', () => {
    expect(selectEquipPageOf(cap({ projHook: true }), 0)).toBe(2);
    expect(selectEquipPageOf(cap({ mountType: true }), 0)).toBe(2);
    expect(selectEquipPageOf(cap({ vanityPet: true }), 2)).toBe(2);
    expect(selectEquipPageOf(cap({ lightPet: true }), 1)).toBe(2);
    // 优先序:钩链压过盔甲
    expect(selectEquipPageOf(cap({ projHook: true, headSlot: true }), 0)).toBe(2);
  });
  it('染料:仅页 1 持有强制回页 0;页 0/2 染料落记忆(null)', () => {
    expect(selectEquipPageOf(cap({ dye: true }), 1)).toBe(0);
    expect(selectEquipPageOf(cap({ dye: true }), 0)).toBeNull();
    expect(selectEquipPageOf(cap({ dye: true }), 2)).toBeNull();
  });
  it('盔甲三部位/配饰 → 页 0;普通物品 → null(记忆页)', () => {
    expect(selectEquipPageOf(cap({ headSlot: true }), 2)).toBe(0);
    expect(selectEquipPageOf(cap({ bodySlot: true }), 1)).toBe(0);
    expect(selectEquipPageOf(cap({ legSlot: true }), 2)).toBe(0);
    expect(selectEquipPageOf(cap({ accessory: true }), 0)).toBe(0);
    expect(selectEquipPageOf(cap({}), 1)).toBeNull();
  });
  it('equipPageCapOf:数据源端到端(每 EquipKind 抽一件 + 盔甲/配饰)', () => {
    const findId = (pred: (id: number) => boolean) => {
      for (let i = 0; i < ITEM_DEFS.length; i++) if (ITEM_DEFS[i] && pred(i)) return i;
      return -1;
    };
    const hookId = findId((i) => equipPageCapOf(i).projHook);
    const mountId = findId((i) => equipPageCapOf(i).mountType);
    const petId = findId((i) => equipPageCapOf(i).vanityPet);
    const lightId = findId((i) => equipPageCapOf(i).lightPet);
    const dyeId = findId((i) => equipPageCapOf(i).dye && !equipPageCapOf(i).accessory);
    const armorId = findId((i) => equipPageCapOf(i).headSlot);
    const accId = findId((i) => equipPageCapOf(i).accessory && !equipPageCapOf(i).dye);
    expect(hookId).toBeGreaterThanOrEqual(0);
    expect(selectEquipPageOf(equipPageCapOf(hookId), 0)).toBe(2);
    expect(mountId).toBeGreaterThanOrEqual(0);
    expect(selectEquipPageOf(equipPageCapOf(mountId), 0)).toBe(2);
    expect(petId).toBeGreaterThanOrEqual(0);
    expect(selectEquipPageOf(equipPageCapOf(petId), 0)).toBe(2);
    expect(lightId).toBeGreaterThanOrEqual(0);
    expect(selectEquipPageOf(equipPageCapOf(lightId), 0)).toBe(2);
    expect(dyeId).toBeGreaterThanOrEqual(0);
    expect(armorId).toBeGreaterThanOrEqual(0);
    expect(selectEquipPageOf(equipPageCapOf(armorId), 2)).toBe(0);
    expect(accId).toBeGreaterThanOrEqual(0);
    expect(selectEquipPageOf(equipPageCapOf(accId), 0)).toBe(0);
  });
});

// ---- 刀 6:结构锁(srcMatch 钉 vanilla 判据与 classic canary) ----
// 依据 playbook P3.1 守卫矩阵:修复落盘必有永久回归测试——行为面(上方 flag/几何/
// 页码)+ 结构锁(本节,防静默回退)。classic canary = 红线自证(buildInventoryPanel
// 未被改写;配合 sw-au2/sw-ay1/sw-bp1 既有锁 = classic 区零漂移)。
import { readFileSync } from 'node:fs';

const srcOf = (f: string): string => readFileSync(f, 'utf8');

describe('刀6 结构锁:vanilla 构建器判据(UI.ts)', () => {
  const ui = () => srcOf('src/ui/UI.ts');
  it('classic canary:buildInventoryPanel 原签名仍在(classic 零改动红线)', () => {
    expect(ui()).toContain('private buildInventoryPanel() {');
  });
  it('分派:buildInventoryFor 登记 _builtLayout(vanilla 分支经它,initInGame 不直调构建器)', () => {
    const s = ui();
    expect(s).toContain('private buildInventoryFor(layout:');
    expect(s).toContain("this._builtLayout = layout;");
    expect(s).toContain("this.buildInventoryFor('classic');   // classic 原路径(构建器零改动)");
    expect(s).toContain("this.buildInventoryFor('vanilla');");
  });
  it('守卫:positionInvPanel 首行 vanilla 早退', () => {
    const s = ui();
    expect(s).toContain("if (this._builtLayout === 'vanilla') return;");
  });
  it('守卫:refreshHotbar 开包隐藏热键栏(GUIHotbarDrawInner :44324 早退等价)', () => {
    const s = ui();
    expect(s).toContain("if (this._builtLayout === 'vanilla') {\n      const vinvOpen = this.invPanel?.style.display === 'block';");
    expect(s).toContain("if (this.hotbarEl) this.hotbarEl.style.display = vinvOpen ? 'none' : '';");
  });
  it('守卫:refreshAllNow 补绘门 + closeInventory 还原刷', () => {
    const s = ui();
    expect(s).toContain("if (this._builtLayout === 'vanilla') this.paintVanillaInvSlots();");
    // 刀 12:closeInventory 尾刷扩为 vinvReforgeOpen 复位+刷新;SW-FX10:再入 buff 块回流
    expect(s).toContain("if (this._builtLayout === 'vanilla') {\n      this.vinvReforgeOpen = false;   // 原版重铸菜单随背包关闭退出(DrawInventory 域内)\n      this.reflowBuffs();             // ★SW-FX10 债④:页2 列内 buff 块回流 HUD 栏(关包当帧)\n      this.refreshAll();\n    }");
  });
  it('teardown 清单:双构建器字段全清(重建路径完整性)', () => {
    const s = ui();
    for (const f of ['this.vinvCraftCellEls = [];', 'this.vinvCraftListEl = null;',
      'this.vinvChestNameEl = null;', 'this.vinvHousingPage = null;',,
      'this.vinvLockEl = null;', 'this.miscBuffCol = null;',   // SW-FX10 新增页域字段
      'this.loadoutBtns = [];', 'this.accEyeEls.clear();', "document.getElementById('sw-vinv-style')?.remove();"]) {
      expect(s).toContain(f);
    }
  });
  it('domTargets/ closest 门登记 .sw-vinv(缝隙点击不穿透)', () => {
    expect(srcOf('src/core/input/domTargets.ts')).toContain('.sw-eqdock, .sw-vinv');
    const s = ui();
    expect(s).toContain("'.sw-panel, .sw-eqdock, .sw-vinv'");
  });
});

describe('刀6 结构锁:纯几何模块(vanillaInvLayout.ts)', () => {
  it('网格公式逐槽截断(Main.cs:41731-41750 的字面锚)', () => {
    const s = srcOf('src/ui/vanillaInvLayout.ts');
    expect(s).toContain('Math.trunc(20 + (i % 10) * 56 * INV_SCALE)');
    expect(s).toContain('Math.trunc(20 + Math.floor(i / 10) * 56 * INV_SCALE)');
  });
  it('装备区顶 174+mH 与矮屏压缩(:41855/:41858-41861)', () => {
    const s = srcOf('src/ui/vanillaInvLayout.ts');
    expect(s).toContain('let top = 174 + mH;');
    expect(s).toContain('if (sh < 950 && visibleRows >= 10) top -= Math.trunc(CELL_STEP * (visibleRows - 9));');
  });
});

describe('刀6 结构锁:页码路由(SlotActions.ts,ItemSlot.cs:4641-4671 分支序)', () => {
  it('分支序:hook→mount→pet→light→dye&&1→armor,尾 null=记忆页', () => {
    const s = srcOf('src/ui/SlotActions.ts');
    const body = s.slice(s.indexOf('export function selectEquipPageOf'));
    const order = [
      'if (cap.projHook) return 2;',
      'if (cap.mountType) return 2;',
      'if (cap.vanityPet) return 2;',
      'if (cap.lightPet) return 2;',
      'if (cap.dye && selected === 1) return 0;',
      'if (cap.legSlot || cap.headSlot || cap.bodySlot || cap.accessory) return 0;',
      'return null;',
    ];
    let at = -1;
    for (const line of order) {
      const i = body.indexOf(line);
      expect(i, line).toBeGreaterThan(-1);
      expect(i, `位次: ${line}`).toBeGreaterThan(at);
      at = i;
    }
  });
});
