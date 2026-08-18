// CCCC 批·诊断②:#101 全类型对直方图 + golden 侧结构指纹统计(死箱467/镖137/巨石138/
// 薄冰162斑数/营地墙/桃花心木383),判定段流首个分歧点。一次性探针。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';

const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const b8 = (idx: number, e: string) => new Uint8Array(readFileSync(gPath(idx, e)).buffer.slice(0));
const b16 = (idx: number, e: string) => new Uint16Array(readFileSync(gPath(idx, e)).buffer.slice(0));

const itIs = process.env.SW_CCCC === '2';

(itIs ? it : it.skip)('cccc fingerprint', async () => {
  // golden 100 vs golden 101 的 pass 增量指纹(纯 golden 侧,零 JS)
  for (const [a, b, tag] of [[100, 101, 'vanilla delta 100→101'] as [number, number, string]]) {
    const ta = b16(a, 'typ'), aa = b8(a, 'act'), wa = b16(a, 'wal'), tb = b16(b, 'typ'), ab = b8(b, 'act'), wb = b16(b, 'wal');
    const hist = new Map<number, number>();
    const whist = new Map<number, number>();
    const achg = { on: 0, off: 0 };
    for (let i = 0; i < N; i++) {
      if (aa[i] !== ab[i]) { if (ab[i]) achg.on++; else achg.off++; }
      if (aa[i] && ta[i]! !== tb[i]!) hist.set(ta[i]!, (hist.get(ta[i]!) ?? 0) + 1);
      if (wa[i] !== wb[i]) whist.set(wb[i]!, (whist.get(wb[i]!) ?? 0) + 1);
    }
    const top = [...hist.entries()].filter(([, n]) => n > 20).sort((x, y) => y[1] - x[1]).slice(0, 40);
    console.log(`== ${tag}: activeOn=${achg.on} activeOff=${achg.off}`);
    console.log('   typ old→? : ' + top.map(([t, n]) => `${t}×${n}`).join(' '));
    const topw = [...whist.entries()].filter(([, n]) => n > 20).sort((x, y) => y[1] - x[1]).slice(0, 20);
    console.log('   wall→new : ' + topw.map(([t, n]) => `${t}×${n}`).join(' '));
  }

  // JS 侧重放 + 段级 RNG 计数(通过 monkeypatch 捕获各段边界)
  const gt = b16(100, 'typ'), ga = b8(100, 'act'), gw = b16(100, 'wal'), gl = b8(100, 'liq');
  const ghf = b8(100, 'half'), gsl = b8(100, 'slope'), glt = b8(100, 'lty'), gia = b8(100, 'inact');
  const REV = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
  }
  const gsB = JSON.parse(readFileSync(`${BDIR}/s52/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/s52/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${BDIR}/s52/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N), wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire[i] = fw[q + 3]! & 0x1f; }
  const iw = new Uint32Array(readFileSync(`${BDIR}/s52/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  const chests = JSON.parse(readFileSync(`${BDIR}/s52/chests.json`, 'utf8')) as unknown[];

  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = ga[i]!;
    st.flags[i] = act;
    if (act || gt[i]) {
      const sh = gt[i]!;
      let id = ids35.has(i) ? ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) id = REV.get(sh) ?? -1;
      st.type[i] = id < 0 ? 0 : id;
    }
    st.wall[i] = gw[i]!; st.liquid[i] = gl[i]!;
    st.liquidType[i] = gl[i] ? glt[i]! + 1 : 0;
    st.half[i] = ghf[i]!; st.slope[i] = gsl[i]!;
    st.wire[i] = (gia[i]! ? 0x20 : 0) | wire[i];
    st.frameX[i] = fx[i]; st.frameY[i] = fy[i];
  }
  restoreGenSolid(gensolid);
  const gs = structuredClone(gsB) as GenState;
  __setGenStateForProbe(gs);
  const rng = new RNG(SEED);
  let draws = 0;
  const proto = Object.getPrototypeOf(rng) as Record<string, unknown>;
  for (const name of ['next', 'int', 'range', 'nextInt']) {
    const orig = proto[name] as (...a: unknown[]) => unknown;
    if (typeof orig !== 'function') continue;
    (rng as unknown as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
      draws++;
      return orig.apply(this === rng ? rng : this, args);
    };
  }
  // 段边界探针:捕获 addProtectedStructure 调用(剑冢pad10/营地pad4/矿爆pad5/薄冰pad0)
  const structureLog: Array<{ draws: number; rect: { x0: number; y0: number; x1: number; y1: number }; pad: number }> = [];
  const origAdd = gs.addProtectedStructure;
  void origAdd;
  (gs as unknown as Record<string, unknown>).addProtectedStructure = undefined; // 不劫持:GenState 方法可能绑定在模块层
  runMicroBiomesPass(st, rng, gs, chests as never);
  console.log(`\nJS RNG draws total = ${draws}`);
  void structureLog;
  __setGenStateForProbe(null);

  // JS 侧 162 斑 / 营地墙 / 383 统计(增量 vs 基座)
  const tb = b16(101, 'typ');
  let js162 = 0, g162 = 0, js383 = 0, g383 = 0;
  for (let i = 0; i < N; i++) {
    const jSheet = st.flags[i]! & 1 ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    const gSheet = tb[i]!;
    const baseSheet = ga[i]! ? gt[i]! : 0;
    if (jSheet === 162 && baseSheet !== 162) js162++;
    if (gSheet === 162 && baseSheet !== 162) g162++;
    if (jSheet === 383) js383++;
    if (gSheet === 383) g383++;
  }
  console.log(`thin ice 162 new: JS=${js162} golden=${g162}; mahogany 383: JS=${js383} golden=${g383}`);
}, 300_000);
