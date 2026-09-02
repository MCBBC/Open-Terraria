// 一次性诊断:#28 HF 分段掷数对拍——IL 相位 FNV(/tmp/sw-uwp/phase.txt)定标原版各环
// 掷数,与 JS runHellFortPass(phaseMark)分段掷数逐环比对,锁定 +25,569 多耗环。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runUnderworldPass } from '../src/world/gen/vanilla/UnderworldPass';
import { runHellFortPass } from '../src/world/gen/vanilla/HellFortPass';
import { UnifiedRandom, RNG } from '../src/core/rng';
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

(RUN ? it : it.skip)('HF phase roll calibration', () => {
  // A) 原版各相位 FNV → 掷数定标(单次推进扫全部目标)
  const targets = new Map<string, number>();
  for (const ln of readFileSync('/tmp/sw-uwp/phase.txt', 'utf8').trim().split('\n')) {
    const [tag, fnv] = ln.split(' ');
    targets.set(fnv, -1);
    (globalThis as Record<string, unknown>)[`tag_${tag}`] = fnv;
  }
  const tagOf = new Map<string, string>([
    [(globalThis as Record<string, string>).tag_torch, 'torch'],
    [(globalThis as Record<string, string>).tag_furn, 'furn'],
    [(globalThis as Record<string, string>).tag_pic, 'pic'],
    [(globalThis as Record<string, string>).tag_banner, 'banner'],
  ]);
  const ur = new UnifiedRandom(9293480);
  const stateHash = (): string => {
    let h = 2166136261 >>> 0;
    const byte = (v: number, s: number) => { h = Math.imul(h ^ ((v >>> s) & 0xff), 16777619) >>> 0; };
    for (let k = 0; k < 56; k++) { const v = ur.seedArray[k]! | 0; byte(v, 0); byte(v, 8); byte(v, 16); byte(v, 24); }
    const ix = ur.inext >>> 0;
    byte(ix, 0); byte(ix, 8); byte(ix, 16); byte(ix, 24);
    return h.toString(16).padStart(8, '0');
  };
  const vanN = new Map<string, number>();
  const seq = ['torch', 'furn', 'pic', 'banner'];
  let found = 0, floorN = 14266081;   // 单调门:必须 > hfentry 且按相位序
  for (let n = 0; n <= 14_600_000 && found < 4; n++) {
    const h = stateHash();
    const tag = tagOf.get(h);
    if (tag && tag === seq[found] && n > floorN) { vanN.set(tag, n); found++; floorN = n; console.log(`VAN ${tag} @${n}`); }
    ur.nextInt(2);
  }
  // B) JS 分段
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
  let draws = 0;
  const o = rng as unknown as Record<string, unknown>;
  for (const m of ['int', 'next', 'nextInt', 'nextIntRange', 'chance', 'pick', 'range'] as const) {
    const orig = (rng[m] as (...a: unknown[]) => unknown).bind(rng);
    o[m] = (...a: unknown[]) => { draws++; return orig(...a); };
  }
  const marks: Array<[string, number]> = [];
  runUnderworldPass(st, rng, rt.gs);
  marks.push(['hfentry', draws]);
  runHellFortPass(st, rng, rt.gs, (name) => marks.push([name, draws]));
  const jsN = new Map(marks);
  // C) 对拍
  const order = ['torch', 'furn', 'pic', 'banner'];
  let prevV = 14266081, prevJ = 14266081;
  console.log('相位     VAN段掷   JS段掷    差');
  for (const t of order) {
    const v = vanN.get(t)!, j = jsN.get(t)!;
    console.log(`${t.padEnd(8)} ${String(v - prevV).padStart(8)} ${String(j - prevJ).padStart(9)} ${String((j - prevJ) - (v - prevV)).padStart(8)}`);
    prevV = v; prevJ = j;
  }
  console.log(`hf尾     ${String(14451380 - prevV).padStart(8)} ${String(draws - prevJ).padStart(9)} ${String((draws - prevJ) - (14451380 - prevV)).padStart(8)}`);
  console.log('HF总: VAN', 14451380 - 14266081, 'JS', draws - 14266081);
}, 480000);
