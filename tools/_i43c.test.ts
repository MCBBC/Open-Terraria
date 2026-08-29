// IIII43 一次性仪③：remix 掷窗对拍——__swOnRoll 样本级观察钩 + reseed ▶label 开关窗。
// 与 rig SW_ROLLWIN 同口径（UnifiedRandom.InternalSample 逐值）。产物两份：
// /tmp/iii45-out/js-roll-<winA>.txt（值序列）与控制台首/尾指纹。
// 用法：cd game && SW_I43C=1 SW_I43C_A=SandPatches SW_I43C_B=Tunnels \
//        npx vitest run tools/_i43c.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I43C === '1';
const A = process.env.SW_I43C_A ?? 'SandPatches';
const B = process.env.SW_I43C_B ?? 'Tunnels';

(RUN ? it : it.skip)(`i43c roll window ${A}→${B}`, async () => {
  const vals: number[] = [];
  let open = false;
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  };
  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  const oReseed = (RNG.prototype as unknown as Record<string, unknown>).reseed as (this: unknown, s: number) => void;
  (RNG.prototype as unknown as Record<string, unknown>).reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    let labHit = false;
    if (/src\/[^\s()]+\.ts/.test(stack)) {
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (!m || m[1].includes('/core/rng')) continue;
        const lab = labelOf(m[1], Number(m[2]));
        if (lab === A && !open && !labHit) { open = true; console.log(`window OPEN @${lab}`); }
        else if (lab === B && open) { open = false; console.log(`window CLOSE @${lab} samples=${vals.length}`); }
        break;
      }
    }
    return oReseed.call(this, s);
  };
  g.__swOnRoll = (v: number) => {
    if (open) vals.push(v);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1138154190', evil: 0, seedFlags: { remix: true },
    });
  } finally {
    (RNG.prototype as unknown as Record<string, unknown>).reseed = oReseed;
    delete g.__swOnRoll;
  }
  const OUTP = process.env.SW_I43C_OUT ?? `/tmp/iii45-out/js-roll-${A}.txt`;
  writeFileSync(OUTP, vals.join('\n') + '\n');
  const gs = lastGenState();
  if (gs) {
    console.log(`gs: ws=${gs.worldSurface} rock=${gs.rockLevel} waterLine=${gs.waterLine} lavaLine=${gs.lavaLine} ` +
      `rockLow=${gs.rockLevelLow} rockHigh=${gs.rockLevelHigh} genWS=${Math.trunc(gs.genWorldSurface)} genRock=${Math.trunc(gs.genRockLayer)} remix=[${gs.remixSurfaceLayerLow},${gs.remixSurfaceLayerHigh}) mushroom=[${gs.remixMushroomLayerLow},${gs.remixMushroomLayerHigh})`);
  }
  console.log(`total captured=${vals.length} → ${OUTP}`);
}, 900_000);
