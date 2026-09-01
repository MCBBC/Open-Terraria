// 一次性诊断:楣阻折返修复后染料商重放
import { describe, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSave } from '../src/save/SaveFile';
import { TownNPC } from '../src/entities/TownNPC';

import { TownNPC as TNPC } from '../src/entities/TownNPC';
import type { TileStore } from '../src/world/TileStore';
const _wp = (TNPC.prototype as unknown as Record<string, unknown>)['walkPrediction'] as (...a:unknown[])=>unknown;
let wpLog: string[] = [];
(TNPC.prototype as unknown as Record<string, unknown>)['walkPrediction'] =
  function (this: TownNPC, ...a: unknown[]) {
    const r = (_wp as (...a:unknown[])=>unknown).apply(this, a);
    const [st0,myX,homeX,isCritter,wantDir,ax,fy,h]=a;
    if (wpLog.length<20 && !((r as {avoidFalling?:boolean}).avoidFalling)) void 0;
    wpLog.push(`dir=${wantDir} ax=${ax} fy=${fy} h=${h} home=${homeX} r=${JSON.stringify(r)} t@ax,fy=${(st0 as TileStore).type[(st0 as TileStore).idx(ax as number,fy as number)]}`);
    return r;
  };
const WLD_SAVED=join(__dirname,'..','Starter_World Master.wld');

const WLD = join(__dirname, '..', 'Starter_World Master.wld');

describe('dyer patrol', () => {
  it.skipIf(!existsSync(WLD))('重放', () => {
    const buf = new Uint8Array(readFileSync(WLD));
    const { save } = parseWldToSave(buf);
    const { world } = loadSave(JSON.stringify(save));
    const rec = (save.npcs ?? []).find((n) => n.key === 'dyer')!;
    const game = {
      world, player: { x: -99999, y: -99999, w: 0, h: 0, dead: true },
      enemies: () => [], npcs: () => [null], critters: () => [],
      spawnTownShot: () => {}, spawnParticles: () => {}, spawnBurst: () => {},
      playSfx: () => {}, playSfxFiles: () => {}, addDamageNumber: () => {},
      achievements: { notifyProgressionEvent: () => {} },
    } as never;
    const t = new TownNPC('dyer', Math.round(rec.x), Math.round(rec.y));
    t.home = { x: rec.home![0], y: rec.home![1] };
    const lines: string[] = [];
    for (let i = 0; i < 900; i++) {
      t.fixedUpdate(1 / 60, game);
      if (i % 60 === 59) {
        const r = t as unknown as Record<string, unknown>;
        lines.push(`t${i}: cx=${t.cx.toFixed(0)} vx=${(r['vx'] as number).toFixed(2)} fx=${t.facing} wm=${r['walkMode']} cT=${r['corneredT']} g=${r['onGround'] ? 1 : 0}`);
      }
    }
    console.log(lines.join('\n'));
    console.log('WP:'+wpLog.length+'\n'+wpLog.slice(-12).join('\n'));
  });
});
