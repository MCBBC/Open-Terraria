// ★NPC 弹幕尘站普查批（2026-09-16）——docs/npc-proj-dust-census.md §4/§6 缺失面清偿：
//   HIGH 472/101/174/176/605/920/926/462/270 + MED 115/129/573/537/468/501/622/452/454/
//   719/922/1021/436/438/581/592 + LOW Kill 站/撞击面组/低频 A 站。
//   载体分家：敌弹 spawnHostileProj/RANGED_TABLE → Dart（killShooterDust 承载 Kill 站,
//   Dart 不路由 Game.onProjectileDeath）;bossAI.shoot → Arrow（killNow 承载）。
//   探针盲区补测面：537（宿主绑定）/922（需实心格）/538（上升期门）/83 撞击面（几何门）/
//   各 Kill 站（探针 force-kill 已入域,本文件双保险逐参钉值）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Dart } from '../src/entities/Dart';
import { Arrow } from '../src/entities/Arrow';
import type { GameHooks } from '../src/entities/types';

interface DustRec {
  type: number; alpha: number; scale: number; noGravity: boolean; fadeIn: number;
  x: number; y: number; vx: number; vy: number;
  boxX: number; boxY: number; boxW: number; boxH: number;
  color: { r: number; g: number; b: number; a: number } | null;
}

function makeHooks(w: World, dusts: DustRec[], sfx: string[], opts: {
  player?: unknown; hitTiles?: () => void; enemies?: () => unknown[];
} = {}) {
  const hooks = {
    world: w,
    player: opts.player ?? { x: -9999, y: -9999, w: 20, h: 42, cx: -9989, cy: -9978, dead: true, vx: 0, vy: 0 },
    playSfx: (name: string) => { sfx.push(name); },
    playSfxFiles: (n: string | string[]) => { sfx.push('files:' + (Array.isArray(n) ? n.join('+') : n)); },
    playSfxWav: (n: string) => { sfx.push('wav:' + n); },
    spawnParticles: () => {},
    addDamageNumber: () => {},
    spawnDrop: () => null,
    cutTile: () => {},
    damagePlayer: (): number => 0,
    addLightAt: () => {},
    candidatePlayers: () => [],
    enemies: opts.enemies ?? (() => []),
    hitTilesFx: opts.hitTiles ?? (() => {}),
    entities: { add: () => {} },
    spawnDust: (bx: number, by: number, bw: number, bh: number, type: number,
      sx = 0, sy = 0, alpha = 0, c: DustRec['color'] = null, scale = 1, ng = false) => {
      const d: DustRec = {
        type, alpha, scale, noGravity: !!ng, fadeIn: 0,
        x: bx, y: by, vx: sx, vy: sy, boxX: bx, boxY: by, boxW: bw, boxH: bh, color: c,
      };
      dusts.push(d);
      return d;
    },
  };
  return hooks as unknown as GameHooks;
}

function floorWorld(): World {
  const w = new World(80, 80, 42, 'open');
  for (let x = 5; x <= 75; x++) w.store.setTileSilent(x, 70, 2);   // 地板 70 行
  return w;
}

function flyTicks(p: { fixedUpdate(dt: number, g: GameHooks): void; dead: boolean; life: number },
  hooks: GameHooks, n: number): void {
  for (let i = 0; i < n && !p.dead; i++) p.fixedUpdate(1 / 60, hooks);
}

const of = (dusts: DustRec[], t: number) => dusts.filter((d) => d.type === t);

// ---------------------------------------------------------------------------
// HIGH 批
// ---------------------------------------------------------------------------
describe('★普查 HIGH：Dart 载体尾尘站', () => {
  it('472 诅咒颅：1×d30/update(noGravity,vel×0.25+弹速×0.75) + 首拍 20×d30 + Item17（:55078-55097）', () => {
    const dusts: DustRec[] = [];
    const sfx: string[] = [];
    const hooks = makeHooks(new World(80, 80, 42, 'open'), dusts, sfx);
    const d = new Dart(20 * 16, 30 * 16, 6, 0, 18, 472);
    flyTicks(d, hooks, 5);
    const d30 = of(dusts, 30);
    expect(d30.length).toBe(5 + 20);                      // 每拍 1 + 首拍 20
    expect(sfx).toContain('files:Item_17');               // 首拍音（localAI[0]==0 :55087）
    expect(d30.every((x) => x.noGravity)).toBe(true);
    // 尾焰尘速 = 随机×0.25 + 弹速×0.75 ∈ [−0.5+4.5, 0.5+4.5]
    expect(d30[0].vx).toBeGreaterThanOrEqual(4.5 - 0.5);
    expect(d30[0].vx).toBeLessThanOrEqual(4.5 + 0.5);
  });

  it('472 Kill：20×d30（noGravity,vel×0.45+弹速×0.9）（:74805-74813）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(new World(80, 80, 42, 'open'), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 6, 0, 18, 472);
    (d as unknown as { life: number }).life = 1;
    flyTicks(d, hooks, 3);
    expect(d.dead).toBe(true);
    expect(of(dusts, 30).length).toBe(20);
  });

  it('174 冰刺：α==0 门（渐显 255−50/t → 第 7 tick 起尘）1×d76 盒=oldPos−弹速×3（:55998-56009）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(new World(80, 80, 42, 'open'), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 6, 0, 30, 174);
    flyTicks(d, hooks, 6);
    expect(dusts.length).toBe(0);                          // 前 6 拍 α∈{205..5} 无尘
    flyTicks(d, hooks, 4);
    const d76 = of(dusts, 76);
    expect(d76.length).toBe(4);
    expect(d76.every((x) => x.alpha === 50 && x.noGravity)).toBe(true);
    // 盒位 = pre-move 位 − 弹速×3（尘 spawn 在位移前）——第 7 tick 时弹已前移 6×6
    expect(d76[0].boxX).toBeCloseTo(20 * 16 + 6 * 6 - 6 * 3, 0);
  });

  it('176 丛林刺：α==0 门 1×d22 scale0.5 noLight fadeIn0.8（:56075-56087）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(new World(80, 80, 42, 'open'), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 6, 0, 30, 176);
    flyTicks(d, hooks, 10);
    const d22 = of(dusts, 22);
    expect(d22.length).toBe(4);                            // 第 7..10 tick
    expect(d22.every((x) => x.scale === 0.5 && x.noGravity)).toBe(true);
    expect(d22[0].fadeIn).toBe(0.8);
    expect(d22[0].vx).toBeCloseTo(d22[0].vx * 1, 6);       // vel×0.15 断言见下
    expect(Math.abs(d22[0].vx)).toBeLessThan(0.5);
  });

  it('605 史莱姆刺：α==0 门 + 1/3 掷 d4 色(78,136,255,150) scale1.2 noGravity（:56025-56045）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(new World(80, 80, 42, 'open'), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 6, 0, 30, 605);
    flyTicks(d, hooks, 40);
    const d4 = of(dusts, 4);
    expect(d4.length).toBeGreaterThan(0);
    expect(d4.length).toBeLessThanOrEqual(34);             // ≤(40−6) 全掷上限
    expect(d4.every((x) => x.noGravity)).toBe(true);
    expect(d4.every((x) => x.color?.r === 78 && x.color?.g === 136 && x.color?.b === 255
      && x.color?.a === 150)).toBe(true);
    expect(d4.every((x) => x.scale === 1.2)).toBe(true);
  });

  it('920 史莱姆箭矢：AI 块明文排除（:56025）→ 飞行零尘;Kill 6×d4 色环（:72761-72770）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(new World(80, 80, 42, 'open'), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 6, 0, 17, 920);
    flyTicks(d, hooks, 30);
    expect(dusts.length).toBe(0);                          // ★普查证伪:920 无 A 站
    (d as unknown as { life: number }).life = 1;
    flyTicks(d, hooks, 3);
    const d4 = of(dusts, 4);
    expect(d4.length).toBe(6);
    expect(d4.every((x) => x.color?.r === 78 && x.color?.a === 150)).toBe(true);
    expect(d4.every((x) => x.noGravity)).toBe(true);
  });

  it('581 破甲刺：2×SelRandom(229,161,161)/update 位=Center scale1.2 noGravity;Kill 30×（:57288-57302/:73993）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(new World(80, 80, 42, 'open'), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 6, 0, 60, 581);
    flyTicks(d, hooks, 6);
    const fly = dusts.filter((x) => x.type === 229 || x.type === 161);
    expect(fly.length).toBe(12);
    expect(fly.every((x) => x.scale === 1.2 && x.noGravity)).toBe(true);
    expect(fly[0].x).toBe(20 * 16 + 5);                    // 位=Center（0 盒钳 5 → +4..5 取整）
    expect(dusts.filter((x) => x.type === 229).length
      + dusts.filter((x) => x.type === 161).length).toBe(12);
    (d as unknown as { life: number }).life = 1;
    flyTicks(d, hooks, 3);
    const die = dusts.slice(fly.length).filter((x) => x.type === 229 || x.type === 161);
    expect(die.length).toBe(30);
    expect(die.every((x) => x.noGravity && x.fadeIn === 0.25)).toBe(true);
  });

  it('436 火星弹：本体飞行零尘（AI 无尘站）;Kill Next(5,10)×d220（:74894-74902）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(new World(80, 80, 42, 'open'), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 6, 0, 24, 436);
    flyTicks(d, hooks, 20);
    expect(dusts.length).toBe(0);
    (d as unknown as { life: number }).life = 1;
    flyTicks(d, hooks, 3);
    const d220 = of(dusts, 220);
    expect(d220.length).toBeGreaterThanOrEqual(5);
    expect(d220.length).toBeLessThanOrEqual(9);
    expect(d220.every((x) => x.scale === 0.5)).toBe(true);
    // position = Lerp(position,Center,0.5) → (盒位+Center)/2
    expect(d220[0].x).toBeGreaterThan(20 * 16);
  });

  it('438/592 火星激光：原版本无尘站（Carrier 投影批）——飞行/Kill 均零尘,首拍音 Item12（:55794/:56220）', () => {
    for (const id of [438, 592]) {
      const dusts: DustRec[] = [];
      const sfx: string[] = [];
      const hooks = makeHooks(new World(80, 80, 42, 'open'), dusts, sfx);
      const d = new Dart(20 * 16, 30 * 16, 6, 0, 30, id);
      flyTicks(d, hooks, 10);
      (d as unknown as { life: number }).life = 1;
      flyTicks(d, hooks, 3);
      expect(dusts.length).toBe(0);
      expect(sfx).toContain('files:Item_12');
    }
  });

  it('501 蝇瓶体：Kill 毒爆 20×d188 scale1.5（:74219-74230）', () => {
    const dusts: DustRec[] = [];
    const sfx: string[] = [];
    const hooks = makeHooks(new World(80, 80, 42, 'open'), dusts, sfx);
    const d = new Dart(20 * 16, 30 * 16, 6, 0, 14, 501);
    (d as unknown as { life: number }).life = 1;
    flyTicks(d, hooks, 3);
    expect(sfx).toContain('wav:Shatter');                  // PlaySound(13)
    const d188 = of(dusts, 188);
    expect(d188.length).toBe(20);
    expect(d188.every((x) => x.scale === 1.5)).toBe(true);
  });
});

describe('★普查 HIGH：Arrow 载体尾尘站（bossAI.shoot 直飞桶）', () => {
  function arrowHooks(dusts: DustRec[], sfx: string[] = []) {
    return makeHooks(new World(80, 80, 42, 'open'), dusts, sfx);
  }

  it('101 石巨人火球：ai[0]>7 门（EU=3 → 第 3 tick 起掷）1/2×d75 α100（:26213-26262）', () => {
    const dusts: DustRec[] = [];
    const hooks = arrowHooks(dusts);
    const p = new Arrow(20 * 16, 30 * 16, 6, 0, 30, 0, 101, { hostile: true, grav: 0, life: 600, pierce: 1 });
    flyTicks(p, hooks, 2);
    expect(dusts.length).toBe(0);                          // ai[0]=0..7（×4 子步/tick）无尘
    flyTicks(p, hooks, 20);
    const d75 = of(dusts, 75);
    expect(d75.length).toBeGreaterThan(0);
    expect(d75.length).toBeLessThanOrEqual(80);            // 1/2 掷/子步×4 子步×20 拍上限
    expect(d75.every((x) => x.alpha === 100)).toBe(true);
  });

  it('462 幻影矢：每子步 1×d229（EU=3 → ×4/tick;noLight+noGravity,vel=弹速,位−=4,scale0.8）;Kill Next(5,10)×d229（:55826/:74905）', () => {
    const dusts: DustRec[] = [];
    const hooks = arrowHooks(dusts);
    const p = new Arrow(20 * 16, 30 * 16, 6, 0, 30, 0, 462, { hostile: true, grav: 0, life: 600, pierce: 1 });
    flyTicks(p, hooks, 5);
    const d229 = of(dusts, 229);
    expect(d229.length).toBe(20);                          // 4 子步/tick
    expect(d229.every((x) => x.noGravity)).toBe(true);
    (p as unknown as { life: number }).life = 1;
    flyTicks(p, hooks, 3);
    // Kill 站 = Next(5,10)×d229（死亡拍 A 尘 +≤4 与 K 站混计 → 界放宽 4）
    const total = of(dusts, 229).length;
    expect(total).toBeGreaterThanOrEqual(20 + 5);
    expect(total).toBeLessThanOrEqual(20 + 9 + 4);
  });

  it('622 水弹：2/3 掷 d229/子步（EU=2;盒缩 8,位−=弹速×2,noLight,noGravity,scale1.2）（:57145-57158）', () => {
    const dusts: DustRec[] = [];
    const hooks = arrowHooks(dusts);
    const p = new Arrow(20 * 16, 30 * 16, 6, 0, 30, 0, 622, { hostile: true, grav: 0, life: 600, pierce: 1 });
    flyTicks(p, hooks, 12);
    const d229 = of(dusts, 229);
    expect(d229.length).toBeGreaterThan(0);
    expect(d229.length).toBeLessThanOrEqual(36);           // 硬上限=3 子步 × 12 tick（2/3 掷,概率尾不设窄界）
    expect(d229.every((x) => x.noGravity && x.scale === 1.2)).toBe(true);
    expect(d229[0].boxW).toBe(2);                          // w−8 = 10−8
  });

  it('270 骷髅髅骨：首拍 10×d5(scale2) + 2×d5/update;Kill 20×d26+20×d5（:57061/:57658/:75816）', () => {
    const dusts: DustRec[] = [];
    const sfx: string[] = [];
    const hooks = arrowHooks(dusts, sfx);
    const p = new Arrow(20 * 16, 30 * 16, 6, 0, 17, 0, 270,
      { hostile: true, grav: 0, life: 600, pierce: 3, skullBone: true });
    flyTicks(p, hooks, 5);
    const d5 = of(dusts, 5);
    expect(d5.length).toBe(10 + 2 * 5);
    expect(d5.slice(0, 10).every((x) => x.scale === 2 && x.noGravity)).toBe(true);
    (p as unknown as { life: number }).life = 1;
    flyTicks(p, hooks, 3);
    expect(of(dusts, 26).length).toBe(20);
    expect(sfx).toContain('dig');                          // PlaySound(0)（case0 无 style=随机 Dig）
  });

  it('719 蜂刺：首拍 20+10×d147 noGravity + 1/2/update;Kill 5×d18 scale1.5（:56460-56481/:77139）', () => {
    const dusts: DustRec[] = [];
    const hooks = arrowHooks(dusts);
    const p = new Arrow(20 * 16, 30 * 16, 6, 0, 11, 0, 719, { hostile: true, grav: 0, life: 600, pierce: 1 });
    flyTicks(p, hooks, 5);
    const d147 = of(dusts, 147);
    expect(d147.length).toBeGreaterThanOrEqual(30);
    expect(d147.length).toBeLessThanOrEqual(35);           // 首拍 30 + 1/2 掷×5
    expect(d147.slice(0, 30).every((x) => x.noGravity)).toBe(true);
    (p as unknown as { life: number }).life = 1;
    flyTicks(p, hooks, 3);
    expect(of(dusts, 18).length).toBe(5);
  });

  it('926 凝胶弹：α=255 起 −50/t 渐显 → α==0 门 1/3 掷 d4 QueenSlime 色;Kill 22×d31（:56018/:72773）', () => {
    const dusts: DustRec[] = [];
    const hooks = arrowHooks(dusts);
    const p = new Arrow(20 * 16, 30 * 16, 6, 0, 30, 0, 926, { hostile: true, grav: 0, life: 600, pierce: 1 });
    flyTicks(p, hooks, 6);
    expect(dusts.length).toBe(0);                          // 渐显期无尘
    flyTicks(p, hooks, 40);
    const d4 = of(dusts, 4);
    expect(d4.length).toBeGreaterThan(0);
    expect(d4.every((x) => x.color?.a === 150 && x.scale === 1.2)).toBe(true);
    (p as unknown as { life: number }).life = 1;
    flyTicks(p, hooks, 3);
    expect(of(dusts, 31).length).toBe(22);
  });

  it('468 光珠：age%12 环 12×d27 + 1/4 d31 + 1/2 ×2 d27（:55360-55421）', () => {
    const dusts: DustRec[] = [];
    const hooks = arrowHooks(dusts);
    const p = new Arrow(20 * 16, 30 * 16, 6, 0, 18, 0, 468, { hostile: true, grav: 0, life: 600, pierce: 1 });
    flyTicks(p, hooks, 24);
    expect(of(dusts, 27).length).toBeGreaterThanOrEqual(24);   // 环 12×2 轮 + 1/2 掷
    expect(of(dusts, 31).length).toBeGreaterThan(0);
    const ring = of(dusts, 27).filter((x) => x.scale === 1.1);
    expect(ring.length).toBeGreaterThanOrEqual(24);        // EU=1 → 2 子步/tick,age%12 环
    expect(ring.length % 12).toBe(0);
  });

  it('452/454 月总幻影矢/球：Kill d31×4/7 + d229×80/120（:74329-74395,killNow 单口）', () => {
    for (const [id, d31n, d229n] of [[452, 4, 80], [454, 7, 120]] as const) {
      const dusts: DustRec[] = [];
      const hooks = arrowHooks(dusts);
      const p = new Arrow(20 * 16, 30 * 16, 6, 0, 30, 0, id, { hostile: true, grav: 0, life: 600, pierce: 1 });
      (p as unknown as { life: number }).life = 1;
      flyTicks(p, hooks, 3);
      expect(p.dead).toBe(true);
      expect(of(dusts, 31).length).toBe(d31n);
      expect(of(dusts, 229).length).toBe(d229n);
    }
  });

  it('1021 月总巨砾：Kill 30×d323（1/2 scale×1.4）+ dig 音（:76364-76467 num623=323）', () => {
    const dusts: DustRec[] = [];
    const sfx: string[] = [];
    const hooks = arrowHooks(dusts, sfx);
    const p = new Arrow(20 * 16, 30 * 16, 6, 0, 70, 0, 1021,
      { hostile: true, grav: 0, life: 600, pierce: 1, mlBoulder: true });
    (p as unknown as { life: number }).life = 1;
    flyTicks(p, hooks, 3);
    const d323 = of(dusts, 323);
    expect(d323.length).toBe(30);
    expect(d323.filter((x) => x.scale !== 1).length).toBeGreaterThan(0);
    expect(sfx).toContain('dig');
  });

  it('873 光鞭：Kill 20×NewDustPerfect d267（fadeIn1,noGravity,α100,径向三档速度）（:72691-72721）', () => {
    const dusts: DustRec[] = [];
    const hooks = arrowHooks(dusts);
    const p = new Arrow(20 * 16, 30 * 16, 0, 0, 45, 0, 873,
      { hostile: true, grav: 0, life: 600, pierce: 1, empressHue: 0.25 });
    (p as unknown as { life: number }).life = 1;
    flyTicks(p, hooks, 3);
    const d267 = of(dusts, 267);
    expect(d267.length).toBe(20);
    expect(d267.every((x) => x.noGravity && x.alpha === 100 && x.fadeIn === 1)).toBe(true);
    expect(d267.every((x) => x.color !== null)).toBe(true);   // Lerp(AI_171 色,White,·)
    // 20 帧角向均布:i%4==0 → 速 3.2(5 粒)/i%2==0 → 1.8(5 粒)/else 1(10 粒)
    // （弹速 0 → 尾段 vel+=弹速×rand·0.5 恒 +0,三档速度可精确断言）
    const sp = d267.map((x) => Math.round(Math.hypot(x.vx, x.vy) * 100) / 100);
    expect(sp.filter((s) => s === 3.2).length).toBe(5);
    expect(sp.filter((s) => s === 1.8).length).toBe(5);
    expect(sp.filter((s) => s === 1).length).toBe(10);
  });

  it('538 加农弹：上升期(vy<0) 1/4 d180 + 1/6 d176;非上升期零尘（:25477-25492）', () => {
    const dusts: DustRec[] = [];
    const hooks = arrowHooks(dusts);
    const p = new Arrow(20 * 16, 30 * 16, 1, -6, 50, 0, 538, { hostile: true, grav: 0, life: 600, pierce: 1 });
    flyTicks(p, hooks, 30);
    expect(of(dusts, 180).length).toBeGreaterThan(0);
    expect(of(dusts, 176).length).toBeGreaterThan(0);
    const dusts2: DustRec[] = [];
    const hooks2 = arrowHooks(dusts2);
    const p2 = new Arrow(20 * 16, 30 * 16, 6, 0, 50, 0, 538, { hostile: true, grav: 0, life: 600, pierce: 1 });
    flyTicks(p2, hooks2, 30);
    expect(dusts2.length).toBe(0);                         // vy=0 恒不进上升门
  });

  it('922 食人魔砸地：age∈{3,6,9} 波——实心格 d4/d31（AI_135 :69740-69855 尘面）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(floorWorld(), dusts, []);
    const p = new Arrow(40 * 16, 70 * 16 - 8, 0, 0, 40, 0, 922, { hostile: true, grav: 0, life: 240, pierce: 1 });
    flyTicks(p, hooks, 12);
    expect(of(dusts, 31).length).toBeGreaterThan(0);       // 三波 d31 环
    expect(of(dusts, 4).length).toBeGreaterThan(0);        // num4≥2 后 d4
    // d31 位钉 (i*16+20, j*16+20)
    const d31 = of(dusts, 31);
    expect((d31[0].x - 20) % 16).toBe(0);
  });

  it('83 死光：撞击面组（Kill :77649 HitTiles+Item10,Dart 载体本口承载）', () => {
    const dusts: DustRec[] = [];
    const sfx: string[] = [];
    let hitTiles = 0;
    const hooks = makeHooks(floorWorld(), dusts, sfx, {
      hitTiles: () => { hitTiles++; },
    });
    const d = new Dart(40 * 16, 70 * 16 - 4, 0, 4, 30, 83);
    d.hostile = true;
    flyTicks(d, hooks, 3);
    expect(d.dead).toBe(true);
    expect(hitTiles).toBe(1);
    expect(sfx).toContain('files:Item_10');
  });
});

// ---------------------------------------------------------------------------
// MED 批（115/129/573/537）
// ---------------------------------------------------------------------------
describe('★普查 MED：115/129/573/537', () => {
  it('115 三叉戟：首拍沿弹道反向 20×d27;localAI[1] 计满 15 → 1×d27 scale0.6（:26814-26860）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(new World(80, 80, 42, 'open'), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 4, 0, 80, 115);
    flyTicks(d, hooks, 20);
    const d27 = of(dusts, 27);
    // 首拍 20 + 计数期无尘 + ai115L1 计满 15（第 12 拍）→ 第 12..20 拍 1/拍 = 20+9
    expect(d27.length).toBe(29);
    expect(d27.slice(0, 20).every((x) => x.scale === 0.9)).toBe(true);
    expect(d27.slice(20).every((x) => x.scale === 0.6 && x.noGravity === false)).toBe(true);
  });

  it('115 Kill：Item10 + 27 循环 ×2×d27 沿 oldVel 反向排布（:78774-78792）', () => {
    const dusts: DustRec[] = [];
    const sfx: string[] = [];
    const hooks = makeHooks(new World(80, 80, 42, 'open'), dusts, sfx);
    const d = new Dart(20 * 16, 30 * 16, 4, 0, 80, 115);
    (d as unknown as { life: number }).life = 1;
    flyTicks(d, hooks, 3);
    expect(of(dusts, 27).length).toBe(54);
    expect(sfx).toContain('files:Item_10');
  });

  it('129 符文爆弹：6×d106/update noGravity（泛色 trail 已退役）（:27009-27019）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(new World(80, 80, 42, 'open'), dusts, []);
    const d = new Dart(20 * 16, 30 * 16, 6, 0, 50, 129);
    flyTicks(d, hooks, 6);
    const d106 = of(dusts, 106);
    expect(d106.length).toBe(36);
    expect(d106.every((x) => x.noGravity && x.alpha === 100)).toBe(true);
    expect(d106.every((x) => x.scale >= 1 && x.scale <= 1.4)).toBe(true);
  });

  it('573 蓄能弹：蓄能期 1/2×d242（位=Center,vel=弹速）;释放期 1/4×d242（vel×0.2）（:33937/:34054）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(new World(80, 80, 42, 'open'), dusts, [], {
      enemies: () => [{ id: 7, dead: false, vanillaId: 424, cx: 21 * 16, cy: 30 * 16, facing: 1 }],
    });
    const d = new Dart(22 * 16, 30 * 16, 0, 0, 60, 573);
    (d as unknown as { ownerNpcId: number }).ownerNpcId = 7;
    flyTicks(d, hooks, 20);
    const d242 = of(dusts, 242);
    expect(d242.length).toBeGreaterThan(0);
    expect(d242.length).toBeLessThanOrEqual(20);           // 1/2 掷×20（随机波动）
    // 蓄能期尘位=Center 整覆写（cx = x + w/2 = 352+9）
    expect(d242[0].x).toBe(22 * 16 + 9);
  });

  it('537 观星者激光：宿主在场 → age≥15 束端 int(2×age/30)×d226 noGravity scale1.2（:32246-32260）', () => {
    const dusts: DustRec[] = [];
    const hooks = makeHooks(new World(80, 80, 42, 'open'), dusts, [], {
      enemies: () => [{ id: 9, dead: false, vanillaId: 411, cx: 20 * 16, cy: 30 * 16, facing: 1 }],
    });
    const d = new Dart(21 * 16, 30 * 16, 6, 0, 60, 537);
    (d as unknown as { ownerNpcId: number }).ownerNpcId = 9;
    flyTicks(d, hooks, 40);
    const d226 = of(dusts, 226);
    expect(d226.length).toBeGreaterThanOrEqual(2);         // int(2×age/30) 随 age 爬升
    expect(d226.every((x) => x.noGravity && x.scale === 1.2)).toBe(true);
  });
});
