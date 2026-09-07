// 静态 tile 光全表金标（1457 权威 = Terraria.Graphics.Light/TileLightScanner.cs
// ApplyTileLight(:344-3151) 主 switch(tile.type) 纯常量 R/G/B case 逐条提取，2026-09-07 全表对账批）。
//
// 语义定谳（对账前置结论，防再度误读）：
// - 原版 tile 静态光唯一权威表 = ApplyTileLight 主 switch 的 0-2 float 域（Vector3），
//   门 = `if (Main.tileLighted[tile.type])`（Main.cs 离散赋值 + 循环 262..268）。
// - TileLightScanner.cs:846-850 的 `case 12:`(255,213,186) 是 case 719（彩虹云）内层
//   `switch(num15)` 十四色轮转的**档位 12**，不是 tile type 12（心水晶）——主 switch 无
//   case 12 且 Main.cs 无 tileLighted[12]，心水晶静态光=0（暗处黑=原版真态；
//   暗处可见性归 Main.tileShine[12]=300 闪光，本仓未实装，登记债）。
// - 动态（帧条件/随机/时间/涂装门）case 不走 def.light：已由 src/lighting/TileLightScanner.ts
//   specialTileLight（67 case）+ 内联通道（sheet 4 火把 TORCH_COLORS、蘑菇组
//   MUSHROOM_GLOW_SHEETS 70/71/72/190/348/349/528/578）承载，测试见 tile-light-specials。
// - 换算约定：byte = Math.round(F×255)（0.5→127.5→128 半上）；F>1 的原版本征过亮
//   byte>255 不钳制（扫描器按 /255 还原 >1 光量，如 342 的 1.1→280.5→281）。
// - tileLighted 但主 switch 无 case 的 type（19/58/76/109/346/684/701）恒零光——
//   本仓这些 sheet 的 def 不得带 def.light；case 235（传送器）存在但 tileLighted[235]
//   未置位=死分支（TileLightScanner.cs:1021-1029 在 :350 tileLighted 门内,Main.cs 全树
//   零赋值）——2026-09-07 已按原版撤 specialTileLight case 235（零 tile 光,入库哨位）。
// - 动态涂装门（22/140/204/347 白/灰漆 R 置零支 :2510/:2578；739 flag 覆写支 :2962+
//   尾段 :3131-3141）——2026-09-07 已 1:1 移植进 TileLightScanner.ts ③ 静态光路径
//   （def.light 基值仍为本表;门在扫描期按 st.paint 修正）。
import { describe, it, expect } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';

/** 1457 权威静态光表：sheet → 原版 float RGB（注释=TileLightScanner.cs case 行号 + TileID 名）。
 *  多 type 共体 case（共享同一 body）按原版逐 type 展开。 */
const VANILLA_STATIC_LIGHT: Record<number, [number, number, number]> = {
  656: [0.2, 0.55, 0.5],        // :394 GlowTulip
  634: [0.65, 0.3, 0.1],        // :410 TreeAsh
  633: [0.325, 0.15, 0.05],     // :415/:416/:417 AshGrass/AshShortPlants/AshVines 共体
  637: [0.325, 0.15, 0.05],
  638: [0.325, 0.15, 0.05],
  463: [0.2, 0.4, 0.8],         // :422 DefendersForge
  491: [0.5, 0.4, 0.7],         // :427 VoidVault
  415: [0.7, 0.5, 0.1],         // :448 LunarBlockSolar
  500: [0.525, 0.375, 0.075],   // :453 SolarBrick
  416: [0, 0.6, 0.7],           // :458 LunarBlockVortex
  501: [0, 0.45, 0.525],        // :463 VortexBrick
  417: [0.6, 0.2, 0.6],         // :468 LunarBlockNebula
  502: [0.45, 0.15, 0.45],      // :473 NebulaBrick
  418: [0.6, 0.6, 0.9],         // :478 LunarBlockStardust
  503: [0.45, 0.45, 0.675],     // :483 StardustBrick
  390: [0.4, 0.2, 0.1],         // :488 LavaLamp
  568: [1, 0.61, 0.65],         // :549 PinkFairyJar
  569: [0.12, 1, 0.66],         // :554 GreenFairyJar
  570: [0.57, 0.57, 1],         // :559 BlueFairyJar
  580: [0.7, 0.3, 0.2],         // :564 HellButterflyJar
  391: [0.3, 0.1, 0.25],        // :569 CageEnchantedNightcrawler
  381: [0.25, 0.1, 0],          // :574/:575/:576 LavaMoss/LavaMossBrick/LavaMossBlock 共体
  517: [0.25, 0.1, 0],
  687: [0.25, 0.1, 0],
  534: [0, 0.25, 0],            // :581/:582/:583 KryptonMoss/KryptonMossBrick/KryptonMossBlock 共体
  535: [0, 0.25, 0],
  689: [0, 0.25, 0],
  536: [0, 0.16, 0.34],         // :588/:589/:590 XenonMoss 族共体
  537: [0, 0.16, 0.34],
  690: [0, 0.16, 0.34],
  539: [0.3, 0, 0.17],          // :595/:596/:597 ArgonMoss 族共体
  540: [0.3, 0, 0.17],
  688: [0.3, 0, 0.17],
  625: [0.3, 0, 0.35],          // :602/:603/:604 VioletMoss(V Neon)Moss 族共体
  626: [0.3, 0, 0.35],
  691: [0.3, 0, 0.35],
  370: [0.32, 0.16, 0.12],      // :654 MeteoriteBrick
  711: [0.01, 0.01, 0.01],      // :669 RainbowBoulder
  336: [0.85, 0.5, 0.3],        // :681 LivingFire
  340: [0.45, 1, 0.45],         // :686 LivingCursedFire
  342: [0.5, 0.5, 1.1],         // :696 LivingFrostFire（B=1.1 过亮 → byte 281>255 本征）
  343: [0.85, 0.85, 0.3],       // :701 LivingIchor
  344: [0.6, 1.026, 0.96000004], // :706 LivingUltrabrightFire（G 过亮 → byte 262）
  286: [0.1, 0.2, 0.7],         // :907/:908 GlowingSnailCage/TruffleWormCage 共体
  619: [0.1, 0.2, 0.7],
  582: [0.7, 0.2, 0.1],         // :922/:923 MagmaSnailCage/LavafishBowl 共体
  598: [0.7, 0.2, 0.1],
  270: [0.73, 1, 0.41],         // :928 FireflyinaBottle
  271: [0.45, 0.95, 1],         // :933 LightningBuginaBottle
  581: [1, 0.75, 0.5],          // :938 LavaflyinaBottle
  262: [0.75, 0, 0.75],         // :981 AmethystGemspark（部分通道 case：未写通道=0）
  263: [0.75, 0.75, 0],         // :985 TopazGemspark
  264: [0, 0, 0.75],            // :989 SapphireGemspark
  265: [0, 0.75, 0],            // :992 EmeraldGemspark
  266: [0.75, 0, 0],            // :995 RubyGemspark
  267: [0.75, 0.75, 0.75],      // :998 DiamondGemspark
  268: [0.75, 0.375, 0],        // :1003 AmberGemspark
  237: [0.1, 0.1, 0],           // :1007 LihzahrdAltar
  613: [0.7, 0.3, 0.2],         // :1210/:1211 PottedLavaPlants/PottedLavaPlantTendrils 共体
  614: [0.7, 0.3, 0.2],
  17: [0.83, 0.6, 0.5],         // :2488/:2489/:2490 Furnaces/AdamantiteForge/GlassKiln 共体
  133: [0.83, 0.6, 0.5],
  302: [0.83, 0.6, 0.5],
  77: [0.75, 0.45, 0.25],       // :2495 Hellforge
  699: [0.4, 0.2, 0.15],        // :3004 DeadCellsPotionStation
  354: [0.65, 0.35, 0.15],      // :3124 BewitchingTable
  22: [0.12, 0.07, 0.32],       // :2508/:2509 Demonite Ore/Brick——涂装 26 白/27 灰 R=0 门已移植（TileLightScanner ③）
  140: [0.12, 0.07, 0.32],
  204: [0.35, 0, 0],            // :2576/:2577 Crimtane Ore/Brick——同上涂装门已移植
  347: [0.35, 0, 0],
  739: [0.35, 0.63, 0.7],       // :2962 JellyfishBlock——flag=true 涂装覆写支已移植（TileLightScanner ③）
};

/** 原版无静态光的登记例外：sheet 4 火把（def.light 仅作扫描器 hasLightById 门牌，
 *  值被内联 TORCH_COLORS 分支覆写，删字段会整体断火把光）；蘑菇组 8 sheet（值被
 *  MUSHROOM_GLOW_SHEETS 内联公式覆写=死数据，登记保留）。 */
const NON_STATIC_LIGHT_EXCEPTIONS = new Set([4, 70, 71, 72, 190, 348, 349, 528, 578]);

/** 原版 tileLighted 但主 switch 无 case → 恒零光（本仓 def 不得带 light）。 */
const TILE_LIGHTED_NO_CASE = [19, 58, 76, 109, 346, 684, 701];

/** Main.cs 无 tileLighted 也无 case → 零光代表位（心水晶=用户实报回归位）。
 *  235=反例族：主 switch 有 case（:1021 光地板抬底）但 tileLighted[235] 全树零赋值
 *  → 死分支恒零光（2026-09-07 specialTileLight case 235 已撤,哨位防回潮）。 */
const NO_LIGHT_SENTINELS: Array<[number, string]> = [
  [12, 'crystal_heart'],
  [235, 'teleporter（case 有但 tileLighted 未置位=死分支）'],
  ...TILE_LIGHTED_NO_CASE.map((s) => [s, `sheet ${s}`] as [number, string]),
];

const f2b = (f: number) => Math.round(f * 255);
const defsBySheet = (s: number) => TILE_DEFS.filter((d) => d?.vanilla?.sheet === s);

describe('tile 静态光全表金标（1457 ApplyTileLight 主 switch 对账）', () => {
  it('原版静态光表逐 sheet 对拍（71 sheet 全量，byte=round(F×255)）', () => {
    const sheets = Object.keys(VANILLA_STATIC_LIGHT).map(Number);
    expect(sheets.length).toBeGreaterThanOrEqual(71);
    const broken: string[] = [];
    for (const s of sheets) {
      const ds = defsBySheet(s);
      if (ds.length === 0) { broken.push(`sheet ${s}: 本仓无 def`); continue; }
      const exp = VANILLA_STATIC_LIGHT[s].map(f2b);
      for (const d of ds) {
        if (!d.light) { broken.push(`${d.key}: 缺 light，期望 ${JSON.stringify(exp)}`); continue; }
        if (d.light[0] !== exp[0] || d.light[1] !== exp[1] || d.light[2] !== exp[2]) {
          broken.push(`${d.key}: ${JSON.stringify(d.light)} ≠ 原版 ${JSON.stringify(exp)}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('抽检 5 个新补/改正光源（含心水晶翻案位）', () => {
    // 心水晶（sheet 12）：原版零静态光——2026-09-07 翻案删伪光 [255,213,186]
    // （该值是 case 719 彩虹云内层 num15==12 档色，非 tile 12）
    const heart = TILE_DEFS.find((d) => d.key === 'crystal_heart');
    expect(heart?.vanilla?.sheet).toBe(12);
    expect(heart?.light).toBeUndefined();
    // 熔炉（17）：case 17/133/302 (0.83,0.6,0.5)——曾误 255,140,70
    expect(TILE_DEFS.find((d) => d.key === 'furnace')?.light).toEqual([212, 153, 128]);
    // 发光蘑菇块同族辉光郁金香（656）：(0.2,0.55,0.5) 青光——曾误 255,185,110
    expect(TILE_DEFS.find((d) => d.key === 'v_656_glow_tulip')?.light).toEqual([51, 140, 128]);
    // 氪苔砖（535）：(0,0.25,0)——曾整字段缺失
    expect(TILE_DEFS.find((d) => d.key === 'v_535_krypton_moss_brick')?.light).toEqual([0, 64, 0]);
    // 地狱熔炉（77）：(0.75,0.45,0.25)——曾误 255,140,70
    expect(TILE_DEFS.find((d) => d.key === 'v_77_hellforge')?.light).toEqual([191, 115, 64]);
  });

  it('无伪静态：def.light 只出现在原版静态 sheet 与登记例外（火把门/蘑菇组）', () => {
    const staticSheets = new Set(Object.keys(VANILLA_STATIC_LIGHT).map(Number));
    const offenders: string[] = [];
    for (const d of TILE_DEFS) {
      const s = d?.vanilla?.sheet;
      if (s == null || !d.light) continue;
      if (!staticSheets.has(s) && !NON_STATIC_LIGHT_EXCEPTIONS.has(s)) {
        offenders.push(`${d.key}(sheet ${s}): ${JSON.stringify(d.light)}`);
      }
    }
    expect(offenders).toEqual([]);
    // 例外集本身钉死：不许再长新例外
    expect(NON_STATIC_LIGHT_EXCEPTIONS).toEqual(new Set([4, 70, 71, 72, 190, 348, 349, 528, 578]));
  });

  it('原版零光位不得发光（心水晶 12 + tileLighted 无 case 族）', () => {
    for (const [s, label] of NO_LIGHT_SENTINELS) {
      for (const d of defsBySheet(s)) {
        expect(d.light ?? undefined).toBeUndefined();
      }
      expect(label).toBeTruthy();
    }
  });

  it('火把 def.light 门牌在位（sheet 4 动态值由 TORCH_COLORS 内联分支承载）', () => {
    // presence load-bearing：TileLightScanner.hasLightById 门进组后才走 sheet===4 分支
    const torch = TILE_DEFS.find((d) => d.key === 'torch');
    expect(torch?.vanilla?.sheet).toBe(4);
    expect(torch?.light).toBeDefined();
  });
});
