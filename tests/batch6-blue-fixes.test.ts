// 六轮蓝队修复批回归（2026-09-01，F1-F5 + F5b）：
//  F1 CheckActive 两窗纵向常量纠偏（Enemy.ts；NPC.cs:6176-6178 + sWidth/sHeight
//    :67892-67895 + rectangle2 :78691-78693）——activeRange Y 半幅 2272→2520、
//    屏幕盒 Y 半幅 560→600+h；248px 带判别例。
//  F2 弩车 AI_134 三处朝向（MinionProj.ts；Projectile.cs:69599-69608 落位 /
//    :69615-69626 携行 / Utils.cs:2154-2172 AngleLerp 平局向）。
//  F3 convertActuallyTorch 尾级联（SecretSeedDoEndsPass.ts；WorldGen.cs:56762-56785
//    ——SquareTileFrame 在 num!=newStyle 支内无条件）。
//  F4 陨石落点去 dead-blanking（Game.ts；WorldGen.cs:6198-6205 玩家门只查 active、
//    :6324-6334 保护区盒同）。
//  F5 随从属主引用去 dead→null（Game.ts 十站；Projectile.cs AI_026/062/067/158/120
//    全程读 Main.player[owner] 不查 dead——死亡期间照常索敌/跟随/开火）。
//  F5b MinionProj 通用绘 dirX 传真值（WeaponProj.ts PROJ_DRAW_OFFSET_DYN 第三参
//    = 原版 proj.direction；蜘蛛 390-392 num152=4*direction，Main.cs:30495-30498）。
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { MinionProj } from '../src/entities/MinionProj';
import { setProjSpriteOverride } from '../src/entities/Arrow';
import { projDrawOffsetFor } from '../src/entities/WeaponProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import {
  convertHallowCell,
} from '../src/world/gen/vanilla/SecretSeedDoEndsPass';
import { dropMeteor, type MeteorHost } from '../src/world/MeteorFall';
import type { GameHooks } from '../src/entities/types';

// ===========================================================================
// 公共桩
// ===========================================================================
/** 记录型 ctx 桩（minion-orientation 同款 + translate 参数捕获） */
function recCtx() {
  const rec: { rotate: number[]; scale: number[][]; translate: number[][]; calls: string[] } = {
    rotate: [], scale: [], translate: [], calls: [],
  };
  return {
    rec,
    ctx: {
      set imageSmoothingEnabled(_: boolean) {},
      get imageSmoothingEnabled() { return false; },
      save() { rec.calls.push('save'); },
      restore() { rec.calls.push('restore'); },
      translate(x: number, y: number) { rec.translate.push([x, y]); rec.calls.push('translate'); },
      rotate(a: number) { rec.rotate.push(a); rec.calls.push('rotate'); },
      scale(x: number, y: number) { rec.scale.push([x, y]); rec.calls.push('scale'); },
      drawImage() { rec.calls.push('drawImage'); },
      fillRect() {}, strokeRect() {}, set fillStyle(_: string) {}, set strokeStyle(_: string) {},
    } as unknown as CanvasRenderingContext2D,
  };
}

// ===========================================================================
// ★F1 CheckActive 两窗（NPC.cs:6176-6178 / :67892-67895 / :78691-78693）
// ===========================================================================
const W = 200, H = 300;
function world(): World {
  const w = new World(W, H, 11, 'eow-despawn');
  w.groundLevel = 50; w.rockLevel = 90;
  return w;
}
function hooks(w: World, p: Player): GameHooks {
  return {
    world: w, player: p,
    enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
}
/** 蓝史莱姆钉位：挖空口袋 + 脚下实心，AI 一拍内不动摇 |Δcy|（带边余量 ≥8px 用例钉死） */
function pinSlime(w: World, e: Enemy, cx: number, cy: number): void {
  e.x = cx - e.w / 2; e.y = cy - e.h / 2;
  const st = w.store;
  const tx = Math.floor(cx / TILE), ty = Math.floor(cy / TILE);
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 3; dy++) st.setTileSilent(tx + dx, ty + dy, 0);
    st.setTileSilent(tx + dx, ty + 4, 1);   // 脚下实心（落面）
  }
}

/** projFrameImg 走 document.createElement（node 无 DOM）——enemy-proj-draw-parity 同款桩 */
function stubDocument(): void {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        set imageSmoothingEnabled(_: boolean) {},
        drawImage() {},
      }),
    }),
  });
}

describe('★F1 CheckActive 两窗常量（NPC.cs:6176-6178/:78691-78693）', () => {
  it('①248px 带判别例：竖距 2400px ∈ (旧2272, 原版2520] → 原版保命 flag2（旧实现提前消散）', () => {
    const w = world();
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    const e = Enemy.fromVanilla(1, 60 * TILE, 60 * TILE)!;
    pinSlime(w, e, p.cx, p.cy + 2400);          // activeRange Y 半幅 2520 内、屏幕盒(600+28)外
    e.despawnTimer = 100;
    e.fixedUpdate(1, hooks(w, p));
    expect(e.dead, 'activeRange 纵向带内应保命（修复前 2272 窗外→首拍消散）').toBe(false);
    expect(e.despawnTimer, '屏幕盒外照常倒数（保命 ≠ 续命）').toBe(99);
  });

  it('②对照：竖距 2600px > 原版 2520（窗外）→ 首拍即消散', () => {
    const w = world();
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    const e = Enemy.fromVanilla(1, 60 * TILE, 60 * TILE)!;
    pinSlime(w, e, p.cx, p.cy + 2600);
    e.despawnTimer = 100;
    e.fixedUpdate(1, hooks(w, p));
    expect(e.dead).toBe(true);                  // 原版同样消散：flag2 恒假
  });

  it('③屏幕盒纵向 600+h：竖距 600px（>旧 560、≤600+18）→ 照常续命 750', () => {
    const w = world();
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    const e = Enemy.fromVanilla(1, 60 * TILE, 60 * TILE)!;
    pinSlime(w, e, p.cx, p.cy + 600);
    e.despawnTimer = 42;
    e.fixedUpdate(1, hooks(w, p));
    // 屏幕盒命中 → timeLeft=activeTime 再 −1 = 749（旧 560 半幅 → 不命中 → 41）
    // 蓝史莱姆盒 24×18 → 新半幅 = 600+18 = 618 > 600 ≥ 旧 560
    expect(e.despawnTimer).toBe(749);
  });
});

// ===========================================================================
// ★F2 弩车 AI_134 三处朝向（Projectile.cs:69599-608/:69615-69626/Utils.cs:2154-2172）
// ===========================================================================
const BW = 200, BH = 140;
function bStore(): TileStore {
  const store = new TileStore(BW, BH);
  for (let x = 0; x < BW; x++) for (let y = 110; y < BH; y++) store.setTile(x, y, 1);
  return store;
}
interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean; cx: number; cy: number;
}
function mkEnemy(id: number, cx: number, cy: number, w = 18, h = 40): MockEnemy {
  return { id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy };
}
/** 桩玩家（equipStats 可写：携行支读 accSentryBackpack） */
function stubPlayer(facing: number) {
  return {
    x: 90 * TILE, y: 100 * TILE, w: 20, h: 42, cx: 90 * TILE, cy: 100 * TILE + 21,
    facing, dead: false, vx: 0, vy: 0,
    equipStats: { accSentryBackpack: false },
    accSentryBackpackGrabCooldown: 0,
  };
}
function bHooks(store: TileStore, player: unknown, enemies: MockEnemy[] = []) {
  const projectiles: unknown[] = [];
  const hooks: GameHooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  } as unknown as GameHooks;
  (hooks as unknown as { entities: { add: (e: unknown, b: string) => void; projectiles: unknown[] } }).entities = {
    add: (e: unknown) => { projectiles.push(e); },
    projectiles,
  };
  return { hooks, projectiles };
}
function mkBallista(player: unknown, mx = 50 * TILE, my = 108 * TILE): MinionProj {
  return new MinionProj(mx - 8, my - 8, 678, 10, 2, true, 0, true,
    () => player as never);
}

describe('★F2 弩车 AI_134 朝向三案', () => {
  beforeAll(() => {
    stubDocument();
    // 弩车本体帧图（Main.cs:34097-34137 支走 projSprite(678)，无 override 时专绘支跳过）
    setProjSpriteOverride(678, { width: 124, height: 336 } as unknown as HTMLImageElement);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('①落位 facing 同步（:69599-608）：朝左放置 → facing=-1 且 rot=π；draw = rotate(π)+scale(1,-1) 水平镜像组（非上下颠倒）', () => {
    const player = stubPlayer(-1);
    const { hooks } = bHooks(bStore(), player);
    const m = mkBallista(player);
    m.fixedUpdate(1, hooks);
    expect(m.facing, 'direction=spriteDirection=owner.direction 写回（旧缺 facing 写入）').toBe(-1);
    expect(m.rot).toBe(Math.PI);
    // draw 组合序：translate(锚) → rotate(rot) → scale(1,-1)＝XNA T·R(θ)·F 顶点序
    const { rec, ctx } = recCtx();
    m.draw({ ctx, atlas: undefined } as never);
    expect(rec.rotate).toEqual([Math.PI]);
    expect(rec.scale).toContainEqual([1, -1]);
    expect(rec.scale).not.toContainEqual([-1, 1]);   // 单轴式=上下颠倒错形（修复前形状）
  });

  it('②归位角钉 π（:69669-69675）：朝左无目标 → rot 恒 π（AngleLerp(π,π) 相等原样返回）', () => {
    const player = stubPlayer(-1);
    const { hooks } = bHooks(bStore(), player);
    const m = mkBallista(player);
    for (let t = 0; t < 30; t++) m.fixedUpdate(1, hooks);
    expect(m.facing).toBe(-1);
    expect(m.rot).toBe(Math.PI);
  });

  it('②平局向（Utils.cs:2159-2162 严格 >）：aim=0 与 rot=π 恰差 π → 走 target+2π 正半周（π→−0.92π，旧式 +0.92π）', () => {
    const player = new Player(90 * TILE, 100 * TILE, new Inventory());   // 真实 Player:tagEffectStack
    player.facing = -1;
    const enemy = mkEnemy(1, 0, 0);
    const { hooks } = bHooks(bStore(), player, [enemy]);
    const m = mkBallista(player);
    m.fixedUpdate(1, hooks);                          // 落位拍：facing=-1/rot=π
    enemy.cx = m.cx + 400; enemy.cy = m.cy;           // 正右同高 → aim 角恰 0（d=−π 平局）
    enemy.x = enemy.cx - enemy.w / 2; enemy.y = enemy.cy - enemy.h / 2;
    m.fixedUpdate(1, hooks);
    expect(m.rot).toBeCloseTo(-Math.PI * 0.92, 3);    // π+0.08π 经 wrap → 负半周回摆
    expect(m.facing).toBe(-1);                        // 旋转半平面派生（|rot|>π/2 ⇒ −1）
  });

  it('③携行朝向跟随（:69615-69623）：carried && ai0==1 && ai1==0 → facing 每拍 = player.direction', () => {
    const player = stubPlayer(1);
    player.equipStats.accSentryBackpack = true;
    const { hooks } = bHooks(bStore(), player);
    const m = mkBallista(player);
    m.carriedByBackpack = true;
    m.sInit = 1;                                      // ai[0]=1
    m.sCool = 0;                                      // ai[1]=0
    m.fixedUpdate(1, hooks);
    expect(m.facing, '玩家朝右 → 塔身朝右').toBe(1);
    player.facing = -1;
    m.fixedUpdate(1, hooks);
    expect(m.facing, '玩家朝左 → 携行回写跟转').toBe(-1);
  });
});

// ===========================================================================
// ★F3 convertActuallyTorch 尾级联（WorldGen.cs:56762-56785）
// ===========================================================================
/** RNG internalSample 观测窗（secret-seed-hallow-cascade.test.ts 同款） */
function countRolls<T>(fn: () => T): { value: T; rolls: number } {
  const g = globalThis as { __swOnRoll?: (value: number, inst: object) => void };
  const prev = g.__swOnRoll;
  let n = 0;
  g.__swOnRoll = () => { n++; };
  try { return { value: fn(), rolls: n }; } finally { g.__swOnRoll = prev; }
}
/** IIII39 级联族标定钩（SQ/TR184 行捕获） */
function withFntProbe<T>(fn: () => T): { value: T; lines: string[] } {
  const G = globalThis as { __swFntProbeI39?: { emit?: (l: string) => void } | null };
  const prev = G.__swFntProbeI39 ?? null;
  const lines: string[] = [];
  G.__swFntProbeI39 = { emit: (l) => lines.push(l) };
  try { return { value: fn(), lines }; } finally { G.__swFntProbeI39 = prev; }
}
const sqCoords = (lines: string[]): string[] =>
  lines.filter((l) => l.startsWith('SQ|')).map((l) => l.slice(3, l.indexOf('|', 3)));

describe('★F3 Convert_ActuallyConvertTorch 尾级联（cs:56782 无条件）', () => {
  it('火把转化（case2 样式 0→20）：帧落定 + 尾 SquareTileFrame 在案 + 邻格重帧掷耗非零', () => {
    const st = new TileStore(120, 80);
    st.setTileSilent(60, 60, TILE_BY_KEY['torch']!);              // sheet 4 样式 0（frameY=0）
    st.setWallSilent(60, 60, 1);                                  // 墙附火把（重帧不判杀）
    st.setTileSilent(61, 60, TILE_BY_KEY['v_184_moss_plants']!);  // 九宫邻格 184：重帧必掷 roll3
    const r = new RNG(20260901);
    const probe = withFntProbe(() => countRolls(() => convertHallowCell(st, r, 60, 60)));
    expect(st.frameY[st.idx(60, 60)]).toBe(20 * 22);              // 样式 0→20 落帧
    expect(sqCoords(probe.lines)).toContain('60,60');             // 尾级联 SquareTileFrame(60,60)
    expect(probe.lines.some((l) => l.startsWith('TR184|61,60'))).toBe(true);  // 邻格重帧实走
    expect(probe.value.rolls, '转化掷耗非零（修复前恒零）').toBeGreaterThanOrEqual(1);
  });

  it('已达标火把（样式 20）：零改写零级联（num==newStyle 门面守卫）', () => {
    const st = new TileStore(120, 80);
    st.setTileSilent(60, 60, TILE_BY_KEY['torch']!);
    st.frameY[st.idx(60, 60)] = 20 * 22;
    const r = new RNG(5150);
    const probe = withFntProbe(() => countRolls(() => convertHallowCell(st, r, 60, 60)));
    expect(st.frameY[st.idx(60, 60)]).toBe(20 * 22);
    expect(probe.value.rolls).toBe(0);
    expect(sqCoords(probe.lines)).toEqual([]);
  });
});

// ===========================================================================
// ★F4 陨石落点 dead-blanking（WorldGen.cs:6198-6205/:6324-6334 只查 active）
// ===========================================================================
function slabHost(players: MeteorHost['players']): MeteorHost {
  // 全图实心板（sheet 1）：任意列扫描 surface=9、30×30 打分 900≥600 → 保护判定必达
  const st = new TileStore(320, 120);
  for (let y = 0; y < 120; y++) for (let x = 0; x < 320; x++) st.setTile(x, y, 1);
  return {
    w: 320, h: 120,
    spawnX: 300, groundLevel: 30, rockLevel: 60, store: st,
    players,
    npcs: [],
    rand: Math.random,
    int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    announce: () => {},
  };
}
describe('★F4 陨石落点玩家门=active 语义（:6198-6205/:6324-6334）', () => {
  it('①死亡玩家（尸位）在候选/保护区列 → dropMeteor 照常运转：尸位保护区禁落（恒 null）', () => {
    // 尸位盒中心 x=160 格：保护区 ±1022px=±64 格 → 候选 X∈[150,169] 全覆盖 ⇒ 全列禁落
    const host = slabHost([{ x: 160 * TILE - 10, y: 500 - 21, w: 20, h: 42 }]);
    expect(dropMeteor(host)).toBeNull();
  });

  it('②死亡窗口照常落矿：尸位盒远离候选带 → 正常落地（players 含尸位盒,非空数组吞矿）', () => {
    const host = slabHost([{ x: 300 * TILE - 10, y: 500 - 21, w: 20, h: 42 }]);
    const landed = dropMeteor(host);
    expect(landed).not.toBeNull();
    const { i, j } = landed!;
    expect(i).toBeGreaterThanOrEqual(150);
    expect(i).toBeLessThanOrEqual(169);
    expect(j).toBe(9);                                   // 全实心板首实心行 = startDepth
  });
});

// ===========================================================================
// ★F5 随从属主引用去 dead→null（AI_026/062/067 全程读 Main.player[owner]）
// ===========================================================================
describe('★F5 死亡期间随从不停火（ownerRef 不随 dead 置空）', () => {
  it('373 黄蜂：owner.dead 仍存活、仍开火（旧 dead→null ⇒ 通用臂 `!p → dead` 首拍自灭）', () => {
    const player = new Player(90 * TILE, 100 * TILE, new Inventory());   // 真实 Player:tagEffectStack
    player.dead = true;                                   // 死亡窗内（原版 active 仍真）
    const enemy = mkEnemy(1, player.cx + 300, player.cy);
    const { hooks, projectiles } = bHooks(bStore(), player, [enemy]);
    const m = new MinionProj(player.cx - 8, player.cy - 40, 373, 10, 2, false, 0, true,
      () => player as never);
    for (let t = 0; t < 12; t++) m.fixedUpdate(1, hooks);
    expect(m.dead, '死亡期间随从照常在场（AI_062 :66319+ 全程读 player）').toBe(false);
    expect(projectiles.length, '死亡期间随从不停火').toBeGreaterThanOrEqual(1);
  });

  it('对照（钉死旧偏差形状）：ownerRef 返回 null ⇒ 通用臂首拍 dead=true', () => {
    const player = stubPlayer(1);
    const { hooks } = bHooks(bStore(), player, [mkEnemy(1, player.cx + 300, player.cy)]);
    const m = new MinionProj(player.cx - 8, player.cy - 40, 373, 10, 2, false, 0, true,
      () => null as never);                               // 旧 dead→null 的消费面等价形
    m.fixedUpdate(1, hooks);
    expect(m.dead).toBe(true);
  });
});

// ===========================================================================
// ★F5b MinionProj 通用绘 dirX 传真值（Main.cs:30495-30498 num152=4*direction）
// ===========================================================================
describe('★F5b 绘制偏移动态项 dir=proj.direction（蜘蛛 390-392）', () => {
  beforeAll(() => {
    stubDocument();
    setProjSpriteOverride(390, { width: 40, height: 40 } as unknown as HTMLImageElement);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('表语义：390-392 读 direction（第三参）非 spriteDirection——右行 +4 / 左行 −4', () => {
    expect(projDrawOffsetFor(390, -1, 20, 1)).toEqual([0, 4, 0]);    // 右行:direction=+1（旧恒 −4）
    expect(projDrawOffsetFor(390, 1, 20, -1)).toEqual([0, -4, 0]);   // 左行:direction=−1
    expect(projDrawOffsetFor(392, 1, 20, 1)).toEqual([-2, 4, 0]);
    // 191-194 同族（Main.cs:30490-30493 direction!=1 ? -22 : -10）
    expect(projDrawOffsetFor(191, 1, 30, 1)).toEqual([26, -10, 0]);
    expect(projDrawOffsetFor(191, 1, 30, -1)).toEqual([26, -22, 0]);
    // spriteDirection 族不受第三参影响（112 = −8+4*spriteDirection）
    expect(projDrawOffsetFor(112, -1, 30, 1)).toEqual([14, -12, 0]);
  });

  it('消费端接线：蜘蛛右行 draw translate X 含 +4（修复前恒 −4 = 8px 差）', () => {
    const player = new Player(90 * TILE, 100 * TILE, new Inventory());
    const m = new MinionProj(500, 500, 390, 10, 2, false, 0, true, () => player as never);
    (m as unknown as { spDir: number }).spDir = 1;  // direction=+1（右行）
    m.facing = -1;                                  // spriteDirection=−direction（翻转）
    const { rec, ctx } = recCtx();
    m.draw({ ctx, atlas: undefined } as never);
    const num145 = 40 / 2;                          // 桩帧图宽 40
    const baseX = m.cx - m.w / 2 + num145;
    expect(rec.translate[0][0]).toBeCloseTo(baseX + 4, 5);
    (m as unknown as { spDir: number }).spDir = -1; // 左行
    m.facing = 1;
    const rec2 = (() => { const r2 = recCtx(); m.draw({ ctx: r2.ctx, atlas: undefined } as never); return r2.rec; })();
    expect(rec2.translate[0][0]).toBeCloseTo(baseX - 4, 5);
  });
});
