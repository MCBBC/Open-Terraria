// IIII225b 取证仪④：全槽掷流账——JS 每 slot 末 rollN ↔ 金标 pc.txt 每 pass R 逐槽对账。
// 用法：cd game && SW_I225BP=1 npx vitest run tools/_iii225b-rolls.test.ts
// 产物：/tmp/iii225b-out/roll-parity.txt
import { it } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';

const RUN = process.env.SW_I225BP === '1';
const OUT = process.env.SW_I225B_OUT ?? '/tmp/iii225b-out';
const G2 = process.env.SW_I225B_G2 ?? `${process.env.HOME}/GoldenChains/golden-gfb-c`;

(RUN ? it : it.skip)('iii225b per-slot roll parity (GFB)', { timeout: 1_200_000 }, async () => {
  // 金标每 pass R
  const goldenR = new Map<number, { name: string; r: number }>();
  for (const line of readFileSync(`${G2}/pc.txt`, 'utf8').split('\n')) {
    const m = /^P\|(\d+)\|([^|]+)\|.*R:(\d+):/.exec(line);
    if (!m) continue;
    const r = Number(m[3]);
    if (r === 0) continue;
    goldenR.set(Number(m[1]), { name: m[2], r });
  }
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const { RNG } = await import('../src/core/rng');
  let rollN = 0;
  // 每 pass 头 reseed 时记录累计掷数（caller=pass wrapper，栈帧取函数名+行号）
  const reseedMarks: Array<{ caller: string; rollN: number }> = [];
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    let caller = '';
    for (const line of stack.split('\n')) {
      if (/src\/world\/gen\//.test(line) && !/core\/rng/.test(line)) {
        const m = /at (\S+) \(([^)]+)\)/.exec(line) ?? /at (src\/\S+)/.exec(line);
        caller = m ? `${m[1]} @${m[2]}` : line.trim();
        break;
      }
    }
    reseedMarks.push({ caller, rollN });
    return oReseed.call(this, s);
  };
  const g = globalThis as Record<string, unknown>;
  const oRoll = g.__swOnRoll as ((v: number) => void) | undefined;
  g.__swOnRoll = (v: number) => { rollN++; oRoll?.(v); };
  const slots: Array<{ name: string; rollN: number }> = [];
  await generateWorld({
    width: 4200, height: 1200, seedText: '9293480', evil: 0 as -1 | 0 | 1,
    seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true },
    onWorldPartial: (_w, _i, name) => { slots.push({ name, rollN }); },
  } as Parameters<typeof generateWorld>[0]);
  g.__swOnRoll = oRoll;
  RNGp.reseed = oReseed;

  // JS 每 pass 掷数 = 两次 reseed 间增量；末尾补最后一 pass（终态 rollN）
  const marks = [...reseedMarks, { caller: 'END', rollN }];
  const lines: string[] = [];
  lines.push(`reseeds=${reseedMarks.length} slots=${slots.length} totalRolls=${rollN}`);
  const jsPasses: Array<{ caller: string; rolls: number }> = [];
  for (let i = 1; i < marks.length; i++) {
    jsPasses.push({ caller: marks[i]!.caller, rolls: marks[i]!.rollN - marks[i - 1]!.rollN });
  }
  const gList = [...goldenR.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  lines.push(`jsPasses=${jsPasses.length} goldenPasses=${gList.length}`);
  lines.push('=== per-pass parity (aligned by order) ===');
  for (let i = 0; i < Math.max(jsPasses.length, gList.length); i++) {
    const js = jsPasses[i];
    const gld = gList[i];
    const d = js && gld ? js.rolls - gld.r : null;
    lines.push(`p${String(i).padStart(2, '0')} js=${js ? String(js.rolls).padStart(9) : '---------'} golden=${gld ? String(gld.r).padStart(9) : '--------'} diff=${d}  [${gld?.name ?? ''}] ${js?.caller.slice(0, 60) ?? ''}`);
  }
  writeFileSync(`${OUT}/roll-parity.txt`, lines.join('\n') + '\n');
});
