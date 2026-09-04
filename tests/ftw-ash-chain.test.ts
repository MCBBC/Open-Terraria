// FTW 灰烬连锁 + 灰烬崩塌弹 40 回归（幽灵格战役 KillTile 尾批清偿,2026-09-04）。
// 原版锚：WorldGen.cs:64251-64301（FTW 门 ×netMode!=1 ×type==57 → 8 邻扫描,W,E,N,S,
// NW,NE,SW,SE 顺序;条件式 tile2.active() && genRand.Next(2)==0 && type==57 &&
// !SolidTile(下方) → KillTile(邻,noItem:true) + NewProjectile(邻中心,vy=0.41,弹 40,
// 伤 15,kb 0)）；Projectile.cs:1229-1237（SetDefaults 10×10/aiStyle10/friendly+hostile/
// penetrate -1）+ :58854-59083（AI_010 type 40：尘 36×0.4/首拍免碰撞/重力 0.41/封顶 10）
// + :77878-77886（Kill 音尘 dig+5×尘 36）+ :79107-79311（铺设段 num17=57/num18=0）。
// 连锁侧 shell 形制同 tests/killtile-tail-liquid.test.ts；弹侧实体直驱（a-batch2 同款）。
// 掷签钉死（vi.spyOn(Math,'random')）区分「1/2 掷支」命中与未中。
import { describe, it, expect, vi, afterEach } from 'vitest';
// ★环入边钉死（2026-09-04）：SpriteAtlas:1 `import { swTrace }` ↔ AssetCache:21
// `import { VANILLA_MISC }` 成环,且 AssetCache 模块初始化尾 `let plan =
// priorityPlan()` 会读 VANILLA_MISC——SpriteAtlas 先入评估时该 const 尚未初始化
// = "VANILLA_MISC is not iterable"（全 suite 波及,在途批次）。本文件先入
// AssetCache 侧钉死评估序:AssetCache 先行 → SpriteAtlas 完整评估完 → 读表安全。
// 根因修在 SpriteAtlas/AssetCache 侧（并行会话在途批）,本行届时可删。
import '../src/net/AssetCache';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { AshBallProj } from '../src/entities/AshBallProj';   // 先于 Game（SpriteAtlas/AssetCache 循环对 import 序敏感,ammo-remainder 同序）
import { Game, ASH_CHAIN_RECURSION_GUARD } from '../src/core/Game';
import { TILE_BY_KEY, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import type { GameHooks } from '../src/entities/types';

const ASH = TILE_BY_KEY['ash'];                     // sheet 57
const STONE = TILE_INTERNAL_BY_SHEET.get(1)!;       // sheet 1
const TORCH = TILE_INTERNAL_BY_SHEET.get(4)!;       // sheet 4（active 非实心占位格）
const ASH_ID = TILE_INTERNAL_BY_SHEET.get(57)!;
const ASH_ITEM_KEY = VANILLA_ITEM_KEY_BY_ID[172];   // KillTile case 57 → 172 AshBlock

function mkWorld(seedFlags: Record<string, boolean> = {}): World {
  const w = new World(40, 260, 11, 'ashchain');
  w.seedFlags = seedFlags;
  return w;
}

/** breakTile 可驱动面最小桩（shell 形制同 killtile-tail-liquid.test.ts,另补
 *  entities.add 捕获——灰烬连锁的伴生弹出射口） */
function shell(w: World, drops: Array<[string, number]>, projs: unknown[]): Game & Record<string, unknown> {
  const g = Object.create(Game.prototype) as unknown as Game & Record<string, unknown> & {
    breakTile(x: number, y: number): void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} } as never;
  g.sfx = { play: () => {}, playWavFile: () => {}, playFiles: () => true } as never;
  g.entities = { add: (e: unknown) => { projs.push(e); }, projectiles: [] } as never;
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = (_x: number, _y: number, key: string, n: number) => { drops.push([key, n]); return null; };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} } as never;
  g.player = { cx: 10 * 16 + 8, cy: 19 * 16 + 8, equipStats: {} } as never;
  return g;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('FTW 灰烬连锁（WorldGen.cs:64251-64301）', () => {
  it('FTW+掷中：挖灰烬 → 西邻灰烬连锁崩塌（noItem 不掉 172）+ 弹 40 于邻格中心生成', () => {
    const w = mkWorld({ getGoodWorld: true });
    const st = w.store;
    st.setTileSilent(10, 10, ASH);       // 被挖中心
    st.setTileSilent(9, 10, ASH);        // W 邻（下方悬空）
    st.setTileSilent(10, 11, STONE);     // 中心下方承重——挡 W 链对中心的重入毁灭
    const drops: Array<[string, number]> = [];
    const projs: unknown[] = [];
    vi.spyOn(Math, 'random').mockReturnValue(0);   // Next(2)==0 恒中
    shell(w, drops, projs).breakTile(10, 10);
    expect(st.hasTile(9, 10)).toBe(false);         // W 邻连锁崩塌
    expect(st.hasTile(10, 10)).toBe(false);        // 中心照常破坏
    expect(projs.length).toBe(1);                  // 仅 W 邻一枚（中心=被挖格不弹）
    const p = projs[0] as AshBallProj;
    expect(p).toBeInstanceOf(AshBallProj);
    expect(p.projId).toBe(40);                     // AshBallFalling
    expect(p.dmg).toBe(15);                        // :64298 damage 15
    expect(p.w).toBe(10); expect(p.h).toBe(10);    // SetDefaults :1231-1232
    expect(p.x).toBe(9 * 16 + 8 - 5);              // NewProjectile 中心锚 −w/2
    expect(p.y).toBe(10 * 16 + 8 - 5);
    expect(p.vx).toBe(0); expect(p.vy).toBe(0.41); // :64298 SpeedY=0.41
    // noItem:连锁毁的 W 不掉 172;中心（直接挖,noItem=false）掉一枚
    expect(drops).toEqual([[ASH_ITEM_KEY, 1]]);
  });

  it('连锁序 W 先于 NW（:64257 case0 先毁左邻 → case4 的 !SolidTile(左邻) 即真）', () => {
    const w = mkWorld({ getGoodWorld: true });
    const st = w.store;
    st.setTileSilent(10, 10, ASH);
    st.setTileSilent(9, 10, ASH);        // W（先毁）
    st.setTileSilent(9, 9, ASH);         // NW（下方=（9,10）,靠 W 先毁才放行）
    st.setTileSilent(10, 11, STONE);
    const projs: unknown[] = [];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    shell(w, [], projs).breakTile(10, 10);
    expect(st.hasTile(9, 10)).toBe(false);
    expect(st.hasTile(9, 9)).toBe(false);          // NW 靠「W 先毁」才连锁——序位即机制
    expect(projs.length).toBe(2);                  // W + NW 各一枚（序反则 NW 被 (9,10) 承重挡=1 枚）
    for (const [cx, cy] of [[9, 10], [9, 9]]) {
      const p = (projs as AshBallProj[]).find((q) => q.x + 5 === cx * 16 + 8 && q.y + 5 === cy * 16 + 8);
      expect(p, `弹心=(${cx},${cy})格中心`).toBeDefined();
      expect(p!.vy).toBe(0.41);
      expect(p!.dmg).toBe(15);
    }
  });

  it('承重门：邻灰烬下方实心 → 掷中也不崩不弹（!SolidTile(nx,ny+1) :64293）', () => {
    const w = mkWorld({ getGoodWorld: true });
    const st = w.store;
    st.setTileSilent(10, 10, ASH);
    st.setTileSilent(11, 10, ASH);       // E 邻
    st.setTileSilent(11, 11, STONE);     // E 下方承重
    st.setTileSilent(10, 11, STONE);     // 中心下方承重（挡重入）
    const projs: unknown[] = [];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    shell(w, [], projs).breakTile(10, 10);
    expect(st.hasTile(11, 10)).toBe(true);         // 承重灰烬不崩
    expect(st.type[st.idx(11, 10)]).toBe(ASH);
    expect(projs.length).toBe(0);
  });

  it('非 FTW 不连锁（Main.getGoodWorld 门 :64251）——布局同 Test1,掷中也不崩', () => {
    const w = mkWorld({});                          // 无 getGoodWorld
    const st = w.store;
    st.setTileSilent(10, 10, ASH);
    st.setTileSilent(9, 10, ASH);
    st.setTileSilent(10, 11, STONE);
    const projs: unknown[] = [];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    shell(w, [], projs).breakTile(10, 10);
    expect(st.hasTile(10, 10)).toBe(false);        // 中心照常破坏
    expect(st.hasTile(9, 10)).toBe(true);          // 邻灰烬原样
    expect(projs.length).toBe(0);
  });

  it('掷未中（Next(2)==1）不连锁不弹——FTW 门齐但概率支未中', () => {
    const w = mkWorld({ getGoodWorld: true });
    const st = w.store;
    st.setTileSilent(10, 10, ASH);
    st.setTileSilent(9, 10, ASH);
    st.setTileSilent(10, 11, STONE);
    const projs: unknown[] = [];
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    shell(w, [], projs).breakTile(10, 10);
    expect(st.hasTile(9, 10)).toBe(true);
    expect(projs.length).toBe(0);
  });

  // ★A-3 护栏（2026-09-04）：原版 :64251-64301 纯递归无深度语义;护栏上限=原版不可达
  //  大数（单链 1 万格悬空灰烬不存在）,仅防 V8 栈深先于 CLR 爆 RangeError。
  //  行为面由上面两例锁死（护栏<10000 时计数远离上限=零扰动）;>10000 深的行为学
  //  fixture 在语义上不可构造（灰烬连锁的 W/E 重入是原版固有语义,确定性深链
  //  fixture 必然引入非原版限流）,故护栏本体只钉常量值。
  it('A-3:重入护栏常量=10000（原版不可达,仅防 JS 栈差异不改语义）', () => {
    expect(ASH_CHAIN_RECURSION_GUARD).toBe(10000);
  });

  it('A-3:护栏在位时正常连锁行为零扰动（W+NW 两级深链,计数远离上限）', () => {
    const w = mkWorld({ getGoodWorld: true });
    const st = w.store;
    st.setTileSilent(10, 10, ASH);
    st.setTileSilent(9, 10, ASH);
    st.setTileSilent(9, 9, ASH);
    st.setTileSilent(10, 11, STONE);
    const projs: unknown[] = [];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    shell(w, [], projs).breakTile(10, 10);
    expect(st.hasTile(9, 10)).toBe(false);
    expect(st.hasTile(9, 9)).toBe(false);
    expect(projs.length).toBe(2);                  // 深度 2 << 10000 → 全程放行
  });
});

// ===================== 灰烬崩塌弹 40 实体（AI_010 type 40 通道） =====================

interface DustRec { type: number; x: number; y: number }
function mkEntityHooks(store: TileStore) {
  const sfx: string[] = [];
  const dusts: DustRec[] = [];
  let dropCalls = 0;
  const hooks = {
    world: { store } as never,
    player: { dead: false, iframes: 0, x: 99999, y: 99999, w: 20, h: 42 } as never,
    enemies: () => [],
    playSfx: (name: string) => { sfx.push(name); },
    spawnDust: (x: number, y: number, _w: number, _h: number, type: number) => {
      dusts.push({ type, x, y });
      return null;
    },
    spawnDrop: () => { dropCalls++; return null; },
    damagePlayer: (): number => 0,
    breakTile: () => {},
  } as unknown as GameHooks;
  return { hooks, sfx, dusts, get dropCalls() { return dropCalls; } };
}
const stepUntil = (p: AshBallProj, hooks: GameHooks, max = 400): void => {
  for (let i = 0; i < max && !p.dead; i++) p.fixedUpdate(1 / 60, hooks);
};

describe('灰烬崩塌弹 40（Projectile.cs:1229-1237+58809-59083+79107-79311）', () => {
  it('下落→落地 Kill→补回灰烬格（num17=57）+ dig 音 + ≥5×尘 36（:77878-77886）', () => {
    const store = new TileStore(40, 260);
    for (let x = 0; x < 40; x++) store.setTileSilent(x, 100, STONE);   // 地面
    const { hooks, sfx, dusts, dropCalls } = mkEntityHooks(store);
    const p = new AshBallProj(10 * 16 + 8, 90 * 16 + 8, 0, 0.41, 15);
    const y0 = p.y;
    stepUntil(p, hooks);
    expect(p.dead).toBe(true);
    expect(p.y).toBeGreaterThan(y0);               // 确实下落
    expect(store.type[store.idx(10, 99)]).toBe(ASH_ID);  // 落点补回灰烬（承重行上方一格）
    expect(store.type[store.idx(10, 100)]).toBe(STONE);  // 被占承重行不覆盖（num18=0 无掉落侧）
    expect(sfx).toContain('dig');                  // PlaySound(0)
    expect(dusts.filter((d) => d.type === 36).length).toBeGreaterThanOrEqual(5);
    expect(dropCalls).toBe(0);                     // num18=0：铺设成功支不掉物品
  });

  it('重力 0.41/tick、vy 封顶 10（:58999-59002/:59078-59081）', () => {
    const store = new TileStore(40, 260);          // 全空世界
    const { hooks } = mkEntityHooks(store);
    const p = new AshBallProj(20 * 16 + 8, 20 * 16 + 8, 0, 0.41, 15);
    const vys: number[] = [];
    for (let i = 0; i < 60 && !p.dead; i++) { p.fixedUpdate(1 / 60, hooks); vys.push(p.vy); }
    expect(p.dead).toBe(false);                    // 悬空不落地
    expect(vys[0]).toBeCloseTo(0.82, 5);           // 首拍即吃重力（初速 0.41+0.41）
    expect(vys[1]).toBeCloseTo(1.23, 5);
    expect(Math.max(...vys)).toBe(10);             // 封顶
    expect(vys[vys.length - 1]).toBe(10);
  });

  it('落点被占（active 非实心格=火把）→ 不铺不补不掉（num18=0 两支均无 :79292/:79298）', () => {
    const store = new TileStore(40, 260);
    store.setTileSilent(10, 90, TORCH);            // 占位格（球心将途经）
    for (let x = 0; x < 40; x++) store.setTileSilent(x, 91, STONE);   // 下一行承重
    const { hooks, sfx, dropCalls } = mkEntityHooks(store);
    const p = new AshBallProj(10 * 16 + 8, 88 * 16 + 8, 0, 0.41, 15);
    stepUntil(p, hooks);
    expect(p.dead).toBe(true);
    expect(sfx).toContain('dig');
    expect(store.type[store.idx(10, 90)]).toBe(TORCH);   // 占位格原样（occupied → 不铺）
    expect(store.type[store.idx(10, 91)]).toBe(STONE);
    expect(dropCalls).toBe(0);                           // num18=0 → 无掉落
    // 全列无灰烬补回
    for (let y = 85; y < 95; y++) expect(store.type[store.idx(10, y)]).not.toBe(ASH_ID);
  });

  // ★M13 A-1（2026-09-04）半砖落面：TileCollision 碰撞盒折半（Collision.cs:2350-2354
  //  vector4.Y+=8）→ 钳位中心=面顶+3 ∈半砖格 → 死亡格=半砖格本身（:79120-79121）;
  //  :79243 半砖上推支 velocity.Y 已被 TileCollision 清 0=死支（R2' F2 同谳）→
  //  格 active 走 outer else :79298 → type 40 num18=0 → 不铺不掉=Vanish。
  //  旧行为（F1 锚=上一拍位=半砖上一格）会在半砖上方悬空补一格灰烬。
  it('半砖落面:死亡格=半砖格本身 → occupied → Vanish（不铺不掉,:79243 死支/:79298）', () => {
    const store = new TileStore(40, 260);
    for (let x = 0; x < 40; x++) store.setTileSilent(x, 100, STONE);
    store.half[store.idx(10, 100)] = 1;            // 半砖石面（碰撞面=格顶+8）
    const { hooks, sfx, dropCalls } = mkEntityHooks(store);
    const p = new AshBallProj(10 * 16 + 8, 90 * 16 + 8, 0, 0.41, 15);
    stepUntil(p, hooks);
    expect(p.dead).toBe(true);
    expect(sfx).toContain('dig');                  // Kill 音尘恒有（:77878-77886）
    expect(store.type[store.idx(10, 100)]).toBe(STONE);   // 半砖原样
    expect(store.half[store.idx(10, 100)]).toBe(1);
    expect(dropCalls).toBe(0);                     // num18=0
    for (let y = 90; y <= 99; y++) expect(store.type[store.idx(10, y)]).toBe(0);  // 半砖上方不补灰烬
  });

  // ★M13 A-4（2026-09-04）家具顶落面：tileSolidTop 底行（frameY==0）照接
  //  （Collision.cs:2330-2333 flag 门;40 ∈ FallingBlockDoesNotFallThroughPlatforms
  //  → Projectile.cs:17653-17655 flag6=false=不透平台/家具顶）→ 死亡格=家具上一格
  //  （钳位中心=面顶−5）→ flag2：BBMSF(上一格) 的 arm2 看家具 tileSolid=false——
  //  家具落地（再下一格 nactive）→ arm2 假 → 正常在台上补回灰烬。
  it('家具顶落面:工作台（落地）照接 → 台上一格补回灰烬（isSolid||isPlatform 同族几何）', () => {
    const store = new TileStore(40, 260);
    const BENCH = TILE_INTERNAL_BY_SHEET.get(18)!;          // sheet 18 工作台（tileSolid=false）
    store.setTileSilent(10, 100, BENCH);
    store.setTileSilent(10, 101, STONE);                    // 台下承重（BBMSF arm2 假）
    const { hooks } = mkEntityHooks(store);
    const p = new AshBallProj(10 * 16 + 8, 90 * 16 + 8, 0, 0.41, 15);
    stepUntil(p, hooks);
    expect(p.dead).toBe(true);                     // 被家具顶接住（不再穿台）
    expect(store.type[store.idx(10, 100)]).toBe(BENCH);
    expect(store.type[store.idx(10, 99)]).toBe(ASH_ID);     // 台上一格补回灰烬
  });
});

// ===================== ★①（2026-09-04 掉落/沙族批）AI_010 沿途吞噬集+顶坡拍平
// （Projectile.cs:59021-59054,owner==myPlayer && tileCollide）——盒内格
// {185-187,165,12,665,639,105,178} → WorldGen.KillTile(i,j)（无 noItem=照常掉落,
// 走仓内 breakTile 全语义）;else if topSlope(1|2) && !Platforms → SlopeTile(拍平
// slope=0) + position.Y -= 16f。位次=AI 段内、落面 Kill 判据之前（拍平后中心格上移
// → 不吃落面 Kill=原版穿顶坡续坠）。掷骰：该循环无 RNG=零掷（掉落骰在 KillTile
// 域内,非本段）。 =====================

describe('① 灰烬弹沿途吞噬集+顶坡拍平（Projectile.cs:59021-59054）', () => {
  /** mkEntityHooks 变体：breakTile 记账并真实清格（KillTile 投影） */
  function mkConsumeHooks(store: TileStore) {
    const breaks: Array<[number, number]> = [];
    const hooks = {
      world: { store } as never,
      player: { dead: false, iframes: 0, x: 99999, y: 99999, w: 20, h: 42 } as never,
      enemies: () => [],
      playSfx: () => {},
      spawnDust: () => null,
      spawnDrop: () => null,
      damagePlayer: (): number => 0,
      breakTile: (x: number, y: number) => { breaks.push([x, y]); store.setTile(x, y, 0); },
    } as unknown as GameHooks;
    return { hooks, breaks };
  }

  const CONSUME_SHEETS = [185, 186, 187, 165, 12, 665, 639, 105, 178];

  for (const sheet of CONSUME_SHEETS) {
    it(`吞噬集成员 sheet ${sheet}：盒内格 → breakTile（KillTile 无 noItem 投影）`, () => {
      const store = new TileStore(40, 260);
      const t = TILE_INTERNAL_BY_SHEET.get(sheet)!;
      store.setTileSilent(10, 20, t, 0, 0);        // 弹心所在格
      const { hooks, breaks } = mkConsumeHooks(store);
      const p = new AshBallProj(10 * 16 + 8, 20 * 16 + 8, 0, 0.41, 15);
      p.fixedUpdate(1 / 60, hooks);                // 首拍 tileCollide=false（:58937）
      p.fixedUpdate(1 / 60, hooks);                // 次拍起消费循环（:59021 门）
      expect(breaks.some(([x, y]) => x === 10 && y === 20)).toBe(true);
    });
  }

  it('吞噬集外（石 1）→ 不吞（else-if 集合域外不进 KillTile）', () => {
    const store = new TileStore(40, 260);
    store.setTileSilent(10, 20, STONE, 0, 0);
    const { hooks, breaks } = mkConsumeHooks(store);
    const p = new AshBallProj(10 * 16 + 8, 20 * 16 + 8, 0, 0.41, 15);
    stepUntil(p, hooks);
    expect(breaks).toEqual([]);
  });

  it('顶坡（slope 2）拍平：SlopeTile → slope=0 + position.Y -= 16（拍平后中心上移不吃落面 Kill）', () => {
    const store = new TileStore(40, 260);
    store.setTileSilent(10, 20, STONE, 0, 0);
    store.setSlope(10, 20, 2);                     // topSlope（:59045 topSlope()=1|2）
    const { hooks } = mkConsumeHooks(store);
    const p = new AshBallProj(10 * 16 + 8, 20 * 16 + 8, 0, 0.41, 15);
    p.fixedUpdate(1 / 60, hooks);                  // 首拍免碰撞
    const yBefore = p.y;
    p.fixedUpdate(1 / 60, hooks);                  // 次拍：拍平 + y-=16 + 重力积分
    expect(store.slope[store.idx(10, 20)]).toBe(0);   // SlopeTile（:59046）
    expect(p.dead).toBe(false);                    // 拍平后中心格=上一格（不落面 Kill）
    expect(p.y).toBeCloseTo(yBefore - 16 + 1.23, 5);  // -16f（:59051）+ vy 0.82+0.41（首拍即吃重力）
  });

  it('底坡（slope 3）不拍平、平台坡不拍平（:59045 !TileID.Sets.Platforms 门）', () => {
    const store = new TileStore(40, 260);
    store.setTileSilent(10, 20, STONE, 0, 0);
    store.setSlope(10, 20, 3);                     // 底坡（topSlope()=false）
    store.setTileSilent(12, 20, TILE_INTERNAL_BY_SHEET.get(19)!, 0, 0);   // 平台 19
    store.setSlope(12, 20, 2);                     // 平台+topSlope → 门拒
    const { hooks } = mkConsumeHooks(store);
    const p = new AshBallProj(10 * 16 + 8, 20 * 16 + 8, 0, 0.41, 15);
    p.fixedUpdate(1 / 60, hooks);
    p.fixedUpdate(1 / 60, hooks);
    expect(store.slope[store.idx(10, 20)]).toBe(3);   // 底坡原样
    expect(store.slope[store.idx(12, 20)]).toBe(2);   // 平台坡原样（Platforms 门）
  });
});
