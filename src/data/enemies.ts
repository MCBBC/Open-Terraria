// 敌人 / NPC 数据定义
export interface EnemyDef {
  key: string;
  name: string;
  hp: number;
  damage: number;        // 接触伤害
  knockbackResist: number; // 0-1（越高越抗击退）
  width: number; height: number; // px
  flying?: boolean;
  boss?: boolean;
  nightOnly?: boolean;
  dayOnly?: boolean;
  underground?: boolean; // 倾向地下生成
  xp?: number;
  fireImmune?: boolean;
  hellOnly?: boolean;
  mapColor: string;
  gore: [string, string, string];  // 死亡碎裂粒子配色（主色/深色/亮色）
  drops: Array<{ item: string; min: number; max: number; chance: number }>;
}

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  slime_green: {
    key: 'slime_green', name: '绿史莱姆', hp: 35, damage: 6, knockbackResist: 0,
    width: 20, height: 14, dayOnly: true, mapColor: '#5FD35F',
    gore: ['#5FD35F', '#3E9E3E', '#8FEF8F'],
    drops: [{ item: 'gel', min: 1, max: 2, chance: 1 }],
  },
  slime_blue: {
    key: 'slime_blue', name: '蓝史莱姆', hp: 55, damage: 9, knockbackResist: 0,
    width: 22, height: 16, mapColor: '#4FA8E0',
    gore: ['#4FA8E0', '#2F78B0', '#8FCFF0'],
    drops: [{ item: 'gel', min: 1, max: 2, chance: 1 }],
  },
  zombie: {
    key: 'zombie', name: '僵尸', hp: 90, damage: 14, knockbackResist: 0.3,
    width: 16, height: 30, nightOnly: true, mapColor: '#6E8B5E',
    gore: ['#6E8B5E', '#4A5E3E', '#9E7860'],
    drops: [
      { item: 'coin_copper', min: 3, max: 12, chance: 0.8 },
      { item: 'iron_ore', min: 1, max: 2, chance: 0.15 },
      { item: 'lesser_healing_potion', min: 1, max: 1, chance: 0.04 },
    ],
  },
  demon_eye: {
    key: 'demon_eye', name: '恶魔眼', hp: 80, damage: 12, knockbackResist: 0.1,
    width: 26, height: 22, flying: true, nightOnly: true, mapColor: '#D0D0D0',
    gore: ['#D0D0D0', '#909098', '#E85050'],
    drops: [
      { item: 'lens', min: 1, max: 1, chance: 0.33 },
      { item: 'coin_copper', min: 2, max: 8, chance: 0.7 },
    ],
  },
  cave_bat: {
    key: 'cave_bat', name: '洞穴蝙蝠', hp: 30, damage: 10, knockbackResist: 0,
    width: 18, height: 14, flying: true, underground: true, mapColor: '#7A5A8C',
    gore: ['#7A5A8C', '#5A3A6C', '#A58AB5'],
    drops: [{ item: 'coin_copper', min: 1, max: 4, chance: 0.5 }],
  },
  lava_slime: {
    key: 'lava_slime', name: '熔岩史莱姆', hp: 60, damage: 14, knockbackResist: 0,
    width: 24, height: 18, fireImmune: true, hellOnly: true, mapColor: '#E8622C',
    gore: ['#E8622C', '#B03A2E', '#FFA050'],
    drops: [{ item: 'gel', min: 1, max: 3, chance: 1 }, { item: 'torch', min: 1, max: 2, chance: 0.4 }],
  },
  magma_zombie: {
    key: 'magma_zombie', name: '熔岩僵尸', hp: 140, damage: 20, knockbackResist: 0.5,
    width: 16, height: 30, fireImmune: true, hellOnly: true, mapColor: '#B03A2E',
    gore: ['#B03A2E', '#702020', '#E07050'],
    drops: [{ item: 'iron_ore', min: 1, max: 2, chance: 0.3 }, { item: 'coin_copper', min: 5, max: 15, chance: 0.8 }],
  },
  eye_of_cthulhu: {
    key: 'eye_of_cthulhu', name: '克苏鲁之眼', hp: 1400, damage: 15, knockbackResist: 1,
    width: 110, height: 110, flying: true, boss: true, mapColor: '#C02020',
    gore: ['#C02020', '#801010', '#FF5050'],
    drops: [
      { item: 'lesser_healing_potion', min: 2, max: 4, chance: 1 },
      { item: 'coin_copper', min: 80, max: 150, chance: 1 },
    ],
  },
  servant_of_cthulhu: {
    key: 'servant_of_cthulhu', name: '克苏鲁之仆', hp: 8, damage: 10, knockbackResist: 0.8,
    width: 16, height: 16, flying: true, mapColor: '#A03030',
    gore: ['#A03030', '#701818', '#D06060'],
    drops: [{ item: 'lens', min: 1, max: 1, chance: 0.25 }],
  },
};
