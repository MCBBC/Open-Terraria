// ★BJ293（2026-09-23）中央割 friendly 投影门判别面守卫。
// 病灶：Entity.ts 中央 CutTiles 收口原只有 minion/npcProj/CanCutTiles 三支——
//   vanilla friendly=false 的弹照走收口=越权割瓦罐/草药（红蓝-U2 探针实锤：
//   Enemy.ts:8038 出膛的 84 PinkLaser 活拍每拍上报 cutTile）。
// 原版门（Terarria1457/Terraria/Projectile.cs:12515-12518;1458 :12516-12519 同文，
//   Damage() 内、Damage_CanDealDamage(:12461) 外层门之下）：
//   `friendly && owner == Main.myPlayer && !npcProj && !minion && type != 1054`
// 判别面四轴（任务书 U2 口径）+ 投影三支：
//   ① hostile 弹零上报（84 hostile-only P.cs:1653）
//   ② vanilla friendly 且 type==1054 应零割（:12515 第五因;1054 型录双标 :1840-41）
//   ③ trap 弹 vanilla friendly=true 不受误伤（98 :1830-31/99 :1840-41 双旗,
//     Wiring.cs:1965/:72267 owner=Main.myPlayer → 原版照样割）
//   ④ friendly 照割（451 等）
//   ⑤ vid=0（SW 自造弹无型录行）保持旧收口现状照报（FirstFractalSlash(857) 面零回退）
//   ⑥ reflected 拒切（NPC.cs:67197-67199 反射三联写 friendly=false,唯一置位点）
//   ⑦ netPuppet 拒切（owner==Main.myPlayer 投影：联机傀儡弹本地不割）
// 域辨析回归锁：repo hostile ≠ vanilla friendly——双标 vid（99/763）不吃 Arrow/
//   TrapShot 的 hostile 位取反（Arrow.hostile=Damage_EVP 结算方向,TrapShot.hostile=
//   原版!friendly）;763 RollingCactusSpike 由 727 亲射不翻旗（P.cs:19217）=照割。
// 变异证红（开发期实测，逐字节还原）：
//   M1 摘 cutFriendly 项（恒 true）→ ①⑥⑦ 组红、④⑤⑧ 组绿（证红=门在判别）。
//   M2 摘 vid !== 1054 项 → ② 组红（证红=调用点排除型独立承载,非 CUT_EXCLUDE_VIDS）。
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Game } from '../src/core/Game';
import { Entity, EntityManager } from '../src/entities/Entity';
import { TrapShot } from '../src/entities/Dart';
import type { GameHooks } from '../src/entities/types';

/** vid 载体台：中央收口只读盒字段（vid/minion/npcProj/netPuppet/reflected/dead），
 *  最小 Entity 子类 = 判别面单测的本体（不拖弹类 AI 的 hooks 面）。 */
class ProbeProj extends Entity {
  projId?: number;
  minion = false;
  npcProj?: boolean;
  reflected?: boolean;
  constructor(projId?: number) {
    super();
    this.projId = projId;
    this.w = 16; this.h = 16;
    this.x = 5 * TILE; this.y = 5 * TILE;
  }
  fixedUpdate(): void {}
  draw(): void {}
}

/** 中央收口台（bj114 emGame 同构）：真 World + cutTile 观察口（记录 vid）。 */
function emGame() {
  const w = new World(60, 60, 11, 'bj293');
  const game = Object.create(Game.prototype) as unknown as GameHooks & {
    cutTile: (x: number, y: number, vid?: number, extraCut?: boolean) => void;
  };
  const stub = game as unknown as Record<string, unknown>;
  stub.world = w;
  stub.entities = { enemies: [], critters: [], npcs: [], projectiles: [], drops: [], props: [] };
  stub.sfx = { play: () => true, playFiles: () => true, playLoop: () => null, playWav: () => true };
  stub.enemies = () => [];
  stub.critters = () => [];
  stub.npcs = () => [];
  stub.playSfx = () => {};
  stub.playSfxFiles = () => {};
  stub.playSfxWav = () => {};
  stub.spawnParticles = () => {};
  stub.spawnBurst = () => {};
  stub.spawnDust = () => null;
  stub.spawnDrop = () => null;
  stub.addDamageNumber = () => {};
  stub.hitTilesFx = () => {};
  stub.notifyInventoryChanged = () => {};
  stub.damagePlayer = () => 0;
  stub.onEnemyKilled = () => {};
  stub.spawnEnemy = () => {};
  stub._staffHarvestBonus = false;
  game.player = {
    x: -500, y: -500, w: 20, h: 42, cx: -490, cy: -479, dead: true, iframes: 0,
    inv: { armor: {}, accSlotMax: 8, heldItem: () => null },
    buffs: new Set(), equipStats: {}, critChance: () => 0,
  } as unknown as GameHooks['player'];
  const cutCalls: Array<[number, number, number | undefined]> = [];
  game.cutTile = (x: number, y: number, vid?: number) => { cutCalls.push([x, y, vid]); };
  return { game, cutCalls };
}

const vidsReported = (cutCalls: Array<[number, number, number | undefined]>) =>
  new Set(cutCalls.map((c) => c[2]));

describe('BJ293：中央割 friendly 投影门（P.cs:12515 判别面）', () => {
  it('① vanilla hostile 弹零上报（84 PinkLaser hostile-only :1653；U2 实害面）', () => {
    const { game, cutCalls } = emGame();
    const em = new EntityManager();
    em.add(new ProbeProj(84), 'projectiles');
    em.update(1 / 60, game);
    expect(cutCalls).toEqual([]);          // friendly=false → CutTiles 调用点整缺
  });

  it('② vanilla friendly 且 type==1054 零割（:12515 第五因）——对照 99 双旗照报', () => {
    const { game, cutCalls } = emGame();
    const em = new EntityManager();
    em.add(new ProbeProj(1054), 'projectiles');   // SpiderBoulder（friendly=true 双标 :1844）
    em.add(new ProbeProj(99), 'projectiles');     // Boulder（双旗无排除——Wiring.cs:72267 照割）
    em.update(1 / 60, game);
    const vids = vidsReported(cutCalls);
    expect(vids.has(1054)).toBe(false);
    expect(vids.has(99)).toBe(true);
  });

  it('③ trap 弹（98 dart,双旗 :1830-31）不受误伤——vid 穿线照报', () => {
    const { game, cutCalls } = emGame();
    const em = new EntityManager();
    em.add(new TrapShot(5 * TILE, 5 * TILE, 0, 0, 70, 'dart'), 'projectiles');
    em.update(1 / 60, game);
    expect(vidsReported(cutCalls).has(98)).toBe(true);
  });

  it('④ friendly 弹照割（451）', () => {
    const { game, cutCalls } = emGame();
    const em = new EntityManager();
    em.add(new ProbeProj(451), 'projectiles');
    em.update(1 / 60, game);
    expect(vidsReported(cutCalls).has(451)).toBe(true);
  });

  it('⑤ vid=0（无型录行）保持旧收口现状照报（FirstFractalSlash 面零回退）', () => {
    const { game, cutCalls } = emGame();
    const em = new EntityManager();
    em.add(new ProbeProj(undefined), 'projectiles');
    em.update(1 / 60, game);
    expect(cutCalls.length).toBeGreaterThan(0);
    expect(vidsReported(cutCalls).has(0)).toBe(true);
  });

  it('⑥ 反射弹拒切（reflected=true ⟺ 原版 friendly=false,NPC.cs:67197-67199）', () => {
    const { game, cutCalls } = emGame();
    const em = new EntityManager();
    const p = new ProbeProj(451);
    p.reflected = true;
    em.add(p, 'projectiles');
    em.update(1 / 60, game);
    expect(cutCalls).toEqual([]);
  });

  it('⑦ 联机傀儡弹拒切（netPuppet ⟺ owner==Main.myPlayer 假）', () => {
    const { game, cutCalls } = emGame();
    const em = new EntityManager();
    const p = new ProbeProj(451);
    p.netPuppet = true;
    em.add(p, 'projectiles');
    em.update(1 / 60, game);
    expect(cutCalls).toEqual([]);
  });

  it('⑧ 763 RollingCactusSpike 双标照割（727 亲射 P.cs:19217 不翻旗——非敌射语义）', () => {
    const { game, cutCalls } = emGame();
    const em = new EntityManager();
    em.add(new ProbeProj(763), 'projectiles');
    em.update(1 / 60, game);
    expect(vidsReported(cutCalls).has(763)).toBe(true);
  });

  it('⑨ npcProj/minion 支零回退（既有门与新门合流）', () => {
    const { game, cutCalls } = emGame();
    const em = new EntityManager();
    const town = new ProbeProj(451); town.npcProj = true;
    const pet = new ProbeProj(451); pet.minion = true;
    em.add(town, 'projectiles');
    em.add(pet, 'projectiles');
    em.update(1 / 60, game);
    expect(cutCalls).toEqual([]);
  });
});
