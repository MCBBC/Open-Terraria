// 用户标注区 (3985-4010×450-465) 全格对拍:链 vs compiled-1458 oracle(out-grass.txt)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileStore } from '../src/world/TileStore';
import { vanillaFrameFor, setVanillaSolidTables, setVanillaFrameImportant, setVanillaVariantMap } from '../src/render/VanillaFraming';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';

const ROOT = join(dirname(fileURLToPath(new URL(import.meta.url))), '../..');

describe('用户标注区 rig 对拍', () => {
  it('3985-4010×450-465 全格', () => {
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

    const dumpText = readFileSync('/tmp/frame-oracle/out-grass.txt', 'utf8');
    const dump: Array<{ x: number; y: number; active: number; type: number; fx: number; fy: number; fn: number }> = [];
    for (const line of dumpText.split('\n')) {
      if (line.startsWith('#')) continue;
      const p2 = line.split(',');
      if (p2.length < 9) continue;
      dump.push({ x: +p2[0], y: +p2[1], active: +p2[2], type: +p2[3], fx: +p2[4], fy: +p2[5], fn: +p2[8] });
    }
    expect(dump.length).toBe(416);

    const wldBuf = new Uint8Array(readFileSync('/Users/vinlic/Downloads/FTW V2.wld'));
    const wld = parseWld(wldBuf);
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
    // 变体注入:oracle fn 逐格(与 golden layer4 同款——num6 是外部见证,链内规则按
    // switch(num6) 选用;缓存命中由 v6 变体域戳守卫,不依赖 forceFresh)
    const vmap = new Map<number, number>();
    for (const d of dump) vmap.set(d.y * wld.tilesWide + d.x, d.fn);
    setVanillaVariantMap(vmap);

    const bad: string[] = [];
    let checked = 0, skippedFI = 0;
    for (const d of dump) {
      if (!d.active) continue;
      if (fiArr[d.type] || d.type === 80) { skippedFI++; continue; }
      const fn = vmap.get(d.y * wld.tilesWide + d.x) ?? 0;
      const r = vanillaFrameFor(st, d.x, d.y, st, fn, 200);
      checked++;
      if (r.fx !== d.fx || r.fy !== d.fy) {
        bad.push(`(${d.x},${d.y}) t${d.type} sw=${r.fx},${r.fy} rig=${d.fx},${d.fy} fn=${d.fn}`);
      }
    }
    console.log(`checked=${checked} skippedFI=${skippedFI} bad=${bad.length}`);
    for (const b of bad.slice(0, 30)) console.log('  ' + b);
    expect(checked).toBeGreaterThan(200); // 区域非 FI 活格实况 ~216(416 总格 −31 FI)
    expect(bad, `差格 ${bad.length}:\n${bad.slice(0, 20).join('\n')}`).toEqual([]);
  });
});
