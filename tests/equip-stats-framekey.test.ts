// equipStats 帧级结构键缓存锁（★IIIII251,2026-09-25 记忆化收口）:
// 合同见 src/entities/Player.ts get equipStats / fixedUpdate 注——
//   · 武装窗 = fixedUpdate 函数体（head 武装/finally 解除,早退支被 finally 覆盖）。
//     窗内槽位零写面（projScanCtx 同论证域）⇒ 结构段（甲/染/背包/虚空袋域）每拍
//     首读重建一次、窗内复用,与逐次全量重建逐位同。
//   · 标量尾段（buffs 键集/panic/夜相/炽灼/gates/恶魔心/软糖虫/解锁+hide 位）=
//     每访问现算,任何时刻变化立即失效,与逐次全量重建逐位同。
//   · 解除态（窗外读/单测直调/MP 远端代理）= 旧的逐访问全量重建路径:直写槽位
//     立即生效（equip-stats-cache 六路锁与 breath 族「settle 后直写盔甲立即 42」
//     即此面）。
// 四路 = 解除态回退 / 窗内每拍一次 / 尾段逐位精确 / 位级同（武装路径与全量重建
// 在相同输入下 deep-equal）。
import { describe, it, expect, afterEach } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory, ACC_ARMOR_START } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { BuffType } from '../src/stats/Buffs';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';

function mkHooks(): GameHooks {
  const w = new World(60, 60, 72, 'framekey');
  for (let x = 10; x <= 44; x++) w.store.setTileSilent(x, 40, 1 /* dirt */);
  return {
    world: w, player: null, enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {}, playSfx: () => {},
    playSfxFiles: () => {}, showPickupLabel: () => {}, playerEmote: () => {},
    spawnRainForced: () => {},
  } as never as GameHooks;
}
function mk(): Player {
  return new Player(20 * 16, 38 * 16, new Inventory());
}
const helm = () => ITEM_BY_KEY['vi_89_CopperHelmet']!;   // vi_ 键空间(本地键表不含)

// 结构段/尾段构建计数（原型包装,插桩只存在于测试内,产品码零污染）
let structBuilds = 0;
let tailBuilds = 0;
const proto = Player.prototype as unknown as {
  equipStatsStructKey: () => number;
  equipStatsTailKey: () => number;
};
const origStruct = proto.equipStatsStructKey;
const origTail = proto.equipStatsTailKey;
proto.equipStatsStructKey = function (this: Player) { structBuilds++; return origStruct.call(this); };
proto.equipStatsTailKey = function (this: Player) { tailBuilds++; return origTail.call(this); };
afterEach(() => { structBuilds = 0; tailBuilds = 0; });

describe('equipStats 帧级结构键缓存(IIIII251 四路锁)', () => {
  it('解除态（不跑 fixedUpdate）=旧路径:逐访问重键,直写槽位立即生效', () => {
    const p = mk();
    const a = p.equipStats;                       // 解除态:每次访问现算结构段
    expect(structBuilds).toBe(1);
    const b = p.equipStats;                       // 仍命中旧对象缓存（内容键未变）
    expect(b).toBe(a);
    expect(structBuilds).toBe(2);                 // ★但结构段每访问都重扫=旧路径
    p.inv.armor[0] = { id: helm(), stack: 1 };
    const c = p.equipStats;
    expect(c).not.toBe(a);                        // 直写立即失效（六路锁同款面）
    expect(structBuilds).toBe(3);                 // 第三次访问又重扫一次结构段=旧路径
  });

  it('武装窗内:结构段每拍恰重建一次（53 次/拍 → 1 次/拍 的面）,尾段逐访问现算', () => {
    const p = mk();
    const hooks = mkHooks();
    p.fixedUpdate(1 / 60, hooks);                 // 窗内消费位（移动/战斗链）首读建一次
    p.fixedUpdate(1 / 60, hooks);
    p.fixedUpdate(1 / 60, hooks);
    expect(structBuilds).toBe(3);                 // ★每拍恰一次（head 清缓存+窗内复用）
    const tails = tailBuilds;
    p.equipStats; p.equipStats;                   // 窗外读（解除态）:尾段照常逐访问现算
    expect(tailBuilds).toBe(tails + 2);
  });

  it('尾段逐位精确:buff 增删/panic 窗直读立即跟随（tick 后直调面）', () => {
    const p = mk();
    const hooks = mkHooks();
    p.fixedUpdate(1 / 60, hooks);
    const base = p.equipStats.jumpSpd;
    p.buffs.apply(BuffType.Werewolf, 10);         // buff 增=尾段键变 → 立即重算
    expect(p.equipStats.jumpSpd).toBeCloseTo(base + 0.2);
    p.buffs.remove(BuffType.Werewolf);            // buff 卸立即跟随
    expect(p.equipStats.jumpSpd).toBe(base);
    const calm = p.equipStats.moveMult;
    p.panicTime = 300;                            // panicTime>0 标量位立即生效
    expect(p.equipStats.moveMult).toBeCloseTo(calm + 1.0);
    p.panicTime = 0;
    expect(p.equipStats.moveMult).toBe(calm);
  });

  it('解除态直写立即生效锁:tick 后直写盔甲同拍读出 42（breath 族语义;帧界滞后不豁免）', async () => {
    const p = mk();
    const hooks = mkHooks();
    p.fixedUpdate(1 / 60, hooks);                 // 先武装过（曾持整拍陈旧窗的病灶形态）
    expect(p.breathCDMax).toBe(7);
    const { vanillaItemKey } = await import('../src/data/vanillaRecipes');
    const { ITEM_BY_KEY: IBK } = await import('../src/data/items');
    const acc = IBK[vanillaItemKey(49)!]!;        // 词缀基准件（与六路锁同款值面）
    p.inv.armor[ACC_ARMOR_START] = { id: acc, stack: 1, prefix: 65 };   // 直写配饰槽（解除态）
    const healed = p.equipStats;
    expect(healed.def).toBe(4);                   // 立即跟随（Warding +4）
    p.inv.armor[0] = { id: IBK[vanillaItemKey(268)!]!, stack: 1 };   // 潜水头盔 268
    expect(p.breathCDMax).toBe(42);               // breath 族同款面立即生效
  });

  it('位级同:武装路径与解除态全量重建在相同输入下 deep-equal', () => {
    const acc = ITEM_BY_KEY['vi_3366_YoyoBag']!;
    const armed = mk();
    const legacy = mk();
    for (const p of [armed, legacy]) {
      p.inv.gateExpert = true;                    // 恶魔心槽门（与六路锁同面）
      p.inv.armor[ACC_ARMOR_START] = { id: acc, stack: 1, prefix: 65 };
      p.inv.slots[0] = { id: ITEM_BY_KEY['vi_3084_radar']!, stack: 1 };   // 背包 I 档信息件（INV 段命中格）
      p.usedGummyWorm = true;
    }
    // ★狼人夹具须在武装 tick 之后挂（Player.ts 月相门在 fixedUpdate 内会摘无符狼人
    //   buff——预挂被吃=测试时序伪影,非缓存回归;见尾段精确路锁）
    armed.fixedUpdate(1 / 60, mkHooks());         // 只有 armed 进过武装窗
    armed.buffs.apply(BuffType.Werewolf, 10);
    legacy.buffs.apply(BuffType.Werewolf, 10);
    const ea = armed.equipStats as unknown as Record<string, unknown>;
    const eb = legacy.equipStats as unknown as Record<string, unknown>;
    const diffKeys = Object.keys(ea).filter(k => JSON.stringify(ea[k]) !== JSON.stringify(eb[k]));
    expect(diffKeys).toEqual([]);                 // 位级同:差异键面必须为空
    expect(armed.equipStats).toEqual(legacy.equipStats);
    expect(armed.equipStats).not.toBe(legacy.equipStats);  // 各自实例的冻结对象
    expect(Object.isFrozen(armed.equipStats)).toBe(true);  // 冻结契约在两条路径同样成立
  });
});
