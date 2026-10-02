// ★BJ435（2026-10-02 用户实报）：小雪怪法杖（FlinxStaff 5069 → 弹 951）召唤的小雪怪
//  【浮空】——定谳 = 错位在 AI 层非绘制层：原版本体是 AI_067 flag5 地面步行族
//  （Projectile.cs:50014-52160：num2=800 索敌/重力 0.4 封顶 10/跳梯/平台下穿
//  decidesManualFallThrough :8982），本仓曾无 951 分发 = 落通用飞行悬停
//  （fixedUpdate !ground 支 p.cy−30 环形槽位）→ 盒悬空 = 用户所见「脚不落地」。
//  贴图锚（Main.cs:33942-33946 盒底−帧高/2+4）本仓 CENTER_ANCHOR_33703 支既有 1:1
//  （BJ16 批清偿）一直正确。判别面：
//   ① 落地面：地面出生 90t 盒底恒贴地板（旧悬停近似必红）
//   ② 移动档钉值：有目标 flag5 档 0.65/5.5/5.5（:51302-51306）/ 无目标缺省 0.5/4/4
//   ③ flag20 踩脸弹跳（:51438-51441）+ friendly=true 全态接触伤（:50476 vs 海盗走行不咬）
//   ④ 命中反跳钉值（Damage_PVE_Inner :13115-13124：vx=nX+(rand−0.5)×13、vy=−5）
//   ⑤ 归位飞行态机（ai[0] 0↔1,:50638-50735 共享段 + :50761-50772 帧循环——与海盗冻结不同相）
//   ⑥ 平台下穿（decidesManualFallThrough=true :8982 → :50454/:52112 shouldFallThrough）
//   ⑦ 贴图-盒对齐钉值（源锚 :33943-33945 ay += h/2 − 帧高/2 + 4 + 帧通道直写）
//   ⑧ 湿段注册（:8971-8986 无 ignoreWater 行=受段,MINION_WET_IDS 补 951）
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MinionProj } from '../src/entities/MinionProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MINION_TS = readFileSync(join(ROOT, 'src/entities/MinionProj.ts'), 'utf8');
const PLATFORM_TILE = TILE_BY_KEY['platform']!;

const W = 220, H = 140;
const FLOOR_TOP = 110 * TILE_BY_KEY['dirt_block'] !== undefined ? 110 * 16 : 110 * 16;   // 行 110 顶 = 1760
function makeStore(): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 110; y < H; y++) store.setTile(x, y, 1);
  return store;
}
interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; vx?: number; vy?: number;
  iframes?: number;
  hits: number[];
  hurt: (d: number) => boolean;
}
function mkEnemy(id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy, hp: 100000,
    hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); e.iframes = 10; return true; },
  };
  return e;
}
function makeHooks(enemies: MockEnemy[] = []) {
  const store = makeStore();
  const player = new Player(60 * 16, 100 * 16 - 42, new Inventory());
  const projectiles: unknown[] = [];
  const hooks = {
    world: { store, flags: { hardMode: false }, groundLevel: 120 },
    player,
    enemies: () => enemies as never[],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: (() => {}) as never,
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: (() => {}) as never,
    showPickupLabel: () => {},
    spawnDust: ((_x: number, _y: number, _w: number, _h: number, id: number) => {
      return { id, vx: 1, vy: 1, fadeIn: 0, noGravity: false, noLight: false };
    }) as never,
    addLightAt: (() => undefined) as never,
  };
  const game = hooks as unknown as GameHooks;
  Object.assign(game, { entities: { add: (e: unknown) => { projectiles.push(e); }, projectiles } });
  return { hooks: game, store, player, projectiles, enemies };
}
const mk = (projId: number, owner: Player, x?: number, y?: number): MinionProj =>
  new MinionProj(x ?? owner.cx, y ?? owner.cy - 40, projId, 10, 2, false, 0, false, () => owner);
const priv = (m: MinionProj): Record<string, unknown> => m as unknown as Record<string, unknown>;

describe('BJ435 小雪怪 951 地面步行族正轨（AI_067 flag5）', () => {
  it('① 落地面：地面出生 90t 盒底恒贴地板行 110 顶（1760）——旧通用飞行悬停必红', () => {
    const { hooks, player } = makeHooks();
    // 出生位=盒左上（本仓 spawnMinion 直传语义,登记债）——盒底恰贴地板
    const t = mk(951, player, player.cx - 55, 110 * 16 - 26);
    let maxLift = 0;
    for (let k = 0; k < 90; k++) {
      t.fixedUpdate(1, hooks);
      maxLift = Math.max(maxLift, Math.abs(t.y + t.h - 110 * 16));
    }
    expect(maxLift, '盒底 90t 内最大偏离地板 ≤2px（不浮空）').toBeLessThanOrEqual(2);
    expect(t.onGround).toBe(true);
    expect(Number.isFinite(t.x) && Number.isFinite(t.y)).toBe(true);
  });

  it('② 有目标 flag5 档 0.65/5.5/5.5：首拍 accel=0.65、终值钳 ≤5.5（:51302-51306）', () => {
    const selfCx = 60 * 16 - 55 + 13;
    const e = mkEnemy(1, selfCx + 300, 110 * 16 - 13);      // 同高（盒心 1747）
    const { hooks, player } = makeHooks([e]);
    const t = mk(951, player, player.cx - 55, 110 * 16 - 26);
    t.fixedUpdate(1, hooks);
    expect(t.vx).toBeCloseTo(0.65, 9);                       // num50=0.65（非海盗 1/虎 0.7/缺省 0.5）
    for (let k = 0; k < 40; k++) t.fixedUpdate(1, hooks);
    expect(Math.abs(t.vx)).toBeLessThanOrEqual(5.5);         // num52=5.5 钳
  });

  it('② 无目标跟随缺省档 0.5/4/4 + 锚向（:50295-50299 锚=主心−(45+w/2)×dir−30slot×dir）', () => {
    const { hooks, player } = makeHooks();
    player.facing = 1;
    const t = mk(951, player, player.cx, 110 * 16 - 26);     // 本体在锚（主左 55px）右侧 → 左行
    t.fixedUpdate(1, hooks);
    expect(t.vx).toBeCloseTo(-0.5, 9);
    // slot 系推远：slot=2 → 锚再左 60px,方向不变
    const t2 = new MinionProj(player.cx, 110 * 16 - 26, 951, 10, 2, false, 2, false, () => player);
    t2.fixedUpdate(1, hooks);
    expect(t2.vx).toBeCloseTo(-0.5, 9);
  });

  it('③ flag20 踩脸弹跳 + friendly=true 全态咬（:51438-51441/:50476）——重叠宽敌反复起跳且掉血', () => {
    const selfCx = 60 * 16 - 55 + 13;
    // 宽敌 w=100：重叠域内 |Δx|>5 恒成立 → 意图门内 flag20 恒真
    const e = mkEnemy(2, selfCx + 10, 110 * 16 - 13, 100, 24);
    const { hooks, player } = makeHooks([e]);
    const t = mk(951, player, player.cx - 55, 110 * 16 - 26);
    let bounces = 0;
    for (let k = 0; k < 60; k++) {
      t.fixedUpdate(1, hooks);
      if (t.vy < -4) bounces++;
    }
    expect(e.hits.length, 'friendly=true 走行态即咬（vs 海盗走行不咬）').toBeGreaterThanOrEqual(1);
    expect(bounces, '重叠期反复起跳（踩脸弹跳,≥3 拍 vy<-4）').toBeGreaterThanOrEqual(3);
  });

  it('④ 命中反跳钉值（:13115-13124）：重叠拍 vy=-5、vx=nX+rand∈nX±6.5', () => {
    const selfCx = 60 * 16 - 55 + 13;
    const e = mkEnemy(3, selfCx + 8, 110 * 16 - 13);         // 窄敌右侧重叠
    const { hooks, player } = makeHooks([e]);
    const t = mk(951, player, player.cx - 55, 110 * 16 - 26);
    t.fixedUpdate(1, hooks);
    expect(e.hits.length, '接触伤已结算').toBeGreaterThanOrEqual(1);
    expect(t.vy, '反跳 vy 恒 -5').toBe(-5);
    const nxCap = 1 + 6.5 + 1e-9;                            // |nX|≤1 + 抖动 6.5
    expect(Math.abs(t.vx)).toBeLessThanOrEqual(nxCap);
  });

  it('⑤ 归位态机 ai[0] 0↔1：远主 600px 入飞行（tileCollide=false+帧循环 2-11）,近主落地回 0', () => {
    const { hooks, player } = makeHooks();
    const t = mk(951, player, player.cx, 110 * 16 - 26);
    const px0 = player.x;
    player.x = px0 + 600;                                    // dP=600 ∈ (500,2000)
    t.fixedUpdate(1, hooks);
    expect(priv(t).flinA0).toBe(1);
    // transition 拍：原版 ai[0]=1 置位于 :51176（ai[0]==1 飞行块 :50638 与移动块
    // :51183 均已让位）→ tileCollide 维持上拍真值,下拍才由飞行块 :50641 置 false
    t.fixedUpdate(1, hooks);
    expect(t.tileCollide).toBe(false);
    const seen = new Set<number>();
    for (let k = 0; k < 12; k++) {
      t.fixedUpdate(1, hooks);
      seen.add(priv(t).flinFrame as number);
      expect(priv(t).flinFrame, '飞行帧域 2-11（:50761-50772 循环）').toBeGreaterThanOrEqual(2);
      expect(priv(t).flinFrame).toBeLessThanOrEqual(11);
    }
    expect(seen.size, '飞行帧翻页非冻结（vs 海盗）').toBeGreaterThanOrEqual(2);
    // 近主且盒不高于主底 → 回地面态
    player.x = px0;
    t.x = player.cx - 10; t.y = player.y - 40;               // 盒底 = 主底上方
    t.vx = 0; t.vy = 0;
    t.fixedUpdate(1, hooks);
    expect(priv(t).flinA0).toBe(0);
  });

  it('⑥ 平台下穿（decidesManualFallThrough :8982）：脚下有敌 → dropThrough 穿台落地;无敌且主在上方 → 承台', () => {
    // 有目标：台下行 111+ 实心,敌在地面【远离下穿列】（落台后追击走行,避免落点即
    // 重叠 → 反跳弹跳干扰断言——踩脸弹跳本身由 ③ 钉）
    {
      const below = mkEnemy(4, 1500, 110 * 16 - 13);
      const { hooks, store, player } = makeHooks([below]);
      for (let x = 50; x <= 70; x++) store.setTile(x, 104, PLATFORM_TILE);
      const t = mk(951, player, player.cx - 55, 104 * 16 - 26);
      expect(priv(t).dropThrough).toBe(false);
      t.fixedUpdate(1, hooks);
      expect(priv(t).dropThrough, '目标心低于盒底 → :52112 置真').toBe(true);
      let best = Infinity;
      for (let k = 0; k < 120; k++) {
        t.fixedUpdate(1, hooks);
        best = Math.min(best, Math.abs(t.y + t.h - 110 * 16));
      }
      expect(best, '穿透平台触地板（盒底达行 110 顶）').toBeLessThanOrEqual(2);
      expect(t.y + t.h, '末拍仍处于台下方空间（未回台）').toBeGreaterThan(104 * 16 + 26);
    }
    // 无敌且主在上方：:50454 玩家脚−12 高于盒底 → 承台不穿
    {
      const { hooks, store, player } = makeHooks();
      for (let x = 50; x <= 70; x++) store.setTile(x, 104, PLATFORM_TILE);
      const t = mk(951, player, player.cx - 55, 104 * 16 - 26);
      for (let k = 0; k < 30; k++) t.fixedUpdate(1, hooks);
      expect(priv(t).dropThrough).toBe(false);
      expect(Math.abs(t.y + t.h - 104 * 16), '承台 30t（主脚 1588 < 盒底 1664）').toBeLessThanOrEqual(2);
    }
  });

  it('⑦ 贴图-盒对齐钉值（源锚）+ 帧通道直写：951 ay += h/2 − 帧高/2 + 4、draw 帧走 flinFrame', () => {
    // :33943-33945 逐字（Main.cs 951 支）：vector99.Y += h/2 − frameH/2 + 4、origin=帧心
    expect(MINION_TS).toMatch(/projId === 951\) ay \+= this\.h \/ 2 - img\.height \/ 2 \+ 4/);
    // draw 帧通道：951 走 flinFrame 直写（AI_067 flag5 帧段）,非 age/8 匀速兜底
    expect(MINION_TS).toMatch(/else if \(this\.projId === 951\) \{[^}]*frame = Math\.min\(this\.flinFrame/);
    // 空中帧/旋转钉值路径存在：frame=1 + rot=min(4,vy)×−0.1
    expect(MINION_TS).toMatch(/Math\.min\(4, this\.vy\) \* -0\.1/);
    // 地面帧域回卷：flinFrame >= 12 → 2（projFrames[951]=12）
    expect(MINION_TS).toMatch(/this\.flinFrame < 2 \|\| this\.flinFrame >= 12\) this\.flinFrame = 2/);
  });

  it('⑧ 湿段注册：MINION_WET_IDS 补 951（:8971-8986 SetDefaults 无 ignoreWater=受段）', () => {
    const m = MINION_TS.indexOf('const MINION_WET_IDS = new Set([');
    const block = MINION_TS.slice(m, m + 400);
    expect(block).toMatch(/951/);
  });
});
