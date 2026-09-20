// ★BJ94 渲染性能域三债守卫（2026-09-16）
//
// D1 渲染循环 4 个 URLSearchParams 构造点（drawChunkGrid×2 / drawAnimatedTileLayer×1 /
//   drawDummyTileAnim×1，实测 4.00 次/帧——scripts/_bj94-set-census.mjs 构造器计数子类法）
//   → perfFlags.searchHasParam 缓存读取面（waveAmpParam 同款惯例：search 串键控+惰性
//   填充槽）；flag 关 = 调用点原地逐调用解析（现行行为逐位不变）。
// D2 ~12/帧 Set 背景（同普查仪具定位）：①内容恒定只读表提升（Game.fixedUpdate 三表
//   挂 swPerf 双支 / TileCollision NPC_STEPUP_IGNORE 纯常量外提）②局部不逃逸去重集
//   复用槽（TileShine ×2 挂 swPerf 双支）。不可消除者登记：trySpawnEnemy activeIds
//   （VanillaSpawner:477 跨拍持有引用）、clearSmartInteractTileFrame selected（公有
//   帧态字段替换语义）、LeashedCritter next（填充期读旧集=需双缓冲）、变率小站 4 处。
// D3 玩家波注入湿位对齐（BJ89 移交）：注入章基面 inWater（去岩浆窄化位）→
//   wetSticky ∪ inWater——原版注入章 WaterShaderData.cs:251 `if (player.wet)` 粘滞位
//   （NPC 同构 :215）；OR 恒等式（全链玩家 inWater=true ⟹ wetSticky=true）+
//   联机代理豁免（stepRemoteProxy 只喂 inWater）。
// 逐像素权威证据由实机 scripts/_bj94-pixel-ab.mjs（冻结单帧 md5 对拍，land/water
//   双场景）兜底；分配面权威证据由实机 _bj94-set-census.mjs（修复前 4.00 USP+~11.3
//   Set/帧 → 修复后 0+~4.7）兜底。
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';
import { swPerf, swPerfSetForTest, searchHasParam, searchHasResetForTest } from '../src/render/perfFlags';
import {
  BJ94_SCOPE_ACC, BJ94_AMMO_SCOPE, BJ94_WATER_TORCH_ITEMS,
} from '../src/core/Game';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { NPC_STEPUP_IGNORE } from '../src/physics/TileCollision';
import { planShineWork } from '../src/render/TileShine';

const src = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

// ---------- 仪具：构造计数（bj78 同款；分配面直接物证） ----------
function countConstruct(name: 'Set' | 'URLSearchParams', body: () => void): number {
  const g = globalThis as unknown as Record<string, unknown>;
  const Base = g[name] as unknown as new (...a: unknown[]) => object;
  let n = 0;
  const Counter = class extends Base { constructor(...a: unknown[]) { super(...a); n++; } };
  g[name] = Counter;
  try { body(); } finally { g[name] = Base; }
  return n;
}

const after: Array<() => void> = [];
afterAll(() => {
  swPerfSetForTest(true);           // 归还缺省（转正后缺省开）
  delete (globalThis as { location?: unknown }).location;
  for (const f of after) f();
});

// =====================================================================
// D1：searchHasParam 缓存读取面
// =====================================================================
describe('★BJ94 D1 searchHasParam（渲染循环 has 缓存读取面）', () => {
  const g = globalThis as unknown as { location?: { search: string } };

  it('值语义=逐调用 new URLSearchParams(q).has(name) 逐位同值（含缺失/空串/多参）', () => {
    const cases: Array<[string, string, boolean]> = [
      ['?gutterdbg', 'gutterdbg', true],
      ['?dynsnap0', 'dynsnap0', true],
      ['?a=1&dynsnap0&b=2', 'dynsnap0', true],
      ['?dynsnap0=0', 'dynsnap0', true],          // has 只认存在性,不看值
      ['?other=9', 'gutterdbg', false],
      ['', 'gutterdbg', false],
      ['?a=1', 'dynsnap0', false],
    ];
    for (const [search, name, want] of cases) {
      searchHasResetForTest();
      g.location = { search };
      expect(searchHasParam(name)).toBe(want);
      // 复读（缓存命中路径）同值
      expect(searchHasParam(name)).toBe(want);
    }
  });

  it('缓存：同 search 同名只构造 1 次 URLSearchParams；search 变化自动失效；异名各冷启 1 次', () => {
    g.location = { search: '?gutterdbg' };
    searchHasResetForTest();
    const cold = countConstruct('URLSearchParams', () => searchHasParam('gutterdbg'));
    const warm = countConstruct('URLSearchParams', () => {
      searchHasParam('gutterdbg'); searchHasParam('gutterdbg');
    });
    expect(cold).toBe(1);
    expect(warm).toBe(0);
    const other = countConstruct('URLSearchParams', () => searchHasParam('dynsnap0'));
    expect(other).toBe(1);                          // 异名惰性填充各一次
    g.location = { search: '?dynsnap0=1' };
    const rekey = countConstruct('URLSearchParams', () => searchHasParam('dynsnap0'));
    expect(rekey).toBe(1);                          // search 键控重解析(防御性失效)
  });

  it('结构锁：三构造点挂 swPerf 双支,关臂保留原表达式逐字;关臂在位=豁免口逐位回退', () => {
    const r = src('../src/render/Renderer.ts');
    // drawChunkGrid（×2 调用的唯一闭包体——1 处双支）
    expect(r).toContain("swPerf ? searchHasParam('gutterdbg')");
    expect(r).toContain("new URLSearchParams(location.search).has('gutterdbg')");
    // drawAnimatedTileLayer + drawDummyTileAnim（2 处双支）
    expect(r.split("swPerf ? !searchHasParam('dynsnap0')").length - 1).toBe(2);
    expect(r.split("!new URLSearchParams(location.search).has('dynsnap0')").length - 1).toBe(2);
    // perfFlags 读取面本体在位
    const pf = src('../src/render/perfFlags.ts');
    expect(pf).toContain('export function searchHasParam');
    expect(pf).toContain('_spHasCache.clear()');    // search 键控失效臂
  });
});

// =====================================================================
// D2：Set 分配普查消减（可消除的消分配）
// =====================================================================
describe('★BJ94 D2 Set 分配消减', () => {
  it('内容恒定三表+NPC_STEPUP_IGNORE：字面量逐位锁定（防内容漂移）', () => {
    expect([...BJ94_SCOPE_ACC].sort((a, b) => a - b)).toEqual([1300, 1858, 4005]);
    expect([...BJ94_AMMO_SCOPE].sort((a, b) => a - b)).toEqual([23, 97, 780, 1783, 1836]);
    expect([...BJ94_WATER_TORCH_ITEMS].sort((a, b) => a - b)).toEqual([523, 1333, 4384]);
    expect([...NPC_STEPUP_IGNORE].sort((a, b) => a - b)).toEqual([14, 16, 18, 134, 469]);
  });

  it('结构锁：Game.ts 三表挂 swPerf 双支（关臂逐字保留原地 new）;TileCollision 纯外提', () => {
    const g = src('../src/core/Game.ts');
    expect(g).toContain('const SCOPE_ACC = swPerf ? BJ94_SCOPE_ACC : new Set([1300, 1858, 4005]);');
    expect(g).toContain('const AMMO_SCOPE = swPerf ? BJ94_AMMO_SCOPE : new Set([97, 1783, 1836, 23, 780]);');
    expect(g).toContain('const WATER_TORCH_ITEMS = swPerf ? BJ94_WATER_TORCH_ITEMS : new Set([523, 1333, 4384]);');
    const tc = src('../src/physics/TileCollision.ts');
    // 模块级唯一构造点；函数体内旧构造已移除（applyStepUp 每调 new 不复存在）。
    // ★BJ221（2026-09-20）升级为 data/tiles.ts 单源转出口别名：模块级单例意图不变,
    //   字面 new 从本文件消失（值面由 tile-domain-sentinel §6k IGNORED_BY_NPC_STEP_UP 金标钉死）
    expect(tc.split('new Set([14, 469, 18, 16, 134])').length - 1).toBe(0);
    expect(tc).toContain('export const NPC_STEPUP_IGNORE = IGNORED_BY_NPC_STEP_UP_SHEETS;');
  });

  it('TileShine planShineWork：flag 关=每次 1 次 Set 构造（现行行为）;flag 开热路径零构造;输出 off/on 逐位一致', () => {
    const pairOf = (n: number) => ({ __test: 'pair', n }) as unknown as import('../src/render/ChunkCache').ChunkPair;
    const CX = 256;
    const fresh = [
      { cx: 0, cy: 2, pair: pairOf(0) },
      { cx: 3, cy: 2, pair: pairOf(3) },
      { cx: 2, cy: 2, pair: pairOf(2) },
      { cx: 2, cy: 2, pair: pairOf(2) },           // 同 pair 去重面
    ];
    const pending = [{ cx: 9, cy: 9, pair: pairOf(99) }];
    const run = () => planShineWork(pending, fresh, 2.5 * CX, 2.5 * CX, CX);

    swPerfSetForTest(false);
    const offOut = run();
    const cOff = countConstruct('Set', run);
    expect(cOff).toBeGreaterThanOrEqual(1);         // 现行行为:每调 1 次构造

    swPerfSetForTest(true);
    const onWarm = countConstruct('Set', run);      // 槽冷启后热路径
    expect(onWarm).toBe(0);
    const onOut = run();
    expect(onOut.map((o) => o.pair)).toEqual(offOut.map((o) => o.pair));
    expect(onOut.map((o) => [o.cx, o.cy])).toEqual(offOut.map((o) => [o.cx, o.cy]));
    swPerfSetForTest(false);
  });
});

// =====================================================================
// D3：玩家波注入湿位（wetSticky ∪ inWater；原版注入章 :251 `if (player.wet)` 粘滞位）
// =====================================================================
const W = 80, H = 200, PW = 20, PH = 42;

/** 液池世界（探针必湿）：x 20-59、y 60-119 灌液、row 120 池底;右侧干台 */
function poolWorld(type: number): World {
  const w = new World(W, H, 11, `bj94-pool-${type}`);
  const st = w.store;
  for (let x = 20; x < 60; x++) {
    st.setTile(x, 120, 1);
    for (let y = 60; y < 120; y++) st.setLiquid(x, y, 255, type);
  }
  for (let x = 62; x < 76; x++) for (let y = 100; y < 120; y++) st.setTile(x, y, 1);
  return w;
}

function makeDriver(world: World, px: number, py: number) {
  const p = new Player(px, py, new Inventory());
  p.hp = 40000;                                     // 岩浆灼烧不改断言面
  const hooks = {
    world, player: p, enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    playSfxWav: () => {}, spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
  } as unknown as GameHooks;
  return { p, hooks };
}

describe('★BJ94 D3 玩家波注入湿位 = vanilla player.wet（WaterShaderData.cs:251 粘滞位）', () => {
  it('岩浆居中探针：wetSticky=true（原版 :251 注入章应画）而 inWater=false（窄化位）——OR 式补齐此分歧', () => {
    const { p, hooks } = makeDriver(poolWorld(2), 40 * TILE, 70 * TILE);
    p.fixedUpdate(1 / 60, hooks);
    expect(p.wetSticky).toBe(true);                 // num86 任意液体（Player.ts:4076 ≙ :28060）
    expect(p.inWater).toBe(false);                  // 去岩浆窄化位（Player.ts:4012）
    expect(p.wetSticky || p.inWater).toBe(true);    // 注入基面=原版 wet —— 旧值 p.inWater 在此整缺
  });

  it('水/干两态：OR 式 ≡ wetSticky（全链玩家恒等式 inWater=true ⟹ wetSticky=true 的两翼）', () => {
    const water = makeDriver(poolWorld(1), 40 * TILE, 70 * TILE);
    water.p.fixedUpdate(1 / 60, water.hooks);
    expect(water.p.wetSticky).toBe(true);
    expect(water.p.inWater).toBe(true);
    expect(water.p.wetSticky || water.p.inWater).toBe(true);

    const dry = makeDriver(poolWorld(1), 68 * TILE, 98 * TILE);   // 干台上
    dry.p.fixedUpdate(1 / 60, dry.hooks);
    expect(dry.p.wetSticky).toBe(false);
    expect(dry.p.inWater).toBe(false);
    expect(dry.p.wetSticky || dry.p.inWater).toBe(false);
  });

  it('联机代理豁免：wetSticky=false（不走液体链）+ inWater=true（足部粗判）→ OR 式保持现行为', () => {
    // 代理真值表（stepRemoteProxy 只写 inWater——wetSticky 恒假;OR 臂=其旧值逐位）
    const proxy = { wetSticky: false, inWater: true };
    expect(proxy.wetSticky || proxy.inWater).toBe(true);
    expect(proxy.inWater).toBe(true);               // 旧值本身
  });

  it('结构锁：Renderer 两处 pushPlayer 注入基面均为 p.wetSticky || p.inWater;旧窄化位绝迹', () => {
    const r = src('../src/render/Renderer.ts');
    expect(r.split('wet: p.wetSticky || p.inWater,').length - 1).toBe(2);   // _waveCtxPushPlayer + 关臂闭包
    expect(r).not.toContain('wet: p.inWater,');     // 旧窄化基面零残留
    expect(r).toContain('WaterShaderData.cs:251');  // 原版注入章锚在位
  });
});

// =====================================================================
// ★BJ98 AMMO_SCOPE 口径勘误守卫（2026-09-16；RB22b CONFIRMED vanilla 偏差清偿）
// =====================================================================
describe('★BJ98 AMMO_SCOPE=原版 Player.cs:15004 五支析取（Gel 进 Dart 出）', () => {
  it('值表逐 id 定谳：1457:15004（1458:15003）五支 = 97 子弹/1783 糖玉米/1836 木桩/23 凝胶/780 溶液', () => {
    expect([...BJ94_AMMO_SCOPE].sort((a, b) => a - b)).toEqual([23, 97, 780, 1783, 1836]);
    for (const ammo of [23, 97, 780, 1783, 1836]) expect(BJ94_AMMO_SCOPE.has(ammo)).toBe(true);
    // 283=Dart（AmmoID.cs:126）非原版析取支——2bc3f288 曾误配（:14356-60 实为
    // monolith shader switch）；23=Gel（AmmoID.cs:114）为原版第 4 支
    expect(BJ94_AMMO_SCOPE.has(283)).toBe(false);
  });

  it('变异哨兵：scoped 谓词随集合翻转（镜佩 1300/1858/4005 外层门 + useAmmo 内层门）', () => {
    const scoped = (useAmmo: number, hasScopeAcc = true): boolean =>
      hasScopeAcc && BJ94_AMMO_SCOPE.has(useAmmo);
    // 506 火焰喷射器/1910 精灵熔枪 useAmmo=23 → pan 0.5（本仓曾漏 pan）
    expect(itemCombat(506)?.useAmmo).toBe(23);
    expect(itemCombat(1910)?.useAmmo).toBe(23);
    expect(scoped(itemCombat(506)?.useAmmo ?? -1)).toBe(true);
    // 飞镖四武器（281 吹管/986 吹枪/3007 飞镖手枪/3008 飞镖步枪）useAmmo=283 → 不 pan（本仓曾误 pan）
    for (const vid of [281, 986, 3007, 3008]) {
      expect(itemCombat(vid)?.useAmmo).toBe(283);
      expect(scoped(itemCombat(vid)?.useAmmo ?? -1)).toBe(false);
    }
    // 原版五支恒 pan；无镜（外层门 :15002）恒不 pan
    for (const ammo of [23, 97, 780, 1783, 1836]) expect(scoped(ammo)).toBe(true);
    expect(scoped(23, false)).toBe(false);
    // 消费点锁：关 swPerf 臂字面量与模块级单例同值；旧值/错引零残留
    const g = src('../src/core/Game.ts');
    expect(g).toContain('const AMMO_SCOPE = swPerf ? BJ94_AMMO_SCOPE : new Set([97, 1783, 1836, 23, 780]);');
    expect(g).not.toContain('new Set([97, 1783, 1836, 283, 780])');
    // ★BJ98 债①重锚（2026-09-16）：注释锚由 15002-15008 精化为 15002-15007
    // （scope=true 佩戴判定域,Player.cs:15008 起是死码 `if (0 == 1)` 块,不入引）
    expect(g).toContain('Player.cs:15002-15007');
    expect(g).not.toContain('14356-14360');
  });
});
