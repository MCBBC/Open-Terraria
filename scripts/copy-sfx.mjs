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
for (const f of [...FILES, ...CUSTOM]) {
  const src = join(SRC, f + '.wav');
  if (!existsSync(src)) { console.warn('缺失:', f); continue; }
  copyFileSync(src, join(DST, f.replace('Custom/', '') + '.wav'));
  n++;
}
console.log(`copy-sfx: ${n}/${FILES.length + CUSTOM.length}`);
