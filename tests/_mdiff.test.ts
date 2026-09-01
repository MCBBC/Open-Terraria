import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSave } from '../src/save/SaveFile';

describe('镜像结构差分', () => {
  it('dump两结构碰撞图+程序化对比', () => {
    const { world } = loadSave(readFileSync('/Users/vinlic/Downloads/map-Starter_World (26).json', 'utf8'));
    const st = world.store;
    const draw = (x0: number, x1: number, y0: number, y1: number, title: string) => {
      console.log(`\n== ${title} x[${x0}..${x1}]`);
      let hdr = '     ';
      for (let x = x0; x <= x1; x++) hdr += String(x % 10).padStart(4);
      console.log(hdr);
      for (let y = y0; y <= y1; y++) {
        let row = String(y).padStart(4) + ' ';
        for (let x = x0; x <= x1; x++) {
          if (!st.inBounds(x, y) || !st.flags[st.idx(x, y)]) { row += ' .  '; continue; }
          const i = st.idx(x, y);
          const sl = st.slope[i], hf = st.half[i];
          if (st.isPlatform(x, y)) row += '  p' + (sl ? sl : '=');
          else if (hf) row += '  H ';
          else if (sl) row += '  S' + sl;
          else row += '  S#';
        }
        console.log(row);
      }
    };
    draw(3158, 3185, 272, 286, '左结构(点1=3166,275) L→R跌落');
    draw(3216, 3243, 272, 286, '右结构(点2=3227,275) R→L正常');
    // 程序化镜像对比: 以 (3166+3227)/2=3196.5 为轴, 行 275 比对 ±10 格宽 × 行 270..286
    // 左结构坐标 x → 镜像 x' = 6393−x (2*3196.5)
    const diffs: string[] = [];
    for (let y = 270; y <= 286; y++) {
      for (let x = 3156; x <= 3177; x++) {
        const mx = 6393 - x;
        const a = st.inBounds(x, y) ? [st.type[st.idx(x,y)], st.slope[st.idx(x,y)], st.half[st.idx(x,y)], st.isPlatform(x,y) ? 1 : 0] : [0,0,0,0];
        const b = st.inBounds(mx, y) ? [st.type[st.idx(mx,y)], st.slope[st.idx(mx,y)], st.half[st.idx(mx,y)], st.isPlatform(mx,y) ? 1 : 0] : [0,0,0,0];
        // 实心家族归一(具体石种不重要,只看碰撞几何)
        const na = a[3] ? 'P' : (a[1] ? `S${a[1]}` : (a[0] && !a[2] ? '#' : (a[2] ? 'H' : (a[0] ? 'o' : '.'))));
        const nb = b[3] ? 'P' : (b[1] ? `S${b[1]}` : (b[0] && !b[2] ? '#' : (b[2] ? 'H' : (b[0] ? 'o' : '.'))));
        if (na !== nb) diffs.push(`(${x},${y}) 左=${na} ↔ 镜像(${mx},${y}) 右=${nb}`);
      }
    }
    console.log('\n== 镜像差分(轴 x=3196.5):\n' + (diffs.join('\n') || '(完全镜像对称)'));
  });
});
