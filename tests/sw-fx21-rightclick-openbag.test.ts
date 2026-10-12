// SW-FX21（2026-09-10）右键开袋面补齐：BossBag 族走 ItemSlot.TryOpenContainer_
// GrantItems 首支（1457 终值 ItemSlot.cs:1786-1789 = `if (ItemID.Sets.BossBag[
// item.type]) player.OpenBossBag(item.type)`，全树唯一调用面;1458 同域零增量）
// ——仓库旧状：openBagItem 对 BossBag 族回落 false，右键开宝藏袋整死，只有
// Game 持用左键链（FX13 登记项）。
// 金标：
//  - ItemID.cs:1215 BossBag 集 = 21 件（3318-3332/3860-3862/4782/4957/5111）
//  - ItemSlot.cs:1614-1693 RightClick（context==0 门 :1638 / mouseRightRelease
//    :1640 / 先于 HasItemSwap :1646 与装备 :1667——UI 门序既有面已对齐）
//  - ItemSlot.cs:1764-1782 TryOpenContainer（成功 = stack-- + PlaySound(7)，
//    :1842 GrantItems 恒 true → 无 case 的袋也消耗）
//  - Player.cs:7206 OpenBossBag；3861/3862 主战利品 case 整缺 + NPC 576/564
//    value=0f（NPC.cs:16314/:16484）→ 零产出本相（钱币尾 value=0 空转）
//  - Player.cs:56551 HasItem 仅查背包 0-57（moonlord 袋 3384 条件 :7748），
//    与锁盒 HasItemInInventoryOrOpenVoidBag :56575 分流
//  - 与左键链共存：Game.ts 持用链不动，两入口同走 openBossBag 引擎
import { describe, it, expect } from 'vitest';
import { newWiresRadialState } from '../src/stats/wiresRadial';   // ★BJ662 桩族补齐（BJ626 newWiresRadialState 先例）
import { openBagItem, OPENABLE_BAG_VIDS, type BagOpenWorld } from '../src/data/vanillaOpenBags';
import { BOSS_BAG_IDS } from '../src/data/vanillaBossBags';
// ★RB15a 变异实验夹具依赖（Game/Player/World 最小桩,惯例=blue-r2-fixes casterGame）
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

const W: BagOpenWorld = { hardMode: false };
const collect = (fn: (give: (id: number, n?: number) => void) => void): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  fn((id, n) => out.push([id, n ?? 1]));
  return out;
};

describe('SW-FX21 右键开袋面（TryOpenContainer_GrantItems :1784 首支补齐）', () => {
  it('BossBag 全集 21 件=ItemID.cs:1215，且全部在右键门 OPENABLE_BAG_VIDS 内（UI 门可达）', () => {
    const want = new Set([
      3318, 3319, 3320, 3321, 3322, 3323, 3324, 3325, 3326, 3327, 3328, 3329, 3330, 3331, 3332,
      3860, 3861, 3862, 4782, 4957, 5111,
    ]);
    expect(BOSS_BAG_IDS.size).toBe(21);
    for (const v of want) expect(BOSS_BAG_IDS.has(v), `缺 ${v}`).toBe(true);
    for (const v of BOSS_BAG_IDS) expect(OPENABLE_BAG_VIDS.has(v), `${v} 不在右键门`).toBe(true);
  });

  it('右键开袋矩阵:21 件全部经 openBagItem 首支放行（返回 true）', () => {
    for (const vid of BOSS_BAG_IDS) {
      expect(openBagItem(vid, () => {}, W), `袋 ${vid} 右键应放行`).toBe(true);
    }
  });

  it('3318 史王袋:恒给 998+3090（:7237/:7242 无条件支）,产出 id 全域合法（含共享钱币尾 71-74）', () => {
    const LEGAL = new Set([2430, 2493, 256, 257, 258, 2610, 2585, 998, 1309, 3090, 71, 72, 73, 74]);
    for (let k = 0; k < 100; k++) {
      const got = collect((give) => openBagItem(3318, give, W));
      const ids = got.map((g) => g[0]);
      expect(ids).toContain(998);
      expect(ids).toContain(3090);
      for (const id of ids) expect(LEGAL.has(id), `非法产出 ${id}`).toBe(true);
    }
  });

  it('3861/3862 零产出本相:主战利品 case 整缺+NPC value=0f → 恒 true 且零产出（50 开）', () => {
    for (const vid of [3861, 3862]) {
      let total = 0;
      for (let k = 0; k < 50; k++) {
        expect(openBagItem(vid, () => { total++; }, W), `袋 ${vid} GrantItems 恒 true（:1842）→ 盒照耗`).toBe(true);
      }
      expect(total, `袋 ${vid} 零产出=原版本相`).toBe(0);
    }
  });

  it('3860 贝席袋:恒给 3817 勇者勋章 ×[30,51)（:7625）', () => {
    for (let k = 0; k < 50; k++) {
      const got = collect((give) => openBagItem(3860, give, W));
      const medal = got.find((g) => g[0] === 3817);
      expect(medal, '3817 无条件支必出').toBeTruthy();
      expect(medal![1]).toBeGreaterThanOrEqual(30);
      expect(medal![1]).toBeLessThanOrEqual(50);   // Next(30,51) 上界开
    }
  });

  it('masterMode 传导:3320 克眼袋矿 56 大师 [110,136)/专家 [80,111)（:7271-7279）', () => {
    const stacks = (master: boolean): number[] => {
      const out: number[] = [];
      for (let k = 0; k < 200; k++) {
        const got = collect((give) => openBagItem(3320, give, { ...W, masterMode: master }));
        const ore = got.find((g) => g[0] === 56);
        expect(ore, '56 恒给').toBeTruthy();
        out.push(ore![1]);
      }
      return out;
    };
    for (const s of stacks(true)) { expect(s).toBeGreaterThanOrEqual(110); expect(s).toBeLessThanOrEqual(135); }
    for (const s of stacks(false)) { expect(s).toBeGreaterThanOrEqual(80); expect(s).toBeLessThanOrEqual(110); }
  });

  it('crimson 传导:3319 世界吞噬怪袋矿种臂 crimson?880:56 与 2171:59（:7255/:7260）', () => {
    for (let k = 0; k < 50; k++) {
      const normal = collect((give) => openBagItem(3319, give, { ...W, crimson: false }));
      const crimson = collect((give) => openBagItem(3319, give, { ...W, crimson: true }));
      const nIds = new Set(normal.map((g) => g[0]));
      const cIds = new Set(crimson.map((g) => g[0]));
      expect(nIds.has(56) && nIds.has(59)).toBe(true);
      expect(nIds.has(880) || nIds.has(2171)).toBe(false);
      expect(cIds.has(880) && cIds.has(2171)).toBe(true);
      expect(cIds.has(56) || cIds.has(59)).toBe(false);
    }
  });

  it('hasItemInventory 分流:moonlord 袋 3384 传送门枪条件走 Player.HasItem（仅背包 :7748/:56551）,不受虚空袋 hasItem 污染', () => {
    let invOnly = 0, voidAware = 0;
    for (let k = 0; k < 100; k++) {
      // 虚空袋回调恒 true,但 hasItemInventory=false → 原版 HasItem 查不到 → 必给
      openBagItem(3332, (id) => { if (id === 3384) invOnly++; }, {
        ...W, hasItem: () => true, hasItemInventory: () => false,
      });
      openBagItem(3332, (id) => { if (id === 3384) voidAware++; }, {
        ...W, hasItem: () => true, hasItemInventory: () => true,
      });
    }
    expect(invOnly).toBe(100);
    expect(voidAware).toBe(0);
  });

  it('门序回归:BossBag 首支不吞非袋件——非 OpenableBag vid 仍回落 false;锁盒无钥匙 false（不消耗）', () => {
    expect(openBagItem(3213, () => {}, W)).toBe(false);          // 飞猪钱袋非开包物
    expect(openBagItem(75, () => {}, W)).toBe(false);
    expect(openBagItem(3085, () => {}, W)).toBe(false);          // 金锁盒缺金钥匙 → false（TryOpenContainer :1771 num=false → 不 stack--）
    expect(openBagItem(3085, () => {}, { ...W, consumeItem: () => true })).toBe(true);
    expect(openBagItem(4879, () => {}, W)).toBe(false);          // 黑曜石锁盒缺暗影钥匙
  });

  it('★§五裁决(2026-09-13):左键链已摘除=原版唯右键链(BOSS_BAG_IDS 门集经 openBagItem 引擎全通)', () => {
    // 原"两入口共存"系前批设计决策;§五拍板对齐原版——Item.cs 无 useStyle=非使用物,
    // 开启唯 ItemSlot.cs:1786-1789 右键首支(无条件 return 先于 swap/装备/拆半)。
    // Game.ts 持用左键链退役(结构锁见下)。
    expect(BOSS_BAG_IDS.has(3861) && BOSS_BAG_IDS.has(3862)).toBe(true);
    for (const vid of BOSS_BAG_IDS) {
      const got = collect((give) => openBagItem(vid, give, W));
      expect(got.every((g) => g[0] > 0)).toBe(true);
    }
  });

  it('结构锁:Game.ts 持用链无 BossBag 左键分支（防自创入口回潮）', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const gameSrc = readFileSync(join(dirname(__dirname), 'src', 'core', 'Game.ts'), 'utf8');
    expect(gameSrc).not.toContain('BOSS_BAG_IDS.has');   // 左键门集直查已随链退役
    expect(gameSrc).not.toContain("openBossBag(");       // 引擎唯右键/开包引擎面引用
    expect(gameSrc).not.toContain('openBossBag');        // 连 import 也不得回潮（RB15a 收紧）
    // ★BJ69（2026-09-14）：RB15a 的 BOSS_BAG_NO_USE_VIDS 集合闭式豁免已退役——推广为
    //  数据驱动门 heldItemUseStyle>0（useStyle==0=非使用物,Player.cs:43064 同语义;
    //  袋 21 件=数据面子集）。门数据≡Item.cs 真值的逐 id 守卫=tests/bj69-nouse-gate。
    expect(gameSrc).not.toContain('BOSS_BAG_NO_USE_VIDS');
    expect(gameSrc).toMatch(/heldItemUseStyle\(heldDef\.vid \?\? -1\) > 0/);   // ★方案 A 重锚(BJ265)
    // 袋 21 件门数据全 0（原 heldItemUseStyle 消费面=vanilla-itemfunc.useStyle+回填表,
    //  袋族两源皆 0——此断言由 import heldItemUseStyle 的 bj69 守卫逐 id 承接,此处锁
    //  「豁免集不回潮」+「门表达式在位」两面）
  });

  // ============ ★RB15a 变异实验（2026-09-13）：持袋左键一帧零副作用 ============
  //  摘刀后宝藏袋 vid 落进 Game.updateUse 通用尾支（:15885）——内层手臂
  //  （高尔夫/4095/战斗书/语音饰品/血泪 4271/钓竿）无一支匹配 → 整帧 no-op。
  //  原版同相：SetDefaults 无 useStyle（Item.cs:30544 共块 consumable=true only）
  //  → controlUseItem 整链不启动 = 不挥/不响/不耗/不进 useTime。
  //  阳性对照 3213 钱槽证明桩灵敏度（防"全 miss 恒 0"反向陷阱——playbook P3.1）。
  const bagIid = (vid: number): number => {
    // 键源 = VANILLA_ITEM_KEY_BY_ID（全量 vanilla.json 反查表）——vanillaItemKey
    // 是配方域表（3861/3862 等非配方可造袋不在其中,曾报"未注册"）
    const k = VANILLA_ITEM_KEY_BY_ID[vid];
    const found = k ? ITEM_BY_KEY[k] : undefined;
    if (found === undefined) throw new Error(`vid ${vid} 未注册`);
    return found;
  };

  /** updateUse 可驱动的最小 Game 桩（蓝队 R2 惯例:blue-r2-fixes casterGame 同款） */
  function bagGame(heldVid: number) {
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    // ★BJ662（2026-10-12）updateUse 头 tickWiresRadial（BJ572）读 this.wiresRadial——Object.create 壳无构造器字段 → flowerUpdate(st=undefined) TypeError（存量桩族缺件,持物非 wire 工具走早退支,桩仅为通路）
    (g as unknown as { wiresRadial: unknown }).wiresRadial = newWiresRadialState();
    const player = new Player(50 * TILE, 90 * TILE, new Inventory());
    player.inv.add(bagIid(heldVid), 1);
    const sel = player.inv.slots.findIndex((s) => s && s.id === bagIid(heldVid));
    player.inv.selected = Math.max(0, sel);
    const added: unknown[] = [];
    const sfxCalls: string[] = [];
    const record = (k: string) => () => { sfxCalls.push(k); };
    const toasts: string[] = [];
    g.player = player;
    g.world = new World(120, 120, 30, 'rb15a');
    g.entities = { critters: [], npcs: [], enemies: [], projectiles: [], add: (e: unknown) => added.push(e) };
    g.input = { mouseDown: true, mouseHeld: true, mouseX: 700, mouseY: 300, rightDown: false, uiBlocking: false, downAction: () => false };
    g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [800, 0] };
    g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
    g.smartCursor = { showing: false };
    g.annotateMode = false;
    g.prevSwingMouse = false;
    g.mining = null;
    g.swingHitSet = new Set<number>();
    g.swingTileCutSet = new Set<number>();
    g.sfx = { play: record('play'), playWav: record('playWav'), playWavFile: record('playWavFile'), playFiles: record('playFiles') };
    g.playSfxFile = record('playSfxFile');
    g.playSfxWav = record('playSfxWav');
    g.cb = { onInventoryChanged: () => {}, onToast: (m: string) => toasts.push(m) };
    return { g, player, added, sfxCalls, toasts, heldSlot: sel };
  }

  describe('★RB15a 摘刀后持袋左键一帧零副作用（原版 useStyle=0 同相）', () => {
    const BAGS = [...BOSS_BAG_IDS];
    it(`持用面全量：左键一帧 no-op（无 swing/无音/无消耗/无 useTime/无实体/无 toast）`, () => {
      expect(BAGS.length).toBe(21);
      // ★BJ69（2026-09-14）：3861/3862 已按数据管线注册（atlas-append ①c→items.ts
      //  自动注册循环）——袋 21 件全部可持用,无跳过集
      const unholdable = BAGS.filter((v) => !VANILLA_ITEM_KEY_BY_ID[v]);
      expect(unholdable.sort((a, b) => a - b)).toEqual([]);
      for (const vid of BAGS) {
        if (!VANILLA_ITEM_KEY_BY_ID[vid]) continue;
        const { g, player, added, sfxCalls, toasts, heldSlot } = bagGame(vid);
        (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
        expect(player.useTime, `${vid} useTime`).toBe(0);
        expect((g as unknown as { swing?: unknown }).swing, `${vid} swing`).toBeUndefined();
        expect(added, `${vid} 实体`).toHaveLength(0);
        expect(sfxCalls, `${vid} 音效`).toHaveLength(0);
        expect(toasts, `${vid} toast`).toHaveLength(0);
        expect(player.inv.slots[heldSlot]?.id, `${vid} 不消耗`).toBe(bagIid(vid));
      }
    });

    it('阳性对照:3213 钱槽同桩发射 525 弹+音效（桩灵敏度证明,防全 miss 假绿）', () => {
      const { g, added, sfxCalls } = bagGame(3213);
      (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
      expect(added.length).toBeGreaterThanOrEqual(1);
      expect(sfxCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ★SW-RB12b（2026-09-10）探针 C2 定谳锁：关包快捷栏右键整面不可达。
  //  原版关包态快捷栏走 GUIHotbarDrawInner 专路（Main.cs:44322-44377,:44324
  //  playerInventory 早退 = 开包态不进;context 13 只 ItemSlot.Draw 不 Handle,
  //  唯一交互 = mouseLeft changeItem :44357-44360）→ 右键开包/换型/装备/拆半
  //  四支关包态整面不可达。结构锁钉 UI.ts 右键支的关包早退门（防回退）。
  it('结构锁:UI.ts 右键支持关包早退门（GUIHotbarDrawInner 只 Draw 不 Handle 的仓库承载位）', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const uiSrc = readFileSync(join(dirname(__dirname), 'src', 'ui', 'UI.ts'), 'utf8');
    expect(uiSrc).toContain("if (!this.invPanel || this.invPanel.style.display !== 'block') return;");
    // 锁门必须在 button===2 支内（不可误挪到左键面）
    const b2 = uiSrc.indexOf('if (e.button === 2) {');
    const gate = uiSrc.indexOf("if (!this.invPanel || this.invPanel.style.display !== 'block') return;");
    expect(b2).toBeGreaterThanOrEqual(0);
    expect(gate).toBeGreaterThan(b2);
    expect(gate - b2).toBeLessThan(1200);   // 同支近邻（中间仅 RB12b 注释）
  });
});
