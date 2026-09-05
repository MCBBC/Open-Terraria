// ★IIIII210 一次性仪③：#106 Final_Cleanup 尾态对拍（0..105 全绿后的新前沿）
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I210FC === '1';
const OUT = process.env.SW_I210_OUT ?? '/tmp/iii210-out';
const G2 = process.env.SW_I210_G2 ?? `${process.env.HOME}/GoldenChains/golden-ddual2`;
const W = 4200, H = 1200, N = W * H;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = (TILE_DEFS[i] as { vanilla?: { sheet?: number } } | undefined)?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
(RUN ? it : it.skip)('iii210 final cleanup endstate', async () => {
  let st: import('../src/world/TileStore').TileStore | null = null;
  try {
    await generateWorld({
      width: W, height: H,
      seedText: '1.1.1.0.doubledaringdangers|20260831',
      evil: 0 as -1 | 0 | 1,
      onWorldPartial: (w, _i, name) => { if (name === '终清理') st = w.store; },
    } as Parameters<typeof generateWorld>[0]);
  } finally { /* keep */ }
  if (!st) throw new Error('终清理 end never hit');
  const s = st!;
  mkdirSync(`${OUT}/slot106end`, { recursive: true });
  const typ = Buffer.alloc(N * 2), act = Buffer.alloc(N), liq = Buffer.alloc(N), lt = Buffer.alloc(N), ia = Buffer.alloc(N), wal = Buffer.alloc(N * 2), wire = Buffer.alloc(N);
  for (let q = 0; q < N; q++) {
    typ[q * 2] = SHEET[s.type[q]]! & 0xff; typ[q * 2 + 1] = (SHEET[s.type[q]]! >> 8) & 0xff;
    act[q] = s.flags[q]! & 1; liq[q] = s.liquid[q]!;
    lt[q] = s.liquidType[q] === 0 ? 0 : s.liquidType[q]! - 1;
    ia[q] = (s.wire[q]! >>> 5) & 1; wal[q * 2] = s.wall[q]! & 0xff; wal[q * 2 + 1] = (s.wall[q]! >> 8) & 0xff;
    wire[q] = s.wire[q]!;
  }
  writeFileSync(`${OUT}/slot106end/end.typ`, typ); writeFileSync(`${OUT}/slot106end/end.act`, act);
  writeFileSync(`${OUT}/slot106end/end.liq`, liq); writeFileSync(`${OUT}/slot106end/end.lty`, lt);
  writeFileSync(`${OUT}/slot106end/end.inact`, ia); writeFileSync(`${OUT}/slot106end/end.wal`, wal);
  writeFileSync(`${OUT}/slot106end/end.wire`, wire);
  const gt = le16(`${G2}/106_Final_Cleanup.typ`); const ga = readFileSync(`${G2}/106_Final_Cleanup.act`);
  const gl = readFileSync(`${G2}/106_Final_Cleanup.liq`); const gLt = readFileSync(`${G2}/106_Final_Cleanup.lty`);
  const gw = le16(`${G2}/106_Final_Cleanup.wal`);
  let dT = 0, dL = 0, dLt = 0, dW = 0;
  const cells: Array<[number, number, string]> = [];
  for (let i = 0; i < N; i++) {
    const jt = act[i] ? (SHEET[s.type[i]]! >= 0 ? SHEET[s.type[i]]! : 9999) : 0;
    const gt2 = ga[i] ? gt[i]! : 0;
    const jlt = liq[i]! > 0 ? lt[i]! : 0; const glt = gl[i]! > 0 ? gLt[i]! : 0;
    if (gt2 !== jt) { dT++; if (cells.length < 4000) cells.push([i % W, (i / W) | 0, `T${gt2}>${jt} a${ga[i]}${act[i]} L${gl[i]}>${liq[i]} W${gw[i]}>${s.wall[i]!} ia${(s.wire[i]! >>> 5) & 1}`]); }
    if (gl[i]! !== liq[i]) dL++;
    if (glt !== jlt) dLt++;
    if (gw[i]! !== s.wall[i]) dW++;
  }
  console.log(`[end vs #106] dT=${dT} dL=${dL} dLt=${dLt} dW=${dW}`);
  for (const c of cells.slice(0, 30)) console.log(`  (${c[0]},${c[1]}) ${c[2]}`);
}, 600_000);
