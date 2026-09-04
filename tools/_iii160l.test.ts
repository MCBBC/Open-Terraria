// IIIII160 批：LIGHTS 特征族事件级对账 JS 侧采集（源=_iii150roll 拷贝，AMENDED）。
// x86 rig（i137rsrc 增织 DR|LGQ/LAT/LG1/LG2/LC/LN/L7/LCHS/LPCF/LCOK/LLN/LLA/LLOK/LSW+DR|CG）
// 同构标全走 __swI113（本仪附 |mc= 主流相对位）；FEAT 相界行同样附 mc。
// 用法：cd game && SW_I160=1 SW_I179=1 SW_MB_1457=1 npx vitest run tools/_iii160l.test.ts
// 产物：$SW_I160_OUT（缺省 /tmp/iii160-out）/js-dr-mc.txt + js-roll-main.txt + js-passlist.txt
import { it } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I160 === '1';
const OUT = process.env.SW_I160_OUT ?? '/tmp/iii160-out';
const WANT = new Set((process.env.SW_I160_LABEL ?? 'Dungeon').split(','));

(RUN ? it : it.skip)('i160 lights-family event ledger capture', { timeout: 900_000 }, async () => {
  const g = globalThis as {
    __swI113?: (l: string) => void;
    __swOnRoll?: (v: number, inst: object) => void;
    __swRollN?: number;
    __swRollTotal?: number;
  };
  const rollLines: string[] = [];
  const drLines: string[] = [];
  const passNames: string[] = [];
  let passSeq = -1;
  let mc = 0;
  let total = 0;
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
    if (WANT.has(lab)) rollLines.push(`#PASS ${passSeq} ${lab}`);
    return out;
  };

  const stkOut: string[] = [];
  const stkLo = +(process.env.SW_I160_STKLO ?? -1);
  const stkHi = +(process.env.SW_I160_STKHI ?? -1);
  g.__swOnRoll = (v: number, inst: object) => {
    total++;
    g.__swRollTotal = total;
    if (inst === mainInst) {
      mc++;
      g.__swRollN = mc;
      if (WANT.has(curLabel)) rollLines.push(`${mc}|${v}`);
      if (mc >= stkLo && mc <= stkHi) {
        const st = (new Error().stack ?? '').split('\n').slice(2, 15)
          .map((f) => { const m = f.match(/at ([^\s(]+) \(([^)]+)\)/); if (!m) return ''; const ln = m[2].match(/DungeonPass\.ts:(\d+):/); return `${m[1].replace('Module.', '')}@${ln ? ln[1] : 'rng'}`; }).filter(Boolean);
        stkOut.push(`${mc}|${v}|${st.join(' <- ')}`);
      }
    }
  };
  (globalThis as { __swI160StkFlush?: (lines: string[]) => void }).__swI160StkFlush = (lines: string[]) => {
    lines.push(...stkOut);
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
  if (stkLo >= 0) writeFileSync(`${OUT}/js-stk.txt`, stkOut.join('\n'));
  console.log(`[i160] passes=${passSeq + 1} rollLines=${rollLines.length} drRows=${drLines.length} totalSamples=${total}`);
}, 900_000);
