// 一次性诊断:#28 HF 房1/房3 现场 ASCII 图——JS vs dump28 wall/act 双图对读,
// 反推原版房矩形(colL/colR/rowT/rowB/occ)与门洞/平台口写位。配合 HellFortPass
// 的 __hfTrace 钩(房五元组+四环写点逐条)。
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
const t27 = RUN ? new Uint16Array(load(27, 'typ', 'Webs').buffer.slice(0)) : new Uint16Array(0);
const a27 = RUN ? load(27, 'act', 'Webs') : Buffer.alloc(0);
const w27 = RUN ? new Uint16Array(load(27, 'wal', 'Webs').buffer.slice(0)) : new Uint16Array(0);
const l27 = RUN ? load(27, 'liq', 'Webs') : Buffer.alloc(0);
const t28 = RUN ? new Uint16Array(load(28, 'typ', 'Underworld').buffer.slice(0)) : new Uint16Array(0);
const a28 = RUN ? load(28, 'act', 'Underworld') : Buffer.alloc(0);
const w28 = RUN ? new Uint16Array(load(28, 'wal', 'Underworld').buffer.slice(0)) : new Uint16Array(0);
const l28 = RUN ? load(28, 'liq', 'Underworld') : Buffer.alloc(0);

const REV = new Map<number, number>();
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (!REV.has(s)) REV.set(s, i); }
}
const LT = RUN ? readFileSync('/tmp/sw-uwp/entry.lty') : Buffer.alloc(0);   // ★套件门(2026-09-02):夹具在 /tmp,RUN=1 才读——防默认 sweep 收集期炸

type Grid = { act: Uint8Array; wal: Uint16Array; typ: Uint16Array; liq: Uint8Array };
const vanG: Grid = { act: a28, wal: w28, typ: t28, liq: l28 };

function render(g: Grid, x0: number, x1: number, y0: number, y1: number, label: string): string {
  const lines: string[] = [`${label} (x${x0}-${x1}, . 空 # 墙 B 砖 p 平台 T 火把 ~ 液 f 家具) 数值墙印于#后`];
  for (let y = y0; y <= y1; y++) {
    let row = '';
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (g.act[i]) {
        const t = g.typ[i];
        row += t === 75 || t === 76 ? 'B' : t === 19 ? 'p' : t === 4 ? 'T' : 'f';
      } else if (g.wal[i] === 13 || g.wal[i] === 14) row += '#';
      else if (g.liq[i] > 0) row += '~';
      else row += '.';
    }
    lines.push(`${String(y).padStart(5)} ${row}`);
  }
  return lines.join('\n');
}

(RUN ? it : it.skip)('tower 1/3 ascii maps + trace', () => {
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
  let dn = 0;
  const drawLog: string[] = [];
  const o = rng as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const m of ['int', 'nextInt', 'nextIntRange'] as const) {
    const orig = (rng[m] as (...a: unknown[]) => unknown).bind(rng);
    o[m] = (...a: unknown[]) => {
      const v = orig(...a);
      drawLog.push(`D${dn} ${m}(${a.join(',')})=${v}`);
      dn++;
      return v;
    };
  }
  setHfTrace((s) => { if (trace.length < 400) trace.push(s); });
  runUnderworldPass(st, rng, rt.gs);
  trace.length = 0;              // 只留 HF 段
  const dStart = dn;
  runHellFortPass(st, rng, rt.gs);
  setHfTrace(null);
  // T#0 段的逐骰日志(到 T#1 trace 行为止)
  const t1At = drawLog.length;
  console.log('T#0 draws:', drawLog.slice(dStart, dStart + 130).join(' | '));
  console.log('T#1 draws:', drawLog.slice(dStart + 130, dStart + 260).join(' | '));
  const jsG: Grid = {
    act: new Uint8Array(W * H), wal: new Uint16Array(W * H),
    typ: new Uint16Array(W * H), liq: new Uint8Array(W * H),
  };
  for (let i = 0; i < W * H; i++) {
    jsG.act[i] = st.flags[i] ? 1 : 0;
    jsG.wal[i] = st.wall[i]!;
    jsG.typ[i] = SHEET[st.type[i]] === -1 ? 30583 : SHEET[st.type[i]];
    jsG.liq[i] = st.liquid[i]!;
  }
  // 房1 簇(x1046-1065)与房3 簇(x1182-1211)
  console.log(render(vanG, 1040, 1075, 1055, 1130, 'VAN 房1'));
  console.log(render(jsG, 1040, 1075, 1055, 1130, 'JS  房1'));
  console.log(trace.filter((s) => s.startsWith('T#0 ') || s.startsWith('T#1 ')).join('\n'));
  console.log(render(vanG, 1175, 1215, 1055, 1115, 'VAN 房3'));
  console.log(render(jsG, 1175, 1215, 1055, 1115, 'JS  房3'));
  console.log(trace.filter((s) => s.startsWith('T#3 ') || s.startsWith('T#4 ')).join('\n'));
}, 480000);
