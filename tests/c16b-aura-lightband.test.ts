// C16b-R17 闪电光环场域光带带式清偿判别测试（2026-10-12 用户三返「隔空伤害无视觉」）。
// 定谳链（运行时复核优先于源码对拍,探针 scripts/_aura-base-final.mjs 物证）：
//   · 用户 .wld base 位点（暗处/室内）：塔成形（side=128）、dust226 池 12-18 活体、
//     伤害/zap 正常——但 lightRim=[6,21,30]≈2% 光（旧 BJ606-R2 点光折算只亮带心
//     1-2 格）→ 场缘电弧尘（rim=(H−40)/2 落点）α 不可见 =「放电全盲」本相。
//   · 白昼开阔地（fresh world）旧码全绿 = 运行时假绿面（此前探针均此形态）。
//   · BJ634 态机 ai[0] 交叉嫌疑【证伪】：688-690 电弧声循环用私有 zapCycle 镜像
//     （MinionProj :1667）,尘spawn 不吃 ai[0]（原版尘环 :70034-70056 亦无 ai[0] 门,
//     仅声门 :69955-69979 走 ai[0]）——a169 三态机（0/−1/60）为异族弹域,无交叉。
// 原版带式：Projectile.cs:69983-69985 PlotTileLine(Center±UnitX×40, 80f,
//   CastLightOpen)（Utils.cs:2479-2501 perp=(0,±40) 逐列垂直跨）+ DelegateMethods.cs
//   :729-745 开放格（!active∨inActive∨tileSolidTop∨!tileSolid ≡ repo !isSolid）逐格
//   AddLight(0.2,0.7,1) 满色——AI_137 全域唯一光源（Main.cs 688-690 无 AddLight 面）。
// 判别力（旧码必红）：暗室带缘 tile 光照（旧点光≈环境暗 0）+ solid 格不亮（旧点光
//   若在 solid 格也不亮但【带内非心列全暗】+ Game 循环不消费 band=结构红）。
// 运行：cd game && npx vitest run tests/c16b-aura-lightband.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { World } from '../src/world/World';
import { LightingEngine } from '../src/lighting/LightingEngine';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { MinionProj, auraLightBandCast } from '../src/entities/MinionProj';

const src = (p: string): string => readFileSync(new URL(p, import.meta.url), 'utf8');

// ---- 暗室夹具（bj427 形态：石墙挡天空光 → 天光零渗） ----
function darkRoom(): { w: World; eng: LightingEngine; st: World['store'] } {
  const w = new World(80, 60, 17, 'c16b-aura-lightband');
  const st = w.store;
  // 全室石墙（surfaceSky wallOk 门 → 无天光）
  for (let x = 0; x < 80; x++) for (let y = 0; y < 60; y++) st.setWall(x, y, 1);
  const eng = new LightingEngine({
    store: st, groundLevel: 10, lavaLine: 58,
    clock: { timeOfDay: 0.0, dayCount: 0 },     // 午夜（用户实报夜间/室内形态）
  });
  eng.ensureRegion(40 * 16, 30 * 16, 40, 30);
  eng.compute(0);
  return { w, eng, st };
}

describe('C16b-R17 lightBand 带式光源（:69983-69985 原版带式清偿点光折算债）', () => {
  it('暗室带式发射：带缘 tile（电弧尘落点 rim=(H−40)/2）满档亮——旧点光折算该档≈0 必红', () => {
    const { eng, st } = darkRoom();
    // 塔 690 落位态：场盒 side=128（T1/T2 典型档）,auraCy=地面接触行
    const tower = new MinionProj(40 * 16, 30 * 16, 690, 20, 0, true, 0, false, () => new Player(40 * 16, 28 * 16, new Inventory()));
    tower.auraSide = 128;
    tower.auraCy = 30 * 16;
    const band = tower.lightBand;
    expect(band).not.toBeNull();
    // 基线：暗室全黑
    eng.compute(0);
    expect(eng.lightAt(40, 30)[0]).toBeLessThan(20);
    // 带式发射（Game 循环同原语）
    auraLightBandCast(st, band!, (tx, ty, r, g, b) => eng.addLight(tx, ty, r, g, b));
    eng.compute(0);
    // 带心 = 满色档（(0.2,0.7,1)×255 = [51,178,255] 量级）
    const [cr, cg, cb] = eng.lightAt(40, 30);
    expect(cr).toBeGreaterThanOrEqual(45);
    expect(cg).toBeGreaterThanOrEqual(150);
    // ★判别点：场缘电弧落点 rim = ±44px = tile(±2)——旧点光折算该档 <20（探针实测
    //  [6,21,30]）,带式后 ≥ 带色量级
    const [rr, rg] = eng.lightAt(42, 30);
    expect(rr).toBeGreaterThanOrEqual(45);
    expect(rg).toBeGreaterThanOrEqual(150);
    const [r2] = eng.lightAt(38, 32);
    expect(r2).toBeGreaterThanOrEqual(45);
  });

  it('CastLightOpen 开放格门：带内 solid 格不亮（实心砖暗/空气亮）+ 越界安全', () => {
    const { eng, st } = darkRoom();
    const tower = new MinionProj(40 * 16, 30 * 16, 688, 20, 0, true, 0, false, () => new Player(40 * 16, 28 * 16, new Inventory()));
    tower.auraSide = 128;
    tower.auraCy = 30 * 16;
    // 带内右侧两列浇筑实心砖（tile 1=dirt）——CastLightOpen 跳过
    for (let y = 28; y <= 32; y++) { st.setTileSilent(41, y, 1); st.setTileSilent(42, y, 1); }
    eng.compute(0);
    auraLightBandCast(st, tower.lightBand!, (tx, ty, r, g, b) => eng.addLight(tx, ty, r, g, b));
    eng.compute(0);
    const [litR] = eng.lightAt(40, 30);        // 开放格（带心）亮
    expect(litR).toBeGreaterThanOrEqual(45);
    // 实心格非光源（CastLightOpen skip）：只吃邻格传播衰减光,必低于同位开放格——
    // （无门版会在此自挂满色源=≥带心;传播衰减判别）
    const [solidR] = eng.lightAt(41, 30);
    expect(solidR).toBeLessThan(litR);
    // 越界锚（世界边缘塔）：不抛不越界写
    const edge = new MinionProj(8, 8, 689, 20, 0, true, 0, false, () => new Player(8, 8, new Inventory()));
    edge.auraSide = 128; edge.auraCy = 8;
    expect(() => auraLightBandCast(st, edge.lightBand!, (tx, ty, r, g, b) => eng.addLight(tx, ty, r, g, b))).not.toThrow();
  });

  it('lightBand 锚面：落位态=auraCy / 携行态与未测桩=本体 cy / 非光环族 null', () => {
    const owner = () => new Player(40 * 16, 28 * 16, new Inventory());
    const placed = new MinionProj(40 * 16, 30 * 16, 690, 20, 0, true, 0, false, owner);
    placed.auraSide = 320; placed.auraCy = 31 * 16;
    expect(placed.lightBand).toMatchObject({ x: placed.cx, y: 31 * 16, hw: 40, hh: 40, rgb: [0.2, 0.7, 1] });
    const carried = new MinionProj(40 * 16, 30 * 16, 689, 20, 0, true, 0, false, owner);
    carried.auraSide = 128; carried.auraCy = 31 * 16; carried.carriedByBackpack = true;
    expect(carried.lightBand!.y).toBe(carried.cy);            // 携行锚=本体中心（:70129 Center=MountedCenter）
    const stub = new MinionProj(40 * 16, 30 * 16, 688, 20, 0, true, 0, false, owner);
    stub.auraSide = 0; stub.auraCy = 0;                        // sizing 失败桩——vanilla 照扫（锚=自身中心）
    expect(stub.lightBand!.y).toBe(stub.cy);
    const other = new MinionProj(40 * 16, 30 * 16, 625, 20, 0, false, 0, false, owner);
    expect(other.lightBand).toBeNull();
  });

  it('结构锚：Game 实体光循环消费 lightBand;lightRGB 点光通道 688-690 摘除', () => {
    const game = src('../src/core/Game.ts');
    // 活接线判别（死守卫 if(false&&band) 或整段摘除均必红——邻接式锚定）
    expect(game).toMatch(/if \(band\) \{\n          auraLightBandCast\(this\.world\.store, band,/);
    expect(game).toMatch(/import \{ MinionProj, pickSentryLandingSpot, minionTrueBox, sentrySpawnBox, auraLightBandCast \}/);
    const mp = src('../src/entities/MinionProj.ts');
    expect(mp).toMatch(/get lightBand\(\)/);
    // 点光通道摘除（带含中心格,并挂=超原版亮度）
    expect(mp).not.toMatch(/case 688: case 689: case 690: return \[0\.2, 0\.7, 1\];/);
    expect(mp).toMatch(/case 688\/689\/690 → lightBand（C16b-R17 迁出）/);
  });
});
