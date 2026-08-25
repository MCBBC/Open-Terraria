// 一次性诊断（m 链 #59 Buried_Chests 首差追凶 v2 2026-08-25）：
//   六格 (3704..3706,705..706)=187 LargePiles2 在 pass#58 窗口被清。
//   setTile/setTileSilent 间谍零命中 → 用 Proxy 包 flags/type 数组抓裸写。
// 用法：cd game && SW_QQQM=1 npx vitest run tools/_qqqm.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { UnifiedRandom, RNG } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const RUN = process.env.SW_QQQM === '1';
const W = Number(process.env.SW_M8_W ?? 6400);

const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}

(RUN ? it : it.skip)('m59 pile kill tracer v2', async () => {
  const TX0 = 3694, TX1 = 3712, TY0 = 700, TY1 = 710;
  const PILE = new Set<number>();
  for (const x of [3704, 3705, 3706]) for (const y of [705, 706]) PILE.add(y * W + x);
  const BOX = new Set<number>();
  for (let y = TY0; y <= TY1; y++) for (let x = TX0; x <= TX1; x++) BOX.add(y * W + x);

  const logs: string[] = [];
  const log = (s: string) => { if (logs.length < 6000) logs.push(s); };

  // ---- 掷计数 ----
  const proto = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const orig = proto.internalSample as (this: UnifiedRandom) => number;
  let n = 0;
  proto.internalSample = function (this: UnifiedRandom) {
    const v = orig.call(this);
    n++;
    (globalThis as { __swRollN?: number }).__swRollN = n;
    return v;
  };

  // ---- store 捕获（inBounds 高频调用；多实例全记，每实例只探一次）----
  const probed = new WeakSet<object>();
  const stores: TileStore[] = [];
  let st: TileStore | null = null;
  const tsp = TileStore.prototype as unknown as Record<string, unknown>;
  const oIB = tsp.inBounds as (this: TileStore, x: number, y: number) => boolean;
  tsp.inBounds = function (this: TileStore, x: number, y: number) {
    if (!probed.has(this)) {
      probed.add(this);
      const len = (this.type as Uint16Array | undefined)?.length;
      log(`store seen w=${this.w} len=${len} @roll ${n}`);
      if (this.w === W && len === W * 1800) {
        stores.push(this);
        if (!st) { st = this; log(`store#0 captured @roll ${n}`); }
      }
    }
    return oIB.call(this, x, y);
  };

  let proxied = false;
  let origFlags: Uint8Array | null = null;
  let origType: Uint16Array | null = null;
  let stackSeen = new Set<string>();

  function armProxies(): void {
    if (!st || proxied) return;
    origFlags = st.flags; origType = st.type;
    const hf = {
      set(tgt: Uint8Array, prop: string | symbol, val: unknown): boolean {
        const i = typeof prop === 'string' ? Number(prop) : -1;
        if (Number.isInteger(i)) {
          if ((PILE.has(i) || BOX.has(i)) && tgt[i] !== val) {
            const x = i % W, y = Math.floor(i / W);
            const key = `${x},${y}:${tgt[i]}->${val}`;
            if (PILE.has(i) && !stackSeen.has(key)) {
              stackSeen.add(key);
              log(`RAW flags (${x},${y}) ${tgt[i]}->${val} @roll ${n} :: ${(new Error().stack ?? '').split('\n').slice(1, 12).join(' <- ')}`);
            }
          }
        }
        return Reflect.set(tgt, prop, val);
      },
      get(tgt: Uint8Array, prop: string | symbol): unknown {
        return Reflect.get(tgt, prop, tgt);
      },
    };
    const ht: ProxyHandler<Uint16Array> = {
      set(tgt: Uint16Array, prop: string | symbol, val: unknown): boolean {
        const i = typeof prop === 'string' ? Number(prop) : -1;
        if (Number.isInteger(i) && PILE.has(i) && tgt[i] !== val) {
          const x = i % W, y = Math.floor(i / W);
          log(`RAW type (${x},${y}) ${tgt[i]}->${val} @roll ${n}`);
        }
        return Reflect.set(tgt, prop, val);
      },
      get(tgt: Uint16Array, prop: string | symbol): unknown {
        return Reflect.get(tgt, prop, tgt);
      },
    };
    try {
      (st as { flags: Uint8Array }).flags = new Proxy(origFlags, hf);
      (st as { type: Uint16Array }).type = new Proxy(origType, ht);
      proxied = true;
      log(`== proxies armed @roll ${n}`);
    } catch (e) {
      log(`proxy arm failed: ${e}`);
    }
  }
  function disarmProxies(): void {
    if (!st || !proxied || !origFlags || !origType) return;
    (st as { flags: Uint8Array }).flags = origFlags;
    (st as { type: Uint16Array }).type = origType;
    proxied = false;
  }

  // ---- pass 边界 ----
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_qqqm')) {
        const lab = labelOf(m[1], Number(m[2]));
        if (lab === 'UndergroundHousesAndBuriedChests') { log(`== ARM ▶${lab} @roll ${n}`); armProxies(); }
        else if (lab === 'SurfaceChests') {
          log(`== DISARM ▶${lab} @roll ${n} stores=${stores.length}`);
          stores.forEach((s2, si) => {
            for (const x of [3704, 3709]) {
              const cells: string[] = [];
              for (const y of [699, 705, 706]) {
                const i = y * W + x;
                cells.push(`${y}:f${s2.flags[i]}t${s2.type[i]}sh${SHEET[s2.type[i]] ?? -1}`);
              }
              log(`END store#${si}${s2 === st ? '(proxied)' : ''} x=${x} ${cells.join(' ')}`);
            }
            // 全图对拍 dump059（mile8 同口径）
            try {
              const D = process.env.SW_M8_G2 ?? '/tmp/jjj-out/g1457-m';
              const rd = (p: string) => readFileSync(`${D}/059_Buried_Chests.${p}`);
              const vt = new Uint16Array(rd('typ').buffer.slice(0));
              const va = rd('act');
              let dA = 0, dT = 0;
              const firsts: string[] = [];
              const N = W * 1800;
              for (let i = 0; i < N; i++) {
                const ja = s2.flags[i] & 1;
                if ((va[i] !== 0 ? 1 : 0) !== ja) {
                  dA++;
                  if (firsts.length < 10) firsts.push(`A(${i % W},${Math.floor(i / W)})v${va[i]}j${ja}`);
                  continue;
                }
                const vti = va[i] !== 0 ? vt[i] : 0;
                const jti = ja ? (SHEET[s2.type[i]] >= 0 ? SHEET[s2.type[i]] : 9999) : 0;
                if (vti !== jti) { dT++; if (firsts.length < 10) firsts.push(`T(${i % W},${Math.floor(i / W)})v${vti}j${jti}`); }
              }
              log(`FULLDIFF vs 059: dA=${dA} dT=${dT} :: ${firsts.join(' | ')}`);
            } catch (e) { log(`fulldiff failed: ${e}`); }
          });
          disarmProxies();
        }
        break;
      }
    }
    return oReseed.call(this, s);
  };

  // ---- 房间矩形 + 阶段 + 扫描探针 ----
  let curTag = '';
  let pendingQ: string[] = [];
  let pendingK: string[] = [];
  (globalThis as { __swQ?: unknown }).__swQ = (i: number) => {
    const x = i % W, y = Math.floor(i / W);
    pendingQ.push(`q(${x},${y})`);
  };
  (globalThis as { __swK?: unknown }).__swK = (ni: number) => {
    const x = ni % W, y = Math.floor(ni / W);
    pendingK.push(`k(${x},${y})`);
  };
  (globalThis as { __swHouseRooms?: unknown }).__swHouseRooms = (ox: number, oy: number, rooms: string) => {
    const rs = rooms.split(';').map((s) => s.split(',').map(Number));
    for (const [rx, ry, rw, rh] of rs) {
      if (rx + rw >= TX0 - 30 && rx <= TX1 + 30 && ry + rh >= TY0 - 40 && ry <= TY1 + 40) {
        log(`ROOMS ox=${ox} oy=${oy} room=${rx},${ry},${rw},${rh} @roll ${n}`);
      }
    }
  };
  (globalThis as { __swHouseStage?: unknown }).__swHouseStage = (tag: string, ox: number, oy: number, c: number, d: number) => {
    if (tag === 'bld') {
      curTag = `house@${ox},${oy},t${c}`;
      return;
    }
    // 每阶段末 sweep：只对盒邻域相关的 house 报告
    const qf = pendingQ.filter((s) => {
      const m = s.match(/\((\d+),(\d+)\)/)!;
      return Number(m[1]) >= 3692 && Number(m[1]) <= 3714 && Number(m[2]) >= 698 && Number(m[2]) <= 712;
    });
    const kf = pendingK.filter((s) => {
      const m = s.match(/\((\d+),(\d+)\)/)!;
      return Number(m[1]) >= 3692 && Number(m[1]) <= 3714 && Number(m[2]) >= 698 && Number(m[2]) <= 712;
    });
    if (curTag === 'house@3722,693,t4' || qf.length || kf.length) {
      log(`SWEEP[${tag}] ${curTag}: Q=[${qf.join(' ')}] K=[${kf.join(' ')}] @roll ${n}`);
    }
    pendingQ = []; pendingK = [];
  };

  try {
    await generateWorld({ width: W, height: 1800, seedText: process.env.SW_M8_SEED ?? '20260811', evil: 0 });
  } finally {
    proto.internalSample = orig;
    RNGp.reseed = oReseed;
    tsp.inBounds = oIB;
    delete (globalThis as { __swHouseRooms?: unknown }).__swHouseRooms;
    delete (globalThis as { __swHouseStage?: unknown }).__swHouseStage;
  }
  for (const s of logs.slice(0, 300)) console.log(s);
}, 600_000);
