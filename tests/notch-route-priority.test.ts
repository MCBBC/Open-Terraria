// ★行走优先级回归（2026-09-01 用户 marks(41) 定罪）：顶面凹槽口下贴抢跑顶面承接。
// 用户路线：flight2 平台阶梯上行登顶 → 顶面平台带右行返回 → 应沿平台带到 (3172,275)
// 原路下 flight2；修复前凹槽坡 (3166,275) 的面随下贴抢在平台单向承接之前发候选，
// 把身体拽上对角线顺势滑进 (3167,276) 实心梯（用户标注的错误引导路线）。
// 修 = 下贴加「等高平顶支撑否决」：横跨内存在与脚底等高(±2px)的平台/整砖平顶时
// 不发下贴（坡格对角高角不算 → 纯对角链自愈与平滑不受影响）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileStore } from '../src/world/TileStore';
import { moveAndCollide } from '../src/physics/TileCollision';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../src/core/constants';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE: {
  w: number; h: number;
  cells: Record<string, [number, number, number, number]>;
} = JSON.parse(readFileSync(join(HERE, 'fixtures', 'plat-corridor-window.json'), 'utf8'));

function buildWorld() {
  const st = new TileStore(FIXTURE.w, FIXTURE.h);
  for (const [k, v] of Object.entries(FIXTURE.cells)) {
    const [x, y] = k.split(',').map(Number);
    const i = st.idx(x, y);
    st.type[i] = v[0]; st.slope[i] = v[1]; st.half[i] = v[2]; st.flags[i] = 1;
    if (v[3]) st.flags[i] |= 64;
  }
  return { store: st } as never;
}

interface Cfg {
  startX: number; startFeetPx: number; dir: number; speed: number;
  ticks?: number; dropThrough?: boolean;
}
function walk(cfg: Cfg) {
  const world = buildWorld();
  const b = {
    x: cfg.startX * TILE, y: cfg.startFeetPx - 42,
    w: 20, h: 42, vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
    collideY: false, stepUp: true, stepUpHolds: false, stepUpNpc: true,
    liqFactor: 1, dropThrough: !!cfg.dropThrough,
  } as unknown as Parameters<typeof moveAndCollide>[0];
  const trail: { t: number; x: number; ft: number; g: boolean }[] = [];
  let air = 0, maxAir = 0;
  const N = cfg.ticks ?? 140;
  for (let t = 0; t < N; t++) {
    b.vx = cfg.dir * cfg.speed;
    b.vy = Math.min(b.vy + GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(b, world, b.vx, b.vy);
    if (!b.onGround) { air++; maxAir = Math.max(maxAir, air); } else air = 0;
    trail.push({ t, x: b.x / TILE, ft: (b.y + b.h) / TILE, g: !!b.onGround });
  }
  return { trail, maxAir, body: b };
}

describe('凹槽口行走优先级（用户返回路线）', () => {
  it('顶面右行跨凹槽:保持在平台带(ft≤275.4),不被引下实心梯,随后原路下 flight2', () => {
    for (const spd of [2.6, 2.8, 3.0, 3.04]) {
      const r = walk({ startX: 3162.5, startFeetPx: 275 * TILE, dir: 1, speed: spd, ticks: 150 });
      // 凹槽-平台带区间 (3166..3172): 脚底必须停留在顶面等级(≤275.5),不得下探到
      // flight1 实心梯等级(≥276.5)
      const bad = r.trail.filter(p => p.x >= 3166 && p.x <= 3172 && p.ft >= 276.5);
      expect(bad, `SPD${spd} 在平台带区间被引下实心梯:\n${bad.slice(0, 8).map(p => `t${p.t} x${p.x.toFixed(2)} ft${p.ft.toFixed(2)}`).join('\n')}`).toHaveLength(0);
      // 随后必须沿 flight2 下行(到达 x≥3176 且脚底显著低于顶面)
      const end = r.trail[r.trail.length - 1];
      expect(end.x, `SPD${spd} 未到达 flight2 段(终 x${end.x.toFixed(2)})`).toBeGreaterThan(3176);
      expect(end.ft, `SPD${spd} 未沿 flight2 下行(终 ft${end.ft.toFixed(2)})`).toBeGreaterThan(277);
      expect(r.maxAir, `SPD${spd} 空中连续帧 ${r.maxAir}`).toBeLessThanOrEqual(2);
    }
  });

  it('flight2 纯对角下行不受守卫影响(平滑跟随,无长空中段)', () => {
    // 从 flight2 对角线中部起步行右:(3174,277) 坡面线上
    const startFeet = 277 * TILE + 8;   // (3174,277) 线中部
    const r = walk({ startX: 3174.5, startFeetPx: startFeet, dir: 1, speed: 3.0, ticks: 60 });
    expect(r.maxAir, `空中连续帧 ${r.maxAir}`).toBeLessThanOrEqual(2);
    const end = r.trail[r.trail.length - 1];
    expect(end.ft).toBeGreaterThan(278);   // 确实在下行
  });

  it('hold S(dropThrough) 下穿语义保持:平台带上下穿落入 flight1', () => {
    const r = walk({ startX: 3165.5, startFeetPx: 275 * TILE, dir: 1, speed: 3.0, ticks: 90, dropThrough: true });
    const descended = r.trail.find(p => p.x >= 3168 && p.ft >= 276.5);
    expect(descended, '按 S 未下穿平台带').toBeTruthy();
  });

  it('左行登顶跨凹槽保持可用(用户上行路线不回归)', () => {
    // 从平台带右端向左跨凹槽登上大理石顶:StepUp 爬出凹槽
    const r = walk({ startX: 3170.5, startFeetPx: 275 * TILE, dir: -1, speed: 3.0, ticks: 60 });
    const onMarble = r.trail.filter(p => p.x <= 3165.2);
    expect(onMarble.length, '未登上大理石顶').toBeGreaterThan(0);
    const maxDrop = Math.max(...onMarble.map(p => p.ft));
    expect(maxDrop, `跨凹槽异常深探 ${maxDrop.toFixed(2)}`).toBeLessThan(277);
  });
});
