// IIIII228 ⑦-2 DoNoSurfaceFillTheTop 顶带填充普查（molepeople 全链生成,节点侧）
import { describe, it, expect } from 'vitest';
// 重探针门控（70s 全链 gen×2）——SW_III228=1 才跑（SW_III226 判例）
const GATED = !!process.env.SW_III228;
import { generateWorld } from '../src/world/gen/WorldGen';

describe.skipIf(!GATED)('IIIII228 FillTheTop census', () => {
  it('molepeople 世界顶带（rows 20..90）大量活性格 + 洋面带豁免', async () => {
    const w = await generateWorld({ width: 4200, height: 1200, seedText: 'molepeople', evil: 0 });
    const st = w.store;
    let activeTop = 0, total = 0, waterTop = 0;
    for (let x = 100; x < 4100; x += 5) {
      for (let y = 20; y < 90; y += 2) {
        total++;
        const i = st.idx(x, y);
        if (st.flags[i] & 1) activeTop++;
        if (st.liquid[i] > 0) waterTop++;
      }
    }
    const ratio = activeTop / total;
    console.log(`[census] top-band active ratio=${ratio.toFixed(3)} water=${(waterTop/total).toFixed(3)}`);
    expect(ratio).toBeGreaterThan(0.25);     // 填充+后续开凿后残余大量活性（普通世界近 0）
    expect(w.seedFlags?.noSurface).toBe(true);
    // 对照：普通世界同一带近零活性（floating island 零星）
    const wn = await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
    const stn = wn.store;
    let an = 0, tn = 0;
    for (let x = 100; x < 4100; x += 5) for (let y = 20; y < 90; y += 2) { tn++; if (stn.flags[stn.idx(x, y)] & 1) an++; }
    console.log(`[census] normal top-band ratio=${(an/tn).toFixed(3)}`);
    expect(an / tn).toBeLessThan(0.05);
  }, 600000);
});
