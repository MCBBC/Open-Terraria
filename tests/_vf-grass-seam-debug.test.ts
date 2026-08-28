// 草↔泥边界漏缝诊断(用户标注 3996-3998×456/457,草上有树):离线帧对比。
// 链(vanillaFrameFor) vs 旧路径(autoFrameAt),布局来自真 wld(全量,含边界外上下文)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileStore } from '../src/world/TileStore';
import { vanillaFrameFor, setVanillaSolidTables, setVanillaFrameImportant } from '../src/render/VanillaFraming';
import { autoFrameAt } from '../src/render/VanillaTiler';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';

const ROOT = join(dirname(fileURLToPath(new URL(import.meta.url))), '../..');
const FI_JSON = JSON.parse(readFileSync(join(dirname(fileURLToPath(new URL(import.meta.url))), 'golden/frameImportant.json'), 'utf8')) as number[];

describe('草/泥边界漏缝诊断(用户 6 标注格)', () => {
  it('链帧 vs 旧帧 @ (3994-4002, 454-460)', () => {
    // vanilla solid 表
    const main = readFileSync(`${ROOT}/Terarria1457/Terraria/Main.cs`, 'utf8');
    const solid = new Array(800).fill(false);
    const solidTop = new Array(800).fill(false);
    for (const mm of main.matchAll(/tileSolid\[(\d+)\] = true/g)) solid[+mm[1]] = true;
    for (const mm of main.matchAll(/tileSolidTop\[(\d+)\] = true/g)) solidTop[+mm[1]] = true;
    setVanillaSolidTables(solid, solidTop);
    const fiArr = new Array(800).fill(false);
    for (const t of FI_JSON) fiArr[t] = true;
    setVanillaFrameImportant(fiArr);

    // wld → 内部 id store(运行时同域)
    const wldBuf = new Uint8Array(readFileSync('/Users/vinlic/Downloads/FTW V2.wld'));
    const wld = parseWld(readFileSync('/Users/vinlic/Downloads/FTW V2.wld').slice(-1) && new Uint8Array(readFileSync('/Users/vinlic/Downloads/FTW V2.wld')));
    void wldBuf;
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
    }
    const name = (t: number) => {
      const k = TILE_DEFS[t]?.key ?? '?';
      return k === 'grass' ? '草' : k === 'dirt' ? '土' : k === 'stone' ? '石' : k;
    };
    const lines: string[] = [];
    for (let y = 454; y <= 460; y++) {
      let line = `${y} | `;
      for (let x = 3994; x <= 4002; x++) {
        const i = st.idx(x, y);
        if (!st.flags[i]) { line += '  ....   '; continue; }
        const t = st.type[i];
        const chain = vanillaFrameFor(st, x, y, st, 0, 200);
        const oldF = autoFrameAt(st, x, y, t);
        const tag = `${name(t).slice(0, 2)}[${Math.floor(chain.fx / 18)},${Math.floor(chain.fy / 18)}|${oldF.col},${oldF.row}]`;
        line += tag.padEnd(11);
        if (Math.floor(chain.fx / 18) !== oldF.col || Math.floor(chain.fy / 18) !== oldF.row) {
          line += '≠';
        }
      }
      lines.push(line);
    }
    console.log(lines.join('\n'));
    // 断言:泥土(草下)的链帧应为内帧 (18,18) 系(col 1-3,row 1)——rig 已证同类
    let dirtBad = 0;
    for (let x = 3996; x <= 3998; x++) {
      const y = 457;
      const r = vanillaFrameFor(st, x, y, st, 0, 200);
      const col = Math.floor(r.fx / 18), row = Math.floor(r.fy / 18);
      // 内帧族 = row1 col1-3(全连)或同带
      if (!(row === 1 && col >= 1 && col <= 3)) dirtBad++;
      console.log(`泥土(${x},${y}) chain=(${r.fx},${r.fy}) col=${col} row=${row}`);
    }
    expect(dirtBad, '草下泥土应为内帧族(row1 col1-3),否则 = 漏缝根因实锤').toBe(0);
  });
});
