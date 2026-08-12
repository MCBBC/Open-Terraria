// 幸运度系统 1:1（1.4.5.6 反编译 = Terarria1456）：
//   - 聚合公式 RecalculateLuck（Player.cs:28672-28697）：
//       luck = GetLadyBugLuck()*0.2 + torchLuck*0.2          （:28673）
//       luck += luckPotion*0.1                               （:28674，buff 257 三档）
//       luck += kiteLuckLevel*0.1/3                          （:28675，buff 383 三档）
//       luck += usedGalaxyPearl ? 0.03 : 0                   （:28676-28678，银河珍珠 5340）
//       luck += LanternsUp ? 0.3 : 0                         （:28679-28682）
//       luck += HasGardenGnomeNearby ? 0.2 : 0               （:28683-28686，tile 567）
//       luck += stinky ? -0.25 : 0                           （:28687-28690，buff 120）
//       luck += equipmentBasedLuckBonus                      （:28692，Player.cs:12629-12647）
//       luck += CalculateCoinLuck()                          （:28693，微光化币）
//       luck += brokenMirrorBadLuck ? -0.25 : 0              （:28694-28696，弹 810 击碎镜）
//     注意：RecalculateLuck 本体不 clamp——luckMinimumCap=-0.7 / luckMaximumCap=1
//     （Player.cs:2952/2954）仅用于 UI 计量（:3950-3957），数值上可超界。
//     （任务清单里的"月相"与"杀蝙蝠"均不进 luck 公式：月相只喂刷怪/旅行商品质
//     类外围；负面 luck 源头是瓢虫 NPC 359/360 与碎镜，不是蝙蝠。）
//   - 掷骰消费三态（Luck.cs 全文，Terraria.GameContent/Luck.cs:5-60）：
//       RollLuck                  正运改掷 [N/2, N)、负运改掷 [N, 2N)、否则 [0, N)
//                                 （正/负运均以 |luck| 概率触发；改掷窗口使 P(==0)
//                                  分别 ≈1.39/N 与 ≈0.69/N——负运不是恒不中）
//       RollBadLuck               反向
//       RollOnlyBadLuck           仅负运收窄为 [N/2, N)（正运无加成）
//       RollBadLuckExtreme        正运 [0, N*10)、负运 [0, N/10)
//       RollOnlyBadLuckExtreme    仅负运 [0, N/10)，否则恒 -1（永不命中）
//   来源接线状态（已接/登记见 get luck 注释与 Game.ts 扫描位）：
//     已接：幸运药水 buff 257 / 灯笼夜 / 花园地精扫描 / 火炬幸运扫描 / 装备
//           （幸运币 855 / 马掌族）/ 钱币幸运数值位 / 瓢虫 604/605（击杀=坏运
//           Enemy.hurt cs:82338；触碰=好运 ladybugAI cs:78730。原登记 ID 359/360
//           为旧版误记——1.4.5.6 瓢虫是 NPC 604 Ladybug / 605 Gold Ladybug，
//           359/360 实为蜗牛；生成在 VanillaSpawner 起风日分支 cs:2413）
//     登记→已接（幸运来源批）：buff 383 风筝三档（BuffType.KiteBuff）、buff 120 恶臭
//           （BuffType.Stinky，Player.luck 直读）、银河珍珠 5340（vi_5340_galaxy_pearl
//           使用置 usedGalaxyPearl）、碎镜（vi_5577_pretty_mirror 投掷弹 1085 消亡近身
//           150px → brokenMirrorBadLuckTime；原版此处弹体 id=1085，旧注释"810"系 1.4.0.5 编号）。
//     仍登记：微光化币（微光未移植）；风筝/恶臭 buff 的授予物品（风筝族 4371 等/恶臭
//           药水 1332/弹幕 1080）未移植。
import { TILE_DEFS } from '../data/tiles';
import type { TileStore } from '../world/TileStore';

// ============ 掷骰（Luck.cs 1:1；rand 默认 Math.random，可注入做种子探针） ============

const nextInt = (maxExclusive: number, rand: () => number): number => {
  const m = Math.floor(maxExclusive);
  return m <= 0 ? 0 : Math.floor(rand() * m);
};

/** Luck.RollLuck（Luck.cs:5-16） */
export function rollLuck(luck: number, range: number, rand: () => number = Math.random): number {
  if (luck > 0 && rand() < luck) return nextInt(Math.floor(range / 2) + nextInt(range - Math.floor(range / 2), rand), rand);
  if (luck < 0 && rand() < -luck) return nextInt(range + nextInt(range, rand), rand);
  return nextInt(range, rand);
}

/** Luck.RollBadLuck（:18-29） */
export function rollBadLuck(luck: number, range: number, rand: () => number = Math.random): number {
  if (luck > 0 && rand() < luck) return nextInt(range + nextInt(range, rand), rand);
  if (luck < 0 && rand() < -luck) return nextInt(Math.floor(range / 2) + nextInt(range - Math.floor(range / 2), rand), rand);
  return nextInt(range, rand);
}

/** Luck.RollOnlyBadLuck（:31-38）：正运不受益 */
export function rollOnlyBadLuck(luck: number, range: number, rand: () => number = Math.random): number {
  if (luck < 0 && rand() < -luck) return nextInt(Math.floor(range / 2) + nextInt(range - Math.floor(range / 2), rand), rand);
  return nextInt(range, rand);
}

/** Luck.RollBadLuckExtreme（:40-51） */
export function rollBadLuckExtreme(luck: number, range: number, rand: () => number = Math.random): number {
  if (luck > 0 && rand() < luck) return nextInt(range * 10, rand);
  if (luck < 0 && rand() < -luck) return nextInt(Math.floor(range / 10), rand);
  return nextInt(range, rand);
}

/** Luck.RollOnlyBadLuckExtreme（:53-60）：非负运态恒 -1 */
export function rollOnlyBadLuckExtreme(luck: number, range: number, rand: () => number = Math.random): number {
  if (luck < 0 && rand() < -luck) return nextInt(Math.floor(range / 10), rand);
  return -1;
}

// ============ 聚合态（仿 BuffState：环境因子 Game 侧写入，value 幂等聚合） ============

/** 瓢虫时序常量（NPC.cs:6549/6551，tick） */
export const LADYBUG_GOOD_LUCK_TIME = 43200;
export const LADYBUG_BAD_LUCK_TIME = -10800;
/** 碎镜负面时序（Projectile.cs:67574） */
export const BROKEN_MIRROR_TIME = 25200;
/** 钱币幸运累计上限（Player.cs AddCoinLuck:17952） */
const COIN_LUCK_CAP = 1_000_000;

export class LuckState {
  /** 火炬幸运（TryRecalculatingTorchLuck 结果，∈[0,1]——负贡献末尾钳 0） */
  torchLuck = 0;
  /** 花园地精在 SceneMetrics 窗口内（SceneMetrics.cs:597-600 _tileCounts[567]>0） */
  hasGardenGnomeNearby = false;
  /** 灯笼夜（LanternNight.LanternsUp，Game 侧每 tick 同步） */
  lanternsUp = false;
  /** 装备幸运（equipmentBasedLuckBonus：四叶草族/马掌族/幸运币；Player 侧聚合写入） */
  equipmentLuckBonus = 0;
  /** 银河珍珠已用（Player.cs:44786-44789 一次性）——物品 vi_5340_galaxy_pearl 已注册，
   *  Game 使用分支（useTime 45）置位后消耗 */
  usedGalaxyPearl = false;
  /** Stinky（buff 120，:9958-9961）——Player.luck 直接读 BuffType.Stinky（buff 在
   *  即 stinky）；此位仅作环境外注入备用。授予来源（恶臭药水 1332/弹幕 1080）未移植 */
  stinky = false;
  /** 碎镜负面计时 tick（brokenMirrorBadLuckTime，UpdateBrokenMirrorLuck :28700-28711） */
  brokenMirrorBadLuckTime = 0;
  /** 瓢虫 luck 计时 tick（正=好运余量/负=坏运余量；UpdateLadyBugLuckTime :28654-28670 衰减） */
  ladyBugLuckTimeLeft = 0;
  /** 钱币幸运累计（铜币面额；来源 = 微光化币 WorldItem.cs:1787-1807——微光未移植，登记） */
  coinLuck = 0;

  /** GetLadyBugLuck（:18009-18019）：timeLeft/43200 或 -timeLeft/-10800（∈[-1,1]） */
  get ladyBugLuck(): number {
    if (this.ladyBugLuckTimeLeft > 0) return this.ladyBugLuckTimeLeft / LADYBUG_GOOD_LUCK_TIME;
    if (this.ladyBugLuckTimeLeft < 0) return -this.ladyBugLuckTimeLeft / LADYBUG_BAD_LUCK_TIME;
    return 0;
  }

  get brokenMirrorBadLuck(): boolean {
    return this.brokenMirrorBadLuckTime > 0;
  }

  /** CalculateCoinLuck（:17968-17997 分档） */
  get coinLuckValue(): number {
    if (this.coinLuck === 0) return 0;
    if (this.coinLuck > 249000) return 0.2;
    if (this.coinLuck > 24900) return 0.175;
    if (this.coinLuck > 2490) return 0.15;
    if (this.coinLuck > 249) return 0.125;
    if (this.coinLuck > 24.9) return 0.1;
    if (this.coinLuck > 2.49) return 0.075;
    if (this.coinLuck > 0.249) return 0.05;
    return 0.025;
  }

  /** AddCoinLuck（:17943-17955）：距离 <1000px 才累计，cap 1e6 */
  addCoinLuck(distPx: number, coinAmount: number): void {
    if (distPx >= 1000) return;
    this.coinLuck = Math.min(COIN_LUCK_CAP, this.coinLuck + coinAmount);
  }

  /** 时序衰减（每 tick 调用；Main.dayRate 默认 1）：
   *  - 瓢虫 :28654-28670（正负分别向 0 收敛）
   *  - 钱币 UpdateCoinLuck :17956-17963（×0.9999^dayRate，<0.25 清零）
   *  - 碎镜 UpdateBrokenMirrorLuck :28700-28711 */
  update(dayRate = 1): void {
    if (this.ladyBugLuckTimeLeft > 0) {
      this.ladyBugLuckTimeLeft = Math.max(0, this.ladyBugLuckTimeLeft - dayRate);
    } else if (this.ladyBugLuckTimeLeft < 0) {
      this.ladyBugLuckTimeLeft = Math.min(0, this.ladyBugLuckTimeLeft + dayRate);
    }
    if (this.coinLuck > 0) {
      this.coinLuck *= Math.pow(0.9999, dayRate);
      if (this.coinLuck < 0.25) this.coinLuck = 0;
    }
    if (this.brokenMirrorBadLuckTime > 0) {
      this.brokenMirrorBadLuckTime = Math.max(0, this.brokenMirrorBadLuckTime - dayRate);
    }
  }

  /** 瓢虫被杀（NPC.LadyBugKilled :82338-82360）：距离 <400px、100px 内按满额，
   *  坏运量 = -10800×(1-距离/400)（金瓢虫 ×2），只取更差值 */
  ladyBugKilled(distPx: number, gold = false): void {
    if (distPx >= 400) return;
    let t = Math.round(LADYBUG_BAD_LUCK_TIME * (1 - distPx / 400));
    if (gold) t *= 2;
    this.ladyBugLuckTimeLeft = Math.min(this.ladyBugLuckTimeLeft, t);
  }

  /** 活瓢虫接触（NPC.LadyBugLuck :82363-82385）：距离 <800px、30px 内满额，
   *  好运量 = 43200×(1-距离/800)^6（金瓢虫 ×2），只取更好值（当前为负时不改） */
  ladyBugTouched(distPx: number, gold = false): void {
    if (distPx >= 800 || this.ladyBugLuckTimeLeft < 0) return;
    let t = Math.round(LADYBUG_GOOD_LUCK_TIME * Math.pow(1 - distPx / 800, 6));
    if (gold) t *= 2;
    this.ladyBugLuckTimeLeft = Math.max(this.ladyBugLuckTimeLeft, t);
  }
}

// ============ 火炬幸运扫描（Player.cs:17580-17720 窗口 + :17771-17939 计算 1:1） ============
// 窗口：玩家 Center tile ±40（81×81）。原版每 tick 只扫一行（luckyTorchCounter 逐行推进），
// 扫满 81 行才 ConsumeCountersAndCalculate；本仓按 15 tick 一整窗直扫（节流等价，语义同净效果）。
// 地表（position.Y ≤ worldSurface*16）或死亡 → 直接 Consume（torchLuck=0）。

/** TorchID（Terraria.ID/TorchID.cs:84-131）——窗口内见到的火炬样式集索引 */
export const TORCH_STYLE = {
  Torch: 0, Blue: 1, Red: 2, Green: 3, Purple: 4, White: 5, Yellow: 6, Demon: 7,
  Cursed: 8, Ice: 9, Orange: 10, Ichor: 11, UltraBright: 12, Bone: 13, Rainbow: 14,
  Pink: 15, Desert: 16, Coral: 17, Corrupt: 18, Crimson: 19, Hallowed: 20,
  Jungle: 21, Mushroom: 22, Shimmer: 23,
} as const;
export const TORCH_STYLE_COUNT = 24;

export interface LuckScanZones {
  dungeon: boolean; temple: boolean; snow: boolean; desert: boolean;
  jungle: boolean; glowshroom: boolean; corrupt: boolean; crimson: boolean; hallow: boolean;
  /** WorldGen.oceanDepths（SceneMetrics.zoneBeach 同式：y≤oceanLevel 且 x 距边 <380） */
  ocean: boolean;
}

export interface LuckScanInput {
  store: TileStore;
  tx: number; ty: number;
  /** 地表以下（position.Y > worldSurface*16）——地表恒无火炬幸运 */
  belowSurface: boolean;
  zones: LuckScanZones;
  /** 手持火把 placeStyle（inventory[selectedItem].createTile==4 && placeStyle<24；无 = null） */
  heldTorchStyle: number | null;
}

const TORCH_WINDOW = 40;          // num2（Player.cs:17595）
const GNOME_WINDOW_X = 84;        // SceneMetrics ZoneScanSize 半宽（(1920/16+49)/2 取整）
const GNOME_WINDOW_Y = 61;

/** 内部 tile id：火把（vanilla sheet 4）/ 花园地精（vanilla sheet 567） */
const TORCH_TILE_ID = (() => {
  for (let i = 0; i < TILE_DEFS.length; i++) if (TILE_DEFS[i]?.vanilla?.sheet === 4) return i;
  return -1;
})();
const GNOME_TILE_ID = (() => {
  for (let i = 0; i < TILE_DEFS.length; i++) if (TILE_DEFS[i]?.vanilla?.sheet === 567) return i;
  return -1;
})();

/** 地精在否（SceneMetrics.cs:597-600：_tileCounts[567]>0，169×124 窗口任一即真） */
function scanGnome(st: TileStore, tx: number, ty: number): boolean {
  if (GNOME_TILE_ID < 0) return false;
  const x0 = Math.max(0, tx - GNOME_WINDOW_X), x1 = Math.min(st.w - 1, tx + GNOME_WINDOW_X);
  const y0 = Math.max(0, ty - GNOME_WINDOW_Y), y1 = Math.min(st.h - 1, ty + GNOME_WINDOW_Y);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = st.idx(x, y);
      if (st.flags[i] && st.type[i] === GNOME_TILE_ID) return true;
    }
  }
  return false;
}

/** 扫描火炬窗口 + 地精窗口，算出 torchLuck 与 gnome 在否（1:1 净效果版） */
export function scanLuckScene(input: LuckScanInput): { torchLuck: number; hasGardenGnome: boolean } {
  const { store: st, tx, ty } = input;
  if (!input.belowSurface) {
    // TryRecalculatingTorchLuck :17592-17598：地表直接 ConsumeCounters → torchLuck=0
    return { torchLuck: 0, hasGardenGnome: scanGnome(st, tx, ty) };
  }

  // 火炬窗口计数（:17604-17640；nearbyTorches 燃烧计数只喂 Torch God 触发，
  // 由 TorchGod.ts 自扫，此处不重复累计）
  const nearby = new Array<boolean>(TORCH_STYLE_COUNT).fill(false);
  let dryCoral = false;
  if (TORCH_TILE_ID >= 0) {
    const s0x = Math.max(10, tx - TORCH_WINDOW), s1x = Math.min(st.w - 10, tx + TORCH_WINDOW);
    const s0y = Math.max(10, ty - TORCH_WINDOW), s1y = Math.min(st.h - 10, ty + TORCH_WINDOW);
    for (let y = s0y; y <= s1y; y++) {
      for (let x = s0x; x <= s1x; x++) {
        const i = st.idx(x, y);
        if (!st.flags[i] || st.type[i] !== TORCH_TILE_ID || st.frameX[i] < 0 || st.frameY[i] < 0) continue;
        const style = Math.floor(st.frameY[i] / 22);
        if (style < TORCH_STYLE_COUNT) {
          nearby[style] = true;
          // :17629-17634：珊瑚炬非水中 → dryCoral（下文按"错群系"计负）
          if (style === TORCH_STYLE.Coral && (st.liquid[i] === 0 || st.liquidType[i] !== 1)) dryCoral = true;
        }
      }
    }
  }
  if (input.heldTorchStyle !== null && input.heldTorchStyle < TORCH_STYLE_COUNT) {
    nearby[input.heldTorchStyle] = true;   // UpdateTorchLuck_ConsumeCountersAndCalculate :17775-17778
  }

  // ---- UpdateTorchLuck_ConsumeCountersAndCalculate（:17771-17939）----
  // num2=good（正确群系火炬加分项）num=bad（错群系火炬负分项）
  const z = input.zones;
  let good = 0;
  let bad = 0;
  if (!z.dungeon && !z.temple) {
    if (nearby[TORCH_STYLE.Ice]) { good += z.snow ? 1 : 0; bad += z.snow ? 0 : 1; }
    if (nearby[TORCH_STYLE.Desert]) { good += z.desert ? 1 : 0; bad += z.desert ? 0 : 1; }
    if (nearby[TORCH_STYLE.Coral]) {
      if (z.ocean) good += 1;          // :17813-17815 海洋深度带内 = 正确群系
      else if (dryCoral) bad += 1;     // :17816-17818 干珊瑚炬 = 错群系
    }
    if (nearby[TORCH_STYLE.Jungle]) { good += z.jungle ? 1 : 0; bad += z.jungle ? 0 : 1; }
    if (nearby[TORCH_STYLE.Mushroom]) { good += z.glowshroom ? 1 : 0; bad += z.glowshroom ? 0 : 1; }
    if (nearby[TORCH_STYLE.Corrupt]) { good += z.corrupt ? 1 : 0; bad += z.corrupt ? 0 : 1; }
    if (nearby[TORCH_STYLE.Cursed] && z.corrupt) good += 1;   // :17828-17830
    if (nearby[TORCH_STYLE.Crimson]) { good += z.crimson ? 1 : 0; bad += z.crimson ? 0 : 1; }
    if (nearby[TORCH_STYLE.Ichor] && z.crimson) good += 1;    // :17831-17833
    if (nearby[TORCH_STYLE.Hallowed]) { good += z.hallow ? 1 : 0; bad += z.hallow ? 0 : 1; }
    if (nearby[TORCH_STYLE.Bone] && !z.snow && !z.desert && !z.corrupt && !z.crimson && !z.hallow && !z.jungle) {
      good += 0.5;                                            // :17834-17836
    }
    if (nearby[TORCH_STYLE.Torch]) {
      if (z.snow) bad += 2;                                    // :17837-17841
      else if (z.desert || z.corrupt || z.crimson || z.hallow) bad += 0.5;
    }
  }
  let torchLuck = 0;
  if (good >= 1) torchLuck += 1;
  else if (good > 0) torchLuck += 0.5;
  if (bad >= 2) torchLuck += -1.5;
  else if (bad >= 1) torchLuck += -1;
  else if (bad > 0) torchLuck += -0.5;
  if (torchLuck < 0) torchLuck = 0;   // :17919-17921
  return { torchLuck, hasGardenGnome: scanGnome(st, tx, ty) };
}
