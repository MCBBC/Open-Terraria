// 困难模式链普查五小修批（2026-08-13）回归：
//   ① 祭坛矿脉双掷（WorldGen.cs:49095/49099：OreRunner strength/steps 各独立
//     genRand.Next(5,10)——旧实现单 r 同传两用,粗细/步数锁死相关）
//   ③ 演化速率接 dayRate 链（Main.cs:6290 desiredWorldTilesUpdateRate + WorldGen.cs
//     72056 GetWorldUpdateRate：全员熟睡 ×5 / FreezeTime 0 / 快进恒 1）
//   ④⑤ Convert 火把链（Convert_ActuallyConvertTorch cs:56296 + TileID.cs:42-74）
//     与 case 5/6/7/10/12/13 补全（cs:55391/55437/55474/55749/55892/55932）。
//     case 0（纯净化,含蘑菇火把 22→21 特判 cs:56304）与 case 14-21 仍登记未移植——
//     torchConvertible 的 case 0 分支为其预置
//   ②（机械召唤物 hardMode 门删除）走浏览器探针 scripts/_mech-summon-probe.mjs——
//     Game 物品使用链无单测缝,此处不覆盖
import { describe, it, expect, vi } from 'vitest';
import { Game } from '../src/core/Game';
import { RNG } from '../src/core/rng';
import { World } from '../src/world/World';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import type { TileStore } from '../src/world/TileStore';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';

/** sheet → 内部 id（与 WorldEvolution.SID 同语义:首个匹配） */
const S = (sheet: number): number => TILE_DEFS.findIndex((t) => t?.vanilla?.sheet === sheet);
const sheetOf = (id: number): number => TILE_DEFS[id]?.vanilla?.sheet ?? -1;

// ---------------------------------------------------------------------------
// ① 祭坛矿脉双掷分布（Game.altarOreVeinRoll）
// ---------------------------------------------------------------------------
describe('祭坛矿脉 OreRunner 双掷（WorldGen.cs:49095/49099）', () => {
  it('strength/steps 落 [5,9] 且两掷独立（相等率 ≈ 1/5 而非 1）', () => {
    const rng = new RNG(20260813);
    const N = 20000;
    let eq = 0;
    const histS = new Map<number, number>();
    let min = 99, max = -1;
    for (let k = 0; k < N; k++) {
      const v = Game.altarOreVeinRoll(rng);
      expect(v.strength).toBeGreaterThanOrEqual(5);
      expect(v.strength).toBeLessThanOrEqual(9);
      expect(v.steps).toBeGreaterThanOrEqual(5);
      expect(v.steps).toBeLessThanOrEqual(9);
      min = Math.min(min, v.strength, v.steps);
      max = Math.max(max, v.strength, v.steps);
      if (v.strength === v.steps) eq++;
      histS.set(v.strength, (histS.get(v.strength) ?? 0) + 1);
    }
    // 旧实现（单 r 同传）此处恒 1.0——独立两掷应收敛到 1/5
    expect(eq / N).toBeGreaterThan(0.15);
    expect(eq / N).toBeLessThan(0.25);
    // 边际均匀：5 档各 ≈ 1/5
    for (const v of [5, 6, 7, 8, 9]) {
      expect((histS.get(v) ?? 0) / N).toBeGreaterThan(0.15);
    }
    expect(min).toBe(5);
    expect(max).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// ③ 演化速率随 dayRate 链（worldUpdateRate 宿主字段）
// ---------------------------------------------------------------------------
describe('WorldEvolution worldUpdateRate（Main.cs:6290 + GetWorldUpdateRate）', () => {
  function rateWorld(rate: number | undefined) {
    const w = new World(1000, 400, 11, 'evo-rate');
    const host: EvolutionHost = {
      store: w.store, worldSurface: 200, rockLevel: 300, dungeonX: 0, difficulty: 0,
      flags: w.flags, crimson: false, isDay: true, raining: false,
      maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    };
    if (rate !== undefined) host.worldUpdateRate = rate;
    return new WorldEvolution(host);
  }
  type EvoSpy = { overgroundTile: (i: number, j: number, wallDist: number) => void; update: () => void };

  function sampleCount(rate: number | undefined): number {
    const evo = rateWorld(rate) as unknown as EvoSpy;
    const spy = vi.spyOn(evo, 'overgroundTile').mockImplementation(() => {});
    const rnd = vi.spyOn(RNG.prototype, 'next').mockReturnValue(0);
    try { evo.update(); } finally { rnd.mockRestore(); }
    const n = spy.mock.calls.length;
    spy.mockRestore();
    return n;
  }

  it('缺省 rate=1：地表样本 = w×h×3e-5（1000×400 → 12）', () => {
    expect(sampleCount(undefined)).toBe(12);
  });
  it('全员熟睡 ×5（dayRate=5）：样本 ×5 → 60', () => {
    expect(sampleCount(5)).toBe(60);
  });
  it('FreezeTime rate=0：UpdateWorld 整体跳过（cs:71547）→ 0 样本', () => {
    expect(sampleCount(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ④⑤ Convert 火把链 + case 5/6/7/10/12/13
// ---------------------------------------------------------------------------
describe('Convert 火把转换（Convert_ActuallyConvertTorch cs:56296 + TileID.cs:42-74）', () => {
  const TORCH = TILE_BY_KEY['torch']!;
  function torchWorld(style: number, frameX = 22) {
    const w = new World(40, 40, 13, 'evo-torch');
    const st = w.store;
    st.setTile(20, 20, TORCH, frameX, style * 22);
    const host: EvolutionHost = {
      store: st, worldSurface: 20, rockLevel: 30, dungeonX: 0, difficulty: 0,
      flags: w.flags, crimson: false, isDay: true, raining: false,
      maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    };
    return { w, st, evo: new WorldEvolution(host) };
  }
  const styleAt = (st: TileStore, x = 20, y = 20) =>
    Math.floor(st.frameY[st.idx(x, y)] / 22);

  it('case 11 净化粉：腐化火把(18) → 普通(0)，锚帧 frameX 保留（cs:55867）', () => {
    const { st, evo } = torchWorld(18);
    evo.convert(20, 20, 11);
    expect(styleAt(st)).toBe(0);
    expect(st.frameX[st.idx(20, 20)]).toBe(22);
  });
  it('case 11：神圣(20)/猩红(19) 火把同样归 0；普通(0) 与蘑菇(22) 不可转（TileID.cs:48-57）', () => {
    for (const s of [19, 20]) {
      const { st, evo } = torchWorld(s);
      evo.convert(20, 20, 11);
      expect(styleAt(st)).toBe(0);
    }
    for (const s of [0, 22]) {
      const { st, evo } = torchWorld(s);
      evo.convert(20, 20, 11);
      expect(styleAt(st)).toBe(s);
    }
  });
  it('case 1/2/3/4：火把随群系转（18 腐化/20 神圣/22 蘑菇/19 猩红，cs:55328/55245/55374/55167）', () => {
    for (const [conv, want] of [[1, 18], [2, 20], [3, 22], [4, 19]] as const) {
      const { st, evo } = torchWorld(0);
      evo.convert(20, 20, conv);
      expect(styleAt(st)).toBe(want);
    }
  });
  it('case 5/6/12/13：沙漠(16)/冰(9)/腐化(18)/猩红(19) 火把', () => {
    for (const [conv, want] of [[5, 16], [6, 9], [12, 18], [13, 19]] as const) {
      const { st, evo } = torchWorld(0);
      evo.convert(20, 20, conv);
      expect(styleAt(st)).toBe(want);
    }
  });
  it('同格重转幂等：已是目标样式的火把不再写（cs:56309 num != newStyle 门）', () => {
    const { st, evo } = torchWorld(18);
    evo.convert(20, 20, 1);
    expect(styleAt(st)).toBe(18);
  });
});

describe('Convert case 5/6/7/10/12/13 补全（cs:55391/55437/55474/55749/55892/55932）', () => {
  function convWorld(place: (st: TileStore) => void) {
    const w = new World(40, 40, 17, 'evo-conv');
    const st = w.store;
    place(st);
    const host: EvolutionHost = {
      store: st, worldSurface: 20, rockLevel: 30, dungeonX: 0, difficulty: 0,
      flags: w.flags, crimson: false, isDay: true, raining: false,
      maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    };
    return { w, st, evo: new WorldEvolution(host) };
  }
  const sheetAt = (st: TileStore, x: number, y: number) => {
    const i = st.idx(x, y);
    return st.flags[i] ? sheetOf(st.type[i]) : -1;
  };

  it('case 5 沙化：草→沙(下方空→硬化沙397)、石→沙岩396、刺→摧毁、墙 石1→187/泥2→216', () => {
    const { st, evo } = convWorld((s) => {
      s.setTile(10, 10, S(2));            // 草,下方空 → 硬化沙
      s.setTile(11, 10, S(2)); s.setTile(11, 11, S(1));   // 草,下方石 → 沙
      s.setTile(12, 10, S(1));            // 石 → 沙岩
      s.setTile(13, 10, S(32));           // 腐化刺 → 摧毁
      s.setWall(14, 10, 1);               // 石墙 → 沙墙
      s.setWall(15, 10, 2);               // 泥墙 → 硬化沙墙
    });
    evo.convert(10, 10, 5);
    evo.convert(11, 10, 5);
    evo.convert(12, 10, 5);
    evo.convert(13, 10, 5);
    evo.convert(14, 10, 5);
    evo.convert(15, 10, 5);
    expect(sheetAt(st, 10, 10)).toBe(397);
    expect(sheetAt(st, 11, 10)).toBe(53);
    expect(sheetAt(st, 12, 10)).toBe(396);
    expect(sheetAt(st, 13, 10)).toBe(-1);
    expect(st.wall[st.idx(14, 10)]).toBe(187);
    expect(st.wall[st.idx(15, 10)]).toBe(216);
  });

  it('case 6 雪化：草→雪147、石→冰161、墙 石1→71/泥2→40', () => {
    const { st, evo } = convWorld((s) => {
      s.setTile(10, 10, S(2));
      s.setTile(11, 10, S(1));
      s.setWall(12, 10, 1);
      s.setWall(13, 10, 2);
    });
    evo.convert(10, 10, 6);
    evo.convert(11, 10, 6);
    evo.convert(12, 10, 6);
    evo.convert(13, 10, 6);
    expect(sheetAt(st, 10, 10)).toBe(147);
    expect(sheetAt(st, 11, 10)).toBe(161);
    expect(st.wall[st.idx(12, 10)]).toBe(71);
    expect(st.wall[st.idx(13, 10)]).toBe(40);
  });

  it('case 7 纯净化：黑檀石→石1、沙53 露天→草2、腐化墙3→石墙349、神圣火把→0', () => {
    const { st, evo } = convWorld((s) => {
      s.setTile(10, 10, S(25));           // 黑檀石 → 石
      s.setTile(11, 10, S(53));           // 露天沙 → 草
      s.setWall(12, 10, 3);               // 腐化墙 → 石墙
      s.setTile(13, 10, TILE_BY_KEY['torch']!, 0, 20 * 22);  // 神圣火把 → 普通
    });
    evo.convert(10, 10, 7);
    evo.convert(11, 10, 7);
    evo.convert(12, 10, 7);
    evo.convert(13, 10, 7);
    expect(sheetAt(st, 10, 10)).toBe(1);
    expect(sheetAt(st, 11, 10)).toBe(2);
    expect(st.wall[st.idx(12, 10)]).toBe(349);
    expect(Math.floor(st.frameY[st.idx(13, 10)] / 22)).toBe(0);
  });

  it('case 10 邪恶退化 tiles-only：腐化草→丛林草60、黑檀石→石1、黑檀沙→沙53、刺→摧毁', () => {
    const { st, evo } = convWorld((s) => {
      s.setTile(10, 10, S(23));
      s.setTile(11, 10, S(25));
      s.setTile(12, 10, S(112));
      s.setTile(13, 10, S(32));
      s.setWall(14, 10, 69);              // 墙分支不存在（case 10 无 walls 半区）
    });
    for (const x of [10, 11, 12, 13, 14]) evo.convert(x, 10, 10);
    expect(sheetAt(st, 10, 10)).toBe(60);
    expect(sheetAt(st, 11, 10)).toBe(1);
    expect(sheetAt(st, 12, 10)).toBe(53);
    expect(sheetAt(st, 13, 10)).toBe(-1);
    expect(st.wall[st.idx(14, 10)]).toBe(69);
  });

  it('case 12/13 满转：任意墙→腐化3/猩红83、泥土0→黑檀石25/猩红石203、重要帧物豁免', () => {
    const { st, evo } = convWorld((s) => {
      s.setWall(10, 10, 1);               // 石墙 → 腐化墙 3
      s.setTile(10, 10, S(0));            // 泥土 → 黑檀石
      s.setWall(11, 10, 5);               // 灰砖墙 → 猩红墙 83
      s.setTile(11, 10, S(0));            // 泥土 → 猩红石
      s.setTile(12, 10, TILE_BY_KEY['chest']!, 0, 0);  // 重要帧物（宝箱）→ 豁免
      s.setWall(12, 10, 4);
    });
    evo.convert(10, 10, 12);
    evo.convert(11, 10, 13);
    evo.convert(12, 10, 12);
    expect(st.wall[st.idx(10, 10)]).toBe(3);
    expect(sheetAt(st, 10, 10)).toBe(25);
    expect(st.wall[st.idx(11, 10)]).toBe(83);
    expect(sheetAt(st, 11, 10)).toBe(203);
    expect(sheetAt(st, 12, 10)).toBe(21);   // 宝箱原样
    expect(st.wall[st.idx(12, 10)]).toBe(3); // 墙照转（满转无墙豁免）
  });
});

// ---------------------------------------------------------------------------
// ①b 锁矿首掷极性（Game.altarOreTierPick,WorldGen.cs:49385-49392/:49419-49426/
//   :49451-49458）+ 矿脉条数 ceil（Game.altarVeinCount,:49473 `(double)k < num3`）
//   ——2026-09-03 对齐批：此前 ===0→base 反极性 / Math.floor 恒少 1 条
// ---------------------------------------------------------------------------
describe('锁矿首掷极性（SavedOreTiers,WorldGen.cs:49385-49392 同构直译）', () => {
  const rngReturning = (v: number) => ({ int: () => v }) as unknown as RNG;

  it('掷 0 → 替代矿(alt)：107→221 / 108→222 / 111→223（反极性旧码给 base）', () => {
    expect(Game.altarOreTierPick(rngReturning(0), 107, 221)).toBe(221);
    expect(Game.altarOreTierPick(rngReturning(0), 108, 222)).toBe(222);
    expect(Game.altarOreTierPick(rngReturning(0), 111, 223)).toBe(223);
  });

  it('掷 1 → 常规矿(base)：107/108/111', () => {
    expect(Game.altarOreTierPick(rngReturning(1), 107, 221)).toBe(107);
    expect(Game.altarOreTierPick(rngReturning(1), 108, 222)).toBe(108);
    expect(Game.altarOreTierPick(rngReturning(1), 111, 223)).toBe(111);
  });

  it('真流只耗一掷：帮手消费后与裸 Next(2) 流同相（无隐藏额外掷）', () => {
    const a = new RNG(20260903);
    const b = new RNG(20260903);
    const first = a.int(0, 1);                       // 裸流首掷
    expect(Game.altarOreTierPick(b, 107, 221)).toBe(first === 0 ? 221 : 107);
    expect(a.int(0, 1)).toBe(b.int(0, 1));           // 次掷仍同相
  });
});

describe('祭坛矿脉条数 ceil 语义（WorldGen.cs:49473 `for (k=0; (double)k < num3; k++)`）', () => {
  /** 原版循环直译计数：k 从 0 起满足 k < x 的条数 */
  const vanillaCount = (x: number) => { let k = 0; while (k < 4096 && k < x) k++; return k; };
  /** 我方消费式：cap=altarVeinCount(x) 后 `for (k=0; k<cap; k++)` 实跑条数 */
  const oursCount = (x: number) => {
    const cap = Game.altarVeinCount(x);
    let n = 0;
    for (let k = 0; k < cap; k++) n++;
    return n;
  };

  it('veins=3.0 → 3 条（ceil(3.0)=3,整数档与 floor 无差）', () => {
    expect(Game.altarVeinCount(3.0)).toBe(3);
  });
  it('veins=3.5 → 4 条（floor 给 3 恒少 1 条）', () => {
    expect(Game.altarVeinCount(3.5)).toBe(4);
  });
  it('与原版循环逐点等价（x ∈ [-1, 8] 步长 0.25 全枚举）', () => {
    for (let x = -1; x <= 8.0001; x += 0.25) {
      expect(oursCount(x)).toBe(vanillaCount(x));
    }
  });
});
