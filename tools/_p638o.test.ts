// oracle livingtrees 检查点 191/192 簇对照（env 门控=SW_PO=1）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';

const RUN = process.env.SW_PO === '1';

interface CC { x0: number; y0: number; x1: number; y1: number; cells: number }

function clusters(w: number, h: number, hit: (i: number) => boolean): CC[] {
  const seen = new Uint8Array(w * h);
  const out: CC[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !hit(i)) continue;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, cells = 0;
    stack.length = 0; stack.push(i); seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % w, y = (j / w) | 0;
      cells++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && !seen[j - 1] && hit(j - 1)) { seen[j - 1] = 1; stack.push(j - 1); }
      if (x < w - 1 && !seen[j + 1] && hit(j + 1)) { seen[j + 1] = 1; stack.push(j + 1); }
      if (y > 0 && !seen[j - w] && hit(j - w)) { seen[j - w] = 1; stack.push(j - w); }
      if (y < h - 1 && !seen[j + w] && hit(j + w)) { seen[j + w] = 1; stack.push(j + w); }
    }
    out.push({ x0, y0, x1, y1, cells });
  }
  return out;
}

(RUN ? it : it.skip)('oracle lt cluster dump', () => {
  const typ = new Uint16Array(new Uint8Array(readFileSync('/tmp/cs-lt.typ')).buffer);
  const act = new Uint8Array(readFileSync('/tmp/cs-lt.act'));
  const W = 4200, H = 1200;
  const hit = (i: number) => act[i] !== 0 && (typ[i] === 191 || typ[i] === 192);
  const cc = clusters(W, H, hit);
  console.log(`oracle livingtrees 检查点：簇数=${cc.length} 格数=${cc.reduce((a, c) => a + c.cells, 0)}`);
  for (const c of [...cc].sort((a, b) => b.cells - a.cells).slice(0, 10)) {
    console.log(`  bbox[${c.x0},${c.y0}-${c.x1},${c.y1}] w=${c.x1 - c.x0 + 1} h=${c.y1 - c.y0 + 1} cells=${c.cells}`);
  }
  // 191/192 分别计数
  let t191 = 0, t192 = 0;
  for (let i = 0; i < W * H; i++) {
    if (act[i] && typ[i] === 191) t191++;
    if (act[i] && typ[i] === 192) t192++;
  }
  console.log(`191=${t191} 192=${t192}`);
}, 120_000);
