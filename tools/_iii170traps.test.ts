// IIIII170 批：TRAPS 面逐 raw 重放自校验（源=_iii160l 拷贝,AMENDED）。
// x86 feed=/tmp/iii170-out/x86-feed-dg.txt（x-dungeon.txt local roll#377449 起,
// 即 seat0 TRAPS|i 相界;3928 掷=TRAPS 相全程）。模型行=globalThis.__swI170Trace。
// 用法：cd game && SW_I170=1 SW_I179=1 SW_I170_OUT=/tmp/iii170-out npx vitest run tools/_iii170traps.test.ts
// 产物：$SW_I170_OUT/js-dr-mc.txt + model-trace.txt + js-passlist.txt
import { it } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I170 === '1';
const OUT = process.env.SW_I170_OUT ?? '/tmp/iii170-out';
const FEED = process.env.SW_I170_FEED ?? '/tmp/iii170-out/x86-feed-dg.txt';

(RUN ? it : it.skip)('i170 traps replay capture', { timeout: 900_000 }, async () => {
  const g = globalThis as {
    __swI113?: (l: string) => void;
    __swOnRoll?: (v: number, inst: object) => void;
    __swI170Feed?: number[];
    __swI170Trace?: string[];
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
  (globalThis as { __swI170Dump?: unknown }).__swI170Dump = (d: { x0: number; y0: number; w: number; h: number; typ: Uint8Array; wal: Uint8Array }) => {
    writeFileSync(`${OUT}/js-trapsi.typ`, d.typ);
    writeFileSync(`${OUT}/js-trapsi.wal`, d.wal);
    writeFileSync(`${OUT}/js-trapsi.meta.txt`, `x0=${d.x0} y0=${d.y0} w=${d.w} h=${d.h}\n`);
    console.log(`[i170] state dump ${d.w}x${d.h} @(${d.x0},${d.y0})`);
  };

  // x86 原始掷流（seat0 TRAPS 相界起）
  const feed: number[] = [];
  for (const l of readFileSync(FEED, 'utf8').split('\n')) {
    const t = l.trim();
    if (t) feed.push(parseInt(t, 10));
  }
  g.__swI170Feed = feed;
  console.log(`[i170] feed loaded=${feed.length} first=${feed[0]}`);

  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1.1.1.0.doubledaringdangers|20260831', evil: -1 as -1 | 0 | 1,
      seedFlags: { dualDungeons: true },
    } as Parameters<typeof generateWorld>[0]);
  } finally {
    RNGp.reseed = oReseed;
    g.__swI170Feed = undefined;
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/js-roll-main.txt`, rollLines.join('\n'));
  writeFileSync(`${OUT}/js-dr-mc.txt`, drLines.join('\n'));
  writeFileSync(`${OUT}/js-passlist.txt`, passNames.map((n, i) => `${i}|${n}`).join('\n'));
  writeFileSync(`${OUT}/model-trace.txt`, (g.__swI170Trace ?? []).join('\n'));
  console.log(`[i170] passes=${passSeq + 1} drRows=${drLines.length} traceRows=${(g.__swI170Trace ?? []).length}`);
}, 900_000);
