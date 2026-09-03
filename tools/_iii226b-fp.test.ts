// IIII226b 独立 vanilla FindPath 模拟(cs:174-209 + 397-478 逐字实现,读捕获态):
// 对 origin (2124,690) 跑 JS 引擎 place 与本模拟,对拍 len/路径/判决流。
import { it } from 'vitest';
import { appendFileSync, rmSync, readFileSync } from 'node:fs';
const RUN = process.env.SW_I226F === '1';
(RUN ? it : it.skip)('iii226b findpath sim', { timeout: 1_800_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  const { TILE_DEFS } = await import('../src/data/tiles');
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const { TileStore } = await import('../src/world/TileStore');
  const { TrackGenerator, __setTrackHistProbe } = await import('../src/world/gen/vanilla/TrackPass');
  const { RNG } = await import('../src/core/rng');
  const W = 4200, H = 1200, N = W * H;
  rmSync('/tmp/iii226b-out/fp.log', { force: true });
  const log = (s: string) => appendFileSync('/tmp/iii226b-out/fp.log', s + '\n');
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
  let cap: Record<string, unknown> | null = null;
  g.__swSeg = (name: unknown, detail?: unknown) => {
    if (name !== 'mbTrack' || cap) return;
    const d = detail as { st: InstanceType<typeof TileStore>; rng: RNG; gs: Record<string, unknown>; chests: unknown };
    const s = d.st;
    const cp = (a: Uint8Array | Uint16Array) => new (a.constructor as typeof Uint8Array)(a);
    const stCopy: Record<string, unknown> = { w: s.w, h: s.h };
    for (const k of ['type','flags','frameX','frameY','wall','liquid','liquidType','half','slope','wire','paint','paintWall','coat'] as const) stCopy[k] = cp((s as unknown as Record<string, Uint8Array | Uint16Array>)[k]!);
    const ur = (d.rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
    cap = { st: stCopy, seedArray: new Int32Array(ur.seedArray), inext: ur.inext, gs: d.gs, chests: d.chests };
  };
  try { await generateWorld({ width: W, height: H, seedText: 'nightofthelivingdead|20260903', evil: 0 as -1|0|1, seedFlags: { graveyardBloodmoonStart: true } }); }
  finally { g.__swSeg = undefined; }
  const c = cap as never as { st: Record<string, Uint16Array | Uint8Array | number>; seedArray: Int32Array; inext: number; gs: Record<string, unknown>; chests: unknown };
  // 独立 vanilla 谓词
  const INVAL_W = new Set([7,94,95,8,98,99,9,96,97,3,83,68,62,78,87,86,42,74,27,149]);
  const INVAL_T = new Set([383,384,15,304,30,321,245,246,240,241,242,16,34,158,377,94,10,19,86,219,484,190,664,665,41,43,44,226,237,711,712,713,714,715,716,379,314,141,411,21,467,88]);
  const GPTF = new Set([225,41,481,43,482,44,483,226,203,112,25,70,151,21,31,696,467,12,665,639,138,664,711,712,713,714,715,716]);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H) ? null : y * W + x;
  const solidVan = (x: number, y: number): boolean => {
    const i = at(x, y); if (i === null) return false;
    const t = c.st.type[i] as number;
    if (!(c.st.flags[i] as number)) return false;
    const td = TILE_DEFS[t];
    const sh = SHEET[t] ?? -1;
    // Main.tileSolid 直读(生成期):solid 表 + 1457 翻转(162=false/226=true) — 经 TILE_DEFS.solid+special
    const s = td?.solid === true;
    const flipped = sh === 162 ? false : sh === 226 ? true : s;
    const solidTop = td?.platform === true;
    return flipped && !solidTop && !(c.st.half[i] as number) && !(c.st.slope[i] as number) && !((c.st.wire[i] as number) >>> 5 & 1);
  };
  const isLocationInvalid = (x: number, y: number): boolean => {
    if (y > H - 200 || x < 5 || y < Math.floor(c.gs.worldSurface as number) || x > W - 5) return true;
    const sx = c.gs.shimmerX as number, sy = c.gs.shimmerY as number;
    if (sx >= 0 && Math.abs(x - sx) < 75 && Math.abs(y - sy) < 75) return true;
    const oc = ((c.gs.worldSurface as number) + (c.gs.rockLevel as number)) / 2 + 40;
    if (y <= oc && (x < (c.gs.beachDistance as number) || x > W - (c.gs.beachDistance as number))) return true;
    for (let i = 0; i < 6; i++) {
      const ii = at(x, y - i); if (ii === null) continue;
      if (INVAL_W.has(c.st.wall[ii] as number)) return true;
      if ((c.st.flags[ii] as number) && INVAL_T.has(SHEET[c.st.type[ii] as number] ?? -1)) return true;
      for (let k = -1; k <= 1; k++) {
        const ni = at(x + k, y - i); if (ni === null) continue;
        const sh = SHEET[c.st.type[ni] as number] ?? -1;
        if ((c.st.flags[ni] as number) && (sh === 314 || GPTF.has(sh))) return true;
      }
    }
    return false;
  };
  const AV = 0, OB = 1, INV = 2;
  const why = (x: number, y: number): string => {
    if (y > H - 200 || x < 5 || y < Math.floor(c.gs.worldSurface as number) || x > W - 5) return 'bounds';
    const ii = at(x, y);
    if (ii !== null) {
      if (INVAL_W.has(c.st.wall[ii] as number)) return `wall ${c.st.wall[ii]}`;
      if ((c.st.flags[ii] as number) && INVAL_T.has(SHEET[c.st.type[ii] as number] ?? -1)) return `tile ${SHEET[c.st.type[ii]]}`;
      for (let k = -1; k <= 1; k++) {
        const ni = at(x + k, y);
        if (ni !== null && (c.st.flags[ni] as number)) {
          const sh = SHEET[c.st.type[ni] as number] ?? -1;
          if (sh === 314 || GPTF.has(sh)) return `nbr sheet ${sh} @(${x + k},${y})`;
        }
      }
    }
    for (let i = 1; i < 6; i++) {
      const u = at(x, y - i); if (u === null) continue;
      if (INVAL_W.has(c.st.wall[u] as number)) return `wall ${c.st.wall[u]} @${-i}`;
      if ((c.st.flags[u] as number) && INVAL_T.has(SHEET[c.st.type[u] as number] ?? -1)) return `tile ${SHEET[c.st.type[u]]} @${-i}`;
      for (let k = -1; k <= 1; k++) {
        const ni = at(x + k, y - i);
        if (ni !== null && (c.st.flags[ni] as number)) {
          const sh = SHEET[c.st.type[ni] as number] ?? -1;
          if (sh === 314 || GPTF.has(sh)) return `nbr sheet ${sh} @(${x + k},${y - i})`;
        }
      }
    }
    for (let j = 0; j < 6; j++) { const d2 = at(x, y + j); if (d2 !== null && (c.st.flags[d2] as number) && (SHEET[c.st.type[d2] as number] ?? -1) === 314) return `track below +${j}`; }
    for (let dx = -30; dx <= 30; dx++) for (let dy = -30; dy <= 30; dy++) {
      const n2 = at(x + dx, y + dy);
      if (n2 !== null && (c.st.flags[n2] as number) && (SHEET[c.st.type[n2] as number] ?? -1) === 314) return `nearby track (${x + dx},${y + dy})`;
    }
    return 'not-invalid(hmm)';
  };
  const calcState = (x: number, y: number): number => {
    for (let i = 0; i < 6; i++) if (isLocationInvalid(x, y - i)) return INV;
    for (let j = 0; j < 6; j++) { const ii = at(x, y + j); if (ii !== null && (c.st.flags[ii] as number) && (SHEET[c.st.type[ii] as number] ?? -1) === 314) return INV; }
    for (let k = 0; k < 6; k++) if (solidVan(x, y - k)) return OB;
    // IsTileNearby(314,30): 61×61 全扫
    for (let dx = -30; dx <= 30; dx++) for (let dy = -30; dy <= 30; dy++) {
      const ii = at(x + dx, y + dy);
      if (ii !== null && (c.st.flags[ii] as number) && (SHEET[c.st.type[ii] as number] ?? -1) === 314) return INV;
    }
    return AV;
  };
  // vanilla FindPath 模拟(结构 1:1)
  const hist: Array<{ x: number; y: number; slope: number; mode: number }> = [];
  const xDir = -1; const ox = 2124, oy0 = 690;
  // FindSuitableOrigin
  {
    let y = oy0; let st0 = calcState(ox, y);
    while (st0 !== OB) { y++; if (st0 === INV) { log(`sim: FS fail INV at y=${y}`); return; } if (y >= H - 1) { log('sim: FS fail rail'); return; } st0 = calcState(ox, y); }
    y--;
    if (calcState(ox, y) !== AV) { log(`sim: FS fail above not AV at y=${y}`); return; }
    log(`sim: origin=(${ox},${y})`);
    for (let i = 0; i < 4096; i++) hist.push({ x: ox + i * xDir, y: y + i, slope: 1, mode: 0 });
  }
  let len = 1;
  const segState = (start: number, count: number): number => {
    let res = AV;
    for (let i = start; i < start + count; i++) {
      const s = calcState(hist[i]!.x, hist[i]!.y);
      if (s === INV) return INV;
      if (s === OB && hist[i]!.mode !== 1) res = OB;
    }
    return res;
  };
  const rewriteSlope = (index: number, slope: number) => {
    const d = slope - hist[index]!.slope; hist[index]!.slope = slope;
    for (let i = index; i < len; i++) hist[i]!.y += d;
  };
  const canSlopesTouch = (l: number, r: number) => (l !== r && l !== 0) ? r === 0 : true;
  const createTunnel = (): number => {
    let slope = 0, num = 10, result = INV;
    const x = hist[len - 1]!.x, y = hist[len - 1]!.y;
    for (let s2 = -1; s2 <= 1; s2++) {
      let last = INV;
      for (let i = 1; i < num; i++) {
        last = calcState(x + i * xDir, y + i * s2);
        if (last === OB) continue;
        if (last === AV) { slope = s2; num = i; result = last; }
        break;
      }
      if (result !== AV && last === OB && (result !== OB || slope !== 0)) { slope = s2; num = 10; result = last; }
    }
    if (len === 0 || !canSlopesTouch(hist[len - 1]!.slope, slope)) rewriteSlope(len - 1, 0);
    hist[len - 1]!.mode = 1;
    for (let j = 1; j < num; j++) { hist[len] = { x: hist[len - 1]!.x + xDir, y: hist[len - 1]!.y + slope, slope, mode: 1 }; len++; }
    return result;
  };
  const REW = 25;
  const tryRewrite = (): number => {
    let num = len - 1;
    const size = Math.min(len, REW);
    const snap: Array<{ x: number; y: number; slope: number; mode: number }> = [];
    for (let i = 0; i < size; i++) snap.push({ ...hist[num - i]! });
    while (num >= len - size) {
      if (hist[num]!.slope === 1) {
        const s = segState(num, len - num);
        if (s === AV) return s;
        rewriteSlope(num, 0);
      }
      num--;
    }
    if (segState(num + 1, len - (num + 1)) === AV) return AV;
    for (let m = len - 1; m >= len - size + 1; m--) {
      if (hist[m]!.slope === 0) {
        const s = segState(len - size, size);
        if (s === AV) return s;
        rewriteSlope(m, -1);
      }
    }
    for (let j = 0; j < size; j++) hist[len - 1 - j] = { ...snap[j]! };
    rewriteSlope(len - 1, 0);
    return segState(num + 1, len - (num + 1));
  };
  const minLength = 400, maxLength = 1000;
  let length = len;
  let guard = 0;
  while (len < 4096 - 100 && guard++ < 5000) {
    const slope = hist[len - 1]!.slope !== -1 ? 1 : 0;
    hist[len] = { x: hist[len - 1]!.x + xDir, y: hist[len - 1]!.y + slope, slope, mode: 0 }; len++;
    const st1 = tryRewrite();
    if (st1 === INV) {
      log(`sim: break tryRewrite INV at len=${len}`);
      for (let i = Math.max(0, len - 26); i < len; i++) {
        const s2 = calcState(hist[i]!.x, hist[i]!.y);
        if (s2 === INV) {
          const r = why(hist[i]!.x, hist[i]!.y);
          log(`sim: INVALID cell #${i} (${hist[i]!.x},${hist[i]!.y}) reason=${r}`);
        }
      }
      break;
    }
    length = len;
    let st2 = st1;
    while (st2 !== AV) {
      st2 = createTunnel();
      if (st2 === INV) { log(`sim: break createTunnel INV at len=${len}`); break; }
      length = len;
    }
    if (st2 === INV) break;
    if (len >= maxLength) { log(`sim: break maxLength at len=${len}`); break; }
  }
  len = Math.min(maxLength, length);
  log(`sim: final len=${len} (JS=405, vanilla expect <400)`);
  // JS 引擎对照
  const st = new TileStore(W, H);
  for (const k of ['type','flags','frameX','frameY','wall','liquid','liquidType','half','slope','wire','paint','paintWall','coat'] as const) {
    const src = c.st[k] as Uint8Array | Uint16Array;
    (st as unknown as Record<string, unknown>)[k] = new (src.constructor as typeof Uint8Array)(src);
  }
  __setTrackHistProbe((tag, hh, l, dir, ox2, oy2) => { if (ox2 === 2124 && (tag === 'TPFP OK' || tag === 'TPFP FAIL')) log(`js: ${tag} len=${l} origin=${ox2},${oy2}`); });
  const rng = new RNG(1);
  const tg = new TrackGenerator(st, c.gs as never, c.chests as never);
  const ok = tg.place(2124, 690, 400, 1000, rng);
  log(`js: place ok=${ok ? 1 : 0}`);
  __setTrackHistProbe(undefined);
});
