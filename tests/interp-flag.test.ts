// ★interp 渲染插值旗闸（2026-10-14,?interp=1 灰度缺省关）——最小锁:
//  缺省关（node 域 location 缺席恒 false,防误转正）+快照初值哨兵（首步前不插）。
//  帧序/像素闸=scripts/_interp-probe.mjs 活机四验（静止 A/B 逐字节/120fps 位差
//  在途/还原旁证/60fps A/B 逐字节）。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';

describe('interp 旗', () => {
  it('node 域缺省关（?interp=1 才开;误转正会立即爆红）', () => {
    expect(Game.interp).toBe(false);
  });
});
