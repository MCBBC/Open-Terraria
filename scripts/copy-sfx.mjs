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
];

let n = 0;
for (const f of FILES) {
  const src = join(SRC, f + '.wav');
  if (!existsSync(src)) { console.warn('缺失:', f); continue; }
  copyFileSync(src, join(DST, f + '.wav'));
  n++;
}
console.log(`copy-sfx: ${n}/${FILES.length}`);
