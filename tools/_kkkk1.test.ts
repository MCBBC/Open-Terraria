// 一次性诊断（KKKKKKK 批 2026-08-24）：JS 侧 Dungeon 窗【API 级掷流】捕获 +
// 全 pass 掷数账本。与 compiled-1457 rig（JJHook.OnRollCall）同格式对拍：
//   N r / A max r / B min maxExcl r / D double
// 原理：UnifiedRandom.prototype 四个公开方法 = 全部 gen 掷骰单一漏斗；
// RNG.prototype.reseed 栈扫 ▶label 定 pass 边界（mile8 同款）。
// 用法：cd game && SW_MB_1457=1 SW_K1=1 [SW_K1_SEED=1321365005] [SW_K1_EVIL=0]
//       [SW_K1_FLAGS=theConstant] [SW_K1_OUT=/tmp/kkk-out/jspan.txt]
//       [SW_K1_JSTACK=from:to] npx vitest run tools/_kkkk1.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG, UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_K1 === '1';
const SEED = process.env.SW_K1_SEED ?? '1321365005';
const EVIL = process.env.SW_K1_EVIL !== undefined ? Number(process.env.SW_K1_EVIL) : 0;
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_K1_FLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;
const OUT = process.env.SW_K1_OUT ?? '/tmp/kkk-out/jspan.txt';

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

(RUN ? it : it.skip)('JS dungeon-window roll stream capture', async () => {
  const t0 = Date.now();
  const lines: string[] = [];
  const ledger: string[] = [];   // per-pass roll counts（label → rolls since previous reseed）
  const jstack: string[] = [];
  const jstk = (process.env.SW_K1_JSTACK ?? '').split(':').map(Number);
  const jlo = jstk.length === 2 && jstk.every(Number.isFinite) ? jstk[0]! : -1;
  const jhi = jstk.length === 2 && jstk.every(Number.isFinite) ? jstk[1]! : -1;
  let armed = false;
  let prevLabel = '(pre)';
  let sinceReseed = 0;
  let storeRef: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array } | null = null;
  const SHEET_OF = new Int32Array(4096).fill(-1);
  try {
    const td = await import('../src/data/tiles');
    for (let q = 0; q < (td.TILE_DEFS as Array<{ vanilla?: { sheet?: number } }>).length; q++) {
      const s2 = (td.TILE_DEFS as Array<{ vanilla?: { sheet?: number } }>)[q]?.vanilla?.sheet;
      if (typeof s2 === 'number') SHEET_OF[q] = s2;
    }
  } catch { /* 表缺失时打印内部 id */ }

  const URp = UnifiedRandom.prototype as unknown as Record<string, (...a: number[]) => number>;
  const oNext = URp.next!, oRange = URp.nextIntRange!, oInt = URp.nextInt!, oDouble = URp.nextDouble!;
  const rec = (s: string) => {
    if (!armed) return;
    lines.push(s);
    if (jlo >= 0 && lines.length >= jlo && lines.length <= jhi) {
      jstack.push(`roll ${lines.length} ${s}\n${new Error().stack}\n====`);
    }
  };
  URp.next = function () { const r = oNext.call(this); rec(`N ${r}`); return r; };
  URp.nextIntRange = function (a: number, b: number) { const r = oRange.call(this, a, b); rec(`B ${a} ${b} ${r}`); return r; };
  URp.nextInt = function (m: number) { const r = oInt.call(this, m); rec(`A ${m} ${r}`); return r; };
  URp.nextDouble = function () { const r = oDouble.call(this); rec(`D ${r}`); return r; };

  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    let lab = '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_kkkk1')) { lab = labelOf(m[1], Number(m[2])); break; }
    }
    // 账本：自上次 reseed 以来的掷数记到上一个 pass 名下
    ledger.push(`${prevLabel}\t${sinceReseed}`);
    prevLabel = lab || '(?)';
    sinceReseed = 0;
    const wasArmed = armed;
    armed = false;                       // reseed 瞬间暂停（防边界计数串味）
    const r = oReseed.call(this, s);
    if (lab === 'Dungeon') { lines.length = 0; armed = true; }
    else if (lab === 'MountainCaveOpenings' && wasArmed) {
      armed = false;
      // KKKKKKK 网格窗快照：SW_K1_WIN=x0:y0:x1:y1 → 打印 sheet/act（post-Dungeon 态）
      const win = (process.env.SW_K1_WIN ?? '').split(':').map(Number);
      if (process.env.SW_K1_DUMP && storeRef) {
        const st2 = storeRef as unknown as { type: Uint16Array; flags: Uint8Array };
        writeFileSync(process.env.SW_K1_DUMP + '.typ', Buffer.from(st2.type.buffer.slice(0)));
        writeFileSync(process.env.SW_K1_DUMP + '.act', Buffer.from(st2.flags.slice(0)));
        console.log(`[k1] grid dump → ${process.env.SW_K1_DUMP}.{typ,act}`);
      }
      if (win.length === 4 && storeRef && win.every(Number.isFinite)) {
        const [x0, y0, x1, y1] = win as [number, number, number, number];
        for (let y = y0; y <= y1; y++) {
          const row: string[] = [];
          for (let x = x0; x <= x1; x++) {
            const i2 = y * 4200 + x;
            const sh = SHEET_OF[storeRef.type[i2]!] ?? storeRef.type[i2]!;
            row.push(`${storeRef.flags[i2!]! & 1 ? sh : '.'}`);
          }
          console.log(`j${y}: ${row.join(' ')}`);
        }
      }
    }
    return r;
  };

  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined,
      onWorldPartial: (w) => { if (!storeRef) storeRef = w.store as never as typeof storeRef; },
    });
  } finally {
    URp.next = oNext; URp.nextIntRange = oRange; URp.nextInt = oInt; URp.nextDouble = oDouble;
    RNGp.reseed = oReseed;
  }
  writeFileSync(OUT, lines.join('\n') + '\n');
  writeFileSync(OUT.replace(/\.txt$/, '.ledger.txt'), ledger.join('\n') + '\n');
  if (jstack.length) writeFileSync(OUT.replace(/\.txt$/, '.jstack.txt'), jstack.join('\n'));
  console.log(`[k1] rolls=${lines.length} → ${OUT}; done ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}, 900_000);
