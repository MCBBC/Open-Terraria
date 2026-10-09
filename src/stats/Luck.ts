// 幸运度系统 1:1（1.4.5.7/1.4.5.8 反编译锚 2026-08-31 实校——Terarria1456 旧注
//   :286xx 族已漂移,+695 左右,勿再引用）：
//   - 聚合公式 RecalculateLuck（Player.cs:29367-29394）：
//       luck = GetLadyBugLuck()*0.2 + torchLuck*0.2          （:29369）
//       luck += luckPotion*0.1                               （:29370，buff 257 三档）
//       luck += kiteLuckLevel*0.1/3                          （:29371，buff 383 三档）
//       luck += usedGalaxyPearl ? 0.03 : 0                   （:29372-29375，银河珍珠 5340）
//       luck += LanternsUp ? 0.3 : 0                         （:29376-29379）
//       luck += HasGardenGnomeNearby ? 0.2 : 0               （:29380-29383，tile 567）
//       luck += stinky ? -0.25 : 0                           （:29384-29387，buff 120）
//       luck += equipmentBasedLuckBonus                      （:29388，累加面 Player.cs:13148-13168）
//       luck += CalculateCoinLuck()                          （:29389，微光化币）
//       luck += brokenMirrorBadLuck ? -0.25 : 0              （:29390-29392，弹 1085 击碎镜）
//     注意：RecalculateLuck 本体不 clamp——luckMinimumCap=-0.7 / luckMaximumCap=1
//     （Player.cs:3071/3073）仅用于 UI 计量（:4098-4103），数值上可超界。
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
//           NPC.cs:78861-78862 LadyBugKilled(:82403)；触碰=好运 NPC.cs:78740
//           LadyBugLuck(:82437)。原登记 ID 359/360 为旧版误记——1.4.5.6+ 瓢虫是
//           NPC 604 Ladybug / 605 Gold Ladybug，359/360 实为蜗牛；
//           生成侧 ladyBugRainBoost 分支现居 Main.cs:65813/:65901，旧注
//           VanillaSpawner cs:2413 文件已不存在）
//     登记→已接（幸运来源批）：buff 383 风筝三档（BuffType.KiteBuff）、buff 120 恶臭
//           （BuffType.Stinky，Player.luck 直读）、银河珍珠 5340（vi_5340_galaxy_pearl
//           使用置 usedGalaxyPearl）、碎镜（vi_5577_pretty_mirror 投掷弹 1085 消亡近身
//           150px → brokenMirrorBadLuckTime；原版此处弹体 id=1085，旧注释"810"系 1.4.0.5 编号）。
//     登记→已接：微光化币（WorldItem.GetShimmered :1719 的钱币面额放大支
//           :1725-1745 → Player.AddCoinLuck :1743 消费面额档、距离门+cap 在 :18204；
//           ItemDrop 钱币分支已接，
//           回归见 tests/shimmer.test.ts「金币 73 入池」探针）。
//     登记→已接（2026-08-20）：四叶草族 5574/5575/5576（Player.luckEquipmentBonus——
//           clover 判定置位 Player.cs:12820/:12824、装备聚合消费 :13148-13168；获取链 =
//           割成熟
//           药草 1/1000（DropBait.dropCloverRoll）/乌鸦 301 掉 5576 1/10/微光
//           5574→5575）+ 马掌族运气位从 158 单件扩到九件全集。
//     仍登记：风筝/恶臭 buff 的授予物品（风筝族 4371 等/恶臭药水 1332/弹幕 1080）未移植;
//           瓢虫 releaseOwner 门（NPC.cs:82439 releaseOwner!=255 玩家放生的瓢虫不给
//           好运）——引擎无放生
//           跟踪,当前全瓢虫视为野生,恒满足。
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

/** Player.AFKTimeNeededForNoLuckyStars（Player.cs:973）——挂机玩家不接坠星定向 */
export const AFK_TIME_NO_LUCKY_STARS = 10800;

/**
 * 坠星运气定向（WorldGen.SpawnFallingObjects :72405-72417；1456 :71869-71881 纯函数化）。
 * ★幸运消费面七类④定谳（2026-09-03）：该线【不是】药草种子缩放——1457 药草采收
 * （KillTile_DropItems case 83/84 :66194-66214）全程无 luck（staffOfRegrowthBonus +
 * IsHarvestableHerbWithSeed 两掷而已）；:72410 `range = remix ? RollBadLuck : RollLuck`
 * 的真实消费体是坠星落点定向（"lucky stars"，常量名 AFKTimeNeededForNoLuckyStars 同源）。
 * 语义：range=15；取【坠点最近存活玩家】luck（FindClosest(position5)——Game 侧
 * closestPlayerLuckAt 注入）；非 remix RollLuck / remix RollBadLuck（:72410 原式），
 * ==0 且玩家 position.Y < worldSurface×16 且非挂机（afkCounter<10800）→ 落点 X 改
 * 玩家 position.X ± num30（num30=Next(1,640) 先掷半径、再掷偏移 Next(-num30,num30+1)
 * 两掷）并记 ai[1]=该玩家（AI_148 :54055 定向翻向消费）。
 * 返回 null = 不定向（照原随机落点）；number = 玩家 position.X 的 X 偏移 px。
 * 概率面（ luck=+1 / 0 / −1 ）：P(roll==0) = 0.1002 / 0.0667 / 0.0473——旧仓实现
 * `rand < luck×1/15` 在 luck=0 时漏基线 1/15、负运恒 0、正运低估 1.5×，已退役。
 */
export function starfallHoming(
  luck: number, remixWorld: boolean, rand: () => number,
  playerAboveSurface: boolean, afkOk: boolean,
): number | null {
  const range = remixWorld ? rollBadLuck(luck, 15, rand) : rollLuck(luck, 15, rand);
  if (range !== 0 || !playerAboveSurface || !afkOk) return null;
  const num30 = 1 + Math.floor(rand() * 639);                    // Next(1,640) = [1,639]
  return Math.floor(rand() * (2 * num30 + 1)) - num30;           // Next(-num30, num30+1)
}

// ============ 聚合态（仿 BuffState：环境因子 Game 侧写入，value 幂等聚合） ============

/** 瓢虫时序常量（NPC.cs:6643/:6645 ladyBugGoodLuckTime/BadLuckTime，tick） */
export const LADYBUG_GOOD_LUCK_TIME = 43200;
export const LADYBUG_BAD_LUCK_TIME = -10800;
/** 碎镜负面时序（写位 Projectile.Kill type==1085 支 Projectile.cs:72054） */
export const BROKEN_MIRROR_TIME = 25200;
/** 钱币幸运累计上限（Player.cs AddCoinLuck :18208-18210 cap 1e6） */
const COIN_LUCK_CAP = 1_000_000;

export class LuckState {
  /** 火炬幸运（TryRecalculatingTorchLuck 结果，∈[0,1]——负贡献末尾钳 0） */
  torchLuck = 0;
  /** 花园地精在 SceneMetrics 窗口内（SceneMetrics.cs:597-600 _tileCounts[567]>0） */
  hasGardenGnomeNearby = false;
  /** 灯笼夜（LanternNight.LanternsUp，Game 侧每 tick 同步） */
  lanternsUp = false;
  /** 银河珍珠已用（Player.cs:45789-45793 使用支 usedGalaxyPearl=true@:45791 一次性）
   *  ——物品 vi_5340_galaxy_pearl 已注册，
   *  Game 使用分支（useTime 45）置位后消耗 */
  usedGalaxyPearl = false;
  /** Stinky（buff 120，Player.cs:10363-10366）——Player.luck 直接读 BuffType.Stinky（buff 在
   *  即 stinky）；此位仅作环境外注入备用。授予来源（恶臭药水 1332/弹幕 1080）未移植 */
  stinky = false;
  /** 碎镜负面计时 tick（brokenMirrorBadLuckTime，UpdateBrokenMirrorLuck Player.cs:29396-29412） */
  brokenMirrorBadLuckTime = 0;
  /** 瓢虫 luck 计时 tick（正=好运余量/负=坏运余量；UpdateLadyBugLuckTime Player.cs:18950-18969 衰减） */
  ladyBugLuckTimeLeft = 0;
  /** 钱币幸运累计（铜币面额；来源 = 微光化币 WorldItem.GetShimmered 钱币支 :1725-1745——ItemDrop 钱币
   *  入微光消散分支已接 addCoinLuck（距离门+面额放大），回归见 tests/shimmer.test.ts） */
  coinLuck = 0;

  /** GetLadyBugLuck（Player.cs:18270-18282）：timeLeft/43200 或 -timeLeft/-10800（∈[-1,1]） */
  get ladyBugLuck(): number {
    if (this.ladyBugLuckTimeLeft > 0) return this.ladyBugLuckTimeLeft / LADYBUG_GOOD_LUCK_TIME;
    if (this.ladyBugLuckTimeLeft < 0) return -this.ladyBugLuckTimeLeft / LADYBUG_BAD_LUCK_TIME;
    return 0;
  }

  get brokenMirrorBadLuck(): boolean {
    return this.brokenMirrorBadLuckTime > 0;
  }

  /** CalculateCoinLuck（Player.cs:18229-18268 分档） */
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

  /** LadyBugKilled（NPC.cs:82403-82433）——瓢虫饵 4361/4362 消耗钩与瓢虫击杀共用：
   *  距离 <400px 才生效（<100px 视为 0 距离），坏运量 = (int)(-10800 × (1−d/400)) ×
   *  (金瓢虫 ×2)，仅当比当前更坏（num3 < timeLeft）才覆写。
   *  Main.ladyBugRainBoost += 1800 钳 18000（:82405-82409）由 Weather 侧承接 */
  applyLadyBugKilled(distPx: number, goldLadyBug = false): void {
    if (distPx >= 400) return;
    const v = distPx < 100 ? 0 : distPx;                       // :82416-82419
    const num2 = 1 - v / 400;                                  // :82421
    const num3 = Math.trunc(-10800 * num2) * (goldLadyBug ? 2 : 1);  // :82422-82425
    if (num3 < this.ladyBugLuckTimeLeft) this.ladyBugLuckTimeLeft = num3;  // :82430-82432
  }

  /** AddCoinLuck（Player.cs:18204-18215）：距离 <1000px 才累计，cap 1e6 */
  addCoinLuck(distPx: number, coinAmount: number): void {
    if (distPx >= 1000) return;
    this.coinLuck = Math.min(COIN_LUCK_CAP, this.coinLuck + coinAmount);
  }

  /** 时序衰减（每 tick 调用；Main.dayRate 默认 1）：
   *  - 瓢虫 :18950-18969（正负分别向 0 收敛）
   *  - 钱币 UpdateCoinLuck :18217-18227（×0.9999^dayRate，<0.25 清零）
   *  - 碎镜 UpdateBrokenMirrorLuck :29396-29412 */
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

  /** ★BJ562（2026-10-09）NPCLuck（NPC.cs:82466-82490——checkDead townNPC 支
   *  :78944-78946 `if (Main.netMode != 2)` 调用=单机/客户端态,专写本地玩家
   *  瓢虫运；本仓消费位 TownNPC.npcLuckOnDeath）：城镇 NPC 死亡的运面双支：
   *  · 向导 22（:82468-82479）死亡延瓢虫好运——门 ladyBugLuckTimeLeft ≥ 0
   *    （当前非负运才接,负运不抵消）+ 玩家 active 且未死；量 = 43200/3 = 14400t
   *    （「1/3 昼」,取更优：num > timeLeft 才覆写）。
   *  · 其余城镇 NPC（:82480-82489）死亡缓瓢虫厄运——护士 54 排除（:82481,type!=54,
   *    医师照护不欠运）;量 = -10800/3 = -3600t（1 分钟）,仅比当前更坏才覆写
   *    （num2 < timeLeft——已持更坏值不抬升）。
   *  luckNeedsSync 置位（:82477/:82487）为联机同步旗,本仓单人态无独立面（登记）。
   *  城镇宠物/渔夫/公主不在排除表——死亡同走厄运支（:78942 门只排 37/453）。 */
  npcLuck(townNpcType: number, playerActive: boolean, playerDead: boolean): void {
    if (townNpcType === 22) {
      if (this.ladyBugLuckTimeLeft >= 0 && playerActive && !playerDead) {
        const num = LADYBUG_GOOD_LUCK_TIME / 3;                    // 14400（:82473）
        if (num > this.ladyBugLuckTimeLeft) {
          this.ladyBugLuckTimeLeft = num;                          // :82475-82478
        }
      }
    } else if (townNpcType !== 54 && playerActive && !playerDead) {
      const num2 = LADYBUG_BAD_LUCK_TIME / 3;                      // -3600（:82483）
      if (num2 < this.ladyBugLuckTimeLeft) {
        this.ladyBugLuckTimeLeft = num2;                           // :82485-82488
      }
    }
  }
}

// ============ 火炬幸运扫描（TryRecalculatingTorchLuck :17845-17909 窗口 +
// :18026-18202 计算 1:1；1456 旧注 17580/17771 族已漂移作废） ============
// 窗口：玩家 Center tile ±40（81×81,Player.cs:17864 num2=40）。原版每 tick 只扫一行
//（luckyTorchCounter 逐行推进,TryRecalculatingTorchLuck Player.cs:17845-17909）,
// 扫满 81 行才 UpdateTorchLuck_ConsumeCountersAndCalculate(:18026-18202)；本仓按 15 tick
// 一整窗直扫（节流等价，语义同净效果）。地表（:17858-17862 worldSurface 门）同理。
// ★SW-FX25 勘误：地表支门锚 = 玩家盒【中心】（:17859 nextTorchLuckCheckCenter =
//   _nextTorchLuckCheckCenter,:18032 = base.Center）——Center.Y < worldSurface*16 或死亡
//   → 直接 Consume（torchLuck=0）。旧注 "position.Y ≤ worldSurface*16"（顶边锚）系与
//   TorchAttack/torchGod 门（:17935/:18182 用 position.Y）混淆——顶边锚会把门界错位
//   h/2=21px（同族对照：坠星 72410 与 torchGod 门确为 position.Y 顶边,勿再外推）。

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
  /** 地表以下（Center.Y ≥ worldSurface*16,中心锚 1457:17859-17862/:18032——★SW-FX25
   *  勘误:旧注 "position.Y > worldSurface*16" 系与 TorchAttack :17935 顶边门混淆）
   *  ——地表恒无火炬幸运 */
  belowSurface: boolean;
  zones: LuckScanZones;
  /** 手持火把 placeStyle（inventory[selectedItem].createTile==4 && placeStyle<24；无 = null） */
  heldTorchStyle: number | null;
}

const TORCH_WINDOW = 40;          // num2（Player.cs:17864）
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

/**
 * 火炬幸运「地下扫描」门（TryRecalculatingTorchLuck :17859-17862）：
 * 原式 `nextTorchLuckCheckCenter.Y < Main.worldSurface * 16.0` → 地表支
 * （ConsumeCounters,torchLuck=0）——反形即 center.Y ≥ worldSurface*16 进地下逐行扫描。
 * ★SW-FX25 定谳：锚 = 玩家盒【中心】Center.Y（:18032 `_nextTorchLuckCheckCenter =
 * base.Center`），非 position.Y 顶边（顶边门属 TorchAttack :17935 / torchGod :18182,
 * RB9a 已按顶边另修——两门同域异锚,勿互串）。比较子 = 闭区间界：centerY == 界值时
 * 原版走地下支（`<` 的反形 = ≥）——旧仓 `cy/16 > groundLevel`（>）把界值拍误归地表支。
 * 仓内净效果版以当帧 Center 代原版滞后检查中心（地下期原版最长 81t 不刷新,登记债）。
 */
export function torchLuckCheckCenterBelowSurface(centerY: number, worldSurfaceTiles: number): boolean {
  return centerY >= worldSurfaceTiles * 16;
}

/** 扫描火炬窗口 + 地精窗口，算出 torchLuck 与 gnome 在否（1:1 净效果版） */
export function scanLuckScene(input: LuckScanInput): { torchLuck: number; hasGardenGnome: boolean } {
  const { store: st, tx, ty } = input;
  if (!input.belowSurface) {
    // TryRecalculatingTorchLuck :17592-17598：地表直接 ConsumeCounters → torchLuck=0
    return { torchLuck: 0, hasGardenGnome: scanGnome(st, tx, ty) };
  }

  // 火炬窗口计数（TryRecalc 扫描体 :17871-17907；nearbyTorches 燃烧计数只喂 Torch God 触发，
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
          // :17896-17899：珊瑚炬非水中 → dryCoral（下文按"错群系"计负）
          if (style === TORCH_STYLE.Coral && (st.liquid[i] === 0 || st.liquidType[i] !== 1)) dryCoral = true;
        }
      }
    }
  }
  if (input.heldTorchStyle !== null && input.heldTorchStyle < TORCH_STYLE_COUNT) {
    nearby[input.heldTorchStyle] = true;   // UpdateTorchLuck_ConsumeCountersAndCalculate :18031-18034
  }

  // ---- UpdateTorchLuck_ConsumeCountersAndCalculate（:18026-18202）----
  // num2=good（正确群系火炬加分项）num=bad（错群系火炬负分项）
  const z = input.zones;
  let good = 0;
  let bad = 0;
  if (!z.dungeon && !z.temple) {
    if (nearby[TORCH_STYLE.Ice]) { good += z.snow ? 1 : 0; bad += z.snow ? 0 : 1; }
    if (nearby[TORCH_STYLE.Desert]) { good += z.desert ? 1 : 0; bad += z.desert ? 0 : 1; }
    if (nearby[TORCH_STYLE.Coral]) {
      if (z.ocean) good += 1;          // :18063-18065 海洋深度带内 = 正确群系
      else if (dryCoral) bad += 1;     // :18067-18069 干珊瑚炬 = 错群系
    }
    if (nearby[TORCH_STYLE.Jungle]) { good += z.jungle ? 1 : 0; bad += z.jungle ? 0 : 1; }
    if (nearby[TORCH_STYLE.Mushroom]) { good += z.glowshroom ? 1 : 0; bad += z.glowshroom ? 0 : 1; }
    if (nearby[TORCH_STYLE.Corrupt]) { good += z.corrupt ? 1 : 0; bad += z.corrupt ? 0 : 1; }
    if (nearby[TORCH_STYLE.Cursed] && z.corrupt) good += 1;   // :18105-18108
    if (nearby[TORCH_STYLE.Crimson]) { good += z.crimson ? 1 : 0; bad += z.crimson ? 0 : 1; }
    if (nearby[TORCH_STYLE.Ichor] && z.crimson) good += 1;    // :18120-18123
    if (nearby[TORCH_STYLE.Hallowed]) { good += z.hallow ? 1 : 0; bad += z.hallow ? 0 : 1; }
    if (nearby[TORCH_STYLE.Bone] && !z.snow && !z.desert && !z.corrupt && !z.crimson && !z.hallow && !z.jungle) {
      good += 0.5;                                            // :18135-18137
    }
    if (nearby[TORCH_STYLE.Torch]) {
      if (z.snow) bad += 2;                                    // :18141-18148
      else if (z.desert || z.corrupt || z.crimson || z.hallow) bad += 0.5;
    }
  }
  let torchLuck = 0;
  if (good >= 1) torchLuck += 1;
  else if (good > 0) torchLuck += 0.5;
  if (bad >= 2) torchLuck += -1.5;
  else if (bad >= 1) torchLuck += -1;
  else if (bad > 0) torchLuck += -0.5;
  if (torchLuck < 0) torchLuck = 0;   // :18176-18179
  return { torchLuck, hasGardenGnome: scanGnome(st, tx, ty) };
}
