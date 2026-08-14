// 地图皮肤回归锁（调研结论先行——原版 1.4.5.6 没有"全屏地图皮肤"系统）：
//   - 全屏地图固定单张 Images/Map.png 羊皮纸（AssetInitializer.cs:638 单贴图，Main.cs:54923
//     整幅 destRect 拉伸），无皮肤数组、无 UI/Map/ 目录（ResourcePacksDefaultInfo.tsv:14756
//     该前缀下只有 Images/UI/MapPing）、l10n 无 MapSkin_* 键（en-US.json:212-221 只有
//     SelectMapBorder + 9 个 MinimapFrame_*）。
//   - 原版唯一的地图皮肤 = 小地图边框 MinimapFrameManager 9 款（MinimapFrameManager.cs:32-42），
//     仓库已全链实装（Options.minimapFrame / Settings ui 栏 / Renderer.MINIMAP_SKINS）。
// 本测试锁定这条真实链路：贴图文件存在 + Options 持久化 + 切换纯函数（CycleSelection 方向）。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

// localStorage stub（Options 经 KvStore 走 localStorage 快路径；node 无实现，同 character-store.test.ts）
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
} as Storage;

const { OptionsStore, MINIMAP_FRAME_SKINS, cycleMinimapFrame } = await import('../src/core/Options');

const OPTIONS_KEY = 'sandboxworld.options'; // Options.ts 私有 KEY（kv 落盘键）

describe('小地图边框皮肤（MinimapFrameManager）', () => {
  beforeEach(() => mem.clear());

  it('9 款皮肤 = 原版插入序（MinimapFrameManager.cs:32-42，Dictionary 枚举序）', () => {
    expect([...MINIMAP_FRAME_SKINS]).toEqual([
      'Default', 'Golden', 'Remix', 'Sticks', 'StoneGold', 'TwigLeaf', 'Leaf', 'Retro', 'Valkyrie',
    ]);
    expect(MINIMAP_FRAME_SKINS).toHaveLength(9);
  });

  it('9 款 × 4 张皮肤贴图全部存在（UI_Minimap_{Skin}_{Part}.png 共 36 张）', () => {
    const parts = ['MinimapFrame', 'MinimapButton_Reset', 'MinimapButton_ZoomIn', 'MinimapButton_ZoomOut'];
    for (const skin of MINIMAP_FRAME_SKINS) {
      for (const part of parts) {
        const f = `public/sprites/vanilla-ui/UI_Minimap_${skin}_${part}.png`;
        expect(existsSync(f), f).toBe(true);
      }
    }
  });

  it('切换纯函数 = SelectionHolder.CycleSelection 倒序回绕（取前一个；首个回绕到末个）', () => {
    expect(cycleMinimapFrame('Default')).toBe('Valkyrie'); // 首个 → Last()
    expect(cycleMinimapFrame('Golden')).toBe('Default');
    expect(cycleMinimapFrame('Valkyrie')).toBe('Retro');
    expect(cycleMinimapFrame('bogus')).toBe('Default');    // SetActiveFrame 未命中 → First()
    // 倒序走满一圈：9 步遍历全集且回到起点 Default
    let cur: string = 'Default';
    const seen: string[] = [];
    for (let i = 0; i < 9; i++) { cur = cycleMinimapFrame(cur); seen.push(cur); }
    expect(new Set(seen).size).toBe(9);
    expect(cur).toBe('Default');
  });

  it('Options 持久化：默认 Default；set 落 kv（400ms 防抖窗后）；新实例回读生效', async () => {
    // 产品语义（Options.ts set，2026-08-13 泄露 review IO 防抖）：内存值即时、
    // 落盘合并到停手后 400ms——本测试按防抖语义等待窗口，不即时断言 kv
    vi.useFakeTimers();
    try {
      const a = new OptionsStore();
      await a.load();
      expect(a.data.minimapFrame).toBe('Default');
      await a.set('minimapFrame', 'Golden');
      expect(a.data.minimapFrame).toBe('Golden');          // 内存值即时（所见即所得）
      expect(mem.get(OPTIONS_KEY)).toBeUndefined();        // 防抖窗内未落盘（设计语义）
      await vi.advanceTimersByTimeAsync(400);              // 走完 400ms 防抖窗
      expect(JSON.parse(mem.get(OPTIONS_KEY)!).minimapFrame).toBe('Golden');
      const b = new OptionsStore();
      await b.load();
      expect(b.data.minimapFrame).toBe('Golden');
    } finally {
      vi.useRealTimers();
    }
  });

  it('存档里的未知皮肤键归一化 → Default（SetActiveFrame 兜底 First()）', async () => {
    mem.set(OPTIONS_KEY, JSON.stringify({ minimapFrame: 'Nope' }));
    const c = new OptionsStore();
    await c.load();
    expect(c.data.minimapFrame).toBe('Default');
  });
});

describe('全屏地图现状（无皮肤系统的证据锁）', () => {
  it('原版固定羊皮纸 Images/Map.png 已在仓库且可解码', () => {
    const f = 'public/sprites/vanilla-ui/Map.png';
    expect(existsSync(f)).toBe(true);
    const d = readFileSync(f);
    expect(d.subarray(1, 4).toString('ascii')).toBe('PNG'); // PNG 魔数
    expect(d.readUInt32BE(16)).toBe(928);                   // IHDR 宽（ResourcePacksDefaultInfo.tsv:9983）
    expect(d.readUInt32BE(20)).toBe(248);                   // IHDR 高
  });
});
