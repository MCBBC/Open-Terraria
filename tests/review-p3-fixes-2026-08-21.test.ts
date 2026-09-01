// 复审 P3 四件回归（2026-08-21）：
//  ① 血月钓鱼生成链：Bobber.fishingCheck 敌怪掷（FishingCheck_RollEnemySpawns
//     Projectile.cs:19398-19429：血月夜非岩浆/蜂蜜池 1/6（血肉竿 4325→1/3）；
//     682 未解锁 1/5 优先 / 困难 {620 地精鲨,621 血鳗鱼,586 僵尸人鱼,587 眼球飞鱼}
//     +1/10 618 恐惧鹦鹉螺 / 非困难 {586,587}）+ 血鳗鱼 621 首帧 15身+1尾建链
//     （NPC.cs:51672-51690）——复审曾指认"孤路死码"，本测钉死掷→链两端。
//  ② 蠕虫链距覆写表（NPC.cs:52279-52303）：87-92 飞龙 42 / 454-459 幻影龙 36 /
//     513-515 墓穴爬虫 w−6 / 621-623 血鳗鱼 24 / 其余族 = 段自身 width。
//  ③ PickAmmo 尾链 >0 门（Player.cs:52656-52659）：弹药 shoot:0 不再被 ?? 当有效值。
//  ④ Convert InWorld(·,1)（WorldGen.cs:9635-9643 / :55108 / :55117）：留 1 格世界边框。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Enemy } from '../src/entities/Enemy';
import { Bobber } from '../src/entities/Bobber';
import { TILE } from '../src/core/constants';
import { resolveAmmoProjId } from '../src/data/vanillaItemCombat';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { TILE_DEFS } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

/** sheet id → 内部 tile id（与 WorldEvolution.SID 同构，模块私有故测试内重建） */
const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (typeof sh === 'number' && !SID.has(sh)) SID.set(sh, id);
}

// ---------------------------------------------------------------------------
// 通用 stub（enemy-ai-families / book-mimic 同款）
// ---------------------------------------------------------------------------
function stubGame(world: World, playerTile = { x: 120, y: 60 }, out?: Enemy[]): GameHooks {
  return {
    world,
    player: {
      cx: playerTile.x * TILE, cy: playerTile.y * TILE,
      x: playerTile.x * TILE - 8, y: playerTile.y * TILE - 14,
      w: 16, h: 28, vx: 0, vy: 0, hp: 100, maxHp: 100, dead: false,
    },
    scene: null,
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    damagePlayer: (): number => 0, spawnParticles: () => {}, addDamageNumber: () => {},
    enemies: () => [], critters: () => [], npcs: () => [],
    entities: { nextId: 1, add: (e: unknown) => { out?.push(e as Enemy); } },
  } as never;
}

// ---------------------------------------------------------------------------
// ① 血月钓鱼：Bobber 敌怪掷 + 621 建链
// ---------------------------------------------------------------------------
function bloodMoonHooks(opts: { bloodMoon?: boolean; day?: boolean; hardMode?: boolean; lava?: boolean } = {}) {
  const world = new World(200, 120, 7, 'bloodmoon-fish');
  world.groundLevel = 16;
  world.rockLevel = 32;
  world.flags.hardMode = opts.hardMode ?? true;
  world.flags.unlockedSlimeRedSpawn = true;      // 默认排除 682（单独测）
  world.clock.bloodMoon = opts.bloodMoon ?? true;
  world.clock.timeOfDay = opts.day ? 0.5 : 0.9;  // 0.9 = 夜（DUSK 0.8125 之后）
  const player = new Player(70 * TILE, 80 * TILE, new Inventory());
  // 池：20 宽 × 6 深（浮标行在顶行——列向下计数 6/列 × 20 = 120 ≥ 75）
  const lt = opts.lava ? 2 : 1;                  // liquidType 2 = 岩浆
  for (let x = 60; x <= 79; x++) {
    for (let y = 90; y <= 95; y++) world.store.setLiquid(x, y, 200, lt);
  }
  const hooks = {
    ...stubGame(world, { x: 70, y: 80 }),
    player,
  } as GameHooks;
  return { hooks, world, player };
}

/** 直接驱动私有 fishingCheck（fixedUpdate 的收线段同入口）——返回本次掷出的敌怪 id */
function rollOnce(hooks: GameHooks, player: Player): number {
  const b = new Bobber(70 * TILE + 4, 90 * TILE + 4, 0, 0, 30, 3, 15, () => player);
  b.poleVid = 2291;                              // 木钓竿（非 4325 血肉竿 → 1/6 档）
  b.baitVid = 2674;                              // 学徒诱饵（非松露虫）
  const fc = (b as unknown as {
    fishingCheck: (p: Player, g: GameHooks, idx: number) => void;
  }).fishingCheck;
  fc.call(b, player, hooks, 0);
  return b.catchEnemy;
}

describe('P3① 血月钓鱼敌怪掷（FishingCheck_RollEnemySpawns cs:19398-19429）', () => {
  it('困难血月夜：池 ⊆ {586,587,620,621} + 618（1/10 覆写）全出现', () => {
    const { hooks, player } = bloodMoonHooks();
    const seen = new Set<number>();
    for (let i = 0; i < 4000; i++) {
      const e = rollOnce(hooks, player);
      if (e > 0) seen.add(e);
    }
    for (const id of [586, 587, 620, 621, 618]) {
      expect(seen.has(id), `id ${id} 未出现`).toBe(true);
    }
    // 池外敌怪恒不出现（682 已 unlock 排除；无其它 id 混入）
    expect([...seen].every((id) => [586, 587, 620, 621, 618].includes(id))).toBe(true);
  });

  it('非困难血月夜：池 = {586,587} 双出现、无困难档混入', () => {
    const { hooks, player } = bloodMoonHooks({ hardMode: false });
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const e = rollOnce(hooks, player);
      if (e > 0) seen.add(e);
    }
    expect(seen.has(586)).toBe(true);
    expect(seen.has(587)).toBe(true);
    expect([...seen].every((id) => id === 586 || id === 587)).toBe(true);
  });

  it('682 红城镇史莱姆：未解锁时入池（1/5 优先档）、解锁后绝迹', () => {
    const { hooks, world, player } = bloodMoonHooks();
    world.flags.unlockedSlimeRedSpawn = false;
    let saw682 = false;
    for (let i = 0; i < 2000 && !saw682; i++) if (rollOnce(hooks, player) === 682) saw682 = true;
    expect(saw682).toBe(true);
    world.flags.unlockedSlimeRedSpawn = true;
    for (let i = 0; i < 2000; i++) expect(rollOnce(hooks, player) === 682).toBe(false);
  });

  it('门族：白天 / 非血月 / 岩浆池 → 恒不掷敌怪', () => {
    const day = bloodMoonHooks({ day: true });
    for (let i = 0; i < 400; i++) expect(rollOnce(day.hooks, day.player)).toBe(0);
    const noMoon = bloodMoonHooks({ bloodMoon: false });
    for (let i = 0; i < 400; i++) expect(rollOnce(noMoon.hooks, noMoon.player)).toBe(0);
    const lava = bloodMoonHooks({ lava: true });
    for (let i = 0; i < 400; i++) expect(rollOnce(lava.hooks, lava.player)).toBe(0);
  });
});

describe('P3① 血鳗鱼 621 生成链（NPC.cs:51672-51690）', () => {
  it('头首帧建链：15×622 身 + 1×623 尾，wormFollow 链接 + realLifeHost 共享头', () => {
    const world = new World(160, 120, 7, 'eel-chain');
    const spawned: Enemy[] = [];
    const hooks = stubGame(world, { x: 90, y: 50 }, spawned);
    const head = Enemy.fromVanilla(621, 60 * TILE, 50 * TILE)!;
    expect(head).not.toBeNull();
    head.fixedUpdate(1 / 60, hooks);
    expect(spawned.length).toBe(16);                          // 15 身 + 1 尾
    expect(spawned.filter((s) => s.vanillaId === 622).length).toBe(15);
    expect(spawned.filter((s) => s.vanillaId === 623).length).toBe(1);
    expect(spawned[15].vanillaId).toBe(623);                  // 末段 = 尾
    expect(head.wormNext).toBe(spawned[0]);                   // 链头衔接
    expect(spawned[0].wormFollow).toBe(head);
    for (let i = 1; i < 16; i++) expect(spawned[i].wormFollow).toBe(spawned[i - 1]);
    for (const s of spawned) expect(s.realLifeHost).toBe(head);   // 共享 6000 血池
  });

  it('血月池其余四怪可构造（AI 已落位：586/587 走 charger 域、618 血鹦鹉螺、620 地精鲨）', () => {
    for (const id of [586, 587, 618, 620]) {
      const e = Enemy.fromVanilla(id, 60 * TILE, 50 * TILE);
      expect(e, `NPC ${id} fromVanilla 失败`).not.toBeNull();
      expect(e!.vanillaId).toBe(id);
    }
  });
});

// ---------------------------------------------------------------------------
// ② 蠕虫链距覆写表（NPC.cs:52279-52303）
// ---------------------------------------------------------------------------
describe('P3② 蠕虫链距覆写表（num64, cs:52279-52303）', () => {
  const cases: Array<[head: number, seg: number, expectDist: number, label: string]> = [
    [87, 88, 42, '飞龙 87-92 → 42（:52280-52283，非 width 32）'],
    [454, 455, 36, '幻影龙 454-459 → 36（:52284-52287，非 width 32）'],
    [513, 514, 16, '墓穴爬虫 513-515 → w−6=16（:52288-52291，非 width 22）'],
    [7, 8, 22, '吞噬者默认档 → 段自身 width 22（:52279）'],
  ];
  it.each(cases)('头 %i + 段 %i：%s', (hid, sid, exp) => {
    const world = new World(160, 120, 7, 'worm-gap');
    const hooks = stubGame(world, { x: 120, y: 60 });
    const head = Enemy.fromVanilla(hid, 60 * TILE, 50 * TILE)!;
    const [seg] = Enemy.spawnWormChain(head, 1, [sid]);
    seg.x = head.x + 100;                                      // 初始间距 100px
    seg.y = head.y;
    head.fixedUpdate(1 / 60, hooks);
    const d = Math.hypot(seg.cx - head.cx, seg.cy - head.cy);
    expect(d).toBeCloseTo(exp, 4);
  });

  it('血鳗鱼 621-623 → 恒 24（:52296-52299，非 width 28）——自动建链段', () => {
    const world = new World(160, 120, 7, 'eel-gap');
    const hooks = stubGame(world, { x: 120, y: 60 });
    const head = Enemy.fromVanilla(621, 60 * TILE, 50 * TILE)!;
    head.fixedUpdate(1 / 60, hooks);                           // 首帧自动建链
    const seg = head.wormNext!;
    seg.x = head.x + 100;
    seg.y = head.y;
    head.fixedUpdate(1 / 60, hooks);
    const d = Math.hypot(seg.cx - head.cx, seg.cy - head.cy);
    expect(d).toBeCloseTo(24, 4);
  });
});

// ---------------------------------------------------------------------------
// ③ PickAmmo 尾链 >0 门（Player.cs:52656-52659）
// ---------------------------------------------------------------------------
describe('P3③ resolveAmmoProjId 尾链 >0 门（cs:52656-52659）', () => {
  it('弹药 shoot>0 → 替换（常规替换语义不变）', () => {
    expect(resolveAmmoProjId(1, 51, 40, 1, 51)).toBe(51);       // 木弓+木箭
    expect(resolveAmmoProjId(98, 145, 97, 10, 88)).toBe(88);    // 迷你鲨+子弹
  });
  it('弹药 shoot 显式 0 → 保留发射器 shoot（原版两段门）', () => {
    expect(resolveAmmoProjId(98, 145, 97, 10, 0)).toBe(10);     // 曾返回 0 = 隐形弹
  });
  it('弹药缺 shoot 数据 → 保留发射器 shoot', () => {
    expect(resolveAmmoProjId(98, 145, 97, 10, undefined)).toBe(10);
  });
  it('发射器 shoot 也为 0/缺 → 兜 1（原版此态 projToShoot=0 不发射；本仓无 0 哨兵档）', () => {
    expect(resolveAmmoProjId(98, 145, 97, 0, 0)).toBe(1);
    expect(resolveAmmoProjId(98, 145, 97, undefined, undefined)).toBe(1);
  });
  it('绿溶液/火箭一型行为不变（加法支先于尾链拦截）', () => {
    expect(resolveAmmoProjId(779, 780, 780, 145, 0)).toBe(145);   // 绿溶液 → 纯净
    expect(resolveAmmoProjId(3546, 771, 771, 134, 0)).toBe(134);  // 火箭一型 → 基弹
    expect(resolveAmmoProjId(3546, 772, 771, 134, 3)).toBe(137);  // 火箭二型 +3
  });
});

// ---------------------------------------------------------------------------
// ④ Convert InWorld(·,1) 1 格世界边框（WorldGen.cs:9635-9643）
// ---------------------------------------------------------------------------
function evoHost(w = 24, h = 24) {
  const world = new World(w, h, 7, 'convert-border');
  const host: EvolutionHost = {
    store: world.store, worldSurface: 12, rockLevel: 18,
    flags: world.flags, crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    dungeonX: 0, difficulty: 0,
  };
  return { world, st: world.store, evo: new WorldEvolution(host) };
}

describe('P3④ Convert InWorld(·,1) 1 格世界边框', () => {
  it('convertArea（尺寸重载 cs:55108）：边缘 1 圈不转、1 列内照转', () => {
    const { st, evo } = evoHost();
    const grass = SID.get(23)!;                     // 腐化草
    st.setTileSilent(0, 12, grass);                 // 世界最左列（边框外）
    st.setTileSilent(1, 12, grass);                 // 边框内首列
    st.setTileSilent(2, 12, grass);                 // 中心（菱形门内）
    evo.convertArea(2, 12, 11, 4);                  // 窗 ±4 覆盖 x∈[-2,6]
    const sheetAt = (x: number, y: number) =>
      TILE_DEFS[st.type[st.idx(x, y)]]?.vanilla?.sheet;
    expect(sheetAt(2, 12)).toBe(2);                 // 中心 → 草
    expect(sheetAt(1, 12)).toBe(2);                 // 边框内首列照转
    expect(sheetAt(0, 12)).toBe(23);                // ★边框列原样（曾误转）
  });

  it('convert（逐格重载 cs:55117）：坐标落在边框圈 → 静默无操作', () => {
    const { st, evo } = evoHost(24, 24);
    const grass = SID.get(23)!;
    for (const [x, y] of [[0, 12], [23, 12], [12, 0], [12, 23]] as const) {
      st.setTileSilent(x, y, grass);
      evo.convert(x, y, 11);
      expect(TILE_DEFS[st.type[st.idx(x, y)]]?.vanilla?.sheet).toBe(23);
    }
    st.setTileSilent(12, 1, grass);                 // 边框内首行照转
    evo.convert(12, 1, 11);
    expect(TILE_DEFS[st.type[st.idx(12, 1)]]?.vanilla?.sheet).toBe(2);
  });
});
