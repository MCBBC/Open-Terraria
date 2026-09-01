// IIII112b 一次性掷流窗仪（win 埋箱段）：▶UndergroundHousesAndBuriedChests 起、
// ▶SurfaceChests 止的 JS 样本流，落盘两份：
//   win-j-rolls.txt  纯值序列（与 x86 SW_ROLLTXT 同口径，internalSample 原始值）
//   win-j-labeled.txt  v <value> <label>（label=reseed 钩同款 ▶ 标注回溯）
// 用法：cd game && SW_I148R=1 npx vitest run tools/_iii148roll.test.ts
import { it } from 'vitest';
import { readFileSync, createWriteStream } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I148R === '1';
const OUT = process.env.SW_I148R_OUT ?? '/tmp/iii148-out';
const SEED = process.env.SW_I148R_SEED ?? '20260907';
const EVIL = Number(process.env.SW_I148R_EVIL ?? -1);
const FLAGS = Object.fromEntries((process.env.SW_I148R_FLAGS ?? 'worldIsFrozen')
  .split(',').filter(Boolean).map((f) => [f, true]));

const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}

(RUN ? it : it.skip)('win buried segment roll capture', async () => {
  const wsV = createWriteStream(`${OUT}/win-j-rolls.txt`);
  const wsL = createWriteStream(`${OUT}/win-j-labeled.txt`);
  let on = false;
  let n = 0;
  let bufV: string[] = [], bufL: string[] = [];
  // 掷级标签窗（SW_I148R_LW=start,len）：窗内逐掷采栈记直接调用点（RNG 帧之上的第一 src 帧）
  const LW = (process.env.SW_I148R_LW ?? '').split(',').map(Number);
  const lwFrom = Number.isFinite(LW[0]) ? LW[0] : Number.MAX_SAFE_INTEGER;
  const lwTo = Number.isFinite(LW[1]) ? LW[0] + LW[1] : -1;
  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  g.__swOnRoll = (v: number) => {
    if (!on) return;
    const idx = n++;
    bufV.push(String(v));
    if (bufV.length >= 4096) { wsV.write(bufV.join('\n') + '\n'); bufV.length = 0; }
    if (idx >= lwFrom && idx < lwTo) {
      const stack = new Error().stack ?? '';
      let lab = '?';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii148roll')) {
          lab = `${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}|${labelOf(m[1], Number(m[2]))}`;
          break;
        }
      }
      bufL.push(`${idx + 1}|${v}|${lab}`);
      if (bufL.length >= 1024) { wsL.write(bufL.join('\n') + '\n'); bufL.length = 0; }
    }
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    let lab = '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii148roll')) {
        lab = `${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}|${labelOf(m[1], Number(m[2]))}`;
        break;
      }
    }
    if (on) {
      // 段内 reseed（不应发生,pass 头才 reseed）——记事件行
      bufL.push(`! RESEED ${lab}`);
    }
    if (lab.includes('UndergroundHousesAndBuriedChests') && !on) {
      on = true;
      bufL.push(`! START ${lab}`);
      if (bufL.length > 0) { wsL.write(bufL.join('\n') + '\n'); bufL.length = 0; }
    } else if (lab.includes('SurfaceChests') && on) {
      bufL.push(`! END ${lab}`);
      on = false;
      if (bufL.length > 0) { wsL.write(bufL.join('\n') + '\n'); bufL.length = 0; }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: EVIL as -1 | 0 | 1, seedFlags: FLAGS,
      onWorldPartial: () => {},
    });
  } finally {
    RNGp.reseed = oReseed;
    delete g.__swOnRoll;
  }
  if (bufV.length > 0) wsV.write(bufV.join('\n') + '\n');
  if (bufL.length > 0) wsL.write(bufL.join('\n') + '\n');
  await new Promise<void>((res) => { wsV.end(res); wsL.end(); });
  console.log(`rolls=${n} -> ${OUT}/win-j-rolls.txt + win-j-labeled.txt`);
}, 900_000);
