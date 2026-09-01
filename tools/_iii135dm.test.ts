// IIII104b（2026-09-01）DeadMansChestBiome 门级实验台——只读，不改生产态。
// base=SW_I121CAP 捕获的「▶微群系头」金态（自检 dAct/dTyp/dWal=0 属 _iii121mb 责任）。
// 用法：cd game && npx vitest run tools/_iii135dm.test.ts
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import {
  DeadMansChestBiome,
  countWires,
} from '../src/world/gen/vanilla/MicroBiomesPass';
import { NOT_CLEARABLE } from '../src/world/gen/vanilla/TileRunner';

const BASE = process.env.SW_I135_BASE ?? '/tmp/iii133-out/js';

const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[i] = s;
}

interface ChestLike { x: number; y: number; items: unknown[] }
function hydrate(): { st: TileStore; chests: Array<ChestLike | null> } {
  const hdr = JSON.parse(readFileSync(`${BASE}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType',
    'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${BASE}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const chests = JSON.parse(readFileSync(`${BASE}/base_chests.json`, 'utf8')) as Array<ChestLike | null>;
  return { st, chests };
}

it('III135 DMC gate audit', () => {
  const t0 = Date.now();
  const { st, chests } = hydrate();
  console.log(`[hydrate] w=${st.w} h=${st.h} sinkLen=${chests.length}`);

  // ---------- 关键坐标现场 ----------
  const sites: Array<[number, number]> = [
    [3839, 800], [2113, 677], [852, 950], [699, 729], [4112, 615],
    [4123, 702], [2749, 907], [1797, 827], [855, 950], [3361, 882],
    [347, 556], [3941, 599], [275, 825], [112, 674],
  ];
  for (const [x, y] of sites) {
    const i = st.idx(x, y);
    const j2 = st.idx(x, y + 2);
    let wires = 0;
    for (let dx = -20; dx <= 20; dx++) {
      for (let dy = -20; dy <= 20; dy++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= st.w || yy >= st.h) continue;
        const b = st.wire[st.idx(xx, yy)] & 15;
        wires += (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1) + ((b >> 3) & 1);
      }
    }
    console.log(
      `site(${x},${y}) act=${st.flags[i]} sheet=${SHEET_OF[st.type[i]]}`
      + ` fx=${st.frameX[i]} fy=${st.frameY[i]} style=${st.flags[i] ? Math.trunc(st.frameX[i] / 36) : -1}`
      + ` cw(20)=${wires} below2.sheet=${SHEET_OF[st.type[j2]]} below2.clearable=${NOT_CLEARABLE.has(st.type[j2]) === false}`,
    );
  }

  // 容器锚点全景：sheet21 anchors（style=1, 左上角 fy=0）
  const anchorSet = new Set<string>();
  let face21 = 0;
  for (let y = 0; y < st.h; y++) {
    for (let x = 0; x < st.w; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      if (SHEET_OF[st.type[i]] !== 21) continue;
      face21++;
      if (st.frameX[i] % 36 === 0 && Math.trunc(st.frameX[i] / 36) === 1 && st.frameY[i] === 0) anchorSet.add(`${x},${y}`);
    }
  }
  const sinkAnchors = new Set(chests.filter(Boolean).map(c => `${c!.x},${c!.y}`));
  const tileOnlySinkMissing = [...anchorSet].filter(k => !sinkAnchors.has(k));
  const sinkOnlyTileMissing = [...sinkAnchors].filter(k => !anchorSet.has(k));
  console.log(`sheet21 faces=${face21} anchors=${anchorSet.size} sinkEntries=${chests.filter(Boolean).length}`);
  console.log(`tile-anchor-without-sink: ${tileOnlySinkMissing.length}`);
  for (const k of tileOnlySinkMissing.slice(0, 40)) console.log('  MISS-SINK', k);
  console.log(`sink-entry-without-tile-anchor: ${sinkOnlyTileMissing.length}`);
  for (const k of sinkOnlyTileMissing.slice(0, 40)) console.log('  MISS-TILE', k);

  // ---------- 生产类在金态上的逐门审计（prototype 包装追踪）----------
  const gsSnap = JSON.parse(readFileSync(`${BASE}/base_gs.json`, 'utf8')) as unknown as GenState;
  const rng = new RNG(Number((gsSnap as unknown as { seed: number }).seed));
  const dm: unknown = new DeadMansChestBiome(st, rng, gsSnap,
    chests as unknown as Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> } | undefined>);

  // 追踪挂点：isAGoodSpot / clearCaches / findBoulderTrapSpots / findDartTrapSpots
  //            areThereEnoughTraps / canPlaceStructure 调用（后者无法 hook 模块函数,
  //            用 boulders/darts/wires 内容兜底还原）
  type CB = (r: boolean, ...a: number[]) => string;
  const audit: string[] = [];
  let curChest = '';
  // 掷序镜像：包装本次枚举期间的 RNG（类持引用的原对象）
  const draws: string[] = [];
  {
    const RP = Object.getPrototypeOf(rng) as unknown as Record<string, (...a: number[]) => unknown>;
    const oi = RP['int'];
    RP['int'] = function (this: unknown, a: number, b: number) {
      const v = (oi as (a: number, b: number) => unknown).call(this, a, b);
      draws.push(`${curChest} int(${a},${b})=${v}`);
      return v;
    };
    void RP;
  }
  {
    const P = DeadMansChestBiome.prototype as unknown as Record<string, (...a: never[]) => unknown>;
    const patch = (name: string, cb?: CB) => {
      const orig = P[name];
      if (!orig || (orig as unknown as { __i135?: boolean }).__i135) return;
      Object.defineProperty(P, name, {
        value: function (this: unknown, ...args: never[]) {
          const r = orig.apply(this, args);
          if (cb) {
            const line = cb(r as boolean, ...(args as unknown as number[]));
            if (line) audit.push(line);
          }
          return r;
        },
        writable: true, configurable: true,
      });
      (orig as unknown as { __i135?: boolean }).__i135 = true;
    };
    // 每 entr y 循环入口对应 getPossibleChests 内部——用 isAGoodSpot 当锚记当前箱位
    patch('isAGoodSpot', (_r, x, y) => {
      curChest = `${x},${y}`;
      return `GOOD ${curChest} v=${_r}`;
    });
    patch('clearCaches', () => null);
    patch('findBoulderTrapSpots', (r, px, py) => {
      const self = dm as { boulders: unknown[] };
      return `FB @${px},${py} -> n=${self.boulders.length} r=${String(r)}`;
    });
    patch('findDartTrapSpots', (r, px, py) => {
      const self = dm as { darts: unknown[] };
      return `FD @${px},${py} -> n=${self.darts.length}`;
    });
    patch('areThereEnoughTraps', (r) => {
      const self = dm as { boulders: unknown[]; darts: unknown[] };
      return `EN @${curChest} b=${self.boulders.length} d=${self.darts.length} -> ${r}`;
    });
  }
  const possible = (dm as unknown as { getPossibleChests(): Array<{ x: number; y: number }> }).getPossibleChests();
  console.log(`prod-getPossibleChests -> ${possible.length}: ${possible.map(p => `[${p.x},${p.y}]`).join(' ')}`);
  console.log(`audit rows=${audit.length}`);
  writeAudit(audit);
  writeDraws(draws);
  console.log(`done in ${Date.now() - t0}ms`);
}, 900_000);

function writeDraws(draws: string[]): void {
  const fsMod = require('node:fs') as typeof import('node:fs');
  fsMod.writeFileSync('/tmp/iii135-out/dm-draws.txt', draws.join('\n') + '\n');
  console.log(`draw rows=${draws.length}`);
  for (const d of draws.filter(l => l.startsWith('2113,677 ') || l.startsWith('1983,859 ') || l.startsWith('3941,599 '))) console.log('DRAW', d);
}

function writeAudit(rows: string[]): void {
  // 仅打印与关注位点相关的行,全量进文件
  const watch = new Set(['3839,800', '2113,677', '852,950', '699,729', '4112,615',
    '4123,702', '2749,907', '1797,827', '855,950', '3361,882', '347,556']);
  const fsMod = require('node:fs') as typeof import('node:fs');
  fsMod.writeFileSync('/tmp/iii135-out/dm-audit.txt', rows.join('\n') + '\n');
  let last = '';
  for (const l of rows) {
    if (l.startsWith('GOOD')) last = l.split(' ')[1];
    if (l === '' || !watch.has(last)) continue;
    console.log(l);
  }
}

void countWires;
