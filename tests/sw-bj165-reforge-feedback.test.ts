// BJ165 重铸反馈三件实报回归(2026-09-19 用户实报:重铸界面三件)。定谳锚:
//   ① 重铸成功反馈格式错:自创 toast「花费: 250000 · 粗笨」(直出铜值+孤立前缀名)。
//     原版 = ReforgeItemInReforgeSlot(Main.cs:42618-42656):PopupText.NewText(
//     ItemReforge/_Best, reforgeItem, player.Center, stack, noStack:true)——AffixName
//     飘字(新词缀+本名,玩家位,稀有度色);无任何重铸后费用提示,费用恒走常驻
//     币制分解行(:42288-42322,vinv=(100,270) vinvCoinSpans 四档币色)。本仓
//     PopupText.NewText 对齐链单源 = Game.showPickupLabel(拾取飘字同链)。
//     ★登记债:showPickupLabel 颜色=基表 rare,未做词缀档位移(原版 PopupText 色=
//     CraftingEffects.GetEffectDetails :64-69 Rarity=item.rare 含 Prefix(-2) 位移);
//     修法=showPickupLabel 增 rare 覆写参(Game.ts 域,本刀文件域外)。
//   ② 黄渐变小方块(界面外左下孤悬/隐藏配方面不随隐)= 合成视图切换钮的金标指示条
//     (32×20 canvas,UI.ts CRAFT_BAR_COLOR='255,23169'→'255,231,69' 16 行 2px 渐变
//     α=(1-k/16)·0.6+实心 32×4)。原版画点 = CraftingUI.DrawGridToggle(CraftingUI.cs:
//     275-277),其经典锚调用在 Main.cs:42418 `else if (!InReforgeMenu && …)` 整支内
//     =重铸态不画(就近箱钮 UI.ts:8038/切换钮 :8211 同门早已有,指示条漏门=孤悬)。
//     窗开态锚在 NewCraftingUI.DrawChildren :489(窗自画,不折重铸)=modern 支不设门。
//   ③ 钱不足:定谳=原版【静默】(Main.cs:42370-42378 mouseLeftRelease ∧ cooldown<=0 ∧
//     BuyItem(num55) 假→无重铸,无文案/无音效;费用行恒 White 不分档;Player.BuyItem
//     :35681 仅 return false)。本仓 vinv 锤击门 :9771 静默=原版同相不动刀(FX60 ②
//     「空槽/钱不够」用例继续锁门);真缺口=锤悬停应答面整缺(:42371-42374
//     hoverItemName=inter[19] MouseText + !mouseReforge→PlaySound(12))→补 hover 名
//     +menuTick。classic modal 的 TooExpensive toast=自创面登记偏差(modal 本身为
//     登记自创 UI,不属 vinv 1:1 面)。
// 本文件三层锚(FX60 同构):①锤击反馈决策面(真 UI 代码 Object.create)②指示条
// 重铸门源码锚(变异哨)③悬停应答面源码锚。
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const UI_SRC = readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '../src/ui/UI.ts'), 'utf8');

async function pickViDef(): Promise<{ id: number; key: string }> {
  const { ITEM_DEFS } = await import('../src/data/items');
  const defs = ITEM_DEFS as unknown as Array<{ key?: string; vid?: number } | undefined>;
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    if (d?.key && d.key.startsWith('vi_') && (d.vid ?? -1) > 0) return { id: i, key: d.key };
  }
  throw new Error('无 vi_ 物品(ITEM_DEFS 未填充?)');
}

// ========================================================================
// ① 锤击反馈决策面(真 UI 代码 Object.create;FX60 ② 同构 harness)
// ========================================================================
describe('BJ165 ① 重铸成功反馈=PopupText 对齐链(Main.cs:42622),零自创 toast', () => {
  function makeUI() {
    return import('../src/ui/UI').then(({ UI }) => {
      const ui = Object.create(UI.prototype) as unknown as Record<string, unknown>;
      ui.toast = vi.fn();                       // 自创 toast 面:本批退役,全程不得触达
      ui.refreshAll = () => undefined;
      ui.vinvReforgeCooldownUntil = 0;
      return ui;
    });
  }
  const hit = (ui: Record<string, unknown>) =>
    (ui as unknown as { vinvReforgeHammerHit: () => void }).vinvReforgeHammerHit();

  it('成功 → showPickupLabel(AffixName 链,key/stack/新词缀),toast 零调用', async () => {
    const ui = await makeUI();
    const def = await pickViDef();
    const popups: Array<{ key: string; picked: number; prefix: number }> = [];
    (ui as { game: unknown }).game = {
      reforgeCost: () => 250000,
      coinsOwned: () => 9999999,
      showPickupLabel: (key: string, picked: number, prefix: number) => { popups.push({ key, picked, prefix }); },
      doReforge: (item: { prefix?: number }, out?: { topTier: boolean }) => {
        item.prefix = 44;
        if (out) out.topTier = false;
        return 44;
      },
    };
    (ui as { reforgeItem: unknown }).reforgeItem = { id: def.id, stack: 1, prefix: 0 };
    hit(ui);
    expect(popups).toEqual([{ key: def.key, picked: 1, prefix: 44 }]);
    expect(ui.toast).not.toHaveBeenCalled();
  }, 60000);   // 首测承担 UI.ts 模块整载(node env 动态 import ~7s,默认 5s 伪红)

  it('整组重铸(stack=3)→ 飘字带整组计数(NewText(…,reforgeItem.stack,noStack:true))', async () => {
    const ui = await makeUI();
    const def = await pickViDef();
    const popups: Array<{ key: string; picked: number; prefix: number }> = [];
    (ui as { game: unknown }).game = {
      reforgeCost: () => 10,
      coinsOwned: () => 9999999,
      showPickupLabel: (key: string, picked: number, prefix: number) => { popups.push({ key, picked, prefix }); },
      doReforge: (item: { prefix?: number }, out?: { topTier: boolean }) => {
        item.prefix = 33;
        if (out) out.topTier = false;
        return 33;
      },
    };
    (ui as { reforgeItem: unknown }).reforgeItem = { id: def.id, stack: 3, prefix: 0 };
    hit(ui);
    expect(popups).toEqual([{ key: def.key, picked: 3, prefix: 33 }]);
  });

  it('失败(np=-1)→ 无飘字无 toast(原版 ReforgeItemInReforgeSlot 未进入)', async () => {
    const ui = await makeUI();
    const def = await pickViDef();
    const popups: unknown[] = [];
    (ui as { game: unknown }).game = {
      reforgeCost: () => 10,
      coinsOwned: () => 9999999,
      showPickupLabel: (..._a: unknown[]) => { popups.push(1); },
      doReforge: () => -1,
    };
    (ui as { reforgeItem: unknown }).reforgeItem = { id: def.id, stack: 1, prefix: 0 };
    hit(ui);
    expect(popups).toHaveLength(0);
    expect(ui.toast).not.toHaveBeenCalled();
    expect(ui.vinvReforgeCooldownUntil).toBe(0);
  });

  it('classic modal doBtn 同刀(showReforge 体走 showPickupLabel)——源码锚', async () => {
    const m = UI_SRC.indexOf('showReforge(): void');
    const body = UI_SRC.slice(m, UI_SRC.indexOf('private refreshReforge', m));
    expect(body).toContain('showPickupLabel');
  });

  it('自创格式串全文件退役(变异哨:回灌「花费: N · 前缀」toast 即爆红)', () => {
    expect(UI_SRC).not.toContain('· ${prefixDisplayName(np)}');
  });
});

// ========================================================================
// ② 金标指示条重铸态整隐(Main.cs:42418 else-if !InReforgeMenu 整支)
// ========================================================================
describe('BJ165 ② 指示条重铸门(黄渐变块孤悬根因;源码锚=变异哨)', () => {
  // vinvBuildGridToggle 体 = 金标指示条 canvas + 切换钮两份布局注册
  const fnStart = UI_SRC.indexOf('private vinvBuildGridToggle');
  const fnEnd = UI_SRC.indexOf('private vinvSyncGridToggle', fnStart);
  const body = UI_SRC.slice(fnStart, fnEnd);

  it('指示条 pos 回调含重铸门(vinvReforgeVisible → null)', () => {
    const barStart = body.indexOf('el: bar, pos: () => {');
    expect(barStart).toBeGreaterThan(-1);
    const barBody = body.slice(barStart, body.indexOf('} });', barStart));
    expect(barBody).toContain('if (this.vinvReforgeVisible()) return null;');
  });

  it('门序 = modern 支【后】/guide 支【前】(窗自画不折重铸 NewCraftingUI.cs:489;'
    + 'guide+classic 锚在 Main.cs:42418 重铸互斥支内)', () => {
    const barStart = body.indexOf('el: bar, pos: () => {');
    const barBody = body.slice(barStart, body.indexOf('} });', barStart));
    const idxModern = barBody.indexOf('this.vinvModernCraftOpen');
    const idxGate = barBody.indexOf('this.vinvReforgeVisible()');
    const idxGuide = barBody.indexOf('this.vinvGuideMenuOpen');
    expect(idxModern).toBeGreaterThan(-1);
    expect(idxGate).toBeGreaterThan(idxModern);
    expect(idxGuide).toBeGreaterThan(idxGate);
  });

  it('vnvBuildGridToggle 域内重铸门恰两处(条+切换钮;摘任一门即爆红)', () => {
    const n = body.split('if (this.vinvReforgeVisible()) return null;').length - 1;
    expect(n).toBe(2);
  });
});

// ========================================================================
// ③ 锤悬停应答面(:42371-42374 hoverItemName=inter[19]+PlaySound(12))+静默判例
// ========================================================================
describe('BJ165 ③ 锤悬停应答面(原版缺口补齐)+钱不足静默判例', () => {
  const fnStart = UI_SRC.indexOf('private vinvBuildReforge');
  const fnEnd = UI_SRC.indexOf('private vinvReforgeHammerHit', fnStart);
  const body = UI_SRC.slice(fnStart, fnEnd);

  it('悬停进 = menuTick + 悬停名「重铸」(inter[19];:42371-42373)', () => {
    const enterStart = body.indexOf("hammer.addEventListener('mouseenter'");
    const enterBody = body.slice(enterStart, body.indexOf("});", enterStart));
    expect(enterBody).toContain("this.game.sfx.play('menuTick', 1)");
    expect(enterBody).toContain("this.showBuffTooltip(hammer, Lang.inter(19), '')");
  });

  it('悬停出 = hideBuffTooltip 对称(:42383 mouseReforge=false 支)', () => {
    const leaveStart = body.indexOf("hammer.addEventListener('mouseleave'");
    const leaveBody = body.slice(leaveStart, body.indexOf("});", leaveStart));
    expect(leaveBody).toContain('this.hideBuffTooltip()');
    expect(leaveBody).toContain('this.vinvReforgeCooldownUntil = 0');
  });

  it('锤击决策面零 toast(钱不足静默=原版同相判例;变异哨:回灌提示即爆红)', () => {
    const hitStart = UI_SRC.indexOf('private vinvReforgeHammerHit');
    const hitBody = UI_SRC.slice(hitStart, UI_SRC.indexOf('\n  }', hitStart));
    expect(hitBody).not.toContain('.toast(');
    expect(hitBody).toContain('coinsOwned() < cost');
    expect(hitBody).toContain('showPickupLabel');
  });
});
