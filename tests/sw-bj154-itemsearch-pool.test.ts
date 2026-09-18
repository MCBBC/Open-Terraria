// ★SW-BJ154 2026-09-19 —— 道具搜索池全量对齐守卫（用户实报：搜索面"道具不全，
// 史莱姆鞍 Slimy Saddle 2430 没看到"）。
//
// 定谳（BJ154）：遍历源无缺（ITEM_DEFS 6856 def / vid 域 6177 全覆盖，2430 走桥接
// 批 items.ts 注册、池序 464 在池、死条目滤不涉——鞍无 tile）；真凶=呈现层两刀：
//   ①渲染 80 条封顶（池序 464 > 80，浏览式打开永远看不到）；
//   ②匹配串无族词桥（官方 zh 名"粘鞍"不含"史莱姆"，tooltip"召唤可骑乘的史莱姆
//     坐骑"是唯一官方语汇桥）。
// 修法：①匹配串扩官方 tooltip 桥（itemSearch.buildItemSearchPool 单源）；
//   ②渲染面全量虚拟滚动（UI.ts，80 封顶废止）。
//
// 变异证红纪律：摘 tipOf 注入（池桥断）→「史莱姆命中 2430」红；池滤 2430/恢复
// 80 封顶 → 计数与结构锁红（人工变异须爆红后还原）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID, vanillaItemCreateTile } from '../src/data/items';
import { isFunctionalTileItem } from '../src/world/evolution/PlantRules';
import { ITEM_NAME_BY_ID } from '../src/i18n/idNames.generated';
import { buildItemSearchPool } from '../src/ui/itemSearch';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const uiSrc = read('src/ui/UI.ts');

// ---- 生产同源 l10n 产物直读（Lang.itemNameByKey/ItemTooltip 的 zh 链终值） ----
const zh = JSON.parse(read('public/l10n/zh-Hans.json')) as {
  ItemName: Record<string, string>;
  ItemTooltip: Record<string, string>;
};
const nameOf = (key: string): string => {
  const m = /^vi_(\d+)_/.exec(key);
  const internal = m ? ITEM_NAME_BY_ID[Number(m[1])] : undefined;
  return (internal && zh.ItemName[internal]) || '';
};
const tipOf = (vid: number): string => {
  const internal = ITEM_NAME_BY_ID[vid];
  return (internal && zh.ItemTooltip[internal]) || '';
};

describe('SW-BJ154 ①搜索池全量对齐（遍历源=全集域,零缺席）', () => {
  const pool = buildItemSearchPool({ nameOf, tipOf });
  const poolVids = new Set(pool.map((e) => e.vid).filter((v): v is number => v !== null));
  const allVids = Object.keys(VANILLA_ITEM_KEY_BY_ID).map(Number);
  const missing = allVids.filter((v) => !poolVids.has(v));

  it('2430 史莱姆鞍在池（用户实报件;遍历源/过滤器均不涉它）', () => {
    const e = pool.find((x) => x.vid === 2430);
    expect(e).toBeDefined();
    expect(e!.key).toBe('vi_2430_slimy_saddle');
    expect(e!.name).toBe('粘鞍');   // 官方 zh 终值（idNames/zh-Hans 同源）
  });

  it('全集 6177 vid 零真缺席（池域 ∪ place_v 覆盖死条目域 = 全集）', () => {
    // missing = 全集中池外的 vid = 被 place_v 覆盖的惰性死条目域（其方块语义由
    // place_v 件承载=可搜域不缺）。missing 内混入任何非死条目 vid = 真漏件（红）。
    const coveredSheets = new Set<number>();
    for (const d of ITEM_DEFS) {
      const mp = /^place_v_(\d+)_/.exec(d.key);
      if (mp) coveredSheets.add(Number(mp[1]));
    }
    const notDead = missing.filter((vid) => {
      const ct = vanillaItemCreateTile(vid);
      return !(ct !== -1 && coveredSheets.has(ct) && !isFunctionalTileItem(ct));
    });
    expect(notDead).toEqual([]);   // 池外域必须全是死条目（真漏件=红）
    expect(missing.length).toBeGreaterThan(0);   // 死条目域确实存在（防 vacuous）
    // 计数恒等式（+1 = 域外件 4143,见下）;2430 必须在池侧
    expect(poolVids.size + missing.length).toBe(allVids.length + 1);
    expect(poolVids.has(2430)).toBe(true);
    // 域外件快照:池 vid 域可比全集多（SW 手写子件）,现仅 4143 法力斗篷星
    // （vanilla.json 素材域外的按需注册件,非玩家常规可得）——新增域外件须有意重锚
    const extra = [...poolVids].filter((v) => !new Set(allVids).has(v));
    expect(extra).toEqual([4143]);
  });

  it('池条目数快照（6856 def − 死条目;注册面变化须有意重锚）', () => {
    // 2026-09-19 定值:6856 def 全量 − 2040 个被 place_v 覆盖的死 vid = 4816
    expect(pool.length).toBe(4816);
    expect(ITEM_DEFS.length).toBe(6856);   // BJ146 全量口径锚
  });
});

describe('SW-BJ154 ②族词桥（真凶②:官方 zh 名不带族词,tooltip 语汇入搜）', () => {
  const pool = buildItemSearchPool({ nameOf, tipOf });

  it('搜"史莱姆"命中 2430 粘鞍（tooltip"召唤可骑乘的史莱姆坐骑"桥）', () => {
    const e = pool.find((x) => x.vid === 2430)!;
    expect(e.lc).toContain('史莱姆');
    expect(e.lc.includes('史莱姆')).toBe(true);
  });

  it('搜"slimy"/"saddle"命中 2430（英文名桥,BJ81 既有语义不回退）', () => {
    const e = pool.find((x) => x.vid === 2430)!;
    expect(e.lc).toContain('slimy saddle');
  });

  it('无 tipOf 注入时 2430 不命中"史莱姆"（桥判别力自证）', () => {
    const bare = buildItemSearchPool({ nameOf });
    const e = bare.find((x) => x.vid === 2430)!;
    expect(e.lc).not.toContain('史莱姆');
  });
});

describe('SW-BJ154 ③渲染面全量虚拟滚动（真凶①:80 封顶废止）', () => {
  it('80 条封顶死码不复存在（旧"…更多结果请细化搜索"截断面摘除）', () => {
    expect(uiSrc.includes('shown > 80')).toBe(false);
    expect(uiSrc.includes('…更多结果请细化搜索')).toBe(false);
  });

  it('虚拟滚动三锚:spacer+ResizeObserver 列宽自适应+关面板 disconnect', () => {
    expect(uiSrc).toMatch(/const spacer = el\('div'\);/);
    expect(uiSrc).toMatch(/new ResizeObserver\(\(\) => layout\(\)\)/);
    expect(uiSrc).toMatch(/closeItemSearch\(\) \{[\s\S]{0,400}itemSearchResizeOb\?\.disconnect\(\)/);
  });

  it('BJ81 结构锁不回退:条目按下即取+长按起拍（e.id 同名锚）', () => {
    expect(uiSrc).toMatch(
      /item\.addEventListener\('mousedown', \(ev\) => \{[\s\S]{0,160}this\.itemSearchGrab\(e\.id\);[\s\S]{0,120}this\.startItemSearchGrabRepeat\(e\.id\);/,
    );
    expect(uiSrc).toMatch(/openItemSearchPanel\(\) \{[\s\S]{0,700}this\.openInventory\(true\)/);
  });
});
