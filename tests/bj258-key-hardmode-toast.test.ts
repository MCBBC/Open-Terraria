// BJ258 2026-09-22 用户明令分歧（拍板 B）：非困难模式放光明/夜光钥匙 → 拒绝点 toast
// 提示。原版本相 = 静默拒绝（NPC.cs:78320 `netMode==1||!hardMode` 整链短路，BJ213
// 定谳）。回滚口 Game.KEY_HARDMODE_TOAST（缺省 ON，登记注在 Game.ts 静态闸处）——
// false ⇒ 拒绝回调不接，与原版逐字全等。触发面 = 关箱拍且箱内恰为召唤配方全匹配
// （空箱 + 恰 1 堆叠钥匙）且仅被 hardMode 拦；netMode==1 访客臂在 chestChangeEvents
// 入口即拦，toast 不可能在访客端弹出（③ Game 级桩测覆盖权威端接线）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/core/Game';
import { Lang } from '../src/i18n/Lang';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { bigMimicSummonCheck, type BigMimicSummonEnv } from '../src/world/BigMimicSummon';
import type { ChestData } from '../src/world/World';
import { invIndexOfVanilla } from '../src/data/vanillaRecipes';

const LIGHT_KEY_IID = invIndexOfVanilla(3092);
const CHEST_TILE = TILE_BY_KEY['chest'];               // sheet 21

// ★静态初始化锁（BJ249 R4-M4 同案：顶层采样先于本文件一切 beforeEach/赋值——防
// 「闸被改成 undefined=falsy=永 OFF 且断言全绿」伪象；直接锁 `static … = true` 面）
const KEY_TOAST_DEFAULT_AT_IMPORT = Game.KEY_HARDMODE_TOAST;

/** 铺 2×2 箱 tile：style 0 → frameX = col*18，frameY = row*18 */
function placeChest(st: TileStore, x: number, y: number, type: number): void {
  st.setTile(x, y, type, 0, 0);
  st.setTile(x + 1, y, type, 18, 0);
  st.setTile(x, y + 1, type, 0, 18);
  st.setTile(x + 1, y + 1, type, 18, 18);
}

interface Harness {
  env: BigMimicSummonEnv;
  store: TileStore;
  chests: ChestData[];
  spawned: Array<{ id: number }>;
  rejectToasts: number;
}

function harness(opts: { hardMode?: boolean; wireToast?: boolean } = {}): Harness {
  const store = new TileStore(64, 64);
  const chests: ChestData[] = [];
  const spawned: Array<{ id: number }> = [];
  const h: Harness = { env: null as unknown as BigMimicSummonEnv, store, chests, spawned, rejectToasts: 0 };
  h.env = {
    store,
    hardMode: opts.hardMode ?? true,
    crimson: false,
    findChest: (x, y) => chests.find((c) => c.x === x && c.y === y) ?? null,
    removeChest: (c) => { const i = chests.indexOf(c); if (i >= 0) chests.splice(i, 1); },
    spawnMimic: (id) => { spawned.push({ id }); return { x: 0, y: 0, w: 28, h: 44 }; },
    markDirtyArea: () => {},
    smoke: () => {},
    ...(opts.wireToast === false ? {} : {
      onKeyHardModeReject: () => { h.rejectToasts++; },
    }),
  };
  return h;
}

const chest = (x: number, y: number, items: ChestData['items']): ChestData => ({ x, y, items });

describe('BJ258 非困难放钥匙 → 拒绝 toast（env 级：BigMimicSummonCheck 拒绝点）', () => {
  it('①非困难 + 配方全匹配 → 拒绝回调单发；不召唤；箱/钥匙/tile 零消耗（原版拒绝面不变）', () => {
    const h = harness({ hardMode: false });
    placeChest(h.store, 10, 10, CHEST_TILE);
    const c = chest(10, 10, [{ id: LIGHT_KEY_IID, stack: 1 }]);
    h.chests.push(c);

    expect(bigMimicSummonCheck(h.env, 10, 10)).toBe(false);
    expect(h.rejectToasts).toBe(1);                       // ★分歧面：拒绝点 toast
    expect(h.spawned).toEqual([]);                        // 原版拒绝面：不生成
    expect(h.chests).toContain(c);                        // 不毁箱
    expect(c.items[0]).toEqual({ id: LIGHT_KEY_IID, stack: 1 }); // 钥匙不被消耗
    expect(h.store.type[h.store.idx(10, 10)]).toBe(CHEST_TILE); // 不清 tile
  });

  it('①b非困难 + 配方不匹配（混其他物/两钥匙/空箱）→ 拒绝回调不误弹（只钉在拒绝点）', () => {
    const mk = (items: ChestData['items']) => {
      const h = harness({ hardMode: false });
      placeChest(h.store, 10, 10, CHEST_TILE);
      h.chests.push(chest(10, 10, items));
      return h;
    };
    const h1 = mk([{ id: LIGHT_KEY_IID, stack: 1 }, { id: invIndexOfVanilla(2), stack: 5 }]);
    expect(bigMimicSummonCheck(h1.env, 10, 10)).toBe(false);
    expect(h1.rejectToasts, '混其他物品=配方不匹配,不弹').toBe(0);

    const h2 = mk([{ id: LIGHT_KEY_IID, stack: 1 }, { id: invIndexOfVanilla(3091), stack: 1 }]);
    expect(bigMimicSummonCheck(h2.env, 10, 10)).toBe(false);
    expect(h2.rejectToasts, '两钥匙=配方不匹配,不弹').toBe(0);

    const h3 = mk([]);
    expect(bigMimicSummonCheck(h3.env, 10, 10)).toBe(false);
    expect(h3.rejectToasts, '空箱无钥匙=无关关箱,不弹').toBe(0);
  });

  it('②困难模式 → 无 toast + 正常召唤（BJ213 面回归：分歧零污染正常路径）', () => {
    const h = harness({ hardMode: true });
    placeChest(h.store, 10, 10, CHEST_TILE);
    h.chests.push(chest(10, 10, [{ id: LIGHT_KEY_IID, stack: 1 }]));

    expect(bigMimicSummonCheck(h.env, 10, 10)).toBe(true);
    expect(h.rejectToasts).toBe(0);
    expect(h.spawned.map((s) => s.id)).toEqual([475]);
  });

  it('②b回调不接（undefined）→ 非困难静默拒绝零异常（回滚形态的模块契约）', () => {
    const h = harness({ hardMode: false, wireToast: false });
    placeChest(h.store, 10, 10, CHEST_TILE);
    h.chests.push(chest(10, 10, [{ id: LIGHT_KEY_IID, stack: 1 }]));

    expect(bigMimicSummonCheck(h.env, 10, 10)).toBe(false);
    expect(h.spawned).toEqual([]);
    expect(h.chests).toHaveLength(1);
  });
});

// ── Game 级：chestChangeEvents 权威端接线 + 回滚口 ──────────────────────────
const TOAST_KEY = 'Mods.SandboxWorld.Toast.KeyHardModeGate';

function stubGame(world: World, toasts: string[]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    world: World;
    chestChangeEvents(): void;
  };
  g.world = world;
  g.net = null;                                  // net?.active falsy = 权威面（单机）
  g.openChestRef = () => null;                   // cur=null（关箱拍）
  g.lastChestOpen = { x: 10, y: 10 };            // lastChest>=0
  g.cb = { onToast: (m: string) => { toasts.push(m); } };
  return g;
}

function worldWithKeyedChest(): World {
  const w = new World(64, 64, 7, 'bj258');
  placeChest(w.store, 10, 10, CHEST_TILE);
  w.chests.push({ x: 10, y: 10, items: [{ id: LIGHT_KEY_IID, stack: 1 }] });
  return w;                                      // flags.hardMode 缺省 false（World.ts:291）
}

describe('BJ258 Game 级：回滚口 Game.KEY_HARDMODE_TOAST + 权威端 toast 接线', () => {
  it('③回滚口缺省 = ON（静态初始化锁）', () => {
    expect(KEY_TOAST_DEFAULT_AT_IMPORT, 'Game.KEY_HARDMODE_TOAST 静态初始化=true 被改').toBe(true);
    expect(Game.KEY_HARDMODE_TOAST).toBe(true);
  });

  it('③ON（缺省）→ 关箱拍 cb.onToast 收文案一次；箱零消耗（不召唤）', () => {
    const w = worldWithKeyedChest();
    const toasts: string[] = [];
    (stubGame(w, toasts) as unknown as { chestChangeEvents(): void }).chestChangeEvents();
    expect(toasts.length, '恰好一次（关箱拍单发,无刷屏）').toBe(1);
    expect(toasts[0]).toBe(Lang.text(TOAST_KEY));       // 文案经 Lang 键
    expect(toasts[0].length, '非空文案').toBeGreaterThan(0);
    expect(w.chests, '原版拒绝面：不毁箱').toHaveLength(1);
  });

  it('③回滚口 OFF → 无 toast（静默拒绝 = 原版逐字全等）；恢复 ON 后复弹', () => {
    const prev = Game.KEY_HARDMODE_TOAST;
    Game.KEY_HARDMODE_TOAST = false;
    try {
      const toasts: string[] = [];
      (stubGame(worldWithKeyedChest(), toasts) as unknown as { chestChangeEvents(): void }).chestChangeEvents();
      expect(toasts, 'OFF=回调不接=原版静默').toEqual([]);

      Game.KEY_HARDMODE_TOAST = true;
      const toasts2: string[] = [];
      (stubGame(worldWithKeyedChest(), toasts2) as unknown as { chestChangeEvents(): void }).chestChangeEvents();
      expect(toasts2.length, '恢复 ON=toast 回归').toBe(1);
    } finally {
      Game.KEY_HARDMODE_TOAST = prev;
    }
  });
});

describe('BJ258 l10n 产物（build-l10n 后）', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const read = (cult: string): Record<string, Record<string, string>> =>
    JSON.parse(readFileSync(join(here, '..', 'public', 'l10n', `${cult}.json`), 'utf8'));
  // 产物按类别分组,Mods 类目内键不含 'Mods.' 前缀（与 Lang.text 全键口径区分）
  const PRODUCT_KEY = TOAST_KEY.replace(/^Mods\./, '');

  it('zh-Hans/en-US 两语言键在位且非空', () => {
    expect(read('zh-Hans').Mods?.[PRODUCT_KEY]).toBe('钥匙仅在困难模式（击败血肉墙）后生效');
    expect(read('en-US').Mods?.[PRODUCT_KEY]).toBe('Keys only work in Hardmode (defeat the Wall of Flesh)');
  });

  it('其余 10 语言经 en 兜底非空（合并序:en base 含 custom en）', () => {
    for (const cult of ['ja-JP', 'de-DE', 'zh-Hant']) {
      expect(read(cult).Mods?.[PRODUCT_KEY], cult).toBeTruthy();
    }
  });
});
