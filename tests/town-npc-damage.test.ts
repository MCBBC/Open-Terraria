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

/** 危险逃离(2026-08-17 接 NPC.cs:53864-54024)后 NPC 背敌走逃——PrettySafe 短窗族
 *  (108/160 PrettySafe=100)会先逃出圈再无触发窗口;敌贴身追踪保持危险态(逃/打循环
 *  =原版观感)。dx=2 格(敌中心距 ~42px < 100,保 PrettySafe 收口不触发) */
function chaseUntil(npc: TownNPC, enemy: TestEnemy, game: unknown, cond: () => boolean, maxT = 1500): void {
  for (let t = 0; t < maxT && !cond(); t++) {
    enemy.x = npc.cx + 2 * 16;
    npc.fixedUpdate(1 / 60, game as never);
  }
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
      chaseUntil(guide, enemy, game, () => shots.length > 0);
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
      // ★2026-08-30 实体侧对账批：入态目标须 Distance(Center) ≤ 50px（1457
      //   NPC.cs:56022-56025 flag36 狼人态门）——原位 103*16 距 ~52px 在原版永不触发,
      //   移近到 102*16（d≈46px）
      const enemy: TestEnemy = { x: 102 * 16, y: 97 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true };
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
    // 同上：入态 ≤50px 门（NPC.cs:56022-56025）→ 敌移近
    const enemy: TestEnemy = { x: 102 * 16, y: 97 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true };
    const { game, shots } = makeGame(enemy, 0, (w) => { w.clock.moonPhase = 1; }); // 白天缺省 + 非满月
    runUntil(zoo, game, () => shots.length > 0);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots[0].projId).toBe(880);
    expect(shots[0].damage).toBe(15);
  });

  it('巫师(108)连发:单次齐射 1-3 发(权重 4:2:1),每发 18(Classic)/27(Expert)', () => {
    // ★F1 收口（2026-08-30）：入态掷骰已前置到候选过滤之前（1457 NPC.cs:56037 门序
    //   = 先 Main.rand.Next(num122)==0 再进支内选候选+带检）——旧实现「先选后掷、
    //   无候选即零骰」曾迫使本测劫持全局 Math.random 做 LCG 替身迁就流位差。
    //   现恢复实例级确定性 rng 注入：同一 LCG 序列只喂 wiz.rng，全局随机面零污染
    for (const [diff, want] of [[0, 18], [1, 27]] as const) {
      const wiz = new TownNPC('wizard', 100 * 16, 99 * 16);
      let seed = 987654321;
      wiz.rng = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
      };
      const enemy: TestEnemy = { x: 103 * 16, y: 97 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true };
      const { game, shots } = makeGame(enemy, diff);                // DangerDetectRange[108]=100
      chaseUntil(wiz, enemy, game, () => shots.length > 0);
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
    const ey = 96 * 16, ew = 20, eh = 40;
    const enemy: TestEnemy = { x: 104 * 16, y: ey, w: ew, h: eh, dead: false, damage: 40, hurt: () => true };
    const { game, shots } = makeGame(enemy, 0);
    chaseUntil(truffle, enemy, game, () => shots.some((s) => s.projId === 590));
    const shot = shots.find((s) => s.projId === 590);
    expect(shot).toBeDefined();
    expect(shot!.vx).toBe(0);
    expect(shot!.vy).toBe(0);
    expect(shot!.damage).toBe(40);
    const ex = enemy.x;   // 发射档敌位（追踪定格于触发刻）
    const px = shot!.x + 5;
    const py = shot!.y + 5;
    expect(px).toBeGreaterThanOrEqual(ex - ew * 2);                 // :55349 [x−2w, x+3w]
    expect(px).toBeLessThanOrEqual(ex + ew * 3);
    expect(py).toBeGreaterThanOrEqual(ey - eh * 2);                 // [y−2h, y+3h]
    expect(py).toBeLessThanOrEqual(ey + eh * 3);
  });
});

// =====================================================================
// 医师 ai[0]==13 治疗城镇 NPC 整支（对齐批①,NPC.cs:55986-56005 触发 /
// :55360-55391 态推进 / 弹 AI_110 Projectile.cs:34691-34727）
// =====================================================================
describe('医师治疗城镇 NPC(NurseHeal 整链)', () => {
  /** 平地双 NPC 环境:护师在左、患者在右,3 格距,均站定不游走;rng 注入 0.9
   *  (攻击门/社交掷骰全不入——治疗触发无掷骰) */
  function nurseEnv(patientHp = 250, npcList?: TownNPC[]) {
    const world = new World(200, 200, 100, 'nurse-heal');
    for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, 100, 1);
    world.clock.timeOfDay = 0.5;
    const nurse = new TownNPC('nurse', 96 * 16, 99 * 16);
    nurse.stationary = true;
    nurse.rng = () => 0.9;
    const patient = new TownNPC('guide', 99 * 16, 99 * 16);
    patient.stationary = true;
    patient.rng = () => 0.9;
    if (patientHp < patient.maxHp) patient.hp = patientHp;
    const healEvents: Array<{ amt: number; color?: string }> = [];
    const shots: TownShot[] = [];
    const spawnedIds: number[] = [];
    const game = {
      world,
      player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
      enemies: () => [] as unknown[],
      critters: () => [],
      npcs: () => (npcList ?? [nurse, patient]),
      spawnTownShot: (s: TownShot) => { shots.push(s); spawnedIds.push(s.projId); },
      addDamageNumber: (_x: number, _y: number, amt: number, _c: boolean, color?: string) => {
        healEvents.push({ amt, color });
      },
      spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      behavioLog: () => {},
    } as never;
    return { world, nurse, patient, healEvents, shots, spawnedIds, game };
  }

  /** Game 投射物桶步进等价：测试端自驱 AI_110 弹（同帧序 NPC 后弹面） */
  function stepShots(shots: TownShot[], game: never): void {
    for (const s of shots) if (!s.dead) s.fixedUpdate(1 / 60, game);
    for (let i = shots.length - 1; i >= 0; i--) if (shots[i].dead) shots.splice(i, 1);
  }

  it('缺血患者在场→入态发弹 584→绿字 HealLife 每波 ≤20 回满(55988-55997/:34704-34712)', () => {
    const env = nurseEnv(210);                       // 缺血 40 → 至少两波 +20
    let ticks = 0;
    while (env.patient.hp < env.patient.maxHp && ticks++ < 4000) {
      env.nurse.fixedUpdate(1 / 60, env.game);
      env.patient.fixedUpdate(1 / 60, env.game);
      stepShots(env.shots, env.game);
    }
    expect(env.patient.hp).toBe(env.patient.maxHp);
    expect(env.spawnedIds.length).toBeGreaterThanOrEqual(2);   // 每波一弹 584
    for (const id of env.spawnedIds) expect(id).toBe(584);     // NurseSyringeHeal
    for (const e of env.healEvents) {
      expect(e.amt).toBeLessThanOrEqual(20);                  // min(lifeMax−life,20) 帽
      expect(e.amt).toBeGreaterThan(0);
      expect(e.color).toBe('#64FF64');                        // CombatText.HealLife(100,255,100)
    }
  });

  it('满血患者:永不触发(55990 life==lifeMax 排除),零弹零飘字', () => {
    const env = nurseEnv(250);
    for (let t = 0; t < 600; t++) {
      env.nurse.fixedUpdate(1 / 60, env.game);
      env.patient.fixedUpdate(1 / 60, env.game);
    }
    expect(env.shots).toHaveLength(0);
    expect(env.healEvents).toHaveLength(0);
    expect(env.nurse.healing).toBe(false);
  });

  it('★原版无 !=self 门:医师带伤独处时自我治疗(self 同权参与扫描 :55990)', () => {
    const solo = nurseEnv(250);
    solo.patient.dead = true;   // 其他 NPC 失活——可疗对象只剩护师本体
    solo.nurse.hp = 190;        // 缺血 60
    let ticks = 0;
    while (solo.nurse.hp < solo.nurse.maxHp && ticks++ < 8000) {
      solo.nurse.fixedUpdate(1 / 60, solo.game);
      stepShots(solo.shots, solo.game);
    }
    expect(solo.nurse.hp).toBe(solo.nurse.maxHp);
    expect(solo.spawnedIds.length).toBeGreaterThanOrEqual(3);
    for (const id of solo.spawnedIds) expect(id).toBe(584);
  });

  it('治疗态被打断:hurt() 命中即取消 ai[0]==13(StrikeNPC town 分支改写 ai[0] 的窄承接)', () => {
    const env = nurseEnv(210);
    let t = 0;
    while (!env.nurse.healing && t++ < 3000) {
      env.nurse.fixedUpdate(1 / 60, env.game);
      env.patient.fixedUpdate(1 / 60, env.game);
    }
    expect(env.nurse.healing).toBe(true);
    env.nurse.hurt(30, 1, 0, env.game);                        // 受击
    expect(env.nurse.healing).toBe(false);                     // 治疗态取消
  });

  it('治疗期不入自卫攻击态(flag31 的 ai[0]<2 门 :55645)', () => {
    const env = nurseEnv(210);
    let t = 0;
    while (!env.nurse.healing && t++ < 3000) {
      env.nurse.fixedUpdate(1 / 60, env.game);
      env.patient.fixedUpdate(1 / 60, env.game);
    }
    expect(env.nurse.attackState).toBe(0);                     // 治疗中恒非攻击态
  });
});
