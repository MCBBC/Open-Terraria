// ★BJ427-W2 定谳刀（2026-10-01）：液体变更→光照响应链判别测试。
//  【定谳摘要】（探针 scripts/_bj427-w2-light-verdict.mjs 实测+反编译锚）
//   · 原版语义：全图光照每绘制帧重扫（Main.cs:63093 LightTiles→四态轮转）,液体
//     变更无专项通知面,最坏 ≤4 绘制帧;岩浆=扫描内逐格发射（TileLightScanner.cs:
//     110-152 ApplyLiquidLight,liquid>0 即发射）。
//   · 登记案「裸 setLiquid 左半池黑区 240+ 帧不散」=探针伪影（区域几何裁剪）:
//     本仓 ensureRegion 锚玩家（Game.ts:12202）vs 原版 GetAreaToLight 锚相机
//     （Main.cs:64888）——探针把玩家瞬移 bx+60 后区域左缘=bx-9,池左半在区外
//     lightAt=[0,0,0]。裸 setLiquid 实测 2 帧点亮（S1）,touch 助推无差（S2）。
//   · 真病（本判别测试所钉）：LiquidSim 流动直写 st.liquid[] 不入 tileWriteLog
//     → worker+delta 路径（缺省开）流动格光照随 ~120 帧锚帧才投递（paired 实测
//     worker ch3 lit@215≈第二锚 vs local lit@158）——本刀在 AddWater/DelWater
//     记账点（Liquid.cs:1189/:1583 同位）补推送;Game.netApplyLiquid 直写面同刀
//     补账（清偿 C9d2 登记债）。残差（在列格 >0→>0 液量微差）延迟至锚帧自愈,登记。
//  本测试锁定:①流动接收格/排空格入写日志（判别面:修复前红）;②本地路径液体
//  变更→光照 ≤3 tick 收敛（嫌疑①「节流延迟」反证钉）;③onLiquidChanged→引擎
//  liquidDirty 链（登记面所引 LightingEngine.ts:187 行为钉）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { LightingEngine } from '../src/lighting/LightingEngine';

/** 清出实验腔（世界生成残留排除;顶 by 行到底 by+2 行全空气,底 by+3 行实心可选） */
function clearedChamber(st: TileStore, x0: number, x1: number, y0: number, y1: number): void {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      st.setTileSilent(x, y, 0);
      if (st.liquid[st.idx(x, y)] !== 0) { st.liquid[st.idx(x, y)] = 0; st.liquidType[st.idx(x, y)] = 0; }
    }
  }
}

describe('BJ427-W2 ① sim 流动格入光照差量写日志（判别面:修复前红）', () => {
  // 液种用水:岩浆有 5 拍 delay 降速门（update 头 lavaCheck 支）,水无 delay 即流;
  // 记账点在 AddWater/DelWater(液种无关),判别力不受液种影响。
  it('下流接收格（AddWater 记账点）入 tileWriteLog', () => {
    const w = new World(40, 40, 17, 'bj427-w2-down');
    const st = w.store;
    const sim = new LiquidSim(w);
    clearedChamber(st, 8, 12, 8, 14);
    // 浇水 255 于 (10,10)（setLiquid=记账原语）;清日志后 step——下流转移到 (10,11)
    st.setLiquid(10, 10, 255, 1);
    sim.addWater(10, 10);
    const log: number[] = [];
    st.tileWriteLog = log;
    sim.step();
    expect(st.liquid[st.idx(10, 11)]).toBeGreaterThan(0);          // 流动确已发生
    expect(log).toContain(st.idx(10, 11));                          // ★判别:接收格入日志
  });

  it('源格排空归零（DelWater 记账点）入 tileWriteLog——发射格消失面', () => {
    const w = new World(40, 40, 17, 'bj427-w2-drain');
    const st = w.store;
    const sim = new LiquidSim(w);
    clearedChamber(st, 8, 12, 8, 14);
    st.setLiquid(10, 10, 255, 1);
    sim.addWater(10, 10);
    const log: number[] = [];
    st.tileWriteLog = log;
    // 源格排空后其队列槽经 kill 清扫出列（wetCounter≥cycles≈10 步）→ DelWater
    for (let i = 0; i < 14; i++) sim.step();
    expect(st.liquid[st.idx(10, 10)]).toBe(0);                      // 源格 255 全量下流=归零
    expect(log).toContain(st.idx(10, 10));                          // ★判别:排空格入日志
  });

  it('静置液体零推账（C9d2 idle 面不退化:空队列 step 不产日志）', () => {
    const w = new World(40, 40, 17, 'bj427-w2-idle');
    const st = w.store;
    const sim = new LiquidSim(w);
    clearedChamber(st, 8, 12, 8, 14);
    st.setTileSilent(10, 11, 1);             // 满格坐底=稳定态
    st.setLiquid(10, 10, 255, 2);
    const log: number[] = [];
    st.tileWriteLog = log;                   // 场景写入后挂载（记账面只看 sim 段）
    sim.step();                              // 空队列（不唤醒）→ 零推账
    expect(log.length).toBe(0);
    expect(st.liquid[st.idx(10, 10)]).toBe(255);                    // 满格不流动
  });
});

describe('BJ427-W2 ② 本地路径液体变更→光照收敛（嫌疑①节流延迟反证钉）', () => {
  it('裸 setLiquid 后 ≤3 次 compute 内岩浆发射出现在公共面（原版 ≤4 绘制帧同相）', () => {
    const w = new World(60, 60, 17, 'bj427-w2-local');
    const st = w.store;
    clearedChamber(st, 20, 40, 20, 30);
    for (let x = 20; x <= 40; x++) st.setTileSilent(x, 31, 1);      // 底
    const eng = new LightingEngine({
      store: st, groundLevel: 10, lavaLine: 58,
      clock: { timeOfDay: 0.5, dayCount: 0 },
    });
    eng.ensureRegion(30 * 16, 25 * 16, 40, 30);                     // 区域含池
    eng.compute(0);                                                  // 收敛基线
    // 暗室:池腔石墙挡天空光（surfaceSky wallOk 门）
    for (let x = 20; x <= 40; x++) for (let y = 20; y <= 30; y++) st.setWall(x, y, 1);
    eng.dirty = true; eng.compute(0);
    const [r0] = eng.lightAt(30, 28);
    expect(r0).toBeLessThan(60);                                     // 基线:无液暗室
    for (let x = 29; x <= 31; x++) for (let y = 27; y <= 29; y++) st.setLiquid(x, y, 255, 2);  // 3×3 岩浆（裸写=gameplay 桶倒同原语）
    // 引擎订阅 onLiquidChanged→liquidDirty→compute 内 3-tick 节流全周期（≤3 tick）
    for (let i = 0; i < 3; i++) eng.compute(0);
    const [r1, g1, b1] = eng.lightAt(30, 28);
    expect(r1).toBeGreaterThanOrEqual(120);                          // 岩浆发射 R≈173-190
    expect(g1).toBeLessThan(r1); expect(b1).toBeLessThan(g1);        // R>G>B 岩浆色比
  });
});

describe('BJ427-W2 ③ onLiquidChanged→引擎 liquidDirty 链（LightingEngine.ts:187 行为钉）', () => {
  it('store.setLiquid 派发 liquidListeners→engine.liquidDirty 置位', () => {
    const w = new World(40, 40, 17, 'bj427-w2-sub');
    const st = w.store;
    const eng = new LightingEngine({
      store: st, groundLevel: 10, lavaLine: 38,
      clock: { timeOfDay: 0.5, dayCount: 0 },
    });
    expect(eng.liquidDirty).toBe(false);
    st.setLiquid(10, 10, 255, 2);
    expect(eng.liquidDirty).toBe(true);                              // 订阅面活体（区域无关）
    eng.liquidDirty = false;
    st.setLiquid(10, 10, 0, 0);                                      // 排空同通道
    expect(eng.liquidDirty).toBe(true);
  });
});
