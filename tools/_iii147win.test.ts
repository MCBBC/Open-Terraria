// IIII112 一次性窗口快照仪（clone 自 _iii142win + frameX/frameY 通道追加）：在 ▶GlowingMushroomPatches 与 ▶Marble 两个 reseed 锚点
// 落盘 JS 八通道（JS 内部 id 已折算 vanilla sheet 域，ghost 按原值保留），供与
// x86 dump 做跨窗口逐写笔差分。
// 用法：SW_MB_1457=1 SW_IW=1 SW_IW_OUT=/tmp/iii142-out/cap-sa \
//        SW_IW_SEED='1.1.1.0.sandybritches|106104' npx vitest run tools/_iii142win.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_IW === '1';
const OUT = process.env.SW_IW_OUT ?? '/tmp/iii147-out/cap-x';
const SEED = process.env.SW_IW_SEED ?? '';
const EVIL = Number(process.env.SW_IW_EVIL ?? -1);
const LABELS = (process.env.SW_IW_LABELS ?? 'GlowingMushroomPatches,Marble').split(',');
const CHANS = ['flags', 'type', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire'] as const;
mkdirSync(OUT, { recursive: true });
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('iiiiii147 window cap', async () => {
  let storeHolder: { st?: Record<string, Uint8Array | Uint16Array> } = {};
  const done = new Set<string>();
  const take = (nm: string): void => {
    const st = storeHolder.st!;
    for (const c of CHANS) {
      const srcA = st[c]!;
      if (c === 'type') {
        const out = new Int16Array(srcA.length);
        for (let i = 0; i < srcA.length; i++) out[i] = st.flags[i] ? SHEET[srcA[i]!] ?? 9999 : SHEET[srcA[i]!] ?? 9999;
        writeFileSync(`${OUT}/j_${nm}_typ.bin`, Buffer.from(out.buffer, out.byteOffset, out.byteLength));
      } else {
        writeFileSync(`${OUT}/j_${nm}_${c}.bin`, Buffer.from(srcA.buffer, srcA.byteOffset, srcA.byteLength));
      }
    }
    for (const c of ['frameX', 'frameY'] as const) {
      const srcF = st[c]!;
      writeFileSync(`${OUT}/j_${nm}_${c}.bin`, Buffer.from(srcF.buffer, srcF.byteOffset, srcF.byteLength));
    }
    console.log(`[iw] snap ${nm}`);
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (storeHolder.st) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (!m || m[1].includes('/core/rng') || m[1].includes('_iii147win')) continue;
        const src = (() => { try { return readFileSync(m[1], 'utf8').split('\n'); } catch { return []; } })();
        let lab = m[1];
        for (let l = Math.min(Number(m[2]), src.length) - 1; l >= 0 && l >= Number(m[2]) - 40; l--) {
          const mm = src[l]!.match(/▶([^（(]+?)[（(\s]/);
          if (mm) { lab = mm[1].trim(); break; }
        }
        if (LABELS.includes(lab) && !done.has(lab)) {
          done.add(lab);
          take(lab);
        }
        break;
      }
    }
    return oReseed.call(this, s);
  };
  await generateWorld({
    width: 4200, height: 1200, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    seedFlags: undefined,
    onWorldPartial: (w) => {
      if (!storeHolder.st) storeHolder.st = w.store as unknown as Record<string, Uint8Array | Uint16Array>;
    },
  });
  RNGp.reseed = oReseed;
  {
    const gs = lastGenState() as unknown as Record<string, unknown>;
    const pick = (o: unknown): unknown => o;
    writeFileSync(`${OUT}/j_gs.json`, JSON.stringify({
      worldSurface: pick(gs.worldSurface), worldSurfaceLow: gs.worldSurfaceLow,
      rockLevel: gs.rockLevel, undergroundDesert: gs.undergroundDesert,
      w: (storeHolder.st && (storeHolder.st.flags as Uint8Array).length / (4200 * 1200)) ?? 0,
    }));
  }
  console.log(`done; captured=${[...done].join(',')}`);
}, 900_000);
