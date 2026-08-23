// Item.cs SetDefaults 显式 UseSound 提取（968 件；tools/extract-itemcombat.mjs
// 三通道全量再生成，2026-08-17——含嵌套 switch case/区间 if 块/SetFoodDefaults 食物族/
// DefaultTo* 辅助函数族/委托继承；键=物品 id，值=SoundID 名）。Item_N 形可直接映射
// public/sounds wav；命名轨（DD2_MonkStaffSwing 等 Trackable）2026-08-13 起经
// vanillaSoundFiles 解析为变体组 wav（SoundEngine 播放时组内随机取一）。
import sndJson from './vanilla-itemusesound.json';
import { soundTrackName } from './vanillaNpcs';
import soundTracksJson from './vanilla-soundtracks.json';

const TABLE = sndJson as unknown as Record<string, string>;
const SOUND_TRACKS = soundTracksJson as unknown as Record<string, string[]>;

/** 1457 新武器 UseSound 补遗（R4-36：vanilla-itemusesound.json 为 1456 基准,6140-6200
 *  零命中——别名表死键的根因是 TABLE 缺键时 `if (!s) return null` 先行短路）。
 *  Item.cs:47385-47564 逐件核对：6152=Item8(:47421)/6153=GlacierFang_Charging(:47432)/
 *  6154=MysticBloom(:47443)/6155=Item43（DefaultToStaff :48016-48023）/:47421 附近
 *  6161=Item82/6164=Item113/6173=Item15(:47562)。6150/6151=PalSummon 不入此表——
 *  Game.ts:2780 帕鲁坐骑专用轨（pal_summon 0.15）已覆盖。提取器 1457 化后可退役 */
const TABLE_1457: Record<string, string> = {
  6152: 'Item_8',
  6153: 'GlacierFang_Charging',
  6154: 'MysticBloom',
  6155: 'Item_43',
  6161: 'Item_82',
  6164: 'Item_113',
  6173: 'Item_15',
};

/** WithVolumePerceived 感知音量（R4-41,LegacySoundStyle.cs:69-74 `Pow(volume,1.6609f)`,
 *  1456 该函数零使用;1457 SoundID.cs 三处）：键=物品 vid（UseSound 路径）——
 *  6154 MysticBloom 0.65→0.489（SoundID.cs:816）。style 侧两枚（ArcSurge 0.4→0.218
 *  :822 / Item113_Quiet 2/3→0.510 :642）为弹幕/专用通道,消费点接线时按 style 查 */
export function itemUseSoundPerceivedVol(vid: number): number | null {
  if (vid === 6154) return 0.489;
  return null;
}

/** LegacySoundStyle 别名常量（SoundID.cs:971/973/:1075）→ wav（Betsy 之 wrath 0.4 音量档
 *  与原型同源，LeafBlower=Item_34）。1457 新增两件（SoundID.cs:816/:836，非 CreateTrackable
 *  命名轨 → soundTrackName 解析不到，按 LeafBlower 先例映射直连轨） */
const USE_SOUND_ALIASES: Record<string, string[]> = {
  DD2_BetsysWrathShot: ['dd2_betsy_fireball_shot_0', 'dd2_betsy_fireball_shot_1', 'dd2_betsy_fireball_shot_2'],
  DD2_BetsysWrathImpact: ['dd2_betsy_fireball_impact_0', 'dd2_betsy_fireball_impact_1', 'dd2_betsy_fireball_impact_2'],
  LeafBlower: ['Item_34'],
  GlacierFang_Charging: ['Item_210'],   // LegacySoundStyle(2,210)（6153 冰川之牙）
  MysticBloom: ['Item_60'],             // LegacySoundStyle(2,60).WithVolumePerceived(0.65)（6154 花瓣风暴）
};

/** 物品 → UseSound wav 文件名；无显式赋值/无法解析返回 null。
 *  多变体声轨调用时随机取一（原版 SoundStyle.PlayVariations 语义）。 */
export function itemUseSoundWav(vid: number): string | null {
  const s = TABLE_1457[String(vid)] ?? (vid > 0 ? TABLE[String(vid)] : undefined);
  if (!s) return null;
  if (/^Item_\d+$/.test(s)) return s;
  if (USE_SOUND_ALIASES[s]) {
    const list = USE_SOUND_ALIASES[s];
    return list[Math.floor(Math.random() * list.length)];
  }
  const track = soundTrackName(s);
  const files = track ? SOUND_TRACKS[track] : null;
  if (!files || !files.length) return null;
  return files[Math.floor(Math.random() * files.length)];
}
