// dual-key 注册归一守卫（docs/dual-key-cleanup-plan.md）。
// ★SW-BN1 2026-09-07 终态改写：二期归一化把「同 vid 多 def」清零——
//   banner×290＋f兜底×35＋杂×5 蛇形影子 def 撤注册（键别名到权威驼峰 def,同构
//   SW-BK1 墙族 284 件试点）；蛇形自身双注册 122/217/1507/5359 撤首注册（保 byKey
//   现指向）；4851-4857 宝石橡树自动孤儿 def 跳过（取后注册者=显式件）。
//   ITEM_DEFS 7195→6854、byKey 8109 键零丢失、同 vid 双键对 327→0。
// 本套件由批次A「字段搬移差异清零」守卫改写为终态守卫：
//   ①同 vid 多 def=0（清理方案第 6 步终态断言转正,永久锁,防双键注册再犯）
//   ②影子键别名解析锁（撤注册不删键——save.test/item-retirement 的蛇形键反查、
//     idNames.generated ITEM_KEY_TO_ID、SpriteAtlas 键映射、SaveFile legacyItemIndex
//     快照键全部依赖键可解析;别名还必须指向权威 def=VANILLA_ITEM_KEY_BY_ID 同靶）
//   ③批次A搬移抽验保留（键全继续解析,断言语义不变）
// 历史沿革：批次A(2026-08-14)锁「驼峰独有字段=0」;288267a5(2026-08-21)VID_SEEN_IDX
//   按 vid 去重+Pascal 别名（对数 1227→611）;SW-BK1(2026-09-06)墙族 284 件试点
//   （611→327,基数守卫 ≥1200→≥600→≥320）;SW-BN1(2026-09-07)余量 341 件撤注册→
//   对数 0——基数守卫与「驼峰独有字段」断言随双键对消失一并退役（285 个 banner 族
//   placeStyle 预存红同批清偿：权威件独有 placeStyle=影子件注册序晚于 bannerStyleClassPs
//   类级回填循环恒未刷到,撤影子 def 后无对可差,且玩家实持权威件带 placeStyle 零行为差）。
import { describe, it, expect } from 'vitest';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

/** 同 vid 分组（vi_ 键;稳定 id = key 内嵌 vid 派生,分组即注册表拓扑） */
const defsByVid = (() => {
  const m = new Map<number, number[]>();
  ITEM_DEFS.forEach((d, i) => {
    const vm = /^vi_(\d+)_/.exec(d.key);
    if (!vm) return;
    const vid = Number(vm[1]);
    if (!m.has(vid)) m.set(vid, []);
    m.get(vid)!.push(i);
  });
  return m;
})();

describe('dual-key 归一终态锁（SW-BN1 2026-09-07）', () => {
  it('终态：同 vid 多 def = 0（清理方案第 6 步断言,防双键注册再犯）', () => {
    const dups: string[] = [];
    for (const [vid, idxs] of defsByVid) {
      if (idxs.length > 1) dups.push(`vid ${vid}: ${idxs.map((i) => ITEM_DEFS[i].key).join(' | ')}`);
    }
    expect(dups, `同 vid 多 def ${dups.length} 组:\n${dups.join('\n')}`).toEqual([]);
  });

  it('影子键别名解析锁：键仍在 byKey 且指向权威 def（VANILLA_ITEM_KEY_BY_ID 同靶）', () => {
    // 代表集:banner 首末件/banner-plus 双影子/f兜底(带 tile)/杂5/蛇形自身双注册/宝石橡树同键
    const shadowKeys: ReadonlyArray<readonly [string, number]> = [
      ['vi_1615_banner_b1', 1615], ['vi_2916_banner_b107', 2916], ['vi_5651_banner_b290', 5651],
      ['vi_3392_banner_b188', 3392], ['vi_3392_f3392', 3392], ['vi_3393_f3393', 3393],
      ['vi_2289_f2289', 2289], ['vi_2001_f2001', 2001], ['vi_2613_f2613', 2613],
      ['vi_5573_torch_gods_potion', 5573], ['vi_3823_brand_of_the_inferno', 3823],
      ['vi_4760_sergeants_united_shield', 4760], ['vi_4608_chum_bucket', 4608],
      ['vi_2422_hotline_fishing_hook', 2422],
      ['vi_122_molten_pickaxe', 122], ['vi_217_molten_hamaxe', 217],
      ['vi_1507_spectre_hamaxe', 1507], ['vi_5359_shellphone_spawn', 5359],
      ['vi_4851_GemTreeTopazSeed', 4851], ['vi_4857_GemTreeAmberSeed', 4857],
    ];
    for (const [sKey, sVid] of shadowKeys) {
      const si = ITEM_BY_KEY[sKey];
      expect(si, `影子键 ${sKey} 必须仍可解析（撤注册不删键）`).not.toBeUndefined();
      const aKey = VANILLA_ITEM_KEY_BY_ID[sVid];
      expect(aKey, `vid ${sVid} 必须有权威反查键`).not.toBeUndefined();
      const ai = ITEM_BY_KEY[aKey];
      // 蛇形自身双注册/宝石橡树同键：sKey===aKey 或 sKey 与权威键同 def
      expect(si, `${sKey} 应与权威 def ${aKey} 同靶（别名机制）`).toBe(ai);
    }
  });

  it('归一后权威面抽验：banner placeStyle/钓饵锚 tile/宝箱 tile 落在唯一 def', () => {
    // banner 族权威件独有 placeStyle（bannerStyleClassPs 类级回填）——别名后从蛇形键
    // 也能取到（影子件撤注册前此断言恒红,SW-BN1 清偿）
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_1615_banner_b1']].placeStyle).toBe(22);   // :19231 placeStyle=22+type-1615
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_5651_banner_b290']].placeStyle).toBe(313); // 1457 Item.cs:44398 DefaultToBanner(313)
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_2001_f2001']].placeStyle).toBe(8);        // 蝶族变体 1+2001-1994
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_2613_f2613']].tile).toBe('chest');        // createTile 21 双源回填
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_4851_GemTreeTopazSeed']].value).toBe(100); // 取后注册者（显式件）
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_4857_GemTreeAmberSeed']].placeStyle).toBe(6);
  });
});

describe('双键清理批次A：字段搬移抽验（键继续解析,语义保留）', () => {
  it('搬移抽验：挖掘力三件套（tool/axePower）落进注册 def', () => {
    // vi_579_drax：pick 200 + axe 22（VANILLA_TOOL_POWERS 源数据，曾只落在驼峰 def）。
    // 2026-08-22 F1 工具节奏修复：回填循环把 itemCombat 的 speed/useTime/damage/
    // knockback + 三力（pickPower/axePower/hammerPower）一并桥进 tool——此处按
    // Object.asymmetricMatch 抽核心力/节奏字段，不再钉全对象形状
    const drax = ITEM_DEFS[ITEM_BY_KEY['vi_579_drax']];
    expect(drax.tool).toMatchObject({ type: 'pick', power: 200, pickPower: 200, axePower: 22, useTime: 7, speed: 25 });
    expect(drax.axePower).toBe(22);
    // vi_122_molten_pickaxe：pick 100（SW-BN1 后 = 工具力块注册件,tool 经回填全量）
    const molten = ITEM_DEFS[ITEM_BY_KEY['vi_122_molten_pickaxe']];
    expect(molten.tool).toMatchObject({ type: 'pick', power: 100, useTime: 18, speed: 23 });
    // vi_1305_the_axe：hammer 100 + axe 35
    const axe = ITEM_DEFS[ITEM_BY_KEY['vi_1305_the_axe']];
    expect(axe.tool).toMatchObject({ type: 'hammer', power: 100, hammerPower: 100, axePower: 35, useTime: 7 });
    expect(axe.axePower).toBe(35);
  });

  it('搬移抽验：value / wireTool / 锚桩 tile 落进注册 def', () => {
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_109_mana_crystal']].value).toBe(1);
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_1291_life_fruit']].value).toBe(1);
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_509_red_wrench']].wireTool).toEqual({ place: 1 });
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_4379_wyvern_kite']].tile).toBe('v_723_kite_anchor');
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_4375_rat']].tile).toBe('v_724_critter_anchor');
  });
});
