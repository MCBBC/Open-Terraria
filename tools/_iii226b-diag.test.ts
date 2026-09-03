// IIII226b 批轨段谓词诊断仪:捕获 mbTrack 态(同 _iii226b-replay)后,运行时包装
// TrackGenerator 原型链 calcState/isLocationInvalid/stateAt/segmentState,对指定
// attempt(缺省 LTRK 第 2 次成功前的 (2981,907))追踪判决流;对每个 INVALID 判决
// 用 cs:397-478 逐子句分解打印(墙表/型表/GPT 邻/轨/实心/近邻盒)。
// 用法: cd game && SW_I226D=1 SW_MB_1457=1 SW_I226D_AT="2981,907" \
//        npx vitest run tools/_iii226b-diag.test.ts
import { it } from 'vitest';
import { writeFileSync, appendFileSync, rmSync, readFileSync } from 'node:fs';

const RUN = process.env.SW_I226D === '1';
const OUT = process.env.SW_I226D_OUT ?? '/tmp/iii226b-out';
const SEED = process.env.SW_I226D_SEED ?? 'nightofthelivingdead|20260903';
const AT = process.env.SW_I226D_AT ?? '2981,907';

(RUN ? it : it.skip)('iii226b track predicate diagnosis', { timeout: 1_800_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  const { TILE_DEFS } = await import('../src/data/tiles');
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const { TileStore } = await import('../src/world/TileStore');
  const { TrackGenerator, __setTrackHistProbe } = await import('../src/world/gen/vanilla/TrackPass');
  const { RNG } = await import('../src/core/rng');

  const W = 4200, H = 1200, N = W * H;
  rmSync(`${OUT}/diag.log`, { force: true });
  const dlog = (s: string) => appendFileSync(`${OUT}/diag.log`, s + '\n');

  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }

  let cap: Record<string, unknown> | null = null;
  g.__swSeg = (name: unknown, detail?: unknown) => {
    if (name !== 'mbTrack' || cap) return;
    const d = detail as { st: InstanceType<typeof TileStore>; rng: RNG; gs: Record<string, unknown>; chests: unknown };
    if (!d?.st) return;
    const s = d.st;
    const cp = (a: Uint8Array | Uint16Array) => new (a.constructor as typeof Uint8Array)(a);
    const stCopy: Record<string, unknown> = { w: s.w, h: s.h };
    for (const k of ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
      stCopy[k] = cp((s as unknown as Record<string, Uint8Array | Uint16Array>)[k]!);
    }
    const ur = (d.rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
    const chCopy = ((d.chests as Array<Record<string, unknown> | null>) ?? []).map((ch) => ch ? {
      x: ch.x as number, y: ch.y as number,
      items: ((ch.items as Array<{ id: number; stack: number } | null>) ?? []).map((it) => (it ? { id: it.id, stack: it.stack } : null)),
    } : null);
    cap = { st: stCopy, seedArray: new Int32Array(ur.seedArray), inext: ur.inext, gs: d.gs, chests: chCopy };
  };

  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1,
      seedFlags: { graveyardBloodmoonStart: true },
    });
  } finally {
    g.__swSeg = undefined;
  }
  if (!cap) { dlog('CAPTURE-FAILED'); return; }
  const c = cap as never as {
    st: Record<string, Uint8Array | Uint16Array | number>;
    seedArray: Int32Array; inext: number;
    gs: Record<string, unknown>; chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> } | null>;
  };
  const st = new TileStore(W, H);
  for (const k of ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    (st as unknown as Record<string, unknown>)[k] = c.st[k];
  }

  // ── cs 忠实谓词分解器(读捕获 store) ──
  const idx = (x: number, y: number) => y * W + x;
  const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const INVALID_WALLS = new Set([7, 94, 95, 8, 98, 99, 9, 96, 97, 3, 83, 68, 62, 78, 87, 86, 42, 74, 27, 149]);
  const INVALID_TILES = new Set([383, 384, 15, 304, 30, 321, 245, 246, 240, 241, 242, 16, 34, 158, 377, 94, 10, 19, 86, 219, 484, 190, 664, 665, 41, 43, 44, 226, 237, 711, 712, 713, 714, 715, 716, 379, 314, 141, 411, 21, 467, 88]);
  const GPT_FALSE = new Set([225, 41, 481, 43, 482, 44, 483, 226, 203, 112, 25, 70, 151, 21, 31, 696, 467, 12, 665, 639, 138, 664, 711, 712, 713, 714, 715, 716]);
  const SOLID_GEN = (t: number) => {
    const td = TILE_DEFS[t];
    return !!(td && (td.solid || (td as unknown as { solidGen?: boolean }).solidGen));
  };
  const reason = (x: number, y: number): string => {
    if (y > H - 200) return `bounds y>${H - 200}`;
    if (x < 5 || y < Math.floor(c.gs.worldSurface as number) || x > W - 5) return `bounds surf/edge`;
    if (c.gs.shimmerX !== undefined && (c.gs.shimmerX as number) >= 0
      && Math.abs(x - (c.gs.shimmerX as number)) < 75 && Math.abs(y - (c.gs.shimmerY as number)) < 75) return `shimmerBox`;
    const oc = (c.gs.worldSurface as number + (c.gs.rockLevel as number)) / 2 + 40;
    if (y <= oc && (x < (c.gs.beachDistance as number) || x > W - (c.gs.beachDistance as number))) return `oceanDepths`;
    for (let i = 0; i < 6; i++) {
      const yy = y - i;
      if (!inB(x, yy)) continue;
      const ii = idx(x, yy);
      if ((st.wall[ii] as number) && INVALID_WALLS.has(st.wall[ii] as number)) return `invalidWall ${st.wall[ii]} @(${x},${yy})`;
      const t = st.type[ii] as number;
      if ((st.flags[ii] as number) && INVALID_TILES.has(SHEET[t] ?? -1)) return `invalidTile ${SHEET[t]} @(${x},${yy})`;
      for (let k = -1; k <= 1; k++) {
        if (!inB(x + k, yy)) continue;
        const ni = idx(x + k, yy);
        const nt = st.type[ni] as number;
        if ((st.flags[ni] as number) && ((SHEET[nt] ?? -1) === 314 || GPT_FALSE.has(SHEET[nt] ?? -1))) {
          return `GPT/track neighbor sheet=${SHEET[nt]} @(${x + k},${yy})`;
        }
      }
    }
    for (let j = 0; j < 6; j++) {
      if (inB(x, y + j) && (st.flags[idx(x, y + j)] as number) && (SHEET[st.type[idx(x, y + j)] as number] ?? -1) === 314) return `existingTrack below @(${x},${y + j})`;
    }
    return `not-invalid(=obstructed-or-avail)`;
  };

  // ── 运行时包装原型原语 ──
  const proto = TrackGenerator.prototype as unknown as Record<string, (this: unknown, x: number, y: number) => number>;
  const origCalc = proto.calcState, origInv = proto.isLocationInvalid;
  dlog(`wrap check: calcState=${typeof origCalc} isLocationInvalid=${typeof origInv} sameProto=${TrackGenerator.prototype === proto}`);
  const [atx, aty] = AT.split(',').map(Number);
  let tracing = false;
  let curOrigin = '';
  let calcCalls = 0, invCallsN = 0;
  const invCalls: Array<{ x: number; y: number; r: boolean }> = [];
  proto.isLocationInvalid = function (x: number, y: number) {
    const r = origInv.call(this, x, y);
    invCallsN++;
    if (tracing) invCalls.push({ x, y, r });
    return r;
  };
  proto.calcState = function (x: number, y: number) {
    const r = origCalc.call(this, x, y);
    calcCalls++;
    if (tracing) dlog(`STATE (${x},${y}) = ${r} ${r === 2 ? 'reason=' + reason(x, y) : ''}`);
    if (tracing && r === 2) dlog(`INVALID calcState (${x},${y}) reason=${reason(x, y)} [attempt ${curOrigin}]`);
    return r;
  };
  __setTrackHistProbe((tag, hist, len, dir, ox, oy) => {
    if (tag === 'TPFP FAIL' || tag === 'TPFP OK') {
      dlog(`${tag} len=${len} dir=${dir} origin=${ox},${oy} invCalls=${invCalls.length} calcCalls=${calcCalls} invN=${invCallsN}`);
      calcCalls = 0; invCallsN = 0;
      const bad = invCalls.filter((v) => v.r);
      dlog(`INVALID cells (${bad.length}): ` + bad.slice(-40).map((v) => `(${v.x},${v.y})`).join(' '));
      invCalls.length = 0;
    }
  });

  // ── 重放 LTRK 到目标 attempt ──
  const rng = new RNG(1);
  {
    const ur = (rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
    ur.seedArray.set(c.seedArray); ur.inext = c.inext;
  }
  const gsReplay = c.gs;
  const trackGen = new TrackGenerator(st, gsReplay as never, c.chests);
  const scW = (v: number): number => v;
  const w = W, h = H;
  let tDone = 0, tFail = 0;
  let trackCount = rng.int(scW(1), scW(2));
  let seen = 0;
  while (tDone < trackCount) {
    const ox = rng.int(10, w - 11);
    const oy = rng.int(Math.floor(c.gs.worldSurface as number), h - 201);
    seen++;
    curOrigin = `${ox},${oy}`;
    tracing = (ox === atx && oy === aty);
    const ok = trackGen.place(ox, oy, scW(400), scW(1000), rng);
    tracing = false;
    dlog(`#${seen} LTRK ${ox},${oy} ok=${ok ? 1 : 0}`);
    if (ok) { tDone++; tFail = 0; } else { tFail++; if (tFail > Math.floor(w / 2)) { tDone++; tFail = 0; } }
  }
});
