// FFFF 批定位探针：剩余残差的空间分布（dome 核心体 vs 盒窗其余）+ 0>198 聚类
// SW_FFFFL=1 npx vitest run tools/_ffffloc.test.ts
import { describe, it } from 'vitest';
const RUN = !!process.env.SW_FFFFL;
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;

describe.skipIf(!RUN)('FFFF dome localization', () => {
  it('s12345 residual regions', async () => {
    const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s12345.wld')));
    const world = await generateWorld({
      width: wld.tilesWide, height: wld.tilesHigh, seedText: '12345', evil: 1, name: 'ffff',
    });
    const st = world.store;
    const dgX = wld.dungeonX, dgY = wld.dungeonY;
    // dome 体域（含穹丘/柱/树外沿）：i±55 × n7-60..n7+55（n7=dgY）
    const dom = (x: number, y: number): boolean =>
      Math.abs(x - dgX) <= 55 && y >= dgY - 60 && y <= dgY + 55;
    let dTin = 0, dTout = 0, dWin = 0, dWout = 0;
    const pOut = new Map<string, number>();
    const pIn = new Map<string, number>();
    const w198: string[] = [];
    const stoneAir: string[] = [];
    for (let y = Math.max(0, dgY - 180); y <= Math.min(st.h - 1, dgY + 180); y++) {
      for (let x = Math.max(0, dgX - 170); x <= Math.min(st.w - 1, dgX + 170); x++) {
        const i = st.idx(x, y), k = y * st.w + x;
        const jt = st.flags[i] ? SHEET[st.type[i]] : 0;
        const vt = wld.tiles.active[k] ? wld.tiles.type[k] : 0;
        const jw = st.wall[i], vw = wld.tiles.wall[k];
        const ins = dom(x, y);
        if (jt !== vt) {
          if (ins) { dTin++; pIn.set(`T${jt}>${vt}`, (pIn.get(`T${jt}>${vt}`) ?? 0) + 1); }
          else { dTout++; pOut.set(`T${jt}>${vt}`, (pOut.get(`T${jt}>${vt}`) ?? 0) + 1); if (jt === 1 && vt === 0 && stoneAir.length < 8) stoneAir.push(`${x},${y}`); }
        }
        if (jw !== vw) {
          if (ins) { dWin++; pIn.set(`W${jw}>${vw}`, (pIn.get(`W${jw}>${vw}`) ?? 0) + 1); }
          else { dWout++; pOut.set(`W${jw}>${vw}`, (pOut.get(`W${jw}>${vw}`) ?? 0) + 1); if (jw === 0 && vw === 198 && w198.length < 8) w198.push(`${x},${y}`); }
        }
      }
    }
    const top = (m: Map<string, number>, n: number): string =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}×${v}`).join(' ');
    console.log(`DOME-CORE(|dx|<=55, ${dgY - 60}..${dgY + 55}): typIn=${dTin} walIn=${dWin}`);
    console.log(`IN pairs: ${top(pIn, 16)}`);
    console.log(`OUTSIDE: typOut=${dTout} walOut=${dWout}`);
    console.log(`OUT pairs: ${top(pOut, 16)}`);
    console.log(`stone>air samples: ${stoneAir.join(' ')}`);
    console.log(`wall0>198 samples: ${w198.join(' ')}`);
  }, 600000);
});
