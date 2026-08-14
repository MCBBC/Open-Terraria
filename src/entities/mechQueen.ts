// Mechdusa（机械美杜莎）合体登记处——NPC.mechQueen / IsMechQueenUp / GetMechQueenCenter
// 的本仓等价（单例静态语义,NPC.cs:6502/:6784-6798/:51348-51355）。
//
// 原版机制（1.4.5.6）：
//  - NPC.SpawnMechQueen(:19724-19751) 召唤时 mechQueen=-2 哨兵 → SpawnOnPlayer(127)
//    → SpawnBoss(:81469-81473) 命中 127 且 mechQueen!=-1 专属分支：NewNPC Start=100
//    且 `npc.ai[3] = mechQueen`(=自身 whoAmI,非零标记) → AI_032 头部(:27741-27743)
//    `if (ai[3] != 0f) mechQueen = whoAmI;` 每 tick 重登记（抗存档/断链）。
//  - IsMechQueenUp(:6784-6798)：索引有效且 active && type==127 才真；否则 mechQueen=-1
//    复位返回假（惰性失效——queen 死后下一次查询即回落常规 AI）。
//  - WorldGen.clearWorld(:6907) 清 mechQueen=-1（本仓 = afterWorldLoad 复位）。
//
// 本仓偏差登记：
//  - 原版登记通道是 ai[3]!=0（SpawnBoss 写入 whoAmI）。本仓 skeletronPrimeAI 长期把
//    ai3 当"旋冲方向缓存"（±1,原版用 NPC.direction 持久朝向字段——Enemy 无此字段的
//    既有近似）。若照抄 ai3!=0 判定,常规机械骷髅王进冲撞段即被误登记成 queen。
//    → 改用 WeakSet 标记等价 ai[3]!=0：召唤端 markMechQueen(queen)（对应 SpawnBoss
//    写 ai[3]）,skeletronPrimeAI 见标记即重登记（对应 AI_032 每 tick 重写）。
//  - 原版用 Main.npc[] 槽位索引校验 active/type；本仓直接持 Enemy 引用 + !dead +
//    vanillaId==127 三重校验,语义等价（Enemy.dead ⇄ !active）。
import type { Enemy } from './Enemy';

/** NPC.mechQueen = -1 ↔ null */
let mechQueen: Enemy | null = null;
/** queen 专属标记（原版 ai[3] = whoAmI 非零哨兵的等价物,见头注偏差登记） */
const mechQueenMarks = new WeakSet<Enemy>();

/** SpawnBoss :81472 `Main.npc[mechQueen].ai[3] = mechQueen`——召唤端落非零标记 */
export function markMechQueen(e: Enemy): void {
  mechQueenMarks.add(e);
}

/** AI_032 :27741-27743 `if (ai[3] != 0f) mechQueen = whoAmI`——每 tick 重登记 */
export function registerMechQueen(e: Enemy): void {
  if (!mechQueenMarks.has(e)) return;
  mechQueen = e;
}

/** WorldGen.clearWorld :6907 `NPC.mechQueen = -1`——进世界/清场复位 */
export function resetMechQueen(): void {
  mechQueen = null;
}

/** NPC.IsMechQueenUp（NPC.cs:6784-6798）：queen 活着且 type==127 → 真；
 *  失效即复位（惰性,原版 getter 同款副作用） */
export function mechQueenUp(): boolean {
  if (mechQueen && !mechQueen.dead && mechQueen.vanillaId === 127) return true;
  mechQueen = null;
  return false;
}

/** 取存活的 queen 引用（IsMechQueenUp 真时；否则 null 并复位） */
export function getMechQueen(): Enemy | null {
  return mechQueenUp() ? mechQueen : null;
}

/** NPC.GetMechQueenCenter（NPC.cs:51348-51355）：queen 自身中心 + (0,-14)。
 *  原版是实例方法且恒在 queen（127）上调用；非 queen/失效时退回自身中心 */
export function getMechQueenCenter(e: Enemy): { x: number; y: number } {
  if (mechQueenUp() && e.vanillaId === 127) return { x: e.cx, y: e.cy - 14 };
  return { x: e.cx, y: e.cy };
}

/** 场上是否已有任一机械 Boss（NPC.SpawnMechQueen :19725-19728 门 = AnyNPCs
 *  127/134/125/126；duck-typing 探 dead/vanillaId——避免运行时 import Enemy 成环） */
export function anyMechBossUp(enemies: unknown[]): boolean {
  for (const o of enemies) {
    const e = o as Enemy;
    if (!e.dead && e.vanillaId != null
      && (e.vanillaId === 127 || e.vanillaId === 134 || e.vanillaId === 125 || e.vanillaId === 126)) {
      return true;
    }
  }
  return false;
}
