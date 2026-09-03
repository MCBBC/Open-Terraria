// ③ 22 水花权杖（WaterStream,aiStyle 12 type 22 支）熔岩反弹变体闸门
// （Terarria1457 唯一标杆,行号均指该树）：
// 受理门 Projectile.cs:24841 `velocity.Y > 0f && ai[1] == 0f` + 心格 lava()
// （:24848-24850：(int)Center/16 双 int 整除 + WorldGen.InWorld + Main.tile.lava()
// =液型旗位,Tile.cs:347 (bTileHeader&0x60)==32 不查液量）；反弹 :24851-24855：
//   LCG32Random lcg = new LCG32Random((uint)ai[2]);      ← 种子=ai[2]
//   velocity.Y = lcg.NextFloat() * -4f - 4f;             ← 先掷 Y ∈(-8,-4]
//   velocity.X = (lcg.NextFloat() - 0.5f) * 5f;          ← 后掷 X ∈(-2.5,2.5)
//   ai[1] = 1f;
// 种子注入面 = Player.cs:49929-49931（ItemCheck_Shoot 通用尾支 projToShoot==22 →
//   ai14 = Main.rand.Next(0, 20000) → NewProjectile 第 11 参）：出手掷定、全弹恒定、
//   每次反弹重放同种子 ⇒ 同弹反弹向量恒定、跨弹随出手变化（非逐次重掷）。
// 进档效果 :24842-24847：num98/=2(0.075)/num97=0(停收缩)/extraUpdates=0/penetrate=-1;
// 浆中段 :24899-24907：1/2 掷 d31 小尘 + 1/2 概率跳过水拖尾。
// 与水支互斥：受理门要求 ai[1]==0——进档后恒驻,不再二次受理。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import { LCG32 } from '../src/fx/LightningGenerator';
import { f32 } from '../src/stats/ScaleStats';
import { Arrow } from '../src/entities/Arrow';
import type { GameHooks } from '../src/entities/types';

interface DustCall { x: number; y: number; w: number; h: number; type: number; scale: number }

function makeHooks(store: TileStore, dust: DustCall[], player?: Record<string, unknown>): GameHooks {
  const hooks = {
    world: { store } as never,
    player: {
      equipStats: {}, cx: 800, cy: 1440, x: 790, y: 1419, w: 20, h: 42, dead: false,
      facing: 1, vx: 0, vy: 0, ...player,
    } as never,
    enemies: () => [] as unknown[],
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    spawnDust: (x: number, y: number, w: number, h: number, type: number,
      sx = 0, sy = 0, _a = 0, _c = null, scale = 1) => {
      dust.push({ x, y, w, h, type, scale });
      return { x, y, vx: sx, vy: sy, fadeIn: 0, scale, color: null, noGravity: false };
    },
    stack: { anyTagged: () => false, hasActiveEffect: () => false },
    whipTagShot: true,
  };
  return hooks as unknown as GameHooks;
}

/** 出生在 tile (50,90) 格心的 22 弹（18×18 → 左上 = 格心−9） */
function mkStream(store: TileStore, vx: number, vy: number): Arrow {
  const p = new Arrow(50 * 16 + 8 - 9, 90 * 16 + 8 - 9, vx, vy, 27, 7, 22, null, {});
  return p;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('③ 22 WaterStream 熔岩反弹（ai[1]=1 档,Projectile.cs:24835-24926）', () => {
  it('受理：vy>0 且心格岩浆 → 反弹向量按 LCG32(ai[2]) 两掷（先 Y 后 X,f32 链）', () => {
    const st = new TileStore(200, 120);
    st.setLiquid(50, 90, 255, LIQUID_TYPE.LAVA);
    const dust: DustCall[] = [];
    const p = mkStream(st, 1, 3);
    p.waterStreamSeed = 4242;                                    // 钉种子（出手位 Main.rand 等价形）
    const g = makeHooks(st, dust);
    p.fixedUpdate(1 / 60, g);
    const rng = new LCG32(4242 >>> 0);
    const expVy = f32(f32(f32(rng.nextDouble()) * -4) - 4);
    const expVx = f32(f32(f32(rng.nextDouble()) - 0.5) * 5);
    expect(p.vy).toBe(expVy);                                    // 掷序敏感：Y=第 1 掷
    expect(p.vx).toBe(expVx);                                    // X=第 2 掷
    expect(expVy).toBeGreaterThan(-8); expect(expVy).toBeLessThanOrEqual(-4);
    expect(expVx).toBeGreaterThan(-2.5); expect(expVx).toBeLessThan(2.5);
    expect((p as unknown as { waterLavaMode: number }).waterLavaMode).toBe(1);   // ai[1]=1
    expect(p.pierce).toBe(-1);                                   // penetrate=-1（:24847）
    // extraUpdates=0（:24846）挂起到 tick 头生效（bee36EU0 同款——原版 numUpdates
    // 在 Update 头一次取定）：反弹拍仍跑满 3 子步（ai[0] 0→3）,次拍收敛 1
    expect((p as unknown as { aiCnt: number }).aiCnt).toBe(3);
    p.fixedUpdate(1 / 60, g);
    expect(p.extraUpdates).toBe(0);                              // 次拍起子步数收敛 1
    expect(dust.filter((d) => d.type === 31)).toHaveLength(4);   // 4×d31（:24861-24865）
  });

  it('同弹种子恒定：同 seed 两弹反弹向量逐位一致；异 seed 发散（跨弹变化）', () => {
    const st = new TileStore(200, 120);
    st.setLiquid(50, 90, 255, LIQUID_TYPE.LAVA);
    const g = makeHooks(st, []);
    const a = mkStream(st, 0, 3); a.waterStreamSeed = 777;
    const b = mkStream(st, 0, 3); b.waterStreamSeed = 777;
    const c = mkStream(st, 0, 3); c.waterStreamSeed = 778;
    a.fixedUpdate(1 / 60, g); b.fixedUpdate(1 / 60, g); c.fixedUpdate(1 / 60, g);
    expect(a.vx).toBe(b.vx); expect(a.vy).toBe(b.vy);            // 同种子=同向量（:24851 重放）
    expect(a.vx !== c.vx || a.vy !== c.vy).toBe(true);           // 异种子=异向量
  });

  it('上升态不受理（:24841 vy>0 门）——velocity 原样、ai[1] 维持 0', () => {
    const st = new TileStore(200, 120);
    st.setLiquid(50, 90, 255, LIQUID_TYPE.LAVA);
    const dust: DustCall[] = [];
    const p = mkStream(st, 1, -3);
    p.waterStreamSeed = 4242;
    const g = makeHooks(st, dust);
    p.fixedUpdate(1 / 60, g);
    expect((p as unknown as { waterLavaMode: number }).waterLavaMode).toBe(0);
    expect(dust.filter((d) => d.type === 31)).toHaveLength(0);
    expect(p.pierce).toBe(5);                                    // 数据面 penetrate 5 不动
  });

  it('无岩浆不受理（干地/水面同门不触发）', () => {
    const st = new TileStore(200, 120);
    st.setLiquid(50, 90, 255, LIQUID_TYPE.WATER);                // 水非 lava()（旗位域）
    const dust: DustCall[] = [];
    const p = mkStream(st, 1, 3);
    const g = makeHooks(st, dust);
    p.fixedUpdate(1 / 60, g);
    expect((p as unknown as { waterLavaMode: number }).waterLavaMode).toBe(0);
    expect(dust.filter((d) => d.type === 31)).toHaveLength(0);
  });

  it('与水支互斥：进档后 ai[1]==1 恒驻,再次下落触浆不重掷（ai[1]==0 受理门 :24841）', () => {
    const st = new TileStore(200, 120);
    st.setLiquid(50, 90, 255, LIQUID_TYPE.LAVA);
    const p = mkStream(st, 0, 3);
    p.waterStreamSeed = 4242;
    const g = makeHooks(st, []);
    p.fixedUpdate(1 / 60, g);                                    // 首次反弹
    const vyAfterBounce = p.vy;
    expect(vyAfterBounce).toBeLessThanOrEqual(-4);
    // ai[0] 门爬升：反弹拍内 3 子步 aiCnt 0→3,再一拍 3→4（仍无重力——>3 门 :24895）
    p.fixedUpdate(1 / 60, g);
    // 强制再次下落触浆：受理门 ai[1]==0 已闭 → 只吃重力,不重掷
    p.vy = 5; p.y = 90 * 16;                                     // 回到浆格高度
    vi.spyOn(Math, 'random').mockReturnValue(0.9);               // 跳过浆中拖尾支,隔离观测
    p.fixedUpdate(1 / 60, g);
    // num98 = f32(0.15/2)（C# float 除)——本仓 vy 面 f64 自由演算,加法不再 fround
    expect(p.vy).toBe(5 + f32(0.15 / 2));                        // 非反弹式（:24844 档重力）
    expect((p as unknown as { waterLavaMode: number }).waterLavaMode).toBe(1);
  });

  it('进档效果：停收缩（num97=0 :24845）+ 重力减半档 0.075/update（extraUpdates=0 → 每拍一次）', () => {
    const st = new TileStore(200, 120);
    st.setLiquid(50, 90, 255, LIQUID_TYPE.LAVA);
    const p = mkStream(st, 0, 3);
    p.waterStreamSeed = 4242;
    const g = makeHooks(st, []);
    p.fixedUpdate(1 / 60, g);
    const scaleAtBounce = p.drawScale;
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    for (let i = 0; i < 8; i++) p.fixedUpdate(1 / 60, g);        // aiCnt 爬过 3 门后施加重力
    expect(p.drawScale).toBe(scaleAtBounce);                     // 浆中不死（水支 0.01/update 已停）
    const vy8 = p.vy;
    p.fixedUpdate(1 / 60, g);
    p.fixedUpdate(1 / 60, g);
    expect(f32(p.vy - vy8)).toBeCloseTo(0.15, 6);                // 2 拍 × 0.075
  });

  it('浆中段尾迹门（:24899-24907）：rand(2)==0 → d31 小尘 + 水拖尾照常;否则整拍跳过', () => {
    const st = new TileStore(200, 120);
    st.setLiquid(50, 90, 255, LIQUID_TYPE.LAVA);
    const p = mkStream(st, 0, 3);
    p.waterStreamSeed = 4242;
    const dust: DustCall[] = [];
    const g = makeHooks(st, dust);
    p.fixedUpdate(1 / 60, g);                                    // 反弹拍
    p.fixedUpdate(1 / 60, g);                                    // ai[0] 门 3→4（:24895 段激活）
    p.vy = 0;                                                    // 钉位隔离重力位移
    const base = dust.length;
    vi.spyOn(Math, 'random').mockReturnValue(0);                 // rand(2)==0 支
    p.fixedUpdate(1 / 60, g);
    const tickDust = dust.slice(base);
    expect(tickDust.filter((d) => d.type === 31 && d.w === 0)).toHaveLength(1);   // d31 小尘（Center,0×0,scale .8）
    expect(tickDust.filter((d) => d.type === 172)).toHaveLength(4);               // 拖尾 3 + 1/8 小尘 1
    // rand(2)!=0 支：整拍无尘（浆中不再拉水痕——水支互斥的尾巴）
    const base2 = dust.length;
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    p.fixedUpdate(1 / 60, g);
    expect(dust.slice(base2)).toHaveLength(0);
  });
});
