// 三大差异对（51 蛛网/165 洞穴装饰/638 灰烬藤 + 62 丛林藤）JS 逐 pass 边界计数时间线。
// 钩 RNG.prototype.reseed：每个 reseed 事件 = 上一 pass 末态，对目标 sheet 计数
// （全图 + 五带）+ 记录 ▶ 标签；终态再与 /tmp/vserver86/<seed>.wld（x86 基线）同口径对拍。
// 用法：SW_TGT=1 [SW_TGT_SEED=111] [SW_TGT_VWLDPATH=...] npx vitest run tools/_tgt111.test.ts
import { it } from 'vitest';
const RUN = !!process.env.SW_TGT;
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { parseWld } from '../src/wld/WldParser';

const SEED = process.env.SW_TGT_SEED ?? '111';
const W = 4200, H = 1200;
const VWLDP = process.env.SW_TGT_VWLDP ?? `/tmp/vserver86/s${SEED}.wld`;
const SHEETS = (process.env.SW_TGT_SHEETS ?? '51,165,62,638,633').split(',').map(Number);
const WANT = new Set(SHEETS);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
// 带边界：s111 锚 ground=337 rock=457（矩阵 header 同）；hellTop=h-200
const GROUND = Number(process.env.SW_TGT_GROUND ?? 337), ROCK = Number(process.env.SW_TGT_ROCK ?? 457);
const HELL = H - 200;
const bandOf = (y: number): number =>
  y < GROUND - 60 ? 0 : y < ROCK ? 1 : y < ROCK + (HELL - ROCK) / 2 ? 2 : y < HELL ? 3 : 4;
const BANDS = ['sky', 'surf', 'cave', 'deep', 'hell'];

interface Row { label: string; n: number; tot: number[]; byBand: number[][]; act: number }

(RUN ? it : it.skip)(`target-tile timeline seed=${SEED}`, async () => {
  const rows: Row[] = [];
  let store: { type: Uint16Array; flags: Uint8Array; w: number; h: number } | null = null;
  let evN = 0;
  const srcCache = new Map<string, string[]>();
  const labelOf = (stackLine: string): string => {
    const mLoc = /\(.*(src\/[^\s?]+):(\d+):\d+\)/.exec(stackLine);
    if (!mLoc) return '?';
    const rel = mLoc[1].slice(mLoc[1].indexOf('src/'));
    const abs = `/Users/vinlic/Project/GLM/SandboxWorld/game/${rel}`;
    let src = srcCache.get(abs);
    if (!src) { try { src = readFileSync(abs, 'utf8').split('\n'); } catch { src = []; } srcCache.set(abs, src); }
    const ln = +mLoc[2];
    for (let k = ln; k >= Math.max(0, ln - 2); k--) {
      const cm = /\/\/\s*▶([^\s(（]+)/.exec(src[k - 1] ?? '');
      if (cm) return cm[1];
    }
    return `${rel.split('/').pop()}:${ln}`;
  };
  const count = (label: string): void => {
    if (!store) return;
    const tot = new Array(SHEETS.length).fill(0);
    const byBand = SHEETS.map(() => new Array(5).fill(0));
    let act = 0;
    const { type, flags } = store;
    for (let i = 0; i < W * H; i++) {
      if (!(flags[i] & 1)) continue;
      act++;
      const s = SHEET[type[i]];
      if (s >= 0 && WANT.has(s)) {
        const k = SHEETS.indexOf(s);
        tot[k]++;
        byBand[k][bandOf((i / W) | 0)]++;
      }
    }
    rows.push({ label, n: evN, tot, byBand, act });
  };
  const origReseed = RNG.prototype.reseed;
  const onReseed = function (this: RNG, seed: number) {
    origReseed.call(this, seed);
    try {
      const stackLine = (new Error().stack ?? '').split('\n')
        .find((l) => l.includes('/src/') && !l.includes('rng.ts')) ?? '?';
      const isHead = /at\s+(?:async\s+)?(\S+)\s+\(/.exec(stackLine)?.[1]?.includes('generateWorld');
      count(isHead ? `HEAD#${evN}` : labelOf(stackLine));
      evN++;
    } catch { /* probe */ }
  };
  (RNG.prototype as unknown as { reseed: unknown }).reseed = onReseed;
  try {
    const world = await generateWorld({
      size: 0, width: W, height: H, seedText: SEED, evil: 0,
      onWorldPartial: (w) => { store = w.store; },
    } as Parameters<typeof generateWorld>[0]);
    store = world.store;
  } finally {
    (RNG.prototype as unknown as { reseed: unknown }).reseed = origReseed;
  }
  count('FINAL');

  // vanilla 终态同口径
  let van: Row | null = null;
  try {
    const w = parseWld(readFileSync(VWLDP));
    const t = w.tiles;
    const tot = new Array(SHEETS.length).fill(0);
    const byBand = SHEETS.map(() => new Array(5).fill(0));
    for (let i = 0; i < W * H; i++) {
      if (!t.active[i]) continue;
      const s = t.type[i];
      if (WANT.has(s)) { const k = SHEETS.indexOf(s); tot[k]++; byBand[k][bandOf((i / W) | 0)]++; }
    }
    van = { label: 'VANILLA-FINAL', n: -1, tot, byBand, act: -1 };
  } catch (e) { console.log('vanilla parse fail:', String(e).slice(0, 120)); }

  const fmt = (r: Row): string =>
    SHEETS.map((s, k) => `${s}:${String(r.tot[k]).padStart(6)}`).join(' ') +
    `  bands[51]=${r.byBand[0].join('/')} [165]=${r.byBand[1]?.join('/')} [62]=${r.byBand[2]?.join('/')} [638]=${r.byBand[3]?.join('/')}`;
  console.log(`\n==== 目标 sheet 时间线（seed=${SEED}；每行=reseed 事件=上一 pass 末态）====`);
  for (const r of rows) console.log(`${String(r.n).padStart(3)} ${r.label.padEnd(34)} ${fmt(r)}`);
  if (van) console.log(`VANILLA ${van.label.padEnd(30)} ${fmt(van)}`);
  const js = rows[rows.length - 1];
  if (van && js) {
    console.log('\n==== 终态差（JS - VANILLA）====');
    for (let k = 0; k < SHEETS.length; k++) {
      const d = js.tot[k] - van.tot[k];
      const db = van.byBand[k].map((v, b) => js.byBand[k][b] - v);
      console.log(`sheet ${SHEETS[k]}: Δ=${d} (${js.tot[k]} vs ${van.tot[k]})  Δband=${db.map((v, b) => `${BANDS[b]}${v >= 0 ? '+' : ''}${v}`).join(' ')}`);
    }
  }
  try { writeFileSync('/tmp/sw-tgt-timeline.json', JSON.stringify({ rows, van, sheets: SHEETS })); } catch { /* */ }
}, 480000);
