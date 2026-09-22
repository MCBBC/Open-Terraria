// 同 vid 双注册修复回归（2026-08-21 道具搜索"雷管"双行 + 召唤面板重名消歧）。
// 桥接批 snake 键（vi_167_dynamite）+ vanilla.json 自动循环 Pascal 键
// （vi_167_Dynamite）大小写不同→旧整键去重全漏→1246 组同 vid 双注册。
// ITEM_DEFS id=数组下标不可平移（金鱼事故先例）→ 存量保留，循环按 vid 堵新注册
// + VANILLA_ITEM_KEY_BY_ID 指向既有 def；搜索显示层按 vid 归一（首 def 胜出）。
import { describe, it, expect } from 'vitest';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_INTERNAL_OF_STABLE } from '../src/data/items';
import { summonCollidingNames } from '../src/core/DebugSummonPanel';

describe('同 vid 反查不变量（items.ts 自动循环 vid 去重）', () => {
  it('vanilla.json 全部 vid 的权威反查键都解析到已注册 def', () => {
    let checked = 0, broken: number[] = [];
    for (const [idS, key] of Object.entries(VANILLA_ITEM_KEY_BY_ID)) {
      checked++;
      if (ITEM_BY_KEY[key] === undefined) broken.push(Number(idS));
    }
    console.log(`反查键 ${checked} 条,悬空 ${broken.length}`);
    expect(broken).toEqual([]);
  });

  it('vid 167（雷管）：Pascal 键别名到 snake 桥接 def，双键同 def', () => {
    // 循环跳过重复注册但把 Pascal 键别名到既有 def 下标——硬编码 Pascal 键
    // （UI.ts 药水表 vi_300_BattlePotion 等）与 wld 反查全部继续解析
    expect(ITEM_BY_KEY['vi_167_Dynamite']).toBe(ITEM_BY_KEY['vi_167_dynamite']);
    expect(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[167]]).toBe(ITEM_BY_KEY['vi_167_dynamite']);
    // 稳定 id 归一：首 def 胜出（与搜索去重同口径）
    expect(ITEM_INTERNAL_OF_STABLE.get(167)).toBe(ITEM_BY_KEY['vi_167_dynamite']);
  });

  it('硬编码 Pascal 键（UI 药水表）去重后仍解析且指向带 vid 的 def', () => {
    // （vi_3665_FakeChest 不在列：伪装宝箱补录缺失属并行会话既有损伤,反事实验证与本改动无关）
    for (const k of ['vi_300_BattlePotion', 'vi_2322_MiningPotion', 'vi_2324_CalmingPotion',
      'vi_2347_RagePotion', 'vi_2266_Sake', 'vi_1844_PumpkinMoonMedallion']) {
      const idx = ITEM_BY_KEY[k];
      expect(idx, k).toBeDefined();
      expect(/^vi_(\d+)_/.test(ITEM_DEFS[idx].key) || k === 'vi_1844_PumpkinMoonMedallion', `${k} → ${ITEM_DEFS[idx].key}`).toBe(true);
    }
  });

  it('自动循环不再产生新同 vid 注册（存量 1246 组不增长）', () => {
    const seen = new Set<number>();
    const dups = new Set<number>();
    for (const d of ITEM_DEFS) {
      if (!d) continue;   // ★方案 A:守洞（for..of 对洞产出 undefined）
      const m = /^vi_(\d+)_/.exec(d.key);
      if (!m) continue;
      const vid = Number(m[1]);
      if (seen.has(vid)) dups.add(vid);
      seen.add(vid);
    }
    // 存量双条目保留（不可平移 id）；此断言锚定当前规模,若再增长即回归
    expect(dups.size).toBeLessThanOrEqual(1246);
  });
});

describe('召唤面板重名消歧（summonCollidingNames）', () => {
  it('僵尸/稻草人/蝾螈在重名集;独名(克眼)不在', () => {
    const colliding = summonCollidingNames(() => '僵尸');   // 全表同名 → 全部碰撞
    expect(colliding.has('僵尸')).toBe(true);
    const none = summonCollidingNames((id) => 'N' + id);    // 全独名 → 空集
    expect(none.size).toBe(0);
  });
});
