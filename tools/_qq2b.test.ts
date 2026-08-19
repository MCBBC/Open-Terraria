// QQQQQ ②b：s22222 #73 187→186 误转化定位——记录槽28 内 spreadGrass 转化格 + C3X2 事件。
// 用法：SW_QQ2B=1 npx vitest run tools/_qq2b.test.ts
import { it } from 'vitest';
const RUN = process.env.SW_QQ2B === '1';
import { generateWorld } from '../src/world/gen/WorldGen';

(RUN ? it : it.skip)('qq2b: c3x2 events during slot 28', async () => {
  const ev: string[] = [];
  const conv: string[] = [];
  const g = globalThis as {
    __swP3x2Log?: (s: string) => void;
    __swSpreadLog?: (x: number, y: number, d: number, gr: number) => void;
  };
  g.__swP3x2Log = (s) => ev.push(s);
  g.__swSpreadLog = (x, y, d, gr) => { if (x >= 1430 && x <= 1470 && y >= 215 && y <= 240) conv.push(`CONVERT ${x},${y} dirt${d}→${gr}`); };
  try {
    await generateWorld({ width: 4200, height: 1200, seedText: '22222', evil: 1 });
  } finally {
    g.__swP3x2Log = undefined;
    g.__swSpreadLog = undefined;
  }
  console.log(`c3x2 events=${ev.length}`);
  console.log(ev.filter((s) => s.includes('144') || s.includes('CONV')).slice(0, 60).join('\n'));
  console.log('--- conversions near pile ---');
  console.log(conv.slice(0, 80).join('\n'));
}, 300_000);
