// 玩家爆炸物/投射物对城镇 NPC 伤害门（Damage_PVE_Inner，Projectile.cs:11895-11925）：
//   ①友方弹窄门 = 巫毒（22→killGuide / 54→killClothier）∪ 臭鸡蛋 318 无条件
//    （:11971 `flag |= type == 318`——全游戏唯一可无条件砸 friendly NPC 的玩家弹）
//   ②explodeAt 爆炸同门（炸弹+向导巫毒娃娃=经典杀向导链）
//   ③敌对弹 hostile && friendly && !dontTakeDamageFromHostiles 恒命中（既有链复核）
// ★TownNPC 构造器 (key,x,y) 的 y 锚**脚底**（盒顶 = y−h+2）——弹/爆心必须按
//   NPC 实际盒（n.x/n.y）算重叠，按传入 y 算 = 恒不重叠假阴性
import { describe, it, expect } from 'vitest';
import { hitTownNpcs } from '../src/entities/projTargets';
import { TownNPC } from '../src/entities/TownNPC';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

function hooks(npcs: TownNPC[], killGuide = false, killClothier = false): GameHooks {
  return {
    world: new World(40, 40, 20, 'gate'),
    player: { dead: false, equipStats: { killGuide, killClothier } },
    _bannerNpcs: new Set<number>(),   // SW-S1 巫毒→旗乘区接线消费 bannerNpcActive（Game 私有字段桩）
    npcs: () => npcs,
    enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: () => {} },
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {}, cutTile: () => {},
    scene: {},
  } as unknown as GameHooks;
}

function npcAt(key: string, tx = 10, ty = 10): TownNPC {
  return new TownNPC(key, tx * TILE, ty * TILE);   // 构造签名 3 参(Inventory 已内置)
}

/** 与 NPC 实际盒重叠的弹（勿按构造传入 y 定位） */
const projOn = (n: TownNPC) => ({ x: n.x + 4, y: n.y + 4, w: 12, h: 12 });

describe('hitTownNpcs 玩家弹窄门（:11970-11972 + 318 例外）', () => {
  it('普通箭（projId 42）→ 任何城镇 NPC 免疫（含装备巫毒时打非 22/54）', () => {
    const n = npcAt('guide');
    const h0 = n.hp;
    expect(hitTownNpcs(projOn(n), hooks([n], false, false), 30, 0, 'playerProj', 42)).toBe(false);
    expect(n.hp).toBe(h0);
    const other = npcAt('merchant');
    expect(hitTownNpcs(projOn(other), hooks([other], true, true), 30, 0, 'playerProj', 42)).toBe(false);
    expect(other.hp).toBe(other.maxHp);
  });

  it('巫毒门：killGuide → 箭可伤向导 22；killClothier → 可伤裁缝 54', () => {
    const g = npcAt('guide');
    const h0 = g.hp;
    expect(hitTownNpcs(projOn(g), hooks([g], true, false), 30, 0, 'playerProj', 42)).toBe(true);
    expect(g.hp).toBeLessThan(h0);
    const c = npcAt('clothier');
    const c0 = c.hp;
    expect(hitTownNpcs(projOn(c), hooks([c], false, true), 30, 0, 'playerProj', 42)).toBe(true);
    expect(c.hp).toBeLessThan(c0);
  });

  it('臭鸡蛋 318：无条件伤任意城镇 NPC（无需巫毒）', () => {
    const m = npcAt('merchant');
    const h0 = m.hp;
    expect(hitTownNpcs(projOn(m), hooks([m], false, false), 13, 0, 'playerProj', 318)).toBe(true);
    expect(m.hp).toBeLessThan(h0);
  });

  it('敌对弹（hostile）→ 恒命中（flag2 分支既有链复核）', () => {
    const m = npcAt('merchant');
    const h0 = m.hp;
    expect(hitTownNpcs(projOn(m), hooks([m], false, false), 25, 0, 'hostile')).toBe(true);
    expect(m.hp).toBeLessThan(h0);
  });
});

describe('explodeAt 爆炸对城镇 NPC（同巫毒门）', () => {
  const tileOf = (n: TownNPC): [number, number] => [Math.floor(n.cx / TILE), Math.floor(n.cy / TILE)];

  function shell(npcs: TownNPC[], killGuide: boolean) {
    const g = Object.create(Game.prototype) as unknown as {
      world: World; entities: { enemies: unknown[]; npcs: TownNPC[]; critters: unknown[] };
      player: unknown; spawnParticles: () => void; addDamageNumber: () => void;
      playSfxFiles: () => void; net?: unknown; remotePlayerProxies?: unknown[];
    };
    g.world = new World(40, 40, 20, 'boom');
    g.entities = { enemies: [], npcs, critters: [] };   // critters 桶 2026-08-21 并入爆炸扫描
    (g as unknown as { _bannerNpcs: Set<number> })._bannerNpcs = new Set();   // SW-S1 巫毒→旗乘区接线消费 bannerNpcActive
    g.spawnParticles = () => {};
    g.addDamageNumber = () => {};   // 真方法碰未初始化 dmgNumbers → 'push' of undefined
    g.playSfxFiles = () => {};
    g.net = undefined;
    g.remotePlayerProxies = [];
    (g as unknown as { scene: unknown }).scene = {};   // dropContext 读 zone 旗标(M11 后)
    g.player = {
      cx: -9999, cy: -9999, w: 12, h: 28, dead: true, hp: 100, maxHp: 100,
      equipStats: { killGuide, killClothier: false },
      damage: () => {}, iframes: 0,
    };
    return g;
  }

  it('无巫毒：炸弹在向导脚边炸 → 向导不掉血', () => {
    const guide = npcAt('guide', 10, 10);
    const g = shell([guide], false);
    const [ex, ey] = tileOf(guide);
    (g as unknown as { explodeAt: (...a: unknown[]) => void }).explodeAt(ex, ey, 100, 0, false, 64, 0, 28);
    expect(guide.hp).toBe(guide.maxHp);
  });

  it('装备向导巫毒娃娃（killGuide）：同位置炸弹 → 向导受爆炸伤害（经典杀向导链）', () => {
    const guide = npcAt('guide', 10, 10);
    const g = shell([guide], true);
    const [ex, ey] = tileOf(guide);
    (g as unknown as { explodeAt: (...a: unknown[]) => void }).explodeAt(ex, ey, 1000, 0, false, 64, 0, 28);
    expect(guide.hp).toBeLessThan(guide.maxHp);
  });

  it('巫毒只开门对应目标：killGuide 不波及旁边商人', () => {
    const guide = npcAt('guide', 10, 10);
    const merch = npcAt('merchant', 11, 10);
    const g = shell([guide, merch], true);
    const [ex, ey] = tileOf(guide);
    (g as unknown as { explodeAt: (...a: unknown[]) => void }).explodeAt(ex, ey, 5000, 0, false, 96, 0, 28);
    expect(merch.hp).toBe(merch.maxHp);
  });
});
