// 割草判据锁（2026-08-25 墓碑三连 bug 防再发）：
// bug 族谱——decor/framed 启发式被用作"可割植物"判据：
//   ①放置空间检查把墓碑(85,decor+framed 家具)当草割成掉落物；
//   ②锤路径一击拆墓碑；③速挖路径斧一击拆墓碑；
//   ④改 !framed 又误杀 style 帧杂草(3/74 本身 framed:true)→放置拒绝。
// 唯一权威判据 = TILE_CUT（Main.tileCut 派生）。本测试锁死判据数据不变量。
import { describe, it, expect } from 'vitest';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { TILE_CUT } from '../src/core/Game';

const idOf = (key: string) => TILE_BY_KEY[key];
const sheetOf = (id: number) => TILE_DEFS[id]?.vanilla?.sheet ?? -1;

describe('割草判据 TILE_CUT 不变量（墓碑三连 bug 防再发）', () => {
  it('回归锚：墓碑/像素方块不可割，杂草/药草可割', () => {
    expect(TILE_CUT.has(idOf('tombstone_v'))).toBe(false);   // ①②③ 主角
    expect(TILE_CUT.has(idOf('pixel_block'))).toBe(false);   // 自研像素画
    expect(TILE_CUT.has(idOf('v_3_forest_short_plants'))).toBe(true);  // ④ 主角
    expect(TILE_CUT.has(idOf('v_74_jungle_tall_plants'))).toBe(true);
    expect(TILE_CUT.has(idOf('v_83_herbs_mature'))).toBe(true);          // 药草族
  });

  it('判据与 decor/framed 启发式彻底脱钩：decor∩framed 两族同构性文档化', () => {
    // 墓碑与杂草在 (decor, framed) 标记空间里完全同构（都 = true,true）——
    // 任何基于这两标记的判据必然同时误伤其一。此断言在标记漂移时炸红，
    // 提示维护者：判据必须继续走 TILE_CUT。
    const tomb = TILE_DEFS[idOf('tombstone_v')];
    const weed = TILE_DEFS[idOf('v_74_jungle_tall_plants')];
    expect(!!tomb?.decor).toBe(!!weed?.decor);
    expect(!!tomb?.framed).toBe(!!weed?.framed);
    expect(TILE_CUT.has(idOf('tombstone_v'))).not.toBe(TILE_CUT.has(idOf('v_74_jungle_tall_plants')));
  });

  it('TILE_CUT 全集 = vanilla tileCut 表（无 framed 家具混入）', () => {
    // 表内不得出现"非植物类 framed 家具"——以 pick=0/decor/framed 三标记
    // 无法区分，故直接锁已知的家具族 sheet 恒不在表内
    const FURNITURE_SHEETS = new Set([85, 10, 11, 21, 88, 33, 49, 79, 87, 174, 467]);
    for (const id of TILE_CUT) {
      expect(FURNITURE_SHEETS.has(sheetOf(id))).toBe(false);
    }
  });

  it('TILE_CUT 派生一致性 + 原版表特例成员存在', () => {
    // 表 = TILE_CUT_VANILLA → 内部 id 的机械派生；特例成员（原版 tileCut 含
    // 蛛网 51/苔藓植物 184/滚石仙人掌 484/蚁狮幼虫 485 等非 decor 项）锁存在——
    // 防未来误删或手工塞入表外项
    for (const key of ['v_51_cobweb', 'v_184_moss_plants', 'v_484_rolling_cactus', 'v_485_antlion_larva']) {
      expect(TILE_CUT.has(idOf(key)), `${key} 应在表内（原版 tileCut 成员）`).toBe(true);
    }
  });
});
