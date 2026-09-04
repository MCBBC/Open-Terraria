// IIIII111 第七轮（CXXVI 批）①号刀：JS 主实例过滤 rolltxt 重产。
// 背景（CXXV §⑤ 备案）：_iii89dg SW_I89_ROLLLOG 是全实例流（不滤 inst），与 rig
//   main-only rolltxt（mc|value）对拍会出 mc=32 假分叉——本仪按 x86 SW_ROLLTXT 同协议
//   重产：pass 头（reseed 锚）归零 + 主实例过滤（inst===ctx.rng.vanilla 新流实例，
//   ≡x86 inst==WorldGen.genRand）+ mc|value 逐样本落盘；DR|S/DR|FEAT 行附 |mc= 主流
//   相对位（=drlMr 口径），供首分叉 mc 的相界归属。
// 缺省只留 Dungeon 槽段（SW_I150_LABEL 可改），全链百万行内存可控。
// 用法：cd game && SW_I150=1 SW_I179=1 SW_MB_1457=1 npx vitest run tools/_iii150roll.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I150 === '1';
const OUT = process.env.SW_I150_OUT ?? '/tmp/iii150-out';
const WANT = new Set((process.env.SW_I150_LABEL ?? 'Dungeon').split(','));

(RUN ? it : it.skip)('i150 main-only rolltxt + DR ledger capture', { timeout: 900_000 }, async () => {
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

  // —— ▶label 解析（_iii89dg capture 同构）——
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

  // ── pass 头边界（reseed 钩，x86 SW_ROLLHOOK「pass 头归零」同位）──
  const RNGp = RNG.prototype as unknown as { reseed: (this: unknown, s: number) => void };
  const oReseed = RNGp.reseed;
  RNGp.reseed = function (this: unknown, s: number) {
    const out = oReseed.call(this, s);
    mainInst = (this as unknown as { vanilla: object }).vanilla; // 新流实例=主实例（≡x86 genRand）
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

  g.__swOnRoll = (v: number, inst: object) => {
    total++;
    g.__swRollTotal = total;
    if (inst === mainInst) {
      mc++;
      g.__swRollN = mc;
      if (WANT.has(curLabel)) rollLines.push(`${mc}|${v}`);
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
  console.log(`[i150] passes=${passSeq + 1} rollLines=${rollLines.length} drRows=${drLines.length} totalSamples=${total}`);
}, 900_000);
