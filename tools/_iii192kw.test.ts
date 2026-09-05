// IIII192 一次性取证（零主路径改动）：iamerror 链 Traps pass 巨石击杀域 KillTile 台账。
// 背景：#71 巨石臂修复后 mile8 新前沿 #76 Traps (1801,607) T0>138×12——vanilla
// Traps pass 杀了 3 座巨石+左半滚刺，JS 只杀左半滚刺。本探针挂 __swKill190
// （killTileGen 入口逐杀钩）记录 (1794..1806, 604..619) 窗全部 KillTile 呼叫+栈，
// 用于与 x86 rig SW_KILLWATCH 栈账对表。
// 用法：cd game && SW_KW=1 npx vitest run tools/_iii192kw.test.ts
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_KW === '1';

(RUN ? it : it.skip)('killwatch probe: boulder/cactus kill ledger', async () => {
  const g = globalThis as unknown as {
    __swKill190?: (draws: number, x: number, y: number, sheet: number, fx: number, fy: number) => void;
  };
  const lines: string[] = [];
  g.__swKill190 = (draws, x, y, sheet, fx, fy) => {
    if (x >= 1794 && x <= 1806 && y >= 604 && y <= 619) {
      const stk = (new Error().stack ?? '')
        .split('\n')
        .slice(2, 10)
        .map((s) => {
          const m = s.match(/\(?([^\s()]*\.ts):(\d+):\d+/);
          return m ? `${m[1]!.split('/').pop()}:${m[2]}` : '';
        })
        .filter(Boolean)
        .join('<');
      const line = `KW (${x},${y}) sheet${sheet} fx${fx} fy${fy} draws${draws} by ${stk}`;
      lines.push(line);
      console.log(line);
    }
  };
  try {
    await generateWorld({ width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103' });
  } finally {
    g.__swKill190 = undefined;
  }
  console.log(`total KW lines: ${lines.length}`);
}, 600_000);
