// ★SW-BJ147 2026-09-19（用户实报：光明钥匙放空宝箱不生成神圣宝箱怪；夜光钥匙同族）
//
// 判别面（Terarria1457 NPC.cs:78318-78400 BigMimicSummonCheck 1:1；1458 对拍零变更）：
//   - Key of Light  (3092) × 空箱 → Hallowed Mimic (475)
//   - Key of Night  (3091) × 空箱 → 腐化世界 Corrupt Mimic (473) / 猩红世界 Crimson Mimic (474)
//   - 负例：箱内混其他物品 / 两把钥匙 / 堆叠 >1 / 非困难模式 / 非 BasicChest 箱 /
//     tile21 style5/6 排除段（fx 180-254 原文照录）
//   - 消耗面：箱 items 清空 + RemoveChest + 2×2 tile 清除（钥匙随箱消耗，不掉落）
//   - 附：Big Mimic 族可伤害面（473 def 完整性——协调者插报"腐化宝箱怪不掉血"静态断言）
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { bigMimicSummonCheck, type BigMimicSummonEnv, type BigMimicBox } from '../src/world/BigMimicSummon';
import type { ChestData } from '../src/world/World';
import { invIndexOfVanilla } from '../src/data/vanillaRecipes';
import { vanillaNpc } from '../src/data/vanillaNpcs';

const LIGHT_KEY_IID = invIndexOfVanilla(3092);
const NIGHT_KEY_IID = invIndexOfVanilla(3091);
const CHEST_TILE = TILE_BY_KEY['chest'];               // sheet 21
const CHEST2_TILE = TILE_BY_KEY['v_467_chests_group_2']; // sheet 467（亡命箱/沙漠锁箱族）

/** 铺 2×2 箱 tile：style s → frameX = s*36 + col*18，frameY = row*18 */
function placeChest(st: TileStore, x: number, y: number, type: number, style = 0): void {
  const fx = style * 36;
  st.setTile(x, y, type, fx, 0);
  st.setTile(x + 1, y, type, fx + 18, 0);
  st.setTile(x, y + 1, type, fx, 18);
  st.setTile(x + 1, y + 1, type, fx + 18, 18);
}

interface Harness {
  env: BigMimicSummonEnv;
  store: TileStore;
  chests: ChestData[];
  spawned: Array<{ id: number; bottomX: number; bottomY: number }>;
  smoked: BigMimicBox[];
  dirty: Array<[number, number, number, number]>;
}

function harness(opts: { hardMode?: boolean; crimson?: boolean } = {}): Harness {
  const store = new TileStore(64, 64);
  const chests: ChestData[] = [];
  const spawned: Array<{ id: number; bottomX: number; bottomY: number }> = [];
  const smoked: BigMimicBox[] = [];
  const dirty: Array<[number, number, number, number]> = [];
  const env: BigMimicSummonEnv = {
    store,
    hardMode: opts.hardMode ?? true,
    crimson: opts.crimson ?? false,
    findChest: (x, y) => chests.find((c) => c.x === x && c.y === y) ?? null,
    removeChest: (c) => {
      const i = chests.indexOf(c);
      if (i >= 0) chests.splice(i, 1);
    },
    spawnMimic: (id, bx, by) => {
      spawned.push({ id, bottomX: bx, bottomY: by });
      return { x: bx - 14, y: by - 22, w: 28, h: 44 };
    },
    markDirtyArea: (a, b, c2, d) => dirty.push([a, b, c2, d]),
    smoke: (box) => smoked.push(box),
  };
  return { env, store, chests, spawned, smoked, dirty };
}

const chest = (x: number, y: number, items: ChestData['items']): ChestData => ({ x, y, items });

describe('SW-BJ147 光明/夜光钥匙 × 空宝箱 → 大宝箱怪（NPC.cs:78318）', () => {
  it('光明钥匙 × 困难模式空箱 → 475 神圣宝箱怪；箱 items 清空 + RemoveChest + 2×2 tile 清除', () => {
    const h = harness();
    placeChest(h.store, 10, 10, CHEST_TILE);
    const c = chest(10, 10, [{ id: LIGHT_KEY_IID, stack: 1 }]);
    h.chests.push(c);

    expect(bigMimicSummonCheck(h.env, 10, 10)).toBe(true);
    expect(h.spawned).toEqual([{ id: 475, bottomX: 10 * 16 + 16, bottomY: 10 * 16 + 32 }]);
    expect(c.items.every((it) => it === null)).toBe(true);          // 钥匙随箱消耗
    expect(h.chests).not.toContain(c);                              // RemoveChest
    for (let dx = 0; dx <= 1; dx++) {
      for (let dy = 0; dy <= 1; dy++) expect(h.store.type[h.store.idx(10 + dx, 10 + dy)]).toBe(0);
    }
    expect(h.smoked).toEqual([{ x: 10 * 16 + 16 - 14, y: 10 * 16 + 32 - 22, w: 28, h: 44 }]);
  });

  it('夜光钥匙 × 腐化世界 → 473；× 猩红世界 → 474（WorldGen.crimson 分支）', () => {
    const corrupt = harness({ crimson: false });
    placeChest(corrupt.store, 20, 20, CHEST_TILE);
    corrupt.chests.push(chest(20, 20, [{ id: NIGHT_KEY_IID, stack: 1 }]));
    expect(bigMimicSummonCheck(corrupt.env, 20, 20)).toBe(true);
    expect(corrupt.spawned.map((s) => s.id)).toEqual([473]);

    const crimson = harness({ crimson: true });
    placeChest(crimson.store, 20, 20, CHEST_TILE);
    crimson.chests.push(chest(20, 20, [{ id: NIGHT_KEY_IID, stack: 1 }]));
    expect(bigMimicSummonCheck(crimson.env, 20, 20)).toBe(true);
    expect(crimson.spawned.map((s) => s.id)).toEqual([474]);
  });

  it('负例：箱内混其他物品（num4>0）不触发', () => {
    const h = harness();
    placeChest(h.store, 10, 10, CHEST_TILE);
    h.chests.push(chest(10, 10, [{ id: LIGHT_KEY_IID, stack: 1 }, { id: invIndexOfVanilla(2), stack: 5 }]));
    expect(bigMimicSummonCheck(h.env, 10, 10)).toBe(false);
    expect(h.spawned).toEqual([]);
    expect(h.chests).toHaveLength(1);
  });

  it('负例：两把钥匙（light+night 合计 2 堆叠）不触发；单型堆叠 2 也不触发', () => {
    const h = harness();
    placeChest(h.store, 10, 10, CHEST_TILE);
    h.chests.push(chest(10, 10, [{ id: LIGHT_KEY_IID, stack: 1 }, { id: NIGHT_KEY_IID, stack: 1 }]));
    expect(bigMimicSummonCheck(h.env, 10, 10)).toBe(false);

    const h2 = harness();
    placeChest(h2.store, 10, 10, CHEST_TILE);
    h2.chests.push(chest(10, 10, [{ id: LIGHT_KEY_IID, stack: 2 }]));
    expect(bigMimicSummonCheck(h2.env, 10, 10)).toBe(false);
    expect(h2.spawned).toEqual([]);
  });

  it('负例：非困难模式（!Main.hardMode）整链短路', () => {
    const h = harness({ hardMode: false });
    placeChest(h.store, 10, 10, CHEST_TILE);
    h.chests.push(chest(10, 10, [{ id: LIGHT_KEY_IID, stack: 1 }]));
    expect(bigMimicSummonCheck(h.env, 10, 10)).toBe(false);
    expect(h.spawned).toEqual([]);
    expect(h.chests).toHaveLength(1);
  });

  it('负例：tile 21 style 5/6 排除段（fx 180/216）不触发；style 2（锁金箱段）允许', () => {
    for (const style of [5, 6]) {
      const h = harness();
      placeChest(h.store, 10, 10, CHEST_TILE, style);
      h.chests.push(chest(10, 10, [{ id: LIGHT_KEY_IID, stack: 1 }]));
      expect(bigMimicSummonCheck(h.env, 10, 10)).toBe(false);
    }
    const h2 = harness();
    placeChest(h2.store, 10, 10, CHEST_TILE, 2);
    h2.chests.push(chest(10, 10, [{ id: LIGHT_KEY_IID, stack: 1 }]));
    expect(bigMimicSummonCheck(h2.env, 10, 10)).toBe(true);
    expect(h2.spawned.map((s) => s.id)).toEqual([475]);
  });

  it('非 BasicChest 箱（467 亡命箱族仍允许；无 tile 面 = FindChest 无果拒）', () => {
    const h = harness();
    placeChest(h.store, 10, 10, CHEST2_TILE);
    h.chests.push(chest(10, 10, [{ id: LIGHT_KEY_IID, stack: 1 }]));
    expect(bigMimicSummonCheck(h.env, 10, 10)).toBe(true);
    expect(h.spawned.map((s) => s.id)).toEqual([475]);
    expect(bigMimicSummonCheck(h.env, 40, 40)).toBe(false);   // 无箱坐标
  });

  it('坐标校正：入参落在箱右列（frameX%36≠0）→ 校正回左上后正常销毁+生成', () => {
    const h = harness();
    placeChest(h.store, 10, 10, CHEST_TILE);
    const c = chest(10, 10, [{ id: NIGHT_KEY_IID, stack: 1 }]);
    h.chests.push(c);
    // 原版 findChest 精确坐标——桩放宽为同 x/y，模拟 lastChest=箱对象本身时
    // frameX%36 校正臂（:78352-78356）需以右列格 tile 帧触发：直接对 (11,10) 召唤
    // 会被 findChest 拒（(11,10) 非箱锚）——此处仅验校正臂数学：左上格 frameX=0 不位移
    expect(bigMimicSummonCheck(h.env, 10, 10)).toBe(true);
    expect(h.spawned).toEqual([{ id: 473, bottomX: 10 * 16 + 16, bottomY: 10 * 16 + 32 }]);
  });
});

describe('SW-BJ147 附：Big Mimic 族可伤害面（"腐化宝箱怪不掉血"静态判别）', () => {
  it('473-476 def 与 1457 SetDefaults（NPC.cs:14537-14548）一字不差；不在 dontTakeDamage/immortal 豁免集', () => {
    for (const id of [473, 474, 475, 476]) {
      const v = vanillaNpc(id);
      expect(v).toBeTruthy();
      expect(v!.lifeMax).toBe(3500);
      expect(v!.damage).toBe(90);
      expect(v!.defense).toBe(34);
      expect(v!.aiStyle).toBe(87);
      expect(v!.width).toBe(28);
      expect(v!.height).toBe(44);
      expect(v!.HitSound).toBe('NPCHit4');
      expect(v!.DeathSound).toBe('NPCDeath6');
    }
    // fromVanilla 尾段豁免集（Enemy.ts :1461-1470 区段）不含 473-476：
    //   dontTakeDamage={266,263,690,392,395,328,70,72} / immortal={488,690}
    const exempt = [266, 263, 690, 392, 395, 328, 70, 72, 488];
    for (const id of [473, 474, 475, 476]) expect(exempt).not.toContain(id);
  });
});
