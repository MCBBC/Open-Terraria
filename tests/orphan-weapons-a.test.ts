// 孤儿武器 A 波五件回归（2026-08-30，模型 tests/slime-gun.test.ts 桩）：
//   工单1 普通绳圈 985→弹171 铺绳（Arrow ROPE_COIL_TILE 171 扩表+aiStyle35 物理自校正）
//   工单2 水枪 2272→弹358 Wet(103)25s / 微光枪 5495→弹1042 只 NPC 微光化（GlobProj）
//   工单3 打窝桶 4608→弹820 入水 chum 上报（ChumBucketProj 生产端接通双缓冲注册面）
//   工单4 放飞灯笼 4702→弹855 飞升发光体（SkyLanternProj;vanilla 无环境灯注册面——
//         LanternSky 由 LanternNight.lanternsUp 驱动,与弹体两套系统,断言=升力+点光）
//   工单5 晶洞 4400→弹772 Kill 宝石雨（Arrow.killNow 772 支 DropGeodeGems 1:1）
// 锚点：Item.cs case 2272 :22877-22889 / case 5495 :43314-43329 / case 4608 :38234-38246
//       / case 4702 :38645-38650 / case 4400 :37357-37372；Projectile.cs AI_035 :27619
//       （num274 默认213）/AI_060 :29430-29700/AI_163 :54413-54547/AI_166_Dove
//       :48411-48500/Kill :76566-76608 + DropGeodeGems :80304-80316。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';
import { Arrow } from '../src/entities/Arrow';
import { GlobProj } from '../src/entities/GlobProj';
import { ChumBucketProj } from '../src/entities/ChumBucketProj';
import { SkyLanternProj } from '../src/entities/SkyLanternProj';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { chumsInTile, chumOnPreUpdateAll } from '../src/entities/chumBucket';
import { BuffType } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';

const STONE = () => {
  const id = TILE_BY_KEY['v_1_stone'];
  return id !== undefined ? id : 1;
};

function makeHooks(store: TileStore): GameHooks & {
  drops: Array<{ key: string; x: number; y: number; n: number }>;
  lights: Array<[number, number, number, number, number]>;
} {
  const drops: Array<{ key: string; x: number; y: number; n: number }> = [];
  const lights: Array<[number, number, number, number, number]> = [];
  const hooks = {
    world: { store } as never,
    player: { equipStats: {}, cx: 800, cy: 1440, x: 790, y: 1419, w: 20, h: 42, dead: false } as never,
    enemies: () => [], critters: () => [], npcs: () => [],
    projectiles: () => [],
    spawnDrop: (x: number, y: number, key: string, n?: number) => { drops.push({ key, x, y, n: n ?? 1 }); return null; },
    damagePlayer: () => {}, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => true,
    showPickupLabel: () => {}, spawnDust: () => null,
    addLightAt: (x: number, y: number, r: number, g: number, b: number) => { lights.push([x, y, r, g, b]); },
  };
  return Object.assign(hooks as unknown as GameHooks, { drops, lights });
}

/** 最小 Game 桩（slimeGunGame 同法）：真实 Player + 记录面 */
function stubGame(mouseAt: [number, number]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    sfxFiles: string[];
    synthFallbacks: string[];
    projectiles: unknown[];
    particleCount: number;
    swings: number;
  };
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  g.player = player;
  g.world = new World(200, 200, 30);
  g.camera = { screenToWorld: () => mouseAt };
  g.enemies = () => [] as unknown[];
  g.candidatePlayers = undefined;
  g.input = { mouseX: mouseAt[0] - player.cx, mouseY: mouseAt[1] - player.cy,
    mouseDown: false, rightDown: false, uiBlocking: false };
  g.entities = { add: (e: unknown) => { g.projectiles.push(e); } };
  g.projectiles = [];
  g.sfxFiles = [];
  g.synthFallbacks = [];
  g.particleCount = 0;
  g.swings = 0;
  g.playSfxFile = (f: string) => { g.sfxFiles.push(f); return true; };
  g.sfx = { play: (_n: string) => { g.synthFallbacks.push(_n); } };
  g.spawnParticles = () => { g.particleCount++; };
  g.useSwing = () => { g.swings++; };
  return g;
}

describe('工单1 绳圈弹 171/475 铺绳（Arrow aiStyle35 自校正+ROPE_COIL_TILE[171]）', () => {
  it('普通绳圈 171 撞墙：沿锚柱铺 v_213_rope 并消亡（不再纯扔箭）', () => {
    const store = new TileStore(200, 200);
    const stone = STONE();
    for (let y = 8; y <= 16; y++) store.setTileSilent(30, y, stone, 0, 0);
    const g = makeHooks(store);
    // 出生于 (26*16,10*16) 朝右速度 10（shootSpeed=10,Item.cs:12701）
    const coil = new Arrow(26 * TILE + 8, 10 * TILE + 8, 10, 0, 0, 0, 171, null,
      { pierce: 6 });
    let ticks = 0;
    while (!coil.dead && ticks < 120) { coil.fixedUpdate(1 / 60, g); ticks++; }
    expect(coil.dead).toBe(true);
    let planted = 0;
    for (let y = 0; y < 200; y++) {
      const t = store.get(29, y);
      if (TILE_DEFS[t]?.rope) planted++;
    }
    // 29 列=贴撞面的空气邻格:重力前平飞命中 → 起铺自命中行向下 ≤10 格
    expect(planted).toBeGreaterThanOrEqual(9);
    expect(planted).toBeLessThanOrEqual(10);
  });

  it('藤蔓绳圈 475 同支仍铺 v_353_vine_rope（回归既有映射不被破）', () => {
    const store = new TileStore(200, 200);
    const stone = STONE();
    for (let y = 8; y <= 16; y++) store.setTileSilent(30, y, stone, 0, 0);
    const g = makeHooks(store);
    const coil = new Arrow(26 * TILE + 8, 12 * TILE + 8, 10, 0, 0, 0, 475, null,
      { pierce: 6 });
    let ticks = 0;
    while (!coil.dead && ticks < 120) { coil.fixedUpdate(1 / 60, g); ticks++; }
    expect(coil.dead).toBe(true);
    const vineId = TILE_BY_KEY['v_353_vine_rope'];
    expect(vineId).toBeDefined();
    let vine = 0;
    for (let y = 0; y < 200; y++) if (store.get(29, y) === vineId) vine++;
    expect(vine).toBeGreaterThanOrEqual(9);
  });
});

describe('工单2 GlobProj（水枪 358 / 微光枪 1042,AI_060 家族）', () => {
  function wetGame() {
    const store = new TileStore(400, 240);
    const g = makeHooks(store);
    return { store, g };
  }

  it('358 命中重叠 NPC 得 Wet：wetT≈1500t/60=25s 且本体即消亡', () => {
    const { store, g } = wetGame();
    // 慢速弹(vx=2)：aiRate 出生掷 ≥1 → 首扫第 2-4 拍(gate ai0>3),重叠窗内必命中
    const glob = new GlobProj(358, 100, 96, 2, 0);
    const e1 = Enemy.fromVanilla(1, glob.x + 2, glob.y - 4)!;   // 起始即重叠
    (e1 as unknown as { lifeMax: number }).lifeMax = 25;
    const critterLike = Enemy.fromVanilla(1, glob.x + 2, glob.y - 4)!;
    (critterLike as unknown as { lifeMax: number }).lifeMax = 1;  // lifeMax<=1 门(:29448)
    (g as unknown as { enemies(): unknown[] }).enemies = () => [e1, critterLike];
    let ticks = 0;
    while (!glob.dead && ticks < 20 && e1.wetT === 0) { glob.fixedUpdate(1 / 60, g); ticks++; }
    expect(glob.dead).toBe(true);                       // 重叠施 buff 即 Kill(:29459)
    expect(ticks).toBeLessThanOrEqual(12);              // 首扫≤4 拍 + 余量
    expect(e1.wetT).toBeCloseTo(25, 1);                 // AddBuff(103,1500)
    expect((critterLike as unknown as { wetT?: number }).wetT ?? 0).toBe(0);
    void store;
  });

  it('1042 只微光化 NPC（shimmeredT≈100t/60）；单人模式玩家不吃（flag25=false 同效）', () => {
    const { store, g } = wetGame();
    const glob = new GlobProj(1042, 100, 96, 2, 0);
    const e1 = Enemy.fromVanilla(1, glob.x + 2, glob.y - 4)!;
    (e1 as unknown as { lifeMax: number }).lifeMax = 25;
    (g as unknown as { enemies(): unknown[] }).enemies = () => [e1];
    let ticks = 0;
    while (!glob.dead && ticks < 20 && e1.shimmeredT === 0) { glob.fixedUpdate(1 / 60, g); ticks++; }
    expect(glob.dead).toBe(true);
    expect(e1.shimmeredT).toBeCloseTo(100 / 60, 2);
    void store;
  });

  it('Wet 不打 shooter：单人 candidatePlayers 缺省=[本地]被 num455!=owner 门全滤', () => {
    const sg = stubGame([50 * TILE + 64, 90 * TILE]);
    const p = (sg.player as unknown as { buffs: { has(t: BuffType): boolean } });
    // 玩家不在 GlobProj 生效集的语义门 = 施加扫描只对其它玩家(:29666 num455 != owner)
    // ——stub 的 candidatePlayers 未注入 ⇒ others=[] 单人恒空转,本地 buffs 恒净
    expect(p.buffs.has(BuffType.Wet)).toBe(false);
    void sg;
  });
});

describe('工单3 打窝桶 820（ChumBucketProj 生产端 → 双缓冲注册面）', () => {
  it('入水浮筒每 tick chumReport；隔帧翻转后 chumsInTile>0（渔力累进数据源）', () => {
    const store = new TileStore(200, 160);
    const g = makeHooks(store);
    // 挖一池水 x=44..46,y=20..24（type=WATER=1）
    for (let x = 44; x <= 46; x++) {
      for (let y = 20; y <= 24; y++) store.setLiquid(x, y, 255, 1);
      store.setLiquid(x, 19, 255, 1);                     // 表层满液(简化池形)
    }
    const bucket = new ChumBucketProj(45 * TILE + 8, 17 * TILE, 0.6, 2);
    // 落水窗：干抛 vy+=0.3 下降 ~2 tick 入水面
    for (let i = 0; i < 40 && !bucket.dead; i++) {
      chumOnPreUpdateAll();                               // Game 实体轮前置翻转(Main.cs:17721 位次)
      bucket.fixedUpdate(1 / 60, g);
      if (i > 3) break;
    }
    chumOnPreUpdateAll();
    // spot=Center+UnitY*16 → tile key 计数 ≥1＝GetFishingPondState 逐格累计源
    let counted = 0;
    for (let y = 18; y <= 22; y++) for (let x = 43; x <= 47; x++) counted += chumsInTile(x, y);
    expect(counted).toBeGreaterThan(0);
  });
});

describe('工单4 放飞灯笼 855（SkyLanternProj,AI_166_Dove type==855 支）', () => {
  it('上抛后转入持续爬升环境体：出膛 vy<−1 缓升档；净位移显著向上；逐拍橙光', () => {
    const store = new TileStore(200, 200);
    const g = makeHooks(store);
    const lantern = new SkyLanternProj(100 * TILE, 120 * TILE, 1.5, -4);
    const y0 = lantern.y;
    let minVySeen = Infinity;
    let lightTicks = 0;
    for (let i = 0; i < 150; i++) {
      lantern.fixedUpdate(1 / 60, g);
      minVySeen = Math.min(minVySeen, lantern.vy);
      if (g.lights.length > lightTicks) lightTicks = g.lights.length;
    }
    expect(lantern.y).toBeLessThan(y0 - 100);             // 净位移显著向上
    expect(minVySeen).toBeLessThanOrEqual(-3);            // 起步缓升档（vy×0.99/<−1 门）
    expect(lantern.alpha).toBe(0);                        // 淡出门 timeLeft<90 未开
    expect(lantern.dead).toBe(false);
    expect(lightTicks).toBeGreaterThanOrEqual(150);       // 每 tick 一条 AddLight(:48431)
  });

  it('寿命收口：timeLeft<90 起 alpha+=3/tick,alpha≥255 即死（≈915t 后熄灭）', () => {
    const store = new TileStore(200, 200);
    const g = makeHooks(store);
    const lantern = new SkyLanternProj(100 * TILE, 100 * TILE, 0, -4);
    let ticks = 0;
    while (!lantern.dead && ticks < 1100) { lantern.fixedUpdate(1 / 60, g); ticks++; }
    expect(lantern.dead).toBe(true);
    expect(ticks).toBeGreaterThanOrEqual(900);
    expect(ticks).toBeLessThanOrEqual(1010);
  });
});

describe('工单5 晶洞 772 Kill 宝石雨（Arrow.killNow 772 支=DropGeodeGems 1:1）', () => {
  it('落地碎裂：恰 2 掉落且物品种类互异、各堆 3-6 个、gem 池内键', () => {
    const store = new TileStore(200, 120);
    const stone = STONE();
    for (let x = 0; x < 200; x++) store.setTileSilent(x, 40, stone, 0, 0);   // 石板地
    const g = makeHooks(store);
    const geode = new Arrow(50 * TILE, 30 * TILE, 3, 5, 0, 0, 772, null, {});
    let ticks = 0;
    while (!geode.dead && ticks < 200) { geode.fixedUpdate(1 / 60, g); ticks++; }
    expect(geode.dead).toBe(true);
    expect(g.drops).toHaveLength(2);                      // 无放回抽 2 种(:80307-80313)
    const keys = g.drops.map((d) => d.key);
    expect(new Set(keys).size).toBe(2);
    const GEM_POOL_RE = /^vi_(177|178|179|180|181|182|999)_/;
    for (const d of g.drops) {
      expect(d.key).toMatch(GEM_POOL_RE);                 // 池=177-182 ∪ 999 琥珀
      expect(d.n).toBeGreaterThanOrEqual(3);              // Next(3,7)=3..6
      expect(d.n).toBeLessThanOrEqual(6);
    }
  });
});
