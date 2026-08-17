// (22,664).slope 溯源（env 门控=SW_165S=1）：逐槽采样目标格 half/slope + 邻域，
// 定位 JS 管线把 slope 写成 2 的槽位（该格 vanilla 实为 0——17/17 补丁实验反证）。
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_165S === '1';
const W = 4200, H = 1200;
const TX = 22, TY = 664;

(RUN ? it : it.skip)('trace slope at (22,664) per slot', async () => {
  const hist: string[] = [];
  let prev = '';
  await generateWorld({
    width: W, height: H, seedText: '9293480', evil: 0,
    onWorldPartial: (w, i, name) => {
      const st = w.store;
      const cell = (x: number, y: number) => {
        const k = y * W + x;
        const t = st.type[k];
        return `${t > 0 ? '' : 'air'}${st.flags[k] ? 'A' : 'i'}h${st.half[k]}s${st.slope[k]}`;
      };
      const cur = `(${TX},${TY})=${cell(TX, TY)} up=${cell(TX, TY - 1)} dn=${cell(TX, TY + 1)} l=${cell(TX - 1, TY)} r=${cell(TX + 1, TY)}`;
      hist.push(`${String(i).padStart(2)} ${name}: ${cur}`);
    },
  });
  // 只打印变化点
  let last = '';
  for (const h of hist) {
    const state = h.split(': ')[1]!;
    if (state !== last) { console.log(h); last = state; }
  }
}, 600_000);
