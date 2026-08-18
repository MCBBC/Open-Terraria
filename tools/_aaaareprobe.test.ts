// AAAA 批：post-OOO 地牢盒残差复测 + s12345 两专项取证。
// ① 四世界（s111/m111/l2222/s12345）地牢盒（dungeonX/Y 锚邻域，341×361=123,101 格，
//    与 XXX 批 _xxxcls 同口径）typ/act/wal/liq 残差 + 样本格落盘 /tmp/aaaa-<name>.json
// ② s12345 祭坛清单双侧对拍（active + ghost）+ extra 坛邻域窗口
// ③ s12345 地牢墙 (3288,654)± 窗口对拍（wall 7 vs 95 变体 spread 残余）
// 用法（cd game）：SW_AAAA=list:s111.wld,s12345.wld npx vitest run tools/_aaaareprobe.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseWld, type WldWorld } from '../src/wld/WldParser';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import type { World } from '../src/world/World';

const MODE = process.env.SW_AAAA ?? '';
const RUN = MODE.startsWith('list:');
const VSRV = '/tmp/vserver86';   // x86 基线只读

const SHEET = new Int32Array(TILE_DEFS.length).fill(-2);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const ALTAR_JS = TILE_BY_KEY['v_26_altars']!;
const SIZE_ID: Record<string, 0 | 1 | 2> = { s: 0, m: 1, l: 2 };

function loadAnchors(): Map<string, { size: string; seed: string; evil: 0 | 1 }> {
  const lines = readFileSync(`${VSRV}/matrix-anchors86.tsv`, 'utf8').split('\n');
  const m = new Map<string, { size: string; seed: string; evil: 0 | 1 }>();
  for (const line of lines) {
    const c = line.split('\t');
    if (c.length < 13 || c[0] === 'file') continue;
    m.set(c[0], { size: c[1], seed: c[2], evil: c[3] === '1' ? 1 : 0 });
  }
  return m;
}

function clusterAnchors(
  w: number, h: number,
  isMember: (x: number, y: number) => boolean,
): Array<[number, number]> {
  const visited = new Uint8Array(w * h);
  const out: Array<[number, number]> = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (visited[i] || !isMember(i % w, (i / w) | 0)) continue;
    stack.length = 0; stack.push(i); visited[i] = 1;
    let minX = w, maxX = 0, maxY = 0;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % w, y = (j / w) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      if (x > 0 && !visited[j - 1] && isMember(x - 1, y)) { visited[j - 1] = 1; stack.push(j - 1); }
      if (x < w - 1 && !visited[j + 1] && isMember(x + 1, y)) { visited[j + 1] = 1; stack.push(j + 1); }
      if (y > 0 && !visited[j - w] && isMember(x, y - 1)) { visited[j - w] = 1; stack.push(j - w); }
      if (y < h - 1 && !visited[j + w] && isMember(x, y + 1)) { visited[j + w] = 1; stack.push(j + w); }
    }
    out.push([minX + ((maxX - minX) >> 1), maxY]);   // 祭坛锚=中下
  }
  return out;
}

async function analyzeWorld(file: string): Promise<void> {
  const anchors = loadAnchors();
  const wld: WldWorld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${file}`)));
  // 行缺省从 wld 自推（s12345 晚于 anchors86.tsv 生成；seed=文件名数字，evil=isCrimson）
  const row = anchors.get(file) ?? {
    size: wld.tilesWide <= 4200 ? 's' : wld.tilesWide <= 6400 ? 'm' : 'l',
    seed: /^s(\d+)\.wld$/.exec(file)?.[1] ?? file.replace(/\.wld$/, ''),
    evil: (wld.isCrimson ? 1 : 0) as 0 | 1,
  };
  const t0 = Date.now();
  const dims = SIZE_DIMS[SIZE_ID[row.size]];
  const world: World = await generateWorld({
    size: SIZE_ID[row.size], width: dims.width, height: dims.height,
    seedText: row.seed, evil: row.evil,
  });
  const genS = ((Date.now() - t0) / 1000).toFixed(0);
  const st = world.store;
  const w = wld.tilesWide, h = wld.tilesHigh;
  const wt = wld.tiles, jt = st;
  const out: Record<string, unknown> = {
    file, seed: row.seed, evil: row.evil, genSeconds: genS,
    anchors: {
      v: { dungeonX: wld.dungeonX, dungeonY: wld.dungeonY, ground: wld.groundLevel, rock: wld.rockLevel },
      j: { dungeonX: world.dungeonX, dungeonY: world.dungeonY, ground: world.groundLevel, rock: world.rockLevel },
    },
  };
  console.log(`\n===== ${file}（seed=${row.seed} evil=${row.evil} gen=${genS}s）=====`);
  console.log(`anchors v=${JSON.stringify(out.anchors.v)} j=${JSON.stringify(out.anchors.j)}`);

  // ---- ① 地牢盒（dungeonX±170 × dungeonY±180，341×361=123,101 与 XXX 同口径）----
  const dx = wld.dungeonX, dy = wld.dungeonY;
  const x0 = Math.max(0, dx - 170), x1 = Math.min(w - 1, dx + 170);
  const y0 = Math.max(0, dy - 180), y1 = Math.min(h - 1, dy + 180);
  let cells = 0, typM = 0, actM = 0, walM = 0, liqM = 0, typStrict = 0;
  const typPairs = new Map<string, number>();
  const walPairs = new Map<string, number>();
  const samples: Array<Record<string, number>> = [];
  const wallHistV = new Map<number, number>();
  const wallHistJ = new Map<number, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const bumpN = (m: Map<number, number>, k: number) => m.set(k, (m.get(k) ?? 0) + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      cells++;
      const va = wt.active[i] === 1;
      const vt = wt.type[i];                       // 裸 type（含幽灵）
      const jtI = jt.type[i];
      const jaFlag = jt.flags[i] !== 0;
      const jtS = jtI === 0 ? 0 : SHEET[jtI];
      // XXX/matrixrun 同口径：JS active=type!==0（幽灵计 active）
      const ja = jtI !== 0;
      bumpN(wallHistV, wt.wall[i]);
      bumpN(wallHistJ, jt.wall[i]);
      if (va !== ja) { actM++; }
      if (va !== ja || (va && vt !== jtS)) {
        typM++;
        bump(typPairs, `${vt}>${jtS === -2 ? 'UNMAPPED' : jtS}`);
      }
      if (vt !== jtS) typStrict++;                  // 严格裸 type 通道（幽灵也计）
      if (wt.wall[i] !== jt.wall[i]) {
        walM++;
        bump(walPairs, `${wt.wall[i]}>${jt.wall[i]}`);
      }
      const vamt = wt.liquid[i], jamt = jt.liquid[i];
      const vlt = vamt > 0 ? wt.liquidType[i] : 0;
      const jlt = jamt > 0 ? jt.liquidType[i] : 0;
      if (vamt !== jamt || vlt !== jlt) liqM++;
      if (samples.length < 400 && (va !== ja || vt !== jtS || wt.wall[i] !== jt.wall[i])) {
        samples.push({
          x, y, vAct: va ? 1 : 0, jAct: jaFlag ? 1 : 0, vTyp: vt, jTyp: jtS,
          jTypRaw: jtI, vWal: wt.wall[i], jWal: jt.wall[i],
        });
      }
    }
  }
  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  out.box = {
    bounds: { x0, x1, y0, y1, cells },
    typ: typM, act: actM, wal: walM, liq: liqM, typStrict,
    typPct: +(typM / cells * 100).toFixed(3),
    typTop: top(typPairs, 12), walTop: top(walPairs, 12),
  };
  out.boxSamples = samples;
  out.wallHist = {
    v: [...wallHistV.entries()].filter(([, n]) => n > 50).sort((a, b) => b[1] - a[1]),
    j: [...wallHistJ.entries()].filter(([, n]) => n > 50).sort((a, b) => b[1] - a[1]),
  };
  console.log(`box[${x0}-${x1}]x[${y0}-${y1}] cells=${cells}`);
  console.log(`  typ(matrixrun口径)=${typM} (${out.box.typPct}%)  act=${actM}  typStrict(裸type)=${typStrict}  wal=${walM}  liq=${liqM}`);
  console.log(`  typTop: ${out.box.typTop.map(([k, n]) => `${k}×${n}`).join(', ')}`);
  console.log(`  walTop: ${out.box.walTop.map(([k, n]) => `${k}×${n}`).join(', ')}`);

  // ---- ②③ s12345 专项 ----
  if (file === 's12345.wld') {
    // 祭坛清单（active 锚点 + ghost 单格）
    const vanAltar = clusterAnchors(w, h, (x, y) => wt.type[y * w + x] === 26 && wt.active[y * w + x] === 1);
    const jsAltar = clusterAnchors(w, h, (x, y) => jt.type[y * w + x] === ALTAR_JS && jt.flags[y * w + x] !== 0);
    const vSet = new Set(vanAltar.map(([x, y]) => `${x},${y}`));
    const jSet = new Set(jsAltar.map(([x, y]) => `${x},${y}`));
    const extras = jsAltar.filter(([x, y]) => !vSet.has(`${x},${y}`));
    const misses = vanAltar.filter(([x, y]) => !jSet.has(`${x},${y}`));
    // vanilla ghost 祭坛（type=26 inactive）
    const vGhosts: Array<[number, number]> = [];
    for (let i = 0; i < w * h; i++) if (wt.type[i] === 26 && wt.active[i] !== 1) vGhosts.push([i % w, (i / w) | 0]);
    out.altars = {
      vCount: vanAltar.length, jCount: jsAltar.length,
      extras, misses, vGhostCount: vGhosts.length, vGhosts: vGhosts.slice(0, 20),
    };
    console.log(`altars: v=${vanAltar.length} j=${jsAltar.length} extra(js)=${JSON.stringify(extras)} miss=${JSON.stringify(misses)}`);
    console.log(`  vanilla ghost altar 格（type26 inactive）=${vGhosts.length}: ${JSON.stringify(vGhosts.slice(0, 20))}`);
    // extra 坛邻域窗口（9×7）：vanilla 侧 type/active/wall
    const winDump = (ax: number, ay: number) => {
      const rows: string[] = [];
      for (let y = ay - 4; y <= ay + 2; y++) {
        const r: string[] = [];
        for (let x = ax - 5; x <= ax + 5; x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) { r.push('....'); continue; }
          const i = y * w + x;
          r.push(`t${wt.type[i]}${wt.active[i] ? 'a' : 'i'}w${wt.wall[i]}`);
        }
        rows.push(r.join(' '));
      }
      return rows;
    };
    const jsWinDump = (ax: number, ay: number) => {
      const rows: string[] = [];
      for (let y = ay - 4; y <= ay + 2; y++) {
        const r: string[] = [];
        for (let x = ax - 5; x <= ax + 5; x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) { r.push('....'); continue; }
          const i = y * w + x;
          const s = SHEET[jt.type[i]] ?? -3;
          r.push(`t${s}${jt.flags[i] ? 'a' : 'i'}w${jt.wall[i]}`);
        }
        rows.push(r.join(' '));
      }
      return rows;
    };
    out.extraWindows = extras.map(([x, y]) => ({ at: [x, y], van: winDump(x, y), js: jsWinDump(x, y) }));
    for (const ew of out.extraWindows) {
      console.log(`  extra@${ew.at} vanilla 窗口（y-4..y+2, t=type a/i=active/inactive w=wall）:`);
      for (const r of ew.van) console.log(`    ${r}`);
      console.log(`  extra@${ew.at} JS 窗口:`);
      for (const r of ew.js) console.log(`    ${r}`);
    }

    // ---- ③' 全图墙对直方图（XXX 二轮指纹复验：95>94 单向互换族）----
    const wPairsAll = new Map<string, number>();
    for (let i = 0; i < w * h; i++) {
      if (wt.wall[i] !== jt.wall[i]) bump(wPairsAll, `${wt.wall[i]}>${jt.wall[i]}`);
    }
    out.wallPairsMapwide = top(wPairsAll, 10);
    let v95 = 0, j95 = 0, v94 = 0, j94 = 0, v7 = 0, j7 = 0;
    for (let i = 0; i < w * h; i++) {
      if (wt.wall[i] === 95) v95++; if (jt.wall[i] === 95) j95++;
      if (wt.wall[i] === 94) v94++; if (jt.wall[i] === 94) j94++;
      if (wt.wall[i] === 7) v7++; if (jt.wall[i] === 7) j7++;
    }
    out.wallVariantTotals = { v95, j95, v94, j94, v7, j7 };
    console.log(`mapwide wall pairs: ${out.wallPairsMapwide.map(([k, n]) => `${k}×${n}`).join(', ')}`);
    console.log(`mapwide wall totals: 95=${v95}/${j95} 94=${v94}/${j94} 7=${v7}/${j7} (v/j)`);

    // ---- ③ 墙 (3288,654)± 窗口：vanilla vs JS wall 差异格清单 + 双侧直方图 ----
    const cx = 3288, cy = 654, R = 40;
    const wallWin: Array<Record<string, number>> = [];
    const whV = new Map<number, number>(), whJ = new Map<number, number>();
    for (let y = cy - R; y <= cy + R; y++) {
      for (let x = cx - R; x <= cx + R; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        bumpN(whV, wt.wall[i]); bumpN(whJ, jt.wall[i]);
        if (wt.wall[i] !== jt.wall[i]) {
          wallWin.push({ x, y, vWal: wt.wall[i], jWal: jt.wall[i], vTyp: wt.type[i], jTyp: SHEET[jt.type[i]] ?? -3, vAct: wt.active[i], jAct: jt.flags[i] });
        }
      }
    }
    out.wallWin = {
      center: [cx, cy], radius: R, diffs: wallWin.length,
      cells: (2 * R + 1) * (2 * R + 1),
      histV: [...whV.entries()].sort((a, b) => b[1] - a[1]),
      histJ: [...whJ.entries()].sort((a, b) => b[1] - a[1]),
      sample: wallWin.slice(0, 200),
    };
    console.log(`wallWin@(${cx},${cy})±${R}: diffs=${wallWin.length}/${out.wallWin.cells}`);
    console.log(`  histV: ${out.wallWin.histV.map(([k, n]) => `${k}:${n}`).join(' ')}`);
    console.log(`  histJ: ${out.wallWin.histJ.map(([k, n]) => `${k}:${n}`).join(' ')}`);
    console.log(`  first diffs: ${JSON.stringify(wallWin.slice(0, 12))}`);
  }

  writeFileSync(`/tmp/aaaa-${file.replace('.wld', '')}.json`, JSON.stringify(out));
  console.log(`→ /tmp/aaaa-${file.replace('.wld', '')}.json`);
}

(RUN ? it : it.skip)('aaaa reprobe', async () => {
  const files = MODE.slice(5).split(',').map((s) => s.trim()).filter(Boolean);
  for (const f of files) await analyzeWorld(f);
}, 3_600_000);
