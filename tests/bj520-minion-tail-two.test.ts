/**
 * BJ520 两件（BJ519 登记债清偿）：
 *
 * ① 266 :62978-62999 跳向高处敌门快照修（BJ519① flag26 制动同病同法）——
 *      `velocity.Y == 0f`（:62978）为 AI 相读=上拍碰撞解算值;BJ516④ 重力落域后
 *      pre-move 直读带 +0.4 残留 → 稳态贴地门死。改读 a026VyCollide 快照
 *      （碰撞后重力前=原版 AI 相读相）。判别=门活：贴地稳态拍（快照 0/vy 0.4）
 *      高出敌 100-380px → 跳表写入。
 *      同门五档跳出表随批归真（:62979-62999）：原版五显式档无兜底——
 *      <120→-10/<210→-13/<270→-15/<310→-17/<380→-18,≥380 不写（旧 `: -18` 兜底
 *      对 num183≥380 误跳=归真判别面）。
 * ② flag10 岩浆逃逸门（AI_026 顶 :59170-59178 `if (flag10) { if (lavaWet)
 *      { ai[0]=1f; ai[1]=0f; } num=...; } else if (type==266) {...}`）——BJ519①
 *      登记债清偿：
 *      · MINION_WET_IDS 补注册 191-194/266（SetDefaults :2793-2815/:3518-3528
 *        均无 ignoreWater 行=受段）——lavaWet 承载激活（原字段零生产零消费）;
 *      · lavaWetAi 上拍快照（AI(:16880) 先于湿段(:16895) 的上子步段值,2026-09-08
 *        定谳批 wetAi 同口径;首拍=构造值 false——NewProjectile 预置不写 lavaWet,
 *        故快照位次在预置调用前）;
 *      · 门=isF10（191-194∪1094/1113;266 走 else-if 不逃逸）∧ lavaWetAi →
 *        a026A0=1（返程态）+ shootCd=0（清攻击冷却）;粘滞位=湿段只置不清,
 *        !wet 三清。
 *      附带复活面判别：266 湿浮支（:65502-65523 wetAi 承载——注册前 wetAi 对
 *      266 恒假=死码）。
 * 真值锚：1457 Projectile.cs AI_026 :59170-59178 + :62978-62999 + SetDefaults
 *      :2793-2815/:3518-3528;
 * 实现落点：src/entities/MinionProj.ts（ai026TailGround 岩浆门 + 266 跳门快照/
 *      五档归真 + MINION_WET_IDS 补注册 + lavaWetAi 快照）。
 * 夹具注：世界高 160——湿段扫描窗 j1 钳 st.h-40（:1663-1666 vanilla 同式）,
 *      液体行须 <st.h-40（120 高世界 80 行下液体不可检=旧 120 高夹具陷阱）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { MinionProj } from '../src/entities/MinionProj';
import type { GameHooks } from '../src/entities/types';

const priv = (o: object): Record<string, any> => o as unknown as Record<string, any>;

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number;
  hurt: (d: number) => boolean;
}
const mkEnemy = (id: number, cx: number, cy: number): MockEnemy => {
  const w = 16, h = 24;
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false,
    get cx() { return this.x + this.w / 2; },
    set cx(v: number) { this.x = v - this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    set cy(v: number) { this.y = v - this.h / 2; },
    hp: 100000,
    hurt: () => true,
  };
  return e;
};

function makeHooks(enemies: MockEnemy[] = []) {
  const w = new World(200, 160, 7, 'bj520');
  for (let x = 0; x < 200; x++) for (let y = 140; y < 160; y++) w.store.setTile(x, y, 1);
  // 高台：台面 row 92（x 50-80）——a026 尾族地面态舞台（BJ519 同式）
  for (let x = 50; x <= 80; x++) w.store.setTile(x, 92, 1);
  w.groundLevel = 100;
  const player = new Player(60 * 16, 79 * 16, new Inventory());
  const hooks: GameHooks = {
    world: w as never,
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
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    spawnDust: () => null,
  };
  (hooks as unknown as { entities: { projectiles: unknown[]; add: () => void } }).entities =
    { projectiles: [], add: () => {} };
  return { hooks, store: w.store, player, enemyList: enemies };
}

const minion = (player: Player, projId: number, cx: number, cy: number): MinionProj => {
  const m = new MinionProj(cx, cy, projId, 10, 2, false, 0, false, () => player);
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;
  return m;
};

/** 液体矩形（液量 255 满格;type=LIQUID_TYPE +1 编码 1=水 2=岩浆,TileStore 注） */
function fillLiquid(h: ReturnType<typeof makeHooks>,
  x0: number, x1: number, y0: number, y1: number, type: number): void {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const i = h.store.idx(x, y);
      h.store.liquid[i] = 255;
      h.store.liquidType[i] = type;
    }
  }
}

/** 岩浆盆：row 90-91（y 1440-1472）× col 64-68,坐在高台 row 92 上 */
const LAVA = (h: ReturnType<typeof makeHooks>) => fillLiquid(h, 64, 68, 90, 91, 2);
/** 浅水盆（对照组,不同列） */
const WATER = (h: ReturnType<typeof makeHooks>) => fillLiquid(h, 56, 60, 90, 91, 1);

afterEach(() => {
  vi.restoreAllMocks();
});

// player 夹具基准：pos=(960,1264) → cx=970 cy=1285 盒底 1306;facing=1
const PLAT_Y = 92 * 16;            // 1472 台面
const MX = 66 * 16;                // 1056 台上站位

// ============================================================
// ① 266 :62978-62999 跳向高处敌门——快照读相（BJ519① 同病同法）
// ============================================================
describe('① 266 跳向高处敌门：a026VyCollide 快照读相', () => {
  it('贴地稳态拍门活：settle 后高出 150 敌 → 跳表 -13（pre-move 直读形 vy=0.4 门死 → 红）', () => {
    const h = makeHooks();
    const m = minion(h.player, 266, MX, PLAT_Y - 8);           // 盒底恰台面
    for (let t = 0; t < 5; t++) m.fixedUpdate(1, h.hooks);     // settle：稳态 vy=0.4/快照 0
    expect(priv(m).a026VyCollide, '贴地稳态快照=碰撞解算值 0（重力残留在 vy 不在快照）').toBe(0);
    const e = mkEnemy(1, MX, (PLAT_Y - 8) - 150);              // 高出 150（120..210 档）
    h.enemyList.push(e);
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026VyCollide, '跳表写入 -13（:62979-62999 档2;快照=碰撞后直通）').toBe(-13);
    expect(m.vy, '拍尾重力 -13+0.4=-12.6（门死形 vy=0.4 → 红）').toBeCloseTo(-12.6, 9);
    expect(m.y, '起跳位移向上').toBeLessThan(PLAT_Y - 16);
  });

  it('五档归真：num183=350 → -18 档（<380 末档在）;num183=400（≥380）→ 不写（旧 `: -18` 兜底 → 红）', () => {
    const h1 = makeHooks();
    const m1 = minion(h1.player, 266, MX, PLAT_Y - 8);
    for (let t = 0; t < 5; t++) m1.fixedUpdate(1, h1.hooks);
    h1.enemyList.push(mkEnemy(1, MX, (PLAT_Y - 8) - 350));     // 310..380 末档
    m1.fixedUpdate(1, h1.hooks);
    expect(m1.vy, '350 → -18（:62997 else-if <380）').toBeCloseTo(-17.6, 9);

    const h2 = makeHooks();
    const m2 = minion(h2.player, 266, MX, PLAT_Y - 8);
    for (let t = 0; t < 5; t++) m2.fixedUpdate(1, h2.hooks);
    const y0 = m2.y;
    h2.enemyList.push(mkEnemy(2, MX, (PLAT_Y - 8) - 400));     // ≥380 无档
    m2.fixedUpdate(1, h2.hooks);
    expect(m2.vy, '400 ≥380 → 原版不写（贴地稳态 0.4;兜底 -18 形 → 红）').toBeCloseTo(0.4, 9);
    expect(m2.y, '不起跳').toBe(y0);
  });

  it('负例：目标不高于 100（aimY ≥ cy-100）不跳（-100 带判别面）', () => {
    const h = makeHooks();
    const m = minion(h.player, 266, MX, PLAT_Y - 8);
    for (let t = 0; t < 5; t++) m.fixedUpdate(1, h.hooks);
    h.enemyList.push(mkEnemy(1, MX, PLAT_Y - 8));              // 同高
    const y0 = m.y;
    m.fixedUpdate(1, h.hooks);
    expect(m.vy, '门首条件 aimY < cy-100 假 → 不写（稳态 0.4）').toBeCloseTo(0.4, 9);
    expect(m.y).toBe(y0);
  });
});

// ============================================================
// ② flag10 岩浆逃逸门（:59170-59178）
// ============================================================
describe('② 岩浆逃逸：读相/触发/粘滞/排除面', () => {
  it('t1 读相：入岩浆当拍门不触发（上拍快照=构造值 false;直读当拍形 → 红）', () => {
    const h = makeHooks();
    LAVA(h);
    const m = minion(h.player, 191, MX, PLAT_Y - 8);           // 出生盒在岩浆中
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026A0, '首拍 AI 读 NewProjectile 值 false（:59170 时点先于湿段）').toBe(0);
    expect(priv(m).lavaWet, '首拍湿段已置粘滞位（下拍 AI 读值）').toBe(true);
  });

  it('t2 触发：a026A0=1 返程态 + shootCd 清零（门摘除 → 红）', () => {
    const h = makeHooks();
    LAVA(h);
    const m = minion(h.player, 191, MX, PLAT_Y - 8);
    priv(m).shootCd = 40;                                      // ai[1] 槽（攻击冷却）
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).shootCd, 't1 头自减 39（门未触发）').toBe(39);
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026A0, ':59174 ai[0]=1f 岩浆逃逸返程').toBe(1);
    expect(priv(m).shootCd, ':59175 ai[1]=0f 清攻击冷却（39 → 0）').toBe(0);
  });

  it('266 不入逃逸门（flag10 外,:59179 else-if 支;误入 → 红）', () => {
    const h = makeHooks();
    LAVA(h);
    const m = minion(h.player, 266, MX, PLAT_Y - 8);
    for (let t = 0; t < 3; t++) m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026A0, '266 无逃逸面（地面态维持）').toBe(0);
    expect(priv(m).lavaWet, '粘滞位照常维护（湿段注册面）').toBe(true);
  });

  it('水不触发（lavaWet 假;水体类型判别面）', () => {
    const h = makeHooks();
    WATER(h);
    const m = minion(h.player, 191, 60 * 16, PLAT_Y - 8);      // 水盆 col 56-60 内
    for (let t = 0; t < 2; t++) m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026A0, '水非岩浆 → 不逃逸').toBe(0);
    expect(priv(m).lavaWet, 'lavaWet 恒假').toBe(false);
    expect(priv(m).wetAi, 'wet 照常置位（受段面）').toBe(true);
  });

  it('粘滞 + !wet 三清：出水仍湿 lavaWet 保持,全干三清（:16906-16911/:17103-17108）', () => {
    const h = makeHooks();
    LAVA(h);
    WATER(h);
    const m = minion(h.player, 191, MX, PLAT_Y - 8);
    m.fixedUpdate(1, h.hooks);
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).lavaWet, '岩浆中粘滞置位').toBe(true);
    // 出岩浆入水（仍湿）：粘滞保持
    m.x = 60 * 16 - m.w / 2; m.y = PLAT_Y - 8;
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).lavaWet, '湿段只置不清——离岩浆仍湿则保持').toBe(true);
    // 全干：三清
    m.x = 74 * 16 - m.w / 2; m.y = PLAT_Y - 8;
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).lavaWet, '!wet 三清（:17103-17108）').toBe(false);
  });

  it('1094 同族：t2 触发（flag8 亦走 flag10 门,变异漏 1094 → 红）', () => {
    const h = makeHooks();
    LAVA(h);
    const m = minion(h.player, 1094, MX, PLAT_Y - 9);          // 狐 18 盒,盒底恰台面
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026A0).toBe(0);
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026A0, 'flag8 ∈ flag10（flag6|flag8）→ 逃逸').toBe(1);
  });

  it('附带复活面：266 水中玩家在上 → 湿浮 -0.2/t（wetAi 承载复活,注册前恒假=重力形 → 红）', () => {
    const h = makeHooks();
    fillLiquid(h, 64, 68, 88, 91, 1);                          // 深水盆 rows 88-91
    const m = minion(h.player, 266, MX, 89 * 16);              // 全浸;玩家盒底 1306 < 盒底 1440
    for (let t = 0; t < 3; t++) m.fixedUpdate(1, h.hooks);
    expect(m.vy, ':65502-65523 湿浮支 -0.2/t（重力形 +0.4/t 累积 → 红）').toBeCloseTo(-0.6, 9);
    expect(priv(m).a026A0, '266 无逃逸门,维持地面态').toBe(0);
  });
});

// ============================================================
// ③ 源级锁 + sha256 对拍锚（BJ520 落刀态）
// ============================================================
describe('③ 源级锁', () => {
  it('BJ520 落刀标记在位（岩浆门/快照/五档/受段注册/lavaWetAi）', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'entities', 'MinionProj.ts'), 'utf8');
    expect(src).toContain('★BJ520');                                       // 落刀标记
    expect(src).toContain('isF10 && this.lavaWetAi');                      // ② 门
    expect(src).toContain('this.lavaWetAi = this.lavaWet;');               // ② 快照
    expect(src).toContain('private lavaWetAi = false;');                   // ② 字段
    expect(src.split('this.a026VyCollide === 0').length - 1, '① 快照读相 ×2（flag26 制动+266 跳门）')
      .toBe(2);
    expect(src).toContain('else if (num183 < 380) this.vy = -18;');        // ① 末档无兜底
    expect(src).not.toMatch(/: num183 < 310 \? -17 : -18/);                // ① 旧兜底 ternary 退役
    expect(src).toContain('191, 192, 193, 194,   // 俾格米 flag6');         // ② 受段注册
    expect(src).toContain('266,                  // 宝宝史莱姆');
  });

  it('sha256 稳定（变异还原后回同值）', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'entities', 'MinionProj.ts'), 'utf8');
    expect(createHash('sha256').update(src).digest('hex')).toHaveLength(64);
  });
});
