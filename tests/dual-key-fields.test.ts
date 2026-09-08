// dual-key 注册归一守卫（docs/dual-key-cleanup-plan.md）。
// ★SW-BN1 2026-09-07 终态改写：二期归一化把「同 vid 多 def」清零——
//   banner×290＋f兜底×35＋杂×5 蛇形影子 def 撤注册（键别名到权威驼峰 def,同构
//   SW-BK1 墙族 284 件试点）；蛇形自身双注册 122/217/1507/5359 撤首注册（保 byKey
//   现指向）；4851-4857 宝石橡树自动孤儿 def 跳过（取后注册者=显式件）。
//   ITEM_DEFS 7195→6854、byKey 8109 键零丢失、同 vid 双键对 327→0。
// ★SW-BN4 2026-09-08 锁升级（三期全域收官——BN1 落地后独立探针三视角复算：
//   vid/stable-id/同键多 def 全 0,BJ16 时代「339 组同 stable id 双 def」已清）：
//   ①同 vid 多 def=0（原锁保持）②同键重复注册=0（全域含非 vi_ 键——ITEM_BY_KEY
//   静默覆写类,4851-4857 同族）③同 stable id 多 def=0（BJ16 判词转正为锁,稳定 id
//   表第三视角）④byKey 全 vi_ 键别名一致性域扫（逐键同靶 VANILLA_ITEM_KEY_BY_ID
//   [vid],替代 20 代表抽验;豁免 vi_4143_manacloakstar=唯一无权威反查件,vanilla.json
//   无 vid 4143 的显式手注册）⑤banner 族键基数锁 290＋placeStyle 全域回填锁
//   （权威 def 290/290 placeStyle defined 且 =BANNER_STYLE_BY_VID;类级回填循环
//   items.ts:1268 先于别名块 :1662,权威 def 恒刷到——BN1 前影子件注册序靠后恒漏
//   =285 预存红,已随 BN1 清偿）⑥f 兜底族键基数锁 35。
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
//   类级回填循环恒未刷到,撤影子 def 后无对可差,且玩家实持权威件带 placeStyle 零行为差）;
//   SW-BN4(2026-09-08)全域三视角多 def=0 复算+锁扩面（本批,BN1 归一化的永久守卫升级,
//   零 items.ts 改动——归一化结构 BANNER_VID_RUNS/SWBN1_MISC5_KEYS/SWBN1_F_FALLBACK_VIDS/
//   4851-4857 跳过支已在盘上,本批仅把抽验级守卫升为全域守卫）。
import { describe, it, expect } from 'vitest';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_STABLE_OF_INTERNAL } from '../src/data/items';
import { BANNER_STYLE_BY_VID } from '../src/data/vanillaStyleDrops';

const VID_RE = /^vi_(\d+)_/;

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

/** 同键字符串分组（全域含非 vi_ 键;同键双 def = ITEM_BY_KEY 静默覆写类,4851-4857 同族） */
const defsByKeyStr = (() => {
  const m = new Map<string, number[]>();
  ITEM_DEFS.forEach((_, i) => {
    const k = ITEM_DEFS[i].key;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(i);
  });
  return m;
})();

/** 同 stable id 分组（稳定 id 表第三视角;0=无稳定 id 哨兵不入组） */
const defsByStable = (() => {
  const m = new Map<number, number[]>();
  ITEM_DEFS.forEach((_, i) => {
    const s = ITEM_STABLE_OF_INTERNAL[i];
    if (!s) return;
    if (!m.has(s)) m.set(s, []);
    m.get(s)!.push(i);
  });
  return m;
})();

describe('dual-key 归一终态锁（SW-BN1 2026-09-07 落地；SW-BN4 2026-09-08 全域扩面）', () => {
  it('终态：同 vid 多 def = 0（清理方案第 6 步断言,防双键注册再犯）', () => {
    const dups: string[] = [];
    for (const [vid, idxs] of defsByVid) {
      if (idxs.length > 1) dups.push(`vid ${vid}: ${idxs.map((i) => ITEM_DEFS[i].key).join(' | ')}`);
    }
    expect(dups, `同 vid 多 def ${dups.length} 组:\n${dups.join('\n')}`).toEqual([]);
  });

  it('终态：同键重复注册 = 0（全域含非 vi_ 键;同键双 def=ITEM_BY_KEY 静默覆写类）', () => {
    const dups: string[] = [];
    for (const [k, idxs] of defsByKeyStr) {
      if (idxs.length > 1) dups.push(`${k} ×${idxs.length}`);
    }
    expect(dups, `同键重复注册 ${dups.length} 组:\n${dups.join('\n')}`).toEqual([]);
  });

  it('终态：同 stable id 多 def = 0（BJ16「同 stable id 双 def」判词转正为永久锁）', () => {
    const dups: string[] = [];
    for (const [s, idxs] of defsByStable) {
      if (idxs.length > 1) dups.push(`stable ${s}: ${idxs.map((i) => ITEM_DEFS[i].key).join(' | ')}`);
    }
    expect(dups, `同 stable id 多 def ${dups.length} 组:\n${dups.join('\n')}`).toEqual([]);
  });

  it('全域别名一致性域扫：byKey 每个 vi_ 键与 VANILLA_ITEM_KEY_BY_ID[vid] 同靶（SW-BN4,替代代表抽验）', () => {
    const fail: string[] = [];
    let swept = 0;
    for (const k of Object.keys(ITEM_BY_KEY)) {
      const m = VID_RE.exec(k);
      if (!m) continue;
      const aKey = VANILLA_ITEM_KEY_BY_ID[Number(m[1])];
      if (aKey === undefined) continue; // 无权威反查件（探针定谳唯 vi_4143_manacloakstar,显式手注册）
      swept++;
      if (ITEM_BY_KEY[k] !== ITEM_BY_KEY[aKey]) {
        fail.push(`${k} → def#${ITEM_BY_KEY[k]} ≠ 权威 ${aKey} → def#${ITEM_BY_KEY[aKey]}`);
      }
    }
    expect(fail, `别名失靶 ${fail.length}/${swept} 键:\n${fail.slice(0, 20).join('\n')}`).toEqual([]);
    // 覆盖面地板 = VANILLA_ITEM_KEY_BY_ID vid 数（每 vid 至少 1 个 vi_ 键可扫;
    // 现值 7430 = 6175 vid + 1255 影子/别名键）——别名机制或键空间塌缩即破地板
    expect(swept, '域扫覆盖面塌缩（vi_ 键/权威反查大幅减少?）').toBeGreaterThanOrEqual(
      Object.keys(VANILLA_ITEM_KEY_BY_ID).length,
    );
  });

  it('banner 族终态：键基数 290、0 兜底注册、placeStyle 全域回填（类级循环 BANNER_STYLE_BY_VID 同靶）', () => {
    const keys = Object.keys(ITEM_BY_KEY).filter((k) => /^vi_\d+_banner_b\d+$/.test(k));
    expect(keys, 'banner 影子键基数（BANNER_VID_RUNS 13 段合计;增删段须有意识过闸）').toHaveLength(290);
    const noAuth: string[] = [];
    const psMissing: string[] = [];
    const psMismatch: string[] = [];
    for (const k of keys) {
      const vid = Number(VID_RE.exec(k)![1]);
      const aKey = VANILLA_ITEM_KEY_BY_ID[vid];
      if (aKey === undefined) { noAuth.push(k); continue; } // 走兜底注册支=影子 def 复活
      const ps = ITEM_DEFS[ITEM_BY_KEY[k]].placeStyle;
      if (ps === undefined) { psMissing.push(k); continue; }
      const st91 = BANNER_STYLE_BY_VID[vid];
      if (st91 !== undefined && ps !== st91) psMismatch.push(`${k}: ${ps} ≠ ${st91}`);
    }
    expect(noAuth, 'banner 兜底注册必须为 0（290/290 有权威 def;vanilla.json 缺件才走兜底支）').toEqual([]);
    expect(psMissing, 'banner placeStyle 缺失（类级回填循环未刷到权威 def?）').toEqual([]);
    expect(psMismatch, 'banner placeStyle 与 BANNER_STYLE_BY_VID 失配').toEqual([]);
  });

  it('f 兜底族终态：键基数 35、0 兜底注册（杂 5 键无 _f<vid> 后缀,在下方代表集单独钉）', () => {
    const keys = Object.keys(ITEM_BY_KEY).filter((k) => /^vi_\d+_f\d+$/.test(k));
    expect(keys, 'f 兜底影子键基数（SWBN1_F_FALLBACK_VIDS;增删须有意识过闸）').toHaveLength(35);
    const noAuth = keys.filter((k) => VANILLA_ITEM_KEY_BY_ID[Number(VID_RE.exec(k)![1])] === undefined);
    expect(noAuth, 'f 族兜底注册必须为 0').toEqual([]);
  });

  it('影子键别名解析锁：代表集（撤注册不删键;钉非 _banner_bN/_f<vid> 命名类）', () => {
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
      const ai = ITEM_BY_KEY[aKey!];
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
