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

// ★拍板#6A（2026-09-18，BJ114-b 定谳翻案收尾）：10140 place_v_225_hive_block 读档
// remap 退役。原版 1124 蜂巢【不可放置】（Item.cs case 1124 :13836-13845 无
// createTile；createTile=225 属 case 1129 蜂巢魔杖 :13889-13895；vanilla.json 游戏数据
// 1124=null/1129=225 双源同证）。place_v_225_hive_block = tile 自动注册面（items.ts
// 阶段 5）自造放置面，稳定 id 10140 在 RETIRED_VID_TABLE 豁免（place_v_* 不退役）→
// 旧漏斗不覆盖，旧档持 10140 读档仍落到自动 def=可放置（与原版分叉）。
// remap 在 src/data/itemMigration.ts 尾部：10140 读档方向覆写 → vi_1124_Hive。
describe('拍板#6A:10140 place_v_225_hive_block 读档 remap（BJ114-b 翻案）', () => {
  it('旧档稳定 id 10140 读入归一 vi_1124_Hive（物品身份归正）', () => {
    const hiveId = ITEM_INTERNAL_OF_STABLE.get(10140);
    expect(hiveId, '10140 读档 remap 缺失——变异点：摘 itemMigration 尾部 10140 覆写块必红').toBeDefined();
    const key = ITEM_DEFS[hiveId!].key;
    expect(key).toMatch(/^vi_1124_/);      // =原版物品 id 1124（驼峰权威,勿手拼键）
  });

  it('迁移目标不可放置=原版同相（1124 无 createTile,只有 1129 魔杖可放 tile 225）', () => {
    const hiveId = ITEM_INTERNAL_OF_STABLE.get(10140)!;
    expect(ITEM_DEFS[hiveId].tile).toBeUndefined();   // def 无 tile=tryPlace 无落点
  });

  it('place_v_225_hive_block 自动 def 仍在库且存盘方向稳定 id 不变（零平移,单向漏斗）', () => {
    const pv = ITEM_BY_KEY['place_v_225_hive_block'];
    expect(pv, '自动注册面被删=内部 id 平移事故(见 items.ts 零下标平移注)').toBeDefined();
    expect(ITEM_STABLE_OF_INTERNAL[pv]).toBe(10140);   // 存盘仍写 10140,读入时归一
  });
});

describe('D1 稳定 id 闸门（2026-08-21;方案 A 恒等域重钉 BJ264 2026-09-22）', () => {
  it('全 def 必有稳定 id（恒等域:实件 stable≡下标≡读档反查;0 号位=空洞）', () => {
    // 表建在 items.ts 文件尾（全部注册之后）+ 文件尾 reorder pass 重排为 internal≡stable。
    // 方案 A 稀疏域：ITEM_DEFS 含洞（0 号位=原版 netID 0 语义等无 def 位）——洞位写向
    // 表=i（恒等良定义）,读向表无条目（get()=undefined→消费端 ?? 0 兜底）。实件必须
    // 恒等,否则存盘/读档丢物（D1 事故家族,2026-08-21 曾吞敌旗 290+钓鱼 35+具名 5 件）。
    expect(ITEM_STABLE_OF_INTERNAL.length).toBe(ITEM_DEFS.length);
    expect(ITEM_DEFS[0]).toBeUndefined();                 // 0 号位=空洞（原版 netID 0 语义）
    const bad: string[] = [];
    let occupied = 0;
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      const d = ITEM_DEFS[i];
      if (!d) continue;
      occupied++;
      if (ITEM_STABLE_OF_INTERNAL[i] !== i) bad.push(`#${i} ${d.key} 写向≠恒等`);
      // 读向恒等带唯一有意豁免:10140 蜂巢读档单向漏斗（itemMigration 尾部覆写
      //   10140→vi_1124 内部 id;拍板#6A/BJ114-b）——恒等域下仅存非恒等映射
      const wantHive = i === 10140;
      const got = ITEM_INTERNAL_OF_STABLE.get(i);
      if (wantHive ? !/^vi_1124_/.test(ITEM_DEFS[got ?? -1]?.key ?? '') : got !== i) {
        bad.push(`#${i} ${d.key} 反查失败`);
      }
    }
    expect(bad, JSON.stringify(bad.slice(0, 10))).toEqual([]);
    expect(occupied).toBe(6856);   // BJ150 普查实件数（注册面变更须有意识重钉）
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
      expect(ITEM_DEFS[back!].key).toMatch(/^vi_/);   // 上一行已断言 defined(反查失败即红)
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
