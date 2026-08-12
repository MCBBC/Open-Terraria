// 本地物品退役防回归(迁移表/删除键/稳定 id remap 漏斗/全库零引用)
import { describe, it, expect } from 'vitest';
import {
  LEGACY_LOCAL_KEYS, DELETED_KEYS, RETIRED_KEY_TO_VID, viKeyOfRetired, viIdOfRetired,
} from '../src/data/itemMigration';
import { ITEM_BY_KEY, ITEM_DEFS, ITEM_INTERNAL_OF_STABLE, PRIV_ITEM_STABLE } from '../src/data/items';

describe('退役迁移表健全性', () => {
  it('184 本地键全部有归宿:迁移或删除,无遗漏', () => {
    for (const k of LEGACY_LOCAL_KEYS) {
      const ok = DELETED_KEYS.has(k) || RETIRED_KEY_TO_VID[k] !== undefined;
      expect(ok, `无归宿: ${k}`).toBe(true);
    }
  });

  it('182 条迁移键(184-2 删除)全部可解析到已注册 vi_ 物品', () => {
    const bad: string[] = [];
    for (const k of Object.keys(RETIRED_KEY_TO_VID)) {
      const key = viKeyOfRetired(k);
      const id = viIdOfRetired(k);
      if (!key || !id || !ITEM_DEFS[id]) bad.push(`${k}→${key ?? '?'}/${id}`);
    }
    expect(bad, JSON.stringify(bad.slice(0, 10))).toEqual([]);
  });

  it('关键映射抽检(防 id 抄错回归)', () => {
    expect(RETIRED_KEY_TO_VID['wood']).toBe(9);
    expect(RETIRED_KEY_TO_VID['gel']).toBe(23);
    expect(RETIRED_KEY_TO_VID['coin_platinum']).toBe(74);
    expect(RETIRED_KEY_TO_VID['mana_regen_potion']).toBe(293);
    expect(RETIRED_KEY_TO_VID['grand_design']).toBe(3611);
    expect(RETIRED_KEY_TO_VID['pirate_map']).toBe(1315);
    expect(RETIRED_KEY_TO_VID['copper_helmet']).toBe(89);
    expect(RETIRED_KEY_TO_VID['gold_greaves']).toBe(79);
    // 迁移目标必须是 vi_ 键(驼峰或蛇形皆可,但不得是本地键自身)
    expect(viKeyOfRetired('wood')).toMatch(/^vi_/);
    expect(viKeyOfRetired('coin_copper')).toMatch(/^vi_/);
  });

  it('删除键(wood_pickaxe/wood_axe)不进迁移表', () => {
    expect(DELETED_KEYS.has('wood_pickaxe')).toBe(true);
    expect(DELETED_KEYS.has('wood_axe')).toBe(true);
    expect(RETIRED_KEY_TO_VID['wood_pickaxe']).toBeUndefined();
  });

  it('PRIV 冻结表退役段在稳定 id 反查表全部有 vi_ 落点(读档 remap 漏斗)', () => {
    const priv = PRIV_ITEM_STABLE;
    const missing: string[] = [];
    for (const [k, stable] of Object.entries(priv)) {
      if (!k.startsWith('vi_') && !k.startsWith('place_') && !DELETED_KEYS.has(k)) {
        if (ITEM_INTERNAL_OF_STABLE.get(stable) === undefined) missing.push(`${k}#${stable}`);
      }
    }
    expect(missing, JSON.stringify(missing.slice(0, 10))).toEqual([]);
    void ITEM_BY_KEY;
  });
});
