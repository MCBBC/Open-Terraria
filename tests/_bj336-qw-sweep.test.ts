// ★BJ336 一次性探针②（单籽，SW_BJ336=1 + SW_BJ336_SEED 驱动；shell 逐籽起进程）：
// 1200×850 生成 → 每个 vanilla 进度窗（label 变化）即同步直写 stdout 计数快照。
// Corruption 拒绝环会挂死进程——外部看门狗 kill；log 里 label='20'（Corruption 窗开）
// 出现即证明 Underworld 相（含其 quickWater）已完成。
import { describe, it, expect, afterAll } from 'vitest';
import { writeSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const HEAVY = process.env.SW_BJ336 === '1';
const SEED = process.env.SW_BJ336_SEED ?? '314159';

function say(line: string): void {
  try { writeSync(1, `[bj336s:${SEED}] ${line}\n`); } catch { /* fd */ }
}

describe('BJ336 扫描: 1200×850 逐窗计数', () => {
  afterAll(() => { LiquidSim.settleEv = null; });

  it.skipIf(!HEAVY)(`seed=${SEED}`, async () => {
    const t0 = Date.now();
    let sCalls = 0, oIters = 0, fFalls = 0, curCallO = 0, maxCallO = 0, maxCallAt = '', curOrigin = '';
    let lastLabel = '';
    LiquidSim.settleEv = (kind, tag) => {
      if (kind === 'S') {
        if (curCallO > maxCallO) { maxCallO = curCallO; maxCallAt = curOrigin; }
        curCallO = 0; curOrigin = tag; sCalls++;
      } else if (kind === 'O') { oIters++; curCallO++; }
      else if (kind === 'F') fFalls++;
    };
    try {
      await generateWorld(
        { width: 1200, height: 850, seedText: SEED, evil: 0 },
        (label) => {
          if (label !== undefined && label !== lastLabel) {
            lastLabel = label;
            say(`label=[${label}] t=${((Date.now() - t0) / 1000).toFixed(2)}s S=${sCalls} O=${oIters} F=${fFalls} maxCallO=${maxCallO}@${maxCallAt}`);
          }
        },
      );
      say(`DONE t=${((Date.now() - t0) / 1000).toFixed(2)}s S=${sCalls} O=${oIters}`);
    } finally {
      LiquidSim.settleEv = null;
    }
    expect(true).toBe(true);
  }, 600000);
});
