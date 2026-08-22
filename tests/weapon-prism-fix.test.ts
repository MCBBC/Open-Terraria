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
import { describe, it, expect } from 'vitest';
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
