// SW-N4 重铸飘字稀有度档位移清偿（红蓝-N4 清偿②;2026-09-20;BJ165 登记债执行）。
// 定谳：原版重铸飘字色 = GetEffectDetails.Rarity = newItem.rare 字段值
// （PopupText.cs PrepareEffects :388-404 → CraftingEffects.cs:64-69）——reforge
// 落词缀时 Item.Prefix :588-614 已把档位移烘进字段（≥1.2 +2 / ≥1.05 +1 /
// ≤0.8 −2 / ≤0.95 −1;rare>−11 钳 [−1,11]）。本仓 showPickupLabel 曾恒读基表
// （探针「神级迷你鲨」#96FF96=2 档绿,原版 2+2→4 档 (255,150,150)=BJ165 实报伪影）。
// 修刀：Game.showPickupLabel 增 rareOverride 覆写参 + 两重铸调用点（UI.ts classic
// doBtn / vinv 锤击）传 tooltipRareOf(·,np,{forPopup}) 产物（BJ125 单源链;
// forPopup=跳过④ MouseText −12 覆写——覆写是 MouseText 绘制期行为 Main.cs:20512-
// 20515,飘字链 PrepareEffects 读 Item.rare 字段值且 expert 走 somePopup.expert 旗
// 不改色;★S5 勘误（BJ263 2026-09-22）:原版 expert 飘字色=Disco 动色（PopupText.cs:
// 670-674 Main.DiscoR/G/B）,本仓静态稀有度画线=登记偏差,「expert=表色」判语作废;
// 专家配饰 3090 Royal Gel 可重铸,漏 forPopup → −12 白=新伪影,本网锁死）。
// 三层锚（FX60/sw-bj165 同构）：①Game 颜色面（Object.create(Game.prototype)）
// ②vinv 调用点全链（真 UI 代码 Object.create）③classic 调用点源码锚。
// 变异（传基表→红）：②捕获第 4 参,基表 2 ≠ 位移后 4 → 红;漏 forPopup → −12 → 红。
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Game } from '../src/core/Game';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';
import { prefixValueMul } from '../src/data/vanillaPrefixes';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const RARE = JSON.parse(readFileSync(join(HERE, '../src/data/vanilla-itemrare.json'), 'utf8')) as Record<string, number>;
const EXPERT = JSON.parse(readFileSync(join(HERE, '../src/data/vanilla-expert.json'), 'utf8')) as Record<string, number>;
const UI_SRC = readFileSync(join(HERE, '../src/ui/UI.ts'), 'utf8');
const GAME_SRC = readFileSync(join(HERE, '../src/core/Game.ts'), 'utf8');

/** vi_ 键 vid 解析（同 tooltipRareOf：parseInt(key.slice(3))） */
function vidOf(key: string): number { return parseInt(key.slice(3), 10); }
function findDefByVid(vid: number): { id: number; key: string } {
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i] as { key?: string } | undefined;
    if (d?.key?.startsWith('vi_') && vidOf(d.key) === vid) return { id: i, key: d.key };
  }
  throw new Error(`ITEM_DEFS 缺 vi_${vid}`);
}
/** 词缀档位移（Item.Prefix :588-614 阈值照录——期望值算子,非被测链） */
function shiftOf(prefix: number): number {
  const pv = prefixValueMul(prefix);
  if (pv >= 1.2) return 2;
  if (pv >= 1.05) return 1;
  if (pv <= 0.8) return -2;
  if (pv <= 0.95) return -1;
  return 0;
}
/** 首个 ≥1.2 档词缀（ legendary/godly 档族;动态取自 prefixValueMul 单源表） */
function findBigPrefix(): number {
  for (let p = 1; p <= 97; p++) if (prefixValueMul(p) >= 1.2) return p;
  throw new Error('prefixValueMul 表无 ≥1.2 档');
}

const MINISHARK = findDefByVid(98);    // 基表 rare 2,非专家（BJ165 实报样本）
const ROYAL_GEL = findDefByVid(3090);  // 基表 rare 2,专家旗 1（可重铸专家配饰=forPopup 面）
const BIG = findBigPrefix();

function makeGame(): Record<string, unknown> {
  const g = Object.create(Game.prototype) as Record<string, unknown>;
  g.dmgNumbers = [];
  g.player = { cx: 0, y: 0 };
  return g;
}

// ========================================================================
// ① Game.showPickupLabel 颜色面
// ========================================================================
describe('SW-N4 ① showPickupLabel rareOverride 覆写面（PopupText PrepareEffects :388-404）', () => {
  it('覆写=位移后档位：迷你鲨 2+2 → 4 档 (255,150,150)（基表绿=伪影）', () => {
    const g = makeGame();
    const rare = RARE['98'] + shiftOf(BIG);
    expect(RARE['98']).toBe(2);
    expect(rare).toBe(4);
    (g as { showPickupLabel: (k: string, n?: number, p?: number, r?: number) => void })
      .showPickupLabel(MINISHARK.key, 1, BIG, rare);
    const d = (g as { dmgNumbers: Array<{ color: string }> }).dmgNumbers;
    expect(d).toHaveLength(1);
    expect(d[0].color).toBe('#FF9696');   // Item.GetPopupRarityColor(4) Item.cs:662-665
  });

  it('缺省=基表 rare（普通拾取同相）:2 档 #96FF96', () => {
    const g = makeGame();
    (g as { showPickupLabel: (k: string, n?: number) => void }).showPickupLabel(MINISHARK.key, 1);
    const d = (g as { dmgNumbers: Array<{ color: string }> }).dmgNumbers;
    expect(d[0].color).toBe('#96FF96');   // GetPopupRarityColor(2) Item.cs:652-655
  });

  it('覆写 0=合法档位（?? 不误吞,|| 会错吞成基表）→ 白', () => {
    const g = makeGame();
    (g as { showPickupLabel: (k: string, n?: number, p?: number, r?: number) => void })
      .showPickupLabel(MINISHARK.key, 1, undefined, 0);
    const d = (g as { dmgNumbers: Array<{ color: string }> }).dmgNumbers;
    expect(d[0].color).toBe('#FFFFFF');   // 0 档不在表,非 ≥11 → 缺省白
  });

  it('合并支同用覆写色:同 key+词缀再弹 → stack 合并且色恒位移档（「名 (3)」同相）', () => {
    const g = makeGame();
    const s = g as { showPickupLabel: (k: string, n?: number, p?: number, r?: number) => void };
    const rare = RARE['98'] + shiftOf(BIG);
    s.showPickupLabel(MINISHARK.key, 1, BIG, rare);
    s.showPickupLabel(MINISHARK.key, 2, BIG, rare);
    const d = (g as { dmgNumbers: Array<{ color: string; stack: number; label: string }> }).dmgNumbers;
    expect(d).toHaveLength(1);
    expect(d[0].stack).toBe(3);
    expect(d[0].label).toContain('(3)');   // noStack 语义:计数面同相（BJ173 登记）
    expect(d[0].color).toBe('#FF9696');
  });
});

// ========================================================================
// ② vinv 锤击调用点全链（真 UI 代码;专家配饰 3090 = forPopup 面可达性证物）
// ========================================================================
describe('SW-N4 ② vinv 调用点传 tooltipRareOf(·,np,{forPopup}) 产物', () => {
  async function makeUI() {
    const { UI } = await import('../src/ui/UI');
    const ui = Object.create(UI.prototype) as unknown as Record<string, unknown>;
    ui.toast = vi.fn();
    ui.refreshAll = () => undefined;
    ui.vinvReforgeCooldownUntil = 0;
    return ui;
  }

  it('专家配饰 3090 可达性证物（expert=1 ∧ 基表 2）', () => {
    expect(EXPERT['3090']).toBe(1);
    expect(RARE['3090']).toBe(2);
    expect(ITEM_BY_KEY[ROYAL_GEL.key]).toBe(ROYAL_GEL.id);
  });

  it('锤击 → 第4参 = 基表+位移=4（传基表 2 / 漏 forPopup −12 / 缺参 undefined 各自红）', async () => {
    const ui = await makeUI();
    const calls: Array<{ key: string; picked: number; prefix: number; rare: number }> = [];
    ui.game = {
      reforgeCost: () => 10,
      coinsOwned: () => 9999999,
      doReforge: (item: { prefix?: number }, out?: { topTier: boolean }) => {
        item.prefix = BIG;
        if (out) out.topTier = false;
        return BIG;
      },
      showPickupLabel: (key: string, picked: number, prefix: number, rare: number) => {
        calls.push({ key, picked, prefix, rare });
      },
    };
    ui.reforgeItem = { id: ROYAL_GEL.id, stack: 1, prefix: 0 };
    (ui as unknown as { vinvReforgeHammerHit: () => void }).vinvReforgeHammerHit();
    expect(calls).toEqual([{
      key: ROYAL_GEL.key,
      picked: 1,
      prefix: BIG,
      rare: RARE['3090'] + shiftOf(BIG),   // =4;基表读法=2/漏 forPopup=−12/缺参=undefined → 各自爆红
    }]);
  }, 60000);   // 首测承担 UI.ts 模块整载（node env 动态 import ~7s,默认 5s 伪红——BJ165 同注）
});

// ========================================================================
// ③ classic 调用点 + Game 签名源码锚（sw-bj165 源码锚习语）
// ========================================================================
describe('SW-N4 ③ 调用点/签名源码锚（变异哨）', () => {
  it('classic doBtn（showReforge 体）传 tooltipRareOf forPopup 产物', () => {
    const m = UI_SRC.indexOf('showReforge(): void');
    const body = UI_SRC.slice(m, UI_SRC.indexOf('private refreshReforge', m));
    expect(body).toContain('showPickupLabel(rdef.key, this.reforgeItem.stack, np');
    expect(body).toContain('this.tooltipRareOf(rdef, np, { forPopup: true })');
  });

  it('vinv 锤击体同刀（双调用点同源,摘任一即红）', () => {
    const m = UI_SRC.indexOf('private vinvReforgeHammerHit');
    const body = UI_SRC.slice(m, UI_SRC.indexOf('\n  }', m));
    expect(body).toContain('showPickupLabel(rdef.key, this.reforgeItem.stack, np');
    expect(body).toContain('this.tooltipRareOf(rdef, np, { forPopup: true })');
  });

  it('Game.showPickupLabel 签名含 rareOverride 覆写参（?? 合并,非 |）', () => {
    expect(GAME_SRC).toContain(
      'showPickupLabel(itemKey: string, picked = 1, prefix?: number, rareOverride?: number) {');
    expect(GAME_SRC).toContain('const rare = rareOverride');
  });
});
