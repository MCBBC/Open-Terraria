// IIII194 批：座2 TRAPS attempt #3033 (3550,620) 前沿取证仪（一次性诊断,零主路径改动）。
// 移交前沿（CLXVIII）：TRAPS 1:1 深度 3,033,首差 #3033 @mc889817 —— js (3550,620) attempt
// placeTrap0 仅耗 1 骰（rig 同 attempt 耗 5=Next(3)+化石碎裂 4）,js 多 2 attempt 后值流重同步。
// 本仪：①SW_I194=1 → instIdx1 命中 (3550,620) attempt 时点落盘十通道窗口（+raw jt 型域）;
//       ②SW_I179=1 → DR|TRP 流以 Dungeon pass 相对 mc 钉位落盘（与 rig rolltxt 同口径）。
// 用法：cd game && SW_I194=1 [SW_I179=1] npx vitest run tools/_iii194trap.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I194 === '1';
const OUT = '/tmp/iii194-out';

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

(RUN ? it : it.skip)('i194 trap window dump', { timeout: 900_000 }, async () => {
  mkdirSync(OUT, { recursive: true });
  (globalThis as { __swI194Sink?: (d: Record<string, Uint8Array | Uint16Array>, meta: Record<string, number>) => void }).__swI194Sink = (d, meta) => {
    for (const [k, v] of Object.entries(d)) {
      writeFileSync(`${OUT}/js-T194.${k}`, Buffer.from(v.buffer, v.byteOffset, v.byteLength));
    }
    writeFileSync(`${OUT}/js-T194.meta.json`, JSON.stringify(meta));
    console.log('[i194] sink fired at', JSON.stringify(meta), 'channels=' + Object.keys(d).join(','));
  };
  const trp: string[] = [];
  const h113 = (globalThis as { __swI113?: (l: string) => void }).__swI113;
  // —— Dungeon pass 相对 mc 计数（_iiiii191bc 同口径:reseed 即复位,头=label Dungeon）——
  let genRng: unknown = null, genUr: unknown = null, inDungeon = false, mc = 0;
  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  g.__swOnRoll = (v: number, inst: object) => {
    if (!inDungeon || inst !== genUr) return;
    mc++;
  };
  const RNGp = RNG.prototype as unknown as Record<string, (this: unknown, s: number) => void>;
  const oReseed = RNGp.reseed;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    let lab = '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii194trap')) {
        lab = `${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}|${labelOf(m[1], Number(m[2]))}`;
        break;
      }
    }
    const wasIn = inDungeon;
    oReseed.call(this, s);
    if (inDungeon && this === genRng) {
      genUr = (this as { vanilla?: unknown }).vanilla;
      mc = 0;                                            // pass 相对口径:reseed 即复位
    }
    if (!wasIn && lab.includes('|Dungeon') && !inDungeon) {
      inDungeon = true;
      genRng = this;
      genUr = (this as { vanilla?: unknown }).vanilla;
      mc = 0;
    }
  };
  (globalThis as { __swI113?: (l: string) => void }).__swI113 = (l: string) => {
    if (l.startsWith('DR|')) trp.push(inDungeon ? `mc=${mc}|${l}` : l);
    h113?.(l);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1.1.1.0.doubledaringdangers|20260831', evil: -1 as -1 | 0 | 1,
      seedFlags: { dualDungeons: true },
    } as Parameters<typeof generateWorld>[0]);
  } finally {
    delete (globalThis as { __swI194Sink?: unknown }).__swI194Sink;
    (globalThis as { __swI113?: (l: string) => void }).__swI113 = h113;
    g.__swOnRoll = undefined;
    RNGp.reseed = oReseed;
  }
  const idx = trp.findIndex((l) => l.includes('|x=3550|y=620|'));
  console.log(`[i194] TRP lines=${trp.length} target(3550,620) at 0-based ${idx} line=${trp[idx] ?? 'NONE'}`);
  writeFileSync(`${OUT}/js-dr-trp.txt`, trp.join('\n') + '\n');
}, 900_000);
