// ============================================================================
// SW-BJ42 魔法海螺（Magic Conch, vid 4263）获得链回归守卫
//
// ★定谳（2026-09-09，1457 终值；1458 同域核对零变更）：
//   用户实报"世界里没有生成魔法海螺，应该 100% 会有"——**原版语义并非 100%**：
//   ① 世界生成面（Terarria1457/Terraria/WorldGen.cs:36404-36427）：
//      沙漠箱主件门 = (tile467&&style10) || ((tile21&&style42)&flag16) ||
//                    (num10==0 && y≤h-205 && IsUndergroundDesert(:36136-36157))。
//      深度分位 flag20(:36422) = y > (desertHiveHigh*3+desertHiveLow*4)/7：
//        浅层(:36424 前支) = SelectRandom{4056 AncientChisel, 4055 Dunerider
//        Boots, 4262 Snake Charmer's Flute, 4263 Magic Conch} = **1/4 每箱**；
//        深层(:36424 后支) = SelectRandom{4061 Storm Spear, 4062 Thunder Zapper,
//        4276 Bast Statue} = 1/3 每箱，**无海螺**。
//      ⇒ 小世界沙岩箱 ~20 只、浅层主件 ~5 只 ⇒ P(整世界零海螺) ≈ (3/4)^5 ≈ 24%
//        ——实机 6 种子普查：种子 bj42-a / bj42-d 两世界零海螺=原版本相。
//   ② 钓匣面（Terarria1457/Terraria/Player.cs:8052 OpenFishingCrate; 绿洲匣支
//      :8746-8777）：Oasis Crate 4407 / Mirage Crate 4408 开匣 **必得**八选一
//      （:8748 maxValue=1 ⇒ Next(1)==0 恒真）＝ 1/8 海螺（:8759 `_ => 4263`）；
//      附加 1/4 ScarabBomb 4423×4-6(:8763)、1/2 FossilOre 3380×10-16(:8770)、
//      1/35 SandstorminaBottle 857(:8776 后段)。匣子由沙漠钓鱼上钩
//      （src/data/vanilla-fishing.json rules[29]/[30] CrateDrops+ZoneDesert）。
//   ③ 仓库两面 1:1（vanilla/BuriedChestsPass.ts:1344-1348 + vanillaFishingCrates
//      .ts:244-253），**无需修复**；本测试=防回滚 tripwire + 决定论统计。
//
// ★红蓝自审（变异实验证判别力，2026-09-09 实跑记录）：
//   M1 箱表换 4263→4056（vanilla/BuriedChestsPass.ts:1348）：6 种子海螺 7→0，
//      主件分布计数不变（掷流零扰动，仅值换）——普查面判别力 ✓（已回滚）。
//   M2 匣表换 4263→4056（vanillaFishingCrates.ts:247）：80k 开匣 conch=0，
//      D 断言爆红 ✓（已回滚）。
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TILE_DEFS } from '../src/data/tiles';
import { openFishingCrate } from '../src/data/vanillaFishingCrates';
import { seededRandom } from './seeded-rng';
import type { World } from '../src/world/World';

const ROOT = join(__dirname, '..');
// 1457 WorldGen.cs:36424 两池 + Player.cs:8750-8759 八选一
const SHALLOW_1457 = [4056, 4055, 4262, 4263];
const DEEP_1457 = [4061, 4062, 4276];
const OASIS_1457 = [4056, 4442, 4055, 4061, 4062, 4276, 4262, 4263];
const DESERT_ALL = new Set([...SHALLOW_1457, ...DEEP_1457]);

function vidOfInternal(internalId: number): number {
  const key = ITEM_DEFS[internalId]?.key ?? '';
  const m = /^vi_(\d+)_/.exec(key);
  return m ? parseInt(m[1], 10) : -1;
}

function sheetOfTileType(type: number): number {
  return TILE_DEFS[type]?.vanilla?.sheet ?? -1;
}

describe('SW-BJ42 魔法海螺获得链', () => {
  it('A. 金标表完备性 tripwire（vanilla/legacy 箱表 + 钓匣表 + 深度门）', () => {
    // 箱表：活跃管线 vanilla/BuriedChestsPass.ts:1346-1348（深/浅两池字面量）
    const vanillaSrc = readFileSync(join(ROOT, 'src/world/gen/vanilla/BuriedChestsPass.ts'), 'utf8');
    expect(vanillaSrc).toMatch(/\[4061, 4062, 4276\]\[rng\.int\(0, 2\)\]/);
    expect(vanillaSrc).toMatch(/\[4056, 4055, 4262, 4263\]\[rng\.int\(0, 3\)\]/);
    // 深度门公式（cs:36422；曾整缺=全箱恒浅/恒深）与 IsUndergroundDesert ±15 扫描门
    expect(vanillaSrc).toContain('gy > (gs.desertHiveHigh * 3 + gs.desertHiveLow * 4) / 7');
    expect(vanillaSrc).toContain('wl === 187 || wl === 216');   // cs:36152-36154 沙岩墙
    // legacy 副本（CaveHouse 等旧链仍引用,同表防漂）
    const legacySrc = readFileSync(join(ROOT, 'src/world/gen/BuriedChestsPass.ts'), 'utf8');
    expect(legacySrc).toContain('[4061, 4062, 4276][rng.int(0, 2)]');
    expect(legacySrc).toContain('[4056, 4055, 4262, 4263][rng.int(0, 3)]');
    // 钓匣表：vanillaFishingCrates.ts:247（4407/4408 共支八选一）
    const crateSrc = readFileSync(join(ROOT, 'src/data/vanillaFishingCrates.ts'), 'utf8');
    expect(crateSrc).toContain('[4056, 4442, 4055, 4061, 4062, 4276, 4262, 4263][rnd.next(8)]');
    // 沙漠钓鱼上钩（CrateDrops 规则含 4407/4408,ZoneDesert 门）
    const fishing = JSON.parse(readFileSync(join(ROOT, 'src/data/vanilla-fishing.json'), 'utf8')) as {
      rules: Array<{ items: number[]; conditions: Array<{ t: string }> }>;
    };
    const crateItems = fishing.rules.filter((r) => r.conditions.some((c) => c.t === 'crate')).flatMap((r) => r.items);
    expect(crateItems).toContain(4407);
    expect(crateItems).toContain(4408);
  });

  it('B. 物品注册/vid 解析/本地化名', () => {
    // 规范键 = 反编译常量名驼峰（items.ts 自动注册循环），snake_case 为别名
    expect(VANILLA_ITEM_KEY_BY_ID[4263]).toBe('vi_4263_MagicConch');   // vid→key 反解（宝箱 loot push 通道）
    expect(ITEM_BY_KEY['vi_4263_MagicConch']).toBeGreaterThan(0);      // 注册位（实为 131）
    expect(ITEM_BY_KEY['vi_4263_magic_conch']).toBe(ITEM_BY_KEY['vi_4263_MagicConch']);   // 别名同位
    // 同族沙漠主件全部注册（缺任一=push 通道 vid()=-1 静默丢件——史前教训）
    for (const v of [4056, 4055, 4262, 4061, 4062, 4276]) {
      const key = VANILLA_ITEM_KEY_BY_ID[v];
      expect(key, `vid ${v}`).toMatch(/^vi_/);
      expect(ITEM_BY_KEY[key!], key).toBeGreaterThan(0);
    }
    // 展示名（ItemName.MagicConch,repo idNames.generated '4263'→'MagicConch'）
    for (const lang of ['en-US', 'zh-Hans']) {
      const l10n = JSON.parse(readFileSync(join(ROOT, `public/l10n/${lang}.json`), 'utf8')) as Record<string, Record<string, string>>;
      expect(l10n.ItemName?.MagicConch, lang).toBeTruthy();
    }
  });

  it('C. 世界生成面 6 种子普查（决定论）：浅层 1/4 池含海螺、深层池无海螺', async () => {
    const perSeed: Array<{ seed: string; mains: number; conch: number }> = [];
    let shallowMains = 0;
    let deepMains = 0;
    let conchShallow = 0;
    let conchDeep = 0;
    for (const seed of ['bj42-a', 'bj42-b', 'bj42-c', 'bj42-d', 'bj42-e', 'bj42-f']) {
      const world: World = await generateWorld({ width: 4200, height: 1200, seedText: seed });
      const st = world.store;
      const gs = lastGenState();
      const thr = (gs!.desertHiveHigh * 3 + gs!.desertHiveLow * 4) / 7;   // cs:36422
      let mains = 0;
      let conch = 0;
      for (const c of world.chests) {
        const t = st.inBounds(c.x, c.y) && st.flags[st.idx(c.x, c.y)] ? st.type[st.idx(c.x, c.y)] : -1;
        if (sheetOfTileType(t) !== 467) continue;         // 沙岩箱组(TileID 467)
        const vids = c.items.filter(Boolean).map((it) => vidOfInternal(it!.id));
        const main = vids.find((v) => DESERT_ALL.has(v));
        if (main === undefined) continue;                 // 467 组含冰箱(style24)等非沙漠箱
        mains++;
        if (c.y > thr) {
          deepMains++;
          if (main === 4263) conchDeep++;                 // 1457 深池无海螺=恒 0
        } else {
          shallowMains++;
          if (main === 4263) { conchShallow++; conch++; }
        }
      }
      perSeed.push({ seed, mains, conch });
      expect(mains, `${seed} 沙漠主件数`).toBeGreaterThanOrEqual(6);
    }
    // 浅层池 1/4：6 种子 27 浅层主件中海螺 7（≈25.9%,χ² p≈0.77）——变异 M1 后归 0（见文件头）
    expect(shallowMains).toBeGreaterThanOrEqual(20);
    expect(deepMains).toBeGreaterThanOrEqual(12);
    expect(conchShallow).toBeGreaterThanOrEqual(5);
    expect(conchShallow).toBeLessThanOrEqual(9);
    expect(conchDeep).toBe(0);                            // 深层池{4061,4062,4276}无海螺
    expect(perSeed.filter((r) => r.conch > 0).length).toBeGreaterThanOrEqual(3);   // 基线实为 4/6 种子命中
  }, 900000);

  it('D. 钓匣面 80k 统计：绿洲匣必得八选一、海螺≈1/8', () => {
    const counts = new Map<number, number>();
    let specials = 0;
    const rand = seededRandom(42);
    const rnd = { next: (a: number, b?: number) => (b === undefined ? Math.floor(rand() * a) : a + Math.floor(rand() * (b - a))) };
    const give = (v: number, _stack?: number) => {
      if (OASIS_1457.includes(v)) { specials++; counts.set(v, (counts.get(v) ?? 0) + 1); }
    };
    for (let i = 0; i < 80000; i++) openFishingCrate(4407, give, rnd, {});
    expect(specials).toBe(80000);                         // maxValue=1 恒真（cs:8641/:8748）
    for (const v of OASIS_1457) {
      const n = counts.get(v) ?? 0;
      expect(n, `vid ${v}`).toBeGreaterThan(8000);        // 八路均匀（基线 9843-10134）
      expect(n, `vid ${v}`).toBeLessThan(12000);
    }
    expect(counts.get(4263)! / 80000).toBeGreaterThan(0.11);   // ≈1/8（基线 0.1253）
    expect(counts.get(4263)! / 80000).toBeLessThan(0.14);
  }, 300000);
});
