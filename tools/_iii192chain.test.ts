// IIIII192 一次性诊断：全链真链语境挂 __swI113 DR 钩（无 _iii179gc 复跑管线重放污染），
//   取真链 DR|S / DR|FEAT / EAR| 行——与 x86 rig mark.log 直对拍。
// 用法：cd game && SW_I192CHAIN=1 SW_I179=1 SW_I192CHAIN_OUT=/tmp/iii192-out \
//        SW_MB_1457=1 npx vitest run tools/_iii192chain.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I192CHAIN === '1';
const OUT = process.env.SW_I192CHAIN_OUT ?? '/tmp/iii192-out';

(RUN ? it : it.skip)('i192 full-chain DR capture', { timeout: 900_000 }, async () => {
  const g = globalThis as { __swI113?: (line: string) => void; __swOnRoll?: (v: number, inst: object) => void; __swRollN?: number; __swRollTotal?: number };
  const rows: string[] = [];
  g.__swI113 = (line: string) => { rows.push(`${line}|jmr=${g.__swRollN ?? -1}|jrc=${g.__swRollTotal ?? -1}`); };
  let rollN = 0, rollAll = 0, mainInst: object | undefined;
  g.__swOnRoll = (_v, inst) => {
    rollAll++;
    g.__swRollTotal = rollAll;
    if (mainInst === undefined) mainInst = inst;
    else if (inst !== mainInst) return;
    rollN++;
    g.__swRollN = rollN;
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1.1.1.0.doubledaringdangers|20260831', evil: -1 as -1 | 0 | 1,
      seedFlags: { dualDungeons: true },
      // ★IIIII192：x86 JJHook.RollCount 在 pass 边界重置——蛇槽末=Dungeon pass 起点，
      //   此处清零计数器使 DR| 行 jrc 与 x86 mark.log 的 rc 同口径直对拍。
      onWorldPartial: (_w: unknown, _i: number, pn: string) => {
        if (pn === 'Dual_Dungeons_Dither_Snake') { rollN = 0; rollAll = 0; mainInst = undefined; }
      },
    } as Parameters<typeof generateWorld>[0]);
  } finally {
    delete g.__swI113;
    delete g.__swOnRoll;
  }
  writeFileSync(`${OUT}/js-chain-dr.txt`, rows.join('\n') + '\n');
  console.log(`[i192chain] dr rows=${rows.length} -> ${OUT}/js-chain-dr.txt`);
});
