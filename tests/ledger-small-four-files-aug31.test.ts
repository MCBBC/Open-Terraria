// 台账清偿·四小件群回归锚（2026-08-31 批，docs/audit/approx-registry-2026-08-31.md）：
//   Mounts      —— ①滚轴鞋 RollerSkateMovement 两改（减速带 accRun−1f + 空中门 flag2）
//                  ③movementStatsAdditive 叠加支（Player.cs:26836-26853/:19744-19755）
//                  ②圣坦炮击 930：SantankShellProj 归航/穿透/触墙引信/128×128 爆散
//                  C 猪鲨崽液色光透明档 / 扫帚挂件露天 ×1 档 / 仙灵武库 61 点光
//   WhipProj    —— ⑤鞭臂位 GetArmPosition 锚（Main.OffsetsPlayerOnhand 链）
//                  ⑥1104 wet 盒级 WetCollision 出生快照（弹心格近似退役）
//   SwingArc    —— ⑦刃线命中 CheckAABBvLineCollision 原式 + _lanceHitboxBounds 过靶门
//   lunar_misc  —— ⑧石碑 526 真弹归巢实体 / ⑨月总水蛭源弹插值起点 / ⑩宝箱怪态3
//                  全弹反射扫描+逐拍复位 / ⑪飞蛾魔同 tick 重摇选招
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Enemy } from '../src/entities/Enemy';
import {
  mountRollerSkateStep, MountInstance, MountShot, SantankShellProj,
  ORIGINAL_RUN_SPEED, mountLights,
} from '../src/entities/Mounts';
import { WhipProj, OFFSETS_PLAYER_ONHAND } from '../src/entities/WhipProj';
import { ZenithSword } from '../src/entities/SwingArc';
import {
  moonLeechAI, bigMimicAI, reflectPlayerProjsInHitbox, TabletShardProj, mothronAI,
} from '../src/entities/bossAI_lunar_misc';
import { MoonLeechProj } from '../src/entities/bossAI_duke_moonlord';
import { TILE } from '../src/core/constants';

// ---- 测试世界/玩家（tests/mounts.test.ts 同款 harness） ----
const fakeHooks = (w: World, p?: Player) => ({
  world: w, player: p, enemies: () => [], critters: () => [],
  spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
  cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
  spawnParticles: () => {}, notifyInventoryChanged: () => {}, playSfx: () => {},
  playSfxFiles: () => {}, showPickupLabel: () => {},
});
const mkWorld = (): World => {
  const w = new World(80, 120, 72, 'small4');
  for (let x = 20; x <= 60; x++) w.store.setTileSilent(x, 80, 1);
  return w;
};

afterEach(() => vi.restoreAllMocks());

describe('① 滚轴鞋 RollerSkateMovement 两改（1458 Player.cs:28736-28778）', () => {
  it('movementStatsAdditive 仅滚轴鞋 57-60 为真', () => {
    const m = new MountInstance();
    m.active = true;
    for (const t of [57, 58, 59, 60]) {
      m.type = t;
      expect(m.movementStatsAdditive).toBe(true);
    }
    m.type = 10;
    expect(m.movementStatsAdditive).toBe(false);   // 独角兽非 additive 族
    m.active = false;
  });

  it('减速带 = accRun−1f（随上限缩放,旧字面 6.5 已废）', () => {
    // vx=−3、地面无输入、accRun=6：带内 → Lerp(vx, sign·1.6, .3)=−2.58 单拍收敛档
    const r = mountRollerSkateStep(-3, 0, true, false, 6, 6, 0.2, 1.6, false);
    expect(r.dampedVx).toBeDefined();
    expect(Math.abs((r.dampedVx ?? 0) - (-2.58))).toBeLessThan(1e-9);
    // 空中且超低速带（|vx|=4>3 空中门 false）不改写 vx（:28752 门语义）
    const air = mountRollerSkateStep(-4, -1, true, false, 6, 6, 0.2, 1.6, false);
    expect(air.dampedVx).toBeCloseTo(-4, 12);
    // 大上限（accRun=9）同值仍收敛 —— 带顶缩放语义生效（与旧 6.5f 固定档相异）
    const wide = mountRollerSkateStep(-3, 0, true, false, 9, 9, 0.2, 1.6, false);
    expect(wide.dampedVx).toBeCloseTo(-2.58, 9);
  });

  it('空中门 flag2 = vy==0 || |vx|≤originalRunSpeed(3)', () => {
    expect(ORIGINAL_RUN_SPEED).toBe(3);
    // 空中低速（|vx|≤3）仍收敛 :28752 后半支：lerp(2.5→1.6,.3)=2.23
    const lowAir = mountRollerSkateStep(2.5, -1, true, false, 6, 6, 0.2, 1.6, false);
    expect(lowAir.dampedVx).toBeCloseTo(2.23, 9);
    // 低速收尾段（|vx|<1.5）：lerp 后 0.04×0.7≈0.028 < 0.03 → 归零（float 路径同原版）
    const tiny = mountRollerSkateStep(0.04, 0, true, false, 6, 6, 0.2, 1.6, false);
    expect(tiny.dampedVx).toBe(0);
  });

  it('runSlowdown 尾钳 clamp(|vx|−max(maxRun,accRun),0,slow)，沥青特支 ×2.25/×1.6', () => {
    // 巡航态：|vx|≈max(maxRun,accRun)=7 → clamp≈0 → HM 地面摩擦停摆（滑行本质）
    const cruise = mountRollerSkateStep(7, 0, false, false, 7, 7, 0.2, 1.6, false);
    expect(cruise.runSlow).toBe(0);
    expect(cruise.dampedVx).toBeUndefined();       // 有输入不走阻尼带
    // 超帽回落：余量 0.5 被 clamp 上界(runSlowIn=0.2)截断 → 取 0.2 全摩擦
    const over = mountRollerSkateStep(7.5, 0, false, false, 7, 7, 0.2, 1.6, false);
    expect(over.runSlow).toBeCloseTo(0.2, 12);
    // 沥青特支（:28767-28772）：maxRun'=10×2.25=22.5；余量段上限 slow×1.6=0.32
    const pw = mountRollerSkateStep(17, 0, false, false, 8.3, 10, 0.2, 1.6, true);
    expect(pw.runSlow).toBe(0);
    const pwOver = mountRollerSkateStep(24, 0, false, false, 8.3, 10, 0.2, 1.6, true);
    expect(pwOver.runSlow).toBeCloseTo(0.32, 9);
  });
});

describe('② 圣坦炮击 930 —— SantankShellProj（SetDefaults :8819 / AI_016 :48067-48180）', () => {
  it('判定盒 14×14 且 ai[0]>30 后向索敌目标收敛', () => {
    const w = mkWorld();
    const shell = new SantankShellProj(400, 400, 0, -4, 120, 0, 930);
    expect(shell.w).toBe(14); expect(shell.h).toBe(14);
    const enemy = { id: 7, x: 700, y: 300, w: 30, h: 40, dead: false, maxHp: 500,
      def: {}, hurt: vi.fn(() => true) };
    const game = Object.assign(fakeHooks(w), {
      enemies: () => [enemy],
      projectiles: () => [],
      spawnDust: undefined, spawnBurst: undefined, playSfxFile: () => true,
      vanillaDust: undefined,
    }) as never;
    // 前 15 tick（30 子步）无归航直飞；此后 velocity 向目标 lerp
    let before = Math.hypot(shell.vx, shell.vy);
    shell.fixedUpdate(1 / 60, game);
    for (let i = 0; i < 40; i++) {
      shell.x = 400 - shell.w / 2 + i * 0.01;      // 保持远离 tile 触发（空地）
      shell.fixedUpdate(1 / 60, game);
    }
    const dxT = enemy.x + enemy.w / 2 - (shell.x + shell.w / 2);
    const dyT = enemy.y + enemy.h / 2 - (shell.y + shell.h / 2);
    const align = (shell.vx * dxT + shell.vy * dyT) /
      ((Math.hypot(shell.vx, shell.vy) || 1) * (Math.hypot(dxT, dyT) || 1));
    expect(before).toBeGreaterThan(0);
    expect(align).toBeGreaterThan(0.9);            // 收敛指向目标
  });

  it('penetrate=−1：命中不死、per-target 免工件窗限频', () => {
    const w = mkWorld();
    const shell = new SantankShellProj(400, 400, 0, -4, 120, 0, 930);
    const enemy = { id: 7, x: 395, y: 420, w: 30, h: 40, dead: false, maxHp: 500,
      def: {}, hurt: vi.fn(() => true) };
    const game = Object.assign(fakeHooks(w), {
      enemies: () => [enemy], projectiles: () => [], spawnDust: undefined,
      spawnBurst: undefined, playSfxFile: () => true,
    }) as never;
    for (let i = 0; i < 40; i++) shell.fixedUpdate(1 / 60, game);
    const calls = enemy.hurt.mock.calls.length;
    expect(shell.dead).toBe(false);                // 无限穿透
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(calls).toBeLessThanOrEqual(5);          // per-target 免工件窗(10t)限频
  });

  it('触墙引信相 timeLeft=3 → Kill 时 128×128 重盒爆散伤敌', () => {
    const w = mkWorld();
    // 弹道终点贴地（tile 80 行实心）
    const shell = new SantankShellProj(432, 79 * TILE, 0, 2, 120, 0, 930);
    const far = { id: 9, x: 600, y: 1220, w: 20, h: 30, dead: false, maxHp: 500,
      def: {}, hurt: vi.fn(() => true) };
    const near = { id: 8, x: 480, y: 1225, w: 20, h: 30, dead: false, maxHp: 500,
      def: {}, hurt: vi.fn(() => true) };
    let shards: TabletShardProj[] = [];
    const game = Object.assign(fakeHooks(w), {
      enemies: () => [far, near], projectiles: () => [], spawnDust: undefined,
      spawnBurst: (_x?: number, _y?: number) => undefined,
      playSfxFile: () => true,
    }) as never;
    let fuseTicks = 0;
    for (let i = 0; i < 400 && !shell.dead; i++) {
      if (shell.explodedAlpha && (shell as unknown as { fuse: number }).fuse >= 0) fuseTicks++;
      shell.y += 1.5;                              // 押送到地表防浮点静止悬置
      shell.fixedUpdate(1 / 60, game);
    }
    expect(fuseTicks).toBeLessThanOrEqual(3);      // lingering 引信 ≤3 拍
    expect(shell.dead).toBe(true);
    expect(near.hurt).toHaveBeenCalled();          // 落入 128×128 重盒
    expect(far.hurt).not.toHaveBeenCalled();       // 重盒外不结算
    void shards;
  });
});

describe('⑤ 鞭臂位锚 —— Player.GetArmPosition（Player.cs:51206-51225 + Main.cs:506）', () => {
  const mkWhip = (): WhipProj =>
    new WhipProj(0, 0, 0, 841, 4672, 14, 1, 30, 4, () => null);

  it('Offhand 表原值在场且表尺寸=20', () => {
    expect(OFFSETS_PLAYER_ONHAND.length).toBe(20);
    expect(OFFSETS_PLAYER_ONHAND[0]).toEqual([6, 19]);
  });

  it('玩家锚=Onhand 行偏移合成，非盒心（挥动首帧行1 → MCx−10/MCy+5）', () => {
    const w = mkWorld();
    const p = new Player(30 * TILE, 78 * TILE, new Inventory());
    const whip = new WhipProj(0, 0, 0, 841, 4672, 14, 1, 30, 4, () => p);
    const pts = whip.pointsAt(0, true);
    // ai0=0（挥动窗头段 meleeThirdOf→'head'）→ bodyFrame 行1 onhand=(5,10)：
    // x = MCx − w/2 + (2hx − (40−w)/2)；y = MCy − 21 + (2hy − (56−42)/2)
    const expX = p.cx - 10 + (OFFSETS_PLAYER_ONHAND[1][0] * 2 - 10);
    const expY = p.mountedCenter.y - 21 + (OFFSETS_PLAYER_ONHAND[1][1] * 2 - 7);
    expect(pts[0].x).toBeCloseTo(expX, 6);
    expect(pts[0].y).toBeCloseTo(expY, 6);
    expect(expX).not.toBeCloseTo(p.cx, 0);          // 锚偏离中心（旧近似=恒盒心）
  });

  it('朝向镜像对称：左右锚点关于玩家中心 x 对称', () => {
    const w = mkWorld();
    const p = new Player(30 * TILE, 78 * TILE, new Inventory());
    p.facing = 1;
    const r = new WhipProj(0, 0, 0, 841, 4672, 14, 1, 30, 4, () => p)
      .pointsAt(0, true)[0];
    p.facing = -1;
    const l = new WhipProj(0, 0, Math.PI, 841, 4672, 14, 1, 30, 4, () => p)
      .pointsAt(0, true)[0];
    expect(l.x + r.x).toBeCloseTo(2 * p.cx, 6);
    expect(l.y).toBeCloseTo(r.y, 6);
  });
});

describe('⑥ 1104 湿旗盒级 WetCollision 出生快照', () => {
  const shallowWorld = (): World => {
    const w = mkWorld();
    // 地面上方一格浅水（水量 208 → drop=(48/32)*2=3，水面带 top=j·16+3）
    w.store.setTileSilent(40, 81, 0);
    w.store.liquid[w.store.idx(40, 81)] = 208;
    return w;
  };

  it('盒级 WetCollision 探针命中水面带（1104 wet 消费源）', async () => {
    const { wetCollisionProbe } = await import('../src/entities/MinionProj');
    const w = shallowWorld();
    // 18×18 盒心内探针下缘触及水面段 [1299, 1312)——盒缘浸液即湿
    const y = 81 * TILE - 10;
    const wet = wetCollisionProbe(
      w.store as unknown as Parameters<typeof wetCollisionProbe>[0],
      40 * TILE, y, 18, 18);
    expect(wet).toBe(true);
  });
});

describe('⑦ 刃线命中 CheckAABBvLineCollision 原式（Collision.cs:275-371）', () => {
  const S = ZenithSword as unknown as { segHitsRectVanilla: (...a: number[]) => boolean };
  it('贯穿命中 / 平行偏移未中 / 端部矩形几何', () => {
    // 水平线 y=100 穿过盒(90,90)-(110,110)
    expect(S.segHitsRectVanilla(0, 100, 200, 100, 90, 90, 20, 20, 20)).toBe(true);
    // 平行远线 miss
    expect(S.segHitsRectVanilla(0, 160, 200, 160, 90, 90, 20, 20, 20)).toBe(false);
    // 半宽扩张救回：y=115 线宽 20（半宽 10）恰好擦到盒底缘 ry+rh=110+10=120 边界内
    expect(S.segHitsRectVanilla(0, 119, 200, 119, 90, 90, 20, 20, 20)).toBe(true);
    // 端外象限（x<线起点,|dy|=25>hw）：胶囊旧式含圆帽可能误报,原式矩形不含 x<0 带
    expect(S.segHitsRectVanilla(-30, 0, -5, 100, 90, 90, 20, 20, 20)).toBe(false);
  });

  it('_lanceHitboxBounds 300×300 过靶门先行截短（Projectile.cs:498/:15641）', () => {
    const z = new ZenithSword(
      { x: -16, y: -21, w: 32, h: 42, cx: 0, cy: 0, facing: 1, dead: false },
      50, 50, 40, 757);
    (z as unknown as { rot: number }).rot = 0;
    (z as unknown as { counter: number }).counter = 1;
    (z as unknown as { trail: number[] }).trail = [];
    // 敌怪中心距采样位 >150px——刃本体 ±40 打不到，过靶闸亦拦
    const zb = z as unknown as { bladeHits: (ex: number, ey: number, ew: number, eh: number) => boolean };
    expect(zb.bladeHits(280, -10, 20, 20)).toBe(false);
    // 盒内近距：rot=0 → 刃向竖直（rot+π/2），贯穿中心竖线命中
    expect(zb.bladeHits(-10, -10, 20, 20)).toBe(true);
  });
});

describe('⑧ 石碑仪式余烬 526 —— TabletShardProj（Projectile.cs AI_098 :33746-33766）', () => {
  it('归巢至目标并在抵靶处消散（vel>距 即 Kill）', () => {
    const shard = new TabletShardProj(100, 100, 0, 0, 130, 130);
    const spawnedDust: number[] = [];
    const game = {
      world: { store: { isSolid: () => false } },
      spawnDust: () => ({ noGravity: false, scale: 1, x: 0, y: 0 }),
      enemies: () => [], particles: () => {},
      spawnParticles: (x: number, y: number) => spawnedDust.push(x + y),
    } as unknown as Parameters<TabletShardProj['fixedUpdate']>[1];
    for (let i = 0; i < 60 && !shard.dead; i++) shard.fixedUpdate(1 / 60, game);
    expect(shard.dead).toBe(true);
    // 抵靶消散位置落在目标邻域（velLen≈15 > dist 终结）
    expect(Math.hypot(shard.cx - 130, shard.cy - 130)).toBeLessThan(16);
  });

  it('尾迹 = 每 tick 2×d228（noGravity、scale+=rand）', () => {
    const shard = new TabletShardProj(0, 0, 0, 0, 400, 400);
    const dusts: Array<{ type: number; scale: number }> = [];
    const game = {
      world: { store: { isSolid: () => false } },
      spawnDust: (_x: number, _y: number, _w: number, _h: number, type: number) => {
        const d = { type, scale: 1, x: 0, y: 0, noGravity: false };
        dusts.push(d);
        return d;
      },
      enemies: () => [],
      spawnParticles: () => {},
    } as unknown as Parameters<TabletShardProj['fixedUpdate']>[1];
    shard.fixedUpdate(1 / 60, game);
    expect(dusts.length).toBe(2);
    expect(dusts.every((d) => d.type === 228)).toBe(true);
  });
});

describe('⑨ 月总水蛭插值起点接真源弹 456（NPC.cs aiStyle82 :37090-37093）', () => {
  const leechHarness = () => {
    const w = mkWorld();
    const head = new Enemy('head', 1000, 1000);
    head.vanillaId = 396;
    head.ai3 = head.id;                          // 核心索引挂头自身,治疗序不触发死亡
    const proj = new MoonLeechProj(head, { cx: 800, cy: 900 } as never);
    proj.x = 500; proj.y = 520;                  // 回程途中当帧位
    const game = Object.assign(fakeHooks(w), {
      enemies: () => [head],
      projectiles: () => [proj],
      spawnParticles: () => {},
    }) as never;
    return { head, proj, game };
  };

  it('bInit 配对认领源弹并以其实时位为插值起点', () => {
    const { head, proj, game } = leechHarness();
    const e = new Enemy('moonLeechClot', 0, 0);
    e.vanillaId = 401;
    e.ai0 = head.id + 1;
    e.ai2 = 0;
    e.bInit = false;
    // 第一 tick：k=1/90，若锚定源弹 → 位置几乎贴着 proj 当帧心
    moonLeechAI(e, game, null);
    const k = 1 / 90;
    const expX = (proj.x + proj.w / 2) * (1 - k) + head.cx * k;
    const expY = (proj.y + proj.h / 2) * (1 - k) + (head.cy + 216) * k;
    expect(e.cx).toBeCloseTo(expX, 6);
    expect(e.cy).toBeCloseTo(expY, 6);
  });

  it('源弹逐帧位移带动插值起点（起飞点跟随）', () => {
    const { head, proj, game } = leechHarness();
    const e = new Enemy('moonLeechClot', 0, 0);
    e.vanillaId = 401;
    e.ai0 = head.id + 1;
    moonLeechAI(e, game, null);
    proj.x = 300; proj.y = 340;                  // 源弹回程推进
    moonLeechAI(e, game, null);
    const k = 2 / 90;
    const expX = 308 * (1 - k) + head.cx * k;    // 300+w/2
    expect(e.cx).toBeCloseTo(expX, 6);
  });
});

describe('⑩ 宝箱怪态3 反射管线（NPC.cs :37851/:37966-37982/:67189-67212）', () => {
  const stubEnemy = (): Enemy => {
    const e = new Enemy('mimic', 100, 100);
    e.w = 60; e.h = 40;
    e.reflectsProjectiles = true;
    return e;
  };
  const reflectableProj = (over: Record<string, unknown>) => ({
    x: 110, y: 105, w: 10, h: 10, vx: -6, vy: 0, damage: 48,
    hostile: false, reflected: false, projId: 1,   // 木箭 aiStyle1 ∈ REFLECTABLE_AI_STYLES
    ...over,
  });

  it('全弹扫描：盒内可反射弹被反向归属（hostile=true、伤 ÷2÷2）', () => {
    const w = mkWorld();
    const e = stubEnemy();
    const p = reflectableProj({});
    const untouched = reflectableProj({ x: 900, y: 900 });     // 盒外不反射
    const nonReflectable = reflectableProj({ damage: 0 });     // CanBeReflected 伤 0 门
    const game = Object.assign(fakeHooks(w), {
      player: new Player(700, 1060, new Inventory()),   // reflectProjectile 朝发射者向
      projectiles: () => [p, untouched, nonReflectable],
    }) as never;
    reflectPlayerProjsInHitbox(game, e);
    expect(p.hostile).toBe(true);                              // 反射后转敌弹
    expect(p.damage).toBe(12);                                 // floor(floor(48/2)/2)
    expect(p.reflected).toBe(true);
    expect(p.vx).toBeGreaterThan(0);                           // 偏向回打发射者(玩家在侧)
    expect(untouched.hostile).toBe(false);
    expect(nonReflectable.hostile).toBe(false);
  });

  it('reflectsProjectiles 逐拍复位（aiStyle87 头段 :37851）', () => {
    const w = mkWorld();
    const e = stubEnemy();
    e.ai0 = 7;                                                 // 玩家灭隐身态（最短路径）
    const game = Object.assign(fakeHooks(w), { enemies: () => [e] }) as never;
    bigMimicAI(e, game, null);
    expect(e.reflectsProjectiles).toBe(false);                 // 不再闩锁常真
  });
});

describe('⑪ 飞蛾魔同 tick 重摇选招（NPC.cs aiStyle88 :38328-38348）', () => {
  /** 石墙隔断视线（losClear=false → pick0 无效须重摇） */
  const walledWorld = (): World => {
    const w = mkWorld();
    for (let y = 58; y <= 76; y++) w.store.setTileSilent(37, y, 1);
    (w as unknown as { clock: { eclipse: boolean } }).clock.eclipse = true;
    return w;
  };
  const harness = (world: World) => {
    const e = new Enemy('mothron', 500, 1020);
    e.vanillaId = 477;
    e.w = 46; e.h = 50;
    e.x = 400; e.y = 1020;
    e.vx = 0; e.vy = 0;
    e.ai0 = 0;
    e.ai1 = 179;                          // 180t 到点拍（justHit 为派生 getter 只读）
    const p = new Player(700, 1060, new Inventory());
    p.x = 700; p.y = 1060;
    return { e, p, game: fakeHooks(world, p) as never };
  };

  it('掷出恒无效招（pick0 无视线）→ 同 tick 反复重摇（护栏 <100 次）', () => {
    const { e, p, game } = harness(walledWorld());
    let draws = 0;
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      draws++;
      return 0.05;                      // 恒 pick=0，视线被石墙阻断 → 无效持续重摇
    });
    mothronAI(e, game, p);
    // 旧"单帧一次近似"每 tick 只掷 1 次；重摇式应远超 1 且护栏封顶
    expect(draws).toBeGreaterThan(50);
    expect(draws).toBeLessThanOrEqual(101);
    expect(e.ai0).toBe(0);              // 全程无有效落招
    spy.mockRestore();
  });

  it('180t 到点必落招（pick=2 卵未满直落态4）', () => {
    const { e, p, game } = harness(walledWorld());
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.99);   // pick=2
    mothronAI(e, game, p);
    expect(e.ai0).toBe(4);
    spy.mockRestore();
  });
});

describe('C 档 · mountLights 三处补齐', () => {
  const baseView = () => ({
    x: 0, y: 0, w: 20, h: 42, vx: 0, vy: 0, onGround: true, inWater: false,
    facing: 1, inputX: 0, inputJump: false, inputUp: false, inputDown: false,
    prevInputJump: false, gravDir: 1, store: null,
  });
  const lightsOf = (type: number, ctxExtra: Record<string, unknown>,
    mut?: (m: MountInstance) => void) => {
    const m = new MountInstance();
    m.active = true;
    m.type = type;
    mut?.(m);
    return mountLights(m, baseView(), {
      liquidColor: [9, 61, 191], worldSurface: 72, ...ctxExtra,
    } as never);
  };

  it('猪鲨崽 12：液色透明档 → 光贡献归零（Colors.cs:97-120 Transparent）', () => {
    expect(lightsOf(12, { liquidColor: null }, (m) => { m.fishronBoost = true; }).length).toBe(0);
    const lit = lightsOf(12, {}, (m) => { m.fishronBoost = true; });
    expect(lit.length).toBeGreaterThan(0);
    expect(lightsOf(12, {}).length).toBe(0);          // 无增益态本就无灯
  });

  it('扫帚 23：露天档位改变挂件位（windExposed → num3=1f,:3597-3602）', () => {
    // 风摆项对 wind 幅值线性（num2 ∝ WindForVisuals）——大风的露天 ×1 与室内 ×0.5
    // 档在挂件角上分档，连续相位内必有落格差
    let differ = false;
    for (let mc = 0; mc < 900 && !differ; mc += 3) {
      const ctx = { wind: 8, miscCounter: mc };
      const indoor = lightsOf(23, ctx);
      const outdoor = lightsOf(23, { ...ctx, windExposed: true });
      if (indoor.length > 0) {
        differ = indoor.some((l, i) => l.tx !== outdoor[i].tx || l.ty !== outdoor[i].ty);
      }
    }
    expect(differ).toBe(true);
  });

  it('仙灵武库 61：中心格点光 = hslToRgb(0.91,1,.5)×lerpWhite.1×0.55（:3670-3673）', () => {
    const ls = lightsOf(61, {});
    expect(ls.length).toBe(1);
    const l = ls[0];
    expect(l.tx).toBe(0);                             // 中心格
    expect(l.r).toBeGreaterThan(0.3);
    expect(l.g).toBeLessThan(0.08);
    expect(l.b).toBeGreaterThan(0.15);
    expect(l.b).toBeLessThan(0.5);
  });
});
