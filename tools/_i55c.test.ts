// IIII55 批·活体洪泛注册集对拍：跑一次完整生成，钩出 JS countTiles 的注册集，
// 与离线副本在同状态(snap-pre)上的注册集逐格 diff，把 ±N 微差定位到具体格类。
// 用法: SW_I55C=1 SW_I55C_TARGET=3072,586 npx vitest run tools/_i55c.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { genSolidType as genSolidTypeNow } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_I55C === '1';
const OUT = '/tmp/iii55-out';
const W = 4200, H = 1200, N = W * H;
const TARGET = (process.env.SW_I55C_TARGET ?? '3072,586').split(';').map((p) => p.split(',').map(Number));
const SEED = process.env.SW_I55_SEED ?? '1671560105';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('IIII55c live flood register-set capture', async () => {
  const captured = new Map<string, { count: number; shroom: number; cells: number[] }>();
  const boxDump = new Map<string, Uint8Array[]>();
  let armed = false;
  const RNG = (await import('../src/core/rng')).RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNG.reseed as (this: unknown, s: number) => void;
  // reseed▶SpiderCaves 时点后开始武装（简式：以 pass 序近似——statuesChests 内部标签）
  const srcCache = new Map<string, string[]>();
  function labelAt(file: string, line: number): string {
    let src = srcCache.get(file);
    if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return '';
  }
  RNG.reseed = function (this: unknown, s: number) {
    if (!armed) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1]!.includes('/core/rng')) {
          if (labelAt(m[1]!, Number(m[2])) === 'SpiderCaves') armed = true;
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  (globalThis as unknown as Record<string, unknown>).__swFloodTrace = (
    phase: string, x: number, y: number, count: number, shroom: number, cells?: number[],
  ) => {
    if (!armed || phase !== 'end' || !cells) return;
    for (const [tx, ty] of TARGET) {
      if (tx === x && ty === y && !captured.has(`${x},${y}`)) {
        captured.set(`${x},${y}`, { count, shroom, cells });
        console.log(`[captured] (${x},${y}) count=${count} shroom=${shroom} regs=${cells.length}`);
      }
    }
  };
  // —— 目标邻域盒快照钩（start 时抓活库原始通道，含内部 id）
  const BOXR = Number(process.env.SW_I55C_BOXR ?? 90);
  (globalThis as unknown as Record<string, unknown>).__swFloodBox = (
    phase: string, x: number, y: number,
  ) => {
    if (!armed || phase !== 'start') return;
    for (const [tx, ty] of TARGET) {
      if (tx !== x || ty !== y || boxDump.has(`${x},${y}`)) continue;
      const store = (globalThis as unknown as { __swStore?: import('../src/world/TileStore').TileStore }).__swStore;
      if (!store) return;
      const R = BOXR * 2 + 1;
      const type = new Uint16Array(R * R), flags = new Uint8Array(R * R), wall = new Uint16Array(R * R);
      const liquid = new Uint8Array(R * R), lt2 = new Uint8Array(R * R), hf = new Uint8Array(R * R);
      const sl = new Uint8Array(R * R), wire = new Uint8Array(R * R);
      let p = 0;
      for (let yy = ty - BOXR; yy <= ty + BOXR; yy++) for (let xx = tx - BOXR; xx <= tx + BOXR; xx++) {
        if (xx < 0 || xx >= W || yy < 0 || yy >= H) { p++; continue; }
        const i = store.idx(xx, yy);
        type[p] = store.type[i]; flags[p] = store.flags[i]; wall[p] = store.wall[i];
        liquid[p] = store.liquid[i]; lt2[p] = store.liquidType[i]; hf[p] = store.half[i];
        sl[p] = store.slope[i]; wire[p] = store.wire[i];
        p++;
      }
      boxDump.set(`${x},${y}`, [type, flags, wall, liquid, lt2, hf, sl, wire]);
      console.log(`[box] (${x},${y}) captured R=${BOXR}`);
      // —— 现场自跑同款洪泛（两个副本）
      const N2 = W * H;
      const runFlood = (solidFn: (gi: number) => boolean): number => {
        const counted = new Uint8Array(N2);
        const st2: number[] = [x, y];
        let cnt = 0;
        while (st2.length) {
          const cy = st2.pop()!, cx = st2.pop()!;
          if (cnt >= 3500) continue;
          if (cx <= 1 || cx >= W - 1 || cy <= 1 || cy >= H - 1) { cnt = 3500; continue; }
          const gi = cy * W + cx;
          if (counted[gi]) continue;
          if (wall[(cy - ty + BOXR) * R + (cx - tx + BOXR)] === 244) { cnt = 3500; continue; }
          if (liquid[(cy - ty + BOXR) * R + (cx - tx + BOXR)] > 0 && lt2[(cy - ty + BOXR) * R + (cx - tx + BOXR)] === 4) { cnt = 3500; continue; }
          if (wall[(cy - ty + BOXR) * R + (cx - tx + BOXR)] !== 0) { cnt = 3500; continue; }
          if (!solidFn(gi)) {
            counted[gi] = 1; cnt++;
            st2.push(cx, cy + 1, cx, cy - 1, cx + 1, cy, cx - 1, cy);
          }
        }
        return cnt;
      };
      const gidToStore = (gy: number, gx: number) => store.idx(gx, gy);
      const solidGameCopy = (gi: number): boolean => {
        const yy2 = Math.floor(gi / W), xx2 = gi % W;
        const si = gidToStore(yy2, xx2);
        if (!(store.flags[si] & 1)) return false;
        const d = TILE_DEFS[store.type[si]];
        if (!d) return false;
        return !!genSolidTypeNow(store.type[si]) && !d.platform && !store.half[si] && store.slope[si] === 0 && (store.wire[si] & 32) === 0;
      };
      void genSolidTypeNow;
      console.log(`[selfrun] (${x},${y}) gamecopy-count=${runFlood(solidGameCopy)} (${JSON.stringify({ expected: 'live should match' })})`);

    }
  };
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1, seedFlags: { getGoodWorld: true },
    onWorldPartial: (w) => { (globalThis as unknown as Record<string, unknown>).__swStore = w.store; },
  });
  RNG.reseed = oReseed;

  if (captured.size === 0) throw new Error('no target captured');
  // —— 离线副本对同一状态
  const b = readFileSync(`${OUT}/snap-pre.bin`);
  const u8Of = (bb: Buffer): Uint8Array => { const c = new Uint8Array(bb.length); c.set(bb); return c; };
  const u16Of = (bb: Buffer): Uint16Array => { const c = new Uint8Array(bb.length); c.set(bb); return new Uint16Array(c.buffer); };
  const Jact = u8Of(b.subarray(0, N)); const Jtyp = new Uint16Array(u16Of(b.subarray(N, 3 * N)).buffer.slice(0));
  const Jwal = new Uint16Array(u16Of(b.subarray(3 * N, 5 * N)).buffer.slice(0)); void Jwal;
  const Jhf = u8Of(b.subarray(6 * N, 7 * N)); const Jsl = u8Of(b.subarray(7 * N, 8 * N));
  const Jia = u8Of(b.subarray(9 * N, 10 * N));
  // offline J-state uses INTERNAL ids?? snapshot stores sheet domain! live engine's counted set is in internal idx space;
  // for comparison we must convert live internal-id cells → sheet-space coordinates. Instead invert: compare POSITION SETS.
  
  const INTERNAL_BY_SHEET = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !INTERNAL_BY_SHEET.has(s)) INTERNAL_BY_SHEET.set(s, i);
  }
  const solidJ = (i: number): boolean => {
    if (!Jact[i]) return false;
    const internal = INTERNAL_BY_SHEET.get(Jtyp[i]);
    if (internal === undefined) return false;
    const d = TILE_DEFS[internal];
    if (!d) return false;
    return !!genSolidTypeNow(internal) && !d.platform && !Jhf[i] && Jsl[i] === 0 && !Jia[i];
  };
  const solidGameCopyPub = (bb: Buffer, gi: number): boolean => {
      const store = (globalThis as unknown as { __swStore?: import('../src/world/TileStore').TileStore }).__swStore;
      if (!store) return false;
      const si = store.idx(gi % W, Math.floor(gi / W));
      if (!(store.flags[si] & 1)) return false;
      const d = TILE_DEFS[store.type[si]];
      if (!d) return false;
      return !!genSolidTypeNow(store.type[si]) && !d.platform && !store.half[si] && store.slope[si] === 0 && (store.wire[si] & 32) === 0;
    };
  
  for (const [key, cap] of captured) {
    const [sx, sy] = key.split(',').map(Number);
    const counted = new Uint8Array(N);
    const stack: number[] = [sx, sy];
    let count = 0, shroom = 0;
    while (stack.length) {
      const cy = stack.pop()!, cx = stack.pop()!;
      if (count >= 3500) continue;
      if (cx <= 1 || cx >= W - 1 || cy <= 1 || cy >= H - 1) { count = 3500; continue; }
      const i = cy * W + cx;
      if (counted[i]) continue;
      if (!solidJ(i)) {
        counted[i] = 1; count++;
        stack.push(cx, cy + 1, cx, cy - 1, cx + 1, cy, cx - 1, cy);
      }
    }
    // —— 盒快照 vs snap-pre 同位差分（只对 captured 的首个目标）
    {
      const key2 = [...boxDump.keys()][0];
      if (key2) {
        const arrs = boxDump.get(key2)!;
        const [type, flags, wall, liquid, lt2, hf, sl, wire] = arrs;
        const R = BOXR * 2 + 1;
        const bb = readFileSync(`${OUT}/snap-pre.bin`);
        let diffn = 0; const samples: string[] = [];
        for (let yy = 0; yy < R; yy++) for (let xx = 0; xx < R; xx++) {
          const tx = Number(key2.split(',')[0]) - BOXR + xx, ty = Number(key2.split(',')[1]) - BOXR + yy;
          if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
          const gi = ty * W + tx;
          const p = yy * R + xx;
          const jact = bb[gi], jtyp = new Uint16Array(bb.buffer.slice(bb.byteOffset + N + gi * 2, bb.byteOffset + N + gi * 2 + 2))[0];
          const jwal = new Uint16Array(bb.buffer.slice(bb.byteOffset + 3 * N + gi * 2, bb.byteOffset + 3 * N + gi * 2 + 2))[0];
          const jliq = bb[5 * N + gi], jhf = bb[6 * N + gi], jsl = bb[7 * N + gi], jlt = bb[8 * N + gi], jia = bb[9 * N + gi];
          const lA = flags[p] & 1, lT = SHEET[type[p]] ?? 9999, lW = wall[p], lL = liquid[p], lH = hf[p], lS = sl[p], lLt = lt2[p], lIa = (wire[p] >>> 5) & 1;
          if (jact !== lA || jtyp !== lT || jwal !== lW || jliq !== lL || jhf !== lH || jsl !== lS || (jliq > 0 ? jlt : 0) !== (lL > 0 ? lLt : 0) || jia !== lIa) {
            diffn++;
            if (samples.length < 30) samples.push(`(${tx},${ty}) v[a=${lA},t=${lT},w=${lW},l=${lL},hf=${lH},sl=${lS},lt=${lLt},ia=${lIa}] j[a=${jact},t=${jtyp},w=${jwal},l=${jliq},hf=${jhf},sl=${jsl},lt=${jlt},ia=${jia}]`);
          }
        }
        console.log(`[boxdiff] (${key2}) diffs=${diffn} / ${R * R}`);
        for (const sp of samples) console.log('   ', sp);
      }
    }

    // diff sets
    const off = new Set<number>();
    for (let i = 0; i < N; i++) if (counted[i]) off.add(i);
    const onlyLive: number[] = [], onlyOff: number[] = [];
    for (const ci of cap.cells) if (!off.has(ci)) onlyLive.push(ci);
    for (const ci of off) if (!cap.cells.includes(ci)) onlyOff.push(ci);
    console.log(`(${key}) live count=${cap.count} offline=${count} | regs live=${cap.cells.length} offline=${off.size} | onlyLive=${onlyLive.length} onlyOff=${onlyOff.length}`);
    // —— 实心判定逐格对照：live(def 真内部id) vs offline(快照 sheet 域)
    {
      const bb = readFileSync(`${OUT}/snap-pre.bin`);
      let mism = 0;
      for (const gi of cap.cells.slice(0, 4000)) {
        const xx2 = gi % W, yy2 = Math.floor(gi / W);
        const lSolid = solidGameCopyPub(bb, gi);
        const jact = bb[gi];
        const jtyp = new Uint16Array(bb.buffer.slice(bb.byteOffset + N + gi * 2, bb.byteOffset + N + gi * 2 + 2))[0];
        const jhf = bb[6 * N + gi], jsl = bb[7 * N + gi], jia = bb[9 * N + gi];
        const internal = INTERNAL_BY_SHEET.get(jtyp);
        const d = internal !== undefined ? TILE_DEFS[internal] : undefined;
        const oSolid = !!jact && !!d && !!genSolidTypeNow(internal) && !d.platform && !jhf && !jsl && !jia;
        if (!!lSolid !== oSolid) {
          mism++;
          if (mism <= 24) console.log(`   verdict-mismatch (${xx2},${yy2}) live=${lSolid ? 1 : 0} off=${oSolid ? 1 : 0} snap-sheet=${jtyp} act=${jact} hf=${jhf} sl=${jsl} ia=${jia}`);
        }
      }
      console.log(`   verdict mismatched=${mism}/${Math.min(4000, cap.cells.length)} (仅统计注册集前段)`);
    }
    const fmt = (i: number) => `(${i % W},${(i / W) | 0})t=${SHEET[TILE_DEFS[INTERNAL_BY_SHEET.get(Jtyp[i]) ?? 0] ?? 0]?.vanilla?.sheet}`;
    for (let z = 0; z < Math.min(8, onlyLive.length); z++) console.log('   onlyLive', fmt(onlyLive[z]!), `i=${onlyLive[z]}`);
    for (let z = 0; z < Math.min(8, onlyOff.length); z++) console.log('   onlyOff ', fmt(onlyOff[z]!), `i=${onlyOff[z]}`);
    // cleanup
    writeFileSync(`${OUT}/i55c-${key.replace(',', '_')}.json`, JSON.stringify({ count: cap.count, shroom: cap.shroom, offCount: count, onlyLive: onlyLive.slice(0, 200), onlyOff: onlyOff.slice(0, 200) }, null, 1));
  }
}, 600_000);
