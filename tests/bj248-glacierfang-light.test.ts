// ★BJ248 清债件 4：1115 冰川之牙蓄力光动态 Remap（2026-09-21）。
//
// 原版锚（Terarria1457 亲读,1458 交叉同号）：Projectile.cs:37696
//   `Lighting.AddLight(Center, new Vector3(0.2f,0.5f,0.8f) * Utils.Remap(ai[0],0f,60f,0.5f,1f))`
//   ——在蓄力/释放 if-else【之后】的公共尾段,蓄力/释放两态逐拍都跑：
//     蓄力期：ai0 每 1 拍 += GetSlowMagicUseRate()（:37626 在 AddLight 之前）→
//             光 0.5→1.0 爬升（ai0=0 端恰=(0.1,0.25,0.4)=旧钉死值,即旧实现只对第 0 拍）;
//     释放后：ai0 冻结在松手值 → 光按松手蓄力档恒定（满蓄=1.0、半蓄=0.75）,
//             旧实现恒 (0.2,0.5,0.8)=满亮端点二值化双错。
//   本仓习语：glacierFangLightK 单源（BJ245 whiteK811 同式）,Remap clamp 同 :1902 习语。
//
// 变异证红映射：
//   M1  蓄力光回钉 (0.1,0.25,0.4)          → T1 红（爬升消失）
//   M2  释放光回钉 (0.2,0.5,0.8)           → T2/T3 红（半蓄恒亮）
//   M3  Remap 端点互换（0.5↔1.0 起止倒置） → T1/T4 红
//   M4  clamp 摘除（charge>60 发散）        → T4 红
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';
import { GlacierFangShot, glacierFangLightK } from '../src/entities/proj1457';

type Light = [number, number, number, number, number];   // x,y,r,g,b

function mkHooks(lights: Light[]): GameHooks {
  const hooks = {
    world: { store: new TileStore(200, 120) } as never,   // 全空地=释放态无地形碰撞
    player: {
      equipStats: {}, cx: 800, cy: 1440, x: 790, y: 1419, w: 20, h: 42, dead: false,
      facing: 1, vx: 0, vy: 0, attackSpeedMult: 1, whipBuffs: {},
    } as never,
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    addLightAt: (x: number, y: number, r: number, g: number, b: number) => { lights.push([x, y, r, g, b]); },
    stack: { anyTagged: () => false, hasActiveEffect: () => false },
    whipTagShot: true,
  };
  return hooks as unknown as GameHooks;
}

function mkGf(holding: boolean, rate: number, lights: Light[]): GlacierFangShot {
  return new GlacierFangShot(800, 1440, 1, 0, 11, 2, {
    channel: () => holding,
    aim: () => ({ x: 1600, y: 1440 }),
    payMana: () => {},
    chargeRate: () => rate,
  }) as GlacierFangShot;
}

describe('★BJ248 1115 蓄力光 (0.2,0.5,0.8)×Remap(ai0,0,60,0.5,1)（Projectile.cs:37696 公共尾段）', () => {
  it('T1 蓄力爬升序列：逐拍 0.5→1.0（charge=rate·t,光随 Remap 单调爬升,旧钉死 (0.1,0.25,0.4) 只对第 0 拍）', () => {
    const lights: Light[] = [];
    const gf = mkGf(true, 1, lights);
    const g = mkHooks(lights);
    for (let t = 1; t <= 40; t++) gf.fixedUpdate(1 / 60, g);   // charge=1..40（未及 60 强释）
    expect(lights).toHaveLength(40);
    // charge=1 → k=0.5+0.5/60；charge=30 → k=0.75；charge=40 → k=0.5+0.5·(40/60)
    expect(lights[0][2]).toBeCloseTo(0.2 * (0.5 + 0.5 / 60), 6);
    expect(lights[0][3]).toBeCloseTo(0.5 * (0.5 + 0.5 / 60), 6);
    expect(lights[0][4]).toBeCloseTo(0.8 * (0.5 + 0.5 / 60), 6);
    expect(lights[29][2]).toBeCloseTo(0.15, 6);                // charge=30 → k=0.75（M1 摘动态=恒 0.1 红）
    expect(lights[29][3]).toBeCloseTo(0.375, 6);
    expect(lights[29][4]).toBeCloseTo(0.6, 6);
    for (let t = 1; t < 40; t++) {                             // 单调爬升（M3 端点倒置红）
      expect(lights[t][2]).toBeGreaterThan(lights[t - 1][2]);
    }
  });

  it('T2 零蓄释放：松手拍无光（release+return）,次拍起释放态光=charge0 档 (0.1,0.25,0.4)', () => {
    const lights: Light[] = [];
    const gf = mkGf(false, 1, lights);
    const g = mkHooks(lights);
    gf.fixedUpdate(1 / 60, g);                                 // 首拍 channel=false → release+return
    expect(lights).toHaveLength(0);
    gf.fixedUpdate(1 / 60, g);                                 // 释放态首拍
    expect(lights).toHaveLength(1);
    expect(lights[0][2]).toBeCloseTo(0.1, 6);
    expect(lights[0][3]).toBeCloseTo(0.25, 6);
    expect(lights[0][4]).toBeCloseTo(0.4, 6);
  });

  it('T3 半蓄释放：ai0 冻结在松手值 → 光恒 k=0.75 档 (0.15,0.375,0.6)（旧恒满亮=端点二值化红）', () => {
    const lights: Light[] = [];
    const gf = mkGf(true, 1, lights);
    const g = mkHooks(lights);
    for (let t = 1; t <= 30; t++) gf.fixedUpdate(1 / 60, g);   // 蓄到 charge=30（末拍光=k0.75）
    // 松手：ctl.channel 返回 false —— 换持拍闸（直改 ctl 面）
    (gf as unknown as { ctl: { channel: () => boolean } }).ctl.channel = () => false;
    gf.fixedUpdate(1 / 60, g);                                 // release+return（无光）
    const n0 = lights.length;
    gf.fixedUpdate(1 / 60, g);
    gf.fixedUpdate(1 / 60, g);
    expect(lights.length).toBe(n0 + 2);
    for (let k = n0; k < lights.length; k++) {                 // 释放态逐拍恒定（M2 回钉满亮红）
      expect(lights[k][2]).toBeCloseTo(0.15, 6);
      expect(lights[k][3]).toBeCloseTo(0.375, 6);
      expect(lights[k][4]).toBeCloseTo(0.6, 6);
    }
  });

  it('T4 单源式直接锁：glacierFangLightK 端点/clamp（Remap(ai0,0,60,0.5,1) 语义）', () => {
    expect(glacierFangLightK(0)).toBe(0.5);
    expect(glacierFangLightK(30)).toBe(0.75);
    expect(glacierFangLightK(60)).toBe(1);
    expect(glacierFangLightK(120)).toBe(1);                    // clamp 上界（M4 红）
    expect(glacierFangLightK(-5)).toBe(0.5);                   // clamp 下界
  });
});
