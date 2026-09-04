// IIII108c（2026-09-04）winter Piles 流对齐仪：JS 全 PT/SP 调用+每 pass 全局掷计数。
// 输出:/tmp/iii148-out/js-stream.txt(PT/SP 全图流,r=pass-local)+js-pass-rolls.txt
// 用法:cd game && SW_I148RUN=1 npx vitest run tools/_iii148run.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I148RUN === '1';
const SEED = process.env.SW_I148_SEED ?? '1.1.1.0.winteriscoming|20260914';
const OUT = process.env.SW_I148_OUT ?? '/tmp/iii148-out';
const W = 4200, H = 1200;

(RUN ? it : it.skip)('III148RUN piles stream capture', async () => {
  mkdirSync(OUT, { recursive: true });
  const rolls: number[] = [];        // 每 reseed 边界全局计数
  const passNames: string[] = [];
  let rollCount = 0;
  (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = () => { rollCount++; };
  const { RNG } = await import('../src/core/rng');
  const rp = RNG.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const origReseed = rp.reseed;
  rp.reseed = function (this: unknown, s: number) {
    rolls.push(rollCount);
    // 捕 reseed 调用点的 pass 锚(▶注释)
    const st = (new Error().stack ?? '').split('\n');
    let nm = '?';
    for (const line of st.slice(1, 8)) {
      const m = line.match(/at (\S+) \(([^)]+)\)/) ?? line.match(/at (\S+)/);
      if (m && m[1] !== 'RNG.reseed') { nm = `${m[1]} @${(m[2] ?? '').split('/').pop()}`; break; }
    }
    passNames.push(nm);
    return (origReseed as (...a: unknown[]) => void).call(this, s);
  };
  const pile: string[] = [];
  (globalThis as { __swPilesCap?: unknown }).__swPilesCap = (x: number, y: number, t: number, s: number, z: number, k: number) => {
    pile.push(`${k === 1 ? 'SP' : 'PT'} r${rollCount} (${x},${y}) t${t} s${s}${k === 1 ? ` z${z}` : ''}`);
  };
  await generateWorld({ width: W, height: H, seedText: SEED });
  rolls.push(rollCount);
  // pass-local 化:Piles 起点=第一个 PT 出现前最近的 reseed —— 直接按 rolls 差分输出全部
  let txt = '';
  for (let i = 0; i < rolls.length; i++) {
    txt += `PASS#${i + 1} global=${rolls[i]}${i > 0 ? ` delta=${rolls[i]! - rolls[i - 1]!}` : ''} ${passNames[i]}\n`;
  }
  writeFileSync(`${OUT}/js-pass-rolls.txt`, txt);
  writeFileSync(`${OUT}/js-stream.txt`, pile.join('\n'));
  console.log(`reseeds=${rolls.length} totalRolls=${rollCount} pileCalls=${pile.length}`);
}, 600_000);
