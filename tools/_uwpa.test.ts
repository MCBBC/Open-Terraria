// 一次性诊断:#28 残余吊灯差(1203-1205,1067-69)现场——JS vs dump28 双图逐格。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runUnderworldPass } from '../src/world/gen/vanilla/UnderworldPass';
import { runHellFortPass, setHfTrace } from '../src/world/gen/vanilla/HellFortPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200;
const load = (idx: number, ext: string, name: string) =>
  readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${name}.${ext}`);
const t27 = new Uint16Array(load(27, 'typ', 'Webs').buffer.slice(0));
const a27 = load(27, 'act', 'Webs');
const w27 = new Uint16Array(load(27, 'wal', 'Webs').buffer.slice(0));
const l27 = load(27, 'liq', 'Webs');
const t28 = new Uint16Array(load(28, 'typ', 'Underworld').buffer.slice(0));
const a28 = load(28, 'act', 'Underworld');
const w28 = new Uint16Array(load(28, 'wal', 'Underworld').buffer.slice(0));

const REV = new Map<number, number>();
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (!REV.has(s)) REV.set(s, i); }
}
const LT = readFileSync('/tmp/sw-uwp/entry.lty');

(RUN ? it : it.skip)('chandelier residue site', () => {
  const rt = runResetAndTerrain({ width: W, height: H, seedText: '9293480', evil: 0 });
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t27[i]) ?? 0;
    st.flags[i] = a27[i] ? 1 : 0;
    st.wall[i] = w27[i];
    st.liquid[i] = l27[i];
    st.liquidType[i] = LT[i] === 1 ? 2 : LT[i] === 0 ? 1 : LT[i];
  }
  const rng = new RNG(rt.gs.seed);
  const trace: string[] = [];
  setHfTrace((s) => { if (s.startsWith('T#-') || s.startsWith('P#')) trace.push(s); });
  runUnderworldPass(st, rng, rt.gs);
  trace.length = 0;
  runHellFortPass(st, rng, rt.gs);
  setHfTrace(null);
  console.log('pic/banner 轮:', trace.join(' | '));
  const rows: string[] = [];
  for (let y = 1055; y <= 1080; y++) {
    let js = '', van = '';
    for (let x = 1195; x <= 1215; x++) {
      const i = y * W + x;
      const jt = SHEET[st.type[i]] === -1 ? 30583 : SHEET[st.type[i]];
      js += st.flags[i] ? (jt === 75 ? 'B' : jt === 34 ? 'C' : jt === 42 ? 'L' : jt === 91 ? 'N' : String(jt % 10)) : (st.wall[i] === 14 ? '#' : '.');
      van += a28[i] ? (t28[i] === 75 ? 'B' : t28[i] === 34 ? 'C' : t28[i] === 42 ? 'L' : t28[i] === 91 ? 'N' : String(t28[i] % 10)) : (w28[i] === 14 ? '#' : '.');
    }
    rows.push(`${y} J ${js}  V ${van}`);
  }
  console.log(rows.join('\n'));
}, 480000);
