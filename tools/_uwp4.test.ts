// 一次性诊断:#28 HF(AddHellHouses)分段掷数——QW 真值已证输入/流全等,残余 +25,569
// 掷全部在 HF 内部。对 runHellFortPass 逐相(主环/火把/家具/挂画/旗灯)计掷,
// 定位哪个环多耗。隔离重放构造与 _underiso 相同(dump027+liquidType 真值)。
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
const t27 = RUN ? new Uint16Array(load(27, 'typ', 'Webs').buffer.slice(0)) : new Uint16Array(0);
const a27 = RUN ? load(27, 'act', 'Webs') : Buffer.alloc(0);
const w27 = RUN ? new Uint16Array(load(27, 'wal', 'Webs').buffer.slice(0)) : new Uint16Array(0);
const l27 = RUN ? load(27, 'liq', 'Webs') : Buffer.alloc(0);

const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const LT = RUN ? readFileSync('/tmp/sw-uwp/entry.lty') : Buffer.alloc(0);   // ★套件门(2026-09-02):夹具在 /tmp,RUN=1 才读——防默认 sweep 收集期炸

(RUN ? it : it.skip)('HF per-phase roll counts', () => {
  const rt = runResetAndTerrain({ width: W, height: H, seedText: '9293480', evil: 0 });
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t27[i]) ?? 0;
    st.flags[i] = a27[i] ? 1 : 0;
    st.wall[i] = w27[i];
    st.liquid[i] = l27[i];
    st.liquidType[i] = LT[i] === 1 ? 2 : LT[i] === 0 ? 1 : LT[i];  // 真值 +1 编码
  }
  const rng = new RNG(rt.gs.seed);
  let draws = 0;
  const o = rng as unknown as Record<string, unknown>;
  for (const m of ['int', 'next', 'nextInt', 'nextIntRange', 'chance', 'pick', 'range'] as const) {
    const orig = (rng[m] as (...a: unknown[]) => unknown).bind(rng);
    o[m] = (...a: unknown[]) => { draws++; return orig(...a); };
  }
  runUnderworldPass(st, rng, rt.gs);
  console.log('UW rolls =', draws, '(期望 14266081)');
  const uwEnd = draws;
  runHellFortPass(st, rng, rt.gs);
  console.log('HF rolls =', draws - uwEnd, '(原版 185,299; JS 此前 210,868)');
  // 房簇统计(同 _uwp2)
  const clusters = (getW: (i: number) => number): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    let start = -1;
    for (let x = 0; x <= W; x++) {
      let has = false;
      if (x < W) for (let y = 950; y < 1190; y++) { const wv = getW(y * W + x); if (wv === 13 || wv === 14) { has = true; break; } }
      if (has && start < 0) start = x;
      if (!has && start >= 0) { out.push([start, x - 1]); start = -1; }
    }
    return out;
  };
  console.log('JS房列段数 =', clusters((i) => st.wall[i]!).length);

    const w28 = new Uint16Array(load(28, 'wal', 'Underworld').buffer.slice(0));
    const clusters2 = (getW: (i: number) => number): Array<[number, number]> => {
      const out: Array<[number, number]> = [];
      let start = -1;
      for (let x = 0; x <= W; x++) {
        let has = false;
        if (x < W) for (let y = 950; y < 1190; y++) { const wv = getW(y * W + x); if (wv === 13 || wv === 14) { has = true; break; } }
        if (has && start < 0) start = x;
        if (!has && start >= 0) { out.push([start, x - 1]); start = -1; }
      }
      return out;
    };
    const jc = clusters2((i) => st.wall[i]!);
    const vc = clusters2((i) => w28[i]!);
    console.log('JS房段:', JSON.stringify(jc));
    console.log('VAN房段:', JSON.stringify(vc));
    let m = 0;
    for (const [a, b] of jc) if (vc.some(([c, d]) => Math.abs(a - c) <= 2 && Math.abs(b - d) <= 2)) m++;
    console.log(`段匹配: ${m}/${jc.length}`);

}, 480000);
