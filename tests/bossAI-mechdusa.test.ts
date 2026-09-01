// Mechdusa（机械美杜莎）合体 Boss 全链探针（NPC.cs 1.4.5.6）：
//   召唤门/同点链生成/mechQueen 登记（SpawnMechQueen :19724-19751）——
//   双子 mech 锚位（:26571-26579/:27194-27202 RotatedBy 旋转锚）——
//   queen 死后回落（IsMechQueenUp :6784-6798 惰性失效）——
//   毁灭者头锁位+蛇发段链压缩（AI_037 :50611-50620/:50131-50413）——
//   探针挂链公转（AI_005 :50866-50920）——queen FindFrame 帧 3-5（:75196-75231）——
//   Prime mech 旋冲减速与离场级联（:27887-27966/:27975-28011）。
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';
import {
  spawnMechQueenEnsemble, twinsAI, mechQueenAnchor, skeletronPrimeAI,
} from '../src/entities/bossAI';
import {
  resetMechQueen, mechQueenUp, getMechQueen, anyMechBossUp, markMechQueen,
} from '../src/entities/mechQueen';
import { vanillaFrameIdx } from '../src/render/Renderer';

const W = 200, H = 140, FLOOR = 110;

function makeWorld(): World {
  const w = new World(W, H, 7, 'mechdusa-test');
  w.clock.timeOfDay = 0;   // 深夜（Clock 默认 8:15AM 白天——白天双子/毁灭者走离场分支）
  const st = w.store;
  w.groundLevel = 40;
  w.rockLevel = 60;
  for (let x = 0; x < W; x++) st.setTile(x, FLOOR, 1);
  return w;
}

function makeHooks(world: World, playerAt: { x: number; y: number }) {
  const enemies: Enemy[] = [];
  const projectiles: Array<{ projId?: number; damage?: number; vx: number; vy: number }> = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
      else projectiles.push(e as typeof projectiles[number]);
    },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
  } as unknown as Player;
  const hooks = {
    world, player,
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
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, em, player };
}

/** 全员存活敌怪逐 tick 驱动 */
function tick(h: ReturnType<typeof makeHooks>, n: number, only?: Enemy[]) {
  for (let i = 0; i < n; i++) {
    for (const e of only ?? h.enemies) {
      if (!e.dead) e.fixedUpdate(1 / 60, h.hooks);
    }
  }
}

const CX = 100 * TILE + 8, CY = (FLOOR - 20) * TILE;

/** 起一套完整合体（queen+双子+毁灭者+2 探针） */
function setupEnsemble(playerAt = { x: 100, y: 100 }) {
  const h = makeHooks(makeWorld(), playerAt);
  const queen = spawnMechQueenEnsemble(h.hooks, CX, CY)!;
  return { h, queen };
}

beforeEach(() => resetMechQueen());

describe('召唤门与链生成（NPC.SpawnMechQueen :19724-19751）', () => {
  it('anyMechBossUp：空场 false；127/125/126/134 任一存活 true；死体不计', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 100 });
    expect(anyMechBossUp(h.enemies)).toBe(false);
    for (const id of [127, 125, 126, 134]) {
      const e = Enemy.fromVanilla(id, CX, CY)!;
      e.id = h.em.nextId++;
      h.enemies.push(e);
      expect(anyMechBossUp(h.enemies), `id=${id}`).toBe(true);
      e.dead = true;
      expect(anyMechBossUp(h.enemies), `id=${id} dead`).toBe(false);
    }
  });

  it('同点生成：127+125+126+134+2×139 共 6 实体,全部落在 queen Center', () => {
    const { h, queen } = setupEnsemble();
    expect(h.enemies).toHaveLength(6);
    const ids = h.enemies.map((e) => e.vanillaId).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(ids).toEqual([125, 126, 127, 134, 139, 139]);
    for (const e of h.enemies) {
      expect(Math.abs(e.cx - queen.cx)).toBeLessThanOrEqual(1);   // (int)Center 同点
      expect(Math.abs(e.cy - queen.cy)).toBeLessThanOrEqual(1);
    }
  });

  it('探针挂链参数：ai2=毁灭者头引用、ai3=∓1 两侧（:19746-19747 第 7/8 参）', () => {
    const { h } = setupEnsemble();
    const head = h.enemies.find((e) => e.vanillaId === 134)!;
    const probes = h.enemies.filter((e) => e.vanillaId === 139);
    expect(probes).toHaveLength(2);
    expect(probes.map((p) => p.ai3).sort()).toEqual([-1, 1]);
    for (const p of probes) expect(p.ai2).toBe(head.id);
  });

  it('mechQueen 登记：召唤即刻 mechQueenUp/getMechQueen 命中（:19742）', () => {
    const { queen } = setupEnsemble();
    expect(mechQueenUp()).toBe(true);
    expect(getMechQueen()).toBe(queen);
  });
});

describe('登记失效与复位（IsMechQueenUp :6784-6798 / clearWorld :6907）', () => {
  it('queen 死亡 → mechQueenUp 惰性 false + 复位', () => {
    const { queen } = setupEnsemble();
    queen.dead = true;
    expect(mechQueenUp()).toBe(false);
    expect(getMechQueen()).toBeNull();
    // 复活不影响（已复位,须重登记）
    queen.dead = false;
    expect(mechQueenUp()).toBe(false);
  });

  it('resetMechQueen 清登记（进世界复位语义）', () => {
    setupEnsemble();
    resetMechQueen();
    expect(mechQueenUp()).toBe(false);
  });
});

describe('双子 mech 锚位（NPC.cs:26571-26579 雷眼 / :27194-27202 魔眼）', () => {
  it('锚点 = GetMechQueenCenter + (±150,-250)×0.75 绕中心 RotatedBy(queen.vx×0.025)', () => {
    const { queen } = setupEnsemble();
    queen.x = 1000 - queen.w / 2; queen.y = 500 - queen.h / 2; queen.vx = 0;
    const ret = mechQueenAnchor(queen, false);
    // vx=0 → 无旋转:中心 (1000,486) + (-112.5,-187.5)
    expect(ret.x).toBeCloseTo(1000 - 112.5, 5);
    expect(ret.y).toBeCloseTo(486 - 187.5, 5);
    const spaz = mechQueenAnchor(queen, true);
    expect(spaz.x).toBeCloseTo(1000 + 112.5, 5);
    // queen.vx=20 → 0.5rad 旋转偏移
    queen.vx = 20;
    const ang = 0.5;
    const r = mechQueenAnchor(queen, false);
    const ox = -112.5, oy = -187.5;
    expect(r.x).toBeCloseTo(1000 + ox * Math.cos(ang) - oy * Math.sin(ang), 5);
    expect(r.y).toBeCloseTo(486 + ox * Math.sin(ang) + oy * Math.cos(ang), 5);
  });

  it('雷眼一阶段:速度朝旋转锚点指数逼近 1/60(:26622-26679,速钳 14)', () => {
    const { h, queen } = setupEnsemble();
    queen.x = 1000 - queen.w / 2; queen.y = 500 - queen.h / 2; queen.vx = 20;
    const twin = h.enemies.find((e) => e.vanillaId === 125)!;
    // 眼放远处:delta 钳到 14 长度,v=(0×59+delta)/60
    twin.x = 1000 - twin.w / 2; twin.y = 1000 - twin.h / 2; twin.vx = 0; twin.vy = 0;
    twinsAI(twin, h.hooks, h.player, false);
    const a = mechQueenAnchor(queen, false);
    let dx = a.x - twin.cx, dy = a.y - twin.cy;
    const d = Math.hypot(dx, dy);
    expect(d).toBeGreaterThan(14);
    dx = dx / d * 14; dy = dy / d * 14;
    expect(twin.vx).toBeCloseTo(dx / 60, 5);
    expect(twin.vy).toBeCloseTo(dy / 60, 5);
    expect(Math.hypot(twin.vx, twin.vy)).toBeCloseTo(14 / 60, 5);
  });

  it('魔眼一阶段:同锚点但逼近系数 1/5(:27241-27248)', () => {
    const { h, queen } = setupEnsemble();
    queen.x = 1000 - queen.w / 2; queen.y = 500 - queen.h / 2; queen.vx = 0;
    const twin = h.enemies.find((e) => e.vanillaId === 126)!;
    twin.x = 1400 - twin.w / 2; twin.y = 900 - twin.h / 2; twin.vx = 0; twin.vy = 0;
    twinsAI(twin, h.hooks, h.player, true);
    const a = mechQueenAnchor(queen, true);
    let dx = a.x - twin.cx, dy = a.y - twin.cy;
    const d = Math.hypot(dx, dy);
    dx = dx / d * 14; dy = dy / d * 14;
    expect(twin.vx).toBeCloseTo((0 * 4 + dx) / 5, 5);
    expect(twin.vy).toBeCloseTo((0 * 4 + dy) / 5, 5);
  });

  it('queen 死后回落:速度不再朝锚点,改玩家侧悬浮点(:26607-26620 常规档)', () => {
    const { h, queen } = setupEnsemble();
    queen.dead = true;
    expect(mechQueenUp()).toBe(false);
    const twin = h.enemies.find((e) => e.vanillaId === 125)!;
    twin.x = (h.player.cx) - twin.w / 2; twin.y = h.player.cy - twin.h / 2;
    twin.vx = 0; twin.vy = 0;
    twinsAI(twin, h.hooks, h.player, false);
    // 常规档 seek:朝玩家侧 300/上 300 悬浮点 accelTo ±0.1 步进
    const side = twin.cx < h.player.x + h.player.w ? -1 : 1;
    const tx = h.player.cx + side * 300;
    expect(Math.sign(twin.vx)).toBe(Math.sign(tx - twin.cx));
    expect(twin.vx).toBeLessThanOrEqual(0.2);
  });

  it('变身段 mech 反弹弹幕旗标(:26812/:27435),非 mech 复位', () => {
    const { h, queen } = setupEnsemble();
    const twin = h.enemies.find((e) => e.vanillaId === 125)!;
    twin.bInit = true;                 // 跳过首帧 ai0/ai1 复位
    twin.ai0 = 1; twin.ai1 = 0; twin.ai2 = 0; twin.vx = 0; twin.vy = 0;
    twinsAI(twin, h.hooks, h.player, false);
    expect(twin.reflectsProjectiles).toBe(true);
    queen.dead = true;
    twinsAI(twin, h.hooks, h.player, false);
    expect(twin.reflectsProjectiles).toBe(false);
  });
});

describe('Prime 头 mech 分支（AI_032 :27736-28054）', () => {
  it('旋冲减速:冲速 2×0.6(有 135 段在场)=1.2(:27951-27955)', () => {
    const { h, queen } = setupEnsemble();
    // 毁灭者已生成 135 段链(destroyerAI 首帧)——先驱动毁灭者一帧出链
    const dest = h.enemies.find((e) => e.vanillaId === 134)!;
    tick(h, 1, [dest]);
    expect(h.enemies.some((e) => !e.dead && e.vanillaId === 135)).toBe(true);
    queen.ai1 = 1; queen.ai2 = 0;
    skeletronPrimeAI(queen, h.hooks, h.player);
    const spd = Math.hypot(queen.vx, queen.vy);
    expect(spd).toBeCloseTo(2 * 0.6, 3);
    // 段全灭 → ×0.75 = 1.5
    for (const e of h.enemies) if (e.vanillaId === 135 || e.vanillaId === 136) e.dead = true;
    skeletronPrimeAI(queen, h.hooks, h.player);
    expect(Math.hypot(queen.vx, queen.vy)).toBeCloseTo(2 * 0.75, 3);
  });

  it('离场级联:双子尽 → 毁灭者头静默消散 + 自身鼓励消散(:27975-28011)', () => {
    const { h, queen } = setupEnsemble();
    for (const e of h.enemies) {
      if (e.vanillaId === 125 || e.vanillaId === 126) e.dead = true;
    }
    const dest = h.enemies.find((e) => e.vanillaId === 134)!;
    queen.ai1 = 3;
    skeletronPrimeAI(queen, h.hooks, h.player);
    expect(dest.dead).toBe(true);          // Transform(136) → 段死分支消散
    expect(dest.bossFled).toBe(true);      // 静默:不走击败记账
    expect(queen.despawnEncouraged).toBe(true);
  });
});

describe('毁灭者 mech 锁位与蛇发段链（AI_037 :50611-50620/:50131-50413）', () => {
  it('头锁位:中心 = queen 锚 + (0,100) 旋转 + queen 速度,速度清零,旋转 = ang×0.75+π', () => {
    const { h, queen } = setupEnsemble();
    queen.x = 2000 - queen.w / 2; queen.y = 800 - queen.h / 2;
    queen.vx = 20; queen.vy = 0;
    const dest = h.enemies.find((e) => e.vanillaId === 134)!;
    tick(h, 1, [dest]);
    const qc = { x: 2000, y: 800 - 14 };            // GetMechQueenCenter
    const ang = 20 * 0.025;
    const px = qc.x - 100 * Math.sin(ang), py = qc.y + 100 * Math.cos(ang);
    expect(dest.cx).toBeCloseTo(px + 20, 4);
    expect(dest.cy).toBeCloseTo(py, 4);
    expect(dest.vx).toBe(0);
    expect(dest.vy).toBe(0);
    expect(dest.spin).toBeCloseTo(ang * 0.75 + Math.PI, 5);
  });

  it('蛇发段链压缩:头后第 1 段跟距 4.4px、Y 悬挂 44(:50386-50410);≥10 段回落 44 常规', () => {
    const { h, queen } = setupEnsemble();
    const dest = h.enemies.find((e) => e.vanillaId === 134)!;
    tick(h, 1, [dest]);                              // 出链 + 头锁位
    const s1 = dest.wormNext!;
    // 放到头右侧 200px:目标向量 = (头-段, 头+44-段),收缩到 4.4
    s1.x = dest.cx + 200 - s1.w / 2;
    s1.y = dest.cy - s1.h / 2;
    tick(h, 1, [dest]);
    const targetY = dest.cy + 44;                    // num25(num=1)=44
    const dist = Math.hypot(s1.cx - dest.cx, s1.cy - targetY);
    expect(dist).toBeCloseTo(4.4, 1);                // num24/10×num = 4.4
    // 第 11 段(idx=11 ≥ 10 → num=0)走常规 44px 跟随(无 Y 悬挂偏置)
    let seg: Enemy | null = dest.wormNext;
    for (let i = 1; i < 11 && seg; i++) seg = seg.wormNext;
    expect(seg).not.toBeNull();
    const s11 = seg!;
    s11.x = dest.cx + 300 - s11.w / 2;
    s11.y = dest.cy - s11.h / 2;
    tick(h, 1, [dest]);
    const d11 = Math.hypot(s11.cx - dest.cx, s11.cy - dest.cy);
    expect(d11).toBeCloseTo(44, 1);
  });
});

describe('探针挂链公转（AI_005 :50866-50920）', () => {
  it('ai3≠0 探针绕毁灭者头公转锁位 + 无敌;速度 = queen 速度', () => {
    const { h, queen } = setupEnsemble();
    queen.vx = 0; queen.vy = 0;
    const dest = h.enemies.find((e) => e.vanillaId === 134)!;
    tick(h, 1, [dest]);                              // 头锁位(spin = 0×0.75+π)
    const probes = h.enemies.filter((e) => e.vanillaId === 139);
    const p = probes[0];
    tick(h, 1, [p]);
    // spin=π:offset (26×ai3,0) 旋转 π → (-26×ai3,0)
    const expectedX = dest.cx - 26 * p.ai3;
    expect(p.cx).toBeCloseTo(expectedX, 3);
    expect(p.cy).toBeCloseTo(dest.cy, 3);
    expect(p.dontTakeDamage).toBe(true);
    // 134 死 → 探针脱落回常规(ai3=0,解除无敌)
    dest.dead = true;
    tick(h, 1, [p]);
    expect(p.ai3).toBe(0);
    expect(p.dontTakeDamage).toBe(false);
  });
});

describe('queen FindFrame 帧 3-5（NPC.cs:75196-75231）', () => {
  it('mech 态:悬浮 0..4 爬坡后 3↔4 循环;攻击态恒帧 5;非 mech 保持 0-2', () => {
    const { queen } = setupEnsemble();
    expect(mechQueenUp()).toBe(true);
    queen.ai1 = 0;
    const seq: number[] = [];
    for (let t = 0; t <= 8 * 12; t += 12) {
      queen.animT = t;
      seq.push(vanillaFrameIdx(queen, 6));
    }
    expect(seq).toEqual([0, 1, 2, 3, 4, 3, 4, 3, 4]);
    queen.ai1 = 1;
    expect(vanillaFrameIdx(queen, 6)).toBe(5);
    resetMechQueen();                                // 非 mech 回落
    queen.ai1 = 0; queen.animT = 13;
    expect(vanillaFrameIdx(queen, 6)).toBe(1);
    queen.ai1 = 1;
    expect(vanillaFrameIdx(queen, 6)).toBe(2);
  });
});

describe('公告 LegacyMisc[107]（SpawnBoss :81492-81496）', () => {
  it('l10n 产物含 LegacyMisc.107 = "机械美杜莎已苏醒!"（原版键,无自有键）', () => {
    // 测试环境无语言包加载（Lang.misc 未绑定时回退键名）——直接对扁平产物断言
    const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf-8'));
    expect(pack.LegacyMisc['107']).toBe('机械美杜莎已苏醒！');
  });
});
