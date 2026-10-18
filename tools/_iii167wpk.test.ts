// IIII167 批一次性探针：waterpark #53 Smooth_World S/Hf 18k 差离线取证 —— 克隆 _iii66 范式
// （IIII66 批同 #53 家族先例）。按 _mile8 口径跑 waterpark 管线，把槽末 #12(052 Shell
// Piles 输入)/#13(053 Smooth World 输出) 的 8 通道 JS 侧 dump 落盘 /tmp/iii167-out/jsdump/。
// 行为零改动：只加写盘。
// 用法：
//   SW_III167=1 npx vitest run tools/_iii167wpk.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_III167 === '1';
const G2D = process.env.SW_III167_G2 ?? `${process.env.HOME ?? ''}/GoldenChains/golden-waterpark`;
const SEED = process.env.SW_III167_SEED ?? 'waterpark|20260905';
const EVIL = Number(process.env.SW_III167_EVIL ?? 0);
const OUTD = process.env.SW_III167_OUT ?? '/tmp/iii167-out/jsdump';
const W = Number(process.env.SW_III167_W ?? 4200), H = Number(process.env.SW_III167_H ?? 1200);
const N = W * H;
const ABORT_SLOT = Number(process.env.SW_III167_ABORT_SLOT ?? 13);

const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_III167_FLAGS ?? '').split(',').filter(Boolean)) {
  M8_FLAGS[f] = true;
}

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const SLOT_END = new Map<number, { d: number; nm: string }>([
  [12, { d: 52, nm: 'Shell_Piles' }], [13, { d: 53, nm: 'Smooth_World' }],
]);

const DUMPNAME = new Map<number, string>();

(RUN ? it : it.skip)('III167 waterpark jsdump capture', async () => {
  mkdirSync(OUTD, { recursive: true });
  DUMPNAME.clear();
  for (const f of readdirSync(G2D)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  let curStore: Parameters<typeof dump>[1] | null = null;
  class AbortOK extends Error {}
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
      onWorldPartial: (w, i, pn) => {
        curStore = w.store as never as typeof curStore;
        const ent = SLOT_END.get(i);
        if (ent === undefined) return;
        dump(curStore!, ent.d, ent.nm);
        console.log(`  dumped slot ${i} d=${ent.d} ${pn}`);
        if (i === ABORT_SLOT) throw new AbortOK(`abort-at-slot${i}`);
      },
    });
  } catch (e) {
    if (!(e instanceof AbortOK)) throw e;
    console.log(`  early abort OK @slot${ABORT_SLOT}`);
  }
}, 900_000);

function dump(st: {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
}, idx: number, nameHint: string): void {
  const nm = DUMPNAME.get(idx) ?? nameHint;
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
  writeFileSync(`${pre}.rawtyp`, Buffer.from(st.type.buffer, st.type.byteOffset, st.type.byteLength));
  writeFileSync(`${pre}.act`, Buffer.from(st.flags.slice()));
  writeFileSync(`${pre}.wal`, Buffer.from(st.wall.buffer, st.wall.byteOffset, st.wall.byteLength));
  writeFileSync(`${pre}.liq`, Buffer.from(st.liquid.slice()));
  writeFileSync(`${pre}.half`, Buffer.from(st.half.slice()));
  writeFileSync(`${pre}.slope`, Buffer.from(st.slope.slice()));
  writeFileSync(`${pre}.lty`, Buffer.from(lt));
  const ia = new Uint8Array(N);
  for (let i = 0; i < N; i++) ia[i] = (st.wire[i]! >>> 5) & 1;
  writeFileSync(`${pre}.inact`, Buffer.from(ia));
  console.log(`  wrote ${pre}`);
}
