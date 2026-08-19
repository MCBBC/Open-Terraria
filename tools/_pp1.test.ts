// 一次性诊断（PPPPP 批 #81 向日葵）：JS 槽末#35 的 27 格清单 vs 金标 081
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }

const RUN = process.env.SW_PP1 === '1';
(RUN ? it : it.skip)('list JS sunflowers at slot end 35', async () => {
  const out: string[] = [];
  await generateWorld({
    width: 4200, height: 1200, seedText: '9293480', evil: 0,
    onWorldPartial: (w, i) => {
      if (i !== 35) return;
      const st = w.store as { w: number; h: number; type: Uint16Array; flags: Uint8Array; idx(x: number, y: number): number };
      const cells: Array<[number, number]> = [];
      for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
        const k = st.idx(x, y);
        if (st.flags[k] && SHEET[st.type[k]] === 27) cells.push([x, y]);
      }
      out.push(`JS cells=${cells.length}`);
      // cluster into blocks: cell with no 27 above-left chain → anchor (bottom-left = max y, min x of block)
      const set = new Set(cells.map(([x, y]) => `${x},${y}`));
      const visited = new Set<string>();
      for (const [x, y] of cells) {
        if (visited.has(`${x},${y}`)) continue;
        // flood
        const stack: Array<[number, number]> = [[x, y]];
        const grp: Array<[number, number]> = [];
        while (stack.length) {
          const [cx, cy] = stack.pop()!;
          const key = `${cx},${cy}`;
          if (visited.has(key) || !set.has(key)) continue;
          visited.add(key); grp.push([cx, cy]);
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) stack.push([cx+dx, cy+dy]);
        }
        const xs = grp.map(g=>g[0]), ys = grp.map(g=>g[1]);
        out.push(`block x=${Math.min(...xs)} y=${Math.max(...ys)} w=${Math.max(...xs)-Math.min(...xs)+1} h=${Math.max(...ys)-Math.min(...ys)+1}`);
      }
    },
  });
  console.log(out.join('\n'));
}, 900_000);
