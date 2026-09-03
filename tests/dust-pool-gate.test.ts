// 尘池密度门回归（2026-09-03 用户实报"火箭尾焰 7-9 发消失复发+时有时无"定谳）。
// 病根：R2 密度门曾用 frac=slot/POOL（空槽【下标】分位）——512 池时游标快绕等价
// 真负载;6000 池扩容后游标漂进高分位后长期驻留（要 3000 次 spawn 才回绕）→
// 低负载被误判高压力 → 概率拒新尘。原版门等价真负载靠【从 0 头扫】（Dust.cs:106）。
// 修：frac=activeCount/POOL（update 全池遍历顺带重数）。本闸：游标漂移与门解耦。
import { describe, expect, it } from 'vitest';
import { VanillaDust } from '../src/fx/VanillaDust';

describe('尘池密度门：真负载语义（游标漂移解耦）', () => {
  it('低负载下游标漂到高分位仍恒收（旧 slot/POOL 语义在此判红）', () => {
    const vd = new VanillaDust();
    // 少量活尘（低负载）——把游标手动推进高分位（模拟 6000 池长期漂移驻留）
    for (let i = 0; i < 50; i++) vd.spawn(i * 16, 100, 8, 8, 31, 0, 0, 100, null, 1);
    // 逼游标漂移：再 spawn 一批直到 cursor 越过 4500（>0.75 分位）
    let guard = 0;
    while (guard++ < 20000) {
      const d = vd.spawn(100, 100, 8, 8, 31, 0, 0, 100, null, 1);
      if (d) d.active = false;   // 造完即杀（保持低负载,只推游标）
      // 通过连续 spawn+杀，游标随每次 spawn 前进
      if (guard > 5000) break;
    }
    // update 一轮（重数 activeCount——大部分已杀,低负载）
    vd.update(0, 0, 100000, 100000, 0, 0, null, null, null, null);
    // 高分位游标 + 低负载：50 连发全收（旧语义 frac=slot/POOL≈0.75+ → 概率拒→闪断）
    let accepted = 0;
    for (let i = 0; i < 50; i++) {
      if (vd.spawn(200, 100, 8, 8, 31, 0, 0, 100, null, 1)) accepted++;
    }
    expect(accepted).toBe(50);   // ≤50% 负载门恒不触发
  });

  it('真高负载密度门仍生效（activeCount>90% → 概率拒）', () => {
    const vd = new VanillaDust();
    // 灌满 >90% 池
    let filled = 0;
    for (let i = 0; i < 6000 && filled < 5600; i++) {
      const d = vd.spawn(i * 16, 100, 8, 8, 31, 0, 0, 100, null, 1);
      if (d) filled++;
    }
    vd.update(0, 0, 100000, 100000, 0, 0, null, null, null, null);
    // 活跃>90%：新 spawn 大概率被拒（50 次至少拒一次——旧语义恒拒率同;新语义靠计数）
    let accepted = 0;
    for (let i = 0; i < 50; i++) {
      if (vd.spawn(200, 100, 8, 8, 31, 0, 0, 100, null, 1)) accepted++;
    }
    expect(accepted).toBeLessThan(50);
  });
});
