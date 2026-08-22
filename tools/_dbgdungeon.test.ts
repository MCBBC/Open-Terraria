// 一次性诊断：两种子 dungeon 家族占据（tile 41/43/44 + wall 7/8/9/94-99）两侧对比。
// ★OOOOOO 批(2026-08-22)加双门:①SW_DUNGEONOCC env 门（双世界全生成 ~2min,属诊断
//   非回归,此前无门每轮全量回归白烧 2min 负载——hive 负载 flaky 的共因之一）;
//   ②/tmp/vserver86 基线存在性门（基线被外清时 skip,不再 ENOENT 恒红）。
import { it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = !!process.env.SW_DUNGEONOCC;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-2);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const BRICK = new Set([41, 43, 44]);
const WALL = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);

function stats(label: string, w: number, h: number, getType: (i: number) => number, getFlag: (i: number) => number, getWall: (i: number) => number) {
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, brick = 0, wall = 0;
  const colBrick = new Int32Array(w), colWall = new Int32Array(w);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const i = y * w + x;
    if (getFlag(i) && BRICK.has(getType(i))) { brick++; colBrick[x]++; if (x<minX)minX=x; if (x>maxX)maxX=x; if (y<minY)minY=y; if (y>maxY)maxY=y; }
    if (WALL.has(getWall(i))) { wall++; colWall[x]++; }
  }
  console.log(`${label}: brick=${brick} bbox=[${minX},${minX===1e9?0:maxX}]x[${minY===1e9?0:minY},${minY===1e9?0:maxY}] wallCells=${wall}`);
  // 每 100 列摘要（brick+wall 占据密度）
  const parts: string[] = [];
  for (let x = 0; x < w; x += 100) {
    let b = 0, wl = 0; for (let k = x; k < x + 100 && k < w; k++) { b += colBrick[k]; wl += colWall[k]; }
    if (b + wl > 0) parts.push(`${x}:${b}/${wl}`);
  }
  console.log(`  cols(每100格 brick/wall): ${parts.join(' ')}`);
  // wall-only bbox
  let wminX = 1e9, wmaxX = -1, wminY = 1e9, wmaxY = -1;
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const i = y * w + x;
    if (WALL.has(getWall(i))) { if (x<wminX)wminX=x; if (x>wmaxX)wmaxX=x; if (y<wminY)wminY=y; if (y>wmaxY)wmaxY=y; }
  }
  console.log(`  wall bbox=[${wminX},${wmaxX}]x[${wminY},${wmaxY}]`);
}

(RUN ? it : it.skip)('dungeon occupancy', async () => {
  if (!existsSync('/tmp/vserver86/s4444.wld') || !existsSync('/tmp/vserver86/s6666.wld')) {
    console.log('skip: /tmp/vserver86 基线缺失,按 gen86.sh 管线重建后复跑');
    return;
  }
  for (const seed of ['4444', '6666']) {
    const wld = parseWld(new Uint8Array(readFileSync(`/tmp/vserver86/s${seed}.wld`)));
    stats(`v${seed}`, wld.tilesWide, wld.tilesHigh, (i) => wld.tiles.type[i], (i) => wld.tiles.active[i], (i) => wld.tiles.wall[i]);
    const world = await generateWorld({ size: 0, width: 4200, height: 1200, seedText: seed, evil: 0 });
    const st = world.store;
    stats(`j${seed}`, st.w, st.h, (i) => SHEET[st.type[i]], (i) => (st.type[i] !== 0 ? 1 : 0), (i) => st.wall[i]);
    console.log(`  j${seed} dungeonX=${world.dungeonX} dungeonY=${world.dungeonY}`);
  }
}, 600000);
