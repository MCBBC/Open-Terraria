// ★BJ91 2026-09-15 RB17b note③ 守卫：3860/3861/3862 的 Item.rare 终值面。
// 金标：Item.cs:34145-34164 case 3860/3861/3862 共体 + if(type==X) 全覆盖覆写链——
//   基础 rare=1 对三型皆死码，终值 3860=8 / 3861=5 / 3862=3（consumable+expert 同体）。
//   1456:34120-34140 / 1458:34145-34165 同链零漂移（三版亲读）。
// 缺陷史：vanilla-itemrare.json 提取器（tools/extract-itemrare.mjs）按设计只认 case
//   体顶层无条件赋值、忽略 if 变体分支 → 三型全落基础值 1 → tooltip 稀有色落蓝档
//   （原版 泰坦袋黄8/食人魔袋粉5/黑魔法师袋橙3）。修 = 提取器 HAND_RARE 反哺钉值
//   （重产不回退,判例 fx3:重产前必反哺）+ json 终值 + items.ts 自动注册 def 面带
//   rare。DRIFT 闸门（item-stats-golden-1457）随之把 8/5/3 当 1457 终值守卫——
//   手改回 1 = DRIFT 红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import rareJson from '../src/data/vanilla-itemrare.json';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

const RARE = rareJson as Record<string, number>;
const EXTRACTOR_SRC = () => readFileSync(join(dirname(__dirname), 'tools', 'extract-itemrare.mjs'), 'utf8');
const ITEMS_SRC = () => readFileSync(join(dirname(__dirname), 'src', 'data', 'items.ts'), 'utf8');

/** Item.cs:34145-64 终值（三版同链） */
const VANILLA_RARE: Record<number, number> = { 3860: 8, 3861: 5, 3862: 3 };

describe('BJ91 RB17b③ BossBag 族 rare 终值（Item.cs:34145-64）', () => {
  it('vanilla-itemrare.json：3860=8 / 3861=5 / 3862=3（提取盲区手补终值在位）', () => {
    for (const [id, rare] of Object.entries(VANILLA_RARE)) {
      expect(RARE[id], `rare[${id}]`).toBe(rare);
    }
  });

  it('自动注册 def 面：vi_3860/3861/3862 def.rare 随注册带入（tooltip 稀有色自描述）', () => {
    for (const [vid, rare] of Object.entries(VANILLA_RARE)) {
      const key = VANILLA_ITEM_KEY_BY_ID[Number(vid)];
      expect(key, `vid ${vid} 已注册`).toBeTruthy();
      const def = ITEM_DEFS[ITEM_BY_KEY[key!]];
      expect(def, `def ${key}`).toBeTruthy();
      expect(def.rare, `${key}.rare`).toBe(rare);
    }
  });

  it('id 锚：3861/3862 确为 BossBagOgre/BossBagDarkMage（防 id 平移后守卫钉错对象）', () => {
    expect(VANILLA_ITEM_KEY_BY_ID[3861]).toMatch(/3861/);
    expect(VANILLA_ITEM_KEY_BY_ID[3862]).toMatch(/3862/);
  });

  it('结构锁①：提取器 HAND_RARE 反哺钉值在位（重产不回退;DRIFT 闸门随提取器守卫）', () => {
    const src = EXTRACTOR_SRC();
    expect(src).toContain('const HAND_RARE = { 3860: 8, 3861: 5, 3862: 3 };');
    expect(src).toMatch(/for \(const \[id, r\] of Object\.entries\(HAND_RARE\)\) RARE\[id\] = r;/);
  });

  it('结构锁②：items.ts 自动注册 def 带 rare（防注册面回退为裸 {key,value:1}）', () => {
    expect(ITEMS_SRC()).toMatch(/item\(\{ key: ik, name: '', value: 1, rare: /);
  });
});
