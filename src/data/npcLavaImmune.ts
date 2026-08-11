// 原版 NPC lavaImmune 全表（Terarria1456/NPC.cs SetDefaults `else if (type == N)` 链中
// `lavaImmune = true` 的全部 NPC id，tools 提取脚本一次性扫描）。岩浆接触伤害门禁
// （NPC.cs:94526 `!lavaImmune`）与原版一致：表内怪入浆不掉血不上火。
export const NPC_LAVA_IMMUNE = new Set<number>([
  24, 59, 60, 62, 66, 151, 156, 378, 438, 534, 548, 549, 552, 553, 554,
  561, 562, 563, 555, 556, 557, 558, 559, 560, 576, 577, 568, 569, 566,
  567, 572, 573, 570, 571, 564, 565, 574, 575, 551, 578, 620, 653, 654,
  655, 657, 661, 662, 690,
]);
