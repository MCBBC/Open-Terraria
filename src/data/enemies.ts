// 敌人 / NPC 数据定义
// （VI 导入为并发 WIP 的兜底：drops 字面量已切换为 VI(vid) 查表，缺导入会令全测试套
//  在 import 期即 ReferenceError——若与你的分支重复请保留其一即可）
import { VI } from './itemKeys';
export interface EnemyDef {
  key: string;
  name: string;
  hp: number;
  damage: number;        // 接触伤害
  defense?: number;      // 防御（原版 NPC.cs SetDefaults；受伤 = max(1, dmg - def*0.5)）
  knockbackResist: number; // 0-1（越高越抗击退）
  width: number; height: number; // px
  flying?: boolean;
  boss?: boolean;
  /** 原版 NPC.friendly（SetDefaults 提取旗）：城镇系/被缚救援族/睡渔夫 376 等真值。
   *  fromVanilla 写入；玩家伤害门（playerCanHitEnemy，原版 Damage_PVE_Inner :11892
   *  flag 门 / ApplyItemToNPC :43605）与索敌 CanBeChasedBy 消费。此前 fromVanilla
   *  的 def 展开漏写本字段（注释宣称有、实际恒 undefined——friendly 门全部穿透，
   *  2026-08-19 渔夫可被打掉血根因） */
  friendly?: boolean;
  /** 原版 NPCID.Sets.CountsAsCritter（提取表 critter 旗）——同上由 fromVanilla 写入 */
  critter?: boolean;
  nightOnly?: boolean;
  dayOnly?: boolean;
  underground?: boolean; // 倾向地下生成
  xp?: number;
  /** NPC.value（铜币）。fromVanilla 写入 ScaleStats 后的缩放值
   *  （NPC.cs:18110 EnemyMoneyDropMultiplier.Sample(difficulty)：专家/大师 ×2.5）；
   *  击杀掉钱消费（Enemy 掉落 ctx.value）。经典档 = npcValueOf 原值 */
  value?: number;
  fireImmune?: boolean;
  hellOnly?: boolean;
  avoidWater?: boolean;   // 飞行避水行为（前方液体上抛脱离）
  mapColor: string;
  gore: [string, string, string];  // 死亡碎裂粒子配色（主色/深色/亮色）
  // 专属受击/死亡音效（原版 NPC_Hit/Killed 槽位；家族区分，具体槽位为近似分配）
  hitSound: string[];
  killedSound: string[];
  drops: Array<{ item: string; min: number; max: number; chance: number }>;
}

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  slime_green: {
    key: 'slime_green', name: '绿史莱姆', hp: 14, damage: 6, defense: 0, knockbackResist: 1.2,
    width: 20, height: 14, dayOnly: true, mapColor: '#5FD35F',
    gore: ['#5FD35F', '#3E9E3E', '#8FEF8F'],
    hitSound: ['NPC_Hit_1', 'NPC_Hit_2'], killedSound: ['NPC_Killed_1'],
    drops: [{ item: VI(23), min: 1, max: 2, chance: 1 }],
  },
  slime_blue: {
    key: 'slime_blue', name: '蓝史莱姆', hp: 25, damage: 7, defense: 2, knockbackResist: 1.0,
    width: 22, height: 16, mapColor: '#4FA8E0',
    gore: ['#4FA8E0', '#2F78B0', '#8FCFF0'],
    hitSound: ['NPC_Hit_1', 'NPC_Hit_2'], killedSound: ['NPC_Killed_1'],
    drops: [{ item: VI(23), min: 1, max: 2, chance: 1 }],
  },
  zombie: {
    key: 'zombie', name: '僵尸', hp: 45, damage: 14, defense: 6, knockbackResist: 0.5,
    width: 16, height: 30, nightOnly: true, mapColor: '#6E8B5E',
    gore: ['#6E8B5E', '#4A5E3E', '#9E7860'],
    hitSound: ['NPC_Hit_3', 'NPC_Hit_4'], killedSound: ['NPC_Killed_2', 'NPC_Killed_3'],
    drops: [
      { item: VI(71), min: 40, max: 80, chance: 1 },
      { item: VI(11), min: 1, max: 2, chance: 0.15 },
      { item: VI(28), min: 1, max: 1, chance: 0.04 },
    ],
  },
  demon_eye: {
    key: 'demon_eye', name: '恶魔眼', hp: 60, damage: 18, defense: 2, knockbackResist: 0.8,
    width: 26, height: 22, flying: true, nightOnly: true, avoidWater: true, mapColor: '#D0D0D0',
    gore: ['#D0D0D0', '#909098', '#E85050'],
    hitSound: ['NPC_Hit_7', 'NPC_Hit_8'], killedSound: ['NPC_Killed_6'],
    drops: [
      { item: VI(38), min: 1, max: 1, chance: 0.33 },
      { item: VI(71), min: 50, max: 100, chance: 1 },
    ],
  },
  cave_bat: {
    key: 'cave_bat', name: '洞穴蝙蝠', hp: 16, damage: 13, defense: 2, knockbackResist: 0.8,
    width: 18, height: 14, flying: true, underground: true, avoidWater: true, mapColor: '#7A5A8C',
    gore: ['#7A5A8C', '#5A3A6C', '#A58AB5'],
    hitSound: ['NPC_Hit_9'], killedSound: ['NPC_Killed_4'],
    drops: [{ item: VI(71), min: 1, max: 4, chance: 0.5 }],
  },
  lava_slime: {
    key: 'lava_slime', name: '熔岩史莱姆', hp: 50, damage: 15, defense: 10, knockbackResist: 1.0,
    width: 24, height: 18, fireImmune: true, hellOnly: true, mapColor: '#E8622C',
    gore: ['#E8622C', '#B03A2E', '#FFA050'],
    hitSound: ['NPC_Hit_1', 'NPC_Hit_2'], killedSound: ['NPC_Killed_1'],
    drops: [{ item: VI(23), min: 1, max: 3, chance: 1 }, { item: VI(8), min: 1, max: 2, chance: 0.4 }],
  },
  magma_zombie: {
    key: 'magma_zombie', name: '熔岩僵尸', hp: 140, damage: 20, knockbackResist: 0.5,
    width: 16, height: 30, fireImmune: true, hellOnly: true, mapColor: '#B03A2E',
    gore: ['#B03A2E', '#702020', '#E07050'],
    hitSound: ['NPC_Hit_5', 'NPC_Hit_6'], killedSound: ['NPC_Killed_4', 'NPC_Killed_5'],
    drops: [{ item: VI(11), min: 1, max: 2, chance: 0.3 }, { item: VI(71), min: 5, max: 15, chance: 0.8 }],
  },
  eye_of_cthulhu: {
    key: 'eye_of_cthulhu', name: '克苏鲁之眼', hp: 2800, damage: 15, defense: 12, knockbackResist: 0,
    width: 100, height: 110, flying: true, boss: true, mapColor: '#C02020',
    gore: ['#C02020', '#801010', '#FF5050'],
    hitSound: ['NPC_Hit_7', 'NPC_Hit_8'], killedSound: [],
    drops: [
      { item: VI(28), min: 2, max: 4, chance: 1 },
      { item: VI(73), min: 3, max: 3, chance: 1 },
    ],
  },
  servant_of_cthulhu: {
    key: 'servant_of_cthulhu', name: '克苏鲁之仆', hp: 8, damage: 12, defense: 0, knockbackResist: 1.0,
    width: 16, height: 16, flying: true, mapColor: '#A03030',
    gore: ['#A03030', '#701818', '#D06060'],
    hitSound: ['NPC_Hit_10'], killedSound: ['NPC_Killed_8'],
    drops: [{ item: VI(38), min: 1, max: 1, chance: 0.25 }],
  },

  // ---- 阶段 6 第九轮:Boss(官方数值 NPC.cs SetDefaults:EoW头 L3341=150/22/2/38×38;
  //      克脑 L7138=1000/30/14/kb0.5,一阶段免疫伤害;史莱姆王 L3874=2000/40/10/98×92) ----
  eater_of_worlds_head: {
    key: 'eater_of_worlds_head', name: '世界吞噬者(头)', hp: 150, damage: 22, defense: 2, knockbackResist: 0,
    width: 38, height: 38, flying: false, boss: true, underground: true, mapColor: '#604080',
    gore: ['#604080', '#402060', '#301040'], hitSound: ['NPC_Hit_1'], killedSound: [],
    drops: [{ item: VI(56), min: 8, max: 24, chance: 1 }],
  },
  brain_of_cthulhu: {
    key: 'brain_of_cthulhu', name: '克苏鲁之脑', hp: 1000, damage: 30, defense: 14, knockbackResist: 0.5,
    width: 80, height: 60, flying: true, boss: true, underground: true, mapColor: '#A03050',
    gore: ['#A03050', '#701030', '#501020'], hitSound: ['NPC_Hit_6'], killedSound: [],
    drops: [{ item: VI(880), min: 8, max: 24, chance: 1 }],
  },
  king_slime: {
    key: 'king_slime', name: '史莱姆王', hp: 2000, damage: 40, defense: 10, knockbackResist: 0,
    width: 98, height: 92, flying: false, boss: true, mapColor: '#3080FF',
    gore: ['#3080FF', '#2060C0', '#104080'], hitSound: ['NPC_Hit_3'], killedSound: [],
    drops: [{ item: VI(73), min: 1, max: 1, chance: 1 }],
  },
};

