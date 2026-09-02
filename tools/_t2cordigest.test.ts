// 一次性诊断（t2 2026-09-02）：Corruption 槽末四通道 digest 与 x86 pc.txt 对拍。
// 背景：七认证链不含猩红世界 ⇒ 猩红 flavor 的槽 #030 输出面从未被认证。x86 权威 =
// /tmp/t2-out/{cor,crim}/pc.txt P|29|Corruption 的 T:/A:/W:/L:（JJHook FNV-1a 32 位，
// typ u16LE=原版 sheet / act u8 / wal u16LE / liq u8，y 外 x 内行主序）。
// 本仪同构驱动 JS 两 flavor，在 runCorruptionPass 槽末（__swCorSlotEnd）落盘四通道
// FNV，写 /tmp/t2-out/js-digest-{cor,crim}.txt。
// 用法：cd game && npx vitest run tools/_t2cordigest.test.ts
process.env.SW_MB_1457 = '1';
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const SEED = '9293480';
const W = 4200, H = 1200;

// repo type → vanilla sheet（ Corruption 槽时点世界全为原版 tile ）
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;

function fnv32(data: Uint8Array | Uint16Array): number {
  // JJHook.Fnv 同式：对【字节序列】FNV-1a（u16 通道 = 其 LE 字节序列，byteLength 已含 ×2）
  let h = 2166136261 >>> 0;
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  for (let k = 0; k < bytes.length; k++) {
    h = (h ^ bytes[k]!) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function slotDigests(st: TileStore): { typ: number; act: number; wal: number; liq: number; badType: number } {
  const n = st.w * st.h;
  const typ = new Uint16Array(n);
  const act = new Uint8Array(n);
  let badType = -1;
  for (let i = 0; i < n; i++) {
    const t = st.type[i]!;
    const s = SHEET[t] ?? -1;
    if (s < 0) { badType = t; typ[i] = 0; } else typ[i] = s;
    act[i] = (st.flags[i]! & 1) ? 1 : 0;   // x86: t.active()?1:0（bit0=active，bit1 是 decor 预留位）
  }
  return { typ: fnv32(typ), act: fnv32(act), wal: fnv32(st.wall), liq: fnv32(st.liquid), badType };
}

async function runFlavor(evil: -1 | 0 | 1, outPath: string): Promise<void> {
  const g = globalThis as { __swCorSlotEnd?: (st: TileStore, gs: GenState) => void };
  const prev = g.__swCorSlotEnd;
  let digests: ReturnType<typeof slotDigests> | null = null;
  g.__swCorSlotEnd = (st: TileStore) => { digests = slotDigests(st); };
  try {
    await generateWorld({ width: W, height: H, seedText: SEED, evil });
  } finally {
    g.__swCorSlotEnd = prev;
  }
  if (!digests) throw new Error('slot-end hook never fired');
  const d = digests as unknown as ReturnType<typeof slotDigests>;
  const hex = (v: number) => (v >>> 0).toString(16).padStart(8, '0');
  const lines = [
    `# flavor evil=${evil}`,
    `T:${hex(d.typ)}  A:${hex(d.act)}  W:${hex(d.wal)}  L:${hex(d.liq)}  badType=${d.badType}`,
  ];
  writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}

it('t2 corruption slot-end digest two flavors', async () => {
  await runFlavor(0, '/tmp/t2-out/js-digest-cor.txt');
  await runFlavor(-1, '/tmp/t2-out/js-digest-crim.txt');
}, 900000);
