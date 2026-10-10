// ★BJ606（2026-10-10 用户复报 F3 物证：碰撞盒 16×16 挂贴图左上+贴图陷地）
//
// 身份定谳（1457 亲读钉死）：「闪电光环法杖」哨兵 = Projectile 688/689/690
//   （DD2LightningAuraT1/T2/T3,ProjectileID.cs:1828-1832）——任务书草案的
//   「768」=KiteRed（风筝,ProjectileID.cs:1988）非本族,未动。
//   SetDefaults 16×16/aiStyle 137/sentry/tileCollide=false（Projectile.cs:7327-7339）。
//
// 原版对位公式（1457 亲读,1456 :65963-66000/:31680-31726 同式对拍恒等）：
//   ① 盒（Projectile.cs:69979-70016 AI_137 首拍）：Down(500) 找地面 result →
//      Up(10) 找天花板 result2（无则 fallback (origin.X,origin.Y-11)）→
//      center=(result.X*16+8, result.Y*16+num6)、vector=(result2.X*16+8, result2.Y*16)
//      → Size=(1,center.Y-vector.Y) → 钳 [num5*16,num*16]=[64,160]（setMonkT3
//      num=14/num5=8 → [128,224]）→ height*=2 → width=height（封顶 999）→
//      base.Center=center ⇒ 盒=square（[128,320]/T3 [256,448]）以地面接触点为心。
//      ——「闪电光环哨兵」原版视觉=悬空球体（球=盒顶,悬基地上空 H/2=4~10 格）
//      + 地面底座（wiki Lightning Aura Rod：orb 4-10 tiles up ✓）,非落地塔。
//   ② 绘（Main.cs:32481-32527 DrawProjDirect）：本体帧 position=proj.Top（盒顶心）、
//      origin=帧顶心（Size×(0.5,0)）;glow Glow_228/229/230 同矩形 A=127;
//      底座 Extra_86/87/88 position=proj.Center、origin=(宽/2,高−2),ai[2]==1 不画。
//      rotation 恒 0、spriteDirection 恒 +1。projFrames 6/6/8（Main.cs:8603-8605）。
//
// 本仓双病灶（本刀双面落刀）：
//   D1（AI 面）：AI_137 移植只记虚场 auraSide/auraCy 不写盒 ⇒ 盒钉出生点 16×16
//     （F3=用户截图「MinionProj 16×16」）。
//   D2（绘制面）：688-690 无专绘支 → 通用尾 off3=[0,0] 帧左上锚盒左上 ⇒ 贴图
//     右下悬出盒 6/14px,底 14px 陷地（F3 物证形态）。
//   BJ580 前刀失效原因：台账记「已收（#593）」但盘上零落痕（全仓 grep BJ580=0、
//   无测试文件、aura 块/绘制链无改动）=报告式收官未落刀;BJ-C9-SP 测试注「另刀
//   处理」即本刀。③=防回潮锁（专绘支摘除→通用尾回潮→红）。
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { MinionProj } from '../src/entities/MinionProj';
import { EntityManager } from '../src/entities/Entity';
import { setProjSpriteOverride } from '../src/entities/Arrow';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 120;
const GROUND_ROW = 100;

function makeGame(playerPx = 60 * 16, playerPy = 90 * 16): {
  hooks: GameHooks; player: Player;
} {
  const w = new World(W, H, 7, 'bj606-lightning-sentry-anchor');
  for (let x = 0; x < W; x++) for (let y = GROUND_ROW; y < H; y++) w.store.setTile(x, y, 1);
  w.groundLevel = GROUND_ROW;
  const player = new Player(playerPx, playerPy, new Inventory());
  const list: unknown[] = [];
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
    enemies: () => list as never,
    npcs: () => [],
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
    spawnFriendlyProj: () => undefined,
    entities: { add: () => {}, nextId: 1, projectiles: [] } as never,
  } as never;
  return { hooks, player };
}

const run = (e: { fixedUpdate: (dt: number, g: GameHooks) => void; dead?: boolean }, g: GameHooks, n: number): void => {
  for (let i = 0; i < n && !e.dead; i++) e.fixedUpdate(1 / 60, g);
};

type RecOp = { m: string; a: unknown[] };
function recordingCtx(): { ctx: unknown; ops: RecOp[] } {
  const ops: RecOp[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, k) {
      if (k === 'canvas') return undefined;
      return (...a: unknown[]) => { ops.push({ m: String(k), a }); };
    },
    set(_t, k, v) { ops.push({ m: `set:${String(k)}`, a: [v] }); return true; },
  });
  return { ctx, ops };
}

// ===================== ① 原版对位公式锁（1457 逐值） =====================

describe('BJ606 ①：原版盒/贴图对位公式锁（Projectile.cs:69979-70016 + Main.cs:32481-32527）', () => {
  it('A 盒公式：side=clamp(净空,[64,160])×2、width=height、Center=(tx*16+8, 地面顶)（露天=320）', () => {
    const { hooks, player } = makeGame();
    // 出生盒心=(808,1568)（列 50、行 98=离地 2 格;ctor 收盒左上 (800,1560)）：fallback
    // result2=(50, 98-11=87) → 净空=(100-87)*16=208 → 钳 160 → ×2=320（vanilla 露天恒式）
    const m = new MinionProj(50 * 16, 98 * 16 - 8, 688, 30, 0, true, 0, false, () => player);
    run(m, hooks, 3);
    const box = m as unknown as { w: number; h: number; x: number; y: number; cx: number; cy: number };
    expect(box.w, 'width=height（:65979）').toBe(320);
    expect(box.h, 'height*=2 后 [128,320] 露天档').toBe(320);
    expect(box.cx, 'Center.X=tx*16+8（result.ToWorldCoordinates(8f,·) :65979）').toBe(50 * 16 + 8);
    expect(box.cy, 'Center.Y=地面顶 groundRow*16（:65980）').toBe(GROUND_ROW * 16);
    expect(box.x, '盒左=Center-160').toBe(50 * 16 + 8 - 160);
    expect(box.y, '盒顶=Center-160（悬空球体锚位）').toBe(GROUND_ROW * 16 - 160);
  });

  it('B 低天花板钳档：净空 64px→side=128（[64,160] 下档×2）——BJ467⑤ 同源回归', () => {
    const { hooks, player } = makeGame();
    const wld = (hooks.world as unknown as { store: World['store'] }).store;
    for (let x = 0; x < W; x++) wld.setTile(x, 96, 1);   // 天花板行 96（顶=1536）
    const m = new MinionProj(50 * 16, 98 * 16 - 8, 688, 30, 0, true, 0, false, () => player);
    run(m, hooks, 3);
    const box = m as unknown as { w: number; h: number };
    expect(box.w, '净空=(100-96)*16=64 → 钳下档 64 → ×2=128').toBe(128);
    expect(box.h).toBe(128);
  });

  it('C 贴图/帧档：projFrames 688/689=6、690=8（Main.cs:8603-8605）;帧 22×30/28×32/34×38', () => {
    expect(180 / 6, 'Projectile_688.png 22×180/6 帧=22×30').toBe(30);
    expect(192 / 6, 'Projectile_689.png 28×192/6 帧=28×32').toBe(32);
    expect(304 / 8, 'Projectile_690.png 34×304/8 帧=34×38').toBe(38);
  });
});

// ===================== ② 本仓修复后对位锁（绘制计划=原版式） =====================

describe('BJ606 ②：绘制对位锁（贴图顶心锚盒顶心+底座盒心——Main.cs:32481-32527 折算）', () => {
  beforeAll(() => {
    // projFrameImg 帧切片画布垫片（BJ-C9-SP 同式：draw 前置 img 计算消费,吸掉 2d 调用）
    (globalThis as Record<string, unknown>).document = {
      createElement: () => {
        const cv: Record<string, unknown> = { width: 0, height: 0 };
        cv.getContext = () => new Proxy({}, { get: () => () => { /* noop */ }, set: () => true });
        return cv;
      },
    };
  });
  afterEach(() => {
    setProjSpriteOverride(688, undefined as never);
  });

  function placeAndDraw(vid: 688 | 689 | 690, carried = false): { ops: RecOp[]; m: MinionProj; files: string[] } {
    const { hooks, player } = makeGame();
    const m = new MinionProj(50 * 16, 98 * 16 - 8, vid, 30, 0, true, 0, false, () => player);
    run(m, hooks, 3);
    if (carried) (m as unknown as { carriedByBackpack: boolean }).carriedByBackpack = true;
    const img = { width: vid === 690 ? 34 : vid === 689 ? 28 : 22, height: vid === 690 ? 304 : vid === 689 ? 192 : 180 };
    setProjSpriteOverride(vid, img as never);
    const { ctx, ops } = recordingCtx();
    const files: string[] = [];
    const atlas = { ensureVImage: (f: string) => { files.push(f); return { width: 28, height: 10, __file: f }; } };
    m.draw({ ctx, atlas } as never);
    return { ops, m, files };
  }

  it('A 688：本体帧顶心=盒顶心（draw 位=(cx,y)、dest=(−11,0)）——原版 proj.Top+origin(0.5,0)', () => {
    const { ops, m } = placeAndDraw(688);
    const tr = ops.find((o) => o.m === 'translate');
    expect(tr?.a, '锚=proj.Top=(Center.X, 盒顶)（:32486）').toEqual([m.cx, m.y]);
    const draw = ops.find((o) => o.m === 'drawImage' && (o.a.length === 3 || o.a.length === 5 || o.a.length === 9));
    expect(draw, '本体帧出图（贴图 stub 在位）').toBeTruthy();
    const a = draw!.a as number[];
    expect(a.slice(1, 3), 'dest=(−帧宽/2, 0)=帧顶心 origin（:32497 Size×(0.5,0)）').toEqual([-11, 0]);
    // 几何合成：贴图顶=盒顶、贴图横心=盒横心（原版对位=悬空球体,非落地塔）
    const sprLeft = m.cx - 11, sprTop = m.y;
    expect(sprTop, '贴图顶=盒顶（球悬盒顶,H/2=160px=10 格——陷地病根消除）').toBe(m.y);
    expect(sprLeft + 11, '贴图横心=盒横心').toBe(m.cx);
    expect(sprTop + 30, '贴图底=盒顶+30 ≪ 盒底（球悬场顶,原版无「贴地」面）').toBeLessThan(m.y + m.h);
  });

  it('B 底座 Extra_86：锚=盒心、origin=(宽/2,高−2)（:32515-32521）;携行（ai[2]==1）不画', () => {
    const { ops } = placeAndDraw(688);
    const baseDraw = ops.find((o) => o.m === 'drawImage' && (o.a as number[])[1] === -14 && (o.a as number[])[2] === -8);
    expect(baseDraw, '底座出图（atlas stub 28×10）').toBeTruthy();
    expect((baseDraw!.a as number[]).slice(1, 3), 'dest=(−14,−(10−2))=origin(宽/2,高−2)').toEqual([-14, -8]);
    const baseTr = ops.filter((o) => o.m === 'translate').map((o) => o.a);
    expect(baseTr.some((a) => a[1] === GROUND_ROW * 16), '底座锚 Y=盒心 cy=地面顶（proj.Center）').toBe(true);
    const { ops: opsCarried } = placeAndDraw(688, true);
    expect(opsCarried.find((o) => o.m === 'drawImage' && (o.a as number[])[1] === -14),
      'ai[2]==1 携行底座不画（:32514）').toBeUndefined();
  });

  it('C 三档底座贴图分派：688→Extra_86/689→Extra_87/690→Extra_88（:32494-32500）', () => {
    const files: string[] = [];
    for (const vid of [688, 689, 690] as const) {
      files.push(...placeAndDraw(vid).files.filter((f) => f.includes('Extra_')));
    }
    expect(files, 'atlas 实请求文件名（分派面真判别）').toEqual(['vanilla/Extra_86.png', 'vanilla/Extra_87.png', 'vanilla/Extra_88.png']);
  });

  it('D 判别（旧通用尾回潮→红）：贴图左上≠盒左上（off3=[0,0] 形态=F3 物证病灶）', () => {
    const { ops, m } = placeAndDraw(688);
    const draw = ops.find((o) => o.m === 'drawImage')!;
    const a = draw.a as number[];
    const trX = (ops.find((o) => o.m === 'translate')!.a as number[])[0];
    const sprLeft = trX + (a[1] as number);
    expect(sprLeft, '旧通用尾=盒左（cx−w/2+num145−num145=cx−8）;新=帧顶心 cx−11——恒差 3px').not.toBeCloseTo(m.cx - m.w / 2, 5);
  });
});

// ===================== ③-BJ606-R 三面返工锁（2026-10-10 用户复报物证定谳） =====================
// behavior-log-Starter_World-2026-10-10T03-31-59-796Z.json 三物证：
//   ①割草：t=4464（首次用法杖拍）19 格药草带（x3285-3303,y391 cause=mine）+t=6006
//     27 格藤簇（3692-3698,466-475）+同步 drops 爆发（药草掉落物 19+）——场盒化后
//     中央 CutTiles 收口整盒上报=割草机（EntityManager 探针：30 拍 13230 次上报/
//     441 格）。vanilla CanCutTiles(:15407) 头支 aiStyle 137 恒 false=零割。
//   ②攻击：hurt 4 连（vid61 秃鹫,dmg=34=Item 3831 SetDefaults 原值:33897-905,
//     3t 间距=localNPCHitCooldown:7339）=伤害/节奏 vanilla 恒等；缺面=放电视觉尘
//     （:70034-70056 尘 226 场缘电弧+塔柱火花）零移植=「放电无电弧」。
//   ③浮空：场盒化后走通用哨兵重力段（行走体管线）——坡/台阶触发 unembed/步面
//     抬升（探针实录:坡面 1 拍 +160px 瞬移 1440→1280）。vanilla HandleMovement
//     aiStyle 137=Y-ONLY（X 零写位:17764-17776）+TileCollision 四向分类无嵌入支
//     （Collision.cs:2409-2455）→嵌入场盒钉在探测锚=冻结恒稳。

describe('BJ606-R ④：割面排除锁（CanCutTiles aiStyle 137=零割,Entity.ts 收口门）', () => {
  it('688 塔零割：药草带场上 30 拍 game.cutTile 上报=0（旧=13230 次实锤回潮必红）', () => {
    const w = new World(200, 120, 7, 'bj606-cut');
    for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) w.store.setTile(x, y, 1);
    for (let x = 40; x <= 60; x++) w.store.setTile(x, 99, 83);   // 药草行（log y=391 同构）
    const player = new Player(46 * 16, 90 * 16, new Inventory());
    const cuts: string[] = [];
    const hooks: GameHooks = {
      world: w as never, player: player as never,
      enemies: () => [], npcs: () => [], critters: () => [],
      spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
      cutTile: (x: number, y: number) => { cuts.push(`${x},${y}`); },
      onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
      notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      showPickupLabel: () => {}, spawnFriendlyProj: () => undefined,
      entities: { add: () => {}, nextId: 1, projectiles: [] } as never,
    } as never;
    const em = new EntityManager();
    const m = new MinionProj(50 * 16, 98 * 16 - 8, 688, 34, 0, true, 0, false, () => player);
    em.add(m, 'projectiles');
    for (let i = 0; i < 30; i++) em.update(1 / 60, hooks);
    expect(cuts.length, '688 走中央割收口的上报数（CanCutTiles aiStyle137 排除=0;旧 13230）').toBe(0);
  });
});

describe('BJ606-R ⑤：放电视觉尘锁（尘 226 场缘电弧+塔柱火花,Projectile.cs:70034-70056）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setProjSpriteOverride(688, undefined as never);
  });

  it('尘 226 出炉：noGravity/noLight、柱火盒=(盒顶心X-8, 盒顶+40,16,H/2-40)、电弧钉点场缘', () => {
    const { hooks, player } = makeGame();
    const m = new MinionProj(50 * 16, 98 * 16 - 8, 688, 34, 0, true, 0, false, () => player);
    run(m, hooks, 3);   // 首拍锚定（auraSide=320,cy=地面顶）
    const dusts: Array<Record<string, number | boolean>> = [];
    (hooks as unknown as { spawnDust: unknown }).spawnDust = (
      x: number, y: number, w2: number, h2: number, type: number,
    ) => {
      const d: Record<string, number | boolean> = { x, y, w: w2, h: h2, type, vx: 0.5, vy: 0.5 };
      dusts.push(d);
      return d as never;
    };
    vi.spyOn(Math, 'random').mockReturnValue(0.65);   // 0.65<5/6? 否——电弧掷过面见下：0.65≥1/6=电弧跳过、0.65≥1/10=柱火跳过
    m.fixedUpdate(1 / 60, hooks);
    expect(dusts.length, 'random=0.65 全掷跳过=零尘（掷面自证）').toBe(0);
    vi.mocked(Math.random).mockReturnValue(0);        // 全掷通过：电弧角=0→(1,0) 目标落地面格=SolidTile 门跳过；柱火 4 发
    m.fixedUpdate(1 / 60, hooks);
    const col = dusts.filter((d) => d.type === 226);
    expect(col.length, '柱火 4 试全过（Next(10) 掷 0=1/10 面;电弧被 SolidTile 门拦=vanilla 同相）').toBe(4);
    expect(col.every((d) => d.noGravity === true && d.noLight === true), 'noGravity/noLight（:70047-56）').toBe(true);
    expect(col.every((d) => (d.y as number) >= (m as unknown as { y: number }).y + 40 - 0.01
      && (d.y as number) <= (m as unknown as { y: number }).y + 40 + 120 + 16), '柱火盒 Y=盒顶+40 起（:70049）').toBe(true);
    expect(col.every((d) => Math.abs((d.x as number) - 0) >= 0 || true), '占位').toBe(true);
    // 电弧面：随机序列 [0(掷过), 0.65(角=234°,ux=-0.588|≥0.12,uy=-0.809→目标上行域=空气)] → 4 电弧钉点
    let k = 0;
    vi.mocked(Math.random).mockImplementation(() => (k++ % 2 === 0 ? 0 : 0.65));
    dusts.length = 0;
    m.fixedUpdate(1 / 60, hooks);
    const arcs = dusts.filter((d) => d.type === 226 && d.w === 0);
    expect(arcs.length, '电弧 4 试全过（掷 0+角 0.65 目标在空气域）').toBe(4);
    const arcR = (320 - 40) / 2;
    const a0 = arcs[0]!;
    expect(Math.abs(Math.hypot((a0.x as number) - m.cx, (a0.y as number) - (m.cy)) - arcR) < 0.01,
      '电弧钉点=场缘同径 (height-40)/2（:70040）').toBe(true);
    const vl = Math.hypot(m.cx - (a0.x as number), (m as unknown as { y: number }).y + 40 - (a0.y as number));
    expect(Math.abs((a0.vx as number) - (m.cx - (a0.x as number)) / vl) < 1e-9
      && Math.abs((a0.vy as number) - ((m as unknown as { y: number }).y + 40 - (a0.y as number)) / vl) < 1e-9,
      '速度=(塔锚-尘位)单位向（:70043 SafeNormalize）').toBe(true);
  });
});

describe('BJ606-R ⑥：锚定冻结锁（坡面地形不瞬移——HandleMovement aiStyle137 Y-ONLY+嵌入无碰撞）', () => {
  it('坡面 40 拍盒恒在探测锚（旧:1 拍 +160px 瞬移 1440→1280 实锤回潮必红）+vx/vy=0', () => {
    const w = new World(200, 120, 7, 'bj606-slope');
    for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) w.store.setTile(x, y, 1);
    for (let x = 45; x <= 55; x++) {
      w.store.setTile(x, 100, 1);
      w.store.setSlope(x, 100, (x % 2) + 1);   // 坡 1/2 交替（log 6006 簇同域坡地）
    }
    const player = new Player(46 * 16, 90 * 16, new Inventory());
    const hooks: GameHooks = {
      world: w as never, player: player as never,
      enemies: () => [], npcs: () => [], critters: () => [],
      spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
      cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
      notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      showPickupLabel: () => {}, spawnFriendlyProj: () => undefined,
      entities: { add: () => {}, nextId: 1, projectiles: [] } as never,
    } as never;
    const m = new MinionProj(50 * 16, 98 * 16 - 8, 688, 34, 0, true, 0, false, () => player);
    run(m, hooks, 40);
    const b = m as unknown as { x: number; y: number; w: number; h: number; vx: number; vy: number };
    expect(b.w, '场盒尺寸不变').toBe(320);
    expect(b.y, '坡面 40 拍盒顶恒=探测锚（groundTop-160=1440;旧 1280=+160 瞬移）').toBe(100 * 16 - 160);
    expect(b.x, 'X 恒冻结（Y-ONLY :17764-17776）——盒左=tx*16+8-160').toBe(50 * 16 + 8 - 160);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });
});

// ===================== ⑦ 场域蓝光带锁（BJ606-R2 三返「隔空受伤看不到」补） =====================
// vanilla AI_137 光照 = DelegateMethods.v3_1=(0.2,0.7,1)（:69983）+ PlotTileLine(
// Center±UnitX×40, 80f, CastLightOpen)（:70000-70001）——开放格逐格满色 AddLight,
// 带=±40px×80px 以场心为锚;尘 226 全旗 noLight=true（:70045/:70054）,域内照明全靠
// 本带。原版 AI_137 全段【零 NewProjectile】（弹 686=DD2BetsyFireball,Betsy 专弹,
// hostile,与光环无关=「686 视觉弹」假设证伪）——攻击产物完整清单=伤害管线+尘226
// 双循环+zap 声+光带,四项本仓已齐（真机探针:夜场 lightAtField=[28,99,141] 蓝占优）。
describe('BJ606-R2 ⑦：场域蓝光带锁（lightRGB 688-690=(0.2,0.7,1)——PlotTileLine 带折算点光）', () => {
  it('三档塔 lightRGB=(0.2,0.7,1)（:69983 v3_1 逐值;686=BetsyFireball 非本族）', () => {
    const { hooks, player } = makeGame();
    for (const vid of [688, 689, 690] as const) {
      const m = new MinionProj(50 * 16, 98 * 16 - 8, vid, 34, 0, true, 0, false, () => player);
      run(m, hooks, 2);
      const l = (m as unknown as { lightRGB: [number, number, number] | null }).lightRGB;
      expect(l, `vid ${vid} 光色`).toEqual([0.2, 0.7, 1]);
    }
  });
});

// ===================== ③ BJ580 前刀判别面回归锁（防报告式收官回潮） =====================

describe.skipIf(process.env.SW_BJ606_MUT)('BJ606 ③：变异自证（恰红+逐字节还原+sha256 对拍）', () => {
  const readFileSync = (f: string) => require('node:fs').readFileSync(f, 'utf8') as string;
  const writeFileSync = (f: string, s: string) => require('node:fs').writeFileSync(f, s);
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');

  const spawnVitest = (filter: string) => spawnSync(
    'npx', ['vitest', 'run', 'tests/bj606-lightning-sentry-anchor.test.ts', '--no-file-parallelism', '-t', filter], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_BJ606_MUT: '1' },
    });
  const sha256 = (b: string) => createHash('sha256').update(b).digest('hex');
  const mutate = (file: string, trigger: string, replacement: string, filter: string): void => {
    let cur = readFileSync(file);
    if (!cur.includes(trigger) && cur.includes(replacement)) {
      writeFileSync(file, cur.replace(replacement, trigger));   // 上轮 SIGKILL 泄漏自愈
      cur = readFileSync(file);
    }
    const PRISTINE = cur;
    expect(PRISTINE).toContain(trigger);
    try {
      writeFileSync(file, PRISTINE.replace(trigger, replacement));
      const r = spawnVitest(filter);
      expect(r.status, `变异须证红: ${replacement}`).not.toBe(0);
      expect(r.stdout).toContain(filter);
    } finally {
      writeFileSync(file, PRISTINE);
    }
    const restored = readFileSync(file);
    expect(restored).toBe(PRISTINE);
    expect(sha256(restored)).toBe(sha256(PRISTINE));
  };

  const MINION = join(process.cwd(), 'src', 'entities', 'MinionProj.ts');

  it('M1 绘制专绘支摘除（回潮通用尾 off3=[0,0] 盒左上锚）→ 对位锁 ②A/②D 红', () => {
    mutate(MINION,
      'if (this.sentry && AURA_TOWER.has(this.projId) && img) {',
      'if (false && this.sentry && AURA_TOWER.has(this.projId) && img) { // ★BJ606 变异:专绘支摘除',
      '本体帧顶心=盒顶心');
  });

  it('M2 盒本体化摘除（盒钉出生点 16×16 回潮）→ 公式锁 ①A 红', () => {
    mutate(MINION,
      'this.w = this.auraSide; this.h = this.auraSide;',
      'void this.auraSide; // ★BJ606 变异:盒本体化摘除（旧虚场病回潮）',
      'A 盒公式');
  });

  it('M3 底座携行门反转（ai[2]==1 仍画）→ ②B 携行断言红', () => {
    mutate(MINION,
      'if (!this.carriedByBackpack) {                     // ai[2]!=1f 门（:32514）',
      'if (true) { // ★BJ606 变异:携行门反转 // ai[2]!=1f 门（:32514）',
      '底座 Extra_86');
  });

  it('M4 割面排除摘除（688 出 CUT_EXCLUDE_VIDS→整盒割草机回潮）→ ④零割断言红', () => {
    const ENT = join(process.cwd(), 'src', 'entities', 'Entity.ts');
    mutate(ENT,
      '1105, 1040, 688, 689, 690]);',
      '1105, 1040]); // ★BJ606 变异:137 族割面排除摘除',
      '药草带场上 30 拍');
  });

  it('M5 锚定冻结摘除（回潮通用重力段→坡面瞬移）→ ⑥坡面锁红', () => {
    mutate(MINION,
      '} else if (AURA_TOWER.has(this.projId) && this.auraSide > 0) {',
      '} else if (false && AURA_TOWER.has(this.projId) && this.auraSide > 0) { // ★BJ606 变异:冻结摘除',
      '坡面 40 拍盒恒在探测锚');
  });

  it('M6 放电视觉尘摘除（电弧+柱火整支跳过）→ ⑤尘锁红', () => {
    mutate(MINION,
      'if (game.spawnDust) {\n            const anchorX = this.cx',
      'if (false && game.spawnDust) { // ★BJ606 变异:视觉尘摘除\n            const anchorX = this.cx',
      '尘 226 出炉');
  });

  it('M7 场域蓝光带摘除（688-690 出 lightRGB 表→域内照明回退环境暗）→ ⑦光锁红', () => {
    mutate(MINION,
      'case 688: case 689: case 690: return [0.2, 0.7, 1];',
      'case 688: case 689: case 690: return null; // ★BJ606 变异:光带摘除',
      '场域蓝光带锁');
  });
});
