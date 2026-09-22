// FX60 重铸连点回归(2026-09-17 用户实报「哥布林工匠重铸不能快速连点,两次点击间
// 要停顿」)。定谳:
//   根因 = vinv 锤钮 handler 每次重铸无条件 vinvReforgeCooldownUntil=now+1000ms;
//   原版节奏(Terarria1457/Terraria/Main.cs):
//     · :42370 mouseLeftRelease 边沿 + reforgeCooldown<=0 + BuyItem → 每击立即重铸
//     · :42626 reforgeCooldown=60 仅 rolledPrefixIsTopTier(最优档掷中)支内置位
//     · :42279 鼠标离锤(mouseReforge=false 支)reforgeCooldown=0 即清
//     · :17299-17301 每 tick 递减(60t@60fps=1000ms)
//   ⇒ 普通档零冷却=连点每击立即重铸;最优档 1s 弹跳锁+离锤豁免。
// 本文件三层锚:
//   ① Game.doReforge(item,out?) out.topTier 回传真实逻辑(蓝队 B13 同款 harness);
//   ② UI.vinvReforgeHammerHit 连击执行计数(真 UI 代码 Object.create 驱动,冷却
//      门/置位/失败路径全走真实现);
//   ③ DOM 接线源码锚(node 无 DOM env,mouseleave 清冷/监听委托以源码锚钉住)。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

// ---- 确定性 top-tier 词缀——只劫 rollPrefix 掷点,其余透传原模块(B13 同款) ----
const rollHook = vi.hoisted(() => ({ pick: null as null | ((pool: number[]) => number) }));
vi.mock('../src/data/vanillaPrefixes', async (importOriginal) => {
  const m = await importOriginal<typeof import('../src/data/vanillaPrefixes')>();
  const origRoll = m.rollPrefix;
  return {
    ...m,
    rollPrefix: (pool: number[], wantBest: boolean) =>
      rollHook.pick ? rollHook.pick(pool) : origRoll(pool, wantBest),
  };
});
beforeEach(() => { rollHook.pick = null; });

// ========================================================================
// 共用:挑一件可重铸物(池≥3)与 Game harness(蓝队 B13 makeGame 同构)
// ========================================================================
async function findReforgable() {
  const pfx = await vi.importActual<typeof import('../src/data/vanillaPrefixes')>(
    '../src/data/vanillaPrefixes');
  const { ITEM_BY_KEY, ITEM_DEFS } = await import('../src/data/items');
  const derVid = (k: string, idx: number): number => {
    const d = (ITEM_DEFS as unknown as Record<number, { vid?: number; key?: string } | undefined>)[idx];
    return d?.vid ?? -1;   // ★BJ283 parseInt 兜底退役(方案 A ⑥等价定谳)
  };
  for (const [key, idRaw] of Object.entries(ITEM_BY_KEY)) {
    const id = Number(idRaw);
    if (!Number.isFinite(id)) continue;
    const vid = derVid(key, id);
    if (!Number.isFinite(vid) || vid <= 0) continue;
    const pool = pfx.rollablePrefixes(vid, false);
    if (pool && pool.length >= 3) {
      const bestMul = Math.max(...pool.map(pfx.prefixValueMul));
      const top = pool.find((q) => pfx.prefixValueMul(q) === bestMul)!;
      const sub = pool.find((q) => pfx.prefixValueMul(q) !== bestMul)!;   // 非最优档样本
      return { id, vid, pool, top, sub };
    }
  }
  throw new Error('无可重铸物(池≥3)');
}

function makeGame(): { g: Record<string, unknown>; wav: string[] } {
  const wav: string[] = [];
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.player = new Player(60 * 16, 100 * 16, new Inventory());
  g.cb = {};
  g.sfx = { playWavFile: (name: string) => { wav.push(name); } };
  g.reforgeCost = () => 10;
  g.coinsOwned = () => 999999;
  g.spendCopper = () => true;
  g.spawnParticles = () => undefined;
  g.spawnDust = () => ({ vx: 0, vy: 0 });
  g.broadcastParticleOrchestra = () => undefined;
  return { g, wav };
}

// ========================================================================
// ① Game.doReforge out.topTier 回传(Main.cs:42620 rolledPrefixIsTopTier)
// ========================================================================
describe('FX60 ① doReforge out.topTier 回传', () => {
  it('最优档掷中 → out.topTier=true(单参旧调用兼容仍返回词缀号)', async () => {
    const pick = await findReforgable();
    rollHook.pick = () => pick.top;
    const { g } = makeGame();
    const out = { topTier: false };
    const np = (g as unknown as {
      doReforge(i: { id: number; stack: number; prefix?: number }, out?: { topTier: boolean }): number;
    }).doReforge({ id: pick.id, stack: 1 }, out);
    expect(np).toBe(pick.top);
    expect(out.topTier).toBe(true);
  });

  it('非最优档掷中 → out.topTier=false(原版普通档零冷却的判据源)', async () => {
    const pick = await findReforgable();
    rollHook.pick = () => pick.sub;
    const { g } = makeGame();
    const out = { topTier: false };
    (g as unknown as {
      doReforge(i: { id: number; stack: number; prefix?: number }, out?: { topTier: boolean }): number;
    }).doReforge({ id: pick.id, stack: 1 }, out);
    expect(out.topTier).toBe(false);
  });
});

// ========================================================================
// ② UI.vinvReforgeHammerHit 连击执行计数(真 UI 代码;冷却门全走真实现)
// ========================================================================
describe('FX60 ② 重铸锤连击执行计数(原版节奏=普通档每击立即重铸)', () => {
  function makeUI() {
    return import('../src/ui/UI').then(({ UI }) => {
      const ui = Object.create(UI.prototype) as unknown as Record<string, unknown>;
      // 运行期桩:toast/refreshAll 是 DOM 面(节点环境无 rAF/DOM),本测只锚决策面
      ui.toast = () => undefined;
      ui.refreshAll = () => undefined;
      ui.vinvReforgeCooldownUntil = 0;
      return ui;
    });
  }
  function bindGame(ui: Record<string, unknown>, opt: { topTier: boolean; np?: number }) {
    const calls: Array<{ item: unknown; out: { topTier: boolean } | undefined }> = [];
    const np = opt.np ?? 37;
    (ui as { game: unknown }).game = {
      reforgeCost: () => 10,
      coinsOwned: () => 999999,
      // ★BJ165:重铸反馈改走 PopupText 对齐链(Main.cs:42622 showPickupLabel 单源),
      //   旧自创 toast 退役——桩在此仅为让锤击决策面可达
      showPickupLabel: () => undefined,
      doReforge: (item: unknown, out?: { topTier: boolean }) => {
        calls.push({ item, out });
        if (out) out.topTier = opt.topTier;
        return np;
      },
    };
    return calls;
  }
  const hit = (ui: Record<string, unknown>) =>
    (ui as unknown as { vinvReforgeHammerHit: () => void }).vinvReforgeHammerHit();

  it('普通档:连点 5 击=5 次立即执行,零冷却滞留(用户实报主断言)', async () => {
    const ui = await makeUI();
    const calls = bindGame(ui, { topTier: false });
    (ui as { reforgeItem: unknown }).reforgeItem = { id: 1, stack: 1, prefix: 0 };
    for (let i = 0; i < 5; i++) hit(ui);   // 连点无间隔
    expect(calls).toHaveLength(5);         // 旧码=1(首次后 +1000ms 锁死)
    expect(ui.vinvReforgeCooldownUntil).toBe(0);   // 普通档零冷却(:42626 仅最优档置)
  });

  it('最优档:首击执行+置 1000ms 锁,窗口内连点被拦;离冷却窗恢复', async () => {
    const ui = await makeUI();
    const calls = bindGame(ui, { topTier: true });
    (ui as { reforgeItem: unknown }).reforgeItem = { id: 1, stack: 1, prefix: 0 };
    hit(ui);
    expect(calls).toHaveLength(1);
    const cd = ui.vinvReforgeCooldownUntil as number;
    expect(cd).toBeGreaterThanOrEqual(performance.now() + 999);   // 60t@60fps=1000ms(:42626)
    hit(ui);
    hit(ui);
    expect(calls).toHaveLength(1);         // 窗口内拦(原版弹跳锁同相)
    (ui as { vinvReforgeCooldownUntil: number }).vinvReforgeCooldownUntil = 0;
    hit(ui);
    expect(calls).toHaveLength(2);         // 冷却耗尽/离锤清后恢复
  });

  it('失败路径(np=-1)不置冷却(原版 ReforgeItemInReforgeSlot 未进入)', async () => {
    const ui = await makeUI();
    const calls = bindGame(ui, { topTier: true, np: -1 });
    (ui as { reforgeItem: unknown }).reforgeItem = { id: 1, stack: 1, prefix: 0 };
    for (let i = 0; i < 3; i++) hit(ui);
    expect(calls).toHaveLength(3);         // 每击都尝试,无一被冷却拦
    expect(ui.vinvReforgeCooldownUntil).toBe(0);
  });

  it('空槽/钱不够:门静默返回,零执行(原版 BuyItem 失败=静默 :42346)', async () => {
    const ui = await makeUI();
    const calls = bindGame(ui, { topTier: false });
    (ui as { reforgeItem: unknown }).reforgeItem = null;
    hit(ui);
    expect(calls).toHaveLength(0);
    (ui as { reforgeItem: unknown }).reforgeItem = { id: 1, stack: 1, prefix: 0 };
    (ui as { game: { coinsOwned: () => number } }).game.coinsOwned = () => 0;
    hit(ui);
    expect(calls).toHaveLength(0);
    expect(ui.vinvReforgeCooldownUntil).toBe(0);
  });
});

// ========================================================================
// ③ DOM 接线源码锚(node 无 DOM env;mousedown 委托/离锤清冷以源码钉住)
// ========================================================================
describe('FX60 ③ 锤钮 DOM 接线源码锚', () => {
  const src = readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '../src/ui/UI.ts'), 'utf8');

  it('锤钮 mousedown 委托 vinvReforgeHammerHit(边沿=每击一次)', () => {
    expect(src).toContain("hammer.addEventListener('mousedown', (e) => { e.stopPropagation(); this.vinvReforgeHammerHit(); });");
  });

  it('离锤清冷却(:42279 mouseReforge=false 支)——两面各一处', () => {
    expect(src).toContain('this.vinvReforgeCooldownUntil = 0;   // 离锤即清冷却');
    expect(src).toContain("doBtn.addEventListener('mouseleave', () => { this.vinvReforgeCooldownUntil = 0; })");
  });

  it('「+1000ms」冷却置位必须全部挂在 out.topTier 门下(变异哨:无条件置位即爆红)', () => {
    const lines = src.split('\n');
    const writes = lines.filter((l) => l.includes('= performance.now() + 1000;'));
    expect(writes.length).toBeGreaterThanOrEqual(2);   // 锤钮+modal 两面
    for (const l of writes) expect(l.trimStart().startsWith('if (out.topTier) ')).toBe(true);
  });

  it('锤击门序=冷却门先于费用门(原版 :42370 reforgeCooldown<=0 ∧ BuyItem)', () => {
    const m = src.indexOf('private vinvReforgeHammerHit');
    const body = src.slice(m, src.indexOf('\n  }', m));
    const cdGate = body.indexOf('vinvReforgeCooldownUntil) return');
    const costGate = body.indexOf('coinsOwned() < cost');
    expect(cdGate).toBeGreaterThan(-1);
    expect(costGate).toBeGreaterThan(cdGate);
  });
});
