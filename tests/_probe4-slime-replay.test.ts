// SW-BJ6 2026-09-07 取证探针:真实存档地形 + 真实 slimeAI 重放史莱姆穿墙
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSave } from '../src/save/SaveFile';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import type { World } from '../src/world/World';

const JSON_PATH = '/Users/vinlic/Downloads/map-流浪汉舌.json';

/** 坡格三角形内点测试（tile 局部 px 坐标,0..16） */
function pointInSlope(sl: number, lx: number, ly: number): boolean {
  switch (sl) {
    case 1: return ly >= lx;             // 左高右低:面线 y=x,实心在下
    case 2: return ly >= 16 - lx;        // 右高左低
    case 3: return ly <= lx;             // 天花板:实心在上(左低右高)
    case 4: return ly <= 16 - lx;        // 天花板(右低左高)
    default: return true;
  }
}

/** 身体与实心的几何重叠(px² 近似:采样点法,4×4 网格+角点)。
 *  返回 {cells, depth} —— cells=重叠实心格列表 */
function solidOverlap(st: World['store'], x: number, y: number, w: number, h: number) {
  const cells: string[] = [];
  const N = 5;
  // 半开区间采样 [y, y+h)：底/右边界恰在格线不计入下一格（边界贴面非嵌入）
  for (let iy = 0; iy <= N; iy++) {
    for (let ix = 0; ix <= N; ix++) {
      const px = x + (w - 0.01) * (ix / N), py = y + (h - 0.01) * (iy / N);
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      if (!st.inBounds(tx, ty)) continue;
      const i = st.idx(tx, ty);
      if (st.flags[i] === 0) continue;
      if (!st.isSolid(tx, ty)) continue;
      const sl = st.slope[i], hf = st.half[i];
      const lx = px - tx * TILE, ly = py - ty * TILE;
      let inside: boolean;
      if (sl > 0) inside = pointInSlope(sl, lx, ly);
      else if (hf) inside = ly >= 8;
      else inside = true;
      if (inside) cells.push(`${tx},${ty}`);
    }
  }
  return cells;
}

function makeGame(world: World, player: unknown): GameHooks {
  return {
    world,
    player,
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    playSfxFiles: () => {},
    playSfxWav: () => {},
    spawnDust: () => null,
    onEnemyKilled: () => {},
    entities: { add: () => {} },
  } as unknown as GameHooks;
}

describe('SW-BJ6 史莱姆穿墙重放（真实存档地形）', () => {
  it('熔岩史莱姆/绿史莱姆 在台阶区活动 N tick,检测几何嵌入', () => {
    const json = readFileSync(JSON_PATH, 'utf8');
    const { world } = loadSave(json);
    const st = world.store;
    (globalThis as Record<string, unknown>).__swPhysDbg = {};
    const dbg = (globalThis as Record<string, unknown>).__swPhysDbg as Record<string, number>;

    const results: string[] = [];
    for (const vid of [59, 1]) {
      // 出生:大洞穴台阶底(x1830,y319 面) —— 玩家在井(1817,305)方向,激愤追人
      const w0 = vid === 59 ? 26 : 24, h0 = vid === 59 ? 19 : 18;
      const e = Enemy.fromVanilla(vid, 1830 * TILE, 319 * TILE - h0);
      if (!e) throw new Error('spawn fail ' + vid);
      const player = {
        x: 1817 * TILE, y: 305 * TILE, w: 20, h: 42,
        get cx() { return this.x + this.w / 2; }, get cy() { return this.y + this.h / 2; },
        dead: false,
      };
      const game = makeGame(world, player);
      const drive = (e as unknown as Record<string, (g: GameHooks, p: unknown) => void>).slimeAI;
      let embeddedTicks = 0;
      let firstEmbed = '';
      let prev = { x: e.x, y: e.y };
      let maxJump = 0;
      const trace: string[] = [];
      for (let t = 0; t < 1500; t++) {
        drive.call(e, game, player);
        const cells = solidOverlap(st, e.x, e.y, e.w, e.h);
        if (cells.length > 0) {
          embeddedTicks++;
          if (!firstEmbed) {
            firstEmbed = `t=${t} x=${e.x.toFixed(1)}(${(e.x / 16).toFixed(2)}) y=${e.y.toFixed(1)}(${(e.y / 16).toFixed(2)}) vx=${e.vx.toFixed(2)} vy=${e.vy.toFixed(2)} hw=${e.hitWall} g=${e.onGround} cY=${e.collideY} eT=${e.embedTicks ?? 0} cells=${cells.join(' ')}`;
          }
          if (trace.length < 14) {
            trace.push(`t=${t} x=${(e.x / 16).toFixed(2)} y=${(e.y / 16).toFixed(2)} v=(${e.vx.toFixed(1)},${e.vy.toFixed(1)}) cells=${cells.join(' ')}`);
          }
        }
        maxJump = Math.max(maxJump, Math.abs(e.x - prev.x), Math.abs(e.y - prev.y));
        prev = { x: e.x, y: e.y };
      }
      results.push(`vid=${vid} embeddedTicks=${embeddedTicks}/1500 maxJump=${maxJump.toFixed(1)}px physDbg=${JSON.stringify(dbg)}\n  firstEmbed: ${firstEmbed}\n  trace:\n    ${trace.join('\n    ')}`);
    }
    console.log(results.join('\n\n'));
    expect(true).toBe(true);
  });
});
