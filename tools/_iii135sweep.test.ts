// IIII104b：boulder/dart 扫描骰域全枚举——判别「谓词 bug vs 骰相位」。
// 对给定锚点用脚本化 RNG 全扫 (num,num2)∈[2..4]² 与 (numDart,dartDir)，报告
// 各组合下 boulders/darts 计数。
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { DeadMansChestBiome } from '../src/world/gen/vanilla/MicroBiomesPass';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const BASE = process.env.SW_I135_BASE ?? '/tmp/iii133-out/js';

function hydrate(): { st: TileStore; chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> } | null> } {
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
  const gsSnap = JSON.parse(readFileSync(`${BASE}/base_gs.json`, 'utf8')) as unknown as GenState;
  return { st, chests: JSON.parse(readFileSync(`${BASE}/base_chests.json`, 'utf8')), _gs: gsSnap } as never;
}

it('III135 dice sweep', () => {
  const h = hydrate() as unknown as {
    st: TileStore;
    chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> } | null>;
    _gs: GenState;
  };
  const st = h.st;
  const SITES: Array<[number, number]> = process.env.SW_I135_SITES
    ? (JSON.parse(process.env.SW_I135_SITES) as Array<[number, number]>)
    : [[1983, 859], [2113, 677], [852, 950], [699, 729], [4112, 615]];

  class ScriptRNG {
    seq: number[] = [];
    pos = 0;
    constructor(seq: number[]) { this.seq = seq; this.pos = 0; }
    int(_a: number, _b: number): number { return this.seq[this.pos++] ?? 0; }
    next(): number { return 0; }
  }

  for (const [ox, oy] of SITES) {
    console.log(`=== site ${ox},${oy} ===`);
    let everBoulder = false, everDart = false;
    for (let num = 2; num <= 4; num++) {
      for (let num2 = 2; num2 <= 4; num2++) {
        const rngS = new ScriptRNG([num, num2]);
        const dm: unknown = new DeadMansChestBiome(st, rngS as never,
          JSON.parse(readFileSync(`${BASE}/base_gs.json`, 'utf8')) as GenState, []);
        const self = dm as {
          clearCaches(): void; findBoulderTrapSpots(x: number, y: number): void;
          boulders: Array<unknown>; darts: Array<unknown>;
          findDartTrapSpots(x: number, y: number): void;
        };
        self.clearCaches();
        self.findBoulderTrapSpots(ox, oy + 1);
        if (self.boulders.length > 0) {
          everBoulder = true;
          const spots = self.boulders.map((b) => JSON.stringify(b)).join(' ');
          console.log(`  B hit num=${num} num2=${num2} -> ${self.boulders.length}: ${spots}`);
        }
      }
    }
    // darts 独立扫
    for (let nd = 3; nd <= 6; nd++) {
      for (const dir of [0, 1]) {
        const rngS = new ScriptRNG([nd, dir === 0 ? 0 : 1]);
        const dm: unknown = new DeadMansChestBiome(st, rngS as never,
          JSON.parse(readFileSync(`${BASE}/base_gs.json`, 'utf8')) as GenState, []);
        const self = dm as { clearCaches(): void; findDartTrapSpots(x: number, y: number): void; darts: Array<unknown> };
        self.clearCaches();
        self.findDartTrapSpots(ox, oy + 1);
        if (self.darts.length > 0) everDart = true;
        if (dir === 1 || self.darts.length > 0) {
          console.log(`  D nd=${nd} dir=${dir} -> ${self.darts.length}`);
        }
      }
    }
    console.log(`site ${ox},${oy}: any-boulder=${everBoulder} any-dart=${everDart}`);
  }
}, 600_000);

void RNG;
