// SW-Y1 2026-09-04：vanilla-itemfunc.json SW-V1 重产落地核对钉面（提取器 21 族 helper
// 参数化 + SW-X1 L-2① 鞭 noUseGraphic 后的正式落地,工具直写 md5 9ef686731cbe19d0）。
// 账本（对 /tmp/vanilla-itemfunc.json.bak-20260904 语义 diff,SW-V1 报告 + SW-X1 增量）：
//   纯新增 1469 id / 删除 0 id / 值变更仅 2（4058/4381 useAmmo 1→40,旧 Bow 分支硬编码
//   1 系笔误,AmmoID.Arrow=40）/ 键删除仅 2（4682/4702 ranged——1458 Item.cs:44242 显式
//   ranged=false,键缺席=同义）/ 既有条目加键 165 键对（V 报告 164 + SW-X1 十八鞭
//   noUseGraphic 增量 1 对=5480,十八鞭中唯一既有条目）。
// ★RAW 一律 fs 直读：vanillaItemFunc.ts import 时会对共享 json 模块对象原地补
//   3855/2421/3287 三条 TS 手补（3855 蛋缺档/2421 血肉抛竿/3287 悠悠球 useStyle）,
//   直接 import json 再数键会把进程内 +3 数进去（3768≠3765,本测试首版踩过）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';

const RAW = JSON.parse(
  readFileSync(new URL('../src/data/vanilla-itemfunc.json', import.meta.url), 'utf8'),
) as Record<string, Record<string, number>>;

// SW-V1-α：18 鞭（4672/4678/4679/4680/4911-4914/5074/5473-5480/5688）——DefaultToWhip
// 体首段 noUseGraphic = true（Item.cs:47824）,SW-X1 L-2① 补入 defaultToBase Whip 支。
const WHIPS = [4672, 4678, 4679, 4680, 4911, 4912, 4913, 4914, 5074,
  5473, 5474, 5475, 5476, 5477, 5478, 5479, 5480, 5688];

describe('vanilla-itemfunc.json SW-V1 重产落地钉面', () => {
  it('计数锚：3765 条（存量 2296 + 纯新增 1469;未来提取器扩面须有意识地更新本锚）', () => {
    expect(Object.keys(RAW).length).toBe(3765);
  });

  it('18 鞭 noUseGraphic=1（Item.cs:47824 体首行;使用期不绘手持贴图=原版本相）', () => {
    for (const vid of WHIPS) {
      const e = RAW[String(vid)];
      expect(e, `whip ${vid} 缺条目`).toBeTruthy();
      expect(e.noUseGraphic, `whip ${vid} noUseGraphic`).toBe(1);
      expect(e.summon, `whip ${vid} summon`).toBe(1);
    }
  });

  it('Bow 笔误修正：4058/4381 useAmmo 1→40（AmmoID.Arrow）', () => {
    expect(RAW['4058']?.useAmmo).toBe(40);
    expect(RAW['4381']?.useAmmo).toBe(40);
  });

  it('回力镖 ranged 键缺席=同义（4682/4702,C# 显式 ranged=false）', () => {
    expect(RAW['4682']?.ranged).toBeUndefined();
    expect(RAW['4702']?.ranged).toBeUndefined();
  });

  it('5480 = 十八鞭唯一既有条目（旧 {useStyle:5} 保留 + 重产补全）', () => {
    expect(RAW['5480']?.useStyle).toBe(5);
  });

  it('TS 手补供给面共存：3855/2421/3287 三条 json 侧缺档、vanillaItemFunc 进程内补', () => {
    for (const vid of [3855, 2421, 3287]) {
      expect(RAW[String(vid)], `${vid} 应由 TS 侧供给(json 缺档=设计)`).toBeUndefined();
      expect(itemFuncOfVid(vid), `${vid} 进程内应有条目`).toBeTruthy();
    }
    expect(itemFuncOfVid(3855)?.buffType).toBe(200);   // Gato Egg（eggs 测试同款）
    expect(itemFuncOfVid(2421)?.fishingPole).toBe(22); // 血肉抛竿
    expect(itemFuncOfVid(3287)?.useStyle).toBe(5);     // 悠悠球持姿
  });

  it('FUNC spread 合并共存（SW-X1 L-2②）：json 直出键不被 TS 手补剥掉', () => {
    // ItemFunc 接口未声明 noUseGraphic（数据有键/接口无字段=既有债,TS 侧禁碰面）——
    // 本测试本地收窄读键,不为断言扩接口。
    const noUseGraphicOf = (f: ReturnType<typeof itemFuncOfVid>) =>
      (f ?? {}) as Record<string, number | undefined>;
    // 5594/5595：json Bomb 种子 noUseGraphic=1 保留 + TS 手补 useTime=40 覆写
    for (const [vid, shoot] of [[5594, 1086], [5595, 1087]] as const) {
      const f = noUseGraphicOf(itemFuncOfVid(vid));
      expect(f.noUseGraphic, `${vid} noUseGraphic(json)`).toBe(1);
      expect(f.shoot, `${vid} shoot`).toBe(shoot);
      expect(f.useTime, `${vid} useTime(TS)`).toBe(40);
      expect(f.consumable).toBe(1);
    }
    // 4049 割草机：json helper 种子 autoReuse=1 保留 + TS 手补 useStyle 11/holdStyle 1
    const f4049 = itemFuncOfVid(4049)!;
    expect([f4049.useStyle, f4049.holdStyle, f4049.autoReuse]).toEqual([11, 1, 1]);
  });
});
