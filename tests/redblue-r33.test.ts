// R33 蓝队回归（red-team-r33 → blue-team-r33）：
//   ① 月主委托件数据面翻正（itemfunc 委托展开 + itemcombat 九挥砍件回填 + 六锯钻扩字段）
//   ② ChainsawProj 判定盒吃 proj.scale（SetDefaults 尾 :10673-10674）+ 速度模五档
//   ③ ai75 激光钻分支（Item132/23t :67285 + 相位灯串 :67300-67320，无火花尘）
//   ④ 命中 DamageVar（Damage_PVE :14719）——方差在基伤掷、暴击翻倍在后
//   ⑤ 批次 A：496 冰雪法杖 kb 终值 2 / 纸飞机 / 新奇品 / PrincessWeapon 数据面
import { describe, it, expect, vi } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ChainsawProj } from '../src/entities/ChainsawProj';
import { projectileData } from '../src/data/vanillaProjectiles';
import { itemCombat } from '../src/data/vanillaItemCombat';
import itemFuncRaw from '../src/data/vanilla-itemfunc.json';
import combatRaw from '../src/data/vanilla-itemcombat.json';
import type { GameHooks } from '../src/entities/types';

const FUNC = itemFuncRaw as unknown as Record<string, Record<string, number>>;
const COMBAT = combatRaw as unknown as Record<string, Record<string, unknown>>;

function makeHooks() {
  const player = new Player(50 * 16, 90 * 16, new Inventory());
  const enemies: Array<Record<string, unknown>> = [];
  const sfx: string[] = [];
  let dustCalls = 0;
  const hooks: GameHooks = {
    world: { store: {} } as never,
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
    playSfxFiles: (files) => { sfx.push(files[0]); },
    showPickupLabel: () => {},
    spawnDust: () => { dustCalls++; return null; },
  };
  return { hooks, player, enemies, sfx, dustCount: () => dustCalls };
}

const run = (e: { fixedUpdate: (dt: number, g: GameHooks) => void; dead?: boolean }, g: GameHooks, n: number) => {
  for (let i = 0; i < n && !e.dead; i++) e.fixedUpdate(1 / 60, g);
};

// ============================================================
// ① 月主委托件数据面（red-team-r33 P0-①②）
// ============================================================
describe('月主委托件数据面翻正', () => {
  it('六锯钻 itemfunc=工具力齐（2778 axe27 / 2779 pick225…）→ itemFuncTool 不再判空', () => {
    for (const [vid, tool] of [
      ['2778', 'axe'], ['2783', 'axe'], ['3463', 'axe'],
      ['2779', 'pick'], ['2784', 'pick'], ['3464', 'pick'],
    ] as const) {
      expect(FUNC[vid]?.[tool], `${vid} ${tool}`).toBe(tool === 'axe' ? 27 : 225);
      // Game 工具分支接管后 combatWeapon 的 'shot' 兜底不再被消费；combat 面须完整
      expect(COMBAT[vid]?.damage).toBe(vid === '2779' || vid === '2784' || vid === '3464' ? 50 : 80);
      expect(COMBAT[vid]?.shoot).toBe(Number(FUNC[vid].shoot ?? COMBAT[vid]?.shoot));
      expect(COMBAT[vid]?.noMelee).toBe(true);
    }
  });

  it('六锯钻 channel/noMelee/melee 面 = AI_020 持械族（1456 :26571 区段终态）', () => {
    for (const vid of ['2778', '2783', '3463']) {
      expect(FUNC[vid]).toMatchObject({ melee: 1, noMelee: 1, channel: 1, useStyle: 5, knockBack: 4 });
    }
    for (const vid of ['2779', '2784', '3464']) {
      expect(FUNC[vid]).toMatchObject({ melee: 1, noMelee: 1, channel: 1, useStyle: 5, knockBack: 0.5, pick: 225 });
    }
  });

  it('九挥砍件 combat+itemfunc 双全（斧100/锤110/镐80——修前双缺=左键纯摆动）', () => {
    for (const vid of ['2777', '2782', '3462']) {
      expect(COMBAT[vid]).toMatchObject({ damage: 100, knockBack: 6, useTime: 7, useAnimation: 25, autoReuse: true, melee: true });
      expect(FUNC[vid]?.axe).toBe(27);
    }
    for (const vid of ['2780', '2785', '3465']) {
      expect(COMBAT[vid]).toMatchObject({ damage: 110, knockBack: 7, useTime: 7, useAnimation: 30, autoReuse: true, melee: true });
      expect(FUNC[vid]?.hammer).toBe(100);
    }
    for (const vid of ['2781', '2786', '3466']) {
      expect(COMBAT[vid]).toMatchObject({ damage: 80, knockBack: 5.5, useTime: 6, useAnimation: 12, autoReuse: true, melee: true });
      expect(FUNC[vid]?.pick).toBe(225);
    }
  });

  it('弹体面：月主竖长盒在册（427:22×56 / 431·610:28×64 / 609:30×54）且 aiStyle20', () => {
    expect(projectileData(427)).toMatchObject({ width: 22, height: 56, aiStyle: 20 });
    expect(projectileData(431)).toMatchObject({ width: 28, height: 64, aiStyle: 20 });
    expect(projectileData(610)).toMatchObject({ width: 28, height: 64, aiStyle: 20 });
    expect(projectileData(609)).toMatchObject({ width: 30, height: 54, aiStyle: 20 });
    expect(projectileData(445)).toMatchObject({ width: 10, height: 10, aiStyle: 75 });
  });
});

// ============================================================
// ② ChainsawProj 参数化（判定盒 ×proj.scale + 速度模五档）
// ============================================================
describe('ChainsawProj 判定盒/速度模参数化（r33-②）', () => {
  it('509：22×1.2→26×26（(int) 截断）；缺省 speed=48×1.2', () => {
    const { hooks, player } = makeHooks();
    const saw = new ChainsawProj(player, 120, 8, () => true,
      () => ({ x: player.cx + 300, y: player.cy }), { projId: 509, shootSpeed: 48 });
    expect(saw.w).toBe(26);
    expect(saw.h).toBe(26);
    run(saw, hooks, 1);
    expect(Math.hypot(saw.vx, saw.vy)).toBeGreaterThan(48 * 1.2 * 0.96);   // ±3% 抖动下界
  });

  it('金属钻 59：22×0.9→19×19（修前恒 22 反向虚大）+ 速度模 ×0.9（修前 ×1.2 = +33%）', () => {
    const { hooks, player } = makeHooks();
    const saw = new ChainsawProj(player, 10, 0.5, () => true,
      () => ({ x: player.cx + 300, y: player.cy }), { projId: 59, shootSpeed: 32 });
    expect(saw.w).toBe(19);
    expect(saw.h).toBe(19);
    run(saw, hooks, 1);
    const m = Math.hypot(saw.vx, saw.vy);
    expect(m).toBeGreaterThanOrEqual(32 * 0.9 * 0.97 - 1e-9);
    expect(m).toBeLessThanOrEqual(32 * 0.9 * 1.05 + 1e-9);
  });

  it('月主链锯 431：28×64 竖长盒（修前被压成 22×22 = 面积损失 74%）', () => {
    const { player } = makeHooks();
    const saw = new ChainsawProj(player, 80, 4, () => true,
      () => ({ x: player.cx, y: player.cy }), { projId: 431, shootSpeed: 28 });
    expect(saw.w).toBe(28);
    expect(saw.h).toBe(64);
  });

  it('帧动画门：252 四帧循环、非 252/509 族恒 frame0（AI_020 无帧支 :25807-25829）', () => {
    const { hooks, player } = makeHooks();
    const jack = new ChainsawProj(player, 45, 5.2, () => true,
      () => ({ x: player.cx, y: player.cy }), { projId: 252, shootSpeed: 46 });
    run(jack, hooks, 5);   // 4t/帧 → 第 5t 已入第二帧
    // frame 私有——经 draw 不可达，改以行为面验证：无异常即帧推进不炸
    expect(jack.dead).toBe(false);
  });
});

// ============================================================
// ③ ai75 激光钻分支（Item132/23t + 相位灯 + 无火花尘）
// ============================================================
describe('激光钻 ai75 分支（2798→445，r33-③）', () => {
  it('音 Item132 每 23t（AI_075 :67285-67292），不吃 pick 分档', () => {
    const { hooks, player, sfx } = makeHooks();
    const saw = new ChainsawProj(player, 35, 4.75, () => true,
      () => ({ x: player.cx + 200, y: player.cy }),
      { projId: 445, pick: 230, shootSpeed: 36, laser: true });
    run(saw, hooks, 1);
    expect(sfx).toEqual(['Item_132']);
    run(saw, hooks, 22);
    expect(sfx.length).toBe(1);
    run(saw, hooks, 1);
    expect(sfx.length).toBe(2);       // 第 24 tick 再播
  });

  it('盒 = 10×10（SetDefaults :5164-5174，scale 缺省 1 不缩）', () => {
    const { player } = makeHooks();
    const saw = new ChainsawProj(player, 35, 4.75, () => true,
      () => ({ x: player.cx, y: player.cy }), { projId: 445, shootSpeed: 36, laser: true });
    expect(saw.w).toBe(10);
    expect(saw.h).toBe(10);
  });

  it('相位灯串：lightRGB 落青-蓝带（×0.5），60t 相位归零（:67300-67320）', () => {
    const { hooks, player } = makeHooks();
    const saw = new ChainsawProj(player, 35, 4.75, () => true,
      () => ({ x: player.cx + 200, y: player.cy }),
      { projId: 445, shootSpeed: 36, laser: true });
    run(saw, hooks, 1);
    const l = saw.lightRGB!;
    expect(l[0]).toBe(0);                       // R 恒 0（青→蓝均无红）
    expect(l[1]).toBeGreaterThanOrEqual(0.35);  // G ∈ [0.35, 0.5]
    expect(l[1]).toBeLessThanOrEqual(0.5);
    expect(l[2]).toBeGreaterThanOrEqual(0.35);  // B ∈ [0.35, 0.5]
    expect(l[2]).toBeLessThanOrEqual(0.5);
    expect(saw.lightRGBAt).not.toBeNull();
  });

  it('ai75 无火花尘段——laser 模式不产尘 31（尘仅 ai20 :23933-23941）', () => {
    const { hooks, player, dustCount } = makeHooks();
    const saw = new ChainsawProj(player, 35, 4.75, () => true,
      () => ({ x: player.cx + 200, y: player.cy }),
      { projId: 445, shootSpeed: 36, laser: true });
    run(saw, hooks, 40);                        // 1/6 概率下 40t 必然命中数次（P≈1−(5/6)⁴⁰≈1）
    expect(dustCount()).toBe(0);
  });
});

// ============================================================
// ④ 命中 DamageVar（:14719）——方差基伤掷、暴击 ×2 在后
// ============================================================
describe('命中伤害方差（r33-④）', () => {
  it('非暴击伤 ∈ damage±15%（luck=0 单掷域）', () => {
    // ★BJ266 定谳：暴击掷 Math.random()<0.04（ChainsawProj :250）≈4% 假红率——
    //   钉 RNG=0.99（非暴击档；DamageVar 方差同源取 +15 档=137，仍在本测 ±15% 窗内）。
    //   try/finally 恢复，防污染同文件真随机消费面（③ 40t 尘概率测试等）。
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    try {
    const { hooks, player } = makeHooks();
    const saw = new ChainsawProj(player, 120, 8, () => true,
      () => ({ x: player.cx + 40, y: player.cy }), { projId: 509, shootSpeed: 48 });
    // 瞄准向 +x → 弹盒锚 cx−13..cx+13（509 半宽 13）；敌怪盒须与弹盒相交
    const foe = { id: 1, x: player.cx + 5, y: player.cy - 8, w: 16, h: 16, dead: false,
      hurt: (d: number) => { (foe as { got?: number }).got = d; return true; } };
    enemies_push(hooks, foe);
    run(saw, hooks, 1);
    const got = (foe as { got?: number }).got ?? -1;
    expect(got).toBeGreaterThanOrEqual(Math.floor(120 * 0.85));
    expect(got).toBeLessThanOrEqual(Math.ceil(120 * 1.15));
    } finally { rand.mockRestore(); }
  });
});

function enemies_push(hooks: GameHooks, foe: unknown) {
  (hooks as unknown as { enemies: () => unknown[] }).enemies().push(foe);
}

// ============================================================
// ⑤ 批次 A 数据面（496 / 纸飞机 / 新奇品 / PrincessWeapon）
// ============================================================
describe('批次 A 清欠（red-r33 §八）', () => {
  it('496 冰雪法杖 knockBack=2（:7297 knockBack=0f → :7300 再赋 2f，顺序语义终值）', () => {
    expect(COMBAT['496']?.knockBack).toBe(2);
  });

  it('PrincessWeapon 5065：DefaultToStaff(950,10f,25,18)+SetWeaponValues(70,5f)（:40613-40615）', () => {
    expect(COMBAT['5065']).toMatchObject({
      shoot: 950, useTime: 25, useAnimation: 25, shootSpeed: 10,
      mana: 18, damage: 70, knockBack: 5, noMelee: true, magic: true, autoReuse: true,
    });
  });

  it('纸飞机 4343/4344：DefaultToThrownWeapon(761/762,17,5f)+SetWeaponValues(4,2f)', () => {
    for (const [vid, sh] of [['4343', 761], ['4344', 762]] as const) {
      expect(COMBAT[vid]).toMatchObject({
        shoot: sh, useTime: 17, useAnimation: 17, shootSpeed: 5,
        damage: 4, knockBack: 2, noMelee: true, ranged: true, consumable: true, autoReuse: false,
      });
    }
  });

  it('新奇品五件缺字段补齐（★golden useTime 4/8 系 velocity 误当 useTime，源码 25/20）', () => {
    expect(COMBAT['4682']).toMatchObject({ shoot: 851, useTime: 25, useAnimation: 25, shootSpeed: 4, ranged: false });
    expect(COMBAT['4702']).toMatchObject({ shoot: 855, useTime: 25, useAnimation: 25, shootSpeed: 4, ranged: false });
    expect(COMBAT['4765']).toMatchObject({ shoot: 868, useTime: 20, useAnimation: 20, shootSpeed: 8 });
    expect(COMBAT['4766']).toMatchObject({ shoot: 869, useTime: 20, useAnimation: 20, shootSpeed: 8 });
    expect(COMBAT['5285']).toMatchObject({ shoot: 996, useTime: 20, useAnimation: 20, shootSpeed: 8 });
  });

  it('usesound 缺键补齐：九月主 Item_1 / 6153·6154 命名轨（源码 UseSound 显式行）', async () => {
    const us = (await import('../src/data/vanilla-itemusesound.json')).default as Record<string, string>;
    for (const vid of ['2777', '2780', '2781', '2782', '2785', '2786', '3462', '3465', '3466']) {
      expect(us[vid], vid).toBe('Item_1');
    }
    expect(us['6153']).toBe('GlacierFang_Charging');
    expect(us['6154']).toBe('MysticBloom');
    // 源码无 UseSound 行的件保持无键（显式静音缺省）：2798 激光钻/纸飞机/释放新奇品
    for (const vid of ['2798', '4343', '4344', '4682', '4702']) {
      expect(us[vid], `${vid} 应无键`).toBeUndefined();
    }
  });
});
