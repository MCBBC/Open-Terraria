// BJ282 多弹面全族普查——点名两件钉值 + 普查表结构锁（2026-09-22）
// 锚：Terarria1457 Player.cs ItemCheck_Shoot 逐型专支（1458 :48545/:48577 同文逐字节）。
// 症状=毒液法杖 2188 / 剧毒法杖 1308 只出 1 颗——原版多弹全在【发射侧逐型专支】，
// 无通用 spread 循环、无 AI 分裂；此前全落本仓 magic 通用尾支=每击 1 发。
import { describe, it, expect } from 'vitest';
import {
  venomStaffVolleyRoll, toxicStaffVolleyRoll, vampireKnifeVolleyRoll, stepSpreadVelocity,
} from '../src/core/Game';
import { projectileData } from '../src/data/vanillaProjectiles';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

/** C# Next(min,max) 语义的单点验证：floor(rnd*71)-35 ∈ [-35,35]（Next(-35,36)） */
const nrand35 = (rnd: () => number): number => Math.floor(rnd() * 71) - 35;

describe('BJ282-T1 点名两件掷数钉值（发射数量语义=专支 numShots 循环）', () => {
  it('毒液法杖 2188：n=4+(1/3)+(1/4)+(1/5) —— 期望 4.7833、全域 [4,7]（Player.cs:48547-48561）', () => {
    // 边沿映射（rnd=0 全命中增发档；rnd 贴 1 全不中）
    expect(venomStaffVolleyRoll(() => 0)).toBe(7);          // 三档全 +1
    expect(venomStaffVolleyRoll(() => 0.999999)).toBe(4);   // 三档全不中
    // 单档命中验证：floor(r×c)==0 ⇔ r<1/c —— r=0.3：1/3 档命中、1/4·1/5 档不中
    expect(venomStaffVolleyRoll(() => 0.3)).toBe(5);        // 0.3*3=0.9→+1；0.3*4=1.2/0.3*5=1.5→不+1 ⇒ 5
    expect(venomStaffVolleyRoll(() => 0.4)).toBe(4);        // 三档全不中（0.4 ≥ 1/3,1/4,1/5? 0.4<1/2... 0.4*3=1.2→不+1）
    let min = 99, max = -1, sum = 0;
    const N = 40000;
    for (let i = 0; i < N; i++) {
      const n = venomStaffVolleyRoll(Math.random);
      min = Math.min(min, n); max = Math.max(max, n); sum += n;
    }
    expect(min).toBe(4);
    expect(max).toBe(7);
    expect(sum / N).toBeGreaterThan(4.7833 - 0.06);   // E = 4 + 1/3 + 1/4 + 1/5
    expect(sum / N).toBeLessThan(4.7833 + 0.06);
  });

  it('剧毒法杖 1308：n=3+(1/3) —— 期望 3.3333、全域 [3,4]（Player.cs:48579-48602）', () => {
    expect(toxicStaffVolleyRoll(() => 0)).toBe(4);
    expect(toxicStaffVolleyRoll(() => 0.999999)).toBe(3);
    expect(toxicStaffVolleyRoll(() => 0.2)).toBe(4);      // 0.2*3=0.6 → floor 0 → +1
    expect(toxicStaffVolleyRoll(() => 0.5)).toBe(3);      // floor 1 → 不+1
    let min = 99, max = -1, sum = 0;
    const N = 40000;
    for (let i = 0; i < N; i++) {
      const n = toxicStaffVolleyRoll(Math.random);
      min = Math.min(min, n); max = Math.max(max, n); sum += n;
    }
    expect(min).toBe(3);
    expect(max).toBe(4);
    expect(sum / N).toBeGreaterThan(10 / 3 - 0.05);
    expect(sum / N).toBeLessThan(10 / 3 + 0.05);
  });

  it('吸血鬼飞刀 1569：n=4+(1/2)+(1/4)+(1/8)+(1/16) —— 期望 4.9375、全域 [4,8]（Player.cs:48629-48645）', () => {
    expect(vampireKnifeVolleyRoll(() => 0)).toBe(8);       // 四档全 +1
    expect(vampireKnifeVolleyRoll(() => 0.999999)).toBe(4);
    let min = 99, max = -1, sum = 0;
    const N = 40000;
    for (let i = 0; i < N; i++) {
      const n = vampireKnifeVolleyRoll(Math.random);
      min = Math.min(min, n); max = Math.max(max, n); sum += n;
    }
    expect(min).toBe(4);
    expect(max).toBe(8);
    expect(sum / N).toBeGreaterThan(4.9375 - 0.06);
    expect(sum / N).toBeLessThan(4.9375 + 0.06);
  });
});

describe('BJ282-T2 step 散布律（0.05×i 递增 + 归一；2188/1308/1569 同款）', () => {
  const speed = 14;
  it('首发展（i=0）= 原样：模长恰 speed、方向即瞄准向', () => {
    const v = stepSpreadVelocity(speed, 0, speed, 0.05, 0, Math.random);
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(speed, 6);
    expect(v.vy).toBe(0);
    expect(v.vx).toBeCloseTo(speed, 6);
  });
  it('i>0：jitter 后仍归一回 speed（模长恒等——与 1155 不归一不同款）', () => {
    for (let i = 1; i <= 6; i++) {
      const bx = speed * 0.7071, by = speed * 0.7071;
      const v = stepSpreadVelocity(bx, by, speed, 0.05, i, Math.random);
      expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(speed, 6);
    }
  });
  it('jitter 域 = Next(-35,36)×f：i=1 极值扫描（归一放大上界 speed/(speed−35f)）', () => {
    // 法向分量 = jy×speed/|v'|，|v'| ≥ speed−35f → 放大 ≤ speed/(speed−35f)
    // speed=14、35f=1.75 → 上界 = 1.75×(14/12.25) = 2.0
    let dmax = 0;
    for (let t = 0; t < 20000; t++) {
      const v = stepSpreadVelocity(speed, 0, speed, 0.05, 1, Math.random);
      dmax = Math.max(dmax, Math.abs(v.vy));
    }
    expect(dmax).toBeLessThanOrEqual(35 * 0.05 * (speed / (speed - 35 * 0.05)) + 1e-9);
    expect(dmax).toBeGreaterThan(1.2);   // 实际有散布（排 vacuous：35×0.05=1.75 域非零）
  });
  it('Next(-35,36) 单点域 = [-35,35]', () => {
    expect(nrand35(() => 0)).toBe(-35);
    expect(nrand35(() => 0.4999)).toBe(0);
    expect(nrand35(() => 0.999999)).toBe(35);
  });
});

describe('BJ282-T3 普查表结构锁（vanilla-itemcombat 数据面 × SetDefaults 终值）', () => {
  // 表：vid → (数据面键, shoot, shootSpeed, 每击弹数语义, 归属专支行号)
  const CENSUS: Array<{
    vid: number; key: string; shoot: number; shootSpeed: number;
    dmg: number; useTime: number; volley: string; kind: 'magic' | 'melee' | 'ranged';
  }> = [
    { vid: 2188, key: 'vi_2188_VenomStaff', shoot: 355, shootSpeed: 14, dmg: 44, useTime: 30, volley: '4+(1/3)+(1/4)+(1/5)=4..7 归一 step0.05', kind: 'magic' },
    { vid: 1308, key: 'vi_1308_PoisonStaff', shoot: 265, shootSpeed: 13.5, dmg: 43, useTime: 36, volley: '3+(1/3)=3..4 归一 step0.05', kind: 'magic' },
    { vid: 1801, key: 'vi_1801_BatScepter', shoot: 316, shootSpeed: 10, dmg: 45, useTime: 12, volley: 'Next(2,4)=2..3 平律±0.05 不归一（实体侧 Arrow.bat316Pending）', kind: 'magic' },
    { vid: 1930, key: 'vi_1930_Razorpine', shoot: 336, shootSpeed: 12, dmg: 48, useTime: 8, volley: '2+Next(3)=2..4 归一 step0.025+前移×(n−i)×1.75（实体侧 Arrow.rp30Pending）', kind: 'magic' },
    { vid: 1931, key: 'vi_1931_BlizzardStaff', shoot: 337, shootSpeed: 10, dmg: 58, useTime: 5, volley: '恒2发天降+ai1=Next(5)（实体侧 Arrow.blz337Pending 同拍双锥）', kind: 'magic' },
    { vid: 3870, key: 'vi_3870_ApprenticeStaffT3', shoot: 711, shootSpeed: 14, dmg: 100, useTime: 20, volley: '恒3连扇 v₀=×0.8 RotatedBy(k×π/180×−dir)', kind: 'magic' },
    { vid: 1569, key: 'vi_1569_VampireKnives', shoot: 304, shootSpeed: 15, dmg: 29, useTime: 16, volley: '4+(1/2)+(1/4)+(1/8)+(1/16)=4..8 归一 step0.05（Game case shot 专支,dmgKind=melee）', kind: 'melee' },
    { vid: 1156, key: 'vi_1156_PiranhaGun', shoot: 190, shootSpeed: 14, dmg: 40, useTime: 30, volley: '顶满 3−alive ±0.05（既有 Arrow.piranhaStep 状态机,本批复核）', kind: 'ranged' },
  ];
  for (const row of CENSUS) {
    it(`vid ${row.vid} ${row.key}：注册+combat 终值（SetDefaults 权威）`, () => {
      expect(VANILLA_ITEM_KEY_BY_ID[row.vid]).toBe(row.key);
      const iid = ITEM_BY_KEY[row.key];
      expect(ITEM_DEFS[iid]).toBeDefined();
      const c = itemCombat(row.vid)!;
      expect(c.shoot).toBe(row.shoot);
      expect(c.shootSpeed).toBe(row.shootSpeed);
      expect(c.damage).toBe(row.dmg);
      expect(c.useTime).toBe(row.useTime);
    });
  }
  it('弹幕数据面：355 穿透5/寿命58、265 穿透3/寿命37、190/316/336/337/304/711 在册', () => {
    expect(projectileData(355)!.penetrate).toBe(5);
    expect(projectileData(355)!.timeLeft).toBe(58);
    expect(projectileData(265)!.penetrate).toBe(3);
    expect(projectileData(265)!.timeLeft).toBe(37);
    for (const pid of [190, 316, 336, 337, 304, 711]) {
      expect(projectileData(pid)).toBeDefined();
    }
  });
  it('1156 无 useAmmo（无弹药面锁——useAmmo 缺省非 40 箭）', () => {
    const c = itemCombat(1156)!;
    expect(c.useAmmo).toBeUndefined();
    expect(c.ranged).toBe(true);
  });
});
