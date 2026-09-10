// SW-BJ48 2026-09-09 传送药水 2351 随机落点回归（用户实报「应该传送到随机位置,
// 现在只能和回忆药水类似被传回出生点」）。
// 金标：Terarria1457/Terraria/Player.cs:56922-56968 TeleportationPotion →
//       Terraria/Utils.cs:518-647 CheckForGoodTeleportationSpot（avoidLava/avoidHurtTiles/
//       maxFall=100/attempts=1000,strictRange/avoidWalls/mostlySolidFloor=false）；
//       X 掷域 [100,maxTilesX-99]、Y 掷域 [100,maxTilesY-99]（XNA Right=L+W;rangeY=
//       Main.UnderworldLayer=maxTilesY-200,Main.cs:2886=地狱排除）；失败 fallback=
//       Teleport(position,2)【原地】
//       （:56956-56966,非取消非出生点）；Teleport(·,2) → TeleportEffect style2
//       （Main.cs:13454-13462：50×尘 58 GhostWhite α150 scale1.2 vel×0.5,无音效臂）。
//       回忆药水对照：Player.cs:43438-43470（2350,itemTime==20 → Spawn(RecallFromItem)
//       出生点+保留无敌帧+UseSound Item6）。Item.cs:23655-23664（2351 useStyle9/
//       useTime17/UseSound Item6/无 buffType=药水病面零接触）。1458 同域核对：
//       Player.cs TeleportationPotion(:56925)/Utils.cs:518-647 diff=same（仅行偏移+3）。
// 根因：Game.ts 路由 ternary 缺 2351 臂 → 误落 RecallKind 'spawn' 支=与回忆药水同路；
//       随机链整缺。修=补 'random' 支（fireRecallTeleport+requestTeleportationPotionSpot）
//       走 IIIIII110b 逐句移植核 world/gen/vanilla/TeleportSpotCheck.ts（与
//       RandomizeWorldSpawn 同源,像素盒/wall87/地牢墙臂/下坠/四向逃逸探针全量）。
// 判别力（变异实验,双向证红）：OLD 语义（2351→'spawn'）下
//   ①分布测试「8 用 ≥5 独立锚格」恒只 1 落点=红；
//   ②全岩浆 fallback 测试 OLD 把玩家挪去出生点,新行为=原地不动+照耗——位置不动断言红；
//   ③sfx/尘型判别：2350 fire 响 'mirror'+青尘 15 系,2351 fire 零音+尘 58×100——
//     互换任一面即红。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';
import { ITEM_DEFS } from '../src/data/items';
import { Player } from '../src/entities/Player';
import { VanillaDust } from '../src/fx/VanillaDust';
import { solidCollisionPx, lavaCollisionPx, checkForGoodTeleportationSpot } from '../src/world/gen/vanilla/TeleportSpotCheck';
import { seededRandom } from './seeded-rng';

// ── 桩件（BJ43 sw-bj43-conch-landing.stubGame 同法;Object.create 不跑构造器,
//      仅装配被测支消费的实例域——any 型桩,避免 Player/Camera 全形装配） ──
/* eslint-disable @typescript-eslint/no-explicit-any */
type Stub = {
  g: any;
  sfxLog: string[];
  state: { removed: number; grapplesCleared: number; particles: number; uwScans: number };
};

function stubGame(world: World, playerPos = { x: 100 * TILE, y: 120 * TILE }): Stub {
  const g = Object.create(Game.prototype) as any;
  const state = { removed: 0, grapplesCleared: 0, particles: 0, uwScans: 0 };
  g.world = world;
  g.player = {
    x: playerPos.x, y: playerPos.y, vx: 3, vy: 0, w: 20, h: 42,
    iframes: 0, fallStartY: null, team: 0,
    cx: playerPos.x + 10, cy: playerPos.y + 21,
    inv: { removeHeld: (n: number) => { state.removed += n; } },
    removeAllGrapplingHooks: () => { state.grapplesCleared++; },
    // ★SW-RB10a：fireRecallTeleport 尾接 DoUnbreakableWallScan（Teleport :37733）
    updateUnbreakableWallScan: () => { state.uwScans++; },
    equipStats: { fireWalk: false },
    buffs: null,
  };
  g.camera = { x: 0, y: 0 };
  g.cb = {};
  g.net = null;
  g.spectatingSlot = -1;
  g.lastStripReq = '';
  g.vanillaDust = new VanillaDust();               // Object.create 不跑构造器 → 手工灌池
  const sfxLog: string[] = [];
  g.sfx = { play: (k: string) => { sfxLog.push(k); } };
  g.spawnParticles = () => { state.particles++; }; // recallDust 载体（2350 对照面）
  return { g, sfxLog, state };
}

function paintRect(st: TileStore, x0: number, x1: number, y0: number, y1: number, type: number): void {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) st.setTileSilent(x, y, type);
}
function paintLiquid(st: TileStore, x0: number, x1: number, y0: number, y1: number, amount: number, lt: number): void {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) st.setLiquid(x, y, amount, lt);
}

const FIRE_RANDOM = { vid: 2351, kind: 'random' as const, triggerAt: 2, consume: true };
const FIRE_RECALL = { vid: 2350, kind: 'spawn' as const, triggerAt: 20, consume: true };

beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(0x6A48)); });
afterEach(() => { vi.restoreAllMocks(); });

describe('SW-BJ48 传送药水 2351 随机落点（Player.cs:56922/Utils.cs:518 金标）', () => {
  it('真世界·6 种子 8 连用：掷域/落位安全面/落点分布（OLD=spawn 恒 1 落点=红）', async () => {
    const seeds = ['bj48-a', 'bj48-b', 'bj48-c', 'bj48-d', 'bj48-e', 'bj48-f'];
    for (const seedText of seeds) {
      const world = await generateWorld({ width: 2000, height: 700, seedText });
      const st = world.store;
      const { g } = stubGame(world);
      const anchors = new Set<string>();
      for (let k = 0; k < 8; k++) {
        const hit = (g as unknown as { requestTeleportationPotionSpot(): { x: number; y: number } | null })
          .requestTeleportationPotionSpot();
        expect(hit, `${seedText} #${k} 应找到落点`).not.toBeNull();
        const ax = (hit!.x + 2) / 16;                  // vector.X = anchorX*16 − 2（offX=-10+8）
        const ay = (hit!.y + 42) / 16;                 // feet 钉格顶（vector.Y+H=anchorY*16）
        expect(Number.isInteger(ax) && Number.isInteger(ay), `${seedText} #${k} 落点钉格`).toBe(true);
        // X = 掷域原值（无下坠）：[100, w-99]（Utils.cs:533 Next(Left,Right+1),XNA
        //   Right=L+W=100+(w-200)+1=w-99 → [100,w-99];strictRange=false 不拒多出列）
        expect(ax).toBeGreaterThanOrEqual(100);
        expect(ax).toBeLessThanOrEqual(st.w - 99);
        // Y 落点 = 掷域 [100,h-99] + 下坠 ≤99 格（Utils.cs:556-582）→ 只能断带宽域;
        //   掷域常量本身由下方 rng 录制测试钉死
        expect(ay).toBeGreaterThanOrEqual(100);
        expect(ay).toBeLessThanOrEqual(st.h);
        // 安全面：落位盒非实心/无岩浆 + 脚底格实心（下坠循环 break 条件,Utils.cs:577）
        expect(solidCollisionPx(st, hit!.x, hit!.y, 20, 42), `${seedText} #${k} 盒应无实心`).toBe(false);
        expect(lavaCollisionPx(st, hit!.x, hit!.y, 20, 42), `${seedText} #${k} 盒应无岩浆`).toBe(false);
        const feet = st.idx(Math.trunc(ax), Math.trunc(ay));
        expect((st.flags[feet] & 1) !== 0, `${seedText} #${k} 脚底格 active`).toBe(true);
        anchors.add(`${Math.trunc(ax)},${Math.trunc(ay)}`);
      }
      // 分布判别力：OLD（2351→'spawn'）8 用全同点=1 独立锚
      expect(anchors.size, `${seedText} 8 用应 ≥5 独立落点（OLD 回出生点=1）`).toBeGreaterThanOrEqual(5);
    }
  }, 1200000);

  it('合成·地板带：下坠搜索落地板 + 避岩浆柱（Utils.cs:556-582 下坠臂 + avoidLava 臂）', () => {
    const w = new World(300, 240, 7, 'bj48-syn1');
    w.groundLevel = 128;
    const st = w.store;
    const stone = TILE_BY_KEY['stone'];
    expect(TILE_DEFS[stone]?.vanilla?.sheet).toBe(1);
    paintRect(st, 100, 200, 150, 152, stone);        // 地板带 y=150..152
    paintLiquid(st, 100, 150, 138, 149, 255, LIQUID_TYPE.LAVA);   // 左半岩浆池（盖住落位盒带）
    const { g } = stubGame(w);
    for (let k = 0; k < 10; k++) {
      const hit = (g as unknown as { requestTeleportationPotionSpot(): { x: number; y: number } | null })
        .requestTeleportationPotionSpot();
      expect(hit, `#${k} 应落地板`).not.toBeNull();
      const ax = (hit!.x + 2) / 16, ay = (hit!.y + 42) / 16;
      expect(ay, `#${k} 应落地板顶 y=150`).toBe(150);           // 下坠搜索到实心底
      expect(ax, `#${k} 应避开岩浆柱列`).toBeGreaterThan(150);   // avoidLava（Utils.cs:596）
      expect(lavaCollisionPx(st, hit!.x, hit!.y, 20, 42)).toBe(false);
    }
  });

  it('合成·全岩浆域 1000 次全败 → fallback 原地照走+照耗（:56956-56966,非取消非出生点）', () => {
    const w = new World(300, 240, 7, 'bj48-syn2');
    w.groundLevel = 128;
    const st = w.store;
    paintLiquid(st, 0, 299, 90, 239, 255, LIQUID_TYPE.LAVA);      // 掷域全域岩浆
    const px0 = 120 * TILE, py0 = 130 * TILE;
    const { g, sfxLog, state } = stubGame(w, { x: px0, y: py0 });
    g.resolvePlayerSpawnPoint = () => [w.spawnX0, w.spawnY0];      // OLD 语义参照点
    expect((g as unknown as { requestTeleportationPotionSpot(): { x: number; y: number } | null })
      .requestTeleportationPotionSpot()).toBeNull();
    (g as unknown as { fireRecallTeleport(c: typeof FIRE_RANDOM): void }).fireRecallTeleport({ ...FIRE_RANDOM });
    const p = g.player as { x: number; y: number; vx: number; vy: number; fallStartY: unknown };
    expect(p.x, '原地不动（Teleport(position,2)）').toBe(px0);
    expect(p.y).toBe(py0);
    expect(p.vx).toBe(0); expect(p.vy).toBe(0);                   // velocity=Zero（:56962）
    expect(p.fallStartY, 'fallStart 重置（Teleport :37730）').toBeNull();
    expect(state.removed, '照耗（item.stack-- :43519 在 TeleportationPotion 之外恒走）').toBe(1);
    expect(state.grapplesCleared, 'RemoveAllGrapplingHooks（Teleport :37704 Style!=10）').toBe(1);
    expect(sfxLog, 'style2 无音效臂（Main.cs:13454-13462）').toEqual([]);
    // 判别力：OLD（→'spawn'）会把玩家挪去 spawnPlacementCoords 落点 ≠ 原地 → 红
    const oldDest = (g as unknown as { spawnPlacementCoords(p: unknown): [number, number] })
      .spawnPlacementCoords(g.player);
    expect(oldDest[0] !== px0 || oldDest[1] !== py0, 'OLD 参照应与原地相异（判别力自证）').toBe(true);
  });

  it('合成·fire 面 2350 vs 2351 判别：音效/尘型/钩爪/落点源', () => {
    const w = new World(300, 240, 7, 'bj48-syn3');
    w.groundLevel = 128;
    const st = w.store;
    const stone = TILE_BY_KEY['stone'];
    paintRect(st, 100, 200, 150, 152, stone);
    w.spawnX0 = 150; w.spawnY0 = 149; w.spawnX = 150; w.spawnY = 149;
    // —— 2351 随机臂：零音 + 尘 58×100（Entry/Exit 各 50）+ 落点=随机域
    const r1 = stubGame(w, { x: 130 * TILE, y: 140 * TILE });
    r1.g.resolvePlayerSpawnPoint = () => [w.spawnX0, w.spawnY0];
    (r1.g as unknown as { fireRecallTeleport(c: typeof FIRE_RANDOM): void }).fireRecallTeleport({ ...FIRE_RANDOM });
    const p1 = r1.g.player as { x: number; y: number };
    expect(r1.sfxLog, '2351 fire 零音效').toEqual([]);
    const dust = (r1.g.vanillaDust as VanillaDust);
    const act = dust['pool'].filter((d: { active: boolean }) => d.active);
    const d58 = act.filter((d: { type: number }) => d.type === 58);
    expect(d58.length, 'TeleportEffect style2 = 50×2 份尘 58').toBe(100);
    // ★SW-RB10a：色面=Color.GhostWhite(248,248,255,255) 0-255 域 + dust.alpha=150
    //  （Dust.cs NewDust(…,58,0,0,150,Color.GhostWhite,1.2f) 双参分立——58 型 GetColor
    //  着色面只认 color 域,alpha 是 dust.alpha 数据位）
    expect(d58[0].color, 'style2 色=GhostWhite 0-255 域').toEqual({ r: 248, g: 248, b: 255, a: 255 });
    expect(d58[0].alpha, 'dust.alpha=150（NewDust α 参）').toBe(150);
    expect(d58[0].scale, 'scale≈1.2×NewDust 抖（0.8..1.2 档）').toBeGreaterThanOrEqual(0.9);
    expect(d58[0].scale).toBeLessThanOrEqual(1.5);
    expect(r1.state.uwScans, 'DoUnbreakableWallScan 落点即扫（Teleport :37733）').toBeGreaterThan(0);
    const ax1 = (p1.x + 2) / 16, ay1 = (p1.y + 42) / 16;
    expect(ay1, '2351 落地板（非出生点面）').toBe(150);
    expect([Math.trunc(ax1), Math.trunc(ay1)]).not.toEqual([150, 150]);   // 非出生柱（150 出生柱被 OLD 占据语义）
    expect(r1.state.removed, '2351 消耗').toBe(1);
    expect(r1.state.particles, '2351 不走 recallDust 载体').toBe(0);
    // —— 2350 回忆臂：'mirror' 音 + 青尘 15 系载体 + 落点=出生点（OLD 面保持不动,回归对照）
    const r2 = stubGame(w, { x: 130 * TILE, y: 140 * TILE });
    r2.g.resolvePlayerSpawnPoint = () => [w.spawnX0, w.spawnY0];
    (r2.g as unknown as { fireRecallTeleport(c: typeof FIRE_RECALL): void }).fireRecallTeleport({ ...FIRE_RECALL });
    const p2 = r2.g.player as { x: number; y: number };
    expect(r2.sfxLog, '2350 fire = HeldItem.UseSound（:42444）').toEqual(['mirror']);
    expect(p2.x, '2350 落出生点臂（spawnPlacementCoords +8 锚）').toBe(150 * TILE + 8);
    expect(r2.state.particles, '2350 双 70 青尘走 recallDust').toBe(140);
    expect(r2.state.removed, '2350 消耗').toBe(1);
  });

  it('掷域常量 1:1（Player.cs:56924-56928）：X=Next(100,w-98) Y=Next(100,h-98) attempts=1000', () => {
    // 录制 rng 实参,钉死 TeleportationPotion 传参面（startX=100/rangeX=maxTilesX-200/
    // startY=100/rangeY=UnderworldLayer=maxTilesY-200）+ settings（avoidLava/avoidHurtTiles/
    // maxFall=100/attempts=1000,Utils.cs:56929-56937）。
    const w = new World(300, 240, 7, 'bj48-dom');
    w.groundLevel = 128;
    const st = w.store;
    const stone = TILE_BY_KEY['stone'];
    paintRect(st, 45, 260, 130, 132, stone);          // 全域地板,确保受理
    const calls: Array<[number, number]> = [];
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(0xB48D0));
    const res = checkForGoodTeleportationSpot(st,
      { nextIntRange: (a, b) => { calls.push([a, b]); return a + Math.floor(Math.random() * (b - a)); } },
      {
        teleporteeW: 20, teleporteeH: 42,
        avoidLava: true, avoidHurtTiles: true,
        maximumFallDistanceFromOrignalPoint: 100, attemptsBeforeGivingUp: 1000,
      },
      100, st.w - 200, 100, st.h - 200,
      { worldSurface: 128, rockLevel: 200, downedPlantBoss: false, downedBoss3: false,
        dualDungeonsSeed: false, getGoodWorld: false, dontStarveWorld: false });
    expect(res.canSpawn).toBe(true);
    expect(calls.length, '受理即止=每 attempt 恰 2 掷').toBeGreaterThanOrEqual(2);
    expect(calls.length % 2).toBe(0);
    // X 掷：Next(rect.Left=100, rect.Right+1)——Right=100+(w-200)+1=w-99 → 上参 w-98
    for (let i = 0; i < calls.length; i += 2) {
      expect(calls[i]).toEqual([100, st.w - 98]);
      // Y 掷：Next(rect.Top=100, rect.Bottom+1)——Bottom=100+(h-200)+1=h-99 → 上参 h-98
      expect(calls[i + 1]).toEqual([100, st.h - 98]);
    }
  });

  it('★SW-RB10a 触发环 1:1（itemTime==2 等值拍 + item.type 身份门）：换栏后触发拍不响不消耗、过窗清道', () => {
    // vanilla：`if (item.type == 2351 && itemAnimation > 0) … else if (itemTime == 2)
    //   { TeleportationPotion(); …; item.stack--; }`（:43502-43520）——item=inventory
    //   [selectedItem] 触发拍现值。中途换栏后 item.type≠2351 → 该拍不响不消耗。
    const w = new World(300, 240, 7, 'bj48-syn4');
    w.groundLevel = 128;
    const potionId = ITEM_DEFS.findIndex((d: { key?: string }) => !!d.key?.startsWith('vi_2351_'));
    expect(potionId, 'vi_2351 注册在案').toBeGreaterThan(0);
    const otherId = ITEM_DEFS.findIndex((d: { key?: string }) => !!d.key && !d.key.startsWith('vi_2351_') && !!d.key.startsWith('vi_'));
    // ①触发拍 + 持物=2351 → fire
    const a = stubGame(w);
    const firedA: unknown[] = [];
    a.g.fireRecallTeleport = (c: unknown) => firedA.push(c);
    a.g.player.inv.heldItem = () => ({ id: potionId });
    a.g.recallChannel = { vid: 2351, kind: 'random', triggerAt: 2, consume: true };
    a.g.player.useTime = 2;
    (a.g as unknown as { tickRecallChannel(): void }).tickRecallChannel();
    expect(firedA.length, '等值拍+身份匹配=fire（:43508）').toBe(1);
    expect(a.g.recallChannel, 'fire 即清道').toBeNull();
    // ②触发拍但持物已换 → 不 fire 不消耗（OLD=照传+错物 removeHeld）
    const b = stubGame(w);
    const firedB: unknown[] = [];
    b.g.fireRecallTeleport = (c: unknown) => firedB.push(c);
    b.g.player.inv.heldItem = () => ({ id: otherId });
    b.g.recallChannel = { vid: 2351, kind: 'random', triggerAt: 2, consume: true };
    b.g.player.useTime = 2;
    (b.g as unknown as { tickRecallChannel(): void }).tickRecallChannel();
    expect(firedB.length, '身份门：换栏拍不 fire（item.type==X 现值判,Player.cs:43502）').toBe(0);
    expect(b.state.removed, '不消耗（stack-- 与 TeleportationPotion 同块,不触发即不扣）').toBe(0);
    b.g.player.useTime = 1;                       // 拍已滑过
    (b.g as unknown as { tickRecallChannel(): void }).tickRecallChannel();
    expect(b.g.recallChannel, '过窗清道（原版该拍一过即死）').toBeNull();
    // ③OLD 判别：useTime=1(≤2) 旧语义会立即 fire → 新=过窗不响
    const c2 = stubGame(w);
    const firedC: unknown[] = [];
    c2.g.fireRecallTeleport = (x: unknown) => firedC.push(x);
    c2.g.player.inv.heldItem = () => ({ id: potionId });
    c2.g.recallChannel = { vid: 2351, kind: 'random', triggerAt: 2, consume: true };
    c2.g.player.useTime = 1;
    (c2.g as unknown as { tickRecallChannel(): void }).tickRecallChannel();
    expect(firedC.length, 'OLD(≤) 会 fire=红；新(==)过窗不响').toBe(0);
  });

  it('★SW-RB10a updateUnbreakableWallScan 门=Main.dualDungeonsSeed（DoUnbreakableWallScan :28826-28829）', () => {
    // vanilla 门=SecretSeed.dualDungeons（"double daring dangers"）;zenith 依赖七件套
    // （WorldSeedOption_Everything.Dependencies）不含 dualDungeons。旧刀挂 everything=
    // ddual 世界扫描整死。变异判别：同墙 pocket 下 ddual=true → 扫描置位;
    // everything-only → 门早退恒 false（OLD 会置位=红）。
    const mkWorld = (flags: Record<string, boolean>): World => {
      const w = new World(200, 400, 42, 'bj48-uw');
      (w as unknown as { seedFlags: Record<string, boolean> }).seedFlags = flags;
      const st = w.store;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          st.setWall(100 + dx, 100 + dy, 350);
          st.paintWall[st.idx(100 + dx, 100 + dy)] = 20;   // wallColor()>=16（UnbreakableWallScan.cs:66）
        }
      }
      return w;
    };
    // 直调 Player.prototype.updateUnbreakableWallScan（this 注入,免全 Player 装配）
    const proto = (Player as unknown as { prototype: { updateUnbreakableWallScan: (this: unknown, w: World, force?: boolean) => void } }).prototype;
    const runScan = (flags: Record<string, boolean>): boolean => {
      const w = mkWorld(flags);
      const fake = { insideUnbreakableWalls: false, cx: 100 * TILE + 10, cy: 100 * TILE + 21,
        uwScanCd: 0, uwScanX: 0, uwScanY: 0 };
      proto.updateUnbreakableWallScan.call(fake, w, true);
      return fake.insideUnbreakableWalls;
    };
    expect(runScan({ dualDungeons: true }), 'ddual 世界：8 向墙 350 pocket → 置位（vanilla 扫描实跑）').toBe(true);
    expect(runScan({ everything: true }), 'zenith-only：门早退恒 false（OLD=置位,红）').toBe(false);
    expect(runScan({}), '普通世界恒 false').toBe(false);
  });

  it('路由 tripwire：Game.ts 2351→random 接线在位（防并行会话整文件回写回归）', () => {
    const src = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/type RecallKind = 'spawn' \| 'ocean' \| 'hell' \| 'random';/);
    expect(src).toMatch(/tvid === 2351 \? 'random'/);                    // 路由臂
    expect(src).toMatch(/tvid === 2351 \? 2 :/);                         // itemTime==2（Player.cs:43508）
    expect(src).toMatch(/consume: tvid === 2350 \|\| tvid === 2351/);    // 消耗面（:43519）
    expect(src).toMatch(/requestTeleportationPotionSpot/);               // 随机链消费
    expect(src).toMatch(/teleportStyle2Dust/);                           // style2 尘面
  });
});
