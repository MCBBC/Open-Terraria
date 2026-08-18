// XXX 批副产物：s12345 地牢墙变体分歧定量（OOO 输入）——dungeon 盒内 wall 对账。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = !!process.env.SW_XW12;

(RUN ? it : it.skip)('s12345 dungeon wall variant census', async () => {
  const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s12345.wld')));
  const world = await generateWorld({ size: 0, width: 4200, height: 1200, seedText: '12345', evil: 1 });
  const st = world.store;
  const w = 4200, h = 1200;
  // dungeon 锚 (3413,190)，盒子 x±260, y 150..600
  const X0 = 3413 - 260, X1 = 3413 + 260, Y0 = 150, Y1 = 600;
  const pairs = new Map<string, number>();
  let tot = 0;
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    const i = y * w + x;
    const vw = wld.tiles.wall[i], jw = st.wall[i];
    if (vw !== jw) {
      tot++;
      const k = `${vw}>${jw}`;
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
  }
  const top = [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`dungeon 盒 [${X0},${X1})×[${Y0},${Y1}) wall 差=${tot}（盒 ${(X1 - X0) * (Y1 - Y0)} 格）`);
  console.log('top 对:', top.map(([k, c]) => `${k}×${c}`).join(', '));
  // 全图 wall 7/8/9 ↔ 94-99 互换总量
  const fam = new Map<string, number>();
  let famTot = 0;
  for (let i = 0; i < w * h; i++) {
    const vw = wld.tiles.wall[i], jw = st.wall[i];
    const isDG = (v: number) => v === 7 || v === 8 || v === 9;
    const isVar = (v: number) => v >= 94 && v <= 99;
    if ((isDG(vw) && isVar(jw)) || (isVar(vw) && isDG(jw)) || (isVar(vw) && isVar(jw) && vw !== jw)) {
      famTot++;
      const k = `${vw}>${jw}`;
      fam.set(k, (fam.get(k) ?? 0) + 1);
    }
  }
  console.log(`全图 基础墙7-9↔变体94-99 互换=${famTot}:`, [...fam.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k}×${c}`).join(', '));
}, 600000);
