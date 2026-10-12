// ★626c:实跑 .wld 解析探针——本仓 parseWldToSave 读真实 tModLoader 产物
// 用法:node /tmp/wld-probe.mjs <wld路径>
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { TILE_BY_KEY } from '../src/data/tiles';

const path = process.argv[2] ?? '/tmp/tml-golden/golden-vanilla.wld';
const buf = new Uint8Array(readFileSync(path));
const t0 = Date.now();
const wld = parseWld(buf);
const st = { type: wld.tiles.type, wall: wld.tiles.wall, w: wld.tilesWide, h: wld.tilesHigh };
console.log(`[wld-probe] ${path}`);
console.log(`[wld-probe] 尺寸=${st.w}x${st.h} 解析耗时=${Date.now() - t0}ms ver=${wld.version} seed=${wld.seed} crimson=${wld.isCrimson}`);
console.log(`[wld-probe] groundLevel=${wld.groundLevel} rockLevel=${wld.rockLevel} dungeon=(${wld.dungeonX},${wld.dungeonY}) spawn=(${wld.spawnX},${wld.spawnY})`);
console.log('[wld-probe] 活格数:', (() => { let n = 0; for (let i = 0; i < st.type.length; i++) if (st.type[i] !== 0) n++; return n; })());
// 原版特征计数(金标族熟悉面孔)
const cnt = (key: string): number => {
  const id = TILE_BY_KEY[key] ?? -1;
  if (id < 0) return -1;
  let n = 0;
  for (let i = 0; i < st.type.length; i++) if (st.type[i] === id) n++;
  return n;
};
for (const k of ['v_0_dirt_block', 'v_1_stone_block', 'v_53_sand_block', 'v_59_mud_block', 'v_199_grass_block']) {
  console.log(`[wld-probe] ${k}: ${cnt(k)}`);
}
let fnv = 0x811c9dc5;
for (let i = 0; i < st.type.length; i++) {
  fnv ^= st.type[i] & 0xff; fnv = Math.imul(fnv, 0x01000193) >>> 0;
  fnv ^= (st.type[i] >>> 8) & 0xff; fnv = Math.imul(fnv, 0x01000193) >>> 0;
}
console.log('[wld-probe] fnvType =', fnv.toString(16).padStart(8, '0'));
process.exit(0);
