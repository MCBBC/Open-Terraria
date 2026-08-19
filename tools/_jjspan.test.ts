// JJJJ 批：#59 段 JS 掷签名流（对拍 vanilla SW_TT_SPAN_PASSES 产物）。
// SW_JJS=1 SW_JJ_SEED=20260811 SW_JJ_EVIL=0 SW_JJ_W=6400 SW_JJ_H=1800 SW_JJS_OUT=/tmp/jj-span/j.txt
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_JJS === '1';
const SEED = process.env.SW_JJ_SEED ?? '20260811';
const EVIL = Number(process.env.SW_JJ_EVIL ?? 0);
const W = Number(process.env.SW_JJ_W ?? 6400), H = Number(process.env.SW_JJ_H ?? 1800);
const OUT = process.env.SW_JJS_OUT ?? '/tmp/jj-span/j.txt';

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

(RUN ? it : it.skip)(`#59 span ${SEED}`, async () => {
  const lines: string[] = [];
  const inWindow = { on: false };
  const oNext = RNG.prototype.next;
  const oInt = RNG.prototype.int;
  const oNextInt = RNG.prototype.nextInt;
  const oNIR = RNG.prototype.nextIntRange;
  const ctxLo = Number(process.env.SW_JJS_CTX_LO ?? -1), ctxHi = Number(process.env.SW_JJS_CTX_HI ?? -1);
  let rollIdx = 0;
  const ctxLog: string[] = [];
  const noteCtx = (): void => {
    if (ctxLo < 0 || rollIdx < ctxLo || rollIdx > ctxHi) return;
    const st = (new Error().stack ?? '').split('\n').filter((q) => q.includes('/src/'));
    const frames = st.slice(0, 6).map((q) => {
      const m = q.match(/([^/]+\.ts):(\d+):\d+/);
      return m ? `${m[1]}:${m[2]}` : q.slice(0, 40);
    }).join(' < ');
    ctxLog.push(`#${rollIdx} ${frames}`);
  };
  RNG.prototype.next = function (...a: unknown[]) {
    if (inWindow.on) { noteCtx(); rollIdx++; lines.push('d'); }
    return (oNext as (...x: unknown[]) => number).apply(this, a);
  };
  RNG.prototype.int = function (...a: unknown[]) {
    if (inWindow.on) { noteCtx(); rollIdx++; lines.push(`b ${(a[0] as number)} ${(a[1] as number) + 1}`); }
    return (oInt as (...x: unknown[]) => number).apply(this, a);
  };
  RNG.prototype.nextInt = function (...a: unknown[]) {
    if (inWindow.on) { noteCtx(); rollIdx++; lines.push(`a ${(a[0] as number)}`); }
    return (oNextInt as (...x: unknown[]) => number).apply(this, a);
  };
  RNG.prototype.nextIntRange = function (...a: unknown[]) {
    if (inWindow.on) { noteCtx(); rollIdx++; lines.push(`b ${(a[0] as number)} ${(a[1] as number)}`); }
    return (oNIR as (...x: unknown[]) => number).apply(this, a);
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  let stop = false;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    for (const ln of stack.split('\n')) {
      const m = ln.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_jjspan')) {
        const lab = labelOf(m[1], Number(m[2]));
        if (lab === 'UndergroundHousesAndBuriedChests') { inWindow.on = true; lines.push('PASS 58 UndergroundHousesAndBuriedChests'); }
        else if (lab === 'SurfaceChests' && inWindow.on) { stop = true; inWindow.on = false; }
        break;
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({ width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1 });
  } catch { /* stop */ }
  finally {
    RNGp.reseed = oReseed;
    RNG.prototype.next = oNext;
    RNG.prototype.int = oInt;
    RNG.prototype.nextInt = oNextInt;
    RNG.prototype.nextIntRange = oNIR;
  }
  writeFileSync(OUT, lines.join('\n') + '\n');
  if (ctxLog.length) writeFileSync(OUT.replace(/\.txt$/, '.ctx.txt'), ctxLog.join('\n') + '\n');
  console.log(`span lines=${lines.length} ctx=${ctxLog.length} → ${OUT}`);
}, 900_000);
