// SW-FX13（2026-09-10）环境转换器族消费面定谳矩阵。
// 账本 L2 旧claim「Convert 引擎 case1-13 已建零消费」已过时——本文件把**消费面**
// 全量钉死（引擎 WorldEvolution.convert/convertArea 0-21 全 case 早已建,2026-08-20
// 起 spray/powder/水瓶/叶绿四链接入）：
//   ① 喷洒入口：SPRAY_PROJ 弹型表 = 1457 Projectile.cs:27165-27199（conv/dust 对）
//      + AI_031 弹心 Convert(conv, size 2/3)（:27200-27209,extraUpdates=2 → 每 tick
//      3 子步）+ 寿命钳 133（:27210-27213）——SolutionProj 实例级对拍。
//   ② 弹药→弹型链：PickAmmo 溶液加法（Player.cs:54125-54127 projToShoot += item.shoot
//      ——发射器 779/5134 shoot 145 + 溶液 780-784 shoot 0-4 / 5392-5394（DefaultTo-
//      Solution 1015-1017 → shoot=弹型-145=870-872, Item.cs:42773-42781/:47800-47810）
//      = resolveAmmoProjId useAmmo==780 支。
//   ③ 弹药栏准入：溶液 ammo=AmmoID.Solution(780) → ammoSlotAccepts（ItemSlot 弹药栏
//      面）——5392-5394 依赖 EXTRACT_PATCH 补条（vanilla-itemcombat 提取器对
//      DefaultToSolution 方法调用形不解析）。
//   ④ 消耗门：Terraformer 1/3 免耗掷（Player.cs:54231-54234）+ (779||5134) 连发窗
//      （:54308-54311）= solutionConsumesThisShot。
//   ⑤ 水瓶 Kill 转换：69/70/621 → Convert(2/1/4, 4)（Projectile.cs:79360-79378）。
//   ⑥ 引擎面：convertArea 尺寸窗 ±size + 菱形门 |dk|+|dl|<6 + InWorld 1 格边框
//      （WorldGen.cs:55542-55557）——case 5/6/7（黄/白/棕溶液消费的沙/雪/泥档）
//      端到端经同入口实证。
import { describe, it, expect } from 'vitest';
import {
  SPRAY_PROJ, SPRAY_PROJ_IDS, WATER_PROJ_CONV, SolutionProj, WaterSplashProj,
  solutionConsumesThisShot,
} from '../src/entities/SolutionProj';
import { resolveAmmoProjId, itemCombat, AMMO_SOLUTION } from '../src/data/vanillaItemCombat';
import { ammoSlotAccepts } from '../src/items/Inventory';
import { invIndexOfVanilla } from '../src/data/vanillaRecipes';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

// ---- sheet id → 内部 tile id（同 evolution-adjacent-rd11.test.ts 约定） ----
const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh != null && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? 0;

// ---------------------------------------------------------------------------
describe('SW-FX13 喷洒弹型表（1457 Projectile.cs:27165-27199 对拍）', () => {
  it('SPRAY_PROJ conv/dust 对 = AI_031 switch 逐支（default/147/146/148/149/1015/1016/1017）', () => {
    // 源码支序：default→[0,110]、147→[1,112]、146→[2,111]、148→[3,113]、
    // 149→[4,114]、1015→[5,311]、1016→[6,312]、1017→[7,313]
    expect(SPRAY_PROJ).toEqual({
      145: [0, 110],   // 绿溶液（PureSpray, conv 0 纯净）
      146: [2, 111],   // 蓝溶液（HallowSpray, conv 2 神圣）
      147: [1, 112],   // 紫溶液（CorruptSpray, conv 1 腐化）
      148: [3, 113],   // 深蓝溶液（MushroomSpray, conv 3 蘑菇）
      149: [4, 114],   // 红溶液（CrimsonSpray, conv 4 猩红）
      1015: [5, 311],  // 黄溶液（SandSpray, conv 5 沙漠）
      1016: [6, 312],  // 白溶液（SnowSpray, conv 6 雪原）
      1017: [7, 313],  // 棕溶液（DirtSpray, conv 7 森林）
    });
    expect(SPRAY_PROJ_IDS.size).toBe(8);
  });

  it('水瓶 Kill 转换表（:79360-79378）：69→2 / 70→1 / 621→4（size 4 由消费侧传）', () => {
    expect(WATER_PROJ_CONV).toEqual({ 69: 2, 70: 1, 621: 4 });
  });
});

// ---------------------------------------------------------------------------
describe('SW-FX13 溶液弹药链（PickAmmo 加法 + 准入 + 消耗门）', () => {
  it('发射器 779/5134：shoot 145 + useAmmo=Solution(780)（Item.cs:10502-10517/:41175-41189）', () => {
    for (const vid of [779, 5134]) {
      const c = itemCombat(vid);
      expect(c?.shoot, `${vid} shoot`).toBe(145);
      expect(c?.useAmmo, `${vid} useAmmo`).toBe(AMMO_SOLUTION);
      expect(c?.useTime, `${vid} useTime`).toBe(5);
      expect(c?.useAnimation, `${vid} useAnimation`).toBe(30);
    }
    expect(itemCombat(779)?.shootSpeed).toBe(7);    // :10514
    expect(itemCombat(5134)?.shootSpeed).toBe(11);  // :41187 Terraformer 更快
    expect(ammoSlotAccepts(invIndexOfVanilla(779))).toBe(false);   // 发射器本体非弹药
  });

  it('溶液弹药 shoot 0-4/870-872 + ammo=780 → PickAmmo 加法出 145-149/1015-1017', () => {
    // 弹药面数据（Item.cs:10518-10552 直接赋值形 + :42773-42781 DefaultToSolution 形）
    const ammoShoots: Record<number, number | undefined> = {
      780: 0, 781: 1, 782: 2, 783: 3, 784: 4,
      5392: 870, 5393: 871, 5394: 872,
    };
    const wantProj: Record<number, number> = {
      780: 145, 781: 146, 782: 147, 783: 148, 784: 149,
      5392: 1015, 5393: 1016, 5394: 1017,
    };
    for (const [ammoStr, shoot] of Object.entries(ammoShoots)) {
      const ammo = Number(ammoStr);
      const c = itemCombat(ammo);
      expect(c?.ammo, `${ammo} ammo=Solution`).toBe(AMMO_SOLUTION);
      expect(c?.shoot, `${ammo} shoot`).toBe(shoot);
      // PickAmmo 溶液加法（Player.cs:54125-54127）= resolveAmmoProjId useAmmo==780 支
      for (const launcher of [779, 5134]) {
        const pid = resolveAmmoProjId(launcher, ammo, AMMO_SOLUTION,
          itemCombat(launcher)?.shoot, c?.shoot);
        expect(pid, `${launcher}+${ammo}`).toBe(wantProj[ammo]);
      }
    }
  });

  it('8 溶液全可入弹药栏（ammoSlotAccepts,内部 id 面）——5392-5394 靠 EXTRACT_PATCH 补条', () => {
    for (const vid of [780, 781, 782, 783, 784, 5392, 5393, 5394]) {
      const iid = invIndexOfVanilla(vid);
      expect(iid, `溶液 ${vid} 未注册`).toBeGreaterThan(0);
      expect(ammoSlotAccepts(iid), `溶液 ${vid} 进不了弹药栏`).toBe(true);
    }
  });

  it('消耗门（:54231-54234/:54308-54311）：5134 1/3 免耗 + 连发窗免耗 + 首发恒扣', () => {
    // 5134 免耗掷：Next(3)==0 → 不扣（rnd=0 → floor(0*3)=0 命中）
    expect(solutionConsumesThisShot(5134, 5, null, 779, () => 0)).toBe(false);
    // 免耗掷落空（2/3）→ 首发无 swing → 扣
    expect(solutionConsumesThisShot(5134, 5, null, 779, () => 0.99)).toBe(true);
    // 779 无免耗掷 → 首发扣
    expect(solutionConsumesThisShot(779, 5, null, 779, () => 0)).toBe(true);
    // 连发窗：同 item 且 swing.t < dur-useTime → 不扣（:54308 itemAnimation < max-useTime）
    expect(solutionConsumesThisShot(779, 5,
      { item: 779, t: 30 - 5 - 1, dur: 30 }, 779, () => 0.99)).toBe(false);
    // 窗界：t = dur-useTime 恰好出窗 → 扣
    expect(solutionConsumesThisShot(779, 5,
      { item: 779, t: 30 - 5, dur: 30 }, 779, () => 0.99)).toBe(true);
    // 异 item swing（切枪）→ 扣
    expect(solutionConsumesThisShot(779, 5,
      { item: 98, t: 3, dur: 30 }, 779, () => 0.99)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('SW-FX13 SolutionProj 弹体（AI_031 实例级对拍）', () => {
  /** convert 回调收集器 */
  function collect() {
    const calls: Array<{ conv: number; i: number; j: number; size: number }> = [];
    return {
      calls,
      convert(conv: number, i: number, j: number, size: number) { calls.push({ conv, i, j, size }); },
    };
  }
  const HOOKS = {} as Parameters<SolutionProj['fixedUpdate']>[1];

  it('每 tick 3 子步（extraUpdates=2）+ 弹心 Convert(conv, size2)——绿溶液 conv 0', () => {
    const c = collect();
    const p = new SolutionProj(400, 400, 1, 0, 145, false, c.convert);
    p.fixedUpdate(1 / 60, HOOKS);
    expect(c.calls.length).toBe(3);
    for (const k of c.calls) {
      expect(k.conv).toBe(0);
      expect(k.size).toBe(2);
      expect(k.i).toBe(Math.floor((400 + 3) / 16));   // cx=盒心
      expect(k.j).toBe(Math.floor((400 + 3) / 16));
    }
  });

  it('Terraformer ai[1]=1 → size 3 + conv 按 1015 黄溶液=5（:27202-27206）', () => {
    const c = collect();
    const p = new SolutionProj(400, 400, 1, 0, 1015, true, c.convert);
    p.fixedUpdate(1 / 60, HOOKS);
    expect(c.calls.length).toBe(3);
    for (const k of c.calls) {
      expect(k.conv).toBe(5);
      expect(k.size).toBe(3);
    }
  });

  it('寿命钳 133 子步（:27210-27213）：1800 起步首 tick 钳后 130,tick45 亡', () => {
    const c = collect();
    const p = new SolutionProj(400, 400, 1, 0, 146, false, c.convert);
    for (let k = 0; k < 44; k++) p.fixedUpdate(1 / 60, HOOKS);
    expect(p.dead).toBe(false);
    p.fixedUpdate(1 / 60, HOOKS);
    expect(p.dead).toBe(true);
    // 累计 Convert 恰 45×3 子步（无多跑）
    expect(c.calls.length).toBe(45 * 3);
  });
});

// ---------------------------------------------------------------------------
describe('SW-FX13 水瓶弹体（Kill → Convert size4 实例级）', () => {
  function splashGame(st: TileStore) {
    return {
      world: { store: st },
      enemies: () => [],
      playSfxAt: () => {},
      spawnDust: () => null,
      spawnParticles: () => {},
    } as unknown as Parameters<WaterSplashProj['fixedUpdate']>[1];
  }

  it('撞块 Kill → Convert(弹心格, conv, 4)（:79360-79378）——圣水 69→神圣 2', () => {
    const st = new TileStore(40, 40);
    for (let x = 24; x <= 27; x++) st.setTileSilent(x, 20, S(1));   // 前方石墙带（Kill 点）
    const calls: Array<{ conv: number; i: number; j: number; size: number }> = [];
    // 出生 (380,320)：探针位 nx+w/2=386+7=393→tile24 ∈ 墙带 → 首拍 Kill
    const p = new WaterSplashProj(380, 320, 6, 0, 69, 20, 3,
      (conv, i, j, size) => calls.push({ conv, i, j, size }));
    p.fixedUpdate(1 / 60, splashGame(st));
    expect(p.dead).toBe(true);
    expect(calls.length).toBe(1);
    // 弹心 = position + size/2（:79361-79362 i2/j2 算式）——Kill 在位移前（探针杀位）
    expect(calls[0]).toMatchObject({ conv: 2, size: 4 });
    expect(calls[0].i).toBe(Math.floor((380 + 7) / 16));
    expect(calls[0].j).toBe(Math.floor((320 + 7) / 16));
  });

  it('三瓶转换对拍：70→腐化 1 / 621→猩红 4', () => {
    for (const [proj, conv] of [[70, 1], [621, 4]] as const) {
      const st = new TileStore(40, 40);
      for (let x = 24; x <= 27; x++) st.setTileSilent(x, 20, S(1));
      const calls: Array<{ conv: number }> = [];
      const p = new WaterSplashProj(380, 320, 6, 0, proj, 20, 3,
        (c) => calls.push({ conv: c }));
      p.fixedUpdate(1 / 60, splashGame(st));
      expect(p.dead).toBe(true);
      expect(calls.length).toBe(1);
      expect(calls[0].conv).toBe(conv);
    }
  });
});

// ---------------------------------------------------------------------------
describe('SW-FX13 Convert 引擎面（convertArea 几何 + case 5/6/7 端到端）', () => {
  function makeEvo(st: TileStore, over: Partial<EvolutionHost> = {}): WorldEvolution {
    const host: EvolutionHost = {
      store: st,
      seed: 20260910,
      worldSurface: 50, rockLevel: 500, dungeonX: 600, difficulty: 0,
      flags: {}, crimson: false, isDay: true, raining: false,
      maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
      ...over,
    };
    return new WorldEvolution(host);
  }
  const sheetOf = (st: TileStore, i: number, j: number): number => {
    const k = st.idx(i, j);
    return TILE_DEFS[st.type[k]]?.vanilla?.sheet ?? -1;
  };

  it('溶液黄 conv5 尺寸 2（AI_031 消费形态）：5×5 窗全转（菱形门 <6 不裁 ±2 窗）', () => {
    const st = new TileStore(80, 80);
    for (let i = 8; i <= 16; i++) for (let j = 8; j <= 16; j++) st.setTileSilent(i, j, S(2)); // 草
    const evo = makeEvo(st);
    evo.convertArea(12, 12, 5, 2);   // 绿溶液/黄溶液消费入口（size=2）
    for (let i = 10; i <= 14; i++) for (let j = 10; j <= 14; j++) {
      expect(sheetOf(st, i, j), `(${i},${j})`).toBe(53);   // 草→沙（case 5 CONV_GRASS→53）
    }
    expect(sheetOf(st, 9, 12)).toBe(2);                   // 窗外不动
  });

  it('菱形门 <6 钉值（WorldGen.cs:55551）：size 5 时 11×11 窗的四角 (dist 10) 不转', () => {
    const st = new TileStore(80, 80);
    for (let i = 2; i <= 22; i++) for (let j = 2; j <= 22; j++) st.setTileSilent(i, j, S(2));
    const evo = makeEvo(st);
    evo.convertArea(12, 12, 5, 5);
    expect(sheetOf(st, 12 + 5, 12)).toBe(53);      // 轴向 dist 5 < 6 → 转
    expect(sheetOf(st, 12 + 5, 12 + 1)).toBe(2);   // dist 6 = 边界（<6 严格）→ 不转
    expect(sheetOf(st, 12 + 5, 12 + 5)).toBe(2);   // 角 dist 10 ≥ 6 → 不转
    expect(sheetOf(st, 12 + 3, 12 + 2)).toBe(53);  // dist 5 < 6 → 转
    expect(sheetOf(st, 12 + 4, 12 + 3)).toBe(2);   // dist 7 ≥ 6 → 不转
  });

  it('白溶液 conv6：石→冰 161；棕溶液 conv7：沙→泥/草（露天 2）', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(12, 12, S(1));   // 石
    st.setTileSilent(20, 12, S(53));  // 沙（上方露天）
    const evo = makeEvo(st);
    evo.convertArea(12, 12, 6, 0);    // size 0 = 单格（白溶液对石臂）
    evo.convertArea(20, 12, 7, 0);    // 棕溶液对沙臂
    expect(sheetOf(st, 12, 12)).toBe(161);
    expect(sheetOf(st, 20, 12)).toBe(2);   // tileExposedToAir → 草 2
  });

  it('InWorld 1 格边框（:55551 InWorld(k,l,1)）：世界边缘 1 圈不被喷洒', () => {
    const st = new TileStore(20, 20);
    for (let i = 0; i <= 3; i++) for (let j = 8; j <= 12; j++) st.setTileSilent(i, j, S(2));
    const evo = makeEvo(st);
    evo.convertArea(2, 10, 5, 2);
    expect(sheetOf(st, 1, 10)).toBe(53);   // k=1（边界内首格）转
    expect(sheetOf(st, 0, 10)).toBe(2);    // k=0（边框）不转
  });
});
