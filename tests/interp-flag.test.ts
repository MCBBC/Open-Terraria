// ★interp 渲染插值旗闸（2026-10-15 转正缺省开,?interp=0 逃生门）——最小锁:
//  缺省开（node 域 location 缺席恒 true;用户验收一期+二期①②后明令转正）。
//  帧序/像素闸=scripts/_interp-probe.mjs 活机七验（静止 A/B 逐字节/120fps 位差
//  在途/还原旁证/60fps A/B 逐字节/实体快照/还原健康）。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';

describe('interp 旗', () => {
  it('缺省开（?interp=0 才关;node 域恒 true——误关会立即爆红）', () => {
    expect(Game.interp).toBe(true);
  });
});
