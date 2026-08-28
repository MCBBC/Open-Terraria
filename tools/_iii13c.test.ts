// 一次性诊断（III13 批 B 项）：placeSandTrap 门序仪 JS 侧——notraps 链
// （1896728457/EVIL1）全 pass76 窗口记录 sandEv 流到 /tmp/iii13-out/j-sand13.txt，
// 与 x86 rig（SW_SANDLOG=/tmp/iii13-out/x-sand13.txt）按 attempt 序对拍。
// 用法：cd game && npx vitest run tools/_iii13c.test.ts
import { it } from 'vitest';
import { openSync, writeSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

it('iii13c sand gate trace', { timeout: 900_000 }, async () => {
  const OUT = '/tmp/iii13-out';
  const fd = openSync(`${OUT}/j-sand13.txt`, 'w');
  const gv = globalThis as {
    __swSandEv?: (k: string, a: number, b: number, v: number) => void;
    __swTrapHm?: (l: string) => void;
  };
  let n = 0;
  let att = 0;
  gv.__swSandEv = (k, a, b, v) => {
    if (k === 'S0') att++;
    writeSync(fd, `S ${att} ${n++} ${k} ${a} ${b} ${v}\n`);
  };
  const mfd = openSync(`${OUT}/j-sandmarks.txt`, 'w');
  gv.__swTrapHm = (l) => writeSync(mfd, `${l}\n`);
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1896728457',
      evil: 1 as -1 | 0 | 1, seedFlags: { noTraps: true },
      onWorldPartial: () => {},
    });
  } finally {
    delete gv.__swSandEv;
    delete gv.__swTrapHm;
  }
}, 900_000);
