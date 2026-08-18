// XXX 批：Dirtiest Block（tile 668）终清移植验证——JS 生成 vs /tmp/vserver86 基线。
// 用法：SW_XDB=1 [SW_XDB_FILE=s111.wld] npx vitest run tools/_xxxdb.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = !!process.env.SW_XDB;
const VSRV = process.env.SW_XDB_VSRV ?? '/tmp/vserver86';
const TSV = `${VSRV}/matrix-anchors.tsv`;
const FILE = process.env.SW_XDB_FILE ?? 's111.wld';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-2);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const SIZE_ID: Record<string, 0 | 1 | 2> = { s: 0, m: 1, l: 2 };

(RUN ? it : it.skip)('dirtiest block parity', async () => {
  const c = readFileSync(TSV, 'utf8').split('\n').find((l) => l.startsWith(FILE))!.split('\t');
  const size = c[1] as 's' | 'm' | 'l';
  const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${FILE}`)));
  const world = await generateWorld({
    size: SIZE_ID[size], width: SIZE_DIMS[SIZE_ID[size]].width, height: SIZE_DIMS[SIZE_ID[size]].height,
    seedText: c[2], evil: c[3] === '1' ? 1 : 0,
  });
  const st = world.store;
  const w = wld.tilesWide, h = wld.tilesHigh;
  const vCells: string[] = [];
  const jCells: string[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (wld.tiles.active[i] === 1 && wld.tiles.type[i] === 668) vCells.push(`${x},${y}`);
    const jt = st.type[i];
    if (jt !== 0 && SHEET[jt] === 668) jCells.push(`${x},${y}`);
  }
  const vs = new Set(vCells), js = new Set(jCells);
  const onlyV = vCells.filter((k) => !js.has(k));
  const onlyJ = jCells.filter((k) => !vs.has(k));
  // moss plants(184) 计数（FinalCleanup TileFrame 全图扫的掷数主项）
  let vMoss = 0, jMoss = 0;
  for (let i = 0; i < w * h; i++) {
    if (wld.tiles.active[i] === 1 && wld.tiles.type[i] === 184) vMoss++;
    const jt = st.type[i];
    if (jt !== 0 && SHEET[jt] === 184) jMoss++;
  }
  console.log(`mossplants(184): vanilla=${vMoss} js=${jMoss}`);
  console.log(`${FILE}: vanilla668=${vCells.length} js668=${jCells.length} 共同=${vCells.length - onlyV.length}`);
  console.log('  vanilla 坐标:', vCells.join(' '));
  console.log('  js      坐标:', jCells.join(' '));
  if (onlyV.length || onlyJ.length) console.log('  ✗ 仅vanilla:', onlyV.join(' '), ' 仅JS:', onlyJ.join(' '));
  else console.log('  ✓ 逐位全等');
}, 600000);
