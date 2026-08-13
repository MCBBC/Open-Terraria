// 拷贝原版音效白名单到 public/sounds/（可重复执行，幂等）
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..', 'terraria-assets', 'Sounds');
const DST = join(here, '..', 'public', 'sounds');
mkdirSync(DST, { recursive: true });

// 文件名 = 原版文件名（去 .wav 后缀作 key）
const FILES = [
  // 玩家
  'Player_Hit_0', 'Player_Hit_1', 'Player_Hit_2', 'Player_Killed',
  // 怪物受击/死亡（更多槽位：不同怪物家族用不同声效）
  'NPC_Hit_1', 'NPC_Hit_2', 'NPC_Hit_3', 'NPC_Hit_4', 'NPC_Hit_5',
  'NPC_Hit_6', 'NPC_Hit_7', 'NPC_Hit_8', 'NPC_Hit_9', 'NPC_Hit_10',
  'NPC_Killed_1', 'NPC_Killed_2', 'NPC_Killed_3',
  'NPC_Killed_4', 'NPC_Killed_5', 'NPC_Killed_6', 'NPC_Killed_7', 'NPC_Killed_8',
  // 僵尸环境声
  'Zombie_1', 'Zombie_2', 'Zombie_3', 'Zombie_4', 'Zombie_5', 'Zombie_6',
  // 挖掘/砍击/拾取/放置
  'Dig_0', 'Dig_1', 'Dig_2', 'Tink_0', 'Tink_1', 'Grass', 'Grab', 'Shatter',
  // 钱
  'Coin_0', 'Coin_1', 'Coins',
  // 门/水/Boss
  'Door_Closed', 'Door_Opened', 'Splash_0', 'Splash_1', 'Drip_0', 'Drown',
  'Roar_0', 'Roar_1',
  // 落水全变体（原版 SoundID 19 Splash，style 0-5；微光配对走 style 4 = Splash_4）
  'Splash_2', 'Splash_3', 'Splash_4', 'Splash_5',
  // 枪族 UseSound（Item.cs：Item36 霰弹枪族 534/964/3788/4703；Item41 手枪族
  // 164/219/1255/1929/2269/2270；Item11 为其余枪械通用——Item_11 此前已在库内）
  'Item_36', 'Item_41',
  // 邪教徒仪式圈 490（Projectile.cs:31221 SoundID.Item123）
  'Item_123',
  // 塔灭碎裂双音之一（NPC.cs:41118-41121 SoundID 22 = Unlock；另一为 NPC_Killed_1 已在库）
  'Unlock',
  // 蜂后专属吼（NPC.cs:30488 PlaySound(29,…,125)——"Zombie"族实为逐 NPC 语音槽位）
  'Zombie_125',
  // 雕像宝箱怪三轨（SoundID.cs:1105/1107/1109 Sounds/Custom/statuemimic_*）
  // 蜘蛛女王反射（NPC.ReflectProjectile SoundID.Item150）+ 恐惧鹦鹉螺
  // （AI_117 :47619 Item170 招式衔接 / :47666 Item172 冲刺起手 / 弹 814 出生
  //  Item171 :53562）——2026-08-13 补入
  'Item_150', 'Item_170', 'Item_171', 'Item_172',
  // 喵刀弹 502 命中喵叫（SoundID 37 Meowmere = LegacySoundPlayer :1329 的
  // SoundItem[57..58]，音量 ×0.5×style×0.05 音高扰动 ±0.4）
  'Item_57', 'Item_58',
  // ---- 全量 UseSound 素材（Item.cs SetDefaults 提取 582 件的 74 个不同 Item_N；
  // vanilla-itemusesound.json 数据驱动播放，2026-08-13）----
  ...[
    'Item_2', 'Item_4', 'Item_7', 'Item_13', 'Item_15', 'Item_16', 'Item_21', 'Item_23',
    'Item_25', 'Item_29', 'Item_31', 'Item_32', 'Item_34', 'Item_38', 'Item_39', 'Item_40',
    'Item_43', 'Item_59', 'Item_61', 'Item_63', 'Item_66', 'Item_67', 'Item_69', 'Item_71',
    'Item_72', 'Item_73', 'Item_76', 'Item_78', 'Item_82', 'Item_83', 'Item_88', 'Item_92',
    'Item_98', 'Item_99', 'Item_100', 'Item_102', 'Item_103', 'Item_105', 'Item_106',
    'Item_108', 'Item_109', 'Item_111', 'Item_113', 'Item_117', 'Item_128', 'Item_130',
    'Item_151', 'Item_156', 'Item_157', 'Item_158', 'Item_174', 'Item_181', 'Item_183',
    'Item_184', 'Item_185', 'Item_186', 'Item_187', 'Item_188', 'Item_196',
  ],
];

// ---- Sounds/Custom/ 追加（展平名进 CUSTOM2，防与上方 FILES 混淆） ----
const CUSTOM_FILES = [
  'Custom/statuemimic_scare',
  'Custom/statuemimic_jump',
  'Custom/statuemimic_laugh_0',
  'Custom/statuemimic_laugh_1',
  'Custom/statuemimic_laugh_2',
];

// 原版 Sounds/Custom/ 子目录（XACT Trackable 族：液体六配对专属轨，各 3 变体；
// SoundID.cs:823-827 LiquidsHoneyWater/HoneyLava/WaterLava = CreateTrackable(…,3,Ambient)）
// 落位展平到 public/sounds/ 根（fetch 以 sounds/<name>.wav 直取，无子目录）
const CUSTOM = [
  'Custom/liquids_water_lava_0', 'Custom/liquids_water_lava_1', 'Custom/liquids_water_lava_2',
  'Custom/liquids_honey_water_0', 'Custom/liquids_honey_water_1', 'Custom/liquids_honey_water_2',
  'Custom/liquids_honey_lava_0', 'Custom/liquids_honey_lava_1', 'Custom/liquids_honey_lava_2',
];

let n = 0;
for (const f of [...FILES, ...CUSTOM, ...CUSTOM_FILES]) {
  const src = join(SRC, f + '.wav');
  if (!existsSync(src)) { console.warn('缺失:', f); continue; }
  copyFileSync(src, join(DST, f.replace('Custom/', '') + '.wav'));
  n++;
}
console.log(`copy-sfx: ${n}/${FILES.length + CUSTOM.length + CUSTOM_FILES.length}`);
