import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSaveData } from '../src/save/SaveFile';
import { Boomerang } from '../src/entities/WeaponProj';
import type { GameHooks } from '../src/entities/types';

it('user-save live throw trace', () => {
  const json = readFileSync('/Users/vinlic/Downloads/map-Starter_World (25).json','utf8');
  const { world } = loadSaveData(JSON.parse(json));
  const hooks = {
    world,
    player: { x: 53632, y: 5814, w: 20, h: 42, cx: 53642, cy: 5835, dead: false,
      attackSpeedMult: 1, buffs: new Set(), critChance: () => 0 },
    enemies: () => [], playSfx() {}, playSfxFiles() {}, spawnParticles() {},
  } as unknown as GameHooks;
  // 右下瞄准:+35°(用户"右下")
  const ang = Math.atan2(8, 11.4);
  const vx = Math.cos(ang) * 14, vy = Math.sin(ang) * 14;
  const bom = new Boomerang(hooks.player.cx as number, hooks.player.cy as number,
    +vx.toFixed(3), +vy.toFixed(3), 25, 8, 33, 1);
  // 盒心回正(Game 场景 placeAtShootSpawn 承担)
  bom.x -= bom.w / 2; bom.y -= bom.h / 2;
  const sx = hooks.player.cx as number, sy = hooks.player.cy as number;
  for (let t = 0; t < 40 && !bom.dead; t++) {
    if (t % 5 === 0)
      console.log('t' + t, 'x', bom.x.toFixed(1), 'y', bom.y.toFixed(1),
        'vx', bom.vx.toFixed(2), 'vy', bom.vy.toFixed(2), 'ai0', bom.ai0);
    bom.fixedUpdate(1 / 60, hooks);
    if (bom.dead) console.log('DEAD@t' + t);
    void sx; void sy;
  }
});
