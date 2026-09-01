import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSaveData } from '../src/save/SaveFile';

it('recon user save terrain', () => {
  const json = readFileSync('/Users/vinlic/Downloads/map-Starter_World (25).json','utf8');
  const { world, data } = loadSaveData(JSON.parse(json));
  const st = world.store;
  // marks.player 瓦片坐标
  const P = (data as any).marks ? null : null;
  void P;
  const TX = 3353, TY = 363;
  console.log('player saved px:', JSON.stringify(data.player?.x), data.player?.y);
  // 站位±8×上下±6 的实体/坡面/半砖地形矩阵
  for (let ty = TY - 6; ty <= TY + 4; ty++) {
    let row = '';
    for (let tx = TX - 10; tx <= TX + 12; tx++) {
      const i = st.idx(tx, ty);
      const solid = st.isSolid(tx, ty);
      const sl = st.slope[i], hf = st.half[i], ty2 = st.type[i];
      if (!solid && !sl && !hf) { row += '.'; continue; }
      row += sl === 1 ? '/' : sl === 2 ? '\\' : sl === 3 ? '^' : sl === 4 ? 'v' : hf ? '_' : '#';
    }
    console.log(String(ty).padStart(4), row, `x${TX-10}..${TX+12} type@4510=${st.type[st.idx(TX-10+10,ty)]}`);
  }
  // 精确标注玩家所在列前后 ±2 的 slope/half
  for (let tx = TX - 3; tx <= TX + 3; tx++) {
    for (let ty = TY - 4; ty <= TY + 3; ty++) {
      if (st.isSolid(tx,ty) || st.slope[st.idx(tx,ty)] || st.half[st.idx(tx,ty)])
        console.log('cell',tx,ty,'type',st.type[st.idx(tx,ty)],'slope',st.slope[st.idx(tx,ty)],'half',st.half[st.idx(tx,ty)]);
    }
  }
}, 120000);
