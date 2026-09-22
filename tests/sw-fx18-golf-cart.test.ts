// SW-FX18 2026-09-10 高尔夫球车坐骑补债批（item 4264 / mount 17
// GolfCartSomebodySaveMe）：数据锚 + 前倾副帧状态机 + 车轮尘 + 车头灯 + 槽分类。
// 金标锚（Terarria1457）：
//   - Item.cs:36676-36689 case 4264：mountType = 17（ItemID.cs:10074 GolfCart）
//   - MountID.cs:21 Cart 集【不含】17（球车不上轨道）/:68 GolfCartSomebodySaveMe=17
//   - Mount.cs MountData case 17 段：runSpeed 8 / acceleration 0.25 / jumpHeight 20 /
//     jumpSpeed 8.01 / fallDamage 0.2 / heightBoost 16 / totalFrames 4 / buff 212
//   - Mount.cs:4614-4662 UpdateFrame_GolfCart：副帧 0↔2 @6 拍（2 挂 -1 衰减闩）+
//     跑动态两轮位尘触发窗（state ∉ {0,2,3,4}）
//   - Mount.cs:4710-4742 EmitGolfCartWheelDust：每轮 1/5 掷 + WorldGen.SolidTile 门
//     + 速度 = tileDust×0.2 + (−direction, −gravDir)
//   - Mount.cs:4685-4703 EmitGolfCartlight：5 束 ×π/32 间隔 ×200px、
//     (0.7,0.7,0.7)×Lerp(0.65,1,dist/12.5)、首实心截断；:4705 ShouldGolfCartEmitLight
//     恒 true；:4667 EmitGolfCartSmoke = 反编译零调用者（原版死码,不移植=登记）
//   - Mount.cs:5656-5670 drawType 1 → _frameExtra(num4=4)；:6043-6054 灯辉层 =
//     Extra_96 第 4 行 White A=0（XNA α=0 纯加法）
//   - GolfState.cs:125-133：held==3611 保持跟踪——3611 = 宏伟蓝图 WireKite
//     (ItemID.cs:8768),【非】高尔夫球车（4264）；IIIII233 误读已正名（行为 1:1 未动）
// 运行:npx vitest run tests/sw-fx18-golf-cart.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MOUNT_DATA, MOUNT_SETS, mountOfItem, mountOfBuff, isCartMount,
  MountInstance, mountLights,
  FRAME_STANDING, FRAME_RUNNING, FRAME_IN_AIR, FRAME_SWIMMING,
  type MountedPlayerView, type MountEffectsCtx,
} from '../src/entities/Mounts';
import { equipKindOfVid, miscSlotAccepts } from '../src/data/vanillaEquip';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { seededRandom, BATTERY_SEED } from './seeded-rng';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  expect(k).toBeDefined();
  return ITEM_BY_KEY[k!];
};
const defOfVid = (vid: number) => ITEM_DEFS.find((d) => d && (d.vid ?? -1) === vid);   // ★BJ283 parseInt 兜底退役(方案 A ⑥等价定谳)

/** MountInstance 单元测试用玩家视图桩（mounts.test.ts 同款） */
const view = (over: Partial<MountedPlayerView> = {}): MountedPlayerView => ({
  x: 100, y: 100, w: 20, h: 42, vx: 0, vy: 0,
  onGround: true, inWater: false, facing: 1,
  inputX: 0, inputJump: false, inputUp: false, inputDown: false,
  prevInputJump: false, gravDir: 1, store: null, ...over,
});

describe('SW-FX18 高尔夫球车：数据锚（Mount.cs MountData case 17 / Item.cs 4264）', () => {
  it('召唤链：4264 → mount 17 → buff 212（Item.cs:36686 mountType=17）', () => {
    expect(mountOfItem(4264)).toBe(17);
    expect(mountOfBuff(212)).toBe(17);
    const def = defOfVid(4264);
    expect(def).toBeDefined();
    expect(def!.key).toContain('vi_4264_');
  });

  it('MountData 逐值（Mount.cs case 17 初始化段）', () => {
    const d = MOUNT_DATA['17'];
    expect(d).toBeDefined();
    expect(d!.runSpeed).toBe(8);
    expect(d!.acceleration).toBe(0.25);
    expect(d!.jumpHeight).toBe(20);
    expect(d!.jumpSpeed).toBeCloseTo(8.01);
    expect(d!.fallDamage).toBeCloseTo(0.2);
    expect(d!.heightBoost).toBe(16);
    expect(d!.totalFrames).toBe(4);
    expect(d!.buff).toBe(212);
    expect(d!.backTexture).toBe('Extra_97.png');
    expect(d!.backTextureExtra).toBe('Extra_96.png');
  });

  it('Cart 集不含 17（MountID.cs:21——球车不上轨道）但含矿车 6', () => {
    expect(isCartMount(17)).toBe(false);
    expect(MOUNT_SETS.Cart?.[17] ?? false).toBe(false);
    expect(isCartMount(6)).toBe(true);      // 基础矿车（MountID.cs:46 Minecart=6）
  });

  it('装备分类：4264 = mount 槽（ItemSlot.cs:1308 case 17 非 Cart）、2343 = cart 槽', () => {
    expect(equipKindOfVid(4264)).toBe('mount');
    expect(equipKindOfVid(2343)).toBe('cart');
    // 高尔夫球车钥匙进坐骑槽（miscEquips[3]）,不进矿车槽（miscEquips[2]）
    expect(miscSlotAccepts(3, iid(4264))).toBe(true);
    expect(miscSlotAccepts(2, iid(4264))).toBe(false);
    expect(miscSlotAccepts(2, iid(2343))).toBe(true);
    expect(miscSlotAccepts(3, iid(2343))).toBe(false);
  });
});

describe('SW-FX18 前倾副帧状态机（UpdateFrame_GolfCart Mount.cs:4614-4647 1:1）', () => {
  let m: MountInstance;
  beforeEach(() => { m = new MountInstance(); m.setMount(17, view()); });

  it('空中且下落（vy>=0）：6 拍/步升到 2,到 2 即冻结', () => {
    m.updateFrame(view(), FRAME_IN_AIR, 0, 0.1);
    expect(m.frameExtra).toBe(1);                        // 首拍 <1 → 置 1
    for (let t = 2; t <= 6; t++) m.updateFrame(view(), FRAME_IN_AIR, 0, 0.1);
    expect(m.frameExtra).toBe(2);                        // 第 6 拍 counter 满 → ++到 2
    for (let t = 0; t < 10; t++) m.updateFrame(view(), FRAME_IN_AIR, 0, 0.1);
    expect(m.frameExtra).toBe(2);                        // ==2 → 恒挂 -1 闩不再动
  });

  it('空中上升（vy<0）：两支都不进,副帧冻结于当前值', () => {
    for (let t = 0; t < 10; t++) m.updateFrame(view(), FRAME_IN_AIR, 0, -5);
    expect(m.frameExtra).toBe(0);                        // else-if(vy>=0) 不进
  });

  it('落地衰减：-1 闩拍先回 1,再 6 拍/步归 0', () => {
    for (let t = 0; t < 8; t++) m.updateFrame(view(), FRAME_IN_AIR, 0, 0.1);
    expect(m.frameExtra).toBe(2);
    // 落地（state≠2）：counter==-1 → 置 0/frameExtra=1 → ++ → 1；此后 5 拍到 6 → --归 0
    for (let t = 1; t < 6; t++) m.updateFrame(view(), FRAME_RUNNING, 4, 0);
    expect(m.frameExtra).toBe(1);                        // 衰减中
    m.updateFrame(view(), FRAME_RUNNING, 4, 0);          // 第 6 拍：counter 6 → frameExtra--
    expect(m.frameExtra).toBe(0);
    m.updateFrame(view(), FRAME_RUNNING, 4, 0);          // counter/fe 全零 → 恒 0
    expect(m.frameExtra).toBe(0);
  });
});

describe('SW-FX18 车轮尘（:4661-4662 触发窗 + :4710-4742 EmitGolfCartWheelDust）', () => {
  let m: MountInstance;
  const wheelCtx = (calls: Array<{ x: number; y: number; k: number }>): MountEffectsCtx => ({
    scutlixTargets: [],
    los: () => false,
    fishron: { hp: 100, maxHp: 100, inWater: false, inLava: false, inHoney: false, dripping: false, raining: false, windExposed: false },
    wheelDust: (x, y, k) => { calls.push({ x, y, k }); },
  });
  beforeEach(() => {
    m = new MountInstance(); m.setMount(17, view());
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(BATTERY_SEED));
  });
  afterEach(() => vi.restoreAllMocks());

  it('跑动态每 tick 两轮位各 1/5 掷;几何 = Bottom±20px、踢向 = −direction', () => {
    const calls: Array<{ x: number; y: number; k: number }> = [];
    m.updateFrame(view({ facing: 1 }), FRAME_RUNNING, 6, 0);
    m.updateMountEffects(view({ facing: 1 }), wheelCtx(calls));
    // 种子（BATTERY_SEED 前四掷 .728/.325/.841/.0045,每拍每轮各一掷）：
    // 首拍两掷全跳,次拍第 4 掷命中 = cx+20 轮
    m.updateFrame(view({ facing: 1 }), FRAME_RUNNING, 6, 0);
    m.updateMountEffects(view({ facing: 1 }), wheelCtx(calls));
    expect(calls.length).toBe(1);
    expect(calls[0].x).toBeCloseTo(110 + 20);            // cx+20（Bottom.x=Center.x）
    expect(calls[0].y).toBeCloseTo(142);                 // Bottom.y = y+h
    expect(calls[0].k).toBe(-1);                         // −facing
    // 几何两轮位全集 = cx±20（连跑多拍,种子化稳定）
    const xs = new Set<number>();
    for (let t = 0; t < 20; t++) {
      m.updateFrame(view({ facing: 1 }), FRAME_RUNNING, 6, 0);
      m.updateMountEffects(view({ facing: 1 }), wheelCtx(calls));
    }
    for (const c of calls) { xs.add(Math.round(c.x - 110)); expect(c.y).toBeCloseTo(142); expect(c.k).toBe(-1); }
    expect([...xs].sort((a, b) => a - b)).toEqual([-20, 20]);
  });

  it('掷门统计：每轮 ≈1/5（种子化 4000 tick;非跑动态恒不发）', () => {
    let fired = 0;
    const ctx: MountEffectsCtx = {
      scutlixTargets: [],
      los: () => false,
      fishron: { hp: 100, maxHp: 100, inWater: false, inLava: false, inHoney: false, dripping: false, raining: false, windExposed: false },
      wheelDust: () => { fired++; },
    };
    for (let t = 0; t < 4000; t++) {
      m.updateFrame(view(), FRAME_RUNNING, 6, 0);
      m.updateMountEffects(view(), ctx);
    }
    const rate = fired / 8000;                           // 两轮×4000 tick 掷位
    expect(rate).toBeGreaterThan(0.13);
    expect(rate).toBeLessThan(0.27);
    // 非跑动态（站立/空中/游泳）不发（:4650-4653 state 四排除）
    fired = 0;
    for (const st of [FRAME_STANDING, FRAME_IN_AIR, FRAME_SWIMMING]) {
      for (let t = 0; t < 50; t++) {
        m.updateFrame(view(), st, 0, 0);
        m.updateMountEffects(view(), ctx);
      }
    }
    expect(fired).toBe(0);
  });
});

describe('SW-FX18 车头灯（EmitGolfCartlight :4685-4703 + ShouldGolfCartEmitLight :4705）', () => {
  it('光源点 = Bottom+(direction×40,−20);5 束锥光,近端 0.65 档、远端 1.0 档', () => {
    const m = new MountInstance();
    m.setMount(17, view({ facing: 1 }));
    const out = mountLights(m, view({ facing: 1 }), {
      liquidColor: null, worldSurface: 100,
    });
    // 光头格：cx=110+40=150 → tile 9,y=142−20=122 → tile 7
    const headEntries = out.filter((l) => l.tx === 9 && l.ty === 7);
    expect(headEntries.length).toBeGreaterThanOrEqual(5);    // 5 束 t=0 共同起点
    // t≈0 → Lerp(0.65,1,0)=0.65（斜束后续步进可能再入此格,值只增不减）
    expect(Math.min(...headEntries.map((l) => l.r))).toBeCloseTo(0.7 * 0.65);
    // 远端（≈12.5 格）达 1.0 档
    const maxR = Math.max(...out.map((l) => l.r));
    expect(maxR).toBeCloseTo(0.7);
    // 全锥灰白等色（v3_1=(0.7,0.7,0.7)）
    for (const l of out) expect(l.r).toBe(l.g);
    // 5 束离散线覆盖格数充足
    expect(out.length).toBeGreaterThanOrEqual(60);
  });

  it('朝向翻转（direction=-1 → 基准角 π,锥光指向左）', () => {
    const m = new MountInstance();
    m.setMount(17, view({ facing: -1 }));
    const out = mountLights(m, view({ facing: -1 }), { liquidColor: null, worldSurface: 100 });
    // 光头 = cx=110−40=70 → tile 4（70/16=4.375）
    expect(out.some((l) => l.tx === 4 && l.ty === 7)).toBe(true);
    // 锥光整体在光头格左侧延伸（基准角 π,dx 恒负）
    expect(out.every((l) => l.tx <= 4)).toBe(true);
  });

  it('首实心格截断（CastLightOpen_StopForSolids_ScaleWithDistance :772-775 → 停线）', () => {
    // 12×24 格桩：光头行 y=7 上 x=14..16 竖墙（内部 id 1 泥土）
    const w = 40, h = 40;
    const type = new Uint16Array(w * h);
    const flags = new Uint8Array(w * h);
    const idx = (x: number, y: number) => y * w + x;
    for (let y = 5; y <= 9; y++) { flags[idx(14, y)] = 1; type[idx(14, y)] = 1; }
    const store = {
      w, h, type, flags,
      inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
      idx,
      isSolid: (x: number, y: number) => flags[idx(x, y)] === 1 && type[idx(x, y)] === 1,
    } as never;
    const m = new MountInstance();
    m.setMount(17, view({ facing: 1, store }));
    const out = mountLights(m, view({ facing: 1, store }), { liquidColor: null, worldSurface: 100 });
    // 直行束（y=7 行）在 x=14 处截断：无任何光点越过墙体
    expect(out.every((l) => !(l.ty === 7 && l.tx > 14))).toBe(true);
    // 墙前光点仍在
    expect(out.some((l) => l.ty === 7 && l.tx === 13)).toBe(true);
  });
});

describe('SW-FX18 结构锁（防回归锚）', () => {
  it('渲染层灯辉层（Mount.Draw :6043-6054 纯加法行）与 Mounts 车链锚在位', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const rendererSrc = readFileSync(join(root, 'src/render/Renderer.ts'), 'utf8');
    expect(rendererSrc).toContain("globalCompositeOperation = 'lighter'");   // White A=0 → 加法
    expect(rendererSrc).toContain('mnt.type === 17 && layer === \'back\'');
    const mountsSrc = readFileSync(join(root, 'src/entities/Mounts.ts'), 'utf8');
    expect(mountsSrc).toContain('UpdateFrame_GolfCart :4614-4647');
    expect(mountsSrc).toContain('EmitGolfCartSmoke');                        // 死码登记在案
    expect(mountsSrc).toContain('wheelDust');
  });

  it('GolfState 3611 = 宏伟蓝图正名（GolfState.cs:126 字面 type==3611）', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const golfSrc = readFileSync(join(root, 'src/world/golf/GolfState.ts'), 'utf8');
    expect(golfSrc).not.toContain('heldIsGolfCartMount');                    // 误读形参已除名
    expect(golfSrc).toContain('heldIsWireKite');
  });
});
