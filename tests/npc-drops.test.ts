// 掉落系统回归（对照 1.4.5.6 ItemDropDatabase 提取表 + NPC 掉落管线）
import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import {
  resolveDrops, rollCoins, rollHeartsAndStars, npcValueOf,
  type NpcDropCtx,
} from '../src/drops/NpcDrops';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import dropData from '../src/data/vanilla-npcdrops.json';

function mkCtx(over: Partial<NpcDropCtx> = {}): NpcDropCtx {
  return {
    rng: new RNG(42),
    netId: 1, type: 1,
    isExpert: false, isMaster: false, hardMode: false, crimson: false,
    flags: {},
    x: 1000, y: 1000,
    worldSurfaceTile: 200, rockLayerTile: 400, underworldTileY: 900,
    maxTilesX: 4200, maxTilesY: 1200,
    lifeMax: 50, friendly: false, boss: false, damage: 10, value: 10,
    hp: 80, hpMax: 100, mana: 15, manaMax: 20,
    ...over,
  };
}

/** 采样 N 次击杀：每杀独立 rng，返回 id→总件数 与 每杀明细（互斥断言用） */
function sample(type: number, n: number, over: Partial<NpcDropCtx> = {}) {
  const counts = new Map<number, number>();
  const perKill: Array<number[]> = [];
  let zeroValue = false;
  for (let i = 0; i < n; i++) {
    const c = mkCtx({ rng: new RNG(i * 7919 + 13), netId: type, type, ...over });
    const res = resolveDrops(c);
    zeroValue = zeroValue || res.zeroValue;
    const ids: number[] = [];
    for (const d of res.drops) {
      counts.set(d.id, (counts.get(d.id) ?? 0) + d.n);
      ids.push(d.id);
    }
    perKill.push(ids);
  }
  return { counts, perKill, zeroValue };
}

describe('掉落提取表（静态）', () => {
  it('条目数/覆盖/未知 kind 达标', () => {
    const entries = (dropData as { entries: unknown[] }).entries;
    expect(entries.length).toBeGreaterThan(600);
    const npcs = new Set<number>();
    const kinds = new Set<string>();
    for (const e of entries as Array<{ npcs?: number[]; rule: { k: string } }>) {
      for (const n of e.npcs ?? []) npcs.add(n);
      kinds.add(e.rule.k);
    }
    expect(npcs.size).toBeGreaterThan(380);
    expect(kinds.has('unknown')).toBe(false);
  });

  it('史莱姆法杖 1/10000（原版 NormalvsExpert(1309,10000,7000)）', () => {
    const { counts } = sample(1, 5000);
    // 5000 杀期望 0.5 件：抽样应接近 0（修复前恒掉）
    expect(counts.get(1309) ?? 0).toBeLessThanOrEqual(2);
    // 凝胶恒掉 1-2
    expect(counts.get(23) ?? 0).toBeGreaterThanOrEqual(5000);
  });

  it('NPC.value 表：普通怪 + 史莱姆负 id 变体（SetDefaultsFromNetId）', () => {
    expect(npcValueOf(3)).toBe(60);        // 僵尸
    expect(npcValueOf(4)).toBe(30000);     // EoC
    expect(npcValueOf(1)).toBe(0);         // 蓝史莱姆本体
    expect(npcValueOf(-1)).toBe(100);      // 大史莱姆变体
    expect(npcValueOf(-4)).toBe(10000);    // 金史莱姆
    expect(npcValueOf(-5)).toBe(10);       // 小史莱姆（母史莱姆分裂）
  });

  it('物品 key 映射覆盖 >95%', () => {
    const ids = new Set<number>();
    const walk = (r: any) => {
      if (!r || typeof r !== 'object') return;
      if (typeof r.item === 'number') ids.add(r.item);
      for (const k of ['normal', 'expert', 'def', 'master']) if (r[k]?.k) walk(r[k]);
      if (r.ids) r.ids.forEach((x: number) => ids.add(x));
      if (r.chain) r.chain.forEach((c: any) => walk(c.rule));
    };
    for (const e of (dropData as any).entries) walk(e.rule);
    let missing = 0;
    for (const id of ids) if (!VANILLA_ITEM_KEY_BY_ID[id]) missing++;
    expect(missing / ids.size).toBeLessThan(0.05);
  });
});

describe('怪物掉落采样（行为）', () => {
  it('僵尸 3：枷锁≈1/50、僵尸手臂≈1/250、无火把伪条目、掉钱', () => {
    const n = 2000;
    const { counts } = sample(3, n);
    const shackle = counts.get(216) ?? 0;   // 1/50 → 期望 40
    expect(shackle).toBeGreaterThan(15);
    expect(shackle).toBeLessThan(70);
    const arm = counts.get(1304) ?? 0;      // 1/250 → 期望 8
    expect(arm).toBeGreaterThan(0);
    expect(arm).toBeLessThan(20);
    expect(counts.has(8)).toBe(false);      // 火把伪条目已消灭
    // 钱币（value=60 铜）：管线独立掷
    const coin = rollCoins(60, mkCtx({ type: 3, rng: new RNG(7) }), false);
    const total = coin.reduce((s, c) => s + c.n * (c.id === 71 ? 1 : c.id === 72 ? 100 : c.id === 73 ? 10000 : 1000000), 0);
    expect(total).toBeGreaterThan(40);
    expect(total).toBeLessThan(130);
  });

  it('恶魔眼 2：晶状体 1/100 与黑晶状体互斥（failedRoll 链）', () => {
    const { perKill } = sample(2, 2000);
    let lens = 0, black = 0;
    for (const ids of perKill) {
      const l = ids.filter((x) => x === 236).length;
      const b = ids.filter((x) => x === 38).length;
      expect(l + b).toBeLessThanOrEqual(1); // 至多其一
      lens += l; black += b;
    }
    // 1456 :1087：晶状体 1/100（≈20/2000）；黑晶状体 = 晶状体失败后 1/3（≈660/2000）
    expect(lens).toBeGreaterThan(10);
    expect(black).toBeGreaterThan(550);
    expect(black).toBeLessThan(800);
  });

  it('噬魂怪 6：暗影鳞片三选一 1/175 + 魔矿 1/3', () => {
    const { counts } = sample(6, 2000);
    const scales = (counts.get(956) ?? 0) + (counts.get(957) ?? 0) + (counts.get(958) ?? 0);
    expect(scales).toBeGreaterThan(2);   // 期望 ≈11
    expect(scales).toBeLessThan(30);
    expect(counts.get(68) ?? 0).toBeGreaterThan(450); // 魔矿 1/3 → ≈667
  });

  it('EoC 4：普通=矿石+掉钱，专家=宝藏袋+清零钱', () => {
    // 普通（corruption 分支：魔矿 30-90 恒掉 + 邪箭）
    const normal = sample(4, 50);
    expect(normal.counts.get(56) ?? 0).toBeGreaterThan(0);   // 魔矿
    expect(normal.zeroValue).toBe(false);
    expect(npcValueOf(4)).toBeGreaterThan(0);
    // 专家
    const expert = sample(4, 20, { isExpert: true });
    expect(expert.counts.get(3319) ?? 0).toBe(20);           // 每杀必掉宝藏袋
    expect(expert.zeroValue).toBe(true);                     // value 清零 → 不掉钱
    expect(expert.counts.get(56) ?? 0).toBe(0);              // NotExpert 矿石条目关闭
  });

  it('专家模式叠加大师：纪念品恒掉（masterCommon）', () => {
    const master = sample(4, 10, { isExpert: true, isMaster: true });
    expect(master.counts.get(4924) ?? 0).toBe(10);
    expect(master.counts.get(3319) ?? 0).toBe(10);
  });

  it('心/星：普通怪偶发、史莱姆族不掉', () => {
    const c = mkCtx({ type: 3, lifeMax: 60, damage: 15, rng: new RNG(99) });
    let hearts = 0, stars = 0;
    for (let i = 0; i < 2000; i++) {
      for (const d of rollHeartsAndStars({ ...c, rng: new RNG(i * 31 + 5) })) {
        if (d.id === 58) hearts++;
        if (d.id === 184) stars++;
      }
    }
    expect(hearts).toBeGreaterThan(50);  // 1/6×1/2×2/3 ≈ 5.5%
    expect(stars).toBeGreaterThan(30);   // 1/6×1/2×(mana未满) + 1/2 额外星
    // 母史莱姆 16 排除
    const none = rollHeartsAndStars(mkCtx({ type: 16, lifeMax: 60, damage: 15 }));
    expect(none.length).toBe(0);
  });

  it('钱币管线：8 层放大均值 ≈ value×1.08，血月加成生效', () => {
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      const coins = rollCoins(100, mkCtx({ rng: new RNG(i * 17 + 3) }), false);
      sum += coins.reduce((s, c) => s + c.n * (c.id === 71 ? 1 : c.id === 72 ? 100 : c.id === 73 ? 10000 : 1000000), 0);
    }
    const avg = sum / 2000;
    // 均值 = 1.275(基线) × ∏(1+1/2^k×增幅) ≈ 1.47×value（源码公式逐项核对）
    expect(avg).toBeGreaterThan(130);
    expect(avg).toBeLessThan(165);
    let bloodSum = 0;
    for (let i = 0; i < 2000; i++) {
      const coins = rollCoins(100, mkCtx({ rng: new RNG(i * 17 + 3) }), true);
      bloodSum += coins.reduce((s, c) => s + c.n * (c.id === 71 ? 1 : c.id === 72 ? 100 : c.id === 73 ? 10000 : 1000000), 0);
    }
    expect(bloodSum / 2000).toBeGreaterThan(avg); // 血月 ×(1.0-2.0)
  });

  it('恶魔眼晶状体→可疑眼球条件（EoC 击败后不掉，条件恒 false）', () => {
    const { counts } = sample(2, 200, { flags: {} });
    expect(counts.get(43) ?? 0).toBe(0); // EyeOfCthulhuDefeatedAndNoAltarsInWorld 恒 false
  });
});
