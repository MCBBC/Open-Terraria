// ★对抗修复批①2026-09-01 打包回归（蓝队复核实锤后实施）——纯函数级断言为主 +
// 个别机制白盒。锚行均 Terarria1457：
//   ①TOWN_BOW[19] 连发链整段包 if(Main.hardMode)（cs:55114-55148 整段读取,
//     肉前 num54 恒 1 单发;硬模式才 dmg15+档 10/20/30）
//   ②TOWN_MELEE[142] aimLiftScaled:10（cs:55045 num47=10f）;★107 的 16f 在
//     cs:55015 实存,红队曾误报勿随动
//   ③魔法连发梯补全：160 档含 60 / 663 档含 55（`for(;localAI[3]>num64;+=步长)`
//     无界循环 cs:55447/:55459,可达档受 AttackTime 截断;末发与退出共帧先发后退）
//   ⑦湿身起身走程 RISE_LEG_WET = 700..899（cs:54197 `200+Next(500,700)`）
//   ⑤弹体 life 特判并上 107（cs:55070-55077 两连支 timeLeft=480）——实体白盒
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TOWN_BOW, TOWN_MELEE, TOWN_MAGIC, TOWN_ATTACK_TIME } from '../src/data/vanillaTownAttack';
import { TownNPC, RISE_LEG_WET_BASE, RISE_LEG_WET_RAND } from '../src/entities/TownNPC';
import { TownShot } from '../src/entities/TownShot';

/** 与 town-npc-attack.test.ts 同构最小场（平地 + 追踪敌；仅弹型断言用） */
function meleeRig(npcKey: string) {
  const world = new World(200, 200, 100, 'adv-fix1');
  for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, 100, 1);
  const npc = new TownNPC(npcKey, 100 * 16, 99 * 16);
  const enemy = { x: 104 * 16, y: 96 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true };
  const shots: TownShot[] = [];
  const game = {
    world,
    player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
    enemies: () => [enemy],
    critters: () => [],
    spawnTownShot: (s: TownShot) => shots.push(s),
    spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    addDamageNumber: () => {},
  } as never;
  return { npc, enemy, shots, game };
}

describe('★对抗修复批①2026-09-01 数据面拨正（vanillaTownAttack/TownNPC）', () => {
  it('①TOWN_BOW[19]:非困难模式无 burst（单发 num54=1），hardMode 才 [10,20,30]+dmg15', () => {
    const base = TOWN_BOW[19];
    // 顶层不得再挂 burst——肉前整段在 if(Main.hardMode) 外只有基础值
    expect(base.burst).toBeUndefined();
    expect(base.dmg).toBe(24);
    expect(base.shootTick).toBe(1);                 // num54 初值 1 两模式同源
    expect(base.hardMode).toBeDefined();
    // 消费端合并形态复现（TownNPC.atkParams 同式 { ...base, ...base.hardMode }）
    const hm = { ...base, ...base.hardMode! };
    expect(hm.burst).toEqual([10, 20, 30]);         // cs:55132-55148 三连支
    expect(hm.dmg).toBe(15);                        // cs:55129 num52=15 覆写保持
    expect(hm.shootTick).toBe(1);
    // 对照组不含误导性旧字段（曾在顶层直挂 burst）
    expect(base).not.toHaveProperty('burst');
  });

  it('②TOWN_MELEE[142].aimLiftScaled=10（cs:55045 num47）；107 保持 16 勿随红队误报', () => {
    expect(TOWN_MELEE[142]?.aimLiftScaled).toBe(10);   // cs:55045 num47=10f
    expect(TOWN_MELEE[107]?.aimLiftScaled).toBe(16);   // cs:55015 num47=16f 实存
  });

  it('③a TOWN_MAGIC[160] 开火集含 60（梯步长15至 AttackTime60）', () => {
    const m160 = TOWN_MAGIC[160];
    expect(m160.burst).toEqual([30, 45, 60]);
    expect(m160.shootTick).toBe(15);                // :55444 num64=15 初发
    // 可达档不越 AttackTime 截断面（末发与退出共帧、先发后退 :55473/:55551）
    const cap = TOWN_ATTACK_TIME[160];
    expect(Math.max(...m160.burst!)).toBeLessThanOrEqual(cap);
    // 步长校验（cs:55447 +=15）：15→30→45→60
    for (let i = 1; i < m160.burst!.length; i++) {
      expect(m160.burst![i] - m160.burst![i - 1]).toBe(15);
    }
  });

  it('③b TOWN_MAGIC[663] 开火集含 55（梯步长10至 AttackTime 内末档）', () => {
    const m663 = TOWN_MAGIC[663];
    expect(m663.burst).toEqual([25, 35, 45, 55]);
    expect(m663.shootTick).toBe(15);
    for (let i = 1; i < m663.burst!.length; i++) {
      expect(m663.burst![i] - m663.burst![i - 1]).toBe(10);   // cs:55459 +=10
    }
    expect(Math.max(...m663.burst!)).toBeLessThanOrEqual(TOWN_ATTACK_TIME[663]);
  });

  it('⑦RISE_LEG_WET 边界 = 700..899（cs:54197 200+Next(500,700)）', () => {
    expect(RISE_LEG_WET_BASE).toBe(700);            // Next 最小值 500 → 200+500
    expect(RISE_LEG_WET_RAND).toBe(200);            // Next(500,700) 开区间跨度
    expect(RISE_LEG_WET_BASE + RISE_LEG_WET_RAND - 1).toBe(899);   // 闭区间上界
  });

  it('⑤弹体 life 特判并上 107（实体白盒:哥布林工匠发射弹 life=480）', () => {
    // cs:55070-55077：if(type==588)||if(type==107) 两连支 timeLeft=480；
    // 消费位 = TownNPC.shootAt 尾部 TownShot opts.life
    const { npc, enemy, shots, game } = meleeRig('goblin_tinkerer');
    let fired = false;
    for (let t = 0; t < 4000 && !fired; t++) {
      enemy.x = npc.cx + 4 * 16;                    // 站地追踪保持危险窗内
      npc.fixedUpdate(1 / 60, game);
      if (shots.length) fired = true;
    }
    expect(fired).toBe(true);
    expect(shots[0].projId).toBe(24);               // 107 近战弹型（SetDefaults 载体）
    expect(shots[0].life).toBe(480);
    expect(shots[0].dead).toBe(false);
  });
});
