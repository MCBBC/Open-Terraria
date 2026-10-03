// ★BJ454（2026-10-03）：DD2 域三边缘债（BJ450 新登记面清偿）。
//   ①T-set 受害门：NPCID.Sets.TakesDamageFromHostilesWithoutBeingFriendly
//     （1457 NPCID.cs:4783 全表 96 项,含松露虫 374）——原版受害 tick 门
//     NPC.cs:91592 `type != 37 && (friendly || T-set[type])` →
//     GetHurtByOtherNPCs(AllNPCs)（:93555）。本仓 npcVsNpcContactUpdate 旧只有
//     friendly 臂（注释自称 friendly||T-set=实现与注不符）——补 T-SET 表+
//     门接线。松露虫被敌怪追杀=主打场景（索敌不读本表,接触伤害通道消费）。
//   ②DD2BetsyFireball 水晶面：原版 686 弹（SetDefaults P.cs:7307-7316
//     hostile/penetrate -1）经 Damage_PVE_Inner（P.cs:12626-12632）flag2 门
//     （targetNPC.friendly ∧ !dontTakeDamageFromHostiles）伤 friendly 水晶 548;
//     命中后 immune[255]=10（:14180-14183,owner=255 槽）、penetrate=-1 不 Kill
//     =火球穿过;Colliding 尾迹扫掠（:16156-16172）对水晶同生效。本仓 686 旧
//     只有玩家命中面——补水晶面（681/683 同族先例+BJ450 548 收端联动）。
//   ③水晶渲染两面：辉光门 Main.cs:24356-24360（Extra_89 光柱
//     scale6.Y ×= 0.6 当 dontTakeDamageFromHostiles——BJ450 演出窗收缩）+
//     波间倒计时 Main.cs:46866-46874（548 头顶 Bottom-100 白字秒数=TimeLeftBetweenWaves/60
//     整除,门=!dontTakeDamageFromHostiles ∧ hold>0 ∧ !hideUI——本仓无 F11 面
//     Game.ts:37105 登记先例恒可见）。两渲染面=算式单源（Renderer.dd2CrystalBeamScaleY/
//     dd2CrystalCountdownSeconds）+倒计时门直调判别。
//   判别力：①摘 T-set 臂→①红;②摘 flag2 门→演出窗腿红;③摘 ×0.6→辉光算式红;
//   倒计时门任一摘→门腿红。
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Enemy } from '../src/entities/Enemy';
import { DD2BetsyFireball } from '../src/entities/bossAI_dd2';
import { Renderer } from '../src/render/Renderer';

vi.mock('../src/vui/draw/MouseTextBake', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/vui/draw/MouseTextBake')>();
  return { ...orig, drawBakedMouseText: vi.fn(() => true) };
});

function makeGame(list: Enemy[], playerX = -9999, playerY = -9999): GameHooks {
  return {
    world: new World(200, 200, 30, 'bj454'),
    // 死亡管线读最近玩家（:14749）——最小玩家桩（debt-y 同式;缺省屏外防弹
    // 玩家面误吃 damagePlayer;互殴组传近坐标防 CheckActive 远 despawn 干扰）
    player: {
      dead: false, x: playerX, y: playerY, w: 20, h: 42,
      cx: playerX + 10, cy: playerY + 21,
      luck: 0, hp: 400, maxHp: 400, mana: 100, maxMana: 100,
    } as unknown,
    enemies: () => list,
    critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfxFiles: () => {}, playSfx: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: () => null,
    applyLifeSteal: () => 0,
  } as unknown as GameHooks;
}

describe('BJ454①：T-set 受害门（NPCID.cs:4783 表 + NPC.cs:91592 受害 tick 门）', () => {
  it('表金标：96 项 1:1（序保真）,含 374 松露虫、不含 37 老人', () => {
    // 金标 = sed -n '4783p' NPCID.cs 机器提取（tools 提取序,手抄零改动）
    const GOLDEN = [46, 55, 74, 148, 149, 230, 297, 298, 299, 303, 355, 356, 358, 359, 360, 361, 362, 363, 364, 365, 366, 367, 377, 357, 374, 442, 443, 444, 445, 446, 448, 538, 539, 337, 540, 484, 485, 486, 487, 592, 593, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 611, 689, 612, 613, 614, 615, 616, 617, 625, 626, 627, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649, 650, 651, 652, 653, 654, 655, 583, 584, 585, 669, 671, 672, 673, 674, 675, 677, 687, 688];
    expect(Enemy.TAKES_DAMAGE_FROM_HOSTILES.size).toBe(GOLDEN.length);
    expect([...Enemy.TAKES_DAMAGE_FROM_HOSTILES]).toEqual(GOLDEN);
    expect(Enemy.TAKES_DAMAGE_FROM_HOSTILES.has(374)).toBe(true);
    expect(Enemy.TAKES_DAMAGE_FROM_HOSTILES.has(37)).toBe(false);
  });

  it('松露虫 374（T-set 非 friendly）被僵尸 3 接触互伤（NPC.cs:91592 门打开）', () => {
    const list: Enemy[] = [];
    const game = makeGame(list);
    const worm = Enemy.fromVanilla(374, 100 * TILE, 100 * TILE)!;
    expect(worm).toBeTruthy();
    expect(worm.def.friendly).toBeFalsy();            // 非 friendly（旧门恒拒=病灶）
    list.push(worm);
    const zombie = Enemy.fromVanilla(3, 100 * TILE + 4, 100 * TILE - 12)!;
    expect(zombie.def.damage).toBeGreaterThan(0);     // 攻击者门 :93621
    list.push(zombie);
    worm.fixedUpdate(1 / 60, game);                   // 受害侧 tick → npcVsNpcContactUpdate
    expect(worm.hp).toBeLessThanOrEqual(0);           // lifeMax 5 吃 14 伤=死
    expect(worm.dead).toBe(true);
    // 免疫窗（BeHurtByOtherNPC :93663 immune[255]=30）
    expect(worm.npcImmune255).toBe(30);
  });

  it('对照：蓝史莱姆 1（非 T-set 非 friendly）不吃互殴伤;水晶 548 friendly 臂不回归;37 老人豁免', () => {
    const list: Enemy[] = [];
    const game = makeGame(list, 100 * TILE, 10 * TILE);
    // 全组天空层（10*TILE）——地下位有环境杀（嵌块清场等）干扰对照面
    const slime = Enemy.fromVanilla(1, 100 * TILE, 10 * TILE)!;
    list.push(slime);
    const zombie = Enemy.fromVanilla(3, 100 * TILE + 2, 10 * TILE - 10)!;
    list.push(zombie);
    const hp0 = slime.hp;
    slime.fixedUpdate(1 / 60, game);
    expect(slime.hp).toBe(hp0);                       // 非受害者：通道恒闭
    expect(slime.dead).toBe(false);
    // friendly 臂回归（548 不在 T-set,走 friendly 支）
    const crystal = Enemy.fromVanilla(548, 120 * TILE, 10 * TILE)!;
    list.push(crystal);
    crystal.bInit = true;
    const z2 = Enemy.fromVanilla(3, 120 * TILE + 2, 10 * TILE - 10)!;
    list.push(z2);
    crystal.fixedUpdate(1 / 60, game);
    expect(crystal.hp).toBeLessThan(crystal.maxHp);   // friendly 臂照开（重构零回归）
    // 37 老人：friendly=true 但 :91592 type!=37 显式豁免
    const oldman = Enemy.fromVanilla(37, 140 * TILE, 10 * TILE)!;
    expect(oldman.def.friendly).toBe(true);
    list.push(oldman);
    const z3 = Enemy.fromVanilla(3, 140 * TILE + 2, 10 * TILE - 10)!;
    list.push(z3);
    const hp37 = oldman.hp;
    oldman.fixedUpdate(1 / 60, game);
    expect(oldman.hp).toBe(hp37);                     // 摘 id!==37 门 → 此腿红
    expect(oldman.dead).toBe(false);
  });
});

describe('BJ454②：DD2BetsyFireball 686 水晶伤害面（P.cs:12626 flag2 门）', () => {
  it('火球命中 friendly 水晶 548：掉血+immune[255]=10（尾迹扫掠同生效）', () => {
    const list: Enemy[] = [];
    const game = makeGame(list);
    const crystal = Enemy.fromVanilla(548, 100 * TILE, 100 * TILE)!;
    crystal.bInit = true;
    list.push(crystal);
    // 天空层（worldgen 200×200 地表下无实心）防 tileCollide 先杀
    crystal.y = 10 * TILE; crystal.x = 100 * TILE;
    const fb = new DD2BetsyFireball(game, crystal.cx, crystal.cy, 0.5, 0.1, 35);
    fb.fixedUpdate(1 / 60, game);
    expect(fb.dead).toBe(false);                      // penetrate=-1 穿过不亡
    expect(crystal.hp).toBeLessThan(crystal.maxHp);   // 摘水晶面 → 红
    expect(crystal.npcImmune255).toBe(10);            // :14182 immune[255]=10
  });

  it('flag2 门：演出期（dontTakeDamageFromHostiles 置位,BJ450 链）照拒;敌怪（非 friendly）不吃敌对弹', () => {
    const list: Enemy[] = [];
    const game = makeGame(list);
    const crystal = Enemy.fromVanilla(548, 100 * TILE, 10 * TILE)!;
    crystal.bInit = true;
    crystal.dontTakeDamageFromHostiles = true;        // 胜/败演出窗（:41170/:41280/:78896）
    list.push(crystal);
    const fb = new DD2BetsyFireball(game, crystal.cx, crystal.cy, 0.5, 0.1, 35);
    fb.fixedUpdate(1 / 60, game);
    expect(crystal.hp).toBe(crystal.maxHp);           // 摘 flag2 门 → 此腿红
    expect(crystal.npcImmune255).toBe(0);
    // 敌怪不受敌对弹（hostile & flag2 恒假——P.cs:12632 早退）
    const zombie = Enemy.fromVanilla(3, 100 * TILE + 2, 10 * TILE - 10)!;
    list.push(zombie);
    const fb2 = new DD2BetsyFireball(game, zombie.cx, zombie.cy, 0.5, 0.1, 35);
    fb2.fixedUpdate(1 / 60, game);
    expect(zombie.hp).toBe(zombie.maxHp);
  });

  it('immune[255] 窗内不重复吃伤（686 火球持续重叠面）', () => {
    const list: Enemy[] = [];
    const game = makeGame(list);
    const crystal = Enemy.fromVanilla(548, 100 * TILE, 10 * TILE)!;
    crystal.bInit = true;
    list.push(crystal);
    const fb = new DD2BetsyFireball(game, crystal.cx, crystal.cy, 0, 0.05, 35);
    fb.fixedUpdate(1 / 60, game);
    const hpAfterFirst = crystal.hp;
    expect(hpAfterFirst).toBeLessThan(crystal.maxHp);
    // 窗内二次命中拒（原版 immune[255]==0 门 :12614）
    const fb2 = new DD2BetsyFireball(game, crystal.cx, crystal.cy, 0, 0.05, 35);
    fb2.fixedUpdate(1 / 60, game);
    expect(crystal.hp).toBe(hpAfterFirst);            // 摘 immune 门 → 红
  });
});

describe('BJ454③：水晶辉光门 + 波间倒计时（两渲染面）', () => {
  beforeAll(async () => {
    (globalThis as Record<string, unknown>).Image = class {
      src = ''; onload: (() => void) | null = null;
      width = 0; height = 0;
      addEventListener() { /* noop */ }
    };
    const anyStub = (): Record<string, unknown> => new Proxy(function stub() { /* noop */ } as unknown as Record<string, unknown>, {
      get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : anyStub()),
      set: () => true,
      apply: () => anyStub(),
      construct: () => anyStub(),
    });
    (globalThis as Record<string, unknown>).document = { createElement: () => anyStub() };
    (globalThis as unknown as { addEventListener: unknown }).addEventListener = () => {};
    (globalThis as Record<string, unknown>).window = { addEventListener: () => {}, removeEventListener: () => {} };
  });

  it('辉光 Y 缩放算式（Main.cs:24359-24366）：正常 sy∈[3,4.125],演出门 ×0.6 恒成立', () => {
    for (let i = 0; i < 96; i++) {
      const t = i / 32;                               // 覆盖三秒呼吸全域
      const n = Renderer.dd2CrystalBeamScaleY(t, false);
      const g = Renderer.dd2CrystalBeamScaleY(t, true);
      expect(n).toBeGreaterThanOrEqual(3);            // (2+0)×1.5
      expect(n).toBeLessThanOrEqual(4.125);           // (2+0.75)×1.5
      expect(Math.abs(g - n * 0.6)).toBeLessThan(1e-9); // 摘 ×0.6 → 红
    }
    // 算式锚点（t=0：t3=0,n130=0.5 → (2+0.375)×1.5）
    expect(Renderer.dd2CrystalBeamScaleY(0, false)).toBeCloseTo(3.5625, 9);
    expect(Renderer.dd2CrystalBeamScaleY(0, true)).toBeCloseTo(2.1375, 9);
  });

  it('倒计时秒数（Main.cs:46869 整除截断）+门直调（548/旗/hold 三门 1:1）', async () => {
    expect(Renderer.dd2CrystalCountdownSeconds(300)).toBe(5);   // StartInvasion hold 300
    expect(Renderer.dd2CrystalCountdownSeconds(1800)).toBe(30); // CheckProgress hold 1800
    expect(Renderer.dd2CrystalCountdownSeconds(61)).toBe(1);
    expect(Renderer.dd2CrystalCountdownSeconds(60)).toBe(1);
    expect(Renderer.dd2CrystalCountdownSeconds(59)).toBe(0);
    expect(Renderer.dd2CrystalCountdownSeconds(0)).toBe(0);
    // 门直调（Main.cs:46866 三门+548 门）
    const r = new Renderer(null as never);
    const draw = (r as unknown as { drawDd2CrystalCountdown(e: unknown, w: unknown): void }).drawDd2CrystalCountdown.bind(r);
    const { drawBakedMouseText } = (await import('../src/vui/draw/MouseTextBake')) as unknown as { drawBakedMouseText: ReturnType<typeof vi.fn> };
    const mock = drawBakedMouseText as unknown as ReturnType<typeof vi.fn>;
    mock.mockClear();
    const ctxStub = {} as object;
    (r as unknown as { ctx: object }).ctx = ctxStub;
    const crystal = { vanillaId: 548, dead: false, dontTakeDamageFromHostiles: false, cx: 500, y: 900, h: 40 };
    draw(crystal, { oldOnesArmy: { timeLeftUntilSpawningBegins: 300 } });
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][1]).toBe('5');                    // 300/60 整除
    expect(mock.mock.calls[0][2]).toBe(500);                    // 居中锚 = cx
    expect(mock.mock.calls[0][3]).toBe(900 + 40 - 100);         // Bottom-100
    mock.mockClear();
    // 门腿：演出期旗 → 照隐
    draw({ ...crystal, dontTakeDamageFromHostiles: true }, { oldOnesArmy: { timeLeftUntilSpawningBegins: 300 } });
    expect(mock).not.toHaveBeenCalled();
    // 门腿：hold=0 → 不画
    draw(crystal, { oldOnesArmy: { timeLeftUntilSpawningBegins: 0 } });
    expect(mock).not.toHaveBeenCalled();
    // 门腿：非 548 → 不画
    draw({ ...crystal, vanillaId: 551 }, { oldOnesArmy: { timeLeftUntilSpawningBegins: 300 } });
    expect(mock).not.toHaveBeenCalled();
  });
});
