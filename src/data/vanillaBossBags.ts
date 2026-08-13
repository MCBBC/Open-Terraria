// 宝藏袋开包引擎（Player.OpenBossBag :6828-7520,1.4.5.6 全 19 袋）
// 数据 = tools/extract-bossbags.mjs 从反编译源码词法提取的 token 流（0 unparsed）,
// 引擎按原版语义执行:概率门/大师门/无扩容门/未持有门/武器 switch/变量流/
// 猩红世界三元/去重双随机/十选二不放回 + 共享尾段(按 boss value 附赠钱币)。
import bagsJson from './vanilla-bossbags.json';
import { npcValueOf } from '../drops/NpcDrops';

type Tok = Record<string, unknown> & { t: string };
const DATA = bagsJson as { bags: Record<string, Tok[]>; coinMap: Record<string, number> };

export const BOSS_BAG_IDS = new Set(Object.keys(DATA.bags).map(Number));

/** rand.Next(a,b) 上界开 */
const rn = (a: number, b: number) => a + Math.floor(Math.random() * (b - a));

/**
 * 执行一个袋的开包。
 * @param give  物品出口（id, stack）——由调用方落点（本仓 spawnDrop）
 * @param world 世界上下文：masterMode / crimson / extraAccessory / hasItem
 * @returns 是否执行了尾段钱币（value>0）
 */
export function openBossBag(
  vid: number,
  give: (id: number, stack?: number) => void,
  world: { masterMode: boolean; crimson: boolean; extraAccessory: boolean; hasItem: (id: number) => boolean },
): void {
  const toks = DATA.bags[String(vid)];
  if (!toks) return;
  // ---- 第一段:token 流状态机 ----
  // 门栈:每层 { active }（switch 的 branch 也进栈;blockClose 出栈）
  const stack: Array<{ active: boolean }> = [{ active: true }];
  let v = 0;            // 变量寄存器（numN/item2 复用——源码每段单变量流）
  let v2 = 0;           // 去重第二变量（3318 双随机）
  let crimItem = 0;     // crimson 三元暂存
  let lastRandVar: { a: number; b: number } | null = null;
  let inSwitch: { n: number; pick: number } | null = null;
  let switchVarIds: number[] = [];
  const active = () => stack.every((s) => s.active);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    switch (t.t) {
      case 'devArmor': continue;   // TryGettingDevArmor 开发者套装小概率——未实装登记
      case 'remix': continue;      // remixWorld 分支——本仓无该种子
      case 'blockOpen': continue;  // 边界由下方各门的隐式块处理
      case 'blockClose': { if (stack.length > 1) stack.pop(); inSwitch = null; continue; }
      case 'if': stack.push({ active: Math.random() < 1 / (t.n as number) }); continue;
      case 'else': { const top = stack[stack.length - 1]; if (top) top.active = !top.active; continue; }
      case 'master': stack.push({ active: world.masterMode }); continue;
      case 'noExtraAcc': stack.push({ active: !world.extraAccessory }); continue;
      case 'noItem': stack.push({ active: !world.hasItem(t.id as number) }); continue;
      case 'end': { while (stack.length > 1) stack.pop(); inSwitch = null; continue; }
      case 'switch': {
        inSwitch = { n: t.n as number, pick: Math.floor(Math.random() * (t.n as number)) };
        continue;
      }
      case 'branch': {
        if (inSwitch) stack.push({ active: (t.i as number) === inSwitch.pick });
        else stack.push({ active: true });
        continue;
      }
      case 'switchVar': {
        // 简单随机选一 id（3322/3324 面具族:后续 varId/idMap 序列）
        v = Math.floor(Math.random() * 3);
        switchVarIds = [];
        continue;
      }
      case 'varId': switchVarIds.push(t.id as number); continue;
      case 'idMap': {
        // 3324: num6!=3 ? 489+num6 : 2998（v 已掷 0-3）
        switchVarIds = [(t.map as Record<string, number>)[String(v)] ?? 489];
        continue;
      }
      case 'randVar': { lastRandVar = { a: t.a as number, b: t.b as number }; v = rn(t.a as number, t.b as number); v2 = -1; continue; }
      case 'varAdd': v = (t.base as number) + Math.floor(Math.random() * (t.roll as number)); continue;
      case 'varAddMore': v += (t.base as number) + Math.floor(Math.random() * (t.roll as number)); continue;
      case 'dedup': {
        // 去重第二随机（3318/4957:与 v 同范围重掷直到不同）
        const prev = lastRandVar; if (!prev) { v2 = v; continue; }
        v2 = rn(prev.a, prev.b);
        let guard = 0; while (v2 === v && guard++ < 20) v2 = rn(prev.a, prev.b);
        continue;
      }
      case 'crimItem': crimItem = world.crimson ? (t.evil as number) : (t.good as number); continue;
      case 'pick2': {
        const pool = [...((t.ids as number[]) || [])];
        for (let k = 0; k < 2 && pool.length; k++) {
          const idx = Math.floor(Math.random() * pool.length);
          if (active()) give(pool[idx]);
          pool.splice(idx, 1);
        }
        continue;
      }
      case 'spawn': {
        if (!active()) continue;
        if (t.useCrimItem) { give(crimItem, (t.useVar as boolean) ? v : 1); continue; }
        let id = t.id as number | undefined;
        if (t.randId) id = rn(t.lo as number, t.hi as number);
        if (t.useVar) {
          // 3322/3324 面具族:switchVar 收集的 id 列表按已掷 v 取一
          if (switchVarIds.length) {
            give(switchVarIds[Math.min(v, switchVarIds.length - 1)] ?? switchVarIds[0]);
            switchVarIds = []; continue;
          }
          // 3318/4957 去重双随机:先 v 后 v2（源码 num8/num9 两 spawn）
          if (v2 >= 0) { give(v); give(v2); v2 = -1; }
          else give(v);
          continue;
        }
        if (id === undefined) continue;
        const stackN = t.lo !== undefined ? rn(t.lo as number, t.hi as number)
          : t.stack !== undefined ? (t.stack as number) : 1;
        give(id, stackN);
        continue;
      }
      default: continue;
    }
  }
  // ---- 第二段:共享尾段(:7418-7520)——按 boss value 附赠钱币 ----
  // value = boss.value ×(1±20%) + 幸运式四档加成,贪心拆 74/73/72/71 面额
  const bossId = DATA.coinMap[String(vid)];
  if (!bossId) return;
  let value = npcValueOf(bossId);
  if (!value) return;
  value *= 1 + rn(-20, 21) * 0.01;
  for (const [chance, lo, hi] of [[5, 5, 11], [10, 10, 21], [15, 15, 31], [20, 20, 41]] as const) {
    if (Math.floor(Math.random() * chance) === 0) value *= 1 + rn(lo, hi) * 0.01;
  }
  // 拆面额（:7521-7540 贪心循环:74 铂/73 金/72 银/71 铜）
  let remain = Math.floor(value);
  const faces: Array<[number, number]> = [[74, 1000000], [73, 10000], [72, 100], [71, 1]];
  for (const [coin, unit] of faces) {
    const n = Math.floor(remain / unit);
    if (n > 0) { give(coin, n); remain -= n * unit; }
  }
}
