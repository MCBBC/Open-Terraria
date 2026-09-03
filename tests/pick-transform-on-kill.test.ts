// 镐打草族 transform-on-kill 回归（SW-D1 2026-09-03）：KillTile fail 路径原格转化表
// （WorldGen.cs:64228-64247）+ DoesPickTargetTransformOnKill 判定（Player.cs:54693-54700，
// AddDamage(updateAmount:false)=模拟积累 getDamage+dmg≥100）。目标全为 blend/auto 绘制期
// 虚拟化块（帧 0/0）；转化=active→active，油漆/半砖存活、不掉落不清格（:64249 return）。
import { describe, it, expect } from 'vitest';
import { doesPickTransformOnKill, PICK_TRANSFORM_ON_FAIL_SHEETS, pickTransformTargetSheet, pickTransformTargetTileId } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

describe('镐打草族转化表（WorldGen.cs:64228-64247 逐 id 权威）', () => {
  it('全表 33 件，五组分档目标 0/57/59/1/38；目标块不自环', () => {
    expect(PICK_TRANSFORM_ON_FAIL_SHEETS.size).toBe(33);
    for (const s of [2, 23, 109, 199, 477, 492]) expect(pickTransformTargetSheet(s)).toBe(0); // 草族→泥土
    expect(pickTransformTargetSheet(633)).toBe(57);                                          // 灰烬草→灰烬
    for (const s of [60, 661, 662, 70]) expect(pickTransformTargetSheet(s)).toBe(59);        // 丛林/蘑菇草→淤泥
    for (const s of [179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627]) expect(pickTransformTargetSheet(s)).toBe(1);   // tileMoss→石
    for (const s of [512, 513, 514, 515, 516, 517, 535, 537, 540, 626, 628]) expect(pickTransformTargetSheet(s)).toBe(38);  // tileMossBrick→灰砖
    for (const s of [0, 1, 38, 57, 59]) expect(pickTransformTargetSheet(s)).toBe(-1);        // 泥土/石/灰砖/灰烬/淤泥不在族
  });

  it('33 件源/目标在本仓注册表均可达，目标为实心块（草→泥土=整格变土）', () => {
    for (const [src] of PICK_TRANSFORM_ON_FAIL_SHEETS) {
      expect(TILE_INTERNAL_BY_SHEET.has(src)).toBe(true);
      const id = pickTransformTargetTileId(src);
      expect(id).toBeGreaterThanOrEqual(0);
      expect(TILE_DEFS[id].solid).toBe(true);
    }
    expect(TILE_INTERNAL_BY_SHEET.get(2)).toBe(TILE_BY_KEY['grass']);
    expect(pickTransformTargetTileId(2)).toBe(TILE_BY_KEY['dirt']);    // sheet 0 首个 def=dirt 非 pixel_block
  });

  it('判定谓词：模拟积累≥100 且属转化族（Player.cs:54695）', () => {
    expect(doesPickTransformOnKill(2, 65, 35)).toBe(true);    // 65+35=100 攒满那一击
    expect(doesPickTransformOnKill(2, 0, 165)).toBe(true);    // 高镐力单击越阈（防真破）
    expect(doesPickTransformOnKill(2, 0, 35)).toBe(false);    // 首击未攒满=积累照常
    expect(doesPickTransformOnKill(513, 99, 1)).toBe(true);   // 苔砖同门
    expect(doesPickTransformOnKill(0, 65, 35)).toBe(false);   // 泥土不在族=转化后可正常破坏
    expect(doesPickTransformOnKill(1, 99, 55)).toBe(false);   // 石块不在族
  });
});

describe('转化写格（killTileFailTransform 同式 setTile(nid,0,0)）', () => {
  it('草→泥土：类型换、帧 0/0、实心存活、油漆存活', () => {
    const st = new TileStore(32, 32);
    st.setTile(8, 8, TILE_INTERNAL_BY_SHEET.get(2)!);
    st.setPaint(8, 8, 7);
    st.setTile(8, 8, pickTransformTargetTileId(2), 0, 0);
    expect(st.get(8, 8)).toBe(pickTransformTargetTileId(2));
    expect(st.isActive(8, 8)).toBe(true);
    expect(st.frameX[st.idx(8, 8)]).toBe(0);
    expect(st.frameY[st.idx(8, 8)]).toBe(0);
    expect(st.paint[st.idx(8, 8)]).toBe(7);   // active→active 不清漆（原版 fail 支不清）
  });
});
