// 光照系统单元测试:FastRandom/SkyColor/LightMap 扫描/TileLightScanner/LightingEngine 状态机
// 运行:node_modules/.bin/vite-node scripts/lighting-test.mts
import { FastRandom } from '../src/lighting/FastRandom.ts';
import { FlickerClock, moonPhase, setBackColor, skySeed, tileColor, toVanillaTime } from '../src/lighting/SkyColor.ts';
import { DECAY_AIR, DECAY_SOLID, DEAD_THRESHOLD, GLOBAL_BRIGHTNESS, MOON_FLOOR, WALL_LIGHT } from '../src/lighting/lightTables.ts';
import { LightMap, Mask } from '../src/lighting/LightMap.ts';
import { TileLightScanner, ScannerWorld } from '../src/lighting/TileLightScanner.ts';
import { LightingEngine } from '../src/lighting/LightingEngine.ts';
import { TileStore } from '../src/world/TileStore.ts';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles.ts';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`, extra ?? ''); }
}
function approx(a: number, b: number, eps = 0.001): boolean { return Math.abs(a - b) < eps; }

console.log('== 1. FastRandom(48 位 LCG)==');
{
  const r1 = new FastRandom(42), r2 = new FastRandom(42);
  let same = true;
  for (let i = 0; i < 100; i++) if (r1.next(0, 1000) !== r2.next(0, 1000)) { same = false; break; }
  check('同种子序列一致', same);
  console.log('  1b done');
  const r3 = new FastRandom(0);
  const seq = [r3.next(0, 100), r3.next(0, 100), r3.next(0, 100)];
  check('值域在 [0,100)', seq.every((v) => v >= 0 && v < 100), seq);
  const r4 = new FastRandom(7);
  const f = r4.nextFloat();
  check('nextFloat ∈ [0,1)', f >= 0 && f < 1, f);
  console.log('  1c done');
  // 与原版 LCG 核对:nextBits(31) = ((seed*25214903917+11) mod 2^48) >> 17
  const expected = Number((((7n * 25214903917n + 11n) & 0xffffffffffffn) >> 17n));
  check('LCG 首步与原版公式一致', new FastRandom(7).nextInt31() === expected,
    [new FastRandom(7).nextInt31(), expected]);
}

console.log('== 2. SkyColor 曲线 ==');
{
  // 正午:timeOfDay 0.5 → mainTime 27000(54000/2)
  check('正午映射', toVanillaTime(0.5, true) === 27000, toVanillaTime(0.5, true));
  // 6:00 昼始 → 0;18:00 夜始 → 54000+0=54000;次日 4:30 → 86400
  check('日出边界', toVanillaTime(0.25, true) === 0);
  check('日落起点', toVanillaTime(0.75, false) === 54000);
  check('月相 = dayCount%8', moonPhase(9) === 1 && moonPhase(0) === 0);
  // 正午天空 = 全白
  const noon = setBackColor(27000, true, 0);
  check('正午天空 ≈ (255,255,255)', noon[0] >= 250 && noon[1] >= 250 && noon[2] >= 250, noon);
  // 深夜中段(t=20000):p≈0.23 → bg≈(9.7,12,12),被月相地板抬高
  const full = setBackColor(54000 + 20000, false, 4); // 满月
  check('满月地板抬高 R 到 19', full[0] === 19 && full[1] === 19, full);
  const empty = setBackColor(54000 + 20000, false, 0); // 新月
  check('新月地板 R=11 < 满月 19', empty[0] === 11 && empty[0] < full[0], [empty, full]);
  // 曲线连续性:晨昏边界跳变 < 40
  let maxJump = 0;
  for (let t = 0; t < 86400; t += 100) {
    const isDay = t < 54000;
    const a = setBackColor(t, isDay, 0), b = setBackColor(t + 100, (t + 100) < 54000, 0);
    maxJump = Math.max(maxJump, Math.abs(a[0] - b[0]));
  }
  check('昼夜曲线平滑(100 tick 内跳变 < 40)', maxJump < 40, maxJump);
  // tileColor:正午 (255,255,255) → (1,1,1)
  const tc = tileColor([255, 255, 255]);
  check('tileColor(白)= (1,1,1)', approx(tc[0], 1) && approx(tc[1], 1) && approx(tc[2], 1), tc);
  const seed = skySeed(0.5, 0);
  check('正午天空种子 ≈ (1,1,1)', approx(seed[0], 1, 0.01), seed);
}

console.log('== 3. LightMap 扫描 Blur ==');
{
  // 空气传播:1 格 1.0 种子,0.91^n ≥ 0.0185 → n ≤ ln(0.0185)/ln(0.91) ≈ 45
  {
    const m = new LightMap();
    m.setSize(60, 1);
    m.r[0] = 1; m.g[0] = 1; m.b[0] = 1;
    m.blur();
    // 行主序单行:idx = x
    let reach = 0;
    for (let x = 0; x < 60; x++) {
      const v = m.r[x];
      if (v >= DEAD_THRESHOLD) reach = x; else break;
    }
    check(`空气传播距离 ≈ 41-43(0.91^n≥0.0185 → n≤42;实测 ${reach})`, reach >= 41 && reach <= 43, reach);
  }
  // 实心墙衰减:0.56^n ≥ 0.0185 → n ≈ 6
  {
    const m = new LightMap();
    m.setSize(20, 1);
    m.r[0] = 1;
    for (let x = 1; x <= 12; x++) m.mask[x] = Mask.Solid;
    m.blur();
    let reach = 0;
    for (let x = 0; x < 20; x++) { if (m.r[x] >= DEAD_THRESHOLD) reach = x; else break; }
    check(`实心传播 ≈ 6-7 格(实测 ${reach})`, reach >= 6 && reach <= 7, reach);
  }
  // 死通道复活:死区后光源复活该线
  {
    const m = new LightMap();
    m.setSize(30, 1);
    m.r[0] = 0.02; m.r[20] = 1.0; // 中途强源
    for (let x = 1; x < 20; x++) m.mask[x] = Mask.Solid; // 前段衰减快
    m.blur();
    check('死通道被中途光源复活(25 格处仍亮)', m.r[25] >= DEAD_THRESHOLD, m.r[25]);
  }
  // 水分通道:蓝 ×1.015 增益 > 红 ×0.88 衰减
  {
    const m = new LightMap();
    m.setSize(15, 1);
    m.r[0] = 1; m.g[0] = 1; m.b[0] = 1;
    for (let x = 1; x <= 10; x++) m.mask[x] = Mask.Water;
    m.blur();
    const rb = m.r[10], bb = m.b[10];
    check('水中蓝 > 红(分通道不对称)', bb > rb + 0.05, [rb, bb]);
  }
  // 导出 ×1.2 钳制(由引擎测,此处只验证常数)
  check('GLOBAL_BRIGHTNESS = 1.2', GLOBAL_BRIGHTNESS === 1.2);
  check('WALL_LIGHT 含玻璃墙 21', WALL_LIGHT.has(21));
  check('MOON_FLOOR 8 相', MOON_FLOOR.length === 8 && MOON_FLOOR[4] === 19);
}

console.log('== 4. TileLightScanner ==');
function fakeWorld(w: number, h: number): ScannerWorld {
  const st = new TileStore(w, h);
  return {
    store: st,
    groundLevel: 100,
    lavaLine: h - 50,
    clock: { timeOfDay: 0.5, dayCount: 1 },
  };
}
{
  const fw = fakeWorld(80, 300);
  const st = fw.store;
  const sc = new TileLightScanner(new FlickerClock());
  const stone = TILE_BY_KEY['stone']!;
  const checkMask = (x: number, y: number) => {
    const m = new LightMap();
    m.setSize(1, 1);
    return sc.getMask(st, st.idx(x, y));
  };
  // 空气
  check('空气 mask=None', checkMask(10, 10) === Mask.None);
  // 实心
  st.setTileSilent(10, 10, stone);
  check('石块 mask=Solid', checkMask(10, 10) === Mask.Solid);
  // 致动后不挡
  st.setWire(10, 10, TileStore.WIRE_ACTUATED);
  check('致动石块不挡光(原版 inActive 例外)', checkMask(10, 10) === Mask.None, checkMask(10, 10));
  st.setWire(10, 10, 0);
  // 坡面不挡
  st.setSlopeSilent?.(10, 10, 1) ?? st.setSlope(10, 10, 1);
  check('坡面石块不挡光', checkMask(10, 10) === Mask.None);
  st.setSlope(10, 10, 0);
  check('坡面复位后恢复 Solid', checkMask(10, 10) === Mask.Solid);
  // 水 mask(liquid>128)
  st.setTileSilent(20, 10, 0);
  st.setLiquid(20, 10, 200, 1);
  check('水 mask=Water', checkMask(20, 10) === Mask.Water);
  st.setLiquid(20, 10, 100, 1);
  check('半格水(≤128) mask=None', checkMask(20, 10) === Mask.None);
  // 岩浆 mask=None
  st.setLiquid(20, 10, 250, 2);
  check('岩浆 mask=None(只发光)', checkMask(20, 10) === Mask.None);
  // 蜂蜜
  st.setLiquid(20, 10, 250, 3);
  check('蜂蜜 mask=Honey', checkMask(20, 10) === Mask.Honey);

  // 播种:天空/洞穴/地狱(InWorld(1):扫描 x≥1;区域锚 rx=2;lavaLine=h-50=250)
  const m = new LightMap();
  m.setSize(1, 296);
  const sc2 = new TileLightScanner(new FlickerClock());
  sc2.exportTo(fw, m, 2, 2, []);
  check('地表空气播种天空光(正午≈1)', m.r[50 - 2] > 0.9 && m.g[50 - 2] > 0.9, [m.r[48], m.g[48], m.b[48]]);
  check('洞穴空气零环境光', m.r[150 - 2] === 0 && m.g[150 - 2] === 0, [m.r[148], m.g[148]]);
  check('地狱层播种橙光', m.r[260 - 2] > 0.4 && m.b[260 - 2] < m.r[260 - 2] * 0.5, [m.r[258], m.g[258], m.b[258]]);
  // 墙透光判定(地表带 y=50)
  const m2 = new LightMap();
  m2.setSize(1, 1);
  const probeY = (wall: number, y: number) => {
    st.setWallSilent(2, y, wall);
    sc2.exportTo(fw, m2, 2, y, []);
    return m2.r[0];
  };
  check('普通墙 1 不透天空光', probeY(1, 50) === 0, m2.r[0]);
  check('玻璃墙 21 透天空光', probeY(21, 50) > 0.9, m2.r[0]);
  check('玻璃墙在洞穴带不种天空', probeY(21, 150) === 0, m2.r[0]);
}

console.log('== 5. LightingEngine 状态机 ==');
{
  const fw = fakeWorld(200, 300);
  fw.groundLevel = 150; // 让 ensureRegion(中心 y=150)的区域含天空行
  const eng = new LightingEngine(fw);
  // 契约:初始公共面
  check('初始 rw=0', eng.rw === 0);
  eng.ensureRegion(100 * 16, 150 * 16, 60, 40);
  check('ensureRegion 建区(rw*rh>0)', eng.rw > 0 && eng.r.length === eng.rw * eng.rh);
  check('区域含 AREA_PADDING 外扩', eng.rw >= 60 + 2 * 28 - 2, eng.rw);
  // dirty → 同 tick 快进(立刻有值)
  eng.compute(1);
  // 区域中心在洞穴带(零环境光是原版语义)——改验地表行:ty=90 在区域内
  const skyIdx = (120 - eng.ry) * eng.rw + Math.floor(eng.rw / 2);
  check('dirty 快进后地表行有天空光', skyIdx >= 0 && eng.r[skyIdx] > 200, [eng.rx, eng.ry, eng.rw, eng.rh, skyIdx, eng.r[skyIdx]]);
  // liquidDirty 3 tick 节流
  eng.liquidDirty = true;
  eng.compute(1);
  const rAfter1 = eng.r[0];
  eng.liquidDirty = true;
  eng.compute(1); eng.compute(1);
  check('liquidDirty 节流不崩', eng.r.length === eng.rw * eng.rh);
  void rAfter1;
  // 空闲 4 tick = 完整周期
  const before = eng.r[0];
  eng.compute(1); eng.compute(1); eng.compute(1); eng.compute(1);
  check('4 tick 完整周期无异常', eng.r.length === eng.rw * eng.rh);
  void before;
  // 挖格 → dirty 同 tick 重算(火把种子)
  const torch = TILE_BY_KEY['torch']!;
  const ptx = eng.rx + Math.floor(eng.rw / 2), pty = eng.ry + Math.floor(eng.rh / 2);
  fw.store.setTile(ptx, pty, torch, 0, 0); // 经 listener 置脏
  check('setTile 触发 dirty', eng.dirty === true);
  eng.compute(1);
  const tIdx = (pty - eng.ry) * eng.rw + (ptx - eng.rx);
  check('火把种子 ×1.2 输出 ≈ 306→钳 255', eng.r[tIdx] === 255, eng.r[tIdx]);
  // addLight API
  eng.addLight(ptx + 1, pty, 0.5, 0, 0);
  eng.compute(1);
  const aIdx = (pty - eng.ry) * eng.rw + (ptx + 1 - eng.rx);
  check('addLight 红通道生效', eng.r[aIdx] >= Math.round(0.5 * 1.2 * 255) - 1, eng.r[aIdx]);
  // lightAt 契约
  const la = eng.lightAt(ptx, pty);
  check('lightAt 返回公共面值', la[0] === eng.r[tIdx]);
  check('lightAt 区域外返回 0', eng.lightAt(-5, -5)[0] === 0);
}

console.log('== 6. FlickerClock 火把动态 ==');
{
  const fc = new FlickerClock();
  const d0 = fc.demonTorch;
  for (let i = 0; i < 150; i++) fc.tick();
  check('demonTorch 前进且 ≤1', fc.demonTorch > d0 && fc.demonTorch <= 1, fc.demonTorch);
  const dc0 = fc.discoColor();
  for (let i = 0; i < 300; i++) fc.tick();
  const dc1 = fc.discoColor();
  check('Disco 循环推进', dc0[0] !== dc1[0] || dc0[1] !== dc1[1], [dc0, dc1]);
  const colors = new Set<string>();
  for (let i = 0; i < 5000; i++) { fc.tick(); colors.add(fc.demonTorchColor().join(',')); }
  check('恶魔火把色随 demonTorch 变化(>1 种)', colors.size > 3, colors.size);
  check('mouseTextColor 停在 [190,255]', fc.mouseTextColor >= 190 && fc.mouseTextColor <= 255, fc.mouseTextColor);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
