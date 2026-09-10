// 宝藏袋开包引擎（Player.OpenBossBag,1457 终值 :7206-7901;1456 旧注 :6828-7520,
// ★SW-FX21 2026-09-10 锚正 1457 行号）。BossBag 路由全集 21 件=ItemID.cs:1215;
// 袋体 19 件 + 3861/3862 主战利品 case 整缺（原版本相,详见 BOSS_BAG_IDS 注）。
// 数据 = tools/extract-bossbags.mjs 结构化提取（提取期归一条件,随机全部留给引擎期掷）。
// 引擎执行:逐 spawn 求值 conds(chance/master/noExtra/noItem/switch 选支),
// 支持 idFrom 范围/dedupPair/maskIds/pick2/stackExpr 表达式 +
// 共享尾段（按 boss value 附赠钱币,贪心拆面额）。
import bagsJson from './vanilla-bossbags.json';
import { npcValueOf } from '../drops/NpcDrops';

interface Cond { t: string; n?: number; id?: number; k?: number; branch?: number; elseOf?: number; pair?: number }
interface Spawn {
  id?: number; stack?: number; lo?: number; hi?: number;
  idFrom?: [number, number]; dedup2?: boolean;
  maskIds?: number[]; maskRoll?: number;
  pick2?: number[]; stackExpr?: Array<[number, number]>;
  stackVar?: boolean; crim?: boolean; evil?: number; good?: number;
  conds: Cond[];
}
const DATA = bagsJson as {
  bags: Record<string, { devArmor: boolean; spawns: Spawn[] }>;
  coinMap: Record<string, number>;
};

/** TryGettingDevArmor 开发者套装 21 组（Player.cs:7524-7665）。
 *  注意是**全局表**（1/16 门后 Next(21) 一次掷），不是 per-bag——
 *  凡 OpenBossBag 里调 TryGettingDevArmor 的袋（json devArmor=true 的 10 袋）共用。
 *  case10 的 3024 与 case11 的 3599 各 ×4（:7596/:7603）。 */
export const DEV_ARMOR_SETS: Array<Array<[number] | [number, number]>> = [
  [[666], [667], [668], [665], [3287]],
  [[1554], [1555], [1556], [1586]],
  [[1554], [1587], [1588], [1586]],
  [[1557], [1558], [1559], [1585]],
  [[1560], [1561], [1562], [1584]],
  [[1563], [1564], [1565], [3582]],
  [[1566], [1567], [1568]],
  [[1580], [1581], [1582], [1583]],
  [[3226], [3227], [3228], [3288]],
  [[3583], [3581], [3578], [3579], [3580]],
  [[3585], [3586], [3587], [3588], [3024, 4]],
  [[3589], [3590], [3591], [3592], [3599, 4]],
  [[3368], [3921], [3922], [3923], [3924]],
  [[3925], [3926], [3927], [3928], [3929]],
  [[4732], [4733], [4734], [4730]],
  [[4747], [4748], [4749], [4746]],
  [[4751], [4752], [4753], [4750]],
  [[4755], [4756], [4757], [4754]],
  [[5583], [5584], [5585], [5586], [5587]],
  [[5683], [5684], [5685], [5686]],
  [[6137], [6138], [6139], [6140], [6141]],
];

/** ItemID.Sets.BossBag 全集（ItemID.cs:1215,1457 终值;1458 同域零增量）= 21 件：
 *  袋体 19 件（vanilla-bossbags.json bags）+ 3861 食人魔袋/3862 黑魔法师袋——
 *  后两件主战利品 case 整缺=原版本相（1456/1457 OpenBossBag switch 均无 case
 *  3861/3862,仅走 :7767-7851 共享钱币尾段,而 NPC 576/564 value=0f——
 *  NPC.cs:16314/:16484 → 开袋=纯消耗零产出,原版刻意）。
 *  ★SW-FX21（2026-09-10）：旧版仅取 bags 键 19 件,3861/3862 开袋面整死。 */
export const BOSS_BAG_IDS = new Set([...Object.keys(DATA.bags), ...Object.keys(DATA.coinMap)].map(Number));

/** rand.Next(a,b) 上界开 */
const rn = (a: number, b: number) => a + Math.floor(Math.random() * (b - a));

export function openBossBag(
  vid: number,
  give: (id: number, stack?: number) => void,
  world: { masterMode: boolean; crimson: boolean; extraAccessory: boolean; hasItem: (id: number) => boolean; remixWorld?: boolean; tenthAnniversary?: boolean },
): void {
  const bag = DATA.bags[String(vid)];
  // ★SW-FX21（2026-09-10）：袋体缺省（3861/3862）不再提前 return——原版 OpenBossBag
  // 主战利品 switch 无 case 3861/3862（:7210-7696 逐支核对,1456:7215 区同判）,
  // 但共享钱币尾段（:7767-7851）照走;此处只跳过主战利品段,尾段语义同序。
  const spawns: Spawn[] = bag ? bag.spawns : [];
  const devArmorFlag = bag ? bag.devArmor : false;
  // TryGettingDevArmor（:7048 等 10 袋调用,json devArmor 登记）:1/16 门
  // （十周年世界 1/8,:7526）→ Next(21) 全局套装表,整组下发
  if (devArmorFlag && Math.random() < 1 / (world.tenthAnniversary ? 8 : 16)) {
    const set = DEV_ARMOR_SETS[Math.floor(Math.random() * DEV_ARMOR_SETS.length)] ?? [];
    for (const it of set) give(it[0], it[1] ?? 1);
  }
  // switch 掷面数 = 该 k 族 branch 最大值+1（=原版 Next(N) 的 N,switch 臂数;
  // 曾硬编码 *8 → 3/4/6/7 臂袋各武器 12.5%/37.5% 共现或 25% 空手,2026-08-18 修）
  const swFaces = new Map<number, number>();
  for (const sp of spawns) {
    for (const c of sp.conds) {
      if (c.t === 'sw') swFaces.set(c.k ?? 0, Math.max(swFaces.get(c.k ?? 0) ?? 0, (c.branch ?? 0) + 1));
    }
  }
  // switch 掷一次（同袋内所有 sw cond 共享各自 switch 的结果）
  const swPick = new Map<number, number>();
  // else 补集:同一 chanceId 的 else 与 if 共享掷骰结果
  const chanceRoll = new Map<number, boolean>();
  let chanceSeq = 0;
  for (const sp of spawns) {
    let ok = true;
    for (const c of sp.conds) {
      switch (c.t) {
        case 'chance': {
          const r = Math.random() < 1 / (c.n ?? 2);
          chanceRoll.set(c.pair ?? ++chanceSeq, r);
          ok &&= r;
          break;
        }
        case 'chanceElse': {
          const pair = c.pair ?? ++chanceSeq;
          if (!chanceRoll.has(pair)) chanceRoll.set(pair, Math.random() < 0.5);
          ok &&= !chanceRoll.get(pair)!;
          break;
        }
        case 'master': ok &&= world.masterMode; break;
        case 'noMaster': ok &&= !world.masterMode; break; // if(master){}else{} 的 else 臂（3320/3321 矿）
        case 'remix': ok &&= world.remixWorld === true; break; // Main.remixWorld（3330 case5 猪鲨宝饰）
        case 'noRemix': ok &&= world.remixWorld !== true; break;
        case 'noExtra': ok &&= !world.extraAccessory; break;
        case 'noItem': ok &&= !world.hasItem(c.id ?? 0); break;
        case 'sw': {
          const k = c.k ?? 0;
          if (!swPick.has(k)) swPick.set(k, Math.floor(Math.random() * (swFaces.get(k) ?? 8)));
          ok &&= (c.branch ?? -1) === swPick.get(k);
          break;
        }
        default: break;
      }
      if (!ok) break;
    }
    if (!ok) continue;
    // ---- 表达式掷骰与产出 ----
    if (sp.pick2) {
      const pool = [...sp.pick2];
      for (let k = 0; k < 2 && pool.length; k++) {
        const ix = Math.floor(Math.random() * pool.length);
        give(pool[ix]);
        pool.splice(ix, 1);
      }
      continue;
    }
    if (sp.maskIds) {
      const pick = Math.floor(Math.random() * (sp.maskRoll ?? sp.maskIds.length));
      give(sp.maskIds[Math.min(pick, sp.maskIds.length - 1)] ?? sp.maskIds[0]);
      continue;
    }
    const stackOf = (): number | undefined => {
      if (sp.stackExpr) return sp.stackExpr.reduce((acc, [roll, base]) => acc + base + Math.floor(Math.random() * roll), 0);
      if (sp.lo !== undefined && sp.hi !== undefined) return rn(sp.lo, sp.hi);
      if (sp.stackVar) return sp.stack;
      return sp.stack ?? 1;
    };
    if (sp.crim) {
      give(world.crimson ? (sp.evil ?? 0) : (sp.good ?? 0), sp.stackVar ? stackOf() : 1);
      continue;
    }
    if (sp.idFrom) {
      const a = rn(sp.idFrom[0], sp.idFrom[1]);
      give(a);
      if (sp.dedup2) {
        let b = rn(sp.idFrom[0], sp.idFrom[1]);
        let g = 0;
        while (b === a && g++ < 20) b = rn(sp.idFrom[0], sp.idFrom[1]);
        give(b);
      }
      continue;
    }
    if (sp.id === undefined) continue;
    give(sp.id, stackOf());
  }
  // ---- 共享尾段（:7418-7520）：按 boss value 附赠钱币 ----
  const bossId = DATA.coinMap[String(vid)];
  if (!bossId) return;
  let value = npcValueOf(bossId);
  if (!value) return;
  value *= 1 + rn(-20, 21) * 0.01;
  for (const [chance, lo, hi] of [[5, 5, 11], [10, 10, 21], [15, 15, 31], [20, 20, 41]] as const) {
    if (Math.floor(Math.random() * chance) === 0) value *= 1 + rn(lo, hi) * 0.01;
  }
  let remain = Math.floor(value);
  for (const [coin, unit] of [[74, 1000000], [73, 10000], [72, 100], [71, 1]] as const) {
    const n = Math.floor(remain / unit);
    if (n > 0) { give(coin, n); remain -= n * unit; }
  }
}
