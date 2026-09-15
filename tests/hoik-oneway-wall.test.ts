// ★SW-FX34b Hoik 单向墙（用户实报"不支持单向墙,垂直和水平的单向墙"）。
//  第一部分 = vanilla 1.4.5.7 参考机（Collision.cs:2299-2460 TileCollision /
//  :1796-2036 SlopeCollision 逐字转写,含 :2003 重跑 TileCollision 的 hoik=true
//  缺省实参）——wiki 构图在原版参考机上的轨迹即金标（先定谳再动刀）。
//  第二部分 = 本仓实现同构图复现（修后须与金标同向）。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { World } from '../src/world/World';
import { moveAndCollide } from '../src/physics/TileCollision';
import { TILE_BY_KEY } from '../src/data/tiles';

const TILE = 16;
const DIRT = TILE_BY_KEY['dirt']!;
const PLATFORM = TILE_BY_KEY['platform']!;

// ==================== vanilla 参考机 ====================
type VT = { active: boolean; type: number; slope: number; half: boolean; frameY: number };
const vSolid = (t: number) => t === 1;                       // Main.tileSolid
const vSolidTop = (t: number) => t === 19;                   // Main.tileSolidTop（仅 19 平台;土块 solid 而非 solidTop）
const vPlat = (t: number) => t === 19;                       // TileID.Sets.Platforms

class VSim {
  W = 96; H = 96;
  g: VT[] = [];
  up = false; down = false; stair = false; stairFall = false;

  constructor() { this.g = Array.from({ length: this.W * this.H }, () => ({ active: false, type: 0, slope: 0, half: false, frameY: 0 })); }
  tile(x: number, y: number): VT | undefined {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return undefined;
    return this.g[y * this.W + x];
  }
  set(x: number, y: number, type: number, opts: { slope?: number; half?: boolean } = {}) {
    const t = this.tile(x, y)!;
    t.active = true; t.type = type; t.slope = opts.slope ?? 0; t.half = opts.half ?? false; t.frameY = 0;
  }
  /** Collision.TileCollision（Collision.cs:2299-2460 逐字;hoik 缺省 true=:2299 形参默认值） */
  tileCollision(px: number, py: number, vx: number, vy: number, w: number, h: number,
    fallThrough: boolean, fall2: boolean, gravDir = 1, hoik = true) {
    this.up = false; this.down = false;
    const res = { x: vx, y: vy };
    const vx0 = vx, vy0 = vy;
    const nwx = px + vx, nwy = py + vy;
    const i0 = Math.max(0, Math.min(Math.trunc(px / 16) - 1, this.W - 1));
    const i1 = Math.max(0, Math.min(Math.trunc((px + w) / 16) + 2, this.W - 1));
    const j0 = Math.max(0, Math.min(Math.trunc(py / 16) - 1, this.H - 40));
    const j1 = Math.max(0, Math.min(Math.trunc((py + h) / 16) + 2, this.H - 40));
    let num = -1, num2 = -1, num3 = -1, num4 = -1;
    let num6 = (j1 + 3) * 16;
    for (let i = i0; i < i1; i++) {
      for (let j = j0; j < j1; j++) {
        const t = this.tile(i, j);
        if (!t || !t.active) continue;
        let flag = vSolid(t.type);
        if (vSolidTop(t.type) && t.frameY === 0) flag = true;
        if (!flag) continue;
        let tx = i * 16, ty = j * 16, num7 = 16;
        if (t.half) { ty += 8; num7 -= 8; }
        if (!(nwx + w > tx) || !(nwx < tx + 16) || !(nwy + h > ty) || !(nwy < ty + num7)) continue;
        let flag2 = false, flag3 = false;
        if (t.slope > 2) {
          if (t.slope === 3 && py + Math.abs(vx) >= ty && px >= tx) flag3 = true;
          if (t.slope === 4 && py + Math.abs(vx) >= ty && px + w <= tx + 16) flag3 = true;
        } else if (t.slope > 0) {
          flag2 = true;
          if (t.slope === 1 && py + h - Math.abs(vx) <= ty + num7 && px >= tx) flag3 = true;
          if (t.slope === 2 && py + h - Math.abs(vx) <= ty + num7 && px + w <= tx + 16) flag3 = true;
        }
        if (flag3) continue;
        if (py + h <= ty) {
          this.down = true;
          if ((!(vSolidTop(t.type) && fallThrough) || !((vy <= 1) || fall2)) && num6 > ty) {
            num3 = i; num4 = j;
            if (num7 < 16) num4++;
            if (num3 !== num && !flag2) {
              res.y = ty - (py + h) + (gravDir === -1 ? -0.01 : 0);
              num6 = ty;
            }
          }
        } else if (px + w <= tx && !vSolidTop(t.type)) {
          // :2412 hoik 门（tile[i-1,j] null → new Tile() → slope 0 → 不豁免）
          const nl = this.tile(i - 1, j);
          if (!hoik || i < 1 || !(nl && (nl.slope === 2 || nl.slope === 4))) {
            num = i; num2 = j;
            if (num2 !== num4) res.x = tx - (px + w);
            if (num3 === num) res.y = vy0;
          }
        } else if (px >= tx + 16 && !vSolidTop(t.type)) {
          // :2432 hoik 门
          const nr = this.tile(i + 1, j);
          if (!hoik || !(nr && (nr.slope === 1 || nr.slope === 3))) {
            num = i; num2 = j;
            if (num2 !== num4) res.x = tx + 16 - px;
            if (num3 === num) res.y = vy0;
          }
        } else if (py >= ty + num7 && !vSolidTop(t.type)) {
          this.up = true;
          num3 = i; num4 = j;
          res.y = ty + num7 - py + (gravDir === 1 ? 0.01 : 0);
          if (num4 === num2) res.x = vx0;
        }
      }
    }
    return res;
  }
  /** Collision.SlopeCollision（Collision.cs:1796-2036 逐字;:2003 重跑 TileCollision 缺省 hoik=true） */
  slopeCollision(px: number, py: number, vx: number, vy: number, w: number, h: number, gravity = 0, fall = false) {
    this.stair = false; this.stairFall = false;
    let y = py, y2 = py;
    const vec = { x: px, y: py };
    let ovx = vx, ovy = vy;
    let b1 = false, b2 = false, b3 = false, b4 = false;
    const iA = Math.max(0, Math.trunc(px / 16) - 1);
    const iB = Math.max(0, Math.min(Math.trunc((px + w) / 16) + 2, this.W - 1));
    const jA = Math.max(0, Math.trunc(py / 16) - 1);
    const jB = Math.max(0, Math.min(Math.trunc((py + h) / 16) + 2, this.H - 40));
    for (let i = iA; i < iB; i++) {
      for (let j = jA; j < jB; j++) {
        const t = this.tile(i, j);
        if (!t || !t.active) continue;
        let flag = vSolid(t.type);
        if (vSolidTop(t.type) && t.frameY === 0) flag = true;
        if (!flag) continue;
        let tx = i * 16, ty = j * 16, hh = 16;
        if (t.half) { ty += 8; hh -= 8; }
        if (!(px + w > tx) || !(px < tx + 16) || !(py + h > ty) || !(py < ty + hh)) continue;
        let flag2 = true;
        if (vPlat(t.type)) {
          if (vy < 0) flag2 = false;
          if (py + h < j * 16 || py + h - (1 + Math.abs(vx)) > j * 16 + 16) flag2 = false;
          if (((t.slope === 1 && vx >= 0) || (t.slope === 2 && vx <= 0)) && Math.trunc((py + h) / 16) - 1 === j) flag2 = false;
        }
        if (!flag2) continue;
        let flag3 = false;
        if (fall && vPlat(t.type)) flag3 = true;
        const num3 = t.slope;
        tx = i * 16; ty = j * 16;
        if (!(px + w > tx) || !(px < tx + 16) || !(py + h > ty) || !(py < ty + 16)) continue;
        let num4 = 0;
        if (num3 === 3 || num3 === 4) {
          if (num3 === 3) num4 = px - tx;
          if (num3 === 4) num4 = tx + 16 - (px + w);
          if (num4 >= 0) {
            if (py <= ty + 16 - num4) {
              const num5 = ty + 16 - py - num4;
              if (py + num5 > y2) {
                vec.y = py + num5; y2 = vec.y;
                if (ovy < 0.0101) ovy = 0.0101;
                if (num3 === 3) b3 = true; else b4 = true;
              }
            }
          } else if (py > ty) {
            const num6 = ty + 16;
            if (vec.y < num6) { vec.y = num6; if (ovy < 0.0101) ovy = 0.0101; }
          }
        }
        if (num3 !== 1 && num3 !== 2) continue;
        if (num3 === 1) num4 = px - tx;
        if (num3 === 2) num4 = tx + 16 - (px + w);
        if (num4 >= 0) {
          if (!(py + h >= ty + num4)) continue;
          const num7 = ty - (py + h) + num4;
          if (!(py + num7 < y)) continue;
          if (flag3) { this.stairFall = true; continue; }
          this.stair = vPlat(t.type);
          vec.y = py + num7; y = vec.y;
          if (ovy > 0) ovy = 0;
          if (num3 === 1) b1 = true; else b2 = true;
          continue;
        }
        if (vPlat(t.type) && !(py + h - 4 - Math.abs(vx) <= ty)) {
          if (flag3) this.stairFall = true;
          continue;
        }
        const num8 = ty - h;
        if (!(vec.y > num8)) continue;
        if (flag3) { this.stairFall = true; continue; }
        this.stair = vPlat(t.type);
        vec.y = num8;
        if (ovy > 0) ovy = 0;
      }
    }
    const dispX = vec.x - px, dispY = vec.y - py;
    const v5 = this.tileCollision(px, py, dispX, dispY, w, h, false, false, 1, true);
    if (v5.y > dispY) {
      const num9 = dispY - v5.y;
      vec.y = py + v5.y;
      if (b1) vec.x = px - num9;
      if (b2) vec.x = px + num9;
      ovx = 0; ovy = 0; this.up = false;
    } else if (v5.y < dispY) {
      const num10 = v5.y - dispY;
      vec.y = py + v5.y;
      if (b3) vec.x = px - num10;
      if (b4) vec.x = px + num10;
      ovx = 0; ovy = 0;
    }
    return { x: vec.x, y: vec.y, vx: ovx, vy: ovy };
  }
  /** 玩家慢速拍（Player.cs:28251-28275 StepDown/StepUp 略 + :28408 DryCollision 慢速尾
   *  + :28426 SlopingCollision + :28467 Collision.up 收尾;jumpFrames=20 持跳 vy=-5.1） */
  player(s: { x: number; y: number; vx: number; vy: number; jumpFrames: number },
    inp: { left?: boolean; right?: boolean; down?: boolean; jump?: boolean }, ticks: number) {
    for (let t = 0; t < ticks; t++) {
      if (inp.jump && s.jumpFrames > 0) { s.vy = -5.1; s.jumpFrames--; }
      else s.vy = Math.min(s.vy + 0.4, 10);
      s.vx = inp.right ? 3 : inp.left ? -3 : 0;
      const fallThrough = !!inp.down;
      const r = this.tileCollision(s.x, s.y, s.vx, s.vy, 20, 42, fallThrough, false, 1, true);
      s.x += r.x; s.y += r.y; s.vx = r.x; s.vy = r.y;
      const v4 = this.slopeCollision(s.x, s.y, s.vx, s.vy, 20, 42, 0.4, fallThrough);
      s.x = v4.x; s.y = v4.y; s.vx = v4.vx; s.vy = v4.vy;
      if (this.up) s.vy = 0.01;
    }
  }
}

// ==================== 构图 ====================
/** 水平单向墙（wiki:楼梯平台列贴物块一面）：
 *  地面 row32;墙 x=36 rows29-31;x=35 楼梯平台列 slope2（右邻实心自动 num=2）。 */
function buildHoriz(V: VSim, slope = 2) {
  for (let x = 20; x <= 56; x++) V.set(x, 32, 1);
  for (let y = 29; y <= 31; y++) V.set(36, y, 1);
  for (let y = 29; y <= 31; y++) V.set(35, y, 19, { slope });
}
const spawnLeft = { x: 33 * TILE, y: 32 * TILE - 42, vx: 0, vy: 0, jumpFrames: 20 };
const spawnRight = { x: 38 * TILE, y: 32 * TILE - 42, vx: 0, vy: 0, jumpFrames: 20 };

describe('vanilla 参考机：水平单向墙（wiki 构图）', () => {
  it('按住下+右行：穿墙到另一侧', () => {
    const V = new VSim(); buildHoriz(V);
    const s = { ...spawnLeft };
    V.player(s, { right: true, down: true }, 300);
    expect(s.x).toBeGreaterThan(37 * TILE);
  });
  it('按住下+左行（反侧进入）：被墙挡住', () => {
    const V = new VSim(); buildHoriz(V);
    const s = { ...spawnRight };
    V.player(s, { left: true, down: true }, 300);
    expect(s.x).toBeGreaterThanOrEqual(37 * TILE - 0.01);
  });
  it('不按下+右行：墙高于玩家一格→沿楼梯升起越过（wiki"自动升起一格"）', () => {
    const V = new VSim(); buildHoriz(V);
    const s = { ...spawnLeft };
    V.player(s, { right: true }, 300);
    expect(s.x).toBeGreaterThan(37 * TILE);
  });
});

describe('vanilla 参考机：垂直单向墙（wiki 构图,封闭房间内天花板探索）', () => {
  // 房间:地板 row34(x24..52),天花板 rows28-30(x24..52),侧墙 x24/x52 rows28-33。
  //  玩家出生地板中央,跳跃 150t。PASS = 终态脚底 ≤ 28*16+1(天花板上方) 且 x 在室内。
  const TOP = 28 * TILE;
  function attempt(name: string, build: (V: VSim) => void, px: number, inp: { jump?: boolean; right?: boolean; left?: boolean; down?: boolean }) {
    const V = new VSim(); build(V);
    const s = { x: px, y: 34 * TILE - 42, vx: 0, vy: 0, jumpFrames: 20 };
    V.player(s, inp, 150);
    const feet = s.y + 42;
    const ok = feet <= TOP + 1 && s.x > 25 * TILE && s.x < 51 * TILE;
    console.log(`[${name}] feet=${feet.toFixed(1)} x=${s.x.toFixed(1)} ${ok ? 'PASS↑' : 'fail'}`);
    return ok;
  }
  function room(V: VSim) {
    for (let x = 24; x <= 52; x++) V.set(x, 34, 1);
    for (let y = 28; y <= 30; y++) for (let x = 24; x <= 52; x++) V.set(x, y, 1);
    for (let y = 28; y <= 33; y++) { V.set(24, y, 1); V.set(52, y, 1); }
  }
  it('候选扫描', () => {
    const cx = 36 * TILE + 2;
    attempt('J 对照:无改动 居中跳', room, cx, { jump: true });
    attempt('K1 底部平台替底块(36,30) 居中跳', (V) => { room(V); V.set(36, 30, 19, { half: true }); }, cx, { jump: true });
    attempt('K2 底部平台替整列(36,28-30) 居中跳', (V) => { room(V); for (let y = 28; y <= 30; y++) V.set(36, y, 19, { half: true }); }, cx, { jump: true });
    attempt('K3 底部平台垫(36,31) 居中跳', (V) => { room(V); V.set(36, 31, 19, { half: true }); }, cx, { jump: true });
    attempt('K4 楼梯2替底块(36,30) 居中跳', (V) => { room(V); V.set(36, 30, 19, { slope: 2 }); }, cx, { jump: true });
    attempt('K5 底部平台替底块+按右跳', (V) => { room(V); V.set(36, 30, 19, { half: true }); }, 34 * TILE, { jump: true, right: true });
    attempt('K6 楼梯2列(36,28-30) 按右跳', (V) => { room(V); for (let y = 28; y <= 30; y++) V.set(36, y, 19, { slope: 2 }); }, 34 * TILE, { jump: true, right: true });
    attempt('K7 底部平台替底块(36,30)+垫(36,31) 居中跳', (V) => { room(V); V.set(36, 30, 19, { half: true }); V.set(36, 31, 19, { half: true }); }, cx, { jump: true });
    attempt('K8 底部平台替底块(36,30) 按下跳', (V) => { room(V); V.set(36, 30, 19, { half: true }); }, cx, { jump: true, down: true });
    attempt('K9 天花坡3替底块(36,30) 居中跳', (V) => { room(V); V.set(36, 30, 1, { slope: 3 }); }, cx, { jump: true });
    attempt('K10 天花坡4替底块(36,30) 居中跳', (V) => { room(V); V.set(36, 30, 1, { slope: 4 }); }, cx, { jump: true });
  });

  it('平台柱井扫描(2/3 宽,底砖/全砖)', () => {
    const c2 = 36 * TILE + 6;   // 2宽井[576,608]内居中:盒[582,602]
    const c3 = 36 * TILE + 8;   // 3宽井[560,608]内居中:盒[574,594]
    attempt('L1 2宽平台井(36-37,28-30全平台) 居中跳', (V) => { room(V); for (let y = 28; y <= 30; y++) { V.set(36, y, 19); V.set(37, y, 19); } }, c2, { jump: true });
    attempt('L2 2宽井底砖(36-37,30半砖)上空 居中跳', (V) => { room(V); V.set(36, 30, 19, { half: true }); V.set(37, 30, 19, { half: true }); }, c2, { jump: true });
    attempt('L3 2宽全空井 居中跳(对照)', (V) => { room(V); V.set(36, 30, 0); V.set(37, 30, 0); V.set(36, 29, 0); V.set(37, 29, 0); V.set(36, 28, 0); V.set(37, 28, 0); }, c2, { jump: true });
    attempt('L4 3宽平台柱(35-37,28-30) 居中跳', (V) => { room(V); for (let y = 28; y <= 30; y++) for (let x = 35; x <= 37; x++) V.set(x, y, 19); }, c3, { jump: true });
    attempt('L5 1宽平台井(36,28-30) 居中跳(对照,预期侧夹钳)', (V) => { room(V); for (let y = 28; y <= 30; y++) V.set(36, y, 19); }, 36 * TILE + 2, { jump: true });
    attempt('L6 2宽井:底半砖+中半砖+顶空 居中跳', (V) => { room(V); V.set(36, 30, 19, { half: true }); V.set(37, 30, 19, { half: true }); V.set(36, 29, 19, { half: true }); V.set(37, 29, 19, { half: true }); V.set(36, 28, 0); V.set(37, 28, 0); }, c2, { jump: true });
  });

  it('L1 上穿后下落被挡(单向性)', () => {
    const V = new VSim();
    room(V);
    for (let y = 28; y <= 30; y++) { V.set(36, y, 19); V.set(37, y, 19); }
    // 从天花板顶上方井口落入:应被井内平台接住(脚底 ≥ 28*16),不得落到室内地板(544)
    const s = { x: 36 * TILE + 6, y: 26 * TILE - 42, vx: 0, vy: 0, jumpFrames: 0 };
    V.player(s, {}, 150);
    console.log(`[下落] feet=${(s.y + 42).toFixed(1)} x=${s.x.toFixed(1)}`);
    expect(s.y + 42).toBeLessThanOrEqual(31 * TILE);   // 被井内平台接住(≤井底),远高于地板 544
    expect(s.y + 42).toBeGreaterThanOrEqual(28 * TILE - 1);
  });
  it('V-min wiki 最简竖直单向墙:2宽井+仅井底一块底部平台(half)——上穿+再跳越出', () => {
    const V = new VSim();
    room(V);
    V.set(36, 30, 19, { half: true }); V.set(37, 30, 19, { half: true });
    V.set(36, 29, 0); V.set(37, 29, 0); V.set(36, 28, 0); V.set(37, 28, 0);
    const s = { x: 36 * TILE + 6, y: 34 * TILE - 42, vx: 0, vy: 0, jumpFrames: 20 };
    V.player(s, { jump: true }, 150);
    const feet1 = s.y + 42;
    console.log(`[V-min 首跳] feet=${feet1.toFixed(1)} (被井底底部平台接住=488)`);
    expect(feet1).toBeCloseTo(30 * TILE + 8, 0);        // 接在底部平台面(井内),非室内地板
    s.jumpFrames = 20;                                   // 落地回满跳(原版落地 reset jump)
    V.player(s, { jump: true, right: true }, 80);
    const feet2 = s.y + 42;
    console.log(`[V-min 再跳+右] feet=${feet2.toFixed(1)} x=${s.x.toFixed(1)} (越出天花板顶=448)`);
    expect(feet2).toBeLessThanOrEqual(TOP + 1);   // 越出:升到天花板顶高度以上(随后落顶/走人)
  });
});
function makeWorld(w = 96, h = 96): World {
  return { store: new TileStore(w, h), w, h } as unknown as World;
}
interface RB { x: number; y: number; w: number; h: number; vx: number; vy: number;
  onGround: boolean; hitWall: boolean; hitHead: boolean; collideY?: boolean;
  stepUp?: boolean; stepUpHolds?: boolean; dropThrough?: boolean; hoik?: boolean;
  embedTicks?: number; jumpFrames?: number }

/** 本仓玩家拍:重力/持跳与 vanilla 参考机同参,碰撞走 moveAndCollide */
function repoPlayer(b: RB, world: World, inp: { left?: boolean; right?: boolean; down?: boolean; jump?: boolean }, ticks: number) {
  b.jumpFrames = b.jumpFrames ?? 20;
  for (let t = 0; t < ticks; t++) {
    if (inp.jump && b.jumpFrames > 0) { b.vy = -5.1; b.jumpFrames--; }
    else b.vy = Math.min(b.vy + 0.4, 10);
    b.vx = inp.right ? 3 : inp.left ? -3 : 0;
    b.dropThrough = !!inp.down;
    moveAndCollide(b as never, world, b.vx, b.vy);
  }
}
function repoRoom(st: TileStore) {
  for (let x = 24; x <= 52; x++) st.setTile(x, 34, DIRT);
  for (let y = 28; y <= 30; y++) for (let x = 24; x <= 52; x++) st.setTile(x, y, DIRT);
  for (let y = 28; y <= 33; y++) { st.setTile(24, y, DIRT); st.setTile(52, y, DIRT); }
}
const REPO_TOP = 28 * TILE;

describe('本仓：水平单向墙（wiki 构图,须与 vanilla 参考机同向）', () => {
  function buildHorizRepo(st: TileStore, slope = 2) {
    for (let x = 20; x <= 56; x++) st.setTile(x, 32, DIRT);
    for (let y = 29; y <= 31; y++) st.setTile(36, y, DIRT);
    for (let y = 29; y <= 31; y++) { st.setTile(35, y, PLATFORM); st.setSlope(35, y, slope); }
  }
  const mkBody = (x: number, y: number, hoik: boolean): RB => ({
    x, y, w: 20, h: 42, vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false,
    stepUp: true, stepUpHolds: true, hoik,
  });
  it('按住下+右行:穿墙到另一侧(vanilla Player.cs:23791 hoik=!flag=true)', () => {
    const W = makeWorld(); buildHorizRepo(W.store);
    const b = mkBody(33 * TILE, 32 * TILE - 42, true);
    repoPlayer(b, W, { right: true, down: true }, 300);
    expect(b.x).toBeGreaterThan(37 * TILE);
  });
  it('按住下+左行(反侧进入):被墙挡住', () => {
    const W = makeWorld(); buildHorizRepo(W.store);
    const b = mkBody(38 * TILE, 32 * TILE - 42, true);
    repoPlayer(b, W, { left: true, down: true }, 300);
    expect(b.x).toBeGreaterThanOrEqual(37 * TILE - 0.01);
  });
  it('不按下+右行:沿楼梯升起越过', () => {
    const W = makeWorld(); buildHorizRepo(W.store);
    const b = mkBody(33 * TILE, 32 * TILE - 42, true);
    repoPlayer(b, W, { right: true }, 300);
    expect(b.x).toBeGreaterThan(37 * TILE);
  });
});

describe('本仓：垂直单向墙（wiki 构图,2宽平台井）', () => {
  it('居中跳:上穿天花板到上方', () => {
    const W = makeWorld(); repoRoom(W.store);
    for (let y = 28; y <= 30; y++) { W.store.setTile(36, y, PLATFORM); W.store.setTile(37, y, PLATFORM); }
    const b: RB = { x: 36 * TILE + 6, y: 34 * TILE - 42, w: 20, h: 42, vx: 0, vy: 0,
      onGround: false, hitWall: false, hitHead: false, stepUp: true, stepUpHolds: true };
    repoPlayer(b, W, { jump: true }, 150);
    expect(b.y + 42).toBeLessThanOrEqual(REPO_TOP + 1);
  });
  it('井口下落:被平台接住(单向性)', () => {
    const W = makeWorld(); repoRoom(W.store);
    for (let y = 28; y <= 30; y++) { W.store.setTile(36, y, PLATFORM); W.store.setTile(37, y, PLATFORM); }
    const b: RB = { x: 36 * TILE + 6, y: 26 * TILE - 42, w: 20, h: 42, vx: 0, vy: 0,
      onGround: false, hitWall: false, hitHead: false, stepUp: true, stepUpHolds: true };
    repoPlayer(b, W, {}, 150);
    expect(b.y + 42).toBeLessThanOrEqual(31 * TILE);
    expect(b.y + 42).toBeGreaterThanOrEqual(REPO_TOP - 1);
  });
  it('V-min wiki 最简竖直单向墙:2宽井+井底一块底部平台(半砖)——首跳接住/再跳越出', () => {
    const W = makeWorld(); repoRoom(W.store);
    W.store.setTile(36, 30, PLATFORM); W.store.setTile(37, 30, PLATFORM);
    W.store.setHalfBrick(36, 30, true); W.store.setHalfBrick(37, 30, true);
    W.store.setTile(36, 29, 0); W.store.setTile(37, 29, 0);
    W.store.setTile(36, 28, 0); W.store.setTile(37, 28, 0);
    const b: RB = { x: 36 * TILE + 6, y: 34 * TILE - 42, w: 20, h: 42, vx: 0, vy: 0,
      onGround: false, hitWall: false, hitHead: false, stepUp: true, stepUpHolds: true, jumpFrames: 20 };
    repoPlayer(b, W, { jump: true }, 150);
    expect(b.y + 42).toBeCloseTo(30 * TILE + 8, 0);   // 半砖平台面=格顶+8(:2350-2354),非 480
    b.jumpFrames = 20;
    repoPlayer(b, W, { jump: true, right: true }, 80);
    expect(b.y + 42).toBeLessThanOrEqual(REPO_TOP + 1);  // 越出天花板顶
  });
});

// ★RB29/FX34b 2026-09-15：hoik 穿行期 unembedPass 让位（转正断言）。
//  取证史:红队临时件 tests/_tmp-rb29-hoik-transit.test.ts（已删）以 wet 消融定谳
//  ——b.wet=true 跳过 unembedPass 后末态与 vanilla 参考机逐像素一致 ⇒ 穿行期
//  +16px/拍抬升源 = unembedPass topEmbedded 2t 快速支（本仓自愈发明,vanilla 无）。
//  修 = unembedPass 头部 `if (b.hoik) return` 整段让位（TileCollision.ts,RB29/FX34b
//  注）。本组断言锁死修后行为:dry 正常玩家（hoik=true,无 wet）即 vanilla 贴地穿越;
//  2 厚墙 = vanilla 同款 blocked（修前 unembed 连锁 16→32→48px 越墙逃逸）。
describe('本仓：hoik 穿行期 unembed 让位（RB29 转正断言）', () => {
  function buildTransit(st: TileStore, thick: number) {
    for (let x = 20; x <= 56; x++) st.setTile(x, 32, DIRT);
    for (let y = 29; y <= 31; y++) for (let k = 0; k < thick; k++) st.setTile(36 + k, y, DIRT);
    for (let y = 29; y <= 31; y++) { st.setTile(35, y, PLATFORM); st.setSlope(35, y, 2); }
  }
  /** 与取证件同参逐 tick 驱动;统计穿行窗（x∈[墙左缘−20, 越墙点)）内 feet 抬升帧 */
  function transit(thick: number, ticks = 200) {
    const W = makeWorld(); buildTransit(W.store, thick);
    const b: RB = { x: 33 * TILE, y: 32 * TILE - 42, w: 20, h: 42, vx: 0, vy: 0,
      onGround: false, hitWall: false, hitHead: false, stepUp: true, stepUpHolds: false,
      dropThrough: true, hoik: true };
    const FLOOR = 32 * TILE;
    const endX = (36 + thick) * TILE + 24;
    let liftFrames = 0, maxLift = 0, crossed = false;
    for (let t = 0; t < ticks; t++) {
      b.vy = Math.min(b.vy + 0.4, 10);
      b.vx = 3;
      moveAndCollide(b as never, W, b.vx, b.vy);
      if (b.x < endX && b.x >= 36 * TILE - 20) {
        const lift = FLOOR - (b.y + b.h);
        if (lift > 10) { liftFrames++; maxLift = Math.max(maxLift, lift); }
      }
      if (b.x > endX) { crossed = true; break; }
    }
    return { crossed, x: b.x, feet: b.y + b.h, liftFrames, maxLift };
  }
  it('1 厚墙水平穿行:贴地 0 抬升帧（修前 ~11 帧 +16px/拍站墙内块顶）', () => {
    const r = transit(1);
    expect(r.crossed).toBe(true);      // 正控制:hoik 穿越通道不被本刀破坏
    expect(r.liftFrames).toBe(0);      // 穿行窗内零抬升（feet ≥ 地线−10px）
    expect(r.maxLift).toBe(0);
  });
  it('2 厚墙:vanilla 同款 blocked（嵌第一列内不可越）且 0 抬升（修前 16→32→48 越墙逃逸）', () => {
    const r = transit(2);
    expect(r.x).toBeLessThanOrEqual(38 * TILE);   // 不得越出墙右缘(vanilla 参考机 crossed=false)
    expect(r.liftFrames).toBe(0);
    expect(r.maxLift).toBe(0);
  });
});
