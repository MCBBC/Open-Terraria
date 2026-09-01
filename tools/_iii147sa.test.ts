// IIII112 sandy 残差「分歧永久化」阶段定位仪 v2：每 snap 阶段拍 BOX 全格 {t,w}，
// 对每个【终态仍差】格找出最后一致的阶段→首个不一致阶段的迁移点。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I147SA === '1';
const OUT = process.env.SW_I147SA_OUT ?? '/tmp/iii147-out';
const SEED = process.env.SW_I81_SEED ?? '1.1.1.0.sandybritches|106104';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const X0 = 855, X1 = 985, Y0 = 255, Y1 = 325;
const BW = X1 - X0 + 1, BH = Y1 - Y0 + 1;

(RUN ? it : it.skip)('iiiiii147 sandy break-point attribution', async () => {
  const le16 = (p: string): Uint16Array => {
    const b = readFileSync(p);
    return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
  };
  const G = '/tmp/iii127-out/x86-sandybritches';
  const x32t = le16(`${G}/032_Dungeon.typ`), x32a = readFileSync(`${G}/032_Dungeon.act`);
  const x31t = le16(`${G}/031_Slush.typ`), x31a = readFileSync(`${G}/031_Slush.act`);
  type Snap = { t: Int32Array; w: Uint16Array };
  const snaps: Array<{ nm: string; s: Snap }> = [];
  (globalThis as unknown as { __dgSegWatch?: unknown }).__dgSegWatch = (name: string, st2: { idx: (x: number, y: number) => number; flags: Uint8Array; type: Uint16Array; wall: Uint16Array }) => {
    const t = new Int32Array(BW * BH), w = new Uint16Array(BW * BH);
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const i = st2.idx(x, y), k = (y - Y0) * BW + (x - X0);
      const on = st2.flags[i] !== 0 ? 1 : 0;
      t[k] = on ? SHEET[st2.type[i]] ?? 9999 : 0;
      w[k] = st2.wall[i];
    }
    snaps.push({ nm: name, s: { t, w } });
  };
  await generateWorld({ width: 4200, height: 1200, seedText: SEED, evil: -1 });
  (globalThis as unknown as { __dgSegWatch?: unknown }).__dgSegWatch = undefined;
  // x86 真值面
  const xt = new Int32Array(BW * BH), xw = new Uint16Array(BW * BH);
  const x31v = new Int32Array(BW * BH);
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const i = y * 4200 + x, k = (y - Y0) * BW + (x - X0);
    xt[k] = x32a[i] ? x32t[i]! : 0;
    x31v[k] = x31a[i] ? x31t[i]! : 0;
  }
  const last = snaps[snaps.length - 1]!;
  const breaks: Record<string, number> = {};
  const samples: string[] = [];
  for (let k = 0; k < BW * BH; k++) {
    if (last.s.t[k] === xt[k]) continue;
    let prevNm = '(pre-pass)';
    let bad = false;
    for (const sn of snaps) {
      if (sn.s.t[k] !== xt[k]) { bad = true; break; }
      prevNm = sn.nm;
    }
    if (!bad) continue;
    const x = X0 + (k % BW), y = Y0 + Math.floor(k / BW);
    breaks[prevNm] = (breaks[prevNm] ?? 0) + 1;
    if (samples.length < 400) samples.push(`${prevNm}-> (${x},${y}) j=${last.s.t[k]} x=${xt[k]} p31=${x31v[k]} L=${snaps[0]!.s.t[k]}`);
  }
  console.log('[i147sa] permanent-break stage histogram:', JSON.stringify(breaks));
  for (const s of samples) console.log('[i147sa]', s);
  writeFileSync(`${OUT}/i147sa-breaks.json`, JSON.stringify({ breaks, samples }, null, 1));
}, 900_000);
