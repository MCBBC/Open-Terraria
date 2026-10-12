// ★BJ612（2026-10-10 用户复报+F3 物证复验：蜘蛛女王法杖哨兵 377 两症状再定谳+落刀）
//
// 用户原话:「蜘蛛女王法杖召唤出来的哨兵还是只有一半贴图,而且只能落在实体物块上」
//   + F3 截图(image-cache 89.png):橙红虚线盒 66×50、盒内仅竖条残躯(≈31px 宽,
//   左腿在/右腿截)= BJ-C9-SP 后现役构建的真实呈现。
//
// 症状①「只有一半贴图」= **贴图代际错配定谳**(BJ-C9-SP 症状①旧论被翻案):
//   BJ-C9-SP 拿仓内 Projectile_377.png(66×450,=1.4.5.6 代旧图)当 1457 value139
//   钉「帧内左右镜像对」契约 → 把病钉成了金标。真身(本机 1.4.5.8 正版 XNB 解码,
//   Terraria.app/Contents/Resources/Content/Images/Projectile_377.xnb):
//   · 解压 237777B − 177B 对象头 = 237600px = 132×450×4(377)/586560px = 188×780(308)
//     ——旧 66×450/94×780 的**整 2 倍**(378/966 比 1.0 未变=只重制两哨兵塔)。
//   · 1457 起贴图每帧【左右两姿并排】:左半=部署姿(ai[2]==0,x15=0)/右半=背包携行
//     收腿姿(ai[2]==1,x15=num481)。左右 α 差 13.5% ≠ 镜像对;旧图=新图左半逐像素
//     全等(diff 0/29700)。
//   · Main.cs:34956 `num481 /= 2` 在 132 宽上 = 66 = 一只完整蜘蛛;
//     num153(:30303 (W−bw)/2+bw/2=66) /=2 → 33=W/4 锚;num151=−6 仅 377(:30190)。
//   病根 = 绘制码(SW-FX6 债③,结构忠实)×旧贴图 → halfW=33 画断肢残蛛。
//   落刀 = 贴图资产换真身三处(public/sprites/vanilla + terraria-assets/Images +
//   mobile 两壳 assets;projSprite 直读文件不经 vanilla.json 图集,377/308 无图集键)
//   + 绘制码零改(halfW 动态=sheet.width/2)。本套件把「真身资产×对位公式」双锁钉死。
//
// 症状②「只能落在实体物块上」= BJ-C9-SP 症状②同域复述(F3 盒 66×50 坐落草地=
//   已落地面态;修复=isSolid2 平台计入+越行补漏,盘面在位且测试绿)。本套件按
//   BJ606 判例「报告式收官须逐条核盘上落痕」补三面:平台即止(三杖)/边列窗
//   (平台仅在 tx±1 列)/嵌入 10px 首拍承接,加 TileStore 平台差集变异锁。
//
// 同域登记(不越界):377/308 染料通道未接线——draw 半宽切片块直用 projSprite 原片,
//   不走 dFrameImg 染料闭包(原版 GetProjectileDesiredShader 对哨兵生效);且接线时
//   projFrameSrcRect/Arrow 对两姿宽片 sw=img.width 须同步半宽化(否则 T0 相位错)。
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });   // ★残留普查波:变异自证三层守卫跨套件互斥下锁等待/内层 spawn 可超默认 5s——按仓内习语放宽（fx-codegen-parity 同款）
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// pngjs 无类型声明（同 tests/atlas-append-golden.test.ts 既有用法）
// @ts-ignore
import { PNG } from 'pngjs';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { MinionProj, pickSentryLandingSpot } from '../src/entities/MinionProj';
import { setProjSpriteOverride } from '../src/entities/Arrow';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { lockSpiderMutation, unlockSpiderMutation, assertPristineDisk } from './spider-sentry-mutation-mutex';
import { withMutation } from './mutation-guard';   // ★残留普查波:变异自证统一守卫（三层:文件互斥/panic 还原/残留自检）
import type { GameHooks } from '../src/entities/types';

const ROOT = process.cwd();
const SHEET_377 = join(ROOT, 'public', 'sprites', 'vanilla', 'Projectile_377.png');
const SHEET_308 = join(ROOT, 'public', 'sprites', 'vanilla', 'Projectile_308.png');

// ===================== A. 资产真身锁（贴图代际错配防回潮） =====================

describe('BJ612 A. 377/308 贴图真身 = 1457 双姿宽片（132×450 / 188×780）', () => {
  let png377: PNG, png308: PNG;

  beforeAll(() => {
    png377 = PNG.sync.read(readFileSync(SHEET_377));
    png308 = PNG.sync.read(readFileSync(SHEET_308));
  });

  it('尺寸 = 132×450 / 188×780（1457 重制真身;旧 66/94 宽=断肢病根不得回潮）', () => {
    expect(png377.width, '377 真身宽=2×盒宽(旧 66 宽图=半图病根)').toBe(132);
    expect(png377.height, '377 帧高 450=9 帧×50').toBe(450);
    expect(png308.width, '308 真身宽=2×盒宽').toBe(188);
    expect(png308.height, '308 帧高 780=10 帧×78').toBe(780);
    expect(450 % 9, 'projFrames[377]=9 整除').toBe(0);
    expect(780 % 10, 'projFrames[308]=10 整除').toBe(0);
  });

  it('双姿 texel 证：左右半均非空且互异（左右镜像对旧论判据,非镜像=两姿）', () => {
    const cov = (png: PNG, halfW: number, xOff: number): number => {
      let n = 0;
      for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < halfW; x++) {
          if (png.data[((y * png.width) + x + xOff) * 4 + 3] > 0) n++;
        }
      }
      return n;
    };
    const halfW377 = 66;
    const left = cov(png377, halfW377, 0);
    const right = cov(png377, halfW377, halfW377);
    expect(left, '左半(部署姿)非空').toBeGreaterThan(1000);
    expect(right, '右半(携行姿)非空').toBeGreaterThan(1000);
    let diff = 0;
    for (let y = 0; y < png377.height; y++) {
      for (let x = 0; x < halfW377; x++) {
        const al = png377.data[((y * 132) + x) * 4 + 3];
        const ar = png377.data[((y * 132) + x + 66) * 4 + 3];
        if (Math.abs(al - ar) > 8) diff++;
      }
    }
    const ratio = diff / (halfW377 * png377.height);
    expect(ratio, '左右两姿互异>3%(镜像对旧论下≈0;实测 13.5%)').toBeGreaterThan(0.03);
    // 308 同构
    const l308 = cov(png308, 94, 0);
    const r308 = cov(png308, 94, 94);
    expect(l308).toBeGreaterThan(1000);
    expect(r308).toBeGreaterThan(1000);
  });
});

// ===================== B. 半图对位公式锁（真身尺寸驱动 recording-ctx） =====================

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

describe('BJ612 B. 377/308 对位公式锁（num481=W/2、num153=W/4、num151=−6 逐值）', () => {
  beforeAll(() => {
    (globalThis as Record<string, unknown>).Image = class {
      src = ''; onload: (() => void) | null = null; width = 0; height = 0;
    };
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

  /** 用真身 PNG 实际尺寸作 stub(资产↔绘制链式锁:旧 66 宽图回流即本节红) */
  const realDims = (file: string): { width: number; height: number } => {
    const png = PNG.sync.read(readFileSync(file));
    return { width: png.width, height: png.height };
  };

  function drawSentry(vid: 308 | 377, file: string, facing: number, boxW: number, boxH: number, carried = false): RecOp[] {
    setProjSpriteOverride(vid, realDims(file) as never);
    const g = new MinionProj(100, 200, vid, 26, 7.5, true, 0, false, () => null);
    (g as unknown as { w: number; h: number }).w = boxW;
    (g as unknown as { h: number }).h = boxH;
    (g as unknown as { s53Frame: number }).s53Frame = 0;
    (g as unknown as { facing: number }).facing = facing;
    (g as unknown as { carriedByBackpack: boolean }).carriedByBackpack = carried;
    const { ctx, ops } = recordingCtx();
    g.draw({ ctx } as never);
    return ops;
  }

  it('377 部署态：源(0,f×50,66,49)+锚(x+33,y+25)+dest(−33,−19)——完整蜘蛛 1:1(:35047)', () => {
    const ops = drawSentry(377, SHEET_377, 1, 66, 50);
    const tr = ops.find((o) => o.m === 'translate');
    expect(tr?.a, '锚 x=盒左+W/4=100+33（num153=(132−66)/2+33=66→/2）').toEqual([133, 225]);
    const draw = ops.find((o) => o.m === 'drawImage');
    expect(draw, '半宽切片出图').toBeTruthy();
    const a = draw!.a as number[];
    expect(a.slice(1, 5), '源=左半部署姿全宽 66（33px=断肢病根判别）').toEqual([0, 0, 66, 49]);
    expect(a.slice(5, 9), 'dest(−33,−(25−6),66,49)（origin=盒高/2+num151=−6）').toEqual([-33, -19, 66, 49]);
    expect(ops.some((o) => o.m === 'set:imageSmoothingEnabled' && o.a[0] === false)).toBe(true);
  });

  it('377 携行态：源 x=右半列 66（收腿姿）——x15=num481(:34954-34956)', () => {
    const ops = drawSentry(377, SHEET_377, 1, 66, 50, true);
    const draw = ops.find((o) => o.m === 'drawImage')!;
    expect((draw.a as number[])[1], '携行源 X=66').toBe(66);
    expect((draw.a as number[])[3], '携行源宽仍 66').toBe(66);
  });

  it('377 朝左镜像 scale(−1,1)（AI_053 spriteDirection 面）', () => {
    const ops = drawSentry(377, SHEET_377, -1, 66, 50);
    expect(ops.some((o) => o.m === 'scale' && (o.a as number[])[0] === -1), '朝左镜像').toBe(true);
  });

  it('308 部署态：源(0,f×78,94,77)+锚(x+47,y+37)+dest(−47,−37)——同构核', () => {
    const ops = drawSentry(308, SHEET_308, 1, 80, 74);
    const tr = ops.find((o) => o.m === 'translate');
    expect(tr?.a, '锚=(100+47,200+37)').toEqual([147, 237]);
    const a = (ops.find((o) => o.m === 'drawImage')!.a) as number[];
    expect(a.slice(1, 5)).toEqual([0, 0, 94, 77]);
    expect(a.slice(5, 9)).toEqual([-47, -37, 94, 77]);
  });
});

// ===================== C. 落地面锁（症状②复验：BJ606 判例=盘上落痕逐条核） =====================

const W = 80, H = 130;
const PLATFORM_ROW = 100;
const GROUND_ROW = 104;

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
  return { hooks };
}

const run = (e: { fixedUpdate: (dt: number, g: GameHooks) => void; dead?: boolean }, g: GameHooks, n: number): void => {
  for (let i = 0; i < n && !e.dead; i++) e.fixedUpdate(1 / 60, g);
};

describe('BJ612 C. 落地面锁（平台即止/边列窗/嵌入 10px 首拍承接）', () => {
  it('三杖平台即止（1572/2366/5119）——SolidTile2 三列扫平台计入(:50057+Main.cs:8032)', () => {
    const st = makeWorld();
    for (let x = 20; x < 23; x++) st.setTile(x, PLATFORM_ROW, PLATFORM, 0, 0);
    for (const id of [1572, 2366, 5119]) {
      const spot = pickSentryLandingSpot(st, 21 * 16 + 8, (PLATFORM_ROW - 2) * 16 + 8, id, H);
      expect(spot.y, `${id} 平台行即止`).toBe((PLATFORM_ROW - 1) * 16 - 24);
    }
  });

  it('边列窗：平台仅在 tx+1 单列,鼠标在 tx 列也即止（三列窗 tx−1/tx/tx+1）', () => {
    const st = makeWorld();
    st.setTile(22, PLATFORM_ROW, PLATFORM, 0, 0);
    const spotR = pickSentryLandingSpot(st, 21 * 16 + 8, (PLATFORM_ROW - 2) * 16 + 8, 2366, H);
    expect(spotR.y, '右邻列平台即止').toBe((PLATFORM_ROW - 1) * 16 - 24);
    st.setTile(22, PLATFORM_ROW, 0, 0, 0);
    st.setTile(20, PLATFORM_ROW, PLATFORM, 0, 0);
    const spotL = pickSentryLandingSpot(st, 21 * 16 + 8, (PLATFORM_ROW - 2) * 16 + 8, 2366, H);
    expect(spotL.y, '左邻列平台即止').toBe((PLATFORM_ROW - 1) * 16 - 24);
  });

  it('端到端：出生盒底嵌入平台行 10px(vy=15)→首拍承接,盒底=平台顶 P×16 稳驻', () => {
    const st = makeWorld();
    for (let x = 20; x < 23; x++) st.setTile(x, PLATFORM_ROW, PLATFORM, 0, 0);
    const { hooks } = makeHooks(st);
    const spot = pickSentryLandingSpot(st, 21 * 16 + 8, (PLATFORM_ROW - 2) * 16 + 8, 2366, H);
    // 原版出生盒底 = spawnY+50 = P×16+10（PickSentryLandingSpot :50058 spawnY=i×16−24）
    expect(spot.y + 50).toBe(PLATFORM_ROW * 16 + 10);
    const g = new MinionProj(spot.x, spot.y, 377, 26, 7.5, true, 0, false, () => null);
    g.vy = 15;                                   // speedY11=15（Player.cs:48731）
    run(g, hooks, 90);
    expect(g.dead).toBe(false);
    expect(g.onGround, '平台顶落地').toBe(true);
    expect(g.y + g.h, '盒底=平台行顶').toBe(PLATFORM_ROW * 16);
    // 实心对照列照旧落地
    const spotSolid = pickSentryLandingSpot(st, 60 * 16 + 8, 50 * 16 + 8, 2366, H);
    expect(spotSolid.y).toBe((GROUND_ROW - 1) * 16 - 24);
    // 悬浮三件免扫描
    const fl = pickSentryLandingSpot(st, 60 * 16 + 8, 50 * 16 + 8, 3571, H);
    expect(fl.y).toBe(50 * 16 - 24);
  });
});

// ===================== D. 变异自证（恰红+逐字节还原+sha256 对拍） =====================

describe.skipIf(process.env.SW_BJ612_MUT)('BJ612 D. 变异自证', () => {
  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
  // ★BJ612 事故共锁（见 tests/spider-sentry-mutation-mutex.ts 头注）：本节 M-A 与
  //  BJ-C9-SP M9 同变异 MinionProj.ts——D 面持锁串行化+锁内毒盘面哨兵。
  beforeAll(() => { lockSpiderMutation(); });
  afterAll(() => { unlockSpiderMutation(); });

  const spawnVitest = (filter: string) => spawnSync(
    'npx', ['vitest', 'run', 'tests/bj612-spiderqueen-sentry-recheck.test.ts', '--no-file-parallelism', '-t', filter], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_BJ612_MUT: '1' },
    });
  // ★残留普查波 2026-10-12:BJ606 习语统一改造→tests/mutation-guard.ts 三层守卫
  //  （跨套件按文件互斥/panic-safe 还原/残留自检+自愈）;毒盘哨兵经 onPristine 钩沿用。
  //  逐字节还原对拍已由守卫 finally 内建（不一致即 throw）。
  const mutate = (file: string, trigger: string, replacement: string, filter: string): void => {
    withMutation(file, trigger, replacement, () => {
      const r = spawnVitest(filter);
      expect(r.status, `变异须证红: ${replacement}`).not.toBe(0);
      expect(r.stdout).toContain(filter);
    }, {
      label: `BJ612 ${filter}`,
      onPristine: (p) => { if (file === MINION) assertPristineDisk(p); },   // ★BJ612:毒盘面哨兵(并行变异污染拒绝捕获)
    });
  };

  const MINION = join(process.cwd(), 'src', 'entities', 'MinionProj.ts');
  const TSTORE = join(process.cwd(), 'src', 'world', 'TileStore.ts');

  it('M-A 源半宽回潮（sheet.width/2→整宽,双蜘蛛/断肢判别面）→ B 节源矩形红', () => {
    mutate(MINION,
      'const halfW = Math.floor(sheet.width / 2);                     // num481（:34952）',
      'const halfW = Math.floor(sheet.width);                         // ★BJ612 变异:整宽回潮',
      '377 部署态');
  });

  it('M-B 平台差集摘除（isSolid2 平台九件套恒假→落点穿平台）→ C 节平台即止红', () => {
    mutate(TSTORE,
      'return TileStore.PLATFORM_SOLID2_SHEETS.has(',
      'return false && TileStore.PLATFORM_SOLID2_SHEETS.has( // ★BJ612 变异:平台差集摘除',
      '三杖平台即止');
  });
});
