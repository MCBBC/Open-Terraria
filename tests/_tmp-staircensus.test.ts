import { describe, it } from 'vitest';
import { loadSaveData } from '../src/save/SaveFile';

const SAVE = '/Users/vinlic/Downloads/map-Starter_World (9).json';

describe('probe: stair-frame platform census', () => {
  it('classify platforms by frame column vs slope', async () => {
    const fs = await import('node:fs');
    const data = JSON.parse(fs.readFileSync(SAVE, 'utf8'));
    const { world } = loadSaveData(data);
    const st = world.store;
    // platform 内部 id：从标注格取
    const PLAT = st.type[st.idx(3199, 392)];
    let flat = 0, stairSlope = 0, stairNoSlope = 0;
    const noSlopeSamples: string[] = [];
    for (let y = 1; y < st.h - 1; y++) for (let x = 1; x < st.w - 1; x++) {
      const i = st.idx(x, y);
      if (st.type[i] !== PLAT) continue;
      const fx = st.frameX[i];
      if (fx < 144) { flat++; continue; }
      if (st.slope[i]) stairSlope++;
      else {
        stairNoSlope++;
        if (noSlopeSamples.length < 30) noSlopeSamples.push(`(${x},${y})fx=${fx}fy=${st.frameY[i]}`);
      }
    }
    console.log(`PLAT internal id=${PLAT}`);
    console.log(`平帧平台(<144)=${flat}  楼梯帧+slope=${stairSlope}  楼梯帧+slope=0=${stairNoSlope}`);
    console.log('楼梯帧无坡样本:', noSlopeSamples.join(' '));
    // 这些无坡楼梯帧平台的空间聚类（是否同一区域）
  });
});
