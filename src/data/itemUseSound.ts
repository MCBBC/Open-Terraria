// Item.cs SetDefaults 显式 UseSound 提取（582 件；tools 侧 python 一次性提取，
// 键=物品 id，值=SoundID 名）。Item_N 形可直接映射 public/sounds wav；
// 命名轨（DD2_MonkStaffSwing 等 Trackable）需变体号解析，暂不消费（备案）。
import sndJson from './vanilla-itemusesound.json';

const TABLE = sndJson as unknown as Record<string, string>;

/** 物品 → UseSound wav 文件名（'Item_92' 形）；无显式赋值/命名轨返回 null */
export function itemUseSoundWav(vid: number): string | null {
  const s = vid > 0 ? TABLE[String(vid)] : undefined;
  return s && /^Item_\d+$/.test(s) ? s : null;
}
