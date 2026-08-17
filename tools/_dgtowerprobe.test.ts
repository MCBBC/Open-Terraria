// 一次性诊断（XX 批）：Tower precalc 路径流指纹对拍 x86（/tmp/hscmp/ds{4444,6666}.txt）。
// SW_STREAM_PROBE=1 时 chainCheckpoints 逐检查点打印 stream 哈希；与 x86
// UpdateDungeonProgress 段界哈希比对（nfind2.mjs 反解的流位一并校验）。
// 用法：SW_TPROBE_SEED=4444 npx vitest run tools/_dgtowerprobe.test.ts
//   x86 参照（ds 文件 phase→hash）：4444: L=7e0620d4 E=b4788d7e Pi=46a8cd77 S=53ec09c7
//   D=c81ebcf3 W=e60851b9 P=b098b608 C=812ba128 B=ebff732e G=5e6a4925 I=05eca67b
//   T=82f601fe F=b98da0f5 Pa=9ea1e7a2 Ba/End=ef6c2d7a（End@230486）
//   6666: L=12846c9c E=2ba36025 Pi=af161c59 S=760eb454 D=9e13ead0 W=853fea35
//   C=055d8bd3 ... End=f320cbb2（End@270397）
// __dgTowerTrace：爬升/塔体/平台段 dormant 计数（ns*/ap*=逐厅步数与余量）。
import { describe, it } from 'vitest';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';

describe('tower precalc stream probe (vs x86 ds trace)', () => {
  it('prints STREAM hashes at dungeon checkpoints', () => {
    process.env.SW_STREAM_PROBE = '1';
    (globalThis as Record<string, unknown>).__dgTowerTrace = {};
    const res = chainCheckpoints(process.env.SW_TPROBE_SEED ?? '4444', 0);
    console.log('TOWTRACE', JSON.stringify((globalThis as Record<string, unknown>).__dgTowerTrace));
    void res;
  }, 300000);
});
