// GAP-A·tileMoss 苔藓族放置门（2026-09-01 清偿批）。
// 原版链：AssortedThings moss 分支（Player.cs:41377-41383，nactive()∧(type1|type38)）
// → PlaceThing_Tiles_PlaceIt legacy 支（:40451）→ WorldGen.PlaceTile：
//   · 入场大 if :59864 尾项 `(Main.tileMoss[num] && (tile.type==1||tile.type==38) && tile.active())`
//     ——活跃石/灰砖目标放行进 moss 特有写入路径
//   · :59902-59912 `if (Main.tileMoss[num])`——非 nactive 石/灰砖即刻 return false；
//     type==38 时 num 重写为苔砖变体（381→517/534→535/…/_ => 512+num-179）
//   · 成功后 ResetHalfBrick 族清半砖+帧归零（ResetsHalfBrickPlacementAttempt
//     TileID.cs:181 全族在表）→ 通用 default 写 tile.type=num → SquareTileFrame 重帧
// ★【单模】定谳：AssortedThings else-if 链互斥，moss 物品命中本支后对空格/其他目标
// 不置 canPlace ⇒ PlaceIt 不运行 ⇒ 无"空格回落普通铺设"（原 GAP-A 登记的"双模"
// 系误读；官方 wiki 同口径 "Collected moss can be placed on Stone Blocks and Gray Bricks"）。
// 调用方（Game.tryPlace）把族内物品当无论成败终止处理，同草种族（assorted-place-gate 同款纪律）。
import { describe, it, expect } from 'vitest';
import {
  MOSS_CONVERT_SHEETS, MOSS_TO_BRICK_SHEET, mossPlaceOk,
} from '../src/world/evolution/PlantRules';
import { vanillaItemCreateTile } from '../src/data/items';
import { TILE_KEY_BY_SHEET, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';

/** 物品面 11 件（vanilla.json meta createTile 实查，登记 GAP-A 名录） */
const MOSS_ITEMS = [4349, 4350, 4351, 4352, 4353, 4354, 4377, 4378, 4389, 5127, 5128];

describe('mossPlaceOk（AssortedThings moss 分支受理面）', () => {
  it('11 个苔藓 sheet 全枚举：石(1)/灰砖(38) 可转；泥土(0)/泥(59)/草(2)不可', () => {
    for (const g of MOSS_CONVERT_SHEETS) {
      expect(mossPlaceOk(g, 1), `sheet ${g} on stone`).toBe(true);
      expect(mossPlaceOk(g, 38), `sheet ${g} on gray brick`).toBe(true);
      expect(mossPlaceOk(g, 0), `sheet ${g} on dirt(0)`).toBe(false);    // 泥土非石
      expect(mossPlaceOk(g, 59), `sheet ${g} on mud`).toBe(false);
      expect(mossPlaceOk(g, 2), `sheet ${g} on grass`).toBe(false);
      expect(mossPlaceOk(g, g), `sheet ${g} on itself`).toBe(false);     // 目标已是苔藓格→拒
      expect(mossPlaceOk(g, -1), `sheet ${g} on empty sentinel`).toBe(false);
    }
  });
  it('空格（nactive 门恒假）：路由层先行拦截——纯函数面无 empty 入参可放行的组合', () => {
    // 空格在 Game.tryMossConvert 由 target===0 早退（Player.cs:41379 nactive() 恒 false），
    // 纯函数对任何 gsheet×tsheet 组合都不产生“空格铺块”通路
    expect(mossPlaceOk(-1, 1)).toBe(false);
    expect(MOSS_CONVERT_SHEETS.has(-1)).toBe(false);
  });
});

describe('MOSS_CONVERT_SHEETS 路由域（单源锁定）', () => {
  it('全集恰为 Main.tileMoss 物品面十一员', () => {
    expect([...MOSS_CONVERT_SHEETS].sort((a, b) => a - b))
      .toEqual([179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627]);
  });
  it('苔砖变体集与 moss 集不相交（512-517/535/537/540/626/628 是普通 legacy 块走通用链）', () => {
    const bricks = Object.values(MOSS_TO_BRICK_SHEET);
    for (const b of bricks) expect(MOSS_CONVERT_SHEETS.has(b), `brick sheet ${b}`).toBe(false);
    expect(new Set(bricks).size).toBe(11);
  });
});

describe('物品↔tile 双向数据链（vanilla.json meta × TILE_KEY_BY_SHEET）', () => {
  it('11 件苔藓物品 createTile 并集 == MOSS_CONVERT_SHEETS', () => {
    const derived = new Set(MOSS_ITEMS.map((v) => vanillaItemCreateTile(v)));
    expect([...derived].sort((a, b) => a - b)).toEqual([...MOSS_CONVERT_SHEETS].sort((a, b) => a - b));
  });
  it('每个 moss sheet 与每个苔砖变体 sheet 都能解析出内部 tile id（运行时转化可达）', () => {
    for (const s of [...MOSS_CONVERT_SHEETS, ...Object.values(MOSS_TO_BRICK_SHEET)]) {
      expect(TILE_KEY_BY_SHEET.get(s), `tile key for sheet ${s}`).toBeDefined();
      expect(TILE_INTERNAL_BY_SHEET.get(s), `internal id for sheet ${s}`).toBeDefined();
    }
  });
});

describe('灰砖重写映射（WorldGen.PlaceTile cs:59902-59912 逐值 + MossConversion cs:72000 交叉）', () => {
  it('五基础色按 `_ => 512+num-179` 算式、五特判档显式逐值同表', () => {
    for (let m = 179; m <= 183; m++) {
      expect(MOSS_TO_BRICK_SHEET[m], `moss ${m}`).toBe(512 + m - 179);
    }
    expect(MOSS_TO_BRICK_SHEET[381]).toBe(517);
    expect(MOSS_TO_BRICK_SHEET[534]).toBe(535);
    expect(MOSS_TO_BRICK_SHEET[536]).toBe(537);
    expect(MOSS_TO_BRICK_SHEET[539]).toBe(540);
    expect(MOSS_TO_BRICK_SHEET[625]).toBe(626);
    expect(MOSS_TO_BRICK_SHEET[627]).toBe(628);
  });
});
