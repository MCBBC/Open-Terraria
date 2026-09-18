// ★SW-FX34c 2026-09-18 弹幕 hoik 单向墙跟随语义（用户实报"玩家能过单向墙、
//  玩家发射的武器弹幕过不了"）。
//  定谳（1456/1457/1458 三树同相）：
//   · Collision.TileCollision 第 10 参 hoik 缺省【true】（Collision.cs:2299）。
//   · Projectile.HandleMovement（Projectile.cs:17578）全路径 hoik=true：高速子步进
//     显式 bool hoik=true（:17822-23→:17852 传参）；慢速干路（:17960）/湿路三支
//     （:17726/:17740/:17754）/aiStyle10 四支（:17705-18）不传参吃缺省 true。
//     无 owner 豁免（friendly/hostile 同相）。⇒ 原版弹幕【能】过 Hoik 单向墙。
//   · 消费面 Collision.cs:2412（右行查身后格 (i-1,j) slope 2/4）/:2432（左行
//     (i+1,j) slope 1/3）；跨格态 :2437-2456 各支前提以移前盒判定全假=无推离；
//     velocity 不变 → flag 不置位（:18008）→ 通用杀口（:19969-19973
//     `else { position += velocity; Kill(); }`）不可达。
//   · 本仓缺口：Arrow 单点中心碰撞杀口无 hoik 门（主实报面）+ moveAndCollide 域
//     弹幕 body hoik 缺省 falsy。修：Arrow 类 hoik=true+杀口包裹门；弹幕类/
//     字面量 body hoik=true；跨格态收窄（hoikAcrossFree 玩家原样、弹幕坡邻配对门
//     ——保 fx 时代"止步"穿门容器,详 Body.hoikAcrossFree 注）。
//  第一部分 = vanilla 参考机 gold（与 hoik-oneway-wall.test.ts VSim 同源转写,本机
//   只取 TileCollision 面——弹幕 gold 的拦截面就是 X 撞墙支）。第二部分 = 本仓
//   Arrow 面 / moveAndCollide 面。变异判别力：M1 Arrow 坡对翻转、M2 跨格收窄门
//   摘除、M3 收窄放宽为无条件 → 各自爆红（见文内注）。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { World } from '../src/world/World';
import { moveAndCollide } from '../src/physics/TileCollision';
import { TILE_BY_KEY } from '../src/data/tiles';
import { Arrow } from '../src/entities/Arrow';
import type { GameHooks } from '../src/entities/types';

const TILE = 16;
const DIRT = TILE_BY_KEY['dirt']!;
const PLATFORM = TILE_BY_KEY['platform']!;

// ==================== vanilla 参考机（Collision.cs:2299-2460 逐字转写） ====================
type VT = { active: boolean; type: number; slope: number; half: boolean; frameY: number };
const vSolid = (t: number) => t === 1;                       // Main.tileSolid
const vSolidTop = (t: number) => t === 19;                   // Main.tileSolidTop（19 平台）

class VSim {
  W = 96; H = 96;
  g: VT[] = [];
  constructor() { this.g = Array.from({ length: this.W * this.H }, () => ({ active: false, type: 0, slope: 0, half: false, frameY: 0 })); }
  tile(x: number, y: number): VT | undefined {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return undefined;
    return this.g[y * this.W + x];
  }
  set(x: number, y: number, type: number, opts: { slope?: number; half?: boolean } = {}) {
    const t = this.tile(x, y)!;
    t.active = true; t.type = type; t.slope = opts.slope ?? 0; t.half = opts.half ?? false; t.frameY = 0;
  }
  /** Collision.TileCollision（:2299-2460 逐字;hoik 缺省 true=:2299 形参默认值;
   *  hoik 形参显式可调=变异判别面 M0） */
  tileCollision(px: number, py: number, vx: number, vy: number, w: number, h: number,
    fallThrough: boolean, fall2: boolean, gravDir = 1, hoik = true) {
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
          if ((!(vSolidTop(t.type) && fallThrough) || !((vy <= 1) || fall2)) && num6 > ty) {
            num3 = i; num4 = j;
            if (num7 < 16) num4++;
            if (num3 !== num && !flag2) {
              res.y = ty - (py + h) + (gravDir === -1 ? -0.01 : 0);
              num6 = ty;
            }
          }
        } else if (px + w <= tx && !vSolidTop(t.type)) {
          // :2412 hoik 门（右行,身后格 (i-1,j) slope 2/4）
          const nl = this.tile(i - 1, j);
          if (!hoik || i < 1 || !(nl && (nl.slope === 2 || nl.slope === 4))) {
            num = i; num2 = j;
            if (num2 !== num4) res.x = tx - (px + w);
            if (num3 === num) res.y = vy0;
          }
        } else if (px >= tx + 16 && !vSolidTop(t.type)) {
          // :2432 hoik 门（左行,身后格 (i+1,j) slope 1/3）
          const nr = this.tile(i + 1, j);
          if (!hoik || !(nr && (nr.slope === 1 || nr.slope === 3))) {
            num = i; num2 = j;
            if (num2 !== num4) res.x = tx + 16 - px;
            if (num3 === num) res.y = vy0;
          }
        } else if (py >= ty + num7 && !vSolidTop(t.type)) {
          num3 = i; num4 = j;
          res.y = ty + num7 - py + (gravDir === 1 ? 0.01 : 0);
          if (num4 === num2) res.x = vx0;
        }
      }
    }
    return res;
  }
}

/** wiki 水平单向墙构图（同 hoik-oneway-wall.test.ts）：地面 row32;墙 x=36 rows29-31;
 *  x=35 齿列=楼梯平台 slope2（tileSolidTop 非实心——弹幕中心模型过齿列无阻） */
function buildHorizV(V: VSim, slope = 2) {
  for (let x = 20; x <= 56; x++) V.set(x, 32, 1);
  for (let y = 29; y <= 31; y++) V.set(36, y, 1);
  for (let y = 29; y <= 31; y++) V.set(35, y, 19, { slope });
}
/** 驱动小盒纯 TileCollision（无重力弹;gold 的拦截面=X 撞墙支） */
function flyV(V: VSim, x: number, y: number, vx: number, vy: number, w: number, h: number, ticks: number, hoik = true) {
  let px = x, py = y;
  for (let t = 0; t < ticks; t++) {
    const r = V.tileCollision(px, py, vx, vy, w, h, false, false, 1, hoik);
    px += r.x; py += r.y;
    vx = r.x; vy = r.y;
  }
  return { x: px, y: py, vx, vy };
}

describe('vanilla 参考机：弹幕过 Hoik 单向墙（Projectile 全路径 hoik=true 的 gold）', () => {
  it('10×10 弹盒右行（gap row30）：穿墙到另一侧（hoik 缺省 true=:2299）', () => {
    const V = new VSim(); buildHorizV(V);
    const r = flyV(V, 34 * TILE, 30 * TILE + 3, 6, 0, 10, 10, 60);
    expect(r.x).toBeGreaterThan(37 * TILE);          // 越过墙右缘 592
    expect(r.vx).toBe(6);                            // 全程速度未被截断=无碰撞事件（:18008 flag 链）
  });
  it('10×10 弹盒左行（反侧进入）：被墙挡住（单向性,身后格非齿不豁免）', () => {
    const V = new VSim(); buildHorizV(V);
    const r = flyV(V, 38 * TILE, 30 * TILE + 3, -6, 0, 10, 10, 60);
    expect(r.x).toBeGreaterThanOrEqual(37 * TILE - 0.01);   // 恒在墙右缘外侧
  });
  it('同构图 hoik=false 显式传参：右行也被挡（形参判别力 M0——缺口即"弹幕侧等效关"）', () => {
    const V = new VSim(); buildHorizV(V);
    const r = flyV(V, 34 * TILE, 30 * TILE + 3, 6, 0, 10, 10, 60, false);
    expect(r.x).toBeLessThanOrEqual(36 * TILE);      // 钳在墙左缘
  });
  it('★跨格态原版无推离旁证（fx 时代"止步"容器=刻意分歧的定谳记录）:38×38 盒出生即跨入 1 厚墙柱 → 原版整墙相穿', () => {
    const V = new VSim();
    for (let x = 20; x <= 56; x++) V.set(x, 32, 1);
    for (let y = 29; y <= 31; y++) V.set(40, y, 1);   // 无齿裸墙 x=40
    // 盒右缘越墙柱左缘内 9px（=荆棘旋刃 38×38 盒心落玩家中心贴脸对门的出膛几何）;
    // y=466 → 盒跨 rows29-31,不触地面行（row32）
    const r = flyV(V, 40 * TILE - 29, 466, 5, 0, 38, 38, 40);
    expect(r.x).toBeGreaterThan(41 * TILE);          // 原版相穿（Velocity 全程未改=无 Kill）
  });
});

// ==================== 本仓 ====================
function makeWorld(w = 96, h = 96): World {
  return { store: new TileStore(w, h), w, h } as unknown as World;
}
function makeGame(world: World): GameHooks {
  return {
    world,
    player: null,
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
  } as unknown as GameHooks;
}
function buildHorizRepo(st: TileStore, slope = 2) {
  for (let x = 20; x <= 56; x++) st.setTile(x, 32, DIRT);
  for (let y = 29; y <= 31; y++) st.setTile(36, y, DIRT);
  for (let y = 29; y <= 31; y++) { st.setTile(35, y, PLATFORM); st.setSlope(35, y, slope); }
}

describe('本仓 Arrow 单点中心碰撞面（主实报面：玩家发射的武器弹幕）', () => {
  it('木箭右行穿 wiki 单向墙：存活且越过墙右缘', () => {
    const world = makeWorld(); buildHorizRepo(world.store);
    const game = makeGame(world);
    const arrow = new Arrow(34 * TILE, 30 * TILE + 3, 6, 0, 10, 0, 1, { grav: 0, life: 300, pierce: 1 });
    for (let i = 0; i < 60 && !arrow.dead; i++) arrow.fixedUpdate(1 / 60, game);
    expect(arrow.dead).toBe(false);
    expect(arrow.x).toBeGreaterThan(37 * TILE);      // 10×10 盒心越过 592
  });
  it('木箭左行（反侧进入）：被墙杀（单向性）', () => {
    const world = makeWorld(); buildHorizRepo(world.store);
    const game = makeGame(world);
    const arrow = new Arrow(38 * TILE, 30 * TILE + 3, -6, 0, 10, 0, 1, { grav: 0, life: 300, pierce: 1 });
    for (let i = 0; i < 60 && !arrow.dead; i++) arrow.fixedUpdate(1 / 60, game);
    expect(arrow.dead).toBe(true);                   // 身后格 (37,30) 无齿 → 通用杀口
    // 单点中心模型:杀在中心入墙格拍（中心 ∈ [576,592) 墙柱内）——不得贯穿到墙左缘之外
    expect(arrow.cx).toBeGreaterThanOrEqual(36 * TILE);
  });
  it('无齿裸墙（对照）：右行同样被杀——豁免必须以坡邻配对为前提', () => {
    const world = makeWorld();
    for (let x = 20; x <= 56; x++) world.store.setTile(x, 32, DIRT);
    for (let y = 29; y <= 31; y++) world.store.setTile(36, y, DIRT);
    const game = makeGame(world);
    const arrow = new Arrow(34 * TILE, 30 * TILE + 3, 6, 0, 10, 0, 1, { grav: 0, life: 300, pierce: 1 });
    for (let i = 0; i < 60 && !arrow.dead; i++) arrow.fixedUpdate(1 / 60, game);
    expect(arrow.dead).toBe(true);
    expect(arrow.x).toBeLessThanOrEqual(36 * TILE);  // 杀在墙左缘（中心格入墙即杀面）
  });
});

interface RB {
  x: number; y: number; w: number; h: number; vx: number; vy: number;
  onGround: boolean; hitWall: boolean; hitHead: boolean; collideY?: boolean;
  dropThrough?: boolean;
  hoik?: boolean; hoikAcrossFree?: boolean;
}

describe('本仓 moveAndCollide 域弹幕（WeaponProj/MinionProj 等全部族共享面）', () => {
  // ★判别几何注：弹幕 body 全带 dropThrough:true（WeaponProj 字面量实形）——
  //  dropThrough 关闭平台楼梯骑乘（slope 辅助对平台列不吸附,实证 y 恒定）,
  //  身体以恒定行贴齿列到达墙面 → crossing 与否【只】由 hoik 门裁决。
  //  （无 dropThrough 的行走体会被楼梯骑乘抬升越过 3 行墙=fx34b 玩家"不按下"
  //  语义,与 hoik 无关,不作判别面。）
  it('hoik=true 弹幕体右行穿 wiki 单向墙（入口门+跨格收窄支全程放行,y 恒定=非骑乘）', () => {
    const W = makeWorld(); buildHorizRepo(W.store);
    const b: RB = { x: 34 * TILE, y: 30 * TILE + 2, w: 14, h: 14, vx: 6, vy: 0,
      onGround: false, hitWall: false, hitHead: false, dropThrough: true, hoik: true };
    for (let t = 0; t < 60; t++) moveAndCollide(b as never, W, b.vx, b.vy);
    expect(b.x).toBeGreaterThan(37 * TILE);
    expect(b.vx).toBe(6);
    expect(b.y).toBe(30 * TILE + 2);                 // 无骑乘抬升=纯 hoik 门通行
  });
  it('hoik=true 弹幕体左行（反侧）：被墙拦（单向性）', () => {
    const W = makeWorld(); buildHorizRepo(W.store);
    const b: RB = { x: 38 * TILE, y: 30 * TILE + 2, w: 14, h: 14, vx: -6, vy: 0,
      onGround: false, hitWall: false, hitHead: false, dropThrough: true, hoik: true };
    for (let t = 0; t < 60; t++) moveAndCollide(b as never, W, b.vx, b.vy);
    expect(b.x).toBeGreaterThanOrEqual(37 * TILE - 0.01);
  });
  it('★跨格收窄门（fx 时代穿门容器保留,M3 变异靶）:38 宽弹幕体出生跨入无齿墙柱 → 止步不相穿', () => {
    const W = makeWorld();
    for (let x = 20; x <= 56; x++) W.store.setTile(x, 32, DIRT);
    for (let y = 29; y <= 31; y++) W.store.setTile(40, y, DIRT);   // 无齿裸墙 x=40
    const b: RB = { x: 40 * TILE - 29, y: 466, w: 38, h: 38, vx: 5, vy: 0,
      onGround: false, hitWall: false, hitHead: false, dropThrough: true, hoik: true };   // 无 hoikAcrossFree
    for (let t = 0; t < 40; t++) moveAndCollide(b as never, W, b.vx, b.vy);
    expect(b.x + b.w).toBeLessThanOrEqual(41 * TILE);  // 不得越出墙右缘（vanilla 相穿,本仓容器拦）
    expect(b.x + b.w).toBeGreaterThan(40 * TILE);      // 但已跨入墙柱（止步不回拉面=原容器语义）
  });
  it('hoik 缺省（NPC 族登记债形态,dropThrough 实形）：右行被墙拦（本刀缺省关侧不受影响）', () => {
    const W = makeWorld(); buildHorizRepo(W.store);
    const b: RB = { x: 34 * TILE, y: 30 * TILE + 2, w: 14, h: 14, vx: 6, vy: 0,
      onGround: false, hitWall: false, hitHead: false, dropThrough: true };
    for (let t = 0; t < 60; t++) moveAndCollide(b as never, W, b.vx, b.vy);
    expect(b.x + b.w).toBeLessThanOrEqual(36 * TILE);
    expect(b.vx).toBe(0);
  });
});
