// ★BJ-C9-SP（2026-10-09 用户同域实报扩展审计：蜘蛛女王法杖 2366 哨兵两症状定谳+落刀）
//
// 身份定谳（1457 亲读）：ItemID.cs:6278 QueenSpiderStaff=2366（i18n 蜘蛛女王法杖），
//   Item.cs:23846-23864 SetDefaults：shoot=377/sentry=true/summon=true；
//   Projectile.cs:4617-4625 弹 377：66×50/aiStyle 53/sentry/timeLeft 36000。
//   哨兵族落点清单（Player.cs:48685）：{1572 StaffoftheFrostHydra→308,
//   2366→377,5119 HoundiusShootius→966} 走 PickSentryLandingSpot;
//   悬浮三件 {3571→641,3569→643,5463→1025} 免扫描。
//
// 症状②「只能落在实体物块上」= 真病,根因坐实：
//   PickSentryLandingSpot（Player.cs:50057）三列扫描谓词 = **WorldGen.SolidTile2**
//   （WorldGen.cs:70665-70680：active ∧ **tileSolid【无 !tileSolidTop 排除】** ∧
//   slope==0 ∧ !halfBrick ∧ !inActive）——Main.cs:8032 `tileSolid[19]=true`（平台
//   九件套 19/239/380/427/435-439 整批 tileSolid∧tileSolidTop,:10126-10136 循环）
//   ⇒ 原版扫描【平台即止】=哨兵可放平台。旧仓 isSolid 窄谓词（SOLID_LUT=defs.solid
//   =tileSolid∧!tileSolidTop）漏平台 → 扫描穿平台落实体 = 实报病灶。
//   落刀=TileStore.isSolid2（SolidTile2 1:1,含 slope/halfBrick 两排除——SolidTile2
//   有而 isSolid 宽谓词无）+pickSentryLandingSpot 换谓词;端到端=377 出膛 vy15
//   在平台面落地（moveAndCollide 平台顶承接既有面 :TileCollision 491 plat 门）。
// 症状①「只有一半贴图」= 绘制面对拍结论：
//   ★BJ612（2026-10-10）勘误翻案:旧论「帧内左右两半镜像对」系拿 1456 旧贴图
//   （66×450/94×780）当 value139 钉契约=跨版错配。1.4.5.7 重制两贴图为每帧
//   【左右两姿并排】（377=132×450 部署/携行两姿;308=188×780）,num481=W/2=66/94
//   =一只完整蜘蛛（左姿部署 ai[2]==0,右姿携行 ai[2]==1）;实证=本机 1.4.5.8 XNB
//   解码（237777−177=237600px;旧图=新图左半逐像素全等）。病根=绘制码忠实而
//   贴图旧版 → 33px 断肢残蛛（用户复报物证 F3 盒 66×50 内残躯）。修复=贴图
//   资产换真身（public/sprites/vanilla/ + terraria-assets/ + mobile 壳三处）,
//   绘制码零改（halfW 动态取 sheet.width/2）。本测试钉新契约（recording-ctx;
//   源半宽/锚/dest 逐值;回 33px 源或锚漂移→红）。
//   vanilla 主绘（Main.cs:34950-34957 特例 + :35047 通用尾）：num481/=2 → 源
//   半宽、num153/=2 → W/4、ai[2]==1 x15=num481 取右半、num151=-6 仅 377（:30190）。
// 同域登记（不越界）：DD2 光环塔 688-690（AI_137,AURA_TOWER 既有）召唤入口 =
//   3829-3831 不在 SENTRY_WAND_VIDS → 通用随从召唤路（非 PickSentryLandingSpot;
//   与原版放置面对拍未定谳）——原任务书「闪电光环塔穿模」域,另刀处理。
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });   // ★残留普查波:变异自证三层守卫跨套件互斥下锁等待/内层 spawn 可超默认 5s——按仓内习语放宽（fx-codegen-parity 同款）
import { join } from 'node:path';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { MinionProj, pickSentryLandingSpot } from '../src/entities/MinionProj';
import { setProjSpriteOverride } from '../src/entities/Arrow';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { lockSpiderMutation, unlockSpiderMutation, assertPristineDisk } from './spider-sentry-mutation-mutex';
import { withMutation } from './mutation-guard';   // ★残留普查波:变异自证统一守卫（三层:文件互斥/panic 还原/残留自检）
import type { GameHooks } from '../src/entities/types';

const W = 80, H = 130;
const PLATFORM_ROW = 100;   // 平台行（顶=P×16）
const GROUND_ROW = 104;     // 实心地面行（对照面）

function makeWorld(): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = GROUND_ROW; y < H; y++) store.setTile(x, y, 1);
  return store;
}

const PLATFORM = TILE_BY_KEY['platform']!;

function makeHooks(store: TileStore) {
  const player = new Player(40 * 16, 90 * 16, new Inventory());
  const hooks: GameHooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0,
    addDamageNumber: () => {}, cutTile: () => {}, onEnemyKilled: () => {},
    spawnEnemy: () => {}, spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    spawnDust: () => null,
    entities: { projectiles: [], add: () => {} },
  } as never;
  return { hooks, player };
}

const run = (e: { fixedUpdate: (dt: number, g: GameHooks) => void; dead?: boolean }, g: GameHooks, n: number): void => {
  for (let i = 0; i < n && !e.dead; i++) e.fixedUpdate(1 / 60, g);
};

// ===================== 症状②：落地/放置语义 =====================

describe('BJ-C9-SP 症状② PickSentryLandingSpot = SolidTile2（平台计入,Main.cs:8032）', () => {
  it('isSolid2 判据面：平台行真/半砖平台假/坡面假/石真（SolidTile2 1:1）', () => {
    const st = makeWorld();
    const px = 30;
    st.setTile(px, PLATFORM_ROW, PLATFORM, 0, 0);
    expect(st.isSolid2(px, PLATFORM_ROW), '平台(19) ∈ SolidTile2（tileSolid[19]=true,无 solidTop 排除）').toBe(true);
    expect(st.isSolid(px, PLATFORM_ROW), '对照:isSolid 窄谓词排除平台（差集根因）').toBe(false);
    st.half[st.idx(px, PLATFORM_ROW)] = 1;   // 锤下半砖平台
    expect(st.isSolid2(px, PLATFORM_ROW), 'halfBrick 排除（SolidTile2 :70672 !halfBrick）').toBe(false);
    st.half[st.idx(px, PLATFORM_ROW)] = 0;
    st.slope[st.idx(px, PLATFORM_ROW)] = 2;  // 坡面
    expect(st.isSolid2(px, PLATFORM_ROW), 'slope 排除').toBe(false);
    st.slope[st.idx(px, PLATFORM_ROW)] = 0;
    expect(st.isSolid2(px, GROUND_ROW), '实心石照旧真').toBe(true);
    expect(st.isSolid2(px, PLATFORM_ROW - 6), '空气假').toBe(false);
  });

  it('2366 落点扫描：平台即止（spawnY=(平台行−1)×16−24）——实报病灶判别面', () => {
    const st = makeWorld();
    for (let x = 20; x < 23; x++) st.setTile(x, PLATFORM_ROW, PLATFORM, 0, 0);
    // 鼠标在平台上：旧 isSolid 窄谓词穿平台落 103 行;SolidTile2 即止于 100 行
    const spot = pickSentryLandingSpot(st, 21 * 16 + 8, (PLATFORM_ROW - 2) * 16 + 8, 2366, H);
    expect(spot.y, '平台行即止（三列任一 SolidTile2 真）').toBe((PLATFORM_ROW - 1) * 16 - 24);
    expect(spot.y, '旧病灶值（穿平台落地面）不得回潮').not.toBe((GROUND_ROW - 1) * 16 - 24);
  });

  it('同族三杖同谓词（1572/5119/2366）+实心面/悬浮件零回归（r30r31 既有钉不动）', () => {
    const st = makeWorld();
    for (let x = 20; x < 23; x++) st.setTile(x, PLATFORM_ROW, PLATFORM, 0, 0);
    for (const id of [1572, 2366, 5119]) {
      const spot = pickSentryLandingSpot(st, 21 * 16 + 8, (PLATFORM_ROW - 2) * 16 + 8, id, H);
      expect(spot.y).toBe((PLATFORM_ROW - 1) * 16 - 24);
    }
    // 无平台列：照旧落到实心地面
    const spotSolid = pickSentryLandingSpot(st, 60 * 16 + 8, 50 * 16 + 8, 2366, H);
    expect(spotSolid.y).toBe((GROUND_ROW - 1) * 16 - 24);
    // 悬浮三件免扫描
    const fl = pickSentryLandingSpot(st, 60 * 16 + 8, 50 * 16 + 8, 3571, H);
    expect(fl.y).toBe(50 * 16 - 24);
  });

  it('端到端：377 出膛（vy15）落在平台顶（onGround+贴面）——放置即平台可驻', () => {
    const st = makeWorld();
    for (let x = 20; x < 23; x++) st.setTile(x, PLATFORM_ROW, PLATFORM, 0, 0);
    const { hooks } = makeHooks(st);
    const spot = pickSentryLandingSpot(st, 21 * 16 + 8, (PLATFORM_ROW - 2) * 16 + 8, 2366, H);
    const g = new MinionProj(spot.x, spot.y, 377, 26, 7.5, true, 0, false, () => null);
    run(g, hooks, 90);
    expect(g.dead).toBe(false);
    expect(g.onGround, '平台顶落地（moveAndCollide plat 门承接）').toBe(true);
    expect(g.y + g.h, '盒底=平台行顶（P×16）').toBe(PLATFORM_ROW * 16);
  });
});

// ===================== 症状①：半宽切片绘制契约 =====================

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

describe('BJ-C9-SP 症状① 377/308 半宽切片绘制契约（Main.cs:34950-34957+:35047 对拍钉死）', () => {
  beforeAll(() => {
    (globalThis as Record<string, unknown>).Image = class {
      src = ''; onload: (() => void) | null = null; width = 0; height = 0;
    };
    // projFrameImg 帧切片画布垫片（draw 前置 img 计算消费;吸掉 2d 调用即可）
    (globalThis as Record<string, unknown>).document = {
      createElement: () => {
        const cv: Record<string, unknown> = { width: 0, height: 0 };
        cv.getContext = () => new Proxy({}, { get: () => () => { /* noop */ }, set: () => true });
        return cv;
      },
    };
  });
  afterEach(() => {
    setProjSpriteOverride(377, undefined as never);
    setProjSpriteOverride(308, undefined as never);
  });

  function drawSentry(vid: 308 | 377, facing: number, sheetW: number, sheetH: number, boxW: number, boxH: number): RecOp[] {
    setProjSpriteOverride(vid, { width: sheetW, height: sheetH } as never);
    const g = new MinionProj(100, 200, vid, 26, 7.5, true, 0, false, () => null);
    (g as unknown as { w: number; h: number }).w = boxW;
    (g as unknown as { h: number }).h = boxH;
    (g as unknown as { s53Frame: number }).s53Frame = 0;
    (g as unknown as { facing: number }).facing = facing;
    const { ctx, ops } = recordingCtx();
    g.draw({ ctx } as never);
    return ops;
  }

  it('377：源(0,f×50,66,49)+锚(x+33,y+25)+dest(−33,−19)（132 宽真身 num153/2+num151=−6 逐参数）', () => {
    const ops = drawSentry(377, 1, 132, 450, 66, 50);
    const tr = ops.find((o) => o.m === 'translate');
    expect(tr?.a, '锚=盒左+W/4（num153=(132−66)/2+33=66→/2=33）非盒心（通用路 cx=x+33 判别）').toEqual([133, 225]);
    const draw = ops.find((o) => o.m === 'drawImage');
    expect(draw, '半宽切片出图（贴图 stub 在位）').toBeTruthy();
    const a = draw!.a as number[];
    expect(a.slice(1, 5), '源矩形 (x15=0, y25=0, 66, 49)（num481=132/2=完整蜘蛛+底行 −1 shave）').toEqual([0, 0, 66, 49]);
    expect(a.slice(5, 9), 'dest (−33, −(25−6), 66, 49)（origin=盒高/2+num151,num151=−6 :30190）')
      .toEqual([-33, -19, 66, 49]);
    expect(ops.some((o) => o.m === 'set:imageSmoothingEnabled' && o.a[0] === false)).toBe(true);
  });

  it('377 携行态（ai[2]==1）x15=半宽取右半姿（:34954-34956）+朝向镜像 scale(-1,1)', () => {
    const ops = drawSentry(377, 1, 132, 450, 66, 50);
    setProjSpriteOverride(377, { width: 132, height: 450 } as never);
    const g2 = new MinionProj(100, 200, 377, 26, 7.5, true, 0, false, () => null);
    (g2 as unknown as { w: number; h: number }).w = 66;
    (g2 as unknown as { h: number }).h = 50;
    (g2 as unknown as { s53Frame: number }).s53Frame = 0;
    (g2 as unknown as { carriedByBackpack: boolean }).carriedByBackpack = true;
    const { ctx, ops: ops2 } = recordingCtx();
    g2.draw({ ctx } as never);
    const draw2 = ops2.find((o) => o.m === 'drawImage')!;
    expect((draw2.a as number[])[1], '携行源 X=右半列 66（携行收腿姿）').toBe(66);
    // 朝向镜像面（facing=−1 → scale(−1,1)）
    const opsL = drawSentry(377, -1, 132, 450, 66, 50);
    expect(opsL.some((o) => o.m === 'scale' && (o.a as number[])[0] === -1), '朝左镜像').toBe(true);
    void ops;
  });

  it('308：同切片式（188×780/10 帧=78,halfW=94,num151=0 → dest −47）——同构核', () => {
    const ops = drawSentry(308, 1, 188, 780, 80, 74);
    const tr = ops.find((o) => o.m === 'translate');
    expect(tr?.a).toEqual([100 + 47, 200 + 37]);
    const draw = ops.find((o) => o.m === 'drawImage')!;
    const a = draw.a as number[];
    expect(a.slice(1, 5)).toEqual([0, 0, 94, 77]);   // 188/2、780/10=78−1 shave
    expect(a.slice(5, 9)).toEqual([-47, -37, 94, 77]);
  });
});

// ===================== E. 变异自证（恰红+逐字节还原+sha256 对拍） =====================

describe.skipIf(process.env.SW_BJ_C9_MUT)('BJ-C9-SP E. 变异自证', () => {
  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
  // ★BJ612 事故共锁（2026-10-10）：本节 M9 与 BJ612 M-A 同变异 MinionProj.ts,vitest
  //  多文件并行时 restore 窗交错曾把「含对方变异的盘面」当 PRISTINE 回写=变异泄漏
  //  固化（isSolid2→isSolid 被 bake,真机扫描回退,tsc 捕获）。D 面持锁串行化+
  //  锁内毒盘面哨兵（tests/spider-sentry-mutation-mutex.ts,npcdust-mutation-mutex 同族）。
  beforeAll(() => { lockSpiderMutation(); });
  afterAll(() => { unlockSpiderMutation(); });

  const spawnVitest = (filter: string) => spawnSync(
    'npx', ['vitest', 'run', 'tests/bj-c9-spiderqueen-sentry.test.ts', '--no-file-parallelism', '-t', filter], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_BJ_C9_MUT: '1' },
    });
  // ★残留普查波 2026-10-12:BJ606 习语统一改造→tests/mutation-guard.ts 三层守卫
  //  （跨套件按文件互斥/panic-safe 还原/残留自检+自愈）;毒盘哨兵经 onPristine 钩沿用。
  const mutate = (file: string, trigger: string, replacement: string, filter: string): void => {
    withMutation(file, trigger, replacement, () => {
      const r = spawnVitest(filter);
      expect(r.status, `变异须证红: ${replacement}`).not.toBe(0);
      expect(r.stdout).toContain(filter);
    }, {
      label: `BJ-C9-SP ${filter}`,
      onPristine: (p) => { if (file === MINION) assertPristineDisk(p); },   // ★BJ612:毒盘面哨兵(并行变异污染拒绝捕获)
    });
  };

  const MINION = join(process.cwd(), 'src', 'entities', 'MinionProj.ts');
  const TCOL = join(process.cwd(), 'src', 'physics', 'TileCollision.ts');

  it('M9 扫描谓词回退（isSolid2→isSolid 窄谓词,平台漏检回潮）→ 平台即止断言红', () => {
    mutate(MINION,
      'store.isSolid2(tx - 1, row) || store.isSolid2(tx, row) || store.isSolid2(tx + 1, row)',
      'store.isSolid(tx - 1, row) || store.isSolid(tx, row) || store.isSolid(tx + 1, row) /* ★C9-SP 变异 */',
      '2366 落点扫描');
  });

  it('M10 越行平台补漏摘除（穿平台回潮）→ 端到端平台落地红', () => {
    mutate(TCOL,
      // ★BJ609（2026-10-10）：门式随 fallThrough 半边落刀更新（旧锚 `dir > 0 && !b.dropThrough`）
      "if (dir > 0 && (!b.dropThrough || (b.platFallThrough === true && b.vy > 1))) {\n      for (let tyy = bottomRowOld; tyy < ty; tyy++) {",
      "if (false) {\n      for (let tyy = bottomRowOld; tyy < ty; tyy++) { // ★C9-SP 变异:越行补漏摘除",
      '端到端：377 出膛');
  });
});
