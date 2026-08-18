// ITEM_DEFS 内部 id = 数组下标——任何在自动注册循环【前】插入 item() 的条目都会
// 把后续全部物品 id 平移，按内部 id 反查 vid 的链路（掉落/图鉴图标/存档）全体错位
// （2026-08-18 "金鱼掉恐惧之魂"事故：vi_5395 手写插在循环前，后续 id +1）。
// 本测试钉死两条铁律：
// ① vanilla.json 自动注册的 vi_ 物品保持注册序（连续 vid 升序）
// ② 手写补链（BLOCK_TILE_BACKFILL 等）只许"回填改写现成 def"，不得新增占位
import { describe, it, expect } from 'vitest';
import { VI, VI_ID } from '../src/data/itemKeys';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TILE_BY_KEY, TILE_KEY_BY_SHEET } from '../src/data/tiles';
import vanillaMeta from '../public/sprites/vanilla.json';

const vimItems = (vanillaMeta as unknown as {
  items: Record<string, { createTile?: number }>;
}).items ?? {};

describe('ITEM_DEFS id 空间稳定性', () => {
  it('自动注册序守恒：连续 vid 的内部 id 严格递增（vi_5395 不得前插）', () => {
    for (const [a, b] of [[5394, 5395], [5395, 5396], [1495, 1496], [3139, 3140]] as const) {
      const ia = VI_ID(a), ib = VI_ID(b);
      expect(ia).toBeGreaterThan(0);
      expect(ib).toBeGreaterThan(0);
      expect(ia).toBeLessThan(ib);
    }
  });

  it('vi_5395 屎堆：tile 走回填（可放置 v_666_poo），且未新增重复注册', () => {
    const key = VI(5395);
    expect(key).toBe('vi_5395_PoopBlock');
    const def = ITEM_DEFS[ITEM_BY_KEY[key]];
    expect(def.tile).toBe('v_666_poo');   // 双源回填（vanilla.json createTile 666）
    expect(TILE_BY_KEY['v_666_poo']).toBeDefined();
  });

  // ---- createTile 覆盖闸门：vanilla.json 声明可放置且 tile 表已注册的物品，
  //      def.tile 必须非空——漏一件立即红（静默"放置无效"从此不可能溜进仓库；
  //      确属"有意不可放置"的，加进下方 ALLOWLIST 并注明原版依据） ----
  const ALLOWLIST_NO_PLACE = new Set<number>([
    // 空：暂无豁免项
  ]);
  it('createTile 覆盖闸门：vanilla.json 可放置物品 100% 有 def.tile', () => {
    const miss: number[] = [];
    for (const [idStr, m] of Object.entries(vimItems)) {
      const vid = Number(idStr);
      if (!Number.isFinite(vid) || m?.createTile === undefined || m.createTile === -1) continue;
      if (ALLOWLIST_NO_PLACE.has(vid)) continue;
      const key = VI(vid);
      if (!key || ITEM_BY_KEY[key] === undefined) continue;   // 未注册物品（如 CTF 大宝石有意不注册）
      const d = ITEM_DEFS[ITEM_BY_KEY[key]];
      if (d?.tile === undefined && TILE_KEY_BY_SHEET.has(m.createTile)) miss.push(vid);
    }
    expect(`缺 tile 的可放置物品 ${miss.length} 件: ${miss.slice(0, 20).join(',')}`).toBe('缺 tile 的可放置物品 0 件: ');
  });
});
