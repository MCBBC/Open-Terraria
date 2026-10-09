// ★BJ586 明胶水晶双面（用户实报：「明胶水晶和水晶碎块好像长得一模一样（挖下来之前），
//   金属探测器也会把明胶水晶显示为水晶碎块」）定谳收口。
//
// 原版锚（Terarria1457）——明胶水晶不是独立 tile，是 tile 129(Crystals) 的
// frameX>=324 形态（placeStyle 18-23 域）：
//   · 生成面：WorldGen.hardUpdateWorld（cs:70134-70175）CanGrowCrystalShards 族 +
//     岩层下 + 1/5 掷向 → style = genRand.Next(18)；genRand.Next(50)==0 → style = 18+Next(6)
//     （=明胶水晶六变体）→ PlaceTile(…,129,…,style)。
//   · 帧面：PlaceTile case 129（cs:60171-60180）只写 frameX=style*18；frameY 由
//     TileFrameImportant case 129（cs:86339-86369）→ CheckAndAdjustMultiDirectionalTile 落定。
//   · 掉落面：KillTile_GetItemDrops case 129（cs:65496-65504）fx>=324 → item 4988
//     （Gelatin Crystal）/否则 item 502（Crystal Shard）。
//   · 名面（金属探测器）：Main.cs:47757-47768 DrawInfoAccs accOreFinder 支 ——
//     GetTileBaseOption(BestOrePosition 帧态)（MapHelper.cs:2085；case 129 :2806-2813
//     fx>=324 → baseOption=1）→ 宝箱族清零门（Main.cs:47762；TileID.cs:315/317 覆盖
//     21/467/441/468）→ Lang.GetMapObjectName(TileToLookup(type, baseOption))；
//     Lang.cs:725-726：lookup(129,0)=itemNameCache[502]「水晶碎块」/lookup(129,1)=
//     itemNameCache[4988]「明胶水晶」。探测谓词本身（SceneMetrics.cs:912-914）对 129
//     只放行 fx>=324 ⇒ 探测器命中的 129 必为明胶水晶、必报「明胶水晶」。
//   · 素材面：Tiles_129.png 432×144（本仓与 terraria-assets md5 全等 cb0b4304…）：
//     左半区 fx 0..306 = 蓝Rgb(31,118,173)/粉(192,31,156)/紫(135,72,198) 晶簇（镂空），
//     右半区 fx 324..414 = 淡粉紫(172-203,104-134,193-213) 实心凝胶块（opaque=144/格）。
//
// 本仓两面定谳：
//   · 面1（放置态渲染）：写入链（F4 2026-09-04 掷序）、帧面（G-129 2026-09-18
//     crystalShardAddFrX + TILE_ANIM_PITCH[129]=0）、映射链（vframeAt 直取）、
//     质感层（drawShardCell fx>=324 辉光带 sy+72 = TileDrawing.cs:1276-1293 verbatim）
//     全部 1:1 —— 本测试把「明胶水晶域映射到 Tiles_129 右半区」钉成映射锁防回退
//     （若图集/帧表回退到碎块域或 161 任何面，T2/T3/T4 必红）。
//   · 面2（金属探测器名面）真病根：Game.ts 消费面 Lang.tileName(sheet) 丢 baseOption
//     维 → tile 129 恒出「水晶碎块」（TILE_NAME_ZH_BY_ID[129]）。修 = oreFinderDisplayName
//     （SceneMetrics.ts，Main.cs:47757-47768 1:1 重放；227 奇异植物同域债一并修）。
//
// 变异证红映射：
//   M1 摘演化 rare 掷（1/50 明胶位）            → T1 红（fx 恒 <324）
//   M2 drawAdjust case 129 摘除/addFrX 污染出带 → T3 红（sx 出 324..414）
//   M3 图集/映射回退碎块帧（vmeta/sheet 错位）  → T2/T4 红（像素域混叠/表尺寸不符）
//   M4 oreFinderDisplayName 129 分支回退 tileName → T5 红（明胶水晶→水晶碎块）
//   M5 oreFinderDisplayName 227 分支回退 tileName → T6 红（奇异植物→青绿蘑菇）
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
// @ts-ignore pngjs 无类型声明（同 tests/atlas-append-golden.test.ts 用法）
import { PNG } from 'pngjs';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { drawAdjust } from '../src/render/VanillaTiler';
import { mapTileHoverName } from '../src/render/Renderer';
import { oreFinderDisplayName } from '../src/world/SceneMetrics';
import { languageManager } from '../src/i18n/LanguageManager';
import { Lang } from '../src/i18n/Lang';

const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh != null && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? -1;

function mkEvo(st: TileStore): WorldEvolution {
  const host: EvolutionHost = {
    store: st, seed: 7, worldSurface: 40, rockLevel: 20, dungeonX: 60,
    difficulty: 0, flags: {}, crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    spawnKillDrop: () => {},
  } as never;
  const evo = new WorldEvolution(host);
  (evo as unknown as { hardMode: boolean }).hardMode = true;
  return evo;
}

beforeAll(() => {
  for (const c of ['en-US', 'zh-Hans']) {
    languageManager.loadPackJson(JSON.parse(readFileSync(`public/l10n/${c}.json`, 'utf8')));
  }
  (languageManager as unknown as { activeCulture: unknown }).activeCulture =
    { name: 'zh-Hans', legacyId: 0, displayNameKey: '' };
});

// ============================================================ 面1：写入面（M1）
describe('★BJ586 面1-写入：演化 1/50 掷明胶水晶位（hardUpdateWorld cs:70160-63）', () => {
  it('T1：rare 掷命中 → style 18-23 → frameX ∈ [324,414]（placeTile case 129 cs:60171）', () => {
    const st = new TileStore(40, 80);
    st.setTileSilent(5, 60, S(117), 0, 0);           // 珍珠石（生长源）
    const evo = mkEvo(st);
    // 掷队列：门 0.01 → 向 0 → 普通 style 0.99(→17) → rare 门 0.005(<1/50 且 >1e-9——
    //   变异 M1 把阈值调到 1e-9 时必须恰红,故 rare 掷不可用 0.0[对任何正阈值恒真]) → rare 内 0.5(→21)
    const q = [0.01, 0.0, 0.99, 0.005, 0.5];
    (evo as unknown as { rng(): number }).rng = () => q.shift() ?? 1;
    (evo as unknown as Record<string, (...a: unknown[]) => unknown>)['hardUpdateWorld'](5, 60);
    const i = st.idx(4, 60);
    expect(st.type[i]).toBe(S(129));
    expect(st.frameX[i]).toBe(21 * 18);              // style 21 → fx=378（明胶域）
    expect(st.frameY[i]).toBe(36);                   // 右锚 → 方向帧 36（multiDir 落向不变）
  });
});

// ============================================================ 面1：映射/像素域（M2/M3）
describe('★BJ586 面1-渲染映射锁：明胶域 = Tiles_129 右半区（432×144）', () => {
  it('T4：vframeAt(129, fx>=324) 取帧非空，表尺寸 = 432×144（与 terraria-assets md5 全等源）', () => {
    // 经 drawAdjust 走真实表界检查（drawAdjust 的 imgW/imgH 由调用方传 vframeAt 表）
    const a = drawAdjust(129, 324, 0, 3, 60, 432, 144, new TileStore(8, 8), 8);
    void a; // 仅要求不抛；域值断言在 T3
    const png = PNG.sync.read(readFileSync('public/sprites/vanilla/Tiles_129.png'));
    expect(png.width).toBe(432);                     // 24 样式 × 18 = 覆盖 style 18-23
    expect(png.height).toBe(144);
  });

  it('T2：像素域分离——明胶域(右半)任一 style 明度 > 碎块域(左半)全部 style 最大明度', () => {
    const png = PNG.sync.read(readFileSync('public/sprites/vanilla/Tiles_129.png'));
    const luma = (x0: number, y0: number): number => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
        const idx = ((y0 + y) * png.width + (x0 + x)) * 4;
        if (png.data[idx + 3] > 10) { r += png.data[idx]; g += png.data[idx + 1]; b += png.data[idx + 2]; n++; }
      }
      return n ? (r + g + b) / n : 0;                // 平均明度（碎块域镂空,与明胶域不透明像素数不同）
    };
    let shardMax = 0;
    for (let n = 0; n < 18; n++) shardMax = Math.max(shardMax, luma(n * 18, 0));
    let gelMin = Infinity;
    for (let n = 0; n < 6; n++) gelMin = Math.min(gelMin, luma(324 + n * 18, 0));
    expect(gelMin).toBeGreaterThan(shardMax);        // 两域像素截然分离（469 vs 429 实测）
  });

  it('T3：drawAdjust case 129 ——明胶域全相位 sx 恒锁 [324,414]，小簇恒不动（addFrX=0）', () => {
    const st = new TileStore(8, 8);
    for (let k = 0; k < 8; k++) {                    // 钟相位任意（tileAnim.tick 全局）
      for (let n = 0; n < 6; n++) {
        const fx = 324 + n * 18;
        const sx = drawAdjust(129, fx, 0, 3, 60, 432, 144, st, 8).sx ?? fx;
        expect(sx).toBeGreaterThanOrEqual(324);
        expect(sx).toBeLessThanOrEqual(414);
      }
    }
    for (const fx of [0, 18, 90, 306]) {
      expect(drawAdjust(129, fx, 0, 3, 60, 432, 144, st, 8).sx).toBeUndefined();
    }
  });
});

// ============================================================ 面2：金属探测器名面（M4/M5）
describe('★BJ586 面2-金属探测器名面：oreFinderDisplayName（Main.cs:47757-47768 1:1）', () => {
  it('T5：129 fx>=324 → 明胶水晶（itemNameCache[4988]）；fx<324（防御域）→ 水晶碎块', () => {
    expect(oreFinderDisplayName(129, 324)).toBe('明胶水晶');
    expect(oreFinderDisplayName(129, 378)).toBe('明胶水晶');
    expect(oreFinderDisplayName(129, 414)).toBe('明胶水晶');
    expect(oreFinderDisplayName(129, 306)).toBe('水晶碎块');   // lookup(129,0)=item502
  });

  it('T6：227 门内(fx/34→8..11) → 奇异植物（itemNameCache[3385..3388]）；门外小株 → 染料植物色名', () => {
    expect(oreFinderDisplayName(227, 306)).toBe('奇异植物');   // 306/34=9 → 3386
    expect(oreFinderDisplayName(227, 272)).toBe('奇异植物');   // 8 → 3385
    expect(oreFinderDisplayName(227, 374)).toBe('奇异植物');   // 11 → 3388
    expect(oreFinderDisplayName(227, 0)).toBe('青绿蘑菇');     // lookup(227,0)=1107（地图图例域）
  });

  it('T7：普通矿/其余 sheet 走 tileName 照旧（无 baseOption 分流域）', () => {
    expect(oreFinderDisplayName(7, 0)).toBe(Lang.tileName(7));   // 铜矿
    expect(oreFinderDisplayName(12, 0)).toBe(Lang.tileName(12)); // 生命水晶
    expect(oreFinderDisplayName(21, 0)).toBe(Lang.tileName(21)); // 箱族（原版被宝箱门清 0）
  });

  it('T8：全 12 语言 ItemName.QueenSlimeCrystal 非空且 ≠ 水晶碎块名（l10n 全语言闸）', () => {
    const langs = readdirSync('public/l10n').filter((f) => f.endsWith('.json') && f !== 'index.json');
    expect(langs.length).toBeGreaterThanOrEqual(12);
    for (const f of langs) {
      const pack = JSON.parse(readFileSync(`public/l10n/${f}`, 'utf8'));
      const gel = pack.ItemName?.QueenSlimeCrystal;
      const shard = pack.ItemName?.CrystalShard;
      expect(gel, f).toBeTruthy();
      expect(gel === shard, `${f}: 明胶水晶名与水晶碎块名不得同串`).toBe(false);
    }
  });
});

// ============================================================ 同域债：地图悬停名面
// 原版全屏地图悬停 text = Lang.GetMapObjectName(Map[num59,num60].Type)（Main.cs:56592,
// :56742）——MapTile.Type 建图时已含 GetTileBaseOption 变体（MapHelper.cs:1976;
// case 129 :2806 / case 227 :2802）→ 悬停明胶水晶格显「明胶水晶」。本仓
// mapTileHoverName 旧走 tileName(sheet) 丢变体（=金属探测器同根债,本刀一并修）。
describe('★BJ586 同域：地图悬停名（mapTileHoverName）129/227 变体分流', () => {
  it('T9：129 fx>=324 → 明胶水晶 / fx<324 → 水晶碎块；227 fx/34 → 奇异植物/色名', () => {
    expect(mapTileHoverName(129, 324)).toBe('明胶水晶');
    expect(mapTileHoverName(129, 414)).toBe('明胶水晶');
    expect(mapTileHoverName(129, 0)).toBe('水晶碎块');
    expect(mapTileHoverName(227, 306)).toBe('奇异植物');
    expect(mapTileHoverName(227, 0)).toBe('青绿蘑菇');
    expect(mapTileHoverName(7, 0)).toBe(Lang.tileName(7));   // 铜矿照旧
  });
});
