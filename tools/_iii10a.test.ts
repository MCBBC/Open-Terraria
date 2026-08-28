// 一次性诊断（III10 批 2026-08-28）：notraps 链 #76 Traps 槽取证仪。
// ①trapEv 全事件流按【组】分桶写盘（seq 由行号承担,字段 kind|a|b|v|ln —— 与
//   x86 rig /tmp/iii5-out/x-traptrace-nt3.txt 同名同位可离线对拍）；
// ②槽末#31（Traps 出口）8+2 通道 dump 到 /tmp/iii10-out/jslot31；
// 用法：cd game && SW_MB_1457=1 SW_III10=1 npx vitest run tools/_iii10a.test.ts
import { it } from 'vitest';
import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

it('III10 probes', { timeout: 900_000 }, async () => {
  const OUT = '/tmp/iii10-out';
  mkdirSync(OUT, { recursive: true });
  const gv = globalThis as {
    __swOnRoll?: (v: number, inst: object) => void;
    __swTrapEv?: (k: string, a: number, b: number, v: number) => void;
    __swTrapHm?: (l: string) => void;
  };
  let cnt = 0;
  let fnv = 2166136261 >>> 0;
  const buf: string[] = [];
  const closeAfter: number[] = [];
  // __swRollN：TrapsPass 内部 ptr 计数读取点（属性直读），用 getter 绑定本探针计数
  Object.defineProperty(globalThis, '__swRollN', { get: () => cnt, configurable: true });
  let evN = 0;
  const fd = openSync(`${OUT}/j10-groupevents.txt`, 'w');
  const mfd = openSync(`${OUT}/j10-marks.txt`, 'w');
  const flush = () => {
    if (!buf.length) return;
    writeSync(fd, buf.join('\n') + '\n');
    buf.length = 0;
  };
  if (process.env.SW_III10_KLOG) {
    (globalThis as unknown as { __swIII10Klog: unknown }).__swIII10Klog = 1;
    (globalThis as unknown as { __swIII10Wins: string }).__swIII10Wins = process.env.SW_III10_WINS ?? '[]';
    const kfd = openSync(`${OUT}/j10-klog.txt`, 'w');
    (globalThis as unknown as { __swIII10Ev: (s: string) => void }).__swIII10Ev = (txt: string) => {
      writeSync(kfd, `${cnt} ${txt}\n`);
    };
    closeAfter.push(kfd);
  }
  gv.__swOnRoll = (v: number) => { cnt++; };
  gv.__swTrapEv = (k: string, a: number, b: number, v: number) => {
    const s = `${k}|${a}|${b}|${v}|ln${cnt}`;
    const h = s;
    for (let i = 0; i < h.length; i++) { fnv ^= h.charCodeAt(i); fnv = Math.imul(fnv, 16777619) >>> 0; }
    fnv ^= 10; fnv = Math.imul(fnv, 16777619) >>> 0;   // \n 分隔
    buf.push(s);
    evN++;
    if (buf.length >= 8192) flush();
  };
  gv.__swTrapHm = (l: string) => {
    flush();
    writeSync(mfd, `${l} ln=${cnt} evhash=${fnv} n=${evN}\n`);
    fnv = 2166136261 >>> 0;                            // 组重置
    evN = 0;
  };

  await generateWorld({
    width: Number(process.env.SW_III10_W ?? 4200), height: 1200,
    seedText: process.env.SW_III10_SEED ?? '1896728457',
    evil: Number(process.env.SW_III10_EVIL ?? 1) as -1 | 0 | 1,
    seedFlags: { noTraps: true },
    onWorldPartial: (w, _i, pn) => {
      if (pn !== '地表装饰') return;
      const st = w.store as never as Record<string, ArrayBufferView>;
      mkdirSync(`${OUT}/jslot31`, { recursive: true });
      for (const chn of ['type', 'flags', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'frameX', 'frameY'] as const) {
        const arr = st[chn]!;
        writeSync(openSync(`${OUT}/jslot31/${chn}`, 'w'), Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
      }
    },
  });
  for (const k of closeAfter) closeSync(k);
  closeSync(fd); closeSync(mfd);
}, 900_000);
