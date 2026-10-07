// BJ550 下砸过程特效+绘制姿势（用户复报：5465 下砸可触发但「没有下砸特效」）：
// ★定谳（原版 1457 亲读）——下砸过程面 =
//   ①过程主视觉 = Player.cs:37354-37357 isPerformingJump_DownDash →
//     armorEffectDrawShadow=true → LegacyPlayerRenderer.cs:415-421 三张社交残影
//     （shadowPos[0..2] 环,shadow=0.5+0.2i → GetImmuneAlpha/Pure Color.Multiply
//     全通道乘 (1−shadow)=k 0.5/0.3/0.1,暗剪影拖带;环源=UpdateSocialShadow
//     Player.cs:16699-16726,3 拍采样管道 [2]←[1]/[1]←[0]/[0]=position+gfxOffY）。
//   ②过程仪表面 = Main.cs:47882-47884 秒表读数 vector.Y += velocity.Y（双计）。
//   ③★零面定谳：发起（:20958-20961 velocity.Y=16×gravDir）与下坠全程【零尘/零音】
//     （无 Dust/SoundEngine 调用）;绘制姿势除残影带外无帧/旋转改面（翅膀让位
//     vanillaWingVisuals.downDash 已由 BJ534 落位）。
//   ④落地爆 = BJ534 已落（deadCellsGroundPound → DeadCellsDownDashExplosion →
//     deadCellsDownDashExplosionFx,含 DD2_MonkStaffGroundImpact 音臂）——本套件
//     只钉不回归。
// 本仓载体：Player.downDashGhostStamps（纯函数）+ shadowRing()（SW-FX36 环快照）
//   + Renderer.drawPlayer 盖章块 + InfoAccsLayer.tick 双计臂。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { World } from '../src/world/World';
import { Player, downDashGhostStamps } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { TILE_BY_KEY } from '../src/data/tiles';
import { InfoAccsLayer } from '../src/render/InfoAccsLayer';
import { deadCellsDownDashExplosionFx } from '../src/fx/orchestraFx';
import { seededRandom, BATTERY_SEED } from './seeded-rng';

beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(BATTERY_SEED)); });
afterEach(() => { vi.restoreAllMocks(); });

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];
const RAM_RUNE = _iid(5465);
const STONE = TILE_BY_KEY['stone'];

const PLY = readFileSync(new URL('../src/entities/Player.ts', import.meta.url), 'utf8');
const RDR = readFileSync(new URL('../src/render/Renderer.ts', import.meta.url), 'utf8');
const IAL = readFileSync(new URL('../src/render/InfoAccsLayer.ts', import.meta.url), 'utf8');

function makeWorld(floorY = 104): World {
  const w = new World(60, 180, 44, 'bj550');
  for (let x = 0; x < 60; x++) w.store.setTileSilent(x, floorY, STONE, 0, 0);
  return w;
}

function makeHooks(w: World) {
  return {
    world: w, player: null as unknown,
    enemies: () => [] as unknown[], critters: () => [] as unknown[], npcs: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
    spawnParticles: () => {}, spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
    addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: () => 0, notifyInventoryChanged: () => {}, onEnemyKilled: () => {},
    spawnEnemy: () => {}, cutTile: () => {},
    broadcastParticleOrchestra: () => {},
  } as never as Parameters<Player['fixedUpdate']>[1];
}

async function makePlayer(xTile = 21, yTile = 100) {
  return new Player(xTile * 16, yTile * 16, new Inventory());
}

function settle(p: Player, game: Parameters<Player['fixedUpdate']>[1]): void {
  for (let i = 0; i < 30 && !p.onGround; i++) p.fixedUpdate(1 / 60, game);
  for (let i = 0; i < 3; i++) p.fixedUpdate(1 / 60, game);
  if (!p.onGround) throw new Error('settle 失败：未落地');
}

function lift(p: Player, dy: number): void {
  p.y -= dy;
  p.vy = 2;
  p.onGround = false;
  p.fallStartY = p.y;
}

describe('BJ550 ①社交残影环（UpdateSocialShadow :16699-16726,SW-FX36 载体）', () => {
  it('管道式环移 1:1（count1→[2]=[1] / count2→[1]=[0] / count3→[0]=当前位+归零）', async () => {
    const p = await makePlayer();
    p.x = 100; p.y = 200; p.gfxOffY = 0;
    for (let i = 0; i < 9; i++) p.updateSocialShadow();      // 预热三代（冷启动环=0,0——原版无
    expect(p.shadowRing()).toEqual([{ x: 100, y: 200 }, { x: 100, y: 200 }, { x: 100, y: 200 }]);
    p.y = 300;                                               // 移动后三步：采样管道
    p.updateSocialShadow();                                  // count1：[2]=[1]
    expect(p.shadowRing()[2].y).toBe(200);
    expect(p.shadowRing()[0].y).toBe(200);                   // [0] 尚未更新
    p.updateSocialShadow();                                  // count2：[1]=[0]
    expect(p.shadowRing()[1].y).toBe(200);
    p.updateSocialShadow();                                  // count3：[0]=当前 (100,300)
    expect(p.shadowRing()[0]).toEqual({ x: 100, y: 300 });
    expect(p.shadowRing()[1]).toEqual({ x: 100, y: 200 });
    expect(p.shadowRing()[2]).toEqual({ x: 100, y: 200 });
    p.y = 400;
    p.updateSocialShadow(); p.updateSocialShadow(); p.updateSocialShadow();
    expect(p.shadowRing()[0]).toEqual({ x: 100, y: 400 });   // 三代同环（3/6/9 拍滞后源）
    expect(p.shadowRing()[1]).toEqual({ x: 100, y: 300 });
    expect(p.shadowRing()[2]).toEqual({ x: 100, y: 200 });
  });

  it('记录位烘焙 gfxOffY（:16724 shadowPos[0].Y += gfxOffY）', async () => {
    const p = await makePlayer();
    p.x = 50; p.y = 500;
    p.updateSocialShadow();                                  // 初始化
    p.gfxOffY = 7;                                           // 视觉纵向偏移（原版同字段）
    p.updateSocialShadow(); p.updateSocialShadow(); p.updateSocialShadow();   // 采满一代
    expect(p.shadowRing()[0]).toEqual({ x: 50, y: 507 });    // +gfxOffY 烘焙
    p.gfxOffY = 0;
  });

  it('下砸下坠期残影带存在且单调滞后（环 3 拍采样,快坠拖带可感面）', async () => {
    const w = makeWorld();
    const game = makeHooks(w);
    const p = await makePlayer();
    p.inv.armor[3] = { id: RAM_RUNE, stack: 1 };
    settle(p, game);
    lift(p, 400);                                            // 深落窗：10 拍快坠（≈2×10/t）不触地
    p.inputDown = true; p.inputJump = true; p.jumpEdgePrev = false;
    p.fixedUpdate(1 / 60, game);                             // 触发帧（BJ534 链）
    p.inputJump = false; p.inputDown = false;
    expect(p.isDownDashing).toBe(true);
    for (let i = 0; i < 10; i++) p.fixedUpdate(1 / 60, game); // 下坠 10 拍（环采满 ≥2 代）
    expect(p.onGround).toBe(false);                          // 全程未落地（落地拍环收敛=另案）
    const ring = p.shadowRing();
    // 下坠（gravDir=1,y 增）：越旧采样越靠上。移管道在非记录相位会让相邻槽同值
    // （count1 相位 [2]=[1]、count2 相位 [1]=[0]）→ 序判据取非严格,跨度取严格
    expect(ring[2].y).toBeLessThanOrEqual(ring[1].y);
    expect(ring[1].y).toBeLessThanOrEqual(ring[0].y);
    expect(ring[2].y).toBeLessThan(ring[0].y);               // 跨代采样严格滞后（≥3 拍差）
    expect(ring[0].y).toBeLessThan(p.y);                     // 残影带在本体上方=滞后轨迹
    expect(p.y - ring[2].y).toBeGreaterThan(20);             // 快坠拖带跨度（≥3 拍 × ≥8px）
    expect(ring[0].x).toBe(p.x);                             // 竖直下砸 X 无漂
  }, 30000);
});

describe('BJ550 ②残影 stamps（downDashGhostStamps 纯函数,:415-421 × GetImmuneAlpha）', () => {
  it('k 档 = [0.5,0.3,0.1]（shadow=0.5+0.2i 全通道乘 (1−shadow)）且 freshest 最大', () => {
    const p = { facing: 1, gravDir: 1, x: 52, y: 200, stepRenderY: 0 };
    const ring = [{ x: 52, y: 140 }, { x: 52, y: 80 }, { x: 52, y: 20 }];
    const st = downDashGhostStamps(p, ring);
    expect(st[0].k).toBeCloseTo(0.5);                        // :419 逐 i 钉值（f64 舍入容差）
    expect(st[1].k).toBeCloseTo(0.3);
    expect(st[2].k).toBeCloseTo(0.1);
  });

  it('lx = facing·Δx + 2.5（镜像空间;仓内精灵前移 −facing·2.5 于锚点自消）', () => {
    const ring = [{ x: 84, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    // facing=+1：sp.x=p.x+32 → lx=+32+2.5=34.5
    expect(downDashGhostStamps({ facing: 1, gravDir: 1, x: 52, y: 200, stepRenderY: 0 }, ring)[0].lx).toBeCloseTo(34.5);
    // facing=−1：镜像 → lx=−32+2.5=−29.5
    expect(downDashGhostStamps({ facing: -1, gravDir: 1, x: 52, y: 200, stepRenderY: 0 }, ring)[0].lx).toBeCloseTo(-29.5);
    // 同位残影（sp.x=p.x）仍保留 +2.5 前移锚（= 本体同帧位）
    expect(downDashGhostStamps({ facing: 1, gravDir: 1, x: 52, y: 200, stepRenderY: 0 }, [{ x: 52, y: 0 }, { x: 52, y: 0 }, { x: 52, y: 0 }])[0].lx).toBeCloseTo(2.5);
  });

  it('ly = gravDir·(Δy−stepRenderY)（gravDir=−1 经外层翻转由 ×gravDir 承载）', () => {
    const ring = [{ x: 0, y: 140 }, { x: 0, y: 140 }, { x: 0, y: 140 }];
    expect(downDashGhostStamps({ facing: 1, gravDir: 1, x: 0, y: 200, stepRenderY: 0 }, ring)[0].ly).toBeCloseTo(-60);
    expect(downDashGhostStamps({ facing: 1, gravDir: 1, x: 0, y: 200, stepRenderY: 4 }, ring)[0].ly).toBeCloseTo(-64);
    expect(downDashGhostStamps({ facing: 1, gravDir: -1, x: 0, y: 200, stepRenderY: 0 }, ring)[0].ly).toBeCloseTo(60);
  });

  it('★零面定谳防自创：纯函数无尘/无音（原版下砸过程零 Dust/零 SoundEngine）', () => {
    const fn = PLY.slice(PLY.indexOf('export function downDashGhostStamps'), PLY.indexOf('export function downDashGhostStamps') + 2200);
    expect(fn).not.toMatch(/spawnParticles|spawnDust|playSfx|SoundEngine|NewDust/);
  });
});

describe('BJ550 ③秒表下坠速双计（Main.cs:47882-47884 vector.Y += velocity.Y）', () => {
  const GATES = { accThirdEye: false, accCritterGuide: false, accStopwatch: true };
  function stubPlayer(isDown: boolean) {
    return {
      accThirdEyeCounter: 0, accCritterGuideCounter: 0, accThirdEyeNumber: 0,
      accCritterGuideText: null as string | null, accCritterGuideVid: null as number | null,
      speedSlice: new Float32Array(60), vx: 0, vy: 10, isDownDashing: isDown,
    };
  }
  function run(isDown: boolean): number {
    const layer = new InfoAccsLayer();
    const player = stubPlayer(isDown);
    for (let i = 0; i < 60; i++) {
      layer.tick(player, [], [], [], 0, 0, () => false, () => 0, () => null,
        (vx, vy) => Math.hypot(vx, vy), GATES);
    }
    return layer.speedAvg;
  }
  it('isDownDashing=true → 读数 = 2×|vy|（窗口收敛 20）;false → 10（旗关档）', () => {
    expect(run(true)).toBeCloseTo(20);
    expect(run(false)).toBeCloseTo(10);
  });
  it('双计臂接线锚（InfoAccsLayer 源内消费位存在）', () => {
    expect(IAL).toContain('player.isDownDashing ? player.vy : 0');
  });
});

describe('BJ550 ④渲染接线（Renderer.drawPlayer 盖章块,源锚）', () => {
  it('残影块 = isDownDashing 门 × downDashGhostStamps(p, p.shadowRing()) × brightness(k) 盖章', () => {
    expect(RDR).toMatch(/if \(p\.isDownDashing\) \{\s*\n\s*for \(const g of downDashGhostStamps\(p, p\.shadowRing\(\)\)\)/);
    expect(RDR).toContain('ctx.filter = `brightness(${g.k})`');
    expect(RDR).toContain('g.lx - f.sw / 2, g.ly - f.sh + pad');   // 与本体同帧锚(−sw/2, −sh+pad)
  });
  it('环单步纪律：updateSocialShadow 调用点恰 1 处（fixedUpdate 头,SW-FX36 相位）', () => {
    const calls = PLY.match(/this\.updateSocialShadow\(\);/g) ?? [];
    expect(calls.length).toBe(1);
    expect(PLY).toContain('shadowRing()');
  });
});

describe('BJ550 ⑤落地爆不回归（BJ534 面：DeadCellsDownDashExplosion 含音臂）', () => {
  function fxGame() {
    const playSfxFiles = vi.fn();
    const spawnParticles = vi.fn();
    return { playSfxFiles, spawnParticles, game: {
      playSfxFiles, spawnParticles,
      world: { store: { inBounds: () => false, isSolid: () => false } },
    } as never };
  }
  it('非蓄力档：DD2_MonkStaffGroundImpact（PlayTracked :2133）+ dust306 ×40', () => {
    const { playSfxFiles, spawnParticles, game } = fxGame();
    deadCellsDownDashExplosionFx(game, 100, 200, false);
    expect(playSfxFiles).toHaveBeenCalledTimes(1);
    expect(playSfxFiles).toHaveBeenCalledWith(['dd2_monk_staff_ground_impact'], 0.8, 100, 200);
    expect(spawnParticles).toHaveBeenCalledTimes(40);
  });
  it('蓄力档：同音臂（UniqueInfoPiece=1 档,hue 0.01）', () => {
    const { playSfxFiles, spawnParticles, game } = fxGame();
    deadCellsDownDashExplosionFx(game, 100, 200, true);
    expect(playSfxFiles).toHaveBeenCalledWith(['dd2_monk_staff_ground_impact'], 0.8, 100, 200);
    expect(spawnParticles).toHaveBeenCalledTimes(40);
  });
});
