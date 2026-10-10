// FlexibleTileWand 家族 1:1（Terraria.GameContent/FlexibleTileWand.cs 全表）：
// 碎块魔杖 5324/5329/5330、MiteyTitey 5464、便携窑 5481、沙堡桶 4460 等 30 件。
// 语义：按背包内【首个命中弹药桶】放置对应 tile+style；样式 = cycleOffset 模桶容量
// （GetOptionWithCycling :25-31），持杖按 ↑/↓ 循环（UpdateControlHolds :28614-28626）。
// 表由 tools 侧从源码机械提取（src/data/flexible-wands.json：五方法变量感知解析，
// 字面 tile / default(int) / WithOffset / ByRow 全覆盖，抽验 4144→706 等 10 条一致）。
import wandsJson from '../data/flexible-wands.json';

/** [弹药 vid, [[tileSheet, style], ...]]——桶按弹药合（Dictionary<itemType> 单桶、
 *  Options 追加序；同弹药跨 tile 的选项各自带 tile，如 large 154 = 647×7 + 648×3） */
type Bucket = [number, Array<[number, number]>];

export interface WandDef {
  /** 弹药桶（首个背包命中的桶生效——TryGetPlacementOption 逐槽扫描序） */
  buckets: Bucket[];
  /** 消耗弹药（Rubblemaker 三件 + 沙堡桶 4460 = true；单件装饰族 WithoutAmmoConsumption） */
  consumesAmmo: boolean;
  /** 悬停弹药图标（ShowsHoverAmmoIcon；碎块三件 true 其余 false） */
  showsAmmoIcon: boolean;
}

const TABLES = wandsJson as Record<'small' | 'medium' | 'large' | 'mitey' | 'kiln', Bucket[]>;

function multi(buckets: Bucket[]): WandDef {
  return { buckets, consumesAmmo: true, showsAmmoIcon: true };
}
function styleList(b: Bucket): number[] { return b[1].map((o) => o[1]); }
/** CreateSingleTileWand（:55-77）：弹药即本体（无弹药表——放置不受背包门），
 *  style 循环表 + WithoutAmmoIcon + WithoutAmmoConsumption */
function single(tileSheet: number, styles: number[]): WandDef {
  return { buckets: [[-1, styles.map((s) => [tileSheet, s] as [number, number])]],
    consumesAmmo: false, showsAmmoIcon: false };
}
/** ★BJ604件1（FlexibleTileWand.cs:48）：沙堡桶 4460 = CreateSingleTileWand(169,552,…)
 *  .WithoutAmmoIcon() ——【无 WithoutAmmoConsumption】（single 族唯一例外,:52-98 其余
 *  全带）= ConsumesAmmoItem:true。放置门+消耗 = 背包沙块 169（TryGetPlacementOption
 *  扫 _options[169]→无沙块 canUse=false;PlaceIt_ConsumeFlexibleWandMaterial
 *  Player.cs:40492-40501 每拍扣 1）;杖本体 consumable=false（Item.cs:37686-37697
 *  case 4460）永不扣。showsAmmoIcon 仍 false（WithoutAmmoIcon 独立旗）。 */
function singleWithAmmo(ammoVid: number, tileSheet: number, styles: number[]): WandDef {
  return { buckets: [[ammoVid, styles.map((s) => [tileSheet, s] as [number, number])]],
    consumesAmmo: true, showsAmmoIcon: false };
}
/** ExposedGem（:103）：tile 178（洞穴晶体），style = s / s+7 / s+14 */
function exposedGem(style: number): WandDef {
  return single(178, [style, style + 7, style + 14]);
}

/** Item.GetFlexibleTileWand（Item.cs:49103 switch 全表） */
export function flexibleWandOf(vid: number): WandDef | null {
  switch (vid) {
    case 5324: return multi(TABLES.small);
    case 5329: return multi(TABLES.medium);
    case 5330: return multi(TABLES.large);
    case 5464: return multi(TABLES.mitey);
    case 5481: return multi(TABLES.kiln);
    case 4460: return singleWithAmmo(169, 552, [0, 1, 2, 3]); // SandCastleBucket（★BJ604件1：耗沙块169）
    case 4609: return single(567, [0, 1, 2, 3, 4]);         // GardenGnome
    case 4420: return single(545, [0, 1]);                  // LawnFlamingo
    case 275: return single(81, [0, 1, 2, 3, 4, 5]);        // Coral
    case 2625: return single(324, [0, 1, 2]);               // Seashell
    case 2626: return single(324, [3, 4, 5]);               // Starfish
    case 4072: return single(324, [6, 7, 8]);               // LightningWhelkShell
    case 4073: return single(324, [9, 10, 11]);             // TulipShell
    case 4071: return single(324, [12, 13, 14]);            // JunoniaShell
    case 1813: return single(35, [0, 1, 2, 3, 4, 5, 6, 7, 8]); // JackoLantern
    case 1417: return single(241, [0, 1, 2, 3, 4, 5, 6, 7, 8]); // Catacomb
    case 1869: return single(36, [0, 1, 2, 3, 4, 5, 6, 7]); // Present
    case 3749: return single(457, [0, 1, 2, 3, 4]);         // PartyPresent
    case 149: return single(50, [0, 1, 2, 3, 4]);           // Book（← 2026-08-19 补：
      // Item.cs:49133 `149 => FlexibleTileWand.Book`——书物不再是"仅桌面 1×1"，
      // 持书直接放书（弹药=本体五样式，无消耗））
    case 5472: return single(698, [1, 2, 0]);               // DeadCellsDisplayJar
    case 580: return single(141, [0, 1]);                   // Explosives
    case 181: return exposedGem(0);                          // Amethyst
    case 180: return exposedGem(1);                          // Topaz
    case 177: return exposedGem(2);                          // Sapphire
    case 179: return exposedGem(3);                          // Emerald
    case 178: return exposedGem(4);                          // Ruby
    case 182: return exposedGem(5);                          // Diamond
    case 999: return exposedGem(6);                          // Amber
    default: return null;
  }
}

export interface PlacementOption { tileSheet: number; style: number; ammoVid: number; }

/** TryGetPlacementOption（:176-197）：按槽序找首个命中弹药桶（跳过 50-53 预留槽
 *  的语义 = 本仓主背包全扫）；style = cycleOffset 模容量（负偏移同余） */
export function tryGetPlacementOption(
  wand: WandDef,
  invVids: Array<{ vid: number; favorited: boolean }>,
  cycleOffset: number,
): PlacementOption | null {
  // 单件族（CreateSingleTileWand）：弹药=本体，无背包门恒命中
  const self = wand.buckets.find((b) => b[0] === -1);
  if (self) {
    const n = self[1].length;
    const [sheet, style] = self[1][((cycleOffset % n) + n) % n];
    return { tileSheet: sheet, style, ammoVid: -1 };
  }
  for (const it of invVids) {
    const bucket = wand.buckets.find((b) => b[0] === it.vid);
    if (!bucket) continue;
    const n = bucket[1].length;
    const [sheet, style] = bucket[1][((cycleOffset % n) + n) % n];
    return { tileSheet: sheet, style, ammoVid: it.vid };
  }
  return null;
}
export { styleList };
