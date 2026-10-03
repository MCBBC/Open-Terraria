// ★BJ464（2026-10-03 用户实报：杀死的宝箱怪贴图在几种不同类型的宝箱怪贴图间来回切换）
//
// 定谳（反编译 1457 亲读）：
//   · 原版 NPC 85（Mimic）= 18 帧竖条（Main.npcFrameCount[85]=18，Main.cs:67493 表），
//     NPC_85.png 32×828（46px/行）=【三变体段各 6 行】：0-5 金箱（地表）/6-11 暗影箱
//     （洞穴）/12-17 黑曜石箱（地狱）——像素直方图实证（三段 row0 均色
//     (84,70,61)/(117,109,74)/(85,88,109) 三色显著分离）。
//   · 段选择=AI_025 头一次性锁（NPC.cs:25684-25697）：ai[3]==0 时 position.X+=8f 并按
//     生成深度锁段（>worldSurface=2、>UnderworldLayer=3、否则 1），锁后永不重算；
//     341/629 恒段 1（:25699-25701）。FindFrame case 85/341/629（:74239-74320）按
//     ai[3] 加段偏移（==2→+6/:74301、==3→+12/:74303）。
//   · 本仓差异（旧档）：mimicAI 从不写 ai3（变体面整缺）+ vanillaFrameIdx aiStyle 25
//     通用支 `1+t/5%(frames-1)` 对 18 帧在 1..17 全条循环 → 活跃宝箱怪每 5 tick 跨
//     金箱/暗影箱/黑曜石箱三变体来回切换（用户实报根因）；伪装档恒帧 0=地下怪伪装成
//     金箱（原版应按段显示暗影/黑曜石箱壳）。
// 落刀：Enemy.mimicAI 变体段一次性锁 + mimicFrameT（FindFrame 腾空++/落地--钳 0..12）；
//   Renderer.vanillaFrameIdx 拆 aiStyle 25 专支（伪装=段首帧/激活=段内行 1..5+段偏移）。
// 判别面：①段锁定（生成时锁，不随深度漂移）②死亡全帧贴图源恒定（一生帧号 ∈ 锁定段）
//   ③池串型负向锁（帧号与全局 animT 无关——旧公式在 t=25 即越段到 6）。
import { describe, it, expect } from 'vitest';
import { vanillaFrameIdx } from '../src/render/Renderer';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import type { Enemy as EnemyT } from '../src/entities/Enemy';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';

/** 帧机测试假体（armed-zombie-frame.test.ts 同构） */
function mk(id: number): EnemyT {
  return {
    vanillaId: id,
    customFrameIdx: null,
    vanilla: { aiStyle: 25 },
    animT: 0,
    ai0: 1,
    ai3: 1,
    mimicFrameT: 0,
    vx: 0,
    vy: 0,
  } as unknown as EnemyT;
}

/** AI 测试夹具（bj175 mkHooks 同构）：指定 groundLevel 的竖井世界 */
function mkHooks(groundLevel: number, floorRow = 300, withPlayer = false) {
  const w = new World(120, 400, 1, 'bj464');
  w.groundLevel = groundLevel;
  // 全域清空 + 地板行 floorRow（默认 300=地狱深度档；洞穴档战斗用 150）
  for (let x = 0; x < 120; x++) {
    for (let y = 0; y < floorRow; y++) w.store.setTileSilent(x, y, 0, 0, 0);
    w.store.setTileSilent(x, floorRow, 1, 0, 0);
  }
  const hooks = {
    world: w,
    player: withPlayer ? new Player(20 * 16, (floorRow - 3) * 16, new Inventory()) : null,
    // withPlayer=true：真实玩家（hurt 的 luck/心星链需要；也保持宝箱怪活跃=战斗面）
    enemies: () => enemies,
    critters: () => [],
    projectiles: () => [],
    entities: { nextId: 1, add: () => {} },
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    spawnDust: () => ({ x: 0, y: 0, vx: 0, vy: 0 }),
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    playSfxFile: () => {},
    showPickupLabel: () => {},
    broadcastParticleOrchestra: () => {},
  };
  const enemies: EnemyT[] = [];
  return { hooks: hooks as unknown as GameHooks, world: w, enemies };
}

/** 直接驱 AI_025 核（Enemy.fixedUpdate 的 aiStyle 25 分发体；mimicAI 为私有方法） */
function tickMimicAI(hooks: GameHooks, e: EnemyT, n: number): void {
  const ai = (e as unknown as { mimicAI: (g: GameHooks, p: null) => void }).mimicAI;
  for (let i = 0; i < n; i++) ai.call(e, hooks, null);
}

describe('BJ464 帧机（FindFrame case 85/341/629 :74239-74320 + AI_025 段锁 :25684-25697）', () => {
  it('段 1（地表金箱）：伪装=帧0；激活段内行 1..5 按 mimicFrameT（<3/<6/<9/<12/else）', () => {
    const e = mk(85);
    e.ai0 = 0;
    expect(vanillaFrameIdx(e, 18)).toBe(0);        // 伪装态 frame.Y=0（:74240-74243）
    e.ai0 = 1;
    for (const [c, want] of [[0, 1], [2, 1], [3, 2], [5, 2], [6, 3], [8, 3], [9, 4], [11, 4], [12, 5]] as const) {
      e.mimicFrameT = c;
      expect(vanillaFrameIdx(e, 18), `c=${c}`).toBe(want);
    }
  });

  it('段 2/3 段偏移 +6/+12（:74301/:74303）：伪装帧 6/12、激活 7..11/13..17', () => {
    const e = mk(85);
    e.ai3 = 2;
    e.ai0 = 0;
    expect(vanillaFrameIdx(e, 18)).toBe(6);        // 伪装=暗影箱壳（旧档恒帧 0 金箱=偏差）
    e.ai0 = 1;
    for (const [c, want] of [[0, 7], [12, 11]] as const) {
      e.mimicFrameT = c;
      expect(vanillaFrameIdx(e, 18), `c=${c}`).toBe(want);
    }
    e.ai3 = 3;
    e.ai0 = 0;
    expect(vanillaFrameIdx(e, 18)).toBe(12);       // 伪装=黑曜石箱壳
    e.ai0 = 1;
    for (const [c, want] of [[0, 13], [12, 17]] as const) {
      e.mimicFrameT = c;
      expect(vanillaFrameIdx(e, 18), `c=${c}`).toBe(want);
    }
  });

  it('★池串型负向锁：帧号与全局 animT 无关（旧公式 t=25 即越段到 6=用户实报切换像）', () => {
    const e = mk(85);                              // ai3=1 段内
    for (let t = 0; t <= 200; t++) {
      e.animT = t;
      const f = vanillaFrameIdx(e, 18);
      expect(f, `animT=${t}`).toBeLessThanOrEqual(5);
      expect(f).toBeGreaterThanOrEqual(0);
    }
    e.animT = 0;
    const f0 = vanillaFrameIdx(e, 18);
    e.animT = 125;
    expect(vanillaFrameIdx(e, 18)).toBe(f0);       // 恒定（旧档 0→1+0%17=1、125→1+7=8 跨段）
  });

  it('★341/629 恒段 1（:25699-25701）：任何计数下帧号 <6', () => {
    for (const id of [341, 629]) {
      const e = mk(id);
      for (let c = 0; c <= 14; c++) {
        e.mimicFrameT = c;
        expect(vanillaFrameIdx(e, 6), `${id} c=${c}`).toBeLessThanOrEqual(5);
      }
    }
  });
});

describe('BJ464 变体段生成时锁定（AI_025 :25684-25697 一次性锁,Enemy.mimicAI）', () => {
  it('生成深度选段：地表=1 / 洞穴=2 / 地狱=3；并一次性 position.X+=8f', () => {
    // 地表（tileY 100 < groundLevel 120）→ 1
    {
      const { hooks } = mkHooks(120);
      const e = Enemy.fromVanilla(85, 40 * 16, 100 * 16) as EnemyT;
      const x0 = e.x;
      tickMimicAI(hooks, e, 1);
      expect(e.ai3).toBe(1);
      expect(e.x).toBe(x0 + 8);                    // position.X += 8f（:25686）
      tickMimicAI(hooks, e, 3);
      expect(e.x).toBe(x0 + 8);                    // 一次性（不逐拍漂移）
    }
    // 洞穴（tileY 150：> groundLevel 120 且 ≤ UnderworldLayer 200）→ 2
    {
      const { hooks } = mkHooks(120);
      const e = Enemy.fromVanilla(85, 40 * 16, 150 * 16) as EnemyT;
      tickMimicAI(hooks, e, 1);
      expect(e.ai3).toBe(2);
    }
    // 地狱（tileY 250 > UnderworldLayer = h-200 = 200）→ 3
    {
      const { hooks } = mkHooks(120);
      const e = Enemy.fromVanilla(85, 40 * 16, 250 * 16) as EnemyT;
      tickMimicAI(hooks, e, 1);
      expect(e.ai3).toBe(3);
    }
  });

  it('★锁后不随深度重算（生成时锁定 vs 每帧重算判别面）：搬家跨深度 ai3 不变', () => {
    const { hooks } = mkHooks(120);
    const e = Enemy.fromVanilla(85, 40 * 16, 150 * 16) as EnemyT;   // 洞穴
    tickMimicAI(hooks, e, 1);
    expect(e.ai3).toBe(2);
    e.y = 250 * 16;                              // 挪进地狱（旧"按所在格环境重算"病会翻成 3）
    tickMimicAI(hooks, e, 10);
    expect(e.ai3).toBe(2);                       // 锁定段不漂移
    e.y = 50 * 16;                               // 挪回地表也不翻
    tickMimicAI(hooks, e, 10);
    expect(e.ai3).toBe(2);
  });

  it('mimicFrameT 帧累加器：伪装清零 / 腾空++ / 落地-- / 钳 0..12', () => {
    const { hooks } = mkHooks(120, 150);
    const e = Enemy.fromVanilla(85, 40 * 16, 150 * 16) as EnemyT;
    tickMimicAI(hooks, e, 40);                   // 先 settle（fromVanilla 半盒锚=落地下坠唤醒,原版同相）
    e.ai0 = 0;                                   // 复位伪装态（settle 后无玩家不再唤醒）
    e.mimicFrameT = 0; e.vy = 0;
    e.vx = 0;                                    // ★vx 也须清零——`vx!==0` 是原版唤醒条件之一（:25704）
    e.y = 150 * 16 - e.h;                        // 钉在地板顶
    tickMimicAI(hooks, e, 3);
    expect(e.ai0).toBe(0);                       // 立于地面无玩家=保持伪装
    expect(e.mimicFrameT).toBe(0);               // 伪装态清零（:74240-74243）
    e.ai0 = 1;                                   // 强制激活
    e.vy = -4;                                   // 预置腾空（AI 头读上一拍终速度）
    tickMimicAI(hooks, e, 1);
    expect(e.mimicFrameT).toBe(1);               // 腾空++
    e.vy = -4;
    tickMimicAI(hooks, e, 1);
    expect(e.mimicFrameT).toBe(2);
    e.vy = 0;                                    // 落地
    tickMimicAI(hooks, e, 1);
    expect(e.mimicFrameT).toBe(1);               // --
    e.mimicFrameT = 11;                          // 钳上界
    e.vy = -4;
    tickMimicAI(hooks, e, 1);
    expect(e.mimicFrameT).toBe(12);
    e.vy = -4;
    tickMimicAI(hooks, e, 1);
    expect(e.mimicFrameT).toBe(12);              // 钳 12 不越（:74252）
    e.vy = 0;
    e.ai2 = -1000000;                            // 钉住跳循环（wait 恒未满=不再起跳,仅落地衰减）
    tickMimicAI(hooks, e, 40);                   // 空中下落 ~9 拍 + 落地衰减 12 拍 + 余量
    expect(e.mimicFrameT).toBe(0);               // 钳下界 0（:74250）
  });
});

describe('BJ464 一生帧源恒定（生成→死亡全帧贴图 ∈ 锁定段）', () => {
  it('激活战斗全程+死亡拍,帧号恒不越段（洞穴档 ∈ 6..11）', () => {
    const { hooks } = mkHooks(120, 150, true);    // 洞穴深度地板（120 < 150 ≤ 200）+真实玩家（hurt 链）
    const e = Enemy.fromVanilla(85, 40 * 16, 150 * 16) as EnemyT;
    hooks.enemies().push(e);
    // 挪到地板上方让其立足（顶格 tileY 148.x < 200=洞穴段）
    e.y = 150 * 16 - e.h;
    tickMimicAI(hooks, e, 1);
    expect(e.ai3).toBe(2);
    e.ai0 = 1;                                   // 强制激活（跳循环）
    const seen: number[] = [];
    let deathFrame = -1;
    for (let i = 0; i < 600; i++) {              // 600 tick 跳跃战斗（> 一次完整跳循环×10）
      tickMimicAI(hooks, e, 1);
      if (i === 400) e.hp = 0;                   // 临终拍
      if (i === 401) e.hurt(9999, 0, 0, hooks);  // 死亡走真实管线（:4622 同款 hp<=0→hurt(9999)）
      const f = vanillaFrameIdx(e, 18);
      if (i === 401) deathFrame = f;             // 死亡拍帧
      seen.push(f);
    }
    expect(e.dead).toBe(true);                   // 死亡管线走到（掉落/旗标面）
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(6);   // 全程不越下沿
    expect(Math.max(...seen)).toBeLessThanOrEqual(11);     // 全程不越上沿
    // 死亡拍帧仍在段内（旧档全条循环在死亡期照越段=用户所见"死后贴图切换"）
    expect(deathFrame).toBeGreaterThanOrEqual(6);
    expect(deathFrame).toBeLessThanOrEqual(11);
  });
});
