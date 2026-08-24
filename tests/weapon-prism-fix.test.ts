// 最后棱镜 633 / 充能爆破炮 459 修复回归（2026-08-22 审计两处 1:1 偏差）：
//   ① 633 充能音缺失（P.cs:63693-63700：soundDelay=num38(10)×2=20t 循环、ai0≠1 播
//      Item15——UseSound=null 故为 channel 期唯一音源）
//   ② 633 晶体帧速（P.cs:63686-63694：num40 = ai0<120 ? 4 : 1——曾恒 3t/帧）
//   ③ 633 伤害动态刷新（P.cs:63630：damage=(int)(手持物×player.magicDamage) 每拍
//      重算 + 632 光棱逐拍同步 damage=projectile3.damage（:30375）——曾出生定死）
//   ④ 459 二段小弹（80-180t）伤害 = 面板×2.5（P.cs:63610-63611：num35=0.7+num20×0.3，
//      num35≥1 → (int)(damage×2.5)——曾原伤直发）
//   ⑤ 460 魔耗节拍（P.cs:63454-63459 flag3 = 80t/180t/满蓄后每 20t，结算
//      :63562-63563 flag6 = !flag3 || CheckMana(pay:true)——曾每发小弹扣）
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { PrismProj, ChargedBlaster } from '../src/entities/PrismProj';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

function makeGame(projectiles: unknown[], sfx: string[][]) {
  return {
    world: new World(200, 200, 30, 'open'),
    player: { cx: 90 * TILE, cy: 90 * TILE } as unknown,
    enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: (e: unknown) => { projectiles.push(e); } },
    playSfx: () => {},
    playSfxFiles: (files: string[]) => { sfx.push(files); },
    playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: () => {}, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
  } as unknown as GameHooks;
}

describe('最后的棱镜 633 修复（AI_075 :63626-63717）', () => {
  it('① 充能音 Item15 每 20t 循环、首拍不播（:63693-63700 soundDelay=10×2）', () => {
    const sfx: string[][] = [];
    const projectiles: unknown[] = [];
    const game = makeGame(projectiles, sfx);
    const prism = new PrismProj(1, 0, 100, 0.25,
      () => true, () => ({ x: 91 * TILE, y: 90 * TILE }), () => true);
    projectiles.push(prism);
    const playTicks: number[] = [];
    let prev = 0;
    for (let t = 1; t <= 45; t++) {
      prism.fixedUpdate(1, game);
      if (sfx.length > prev) { playTicks.push(t); prev = sfx.length; }
    }
    // 首拍 ai0==1 静默；soundDelay 20t 后 21/41 拍起播（原版同拍位）
    expect(playTicks).toEqual([21, 41]);
    expect(sfx[0]).toEqual(['Item_15']);
  });

  it('② 晶体帧速：充能期 4t/帧、≥120t 后 1t/帧（:63686-63694 num40）', () => {
    const sfx: string[][] = [];
    const projectiles: unknown[] = [];
    const game = makeGame(projectiles, sfx);
    const prism = new PrismProj(1, 0, 100, 0.25,
      () => true, () => ({ x: 91 * TILE, y: 90 * TILE }), () => true);
    projectiles.push(prism);
    const fr = () => (prism as unknown as { crystalFrame: number }).crystalFrame;
    for (let t = 1; t <= 4; t++) prism.fixedUpdate(1, game);
    expect(fr()).toBe(1);                       // 4t 首 帧（旧恒 3t/帧 此刻已 1）
    for (let t = 5; t <= 8; t++) prism.fixedUpdate(1, game);
    expect(fr()).toBe(2);
    for (let t = 9; t <= 119; t++) prism.fixedUpdate(1, game);
    expect(fr()).toBe(4);                       // ⌊119/4⌋=29 → 29%5=4
    prism.fixedUpdate(1, game);                 // 120t：⌊120/4⌋=30 → 0
    expect(fr()).toBe(0);
    prism.fixedUpdate(1, game);                 // 121t：1t/帧 → 1（旧 3t/帧 仍 ⌊121/3⌋%5=0）
    expect(fr()).toBe(1);
    prism.fixedUpdate(1, game);                 // 122t：连拍推进
    expect(fr()).toBe(2);
  });

  it('③ 伤害每拍刷新 + 632 光棱逐拍同步（:63630 / :30375）', () => {
    const sfx: string[][] = [];
    const projectiles: unknown[] = [];
    const game = makeGame(projectiles, sfx);
    let mult = 1.0;
    // dmgCb = Game 侧接法：trunc(手持物面板(含词缀) × player.damageMult('magic'))
    const prism = new PrismProj(1, 0, 100, 0.25,
      () => true, () => ({ x: 91 * TILE, y: 90 * TILE }), () => true,
      () => Math.trunc(100 * mult));
    projectiles.push(prism);
    prism.fixedUpdate(1, game);
    expect(prism.damage).toBe(100);
    expect(prism.prongs.length).toBe(6);
    expect(prism.prongs.every((q) => q.damage === 100)).toBe(true);
    mult = 1.35;                                // channel 中途拾取魔伤乘区
    prism.fixedUpdate(1, game);
    expect(prism.damage).toBe(135);             // (int)(100×1.35) 截断——曾出生定死
    expect(prism.prongs.every((q) => q.damage === 135)).toBe(true);   // :30375 同步
    mult = 0.8;                                 // 魔力眩晕类衰减同样即时回落
    prism.fixedUpdate(1, game);
    expect(prism.damage).toBe(80);
    expect(prism.prongs.every((q) => q.damage === 80)).toBe(true);
  });

  it('③b 无 dmgCb（旧路径/测试）伤害保持出生值', () => {
    const sfx: string[][] = [];
    const projectiles: unknown[] = [];
    const game = makeGame(projectiles, sfx);
    const prism = new PrismProj(1, 0, 100, 0.25,
      () => true, () => ({ x: 91 * TILE, y: 90 * TILE }), () => true);
    projectiles.push(prism);
    for (let t = 0; t < 5; t++) prism.fixedUpdate(1, game);
    expect(prism.damage).toBe(100);
    expect(prism.prongs.every((q) => q.damage === 100)).toBe(true);
  });
});

describe('充能爆破炮 459/460 修复（AI_075 :63442-63620）', () => {
  it('④ 二段小弹（80-180t）伤害 = 面板×2.5；一段原伤（:63610-63611）', () => {
    const sfx: string[][] = [];
    const projectiles: unknown[] = [];
    const game = makeGame(projectiles, sfx);
    const bl = new ChargedBlaster(1, 0, 100, 2,
      () => true, () => ({ x: 180 * TILE, y: 90 * TILE }), () => true);
    projectiles.push(bl);
    const bolts = () => projectiles.filter((q) => (q as { projId?: number }).projId === 459) as unknown as { damage: number }[];
    bl.fixedUpdate(1, game);
    expect(bolts().length).toBe(1);
    expect(bolts()[0].damage).toBe(100);        // 一段 num20=0 → num35=0.7<1 → 原伤
    for (let t = 2; t <= 90; t++) bl.fixedUpdate(1, game);
    expect(bolts().length).toBe(7);             // 发射拍 1/10/20/30/40/50/90
    expect(bolts()[6].damage).toBe(250);        // 二段 num20=1 → num35=1.0≥1 → ×2.5（曾 100）
    for (let t = 91; t <= 150; t++) bl.fixedUpdate(1, game);
    expect(bolts().length).toBe(9);             // +120/150
    expect(bolts()[7].damage).toBe(250);
    expect(bolts()[8].damage).toBe(250);
    for (let t = 151; t <= 180; t++) bl.fixedUpdate(1, game);
    expect(bl.beam).toBeTruthy();               // 180t 满蓄发 461（:63566-63578）
    expect(bl.beam!.damage).toBe(150);          // (int)(100×1.5) 截断
    expect(bolts().length).toBe(9);             // 满蓄后不再发小弹
  });

  it('⑤ 魔耗节拍：只在 80/180/满蓄后每 20t 扣，小弹发射拍零扣（:63454-63459）', () => {
    const sfx: string[][] = [];
    const projectiles: unknown[] = [];
    const game = makeGame(projectiles, sfx);
    const payTicks: number[] = [];
    const bl = new ChargedBlaster(1, 0, 100, 2,
      () => true, () => ({ x: 180 * TILE, y: 90 * TILE }),
      () => { payTicks.push(bl['charge']); return true; });
    projectiles.push(bl);
    for (let t = 1; t <= 79; t++) bl.fixedUpdate(1, game);
    expect(payTicks).toEqual([]);               // 一段 6 发小弹（1/10/…/50）零扣魔——曾每发扣
    bl.fixedUpdate(1, game);                    // 80t
    expect(payTicks).toEqual([80]);
    for (let t = 81; t <= 179; t++) bl.fixedUpdate(1, game);
    expect(payTicks).toEqual([80]);             // 二段小弹拍 90/120/150 不扣
    bl.fixedUpdate(1, game);                    // 180t（发束同拍扣，:63563→:63566）
    expect(payTicks).toEqual([80, 180]);
    for (let t = 181; t <= 220; t++) bl.fixedUpdate(1, game);
    expect(payTicks).toEqual([80, 180, 200, 220]);   // 满蓄后每 20t
  });

  it('⑤b 扣魔失败即 Kill（:63564-63565 else 分支）', () => {
    const sfx: string[][] = [];
    const projectiles: unknown[] = [];
    const game = makeGame(projectiles, sfx);
    let ok = true;
    const bl = new ChargedBlaster(1, 0, 100, 2,
      () => true, () => ({ x: 1, y: 0 }), () => ok);
    projectiles.push(bl);
    for (let t = 1; t <= 79; t++) bl.fixedUpdate(1, game);
    expect(bl.dead).toBe(false);
    ok = false;
    bl.fixedUpdate(1, game);                    // 80t flag3 扣魔失败
    expect(bl.dead).toBe(true);
  });
});

// ============================================================ 晶体绘制层级
// 2026-08-24 用户报"使用时角色身上没有出现棱镜贴图":
//   633 SetDefaults drawLayer=7(P.cs:6800)——原版【跳过】世界弹幕 pass
//   (Main.cs:22405 drawLayer!=0 门),改在玩家绘制层组内画:DrawPlayer_27_HeldItem
//   记 projectileDrawPosition(PlayerDrawLayers.cs:3154)→ RenderAllLayers 在持物层
//   位置插入 DrawHeldProj(:4318)= 身体【前】。本仓实体循环先于 drawPlayer,直画
//   被纸娃娃盖住 → PrismProj.draw 登记 Renderer.prismCrystalQueue,drawPlayer 后冲刷。
describe('终极棱镜晶体层级(drawLayer=7 → prismCrystalQueue)', () => {
  function makeRecCtx() {
    const calls: Array<{ m: string; a: unknown[] }> = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, k) => (k === 'canvas' ? undefined : (...a: unknown[]) => { calls.push({ m: String(k), a }); }),
    });
    return { calls, ctx };
  }
  beforeAll(() => {
    vi.stubGlobal('Image', class {
      width = 26; height = 120; naturalWidth = 26; naturalHeight = 120; complete = true;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) { this.onload?.(); }
    });
  });
  it('⑥ 有队列:登记闭包不直画;冲刷时按 5 帧竖条切片画(26×120→帧 26×24)', () => {
    const prism = new PrismProj(1, 0, 100, 0.25,
      () => true, () => ({ x: 0, y: 0 }), () => true);
    const { calls, ctx } = makeRecCtx();
    const queue: Array<() => void> = [];
    prism.draw({ canvas: {} as HTMLCanvasElement, ctx: ctx as unknown as CanvasRenderingContext2D, prismCrystalQueue: queue } as never);
    expect(queue.length).toBe(1);
    expect(calls.find((c) => c.m === 'drawImage')).toBeUndefined();   // 实体循环期不直画
    queue[0]();                                                       // Renderer drawPlayer 后冲刷
    const di = calls.find((c) => c.m === 'drawImage');
    expect(di, '冲刷闭包应执行晶体绘制').toBeTruthy();
    expect(di!.a[1] as number).toBe(0);                               // sx=0
    expect(di!.a[2] as number).toBe(0);                               // sy=帧 0
    expect(di!.a[3] as number).toBe(26);                              // sw=整宽
    expect(di!.a[4] as number).toBe(24);                              // sh=120/5 帧高
    expect(di!.a[7] as number).toBe(26);                              // dw=原生宽(与判定盒 14 解耦)
    expect(di!.a[8] as number).toBe(24);                              // dh=帧高
  });
  it('⑥b 无队列环境(旧桩/测试):保持直画不崩', () => {
    const prism = new PrismProj(1, 0, 100, 0.25,
      () => true, () => ({ x: 0, y: 0 }), () => true);
    const { calls, ctx } = makeRecCtx();
    prism.draw({ canvas: {} as HTMLCanvasElement, ctx: ctx as unknown as CanvasRenderingContext2D } as never);
    expect(calls.find((c) => c.m === 'drawImage')).toBeTruthy();
  });
});

// ============================================================ 光束末端粒子
// 2026-08-24 用户报"粒子位置固定不对,光束打到的位置才冒粒子":
//   1456 AI_084 :30622-30660 = 632 束端彩色尘(2×267+1/5×31,位置=Center+
//   velocity×(localAI[1]−14.5×scale),门 |localAI[1]−num734|<100 && scale>0.15)。
//   ★1457 已删此段(AI_084 只剩 455/642/461/537)——按用户要求以 1456 恢复(备案)。
//   曾"简化"成固定 min(beamLen,200) 处撒 1 粒合成粒子=位置错+形态错。
describe('终极棱镜光束末端粒子(1456 :30622-30660 恢复)', () => {
  function makeDustGame(dust: Array<{ x: number; y: number; type: number }>) {
    const projectiles: unknown[] = [];
    const sfx: string[][] = [];
    const game = makeGame(projectiles, sfx) as unknown as Record<string, unknown>;
    game.spawnDust = (x: number, y: number, _w: number, _h: number, type: number) => {
      dust.push({ x, y, type });
      return null;
    };
    return game as unknown as GameHooks;
  }
  it('⑦ 267 号尘落在束端(cx+vx×(beamLen−14.5×scale)),稳定束期每 tick 2 粒', () => {
    const dust: Array<{ x: number; y: number; type: number }> = [];
    const game = makeDustGame(dust);
    const prism = new PrismProj(1, 0, 100, 0.25,
      () => true, () => ({ x: 0, y: 0 }), () => true);
    (game as unknown as { entities: { add: (e: unknown) => void } }).entities.add(prism);
    // 充能至稳定期(≥30t friendly 门、scale>0.15),棱先步进 60t
    for (let i = 0; i < 60; i++) prism.fixedUpdate(1, game);
    for (const pr of prism.prongs) {
      // 尘由 PrismProng 自身 fixedUpdate 生成——逐棱步进至束长收敛
      // (beamLen lerp 0.75/t,数 tick 后 |beamLen−scanLen|<100 门开;地形世界
      //  scanLen 未知,故不预设束长)
      for (let i = 0; i < 12; i++) pr.fixedUpdate(1, game);
      const before = dust.length;
      pr.fixedUpdate(1, game);
      const spawned = dust.slice(before).filter((d) => d.type === 267);
      expect(spawned.length).toBeGreaterThanOrEqual(2);
      // 每粒位置=束端(用更新后的 vx/beamLen/prongScale——与实现同源)
      const ex = pr.cx + pr.vx * (pr.beamLen - 14.5 * pr.prongScale);
      const ey = pr.cy + pr.vy * (pr.beamLen - 14.5 * pr.prongScale);
      for (const d of spawned) {
        expect(Math.hypot(d.x - ex, d.y - ey)).toBeLessThan(1);
      }
    }
  });
  it('⑧ 门:束长未收敛(|beamLen−scanLen|≥100)或充能初期(scale≤0.15)不撒', () => {
    const dust: Array<{ x: number; y: number; type: number }> = [];
    const game = makeDustGame(dust);
    const prism = new PrismProj(1, 0, 100, 0.25,
      () => true, () => ({ x: 0, y: 0 }), () => true);
    (game as unknown as { entities: { add: (e: unknown) => void } }).entities.add(prism);
    prism.fixedUpdate(1, game);                // charge=1,prong 出生
    for (const pr of prism.prongs) {
      for (let i = 0; i < 10; i++) pr.fixedUpdate(1, game);   // 束长收敛
      pr.beamLen = pr.beamLen + 500;            // 人为拉开 ≥100 → 门关
      const before = dust.length;
      pr.fixedUpdate(1, game);
      expect(dust.slice(before).filter((d) => d.type === 267).length).toBe(0);
    }
    // scale 门:charge=1(棱不再步进 → prongScale=1.4×1/180≈0.008 ≤0.15),束长收敛也不撒
    const dust2: Array<{ x: number; y: number; type: number }> = [];
    const game2 = makeDustGame(dust2);
    const prism2 = new PrismProj(1, 0, 100, 0.25,
      () => true, () => ({ x: 0, y: 0 }), () => true);
    (game2 as unknown as { entities: { add: (e: unknown) => void } }).entities.add(prism2);
    prism2.fixedUpdate(1, game2);
    for (const pr of prism2.prongs) {
      for (let i = 0; i < 12; i++) pr.fixedUpdate(1, game2);  // 束长收敛,charge 恒 1
      const before = dust2.length;
      pr.fixedUpdate(1, game2);
      expect(dust2.slice(before).filter((d) => d.type === 267).length).toBe(0);
    }
  });
});
