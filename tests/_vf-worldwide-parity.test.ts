// 全世界逐格解释器 vs 代码生成对拍(移植 /tmp/vf-codegen/allparity.mjs 的世界与驱动语义,
// 但走本仓真实链路与 id 域契约)。世界 = 其 world.json(vanilla id 域)→ 经 TILE_DEFS 反查内部域。
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileStore } from '../src/world/TileStore';
import {
  vanillaFrameFor, invalidateVanillaFrames, setVanillaSolidTables,
  setFramingCodegenEnabled,
} from '../src/render/VanillaFraming';
import { TILE_DEFS } from '../src/data/tiles';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const ROOT = join(dirname(fileURLToPath(new URL(import.meta.url))), '../..');

describe.skipIf(EXT_MISSING)('vf codegen worldwide parity', () => {
  it('interp == codegen over every active cell', () => {
    const main = readFileSync(`${ROOT}/Terarria1457/Terraria/Main.cs`, 'utf8');
    const solid = new Array(800).fill(false);
    const solidTop = new Array(800).fill(false);
    for (const mm of main.matchAll(/tileSolid\[(\d+)\] = true/g)) solid[+mm[1]] = true;
    for (const mm of main.matchAll(/tileSolidTop\[(\d+)\] = true/g)) solidTop[+mm[1]] = true;
    setVanillaSolidTables(solid, solidTop);

    // 内部 id 域转换表(vanilla sheet → TILE_DEFS 首个内-id)
    const v2i = new Map<number, number>();
    for (let i2 = 0; i2 < TILE_DEFS.length; i2++) {
      const v = TILE_DEFS[i2]?.vanilla;
      if (v && !v2i.has(v.sheet)) v2i.set(v.sheet, i2);
    }

    const wld = JSON.parse(readFileSync('/tmp/vf-codegen/world.json', 'utf8')) as {
      w: number; h: number; type: number[]; flags: number[]; slope: number[]; half: number[];
    };
    const st = new TileStore(wld.w, wld.h);
    for (let k = 0; k < wld.type.length; k++) {
      if (!wld.flags[k]) continue;
      st.flags[k] = 1;
      st.type[k] = v2i.get(wld.type[k]) ?? 0;
      st.slope[k] = wld.slope[k];
      st.half[k] = wld.half[k] ? 1 : 0;   // ★BJ239:half 现为 Uint8Array——布尔直赋隐式成 1/0,显式化同值
    }

    let n = 0, bad = 0;
    const samples: string[] = [];
    let tI = 0, tG = 0;
    try {
      // 解释器通道(fresh)
      setFramingCodegenEnabled(false);
      const t0 = performance.now();
      const res: string[] = [];
      for (let j = 0; j < st.h; j++) for (let i = 0; i < st.w; i++) {
        const idx = st.idx(i, j);
        if (!st.flags[idx]) continue;
        const v = ((i * 31 + j * 57) >>> 0) % 3;
        const rl = j > st.h * 0.55 ? 2 : (j > st.h * 0.3 ? 1 : 0);
        const r = vanillaFrameFor(st, i, j, st, v, rl, true);
        res.push(`${r.fx},${r.fy}`);
        n++;
      }
      tI = performance.now() - t0;
      // 代码生成通道(fresh)
      setFramingCodegenEnabled(true);
      let k2 = 0;
      const t1 = performance.now();
      for (let j = 0; j < st.h; j++) for (let i = 0; i < st.w; i++) {
        const idx = st.idx(i, j);
        if (!st.flags[idx]) continue;
        const v = ((i * 31 + j * 57) >>> 0) % 3;
        const rl = j > st.h * 0.55 ? 2 : (j > st.h * 0.3 ? 1 : 0);
        const r = vanillaFrameFor(st, i, j, st, v, rl, true);
        if (`${r.fx},${r.fy}` !== res[k2]) {
          bad++;
          if (samples.length < 6) samples.push(`(${i},${j}) t${st.type[idx]} I=${res[k2]} G=${r.fx},${r.fy}`);
        }
        k2++;
      }
      tG = performance.now() - t1;
    } finally {
      setFramingCodegenEnabled(null);
      invalidateVanillaFrames({});
    }
    console.log(`worldwide cells=${n} mismatch=${bad} | interp=${tI.toFixed(0)}ms (${(tI / n * 1000).toFixed(1)}µs/cell) gen=${tG.toFixed(0)}ms (${(tG / n * 1000).toFixed(1)}µs/cell)`);
    if (samples.length) console.log(samples.join('\n'));
    expect(bad, `全世界失配 ${bad} 格:\n${samples.join('\n')}`).toBe(0);
  });
});
