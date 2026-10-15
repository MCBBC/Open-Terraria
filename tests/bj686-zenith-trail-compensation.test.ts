// ★BJ686 判别锁（2026-10-16 用户实报「飞行态天顶剑圆弧变扭曲波浪,静止正常,
// FX24 首日即有」）：TrailingMode 4 补偿时序 = 悬停/轨道期拖尾帧一致性。
//
// 原版结构钉死（Terarria1457 反编译,亲读）：
//   · Projectile.Update :16780-16783 `numUpdates = extraUpdates(=1)` → while 体
//     以 numUpdates∈{0,-1} 各跑一遍 = 子步 A/B（2 压栈/tick,TrailCacheLength=60
//     → 环时长 30 游戏秒帧;ProjectileID.cs:385/:387 TrailingMode[933]=4）。
//   · 循环体内 AI() :16880 在前、TrailingMode 块 :17197-17302 在后 → 压【本子步
//     AI 末态】（oldPos[0]=position）。
//   · TrailingMode 4 :17274-17290：vector3=玩家本 tick 帧位移;下移循环逐条
//     `numUpdates==0 && oldPos[i]!=Zero → += vector3`（仅子步 A 补偿）,随后压
//     新头。玩家一 tick 内不动 ⇒ 两子步新条目同帧出生,整环恒在当前玩家帧。
// 旧码病灶 = 「fixedUpdate 头补偿（两 step 之前）+ step 顶压上一子步末态」：
// 子步 A 条目出生即落后一个玩家帧位移且永不补偿 → 飞行态 odd 条目逐条 −Δ
// 交替错位 → 条带直线连段（FinalFractalHelper.Draw 用 PrepareStrip,无平滑）
// 渲染成波浪;静止 Δ=0 无症状。修复=补偿随子步 A 交织 + 压栈挪 AI 末态后。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ZenithSword } from '../src/entities/SwingArc';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';

// —— 夹具（纯逻辑,无浏览器;cx/cy getter 跟随 x/y——与真实 Player/Entity 同构,
//    旧测试夹具手写 cx 字段须手动同步,此处用 getter 消掉该坑） ——
class FlyOwner {
  x: number; y: number; w = 20; h = 42; facing = 1; dead = false;
  constructor(x: number, y: number) { this.x = x; this.y = y; }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
}

function makeGame(): GameHooks {
  return {
    world: new World(120, 120, 30, 'open'),
    player: null as unknown,
    enemies: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, critters: () => [], notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
  } as unknown as GameHooks;
}

interface PushRec { tick: number; sub: number; postCX: number; postCY: number; pushedX: number; pushedY: number; }

/** 恒速飞行驱动 + 每子步压栈仪表（原型包装,finally 还原——镜探针 _bj686-zenith-trail-probe）。
 *  返回逐 tick trail 快照与压栈记录。 */
function drive(dx: number, dy: number, ticks: number): {
  z: ZenithSword; owner: FlyOwner; deltas: Array<{ dx: number; dy: number }>;
  dumps: number[][]; pushes: PushRec[];
} {
  const game = makeGame();
  const owner = new FlyOwner(800, 4000);
  const z = new ZenithSword(owner, owner.cx + 300, owner.cy - 100, 190, 4956);
  const proto = Object.getPrototypeOf(z) as { step: (g: GameHooks, cx?: number, cy?: number) => void };
  const origStep = proto.step;
  const pushes: PushRec[] = [];
  const deltas: Array<{ dx: number; dy: number }> = [];
  const dumps: number[][] = [];
  let tick = 0, sub = 0;
  proto.step = function (this: ZenithSword, gg: GameHooks, ...rest: unknown[]) {
    const r = (origStep as unknown as (g: GameHooks, ...a: unknown[]) => void).call(this, gg, ...rest);
    const tr = (this as unknown as { trail: number[] })['trail'];   // 私有环读（z['trail'] 同款逃生口）
    pushes.push({ tick, sub, postCX: this.cx, postCY: this.cy,
      pushedX: tr[tr.length - 3], pushedY: tr[tr.length - 2] });
    sub++;
    return r;
  };
  try {
    for (let t = 1; t <= ticks && !z.dead; t++) {
      tick = t; sub = 0;
      owner.x += dx; owner.y += dy;   // 玩家先行（Game.fixedUpdate 序:player→projectiles）
      z.fixedUpdate(1 / 60, game);
      deltas.push({ dx, dy });
      dumps.push((z as unknown as { trail: number[] })['trail'].slice());
    }
  } finally {
    proto.step = origStep;
  }
  return { z, owner, deltas, dumps, pushes };
}

/** 帧误差重建（探针同式）：dump N 的 fromEnd j ↔ 第 (2N-1-j) 次压栈;
 *  帧归属=压入值==本子步末态中心 → frame=tick,否则该值产生于上一子步末
 *  （subA→tick-1 帧/subB→同 tick 帧）。expected = pushed + Σ(后续 tick 的 Δ)。 */
function frameErrors(d: ReturnType<typeof drive>): number[] {
  const errs: number[] = [];
  for (let N = 1; N <= d.dumps.length; N++) {
    const tr = d.dumps[N - 1];
    const n = tr.length / 3;
    for (let j = 0; j < n && 2 * N - 1 - j >= 0; j++) {
      const pu = d.pushes[2 * N - 1 - j];
      const isPost = Math.abs(pu.pushedX - pu.postCX) < 1e-9 && Math.abs(pu.pushedY - pu.postCY) < 1e-9;
      const frameTick = isPost ? pu.tick : (pu.sub === 0 ? pu.tick - 1 : pu.tick);
      let ex = pu.pushedX, ey = pu.pushedY;
      for (let m = frameTick + 1; m <= N; m++) { ex += d.deltas[m - 1].dx; ey += d.deltas[m - 1].dy; }
      errs.push(Math.hypot(tr[tr.length - 3 - 3 * j] - ex, tr[tr.length - 2 - 3 * j] - ey));
    }
  }
  return errs;
}

describe('BJ686 天顶剑 TrailingMode 4 补偿时序（飞行态波浪根因）', () => {
  it('① 时序源码锚：补偿随子步 A 交织（step(game, odx, ody)），不在两 step 之前；压栈=AI 末态（commitTrail）', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/entities/SwingArc.ts', import.meta.url)), 'utf8');
    // 子步 A 带补偿 / 子步 B 裸跑（numUpdates==0/-1 语义）
    expect(src).toContain('this.step(game, odx, ody);');
    expect(src).toContain('this.step(game, 0, 0);');
    // step 签名带补偿参
    expect(src).toContain('private step(game: GameHooks, compX = 0, compY = 0): void');
    // 位移补偿循环全仓仅 commitTrail 一处（fixedUpdate 头前置补偿=病灶形态,须绝迹）
    const compLoop = src.match(/for \(let i = 0; i < this\.trail\.length; i \+= 3\)/g) ?? [];
    expect(compLoop.length).toBe(1);
    // 提交块存在且压 AI 末态中心（post-AI push）
    expect(src).toContain('private commitTrail(compX: number, compY: number): void');
    expect(src).toContain('this.trail.push(this.cx, this.cy, this.rot);');
  });

  it('② 行为锁：恒速水平飞行（Δ=(10,0),翼飞量级）全环帧误差≈0（旧时序=odd 条目 −Δ 交替恰红）', () => {
    const d = drive(10, 0, 32);
    expect(d.dumps.length).toBe(32);
    expect(d.pushes.length).toBe(64);          // 2 压栈/tick 节奏不变
    const errs = frameErrors(d);
    expect(errs.length).toBeGreaterThan(0);
    // 轨道期+悬停期全部条目:旧码 odd 条目恰为 −Δ=10px,修复后必须 <0.5
    expect(Math.max(...errs)).toBeLessThan(0.5);
  });

  it('②b 行为锁（悬停期黑盒）：counter≥60 后全条目恒在当前玩家帧——条目位 ≡ 本体位', () => {
    // spd=|vel|=|(150,-50)|≈158 → counter 速率 1.5433/子步 → tick 20 起悬停
    // （phase=GetLerpValue(0,1,counter/60) 饱和=原版 :43937 行为,轨道角冻结）
    const d = drive(10, 0, 32);
    expect(d.z['counter']).toBeGreaterThan(60);   // 已入悬停期（前置门）
    const tr = d.dumps[31];
    const n = tr.length / 3;
    for (let j = 0; j < 16; j++) {                // 最新 16 条=tick 25-32 出生（悬停期）
      // 悬停期轨道偏移恒定 ⇒ 修复后每条 ≡ 本体中心（同帧）;旧码交替 ±Δ/2
      expect(Math.abs(tr[tr.length - 3 - 3 * j] - d.z.cx)).toBeLessThan(0.5);
      expect(Math.abs(tr[tr.length - 2 - 3 * j] - d.z.cy)).toBeLessThan(0.5);
    }
  });

  it('②c 行为锁：斜向飞行（Δ=(6,8)）矢量补偿同帧', () => {
    const errs = frameErrors(drive(6, 8, 28));
    expect(Math.max(...errs)).toBeLessThan(0.5);
  });

  it('③ 静止回归（Δ=0）：帧误差恒 0 ∧ 轨道期条目在动（弧形不塌缩）', () => {
    const d = drive(0, 0, 24);
    expect(Math.max(...frameErrors(d))).toBeLessThan(0.5);
    const tr = d.dumps[14];
    const xs = new Set<number>();
    for (let i = 0; i < tr.length; i += 3) xs.add(Math.round(tr[i] * 10) / 10);
    expect(xs.size).toBeGreaterThan(5);   // 轨道期相邻条目位置各异（圆弧本体）
  });

  it('③b 节奏/环语义锁：2 压栈/tick ∧ TrailCacheLength=60 环 ∧ counter≥120 消亡（≈tick 39）', () => {
    const d = drive(0, 0, 40);
    expect(d.dumps.length).toBeGreaterThanOrEqual(38);      // ≥38 tick 活体
    expect(d.z.dead).toBe(true);                            // 40 tick 内消亡
    const tr = d.dumps[d.dumps.length - 1];
    expect(tr.length).toBe(60 * 3);                         // 60 条 × [x,y,rot]
    expect(d.z['trailDirs'].length).toBe(60);
    expect(d.pushes.length).toBe(2 * d.dumps.length);       // 每 tick 恰 2 压栈
  });
});
