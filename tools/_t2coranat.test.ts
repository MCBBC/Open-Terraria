// 一次性诊断（t2 2026-09-02）：CorruptionPass 掷数解剖仪（两 flavor）。
// 背景：nba2 bisect 显示槽 #030 e0(corruption)=5,128,077 vs e-1(自然→猩红)=756,506。
// 本仪复跑两 flavor 并用 __swCorMark 时间线把槽内掷数切到段（zone/chasm/sw/convert/
// orbs/crimStart 子段/altars），产出 /tmp/t2-out/js-anat-{cor,crim}.txt。
// 用法：cd game && npx vitest run tools/_t2coranat.test.ts
process.env.SW_MB_1457 = '1';
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { GenProgress } from '../src/world/gen/GenProgress';

const SEED = '9293480';
const W = 4200, H = 1200;

async function runFlavor(evil: -1 | 0 | 1, outPath: string): Promise<void> {
  const g = globalThis as {
    __swOnRoll?: (v: number, inst: object) => void;
    __swCorMark?: (s: string) => void;
  };
  const prevRoll = g.__swOnRoll, prevMark = g.__swCorMark;
  let rollCount = 0;
  const timeline: Array<[string, number]> = [];
  let curPass = '(pre-Reset)';
  const rows: Array<{ pass: string; rolls: number }> = [];
  const bp = GenProgress.prototype as unknown as { beginVan: (name: string) => void };
  const origBegin = bp.beginVan;
  try {
    g.__swOnRoll = () => { rollCount++; };
    g.__swCorMark = (s: string) => { timeline.push([s, rollCount]); };
    bp.beginVan = function (_name: string) {
      rows.push({ pass: curPass, rolls: rollCount });
      curPass = _name;
      rollCount = 0;
    };
    await generateWorld({ width: W, height: H, seedText: SEED, evil });
    rows.push({ pass: curPass, rolls: rollCount });
  } finally {
    bp.beginVan = origBegin;
    g.__swOnRoll = prevRoll;
    g.__swCorMark = prevMark;
  }
  const slot = rows.find((r) => r.pass === 'Corruption');
  const lines = [
    `# flavor evil=${evil}  slot#030 Corruption rolls=${slot?.rolls}`,
    `# timeline (mark, rolls-at-mark):`,
    ...timeline.map(([s, n]) => `${String(n).padStart(9)} ${s}`),
  ];
  writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`[t2anat] evil=${evil} Corruption=${slot?.rolls} marks=${timeline.length} -> ${outPath}`);
}

it('t2 corruption anatomy two flavors', async () => {
  await runFlavor(0, '/tmp/t2-out/js-anat-cor.txt');
  await runFlavor(-1, '/tmp/t2-out/js-anat-crim.txt');
}, 900000);
