// 代码生成通道对拍 + 基准:解释器 vs tileframe-codegen.js,三方(含 rig 权威)逐位一致。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readLocalFixture } from './fixturePath';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileStore } from '../src/world/TileStore';
import {
  vanillaFrameFor, invalidateVanillaFrames, setVanillaSolidTables, setVanillaFrameImportant,
  setVanillaVariantMap, setFramingCodegenEnabled,
} from '../src/render/VanillaFraming';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_ORACLE === "1";   // ★一次性 rig/oracle 仪(2026-09-02 补门):夹具在 /tmp 不入库,缺省 skip 防默认 sweep 红;SW_ORACLE=1 启用

const ROOT = join(dirname(fileURLToPath(new URL(import.meta.url))), '../..');
const FTW = 'ftw-v2.wld';   // ★C档收编:原 ~/Downloads/FTW V2.wld(见 tests/fixtures/local/README.md)

interface Row { x: number; y: number; type: number; fx: number; fy: number; fn: number }

function loadDump(path: string): Row[] {
  const out: Row[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.startsWith('#')) continue;
    const p = line.split(',');
    if (p.length < 9) continue;
    out.push({ x: +p[0], y: +p[1], type: +p[3], fx: +p[4], fy: +p[5], fn: +p[8] });
  }
  return out;
}

(RUN ? describe : describe.skip)('vf codegen parity', () => {
  it('interp == codegen == rig (grass region + FTW golden)', () => {
    const main = readFileSync(`${ROOT}/Terarria1457/Terraria/Main.cs`, 'utf8');
    const solid = new Array(800).fill(false);
    const solidTop = new Array(800).fill(false);
    for (const mm of main.matchAll(/tileSolid\[(\d+)\] = true/g)) solid[+mm[1]] = true;
    for (const mm of main.matchAll(/tileSolidTop\[(\d+)\] = true/g)) solidTop[+mm[1]] = true;
    setVanillaSolidTables(solid, solidTop);
    const FI_JSON = JSON.parse(readFileSync(join(dirname(fileURLToPath(new URL(import.meta.url))), 'golden/frameImportant.json'), 'utf8')) as number[];
    const fiArr = new Array(800).fill(false);
    for (const t of FI_JSON) fiArr[t] = true;
    setVanillaFrameImportant(fiArr);

    const wld = parseWld(new Uint8Array(readLocalFixture(FTW)));
    const v2i = new Map<number, number>();
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const v = TILE_DEFS[i]?.vanilla;
      if (v && !v2i.has(v.sheet)) v2i.set(v.sheet, i);
    }
    const st = new TileStore(wld.tilesWide, wld.tilesHigh);
    for (let i = 0; i < wld.tilesWide * wld.tilesHigh; i++) {
      if (!wld.tiles.active[i]) continue;
      st.flags[i] = 1;
      st.type[i] = v2i.get(wld.tiles.type[i]) ?? 0;
      st.half[i] = wld.tiles.half[i];
      st.slope[i] = wld.tiles.slope[i];
    }

    const dumps: Array<[string, Row[]]> = [
      ['grass', loadDump('/tmp/frame-oracle/out-grass.txt')],
      ['ftw', loadDump(join(ROOT, 'game/tests/golden/rig-ftw-frames.txt')).filter((d) => d.x >= 3940 && d.x <= 3990 && d.y >= 460 && d.y <= 500)],
    ];

    try {
      for (const [name, dump] of dumps) {
        setVanillaVariantMap(new Map(dump.map((d) => [d.y * wld.tilesWide + d.x, d.fn] as [number, number])));
        // Pass A 解释器(bypass 全局缓存,与金标 layer4 同法)
        setFramingCodegenEnabled(false);
        invalidateVanillaFrames({});
        const tA0 = performance.now();
        const interp: string[] = [];
        for (const d of dump) {
          if (!st.flags[st.idx(d.x, d.y)] || fiArr[d.type] || d.type === 80) continue;
          const r = vanillaFrameFor(st, d.x, d.y, st, d.fn, 200, true);
          interp.push(`${r.fx},${r.fy}`);
        }
        const tA = performance.now() - tA0;

        // Pass B 代码生成(fresh)
        setFramingCodegenEnabled(true);
        const tB0 = performance.now();
        let diffInterp = 0, diffRig = 0, n = 0;
        const samples: string[] = [];
        dump.forEach((d, k) => {
          if (!st.flags[st.idx(d.x, d.y)] || fiArr[d.type] || d.type === 80) return;
          const r = vanillaFrameFor(st, d.x, d.y, st, d.fn, 200, true);
          n++;
          if (`${r.fx},${r.fy}` !== interp[n - 1]) { diffInterp++; }
          if (r.fx !== d.fx || r.fy !== d.fy) { diffRig++; if (samples.length < 8) samples.push(`(${d.x},${d.y}) t${d.type} gen=${r.fx},${r.fy} rig=${d.fx},${d.fy} interp=${interp[n - 1]}`); }
        });
        const tB = performance.now() - tB0;

        // Pass C 代码生成(带缓存冷通道——生产 chunk 烘焙形态)
        setFramingCodegenEnabled(true);
        invalidateVanillaFrames({});
        const tC0 = performance.now();
        for (let i = 0; i < wld.tilesWide * wld.tilesHigh; i++) void i; // noop keep shape
        for (const d of dump) {
          if (!st.flags[st.idx(d.x, d.y)] || fiArr[d.type] || d.type === 80) continue;
          vanillaFrameFor(st, d.x, d.y, st, d.fn, 200);
        }
        const tC = performance.now() - tC0;

        console.log(`[${name}] cells=${n} diffInterp=${diffInterp} diffRig=${diffRig} | interp=${tA.toFixed(0)}ms (${(tA / n * 1000).toFixed(1)}µs/cell) genFresh=${tB.toFixed(0)}ms (${(tB / n * 1000).toFixed(1)}µs/cell) genCached=${tC.toFixed(0)}ms`);
        expect(diffInterp, `[${name}] gen 与解释器差格`).toBe(0);
        expect(diffRig, `[${name}] gen 与 rig 差格:\n${samples.join('\n')}`).toBe(0);
      }
    } finally {
      setFramingCodegenEnabled(null);
      setVanillaVariantMap(null);
    }
  });
});
