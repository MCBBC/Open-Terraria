// 世界阵营扫描 + 树妖状态对话（WorldGen.CountTiles :71160 / Lang.cs:246 数据面）
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { languageManager } from '../src/i18n/LanguageManager';
import { alignmentPcts, dryadWorldStatus } from '../src/world/WorldAlignment';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';

describe('世界阵营扫描（CountTiles/AddUpAlignmentCounts 等价）', () => {
  beforeAll(() => {
    languageManager.loadPackJson(JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8')));
  });
  const makeStone = () => {
    const st = new TileStore(100, 200);
    for (let x = 0; x < 100; x++) for (let y = 0; y < 200; y++) st.setTileSilent(x, y, TILE_BY_KEY['stone']!); // sheet1 ∈ solid 基底（原版泥土 0 不进基底——勿用 dirt 做分母）
    return st;
  };
  it('纯泥土 → 三阵营 0% → 完全纯净（event 27 门）', () => {
    const p = alignmentPcts(makeStone(), 80);
    expect(p).toEqual({ tGood: 0, tEvil: 0, tBlood: 0 });
    expect(dryadWorldStatus(p, 'T').pure).toBe(true);
    expect(dryadWorldStatus(p, 'T').text).toContain('纯净');
  });
  it('掺珍珠岩 → tGood>0 → 非纯净', () => {
    const st = makeStone();
    const pearl = TILE_BY_KEY['v_117_pearlstone_block']!;
    for (let x = 0; x < 10; x++) st.setTileSilent(x, 50, pearl);
    const p = alignmentPcts(st, 80);
    expect(p.tGood).toBeGreaterThan(0);
    expect(dryadWorldStatus(p, 'T').pure).toBe(false);
  });
  it('腐化族（sheet 23 腐化草）→ tEvil>0', () => {
    const st = makeStone();
    const cr = TILE_BY_KEY['v_23_corrupt_grass_block'];
    if (cr !== undefined) st.setTileSilent(50, 50, cr);
    const p = alignmentPcts(st, 80);
    expect(p.tEvil).toBeGreaterThan(0);
  });
  it('深层阵营块（y>地表）权重 ×1：1 块不进位百分比', () => {
    const st = makeStone();
    st.setTileSilent(50, 150, TILE_BY_KEY['v_117_pearlstone_block']!);
    const p = alignmentPcts(st, 80);
    // 1/(16000+1) <0.5% → round=0 → 进位 1（:71171-71174）
    expect(p.tGood).toBe(1);
  });
});
