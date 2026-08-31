// L6 spawn parity bundle 回归（2026-08-31 台账清偿批）——每一实装项至少一条门控断言：
//   1. 友好轮通用水域段（NPC.cs:2220-2325）：龟/鸭/水黾群/鸊鷉/鳉/金鱼族
//   2. 友好轮雨天链尾全段（NPC.cs:2380-2407）：深层宝石→金蚯蚓448/蚯蚓357/金上岸金鱼593/上岸金鱼230
//   3. 友好轮夜萤火虫 fireFlyFriendly 独立概率槽（:2414-2438）
//   4. 血月 The Groom 53 / The Bride 536 → RollOnlyBadLuck(300)（:4623/:4628）
//   5. 天空探测器 399：skyBehindPlayer + AnyDanger 上下文门 + 水蜡烛加重双掷怪癖（:1387-1416）
//      与地表支 flag17 AnyDanger 压制（:4170-4201）
//   6. 专家骨堆三连 ==0 怪癖照抄（:5120-5139，1456 :5031-5055 同款）：449×¼、452×¾、450/451 死码
//   7. 万圣 302 / 圣诞 333-336 节日史莱姆 + ChanceToBeHolidaySlime（:5637-5685）
//   8. lowTiles 批：spawnRate ÷2（:791）、地狱稀有怪臂（:3726）、洞穴史莱姆 OR 门（:4990）
//   9. 骷髅商 453 ZoneShadowCandle 门（:5007）
//  10. 地下沙漠 SpawnTileOrAboveHasAnyWallInSet 直接格判定（:1682/:5535）
//  11. 仙女近旁刷怪率 ×1.2/×0.8（GetSpawnRate :745）
//  12. Palworld 695/696 Next(160) + HasItem 5663/5664 强制档（:4374-4389）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';

const WATER = 1; // TileStore.LIQUID_TYPE.WATER

function grassWorld(): { w: World; sp: VanillaSpawner } {
  const w = new World(1300, 600, 42, 'l6-parity');
  w.groundLevel = 100;
  w.rockLevel = 200;
  const st = w.store;
  for (let x = 380; x < 920; x++) st.setTileSilent(x, 100, 3 /* grass 内部 id */);
  return { w, sp: new VanillaSpawner(w) };
}

type Counts = Record<number, number>;
interface RunOpts {
  night?: boolean;
  hour?: number;
  rain?: boolean;
  friendly?: boolean;
  attempts?: number;
  /** spawn() 循环前的世界态注入（雨/旗标等） */
  setup?: (w: World) => void;
  /** 玩家所在格行（默认 96——地表夹具；深层夹具须传落脚带内值） */
  py?: number;
  /** 玩家所在列（默认 = tileX） */
  px?: number;
  /** setPlayerFlags 之后再注 spawner 状态（ctx 类字段会被默认参覆写） */
  post?: (sp: VanillaSpawner) => void;
}
/** 固定种子序列批量采样 spawn()（确定性——失败可复现） */
function runBatch(w: World, sp: VanillaSpawner, tileX: number, o: RunOpts): Counts {
  const counts: Counts = {};
  if (o.setup) o.setup(w);
  sp.setPlayerFlags(false, false);
  o.post?.(sp);
  w.clock.timeOfDay = o.night ? 23 / 24 : (o.hour ?? 12) / 24;
  (sp as unknown as { spawnFriendlyCycle: boolean }).spawnFriendlyCycle = !!o.friendly;
  const n = o.attempts ?? 1200;
  const ptx = o.px ?? tileX;
  const ptyRow = o.py ?? 96;
  for (let k = 0; k < n; k++) {
    const r = sp.spawn(ptx * 16 + 8, ptyRow * 16, new RNG(k * 7919 + 13), 24, 14);
    if (!r || r.vanillaId == null) continue;
    counts[r.vanillaId] = (counts[r.vanillaId] ?? 0) + 1;
    // 净 ID 变体优先（vanillaNetId=-6/mother 等，fromVanilla 只回填正数 base）
    const vid = (r as unknown as { vanillaNetId?: number }).vanillaNetId ?? r.vanillaId;
    if (vid == null) continue;
    counts[vid] = (counts[vid] ?? 0) + 1;
    // 焰火附加队列消费入账后清空（queueFireflyExtras 消费端同 Game）
    for (const ex of sp.pendingCritterExtras) counts[ex.npc] = (counts[ex.npc] ?? 0) + 1;
    sp.pendingCritterExtras = [];
  }
  return counts;
}
const bump = (c: Counts, ids: number[]) => ids.reduce((s, i) => s + (c[i] ?? 0), 0);

describe('L6 spawn parity（友好轮水域段 NPC.cs:2220-2325）', () => {
  it('池塘落脚：出 龟616/鸭362|364 及金鱼兜底；绝不落 敌怪轮水怪 58/63/102', () => {
    const { w } = grassWorld();
    const st = w.store;
    // 池塘：x∈[578,590] 的地面上两格灌水（waterTile=落脚上二格皆水）。
    // 原版 FindSpawnTile 的窗口底界 + safeArea 约束下，落点必在采样窗内且
    // 在 ±~50 格环带外——把玩家放 520 列、视口扩到 48×20，使环带右沿
    // [571,587] 与池塘重叠（同 vanilla 几何的合法采样区）
    for (let x = 578; x <= 590; x++) {
      st.setLiquid(x, 98, 255, WATER);
      st.setLiquid(x, 99, 255, WATER);
    }
    const sp = new VanillaSpawner(w);
    const c: Counts = {};
    sp.setPlayerFlags(false, false);
    (sp as unknown as { spawnFriendlyCycle: boolean }).spawnFriendlyCycle = true;
    for (let k = 0; k < 2200; k++) {
      const r = sp.spawn(520 * 16 + 8, 96 * 16, new RNG(k * 7919 + 13), 48, 20);
      if (!r || r.vanillaId == null) continue;
      const vid = (r as unknown as { vanillaNetId?: number }).vanillaNetId ?? r.vanillaId;
      c[vid] = (c[vid] ?? 0) + 1;
      for (const ex of sp.pendingCritterExtras) c[ex.npc] = (c[ex.npc] ?? 0) + 1;
      sp.pendingCritterExtras = [];
    }
    const waterFamily = [55, 592, 607, 608, 612, 613, 616, 362, 364];
    expect(bump(c, waterFamily)).toBeGreaterThan(15);
    // default 草档 = 海龟(1/5)或鸭子——本段此前整段缺失
    expect((c[616] ?? 0) + (c[362] ?? 0) + (c[364] ?? 0)).toBeGreaterThan(5);
    // 有 !spawnFriendly 门的三支敌怪水池怪不得漏出
    expect(c[58] ?? 0).toBe(0);   // 食人鱼（A 支）
    expect(c[63] ?? 0).toBe(0);   // 蓝水母（B 支）
    expect(c[102] ?? 0).toBe(0);  // 琵琶鱼
  });
});

describe('L6 spawn parity（友好轮雨天链尾 NPC.cs:2380-2407）', () => {
  it('雨天草面：只产 金蚯蚓448/蚯蚓357/金上岸金鱼593/上岸金鱼230，鸟/兔链被 break 截断', () => {
    const { w, sp } = grassWorld();
    const c = runBatch(w, sp, 520, {
      friendly: true, rain: true, attempts: 900,
      setup: (w2) => { w2.weather.raining = true; },
    });
    expect(bump(c, [448, 357, 593, 230])).toBeGreaterThan(200);
    expect(c[357] ?? 0).toBeGreaterThan((c[448] ?? 0) + 20);   // Next(3)!=0 主产蚯蚓
    // 雨天原版绝迹的组合不得出现（break 语义）
    expect((c[46] ?? 0) + (c[297] ?? 0) + (c[298] ?? 0) + (c[74] ?? 0)
      + (c[611] ?? 0) + (c[442] ?? 0)).toBe(0);
  });

  it('夜萤火虫走 fireFlyFriendly 独立槽（:2414）：friendly+夜+低分母→成串 355；fireFlyChance 抬到绝迹仍产出', () => {
    const { w, sp } = grassWorld();
    const c = runBatch(w, sp, 520, {
      friendly: true, night: true, attempts: 600,
      setup: (w2) => {
        w2.weather.windSpeedTarget = 0;   // 无风（World 默认 -0.727 会触发 TooWindyForButterflies 门）
        w2.fireFlyChance = 999999;        // 敌怪轮槽关闭——证明本支读的是 friendly 槽
        w2.fireFlyFriendly = 2;
        w2.fireFlyMultiple = 999999;      // 关附加，主只口径纯净
      },
    });
    expect((c[355] ?? 0) + (c[358] ?? 0)).toBeGreaterThan(60);
  });
});

describe('L6 spawn parity（血月 RollOnlyBadLuck NPC.cs:4623/4628）', () => {
  it('血月夜地表：The Groom 53 / The Bride 536 可刷出（掷骰改 RollOnlyBadLuck 后语义不破）', () => {
    const { w, sp } = grassWorld();
    const c = runBatch(w, sp, 520, {
      night: true, attempts: 4000,
      setup: (w2) => {
        w2.clock.bloodMoon = true;
        w2.clock.moonPhase = 2;
        w2.fireFlyChance = 999999; w2.fireFlyMultiple = 999999;
      },
    });
    expect((c[53] ?? 0) + (c[536] ?? 0)).toBeGreaterThan(0);
  });
});

describe('L6 spawn parity（火星探测器上下文门 NPC.cs:1387-1425/:4170-4201）', () => {
  function skyWorld(): { w: World; sp: VanillaSpawner } {
    const w = new World(1300, 600, 42, 'l6-sky');
    w.groundLevel = 100;
    w.rockLevel = 200;
    w.flags.hardMode = true;
    w.flags['downed_245'] = true;          // downedGolemBoss
    return { w, sp: new VanillaSpawner(w) };
  }
  function skyRun(sp: VanillaSpawner, w: World): Counts {
    const counts: Counts = {};
    for (let k = 0; k < 900; k++) {
      const r = sp.spawn(200 * 16 + 8, 20 * 16, new RNG(k * 104729 + 5), 24, 14);
      if (!r || r.vanillaId == null) continue;
      counts[r.vanillaId] = (counts[r.vanillaId] ?? 0) + 1;
    }
    void w;
    return counts;
  }
  it('高空带外：探测器按 flag5 全链可出；水蜡烛 mv 8/30→3/10 加重', () => {
    const a = skyWorld();
    const plain = skyRun(a.sp, a.w);
    expect(plain[399] ?? 0).toBeGreaterThan(0);
    const b = skyWorld();
    (b.sp as unknown as { zoneWaterCandle: boolean }).zoneWaterCandle = true;
    const candle = skyRun(b.sp, b.w);
    expect(candle[399] ?? 0).toBeGreaterThan(plain[399] ?? 0);   // 含重复支第二掷加成
  });
  it('AnyDanger 场：天空位零探测器（flag5 压制）；玩家所站暗墙背景同样压制 skyBehindPlayer', () => {
    const c = skyWorld();
    c.sp.setPlayerFlags(false, false, false, new Set(), null, null, 0, 0, false, false, true);
    const danger = skyRun(c.sp, c.w);
    expect(danger[399] ?? 0).toBe(0);
    // 玩家所站格换成天然泥土墙 1（非 wallLight/73）→ skyBehindPlayer=false 同样全灭
    const d = skyWorld();
    d.w.store.wall[d.w.store.idx(200, 20)] = 1;
    const darkWall = skyRun(d.sp, d.w);
    expect(darkWall[399] ?? 0).toBe(0);
  });
});

describe('L6 spawn parity（专家骨堆怪癖 NPC.cs:5120-5139）', () => {
  it('Next(4) 三连 ==0 怪癖：仅 449(¼)/452(¾)，450/451 为死码永不出', () => {
    const { w, sp } = grassWorld();
    w.groundLevel = 290;
    w.rockLevel = 280;             // 让 y=330 落 cave band（y>rockLevel）
    const st = w.store;
    for (let x = 380; x < 920; x++) st.setTileSilent(x, 330, 2 /* stone */);
    (w as unknown as { difficulty: number }).difficulty = 1;   // Expert
    const c: Counts = {};
    sp.setPlayerFlags(false, false);
    for (let k = 0; k < 8000; k++) {
      const r = sp.spawn(650 * 16 + 8, 326 * 16, new RNG(k * 15485863 + 11), 24, 14);
      if (!r || r.vanillaId == null) continue;
      c[r.vanillaId] = (c[r.vanillaId] ?? 0) + 1;
    }
    expect(c[450] ?? 0).toBe(0);
    expect(c[451] ?? 0).toBe(0);
    expect(c[449] ?? 0).toBeGreaterThan(0);
    expect(c[452] ?? 0).toBeGreaterThan((c[449] ?? 0) * 2);     // ≈3:1
  });
});

describe('L6 spawn parity（节日史莱姆 NPC.cs:5637-5685）', () => {
  it('万圣节地表基础史莱姆 → 302（2/3 档），普通日恒无 302 且基础史莱姆照常', () => {
    const on = (() => {
      const f = grassWorld();
      const c = runBatch(f.w, f.sp, 520, { hour: 12, attempts: 2500, setup: (w2) => { w2.clock.halloween = true; } });
      return c;
    })();
    const slimesOn = bump(on, [302, -3, -7, 1]);
    expect(slimesOn).toBeGreaterThan(80);
    expect(on[302] ?? 0).toBeGreaterThan(0);
    const off = (() => {
      const f = grassWorld();
      return runBatch(f.w, f.sp, 520, { hour: 12, attempts: 2500 });
    })();
    expect(off[302] ?? 0).toBe(0);
    expect(bump(off, [-3, -7, 1])).toBeGreaterThan(40);
  });
});

describe('L6 spawn parity（lowTiles 批）', () => {
  it('spawnRate ÷2（NPC.cs:791-794，rateRng 钉死后逐值精确减半）', () => {
    const mk = (): World => new World(400, 600, 42, 'l6-rate');
    const normal = mk(), low = mk();
    low.skyblockLowTiles = true;
    const spN = new VanillaSpawner(normal);
    const spL = new VanillaSpawner(low);
    (spN as unknown as { rateRng: () => number }).rateRng = () => 0.75;
    (spL as unknown as { rateRng: () => number }).rateRng = () => 0.75;
    const args = [100 * 16, 0, false, 800, 100 * 16] as const;
    const rn = spN.getSpawnRate(...args);
    const rl = spL.getSpawnRate(...args);
    expect(rn.spawnRate).toBe(rl.spawnRate * 2);
    expect(rn.maxSpawns).toBe(rl.maxSpawns);
  });

  it('lowTiles 肉前地下稀有怪臂（NPC.cs:3726）：y>rockLayer 出 85/629；普通世界该臂为死支', () => {
    const runOne = (sb: boolean): Counts => {
      const f = grassWorld();
      f.w.skyblockLowTiles = sb;
      f.w.groundLevel = 300;
      f.w.rockLevel = 200;
      const st = f.w.store;
      for (let x = 380; x < 920; x++) st.setTileSilent(x, 350, 2);
      return runBatch(f.w, f.sp, 650, {
        hour: 12, attempts: 5000, py: 346,
      });
    };
    const off = runOne(false);
    expect((off[85] ?? 0) + (off[629] ?? 0)).toBe(0);
    const on = runOne(true);
    expect((on[85] ?? 0) + (on[629] ?? 0)).toBeGreaterThan(0);
  });

  it('洞穴 1/4 史莱姆臂 OR 门（NPC.cs:4990）：困难 lowTiles 世界恢复肉前史莱姆段', () => {
    const runOne = (sb: boolean): Counts => {
      const f = grassWorld();
      f.w.skyblockLowTiles = sb;
      f.w.groundLevel = 290;
      f.w.rockLevel = 280;
      f.w.flags.hardMode = true;
      const st = f.w.store;
      for (let x = 380; x < 920; x++) st.setTileSilent(x, 330, 2);
      return runBatch(f.w, f.sp, 500, { hour: 12, attempts: 2600, py: 326 });
    };
    const off = runOne(false);
    const on = runOne(true);
    expect(bump(on, [-10, -6, 184])).toBeGreaterThan(bump(off, [-10, -6, 184]));
  });
});

describe('L6 spawn parity（骷髅商影烛门 NPC.cs:5007-5010）', () => {
  function caveFix(): { w: World; sp: VanillaSpawner } {
    const f = grassWorld();
    f.w.groundLevel = 290;
    f.w.rockLevel = 280;
    const st = f.w.store;
    for (let x = 380; x < 920; x++) st.setTileSilent(x, 330, 2);
    return f;
  }
  it('ZoneShadowCandle 场骷髅商永不出；常规场可出', () => {
    const mkBatch = (candle: boolean): Counts => {
      const f = caveFix();
      // 参形（getSpawnRate 全参）：py n nearby water sHeight px peace sun calmed battle
      //                          town day evil blood SHADOW invis angler
      f.sp.getSpawnRate(326 * 16, 0, false, 800, 650 * 16,
        false, false, false, false, 0, true, false, false,
        candle, false, false);
      return runBatch(f.w, f.sp, 650, { hour: 12, attempts: 4000, py: 326 });
    };
    const cOff = mkBatch(true);
    expect(cOff[453] ?? 0).toBe(0);
    const cOn = mkBatch(false);
    expect(cOn[453] ?? 0).toBeGreaterThan(0);
  });
});

describe('L6 spawn parity（仙女近旁刷怪率 GetSpawnRate:745）', () => {
  it('fairyHelpfulActive → rate×1.2 / max×0.8（中性值下精确断言）', () => {
    const { w, sp } = grassWorld();
    (sp as unknown as { rateRng: () => number }).rateRng = () => 0.75;
    const args = [100 * 16, 0, false, 800, 100 * 16] as const;
    sp.getSpawnRate(...args);
    sp.fairyHelpfulActive = true;
    const withFairy = sp.getSpawnRate(...args);
    sp.fairyHelpfulActive = false;
    const base = sp.getSpawnRate(...args);
    expect(withFairy.spawnRate).toBe(Math.floor(base.spawnRate * 1.2));
    expect(withFairy.maxSpawns).toBe(Math.floor(base.maxSpawns * 0.8));
    void w;
  });
});

describe('L6 spawn parity（Palworld 双宠池 NPC.cs:4374-4389）', () => {  it('HasItem 强制档：持 5663 无 5664 → 池命中恒 696；无道具时 695 可现', () => {
    const f = grassWorld();
    const warm = runBatch(f.w, f.sp, 520, { hour: 12, attempts: 3000 });
    // 池必须先被证明活跃（无道具态出过任一变体）
    expect((warm[695] ?? 0) + (warm[696] ?? 0)).toBeGreaterThan(0);
    const forced = runBatch(f.w, f.sp, 520, {
      hour: 12, attempts: 3000,
      post: (sp) => {
        sp.palHas5663 = true;
        sp.palHas5664 = false;
      },
    });
    expect(forced[695] ?? 0).toBe(0);
    expect(forced[696] ?? 0).toBe((warm[695] ?? 0) + (warm[696] ?? 0));   // 同种子流逐掷对齐
  });
});

describe('L6 spawn parity（地下沙漠直接格判定 NPC.cs:1682/:5535）', () => {
  function deepFix(walls: boolean): { w: World; sp: VanillaSpawner } {
    const f = grassWorld();
    f.w.rockLevel = 280;
    f.w.groundLevel = 290;           // y=330 深落点 → checkUnderground 短路过
    const st = f.w.store;
    for (let x = 380; x < 920; x++) {
      st.setTileSilent(x, 330, 2);
      // 落脚格直踩 AllowsUndergroundDesertEnemiesToSpawn 墙集（187 沙岩系）
      if (walls) st.wall[st.idx(x, 330)] = 187;
      if (walls) st.wall[st.idx(x, 329)] = 187;
    }
    return f;
  }
  it('落脚格/上格墙 ∈ 沙漠墙集 → 地下沙漠池受理；无墙同布局该臂零产出', () => {
    const runOne = (walls: boolean): Counts => {
      const f = deepFix(walls);
      return runBatch(f.w, f.sp, 650, { hour: 12, attempts: 4000, py: 326 });
    };
    const bare = runOne(false);
    expect(bump(bare, [69, 580, 581, 508, 509, 537])).toBe(0);
    const walled = runOne(true);
    expect(bump(walled, [69, 580, 581, 508, 509, 537])).toBeGreaterThan(0);
  });
});

describe('L6 spawn parity（节日家族补接：万圣眼球/僵尸族/洞穴幽魂）', () => {
  it('万圣夜地表：眼球变异 317|318（眼球簇内）、僵尸族 319-321、乌鸦 301/南瓜跳跳 304 单边门', () => {
    const f = grassWorld();
    const c = runBatch(f.w, f.sp, 520, {
      night: true, attempts: 6000,
      setup: (w2) => {
        w2.clock.halloween = true;
        w2.clock.moonPhase = 4;            // 满月 → 眼球簇 1/2 进入率
      },
    });
    expect((c[317] ?? 0) + (c[318] ?? 0)).toBeGreaterThan(0);
    expect((c[319] ?? 0) + (c[320] ?? 0) + (c[321] ?? 0)).toBeGreaterThan(0);
    // 乌鸦 301 万圣节单边门：墓地外照常可出
    expect(c[301] ?? 0).toBeGreaterThan(0);
  });

  it('万圣洞穴主池：幽魂 322|323|324 可出（Next(322,325)）', () => {
    const f = grassWorld();
    const st = f.w.store;
    for (let x = 380; x < 920; x++) st.setTileSilent(x, 330, 2);
    const c = runBatch(f.w, f.sp, 650, {
      hour: 12, attempts: 5000, py: 326,
      setup: (w2) => { w2.clock.halloween = true; },
    });
    expect((c[322] ?? 0) + (c[323] ?? 0) + (c[324] ?? 0)).toBeGreaterThan(0);
  });
});
