// 诊断：用户报"模型根基"世界（seed 1814620304, 8400×2400）同屏三棵树底被花草/蘑菇占。
// 全管线重生成 → 逐树核查底格 + Flowers 覆盖门合规性（m<0.48w 或 m>0.52w）。
// ★IIIII259（测试世界档案化）：8400×2400 全量生成 ~3-6min→档案载入秒级
//   （loadFixtureWorld 'tb-8400-1814620304';World.trees 生成期登记不落 SaveData,
//   由档案侧车回填——生成端同拍采集,断言面同世界同断言）。与 _treebottom-view
//   共用同一档案（此前两文件各自整生成同一世界）。
import { describe, it } from 'vitest';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { loadFixtureWorld } from './world-fixtures';
import { fixtureMissing } from './world-fixtures';

// ★C档可移植:档案 gz 不入 git,缺档=skip
describe.skipIf(fixtureMissing('tb-8400-1814620304'))('tree-bottom audit seed 1814620304', () => {
  it('regen + scan', async () => {
    const world = loadFixtureWorld('tb-8400-1814620304');   // ★IIIII259 档案载入
    const st = world.store;
    const w = st.w;
    const trunk = TILE_BY_KEY['tree'] ?? -1;
    const anomalies: Array<{ x: number; y: number; sheet: number; fx: number; gate: string }> = [];
    let total = 0;
    for (const t of world.trees) {
      total++;
      const bx = t.x, by = t.y + t.h - 1;           // 干底格
      const i = st.idx(bx, by);
      const active = st.flags[i] !== 0;
      const type = st.type[i];
      const sheet = TILE_DEFS[type]?.vanilla?.sheet ?? -1;
      if (!active || sheet !== 5) {
        anomalies.push({
          x: bx, y: by, sheet: active ? sheet : -1,
          fx: st.frameX[i],
          gate: bx < w * 0.48 ? 'L48(树干条款)' : bx > w * 0.52 ? 'R52(任型)' : '★中带违规',
        });
      }
    }
    console.log(JSON.stringify({
      worldW: w, totalTrees: total, anomalies: anomalies.length,
      inBandViolations: anomalies.filter((a) => a.gate.startsWith('★')).length,
      nearPlayer: anomalies.filter((a) => a.x > 4500 && a.x < 4620),
      all: anomalies,
      crimson: (world as unknown as { crimson?: boolean }).crimson,
    }, null, 1));
  }, 600_000);
});
