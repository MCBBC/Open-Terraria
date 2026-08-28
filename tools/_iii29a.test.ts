// IIIII29 批一次性探针：FinishNotTheBees 细分相锚对拍数据采集（j 侧）。
// 与 x86 rig（SW_NTBTAG/SW_NTBTAGVAL）同位打点：NCALL/FNTBIN/MSC/RGC/RGR/RE/
// ODI/OCELL…/ODO2/FNTBOUT + 分支标(KT1/P24/KT2/P201/LARV/TREE/PL3)。
// 输出：/tmp/iii29-out/j-tag.txt（事件流，rc=JS 全程样本序）+
//       /tmp/iii29-out/j-val.txt（FNTBIN..FNTBOUT 窗内逐样本值，流式写盘）。
// 用法：cd game && SW_III29=1 npx vitest run tools/_iii29a.test.ts
import { it } from 'vitest';
import { createWriteStream } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_III29 === '1';
const OUT = process.env.SW_III29_OUT ?? '/tmp/iii29-out';

(RUN ? it : it.skip)('iiii29 fntb tag capture', async () => {
  const g = globalThis as {
    __swOnRoll?: (v: number, inst: object) => void;
    __swFCMark?: (t: string, a?: number, b?: number) => void;
  };
  const tagWs = createWriteStream(`${OUT}/j-tag.txt`, { flags: 'w' });
  const valWs = createWriteStream(`${OUT}/j-val.txt`, { flags: 'w' });
  let rc = 0;
  let nMarks = 0;
  let valWin = false;
  g.__swOnRoll = (v: number) => {
    rc++;
    if (valWin) valWs.write(String(v) + '\n');
  };
  g.__swFCMark = (t: string, a?: number, b?: number) => {
    tagWs.write(`${t}|${a ?? 0}|${b ?? 0}|rc=${rc}\n`);
    nMarks++;
    if (t === 'FNTBIN') valWin = true;
    else if (t === 'FNTBOUT') valWin = false;
  };
  const t0 = Date.now();
  await generateWorld({
    width: 4200, height: 1200, seedText: '1372357239', evil: -1,
    seedFlags: { notTheBees: true },
  });
  console.log(`marks=${nMarks} rc_end=${rc} time=${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await new Promise<void>((res) => tagWs.end(() => res()));
  await new Promise<void>((res) => valWs.end(() => res()));
}, 900_000);
