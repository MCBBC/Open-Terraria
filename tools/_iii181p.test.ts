// IIII181 批：PAINTINGS +142 定罪修复后的全链重跑捕获（源=_iii170traps 拷贝,去 feed）。
// 产物=$SW_I181_OUT 下 js-dr-mc.txt / js-roll-main.txt / js-passlist.txt，
// 与 /tmp/iii175-out/rig/dr-mark.log + rig/rolltxt.txt 对拍（FRONTIER:座2 布局厅账 157vs145）。
// 用法：cd game && SW_I181=1 SW_I181_OUT=/tmp/iii181-out npx vitest run tools/_iii181p.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I181 === '1';
const OUT = process.env.SW_I181_OUT ?? '/tmp/iii181-out';

(RUN ? it : it.skip)('i181 dungeon capture', { timeout: 900_000 }, async () => {
  const g = globalThis as {
    __swI113?: (l: string) => void;
    __swOnRoll?: (v: number, inst: object) => void;
  };
  const rollLines: string[] = [];
  const drLines: string[] = [];
  const passNames: string[] = [];
  let passSeq = -1;
  let mc = 0;
  let mainInst: object | null = null;
  let curLabel = '';

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

  const RNGp = RNG.prototype as unknown as { reseed: (this: unknown, s: number) => void };
  const oReseed = RNGp.reseed;
  RNGp.reseed = function (this: unknown, s: number) {
    const out = oReseed.call(this, s);
    mainInst = (this as unknown as { vanilla: object }).vanilla;
    passSeq++;
    mc = 0;
    let lab = `pass${passSeq}`;
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng')) { lab = labelOf(m[1], Number(m[2])); break; }
    }
    curLabel = lab;
    passNames.push(lab);
    if (lab === 'Dungeon') rollLines.push(`#PASS ${passSeq} ${lab}`);
    return out;
  };

  g.__swOnRoll = (v: number, inst: object) => {
    if (inst === mainInst) {
      mc++;
      if (curLabel === 'Dungeon') rollLines.push(`${mc}|${v}`);
    }
  };
  g.__swI113 = (l: string) => drLines.push(`${l}|mc=${mc}`);

  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1.1.1.0.doubledaringdangers|20260831', evil: -1 as -1 | 0 | 1,
      seedFlags: { dualDungeons: true },
    } as Parameters<typeof generateWorld>[0]);
  } finally {
    RNGp.reseed = oReseed;
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/js-roll-main.txt`, rollLines.join('\n'));
  writeFileSync(`${OUT}/js-dr-mc.txt`, drLines.join('\n'));
  writeFileSync(`${OUT}/js-passlist.txt`, passNames.map((n, i) => `${i}|${n}`).join('\n'));
  const wv = (globalThis as { __wvLines?: string[] }).__wvLines;
  if (wv) writeFileSync(`${OUT}/js-wvlines.txt`, wv.join('\n'));
  console.log(`[i181] passes=${passSeq + 1} drRows=${drLines.length} rollRows=${rollLines.length}`);
}, 900_000);
