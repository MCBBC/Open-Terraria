// IIIII191 批（ddual 收敛第十五轮）一次性取证仪：座2 BASICCHESTS 房37 (2659,630)
// 沙漠箱 attempt 掷流双侧分解——js 侧主实例（genRand 同构）Dungeon pass 相对计数
// 逐骰落盘（值+调用站点 label）+ DR|BCR/BCP/BCG/BCH 标 mc 钉位。
// 与 rig rolltxt（SW_ROLLTXT pass 相对 mc|value）同口径对拍 → 逐骰归属定罪。
// 用法：cd game && SW_MB_1457=1 SW_I191BC=1 SW_I191_OUT=/tmp/iii191-out \
//         npx vitest run tools/_iiiii191bc.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I191BC === '1';
const OUT = process.env.SW_I191_OUT ?? '/tmp/iii191-out';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
// 窗口（pass 相对 mc）
const W0 = Number(process.env.SW_I191_W0 ?? 690400), W1 = Number(process.env.SW_I191_W1 ?? 691000);

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

(RUN ? it : it.skip)('i191 room37 loot dice capture', { timeout: 900_000 }, async () => {
  const rolls: string[] = [];
  const marks: string[] = [];
  const reseeds: string[] = [];
  let genRng: unknown = null;          // gen 包装器（RNG 实例）
  let genUr: unknown = null;           // gen 当前 UnifiedRandom（reseed 换实例）
  let inDungeon = false;
  let mc = 0;
  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  g.__swOnRoll = (v: number, inst: object) => {
    if (!inDungeon || inst !== genUr) return;
    mc++;
    if (mc >= W0 && mc <= W1) {
      const stack = new Error().stack ?? '';
      const labs: string[] = [];
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iiiii191bc')) {
          labs.push(`${m[1].replace(/^.*?(src\/)/, '$1').split('/').pop()}:${m[2]}`);
          if (labs.length >= 3) break;
        }
      }
      rolls.push(`${mc}|${v}|${labs.join('>')}`);
    }
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    let lab = '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iiiii191bc')) {
        lab = `${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}|${labelOf(m[1], Number(m[2]))}`;
        break;
      }
    }
    const wasIn = inDungeon;
    oReseed.call(this, s);
    if (inDungeon && this === genRng) {
      genUr = (this as { vanilla?: unknown }).vanilla;   // reseed 换 UnifiedRandom 实例
      reseeds.push(`! RESEED@mc=${mc + 1} ${lab}`);
      mc = 0;                                            // pass 相对口径:reseed 即复位
    }
    if (!wasIn && lab.includes('|Dungeon') && !inDungeon) {
      inDungeon = true;
      genRng = this;
      genUr = (this as { vanilla?: unknown }).vanilla;
      mc = 0;
      reseeds.push(`! DUNGEON-START ${lab}`);
    }
  };
  const h113 = (globalThis as { __swI113?: (l: string) => void }).__swI113;
  (globalThis as { __swI113?: (l: string) => void }).__swI113 = (l: string) => {
    if (inDungeon && (l.startsWith('DR|BC') || l.startsWith('DR|TRP'))) marks.push(`mc=${mc}|${l}`);
    h113?.(l);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: '1.1.1.0.doubledaringdangers|20260831', evil: 0 as -1 | 0 | 1,
      seedFlags: { dualDungeons: true },
    } as Parameters<typeof generateWorld>[0]);
  } finally {
    g.__swOnRoll = undefined;
    RNGp.reseed = oReseed;
    (globalThis as { __swI113?: (l: string) => void }).__swI113 = h113;
  }
  writeFileSync(`${OUT}/js-rolls.txt`, rolls.join('\n') + '\n');
  writeFileSync(`${OUT}/js-marks.txt`, marks.join('\n') + '\n');
  writeFileSync(`${OUT}/js-reseeds.txt`, reseeds.join('\n') + '\n');
  console.log(`[i191] rolls=${rolls.length} marks=${marks.length} reseeds=${reseeds.length}`);
  console.log(reseeds.slice(0, 12).join('\n'));
}, 900_000);
