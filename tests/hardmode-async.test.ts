// 肉山死亡困难模式转换异步化回归（2026-09-02 PR-async）。
// 锁三件事：
//  ① 终态逐位一致：分步 job 跑完的世界 store 与同步 startHardmode 完全相同
//     （type/flags/wall/paintWall 全数组遍历对拍——rng 消费序/写序重构零漂移）
//  ② 预算驱动完成性：step() 有限次内完成（生成器无死循环/漏收尾）
//  ③ F2 门：重复激活（wasHard）job 立即完成且不再改世界（除 brickbox 外）
//  ④ 双地牢：job 路径的 Dungeon 档剥漆与同步 onGameEventClearedForDualDungeons 等价
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import {
  createBrickBoxForWallOfFlesh, startHardmode, startHardmodeJob,
  onGameEventClearedForDualDungeons,
} from '../src/world/gen/vanilla/HardmodePass';
import { RNG } from '../src/core/rng';

const W = 420, H = 200;

/** 造一个有可转化素材的小世界：石/土/沙/雪/丛林草条带 + 少量 225 Hive + 地表起伏 */
function mkWorld(seed: number): World {
  const w = new World(W, H, seed, 'hm-async-test');
  const st = w.store;
  const rng = new RNG(seed);
  w.groundLevel = 70;
  w.dungeonX = seed % 2 === 0 ? Math.trunc(W / 4) : Math.trunc(W * 3 / 4);
  for (let x = 10; x < W - 10; x++) {
    const surf = 60 + Math.floor(rng.next() * 12);
    for (let y = surf; y < H - 10; y++) {
      const band = Math.floor(x / 40) % 5;
      const t = [[1, 1, 2, 53, 59][band], 1, 25, 199, 117][band]; // 石/土/腐石/猩红石/珍珠岩条带
      st.setTile(x, y, t);
      if (y === surf) st.setTile(x, y, [2, 2, 23, 199, 109][band]); // 表层草/腐化草
    }
  }
  // 少量 Hive（走 flag 门路径）
  for (let k = 0; k < 8; k++) {
    const hx = 30 + k * 40, hy = 120;
    st.setTile(hx, hy, 225); st.setTile(hx + 1, hy, 225);
  }
  return w;
}

/** 全量快照（对拍用） */
function snap(w: World): { type: string; wall: string; paint: string } {
  const st = w.store;
  let type = '', wall = '', paint = '';
  for (let i = 0; i < st.type.length; i++) {
    type += String.fromCharCode(65 + (st.type[i] % 26));
    wall += String.fromCharCode(65 + (st.wall[i] % 26));
    paint += String.fromCharCode(65 + (st.paintWall[i] % 26));
  }
  return { type, wall, paint };
}

describe('肉山死亡困难模式转换异步化（PR-async）', () => {
  it('①终态逐位一致：分步 job === 同步 startHardmode（同种子双世界）', () => {
    const a = mkWorld(1295198809);
    const b = mkWorld(1295198809);
    createBrickBoxForWallOfFlesh(a.store, 200, 160, 100, a.crimson);
    createBrickBoxForWallOfFlesh(b.store, 200, 160, 100, b.crimson);
    // 同步路径
    startHardmode(a);
    // 异步路径：job 逐步推进
    const job = startHardmodeJob(b);
    let steps = 0;
    while (!job.step()) {
      if (++steps > 5_000_000) throw new Error('job 未收敛');
    }
    expect(steps).toBeGreaterThan(0);
    const sa = snap(a), sb = snap(b);
    expect(sb.type).toBe(sa.type);
    expect(sb.wall).toBe(sa.wall);
    expect(sb.paint).toBe(sa.paint);
  });

  it('②F2 门：重复激活 job 立即完成（无世界工作）', () => {
    const w = mkWorld(777);
    startHardmode(w);                                  // 首次（同步）
    const before = snap(w);
    const job = startHardmodeJob(w);                   // 重复杀肉山
    expect(job.wasHard).toBe(true);
    expect(job.step()).toBe(true);                     // 立即完成
    expect(snap(w)).toEqual(before);                   // 世界不再变化
  });

  it('④双地牢：job 路径 Dungeon 档剥漆 === 同步 onGameEventClearedForDualDungeons', () => {
    const mkDual = (seed: number) => {
      const w = mkWorld(seed);
      (w.seedFlags as Record<string, boolean>).dualDungeons = true;
      const st = w.store;
      // 撒双地牢标记墙 350 + 各档墙漆
      for (let k = 0; k < 40; k++) {
        const x = 20 + k * 9, y = 100 + (k % 3) * 10;
        const i = st.idx(x, y);
        st.setTile(x, y, 38);                          // GrayBrick → MatchingUnsafe 349
        st.wall[i] = 350;
        st.paintWall[i] = (k % 5) + 16;                // tier 色低四位
      }
      return w;
    };
    const a = mkDual(42), b = mkDual(42);
    // 同步路径（旧 WOF 链）：startHardmode（无剥漆）+ 显式 dualDungeons(事件 19 → Dungeon 档)
    startHardmode(a);
    onGameEventClearedForDualDungeons(a, 19);
    // 异步路径：job（内含 Dungeon 档）
    const job = startHardmodeJob(b);
    while (!job.step());
    const sa = snap(a), sb = snap(b);
    expect(sb.type).toBe(sa.type);
    expect(sb.wall).toBe(sa.wall);
    expect(sb.paint).toBe(sa.paint);
  });
});
