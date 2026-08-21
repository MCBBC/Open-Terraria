// 1.4.5.7 新增 ID.Sets 全量登记（批 B 数据层收尾，2026-08-22）。
//
// 数据来源（行号 = Terarria1457 反编译源码；1456 均无这些表）：
//   · Terraria.ID/ItemID.cs        :58 / :80 / :181
//   · Terraria.ID/ProjectileID.cs  :19 / :21 / :25 / :191 / :193 / :275
//   · Terraria.ID/TileID.cs        :325 / :327
//   · Terraria.ID/NPCID.cs         :4791 / :4823
//   · Terraria.ID/CloudID.cs       :11 / :17（Sets 类整体新增）
//
// 落点说明（grep 消费点定谳）：
//   · 已有消费点、已在此前批次落地的三件不在此重复登记——
//     ProjectileID.Sets.FixedSelfDamageForPlayers → src/core/Game.ts FIXED_SELF_DAMAGE_FOR_PLAYERS
//     ProjectileID.Sets.SkipDamage_EVP            → src/entities/projTargets.ts
//     NPCID.Sets.BoundTownNPCs                    → src/core/Game.ts BOUND_TOWN_NPC_VANILLA
//   · CloudID.Sets.RareClouds_* 有消费点（SkyRenderer.rollRareCloud）——落在
//     src/render/SkyRenderer.ts（渲染模块内聚，含 41 Rare_Pixie 的 hardMode 门）。
//   · 其余暂无消费点，登记在本模块备批 C/D 接线（值已逐表对过 1457 源码）。
//     表形态：Record<vanillaId, value>（缺省值见各表注释，未列 = 缺省）。

// ---------------------------------------------------------------------------
// ItemID.Sets（3）
// ---------------------------------------------------------------------------

/** ItemID.Sets.AccessoryIncompatibilityType（:58，int[] 缺省 -1）——四件 AmmoCycler
 *  互斥组 6168（6168/6169/6193/6194 同组不可共存）。消费点：ItemSlot.HasIncompatibleAccessory
 *  （1457 ItemSlot.cs 扩展）；本仓对应链 = FurnitureItems.dollAccessoryTargetSlot/
 *  玩家配饰冲突判定（批 C/D 接线）。 */
export const ITEM_ACCESSORY_INCOMPATIBILITY_TYPE: Record<number, number> = {
  6168: 6168, 6169: 6168, 6194: 6168, 6193: 6168,
};

/** ItemID.Sets.UsesHandPositionForItemLocationOnDisplayDolls（:80，bool[] 缺省 false）
 *  ——模特展示时用手部持物锚点而非物品默认锚点的武器（65 Starfury/724 IceBlade/
 *  1827 BladedGlove/3352 StylistKilLaKillScissorsIWish）。消费点：TEDisplayDoll 绘制
 *  （批 C/D 接线）。 */
export const ITEM_USES_HAND_POSITION_FOR_ITEM_LOCATION_ON_DISPLAY_DOLLS: readonly number[] = [
  65, 724, 1827, 3352,
];

/** ItemID.Sets.DropWithGrabDelayForAllPlayers（:181，bool[] 缺省 false）——{267
 *  GuideVoodooDoll}：向导巫毒 doll 掉落时对所有玩家带抓取延迟（防误捡重复杀向导）。
 *  本仓掉落链 noGrabDelay 语义在 src/ui/UI.ts（批 C/D 接线）。 */
export const ITEM_DROP_WITH_GRAB_DELAY_FOR_ALL_PLAYERS: readonly number[] = [267];

// ---------------------------------------------------------------------------
// ProjectileID.Sets（6，其中 FixedDamageForRockets 为常量）
// ---------------------------------------------------------------------------

/** ProjectileID.Sets.DespawnItemIcon（:19，int[] 缺省 0）——弹幕超时消失时掉落
 *  图标物品（72 对）。消费点：Projectile.Kill 的 despawn 分支（批 C/D 接线）。 */
export const PROJ_DESPAWN_ITEM_ICON: Record<number, number> = {
  163: 931, 310: 1614, 1008: 5377, 1009: 5378, 1010: 5379, 1011: 5380,
  50: 282, 53: 286, 473: 3002, 515: 3112, 870: 4776, 1089: 5643,
  308: 1572, 377: 2366, 641: 3569, 643: 3571,
  663: 3818, 665: 3819, 667: 3820, 677: 3824, 678: 3825, 679: 3826,
  688: 3829, 689: 3830, 690: 3831, 691: 3832, 692: 3833, 693: 3834,
  966: 5119, 1025: 5463,
  238: 1244, 237: 1244, 244: 1256, 243: 1256,
  155: 859, 482: 3014, 24: 161, 250: 1260, 251: 1260, 721: 3989,
  739: 4242, 740: 4243, 741: 4244, 742: 4245, 743: 4246, 744: 4247,
  745: 4248, 746: 4249, 747: 4250, 748: 4251, 749: 4252, 750: 4253,
  751: 4254, 752: 4255,
  28: 166, 37: 235, 196: 1168, 516: 3115, 519: 3196, 773: 4423,
  903: 4824, 904: 4825, 905: 4826, 906: 4827, 910: 4908, 911: 4909,
  1077: 5542, 1086: 5594, 1087: 5595,
  29: 167, 470: 2896, 637: 3547,
};

/** ProjectileID.Sets.DespawnItemGivesItemBack（:21，bool[] 缺省 false）——放置类
 *  炸弹/罐超时消失时退回物品（23 项）。消费点同上（批 C/D 接线）。 */
export const PROJ_DESPAWN_ITEM_GIVES_ITEM_BACK: readonly number[] = [
  50, 53, 473, 515, 870, 1089, 28, 37, 516, 519, 773,
  903, 904, 905, 906, 910, 911, 1077, 1086, 1087, 29, 470, 637,
];

/** ProjectileID.Sets.DisplayDollDrawUseStyle（:25，int[] 缺省 -1；全表=5）——模特
 *  绘制时按 useStyle 5 摆姿势的物品（66 项）。消费点：TEDisplayDoll 绘制（批 C/D）。 */
export const PROJ_DISPLAY_DOLL_DRAW_USE_STYLE: readonly number[] = [
  301, 933, 1100, 6, 19, 33, 52, 106, 113, 182, 272, 320, 333, 383, 866, 867,
  902, 1000, 1052, 491, 273, 481, 636, 3, 21, 48, 54, 69, 70, 621, 93, 166,
  304, 318, 330, 370, 371, 497, 510, 520, 599, 861, 868, 869, 936, 996, 1085,
  507, 598, 28, 29, 37, 470, 516, 519, 637, 773, 903, 904, 905, 906, 910, 911,
  1077, 1086, 1087,
];

/** ProjectileID.Sets.FixedDamageForRockets（:191，const = 60）——火箭族自伤定值
 *  （FixedSelfDamageForPlayers 表值的来源常量；Game.ts FIXED_SELF_DAMAGE_FOR_PLAYERS
 *  已按 60/120 落地）。 */
export const PROJ_FIXED_DAMAGE_FOR_ROCKETS = 60;

// ---------------------------------------------------------------------------
// TileID.Sets（2）
// ---------------------------------------------------------------------------

/** TileID.Sets.IsAPressurePlate（:325，bool[] 缺省 false）——{135 压板/442 投掷压板
 *  /428 测重板}。消费点：Wiring/PressurePlateHelper 族（本仓 Game.checkPressurePlates
 *  硬编码 428/135/442，批 C/D 换表）。 */
export const TILE_IS_A_PRESSURE_PLATE: readonly number[] = [135, 442, 428];

/** TileID.Sets.RemoveWhenUnderSpawn（:327，bool[] 缺省 false）——出生点区域清理时
 *  移除的机关/伤害格 {135/442/428/48 尖刺/443 间歇泉}。消费点：出生点清障
 *  （批 C/D 接线）。 */
export const TILE_REMOVE_WHEN_UNDER_SPAWN: readonly number[] = [135, 442, 428, 48, 443];

// ---------------------------------------------------------------------------
// NPCID.Sets（2 中余 1；BoundTownNPCs 已落 Game.ts）
// ---------------------------------------------------------------------------

/** NPCID.Sets.SyncAnchor（:4823，Vector2[] 缺省 Zero）——网络同步锚点：
 *  50(KingSlime)→(0.5,1)（锚点从中心改为底部中心）。消费点：联机位置同步
 *  （批 C/D 接线）。 */
export const NPC_SYNC_ANCHOR: Record<number, [number, number]> = {
  50: [0.5, 1],
};
