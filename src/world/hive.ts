// 蜂巢破坏语义（原版 WorldGen.KillTile 大 switch，1.4.5.7 WorldGen.cs；1458 :65993 同文零变更）：
//   case 225 Hive Block（:65985-66009；旧注 65524-65545 系 1456 行号）：Next(3)==0 →
//     本格变满蜂蜜液体（honey:true, liquid=255——打破蜂巢块"流蜜"的出处）；否则掉落
//     item 1124（ItemID.Hive，ItemID.cs:3794=蜂巢块放置物）且 Next(2)==0 时出蜂：
//     Next(3)==0 → 2 只，否则 1 只（type=Next(210,212) 即 210/211），初速
//     vx=vy=Next(-200,201)*0.002（离散 401 档 ±0.4），锚点 NewNPC(x*16+8, y*16+15)
//     → Bottom=(X,Y)（NPC.cs:81594）。★case 225 全文在 KillTile_GetItemDrops 内
//     （:64477）→ 受 KillTile 掉落段 noItem 门（:64373）管籍。
//   case 231 Larva（gore/蜂后召在 TileFrame 派发的 Check3x3 :53520-53720）：碎裂无
//     掉落；最近玩家与破坏点曼哈顿距离 <4800px（300 格）→ NPC.SpawnOnPlayer(222) 蜂后。
// 分道（BJ113 域外债 2026-09-17 定谳）：tile-break 臂=本文件 breakHiveBlock（蜜/物/蜂
//   0-2 只）；手雷臂=655 蜂巢弹 Kill（Projectile.cs:76611-76660）——干巢裂 2+Next(3)³
//   =2-5 只蜂 @弹心 Bottom、入水落 1124×Next(2,6)，两臂原版即分道语义，禁混接。
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

/** 蜂实体落位/初速（原版 NewNPC(X,Y) → Bottom=(X,Y)，NPC.cs:81594；BJ111 判例）：
 *  实体顶=py−h（盒底边=py，蜂盒与格底对齐）；初速=Next(-200,201)×0.002——离散 401 档
 *  ±0.4（WorldGen.cs:66004-66005 tile 臂 / Projectile.cs:76650-76651 弹臂同式）。
 *  tile-break 臂（py=y*16+15，WorldGen.cs:66003）与 655 弹臂（py=弹心）共用本式。
 *  r 只要求 { next(): [0,1) }——RNG 或 Math.random 适配器皆可。 */
export function anchorBeeBottom(
  e: { y: number; h: number; vx: number; vy: number },
  py: number,
  r: { next(): number },
): void {
  e.y = py - e.h;
  e.vx = (Math.floor(r.next() * 401) - 200) * 0.002;
  e.vy = (Math.floor(r.next() * 401) - 200) * 0.002;
}

/** 幼虫破坏距离判定（KillTile case 231）：最近玩家曼哈顿距离 <4800px 才召蜂后 */
export function larvaSummonInRange(playerX: number, playerY: number, tileX: number, tileY: number): boolean {
  return Math.abs(playerX - tileX * 16) + Math.abs(playerY - tileY * 16) < 4800;
}
