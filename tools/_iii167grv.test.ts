// IIII167 批 graveyard #59 房屋域探针：在「雕像宝箱」合并槽内的 reseed 锚点
// （WorldGen.ts:1465 前=dump58 态 / :1480 前=dump59 态）抓 JS 全通道快照落盘，
// 与 x86 golden-grvfix 058/059 做写面对拍。零行为改动（只包 reseed 写盘）。
// 用法：SW_I167_GRV=1 npx vitest run tools/_iii167grv.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I167_GRV === '1';
const G2D = process.env.SW_I167_G2 ?? '/Users/vinlic/GoldenChains/golden-grvfix';
const SEED = process.env.SW_I167_SEED ?? 'nightofthelivingdead|20260903';
const EVIL = Number(process.env.SW_I167_EVIL ?? 0);
const OUTD = process.env.SW_I167_OUT ?? '/tmp/iii167-out/jsdump-grv';
const W = Number(process.env.SW_I167_W ?? 4200), H = Number(process.env.SW_I167_H ?? 1200);

const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I167_FLAGS ?? '').split(',').filter(Boolean)) {
  M8_FLAGS[f] = true;
}
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const DUMPNAME = new Map<number, string>();
// 锚点：reseed 调用行 → dump 序号（state=上一 pass 末态）
const ANCHOR_LINE_D = new Map<number, number>([[1465, 58], [1480, 59]]);

(RUN ? it : it.skip)('III167 grvfix house-segment snapshot', async () => {
  mkdirSync(OUTD, { recursive: true });
  for (const f of readdirSync(G2D)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  let curStore: Parameters<typeof dump>[1] | null = null;
  const seen = new Set<number>();
  RNGp.reseed = function (this: unknown, s: number) {
    if (curStore) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/src\/world\/gen\/WorldGen\.ts:(\d+):\d+/);
        if (m) {
          const d = ANCHOR_LINE_D.get(Number(m[1]));
          if (d !== undefined && !seen.has(d)) {
            seen.add(d);
            const nm = DUMPNAME.get(d) ?? String(d);
            dump(curStore!, d, nm);
            console.log(`  dumped anchor d=${d} ${nm}`);
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  class AbortOK extends Error {}
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
      onWorldPartial: (w, i, _pn) => {
        curStore = w.store as never as typeof curStore;
        if (seen.size >= 2) throw new AbortOK('anchors-done');
        if (i > 20) throw new AbortOK(`overshot-slot-${i}`);
      },
    });
  } catch (e) {
    if (!(e instanceof AbortOK)) throw e;
  }
  RNGp.reseed = oReseed;
  console.log(`  anchors captured: ${[...seen].join(',')}`);
}, 900_000);

function dump(st: {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
}, idx: number, nm: string): void {
  const N = st.type.length;
  const pre = `${OUTD}/${String(idx).padStart(3, '0')}_${nm}`;
  const typ = new Uint16Array(N);
  for (let i = 0; i < N; i++) {
    const ja = st.flags[i]! & 1;
    typ[i] = ja
      ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999)
      : (st.type[i]! === 0 ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999));
  }
  const lt = new Uint8Array(N);
  for (let i = 0; i < N; i++) lt[i] = st.liquidType[i]! > 0 ? st.liquidType[i]! - 1 : 0;
  writeFileSync(`${pre}.typ`, Buffer.from(typ.buffer));
  writeFileSync(`${pre}.act`, Buffer.from(st.flags.slice()));
  writeFileSync(`${pre}.wal`, Buffer.from(st.wall.buffer, st.wall.byteOffset, st.wall.byteLength));
  writeFileSync(`${pre}.liq`, Buffer.from(st.liquid.slice()));
  writeFileSync(`${pre}.lty`, Buffer.from(lt));
  writeFileSync(`${pre}.half`, Buffer.from(st.half.slice()));
  writeFileSync(`${pre}.slope`, Buffer.from(st.slope.slice()));
  const ia = new Uint8Array(N);
  for (let i = 0; i < N; i++) ia[i] = (st.wire[i]! >>> 5) & 1;
  writeFileSync(`${pre}.inact`, Buffer.from(ia));
  console.log(`  wrote ${pre}`);
}
