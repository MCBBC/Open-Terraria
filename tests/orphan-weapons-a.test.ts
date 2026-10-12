// 孤儿武器 A 波五件回归（2026-08-30，模型 tests/slime-gun.test.ts 桩）：
//   工单1 普通绳圈 985→弹171 铺绳（Arrow ROPE_COIL_TILE 171 扩表+aiStyle35 物理自校正）
//   工单2 水枪 2272→弹358 Wet(103)25s / 微光枪 5495→弹1042 只 NPC 微光化（GlobProj）
//   工单3 打窝桶 4608→弹820 入水 chum 上报（ChumBucketProj 生产端接通双缓冲注册面）
//         ＋A-5 复核驳回回归：撞实心驻留不摔碎（HandleMovement :18509 显式 type!=820
//         → if(flag) 链无一分支可达/无 Kill；岸上桶 spot=承托实心格,渔力消费端永不触及）
//         ＋A-6 视觉修：draw 按真资产 12×56 竖排 4 帧格切帧（projFrames[820]=4）
//   工单4 放飞灯笼 4702→弹855 飞升发光体（SkyLanternProj;vanilla 无环境灯注册面——
//         LanternSky 由 LanternNight.lanternsUp 驱动,与弹体两套系统,断言=升力+点光）
//   工单5 晶洞 4400→弹772 Kill 宝石雨（Arrow.killNow 772 支 DropGeodeGems 1:1）
// 锚点：Item.cs case 2272 :22877-22889 / case 5495 :43314-43329 / case 4608 :38234-38246
//       / case 4702 :38645-38650 / case 4400 :37357-37372；Projectile.cs AI_035 :27619
//       （num274 默认213）/AI_060 :29430-29700/AI_163 :54413-54547/AI_166_Dove
//       :48411-48500/Kill :76566-76608 + DropGeodeGems :80304-80316。
import { describe, it, expect, vi } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';
import { Arrow } from '../src/entities/Arrow';
import { GlobProj, pickGlobDustColor } from '../src/entities/GlobProj';
import { ChumBucketProj } from '../src/entities/ChumBucketProj';
import { SkyLanternProj } from '../src/entities/SkyLanternProj';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { VI } from '../src/data/itemKeys';
import { newWiresRadialState } from '../src/stats/wiresRadial';   // ★BJ572 面②:updateUse→tickWiresRadial 链读 this.wiresRadial（Object.create 桩绕过 ctor 字段初始化,缺位=flowerUpdate TypeError——残留普查波补桩）
import { projectileData } from '../src/data/vanillaProjectiles';
import { applyBuffTicks } from '../src/entities/projStatus';
import { isNpcShimmerImmune, npcShimmerTransformTo } from '../src/stats/Shimmer';
import { chumsInTile, chumOnPreUpdateAll } from '../src/entities/chumBucket';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { invIndexOfVanilla } from '../src/data/vanillaRecipes';
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
    damagePlayer: (): number => 0, addDamageNumber: () => {},
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

/** updateUse 可驱动的最小 Game 桩（X-F1 fresh-click 门回归；blue-r2 casterGame 同法
 *  ——真实 Player+Inventory，走 Game.updateUse 真实分派链而非直调私有处理器） */
function updUseGame(heldVid: number, stack = 1) {
  const g = Object.create(Game.prototype) as Record<string, any>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  const iidV = invIndexOfVanilla(heldVid);
  expect(iidV).toBeGreaterThanOrEqual(0);
  player.inv.add(iidV, stack);
  player.inv.selected = Math.max(0, player.inv.slots.findIndex((s) => s && s.id === iidV));
  g.player = player;
  g.world = new World(200, 200, 30);
  g.camera = {
    screenToWorld: () => [player.cx + 240, player.cy - 60],
    tileUnder: () => [80, 80],
  };
  g.enemies = () => [];
  g.candidatePlayers = undefined;
  g.housingMode = null;
  g.input = { mouseX: 500, mouseY: 300, mouseDown: false, rightDown: false,
    uiBlocking: false, downAction: () => false };
  g.entities = { projectiles: [] as unknown[], add(e: unknown) { this.projectiles.push(e); } };
  g.sfxFiles = [];
  g.synthFallbacks = [];
  g.playSfxFile = (f: string) => { g.sfxFiles.push(f as string); return true; };
  g.playSfxFiles = () => {};
  g.sfx = { play: (n: string) => { g.synthFallbacks.push(n); }, playWavFile: () => true };
  g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
  g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false },
    timeUiHover: false, weatherUiHover: false };
  g.smartCursor = { showing: false };
  g.annotateMode = false;
  g.wiresRadial = newWiresRadialState();   // ctor 类字段被 Object.create 绕过——updateUse→tickWiresRadial 必读
  g._wiresRadialPrevRight = false;
  g.prevSwingMouse = false;
  g.mining = null;
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g._prevMouseDown = false;
  g._prevRightDown = false;
  g.spawnParticles = () => {};
  g.useSwing = () => {};
  return { g, player };
}

/** 一拍使用（updateUse + 生产同款 _prevMouseDown 快照节奏——fixedUpdate 在 updateUse
 *  之后拍摄 :6106，故快照必须跟在调用后） */
function useBeat(g: Record<string, any>): void {
  g.updateUse(1 / 60);
  g._prevMouseDown = !!g.input.mouseDown;
}

describe('工单1 绳圈弹 171/475 铺绳（Arrow aiStyle35 自校正+ROPE_COIL_TILE[171]）', () => {
  it('普通绳圈 171 撞墙：沿锚柱铺 v_213_rope 并消亡（不再纯扔箭）', () => {
    const store = new TileStore(200, 200);
    const stone = STONE();
    for (let y = 8; y <= 16; y++) store.setTileSilent(30, y, stone, 0, 0);
    const g = makeHooks(store);
    // 出生于 (26*16,10*16) 朝右速度 10（shootSpeed=10,Item.cs:12701）
    const coil = new Arrow(26 * TILE + 8, 10 * TILE + 8, 10, 0, 0, 0, 171,
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
    const coil = new Arrow(26 * TILE + 8, 12 * TILE + 8, 10, 0, 0, 0, 475,
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

  // ---- 工单2 余料返还（红队 finding A-1）：Kill→Kill_ExplodeTiles 尾段按
  //      ai[1] 结算（P.cs:79303-79316）——0 铺绳 → 原圈 ×1；1≤ai[1]<10 →
  //      散绳 ×(10−ai[1])；满 10 无返还。锚点=RequestNewItem(base.Center)
  //      弹体消亡点（非投掷者），ReserveForLocalPlayer 仅归属不改落点。
  it('部分铺设 → 散绳 ×(10−placed)，锚点=绳尾消亡点（Projectile.cs:79303-79316）', () => {
    const store = new TileStore(200, 200);
    const stone = STONE();
    for (let y = 8; y <= 16; y++) store.setTileSilent(30, y, stone, 0, 0);
    // 底部挡板夹出恰 5 格可铺窗（row10..14）——平飞重力前命中 row10
    for (let x = 26; x <= 34; x++) store.setTileSilent(x, 15, stone, 0, 0);
    const g = makeHooks(store);
    expect(VI(965)).not.toBe('');            // 散绳件已注册
    expect(VI(985)).not.toBe('');            // 原圈件已注册
    const coil = new Arrow(26 * TILE + 8, 10 * TILE + 8, 10, 0, 0, 0, 171,
      { pierce: 6 });
    let ticks = 0;
    while (!coil.dead && ticks < 120) { coil.fixedUpdate(1 / 60, g); ticks++; }
    expect(coil.dead).toBe(true);
    let placed = 0;
    for (let y = 0; y < 200; y++) if (TILE_DEFS[store.get(29, y)]?.rope) placed++;
    expect(placed).toBe(5);
    expect(g.drops).toHaveLength(1);
    expect(g.drops[0].key).toBe(VI(965));
    expect(g.drops[0].n).toBe(5);            // 10 − placed
    // 锚点≈撞面/绳列顶端（col29-30·row10 邻域）而非投掷点 col26
    expect(g.drops[0].x).toBeGreaterThan(29 * TILE - 8);
    expect(g.drops[0].x).toBeLessThan(31 * TILE);
    expect(Math.abs(g.drops[0].y - 10.5 * TILE)).toBeLessThan(TILE + 4);
  });

  it('铺满 10 格不返还；不满则恰好差额（铺设量联动 :79312）', () => {
    const store = new TileStore(200, 200);
    const stone = STONE();
    for (let y = 8; y <= 16; y++) store.setTileSilent(30, y, stone, 0, 0);
    const g = makeHooks(store);
    const coil = new Arrow(26 * TILE + 8, 10 * TILE + 8, 10, 0, 0, 0, 171,
      { pierce: 6 });
    let ticks = 0;
    while (!coil.dead && ticks < 120) { coil.fixedUpdate(1 / 60, g); ticks++; }
    expect(coil.dead).toBe(true);
    let planted = 0;
    for (let y = 0; y < 200; y++) if (TILE_DEFS[store.get(29, y)]?.rope) planted++;
    expect(planted).toBeGreaterThanOrEqual(9);
    if (planted === 10) {
      expect(g.drops).toHaveLength(0);
    } else {
      expect(g.drops).toHaveLength(1);
      expect(g.drops[0].key).toBe(VI(965));
      expect(g.drops[0].n).toBe(10 - planted);
    }
  });

  it('空中未撞未铺，timeLeft 到期消亡 → 原圈件 ×1（:17307-17311 同达 Kill 口）', () => {
    // 600×500 全空图：平飞+重力下坠 ~5000px 也触不到边界/地物 → 必为寿命杀
    const store = new TileStore(600, 500);
    const g = makeHooks(store);
    const coil = new Arrow(30 * TILE + 8, 80 * TILE + 8, 2, 0, 0, 0, 171,
      { pierce: 6 });
    let lastCx = coil.cx; let lastCy = coil.cy;
    let ticks = 0;
    while (!coil.dead && ticks < 440) {
      coil.fixedUpdate(1 / 60, g); ticks++;
      lastCx = coil.cx; lastCy = coil.cy;
    }
    expect(coil.dead).toBe(true);
    expect(ticks).toBeGreaterThanOrEqual(395);   // 自然到期（原版 t400）
    expect(g.drops).toHaveLength(1);
    expect(g.drops[0].key).toBe(VI(985));        // 原圈自退,而非散绳
    expect(g.drops[0].n).toBe(1);
    // 消亡点=过期位置：返还紧跟弹体（base.Center 同语义）
    expect(Math.abs(g.drops[0].x - lastCx)).toBeLessThan(TILE * 2);
    expect(Math.abs(g.drops[0].y - lastCy)).toBeLessThan(TILE * 2);
  });

  it('丝绸/藤蔓/蛛网绳圈的散绳对号映射正确（Item.cs case 3005/3079/3080 shoot 对）', () => {
    expect(VI(3005)).not.toBe(''); expect(VI(2996)).not.toBe('');
    expect(VI(3079)).not.toBe(''); expect(VI(3077)).not.toBe('');
    expect(VI(3080)).not.toBe(''); expect(VI(3078)).not.toBe('');
  });
});

// ===========================================================================
// 红队 A-2 回归（蓝队单条,2026-08-30）：绳圈四弹通用投掷出口数值对齐。
//   原版 Item.damage=0 → Player.GetWeaponDamage 头 `if (damage <= 0) return
//   damage`（Player.cs:54059-54065）零伤【原样透传】不钳；弹 SetDefaults
//   penetrate=-1（P.cs:2572-2579 三型同段 / :5498 475 同值）；damage<=0 时
//   Projectile.Damage_PVE 头整段 return（P.cs:12576）＝纯铺绳工具零战斗面。
//   此前出口 Math.max(1,…)+(-1→6) 钳曾给绳圈白嫖 6×1 伤+触发 critters。
//   断言走真实 updateUse 分派链（updUseGame 桩,X-F1 先例）而非直构弹体——
//   覆盖发射面数值口径本身。修复沿革：曾以 ROPE_COIL_PROJS 四件特例直传（2026-08-30），
//   现已升级为通用式根治（2026-08-31）：出口改 GetWeaponDamage 原式——基伤≤0 原样
//   直传不乘区、penetrate raw 透传（去 -1→6 钳），特例表删除。绳圈四弹由通用式
//   自然覆盖；非零基伤件维持 min1×ranged 链（对照件锁定回归）。
//   受益面还有爱情/恶臭/微光气球/三地球仪/烟雾弹等（orphan-b1 B1-6 批断言）。
// ===========================================================================
describe('红队 A-2 绳圈通用出口数值（damage0 直传 + penetrate −1 保留原值）', () => {
  /** 经 updateUse 真实分派链发射并取出生弹（generic 分流产物 = Arrow 实例） */
  function shootGeneric(vid: number): Arrow {
    const { g } = updUseGame(vid, 3);
    g.input.mouseDown = true;
    useBeat(g);
    const projs = (g.entities.projectiles as unknown[]).filter((p) => p instanceof Arrow);
    expect(projs.length).toBeGreaterThanOrEqual(1);
    return projs[projs.length - 1] as Arrow;
  }

  it('数据面：绳圈四件 damage0/shoot 171|475|505|506，四弹 penetrate 全 -1', () => {
    for (const [vid, pid] of [[985, 171], [3005, 475], [3079, 505], [3080, 506]] as const) {
      expect(itemCombat(vid)?.shoot).toBe(pid);
      expect(itemCombat(vid)?.damage ?? -1).toBe(0);
      expect(projectileData(pid)?.penetrate).toBe(-1);
    }
  });

  it('985 普通绳圈：出口直传 damage 0、pierce=-1 保留原值（不再 6×1 白嫖伤）', () => {
    const p = shootGeneric(985);
    expect(p.projId).toBe(171);
    expect(p.damage).toBe(0);
    expect(p.pierce).toBe(-1);
  });

  it('藤 475 / 丝 505 / 蛛网 506 同支同值', () => {
    for (const [vid, pid] of [[3005, 475], [3079, 505], [3080, 506]] as const) {
      const p = shootGeneric(vid);
      expect(p.projId).toBe(pid);
      expect(p.damage).toBe(0);
      expect(p.pierce).toBe(-1);
    }
  });

  it('对照件不受影响：投刀 279 基伤>0 仍 min1×ranged 链 + penetrate2 raw 直读（非 -1 不涉放行）', () => {
    const p = shootGeneric(279);
    expect(p.projId).toBe(48);
    expect(itemCombat(279)?.damage).toBe(12);          // 数据面非零 ⇒ 出口乘区链应得 ≥1
    expect(p.damage).toBeGreaterThanOrEqual(1);
    expect(p.pierce).toBe(2);
  });

  it('命中面：damage0 绳圈与敌怪重叠零结算（Arrow 零伤门=Damage_PVE :12576 同构）', () => {
    const store = new TileStore(200, 200);
    const g = makeHooks(store);
    const e = Enemy.fromVanilla(1, 100, 96)!;
    (e as unknown as { lifeMax: number }).lifeMax = 25;
    e.hp = 25;
    const hurtCalls: number[] = [];
    (e as unknown as { hurt: (...a: unknown[]) => boolean }).hurt =
      (...a: unknown[]) => { hurtCalls.push(a[0] as number); return false; };
    (g as unknown as { enemies(): unknown[] }).enemies = () => [e];
    // 直接按出口终值构造（damage0/pierce−1）——物理自校正走 ctor 绳圈块
    const coil = new Arrow(100, 96, 2, 0, 0, 0, 171, { pierce: -1 });
    let ticks = 0;
    while (!coil.dead && ticks < 20 && hurtCalls.length === 0) { coil.fixedUpdate(1 / 60, g); ticks++; }
    expect(hurtCalls.length).toBe(0);                  // 重叠窗内零受击调用
    expect(e.hp).toBe(25);                             // 血量原封
  });

  it('critters 面：damage0 绳圈不再一击致死路遇小动物（Damage_PVE 头门=全 NPC 桶,:12576）', () => {
    const store = new TileStore(200, 200);
    const g = makeHooks(store);
    // critters 桶成员走 Critter.hurt(game) 单参兼容调用（Enemy.hurt 对象重映射 →
    // 固定 5 伤一击致死,proj-critter-hit.test.ts 约定）——此处自记 hurt 调用次数
    const c = { x: 100, y: 96, w: 20, h: 20, dead: false, hurtCalls: 0,
      hurt() { this.hurtCalls++; return true; } };
    (g as unknown as { critters(): unknown[] }).critters = () => [c];
    const coil = new Arrow(100, 96, 2, 0, 0, 0, 171, { pierce: -1 });
    let ticks = 0;
    while (!coil.dead && ticks < 20 && !(c as { dead: boolean }).dead) {
      coil.fixedUpdate(1 / 60, g); ticks++;
    }
    expect((c as unknown as { dead: boolean }).dead).toBe(false);
    expect((c as unknown as { hurtCalls: number }).hurtCalls).toBe(0);
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

  it('A-3 步进率：1042 ai[1] 恒 1.0（5495 发射专案显式传参）；358 保持 Next(10,31)×0.1 分布', () => {
    const rateOf = (p: GlobProj) => (p as unknown as { aiRate: number }).aiRate;
    // 微光枪：NewProjectile 特案表不含 1042（Projectile.cs :10910-10926 仅
    // 206/335/358/406）→ default 吃 Player.cs :49635-49641 的显式 ai1=1f,恒定
    for (let i = 0; i < 64; i++) expect(rateOf(new GlobProj(1042, 100, 96, 2, 0))).toBe(1);
    // 水枪：case 358 特案 rand(10,31)×0.1 ∈[1.0,3.0],十分位桶非退化分布
    const buckets = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const r = rateOf(new GlobProj(358, 100, 96, 2, 0));
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(3);
      buckets.add(r.toFixed(1));
    }
    expect(buckets.size).toBeGreaterThanOrEqual(5);
  });

  it('A-3 行为面：1042 施加门定拍打开——出生即重叠 ⇒ 首扫恰第 5 拍施 buff', () => {
    const { g } = wetGame();
    const glob = new GlobProj(1042, 100, 96, 2, 0);       // 恒率 1f：ai0 序列 0,1,2,3,4
    const e1 = Enemy.fromVanilla(1, glob.x + 2, glob.y - 4)!;
    (e1 as unknown as { lifeMax: number }).lifeMax = 25;
    (g as unknown as { enemies(): unknown[] }).enemies = () => [e1];
    let ticks = 0;
    while (!glob.dead && ticks < 20) { glob.fixedUpdate(1 / 60, g); ticks++; }
    expect(glob.dead).toBe(true);
    expect(ticks).toBe(5);                                // 门 `>3` 于 tick5 首真（358 为第 2-4 拍随机）
    expect(e1.shimmeredT).toBeGreaterThan(0);
  });

  it('Wet 不打 shooter：单人 candidatePlayers 缺省=[本地]被 num455!=owner 门全滤', () => {
    const sg = stubGame([50 * TILE + 64, 90 * TILE]);
    const p = (sg.player as unknown as { buffs: { has(t: BuffType): boolean } });
    // 玩家不在 GlobProj 生效集的语义门 = 施加扫描只对其它玩家(:29666 num455 != owner)
    // ——stub 的 candidatePlayers 未注入 ⇒ others=[] 单人恒空转,本地 buffs 恒净
    expect(p.buffs.has(BuffType.Wet)).toBe(false);
    void sg;
  });

  // ---- 蓝队 A-d324 复核修正回归（2026-09 蓝批）：原版 d324 色抽 =
  // switch(Main.rand.Next(6)) 非均匀四选一——尾迹逐粒 Projectile.cs:29740-29754 /
  // 1/4 补粒 :29764-29778 / Kill 尘爆 :75587-75601 三处同式；case0=(255,255,220)/
  // case1=(230,255,255)/case2=(255,210,255) 各 1 档(16.7%),default=(225,210,255)
  // 占 3 档(50%)——曾误写均匀 4 选 1(主色欠权 −33pp)。红队备选色 (140,140,225)/
  // (80,80,255)/(175,175,255) 经查 Projectile.cs 全文不存在。
  it('A-d324 权重金标：Next(6) 六桶映射 case0/1/2 各 1 桶、default 占 3 桶；无专档族保持均匀', () => {
    const C = ['rgba(255,255,220,', 'rgba(230,255,255,', 'rgba(255,210,255,', 'rgba(225,210,255,'] as const;
    const tally = [0, 0, 0, 0];
    for (let b = 0; b < 6; b++) {
      const got = pickGlobDustColor(C, [1, 1, 1, 3], () => (b + 0.5) / 6);   // ⇔ Next(6)=b
      tally[C.findIndex((c) => c === got)]++;
    }
    expect(tally).toEqual([1, 1, 1, 3]);                     // 主色恰半——非均匀的定罪面
    expect(pickGlobDustColor(C, [1, 1, 1, 3], () => 0)).toBe(C[0]);
    expect(pickGlobDustColor(C, [1, 1, 1, 3], () => 1 - 1e-12)).toBe(C[3]);   // 边界收尾
    // 358 的 d211 近似色对：原版无色抽开关 → 均匀路径不得被权重表误伤
    const D = ['rgba(130,185,255,', 'rgba(110,170,240,'] as const;
    expect(pickGlobDustColor(D, undefined, () => 0)).toBe(D[0]);
    expect(pickGlobDustColor(D, undefined, () => 0.99)).toBe(D[1]);
  });

  it('A-d324 接线：1042 尾迹 pick 吃 spec.trailWeights（钉 rand=0.40——加权命第三色、旧均匀会落第二色）', () => {
    const store = new TileStore(400, 240);
    const paints: string[] = [];
    const g = {
      ...makeHooks(store),
      spawnParticles: (_x: number, _y: number, color?: string) => { paints.push(color ?? ''); },
    } as unknown as GameHooks;
    const glob = new GlobProj(1042, 100, 96, 2, 0);
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => 0.4);
    try { glob.fixedUpdate(1 / 60, g); } finally { spy.mockRestore(); }
    expect(glob.dead).toBe(false);
    expect(paints).toHaveLength(6);                          // 每 tick 6×d324 尾迹
    // rand 恒 0.4：加权 roll=2.4 → colors[2]；若退回均匀 idx=floor(0.4*4)=1
    const prefixes = paints.map((c) => c.slice(0, 17));
    expect(new Set(prefixes).size).toBe(1);                  // 同掷同色
    expect(prefixes[0]).toBe('rgba(255,210,255,');
    expect(prefixes[0]).not.toBe('rgba(230,255,255,');       // 均匀回退可分辨位
  });
});

// ===========================================================================
// 工单2b X-F4 接线：buff 353（shimmeredT）并入微光变形链的消费面
//   原版单一系统（非"液体/弹体两套"）：buff 在身即 shimmering=true
//   （NPC.cs:93255-93265,免疫条目 :17870 buffImmune[353]=ShimmerImmunity[type]），
//   变形由透明度累计消费（:92634-92644,+0.01/t,严格 >0.9 于第 91 拍跨过 →
//   GetShimmered :92668 四分支），【不要求浸在池中】——液体只是施加端之一
//   （:94211-94218 TryAddingRepeatedBuff）。本仓 Enemy.fixedUpdate 以
//   shimmeredT>0 与 shimmerWet 并联驱动同一 shimmerT 累计器,共用唯一触发点；
//   100t=5/3s ≥ 91 拍 ⇒ 弹体满时长必触发一次；真实分支自清、空分支以
//   【清零 buff 位】剪掉原版逐拍空调用重入。
// ===========================================================================
describe('工单2b buff 353 消费接通（X-F4：Enemy 侧不要求浸池的变形触发）', () => {
  /** 干地小世界（全程实地、无任何液体——排除液体链干扰,纯弹体 buff 驱动）+ 夜钉 */
  function dryGame() {
    const w = new World(60, 256, 11, 'orphan-dry-shimmer');
    const st = w.store;
    for (let x = 10; x < 46; x++) st.setTile(x, 40, 1);    // 高空台面：落点即稳态
    return { w };
  }

  function hooks(w: World, p: Player) {
    const cnt = { dust: 0 };
    const enemies: Enemy[] = [];
    return {
      h: {
        world: w, player: p,
        enemies: () => enemies, critters: () => [], npcs: () => [],
        entities: { add: () => {} },                      // EoC 二阶段召仆通道(:11557)
        spawnDrop: () => null,
        damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
        onEnemyKilled: () => {}, spawnEnemy: () => {},
        spawnParticles: () => { cnt.dust++; }, notifyInventoryChanged: () => {},
        playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
      } as unknown as GameHooks,
      enemies, cnt,
    };
  }

  function fireSpy(): { spy: { mock: { calls: unknown[][] } }; restore: () => void } {
    const spy = vi.spyOn(Enemy.prototype as unknown as
      { npcGetShimmered: (...a: unknown[]) => void }, 'npcGetShimmered');
    return {
      spy: spy as unknown as { mock: { calls: unknown[][] } },
      restore: () => spy.mockRestore(),
    };
  }

  it('僵尸(3)得 100t 弹体 buff：91±拍内变形为 21,buff 位归零,全窗仅触发一次（不要求浸池）',
    () => {
      const { w } = dryGame();
      const p = new Player(45 * TILE, 36 * TILE, new Inventory());
      const { h, enemies } = hooks(w, p);
      const e = Enemy.fromVanilla(3, 30 * TILE, 37 * TILE)!;
      enemies.push(e);
      expect(e.vanillaId).toBe(3);
      expect(isNpcShimmerImmune(3)).toBe(false);           // 非免表才进链
      applyBuffTicks(e as unknown as Parameters<typeof applyBuffTicks>[0], 353, 100);  // GlobProj 1042 同施加路
      expect(e.shimmeredT).toBeCloseTo(100 / 60, 5);
      const { spy, restore } = fireSpy();
      let crossed = -1;
      try {
        for (let i = 0; i < 200 && crossed < 0; i++) {
          e.fixedUpdate(1 / 60, h);
          if (e.vanillaId !== 3) crossed = i;
        }
        // 原版累计语义 = 连续第 91 拍跨过 0.9（0.91>0.9 严格不等式）;容 ±4 拍调度噪声
        expect(crossed).toBeGreaterThanOrEqual(87);
        expect(crossed).toBeLessThanOrEqual(95);
        expect(e.vanillaId).toBe(npcShimmerTransformTo(3));   // ShimmerTransformToNPC 直达
        for (let i = 0; i < 80 && !e.dead; i++) e.fixedUpdate(1 / 60, h);   // 后续窗口
        expect(spy.mock.calls.length).toBe(1);             // 触发恰一次（原版逐拍重入被剪）
        expect(e.shimmeredT).toBe(0);                      // 用后清零防重入
      } finally { restore(); }
    });

  it('无转化表且非免表的 NPC（EoC 4）：到阈 GetShimmered 空调用只此一次——清零剪掉原版逐拍重放',
    () => {
      const { w } = dryGame();
      w.clock.timeOfDay = 0.9;                             // 钉夜间:排除 AI_005 白天上飞 Despawn(:51302)
      const p = new Player(40 * TILE, 36 * TILE, new Inventory());
      const { h, enemies } = hooks(w, p);
      const e = Enemy.fromVanilla(4, 30 * TILE, 26 * TILE)!;
      enemies.push(e);
      expect(isNpcShimmerImmune(4)).toBe(false);
      expect(npcShimmerTransformTo(4)).toBe(-1);           // 无 NPC 转化项
      applyBuffTicks(e as unknown as Parameters<typeof applyBuffTicks>[0], 353, 100);
      const { spy, restore } = fireSpy();
      try {
        let liveTicks = 0;
        for (let i = 0; i < 300 && !e.dead; i++) {
          e.fixedUpdate(1 / 60, h);
          if (!e.dead) liveTicks++;
        }
        expect(liveTicks).toBeGreaterThanOrEqual(120);     // 活体覆盖 ≥ 阈值窗+重放余量
        expect(spy.mock.calls.length).toBe(1);             // 原版此处≈逐拍空调用至 buff 走完
        expect(e.vanillaId).toBe(4);                       // 无表项 → 空操作不变形
        expect(e.dead).toBe(false);
      } finally { restore(); }
    });

  it('免表 NPC（克苏鲁之仆 5）：施加位照写但消费侧 ShimmerImmunity 门拦截,零触发零累计', () => {
    const { w } = dryGame();
    w.clock.timeOfDay = 0.9;
    const p = new Player(40 * TILE, 36 * TILE, new Inventory());
    const { h, enemies } = hooks(w, p);
    const e = Enemy.fromVanilla(5, 30 * TILE, 36 * TILE)!;
    enemies.push(e);
    // 原版 ApplyBuff→AddBuff 的 buffImmune[353] 门在施加入口(表内无 353 条目;
    // 登记差异:本仓 applyBuffTicks 不读 ShimmerImmunity)——终态等价靠消费门兜底
    applyBuffTicks(e as unknown as Parameters<typeof applyBuffTicks>[0], 353, 100);
    expect(e.shimmeredT).toBeGreaterThan(0);
    const { spy, restore } = fireSpy();
    try {
      for (let i = 0; i < 200 && !e.dead; i++) e.fixedUpdate(1 / 60, h);
      expect(spy.mock.calls.length).toBe(0);
      expect(e.shimmerT).toBe(0);                          // 累计器未动
      expect(e.vanillaId).toBe(5);
      expect(e.dead).toBe(false);
    } finally { restore(); }
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

  // ★A-5 复核驳回（2026-08-30 红队 finding"撞实心即 Kill"不成立）：
  // HandleMovement 碰撞响应 if(flag) 链 :18097..:18509 十九支,末支条件显式
  // `type != … && type != 820 && aiStyle != 160…`(:18509-18510,1456 同构 :16986)——
  // 排除后对 820 无一分支可达,链内层 else `position+=velocity; Kill();`(:19964-19967,
  // 藏于 :18747 type!=308&&377&&966 支的子链,红队误引 :19952-19955)同属死路。
  // 撞实心的实际效果 = TileCollision 把撞面分量清零 → 贴面驻留,Kill 只走
  // timeLeft=86400 自然衰减(AI_163 无 Kill;ai[0]>=10 才钳 timeLeft=60 缩没)。
  it('干抛撞地驻留不摔碎（:18509 显式排除 820 → 无 Kill 分支可达）；底缘钉合块面零漂移', () => {
    const store = new TileStore(200, 120);
    const g = makeHooks(store);
    for (let x = 20; x <= 90; x++) store.setTileSilent(x, 36, STONE(), 0, 0);   // 干地石台
    const bucket = new ChumBucketProj(50 * TILE, 26 * TILE, 0.8, 2);
    let t = 0;
    while (!bucket.dead && t < 200) { chumOnPreUpdateAll(); bucket.fixedUpdate(1 / 60, g); t++; }
    expect(bucket.dead).toBe(false);                    // 驻留原版真态（非摔碎）
    expect(bucket.y + bucket.h).toBeCloseTo(36 * TILE, 4);   // 底缘恰贴格顶（面钳）
    const restY = bucket.y;
    for (let k = 0; k < 100; k++) { chumOnPreUpdateAll(); bucket.fixedUpdate(1 / 60, g); }
    expect(bucket.y).toBe(restY);                       // 静置零漂移（无锯齿回跳）
  });

  it('岸上桶白吃渔力不成立：上报照发但落点=承托实心格，GetFishingPondState 液格行走永不触及；入水对照照常入池', () => {
    const store = new TileStore(200, 120);
    const g = makeHooks(store);
    for (let x = 20; x <= 90; x++) store.setTileSilent(x, 36, STONE(), 0, 0);              // 底盘石台
    for (let c = 40; c <= 45; c++) for (let r = 30; r <= 35; r++) store.setLiquid(c, r, 255, 1); // 池
    const shore = new ChumBucketProj(56 * TILE, 28 * TILE, 0.6, 2);   // 扔岸边（干地）
    const pond = new ChumBucketProj(43 * TILE, 24 * TILE, 0.05, 2);   // 对照：扔进池里
    for (let t = 0; t < 90 && (!shore.dead || !pond.dead); t++) {
      chumOnPreUpdateAll();
      shore.fixedUpdate(1 / 60, g);
      pond.fixedUpdate(1 / 60, g);
    }
    chumOnPreUpdateAll();
    const sxK = Math.floor(shore.cx / TILE), syK = Math.floor((shore.cy + 16) / TILE);
    const pxK = Math.floor(pond.cx / TILE), pyK = Math.floor((pond.cy + 16) / TILE);
    expect(chumsInTile(sxK, syK)).toBeGreaterThanOrEqual(1);   // 上报照发（AI_163 :54539 无 wet 门,vanilla 同态）
    expect(store.isSolid(sxK, syK)).toBe(true);                // ……但 spot 恰落承托实心格
    // 复刻消费端行走规则（Bobber.getFishingPondState ~ Projectile.cs:20180-20201/21716-21728）:
    // 横扩与纵行都只走 liquid>0 且非实心格
    const liq = (i: number, j: number) =>
      store.inBounds(i, j) && store.liquid[store.idx(i, j)] > 0 && !store.isSolid(i, j);
    let topRow = -1;                                           // 锚行动态取池顶液面
    for (let r = 10; r < store.h && topRow < 0; r++) if (liq(43, r)) topRow = r;
    expect(topRow).toBe(30);
    let minX = 43, maxX = 43;
    while (minX > 10 && liq(minX, topRow)) minX--;
    while (maxX < store.w - 10 && liq(maxX, topRow)) maxX++;
    let counted = 0;
    const seen = new Set<string>();
    for (let i = minX; i <= maxX; i++) {
      for (let j = topRow; j < store.h - 10 && liq(i, j); j++) {
        seen.add(`${i},${j}`);
        counted += chumsInTile(i, j);
      }
    }
    expect(counted).toBeGreaterThanOrEqual(1);                 // 入水对照桶计入渔力池
    expect(seen.has(`${pxK},${pyK}`)).toBe(true);              // 对照 spot 在液格行走集内
    expect(seen.has(`${sxK},${syK}`)).toBe(false);             // 岸上 spot 永不可能入池（实心格不入走集）
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
    const geode = new Arrow(50 * TILE, 30 * TILE, 3, 5, 0, 0, 772, {});
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

  // ---- 蓝队 A-7 复核修正回归（2026-09）：原版 Kill 宝石尘 NewDustDirect 显式
  // SpeedX=SpeedY=0（Projectile.cs:76575/:76584）——初速=Dust.NewDust 内建抖动
  // Next(-20,21)×0.1（Dust.cs:174-175,本仓 VanillaDust.spawn 同式已实现），经
  // v×2.9/Y×0.8 终值 ≤±5.8/±4.64。曾错把循环里对【弹体】的 velocity×1.9 六连写
  // （:76571 死码——Kill 无下游读者）当尘种速再乘 2.9 ⇒ 数百 px/t 一帧暴闪。
  it('A-7 宝石尘种速归零：27 枚种速恒 0、钉rand 抖动终值 5.8/4.64、fadeIn=1.1、第二段 7 枚 noLight', () => {
    const store = new TileStore(200, 120);
    for (let x = 0; x < 200; x++) store.setTileSilent(x, 40, STONE(), 0, 0);
    type Rec = { t: number; sx: number; sy: number };
    type DustLike = { vx: number; vy: number; scale: number;
      noGravity: boolean; noLight: boolean; fadeIn: number };
    const rec: Rec[] = [];
    const dusts: DustLike[] = [];
    const g = {
      ...makeHooks(store),
      spawnDust: (_x: number, _y: number, _w: number, _h: number, type: number,
        sx = 0, sy = 0) => {
        void _x; void _y; void _w; void _h;
        const jit = ((Math.random() * 41 | 0) - 20) * 0.1;   // NewDust 内建抖动记录面
        rec.push({ t: type, sx, sy });
        const d: DustLike = { vx: jit + sx, vy: jit + sy, scale: 1,
          noGravity: false, noLight: false, fadeIn: 0 };
        dusts.push(d);
        return d;
      },
    } as unknown as GameHooks;
    const geode = new Arrow(50 * TILE, 30 * TILE, 3, 5, 0, 0, 772, {});
    // 钉 rand=0.99 ⇒ 每粒内建抖动恰取上界桶 +2.0（(0.99*41|0−20)*0.1）
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => 0.99);
    try {
      (geode as unknown as { killNow(h: GameHooks): void }).killNow(g);   // 直击 Kill 单点
    } finally {
      spy.mockRestore();
    }
    const ones = rec.filter((r) => r.t === 1);
    expect(ones).toHaveLength(6);                            // :76570 尘 1 ×6（原样保留段）
    expect(ones.every((r) => r.sx === 0 && r.sy === 0)).toBe(true);
    const gemIdx = rec.map((r, i) => (r.t >= 86 && r.t <= 90 ? i : -1)).filter((i) => i >= 0);
    expect(gemIdx).toHaveLength(27);                         // 20(:76573)+7(:76582)
    for (const [k, i] of gemIdx.entries()) {
      expect(rec[i].sx).toBe(0);                             // ★A-7 主断言：种速恒零
      expect(rec[i].sy).toBe(0);
      const d = dusts[i];
      expect(d.noGravity).toBe(true);                        // :76576/:76585
      expect(d.fadeIn).toBe(1.1);                            // :76580/:76589（red 备注补项）
      expect(d.noLight).toBe(k >= 20);                       // :76590 第二段 7 枚
      expect(d.vx).toBeCloseTo(5.8, 6);                      // 2.0×2.9——终值上界(旧路径数百)
      expect(d.vy).toBeCloseTo(4.64, 6);                     // 再 Y×0.8
    }
  });
});

// ---------------------------------------------------------------------------
// X-F1 fresh-click 门回归（⑩ 边沿统一批）：A 波分派缺 `_prevMouseDown` 电沿门时，
// input.mouseDown 是粘滞电平（touchend 才清）→ 按住 LMB 每 useTime 周期连掷
// 打窝桶/天灯/晶洞（consumable 白耗库存）。原版语义 = 非 autoReuse 件必须松手再点
// （TryingToUseItem 门 itemAnimation==0 && !Main.mouseLeftRelease 即拒,P.cs:24518-24523;
// autoReuse 豁免走 releaseUseItem 支 Player.cs:53518-53528）。
describe('X-F1 fresh-click 门（A 波 ⑩ 边沿：首按下帧才触发）', () => {
  it('数据面：A 波五件 autoReuse 与 Item.cs SetDefaults 一致（2272:22888 / 5495:43326 =true 豁免；4608/4702/4400 无该行=false）', () => {
    expect(itemCombat(2272)?.autoReuse ?? false).toBe(true);
    expect(itemCombat(5495)?.autoReuse ?? false).toBe(true);
    expect(itemCombat(4608)?.autoReuse ?? false).toBe(false);
    expect(itemCombat(4702)?.autoReuse ?? false).toBe(false);
    expect(itemCombat(4400)?.autoReuse ?? false).toBe(false);
  });

  it('打窝桶 4608：按住第二拍不再触发（库存不白耗）；松手重按才再次投掷+消耗', () => {
    const { g, player } = updUseGame(4608, 3);
    g.input.mouseDown = true;
    useBeat(g);                                           // 拍1：首按下边沿 → 发射+消耗
    const projs1 = g.entities.projectiles as unknown[];
    expect(projs1).toHaveLength(1);
    expect(projs1[0]).toBeInstanceOf(ChumBucketProj);
    expect(player.inv.slots[0]!.stack).toBe(2);           // consumable 恰耗 1
    player.useTime = 0;                                   // 快进：动画窗走完仍按住
    useBeat(g);                                           // 拍2：粘滞电平被 ⑩ 门拒
    expect(g.entities.projectiles as unknown[]).toHaveLength(1);
    expect(player.inv.slots[0]!.stack).toBe(2);           // ★库存停止白耗
    g.input.mouseDown = false;
    useBeat(g);                                           // 松手拍（原版 mouseLeftRelease 置位）
    g.input.mouseDown = true;
    useBeat(g);                                           // 重按拍 → 再次投掷
    expect((g.entities.projectiles as unknown[])).toHaveLength(2);
    expect(player.inv.slots[0]!.stack).toBe(1);
  });

  it('水枪 2272 autoReuse=true 豁免：按住跨窗口连发两弹（门不得误伤电平武器）', () => {
    const { g, player } = updUseGame(2272);
    g.input.mouseDown = true;
    useBeat(g);
    expect((g.entities.projectiles as GlobProj[])[0]).toBeInstanceOf(GlobProj);
    player.useTime = 0;
    useBeat(g);                                           // 按住第二拍：autoReuse 豁免放行
    expect((g.entities.projectiles as GlobProj[])[1]).toBeInstanceOf(GlobProj);
    expect((g.entities.projectiles as GlobProj[])[1].projId).toBe(358);
  });
});
