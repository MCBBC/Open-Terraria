// IIII196 批一次性取证仪③：代表格 ±8 邻域双面 ASCII（x86 dump 033 ↔ JS js33-post）。
// 用法：cd game && SW_I196NB2=1 SW_I196_CELLS="637,336;3647,336;804,756;2765,400;871,892;1378,440;975,746;1371,395" npx vitest run tools/_iii196nb2.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I196NB2 === '1';
const G2 = process.env.SW_I196_G2 ?? `${process.env.HOME}/GoldenChains/golden-ddual2`;
const JS = process.env.SW_I196_JS ?? '/tmp/iii196-out/js33-post';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const CELLS = (process.env.SW_I196_CELLS ?? '').split(';').filter(Boolean).map((s) => s.split(',').map(Number));
const HALF = Number(process.env.SW_I196_HALF ?? 8);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const r8 = (p: string) => new Uint8Array(readFileSync(p).buffer, readFileSync(p).byteOffset, readFileSync(p).byteLength);
const r16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };

(RUN ? it : it.skip)('iii196 neighborhoods', () => {
  const pre = `${G2}/033_Dungeon`;
  const g = { t: r16(`${pre}.typ`), a: r8(`${pre}.act`), w: r16(`${pre}.wal`), l: r8(`${pre}.liq`), lt: r8(`${pre}.lty`) };
  const j = { f: r8(`${JS}/flags.bin`), t: r16(`${JS}/type.bin`), w: r16(`${JS}/wall.bin`), l: r8(`${JS}/liquid.bin`), lt: r8(`${JS}/liquidType.bin`), frx: r16(`${JS}/frameX.bin`), fry: r16(`${JS}/frameY.bin`) };
  const sym = (sheet: number): string => {
    if (sheet === 0) return '.';
    if (sheet >= 10) return String.fromCharCode(65 + (sheet % 26));
    return String(sheet);
  };
  const cellStr = (side: typeof g | typeof j, x: number, y: number): string => {
    const i = y * W + x;
    const a = (side === g) ? g.a[i]! : (j.f[i]! & 1);
    const tRaw = (side === g) ? g.t[i]! : j.t[i]!;
    const t = a ? ((side === g) ? tRaw : (SHEET[tRaw] >= 0 ? SHEET[tRaw]! : 9999)) : (side === g ? tRaw : (SHEET[tRaw] >= 0 ? SHEET[tRaw]! : 9999));
    const w = (side === g) ? g.w[i]! : j.w[i]!;
    const l = (side === g) ? g.l[i]! : j.l[i]!;
    const lt = (side === g) ? g.lt[i]! : j.lt[i]!;
    return `${a?'#':' '}${sym(t)}${w > 0 ? String.fromCharCode(97 + (w % 26)) : ' '}`;
  };
  for (const [cx, cy] of CELLS) {
    console.log(`\n===== (${cx},${cy}) =====`);
    console.log('y\\x   ' + Array.from({ length: HALF * 2 + 1 }, (_, k) => String(cx - HALF + k).padEnd(4).slice(0, 4)).join(''));
    for (let y = cy - 3; y <= cy + 3; y++) {
      if (y < 0 || y >= H) continue;
      let gr = '', jr = '';
      for (let x = cx - HALF; x <= cx + HALF; x++) {
        gr += (x < 0 || x >= W) ? '   ' : cellStr(g, x, y);
        jr += (x < 0 || x >= W) ? '   ' : cellStr(j, x, y);
      }
      console.log(`g${y} ${gr}`);
      console.log(`j${y} ${jr}`);
    }
    // 图例
    const legend = new Map<string, string>();
    for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - HALF; x <= cx + HALF; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const i = y * W + x;
      legend.set(`g ${sym(g.a[i]! ? g.t[i]! : g.t[i]!)}`, `vanilla=${g.t[i]}${g.a[i] ? '' : '(ghost)'}`);
      legend.set(`j ${sym(SHEET[j.t[i]!] >= 0 ? SHEET[j.t[i]!]! : 9999)}`, `js=${j.t[i]}→sheet${SHEET[j.t[i]!]}${(j.f[i]! & 1) ? '' : '(ghost)'}`);
    }
    // 关键格 8ch
    for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 3; x <= cx + 3; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const i = y * W + x;
      const ga = g.a[i]!, ja = j.f[i]! & 1;
      if (ga !== ja || (ga ? g.t[i]! : 0) !== (ja ? (SHEET[j.t[i]!] >= 0 ? SHEET[j.t[i]!]! : 9999) : 0) || g.w[i]! !== j.w[i]! || g.l[i]! !== j.l[i]!) {
        console.log(`DIFF (${x},${y}) gold{a${ga} t${g.t[i]} w${g.w[i]} l${g.l[i]} y${g.lt[i]}} js{a${ja} t${j.t[i]}(s${SHEET[j.t[i]!]}) w${j.w[i]} l${j.l[i]} frx${j.frx[i]} fry${j.fry[i]}}`);
      }
    }
  }
});
