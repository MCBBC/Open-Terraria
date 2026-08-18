// WWW 批·阶段1b（SW_WWW=mid）：只抓两个跨槽生产者重播点的中途边界状态：
//   ▶JungleShrines（槽8 内、Beehives 后）/ ▶OceanCaves（槽5 内、引力沙后）
// 两标签都命中即中止生成（省时）。落盘 /tmp/www-b/m_<label>/，格式同 _wwwcap。
import { it } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { snapshotGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_WWW === 'mid';
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
function serGs(gs: unknown): unknown {
  if (gs === null || typeof gs !== 'object') return gs;
  if (gs instanceof Int32Array || gs instanceof Uint8Array || gs instanceof Float32Array) return Array.from(gs);
  if (Array.isArray(gs)) return gs.map(serGs);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(gs as Record<string, unknown>)) out[k] = serGs((gs as Record<string, unknown>)[k]);
  return out;
}
function capture(key: string, store: StoreLike, chests: unknown): void {
  const dir = `${OUT}/${key}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/gs.json`, JSON.stringify(serGs(lastGenState())));
  writeFileSync(`${dir}/gensolid.json`, JSON.stringify([...snapshotGenSolid().entries()]));
  const cells: number[] = [];
  for (let i = 0; i < N; i++) {
    if (store.frameX[i] || store.frameY[i] || store.wire[i]) cells.push(i, store.frameX[i], store.frameY[i], store.wire[i]);
  }
  const fw = new Uint32Array(cells);
  writeFileSync(`${dir}/frames.bin`, Buffer.from(fw.buffer));
  const ids: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!store.flags[i]) continue;
    const sh = SHEET[store.type[i]];
    if (sh === 3 || sh === 5) ids.push(i, store.type[i]);
  }
  writeFileSync(`${dir}/ids35.bin`, Buffer.from(new Uint32Array(ids).buffer));
  writeFileSync(`${dir}/chests.json`, JSON.stringify(serGs(chests) ?? []));
  console.log(`[cap] ${key}: framesCells=${cells.length / 4} ids35=${ids.length / 2}`);
}

const srcMap = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcMap.get(file);
  if (!src) { src = readFileSync(file, 'utf8').split('\n'); srcMap.set(file, src); }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return '';
}

(RUN ? it : it.skip)('WWW phase1b mid capture', async () => {
  mkdirSync(OUT, { recursive: true });
  let storeRef: StoreLike | null = null;
  let chestsRef: unknown = null;
  const midDone = new Set<string>();
  class Ab extends Error { constructor() { super('wwwmid'); } }
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (storeRef) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_wwwmid')) {
          const lab = labelOf(m[1], Number(m[2]));
          if ((lab === 'JungleShrines' || lab === 'OceanCaves') && !midDone.has(lab)) {
            midDone.add(lab);
            capture(`m_${lab}`, storeRef, chestsRef);
            if (midDone.size >= 2) { RNGp.reseed = oReseed; throw new Ab(); }
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
      onWorldPartial: (w) => {
        if (!storeRef) { storeRef = w.store as never as StoreLike; chestsRef = w.chests; }
        chestsRef = w.chests;
      },
    });
  } catch (e) {
    const c = (e as { cause?: unknown })?.cause;
    if (!(e instanceof Ab || c instanceof Ab)) throw e;
  } finally { RNGp.reseed = oReseed; }
  console.log(`mid captured: ${[...midDone]} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}, 400_000);
