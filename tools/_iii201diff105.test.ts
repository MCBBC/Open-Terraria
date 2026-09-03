// IIII201: x86 #105 ↔ JS 槽末#58 全通道 cell 级 diff（只列差格）
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

it('iii201 slot58 diff', () => {
  if (process.env.SW_I201_D105 !== '1') return;
  const G = '/Users/vinlic/GoldenChains/golden-waterpark/105_Final_Cleanup';
  const JSD = '/tmp/iii201-out/js-slot58b';
  const W = 4200, H = 1200, N = W * H;
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
  const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
  const gt = le16(`${G}.typ`), ga = readFileSync(`${G}.act`), gliq = readFileSync(`${G}.liq`), glt = readFileSync(`${G}.lty`);
  const jt = new Uint16Array(readFileSync(`${JSD}/base_type.bin`).buffer);
  const jf = new Uint8Array(readFileSync(`${JSD}/base_flags.bin`).buffer);
  const jliq = new Uint8Array(readFileSync(`${JSD}/base_liquid.bin`).buffer);
  const jlt = new Uint8Array(readFileSync(`${JSD}/base_liquidType.bin`).buffer);
  const rows: string[] = [];
  for (let i = 0; i < N; i++) {
    const va = ga[i] !== 0, ja = (jf[i] & 1) !== 0;
    const vt = va ? gt[i] : 0;
    const jti = ja ? (SHEET[jt[i]] >= 0 ? SHEET[jt[i]] : 9999) : 0;
    const vl = gliq[i] > 0 ? glt[i] + 1 : 0, jl = jliq[i] > 0 ? jlt[i] : 0;
    if (va !== ja || vt !== jti || gliq[i] !== jliq[i] || vl !== jl) {
      rows.push(`(${i % W},${(i / W) | 0}) x86 a${va ? 1 : 0} t${vt} l${gliq[i]} y${vl} | js a${ja ? 1 : 0} t${jti} l${jliq[i]} y${jl}`);
    }
  }
  writeFileSync('/tmp/iii201-out/diff105-cells.txt', rows.join('\n'));
  console.log(`[i201d105] diff cells=${rows.length}`);
});

// IIII201 探针：终清理槽内 genSolidType(379) 面板演化
import { describe } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { genSolidType } from '../src/world/gen/vanilla/GenSolid';
import { TILE_BY_KEY } from '../src/data/tiles';
describe.skipIf(process.env.SW_I201_P379 !== '1')('iii201 probe 379 panel', () => {
  it('probe', async () => {
    const bid = TILE_BY_KEY['v_379_bubble'] as number;
    console.log(`[p379] bid=${bid}`);
    const marks: string[] = [];
    let store: unknown = null;
    const cell = (): string => {
      if (!store) return 'nostore';
      const st = store as { type: Uint16Array; idx: (x: number, y: number) => number };
      const t = (x: number, y: number) => st.type[st.idx(x, y)];
      return `820=${t(216, 820)} 821=${t(216, 821)} 314=${t(1849, 314)} 315=${t(1849, 315)} 240=${t(1162, 240)} 516=${t(3065, 516)}`;
    };
    const g = globalThis as { __swFCMark?: (n: string) => void };
    g.__swFCMark = (n) => marks.push(`MK:${n} ${cell()}`);
    await generateWorld({
      width: 4200, height: 1200, seedText: 'waterpark|20260905', evil: 0,
      onWorldPartial: (w, _i, pn) => {
        if (!store) store = (w as { store: unknown }).store;
        if (pn === '断线陷阱清理' || pn === '终清理' || pn === '多格残片清扫') {
          const st2 = (w as { store: { type: Uint16Array; idx: (x: number, y: number) => number } }).store;
          const bubInternal = st2.type[st2.idx(216, 821)];
          marks.push(`PASS:${pn} ${cell()} bid=${bid} bubInternal=${bubInternal} g(bid)=${genSolidType(bid) ? 1 : 0} g(bub)=${genSolidType(bubInternal) ? 1 : 0}`);
        }
      },
    } as never);
    for (const m of marks) console.log(`[p379] ${m}`);
  }, 900_000);
});
