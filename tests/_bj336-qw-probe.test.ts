// ★BJ336 一次性探针（BJ328 件4 复现）：1200×850 生成 → Underworld 首 quickWater 内
// settleWaterAt 沉降环迭代形态观测。SW_BJ336=1 门（避免并行全量误跑）：
//   npx vitest run tests/_bj336-qw-probe.test.ts
// 观测通道：LiquidSim.settleEv（S=调用入场/O=外层迭代/F=下落/L=落点写回）计数 +
// fs.writeSync(1) 直写 stdout（沉降环为同步忙循环，异步日志不滚动，必须同步写）。
import { describe, it, expect, afterAll } from 'vitest';
import { writeSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const HEAVY = process.env.SW_BJ336 === '1';

function say(line: string): void {
  try { writeSync(1, `[bj336] ${line}\n`); } catch { /* fd 关闭 */ }
}

describe('BJ336 探针: 1200×850 quickWater 沉降环形态', () => {
  afterAll(() => { LiquidSim.settleEv = null; });

  it.skipIf(!HEAVY)('1200×850 全链生成（settleWaterAt 仪器化计数）', async () => {
    const t0 = Date.now();
    let sCalls = 0;          // settleWaterAt 调用数（'S' 事件）
    let oIters = 0;          // 外层沉降环迭代总数（'O' 事件）
    let fFalls = 0;          // 下落步数（'F' 事件）
    let curCallO = 0;        // 当前调用的外层迭代数
    let maxCallO = 0;        // 单调用外层迭代峰值
    let maxCallAt = '';      // 峰值调用 origin
    let curOrigin = '';      // 当前调用 origin（'S' tag）
    let lastO = '';          // 最后一个 'O' 位置
    const oHistogram = new Map<number, number>(); // 单调用 O 计数直方图（2 的幂分桶）

    LiquidSim.settleEv = (kind, tag) => {
      if (kind === 'S') {
        if (curCallO > 0) {
          if (curCallO > maxCallO) { maxCallO = curCallO; maxCallAt = curOrigin; }
          const bucket = Math.min(20, Math.ceil(Math.log2(curCallO + 1)));
          oHistogram.set(bucket, (oHistogram.get(bucket) ?? 0) + 1);
        }
        curCallO = 0;
        curOrigin = tag;
        sCalls++;
        if (sCalls % 100000 === 0) {
          say(`S=${sCalls} O=${oIters} F=${fFalls} curCallO=${curCallO} maxCallO=${maxCallO}@${maxCallAt} lastS=${tag} t=${((Date.now() - t0) / 1000).toFixed(1)}s`);
        }
      } else if (kind === 'O') {
        oIters++; curCallO++; lastO = tag;
        if (oIters % 2000000 === 0) {
          say(`O=${oIters} F=${fFalls} curCallO=${curCallO} origin=${curOrigin} lastO=${lastO} t=${((Date.now() - t0) / 1000).toFixed(1)}s`);
        }
      } else if (kind === 'F') {
        fFalls++;
      }
      // 'L'/'M'/'P' 不计（落点写回每调用至多一次）
    };

    try {
      const world = await generateWorld(
        { width: 1200, height: 850, seedText: '314159', evil: 0 },
        (label, p) => {
          if (label !== undefined) say(`pass=[${label}] p=${p.toFixed(3)} t=${((Date.now() - t0) / 1000).toFixed(1)}s S=${sCalls} O=${oIters}`);
        },
      );
      say(`DONE t=${((Date.now() - t0) / 1000).toFixed(1)}s`);
      expect(world.store.w).toBe(1200);
      // 汇总直方图
      const lines: string[] = [];
      for (const [b, n] of [...oHistogram.entries()].sort((a, b2) => a[0] - b2[0])) {
        lines.push(`  2^${b - 1}..2^${b}: ${n}`);
      }
      say(`settleWaterAt 调用=${sCalls} 外层迭代总数=${oIters} 下落=${fFalls} 单调用峰值=${maxCallO}@${maxCallAt}`);
      say(`单调用 O 直方图（2 的幂桶）:\n${lines.join('\n')}`);
    } finally {
      LiquidSim.settleEv = null;
    }
  }, 600000);
});
