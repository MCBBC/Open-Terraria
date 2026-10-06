// 天塔柱族（Monolith）回归：SwitchMonolith 翻帧（WorldGen.cs:51023-51169）+
// SceneMetrics 视区扫描（SceneMetrics.cs:524-583）+ 滤镜状态机
// （SceneState.cs:105-128 / FilterManager.cs 斜坡与次序 / 各 ScreenShaderData.Update）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Wiring } from '../src/world/Wiring';
import { deviceTable, switchMonolith, type DeviceCtx } from '../src/world/wiring/devices';
import { TILE_BY_KEY } from '../src/data/tiles';
import {
  MonolithFilters, emptyMonolithScene, scanMonolithScene, visualScanRect,
  sepiaParams, smoothStep, type MonolithSceneState, type MonolithEnv,
} from '../src/render/MonolithFilters';

function makeCtx(): DeviceCtx {
  return {
    dropItem: () => {}, spawnNpc: () => true, mechSpawnOk: () => true, itemSpawnOk: () => true,
    shootProjectile: () => {}, countProjectiles: () => 0,
    doorOpen: () => true, doorClose: () => true, teleportPair: () => {},
    relocateTownNpc: () => true, explode: () => {}, toast: () => {}, sfx: () => {},
    extractinatorPull: () => null, dropItemStack: () => {}, worldSurface: 100,
  };
}

/** 200×200 世界（视区扫描测试需要留出 Inflate(28) 边距） */
function freshWorld() {
  const world = new World(200, 200, 7, 'open');
  world.groundLevel = 60; world.rockLevel = 120;
  return { world, w: new Wiring(world.store) };
}

const MONO_KEYS: Record<number, { key: string; w: number; step: number }> = {
  410: { key: 'v_410_lunarmonolith', w: 2, step: 56 },
  480: { key: 'v_480_bloodmoonmonolith', w: 2, step: 54 },
  509: { key: 'v_509_voidmonolith', w: 2, step: 54 },
  657: { key: 'v_657_echo_chamber', w: 2, step: 54 },
  658: { key: 'v_658_aether_monolith', w: 2, step: 54 },
  720: { key: 'v_720_crt_monolith', w: 2, step: 54 },
  721: { key: 'v_721_retro_monolith', w: 2, step: 54 },
  725: { key: 'v_725_film_projector', w: 2, step: 54 },
  733: { key: 'v_733_radio_thing', w: 3, step: 54 },
};

/** 放整块天塔柱：off 帧 frameY = 行*18；state ≥1 时偏移 sheet 步长
 *  （410 on 带 = 56 起，其余 = 54 起；658 三态 = state*54 起） */
function placeMonolith(w: Wiring, ox: number, oy: number, sheet: number, style = 0, state = 0) {
  const def = MONO_KEYS[sheet];
  const t = TILE_BY_KEY[def.key]!;
  const base = sheet === 410 ? (state > 0 ? 56 : 0) : sheet === 658 ? state * 54 : state > 0 ? 54 : 0;
  for (let cx = 0; cx < def.w; cx++) {
    for (let cy = 0; cy < 3; cy++) {
      w.st.setTileSilent(ox + cx, oy + cy, t, style * 36 + cx * 18, base + cy * 18);
    }
  }
}

/** 全图扫描矩形（测试用：覆盖整世界） */
const FULL = { x0: 0, y0: 0, x1: 200, y1: 200 };

function env(over: Partial<MonolithEnv> = {}): MonolithEnv {
  return {
    worldSurface: 60, rockLevel: 120, screenTileY: 60,   // 地表 → 深度系数 1
    dayTime: true, hour24: 12, nightElapsed01: 0.5,
    fullMoon: false, worldBloodMoon: false, cloudAlpha: 0,
    ...over,
  };
}

describe('SwitchMonolith 全族翻帧（WorldGen.cs:51023-51169）', () => {
  it('410 步长 56 / 其余步长 54；733 为 3×3 区块（:51026-51028 num=3）', () => {
    const { w } = freshWorld();
    placeMonolith(w, 20, 30, 410, 1);
    deviceTable(w, makeCtx(), 410, 21, 31);          // 块内任意格触发
    for (let cx = 0; cx < 2; cx++) {
      for (let cy = 0; cy < 3; cy++) {
        expect(w.st.frameY[w.st.idx(20 + cx, 30 + cy)]).toBe(56 + cy * 18);
      }
    }
    // 733：3 宽，右下角格触发也要翻满 3×3
    placeMonolith(w, 30, 30, 733);
    deviceTable(w, makeCtx(), 733, 32, 32);
    expect(w.st.frameY[w.st.idx(30, 30)]).toBe(54);
    expect(w.st.frameY[w.st.idx(32, 32)]).toBe(54 + 2 * 18);
  });

  it('658 以太柱三态循环（+54 对 162 取模，:51131-51140）', () => {
    const { w } = freshWorld();
    placeMonolith(w, 40, 30, 658, 0, 0);
    switchMonolith(w, 40, 30);                        // 0 → 1
    expect(w.st.frameY[w.st.idx(40, 30)]).toBe(54);
    switchMonolith(w, 40, 30);                        // 1 → 2
    expect(w.st.frameY[w.st.idx(40, 30)]).toBe(108);
    switchMonolith(w, 40, 30);                        // 2 → 0（回卷）
    expect(w.st.frameY[w.st.idx(40, 30)]).toBe(0);
  });

  it('480/509/657/720/721/725/733 各自 ±54 翻转后可还原', () => {
    const { w } = freshWorld();
    const sheets = [480, 509, 657, 720, 721, 725, 733];
    sheets.forEach((sh, k) => {
      placeMonolith(w, 10 + k * 5, 30, sh);
      switchMonolith(w, 10 + k * 5, 30);
      expect(w.st.frameY[w.st.idx(10 + k * 5, 30)]).toBe(54);
      switchMonolith(w, 10 + k * 5, 30);
      expect(w.st.frameY[w.st.idx(10 + k * 5, 30)]).toBe(0);
    });
  });
});

describe('SceneMetrics 视区扫描（SceneMetrics.cs:524-583）', () => {
  it('410/509 激活帧 ≥56 才赋类型（:524-536）；关帧不回写', () => {
    const { world } = freshWorld();
    const w = new Wiring(world.store);
    placeMonolith(w, 20, 30, 410, 2, 1);            // 星尘（开）
    placeMonolith(w, 30, 30, 410, 1, 0);            // 另一根关着
    const s = scanMonolithScene(world.store, FULL);
    expect(s.activeMonolithType).toBe(2);           // 只有激活帧生效
  });

  it('1.4.4 新柱族：480/657/720/721/725/733/658 全字段（:538-579）', () => {
    const { world } = freshWorld();
    const w = new Wiring(world.store);
    placeMonolith(w, 20, 40, 480, 0, 1);            // 血月柱开
    placeMonolith(w, 30, 40, 657, 0, 1);            // 回声柱开
    placeMonolith(w, 40, 40, 720, 0, 1);            // CRT 开
    placeMonolith(w, 50, 40, 721, 0, 1);            // 复古开
    placeMonolith(w, 60, 40, 725, 0, 1);            // 黑白开
    placeMonolith(w, 70, 40, 733, 0, 1);            // 收音机开
    placeMonolith(w, 80, 40, 658, 0, 1);            // 以太柱 state 1
    const s = scanMonolithScene(world.store, FULL);
    expect(s.bloodMoonMonolith).toBe(true);
    expect(s.echoMonolith).toBe(true);
    expect(s.crtMonolith).toBe(true);
    expect(s.retroMonolith).toBe(true);
    expect(s.noirMonolith).toBe(true);
    expect(s.radioThingMonolith).toBe(true);
    expect(s.shimmerMonolithState).toBe(1);
    expect(s.activeMonolithType).toBe(-1);
  });

  it('作用范围 = 屏幕区外扩 28 tile（Main.cs:61983-61985 Inflate(28)）', () => {
    const { world } = freshWorld();
    const w = new Wiring(world.store);
    // 相机中心 (100,100) tile、zoom 1、视区 64×48 tile：GetAreaToLight 左/上 -1、
    // 右/下 +2（Main.cs:63370-63373），再 Inflate(28,28) → x∈[95,162) y∈[103,154)
    const rect = visualScanRect(100 * 16, 100 * 16, 64 * 16, 48 * 16, 1, 200, 200);
    expect(rect.x0).toBe(100 - 32 - 1 + 28);
    expect(rect.y0).toBe(100 - 24 - 1 + 28);
    expect(rect.x1).toBe(100 + 32 + 2 + 28);
    expect(rect.y1).toBe(100 + 24 + 2 + 28);
    placeMonolith(w, 100, 120, 480, 0, 1);          // 圈内 → 命中
    placeMonolith(w, 93, 120, 720, 0, 1);           // 整块在 x0 外（93/94 < 95）→ 不命中
    const s = scanMonolithScene(world.store, rect);
    expect(s.bloodMoonMonolith).toBe(true);
    expect(s.crtMonolith).toBe(false);
  });

  it('扫描矩形夹取世界边界（SceneMetrics.cs:455 ClampToWorld）', () => {
    // 相机贴左上角：GetAreaToLight 左上为负（zoom 1.25 → 可见 640×480），
    // Inflate(28) 后 = floor(-320/16)-1+28 = 7 → 未越界只被 max(0,·) 兜底；
    // 右/下端夹到世界尺寸
    const r = visualScanRect(0, 0, 800, 600, 1.25, 200, 200);
    expect(r.x0).toBe(Math.floor(-320 / 16) - 1 + 28);   // 7
    expect(r.y0).toBe(Math.floor(-240 / 16) - 1 + 28);   // 12
    expect(r.x1).toBe(Math.floor(320 / 16) + 2 + 28);    // 50
    expect(r.y1).toBe(Math.floor(240 / 16) + 2 + 28);    // 46
    // 相机贴右下角：右/下端夹到世界尺寸
    const br = visualScanRect(200 * 16, 200 * 16, 800, 600, 1.25, 200, 200);
    expect(br.x1).toBe(200);
    expect(br.y1).toBe(200);
    // 相机远离边界则不夹取
    const mid = visualScanRect(100 * 16, 100 * 16, 800, 600, 1.25, 200, 200);
    expect(mid.x0).toBe(Math.floor((100 * 16 - 320) / 16) - 1 + 28);
    expect(mid.x1).toBe(Math.floor((100 * 16 + 320) / 16) + 2 + 28);
  });

  it('★扫描序 = 列主序（SceneMetrics.cs:456-458 外 X 内 Y）——后扫到者覆盖赢家=最右列;'
    + '旧行主序实现赢家=最下行（多柱串柱刀登记债清偿,2026-10-06）', () => {
    const { world } = freshWorld();
    const w = new Wiring(world.store);
    // 判别力构造：两根激活 410 柱异型,使「行主序赢家」≠「列主序赢家」——
    //  A=星璇(style1) 放【左下】,B=星尘(style2) 放【右上】：
    //  列主序（原版）B 列(60-61) 后扫 → 赢家 B=2;行主序 A 行(120-122) 后扫 → 赢家 A=1
    placeMonolith(w, 20, 120, 410, 1, 1);           // A 左下（列 20-21,行 120-122）
    placeMonolith(w, 60, 30, 410, 2, 1);            // B 右上（列 60-61,行 30-32）
    const s = scanMonolithScene(world.store, FULL);
    expect(s.activeMonolithType).toBe(2);           // 最右列胜（行主序会给 1=红）
    // 658 三态柱同面（无条件赋值,赢家序同判）：A state1 右上、B state2 左下
    //  → 列主序 B(30-31) 先扫、A(50-51) 后扫 → 赢家 A=1（行主序给 2=红）
    placeMonolith(w, 50, 40, 658, 0, 1);
    placeMonolith(w, 30, 60, 658, 0, 2);
    const s2 = scanMonolithScene(world.store, FULL);
    expect(s2.shimmerMonolithState).toBe(1);
    // 同型布尔族（480 血月柱两根异位）幂等恒真,赢家序无观察面——不回归即可
    placeMonolith(w, 10, 50, 480, 0, 1);
    placeMonolith(w, 90, 150, 480, 0, 1);
    expect(scanMonolithScene(world.store, FULL).bloodMoonMonolith).toBe(true);
  });
});

describe('滤镜状态机（SceneState.cs:105-128 + FilterManager.cs）', () => {
  it('激活 → Opacity 1/s 上斜（FilterManager.cs:16,95-101）', () => {
    const f = new MonolithFilters();
    const scan = emptyMonolithScene();
    scan.activeMonolithType = 2;                    // 星尘
    f.update(0, scan, env());                       // 首帧 0dt 只建激活态
    expect(f.state('MonolithStardust')!.active).toBe(true);
    f.update(500, scan, env());
    expect(f.state('MonolithStardust')!.opacity).toBeCloseTo(0.5, 5);
    f.update(500, scan, env());
    expect(f.state('MonolithStardust')!.opacity).toBe(1);   // 夹 1
    // 其余柱类型不激活
    expect(f.state('MonolithSolar')!.active).toBe(false);
  });

  it('四天塔在附近（flag4）压掉柱滤镜（SceneState.cs:110-115）', () => {
    const f = new MonolithFilters();
    const scan = emptyMonolithScene();
    scan.activeMonolithType = 3;
    f.update(1000, scan, env({ lunarTowersNear: true }));
    expect(f.state('MonolithSolar')!.active).toBe(false);
    f.update(1000, scan, env({ lunarTowersNear: false }));
    expect(f.state('MonolithSolar')!.active).toBe(true);
  });

  it('关闭 → 下斜归零恢复（FilterManager.cs:98-101）', () => {
    const f = new MonolithFilters();
    const on = emptyMonolithScene();
    on.crtMonolith = true;
    f.update(1000, on, env());
    expect(f.state('CRT')!.opacity).toBe(1);
    const off = emptyMonolithScene();
    f.update(400, off, env());
    expect(f.state('CRT')!.opacity).toBeCloseTo(0.6, 5);
    f.update(600, off, env());
    expect(f.state('CRT')!.opacity).toBe(0);
    expect(f.anyInUse).toBe(false);
  });

  it('血月滤镜：世界血月或血月柱激活（SceneState.cs:116）+ 深度系数 ×0.75'
    + '（BloodMoonScreenShaderData.cs:10-21）', () => {
    const f = new MonolithFilters();
    const scan = emptyMonolithScene();
    scan.bloodMoonMonolith = true;
    f.update(1000, scan, env());                    // screenTileY=地表 → 深度 1
    expect(f.state('BloodMoon')!.active).toBe(true);
    expect(f.bloodMoonUseOpacity).toBeCloseTo(0.75, 5);
    // 深入岩层以下 → 深度 0（SmoothStep(worldSurface+50, rockLevel+100, y)）
    f.update(0, scan, env({ screenTileY: 500 }));
    expect(f.bloodMoonUseOpacity).toBe(0);
    expect(smoothStep(110, 220, 165)).toBeCloseTo(0.5, 5);   // Utils.cs:126-129 线性
  });

  it('微光柱三态驱动 shimmerAlpha（SceneState.cs:328-351）并反压血月滤镜'
    + '（BloodMoonScreenShaderData.cs:16-18）', () => {
    const f = new MonolithFilters();
    const scan = emptyMonolithScene();
    scan.shimmerMonolithState = 1;
    f.update(1000, scan, env());
    expect(f.shimmerAlpha).toBe(1);                 // 0.025/tick ×60/s ×1s
    expect(f.shimmerDarken).toBe(1);                // alpha≥0.5 后同速爬（:339-342）
    // 关 → 级联衰减：先 darken → 再 brightenDelay → 最后 alpha（:343-351）
    scan.shimmerMonolithState = 0;
    f.update(1, scan, env());
    expect(f.shimmerDarken).toBeCloseTo(1 - 0.05 * 60 * 0.001, 6);
    expect(f.shimmerAlpha).toBe(1);                 // 前两级未归零，alpha 不动
    f.update(2000, scan, env());
    expect(f.shimmerDarken).toBe(0);
    expect(f.shimmerBrightenDelay).toBe(0);
    expect(f.shimmerAlpha).toBe(0);
    // state 2 显式压掉（:332-334）且 zoneShimmer 无效
    scan.shimmerMonolithState = 2;
    f.update(1000, scan, env({ zoneShimmer: true }));
    expect(f.shimmerAlpha).toBe(0);
    // 血月柱 + 微光柱同开：血月 UseOpacity 被压为 0
    scan.shimmerMonolithState = 1;
    scan.bloodMoonMonolith = true;
    f.update(1000, scan, env());
    expect(f.state('BloodMoon')!.active).toBe(true);
    expect(f.bloodMoonUseOpacity).toBe(0);
  });

  it('Sepia = onlyDontStarveWorld XOR 收音机柱（SceneState.cs:125）', () => {
    const f = new MonolithFilters();
    const scan = emptyMonolithScene();
    scan.radioThingMonolith = true;
    f.update(1000, scan, env());
    expect(f.state('Sepia')!.active).toBe(true);
    scan.radioThingMonolith = false;
    f.update(0, scan, env({ onlyDontStarveWorld: true }));
    expect(f.state('Sepia')!.active).toBe(true);    // XOR：世界种旗独立点亮
    f.update(0, scan, env({ onlyDontStarveWorld: false }));
    expect(f.state('Sepia')!.active).toBe(false);
  });
});

describe('Sepia 参数（SepiaScreenShaderData.cs:10-55）', () => {
  it('正午晴天：progress 0.3 / intensity 1.2 / 基色 vector', () => {
    const p = sepiaParams({
      dayTime: true, hour24: 12, nightElapsed01: 0.5,
      worldBloodMoon: false, fullMoon: false, cloudAlpha: 0,
      screenTileY: 60, worldSurface: 60,
    });
    expect(p.progress).toBeCloseTo(0.3, 5);
    expect(p.intensity).toBeCloseTo(1.2, 5);        // 1.4 - daylightPower(1)*0.2
    expect(p.color).toEqual([0.191, -0.054, -0.221]);
  });

  it('满月夜：月相覆盖色 + progress 0.1', () => {
    const p = sepiaParams({
      dayTime: false, hour24: 0, nightElapsed01: 0.5,
      worldBloodMoon: false, fullMoon: true, cloudAlpha: 0,
      screenTileY: 60, worldSurface: 60,
    });
    // num2 = 0.13 + 0.07×moonPower(1) = 0.2 → progress = 0.3 - 0.2 = 0.1
    expect(p.progress).toBeCloseTo(0.1, 5);
    expect(p.intensity).toBeCloseTo(1.4, 5);        // 夜间 daylightPower = 0
    expect(p.color[0]).toBeCloseTo(-0.19, 5);       // value = (-0.19, 0.01, 0.22)
    expect(p.color[2]).toBeCloseTo(0.22, 5);
  });

  it('血月夜覆盖（:37-40）与地下压暗（:49-50 lerp 0.2）', () => {
    const p = sepiaParams({
      dayTime: false, hour24: 0, nightElapsed01: 0.5,
      worldBloodMoon: true, fullMoon: true, cloudAlpha: 0,
      screenTileY: 60, worldSurface: 60,
    });
    expect(p.color[0]).toBeCloseTo(0.2, 5);         // 血月色压过满月色
    expect(p.color[1]).toBeCloseTo(-0.1, 5);
    const deep = sepiaParams({
      dayTime: true, hour24: 12, nightElapsed01: 0.5,
      worldBloodMoon: false, fullMoon: false, cloudAlpha: 0,
      screenTileY: 200, worldSurface: 60,           // num = 0 → progress → 0.2
    });
    expect(deep.progress).toBeCloseTo(0.2, 5);
  });
});

describe('扫描与翻帧联动（电路链路端到端）', () => {
  it('deviceTable 翻帧 → 扫描激活 → 关闭恢复', () => {
    const { world, w } = freshWorld();
    placeMonolith(w, 100, 100, 509, 0, 0);          // 虚空柱关
    expect(scanMonolithScene(world.store, FULL).activeMonolithType).toBe(-1);
    deviceTable(w, makeCtx(), 509, 100, 100);
    const s1: MonolithSceneState = scanMonolithScene(world.store, FULL);
    expect(s1.activeMonolithType).toBe(4);          // 月总（SceneMetrics.cs:532-536）
    deviceTable(w, makeCtx(), 509, 101, 102);       // 再翻 → 关
    expect(scanMonolithScene(world.store, FULL).activeMonolithType).toBe(-1);
  });
});
