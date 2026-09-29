// BJ398（2026-09-29）两件判别面。
// 件 1（656 敌面节拍,BJ385 登记独立决策刀）：本仓 656 沙暴柱旧 pierce=0 走 Enemy.hurt
//   通用档写全局 iframes=10,而原版 656 命中链落梯 :14175-14178 usesLocalNPCImmunity 主支
//   （SetDefaults :7059-7060 usesLocal=true+cd=8）→ immune[owner]=0（全局窗清零）+
//   immuneArray[victim]=8（局部表节流）。旧码局部 8t 表过期后仍被全局残窗拦 → 真敌有效
//   再命中节拍 10t vs 原版 8t;跨弹面全局 10t 也拦他弹（原版单表清零后他弹照达）。
//   落刀 = Enemy.hurt 编码族新槽 pierce=-3（免疫门照走 :12636,flag3 不豁免;命中写=
//   清全局窗 0）+ 受理面 GC1 桥（noteVanillaProjImmune localFace → 近战域表同拍清零）。
// 件 2（Arrow 尾段八站受理面化,BJ395 登记清单）：原版 Damage_PVE_Inner 免疫门
//   :12635-12639 return 前置 → 八站全在受理面（拒收不可达）——hitSet（写面=免疫梯同拍）/
//   幻象弓 :13934 / 吸血链 :13869-13884 / 710 裂片 :14185 / 638-640 衰减 :14241-14243 /
//   477 归巢 :13588 / 676 反射 :13721 / 451 :14115。旧无条件写=502·localImmune·idStatic
//   支（无全局读门）与 flag3 路径的拒收跳也照跑=over-fire。
// 双闸判别：普通命中（vanillaGated=false）八站/清窗/节拍照达 + 门拒（iframes 残窗）静默。
// 拒收载体三族：502 局部免疫支（:9233,无全局读门）/ 合成 local 面（localImmune 逐例覆写,
//   过 :9238 臂）/ flag3 路径（pierceInit=1 绕 :9248 读门）——hurt 桩返假=:13972 门拒形态。
// 运行：cd game && npx vitest run tests/bj398-forbidden-beat-arrow-tail.test.ts
import { describe, it, expect } from 'vitest';
import { Arrow } from '../src/entities/Arrow';
import { ForbiddenSignProj } from '../src/entities/ForbiddenSignProj';
import { Enemy } from '../src/entities/Enemy';
import { TileStore } from '../src/world/TileStore';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const PX = 60 * TILE, PY = 90 * TILE;

type GateEnemy = {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  hp: number; maxHp: number; iframes?: number; dontTakeDamage?: boolean;
  vanillaId?: number | null; immortal?: boolean;
  hits: number[]; lastStrikeDealt: number;
  hurt: (d: number, kx?: number, ky?: number, g?: unknown, pen?: number, crit?: boolean,
    pierce?: number, fromPlayer?: boolean) => boolean;
};
/** 普通未致命命中尾档形态（Enemy.hurt :15037 返假+实扣+写窗 :14274）——受理面载体 */
function mkNormalHitEnemy(id: number, cx: number, cy: number, w = 900, h = 400): GateEnemy {
  const e: GateEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, hp: 100000, maxHp: 100000,
    hits: [], lastStrikeDealt: 0,
    hurt(d: number) {
      this.hp -= d; this.hits.push(d); this.lastStrikeDealt = d;
      this.iframes = 10;               // :14274 通用档（pierce∉{-2,1}）
      return false;
    },
  };
  return e;
}
/** 门拒形态（:13972 iframes 残窗拒收,零实扣零写）——over-fire 判别载体 */
function mkGatedEnemy(id: number, cx: number, cy: number, w = 900, h = 400): GateEnemy {
  const e = mkNormalHitEnemy(id, cx, cy, w, h);
  e.iframes = 5;                        // 外源残窗
  e.hurt = () => false;                 // Enemy.hurt :13972 门拒形态
  return e;
}

interface BridgeEntry { npcId: number; ticks: number; t: number }

function makeGame(enemies: unknown[]): {
  hooks: GameHooks; clock: { t: number }; bridge: BridgeEntry[];
  steal: Array<{ kind: string; numHits: number; t: number }>;
  added: Array<{ projId: number; obj: unknown }>;
} {
  const store = new TileStore(200, 200);
  const clock = { t: 0 };
  const bridge: BridgeEntry[] = [];
  const steal: Array<{ kind: string; numHits: number; t: number }> = [];
  const added: Array<{ projId: number; obj: unknown }> = [];
  const hooks = {
    world: {
      store,
      get groundLevel() { return 100; },
      clock: { isDay: false },
      seedFlags: {},
    } as unknown as GameHooks['world'],
    player: new Player(PX, PY, new Inventory()),
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    spawnDust: (() => null) as never,
    entities: {
      add: (obj: unknown, _bucket?: string) => {
        added.push({ projId: (obj as { projId?: number })?.projId ?? -1, obj });
      },
    },
    noteNpcPlayerImmune: (npcId: number, ticks: number) => { bridge.push({ npcId, ticks, t: clock.t }); },
    applyLifeSteal: (kind: string, _d: number, numHits: number) => {
      steal.push({ kind, numHits, t: clock.t });
      return 0;
    },
  } as unknown as GameHooks;
  return { hooks, clock, bridge, steal, added };
}
/** 驱动至首拍受理（stub hits 增长）或 n 拍耗尽——受理跳断言前先自证受理发生 */
function driveUntilHit(proj: { fixedUpdate: (dt: number, g: GameHooks) => void },
  hooks: GameHooks, clock: { t: number }, victim: { hits: unknown[] }, max = 6): void {
  for (let t = 1; t <= max && victim.hits.length === 0; t++) {
    clock.t = t;
    proj.fixedUpdate(1 / 60, hooks);
  }
}

// ============================================================
// 件 1 —— 656 敌面节拍（8t 局部窗 / 跨弹 per-owner / 清全局窗）
// ============================================================
describe('BJ398 件1 656 沙暴柱敌面节拍（usesLocal 族 pierce=-3 清零档）', () => {
  it('A1 真敌再命中节拍 8t（旧 pierce=0 全局 10t 残窗 → 10t）+命中写清全局窗 iframes=0', () => {
    const e = Enemy.fromVanilla(4, 30 * TILE + 8, 34 * TILE)!;   // EoC 静置（本测不跑其 AI）
    expect(e.hp).toBeGreaterThan(100);
    const { hooks, clock, bridge } = makeGame([e]);
    const s = new ForbiddenSignProj(30 * TILE + 8, 34 * TILE, 20);
    const hitTicks: number[] = [];                // 命中检测 = hp 实扣拍（非桥自证）
    let hpPrev = e.hp;
    for (let t = 1; t <= 14; t++) {
      clock.t = t;
      s.fixedUpdate(1 / 60, hooks);
      if (e.hp < hpPrev) hitTicks.push(t);
      hpPrev = e.hp;
    }
    expect(hitTicks.length).toBeGreaterThanOrEqual(2);
    expect(hitTicks[0]).toBe(1);
    expect(hitTicks[1] - hitTicks[0]).toBe(8);   // ★判别面:节拍 8t（旧码=10 红）
    expect(e.iframes).toBe(0);                   // ★清窗判别:命中写 0（:14175-14178;旧码=10 红）
    expect(bridge.length).toBe(hitTicks.length); // GC1 桥=受理拍数（近战域表同拍清零）
    expect(bridge[0]).toEqual({ npcId: e.id, ticks: 0, t: 1 });   // 清零档写 0
  });

  it('A2 跨弹 per-owner：双柱同拍双命中（全局窗清零后他弹照达）+各柱独立 8t 窗（t9 各再命中）', () => {
    const e = Enemy.fromVanilla(4, 30 * TILE + 8, 34 * TILE)!;
    const { hooks, clock, bridge } = makeGame([e]);
    const a = new ForbiddenSignProj(30 * TILE + 8, 34 * TILE, 20);
    const b = new ForbiddenSignProj(30 * TILE + 8, 34 * TILE, 20);
    clock.t = 1;
    a.fixedUpdate(1 / 60, hooks);
    b.fixedUpdate(1 / 60, hooks);
    expect(bridge.length).toBe(2);               // ★跨弹判别:同拍双受理（旧码全局 10t 拦=1 红）
    for (let t = 2; t <= 9; t++) {
      clock.t = t;
      a.fixedUpdate(1 / 60, hooks);
      b.fixedUpdate(1 / 60, hooks);
    }
    expect(bridge.length).toBe(4);               // 双柱各自 8t 窗（local 窗 per-owner,非共享）
    expect(bridge.every((x) => x.ticks === 0)).toBe(true);
  });

  it('A3 门拒静默（iframes 残窗）：hitCount/localImmune/吸血/桥四写整面不达（:12635-12638 同面）', () => {
    const e = mkGatedEnemy(39801, 30 * TILE + 8, 34 * TILE, 16, 16);
    const { hooks, steal, bridge } = makeGame([e]);
    const s = new ForbiddenSignProj(30 * TILE + 8, 34 * TILE, 20);
    s.fixedUpdate(1 / 60, hooks);
    expect(e.hits).toHaveLength(0);              // 零实扣（门拒形态自证）
    expect((s as unknown as { hitCount: number }).hitCount).toBe(0);
    expect((s as unknown as { localImmune: Map<number, number> }).localImmune.size).toBe(0);
    expect(steal).toEqual([]);
    expect(bridge).toEqual([]);                  // ★新写位:桥静默
  });
});

// ============================================================
// 件 2 —— Arrow 尾段八站受理面化（普通命中照达 + 拒收静默）
// ============================================================
describe('BJ398 件2 八站受理面——普通命中照达（回归守卫）', () => {
  it('D1 ①hitSet+⑥477归巢：477 受理跳落表+向第二敌转向（:13588 后）', () => {
    const victim = mkNormalHitEnemy(39811, PX, PY);
    const other = Enemy.fromVanilla(4, PX + 280, PY - 100)!;    // (20,700) 窗内+LOS 空旷
    const { hooks, clock } = makeGame([victim, other]);
    const a = new Arrow(PX - 40, PY, 9, 0, 40, 1, 477, { grav: 0, life: 600 });
    const vx0 = a.vx, vy0 = a.vy;
    driveUntilHit(a, hooks, clock, victim);
    expect(victim.hits).toHaveLength(1);                        // 受理（普通命中形态自证）
    expect((a as unknown as { hitSet: Set<number> }).hitSet.has(victim.id)).toBe(true);  // ①
    expect(a.vx !== vx0 || a.vy !== vy0).toBe(true);            // ⑥ 归巢转向（判别:拒收静默=E6）
  });

  it('D2 ②幻象弓：arrow 弹受理跳出 3 枚 631（:13934 后,窗口在位）', () => {
    (Arrow as unknown as { phantasmWindowUntil: number }).phantasmWindowUntil =
      performance.now() + 5000;
    const e = mkNormalHitEnemy(39812, PX, PY);
    const { hooks, clock, added } = makeGame([e]);
    const a = new Arrow(PX - 40, PY, 9, 0, 40, 1, 1, { grav: 0, life: 600 });
    driveUntilHit(a, hooks, clock, e);
    expect(e.hits).toHaveLength(1);
    expect(added.filter((x) => x.projId === 631)).toHaveLength(3);              // ②（判别:E2）
  });

  it('D3 ③吸血链双臂照达：304 吸血 + magic 弹 ghostHeal（:13869-13884 后）', () => {
    const v = mkNormalHitEnemy(39813, PX, PY);
    const { hooks, clock, steal } = makeGame([v]);
    const k = new Arrow(PX - 40, PY, 9, 0, 40, 1, 304, { grav: 0, life: 600 });
    driveUntilHit(k, hooks, clock, v);
    expect(v.hits).toHaveLength(1);
    expect(steal.map((s) => s.kind)).toEqual(['vampire']);      // ③a（numHits=首跳 0 档）
    const v2 = mkNormalHitEnemy(39814, PX, PY);
    const g2 = makeGame([v2]);
    const m = new Arrow(PX - 40, PY, 9, 0, 40, 1, 15, { grav: 0, life: 600 });
    driveUntilHit(m, g2.hooks, g2.clock, v2);
    expect(v2.hits).toHaveLength(1);
    expect(g2.steal.map((s) => s.kind)).toEqual(['ghost']);     // ③b
  });

  it('D4 ④710 裂片：受理跳撒 5 枚 710（:14185 后）', () => {
    const e = mkNormalHitEnemy(39815, PX, PY);
    const { hooks, clock, added } = makeGame([e]);
    const a = new Arrow(PX - 40, PY, 9, 0, 40, 1, 710, { grav: 0, life: 600 });
    driveUntilHit(a, hooks, clock, e);
    expect(e.hits).toHaveLength(1);
    expect(added.filter((x) => x.projId === 710)).toHaveLength(5);              // ④（判别:E4）
  });

  it('D5 ⑤月总衰减：639 受理跳 damage×0.96 落账（:14241-14243 后）+①hitSet', () => {
    const e = mkNormalHitEnemy(39816, PX, PY);
    const { hooks, clock } = makeGame([e]);
    const a = new Arrow(PX - 40, PY, 9, 0, 100, 1, 639, { grav: 0, life: 600 });
    driveUntilHit(a, hooks, clock, e);
    expect(e.hits).toHaveLength(1);
    expect(a.damage).toBe(96);                                  // ⑤ trunc(100×0.96)
    expect((a as unknown as { hitSet: Set<number> }).hitSet.size).toBe(1);   // ①
  });

  it('D6 ⑦676 反射：受理跳弹体翻转+穿透补偿（:13721-13725 后）', () => {
    const e = mkNormalHitEnemy(39817, PX, PY);
    e.vanillaId = 676;
    e.immortal = false;
    const { hooks, clock } = makeGame([e]);
    const a = new Arrow(PX - 40, PY, 9, 0, 40, 1, 1, { grav: 0, life: 600 });   // projId 1 可反射
    driveUntilHit(a, hooks, clock, e);
    expect(e.hits).toHaveLength(1);
    expect((a as unknown as { reflected?: boolean }).reflected).toBe(true);     // ⑦ 反射链落刀
    expect(a.pierceInit).toBe(1);                               // ReflectProjectile penetrate=1
  });

  it('D8 ⑧451 状态机：受理跳 iwOnHit 推进（:14115 后）', () => {
    const e = mkNormalHitEnemy(39818, PX, PY);
    const { hooks, clock } = makeGame([e]);
    const a = new Arrow(PX - 40, PY, 9, 0, 40, 1, 451, { grav: 0, life: 600 });
    driveUntilHit(a, hooks, clock, e);
    expect(e.hits).toHaveLength(1);
    expect((a as unknown as { iwAi0: number }).iwAi0).toBe(3);   // ⑧ iwAi0 0→pierceInit=3
  });
});

describe('BJ398 件2 八站受理面——拒收静默（over-fire 清偿判别）', () => {
  it('E1 ①hitSet：502 局部免疫支（:9233 无全局读门）外源残窗拒收 → 不落表', () => {
    const e = mkGatedEnemy(39821, PX, PY);
    const { hooks } = makeGame([e]);
    const meow = new Arrow(PX, PY, 9, 0, 40, 1, 502, { grav: 0, life: 600 });
    expect(meow.pierceInit).toBe(5);
    meow.fixedUpdate(1 / 60, hooks);
    expect(e.hits).toHaveLength(0);                             // 门拒自证
    expect((meow as unknown as { hitSet: Set<number> }).hitSet.size).toBe(0);   // ★①静默
  });

  it('E2 ②幻象弓+①hitSet：639（合成 local 面）外源残窗拒收跳不出 631/不落表', () => {
    (Arrow as unknown as { phantasmWindowUntil: number }).phantasmWindowUntil =
      performance.now() + 5000;
    const e = mkGatedEnemy(39822, PX, PY);
    const { hooks, added } = makeGame([e]);
    const a = new Arrow(PX - 40, PY, 9, 0, 100, 1, 639, { grav: 0, life: 600 });
    (a as unknown as { localImmune: number }).localImmune = 10; // 合成局部面（639∈箭集+cd 数据 -1 不到位）
    a.fixedUpdate(1 / 60, hooks);
    expect(e.hits).toHaveLength(0);
    expect(added.filter((x) => x.projId === 631)).toHaveLength(0);              // ★②静默
    expect((a as unknown as { hitSet: Set<number> }).hitSet.size).toBe(0);      // ★①静默
    expect(a.damage).toBe(100);                                 // ⑤静默同面
  });

  it('E3 ③吸血链双臂拒收静默：304/magic 弹充能水母拒收（dontTakeDamage,jellyDontTake 面）不 proc', () => {
    // flag3 载体（pierceInit=1）对 iframes 门豁免（:12636 | flag3）——唯一真门拒路径=
    // 充能水母 :12680-12688 `if (dontTakeDamage) return`（vanillaGated 的 jellyDontTake 分量）
    const mk = (id: number): GateEnemy => {
      const e = mkNormalHitEnemy(id, PX, PY);
      e.dontTakeDamage = true;
      e.vanillaId = 63;                       // ZAPPING_JELLYFISH（:9144 不排,arm2 直达 hurt）
      e.hurt = () => false;
      return e;
    };
    const v = mk(39823);
    const { hooks, steal } = makeGame([v]);
    const k = new Arrow(PX - 40, PY, 9, 0, 40, 1, 304, { grav: 0, life: 600 });
    (k as unknown as { localImmune: number }).localImmune = 10;   // 合成局部面（绕 :9252 水母块）
    k.fixedUpdate(1 / 60, hooks);
    expect(v.hits).toHaveLength(0);
    expect(steal).toEqual([]);                                  // ★③a静默（旧无条件=红）
    const v2 = mk(39824);
    const g2 = makeGame([v2]);
    const m = new Arrow(PX - 40, PY, 9, 0, 40, 1, 15, { grav: 0, life: 600 });
    (m as unknown as { localImmune: number }).localImmune = 10;
    m.fixedUpdate(1 / 60, g2.hooks);
    expect(v2.hits).toHaveLength(0);
    expect(g2.steal).toEqual([]);                               // ★③b静默
  });

  it('E4 ④710 裂片拒收静默：充能水母拒收跳不撒裂片', () => {
    const e = mkNormalHitEnemy(39825, PX, PY);
    e.dontTakeDamage = true;
    e.vanillaId = 63;
    e.hurt = () => false;
    const { hooks, added } = makeGame([e]);
    const a = new Arrow(PX - 40, PY, 9, 0, 40, 1, 710, { grav: 0, life: 600 });
    (a as unknown as { localImmune: number }).localImmune = 10;
    a.fixedUpdate(1 / 60, hooks);
    expect(e.hits).toHaveLength(0);
    expect(added.filter((x) => x.projId === 710)).toHaveLength(0);              // ★④静默
  });

  it('E5 ⑤月总衰减拒收静默：639（合成 local 面=过 :9238 臂）拒收跳 damage 不衰减', () => {
    const e = mkGatedEnemy(39826, PX, PY);
    const { hooks } = makeGame([e]);
    const a = new Arrow(PX - 40, PY, 9, 0, 100, 1, 639, { grav: 0, life: 600 });
    (a as unknown as { localImmune: number }).localImmune = 10; // 合成局部面（数据 cd=-1 不到位）
    a.fixedUpdate(1 / 60, hooks);
    expect(e.hits).toHaveLength(0);
    expect(a.damage).toBe(100);                                 // ★⑤静默（旧无条件 ×0.96=96 红）
  });

  it('E6 ⑥477 归巢拒收静默：拒收跳不转向（第二敌在窗内也不动）', () => {
    const victim = mkGatedEnemy(39827, PX, PY);
    const other = Enemy.fromVanilla(4, PX + 280, PY - 100)!;
    const { hooks } = makeGame([victim, other]);
    const a = new Arrow(PX - 40, PY, 9, 0, 40, 1, 477, { grav: 0, life: 600 });
    (a as unknown as { localImmune: number }).localImmune = 10; // 合成局部面
    a.fixedUpdate(1 / 60, hooks);
    expect(victim.hits).toHaveLength(0);
    expect(a.vx).toBe(9); expect(a.vy).toBe(0);                 // ★⑥静默（旧无条件转向=红）
  });

  it('E7 ⑦676 反射拒收静默：639（合成 local 面）拒收跳弹体不翻转', () => {
    const e = mkGatedEnemy(39829, PX, PY);
    e.vanillaId = 676;                          // 微光史莱姆受害面
    const { hooks } = makeGame([e]);
    const a = new Arrow(PX - 40, PY, 9, 0, 100, 1, 639, { grav: 0, life: 600 });
    (a as unknown as { localImmune: number }).localImmune = 10; // 合成局部面
    a.fixedUpdate(1 / 60, hooks);
    expect(e.hits).toHaveLength(0);
    expect((a as unknown as { reflected?: boolean }).reflected ?? false).toBe(false);   // ★⑦静默
    expect(a.pierceInit).toBe(4);               // 反射链（pierce=1/+1 改写）不达
  });

  it('E8 ⑧451 状态机拒收静默：拒收跳 iwAi0 不推进', () => {
    const e = mkGatedEnemy(39828, PX, PY);
    const { hooks } = makeGame([e]);
    const a = new Arrow(PX - 40, PY, 9, 0, 40, 1, 451, { grav: 0, life: 600 });
    (a as unknown as { localImmune: number }).localImmune = 10; // 合成局部面
    a.fixedUpdate(1 / 60, hooks);
    expect(e.hits).toHaveLength(0);
    expect((a as unknown as { iwAi0: number }).iwAi0).toBe(0);   // ★⑧静默
  });
});
