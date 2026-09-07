// SW-BJ6 取证探针2:逐 tick 细察嵌入过渡帧 + slopeCollide 日志
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSave } from '../src/save/SaveFile';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import type { World } from '../src/world/World';

const JSON_PATH = '/Users/vinlic/Downloads/map-流浪汉舌.json';

function pointInSlope(sl: number, lx: number, ly: number): boolean {
  switch (sl) {
    case 1: return ly >= lx;
    case 2: return ly >= 16 - lx;
    case 3: return ly <= lx;
    case 4: return ly <= 16 - lx;
    default: return true;
  }
}

function solidOverlap(st: World['store'], x: number, y: number, w: number, h: number) {
  const cells = new Set<string>();
  const N = 5;
  for (let iy = 0; iy <= N; iy++) {
    for (let ix = 0; ix <= N; ix++) {
      const px = x + (w - 0.01) * (ix / N), py = y + (h - 0.01) * (iy / N);
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      if (!st.inBounds(tx, ty)) continue;
      const i = st.idx(tx, ty);
      if (st.flags[i] === 0 || !st.isSolid(tx, ty)) continue;
      const sl = st.slope[i], hf = st.half[i];
      const lx = px - tx * TILE, ly = py - ty * TILE;
      const inside = sl > 0 ? pointInSlope(sl, lx, ly) : hf ? ly >= 8 : true;
      if (inside) cells.add(`${tx},${ty}`);
    }
  }
  return [...cells];
}

describe('SW-BJ6 嵌入过渡帧细察', () => {
  it('lava slime t=100..260 逐 tick', () => {
    const json = readFileSync(JSON_PATH, 'utf8');
    const { world } = loadSave(json);
    const st = world.store;
    const slog: unknown[] = [];
    (globalThis as Record<string, unknown>).__SW_SLOPE_LOG = slog;
    (globalThis as Record<string, unknown>).__swPhysDbg = {};
    const e = Enemy.fromVanilla(59, 1830 * TILE, 319 * TILE - 19)!;
    const player = {
      x: 1817 * TILE, y: 305 * TILE, w: 20, h: 42,
      get cx() { return this.x + this.w / 2; }, get cy() { return this.y + this.h / 2; },
      dead: false,
    };
    const game = {
      world, player, enemies: () => [], critters: () => [], spawnDrop: () => null,
      damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
      spawnParticles: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
      spawnDust: () => null, onEnemyKilled: () => {}, entities: { add: () => {} },
    } as unknown as GameHooks;
    const drive = (e as unknown as Record<string, (g: GameHooks, p: unknown) => void>).slimeAI;
    let prevX = e.x, prevY = e.y;
    let dbgPrev = { shortfall: 0, ceilDropBlocked: 0, unembedH: 0 };
    const out: string[] = [];
    for (let t = 0; t < 260; t++) {
      const dbg0 = (globalThis as Record<string, unknown>).__swPhysDbg as Record<string, number>;
      dbgPrev = { shortfall: dbg0.shortfall ?? 0, ceilDropBlocked: dbg0.ceilDropBlocked ?? 0, unembedH: dbg0.unembedH ?? 0 };
      const s0 = slog.length;
      const sbf0 = e.slopeBlockFired;
      drive.call(e, game, player);
      const dbg1 = (globalThis as Record<string, unknown>).__swPhysDbg as Record<string, number>;
      const dSf = (dbg1.shortfall ?? 0) - dbgPrev.shortfall;
      const dCb = (dbg1.ceilDropBlocked ?? 0) - dbgPrev.ceilDropBlocked;
      const dUh = (dbg1.unembedH ?? 0) - dbgPrev.unembedH;
      const cells = solidOverlap(st, e.x, e.y, e.w, e.h);
      if (t >= 160 && t <= 215) {
        out.push(`t=${t} x=${e.x.toFixed(2)} y=${e.y.toFixed(2)} v=(${e.vx.toFixed(2)},${e.vy.toFixed(2)}) hw=${+e.hitWall} hh=${+e.hitHead} g=${+e.onGround} cY=${+e.collideY} eT=${e.embedTicks ?? 0} sbf=${+!!sbf0}→${+!!e.slopeBlockFired} dSf=${dSf} dCb=${dCb} dUh=${dUh} dx=${(e.x - prevX).toFixed(2)} dy=${(e.y - prevY).toFixed(2)} cells=${cells.join(' ')}`);
      }
      prevX = e.x; prevY = e.y;
    }
    console.log(out.join('\n'));
    // 嵌入 tick 的 slopeCollide 日志
    console.log('--- SLOPE_LOG (last 40 entries) ---');
    console.log(slog.slice(-40).join('\n'));
    expect(true).toBe(true);
  });
});
