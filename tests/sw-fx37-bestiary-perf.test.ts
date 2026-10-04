// SW-FX37 图鉴 UI 交互性能批 —— 修复语义钉(Node 纯逻辑;DOM 行为面由探针覆盖:
//   scripts/_fx37-bestiary-perf.mjs=帧界/CPU/微观计量,scripts/_bestiary-ui.mjs=面板结构/交互)。
// 三刀与证据(探针实测 /tmp/probe-out/_fx37-bestiary-perf 修前 vs fx37-fixed;变异证红 fx37-mutA/B/C):
//   A. 自愈补画 sweep 重做:逐画布 getImageData 判空(22-51ms 同步读回/次,每次交互后
//      400ms 必掉 1-2 vsync)→ painted 登记面 + bestiarySweepTargets 纯逻辑。
//   B. 条目卡点击=selectRow 只翻选中描边+重渲详情栏(原版 UIBestiaryTest.cs:486-495
//      SelectEntryButton 只 FillInfoForEntry,不重建网格)——details 段 ΔNodes 4992→96。
//   C. 锁形图贴图走 bstLoadSheet 共享缓存(原版 _notUnlockedTexture 预载一次逐帧重画)
//      ——fresh:details 段 GC 144.5→5.9ms。
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  bestiarySweepTargets, BST_LOCKED_ICON_SHEET, bestiaryRows,
  type BestiaryRow,
} from '../src/ui/BestiaryPanel';
import { BestiaryTracker, UnlockState, bestiaryEntries } from '../src/data/Bestiary';

function makeRow(creditId: string, npcId: number, state: UnlockState): BestiaryRow {
  const entry = bestiaryEntries().find((e) => e.creditId === creditId) ?? {
    id: 0, creditId, kind: 'enemy' as const, sources: [], goldGate: false,
  };
  return { entry, entryId: entry.id, npcId, state, name: 'x', kills: 0 };
}

describe('SW-FX37 Fix A: 自愈补画目标（painted 登记面）', () => {
  it('已落笔画布跳过,未落笔重试,空画布槽位丢弃', () => {
    const painted = new WeakSet<object>();
    const c1 = { id: 'c1' }, c2 = { id: 'c2' };
    painted.add(c1);   // c1 已画
    const rows = [makeRow('Zombie', 3, UnlockState.Stats)];
    const targets = bestiarySweepTargets(
      [
        { canvas: c1, creditId: 'Zombie' },          // 已画 → 不补
        { canvas: c2, creditId: 'Zombie' },          // 未画 → 补
        { canvas: null, creditId: 'Zombie' },        // 无画布格 → 丢弃
      ],
      rows, painted,
    );
    expect(targets).toHaveLength(1);
    expect(targets[0].canvas).toBe(c2);
    expect(targets[0].npcId).toBe(3);
    expect(targets[0].unlocked).toBe(true);
  });

  it('creditId 反查行;未知 creditId 不产生目标(与旧 working.find 等义,O(n) 建表)', () => {
    const rows = [makeRow('Zombie', 3, UnlockState.NotKnown), makeRow('EyeofCthulhu', 4, UnlockState.DropsWithRates)];
    const cA = {}, cB = {};
    const targets = bestiarySweepTargets(
      [
        { canvas: cA, creditId: 'EyeofCthulhu' },
        { canvas: cB, creditId: 'NotARow' },
      ],
      rows, new WeakSet(),
    );
    expect(targets).toHaveLength(1);
    expect(targets[0]).toEqual({ canvas: cA, npcId: 4, unlocked: true });
  });

  it('未解锁行(NotKnown)照补但 unlocked=false(锁形图重画语义,原版 Icon_Locked×0.15)', () => {
    const rows = [makeRow('Zombie', 3, UnlockState.NotKnown)];
    const c = {};
    const targets = bestiarySweepTargets([{ canvas: c, creditId: 'Zombie' }], rows, new WeakSet());
    expect(targets[0].unlocked).toBe(false);
  });

  it('真实条目表冒烟:全量 546+ 行 × 一页格,unlockState=NotKnown 全 false(新世界面)', () => {
    const tracker = new BestiaryTracker();
    const rows = bestiaryRows(tracker);
    expect(rows.length).toBeGreaterThan(500);
    const cells = rows.slice(0, 81).map((r) => ({ canvas: {}, creditId: r.entry.creditId }));
    const targets = bestiarySweepTargets(cells, rows, new WeakSet());
    expect(targets).toHaveLength(81);
    expect(targets.every((t) => !t.unlocked)).toBe(true);
  });
});

describe('SW-FX37 Fix C: 锁形图共享缓存贴图', () => {
  it('BST_LOCKED_ICON_SHEET 指向盘上真实资产(404→bstSheetFailed 负缓存→整面锁格空白)', () => {
    const p = fileURLToPath(new URL(`../public/sprites/${BST_LOCKED_ICON_SHEET}`, import.meta.url));
    expect(existsSync(p)).toBe(true);
    expect(BST_LOCKED_ICON_SHEET).toBe('vanilla-ui/UI_Bestiary_Icon_Locked.png');
  });
});
