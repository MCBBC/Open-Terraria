import { describe, it } from 'vitest';
import { loadSaveData } from '../src/save/SaveFile';
import { TILE_BY_KEY } from '../src/data/tiles';

describe('probe: pile object frame consistency census', () => {
  it('scan all 185/186/187 objects for per-cell frame grid violations', async () => {
    const fs = await import('node:fs');
    const b = JSON.parse(fs.readFileSync('/Users/vinlic/Downloads/map-Starter_World (11).json', 'utf8'));
    const st = loadSaveData(b).world.store;
    const SHEETS = new Set([185, 186, 187]);
    const ids = [185, 186, 187]
      .map((s) => [186, 187].indexOf(s) >= 0 || s === 185
        ? (TILE_BY_KEY[s === 185 ? 'v_185_decos_3x2_group_1'
          : s === 186 ? 'v_186_decos_3x2' : 'v_187_decos_3x2_group_2'] ?? -1)
        : -1);
    void ids;
    const P186 = TILE_BY_KEY['v_186_decos_3x2']!;
    const P187 = TILE_BY_KEY['v_187_decos_3x2_group_2']!;
    // 遍历锚点(左上格):fx%54==0 且 (右邻 fx+18、下邻 fy+18)
    let objs = 0, broken = 0;
    for (let y = 1; y < st.h - 2; y++) for (let x = 1; x < st.w - 3; x++) {
      const i = st.idx(x, y);
      const t = st.type[i];
      if (t !== P186 && t !== P187) continue;
      const sheet = t === P186 ? 186 : 187;
      const fw = 3, fx = st.frameX[i], fy = st.frameY[i];
      if (st.frameY[st.idx(x, y - 1)] === fy && st.type[st.idx(x, y - 1)] === t) continue; // 非顶行
      if (st.frameX[st.idx(x - 1, y)] !== fx && st.type[st.idx(x - 1, y)] === t
        && st.frameX[st.idx(x - 1, y)] % 54 !== fx % 54) { /* 并排物体边界 */ }
      if (st.type[st.idx(x - 1, y)] === t && st.frameY[st.idx(x - 1, y)] === fy
        && st.frameX[st.idx(x - 1, y)] < fx) continue;   // 非左缘
      objs++;
      // 校验 3×2 六格帧网格
      const bad: string[] = [];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) {
        const j = st.idx(x + dx, y + dy);
        const exp = `fx${fx + dx * 18},fy${fy + dy * 18}`;
        const got = st.type[j] === t ? `fx${st.frameX[j]},fy${st.frameY[j]}` : `type${st.type[j]}`;
        if (st.type[j] !== t || st.frameX[j] !== fx + dx * 18 || st.frameY[j] !== fy + dy * 18) {
          bad.push(`(${x + dx},${y + dy}) exp ${exp} got ${got}`);
        }
      }
      if (bad.length) {
        broken++;
        if (broken <= 10) console.log(`破格物体 sheet${sheet} 锚(${x},${y}) style${fx / 54}: ${bad.join(' | ')}`);
      }
    }
    console.log(`物体总数=${objs} 破格=${broken}`);
    // 玩家附近 30 格内列出全部石堆物体
    console.log('--- 玩家(2845,346)附近石堆 ---');
    for (let y = 320; y < 380; y++) for (let x = 2810; x < 2880; x++) {
      const i = st.idx(x, y);
      if ((st.type[i] === P186 || st.type[i] === P187)
        && st.type[st.idx(x - 1, y)] !== st.type[i] && st.frameX[i] % 54 === 0) {
        console.log(`sheet${st.type[i] === P186 ? 186 : 187} 锚(${x},${y}) fx${st.frameX[i]} fy${st.frameY[i]}`);
      }
    }
  }, 600_000);
});
