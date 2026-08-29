// IIII43 一次性仪④b：SandPatches 结构账本 v2 —— 逐迭代 pre/param/post 标记 + 全样本日志。
// 用法：cd game && SW_I43D=1 npx vitest run tools/_i43d.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I43D === '1';

(RUN ? it : it.skip)('i43d ledger v2', async () => {
  const rolls: number[] = [];
  const marks: Array<{ i: number; phase: string; at: number }> = [];
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
  const oReseed = (RNG.prototype as unknown as Record<string, unknown>).reseed as (this: unknown, s: number) => void;
  (RNG.prototype as unknown as Record<string, unknown>).reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    if (/src\/[^\s()]+\.ts/.test(stack)) {
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (!m || m[1].includes('/core/rng')) continue;
        const lab = labelOf(m[1], Number(m[2]));
        if (lab === 'SandPatches') open = true;
        else if (open && lab === 'Tunnels') open = false;
        break;
      }
    }
    return oReseed.call(this, s);
  };
  const g = globalThis as {
    __swOnRoll?: (v: number, inst: object) => void;
    __swI43Mark?: (i: number, phase: 'pre' | 'param' | 'post') => void;
  };
  g.__swOnRoll = (v: number) => { if (open) rolls.push(v); };
  g.__swI43Mark = (i, phase) => { if (open) marks.push({ i, phase, at: rolls.length }); };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1138154190', evil: 0, seedFlags: { remix: true },
    });
  } finally {
    delete g.__swOnRoll; delete g.__swI43Mark;
    (RNG.prototype as unknown as Record<string, unknown>).reseed = oReseed;
  }
  const rows: string[] = ['i\tpreAt\tparamAt\tpostAt\tblockLen\tparamLen\tparamRaw'];
  for (let k = 0; k + 2 < marks.length; k += 3) {
    const pre = marks[k]!, param = marks[k + 1]!, post = marks[k + 2]!;
    if (pre.phase !== 'pre' || param.phase !== 'param' || post.phase !== 'post') { rows.push(`MARK-SKIP@${k}`); break; }
    const rawLen = param.at - pre.at;
    rows.push(`${pre.i}\t${pre.at}\t${param.at}\t${post.at}\t${post.at - param.at}\t${rawLen}\t[${rolls.slice(Math.max(0, pre.at), pre.at + Math.min(12, rawLen)).join(',')}]`);
  }
  console.log(rows.join('\n'));
  writeFileSync('/tmp/iii45-out/i43d-ledger-v2.tsv', rows.join('\n') + '\n');
}, 900_000);
