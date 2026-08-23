// 一次性诊断（ZZZZZZ 批）：NOTRAPS #59 首差区 (2522,356) 反事实——JS BuriedChests
// 窗口末态（▶SurfaceChests reseed 时点,store 引用即活体）vs x86 dump 058/059。用毕即删。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_Z1 === '1';
const D = '/tmp/sw-slp/g-secret-notraps/';
const W = 4200, H = 1200;
const X0 = Number(process.env.SW_Z1_X0 ?? 2505), X1 = Number(process.env.SW_Z1_X1 ?? 2550);
const Y0 = Number(process.env.SW_Z1_Y0 ?? 348), Y1 = Number(process.env.SW_Z1_Y1 ?? 372);
const SEED = process.env.SW_Z1_SEED ?? '1896728457';
const FLAGS = (process.env.SW_Z1_FLAGS ?? 'noTraps').split(',').filter(Boolean);
const EVIL = Number(process.env.SW_Z1_EVIL ?? 1);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const sh = TILE_DEFS[i]?.vanilla?.sheet; if (typeof sh === 'number') SHEET[i] = sh; }
const jSheet = (t: number) => (SHEET[t]! >= 0 ? SHEET[t]! : 9999);
const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const u8 = (p: string) => new Uint8Array(readFileSync(p), 0);
interface Snap { t: Uint16Array; act: Uint8Array; w: Uint16Array; l: Uint8Array; lt: Uint8Array }
function loadVan(tag: number): Snap {
  const nm = readdirSync(D).find(f => f.startsWith(String(tag).padStart(3, '0') + '_') && f.endsWith('.typ'))!;
  const base = `${D}${nm.replace('.typ', '')}`;
  return { t: le16(base + '.typ'), act: u8(base + '.act'), w: le16(base + '.wal'), l: u8(base + '.liq'), lt: u8(base + '.lty') };
}
function print(tag: string, s: Snap) {
  console.log(`--- ${tag} ---`);
  for (let y = Y0; y <= Y1; y++) {
    let line = '';
    for (let x = X0; x <= X1; x++) {
      const i = y * W + x;
      if (s.act[i]! & 1) line += s.t[i]!.toString(16).padStart(2, '0') + ' ';
      else if (s.l[i]! > 0) line += (s.l[i] === 255 ? 'WW' : s.l[i]!.toString(16).padStart(2, '0').toUpperCase()) + ' ';
      else line += s.w[i]! > 0 ? '__ ' : '.. ';
    }
    console.log(String(y).padStart(4), line);
  }
}
function snapStore(st: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array }): Snap {
  const act = new Uint8Array(st.flags.length);
  const t = new Uint16Array(st.type.length);
  const lt = new Uint8Array(st.liquidType.length);
  for (let i = 0; i < st.flags.length; i++) {
    act[i] = st.flags[i]! & 1;
    t[i] = st.flags[i]! & 1 ? jSheet(st.type[i]!) : 0;
    lt[i] = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;   // JS 1 基保持（vanilla 侧 +1 对齐在 diff 处做）
  }
  return { t, act, w: st.wall.slice(), l: st.liquid.slice(), lt };
}
function diffMap(a: Snap, b: Snap, tag: string) {
  console.log(`--- diff ${tag} (v=first, j=second; T/W/L/*) ---`);
  for (let y = Y0; y <= Y1; y++) {
    let line = '';
    let any = false;
    for (let x = X0; x <= X1; x++) {
      const i = y * W + x;
      const ta = a.act[i]! ? a.t[i]! : 0, tb = b.act[i]! ? b.t[i]! : 0;
      const dT = ta !== tb, dW = a.w[i]! !== b.w[i]!, dL = a.l[i]! !== b.l[i]! || ((a.l[i]! > 0 ? a.lt[i]! + 1 : 0) !== (b.l[i]! > 0 ? b.lt[i]! : 0));
      if (dT || dW || dL) any = true;
      const n = (dT ? 1 : 0) + (dW ? 1 : 0) + (dL ? 1 : 0);
      line += n === 0 ? '. ' : n > 1 ? '* ' : dT ? 'T ' : dW ? 'W ' : 'L ';
    }
    if (any) console.log(String(y).padStart(4), line);
  }
}

(RUN ? it : it.skip)('zzzzzz region probe', async () => {
  const van58 = loadVan(58), van59 = loadVan(59);
  let store: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array } | null = null;
  let snapped: Snap | null = null;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const seedFlags: Record<string, boolean> = {};
  for (const f of FLAGS) seedFlags[f] = true;
  RNGp.reseed = function (this: unknown, s: number) {
    if (store && !snapped) {
      const stack = new Error().stack ?? '';
      const m = stack.match(/WorldGen\.ts:(\d+):\d+/);
      if (m && Number(m[1]) >= 978 && Number(m[1]) <= 980) { // ▶SurfaceChests reseed
        snapped = snapStore(store);
        console.log(`[probe] snapped at WorldGen.ts:${m[1]}`);
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(seedFlags).length ? seedFlags : undefined,
      onWorldPartial: (w) => { if (!store) store = w.store as never; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!snapped) { console.log('[probe] never snapped (reseed line drift?)'); return; }
  print('vanilla 058 (input)', van58);
  print('vanilla 059 (after window)', van59);
  print('JS @▶SurfaceChests', snapped);
  diffMap(van59, snapped, 'van059 vs JS');
}, 600_000);
