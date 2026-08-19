// JJJJ：check3x3KF 决策探针
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
const RUN = process.env.SW_C3X === '1';
(RUN ? it : it.skip)('c3x probe', async () => {
  const hits: string[] = [];
  (globalThis as { __jjC3x?: (x: number, y: number, sh: number, bad: boolean, sup: boolean) => void }).__jjC3x
    = (x, y, sh, bad, sup) => { hits.push(`${x},${y} sh${sh} bad=${bad} sup=${sup}`); };
  try { await generateWorld({ width: 6400, height: 1800, seedText: '20260811', evil: 0 }); } catch { /* */ }
  console.log(`C3x 检查 ${hits.length} 次；杀 ${hits.filter((h) => h.includes('bad=true')).length} 次:`);
  console.log(hits.filter((h) => h.includes('bad=true')).slice(0, 20).join('\n'));
}, 900_000);
