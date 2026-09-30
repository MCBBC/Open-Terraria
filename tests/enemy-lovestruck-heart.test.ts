// 清偿刀 F（2026-09-29）：X4-债15 —— Enemy 桶 Lovestruck(119) 头爱心 gore 331 发射。
// 反编译标杆 Terarria1457（1458 增量面对本域零变更——NPC.cs 本域行号 1457 亲读）：
//   施加  ThrowKillFx.applyAura 已接（Projectile.cs:78947-78956 全体 NPC 循环
//         AddBuff(119);projStatus.ts SUPPORTED[119]='lovestruckT' 单一写入面——
//         Enemy.lovestruckT 字段 B1 批已有,只缺 VFX 发射位）
//   视觉  UpdateNPC_BuffApplyVFX :92455-92466 —— :91488 UpdateNPC 对【全体】NPC
//         调用（城镇/敌怪同式同环;刀B 只落 TownNPC 侧 = 敌怪侧缺发射位）。
//         Next(5)==0 门;位 = 左上 + (Next(width+1),Next(height+1));速 = 单位向
//         (X×0.66)×Next(3,6)×0.33 → Gore.NewGore 内扰动(:1347-1348) → 调用侧
//         ×0.4 → vy−0.6;档 = Next(40,121)×0.01;sticky=false(:92464-92466)。
//   门    canDisplayBuffs（:6206 缺省 true/:8519 ResetEffects 复位）false 面只由
//         getGoodAdjustments 置（:18040-18052 石巨人四件 245-248）,而该函数整体在
//         Main.getGoodWorld 门内（SetDefaults :17875-17878）⇒ 仅 FTW 世界拒发;
//         普通世界四件照发爱心（:92265 整环早退只在 false 面）。
//         ★清偿刀 P3-F1（2026-09-30,C1 红蓝翻案）：旧 vid 硬拒（245-248 无条件）
//         系误判——发射位改读逐实例 canDisplayBuffs（Enemy :1493/:6508 双路落位,
//         ScaleStats.getGoodAdjustments 已按 getGoodWorld 条件化）;119 免疫表仅
//         [31]（vanillaNpcImmunity.ts:101）,石巨人可被上 buff → 该门对石巨人实活。
//   单源  GorePiece.newLovestruckHeart（刀B TownNPC 内联实现提取,2026-09-29）——
//         掷序按原版实参求值序修齐（位x/位y 在速/档之前,:92459-92462 实参左→右;
//         刀B 旧序 spd 前置,零掷下无观察差,统计序按原版收口）。
// 变异证红（sha256 对拍还原）：Enemy.ts 摘 newLovestruckHeart 调用 → ③④⑤段红
// （townnpc-lovestruck 24 测基线保持全绿 = 判别面只在 Enemy 桶）;
// GorePiece.newLovestruckHeart 摘 ×0.4/vy−0.6 → TownNPC ④ 与本文件 ③ 同红 = 单源锁。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { TownNPC } from '../src/entities/TownNPC';
import { GorePiece } from '../src/entities/GorePiece';
import { applyBuffTicks } from '../src/entities/projStatus';
import { bindScaleStatsWorld, scaleStatsWorldOf } from '../src/stats/ScaleStats';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

const realRandom = Math.random;
afterEach(() => { Math.random = realRandom; vi.restoreAllMocks(); });

function flatWorld(): World {
  const world = new World(200, 200, 100, 'enemy-lovestruck-test');
  for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, 100, TILE_BY_KEY['dirt']!);
  world.clock.timeOfDay = 0.5;
  return world;
}
function makeGame(world: World): GameHooks {
  return {
    world,
    player: { x: -9999, y: -9999, w: 0, h: 0, dead: true, sitting: false },
    enemies: () => [], npcs: () => [], critters: () => [],
    spawnTownShot: () => {}, spawnParticles: () => {}, spawnBurst: () => {},
    spawnDust: () => {}, spawnDrop: () => null, damagePlayer: () => 0,
    playSfx: () => {}, playSfxFiles: () => {}, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
  } as unknown as GameHooks;
}
function heartSpy() {
  const captured: Array<{ type: number; x: number; y: number; vx0: number; vy0: number; scale: number | undefined; ret: GorePiece }> = [];
  const spy = vi.spyOn(GorePiece, 'newGore').mockImplementation(((type, x, y, vx, vy, scale) => {
    if (type !== 331) return null;
    const ret = { sticky: true, vx: 1, vy: 2 } as unknown as GorePiece;   // NewGore 后基速桩
    captured.push({ type, x, y, vx0: vx, vy0: vy, scale, ret });
    return ret;
  }) as typeof GorePiece.newGore);
  return { captured, spy };
}

// ===========================================================================
// ① Enemy.lovestruckT 载体（既有字段）+ applyBuffTicks 119 写入 + max 合并
// ===========================================================================
describe('刀F-① Enemy.lovestruckT 载体（projStatus SUPPORTED[119] 映射落位）', () => {
  it('applyBuffTicks(zombie,119,1800t) → lovestruckT = 30s（1800/60）;zombie(3) 不在 119 免疫表[31]', () => {
    const e = new Enemy('zombie', 100 * 16, 96 * 16);
    applyBuffTicks(e as unknown as Record<string, number>, 119, 1800);
    expect(e.lovestruckT).toBe(30);
  });

  it('AddBuff max 合并：短续期不覆盖、长续期取长（NPC.AddBuff :91044-91050）', () => {
    const e = new Enemy('zombie', 100 * 16, 96 * 16);
    applyBuffTicks(e as unknown as Record<string, number>, 119, 1800);
    applyBuffTicks(e as unknown as Record<string, number>, 119, 600);
    expect(e.lovestruckT).toBe(30);
    applyBuffTicks(e as unknown as Record<string, number>, 119, 3600);
    expect(e.lovestruckT).toBe(60);
  });
});

// ===========================================================================
// ② fixedUpdate 递减 + 过期归零（:93099-93102 lowerBuffTime 秒制等价）
// ===========================================================================
describe('刀F-② fixedUpdate 递减', () => {
  it('递减：lovestruckT 30s → 每 tick −1/60', () => {
    const e = new Enemy('zombie', 100 * 16, 96 * 16);
    e.lovestruckT = 30;
    e.fixedUpdate(1 / 60, makeGame(flatWorld()));
    expect(e.lovestruckT).toBeCloseTo(30 - 1 / 60, 12);
  });

  it('过期归零：余量 1t → 一 tick 后 ≤0', () => {
    const e = new Enemy('zombie', 100 * 16, 96 * 16);
    e.lovestruckT = 1 / 60;
    e.fixedUpdate(1 / 60, makeGame(flatWorld()));
    expect(e.lovestruckT).toBeLessThanOrEqual(0);
  });
});

// ===========================================================================
// ③ 在位发射（:92455-92466 全式）：1/5 拍 → gore 331 位/速/档 + 调用侧三连
// ===========================================================================
describe('刀F-③ Enemy 头爱心发射（UpdateNPC_BuffApplyVFX :92455-92466,城镇同式）', () => {
  it('在位发射：Math.random=0 全中 → gore 331、位/速/档下沿 + 调用侧 ×0.4/vy−0.6/sticky=false', () => {
    const e = new Enemy('zombie', 100 * 16, 96 * 16);
    // 先真实随机走 12 tick 让物理落定（重力触地/速度归零）,再冻结掷流观察
    const game = makeGame(flatWorld());
    for (let i = 0; i < 12; i++) e.fixedUpdate(1 / 60, game);
    const { captured } = heartSpy();
    Math.random = () => 0;   // 全掷取下沿：1/5 门中、向 (-10,-10)、位偏 0、速 Next(3,6)=3、档 Next(40,121)=40
    e.lovestruckT = 30;
    const x0 = e.x, y0 = e.y;
    e.fixedUpdate(1 / 60, game);
    const x1 = e.x, y1 = e.y;
    expect(captured.length).toBe(1);
    const c = captured[0];
    expect(c.type).toBe(331);
    // 发射位读在 buff VFX 段（物理步前后序不假设）:左上 + Next(w+1)/Next(h+1) 下沿 0
    expect(c.x === x0 || c.x === x1).toBe(true);
    expect(c.y === y0 || c.y === y1).toBe(true);
    expect(c.scale).toBe(0.4);                          // Next(40,121)×0.01 下沿
    // 速度 = 单位向（X×0.66）×Next(3,6)×0.33；Math.random=0 → 向 (-10,-10)、spd=0.99
    const ul = Math.hypot(-10, -10);
    expect(c.vx0).toBeCloseTo((-10 / ul) * 0.66 * 0.99, 12);
    expect(c.vy0).toBeCloseTo((-10 / ul) * 0.99, 12);
    // 调用侧三连（:92464-92466）：sticky=false → velocity×0.4 → vy−0.6（施于桩基速）
    expect(c.ret.sticky).toBe(false);
    expect(c.ret.vx).toBeCloseTo(0.4, 12);              // 1×0.4
    expect(c.ret.vy).toBeCloseTo(0.2, 12);              // 2×0.4−0.6
  });

  it('过期不发射：lovestruckT ≤0 → 零 331（:92455 loveStruck 位门）', () => {
    const e = new Enemy('zombie', 100 * 16, 96 * 16);
    const game = makeGame(flatWorld());
    for (let i = 0; i < 12; i++) e.fixedUpdate(1 / 60, game);
    const { spy } = heartSpy();
    Math.random = () => 0;
    e.fixedUpdate(1 / 60, game);
    expect(spy.mock.calls.filter(([id]) => id === 331).length).toBe(0);
  });

  it('1/5 概率门：Math.random=0.2（≥1/5）→ 不发射;0.19 → 发射（Next(5)==0 同域）', () => {
    const e = new Enemy('zombie', 100 * 16, 96 * 16);
    const game = makeGame(flatWorld());
    for (let i = 0; i < 12; i++) e.fixedUpdate(1 / 60, game);
    Math.random = () => 0.2;
    e.lovestruckT = 30;
    const { spy: spyMiss } = heartSpy();
    e.fixedUpdate(1 / 60, game);
    expect(spyMiss.mock.calls.filter(([id]) => id === 331).length).toBe(0);
    Math.random = () => 0.19;
    const { spy: spyHit } = heartSpy();
    e.fixedUpdate(1 / 60, game);
    expect(spyHit.mock.calls.filter(([id]) => id === 331).length).toBe(1);
  });
});

// ===========================================================================
// ④ canDisplayBuffs 敌怪侧门（★P3-F1 2026-09-30 重锚,原「vid 245-248 恒拒」翻案）：
//   vanilla false 面只在 FTW 世界（getGoodAdjustments :18040-18052 ⊂ Main.getGoodWorld
//   门 :17875-17878）;普通世界石巨人四件 :8519 复位 true 照发爱心。发射位读逐实例
//   canDisplayBuffs（Enemy fromVanilla :1493 / Transform :6508 落位链）。
// ===========================================================================
describe('刀F-④ canDisplayBuffs 自门（P3-F1 重锚：FTW 条件化,vid 硬拒翻案）', () => {
  it('FTW 世界夹具：fromVanilla(245) 种子档落 canDisplayBuffs=false → 门字段活、零 331 且递减已执行', () => {
    const w = new World(100, 100, 7, 'p3-ftw-lovestruck');
    w.seedFlags = { ...w.seedFlags, getGoodWorld: true };
    bindScaleStatsWorld(scaleStatsWorldOf(w, () => false));
    const golem = Enemy.fromVanilla(245, 100 * 16, 96 * 16)!;
    bindScaleStatsWorld(null);
    expect(golem.canDisplayBuffs).toBe(false);   // FTW getGoodAdjustments 落位（:18040-18052）
    // 发射位读取面 = 该逐实例字段（zombie 载体保持 AI 稳定,门语义与石巨人同位）
    const e = new Enemy('zombie', 100 * 16, 96 * 16);
    e.canDisplayBuffs = false;
    const game = makeGame(flatWorld());
    for (let i = 0; i < 12; i++) e.fixedUpdate(1 / 60, game);
    e.lovestruckT = 30;
    const { spy } = heartSpy();
    Math.random = () => 0;
    e.fixedUpdate(1 / 60, game);
    expect(spy.mock.calls.filter(([id]) => id === 331).length).toBe(0);
    // 块执行证明：递减已发生（门在递减之后、发射之前）——若抛在前段则此断言红
    expect(e.lovestruckT).toBeCloseTo(30 - 1 / 60, 12);
  });

  it('普通世界石巨人四件：fromVanilla(245..248) canDisplayBuffs=true（:8519 复位,C1 翻案面）', () => {
    bindScaleStatsWorld(scaleStatsWorldOf(new World(100, 100, 7, 'p3-classic'), () => false));
    try {
      for (const vid of [245, 246, 247, 248]) {
        const g = Enemy.fromVanilla(vid, 100 * 16, 96 * 16)!;
        expect(g.canDisplayBuffs).toBe(true);
      }
    } finally {
      bindScaleStatsWorld(null);
    }
  });

  it('普通世界照发：门字段 true（=普通世界四件终态）→ 331 照常发射（旧 vid 硬拒误杀面）', () => {
    const e = new Enemy('zombie', 100 * 16, 96 * 16);
    expect(e.canDisplayBuffs).toBe(true);        // 字段缺省 true（NPC.cs:6206 同相）
    const game = makeGame(flatWorld());
    for (let i = 0; i < 12; i++) e.fixedUpdate(1 / 60, game);
    Math.random = () => 0;
    e.lovestruckT = 30;
    const { spy } = heartSpy();
    e.fixedUpdate(1 / 60, game);
    expect(spy.mock.calls.filter(([id]) => id === 331).length).toBe(1);
  });
});

// ===========================================================================
// ⑤ 单源同式对拍：Enemy 与 TownNPC 同一冻结掷流下发射参数相对自身盒全等
// ===========================================================================
describe('刀F-⑤ 单源 GorePiece.newLovestruckHeart（城镇/敌怪共用,无复制实现）', () => {
  it('同掷流下 Enemy/TownNPC 捕获的 331 调用参数相对各自盒逐项同构', () => {
    const e = new Enemy('zombie', 100 * 16, 96 * 16);
    const n = new TownNPC('guide', 200 * 16, 96 * 16);
    const game = makeGame(flatWorld());
    for (let i = 0; i < 12; i++) { e.fixedUpdate(1 / 60, game); n.fixedUpdate(1 / 60, game); }
    Math.random = () => 0;
    e.lovestruckT = 30; n.lovestruckT = 30;
    const { captured: ce } = heartSpy();
    e.fixedUpdate(1 / 60, game);
    const { captured: cn } = heartSpy();
    n.fixedUpdate(1 / 60, game);
    expect(ce.length).toBe(1);
    expect(cn.length).toBe(1);
    const ex0 = e.x, ny0 = n.x;
    const a = ce[0], b = cn[0];
    expect(a.type).toBe(b.type);
    expect(a.scale).toBe(b.scale);
    expect(a.vx0).toBeCloseTo(b.vx0, 12);
    expect(a.vy0).toBeCloseTo(b.vy0, 12);
    expect(a.ret.sticky).toBe(b.ret.sticky);
    expect(a.ret.vx).toBeCloseTo(b.ret.vx, 12);
    expect(a.ret.vy).toBeCloseTo(b.ret.vy, 12);
    // 位 = 各自盒左上 + 同一掷偏（Math.random=0 → 偏 0;物理步前后序不假设,∈{前,后}）
    expect(a.x === ex0 || a.x === e.x).toBe(true);
    expect(b.x === ny0 || b.x === n.x).toBe(true);
  });
});
