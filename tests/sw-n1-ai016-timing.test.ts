// SW-N1 2026-09-03 回归（投掷弹道时序四件挂账）：① vy 终端钳移除（原版 :48394
//   `velocity.Y += 0.2f` 无钳;AI_016 唯一合法钳=911 ±8 :48393-48396）② 软着陆
//   钳速残差/settle 拍（:48377 门 vy==0 判 × 响应支 :19877-19886 lastVy≤0.7 不写
//   vy → 摩擦序列晚 1 拍启动,休止态每拍恰一次 ×0.97）③ 519 帧推进含爆拍
//   （:47951 函数体深度 1、位 Kill 判 :48030-48037 之前——SW-L1「else 支内爆拍
//   跳过」前提证伪）④ 反弹 ×0.8 族=仅 29（:19872-19875/:19880-19883）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { GrenadeProj, bombFishFrameTick } from '../src/entities/WeaponProj';
import type { GameHooks } from '../src/entities/types';

function mkGame(floorRow = -1) {
  const w = new World(80, 60, 30, 'open');
  if (floorRow >= 0) for (let x = 0; x < 80; x++) w.store.setTileSilent(x, floorRow, 1, 0, 0);
  return { w, g: { world: w, player: null, enemies: () => [], critters: () => [], cutTile: () => {} } as unknown as GameHooks };
}

describe('SW-N1 AI_016 时序四件', () => {
  it('①无钳：28 自由落体 vy 突破 16（:48394 逐字,85 拍恒 +0.2）', () => {
    const { g } = mkGame();                              // 无地板
    const p = new GrenadeProj(640, 100, 0, 0, 100, 3600, 28, () => {});
    for (let i = 0; i < 90; i++) p.fixedUpdate(0, g);
    expect(p.vy).toBeCloseTo(17, 9);                     // 0.2×85 拍（门 5 拍后）
    expect(p.vy).toBeGreaterThan(16);                    // 旧 16 封顶会削平——移除实证
  });
  it('②相位拍序：软着陆 settle 拍无摩擦,休止态每拍恰一次 ×0.97', () => {
    const { g } = mkGame(50);                            // 面顶=800
    const p = new GrenadeProj(640, 800 - 22 - 1, 3, 0, 100, 3600, 28, () => {});  // 底 799=面上 1px
    const seq = [p.vx];
    for (let i = 0; i < 11; i++) { p.fixedUpdate(0, g); seq.push(p.vx); }
    expect(seq[6]).toBeCloseTo(3 * 0.97, 12);            // t6 门开拍 vy==0 → 摩擦#1
    expect(seq[7]).toBe(seq[6]);                         // t7 空中 vy≠0 无摩擦
    expect(seq[8]).toBe(seq[6]);                         // t8 落地拍（AI 时 vy=0.4≠0,残差 0.4 存活）
    expect(seq[9]).toBe(seq[6]);                         // t9 settle 拍（vy=残差≠0 门假）
    expect(seq[10]).toBeCloseTo(3 * 0.97 ** 2, 12);      // t10 起休止态每拍恰一次
    expect(seq[11]).toBeCloseTo(3 * 0.97 ** 3, 12);
  });
  it('③519 帧：爆拍（fuse=14 第 12 拍）帧推进含入——首翻帧恰在爆拍达成', () => {
    const { g } = mkGame();
    const p = new GrenadeProj(640, 704, 0, 0, 100, 14, 519, () => {});
    for (let i = 0; i < 12 && !p.dead; i++) p.fixedUpdate(0, g);
    expect(p.dead).toBe(true);                           // --fuse≤2 于第 12 拍爆
    let st = { fuseAge: 0, counter: 0, frame: 0 };
    for (let i = 0; i < 12; i++) st = bombFishFrameTick(st);
    expect(p.bombFishFrame).toBe(st.frame);              // 12 次推进全含（爆拍照跑）
    expect(p.bombFishFrame).toBe(1);                     // 首翻第 12 拍（I1 钉面）
  });
  it('④反弹 ×0.8 族收窄：637 落地反弹纯 ×−0.4,29 才有 ×0.8 追加', () => {
    const drop = (id: number) => {
      const { g } = mkGame(50);
      const p = new GrenadeProj(640, 800 - 10 - 55, 0, 0, 100, 3600, id, () => {});
      let prev = p.vy;
      for (let i = 0; i < 60; i++) {
        prev = p.vy;
        p.fixedUpdate(0, g);
        if (p.vy < 0) break;                             // 首负拍=反弹拍
      }
      return { bounce: p.vy, lastVy: prev + 0.2 };
    };
    const d637 = drop(637);
    const d29 = drop(29);
    expect(d637.bounce).toBeCloseTo(-0.4 * d637.lastVy, 6);            // 无 ×0.8
    expect(d29.bounce).toBeCloseTo(-0.4 * 0.8 * d29.lastVy, 6);        // 29 有 ×0.8
  });
});
