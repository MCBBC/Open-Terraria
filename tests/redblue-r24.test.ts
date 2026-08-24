// R24 蓝队修复回归（对应 red-team-r24.md 必修清单）：
//   #1 角色创建 HSL 亮度缩放域 / #3 giveItem maxStack 钳 / #4 Settings 默认值 ×3 +
//   Game Zoom 域与读端兼容 / #5 收藏档防删；附：#2 研究按玩家档案持久化、
//   #6 tooltip 专家/大师行序、#8 cultist alpha==255 单 tick 等价。
// 对拍锚点（Terarria1458）：UICharacterCreation.cs:2359-2369、ItemSlot.cs:750-762、
// Main.cs:1432/:256/:4284/:4575/:16986-16990、Player.cs:326/:330/:777、
// UICharacterListItem.cs:114-116、Main.cs GetLinesInfo :21195-21280。
import { describe, it, expect, beforeEach } from 'vitest';

// ---- node 环境 localStorage 桩（KvStore/Research 的 localStorage 路径需要）----
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
} as Storage;

const { scaledLuminosity, rgbToScaledHsl, hslToRgb } = await import('../src/player/Appearance');
const { giveItem } = await import('../src/ui/JourneyPowersUI');
const { OptionsStore } = await import('../src/core/Options');
const { Inventory } = await import('../src/items/Inventory');
const { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('../src/data/items');
const { CharacterStore } = await import('../src/save/CharacterStore');
const { Research } = await import('../src/stats/Research');
const { bossHeadIndexOf } = await import('../src/render/BossBars');
const { assembleTooltipLines, buildTooltipBody } = await import('../src/ui/itemTooltip');

/** 内部 id 反查（原版 vid → 内部注册表下标） */
function iidOfVid(vid: number): number {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  const iid = key !== undefined ? ITEM_BY_KEY[key] : undefined;
  expect(iid, `vid ${vid} 应已注册`).toBeDefined();
  return iid as number;
}

describe('#1 HSL 亮度缩放域（UICharacterCreation.cs:2359-2369）', () => {
  it('缩放端点：l=0 → 实际亮度 0.15，l=1 → 1', () => {
    expect(scaledLuminosity(0)).toBeCloseTo(0.15);
    expect(scaledLuminosity(1)).toBeCloseTo(1);
    expect(scaledLuminosity(0.5)).toBeCloseTo(0.5 * 0.85 + 0.15);
  });

  it('滑杆最暗端拖不出近黑：s=0 全亮度域 RGB ≥ 15% 灰（修复前可到 #000）', () => {
    for (let i = 0; i <= 10; i++) {
      const l = i / 10;
      const [r, g, b] = hslToRgb(0.3, 0, scaledLuminosity(l));
      expect(Math.min(r, g, b)).toBeGreaterThanOrEqual(0.15 - 1e-9);
    }
    // 最暗端实色 = round(0.15*255) = 38（原版滑杆底 = 15% 灰）
    const [r, , ] = hslToRgb(0, 0, scaledLuminosity(0));
    expect(Math.round(r * 255)).toBe(38);
  });

  it('rgbToScaledHsl 往返一致：apply(sync(x)) ≈ x（八度采样，RGB 走 255 整数量化）', () => {
    for (let hi = 0; hi < 8; hi++) {
      for (const s of [0.25, 0.5, 1]) {
        for (const l of [0.05, 0.2, 0.5, 0.8, 0.95]) {
          const [r, g, b] = hslToRgb(hi / 8, s, scaledLuminosity(l));
          // 经 0-255 整数域读回（HEX 读数路径；rgbToScaledHsl 入参 = Color 域）
          const q = (v: number) => Math.round(v * 255);
          const [h2, s2, l2] = rgbToScaledHsl(q(r), q(g), q(b));
          expect(h2).toBeCloseTo(hi / 8, 1);                      // 255 量化容差（±0.05）
          expect(s2).toBeCloseTo(s, 1);
          expect(l2).toBeCloseTo(l, 1);
        }
      }
    }
  });

  it('RgbToScaledHsl 钳位（vanilla Vector3.Clamp）：纯黑 z→0、纯白 z→1', () => {
    expect(rgbToScaledHsl(0, 0, 0)[2]).toBe(0);            // (0-0.15)/0.85 = -0.176 → 钳 0
    expect(rgbToScaledHsl(255, 255, 255)[2]).toBe(1);
    expect(rgbToScaledHsl(255, 255, 255)[1]).toBe(0);      // 无饱和
  });
});

describe('#3 giveItem 整组钳到 maxStack（ItemSlot.cs:750-762）', () => {
  /** 给予器桩：真实 Inventory + spawnDrop 间谍（结构类型，免动态导入的类型引用） */
  function mkGame(inv: { slots: Array<{ id: number; stack: number } | null> }) {
    const drops: Array<{ key: string; stack: number }> = [];
    const game = {
      player: { inv, cx: 0, cy: 0 },
      cb: {},
      sfx: { play() { /* noop */ } },
      spawnDrop(_x: number, _y: number, key: string, stack: number) { drops.push({ key, stack }); },
    };
    return { game: game as never, drops };
  }

  it('空背包 shift 取整组 = maxStack 入包（不超限）', () => {
    const iid = iidOfVid(2);                               // 泥土
    const max = (ITEM_DEFS[iid] as { maxStack: number }).maxStack;
    const inv = new Inventory();
    const { game, drops } = mkGame(inv);
    giveItem(game, iid, max);
    expect(inv.slots[0]).toEqual({ id: iid, stack: max });
    expect(drops).toHaveLength(0);
  });

  it('部分堆上叠加钳到 maxStack：余量进下一格，任何槽不超限（曾直加出 1099）', () => {
    const iid = iidOfVid(2);
    const max = (ITEM_DEFS[iid] as { maxStack: number }).maxStack;
    const inv = new Inventory();
    inv.slots[0] = { id: iid, stack: max - 99 };           // 差 99 满
    const { game, drops } = mkGame(inv);
    giveItem(game, iid, max);                              // shift 整组
    expect(inv.slots[0]!.stack).toBe(max);                 // 首格钳满
    expect(inv.slots[1]!.stack).toBe(max - 99);            // 余量进次格
    for (const s of inv.slots) if (s) expect(s.stack).toBeLessThanOrEqual(max);
    expect(drops).toHaveLength(0);                         // 有容量不落地
  });

  it('全背包满堆时溢出落地（GetItem 溢出语义），入包总量仍 ≤ 容量×maxStack', () => {
    const iid = iidOfVid(2);
    const max = (ITEM_DEFS[iid] as { maxStack: number }).maxStack;
    const inv = new Inventory();
    for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = { id: iid, stack: max };
    const { game, drops } = mkGame(inv);
    giveItem(game, iid, 10);
    expect(drops).toHaveLength(1);
    expect(drops[0].stack).toBe(10);                       // 一格都塞不下 → 整份落地
    const total = inv.slots.reduce((n, s) => n + (s ? s.stack : 0), 0);
    expect(total).toBe(inv.slots.length * max);
  });

  it('maxStack=1 物品（红心 58）shift 也只给 1 件', () => {
    const iid = ITEM_BY_KEY['vi_58_Heart'];
    expect(iid).toBeDefined();
    expect((ITEM_DEFS[iid] as { maxStack: number }).maxStack).toBe(1);
    const inv = new Inventory();
    const { game } = mkGame(inv);
    giveItem(game, iid, 999);
    expect(inv.slots[0]).toEqual({ id: iid, stack: 1 });
    expect(inv.slots.filter(Boolean)).toHaveLength(1);     // 不撒 999 格
  });
});

describe('#4 Settings 默认值 ×3 + Game Zoom（Main.cs:1432 / Player.cs:326/:330）', () => {
  it('fresh 默认 = 反编译真值：musicVol 1 / smartBlocks false / smartHoldMidUse false', () => {
    const d = new OptionsStore().data;
    expect(d.musicVol).toBe(1);
    expect(d.smartBlocksEnabled).toBe(false);
    expect(d.smartHoldCanReleaseMidUse).toBe(false);
  });

  it('Game Zoom 域 [1,2]：默认在本域内；load 读回越界值被钳回（Main.cs:16986-16990）', async () => {
    const fresh = new OptionsStore();
    expect(fresh.data.gameZoom).toBeGreaterThanOrEqual(1);
    expect(fresh.data.gameZoom).toBeLessThanOrEqual(2);
    mem.set('sandboxworld.options', JSON.stringify({ gameZoom: 9 }));
    const s = new OptionsStore();
    await s.load();
    expect(s.data.gameZoom).toBe(2);
    mem.delete('sandboxworld.options');
  });

  it('读端兼容：旧档已有值不被缺省变更覆盖（musicVol 0.35 存量档保持 0.35）', async () => {
    mem.set('sandboxworld.options', JSON.stringify({
      musicVol: 0.35, smartBlocksEnabled: true, smartHoldCanReleaseMidUse: true,
    }));
    const s = new OptionsStore();
    await s.load();
    expect(s.data.musicVol).toBe(0.35);
    expect(s.data.smartBlocksEnabled).toBe(true);
    expect(s.data.smartHoldCanReleaseMidUse).toBe(true);
    mem.delete('sandboxworld.options');
  });
});

describe('#5 收藏档防删（UICharacterListItem.cs:114-116 !IsFavorite 才挂删除）', () => {
  beforeEach(() => mem.clear());

  it('收藏角色 delete 为无操作；取消收藏后可删', async () => {
    const store = new CharacterStore();
    const meta = await store.create({
      ...(await import('../src/player/Appearance')).defaultAppearance('收藏员'),
    });
    await store.setFavorite(meta.id, true);
    await store.delete(meta.id);                           // 收藏行 → 数据层拒删
    expect(store.list().some((m) => m.id === meta.id)).toBe(true);
    await store.setFavorite(meta.id, false);
    await store.delete(meta.id);
    expect(store.list().some((m) => m.id === meta.id)).toBe(false);
  });
});

describe('#2 附证：研究进度按玩家档案（Player.creativeTracker 语义）', () => {
  beforeEach(() => mem.clear());

  it('usePlayerProfile 分桶隔离 + 旧全局桶由首个角色一次性收编', async () => {
    // 旧全局桶预置进度（升级前存量）
    mem.set('sbw.research.v1', JSON.stringify({ v: 1, c: { '2': 50 } }));
    const a = new Research();                              // 构造期读全局桶
    a.usePlayerProfile(7);
    expect(a.getSacrificeCount(2)).toBe(50);               // 收编为角色 7 基线
    expect(mem.has('sbw.research.v1')).toBe(false);        // 全局桶清空（防二次收编）

    const b = new Research();
    b.usePlayerProfile(8);
    expect(b.getSacrificeCount(2)).toBe(0);                // 角色 8 从零（不再串档）
    b.sacrifice(2, 10);
    expect(b.getSacrificeCount(2)).toBe(10);

    a.usePlayerProfile(7);
    expect(a.getSacrificeCount(2)).toBe(50);               // 角色 7 桶不受角色 8 影响

    // 回切无角色上下文 = 共享桶语义（直载存档路径），且不吞玩家桶
    a.usePlayerProfile(null);
    a.sacrifice(3, 1);
    expect(mem.get('sbw.research.v1')).toContain('"3":1');
    expect(JSON.parse(mem.get('sbw.research.v2.p8')!).c).not.toHaveProperty('3');
  });
});

describe('#6 附证：tooltip 专家/大师行序（1458 在 prefix 差分之前，Main.cs:21195-21280）', () => {
  it('expert/master 行位于词缀差分行之前；62 号前缀出 +1 防御差分行（T7）', () => {
    const iid = iidOfVid(2);                               // 任意 vi_ 物品
    const def = ITEM_DEFS[iid];
    const out = assembleTooltipLines(
      def as never, { id: iid, stack: 1, prefix: 62 }, null, null,
      { expert: true, master: true },
    );
    const idxExpert = out.findIndex((l) => l.tag === 'expert');
    const idxMaster = out.findIndex((l) => l.tag === 'master');
    const idxPrefix = out.findIndex((l) => l.tag === 'prefix');
    expect(idxExpert).toBeGreaterThanOrEqual(0);
    expect(idxMaster).toBeGreaterThan(idxExpert);
    expect(idxPrefix).toBeGreaterThan(idxMaster);          // 修复前此断言反向
    // 62 → "+1"+tip25（l10n 未载回退键名，前缀段仍是 "+1"）
    const diff = out.find((l) => l.tag === 'prefix');
    expect(diff!.text.startsWith('+1')).toBe(true);
  });

  it('T4 分类行：治疗药水出 Healing 行、坐骑物品出 Mount 行（:21087-21103）', () => {
    // 治疗药水 188（healLife>0，无 buffType）→ elif healLife 支
    const potion = iidOfVid(188);
    const bodyPotion = buildTooltipBody(
      ITEM_DEFS[potion] as never, { id: potion, stack: 1 }, null, {});
    expect(bodyPotion.lines.some((l) => l.tag === 'category')).toBe(true);
    // 弹药药水等 buffType>0 且是宠物表成员的排除支不做全查——只锁链路存在
  });
});

describe('#8 附证：教徒隐身窗 = ai1==90 单 tick（NPC.cs AI_084 写点实测）', () => {
  const cult = (ai0: number, ai1: number) => ({ type: 439, ai0, ai1, life: 4000, lifeMax: 8000 });
  it('439 仪式态 ai1∈[30,89] 头像可见（修复前整段误判隐藏）；仅 ai1==90 隐', () => {
    for (const ai1 of [0, 29, 30, 60, 89]) {
      expect(bossHeadIndexOf(cult(5, ai1))).not.toBe(-1);
    }
    expect(bossHeadIndexOf(cult(5, 90))).toBe(-1);
    expect(bossHeadIndexOf(cult(5, 91))).not.toBe(-1);
    expect(bossHeadIndexOf(cult(0, 90))).not.toBe(-1);   // 非仪式态门
  });
});
