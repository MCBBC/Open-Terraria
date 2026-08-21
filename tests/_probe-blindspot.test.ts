import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { Enemy } from '../src/entities/Enemy';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { BuffType } from '../src/stats/Buffs';

describe('probe', () => {
  it('Enemy.fromVanilla 400/396', () => {
    const e400 = Enemy.fromVanilla(400, 100, 100);
    const e396 = Enemy.fromVanilla(396, 100, 100);
    console.log('400:', e400 ? { vid: e400.vanillaId, w: e400.w, h: e400.h, boss: e400.def.boss, hp: e400.hp } : null);
    console.log('396:', e396 ? { vid: e396.vanillaId, w: e396.w, h: e396.h, boss: e396.def.boss, hp: e396.hp } : null);
    expect(!!e400).toBe(true);
    expect(!!e396).toBe(true);
  });
  it('updateSwingHits on prototype stub', () => {
    const w = new World(120, 120, 30, 'probe');
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    const player = new Player(50 * TILE, 90 * TILE, new Inventory());
    player.inv.add(1, 1); // 铁镐
    const e400 = Enemy.fromVanilla(400, player.cx + 8, player.cy)!;
    const e396 = Enemy.fromVanilla(396, player.cx + 8, player.cy)!;
    const enemies: Enemy[] = [e400, e396];
    const dmgLog: Array<[number, number]> = [];
    g.swing = { t: 20, dur: 30, dmg: 10, kb: 3, item: 1, useStyle: 1 };
    g.swingHitSet = new Set<number>();
    g.swingTileCutSet = new Set<number>();
    g.entities = { critters: [], npcs: [], enemies };
    g.player = player;
    g.world = w;
    g.sfx = { playWavFile: () => true, playFiles: () => true, play: () => {} };
    g.addDamageNumber = (...a: unknown[]) => dmgLog.push(a as [number, number]);
    g.spawnParticles = () => {};
    g.spawnDrop = () => null;
    g.net = null;
    g.bannerNpcActive = () => false;
    g.remotePlayerProxies = [];
    (g as { updateSwingHits: () => void }).updateSwingHits();
    console.log('e400 hp:', e400.hp, 'e396 hp:', e396.hp, 'dmgLog:', dmgLog.length);
    expect(e396.hp).toBeLessThan(45000);
    expect(e400.hp).toBe(100);
    expect(dmgLog.length).toBe(1);
  });
  it('imbue fire -> potentAcidT', () => {
    const w = new World(120, 120, 30, 'probe2');
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    const player = new Player(50 * TILE, 90 * TILE, new Inventory());
    player.inv.add(1, 1);
    player.buffs.apply(BuffType.ImbueFire, 60);
    const e = Enemy.fromVanilla(1, player.cx + 8, player.cy)!; // 绿史莱姆
    const enemies: Enemy[] = [e];
    const dmgLog: Array<[number, number]> = [];
    g.swing = { t: 20, dur: 30, dmg: 10, kb: 3, item: 1, useStyle: 1 };
    g.swingHitSet = new Set<number>();
    g.swingTileCutSet = new Set<number>();
    g.entities = { critters: [], npcs: [], enemies };
    g.player = player;
    g.world = w;
    g.sfx = { playWavFile: () => true, playFiles: () => true, play: () => {} };
    g.addDamageNumber = (...a: unknown[]) => dmgLog.push(a as [number, number]);
    g.spawnParticles = () => {};
    g.spawnDrop = () => null;
    g.net = null;
    g.bannerNpcActive = () => false;
    g.remotePlayerProxies = [];
    (g as { updateSwingHits: () => void }).updateSwingHits();
    console.log('slime potentAcidT:', e.potentAcidT, 'onFireT:', e.onFireT, 'hp:', e.hp);
    expect(e.potentAcidT).toBeGreaterThanOrEqual(1);
  });
});
