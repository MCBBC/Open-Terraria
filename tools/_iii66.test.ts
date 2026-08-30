// IIII66 批一次性探针：FTW 尾段四族（#53 Smooth_World slope / #71 Pots / #85 Webs /
// #89 Vines / 栽树簇）离线取证 —— 按 _mile8 口径跑 FTW 管线，把选定槽末状态的 8 通道
// JS 侧 dump 落盘 /tmp/iii66-out/jsdump/（格式与 x86 G2 一致：typ=mapped sheet 活性值
// +非活性 ghost；lty=vanilla 0 基；另附 rawtyp=内部原始 type）。行为零改动：只加写盘。
// 用法：
//   SW_III66=1 npx vitest run tools/_iii66.test.ts            # 正常管线抓快照（可提前中止）
//   SW_I66_REPLAY=1 SW_I66_ABORT_AT=53 …                       # x86-052 输入重放实验
import { it } from 'vitest';
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_III66 === '1';
const G2D0 = process.env.SW_I66_G2 ?? '/tmp/iii44-out/x86-ftw';
const REPLAY = process.env.SW_I66_REPLAY === '1';
const SEED = process.env.SW_III66_SEED ?? '1671560105';
const EVIL = Number(process.env.SW_III66_EVIL ?? 0);
const OUTD = process.env.SW_I66_OUT ?? '/tmp/iii66-out/jsdump';
const OUT = REPLAY ? '/tmp/iii66-out/jsreplay' : OUTD;
const W = Number(process.env.SW_III66_W ?? 4200), H = Number(process.env.SW_III66_H ?? 1200);
const N = W * H;
const ABORT_AT = Number(process.env.SW_I66_ABORT_AT ?? (REPLAY ? 105 : 105));
/** 按槽序中止（0..58）：SW_I66_ABORT_SLOT=<i> 在该槽末 dump 后停 */
const ABORT_SLOT = Number(process.env.SW_I66_ABORT_SLOT ?? (REPLAY ? 13 : -1));

const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_III66_FLAGS ?? '').split(',').filter(Boolean)) {
  M8_FLAGS[f] = true;
}

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
export { SHEET };

const SLOT_END = new Map<number, { d: number; nm: string }>([
  [0, { d: 0, nm: 'Terrain' }], [12, { d: 52, nm: 'Shell_Piles' }],
  [13, { d: 53, nm: 'Smooth_World' }], [24, { d: 69, nm: 'Floating_Island_Houses' }],
  [25, { d: 70, nm: 'Quick_Cleanup' }], [26, { d: 71, nm: 'Pots' }],
  [27, { d: 72, nm: 'Hellforge' }],
  [35, { d: 80, nm: 'Guide' }], [36, { d: 81, nm: 'Sunflowers' }],
  [37, { d: 82, nm: 'Planting_Trees' }], [38, { d: 83, nm: 'Herbs' }],
  [39, { d: 84, nm: 'Dye_Plants' }], [40, { d: 85, nm: 'Webs_And_Honey' }],
  [41, { d: 87, nm: 'Glowing' }], [42, { d: 88, nm: 'Jungle_Plants' }],
  [43, { d: 89, nm: 'Vines' }], [44, { d: 90, nm: 'Flowers' }],
  [45, { d: 91, nm: 'Mushrooms' }], [46, { d: 93, nm: 'Random_Gems' }],
  [47, { d: 94, nm: 'Moss_Grass' }], [48, { d: 95, nm: 'Muds_Walls_In_Jungle' }],
  [49, { d: 96, nm: 'Larva' }], [50, { d: 97, nm: 'Micro_Biomes' }],
  [51, { d: 98, nm: 'Settle_Liquids_Again' }], [54, { d: 101, nm: 'Lihzahrd_Altars' }],
  [55, { d: 102, nm: 'Water_Plants' }], [56, { d: 103, nm: 'Stalac' }],
  [57, { d: 104, nm: 'Remove_Broken_Traps' }], [58, { d: 105, nm: 'Final_Cleanup' }],
]);

const DUMPNAME = new Map<number, string>();

(RUN || REPLAY ? it : it.skip)('III66 FTW jsdump capture', async () => {
  mkdirSync(OUT, { recursive: true });
  if (REPLAY) {
    // x86 dump 052 → TypedArray 组包（x86 sheet 域 + 我方 rawtyp 保真域）
    const b16 = (p: string): Uint16Array => {
      const buf = readFileSync(p);
      return new Uint16Array(buf.buffer, buf.byteOffset, buf.length >> 1);
    };
    const u8 = (p: string): Uint8Array => new Uint8Array(readFileSync(p));
    const G2D = process.env.SW_I66_G2 ?? '/tmp/iii44-out/x86-ftw';
    const preX = `${G2D}/052_Shell_Piles`;
    const preJ = `${OUTD}/052_Shell_Piles`;
    const state = {
      t: b16(`${preX}.typ`), a: u8(`${preX}.act`), w: b16(`${preX}.wal`),
      l: u8(`${preX}.liq`), lt: u8(`${preX}.lty`), hf: u8(`${preX}.half`),
      sl: u8(`${preX}.slope`), ia: u8(`${preX}.inact`), jt: b16(`${preJ}.rawtyp`),
    };
    if (state.t.length !== N) throw new Error(`replay state size ${state.t.length} != ${N}`);
    (globalThis as Record<string, unknown>).__SW_I66_PRE_STATE = state;
  }
  // 名表从 x86 目录读，保证命名一致
  DUMPNAME.clear();
  for (const f of readdirSync(process.env.SW_I66_G2 ?? '/tmp/iii44-out/x86-ftw')) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  // sheet 表导出给 python 分析器
  const sm: Record<string, number> = {};
  for (let i = 0; i < TILE_DEFS.length; i++) if (SHEET[i] >= 0) sm[String(i)] = SHEET[i];
  writeFileSync('/tmp/iii66-out/sheetmap.json', JSON.stringify(sm));

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
        if (i === ABORT_SLOT || ent.d >= ABORT_AT) throw new AbortOK(`abort-at-slot${i}`);
      },
    });
  } catch (e) {
    if (!(e instanceof AbortOK)) throw e;
    console.log(`  early abort OK @${ABORT_AT}`);
  }
}, 900_000);

function dump(st: {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
}, idx: number, nameHint: string): void {
  const nm = DUMPNAME.get(idx) ?? nameHint;
  const pre = `${OUT}/${String(idx).padStart(3, '0')}_${nm}`;
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
  const ia = newUint(N);
  for (let i = 0; i < N; i++) ia[i] = (st.wire[i]! >>> 5) & 1;
  writeFileSync(`${pre}.inact`, Buffer.from(ia));
}

function newUint(n: number): Uint8Array {
  const a = new Uint8Array(n);
  return a;
}
