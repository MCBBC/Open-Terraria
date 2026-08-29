// IIII48 仪G：▶RockLayerCaves 锚点处 GenState 全字段打印（喂给隔离重放仪F）。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I48G === '1';
const W = 4200, H = 1200;
const SEED = 1138154190;

(RUN ? it : it.skip)('i48g genstate at anchor', async () => {
  let gsAtAnchor: unknown = null;
  let fired = false;
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) { try { src = readSrc(file); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  };
  const readSrc = (f: string) => require('node:fs').readFileSync(f, 'utf8');
  void readSrc;
  const oReseed = (RNG.prototype as unknown as Record<string, unknown>).reseed as (this: unknown, s: number) => void;
  const fsread = await import('node:fs');
  (RNG.prototype as unknown as Record<string, unknown>).reseed = function (this: unknown, s: number) {
    if (!fired && (this instanceof RNG)) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng')) {
          // need label but srcCache trick requires sync read; do it lazily:
          try {
            const src = fsread.readFileSync(m[1], 'utf8').split('\n');
            for (let l = Math.min(Number(m[2]), src.length) - 1; l >= 0 && l >= Number(m[2]) - 40; l--) {
              const mm = src[l]!.match(/▶([^（(]+?)[（(\s]/);
              if (mm && mm[1].trim() === (process.env.SW_I48G_LABEL || 'DirtLayerCaves')) {
                const ctxGsAcc = (globalThis as { __swCtxGs?: unknown }).__swCtxGs;
                void ctxGsAcc;
                gsAtAnchor = lastGenState();
                fired = true;
                break;
              }
            }
          } catch { /* ignore */ }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  await generateWorld({ width: W, height: H, seedText: String(SEED), evil: 0, seedFlags: { remix: true } });
  (RNG.prototype as unknown as Record<string, unknown>).reseed = oReseed;
  if (!gsAtAnchor) throw new Error('anchor missed');
  const g = gsAtAnchor as Record<string, unknown>;
  const keys = ['seed', 'worldSurface', 'worldSurfaceLow', 'worldSurfaceHigh', 'rockLevel', 'rockLevelLow',
    'rockLevelHigh', 'waterLine', 'lavaLine', 'genWorldSurface', 'genRockLayer', 'genWorldSurfaceHigh',
    'remixSurfaceLayerLow', 'remixSurfaceLayerHigh', 'remixMushroomLayerLow', 'remixMushroomLayerHigh',
    'beachDistance', 'beachLeftEnd', 'beachRightStart', 'dungeonSide', 'dungeonX', 'snowOriginLeft', 'snowOriginRight', 'snowTop', 'snowBottom', 'jungleX', 'genRockLayer'];
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = g[k];
  console.log(JSON.stringify(out, null, 1));
  writeFileSync('/tmp/iii51-out/genstate-at-caves.json', JSON.stringify(out));
}, 900_000);
