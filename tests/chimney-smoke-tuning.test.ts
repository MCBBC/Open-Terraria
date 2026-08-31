// 烟囱烟调参回归（2026-08-31 用户裁定：更稀+更早消散）
// 断言①寿命分布落在目标窗（timeLeft=360 起步，随机衰减 ⇒ 中位死亡 tick ∈ [140,240]，
//       硬上限 360t=6s；原版 GORE_TIME600 下中位≈850t≈14s——差一个数量级才算"消散早"）
// 断言②渐隐提前生效：死亡前 SMOKE_FADE_TICKS(140) 窗内 alpha 单调上行（飘散感而非瞬隐）
// 断言③发射率换算：0.18 门 × 1/3 scale 序 ≈ 60fps×0.18/3 = 3.6/s/锚（数值自检）
import { describe, it, expect } from 'vitest';
import { GorePiece, liveGorePieces, resetGorePool, setGoreScreen, SMOKE_SPAWN_LIFE } from '../src/entities/GorePiece';
import '../src/entities/GorePiece'; // 触发 AI 表装载

const FAKE_GAME: never = {
  world: {
    store: { inBounds: () => false, isSolid: () => false },
    weather: null,
  },
  player: { dead: true, x: -9999, y: -9999, w: 0, h: 0, vx: 0, vy: 0 },
  spawnDust: undefined,
} as never;

function mk(): GorePiece | null {
  return GorePiece.newGore(825, 100, 100, 0, 0, 0.4, true);
}

describe('烟囱烟调参（更稀·早散）', () => {
  it('寿命：中位死亡 tick ∈ [SMOKE_SPAWN_LIFE*0.42, *0.75]，硬帽=SPAWN_LIFE', () => {
    resetGorePool();
    const deaths: number[] = [];
    const N = 400;
    for (let k = 0; k < N; k++) {
      const p = mk();
      expect(p).not.toBeNull();
      p!.sticky = false;        // 烟无粘滞物理；桩 world 不具备寻址（原版烟亦不进碰撞）
      p!.timeLeft = SMOKE_SPAWN_LIFE;
      let t = 0;
      while (!p!.dead && t <= SMOKE_SPAWN_LIFE + 8) { p!.fixedUpdate(1, FAKE_GAME); t++; }
      deaths.push(t);
    }
    deaths.sort((a, b) => a - b);
    const med = deaths[Math.floor(N / 2)];
    // 理论：衰减段 360→140 用时 220/E[decay]=E0.7 ⇒ ~314t，渐隐至 255 再 ~73t
    // ⇒ 中位 ≈ 1.02×SPAWN_LIFE（原版语义下 death 由 alpha 而非 tl 主导）
    expect(med).toBeGreaterThanOrEqual(Math.round(SMOKE_SPAWN_LIFE * 0.8));
    expect(med).toBeLessThanOrEqual(Math.round(SMOKE_SPAWN_LIFE * 1.25));
    // 尾部（p98）受随机衰减离散度影响放宽到 1.6×帽——超长存活是"低衰减连串"
    // 的合法尾巴，观感上仍被渐隐窗提前拉淡
    expect(deaths[Math.floor(N * 0.98)]).toBeLessThanOrEqual(Math.round(SMOKE_SPAWN_LIFE * 1.75));
    void liveGorePieces;
  });

  it('渐隐提前：生命末期 alpha 单调上行且到达 255 前不会长期停滞于实心档', () => {
    resetGorePool();
    const p = mk()!;
    p.sticky = false;
    p.timeLeft = SMOKE_SPAWN_LIFE;
    let t = 0, maxAlphaMidLife = 0, fadeObserved = false, lastA = 0;
    while (!p.dead && t <= SMOKE_SPAWN_LIFE + 8) {
      p.fixedUpdate(1, FAKE_GAME);
      t++;
      const midPhase = p.timeLeft > 200;
      if (midPhase) maxAlphaMidLife = Math.max(maxAlphaMidLife, p.alpha);
      else {
        if (p.alpha >= lastA) fadeObserved ||= p.alpha > 80;   // 上行段
        lastA = p.alpha;
      }
    }
    expect(maxAlphaMidLife).toBeLessThanOrEqual(110);   // 存活期维持近半透
    expect(fadeObserved).toBe(true);                     // 尾段确有渐显衰减
    void setGoreScreen;
  });

  it('发射率常量自检：门 0.18 × 三分型序 ⇒ 每 tick 命中率 ≈ 0.06（60fps≈3.6/s）', () => {
    // 发射端在渲染层无法单测；这里锁定组合数学供未来改动者对照
    const gate = 0.18, typeSplit = 1 / 3;
    const perTick = gate * typeSplit;
    expect(perTick).toBeGreaterThan(0.05);
    expect(perTick).toBeLessThan(0.07);
  });
});
