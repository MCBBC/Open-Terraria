// 城镇 NPC 自卫攻击伤害难度缩放(NPC.cs:7041-7044 GetAttackDamage_ForTownNPC =
// ×GameDifficultyData.cs:69 TownNPCDamageMultiplier.Sample(Main.Difficulty)):
//   Journey 2 / Classic 1 / Expert 1.5 / Master 1.75(曲线无 Master 键——Sample 在
//   Expert1.5-Legendary2 区间线性插值)/ Legendary 2;
//   (int) 强转 = 向零截断(11×1.5=16.5→16,非四舍五入 17)。
// 消费点 = AI_007 四攻击态伤害入参(近战 :54897/弓 :55169/魔法 :55319/挥击 :55466)。
// 附:633 狼人变体(:54782-54785)/108 连发权重 4:2:1(:55336-55348)/
// 160·663 落点弹几何(:55349/:55367)同批评测。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { TownShot } from '../src/entities/TownShot';
import { getAttackDamageForTownNPC, GDL } from '../src/stats/ScaleStats';

interface TestEnemy {
  x: number; y: number; w: number; h: number; dead: boolean; damage: number;
  hurt: () => boolean;
}

function makeGame(enemy: TestEnemy, difficulty: number, clock?: (w: World) => void) {
  const world = new World(200, 200, 100, 'town-dmg-test');
  world.difficulty = difficulty;
  for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, 100, 1);
  clock?.(world);
  const shots: TownShot[] = [];
  const enemies = [enemy];
  return {
    world, shots,
    game: {
      world,
      player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
      enemies: () => enemies,
      spawnTownShot: (s: TownShot) => shots.push(s),
      spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      addDamageNumber: () => {},
      critters: () => [],
    } as never,
  };
}

/** 跑到 cond 成立(每 tick 后查;攻击触发门带掷骰,给足窗口) */
function runUntil(npc: TownNPC, game: unknown, cond: () => boolean, maxT = 1500): void {
  for (let t = 0; t < maxT && !cond(); t++) npc.fixedUpdate(1 / 60, game as never);
}

describe('TownNPC 攻击伤害难度缩放(GetAttackDamage_ForTownNPC)', () => {
  it('纯函数五档:Classic 1 / Expert 1.5 / Master 1.75 插值 / Legendary 2 / Journey 2', () => {
    expect(getAttackDamageForTownNPC(12, GDL.CLASSIC)).toBe(12);
    expect(getAttackDamageForTownNPC(12, GDL.EXPERT)).toBe(18);
    expect(getAttackDamageForTownNPC(12, GDL.MASTER)).toBe(21);      // 12×1.75
    expect(getAttackDamageForTownNPC(12, GDL.LEGENDARY)).toBe(24);
    expect(getAttackDamageForTownNPC(12, GDL.JOURNEY)).toBe(24);
  });

  it('(int) 截断语义:16.5→16 / 38.5→38(非四舍五入)', () => {
    expect(getAttackDamageForTownNPC(11, GDL.EXPERT)).toBe(16);
    expect(getAttackDamageForTownNPC(22, GDL.MASTER)).toBe(38);
    expect(getAttackDamageForTownNPC(15, GDL.LEGENDARY)).toBe(30);
  });

  it('向导(22)弓态:Classic 12 / Expert 18 / Master 21(全链集成)', () => {
    const want: Record<number, number> = { 0: 12, 1: 18, 2: 21 };
    for (const [diff, dmg] of Object.entries(want)) {
      const guide = new TownNPC('guide', 100 * 16, 99 * 16);
      const enemy: TestEnemy = { x: 106 * 16, y: 96 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true };
      const { game, shots } = makeGame(enemy, Number(diff));
      runUntil(guide, game, () => shots.length > 0);
      expect(shots.length, `difficulty=${diff}`).toBeGreaterThan(0);
      expect(shots[0].projId, `difficulty=${diff}`).toBe(1);        // 肉前木箭
      expect(shots[0].damage, `difficulty=${diff}`).toBe(dmg);
    }
  });
});

describe('TownNPC 攻击特化(发射端考古销项)', () => {
  it('动物学家(633)满月夜狼人态:proj 929 + dmg×1.5 截断 22;Expert 33', () => {
    for (const [diff, want] of [[0, 22], [1, 33]] as const) {
      const zoo = new TownNPC('zoologist', 100 * 16, 99 * 16);
      const enemy: TestEnemy = { x: 103 * 16, y: 97 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true };
      // 满月夜:timeOfDay 0 = 午夜(isDay false),moonPhase 0 = 满月
      const { game, shots } = makeGame(enemy, diff, (w) => {
        w.clock.timeOfDay = 0;
        w.clock.moonPhase = 0;
      });
      runUntil(zoo, game, () => shots.length > 0);
      expect(shots.length, `difficulty=${diff}`).toBeGreaterThan(0);
      expect(shots[0].projId, `difficulty=${diff}`).toBe(929);      // :54783 狼人弹
      expect(shots[0].damage, `difficulty=${diff}`).toBe(want);     // trunc(15×1.5)=22;Expert ×1.5→33
    }
  });

  it('动物学家(633)白天非满月:常态 proj 880 / dmg 15', () => {
    const zoo = new TownNPC('zoologist', 100 * 16, 99 * 16);
    const enemy: TestEnemy = { x: 103 * 16, y: 97 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true };
    const { game, shots } = makeGame(enemy, 0, (w) => { w.clock.moonPhase = 1; }); // 白天缺省 + 非满月
    runUntil(zoo, game, () => shots.length > 0);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots[0].projId).toBe(880);
    expect(shots[0].damage).toBe(15);
  });

  it('巫师(108)连发:单次齐射 1-3 发(权重 4:2:1),每发 18(Classic)/27(Expert)', () => {
    for (const [diff, want] of [[0, 18], [1, 27]] as const) {
      const wiz = new TownNPC('wizard', 100 * 16, 99 * 16);
      const enemy: TestEnemy = { x: 103 * 16, y: 97 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true };
      const { game, shots } = makeGame(enemy, diff);                // DangerDetectRange[108]=100
      runUntil(wiz, game, () => shots.length > 0);
      expect(shots.length, `difficulty=${diff}`).toBeGreaterThanOrEqual(1);
      expect(shots.length, `difficulty=${diff}`).toBeLessThanOrEqual(3);   // :55337 SelectRandom
      for (const s of shots) {
        expect(s.projId).toBe(15);
        expect(s.damage).toBe(want);
        expect(s.vx).toBeGreaterThan(0);                            // 朝右侧目标(基速 6±3.4)
        expect(s.vx).toBeLessThanOrEqual(6 + 3.4 + 1e-9);
      }
    }
  });

  it('公主(663)落点弹:position+Size×rand(0..1) 采样,velocity=0,dmg 15', () => {
    const princess = new TownNPC('princess', 100 * 16, 99 * 16);
    const ex = 104 * 16, ey = 96 * 16, ew = 20, eh = 40;
    const enemy: TestEnemy = { x: ex, y: ey, w: ew, h: eh, dead: false, damage: 40, hurt: () => true };
    const { game, shots } = makeGame(enemy, 0);
    runUntil(princess, game, () => shots.some((s) => s.projId === 950));
    const shot = shots.find((s) => s.projId === 950);
    expect(shot).toBeDefined();
    expect(shot!.vx).toBe(0);                                       // 落点弹 velocity=0
    expect(shot!.vy).toBe(0);
    expect(shot!.damage).toBe(15);                                  // 非硬模式 15(硬模式 20)
    const px = shot!.x + 5;                                         // TownShot 10px 锚 −5 回采样点
    const py = shot!.y + 5;
    expect(px).toBeGreaterThanOrEqual(ex);                          // :55367 [x, x+w]
    expect(px).toBeLessThanOrEqual(ex + ew);
    expect(py).toBeGreaterThanOrEqual(ey);                          // [y, y+h]
    expect(py).toBeLessThanOrEqual(ey + eh);
  });

  it('松露人(160)落点弹:position−Size×2+Size×rand×5 采样盒,velocity=0,dmg 40', () => {
    const truffle = new TownNPC('truffle', 100 * 16, 99 * 16);
    const ex = 104 * 16, ey = 96 * 16, ew = 20, eh = 40;
    const enemy: TestEnemy = { x: ex, y: ey, w: ew, h: eh, dead: false, damage: 40, hurt: () => true };
    const { game, shots } = makeGame(enemy, 0);
    runUntil(truffle, game, () => shots.some((s) => s.projId === 590));
    const shot = shots.find((s) => s.projId === 590);
    expect(shot).toBeDefined();
    expect(shot!.vx).toBe(0);
    expect(shot!.vy).toBe(0);
    expect(shot!.damage).toBe(40);
    const px = shot!.x + 5;
    const py = shot!.y + 5;
    expect(px).toBeGreaterThanOrEqual(ex - ew * 2);                 // :55349 [x−2w, x+3w]
    expect(px).toBeLessThanOrEqual(ex + ew * 3);
    expect(py).toBeGreaterThanOrEqual(ey - eh * 2);                 // [y−2h, y+3h]
    expect(py).toBeLessThanOrEqual(ey + eh * 3);
  });
});
