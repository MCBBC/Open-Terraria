// 一次性（Y 批）：granite 隔离掷差 -3 定位——TraceRNG 按 callsite 分段
// （采样掷 = runGranitePass 的 x/y/中央重掷；装饰掷 = 其余）对拍 rolltrace
// GP/G 每 biome 增量（b1..b7 装饰+下biome采样 = 9998/7797/10186/12613/9572/8031/8879，
// b8 = pass 末尾余量）。SW_PARITY=1 npx vitest run tools/_ygran.test.ts
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runGranitePass } from '../src/world/gen/vanilla/MarbleGranitePass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

const VG = process.env.SW_VG ?? '/tmp/sw-num4/van_x86_g';
const SEEDTXT = process.env.SW_SEED ?? '9293480';
const W = 4200, H = 1200;
const NAME21 = 'Marble';

function buildStore(idx: number, name: string) {
  const t = new Uint16Array(readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${name}.typ`).buffer.slice(0));
  const a = readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${name}.act`);
  const w = new Uint16Array(readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${name}.wal`).buffer.slice(0));
  const l = readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${name}.liq`);
  const REV = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
  }
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = 0;
  }
  return st;
}

interface Roll { site: string; arg: string; val: number }
class TraceRNG extends RNG {
  log: Roll[] = [];
  private rec(arg: string, val: number) {
    const st = new Error().stack ?? '';
    const frames = st.split('\n').map(s => {
      const m = s.match(/\(?([^()\s]+\.ts):(\d+):(\d+)\)?$/);
      return m ? `${m[1]!.split('/').pop()}:${m[2]}` : null;
    }).filter((s): s is string => !!s);
    const site = frames.find(f => !f.startsWith('rng.ts') && !f.startsWith('_ygran.test.ts')) ?? '??';
    this.log.push({ site, arg, val });
  }
  override next(): number { const v = super.next(); this.rec('dbl', v); return v; }
  override int(min: number, max: number): number { const v = super.int(min, max); this.rec(`int${min}-${max}`, v); return v; }
  override nextIntRange(a: number, b: number): number { const v = super.nextIntRange(a, b); this.rec(`ir${a}-${b}`, v); return v; }
}

// rolltrace 原版 per-biome 增量（G_k → GP_{k+1}）
const VAN_DELTAS = [9998, 7797, 10186, 12613, 9572, 8031, 8879];

(RUN ? it : it.skip)('granite per-biome draw segmentation', () => {
  const rt = runResetAndTerrain({ width: W, height: H, seedText: SEEDTXT, evil: 0 });
  const st = buildStore(21, NAME21);
  const trng = new TraceRNG(rt.gs.seed);
  void st; void trng;

  // biome 边界 = __swGranitePlace 探针记录的 log 下标（granite 采样全在装饰前）
  const bIdx: Array<{ x: number; y: number; k: number }> = [];
  (globalThis as { __swGranitePlace?: (x: number, y: number) => void }).__swGranitePlace = (x, y) => {
    bIdx.push({ x, y, k: trng2.log.length });
  };
  const st2 = buildStore(21, NAME21);
  const trng2 = new TraceRNG(rt.gs.seed);
  runGranitePass(st2, trng2, rt.gs);
  (globalThis as { __swGranitePlace?: unknown }).__swGranitePlace = undefined;
  console.log(`total draws=${trng2.log.length}, granite places=${bIdx.length} @ ${bIdx.map(b => `(${b.x},${b.y})`).join(' ')}`);
  for (let k = 0; k < bIdx.length; k++) {
    const lo = bIdx[k]!.k, hi = k + 1 < bIdx.length ? bIdx[k + 1]!.k : trng2.log.length;
    console.log(`biome${k + 1} (${bIdx[k]!.x},${bIdx[k]!.y}): decor=${hi - lo}`);
  }
  console.log('vanilla decor deltas b1..b7:', VAN_DELTAS.join(','), ' b8=78137-68-Σb1..7');
}, 240000);
