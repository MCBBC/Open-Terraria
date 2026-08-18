// PPPP 一次性探针：Tower 型地牢复扫 s33333（MMMM 遗留——Tower 致动柱/特性门修完
// 从未在 Tower 种子上验过）。基线 /tmp/vserver86/s33333.wld（dungeonX=698,Y=181）。
// 口径=AAAA 盒法：dungeonX±170 × dungeonY±180 = 341×361，通道=matrixrun 四通道
// （typ/act/wal/liq）+ half/slope，top 差异对打印。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../../../src/data/tiles';

const RUN = process.env.SW_PPPPTOWER === '1';
const W = 4200, H = 1200;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }

(RUN ? it : it.skip)('tower dungeon box s33333', async () => {
  const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s33333.wld')));
  console.log(`wld anchors: dungeon=(${wld.dungeonX ?? '?'},${wld.dungeonY ?? '?'}) ground=${wld.groundLevel} rock=${wld.rockLevel}`);
  const world = await generateWorld({ width: W, height: H, seedText: '33333', evil: 0 });
  const st = (world as unknown as { store: import('../src/world/TileStore').TileStore }).store;
  const DX = 698, DY = 181;
  const x0 = Math.max(0, DX - 170), x1 = Math.min(W, DX + 170);
  const y0 = Math.max(0, DY - 180), y1 = Math.min(H, DY + 180);
  let cells = 0, typ = 0, act = 0, wal = 0, liq = 0, hf = 0, sl = 0;
  const typM = new Map<string, number>(), walM = new Map<string, number>(), liqM = new Map<string, number>();
  const samples: string[] = [];
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = x + y * W;
    cells++;
    const va = wld.tiles.active[i] === 1;
    const jType = st.type[i], ja = jType !== 0;
    const vt = va ? wld.tiles.type[i] : -1;
    let jtV = -1;
    if (ja) { const s = SHEET[jType]; jtV = s >= 0 ? s : -2; }
    if (va !== ja) act++;
    if (va !== ja || (va && vt !== jtV)) { typ++; bump(typM, `${vt}>${jtV}`); if (samples.length < 10) samples.push(`T(${x},${y}) v${vt} j${jtV}`); }
    if (wld.tiles.wall[i] !== st.wall[i]) { wal++; bump(walM, `${wld.tiles.wall[i]}>${st.wall[i]}`); if (samples.length < 10) samples.push(`W(${x},${y}) ${wld.tiles.wall[i]}>${st.wall[i]}`); }
    const vamt = wld.tiles.liquid[i], jamt = st.liquid[i];
    const vlt = vamt > 0 ? wld.tiles.liquidType[i] : 0;
    const jlt = jamt > 0 ? st.liquidType[i] : 0;
    if (vamt !== jamt || vlt !== jlt) { liq++; bump(liqM, `t${vlt}:${vamt}>t${jlt}:${jamt}`); }
    if ((wld.tiles.half[i] ? 1 : 0) !== st.half[i]) hf++;
    if ((wld.tiles.slope[i] ?? 0) !== st.slope[i]) sl++;
  }
  const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${k}×${c}`).join(' ');
  console.log(`BOX ${x1 - x0}×${y1 - y0}=${cells} typ=${typ}(${(typ / cells * 100).toFixed(2)}%) act=${act} wal=${wal}(${(wal / cells * 100).toFixed(2)}%) liq=${liq} hf=${hf} sl=${sl}`);
  console.log(`typTop: ${top(typM, 10)}`);
  console.log(`walTop: ${top(walM, 10)}`);
  console.log(`liqTop: ${top(liqM, 5)}`);
  console.log(`samples: ${samples.join(' | ')}`);
  // 地牢族聚焦（41/43/44/677-679 砖与 7-9/94-99 墙）
  let dtyp = 0, dwal = 0;
  const BRICK = new Set([41, 43, 44, 677, 678, 679]), DW = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = x + y * W;
    const va = wld.tiles.active[i] === 1, vt = va ? wld.tiles.type[i] : -1;
    const jt = st.type[i] !== 0 ? SHEET[st.type[i]] : -1;
    if (BRICK.has(vt) || BRICK.has(jt)) { if (vt !== jt) dtyp++; }
    if (DW.has(wld.tiles.wall[i]) || DW.has(st.wall[i])) { if (wld.tiles.wall[i] !== st.wall[i]) dwal++; }
  }
  console.log(`dungeon-family: brickTyp=${dtyp} dungeonWal=${dwal}`);
}, 900_000);
