// 一次性诊断：post-terrain 地表剖面 vs golden wld 最终地表剖面的相关性。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';

it('terrain surface correlation vs wld', () => {
  for (const seedText of ['12345', '9293480']) {
    const g = parseWld(new Uint8Array(readFileSync(`tests/golden/wld/${seedText}世界.wld`))).tiles;
    const { world } = runResetAndTerrain({ width: 4200, height: 1200, seedText, evil: seedText === '12345' ? 0 : 0 });
    const st = world.store;
    // 实心地面族匹配（跳过树/云/平台等非实心头顶物——活性首行全是树顶噪声）
    const GROUND = new Set([0, 1, 2, 23, 25, 53, 57, 59, 75, 76, 112, 116, 117, 123, 147, 161, 199, 203, 224, 396, 397, 398, 399, 400, 401, 402, 403, 404]);
    const ours: number[] = [], gold: number[] = [];
    for (let x = 0; x < 4200; x++) {
      let oy = -1, gy = -1;
      for (let y = 0; y < 1200; y++) {
        const i = y * 4200 + x;
        if (oy < 0 && st.flags[i] && GROUND.has(st.type[i])) oy = y;
        if (gy < 0 && g.active[i] && GROUND.has(g.type[i])) gy = y;
        if (oy >= 0 && gy >= 0) break;
      }
      ours.push(oy); gold.push(gy);
    }
    // 相关系数 + lag 扫描（若整图平移，某 lag 下相关性会飙升）
    const n = ours.length;
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / n;
    const mo = mean(ours), mg = mean(gold);
    const corr = (lag: number) => {
      let num = 0, so = 0, sg = 0, cnt = 0;
      for (let x = 0; x + lag < n && x < n - lag; x++) {
        const o = ours[x] - mo, gg = gold[x + lag] - mg;
        num += o * gg; so += o * o; sg += gg * gg; cnt++;
      }
      return num / Math.sqrt(so * sg);
    };
    const lags: Array<[number, number]> = [];
    for (let lag = -300; lag <= 300; lag += 10) lags.push([lag, corr(lag)]);
    lags.sort((a, b) => b[1] - a[1]);
    console.log(`${seedText}: corr(lag0)=${corr(0).toFixed(3)} best=[lag ${lags[0][0]}, r=${lags[0][1].toFixed(3)}] top3=${lags.slice(0, 3).map((l) => `${l[0]}:${l[1].toFixed(2)}`).join(' ')}`);
  }
});
