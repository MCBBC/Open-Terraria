// 165 族装饰位置漂移定位探针（env 门控=SW_165=1 才跑；cd game 下
//   SW_165=1 npx vitest run tools/_165dump.test.ts）：
// ① 生成 JS 世界 ↔ 解析 /tmp/vserver86/s111.wld（SW_165F=file 覆写）
// ② 双向 165 差格：按“放置族列”分类（frameX 列基带）+ 邻域签名
//   （原版侧墙 48-53 宝石洞 / 54-59 苔藓 / 62 蛛 / 86 巢；上下邻 tile 族）
// ③ 总量对比：v165 总数 vs j165 总数（近等=纯漂移；差大=放置率错）
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_165 === '1';
const FILE = process.env.SW_165F ?? 's111.wld';
const VSRV = process.env.SW_MATRIX_VSRV ?? '/tmp/vserver86';
const OUT = process.env.SW_165OUT ?? '/tmp/165dump.json';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const MOSS_SHEETS = new Set([182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627]);
/** 列基带 → 族名（PlaceUncheckedStalactite/UpdateStalagtiteStyle 全列） */
function familyOf(fx: number, fy: number): string {
  const col = Math.floor(fx / 18);
  if (fy === 72 || fy === 90) return `small`;
  // 大型两格（fy 0/18 上垂 / 36/54 下立）按列命名
  const names: Record<number, string> = {
    0: 'ice0', 3: 'ice3', 6: 'ice6',
    54: 'stone54', 57: 'stone57', 60: 'stone60',
    162: 'sand225', 378: 'hard378', 432: 'mush432', 486: 'mush486',
    216: 'adj216', 270: 'adj270', 324: 'adj324', 594: 'adj594', 540: 'adj540', 648: 'adj648', 108: 'adj108',
  };
  return names[col] ?? `col${col}`;
}

interface Cell { x: number; y: number; fx: number; fy: number }

(RUN ? it : it.skip)('165 drift dump', async () => {
  const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${FILE}`)));
  const w = wld.tilesWide, h = wld.tilesHigh;
  const world = await generateWorld({ size: 0, width: SIZE_DIMS[0].width, height: SIZE_DIMS[0].height, seedText: '111', evil: 0 });
  const st = world.store;
  const wt = wld.tiles, jt = st;
  const jsSheet = (i: number) => (jt.type[i] !== 0 ? SHEET[jt.type[i]] : -1);

  // ---- ① 总量对比 ----
  let vTotal = 0, jTotal = 0;
  for (let i = 0; i < w * h; i++) {
    if (wt.active[i] === 1 && wt.type[i] === 165) vTotal++;
    if (jsSheet(i) === 165) jTotal++;
  }
  console.log(`165 总量: vanilla=${vTotal} js=${jTotal}`);

  // ---- ② 双向差格分类 ----
  const vOnly: Cell[] = [], jOnly: Cell[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const v = wt.active[i] === 1 && wt.type[i] === 165;
    const j = jsSheet(i) === 165;
    if (v && !j) vOnly.push({ x, y, fx: wt.frameX[i], fy: wt.frameY[i] });
    else if (j && !v) jOnly.push({ x, y, fx: jt.frameX[i], fy: jt.frameY[i] });
  }
  const famCount = (arr: Cell[]) => {
    const m = new Map<string, number>();
    for (const c of arr) { const f = familyOf(c.fx, c.fy); m.set(f, (m.get(f) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  console.log(`vOnly=${vOnly.length} jOnly=${jOnly.length}`);
  console.log('vOnly 族列分布:', famCount(vOnly).slice(0, 12));
  console.log('jOnly 族列分布:', famCount(jOnly).slice(0, 12));

  // ---- ③ 邻域签名（原版侧）：差格的墙 + 上下邻 tile ----
  const nbhd = (arr: Cell[]) => {
    const wallC = new Map<number, number>();
    const upC = new Map<string, number>();
    for (const c of arr) {
      const i = c.y * w + c.x;
      wallC.set(wt.wall[i], (wallC.get(wt.wall[i]) ?? 0) + 1);
      if (c.y > 0) {
        const u = wt.active[i - w] === 1 ? String(wt.type[i - w]) : 'air';
        upC.set(u, (upC.get(u) ?? 0) + 1);
      }
    }
    const top = (m: Map<string | number, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    return { wall: top(wallC, 8), up: top(upC, 8) };
  };
  console.log('vOnly 邻域(wall/up):', JSON.stringify(nbhd(vOnly)));
  console.log('jOnly 邻域(wall/up):', JSON.stringify(nbhd(jOnly)));

  // ---- ④ 全量 165（含两侧都有但帧不同）帧对比 ----
  const bothFrameDiff = { n: 0, col: new Map<string, number>() };
  for (let i = 0; i < w * h; i++) {
    const v = wt.active[i] === 1 && wt.type[i] === 165;
    const j = jsSheet(i) === 165;
    if (v && j && (wt.frameX[i] !== jt.frameX[i] || wt.frameY[i] !== jt.frameY[i])) {
      bothFrameDiff.n++;
      const k = `${wt.frameX[i]},${wt.frameY[i]}>${jt.frameX[i]},${jt.frameY[i]}`;
      bothFrameDiff.col.set(k, (bothFrameDiff.col.get(k) ?? 0) + 1);
    }
  }
  console.log(`两侧都有但帧不同: n=${bothFrameDiff.n}`,
    [...bothFrameDiff.col.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6));

  // ---- ⑤ 空间聚类粗报：vOnly/jOnly 按 64 格桶列分布（找聚集带）----
  const bucket = (arr: Cell[]) => {
    const m = new Map<number, number>();
    for (const c of arr) { const b = (c.x >> 6) << 6; m.set(b, (m.get(b) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  };
  console.log('vOnly 热桶(x>>6):', bucket(vOnly));
  console.log('jOnly 热桶(x>>6):', bucket(jOnly));

  writeFileSync(OUT, JSON.stringify({
    file: FILE, vTotal, jTotal, vOnlyN: vOnly.length, jOnlyN: jOnly.length,
    vOnlyFam: famCount(vOnly), jOnlyFam: famCount(jOnly),
    vOnlySample: vOnly.slice(0, 400), jOnlySample: jOnly.slice(0, 400),
  }));
  console.log(`详情样本已写 ${OUT}`);
}, 240_000);
