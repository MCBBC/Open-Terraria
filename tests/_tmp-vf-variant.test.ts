// 变体通道仲裁:同一 store、同一格,fn 注入(rig 变体)vs hash 变体(SW 运行时)逐格对比,
// 并对分歧格开 trace 找误译分支。
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { vanillaFrameFor, setVanillaSolidTables, setVanillaFrameImportant } from '../src/render/VanillaFraming';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';

describe('variant channel', () => {
  it('fn vs hash', () => {
    const main = readFileSync(`${ROOT}/Terarria1457/Terraria/Main.cs`, 'utf8');
    const solid = new Array(800).fill(false);
    const solidTop = new Array(800).fill(false);
    for (const mm of main.matchAll(/tileSolid\[(\d+)\] = true/g)) solid[+mm[1]] = true;
    for (const mm of main.matchAll(/tileSolidTop\[(\d+)\] = true/g)) solidTop[+mm[1]] = true;
    setVanillaSolidTables(solid, solidTop);
    const fiList: number[] = JSON.parse(readFileSync(`${ROOT}/game/tests/golden/frameImportant.json`, 'utf8'));
    const fiArr = new Array(800).fill(false);
    for (const t of fiList) fiArr[t] = true;
    setVanillaFrameImportant(fiArr);

    const buf = readFileSync('/Users/vinlic/Downloads/FTW V2.wld');
    const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const wld = parseWld(u8);
    const v2i = new Map<number, number>();
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const v = TILE_DEFS[i]?.vanilla;
      if (v && !v2i.has(v.sheet)) v2i.set(v.sheet, i);
    }
    const st = new TileStore(wld.tilesWide, wld.tilesHigh);
    const N = wld.tilesWide * wld.tilesHigh;
    for (let i = 0; i < N; i++) {
      if (!wld.tiles.active[i]) continue;
      st.flags[i] = 1;
      st.type[i] = v2i.get(wld.tiles.type[i]) ?? 0;
      st.half[i] = wld.tiles.half[i];
      st.slope[i] = wld.tiles.slope[i];
      st.frameX[i] = -1; st.frameY[i] = -1;
    }
    // rig dump fn
    const rig = new Map<string, { fx: number; fy: number; fn: number; type: number }>();
    for (const line of readFileSync('/tmp/frame-oracle/out-grass.txt', 'utf8').split('\n')) {
      if (line.startsWith('#')) continue;
      const p2 = line.split(',');
      if (p2.length < 9) continue;
      rig.set(`${p2[0]},${p2[1]}`, { fx: +p2[4], fy: +p2[5], fn: +p2[8], type: +p2[3] });
    }
    const lines: string[] = [];
    let structBad = 0;
    for (const [k, r] of rig) {
      if (!r.fx && !r.fy) continue;
      const [xs, ys] = k.split(',');
      const x = +xs, y = +ys;
      if (y < 455 || y > 460 || x < 3990 || x > 4008) continue;
      const h = ((x * 7) + (y * 11)) % 3;
      const byFn = vanillaFrameFor(st, x, y, st, r.fn, 200, true);
      const byHash = vanillaFrameFor(st, x, y, st, h, 200, true);
      // 归一(fn 归一后比较:fx-18*fn)
      const normFn = byFn.fx - 18 * r.fn;
      const normHash = byHash.fx - 18 * h;
      const same = normFn === normHash && byFn.fy === byHash.fy;
      if (!same) {
        structBad++;
        lines.push(`(${x},${y}) vid=${r.type} fn=${r.fn}->(${byFn.fx},${byFn.fy}) hash=${h}->(${byHash.fx},${byHash.fy}) rig=(${r.fx},${r.fy})`);
      }
    }
    console.log(`variant-structural diffs: ${structBad}`);
    console.log(lines.slice(0, 40).join('\n'));
    writeFileSync('/tmp/vf-variant-diffs.txt', lines.join('\n'));

    // trace 一个代表格
    const trace: string[] = [];
    const tr = { push(l: string) { trace.push(l); } };
    vanillaFrameFor(st, 3996, 456, st, ((3996 * 7) + (456 * 11)) % 3, 200, true, tr);
    writeFileSync('/tmp/vf-trace-3996-456.txt', trace.join('\n'));
    console.log('trace lines:', trace.length, '-> /tmp/vf-trace-3996-456.txt');
  });
});
