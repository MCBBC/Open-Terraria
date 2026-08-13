// 宝藏袋开包引擎（Player.OpenBossBag :6828-7520,1.4.5.6 全 19 袋）
// 数据 = tools/extract-bossbags.mjs 结构化提取（提取期归一条件,随机全部留给引擎期掷）。
// 引擎执行:逐 spawn 求值 conds(chance/master/noExtra/noItem/switch 选支),
// 支持 idFrom 范围/dedupPair/maskIds/pick2/stackExpr 表达式 +
// 共享尾段（按 boss value 附赠钱币,贪心拆面额）。
import bagsJson from './vanilla-bossbags.json';
import { npcValueOf } from '../drops/NpcDrops';

interface Cond { t: string; n?: number; id?: number; k?: number; branch?: number; elseOf?: number }
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

export const BOSS_BAG_IDS = new Set(Object.keys(DATA.bags).map(Number));

/** rand.Next(a,b) 上界开 */
const rn = (a: number, b: number) => a + Math.floor(Math.random() * (b - a));

export function openBossBag(
  vid: number,
  give: (id: number, stack?: number) => void,
  world: { masterMode: boolean; crimson: boolean; extraAccessory: boolean; hasItem: (id: number) => boolean },
): void {
  const bag = DATA.bags[String(vid)];
  if (!bag) return;
  // bag.devArmor: TryGettingDevArmor 开发者套装小概率——未实装登记
  // switch 掷一次（同袋内所有 sw cond 共享各自 switch 的结果）
  const swPick = new Map<number, number>();
  // else 补集:同一 chanceId 的 else 与 if 共享掷骰结果
  const chanceRoll = new Map<number, boolean>();
  let chanceSeq = 0;
  for (const sp of bag.spawns) {
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
        case 'noExtra': ok &&= !world.extraAccessory; break;
        case 'noItem': ok &&= !world.hasItem(c.id ?? 0); break;
        case 'sw': {
          const k = c.k ?? 0;
          if (!swPick.has(k)) swPick.set(k, Math.floor(Math.random() * 8));
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
      if (sp.stackVar) return sp.stack;
      if (sp.lo !== undefined && sp.hi !== undefined) return rn(sp.lo, sp.hi);
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
