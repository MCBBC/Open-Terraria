// IIII208 批一次性取证仪（源=_iii191win 范式克隆改锚）：GFB #73/#76/#77 定域。
// 三个掷流窗口（各 pass 全部体掷）：
//   win73: '地狱熔炉'槽末后首个 reseed 开 → '表面'槽末闭   （pass 73 SpreadingGrass）
//   win76: '倒木水景'槽末后首个 reseed 开 → '地表装饰'槽末闭（pass 76 Traps）
//   win77: '地表装饰'槽末后首个 reseed 开 → '矿骨堆'槽末闭  （pass 77 Piles）
// 另：各槽末读 JS store (1149..1159, 835..845) 邻域 sheet/act/slope/half/inact(active)
// 与 mile8 首差格探针 → js-cells.txt。
// 用法：cd game && SW_I208WIN=1 SW_I208_OUT=/tmp/iii208-out npx vitest run tools/_iii208win.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I208WIN === '1';
const OUT = process.env.SW_I208_OUT ?? '/tmp/iii208-out';
const SEED = process.env.SW_I208_SEED ?? '9293480';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface StoreView {
  idx(x: number, y: number): number;
  type: Uint8Array; flags: Uint8Array; slope: Uint8Array; half: Uint8Array; wire: Uint8Array;
}
interface WorldView { store: StoreView }

(RUN ? it : it.skip)('iii208 gfb win73/76/77 roll windows + cell probes', { timeout: 1_800_000 }, async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const oRoll = g.__swOnRoll as ((v: number, inst?: object) => void) | undefined;

  mkdirSync(OUT, { recursive: true });
  const wins: Record<string, { vals: number[]; open: boolean; pending: boolean; closed: boolean; rsSite: string }> = {
    win73: { vals: [], open: false, pending: false, closed: false, rsSite: '' },
    win76: { vals: [], open: false, pending: false, closed: false, rsSite: '' },
    win77: { vals: [], open: false, pending: false, closed: false, rsSite: '' },
  };
  const OPEN_AFTER: Record<string, string> = { 地狱熔炉: 'win73', 倒木水景: 'win76', 地表装饰: 'win77' };
  const CLOSE_AT: Record<string, string> = { 表面: 'win73', 地表装饰: 'win76', 矿骨堆: 'win77' };

  let gln = 0;
  const reseeds: string[] = [];
  const reseedSite = (): string => {
    const st = (new Error().stack ?? '').split('\n');
    for (const line of st) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii208')) {
        return `${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`;
      }
    }
    return '?';
  };
  RNGp.reseed = function (this: unknown, s: number) {
    const site = reseedSite();
    for (const key of Object.values(OPEN_AFTER)) {
      const w = wins[key]!;
      if (w.pending && !w.open) {
        w.open = true; w.pending = false;
        w.vals = [-1];
        w.rsSite = site;
        console.log(`[I208] ${key} opened at reseed ${site} gln=${gln}`);
      }
    }
    reseeds.push(`RS#${reseeds.length} gln=${gln} site=${site}`);
    return oReseed.call(this, s);
  };
  g.__swOnRoll = (v: number, inst?: object) => {
    gln++;
    for (const w of Object.values(wins)) {
      if (w.open && !w.closed) w.vals.push(v);
    }
    oRoll?.(v, inst);
  };

  let worldRef: WorldView | null = null;
  const dumpLines: string[] = [];
  const cellDump = (w: WorldView | null, tag: string): string => {
    if (!w) return `${tag}: (no world)`;
    const st = w.store;
    const lines: string[] = [`${tag} (sheet/act/slope/half/inact(active)):`];
    for (let y = 835; y <= 845; y++) {
      const row: string[] = [];
      for (let x = 1149; x <= 1159; x++) {
        const i = st.idx(x, y);
        row.push(`${SHEET[st.type[i]]}/${(st.wire[i] >> 4) & 1}/${st.slope[i]}/${st.half[i]}/${(st.wire[i] >> 5) & 1}(${st.flags[i] & 1})`);
      }
      lines.push(`y=${y}: ${row.join(' ')}`);
    }
    const probe = (x: number, y: number): string => {
      const i = st.idx(x, y);
      return `(${x},${y}) sh=${SHEET[st.type[i]]} act=${(st.wire[i] >> 4) & 1} sl=${st.slope[i]} hf=${st.half[i]} inact=${(st.wire[i] >> 5) & 1} active=${st.flags[i] & 1}`;
    };
    lines.push(probe(324, 545), probe(325, 545), probe(324, 546), probe(325, 546));
    lines.push(probe(978, 413), probe(979, 412), probe(3230, 238), probe(3642, 263), probe(2350, 249));
    return lines.join('\n');
  };

  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: 0 as -1 | 0 | 1,
      seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true },
      onWorldPartial: (w2, _i, name) => {
        worldRef = w2 as unknown as WorldView;
        const ow = OPEN_AFTER[name];
        if (ow && !wins[ow]!.pending && !wins[ow]!.open) wins[ow]!.pending = true;
        const cw = CLOSE_AT[name];
        if (cw && wins[cw]!.open && !wins[cw]!.closed) {
          wins[cw]!.closed = true;
          console.log(`[I208] ${cw} closed after slot '${name}' len=${wins[cw]!.vals.length - 1} gln=${gln}`);
        }
        if (name === '表面' || name === '地表装饰' || name === '矿骨堆') {
          dumpLines.push(cellDump(worldRef, `== after slot ${name} ==`));
        }
      },
    });
  } finally {
    writeFileSync(`${OUT}/js-win73.txt`, wins.win73!.vals.map((v) => (v < 0 ? `---RESEED73 ${wins.win73!.rsSite}` : String(v >>> 0))).join('\n') + '\n');
    writeFileSync(`${OUT}/js-win76.txt`, wins.win76!.vals.map((v) => (v < 0 ? `---RESEED76 ${wins.win76!.rsSite}` : String(v >>> 0))).join('\n') + '\n');
    writeFileSync(`${OUT}/js-win77.txt`, wins.win77!.vals.map((v) => (v < 0 ? `---RESEED77 ${wins.win77!.rsSite}` : String(v >>> 0))).join('\n') + '\n');
    writeFileSync(`${OUT}/js-cells.txt`, dumpLines.join('\n') + '\n');
    writeFileSync(`${OUT}/js-reseeds208.txt`, reseeds.join('\n') + '\n');
    RNGp.reseed = oReseed;
    g.__swOnRoll = oRoll;
  }
});
