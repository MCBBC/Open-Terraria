// 数据移交四件回归（2026-09-08 掉落对账移交批,蓝队实施锁）：
//   ① v_693 钟乳石回声并表——693/694 共用 echoResourceDropVid 十三带
//      （CheckStalactiteEcho 1457 :39267 → GetStalactiteEchoDrop :39314-39370;
//        直挖面 KillTile_GetItemDrops case 693 :65560-65562 同函数同 style=fx/18 :39273）
//   ② v_649/v_650 回声碎堆逐带——649 Check2x1 case 649（:47677-47770,s=fx/36+fy/18*53）
//      / 650 KillTile case 650（:65868-65948,num=fx/18）
//   ③ v_707 书档——KillTile case 707（:66183-66193）fx==90→165 WaterBolt(noPrefix
//      :66187)/否则 149 Book（styleDropVidOfFrames 特例,与 sheet 50 同式）
//   ④ 571 竹 stack——KillTile case 571（:64903-64906）dropItemStack=genRand.Next(1,3)
//      （:64905,1-2 根）→ killTileDropItems 竹支;def.drop 退位 null + place_v_ 回收压门
// 反伪影纪律:全部期望值逐带对照 1457 反编译原文转录,行号锚见各 describe 头注。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { Game, NO_RETURN_RECYCLE_SHEETS, TILE_CUT } from '../src/core/Game';
import {
  echoResourceDropVid, ECHO_RESOURCE_SHEETS, styleDropVidOfFrames,
} from '../src/data/vanillaStyleDrops';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

afterEach(() => {
  vi.restoreAllMocks();
});

interface Drop { key: string; n: number; x: number; y: number }

/** breakTile 裸架 harness（leftover-wiring-drops dropShell 同款） */
function breakShell(w: World, drops: Drop[]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    breakTile: (x: number, y: number, byPlayer?: boolean) => void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.spawnParticles = () => {};
  g.sfx = { play: () => {} };
  g.spawnDrop = (x: number, y: number, key: string, n: number) => {
    drops.push({ key, n, x, y });
    return null;
  };
  g.recLog = () => {};
  g.dumpChest = () => {};
  g.entities = { add: () => {}, drops: [], critters: [], enemies: [] };
  g.trackTile = 0;
  g.player = { equipStats: {}, cx: 0, cy: 0 };
  return g as unknown as {
    breakTile: (x: number, y: number, byPlayer?: boolean) => void;
    checkFurnitureSupport: (x: number, y: number) => void;
    checkDecorSupport: (x: number, y: number, def: object, sheet: number, kind: string) => void;
  };
}

/** killTileDropItems 裸架 harness（tile-drop-p1x3 shell 同款） */
function dropItemsShell(w: World, drops: Drop[]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    killTileDropItems: (x: number, y: number, def?: { vanilla?: { sheet?: number } }) => void;
  };
  g.world = w;
  g.spawnDrop = (x: number, y: number, key: string, n: number) => {
    drops.push({ key, n, x, y });
    return null;
  };
  g.player = { equipStats: {} };
  return g as unknown as {
    killTileDropItems: (x: number, y: number, def?: { vanilla?: { sheet?: number } }) => void;
  };
}

const byKey = (k: string) => TILE_DEFS.find((d) => d.key === k)!;

describe('① v_693 钟乳石回声并表（GetStalactiteEchoDrop 1457 :39314-39370 十三带,style=fx/18）', () => {
  // 逐带表（:39317-39368 if/else-if 链照录）:带界→vid
  const BANDS: Array<[number, number]> = [
    [0, 664], [2, 664], [3, 3], [5, 3], [6, 150], [8, 150], [9, 1124], [11, 1124],
    [12, 409], [14, 409], [15, 61], [17, 61], [18, 836], [20, 836], [21, 3271],
    [23, 3271], [24, 3086], [26, 3086], [27, 3081], [29, 3081], [30, 834], [32, 834],
    [33, 833], [35, 833], [36, 835], [38, 835],
  ];

  it('echoResourceDropVid case 693 十三带逐带全通（693/694 同表）', () => {
    for (const [s, vid] of BANDS) {
      expect(echoResourceDropVid(693, s * 18, 0), `s=${s}`).toBe(vid);
      expect(echoResourceDropVid(694, s * 18, 0), `694 s=${s}`).toBe(vid);   // 同表
    }
    expect(echoResourceDropVid(693, 39 * 18, 0)).toBe(0);   // ≥39 result=0 不发（:39369）
    expect(echoResourceDropVid(693, 45 * 18, 0)).toBe(0);
  });

  it('1×1 直挖通道对拍：styleDropVidOfFrames(693) ≡ echoResourceDropVid(693)（Echo 门）', () => {
    for (const [s, vid] of BANDS) {
      expect(styleDropVidOfFrames(693, s * 18, 0), `s=${s}`).toBe(vid);
    }
    expect(styleDropVidOfFrames(693, 40 * 18, 0)).toBe(0);   // 帧外 0 → def.drop 664 兜底
  });

  it('ECHO_RESOURCE_SHEETS 含 693（失撑链/object 支同表两路同源）', () => {
    expect(ECHO_RESOURCE_SHEETS.has(693)).toBe(true);
    expect(ECHO_RESOURCE_SHEETS.has(694)).toBe(true);
  });

  it('运行时 breakTile：1×1 直挖按带发（fx=0→664 冰 / fx=54→3 石）且仅一件', () => {
    for (const [fx, vid] of [[0, 664], [54, 3]] as const) {
      const w = new World(40, 40, 7, 't');
      const drops: Drop[] = [];
      const g = breakShell(w, drops);
      w.store.setTileSilent(10, 10, TILE_BY_KEY['v_693_mitey_titey']!, fx, 0);
      g.breakTile(10, 10);
      expect(drops.length, `fx=${fx}`).toBe(1);
      expect(drops[0]!.key).toBe(VANILLA_ITEM_KEY_BY_ID[vid]);
      expect(drops[0]!.n).toBe(1);   // 原版无 stack 掷（dropItemStack 恒 1）
    }
  });

  it('def.drop=664 pin 保持（golden COND_PIN_BASE 锚;帧外 C-4 兜底）', () => {
    expect(byKey('v_693_mitey_titey').drop).toBe(664);
  });
});

describe('② v_649 中碎砾 2×1（Check2x1 case 649 :47677-47770,s=fx/36+fy/18*53）', () => {
  const BANDS: Array<[number, number]> = [
    [0, 3], [5, 3], [6, 154], [15, 154], [16, 71], [17, 72], [18, 73], [19, 181],
    [20, 180], [21, 177], [22, 179], [23, 178], [24, 182], [25, 593], [30, 593],
    [31, 9], [33, 9], [34, 150], [37, 150], [38, 3], [40, 3], [41, 3271], [46, 3271],
    [47, 3086], [52, 3086], [53, 3081], [58, 3081], [59, 62], [61, 62],
    [62, 169], [63, 169], [64, 276], [65, 169], [67, 169],
  ];

  it('echoResourceDropVid case 649 逐带全通（53 列网格+行乘）', () => {
    for (const [s, vid] of BANDS) {
      expect(echoResourceDropVid(649, s * 36, 0), `s=${s}`).toBe(vid);
    }
    // 行乘:num4=fy/18（Check2x1 :47394）→ s+=53/行（fx=0,fy=18 → s=53 → 3081）
    expect(echoResourceDropVid(649, 0, 18)).toBe(3081);
    expect(echoResourceDropVid(649, 0, 36)).toBe(0);          // s=106 ≥68 不发（:47765 门）
    // 右列同档:num3=(frameX/18)>>1（:47392）→ fx=36s+18 与 36s 同带
    expect(echoResourceDropVid(649, 18, 0)).toBe(3);
    expect(echoResourceDropVid(649, 25 * 36 + 18, 0)).toBe(593);   // s=25 右列 918
    expect(echoResourceDropVid(649, 68 * 36, 0)).toBe(0);          // ≥68
  });

  it('object 支通道对拍：styleDropVidOfFrames(649) ≡ echoResourceDropVid(649)', () => {
    for (const [s, vid] of BANDS) {
      expect(styleDropVidOfFrames(649, s * 36, 0), `s=${s}`).toBe(vid);
    }
  });

  it('运行时 breakTile（2×1 object 支）：style25 → 593 且整件仅一件', () => {
    const w = new World(40, 40, 7, 't');
    const drops: Drop[] = [];
    const g = breakShell(w, drops);
    const t = TILE_BY_KEY['v_649_medium_rubble_2x1']!;
    w.store.setTileSilent(10, 10, t, 25 * 36, 0);
    w.store.setTileSilent(11, 10, t, 25 * 36 + 18, 0);
    g.breakTile(11, 10);   // 打右列（帧反推同带:918/36=25）
    expect(drops.length).toBe(1);
    expect(drops[0]!.key).toBe(VANILLA_ITEM_KEY_BY_ID[593]);
  });

  it('def.drop=3 pin 保持（golden ANCHOR_DROPS 锚）', () => {
    expect(byKey('v_649_medium_rubble_2x1').drop).toBe(3);
  });
});

describe('③ v_650 小碎砾 1×1（KillTile case 650 :65868-65948,num=fx/18）', () => {
  const BANDS: Array<[number, number]> = [
    [0, 3], [5, 3], [6, 2], [11, 2], [12, 154], [19, 154], [20, 154], [27, 154],
    [28, 9], [35, 9], [36, 593], [41, 593], [42, 664], [47, 664], [48, 150],
    [53, 150], [54, 3271], [59, 3271], [60, 3086], [65, 3086], [66, 3081],
    [71, 3081], [72, 62],
  ];

  it('echoResourceDropVid case 650 逐带全通（<20/<28 两支同掉 154 合并;75/77=276 特例）', () => {
    for (const [s, vid] of BANDS) {
      expect(echoResourceDropVid(650, s * 18, 0), `s=${s}`).toBe(vid);
    }
    // 尾 switch（:65930-65947）:73/74/76/78/79/80/81→169,75/77→276,≥82 不发
    expect(echoResourceDropVid(650, 73 * 18, 0)).toBe(169);
    expect(echoResourceDropVid(650, 74 * 18, 0)).toBe(169);
    expect(echoResourceDropVid(650, 75 * 18, 0)).toBe(276);
    expect(echoResourceDropVid(650, 76 * 18, 0)).toBe(169);
    expect(echoResourceDropVid(650, 77 * 18, 0)).toBe(276);
    expect(echoResourceDropVid(650, 78 * 18, 0)).toBe(169);
    expect(echoResourceDropVid(650, 81 * 18, 0)).toBe(169);
    expect(echoResourceDropVid(650, 82 * 18, 0)).toBe(0);
  });

  it('1×1 直挖通道对拍：styleDropVidOfFrames(650) ≡ echoResourceDropVid(650)', () => {
    for (const [s, vid] of BANDS) {
      expect(styleDropVidOfFrames(650, s * 18, 0), `s=${s}`).toBe(vid);
    }
    expect(styleDropVidOfFrames(650, 75 * 18, 0)).toBe(276);
  });

  it('运行时 breakTile：1×1 直挖按带发（fx=0→3 石 / fx=108→2 泥）且仅一件', () => {
    for (const [fx, vid] of [[0, 3], [108, 2]] as const) {
      const w = new World(40, 40, 7, 't');
      const drops: Drop[] = [];
      const g = breakShell(w, drops);
      w.store.setTileSilent(10, 10, TILE_BY_KEY['v_650_small_rubble_1x1']!, fx, 0);
      g.breakTile(10, 10);
      expect(drops.length, `fx=${fx}`).toBe(1);
      expect(drops[0]!.key).toBe(VANILLA_ITEM_KEY_BY_ID[vid]);
    }
  });

  it('def.drop=3 pin 保持（golden COND_PIN_BASE 锚）', () => {
    expect(byKey('v_650_small_rubble_1x1').drop).toBe(3);
  });
});

describe('④ v_707 书档（KillTile case 707 :66183-66193,fx==90→165/否则 149）', () => {
  it('styleDropVidOfFrames 特例：fx==90 → 165 WaterBolt,其余帧 → 149 Book', () => {
    expect(styleDropVidOfFrames(707, 90, 0)).toBe(165);
    expect(styleDropVidOfFrames(707, 90, 18)).toBe(165);   // fx 判据与 fy 无关
    expect(styleDropVidOfFrames(707, 0, 0)).toBe(149);
    expect(styleDropVidOfFrames(707, 18, 0)).toBe(149);
    expect(styleDropVidOfFrames(707, 89, 0)).toBe(149);
    expect(styleDropVidOfFrames(707, 108, 0)).toBe(149);   // 90 邻域外恒 149
  });

  it('运行时 breakTile：水书伪装帧掉 165,常规书掉 149', () => {
    for (const [fx, vid] of [[90, 165], [0, 149]] as const) {
      const w = new World(40, 40, 7, 't');
      const drops: Drop[] = [];
      const g = breakShell(w, drops);
      w.store.setTileSilent(10, 10, TILE_BY_KEY['v_707_books_echo']!, fx, 0);
      g.breakTile(10, 10);
      expect(drops.length, `fx=${fx}`).toBe(1);
      expect(drops[0]!.key).toBe(VANILLA_ITEM_KEY_BY_ID[vid]);
    }
  });

  it('def.drop=149 pin 保持（golden COND_PIN_BASE 锚）', () => {
    expect(byKey('v_707_books_echo').drop).toBe(149);
  });
});

describe('⑤ 571 竹 stack（KillTile case 571 :64903-64906,dropItemStack=Next(1,3)）', () => {
  it('killTileDropItems 竹支：4564×Next(1,3) 掷边界（<0.5→1 / ≥0.5→2）', () => {
    const w = new World(40, 40, 7, 't');
    const drops: Drop[] = [];
    const g = dropItemsShell(w, drops);
    const def = byKey('v_571_bamboo');
    w.store.setTileSilent(10, 10, TILE_BY_KEY['v_571_bamboo']!);
    // 掷序:1+floor(r*2)——r∈[0,0.5)→1 / [0.5,1)→2（边界 0.5 归 2,上开区间离散化）
    for (const [r, n] of [[0.0, 1], [0.49999, 1], [0.5, 2], [0.99999, 2]] as const) {
      const before = drops.length;
      vi.spyOn(Math, 'random').mockReturnValueOnce(r);
      g.killTileDropItems(10, 10, def);
      expect(drops.length, `r=${r}`).toBe(before + 1);
      expect(drops[before]!.key).toBe(VANILLA_ITEM_KEY_BY_ID[4564]);
      expect(drops[before]!.n, `r=${r}`).toBe(n);
    }
  });

  it('统计批（mulberry32 固定 seed×600）：stack 1/2 各半（Next(1,3) 离散均匀）', () => {
    const w = new World(40, 40, 7, 't');
    const drops: Drop[] = [];
    const g = dropItemsShell(w, drops);
    const def = byKey('v_571_bamboo');
    w.store.setTileSilent(10, 10, TILE_BY_KEY['v_571_bamboo']!);
    const seed = (s: number) => () => {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    vi.spyOn(Math, 'random').mockImplementation(seed(20260908));
    const N = 600;
    for (let i = 0; i < N; i++) g.killTileDropItems(10, 10, def);
    expect(drops.length).toBe(N);   // 恒掉（无掷败支）
    const ones = drops.filter((d) => d.n === 1).length;
    const twos = drops.filter((d) => d.n === 2).length;
    expect(ones + twos).toBe(N);
    // p=0.5,n=600:μ=300,σ≈8.66 → ±7σ 带宽防 flake（mulberry32 播种流确定性通过）
    expect(ones).toBeGreaterThan(230);
    expect(ones).toBeLessThan(370);
  });

  it('双掉防御面：def.drop=null + place_v_ 回收压门 + 非 TILE_CUT（1×1 尾段静默）', () => {
    const def = byKey('v_571_bamboo');
    expect(def.drop).toBeNull();                                  // 尾段 def.drop 支不触发
    expect(NO_RETURN_RECYCLE_SHEETS.has(571)).toBe(true);         // place_v_ 回收支压门
    expect(styleDropVidOfFrames(571, 0, 0)).toBe(0);              // 尾段 sv 支不触发
    const bambooId = TILE_BY_KEY['v_571_bamboo']!;
    expect(TILE_CUT.has(bambooId)).toBe(false);                   // tileCut 支不吞（原版非 tileCut）
  });

  it('运行时 breakTile 端到端：竹破坏恰一件 4564,stack∈{1,2}（无 place_v_ 伪物品混入）', () => {
    for (const r of [0.49, 0.99]) {
      const w = new World(40, 40, 7, 't');
      const drops: Drop[] = [];
      const g = breakShell(w, drops);
      w.store.setTileSilent(10, 10, TILE_BY_KEY['v_571_bamboo']!);
      vi.spyOn(Math, 'random').mockReturnValue(r);
      g.breakTile(10, 10);
      expect(drops.length, `r=${r}`).toBe(1);
      expect(drops[0]!.key).toBe(VANILLA_ITEM_KEY_BY_ID[4564]);
      expect(drops[0]!.key.startsWith('place_')).toBe(false);
      expect(drops[0]!.n, `r=${r}`).toBe(r === 0.49 ? 1 : 2);
    }
  });
});

describe('⑥ 707/78 支撑门（CheckOnTable1x1 1457 :43899-43932/1456 :43548 1:1,派发 :86893）', () => {
  const BOOK = TILE_BY_KEY['v_707_books_echo']!;
  const DIRT = TILE_BY_KEY['dirt']!;
  const PLATFORM = TILE_BY_KEY['platform']!;
  const WORKBENCH = TILE_BY_KEY['workbench']!;   // sheet 18 ∈ Main.tileTable（:8173）
  /** 78 陶盆仓内无 def（ClayPot 未实现=注册休眠）——以合成 def 直入 'ontable'
   *  case 测其 78 地面特支臂（与派发器同入口,见 Game.ts DECOR_SUPPORT_KIND 注） */
  const POT78 = { key: 'v_78_pot', name: '', solid: false, framed: true, w: 1, h: 1, mapColor: '#000', drop: null, vanilla: { sheet: 78 } };

  it('707 桌面上存活（tileTable 臂 :43925;workbench=桌面集）', () => {
    const w = new World(40, 40, 7, 't');
    const drops: Drop[] = [];
    const g = breakShell(w, drops);
    w.store.setTileSilent(10, 9, BOOK, 0, 0);
    w.store.setTileSilent(10, 10, WORKBENCH, 0, 0);
    g.checkFurnitureSupport(10, 9);
    expect(drops.length).toBe(0);
    expect(w.store.get(10, 9)).toBe(BOOK);   // 存活
  });

  it('707 落地面被杀（原版本支除 78 外只认桌面——曾家具近似=落地不塌）', () => {
    const w = new World(40, 40, 7, 't');
    const drops: Drop[] = [];
    const g = breakShell(w, drops);
    w.store.setTileSilent(10, 9, BOOK, 90, 0);   // 水书伪装帧
    w.store.setTileSilent(10, 10, DIRT);
    g.checkFurnitureSupport(10, 9);
    expect(drops.length).toBe(1);
    expect(drops[0]!.key).toBe(VANILLA_ITEM_KEY_BY_ID[165]);   // 帧表随杀发放
    expect(w.store.get(10, 9)).not.toBe(BOOK);
  });

  it('707 悬空被杀（:43935 else 杀）且掉 149', () => {
    const w = new World(40, 40, 7, 't');
    const drops: Drop[] = [];
    const g = breakShell(w, drops);
    w.store.setTileSilent(10, 9, BOOK, 0, 0);
    g.checkFurnitureSupport(10, 9);
    expect(drops.length).toBe(1);
    expect(drops[0]!.key).toBe(VANILLA_ITEM_KEY_BY_ID[149]);
  });

  it('707 角平台臂（:43905-43911）：slope2 角平台+左邻全块平台→活;无左邻→杀', () => {
    // 活侧
    const w1 = new World(40, 40, 7, 't');
    const drops1: Drop[] = [];
    const g1 = breakShell(w1, drops1);
    w1.store.setTileSilent(10, 9, BOOK, 0, 0);
    w1.store.setTileSilent(10, 10, PLATFORM, 0, 0);
    w1.store.slope[w1.store.idx(10, 10)] = 2;          // 角平台 slope2=blockType3
    w1.store.setTileSilent(9, 10, PLATFORM, 0, 0);     // 左邻全块平台（bt0）
    g1.checkFurnitureSupport(10, 9);
    expect(drops1.length).toBe(0);
    expect(w1.store.get(10, 9)).toBe(BOOK);
    // 杀侧（缺左邻）
    const w2 = new World(40, 40, 7, 't');
    const drops2: Drop[] = [];
    const g2 = breakShell(w2, drops2);
    w2.store.setTileSilent(10, 9, BOOK, 0, 0);
    w2.store.setTileSilent(10, 10, PLATFORM, 0, 0);
    w2.store.slope[w2.store.idx(10, 10)] = 2;
    g2.checkFurnitureSupport(10, 9);
    expect(drops2.length).toBe(1);
  });

  it('78 地面特支臂（:43930）：桌面上活/地面上活/悬空杀/半砖下方杀(:43921 先于特支)', () => {
    // ★78 仓内无 def → 杀裁决以 killDecorTile 间谍直钉（放置格无 def,掉落链不走）
    // 桌面 → 活（:43925 先判桌面）
    const w1 = new World(40, 40, 7, 't');
    const g1 = breakShell(w1, []);
    const spy1 = vi.fn();
    (g1 as unknown as Record<string, unknown>).killDecorTile = spy1;
    w1.store.setTileSilent(10, 10, WORKBENCH, 0, 0);
    g1.checkDecorSupport(10, 9, POT78, 78, 'ontable');
    expect(spy1).not.toHaveBeenCalled();
    // 地面 → 活（78 特支 SolidTileAllowBottomSlope）
    const w2 = new World(40, 40, 7, 't');
    const g2 = breakShell(w2, []);
    const spy2 = vi.fn();
    (g2 as unknown as Record<string, unknown>).killDecorTile = spy2;
    w2.store.setTileSilent(10, 10, DIRT);
    g2.checkDecorSupport(10, 9, POT78, 78, 'ontable');
    expect(spy2).not.toHaveBeenCalled();
    // 悬空 → 杀（特支 SolidTileAllowBottomSlope=false）
    const w3 = new World(40, 40, 7, 't');
    const g3 = breakShell(w3, []);
    const spy3 = vi.fn();
    (g3 as unknown as Record<string, unknown>).killDecorTile = spy3;
    g3.checkDecorSupport(10, 9, POT78, 78, 'ontable');
    expect(spy3).toHaveBeenCalledTimes(1);
    expect(spy3).toHaveBeenCalledWith(10, 9);
    // 半砖下方 → 杀（:43921 分支先于 78 特支——原版对 78 也杀）
    const w4 = new World(40, 40, 7, 't');
    const g4 = breakShell(w4, []);
    const spy4 = vi.fn();
    (g4 as unknown as Record<string, unknown>).killDecorTile = spy4;
    w4.store.setTileSilent(10, 10, DIRT);
    w4.store.half[w4.store.idx(10, 10)] = 1;   // halfBrick（TileStore.half 数值位）
    g4.checkDecorSupport(10, 9, POT78, 78, 'ontable');
    expect(spy4).toHaveBeenCalledTimes(1);
  });

  it('78 非平台顶坡下方杀（:43917）与平台角支共用（78 亦入角支判定域）', () => {
    const w = new World(40, 40, 7, 't');
    const g = breakShell(w, []);
    const spy = vi.fn();
    (g as unknown as Record<string, unknown>).killDecorTile = spy;
    w.store.setTileSilent(10, 10, DIRT);
    w.store.slope[w.store.idx(10, 10)] = 1;   // 非平台顶坡
    g.checkDecorSupport(10, 9, POT78, 78, 'ontable');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
