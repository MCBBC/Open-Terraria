// 一次性诊断:#28 挂画/旗帜/吊灯/灯笼放置对拍——JS vs dump28 全地狱带。
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

const REV = new Map<number, number>();
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (!REV.has(s)) REV.set(s, i); }
}
const LT = RUN ? readFileSync('/tmp/sw-uwp/entry.lty') : Buffer.alloc(0);   // ★套件门(2026-09-02):夹具在 /tmp,RUN=1 才读——防默认 sweep 收集期炸

(RUN ? it : it.skip)('wall hanger diff', () => {
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
  const fam = new Set([34, 42, 91, 240, 241, 242, 245, 246]);
  const byType = new Map<string, number[]>();
  for (let y = 1000; y < 1190; y++) {
    for (let x = 1000; x < 3200; x++) {
      const i = y * W + x;
      const jt = st.flags[i] ? SHEET[st.type[i]] : -1;
      const vt = a28[i] ? t28[i] : -1;
      const jf = jt >= 0 && fam.has(jt), vf = vt >= 0 && fam.has(vt);
      if (jf !== vf || (jf && jt !== vt)) {
        const k = `js${jf ? jt : '-'}>van${vf ? vt : '-'}`;
        if (!byType.has(k)) byType.set(k, []);
        byType.get(k)!.push(`(${x},${y})`);
      }
    }
  }
  for (const [k, v] of byType) console.log(`${k} ×${v.length}: ${v.slice(0, 12).join(' ')}`);
}, 480000);
