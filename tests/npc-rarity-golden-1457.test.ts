// 红蓝-H① 2026-09-18【NPC_RARITY 金标闸】：表=79 条程序化直读金标（1457
// SetDefaults :8454-17890 全段，含区间 if/别名嵌套/switch 三形态）。
// 定谳：旧表 335 条自称 "SetDefaults if-chain 提取" 而无生成器痕迹——80 上下真值
// 全对、余 256 条手维护捏造（全部城镇 NPC + 26 Demon 等普通敌怪）。权威链 =
// `node tools/recon-npc-rarity-1457.mjs`（DRIFT 必须=0）；本测试钉死：整表逐型
// deep-equal + 支数 79 + 捏造代表禁入 + 被缚族/嵌套区间锚。
// 变异接缝：①表内改任一值/加一条 → deep-equal 红；②删条 → count 红；
// ③给城镇型（107/124/441…）回流 rarity → 禁入组红。
import { describe, it, expect } from 'vitest';
import { NPC_RARITY, npcRarityOf } from '../src/data/vanillaNpcs';

// 金标 = recon-npc-rarity-1457.mjs --gold 逐字直出（2026-09-18 冻结；
// 在途金标禁重冻——反编译源未变前此字面量即权威）
const GOLD: Record<number, number> = {
  44: 1, 45: 4, 52: 2, 53: 2, 66: 1, 71: 1, 73: 1, 85: 4,
  105: 1, 106: 1, 109: 1, 123: 1, 172: 4, 195: 2, 196: 2, 205: 2,
  216: 1, 217: 1, 218: 1, 219: 1, 220: 2, 221: 1, 243: 2, 244: 1, 251: 2,
  287: 1, 290: 2, 291: 1, 292: 1, 293: 1, 354: 1, 374: 4, 375: 4, 376: 1, 399: 1,
  442: 3, 443: 3, 444: 3, 445: 3, 446: 3, 447: 3, 448: 3, 453: 1,
  471: 1, 473: 5, 474: 5, 475: 5, 476: 5, 477: 1, 480: 1,
  534: 2, 536: 2, 539: 3, 541: 2, 579: 1, 583: 2, 584: 2, 585: 2, 586: 1, 587: 1, 589: 1,
  592: 3, 593: 3, 601: 3, 605: 3, 613: 3, 618: 1, 620: 1, 621: 1, 624: 1, 627: 3, 629: 4,
  661: 4, 667: 2, 685: 2, 686: 2, 687: 2, 695: 1, 696: 1,
};

describe('红蓝-H①：NPC_RARITY 79 型金标（1457 SetDefaults 直读）', () => {
  it('整表逐型 deep-equal（支数 79；变异①②任一即红）', () => {
    expect(Object.keys(NPC_RARITY).length).toBe(79);
    expect(NPC_RARITY).toEqual(GOLD);
  });

  it('被缚族+痛苦亡魂真值锚（分析仪可见域,BoundTownNPCs 全员 rarity>0）', () => {
    // NPCID.cs:4791 BoundTownNPCs{105,123,106,685,686,687,354,376,579,589} 全员
    expect(npcRarityOf(105)).toBe(1);   // :10283
    expect(npcRarityOf(106)).toBe(1);   // :10297
    expect(npcRarityOf(123)).toBe(1);   // :10534
    expect(npcRarityOf(354)).toBe(1);   // :13543
    expect(npcRarityOf(376)).toBe(1);   // :13837 沉睡渔夫
    expect(npcRarityOf(579)).toBe(1);   // :16595 昏迷酒保
    expect(npcRarityOf(589)).toBe(1);   // :16692
    expect(npcRarityOf(685)).toBe(2);   // :17653 老旧摇摇箱
    expect(npcRarityOf(686)).toBe(2);   // :17667
    expect(npcRarityOf(687)).toBe(2);   // :17680 神秘青蛙
    expect(npcRarityOf(534)).toBe(2);   // :15855 痛苦亡魂（恶魔型非 townNPC,红蓝-H③勘误锚）
  });

  it('捏造代表禁入：城镇 NPC/普通敌怪 rarity=0（原版"分析仪不显"同相）', () => {
    for (const id of [
      107, 108, 124, 353, 550, 588, 369, 441,  // 获救态城镇型（rarity 只在被缚型上）
      368, 637, 656, 663,                      // 旅行商人/城镇宠/公主
      678, 679, 680, 681, 682, 683, 684,       // 城镇史莱姆本体型（685-687 才是绑缚态）
      26, 27, 28, 29, 30, 46, 47, 50, 551,     // Demon 等普通敌怪+DD2 水晶车（:16039 条件块只改 defense/lifeMax）
      454, 455, 456, 457, 458, 459, 464, 465, 470, // 旧表捏造的 rarity=5 段
    ]) {
      expect(npcRarityOf(id)).toBe(0);
    }
  });

  it('区间 if 块嵌套归型：只命中嵌套判别子,不外溢整个区间', () => {
    // :16748 `type >= 595 && type <= 601` 内 `if (num2 == 601) rarity = 3` → 仅 601
    expect(npcRarityOf(601)).toBe(3);
    for (const id of [595, 596, 597, 598, 599, 600]) expect(npcRarityOf(id)).toBe(0);
    expect(npcRarityOf(605)).toBe(3);   // :16807 num2==605（604 不显）
    expect(npcRarityOf(604)).toBe(0);
    expect(npcRarityOf(613)).toBe(3);   // :16904 num2==613
    expect(npcRarityOf(612)).toBe(0);
    expect(npcRarityOf(627)).toBe(3);   // :17096 num2==627
    expect(npcRarityOf(626)).toBe(0);
  });

  it('多型联言/独立型锚 + 查询缺省域', () => {
    expect(npcRarityOf(583)).toBe(2);   // :16634 `583||584||585` 联言整组
    expect(npcRarityOf(584)).toBe(2);
    expect(npcRarityOf(585)).toBe(2);
    expect(npcRarityOf(473)).toBe(5);   // :14548 `473||474||475||476`
    expect(npcRarityOf(476)).toBe(5);
    expect(npcRarityOf(null)).toBe(0);  // 未登记/空缺省 0
    expect(npcRarityOf(9999)).toBe(0);
  });
});
