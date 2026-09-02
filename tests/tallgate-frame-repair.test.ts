// ★M-2（2026-09-02 九批）迁移与放置帧约定单测：
//  1) 放置面 framedCellFrame 行步进=原版 TileObject.Place heights+padding 累进
//     （TileObject.cs:96-108）——388/389 高门 0/20/38/56/74（heights{18,16,16,16,18}+
//     pad2,TileObjectData.cs:2301-2303）、567 侏儒 0/20（heights{18,18}+pad2 :4222-4224）。
//  2) 存量自放旧帧迁移（world/tallgateFrameRepair.ts）：18/36/54/72 → 20/38/56/74,
//     顶行 0 不动;幂等（二次运行零改动）;非目标件 frameY=18 合法帧不误伤。
//  3) 行归一 tallGateRowOf（CheckTallGate :52129-52133 heights 递减）与
//     shiftTallGate/devices 行解码同源（Door.ts 唯一权威）。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { framedCellFrame } from '../src/world/FurnitureStyle';
import { repairTallGateFramesInStore } from '../src/world/tallgateFrameRepair';
import { TALL_GATE_ROW_FY, TALL_GATE_CFH, TALL_GATE_HEIGHTS, tallGateRowOf } from '../src/world/Door';

const idOfSheet = (s: number) => {
  const id = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);
  expect(id, `sheet ${s} 应有 def`).toBeGreaterThan(0);
  return id;
};

describe('M-2a 放置面行帧（framedCellFrame PLACE_ROW_FY）', () => {
  it('389/388 行帧 = 0/20/38/56/74（原版 heights+padding 累进）', () => {
    const T388 = idOfSheet(388), T389 = idOfSheet(389);
    for (const tid of [T388, T389]) {
      const sh = TILE_DEFS[tid].vanilla!.sheet;
      expect([0, 20, 38, 56, 74].map((_, dy) => framedCellFrame(sh, 1, 0, 0, dy)[1]))
        .toEqual([0, 20, 38, 56, 74]);
    }
    expect(TALL_GATE_ROW_FY).toEqual([0, 20, 38, 56, 74]);
    expect(TALL_GATE_CFH).toBe(94);                     // TileObjectData.cs:1805-1820 Calculate
    expect(TALL_GATE_HEIGHTS).toEqual([18, 16, 16, 16, 18]);   // :2301
  });

  it('567 侏儒行帧 = 0/20（heights{18,18}+pad2;CheckGnome :54419 完整性同口径）', () => {
    const GN = idOfSheet(567);
    expect(framedCellFrame(567, 1, 0, 0, 0)[1]).toBe(0);
    expect(framedCellFrame(567, 1, 0, 0, 1)[1]).toBe(20);
    expect(GN).toBeGreaterThan(0);
  });

  it('普通 18px 族不漂移（对照:宝箱 21 行帧仍 dy*18）', () => {
    const CHEST = idOfSheet(21);
    expect(framedCellFrame(21, 2, 0, 0, 1)[1]).toBe(18);
  });
});

describe('M-2b 存量旧帧迁移（repairTallGateFramesInStore）', () => {
  it('388/389/567 旧 18px 步进帧 → 原版帧;vanilla 帧与带基帧不动;幂等', () => {
    const w = new World(40, 40, 7, 'tallgate-frame-repair');
    const st = w.store;
    const T388 = idOfSheet(388), T389 = idOfSheet(389), GN = idOfSheet(567);
    // 旧自放门（0/18/36/54/72）
    for (let dy = 0; dy < 5; dy++) st.setTileSilent(10, 9 + dy, T388, 0, 18 * dy);
    // 旧自放侏儒（0/18）
    st.setTileSilent(12, 9, GN, 0, 0);
    st.setTileSilent(12, 10, GN, 0, 18);
    // 已是原版帧的 389（0/20/38/56/74——wld 导入形,不得再动）
    for (let dy = 0; dy < 5; dy++) st.setTileSilent(14, 9 + dy, T389, 0, TALL_GATE_ROW_FY[dy]);
    // 带基帧（style band 94）不得被误映射
    st.setTileSilent(16, 9, T389, 0, 94);

    const fixed1 = repairTallGateFramesInStore(st);
    expect(st.frameY[st.idx(10, 9)]).toBe(0);
    expect(st.frameY[st.idx(10, 10)]).toBe(20);
    expect(st.frameY[st.idx(10, 11)]).toBe(38);
    expect(st.frameY[st.idx(10, 12)]).toBe(56);
    expect(st.frameY[st.idx(10, 13)]).toBe(74);
    expect(st.frameY[st.idx(12, 10)]).toBe(20);
    for (let dy = 0; dy < 5; dy++) expect(st.frameY[st.idx(14, 9 + dy)]).toBe(TALL_GATE_ROW_FY[dy]);
    expect(st.frameY[st.idx(16, 9)]).toBe(94);
    expect(fixed1).toBe(5);   // 4 门格 + 1 侏儒格（顶行 0 两端同值不计）

    const fixed2 = repairTallGateFramesInStore(st);   // 幂等
    expect(fixed2).toBe(0);
  });

  it('非目标件 frameY=18 合法帧不误伤（绳 213/椅 15 族对照）', () => {
    const w = new World(40, 40, 7, 'tallgate-frame-repair-others');
    const st = w.store;
    const ROPE = TILE_BY_KEY['v_213_rope'];
    expect(ROPE).toBeDefined();
    st.setTileSilent(10, 10, ROPE!, 0, 18);
    st.setTileSilent(10, 11, ROPE!, 0, 36);
    expect(repairTallGateFramesInStore(st)).toBe(0);
    expect(st.frameY[st.idx(10, 10)]).toBe(18);
    expect(st.frameY[st.idx(10, 11)]).toBe(36);
  });
});

describe('M-2c 行归一（tallGateRowOf = CheckTallGate :52129-52133 heights 递减）', () => {
  it('原版行帧 → 行序号 0..4;带基帧取模后同值', () => {
    for (let row = 0; row < 5; row++) {
      expect(tallGateRowOf(TALL_GATE_ROW_FY[row])).toBe(row);
      expect(tallGateRowOf(94 + TALL_GATE_ROW_FY[row])).toBe(row);   // band 1
    }
    expect(tallGateRowOf(188 + 56)).toBe(3);                          // band 2
  });
});
