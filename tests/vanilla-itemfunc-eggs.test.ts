// 十六批：DD2 宠物蛋族 buffType/shoot 纠偏钉值（Item.cs:34034-34047——组 3855-3857
// 共享基值 200/703 + 嵌套 case 覆写：3856→201/702、3857→202/701、3855=基值）。
// 提取器共享组「组首继承」伪值面的 buffType/shoot 维——运行时纠偏（vanillaItemFunc.ts）。
import { describe, expect, it } from 'vitest';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';

describe('DD2 宠物蛋族 buffType/shoot 纠偏（Item.cs:34034-34047）', () => {
  it('3855 Gato Egg = 基值 200/703（组首=真值,缺档补齐）', () => {
    const f = itemFuncOfVid(3855);
    expect(f?.buffType).toBe(200);
    expect(f?.shoot).toBe(703);
  });
  it('3856 Creeper Egg = 201/702（提取器已中,防回退）', () => {
    const f = itemFuncOfVid(3856);
    expect(f?.buffType).toBe(201);
    expect(f?.shoot).toBe(702);
  });
  it('3857 Dragon Egg = 202/701（嵌套 case 覆写,曾挂组基伪值 200/703）', () => {
    const f = itemFuncOfVid(3857);
    expect(f?.buffType).toBe(202);
    expect(f?.shoot).toBe(701);
  });
});
