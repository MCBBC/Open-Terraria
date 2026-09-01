import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

const LOG = '/Users/vinlic/Downloads/behavior-log-Starter_World-2026-09-01T09-22-21-139Z.json';
function build() {
  const j = JSON.parse(readFileSync(LOG, 'utf8'));
  const st = new TileStore(4000, 1200);
  for (const [k, v] of Object.entries(j.meta.terrain.cells)) {
    const [x, y] = k.split(',').map(Number);
    const i = st.idx(x, y);
    st.type[i] = v[0]; st.slope[i] = v[1]; st.half[i] = v[2]; st.flags[i] = 1;
    if (v[3]) st.flags[i] |= 64;
  }
  return st;
}
describe('plat60', () => {
  it('碰撞真值图', () => {
    const st = build();
    let hdr = '     ';
    for (let x = 3164; x <= 3182; x++) hdr += String(x % 10).padStart(4);
    console.log(hdr);
    for (let y = 276; y <= 286; y++) {
      let row = String(y).padStart(4) + ' ';
      for (let x = 3164; x <= 3182; x++) {
        const i = st.idx(x, y);
        if (!st.isActive(x, y)) { row += ' . .'; continue; }
        const d = TILE_DEFS[st.type[i]];
        if (!d || (!d.solid && !st.isPlatform(x, y))) { row += ` ${String(st.type[i]).padStart(2)}`.slice(-3) + '~'; continue; } // 非碰撞
        if (st.isPlatform(x, y)) {
          const s = st.slope[i];
          row += '  p' + (s ? String(s) : '=').padEnd(1);
        } else {
          const s = st.slope[i];
          row += ('  S' + (s ? String(s) : '#')).slice(-4);
        }
      }
      console.log(row);
    }
    console.log('图例: S#=整块实心 S1/S2=坡形实心 p==平平台 p1/p2=坡平台 数字~=非碰撞装饰 t=type');
  });
});
