// QQQQQQQQ：m 链 store 区域快照（slot60/61 端点）+ 箱事件打印
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_QMMAP === '1';
(RUN ? it : it.skip)('m-chain region map capture', async () => {
  const g = globalThis as Record<string, unknown>;
  const evs: string[] = [];
  g.__swChestEv = (p: string, i: number, j: number, x?: number) => evs.push(`${p} ${i},${j}${p === 'abx' ? '=' + x : ''}`);
  g.__swChestDbg = (i: number, gy: number, why: string) => evs.push(`dbg ${i},${gy} <- ${why}`);
  g.__swChestWrite = (...a: unknown[]) => evs.push(`write ${a.join(',')}`);
  const X0 = 4700, X1 = 4780, Y0 = 700, Y1 = 800;
  let snap60: Uint16Array | null = null, snapA60: Uint8Array | null = null;
  await generateWorld({
    width: 6400, height: 1800, seedText: '20260811',
    evil: 0 as never,
    onWorldPartial: ((w: any, idx: number) => {
      if (idx === 60 || idx === 61) {
        const store = w.store as { type: Uint16Array; flags: Uint8Array };
        const st = store.type;
        const sa = store.flags;
        const out: number[] = [], outa: number[] = [];
        for (let y = Y0; y <= Y1; y++) {
          for (let x = X0; x <= X1; x++) {
            const ii = y * 6400 + x;
            out.push(st[ii]);
            outa.push(sa[ii]);
          }
        }
        const nameT = idx === 60 ? '/tmp/qqqqq2-out/m-typ-snap60.bin' : '/tmp/qqqqq2-out/m-typ-snap61.bin';
        const nameA = idx === 60 ? '/tmp/qqqqq2-out/m-act-snap60.bin' : '/tmp/qqqqq2-out/m-act-snap61.bin';
        writeFileSync(nameT, new Uint16Array(out));
        writeFileSync(nameA, new Uint8Array(outa));
      }
    }) as never,
  } as never);
  console.log(evs.filter((l) => /473[0-9]|474[0-9]|write/.test(l)).join('\n'));
}, 600000);
