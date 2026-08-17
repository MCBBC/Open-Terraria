// 一次性诊断（XX 批）：Tower precalc 路径流指纹对拍 x86（/tmp/hscmp/ds4444.txt）。
// SW_STREAM_PROBE=1 时 chainCheckpoints 逐检查点打印 stream 哈希；与 x86
// UpdateDungeonProgress 段界哈希比对（nfind2 反解的流位一并校验）。
import { describe, it } from 'vitest';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';

const X86: Record<string, string> = {
  // x86 ds4444.txt：phase → hash（段=发射时主流态；映射见任务报告）
  'dungeonL': '7e0620d4', 'dungeonE': 'b4788d7e', 'dungeonPD': 'b4788d7e',
  'dungeonPi': '46a8cd77', 'dungeonS': '53ec09c7', 'dungeonD': 'c81ebcf3',
  'dungeonW': 'e60851b9', 'dungeonP': 'b098b608', 'dungeonC': '812ba128',
  'dungeonB': 'ebff732e', 'dungeonG': '5e6a4925', 'dungeonI': '05eca67b',
  'dungeonT': '82f601fe', 'dungeonF': 'b98da0f5', 'dungeonPa': '9ea1e7a2',
  'dungeonBa': 'ef6c2d7a', 'dungeon': 'ef6c2d7a',
};

describe('tower precalc stream probe (s4444 vs x86)', () => {
  it('prints STREAM hashes at dungeon checkpoints', () => {
    process.env.SW_STREAM_PROBE = '1';
    (globalThis as Record<string, unknown>).__dgTowerTrace = {};
    const res = chainCheckpoints('4444', 0);
    console.log('TOWTRACE', JSON.stringify((globalThis as Record<string, unknown>).__dgTowerTrace));
    void res;
  }, 300000);
});
