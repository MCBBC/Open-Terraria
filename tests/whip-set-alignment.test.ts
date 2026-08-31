// 蓝队三件①：IS_A_WHIP_PROJS 长度/内容对齐测试（防漂移）。
//  权威：Terarria1457/Terraria.ID/ProjectileID.cs:35 —— 全【18】型一行全量（含
//  1104 火鞭），不是历史注释里的 17。Type 差一即门语义漂移：
//   StatusNPC 浸剂臂（Projectile.cs:11197）/nano·confetti 命中环（:13687-96）/
//   CutTiles 支（:15292）都靠 `(melee || IsAWhip[type])` 把无类旗的鞭并进近战面。
import { describe, it, expect } from 'vitest';
import { IS_A_WHIP_PROJS } from '../src/entities/projTargets';

/** ProjectileID.cs:35 字面（CreateBoolSet(false, …) 实参序，勿重排——差集断言按此钉位） */
const VANILLA_IS_A_WHIP_1457: readonly number[] = [
  847, 841, 848, 849, 912, 913, 914, 915, 952,
  1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1104,
];

describe('IS_A_WHIP_PROJS 与 1457 ProjectileID.cs:35 对齐', () => {
  it('长度 = 18（修正旧"17 型"注释漂移）', () => {
    expect(VANILLA_IS_A_WHIP_1457.length).toBe(18);
    expect(IS_A_WHIP_PROJS.size).toBe(18);
  });

  it('成员与原版字面完全一致（多一件少一件都红）', () => {
    expect([...IS_A_WHIP_PROJS]).toEqual(VANILLA_IS_A_WHIP_1457);   // 序=插入序，等价于逐位一致
    const missing = VANILLA_IS_A_WHIP_1457.filter((v) => !IS_A_WHIP_PROJS.has(v));
    const extra = [...IS_A_WHIP_PROJS].filter((v) => !VANILLA_IS_A_WHIP_1457.includes(v));
    expect(missing).toEqual([]);   // 原版有而本表缺
    expect(extra).toEqual([]);     // 本表有而原版无
  });

  it('关键锚型在表内：847 晨星鞭 / 1104 火鞭 / 1034 星座星（5479）/ 1035 花之暴行（5480）', () => {
    for (const id of [847, 1104, 1034, 1035]) expect(IS_A_WHIP_PROJS.has(id)).toBe(true);
  });
});
