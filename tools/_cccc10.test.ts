// CCCC 批·诊断⑪:(1546,552)/(4055,500)/(1064,709) ±60 窗 golden 57→58(雕像)与75→76(陷阱)
// 全量增量——找 vanilla 合法 wire 来源。一次性探针。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const G2 = '/tmp/sw-slp/g';
const W = 4200, H = 1200;
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const b8 = (idx: number, e: string) => new Uint8Array(readFileSync(gPath(idx, e)).buffer.slice(0));
const b16 = (idx: number, e: string) => new Uint16Array(readFileSync(gPath(idx, e)).buffer.slice(0));

const itIs = process.env.SW_CCCC === '10';

(itIs ? it : it.skip)('cccc golden traps near chests', async () => {
  for (const [cx, cy] of [[1546, 552], [4055, 500], [1064, 709]] as Array<[number, number]>) {
    for (const [a, b, tag] of [[57, 58, 'statues'], [75, 76, 'traps']] as Array<[number, number, string]>) {
      const ta = b16(a, 'typ'), aa = b8(a, 'act'), tb = b16(b, 'typ'), ab = b8(b, 'act');
      const chg: string[] = [];
      for (let y = cy - 60; y <= cy + 60; y++) for (let x = cx - 60; x <= cx + 60; x++) {
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const i = y * W + x;
        const va = aa[i]! ? ta[i]! : 0, vb = ab[i]! ? tb[i]! : 0;
        if (va !== vb) chg.push(`(${x},${y})${va}→${vb}`);
      }
      console.log(`golden ${a}→${b}(${tag}) near (${cx},${cy}) ±60: ${chg.length} 处 ${chg.slice(0, 24).join(' ')}`);
    }
  }
}, 300_000);
