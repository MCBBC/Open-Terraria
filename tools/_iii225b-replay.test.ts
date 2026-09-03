// IIII225b 取证仪③：GFB pass97 反演重放——slot96 末快照（store 通道+gs+chests+
// GenSolid）→ 仅重放 runMicroBiomesPass → 对金标 097_Micro_Biomes 逐通道对拍。
// （_iii136unmask GFB 同构；pass 头 rng.reseed ⇒ 快照态完全决定重放流。）
// 用法：cd game && SW_I225BR=1 npx vitest run tools/_iii225b-replay.test.ts
// 产物：/tmp/iii225b-out/replay-verdict.txt
import { it } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const RUN = process.env.SW_I225BR === '1';
const OUT = process.env.SW_I225B_OUT ?? '/tmp/iii225b-out';
const G2 = process.env.SW_I225B_G2 ?? `${process.env.HOME}/GoldenChains/golden-gfb-c`;
const W = 4200, H = 1200, N = W * H;
const SEED = '9293480';
const FLAGS = { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true };

(RUN ? it : it.skip)('iii225b pass97 inverse replay (GFB)', { timeout: 1_200_000 }, async () => {
  const lines: string[] = [];
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const { runMicroBiomesPass } = await import('../src/world/gen/vanilla/MicroBiomesPass');
  const { TileStore } = await import('../src/world/TileStore');
  const { RNG } = await import('../src/core/rng');
  const { restoreGenSolid, snapshotGenSolid } = await import('../src/world/gen/vanilla/GenSolid');
  const { TILE_DEFS } = await import('../src/data/tiles');

  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = (TILE_DEFS[i] as unknown as { vanilla?: { sheet?: number } })?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }

  const CH = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire'] as const;
  let snap: Record<string, Uint8Array | Uint16Array> | undefined;
  let snapGs: unknown, snapChests: unknown, snapSolid: Map<number, boolean> | undefined;

  await generateWorld({
    width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1, seedFlags: FLAGS,
    onWorldPartial: (w2, _i, name) => {
      if (name === '蜂巢幼虫') {
        const st = (w2 as unknown as { store: Record<string, Uint8Array | Uint16Array> }).store;
        snap = {};
        for (const c of CH) snap[c] = (st[c] as Uint8Array | Uint16Array).slice();
        snapSolid = snapshotGenSolid();
        const g = globalThis as { __swMbCap?: (gs: unknown, st: unknown, chests?: unknown) => void };
        g.__swMbCap = (gs, _st, chests) => {
          snapGs = structuredClone(gs);
          snapChests = structuredClone(chests ?? []);
          g.__swMbCap = undefined;
        };
      }
    },
  } as Parameters<typeof generateWorld>[0]);

  if (!snap || !snapGs || !snapSolid) throw new Error('slot96 snapshot missing');

  // ---- 重建 store 并仅重放 pass97（pass 头 reseed ⇒ fresh RNG(seed) 等价） ----
  const st = new TileStore(W, H);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CH) rec[c]!.set(snap[c]!);
  restoreGenSolid(new Map(snapSolid));
  const rng = new RNG(Number(SEED));
  runMicroBiomesPass(st, rng, snapGs as never, snapChests as never);

  // ---- 对金标 097 逐通道（全格去掩蔽） ----
  const u8 = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0, N));
  const u16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0, N * 2));
  const g = `${G2}/097_Micro_Biomes`;
  const gt = u16(`${g}.typ`), ga = u8(`${g}.act`), gw = u16(`${g}.wal`);
  const gl = u8(`${g}.liq`), glt = u8(`${g}.lty`), ghf = u8(`${g}.half`);
  const gsl = u8(`${g}.slope`), gia = u8(`${g}.inact`);
  const gwx = u16(`${g}.frx`), gwy = u16(`${g}.fry`);
  let A = 0, T = 0, Wc = 0, L = 0, Hf = 0, Sl = 0, Lt = 0, Ia = 0, Fx = 0;
  const pairs = new Map<string, number>();
  const lavaDiff: string[] = [];
  for (let i = 0; i < N; i++) {
    const va = ga[i], ja = rec.flags[i] & 1;
    const vt = va ? gt[i] : 0;
    const jt = ja ? (SHEET[rec.type[i]] >= 0 ? SHEET[rec.type[i]] : 9999) : 0;
    if (va !== ja) A++;
    if (vt !== jt) { T++; const k = `${vt}>${jt}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
    if (gw[i] !== rec.wall[i]) Wc++;
    if (gl[i] !== rec.liquid[i]) { L++; if (lavaDiff.length < 25) lavaDiff.push(`${i % W},${Math.trunc(i / W)} g=${gl[i]} j=${rec.liquid[i]}`); }
    if (ghf[i] !== rec.half[i]) Hf++;
    if (gsl[i] !== rec.slope[i]) Sl++;
    const vl = gl[i] > 0 ? glt[i] + 1 : 0;
    const jl = rec.liquid[i] > 0 ? rec.liquidType[i] : 0;
    if (vl !== jl) Lt++;
    if (gia[i] !== ((rec.wire[i] >>> 5) & 1)) Ia++;
    if (gwx[i] !== rec.frameX[i] || gwy[i] !== rec.frameY[i]) Fx++;
  }
  lines.push(`REPLAY pass97 vs golden097: A=${A} T=${T} W=${Wc} L=${L} Hf=${Hf} Sl=${Sl} Lt=${Lt} Ia=${Ia} TOTAL=${A + T + Wc + L + Hf + Sl + Lt + Ia}`);
  lines.push('tile pairs: ' + [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${k}x${v}`).join(' '));
  if (lavaDiff.length) lines.push('liq diffs: ' + lavaDiff.join(' '));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/replay-verdict.txt`, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
});
