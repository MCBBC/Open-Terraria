// 一次性诊断:#28 房1-3内容全等校验+房4现场——truth 导入隔离态,输出 JS vs dump28
// 在房1-3(x1040-1240)与房4区(x1290-1430)的 wall/act 差格明细。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runUnderworldPass } from '../src/world/gen/vanilla/UnderworldPass';
import { runHellFortPass } from '../src/world/gen/vanilla/HellFortPass';
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
const l28 = load(28, 'liq', 'Underworld');

const REV = new Map<number, number>();
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (!REV.has(s)) REV.set(s, i); }
}
const LT = RUN ? readFileSync('/tmp/sw-uwp/entry.lty') : Buffer.alloc(0);   // ★套件门(2026-09-02):夹具在 /tmp,RUN=1 才读——防默认 sweep 收集期炸

(RUN ? it : it.skip)('house content equality h1-3 + h4 site', () => {
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
  runUnderworldPass(st, rng, rt.gs);
  runHellFortPass(st, rng, rt.gs);
  const zones: Array<[string, number, number]> = [['房1-3', 1040, 1240], ['房4区', 1290, 1430]];
  for (const [name, x0, x1] of zones) {
    let dw = 0, da = 0, dt = 0, dl = 0;
    const ex: string[] = [];
    for (let y = 950; y < 1190; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (st.wall[i] !== w28[i]) { dw++; if (ex.length < 5) ex.push(`(${x},${y})W${st.wall[i]}>${w28[i]}`); }
        if ((st.flags[i] !== 0) !== (a28[i] !== 0)) { da++; if (ex.length < 10) ex.push(`(${x},${y})a${st.flags[i] ? 1 : 0}>${a28[i]}`); }
        if (st.liquid[i] !== l28[i]) dl++;
        const js = SHEET[st.type[i]] === -1 ? 30583 : SHEET[st.type[i]];
        if ((st.flags[i] !== 0) === (a28[i] !== 0) && js !== t28[i]) { dt++; if (ex.length < 14) ex.push(`(${x},${y})t${js}(id${st.type[i]})>${t28[i]}`); }
      }
    }
    console.log(`${name}[x${x0}-${x1}]: wal差=${dw} act差=${da} typ差=${dt} liq差=${dl}`);
    if (da > 0) {
      const aex2: string[] = [];
      for (let y = 950; y < 1190; y++) for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if ((st.flags[i] !== 0) !== (a28[i] !== 0) && aex2.length < 60)
          aex2.push(`(${x},${y})${st.flags[i] ? `t${SHEET[st.type[i]]}` : '-'}>${a28[i] ? `t${t28[i]}` : '-'}`);
      }
      console.log('  act差明细(前60):', aex2.join(' '));
    }
    if (name === '房1-3') {
      const wex: string[] = [];
      for (let y = 950; y < 1190; y++) for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (st.wall[i] !== w28[i]) wex.push(`(${x},${y})${st.wall[i]}>${w28[i]}`);
      }
      console.log('  全部墙差:', wex.join(' '));
      // act 差也全列(前 40)
      const aex: string[] = [];
      for (let y = 950; y < 1190; y++) for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if ((st.flags[i] !== 0) !== (a28[i] !== 0) && aex.length < 40) aex.push(`(${x},${y})${st.flags[i] ? 1 : 0}>${a28[i]}`);
      }
      console.log('  act差(前40):', aex.join(' '));
    }
  }
}, 480000);
