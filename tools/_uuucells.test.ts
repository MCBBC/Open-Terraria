// UUU 批：5 差格精确邻域（SW_UUU=1 门控，跑完删）。带坐标逐格列出。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const RUN = process.env.SW_UUU === '1';
const G2 = '/tmp/sw-slp/g';
const W = 4200, H = 1200, N = W * H;

const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) {
  const m = /^(\d{3})_(.+)\.typ$/.exec(f);
  if (m) DUMPNAME.set(Number(m[1]), m[2]);
}
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const rd8 = (idx: number, ext: string) => new Uint8Array(readFileSync(gPath(idx, ext)).buffer.slice(0));
const rd16 = (idx: number, ext: string) => new Uint16Array(readFileSync(gPath(idx, ext)).buffer.slice(0));

(RUN ? it : it.skip)('UUU exact neighborhoods', () => {
  const t = [rd16(52, 'typ'), rd16(53, 'typ')];
  const a = [rd8(52, 'act'), rd8(53, 'act')];
  const hf = [rd8(52, 'half'), rd8(53, 'half')];
  const sl = [rd8(52, 'slope'), rd8(53, 'slope')];
  const fx = [rd16(52, 'typ'), rd16(53, 'typ')];
  void fx;
  const cells: Array<[number, number]> = [[2430, 662], [2427, 666], [2428, 664], [2679, 714], [2680, 714]];
  for (const [cx, cy] of cells) {
    console.log(`\n### (${cx},${cy})`);
    for (let dy = -3; dy <= 3; dy++) {
      const row: string[] = [];
      for (let dx = -3; dx <= 3; dx++) {
        const x = cx + dx, y = cy + dy;
        const i = y * W + x;
        const c52 = a[0][i] ? `${t[0][i]}${hf[0][i] ? 'h' : ''}${sl[0][i] ? 's' + sl[0][i] : ''}` : `·${sl[0][i] ? 'S' + sl[0][i] : ''}`;
        let c53 = '';
        const chg = a[0][i] !== a[1][i] || (a[0][i] && t[0][i] !== t[1][i]) || hf[0][i] !== hf[1][i] || sl[0][i] !== sl[1][i];
        if (chg) c53 = a[1][i] ? `→${t[1][i]}${hf[1][i] ? 'h' : ''}${sl[1][i] ? 's' + sl[1][i] : ''}` : '→·';
        row.push(`(${x},${y})=${c52}${c53}`);
      }
      console.log(row.join(' '));
    }
  }
}, 120_000);
