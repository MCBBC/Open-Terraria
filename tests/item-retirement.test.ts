// 本地物品退役防回归(迁移表/删除键/稳定 id remap 漏斗/全库零引用)
import { describe, it, expect } from 'vitest';
import {
  LEGACY_LOCAL_KEYS, DELETED_KEYS, RETIRED_KEY_TO_VID, viKeyOfRetired, viIdOfRetired,
} from '../src/data/itemMigration';
import { ITEM_BY_KEY, ITEM_DEFS, ITEM_INTERNAL_OF_STABLE, ITEM_STABLE_OF_INTERNAL, PRIV_ITEM_STABLE } from '../src/data/items';

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

describe('D1 稳定 id 闸门（2026-08-21）', () => {
  it('全 def 必有稳定 id：稳定表覆盖 ITEM_DEFS 全量（存盘写 0 = 读档丢物）', () => {
    // 表建在 items.ts 文件尾（全部注册之后）。若有人把注册段挪到表构建之后,
    // 新 def 落在 Uint16Array 长度外 → serialize.ts `?? 0` 存 0 → 读档 id 0 静默丢失
    // （曾吞敌旗 290+钓鱼 35+具名 5 件,2026-08-21 D1 修复）。
    expect(ITEM_STABLE_OF_INTERNAL.length).toBe(ITEM_DEFS.length);
    const holes: string[] = [];
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      if (!ITEM_STABLE_OF_INTERNAL[i]) holes.push(`#${i} ${ITEM_DEFS[i].key}`);
    }
    expect(holes, `缺稳定 id ${holes.length} 件: ${JSON.stringify(holes.slice(0, 10))}`).toEqual([]);
    // 反查表也必须能还原每件(读档链 SaveFile.ts ITEM_INTERNAL_OF_STABLE.get)
    const unmapped: string[] = [];
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      const s = ITEM_STABLE_OF_INTERNAL[i];
      if (s && ITEM_INTERNAL_OF_STABLE.get(s) === undefined) unmapped.push(`${ITEM_DEFS[i].key}#${s}`);
    }
    expect(unmapped, JSON.stringify(unmapped.slice(0, 10))).toEqual([]);
  });

  it('抽检：敌旗/钓鱼族/1457 新三件稳定 id 可存盘并可反查（存读往返语义）', () => {
    // 同 vid 双注册（旗/钓族键与 vanilla.json 自动键并存）时反查归一到首个 def——
    // 内容等价（tile/maxStack 同值,勘察 2026-08-21）,存读不丢物,故只断言可反查。
    const roundtrip = (key: string) => {
      const id = ITEM_BY_KEY[key];
      expect(id, `键未注册: ${key}`).toBeDefined();
      const s = ITEM_STABLE_OF_INTERNAL[id];
      expect(s, `${key} 无稳定 id`).toBeTruthy();
      const back = ITEM_INTERNAL_OF_STABLE.get(s);
      expect(back, `${key} 稳定 id ${s} 反查失败`).toBeDefined();
      expect(ITEM_DEFS[back].key).toMatch(/^vi_/);
    };
    roundtrip('vi_1615_banner_b1');     // 敌旗族首件
    roundtrip('vi_2916_banner_b107');
    roundtrip('vi_2289_f2289');         // 钓鱼竿族
    roundtrip('vi_5573_torch_gods_potion'); // 具名 5 件之一
    roundtrip('vi_6156_SilverBracer');  // 1457 新（上锁盒）
    roundtrip('vi_6158_MobiusStrip');   // 1457 新（石巨人袋）
    roundtrip('vi_6165_PoisonBarb');    // 1457 新（木匣）
  });
});
