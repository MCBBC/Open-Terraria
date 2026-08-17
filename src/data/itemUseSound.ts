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

/** LegacySoundStyle 别名常量（SoundID.cs:971/973/:1075）→ wav（Betsy 之 wrath 0.4 音量档
 *  与原型同源，LeafBlower=Item_34） */
const USE_SOUND_ALIASES: Record<string, string[]> = {
  DD2_BetsysWrathShot: ['dd2_betsy_fireball_shot_0', 'dd2_betsy_fireball_shot_1', 'dd2_betsy_fireball_shot_2'],
  DD2_BetsysWrathImpact: ['dd2_betsy_fireball_impact_0', 'dd2_betsy_fireball_impact_1', 'dd2_betsy_fireball_impact_2'],
  LeafBlower: ['Item_34'],
};

/** 物品 → UseSound wav 文件名；无显式赋值/无法解析返回 null。
 *  多变体声轨调用时随机取一（原版 SoundStyle.PlayVariations 语义）。 */
export function itemUseSoundWav(vid: number): string | null {
  const s = vid > 0 ? TABLE[String(vid)] : undefined;
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
