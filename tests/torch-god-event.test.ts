// 火把神事件链（docs/audit/item-audit-2026-08-22.md 补 B 要点 8「事件体量中批」）。
// 原版态机（Player.cs:17569-17770 + :17923-17939 门 + Projectile.cs AI_184 :40100）：
//   门（五条件缺一不可,:17923-17935）：torchGodCooldown≤0 && !unlockedBiomeTorches
//   && 点燃火把>100 && !happyFunTorchTime && y>worldSurface && 背包无 5043
//   → happyFunTorchTime=true（事件态）
//   进行：每 tick AddBuff(80 Blackout,2t)；funTimer>20 每 21t 一攻击轮：
//     扫 ±100 盒点燃火把（容量 200）→ 无剩余/attacks≥200 → 复燃+结束（≥95 掉 5043）；
//     否则随机熄一根（frameX+=66）+ 弹 949（speed8、range=距离、ai0=尘型）
//   664 火把神：原版无生成路径（全量核查,事件实体=弹幕 949）——图鉴记账在 5043
//   使用侧 RegisterKill（:44616-44620）+ 进世界已解锁回填（:37109-37116）
// 附：546 亮核 Extra[76] 叠画 rotation 钳（Main.cs:26156-26158）+
//   393 飞碟炮塔 origin+UnitY×(−8) 枢轴（Main.cs:24208-24213,rotation 台账登记项）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { Renderer } from '../src/render/Renderer';
import { TorchGodEvent, type TorchGodHost } from '../src/world/TorchGod';
import { TorchGodProj } from '../src/entities/WeaponProj';
import { TORCH_DUST_BY_STYLE } from '../src/world/Torch';
import { T } from '../src/data/tiles';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import type { World as WorldT } from '../src/world/World';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const W = 150, H = 150, SURFACE = 40, PX = 75, PY = 90;

function makeWorld(): World {
  const w = new World(W, H, 11, 'torch-god');
  w.groundLevel = SURFACE;
  for (let x = 0; x < W; x++) w.store.setTile(x, H - 4, 1);   // 底板
  return w;
}

/** 火把神事件桩：真实 TileStore + 记录型 bolt/drop/blackout 通道 */
function makeHarness(opts?: { unlocked?: boolean; holdingFavor?: boolean }) {
  const w = makeWorld();
  let unlocked = opts?.unlocked ?? false;
  let holdingFavor = opts?.holdingFavor ?? false;
  let ptile = { x: PX, y: PY };
  const bolts: Array<{ x: number; y: number; vx: number; vy: number; range: number; dust: number }> = [];
  const drops: Array<{ vid: number; x: number; y: number }> = [];
  const blackoutLog: boolean[] = [];
  const host: TorchGodHost = {
    store: w.store,
    worldSurface: w.groundLevel,
    playerTile: () => ptile,
    unlockedBiomeTorches: () => unlocked,
    hasVanillaItem: (vid) => vid === 5043 && holdingFavor,
    spawnTorchBolt: (x, y, vx, vy, range, dust) => bolts.push({ x, y, vx, vy, range, dust }),
    dropVanillaItem: (vid, px, py) => { drops.push({ vid, x: px, y: py }); },
    setBlackout: (on) => { blackoutLog.push(on); },
  };
  const ev = new TorchGodEvent(host);
  const placeTorches = (n: number, style = 0, x0 = PX - 30, y0 = PY - 30) => {
    for (let k = 0; k < n; k++) {
      w.store.setTile(x0 + (k % 12), y0 + Math.floor(k / 12), T.TORCH, 0, style * 22);
    }
  };
  return { w, ev, host, bolts, drops, blackoutLog, placeTorches,
    get unlocked() { return unlocked; }, set unlocked(v: boolean) { unlocked = v; },
    set ptile(v: { x: number; y: number }) { ptile = v; } };
}

const gate = (h: ReturnType<typeof makeHarness>) => {
  for (let i = 0; i < 60; i++) h.ev.update();   // 60t 扫描节流
};

/** 弹 949 桩（记录尘/音/伤害） */
function makeProjHarness(unlocked: boolean, solidAt?: [number, number]) {
  const w = makeWorld();
  if (unlocked) w.flags.unlockedBiomeTorches = true;
  if (solidAt) w.store.setTile(solidAt[0], solidAt[1], 1);
  const dustCalls: Array<{ x: number; y: number; type: number; velMul: number }> = [];
  const sfx: string[] = [];
  const dmgCalls: number[] = [];
  const player = {
    x: 100, y: 100, w: 20, h: 42, cx: 110, cy: 121,
    lastDamageCause: null as unknown,
    damage: (amt: number) => { dmgCalls.push(amt); },
  };
  const game = {
    world: w,
    player,
    playSfxWav: (name: string) => { sfx.push(name); },
  } as unknown as GameHooks;
  const dust = (x: number, y: number, type: number, velMul: number) =>
    dustCalls.push({ x, y, type, velMul });
  return { w, game, dustCalls, sfx, dmgCalls, player, dust };
}

/** 记录型 ctx 直调 drawEnemy（rotation-ledger-remainder 同款 + set 通道） */
function drawRec(e: Enemy, w: WorldT, rect = { sw: 30, sh: 30 }) {
  const calls: Array<{ m: string; a: unknown[] }> = [];
  const sets: Array<{ k: string; v: unknown }> = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => (k === 'canvas' ? undefined : (...a: unknown[]) => { calls.push({ m: String(k), a }); }),
    set: (_t, k, v) => { sets.push({ k: String(k), v }); return true; },
  });
  const rectStub = { img: { width: rect.sw, height: rect.sh }, sx: 0, sy: 0, sw: rect.sw, sh: rect.sh };
  const fake = {
    ctx,
    assets: { enemySprites: new Map() },
    atlas: {
      vnpc: () => rectStub,
      ensureVImage: () => null,
      vmisc: (p: string) => (p === 'vanilla/Extra_76.png' ? rectStub : null),
    },
    drawNpcGlow: () => {},
    // 546 亮核走真实现（共轭换角/两步式断言对象）——fake 以自身为 this 回绑
    draw546GlowCore: null as unknown,
  };
  fake.draw546GlowCore = (...a: unknown[]) =>
    (Renderer.prototype as unknown as Record<string, (...b: unknown[]) => void>)
      .draw546GlowCore.apply(fake, a);
  (Renderer.prototype as unknown as { drawEnemy: (this: unknown, e: Enemy, w: WorldT) => void })
    .drawEnemy.call(fake, e, w);
  return { calls, sets };
}
const spawnVanilla = (w: WorldT, id: number, tx: number, ty: number): Enemy => {
  const e = Enemy.fromVanilla(id, tx * TILE, ty * TILE)!;
  e.id = 1;
  return e;
};

// ---------------------------------------------------------------------------
// 事件门矩阵（:17923-17939）
// ---------------------------------------------------------------------------
describe('火把神事件门（Player.cs:17923-17939 五条件）', () => {
  it('火把数门：100 根点燃不触发,101 根触发（nearbyTorches > 100）', () => {
    const h = makeHarness();
    h.placeTorches(100);
    gate(h);
    expect(h.ev.active).toBe(false);
    h.placeTorches(1);
    h.w.store.setTile(PX + 30, PY + 20, T.TORCH, 0, 0);   // 第 101 根（异格）
    gate(h);
    expect(h.ev.active).toBe(true);
    expect(h.ev.attacks).toBe(0);               // numberOfTorchAttacksMade=0（:17937）
  });

  it('熄灭火把（frameX≥66）不计数：101 根全熄不触发（:17622 frameX<66 才 ++）', () => {
    const h = makeHarness();
    h.placeTorches(101);
    for (let k = 0; k < 101; k++) {
      const x = PX - 30 + (k % 12), y = PY - 30 + Math.floor(k / 12);
      const i = h.w.store.idx(x, y);
      h.w.store.frameX[i] += 66;
    }
    gate(h);
    expect(h.ev.active).toBe(false);
  });

  it('地下门：玩家在地表上不触发（position.Y > worldSurface×16）', () => {
    const h = makeHarness();
    h.placeTorches(101);
    h.ptile = { x: PX, y: SURFACE - 5 };
    gate(h);
    expect(h.ev.active).toBe(false);
  });

  it('冷却门：结束后 3600t 内不触发且逐 tick 递减（torchGodCooldown :17588-17590）', () => {
    const h = makeHarness();
    h.placeTorches(101);
    gate(h);
    h.ev['end'](true);                          // 强制结束置 cooldown=3600
    expect(h.ev.cooldown).toBe(3600);
    for (let i = 0; i < 3600; i++) h.ev.update();
    expect(h.ev.cooldown).toBe(0);              // 冷却耗尽
    gate(h);
    expect(h.ev.active, '冷却归零后重新可触发').toBe(true);
  });

  it('unlock 前置：unlockedBiomeTorches=true 永不触发（:17924 门,本批补）', () => {
    const h = makeHarness({ unlocked: true });
    h.placeTorches(101);
    gate(h);
    expect(h.ev.active).toBe(false);
  });

  it('背包 5043 门：持有恩宠未使用也不触发（:17928-17935 背包扫描）', () => {
    const h = makeHarness({ holdingFavor: true });
    h.placeTorches(101);
    gate(h);
    expect(h.ev.active).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 事件态转移（happyFunTorchTime / EndOngoing / RelightTorches）
// ---------------------------------------------------------------------------
describe('事件态转移（TorchAttack :17666-17770）', () => {
  it('事件中每 tick Blackout 置位（AddBuff(80,2) :17671）;回地表立即结束', () => {
    const h = makeHarness();
    h.placeTorches(101);
    gate(h);
    expect(h.ev.active).toBe(true);
    h.ev.update();                              // 事件态 step：blackout 置位
    expect(h.blackoutLog[h.blackoutLog.length - 1]).toBe(true);
    h.ptile = { x: PX, y: SURFACE - 5 };        // 升回地表
    h.ev.update();
    expect(h.ev.active, 'y<worldSurface → EndOngoingTorchGodEvent（:17569-17578）').toBe(false);
    expect(h.ev.cooldown, 'RelightTorches 置 3600（:17648）').toBe(3600);
  });

  it('中止复燃：已熄火把全部还原 frameX−=66,无掉落（RelightTorches :17648-17660）', () => {
    const h = makeHarness();
    h.placeTorches(101);
    gate(h);
    for (let i = 0; i < 21; i++) h.ev.update(); // 首攻击轮：熄一根
    expect(h.ev.attacks).toBe(1);
    const unlit = [];
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
      const i = h.w.store.idx(x, y);
      if (h.w.store.flags[i] && h.w.store.type[i] === T.TORCH && h.w.store.frameX[i] >= 66) {
        unlit.push([x, y, h.w.store.frameX[i]]);
      }
    }
    expect(unlit.length).toBe(1);
    h.ptile = { x: PX, y: SURFACE - 5 };
    h.ev.update();
    const i0 = h.w.store.idx(unlit[0][0], unlit[0][1]);
    expect(h.w.store.frameX[i0], '复燃还原原值').toBe(unlit[0][2] - 66);
    expect(h.drops.length, '中止不掉 5043').toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 664 火把神：无生成路径 + 图鉴记账在 5043 使用侧（:44616-44620/:37109-37116）
// ---------------------------------------------------------------------------
describe('664 火把神处置（事件实体=弹幕 949,664 仅图鉴记账）', () => {
  it('事件体不生成 NPC、事件尾不记图鉴——记账移至 5043 使用侧 RegisterKill(664)', () => {
    const godSrc = readFileSync(ROOT + 'src/world/TorchGod.ts', 'utf8').replace(/\/\/.*$/gm, '');
    expect(godSrc, '事件类无 NPC 生成/图鉴通道').not.toMatch(/spawnEnemy|onBestiaryUnlock|NewNPC/);
    const gameSrc = readFileSync(ROOT + 'src/core/Game.ts', 'utf8');
    expect(gameSrc, 'case 5043 → registerKill(664)（:44616-44620）').toContain('registerKill(664)');
    expect(gameSrc, 'case 5043 → 成就 24（HandleSpecialEvent :44615）').toContain('handleSpecialEvent(24');
    expect(gameSrc, '进世界已解锁回填（Player.Spawn :37109-37116,权威端门）')
      .toContain('if (w.flags.unlockedBiomeTorches && (!this.net || this.net.policy.isHost))');
    expect(gameSrc, 'achCheckEquipState 不再持有判成就（原版无此路径）')
      .not.toContain("vanillaIdOfItem(s.id) === 5043");
  });

  it('事件全程零 NPC 生成（行为面：host 无 NPC 通道,弹幕 949 是唯一事件实体）', () => {
    const h = makeHarness();
    h.placeTorches(101);
    gate(h);
    for (let i = 0; i < 21 * 3; i++) h.ev.update();
    expect(h.bolts.length, '3 攻击轮 = 3 弹').toBe(3);
    expect(h.ev.active).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 弹 949（TorchGod / AI_184_BadTorchLuck :40100-40130 + Kill :67632-67652）
// ---------------------------------------------------------------------------
describe('弹 949 生成与行为（AI_184）', () => {
  it('攻击轮：21t 一轮,随机熄一根 frameX+=66 + 弹速=指向玩家×8 + range=距离 + ai0=尘型', () => {
    const h = makeHarness();
    h.placeTorches(101, 9);                     // 丛林样式 9 → TorchID.Dust[9]=135
    gate(h);
    for (let i = 0; i < 21; i++) h.ev.update();
    expect(h.ev.attacks).toBe(1);
    expect(h.bolts.length).toBe(1);
    const b = h.bolts[0];
    const sx = b.x, sy = b.y;
    expect((sx - 8) % 16, '出生=火把 tile 顶 (x*16+8, y*16)（:17753）').toBe(0);
    expect(b.range, 'ai[1]=发射时与玩家距离（:17758）').toBeGreaterThan(0);
    const spd = Math.hypot(b.vx, b.vy);
    expect(spd, 'speed 8（num7=8f :17752）').toBeCloseTo(8, 5);
    // 方向指向玩家中心（vector2=base.Center−vector :17754）
    const dx = PX * TILE - sx, dy = PY * TILE - sy;
    expect(b.vx / spd).toBeCloseTo(dx / Math.hypot(dx, dy), 5);
    expect(b.dust, 'ai[0]=TorchID.Dust[样式 9]=135（:17755-17756）').toBe(TORCH_DUST_BY_STYLE[9]);
    // 被熄那根 frameX+=66
    let unlit = 0;
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
      const i = h.w.store.idx(x, y);
      if (h.w.store.flags[i] && h.w.store.type[i] === T.TORCH && h.w.store.frameX[i] >= 66) unlit++;
    }
    expect(unlit).toBe(1);
  });

  it('弹 AI：射程内穿过实心块不毁;射程耗尽后 tileCollide=true 撞块即 Kill（:40112-40119）', () => {
    const inRange = makeProjHarness(false, [20, 12]);
    const p1 = new TorchGodProj(16 * 20 - 40, 16 * 12, 8, 0, 1000, 6, inRange.dust);
    p1.fixedUpdate(1 / 60, inRange.game);       // 射程未耗尽：穿过实心块
    expect(p1.dead).toBe(false);
    expect(inRange.dmgCalls.length).toBe(0);

    const spent = makeProjHarness(false, [20, 12]);
    const p2 = new TorchGodProj(16 * 20 - 8, 16 * 12, 8, 0, 8, 6, spent.dust);
    p2.fixedUpdate(1 / 60, spent.game);         // ai[1]-=8 → ≤0 → tileCollide=true → 撞块
    expect(p2.dead, '射程耗尽撞实心块 Kill').toBe(true);
    expect(spent.sfx, 'Kill 音 Item10（:67634）').toContain('Item_10');
    expect(spent.dustCalls.length, 'Kill 爆 20 粒（num18=20f :67636）').toBe(20);
    expect(spent.dustCalls[0].velMul, 'Kill 尘 vel×0.8（:67646）').toBe(0.8);
  });

  it('弹 AI：每 AI 4 粒尾迹沿 velocity/4×k 布点 vel×0.3（:40120-40130）', () => {
    const h = makeProjHarness(false);
    const p = new TorchGodProj(0, 0, 8, 0, 1000, 59, h.dust);
    p.fixedUpdate(1 / 60, h.game);
    const trail = h.dustCalls.slice(0, 4);
    expect(h.dustCalls.length).toBe(4);
    expect(trail[3].x, '第 4 粒在 velocity/4×3 处').toBeCloseTo(6, 5);
    expect(trail[0].velMul, '尾迹 vel×0.3（:40127）').toBe(0.3);
    expect(trail[0].type).toBe(59);
    expect(h.sfx, '首帧 Item8（localAI[0]==0 :40109-40111）').toContain('Item_8');
  });

  it('命中玩家：未解锁真伤+Kill;已解锁 damage=0 直穿（AI_184 :40103-40105）', () => {
    const locked = makeProjHarness(false);
    const p1 = new TorchGodProj(90, 118, 8, 0, 1000, 6, locked.dust);
    p1.fixedUpdate(1 / 60, locked.game);
    expect(locked.dmgCalls.length, '未解锁 → 真伤（本仓 1457 语义 :43575）').toBe(1);
    expect(locked.dmgCalls[0]).toBe(40);   // ★V5 复核补强：经典档基伤 40（hostileProjectileDamage(40,classic);曾只断 >0,回归 20 不红）
    expect(p1.dead).toBe(true);
    expect(locked.player.lastDamageCause).toMatchObject({ kind: 'projectile' });

    const unlockedH = makeProjHarness(true);
    const p2 = new TorchGodProj(90, 118, 8, 0, 1000, 6, unlockedH.dust);
    p2.fixedUpdate(1 / 60, unlockedH.game);
    expect(unlockedH.dmgCalls, 'unlockedBiomeTorches → damage=0 假伤直穿（:40104-40106）')
      .toHaveLength(0);
    expect(p2.dead).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 判定与奖励（≥95 掉 5043 / 容量 200 / 终幕延迟 -180）
// ---------------------------------------------------------------------------
describe('判定掉落 5043（:17711-17724）', () => {
  it('全熄且 attacks≥95 → 复燃+掉 5043+cooldown 3600+blackout 关', () => {
    const h = makeHarness();
    h.placeTorches(101);
    gate(h);
    for (let i = 0; i < 21 * 101 + 300; i++) h.ev.update();  // 100 轮+余1(-180 终幕延迟)+末轮
    expect(h.ev.active).toBe(false);
    expect(h.ev.attacks).toBe(101);
    expect(h.drops, 'attacks≥95 → NewItem(5043)（:17719-17724）')
      .toEqual([{ vid: 5043, x: PX * TILE, y: PY * TILE }]);
    expect(h.ev.cooldown, 'RelightTorches 置 3600（余下 update 递减中）')
      .toBeGreaterThan(3400);
    expect(h.ev.cooldown).toBeLessThanOrEqual(3600);
    expect(h.blackoutLog[h.blackoutLog.length - 1]).toBe(false);
    let unlit = 0;
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
      const i = h.w.store.idx(x, y);
      if (h.w.store.flags[i] && h.w.store.type[i] === T.TORCH && h.w.store.frameX[i] >= 66) unlit++;
    }
    expect(unlit, '终幕全复燃').toBe(0);
  });

  it('容量 200：attacks≥maxTorchAttacks（:2938）→ funTimer=-180 终幕延迟后才结束+掉落', () => {
    const h = makeHarness();
    h.placeTorches(300);
    gate(h);
    // 200 攻击轮（每轮 21t）→ 第 200 轮置 funTimer=-180
    for (let i = 0; i < 21 * 200; i++) h.ev.update();
    expect(h.ev.attacks).toBe(200);
    expect((h.ev as unknown as { funTimer: number }).funTimer, '（余1且≥95）||≥200 → -180（:17761-17766）')
      .toBe(-180);
    expect(h.ev.active, '-180 延迟期内事件未结束').toBe(true);
    expect(h.drops.length).toBe(0);
    for (let i = 0; i < 201 + 40; i++) h.ev.update();        // 3s 终幕延迟走完
    expect(h.ev.active).toBe(false);
    expect(h.drops, '200≥95 → 掉落').toEqual([{ vid: 5043, x: PX * TILE, y: PY * TILE }]);
  });
});

// ---------------------------------------------------------------------------
// 渲染两件：546 亮核 Extra[76]（Main.cs:26156-26158）+ 393 枢轴（:24208-24213）
// ---------------------------------------------------------------------------
describe('546 亮核叠画（Extra[76],rotation=Clamp(vx×0.1,±π/8)）', () => {
  it('rotation 钳：vx×0.1 超界钳 ±π/8,界内线性;与本体 visAngle 共轭换角', () => {
    const w = makeWorld();
    const mk = (vx: number) => {
      const e = spawnVanilla(w, 546, 40, 60);
      e.visAngle = 1.25; e.vx = vx; e.facing = 1;
      return drawRec(e, w, { sw: 30, sh: 30 });
    };
    const mid = mk(2);
    const rots = mid.calls.filter((c) => c.m === 'rotate').map((c) => (c.a as number[])[0]);
    expect(rots, '本体 rotate(visAngle) + 亮核共轭 rotate(θ−visAngle) 恰两条').toHaveLength(2);
    expect(rots[0]).toBeCloseTo(1.25, 5);
    expect(rots[1], 'θ=Clamp(2×0.1)=0.2 → 共轭角 0.2−1.25').toBeCloseTo(0.2 - 1.25, 5);

    const hi = mk(10).calls.filter((c) => c.m === 'rotate').map((c) => (c.a as number[])[0]);
    expect(hi[1], 'vx=10 → 钳 +π/8（:26158 Clamp）').toBeCloseTo(Math.PI / 8 - 1.25, 5);
    const lo = mk(-10).calls.filter((c) => c.m === 'rotate').map((c) => (c.a as number[])[0]);
    expect(lo[1], 'vx=−10 → 钳 −π/8').toBeCloseTo(-Math.PI / 8 - 1.25, 5);
  });

  it('叠画两步式：Extra_76 同帧矩形 destination-out(200/255)+lighter(1),锚=本体 bodyY', () => {
    const w = makeWorld();
    const e = spawnVanilla(w, 546, 40, 60);
    e.visAngle = 0.3; e.vx = 2; e.facing = 1;
    const { calls, sets } = drawRec(e, w, { sw: 30, sh: 30 });
    const imgs = calls.filter((c) => c.m === 'drawImage' && (c.a as unknown[]).length === 9);
    expect(imgs.length, '本体+亮核削底+亮核加色 = 3 张 9 参 drawImage').toBe(3);
    const by = -30 + 4;                         // 地面型 anchorY=-sh+4/scale（scale=1）
    for (const im of imgs) {
      const a = im.a as number[];
      expect(a[4], '亮核取本体同帧矩形（rCurrentNPC.frame :26158）').toBe(30);
      expect(a[6], '同锚叠画（vector72+halfSize origin）').toBe(by);
    }
    const comps = sets.filter((s) => s.k === 'globalCompositeOperation').map((s) => s.v);
    expect(comps).toContain('destination-out');
    expect(comps).toContain('lighter');
    const alphas = sets.filter((s) => s.k === 'globalAlpha').map((s) => s.v);
    expect(alphas, 'Color(255,255,255,200) → 削底 200/255 + 加色 1').toContain(200 / 255);
  });
});

describe('393 飞碟炮塔 origin 枢轴（Main.cs:24208-24213 num225=-8）', () => {
  it('393 本体绘制 y+8（origin 上移 8 纹素=精灵下移 8×scale）;392 无偏移', () => {
    const w = makeWorld();
    const turret = spawnVanilla(w, 393, 80, 20);
    turret.visAngle = 0.7;
    const tc = drawRec(turret, w, { sw: 20, sh: 20 });
    const tImg = tc.calls.filter((c) => c.m === 'drawImage' && (c.a as unknown[]).length === 9);
    expect(tImg.length).toBeGreaterThanOrEqual(1);
    expect((tImg[0].a as number[])[6], '393: anchorY(−sh/2 飞行型)+8').toBe(-10 + 8);
    const rot = tc.calls.find((c) => c.m === 'rotate');
    expect((rot!.a as number[])[0], '393 旋转仍绕局部原点（origin 钉 position=枢轴上移 8px）')
      .toBeCloseTo(0.7, 5);

    const hull = spawnVanilla(w, 392, 80, 20);
    const hc = drawRec(hull, w, { sw: 20, sh: 20 });
    const hImg = hc.calls.filter((c) => c.m === 'drawImage' && (c.a as unknown[]).length === 9);
    expect((hImg[0].a as number[])[6], '392 num225=0 无偏移').toBe(-10);
  });

  it('spriteBottomWorld 同步 +8（393 专属,兜底定位面）', () => {
    const w = makeWorld();
    const turret = spawnVanilla(w, 393, 80, 20);
    drawRec(turret, w, { sw: 20, sh: 20 });
    const base = turret.vanilla?.noGravity ? turret.cy : turret.y + turret.h;
    expect(turret.spriteBottomWorld).toBe(base + (-10 + 8 + 20));
  });
});
