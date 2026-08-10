// 蜂巢破坏语义（原版 WorldGen.KillTile 大 switch，1.4.5.6 WorldGen.cs）：
//   case 225 Hive Block（:65524-65545）：Next(3)==0 → 本格变满蜂蜜液体（honey:true,
//     liquid=255——打破蜂巢块"流蜜"的出处）；否则掉落 item 1124（Hive）且
//     Next(2)==0 时出蜂：Next(3)==0 → 2 只，否则 1 只（type=Next(210,212) 即 210/211），
//     初速 vx=vy=Next(-200,201)*0.002。
//   case 231 Larva（:53254-53280）：gore 碎裂无掉落；最近玩家与破坏点
//     曼哈顿距离 <4800px（300 格）→ NPC.SpawnOnPlayer(222) 蜂后。
import type { TileStore } from './TileStore';
import type { RNG } from '../core/rng';

export interface HiveBreakHooks {
  /** 掉落蜂巢物品（原版 Item.NewItem 1124） */
  dropHiveItem: (px: number, py: number) => void;
  /** 生成蜜蜂（210/211，锚点 x*16+8, y*16+15，初速 ±0.4） */
  spawnBee: (px: number, py: number, rng: RNG) => void;
}

/** 蜂巢块破坏（KillTile case 225）。返回是否变成蜂蜜（true=流蜜，无掉落） */
export function breakHiveBlock(st: TileStore, x: number, y: number, rng: RNG, hooks: HiveBreakHooks): boolean {
  st.setTile(x, y, 0);
  if (rng.next() < 1 / 3) {
    // 满格蜂蜜。setLiquid 触发 onLiquidChanged → LiquidSim 唤醒，蜜会流动
    st.setLiquid(x, y, 255, 3);
    return true;
  }
  hooks.dropHiveItem(x * 16 + 8, y * 16 + 8);
  if (rng.next() < 0.5) {
    const n = rng.next() < 1 / 3 ? 2 : 1;
    for (let k = 0; k < n; k++) hooks.spawnBee(x * 16 + 8, y * 16 + 15, rng);
  }
  return false;
}

/** 幼虫破坏距离判定（KillTile case 231）：最近玩家曼哈顿距离 <4800px 才召蜂后 */
export function larvaSummonInRange(playerX: number, playerY: number, tileX: number, tileY: number): boolean {
  return Math.abs(playerX - tileX * 16) + Math.abs(playerY - tileY * 16) < 4800;
}
