// IIII226b 批轨段离线重放仪:在 'mbTrack' 段起点(segProbe detail 直递,IIII226B 标记)
// 捕获 store 全通道深拷贝 + UnifiedRandom 内态(seedArray/inext) + gs 关键字段;
// 全管线照常跑完(不中止,segProbe 吞错故不throw),然后用真 TrackGenerator 在捕获态上
// 离线重放 LTRK/STRK 轨段,输出:
//   ①离线轨账(与全管线 dmlog 对账,验证捕获态/流位等价) ②重放末态 314 面 vs G2 097
//   314 面逐列差(轨段定罪/修复迭代回路) ③ wereld八通道快照落盘供冷差复用。
// 用法: cd game && SW_I226R=1 SW_MB_1457=1 npx vitest run tools/_iii226b-replay.test.ts
// 产物: /tmp/iii226b-out/{cap.log,replay-track.log,cap097/*}
import { it } from 'vitest';
import { writeFileSync, appendFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';

const RUN = process.env.SW_I226R === '1';
const OUT = process.env.SW_I226R_OUT ?? '/tmp/iii226b-out';
const SEED = process.env.SW_I226R_SEED ?? 'nightofthelivingdead|20260903';

(RUN ? it : it.skip)('iii226b track-section capture + offline replay', { timeout: 1_800_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  const { TILE_DEFS } = await import('../src/data/tiles');
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const { TileStore } = await import('../src/world/TileStore');
  const { TrackGenerator } = await import('../src/world/gen/vanilla/TrackPass');
  const { RNG } = await import('../src/core/rng');

  const W = 4200, H = 1200, N = W * H;
  rmSync(`${OUT}/cap.log`, { force: true });
  rmSync(`${OUT}/replay-track.log`, { force: true });
  const caplog = (s: string) => appendFileSync(`${OUT}/cap.log`, s + '\n');
  const rlog = (s: string) => appendFileSync(`${OUT}/replay-track.log`, s + '\n');

  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const TRACK_JS = (() => { for (let i = 0; i < TILE_DEFS.length; i++) if (SHEET[i] === 314) return i; return -1; })();

  // ── 捕获容器 ──
  type Cap = {
    st: Record<string, Uint8Array | Uint16Array | number>;
    seedArray: Int32Array; inext: number;
    gs: Record<string, unknown>; seedFlags: Record<string, boolean>;
    worldSurface: number; rockLevel: number; shimmerX: number; shimmerY: number; beachDistance: number;
    chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> } | null>;
  };
  let cap: Cap | null = null;

  g.__swSeg = (name: unknown, detail?: unknown) => {
    if (name !== 'mbTrack' || cap) return;
    const d = detail as { st: InstanceType<typeof TileStore>; rng: RNG; gs: Record<string, unknown>; chests: unknown };
    if (!d?.st) return;
    const s = d.st;
    const cp = (a: Uint8Array | Uint16Array) => new (a.constructor as typeof Uint8Array)(a);
    const stCopy: Record<string, Uint8Array | Uint16Array | number> = { w: s.w, h: s.h };
    for (const k of ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
      stCopy[k] = cp((s as unknown as Record<string, Uint8Array | Uint16Array>)[k]!);
    }
    const ur = (d.rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
    const gs2 = d.gs as Record<string, unknown>;
    // chests 深拷贝(TrackGenerator CanDestroyChest 锚面依赖)
    const chCopy = ((d.chests as Array<Record<string, unknown> | null> | undefined) ?? []).map((ch) => {
      if (!ch) return null;
      return {
        x: ch.x as number, y: ch.y as number,
        items: ((ch.items as Array<{ id: number; stack: number } | null>) ?? []).map((it) => (it ? { id: it.id, stack: it.stack } : null)),
      };
    });
    cap = {
      st: stCopy,
      seedArray: new Int32Array(ur.seedArray), inext: ur.inext,
      gs: gs2, seedFlags: { ...(gs2.seedFlags as Record<string, boolean>) },
      worldSurface: gs2.worldSurface as number, rockLevel: gs2.rockLevel as number,
      shimmerX: gs2.shimmerX as number, shimmerY: gs2.shimmerY as number,
      beachDistance: gs2.beachDistance as number,
      chests: chCopy,
    };
    caplog(`captured mbTrack: inext=${ur.inext} seedArray0=${ur.seedArray[0]} ws=${gs2.worldSurface} shimmer=(${gs2.shimmerX},${gs2.shimmerY}) beach=${gs2.beachDistance}`);
  };

  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1,
      seedFlags: { graveyardBloodmoonStart: true },
    });
  } finally {
    g.__swSeg = undefined;
  }
  if (!cap) { caplog('CAPTURE-FAILED'); return; }

  // ── 离线重建 ──
  const c = cap;
  const st = new TileStore(W, H);
  for (const k of ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    (st as unknown as Record<string, unknown>)[k] = c.st[k];
  }
  const rng = new RNG(1);
  {
    const ur = (rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
    ur.seedArray.set(c.seedArray);
    ur.inext = c.inext;
  }
  const gsReplay = {
    worldSurface: c.worldSurface, rockLevel: c.rockLevel,
    shimmerX: c.shimmerX, shimmerY: c.shimmerY,
    beachDistance: c.beachDistance, seedFlags: c.seedFlags,
  };
  const w = W, h = H;
  const widthScale = 1;   // 4200 基准 = ×1
  const scW = (v: number): number => Math.trunc(widthScale * v);
  const areaScale = (w * h) / 5040000;
  const trackFailLimit = Math.floor(w / 2);

  rlog(`replay start`);
  const trackGen = new TrackGenerator(st, gsReplay as never, c.chests);
  const attempt = (min: number, max: number) => {
    const ox = rng.int(10, w - 11);
    const oy = rng.int(Math.floor(c.worldSurface), h - 201);
    const ok = trackGen.place(ox, oy, scW(min), scW(max), rng);
    return { ox, oy, ok };
  };
  let tDone = 0, tFail = 0;
  const led: Array<{ tag: string; ox: number; oy: number; ok: boolean }> = [];
  let trackCount = rng.int(scW(1), scW(2));
  rlog(`longTrackCount=${trackCount}`);
  while (tDone < trackCount) {
    const a = attempt(400, 1000);
    led.push({ tag: 'LTRK', ...a });
    rlog(`LTRK ${a.ox},${a.oy} ok=${a.ok ? 1 : 0}`);
    if (a.ok) { tDone++; tFail = 0; } else { tFail++; if (tFail > trackFailLimit) { tDone++; tFail = 0; } }
  }
  trackCount = rng.int(Math.max(1, Math.trunc(areaScale * 4)), Math.max(1, Math.trunc(areaScale * 7)));
  rlog(`stdTrackCount=${trackCount}`);
  tDone = 0; tFail = 0;
  while (tDone < trackCount) {
    const a = attempt(150, 300);
    led.push({ tag: 'STRK', ...a });
    rlog(`STRK ${a.ox},${a.oy} ok=${a.ok ? 1 : 0}`);
    if (a.ok) { tDone++; tFail = 0; } else { tFail++; if (tFail > trackFailLimit) { tDone++; tFail = 0; } }
  }

  // ── 重放末态 314 面 vs G2 097 314 面 ──
  const g2buf = readFileSync(`${process.env.HOME}/GoldenChains/golden-grvfix/097_Micro_Biomes.typ`);
  const g2typ = new Uint16Array(g2buf.buffer, g2buf.byteOffset, N);
  let vOnly = 0, jOnly = 0, both = 0;
  const vCols = new Map<number, number>(), jCols = new Map<number, number>();
  for (let i = 0; i < N; i++) {
    const gv = g2typ[i]! === 314, jv = st.type[i] === TRACK_JS;
    if (gv && jv) both++;
    else if (gv && !jv) { vOnly++; vCols.set(i % W, (vCols.get(i % W) ?? 0) + 1); }
    else if (!gv && jv) { jOnly++; jCols.set(i % W, (jCols.get(i % W) ?? 0) + 1); }
  }
  const ranges = (m: Map<number, number>) => {
    const xs = [...m.keys()].sort((a, b) => a - b); const out: string[] = [];
    let s = xs[0], p = xs[0];
    for (const x of xs.slice(1)) { if (x === p + 1) { p = x; continue; } out.push(`[${s}..${p}]`); s = p = x; }
    if (xs.length) out.push(`[${s}..${p}]`);
    return out.join(',');
  };
  rlog(`314 face: both=${both} g2-only=${vOnly} replay-only=${jOnly}`);
  rlog(`g2-only col ranges: ${ranges(vCols)}`);
  rlog(`replay-only col ranges: ${ranges(jCols)}`);
  rlog(`ledger ${led.length} attempts; LTRK ok: ${led.filter((a) => a.tag === 'LTRK' && a.ok).map((a) => `${a.ox},${a.oy}`).join(' | ')}; STRK ok: ${led.filter((a) => a.tag === 'STRK' && a.ok).map((a) => `${a.ox},${a.oy}`).join(' | ')}`);

  // ── 重放末态八通道落盘(冷差复用) ──
  mkdirSync(`${OUT}/cap097`, { recursive: true });
  const w8 = (nm: string, a: Uint8Array | Uint16Array) =>
    writeFileSync(`${OUT}/cap097/${nm}`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  w8('typ', c.st.type as Uint16Array);
  w8('wal', c.st.wall as Uint16Array);
  w8('act', c.st.flags as Uint8Array);
  w8('liq', c.st.liquid as Uint8Array);
  w8('lty', c.st.liquidType as Uint8Array);
  w8('half', c.st.half as Uint8Array);
  w8('slope', c.st.slope as Uint8Array);
  w8('wire', c.st.wire as Uint8Array);
  rlog(`cap097 dumped`);
});
