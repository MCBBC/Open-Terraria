// B2 修刀批（2026-09-06）两登记残差回归:
//  ① NebulaBlazeBolt 635 extraUpdates=3（P.cs:6837）→ 子步环 :16780-16782
//    （numUpdates = extraUpdates; while (numUpdates >= 0) { numUpdates--; 全体 } ）
//    每拍 4 圈;旧实现两 variant 合用 `for i<3`（634 extraUpdates=2 :6826 → 3 圈
//    本就正确,635 缺一子步）。逐子步面（原版环内逐面,step() 已逐子步,只修圈数）:
//    AI_001 状态机/视觉/全尘（:55426-55609）→ 湿段（:16892）→ 位移
//    （HandleMovement :17120 + UpdatePosition :20551）。帧阀 num32:634 4×MaxUpdates
//    （:55434,MaxUpdates=extraUpdates+1 :556-561）=12 / 635 专改 3×MaxUpdates
//    （:55443）=12——两式同值 → 帧进拍数 634=4 拍/帧、635=3 拍/帧。
//  ② DukeSharknadoBolt 385 入水 Kill 改读湿段维护 wet 旗:AI_065 尾支 :30078-30082
//    `if (wet) { position.Y -= 16; Kill(); }`,而 Update 内 AI（:16880）先于湿段
//    （:16892）→ AI 读上一拍旗（extraUpdates 缺省 0 → 1 子步/拍）= 入水次拍才
//    Kill。旧实现读中心格液面 = 入水当拍 Kill（提前一拍）+ 域近似（原版
//    WetCollision 全盒中心探针,Collision.cs 中心小盒语义）。出生预置 NewProjectile
//    :10886-10892（spawn 时、首拍 AI 前）前置到 fixedUpdate 头 → 水面出生首拍即
//    Kill（原版同相）。Kill 后同拍湿段/位移照跑（!active 门在 HandleMovement 后
//    :17126）→ 浅触水 Kill 拍出"出水溅花";幂等门 kill() 头 = 原版 Kill :71763
//    `if (!active) return`。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { DukeSharknadoBolt, DukeSharknadoTornado } from '../src/entities/bossAI_duke_moonlord';
import { NebulaBlazeBolt } from '../src/entities/LunarNebula';
import type { GameHooks } from '../src/entities/types';
import type { Enemy } from '../src/entities/Enemy';

interface DustCall { type: number }
const SPLASH_WATER_DUST = 33;   // dustWaterFor(0)=33（renderer.waterStyle 缺省 0）

/** 水 = 格(18,20) = px[288,304)×[320,336)。liquidType=1（WATER）。 */
function makeWorld(): World {
  const w = new World(60, 120, 7, 'b2-wetkill-test');
  const st = w.store;
  st.liquid[st.idx(18, 20)] = 255;
  st.liquidType[st.idx(18, 20)] = 1;
  return w;
}

function makeGame(world: World) {
  const dusts: DustCall[] = [];
  const sfx: string[] = [];
  const projectiles: unknown[] = [];
  const game = {
    world,
    player: { x: 0, y: 0, w: 20, h: 42, cx: 10, cy: 21, vx: 0, vy: 0, hp: 400, maxHp: 400, dead: true, buffs: { apply: () => {}, has: () => false } },
    enemies: () => [] as Enemy[],
    npcs: () => [],
    critters: () => [],
    candidatePlayers: () => [],
    entities: { projectiles: [], add: (e: unknown, b: string) => { if (b === 'projectiles') projectiles.push(e); } },
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => null,
    spawnParticles: () => {},
    spawnBurst: () => {},
    spawnDust: (_x: number, _y: number, _w: number, _h: number, type: number) => {
      dusts.push({ type });
      return { vx: 0, vy: 0, scale: 1, alpha: 0, color: null as unknown };
    },
    vanillaDust: undefined,
    playSfx: () => {},
    playSfxFile: () => {},
    playSfxFiles: () => {},
    playSfxWav: (name: string) => { sfx.push(name); },
    startTrackedLoop: () => null,
    addLightAt: () => {},
    onProjectileDeath: () => {},
    explodePrimeBomb102: () => {},
    notifyInventoryChanged: () => {},
    showPickupLabel: () => {},
  } as unknown as GameHooks;
  return { game, dusts, sfx, projectiles };
}
const splashDusts = (dusts: DustCall[]) => dusts.filter((d) => d.type === SPLASH_WATER_DUST).length;

// =====================================================================
// ① NebulaBlazeBolt 子步数（635=4 / 634=3）
// =====================================================================
describe('NebulaBlazeBolt 子步数 = extraUpdates+1（P.cs:6837/:6826 + 子步环 :16780）', () => {
  it('635 干态位移 16/拍（4 子步 × 4）——旧 3 子步=12', () => {
    const { game } = makeGame(makeWorld());
    const b = new NebulaBlazeBolt(400, 100, 4, 0, 50, 6, 635);
    (b as unknown as { birthSpreadDone: boolean }).birthSpreadDone = true;   // 隔离出手散射随机面
    b.fixedUpdate(1 / 60, game);
    expect((b as unknown as { x: number }).x - 400).toBeCloseTo(16, 10);
  });
  it('635 湿态位移 8/拍（4 子步 × 4 × 0.5,子步 1 置旗;溅花仅子步 1 一次）', () => {
    const w = makeWorld();
    const { game, dusts, sfx } = makeGame(w);
    const b = new NebulaBlazeBolt(275, 100, 4, 0, 50, 6, 635);
    (b as unknown as { birthSpreadDone: boolean }).birthSpreadDone = true;
    b.fixedUpdate(1 / 60, game);                       // 干位出生预置
    (b as unknown as { x: number }).x = 275;           // 盒 [275,315)×[310,350) → 探针 [295,305)×[320,340) 触水
    (b as unknown as { y: number }).y = 310;
    dusts.length = 0; sfx.length = 0;
    b.fixedUpdate(1 / 60, game);
    expect(splashDusts(dusts)).toBe(10);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(1);
    expect(b.wet).toBe(true);
    expect((b as unknown as { x: number }).x - 275).toBeCloseTo(8, 10);
  });
  it('634 干态位移 12/拍（extraUpdates=2 → 3 子步,豁免同族核对:无湿段/阻尼面可逐子步化）', () => {
    const { game } = makeGame(makeWorld());
    const b = new NebulaBlazeBolt(400, 100, 4, 0, 50, 6, 634);
    (b as unknown as { birthSpreadDone: boolean }).birthSpreadDone = true;
    b.fixedUpdate(1 / 60, game);
    expect((b as unknown as { x: number }).x - 400).toBeCloseTo(12, 10);
  });
  it('帧阀 num32 同值 12（634 4×MaxUpdates/:55434,635 3×MaxUpdates/:55443）→ 帧进拍数 634=4 拍、635=3 拍', () => {
    const { game } = makeGame(makeWorld());
    const b635 = new NebulaBlazeBolt(400, 100, 4, 0, 50, 6, 635);
    const b634 = new NebulaBlazeBolt(400, 100, 4, 0, 50, 6, 634);
    (b635 as unknown as { birthSpreadDone: boolean }).birthSpreadDone = true;
    (b634 as unknown as { birthSpreadDone: boolean }).birthSpreadDone = true;
    for (let t = 0; t < 3; t++) b635.fixedUpdate(1 / 60, game);
    for (let t = 0; t < 3; t++) b634.fixedUpdate(1 / 60, game);
    expect((b635 as unknown as { frame: number }).frame).toBe(1);   // 12 子步 = 3 拍 × 4
    expect((b634 as unknown as { frame: number }).frame).toBe(0);   // 9 子步 < 12
    b634.fixedUpdate(1 / 60, game);
    expect((b634 as unknown as { frame: number }).frame).toBe(1);   // 12 子步 = 4 拍 × 3
  });
  it('逐子步视觉面随圈数:alpha −40/子步 → 635 首拍 255−4×40=95,634 首拍 255−3×40=135', () => {
    const { game } = makeGame(makeWorld());
    const b635 = new NebulaBlazeBolt(400, 100, 4, 0, 50, 6, 635);
    const b634 = new NebulaBlazeBolt(400, 100, 4, 0, 50, 6, 634);
    (b635 as unknown as { birthSpreadDone: boolean }).birthSpreadDone = true;
    (b634 as unknown as { birthSpreadDone: boolean }).birthSpreadDone = true;
    b635.fixedUpdate(1 / 60, game);
    b634.fixedUpdate(1 / 60, game);
    expect((b635 as unknown as { alphaI: number }).alphaI).toBe(95);
    expect((b634 as unknown as { alphaI: number }).alphaI).toBe(135);
  });
});

// =====================================================================
// ② DukeSharknadoBolt 385 入水 Kill 拍序（AI_065 尾支 :30078 读上拍 wet 旗）
// =====================================================================
describe('DukeSharknadoBolt 385 入水 Kill 改读湿旗（P.cs:4678-4686 无 ignoreWater/:30078 尾支）', () => {
  it('入水拍不 Kill（旧中心格判当拍 Kill → 提前一拍,已废）:湿段置旗+溅花+位移 ×0.5;次拍 AI 抬 16px Kill', () => {
    const w = makeWorld();
    const { game, dusts, sfx, projectiles } = makeGame(w);
    // 大弹 tgt={dead:true} 短路追踪 → vx0/vy0 恒 (4,2)。出生 (297,100) 干位。
    const b = new DukeSharknadoBolt(297, 100, 4, 2, true, false, {} as Enemy, { dead: true } as never);
    b.fixedUpdate(1 / 60, game);
    expect(b.dead).toBe(false);
    expect(b.presetDone).toBe(true);
    // 移盒 (282,305):中心 (297,320) 落水格 (18,20)【旧判此处即 Kill】;
    // 湿探针 [292,302)×[313,328) 触水带 [320,336)
    (b as unknown as { x: number }).x = 282;
    (b as unknown as { y: number }).y = 305;
    dusts.length = 0; sfx.length = 0;
    b.fixedUpdate(1 / 60, game);                       // 入水拍
    expect(b.dead).toBe(false);                        // AI 读上拍旗 false → 不 Kill
    expect(splashDusts(dusts)).toBe(10);               // 入水溅花（本拍）
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(1);
    expect(b.wet).toBe(true);
    expect((b as unknown as { x: number }).x - 282).toBeCloseTo(2, 10);   // 4 × 0.5
    expect((b as unknown as { y: number }).y - 305).toBeCloseTo(1, 10);   // 2 × 0.5
    expect(projectiles.length).toBe(0);                // 未落龙卷
    // 次拍:AI 见旗 → y−16 后 Kill → 落 386 克苏龙卷(大弹)。Kill 后同拍湿段照跑
    // （原版 !active 门 :17126 在湿段/位移后）:抬 16px 探针离水 → 出水溅花 10 粒
    dusts.length = 0; sfx.length = 0;
    b.fixedUpdate(1 / 60, game);
    expect(b.dead).toBe(true);
    expect(projectiles.length).toBe(1);
    expect(projectiles[0]).toBeInstanceOf(DukeSharknadoTornado);
    expect(splashDusts(dusts)).toBe(10);               // Kill 拍出水溅花面（浅触水几何）
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(1);
    expect(sfx.filter((s) => s === 'NPC_Killed_19').length).toBe(1);
    // Kill 拍终位 = 抬 16 + Kill 后位移照跑（284−16=... x=284+4, y=306−16+2）
    expect((b as unknown as { x: number }).x).toBeCloseTo(288, 10);
    expect((b as unknown as { y: number }).y).toBeCloseTo(292, 10);
  });
  it('水面出生:出生预置（NewProjectile :10886-10892 前置）→ 首拍 AI 即 Kill（原版同相）', () => {
    const w = makeWorld();
    const { game, projectiles } = makeGame(w);
    // 构造 (297,314) → 盒 (282,299):探针 [292,302)×[307,322) 触水带 [320,336)
    const b = new DukeSharknadoBolt(297, 314, 4, 2, true, false, {} as Enemy, { dead: true } as never);
    expect(b.wet).toBe(false);
    b.fixedUpdate(1 / 60, game);
    expect(b.dead).toBe(true);                         // 首拍 Kill——预置晚一拍则首拍不 Kill
    expect(projectiles.length).toBe(1);
    expect(projectiles[0]).toBeInstanceOf(DukeSharknadoTornado);
  });
  it('Kill 幂等门（原版 :71763 if(!active) return）:Kill 拍湿段/撞块面续跑不双落龙卷', () => {
    const w = makeWorld();
    const { game, projectiles } = makeGame(w);
    const b = new DukeSharknadoBolt(297, 314, 4, 2, true, false, {} as Enemy, { dead: true } as never);
    b.fixedUpdate(1 / 60, game);
    expect(projectiles.length).toBe(1);                // 单龙卷(无幂等门=2)
  });
});
