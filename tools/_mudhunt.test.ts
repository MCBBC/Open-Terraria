// 中尺寸深层泥石分界带猎杀探针（#22 矩阵终判后续）：
//   ① 我方 GenState 常量（rockLevelLow/High、waterLine/lavaLine、genRockLayer…）
//   ② 每列首石行 v/j 对照（分界线是否一致 → 深度门 vs 掷骰流判别）
//   ③ 泥(59) 列计数 v/j 差的 x 分桶剖面（列级换位 vs 格级混合）
//   ④ deep 带 59>1 / 1>59 差异对的 x 分桶 + y 分带剖面
//   ⑤ 丛林草(60) 质心对照（jungle 锚是否偏移）
// 用法：SW_MUDHUNT=m111.wld,m777.wld npx vitest run tools/_mudhunt.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld, SIZE_DIMS, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const MODE = process.env.SW_MUDHUNT ?? '';
const RUN = MODE !== '' && MODE !== '0';
const VSRV = '/tmp/vserver';
const SIZE_ID: Record<string, 0 | 1 | 2> = { s: 0, m: 1, l: 2 };

const SHEET = new Int32Array(TILE_DEFS.length).fill(-2);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const jSheet = (t: number): number => (SHEET[t] >= 0 ? SHEET[t] : -2);

interface Row { seed: string; evil: 0 | 1; size: 's' | 'm' | 'l' }
function loadAnchors(file: string): Row {
  const lines = readFileSync(`${VSRV}/matrix-anchors.tsv`, 'utf8').split('\n');
  for (const line of lines) {
    const c = line.split('\t');
    if (c[0] === file) return { seed: c[2], evil: c[3] === '1' ? 1 : 0, size: c[1] as Row['size'] };
  }
  throw new Error(`anchor miss ${file}`);
}

function bucketize(n: number, bucket: number): number { return Math.ceil(n / bucket); }

(RUN ? it : it.skip)('mud boundary hunt', async () => {
  const files = MODE.split(',').map((s) => s.trim()).filter(Boolean);
  for (const file of files) {
    const row = loadAnchors(file);
    const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${file}`)));
    const dims = SIZE_DIMS[SIZE_ID[row.size]];
    const world = await generateWorld({
      size: SIZE_ID[row.size], width: dims.width, height: dims.height,
      seedText: row.seed, evil: row.evil,
    });
    const gs = lastGenState()!;
    const st = world.store;
    const w = wld.tilesWide, h = wld.tilesHigh;
    const wt = wld.tiles, jt = st;
    const rock = Math.floor(wld.rockLevel), hellTop = h - 200;
    console.log(`\n===== ${file} seed=${row.seed} ${w}x${h} =====`);
    console.log(`JS gs: worldSurface=${gs.worldSurface} rockLevel=${gs.rockLevel} rockLevelLow=${gs.rockLevelLow} rockLevelHigh=${gs.rockLevelHigh}`);
    console.log(`      worldSurfaceLow=${gs.worldSurfaceLow} worldSurfaceHigh=${gs.worldSurfaceHigh} genWorldSurface=${gs.genWorldSurface.toFixed(2)} genRockLayer=${gs.genRockLayer.toFixed(2)}`);
    console.log(`      waterLine=${gs.waterLine} lavaLine=${gs.lavaLine} jungleX=${world.jungleX}`);

    // ---- ② 每列首石行（rock..hellTop 首个 type==1）----
    const firstStoneDiff = new Map<number, number>();
    let stoneColSame = 0, stoneColDiff = 0;
    // ---- ③ 每列泥计数 ----
    const BX = 128;
    const nb = bucketize(w, BX);
    const vMudB = new Int32Array(nb), jMudB = new Int32Array(nb);
    const d59to1B = new Int32Array(nb), d1to59B = new Int32Array(nb);
    // ---- ④ y 剖面 ----
    const BY = 40;
    const ny = bucketize(hellTop - rock, BY);
    const vMudY = new Int32Array(ny), jMudY = new Int32Array(ny);
    const c59to1Y = new Int32Array(ny), c1to59Y = new Int32Array(ny);
    // ---- ⑤ 丛林草 60 ----
    let v60 = 0, j60 = 0, v60x = 0, j60x = 0;
    let deepPairs59to1 = 0, deepPairs1to59 = 0;

    for (let x = 0; x < w; x++) {
      let vFirst = -1, jFirst = -1, vMud = 0, jMud = 0;
      for (let y = rock; y < hellTop; y++) {
        const i = y * w + x;
        const vt = wt.active[i] === 1 ? wt.type[i] : -1;
        const jraw = jt.type[i];
        const ja = jraw !== 0;
        const jtp = ja ? jSheet(jraw) : -1;
        if (vt === 1 && vFirst < 0) vFirst = y;
        if (jtp === 1 && jFirst < 0) jFirst = y;
        if (vt === 59) vMud++;
        if (jtp === 59) jMud++;
        if (vt === 60) { v60++; v60x += x; }
        if (jtp === 60) { j60++; j60x += x; }
        if (vt === 59 && jtp === 1) {
          if (y >= rock + ((hellTop - rock) >> 1)) deepPairs59to1++;
          d59to1B[bucketize(x + 1, BX) - 1]++;
        }
        if (vt === 1 && jtp === 59) {
          if (y >= rock + ((hellTop - rock) >> 1)) deepPairs1to59++;
          d1to59B[bucketize(x + 1, BX) - 1]++;
        }
        const yb = bucketize(y - rock + 1, BY) - 1;
        if (yb >= 0 && yb < ny) {
          if (vt === 59) vMudY[yb]++;
          if (jtp === 59) jMudY[yb]++;
          if (vt === 59 && jtp === 1) c59to1Y[yb]++;
          if (vt === 1 && jtp === 59) c1to59Y[yb]++;
        }
      }
      if (vFirst === jFirst) stoneColSame++; else {
        stoneColDiff++;
        const d = (vFirst < 0 ? hellTop : vFirst) - (jFirst < 0 ? hellTop : jFirst);
        firstStoneDiff.set(d, (firstStoneDiff.get(d) ?? 0) + 1);
      }
      vMudB[bucketize(x + 1, BX) - 1] += vMud;
      jMudB[bucketize(x + 1, BX) - 1] += jMud;
    }
    console.log(`② firstStone: same=${stoneColSame} diff=${stoneColDiff} / ${w} cols; diff-delta top: ${
      [...firstStoneDiff.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([d, c]) => `Δ${d}×${c}`).join(' ')}`);
    console.log(`④ deep(>=${rock + ((hellTop - rock) >> 1)}) 59>1=${deepPairs59to1} 1>59=${deepPairs1to59}`);
    console.log(`⑤ jungleGrass60: v=${v60} (cx=${v60 ? Math.round(v60x / v60) : '-'}) j=${j60} (cx=${j60 ? Math.round(j60x / j60) : '-'})`);
    console.log('③ x-bucket(128) mud v/j/Δ | 59>1 / 1>59   (每行=一格 x 桶)');
    for (let b = 0; b < nb; b++) {
      const d = vMudB[b] - jMudB[b];
      if (Math.abs(d) > 2000 || d59to1B[b] > 3000 || d1to59B[b] > 3000) {
        console.log(`   x[${b * BX}-${Math.min((b + 1) * BX, w) - 1}] v=${vMudB[b]} j=${jMudB[b]} Δ=${d > 0 ? '+' : ''}${d} | ${d59to1B[b]} / ${d1to59B[b]}`);
      }
    }
    console.log('④ y-band(40) yRange v59 j59 | 59>1 1>59');
    for (let b = 0; b < ny; b++) {
      const y0 = rock + b * BY;
      console.log(`   y[${y0}-${y0 + BY - 1}] v=${vMudY[b]} j=${jMudY[b]} Δ=${vMudY[b] - jMudY[b] > 0 ? '+' : ''}${vMudY[b] - jMudY[b]} | ${c59to1Y[b]} ${c1to59Y[b]}`);
    }
    // ---- ⑥ 精细每列泥剖面（丛林带 x≥4000，16 列一组）+ 2D 密度图 ----
    {
      const x0 = 4000, x1 = w, step = 16;
      console.log('⑥ fine column mud profile (16-col groups, x>=4000): x v j Δ');
      const lines: string[] = [];
      for (let x = x0; x < x1; x += step) {
        let v = 0, j = 0;
        for (let xx = x; xx < Math.min(x + step, w); xx++) {
          for (let y = rock; y < hellTop; y++) {
            const i = y * w + xx;
            if (wt.active[i] === 1 && wt.type[i] === 59) v++;
            const jr = jt.type[i];
            if (jr !== 0 && jSheet(jr) === 59) j++;
          }
        }
        lines.push(`${x}-${x + step - 1} ${v} ${j} ${v - j}`);
      }
      console.log(lines.join('\n'));
      // 2D 图:x[4000,6400) 32 列格 × y[500,1700) 50 行格,v/j 泥占比
      const GX = 32, GY = 50;
      console.log('⑥ 2D mud density map (x:4000-6400 step 32, y:500-1700 step 50; left=v right=j, . <5% 1-19% 2-39% 3-59% 4-79% # >=80%)');
      const cell = (r: number): string => (r >= 0.8 ? '#' : r >= 0.6 ? '4' : r >= 0.4 ? '3' : r >= 0.2 ? '2' : r >= 0.05 ? '1' : '.');
      for (let gy = 500; gy < 1700; gy += GY) {
        let lv = '', lj = '';
        for (let gx = 4000; gx < 6400; gx += GX) {
          let v = 0, j = 0, tot = 0;
          for (let y = gy; y < gy + GY && y < h; y++) for (let x = gx; x < gx + GX && x < w; x++, tot++) {
            const i = y * w + x;
            if (wt.active[i] === 1 && wt.type[i] === 59) v++;
            const jr = jt.type[i];
            if (jr !== 0 && jSheet(jr) === 59) j++;
          }
          lv += cell(v / tot); lj += cell(j / tot);
        }
        console.log(`y${String(gy).padStart(4)} v|${lv}| j|${lj}|`);
      }
    }
  }
}, 600_000);
