// 失谐系防御钳制回归守卫（2026-08-30）。
// 背景：原版"失谐门/哲学家之石"利用链 = ①雕像/篝火通电整块平移 frame
// （巴斯特雕像 506 六格 ±72 Wiring.cs:2536-2543、篝火 215 三×二 ±36
// ToggleCampFire :3021-3060，配合沙塌/扫格等放置怪癖把外来格叠进改帧区反复累积漂移）
// + ②掉落按帧线性反推无值域校验的 sink。已封死的无界 sink 两处：
//   · 门（styleDropVidOfFrames sheet 10/11）——越界钳回 Doors[0]=木门 25（C-4 口径）
//   · 火把（torchDropVid）——原版 KillTile case 4 的 default 分支本身就是无界
//     外推 dropItem=426+num（WorldGen.cs:65106-65163），合法域仅 0 与 8..23 +
//     彩炬连续段 1..7；我们改回落在 [0,23] 外即回落普通火把 8（刻意偏离原版的
//     有洞行为，勿"顺手对齐回来"）。
// 其余直读 helper（holidayLightVid/pileDecoDropVid/coinBandVid/gemLockKeyVid/
// echoResourceDropVid）均为有界段查+return 0 终止；~50 个 pick 表族自带 ?? t[0]
// 钳制——同类语义天然安全。★任何钳制块或值表的改动必须先过本文件。

import { describe, expect, it } from 'vitest';
import { styleDropVidOfFrames, torchDropVid, Doors } from '../src/data/vanillaStyleDrops';

const CLOSED = (fx: number, fy: number): number => styleDropVidOfFrames(10, fx, fy);
const OPEN = (fx: number, fy: number): number => styleDropVidOfFrames(11, fx, fy);

describe('失谐系防御钳制（door 支 styleDropVidOfFrames）', () => {
  it('A. Doors 表长锁定 69 档（GetDoorItem case 0..68；1457≡1456，C-1 补尾 9 档后）', () => {
    // 表长是封闭性断言的值域半径：扩表/缩表都会改变外推可达集，必须显式过审
    expect(Doors.length).toBe(69);
    // style 11 = 神庙锁门不掉档（表内唯一 0；消费侧 Game.breakTile 有 sv>0 门，
    // 与原版 DropDoorItem 的 doorItem!=0 门同构）
    expect(Doors[11]).toBe(0);
  });

  it('B. 域内 style 反推逐档正确（抽样锚点 + 全 69 档代码同式扫描）', () => {
    // 关门式 style = floor(fx/54)*36 + floor(fy/54)；合法帧 fx∈[0,53]、fy=54*style
    expect(CLOSED(0, 0)).toBe(25);        // style 0 木门
    expect(CLOSED(36, 54)).toBe(650);     // style 1 黑檀木门（fx 段内取整不受影响）
    expect(CLOSED(18, 54 * 4)).toBe(816); // case 4..8 共享 812+s
    expect(CLOSED(0, 54 * 11)).toBe(0);   // style 11 神庙锁门不掉档
    expect(CLOSED(0, 54 * 20)).toBe(1709);// case 20..23 共享 1709+s−20
    expect(CLOSED(0, 54 * 68)).toBe(6120);// 尾档巨石门（1457 新）
    // 开门式 style = floor(fx/72)*36 + floor(fy/54)（开态 fx = 72*列 + 36*[dir==−1]）
    expect(OPEN(36, 54 * 23)).toBe(1712); // 列 0：0*36+23
    expect(OPEN(108, 54)).toBe(3941);     // 列 1：36+1 = style 37
    // 全档扫描：期望值按【与被测代码同一分式】独立重算，防手算列号出错；
    // 扫描本身锁的是"域内查询恒等于查表终值"这一性质
    const expected = (sheet: 10 | 11, fx: number, fy: number): number => {
      const s = sheet === 10
        ? Math.floor(fx / 54) * 36 + Math.floor(fy / 54)
        : Math.floor(fx / 72) * 36 + Math.floor(fy / 54);
      return s >= 0 && s < Doors.length ? Doors[s] : Doors[0];
    };
    for (let s = 0; s < 69; s++) {
      const fxClosed = (s % 3) * 18;
      expect(CLOSED(fxClosed, 54 * s)).toBe(expected(10, fxClosed, 54 * s));
      if (s < 37) {
        expect(OPEN(36, 54 * s)).toBe(expected(11, 36, 54 * s));       // 开门列 0
      }
      if (s >= 36) {
        const col1 = Math.max(0, s - 36);
        expect(OPEN(108, 54 * col1)).toBe(expected(11, 108, 54 * col1)); // 开门列 1
      }
    }
  });

  it('C. 极端漂移帧输出恒 ∈ 门族值域（永不产生表外物品——嬗变目标 id 物理不可达）', () => {
    const family = new Set<number>(Doors);
    // 覆盖两式分母倍数、素数步长、超大数值：模拟失谐门装置任意累积终态
    for (const a of [1, 7, 36, 54, 61, 137, 1000, 65535]) {
      for (let k = 0; k <= 64; k++) {
        const fx = a * 1234 * k, fy = a * 777 * k;
        expect(family.has(CLOSED(fx, fy))).toBe(true);
        expect(family.has(OPEN(fx, fy))).toBe(true);
      }
    }
  });

  it('D. 越界/负值/NaN 统一钳回木门 25（C-4 口径：比原版 default→不掉更兜底）', () => {
    expect(OPEN(72 * 1_000_000, 54 * 99)).toBe(25);
    expect(CLOSED(54 * 999_999, 54)).toBe(25);
    expect(CLOSED(-54, -54)).toBe(25);                  // Math.floor 负除为负 style → 回落
    expect(OPEN(-72, 0)).toBe(25);
    expect(CLOSED(Number.NaN, Number.NaN)).toBe(25);    // NaN 比较恒 false → 视同越界
    expect(OPEN(72, Number.POSITIVE_INFINITY)).toBe(25); // Infinity 出域同理
  });
});

describe('失谐系防御钳制（torch 支 torchDropVid）', () => {
  // 原版 default=426+num 无界外推（WorldGen.cs:65162）；合法域 = 显式 case
  // {0,8..23} + 彩炬连续段 1..7。本组断言域内逐点一致 + 域外回落普通火把 8。
  it('域内：显式档命中表值、彩炬连续段走 426+style（与原版合法行为逐点一致）', () => {
    expect(torchDropVid(0)).toBe(8);      // 普通火把（case 0）
    expect(torchDropVid(1)).toBe(427);    // 彩炬段首（default 连续式）
    expect(torchDropVid(7)).toBe(433);    // 彩炬段尾
    expect(torchDropVid(8)).toBe(523);    // case 8 起显式档
    expect(torchDropVid(22)).toBe(5293);
    expect(torchDropVid(23)).toBe(5353);  // 合法域上界
  });

  it('域外：≥24 / 负值 / NaN / 非整数 一律回落族基物品 8（封死无界外推）', () => {
    for (const s of [24, 25, 100, 10000, -1, -100, Number.NaN, 4.5, Number.POSITIVE_INFINITY]) {
      expect(torchDropVid(s as number)).toBe(8);
    }
  });
});
