// 坡面碰撞确定性回归(无浏览器):墙角挡停 / 孤立坡低侧进入爬升 / 坡顶过渡不沉入
// 布局逐格构造,直接驱动 moveAndCollide——E2E 对此类场景受输入抖动与自然地形干扰
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { World } from '../src/world/World';
import { moveAndCollide } from '../src/physics/TileCollision';
import { TILE_BY_KEY } from '../src/data/tiles';

const TILE = 16;
const DIRT = TILE_BY_KEY['dirt']!;

function makeWorld(w: number, h: number): World {
  return { store: new TileStore(w, h), w, h } as unknown as World;
}

interface TestBody { x: number; y: number; w: number; h: number; vx: number; vy: number; onGround: boolean; hitWall: boolean; hitHead: boolean }

/** 按住方向走 n 帧(原版走速 3px/帧 + 重力) */
function walk(b: TestBody, world: World, dir: -1 | 1, frames: number): void {
  for (let f = 0; f < frames; f++) {
    b.vx = 3 * dir;
    b.vy = Math.min(8, b.vy + 0.4);
    moveAndCollide(b as never, world, b.vx, b.vy);
  }
}

function embedCount(st: TileStore, b: TestBody): number {
  let n = 0;
  for (let x = Math.floor(b.x / TILE); x <= Math.floor((b.x + b.w - 0.01) / TILE); x++) {
    for (let y = Math.floor(b.y / TILE); y <= Math.floor((b.y + b.h - 0.01) / TILE); y++) {
      const j = st.idx(x, y);
      if (st.flags[j] && !st.half[j] && st.slope[j] === 0 && st.isSolid(x, y)) n++;
    }
  }
  return n;
}

describe('坡面碰撞回归', () => {
  it('孤立坡低侧进入:贴地左行沿对角线爬升到顶(不卡坡前一格)', () => {
    const W = makeWorld(60, 60);
    const st = W.store;
    const G = 30, sx = 40;
    for (let x = 34; x <= 52; x++) for (let y = G - 3; y <= G + 3; y++) st.setTile(x, y, 0);
    for (let x = 34; x <= 52; x++) st.setTile(x, G + 2, DIRT);     // 安全地板
    for (let x = 34; x <= sx - 1; x++) st.setTile(x, G, DIRT);     // 高台
    for (let x = sx + 1; x <= 52; x++) st.setTile(x, G + 1, DIRT); // 低处地面
    st.setTile(sx, G, DIRT);
    st.setSlope(sx, G, 1);                                          // slope1

    const p: TestBody = { x: (sx + 2) * TILE, y: (G + 1) * TILE - 42, w: 20, h: 42, vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false };
    walk(p, W, -1, 30);
    // 爬到高台顶(±3px)且已越过坡格;不嵌入
    expect(p.y + p.h).toBeCloseTo(G * TILE, 0);
    expect(p.x).toBeLessThan(sx * TILE);
    expect(embedCount(st, p)).toBe(0);
    expect(p.onGround).toBe(true);
  });

  it('墙角坡:悬垂面干净挡停,不穿透不嵌入(原版 :2426 同款拦截)', () => {
    const W = makeWorld(60, 60);
    const st = W.store;
    const G = 30, sx = 40;
    for (let x = 36; x <= 50; x++) for (let y = G - 1; y <= G + 3; y++) st.setTile(x, y, 0);
    for (let x = 36; x <= 50; x++) st.setTile(x, G + 3, DIRT);       // 地板
    for (let x = 36; x <= sx - 1; x++) st.setTile(x, G + 2, DIRT);   // 高侧顶面
    for (let x = sx - 2; x <= sx; x++) st.setTile(x, G + 1, DIRT);   // 悬垂
    st.setTile(sx, G + 2, DIRT);
    st.setSlope(sx, G + 2, 1);

    const p: TestBody = { x: (sx + 4) * TILE - 2, y: (G + 3) * TILE - 42, w: 20, h: 42, vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false };
    walk(p, W, -1, 120);
    // 停在悬垂右面((sx+1)*16)或更右,脚在地板面附近,零嵌入
    expect(p.x).toBeGreaterThanOrEqual((sx + 1) * TILE - 0.1);
    expect(p.y + p.h).toBeGreaterThanOrEqual((G + 3) * TILE - 20);
    expect(embedCount(st, p)).toBe(0);
  });

  it('坡顶过渡(用户标注布局):爬过坡顶不沉入相邻整砖行', () => {
    // 同 map-违法的要塞 (2236,276):[整砖(左)] [slope1] [整砖地面(右,低一行)]
    const W = makeWorld(60, 60);
    const st = W.store;
    const G = 30, sx = 40;
    for (let x = 32; x <= 54; x++) for (let y = G - 3; y <= G + 3; y++) st.setTile(x, y, 0);
    for (let x = 32; x <= 54; x++) st.setTile(x, G + 2, DIRT);       // 安全地板
    for (let x = 32; x <= sx - 1; x++) st.setTile(x, G, DIRT);       // 高台(延伸,防走出)
    for (let x = sx + 1; x <= 54; x++) st.setTile(x, G + 1, DIRT);   // 低处地面
    st.setTile(sx, G, DIRT);
    st.setSlope(sx, G, 1);

    const p: TestBody = { x: (sx + 3) * TILE + 2, y: (G + 1) * TILE - 42, w: 20, h: 42, vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false };
    walk(p, W, -1, 60);
    // 越过坡顶进入高台,脚底贴高台顶(±4px),不嵌入
    expect(p.x).toBeLessThan(sx * TILE);
    expect(Math.abs(p.y + p.h - G * TILE)).toBeLessThanOrEqual(4);
    expect(embedCount(st, p)).toBe(0);
    expect(p.onGround).toBe(true);
  });
});
