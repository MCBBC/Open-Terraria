// IIII62 复用 IIII60 快照手法的私有副本（避免污染并行会话产物）——修复后边界复核
// （与 x86 G2 dump 同格式），另录 GLM pass 分支事件流。离线对拍分析用。
// 用法: cd game && SW_I60=1 npx vitest run tools/_i60snap.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I64 === '1';
const G2 = process.env.SW_I64_G2 ?? '/tmp/iii45-out/x86-remix';
const SEED = process.env.SW_I64_SEED ?? '1138154190';
const EVIL = process.env.SW_I60_EVIL !== undefined ? Number(process.env.SW_I60_EVIL) : -1;
const W = Number(process.env.SW_I64_W ?? 4200), H = Number(process.env.SW_I64_H ?? 1200);
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I64_FLAGS ?? 'remix').split(',').filter(Boolean)) FLAGS[f] = true;
const OUT = process.env.SW_I64_OUT ?? '/tmp/iii64-out/js4post';

type StoreT = {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
};
interface Snap { a: Uint8Array; t: Uint16Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array }
function copyOf(s: StoreT): Snap {
  return {
    a: s.flags.slice(), t: s.type.slice(), w: s.wall.slice(), l: s.liquid.slice(),
    hf: s.half.slice(), sl: s.slope.slice(), lt: s.liquidType.slice(),
  };
}
const DUMPNAME = new Map<number, string>();
/** label → dump idx（与 mile8 LABEL2DUMP 同源子集——GLM 相邻窗口） */
const LABELS = new Map<string, number>([
  ['DesertBiome', 18], ['GlowingMushroomPatches', 19], ['Marble', 20],
  ['Granite', 21], ['FloatingIslands', 22], ['DirtToMud', 23], ['Silt', 24],
  ['OresAndShinies', 25], ['Webs', 26], ['Underworld', 27],
  ['CorruptionAndCrimson', 28], ['Lakes', 29], ['Slush', 30], ['Dungeon', 31],
]);

(RUN ? it : it.skip)('i60 js-side boundary snapshots + glm event log', async () => {
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  mkdirSync(OUT, { recursive: true });
  const snaps = new Map<number, Snap>();
  let curStore: StoreT | null = null;
  const seen = new Set<number>();
  // GLM 事件流 tap（MushroomPass __swMushEv 原生钩）
  const evLines: string[] = [];
  (globalThis as unknown as { __swMushEv?: (s: string) => void }).__swMushEv = (s: string) => evLines.push(s);

  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (curStore) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_i60snap')) {
          const lab = labelOf(m[1], Number(m[2]));
          const idx = LABELS.get(lab);
          if (idx !== undefined && !seen.has(idx)) {
            seen.add(idx);
            snaps.set(idx, copyOf(curStore));
            console.log(`[i64] idx=${idx} ${lab}`);
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined,
      onWorldPartial: (_w, _i, _pn) => {
        if (!curStore) curStore = _w.store as never as StoreT;
      },
    });
  } finally {
    RNGp.reseed = oReseed;
    delete (globalThis as { __swMushEv?: unknown }).__swMushEv;
  }

  const wr = (idx: number, p: string, b: ArrayBufferLike) =>
    writeFileSync(`${OUT}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${p}`, Buffer.from(b));
  for (const [idx, s] of snaps) {
    wr(idx, 'typ', s.t.buffer.slice(0));
    wr(idx, 'act', s.a.buffer.slice(0));
    wr(idx, 'wal', s.w.buffer.slice(0));
    wr(idx, 'liq', s.l.buffer.slice(0));
    wr(idx, 'half', s.hf.buffer.slice(0));
    wr(idx, 'slope', s.sl.buffer.slice(0));
    wr(idx, 'lty', s.lt.buffer.slice(0));
    console.log(`[i64 frozen] idx=${idx} ${DUMPNAME.get(idx)} → ${OUT}`);
  }
  writeFileSync(`${OUT}/glm-events.jsonl`, evLines.join('\n'));
  console.log(`[i60 events] ${evLines.length}`);
}, 600_000);
