// WWW 批·阶段1（SW_WWW=cap）：跑一次完整 JS 管线，在每个槽末（onWorldPartial）
// 与两个跨槽生产者重播点（▶JungleShrines / ▶OceanCaves，reseed 栈标签法）抓：
//   gs 深克隆 / GenSolid 快照 / surface / 稀疏 frameX·frameY·wire / sheet3·5 内部id /
//   world.chests
// 落盘 /tmp/www-b/<key>/ 供阶段2（_wwwrep）逐 pass 干净基座重放。
// 用法：cd game && SW_WWW=cap npx vitest run tools/_wwwcap.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { snapshotGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_WWW === 'cap';
const OUT = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface StoreLike {
  type: Uint16Array; flags: Uint8Array; frameX: Uint16Array; frameY: Uint16Array;
  wire: Uint8Array;
}
interface RectLike { x0: number; y0: number; x1: number; y1: number; pad: number }

/** GenState 深克隆（typed array → 普通 array，JSON 可序列化） */
function serGs(gs: unknown): unknown {
  if (gs === null || typeof gs !== 'object') return gs;
  if (gs instanceof Int32Array || gs instanceof Uint8Array || gs instanceof Float32Array) return Array.from(gs);
  if (Array.isArray(gs)) return gs.map(serGs);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(gs as Record<string, unknown>)) out[k] = serGs((gs as Record<string, unknown>)[k]);
  return out;
}

let capCount = 0;
function capture(key: string, store: StoreLike, surface: Float32Array, chests: unknown): void {
  const dir = `${OUT}/${key}`;
  mkdirSync(dir, { recursive: true });
  const gs = lastGenState();
  writeFileSync(`${dir}/gs.json`, JSON.stringify(serGs(gs)));
  writeFileSync(`${dir}/gensolid.json`, JSON.stringify([...snapshotGenSolid().entries()]));
  writeFileSync(`${dir}/surface.f32`, Buffer.from(surface.buffer, surface.byteOffset, surface.byteLength));
  // 稀疏 frames+wire：仅非零格
  const cells: number[] = [];
  for (let i = 0; i < N; i++) {
    if (store.frameX[i] || store.frameY[i] || store.wire[i]) cells.push(i, store.frameX[i], store.frameY[i], store.wire[i]);
  }
  const fw = new Uint32Array(cells.length);
  for (let q = 0; q < cells.length; q++) fw[q] = cells[q];
  writeFileSync(`${dir}/frames.bin`, Buffer.from(fw.buffer));
  // sheet 3/5 格的内部 id（mushroom/flower/tallgrass 共享 vanilla type 3；tree 双 id）
  const ids: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!store.flags[i]) continue;
    const sh = SHEET[store.type[i]];
    if (sh === 3 || sh === 5) ids.push(i, store.type[i]);
  }
  const iw = new Uint32Array(ids.length);
  for (let q = 0; q < ids.length; q++) iw[q] = ids[q];
  writeFileSync(`${dir}/ids35.bin`, Buffer.from(iw.buffer));
  writeFileSync(`${dir}/chests.json`, JSON.stringify(serGs(chests) ?? []));
  capCount++;
  console.log(`[cap] ${key}: framesCells=${cells.length / 4} ids35=${ids.length / 2}`);
}

const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) { try { src = readSrc(file); } catch { src = []; } srcCache.set(file, src); }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return '';
}
const srcMap = new Map<string, string[]>();
function readSrc(file: string): string[] {
  let s = srcMap.get(file);
  if (!s) { s = _readFileSyncUtf8(file).split('\n'); srcMap.set(file, s); }
  return s;
}
import { readFileSync as _readFileSyncUtf8 } from 'node:fs';
function _readFileSyncUtf8(f: string): string { return _readFileSyncUtf8(f, 'utf8'); }

(RUN ? it : it.skip)('WWW phase1 capture', async () => {
  mkdirSync(OUT, { recursive: true });
  // ① 槽末捕获
  let surfaceRef: Float32Array | null = null;
  let chestsRef: unknown = null;
  // ② 中途捕获：reseed 栈标签 ▶JungleShrines / ▶OceanCaves
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const midDone = new Set<string>();
  let storeRef: StoreLike | null = null;
  RNGp.reseed = function (this: unknown, s: number) {
    if (storeRef && surfaceRef) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_wwwcap')) {
          const lab = labelOf(m[1], Number(m[2]));
          if ((lab === 'JungleShrines' || lab === 'OceanCaves') && !midDone.has(lab)) {
            midDone.add(lab);
            capture(`m_${lab}`, storeRef, surfaceRef, chestsRef);
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: String(SEED), evil: 0,
      onWorldPartial: (w, i, name) => {
        if (!storeRef) {
          storeRef = w.store as never as StoreLike;
          surfaceRef = (w as unknown as { surface?: Float32Array }).surface ?? new Float32Array(W);
        }
        // surface 是 GenCtx 的（不在 world 上）——槽末重算逐列首实心行即可（仅探针参考用）
        chestsRef = w.chests;
        capture(`s${String(i).padStart(2, '0')}`, w.store as never as StoreLike, surfaceRef, w.chests);
        void name;
      },
    });
  } finally { RNGp.reseed = oReseed; }
  console.log(`captured ${capCount} boundaries in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}, 560_000);
