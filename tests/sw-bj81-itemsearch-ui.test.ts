// ★SW-BJ81 2026-09-14 —— 道具搜索/天气/时间面板六点用户规格守卫。
// 本面 = FX39 停车坪自创 QoL（main.ts openInGamePause onItemSearch/onWeather/onTime
// 入口），原版无对应物——几何判据 = 「不与物品栏占位面重叠 + 在视口内」
// （vanillaInvLayout 既有单源），交互判据 = 用户令（规格①..⑥），1457 仅作惯例参照。
//
// 覆盖面：
//   规格① 天气/时间面板显式关闭钮（Renderer 结构锁 + l10n 键）
//   规格② 搜出项取件数量恒 1（searchGrabPlan 行为锁 + 旧「整组」面废止锁）
//   规格③ 搜索浮窗几何（缩窄右移、物品栏占位面之外、窄窗视口内）
//   规格④ 开搜索必带出物品栏（openInventory(true) 接线锁）
//   规格⑤ 点搜出项=上光标（合成抓取通道 grantCraftToCursor + 落点豁免面）
//   规格⑥ 长按连取（125ms 节奏单源 + 三面停摆：松开/滑出/关面板）
//
// 变异证红纪律：几何常量/接线锚/关闭钮行任一漂移即红（人工变异 ITEMSEARCH_W→560、
// 摘 Renderer ✕ 行均须爆红后还原）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  gridHitRect, coinSlotXY, ammoSlotXY, EQUIP_COL_X, ITEMSEARCH_X, ITEMSEARCH_Y,
  ITEMSEARCH_W, ITEMSEARCH_W_MIN, ITEMSEARCH_RIGHT_GUARD, ITEMSEARCH_H_MAX,
  itemSearchPanelRect,
} from '../src/ui/vanillaInvLayout';
import { ITEMSEARCH_GRAB_INTERVAL_MS, ITEMSEARCH_GRAB_COUNT, searchGrabPlan } from '../src/ui/itemSearch';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const uiSrc = read('src/ui/UI.ts');
const rendererSrc = read('src/render/Renderer.ts');

/** AABB 相交（逻辑空间;贴边不算交） */
const intersects = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ============================================================
// ③ 搜索浮窗几何（vanillaInvLayout 单源;物理 px = 逻辑 × K）
// ============================================================
describe('SW-BJ81 ③搜索浮窗几何（规格:缩小+右移,不与物品栏占位面重叠）', () => {
  it('常量档（规格③锚）:340 宽 < 旧 560;左缘 610 > 钱币/弹药列右缘', () => {
    expect(ITEMSEARCH_W).toBe(340);
    expect(ITEMSEARCH_X).toBe(610);
    expect(ITEMSEARCH_Y).toBe(20);
    expect(ITEMSEARCH_RIGHT_GUARD).toBe(208);
    expect(ITEMSEARCH_W_MIN).toBe(220);
    expect(ITEMSEARCH_H_MAX).toBe(460);
  });

  it('桌面 1920×1080(K=1):右置浮窗,与网格/钱币弹药列/装备列三面零交', () => {
    const r = itemSearchPanelRect(1920, 1080, 1);
    expect(r).toEqual({ x: 610, y: 20, w: 340, h: 460 });
    const grid = gridHitRect();                                  // 20..496 × 20..258
    expect(intersects(r, grid)).toBe(false);
    expect(r.x).toBeGreaterThanOrEqual(grid.x + grid.w);         // 网格右缘之外
    const ammoRight = ammoSlotXY(0).x + 52;                      // 534+52=586
    expect(r.x).toBeGreaterThanOrEqual(ammoRight);               // 钱币/弹药列右缘之外
    const equipLeft = EQUIP_COL_X(1920);                         // sw-92=1828;染料列 1734 最左
    expect(r.x + r.w).toBeLessThanOrEqual(equipLeft - 186 - 8);  // 右缘护栏(染料列-间距)
  });

  it('1280×800(K=1):同逻辑档,装备列(1094)之外', () => {
    const r = itemSearchPanelRect(1280, 800, 1);
    expect(r.w).toBe(340);
    expect(r.x + r.w).toBeLessThanOrEqual(1280 - 186 - 8);
    expect(intersects(r, gridHitRect())).toBe(false);
  });

  it('窄逻辑宽 1024:宽钳下限档,仍不越装备列', () => {
    const r = itemSearchPanelRect(1024, 780, 1);   // K=1 → sw=1024
    expect(r.w).toBe(220);                          // min(340, 1024-610-208=206) → 钳 W_MIN
    expect(r.x).toBe(610);
    expect(r.x + r.w).toBeLessThanOrEqual(1024 - 186 - 8);   // 830 ≤ 830(护栏恰成立)
  });

  it('逻辑宽下限 720:视口内优先,网格右缘(496)仍不让', () => {
    const r = itemSearchPanelRect(720, 800, 1);    // K=1 → sw=720
    expect(r.x).toBeGreaterThanOrEqual(gridHitRect().x + gridHitRect().w);   // 496
    expect(r.x + r.w).toBeLessThanOrEqual(720 - 4);                           // 视口内
    expect(intersects(r, gridHitRect())).toBe(false);
    // 此档允许压住钱币/弹药列（sw 下限下无空档——退化序:先视口内,后不重叠）
  });

  it('竖屏 390×844(K=0.5417):物理矩形整体在视口内,右缘不出屏', () => {
    const r = itemSearchPanelRect(390, 844, 1);
    expect(r.x).toBeGreaterThan(0);
    expect(r.x + r.w).toBeLessThanOrEqual(390);
    expect(r.y + r.h).toBeLessThanOrEqual(844);
  });

  it('uiScale 0.75:物理位随 K 收缩,与网格零交(网格矩形同步 ×K 后比)', () => {
    const r = itemSearchPanelRect(1920, 1080, 0.75);
    const K = 0.75 * Math.min(1, 1920 / 720, 1080 / 780);   // = 0.75
    expect(r.x).toBeCloseTo(610 * K, 6);
    expect(r.w).toBeCloseTo(340 * K, 6);
    const g = gridHitRect();   // 逻辑占位面 → 物理 = ×K(坐标空间归一)
    expect(intersects(r, { x: g.x * K, y: g.y * K, w: g.w * K, h: g.h * K })).toBe(false);
  });
});

// ============================================================
// ②⑤ 取件规则（itemSearch 纯函数单源;canMergeStack 谓词复用）
// ============================================================
describe('SW-BJ81 ②⑤取件规则(数量恒1;上光标/兜底入包路由)', () => {
  it('规格②:单次取件量恒 1(旧 min(maxStack,99) 整组面废止)', () => {
    expect(ITEMSEARCH_GRAB_COUNT).toBe(1);
    expect(searchGrabPlan(null, 75)).toEqual({ to: 'cursor', stack: 1 });
    expect(searchGrabPlan({ id: 75, stack: 30 }, 75)).toEqual({ to: 'cursor', stack: 1 });
  });

  it('规格⑤:光标空/同物 → cursor 通道(grantCraftToCursor 合成抓取同款)', () => {
    expect(searchGrabPlan(null, 50)).toEqual({ to: 'cursor', stack: 1 });
    expect(searchGrabPlan({ id: 50, stack: 5 }, 50)).toEqual({ to: 'cursor', stack: 1 });
  });

  it('光标被异型占据 → inventory 兜底(覆盖光标=静默丢玩家持物,禁)', () => {
    expect(searchGrabPlan({ id: 7, stack: 2 }, 50)).toEqual({ to: 'inventory', stack: 1 });
  });

  it('同型异词缀 = 异型(canMergeStack 词缀位;词缀随光标流转不清洗)', () => {
    expect(searchGrabPlan({ id: 50, stack: 1, prefix: 4 }, 50)).toEqual({ to: 'inventory', stack: 1 });
    // undefined ≈ 0 归一(SW-AY1 R1 既有约定):无词缀光标收无词缀取件
    expect(searchGrabPlan({ id: 50, stack: 1 }, 50)).toEqual({ to: 'cursor', stack: 1 });
    expect(searchGrabPlan({ id: 50, stack: 1, prefix: 0 }, 50)).toEqual({ to: 'cursor', stack: 1 });
  });

  it('规格⑥:连取节奏 125ms/件 ≈ 8 件/s(用户规格档;合成面无按住连加先例)', () => {
    expect(ITEMSEARCH_GRAB_INTERVAL_MS).toBe(125);
  });
});

// ============================================================
// ④⑤⑥ UI 接线结构锁（源文本锚,变异即红）
// ============================================================
describe('SW-BJ81 ④⑤⑥UI 接线结构锁', () => {
  it('规格④:openItemSearchPanel 首步 openInventory(true)(开搜索必带出物品栏)', () => {
    expect(uiSrc).toMatch(
      /规格④:开搜索必带出物品栏[\s\S]{0,220}this\.openInventory\(true\);/,
    );
  });

  it('规格⑤:取件走 grantCraftToCursor 光标通道 + markCursorGlow/moveGhost(合成同款反馈)', () => {
    expect(uiSrc).toMatch(
      /private itemSearchGrab\(id: number\): void \{[\s\S]{0,420}searchGrabPlan\(this\.heldStack, id\)[\s\S]{0,300}this\.grantCraftToCursor\(id, plan\.stack\);[\s\S]{0,200}this\.markCursorGlow\(id\);[\s\S]{0,120}this\.moveGhost\(\);/,
    );
  });

  it('规格⑤:条目按下即取+长按起拍;旧 click 整组授予废止', () => {
    expect(uiSrc).toMatch(
      /item\.addEventListener\('mousedown', \(ev\) => \{[\s\S]{0,120}this\.itemSearchGrab\(e\.id\);[\s\S]{0,120}this\.startItemSearchGrabRepeat\(e\.id\);/,
    );
    // 旧「给一组(≤99)」授予表达式已摘(整组面废止,数量恒 1)
    expect(uiSrc).not.toMatch(/const n = e\.d\.maxStack > 1 \? Math\.min\(e\.d\.maxStack, 99\) : 1;/);
  });

  it('规格⑥:三面停摆(条目 mouseup/mouseleave + closeItemSearch 兜底)', () => {
    expect(uiSrc).toMatch(/item\.addEventListener\('mouseup', \(\) => this\.stopItemSearchGrabRepeat\(\)\);/);
    expect(uiSrc).toMatch(/item\.addEventListener\('mouseleave', \(\) => this\.stopItemSearchGrabRepeat\(\)\);/);
    expect(uiSrc).toMatch(/closeItemSearch\(\) \{(?:[^\n]*\n){0,3}\s*this\.stopItemSearchGrabRepeat\(\);/);
  });

  it('规格⑤残留处置:closeItemSearch 不动 heldStack(合成面板关闭惯例——关背包才归还)', () => {
    const i = uiSrc.indexOf('closeItemSearch() {');
    const body = uiSrc.slice(i, uiSrc.indexOf('\n  }\n', i));
    expect(body).not.toContain('heldStack');
  });

  it('浮窗入面板豁免面(document 光标持物监听 + resolveDrop 面板域)', () => {
    expect(uiSrc).toMatch(/\.sw-slot, \.sw-panel, \.sw-btn, \.sw-eqdock, \.sw-vinv, \.sw-itemsearch/);
    expect(uiSrc).toMatch(/\.sw-panel, \.sw-eqdock, \.sw-vinv, \.sw-itemsearch/);
  });

  it('模态面废止:全屏压暗底/inset:0/z1200 不再属于搜索面板', () => {
    const i = uiSrc.indexOf('private openItemSearchPanel()');
    const body = uiSrc.slice(i, uiSrc.indexOf('\n  closeItemSearch()', i));
    expect(body).not.toMatch(/inset:0/);
    expect(body).not.toMatch(/rgba\(0,0,0,0\.55\)/);
    expect(body).toMatch(/\.sw-itemsearch/);
    expect(body).toMatch(/itemSearchPanelRect\(window\.innerWidth, window\.innerHeight, options\.data\.uiScale\)/);
  });
});

// ============================================================
// ① 天气/时间面板显式关闭钮（Renderer 结构锁）
// ============================================================
describe('SW-BJ81 ①天气/时间面板显式关闭钮', () => {
  it('时间面板:标题行(Lang) + 面板内 ✕ 关闭钮(单义置 false)', () => {
    expect(rendererSrc).toMatch(/Lang\.text\('Mods\.SandboxWorld\.UI\.TimePanel\.Title'\)/);
    expect(rendererSrc).toMatch(
      /box\(px \+ pw - 26, py \+ 5, 20, 20, '✕', \(\) => \{ this\.timePanelOpen = false; \}\);/,
    );
  });

  it('时间面板加高 64→88(标题行让位),命中区随行', () => {
    expect(rendererSrc).toMatch(/const px = ox, py = oy \+ 276, pw = size, ph = 88;/);
    expect(rendererSrc).toMatch(/hit\(ox, oy \+ 276, size, 88\)/);
    expect(rendererSrc).not.toMatch(/const px = ox, py = oy \+ 276, pw = size, ph = 64;/);
  });

  it('天气面板:标题行(Lang) + 面板内 ✕ 关闭钮(单义置 false)', () => {
    expect(rendererSrc).toMatch(/Lang\.text\('Mods\.SandboxWorld\.UI\.WeatherPanel\.Title'\)/);
    expect(rendererSrc).toMatch(
      /box2\(px2 \+ pw2 - 26, py2 \+ 5, 20, 20, '✕', \(\) => \{ this\.weatherPanelOpen = false; \}\);/,
    );
  });

  it('天气面板加高 112→136 + 叠放下移 72→96(时间面板 88+8),命中区随行', () => {
    expect(rendererSrc).toMatch(/const wPanelY = oy \+ 276 \+ \(this\.timePanelOpen \? 96 : 0\);/);
    expect(rendererSrc).toMatch(/const wPanelH = 136;/);
    expect(rendererSrc).not.toMatch(/const wPanelH = 112;/);
  });

  it('天气面板内容行随标题下移(预设 34 起/风行 88/风力钮 112),不出面板', () => {
    expect(rendererSrc).toMatch(/box2\(px2 \+ 10 \+ col \* 56, py2 \+ 34 \+ row \* 26, 52, 22,/);
    expect(rendererSrc).toMatch(/box2\(px2 \+ 10, py2 \+ 88, 100, 20,/);
    expect(rendererSrc).toMatch(/box2\(px2 \+ 8, py2 \+ 112, 52, 18, '− 风'/);
    expect(rendererSrc).toMatch(/box2\(px2 \+ pw2 - 60, py2 \+ 112, 52, 18, '\+ 风'/);
  });
});

// ============================================================
// l10n 产物闸门(l10n-audit 同域:新增键必须先落 custom 再重建)
// ============================================================
describe('SW-BJ81 l10n 键产物', () => {
  const KEYS = [
    'SandboxWorld.UI.ItemSearch.Title',
    'SandboxWorld.UI.TimePanel.Title',
    'SandboxWorld.UI.WeatherPanel.Title',
  ];
  for (const cult of ['zh-Hans', 'en-US'] as const) {
    it(`${cult}: 三键在位(Mods 类别)`, () => {
      const pack = JSON.parse(readFileSync(join(ROOT, `public/l10n/${cult}.json`), 'utf8')) as Record<string, Record<string, string>>;
      for (const k of KEYS) {
        expect(typeof pack.Mods?.[k]).toBe('string');
        expect((pack.Mods?.[k] ?? '').length).toBeGreaterThan(0);
      }
    });
  }
});
