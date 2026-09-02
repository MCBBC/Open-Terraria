// 一次性诊断:神圣区不刷怪——用用户存档原位重放刷怪器
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { loadSave } from '../src/save/SaveFile';
import { RNG } from '../src/core/rng';

describe('hallow spawn repro', () => {
  it('存档原位 4000 次尝试', () => {
    const saveText = readFileSync('/Users/vinlic/.claude/jobs/5b590baa/tmp/sbw.json', 'utf8');
    const sd = JSON.parse(saveText);
    const { world } = loadSave(saveText);
    const sp: any = new VanillaSpawner(world);
    const px = Number(sd.player.x), py = Number(sd.player.y);
    const ptx = Math.floor(px / 16), pty = Math.floor(py / 16);
    const st = world.store;
    // 落脚格画像
    const lines: string[] = [];
    for (let dx = -6; dx <= 6; dx++) {
      const tx = ptx + dx;
      let row = '';
      for (let dy = -2; dy <= 2; dy++) {
        const ty = pty + dy;
        const i = st.idx(tx, ty);
        row += (st.type[i] === 0 ? '.' : st.type[i].toString(36)) + (st.flags[i] ? '*' : ' ') + ' ';
      }
      lines.push(`x${tx}: ${row}`);
    }
    console.log('落脚格画像(列x,行=pty-2..+2;* =active):');
    console.log(lines.join('\n'));
    // 立足行每列 type/wall
    for (let dx = -6; dx <= 6; dx++) {
      const tx = ptx + dx;
      let fy = pty;
      while (fy < st.h - 1 && !st.flags[st.idx(tx, fy)]) fy++;
      console.log(`col${tx}: floorY=${fy} type=${st.type[st.idx(tx, fy)]} wallUp=${st.wall[st.idx(tx, fy - 1)]}`);
    }
    // 4000 次尝试
    const cnt = new Map<string, number>();
    let tilesChosen = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      const rng = new RNG(i * 7919 + 13);
      const e = sp.spawn(px, py, rng, 48, 27);
      const key = e ? `${e.vanillaId}` : 'null';
      cnt.set(key, (cnt.get(key) ?? 0) + 1);
      const sx = (sp as any).spawnTileX, sy = (sp as any).spawnTileY;
      const tk = `${sx},${sy}`;
      tilesChosen.set(tk, (tilesChosen.get(tk) ?? 0) + 1);
      if (e) e.dead = true;
    }
    console.log('结果分布:', [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12));
    console.log('选中落点 top:', [...tilesChosen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
    // 单次 setFlagsForChosenTile 后的 zone 旗
    const rng2 = new RNG(999);
    sp.spawn(px, py, rng2, 48, 27);
    console.log('zone 旗: ZoneHallow=', sp.ZoneHallow, 'ZoneSnow=', sp.ZoneSnow, 'ZoneJungle=', sp.ZoneJungle,
      'spawnTileType=', sp.spawnTileType, 'hardMode=', sp.hardMode, 'dayTime=', sp.dayTime);
  }, 240000);
});
