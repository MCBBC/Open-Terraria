// BJ503（2026-10-04）日耀柱弹幕效果对拍（用户实报「日耀柱发射的弹幕效果不对」）——
// 原版定谳链（1457 亲读,1458 同域 diff 零变更）：
//   · 塔攻击支 = NPC.cs :39736-39761（aiStyle 94 type 517）：发射的不是 Projectile 而是
//     NPC 519（Solar Spore 日耀黏液,aiStyle 99）——vector195 = Top(顶部中点=x+w/2)
//     + (−w·0.33, −20) + (w·0.66, 20)·RandomVector2(0..1) → NewNPC【中心锚】(int 截断);
//     velocity = −UnitY.RotatedByRandom(π/4)×(7+NextFloat×5)（RotatedByRandom=三角分布
//     Utils.cs:1785-1788,峰朝正上）;ai[1]=60 冷却。
//   · 519 AI :40324-40390：重力 0.2 钳 12 → 落地 5t 定格 → HitEffect(0,9999)+active=false;
//     运行尘 :40355-40389（首帧 13 粒 dust6 α90 scale2.5 noGravity+fadeIn1+vel×4+noLight;
//     每帧 3 掷 2/3:vel×0.2+fadeIn1,1/6→vel×30+ng=false+noLight,否则 DirectionFrom(dust)=
//     Normalize(Center−dust)（Entity.cs:210,【指向 NPC 中心】=火焰回吸））。
//   · 519 HitEffect 特例 :83908-83929（与 426 同链无 life 门=受击/死亡同喷）：oldPos 环
//     TrailCacheLength[519]=20（NPCID.cs:4809）×stride3(`num126 += 3`→index 0,3,…,18 共 7 组)
//     ×5 粒=idPick[6,259,158] 带权尘+sx 2.5hd/sy −2.5+α200+vel×2.4+scale+=NextFloat。
// 本仓差异四刀：
//   ①发射点漏 Top 的 +w/2 基准=带整体左偏半塔宽 65px（519 从塔左肩外喷）+Y 漏随机带;
//   ②出膛角 uniform(rand×2−1)×max ≠原版三角分布（BJ112-④ 单源收编清单漏网,同文件
//     unitYRotatedByRandom 现成）;
//   ③519 HitEffect 轨迹爆散尘表外（vanilla-npcdust.json 无 519 条目——提取器 forStep/
//     局部 Rectangle/alpha post 三缺口,本刀批7 接齐）;
//   ④自爆 spawnParticles 自造色块 44 粒 ≠原版查表尘（solarSlimeAI 改走 spawnNpcDeathDust
//     (hd=0)）+运行拖尾自造色块 → spawnDust 原版尘池全参 1:1。
// 登记债（本刀不落,渲染域）：GetAlpha 白提亮 40%（NPC.cs :94679-94684 type 395/519
//   Lerp(newColor,White,0.4)——需预乘对/双绘机制,duke370GetAlphaBoost 判例同域,与 395 同族）。
//
// 断言面：
//   A. 数据面金标——519 hit/death 全结构钉值（len20/stride3/idPick/n5/sx2.5hd/α200）
//      + _meta.batch7 声明 + schema stride 文档。
//   B. 行为锁——确定性掷流:35 粒（7 组×5）/轨迹位 stride 绑定（组0=最新位、组1=最旧位）/
//      idPick 带权域/α200 落活尘/velMul2.4（hd=1 → vx=6,vy=−6）/scaleAddR01。
//   C. 塔发射面——60 发统计:中心 X 带 [x+0.17w, x+0.83w]+均值>x+50（★旧码均值≈x,变异
//      判别主锚）;Y 带极差 ≥10（旧码恒 y−20）;掷角 |a|<π/8 占比 >0.62（三角 0.75 vs
//      uniform 0.5——旧码变异判别）。
//   D. 519 AI 面——首帧 13 粒全参（seed=0）+每帧拖尾 3 粒 1/6 爆发支+自爆查表 35 粒
//      +spawnParticles 零调用（旧自造色块变异判别）。
//   E. 变异自证——M1 摘 alpha post=红;M2 摘 stride（恒 1→20 组 100 粒）=红。
//      npcdust-mutation-mutex 共锁（bj296/304/327 同锁）。
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';

vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });   // ★残留普查波:变异自证三层守卫跨套件互斥下锁等待/内层 spawn 可超默认 5s——按仓内习语放宽（fx-codegen-parity 同款）
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { gateConsumerMutation, lockConsumerMutation, unlockConsumerMutation } from './npcdust-mutation-mutex';
import { withMutation } from './mutation-guard';   // ★残留普查波:变异自证统一守卫（三层:文件互斥/panic 还原/残留自检）
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { VanillaDust } from '../src/fx/VanillaDust';
import { TILE } from '../src/core/constants';
import npcDustJson from '../src/data/vanilla-npcdust.json';
import type { GameHooks } from '../src/entities/types';
import { seededRandom, BATTERY_SEED } from './seeded-rng';
import { spawnNpcHitDust, spawnNpcDeathDust } from '../src/entities/NpcHitDust';

beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(BATTERY_SEED)); });
afterEach(() => { vi.restoreAllMocks(); });

beforeAll(() => { gateConsumerMutation('SW_BJ503_MUT', join(process.cwd(), 'src', 'entities', 'NpcHitDust.ts')); });

const W = 180, H = 150, FLOOR = 110;
const TABLE = npcDustJson as unknown as Record<string, {
  hit?: Array<Record<string, unknown>>; death?: Array<Record<string, unknown>>;
}> & { _meta: Record<string, unknown> };

type DustCall = {
  x: number; y: number; w: number; h: number; type: number;
  sx: number; sy: number; alpha: number; scale: number;
  noGravity: boolean; vx: number; vy: number; fadeIn: number;
  noLight: boolean; color: { r: number; g: number; b: number; a: number } | null;
};

function makeWorld(): World {
  const w = new World(W, H, 11, 'bj503-solar-pillar');
  const st = w.store;
  w.groundLevel = 40;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

function makeHooks(w: World, captured: DustCall[], spawnParticles?: () => void): GameHooks {
  return {
    world: w, player: null,
    enemies: () => [] as Enemy[], critters: () => [], npcs: () => [],
    entities: { nextId: 1, add: () => {} },
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: spawnParticles ?? (() => {}),
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {}, cutTile: () => {},
    spawnDust: (
      x: number, yn: number, wn: number, hn: number, type: number,
      sx = 0, sy = 0, alpha = 0, color: DustCall['color'] = null, scale = 1, noGravity = false,
    ) => {
      const rec: DustCall = { x, y: yn, w: wn, h: hn, type, sx, sy, alpha, scale, noGravity, vx: sx, vy: sy, fadeIn: 0, noLight: false, color };
      captured.push(rec);
      return rec;
    },
    dust: { spawn: () => null },
    scene: {},
  } as unknown as GameHooks;
}

/** Enemy 轨迹环手动推入（pushHistory 私有——白盒括号访问,bj327 批4 同款） */
function pushHist(e: Enemy, x: number, y: number): void {
  e.x = x; e.y = y;
  (e as unknown as { pushHistory(): void }).pushHistory();
}

// ===================== A. 数据面金标（批7 手核 NPC.cs :83908-83929 钉值） =====================
describe('BJ503 A. 数据面金标', () => {
  it('519（:83908-83929）：hit=death 同 body——oldPos 环 len20 stride3 × idPick[6,259,158] n5 + sx2.5hd/sy−2.5 + posts[alpha200, velMul2.4, scaleAddR01]', () => {
    const expected = [
      {
        over: 'oldPos', len: 20, stride: 3,
        body: [
          {
            dust: 0, idPick: [6, 259, 158], n: 5, pos: 'oldPos',
            sx: '2.5hd', sy: -2.5,
            posts: [['alpha', 200], ['velMul', 2.4], ['scaleAddR01']],
            line: 83918,
          },
        ],
        line: 83918,
      },
    ];
    expect(TABLE['519'].hit).toEqual(expected);
    expect(TABLE['519'].death).toEqual(expected);   // 块无 life 门 → 两相同 body（受击/死亡同喷）
  });

  it('_meta.batch7 声明 + schema stride 文档 + wiredTypes 计数含 519', () => {
    expect(String(TABLE._meta.batch7)).toContain('519');
    expect(String(TABLE._meta.batch7)).toContain('stride');
    expect(String(TABLE._meta.batch7)).toContain('rectLocals');
    expect(String(TABLE._meta.schema)).toContain('stride');
    expect((TABLE._meta.counts as { wiredTypes: number }).wiredTypes).toBeGreaterThanOrEqual(343);
  });
});

// ===================== B. 行为锁（确定性掷流——519 查表尘 1:1 消费） =====================
describe('BJ503 B. 行为锁——519 轨迹爆散尘查表消费', () => {
  it('519 death 查表（hd=0）：35 粒（7 组×5）+轨迹位 stride 绑定（组0=最新位,组1=最旧位）+α200+scaleAddR01', () => {
    const captured: DustCall[] = [];
    const game = makeHooks(makeWorld(), captured);
    const e = Enemy.fromVanilla(519, 100 * TILE, 100 * TILE)!;
    // 轨迹环 4 拍：A(最旧)→B→C→D(最新)——histXAt(0)=D / histXAt(3)=A / index≥6 clamp=A
    pushHist(e, 1000, 2000);   // A
    pushHist(e, 1100, 2100);   // B
    pushHist(e, 1200, 2200);   // C
    pushHist(e, 1300, 2300);   // D
    spawnNpcDeathDust(e, game, 0);
    expect(captured.length).toBe(35);            // 7 组（index 0,3,…,18）× 5 粒
    // 组 0（index 0=最新位 D）5 粒：盒顶左=(1300,2300)、盒=26×26
    for (let k = 0; k < 5; k++) {
      expect(captured[k].x).toBe(1300);
      expect(captured[k].y).toBe(2300);
      expect(captured[k].w).toBe(e.w);
      expect(captured[k].h).toBe(e.h);
    }
    // 组 1（index 3=最旧位 A）5 粒
    for (let k = 5; k < 10; k++) {
      expect(captured[k].x).toBe(1000);
      expect(captured[k].y).toBe(2000);
    }
    // idPick 带权域 {6,259,158}（seeded 流逐尘 1 掷）+ α200 post 落活尘 + scaleAddR01
    for (const c of captured) {
      expect([6, 259, 158]).toContain(c.type);
      expect(c.alpha).toBe(200);
      expect(c.scale).toBeGreaterThanOrEqual(1);
      expect(c.scale).toBeLessThan(2);
    }
    // hd=0 → sx=0（尘竖直上抛）
    expect(captured.every((c) => c.sx === 0)).toBe(true);
  });

  it('519 hit 查表（hd=1）：velMul2.4 终值（sx=2.5×1×2.4=6, sy=−2.5×2.4=−6）——同 35 粒结构', () => {
    const captured: DustCall[] = [];
    const game = makeHooks(makeWorld(), captured);
    const e = Enemy.fromVanilla(519, 50 * TILE, 50 * TILE)!;
    pushHist(e, 800, 900);
    spawnNpcHitDust(e, game, 1, 100);
    expect(captured.length).toBe(35);
    expect(captured.every((c) => c.vx === 6)).toBe(true);    // NewDust 入参 2.5×hd=2.5 → ×2.4
    expect(captured.every((c) => c.vy === -6)).toBe(true);   // sy=−2.5（无 hd 因子）→ ×2.4
  });
});

// ===================== C. 塔发射面（1457 :39736-39761——坐标带+掷角分布统计） =====================
describe('BJ503 C. 塔发射面——517 塔顶直投 519（坐标带 1:1+三角分布）', () => {
  /** 塔发射 harness：真 VanillaDust 池承接环境尘、em.add 捕获 519（addEnemy 通道） */
  function makeTowerHarness() {
    const w = makeWorld();
    const vd = new VanillaDust();
    const enemies: Enemy[] = [];
    const spawned519: Enemy[] = [];
    const em = {
      nextId: 1,
      add: (e: unknown, _bucket: string) => {
        const en = e as Enemy;
        if (en && (en as { vanillaId?: number }).vanillaId === 519) spawned519.push(en);
      },
    };
    const player = {
      x: 80 * TILE, y: 80 * TILE + 500, w: 20, h: 42, cx: 80 * TILE + 10, cy: 80 * TILE + 500 + 21,
      vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
      aabbOverlaps: () => false,
    };
    const hooks = {
      world: w, player,
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
      playSfxWav: () => {},
      showPickupLabel: () => {},
      entities: em,
      spawnDust: (
        x: number, y: number, dw: number, dh: number, type: number,
        sx = 0, sy = 0, alpha = 0, color: VDustLike['color'] = null, scale = 1, ng = false,
      ) => {
        const d = vd.spawn(x, y, dw, dh, type, sx, sy, alpha, color, scale);
        if (d && ng) d.noGravity = true;
        return d;
      },
    } as unknown as GameHooks;
    const tower = Enemy.fromVanilla(517, 80 * TILE, 80 * TILE)!;
    tower.bInit = true;
    tower.ai0 = 0;   // 悬停相位 0（vy=sin(0)=0,消塔体上下漂对 Y 带判别的污染）
    return { hooks, tower, spawned519 };
  }
  type VDustLike = { color: { r: number; g: number; b: number; a: number } | null };

  /** mulberry32（bj107 六种子统计判例播法） */
  function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('120 发：中心 X 全落塔顶带 [x+0.17w, x+0.83w] 且均值>x+50（旧码漏 +w/2=整体左偏 65px 变异判别）+Y 相对带 [−33,−13] 极差 ≥10（旧码恒 y−20）', () => {
    vi.restoreAllMocks();
    vi.spyOn(Math, 'random').mockImplementation(lcg(0x5bee));
    const h = makeTowerHarness();
    const towerX = h.tower.x;
    const yBefore: number[] = [];          // 每拍 tick 前塔 y（Y 带判别基准——塔有贴地钳/相位漂移）
    for (let i = 0; i < 120; i++) {
      yBefore.push(h.tower.y);
      h.tower.ai1 = 0;                 // 压冷却——每拍强制过发射门（坐标统计与节律解耦）
      h.tower.fixedUpdate(1 / 60, h.hooks);
    }
    expect(h.spawned519.length).toBeGreaterThanOrEqual(115);
    expect(h.spawned519.length).toBe(yBefore.length);   // 强冷却下逐拍 1 发（同拍序对应）
    const w517 = 130;
    const centers = h.spawned519.map((f) => f.x + f.w / 2);
    const lo = towerX + 0.17 * w517 - 1.5;    // (int) 截断 + 浮点容差
    const hi = towerX + 0.83 * w517 + 1.5;
    for (const c of centers) {
      expect(c).toBeGreaterThanOrEqual(lo);
      expect(c).toBeLessThanOrEqual(hi);
    }
    const mean = centers.reduce((a, b) => a + b, 0) / centers.length;
    expect(mean).toBeGreaterThan(towerX + 50);   // 新带均值≈x+65;旧带 [x−42.9, x+42.9] 均值≈x → 红
    // Y 相对带：flare.y − (tick 前塔 y) ∈ [−33,−13)（贴地钳 ±1.5 + 截断 → 容差 ±3.5）
    const rel = h.spawned519.map((f, i) => f.y - yBefore[i]);
    for (const r of rel) {
      expect(r).toBeGreaterThanOrEqual(-36.5);
      expect(r).toBeLessThanOrEqual(-9.5);
    }
    const ySpread = Math.max(...rel) - Math.min(...rel);
    expect(ySpread).toBeGreaterThanOrEqual(10);  // 新带 20px 随机宽;旧码恒 y−20 → 极差 0 → 红
  });

  it('120 发：出膛角 |a|<π/8 占比 >0.62（三角分布 0.75 vs 旧码 uniform 0.5——变异判别）', () => {
    vi.restoreAllMocks();
    vi.spyOn(Math, 'random').mockImplementation(lcg(0x501a));
    const h = makeTowerHarness();
    for (let i = 0; i < 120; i++) {
      h.tower.ai1 = 0;
      h.tower.fixedUpdate(1 / 60, h.hooks);
    }
    expect(h.spawned519.length).toBeGreaterThanOrEqual(115);
    // vx=sin(a)×sp, vy=−cos(a)×sp → |a| = |atan2(vx, −vy)|
    let inside = 0;
    for (const f of h.spawned519) {
      const ang = Math.abs(Math.atan2(f.vx, -f.vy));
      if (ang < Math.PI / 8) inside++;
    }
    const ratio = inside / h.spawned519.length;
    expect(ratio).toBeGreaterThan(0.62);   // 三角 P=0.75;uniform P=0.5（旧码）→ 大数定律下红
  });
});

// ===================== D. 519 AI 面（:40324-40390——运行尘 1:1+自爆查表） =====================
describe('BJ503 D. 519 AI 面——火尘拖尾 1:1+自爆走查表', () => {
  it('首帧 13 粒 dust6 全参（seed=0:α90/scale2.5/noGravity/fadeIn1/vel×4/noLight）+每帧拖尾 3 粒 1/6 爆发支（×30+ng=false+noLight）', () => {
    vi.restoreAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0);   // Next(3)<2 全过 + 1/6 门全中
    const captured: DustCall[] = [];
    const game = makeHooks(makeWorld(), captured);
    const e = Enemy.fromVanilla(519, 60 * TILE, (FLOOR - 20) * TILE)!;
    e.vx = 2; e.vy = 1;                             // 塔喷出初速（非 0 → 不进落地门）
    e.fixedUpdate(1 / 60, game);
    expect(captured.length).toBe(16);               // 首帧 13 + 拖尾 3（seed=0 三掷全中）
    for (const c of captured) {
      expect(c.type).toBe(6);
      expect(c.alpha).toBe(90);
      expect(c.scale).toBe(2.5);
    }
    for (let k = 0; k < 13; k++) {                  // 首帧组:vel×4——sx=e.vx×0.5=1→4;sy=e.vy×0.5=0.6（AI 拍内 vy 已 +0.2=1.2）→2.4
      expect(captured[k].noGravity).toBe(true);
      expect(captured[k].fadeIn).toBe(1);
      expect(captured[k].noLight).toBe(true);
      expect(captured[k].vx).toBeCloseTo(4, 6);
      expect(captured[k].vy).toBeCloseTo(2.4, 6);
    }
    for (let k = 13; k < 16; k++) {                 // 拖尾组:×0.2 后 1/6 爆发支 ×30+ng=false+noLight
      expect(captured[k].noGravity).toBe(false);
      expect(captured[k].noLight).toBe(true);
      expect(captured[k].vx).toBeCloseTo(6, 6);     // 2×0.5=1 → ×0.2=0.2 → ×30=6
      expect(captured[k].vy).toBeCloseTo(3.6, 6);   // 1.2×0.5=0.6 → ×0.2=0.12 → ×30=3.6
    }
  });

  it('自爆（ai0=1,ai1≥5）：spawnNpcDeathDust(hd=0) 35 粒查表尘+dead——spawnParticles 零调用（旧自造色块 44 粒变异判别）', () => {
    const captured: DustCall[] = [];
    let particleCalls = 0;
    const game = makeHooks(makeWorld(), captured, () => { particleCalls++; });
    const e = Enemy.fromVanilla(519, 70 * TILE, (FLOOR - 6) * TILE)!;
    e.ai0 = 1; e.ai1 = 4;                            // 已落地,末拍自爆
    pushHist(e, 70 * TILE, (FLOOR - 6) * TILE);
    pushHist(e, 70 * TILE + 5, (FLOOR - 6) * TILE);
    e.fixedUpdate(1 / 60, game);
    expect(e.dead).toBe(true);                       // HitEffect(0,9999)+active=false
    expect(captured.length).toBe(35);                // 519 表 death 相（7 组×5）
    expect(particleCalls).toBe(0);                   // ★旧码 spawnParticles 自造 44 粒 → 本断言红
    expect(captured.every((c) => c.alpha === 200)).toBe(true);
  });
});

// ===================== E. 变异自证（原子+逐字节还原,共锁） =====================
describe.skipIf(process.env.SW_BJ503_MUT)('BJ503 E. 变异自证', () => {   // ★残留普查波补 dam（全族同款习语）
  const CONSUMER = join(process.cwd(), 'src', 'entities', 'NpcHitDust.ts');
  const spawnVitest = (filter: string) => spawnSync('npx', ['vitest', 'run', 'tests/bj503-solar-pillar-projectiles.test.ts', '--no-file-parallelism', '-t', filter], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
    env: { ...process.env, SW_BJ503_MUT: '1' },   // ★子进程豁免残留检测闸（对变异文件跑 B 面）
  });
  let PRISTINE = '';
  afterEach(() => { if (PRISTINE) writeFileSync(CONSUMER, PRISTINE); });
  beforeAll(() => {
    lockConsumerMutation();
    PRISTINE = readFileSync(CONSUMER, 'utf8');   // 锁内快照（互斥面内=恒净本）
  });
  afterAll(() => {
    if (PRISTINE) writeFileSync(CONSUMER, PRISTINE);
    unlockConsumerMutation();
  });

  // ★残留普查波 2026-10-12:BJ606 习语统一改造→tests/mutation-guard.ts 三层守卫
  //  （按目标文件互斥/panic-safe 还原/残留自检+自愈）;域锁/快照钉面保留,文件锁在守卫内层。
  it('M1 摘 alpha post 应用（case 空转）→ 519 查表 α200 断言红', () => {
    withMutation(CONSUMER,
      "      case 'alpha': d.alpha = op[1]; break;",
      "      case 'alpha': break; // ★BJ503 变异:摘 alpha 应用",
      () => {
        const r = spawnVitest('519 death 查表');
        expect(r.status).not.toBe(0);               // ★变异证红:α200 落活尘锁捕获
        expect(r.stdout).toContain('519 death 查表');
      }, { label: 'BJ503 M1' });
  });

  it('M2 摘 stride（恒 1 → 20 组 100 粒）→ 519 查表 35 粒断言红', () => {
    withMutation(CONSUMER,
      '      const stride = el.stride ?? 1;',
      '      const stride = 1; // ★BJ503 变异:摘步进',
      () => {
        const r = spawnVitest('519 death 查表');
        expect(r.status).not.toBe(0);               // ★变异证红:stride3 环 7 组 → 恒 1 变 20 组=100 粒
        expect(r.stdout).toContain('519 death 查表');
      }, { label: 'BJ503 M2' });
  });
});
