// IIIII234：NPC 幸福 + 电路机制对齐回归（2026-09-09）。
// 反编译标杆（Terarria1457 = 1.4.5.7 全量；1458 增量面对本域零变更）：
//   幸福  Terraria.GameContent/ShopHelper.cs（ProcessMood :99-187 /
//         GetNearbyResidentNPCs :295-332 / IsNotReallyTownNPC :373-380）
//         Terraria.GameContent/TownRoomManager.cs（CanNPCsLiveWithEachOther :118-127）
//   电路  Terraria/Wiring.cs（CheckLogicGate :593-691 / LogicGatePass :555-591）
//         WorldGen.cs（PlaceLogicTiles :45705-45728）
//         ItemID.cs:8752-8762（门六件 placeStyle）:8772-9002（感应器七件）
// 本批实装三刀：
//   ① 邻居计数谓词 shopHelperCountsNeighbor（宠物 housingCategory 门——此前宠物
//     被计入普通 NPC 的拥挤/村计数与关系条目）；
//   ② PlaceLogicTiles 帧轴（420/424/429/445 样式在 frameY——此前 OR 门放出来
//     frameX=18=「AND 已 ON」）；
//   ③ 门六件 placeStyle 回填（3603-3608,物品侧 tile/placeStyle 缺失）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Wiring } from '../src/world/Wiring';
import { TileStore } from '../src/world/TileStore';
import { furnitureStyleBase } from '../src/world/FurnitureStyle';
import { TILE_BY_KEY } from '../src/data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { computeHappiness, shopHelperCountsNeighbor, type BiomeZones } from '../src/data/vanillaHappiness';

const T419 = TILE_BY_KEY['v_419_logicgatelamp']!;
const T420 = TILE_BY_KEY['v_420_logicgate']!;

const ZONES: BiomeZones = {
  forest: false, ocean: false, snow: false, desert: false,
  jungle: false, underground: false, hallow: false, mushroom: false,
};
const baseHappy = {
  npcVanillaId: 17, homeless: false, distFromHome: 0,
  playerInCorrupt: false, playerInCrimson: false, playerInDungeon: false,
  zones: ZONES,
  npcsInHouse: 0, npcsInVillage: 4, nearby: [] as number[], isPrincess: false,
};

// ===========================================================================
// ① 幸福：邻居计数谓词 + 宠物豁免
// ===========================================================================
describe('IIIII234-① shopHelperCountsNeighbor（ShopHelper.cs:312-317 谓词）', () => {
  it('IsNotReallyTownNPC（:373-380）：37 老人/368 旅行商/453 骷髅商永不计入', () => {
    expect(shopHelperCountsNeighbor(17, 37)).toBe(false);
    expect(shopHelperCountsNeighbor(17, 368)).toBe(false);
    expect(shopHelperCountsNeighbor(17, 453)).toBe(false);
  });
  it('housingCategory 门：宠物(637/638/656/670/678-684)与普通城镇 NPC 互不计入', () => {
    for (const pet of [637, 638, 656, 670, 678, 679, 680, 681, 682, 683, 684]) {
      expect(shopHelperCountsNeighbor(17, pet)).toBe(false);   // 宠物 → 普通 NPC 不计
      expect(shopHelperCountsNeighbor(663, pet)).toBe(false);
    }
    // 反向对称（CanNPCsLiveWithEachOther 对称语义）
    expect(shopHelperCountsNeighbor(637, 17)).toBe(false);
    // 宠物对宠物同类别照常计入
    expect(shopHelperCountsNeighbor(637, 638)).toBe(true);
  });
  it('普通城镇 NPC 互计（同住门通过）', () => {
    expect(shopHelperCountsNeighbor(17, 18)).toBe(true);
    expect(shopHelperCountsNeighbor(633, 663)).toBe(true);
  });
  it('拥挤/宽敞边界（谓词输出 → computeHappiness 输入语义）', () => {
    // house=0 且 village=2 → LoveSpace ×0.95
    const r = computeHappiness({ ...baseHappy, npcsInHouse: 0, npcsInVillage: 2 });
    expect(r.report.some((l) => l.key.endsWith('.DislikeCrowded'))).toBe(false);
    expect(r.priceMul).toBe(0.95);
    // house=4（>3）→ ×1.05 + DislikeCrowded（>6 才 HateCrowded）
    const r2 = computeHappiness({ ...baseHappy, npcsInHouse: 4, npcsInVillage: 4 });
    expect(r2.report.some((l) => l.key.endsWith('.DislikeCrowded'))).toBe(true);
    expect(r2.priceMul).toBe(1.05);
    // house=7（>6）→ 1.05^4 = 1.2155…→ HateCrowded
    const r3 = computeHappiness({ ...baseHappy, npcsInHouse: 7, npcsInVillage: 4 });
    expect(r3.report.some((l) => l.key.endsWith('.HateCrowded'))).toBe(true);
    expect(r3.priceMul).toBe(1.22);
  });
  it('宠物/非卖 NPC 幸福豁免（ProcessMood :104-110 提前 return）', () => {
    for (const vid of [637, 638, 656, 670, 684, 37, 368, 453]) {
      const r = computeHappiness({ ...baseHappy, npcVanillaId: vid });
      expect(r.priceMul).toBe(1);
      expect(r.report).toHaveLength(0);
    }
  });
});

// ===========================================================================
// ② 电路：CheckLogicGate 六门真值表 + 故障灯 + 级联
//    样式→门型权威 = ItemID.cs:8752-8762 + en-US tooltip：
//    0=AND 全亮 / 1=OR 任一亮 / 2=NAND 非全亮 / 3=NOR 全灭 / 4=XOR 恰一亮 /
//    5=XNOR 0 或 ≥2 亮（Wiring.cs:631-653 switch(frameY/18)）
// ===========================================================================
function buildGate(st: TileStore, gx: number, gy: number, style: number,
  lamps: Array<0 | 18 | 36>): void {
  st.setTileSilent(gx, gy, T420, 0, style * 18);
  for (let k = 0; k < lamps.length; k++) {
    st.setTileSilent(gx, gy - 1 - k, T419, lamps[k], 0);
  }
}
const gateOut = (st: TileStore, gx: number, gy: number): number =>
  st.frameX[st.idx(gx, gy)];

describe('IIIII234-② CheckLogicGate 六门真值表（Wiring.cs:631-653,3 灯矩阵 24 档）', () => {
  const EXPECT: Record<number, (on: number, n: number) => boolean> = {
    0: (on, n) => on === n,   // AND
    1: (on) => on > 0,        // OR
    2: (on, n) => on !== n,   // NAND
    3: (on) => on === 0,      // NOR
    4: (on) => on === 1,      // XOR（"Exactly one logic gate lamp above is on"）
    5: (on) => on !== 1,      // XNOR（"Zero or more than one"）
  };
  const NAME = ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR'];
  for (let style = 0; style <= 5; style++) {
    for (let mask = 0; mask < 8; mask++) {
      const lamps: Array<0 | 18> = [
        mask & 1 ? 18 : 0, mask & 2 ? 18 : 0, mask & 4 ? 18 : 0,
      ];
      const on = lamps.filter((l) => l === 18).length;
      const want = EXPECT[style](on, 3) ? 18 : 0;
      it(`${NAME[style]} 灯[${lamps.map((l) => (l ? 1 : 0)).join(',')}] on=${on} → ${want === 18 ? 'ON' : 'OFF'}`, () => {
        const world = new World(80, 80, 7, 'open');
        const st = world.store;
        const w = new Wiring(st);
        buildGate(st, 30, 40, style, lamps);
        w.pokeLogicGate(30, 40 - lamps.length);   // poke 顶灯（放置/拆灯路径 :254-260）
        expect(gateOut(st, 30, 40)).toBe(want);
      });
    }
  }

  it('0 灯静态面：NOR/XNOR/AND 恒 ON（AND 0==0 空真）、OR 恒 OFF（分立 poke 门格同式）', () => {
    const world = new World(80, 80, 7, 'open');
    const st = world.store;
    const w = new Wiring(st);
    buildGate(st, 30, 40, 3, []);
    w.pokeLogicGate(30, 40);
    expect(gateOut(st, 30, 40)).toBe(18);
    buildGate(st, 40, 40, 5, []);
    w.pokeLogicGate(40, 40);
    expect(gateOut(st, 40, 40)).toBe(18);
    buildGate(st, 50, 40, 0, []);
    w.pokeLogicGate(50, 40);
    expect(gateOut(st, 50, 40)).toBe(18);   // AND num2==num3=0 → 空 true
    buildGate(st, 60, 40, 1, []);
    w.pokeLogicGate(60, 40);
    expect(gateOut(st, 60, 40)).toBe(0);    // OR num3>0 = false
  });

  it('故障灯（frameX 36）：扫描止于故障灯,门输出帧恒 36（`if (flag3) frameX=36` :660-662）', () => {
    // [亮,故障]（故障在顶）：scan = 亮(计入 num2=1,num3=1) → 故障(faulty,断)
    const world = new World(80, 80, 7, 'open');
    const st = world.store;
    const w = new Wiring(st);
    buildGate(st, 30, 40, 1, [18, 36]);
    w.pokeLogicGate(30, 38);               // poke 故障灯本体 → flag6 = rand(1)<1 必发
    expect(gateOut(st, 30, 40)).toBe(36);
    // poke 非故障灯（亮的）→ !faulty|flag6 = false = 不发,但帧仍进 36
    const world2 = new World(80, 80, 7, 'open');
    const st2 = world2.store;
    const w2 = new Wiring(st2);
    buildGate(st2, 30, 40, 1, [18, 36]);
    w2.pokeLogicGate(30, 39);
    expect(gateOut(st2, 30, 40)).toBe(36);
  });

  it('故障灯概率门（flag6 :665-671 fire=rand(num2)<num3）：num3=0 不发 / num3=num2 必发', () => {
    const mk = (lamp: 0 | 18) => {
      const world = new World(80, 80, 7, 'open');
      const st = world.store;
      const w = new Wiring(st);
      buildGate(st, 30, 40, 1, [lamp, 36]);
      return { st, w };
    };
    const offCase = mk(0);                 // num2=1,num3=0 → rand(1)<0 恒 false
    offCase.w.pokeLogicGate(30, 38);
    expect(gateOut(offCase.st, 30, 40)).toBe(36);   // 帧进 36（故障视觉）但无信号
    const onCase = mk(18);                 // num2=1,num3=1 → rand(1)<1 恒 true（确定性档）
    onCase.w.pokeLogicGate(30, 38);
    expect(gateOut(onCase.st, 30, 40)).toBe(36);
  });

  it('级联（LogicGatePass :555-591）：OR 开 → 输出线翻二级灯 → XOR 同 pass 重算', () => {
    const world = new World(80, 80, 7, 'open');
    const st = world.store;
    const w = new Wiring(st);
    // 一级 OR 门(30,46)+灯1(30,45)；二级 XOR 门(32,46)+灯2(32,45)。
    // ★拓扑注意：门的输出 TripWire 打在【门格】全部线上——二级门自身格/其灯列
    //  若挂同一根线 = 反馈振荡（原版同构,玩家自制时钟经典拓扑）。故灯2 经侧邻
    //  (31,45) 进线、门2 格无线。
    buildGate(st, 30, 46, 1, [0]);   // OR：0 灯亮 → off
    buildGate(st, 32, 46, 4, [0]);   // XOR：0 灯亮 → off（灯2 在 (32,45)）
    st.wire[st.idx(30, 46)] |= TileStore.WIRE_RED;
    st.wire[st.idx(31, 46)] |= TileStore.WIRE_RED;
    st.wire[st.idx(31, 45)] |= TileStore.WIRE_RED;
    st.wire[st.idx(32, 45)] |= TileStore.WIRE_RED;
    // poke OR 门顶灯(30,45) 翻亮 → OR 开 → TripWire 门格 → 红线 → 灯2 翻亮 → XOR 重算
    st.setTileSilent(30, 45, T419, 18, 0);
    w.pokeLogicGate(30, 45);
    expect(gateOut(st, 30, 46)).toBe(18);          // OR 开
    expect(st.frameX[st.idx(32, 45)]).toBe(18);    // 灯2 被输出信号翻亮
    expect(gateOut(st, 32, 46)).toBe(18);          // XOR：恰 1 亮 → ON（同 pass）
  });

  it('同 pass 重复输出门不重入（_GatesDone 防环 :569-576）：自环线不炸栈', () => {
    const world = new World(80, 80, 7, 'open');
    const st = world.store;
    const w = new Wiring(st);
    buildGate(st, 30, 40, 1, [18]);      // OR：已亮 → 输出帧无变化 → 不 TripWire
    st.wire[st.idx(30, 40)] |= TileStore.WIRE_RED;
    w.pokeLogicGate(30, 39);
    expect(gateOut(st, 30, 40)).toBe(18);
  });
});

// ===========================================================================
// ③ PlaceLogicTiles 帧轴（WorldGen.cs:45705-45728）+ 物品 placeStyle 回填
// ===========================================================================
describe('IIIII234-③ PlaceLogicTiles 帧轴（furnitureStyleBase）', () => {
  it('420 逻辑门：样式在 frameY（0-5*18）,frameX 恒 0（状态轴留给门输出）', () => {
    for (let s = 0; s <= 5; s++) expect(furnitureStyleBase(420, s, 1)).toEqual([0, s * 18]);
  });
  it('424 分线盒/429 线缆灯泡/445 像素盒：样式也在 frameY（state 轴=X）', () => {
    expect(furnitureStyleBase(424, 1, 1)).toEqual([0, 18]);
    expect(furnitureStyleBase(429, 0, 1)).toEqual([0, 0]);
    expect(furnitureStyleBase(445, 0, 1)).toEqual([0, 0]);
  });
  it('419 门灯：状态/样式轴在 frameX（0 灭/1 亮/2 故障）= PlaceLogicTiles 419 支', () => {
    expect(furnitureStyleBase(419, 0, 1)).toEqual([0, 0]);
    expect(furnitureStyleBase(419, 1, 1)).toEqual([18, 0]);
    expect(furnitureStyleBase(419, 2, 1)).toEqual([36, 0]);
  });
  it('423 感应器回归（R20 批已接）：frameY=style*18 七档', () => {
    for (let s = 0; s <= 6; s++) expect(furnitureStyleBase(423, s, 1)).toEqual([0, s * 18]);
  });
});

describe('IIIII234-③b 门/灯/感应器物品 placeStyle（ItemID.cs:8752-9002）', () => {
  const defOf = (vid: number) => {
    const k = VANILLA_ITEM_KEY_BY_ID[vid];
    return k !== undefined ? ITEM_DEFS[ITEM_BY_KEY[k]] : undefined;
  };
  it('门六件 3603-3608：placeStyle=type-3603、tile=v_420_logicgate（本批回填）', () => {
    for (const vid of [3603, 3604, 3605, 3606, 3607, 3608]) {
      const d = defOf(vid);
      expect(d, `def ${vid}`).toBeTruthy();
      expect(d!.tile).toBe('v_420_logicgate');
      expect(d!.placeStyle).toBe(vid - 3603);
    }
  });
  it('门灯三件 3602/3618/3663：placeStyle 0/1/2（off/on/faulty,itemfunc 显式档）', () => {
    expect(defOf(3602)?.placeStyle ?? 0).toBe(0);
    expect(defOf(3618)?.placeStyle).toBe(1);
    expect(defOf(3663)?.placeStyle).toBe(2);
    expect(defOf(3602)?.tile).toBe('v_419_logicgatelamp');
  });
  it('感应器七件 3613/3614/3615/3726-3729：placeStyle 0-6（本仓既有回填,防回归）', () => {
    const want: Record<number, number> = {
      3613: 0, 3614: 1, 3615: 2, 3726: 3, 3727: 4, 3728: 5, 3729: 6,
    };
    for (const [vidStr, ps] of Object.entries(want)) {
      const d = defOf(Number(vidStr));
      expect(d, `def ${vidStr}`).toBeTruthy();
      expect(d!.placeStyle ?? 0).toBe(ps);
      expect(d!.tile).toBe('v_423_logicsensor');
    }
  });
});
