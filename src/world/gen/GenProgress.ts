// 移植 Terraria.WorldBuilding/GenerationProgress.cs + PassLegacy._weightMap（Terarria1457）
//
// 原版机制（GenerationProgress.cs / WorldGenerator.RunPass cs:497-509）：
//   - 每个 GenPass 执行前 `_progress.Start(pass.Weight)`：CurrentPassWeight=weight、Value=0；
//       执行中 pass 体高频 `progress.Set(v)` / `progress.Set(v,min,max)` 更新【段内】Value；
//       执行后 `_progress.End()`：把权重累进 _totalWeightedProgress。
//   - 长条 TotalProgress = (Value*CurrentPassWeight + _totalWeightedProgress) / TotalWeight；
//     短条 = Value（当前 pass 段内进度）——UIWorldLoad.DrawSelf :113-133。
//   - Message 一旦设置就【持久保留】直到下一个设置点；从不设置的 pass 不改变显示
//     （RunPass 只 Start/Set，不清 Message）——bundle 槽内的"无声 pass"沿用旧文案，
//     与原版逐字一致。因此本文件的词条表【缺席即粘滞】，不做任何猜测性借键——
//     每个条目须有反编译锚点或 tools 中 worldgenKeys 已有的借键记录背书。
// 本仓对应物：JS 把多个原版 GenPass 打包进一个槽（WorldGen.passes[]）。本文件提供：
//   ① 权重表（_weightMap 逐值照录，未命中回退 1——GetWeight 同语义）；
//   ② 子 pass 文案表（见上）；③ GenProgress 顺序窗口模型：
//      beginVan 开窗 → set()/set3() 填段内进度 → 下一次 beginVan 自动收账；
//      enterSlot/leaveSlot 由管线主循环调用，未被显式消费的子 pass 在 leaveSlot
//      时一次性补收账（自愈未接线的包装）；
//   ④ makeThrottledSink：Set 可能每列一发，postMessage/UI 必须限频。
// ★零 RNG 面：全部为纯读取/回调注入，对金标链与掷流无扰动。

/** 原版 PassLegacy._weightMap（1.4.5.7 实测时长派生的展示权重；未命中=1）。
 *  权威：Terarria1457/Terraria.GameContent.Generation/PassLegacy.cs:83-183 */
export const VANILLA_PASS_WEIGHTS: Readonly<Record<string, number>> = {
  'Reset': 0.9667,
  'Terrain': 507.352,
  'Dunes': 239.7913,
  'Ocean Sand': 10.4129,
  'Sand Patches': 452.6755,
  'Tunnels': 4.3622,
  'Mount Caves': 49.9993,
  'Dirt Wall Backgrounds': 328.7817,
  'Rocks In Dirt': 1537.4661,
  'Dirt In Rocks': 1515.2301,
  'Clay': 314.8327,
  'Small Holes': 2955.9258,
  'Dirt Layer Caves': 238.2545,
  'Rock Layer Caves': 2708.3958,
  'Surface Caves': 42.3857,
  'Generate Ice Biome': 100.005,
  'Grass': 29.7885,
  'Jungle': 11205.83,
  'Mud Caves To Grass': 3319.761,
  'Full Desert': 9730.408,
  'Mushroom Patches': 743.7686,
  'Marble': 5358.8843,
  'Granite': 2142.6638,
  'Floating Islands': 1364.3461,
  'Dirt To Mud': 351.3519,
  'Silt': 211.84,
  'Shinies': 237.4298,
  'Webs': 50.6646,
  'Underworld': 8936.494,
  'Lakes': 12.1766,
  'Corruption': 1094.237,
  'Dungeon': 477.1963,
  'Slush': 55.1857,
  'Mountain Caves': 11.4819,
  'Beaches': 7.8287,
  'Gems': 895.426,
  'Gravitating Sand': 933.5295,
  'Clean Up Dirt': 697.0276,
  'Pyramids': 6.6884,
  'Dirt Rock Wall Runner': 24.7648,
  'Living Trees': 4.937,
  'Wood Tree Walls': 76.8709,
  'Altars': 72.6607,
  'Wet Jungle': 23.492,
  'Remove Water From Sand': 22.0898,
  'Jungle Temple': 595.8422,
  'Hives': 371.392,
  'Smooth World': 5841.608,
  'Settle Liquids': 9398.525,
  'Waterfalls': 4118.666,
  'Ice': 163.0777,
  'Wall Variety': 5264.0215,
  'Life Crystals': 2.7582,
  'Statues': 64.5737,
  'Buried Chests': 1102.5532,
  'Surface Chests': 12.8337,
  'Water Chests': 12.5981,
  'Spider Caves': 475.4143,
  'Gem Caves': 36.0143,
  'Moss': 655.8314,
  'Ice Walls': 957.0317,
  'Underground Jungle Trees': 817.2459, // ★表条目名="Jungle Trees"（cs 地下区注册邻位归此）
  'Floating Island Houses': 1.5022,
  'Quick Cleanup': 1374.467,
  'Pots': 1638.6091,
  'Hellforge': 2.8645,
  'Spreading Grass': 127.7581,
  'Place Fallen Log': 17.3377,
  'Traps': 562.9085,
  'Piles': 288.3675,
  'Spawn Point': 0.012,
  'Grass Wall': 604.9992,
  'Guide': 0.016,
  'Sunflowers': 4.1757,
  'Planting Trees': 325.0993,
  'Herbs': 120.1871,
  'Dye Plants': 226.6394,
  'Webs And Honey': 608.9524,
  'Weeds': 187.9759,
  'Mud Caves To Grass 2': 686.4958,
  'Jungle Plants': 1295.0378,
  'Vines': 1132.5549,
  'Flowers': 16.7723,
  'Mushrooms': 0.2294,
  'Gems In Ice Biome': 10.3092,
  'Random Gems': 18.4925,
  'Moss Grass': 687.742,
  'Muds Walls In Jungle': 89.7739,
  'Larva': 0.2074,
  'Settle Liquids Again': 7073.647,
  'Tile Cleanup': 1896.7603,
  'Lihzahrd Altars': 0.0071,
  'Micro Biomes': 3547.4304,
  'Stalac': 1180.9058,
  'Remove Broken Traps': 1293.4247,
  'Final Cleanup': 2080.294,
};

/** 子 pass 文案表：vanName → 词条（number=Lang.gen[N] 的 N / LegacyWorldGen.N；
 *  string=命名空间完整键如 'WorldGeneration.SandPatches'）。
 *  ★缺席 = 原版该 pass 无 progress.Message 设点 —— 显示粘滞沿用上一条，禁止猜借。
 *  锚点列注 = Terraria/WorldGen.cs 反编译行号（ter1457）。 */
export const VAN_PASS_MESSAGE: Readonly<Record<string, number | string>> = {
  'Terrain': 0,                                    // TerrainPass.cs:59（Terrain 第一个设点）
  'Dunes': 1,                                      // cs:11563
  'Ocean Sand': 'WorldGeneration.OceanSand',       // cs:11619
  'Sand Patches': 'WorldGeneration.SandPatches',   // cs:11728
  'Tunnels': 'WorldGeneration.SurfaceTunnels',     // cs:11759
  'Mount Caves': 2,                                // cs:11826（MountCaves :11809 注册）
  'Dirt Wall Backgrounds': 3,                      // cs:11899
  'Rocks In Dirt': 4,                              // cs:11938（覆盖 RocksInDirt/DirtInRocks 双段）
  'Clay': 5,                                       // cs:11968
  'Small Holes': 6,                                // cs:12001（.25/.5/.75 分段公式同域）
  'Dirt Layer Caves': 7,                           // cs:12050
  'Rock Layer Caves': 8,                           // cs:12110
  'Surface Caves': 10,                             // cs:12207（.0/.2/.4/.6/.8 分段所在）
  'Wavy Caves': 'WorldGeneration.WavyCaves',       // cs:12317
  'Generate Ice Biome': 56,                        // cs:12359
  'Mud Caves To Grass': 77,                        // cs:12515
  'Full Desert': 78,                               // cs:12548 "沙漠化"
  'Mushroom Patches': 13,                          // cs:12599
  'Marble': 80,                                    // cs:12816
  'Granite': 81,                                   // cs:12900
  'Floating Islands': 12,                          // cs:12994
  'Dirt To Mud': 14,                               // cs:13188
  'Silt': 15,                                      // cs:13208
  'Shinies': 16,                                   // cs:13249
  'Webs': 17,                                      // cs:13675
  'Underworld': 18,                                // cs:13713
  'Corruption': 20,                                // cs:14352（猩红侧血月臂数 14010 另言，此处标准臂）
  'Lakes': 19,                                     // cs:14629
  'Mountain Caves': 21,                            // MountainCaveOpenings cs:14948
  'Beaches': 22,                                   // cs:14970
  'Gems': 23,                                      // cs:15125
  'Gravitating Sand': 24,                          // cs:15214
  'Shimmer': 90,                                   // cs:15253（微光段）
  'Clean Up Dirt': 25,                             // cs:15332
  'Living Trees': 'WorldGeneration.LivingTrees',   // cs:15567
  'Wood Tree Walls': 'WorldGeneration.LivingTrees',// cs:15808
  'Altars': 26,                                    // cs:15844
  'Jungle Temple': 70,                             // cs:15928
  'Hives': 71,                                     // cs:16021
  'Settle Liquids': 27,                            // cs:16231
  'Oasis': 'WorldGeneration.Oasis',                // cs:16343
  'Shell Piles': 'WorldGeneration.ShellPiles',     // cs:16409
  'Smooth World': 60,                              // cs:16521
  'Waterfalls': 69,                                // cs:16716
  'Wall Variety': 79,                              // cs:16807
  'Life Crystals': 28,                             // cs:16878
  'Statues': 29,                                   // cs:16966
  'Buried Chests': 30,                             // cs:17090
  'Surface Chests': 31,                            // cs:17245
  'Spider Caves': 64,                              // cs:17475
  'Gem Caves': 64,                                 // cs:17547
  'Moss': 61,                                      // cs:17598
  'Ice Walls': 63,                                 // CaveWallsInEnclosedSpaces cs:17841
  'Underground Jungle Trees': 83,                  // cs:17972
  'Floating Island Houses': 'WorldGeneration.FloatingIslandHouses', // cs:17990
  'Quick Cleanup': 'WorldGeneration.QuickCleanup', // cs:18006
  'Pots': 35,                                      // cs:18127
  'Hellforge': 36,                                 // cs:18320
  'Spreading Grass': 37,                           // cs:18371
  'Place Fallen Log': 85,                          // cs:18654
  'Traps': 34,                                     // cs:18793
  'Piles': 89,                                     // cs:18922
  'Sunflowers': 39,                                // cs:20065
  'Planting Trees': 40,                            // cs:20107
  'Herbs': 41,                                     // cs:20136
  'Weeds': 42,                                     // GrassPlants cs:20231（染料植物借此序无设点→粘滞）
  'Vines': 43,                                     // cs:20360
  'Flowers': 44,                                   // cs:20614
  'Mushrooms': 45,                                 // cs:20766
  'Long Moss': 'WorldGeneration.LongMoss',         // cs:20937
  'Micro Biomes': 76,                              // 1457 前移沉降前 cs:21078
  'Settle Liquids Again': 27,                      // 1457 位于 MicroBiomes 之后（粘滞接 76→27 顺序
                                                   //   以锚点行为准；此条对应原二段尾首掷前设点缺失时的
                                                   //   显示兼容借键——世界端不显式 begin 则永不取用）
  'Cactus & Coral': 38,                            // cs:21119（1457 平移后同构）
  'Tile Cleanup': 84,                              // cs:21332
  'Speleothems And Gem Trees': 'WorldGeneration.Speleothems',
  'Remove Broken Traps': 82,                       // cs:22287
};
// 备忘（曾验缺设点故【不入】本表的疑似项）：Grass(:12481 仅 Set)、Slush、Dungeon(:14830)、
// RemoveSurfaceWaterAboveSand、JungleChestsPlacement/ShrineChests、FragileIce、GrassWall、
// SpawnPoint、StarterNPCs(Guide)、WebsAndHoney(:20140)、DyePlants、GlowingMushroomPlants、
// JunglePlantsPart2、MudsWallsInJungle、Larva、Lilypads、FinalCleanup 尾文字（86/87 双文案族）。

/** 重型实现体挂点约定：vanilla/*.ts 的导出 pass 函数以**可选尾参** `gp?: GenProgress`
 *  接收本实例；体内在反编译对应 progress.Set 行位调 gp?.set(v)/set3(v,min,max)。
 *  内部独立子 pass（函数内再 reseed 者）自行 gp?.beginVan('X') 开窗——声明表成员
 *  由最靠近的调用方消费，遗漏者 leaveSlot 自愈。探针/重放直调一律不传 gp（全空转）。
 * ★零 RNG 面：仅旁路读值，禁止任何掷骰/write 面依赖本对象。 */

/** 进度发射签名。label=undefined 表示“沿用上一条”（worker 可省字段省字节）。
 *  p∈[0,1] 加权总进度（长条）；local=当前窗口段内 Value∈[0,1]（短条）。
 *  force=true 表示跨边界必达消息（不受限流削掉）。 */
export type GenProgressSink = (
  label: string | undefined, p: number, local: number, force: boolean,
) => void;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** GenerationProgress.cs 1:1 + 本仓管线槽编排（顺序权重窗模型）。
 *  账目不变式：doneWeight += 每个已关闭窗口的权重；总账 totalWeight 由管线静态灌入。
 *  当前开窗进度写入 Value；overall=(value*currentWeight+doneWeight)/totalWeight。 */
export class GenProgress {
  value = 0;                       // 当前窗 Value（cs:39-49 clamp）
  totalWeight = 0;                 // TotalWeight

  private currentWeight = 0;       // CurrentPassWeight（当前开窗）
  private doneWeight = 0;          // _totalWeightedProgress
  /** 当前显示键：词条字符串 / 槽名（兜底）/ null=从未设置（发 undefined=沿用） */
  displayKey: string | null = null;
  private pendingSubs: string[] = [];           // 本槽尚未显式 beginVan 的队列（可变——逐个摘除）
  private openWindow = false;                    // 是否存在待收账窗
  private slotName: string | null = null;        // 当前槽名（仅告警语境用）
  private multiSlot = false;                     // 多成员槽 ⇒ beginVan 必须命中声明表

  constructor(
    /** 发射信道（限流后的）；null=静默构建（探针/replay 直调场景） */
    private sink: GenProgressSink | null,
    /** 管线附属尾段的展示键与权重（finalize/清扫族等我们自加的收尾步骤）。
     *  key 可缺省——缺省时只计权不改字（沿用粘滞文案，通常已是终清理的 87）。 */
    private tail?: { key?: string; weight: number },
  ) {}

  /** cs:59-69 TotalProgress */
  get overall(): number {
    return this.totalWeight === 0 ? 0
      : (this.value * this.currentWeight + this.doneWeight) / this.totalWeight;
  }

  /** cs:81-85 Start(weight)：纯净件（开新窗不计旧账） */
  start(weight: number): void { this.currentWeight = weight; this.value = 0; }

  /** cs:87-91 End()：纯净件 */
  end(): void { this.doneWeight += this.currentWeight; this.value = 0; this.currentWeight = 0; }

  /** cs:71-74 Set(value) */
  set(value: number): void { this.value = clamp01(value); this.emit(false); }

  /** cs:76-79 Set(value,min,max) */
  set3(value: number, min: number, max: number): void { this.set(min + value * (max - min)); }

  // ---- 管线主循环接口 ----

  /** 进入槽。subpasses=该槽对应的原版 pass 名序列（世界端 SLOT_VANILLA_PASSES）。
   *  单成员槽立即开整窗（包装函数零改动）；多成员槽由包装函数逐个 beginVan 消费。 */
  enterSlot(slotName: string, subpasses: readonly string[]): void {
    this.closeWindow();                       // 上槽残留防御性收账
    this.slotName = slotName;
    this.multiSlot = subpasses.length > 1;
    if (subpasses.length === 0) {             // 未声明构成（自加兜底槽）
      this.pendingSubs = [];
      if (this.displayKey === null) this.displayKey = slotName;
      this.openWindow = true; this.currentWeight = 1; this.value = 0;
    } else if (subpasses.length === 1) {      // 单成员：整窗直开
      const n = subpasses[0]!;
      this.pendingSubs = [];
      this.applyMsg(n);
      this.openWindow = true;
      this.start(this.weightOf(n));
      this.emit(true);
    } else {                                  // 多成员：预置队列，窗由 beginVan 开
      this.pendingSubs = subpasses.slice();
      this.currentWeight = 0; this.value = 0; this.openWindow = false;
      this.emit(true);
    }
  }

  /** 结束槽：把包装函数忘记显式 beginVan 的剩余子 pass 权重一次性补收（自愈） */
  leaveSlot(): void {
    this.closeWindow();
    for (const n of this.pendingSubs) this.doneWeight += this.weightOf(n);
    this.pendingSubs = [];
    this.slotName = null;
    this.multiSlot = false;
    this.emit(true);
  }

  // ---- pass 体接口 ----

  /** 开始一个原版子 pass（自动收上一窗账；仅当有词条才换显示键）。
   *  ★账目不变式（终清零批护栏）：vanName 必须是当前槽声明成员——未声明名会让
   *   该窗权重进账却不进 TotalWeight ⇒ overall 提前顶满被 clamp（Dungeon 漏声明
   *   实证）。多成员槽内在此硬告警；单成员槽自动开窗等价于已消费，不走本分支。 */
  beginVan(vanName: string): void {
    this.closeWindow();
    const i = this.pendingSubs.indexOf(vanName);
    // ★护栏：多成员槽内 begin 未声明名 ⇒ 该窗权重溢出总账（Dungeon 漏声明实证）
    if (this.multiSlot && i < 0) {
      console.warn(`[GenProgress] beginVan 未声明成员 "${vanName}"（槽 ${this.slotName ?? '?'}）` +
        ' —— 权重会溢出总账，请补进 SLOT_VANILLA_PASSES');
    }
    if (i >= 0) this.pendingSubs.splice(i, 1);
    this.applyMsg(vanName);
    this.openWindow = true;
    this.start(this.weightOf(vanName));
    this.emit(true);                       // 边界必达：换窗即上屏（含文案粘滞的再次确认）
  }

  /** 只读账目观测（测试/诊断用） */
  get done(): number { return this.doneWeight; }

  /** 单发式：粗粒度子 pass 直接 begin+置满+收账（边界停留时间≈0 的薄 pass） */
  subOnce(vanName: string): void { this.beginVan(vanName); this.set(1); this.endVan(); }

  /** 收当前窗账（不触显示键——粘滞语义） */
  endVan(): void { this.closeWindow(); this.emit(true); }

  /** 管线附属尾段（finalize 族）：小权重普通窗口 */
  beginTail(): void {
    this.closeWindow();
    if (!this.tail) return;
    if (this.tail.key !== undefined) this.displayKey = this.tail.key;
    this.openWindow = true;
    this.start(this.tail.weight);
  }

  finish(): void {
    this.closeWindow();
    this.doneWeight = this.totalWeight;
    this.value = 0; this.currentWeight = 0;
    this.emit(true);
  }

  // ---- 内部 ----

  private closeWindow(): void {
    if (this.openWindow) { this.doneWeight += this.currentWeight; this.openWindow = false; }
    this.currentWeight = 0; this.value = 0;
  }

  private applyMsg(vanName: string): void {
    const m = VAN_PASS_MESSAGE[vanName];
    if (m !== undefined) this.displayKey = String(m);
  }

  weightOf(name: string): number { return VANILLA_PASS_WEIGHTS[name] ?? 1; }

  private emit(force: boolean): void {
    this.sink?.(
      this.displayKey === null ? undefined : this.displayKey,
      Math.max(0, Math.min(1, this.overall)), this.value, force,
    );
  }
}

/** 限流装配：收敛 Set 高频流为可承受的消息率（首帧/force/label 变化必达；
 *  否则 Δp≥0.004 或 Δlocal≥0.05 或 距上次 ≥120ms 且任一值有变化）。 */
export function makeThrottledSink(out: (label: string | undefined, p: number, local: number) => void):
  GenProgressSink {
  let lastLabel: string | undefined = '';
  let lastP = -1;
  let lastLocal = -1;
  let lastAt = Date.now();
  let first = true;
  return (label, p, local, force) => {
    const now = Date.now();
    const due = first || force
      || (label !== undefined && label !== lastLabel)
      || Math.abs(p - lastP) >= 0.004
      || Math.abs(local - lastLocal) >= 0.05
      || (now - lastAt >= 120 && (local !== lastLocal || p !== lastP));
    if (!due) return;
    first = false;
    lastLabel = label !== undefined ? label : lastLabel;
    lastP = p; lastLocal = local; lastAt = now;
    out(label, p, local);
  };
}
