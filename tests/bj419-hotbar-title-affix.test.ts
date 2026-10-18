// ★BJ419（2026-09-30）用户实报定谳刀：热键栏顶部单行名（选中/伪选中物品名,如
// 「星云烈焰」）只显裸名,缺原版前缀组合名「‹传奇›铁阔剑」面。
// 定谳锚（1457 反编译亲读;1458 同位同文 :44328-44343）：
//   · GUIHotbarDrawInner（Main.cs:44318-44333）——!playerInventory 漏斗;顶部名 =
//     player.inventory[selectedItem].AffixName()（:44331）,空名门（Name=="" :44330）
//     先于 AffixName → 空手回退 Lang.inter[37]"物品"（:44329）。
//   · Item.AffixName（Item.cs:1195-1202）= prefix∈[1,Lang.prefix.Length) →
//     Lang.GetPrefixedItemName（Lang.cs:225-239 → CombineFormat.Prefix 全语种格式串,
//     zh-Hans "‹{PrefixName}›{ItemName}"）——即 BJ390 已落单源 formatPrefixedName。
//   · 热键栏悬停单行名 = hoverItemName = inventory[i].AffixName()（:44361）+
//     " (stack)"（:44364）→ DrawInterface_33_MouseText :46174-46183 单行 MouseText。
// 同族普查（AffixName 位全谱,本刀=最后一个裸名位）：
//   ① hotbar 顶部名（refreshHotbar hotbarNameEl）——裸名病灶,本刀修;
//   ② tooltip 头行（buildTooltipHtml:3236 affixedItemName）= Item.GetHoverName
//     （Item.cs:420-427）→ GetLinesInfo 行 0（Main.cs:20819）——背包/装备/箱/商店/
//     重铸槽同管（BJ390 已带,BJ407 全等判别面守卫）;
//   ③ 掉落物悬停名（Game.ts:37690 popupAffixName）= DrawMouseOver :43623;
//   ④ 拾取飘字（Game.ts:45496）= PopupText.cs:212/312/323。
// 判别：带前缀 = ‹前缀›名（zh 官方 CombineFormat.Prefix）;无前缀/空手逐字不变。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { UI } from '../src/ui/UI';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { languageManager } from '../src/i18n/LanguageManager';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => fs.existsSync(new URL(`../../${d}`, import.meta.url)));


languageManager.loadPackJson(JSON.parse(fs.readFileSync('public/l10n/zh-Hans.json', 'utf8')));

type AnyUI = Record<string, any>;

const idOfVid = (vid: number): number => {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(key, `vid ${vid} ↔ 本仓 def 键`).toBeTruthy();
  return ITEM_BY_KEY[key!];
};

const SWORD = idOfVid(4);        // 铁阔剑（近战武器,前缀域常客）
const NECKLACE = idOfVid(3212);  // 鲨牙项链（配饰——用户实报面「武器/饰品」）
const LEGENDARY = 81;            // 传奇（乘子词缀,武器面）
const VIOLENT = 80;              // 暴力（配饰 tier-only 词缀）

type Held = { id: number; stack: number; prefix?: number } | null;

function mkUi(held: Held, mirror: Held = null): AnyUI {
  const ui = Object.create(UI.prototype) as AnyUI;
  // inv 桩：refreshHotbar 只消费 heldItem()（SW-AZ1 面,镜像优先）;paintHotbarLockState
  // 消费 hbLocked。真 Inventory 不引（其 add 链与本面无关,bj407 同法最小桩域）。
  ui.game = {
    player: {
      hbLocked: false,
      inv: { selected: 0, slots: [held], cursorMirror: mirror, heldItem: () => mirror ?? held },
    },
  };
  ui._builtLayout = undefined;     // classic 路径（vanilla 早退面不触发）
  ui.invPanel = undefined;         // 关包态
  ui.hotbarEl = undefined;         // 守卫面零 DOM
  ui.manualBtn = undefined;
  ui.hotbarNameEl = { style: {}, textContent: '' };
  ui.slotEl = () => null;          // paintHotbarLockState/槽循环探针无 DOM
  ui.hotbarCompact = () => null;   // 影射原型法避开 hudTier→window（node 无 DOM 环境）
  return ui;
}

const titleOf = (ui: AnyUI): string => ui.hotbarNameEl.textContent as string;

// ============ ① 判别核心：带前缀 = CombineFormat 组合名 ============
describe.skipIf(EXT_MISSING)('BJ419 ① hotbar 顶部单行名带词缀（zh-Hans 官方格式逐字）', () => {
  it('武器+传奇：‹传奇›铁阔剑（旧裸名「铁阔剑」即红）', () => {
    const ui = mkUi({ id: SWORD, stack: 1, prefix: LEGENDARY });
    ui.refreshHotbar();
    expect(titleOf(ui)).toBe('‹传奇›铁阔剑');
  });

  it('配饰+暴力：‹暴力›鲨牙项链（用户实报「饰品」面同管）', () => {
    const ui = mkUi({ id: NECKLACE, stack: 1, prefix: VIOLENT });
    ui.refreshHotbar();
    expect(titleOf(ui)).toBe('‹暴力›鲨牙项链');
  });

  it('光标伪选中（镜像槽 58,SW-AZ1 面）：镜像词缀进名（不回读选中槽）', () => {
    const ui = mkUi({ id: SWORD, stack: 1 }, { id: SWORD, stack: 1, prefix: LEGENDARY });
    ui.refreshHotbar();
    expect(titleOf(ui)).toBe('‹传奇›铁阔剑');
  });
});

// ============ ② 零词缀/空手面逐字不变（本刀禁伤零变化白名单） ============
describe.skipIf(EXT_MISSING)('BJ419 ② 无词缀/空手回退不变', () => {
  it('无前缀武器 = 裸名「铁阔剑」（AffixName prefix≤0 → Name,Item.cs:1197-1199）', () => {
    const ui = mkUi({ id: SWORD, stack: 1 });
    ui.refreshHotbar();
    expect(titleOf(ui)).toBe('铁阔剑');
  });

  it('空手 = inter[37]「物品」（Name=="" 门 :44330 → inter[37] :44329 同序）', () => {
    const ui = mkUi(null);
    ui.refreshHotbar();
    expect(titleOf(ui)).toBe('物品');
  });
});

// ============ ③ 反编译重放哨（1457 原文;漂移/误删即红） ============
describe.skipIf(EXT_MISSING)('BJ419 ③ 反编译重放哨（1457;1458 同位同文锚）', () => {
  // ★C档可移植:缺档降级(describe 体收集期亦执行;EXT_MISSING skip 兜底)
  const mn = fs.existsSync(path.join(__dirname, '..', '..', 'Terarria1457', 'Terraria', 'Main.cs')) ? fs.readFileSync(path.join(__dirname, '..', '..', 'Terarria1457', 'Terraria', 'Main.cs'), 'utf8') : '';
  const im = fs.existsSync(path.join(__dirname, '..', '..', 'Terarria1457', 'Terraria', 'Item.cs')) ? fs.readFileSync(path.join(__dirname, '..', '..', 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8') : '';

  it('顶部名 = selectedItem.AffixName()（:44331;裸 .Name 面=病灶原语不存在）', () => {
    expect(mn).toContain('text = player[myPlayer].inventory[player[myPlayer].selectedItem].AffixName();');
  });

  it('空手门先于 AffixName（Name != "" → 否则 inter[37]）', () => {
    expect(mn).toContain('string text = Lang.inter[37].Value;');
    const i = mn.indexOf('text = player[myPlayer].inventory[player[myPlayer].selectedItem].AffixName();');
    expect(mn.slice(i - 400, i)).toContain('Name != ""');
  });

  it('热键栏悬停单行名 = inventory[i].AffixName() + " (stack)"（:44361-44364）', () => {
    expect(mn).toContain('hoverItemName = player[myPlayer].inventory[i].AffixName();');
    expect(mn).toContain('hoverItemName = hoverItemName + " (" + player[myPlayer].inventory[i].stack + ")";');
  });

  it('AffixName 本体 = GetPrefixedItemName（Item.cs:1195-1202;prefix 越界 → 裸名）', () => {
    const i = im.indexOf('public string AffixName()');
    const body = im.slice(i, im.indexOf('public void RebuildTooltip()', i));
    expect(body).toContain('if (prefix <= 0 || prefix >= Lang.prefix.Length)');
    expect(body).toContain('return Lang.GetPrefixedItemName(type, prefix);');
  });
});

// ============ ④ 同族普查结构锁（四个 AffixName 位全谱;任一位回退裸名即红） ============
describe.skipIf(EXT_MISSING)('BJ419 ④ 同族普查结构锁（AffixName 位全谱防回退）', () => {
  const uiSrc = () => fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'UI.ts'), 'utf8');
  const gameSrc = () => fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'Game.ts'), 'utf8');

  /** 函数体截取（bj407 ④ 同习语;截取锚漂移=爆红不静默放行） */
  const bodyOf = (src: string, decl: string, next: string): string => {
    const a = src.indexOf(decl);
    expect(a, `缺 ${decl}`).toBeGreaterThan(-1);
    const b = src.indexOf(next, a);
    expect(b, `缺 ${next}（${decl} 体截取锚）`).toBeGreaterThan(a);
    return src.slice(a, b);
  };

  it('① hotbar 顶部名：affixedItemName 接线在场（旧裸名直显面不复存在）', () => {
    const body = bodyOf(uiSrc(), 'refreshHotbar() {', 'syncInvGridGeometry()');
    expect(body).toContain('affixedItemName(held.prefix, name)');
    expect(body).toContain('Lang.inter(37)');
  });

  it('② tooltip 头行（buildTooltipHtml）：affixedItemName 在场（BJ390 面,防本刀连带回退）', () => {
    const body = bodyOf(uiSrc(), 'private buildTooltipHtml(', 'private showTooltipFor(');
    expect(body).toContain('affixedItemName(s.prefix, Lang.itemNameByKey(def.key))');
  });

  it('③ 掉落物悬停名：popupAffixName 在场（DrawMouseOver :43623 面）', () => {
    const body = bodyOf(gameSrc(), 'private tickHoverDropName(): void {', 'private tickHeldCursorIcon(');
    expect(body).toContain('popupAffixName(d.prefix,');
  });

  it('④ 拾取飘字：popupAffixName 在场（PopupText 合并身份面）', () => {
    const body = bodyOf(gameSrc(), 'showPickupLabel(itemKey: string', 'playSfx(name: string');
    expect(body).toContain('popupAffixName(prefix,');
  });
});
