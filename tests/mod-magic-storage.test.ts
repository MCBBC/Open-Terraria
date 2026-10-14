// magic-storage 行为测试(2026-10-14):mock sw/game 驱动 mod bundle 全链——
// 网络(4 邻接泛洪)/存入(并栈+容量)/取出(1/整组/满落掉落)/UI 槽渲染/合成源接线。
// 引擎集成面(TE 自愈建/随档存读)由 mods/_integration + tileEntities 测试盖。
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const modDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'mods', 'magic-storage');

type Slot = { id: number; stack: number } | null;
type SlotRow = Slot;

/** 构造 mock 世界 store:grid 为字符画('H'=心脏 'U'=单元 'A'=访问 'C'=合成 '.'=空) */
function mockStore(grid: string[]) {
  const h = grid.length, w = grid[0].length;
  const type = new Array(w * h).fill(0);
  const frameX = new Array(w * h).fill(0);
  const frameY = new Array(w * h).fill(0);
  const IDS = { H: 501, U: 502, A: 503, C: 504 };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = grid[y][x];
    if (IDS[ch as keyof typeof IDS]) type[y * w + x] = IDS[ch as keyof typeof IDS];
  }
  return {
    w, h, type, frameX, frameY,
    idx(x: number, y: number) { return y * w + x; },
  };
}

const TID = { storage_heart: 501, storage_unit: 502, storage_access: 503, crafting_access: 504 };

/** mock sw + game:capture tileInteract/tileEntity/UI;TE 态按 tile 类型×锚位建 */
function buildHarness(grid: string[], cfg: Record<string, boolean | number | string> = {}) {
  const store = mockStore(grid);
  const teMap = new Map<string, { x: number; y: number; key: string; state: Record<string, unknown> }>();
  const interact = new Map<string, (tx: number, ty: number, game: unknown) => boolean>();
  const panels: Array<{ key: string; title: string; texts: string[]; buttons: Array<{ text: string; onClick: () => void }>; slots: Array<{ getItem: () => { key: string; stack: number } | null; onLeftClick?: () => void; onRightClick?: () => void }> }> = [];
  const sw = {
    tileIdOf: (k: string) => (TID as Record<string, number>)[k],
    tileEntitiesOf: (k: string) => {
      const tid = (TID as Record<string, number>)[k];
      return [...teMap.values()].filter((te) => te.key.endsWith(k) || te.key === `mod_magic_storage_${k}`);
    },
    tileEntity: (key: string, spec: { create?(): Record<string, unknown> }) => {
      // 仿真放置自愈:按 grid 扫锚格建 TE(单次;注册时 grid 已定)
      const tid = (TID as Record<string, number>)[key];
      for (let y = 0; y < store.h; y++) for (let x = 0; x < store.w; x++) {
        const i = store.idx(x, y);
        if (store.type[i] === tid && store.frameX[i] === 0 && store.frameY[i] === 0) {
          teMap.set(x + ',' + y, { x, y, key: `mod_magic_storage_${key}`, state: spec.create ? spec.create() : {} });
        }
      }
    },
    tileInteract: (k: string, fn: (tx: number, ty: number, game: unknown) => boolean) => { interact.set(k, fn); },
    ui: {
      panel(key: string, o: { title?: string }) {
        // 同键替换(mock=引擎 close+reopen 语义;find 恒取最新)
        const stale = panels.findIndex((q) => q.key === key);
        if (stale >= 0) panels.splice(stale, 1);
        const p = { key, title: o.title ?? '', texts: [] as string[], buttons: [] as Array<{ text: string; onClick: () => void }>, slots: [] as Array<{ getItem: () => { key: string; stack: number } | null; onLeftClick?: () => void; onRightClick?: () => void }> };
        panels.push(p);
        return {
          key,
          addText: (t: string) => { p.texts.push(t); },
          addButton: (t: string, o2: { onClick: () => void }) => { p.buttons.push({ text: t, onClick: o2.onClick }); },
          addSlot: (o2: { getItem: () => { key: string; stack: number } | null; onLeftClick?: () => void; onRightClick?: () => void }) => { p.slots.push(o2); },
          addImage: () => {}, setPosition: () => {}, moveBy: () => {}, show: () => {}, hide: () => {}, toggle: () => {}, close: () => {},
        };
      },
      closeAll() { panels.length = 0; },
    },
    spawnItem: (game: unknown, id: number, x: number, y: number, stack: number) => {
      (harness.drops as Array<{ id: number; stack: number }>).push({ id, stack });
    },
    config: { get: (k: string) => cfg[k] ?? '', set: () => {} },
    log: () => {},
  };
  const inv = { slots: new Array(40).fill(null) as SlotRow[] };
  const game = {
    world: { store },
    player: { inv, x: 100, y: 100 },
    // 合成面:吃 sources(单元数组)+inv 的极简模拟(按材料 id×stack 判/扣)
    vanillaAvailableRecipesWithSources(sources: Array<{ items: Array<{ id: number; stack: number } | null> }>) {
      const owned = new Map<number, number>();
      const add = (id: number, n: number) => owned.set(id, (owned.get(id) ?? 0) + n);
      for (const s of sources) for (const it of s.items) if (it) add(it.id, it.stack);
      for (const it of inv.slots) if (it) add(it.id, it.stack);
      return harness.recipes
        .map((r) => {
          let count = Infinity;
          for (const ing of r.items) count = Math.min(count, Math.floor((owned.get(ing.id) ?? 0) / ing.stack));
          return { r, count: count === Infinity ? 0 : count };
        })
        .filter((x) => x.count > 0);
    },
    vanillaConsumeWithSources(r: { items: Array<{ id: number; stack: number }> }, sources: Array<{ items: Array<{ id: number; stack: number } | null> }>, times: number) {
      let done = 0;
      for (let k = 0; k < times; k++) {
        let ok = true;
        for (const ing of r.items) {
          let have = inv.slots.reduce((a, it) => a + (it && it.id === ing.id ? it.stack : 0), 0);
          for (const s of sources) for (const it of s.items) if (it && it.id === ing.id) have += it.stack;
          if (have < ing.stack) { ok = false; break; }
        }
        if (!ok) break;
        for (const ing of r.items) {   // 先扣 sources(原位)再扣背包
          let need = ing.stack;
          for (const s of sources) for (const it of s.items) {
            if (it && it.id === ing.id && need > 0) { const mv = Math.min(need, it.stack); it.stack -= mv; need -= mv; }
          }
          for (let s = 0; s < inv.slots.length && need > 0; s++) {
            const it = inv.slots[s];
            if (it && it.id === ing.id) { const mv = Math.min(need, it.stack); it.stack -= mv; need -= mv; if (it.stack <= 0) inv.slots[s] = null; }
          }
        }
        done++;
        // 成品入背包(简化:并入/空格)
        for (let s = 0; s < inv.slots.length; s++) {
          if (!inv.slots[s]) { inv.slots[s] = { id: harness.craftResultId(r), stack: 1 }; break; }
        }
      }
      return done;
    },
  };
  const harness = {
    sw, game, interact, panels, store, inv,
    drops: [] as Array<{ id: number; stack: number }>,
    recipes: [] as Array<{ create: number; items: Array<{ id: number; stack: number }> }>,
    craftResultId: (r: { create: number }) => r.create,
  };
  return harness;
}

function loadMod(h: ReturnType<typeof buildHarness>): void {
  const src = readFileSync(join(modDir, 'scripts', 'main.js'), 'utf8');
  const cjs = src.replace(/export\s+default\s+function\s+main/, 'function main');
  // eslint-disable-next-line no-new-func
  const main = new Function(`${cjs}; return main;`)() as (sw: unknown) => void;
  main(h.sw);
}

describe('magic-storage 核心行为(mock 驱动)', () => {
  let h: ReturnType<typeof buildHarness>;
  beforeEach(() => {
    // H=心脏 U=单元×2 A=访问 '. '=空;布局:心脏-单元-单元 横排,访问在心脏下方
    h = buildHarness([
      '.....',
      '.HUU.',
      '.A...',
      '.....',
    ], { capacityPerUnit: 10 });
    loadMod(h);
  });

  const interact = (key: keyof typeof TID, tx: number, ty: number) =>
    h.interact.get(key)!(tx, ty, h.game);

  it('TE 仿真放置:4 tile 建实例', () => {
    expect(h.sw.tileEntitiesOf('storage_unit').length).toBe(2);
    expect(h.sw.tileEntitiesOf('storage_heart').length).toBe(1);
  });

  it('心脏右键开存储 UI:网络泛洪收集 2 单元(邻接)', () => {
    interact('storage_heart', 1, 1);
    const p = h.panels.find((x) => x.key === 'storage')!;
    expect(p).toBeTruthy();
    expect(p.title.includes('2 单元')).toBe(true);
  });

  it('访问装置同网(心脏-单元链中隔位不连则不算)', () => {
    interact('storage_access', 1, 2);
    const p = h.panels.find((x) => x.key === 'storage')!;
    expect(p.title.includes('2 单元')).toBe(true);
  });

  it('存入全部:背包 3 种物品入网(同 id 并栈+占格)', () => {
    h.inv.slots[0] = { id: 100, stack: 50 };
    h.inv.slots[1] = { id: 200, stack: 30 };
    h.inv.slots[2] = { id: 100, stack: 20 };
    interact('storage_heart', 1, 1);
    h.panels.find((x) => x.key === 'storage')!.buttons.find((b) => b.text === '存入全部')!.onClick();
    // 2 单元×10 格:100 占 1 格(50+20 并=70)+200 占 1 格 → 背包清空
    expect(h.inv.slots[0]).toBeNull();
    expect(h.inv.slots[1]).toBeNull();
    const pAfter = h.panels.find((x) => x.key === 'storage')!;
    expect(pAfter.texts.some((t) => t.includes('物品种类 2'))).toBe(true);
  });

  it('容量满:超出部分留背包(容量 10×2 单元=20 格)', () => {
    for (let i = 0; i < 20; i++) h.inv.slots[i] = { id: 100 + i, stack: 10 };
    interact('storage_heart', 1, 1);
    let p = h.panels.find((x) => x.key === 'storage')!;
    p.buttons.find((b) => b.text === '存入全部')!.onClick();
    // 20 种恰好填满 20 格 → 全入
    expect(h.inv.slots.every((s) => !s)).toBe(true);
    // 第 21 种 → 满,留背包
    h.inv.slots[0] = { id: 999, stack: 10 };
    p = h.panels.find((x) => x.key === 'storage')!;
    p.buttons.find((b) => b.text === '存入全部')!.onClick();
    expect(h.inv.slots.some((s) => s && s.id === 999)).toBe(true);
  });

  it('取出:左键 1 个入背包;右键整组;掉落兜底', () => {
    h.inv.slots[0] = { id: 100, stack: 50 };
    interact('storage_heart', 1, 1);
    let p = h.panels.find((x) => x.key === 'storage')!;
    p.buttons.find((b) => b.text === '存入全部')!.onClick();
    p = h.panels.find((x) => x.key === 'storage')!;
    const slot = p.slots.find((s) => s.getItem()?.key === 'vi_100')!;
    slot.onLeftClick!();
    expect(h.inv.slots.some((s) => s && s.id === 100 && s.stack === 1)).toBe(true);
    slot.onRightClick!();
    expect(h.inv.slots.some((s) => s && s.id === 100 && s.stack === 50)).toBe(true);
  });

  it('背包满:取出剩余落地(spawnItem)', () => {
    h.inv.slots[0] = { id: 100, stack: 10 };
    interact('storage_heart', 1, 1);
    let p = h.panels.find((x) => x.key === 'storage')!;
    p.buttons.find((b) => b.text === '存入全部')!.onClick();
    for (let i = 0; i < 40; i++) h.inv.slots[i] = { id: 900 + i, stack: 999 };   // 背包塞满
    p = h.panels.find((x) => x.key === 'storage')!;
    const slot = p.slots.find((s) => s.getItem()?.key === 'vi_100')!;
    slot.onRightClick!();
    expect(h.drops.some((d) => d.id === 100 && d.stack === 10)).toBe(true);
  });

  it('合成访问:材料从存储池扣(原位落单元)+配方走引擎面', () => {
    h.recipes.push({ create: 999, items: [{ id: 100, stack: 5 }] });
    h.inv.slots[0] = { id: 100, stack: 50 };
    interact('storage_heart', 1, 1);   // 先存入(材料落单元)
    let p = h.panels.find((x) => x.key === 'storage')!;
    p.buttons.find((b) => b.text === '存入全部')!.onClick();
    interact('crafting_access', 1, 2);
    const pc = h.panels.find((x) => x.key === 'crafting')!;
    expect(pc.slots[0].getItem()!.key).toBe('vi_999');
    pc.slots[0].onLeftClick!();
    // 5 个从存储扣(原位):单元数组里 id=100 的 stack 减少
    const unitItems = [...h.sw.tileEntitiesOf('storage_unit').map((t) => t.state.items as Array<{ id: number; stack: number }>)].flat();
    const left = unitItems.filter((i) => i && i.id === 100).reduce((a, i) => a + i.stack, 0);
    expect(left).toBe(45);
    expect(h.inv.slots.some((s) => s && s.id === 999)).toBe(true);
  });

  it('网络断连:单元移出网(非邻接)后不计入', () => {
    // 在 (4,0) 放一个孤立单元(与网隔 1 格)
    h.store.type[h.store.idx(4, 0)] = TID.storage_unit;
    h.sw.tileEntitiesOf('storage_unit');   // 触发仿真(此处 mock 已建,略)
    interact('storage_heart', 1, 1);
    const p = h.panels.find((x) => x.key === 'storage')!;
    expect(p.title.includes('2 单元')).toBe(true);   // 孤立单元不入网
  });
});
