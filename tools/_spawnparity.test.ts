// _matrixrun 基线 spawnY 差 1-2 格归因探针（SW_PARITY 门控）：
//   对 small8 每种子：解析 .wld 取 spawnX/spawnY；JS 生成同种子世界；
//   ① 复算两侧 spawn 列的首活性行（SpawnPoint cs:19683 谓词）——验证 vanilla 存档
//     spawnY 是否=列首活性行（算法自洽性）；
//   ② 对拍两列（vanilla 列首行 vs JS 列首行）及其上下 ±3 格的 (active,type) 差异
//     —— 定位是输入级联（列内容差）还是采样循环差（JS rng 轨迹）。
//   ③ 记录 JS 侧 spawn 搜索轨迹（模拟 spawnPointPass 同款循环，带重试原因标签）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import type { World } from '../src/world/World';

const RUN = process.env.SW_PARITY === '1';
const VSRV = '/tmp/vserver';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-2);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface Row { file: string; seed: string; evil: 0 | 1 }
function loadRows(): Row[] {
  const lines = readFileSync(`${VSRV}/matrix-anchors.tsv`, 'utf8').split('\n')
    .filter((l) => l.trim() && !l.startsWith('file\t'));
  const only = (process.env.SW_SPAWN_FILES ?? '').split(',').filter(Boolean);
  const rows: Row[] = [];
  for (const line of lines.slice(0, 8)) {
    const c = line.split('\t');
    if (only.length && !only.includes(c[0])) continue;
    rows.push({ file: c[0], seed: c[2], evil: c[3] === '1' ? 1 : 0 });
  }
  return rows;
}

function firstActiveCol(tiles: { active: Uint8Array; type: Uint16Array }, w: number, h: number, x: number): number {
  for (let y = 0; y < h; y++) {
    const i = y * w + x;
    if (tiles.active[i] === 1 && tiles.type[i] !== 379) return y;
  }
  return -1;
}

(RUN ? it : it.skip)('spawnY parity attribution', async () => {
  for (const row of loadRows()) {
    const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${row.file}`)));
    const w = wld.tilesWide, h = wld.tilesHigh;
    const world: World = await generateWorld({
      size: 0, width: SIZE_DIMS[0].width, height: SIZE_DIMS[0].height,
      seedText: row.seed, evil: row.evil,
    });
    const st = world.store;
    const jsFirst = firstActiveCol({ active: Uint8Array.from(st.type.map((t: number) => (t !== 0 ? 1 : 0))), type: st.type }, st.w, st.h, world.spawnX);
    const vanFirst = firstActiveCol(wld.tiles, w, h, wld.spawnX);
    console.log(`\n== ${row.file} (seed ${row.seed}) ==`);
    console.log(`  vanilla spawn=(${wld.spawnX},${wld.spawnY}) 列首活性=${vanFirst} | JS spawn=(${world.spawnX},${world.spawnY}) 列首活性=${jsFirst}`);
    if (wld.spawnX === world.spawnX) {
      // 同列：逐格对拍首活性行 ±3 带内容
      const y0 = Math.min(vanFirst, jsFirst) - 1, y1 = Math.max(vanFirst, jsFirst) + 2;
      for (let y = y0; y <= y1; y++) {
        const i = y * w + wld.spawnX;
        const vt = wld.tiles.active[i] === 1 ? wld.tiles.type[i] : -1;
        const jt = st.type[i] !== 0 ? (SHEET[st.type[i]] ?? -9) : -1;
        const mark = vt !== jt ? '  <<<' : '';
        console.log(`    y=${y}  van=${vt >= 0 ? `act t${vt}` : 'air'}  js=${jt >= 0 ? `act t${jt}` : jt === -9 ? 'act UNMAPPED' : 'air'}${mark}`);
      }
    } else {
      console.log(`  列不同（van ${wld.spawnX} vs js ${world.spawnX}）`);
      for (const [tag, x, fy] of [['van列@van侧', wld.spawnX, vanFirst], ['js列@js侧', world.spawnX, jsFirst]] as const) {
        const i = fy * w + x;
        const vt = wld.tiles.active[i] === 1 ? wld.tiles.type[i] : -1;
        const jt = st.type[i] !== 0 ? (SHEET[st.type[i]] ?? -9) : -1;
        console.log(`    ${tag} x=${x} firstY=${fy} van=${vt} js=${jt}`);
      }
    }
  }
}, 3_600_000);
