// ★IIIII218 天顶生成屏背景动效（CXCI §6② 移交三支）单元测试：
//   ① logo 动效状态机 logoDynamicsStep（Main.cs Update :17292 复位点 + DrawMenu
//      :49060-49132 remix 倒置摆动/drunk 自旋缩没分支逐字）；
//   ② 旗标派生 remixWorldGen/dontStarveWorldGen 新字段（genScreenFlagsOf）。
// 纯函数零 DOM；背景动效四形态实机面归 scripts/_iii218-zenithbg.mjs 探针。
import { describe, it, expect } from 'vitest';
import { logoDynamicsStep, LOGO_STATE_INITIAL, type LogoDynamicsState } from '../src/ui/TitleMenu';
import { genScreenFlagsOf } from '../src/vui/states/UIWorldLoadState';

const clone = (): LogoDynamicsState => ({ ...LOGO_STATE_INITIAL });

describe('IIIII218 · logo 动效状态机（Main.cs :49060-49132 逐字）', () => {
  it('remix 支：logo 倒置摆动（rotation 收敛于 3.04..3.22rad≈174°..184°,scale 0.9..1.0 呼吸）', () => {
    const s = clone();
    let consumed = 0;
    for (let i = 0; i < 900; i++) {
      if (logoDynamicsStep(s, { remixWorldGen: true, drunkWorldGen: true, notTheBees: true })) consumed++;
    }
    expect(consumed).toBe(900);                       // remix 支每帧消费
    // 摆动域（cs:3.04/3.06/3.22 三锚）：下沿=3.04 触发内联臂 −speed×0.0016 的过冲
    // 谷底（speed 满 −20 时单步 −0.032 → ~3.007），上沿=3.22+4e-5×20 过冲
    expect(s.rotation).toBeGreaterThanOrEqual(3.0);
    expect(s.rotation).toBeLessThanOrEqual(3.23);
    expect(Math.cos(s.rotation)).toBeLessThan(0);     // 倒置（>90°）
    // scale 呼吸：锚 1.0/0.9 只翻转加速度方向,±50 的 scaleSpeed 惯性使包络外扩
    // （900 帧仿真包络 [0.7878,1.1118]——原版同款"深呼吸"观感,非 0.9..1.0 硬钳）
    expect(s.scale).toBeGreaterThanOrEqual(0.78);
    expect(s.scale).toBeLessThanOrEqual(1.12);
    expect(s.rotationSpeed).toBeGreaterThanOrEqual(-20);
    expect(s.rotationSpeed).toBeLessThanOrEqual(20);  // cs:49085-49090 ±20 钳
  });

  it('drunk&&!notTheBees 支：1457 Update 复位门中和=净表现定格 scale 0.95/rotation 0', () => {
    const s = clone();
    for (let i = 0; i < 300; i++) logoDynamicsStep(s, { remixWorldGen: false, drunkWorldGen: true, notTheBees: false });
    expect(s.scale).toBeCloseTo(0.95, 5);             // :49090 scale−0.05/帧,次帧起 :17292 复位互锁
    expect(s.rotation).toBe(0);                       // 复位清 0 后分支以 speed=0 累转（净零）
    expect(s.rotationSpeed).toBeCloseTo(-1500, 5);    // :49079 每帧 ±1500（复位/加速逐帧交替）
  });

  it('drunk+notTheBees / 普通籽（null 旗标）→ 不接管（返回 false,CSS 摆动照旧）', () => {
    const a = clone();
    expect(logoDynamicsStep(a, { remixWorldGen: false, drunkWorldGen: true, notTheBees: true })).toBe(false);
    const b = clone();
    expect(logoDynamicsStep(b, null)).toBe(false);
    expect(b).toEqual(LOGO_STATE_INITIAL);            // 状态零扰动
  });

  it('天顶=getfixedboi 七旗全置时 remix 支优先（DrawMenu :49060 首分支）', () => {
    const s = clone();
    for (let i = 0; i < 600; i++) logoDynamicsStep(s, { remixWorldGen: true, drunkWorldGen: true, notTheBees: false });
    expect(s.scale).toBeLessThanOrEqual(1.12);        // remix 呼吸域（drunk 支会缩到 0/0.95）
    expect(Math.cos(s.rotation)).toBeLessThan(0);     // 倒置=remix 特征
  });
});

describe('IIIII218 · genScreenFlagsOf 新增 remix/dontStarve 派生', () => {
  it('remix 籽 → remixWorldGen=true;theConstant 籽 → dontStarveWorldGen=true', () => {
    expect(genScreenFlagsOf({ remix: true } as never)).toMatchObject({ remixWorldGen: true });
    expect(genScreenFlagsOf({ theConstant: true } as never)).toMatchObject({ dontStarveWorldGen: true });
  });
  it('天顶组合旗标全派生（背景动效四门齐备）', () => {
    const f = genScreenFlagsOf({
      everything: true, remix: true, drunkWorld: true, notTheBees: true,
      noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true,
    });
    expect(f).toMatchObject({
      zenithWorld: true, remixWorldGen: true, drunkWorldGen: true, drunkWorldGenText: true,
      notTheBees: true, noTrapsWorldGen: true, getGoodWorldGen: true, dontStarveWorldGen: true,
      tenthAnniversaryWorldGen: true,
    });
  });
});
