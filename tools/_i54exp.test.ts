// IIII52 一次性诊断：pass59 入口态导出（▶UndergroundHousesAndBuriedChests reseed 后、
// 四计数预掷后）。把 store 八通道 + gs（JSON）+ 骰窗口样本导出到 /tmp/iii54-out/exp-*，
// 然后抛 I54_ABORT 终止生成以省时。
// 用法：cd game && SW_I54_EXP=1 npx vitest run tools/_i54exp.test.ts
import { it } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG, UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_I54_EXP === '1';
const SEED = process.env.SW_I54_SEED ?? '1999040562';
const OUT = process.env.SW_I54_OUT ?? '/tmp/iii54-out';

const TileStoreP = Object.getPrototypeOf((await import('../src/world/TileStore')).TileStore.prototype);

function labelOf(file: string, line: number): string {
  const src = readFileSync(file, 'utf8').split('\n');
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return '';
}

(RUN ? it : it.skip)('i54 exporter', async () => {
  // reseed 拦截：捕获入口态后，等 ▶SurfaceChests 时点抛 ABORT 终止生成省时
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  let armed = false;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    let lab = '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_i54')) { lab = labelOf(m[1], Number(m[2])); break; }
    }
    if (lab === 'UndergroundHousesAndBuriedChests') armed = true;
    if (armed && lab === 'SurfaceChests') {
      RNGp.reseed = oReseed;
      throw new Error('I54_ABORT');
    }
    return oReseed.call(this, s);
  };
  // UnifiedRandom 内部 reseed 兜底（管线重播走 RNG.reseed；双保险不生效也无妨）
  void UnifiedRandom;

  // storeRef 捕获（与 _i49house 同法）
  const oIdx = (TileStoreP as unknown as Record<string, (...a: unknown[]) => unknown>).idx;
  let storeRef: unknown = null;
  (TileStoreP as unknown as Record<string, (...a: unknown[]) => unknown>).idx = function (
    this: unknown, ...a: unknown[]
  ) {
    if (!storeRef) storeRef = this;
    return (oIdx as unknown as (...a: unknown[]) => unknown).apply(this, a);
  };

  let captured = false;
  const cp = (a: Uint8Array | Uint16Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
  (globalThis as { __i54Ctx?: unknown }).__i54Ctx = (st: unknown, gs: unknown, ch: unknown) => {
    if (captured) return;
    captured = true;
    const s = st as { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
      liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array; paint: Uint8Array;
      paintWall: Uint8Array; coat: Uint8Array; frameX: Uint16Array; frameY: Uint16Array; w: number; h: number };
    writeFileSync(`${OUT}/exp-type.bin`, cp(s.type));
    writeFileSync(`${OUT}/exp-flags.bin`, cp(s.flags));
    writeFileSync(`${OUT}/exp-wall.bin`, cp(s.wall));
    writeFileSync(`${OUT}/exp-liq.bin`, cp(s.liquid));
    writeFileSync(`${OUT}/exp-lt.bin`, cp(s.liquidType));
    writeFileSync(`${OUT}/exp-half.bin`, cp(s.half));
    writeFileSync(`${OUT}/exp-slope.bin`, cp(s.slope));
    writeFileSync(`${OUT}/exp-wire.bin`, cp(s.wire));
    writeFileSync(`${OUT}/exp-paint.bin`, cp(s.paint));
    console.log(`[i54] exported ${s.w}x${s.h}`);
    writeFileSync(`${OUT}/exp-gs.json`, JSON.stringify(gs));
    writeFileSync(`${OUT}/exp-chests.json`, JSON.stringify(Array.isArray(ch) ? ch.length : 'n/a'));
  };

  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: 0,
      seedFlags: { tenthAnniversary: true },
    });
  } catch (e) {
    if (!(e as Error).message?.includes('I54_ABORT')) throw e;
  }
  (globalThis as { __i54Ctx?: unknown }).__i54Ctx = undefined;
  (TileStoreP as unknown as Record<string, (...a: unknown[]) => unknown>).idx = oIdx;
}, 900_000);
