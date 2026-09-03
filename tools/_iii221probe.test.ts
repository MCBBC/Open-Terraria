// IIII221 批取证仪①（源=_iii212probe 范式克隆改锚）：graveyard #76 Traps 残差逐事件对拍 JS 侧。
// ①win76 掷流窗（Traps pass 全窗）②placeTrap 全事件流 ③两处巨石残差位点 (755,485)/(387,686)
//   邻域槽末快照（倒木水景 75 / 地表装饰 76 / 矿骨堆 77）。
// 用法：cd game && SW_I221=1 npx vitest run tools/_iii221probe.test.ts
// ★血统：graveyard 链 rig 必带 SW_FLAG_GRV 臂（i200 教训）；JS 侧旗=graveyardBloodmoonStart 直注。
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

const RUN = process.env.SW_I221 === '1';
const OUT = process.env.SW_I221_OUT ?? '/tmp/iii221-out';
const SEED = process.env.SW_I221_SEED ?? 'nightofthelivingdead|20260903';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface StoreView {
  idx(x: number, y: number): number;
  type: Uint16Array; flags: Uint8Array; slope: Uint8Array; half: Uint8Array; wire: Uint8Array;
  wall: Uint16Array;
}
interface WorldView { store: StoreView }

const REGIONS: Array<[string, number, number, number, number]> = [
  ['grvSite1', 743, 787, 463, 511],   // 残差 (755,485) 2×2 x86=716(pet)/js=664(bouncy)
  ['grvSite2', 375, 419, 664, 712],   // 残差 (387,686) 2×2 x86=138/js=716(pet)
];

(RUN ? it : it.skip)('iii221 grv events + regions + win76', { timeout: 1_800_000 }, async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const oRoll = g.__swOnRoll as ((v: number, inst?: object) => void) | undefined;

  mkdirSync(OUT, { recursive: true });
  const wins: Record<string, { vals: number[]; open: boolean; pending: boolean; closed: boolean; rsSite: string }> = {
    win76: { vals: [], open: false, pending: false, closed: false, rsSite: '' },
  };
  const OPEN_AFTER: Record<string, string> = { 倒木水景: 'win76' };
  const CLOSE_AT: Record<string, string> = { 地表装饰: 'win76' };

  let gln = 0;
  const reseeds: string[] = [];
  const reseedSite = (): string => {
    const st = (new Error().stack ?? '').split('\n');
    for (const line of st) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii221')) {
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
        console.log(`[I221] ${key} opened at reseed ${site} gln=${gln}`);
      }
    }
    reseeds.push(`RS#${reseeds.length} gln=${gln} site=${site}`);
    return oReseed.call(this, s);
  };
  g.__swOnRoll = (v: number, inst?: object) => {
    gln++;
    (g as { __swRollN?: number }).__swRollN = gln;
    for (const w of Object.values(wins)) {
      if (w.open && !w.closed) w.vals.push(v);
    }
    oRoll?.(v, inst);
  };

  const evLines: string[] = [];
  let stage = 'pre';
  (g as { __swTrapHm?: unknown }).__swTrapHm = (l: string) => {
    stage = l;
    evLines.push(`HM ${l}`);
  };
  (g as { __swTrapEv?: unknown }).__swTrapEv = (kind: string, a: number, b: number, v: number) => {
    if (evLines.length < 2_000_000) evLines.push(`TRP[${stage}] ${kind} ${a} ${b} ${v} @${(g as { __swRollN?: number }).__swRollN ?? -1}`);
  };

  let worldRef: WorldView | null = null;
  const dumpLines: string[] = [];
  const regionDump = (st: StoreView, tag: string): string => {
    const lines: string[] = [`== ${tag} ==`];
    for (const [name, x0, x1, y0, y1] of REGIONS) {
      lines.push(`-- ${name} (${x0}..${x1},${y0}..${y1}) t/a/slope/half/wall/wire --`);
      for (let y = y0; y <= y1; y++) {
        const row: string[] = [];
        for (let x = x0; x <= x1; x++) {
          const i = st.idx(x, y);
          row.push(`${SHEET[st.type[i]]}/${st.flags[i] & 1}/${st.slope[i]}/${st.half[i]}/${st.wall[i]}/${st.wire[i]}`);
        }
        lines.push(`y=${y}: ${row.join(' ')}`);
      }
    }
    return lines.join('\n');
  };

  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: 0 as -1 | 0 | 1,
      seedFlags: { graveyardBloodmoonStart: true },
      onWorldPartial: (w2, _i, name) => {
        worldRef = w2 as unknown as WorldView;
        const ow = OPEN_AFTER[name];
        if (ow && !wins[ow]!.pending && !wins[ow]!.open) wins[ow]!.pending = true;
        const cw = CLOSE_AT[name];
        if (cw && wins[cw]!.open && !wins[cw]!.closed) {
          wins[cw]!.closed = true;
          console.log(`[I221] ${cw} closed after slot '${name}' len=${wins[cw]!.vals.length - 1} gln=${gln}`);
        }
        if (name === '倒木水景' || name === '地表装饰' || name === '矿骨堆') {
          dumpLines.push(regionDump(worldRef!.store, `after slot ${name}`));
        }
      },
    });
  } finally {
    writeFileSync(`${OUT}/js-win76.txt`, wins.win76!.vals.map((v) => (v < 0 ? `---RESEED76 ${wins.win76!.rsSite}` : String(v >>> 0))).join('\n') + '\n');
    writeFileSync(`${OUT}/js-ev221.txt`, evLines.join('\n') + '\n');
    writeFileSync(`${OUT}/js-regions221.txt`, dumpLines.join('\n') + '\n');
    writeFileSync(`${OUT}/js-reseeds221.txt`, reseeds.join('\n') + '\n');
    RNGp.reseed = oReseed;
    g.__swOnRoll = oRoll;
    (g as { __swTrapHm?: unknown }).__swTrapHm = undefined;
    (g as { __swTrapEv?: unknown }).__swTrapEv = undefined;
    void gln;
    void TileStore;
  }
});
